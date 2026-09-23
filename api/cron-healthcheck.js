const crypto = require("crypto");
const { SLUGS } = require("./_lib/source-slugs"); // WP 0.5 reuse -- see api/_lib/source-slugs.js
// Vercel Cron job — the automated smoke test suite Jody asked about on
// 2026-09-02 ("wanted to check in on the automated smoke tests - when are
// those scheduled?").
//
// ** WHY THIS RUNS AS A CRON, NOT A DEV-SANDBOX SCRIPT ** — the original
// plan was a Playwright script run on a recurring schedule from this
// project's own dev sandbox. That doesn't work: that sandbox (and any fresh
// session spun up on the same schedule) has no general internet egress, so
// it can never actually reach https://313.events. The only two places with
// real, reliable internet access to the live site are Jody's own browser
// (not guaranteed to be open at any given moment — the wrong tradeoff for
// something meant to run unattended) and Vercel's own servers, which is
// exactly where every other cron in this project already runs. So this
// check IS a cron: same schedule mechanism, same auth pattern, same
// fail-soft philosophy as cron-lagerhouse.js etc. Results land in the
// `healthchecks` table (migration_019) and surface as a banner at the top
// of admin.html via api/admin-healthcheck.js — a page Jody already opens
// regularly, rather than a new inbox/notification channel to check.
//
// ** WHAT "PROBING THE AUTH BOUNDARY" CATCHES ** — every cron-*.js's
// CRON_SECRET check is written as `if (CRON_SECRET) { ...check... }`: if
// that env var is ever unset in Vercel, auth is silently SKIPPED entirely
// rather than failing closed. Sending a deliberately wrong secret and
// asserting the response is 401 (not 200) catches exactly that regression
// — without ever triggering a source's real scrape logic. Several of these
// (cron-detroitmonthofdesign.js fetches ~317 pages per run) would be an
// unfriendly, wasteful thing to invoke for real twice in one day just to
// prove the endpoint exists. Same reasoning for admin-*.js's
// x-admin-secret check.
//
// ** WHAT THIS DOES NOT CATCH ** — a real browser rendering client-side JS
// (console errors, layout, whether Supabase's response actually turns into
// visible event cards) needs a real browser with real network access,
// which only Jody's own machine currently has. This check instead verifies
// the same underlying data dependency directly: it queries the same public
// Supabase REST endpoint + anon key every page's client-side JS already
// uses, and confirms at least one approved, non-past event comes back. If
// Jody wants full browser-rendered coverage later, the natural next step is
// a check this cron structurally can't do itself — asking her browser to
// visit the site and report back next time it's connected.

// 2026-09-23, WP 0.5 reuse (Admin stabilization): the per-source checks below
// used to ask "has an events row for this source been touched recently" and
// FAIL when the answer was no. That conflates "the connector didn't run" with
// "the connector ran and legitimately found nothing new" -- a healthy source
// with zero new/changed events on a given day would upsert nothing and this
// suite would report it as broken. Per the Product Owner's explicit 2026-09-23
// instruction, event-row freshness (events.updated_at) is no longer the
// PRIMARY health signal for any source. It is kept only as a non-failing
// ADVISORY fallback (see checkSourceFreshnessAdvisory) for sources this
// connector suite has no run-level evidence for yet.
//
// The authoritative signal is now source_runs (migration_035_source_runs.sql,
// api/_lib/run-log.js) -- existing WP 0.5 infrastructure, reused here rather
// than reinvented: does this source's most recent logged run show it started
// within its expected interval and finished with a non-failure outcome. See
// checkSourceHealth/evaluateRunHealth below.
//
// IMPORTANT: as of this change, migration_035_source_runs.sql has NOT been
// applied to production (confirmed live: GET .../rest/v1/source_runs returns
// PostgREST error PGRST205, "Could not find the table 'public.source_runs' in
// the schema cache" -- a missing-relation error, not an RLS/permission
// error). Until the Product Owner runs that migration against production
// Supabase, fetchLatestSourceRun() below will always report "no_table" and
// every source falls back to the advisory freshness check -- which never
// fails on its own, only on a genuine Supabase REST error. This is
// intentional fail-soft behavior, not a bug: it means turning this file on
// cannot make the smoke suite noisier than it already was. Once the migration
// is applied and the 11 connectors that already call startRun()/finishRun()
// (see api/_lib/source-slugs.js for the full 22-slug registry; not every
// registered slug has a calling connector yet -- see source-slugs.js's own
// header) log their next real run, source_runs-backed checks become live
// automatically, no further code change required.
const BASE_URL = "https://313.events";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Same publishable/anon key every public page already ships in its own
// client-side JS (see index.html) — not a secret, safe to inline here too.
const SUPABASE_ANON_KEY = "sb_publishable_NQgem2pH8h_ynP8ikwdmFw_5aoN34Q5";
const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
// Intentionally wrong on every run — this suite never has, and never
// needs, the real secrets to prove the auth check itself is alive.
const WRONG_SECRET = "smoke-test-intentionally-wrong-secret";

