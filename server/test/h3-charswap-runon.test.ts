// Run on + who to swap for H3 Character Swap (2026-11-03), in-process, no network, fake key only:
//  - Comfy Cloud set up, no who yet: the pre-selected place stays Comfy Cloud and the answer is the who reason (input_blocked), never
//    "add a key" / nothing ready (the Run on menu then never falls to Your computer); with a click or a side it runs on Comfy Cloud
//  - no key anywhere: still "nothing ready" (no_provider), as before
//  - a model whose local place is ready keeps it (Use local on, no Cloud key)
//  - a failed first frame comes off the job's price (cost, route price, ledger), the warning says so; the provider's reported cost is untouched
// Run: npx tsx test/h3-charswap-runon.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3runon-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'),
  OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1' });
for (const k of ['COMFY_API_KEY', 'OPENHIGGSFIELD_COMFY_API_KEY', 'OPENHIGGSFIELD_MOCK_KEYS', 'COMFY_ROUTER_URL', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const { resolveRoute } = await import('../src/routing/select.ts');
const { routeQuoteInput } = await import('../src/routing/http.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { savePrefs, getPrefs } = await import('../src/routing/prefs.ts');
const A = await import('../src/comfy/h3CharSwapAnchor.ts');
const L = await import('../src/ledger.ts');
const tool = getTool('object-swap')!; const H3 = 'comfy-h3-charswap'; const CLOUD = 'comfy-cloud:cloud-h3-charswap';
const q = (extra: Record<string, string> = {}) => routeQuoteInput(tool, { seconds: '6', resolution: '480p', swapType: 'person', ...extra });
const plan = (extra: Record<string, string> = {}) => resolveRoute(tool, H3, q(extra), 1, { route: 'auto' }) as any;
const useLocal = (on: boolean) => { const p = getPrefs(); savePrefs({ ...p, global: { ...p.global, useLocal: on } }); };

// ---- Comfy Cloud set up, Your computer off (H3 can't run here)
process.env.COMFY_API_KEY = 'fake-runon-key'; useLocal(false);
{
  for (const extra of [{ target: '' }, { target: 'the main person' }]) {
    const p = plan(extra); assert.ok('error' in p, JSON.stringify(p).slice(0, 300));
    assert.equal(p.code, 'input_blocked', `no who: the who reason, not ${p.errorType}`); assert.equal(p.routeId, CLOUD, 'the place stays Comfy Cloud');
    assert.notEqual(p.errorType, 'no_provider'); assert.match(p.error, /click the person to swap, or pick left\/right/); assert.ok(!/key/i.test(p.error), p.error);
  }
  for (const extra of [{ target: 'the man on the left' }, { point: '0.6,0.4' }]) { const p = plan(extra); assert.ok(!('error' in p), JSON.stringify(p).slice(0, 300)); assert.equal(p.first.routeId, CLOUD); assert.equal(p.routing.runOn, 'comfy-cloud'); }
  const lst = resolveRoute(tool, H3, routeQuoteInput(tool, { seconds: '6', resolution: '480p' }), 1, { route: 'auto' }) as any; assert.equal(lst.first?.routeId, CLOUD, 'the listing (no who fields yet) pre-selects Comfy Cloud');
  ok('Cloud ready, no who: Comfy Cloud stays the place and the reason is who to swap (no key, no "nothing ready"); click or side → runs on Comfy Cloud');
}
// ---- the bar's reasons (shared preflight) from that quote: the who step first, its fix opens the Who to swap box; never price / key
{
  const { preflightProblems } = await import('../src/shared/preflight.ts');
  const quote = { runOn: 'comfy-cloud', route: CLOUD, runnable: false, needsKey: false, credits: 21, priceAvailable: true, valid: false, error: null, setupOptions: [], setup: null,
    blockedCode: 'input_blocked', blockedReason: "Comfy Cloud can't run this job. H3 Character Swap: click the person to swap, or pick left/right." };
  const withPick = preflightProblems({ quote, modelName: 'H3 Character Swap', pick: { group: 'replace', missing: 'Click the person to swap, or pick left/right' } });
  assert.deepEqual(withPick.map((x) => x.code), ['pick_missing']); assert.deepEqual(withPick[0].fix, { kind: 'open-group', label: 'Pick', args: { group: 'replace' } });
  const bare = preflightProblems({ quote, modelName: 'H3 Character Swap' }); assert.deepEqual(bare.map((x) => x.code), ['model_cant_run']); assert.match(bare[0].message, /^H3 Character Swap: click the person/);
  assert.ok(![...withPick, ...bare].some((x) => /price|key/i.test(x.message)));
  ok('bar reasons: who to swap straight away (fix opens the Who box), no "No verified price" / "Needs a key"');
}
// ---- Your computer on too: both places need the who; Comfy Cloud still named first
useLocal(true);
{ const p = plan({ target: '' }); assert.equal(p.code, 'input_blocked'); assert.equal(p.routeId, CLOUD); ok('Use local on as well: still Comfy Cloud + the who reason'); }
// ---- nothing set up: no key, Your computer off → nothing ready, as before
delete process.env.COMFY_API_KEY; useLocal(false);
{ const p = plan({ target: '' }); assert.equal(p.errorType, 'no_provider', JSON.stringify(p).slice(0, 200)); assert.equal(p.routeId, undefined); ok('neither place ready: no_provider (setup card), unchanged'); }
// ---- a ready local place keeps local (no Cloud key, Use local on)
useLocal(true);
{ const p = plan({ target: 'the man on the left' }); assert.ok(!('error' in p), JSON.stringify(p).slice(0, 300)); assert.equal(p.first.kind, 'local', 'local stays the place when it is the ready one');
  const pc = (process.env.COMFY_API_KEY = 'fake-runon-key', plan({ target: 'the man on the left' })); assert.equal(pc.first.routeId, CLOUD, 'with Cloud set up too: Comfy Cloud first (Comfy → Local, unchanged)'); delete process.env.COMFY_API_KEY;
  ok('a ready Your computer keeps the job (no Cloud key); with both ready the usual order (Comfy Cloud first) stands'); }
useLocal(false);

// ---- a failed first frame is not charged
{
  const credits = A.charswapAnchorCredits({ target: 'the man on the left' }); assert.ok(credits > 0);
  const id = 'anchorfail1'; L.charge(id, 'object-swap', CLOUD, 21);
  const job: any = { id, input: { videoPath: '/missing/clip.mp4', refPaths: ['/missing/c.png'], target: 'the man on the left', mode: 'object_swap' }, cost: 21, route: CLOUD, routing: { prices: { [CLOUD]: 21 } }, routeAttempts: [{ n: 1 }],
    actualCost: { usd: 0.2, source: 'provider' } };
  await A.prepareCharswapAnchor(job, { key: 'fake', fetch: (async () => { throw new Error('down'); }) as any, sleep: async () => {} });
  assert.ok(job.input.charswapAnchorError); assert.equal(job.cost, 21 - credits, 'job price without the first frame'); assert.equal(job.routing.prices[CLOUD], 21 - credits);
  assert.match(job.warnings[0], new RegExp(`so the swap ran without it; its \\$${(credits / 100).toFixed(2).replace('.', '\\.')} is taken off this job's price\\.$`));
  assert.deepEqual(job.actualCost, { usd: 0.2, source: 'provider' }, "the provider's reported cost is untouched");
  assert.equal(L.refundOf(id).amount, (await import('../src/billingMode.ts')).teamMode() ? credits : 0, 'team mode: the first frame goes back to the balance (own accounts: no app charge to return)');
  assert.equal(await A.dropAnchorPrice(job), 0, 'taken off once'); assert.equal(job.cost, 21 - credits);
  const okJob: any = { id: 'anchorok', input: { target: 'x', charswapAnchorPath: '/made.png' }, cost: 21 }; await A.prepareCharswapAnchor(okJob, { key: 'fake' }); assert.equal(okJob.cost, 21, 'a made first frame keeps its price');
  const off: any = { id: 'anchoroff', input: { charswapAnchor: 'off' }, cost: 16 }; await A.prepareCharswapAnchor(off, { key: 'fake' }); assert.equal(off.cost, 16);
  ok(`failed first frame: −${credits} credits on the job (cost, route price, ledger), warning says so, provider cost untouched, once only`);
}
console.log('ALL OK h3-charswap-runon');
