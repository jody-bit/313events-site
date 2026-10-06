// test/fixtures/fake-dom.js — just enough of a browser to RUN a page's real
// inline script under Node, so a test can drive the page's own functions
// and read back what it put on screen.
//
// This repo has no DOM test harness and no build step; its tests extract
// real code from the HTML and execute it. That works for a pure function.
// It does not work for "the page, as a whole, shows the right thing when
// someone clicks Tonight" — which is what a page adopting discovery.js has
// to prove. This file closes that gap without adding a dependency: it is
// NOT a browser and makes no attempt to lay anything out. It records.
//
//   const page = loadPage({ html, scripts, url, now, fetch, geolocation })
//   page.run("activateWhen('weekend')")     run code in the page's own scope
//   page.get("state")                        read a page variable
//   page.el("listView").innerHTML            what the page rendered
//   page.fire("search", "input", { value })  call a listener the page added
//   page.click(element)                      call an element's click handler
//   page.url()                               the last history.replaceState URL
//   await page.settle()                      let the page's fetches finish
//
// What elements do here:
//   - getElementById(id) returns one persistent element per id, whether or
//     not the page's HTML has it (the script is run without the markup);
//   - elements built with createElement/appendChild form a real tree that
//     querySelector(All) can search with simple selectors
//     (#id, .class, tag, [attr], [attr="v"], and descendant combinations);
//   - assigning innerHTML stores the string (and drops the children), so
//     template-built markup is read back as text;
//   - `seed` lists elements that exist in the page's static markup and that
//     the script looks up by selector (e.g. the .when-btn buttons).
"use strict";
const vm = require("vm");

function escapeText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeEntities(s) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code) => {
    if (code[0] === "#") return String.fromCodePoint(code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
    return Object.prototype.hasOwnProperty.call(named, code) ? named[code] : m;
  });
}

class FakeClassList {
  constructor(el) { this.el = el; }
  _list() { return this.el.className.split(/\s+/).filter(Boolean); }
  contains(c) { return this._list().includes(c); }
  add(...cs) { const l = this._list(); cs.forEach((c) => { if (!l.includes(c)) l.push(c); }); this.el.className = l.join(" "); }
  remove(...cs) { this.el.className = this._list().filter((c) => !cs.includes(c)).join(" "); }
  toggle(c, force) {
    const on = force === undefined ? !this.contains(c) : !!force;
    if (on) this.add(c); else this.remove(c);
    return on;
  }
}

class FakeElement {
  constructor(tag, doc) {
    this.tagName = String(tag || "div").toUpperCase();
    this._doc = doc;
    this.id = "";
    this.className = "";
    this.classList = new FakeClassList(this);
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.value = "";
    this._html = "";
    this._text = null;
    this.disabled = false;
    this.onclick = null;
  }
  // text / markup
  set textContent(v) { this._text = v == null ? "" : String(v); this._html = escapeText(this._text); this.children = []; }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join("");
    if (this._text !== null) return this._text;
    return this._html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  set innerHTML(v) {
    this._html = String(v); this._text = null; this.children = [];
    // A <textarea>'s content is plain text: pages use that to decode HTML
    // entities (ta.innerHTML = str; return ta.value).
    if (this.tagName === "TEXTAREA") this.value = decodeEntities(this._html);
  }
  get innerHTML() {
    if (this.children.length) return this.children.map((c) => c.outerHTML).join("");
    return this._html;
  }
  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    const attrs = [];
    if (this.id) attrs.push(`id="${this.id}"`);
    if (this.className) attrs.push(`class="${this.className}"`);
    Object.keys(this.dataset).forEach((k) => attrs.push(`data-${k}="${this.dataset[k]}"`));
    Object.keys(this.attributes).forEach((k) => attrs.push(`${k}="${this.attributes[k]}"`));
    return `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>${this.innerHTML}</${tag}>`;
  }
  // attributes
  setAttribute(k, v) { if (k === "id") this.id = String(v); else if (k === "class") this.className = String(v); else this.attributes[k] = String(v); }
  getAttribute(k) { if (k === "id") return this.id || null; if (k === "class") return this.className || null; return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  // tree
  appendChild(child) { child.parentNode = this; this.children.push(child); this._html = ""; this._text = null; return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; }
  contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; }
  _descendants(out) { this.children.forEach((c) => { out.push(c); c._descendants(out); }); return out; }
  querySelectorAll(selector) { return this._descendants([]).filter((el) => matchesSelector(el, selector, this)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (matchesSelector(n, selector, null)) return n;
    // The script runs without the page's static markup: hand back one
    // stable stand-in ancestor per (element, selector) so class toggles on
    // it can be read back by the test.
    this._closest = this._closest || {};
    return (this._closest[selector] = this._closest[selector] || new FakeElement("div", this._doc));
  }
  // events
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  click() {
    const event = { type: "click", target: this, preventDefault() {}, stopPropagation() {} };
    if (typeof this.onclick === "function") this.onclick(event);
    (this.listeners.click || []).forEach((fn) => fn(event));
  }
  focus() {}
  blur() {}
  scrollIntoView() {}
}

