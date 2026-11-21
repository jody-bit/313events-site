"use strict";
// Run the real Radar loader and renderer; image errors follow the shipped handler.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const root = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${root}/radar.html`, "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).sort((a, b) => b.length - a.length)[0];
const elements = {};
function element(id) {
  return elements[id] ||= { style: {}, innerHTML: "", textContent: "", addEventListener() {}, querySelectorAll: () => [] };
}
const event = { id: "event-1", title: "An exhibition", start_date: "2099-01-01", category: "visual",
  status: "approved", image_url: "https://example.com/event.jpg", venue_name_raw: "Museum", venue_city_raw: "Detroit" };
const article = (thumbnail, links) => ({ title: "Exhibition coverage", url: "https://publisher.example/story", source: "Hour Detroit",
  thumbnail_url: thumbnail, matched_event_id: "event-1", editorial_article_events: links });
const verified = { event_id: event.id, verification_status: "verified", events: event };
let rows = [article(null, [verified])];
const sandbox = {
  console, URL,
  window: { location: { href: "https://313.events/radar.html" }, __313_CONFIG: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "fixture" } },
  Categories: { list: [], cssVar: () => "", tagHtml: () => "" },
  EventDates: { detroitClock: () => ({ iso: "2026-11-20" }), isUpcoming: () => true, nextDate: e => e.date },
  document: { getElementById: element, createElement: () => ({ _t: "", set textContent(v) { this._t = String(v); },
    get innerHTML() { return this._t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); } }) },
  fetch: async url => {
    assert.ok(url.includes("status,image_url)"), "the actual request includes linked event artwork");
    return { ok: true, json: async () => rows };
  },
};
vm.createContext(sandbox);
vm.runInContext(script.replace(/loadArticles\(\);\s*$/, "this.initialLoad = loadArticles();") + "\nthis.items=()=>ALL_ITEMS;", sandbox);

async function run() {
  await sandbox.initialLoad;
  assert.ok(element("radarGrid").innerHTML.includes('src="https://example.com/event.jpg"'), "a missing article thumbnail uses the verified event image");
  assert.strictEqual(sandbox.items()[0].event.imageUrl, event.image_url);
  rows = [article("https://example.com/article.jpg", [verified])];
  await sandbox.loadArticles();
  let rendered = element("radarGrid").innerHTML;
  assert.ok(rendered.includes('src="https://example.com/article.jpg"'), "article artwork stays first");
  assert.ok(rendered.includes('data-event-image="https://example.com/event.jpg"'));
  const img = { dataset: { eventImage: event.image_url, sourceInitial: "H" }, src: "https://example.com/article.jpg" };
  sandbox.radarImageFailed(img);
  assert.strictEqual(img.src, event.image_url, "a broken article image tries the actual event image");
  assert.strictEqual(img.dataset.eventImage, undefined, "fallback can only be tried once");
  sandbox.radarImageFailed(img);
  assert.ok(img.outerHTML.includes('rc-thumb-fallback">H'), "both images failing retains the final fallback");
  const sameImage = sandbox.radarCardHtml({ source: "Hour", thumbnailUrl: event.image_url,
    event: { id: event.id, date: event.start_date, imageUrl: event.image_url } });
  assert.ok(sameImage.includes('data-event-image=""'), "identical URLs never form a retry loop");
  const unsafe = sandbox.radarCardHtml({ source: "Hour", thumbnailUrl: "javascript:alert(1)",
    event: { id: event.id, date: event.start_date, imageUrl: event.image_url } });
  assert.ok(unsafe.includes('src="https://example.com/event.jpg"') && !unsafe.includes("javascript:"));
  rows = [article(null, [{ ...verified, verification_status: "candidate" }])];
  await sandbox.loadArticles();
  assert.strictEqual(sandbox.items().length, 0, "candidate event links cannot supply an image or public card");
  rows = [article(null, [{ ...verified, events: { ...event, status: "pending_review" } }])];
  await sandbox.loadArticles();
  assert.strictEqual(sandbox.items().length, 0, "nonpublic linked events cannot supply artwork");
  rows = [article(null, [])];
  await sandbox.loadArticles();
  assert.ok(!element("radarGrid").innerHTML.includes(event.image_url), "unmatched coverage never borrows unrelated event art");
  console.log("PASS: Radar uses only verified event art when article art is missing/broken; no unsafe URLs, repeated retries or unverified-image leaks");
}
run().catch(err => { console.error(err); process.exitCode = 1; });
