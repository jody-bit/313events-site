"use strict";
// The Control Tower page must RENDER decisions.coverage (PR #438 shipped it as JSON only).
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), path = require("path"), vm = require("vm");
const { buildCoverage } = require("../api/_lib/quality-coverage");
const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
function load() {
  const m = html.match(/function renderQualityCoverage\(cv\) \{[\s\S]*?\n\}\n/);
  assert.ok(m, "renderQualityCoverage exists in admin.html");
  const els = {}; ["towerCoverageSummary", "towerCoverage", "towerCoverageLimits"].forEach((id) => (els[id] = { innerHTML: "" }));
  const ctx = { document: { getElementById: (id) => els[id] || null }, escapeHtml: (x) => String(x).replace(/[&<>"]/g, "_"), towerWhen: () => "t" };
  vm.createContext(ctx); vm.runInContext(m[0] + "\nthis.f=renderQualityCoverage;", ctx);
  return { f: ctx.f, els };
}
test("page has the coverage containers and the call", () => {
  for (const id of ["towerCoverageSummary", "towerCoverage", "towerCoverageLimits"]) assert.ok(html.includes('id="' + id + '"'), id);
  assert.ok(/renderQualityCoverage\(dec\.coverage\)/.test(html));
});
test("renders denominator, every dimension row and limits; pass+fail+review+unchecked = total", () => {
  const { f, els } = load();
  const cv = Object.assign({ state: "ok" }, buildCoverage([{ id: "a", title: "Jazz Night", start_date: "2099-01-01", status: "approved" }], { today: "2098-12-01", nowMs: Date.parse("2098-12-01T12:00:00Z"), findings: [] }));
  f(cv);
  assert.match(els.towerCoverageSummary.innerHTML, /<b>1<\/b> public upcoming/);
  for (const d of Object.keys(cv.dimensions)) assert.ok(els.towerCoverage.innerHTML.includes(d.replace(/_/g, " ")), d);
  assert.match(els.towerCoverage.innerHTML, /Unchecked/);
  assert.match(els.towerCoverageLimits.innerHTML, /NOT BUILT/);
});
test("not_run/error states say so instead of rendering nothing", () => {
  const { f, els } = load();
  f({ state: "error", reason: "boom" }); assert.match(els.towerCoverageSummary.innerHTML, /not computed: boom/);
  f(undefined); assert.match(els.towerCoverageSummary.innerHTML, /not computed/);
});
