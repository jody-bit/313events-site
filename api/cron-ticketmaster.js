// Vercel Cron job — runs on a schedule (see vercel.json) rather than being
// called from the browser. Pulls Detroit-area events from the Ticketmaster
// Discovery API and upserts them straight into Supabase as status='approved'
// events, keyed on external_id so re-runs update existing rows instead of
// duplicating them.
//
// Protect this endpoint: set CRON_SECRET in Vercel's Environment Variables.
// Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when it
// invokes scheduled functions once that env var exists — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs

const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Geographic radius search, not a city allowlist — 313.events' coverage area
// is a 75-mile radius from Detroit's center (see SERVICE_AREA.md), which pulls
// in dozens of cities/townships (Ann Arbor, Pontiac, Windsor ON, Toledo OH,
// etc.) that a hardcoded city list would have silently dropped.
//
// Verified against Ticketmaster's own Discovery API docs (2026-08-25):
// latlong+radius+unit is real and currently works (default radius is even
// 100 "miles", so 75 fits), and size=200 * page<5 stays under their
// "size*page < 1000" deep-paging cap. One thing to revisit later: the docs
// flag `latlong` as "maybe removed in a future release, please use geoPoint
// instead" (a geohash string) — not urgent since it still works today, but
// worth switching before Ticketmaster actually pulls the plug. Center point
// and radius match SERVICE_AREA.md exactly so this stays in sync with that
// document if the radius or center ever changes.
const CENTER_LAT = 42.3314;
const CENTER_LON = -83.0458;
const RADIUS_MILES = 75;

// Ticketmaster segment/genre -> this calendar's category keys.
// Sports is intentionally excluded — out of scope for an arts/culture/nightlife calendar.
function mapCategory(classifications) {
  const c = (classifications && classifications[0]) || {};
  const segment = (c.segment && c.segment.name) || "";
  const genre = (c.genre && c.genre.name) || "";

  if (segment === "Music") {
    if (/comedy/i.test(genre)) return "theatre";
    return "music";
  }
  if (segment === "Arts & Theatre") {
    if (/dance|ballet/i.test(genre)) return "dance";
    if (/comedy/i.test(genre)) return "theatre";
    if (/theatre|musical/i.test(genre)) return "theatre";
    if (/visual|fine art/i.test(genre)) return "visual";
    return "theatre";
  }
  if (segment === "Film") return "film";
  if (segment === "Miscellaneous" && /family/i.test(genre)) return "family";
  return null; // includes Sports, and anything else unmapped -> excluded
}

function formatTime(dateObj) {
  if (!dateObj || !dateObj.localTime) return "Evening";
  const [h, m] = dateObj.localTime.split(":");
  let hour = parseInt(h, 10);
  const ap = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m} ${ap}`;
}

async function fetchTicketmasterEvents() {
  const today = new Date();
  const endWindow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days out
  const startDateTime = today.toISOString().slice(0, 19) + "Z";
  const endDateTime = endWindow.toISOString().slice(0, 19) + "Z";

  const allEvents = [];
  for (let page = 0; page < 5; page++) {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", TICKETMASTER_API_KEY);
    url.searchParams.set("latlong", `${CENTER_LAT},${CENTER_LON}`);
    url.searchParams.set("radius", String(RADIUS_MILES));
    url.searchParams.set("unit", "miles");
    url.searchParams.set("startDateTime", startDateTime);
    url.searchParams.set("endDateTime", endDateTime);
    url.searchParams.set("size", "200");
    url.searchParams.set("page", String(page));

    const r = await fetch(url.toString());
    if (!r.ok) break;
    const data = await r.json();
    const events = (data._embedded && data._embedded.events) || [];
    allEvents.push(...events);
    const totalPages = (data.page && data.page.totalPages) || 1;
    if (page + 1 >= totalPages) break;
  }
  return allEvents;
}

function shapeForDb(e) {
  const cat = mapCategory(e.classifications);
  if (!cat) return null;

  const venue0 = e._embedded && e._embedded.venues && e._embedded.venues[0];
  const venueName = venue0 ? venue0.name : "Venue TBA";
  const venueCity = venue0 && venue0.city ? venue0.city.name : null;
  // No city allowlist here on purpose — the latlong+radius params above
  // already constrain results geographically, so every venue Ticketmaster
  // returns is already within the 75-mile service area. venueCity IS still
  // captured (into venue_city_raw below) so the site can display it — a
  // 75-mile radius pulls in Rochester Hills, Sterling Heights, Clarkston,
  // etc., and without a visible city label those all silently read as
  // Detroit on the calendar. See migration_006.

  const start = e.dates && e.dates.start;
  if (!start || !start.localDate) return null;

  const priceRange = e.priceRanges && e.priceRanges[0];

  return {
    external_id: e.id,
    title: e.name,
    category: cat,
    venue_name_raw: venueName,
    venue_city_raw: venueCity,
    start_date: start.localDate,
    time_display: formatTime(start),
    is_free: false,
    price_from: priceRange ? priceRange.min : null,
    ticket_url: e.url || null,
    source: "Ticketmaster",
    status: "approved",
  };
}

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  if (!TICKETMASTER_API_KEY) {
    res.status(200).json({ upserted: 0, error: "TICKETMASTER_API_KEY not configured" });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  let raw;
  try {
    raw = await fetchTicketmasterEvents();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Ticketmaster fetch failed: " + err.message });
    return;
  }

  const rows = raw.map(shapeForDb).filter(Boolean);
  if (!rows.length) {
    res.status(200).json({ upserted: 0, fetchedAt: new Date().toISOString() });
    return;
  }

  try {
    // Upsert on external_id — see the unique index in supabase/schema.sql.
    // merge-duplicates updates existing rows (e.g. a venue/time change)
    // instead of erroring or duplicating on re-runs.
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }

    res.status(200).json({ upserted: rows.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
