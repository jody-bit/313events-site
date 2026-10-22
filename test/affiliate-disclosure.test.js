// test/affiliate-disclosure.test.js — the affiliate notice is one component, keyed on the link, with one copy.
//
// WHY (owner direction 2026-10-22): the old rule was `source === 'Ticketmaster'`, which showed the notice on 5
// production Ticketmaster rows whose link is NOT an affiliate link, kept the wording in two places (a helper and
// an inline copy on the event page) and used old copy. The approved wording is "SUPPORT THE ORBIT." / "Ticket
// links may earn us a commission." and it shows only where a link the page displays is a compensated link.
//
// Executes the real legal-snippets.js in a sandbox with the pages' own helper shapes.
// Run: node test/affiliate-disclosure.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// The pages' own safeUrl()/escapeHtml(): http(s) only; HTML-escape.
const SANDBOX_HELPERS = `
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function safeUrl(u){ try { var p = new URL(u); return (p.protocol === "https:" || p.protocol === "http:") ? u : ""; } catch (e) { return ""; } }
`;
function load(extraSource = "") {
  const sb = { URL, console };
  vm.createContext(sb);
  vm.runInContext(SANDBOX_HELPERS + read("legal-snippets.js") + extraSource + "\nthis.__api = { affiliateDisclosureHtml, isAffiliateLink, AFFILIATE_DISCLOSURE, AFFILIATE_RELATIONSHIPS };", sb);
  return sb.__api;
}
const api = load();
const WRAPPED = "https://ticketmaster.evyy.net/c/7676879/264167/4272?u=https%3A%2F%2Fwww.ticketmaster.com%2Fevent%2FABC";
const PLAIN_TM = "https://www.ticketmaster.com/event/ABC";

// 1. the approved copy, exactly
{
  assert.strictEqual(api.AFFILIATE_DISCLOSURE.heading, "SUPPORT THE ORBIT.");
  assert.strictEqual(api.AFFILIATE_DISCLOSURE.body, "Ticket links may earn us a commission.");
  const html = api.affiliateDisclosureHtml({ source: "Ticketmaster", ticketUrl: WRAPPED });
  assert.ok(html.includes("SUPPORT THE ORBIT.") && html.includes("Ticket links may earn us a commission."));
  assert.strictEqual((html.match(/class="aff-disclosure"/g) || []).length, 1, "one notice per view");
  assert.ok(/role="note"/.test(html));
  console.log("PASS: the notice carries the approved wording exactly, once");
}