// One compound selector: tag? #id? .class* [attr(="v")?]*
function matchesCompound(el, compound) {
  const m = /^([a-zA-Z0-9]+)?((?:#[\w-]+|\.[\w-]+|\[[^\]]+\])*)$/.exec(compound);
  if (!m) throw new Error(`fake-dom: unsupported selector "${compound}"`);
  if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
  const parts = m[2].match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]/g) || [];
  return parts.every((p) => {
    if (p[0] === "#") return el.id === p.slice(1);
    if (p[0] === ".") return el.classList.contains(p.slice(1));
    const a = /^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/.exec(p);
    if (!a) throw new Error(`fake-dom: unsupported selector "${compound}"`);
    const name = a[1];
    let value;
    if (name.startsWith("data-")) value = el.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
    else value = el.getAttribute(name);
    if (value === undefined || value === null) return false;
    return a[2] === undefined ? true : String(value) === a[2];
  });
}
function matchesSelector(el, selector, root) {
  return selector.split(",").some((sel) => {
    const chain = sel.trim().split(/\s+/);
    if (!matchesCompound(el, chain[chain.length - 1])) return false;
    let node = el.parentNode;
    for (let i = chain.length - 2; i >= 0; i--) {
      while (node && node !== root && !matchesCompound(node, chain[i])) node = node.parentNode;
      if (!node || node === root) return false;
      node = node.parentNode;
    }
    return true;
  });
}

function makeDocument(seed) {
  const byId = new Map();
  const body = new FakeElement("body", null);
  const doc = {
    hidden: true, // nobody is watching: count-up animations jump straight to their final value
    body,
    listeners: {},
    createElement: (tag) => new FakeElement(tag, doc),
    getElementById(id) {
      // An element the script itself built and gave this id wins…
      const built = body._descendants([]).find((el) => el.id === id && !el._standIn);
      if (built) return built;
      // …otherwise one persistent stand-in per id (the script is run
      // without the page's static markup).
      if (!byId.has(id)) { const el = new FakeElement("div", doc); el.id = id; el._standIn = true; byId.set(id, el); body.appendChild(el); }
      return byId.get(id);
    },
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    querySelector: (selector) => body.querySelector(selector),
    addEventListener(type, fn) { (doc.listeners[type] = doc.listeners[type] || []).push(fn); },
    getElementsByTagName: () => [body],
  };
  (seed || []).forEach((spec) => {
    const el = new FakeElement(spec.tag || "button", doc);
    if (spec.id) { el.id = spec.id; el._standIn = true; byId.set(spec.id, el); }
    el.className = spec.className || "";
    Object.assign(el.dataset, spec.dataset || {});
    (spec.parentId ? doc.getElementById(spec.parentId) : body).appendChild(el);
  });
  return doc;
}

// Runs classic scripts in one shared global scope, as <script> tags do.
function loadPage(options) {
  const now = new Date(options.now).getTime();
  const urlObj = new URL(options.url || "/", "https://313.events");
  const doc = makeDocument(options.seed);
  let lastUrl = null;
  const sandbox = {
    console, URL, URLSearchParams, Blob, setTimeout, clearTimeout,
    document: doc,
    location: { pathname: urlObj.pathname, search: urlObj.search, href: urlObj.href, origin: urlObj.origin },
    history: { replaceState(a, b, u) { lastUrl = u; } },
    navigator: { geolocation: options.geolocation || undefined },
    fetch: options.fetch || (async () => { throw new Error("fake-dom: no network in this test"); }),
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    performance: { now: () => 0 },
    addEventListener() {},
    innerWidth: options.width || 1440,
  };
  sandbox.window = sandbox;
  // What /config.js (api/config.js) provides in a real browser.
  sandbox.__313_CONFIG = { environment: "test", supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "test-anon-key" };
  vm.createContext(sandbox);
  // A fixed clock: `new Date()` and Date.now() are the given instant.
  vm.runInContext(`
    var __RealDate = Date;
    Date = class extends __RealDate {
      constructor(...a){ if(a.length === 0) super(${now}); else super(...a); }
      static now(){ return ${now}; }
    };`, sandbox);
  (options.scripts || []).forEach((src, i) => vm.runInContext(src, sandbox, { filename: (options.names && options.names[i]) || `script-${i}.js` }));
  return {
    sandbox,
    document: doc,
    run: (code) => vm.runInContext(code, sandbox),
    get: (name) => vm.runInContext(name, sandbox),
    el: (id) => doc.getElementById(id),
    url: () => lastUrl,
    click: (el) => el.click(),
    fire(id, type, props) {
      const el = doc.getElementById(id);
      Object.assign(el, props || {});
      (el.listeners[type] || []).forEach((fn) => fn({ type, target: el, preventDefault() {} }));
    },
    // Let pending promise chains (the page's fetches) run to completion.
    async settle() { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); },
  };
}

// The largest inline <script> block of a page — its application script.
function inlineScript(html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return blocks.reduce((a, b) => (b.length > a.length ? b : a), "");
}

module.exports = { loadPage, inlineScript, FakeElement };
