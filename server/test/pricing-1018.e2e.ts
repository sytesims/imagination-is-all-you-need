// Oct 18 pricing batch: (1) unit display labels, (2) a route lacking its key always quotes needsKey:true + runnable:false (every hosted route swept;
// ?route= alone quotes the model that owns it, e.g. Reframe / Luma), (3) video upscale without a source size assumes 720p for every caller (also with
// seconds), (4) /api/edit-video/tools uses the quote's assumed seconds and says so. Throwaway mock servers :8966 (DEMO_AUTO=0) / :8967 (demo), temp data.
// Run: npx tsx test/pricing-1018.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { priceOf } from '../src/shared/pricing.js';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'pr1018-')); const procs: ChildProcess[] = [];
const boot = (port: number, extra: Record<string, string> = {}) => { const dd = fs.mkdtempSync(path.join(D, 'd-'));
  procs.push(spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: dd, OPENHIGGSFIELD_ENV_FILE: path.join(dd, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(dd, 'nofilm.json'), ...extra } })); return `http://localhost:${port}`; };
const ready = async (B: string) => { for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); } throw new Error(`${B} did not start`); };
const get = async (B: string, u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
const ok = (m: string) => console.log('ok ' + m);
try {
  const N = boot(testPort(8966), { OPENHIGGSFIELD_DEMO_AUTO: '0' }), M = boot(testPort(8967)); await ready(N); await ready(M);
  // (1) unit labels
  const pr = (await get(N, '/api/pricing')).body; const byUnit = new Map<string, any>(); for (const h of pr.hosted) byUnit.set(h.unit, h);
  for (const [u, l] of [['second', 'per second'], ['minute', 'per minute'], ['image', 'per image'], ['run', 'per run'], ['1k_chars', 'per 1,000 characters'], ['1k_bytes', 'per 1,000 bytes of text'], ['mp_second', 'per megapixel-second']])
    { const h = byUnit.get(u); assert.ok(h, u); assert.equal(h.unitLabel, l, u); assert.ok(h.unitHelp, u); }
  assert.ok(pr.hosted.every((h: any) => typeof h.unit === 'string' && h.unitLabel && h.exampleLabel), 'raw unit kept, every row labelled + exampleLabel');
  // BH8b / DP: no human-facing price string prints the raw unit ('_second' / '1k_' / 'mp_'); unit field itself stays machine-only.
  const humanBits: string[] = [];
  for (const h of pr.hosted) for (const k of ['unitLabel', 'unitHelp', 'exampleLabel', 'note', 'name', 'model'] as const) if (h[k]) humanBits.push(String(h[k]));
  const fq = (await get(N, '/api/tools/upscale/price?provider=direct-flux3-upscale&duration=8&route=direct:direct-flux3-upscale')).body; // the place asked for: nothing ready → nothing pre-selected, no price (4k 5b-1) assert.equal(fq.hosted?.unitLabel, 'per megapixel-second'); assert.equal(fq.hosted?.unit, 'mp_second');
  assert.match(String(pr.hosted.find((h: any) => h.unit === 'mp_second')?.exampleLabel), /megapixel-second/);
  assert.match(String(pr.hosted.find((h: any) => h.unit === '1k_bytes')?.exampleLabel), /bytes of text/);
  for (const [prov, extra, want] of [['direct-flux3-upscale', { megapixels: 2 }, /per megapixel-second.*× 16 megapixel-seconds/], ['api-fish-tts', { bytes: 2000, chars: 2000 }, /per 1,000 bytes of text.*× 2 thousand bytes of text/]] as const) {
    const p = priceOf({ toolId: prov === 'api-fish-tts' ? 'voice' : 'upscale', provider: prov, durationSec: 8, quality: '720p', ...extra } as any); const bl = p.breakdown.map((x) => x.label).join(' | ');
    humanBits.push(bl); assert.doesNotMatch(bl, /mp_second|1k_bytes|1k_chars/, bl); assert.match(bl, want, bl); }
  for (const s of [fq.priceLine, fq.unitLabel, fq.unitHelp, ...(fq.breakdown ?? []).map((x: any) => x.label)].filter(Boolean)) humanBits.push(String(s));
  for (const s of humanBits) assert.doesNotMatch(s, /_second|1k_|mp_/, `human price string leaked a raw unit: ${s}`);
  ok('units: /api/pricing hosted rows keep unit + unitLabel/unitHelp/exampleLabel; no human-facing price string contains _second / 1k_ / mp_');
  // (2) the reported case: Reframe, Luma fal route asked with ?route= alone
  const RF = 'fal:luma/agent/ray/v3.2/reframe';
  const r1 = (await get(N, `/api/tools/reframe/price?route=${RF}`)).body; assert.equal(r1.needsKey, true, JSON.stringify(r1)); assert.equal(r1.runnable, false); assert.equal(r1.demo, false); assert.equal(r1.keyMissing, true); assert.equal(r1.listCredits, r1.credits); assert.match(r1.priceLine, /^Needs a fal key\. Price once it's added: ≈ \$\d/);
  const r2 = (await get(M, `/api/tools/reframe/price?route=${RF}`)).body; assert.equal(r2.demo, true, JSON.stringify(r2)); assert.equal(r2.credits, 0); assert.equal(r2.routeId, RF);
  ok(`Reframe ?route=${RF}: no demo → needsKey/runnable:false/keyMissing (list ${r1.listCredits}); demo backend → sample output of that route`);
  // sweep every hosted route on every tool/model, pinned with ?route=
  const all = (await get(N, '/api/routes')).body.routes as any[]; let n = 0, keyless = 0; const bad: string[] = [];
  for (const m of all) for (const o of m.routes ?? []) { if (o.kind === 'local') continue;
    for (const [B, demo, routeOnly] of [[N, false, false], [M, true, false], [N, false, true], [M, true, true]] as const) {
      const r = await get(B, `/api/tools/${m.toolId}/price?${routeOnly ? '' : `provider=${encodeURIComponent(m.modelId)}&`}route=${encodeURIComponent(o.routeId)}`); if (r.status !== 200) continue; const q = r.body; n++;
      const missing = q.reasonCode === 'key_missing' || /key in Settings/i.test(String(q.reason ?? ''));
      if (missing) keyless++;
      if (missing && (q.needsKey !== true || q.runnable !== false)) bad.push(`${demo ? 'demo' : 'nodemo'} ${m.toolId}/${m.modelId}/${o.routeId}: needsKey ${q.needsKey} runnable ${q.runnable}`);
      if (q.runnable === false && q.needsKey === false && q.demo !== true && q.reasonCode === 'key_missing') bad.push(`${m.toolId}/${o.routeId}: key_missing without needsKey`);
      if (demo && q.demo === true && q.credits !== 0) bad.push(`${m.toolId}/${o.routeId}: demo with credits ${q.credits}`);
    } }
  assert.deepEqual(bad, [], bad.slice(0, 10).join('\n')); assert.ok(n > 100 && keyless > 30, `${n} quotes, ${keyless} keyless`);
  ok(`sweep: ${n} pinned hosted-route quotes (demo/no-demo × provider+route / route only), ${keyless} keyless → all needsKey:true + runnable:false; demo previews always 0`);
  // (3) upscale without a source size: 720p for every caller, with or without seconds
  // Nothing is ready on N (no keys, Use local off), so nothing is pre-selected and the default quote has no price (4k 5b-1): ask for SeedVR2's fal place so there is a price to compare
  const SV = '&route=' + encodeURIComponent('fal:fal-ai/seedvr/upscale/video');
  { const d0 = (await get(N, '/api/tools/upscale/price')).body; assert.equal(d0.runOn ?? null, null); assert.ok(d0.setupOptions?.length, 'nothing ready: setup options listed'); assert.deepEqual(d0.assumedSize, { width: 1280, height: 720 }, 'the estimate is shown even before a place is set up');
    const m0 = (await get(N, '/api/models/quote?model=comfy-seedvr2&duration=8')).body; assert.notEqual(m0.code, 'price_unavailable', `not set up ≠ no verified price: ${m0.reason}`); assert.deepEqual(m0.setupOptions, (await get(N, '/api/tools/upscale/price?provider=comfy-seedvr2&duration=8')).body.setupOptions); }
  const t = (await get(N, '/api/tools/upscale/price?' + SV.slice(1))).body; const s8 = (await get(N, '/api/tools/upscale/price?duration=8' + SV)).body; const pq = (await get(N, '/api/price?toolId=upscale&duration=8' + SV)).body; const mq = (await get(N, '/api/models/quote?model=comfy-seedvr2&duration=8' + SV)).body;
  assert.ok(typeof t.credits === 'number' && t.credits > 0, `fal place priced: ${t.credits}`);
  for (const [k, q] of Object.entries({ tool: t, seconds: s8, apiPrice: pq, modelsQuote: mq })) { assert.deepEqual(q.assumedSize, { width: 1280, height: 720 }, k); assert.equal(q.estimated, true, k); assert.equal(q.credits, t.credits, `${k} ${q.credits} vs ${t.credits}`); }
  assert.equal(s8.estimateReason, 'source_size_unknown'); assert.match(s8.estimateMessage, /^Estimate for a 720p source to 1080p/); /* 2026-10-26: SeedVR2 takes a size */
  const big = (await get(N, '/api/tools/upscale/price?duration=8&sourceResolution=1080p' + SV)).body; assert.deepEqual(big.sourceSize, { width: 1920, height: 1080 }); assert.equal(big.estimated, false); /* Oct 18 #8: a given source size is not assumed */ assert.ok(big.credits >= t.credits);
  const sized = (await get(N, '/api/tools/upscale/price?duration=8&width=1280&height=720' + SV)).body; assert.equal(sized.assumedSize, undefined); assert.equal(sized.credits, t.credits);
  ok(`upscale: no size → 720p everywhere (${t.credits} cr: tool, ?duration=8, /api/price, /api/models/quote); sourceResolution=1080p → ${big.credits}; real size not flagged`);
  // (4) edit-video menu = quote
  const menu = (await get(N, '/api/edit-video/tools')).body; assert.equal(menu.estimated, true); assert.equal(menu.assumedSeconds, 8);
  for (const id of ['remove-bg', 'upscale', 'reframe']) { const mt = menu.tools.find((x: any) => x.id === id); assert.equal(mt.assumedSeconds, 8, id);
    for (const mm of mt.models) for (const ro of mm.routes) { if (ro.credits == null || ro.kind === 'local') continue; assert.equal(ro.assumedSeconds, 8); assert.equal(ro.estimated, true);
      const q = (await get(N, `/api/tools/${id}/price?provider=${mm.id}&route=${encodeURIComponent(ro.routeId)}`)).body; assert.equal(q.credits, ro.credits, `${id} ${ro.routeId}: menu ${ro.credits} vs quote ${q.credits}`); } }
  const five = (await get(N, '/api/edit-video/tools?seconds=5')).body; assert.equal(five.estimated, false); assert.equal(five.assumedSeconds, null);
  ok('edit-video menu: 8 s assumed (estimated + assumedSeconds), route credits = the quote for Remove BG / Upscale / Reframe; ?seconds=5 → not estimated');
  console.log('ALL OK pricing-1018');
} finally { for (const p of procs) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } } fs.rmSync(D, { recursive: true, force: true }); }
