// Clip rules before Generate (B9, 2026-10-31): the Canvas card's pre-flight flags a clip the run would refuse, in the server's own words.
// Run: npx tsx test/canvas-clip-limits.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { clipIssue, clipRuleFor, LTX25_EXTEND_ID, EXTEND_TOO_LONG_TEXT } from '../src/shared/clipLimits.ts';
import { LTX25_EXTEND } from '../src/comfy/ltx25Extend.ts';
import { preflightProblems } from '../src/shared/preflight.ts';

assert.equal(LTX25_EXTEND_ID, LTX25_EXTEND);
const small = { width: 640, height: 360, duration: 5 }, ok = { width: 1280, height: 720, duration: 8 };
// Extend (H3) and Upscale: 409,600 px per frame, the same sentence parseCommon refuses with
assert.equal(clipIssue(clipRuleFor('h3-extend'), small)?.message, 'Video too small: needs ≥ 409,600 px per frame (e.g. 854×480). Yours is 640×360.');
assert.equal(clipIssue(clipRuleFor('upscale'), small)?.code, 'too_small');
assert.equal(clipIssue(clipRuleFor('h3-extend'), ok), null);
// too long: Extend takes up to 60 s; Upscale trims instead of refusing
assert.equal(clipIssue(clipRuleFor('h3-extend'), { ...ok, duration: 75 })?.message, EXTEND_TOO_LONG_TEXT);
assert.equal(clipIssue(clipRuleFor('upscale'), { ...ok, duration: 75 }), null);
// too short: Upscale needs 4 s, Extend 1 s
assert.equal(clipIssue(clipRuleFor('upscale'), { ...ok, duration: 2 })?.message, 'Clip is too short — minimum 4 seconds.');
assert.equal(clipIssue(clipRuleFor('h3-extend'), { ...ok, duration: 2 }), null);
// LTX-2.5 Extend: 128 px on the short side, any frame count
assert.equal(clipIssue(clipRuleFor('h3-extend', LTX25_EXTEND), small), null);
assert.match(clipIssue(clipRuleFor('h3-extend', LTX25_EXTEND), { width: 200, height: 100, duration: 3 })!.message, /at least 128 px on its short side/);
// Add sound: any size; tools without a rule and unknown clips never block
assert.equal(clipIssue(clipRuleFor('soundtrack'), small), null);
assert.equal(clipIssue(clipRuleFor('h3-video'), small), null);
assert.equal(clipIssue(clipRuleFor('upscale'), null), null);

// pre-flight: a filled slot with an issue is one problem with "Choose another…" for that slot (the period dropped, like the other lines)
const pf = preflightProblems({ slots: [{ name: 'video', label: 'Clip', required: true, filled: true, issue: EXTEND_TOO_LONG_TEXT }] });
assert.deepEqual(pf.map(p => [p.code, p.message, p.fix.kind, p.fix.label, p.fix.args?.slot]), [['input_problem', 'Extend takes clips up to 60 s', 'choose-photo', 'Choose another…', 'video']]);
// an empty slot still says what to add, with "Choose…"
assert.equal(preflightProblems({ slots: [{ name: 'video', label: 'Clip', required: true, filled: false, issue: 'x' }] })[0].fix.label, 'Choose…');
console.log('canvas clip limits: ok');
