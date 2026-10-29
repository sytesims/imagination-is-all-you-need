// Comfy Router prices (reviewed 2026-10-22 against docs.comfy.org/development/comfy-router/pricing
// and docs.comfy.org/tutorials/partner-nodes/pricing): Krea 3 per resolution, Kling v3 with sound, and the per-reference surcharges
// (Seedream 5.0 Pro, Luma UNI-1, MiniMax H3, GPT Image 2) counted from the references the Router body really sends.
// Unit (in process, fake fetch, fake key, no network): routeCredits (the price every quote, the spend estimate and the run guard use),
// the Router body's reference count = the quoted count, and runRouter's guard (quote + $0.002) lets a realistic Comfy estimate through.
// E2E (mock server :9183, keyless): GET /api/models/quote and /api/tools/h3-video/price carry the same figures with refs=N.
// Run: npx tsx test/router-ref-prices.test.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'refprice-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'http://127.0.0.1:9' });
const ok = (m: string) => console.log('ok ' + m);
const PNG = path.join(D, 'ref.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=256x256', '-frames:v', '1', PNG]);
const refs = (n: number) => Array.from({ length: n }, () => PNG);

const { getTool } = await import('../src/tools/registry.ts'); const { findRoute } = await import('../src/routing/routes.ts'); const { routeCredits } = await import('../src/routing/select.ts');
const M = await import('../src/routing/routerModels.ts'); const RR = await import('../src/routing/routerRun.ts'); const BL = await import('../src/billing.ts');
const { priceOf, HOSTED_BY_ID, gptImageUsd, gptImageQuote, promptBytesOf } = await import('../src/shared/pricing.ts');
const ci = getTool('create-image')!; const hv = getTool('h3-video')!;
const CR = 211; const up = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6); const credits = (comfy: number) => up(Math.round((comfy / CR) * 1e5) / 1e5 * 100); // app credits (1 = $0.01) from Comfy credits, rounded UP per output (2026-10-24; was Math.round)
const route = (id: string) => findRoute(`comfy-router:${id}`)!;
const img = (o: Record<string, any>) => ({ outKind: 'image', n: 1, prompt: 'a red fox', aspect: '1:1', ...o });

// ---------------- 1. Krea 3 (fast thinking): 9.0519 (1K) / 18.1038 (2K); references 6.0346 / 21.1211 each (none sent by our body) ----------------
{ const h = HOSTED_BY_ID['api-krea']; assert.equal(h.sourceUrl, 'https://docs.comfy.org/development/comfy-router/pricing'); assert.equal(h.checkedAt, '2026-10-24') /* re-checked with the thinking modes */; assert.equal(h.estimated, false);
  const k1 = routeCredits(ci, route('api-krea'), img({ imageResolution: '1K' })); const k2 = routeCredits(ci, route('api-krea'), img({ imageResolution: '2K' }));
  assert.equal(k1, credits(9.0519)); assert.equal(k2, credits(18.1038)); assert.deepEqual([k1, k2], [5, 9]);
  // with references: the Krea Router body sends none (maxRefs 0: references need the upload proxy), so the quote stays and the route refuses the edit job
  const withRefs = img({ imageResolution: '2K', types: ['edit'], imagePath: PNG, refPaths: refs(2) });
  assert.equal(M.refsSent(M.ROUTER_MODELS['api-krea'], withRefs), 0); assert.equal(routeCredits(ci, route('api-krea'), withRefs), 9);
  assert.match(String(M.ROUTER_MODELS['api-krea'].block!(withRefs)), /takes no reference image/);
  // the row's own reference rates (if a job did send them): +6.0346 per ref at 1K, +21.1211 at 2K
  const p = (res: string, n: number) => priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: 'api-krea', imageRes: res, refImages: n }).credits;
  assert.equal(p('1K', 2), up((Math.round(9.0519 / CR * 1e5) + 2 * Math.round(6.0346 / CR * 1e5)) / 1e3)); assert.equal(p('2K', 2), up((Math.round(18.1038 / CR * 1e5) + 2 * Math.round(21.1211 / CR * 1e5)) / 1e3));
  ok(`Krea 3: 1K ${k1} / 2K ${k2} credits (was 6 at both); with references the body sends none → same quote, route refuses; row ref rates 1K +6.0346, 2K +21.1211`); }

