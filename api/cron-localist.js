const crypto = require("crypto");
const path = require("path");
const { buildVenueDetailsMap, resolveVenueFromCandidate, normalizeVenueName, citiesConflict, isBlank } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingRows } = require("./_lib/status-lookup");
const { upsertEventRows } = require("./_lib/event-upsert");
const {
  HORIZON_DAYS,
  ORBIT_MILES,
  mapCategory,
  formatTimeDisplay,
  parseLocalistLocation,
  needsFullSchedule,
  newFunnel,
  selectEligible,
  buildTenantRows,
  isoDatePlusDays,
} = require("./_lib/localist-rows");
// The title-keyword table every feed already uses for its category
// (api/cron-feeds.js requires it the same way).
const { extractCategory } = require(path.join(__dirname, "..", "scripts", "press-coverage-linking"));

// Vercel Cron job — the generalized `localist` adapter (INGESTION_BACKLOG.md
// WP 6.1/6.2, the first "platform multiplier" in
// INGESTION_PLATFORM_ARCHITECTURE.md's own build order: "one adapter plus N
// registry rows is the cheapest route to coverage"). Config-driven over
// TENANTS below -- onboarding a new Localist campus/institution is one new
// array entry, never a new file, matching cron-eventbrite.js's own
// generalized-adapter shape and cron-feeds.js's original precedent.
//
// VERIFICATION, NOT ASSUMPTION (2026-10-02): the architecture doc's own P0
// list named six candidates -- University of Michigan, Wayne State, MSU,
// BGSU, Macomb CC, UToledo "if confirmed" -- and WP 6.2's own acceptance
// test already anticipated the real outcome: "Each tenant is active or
// documented as not Localist." Each candidate was independently checked
// against its own live site/IT documentation before being added here
// (never assumed from the architecture doc or from URL-shape resemblance
// alone, which turned out to be an unreliable signal -- see below):
//
//   - Bowling Green State University (events.bgsu.edu) -- CONFIRMED.
//     Explicit on-page branding ("Powered by the Localist Community Event
//     Platform", meta-application-name) plus BGSU's own IT knowledge base
//     ("the BGSU event calendar, powered by Localist",
//     bgsu.teamdynamix.com). In SERVICE_AREA.md's own table, Bowling
//     Green, OH is 65.7 mi from Detroit's border -- inside the 75-mile
//     service area on its own merits, not a special case.
//   - Macomb Community College (events.macomb.edu) -- CONFIRMED. Explicit
//     on-page branding ("Localist Event Calendar Software"). Macomb
//     County is well inside the service area.
//   - University of Michigan (events.umich.edu, "Happening @ Michigan") --
//     NOT LOCALIST. UMich's own IT service catalog
//     (teamdynamix.umich.edu, service "SL Happening") describes it
//     explicitly as "a custom application by Technology Solutions,"
//     not a third-party platform. Its URL shape (/event/{id}, /list,
//     /search) superficially resembles Localist's own routes, which is
//     exactly why this needed direct confirmation rather than a guess.
//   - Michigan State University (events.msu.edu) -- NOT LOCALIST.
//     events.msu.edu/docs.php documents a custom PHP system
//     (update.php and friends) and lists "newer and better RSS/XML
//     input/output" only under "Possible Future Features" -- there is no
//     structured feed or API of any kind available from this source
//     today, Localist or otherwise.
//   - University of Toledo -- NOT LOCALIST, more basically: no
//     events.utoledo.edu/calendar.utoledo.edu subdomain could be found
//     at all. utoledo.edu/events/ is a plain directory of per-department
//     calendar links with no central platform.
//   - Wayne State University (events.wayne.edu) -- UNCONFIRMED, left OUT
//     of TENANTS below rather than guessed in. Its URL shape also
//     resembles Localist's day-view routes, but given that the same
//     resemblance was a false positive for both UMich and MSU, URL shape
//     alone is not treated as evidence here. No explicit platform
//     confirmation could be found. Add it as a new TENANTS entry once an
//     authoritative source (Wayne State's own web/IT team, or a direct
//     look at their admin login page / API response) confirms it one way
//     or the other -- never re-add it on URL-shape alone.
//
// WHY STRUCTURED API, NOT SCRAPING: Localist's own documented v2 REST API
// (`GET /api/2/events`, confirmed as the public, keyless, structured
// access path in INGESTION_PLATFORM_ARCHITECTURE.md's own cheat sheet) is
// used exclusively -- no HTML page of any tenant's calendar is parsed
// here.
//
// WHAT IS FETCHED, AND WHAT BECOMES A ROW (rewritten 2026-10-05, BUG-013)
// The reading of each event -- eligibility, location, how occurrences become
// rows, what a row is called -- is api/_lib/localist-rows.js, which carries
// the measurements behind every rule. This file does the three things that
// need the network or the database:
//
//   1. THE LISTING, `GET /api/2/events?days=90`: every occurrence in the
//      next 90 days, 100 to a page. Page 1 says how many pages there are;
//      the rest are fetched a few at a time (Bowling Green's seven pages
//      take about 27 seconds one after another). If ANY page of a tenant
//      fails, nothing is written for that tenant in this run: a listing with
//      a hole in it would break an exhibition's run of days in two and the
//      second half would be written as a new event.
//   2. THE FULL SCHEDULE of each eligible event that has an occurrence on
//      the listing's first day, `GET /api/2/events/{id}` -- a handful a day.
//      Without it a run already under way cannot be named after its first
//      day (see localist-rows.js, problem 3). If that request fails the
//      event is left out of this run and counted; it is never written from
//      the partial view.
//   3. THE WRITE, through the shared helper (api/_lib/event-upsert.js), with
//      the status of an existing row preserved (api/_lib/status-lookup.js)
//      and the venue resolved by the shared lookup, which refuses a
//      same-name venue in a different city (api/_lib/venue-lookup.js).
//
//   4. THE WITHDRAWAL. When a tenant's listing was read in full, a stored
//      row of that tenant, starting on or after the listing's first day,
//      which this run did NOT produce is no longer what the source says: the
//      event was cancelled or removed, is no longer listed for the public, or
//      its schedule was edited so that its rows are named differently now.
//      Such a row is hidden (status "rejected", with a note saying so and
//      what its status was) -- never deleted. If the source lists it again,
//      the note is recognised and the row gets its status back. Without this
//      a cancelled concert stayed public for good, and an organiser adding a
//      day to the front of a run left the old run beside the new one.
//        - It happens BEFORE the write. An organiser who deletes an entry and
//          makes a new one for the same event produces a new row that is the
//          same occurrence as the stored one. Withdrawn first, the old row is
//          out of the way before the new one exists, so the two are never
//          both active for the nightly duplicate pass
//          (scripts/duplicate-consolidation.js) to choose between.
//        - A row that began before the listing's first day is left alone: a
//          week-long event under way is not withdrawn for being under way.
//        - THE NOTE IS ONE LINE, ADDED AT THE END of whatever note the row
//          has, and only that line is ever removed again. A row gets its
//          status back only while that line is still the LAST thing in its
//          note: if the duplicate pass or the non-event pass has since
//          written its own line after it (they hide rows too, and append),
//          the row is theirs and stays hidden.
//        - A REVIEWER'S DECISION OUTLIVES IT. A withdrawn row a reviewer
//          restores is not withdrawn again -- it is marked as kept by a
//          reviewer, for good; and once a row is listed again its withdrawal
//          line is removed, so that a later rejection by a reviewer is not
//          mistaken for a withdrawal and undone.
//        - Refused, and reported, if an implausible share of a tenant's rows
//          simply VANISH from the listing at once. A row whose occurrence is
//          still in the listing but is now cancelled, or no longer for the
//          public, is withdrawn on that evidence whatever the numbers.
//        - Not done at all for a listing that does not say how many entries
//          it has: nothing can then show that it was read whole.
//
// KNOWN LIMITS (third independent review; each needs more than this file)
//   - A RUN ALREADY UNDER WAY that the source cancels or cuts short keeps its
//     stored end date until that date passes: rows that began before the
//     listing's first day are not revisited, because a stored row does not
//     carry the event id needed to ask the source about it.
//   - A row withdrawn, then restored AND rejected by a reviewer before the
//     next run, is indistinguishable from a withdrawn row and comes back if
//     the source lists it again.
//
// WHAT IS WRITTEN OVER, AND WHAT IS NOT (second and third independent reviews)
// A row that already exists is written with every column this connector
// owns -- one request for the whole batch -- and a column means one of three
// things:
//   - the source's word, always: title, dates, time, recurrence, free flag;
//   - the source's word when it has one, otherwise what is stored:
//     description, image, event link, ticket link, price. A description or
//     ticket link the enrichment job, the duplicate pass or a reviewer added
//     is not erased every morning (the cost: a link the source itself drops
//     stays until someone removes it);
//   - THE PLACE, as one thing. While the event is where the stored row says
//     -- the same venue name and no disagreement about the city; or the
//     source names no venue and its street and city do not contradict the
//     stored ones -- blanks fall back to what is stored, and a stored venue
//     link stands if that venue is in the same city. When the event MOVES,
//     the whole place is the source's: name, street, city and venue link
//     together, blanks included. The old street and the old venue's link do
//     not stay behind under a new name or in a new city.
// And for a row that already exists, the catch-all category is not written
// over whatever category it has been given since.
//
// GUARDS, each from an independent review:
//   - a listing whose pages do not add up to the count the tenant states --
//     counted as distinct occurrences, so a page served twice does not make
//     up for a page that came back empty -- or with a short page before the
//     last, is treated as failed, exactly like a page that errors;
//   - each tenant has a time budget, counted from the start of the run, so
//     one slow tenant cannot take the other's rows down with it. The function
//     is allowed 120 seconds (vercel.json); the tenants get the first 40.
//
// PUBLICATION: every row is still written `pending_review`. That is one
// word per tenant (`defaultStatus` below) and is deliberately NOT changed by
// the change that made the rows trustworthy; it is the Product Owner's
// decision, taken on the evidence of what this connector writes.
//
// FIELDS LEFT ALONE: price_from (ticket_cost is free text), ticket_status.
// is_free is the source's own `free` flag and nothing else.

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

