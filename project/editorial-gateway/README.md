# Editorial Gateway

Owner P1 interruption "Editorial Publishing Express Lane" (2026-10-26). Routing: primary `workstream:platform`,
supporting `workstream:experience` and `workstream:event-intelligence`, release gate `workstream:release-quality`.

One authenticated endpoint, `/api/editorial-gateway`, that an AI client calls so the owner does not move files, open
Supabase or run SQL for routine editorial work. It speaks MCP (JSON-RPC, stateless streamable HTTP) and plain REST.

## What exists (v1)

| Operation | Does | Writes |
|---|---|---|
| `find_event` | search by title, venue, external id, date, or load by id | nothing |
| `upload_event_image` | validate an image, store it in `event-flyers`, set `events.image_url` on one existing event | one object under `editorial/<event id>/`, plus `image_url` and `internal_note` of that event |
| `verify_event` | row, public view, image bytes at the public URL, event page `og:image` | nothing |

Not built (next, only after the image workflow passes Preview and production): `create_event`, `update_event`.

## Rules held in code (`api/_lib/editorial-gateway.js`, `test/editorial-gateway.test.js`)

- Dry run by default; `dry_run:false` applies. Nothing else in the row changes; no inserts, deletes or status changes.
- An event with an image is never overwritten unless `replace:true`. A row edited while the call runs is not overwritten
  (the update is filtered on the `updated_at` it read).
- Rejected events are not writable. Only approved or pending events get images.
- Bytes are sniffed (JPEG/PNG/GIF/WebP), must agree with any declared type, 4 MB cap, pixel ceiling (same guard as the
  public upload form). The stored object is read back from its public URL and must hash identically before the event is touched.
- Object name is the content hash, so a retry reports `already_applied` and writes nothing.
- Remote fetch (`image_url`, ChatGPT `file.download_url`): https only, default port, no credentials, public hosts only
  (checked on every redirect hop), 10 s, 4 MB streamed cap. Residual risk: DNS can change between our check and the
  fetch (rebinding); mitigated by the token requirement and the byte sniffing, not eliminated.
- Audit: one line appended to `events.internal_note` (not in `events_public`): time, client, route, content hash,
  size, previous image, the caller's source note. Vercel runtime logs carry a one-line record per call (no secrets).
  No schema change; no new table.
- Auth: `EDITORIAL_GATEWAY_TOKEN` (at least 16 characters; 32+ recommended for production) as `Authorization: Bearer` or `X-Editorial-Token`.
  Unset or short refuses every call. The Supabase service-role key never leaves the server.

- Image lock: an applied image is recorded with the existing `OWNER-CORRECTION ... fields=image_url` marker, so the feed
  writer (`event-upsert`) keeps it on later refreshes. The admin correction form is unchanged (image_url is lock-only).
- No orphans: if the read-back, the database update or the race guard fails, the object this request created is deleted;
  an object that already existed is never deleted. The caller's `credit` and `source_note` go into the private audit line only.
- Device sessions: `POST {op:"create_session", label, ttl_days}` with the gateway token returns `egs1.<payload>.<hmac>` (default 7 days,
  max 30). The HMAC key is derived from the token, so rotating `EDITORIAL_GATEWAY_TOKEN` revokes all sessions. A session works for
  find / upload / verify, never mints sessions and never appears in a URL.
- Raw image route: `POST /api/editorial-gateway?event_id=...&dry_run=false` with `Content-Type: image/*` and the file as the body
  (what `editorial.html` and an iOS Shortcut use). Details go in the query string, the credential only in the header.
- Phone page: `/editorial.html` (noindex). Sign in once with the token, search, pick a photo, Check (dry run), Apply, and see the verify results.

- `create_event` (Release B): new events only after find_event shows no match. Needs title, date, category and a source note; unknown
  facts stay empty (no invented time/venue). Uses the shared event rules; possible duplicates (same day, similar title or same venue,
  any status) are refused and listed; deterministic `external_id` makes retries idempotent; created `pending_review` unless
  `publish:true` and the rules find nothing to review. Dry run by default. Phone page has an "Add a new event" form.

## Client matrix (documented from vendor pages on 2026-10-26; NOTHING below is tested on the owner's accounts yet)

| | Claude | ChatGPT |
|---|---|---|
| Remote MCP connector by URL | Yes, custom connector on all plans | Yes, developer mode on web (Pro, Plus, Business, Enterprise, Education); write tools ask for confirmation |
| Shared-secret header | "Request headers" is beta and limited to some organizations; not confirmed for the owner | Vendor page does not list API key or bearer headers; only OAuth or no authentication |
| Attachment bytes to a tool | No documented file parameter; use `image_url`, `image_base64`, or a client that can read the file (Claude Code / desktop with local files) | Apps SDK file parameters (`_meta["openai/fileParams"]`) hand the tool a temporary `download_url`; the gateway declares this and fetches it. Not confirmed for a developer-mode custom connector |
| Status here | Interface built; connector not yet added or tested | Interface built; connector not yet added or tested |

Open authentication question (needs a decision only after Preview proves the core): if neither client will send our bearer
header, the options are (a) a secret in the connector URL (simple, weaker: URLs get logged), or (b) a small OAuth front.
Neither is built. Nothing here claims either integration works until it has been exercised.

## Release path

Preview first (non-production Supabase; set `EDITORIAL_GATEWAY_TOKEN` for Preview only), R&Q validation, then Jody's
release word. Production needs the token set in Vercel (owner action) and the usual production smoke. The first
production write is the Pop Tronics image, on Jody's individual GO.
