// venues.html "N upcoming" count must use the same rule as the venue page (#365): start >= today OR continuous and not ended.
"use strict";
const assert = require("assert"), fs = require("fs");
const dir = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${dir}/venues.html`, "utf8");
const m = html.match(/function upcomingCountUrl\(base, todayISO\)\{[\s\S]*?\n\}\n/);
assert.ok(m, "upcomingCountUrl not found");
const url = new Function(`${m[0]}; return upcomingCountUrl("https://x.test", "2026-11-08");`)();
assert.ok(url.includes("status=eq.approved"), "approved only");
assert.ok(url.includes("or=(start_date.gte.2026-11-08,and(date_semantics.eq.continuous,end_date.gte.2026-11-08))"), "ongoing continuous rows counted");
assert.ok(url.includes("venue_id=not.is.null") && url.includes("select=id,venue_id") && /order=id\.asc$/.test(url), "paging order and select unchanged");
assert.ok(!/date_semantics\.eq\.(recurring|single)/.test(url) && !url.includes("unverified"), "recurring and unverified past rows not counted");
assert.ok(html.includes("fetchAllRows(upcomingCountUrl(SUPABASE_URL, getTodayISO()), headers)"), "directory uses the helper");
// parity with the venue page's rule
const vt = fs.readFileSync(`${dir}/venue-template.html`, "utf8");
assert.ok(vt.includes("or=(start_date.gte.${todayISO},and(date_semantics.eq.continuous,end_date.gte.${todayISO}))"), "venue page rule unchanged");
console.log("venues-upcoming-count-ongoing ok");