const SUPABASE_URL = process.env.SUPABASE_URL;
// Non-production deployments must never use the production database (api/_lib/environment.js).
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const SOURCE_SLUG = SLUGS.localist;
const AMBIGUOUS_STATUS = "pending_review";
const PAGE_SIZE = 100; // the API's maximum
// A ceiling, not an expectation: Bowling Green needs 7 pages for 90 days,
// Macomb 3. Reaching it is reported as a failure of that tenant, never as a
// quietly shorter listing.
const MAX_PAGES_PER_TENANT = 25;
const PAGE_CONCURRENCY = 3;
const DETAIL_CONCURRENCY = 4;
// More full schedules than this in one run means something is wrong with the
// listing (a normal day is under 20 across both tenants).
const MAX_DETAIL_FETCHES_PER_TENANT = 80;
const REQUEST_TIMEOUT_MS = 20000;
// One tenant's requests, all told, counted from the start of the run. The
// function is allowed 120 seconds (vercel.json); the database work after the
// tenants finish has the rest.
const TENANT_BUDGET_MS = 40000;
const USER_AGENT = "313.events event calendar";
// Withdrawal (see header, 4). More than this many rows AND more than this
// share of a tenant's stored upcoming rows vanishing in one run is not
// believed: nothing is withdrawn and the run says so.
const WITHDRAW_MAX_ROWS = 5;
const WITHDRAW_MAX_SHARE = 0.2;
const WITHDRAWN_PREFIX = "Withdrawn by the Localist connector";
const KEPT_PREFIX = "Kept by a reviewer after the Localist connector withdrew it";
const STORED_PAGE_SIZE = 1000;
const ID_CHUNK = 100;
// What this connector reads of a stored row before writing it again.
const STORED_SELECT = "external_id,status,internal_note,category,description,image_url,event_url,price_from,venue_id,venue_name_raw,venue_address_raw,venue_city_raw";
// The source's word when it has one; otherwise what is stored (see header).
const KEEP_STORED_WHEN_BLANK = ["description", "image_url", "event_url", "ticket_url", "price_from"];
// The connector's two marks are single LINES of internal_note; other jobs and
// people write their own lines in the same field.
const noteLines = (note) => String(note || "").split("\n").map((line) => line.trim()).filter(Boolean);
const isWithdrawalLine = (line) => line.startsWith(WITHDRAWN_PREFIX);
const isKeptLine = (line) => line.startsWith(KEPT_PREFIX);
// Withdrawn, and nothing written after it: still this connector's to undo.
const withdrawnAndUntouched = (row) => { const lines = noteLines(row.internal_note); return lines.length > 0 && isWithdrawalLine(lines[lines.length - 1]); };
const withoutWithdrawalLines = (note) => noteLines(note).filter((line) => !isWithdrawalLine(line)).join("\n") || null;
const withLine = (note, line) => [...noteLines(note), line].join("\n");

