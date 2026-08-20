# 313.events — New Data Source Research: Publications, Museums, Cinemas

You asked to look at Detroit publications (Metro Times, Hour Detroit, Free Press, Detroit News, etc.) for events calendars to pull in, then expanded it to every museum and movie theater/microcinema in town. This is that research pass, using the same method already proven on HALO Detroit and Trinosophes: find the calendar, check for a real feed/API, check robots.txt, check Terms of Use, and give a straight verdict — nothing here has been built or scraped yet, this is reconnaissance only.

**One general finding up front, true across almost every source below: none of these expose a clean API the way Ticketmaster does.** At best a couple have an RSS/ICS export. Everything else, if pursued, would be HTML scraping — the same category of work as the existing HALO Detroit and Trinosophes crons, not a new kind of engineering problem.

**A tooling caveat:** this session's own network policy blocked outbound requests to Gannett-owned domains (freep.com, detroitnews.com, gannett.com) outright, independent of anything those sites actually do. Where that happened, the verdict below is lower-confidence and flagged — worth a two-minute manual browser check on your end before fully ruling those out.

---

## Publications

| Outlet | Calendar | Platform | Feed/API? | robots.txt | ToS | Verdict |
|---|---|---|---|---|---|---|
| **Metro Times** | `community.metrotimes.com/detroit/EventSearch`, sitemap at `.../Sitemap.xml?id=Event` | Gyrobase (legacy alt-weekly CMS, shared across Euclid Media network) | No RSS/JSON, but a public **sitemap of individual event URLs** exists | Search/listing UI (`/EventSearch`) is blocked; individual event pages and the sitemap are **not** blocked | No current ToS page found (old link 302s away); only "reproduction without permission prohibited" on the privacy page | **Worth pursuing** — sitemap + individual event pages is a viable ingestion path even though the search UI is off-limits |
| **Hour Detroit** | `hourdetroit.com/events/` | WordPress | No events-specific feed; site's WAF returns 403 on automated requests to `/events/` and the terms page even though robots.txt itself is permissive | Permissive on paper | Couldn't retrieve (blocked) | **Not viable right now** — real-world access is blocked regardless of stated policy |
| **Detroit Free Press** | None found | Gannett/USA Today Network | — | Not retrievable (network block) | Not retrievable; Gannett has a reputation for being restrictive about reuse | **No calendar found** — low confidence, recommend a manual check |
| **Detroit News** | `detroitnews.com/things-to-do/events/`; a 2014-era calendar was built on a vendor called SpinGo, current status unclear | Unknown | None confirmed | Access pattern suggests the events/dining paths are blocked | Not retrievable (network block) | **Likely blocked** — low confidence, recommend a manual check |
| **Crain's Detroit Business** | `crainsdetroit.com/events` | Custom Next.js | None found | Legal/infra paths blocked by Cloudflare | Not retrievable | **Not relevant to scope** — confirmed business/networking events only (Power Breakfasts, Notable awards, sector summits), nothing arts/culture/nightlife |
| **Model D Media** | Doesn't exist — "Scene" is an article archive, not a calendar | WordPress / Issue Media Group | — | Fully open | **Explicitly prohibits scraping, harvesting, aggregation, and republishing** in its Terms of Use | **Skip** — no calendar to take, and their ToS is a hard no on this kind of use generally |
| **Deadline Detroit** | Doesn't exist | Custom | — | Unable to check (tooling error) | Unable to check | **No calendar found** |
| **BridgeDetroit** | No standing calendar — only a one-off "2025 Election Events" listing page tied to that election cycle | WordPress/Newspack | None live | Fully open | CC BY-NC-ND, explicitly bars automatic/wholesale republishing | **No calendar found** (and their content license wouldn't allow bulk ingestion anyway) |

---

## Museums

*Excludes the Detroit Institute of Arts, Detroit Historical Museum, and MOCAD — all three are already in your venue data.*

| Museum | Calendar | Platform | Feed/API? | robots.txt | Verdict |
|---|---|---|---|---|---|
| Michigan Science Center | mi-sci.org/calendar/ | WordPress | None found | Permissive | **Scrape-feasible** |
| Motown Museum | motownmuseum.org/event/ | WordPress | None found | Permissive | **Scrape-feasible** |
| Belle Isle Nature Center | belleislenaturecenter.org/program-calendar/ | WordPress (Detroit Zoo) | None found | Permissive | **Scrape-feasible** |
| Belle Isle Aquarium | belleisleconservancy.org (summer calendar) | Unclear | None found | Wide open | **Scrape-feasible** |
| Dossin Great Lakes Museum | detroithistorical.org/dossin-great-lakes-museum/events-calendar | Drupal (same parent org as Detroit Historical Museum) | None found | Permissive | **Scrape-feasible** |
| Tuskegee Airmen National Museum | tuskegeemuseum.org/events/ | Unclear | None found | No robots.txt at all (default allow) | **Scrape-feasible** |
| Charles H. Wright Museum | thewright.org/whats-on/events | Drupal | None found | Standard, admin paths only | **Scrape-feasible**, ToS unconfirmed |
| Detroit Public Library (Main) | detroitpubliclibrary.org/events/main | Craft CMS | None found | Blocks account/search/config paths only | **Scrape-feasible**, ToS unconfirmed |
| **Scarab Club** | scarabclub.org/calendar | Squarespace | **Yes — per-event ICS export** | Explicit blocklist of ~150 named bots/scrapers with `Disallow: /` for each | **Don't scrape quietly** — the ICS feed is genuinely useful, but the robots.txt is a clear, deliberate signal. This is a small, artist-run nonprofit — worth just emailing them and asking to use the feed, rather than treating it as fair game the way a public sitemap is |

---

## Cinemas & microcinemas

*Excludes Trinosophes (already integrated) and the DIA Film Theatre (already integrated).*

| Venue | Calendar | Platform | Feed/API? | robots.txt | Verdict |
|---|---|---|---|---|---|
| Cinema Detroit | cinemadetroit.org | WordPress | None found | Permissive | **Scrape-feasible** |
| Redford Theatre | redfordtheatre.com/events/ | WordPress/Elementor | None found | Only blocks parameterized calendar views, not the base page | **Scrape-feasible** |
| Mothlight Microcinema | mothlightmicrocinema.org | Cargo | None found | Permissive | **Scrape-feasible**, but nomadic/no fixed address — every listing would need its own venue resolved, same problem as any pop-up series |
| **Senate Theater** | senatetheater.com/events-input | Squarespace | Squarespace's own export formats blocked | **Explicitly names ClaudeBot and anthropic-ai in its disallow list** | **Do not scrape.** This one names AI crawlers specifically — respect it and don't build around it |
| Marlene Boll Theatre | — | — | — | — | **No calendar exists** — rentable space, no in-house programming |
| AMC / Emagine inside Detroit city limits | — | — | — | — | **None exist** — every chain location found is suburban (Royal Oak, Southfield, Dearborn) |
| Wayne State / other university series | — | — | — | — | **Nothing found** — no distinctly-named, currently-active public screening calendar |

---

## What this actually means for 313.events

**Best near-term targets**, in rough order of how clean the path is:

1. **Metro Times**, via its sitemap of individual event pages rather than the blocked search UI. This is the highest-volume source of the group and, notably, the same shape of problem as Ticketmaster/HALO/Trinosophes today: real events, no clean API, scrapeable within the site's own stated rules.
2. **The museum list** (Michigan Science Center, Motown Museum, Belle Isle Nature Center, Belle Isle Aquarium, Dossin Great Lakes Museum, Tuskegee Airmen Museum, Charles H. Wright, Detroit Public Library) — all technically scrape-feasible, all WordPress-or-similar with no structured feed, so each is a small standalone scraper in the same style as the existing crons.
3. **Cinema Detroit and Redford Theatre** — same shape, straightforward WordPress scrapes.
4. **Scarab Club** — hold off on scraping and just ask them directly for their ICS feed. It's a small nonprofit that took the trouble to explicitly block bots; a quick email is more in keeping with how 313.events has approached everything else (sources.html is built on being straightforward about where data comes from).

**Explicitly off the table:**
- **Senate Theater** — names AI crawlers directly in robots.txt.
- **Model D Media** — ToS explicitly bars scraping/aggregation/republishing.
- **BridgeDetroit** — no standing calendar, and its content license bars bulk republishing anyway.
- **Crain's Detroit** — real events, but business/networking, not arts/culture/nightlife — out of scope, not a legal issue.

**Needs a human check, not a verdict from here:**
- **Detroit Free Press and Detroit News** — this session couldn't reach Gannett's domains at all, so "no calendar / likely blocked" is a guess dressed up as a finding. Worth five minutes in an actual browser before writing these off. Detroit News in particular had a real events calendar as recently as 2014 (vendor: SpinGo) — whether that ever got replaced or just quietly died is worth confirming directly.
- **Hour Detroit** — robots.txt says yes, the live site says no (its firewall 403s automated requests). Worth a manual spot-check in case that's inconsistent by page or time of day.

**One data-model note worth flagging now, before any of this gets built:** Metro Times' calendar is self-serve — venues and promoters submit their own listings, the same way HALO Detroit and Trinosophes already are venue-run pages you scrape directly. That's a different kind of source than "Metro Times' own editorial content," and it runs into the same source-vs-organizer conflation already documented in `FOUNDATIONAL_ITEMS.md` §3 — the listing came from Metro Times' platform, but the promoter is the actual organizer. Worth keeping in mind if/when any of this actually gets built.
