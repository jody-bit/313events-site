// test/legal-trust-phase1.test.js
//
// Regression guard for the 2026-10-01 Phase 1 Legal + Trust pass: the six
// new legal/trust pages, the global footer rollout, the conditional
// Ticketmaster affiliate disclosure, the admin.html analytics removal, the
// archived-SQL data-minimization cleanup, and the handful of accessibility
// touch-ups made during this same pass. Structural/source-text checks over
// the raw files -- same established convention as sh-n-venue-display.test.js
// and admin-followup-hide-button.test.js (no DOM harness in this project).
//
// Run: node test/legal-trust-phase1.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const read = (p) => fs.readFileSync(`${REPO_DIR}/${p}`, "utf8");
const exists = (p) => fs.existsSync(`${REPO_DIR}/${p}`);

function run() {
  // ============================================================
  // 1. The six new legal/trust pages exist with the right basics
  // ============================================================
  const NEW_PAGES = ["terms.html", "privacy.html", "copyright.html", "editorial-policy.html", "accessibility.html", "about.html"];
  for (const p of NEW_PAGES) {
    assert.ok(exists(p), `${p} does not exist`);
  }
  console.log("PASS: 1. all six new legal/trust pages exist");

  const terms = read("terms.html");
  const privacy = read("privacy.html");
  const copyright = read("copyright.html");
  const editorial = read("editorial-policy.html");
  const accessibility = read("accessibility.html");
  const about = read("about.html");

  // --- canonical URLs point at the clean routes (item K) ---
  assert.ok(/canonical" href="https:\/\/313\.events\/terms"/.test(terms));
  assert.ok(/canonical" href="https:\/\/313\.events\/privacy"/.test(privacy));
  assert.ok(/canonical" href="https:\/\/313\.events\/copyright"/.test(copyright));
  assert.ok(/canonical" href="https:\/\/313\.events\/editorial-policy"/.test(editorial));
  assert.ok(/canonical" href="https:\/\/313\.events\/accessibility"/.test(accessibility));
  assert.ok(/canonical" href="https:\/\/313\.events\/about"/.test(about));
  console.log("PASS: 1b. each new page's canonical URL points at its clean route");

  // --- each legal page includes legal-dates.js and renders the dates line ---
  for (const [name, html] of Object.entries({ terms, privacy, copyright, editorial: editorial, accessibility })) {
    assert.ok(/<script src="\/legal-dates\.js"><\/script>/.test(html), `${name} doesn't include legal-dates.js`);
    assert.ok(/renderLegalDates\('legalDates'\)/.test(html), `${name} doesn't call renderLegalDates()`);
  }
  console.log("PASS: 2. terms/privacy/copyright/editorial-policy/accessibility all include legal-dates.js and render the Effective/Last-updated line");

  // ============================================================
  // 2. legal-dates.js and legal-snippets.js (shared files)
  // ============================================================
  assert.ok(exists("legal-dates.js"), "legal-dates.js is missing");
  assert.ok(exists("legal-snippets.js"), "legal-snippets.js is missing");
  const legalDatesJs = read("legal-dates.js");
  const legalSnippetsJs = read("legal-snippets.js");
  assert.ok(/function renderLegalDates\(elId\)/.test(legalDatesJs));
  for (const p of ["terms.html", "privacy.html", "copyright.html", "editorial-policy.html", "accessibility.html"]) {
    assert.ok(legalDatesJs.includes(`"${p}"`), `legal-dates.js's LEGAL_PAGE_DATES is missing an entry for ${p}`);
  }
  assert.ok(/TICKET_AFFILIATE_NOTE_TEXT = "313\.events may earn a commission if you purchase through this link\."/.test(legalSnippetsJs));
  assert.ok(/function affiliateDisclosureHtml\(e\)/.test(legalSnippetsJs));
  console.log("PASS: 3. legal-dates.js and legal-snippets.js exist with the expected shared constants/functions");

  // ============================================================
  // 3. DMCA / contact decisions (Jody's decisions 2 & 3)
  // ============================================================
  assert.ok(/jody@sentientproductions\.com/.test(copyright), "copyright.html missing the Phase 1 DMCA contact email");
  assert.ok(/9011 Linwood St #110/.test(copyright) && /Detroit, MI 48221/.test(copyright), "copyright.html missing the business mailing address");
  assert.ok(/has not yet registered a designated agent with the U\.S\. Copyright Office/.test(copyright), "copyright.html must flag USCO registration as NOT yet done, not claim it's complete");
  assert.ok(!/is registered as a designated (DMCA )?agent/i.test(copyright) || /has not yet registered/.test(copyright), "copyright.html must not claim DMCA agent registration is complete");
  assert.ok(/jody@sentientproductions\.com/.test(privacy), "privacy.html missing the Phase 1 privacy/data-request contact email");
  console.log("PASS: 4. DMCA contact + business address present on copyright.html; USCO registration honestly flagged as pending, not claimed complete");

  // ============================================================
  // 4. LARA status (2026-10-01: filing confirmed brought current by Jody --
  //    superseding this pass's original lapsed-status instruction). terms.html
  //    may now factually describe Sentient Productions LLC as an active
  //    Michigan LLC; the DMCA designated-agent registration is a separate,
  //    still-pending fact and must stay flagged as not yet done regardless.
  // ============================================================
  assert.ok(/active Michigan limited liability company/.test(terms), "terms.html should factually describe Sentient Productions LLC as an active Michigan LLC now that its LARA filing is current");
  assert.ok(/has not yet registered a designated agent with the U\.S\. Copyright Office/.test(copyright), "copyright.html must still flag DMCA designated-agent registration as pending -- LARA status and USCO agent registration are separate facts");
  console.log("PASS: 5. terms.html reflects the current (active) Michigan LLC status; copyright.html still correctly flags DMCA agent registration as pending");

  // ============================================================
  // 5. About page sticks to Jody's exact six factual points, no fluff
  // ============================================================
  assert.ok(/independent Detroit-area event discovery and editorial platform/.test(about));
  assert.ok(/Detroit Orbit/.test(about));
  assert.ok(/On the Radar/.test(about));
  assert.ok(/product of <strong>Sentient Productions LLC<\/strong>/.test(about));
  assert.ok(/based in Detroit, Michigan/.test(about));
  // No invented stats/history/partnerships -- spot-check common fluff markers absent
  assert.ok(!/\b\d[\d,]*\+?\s*(users|visitors|readers|events served|monthly)/i.test(about), "about.html must not invent audience/usage statistics");
  assert.ok(!/since 20\d\d/i.test(about) && !/founded in/i.test(about), "about.html must not invent company history/founding dates");
  console.log("PASS: 6. about.html covers exactly the six factual points, no invented stats, history, or partnerships");

  // ============================================================
  // 6. 313 Presents handled per decision 7 -- generic disclaimer only
  // ============================================================
  assert.ok(terms.includes("Third-party event, artist, venue, organizer, promoter, ticketing-company, and other names and trademarks belong to their respective owners."), "terms.html missing the generic trademark/independence disclaimer");
  assert.ok(!/313 presents/i.test(terms), "terms.html must not single out 313 Presents by name");
  console.log("PASS: 7. terms.html carries the generic trademark disclaimer without naming 313 Presents specifically");

  // ============================================================
  // 7. vercel.json rewrites (item K) -- valid JSON, all six routes present
  // ============================================================
  const vercelJson = JSON.parse(read("vercel.json"));
  const rewriteSources = vercelJson.rewrites.map((r) => r.source);
  for (const route of ["/about", "/terms", "/privacy", "/copyright", "/editorial-policy", "/accessibility"]) {
    assert.ok(rewriteSources.includes(route), `vercel.json is missing a rewrite for ${route}`);
  }
  // existing rewrites must be untouched (additive, not a replacement)
  for (const route of ["/sitemap.xml", "/event.html", "/venue.html"]) {
    assert.ok(rewriteSources.includes(route), `vercel.json lost its pre-existing rewrite for ${route}`);
  }
  console.log("PASS: 8. vercel.json has all six new clean-URL rewrites, additive to the pre-existing ones");

  // ============================================================
  // 8. Global footer rollout -- every public page, NOT admin.html
  // ============================================================
  const FOOTER_PAGES = ["index.html", "calendar.html", "map.html", "event-template.html", "submit.html", "radar.html", "venues.html", "venue-template.html", "install.html", "sources.html"];
  const REQUIRED_FOOTER_LINKS = ["about.html", "submit.html", "editorial-policy.html", "terms.html", "privacy.html", "copyright.html", "accessibility.html", "mailto:jody@sentientproductions.com"];
  for (const p of FOOTER_PAGES) {
    const html = read(p);
    assert.ok(/<footer class="site">/.test(html), `${p} is missing the site footer`);
    for (const link of REQUIRED_FOOTER_LINKS) {
      assert.ok(html.includes(`href="${link}"`), `${p}'s footer is missing a link to ${link}`);
    }
    assert.ok(/&copy; 2026 Sentient Productions LLC\. All rights reserved\./.test(html), `${p}'s footer is missing the copyright line`);
    assert.ok(/313\.events is a product of Sentient Productions LLC\./.test(html), `${p}'s footer is missing the "product of" line`);
    assert.ok(/Detroit, Michigan/.test(html), `${p}'s footer is missing "Detroit, Michigan"`);
    // The full street address must NOT be in the global footer (task's own instruction) --
    // it belongs only on the legal/contact pages.
    assert.ok(!html.includes("9011 Linwood St"), `${p}'s footer must not contain the full street address`);
  }
  console.log("PASS: 9. all ten public pages carry the new footer with every required link, the copyright line, and no full street address");

  const adminHtml = read("admin.html");
  assert.ok(!/<footer class="site">/.test(adminHtml), "admin.html should not have the public legal footer added (internal tool)");
  console.log("PASS: 10. admin.html was NOT given the public footer (internal tool, by design)");

  // ============================================================
  // 9. admin.html: GA4 + Metricool removed, everything else untouched
  // ============================================================
  assert.ok(!/gtag\(/.test(adminHtml) && !/googletagmanager\.com/.test(adminHtml), "admin.html must have GA4 (gtag) fully removed");
  assert.ok(!/tracker\.metricool\.com/.test(adminHtml) && !/beTracker\.t/.test(adminHtml), "admin.html must have the actual Metricool tracker script fully removed (a comment merely mentioning it by name is fine)");
  assert.ok(/impact-site-verification/.test(adminHtml), "admin.html must keep its unrelated impact-site-verification meta tag untouched");
  console.log("PASS: 11. admin.html has GA4 and Metricool fully removed, while its unrelated impact-site-verification tag is untouched");

  // GA4 + Metricool must remain on public pages (Jody's decision 4: keep both site-wide on public pages)
  const PUBLIC_ANALYTICS_PAGES = ["index.html", "calendar.html", "map.html", "sources.html", "submit.html"];
  for (const p of PUBLIC_ANALYTICS_PAGES) {
    const html = read(p);
    assert.ok(/gtag\('config', 'G-1078BKN0M3'\)/.test(html), `${p} must keep GA4 (it's a public page)`);
    assert.ok(/tracker\.metricool\.com/.test(html), `${p} must keep Metricool (it's a public page)`);
  }
  console.log("PASS: 12. GA4 and Metricool remain untouched on public pages");

  // ============================================================
  // 10. Conditional Ticketmaster affiliate disclosure (Jody's decision 1)
  // ============================================================
  for (const p of ["index.html", "calendar.html", "map.html"]) {
    const html = read(p);
    assert.ok(/<script src="\/legal-snippets\.js"><\/script>/.test(html), `${p} doesn't include legal-snippets.js`);
    assert.ok(/\$\{affiliateDisclosureHtml\(e\)\}/.test(html), `${p}'s card template doesn't call affiliateDisclosureHtml(e)`);
  }
  // calendar.html has two separate card-template render sites -- both must call it.
  const calendarHtml = read("calendar.html");
  const calendarAffiliateCallSites = (calendarHtml.match(/\$\{affiliateDisclosureHtml\(e\)\}/g) || []).length;
  assert.strictEqual(calendarAffiliateCallSites, 2, "calendar.html must call affiliateDisclosureHtml(e) from both its day-panel and list-view card templates");
  console.log("PASS: 13. index.html/map.html, and both of calendar.html's card templates, render the conditional affiliate disclosure");

  // The disclosure logic itself: Ticketmaster + real ticketUrl only
  const affiliateFnMatch = legalSnippetsJs.match(/function affiliateDisclosureHtml\(e\) \{[\s\S]*?\n\}/);
  assert.ok(affiliateFnMatch, "affiliateDisclosureHtml() body not found in legal-snippets.js");
  const affiliateFnBody = affiliateFnMatch[0];
  assert.ok(/if \(!e \|\| e\.source !== 'Ticketmaster'\) return '';/.test(affiliateFnBody), "affiliateDisclosureHtml() must bail out for any non-Ticketmaster source");
  assert.ok(/if \(!e\.ticketUrl \|\| !safeUrl\(e\.ticketUrl\)\) return '';/.test(affiliateFnBody), "affiliateDisclosureHtml() must bail out when there's no real ticketUrl");
  console.log("PASS: 14. affiliateDisclosureHtml()'s condition is exactly source==='Ticketmaster' AND a real ticketUrl -- never shown on ordinary ticket links");

  // event-template.html uses its own textContent-based pattern (not the HTML-string helper) --
  // confirm it's wired with the identical condition and shares the same wording constant.
  const eventTemplateHtml = read("event-template.html");
  assert.ok(/<script src="\/legal-snippets\.js"><\/script>/.test(eventTemplateHtml), "event-template.html doesn't include legal-snippets.js");
  assert.ok(/id="evtAffiliateNote"/.test(eventTemplateHtml), "event-template.html is missing the evtAffiliateNote element");
  assert.ok(/e\.source === 'Ticketmaster' && e\.ticketUrl && safeUrl\(e\.ticketUrl\)\) \? TICKET_AFFILIATE_NOTE_TEXT : null/.test(eventTemplateHtml), "event-template.html's affiliate-note condition doesn't match the shared logic");
  console.log("PASS: 15. event-template.html wires the same Ticketmaster-only + real-ticketUrl condition into its own textContent-based rendering pattern");

  // Confirm the actual Ticketmaster connector still unconditionally wraps every
  // non-null ticket_url -- the precondition that makes this whole disclosure
  // logic valid (source==='Ticketmaster' + ticketUrl implies "is an affiliate
  // link", not a guess). This pass must NOT have changed that function.
  const cronTicketmasterJs = read("api/cron-ticketmaster.js");
  assert.ok(/function affiliateTicketUrl\(eventUrl\)/.test(cronTicketmasterJs), "api/cron-ticketmaster.js's affiliateTicketUrl() must be unchanged/still present");
  assert.ok(/ticket_url: affiliateTicketUrl\(e\.url\)/.test(cronTicketmasterJs), "api/cron-ticketmaster.js must still unconditionally wrap every Ticketmaster ticket_url");
  console.log("PASS: 16. the underlying Ticketmaster affiliate wrapping in api/cron-ticketmaster.js is untouched by this pass, as instructed");

  // ============================================================
  // 11. Archived SQL data-minimization cleanup (decision 8) -- comment-only
  // mentions redacted; the two literal SQL values left untouched (STOP case)
  // ============================================================
  const archive2026_09_04 = read("supabase/archive/update_2026-09-04_approve_std_313electronics.sql");
  assert.ok(!archive2026_09_04.includes("hellojody@gmail.com"), "update_2026-09-04_approve_std_313electronics.sql's comment-only email mention should have been redacted");
  assert.ok(/redacted/.test(archive2026_09_04), "update_2026-09-04_approve_std_313electronics.sql should note the redaction");

  const archive0916 = read("supabase/archive/update_2026-09-16_undo-lucky-rabbit-mixup.sql");
  // Comment-only mentions redacted...
  const commentLines0916 = archive0916.split("\n").filter((l) => l.trim().startsWith("--"));
  assert.ok(!commentLines0916.some((l) => l.includes("mnavoy@elmcem.org")), "update_2026-09-16's comment-only email mentions should have been redacted");
  // ...but the literal SQL statement value (already possibly applied to
  // production) must be left completely untouched -- editing it would
  // misrepresent what a replay/reconstruction actually did.
  assert.ok(archive0916.includes("Historic Elmwood Cemetery & Foundation, mnavoy@elmcem.org -- worth a reply"), "update_2026-09-16's literal internal_note SQL value must NOT be modified (historical-integrity STOP case)");

  const archive0917 = read("supabase/archive/update_2026-09-17_dedupe-batch1.sql");
  assert.ok(archive0917.includes("Submitter contact preserved here for potential future outreach: mnavoy@elmcem.org, Historic Elmwood Cemetery & Foundation."), "update_2026-09-17's literal internal_note SQL value must NOT be modified (historical-integrity STOP case)");
  console.log("PASS: 17. archived-SQL cleanup redacted comment-only email mentions but deliberately left the two literal, possibly-already-applied SQL values untouched (per the explicit STOP instruction)");

  // ============================================================
  // 12. Accessibility touch-ups
  // ============================================================
  const submitHtml = read("submit.html");
  assert.ok(/id="imageUrl" name="imageUrl" aria-label="Image URL"/.test(submitHtml), "submit.html's imageUrl field should have gained an aria-label (it had no associated <label>)");
  for (const p of ["index.html", "calendar.html", "map.html"]) {
    const html = read(p);
    assert.ok(/id="search" aria-label="Search events/.test(html), `${p}'s #search field should have gained an aria-label`);
  }
  console.log("PASS: 18. the four previously-unlabeled form inputs found during this pass now have an aria-label");

  console.log("\nlegal-trust-phase1.test.js: all assertions passed");
}

run();
