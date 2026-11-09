// promoter-page.js: the pure rules behind the promoter profile page (STORY-027, Phase 3 prep).
// Plain static include like event-dates.js: no DOM, no network, require()-able from Node tests.
// NOTHING here is routed, linked or indexed yet; the public views it reads do not exist until Platform's Phase 1 ships.
//
// The plan (project/plans/STORY-027-promoter-plan.md) names the public views and columns. They are written
// ONCE, in COLUMNS below, so a rename is a one-line change here and nowhere else.
(function () {
  "use strict";

  var COLUMNS = Object.freeze({
    organizer: {
      view: "organizers_public",
      id: "id", slug: "slug", name: "name", type: "type", bio: "bio", description: "description",
      website: "website", instagram: "instagram", heroImage: "hero_image_url", socialLinks: "social_links",
      upcomingCount: "upcoming_count", nextEventDate: "next_event_date"
    },
    contact: {
      view: "organizer_contacts_public",
      organizerId: "organizer_id", kind: "kind", value: "value", verifiedAt: "verified_at", visibility: "visibility"
    },
    media: {
      view: "organizer_media",
      organizerId: "organizer_id", url: "image_url", credit: "credit", alt: "alt_text"
    },
    link: {
      view: "event_organizers_public",
      eventId: "event_id", organizerId: "organizer_id", role: "role"
    }
  });

  var ROLES = Object.freeze({ presenter: "Presenter", co_promoter: "Co-promoter", host: "Host", sponsor: "Sponsor" });

  function str(v) { return typeof v === "string" ? v.trim() : ""; }

  function safeUrl(u) {
    var s = str(u);
    if (!s) return "";
    try { var p = new URL(s); return p.protocol === "https:" || p.protocol === "http:" ? p.href : ""; } catch (e) { return ""; }
  }

  // One public organizer row -> the page's profile object (fields not in the row stay empty, never invented).
  function mapOrganizer(row) {
    var c = COLUMNS.organizer;
    row = row || {};
    var social = row[c.socialLinks];
    var links = [];
    if (Array.isArray(social)) {
      social.forEach(function (s) {
        var url = safeUrl(s && s.url);
        var label = str(s && s.label);
        if (url && label) links.push({ label: label, url: url });
      });
    }
    // The view lists ACTIVE organizers only (status is filtered inside it, not a column), so a returned row is active.
    // Optional website and Instagram (existing organizers columns) join the labelled links; a bare handle is turned into
    // a profile URL only when it is a plain handle, nothing else is guessed.
    var web = safeUrl(row[c.website]);
    if (web) links.push({ label: "Website", url: web });
    var ig = str(row[c.instagram]), igUrl = /^https?:\/\//i.test(ig) ? safeUrl(ig) : (/^@?[A-Za-z0-9._]{1,30}$/.test(ig) ? "https://www.instagram.com/" + ig.replace(/^@/, "") + "/" : "");
    if (igUrl) links.push({ label: "Instagram", url: igUrl });
    return {
      id: row[c.id], slug: str(row[c.slug]), name: str(row[c.name]), type: str(row[c.type]), bio: str(row[c.bio]) || str(row[c.description]),
      status: "active", heroImage: safeUrl(row[c.heroImage]), socialLinks: links,
      upcomingCount: typeof row[c.upcomingCount] === "number" ? row[c.upcomingCount] : null,
      nextEventDate: str(row[c.nextEventDate]) || null
    };
  }

  // Contacts: public AND verified only. Anything else (private, unverified, unknown kind) never renders.
  function publicContacts(rows) {
    var c = COLUMNS.contact, out = [];
    (rows || []).forEach(function (r) {
      if (!r || r[c.visibility] !== "public" || !r[c.verifiedAt]) return;
      var kind = str(r[c.kind]), value = str(r[c.value]);
      if (!value) return;
      if (kind === "email" && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) out.push({ kind: kind, value: value, href: "mailto:" + value });
      else if (kind === "phone" && /^[+\d][\d\s().-]{6,}$/.test(value)) out.push({ kind: kind, value: value, href: "tel:" + value.replace(/[^\d+]/g, "") });
      else if (kind === "website" && safeUrl(value)) out.push({ kind: kind, value: value.replace(/^https?:\/\//, "").replace(/\/$/, ""), href: safeUrl(value) });
    });
    return out;
  }

  // Images render only with BOTH credit and alt text and a usable URL.
  function publicMedia(rows) {
    var c = COLUMNS.media, out = [];
    (rows || []).forEach(function (r) {
      if (!r) return;
      var url = safeUrl(r[c.url]), credit = str(r[c.credit]), alt = str(r[c.alt]);
      if (url && credit && alt) out.push({ url: url, credit: credit, alt: alt });
    });
    return out;
  }

  // Links -> role per event id. A promoter with no link rows simply has no events (nothing is guessed).
  function rolesByEvent(rows, organizerId) {
    var c = COLUMNS.link, out = {};
    (rows || []).forEach(function (r) {
      if (!r || r[c.organizerId] !== organizerId) return;
      var role = ROLES[r[c.role]] ? r[c.role] : null;
      if (role) out[r[c.eventId]] = role;
    });
    return out;
  }

  // Upcoming / Past using the shared date rules (EventDates.isUpcoming). Past is newest-first, upcoming soonest-first.
  function splitEvents(events, todayISO, ED) {
    var upcoming = [], past = [];
    (events || []).forEach(function (e) {
      if (!e || !e.start_date) return;
      (ED.isUpcoming(e, todayISO) ? upcoming : past).push(e);
    });
    function key(e) { return (ED.nextDate && ED.nextDate(e, todayISO)) || e.start_date; }
    upcoming.sort(function (a, b) { return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0; });
    past.sort(function (a, b) { return a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0; });
    return { upcoming: upcoming, past: past };
  }

  // Calendar view: events grouped by month then day, in order.
  function groupByMonth(events) {
    var months = [], idx = {};
    events.forEach(function (e) {
      var m = e.start_date.slice(0, 7);
      if (!(m in idx)) { idx[m] = months.length; months.push({ month: m, days: [] }); }
      var days = months[idx[m]].days, last = days[days.length - 1];
      if (last && last.date === e.start_date) last.events.push(e);
      else days.push({ date: e.start_date, events: [e] });
    });
    return months;
  }

  // "Map" view without tiles: events grouped by venue (the public link view carries no coordinates yet).
  function groupByVenue(events) {
    var order = [], idx = {};
    events.forEach(function (e) {
      var name = str(e.venue_name) || "Venue to be announced";
      if (!(name in idx)) { idx[name] = order.length; order.push({ venue: name, events: [] }); }
      order[idx[name]].events.push(e);
    });
    return order;
  }

  // Indexable only when the profile is active, named, slugged and has at least one linked public event.
  function shouldIndex(profile, linkedEventCount) {
    return !!(profile && profile.status === "active" && profile.name && profile.slug && linkedEventCount > 0);
  }

  function jsonLd(profile, contacts, pageUrl) {
    var ld = { "@context": "https://schema.org", "@type": "Organization", "name": profile.name, "url": pageUrl };
    if (profile.bio) ld.description = profile.bio;
    if (profile.heroImage) ld.image = profile.heroImage;
    var same = profile.socialLinks.map(function (s) { return s.url; });
    contacts.forEach(function (c) { if (c.kind === "website") same.push(c.href); });
    if (same.length) ld.sameAs = same;
    var email = contacts.filter(function (c) { return c.kind === "email"; })[0];
    if (email) ld.email = email.value;
    return ld;
  }

  var api = Object.freeze({
    COLUMNS: COLUMNS, ROLES: ROLES, safeUrl: safeUrl, mapOrganizer: mapOrganizer, publicContacts: publicContacts,
    publicMedia: publicMedia, rolesByEvent: rolesByEvent, splitEvents: splitEvents, groupByMonth: groupByMonth,
    groupByVenue: groupByVenue, shouldIndex: shouldIndex, jsonLd: jsonLd
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (typeof window !== "undefined" ? window : globalThis).PromoterPage = api;
})();
