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
    assert.equal(p.inputStep, true, 'an input step (who to swap), not "can\'t run"'); assert.ok(!/can.t run/i.test(p.error), p.error);
    const opt = p.routes.find((o: any) => o.routeId === CLOUD); assert.equal(opt.inputStep, true); assert.ok(opt.credits > 0, 'the place keeps its price');
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
    blockedCode: 'input_blocked', inputStep: true, reason: 'H3 Character Swap: click the person to swap, or pick left/right', blockedReason: "Comfy Cloud can't run this job. H3 Character Swap: click the person to swap, or pick left/right." };
  const step = { code: 'pick_missing', stage: 'inputs' as const, message: 'Click the person to swap, or pick left/right', fix: { kind: 'open-group' as const, label: 'Open', args: { group: 'replace' } } };
  const withStep = preflightProblems({ quote, modelName: 'H3 Character Swap', steps: [step] }); // the Video bar's own who step
  assert.deepEqual(withStep.map((x) => x.code), ['pick_missing'], 'listed once'); assert.deepEqual(withStep[0].fix, { kind: 'open-group', label: 'Open', args: { group: 'replace' } });
  const bare = preflightProblems({ quote, modelName: 'H3 Character Swap' }); assert.deepEqual(bare.map((x) => [x.code, x.stage]), [['input_problem', 'inputs']], 'a page with no own step: one input step');
  assert.match(bare[0].message, /^H3 Character Swap: click the person/); assert.notEqual(bare[0].fix.kind, 'pick-model', 'never "Pick model…" for an input');
  // shared source (other tools): a model refusal that is NOT an input step still says so
  const other = preflightProblems({ quote: { ...quote, inputStep: undefined }, modelName: 'X' }); assert.deepEqual(other.map((x) => x.code), ['model_cant_run']);
  assert.ok(![...withStep, ...bare].some((x) => /price|key/i.test(x.message)));
  ok('bar reasons: who to swap straight away (fix opens the Who box), no "No verified price" / "Needs a key"');
}
// ---- Your computer on too: both places need the who; Comfy Cloud still named first
useLocal(true);
{ const p = plan({ target: '' }); assert.equal(p.code, 'input_blocked'); assert.equal(p.routeId, CLOUD); ok('Use local on as well: still Comfy Cloud + the who reason'); }
// ---- nothing set up: no key, Your computer off → nothing ready, as before
delete process.env.COMFY_API_KEY; useLocal(false);
{ const p = plan({ target: '' }); assert.equal(p.errorType, 'no_provider', JSON.stringify(p).slice(0, 200)); assert.equal(p.routeId, undefined);
  const opt = p.routes.find((o: any) => o.routeId === CLOUD); assert.equal(opt.reasonCode, 'key_missing', 'no key stays "needs a key", never an input step'); assert.equal(opt.inputStep, undefined);
  ok('neither place ready: no_provider (setup card), the Cloud row still needs a key, unchanged'); }
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