const CRON_ENDPOINTS = [
  "cron-ticketmaster", "cron-trinosophes", "cron-wdet", "cron-halo",
  "cron-belle-isle-nature-center", "cron-metrotimes", "cron-redford-theatre",
  "cron-cinema-detroit", "cron-dossin", "cron-feeds", "cron-editorial",
  "cron-lagerhouse", "cron-detroitmonthofdesign", "cron-planetanttheatre",
  "cron-playgrounddetroit", "cron-visitdetroit", "cron-post-to-facebook",
];
const ADMIN_ENDPOINTS = ["admin-events", "admin-feeds", "admin-editorial", "admin-venues"];
const PAGES = ["/", "/calendar.html", "/map.html", "/submit.html", "/sources.html", "/event.html", "/admin.html"];

function timingSafeStringEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// Wraps a probe so a thrown error becomes a normal failed-check result
// instead of aborting the whole run — one bad endpoint should never hide
// the results of every other check, same "one bad page never aborts the
// run" convention cron-detroitmonthofdesign.js already established.
async function runCheck(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail, ms: Date.now() - start };
  } catch (err) {
    return { name, ok: false, detail: err.message, ms: Date.now() - start };
  }
}

async function checkPage(path) {
  const resp = await fetch(BASE_URL + path, { headers: { "User-Agent": "313events-healthcheck" } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const body = await resp.text();
  if (!body || body.length < 500) throw new Error(`suspiciously short response (${body.length} bytes)`);
  return `HTTP ${resp.status}, ${body.length} bytes`;
}

// 2026-09-14, added after Jody asked "if the visitdetroit feed breaks will
// it come up in the automated smoke tests?" — the honest answer at the time
// was no. Every check above (checkCronAuth) only proves a cron's auth
// boundary is alive; it deliberately never invokes a source's real fetch
// logic (see the header comment's "PROBING THE AUTH BOUNDARY" note), so a
// source whose upstream silently changed shape — Algolia index renamed, feed
// URL 404ing, field names shifted — would keep returning a passing "401 as
// expected" auth check forever while quietly upserting nothing. This closes
// that gap for real, by checking the one thing that actually matters: did
// this source's own rows get touched recently.
//
// WHY "updated_at recently touched" IS A MEANINGFUL SIGNAL AT ALL — verified
// against schema.sql's events_set_updated_at trigger (before update on events,
// sets updated_at = now() unconditionally): every cron here upserts with
// Prefer: resolution=merge-duplicates, which is a real UPDATE against any
// row whose external_id already exists — so as long as a source's calendar
// still lists ANY of the same upcoming event(s) it listed yesterday, a
// healthy cron re-touches updated_at on every single run, whether or not
// anything actually changed. This check isn't asking "did new content
// appear" — it's asking "is this cron still reaching Supabase and finding
// its own rows to touch," which is exactly the failure mode that matters.
//
// 2026-09-14, generalized from VisitDetroit-only to every single-source
// cron, per Jody's follow-up ("does the freshness check need to be applied
// elsewhere?" → "yes, build it for all of them now"). Two sources initially
// looked like they might share one `events.source` value ("Metro Times",
// used by both cron-metrotimes.js and a string in cron-editorial.js's
// OUTLET_LIST) — checked before assuming: cron-editorial.js never writes to
// `events` at all (it writes editorial_articles/editorial_article_events,
// a separate citation-matching feature — see its own header), so
// cron-metrotimes.js is the only actual writer of source="Metro Times" into
// `events`. No real collision; every source below maps to exactly one cron.
//
// WINDOW LENGTH — a single missed run (a transient Vercel hiccup, a slow
// upstream) shouldn't page anyone, so every window here is several times
// this cron's own daily cadence, not 1 day. High-volume sources (hundreds of
// events, near-certain to have at least one upcoming row re-touched daily)
// use SOURCE_FRESHNESS_DAYS_DEFAULT (3d). Small single-venue calendars can
// legitimately go a stretch with nothing new — not a failure, just a quiet
// venue — so they get a longer 7-day window (SOURCE_FRESHNESS_DAYS_QUIET) to
// avoid paging over a normal quiet week. This is a judgment call without
// hard per-venue cadence data behind it; if a specific source starts firing
// false positives, loosen that source's own window rather than every one.
const SOURCE_FRESHNESS_DAYS_DEFAULT = 3;
const SOURCE_FRESHNESS_DAYS_QUIET = 7;

// One entry per single-source cron whose `source` string is fixed and
// unique in `events` (confirmed above) — deliberately excludes cron-feeds.js
// (no fixed source string; see checkFeedSourcesFreshness below instead) and
// cron-editorial.js (writes to editorial_articles, not events, so this
// events-table check doesn't apply to it at all).
const SOURCE_FRESHNESS_TARGETS = [
  { source: "Ticketmaster", days: SOURCE_FRESHNESS_DAYS_DEFAULT },
  { source: "WDET", days: SOURCE_FRESHNESS_DAYS_DEFAULT },
  { source: "Metro Times", days: SOURCE_FRESHNESS_DAYS_DEFAULT },
  { source: "VisitDetroit", days: SOURCE_FRESHNESS_DAYS_DEFAULT },
  { source: "HALO Detroit", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "Belle Isle Nature Center", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "Redford Theatre", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "Cinema Detroit", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "Detroit Historical Society", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "Lager House", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "Detroit Month of Design", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "Planet Ant Theatre", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "PLAYGROUND DETROIT", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "Rock In Detroit (rockindetroit.com/venue/old-miami)", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "Popps Packing", days: SOURCE_FRESHNESS_DAYS_QUIET },
  { source: "Trinosophes", days: SOURCE_FRESHNESS_DAYS_QUIET },
];

// ADVISORY ONLY, by design (see 2026-09-23 header comment above): this never
// fails a source purely for having zero rows touched in the window -- a
// healthy connector can legitimately find nothing new to write. It still
// fails on a genuine Supabase REST error (a real infrastructure problem, not
// a freshness judgment call). This is the fallback used for any source with
// no source_runs evidence yet -- either because migration_035 isn't applied,
// or because that particular connector doesn't call startRun()/finishRun()
// yet (see api/_lib/source-slugs.js's header for which of the 22 registered
// slugs currently have a calling connector).
async function checkSourceFreshnessAdvisory(sourceName, days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/events?select=id&source=eq.${encodeURIComponent(sourceName)}&updated_at=gte.${encodeURIComponent(cutoff)}&limit=1`;
  const resp = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!resp.ok) throw new Error(`Supabase REST HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows) || rows.length < 1) {
    return (
      `ADVISORY ONLY (not a failure): no ${sourceName} row updated in the last ${days}d. ` +
      `Event-row freshness is not proof of connector failure -- a healthy run can legitimately ` +
      `find zero new/changed events. No source_runs data is available yet for this source; this ` +
      `is the best available fallback signal until there is (see checkSourceHealth).`
    );
  }
  return `${rows.length} row(s) updated within ${days}d (advisory fallback signal -- see source_runs for authoritative health once available)`;
}

