const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingStatuses } = require("./_lib/status-lookup");
const { upsertEventRows } = require("./_lib/event-upsert");
const { milesFromDetroitBorder } = require("./_lib/detroit-boundary");
const { knownCity } = require("./_lib/orbit-cities");

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
// RECURRENCE / EXTERNAL_ID: a Localist "event" can carry multiple
// `event_instances` (one per occurrence of a recurring series). This
// project's `events` table is occurrence-level (one row per occurrence,
// same model as cron-gottagacha.js's per-date rows), so this connector
// emits one row per event_instance, not one per event. external_id is
// `localist-${tenantSlug}-${instanceId}` -- the tenant prefix matters
// here specifically because Localist's own instance ids are only unique
// WITHIN one tenant's install, not globally (unlike Eventbrite's globally
// unique event ids), so two different campuses could otherwise collide on
// the same numeric id.
//
// CATEGORY: unlike cron-eventbrite.js (where Eventbrite's taxonomy has no
// usable structural signal at all), Localist's `event.filters.event_types`
// is a real, structured, per-tenant-configurable taxonomy. mapCategory()
// below maps only the handful of type names actually confirmed in this
// pass or standard enough across Localist installs to be high-confidence
// ("Concerts & Performances" was directly observed on a real Macomb
// Community College event during this verification pass; the others are
// Localist's own common default type names, not invented). Anything else
// -- including a tenant's own custom/renamed types, which this adapter has
// no way to know in advance -- falls through to the same
// placeholder-category + pending_review pattern every other connector
// uses for a genuinely unclassifiable row, never a guess. Expect this list
// to need real tuning once each tenant's actual configured type list is
// observed live; see the stress-test report for what a live pilot would
// need to validate first.
//
// FIELDS DELIBERATELY LEFT NULL/DEFAULT (not demonstrated as reliably
// present across Localist installs in this research pass -- never
// invented):
//   ticket_url  — some tenants attach a ticketing custom field, but its
//                 name/shape isn't standardized across installs; only
//                 mapped when the API itself returns a plain `ticket_url`
//                 string, never guessed from description text.
//   price_from  — no structured, cross-tenant-reliable cost field
//                 confirmed; left null rather than regexed out of
//                 free-text custom fields.
//   is_free     — same reasoning; left at the schema default (false)
//                 rather than inferred from the absence of a price field.
//
// VENUE RESOLUTION: identical path as every other connector
// (buildVenueNameToIdMap/resolveVenueId) -- exact normalized name match
// only, never fuzzy, never auto-created. Campus buildings/rooms are
// expected to mostly NOT match anything in `venues` today; that's the
// stress-test finding this adapter exists partly to surface, not something
// this file works around.

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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const SOURCE_SLUG = SLUGS.localist;
const AMBIGUOUS_STATUS = "pending_review";
const AMBIGUOUS_CATEGORY = "community"; // migration_009b's documented catch-all
const MAX_PAGES_PER_TENANT = 10; // bounded pagination -- see header
const PAGE_SIZE = 100;

// Config-driven, multi-tenant registry -- see header for how each entry
// was verified. `source` is this tenant's own institutional identity
// (DEC-005: events.source records where a listing was found; here that is
// genuinely each institution's own calendar, not a shared third-party
// platform the way Eventbrite is -- so unlike cron-eventbrite.js's single
// "Eventbrite" literal, this is per-tenant).
const TENANTS = Object.freeze([
  Object.freeze({ tenantSlug: "bgsu", apiBase: "https://events.bgsu.edu", source: "Bowling Green State University" }),
  Object.freeze({ tenantSlug: "macomb", apiBase: "https://events.macomb.edu", source: "Macomb Community College" }),
]);

// Confirmed-or-standard Localist event_type names -> this project's
// category enum. First-match-wins against every name in
// event.filters.event_types. See header CATEGORY note -- "Concerts &
// Performances" is directly observed (Macomb); the rest are Localist's
// own common default type names, kept deliberately narrow.
const EVENT_TYPE_CATEGORY_RULES = [
  [/^concerts?\s*(&|and)?\s*performances?$/i, "music"],
  [/^music$/i, "music"],
  [/^film/i, "film"],
  [/^(athletics|sports)$/i, "sports"],
];

