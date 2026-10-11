# Seasonal collections: coverage, verification and gaps

Private. Source of truth: `entries.json` (all 74 destination records) and `candidates.json` (all 252 inventory rows).
Counts below are checked against the data by `test/seasonal-collections.test.js`.

## Counts
| Collection | Inventory rows | Records | Public (approved) | No record yet |
|---|---|---|---|---|
| /fall | 71 | 14 | 0 | 57 |
| /halloween | 52 | 52 | 0 | 0 |
| /fall-color | 129 | 8 | 0 | 121 |

Ledger states across the 252 rows: 233 `HOLD_UNVERIFIED`, 18 `READY_FOR_REVIEW` (Hallowe'en in Greenfield Village, Zoo Boo,
and the 16 records of launch proposal 1: 11 fall, 5 fall-color), 1 `CONTENT_VERIFIED` (Crossroads Ghosts & Goodies).
Nothing is `PUBLISHED`: no record has the explicit approval (gate item 5).

## Launch proposal 1 (2026-10-11)
`launch-1.json` lists the 16 records proposed for the first incremental launch of /fall and /fall-color. Each has an official-site
read (two independent reads, logged in `verification-2026-10-11.json`), a relevance note with its basis, and an image by a recorded
route: 2 owner photos (Diehl's, Highland) and 14 labelled illustrations. `LAUNCH_PROPOSAL_1.md` has one decision packet per record,
the held rows and why, the image audit and the blockers. `?qa=1&launch=1` on a Preview shows them in the public card layout.
None is approved.

## What changed in the consolidation
14 entries had been `published` on `feature/halloween-completion` under the older gate. They are preserved as records, not
grandfathered. See `MIGRATION_REVIEW.md`. All 52 Halloween destinations have a record, an image strategy and a fallback chain.

## Verification
Official sites were read in Chrome on 2026-10-11 for the destinations that have an `official` evidence item (the record
says which). That read found the image and the page title only; relevance to the collection and 2026 dates were not
reviewed except where `relevance` is recorded. No hours, admission, dates or accessibility are shown anywhere.

## Images
Fall and fall-color launch records use the owner-photo route (2) or the labelled-illustration route (14, "Illustrative image" badge);
where a linked image was recorded (Wiard's, Stony Creek) it is parked as `image.remoteParked`, not adopted.
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
