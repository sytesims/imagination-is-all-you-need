// One rule for showing an upscale factor (web/src/shared/scaleText.ts): the Info panel chip once read "2x×" for a job stored as "2x".
// Run: npx tsx test/scale-text.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { scaleText } from '../../web/src/shared/scaleText.ts';
import { sizeLine } from '../../web/src/shared/quote.ts';
for (const v of [2, '2', '2x', '2X', 'x2', '×2', '2×', ' 2x ']) assert.equal(scaleText(v), '2×', String(v));
assert.equal(scaleText(4), '4×'); assert.equal(scaleText('1.5x'), '1.5×');
for (const v of [undefined, null, '', 'x']) assert.equal(scaleText(v), '', String(v));
assert.equal(sizeLine({ sourceSize: { width: 10, height: 20 }, outputSize: { width: 20, height: 40 }, scale: '2x' }), '10×20 → 20×40 at 2×');
console.log('ok scaleText');