// Config-driven, multi-tenant registry -- see header for how each entry was
// verified. `source` is this tenant's own institutional identity (DEC-005).
//   publicAudiences  the name(s) this tenant's own "target audience" filter
//                    uses for the general public. An event is written only
//                    if the tenant lists it for one of them. Both tenants
//                    say "General Public" (observed 2026-10-05).
//   defaultStatus    the status of a NEW row. An existing row always keeps
//                    its own.
const TENANTS = Object.freeze([
  Object.freeze({
    tenantSlug: "bgsu",
    apiBase: "https://events.bgsu.edu",
    source: "Bowling Green State University",
    publicAudiences: Object.freeze(["General Public"]),
    defaultStatus: AMBIGUOUS_STATUS,
  }),
  Object.freeze({
    tenantSlug: "macomb",
    apiBase: "https://events.macomb.edu",
    source: "Macomb Community College",
    publicAudiences: Object.freeze(["General Public"]),
    defaultStatus: AMBIGUOUS_STATUS,
  }),
]);

// The date in Detroit, as the tenants' own calendars count days. Only a
// fallback: the listing states its own first day and that is what is used.
function detroitToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// `deadline` (ms since the epoch): no request is started after it, and none
// is waited on past it.
async function fetchJson(url, deadline) {
  const left = deadline ? deadline - Date.now() : REQUEST_TIMEOUT_MS;
  if (left <= 0) return { data: null, error: "Out of time: this tenant's budget for one run was used up" };
  let r;
  try {
    r = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, left)) });
  } catch (err) {
    return { data: null, error: "Fetch failed: " + err.message };
  }
  if (!r.ok) return { data: null, error: `Fetch failed: HTTP ${r.status}` };
  try {
    return { data: await r.json(), error: null };
  } catch (err) {
    return { data: null, error: "Unparseable JSON response: " + err.message };
  }
}

