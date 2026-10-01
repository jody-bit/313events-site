# EPIC-016 — Native Display Advertising + Sponsorship

**Status:** BACKLOG — not started. Part of the monetization/growth program (`ROADMAP.md`), Product Owner's **EPIC 5**. Per `DEC-019`'s build order, this is **third** priority (after Measurement and Affiliate) and deliberately **moved ahead of** Self-Service Promotion (`EPIC-015`) and Organizer Pro (`EPIC-017`) — reasoning below.

## Objective

Monetize audience attention without making 313.events uglier or less useful. Explicitly reject the "banner soup"/programmatic-ad-tech mental model: treat advertising as **designed inventory** inside the product, leaning on the fact that 313.events already has (per `PRODUCT.md`'s own description of its visual system, and `editorial-policy.html`'s and `terms.html`'s existing legal/trust pages) a strong enough visual brand that sponsorship can read as contextual and Detroit-relevant rather than bolted-on.

## Problem — and what's already true today

**313.events has already made this promise publicly, in writing, before this epic existed.** `editorial-policy.html`'s existing "Sponsored content" section states: *"313.events does not currently run paid placements, sponsored listings, or paid editorial coverage. If that changes, any sponsored or paid material will be clearly labeled as such, near the content itself — not buried on a legal page — and paid placement will never secretly determine what we choose to cover editorially. Our editorial judgment on 'On the Radar' and elsewhere remains independent of any advertising or sponsorship relationship."* This epic is the moment that "if that changes" clause becomes true — it must honor that promise exactly, not merely in spirit, and the page copy needs updating the moment any inventory below actually ships (same "update the live legal page as a hard acceptance criterion" pattern as `EPIC-011`/`EPIC-014`).

## Scope — inventory types (Product Owner's own design, not to be reinvented)

| Placement | Description |
|---|---|
| **Signal Sponsor** | Between meaningful content sections — "THE WEEKEND SIGNAL, PRESENTED BY [brand]." Shared inventory with `EPIC-013`'s Weekend Signal digest. |
| **Orbit Partner** | On regional discovery surfaces — "EXPLORE THE DETROIT ORBIT, Supported by [brand]." |
| **Neighborhood Partner** | On a neighborhood page (extending `neighborhoods.html`) — "EXPLORE CORKTOWN, Neighborhood partner: [brand]." **Sponsorship must never alter which events appear for that neighborhood** — stated directly by the Product Owner, and structurally identical to `EPIC-010`'s existing Radar firewall, just applied to a different surface. |
| **Calendar placement** | A designed "313 PARTNER" creative inserted after roughly 8–12 event cards in a feed, then the event stream continues unchanged. |
| **Radar sponsorship** | "ON THE RADAR, Presented by [brand]" — the one placement needing surgical separation (see below). |
| **Newsletter sponsorship** | One primary + at most one secondary sponsor unit in the Weekend Signal email (`EPIC-013`) — explicitly not "seventeen ads." |
| **Venue/category sponsorship** | E.g. "Detroit Electronic Music presented by ___," "Free Things To Do presented by ___," "Halloween in the Orbit presented by ___" — context-buying, not generic-impression-buying, which the Product Owner flags as potentially the most valuable inventory precisely because it's specific. |

## Hard requirements (locked now, per the Product Owner — not subject to later relaxation without a new decision)

No popups. No interstitials. No autoplay video/audio. No ads masquerading as events (a sponsored placement must never be styled or positioned so it could be mistaken for a real event listing). No giant sticky units obscuring content. No layout shift while ads load. No invasive third-party retargeting by default. No multiple ad networks competing to fill every available rectangle. **A density ceiling**: advertising may occupy no more than approximately 10% of the primary discovery experience — the exact number needs testing, but the principle itself is locked now (`DEC-018`).

## The Radar sponsorship firewall (ties directly to `EPIC-010`/`DEC-015`, extended by `DEC-020`)

A sponsor may support the **On the Radar section** ("Presented by [brand]"). A sponsor may **never** determine, or appear to determine, **which events are selected** for On the Radar. The public-facing language the Product Owner proposes — *"Sponsors support On the Radar. Sponsors do not determine On the Radar selections."* — should be the literal copy used near the placement, not just an internal principle. This is the single highest-risk placement in this epic's whole scope for quietly eroding editorial trust, and it is the one `editorial-policy.html` already specifically calls out by name ("Our editorial judgment on 'On the Radar'... remains independent").

## Out of scope

Any ad-network integration that would reintroduce the "banner soup"/rectangle-filling pattern this epic explicitly rejects. Programmatic bidding of any kind — every placement above is sold directly (see build-order rationale below), not auctioned.

## Why this is sequenced ahead of Self-Service Promotion and Organizer Pro (`DEC-019`)

**Inventory can be defined and sold manually before any automation exists.** The Product Owner's own framing: "Weekend Signal Sponsor: available. Homepage Partner: available. On the Radar Presenting Sponsor: available. Initially you sell a few directly and insert them manually. Once demand proves itself, then automate sales and fulfillment." This is the clearest instance in the whole program of the cross-cutting principle — **don't automate a business model before proving somebody will pay for it** — and it's why `EPIC-015`'s self-service purchase automation is sequenced to come *after* this epic demonstrates real paid demand, not before.

## Success criteria

At least one real, manually-sold sponsorship is live, visibly labeled, and within the density ceiling, with zero popups/interstitials/autoplay/layout-shift, and the Radar-sponsorship firewall copy is live and accurate the moment any Radar sponsorship exists.

## Dependencies

`EPIC-010` (the firewall this epic's riskiest placement extends). `EPIC-013` (shared Weekend Signal inventory). `neighborhoods.html` (Neighborhood Partner placement). `EPIC-008` (On the Radar must have real editorial selections before "Radar sponsorship" means anything). `editorial-policy.html`/`terms.html` (must be updated the moment any paid placement goes live — hard acceptance criterion, not a follow-up).

## Stories / tasks

See `BACKLOG.md`: `STORY-022` (a small 313 advertising design system: placement components + the mandatory "promoted"/"sponsored" label, built before any real sponsor is sold, so the first sale has something real to show). Selling and manually inserting the first sponsorship is a business-development action, not an engineering story, and isn't tracked here.

## Risks

The named risk, directly from the Product Owner: *"I'd rather sell one beautiful $1,500 sponsorship than serve 400,000 garbage impressions to make $300."* The failure mode this epic exists to prevent is optimizing for impression volume over placement quality — every story under this epic should be checked against that standard before it ships.

## Open questions

The exact density-ceiling percentage (principle locked at "~10% of the primary discovery experience," exact number needs real testing — `DISCOVERY-018` in `BACKLOG.md`). Whether "ads masquerading as events" needs an explicit, automated check (e.g. a visual-similarity or layout-structure test) or is purely a design-review discipline — not decided.

## Relevant decisions

`DEC-015`/`DEC-020` (the firewall this epic's Radar placement must honor exactly). `DEC-017` (four-revenue-stream model — this is the "media" stream). `DEC-018` (hard requirements + density ceiling, this epic's own founding constraint). `DEC-019` (build order and the manual-first principle).
