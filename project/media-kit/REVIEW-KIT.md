# Media / Press kit: review kit (STORY-028)
Owner of copy and assets: Editorial. `/media` page: Experience, after the #405 fix. Release gate: R&Q-equivalent review per CLAUDE.md. Nothing is published; the publication hold applies. No outreach, tracking or spend.

## Acceptance checks (3)
1. Copy is accurate and the public contact is jody@sentientproductions.com, labelled "Media contact". Check: every claim below maps to an existing page.
2. Downloads are valid and accessible. Check: `unzip -t assets/media/313-events-media-kit.zip`; PDF is tagged (pdfinfo "Tagged: yes"), 2 pages, title "313.events Press Kit"; SVGs carry title/desc; PNGs have transparent backgrounds.
3. `/media` is responsive and linked from About and the footer (Experience, 1440/375/320).

## Claim to source map
| Claim | Source |
|---|---|
| Independent Detroit-area event discovery and editorial platform; Detroit Orbit; product of Sentient Productions LLC, Detroit, Michigan | about.html |
| Aggregated from organizers, venues, public sources, submissions; inclusion is not endorsement; On the Radar is curated press coverage (Metro Times, WDET, BridgeDetroit); corrections (the "no paid placements" line was removed from the bios and fact sheet on Jody's direction, not freshly verified as a future-proof statement) | editorial-policy.html |
| Accessibility effort, no certification claim | accessibility.html |
| Instagram @313.thecityison; contact email | footer / about.html |

## Deliberately left out
Launch date, traffic or audience numbers, partnerships, founder quotes, event counts (volatile), the LLC street address (only the email was authorized as the contact), any third-party flyer or photo.

## Wordmarks
`313-events-wordmark-on-dark.svg` is a byte copy of `assets/wordmark.svg`; `...-on-light.svg` is a byte copy of `assets/wordmark-reversed.svg`; `313-events-signal-mark.svg` is a copy of `assets/313-events-signal.svg`. PNGs are rendered from those SVGs with a transparent background. No redraw, recolor or edit.

## Still open before publication
- Product screenshots: mobile 375 calendar (public site, captured Nov 9, supplied by Jody) is in the PDF and ZIP, captioned "as of Nov 9, 2026; illustrative UI, counts are not a marketing claim"; the upload is kept unchanged in `originals/` (it is a JPEG, converted to PNG for use). Desktop calendar shot (supplied by Jody, captured Nov 9) is also in; its upload is kept unchanged in `originals/`. No images were hidden or altered: the calendar UI holds no third-party photos.
- Jody's read of the long bio (`bio.md`).
- Experience: `/media` page, About and footer links, after #405.
- Publication GO.

## Rebuild
Edit `epk.html`, then render the PDF with Chromium (Letter, margins 0.7in, tagged, background printing) into `assets/media/`, and rebuild the ZIP from the files listed in its README.
