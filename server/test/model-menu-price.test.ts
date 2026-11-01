// Model menu price + reason words (web/src/shared/menuPrice.ts; prices in dollars, 2026-10-26): the row shows dollars over the place
// ("$0.88" over "Comfy"), the place's own units only in the hover ("184 Comfy credits · on your Creator plan · price checked …"), the
// footer balance in dollars ("$8.50 left on Comfy") with Comfy's credits on hover, and the short reason a row shows when it can't run as set.
// Run: npx tsx test/model-menu-price.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { splitToken, balanceOf, blockOf, reasonShort } from '../../web/src/shared/menuPrice.ts';
import { priceToken, priceDetail, type Account } from '../../web/src/shared/billing.ts';
const ok = (m: string) => console.log('ok ' + m);

// 1. The row's two lines: dollars over the place, never a provider unit.
assert.deepEqual(splitToken('≈ $0.88', 'Comfy'), { usd: '$0.88', sub: 'Comfy' });
assert.deepEqual(splitToken('≈ $0.42', 'fal'), { usd: '$0.42', sub: 'fal' });
assert.deepEqual(splitToken('≈ $1.20 · 1,264 Comfy cr', 'Comfy'), { usd: '$1.20', sub: 'Comfy' }, 'an old token loses its units');
ok('row price: "$0.88" over "Comfy"; "$0.42" over "fal"');

// 2. Seedance 2.0 at 4 s 720p is 45.9067 Comfy cr/s = 183.6 → 184 Comfy credits ($0.872); the $ rounds UP to the cent. The token is dollars
//    only; the hover names the quote's own units (184, not re-derived from $0.88 = 186), the plan and the price date.
const seedance = { credits: 88, runOn: 'comfy-cloud', cost: { billedTo: 'comfy', billedToName: 'Comfy', estUsd: 0.88, estUnits: 184, unitLabel: 'Comfy credits', estimated: true, checkedAt: '2026-10-24', plan: 'creator' } };
assert.equal(priceToken({ q: seedance, own: true, credits: 88 }), '≈ $0.88');
assert.equal(priceDetail(seedance), '184 Comfy credits · on your Creator plan · price checked 2026-10-24');
assert.equal(priceDetail({ ...seedance, cost: { ...seedance.cost, plan: null } }), '184 Comfy credits · price checked 2026-10-24', 'no plan known: none said');
assert.equal(priceDetail(null, { credits: 88, runOn: 'comfy-cloud' }), '186 Comfy credits', 'list-price fallback: rounded up from the dollars');
assert.equal(priceDetail(null, { credits: 42, runOn: 'fal' }), null, 'fal bills in dollars: no detail units');
assert.equal(priceDetail({ cost: { billedTo: 'local' } }), null);
ok('"≈ $0.88" on the row; "184 Comfy credits · on your Creator plan · price checked …" on hover');

// 3. Footer balance: dollars and the place ("$8.50 left on Comfy"); the account's own Comfy credits (1,793) only in the hover.
const acct = (o: Partial<Account>): Account => ({ provider: 'comfy', name: 'Comfy', connected: true, fetchedAt: null, source: 'provider', note: '', billingUrl: null, failureRule: 'may-charge', failureNote: '', actualCost: '', ...o } as Account);
const b = balanceOf([acct({ balance: 1793, balanceUnit: 'Comfy credits', balanceUsd: 8.5 })], 'comfy-cloud', 'pro')!;
assert.equal(b.text, '$8.50 left on Comfy'); assert.equal(b.usd, 8.5); assert.match(b.title, /1,793 Comfy credits · on your Pro plan/);
assert.equal(balanceOf([acct({ provider: 'fal', name: 'fal', balance: 12.4, balanceUnit: 'USD', balanceUsd: 12.4 })], 'fal')!.text, '$12.40 left on fal');
const mk = balanceOf([acct({ source: 'unavailable', connected: false, balanceUsd: null, mock: { sample: true, balance: 4452, balanceUnit: 'Comfy credits', balanceUsd: 21.1, note: 'Sample' } })], 'comfy-cloud')!;
assert.equal(mk.text, '$21.10 left on Comfy'); assert.equal(mk.sample, true); assert.match(mk.title, /4,452 Comfy credits/);
assert.equal(balanceOf([acct({})], 'local'), null);
for (const x of [b, mk]) assert.ok(!/credit/i.test(x.text), 'never credits in the shown text');
ok('footer: "$8.50 left on Comfy" (credits and plan on hover); fal in dollars; local none');

