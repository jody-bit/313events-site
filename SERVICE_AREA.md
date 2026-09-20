# 313.events — Service Area (75 miles from Detroit's border)

As of 2026-09-20, the reference point for the 75-mile service-area radius changed from Detroit's center point to Detroit's actual city border. The number itself is unchanged — still 75 miles — only what it's measured *from*. (For the earlier history: as of 2026-08-24, coverage changed from "the City of Detroit, plus the Hamtramck and Highland Park enclaves" to a 75-mile radius from Detroit's center point, matching the regional radius used by the area's music census work.)

**Why the switch.** Measuring from an abstract center point systematically under-counts real nearby places that sit just past the old cutoff. Lansing/East Lansing (home of Michigan State University) is the case that prompted this fix: at 81.5 miles from Detroit's center point, it fell just outside the old boundary — but Detroit is a real city with real physical extent (about 139 sq mi of land), so the true distance from the nearest edge of the city to Lansing is meaningfully shorter. Measuring from the border instead of the center is the more honest way to ask "is this within reach of Detroit," and it's a strict expansion of the old boundary — a border point is always at least as close to any outside location as the center is, so nothing previously in scope drops out; places previously just outside (Lansing chief among them) can now come in.

**Boundary source.** The City of Detroit's own official GIS boundary layer — `City_of_Detroit_Boundary`, an ArcGIS Feature Layer (serviceItemId `86b221bb68ca4364afe81d156e54f95c`), queried 2026-09-20 at `https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/city_of_detroit_boundary/FeatureServer/0`. The outer boundary ring (1,090 vertices) was simplified with Douglas-Peucker (tolerance ~0.05 mi) down to 70 points for embedding directly in application code — verified to reproduce the full-precision distances to the fraction-of-a-mile for every city checked against it. The boundary layer's interior ring (a hole cut out around the Hamtramck/Highland Park enclaves, which are separate cities entirely surrounded by Detroit) isn't used for these distances, since it can never be the nearest edge to a point outside Detroit.

Distances below are the shortest great-circle distance from each city's own center point to the *nearest point anywhere on Detroit's actual boundary* — not to Detroit's center, and not driving distance (so actual travel time varies more than the mileage suggests, especially across the river into Ontario).

## What's now in scope (within 75 miles of Detroit's border)

Ordered nearest to farthest. This is not exhaustive — any city, township, or venue that falls inside the radius is in scope even if it isn't listed here — but it covers the cities worth naming explicitly, either because they're well-known regional hubs or because they were previously and explicitly excluded.

| City | Distance from Detroit's border |
|---|---|
| Windsor, ON | 0.7 mi (across the river) |
| Bloomfield Hills, MI | 9.6 mi |
| Pontiac, MI | 13.5 mi |
| Rochester, MI | 16.2 mi |
| Milford, MI | 18.9 mi |
| Ypsilanti, MI | 19.1 mi |
| Clarkston, MI | 21.4 mi |
| Ann Arbor, MI | 24.8 mi |
| Brighton, MI | 25.8 mi |
| Monroe, MI | 26.3 mi |
| Fenton, MI | 32.4 mi |
| Howell, MI | 34.6 mi |
| Chatham, ON | 36.7 mi |
| Flint, MI | 44.3 mi |
| Port Huron, MI | 44.5 mi |
| Sarnia, ON | 45.3 mi |
| Toledo, OH | 45.8 mi |
| Adrian, MI | 49.9 mi |
| Jackson, MI | 57.9 mi |
| Owosso, MI | 59.3 mi |
| East Lansing, MI (MSU) | 64.3 mi |
| Bowling Green, OH | 65.7 mi |
| **Lansing, MI** | **67.5 mi — newly in scope** |

