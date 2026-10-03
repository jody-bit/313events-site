// test/submit-clothing-optional.test.js — the "Clothing optional /
// nudist-friendly" event attribute on the Submit Event form.
//
// 2026-10-03: a promoter reported that the clothing-optional question felt
// out of place, appearing after submission. Inspection found the checkbox
// was already in the main form; what appeared AFTER submitting was the
// confirmation panel echoing the raw request payload, which showed
// `"clothingOptional": false` to every submitter (and also printed the
// form's anti-spam internals). The fix reworded the field as ordinary
// event metadata with helper text, and made the confirmation list a yes/no
// attribute only when the submitter checked it.
//
// This file pins down what must NOT change — the same single field, the
// same request key, the same stored column, unchecked by default — and
// what the confirmation panel shows now. Same conventions as the other
// tests: api/submit.js is invoked directly with a mocked fetch; submit.html
// has no DOM harness, so its markup is checked structurally and its one
// pure function is extracted verbatim and executed.
//
// Run: node test/submit-clothing-optional.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const html = fs.readFileSync(`${REPO_DIR}/submit.html`, "utf8");

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/submit.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/submit.js`);
}
function makeRes() {
  return {
    _status: null, _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}
const VALID_BASE = {
  title: "Sunday Social", category: "community", startDate: "2026-11-01",
  venue: "Example Club", orgName: "Example Org", contactEmail: "organizer@example.com", elapsedMs: 5000,
};

// Submits through the real api/submit.js and returns the row it wrote.
async function storedRowFor(body) {
  let inserted = null;
  global.fetch = async (url, opts = {}) => {
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (opts.method === "POST" && url.includes("/rest/v1/events")) {
      const parsed = JSON.parse(opts.body);
      inserted = Array.isArray(parsed) ? parsed[0] : parsed;
      return { ok: true, status: 201, json: async () => [{ id: "evt-1" }] };
    }
    throw new Error("unmocked URL: " + url);
  };
  const res = makeRes();
  await freshHandler()({ method: "POST", body, headers: {} }, res);
  assert.strictEqual(res._status, 201, "submission should be accepted");
  assert.ok(inserted, "a row should have been written");
  return inserted;
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.RESEND_API_KEY;

  // --- 1. Stored value: unchanged ---
  {
    const checked = await storedRowFor({ ...VALID_BASE, clothingOptional: true });
    assert.strictEqual(checked.is_clothing_optional, true, "checked -> events.is_clothing_optional = true");
    const unchecked = await storedRowFor({ ...VALID_BASE, clothingOptional: false });
    assert.strictEqual(unchecked.is_clothing_optional, false, "unchecked -> false");
    const absent = await storedRowFor({ ...VALID_BASE });
    assert.strictEqual(absent.is_clothing_optional, false, "not sent at all -> false (never null, never true)");
    assert.strictEqual(checked.status, "pending_review", "still goes through moderation like any other submission");
    const keys = Object.keys(checked).filter((k) => /cloth|nud/i.test(k));
    assert.deepStrictEqual(keys, ["is_clothing_optional"], "exactly one stored field carries this — no second field was introduced");
  }
  console.log("PASS: the form's clothingOptional value is still stored as events.is_clothing_optional (true / false / absent -> false), in one field");

  // --- 2. The field in the form ---
  {
    const formStart = html.indexOf('<form id="eventForm"');
    const formEnd = html.indexOf("</form>", formStart);
    const formHtml = html.slice(formStart, formEnd);
    const inputs = formHtml.match(/<input[^>]*id="clothingOptional"[^>]*>/g) || [];
    assert.strictEqual(inputs.length, 1, "exactly one clothingOptional control in the event form");
    const input = inputs[0];
    assert.ok(/type="checkbox"/.test(input), "it is a checkbox");
    assert.ok(/name="clothingOptional"/.test(input), 'its name is still "clothingOptional"');
    assert.ok(!/\bchecked\b/.test(input), "unchecked by default");
    assert.ok(/aria-describedby="clothingOptionalHint"/.test(input), "its helper text is announced with it");
    assert.ok(/<label for="clothingOptional">Clothing optional \/ nudist-friendly<\/label>/.test(formHtml), "label wording");
    assert.ok(/id="clothingOptionalHint">Check if attendees may participate nude or clothing is optional\.<\/div>/.test(formHtml), "helper text wording");
    const fieldAt = formHtml.indexOf('id="clothingOptional"');
    const submitAt = formHtml.indexOf('<button type="submit"');
    assert.ok(fieldAt !== -1 && submitAt !== -1 && fieldAt < submitAt, "asked in the main form, before the Submit button");
    const legendBefore = formHtml.slice(0, fieldAt).match(/<legend>([^<]*)/g).pop();
    assert.strictEqual(legendBefore, "<legend>Event details", "grouped with the event's own details");
    assert.strictEqual((html.match(/id="clothingOptional"/g) || []).length, 1, "and nowhere else on the page (the feed form and confirmation panel do not ask it)");
    assert.ok(!/nudist event/.test(html), "the old wording is gone");
  }
  console.log('PASS: one unchecked-by-default checkbox, "Clothing optional / nudist-friendly" with helper text, inside Event details and before Submit');

  // --- 3. What is sent: unchanged ---
  assert.ok(/clothingOptional: form\.clothingOptional\.checked,/.test(html), "the request still sends clothingOptional as the checkbox's boolean state");
  console.log("PASS: the request payload still sends `clothingOptional` as a boolean under the same key");

  // --- 4. What the submitter is shown afterwards ---
  {
    const src = [
      html.match(/const CONFIRMATION_ATTRIBUTE_FLAGS = \[[^\]]*\];/),
      html.match(/const CONFIRMATION_HIDDEN_FIELDS = \[[^\]]*\];/),
      html.match(/function buildConfirmationPreview\(payload, catLabel\)\{[\s\S]*?\n\}/),
    ];
    src.forEach((m, i) => assert.ok(m, `could not extract confirmation-preview source #${i} from submit.html`));
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(src.map((m) => m[0]).join("\n") + "\nthis.build = buildConfirmationPreview;", sandbox);
    const payload = {
      title: "Sunday Social", category: "community", description: null, imageUrl: null,
      startDate: "2026-11-01", endDate: null, startTime: null,
      recurring: false, clothingOptional: false,
      venue: "Example Club", address: null, venueTba: false,
      admission: "free", price: null, ticketUrl: null, eventUrl: null,
      orgName: "Example Org", contactEmail: "organizer@example.com",
      companyWebsite: "", elapsedMs: 5000,
    };

    const ordinary = sandbox.build(payload, "Community");
    assert.ok(!("clothingOptional" in ordinary), "an ordinary event's confirmation does not mention clothing-optional at all");
    assert.ok(!("recurring" in ordinary) && !("venueTba" in ordinary), "nor any other yes/no attribute the submitter left unchecked");
    assert.ok(!("companyWebsite" in ordinary) && !("elapsedMs" in ordinary), "the anti-spam honeypot and timing fields are never shown to the submitter");
    assert.strictEqual(ordinary.category, "Community", "category is shown by its label");
    assert.strictEqual(ordinary.status, "pending_review");
    assert.strictEqual(ordinary.title, "Sunday Social");
    assert.strictEqual(ordinary.contactEmail, "organizer@example.com");

    const flagged = sandbox.build({ ...payload, clothingOptional: true, recurring: true }, "Community");
    assert.strictEqual(flagged.clothingOptional, true, "when the submitter checked it, the confirmation says so");
    assert.strictEqual(flagged.recurring, true);
    assert.ok(!("venueTba" in flagged));
    assert.deepStrictEqual(payload.clothingOptional, false, "building the preview does not alter the payload that was sent");

    assert.ok(/const preview = buildConfirmationPreview\(payload, catLabel\);/.test(html), "the confirmation panel uses it");
    const postAt = html.indexOf("body: JSON.stringify(payload)");
    const previewAt = html.indexOf("const preview = buildConfirmationPreview(payload, catLabel);");
    assert.ok(postAt !== -1 && postAt < previewAt, "the full payload is sent first; the trimmed preview is display only");
  }
  console.log("PASS: after submitting, a yes/no attribute is shown only if it was checked, and anti-spam fields are never shown");

  console.log("\nAll clothing-optional submit tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
