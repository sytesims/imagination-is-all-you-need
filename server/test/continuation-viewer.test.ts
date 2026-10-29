/** Extend results continue their input clip, so the viewers show no before / after, only the seam (web/src/shared/continuation.ts).
 *  Run: npx tsx test/continuation-viewer.test.ts */
import assert from 'node:assert/strict';
import { continuesInput, inputSecondsOf, seamOf, seamClock, seamJumpTo } from '../../web/src/shared/continuation.ts';

// LTX-2.5 Extend (live job 9979c0ca's shape): 10.04 s in, 15.04 s out
const ltx = { toolId: 'h3-extend', input: { mode: 'extend', types: ['extend'], sourceSeconds: 10.04, compareUrl: '/files/x-source.mp4', ltxExtend: { plan: { source: { seconds: 10.0417 } } } } };
assert.equal(continuesInput(ltx), true);
assert.equal(inputSecondsOf(ltx), 10.04);
assert.equal(seamOf(ltx, 15.04), 10.04);
assert.equal(seamClock(10.04), '0:10'); assert.equal(seamClock(75.9), '1:15');
assert.equal(seamJumpTo(10.04), 9.04); assert.equal(seamJumpTo(0.4), 0);
// plan only (no probe number): the plan's source length
assert.equal(inputSecondsOf({ toolId: 'h3-extend', input: { ltxExtend: { plan: { source: { seconds: 4 } } } } }), 4);
// very short extend (+2 s): still a seam
assert.equal(seamOf({ toolId: 'h3-extend', input: { sourceSeconds: 6 } }, 8), 6);
// input length unknown: no seam, but still a continuation (no slider)
const unk = { toolId: 'h3-extend', input: { mode: 'extend' } };
assert.equal(continuesInput(unk), true); assert.equal(seamOf(unk, 15), null);
// a result that is only the new part (shorter than the input): no seam
assert.equal(seamOf({ toolId: 'h3-extend', input: { sourceSeconds: 10 } }, 5), null);
// output length unknown yet: no seam
assert.equal(seamOf(ltx, 0), null);
// Cinema extend mode counts too
assert.equal(continuesInput({ toolId: 'cinema', input: { cinemaMode: 'extend', sourceSeconds: 5 } }), true);
// whole-clip edits keep the compare
for (const toolId of ['app-face-swap', 'footage-fx', 'upscale', 'h3-restyle', 'app-relight', 'h3-video']) assert.equal(continuesInput({ toolId, input: { mode: 'swap', compareUrl: '/files/a.mp4' } }), false, toolId);
assert.equal(continuesInput(null), false);
console.log('continuation-viewer: ok');
