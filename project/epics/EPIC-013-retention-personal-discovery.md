# EPIC-013 — Retention + Personal Discovery

**Status:** BACKLOG — not started. Part of the monetization/growth program (`ROADMAP.md`), Product Owner's **EPIC 2**. Runs alongside the revenue-building epics per `DEC-019`.

## Objective

Turn occasional visitors into habitual users, while keeping browsing itself completely open — identity (an email, a saved preference) is requested only where it delivers obvious, immediate value to the visitor, never as a precondition for using the comprehensive calendar.

## Problem

313.events has no concept of a returning visitor today: no accounts, no saves, no follows, no notification preferences (confirmed — `EPIC-005`'s own framing already establishes "no auth, no accounts, no real-time infrastructure exist anywhere in this project today," and nothing in this epic's research found that to have changed). Every visit starts from zero. This is a real gap distinct from `EPIC-005`'s much larger, explicitly-undecided "social/community layer" ask — this epic is scoped narrowly to retention mechanics (saves, follows, alerts), not profiles, messaging, or a social graph.

## Scope

- **Save events**, with no account required for the minimal version (a device-local save) and an optional lightweight email capture to make saves durable across devices/browsers — reusing the already-live **Resend** transactional-email infrastructure (confirmed in `privacy.html`'s third-party-services disclosure) rather than standing up new email infrastructure from scratch.
- **Lightweight email capture without mandatory accounts** — an email address plus preferences (categories/neighborhoods/venues followed), not a username/password account. This is a materially smaller lift than real authentication (`EPIC-005`'s blocker) and should not be conflated with it — no login system is implied by this epic.
- **Follow categories, artists/venues, neighborhoods/cities, interests.**
- **"Weekend Signal" / Tonight/This Weekend alerts** — an email digest, reusing `EPIC-009`'s Tonight/This Weekend lens as its content source rather than building separate selection logic. ("The Weekend Signal" as a named product, referenced by the Product Owner across this epic and `EPIC-016`'s newsletter-sponsorship scope, should be treated as one real deliverable shared by both epics, not reinvented per-epic.)
- **"Something unusual just appeared" alerts** — a direct consumer of `EPIC-007`'s Radar Candidate scoring once it exists; this is explicitly V1+ here, gated on `EPIC-007`.
- **Personalized event recommendations** — explicitly flagged by the Product Owner as "eventually," i.e. V1+/V2, not part of this epic's near-term scope.
- **Notification preferences** (frequency, channel, category/neighborhood granularity) as a first-class setting, not an afterthought — unsubscribe/preference management is both a user-respect requirement and (per `privacy.html`'s existing commitments) likely a compliance requirement once real marketing email exists, which this epic introduces for the first time.

## Out of scope

Full user accounts/authentication, a social graph, or any messaging/chat feature — all remain `EPIC-005`'s explicitly-undecided, much larger scope, not pulled forward by this epic. Personalized recommendations beyond simple "new in your followed categories" matching.

## Success criteria

Returning-visitor rate, subscriber count, and saves/follows all become measurable (via `EPIC-011`'s funnel) and trend upward without requiring a visitor to create a traditional account to get value from the product.

## Dependencies

**Resend** (live, already in production use for transactional email — extend, don't replace). `EPIC-009` (Tonight/This Weekend lens content feeds the Weekend Signal digest). `EPIC-007` (Radar-based "something unusual appeared" alerts, V1+ only). `EPIC-011` (saves/follows/subscriber counts are exactly the kind of action this epic's success criteria need instrumented).

## Stories / tasks

See `BACKLOG.md`: `STORY-019` (device-local save, no account, V0 — pure front-end, no schema change for the minimal version), `STORY-020` (lightweight email capture + Weekend Signal digest, reusing Resend). Follows/notification-preference granularity and Radar-based alerts are **not** broken into stories yet — the former needs a V0 save mechanism to exist first, the latter is hard-gated on `EPIC-007`.

## Risks

The biggest risk is scope bleed into `EPIC-005`'s territory (a "lightweight email capture" quietly growing into a full account system without ever getting the explicit product decision `EPIC-005` is waiting on). Keep this epic's identity model to "an email plus preferences," not usernames/passwords/profiles.

## Open questions

Whether device-local saves alone (no email) are worth shipping as a standalone V0, or whether email capture should be the very first slice instead — a sequencing call, not a blocking decision. See `DISCOVERY-015` in `BACKLOG.md` for the consent/compliance question email capture raises.

## Relevant decisions

`DEC-014` (discovery lenses carry no editorial endorsement — a followed category/neighborhood is the visitor's own choice, not an editorial signal). `DEC-021` (no individual data sale — saves/follows/email addresses are retention data, not a commercial product to sell).
