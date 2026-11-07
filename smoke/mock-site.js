#!/usr/bin/env node
// smoke/mock-site.js — local stand-in for a Vercel Preview + its Supabase project, used ONLY to prove the smoke
// suite fails when it should (self-test) and to run it offline. Serves the repository's static pages with the
// rewrites from vercel.json, a generated /config.js, and a tiny PostgREST-shaped events API from fixtures.
// It never talks to the network and never touches a real database.
//   node smoke/mock-site.js [--port 4173] [--scenario good|empty|broken-api]
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };

function isoDay(offset) { const d = new Date(Date.now() + offset * 86400000); return d.toISOString().slice(0, 10); }

// Synthetic, clearly fake events (title prefix "SMOKE FIXTURE"). Dates are relative to now so the suite never ages out.
function fixtures() {
  const venues = [
    { id: "v-smoke-1", name: "Smoke Fixture Hall", address: "1 Test St", city: "Detroit", zip_code: "48201", lat: 42.3314, lng: -83.0458 },
    { id: "v-smoke-2", name: "Smoke Fixture Barn", address: "2 Test Ave", city: "Ferndale", zip_code: "48220", lat: 42.4606, lng: -83.1346 },
  ];
  const events = [];
  for (let i = 0; i < 12; i++) {
    const v = venues[i % 2];
    events.push({
      id: "smoke-" + (i + 1), title: "SMOKE FIXTURE Event " + (i + 1), description: "Synthetic fixture event " + (i + 1) + " for browser smoke tests.",
      image_url: null, start_date: isoDay(1 + (i % 6)), end_date: isoDay(1 + (i % 6)), venue_name: v.name, venue_name_raw: v.name, venue_city: v.city,
      venue_city_raw: v.city, venue_address_raw: v.address, venue_id: v.id, neighborhood: null, category: i % 3 === 0 ? "music" : i % 3 === 1 ? "arts" : "community",
      time_display: "7:00 PM", is_free: i % 2 === 0, source: "smoke-fixture", ticket_url: null, event_url: null, price_from: null,
      is_clothing_optional: false, ticket_status: null, date_semantics: "single", occurrence_dates: null, status: "approved",
      venues: { name: v.name, address: v.address, city: v.city, zip_code: v.zip_code, lat: v.lat, lng: v.lng },
    });
  }
  return { venues, events };
}

function create(opts) {
  opts = opts || {};
  const scenario = opts.scenario || "good";
  const data = fixtures();
  let port = 0;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const p = u.pathname;
    if (p === "/config.js") {
      res.writeHead(200, { "Content-Type": MIME[".js"] });
      return res.end("window.__313_CONFIG = " + JSON.stringify({ environment: "preview", supabaseUrl: "http://127.0.0.1:" + port + "/mock-supabase", supabaseAnonKey: "mock-anon" }) + ";");
    }
    if (p.startsWith("/mock-supabase/rest/v1/")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Expose-Headers", "Content-Range");
      if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
      if (scenario === "broken-api") { res.writeHead(500, { "Content-Type": "application/json" }); return res.end('{"message":"mock outage"}'); }
      const table = p.split("/").pop();
      let rows = [];
      if (scenario !== "empty") {
        if (table === "events_public" || table === "events") rows = data.events;
        else if (table === "venues") rows = data.venues;
      }
      let id = (u.searchParams.get("id") || "").replace(/^eq\./, "");
      if (id) rows = rows.filter((r) => String(r.id) === id);
      const total = rows.length;
      const range = String(req.headers.range || "");
      const m = /^(\d+)-(\d+)$/.exec(range);
      const offset = Number(u.searchParams.get("offset") || (m ? m[1] : 0));
      const limit = Number(u.searchParams.get("limit") || (m ? Number(m[2]) - Number(m[1]) + 1 : total));
      const page = rows.slice(offset, offset + limit);
      res.writeHead(200, { "Content-Type": "application/json", "Content-Range": (page.length ? offset + "-" + (offset + page.length - 1) : "*") + "/" + total });
      return res.end(JSON.stringify(page));
    }
    // vercel.json rewrites that matter for the pages under test
    let rel = p;
    if (rel === "/") rel = "/index.html";
    else if (rel === "/event.html") rel = "/event-template.html";
    else if (rel === "/venue.html") rel = "/venue-template.html";
    else if (!path.extname(rel)) rel += ".html";
    const file = path.join(root, path.normalize(rel));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(opts.port || 0, "127.0.0.1", () => {
      port = server.address().port;
      resolve({ url: "http://127.0.0.1:" + port, close: () => new Promise((r) => server.close(r)), data });
    });
  });
}

module.exports = { create, fixtures };

if (require.main === module) {
  const args = process.argv.slice(2);
  const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  create({ port: Number(get("--port", 4173)), scenario: get("--scenario", "good") }).then((s) => console.log("mock site at " + s.url));
}
