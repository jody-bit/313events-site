"use strict";

// api/_lib/source-health.js — Admin Hardening Slice 2, Parts B and C:
// source health and inventory currency.
//
// THE QUESTION THIS ANSWERS
// "Is each source still delivering a true, current picture of its events?"
// A cron returning 200, or a source_runs row saying outcome=success, only
// answers "did the code run". Measured 2026-10-08: Cinema Detroit logged
// success every day for 8 days while writing 0 of 38 fetched records;
// Belle Isle logged success while fetching nothing; Planet Ant has no run
// log at all and its events were last touched 2026-09-14; Ticketmaster has
// 500+ public events and no schedule. The healthcheck said "ok".
//
// So health is split into dimensions that are measured separately and
// never collapsed into one another:
//   execution   the latest run finished (success/partial), vs failed,
//               blocked, or abandoned (started, never finished)
//   retrieval   the run fetched anything (records_fetched > 0)
//   useful      the run produced rows worth keeping (records_parsed when a
//               connector reports it, otherwise records_written — labelled)
//   written     rows the database accepted (records_written)
//   currency    the source's public upcoming events were re-observed at
//               the source on its expected cadence
// Each is 'ok' | 'fail' | 'unknown'. Unknown is a first-class answer: a
// connector that does not log, or does not report a counter, gets
// "insufficient evidence", never an invented history.
//
// EXPECTED CADENCE comes from where the schedule actually lives:
// vercel.json's crons (read at runtime, so the hold in commit c9d8319 is
// visible as "unscheduled"), or a declared external scheduler (RA runs
// from the device's scheduled task through the GitHub Actions bridge, not
// from vercel.json). No schedule -> no expected cadence -> currency is
// 'unknown', never 'stale'.
//
// CURRENCY BASIS
// events.last_seen_at_source (migration_046, written by
// api/_lib/event-upsert.js only when EVENTS_LAST_SEEN_AT_SOURCE=on) when
// it is populated; otherwise events.updated_at as a PROXY. The proxy is
// conservative in one direction only: every connector re-upserts each row
// it still sees, so an old updated_at proves the row was NOT re-seen; but
// enrichment and Admin edits also touch updated_at, so a recent one does
// not prove it WAS. Stale is reported only on positive evidence.
//
// STALE IS NOT CANCELLED. Nothing here changes status, hides, cancels or
// reschedules anything. A stale event is a question for a person.

const { SOURCE_SLUGS } = require("./source-slugs");

const HOUR_MS = 3600000;
const STREAK_FAILING = 3; // consecutive runs: one bad day is noise, three is a pattern
const CURRENCY_GRACE_HOURS = 6;
const STALE_SHARE_THRESHOLD = 0.5; // a source is stale when fewer than half its public upcoming events were re-seen
const STALE_MIN_EVENTS = 3;
const VOLUME_DEVIATION_RATIO = 0.5;
const VOLUME_DEVIATION_MIN_ABS = 5;
const STARTED_RUN_TIMEOUT_MINUTES = 15; // same budget as api/cron-healthcheck.js