**A note on Bowling Green, OH:** it isn't the result of a coded exception or allowlist anywhere in this project — there isn't one. It has simply always fallen inside the radius on its own (73.1 mi from Detroit's old center-point measurement, now 65.7 mi from the border), so `api/cron-ticketmaster.js`'s real geographic radius search picks up its events automatically, the same way it does for every other city in this table. Listed here only because Jody has referred to it as a deliberate inclusion in the past — worth documenting plainly that it was never actually a special case, and the border-based switch only gives it *more* margin, not less.

## What's just outside (nearby but still excluded)

These come up often enough in regional conversation that it's worth being explicit they're still out of scope, rather than letting that be an unstated gap:

| City | Distance from Detroit's border |
|---|---|
| Saginaw, MI | 75.4 mi |
| Bay City, MI | 85.2 mi |
| London, ON | 94.0 mi |
| Battle Creek, MI | 96.7 mi |
| Mount Pleasant, MI | 109.8 mi |
| Kalamazoo, MI | 117.6 mi |
| Grand Rapids, MI | 126.6 mi |

**Saginaw is a near-miss, not a comfortable exclusion.** At 75.4 miles from Detroit's border (down from 88 miles under the old center-based measurement — the largest swing of any city checked), it's only about a third of a mile past the 75-mile line, well within the ~0.15mi precision margin of the simplified-boundary distance calculation itself. It was left excluded here because the switch Jody asked for was specifically "keep the 75-mile number, change what it's measured from" — not "also move the number" — but it's worth flagging on its own merits as a real, close call if Saginaw's inclusion ever comes up directly, the way Lansing's did.

## Implications worth flagging

**International reach.** The radius pulls in Windsor, Chatham, and Sarnia, Ontario — meaning 313.events is now, functionally, a cross-border calendar. That has real follow-on questions this document isn't answering, just surfacing: currency display for ticket prices, whether Canadian venues/promoters should be solicited the same way Detroit ones are, and whether "Detroit arts calendar" framing still reads accurately to a Windsor venue being asked to submit their own listing.

**Cross-state reach.** Toledo, OH and Bowling Green, OH are both inside the radius, and Lansing/East Lansing, MI add a second college-town cluster distinct from Ann Arbor's. Same open question as the international one, in miniature — each of these has its own separate arts/events ecosystem and identity, and folding them in changes what "comprehensive" means for this product.

**The "313" name — resolved.** 313 is Detroit's area code, and a 75-mile-from-border radius includes cities with entirely different area codes (Ann Arbor's 734, Flint's 810, Lansing's 517, Toledo's 419, Windsor's 519). Decision (2026-08-24, unchanged by this update): keep the name. Detroit is the largest and best-known city in the service area, the name is an established domain and brand, and "313" reads as a regional identifier the way "Metro Times" or "Crain's Detroit" do.

**Neighborhood scope — resolved.** The 39-neighborhood reference system documented in `FOUNDATIONAL_ITEMS.md` stays Detroit-only, by design rather than as a temporary gap. Decision (2026-08-24, unchanged by this update): neighborhood-level granularity is a Detroit-specific feature, while every other city/township in the 75-mile radius is tracked at the city level (the `venues.city` field), not broken into neighborhoods.

## Sources referencing this document

- `index.html` — footer scope note, `DETROIT_BOUNDARY` polygon + `milesFromDetroitBorder()` (the live client-side filter logic itself, not just prose)
- `sources.html` — footer scope-corrections note (Cranbrook)
- `schema.sql` — `venues.city` column comment
- `api/_lib/detroit-boundary.js` — the shared server-side copy of the same boundary polygon + distance function
- `api/cron-ticketmaster.js` — `CENTER_LAT`/`CENTER_LON`/`RADIUS_MILES`/`TM_QUERY_RADIUS_MILES`, the only cron that queries an external API by geographic radius rather than a fixed source list
- `AUDIT_AND_ARCHITECTURE.md`, `FOUNDATIONAL_ITEMS.md` — scope-change notes (these cite "75 miles from Detroit" without specifying center vs. border, so they didn't need edits for this switch — still accurate as written)

Center-point-based distances (used everywhere above until 2026-09-20) computed via haversine formula (R = 3958.8 mi). Border-based distances computed as the shortest distance from each city's center point to the nearest segment of Detroit's simplified boundary polygon, using a local equirectangular projection (accurate to within ~0.15 mi at these distances). Both are re-derivable from the coordinates/source listed above if the radius, boundary source, or center point ever changes.
