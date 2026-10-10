# Seasonal collections: content and image coverage

Generated for the Preview of `feature/seasonal-collections`. Source of truth is `seasonal/collections.js`.

## Published (14 destinations)
| Collection | Published | Inventory candidates | Real photos |
|---|---|---|---|
| /fall | 4 | 71 | 0 |
| /halloween | 6 | 52 | 0 |
| /fall-color | 4 | ~129 | 0 |

## Images
Every published card uses a cropped, labeled "Illustrative image" taken from the three supplied
AI-generated collection graphics. None represents a real photograph of the destination. Heroes use the same
graphics (the mockups' own hero art was not supplied). Source, credit, license and `illustrative: true` are
recorded per entry in `collections.js`.

Real-photo status from `313events_ALL_252_image_links.csv`: 4 files have a license identified but none were
downloaded (outbound fetch was blocked): Belle Isle Park (CC0), Kensington Metropark (CC BY-SA 3.0),
Nichols Arboretum (CC BY 3.0), Yates Cider Mill (CC BY-SA 3.0). 247 rows are NOT_SOURCED. Share-alike/attribution
obligations must be met before use.

## What was verified
Identity and location: inventory entry plus independent web coverage. Official sites were NOT fetched
(session network blocked). `website` is set only where the domain appeared in search results, flagged
`websiteChecked: false`. No hours, admission, dates, accessibility, coordinates or distance are shown.

## Gaps / release blockers
1. Official-site verification of every published entry (and 2026 season confirmation).
2. Real or licensed photography per destination; replace illustrative crops.
3. Remaining ~250 inventory candidates are unpublished.
4. Distance filter ("Detroit + 50 mi") omitted: needs verified coordinates.
5. Map tab links to /map.html; no seasonal map layer.
6. Hero art differs from the mockups (mockup hero images were not supplied).
7. Mockup tiles "Horror Films", "Costume + Parties", scenic drives, easy walks, photo spots, day trips, pick apples/pumpkins, corn mazes, hayrides have no verified entries yet, so no chips render for them.
8. /sitemap not updated; homepage cards (Homepage V2, PR #53) not linked.