function mapCategory(eventTypes) {
  if (!Array.isArray(eventTypes)) return null;
  for (const name of eventTypes) {
    if (typeof name !== "string") continue;
    for (const [re, category] of EVENT_TYPE_CATEGORY_RULES) {
      if (re.test(name.trim())) return category;
    }
  }
  return null;
}

// Mirrors cron-eventbrite.js's formatTimeDisplay() -- reads HH:MM directly
// out of Localist's own ISO-with-offset instance datetime strings (e.g.
// "2026-11-05T19:00:00-05:00") rather than constructing a Date, same
// reasoning: the source already encodes local wall-clock time, so no
// timezone math is needed or safe to attempt here.
function formatTimeDisplay(startIso, endIso) {
  if (!startIso || startIso.length < 16) return null;
  const startHM = startIso.slice(11, 16);
  const fmt = (hm) => {
    const [hStr, mStr] = hm.split(":");
    let h = parseInt(hStr, 10);
    if (isNaN(h)) return null;
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${mStr} ${ap}`;
  };
  const startFmt = fmt(startHM);
  if (!startFmt) return null;
  if (endIso && endIso.length >= 16) {
    const endHM = endIso.slice(11, 16);
    if (endHM !== startHM) {
      const endFmt = fmt(endHM);
      if (endFmt) return `${startFmt} – ${endFmt}`;
    }
  }
  return startFmt;
}

// ---- BUG-013 (2026-10-04): where the event is ---------------------------
//
// Until this change the connector read `e.venue_name` / `e.venue.name`.
// Neither exists in what the API returns. Measured on the live Macomb
// Community College API on 2026-10-04 (100 events, 30-day window): the
// place is in three other fields --
//   location_name  "Center Campus, C Building"                      (85 of 100)
//   address        "44575 Garfield Road, Clinton Township, MI 48038" (85 of 100)
//   geo            { latitude, longitude, street, city, state, zip }
// -- so every row was written with no venue, no address and no city, and
// every one of them (11 on 2026-10-04) was queued in Admin for a missing
// location. An away game was indistinguishable from a campus event.
//
// What is read, and how far it is trusted:
//   - the venue name is location_name (then the older `location`, then the
//     venue_name fields the original code expected, in case a tenant has
//     them);
//   - street and city come from `address`, which is "<street>, <city>, <ST>
//     <ZIP>": the last comma-separated part must be a state (and ZIP), the
//     one before it is the city, everything before that is the street.
//     The city must be a name on the closed list for that state
//     (api/_lib/orbit-cities.js) -- "K Building, South Campus, MI 48088"
//     does not make South Campus a city. The street must begin with a house
//     number AND contain a street type, because tenants also put a
//     building, a floor or a room there (Bowling Green State University,
//     same day: "Jerome Library, Bowling Green, OH 43403"; "Bowen-Thompson
//     Student Union 1001 E Wooster St , Bowling Green, OH 43402" -- the
//     building name is dropped from the front of the street when it merely
//     repeats the venue; "2nd Floor" and "101 Olscamp Hall" are not
//     streets). Anything else is left alone -- never guessed;
//   - geo.city fills in only when `address` gave no city ("One University
//     Drive Huron, Ohio 44839" has no comma before the city; geo.city says
//     Huron), and only when it too is on the list for geo.state. geo.street
//     is NOT used: it is a geocoder fragment ("J" for "South Campus, J
//     Building");
//   - geo's coordinates decide one thing only: an event more than
//     ORBIT_MILES from Detroit's border is not a Detroit Orbit event
//     (SERVICE_AREA.md) and is not written. The handler counts those.
//     An event with no coordinates is kept: absence of a location is not
//     evidence of distance. Neither is a bad geocode -- coordinates outside
//     North America (0,0; a dropped minus sign; latitude and longitude
//     swapped) are treated as no coordinates at all.
//   - a field the source did not give is LEFT OUT of the row, not sent as
//     null: a null would overwrite an address or city already stored on the
//     event (api/_lib/event-upsert.js; DEBT-011). The other side of that
//     choice, accepted: if a source later REMOVES an address from an event
//     it already sent, the stored one stays. Which of the two a connector
//     may do is a per-field decision recorded under DEBT-011.
const ORBIT_MILES = 75; // SERVICE_AREA.md; same figure as cron-ticketmaster.js's RADIUS_MILES
// A real state or province code, optionally with a ZIP -- not any two
// letters ("University Center, UC" is not a city and a state).
const STATE_ZIP_RE =
  /^(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|ON|QC|BC|AB|MB|SK|NS|NB|NL|PE)(?:\s+\d{5}(?:-\d{4})?)?$/;
// "<house number> ... <street type>": a street, not "2nd Floor" or "101 Olscamp Hall".
const NUMBERED_STREET_RE =
  /^\d+[A-Za-z]?\s.*\b(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Lane|Ln|Court|Ct|Circle|Cir|Way|Highway|Hwy|Parkway|Pkwy|Place|Pl|Terrace|Ter)\b\.?/;

function cleanString(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseLocalistLocation(e) {
  if (!e || typeof e !== "object") return { name: null, street: null, city: null, milesFromDetroit: null, outsideOrbit: false };
  const geo = e.geo && typeof e.geo === "object" ? e.geo : {};
  const name =
    cleanString(e.location_name) ||
    cleanString(e.location) ||
    cleanString(e.venue_name) ||
    (e.venue && typeof e.venue === "object" ? cleanString(e.venue.name) : null);

  let street = null;
  let city = null;
  const address = cleanString(e.address);
  if (address) {
    const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
    const stateZip = parts.length >= 2 ? STATE_ZIP_RE.exec(parts[parts.length - 1]) : null;
    const listedCity = stateZip ? knownCity(parts[parts.length - 2], parts[parts.length - 1].slice(0, 2)) : null;
    if (listedCity) {
      city = listedCity;
      const before = parts.slice(0, -2);
      // The street is the first part that is a numbered street
      // ("123 Main St, 2nd Floor, Warren, MI" -> "123 Main St").
      street = before.find((part) => NUMBERED_STREET_RE.test(part)) || null;
      if (!street && name && before.length) {
        // A tenant may repeat the building in front of the street, with no
        // comma: "Bowen-Thompson Student Union 1001 E Wooster St". Only a
        // whole-name prefix followed by a space is dropped.
        const joined = before.join(", ");
        if (joined.toLowerCase().startsWith(name.toLowerCase() + " ")) {
          const rest = joined.slice(name.length).trim();
          if (NUMBERED_STREET_RE.test(rest)) street = rest;
        }
      }
    }
  }
  if (!city) city = knownCity(cleanString(geo.city), cleanString(geo.state));

  const lat = Number.parseFloat(geo.latitude);
  const lng = Number.parseFloat(geo.longitude);
  // Plausible for North America only; anything else is a bad geocode.
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && lat >= 24 && lat <= 60 && lng >= -141 && lng <= -52;
  const milesFromDetroit = hasCoordinates ? milesFromDetroitBorder(lat, lng) : null;

  return {
    name,
    street,
    city,
    milesFromDetroit,
    outsideOrbit: milesFromDetroit !== null && milesFromDetroit > ORBIT_MILES,
  };
}

// Pure parse of one Localist "event" object (as returned by
// GET /api/2/events, each array entry shaped { event: {...} }) into ZERO
// OR MORE row objects -- one per event_instance (see header RECURRENCE
// note). Returns [] for a structurally unusable event (no id, no title, or
// no usable instances). Exported for direct unit testing.
function parseEvent(e, tenant) {
  if (!e || typeof e !== "object") return [];
  const title = typeof e.title === "string" ? e.title.trim() : null;
  if (!e.id || !title) return [];
  const instances = Array.isArray(e.event_instances) ? e.event_instances : [];
  if (!instances.length) return [];

  const description =
    typeof e.description_text === "string" && e.description_text.trim()
      ? e.description_text.trim()
      : null;

  const eventTypes =
    e.filters && Array.isArray(e.filters.event_types)
      ? e.filters.event_types.map((t) => (t && typeof t === "object" ? t.name : t)).filter((n) => typeof n === "string")
      : [];
  const category = mapCategory(eventTypes);
  const isAmbiguous = category === null;

  // BUG-013: the place, from the fields the API really sends.
  const place = parseLocalistLocation(e);
  const venueName = place.name;

  const isRecurring = instances.length > 1;
  const localistUrl = typeof e.localist_url === "string" ? e.localist_url : null;
  const imageUrl = typeof e.photo_url === "string" && e.photo_url.trim() ? e.photo_url.trim() : null;
  const ticketUrl = typeof e.ticket_url === "string" && e.ticket_url.trim() ? e.ticket_url.trim() : null;

  const notes = isAmbiguous
    ? [`Category not mappable from this tenant's configured Localist event types (event: "${title}") -- needs manual categorization.`]
    : [];

  const rows = [];
  for (const wrapper of instances) {
    const inst = wrapper && typeof wrapper === "object" ? wrapper.event_instance || wrapper : null;
    if (!inst || typeof inst !== "object") continue;
    const startIso = typeof inst.start === "string" ? inst.start : null;
    if (!inst.id || !startIso) continue;
    rows.push({
      external_id: `localist-${tenant.tenantSlug}-${inst.id}`,
      title,
      description,
      category: category || AMBIGUOUS_CATEGORY,
      start_date: startIso.slice(0, 10),
      time_display: inst.all_day === true ? null : formatTimeDisplay(startIso, typeof inst.end === "string" ? inst.end : null),
      is_recurring: isRecurring,
      is_all_day: inst.all_day === true,
      is_free: false, // see header -- not reliably available cross-tenant, never guessed
      price_from: null, // see header -- not reliably available cross-tenant, never guessed
      ticket_url: ticketUrl,
      event_url: localistUrl,
      image_url: imageUrl,
      source: tenant.source,
      internal_note: notes.length ? notes.join(" ") : null,
      _rawVenueName: venueName,
      venue_address_raw: place.street,
      venue_city_raw: place.city,
      // Read by the handler and never written: an event held outside the
      // Orbit (an away game, a trip) is not a Detroit Orbit event.
      _outsideOrbit: place.outsideOrbit,
      // Every confirmed tenant is brand new with zero production track
      // record, so EVERY row -- classified or not -- is pending_review
      // for now (always AMBIGUOUS_STATUS, regardless of isAmbiguous),
      // the same "new, unproven source earns human review first" posture
      // cron-metrotimes.js/cron-poppspacking.js already use for
      // aggregator-like sources. This is a per-tenant trust decision, not
      // a structural limitation of the parser: a tenant with a real,
      // confirmed-accurate track record could later earn its own
      // DEFAULT_STATUS = "approved" the way cron-gottagacha.js's
      // first-party-API trust tier does, without touching parseEvent()'s
      // shape at all.
      _defaultStatusForRow: AMBIGUOUS_STATUS,
    });
  }
  return rows;
}

function tenantEventsUrl(tenant, page) {
  const params = new URLSearchParams({ pp: String(PAGE_SIZE), page: String(page) });
  return `${tenant.apiBase}/api/2/events?${params.toString()}`;
}

// Fetches every page (bounded by MAX_PAGES_PER_TENANT) of one tenant's
// upcoming events. Terminates when a page returns fewer than PAGE_SIZE
// events (a normal "last page") rather than depending on any particular
// total-count/page-count field name, since that wasn't independently
// confirmed for either tenant in this pass -- a conservative, verifiable
// termination rule over trusting an unverified response field. Returns
// { events, error } -- same contract as cron-eventbrite.js's
// fetchOrganizerEvents.
async function fetchTenantEvents(tenant) {
  const events = [];
  for (let page = 1; page <= MAX_PAGES_PER_TENANT; page++) {
    let r;
    try {
      r = await fetch(tenantEventsUrl(tenant, page), { headers: { "User-Agent": "313.events event calendar" } });
    } catch (err) {
      return { events, error: "Fetch failed: " + err.message };
    }
    if (!r.ok) {
      return { events, error: `Fetch failed: HTTP ${r.status}` };
    }
    let data;
    try {
      data = await r.json();
    } catch (err) {
      return { events, error: "Unparseable JSON response: " + err.message };
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.events)) {
      return { events, error: "Unexpected API response shape (events was not an array)" };
    }
    const pageEvents = data.events.map((w) => (w && typeof w === "object" ? w.event || w : null)).filter(Boolean);
    events.push(...pageEvents);
    if (pageEvents.length < PAGE_SIZE) break;
  }
  return { events, error: null };
}

