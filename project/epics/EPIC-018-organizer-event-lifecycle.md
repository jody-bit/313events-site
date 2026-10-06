# EPIC-018 — Organizer Event Lifecycle

**Status:** IDEA / BACKLOG — captured 2026-10-06 by Product Owner request ("PRODUCT BACKLOG CAPTURE"). **Documentation/scoping only.** Nothing here is designed, built, estimated or scheduled, and it does **not** displace Sprint Zero (`ENGINEERING_READINESS_REVIEW.md`, `ENVIRONMENTS.md`) or the current priorities in `BACKLOG.md`. No work package below is `READY`.

## North star

313.events should increasingly give organizers, audiences and the city value from the event record while requiring less clerical work from the Product Owner.

## Objective

Give an organizer something valuable back for submitting an event, instead of treating submission as an ingestion endpoint. The lifecycle:

`SUBMIT → REVIEW → APPROVE → PUBLISH → PROMOTE → MANAGE → EVENT → PRESERVE / ARCHIVE`

Today the lifecycle stops at PUBLISH: `submit.html` → `/api/submit` → `pending_review` → admin approval → live. The submitter hears nothing back, cannot correct anything, and gets no durable asset. Each stage below adds value for the organizer, and each also removes a clerical task from the Product Owner (corrections arrive by secure link rather than by email, cancellations are self-reported, post-event material is invited rather than chased).

## Organic distribution loop (strategic rationale)

organizer submits event → 313 creates a public home → organizer puts the 313 QR on physical promotion → attendees scan it → attendees discover 313.events → attendees may contribute content → the event page becomes richer → the organizer receives more value → the organizer submits future events. Physical cultural activity around Detroit and the Orbit then distributes 313.events itself. This is the growth rationale for keeping the basic event home and QR **free** (see `EPIC-012`, which this complements and does not duplicate).

## Non-negotiable constraints (apply to every work package)

1. **Free, ungated event home.** The canonical event page is free, requires no account and no app for visitors.
2. **Editorial truth is independent of payment** (`DEC-015`, `DEC-020`, `EPIC-010`). A paid organizer never gains authority to make false factual changes or to buy editorial significance. Promoted content stays clearly labeled and separate.
3. **Organizer edits never blindly overwrite canonical truth.** Material edits pass through the same validation / publication-gate / field-authority system the readiness review (SZ-06, P1-03) and `DEBT-011` establish. Low-risk fields may eventually qualify for immediate update; identity, date, location and cancellation-type changes would need validation. Which is which is **not decided**.
4. **Management credentials are never exposed in public event data.** Secure tokens live outside any public view/API response (see the allowlist guardrail G-6 in `ENGINEERING_READINESS_REVIEW.md`). Public/private boundaries must exist before the first token is issued.
5. **History is preserved.** Expired events are not disposable records. Retention follows the project's historical-retention guardrails (G-1: never delete or destructively overwrite; `DEC-027`: "already over" does not erase an event from the period it belonged to).
6. **No individual attendee or user data is sold** (`DEC-021`); analytics are aggregate and privacy-conscious.
7. **QR destinations are durable.** A printed QR must keep working: it encodes the canonical 313.events event URL only — never a deployment URL (`*.vercel.app`) and never a mutable third-party identifier.
8. **Do not build the full account system or a rights engine to ship first-generation features.** Preserve the path, build the smallest step.

## Work packages (all BACKLOG / IDEA — not estimated, not scheduled)

IDs `OL.n` are local to this epic, in the same style as `SH.n` and the ingestion work packages. They become `STORY-###` entries in `BACKLOG.md` only when one is pulled.