// Which connector produced an event. external_id prefixes are each
// connector's own construction (see the cron-*.js files); Ticketmaster
// writes the bare Discovery API id, so it is matched on source.
const ATTRIBUTION = Object.freeze([
  { slug: "feeds", prefix: "feed-" },
  { slug: "localist", prefix: "localist-" },
  { slug: "visitdetroit", prefix: "vd-" },
  { slug: "gottagacha", prefix: "gottagacha-" },
  { slug: "resident-advisor", prefix: "ra-" },
  { slug: "motorcitywine", prefix: "mcw-" },
  { slug: "outerlimitslounge", prefix: "oll-" },
  { slug: "redford-theatre", prefix: "redford-" },
  { slug: "planetanttheatre", prefix: "crowdwork-" },
  { slug: "halo", prefix: "halo-" },
  { slug: "trinosophes", prefix: "trinosophes-" },
  { slug: "bigtimebingo", prefix: "big-" },
  { slug: "lagerhouse", prefix: "lagerhouse-" },
  { slug: "dossin", prefix: "dossin-" },
  { slug: "bagleycommunity", prefix: "bagleycc-" },
  { slug: "oldmiami", prefix: "oldmiami-" },
  { slug: "wdet", prefix: "wdet-" },
  { slug: "playgrounddetroit", prefix: "playgrounddetroit-" },
  { slug: "poppspacking", prefix: "poppspacking-" },
  { slug: "belle-isle-nature-center", prefix: "bink-" },
  { slug: "cinema-detroit", prefix: "cinemadetroit-" },
  { slug: "metrotimes", prefix: "metrotimes-" },
  { slug: "detroitmonthofdesign", prefix: "dmod-" },
  { slug: "detroittraining", prefix: "dtc-" },
  { slug: "eventbrite-org", prefix: "eventbrite-" },
  { slug: "ticketmaster", source: "Ticketmaster" },
]);

// Schedulers that are not vercel.json. Declared, and labelled as declared.
const EXTERNAL_SCHEDULES = Object.freeze({
  "resident-advisor": { cadenceHours: 24, scheduler: "device scheduled task → GitHub Actions bridge (declared; not verifiable from the repo)" },
});

// Sources that import NEW events only and never re-upsert ones they already
// hold, so an old observation time says nothing about them. RA's sync
// (scripts/ra-sync.js) decides "what's genuinely new" and writes only that.
const NO_REOBSERVATION = new Set(["resident-advisor"]);

// Slugs that are not event sources (they repair existing rows).
const NOT_EVENT_SOURCES = new Set(["enrichment"]);

function attributeEvent(e) {
  const ext = typeof e.external_id === "string" ? e.external_id : "";
  for (const a of ATTRIBUTION) {
    if (a.prefix && ext.startsWith(a.prefix)) return a.slug;
    if (a.source && e.source === a.source) return a.slug;
  }
  return null; // manual, researched or one-off import: no recurring source
}

// parseCronCadenceHours("0 14 * * *") -> 24. Only the shapes this project
// uses are understood; anything else is null (unknown), never a guess.
function parseCronCadenceHours(expr) {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  if (!/^\d+$/.test(min)) return null;
  if (dom !== "*" || mon !== "*") return null;
  if (/^\d+$/.test(hour) && dow === "*") return 24;
  if (/^\d+$/.test(hour) && /^\d$/.test(dow)) return 168;
  const every = /^\*\/(\d+)$/.exec(hour);
  if (every && dow === "*") return Number(every[1]);
  if (hour === "*" && dow === "*") return 1;
  return null;
}

// schedulesFromVercel(vercelConfig) -> Map slug -> { expr, cadenceHours, scheduler }
function schedulesFromVercel(vercelConfig) {
  const map = new Map();
  const crons = (vercelConfig && Array.isArray(vercelConfig.crons)) ? vercelConfig.crons : [];
  for (const c of crons) {
    const m = /^\/api\/cron-([a-z0-9-]+)$/.exec(String(c.path || ""));
    if (!m) continue;
    map.set(m[1], { expr: c.schedule, cadenceHours: parseCronCadenceHours(c.schedule), scheduler: "vercel.json" });
  }
  return map;
}

function scheduleFor(slug, vercelSchedules) {
  if (vercelSchedules.has(slug)) return vercelSchedules.get(slug);
  if (EXTERNAL_SCHEDULES[slug]) return Object.assign({ expr: null }, EXTERNAL_SCHEDULES[slug]);
  return null;
}

