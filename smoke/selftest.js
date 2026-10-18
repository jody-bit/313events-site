#!/usr/bin/env node
// smoke/selftest.js — proves the suite has teeth. Runs the specs against the offline mock site three times:
//   good        -> must PASS
//   empty       -> API returns no events: the suite must FAIL (an HTTP-200-but-empty inventory is the exact case it exists for)
//   broken-api  -> API returns 500: the suite must FAIL
// Exit 0 only if all three behave as expected. No network, no secrets, no database.
"use strict";
const { spawn } = require("child_process");
const path = require("path");
const mock = require("./mock-site");

// Async spawn on purpose: the mock site runs in this process, so a blocking spawnSync would starve its event loop.
function run(scenario) {
  return mock.create({ scenario }).then((site) => new Promise((resolve) => {
    const env = { ...process.env, SMOKE_BASE_URL: site.url, SMOKE_MODE: "mock", SMOKE_REPORT: path.join(__dirname, "smoke-report-" + scenario + ".json") };
    const child = spawn(path.join(__dirname, "node_modules/.bin/playwright"), ["test", "--project=desktop", "--reporter=line", "--timeout=25000"], { cwd: __dirname, env });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (status) => site.close().then(() => resolve({ scenario, status, out })));
  }));
}

(async () => {
  const expect = { good: 0, empty: 1, "broken-api": 1 };
  let bad = 0;
  for (const sc of Object.keys(expect)) {
    const r = await run(sc);
    const ok = expect[sc] === 0 ? r.status === 0 : r.status !== 0;
    console.log((ok ? "ok   " : "FAIL ") + "scenario " + sc + " (exit " + r.status + ", expected " + (expect[sc] === 0 ? "pass" : "fail") + ")");
    if (!ok) { bad++; console.log(r.out.split("\n").slice(-25).join("\n")); }
  }
  process.exit(bad ? 1 : 0);
})();
