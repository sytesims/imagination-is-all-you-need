// Swap Recreate keeps the who-click (2026-11-06): jobs store the click as {x, y, t}; the recreate form sends it back as the "x,y[,t]" the swap
// tools take (the bar's onRecreate reads that), so a Recreate no longer falls back to "The main person". Run: npx tsx test/swap-recreate-point.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'swaprec-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const { formFromInput, pointField } = await import('../src/routesPrefill.ts');
const { getTool } = await import('../src/tools/registry.ts');
const job = (toolId: string, input: any) => ({ id: 'j1', toolId, provider: 'comfy-h3-charswap', input, status: 'done', outputs: [] } as any);
const form = (toolId: string, input: any) => formFromInput(getTool(toolId)!, job(toolId, input), { sameSeed: false }).form;

// Object / Person Swap: a click (landscape and portrait clips: the point is a fraction of the frame, so it needs no change)
assert.equal(form('object-swap', { swapType: 'person', point: { x: 0.3, y: 0.6, t: 0.5 } }).point, '0.3,0.6,0.5', 'landscape click');
assert.equal(form('object-swap', { swapType: 'person', point: { x: 0.4, y: 0.3, t: 0.5 }, width: 720, height: 1280 }).point, '0.4,0.3,0.5', 'portrait click');
assert.equal(form('object-swap', { swapType: 'person', point: { x: 0.123456, y: 0.98765, t: 1.234 } }).point, '0.1235,0.9877,1.23', 'rounded as the bar sends it');
assert.equal(form('object-swap', { swapType: 'person', point: { x: 0.5, y: 0.5 } }).point, '0.5,0.5,0', 'no time → 0');
assert.match(form('object-swap', { swapType: 'person', point: { x: 0.3, y: 0.6, t: 0.5 } }).point, /^([\d.]+),([\d.]+),([\d.]+)$/, 'the bar (ObjectSwapExtra onRecreate) parses it');
// without a stored click: no point field (the side or words come back instead)
const side = form('object-swap', { swapType: 'person', target: 'person on the left' }); assert.equal(side.point, undefined); assert.equal(side.target, 'person on the left');
assert.equal(form('object-swap', { swapType: 'person', point: null }).point, undefined, 'null point');
assert.equal(pointField({ x: 'a', y: 1 }, true), null); assert.equal(pointField('0.2,0.3,1', true), '0.2,0.3,1'); assert.equal(pointField('{"x":1}', true), null);
console.log('ok object-swap: the who-click comes back as x,y,t; none when the job had none');

// Swap Two People keeps both clicks and words in input.cast: they come back as pointA / pointB ("x,y") and whoA / whoB
const { twoPersonSwapTool: two } = await import('../src/tools/twoPersonSwap.ts');
{
  const f = formFromInput(two, job(two.id, { cast: [{ point: { x: 0.25, y: 0.5 }, who: 'the woman' }, { point: null, who: '' }] }), { sameSeed: false }).form;
  assert.equal(f.pointA, '0.25,0.5'); assert.equal(f.pointB, undefined); assert.equal(f.whoA, 'the woman'); assert.equal(f.whoB, undefined);
  console.log('ok two-person swap: cast clicks and words come back');
}
