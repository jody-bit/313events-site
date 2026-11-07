// test/event-page-image-repair.test.js -- CivicPlus blank-image recovery draft (dry run by default). Run: node test/event-page-image-repair.test.js
"use strict";
const assert = require("assert");
const lib = require("../scripts/event-page-image-repair");

const page = (og, body, extraHead = "") =>
  `<html><head><meta property="og:image" content="${og}"><meta name="twitter:image" content="${og}">${extraHead}</head><body><nav><img src="/Images/Logo.png"></nav>${body}<script>var x='<img src="/ImageRepository/Document?documentID=999">';</script></body></html>`;
const HOUND = "https://livonia.gov/ImageRepository/Document?documentID=11785";
const SUMMIT = "https://livonia.gov/ImageRepository/Document?documentID=11810";
const ICON = "https://livonia.gov/Images/SocialMedia/IconModuleCalendar.png";
const houndHtml = page(HOUND, `<div class="detail"><img src="${HOUND}" alt="Inspector Hound Ticket Poster"></div>`);
const summitHtml = page(SUMMIT, `<div><img src="/ImageRepository/Document?documentID=11810" alt="Summit Flyer"></div>`);
const PU = (n) => `https://livonia.gov/calendar.aspx?EID=${n}`;
const ok = { ok: true, type: "image/jpeg", bytes: 120000 };
const run = async (o) => {
  const opts = Object.assign({ imageInUseFn: async () => false }, o);
  if (opts.dryRun === false) { // writes require an explicit scope; default the helper to "all candidate ids" + livonia.gov
    if (!opts.allowedHosts) opts.allowedHosts = new Set(["livonia.gov"]);
    if (!opts.eventIds) opts.eventIds = new Set((await opts.fetchCandidates()).map((r) => r.id));
  }
  return lib.repairEventPageImages(opts);
};

