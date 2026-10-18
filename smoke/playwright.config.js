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
  retries: process.env.CI ? 1 : 0, // one retry is logged by the reporter; a test that needs it is reported as flaky
  reporter: [["list"], ["json", { outputFile: process.env.SMOKE_REPORT || "smoke-report.json" }]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL,
    // Only if the Preview has Vercel deployment protection on: the bypass secret comes from an encrypted CI secret,
    // never from source.
    extraHTTPHeaders: process.env.SMOKE_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.SMOKE_BYPASS_SECRET } : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true } },
  ],
});