// Runs `worker` over `items`, at most `limit` at a time, results in order.
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function tenantEventsUrl(tenant, page) {
  const params = new URLSearchParams({ days: String(HORIZON_DAYS), pp: String(PAGE_SIZE), page: String(page) });
  return `${tenant.apiBase}/api/2/events?${params.toString()}`;
}

function pageEvents(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.events)) return null;
  return data.events.map((w) => (w && typeof w === "object" ? w.event || w : null)).filter(Boolean);
}

// The whole 90-day listing of one tenant, or an error. All or nothing: see
// the header. -> { events, windowStart, windowEnd, pages, error }
async function fetchTenantEvents(tenant, deadline) {
  const empty = { events: [], windowStart: null, windowEnd: null, pages: 0 };
  const first = await fetchJson(tenantEventsUrl(tenant, 1), deadline);
  if (first.error) return { ...empty, error: first.error };
  const firstEvents = pageEvents(first.data);
  if (!firstEvents) return { ...empty, error: "Unexpected API response shape (events was not an array)" };

  const stated = first.data.date && typeof first.data.date === "object" ? first.data.date : {};
  const isIsoDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const windowStart = isIsoDate(stated.first) ? stated.first : detroitToday();
  const windowEnd = isIsoDate(stated.last) ? stated.last : isoDatePlusDays(windowStart, HORIZON_DAYS);

  const totalStated = first.data.page && Number.isInteger(first.data.page.total) ? first.data.page.total : null;
  let events = firstEvents;
  let pages = 1;
  if (totalStated !== null) {
    if (totalStated > MAX_PAGES_PER_TENANT) {
      return { ...empty, windowStart, windowEnd, error: `Listing is ${totalStated} pages, more than the ${MAX_PAGES_PER_TENANT}-page ceiling; nothing written for this tenant` };
    }
    const rest = [];
    for (let page = 2; page <= totalStated; page++) rest.push(page);
    const results = await mapLimit(rest, PAGE_CONCURRENCY, async (page) => {
      const r = await fetchJson(tenantEventsUrl(tenant, page), deadline);
      if (r.error) return { error: `page ${page}: ${r.error}` };
      const list = pageEvents(r.data);
      return list ? { list } : { error: `page ${page}: unexpected API response shape` };
    });
    const bad = results.find((r) => r.error);
    if (bad) return { ...empty, windowStart, windowEnd, error: bad.error };
    // Every page but the last is full, or the listing has a hole in it.
    const size = Number.isInteger(first.data.page.size) && first.data.page.size > 0 ? first.data.page.size : PAGE_SIZE;
    const lists = [firstEvents, ...results.map((r) => r.list)];
    const short = lists.findIndex((list, index) => index < lists.length - 1 && list.length < size);
    if (short !== -1) return { ...empty, windowStart, windowEnd, error: `Listing is incomplete: page ${short + 1} of ${totalStated} holds ${lists[short].length} entries, not ${size}; nothing written for this tenant` };
    for (const r of results) events = events.concat(r.list);
    pages = totalStated;
  } else {
    // A tenant that does not state a page count: read until a short page.
    while (events.length === pages * PAGE_SIZE) {
      if (pages >= MAX_PAGES_PER_TENANT) {
        return { ...empty, windowStart, windowEnd, error: `Listing ran past the ${MAX_PAGES_PER_TENANT}-page ceiling; nothing written for this tenant` };
      }
      const r = await fetchJson(tenantEventsUrl(tenant, pages + 1), deadline);
      if (r.error) return { ...empty, windowStart, windowEnd, error: `page ${pages + 1}: ${r.error}` };
      const list = pageEvents(r.data);
      if (!list) return { ...empty, windowStart, windowEnd, error: `page ${pages + 1}: unexpected API response shape` };
      events = events.concat(list);
      pages++;
      if (list.length < PAGE_SIZE) break;
    }
  }
  // The tenant says how many entries the listing has. Fewer than that -- a
  // page that answered 200 with nothing in it -- is a listing with a hole.
  // Counted as DISTINCT occurrences: a page served twice does not make up
  // for one that came back short.
  const statedItems = first.data.page && Number.isInteger(first.data.page.total_items) ? first.data.page.total_items : null;
  const distinct = new Set(events.map((e, index) => {
    const wrapper = Array.isArray(e.event_instances) ? e.event_instances[0] : null;
    const instance = wrapper && typeof wrapper === "object" ? wrapper.event_instance || wrapper : null;
    return instance && instance.id != null ? `i:${instance.id}` : `n:${index}`;
  })).size;
  if (statedItems !== null && distinct !== statedItems) {
    return { ...empty, windowStart, windowEnd, error: `Listing is incomplete: ${distinct} distinct entries read, ${statedItems} stated; nothing written for this tenant` };
  }
  // countStated: the tenant said how many entries there are, so the listing
  // is KNOWN to be whole. Only then may anything be withdrawn on its strength.
  return { events, windowStart, windowEnd, pages, countStated: statedItems !== null, error: null };
}