// ---- who to swap by default: the biggest person on the first frame (as Openjutsu), else ask
{
  const { mainPersonPick, charswapWhoIssue } = await import('../src/shared/cloudSwap.ts');
  const W = 832, H = 468; const b = (x: number, w: number, h = 300) => ({ x, y: 80, width: w, height: h });
  const one = mainPersonPick([b(300, 120)], W, H); assert.ok(one.point); assert.deepEqual(one.point, { x: Math.round((360 / W) * 1e4) / 1e4, y: Math.round((230 / H) * 1e4) / 1e4 });
  const big = mainPersonPick([b(20, 60, 150), b(400, 160)], W, H); assert.ok(big.point && big.point.x > 0.5, 'the largest, wherever it stands');
  assert.deepEqual(mainPersonPick([b(100, 120), b(500, 115)], W, H), { point: null, why: 'similar' }, 'two within 20%: ask');
  assert.ok(mainPersonPick([b(100, 120), b(500, 95)], W, H).point, '21% smaller: the bigger one');
  assert.deepEqual(mainPersonPick([], W, H), { point: null, why: 'none' });
  // the auto-pick is a click, so the who block is gone; a side or words of your own still work (they win in the page)
  assert.equal(charswapWhoIssue({ mode: 'object_swap', target: '', point: { x: 0.43, y: 0.49 } }), null);
  assert.equal(charswapWhoIssue({ mode: 'object_swap', target: 'the man on the left' }), null); assert.ok(charswapWhoIssue({ mode: 'object_swap', target: '' }));
  // the free preview's people mode (mock backend): one / two similar / nobody
  const Fastify = (await import('fastify')).default; const app = Fastify(); await app.register((await import('@fastify/multipart')).default);
  (await import('../src/routesMaskPreview.ts')).registerMaskPreview(app);
  const clip = path.join(D, 'people.mp4'); (await import('node:child_process')).execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=720x1280:r=24:d=1', '-pix_fmt', 'yuv420p', clip]);
  const ask = async (words = '') => (await app.inject({ method: 'POST', url: '/api/tools/object-swap/mask-preview', payload: { videoUrl: '/files/people.mp4', swapType: 'person', people: '1', maskPrompt: words, t: '0' } })).json();
  const r1 = await ask(); assert.equal(r1.count, 2); assert.ok(r1.pick && r1.pick.x > 0 && r1.pick.x < 1); assert.equal(r1.credits, 0); assert.equal(r1.free, true); assert.match(r1.frameUrl, /^\/files\//);
  const r2 = await ask('[mocktwo]'); assert.equal(r2.pick, null); assert.equal(r2.why, 'similar');
  const r3 = await ask('[mocknone]'); assert.equal(r3.pick, null); assert.equal(r3.why, 'none'); assert.equal(r3.count, 0);
  await app.close();
  ok('who by default: the biggest person (one / big + small), two of a size or nobody → ask; the free preview finds them (0 credits); a click or side clears the block');
}

// ---- H3 resolutions: 480p · faster / 768p · sharpest; old 720p / 1080p jobs keep working at the same price
{
  const { H3_SWAP_RES } = await import('../src/tools/videoSwap.ts'); const CS = await import('../src/comfy/h3CharSwapCloud.ts');
  assert.deepEqual(H3_SWAP_RES.byProvider['comfy-h3-charswap'], ['480p', '720p']); assert.deepEqual(H3_SWAP_RES.labelsByProvider['comfy-h3-charswap'], { '480p': '480p · faster', '720p': '768p · sharpest' });
  const resIn = tool.inputs.find((i: any) => i.name === 'resolution') as any; assert.deepEqual(resIn.byProvider['comfy-h3-charswap'], ['480p', '720p']); assert.ok(resIn.byProvider['router-kling-edit']?.length, 'Kling keeps its own');
  for (const r of ['720p', '1080p']) assert.equal(CS.charswapTier({ resolution: r }), '768p', `${r} (old jobs, Recreate) renders 768p`); assert.equal(CS.charswapTier({ resolution: '480p' }), '480p');
  process.env.COMFY_API_KEY = 'fake-runon-key';
  const { routesFor } = await import('../src/routing/routes.ts'); const { routeCredits } = await import('../src/routing/select.ts'); const rt = routesFor(H3, tool).find((x: any) => x.routeId === CLOUD)!;
  const at = (res: string) => routeCredits(tool, rt, { ...q({ resolution: res, target: 'the man on the left' }) });
  assert.equal(at('720p'), at('1080p'), '768p · sharpest = what 720p and 1080p were'); assert.ok(at('480p') < at('720p'));
  const sub = (res: string) => routeCredits(tool, rt, { videoPath: '/x.mp4', duration: 6, resolution: res, swapType: 'person', target: 'the man on the left', mode: 'object_swap' });
  for (const r of ['480p', '720p', '1080p']) assert.equal(sub(r), at(r), `${r}: quote = submit`);
  delete process.env.COMFY_API_KEY;
  ok(`H3 sizes: 480p · faster ($${(at('480p')! / 100).toFixed(2)}) / 768p · sharpest ($${(at('720p')! / 100).toFixed(2)}) for 6 s; old 720p/1080p jobs = 768p at the same price; quote = submit`);
}
console.log('ALL OK h3-charswap-runon');
