# EPIC-015 — Self-Service Event Promotion

**Status:** BACKLOG — not started. Part of the monetization/growth program (`ROADMAP.md`), Product Owner's **EPIC 4**. Fourth in `DEC-019`'s build order, after Measurement, Affiliate, and Display/Sponsorship — deliberately **not** first, since it requires payment/fulfillment automation that the earlier, simpler revenue streams don't.

## Objective

Let a promoter purchase additional distribution for their own event without Jody selling or managing campaigns by hand. The required lifecycle, verbatim from the Product Owner: `BUY → PAY → START → DISPLAY → EXPIRE → REPORT`, with no manual step for Jody once it's live, and every promoted item always visibly labeled as promoted.

## Problem

313.events has no commerce/payment infrastructure of any kind today (confirmed — no payment processor integration, no purchasable-feature code path anywhere in the codebase), and no self-service purchase flow of any kind beyond the existing free submission forms (`submit.html`). This epic is a genuinely new capability, not an extension of anything live, which is exactly why `DEC-019` sequences it **after** the simpler, non-payment-requiring revenue streams (Measurement, Affiliate) — the product should have real signal that promotion demand exists (from manually-sold `EPIC-016` sponsorships, see that epic's own build-order rationale) before automating purchase/fulfillment for it.

## Scope — proposed packages (Product Owner's own first draft, not final)

- **Boost** — more visibility in appropriate listings.
- **Weekend Boost** — enhanced placement in weekend discovery (`EPIC-009`'s This Weekend lens).
- **Category Boost** — promoted within a category (Music/Art/Family/etc.).
- **Orbit Boost** — broader regional exposure (the full Detroit Orbit, per `SERVICE_AREA.md`).

**V1 should be fixed-price packages, not a bidding/ad-tech auction platform** — an explicit Product Owner call, stated directly, not left as an open question.

## Scope — mechanics

- Payment processing (new infrastructure — needs its own vendor/integration decision, not specified here).
- The `BUY → PAY → START → DISPLAY → EXPIRE → REPORT` lifecycle as an automated state machine: a promoter buys a package, pays, the promotion starts and displays on its scheduled placement, expires automatically at the end of its purchased window, and a performance report is available afterward — all without Jody touching any step.
- **Mandatory, consistent labeling** of every promoted placement — this is non-negotiable per the Product Owner's framing and must be the same visual labeling convention `EPIC-016` establishes for sponsorship/display, not a separate one invented here.
- Reporting, built on `EPIC-011`'s shared Event Connections instrumentation (impressions/clicks attributable to the specific promotion window), not a separate metrics system.

## Out of scope

Smarter/dynamic pricing (explicitly deferred — "later pricing can become smarter, but V1 should probably be fixed-price packages"). Any auction/bidding mechanic.

## Success criteria

A promoter can complete the entire lifecycle — discover the option, buy, see their event promoted, see it expire, see a report — with zero manual intervention from Jody, and every promoted placement is clearly labeled as such to a visitor.

## Dependencies

**`EPIC-016`'s manually-sold sponsorship inventory and design system** — per `DEC-019`, this epic's packages (Boost, Weekend Boost, etc.) should reuse whatever visual placement conventions and labeling `EPIC-016` establishes manually first, not invent a second design language for "promoted" vs. "sponsored." **`EPIC-011`** (reporting). **`EPIC-009`** (Weekend/Category boosts place into those existing discovery lenses, not a new parallel surface). **Payment processing** — a net-new vendor integration, not yet selected or scoped.

## Stories / tasks

Not yet broken into stories — per `DEC-019`'s build order, this epic should not be scoped into implementable tickets until `EPIC-016`'s manually-sold inventory has proven real demand exists. Scoping payment/fulfillment automation ahead of that risks building automation for a business model that hasn't been validated yet, which is exactly the principle the Product Owner stated directly: "don't automate a business model before proving somebody will pay for it."

## Risks

Building this before `EPIC-016` validates demand is the single largest risk the Product Owner flagged for the whole program — this epic is deliberately sequenced to avoid it, not accidentally delayed.

## Open questions

Package pricing (no evidence yet — same "need evidence before pricing" caution the Product Owner applied to `EPIC-017`'s Organizer Pro). Payment processor choice. See `DISCOVERY-017` in `BACKLOG.md`.

## Relevant decisions

`DEC-017` (four-revenue-stream model — this is the "automated transactional" stream). `DEC-018` (display/sponsorship design principles — this epic's labeling must match them). `DEC-019` (build order and the "prove demand before automating" principle, stated here in its clearest form).
