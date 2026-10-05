// test/fixtures/localist-api.js — a small stand-in for one Localist tenant's
// v2 API, behaving the way both production tenants were measured to behave on
// 2026-10-04/05 (see api/_lib/localist-rows.js):
//
//   GET /api/2/events?days=N&pp=P&page=K
//       one entry PER OCCURRENCE between the tenant's "today" and N days on,
//       each entry the whole event with exactly ONE event_instance; plus
//       { page: { current, size, total, total_items }, date: { first, last } }.
//       An occurrence before today is never listed.
//   GET /api/2/events/{id}
//       the event with EVERY instance it has, past ones included.
//
// The fake holds each event with its full schedule and a movable "today", so
// a test can run the connector on consecutive days against the same events --
// which is the only way to show that a row keeps its name from one day to the
// next.
"use strict";

function isoPlusDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

let nextId = 54134692500000;
const newId = () => (nextId += 1025); // Localist ids are large and not consecutive

// One instance. `time` is "HH:MM" or null for all_day; `end` likewise, or a
// full ISO string for an instance that ends on another day.
function instance(date, time, end, extra) {
  const offset = date >= "2026-11-01" && date < "2027-03-14" ? "-05:00" : "-04:00";
  const allDay = time === null || time === undefined;
  const start = `${date}T${allDay ? "00:00" : time}:00${offset}`;
  let endIso = null;
  if (end && end.length > 5) endIso = end;
  else if (end) endIso = `${date}T${end}:00${offset}`;
  return { id: newId(), start, end: endIso, all_day: allDay, ranking: 0, ...extra };
}

// `n` consecutive days from `from`, the same hours each day.
function daily(from, n, time, end) {
  return Array.from({ length: n }, (_, i) => instance(isoPlusDays(from, i), time, end));
}

// An event as the API returns it (field names and value styles as observed).
// `over` replaces any field; `instances` is its full schedule.
function event(title, over = {}) {
  const id = newId();
  const { instances = [], audiences = ["General Public", "Students"], types = ["Community"], ...rest } = over;
  return {
    id,
    title,
    url: null,
    updated_at: "2026-10-01T09:12:44-04:00",
    created_at: "2026-09-12T15:02:10-04:00",
    facebook_id: null,
    first_date: instances.length ? instances[0].start.slice(0, 10) : null,
    last_date: instances.length ? instances[instances.length - 1].start.slice(0, 10) : null,
    hashtag: "",
    urlname: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    user_id: 1,
    directions: "",
    allows_reviews: false,
    allows_attendance: false,
    location: "",
    room_number: "",
    location_name: "",
    status: "live",
    experience: "inperson",
    stream_url: "",
    stream_info: "",
    created_by: 1,
    updated_by: 1,
    kind: "standalone",
    recurring: instances.length > 1,
    free: false,
    private: false,
    verified: true,
    rejected: false,
    sponsored: false,
    venue_id: null,
    ticket_url: "",
    ticket_cost: "",
    keywords: [],
    tags: [],
    description_text: `${title}. Open to all.`,
    description: `<p>${title}. Open to all.</p>`,
    photo_id: 1,
    detail_views: 0,
    address: "",
    custom_fields: {},
    geo: { latitude: null, longitude: null, street: null, city: null, state: null, country: null, zip: null },
    filters: {
      event_target_audience: audiences.map((name, i) => ({ name, id: 900 + i })),
      event_types: types.map((name, i) => ({ name, id: 800 + i })),
    },
    localist_url: `https://events.example.edu/event/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    localist_ics_url: `https://events.example.edu/event/${id}.ics`,
    photo_url: `https://localist-images.azureedge.net/photos/${id}/huge/photo.jpg`,
    venue_url: null,
    ...rest,
    _schedule: instances,
  };
}

