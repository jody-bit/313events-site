# Seasonal collections: coverage, verification and gaps

Private. Source of truth: `entries.json` (all 60 destination records) and `candidates.json` (all 252 inventory rows).
Counts below are checked against the data by `test/seasonal-collections.test.js`.

## Counts
| Collection | Inventory rows | Records | Public (approved) | No record yet |
|---|---|---|---|---|
| /fall | 71 | 4 | 0 | 67 |
| /halloween | 52 | 52 | 0 | 0 |
| /fall-color | 129 | 4 | 0 | 125 |

Ledger states across the 252 rows: 249 `HOLD_UNVERIFIED`, 2 `READY_FOR_REVIEW` (Hallowe'en in Greenfield Village, Zoo Boo),
1 `CONTENT_VERIFIED` (Crossroads Ghosts & Goodies). Nothing is `PUBLISHED`: no record has the explicit approval (gate item 5).

## What changed in the consolidation
14 entries had been `published` on `feature/halloween-completion` under the older gate. They are preserved as records, not
grandfathered. See `MIGRATION_REVIEW.md`. All 52 Halloween destinations have a record, an image strategy and a fallback chain.

## Verification
Official sites were read in Chrome on 2026-10-11 for the destinations that have an `official` evidence item (the record
says which). That read found the image and the page title only; relevance to the collection and 2026 dates were not
reviewed except where `relevance` is recorded. No hours, admission, dates or accessibility are shown anywhere.

## Images
Halloween defaults (pinned in `defaults.json`): 44 generated cards, 5 linked official images, 3 owner photos (Eloise Asylum,
Greenfield Village, Glenlore). 21 linked images are recorded (all loaded in Chrome on 2026-10-11), none with rights-holder
permission. The owner's decision of 2026-10-11 accepts the legal risk of linking them; that is not usage rights.
Owner photos carry owner authorization, which is not a Creative Commons license. Four fall-color photos with identified
Creative Commons licenses are noted in `313events_ALL_252_image_links.csv` but are not downloaded.

## Blockers to publication
1. Gate 5: an explicit approval, by the approving person, for each destination to be published.
2. Gate 1 and 2 (official-site read, relevance) for every record that does not have them yet.
3. For linked images: either rights-holder permission or a decision to publish on recorded risk acceptance alone.
4. For owner photos: the photographer's name and the date of the grant are not recorded in the photo library.
5. Distance filter omitted until coordinates are verified; the seasonal map does not exist (links go to the general events map).
