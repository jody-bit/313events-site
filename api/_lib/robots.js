"use strict";

// api/_lib/robots.js
//
// robots.txt parsing and decisions for the schedule-evidence pass (Stage 1).
// Pure: no network here; evidence-fetch.js fetches robots.txt and calls these.
//
// Decision (isAllowed / decideFromResponse):
//   2xx  -> parse; Allow/Disallow longest-match wins, Allow wins a tie.
//   404/410 (and other 4xx except 401/403/429) -> no robots.txt -> allowed.
//   401/403, 429, 5xx, network error -> "unavailable": FAIL CLOSED. The caller
//     records robots_unavailable and fetches nothing from that host this run.

function parseRobots(text) {
  const groups = []; // { agents: [lowercase], rules: [{allow, path}], crawlDelay }
  let cur = null;
  let inAgents = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!cur || !inAgents) { cur = { agents: [], rules: [], crawlDelay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      inAgents = true;
      continue;
    }
    inAgents = false;
    if (!cur) continue;
    if (key === "allow" || key === "disallow") {
      if (val === "" && key === "disallow") continue; // empty Disallow = allow all
      cur.rules.push({ allow: key === "allow", path: val });
    } else if (key === "crawl-delay") {
      const n = Number(val);
      if (Number.isFinite(n) && n >= 0) cur.crawlDelay = n;
    }
  }
  return groups;
}

// The group whose agent token is the longest substring of the UA wins; "*" is the fallback.
function pickGroup(groups, ua) {
  const u = String(ua || "").toLowerCase();
  let best = null; let bestLen = -1;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === "*") { if (bestLen < 0) { best = g; bestLen = 0; } continue; }
      if (a && u.includes(a) && a.length > bestLen) { best = g; bestLen = a.length; }
    }
  }
  return best;
}

function ruleRegex(path) {
  const esc = path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + esc.replace(/\\\$$/, "$"));
}

function isAllowed(robotsText, ua, urlPath) {
  const group = pickGroup(parseRobots(robotsText), ua);
  if (!group) return true;
  let best = null;
  for (const r of group.rules) {
    if (!ruleRegex(r.path).test(urlPath)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

function crawlDelaySeconds(robotsText, ua) {
  const g = pickGroup(parseRobots(robotsText), ua);
  return g ? g.crawlDelay : null;
}

// status: HTTP status or null for a thrown network error.
function classifyRobotsStatus(status) {
  if (status === null || status === undefined) return "unavailable";
  if (status >= 200 && status < 300) return "parse";
  if (status === 401 || status === 403 || status === 429) return "unavailable";
  if (status >= 400 && status < 500) return "allowed_none";
  return "unavailable";
}

module.exports = { parseRobots, isAllowed, crawlDelaySeconds, classifyRobotsStatus };