| WP | Title | Status | Depends on |
|---|---|---|---|
| OL.1 | Durable canonical event identity and permanent public URL | BACKLOG | foundation — see Dependencies |
| OL.2 | Free canonical event home (public page for every approved event, incl. orgs with no website) | BACKLOG | OL.1, publication gate |
| OL.3 | Historical retention of expired events (event home survives the event) | BACKLOG | OL.1, G-1 retention guardrails |
| OL.4 | Approval / go-live email to the submitter | BACKLOG | OL.1, OL.2, publication gate, OL.7 for the manage link |
| OL.5 | Event QR code (durable, PNG + SVG download) | BACKLOG | OL.1, OL.2 |
| OL.6 | Promotion kit (URL, copy, QR PNG/SVG, optional "Listed on 313.events" asset) | BACKLOG | OL.5; overlaps `EPIC-012` badge item |
| OL.7 | Passwordless event management (secure token link, `/manage/[token]`) | BACKLOG | secure public/private boundary, OL.8 |
| OL.8 | Organizer edit validation (field-authority tiers: immediate vs validated; status: cancelled/postponed) | BACKLOG | field authority (`DEBT-011`), publication gate |
| OL.9 | Organizer-reported change / cancellation / postponement flow (incl. instructions in the go-live email) | BACKLOG | OL.7, OL.8 |
| OL.10 | Event participation layer — before / during / after states on the event page | IDEA | OL.2, OL.12 |
| OL.11 | Post-event organizer email ("Your event happened. Help preserve it.") | IDEA | OL.7, OL.3, OL.12 |
| OL.12 | Event media and recap contributions (organizer photos/video/recap/press/recordings/corrections) | IDEA | OL.7, provenance, OL.3 |
| OL.13 | Audience-contributed content (public social links, photos, video) | IDEA | OL.12, provenance, moderation/rights design (not designed) |
| OL.14 | QR and event analytics (aggregate: scans, visits, ticket-link clicks, contributions) | IDEA | `EPIC-011`, OL.5, DISCOVERY-014 |
| OL.15 | Account evolution path: claim organizer/venue → organizer account → all-events management → feed management → analytics | IDEA | OL.7, `EPIC-017`, DISCOVERY-006/019 |

### Notes per work package