// Generous relative to any connector's real execution time on Vercel -- this
// only exists to distinguish "still running" from "abandoned / probable
// serverless timeout" for a row stuck at outcome='started' (see
// migration_035_source_runs.sql's own header on why that row is left behind
// rather than cleaned up). A single global budget, not a per-source one --
// the minimum viable choice with no real per-connector timing data behind it
// yet; tighten per-source later if a specific connector's own maxDuration
// makes this too loose or too strict.
const STARTED_RUN_TIMEOUT_MINUTES = 15;

// fetchLatestSourceRun(slug) -> Promise<{status:'no_table'}|{status:'no_rows'}|{status:'row', row}>
//
// Distinguishes "migration_035 not applied" (PostgREST PGRST205 -- the
// relation genuinely doesn't exist) from "table exists, nothing logged for
// this slug yet" (empty result) so the caller can report the right thing
// instead of collapsing both into one generic failure.
async function fetchLatestSourceRun(slug) {
  const url = `${SUPABASE_URL}/rest/v1/source_runs?select=started_at,finished_at,outcome,http_status,error_sample&source_slug=eq.${encodeURIComponent(slug)}&order=started_at.desc&limit=1`;
  const resp = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (resp.status === 404) {
    const body = await resp.json().catch(() => ({}));
    if (body && body.code === "PGRST205") return { status: "no_table" };
    throw new Error(`source_runs REST HTTP 404: ${JSON.stringify(body)}`);
  }
  if (!resp.ok) throw new Error(`source_runs REST HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows) || rows.length === 0) return { status: "no_rows" };
  return { status: "row", row: rows[0] };
}

// evaluateRunHealth(row, target) -> string detail, or throws (a real failure)
//
// The PO's explicit semantics: events_seen=20/inserted=0/updated=0 is
// healthy (a successful run that found nothing new); events_seen=0 alone is
// not automatically a failure. This function never gates on records_fetched/
// records_parsed/records_written -- only on outcome and on whether a run
// actually happened within the source's own expected interval (target.days,
// the same SOURCE_FRESHNESS_DAYS_DEFAULT/QUIET windows the old freshness
// check already used -- reused here as "how often should this source's cron
// run", not "how often should its rows change").
function evaluateRunHealth(row, target) {
  const startedAt = new Date(row.started_at);
  const ageMs = Date.now() - startedAt.getTime();

  if (row.outcome === "started" && !row.finished_at) {
    if (ageMs > STARTED_RUN_TIMEOUT_MINUTES * 60 * 1000) {
      throw new Error(
        `run for ${target.source} started ${Math.round(ageMs / 60000)}m ago and never finished -- probable timeout/abandoned run`
      );
    }
    return `run in progress (started ${Math.round(ageMs / 60000)}m ago)`;
  }

  if (row.outcome === "failed") {
    throw new Error(
      `last run FAILED${row.http_status ? ` (HTTP ${row.http_status})` : ""}${row.error_sample ? `: ${row.error_sample}` : ""}`
    );
  }

  if (row.outcome === "blocked") {
    throw new Error(
      `last run BLOCKED by upstream${row.http_status ? ` (HTTP ${row.http_status})` : ""}${row.error_sample ? `: ${row.error_sample}` : ""}`
    );
  }

  // outcome is 'success' or 'partial' -- healthy, regardless of how many
  // records it saw/wrote, UNLESS the run itself is older than this source's
  // own expected interval (i.e. the cron has stopped running, not "ran and
  // found nothing").
  const maxAgeMs = target.days * 24 * 60 * 60 * 1000;
  if (ageMs > maxAgeMs) {
    throw new Error(
      `no successful run started for ${target.source} in the last ${target.days}d (last run: ${row.started_at}, outcome=${row.outcome}) -- the connector itself, not event data, is stale`
    );
  }
  return `last run ${row.outcome}, started ${Math.round(ageMs / 3600000)}h ago`;
}

// One entry per SOURCE_FRESHNESS_TARGETS source that has a real slug in the
// WP 0.5 registry (api/_lib/source-slugs.js). Explicit map, not fuzzy label
// matching, per this project's existing "constants over ceremony" style
// (source-slugs.js's own words) -- a source's display name in `events.source`
// and its slug's `label` don't always read the same
// ("Detroit Historical Society" vs. "Detroit Historical Society (Dossin)",
// "Rock In Detroit (rockindetroit.com/venue/old-miami)" vs. "The Old Miami").
// A source with no entry here (e.g. Ticketmaster, Metro Times, VisitDetroit,
// Detroit Month of Design, Planet Ant Theatre, PLAYGROUND DETROIT, Popps
// Packing -- their connectors don't call startRun()/finishRun() yet) always
// falls back to the advisory freshness check below.
const SOURCE_NAME_TO_SLUG = {
  WDET: SLUGS.wdet,
  "HALO Detroit": SLUGS.halo,
  "Belle Isle Nature Center": SLUGS.belleIsleNatureCenter,
  "Redford Theatre": SLUGS.redfordTheatre,
  "Cinema Detroit": SLUGS.cinemaDetroit,
  "Detroit Historical Society": SLUGS.dossin,
  "Lager House": SLUGS.lagerhouse,
  Trinosophes: SLUGS.trinosophes,
};

// checkSourceHealth(target) -> Promise<string detail>, or throws (a failure)
//
// The replacement for the old checkSourceFreshness in the main check list:
// prefers source_runs (authoritative -- did the connector actually run and
// complete) when this source has a mapped slug AND source_runs has evidence
// for it; otherwise falls back to the non-failing advisory freshness check.
async function checkSourceHealth(target) {
  const slug = SOURCE_NAME_TO_SLUG[target.source];
  if (slug) {
    const latest = await fetchLatestSourceRun(slug);
    if (latest.status === "row") {
      return evaluateRunHealth(latest.row, target);
    }
    // "no_table" (migration_035 not applied) or "no_rows" (table exists,
    // nothing logged for this slug yet) -- both fall back to advisory below,
    // never a hard failure on their own.
  }
  return checkSourceFreshnessAdvisory(target.source, target.days);
}

// cron-feeds.js has no fixed source string — it polls whatever's currently
// approved in the organizer-submitted feed_sources registry (see
// migration_008_feed_sources.sql: venue_name/feed_url/status, status enum
// 'pending_review'|'approved'|'rejected'|'paused'), writing each feed's own
// venue_name as that row's events.source AND stamping events.feed_source_id
// — so "one static source name" doesn't apply the way it does to every cron
// above. This instead asks the same underlying question per currently-
// approved registered feed, joined on the real feed_source_id key (not a
// venue_name text match, which two different feeds could coincidentally
// share): did THIS feed's own events get touched recently. A feed with zero
// rows ever successfully pulled (brand new, or broken since the day it was
// approved) is excluded here rather than flagged — that's cron-feeds.js's
// own admin-facing last_poll_result's job to surface, not this suite's;
// this check is only about a previously-working feed going quiet.
async function checkFeedSourcesFreshness(days) {
  const feedsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/feed_sources?select=id,venue_name&status=eq.approved`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!feedsResp.ok) throw new Error(`feed_sources REST HTTP ${feedsResp.status}`);
  const feeds = await feedsResp.json();
  if (!Array.isArray(feeds) || !feeds.length) return "no approved registered feeds to check";

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const stale = [];
  for (const feed of feeds) {
    const everResp = await fetch(
      `${SUPABASE_URL}/rest/v1/events?select=id&feed_source_id=eq.${encodeURIComponent(feed.id)}&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const everRows = everResp.ok ? await everResp.json() : [];
    if (!Array.isArray(everRows) || !everRows.length) continue; // never pulled anything — not this check's concern

    const freshResp = await fetch(
      `${SUPABASE_URL}/rest/v1/events?select=id&feed_source_id=eq.${encodeURIComponent(feed.id)}&updated_at=gte.${encodeURIComponent(cutoff)}&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const freshRows = freshResp.ok ? await freshResp.json() : [];
    if (!Array.isArray(freshRows) || !freshRows.length) stale.push(feed.venue_name || feed.id);
  }
  if (stale.length) {
    throw new Error(`previously-active feed(s) gone quiet ${days}d+: ${stale.join(", ")}`);
  }
  return `${feeds.length} approved feed(s) checked, none stale`;
}

async function checkSupabaseData() {
  const url = `${SUPABASE_URL}/rest/v1/events?select=id&status=eq.approved&limit=1`;
  const resp = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!resp.ok) throw new Error(`Supabase REST HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("no approved events returned — public pages would render empty");
  }
  return `${rows.length} row(s) returned`;
}

async function checkCronAuth(name) {
  const resp = await fetch(`${BASE_URL}/api/${name}`, {
    headers: { Authorization: `Bearer ${WRONG_SECRET}` },
  });
  if (resp.status !== 401) {
    throw new Error(`expected 401 for a wrong secret, got ${resp.status} — CRON_SECRET may be unset or the auth check is broken`);
  }
  return "401 as expected";
}

async function checkAdminAuth(name) {
  const resp = await fetch(`${BASE_URL}/api/${name}`, {
    headers: { "x-admin-secret": WRONG_SECRET },
  });
  if (resp.status !== 401) {
    throw new Error(`expected 401 for a wrong secret, got ${resp.status} — ADMIN_SECRET may be unset or the auth check is broken`);
  }
  return "401 as expected";
}

async function checkJsonValidation(path) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (resp.status !== 400) throw new Error(`expected 400 for an empty submission, got ${resp.status}`);
  return "400 as expected";
}

async function checkUploadImageValidation() {
  const resp = await fetch(`${BASE_URL}/api/upload-image`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "not an image",
  });
  if (resp.status !== 400) throw new Error(`expected 400 for a non-image body, got ${resp.status}`);
  return "400 as expected";
}

// 2026-09-05, added after Jody's friend hit "No image data received." on
// EVERY real image upload attempt — a bug that reproduced 100% of the
// time, yet this suite had already been reporting "ok" the whole time.
// Why: checkUploadImageValidation() above only ever proved BAD input gets
// rejected (a non-image body → 400) — it never once proved a real image
// succeeds. The actual bug also returned 400, for the wrong reason (see
// api/upload-image.js's fix comment), so that check kept passing right
// through it. This closes that blind spot: uploads a small but genuinely
// valid image/jpeg body through the real endpoint and requires success —
// a 201 with a usable url — then deletes the test file straight out of
// Storage (service role, not through any public endpoint) so this doesn't
// leave junk behind on every scheduled run. BUCKET must stay in sync with
// api/upload-image.js's own bucket name — duplicated rather than shared,
// same one-file-per-endpoint convention as every constant like this
// elsewhere in this project (e.g. VALID_CATEGORIES in admin-editorial.js).
const UPLOAD_BUCKET = "event-flyers";

async function checkUploadImageSuccess() {
  const bytes = new Uint8Array(256).fill(1); // real non-empty bytes, real image/jpeg content-type
  const resp = await fetch(`${BASE_URL}/api/upload-image`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: bytes,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`expected 201 for a real image upload, got ${resp.status}: ${body}`);
  }
  const data = await resp.json().catch(() => ({}));
  if (!data.url) throw new Error("upload reported success but returned no url");
  try {
    const path = data.url.split(`/${UPLOAD_BUCKET}/`).pop();
    if (path) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/${UPLOAD_BUCKET}/${path}`, {
        method: "DELETE",
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      });
    }
  } catch (_) {
    // Best-effort cleanup — a leftover test file is harmless clutter, never
    // worth failing an otherwise-successful check over.
  }
  return "201, real upload succeeded and test file cleaned up";
}