// One event's every instance, past ones included. -> { instanceWrappers, error }
async function fetchEventSchedule(tenant, eventId, deadline) {
  const r = await fetchJson(`${tenant.apiBase}/api/2/events/${encodeURIComponent(eventId)}`, deadline);
  if (r.error) return { instanceWrappers: null, error: r.error };
  const event = r.data && typeof r.data === "object" ? r.data.event || r.data : null;
  if (!event || !Array.isArray(event.event_instances)) return { instanceWrappers: null, error: "Unexpected API response shape (no event_instances)" };
  return { instanceWrappers: event.event_instances, error: null };
}

// Everything one tenant contributes to this run: its rows and the funnel
// that produced them. Never throws; a failure is in `errors`. The decisions
// are all in api/_lib/localist-rows.js; only the requests are made here.
async function collectTenant(tenant, deadline = Date.now() + TENANT_BUDGET_MS) {
  const funnel = newFunnel(tenant);
  const listing = await fetchTenantEvents(tenant, deadline);
  funnel.windowStart = listing.windowStart;
  funnel.windowEnd = listing.windowEnd;
  if (listing.error) return { rows: [], funnel, errors: [listing.error], complete: false };
  funnel.pages = listing.pages;

  const eligible = selectEligible(listing.events, tenant, funnel);

  // Full schedule for an event with an occurrence at either edge of the window.
  const wantSchedule = eligible.filter((g) => needsFullSchedule(g.instanceWrappers, listing.windowStart, listing.windowEnd));
  if (wantSchedule.length > MAX_DETAIL_FETCHES_PER_TENANT) {
    return { rows: [], funnel, errors: [`${wantSchedule.length} events need their full schedule, more than the ceiling of ${MAX_DETAIL_FETCHES_PER_TENANT}; nothing written for this tenant`], complete: false };
  }
  const fetched = await mapLimit(wantSchedule, DETAIL_CONCURRENCY, (g) => fetchEventSchedule(tenant, g.event.id, deadline));
  const schedules = new Map(wantSchedule.map((g, i) => [String(g.event.id), fetched[i]]));

  const { rows, errors } = buildTenantRows(
    eligible,
    schedules,
    { tenant, windowStart: listing.windowStart, windowEnd: listing.windowEnd, categoryFromText: extractCategory },
    funnel
  );
  // Occurrences the listing still contains but that are not ours to show (the
  // event is cancelled, not for the public, virtual, outside the Orbit): a
  // stored row for one of these is withdrawn on evidence, not on absence.
  const eligibleIds = new Set(eligible.map((g) => String(g.event.id)));
  const listedNotEligible = new Set();
  for (const e of listing.events) {
    if (!e || eligibleIds.has(String(e.id))) continue;
    for (const wrapper of Array.isArray(e.event_instances) ? e.event_instances : []) {
      const inst = wrapper && typeof wrapper === "object" ? wrapper.event_instance || wrapper : null;
      if (inst && inst.id != null) listedNotEligible.add(`localist-${tenant.tenantSlug}-${inst.id}`);
    }
  }
  // `complete`: these rows are everything this tenant has for the window --
  // the listing was whole and every schedule that was needed was read.
  return { rows, funnel, errors, complete: errors.length === 0, countStated: listing.countStated === true, listedNotEligible };
}

