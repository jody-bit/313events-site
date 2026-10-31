// test/editorial-phone-page.test.js — the phone editor page (/editorial.html): static guards for the Release B journey.
// Behaviour was exercised in a real browser against a stubbed gateway (see the PR). Run: node test/editorial-phone-page.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const h = fs.readFileSync(path.join(__dirname, "..", "editorial.html"), "utf8");

assert.ok(/name="robots" content="noindex, nofollow"/.test(h), "the editor page stays noindex");
assert.ok(/--acc:#D7FF00/.test(h) && /Space\+Mono/.test(h), "uses the Detroit Signal chartreuse and type, not a private palette");
assert.ok(/type="file" accept="image\/jpeg,image\/png,image\/webp,image\/gif"/.test(h), "photo picker stays limited to the formats the gateway accepts");
assert.ok(/publish: *true|a\.publish = true/.test(h) && /id="nPublish"/.test(h), "publishing is an explicit second button");
assert.ok(/nPublish"\)\.hidden = issues\.length > 0/.test(h), "publish is offered only when the dry run found no review issue");
assert.ok(/possible_duplicate/.test(h) && /err\.body|e\.body/.test(h), "duplicates are listed, not just refused");
assert.ok(/role="button" tabindex="0"/.test(h) && /e\.key === "Enter"/.test(h), "result rows work from the keyboard");
assert.ok(/aria-live="polite"/.test(h), "status messages are announced");
assert.ok(/id="linkSec"/.test(h) && /navigator\.share/.test(h), "the event URL is returned with open and share/copy");
assert.ok(/id="againBtn"/.test(h), "one tap to add another event");
assert.ok(!/localStorage\.setItem\([^)]*tok/.test(h), "the editor token itself is never stored");
console.log("PASS: phone editor page guards");