// ---------------- 2. Kling 3.0 Omni (2026-10-25): silent 17.72 / 23.63, with sound 23.63 / 29.54 credits per s ----------------
{ const k = (res: string, audio: boolean, s = 5) => routeCredits(hv, route('router-kling'), { mode: 't2v', types: ['t2v'], prompt: 'waves', duration: s, resolution: res, audio });
  const got = { s720: k('720p', false), s1080: k('1080p', false), a720: k('720p', true), a1080: k('1080p', true) };
  assert.deepEqual(got, { s720: credits(17.72 * 5), s1080: credits(23.63 * 5), a720: credits(23.63 * 5), a1080: credits(29.54 * 5) });
  assert.deepEqual(got, { s720: 42, s1080: 56, a720: 56, a1080: 70 }); // kling-v3-omni rates (kling-v3 with sound was 64 / 85)
  assert.equal(k('720p', true, 10), credits(23.63 * 10)); assert.equal(k('1080p', true, 15), credits(29.54 * 15));
  ok(`Kling 3.0 Omni 5 s: 720p ${got.s720} / ${got.a720} with sound, 1080p ${got.s1080} / ${got.a1080} with sound (kling-v3 with sound was 64 / 85)`); }

// ---------------- 3. Per-reference surcharges, counted from what the Router body sends ----------------
// table = our hostedPrices figures (what the quote charges); comfy = the Router pricing page's own figures (a realistic /estimate)
type Case = { id: string; tool: any; input: (n: number) => Record<string, any>; table: (n: number) => number; comfy: (n: number) => number; ns: number[]; /** app credits when the row isn't a flat Comfy figure */ want?: (n: number) => number };
const CASES: Case[] = [
  { id: 'api-seedream', tool: ci, input: (n) => img({ imageResolution: '1K', types: n ? ['edit'] : undefined, imagePath: n ? PNG : undefined, refPaths: refs(n) }), table: (n) => 9.5 + 0.633 * n /* every input image quoted (partner page reading, 2026-10-24) */, comfy: (n) => 9.495 + 0.633 * Math.max(0, n - 1), ns: [0, 1, 2, 6, 10] },
  { id: 'api-seedream', tool: ci, input: (n) => img({ imageResolution: '2K', types: ['edit'], imagePath: PNG, refPaths: refs(n) }), table: (n) => 18.99 + 0.633 * n, comfy: (n) => 18.99 + 0.633 * Math.max(0, n - 1), ns: [1, 10] },
  { id: 'api-luma-image', tool: ci, input: (n) => img({ types: n ? ['edit'] : undefined, imagePath: n ? PNG : undefined, refPaths: refs(n) }), table: (n) => (n ? 9.1574 : 8.5244) + 0.633 * n /* an edit (photos attached) is type image_edit, priced at the image-edit rate (2026-10-25) */, comfy: (n) => (n ? 9.1574 : 8.5244) + 0.633 * n, ns: [0, 1, 5, 9] },
  // GPT Image 2 (2026-10-24): the token quote (hostedPrices gptImageQuote: exact size, prompt text, headroom, rounded up) + the reference rate × refs sent
  ...(['low', 'med', 'high'] as const).map((tier): Case => ({ id: 'api-gpt-image', tool: ci, input: (n) => img({ tier, types: n ? ['edit'] : undefined, imagePath: n ? PNG : undefined, refPaths: refs(n) }),
    table: (n) => 0, want: (n) => Math.ceil((gptImageUsd('gpt-image-2', tier, '1K', '1:1', promptBytesOf('a red fox')) + n * HOSTED_BY_ID['api-gpt-image'].refImages!.usd) * 100 - 1e-9),
    comfy: (n) => gptImageQuote('gpt-image-2', tier, '1K', '1:1', 9).baseComfyCredits + 2.47 * n, ns: tier === 'low' ? [0, 1, 4, 16] : tier === 'med' ? [0, 4] : [0, 16] })),
  { id: 'api-minimax-h3', tool: hv, input: (n) => ({ mode: n ? 'r2v' : 't2v', types: [n ? 'r2v' : 't2v'], prompt: 'a dancer', duration: 5, resolution: '720p', aspect: '16:9', refPaths: n ? refs(n) : undefined }), table: (n) => 27.1557 * 5 + 12.0692 * Math.max(0, n - 5), comfy: (n) => 27.1557 * 5 + 12.0692 * Math.max(0, n - 5), ns: [0, 3, 5, 6, 9] },
  { id: 'api-minimax-h3', tool: hv, input: (n) => ({ mode: 'r2v', types: ['r2v'], prompt: 'a dancer', duration: 4, resolution: '1080p', aspect: '16:9', refPaths: refs(n) }), table: (n) => 39.2249 * 4 + 12.0692 * Math.max(0, n - 5), comfy: (n) => 39.2249 * 4 + 12.0692 * Math.max(0, n - 5), ns: [9] },
];
const quoted: { id: string; n: number; input: Record<string, any>; credits: number; comfy: number }[] = [];
for (const c of CASES) for (const n of c.ns) {
  const input = c.input(n); const cr = routeCredits(c.tool, route(c.id), input)!;
  assert.equal(M.refsSent(M.ROUTER_MODELS[c.id], input), n, `${c.id}: the quote counts the ${n} references the body sends`);
  const body: any = await M.ROUTER_MODELS[c.id].body(input, 0); // what Router receives
  const sent = c.id === 'api-luma-image' ? (body.source ? 1 : 0) + (body.image_ref ?? []).length /* edit: the first photo in source, the rest in image_ref */ : c.id === 'api-minimax-h3' ? body.content.filter((x: any) => x.role === 'reference_image').length : (body.image ?? []).length;
  assert.equal(sent, n, `${c.id}: body sends ${n} references`);
  const exp = c.want ? c.want(n) : credits(c.table(n)); assert.equal(cr, exp, `${c.id} with ${n} refs: ${cr} vs ${exp}`);
  // the spend log estimate is the same figure (costOf from the route's credits)
  const est = BL.costOf({ kind: route(c.id).kind, routeId: route(c.id).routeId, credits: cr }); assert.equal(est.estUsd, cr / 100);
  quoted.push({ id: c.id, n, input, credits: cr, comfy: c.comfy(n) });
}
assert.ok(quoted.find((q) => q.id === 'api-gpt-image' && q.n === 16)!.credits > quoted.find((q) => q.id === 'api-gpt-image' && q.n === 0)!.credits + 15, 'GPT Image 16 refs ≈ +47 Comfy credits');
{ const b = priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: 'api-gpt-image', tier: 'low', imageRes: '1K', refImages: 4 }).breakdown.map((x) => x.label).join(' | ');
  assert.ok(b.includes(`+ 4 reference images × $${HOSTED_BY_ID['api-gpt-image'].refImages!.usd} (estimated)`), b); }
