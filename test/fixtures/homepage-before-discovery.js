// test/fixtures/homepage-before-discovery.js
//
// A FROZEN RECORD — not live code, and not loaded by any page.
//
// These are the homepage's own discovery rules exactly as they stood in
// index.html the day before it adopted /discovery.js (commit 2b47840,
// 2026-10-03): its category list, places table, Detroit boundary and
// distance maths, blocked names, feature chips, date helpers, filter
// predicates, neighborhood counter and URL reader/writer. Every block below
// is copied verbatim from that commit by a script; nothing was retyped or
// tidied.
//
// It exists so test/discovery-compat.test.js can keep proving, forever,
// exactly how the shared rules differ from what the homepage used to do —
// by EXECUTING the old code against the same events and comparing. Once the
// homepage adopted the shared file this code no longer exists anywhere
// else, and that proof would otherwise have been lost with it.
//
// Do not edit, fix or modernise anything here. If the shared rules change,
// change discovery.js and the expectations in the tests.
/* eslint-disable */

const CATS = {
  music:    {label:"Music",            color:"var(--c-music)"},
  theatre:  {label:"Theatre & Comedy",  color:"var(--c-theatre)"},
  dance:    {label:"Dance & Opera",     color:"var(--c-dance)"},
  visual:   {label:"Visual Arts",       color:"var(--c-visual)"},
  museum:   {label:"Museums & History", color:"var(--c-museum)"},
  family:   {label:"Family",            color:"var(--c-family)"},
  fest:     {label:"Festivals & Parades", color:"var(--c-fest)"},
  food:     {label:"Food & Markets",    color:"var(--c-food)"},
  film:     {label:"Film",              color:"var(--c-film)"},
  nightlife:{label:"Nightlife & Club",  color:"var(--c-night)"},
  sports:   {label:"Sports",            color:"var(--c-sports)"},
  community:{label:"Community",         color:"var(--c-community)"},
  vendor:   {label:"Vendor Markets",    color:"var(--c-vendor)"},
  training: {label:"Classes & Training", color:"var(--c-training)"},
  gaming:   {label:"Gaming & Esports",    color:"var(--c-gaming)"}
};

