// Playwright config for the Preview/staging browser smoke suite. Targets a deployed URL (SMOKE_BASE_URL); the
// self-test (selftest.js) points the same specs at smoke/mock-site.js to prove they fail when they should.
"use strict";
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0, // a retry turns a flaky failure into a pass; failures are investigated, not rerun (DoD). Revisit after the 10-clean-run stability gate.
  reporter: [["list"], ["json", { outputFile: process.env.SMOKE_REPORT || "smoke-report.json" }]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL,
    // Signed-in Vercel session for a protected Preview (written by signin.js on the operator's machine; never committed).
    storageState: process.env.SMOKE_STORAGE_STATE || undefined,
    // The optional Vercel bypass header is NOT set here: extraHTTPHeaders would send the secret to every third-party host
    // the pages load. tests/helpers.js attaches it to requests for the target origin only.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true } },
  ],
});
