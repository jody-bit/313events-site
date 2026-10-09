const crypto = require("crypto");
// Vercel serverless function powering admin.html — the moderation queue.
// Protected by ADMIN_SECRET (set in Vercel Environment Variables). The
// secret is sent as a header from admin.html after the moderator types it
// into a prompt; it is never hard-coded into any HTML/JS file.
//
// GET  /api/admin-events                    -> list events with status=pending_review
// GET  /api/admin-events?search=<text>      -> search live (status=approved) events by
//                                               title, for the "Live events" takedown tool
// GET  /api/admin-events?search=<text>&includePending=1
//                                            -> same search, but also matches
//                                               status=pending_review — used only by
//                                               Press coverage's "search for a matching
//                                               event" box (api/admin-editorial.js's
//                                               link_event action), where a real match
//                                               sitting in the submission queue is exactly
//                                               what a moderator is trying to find. Kept
//                                               opt-in rather than the default so the
//                                               existing takedown tool's "only ever
//                                               searches already-approved events" guarantee
//                                               (see below) doesn't change for it.
// GET  /api/admin-events?hidden=1           -> most recently hidden/rejected events (for undo)
// GET  /api/admin-events?incomplete=1       -> upcoming pending_review/approved events missing
//                                               a "critical field" (see admin.html's
//                                               getMissingFields() for the exact definition) —
//                                               the "Needs follow-up" section. Added 2026-09-05
//                                               at Jody's request: an approved event from a
//                                               trusted crawler source currently goes straight
//                                               to the live site even if a field failed to parse
//                                               (e.g. venue address regex didn't match), with
//                                               nobody ever looking at it the way a pending_review
//                                               submission gets looked at. This surfaces both
//                                               pending AND already-approved events with a gap,
//                                               past events excluded (start_date >= today) since
//                                               a stale one isn't worth chasing. Filtering itself
//                                               happens client-side in admin.html rather than via
//                                               a PostgREST filter here — deliberately, so the
//                                               definition of "missing" can be tweaked in one place
//                                               without touching this endpoint's query shape.
// POST /api/admin-events -> { id, action: "approve"|"reject"|"hide"|"restore"|"update_fields" }
//   approve/reject: pending_review -> approved/rejected (the original submission queue)
//   hide:           approved -> rejected (takes an already-live event off the site)
//   restore:        rejected -> approved (undo a hide, or reverse a reject)
//   update_fields:  { id, action: "update_fields", fields: { description?, venue_address_raw?,
//                     venue_city_raw?, ticket_url?, event_url?, time_display? } } — fills in a
//                     gap the "Needs follow-up" section flagged. Only ever fills a blank field
//                     in, never blanks or overwrites one that already has a value from here.
//   auto_repair_venue: { action: "auto_repair_venue" } (no id — operates on the whole batch) —
//                     Needs Follow-up's "Auto-Repair" button. Runs, in sequence: (1) the existing
//                     SH.1 venue address/city repair (scripts/sh1-repair-existing-venue-address-
//                     city.js's repairExistingEvents(), unmodified) against every current upcoming
//                     pending_review/approved event still missing venue_address_raw/venue_city_raw,
//                     then (2, added 2026-09-22 same day) authoritative Outer Limits Lounge
//                     description recovery (scripts/outerlimits-description-repair.js's
//                     repairOuterLimitsDescriptions(), reusing api/cron-outerlimitslounge.js's own
//                     Squarespace fetch/parse logic) against Outer Limits events still missing a
//                     description, then (3, added 2026-09-23) authoritative Detroit Historical
//                     Society/Dossin Great Lakes Museum event_url recovery (scripts/dossin-metadata-
//                     repair.js's repairDossinMetadata(), reusing api/cron-dossin.js's own page
//                     fetch/parse logic) against Dossin events still missing both ticket_url and
//                     event_url — only via that source's own per-event "LEARN MORE" link, and only
//                     when that link isn't shared by more than one event in the same fetch. Same
//                     blank-only, never-overwrite, race-safe-PATCH guarantees as all three scripts'
//                     own tests already prove. A later step's failure never discards an earlier
//                     step's real results — see the action's own handler comment below.
// "hide" and "reject" both land on the same event_status enum value
// ('rejected') — there's no separate DB status for "was live, then pulled"
// vs. "a submission we declined." Adding one would need a Postgres enum
// migration; reusing 'rejected' avoids that and is fine since both mean the
// same thing to the public site (not shown), and "restore" un-does either.