function ms(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

function seenAtMs(e) {
  const own = ms(e.last_seen_at_source);
  if (own !== null) return { at: own, basis: "last_seen_at_source" };
  const proxy = ms(e.updated_at);
  return { at: proxy, basis: "updated_at (proxy)" };
}

function finishedRuns(runs) {
  return runs.filter((r) => r.outcome && r.outcome !== "started");
}

function streak(runs, predicate) {
  let n = 0;
  for (const r of runs) {
    if (!predicate(r)) break;
    n += 1;
  }
  return n;
}

function median(nums) {
  const s = nums.filter((n) => typeof n === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// The cut-off an event's observation must reach to count as re-seen.
// With a run log: the latest run that retrieved anything (an event the
// source still lists is re-upserted by that run). Without one: the
// expected cadence, twice, plus grace. No cadence: no cut-off.
function currencyCutoff(sourceState, nowMs) {
  if (!sourceState.schedule || !sourceState.schedule.cadenceHours) return null;
  if (sourceState.lastRetrievingRunStartedAt) return ms(sourceState.lastRetrievingRunStartedAt) - HOUR_MS;
  if (sourceState.runLogged) return null; // it logs, but nothing retrieved lately: retrieval is the problem, not currency
  return nowMs - (2 * sourceState.schedule.cadenceHours + CURRENCY_GRACE_HOURS) * HOUR_MS;
}

// eventCurrency(e, sourceState, nowMs) -> { state, basis, message }
function eventCurrency(e, sourceState, nowMs) {
  if (!sourceState) return { state: "unknown", basis: "no recurring source", message: "Manual or one-off import — no source to re-observe it" };
  const seen = seenAtMs(e);
  if (sourceState.reobserves === false) {
    return { state: "unknown", basis: "source imports new events only", message: `${sourceState.label} never re-observes events it already holds — currency unknown, not stale` };
  }
  if (!sourceState.schedule || !sourceState.schedule.cadenceHours) {
    return { state: "unknown", basis: seen.basis, message: `${sourceState.label} has no expected cadence (unscheduled) — currency unknown, not stale` };
  }
  const cutoff = currencyCutoff(sourceState, nowMs);
  if (cutoff === null || seen.at === null) return { state: "unknown", basis: seen.basis, message: "Not enough evidence to judge currency" };
  if (seen.at >= cutoff) return { state: "current", basis: seen.basis, message: null };
  const days = Math.floor((nowMs - seen.at) / (24 * HOUR_MS));
  return { state: "stale", basis: seen.basis, message: `Not re-seen at ${sourceState.label} for ${days}d (basis: ${seen.basis}) — stale, not cancelled` };
}

// evaluateSources({ runs, events, vercelConfig, now, integrityById }) -> {
//   sources: [...], byslug: Map, currencyOf(e) }
// runs: source_runs rows (any order; last ~30 days is plenty)
// events: upcoming, non-rejected rows with status, external_id, source,
//         updated_at, last_seen_at_source (optional)
// integrityById: optional Map id -> evaluateEvent() result, for the
//         missing-link and placeholder rates
// feeds: optional approved feed_sources rows ({ id, venue_name,
//         last_polled_at, last_poll_result }). cron-feeds.js keeps no
//         source_runs row but records every feed's own poll outcome there,
//         which is real per-feed retrieval evidence.
function evaluateSources({ runs = [], events = [], vercelConfig = null, now = Date.now(), integrityById = null, feeds = null } = {}) {
  const nowMs = typeof now === "number" ? now : ms(now);
  const vercelSchedules = schedulesFromVercel(vercelConfig);
  // If the schedule itself could not be read, "not in vercel.json" proves
  // nothing: no source is called unscheduled on that basis.
  const scheduleReadable = !!(vercelConfig && Array.isArray(vercelConfig.crons));
  const runsBySlug = new Map();
  for (const r of runs) {
    if (!runsBySlug.has(r.source_slug)) runsBySlug.set(r.source_slug, []);
    runsBySlug.get(r.source_slug).push(r);
  }
  for (const list of runsBySlug.values()) list.sort((a, b) => ms(b.started_at) - ms(a.started_at));

  const eventsBySlug = new Map();
  for (const e of events) {
    const slug = attributeEvent(e);
    if (!slug) continue;
    if (!eventsBySlug.has(slug)) eventsBySlug.set(slug, []);
    eventsBySlug.get(slug).push(e);
  }

  const sources = [];
  const bySlug = new Map();
  for (const entry of SOURCE_SLUGS) {
    if (NOT_EVENT_SOURCES.has(entry.slug)) continue;
    const slug = entry.slug;
    const allRuns = runsBySlug.get(slug) || [];
    const done = finishedRuns(allRuns);
    const latest = allRuns[0] || null;
    const latestDone = done[0] || null;
    const schedule = scheduleFor(slug, vercelSchedules);
    const evs = eventsBySlug.get(slug) || [];
    const publicUpcoming = evs.filter((e) => e.status === "approved");
    const lastRetrieving = done.find((r) => typeof r.records_fetched === "number" ? r.records_fetched > 0 : typeof r.records_written === "number" && r.records_written > 0);

    const s = {
      slug,
      label: entry.label,
      scheduled: !!schedule,
      schedule: schedule ? { expr: schedule.expr, cadenceHours: schedule.cadenceHours, scheduler: schedule.scheduler } : null,
      runLogged: allRuns.length > 0,
      reobserves: !NO_REOBSERVATION.has(slug),
      runsConsidered: allRuns.length,
      lastAttemptAt: latest ? latest.started_at : null,
      lastSuccessAt: (done.find((r) => r.outcome === "success" || r.outcome === "partial") || {}).started_at || null,
      lastOutcome: latest ? latest.outcome : null,
      lastFetched: latestDone && typeof latestDone.records_fetched === "number" ? latestDone.records_fetched : null,
      lastParsed: latestDone && typeof latestDone.records_parsed === "number" ? latestDone.records_parsed : null,
      lastWritten: latestDone && typeof latestDone.records_written === "number" ? latestDone.records_written : null,
      zeroFetchStreak: streak(done, (r) => r.records_fetched === 0),
      zeroWriteStreak: streak(done, (r) => r.records_written === 0 && !(r.records_fetched === 0)),
      lastRetrievingRunStartedAt: lastRetrieving ? lastRetrieving.started_at : null,
      upcomingPublic: publicUpcoming.length,
      upcomingPending: evs.filter((e) => e.status === "pending_review").length,
      lastSeenPublicAt: null,
      currencyBasis: null,
      reseenShare: null,
      missingLinkRate: null,
      placeholderVenueRate: null,
      volume: null,
      dimensions: {},
      status: "healthy",
      reasons: [],
    };

    // last time a public event was observed at the source
    let latestSeen = null;
    const bases = new Set();
    for (const e of publicUpcoming) {
      const seen = seenAtMs(e);
      bases.add(seen.basis);
      if (seen.at !== null && (latestSeen === null || seen.at > latestSeen)) latestSeen = seen.at;
    }
    s.lastSeenPublicAt = latestSeen === null ? null : new Date(latestSeen).toISOString();
    s.currencyBasis = bases.size ? Array.from(bases).sort().join(" + ") : null;

    // currency across the source's public upcoming inventory
    let current = 0;
    let stale = 0;
    for (const e of publicUpcoming) {
      const c = eventCurrency(e, s, nowMs);
      if (c.state === "current") current += 1;
      else if (c.state === "stale") stale += 1;
    }
    if (current + stale > 0) s.reseenShare = current / (current + stale);

    // link / placeholder rates from the integrity verdicts
    if (integrityById && publicUpcoming.length) {
      let weakLink = 0;
      let placeholder = 0;
      for (const e of publicUpcoming) {
        const r = integrityById.get(e.id);
        if (!r) continue;
        if (r.linkClass !== "specific") weakLink += 1;
        if (r.reasons.some((x) => x.code === "venue.placeholder" || x.code === "place.placeholder_asserts_city")) placeholder += 1;
      }
      s.missingLinkRate = weakLink / publicUpcoming.length;
      s.placeholderVenueRate = placeholder / publicUpcoming.length;
    }

    // volume: latest fetched/written vs the median of the runs before it
    if (done.length >= 3 && (done[0].outcome === "success" || done[0].outcome === "partial")) {
      // baseline from completed runs only: a failed run's zero is not "normal volume"
      const prior = done.slice(1).filter((r) => r.outcome === "success" || r.outcome === "partial").slice(0, 7);
      const out = {};
      for (const field of ["records_fetched", "records_written"]) {
        const cur = done[0][field];
        const base = median(prior.map((r) => r[field]));
        if (typeof cur !== "number" || base === null) continue;
        const delta = cur - base;
        const deviates = Math.abs(delta) >= VOLUME_DEVIATION_MIN_ABS && (base === 0 ? cur > 0 : Math.abs(delta) / base > VOLUME_DEVIATION_RATIO);
        out[field] = { latest: cur, baselineMedian: base, deviates };
      }
      s.volume = out;
    }

    // ---- dimensions ----
    const d = s.dimensions;
    if (!latest) d.execution = "unknown";
    else if (latest.outcome === "started" && !latest.finished_at && nowMs - ms(latest.started_at) > STARTED_RUN_TIMEOUT_MINUTES * 60000) d.execution = "fail";
    else if (latestDone && (latestDone.outcome === "failed" || latestDone.outcome === "blocked")) d.execution = "fail";
    else d.execution = latestDone ? "ok" : "unknown";
    d.retrieval = s.lastFetched === null ? "unknown" : s.lastFetched > 0 ? "ok" : "fail";
    const usefulCount = s.lastParsed !== null ? s.lastParsed : s.lastWritten;
    d.useful = usefulCount === null ? "unknown" : usefulCount > 0 ? "ok" : "fail";
    d.usefulBasis = s.lastParsed !== null ? "records_parsed" : s.lastWritten !== null ? "records_written" : null;
    d.written = s.lastWritten === null ? "unknown" : s.lastWritten > 0 ? "ok" : "fail";
    if (!schedule || !schedule.cadenceHours) d.currency = "unknown";
    else if (current + stale < 1) d.currency = "unknown";
    else d.currency = (current + stale >= STALE_MIN_EVENTS && s.reseenShare < STALE_SHARE_THRESHOLD) ? "fail" : "ok";

    // ---- status (one, with every reason) ----
    const why = s.reasons;
    let status = "healthy";
    const raise = (to) => {
      const order = ["healthy", "inactive", "insufficient_evidence", "degraded", "stale", "unscheduled", "failing"];
      if (order.indexOf(to) > order.indexOf(status)) status = to;
    };
    if (!schedule && !scheduleReadable) {
      raise("insufficient_evidence");
      why.push("The cron schedule (vercel.json) could not be read — scheduled or not is unknown");
    } else if (!schedule) {
      if (s.upcomingPublic > 0) {
        raise("unscheduled");
        why.push(`Not scheduled, but ${s.upcomingPublic} public upcoming event(s) depend on it — nothing is refreshing them`);
      } else {
        raise("inactive");
        why.push("Not scheduled and no public upcoming events");
      }
    } else {
      const cadenceMs = (schedule.cadenceHours || 24) * HOUR_MS;
      if (!s.runLogged) {
        raise("insufficient_evidence");
        why.push("Connector does not write source_runs — run history unknown; judged on inventory evidence only");
      } else if (nowMs - ms(s.lastAttemptAt) > 2 * cadenceMs + CURRENCY_GRACE_HOURS * HOUR_MS) {
        raise("failing");
        why.push(`No run attempted since ${s.lastAttemptAt} (expected every ${schedule.cadenceHours}h)`);
      }
      if (d.execution === "fail") {
        raise("failing");
        why.push(`Latest run ${latest.outcome}${latest.outcome === "started" ? " and never finished" : ""}`);
      }
      if (s.zeroFetchStreak >= STREAK_FAILING) {
        raise("failing");
        why.push(`Fetched 0 records on the last ${s.zeroFetchStreak} runs — "success" with nothing retrieved`);
      } else if (s.zeroFetchStreak > 0) {
        raise("degraded");
        why.push(`Fetched 0 records on the last ${s.zeroFetchStreak} run(s)`);
      }
      if (s.zeroWriteStreak >= STREAK_FAILING) {
        raise("failing");
        why.push(`Fetched ${s.lastFetched === null ? "records" : s.lastFetched} but wrote 0 on the last ${s.zeroWriteStreak} runs — no useful output`);
      } else if (s.zeroWriteStreak > 0) {
        raise("degraded");
        why.push(`Wrote 0 records on the last ${s.zeroWriteStreak} run(s)`);
      }
      if (d.currency === "fail") {
        raise("stale");
        why.push(`Only ${Math.round(s.reseenShare * 100)}% of ${current + stale} public upcoming events re-seen on schedule (last seen ${s.lastSeenPublicAt || "never"}; basis ${s.currencyBasis})`);
      }
      if (!s.runLogged && d.currency === "ok") {
        why.push(`Inventory re-seen on schedule (${Math.round(s.reseenShare * 100)}%; basis ${s.currencyBasis})`);
      }
    }
    if (!s.runLogged && schedule && s.upcomingPublic === 0 && s.upcomingPending === 0) {
      why.push("No run log and no upcoming events at all — no evidence this source produces anything");
    }
    if (slug === "feeds" && Array.isArray(feeds)) {
      const polledOk = (f) => /events? found/i.test(String(f.last_poll_result || ""));
      const failingFeeds = feeds.filter((f) => f.last_poll_result && !polledOk(f));
      const notPolled = feeds.filter((f) => !f.last_polled_at || nowMs - ms(f.last_polled_at) > 2 * 24 * HOUR_MS + CURRENCY_GRACE_HOURS * HOUR_MS);
      s.feeds = {
        approved: feeds.length,
        failing: failingFeeds.map((f) => ({ name: f.venue_name, result: String(f.last_poll_result).slice(0, 120), polledAt: f.last_polled_at })),
        notPolledRecently: notPolled.map((f) => ({ name: f.venue_name, polledAt: f.last_polled_at })),
      };
      if (failingFeeds.length) {
        raise(failingFeeds.length === feeds.length ? "failing" : "degraded");
        why.push(`${failingFeeds.length} of ${feeds.length} approved feeds failing on their last poll: ${failingFeeds.map((f) => `${f.venue_name} (${String(f.last_poll_result).slice(0, 40)})`).join(", ")}`);
      }
      if (notPolled.length) {
        raise("degraded");
        why.push(`${notPolled.length} approved feed(s) not polled in 2 days: ${notPolled.map((f) => f.venue_name).join(", ")}`);
      }
      if (feeds.length && !failingFeeds.length && !notPolled.length) why.push(`All ${feeds.length} approved feeds polled successfully (feed_sources.last_poll_result)`);
    }
    if (s.volume) {
      for (const [field, v] of Object.entries(s.volume)) {
        if (v.deviates) {
          raise("degraded");
          why.push(`Volume anomaly: ${field} ${v.latest} vs median ${v.baselineMedian} of the previous runs`);
        }
      }
    }
    if (status === "healthy" && !why.length) why.push("Runs, output and currency within expectations");
    s.status = status;
    s.unhealthy = ["failing", "stale", "unscheduled", "degraded"].includes(status);
    sources.push(s);
    bySlug.set(slug, s);
  }

  const currencyOf = (e) => {
    const slug = attributeEvent(e);
    return eventCurrency(e, slug ? bySlug.get(slug) : null, nowMs);
  };
  return { sources, bySlug, currencyOf };
}

module.exports = {
  ATTRIBUTION,
  EXTERNAL_SCHEDULES,
  NO_REOBSERVATION,
  STREAK_FAILING,
  STALE_SHARE_THRESHOLD,
  attributeEvent,
  parseCronCadenceHours,
  schedulesFromVercel,
  eventCurrency,
  evaluateSources,
};