module.exports = async (req, res) => {
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

  const failed = [];
  let totalFetched = 0;
  const allParsed = [];

  // Single aggregate run across every configured tenant -- same
  // "one source_runs row per invocation" convention as cron-feeds.js and
  // cron-eventbrite.js. A per-tenant failure never aborts the other
  // tenants in this same run; it is recorded in `failed`.
  for (const tenant of TENANTS) {
    const { events, error } = await fetchTenantEvents(tenant);
    totalFetched += events.length;
    if (error) failed.push({ tenant: tenant.tenantSlug, error });
    for (const e of events) {
      for (const row of parseEvent(e, tenant)) allParsed.push(row);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const current = allParsed.filter((e) => e.start_date >= today);
  // BUG-013: not written, and counted -- reported in this run's response.
  const skippedOutsideOrbit = current.filter((e) => e._outsideOrbit).length;
  if (skippedOutsideOrbit) console.log(`[cron-localist] ${skippedOutsideOrbit} event(s) outside the ${ORBIT_MILES}-mile Orbit were not written`);
  const parsed = current.filter((e) => !e._outsideOrbit);

  if (!parsed.length) {
    await finishRun(runHandle, {
      outcome: failed.length ? "partial" : "success",
      records_fetched: totalFetched,
      records_parsed: 0,
      records_written: 0,
      error_sample: failed.length ? failed.map((f) => `${f.tenant}: ${f.error}`).join("; ") : undefined,
    });
    res.status(200).json({ upserted: 0, checked: totalFetched, skippedOutsideOrbit, failed, fetchedAt: new Date().toISOString() });
    return;
  }

  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const rawRows = parsed.map((e) => {
    const { _rawVenueName, _defaultStatusForRow, _outsideOrbit, ...row } = e;
    // Not given by the source: left out, never sent as null (see header).
    if (row.venue_address_raw === null) delete row.venue_address_raw;
    if (row.venue_city_raw === null) delete row.venue_city_raw;
    return {
      ...row,
      venue_name_raw: _rawVenueName,
      venue_id: resolveVenueId(venueMap, _rawVenueName),
      _defaultStatusForRow,
    };
  });

  // De-dupe by external_id -- same reasoning as every other cron here.
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  try {
    let existingStatusByExternalId;
    try {
      existingStatusByExternalId = await lookupExistingStatuses(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        rows.map((r) => r.external_id)
      );
    } catch (lookupErr) {
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: 502,
        records_fetched: totalFetched,
        records_parsed: parsed.length,
        error_sample: "Status lookup failed: " + lookupErr.message,
      });
      res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
      return;
    }
    const rowsWithStatus = rows.map((row) => {
      const { _defaultStatusForRow, ...rest } = row;
      return { ...rest, status: existingStatusByExternalId.get(row.external_id) || _defaultStatusForRow };
    });

    const resp = await upsertEventRows(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, rowsWithStatus);
    if (!resp.ok) {
      const errText = await resp.text();
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: resp.status,
        records_fetched: totalFetched,
        records_parsed: parsed.length,
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
      records_parsed: parsed.length,
      records_written: rowsWithStatus.length,
      error_sample: failed.length ? failed.map((f) => `${f.tenant}: ${f.error}`).join("; ") : undefined,
    });
    res.status(200).json({ upserted: rowsWithStatus.length, checked: totalFetched, skippedOutsideOrbit, failed, fetchedAt: new Date().toISOString() });
  } catch (err) {
    await finishRun(runHandle, {
      outcome: "failed",
      records_fetched: totalFetched,
      records_parsed: parsed.length,
      error_sample: err.message,
    });
    res.status(500).json({ upserted: 0, error: err.message });
  }
};

module.exports.parseEvent = parseEvent; // exposed for test/cron-localist-runlog.test.js only
module.exports.parseLocalistLocation = parseLocalistLocation; // exposed for test/cron-localist-location.test.js only
module.exports.ORBIT_MILES = ORBIT_MILES;
module.exports.mapCategory = mapCategory; // exposed for test/cron-localist-runlog.test.js only
module.exports.formatTimeDisplay = formatTimeDisplay; // exposed for test/cron-localist-runlog.test.js only
module.exports.fetchTenantEvents = fetchTenantEvents; // exposed for test/cron-localist-runlog.test.js only
module.exports.TENANTS = TENANTS; // exposed for test/cron-localist-runlog.test.js only
module.exports.MAX_PAGES_PER_TENANT = MAX_PAGES_PER_TENANT; // exposed for test/cron-localist-runlog.test.js only