(async () => {
  // --- parsing: the two accepted fixtures
  assert.deepStrictEqual(lib.classifyPage({ html: houndHtml, pageUrl: PU(4800) }), { accept: true, imageUrl: HOUND, reason: "poster_in_body_matches_og_image" });
  assert.strictEqual(lib.classifyPage({ html: summitHtml, pageUrl: PU(4817) }).imageUrl, SUMMIT); // relative body src resolved
  // script-embedded <img> text is not a body image
  assert.strictEqual(lib.classifyPage({ html: page("https://livonia.gov/ImageRepository/Document?documentID=999", ""), pageUrl: PU(1) }).reason, "no_body_image_agreement");

  // --- parsing: rejects
  const rej = (html, url, reason) => assert.strictEqual(lib.classifyPage({ html, pageUrl: url }).reason, reason);
  rej(page(ICON, `<p>text only</p>`), PU(4820), "not_image_repository_path");                     // generic icon, no poster
  rej(page(ICON, `<img src="${ICON}">`), PU(4820), "not_image_repository_path");                  // icon even if echoed in body
  rej(page("https://www.madisonheightsmi.gov/ImageRepository/Document?documentID=520", `<p>text</p>`), "https://www.madisonheightsmi.gov/calendar.aspx?EID=3704", "no_body_image_agreement");
  rej(page("https://cdn.example.com/ImageRepository/Document?documentID=1", `<img src="https://cdn.example.com/ImageRepository/Document?documentID=1">`), PU(1), "image_other_host");
  rej(page("http://livonia.gov/ImageRepository/Document?documentID=1", `<img src="http://livonia.gov/ImageRepository/Document?documentID=1">`), PU(1), "image_not_https");
  rej(page("javascript:alert(1)", ""), PU(1), "image_not_https");
  rej(page("data:image/png;base64,AAAA", ""), PU(1), "image_not_https");
  rej(page(HOUND, `<img src="/ImageRepository/Document?documentID=OTHER">`), PU(1), "no_body_image_agreement"); // og differs from body
  rej(page("https://livonia.gov/ImageRepository/Document?documentID=7&name=logo.png", `<img src="https://livonia.gov/ImageRepository/Document?documentID=7&name=logo.png">`), PU(1), "generic_image");
  rej("<html><head></head><body><img src='/x.png'></body></html>", PU(1), "no_og_image");
  rej(houndHtml, "http://livonia.gov/calendar.aspx?EID=1", "page_not_https");
  rej("", PU(1), "empty_page");

  // --- image check: type and size
  const head = (type, len, status = 200) => async () => ({ ok: status === 200, status, headers: { get: (h) => ({ "content-type": type, "content-length": len }[h.toLowerCase()] ?? null) } });
  assert.strictEqual((await lib.checkImage(HOUND, head("image/jpeg", "120000"))).ok, true);
  assert.strictEqual((await lib.checkImage(HOUND, head("text/html", "120000"))).reason, "image_type_rejected");
  assert.strictEqual((await lib.checkImage(HOUND, head("image/svg+xml", "9000"))).reason, "image_type_rejected");
  assert.strictEqual((await lib.checkImage(HOUND, head("image/png", "100"))).reason, "image_size_out_of_range");
  assert.strictEqual((await lib.checkImage(HOUND, head("image/png", String(50 * 1024 * 1024)))).reason, "image_size_out_of_range");
  assert.strictEqual((await lib.checkImage(HOUND, head("image/png", null))).reason, "image_size_unchecked");
  assert.strictEqual((await lib.checkImage(HOUND, head("image/png", "9000", 404))).reason, "image_head_status");

  // --- comment-hidden image is not body agreement
  rej(page(HOUND, `<!-- <img src="${HOUND}"> --><p>none</p>`), PU(1), "no_body_image_agreement");

  // --- pre-fetch URL validation (event_url is ingested data)
  const v = (u, hosts) => lib.validateFetchUrl(u, hosts).reason || "ok";
  assert.strictEqual(v("https://livonia.gov/calendar.aspx?EID=4800"), "ok");
  assert.strictEqual(v("http://livonia.gov/calendar.aspx?EID=4800"), "url_not_https");
  assert.strictEqual(v("https://169.254.169.254/calendar.aspx?EID=1"), "url_ip_literal");
  assert.strictEqual(v("https://[::1]/calendar.aspx?EID=1"), "url_ip_literal");
  assert.strictEqual(v("https://localhost/calendar.aspx?EID=1"), "url_non_public_host");
  assert.strictEqual(v("https://intranet/calendar.aspx?EID=1"), "url_non_public_host");
  for (const h of ["localhost.", "x.internal.", "x.local.", "livonia.gov.", "a..b.gov"]) assert.strictEqual(v(`https://${h}/calendar.aspx?EID=1`), "url_odd_hostname", h);
  for (const h of ["x.internal", "x.local", "foo.localhost"]) assert.strictEqual(v(`https://${h}/calendar.aspx?EID=1`), "url_non_public_host", h);
  for (const h of ["2130706433", "0x7f.1", "127.1"]) assert.notStrictEqual(v(`https://${h}/calendar.aspx?EID=1`), "ok", h);
  assert.strictEqual(v("https://db.internal/calendar.aspx?EID=1"), "url_non_public_host");
  assert.strictEqual(v("https://user:pw@livonia.gov/calendar.aspx?EID=1"), "url_has_credentials");
  assert.strictEqual(v("https://livonia.gov:8443/calendar.aspx?EID=1"), "url_has_port");
  assert.strictEqual(v("https://evil.example.com/x/calendar.aspx?EID=1"), "url_not_civicplus_event");
  assert.strictEqual(v("https://evil.example.com/other?next=calendar.aspx?EID=1"), "url_not_civicplus_event");
  assert.strictEqual(v("https://livonia.gov/calendar.aspx?EID=1&x=2"), "url_not_civicplus_event");
  assert.strictEqual(v("https://livonia.gov/calendar.aspx?EID=1", new Set(["romi.gov"])), "url_host_not_allowed");
  assert.strictEqual(v("https://livonia.gov/calendar.aspx?EID=1", new Set(["livonia.gov"])), "ok");
  // invalid url is never requested
  let requested = 0;
  const counting = async () => { requested++; return { ok: true, status: 200, headers: { get: () => null }, text: async () => "" }; };
  for (const bad of ["http://livonia.gov/calendar.aspx?EID=1", "https://10.0.0.5/calendar.aspx?EID=1", "https://localhost/calendar.aspx?EID=1"]) {
    assert.strictEqual((await lib.fetchPage(bad, counting)).ok, false);
  }
  assert.strictEqual(requested, 0, "invalid urls must make zero requests");

  // --- fetchPage: redirects are manual; a cross-host hop is never requested
  const seenUrls = [];
  const redirecting = (map) => async (u) => { seenUrls.push(u); const r = map[u]; return r; };
  const hdr = (loc) => ({ get: (h) => (h.toLowerCase() === "location" ? loc : null) });
  let res = await lib.fetchPage(PU(1), redirecting({ [PU(1)]: { ok: false, status: 302, headers: hdr("https://evil.example.com/x") } }));
  assert.strictEqual(res.reason, "page_redirected_other_host");
  assert.deepStrictEqual(seenUrls, [PU(1)], "cross-host target must never be requested");
  res = await lib.fetchPage(PU(1), redirecting({ [PU(1)]: { ok: false, status: 302, headers: hdr("http://livonia.gov/calendar.aspx?EID=1") } }));
  assert.strictEqual(res.reason, "page_redirected_other_host"); // https downgrade
  // same-host redirect followed, then page returned
  seenUrls.length = 0;
  res = await lib.fetchPage(PU(1), redirecting({
    [PU(1)]: { ok: false, status: 301, headers: hdr("/calendar.aspx?EID=2") },
    [PU(2)]: { ok: true, status: 200, headers: hdr(null), text: async () => "<html>ok</html>" },
  }));
  assert.strictEqual(res.ok, true); assert.strictEqual(res.finalUrl, PU(2));
  // redirect loop is bounded
  res = await lib.fetchPage(PU(1), async () => ({ ok: false, status: 302, headers: hdr(PU(1)) }));
  assert.strictEqual(res.reason, "page_too_many_redirects");
  // byte cap
  res = await lib.fetchPage(PU(1), async () => ({ ok: true, status: 200, headers: hdr(null), text: async () => "x".repeat(3 * 1024 * 1024) }));
  assert.strictEqual(res.reason, "page_too_large");
  // timeout: a fetch that never resolves is aborted (signal passed through)
  res = await lib.fetchPage(PU(1), (u, o) => new Promise((_, rej2) => { assert.ok(o.signal); o.signal.addEventListener("abort", () => rej2(new Error("aborted"))); setTimeout(() => o.signal.dispatchEvent(new Event("abort")), 5); }));
  assert.strictEqual(res.reason, "page_fetch_failed");
  // slow body is time-bounded (reader that never finishes)
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms === 10000 ? 5 : ms, ...a);
  try {
    res = await lib.fetchPage(PU(1), async () => ({ ok: true, status: 200, headers: hdr(null), text: () => new Promise(() => {}) }));
    assert.strictEqual(res.reason, "page_body_timeout");
  } finally { global.setTimeout = realSetTimeout; }
  // HEAD uses manual redirect and a signal
  let headOpts;
  await lib.checkImage(HOUND, async (u, o) => { headOpts = o; return { ok: true, headers: { get: (h) => ({ "content-type": "image/png", "content-length": "9000" }[h.toLowerCase()] ?? null) } }; });
  assert.strictEqual(headOpts.redirect, "manual"); assert.ok(headOpts.signal);

  // --- orchestration
  const logs = [];
  const logger = { log: (...a) => logs.push(a.join(" ")), warn: () => {} };
  const ev = (id, n, o = {}) => ({ id, title: "T" + id, source: "City of Livonia", event_url: PU(n), start_date: "2026-11-10", internal_note: null, updated_at: "2026-11-07T10:00:00+00:00", image_url: null, ...o });
  const pages = { [PU(4800)]: houndHtml, [PU(4817)]: summitHtml, [PU(4820)]: page(ICON, "<p>text</p>"), [PU(5000)]: houndHtml };
  const fetchPageFn = async (u) => (pages[u] ? { ok: true, html: pages[u], finalUrl: u } : { ok: false, reason: "page_http_404" });
  let patches = [];
  const applyPatchFn = async (url, headers, e, patch) => { patches.push({ id: e.id, patch }); return true; };

  // dry run (default): reports accepted, writes nothing
  patches = [];
  let c = await run({ logger, fetchCandidates: async () => [ev("a", 4800), ev("b", 4817), ev("c", 4820)], fetchPageFn, checkImageFn: async () => ok, applyPatchFn });
  assert.strictEqual(c.dryRun, true);
  assert.strictEqual(c.accepted, 2); assert.strictEqual(c.rejected, 1); assert.strictEqual(c.rejectedReasons.not_image_repository_path, 1);
  assert.strictEqual(patches.length, 0, "dry run must not write"); assert.strictEqual(c.written, 0);

  // owner lock skipped at selection (never fetched)
  let fetched = 0;
  c = await run({ logger, fetchCandidates: async () => [ev("d", 4800, { internal_note: "OWNER-CORRECTION 2026-11-07T01:00Z edit1 fields=image_url | {}" })], fetchPageFn: async (u) => { fetched++; return fetchPageFn(u); }, checkImageFn: async () => ok, applyPatchFn });
  assert.strictEqual(c.skippedOwnerLocked, 1); assert.strictEqual(fetched, 0); assert.strictEqual(c.accepted, 0);
  // owner lock on a different field does not block
  c = await run({ logger, fetchCandidates: async () => [ev("d2", 4800, { internal_note: "OWNER-CORRECTION 2026-11-07T01:00Z edit1 fields=title | {}" })], fetchPageFn, checkImageFn: async () => ok, applyPatchFn });
  assert.strictEqual(c.accepted, 1);
  // non-blank image and non-CivicPlus url never touched
  c = await run({ logger, fetchCandidates: async () => [ev("e", 4800, { image_url: "https://x/y.jpg" }), ev("f", 1, { event_url: "https://www.instagram.com/bigtimebingo/" })], fetchPageFn, checkImageFn: async () => ok, applyPatchFn });
  assert.strictEqual(c.accepted, 0); assert.strictEqual(c.skippedNotCandidateUrl, 1);

  // explicit write: patch carries image + provenance; existing note kept
  patches = [];
  c = await run({ dryRun: false, logger, now: () => "2026-11-07T18:00:00Z", fetchCandidates: async () => [ev("g", 4800, { internal_note: "prior line" })], fetchPageFn, checkImageFn: async () => ok, applyPatchFn });
  assert.strictEqual(c.written, 1);
  assert.strictEqual(patches[0].patch.image_url, HOUND);
  assert.ok(patches[0].patch.internal_note.startsWith("prior line\nIMAGE_RECOVERY 2026-11-07T18:00:00Z source=event-page page=" + PU(4800)));
  assert.deepStrictEqual(Object.keys(patches[0].patch).sort(), ["image_url", "internal_note"]); // nothing else is written

  // race guard: patch applier reports zero rows -> counted, not an error, not written
  c = await run({ dryRun: false, logger, fetchCandidates: async () => [ev("h", 4800)], fetchPageFn, checkImageFn: async () => ok, applyPatchFn: async () => false });
  assert.strictEqual(c.written, 0); assert.strictEqual(c.skippedConcurrentChange, 1);

  // shared image: different titles -> review, not written; same title (series) -> accepted
  patches = [];
  c = await run({ dryRun: false, logger, fetchCandidates: async () => [ev("i", 4800), ev("j", 5000)], fetchPageFn, checkImageFn: async () => ok, applyPatchFn });
  assert.strictEqual(c.sharedForReview, 2); assert.strictEqual(patches.length, 0);
  c = await run({ dryRun: false, logger, fetchCandidates: async () => [ev("k", 4800, { title: "Series Night" }), ev("l", 5000, { title: "Series  night!" })], fetchPageFn, checkImageFn: async () => ok, applyPatchFn });
  assert.strictEqual(c.written, 2);

  // image already stored on an event with a different title -> review, not written; lookup failure -> review (never write)
  patches = [];
  c = await run({ dryRun: false, logger, fetchCandidates: async () => [ev("n", 4800)], fetchPageFn, checkImageFn: async () => ok, applyPatchFn, imageInUseFn: async () => true });
  assert.strictEqual(c.sharedForReview, 1); assert.strictEqual(patches.length, 0);
  c = await run({ dryRun: false, logger, fetchCandidates: async () => [ev("o", 4800)], fetchPageFn, checkImageFn: async () => ok, applyPatchFn, imageInUseFn: async () => { throw new Error("db down"); } });
  assert.strictEqual(c.sharedForReview, 1); assert.strictEqual(patches.length, 0);
  assert.strictEqual(await lib.imageInUseByOtherTitles("https://s", {}, HOUND, "Series Night", async () => ({ ok: true, json: async () => [{ title: "Series night" }] })), false);
  assert.strictEqual(await lib.imageInUseByOtherTitles("https://s", {}, HOUND, "Series Night", async () => ({ ok: true, json: async () => [{ title: "Other" }] })), true);

  // image check failure rejects without writing
  patches = [];
  c = await run({ dryRun: false, logger, fetchCandidates: async () => [ev("m", 4800)], fetchPageFn, checkImageFn: async () => ({ ok: false, reason: "image_type_rejected" }), applyPatchFn });
  assert.strictEqual(patches.length, 0); assert.strictEqual(c.rejectedReasons.image_type_rejected, 1);

  // write guard shape: conditional PATCH URL re-asserts blank image AND unchanged updated_at; no other columns
  let seen;
  const applied = await lib.applyPatch("https://s.example", {}, { id: "id1", updated_at: "2026-11-07T10:00:00+00:00" }, { image_url: HOUND }, async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => [{ id: "id1" }] }; });
  assert.strictEqual(applied, true);
  assert.ok(seen.url.includes("id=eq.id1") && seen.url.includes("or=(image_url.is.null,image_url.eq.)") && seen.url.includes("updated_at=eq.2026-11-07T10%3A00%3A00%2B00%3A00"));
  assert.strictEqual(seen.opts.method, "PATCH");
  assert.strictEqual(await lib.applyPatch("https://s.example", {}, { id: "id1", updated_at: "x" }, { image_url: HOUND }, async () => ({ ok: true, json: async () => [] })), false);

  // write path refuses without allowedHosts AND eventIds scope; eventIds narrows considered rows
  await assert.rejects(() => lib.repairEventPageImages({ dryRun: false, logger, fetchCandidates: async () => [], eventIds: new Set(["a"]) }), /allowedHosts is required/);
  await assert.rejects(() => lib.repairEventPageImages({ dryRun: false, logger, fetchCandidates: async () => [], allowedHosts: new Set(["livonia.gov"]) }), /eventIds scope is required/);
  patches = [];
  c = await run({ dryRun: false, logger, allowedHosts: new Set(["livonia.gov"]), eventIds: new Set(["p"]), fetchCandidates: async () => [ev("p", 4800), ev("q", 4817)], fetchPageFn, checkImageFn: async () => ok, applyPatchFn });
  assert.strictEqual(c.considered, 1); assert.deepStrictEqual(patches.map((x) => x.id), ["p"]);
  // allowedHosts enforced at selection: other host is never fetched
  let fetchedOther = 0;
  c = await run({ logger, allowedHosts: new Set(["livonia.gov"]), fetchCandidates: async () => [ev("r", 1, { event_url: "https://www.romi.gov/calendar.aspx?EID=8152" })], fetchPageFn: async () => { fetchedOther++; return { ok: false, reason: "x" }; }, checkImageFn: async () => ok, applyPatchFn });
  assert.strictEqual(fetchedOther, 0); assert.strictEqual(c.skippedNotCandidateUrl, 1);

  console.log("PASS: event-page-image-repair -- parsing, generic/other-host/http/mismatch rejects, type+size, owner lock, race guard, shared-image review, dry-run default");
})().catch((e) => { console.error(e); process.exit(1); });
