const crypto = require("crypto");
// Vercel serverless function powering admin.html's venue autofill (2026-09-04)
// — Jody asked for a way to speed up filling in Venue/Street address/City on
// the "create event from article" form, since the same handful of venues
// (galleries, theaters, etc.) send press coverage over and over and she was
// retyping the same address every time.
//
// GET /api/admin-venues -> { venues: [{ name, address, city }, ...] }
//
// Two sources, merged:
//   1. The curated `venues` table (name/address/city) — hand-maintained,
//      sparse (see AUDIT_AND_ARCHITECTURE.md), but authoritative where it
//      exists.
//   2. The `events` table itself — every event any moderator or cron has
//      ever saved with a venue_address_raw is a real, already-typed address
//      for that venue name. This is what makes the feature self-growing:
//      the first time Jody types "Office Space Gallery"'s address by hand,
//      it's suggested automatically the next time that venue shows up in a
//      press article, with zero separate maintenance step. De-duplicated by
//      lowercased venue name, most-recently-updated row wins when the same
//      venue was entered more than once (e.g. an address typo fixed later).
//
// Where both sources name the same venue, the curated `venues` table wins
// (source 1 checked first, source 2 only fills in names it doesn't already
// have) — it's the one Jody or a past cleanup pass deliberately curated.
//
// Same ADMIN_SECRET header-auth pattern as every other admin-*.js endpoint,
// even though venue names/addresses aren't sensitive — kept consistent
// rather than carving out a public exception for one endpoint.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Timing-safe secret comparison — see api/admin-events.js's identical
// comment for why this isn't a plain `!==`.
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

function checkAuth(req, res) {
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: "ADMIN_SECRET not configured on the server." });
    return false;
  }
  const provided = req.headers["x-admin-secret"];
  if (!timingSafeStringEqual(provided || "", ADMIN_SECRET)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Database not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." });
    return;
  }
  if (!checkAuth(req, res)) return;

  const sbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  try {
    const byName = new Map(); // lowercased name -> { name, address, city }

    // Source 1: the curated venues table — checked first so it wins ties.
    const venuesResp = await fetch(
      `${SUPABASE_URL}/rest/v1/venues?select=name,address,city&limit=1000`,
      { headers: sbHeaders }
    );
    if (venuesResp.ok) {
      const rows = await venuesResp.json();
      if (Array.isArray(rows)) {
        rows.forEach((v) => {
          if (!v.name) return;
          const key = v.name.trim().toLowerCase();
          if (!key) return;
          byName.set(key, { name: v.name.trim(), address: v.address || null, city: v.city || null });
        });
      }
    }

    // Source 2: real events that already carry a street address — most
    // recently updated first, so a later correction to an address wins over
    // an older entry for the same venue name. Only fills names source 1
    // didn't already provide.
    const eventsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/events?venue_address_raw=not.is.null&select=venue_name_raw,venue_address_raw,venue_city_raw,updated_at&order=updated_at.desc&limit=500`,
      { headers: sbHeaders }
    );
    if (eventsResp.ok) {
      const rows = await eventsResp.json();
      if (Array.isArray(rows)) {
        rows.forEach((e) => {
          if (!e.venue_name_raw) return;
          const key = e.venue_name_raw.trim().toLowerCase();
          if (!key || byName.has(key)) return;
          byName.set(key, {
            name: e.venue_name_raw.trim(),
            address: e.venue_address_raw || null,
            city: e.venue_city_raw || null,
          });
        });
      }
    }

    const venues = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
    res.status(200).json({ venues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
