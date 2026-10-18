"use strict";
const fs = require("fs");
const path = require("path");
const { test: base, expect, request } = require("@playwright/test");

const MODE = process.env.SMOKE_MODE === "mock" ? "mock" : "deployed";
const EXPECTED_REF = process.env.SMOKE_EXPECT_SUPABASE_REF || "efxjdlogohcggpuftivm"; // staging; production is never a valid target
const PRODUCTION_REF = "afvyfjfqukptnfmgshzn";

// External hosts the pages load (fonts, Leaflet, tiles) are not part of what this suite verifies. In mock mode there
// is no network, so Leaflet is served from the pinned npm package and everything else is dropped.
async function stubExternals(page) {
  if (MODE !== "mock") return;
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const u = route.request().url();
    const leaf = path.join(__dirname, "..", "node_modules", "leaflet", "dist");
    if (/leaflet@1\.9\.4\/dist\/leaflet\.js/.test(u)) return route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(path.join(leaf, "leaflet.js")) });
    if (/leaflet@1\.9\.4\/dist\/leaflet\.css/.test(u)) return route.fulfill({ contentType: "text/css", body: fs.readFileSync(path.join(leaf, "leaflet.css")) });
    return route.abort();
  });
}

// Reads the deployment's own /config.js and refuses to run unless it points at staging. This is the guard that keeps
// the suite (and, later, the mutating admin tests) off production data.
async function readConfig(baseURL) {
  const ctx = await request.newContext({ baseURL });
  const resp = await ctx.get("/config.js");
  const text = await resp.text();
  await ctx.dispose();
  const m = /window\.__313_CONFIG\s*=\s*(\{.*\});?/s.exec(text);
  if (!resp.ok() || !m) throw new Error("/config.js did not return a config object (status " + resp.status() + ")");
  return JSON.parse(m[1]);
}

function assertTarget(cfg) {
  if (MODE === "mock") return;
  if (String(cfg.supabaseUrl).includes(PRODUCTION_REF)) throw new Error("REFUSING TO RUN: /config.js points at the PRODUCTION database. This suite targets Preview/staging only.");
  if (!String(cfg.supabaseUrl).includes(EXPECTED_REF)) throw new Error("REFUSING TO RUN: /config.js supabaseUrl (" + cfg.supabaseUrl + ") is not the expected staging project " + EXPECTED_REF + ".");
  if (cfg.environment === "production") throw new Error("REFUSING TO RUN: /config.js reports environment=production.");
}

// Independent oracle: ask the same public REST endpoint the pages use (anon key, read-only GET) for upcoming events.
async function upcomingFromApi(cfg, limit) {
  const ctx = await request.newContext();
  const today = new Date().toISOString().slice(0, 10);
  const url = cfg.supabaseUrl + "/rest/v1/events_public?or=(start_date.gte." + today + ",end_date.gte." + today + ")&select=id,title,start_date&order=start_date.asc,id.asc&limit=" + (limit || 10);
  const resp = await ctx.get(url, { headers: { apikey: cfg.supabaseAnonKey, Authorization: "Bearer " + cfg.supabaseAnonKey } });
  const rows = resp.ok() ? await resp.json() : [];
  await ctx.dispose();
  return { ok: resp.ok(), status: resp.status(), rows };
}

const test = base.extend({
  cfg: [async ({ baseURL }, use) => { const cfg = await readConfig(baseURL); assertTarget(cfg); await use(cfg); }, { scope: "test" }],
  errors: async ({ page }, use) => {
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    await use(errs);
  },
});

module.exports = { test, expect, stubExternals, upcomingFromApi, MODE };