const LOCATIONS = [
  {name:"Detroit", type:"city", region:"Michigan", lat:42.3314, lng:-83.0458},

  // --- Detroit neighborhoods (39) — see migration_002_neighborhoods_and_organizers.sql ---
  {name:"Downtown", type:"neighborhood", region:"Detroit", lat:42.3316, lng:-83.0466},
  {name:"Midtown", type:"neighborhood", region:"Detroit", lat:42.3536, lng:-83.0666},
  {name:"New Center", type:"neighborhood", region:"Detroit", lat:42.3707, lng:-83.0710},
  {name:"Corktown", type:"neighborhood", region:"Detroit", lat:42.3308, lng:-83.0680},
  {name:"North Corktown", type:"neighborhood", region:"Detroit", lat:42.3385, lng:-83.0710},
  {name:"Core City", type:"neighborhood", region:"Detroit", lat:42.3390, lng:-83.0790},
  {name:"Woodbridge", type:"neighborhood", region:"Detroit", lat:42.3480, lng:-83.0790},
  {name:"Eastern Market", type:"neighborhood", region:"Detroit", lat:42.3459, lng:-83.0416},
  {name:"Brush Park", type:"neighborhood", region:"Detroit", lat:42.3435, lng:-83.0530},
  {name:"Lafayette Park", type:"neighborhood", region:"Detroit", lat:42.3350, lng:-83.0290},
  {name:"Rivertown", type:"neighborhood", region:"Detroit", lat:42.3395, lng:-83.0180},
  {name:"Indian Village", type:"neighborhood", region:"Detroit", lat:42.3660, lng:-82.9840},
  {name:"West Village", type:"neighborhood", region:"Detroit", lat:42.3610, lng:-82.9910},
  {name:"Islandview", type:"neighborhood", region:"Detroit", lat:42.3630, lng:-82.9950},
  {name:"Milwaukee Junction", type:"neighborhood", region:"Detroit", lat:42.3730, lng:-83.0570},
  {name:"North End", type:"neighborhood", region:"Detroit", lat:42.3800, lng:-83.0660},
  {name:"Poletown East", type:"neighborhood", region:"Detroit", lat:42.3730, lng:-83.0330},
  {name:"Jefferson-Chalmers", type:"neighborhood", region:"Detroit", lat:42.4000, lng:-82.9350},
  {name:"Belle Isle", type:"neighborhood", region:"Detroit", lat:42.3390, lng:-82.9700},
  {name:"Morningside", type:"neighborhood", region:"Detroit", lat:42.4070, lng:-82.9550},
  {name:"East English Village", type:"neighborhood", region:"Detroit", lat:42.4270, lng:-82.9420},
  {name:"Boston-Edison", type:"neighborhood", region:"Detroit", lat:42.3800, lng:-83.1010},
  {name:"Arden Park-East Boston", type:"neighborhood", region:"Detroit", lat:42.3830, lng:-83.0900},
  {name:"University District", type:"neighborhood", region:"Detroit", lat:42.4150, lng:-83.1350},
  {name:"Palmer Park", type:"neighborhood", region:"Detroit", lat:42.4180, lng:-83.1350},
  {name:"Palmer Woods", type:"neighborhood", region:"Detroit", lat:42.4270, lng:-83.1400},
  {name:"Sherwood Forest", type:"neighborhood", region:"Detroit", lat:42.4270, lng:-83.1470},
  {name:"Bagley", type:"neighborhood", region:"Detroit", lat:42.4180, lng:-83.1500},
  {name:"Russell Woods", type:"neighborhood", region:"Detroit", lat:42.3860, lng:-83.1450},
  {name:"Fitzgerald", type:"neighborhood", region:"Detroit", lat:42.4020, lng:-83.1670},
  {name:"Grandmont-Rosedale", type:"neighborhood", region:"Detroit", lat:42.4080, lng:-83.2000},
  {name:"Old Redford", type:"neighborhood", region:"Detroit", lat:42.4090, lng:-83.2260},
  {name:"Warrendale", type:"neighborhood", region:"Detroit", lat:42.3670, lng:-83.2100},
  {name:"Brightmoor", type:"neighborhood", region:"Detroit", lat:42.4020, lng:-83.2350},
  {name:"Mexicantown / Southwest Detroit", type:"neighborhood", region:"Detroit", lat:42.3210, lng:-83.0940},
  {name:"Springwells", type:"neighborhood", region:"Detroit", lat:42.3110, lng:-83.1170},
  {name:"Delray", type:"neighborhood", region:"Detroit", lat:42.2900, lng:-83.1180},
  {name:"Dexter-Fenkell", type:"neighborhood", region:"Detroit", lat:42.3870, lng:-83.1560},
  {name:"Wildemere Park", type:"neighborhood", region:"Detroit", lat:42.3760, lng:-83.1290},

  // Added 2026-09-14: renamed from an earlier placeholder ("Elmwood Park") —
  // see supabase/update_2026-09-14_eastside-historic-cemetery-district.sql.
  // Coordinates are the NRHP-listed centroid (Wikipedia, "Eastside Historic
  // Cemetery District", ref #82000550), not a hand estimate like most of
  // the list above.
  {name:"Eastside Historic Cemetery District", type:"neighborhood", region:"Detroit", lat:42.3497, lng:-83.0181},

  // --- SERVICE_AREA.md cities (75-mile boundary), nearest to farthest ---
  {name:"Windsor", type:"city", region:"Ontario", lat:42.3149, lng:-83.0364},
  {name:"Bloomfield Hills", type:"city", region:"Michigan", lat:42.5836, lng:-83.2455},
  {name:"Rochester", type:"city", region:"Michigan", lat:42.6806, lng:-83.1341},
  {name:"Pontiac", type:"city", region:"Michigan", lat:42.6389, lng:-83.2910},
  {name:"Ypsilanti", type:"city", region:"Michigan", lat:42.2411, lng:-83.6130},
  {name:"Milford", type:"city", region:"Michigan", lat:42.5926, lng:-83.6002},
  {name:"Clarkston", type:"city", region:"Michigan", lat:42.7364, lng:-83.4199},
  {name:"Monroe", type:"city", region:"Michigan", lat:41.9164, lng:-83.3977},
  {name:"Ann Arbor", type:"city", region:"Michigan", lat:42.2808, lng:-83.7430},
  {name:"Brighton", type:"city", region:"Michigan", lat:42.5297, lng:-83.7796},
  {name:"Chatham", type:"city", region:"Ontario", lat:42.4048, lng:-82.1910},
  {name:"Fenton", type:"city", region:"Michigan", lat:42.7970, lng:-83.7054},
  {name:"Howell", type:"city", region:"Michigan", lat:42.6072, lng:-83.9294},
  {name:"Toledo", type:"city", region:"Ohio", lat:41.6528, lng:-83.5379},
  {name:"Port Huron", type:"city", region:"Michigan", lat:42.9709, lng:-82.4252},
  {name:"Sarnia", type:"city", region:"Ontario", lat:42.9748, lng:-82.4066},
  {name:"Flint", type:"city", region:"Michigan", lat:43.0125, lng:-83.6875},
  {name:"Adrian", type:"city", region:"Michigan", lat:41.8975, lng:-84.0372},
  {name:"Jackson", type:"city", region:"Michigan", lat:42.2459, lng:-84.4013},
  {name:"Owosso", type:"city", region:"Michigan", lat:42.9964, lng:-84.1783},

  // Added 2026-09-20, newly in scope after the center->border measurement
  // switch (SERVICE_AREA.md): Lansing is 67.5mi from Detroit's actual
  // border (was 81.5mi from Detroit's center, just outside the old
  // boundary). East Lansing (MSU's campus town, the specific "huge college
  // town" Jody flagged) is 64.3mi, with even more margin.
  {name:"Lansing", type:"city", region:"Michigan", lat:42.71417, lng:-84.56000},
  {name:"East Lansing", type:"city", region:"Michigan", lat:42.7370, lng:-84.4839},

  // --- Supplementary Detroit-metro suburbs (added for venue-city match
  // coverage beyond the SERVICE_AREA.md boundary-illustration list above —
  // all comfortably inside the 75-mile radius already established there) ---
  {name:"Hamtramck", type:"city", region:"Michigan", lat:42.3922, lng:-83.0497},
  {name:"Highland Park", type:"city", region:"Michigan", lat:42.4054, lng:-83.0997},
  {name:"Dearborn", type:"city", region:"Michigan", lat:42.3223, lng:-83.1763},
  {name:"Dearborn Heights", type:"city", region:"Michigan", lat:42.3373, lng:-83.2733},
  {name:"Ferndale", type:"city", region:"Michigan", lat:42.4606, lng:-83.1344},
  {name:"Royal Oak", type:"city", region:"Michigan", lat:42.4895, lng:-83.1446},
  {name:"Berkley", type:"city", region:"Michigan", lat:42.5023, lng:-83.1838},
  {name:"Oak Park", type:"city", region:"Michigan", lat:42.4595, lng:-83.1830},
  {name:"Southfield", type:"city", region:"Michigan", lat:42.4734, lng:-83.2219},
  {name:"Birmingham", type:"city", region:"Michigan", lat:42.5467, lng:-83.2113},
  {name:"Troy", type:"city", region:"Michigan", lat:42.6064, lng:-83.1499},
  {name:"Sterling Heights", type:"city", region:"Michigan", lat:42.5803, lng:-83.0302},
  {name:"Warren", type:"city", region:"Michigan", lat:42.5145, lng:-83.0147},
  {name:"Madison Heights", type:"city", region:"Michigan", lat:42.5292, lng:-83.1057},
  {name:"Auburn Hills", type:"city", region:"Michigan", lat:42.6875, lng:-83.2341},
  {name:"Rochester Hills", type:"city", region:"Michigan", lat:42.6583, lng:-83.1499},
  {name:"Waterford", type:"city", region:"Michigan", lat:42.6892, lng:-83.3585},
  {name:"Novi", type:"city", region:"Michigan", lat:42.4806, lng:-83.4755},
  {name:"Farmington Hills", type:"city", region:"Michigan", lat:42.4989, lng:-83.3677},
  {name:"Livonia", type:"city", region:"Michigan", lat:42.3684, lng:-83.3527},
  {name:"Westland", type:"city", region:"Michigan", lat:42.3242, lng:-83.4002},
  {name:"Taylor", type:"city", region:"Michigan", lat:42.2409, lng:-83.2699},
  {name:"Lincoln Park", type:"city", region:"Michigan", lat:42.2506, lng:-83.1785},
  {name:"Wyandotte", type:"city", region:"Michigan", lat:42.2142, lng:-83.1499},
  {name:"Grosse Pointe", type:"city", region:"Michigan", lat:42.3861, lng:-82.9116},
  {name:"St. Clair Shores", type:"city", region:"Michigan", lat:42.4970, lng:-82.8888},
  {name:"Roseville", type:"city", region:"Michigan", lat:42.4973, lng:-82.9371},
  {name:"Eastpointe", type:"city", region:"Michigan", lat:42.4670, lng:-82.9560},
  {name:"Utica", type:"city", region:"Michigan", lat:42.6264, lng:-83.0341},
  {name:"Shelby Township", type:"city", region:"Michigan", lat:42.6642, lng:-83.0341},
  {name:"Clinton Township", type:"city", region:"Michigan", lat:42.5869, lng:-82.9200},
  {name:"Mount Clemens", type:"city", region:"Michigan", lat:42.5973, lng:-82.8794},
  {name:"Grand Blanc", type:"city", region:"Michigan", lat:42.9270, lng:-83.6249},
];

