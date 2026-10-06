#!/usr/bin/env node
// test/run-all.js — runs every test/*.test.js as its own process and reports.
// No dependencies. Exit code is non-zero if any file fails.
//   node test/run-all.js            # all tests
//   node test/run-all.js venue      # only files whose name contains "venue"
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const filter = process.argv[2] || "";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".test.js") && f.includes(filter)).sort();
// Tests must never reach production or the network: strip anything that could.
const env = { ...process.env };
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "CRON_SECRET", "ADMIN_SECRET", "VERCEL_ENV"]) delete env[k];

let failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { cwd: path.join(dir, ".."), env, encoding: "utf8", timeout: 180000 });
  if (r.status === 0) { console.log(`ok    ${f}`); continue; }
  failed.push(f);
  console.log(`FAIL  ${f}`);
  console.log(String(r.stdout || "").split("\n").slice(-8).join("\n"));
  console.log(String(r.stderr || "").split("\n").slice(0, 12).join("\n"));
}
console.log(`\n${files.length - failed.length}/${files.length} test files passed`);
if (failed.length) { console.log("failed: " + failed.join(", ")); process.exit(1); }
