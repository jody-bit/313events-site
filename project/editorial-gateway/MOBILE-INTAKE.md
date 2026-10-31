# Mobile intake: fastest secure path (Release B)

Status: designed and built; NOT yet exercised on the owner's phone or accounts. Nothing here claims an integration works until it has been.

## Recommendation (fewest owner actions)
1. **Phone page `/editorial.html`** (built). One-time sign-in per phone: type the editor token once, the page swaps it for a signed 30-day session and
   never stores the token. Add to Home Screen. Then each event is: search (finds duplicates) → "Add a new event" form if none → pick the flyer from Photos
   → Check (dry run) → Apply → verify results and live link. Works in Mobile Safari with no app, no Terminal, no Supabase.
2. **Claude / ChatGPT connectors** (optional later): both can call the same four tools (`find_event`, `create_event`, `upload_event_image`, `verify_event`).
   The chat assistant does the extraction step (reads the flyer or link, fills the form fields). Connector sign-in is unproven (see README client matrix),
   so the phone page is the primary path.
3. **iPhone Share Sheet (practical, no app):** an iOS Shortcut "Send to 313.events" that takes the shared image, asks for the event id (or opens the phone
   page), and POSTs the file to `/api/editorial-gateway?event_id=<id>&dry_run=false` with `Content-Type: image/jpeg` and header `Authorization: Bearer <session>`.
   The session is created once from the page (Sign-in) and pasted into the Shortcut; it expires in 30 days and dies when the gateway token is rotated.
   Limit: one image per call, 4 MB.

## Journey and where each step is enforced
| Step | Where |
|---|---|
| Receive flyer/link/text | phone page, Shortcut, or a connected assistant |
| Extract facts | the assistant (or the owner typing); the gateway accepts only stated facts, requires `source_note`, leaves unknowns empty |
| Check duplicates | `find_event` first; `create_event` refuses same-day similar title/venue in any status and lists matches |
| Venue / geography | entered as stated; shared rules in `event-contract.js` flag city problems into `pending_review` |
| Create / enrich | `create_event` (new) as `pending_review`; existing events are enriched only by the existing admin correction path, never by this tool |
| Upload artwork | `upload_event_image` / raw route: original bytes, hash-named, no overwrite, read-back verified, locked against feed refresh |
| Uncertain facts | `pending_review` queue in admin; ambiguous duplicates are refused, not created |
| Publish | only with `publish:true` AND clean contract, or approval in admin; the owner says publish |
| Return URL + verification | `verify_event` and the live link on the page |

## Not built (decisions, not defects)
- No automatic extraction inside the server (it would add a model dependency and cost); the connected assistant does it.
- No enrichment of existing events through the gateway (admin corrections already own that and its lock).
- Notification emails to submitters depend on Resend domain verification (separate owner decision).
