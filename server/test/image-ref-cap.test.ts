// Create Image: each model's real picture limit (web/src/shared/refCaps.ts maxRefsOf, 2026-10-31). It capped every model at 10, so GPT
// Image 2 (16) and Nano Banana Pro / 2.1 (14) lost pictures they take. The route's cap wins, else the model's.
// Run: npx tsx test/image-ref-cap.test.ts
import assert from 'node:assert/strict';
import { maxRefsOf } from '../../web/src/shared/refCaps.js';
assert.equal(maxRefsOf({ maxRefs: 1 }, { maxRefs: 16 }), 16, 'GPT Image 2 on the Router: 16');
assert.equal(maxRefsOf({ maxRefs: 1 }, { maxRefs: 14 }), 14, 'Nano Banana 2.1: 14');
assert.equal(maxRefsOf({ maxRefs: 14 }, { maxRefs: 4 }), 4, 'the route’s cap wins (Nano Banana 2 on the Router: 4)');
assert.equal(maxRefsOf({ maxRefs: 3 }, {}), 3, 'no route cap: the model’s');
assert.equal(maxRefsOf({}, { maxRefs: 0 }), 0, 'prompt only');
console.log('ok image picture limits per model');
