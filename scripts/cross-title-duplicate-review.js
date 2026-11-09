"use strict";

// Review candidates only. Different titles must never become an automatic merge.
const words = (s) => String(s || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const normalized = (s) => words(s).join(" ");
function descriptionAgrees(a, b) {
  const aa = new Set(words(a));
  const bb = new Set(words(b));
  const short = aa.size <= bb.size ? aa : bb;
  const long = aa.size <= bb.size ? bb : aa;
  if (short.size < 20) return false;
  let shared = 0;
  for (const w of short) if (long.has(w)) shared++;
  return shared >= 20 && shared / short.size >= 0.85;
}
function crossTitleReviews(rows, { normalizeStartTime, normalizeTitle, distinctMarked }) {
  const buckets = new Map();
  for (const row of rows) {
    if (!row || row.status === "rejected" || !row.title || !row.start_date) continue;
    const address = normalized(row.venue_address_raw);
    const city = normalized(row.venue_city_raw);
    const time = normalizeStartTime(row.time_display);
    // A blank/TBA address or missing real start time is not matching evidence.
    if (!/^\d+\s/.test(address) || !city || !time) continue;
    const key = [row.start_date, address, city, time].join("|");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const reviews = [];
  for (const group of buckets.values()) {
    for (let i=0; i<group.length; i++) for (let j=i+1; j<group.length; j++) {
      const a=group[i], b=group[j];
      if (a.source === b.source || distinctMarked(a,b)) continue;
      if (normalizeTitle(a.title,a.start_date) === normalizeTitle(b.title,b.start_date)) continue;
      if (descriptionAgrees(a.description,b.description))
        reviews.push({a,b,reason:"cross_source_title_variant_same_address_time_description"});
    }
  }
  return reviews;
}
module.exports = { crossTitleReviews, descriptionAgrees };
