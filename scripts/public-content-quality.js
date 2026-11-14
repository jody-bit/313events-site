#!/usr/bin/env node
// Offline, report-only checks for an approved-events JSON export. No network or writes.
// node scripts/public-content-quality.js events.json YYYY-MM-DD [previous-report.json]
'use strict';
const { descriptionQuality } = require('../api/_lib/description-quality');
const { DescriptionFormat } = require('../description-format');
const EventDates = require('../event-dates');
const normalize = x => String(x || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const safeLink = x => { try { const u = new URL(x); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
function startMinute(e) {
  if (e.is_all_day) return null;
  const t = String(e.time_display || '').trim();
  const m = /^(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?\b/i.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 12) return (+m[1] % 12 + (m[3].toLowerCase() === 'p' ? 12 : 0)) * 60 + +(m[2] || 0);
  const h = /^(\d{1,2}):([0-5]\d)(?=\s*(?:$|[–—-]|to\b))/i.exec(t);
  return h && +h[1] <= 23 ? +h[1] * 60 + +h[2] : null;
}
function venueMatch(a, b) {
  if (a.venue_id && b.venue_id && a.venue_id === b.venue_id) return 'venue_id';
  const cityA = normalize(a.venue_city || a.venue_city_raw), cityB = normalize(b.venue_city || b.venue_city_raw);
  if (!cityA || cityA !== cityB) return null;
  const addressA = normalize(a.venue_address || a.venue_address_raw), addressB = normalize(b.venue_address || b.venue_address_raw);
  if (addressA && addressA === addressB) return 'same_address_and_city';
  const nameA = normalize(a.venue_name || a.venue_name_raw), nameB = normalize(b.venue_name || b.venue_name_raw);
  return nameA && nameA !== 'venue tba' && nameA === nameB ? 'same_name_and_city' : null;
}
function days(e, today, end) {
  const out = [];
  for (let day = today; day <= end; day = new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0,10)) {
    // Shared calendar semantics: a broad date range is not invented daily occurrences.
    if (EventDates.isActiveOn(e, day)) out.push(day);
  }
  return out;
}
function brief(e) {
  return {id:e.id, title:e.title, start_date:e.start_date, time:e.time_display || null,
    venue:e.venue_name || e.venue_name_raw || null, venue_id:e.venue_id || null,
    source:e.source || null, links:[...new Set([e.event_url,e.ticket_url].map(safeLink).filter(Boolean))]};
}
function report(rows, today, previous) {
  if (!Array.isArray(rows)) throw new Error('Input must be an events array.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '') || !Number.isFinite(Date.parse(today+'T12:00:00Z')) || new Date(today+'T12:00:00Z').toISOString().slice(0,10)!==today) throw new Error('Supply a valid explicit local date YYYY-MM-DD.');
  const end = new Date(Date.parse(today+'T12:00:00Z')+6*86400000).toISOString().slice(0,10);
  // Explicit private statuses are respected; public-view exports have no status column.
  const events = rows.filter(e => e && e.id && (!e.status || e.status==='approved') && (EventDates.bounds(e).end>=today));
  const findings = [], add = (kind, es, extra={}) => findings.push({key:kind+':'+es.map(e=>e.id).sort().join(':'),kind,events:es.map(brief),...extra});
  const dates = new Map(events.map(e=>[e.id,days(e,today,end)]));
  for (const e of events) {
    if (!e.image_url) add('missing_image',[e]);
    else if (/\/assets\/placeholders\//i.test(e.image_url)) add('placeholder_image',[e]);
    const quality = descriptionQuality(e.description,e.title);
    if (!quality.ok) add('description_needs_review',[e],{reason:quality.quality});
    else if (e.description_source==='generated' || DescriptionFormat.isMetadataSummary(e.description,{...e,venue:e.venue_name || e.venue_name_raw})) add('metadata_only_description_candidate',[e]);
    if (!safeLink(e.event_url) && !safeLink(e.ticket_url)) add('no_usable_event_link',[e]);
    if (!e.is_all_day && startMinute(e)===null) add('start_time_unconfirmed',[e]);
    if (EventDates.scheduleState(e)==='unverified') add('occurrences_unconfirmed',[e]);
  }
  for (let i=0;i<events.length;i++) for (let j=i+1;j<events.length;j++) {
    const a=events[i],b=events[j];
    const overlap=dates.get(a.id).filter(day=>dates.get(b.id).includes(day));
    if (!overlap.length) continue;
    const venue=venueMatch(a,b), ta=startMinute(a), tb=startMinute(b);
    if (venue && ta!==null && ta===tb) add('same_venue_same_start_review',[a,b],{venue_match:venue,dates:overlap,decision:'Review; never automatically merge. Distinct rooms/programs may coexist.'});
    else if (venue && (ta===null || tb===null)) add('same_venue_time_unresolved',[a,b],{venue_match:venue,dates:overlap,decision:'Verify source times; unresolved equivalence goes to owner.'});
    const linksA=[a.event_url,a.ticket_url].map(safeLink).filter(Boolean), linksB=[b.event_url,b.ticket_url].map(safeLink).filter(Boolean);
    if (linksA.some(u=>linksB.includes(u)) && ta!==null && ta===tb) add('same_event_link_collision',[a,b],{dates:overlap,decision:'Review source identity, venue and separate showtimes before merge.'});
  }
  const counts={};for(const f of findings) counts[f.kind]=(counts[f.kind]||0)+1;
  const prior=new Set((previous?.findings||[]).map(f=>f.key)), current=new Set(findings.map(f=>f.key));
  const comparable=!!previous && previous.today===today && previous.window_end===end;
  return {schema_version:1,today,window_end:end,mode:'report_only',current_records:events.length,records_active_next7:events.filter(e=>dates.get(e.id).length).length,
    limits:['Same venue/time is a review flag, not proof of duplication.','Checks do not verify source truth, link/image availability, image permission or editorial quality.','Unknown recurring dates are not guessed; assess separately.','No records are changed, hidden, merged or deleted.'],counts,findings,
    delta:comparable?{new:findings.filter(f=>!prior.has(f.key)).map(f=>f.key),not_seen_in_same_scope:[...prior].filter(k=>!current.has(k))}:null};
}
module.exports={report,startMinute,venueMatch};
if(require.main===module){
  const fs=require('fs');const [input,today,prior]=process.argv.slice(2);
  if(!input||!today){console.error('Usage: node scripts/public-content-quality.js events.json YYYY-MM-DD [previous-report.json]');process.exitCode=1;}
  else {try{console.log(JSON.stringify(report(JSON.parse(fs.readFileSync(input,'utf8')),today,prior?JSON.parse(fs.readFileSync(prior,'utf8')):null),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
}
