// test/event-description-format.test.js — readable event descriptions (description-format.js), owner decision 2026-10-23.
// Preserve source paragraphs, lineups, schedules and lists; group only unbroken long text, at sentence boundaries; invent and
// drop nothing; never let source HTML become markup.
// Run: node test/event-description-format.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { DescriptionFormat: DF } = require(`${REPO_DIR}/description-format.js`);

const flat = (blocks) => blocks.map((b) => (b.type === "ul" ? b.items.join(" ") : b.lines.join(" "))).join(" ").replace(/\s+/g, " ").trim();
const words = (s) => s.replace(/\s+/g, " ").trim();

// empty and whitespace -> nothing (the page then shows no "About" heading)
assert.deepStrictEqual(DF.parse(""), []); assert.deepStrictEqual(DF.parse("  \n \n"), []); assert.deepStrictEqual(DF.parse(null), []);

// existing paragraph breaks are kept as they are, even when long
let b = DF.parse("First paragraph.\n\nSecond paragraph.\n\nThird.");
assert.strictEqual(b.length, 3); assert.deepStrictEqual(b.map((x) => x.lines[0]), ["First paragraph.", "Second paragraph.", "Third."]);

// lineups and schedules: single newlines stay line breaks inside one paragraph, in order
b = DF.parse("Lineup:\nVeil of Ash\nMoth Cathedral\nDJ Hollow Crown\n\nDoors 9PM");
assert.deepStrictEqual(b[0].lines, ["Lineup:", "Veil of Ash", "Moth Cathedral", "DJ Hollow Crown"]);
assert.strictEqual(b.length, 2);

// bullet and numbered lists become lists, items intact
b = DF.parse("Bring:\n- ID\n- cash\n* a coat\n\n1. Doors\n2) Music");
assert.deepStrictEqual(b.map((x) => x.type), ["p", "ul", "ul"]);
assert.deepStrictEqual(b[1].items, ["ID", "cash", "a coat"]); assert.deepStrictEqual(b[2].items, ["Doors", "Music"]);

// source HTML is reduced to text: breaks kept, tags and scripts dropped, nothing left as markup, entities decoded
b = DF.parse("<p>Doors at 9 &amp; music at 10.</p><p>Bring <b>ID</b>.<script>alert(1)</script></p><ul><li>One</li><li>Two</li></ul>");
assert.strictEqual(b[0].lines[0], "Doors at 9 & music at 10.");
assert.strictEqual(b[1].lines[0], "Bring ID.");
assert.deepStrictEqual(b[2].items, ["One", "Two"]);
assert.ok(!/[<>]/.test(flat(b)), "no tag characters survive");
assert.ok(!/alert/.test(flat(b)), "script bodies are dropped");
assert.ok(!/<[a-z]/i.test(flat(DF.parse("&lt;img src=x onerror=alert(1)&gt; hello"))), "tags that appear through decoded entities are stripped too");

// one unbroken long block is grouped at sentence boundaries, with all words kept in order
const long = "SAMHAIN presents a night of dark ambient, industrial and ritual electronics at Tangent Gallery. Doors 9PM. 21+. Lineup: Veil of Ash (live), Moth Cathedral, DJ Hollow Crown, Sister Static, and special guests. Expect extended sets, projections, and a costume contest at midnight. Tickets are limited and available at https://example.com/samhain-tickets and at the door if not sold out. Wheelchair accessible entrance on the east side; ask staff for assistance. No refunds. Bring ID. " + "More details follow for guests who want them. ".repeat(4);
b = DF.parse(long);
assert.ok(b.length >= 3, `long unbroken text is grouped (${b.length} paragraphs)`);
assert.ok(b.every((x) => x.type === "p" && x.lines.length === 1 && x.lines[0].length <= 520), "paragraphs are short");
assert.strictEqual(words(flat(b)), words(long), "grouping adds and drops nothing");
assert.ok(b.some((x) => x.lines[0].includes("https://example.com/samhain-tickets")), "the URL stays whole in one paragraph");

// never split at abbreviations, initials, dotted acronyms, decimals, inside parentheses or quotes, or in URLs
const tricky = "Hosted by Dr. Smith and Mr. Jones at 9 p.m. Featuring J. R. Dobbs, A.K.A. The Fox, and the U.S. All-Stars (a night of dancing. Really!). Cost is 12.50 at www.example.com/a.b. Then \"Stay late. Dance more.\" says the host. " + "Extra words to pass the length threshold for grouping so this exercise actually runs the splitter. ".repeat(3);
b = DF.parse(tricky);
const joined = b.map((x) => x.lines[0]);
for (const frag of ["Dr. Smith", "Mr. Jones", "9 p.m.", "J. R. Dobbs", "A.K.A. The Fox", "U.S. All-Stars", "12.50", "www.example.com/a.b", "(a night of dancing. Really!)", "\"Stay late. Dance more.\""]) {
  assert.ok(joined.some((p) => p.includes(frag)), `kept together: ${frag}`);
}
assert.strictEqual(words(flat(b)), words(tricky), "nothing added or dropped");

// text that already has its own structure is never regrouped, however long
const structured = "Line one is a very long sentence. ".repeat(20) + "\nSecond line.";
b = DF.parse(structured);
assert.strictEqual(b.length, 1); assert.strictEqual(b[0].lines.length, 2);

// short single block stays one paragraph
assert.strictEqual(DF.parse("A short description. Two sentences.").length, 1);

// the page uses it: heading only with text, DOM-built links through safeUrl, readable column
const page = fs.readFileSync(`${REPO_DIR}/event-template.html`, "utf8");
assert.ok(page.includes('<script src="/description-format.js"></script>'), "event page loads description-format.js");
assert.ok(/DescriptionFormat\.render\(body, e\.description, safeUrl\)/.test(page), "event page renders through DescriptionFormat");
assert.ok(/About this event/.test(page));
assert.ok(!/d\.textContent\s*=\s*e\.description/.test(page), "no raw description assignment");
const rule = page.slice(page.indexOf(".evt-detail-desc{"), page.indexOf("}", page.indexOf(".evt-detail-desc{")));
assert.ok(/max-width:\s*40em/.test(rule) && /font-size:\s*16\.5px/.test(rule) && /line-height:\s*1\.65/.test(rule), "readable column, size and spacing");
assert.ok(!/white-space:\s*pre-line/.test(rule), "no pre-line wall");
assert.ok(!/Read more/i.test(page.slice(page.indexOf("evt-about-h"))), "no Read more collapse");

console.log("PASS: event description formatting — structure kept, long text grouped safely, HTML never becomes markup");