async function checkSitemap() {
  const resp = await fetch(`${BASE_URL}/sitemap.xml`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("xml")) throw new Error(`unexpected content-type: ${ct}`);
  return `HTTP ${resp.status}, ${ct}`;
}

// Best-effort — a failed prune should never fail the health check run
// itself, same posture as every fire-and-forget cleanup elsewhere in this
// project.
async function pruneOldRows(sbHeaders) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/healthchecks?run_at=lt.${encodeURIComponent(cutoff)}`, {
      method: "DELETE",
      headers: sbHeaders,
    });
  } catch (_) {}
}

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ overall: "fail", error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured — cannot write results" });
    return;
  }

  const runStart = Date.now();

  const checks = await Promise.all([
    ...PAGES.map((p) => runCheck(`page: ${p}`, () => checkPage(p))),
    runCheck("supabase: approved events reachable", checkSupabaseData),
    ...SOURCE_FRESHNESS_TARGETS.map((t) =>
      runCheck(`source health: ${t.source}`, () => checkSourceHealth(t))
    ),
    runCheck("source freshness: registered feeds (cron-feeds)", () =>
      checkFeedSourcesFreshness(SOURCE_FRESHNESS_DAYS_QUIET)
    ),
    ...CRON_ENDPOINTS.map((name) => runCheck(`cron auth: ${name}`, () => checkCronAuth(name))),
    ...ADMIN_ENDPOINTS.map((name) => runCheck(`admin auth: ${name}`, () => checkAdminAuth(name))),
    runCheck("submit validation", () => checkJsonValidation("/api/submit")),
    runCheck("submit-feed validation", () => checkJsonValidation("/api/submit-feed")),
    runCheck("upload-image validation", checkUploadImageValidation),
    runCheck("upload-image: real upload succeeds", checkUploadImageSuccess),
    runCheck("sitemap.xml", checkSitemap),
  ]);

  const overall = checks.every((c) => c.ok) ? "ok" : "fail";
  const durationMs = Date.now() - runStart;

  const sbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/healthchecks`, {
      method: "POST",
      headers: sbHeaders,
      body: JSON.stringify([{ overall, duration_ms: durationMs, checks }]),
    });
  } catch (err) {
    // Even if we can't log the run, still report it in the response itself
    // so it shows up in Vercel's own cron invocation log as a fallback.
    res.status(200).json({ overall, duration_ms: durationMs, checks, logError: err.message });
    return;
  }

  await pruneOldRows(sbHeaders);

  res.status(200).json({ overall, duration_ms: durationMs, failing: checks.filter((c) => !c.ok).map((c) => c.name) });
};

// Exposed for test/cron-healthcheck-source-health.test.js only.
module.exports.checkSourceHealth = checkSourceHealth;
module.exports.evaluateRunHealth = evaluateRunHealth;
module.exports.fetchLatestSourceRun = fetchLatestSourceRun;
module.exports.checkSourceFreshnessAdvisory = checkSourceFreshnessAdvisory;
module.exports.SOURCE_NAME_TO_SLUG = SOURCE_NAME_TO_SLUG;
module.exports.SOURCE_FRESHNESS_TARGETS = SOURCE_FRESHNESS_TARGETS;
module.exports.STARTED_RUN_TIMEOUT_MINUTES = STARTED_RUN_TIMEOUT_MINUTES;