ok(`per-reference quotes = Comfy figures and the body's own reference count: ${quoted.map((q) => `${q.id.replace('api-', '')}×${q.n}=${q.credits}`).join(', ')}`);

// ---------------- 4. The guard (routerRun.ts: quote + $0.002 since 2026-10-24, was 1.25×) lets a realistic Comfy estimate through ----------------
process.env.COMFY_API_KEY = 'test-not-a-real-key'; // fake key, fake fetch: nothing leaves the process
let submits = 0;
const fake = (estUsd: number) => (async (u: any, init: any = {}) => { const url = String(u);
  if (url.endsWith('/estimate')) return new Response(JSON.stringify({ source: 'exact', amount: estUsd.toFixed(6), credits: Math.round(estUsd * CR * 1e4) / 1e4 }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.endsWith('/requests?fallback_provider=false') && init.method === 'POST') { submits++; return new Response(JSON.stringify({ detail: 'stop here (test)' }), { status: 422, headers: { 'content-type': 'application/json', 'x-comfy-error-type': 'invalid_input' } }); }
  return new Response('unexpected', { status: 500 }); }) as typeof fetch;
const runGuard = async (id: string, input: Record<string, any>, quoteCredits: number, estUsd: number) => {
  const r = route(id); RR.setRouterFetch(fake(estUsd), async () => {}); submits = 0;
  const job: any = { id: `t-${id}-${Math.random().toString(36).slice(2, 8)}`, toolId: 'x', status: 'running', input, cost: quoteCredits, routing: { prices: { [r.routeId]: quoteCredits } } };
  await RR.runRouter(job, r, { n: 1 } as any, 5000).catch(() => null); return { reason: job.reasonCode as string, submits };
};
const allGuard = [
  ...[['1K', 9.0519], ['2K', 18.1038]].map(([res, comfy]) => ({ id: 'api-krea', n: 0, input: img({ imageResolution: res }), credits: routeCredits(ci, route('api-krea'), img({ imageResolution: res }))!, comfy: comfy as number })),
  ...[['720p', false, 17.72], ['720p', true, 23.63], ['1080p', false, 23.63], ['1080p', true, 29.54]] /* kling-v3-omni (2026-10-25) */.map(([res, audio, rate]) => { const input = { mode: 't2v', types: ['t2v'], prompt: 'waves', duration: 5, resolution: res, audio };
    return { id: 'router-kling', n: 0, input, credits: routeCredits(hv, route('router-kling'), input)!, comfy: (rate as number) * 5 }; }),
  ...quoted,
];
for (const g of allGuard) { const r = await runGuard(g.id, g.input, g.credits, g.comfy / CR);
  assert.notEqual(r.reason, 'price_changed', `${g.id} ×${g.n}: Comfy ${g.comfy.toFixed(2)} credits ($${(g.comfy / CR).toFixed(4)}) vs quote ${g.credits} → refused`); assert.equal(r.submits, 1, `${g.id} ×${g.n}: dispatched after the estimate`); }
ok(`guard: ${allGuard.length} realistic Comfy estimates (Krea 1K/2K, Kling ±sound 720p/1080p, Seedream / Luma / GPT Image / H3 with refs) pass the quote + $0.002 check and are dispatched`);
{ // hard rule (2026-10-24): just above quote + $0.002 → refused before submit; within the margin → dispatched
  const k = allGuard[0]; const q = k.credits / 100;
  assert.equal(RR.OVER_QUOTE_MARGIN_USD, 0.002);
  const over = await runGuard(k.id, k.input, k.credits, q + 0.0021); assert.equal(over.reason, 'price_changed'); assert.equal(over.submits, 0, 'nothing dispatched');
  const within = await runGuard(k.id, k.input, k.credits, q + 0.0019); assert.notEqual(within.reason, 'price_changed'); assert.equal(within.submits, 1);
  // a token-billed model with no usable estimate (unknown / 403 not_enabled) runs only when its quote carries an allowance
  const unknown = (kind: 'unknown' | 'not_enabled') => (async (u: any, init: any = {}) => { const url = String(u);
    if (url.endsWith('/estimate')) return kind === 'unknown' ? new Response(JSON.stringify({ source: 'unknown', reason: 'not_quotable' }), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ detail: 'rolling out', error_type: 'not_enabled' }), { status: 403, headers: { 'content-type': 'application/json', 'x-comfy-error-type': 'not_enabled' } });
    if (url.includes('fallback_provider=false') && init.method === 'POST') { submits++; return new Response(JSON.stringify({ detail: 'stop here (test)' }), { status: 422, headers: { 'content-type': 'application/json', 'x-comfy-error-type': 'invalid_input' } }); }
    return new Response('unexpected', { status: 500 }); }) as typeof fetch;
  const runNoEst = async (id: string, kind: 'unknown' | 'not_enabled') => { const r = route(id); RR.setRouterFetch(unknown(kind), async () => {}); submits = 0;
    const job: any = { id: `t-noest-${Math.random().toString(36).slice(2, 8)}`, toolId: 'create-image', status: 'running', input: img({ tier: 'low' }), cost: 5, routing: { prices: { [r.routeId]: 5 } } };
    const err: any = await RR.runRouter(job, r, { n: 1 } as any, 5000).then(() => null, (e) => e); return { reason: job.reasonCode as string ?? err?.reasonCode, msg: String(job.error ?? err?.message ?? ''), submits }; };
  assert.ok(RR.TOKEN_BILLED.has('api-gpt-image') && RR.QUOTE_HAS_ALLOWANCE.has('api-gpt-image'));
  RR.QUOTE_HAS_ALLOWANCE.delete('api-gpt-image'); // stands in for a token-billed model whose quote has no allowance (every listed one has one today)
  try { for (const kind of ['unknown', 'not_enabled'] as const) { const r = await runNoEst('api-gpt-image', kind); assert.equal(r.reason, 'price_changed', `${kind}: ${JSON.stringify(r)}`); assert.equal(r.submits, 0, `${kind}: nothing dispatched`); } }
  finally { RR.QUOTE_HAS_ALLOWANCE.add('api-gpt-image'); }
  for (const kind of ['unknown', 'not_enabled'] as const) { const r = await runNoEst('api-gpt-image', kind); assert.notEqual(r.reason, 'price_changed'); assert.equal(r.submits, 1, `with the allowance (${kind}): dispatched`); }
  { const r = await runNoEst('api-krea', 'unknown'); assert.equal(r.submits, 1, 'a flat-priced (not token-billed) model runs on our own price table without an estimate'); }
  ok(`guard: estimate quote + $0.0021 refused before submit, + $0.0019 dispatched; token-billed model without an allowance + no estimate (unknown / 403 not_enabled) refused, with the allowance or flat-priced → dispatched`); }
{ // control: the guard still works, and the old Krea 2K quote (Krea 2 Large, 6 credits) would have been refused by Comfy's 18.10
  const old = await runGuard('api-krea', img({ imageResolution: '2K' }), 6, 18.1038 / CR); assert.equal(old.reason, 'price_changed'); assert.equal(old.submits, 0);
  const h3 = quoted.find((q) => q.id === 'api-minimax-h3' && q.n === 9)!; const over = await runGuard(h3.id, h3.input, h3.credits, (h3.credits / 100) * 1.3); assert.equal(over.reason, 'price_changed');
  const oldH3 = await runGuard(h3.id, h3.input, credits(27.16 * 5), h3.comfy / CR); /* 768P 5 s, 9 refs */ assert.equal(oldH3.reason, 'price_changed', 'without the surcharge the 9-ref H3 quote was refused');
  ok('control: an estimate 1.3× the quote is still refused; the old Krea 2K quote (6) and the old 9-reference H3 quote (no surcharge) would have been refused'); }
