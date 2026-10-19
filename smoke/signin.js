// smoke/signin.js — run once on the operator's machine to let a signed-in person unlock a Vercel-protected Preview for the
// smoke suite WITHOUT changing any Vercel setting or creating a bypass secret.
//   SMOKE_BASE_URL=https://<preview> SMOKE_STORAGE_STATE=$HOME/.313-smoke-state.json node signin.js
// Opens a visible Chromium window at the Preview. Sign in to Vercel there if asked; once /config.js loads (the page shows
// JavaScript text) the session is saved to SMOKE_STORAGE_STATE and the window closes. The file holds login cookies: keep it
// outside the repo and delete it afterwards. Nothing is sent anywhere by this script.
"use strict";
const { chromium } = require("@playwright/test");

(async () => {
  const base = process.env.SMOKE_BASE_URL, out = process.env.SMOKE_STORAGE_STATE;
  if (!base || !out) { console.error("Set SMOKE_BASE_URL and SMOKE_STORAGE_STATE."); process.exit(2); }
  const browser = await chromium.launch({ headless: false, executablePath: process.env.SMOKE_CHROMIUM || undefined });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const target = new URL("/config.js", base).href;
  await page.goto(target);
  console.log("Sign in to Vercel in the window if prompted. Waiting up to 5 minutes for " + target + " ...");
  const deadline = Date.now() + 5 * 60 * 1000;
  for (;;) {
    const body = await page.evaluate(() => document.body && document.body.innerText || "").catch(() => "");
    if (/__313_CONFIG/.test(body)) break;
    if (Date.now() > deadline) { console.error("Timed out; nothing saved."); await browser.close(); process.exit(1); }
    await page.waitForTimeout(1000);
  }
  await ctx.storageState({ path: out });
  await browser.close();
  console.log("Saved the session to " + out);
})();