const SUPABASE_URL = process.env.SUPABASE_URL;
// Non-production deployments must never use the production database (api/_lib/environment.js).
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Timing-safe secret comparison — a plain `!==` string compare leaks how
// many leading characters matched via response timing, since JS's string
// equality short-circuits at the first mismatched character. That's a real,
// if narrow, side channel against CRON_SECRET / ADMIN_SECRET. Buffers of
// different lengths still get run through timingSafeEqual (against
// themselves) rather than returning immediately, so a length mismatch takes
// the same code path as a same-length mismatch instead of returning early.
// Added 2026-09-02 site audit.
function timingSafeStringEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// Same check api/submit.js uses for ticketUrl/eventUrl on the public form —
// duplicated rather than shared, per this project's one-file-per-endpoint
// convention (no shared JS modules).
function isSafeHttpUrl(url) {
  if (!url) return true; // both fields are optional
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = require("./_lib/environment").siteUrl();

function escapeHtmlForEmail(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// "Your event is live" email to the submitter (Jody, 2026-08-28) — fired
// only on the "approve" action, never "restore". Both set status to
// 'approved', but this project's events table has no separate status for
// "was live, then hidden" vs "was pending, then rejected" (see this file's
// header comment) — a "restore" can equally mean un-hiding an event that
// already got this email once (don't send it again) or reversing a reject
// that never got one (arguably should). Since there's no way to tell those
// apart from the data alone, this only fires on the unambiguous first-time
// path rather than risk double-emailing a submitter.
//
// Same fail-soft-and-swallow convention as this project's other best-effort
// email, api/submit.js's notifySubmission() — a failed send here must never
// turn an otherwise-successful approve action into an error response.
//
// IMPORTANT — deliverability: this reuses the same shared
// onboarding@resend.dev sender notifySubmission() already uses for Jody's
// own new-submission alert. Resend restricts that shared sender to only
// deliver to the account's OWN verified signup email until a custom domain
// is added — so as written, this email is a no-op for every real submitter
// except Jody's own address. To actually reach submitters: verify a domain
// (e.g. 313.events) in the Resend dashboard, then change the "from" address
// below to send from it. Flagged here rather than shipped as if it already
// worked for real submitters — it doesn't yet.
async function notifyEventLive(row) {
  if (!RESEND_API_KEY || !row.submitter_email) return;
  try {
    const eventUrl = `${SITE_URL}/event.html?id=${encodeURIComponent(row.id)}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "313.events <onboarding@resend.dev>",
        to: [row.submitter_email],
        subject: `Your event "${row.title}" is live on 313.events`,
        html: `
          <p>Good news — <b>${escapeHtmlForEmail(row.title)}</b> is now live on 313.events.</p>
          <p><a href="${eventUrl}">${eventUrl}</a></p>
          <p>That's your event's own page — share it directly, or find it anytime from the calendar.</p>
        `,
      }),
    });
  } catch (err) {
    console.error("notifyEventLive failed:", err.message);
  }
}

// DEBT-003 (2026-10-04): read EVERY row a query matches, a page at a time.
//
// The database API returns at most 1,000 rows per request, silently, with a
// success status. The Needs follow-up queue asked for every upcoming event
// in one request, so once there were more than 1,000 of them Admin was
// judging only the first 1,000 by date and showing a queue that looked
// complete. Measured in production on 2026-10-04: 1,891 upcoming events;
// Admin saw the ones through 5 November; 36 of the 102 events that needed
// attention were later than that and were never shown to anyone.
//
// `url` must already carry a total ordering (a unique column last), or the
// pages can overlap and skip.
//
// It stops only at an EMPTY page, and advances by the number of rows it was
// actually given. It does not stop at a "short" page, because that would
// assume the server's cap is the page size asked for: with a cap of 500, a
// first page of 500 rows is the cap, not the end. One extra request per
// read is the price of not depending on a setting this code cannot see.
// A read that reaches the request ceiling fails loudly instead of returning
// a short list that looks whole.
const PAGE_SIZE = 1000;
const MAX_PAGE_REQUESTS = 40;

async function fetchAllPages(url, headers) {
  const rows = [];
  for (let request = 0; request < MAX_PAGE_REQUESTS; request++) {
    const resp = await fetch(`${url}&limit=${PAGE_SIZE}&offset=${rows.length}`, { headers });
    const body = await resp.json();
    if (!resp.ok) return { ok: false, error: body };
    if (!Array.isArray(body)) return { ok: false, error: "Unexpected response shape reading events" };
    if (body.length === 0) return { ok: true, rows };
    rows.push(...body);
  }
  return { ok: false, error: `Still reading after ${MAX_PAGE_REQUESTS} requests (${rows.length} rows); refusing to return a partial list.` };
}

function checkAuth(req, res) {
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: "ADMIN_SECRET not configured on the server." });
    return false;
  }
  const provided = req.headers["x-admin-secret"];
  if (!timingSafeStringEqual(provided || "", ADMIN_SECRET)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Database not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." });
    return;
  }
  if (!checkAuth(req, res)) return;

  const sbHeaders = {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  if (req.method === "GET") {
    try {
      const search = typeof req.query?.search === "string" ? req.query.search.trim() : "";
      const hidden = req.query?.hidden === "1";
      const includePending = req.query?.includePending === "1";
      const incomplete = req.query?.incomplete === "1";
      const duplicates = req.query?.duplicates === "1";
      const integrityView = req.query?.integrity === "1";

      // 2026-10-09, Admin Hardening Slice 2: the control tower. Read-only:
      // system health (per source) kept apart from human decisions (per
      // event, grouped into classes). Computed fresh each time from the
      // same inventory the other views read -- see api/_lib/control-tower.js.
      // Nothing is written, and no event's status is ever changed here.
      if (integrityView) {
        const { loadSnapshot, buildReport } = require("./_lib/control-tower");
        const snapshot = await loadSnapshot({ supabaseUrl: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY, fetchFn: fetch });
        res.status(200).json(buildReport(snapshot, { includeEvents: true }));
        return;
      }

      // 2026-10-05: Admin > Duplicates. The deterministic pairs are merged
      // by the nightly pass; what is listed here is only what the rules
      // could not decide (scripts/duplicate-consolidation.js, classifyPair),
      // computed fresh each time from the upcoming inventory -- nothing is
      // stored until a person decides. `pending` is what the next nightly
      // run will merge on its own, shown so the queue is never a surprise.
      if (duplicates) {
        const { planConsolidation, fetchUpcomingRows, reviewSummary } = require("../scripts/duplicate-consolidation");
        const rows = await fetchUpcomingRows(SUPABASE_URL, sbHeaders, fetch);
        const plan = planConsolidation(rows);
        res.status(200).json({
          review: plan.reviews.map(reviewSummary),
          pending: plan.merges.map((m) => ({ rule: m.rule, survivorId: m.survivor.id, loserId: m.loser.id, title: m.survivor.title, start_date: m.survivor.start_date, survivorSource: m.survivor.source, loserSource: m.loser.source })),
          considered: rows.length,
        });
        return;
      }

      let url;
      if (incomplete) {
        const todayISO = new Date().toISOString().slice(0, 10);
        // venue_id + the embedded venues(address,city) let admin.html's
        // getMissingFields() credit an event that's genuinely linked to a
        // known venue with a real street address — see that function's own
        // comment (2026-09-16) for why venue_address_raw/venue_city_raw
        // alone was flagging well-matched events (e.g. Paris Bar) as
        // missing an address they don't actually lack.
        url = `${SUPABASE_URL}/rest/v1/events?status=in.(pending_review,approved)&start_date=gte.${todayISO}&select=id,title,category,status,start_date,time_display,is_all_day,venue_name_raw,venue_address_raw,venue_city_raw,venue_id,venues(address,city),description,ticket_url,event_url,submitter_org_name,submitter_email,source,followup_dismissed,followup_dismissed_note,no_fixed_venue,ticket_status,link_check_status&order=start_date.asc,id.asc`;
        // DEBT-003: every page, not the first 1,000 rows -- see fetchAllPages.
        // The judgment of what is "incomplete" still happens in admin.html,
        // on the whole candidate set, exactly as before.
        const all = await fetchAllPages(url, sbHeaders);
        res.status(all.ok ? 200 : 502).json(all.ok ? { events: all.rows } : { error: all.error });
        return;
      } else if (search) {
        // Live-event takedown search: only ever searches already-approved
        // (publicly visible) events — never pending_review or already-hidden
        // ones, so this can't be used to "approve via search" by accident.
        // includePending=1 (Press coverage's match-search only) widens that
        // to also catch a real match still sitting in the submission queue,
        // and also searches venue_name_raw alongside title — a moderator
        // reading an article often recognizes the venue name with more
        // confidence than guessing the exact event title wording.
        // encodeURIComponent already turns the literal "%" wildcards (and any
        // comma/parens that could otherwise be mistaken for or()-filter
        // syntax, e.g. searching "Arts, Beats & Eats") into safe percent-
        // escapes. A previous version of this code re-escaped the already-
        // escaped "%25" into "%2525" before embedding it in the or=(...)
        // filter below, which after PostgREST's single decode pass left a
        // literal "%25...%25" (real percent signs + the digits "25") as the
        // ilike pattern instead of "%...%" — so it only matched titles that
        // literally contained "25" next to the search term, i.e. effectively
        // nothing. That's why searching "Renaissance" or "Nicolas" in Press
        // Coverage's "Check for a match" found zero results even though the
        // events genuinely existed and were approved. Just use `encoded`
        // as-is here, same as the working title=ilike.${encoded} branch below.
        const encoded = encodeURIComponent(`%${search}%`);
        const statusFilter = includePending ? "status=in.(approved,pending_review)" : "status=eq.approved";
        const matchFilter = includePending
          ? `or=(title.ilike.${encoded},venue_name_raw.ilike.${encoded})`
          : `title=ilike.${encoded}`;
        url = `${SUPABASE_URL}/rest/v1/events?${statusFilter}&${matchFilter}&select=*&order=start_date.asc&limit=50`;
      } else if (hidden) {
        // Recently hidden/rejected, most recent first — the undo list.
        // 200, not 20: one nightly run can retire sixty rows (duplicates
        // folded into another row, closure notices), and every one of them
        // has to be reachable here to be put back.
        url = `${SUPABASE_URL}/rest/v1/events?status=eq.rejected&select=*&order=updated_at.desc&limit=200`;
      } else {
        url = `${SUPABASE_URL}/rest/v1/events?status=eq.pending_review&select=*&order=created_at.desc`;
      }

      const resp = await fetch(url, { headers: sbHeaders });
      const rows = await resp.json();
      res.status(resp.ok ? 200 : 502).json(resp.ok ? { events: rows } : { error: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};
    const { id, action } = body;

    // update_fields (2026-09-05, Jody: "how do I get to edit these fields?"
    // — asked right after the "Needs follow-up" section shipped as a
    // read-only heads-up) — lets admin.html actually fix a flagged gap in
    // place instead of sending Jody to Supabase's own SQL editor for every
    // single one. Deliberately its own small whitelist rather than a
    // generic "PATCH any column" endpoint: only the fields the follow-up
    // queue actually checks for are editable here, each validated the same
    // way api/submit.js validates the same fields on the public form.
    // 2026-10-05: a person's decision on a Duplicates pair. merge_duplicate
    // runs the very same steps as the nightly pass (survivor keeps the
    // loser's identity, links and blank fields; the loser is retired, never
    // deleted). not_duplicate marks both rows so the pair is never offered
    // again. Both need the two current rows, read fresh.
    if (action === "merge_duplicate" || action === "not_duplicate") {
      const { survivorId, loserId, aId, bId } = body;
      const firstId = action === "merge_duplicate" ? survivorId : aId;
      const secondId = action === "merge_duplicate" ? loserId : bId;
      if (!firstId || !secondId || firstId === secondId) {
        res.status(400).json({ error: action === "merge_duplicate" ? "Body must include { action: 'merge_duplicate', survivorId, loserId }" : "Body must include { action: 'not_duplicate', aId, bId }" });
        return;
      }
      try {
        const { applyMerge, markDistinct, SELECT } = require("../scripts/duplicate-consolidation");
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?id=in.(${encodeURIComponent(firstId)},${encodeURIComponent(secondId)})&select=${SELECT}`, { headers: sbHeaders });
        const rows = resp.ok ? await resp.json() : [];
        const first = Array.isArray(rows) ? rows.find((r) => r.id === firstId) : null;
        const second = Array.isArray(rows) ? rows.find((r) => r.id === secondId) : null;
        if (!first || !second) {
          res.status(404).json({ error: "One or both events were not found" });
          return;
        }
        if (action === "merge_duplicate") {
          const result = await applyMerge(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { survivor: first, loser: second, rule: "admin_decision" });
          res.status(result.retired ? 200 : 502).json({ ok: result.retired, ...result });
        } else {
          const ok = await markDistinct(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, first, second);
          res.status(ok ? 200 : 502).json({ ok });
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    if (action === "update_fields") {
      const EDITABLE_FIELDS = ["description", "venue_address_raw", "venue_city_raw", "ticket_url", "event_url", "time_display"];
      const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
      const requested = {};
      for (const key of EDITABLE_FIELDS) {
        if (!(key in fields)) continue;
        const val = typeof fields[key] === "string" ? fields[key].trim() : fields[key];
        if (val == null || val === "") continue;
        if ((key === "ticket_url" || key === "event_url") && !isSafeHttpUrl(val)) {
          res.status(400).json({ error: `${key} must be a valid http(s) link` });
          return;
        }
        requested[key] = val;
      }
      if (!id || !Object.keys(requested).length) {
        res.status(400).json({ error: "Body must include { id, action: 'update_fields', fields: { <at least one editable field> } }" });
        return;
      }
      try {
        // Re-check the row's CURRENT values server-side rather than trusting
        // whatever admin.html last rendered — this tool only ever fills a
        // gap in, never overwrites a field that already has something in it
        // (even if that got filled in by another tab, or a cron re-run,
        // between page load and clicking Save).
        const currentResp = await fetch(
          `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}&select=${Object.keys(requested).join(",")}`,
          { headers: sbHeaders }
        );
        const currentRows = await currentResp.json();
        if (!currentResp.ok || !currentRows[0]) {
          res.status(404).json({ error: "Event not found" });
          return;
        }
        const current = currentRows[0];
        const patch = {};
        for (const key of Object.keys(requested)) {
          const existing = current[key];
          if (existing == null || (typeof existing === "string" && !existing.trim())) {
            patch[key] = requested[key];
          }
        }
        if (!Object.keys(patch).length) {
          res.status(200).json({ ok: true, event: current, note: "Nothing to fill in — every requested field already had a value." });
          return;
        }
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { ...sbHeaders, Prefer: "return=representation" },
          body: JSON.stringify(patch),
        });
        const rows = await resp.json();
        res.status(resp.ok ? 200 : 502).json(resp.ok ? { ok: true, event: rows[0] } : { error: rows });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    // dismiss_followup / undo_dismiss_followup (2026-09-16, Jody: "how can
    // we make this more seamless and auto-healing?") — a real slice of the
    // follow-up queue is never fixable (RA's secret/TBA venues, a bus tour
    // with no fixed address) and was re-appearing, unchanged, on every
    // single PDF export. This lets a moderator mark a flagged gap
    // "reviewed, not fixable" so it stops nagging, without touching
    // status/approval or blocking a future real fix from a cron re-upsert
    // — see migration_027_followup_dismissed.sql for the column and the
    // full reasoning.
    if (action === "dismiss_followup" || action === "undo_dismiss_followup") {
      if (!id) {
        res.status(400).json({ error: "Body must include { id, action: 'dismiss_followup'|'undo_dismiss_followup' }" });
        return;
      }
      const dismissing = action === "dismiss_followup";
      const note = dismissing && typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { ...sbHeaders, Prefer: "return=representation" },
          body: JSON.stringify({
            followup_dismissed: dismissing,
            followup_dismissed_note: dismissing ? (note || null) : null,
            followup_dismissed_at: dismissing ? new Date().toISOString() : null,
          }),
        });
        const rows = await resp.json();
        res.status(resp.ok ? 200 : 502).json(resp.ok ? { ok: true, event: rows[0] } : { error: rows });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    // auto_repair_venue (2026-09-22, Auto-Repair V1; extended 2026-09-22
    // same day for Outer Limits description recovery) -- Needs Follow-up's
    // single "Auto-Repair" button. Takes no `id`; operates on the whole
    // current batch. Action name kept as-is for stability (nothing else
    // calls it) even though it now does more than venue repair.
    //
    // Step 1: the EXISTING, already-tested SH.1 deterministic venue
    // address/city repair, unmodified -- scripts/sh1-repair-existing-venue-
    // address-city.js's repairExistingEvents(), which itself calls
    // api/_lib/venue-lookup.js's resolveVenueAddressCityRepair() (canonical
    // venue_id, then exact canonical name match, then exact learned-
    // historical match; never fuzzy, never overwrites a populated field,
    // never touches any other column) and writes via that script's own
    // race-safe conditional PATCH (re-asserts each field is still null at
    // write time; a concurrent change is skipped, never overwritten).
    //
    // Step 2: authoritative Outer Limits Lounge description recovery
    // (scripts/outerlimits-description-repair.js's
    // repairOuterLimitsDescriptions()) -- Outer Limits is the single
    // largest remaining Needs Follow-up bucket (17 of 33 cards,
    // DESCRIPTION-only, per Jody's 2026-09-22 breakdown). Reuses api/cron-
    // outerlimitslounge.js's own Squarespace fetch/parse/identity logic
    // (there is exactly one parser for that source); fills a blank
    // description only when the venue's own live Post Body/excerpt is
    // genuinely nonblank, never overwrites, never generates. A failure in
    // this step is captured (outerLimitsDescriptionError) but never
    // discards Step 1's already-real, already-persisted results -- a
    // partial success is still reported honestly, never as a silent full
    // failure or a false full success.
    //
    // Step 3 (2026-09-23): authoritative Detroit Historical Society /
    // Dossin Great Lakes Museum event_url recovery
    // (scripts/dossin-metadata-repair.js's repairDossinMetadata()) -- 4
    // current cards flagged DESCRIPTION + TICKET/EVENT LINK. Reuses
    // api/cron-dossin.js's own parseDossinEvents()/dossinExternalId()
    // (there is exactly one parser for this source). Only ever fills
    // event_url from the source's own per-event "LEARN MORE" link, and
    // only when that link isn't shared by more than one event in the same
    // fetch (see that script's own generic-link-guard comment) -- never
    // description (the source page has no description data at all, a
    // separately-investigated, honestly-reported limitation, same as
    // Trinosophes), never a fabricated ticket_url. Same failure-isolation
    // pattern as Step 2: a failure here never discards Steps 1/2's real
    // results.
    //
    // Step 4 (2026-09-23): authoritative Redford Theatre metadata recovery
    // (scripts/redford-metadata-repair.js's repairRedfordMetadata()) -- 1
    // current card ("Return of the Jedi (1983)") flagged DESCRIPTION +
    // TICKET/EVENT LINK. Reuses api/cron-redford-theatre.js's own already-
    // tested parseRedfordEvents()/extractEventUrls()/fetchEventDetail()
    // (the exact recovery that connector's own 2026-09-22 rewrite already
    // proved live: archive-page href, detail-page description, ticket_url
    // only under the exactly-one-"Buy Tickets"-link rule) -- no new parser.
    // Same failure-isolation pattern as Steps 2/3.
    //
    // Step 5 (2026-09-23, "enrich before hiding"): generic (not source-
    // specific) automated enrichment -- scripts/generic-metadata-
    // enrichment.js's repairGenericMetadata(). Runs LAST, after every
    // authoritative per-source step above has already had its chance: safe
    // factual description generation from verified fields only
    // (api/_lib/description-enrichment.js, marked description_source=
    // 'generated' so it never outranks a real one), reverse ADDRESS ->
    // VENUE NAME resolution (api/_lib/venue-lookup.js's
    // resolveVenueNameFromAddressRepair, the mirror of SH.1's existing NAME
    // -> ADDRESS tier), and last-resort ticket/event link recovery via a
    // venue's own verified website/Facebook (resolveDigitalHomeLink).
    // Resident Advisor is excluded inside that script itself, not just by
    // caller discipline. Same failure-isolation pattern as Steps 2/3/4.
    //
    // This endpoint adds no new repair DECISION logic of its own in any
    // step -- it only sequences five already-proven mechanisms and exposes
    // their combined result to Admin. `written` and `fieldsWritten` below
    // report the UNION of events any step actually touched (an event can
    // need more than one kind of repair at once; summing each step's own
    // counters alone would double-count that event).
    if (action === "auto_repair_venue") {
      try {
        const { repairExistingEvents } = require("../scripts/sh1-repair-existing-venue-address-city");
        const venueCounts = await repairExistingEvents({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });

        let descriptionCounts = null;
        let outerLimitsDescriptionError = null;
        try {
          const { repairOuterLimitsDescriptions } = require("../scripts/outerlimits-description-repair");
          descriptionCounts = await repairOuterLimitsDescriptions({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
        } catch (descErr) {
          // Never lets a description-repair failure erase Step 1's real,
          // already-persisted venue-repair results -- surfaced explicitly
          // instead so it's visible, not masqueraded as a clean success.
          outerLimitsDescriptionError = descErr.message;
        }

        let dossinCounts = null;
        let dossinMetadataError = null;
        try {
          const { repairDossinMetadata } = require("../scripts/dossin-metadata-repair");
          dossinCounts = await repairDossinMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
        } catch (dossinErr) {
          // Same isolation as Step 2's own failure handling -- never lets a
          // Dossin-step failure erase Steps 1/2's real, already-persisted
          // results.
          dossinMetadataError = dossinErr.message;
        }

        let redfordCounts = null;
        let redfordMetadataError = null;
        try {
          const { repairRedfordMetadata } = require("../scripts/redford-metadata-repair");
          redfordCounts = await repairRedfordMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
        } catch (redfordErr) {
          // Same isolation as Steps 2/3's own failure handling -- never
          // lets a Redford-step failure erase Steps 1/2/3's real,
          // already-persisted results.
          redfordMetadataError = redfordErr.message;
        }

let genericCounts = null;
        let genericEnrichmentError = null;
        try {
          const { repairGenericMetadata } = require("../scripts/generic-metadata-enrichment");
          genericCounts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
        } catch (genericErr) {
          // Same isolation as Steps 2/3/4's own failure handling -- never
          // lets a generic-enrichment failure erase Steps 1-4's real,
          // already-persisted results.
          genericEnrichmentError = genericErr.message;
        }

        // Step 6 (2026-09-28, Needs Follow-up self-healing pass 2):
        // VisitDetroit dead-event-link self-healing
        // (scripts/visitdetroit-dead-link-repair.js's
        // repairVisitDetroitDeadLinks()) -- live-checks every current
        // VisitDetroit event's stored ticket_url, repairs it via the
        // known /<slug>/ -> /events/<slug>/ URL-shape migration when a
        // 404/410 is confirmed AND the replacement page's own text
        // confirms the same event title (api/_lib/link-health.js +
        // api/_lib/visitdetroit-link-recovery.js), and marks
        // link_check_status='dead' (a new, actionable Needs Follow-up
        // reason -- see admin.html's classifyMissingFields()) when it
        // can't. A timeout/403/429/5xx check is never treated as evidence
        // of anything and never writes. Same failure-isolation pattern as
        // Steps 2-5.
        //
        // SCOPE NOTE (per Jody, 2026-09-28): this button step is for
        // ONGOING drift only -- it re-checks whatever is currently in the
        // database each time it runs, so it's naturally idempotent and
        // safe to leave wired in here. It is deliberately NOT how the
        // initial, systemic 2026-09-28 VisitDetroit cleanup (repairing
        // every existing future row's time-parsing AND link-migration
        // fallout in one historical pass) gets done -- that one-time
        // repair is scripts/visitdetroit-initial-backfill.js, run once by
        // hand, separately from this button, so the first historical
        // cleanup is a deliberate, reviewed action rather than a side
        // effect of clicking Auto-Repair for something unrelated.
        let visitDetroitLinkCounts = null;
        let visitDetroitLinkError = null;
        try {
          const { repairVisitDetroitDeadLinks } = require("../scripts/visitdetroit-dead-link-repair");
          visitDetroitLinkCounts = await repairVisitDetroitDeadLinks({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
        } catch (linkErr) {
          // Same isolation as Steps 2-5's own failure handling -- never
          // lets a dead-link-repair failure erase Steps 1-5's real,
          // already-persisted results.
          visitDetroitLinkError = linkErr.message;
        }

        // Step 7 (2026-09-30, "self-healing/enrichment pivot" root-cause
        // fix -- see NEEDS_FOLLOWUP_ROOT_CAUSE.md): venue raw location
        // re-parse (scripts/venue-raw-reparse-repair.js's
        // repairVenueRawReparse()). api/_lib/ics-location.js's per-VEVENT
        // LOCATION grammars were too narrow for several already-live
        // multi-venue feeds (a region spelled out in full instead of
        // abbreviated; a Tribe-style location with no region field at
        // all) -- real address/city text fell through to the safe
        // "unparseable" fallback and got written WHOLE into
        // venue_name_raw instead of being split out. That grammar gap is
        // now fixed directly in ics-location.js, so every newly-ingested
        // event benefits automatically; this step gives EVERY event
        // already stuck with a raw, unsplit location string in
        // venue_name_raw (venue_id/venue_address_raw/venue_city_raw all
        // still null) one more chance at the same parser, now that it
        // recognizes their shape -- literally no new repair logic, just
        // re-running the (now-fixed) shared parser against evidence
        // already sitting on the row. Same failure-isolation pattern as
        // Steps 2-6.
        let venueRawReparseCounts = null;
        let venueRawReparseError = null;
        try {
          const { repairVenueRawReparse } = require("../scripts/venue-raw-reparse-repair");
          venueRawReparseCounts = await repairVenueRawReparse({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
        } catch (reparseErr) {
          // Same isolation as Steps 2-6's own failure handling -- never
          // lets this step's failure erase Steps 1-6's real,
          // already-persisted results.
          venueRawReparseError = reparseErr.message;
        }

        // Step 7b (2026-10-05): entries that are not events (closure notices,
        // suite-rental upsells) leave the public inventory, exactly as in the
        // nightly run and before the duplicate pass -- see
        // scripts/retire-non-events.js.
        let nonEventCounts = null;
        let nonEventRetirementError = null;
        try {
          const { retireNonEvents } = require("../scripts/retire-non-events");
          nonEventCounts = await retireNonEvents({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
        } catch (nonEventErr) {
          nonEventRetirementError = nonEventErr.message;
        }

        // Step 8 (2026-10-05): deterministic duplicate consolidation, the
        // same pass the nightly run makes -- see scripts/duplicate-consolidation.js.
        let duplicateCounts = null;
        let duplicateConsolidationError = null;
        try {
          const { consolidateDuplicates } = require("../scripts/duplicate-consolidation");
          duplicateCounts = await consolidateDuplicates({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
        } catch (dupErr) {
          duplicateConsolidationError = dupErr.message;
        }

        const venueWrittenIds = venueCounts.writtenIds || [];
        const duplicateWrittenIds = (duplicateCounts && duplicateCounts.writtenIds) || [];
        const descriptionWrittenIds = (descriptionCounts && descriptionCounts.writtenIds) || [];
        const dossinWrittenIds = (dossinCounts && dossinCounts.writtenIds) || [];
        const redfordWrittenIds = (redfordCounts && redfordCounts.writtenIds) || [];
        const genericWrittenIds = (genericCounts && genericCounts.writtenIds) || [];
        const visitDetroitLinkWrittenIds = (visitDetroitLinkCounts && visitDetroitLinkCounts.writtenIds) || [];
        const venueRawReparseWrittenIds = (venueRawReparseCounts && venueRawReparseCounts.writtenIds) || [];
        const combinedWrittenIds = new Set([...venueWrittenIds, ...descriptionWrittenIds, ...dossinWrittenIds, ...redfordWrittenIds, ...genericWrittenIds, ...visitDetroitLinkWrittenIds, ...venueRawReparseWrittenIds, ...duplicateWrittenIds]);
        const combinedFieldsWritten =
          venueCounts.fieldsWritten +
          ((descriptionCounts && descriptionCounts.written) || 0) +
          ((dossinCounts && dossinCounts.written) || 0) +
          ((redfordCounts && redfordCounts.fieldsWritten) || 0) +
          ((genericCounts && genericCounts.fieldsWritten) || 0) +
          ((visitDetroitLinkCounts && visitDetroitLinkCounts.fieldsWritten) || 0) +
          ((venueRawReparseCounts && venueRawReparseCounts.written) || 0);

        res.status(200).json({
          ok: true,
          ...venueCounts,
          written: combinedWrittenIds.size,
          fieldsWritten: combinedFieldsWritten,
          venue: venueCounts,
          outerLimitsDescription: descriptionCounts,
          outerLimitsDescriptionError,
          dossinMetadata: dossinCounts,
          dossinMetadataError,
          redfordMetadata: redfordCounts,
          redfordMetadataError,
          genericEnrichment: genericCounts,
          genericEnrichmentError,
          visitDetroitDeadLinks: visitDetroitLinkCounts,
          visitDetroitLinkError,
          venueRawReparse: venueRawReparseCounts,
          venueRawReparseError,
          nonEventRetirement: nonEventCounts,
          nonEventRetirementError,
          duplicateConsolidation: duplicateCounts,
          duplicateConsolidationError,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    if (!id || !["approve", "reject", "hide", "restore"].includes(action)) {
      res.status(400).json({ error: "Body must include { id, action: 'approve'|'reject'|'hide'|'restore'|'update_fields'|'dismiss_followup'|'undo_dismiss_followup'|'auto_repair_venue'|'merge_duplicate'|'not_duplicate' }" });
      return;
    }

    const newStatus = (action === "approve" || action === "restore") ? "approved" : "rejected";
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...sbHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ status: newStatus }),
      });
      const rows = await resp.json();
      if (resp.ok && action === "approve" && rows[0]) {
        await notifyEventLive(rows[0]);
      }
      res.status(resp.ok ? 200 : 502).json(resp.ok ? { ok: true, event: rows[0] } : { error: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
