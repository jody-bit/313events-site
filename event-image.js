/* event-image.js — the one definition of "an event's image".
 *
 * An event's primary image is events.image_url (owner selection survives imports via the OWNER-CORRECTION
 * lock, see api/_lib/event-contract.js). Every surface that shows an event image reads it through here or
 * reads the same column; nothing else is a source for an event's picture. A collection card that points at
 * an event (entry.eventId) shows this image first and keeps its own cover only as the fallback.
 * Pure: no network, works in the browser and in Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EventImage = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // The image of an events / events_public row (snake_case) or a page event object (camelCase). "" when none or unsafe.
  function eventImageUrl(row) {
    var u = row && (row.image_url != null ? row.image_url : row.imageUrl);
    if (typeof u !== "string") return "";
    u = u.trim();
    return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : "";
  }
  function isEventId(id) { return typeof id === "string" && EVENT_ID.test(id); }
  // Collection entries that point at an event.
  function linkedIds(entries) {
    var seen = {}, out = [];
    (entries || []).forEach(function (e) { if (e && isEventId(e.eventId) && !seen[e.eventId]) { seen[e.eventId] = 1; out.push(e.eventId); } });
    return out;
  }
  // Set entry.image.canonical from fetched rows; returns how many entries changed. An event with no usable image leaves the cover alone.
  function apply(entries, rows) {
    var by = {}, n = 0;
    (rows || []).forEach(function (r) { if (r && isEventId(r.id)) by[r.id] = eventImageUrl(r); });
    (entries || []).forEach(function (e) {
      if (!e || !e.image || !isEventId(e.eventId)) return;
      var u = by[e.eventId] || "";
      if (u && e.image.canonical !== u) { e.image.canonical = u; n++; }
    });
    return n;
  }
  // Browser: read the linked events' image_url from the public events_public view (same read the event pages make) and apply it.
  function hydrate(entries, fetchFn, done) {
    var ids = linkedIds(entries), G = typeof globalThis !== "undefined" ? globalThis : root, cfg = G.__313_CONFIG || null;
    function go(c) {
      if (!ids.length || !c || !c.supabaseUrl || !c.supabaseAnonKey) return;
      fetchFn(c.supabaseUrl + "/rest/v1/events_public?select=id,image_url&id=in.(" + ids.join(",") + ")", { headers: { apikey: c.supabaseAnonKey } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) { if (apply(entries, rows) && done) done(); })
        .catch(function () {});
    }
    if (cfg) return go(cfg);
    if (typeof document === "undefined") return;
    var sc = document.createElement("script"); sc.src = "/config.js"; sc.onload = function () { go(G.__313_CONFIG); }; document.head.appendChild(sc);
  }
  // Collection entries that fall back to their own event page (no official website): the event ids whose public row must exist first.
  function pageIds(entries) {
    var seen = {}, out = [];
    (entries || []).forEach(function (e) { if (e && !e.website && isEventId(e.eventPageId) && !seen[e.eventPageId]) { seen[e.eventPageId] = 1; out.push(e.eventPageId); } });
    return out;
  }
  // {id: true} for the requested ids that came back as events_public rows; anything else (wrong shape, extra ids) is ignored.
  function readableSet(ids, rows) {
    var want = {}, out = {};
    (ids || []).forEach(function (i) { want[i] = 1; });
    (rows || []).forEach(function (r) { if (r && isEventId(r.id) && want[r.id]) out[r.id] = true; });
    return out;
  }
  // Browser: one anonymous read of events_public (same config and view the event pages use; no credentials, no new API). Sets
  // col.readableEventIds and calls done once on success. Missing config, a non-OK response, a rejection or bad JSON change nothing.
  function checkPages(col, fetchFn, done) {
    var ids = pageIds(col && col.entries), G = typeof globalThis !== "undefined" ? globalThis : root, cfg = G.__313_CONFIG || null;
    if (!ids.length) return;
    function go(c) {
      if (!c || !c.supabaseUrl || !c.supabaseAnonKey) return;
      var req;
      try { req = fetchFn(c.supabaseUrl + "/rest/v1/events_public?select=id&id=in.(" + ids.join(",") + ")", { headers: { apikey: c.supabaseAnonKey } }); } catch (x) { return; }
      Promise.resolve(req)
        .then(function (r) { return r && r.ok ? r.json() : []; })
        .then(function (rows) { var set = readableSet(ids, Array.isArray(rows) ? rows : []); if (Object.keys(set).length) { col.readableEventIds = set; if (done) done(); } })
        .catch(function () {});
    }
    if (cfg) return go(cfg);
    if (typeof document === "undefined") return;
    var sc = document.createElement("script"); sc.src = "/config.js"; sc.onload = function () { go(G.__313_CONFIG); }; document.head.appendChild(sc);
  }
  return { checkPages: checkPages, pageIds: pageIds, readableSet: readableSet, hydrate: hydrate, eventImageUrl: eventImageUrl, isEventId: isEventId, linkedIds: linkedIds, apply: apply };
});