// 2. eligibility is the link, not the source
{
  const none = (e, why) => assert.strictEqual(api.affiliateDisclosureHtml(e), "", why);
  none({ source: "Ticketmaster", ticketUrl: PLAIN_TM }, "a Ticketmaster row whose link is not wrapped (5 in production on Oct 22) shows nothing");
  none({ source: "Ticketmaster" }, "a Ticketmaster row with no link shows nothing");
  none({ source: "Ticketmaster", ticketUrl: "" }, "an empty link shows nothing");
  none({ source: "Planet Ant", ticketUrl: "https://www.crowdwork.com/x" }, "an ordinary ticket link shows nothing");
  none({ source: "Ticketmaster", ticketUrl: "javascript:alert(1)//ticketmaster.evyy.net" }, "an unsafe URL is not a link");
  none(null, "no event");
  none({ source: "Ticketmaster", ticketUrl: "https://ticketmaster.evyy.net.evil.example/x" }, "a look-alike host (evyy.net as a prefix) shows nothing");
  none({ source: "Ticketmaster", ticketUrl: "https://notticketmaster.evyy.net/x" }, "a host that merely ends in the text but is not a subdomain shows nothing");
  none({ source: "Ticketmaster", ticketUrl: "https://example.com/?u=https://ticketmaster.evyy.net/c/1" }, "the host name inside a query string does not count");
  assert.notStrictEqual(api.affiliateDisclosureHtml({ source: "Ticketmaster", ticketUrl: WRAPPED }), "");
  assert.notStrictEqual(api.affiliateDisclosureHtml({ source: "Some Other Source", ticketUrl: WRAPPED }), "", "a non-Ticketmaster row with a wrapped link shows the notice");
  assert.notStrictEqual(api.affiliateDisclosureHtml({ source: "X", ticketUrl: "https://TICKETMASTER.EVYY.NET/c/1" }), "", "host match ignores case");
  assert.notStrictEqual(api.affiliateDisclosureHtml({ source: "X", ticketUrl: "https://a.ticketmaster.evyy.net/c/1" }), "", "a subdomain of a registered host counts");
  assert.notStrictEqual(api.affiliateDisclosureHtml({ source: "X", ticketUrl: PLAIN_TM, eventPageUrl: WRAPPED }), "", "the event-page link counts when the page shows it");
  const both = api.affiliateDisclosureHtml({ source: "Ticketmaster", ticketUrl: WRAPPED, eventPageUrl: WRAPPED });
  assert.strictEqual((both.match(/aff-disclosure"/g) || []).length, 1, "two affiliate links on one view still give one notice");
  console.log("PASS: the notice follows the displayed link's host: unwrapped Ticketmaster, ordinary, look-alike and unsafe links show nothing; any wrapped link shows it once");
}

// 3. the registry is extensible with no page change
{
  assert.ok(Object.isFrozen(api.AFFILIATE_RELATIONSHIPS));
  assert.deepStrictEqual(Array.from(api.AFFILIATE_RELATIONSHIPS).map((r) => r.id), ["ticketmaster-impact"], "Ticketmaster through Impact is the only confirmed relationship");
  assert.strictEqual(api.isAffiliateLink("https://partner.example.net/c/1"), false);
  // Add a relationship by editing only the registry source: the same component now covers it.
  const edited = read("legal-snippets.js").replace('hosts: Object.freeze(["ticketmaster.evyy.net"]) })', 'hosts: Object.freeze(["ticketmaster.evyy.net"]) }),\n  Object.freeze({ id: "test-partner", program: "Test", hosts: Object.freeze(["partner.example.net"]) })');
  assert.notStrictEqual(edited, read("legal-snippets.js"), "the registry edit applied");
  const sb = { URL, console }; vm.createContext(sb);
  vm.runInContext(SANDBOX_HELPERS + edited + "\nthis.__f = affiliateDisclosureHtml;", sb);
  assert.notStrictEqual(sb.__f({ ticketUrl: "https://partner.example.net/c/1" }), "", "a newly registered host is disclosed with no other change");
  console.log("PASS: a relationship added to the registry is covered by the same component; only Ticketmaster via Impact is registered today");
}

// 4. one definition of the words; every surface uses the one helper; no inline rule remains
{
  const pages = ["index.html", "calendar.html", "map.html", "event-template.html"];
  const calls = { "index.html": 1, "calendar.html": 2, "map.html": 1, "event-template.html": 1 };
  for (const p of pages) {
    const html = read(p);
    assert.ok(/<script src="\/legal-snippets\.js"><\/script>/.test(html), `${p} loads legal-snippets.js`);
    assert.strictEqual((html.match(/affiliateDisclosureHtml\(e\)/g) || []).length, calls[p], `${p} calls the shared component ${calls[p]} time(s)`);
    assert.ok(!/TICKET_AFFILIATE_NOTE_TEXT/.test(html), `${p} no longer uses the old wording constant`);
    assert.ok(!/may earn a commission/i.test(html), `${p} carries none of the old wording`);
    assert.ok(!/SUPPORT THE ORBIT/.test(html) && !/earn us a commission/.test(html), `${p} holds no copy of its own`);
    assert.ok(!/source\s*===\s*'Ticketmaster'[^;\n]*ticketUrl/.test(html), `${p} has no inline Ticketmaster-source rule`);
    assert.ok(!/aff-disclosure/.test(html.replace(/affiliateDisclosureHtml/g, "")), `${p} defines no notice markup or style of its own`);
  }
  assert.ok(!/TICKET_AFFILIATE_NOTE_TEXT|may earn a commission if you purchase/.test(read("legal-snippets.js")), "the old wording is gone from legal-snippets.js");
  // Only legal-snippets.js holds the words (legal-page prose is a separate, owner-approved text and is out of scope here).
  for (const f of fs.readdirSync(root).filter((n) => /\.(html|js)$/.test(n) && n !== "legal-snippets.js")) {
    assert.ok(!/SUPPORT THE ORBIT/.test(read(f)), `${f} does not duplicate the approved heading`);
  }
  console.log("PASS: the wording lives only in legal-snippets.js; index, calendar (both views), map and event detail call the one helper; the old wording and inline rule are gone");
}

// 5. readable contrast for the notice colours (heading --ink, body --ink-soft) on the page and card backgrounds
{
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const css = read("legal-snippets.js");
  assert.ok(css.includes("color:var(--ink-soft,#A9AAA3)") && css.includes("color:var(--ink,#F2F0E8)"), "the notice uses the site's ink tokens");
  for (const bg of ["#0A0A0A", "#202020"]) {
    assert.ok(ratio("#A9AAA3", bg) >= 4.5, `body text on ${bg}`);
    assert.ok(ratio("#F2F0E8", bg) >= 4.5, `heading on ${bg}`);
  }
  assert.ok(/overflow-wrap:anywhere/.test(css), "the notice wraps on a narrow screen");
  console.log(`PASS: notice text clears AA (body ${ratio("#A9AAA3", "#202020").toFixed(1)}:1 on #202020) and wraps on narrow screens`);
}

console.log("\nAll affiliate-disclosure checks passed.");
