#!/usr/bin/env node
// smoke/selftest.js — proves the suite has teeth. Runs the specs against the offline mock site three times:
//   good        -> must PASS
//   empty       -> API returns no events: the suite must FAIL (an HTTP-200-but-empty inventory is the exact case it exists for)
//   broken-api  -> API returns 500: the suite must FAIL
// Each runs on the desktop and mobile-375 projects. Exit 0 only if all six behave as expected. No network, no secrets, no database.
"use strict";
const { spawn } = require("child_process");
const path = require("path");
const mock = require("./mock-site");

// Async spawn on purpose: the mock site runs in this process, so a blocking spawnSync would starve its event loop.
function run(scenario, project) {
  return mock.create({ scenario }).then((site) => new Promise((resolve) => {
    const env = { ...process.env, SMOKE_BASE_URL: site.url, SMOKE_MODE: "mock", SMOKE_REPORT: path.join(__dirname, "smoke-report-" + scenario + "-" + project + ".json") };
    const child = spawn(path.join(__dirname, "node_modules/.bin/playwright"), ["test", "--project=" + project, "--reporter=line", "--timeout=25000"], { cwd: __dirname, env });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (status) => site.close().then(() => resolve({ scenario, project, status, out })));
  }));
}

(async () => {
  const expect = { good: 0, empty: 1, "broken-api": 1 };
  let bad = 0;
  // Both viewports: the phone-width project has its own layout path, so it needs its own proof that it can fail.
  for (const project of ["desktop", "mobile-375"]) for (const sc of Object.keys(expect)) {
    const r = await run(sc, project);
    const ok = expect[sc] === 0 ? r.status === 0 : r.status !== 0;
    console.log((ok ? "ok   " : "FAIL ") + "scenario " + sc + " @" + project + " (exit " + r.status + ", expected " + (expect[sc] === 0 ? "pass" : "fail") + ")");
    if (!ok) { bad++; console.log(r.out.split("\n").slice(-25).join("\n")); }
  }
  process.exit(bad ? 1 : 0);
})();