// Stored rows of one tenant, public or awaiting review, that start on or
// after the listing's first day.
async function fetchStoredRows(tenant, windowStart) {
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  const query = `events?external_id=like.localist-${tenant.tenantSlug}-*&status=in.(approved,pending_review)&start_date=gte.${windowStart}&select=id,external_id,status,start_date,internal_note&order=id.asc`;
  // `like` would also match another tenant whose name begins with this one's.
  const own = new RegExp(`^localist-${tenant.tenantSlug}-[^-]+$`);
  const rows = [];
  for (let page = 0; page < 20; page++) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${query}&limit=${STORED_PAGE_SIZE}&offset=${rows.length}`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!resp.ok) throw new Error(`reading stored rows returned ${resp.status}`);
    const batch = await resp.json();
    if (!Array.isArray(batch)) throw new Error("reading stored rows returned a non-array");
    if (!batch.length) return rows.filter((r) => own.test(r.external_id));
    rows.push(...batch);
  }
  throw new Error("too many stored rows to read safely");
}

async function patchRows(ids, statusFilter, body) {
  const headers = { "Content-Type": "application/json", apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "return=minimal" };
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?id=in.(${ids.slice(i, i + ID_CHUNK).join(",")})&status=${statusFilter}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  }
}

// rows -> [[row, row, ...]]: rows that take the same PATCH (same status,
// same note), so that the usual case -- no note at all -- is one request.
function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

// Hides the stored rows of a tenant that this (complete) run did not
// produce. -> { withdrawn, keptByReviewer, error }. See the header, 4.
async function withdrawStaleRows(tenant, collected) {
  const { windowStart, windowEnd } = collected.funnel;
  let stored;
  try {
    stored = await fetchStoredRows(tenant, windowStart);
  } catch (err) {
    return { withdrawn: 0, keptByReviewer: 0, error: `withdrawal skipped: ${err.message}` };
  }
  const produced = new Set(collected.rows.map((r) => r.external_id));
  const unlisted = stored.filter((r) => !produced.has(r.external_id) && r.start_date <= windowEnd);
  // ACTIVE and carrying this connector's withdrawal line: a reviewer restored
  // it. It is theirs to keep, for good, and is marked so.
  const kept = unlisted.filter((r) => noteLines(r.internal_note).some(isKeptLine));
  const justRestored = unlisted.filter((r) => !kept.includes(r) && noteLines(r.internal_note).some(isWithdrawalLine));
  const stale = unlisted.filter((r) => !kept.includes(r) && !justRestored.includes(r));
  const keptByReviewer = kept.length + justRestored.length;
  let withdrawn = 0;
  try {
    for (const group of groupBy(justRestored, (r) => r.internal_note || "")) {
      await patchRows(group.map((r) => r.id), "in.(approved,pending_review)", { internal_note: withLine(withoutWithdrawalLines(group[0].internal_note), `${KEPT_PREFIX} (the source no longer lists it for the public).`) });
    }
    if (!stale.length) return { withdrawn, keptByReviewer, error: null };
    // Still in the listing, and not ours to show: withdrawn on that evidence.
    // Simply gone from the listing: believed only in plausible numbers.
    const confirmed = stale.filter((r) => collected.listedNotEligible && collected.listedNotEligible.has(r.external_id));
    const vanished = stale.filter((r) => !confirmed.includes(r));
    const refused = vanished.length > WITHDRAW_MAX_ROWS && vanished.length > stored.length * WITHDRAW_MAX_SHARE;
    const toWithdraw = refused ? confirmed : stale;
    // One request per (status, existing note): each note keeps what it had and
    // gains one last line, dated by the listing's own first day -- the day
    // the source stopped listing it.
    for (const group of groupBy(toWithdraw, (r) => `${r.status}\u0000${r.internal_note || ""}`)) {
      const was = group[0].status;
      await patchRows(group.map((r) => r.id), `eq.${was}`, { status: "rejected", internal_note: withLine(group[0].internal_note, `${WITHDRAWN_PREFIX} on ${windowStart}: no longer in the source's listing for the public (was ${was}).`) });
      withdrawn += group.length;
    }
    return { withdrawn, keptByReviewer, error: refused ? `refusing to withdraw ${vanished.length} of ${stored.length} stored rows that vanished from the listing in one run; none of those withdrawn` : null };
  } catch (err) {
    return { withdrawn, keptByReviewer, error: `withdrawal failed part-way (${err.message}); it is tried again on the next run` };
  }
}

// The status a stored row is written back with. A row this connector
// withdrew, now listed again, gets back the status it had; anything else
// keeps the status it has.
function statusToKeep(stored) {
  if (stored.status === "rejected" && withdrawnAndUntouched(stored)) {
    const lines = noteLines(stored.internal_note);
    const was = /\(was (approved|pending_review)\)/.exec(lines[lines.length - 1]);
    return { status: was ? was[1] : AMBIGUOUS_STATUS, restored: true };
  }
  return { status: stored.status, restored: false };
}

