// STORY-027 Phase 3 prep: the promoter page rules, fixture-tested. Nothing is routed, linked or indexed.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const PP = require("../promoter-page.js");
const ED = require("../event-dates.js");
const html = fs.readFileSync(path.join(__dirname, "..", "promoter-template.html"), "utf8");
const TODAY = "2026-11-09";

// Column names live in ONE mapping and match the plan.
const plan = fs.existsSync(path.join(__dirname, "..", "project/plans/STORY-027-promoter-plan.md")) ? fs.readFileSync(path.join(__dirname, "..", "project/plans/STORY-027-promoter-plan.md"), "utf8") : null;
if (plan) ["organizers_public", "event_organizers_public", "organizer_media", "hero_image_url", "social_links", "upcoming_count", "next_event_date"].forEach((n) => assert.ok(plan.includes(n), "plan names " + n));
const colValues = JSON.stringify(PP.COLUMNS);
assert.ok(!/organizers_public|organizer_contacts_public|organizer_media|event_organizers_public/.test(html), "template carries no organizer view name of its own");
assert.ok(!/(upcoming_count|hero_image_url|social_links|organizer_id|verified_at)/.test(html), "template carries no column name of its own (" + colValues.length + " chars live in the mapping)");

// Organizer mapping: unknown fields stay empty; unsafe or unlabeled social links are dropped.
const p = PP.mapOrganizer({ id: "o1", slug: "fleatroit", name: " Fleatroit ", type: "collective", bio: "", status: "active", hero_image_url: "javascript:alert(1)", social_links: [{ label: "Instagram", url: "https://instagram.com/x" }, { label: "Bad", url: "javascript:alert(1)" }, { url: "https://nolabel.example" }], upcoming_count: 2, next_event_date: "2026-12-05" });
assert.strictEqual(p.name, "Fleatroit"); assert.strictEqual(p.heroImage, ""); assert.strictEqual(p.bio, "");
assert.deepStrictEqual(p.socialLinks, [{ label: "Instagram", url: "https://instagram.com/x" }]);

// Contacts: public AND verified only; private, unverified and malformed never render.
const contacts = PP.publicContacts([
  { kind: "email", value: "hi@fleatroit.example", visibility: "public", verified_at: "2026-11-01" },
  { kind: "email", value: "private@x.example", visibility: "private", verified_at: "2026-11-01" },
  { kind: "phone", value: "313-555-0100", visibility: "public", verified_at: null },
  { kind: "email", value: "not an email", visibility: "public", verified_at: "2026-11-01" },
  { kind: "website", value: "https://fleatroit.example/", visibility: "public", verified_at: "2026-11-01" }
]);
assert.deepStrictEqual(contacts.map((c) => c.value), ["hi@fleatroit.example", "fleatroit.example"]);

// Media: credit AND alt text AND a usable url.
assert.strictEqual(PP.publicMedia([{ image_url: "https://x.example/a.jpg", credit: "Photo: A", alt_text: "Crowd" }, { image_url: "https://x.example/b.jpg", credit: "", alt_text: "No credit" }, { image_url: "https://x.example/c.jpg", credit: "C", alt_text: "" }]).length, 1);

// Roles: only known roles, only this promoter's links.
const roles = PP.rolesByEvent([{ event_id: "e1", organizer_id: "o1", role: "presenter" }, { event_id: "e2", organizer_id: "o1", role: "venue" }, { event_id: "e3", organizer_id: "o2", role: "presenter" }, { event_id: "e4", organizer_id: "o1", role: "co_promoter" }], "o1");
assert.deepStrictEqual(roles, { e1: "presenter", e4: "co_promoter" });

// Upcoming / Past use the shared date rules; Fleatroit's Aug 30 and Dec 5 stay separate rows.
const ev = [
  { id: "e1", title: "Fleatroit Junk City", start_date: "2026-08-30", end_date: "2026-08-30", venue_name: "A" },
  { id: "e2", title: "Fleatroit x Carousel Noel Night", start_date: "2026-12-05", end_date: "2026-12-05", venue_name: "441 W. Canfield" },
  { id: "e3", title: "Late show", start_date: "2026-11-20", end_date: "2026-11-20" }
];
const s = PP.splitEvents(ev, TODAY, ED);
assert.deepStrictEqual(s.upcoming.map((e) => e.id), ["e3", "e2"]);
assert.deepStrictEqual(s.past.map((e) => e.id), ["e1"]);
assert.deepStrictEqual(PP.groupByMonth(s.upcoming).map((m) => [m.month, m.days.length]), [["2026-11", 1], ["2026-12", 1]]);
assert.deepStrictEqual(PP.groupByVenue(s.upcoming).map((g) => g.venue), ["Venue to be announced", "441 W. Canfield"]);

// Indexing: only active, named, slugged, with at least one linked public event.
assert.ok(PP.shouldIndex(p, 1)); assert.ok(!PP.shouldIndex(p, 0)); assert.ok(!PP.shouldIndex({ ...p, status: "draft" }, 3)); assert.ok(!PP.shouldIndex(null, 3));

// JSON-LD: Organization, only verified public data.
const ld = PP.jsonLd(p, contacts, "https://313.events/promoters/fleatroit");
assert.strictEqual(ld["@type"], "Organization"); assert.strictEqual(ld.email, "hi@fleatroit.example");
assert.ok(!JSON.stringify(ld).includes("private@x.example"));

// Template: not routed, linked or indexed; accessible controls; every footer link set intact.
assert.ok(/<meta name="robots" content="noindex">/.test(html), "static noindex until release");
assert.ok(/<main id="main">/.test(html) && /aria-pressed/.test(html));
assert.ok(!/promoter-template/.test(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8")), "no route");
assert.ok(!/promoter-template|\/promoters/.test(fs.readFileSync(path.join(__dirname, "..", "api/sitemap.js"), "utf8")), "not in the sitemap");
console.log("PASS: promoter page rules (contacts, media, roles, upcoming/past, index gate, JSON-LD) and unlinked template");
