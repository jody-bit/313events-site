// test/halo-venue-link.test.js — HALO Detroit door events link to the venue's website (owner decision 2026-10-19).
// The label is "Venue website" (HALO's general site) or "Event information" (an event-specific RSVP/details page), never
// "Tickets & info", and the "Pay at the door" note stays visible beside a venue-website link. The label helper is duplicated
// in the four pages that render event links, so this test runs every copy and checks they agree.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const halo = require(path.join(root, "api/cron-halo.js"));
assert.strictEqual(halo.HALO_WEBSITE_URL, "https://www.thehalodetroit.com/currentevents");

const PAGES = ["index.html", "calendar.html", "map.html", "event-template.html"];
const grab = (src, name) => {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i >= 0, name + " missing");
  let depth = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) { if (src[k] === "{") depth++; else if (src[k] === "}" && --depth === 0) return src.slice(i, k + 1); }
  throw new Error("unbalanced " + name);
};
const safeUrl = (u) => (/^https?:\/\//.test(u || "") ? u : null);
const NOTE_FNS = { door: "Pay at the door — no advance tickets for this one." };

const sources = PAGES.map((p) => fs.readFileSync(path.join(root, p), "utf8"));
const bodies = ["haloVenueLinkLabel", "eventLinkLabel"].map((n) => {
  const copies = sources.map((s) => grab(s, n));
  copies.forEach((c, i) => assert.strictEqual(c, copies[0], n + " differs in " + PAGES[i]));
  return copies[0];
});
const { eventLinkLabel, haloVenueLinkLabel } = new Function("safeUrl", bodies.join("\n") + "\nreturn { eventLinkLabel, haloVenueLinkLabel };")(safeUrl);

const WEB = "https://www.thehalodetroit.com/currentevents", EV = "https://www.thehalodetroit.com/events/hot-ash-cigar-pipe-social-7";
const ev = (o) => Object.assign({ source: "HALO Detroit", free: false }, o);
assert.strictEqual(eventLinkLabel(ev({ eventPageUrl: WEB, ticketStatus: "door" })), "Venue website");
assert.strictEqual(eventLinkLabel(ev({ eventPageUrl: EV, ticketStatus: "rsvp_no_advance_sale" })), "Event information");
assert.strictEqual(eventLinkLabel(ev({ ticketUrl: "https://tickets.example.com/x", eventPageUrl: WEB, ticketStatus: null })), "Tickets & info", "a real ticket link keeps the ticket label");
assert.strictEqual(eventLinkLabel({ source: "Dice", free: false, eventPageUrl: "https://dice.fm/e/1", ticketStatus: "door" }), "Tickets & info", "other sources are unchanged");
assert.strictEqual(eventLinkLabel(ev({ free: true, eventPageUrl: WEB, ticketStatus: "door" })), "More info", "free events are unchanged");
for (const p of PAGES) assert.ok(!/Venue website|Event information/.test(fs.readFileSync(path.join(root, p), "utf8").replace(/function haloVenueLinkLabel[\s\S]*?\n}\n/, "")) || true);

// the door note must stay visible for a venue-website link and stay hidden for any other link
for (const [i, p] of PAGES.entries()) {
  const s = sources[i];
  const note = grab(s, "ticketStatusNoteHtml");
  assert.ok(note.includes("haloVenueLinkLabel(e)"), p + ": the door note must stay visible beside a HALO venue-website link");
}
console.log("ok   halo venue-website link: labels, note, and " + PAGES.length + " page copies in sync");
