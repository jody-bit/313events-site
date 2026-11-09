// test/connector-free-explicit-admission.test.js
//
// Detroit Month of Design and PLAYGROUND DETROIT used to set is_free from the word "free" anywhere in a description, so
// "free parking" or "free with admission" showed a FREE badge. Now FREE needs explicit free admission/entry wording (or,
// for Month of Design, the page's own schema.org isAccessibleForFree:true). Otherwise is_free is omitted ("not stated"):
// a stored value stands and a new row gets the column default.
//
// Run: node test/connector-free-explicit-admission.test.js
"use strict";
const assert = require("assert");
const { world, page, json, notFound, runConnector, sentRow, byId } = require("./fixtures/connector-harness.js");

// P1's named defects: each of these must NOT read as free admission; the positives must.
const NOT_FREE = [
  "Free admission for members and children under 12", "Free admission before 5 pm; $15 after", "Free tour with museum admission",
  "Free workshop for ticket holders", "Free opening reception, $20 tickets for the concert", "Not free to attend",
  "Free admission on the first Friday of each month", "Gallery talk. Free parking behind the building.", "Free with museum admission.",
  "This event is not free of charge", "Admission isn't free", "Free admission is not available", "Free admission is no longer offered", "Free admission isn't available",
  "Free admission will not be offered", "Free admission won't be offered this year", "Free admission does not apply", "Free admission doesn't apply to this show", "Free admission cannot be offered", "Free admission can't be offered",
  "Join us for the fall show opening. Free admission will not be offered this year.", "Free admission with RSVP", "Free admission for members only",
];
const FREE = ["Free admission for everyone.", "Free admission, all welcome.", "Admission is free.", "Free and open to the public.", "Free of charge. Doors at 6.", "A free exhibition. Free entry.",
  "Join us Friday for live music and local food. Free admission, all ages welcome.", "Free admission — donations welcome.", "Free admission and open to everyone, not just locals."];
(async () => {
  {
    const base = "https://www.detroitmonthofdesign.org/event-details/";
    const ld = (fields) => `<html><head><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Event", startDate: "2026-10-12T11:00:00-04:00", location: { "@type": "Place", name: "Fixture Gallery", address: "123 Main St, Detroit, MI 48226" }, ...fields })}</script></head><body></body></html>`;
    const pages = {
      "explicit-2026-10-12-11-00": ld({ name: "Explicit", description: "Free admission for everyone." }),
      "parking-2026-10-12-11-00": ld({ name: "Parking", description: "Gallery talk. Free parking behind the building." }),
      "withadm-2026-10-12-11-00": ld({ name: "WithAdm", description: "Free with admission to the museum." }),
      "schema-2026-10-12-11-00": ld({ name: "Schema", description: "A talk.", isAccessibleForFree: true }),
      "nodesc-2026-10-12-11-00": ld({ name: "NoDesc" }),
      ...Object.fromEntries(NOT_FREE.map((d, i) => [`nf${i}-2026-10-12-11-00`, ld({ name: `NF${i}`, description: d })])),
      ...Object.fromEntries(FREE.map((d, i) => [`fr${i}-2026-10-12-11-00`, ld({ name: `FR${i}`, description: d })])),
    };
    const sitemap = `<?xml version="1.0"?><urlset>${Object.keys(pages).map((s) => `<url><loc>${base}${s}</loc></url>`).join("")}</urlset>`;
    const { tables, db } = world({
      events: [{ id: "row-1", external_id: "dmod-parking-2026-10-12-11-00", title: "Parking", category: "visual", start_date: "2026-10-12", status: "approved", is_free: true }],
      upstream: (url) => {
        if (url === "https://www.detroitmonthofdesign.org/event-pages-sitemap.xml") return page(sitemap);
        if (url.startsWith(base)) return pages[url.slice(base.length)] ? page(pages[url.slice(base.length)]) : notFound();
        return null;
      },
    });
    const res = await runConnector("cron-detroitmonthofdesign.js");
    assert.strictEqual(res._status, 200);
    const sent = (slug) => sentRow(db, `dmod-${slug}-2026-10-12-11-00`);
    assert.strictEqual(sent("explicit").is_free, true);
    assert.strictEqual(sent("schema").is_free, true, "isAccessibleForFree:true is the source stating free");
    for (const s of ["parking", "withadm", "nodesc"]) assert.ok(!("is_free" in sent(s)), `${s}: no explicit free admission, so is_free is not sent`);
    assert.strictEqual(byId(tables, "dmod-parking-2026-10-12-11-00").is_free, true, "a stored value is not overwritten by an unstated run");
    NOT_FREE.forEach((d, i) => assert.ok(!("is_free" in sent(`nf${i}`)), `DMD must not read as FREE: ${d}`));
    FREE.forEach((d, i) => assert.strictEqual(sent(`fr${i}`).is_free, true, `DMD should read as FREE: ${d}`));
  }
  console.log("PASS: Detroit Month of Design — FREE needs explicit free admission or isAccessibleForFree; free parking / free with admission do not count");

  {
    const gcal = (dates) => `<html><body><a href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;dates=${dates}">Add to calendar</a></body></html>`;
    const ev = (id, slug, excerpt) => ({ id, link: `https://playgrounddetroit.com/events/${slug}/`, title: { rendered: slug }, excerpt: { rendered: excerpt }, mec_category: [] });
    const list = [ev(601, "explicit", "<p>Free admission, all welcome.</p>"), ev(602, "parking", "<p>Free parking nearby.</p>"), ev(603, "withadm", "<p>Free with museum admission.</p>"), ev(604, "none", ""),
      ...NOT_FREE.map((d, i) => ev(700 + i, `nf${i}`, `<p>${d}</p>`)), ...FREE.map((d, i) => ev(800 + i, `fr${i}`, `<p>${d}</p>`))];
    const details = Object.fromEntries(list.map((e) => [e.link, gcal("20261020T180000/20261020T200000")]));
    const { db } = world({
      venues: [{ id: "venue-pg", name: "PLAYGROUND DETROIT" }],
      upstream: (url) => {
        if (url.startsWith("https://playgrounddetroit.com/wp-json/wp/v2/mec-events")) return json(list, { "x-wp-totalpages": "1" });
        if (url.startsWith("https://playgrounddetroit.com/wp-json/wp/v2/mec_category")) return json([]);
        return details[url] ? page(details[url]) : notFound();
      },
    });
    const res = await runConnector("cron-playgrounddetroit.js", { fastTimers: true });
    assert.strictEqual(res._status, 200);
    assert.strictEqual(sentRow(db, "playgrounddetroit-601").is_free, true);
    for (const id of [602, 603, 604]) assert.ok(!("is_free" in sentRow(db, `playgrounddetroit-${id}`)), `${id}: not stated free, so is_free is not sent`);
    NOT_FREE.forEach((d, i) => assert.ok(!("is_free" in sentRow(db, `playgrounddetroit-${700 + i}`)), `PLAYGROUND must not read as FREE: ${d}`));
    FREE.forEach((d, i) => assert.strictEqual(sentRow(db, `playgrounddetroit-${800 + i}`).is_free, true, `PLAYGROUND should read as FREE: ${d}`));
  }
  console.log("PASS: PLAYGROUND DETROIT — FREE needs explicit free admission; free parking / free with admission / no excerpt do not count");
})().catch((e) => { console.error(e); process.exit(1); });
