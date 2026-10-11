# Seasonal collections: editorial handoff

Engineering has built the gate; editorial supplies the evidence. Nothing here was verified, licensed or approved by
engineering. A destination becomes a public card only when its record passes **all five** gate items below, and the
tests fail if a record's declared `status` disagrees with what its fields prove.

## Workflow

Official verification -> Image licensing -> Image acquisition -> Publication approval -> Live destination card

| Ledger state | Meaning | What the record has |
|---|---|---|
| `HOLD_UNVERIFIED` | Not public. Default for all 252 rows today. | no `evidence` item at level `official`, and/or no confirmed `relevance` |
| `CONTENT_VERIFIED` | Official source read, relevance confirmed. Image work not started. | gate items 1 + 2 |
| `IMAGE_PENDING` | Verified; an image source or license is recorded but the asset or its rights are incomplete. | 1 + 2, partial 3 / 4 |
| `READY_FOR_REVIEW` | Content, image file and rights complete; waiting for a person to approve. | 1 - 4 |
| `PUBLISHED` | Public card. | 1 - 5 (including `approval`) |

`status` is the existing field on each entry (and on each row of `candidates.json`); no parallel status system exists.
`readiness(entry)` in `seasonal/collections.js` derives the state from the fields; `status` must equal it.

## Files and fields to update when one destination completes review

1. **`seasonal/collections.js`**: the destination's entry under `COLLECTIONS[<slug>].entries` (add one if the row has
   none; keep its `id` stable, it is the link from `candidates.json`).
   - Identity (all required): `id`, `name`, `city`, `region`, `categories` (ids from that collection), `featured`, `summary`
     (verified facts only; no hours, admission, dates or accessibility unless an official source says so and the
     renderer is extended to show them), optional `website` (https).
   - Gate 1, official verification: an `evidence` item `{ level: "official", note, url (https, the official page),
     websiteChecked: true, checkedAt: "YYYY-MM-DD", checkedBy }`.
   - Gate 2, relevance: `relevance: { confirmed: true, note, checkedAt, checkedBy }`.
   - Gate 3, acquired image: `image.acquired: { file, bytes, sha256, width, height, acquiredAt }` plus `image.src` equal
     to `acquired.file`, and `image.illustrative: false`. The file must be committed under `assets/seasonal/` (a new
     file named for the destination; never overwrite the shared card artwork). `bytes` and `sha256` must match the file:
     `node scripts/build-seasonal.js` fails otherwise. A photo URL, or a recorded license without the downloaded file, does
     not count.
   - Gate 4, rights: `image.license`, `image.licenseUrl` (https), `image.credit` (the attribution to display),
     `image.rightsVerifiedAt`, and `image.sourcePage` (where the file came from).
   - Gate 5, approval: `approval: { by, at: "YYYY-MM-DD" }`. Added only by the person approving; never copied from a
     verification note.
   - `status`: set to the state the fields now prove (it is checked).
2. **`seasonal/candidates.json`**: the row for that destination: `status` (same ledger state), `reason` (one line on what
   is outstanding, or why it is public), `published_id` (the entry id). `published_id` is a stable link and does not mean public.
3. **`assets/seasonal/<new file>.webp`**: the image itself (see gate 3).
4. **Regenerate and commit** `fall.html`, `halloween.html`, `fall-color.html`: `node scripts/build-seasonal.js`.
5. Run `node --test`.

Nothing else changes: `index.html` and `data/dont-miss.json` (the homepage cards link to the three pages and never to a
destination), the renderer, the CSS and the vercel rewrites need no edit to publish a destination.

## Where the editorial spreadsheets map

`313events_ALL_252_image_links.csv` and `313events_destination_image_manifest_2026.csv` columns:
`photographer_credit` -> `image.credit`; `license_permission` -> `image.license` (+ `image.licenseUrl`);
`image_source_page` -> `image.sourcePage`; `image_filename`/`asset_key` -> the file under `assets/seasonal/`;
`image_status` of `LICENSE_VERIFIED_DOWNLOAD_PENDING` = IMAGE_PENDING at best, and only if the destination is also
`CONTENT_VERIFIED`. Neither file records official-source verification, which is gate 1 and is separate.
The editorial baseline of "5 destinations with documented official-source verification" could not be located in the repository;
those five records must be entered with their evidence (gate 1 + 2). They are deliberately **not** auto-approved.

## Testing without publishing: fixtures

`seasonal/fixtures.js` holds invented, labelled records (`fixture: true`, names start `FIXTURE:`, city "Fixtureville").
Open `/fall?fixtures=1` (or `/halloween`, `/fall-color`) on a **Preview**: `seasonal/page.js` merges them only after
`/config.js` reports a non-production environment, and shows a "TEST FIXTURES" banner and a "Test fixture" badge on each
card. In production, or if config is unavailable, the flag is ignored. Fixtures are never in the built HTML, in
`collections.js` or in `candidates.json`.