const CITY_LOOKUP = new Map(
  LOCATIONS.filter(l => l.type === 'city').map(l => [l.name.toLowerCase(), l])
);

function haversineMiles(lat1, lng1, lat2, lng2){
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

const DETROIT_BOUNDARY = [[-82.91625,42.42135],[-82.91034,42.41902],[-82.91055,42.41719],[-82.91863,42.39956],[-82.92149,42.39546],[-82.93542,42.38978],[-82.9468,42.38699],[-82.93027,42.36214],[-82.93087,42.3619],[-82.92859,42.358],[-82.92397,42.35212],[-82.94541,42.3474],[-82.95977,42.33977],[-82.98912,42.33248],[-83.01895,42.33062],[-83.06356,42.31686],[-83.07994,42.30717],[-83.0999,42.2867],[-83.11463,42.29018],[-83.11813,42.28973],[-83.11987,42.28755],[-83.11764,42.28041],[-83.11877,42.27913],[-83.13745,42.28279],[-83.16097,42.25496],[-83.16635,42.25968],[-83.16811,42.26391],[-83.16983,42.26458],[-83.15816,42.27884],[-83.167,42.28957],[-83.16166,42.29178],[-83.15825,42.29202],[-83.15769,42.29496],[-83.15169,42.29626],[-83.14999,42.29583],[-83.14894,42.29341],[-83.14724,42.29257],[-83.14256,42.29441],[-83.14045,42.29775],[-83.14242,42.30569],[-83.1406,42.30668],[-83.13964,42.30866],[-83.1407,42.31101],[-83.15313,42.32809],[-83.15647,42.32724],[-83.1569,42.33696],[-83.15296,42.33759],[-83.14994,42.33984],[-83.14835,42.34469],[-83.14766,42.35192],[-83.19653,42.35089],[-83.19606,42.33644],[-83.21534,42.33614],[-83.21528,42.32902],[-83.22514,42.32881],[-83.22783,42.3326],[-83.23458,42.32984],[-83.23503,42.33584],[-83.23749,42.33574],[-83.23777,42.34309],[-83.26384,42.34169],[-83.26591,42.35705],[-83.26658,42.37879],[-83.27491,42.37859],[-83.27586,42.40728],[-83.28638,42.407],[-83.28773,42.44268],[-82.94053,42.45037],[-82.95128,42.43581],[-82.91625,42.42135]];

const DB_LAT0 = 42.35;

const DB_MILES_PER_DEG_LAT = 69.0;

const DB_MILES_PER_DEG_LON = 69.0 * Math.cos(DB_LAT0 * Math.PI / 180);

function dbToXY(lon, lat){
  return [(lon + 83.4) * DB_MILES_PER_DEG_LON, (lat - DB_LAT0) * DB_MILES_PER_DEG_LAT];
}

function dbDistPointToSeg(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  const len2 = dx*dx + dy*dy;
  let t = len2 === 0 ? 0 : ((px-ax)*dx + (py-ay)*dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t*dx, cy = ay + t*dy;
  return Math.hypot(px-cx, py-cy);
}

function milesFromDetroitBorder(lat, lng){
  const [px, py] = dbToXY(lng, lat);
  let minDist = Infinity;
  for(let i=0; i<DETROIT_BOUNDARY.length-1; i++){
    const [alon,alat] = DETROIT_BOUNDARY[i];
    const [blon,blat] = DETROIT_BOUNDARY[i+1];
    const [ax,ay] = dbToXY(alon,alat), [bx,by] = dbToXY(blon,blat);
    const d = dbDistPointToSeg(px,py,ax,ay,bx,by);
    if(d < minDist) minDist = d;
  }
  return minDist;
}

const MAX_EVENT_SPAN_DAYS = 60;

function expandDateRange(startIso, endIso){
  if(!endIso || endIso <= startIso) return [startIso];
  const dates = [];
  let cur = new Date(startIso+"T12:00:00");
  const end = new Date(endIso+"T12:00:00");
  let guard = 0;
  while(cur <= end && guard < MAX_EVENT_SPAN_DAYS){
    const y = cur.getFullYear(), m = String(cur.getMonth()+1).padStart(2,'0'), d = String(cur.getDate()).padStart(2,'0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate()+1);
    guard++;
  }
  return dates;
}

function addToByDate(target, e){
  expandDateRange(e.date, e.endDate).forEach(iso => { (target[iso] = target[iso]||[]).push(e); });
}

const BLOCKED_NAMES = ["Augustus Williams"];

function isBlockedEvent(e){
  return BLOCKED_NAMES.some(name => {
    const n = name.toLowerCase();
    return (e.title && e.title.toLowerCase().includes(n)) ||
           (e.note && e.note.toLowerCase().includes(n));
  });
}

const FEATURE_CHIPS = [
  { key: 'tickets', label: 'Tickets available' },
  { key: 'photo', label: 'Has photo' },
  { key: 'submitted', label: 'Community submitted' },
  { key: 'radar', label: 'On the Radar' },
];

function toISO(y,m,d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

function getTodayISO(){
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

function getTomorrowISO(){
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

function getWeekendDates(){
  const d = new Date();
  d.setHours(0,0,0,0);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const deltaToFriday = dow === 0 ? -2 : 5 - dow;
  const fri = new Date(d); fri.setDate(d.getDate() + deltaToFriday);
  return [0,1,2].map(off=>{
    const x = new Date(fri); x.setDate(fri.getDate()+off);
    return toISO(x.getFullYear(), x.getMonth(), x.getDate());
  });
}

function getCalendarWeekDates(){
  const todayIso = getTodayISO();
  const t = new Date(todayIso+"T12:00:00");
  const dow = t.getDay(); // 0=Sun..6=Sat
  const deltaToMonday = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(t); mon.setDate(t.getDate() + deltaToMonday);
  return Array.from({length:7}, (_,i)=>{
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    return toISO(d.getFullYear(), d.getMonth(), d.getDate());
  });
}

function datesInRange(startIso, endIso){
  const out = [];
  let d = new Date(startIso+"T12:00:00");
  // Plain string comparison is safe here since every ISO date is the same
  // fixed-width YYYY-MM-DD shape — no need to compare as Date objects.
  // The 3,660-day cap is just a defensive backstop (the date inputs' own
  // max= already keeps a real range well under a year) so a malformed value
  // can never turn this into a runaway loop.
  for(let guard=0; guard<3660; guard++){
    const iso = toISO(d.getFullYear(), d.getMonth(), d.getDate());
    if(iso > endIso) break;
    out.push(iso);
    d.setDate(d.getDate()+1);
  }
  return out;
}

function upcomingDatesWithEvents(){
  const todayIso = getTodayISO();
  return Object.keys(byDate).filter(iso => iso >= todayIso).sort();
}

function currentDateList(){
  if(whenMode === 'weekend') return cachedWeekendDates;
  if(whenMode === 'thisweek') return getCalendarWeekDates();
  if(whenMode === 'range' && rangeStart && rangeEnd) return datesInRange(rangeStart, rangeEnd);
  if(whenMode === 'date' && pickedDate) return [pickedDate];
  if(whenMode === 'tomorrow') return [getTomorrowISO()];
  if(whenMode === 'tonight') return [getTodayISO()];
  // "All Upcoming" (P0, 2026-08-28 product audit Gap 2) — the same
  // deliberately-unbounded "every date that actually has an event" function
  // the neighborhood rail already relies on, reused rather than duplicated.
  // This is what makes "show me everything" a real, one-click, zero-query
  // answer instead of the silent 30-day default below.
  if(whenMode === 'all') return upcomingDatesWithEvents();
  if(neighborhoodFilter) return upcomingDatesWithEvents();
  // Search should look across every upcoming date, not just today's — with
  // no When/neighborhood scope active, the plain default below collapses
  // to "today only," which silently hid every non-today match no matter
  // how exact the query was. Fixed 2026-09-16 after Jody reported "search
  // never works for me" (searching "bahamas" found nothing even though
  // the Bahamas @ El Club show, 2026-09-30, was loaded and a correct
  // match — it just wasn't on today's date list).
  if(query) return upcomingDatesWithEvents();
  // Default resting state: today only, not a rolling multi-week window.
  // Jody, 2026-09-04: a 30-day list made the page's own scroll so long that
  // a visitor would never actually reach whatever lives in the layout's
  // right-hand column (Explore Neighborhoods, View Calendar, etc.) — they'd
  // have scrolled past dozens of days of cards long before getting there.
  // "See everything" (All Upcoming, one tap away via the scope note below)
  // is still the full unbounded list; this just keeps the FIRST thing a
  // visitor sees short enough that the rest of the page is still reachable.
  return [getTodayISO()];
}

function matchesNonDateFilters(e){
  if(isBlockedEvent(e)) return false;
  if(!activeCats.has(e.cat)) return false;
  if(freeOnly && !e.free) return false;
  // FEATURE_CHIPS filters (see their declaration above for the reasoning).
  // 'radar' reads editorialByEvent directly, the same lookup
  // editorialLinkHtml()/renderOnRadarCard() already use, rather than a
  // second copy of "is this event on the radar" logic.
  if(activeFeatures.has('tickets') && !e.ticketUrl) return false;
  if(activeFeatures.has('photo') && !e.imageUrl) return false;
  if(activeFeatures.has('submitted') && e.source !== 'Venue Submission') return false;
  if(activeFeatures.has('radar') && !(e.id != null && editorialByEvent[e.id])) return false;
  if(neighborhoodFilter && e.neighborhood !== neighborhoodFilter) return false;
  if(query){
    // Search matches everywhere in the event's metadata, not just title/venue —
    // Jody: "search should search for anything in the metadata" (2026-08-27).
    // Covers every text field already loaded client-side: title, venue, city,
    // category label, neighborhood, source, and any editorial note. Does NOT
    // reach the events.description column, since that's not fetched by
    // loadSupabaseEvents() today — adding it would mean pulling extra text for
    // every one of the (1,275+ and growing) approved rows just for search, so
    // it's left out until that's worth the payload cost.
    const q = query.toLowerCase();
    const haystack = [
      e.title, e.venue, e.city, CATS[e.cat] ? CATS[e.cat].label : '',
      e.neighborhood, e.source, e.note
    ].filter(Boolean).join(' ').toLowerCase();
    if(!haystack.includes(q)) return false;
  }
  if(originLocation && radiusMiles !== null){
    const loc = CITY_LOOKUP.get((e.city || "Detroit").toLowerCase());
    // An event whose city isn't in the reference table has no resolvable
    // distance from the chosen origin — excluded rather than guessed at
    // (this is an active, opt-in radius filter, not a safety net like NOW).
    if(!loc) return false;
    if(radiusMiles === 'all'){
      // Detroit Orbit: not narrowed by the chosen origin location itself
      // (that's what makes it the widest tier), but still hard-capped at 75
      // miles from Detroit's own city BORDER (switched 2026-09-20 from a
      // center-point measurement, see the DETROIT_BOUNDARY comment above)
      // — the fixed definition of the Detroit Orbit boundary — so results
      // never drift outside the site's real coverage area no matter where
      // the user searched from.
      if(milesFromDetroitBorder(loc.lat, loc.lng) > 75) return false;
    } else if(haversineMiles(originLocation.lat, originLocation.lng, loc.lat, loc.lng) > radiusMiles){
      return false;
    }
  }
  return true;
}

function isEveningTime(timeStr){
  if(!timeStr) return false;
  if(/evening/i.test(timeStr)) return true;
  const range = parseTimeRange(timeStr);
  return !!(range && range.start.h >= 17);
}

function matchesFilters(e){
  if(!matchesNonDateFilters(e)) return false;
  const todayIso = getTodayISO();
  // Baseline floor: the homepage list never shows a date before today, no
  // matter which month is being paged through or which time-range shortcut
  // (if any) is active — Jody: "I don't want events in the past to show up
  // as the first thing you see... those should only be available if a user
  // needs to go back in time," which is exactly what the dedicated
  // calendar.html page is for (it keeps its own independent month-browsing
  // and doesn't share this restriction).
  if(e.date < todayIso) return false;
  // 'all' (All Upcoming, P0 2026-08-28) deliberately has NO branch of its
  // own here — currentDateList() already scopes it to every date with an
  // event, unbounded, so nothing here needs to narrow by date again. It
  // still falls through to the today-only "hide once ended" block below
  // (grouped with the plain default state, not the whenMode chain), so
  // "show me everything" doesn't include a today event that's already
  // completely over — same "still happening or midnight" rule as the
  // default view, just without the 30-day ceiling.
  if(whenMode && whenMode !== 'all'){
    if(whenMode === 'weekend'){
      if(!cachedWeekendDates.includes(e.date)) return false;
    } else if(whenMode === 'thisweek'){
      // Backs the hero stat's "View all events" link (viewThisWeek()) — the
      // exact same Monday-Sunday window renderHeroToday() counted, so the
      // list a visitor lands on always shows precisely the number the hero
      // just told them, never a different (e.g. 30-day-window) count.
      if(!getCalendarWeekDates().includes(e.date)) return false;
    } else if(whenMode === 'range'){
      // A user-picked From/To range (see the When sheet's date-range
      // picker) — both ends inclusive, both always today or later since the
      // inputs' own min= floors match the restriction above.
      if(e.date < rangeStart || e.date > rangeEnd) return false;
    } else if(whenMode === 'date'){
      // A single arbitrary user-picked date (the When sheet's "From" input
      // with no "To") — always today or later, same reasoning as above.
      if(e.date !== pickedDate) return false;
    } else if(whenMode === 'tomorrow'){
      if(e.date !== getTomorrowISO()) return false;
    } else if(whenMode === 'tonight'){
      if(e.date !== todayIso || !isEveningTime(e.time)) return false;
    }
  } else if((!whenMode || whenMode === 'all') && e.date === todayIso){
    // No explicit time-range shortcut active (the page's own default
    // state), OR "All Upcoming" — both share this same today-only
    // narrowing. Previously hid a today event the moment its START hour
    // passed — Jody, 2026-08-28: "just because it began already doesn't
    // mean the user cannot still go or be interested," which is exactly
    // right: that rule dropped an event from the list while it was still
    // actively happening (a 6pm show vanished at 7pm). Now it only hides
    // once the event's own parsed END time has passed — "still happening
    // or midnight, whichever happens first." An event with no parseable
    // end time (a bare start time with no range, or a vague string like
    // "Evening") has no early cutoff at all and stays visible the rest of
    // the day; the date-floor check above is what drops it once the
    // calendar date itself rolls over to tomorrow — that's the "midnight"
    // half of the rule.
    const range = parseTimeRange(e.time);
    if(range && range.end && range.end.h >= range.start.h){
      // The >= guard skips a range that crosses midnight (e.g. 10pm-2am):
      // it's still legitimately "today" all the way through, so there's
      // nothing to cut off early — the date-floor check handles it
      // naturally once the date itself moves to tomorrow.
      const nowHour = new Date().getHours() + new Date().getMinutes()/60;
      const endHour = range.end.h + range.end.m/60;
      if(endHour < nowHour) return false;
    }
  }
  return true;
}

function isInDetroitOrbit(e){
  const loc = CITY_LOOKUP.get((e.city || "Detroit").toLowerCase());
  if(!loc) return false;
  return milesFromDetroitBorder(loc.lat, loc.lng) <= 75;
}

function isWithinRadius(e, lat, lng, miles){
  const loc = CITY_LOOKUP.get((e.city || "Detroit").toLowerCase());
  if(!loc) return false;
  return haversineMiles(lat, lng, loc.lat, loc.lng) <= miles;
}

function parseTimeRange(timeStr){
  if(!timeStr) return null;
  const NOON = {h:12, m:0}, MIDNIGHT = {h:0, m:0};
  const tokens = [];
  for(const m of timeStr.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi)){
    let hh = parseInt(m[1],10)%12; if(/PM/i.test(m[3])) hh += 12;
    tokens.push({index:m.index, time:{h:hh, m:parseInt(m[2],10)}, hasMeridiem:true});
  }
  for(const m of timeStr.matchAll(/\b(\d{1,2}):(\d{2})\b(?!\s*(?:AM|PM))/gi)){
    tokens.push({index:m.index, h12:parseInt(m[1],10)%12, m:parseInt(m[2],10), hasMeridiem:false});
  }
  for(const m of timeStr.matchAll(/\bnoon\b/gi)) tokens.push({index:m.index, time:NOON, hasMeridiem:true});
  for(const m of timeStr.matchAll(/\bmidnight\b/gi)) tokens.push({index:m.index, time:MIDNIGHT, hasMeridiem:true});
  if(!tokens.length) return null;
  tokens.sort((a,b)=>a.index-b.index);
  tokens.forEach((tok,i)=>{
    if(tok.hasMeridiem) return;
    const next = tokens.slice(i+1).find(t=>t.hasMeridiem);
    if(next){
      let hh = tok.h12; if(next.time.h>=12) hh += 12;
      tok.time = {h:hh, m:tok.m};
      tok.hasMeridiem = true;
    }
  });
  const resolved = tokens.filter(t=>t.hasMeridiem);
  if(!resolved.length) return null;
  return {start: resolved[0].time, end: resolved.length>1 ? resolved[1].time : null};
}

function computeNeighborhoodCounts(){
  const todayIso = getTodayISO();
  const counts = new Map();
  Object.keys(byDate).forEach(iso=>{
    if(iso < todayIso) return;
    (byDate[iso]||[]).forEach(e=>{
      if(isBlockedEvent(e)) return;
      if(!e.neighborhood) return;
      counts.set(e.neighborhood, (counts.get(e.neighborhood)||0) + 1);
    });
  });
  return [...counts.entries()].sort((a,b)=> b[1]-a[1]);
}

function syncURL(){
  const params = new URLSearchParams();
  // Always today — the homepage's default view no longer has a separately
  // browsable "current month" to encode (month paging was removed
  // 2026-08-27), so there's nothing else meaningful to put here.
  params.set('date', getTodayISO());
  if(whenMode) params.set('when', whenMode);
  if(whenMode === 'date' && pickedDate) params.set('picked', pickedDate);
  if(whenMode === 'range' && rangeStart && rangeEnd){
    params.set('rangeStart', rangeStart);
    params.set('rangeEnd', rangeEnd);
  }
  if(activeCats.size < Object.keys(CATS).length) params.set('cats', Array.from(activeCats).join(','));
  if(freeOnly) params.set('free', '1');
  if(activeFeatures.size) params.set('features', Array.from(activeFeatures).join(','));
  if(query) params.set('q', query);
  // A geolocation-derived origin (type:'here') has no stable name to
  // round-trip through a URL — omitted rather than encoding raw coordinates,
  // which would put the visitor's location in a shareable link.
  if(originLocation && originLocation.type !== 'here'){
    params.set('loc', originLocation.name);
    if(radiusMiles !== null) params.set('radius', String(radiusMiles));
  }
  if(neighborhoodFilter) params.set('neighborhood', neighborhoodFilter);
  const qs = params.toString();
  // Wrapped defensively: history.replaceState throws a SecurityError in a
  // sandboxed about:srcdoc context (e.g. an embedded preview iframe, which
  // has no real address of its own to rewrite) — URL bookmarking is a
  // nice-to-have, so a failure here should never break the rest of render().
  try {
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  } catch (err) {
    // Silently skip — nothing else depends on this succeeding.
  }
}

function readStateFromURL(){
  const params = new URLSearchParams(location.search);

  const catsParam = params.get('cats');
  if(catsParam !== null){
    // An empty/invalid list intentionally means "show nothing" — matching
    // whatever state was actually shared, rather than silently falling back
    // to "show everything" and misrepresenting the link.
    activeCats = new Set(catsParam.split(',').filter(k=>CATS[k]));
  }

  if(params.get('free') === '1') freeOnly = true;

  const featuresParam = params.get('features');
  if(featuresParam){
    const validKeys = new Set(FEATURE_CHIPS.map(f=>f.key));
    activeFeatures = new Set(featuresParam.split(',').filter(k=>validKeys.has(k)));
  }

  const qParam = params.get('q');
  if(qParam){ query = qParam; document.getElementById('search').value = qParam; }

  // Note: an old bookmarked link with ?view=month has nothing to restore to
  // anymore — the homepage is List-only now, so that param is simply ignored.
  // Same (2026-08-27) for ?when=now / ?when=today — both shortcuts were
  // removed as redundant once the default view already opens on today, so
  // an old link using either is just ignored. ?when=tonight, briefly in the
  // same "ignored" category after Tonight was removed 2026-08-27, is back
  // to being a real, restorable value again as of 2026-08-28 (Tonight was
  // restored — see WHEN_LABELS above) — same for the new ?when=all.
  const whenParam = params.get('when');
  if(whenParam === 'date'){
    const pickedParam = params.get('picked');
    if(pickedParam && /^\d{4}-\d{2}-\d{2}$/.test(pickedParam) && pickedParam >= getTodayISO()){
      whenMode = 'date';
      pickedDate = pickedParam;
      document.getElementById('whenDateInput').value = pickedParam;
    }
  } else if(whenParam === 'range'){
    const rs = params.get('rangeStart'), re = params.get('rangeEnd');
    if(rs && re && /^\d{4}-\d{2}-\d{2}$/.test(rs) && /^\d{4}-\d{2}-\d{2}$/.test(re) && rs <= re && rs >= getTodayISO()){
      whenMode = 'range';
      rangeStart = rs;
      rangeEnd = re;
      document.getElementById('whenDateInput').value = rs;
      document.getElementById('whenDateEndInput').value = re;
    }
  } else if(whenParam && ['tomorrow','tonight','weekend','thisweek','all'].includes(whenParam)){
    whenMode = whenParam;
    if(whenParam === 'weekend'){
      cachedWeekendDates = getWeekendDates();
    }
  }

  // A shared link only restores a NAMED location (a real match in
  // LOCATIONS) — a one-off geolocation origin was never put in the URL to
  // begin with (see syncURL), so there's nothing to restore for those.
  const locParam = params.get('loc');
  if(locParam){
    const found = LOCATIONS.find(l => l.name.toLowerCase() === locParam.toLowerCase());
    if(found){
      originLocation = found;
      const radiusParam = params.get('radius');
      if(radiusParam === 'all') radiusMiles = 'all';
      else {
        const n = parseInt(radiusParam, 10);
        radiusMiles = (!isNaN(n) && [5,10,25,50].includes(n)) ? n : 'all';
      }
    }
  }
  updateLocationControlUI();

  // Restored the same way as `loc` above — a real, human-readable name in
  // the URL, resolved against live data once it loads rather than trusted
  // blindly (an old link naming a neighborhood that's since been renamed —
  // see the Fitzgerald/Rivertown renames — just won't match anything and
  // quietly falls back to unfiltered, same failure mode as `cats`/`loc`).
  const neighborhoodParam = params.get('neighborhood');
  if(neighborhoodParam) neighborhoodFilter = neighborhoodParam;
}
