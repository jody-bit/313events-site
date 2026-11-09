// description-format.js — turns a stored event description into readable blocks for the event page. Plain static include (a
// <script src>, no build step), same pattern as event-links.js. Exposes one global: `DescriptionFormat`.
//
// Owner decision 2026-10-23: descriptions must be readable without extra interaction. Meaningful paragraph breaks, lineups,
// schedules and lists are preserved; text that arrives as one unbroken block is grouped into short paragraphs at sentence
// boundaries only; nothing is added, reworded or dropped; source HTML is reduced to text, never inserted as markup.
//
//   parse(text)  -> [{ type: "p", lines: [string, ...] }, { type: "ul", items: [string, ...] }]
//   render(el, text, safeUrl)  fills `el` with <p>/<ul> built from text nodes and checked links (no innerHTML)
(function (root) {
  "use strict";

  var ABBR = /(?:^|[\s("'])(?:mr|mrs|ms|dr|prof|sr|jr|st|mt|ft|vs|etc|inc|ltd|co|corp|no|nos|vol|ave|blvd|rd|dept|est|approx|feat|ft|dj|mc|e\.g|i\.e|a\.m|p\.m|u\.s|u\.k|d\.c)\.$/i;

  // Source HTML -> plain text. Block ends become newlines, every other tag is dropped, common entities are decoded.
  function toText(input) {
    var s = String(input == null ? "" : input).replace(/\r\n?/g, "\n");
    s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*(p|div|h[1-6]|blockquote|tr)\s*>/gi, "\n\n")
      .replace(/<\s*li(?=[\s>])[^>]*>/gi, "\n- ")
      .replace(/<\s*\/\s*li\s*>/gi, "")
      .replace(/<\s*\/\s*(ul|ol)\s*>/gi, "\n\n")
      .replace(/<(script|style)[\s\S]*?<\/\s*\1\s*>/gi, "")
      .replace(/<\/?[a-z][^>]*>/gi, "");
    s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&rsquo;/gi, "’").replace(/&lsquo;/gi, "‘")
      .replace(/&ldquo;/gi, "“").replace(/&rdquo;/gi, "”").replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—");
    // a decoded "&lt;b&gt;" must not become a tag later: strip tags that appeared through decoding too
    s = s.replace(/<\/?[a-z][^>]*>/gi, "");
    return s.replace(/[ \t ]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  var BULLET = /^\s*(?:[-*•–—▪●]|\d{1,2}[.)])\s+(\S.*)$/;

  // One unbroken run of text -> paragraphs of one to three sentences. Splits only at ". " "! " "? " followed by a capital,
  // quote, bracket or digit, and never after an abbreviation, an initial, a dotted acronym, inside (...) or "...", or in a URL.
  function groupSentences(text) {
    var urls = [];
    var prot = text.replace(/https?:\/\/[^\s]+/gi, function (m) { urls.push(m); return "\u0001" + (urls.length - 1) + "\u0001"; });
    var parts = [];
    var re = /[.!?]["'”’)]*\s+(?=["'“‘(\[A-Z0-9])/g;
    var start = 0, m;
    while ((m = re.exec(prot)) !== null) {
      var end = m.index + m[0].length;
      var head = prot.slice(start, m.index + 1);
      var tail = prot.slice(Math.max(0, m.index - 6), m.index + 1);
      var open = (head.match(/\(/g) || []).length - (head.match(/\)/g) || []).length;
      var quotes = (head.match(/"/g) || []).length % 2;
      var initial = /(?:^|[\s(])[A-Z]\.$/.test(tail) || /\b(?:[A-Za-z]\.){2,}$/.test(prot.slice(Math.max(0, m.index - 8), m.index + 1));
      if (m[0].charAt(0) === "." && (ABBR.test(prot.slice(Math.max(0, m.index - 12), m.index + 1)) || initial || open > 0 || quotes)) continue;
      if (m[0].charAt(0) !== "." && (open > 0 || quotes)) continue;
      parts.push(prot.slice(start, end).trim());
      start = end;
    }
    var last = prot.slice(start).trim();
    if (last) parts.push(last);
    var out = [], cur = [], len = 0;
    parts.forEach(function (sentence) {
      if (cur.length && (cur.length >= 3 || len + sentence.length > 380)) { out.push(cur.join(" ")); cur = []; len = 0; }
      cur.push(sentence); len += sentence.length + 1;
    });
    if (cur.length) out.push(cur.join(" "));
    return out.map(function (p) { return p.replace(/\u0001(\d+)\u0001/g, function (_, n) { return urls[+n]; }); });
  }

  function parse(input) {
    var text = toText(input);
    if (!text) return [];
    var blocks = [];
    text.split(/\n{2,}/).forEach(function (chunk) {
      var lines = chunk.split("\n").map(function (l) { return l.replace(/\s+$/, ""); }).filter(function (l) { return l.trim() !== ""; });
      if (!lines.length) return;
      var i = 0;
      while (i < lines.length) {
        if (BULLET.test(lines[i])) {
          var items = [];
          while (i < lines.length && BULLET.test(lines[i])) { items.push(lines[i].match(BULLET)[1].trim()); i++; }
          blocks.push({ type: "ul", items: items });
        } else {
          var run = [];
          while (i < lines.length && !BULLET.test(lines[i])) { run.push(lines[i].trim()); i++; }
          blocks.push({ type: "p", lines: run });
        }
      }
    });
    // Text that arrived with no breaks at all and is long: group at sentence boundaries. Anything with its own structure
    // (several lines, a list, more than one paragraph) is left exactly as the source laid it out.
    if (blocks.length === 1 && blocks[0].type === "p" && blocks[0].lines.length === 1 && blocks[0].lines[0].length > 400) {
      var grouped = groupSentences(blocks[0].lines[0]);
      if (grouped.length > 1) blocks = grouped.map(function (p) { return { type: "p", lines: [p] }; });
    }
    return blocks;
  }

  // Appends text to `parent`, turning http(s) URLs into links when safeUrl accepts them. Built from DOM nodes only.
  function appendLinked(parent, text, safeUrl) {
    var re = /https?:\/\/[^\s<>"]+/gi, last = 0, m;
    while ((m = re.exec(text)) !== null) {
      var url = m[0].replace(/[.,;:!?)\]}'"’”]+$/, "");
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var safe = safeUrl ? safeUrl(url) : url;
      if (safe) {
        var a = document.createElement("a");
        a.href = safe; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = url;
        parent.appendChild(a);
      } else parent.appendChild(document.createTextNode(url));
      last = m.index + url.length;
      re.lastIndex = last;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function render(el, input, safeUrl) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var blocks = parse(input);
    blocks.forEach(function (b) {
      if (b.type === "ul") {
        var ul = document.createElement("ul");
        b.items.forEach(function (it) { var li = document.createElement("li"); appendLinked(li, it, safeUrl); ul.appendChild(li); });
        el.appendChild(ul);
      } else {
        var p = document.createElement("p");
        b.lines.forEach(function (line, i) { if (i) p.appendChild(document.createElement("br")); appendLinked(p, line, safeUrl); });
        el.appendChild(p);
      }
    });
    return blocks.length;
  }

  var api = { parse: parse, render: render, toText: toText };
  if (typeof module !== "undefined" && module.exports) module.exports = { DescriptionFormat: api };
  else (typeof window !== "undefined" ? window : globalThis).DescriptionFormat = api;
})(this);
