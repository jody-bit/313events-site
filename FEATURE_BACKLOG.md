# Feature Backlog

Running list of requested features/improvements not yet implemented. Add new items at the top with the date requested.

---

## 2026-09-13

### 5. Visitor profiles + social chat/engagement ("MySpace vibe")

Suggested by a friend of Jody's, relayed 2026-09-13: visitors could create a profile (own icon/avatar) and log in to chat or otherwise engage with other visitors — a social layer on top of the event listings, in the spirit of old-school MySpace profile pages.

**Ask:** visitor accounts (login, custom profile icon) plus some kind of chat/engagement space between visitors.

**Scope flag:** this is a large architectural departure from what exists today — there is no user-accounts table, no auth, and no real-time infrastructure anywhere in this codebase (everything today is a static site + read-only anon Supabase access + a handful of serverless functions for admin/submission writes). This would need its own design pass (auth provider, moderation model, data model for profiles/messages, abuse/spam handling) before it could even be scoped, not just built on top of the current architecture — flagging here as a bigger idea to revisit, not a quick add.

### 4. Category drill-down: tap a category to see more specific sub-genres

Suggested by a friend of Jody's, relayed 2026-09-13: tapping a top-level category (e.g. Music) should surface a more specific set of sub-genres to choose from — e.g. Art, Music, Dance, Rave, After Hours as one level, and something like Techno, Opera, etc. as an even more specific level under that — rather than only ever filtering by the current flat category list.

**Ask:** a drill-down/expandable category picker (top-level category → more specific sub-genre) instead of (or in addition to) the current flat single-level category filter chips.

**Scope flag:** the current `category` column on `events` is a single flat enum-ish value (see the `CATS` object duplicated across every page) — sub-genre tagging doesn't exist in the data model today, and most sources (Ticketmaster, venue scrapers) don't supply genre-level detail on their own, so real coverage would likely be thin at first even if the UI were built.

---

## 2026-09-12

### 3. Event entry form: support multi-day events with different times per day

Right now there's no clean way to enter an event that runs across multiple days with a different time range on each day — e.g. a fair or festival that runs "Fri 2–7 PM · Sat 10 AM–7 PM · Sun 10 AM–4 PM". The current form assumes one date + one time range per event entry, so this kind of schedule has nowhere to go (both in the editorial review flow and the general event entry form).

**Ask:** add a way to enter a per-day schedule (a list of day/time-range pairs) on a single event entry, so multi-day events with varying daily hours can be captured accurately instead of being forced into a single date/time field or split awkwardly.

### 1. Editorial review: allow splitting one article into multiple events

When reviewing a press/editorial article in the admin editorial-review queue, there's currently no way to create more than one event from a single article. Some articles genuinely cover multiple distinct event dates that should become separate event records — e.g. the Stevie Wonder 50th-anniversary show is actually two separate performances (Dec 8 and Dec 9), which should be two separate event entries, not one.

**Ask:** add an "add another event from this article" (or similar) option in the editorial review flow, so a single reviewed article can produce N event records instead of being locked to exactly one.

### 2. Admin page: tabbed layout with per-tab pending-item counts

admin.html is getting cluttered as more review queues have been added. Currently everything (smoke test results, editorial review, user-submitted event post review, and the "needs follow-up / missing info" panel) is stacked on one page.

**Ask:** reorganize admin.html into tabs across the top, one tab per queue:
- Smoke test results
- Editorial review
- User-generated event submissions review
- Events missing details (the follow-up/missing-info panel)

Each tab should show a small badge/indicator with the count of items on that tab needing the admin's attention (e.g. a red badge with the pending count), so Jody can see at a glance which queues need work without opening each one.

---
