# Facebook Auto-Post — Setup Runbook

Added 2026-09-14 (Jody: "what if people posted their events on 313 and then
it auto published to Facebook so they can come to one place and publish
everywhere"). The code side (`api/cron-post-to-facebook.js`,
`supabase/update_2026-09-14_facebook-auto-post.sql`) is built and ready — it
no-ops safely until the pieces below exist. Everything in this document has
to happen on Facebook/Meta's side and needs Jody's own login, so it can't be
done from inside this project.

## What this does — and what it deliberately does NOT do

It posts each newly-approved 313.events event to **313.events' own Facebook
Page feed** as a regular post (title, date, venue, price, a link back to the
event's 313.events page — Facebook will pull the flyer image into the link
preview automatically). It does **not** create a native Facebook "Event"
object that people can RSVP to inside Facebook.

That's not a shortcut — it's a real limitation on Facebook's side. Meta
closed off Event creation on the Graph API to the general public years ago;
doing that requires becoming an approved **Official Events API** partner,
which is a separate, heavier business-level application process (built for
platforms like Eventbrite/Ticketmaster, paused to new partners as of when
this was last checked, and not something worth pursuing for a first version
of this feature). Posting to the Page's feed only needs the ordinary
`pages_manage_posts` permission, which any Page owner can apply for through
Meta's standard App Review. If real Facebook Events later turn out to matter
enough to justify that heavier application, that's a separate project — this
setup doesn't block it.

## Steps (all on Facebook/Meta's side)

1. **Facebook Page.** Confirm 313.events already has a Facebook Page (not a
   personal profile or group) — auto-posting only works on a Page. If it
   doesn't exist yet, create one first.

2. **Meta Business Manager + Business Verification.** Go to
   [business.facebook.com](https://business.facebook.com), create a Business
   Manager account if one doesn't exist, and add the 313.events Page to it.
   Advanced Access to `pages_manage_posts` (needed the moment this is used
   for anyone besides Jody's own test account, which in practice means
   immediately) requires a **verified business** — this usually means
   confirming a business name/address/phone and may ask for supporting
   documents. Budget real time for this step; it's the main bottleneck.

3. **Create a Meta App.** At [developers.facebook.com](https://developers.facebook.com),
   create a new app, type **Business**, and link it to the Business Manager
   account from step 2.

4. **Add the Pages product and request permissions.** In the app's dashboard,
   add the "Pages API" product. Request `pages_manage_posts` and
   `pages_read_engagement` (the second is usually required alongside the
   first even though this feature doesn't read engagement data itself).

5. **Submit for App Review.** This needs, per permission requested:
   - A short written explanation of what the app does and why it needs the
     permission (this document's first section is a good starting point).
   - A screen recording showing the actual flow end-to-end, with a test user
     that has admin access to the Page — e.g. showing an event on 313.events
     and the resulting Page post side by side.
   - The app itself reachable/testable by Meta's reviewers.

   Typical turnaround is a few business days per permission; each rejection
   resets that permission's review clock, so budget more like 1–3 weeks
   including some back-and-forth.

6. **Generate a Page Access Token.** Once approved, the most durable option
   is a **System User** token (Business Manager → Users → System Users →
   create one, assign it the Page with `pages_manage_posts`, generate a
   token) — this doesn't expire when Jody's own personal Facebook login,
   password, or 2FA changes, unlike a token derived from a personal user
   login. A token generated straight from Graph API Explorer works too and
   is faster to get for an initial test, but treat it as temporary.

7. **Find the numeric Page ID.** Page → About → "Page transparency" (or the
   URL when viewing the Page in Meta Business Suite) shows the plain numeric
   Page ID this integration needs — not the Page's @handle/username.

## Turning it on

Once steps above are done, in Vercel: Project Settings → Environment
Variables, add:

- `FACEBOOK_PAGE_ID` — the numeric id from step 7
- `FACEBOOK_PAGE_ACCESS_TOKEN` — the token from step 6

Redeploy (or just wait for the next deploy) so the function picks them up.

**Before letting it post for real**, sanity-check what it *would* post —
hit it with `dryRun=1` and the real `CRON_SECRET`:

```
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://313.events/api/cron-post-to-facebook?dryRun=1"
```

This returns the titles/dates of every approved, not-yet-posted, future
event without posting anything. If there's a large backlog of already-
approved future events sitting there from before this went live, posting
all of them in one shot the first time will read as a spammy burst on the
Page — consider clearing/reviewing that list by hand once first
(`facebook_posted_at` can be set directly in Supabase's SQL editor to
backdate specific rows as "already handled" without actually posting them)
rather than letting the cron's own `POST_LIMIT` cap trickle it out over
several days by default.

It's scheduled to run daily at 7:00 AM UTC (`vercel.json`) — the same
per-hour stagger every other cron in this project uses. New approved events
generally post within a day of approval; nothing about the current design
needs it more frequent than that, but the schedule is a one-line change in
`vercel.json` if faster turnaround matters later.
