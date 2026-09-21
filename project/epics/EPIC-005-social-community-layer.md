# EPIC-005 — Social / Community Layer

**Status:** Idea only. Not scoped. Blocked on a Product Owner decision about whether to pursue it at all.

## Objective

Undefined. The original ask (relayed 2026-09-13, from a friend of Jody's): visitor accounts with a custom profile icon, plus some form of chat/engagement between visitors — "in the spirit of old-school MySpace profile pages."

## Problem

Not yet established as a real product problem — this is a suggested feature, not (yet) a validated user need. Recorded here so it isn't lost, not because it's ready to build.

## Scope

Not defined. Would require, at minimum: an authentication/accounts system (none exists today — the site is currently a static read + a handful of serverless write endpoints, with no user login anywhere), a data model for profiles and messages, a moderation model for user-generated social content, and abuse/spam handling.

## Out of scope

Everything, until scoped. This epic file exists to hold the idea, not to pre-scope it — pre-scoping without a Product Owner decision on whether to pursue it at all would be exactly the kind of unrequested, speculative build-ahead this project's workflow is designed to avoid.

## Success criteria

Not definable yet.

## Architecture implications

Would be the largest architectural departure in the project's history — real auth, likely real-time infrastructure, and a new moderation surface, none of which exist today. Should not be built incrementally "on top of" the current architecture without its own dedicated design pass first, per the original request's own framing.

## Dependencies

Entirely blocked on a Product Owner decision: pursue, defer indefinitely, or decline.

## Stories / tasks

None — deliberately not broken into backlog items beyond a single `DISCOVERY`-type entry in `BACKLOG.md` to track the open decision itself.

## Risks

If built without a dedicated design pass: auth/security risk, moderation/abuse risk, and a real chance of building something disconnected from what actual visitors want, since this originated as a single relayed suggestion, not user research.

## Open questions

Whether to pursue this at all (`PRODUCT DECISION REQUIRED`, `PRODUCT.md`).

## Relevant decisions

None yet.