// Real places, as the two tenants give them.
const PLACES = {
  // Macomb Community College: a Localist "place" with an address and a geocode.
  CENTER_CAMPUS: {
    location_name: "Center Campus, C Building",
    address: "44575 Garfield Road, Clinton Township, MI 48038",
    venue_id: 33111,
    geo: { latitude: "42.62191", longitude: "-82.956398", street: "44575 Garfield Road", city: null, state: "MI", country: "US", zip: "48038" },
  },
  SOUTH_CAMPUS_J: {
    location_name: "South Campus, J Building",
    address: "14500 E. 12 Mile Road, Warren, MI 48088",
    venue_id: 33112,
    geo: { latitude: "42.5055", longitude: "-82.9713", street: "J", city: "Warren", state: "MI", country: "US", zip: "48088" },
  },
  MACOMB_CENTER: {
    location_name: "Macomb Center for the Performing Arts",
    address: "44575 Garfield Road, Clinton Township, MI 48038",
    venue_id: 33113,
    geo: { latitude: "42.6209", longitude: "-82.9551", street: "44575 Garfield Road", city: null, state: "MI", country: "US", zip: "48038" },
  },
  // Bowling Green State University: a place on campus.
  JEROME_LIBRARY: {
    location_name: "Jerome Library",
    address: "Jerome Library, Bowling Green, OH 43403",
    venue_id: 44001,
    geo: { latitude: "41.376503", longitude: "-83.635107", street: null, city: "Bowling Green", state: "OH", country: "US", zip: "43403" },
  },
  FINE_ARTS: {
    location_name: "Fine Arts Center",
    address: "1000 Fine Arts Center, Bowling Green, OH 43403",
    venue_id: 44002,
    geo: { latitude: "41.379", longitude: "-83.633", street: null, city: "Bowling Green", state: "OH", country: "US", zip: "43403" },
  },
  // ...and its athletics schedule: text only, no address, no coordinates.
  HOME_STROH: { location_name: "Bowling Green, Ohio, Stroh Center", location: "Bowling Green, Ohio, Stroh Center" },
  AWAY_KALAMAZOO: { location_name: "Kalamazoo, Mich.", location: "Kalamazoo, Mich." },
  AWAY_CHAMPAIGN: { location_name: "Champaign, Ill.", location: "Champaign, Ill." },
  AWAY_WKU: { location_name: "Bowling Green, Ky., E.A. Diddle Arena", location: "Bowling Green, Ky., E.A. Diddle Arena" },
  AWAY_OAKLAND: { location_name: "Rochester, Mich.", location: "Rochester, Mich." },
  ROOM_ONLY: { location_name: "Union Oval", location: "Union Oval" },
  // An alumni event held far away, with a geocode.
  SANTA_MONICA: {
    location_name: "The Lobster",
    address: "1602 Ocean Ave, Santa Monica, CA 90401",
    geo: { latitude: "34.009", longitude: "-118.498", street: "1602 Ocean Ave", city: "Santa Monica", state: "CA", country: "US", zip: "90401" },
  },
};

// The API of one tenant. `state.today` may be changed between requests.
//   failPage(page)  -> true to answer that listing page with HTTP 500
//   failEvent(id)   -> true to answer that event's own URL with HTTP 500
function makeLocalistApi({ base, events, today, failPage, failEvent, pageSizeCap = 100 }) {
  const state = { today, events, requests: [] };
  const strip = (e) => { const { _schedule, ...rest } = e; return rest; };

  function handle(url) {
    if (!url.startsWith(base + "/api/2/events")) return null;
    state.requests.push(url);
    const parsed = new URL(url);
    const detail = /\/api\/2\/events\/([^/?]+)$/.exec(parsed.pathname);
    if (detail) {
      const id = decodeURIComponent(detail[1]);
      const e = state.events.find((x) => String(x.id) === id);
      if (!e) return { ok: false, status: 404, json: async () => ({ status: "error", error: "Not found" }) };
      if (failEvent && failEvent(e.id)) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ event: { ...strip(e), event_instances: e._schedule.map((i) => ({ event_instance: { ...i, event_id: e.id } })) } }) };
    }
    const days = parsed.searchParams.has("days") ? Number(parsed.searchParams.get("days")) : 1;
    const size = Math.min(Number(parsed.searchParams.get("pp") || 10), pageSizeCap);
    const page = Number(parsed.searchParams.get("page") || 1);
    const first = state.today;
    const last = isoPlusDays(first, days);
    const entries = [];
    for (const e of state.events) {
      for (const i of e._schedule) {
        const date = i.start.slice(0, 10);
        if (date < first || date > last) continue;
        entries.push({ start: i.start, id: i.id, entry: { event: { ...strip(e), event_instances: [{ event_instance: { ...i, event_id: e.id } }] } } });
      }
    }
    entries.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id));
    const total = Math.max(1, Math.ceil(entries.length / size));
    if (failPage && failPage(page)) return { ok: false, status: 500, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        events: entries.slice((page - 1) * size, page * size).map((x) => x.entry),
        page: { current: page, size, total, total_items: entries.length, next_page: page < total ? page + 1 : null, previous_page: page > 1 ? page - 1 : null },
        date: { first, last },
      }),
    };
  }
  return { state, handle };
}

module.exports = { makeLocalistApi, event, instance, daily, isoPlusDays, PLACES };
