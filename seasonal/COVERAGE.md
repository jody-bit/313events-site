# Seasonal collections: coverage, verification and gaps

Source of truth: `seasonal/collections.js` (published entries) and `seasonal/candidates.json` (all 252 inventory rows).

## Counts
| Collection | Inventory | Published | Unresolved |
|---|---|---|---|
| /fall | 71 | 4 | 67 |
| /halloween | 52 | 6 | 46 |
| /fall-color | 129 | 4 | 125 |

## Verification limit
Official websites could not be reached: all outbound HTTP from the build environment returns 403 / name-resolution failure
(checked metroparks.com, wiards.com, glenloretrails.com, blakefarms.com, thehenryford.org, detroitzoo.org, Wikimedia).
Per the brief, no further entries were published on weaker evidence. The 14 published entries have inventory entry plus
independent web coverage for identity and location; none was checked against its official site. No hours, admission,
dates or accessibility are shown. All other candidates are preserved as `unresolved` with flags (radius check, Ontario/Ohio,
cemetery access, adults-only, duplicate/multi-site, operating status).

## Images
Real photographs: 0 of 14. Image downloads were also blocked. Each published card now has a distinct, labeled "Illustrative image"
crop of the supplied AI-generated collection graphics (no repeats within a collection). Four real photos have licenses identified
in `313events_ALL_252_image_links.csv` but are not downloaded: Belle Isle Park (CC0), Kensington Metropark (CC BY-SA 3.0),
Nichols Arboretum (CC BY 3.0), Yates Cider Mill (CC BY-SA 3.0).

## Categories
Chips render only for categories with a published entry. Not restored (no verified entry yet): Fall - Pick Apples, Pick Pumpkins,
Corn Mazes, Hayrides; Halloween - Horror Films, Costume + Parties; Fall Colors - Scenic Drives, Easy Walks, Photo Spots, Day Trips.

## Blockers
1. Official-site verification of every candidate (needs a session with outbound web access).
2. Licensed or official photography with attribution.
3. Distance filter omitted until coordinates are verified.
4. Seasonal map does not exist; links go to the general events map and say so.
5. Mockup hero art not supplied; heroes use the supplied graphics.
6. Sitemap and Homepage V2 links not updated (out of scope).
