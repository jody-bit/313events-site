// test/cron-metrotimes-sh4.test.js — SH.4 (Metadata Self-Healing).
//
// Metro Times' fetched event pages already carry og:street-address/
// og:locality (see cron-metrotimes.js's own header note — verified live
// before the scraper was even written) but the scraper never read them.
// SH.4 extracts them, with the strict precedence the Product Owner set:
// (1) an existing nonblank event value always wins, (2) otherwise Metro
// Times' own page metadata, (3) otherwise SH.1's existing canonical-venue
// repair, (4) otherwise left unresolved. No additional network request,
// no geocoding, no fuzzy matching, no change to category/status/
// description/dates/times/image/blocked-source behavior.
//
// Two layers, same convention as test/cron-feeds-venue-repair.test.js:
//   1. parseEventPage() directly — pure HTML-extraction unit tests
//      (exposed for testing the same way cron-dossin.js exposes
//      parseDossinEvents).
//   2. the full handler with a mocked Supabase/fetch layer — proves the
//      precedence order and every other required behavior end to end.
//
// Run: node test/cron-metrotimes-sh4.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SITEMAP_URL = "https://community.metrotimes.com/detroit/Sitemap.xml?id=Event&view=recent";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-metrotimes.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/cron-metrotimes.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// Builds a Metro Times event page shaped closely enough to trigger every
// regex parseEventPage() actually uses (h1 title, a /location/ venue link,
// a "When:" line, and og: meta tags).
function metroTimesPage({
  title = "DJ Night",
  venueName = "The Loft",
  when = "Fri., Oct. 9, 7 p.m.",
  image = "https://example.com/img.jpg",
  address, // undefined = tag omitted entirely; "" = tag present but blank; string = real value
  locality,
} = {}) {
  const metaLine = (name, val) => (val === undefined ? "" : `<meta property="${name}" content="${val}">`);
  return `
<html><head>
${metaLine("og:image", image)}
${metaLine("og:street-address", address)}
${metaLine("og:locality", locality)}
</head><body>
<h1>${title}</h1>
<a href="/detroit/location/the-loft-12345">${venueName}</a>
<p>When: ${when}</p>
</body></html>`;
}

