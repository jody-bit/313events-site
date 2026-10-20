# Seasonal expiration: editorial disposition process (report-first; owner decision 2026-10-20)

Nothing expires on its own. Collection pages are a static list generated from `entries.json`; an entry leaves a collection only through a reviewed commit that changes it. This safeguard only REPORTS. It never hides, unpublishes or edits an entry, and there is no scheduled production write.

## Private fields on an entry in `entries.json` (optional; none is shown publicly)
- `season.end` (YYYY-MM-DD) and `season.endSource` (where it was read). Populate ONLY when the attraction's own authoritative source states the final operating date. Never from a generic date range, an incomplete schedule, a secondary roundup, or an inaccessible source (an unreachable site is not evidence of closure). A private `schedule` is not a `season.end`.
- `reviewOn` (YYYY-MM-DD): when editorial verification must happen.
- `expiryDisposition`: `{ "action": "unpublish" | "keep-published", "by": "...", "at": "YYYY-MM-DD", "note": "..." }`.

## Report
`node scripts/seasonal-expiration-report.js [--verbose] [--today YYYY-MM-DD]`
- SEASON_ENDED: verified `season.end` is before today (Detroit date). The last operating day itself is not ended.
- REVIEW_DUE: `reviewOn` is today or earlier.
- INSUFFICIENT_EVIDENCE: no usable verified `season.end` (missing, malformed, or no `endSource`). Informational. It never fails anything and never suppresses anything.
Operating dates are not opening hours: do not derive one from the other.

## The one failure
A SEASON_ENDED entry that is still PUBLISHED and has no valid `expiryDisposition` fails `node scripts/build-seasonal.js` (and `--check`). Missing or uncertain dates never fail. The build also fails for a SEASON_ENDED entry whose `expiryDisposition.action` is `unpublish` but that is still PUBLISHED, so an unpublish decision and its status change must land in the same PR.

## Steps for Editorial
1. Before an attraction's expected end, read the official source; record `season.end` + `season.endSource` (or `reviewOn` if the final date is not yet stated).
2. After the end date the report lists it under SEASON_ENDED and the build fails until a disposition exists.
3. Record the decision as `expiryDisposition` (not `disposition`, which the Halloween release tooling already uses as its exclusion marker). `unpublish`: also prepare the status change in the same PR and send it for owner review (the PR is the proposed unpublish; nothing is executed automatically). `keep-published`: say why (for example the attraction extended its season) and update `season.end`.
4. The change goes through R&Q exact-head validation and a separate owner merge GO. Nothing deploys without it.

## Planned reviews (proposals only, for owner review)
- Nov 1-2: attractions with a verified final date of Oct 31 or Nov 1.
- Nov 8: Erebus (private schedule says through Nov 7; that is not yet a verified `season.end`). Confirm the final date and current status from an authoritative source first.