// 4. Reasons: short in the row, full on hover; a key or a sample is not a block.
const q = (blockedReason: string, extra: any = {}) => ({ runnable: false, needsKey: false, blockedReason, ...extra });
const cases: [string, string][] = [
  ['Comfy Router can\'t run this job. Seedance 2.0 needs the first frame for this job.', 'Needs a start image'], // shared/settingsFit.ts needOf (2026-10-27)
  ['Comfy Cloud can\'t run this job. This route only does image to video or first and last frame.', 'Needs a start image'],
  ['Comfy Cloud can\'t run this job. This route only does text to video or image to video.', 'Text or photo only'],
  ['Comfy Cloud can\'t run this job. Price not measured yet: Comfy Cloud bills GPU time (0.266 Comfy credits per GPU-second).', 'Price not set yet'],
  ['Veo 3.1 runs up to 8 s.', 'Max 8 s'],
  ['Kling takes at most 4 reference images.', 'Max 4 refs'],
  ['This route doesn\'t do 1080p.', 'No 1080p'],
  ['Wan needs the end frame.', 'Needs an end frame'],
  ['Comfy Cloud can\'t run this job. Kling 4.0 edits at 720p or 1080p.', 'Only 720p / 1080p'], // comfy/kling4Cloud.ts k4EditIssue
  ['Runs at 480p, 720p or 1080p.', 'Only 480p to 1080p'],
  ['SeedVR2 needs a graphics card on your computer. Try Real-ESRGAN x2, or SeedVR2 in the cloud', 'Needs a graphics card'], // videoUpscaleModels.ts
  ['Needs a graphics card', 'Needs a graphics card'], // the local row's own status words
  ['Comfy Cloud can\'t run this job. This route only does new images from a prompt.', 'Text only'], // Relight: FLUX.2 flex / klein 9B
  ['Something we have no words for.', 'Not for these settings'],
];
for (const [full, short] of cases) assert.equal(reasonShort(full), short, full);
for (const [, short] of cases) assert.ok(short.length <= 22, `short enough for the row: ${short}`);
assert.deepEqual(blockOf(q('Comfy Cloud can\'t run this job. This route only does text to video or image to video.', { reason: 'x Pick another place.' })), { short: 'Text or photo only', full: 'Comfy Cloud can\'t run this job. This route only does text to video or image to video.', need: null });
assert.deepEqual(blockOf({ runnable: false, reason: 'Comfy Cloud can\'t run this job. Price not measured yet. Pick another place.' }), { short: 'Price not set yet', full: 'Comfy Cloud can\'t run this job. Price not measured yet.', need: null }, 'reason without blockedReason (MiniMax H3), tail trimmed');
{ const b = blockOf({ runnable: false, blockedReason: 'Comfy Cloud can\'t run this job. This route only does image to video or first and last frame.' })!; assert.equal(b.short, 'Needs a start image'); assert.equal(b.need?.action, 'add-image');
  assert.equal(blockOf({ runnable: false, reason: 'x', need: { code: 'video', short: 'Needs a video', full: 'x', action: 'add-video' } })!.short, 'Needs a video', 'the batch row\'s own need wins'); }
assert.equal(blockOf({ runnable: false, needsKey: true, reason: 'needs a key' }), null, 'a key has its own words');
assert.equal(blockOf({ runnable: true, credits: 8 }), null);
assert.equal(blockOf({ pending: true }), null);
assert.equal(blockOf({ runnable: false, demo: true }), null);
ok('reasons: "Needs a start image" (+ Add image), "Text or photo only", "Price not set yet", "Max 8 s", "No 1080p"; keys, samples and loading are not blocks');
