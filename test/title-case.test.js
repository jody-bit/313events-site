// Title-case proposal (shadow): conservative all-caps handling, with the exceptions that matter.
"use strict";
const assert = require("assert");
const { proposeTitleCase: p } = require("../api/_lib/title-case");

const eq = (input, want, ctx) => assert.strictEqual(p(input, ctx).title, want, input);
// Converted
eq("THE MAN WHO SHOT LIBERTY VALANCE", "The Man Who Shot Liberty Valance");
eq("OCTOBER'S VERY OWN: DRAKE NIGHT (WITH BLAKITO)", "October's Very Own: Drake Night (with Blakito)");
eq("DETROIT LIONS ALL GRIT PURE OCTANE CONTROLLED FURY REDEMPTION AND RESPECT WATCH PARTY POT LUCK!!", "Detroit Lions All Grit Pure Octane Controlled Fury Redemption and Respect Watch Party Pot Luck!!");
eq("THIRST TRAP // HAPPY HOUR", "Thirst Trap // Happy Hour");
eq("HOUSE IS HOME: STACEY PULLEN | MISTER JOSHOOA | DRU ALLAN", "House Is Home: Stacey Pullen | Mister Joshooa | Dru Allan");
eq("MANÁ: VIVIR SIN AIRE TOUR", "Maná: Vivir Sin Aire Tour", { source: "Ticketmaster" });
// Acronyms, roman numerals and branded words stay upper-case
eq("BMR: HONEYMOON HALLOWEEN", "BMR: Honeymoon Halloween");
eq("☆KRAMPUS NIGHT III☆", "☆Krampus Night III☆");
eq("DFEST • FALL EDITION", "DFEST • Fall Edition");
eq("KATSEYE: THE WILDWORLD TOUR", "KATSEYE: The Wildworld Tour");
// Artist stylings with symbols keep their form
eq("CODD DUBZ X HE$H: THRASHED TOUR", "Codd Dubz X HE$H: Thrashed Tour");
// Left alone: single-word stylings, mixed case, already fine, organiser branding, non-strings
["KREWELLA", "AYYBO", "SHADOWPLAY", "NYE 2027", "TRNT", "Already Fine Title", "Mixed CASE title"].forEach((t) => assert.strictEqual(p(t).changed, false, t));
assert.strictEqual(p("UNLEASHED: PUP PARTY", { source: "HALO Detroit" }).changed, false, "HALO branding is kept");
assert.strictEqual(p(null).changed, false);
assert.strictEqual(p("").changed, false);
// Idempotent
const once = p("THE MAN WHO SHOT LIBERTY VALANCE").title;
assert.strictEqual(p(once).title, once);
console.log("PASS: title-case proposal — converts multi-word all-caps, keeps acronyms, stylings, single words and organiser branding");