- **OL.1 — durable identity.** Every approved event needs a permanent, never-reused identifier and URL that survives edits, venue changes, re-ingestion and deduplication merges (a merged duplicate must redirect, not 404). Whatever the QR encodes must come from here. Existing stability is partial: event UUIDs are already the public link, G-1 forbids hard-deleting events (so a public link cannot be orphaned by deletion), but a merged event's old id currently soft-404s and the survivor pointer is free text — the review defers a redirect (§26.2) and this epic would make it a requirement. The shape of the permanent identifier/URL is an architecture decision (Opus-level), deliberately not made here.
- **OL.2 — event home.** `event-template.html` / `api/event-meta.js` already render per-event pages with OG cards; the gap is making that page a deliberate, durable, organizer-facing asset (and correct for organizers with no website of their own). Extends the existing page; does not fork it.
- **OL.3 — retention.** Past event pages stay reachable and indexable according to a retention rule still to be decided; separate from the consumer calendar, which can continue to hide what is over (`DEC-027`).
- **OL.4 — go-live email.** Triggered when an event becomes approved/live, to the submitter. Contents: live confirmation; permanent URL; View Event action; QR download; statement that the page is free and ungated; secure Manage/Edit link; how to report change/cancellation/postponement; later, how to contribute post-event material. Reuses the already-live Resend infrastructure (`EPIC-013`'s precedent); consent and unsubscribe handling is `DISCOVERY-015`'s territory but this is **transactional**, not marketing — classification to be confirmed. Must be **idempotent** (sent once per approval, never re-sent on a later edit or re-sync). Must be suppressed in non-production environments (Sprint Zero guard: `RESEND_API_KEY` exists only in the Production scope). Today `RESEND_API_KEY` is used for an admin notification on submission only; this is a new, submitter-facing email.
- **OL.5 — QR.** Suggested organizer-facing copy: "Scan for event details, updates & more." PNG and SVG; print-grade; encodes the canonical URL only. Whether to add a redirect hop (so the destination could be corrected after printing) versus a direct canonical URL is an open decision — a redirect hop adds an owned, durable indirection but also a thing that must never break.
- **OL.7 — secure manage link.** Unguessable token, stored hashed, scoped to one event (later one organizer), revocable, expiring or rotatable, never present in public views or logs. Conceptual route `313.events/manage/[secure-token]`. Eventual capabilities: edit details, status (cancelled/postponed), ticket URL, event URL, description, image, time/date, venue/location, promotion kit, QR download, canonical URL. Initial scope would be a deliberately small subset. Email-link possession is weak identity: the account-evolution path (OL.15) is expected to supersede it.
- **OL.8 — edit validation.** This is the same problem as `DEBT-011` (who wins, field by field) with a new writer: the organizer. The organizer should be defined as one more authority class in that field-authority design rather than a special case. Do not build a parallel approval path.
- **OL.12 / OL.13 — media and audience content.** Everything attaches to the canonical event identity (OL.1), never a separate content silo. Needs future design — **not designed now** — for provenance, attribution, permissions/rights, moderation, removal, duplicate content, inappropriate content, and public/private distinctions. `EPIC-005` (social/community layer) is the nearest existing idea; this epic's audience-content scope is narrower (content *about an event*, not accounts/profiles/chat) and does not resolve `DISCOVERY-003`.
- **OL.14 — analytics.** Built on `EPIC-011`'s shared Event Connections instrumentation, not a second tracking system. Aggregate and privacy-conscious only; QR scans would need a first-party scan identifier (e.g. a distinguishing parameter) — design deferred. Feeds the organizer-facing value of `EPIC-017`.
- **OL.15 — account evolution.** email ownership → secure management link → claim organizer/venue → organizer account → manage all events → manage event feeds (`DISCOVERY-020`) → organizer analytics → possible Organizer Pro (`EPIC-017`). Do not build the account system merely to enable first-generation editing.

## Event participation layer (OL.10) — target states

- **Before:** details, tickets, directions, lineup/program, venue, updates.
- **During:** a "You're here" state; schedule/information; artists/participants; attendee contribution (photos, video, links to public Instagram/TikTok/social posts, other audience material).
- **After:** photos, videos, audience posts, organizer recap, press coverage, recordings, related artists, related venue/place, cultural/historical context.

Stated target only. The page is built around canonical event identity so that later layers attach to it.

## Out of scope for this epic

Pricing, Organizer Pro packaging (`EPIC-017`), paid promotion (`EPIC-015`), display/sponsorship (`EPIC-016`), the cultural archive and tour/data-product direction (`EPIC-019`), a rights engine, a generalized entity/knowledge graph, an organizer account system, and any change to Sprint Zero scope.

## Dependencies (cross-cutting; none are owned by this epic)

| Dependency | Where it lives | Why it matters here |
|---|---|---|
| Durable canonical event identity | `ENGINEERING_READINESS_REVIEW.md` §26.2 (stable event UUIDs; G-1 no hard-delete; merged-id redirect deferred) and G-4 (identity key shapes for crosswalks) | The QR, the permanent URL, the manage token and all later media attach to it. Nothing in this epic is safe to start before it. |
| Publication gate | `ENGINEERING_READINESS_REVIEW.md` P1-03 (evidence/claims model and publication gate), SZ-06 (write contract / field policy) | "Approved/live" must be a single trustworthy event for OL.4; organizer edits must pass through it (OL.8). |
| Historical retention | G-1 (never delete or destructively overwrite), `DEC-027` | OL.3, OL.11, OL.12; also protects the archive direction. |
| Field authority | `DEBT-011`; G-5 (canonical value separate from rights/affiliate decoration) | OL.8, OL.9: organizer as a writer class. |
| Provenance | `SH.6` V1 (`description_source`), `DEBT-011` per-field edit record, P1-03 claims/evidence model, SZ-07 history (G-2) | OL.12/OL.13 attribution and correction history. |
| Secure public/private access boundaries | G-6 (anon allowlist), SZ-01 grants hardening | OL.7: tokens must be unreachable by `anon`; SZ-01 (legacy broad grants) must be resolved before management tokens are stored in production. |
| Environment isolation | `ENVIRONMENTS.md` | Emails and tokens must never fire from Preview/staging. |
| Measurement | `EPIC-011`, DISCOVERY-014 | OL.14. |
| Organizer identity | `EPIC-017`, DISCOVERY-006, DISCOVERY-019, `DEC-005` | OL.15. |

## Success criteria (directional, not committed)

An organizer who submits an event receives, without Product Owner involvement, a permanent public page, a QR code they can print, and a way to correct or cancel the event, and uses them; the share of submissions from returning organizers rises; corrections and cancellations stop arriving by manual message.

## Risks

Building edit access before the field-authority/publication rules exist would reopen exactly the overwrite problem `DEBT-011` documents. A token link sent to a wrong or shared address hands edit access to the wrong person — mitigated only by the narrow edit scope and the validation tier. An emailed go-live message from a new transactional sender needs deliverability and consent handling. A printed QR is a promise: breaking a canonical URL after printing is permanent damage.

## Open questions

See `DISCOVERY-022` in `BACKLOG.md`.

## Relevant decisions

`DEC-005` (source ≠ organizer), `DEC-015`/`DEC-020` (editorial/commercial firewall), `DEC-021` (no individual user data sold), `DEC-027` (history is not erased). No new decision is recorded by this capture.
