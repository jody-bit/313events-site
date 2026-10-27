// Public-site browser smoke (REL-1 W1). Every test asserts RENDERED DATA that is cross-checked against the same
// public API the pages read, not just a 200. Read-only: GETs and typing into search boxes. No form is submitted.
"use strict";
const { test, expect, stubExternals, applyBypass, upcomingFromApi } = require("./helpers");

test.beforeEach(async ({ page, baseURL }) => { await applyBypass(page, baseURL); await stubExternals(page); });

test("config.js targets the expected non-production database", async ({ cfg }) => {
  expect(cfg.supabaseUrl).toBeTruthy();
  expect(cfg.supabaseAnonKey).toBeTruthy();
  expect(cfg.environment).not.toBe("production");
});

test("API oracle: the staging database has upcoming events to render", async ({ cfg }) => {
  const api = await upcomingFromApi(cfg, 5);
  expect(api.ok, "events_public request failed with " + api.status).toBeTruthy();
  expect(api.rows.length, "no upcoming events in the target database; seed it before running the suite").toBeGreaterThan(0);
});

test("homepage renders event inventory from the database", async ({ page, cfg, errors }) => {
  const api = await upcomingFromApi(cfg, 5);
  await page.goto("/");
  const links = page.locator("a.evt-title-link");
  await expect(links.first()).toBeVisible();
  expect(await links.count()).toBeGreaterThan(0);
  const shown = (await links.allInnerTexts()).map((t) => t.trim().toLowerCase());
  // The page's own list must overlap what the API says is upcoming (the page may show a different subset/order).
  const apiTitles = api.rows.map((r) => String(r.title).trim().toLowerCase());
  const overlap = apiTitles.filter((t) => shown.includes(t));
  expect(overlap.length, "none of the API's first upcoming events appear on the homepage list").toBeGreaterThan(0);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("homepage search returns the matching event and a nonsense query returns none", async ({ page, cfg }) => {
  const api = await upcomingFromApi(cfg, 1);
  const title = String(api.rows[0].title);
  await page.goto("/");
  await expect(page.locator("a.evt-title-link").first()).toBeVisible();
  const search = page.locator("#search");
  await search.fill(title);
  await expect(page.locator("a.evt-title-link", { hasText: title }).first()).toBeVisible();
  await search.fill("zzzxqv no such event 0000");
  await expect(page.locator("a.evt-title-link")).toHaveCount(0);
});

test("calendar shows the API's upcoming events in their own month", async ({ page, cfg, errors }) => {
  // Cross-check against the API: page to the month of the first upcoming event (which may not be the current month)
  // and require that month's grid to contain at least one of that month's API events by title.
  const api = await upcomingFromApi(cfg, 40);
  expect(api.rows.length).toBeGreaterThan(0);
  const first = api.rows[0].start_date.slice(0, 7);
  const sameMonth = api.rows.filter((r) => r.start_date.slice(0, 7) === first).map((r) => String(r.title).trim());
  const now = new Date();
  const [y, m] = first.split("-").map(Number);
  const steps = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  expect(Math.abs(steps), "first upcoming event is outside the calendar's navigable range").toBeLessThanOrEqual(12);
  await page.goto("/calendar");
  await expect(page.locator("#calGrid")).toBeAttached();
  for (let i = 0; i < Math.abs(steps); i++) await page.locator(steps > 0 ? "#nextBtn" : "#prevBtn").click();
  const pills = page.locator("#calGrid .pill .t");
  // Attached, not visible: at phone width the month grid shows counts instead of titled pills (see PR #157).
  await expect(pills.first()).toBeAttached();
  const shown = (await pills.allTextContents()).map((t) => t.trim().toLowerCase());
  const hit = sameMonth.filter((t) => shown.some((s) => s.includes(t.toLowerCase()) || t.toLowerCase().includes(s)));
  expect(hit.length, "none of this month's API events (" + sameMonth.slice(0, 5).join(" | ") + ") appear on the calendar grid").toBeGreaterThan(0);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("map loads, reports complete, and plots markers", async ({ page }) => {
  await page.goto("/map");
  await expect.poll(() => page.evaluate(() => (window.__313MapLoad || {}).state), { timeout: 30000 }).toBe("ready");
  const st = await page.evaluate(() => window.__313MapLoad);
  expect(st.complete).toBe(true);
  expect(st.total).toBeGreaterThan(0);
  expect(st.plotted, "events loaded but none were plotted").toBeGreaterThan(0);
  await expect(page.locator(".leaflet-marker-icon, .leaflet-interactive").first()).toBeVisible();
});

test("event detail page renders the event's title, date and venue", async ({ page, cfg, errors }) => {
  const api = await upcomingFromApi(cfg, 1);
  const ev = api.rows[0];
  await page.goto("/event.html?id=" + encodeURIComponent(ev.id));
  await expect(page.locator("#evtTitle")).toHaveText(new RegExp(String(ev.title).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  await expect(page.locator("#evtWhen")).not.toBeEmpty();
  await expect(page.locator("#evtWhere")).not.toBeEmpty();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("submit form blocks an empty submission without sending anything", async ({ page }) => {
  const posts = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/api\/submit/.test(r.url())) posts.push(r.url()); });
  await page.goto("/submit");
  await page.locator("#eventForm button[type=submit]").click();
  await expect(page.locator("#formError")).toBeVisible();
  expect(posts).toEqual([]);
});