async function run() {
  const { parseEventPage } = freshHandler();

  // ===== Layer 1: parseEventPage() direct unit tests =====

  // --- 1. address + city metadata present -> extracted correctly ---
  {
    const html = metroTimesPage({ address: "123 Main St", locality: "Detroit" });
    const e = parseEventPage(html, "https://community.metrotimes.com/detroit/event/dj-night-555");
    assert.strictEqual(e.metroTimesAddress, "123 Main St");
    assert.strictEqual(e.metroTimesCity, "Detroit");
  }
  console.log("PASS: address + city og: metadata both extracted correctly");

  // --- 2. address present / city absent ---
  {
    const html = metroTimesPage({ address: "123 Main St" });
    const e = parseEventPage(html, "https://community.metrotimes.com/detroit/event/dj-night-555");
    assert.strictEqual(e.metroTimesAddress, "123 Main St");
    assert.strictEqual(e.metroTimesCity, null);
  }
  console.log("PASS: address present, city tag absent -> address extracted, city null");

  // --- 3. city present / address absent ---
  {
    const html = metroTimesPage({ locality: "Ferndale" });
    const e = parseEventPage(html, "https://community.metrotimes.com/detroit/event/dj-night-555");
    assert.strictEqual(e.metroTimesAddress, null);
    assert.strictEqual(e.metroTimesCity, "Ferndale");
  }
  console.log("PASS: city present, address tag absent -> city extracted, address null");

  // --- 4. neither present ---
  {
    const html = metroTimesPage({});
    const e = parseEventPage(html, "https://community.metrotimes.com/detroit/event/dj-night-555");
    assert.strictEqual(e.metroTimesAddress, null);
    assert.strictEqual(e.metroTimesCity, null);
  }
  console.log("PASS: neither og:street-address nor og:locality present -> both null");

  // --- 5. malformed metadata (present but empty/whitespace) treated as absent ---
  {
    const html = metroTimesPage({ address: "", locality: "   " });
    const e = parseEventPage(html, "https://community.metrotimes.com/detroit/event/dj-night-555");
    assert.strictEqual(e.metroTimesAddress, null, "an empty content=\"\" attribute must read as absent, not as a blank real value");
    assert.strictEqual(e.metroTimesCity, null, "a whitespace-only content attribute must read as absent");
  }
  console.log("PASS: empty/whitespace-only og: metadata is treated as absent, not a malformed value");

  // --- 6. existing Metro Times parsing behavior unchanged (title/date/venue) ---
  {
    const html = metroTimesPage({ title: "Big Show", venueName: "Magic Stick", when: "Sun., Sept. 20, 7 p.m. and Sat., Nov. 28, 6 p.m." });
    const e = parseEventPage(html, "https://community.metrotimes.com/detroit/event/big-show-999");
    assert.strictEqual(e.title, "Big Show");
    assert.strictEqual(e.venue_name_raw, "Magic Stick");
    assert.strictEqual(e.external_id, "metrotimes-999");
    assert.ok(e.note && e.note.includes("only the first was captured"), "multi-date note behavior must be unchanged");
    assert.strictEqual(e.image_url, "https://example.com/img.jpg");
  }
  console.log("PASS: title/date/venue/multi-date-note/image parsing is unchanged by the SH.4 addition");

  // ===== Layer 2: full handler, mocked Supabase/fetch =====

  function baseFetchMock({ sitemapOk = true, eventPageHtml, existingEvents = [], venues = [], upsertCapture }) {
    return async (url, opts = {}) => {
      if (url === SITEMAP_URL) {
        if (!sitemapOk) {
          const err = new Error("HTTP 403");
          err.status = 403;
          throw err;
        }
        return {
          ok: true,
          status: 200,
          text: async () => `<urlset><url><loc>https://community.metrotimes.com/detroit/event/dj-night-555</loc></url></urlset>`,
        };
      }
      if (url === "https://community.metrotimes.com/detroit/event/dj-night-555") {
        return { ok: true, status: 200, text: async () => eventPageHtml };
      }
      if (url.includes("/rest/v1/venues")) {
        return { ok: true, status: 200, json: async () => venues };
      }
      if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) {
        return { ok: true, status: 200, json: async () => existingEvents };
      }
      if (url.includes("/rest/v1/events") && opts.method === "POST") {
        if (upsertCapture) upsertCapture.body = JSON.parse(opts.body);
        return { ok: true, status: 201, text: async () => "" };
      }
      throw new Error("unmocked URL: " + url + " " + (opts.method || "GET"));
    };
  }

  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 7. no existing row, no canonical venue, Metro Times supplies both
  //     -> Metro Times' values are used (tier 2) ---
  {
    const handler = freshHandler();
    const capture = {};
    global.fetch = baseFetchMock({
      eventPageHtml: metroTimesPage({ address: "123 Main St", locality: "Detroit" }),
      venues: [],
      existingEvents: [],
      upsertCapture: capture,
    });
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200);
    const row = capture.body[0];
    assert.strictEqual(row.venue_address_raw, "123 Main St");
    assert.strictEqual(row.venue_city_raw, "Detroit");
    assert.strictEqual(row.category, "music", "unrelated field (category placeholder) must be unchanged");
    assert.strictEqual(row.status, "pending_review", "unrelated field (default status) must be unchanged");
  }
  console.log("PASS: Metro Times page metadata fills address/city when nothing existing and no canonical venue conflict");

  // --- 8. existing populated values preserved even when Metro Times
  //     supplies a different value ---
  {
    const handler = freshHandler();
    const capture = {};
    global.fetch = baseFetchMock({
      eventPageHtml: metroTimesPage({ address: "999 Different Ave", locality: "Ferndale" }),
      venues: [],
      existingEvents: [{ external_id: "metrotimes-555", status: "approved", venue_address_raw: "123 Main St", venue_city_raw: "Detroit" }],
      upsertCapture: capture,
    });
    const res = makeRes();
    await handler({ headers: {} }, res);
    const row = capture.body[0];
    assert.strictEqual(row.venue_address_raw, "123 Main St", "an existing nonblank address must never be overwritten by Metro Times' page");
    assert.strictEqual(row.venue_city_raw, "Detroit", "an existing nonblank city must never be overwritten by Metro Times' page");
    assert.strictEqual(row.status, "approved", "existing status must still be preserved (pre-existing behavior, unchanged)");
  }
  console.log("PASS: an existing nonblank venue_address_raw/venue_city_raw is preserved, not overwritten by a differing Metro Times value");

  // --- 9. SH.1 fallback still works when Metro Times metadata is absent ---
  {
    const handler = freshHandler();
    const capture = {};
    global.fetch = baseFetchMock({
      eventPageHtml: metroTimesPage({ venueName: "The Loft" }), // no og:street-address/og:locality at all
      venues: [{ id: "v1", name: "The Loft", address: "77 Canonical Ave", city: "Detroit" }],
      existingEvents: [],
      upsertCapture: capture,
    });
    const res = makeRes();
    await handler({ headers: {} }, res);
    const row = capture.body[0];
    assert.strictEqual(row.venue_id, "v1");
    assert.strictEqual(row.venue_address_raw, "77 Canonical Ave", "SH.1's canonical-venue fallback should fill address when Metro Times' own page has none");
    assert.strictEqual(row.venue_city_raw, "Detroit");
  }
  console.log("PASS: SH.1's canonical-venue repair still fills address/city when Metro Times' page metadata is absent");

  // --- 10. neither Metro Times nor canonical/learned data available -> unresolved, null ---
  {
    const handler = freshHandler();
    const capture = {};
    global.fetch = baseFetchMock({
      eventPageHtml: metroTimesPage({ venueName: "Totally Unknown Venue" }),
      venues: [],
      existingEvents: [],
      upsertCapture: capture,
    });
    const res = makeRes();
    await handler({ headers: {} }, res);
    const row = capture.body[0];
    assert.strictEqual(row.venue_address_raw, null);
    assert.strictEqual(row.venue_city_raw, null);
  }
  console.log("PASS: no Metro Times metadata and no canonical/learned match leaves address/city unresolved (null), not guessed");

  // --- 11. existing blocked-source (sitemap 403) behavior unchanged ---
  {
    const handler = freshHandler();
    global.fetch = baseFetchMock({ sitemapOk: false, eventPageHtml: "" });
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200, "a blocked sitemap fetch must still report HTTP 200 with upserted:0, same as before SH.4");
    assert.strictEqual(res._body.upserted, 0);
    assert.ok(String(res._body.error || "").includes("Sitemap fetch failed"));
  }
  console.log("PASS: a blocked sitemap fetch (403) still degrades exactly as before — HTTP 200, upserted:0 — unchanged by SH.4");

  // --- 12. unrelated fields (title, dates, ticket_url, image, note) remain
  //     exactly what this connector always produced ---
  {
    const handler = freshHandler();
    const capture = {};
    global.fetch = baseFetchMock({
      eventPageHtml: metroTimesPage({ title: "Trivia Night", when: "Fri., Oct. 9, 7 p.m.", address: "5 X St", locality: "Hamtramck" }),
      venues: [],
      existingEvents: [],
      upsertCapture: capture,
    });
    const res = makeRes();
    await handler({ headers: {} }, res);
    const row = capture.body[0];
    assert.strictEqual(row.title, "Trivia Night");
    assert.strictEqual(row.ticket_url, "https://community.metrotimes.com/detroit/event/dj-night-555");
    assert.strictEqual(row.image_url, "https://example.com/img.jpg");
    assert.strictEqual(row.source, "Metro Times");
    assert.ok(row.start_date);
  }
  console.log("PASS: unrelated fields (title, ticket_url, image_url, source, start_date) are unaffected by SH.4");

  console.log("\nAll cron-metrotimes.js SH.4 tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