RR.setRouterFetch(null); process.env.COMFY_API_KEY = '';

// ---------------- 5. The quotes the UI reads (keyless mock server) carry the same figures ----------------
const PORT = testPort(9183), B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'srv-')), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0' }, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-srv.pid!); } catch { /* gone */ } };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
  const get = async (u: string) => (await fetch(B + u)).json();
  const want = (id: string, n: number) => quoted.find((q) => q.id === id && q.n === n && (id !== 'api-seedream' || q.input.imageResolution === '1K') && (id !== 'api-minimax-h3' || q.input.duration === 5))!.credits;
  // Keyless: nothing is ready, so nothing is pre-selected (4k 5b-1) and the default quote has no price; the setup card's Comfy row carries the
  // Router price, and asking for that place (route=) quotes the same figure. cq = that figure, after checking both agree.
  const cq = async (u: string, id: string) => { const d = await get(u); const so = (d.setupOptions ?? []).find((o: any) => o.routeId === `comfy-router:${id}`);
    assert.equal(d.credits, null, `nothing pre-selected: ${u}`); assert.ok(so, `Comfy setup option for ${id}: ${JSON.stringify(d.setupOptions)}`);
    const r = await get(`${u}&route=comfy-router:${id}`); assert.equal(r.route, `comfy-router:${id}`); assert.equal(r.credits, so.credits, `${id}: route quote = setup option`); return r.credits; };
  for (const n of [2, 6, 10]) assert.equal(await cq(`/api/models/quote?model=api-seedream&imageResolution=1K&aspect=1:1&mode=edit&refs=${n}`, 'api-seedream'), want('api-seedream', n), `Seedream ${n}`);
  for (const n of [1, 5, 9]) assert.equal(await cq(`/api/models/quote?model=api-luma-image&aspect=1:1&mode=edit&refs=${n}`, 'api-luma-image'), want('api-luma-image', n));
  for (const n of [4, 16]) assert.equal(await cq(`/api/models/quote?model=api-gpt-image&quality=low&aspect=1:1&mode=edit&refs=${n}&prompt=a%20red%20fox`, 'api-gpt-image'), want('api-gpt-image', n));
  assert.equal(await cq('/api/models/quote?model=api-krea&aspect=1:1', 'api-krea'), 5);
  for (const n of [3, 6, 9]) assert.equal(await cq(`/api/tools/h3-video/price?provider=api-minimax-h3&types=r2v&duration=5&resolution=720p&aspect=16:9&refs=${n}`, 'api-minimax-h3'), want('api-minimax-h3', n), `H3 ${n}`);
  for (const [res, audio, c] of [['720p', '0', 42], ['720p', '1', 56], ['1080p', '0', 56], ['1080p', '1', 70]] as const) assert.equal(await cq(`/api/tools/h3-video/price?provider=router-kling&types=t2v&duration=5&resolution=${res}&aspect=16:9&audio=${audio}`, 'router-kling'), c, `Kling ${res} audio=${audio}`);
  ok('UI quotes (GET /api/models/quote, /api/tools/h3-video/price with refs=N / audio): setup option and route= quote = the route prices above');
} finally { stop(); }
process.exit(0);
