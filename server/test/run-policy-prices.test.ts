// Run-blocking policy (user decisions 2026-10-28), the pure rules:
//  D1 a row with no published price is quoted on its estimate (never "price unavailable"), marked unconfirmed;
//  D3 ask again only when the price went UP (shared/priceChange.ts);
//  D4 when a failed attempt surely cost nothing (routing/run.ts failedAttemptNotCharged);
//  D5 snapping to the nearest allowed value (shared/snap.ts, videoCaps resolveDuration / snapResolution, imageCaps checkImageCaps).
// Run: npx tsx test/run-policy-prices.test.ts (no server, no network).
import assert from 'node:assert/strict';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'runpolicy-')); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const { priceAskAgain } = await import('../src/shared/priceChange.js');
const { nearestNumber, nearestAspect, nearestTier, snapNote } = await import('../src/shared/snap.js');
const { priceOf, estimateRate } = await import('../src/shared/pricing.js');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.js');
await import('../src/tools/videoUpscaleModels.js'); await import('../src/tools/imageUpscaleModels.js'); await import('../src/tools/editVideo/index.js'); // their price rows (no published price)
const VC = await import('../src/tools/h3/videoCaps.js');
const { checkImageCaps } = await import('../src/shared/imageCaps.js');
const { failedAttemptNotCharged } = await import('../src/routing/run.js');

// D3
assert.equal(priceAskAgain({ quotedCredits: 9, credits: 12 }), true, 'dearer asks');
assert.equal(priceAskAgain({ quotedCredits: 9, credits: 9 }), false, 'same runs');
assert.equal(priceAskAgain({ quotedCredits: 9, credits: 4, quotedRoute: 'a', route: 'b' }), false, 'cheaper on another place runs');
assert.equal(priceAskAgain({ quotedCredits: null, credits: 4, quotedRoute: 'a', route: 'b' }), true, 'unknown quote on another place asks');
assert.equal(priceAskAgain({ quotedCredits: null, credits: 4, quotedRoute: 'a', route: 'a' }), false);
ok('D3: ask again only when dearer');

// D5 helpers
assert.equal(nearestNumber([4, 6, 8], 5), 6, 'a tie goes up'); assert.equal(nearestNumber([4, 6, 8], 3), 4); assert.equal(nearestNumber([6, 8, 10], 30), 10);
assert.equal(nearestAspect(['1:1', '16:9', '9:16'], '21:9'), '16:9'); assert.equal(nearestAspect(['1:1', '2:3', '3:2'], '4:5'), '2:3'); assert.equal(nearestAspect(['auto'], '4:5'), null);
assert.equal(nearestTier(['720p', '1080p'], '4K'), '1080p'); assert.equal(nearestTier(['1K', '2K'], '4K'), '2K'); assert.equal(nearestTier(['768p', '480p'], '1080p'), '768p');
assert.equal(snapNote('length', '5 s', '6 s'), 'Made at 6 s, the closest length this model offers (you picked 5 s).');
ok('D5: nearest length / shape / size, one note');

// D5 lengths (quote = submit share resolveDuration)
{ const r = VC.resolveDuration('h3-video', 'router-veo', '5'); assert.ok(r && !('error' in r)); assert.equal(r.seconds, 6); assert.match(r.snapped!.note, /Made at 6 s/);
  const r2 = VC.resolveDuration('h3-video', 'router-veo', '6', '1080p'); assert.ok(r2 && !('error' in r2)); assert.equal(r2.seconds, 8); assert.match(r2.snapped!.note, /at 1080p/);
  const r3 = VC.resolveDuration('h3-video', 'router-veo', '8'); assert.ok(r3 && !('error' in r3)); assert.equal(r3.snapped, undefined, 'an allowed length is untouched');
  const bad = VC.resolveDuration('h3-video', 'router-veo', 'abc'); assert.ok(bad && 'error' in bad, 'not a number is still an error');
  const L = VC.limitsFor('router-kling')!; const sr = VC.snapResolution(L, '4K'); assert.ok(sr && L.resolutions.includes(sr.to), JSON.stringify(sr)); assert.equal(VC.snapResolution(L, L.resolutions[0]), null);
  ok(`D5 video: Veo 5 s → 6 s, 6 s at 1080p → 8 s, Kling 4K → ${sr!.to}`); }

// D5 images
{ const c = checkImageCaps('api-seedream', { aspect: '8:1' }); assert.ok(c.ok, JSON.stringify(c)); assert.notEqual(c.aspect, '8:1'); assert.ok(c.notes?.[0]?.startsWith('Made at'));
  const n = checkImageCaps('api-nano-banana', { quality: 'high' }); assert.ok(n.ok); assert.match(n.notes?.[0] ?? '', /no quality setting/);
  const g = checkImageCaps('api-gpt-image', { quality: 'ultra' as any }); assert.ok(g.ok, JSON.stringify(g)); assert.ok(g.notes?.length);
  ok(`D5 image: Seedream 8:1 → ${c.aspect}; a quality the model lacks is noted, never a 400`); }

// D1 estimate
for (const id of ['router-crystal-video', 'api-crystal-upscale', 'fal:fal-ai/rife/video']) {
  const h = HOSTED_BY_ID[id]; assert.ok(h, id); assert.equal(h.usd, null); assert.ok(estimateRate(h)! > 0, `${id} has an estimate`);
  const pr = priceOf({ provider: id, durationSec: 5, quality: '1080p', megapixels: 2, outMegapixels: 4 } as any); assert.equal(pr.basis, 'hosted', `${id} quotes`); assert.ok(pr.credits > 0); assert.equal(pr.unconfirmed, true);
  assert.match(pr.breakdown[0].label, /estimate: no published price yet/); }
// every non-stub row with no published price has a way to be quoted
for (const h of Object.values(HOSTED_BY_ID)) if (h.usd == null && !/pending\//.test(h.providerId)) assert.ok(estimateRate(h) != null, `${h.providerId}: no published price and no estimate`);
ok('D1: rows with no published price quote on an estimate (unconfirmed), never unavailable');

// D4 never pay twice
{ const job: any = { id: 'j', reasonCode: null };
  const R = (kind: string, routeId: string) => ({ kind, routeId } as any);
  assert.equal(failedAttemptNotCharged(job, R('comfy-router', 'comfy-router:api-nano-banana'), { price: 9, reached: false }), true, 'never reached the provider');
  assert.equal(failedAttemptNotCharged(job, R('comfy-router', 'comfy-router:api-nano-banana'), { price: 9, reached: true }), false, 'Comfy may charge a failed run');
  assert.equal(failedAttemptNotCharged(job, R('replicate', 'replicate:google/nano-banana-2'), { price: 9, reached: true }), true, 'Replicate: failed runs are free');
  assert.equal(failedAttemptNotCharged(job, R('local', 'local:x'), { price: 0, reached: true }), true, 'free attempt');
  assert.equal(failedAttemptNotCharged({ ...job, reasonCode: 'cloud_credits' }, R('comfy-router', 'comfy-router:api-nano-banana'), { price: 9, reached: true }), true, 'refused before running');
  assert.equal(failedAttemptNotCharged({ ...job, chargeNote: 'not_charged' }, R('comfy-router', 'comfy-router:api-nano-banana'), { price: 9, reached: true }), true, 'the runner says not charged');
  ok('D4: only a surely-uncharged failed try may move on'); }
console.log('ALL OK run-policy-prices');
process.exit(0);