// A row that already exists, as it is written back: `row` is what the source
// says now, `stored` what the table holds. See the header, "what is written
// over, and what is not".
function mergeWithStored(row, stored, categoryConfident, venueMaps) {
  const out = { ...row };
  for (const field of KEEP_STORED_WHEN_BLANK) if (isBlank(out[field]) && !isBlank(stored[field])) out[field] = stored[field];

  // Is the event still where the stored row says it is?
  const street = (value) => (isBlank(value) ? "" : String(value).toLowerCase().replace(/[.,#]/g, "").replace(/\s+/g, " ").trim());
  const cityAgrees = !citiesConflict(out.venue_city_raw, stored.venue_city_raw);
  let samePlace;
  if (isBlank(out.venue_name_raw)) {
    // The source names no venue: it is silent about one, unless its street
    // or city contradicts what is stored.
    samePlace = cityAgrees && (!street(out.venue_address_raw) || !street(stored.venue_address_raw) || street(out.venue_address_raw) === street(stored.venue_address_raw));
  } else {
    samePlace = cityAgrees && normalizeVenueName(out.venue_name_raw) === normalizeVenueName(stored.venue_name_raw || "");
  }
  if (samePlace) {
    for (const field of ["venue_name_raw", "venue_address_raw", "venue_city_raw"]) if (isBlank(out[field]) && !isBlank(stored[field])) out[field] = stored[field];
    // A link someone or something made while the event has not moved stands
    // -- if that venue is in the event's city (a row from before 2026-10-05
    // may be linked to a same-named venue in another one).
    // Dropped only on evidence: the venue is on file and its city disagrees.
    // (A venue that could not be read this run is not evidence of anything.)
    const linked = !isBlank(stored.venue_id) && venueMaps && venueMaps.byId ? venueMaps.byId.get(stored.venue_id) : null;
    if (!isBlank(stored.venue_id) && !(linked && citiesConflict(out.venue_city_raw, linked.city))) out.venue_id = stored.venue_id;
  }
  // The catch-all category is not written over whatever the row has been
  // given since. (The column cannot be left out of an upsert, so the stored
  // value is sent back.)
  if (!categoryConfident && stored.category) out.category = stored.category;
  // The note is the stored row's, less this connector's own withdrawal line:
  // the source lists the event, so that line has served its purpose.
  out.internal_note = withoutWithdrawalLines(stored.internal_note);
  return out;
}

module.exports = async (req, res) => {
  const startedAt = Date.now();
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  const runHandle = await startRun(SOURCE_SLUG);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  // One source_runs row per invocation, across every tenant -- same
  // convention as cron-feeds.js and cron-eventbrite.js. Tenants are read
  // side by side; one failing never stops the other.
  const collected = await Promise.all(TENANTS.map((tenant) => collectTenant(tenant, startedAt + TENANT_BUDGET_MS)));
  const failed = [];
  const funnels = [];
  const parsed = [];
  let totalFetched = 0;
  collected.forEach((c, i) => {
    funnels.push(c.funnel);
    totalFetched += c.funnel.occurrencesFetched;
    for (const error of c.errors) failed.push({ tenant: TENANTS[i].tenantSlug, error });
    parsed.push(...c.rows);
  });
  for (const funnel of funnels) console.log("[cron-localist] " + JSON.stringify(funnel));
  // Kept for whoever reads the response: the total not written for being
  // outside the Orbit, however that was known.
  const skippedOutsideOrbit = funnels.reduce((n, f) => n + f.skipped.outside_orbit + f.skipped.city_not_listed, 0);
  const errorSample = () => (failed.length ? failed.map((f) => `${f.tenant}: ${f.error}`).join("; ") : null);

  // Withdraw what a tenant no longer lists -- only for a tenant whose run was
  // complete, and BEFORE the write (see the header, 4). Never throws.
  let withdrawn = 0;
  for (let i = 0; i < TENANTS.length; i++) {
    if (!collected[i].complete || !collected[i].funnel.windowStart) continue;
    if (!collected[i].countStated) {
      failed.push({ tenant: TENANTS[i].tenantSlug, error: "withdrawal skipped: the listing does not say how many entries it has, so it cannot be shown to be whole" });
      continue;
    }
    const result = await withdrawStaleRows(TENANTS[i], collected[i]);
    collected[i].funnel.withdrawn = result.withdrawn;
    collected[i].funnel.keptByReviewer = result.keptByReviewer;
    withdrawn += result.withdrawn;
    if (result.error) failed.push({ tenant: TENANTS[i].tenantSlug, error: result.error });
  }

  if (!parsed.length) {
    // Nothing to write. With no failure that is a quiet day; if every tenant
    // failed it is a failed run, not a partial one.
    await finishRun(runHandle, {
      outcome: !failed.length ? "success" : collected.every((c) => c.errors.length) ? "failed" : "partial",
      records_fetched: totalFetched,
      records_parsed: 0,
      records_written: 0,
      error_sample: errorSample(),
    });
    res.status(200).json({ upserted: 0, withdrawn, checked: totalFetched, skippedOutsideOrbit, funnels, failed, fetchedAt: new Date().toISOString() });
    return;
  }

  const venueMaps = await buildVenueDetailsMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const rawRows = parsed.map((e) => {
    const { _rawVenueName, _runDays, ...row } = e;
    // A venue is linked by its exact name, and only when BOTH the event and
    // the venue on file state a city for the lookup to check one against the
    // other. Never by address: a campus has one street address and many
    // buildings, and a link by address made every one of them "Macomb Center
    // for the Performing Arts".
    const venue = e.venue_city_raw && _rawVenueName ? resolveVenueFromCandidate({ name: _rawVenueName, address: null, city: e.venue_city_raw }, venueMaps) : null;
    return { ...row, venue_name_raw: _rawVenueName, venue_id: venue && !isBlank(venue.city) ? venue.id : null };
  });

  // De-dupe by external_id -- same reasoning as every other cron here.
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  try {
    let existingByExternalId;
    try {
      existingByExternalId = await lookupExistingRows(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        rows.map((r) => r.external_id),
        { select: STORED_SELECT }
      );
    } catch (lookupErr) {
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: 502,
        records_fetched: totalFetched,
        records_parsed: rows.length,
        error_sample: "Status lookup failed: " + lookupErr.message,
      });
      res.status(502).json({ upserted: 0, withdrawn, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
      return;
    }
    let restored = 0;
    const rowsWithStatus = rows.map((row) => {
      const { _defaultStatusForRow, _categoryConfident, ...rest } = row;
      const stored = existingByExternalId.get(row.external_id);
      if (!stored) return { ...rest, status: _defaultStatusForRow };
      const keep = statusToKeep(stored);
      if (keep.restored) restored++;
      return { ...mergeWithStored(rest, stored, _categoryConfident, venueMaps), status: keep.status };
    });
    const newRows = rowsWithStatus.filter((row) => !existingByExternalId.has(row.external_id)).length;

    const resp = await upsertEventRows(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, rowsWithStatus);
    if (!resp.ok) {
      const errText = await resp.text();
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: resp.status,
        records_fetched: totalFetched,
        records_parsed: rows.length,
        records_written: resp.written,
        error_sample: "Supabase upsert failed: " + errText,
      });
      res.status(502).json({ upserted: resp.written, error: "Supabase upsert failed: " + errText });
      return;
    }

    await finishRun(runHandle, {
      outcome: failed.length ? "partial" : "success",
      http_status: resp.status,
      records_fetched: totalFetched,
      records_parsed: rows.length,
      records_written: rowsWithStatus.length,
      error_sample: errorSample(),
    });
    res.status(200).json({
      upserted: rowsWithStatus.length,
      newRows,
      restored,
      withdrawn,
      checked: totalFetched,
      skippedOutsideOrbit,
      funnels,
      failed,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    await finishRun(runHandle, {
      outcome: "failed",
      records_fetched: totalFetched,
      records_parsed: rows.length,
      error_sample: err.message,
    });
    res.status(500).json({ upserted: 0, withdrawn, error: err.message });
  }
};

// Exposed for the tests.
module.exports.TENANTS = TENANTS;
module.exports.MAX_PAGES_PER_TENANT = MAX_PAGES_PER_TENANT;
module.exports.MAX_DETAIL_FETCHES_PER_TENANT = MAX_DETAIL_FETCHES_PER_TENANT;
module.exports.fetchTenantEvents = fetchTenantEvents;
module.exports.fetchEventSchedule = fetchEventSchedule;
module.exports.collectTenant = collectTenant;
module.exports.mergeWithStored = mergeWithStored;
module.exports.WITHDRAWN_PREFIX = WITHDRAWN_PREFIX;
module.exports.KEPT_PREFIX = KEPT_PREFIX;
module.exports.detroitToday = detroitToday;
module.exports.parseLocalistLocation = parseLocalistLocation;
module.exports.mapCategory = mapCategory;
module.exports.formatTimeDisplay = formatTimeDisplay;
module.exports.ORBIT_MILES = ORBIT_MILES;
module.exports.HORIZON_DAYS = HORIZON_DAYS;
