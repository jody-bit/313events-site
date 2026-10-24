// test/dossin-event-url-absolute.test.js
//
// Detroit Historical Society's page carries relative "LEARN MORE" hrefs
// (/events/guided-tour-57). The Auto-Repair step used to store them verbatim,
// leaving two approved upcoming rows with a relative event_url. This guards
// that fetchEventUrlsByExternalId resolves them against the source page URL and
// still applies the shared-link guard on the resolved URL.
//
// Run: node test/dossin-event-url-absolute.test.js
"use strict";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-key";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { fetchEventUrlsByExternalId } = require(`${REPO_DIR}/scripts/dossin-metadata-repair.js`);
const { dossinExternalId } = require(`${REPO_DIR}/api/cron-dossin.js`);

const block = (title, date, href) => `<div>${title}</div>
<div>Dossin Great Lakes Museum</div>
<div>${date}, 11:00am</div>
<div><a href="${href}">Learn More</a></div>
`;

(async () => {
  const html = [
    block("Guided tour", "October 31, 2026", "/events/guided-tour-57"),
    block("Members night at the museum", "October 28, 2026", "/events/members-night-museum-2"),
    block("Already absolute", "November 4, 2026", "https://www.detroithistorical.org/events/already-absolute"),
    block("Shared link A", "November 5, 2026", "/events/shared"),
    block("Shared link B", "November 6, 2026", "https://www.detroithistorical.org/events/shared"),
    block("Mail link", "November 7, 2026", "mailto:info@example.org"),
  ].join("\n");
  const { map, genericLinksSkipped } = await fetchEventUrlsByExternalId(async () => ({ ok: true, status: 200, text: async () => html }));
  const get = (d, t) => map.get(dossinExternalId(d, t));
  assert.strictEqual(get("2026-10-31", "Guided tour"), "https://www.detroithistorical.org/events/guided-tour-57", "relative href resolved");
  assert.strictEqual(get("2026-10-28", "Members night at the museum"), "https://www.detroithistorical.org/events/members-night-museum-2", "relative href resolved");
  assert.strictEqual(get("2026-11-04", "Already absolute"), "https://www.detroithistorical.org/events/already-absolute", "absolute href unchanged");
  assert.strictEqual(get("2026-11-05", "Shared link A"), undefined, "shared link guard applies after resolving");
  assert.strictEqual(get("2026-11-06", "Shared link B"), undefined, "shared link guard applies after resolving");
  assert.strictEqual(genericLinksSkipped, 2, "both shared-link events counted as skipped");
  assert.strictEqual(get("2026-11-07", "Mail link"), undefined, "non-http(s) href is no link");
  for (const v of map.values()) assert.ok(/^https:\/\//.test(v), "every stored link is absolute https");
  console.log("PASS: Dossin event_url hrefs resolve to absolute https links; shared and non-http hrefs still skipped");
})().catch((e) => { console.error(e); process.exit(1); });
