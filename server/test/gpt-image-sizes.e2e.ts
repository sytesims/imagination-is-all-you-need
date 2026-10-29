// GPT Image sizes and quote (2026-10-24): GPT Image 2.5 Flare / Sunburst and GPT Image 2 on Comfy Router.
// Unit: the shared size table obeys OpenAI's custom-size rules and holds every Comfy node preset; each model offers 10 shapes × 1K / 2K / 4K × low / med / high,
//  no Auto (prompt or edit); checkImageCaps snaps any other shape / quality to the nearest with a note (D5, 2026-10-28); the Router body sends the exact size, quality and n 1 and
//  throws on an off-list shape (the caps snap it first, D5; never "auto"); the quote is ≥ the derived charge for every size × quality (and ≥ the real 2026-10-24 bill).
// E2E: one mock-backend server (:8776) with a FAKE api.comfy.org (:8775, fake key, no network, no spend): every shape × size on Flare sent exactly
//  (one call each), a tall 2K high run with quote = charge, an edit with 2 images, an off-list shape snapped with a note (D5), the prompt peek's Request row.
// Run: npx tsx test/gpt-image-sizes.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import { randomUUID } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-sizes-'));
const KEY = 'test-not-a-real-key'; const PORT_FAKE = testPort(8775); const FAKE = `http://127.0.0.1:${PORT_FAKE}`; const PORT = testPort(8776);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_GEMINI_API_KEY: '', OPENHIGGSFIELD_OPENAI_API_KEY: '' };
const ok = (m: string) => console.log('ok ' + m);
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock' });
const PNG = path.join(D, 'in.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=640x480', '-frames:v', '1', PNG]);
const OUT = (() => { const f = path.join(D, 'out.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', f]); return fs.readFileSync(f).toString('base64'); })();

const S = await import('../src/shared/gptImageSizes.ts'); const C = await import('../src/shared/imageCaps.ts'); const M = await import('../src/routing/routerModels.ts');
const H = await import('../src/shared/hostedPrices.ts'); const P = await import('../src/shared/pricing.ts'); const O = await import('../src/providers/openai.ts');
const SHAPES = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']; const RES = ['1K', '2K', '4K'] as const; const TIERS = ['low', 'med', 'high'] as const;
const MODELS = [['api-gpt-image-25-flare', 'openai/gpt-image-2.5-flare', 'gpt-image-2.5'], ['api-gpt-image-25-sunburst', 'openai/gpt-image-2.5-sunburst', 'gpt-image-2.5'], ['api-gpt-image', 'openai/gpt-image-2', 'gpt-image-2']] as const;

// ---------------- unit ----------------
{ // the table: OpenAI's custom-size rules, exact ratios, all eight Comfy node presets
  const R = S.GPT_SIZE_RULES; const all: string[] = [];
  for (const r of RES) { assert.deepEqual(Object.keys(S.GPT_IMAGE_SIZES[r]).sort(), [...SHAPES].sort(), `${r}: one size per shape`);
    for (const a of SHAPES) { const s = S.GPT_IMAGE_SIZES[r][a]; all.push(s); const { width: w, height: h } = S.gptWH(s); const [x, y] = a.split(':').map(Number);
      assert.ok(w % R.step === 0 && h % R.step === 0, `${s} ×16`); assert.ok(Math.max(w, h) <= R.maxEdge, `${s} edge`); assert.ok(Math.max(w, h) / Math.min(w, h) <= R.maxRatio, `${s} ratio`);
      assert.ok(w * h >= R.minPixels && w * h <= R.maxPixels, `${s} pixels ${w * h}`); assert.equal(w * y, h * x, `${a} ${r} → ${s} is exactly ${a}`); } }
  for (const p of ['1024x1024', '1024x1536', '1536x1024', '2048x2048', '2048x1152', '1152x2048', '3840x2160', '2160x3840']) assert.ok(all.includes(p), `Comfy node preset ${p} offered`);
  ok('size table: 30 sizes, each ×16, ≤3840, ≤3:1, 655,360–8,294,400 px, exactly its shape; all 8 OpenAIGPTImageNodeV2 presets included');
}
{ // caps: the bar's lists = the table
  for (const [id] of MODELS) { const c = C.IMAGE_CAPS[id];
    assert.deepEqual([...c.aspects].sort(), [...SHAPES].sort(), `${id} aspects`); assert.deepEqual(c.resolutions, ['1K', '2K', '4K']); assert.deepEqual(c.qualityTiers, ['low', 'med', 'high']);
    assert.equal(c.allowAuto, false); assert.equal(c.edit!.allowAuto, false); assert.deepEqual([...c.edit!.aspects].sort(), [...SHAPES].sort()); assert.deepEqual(c.edit!.resolutions, ['1K', '2K', '4K']);
    assert.equal(c.verified, true); assert.ok(!c.unverified.includes('aspects') && !c.unverified.includes('resolutions')); assert.match(c.source, /OpenAIGPTImageNodeV2/); assert.match(c.source, /image-generation/);
    for (const a of SHAPES) for (const r of RES) { const k = C.checkImageCaps(id, { aspect: a, imageResolution: r, quality: 'high' }) as any; assert.equal(k.ok, true); assert.equal(k.aspect, a); }
    // D5 (user, 2026-10-28): an off-list shape snaps to the closest listed one with a note, never refused
    for (const a of ['5:7', '1:4', '9:21', '2:1']) { const k = C.checkImageCaps(id, { aspect: a }) as any; assert.equal(k.ok, true, a); assert.ok(SHAPES.includes(k.aspect), `${a} → ${k.aspect}`); assert.match(k.notes[0], new RegExp(`closest shape this model offers \\(you picked ${a}\\)`)); }
    assert.ok((C.checkImageCaps(id, { aspect: 'auto' }) as any).ok, 'Auto picks a listed shape'); assert.ok((C.checkImageCaps(id, { aspect: 'auto', mode: 'edit', refs: 1 }) as any).ok, 'Auto on an edit picks a listed shape');
    assert.equal((C.checkImageCaps(id, { aspect: '9:16', mode: 'edit', refs: 2, imageResolution: '4K' }) as any).ok, true, 'an edit takes a picked shape and size');
    { const k = C.checkImageCaps(id, { aspect: '1:1', quality: 'xhigh' }) as any; assert.equal(k.ok, true, 'D5: xhigh snaps to the usual quality'); assert.match(k.notes[0], /closest quality/); } }
  ok('caps: Flare / Sunburst / GPT Image 2 take 10 shapes × 1K / 2K / 4K × low / med / high, verified; Auto picks a shape, xhigh and other shapes snap with a note (D5)');
}
{ // the Router body: exact size, quality, n 1; off-list throws (no call)
  for (const [id, rid] of MODELS) { const R = M.ROUTER_MODELS[id]; assert.equal(R.id, rid);
    for (const a of SHAPES) for (const r of RES) for (const t of TIERS) { const b: any = await R.body({ types: ['generate'], prompt: 'p', aspect: a, imageResolution: r, quality: t }, 0);
      assert.equal(b.size, S.GPT_IMAGE_SIZES[r][a]); assert.equal(b.quality, t === 'med' ? 'medium' : t); assert.equal(b.n, 1); assert.equal(b.image, undefined); assert.equal(R.block!({ types: ['generate'], aspect: a, imageResolution: r }), null); }
    for (const a of ['5:7', '1:4']) { await assert.rejects(R.body({ types: ['generate'], prompt: 'p', aspect: a }, 0), new RegExp(`Aspect ${a} isn't supported by this model`)); assert.match(String(R.block!({ types: ['generate'], aspect: a })), /isn't supported/); }
    const none: any = await R.body({ types: ['generate'], prompt: 'p' }, 0); assert.equal(none.size, '1024x1024', 'no shape (old client) = 1:1, never auto'); }
  const tall: any = await M.ROUTER_MODELS['api-gpt-image-25-flare'].body({ types: ['generate'], finalPrompt: 'a vertical film poster', aspect: '2:3', imageResolution: '2K', quality: 'high' }, 0);
  assert.deepEqual(tall, { prompt: 'a vertical film poster', quality: 'high', size: '1344x2016', n: 1, output_format: 'png' });
  const ed: any = await M.ROUTER_MODELS['api-gpt-image-25-flare'].body({ types: ['edit'], prompt: 'x', aspect: '4:5', imageResolution: '1K', quality: 'low', refPaths: [PNG, PNG] }, 0);
  assert.equal(ed.size, '1024x1280'); assert.equal(ed.image.length, 2); assert.match(ed.image[0], /^data:image\/png;base64,/);
  // the OpenAI direct route sends the same sizes (one table) and refuses the same shapes
  for (const a of SHAPES) for (const r of RES) assert.equal(O.openaiSizeField(a, r), S.GPT_IMAGE_SIZES[r][a]);
  assert.match(String(O.OPENAI_ROUTES['api-gpt-image-25-flare'][0].unavailableFor!({ types: ['generate'], aspect: '5:7' })), /isn't supported/);
  ok('Router body: every shape × size × quality sent exactly (size, quality, n 1), 5:7 / 1:4 throw before a call, a tall 2K high body exact; the OpenAI direct route uses the same sizes');
}
{ // quote ≥ the derived charge for every size × quality (both families), rounded up, with the real run covered
  // derived charge = what Comfy bills by its token rates: (OpenAI formula + 4, as measured runs show) image tokens + a ~4-chars-per-token prompt, plus the
  // remainder the 2026-10-24 run showed (5.44 billed vs 4.61 explained) taken both ways: +18% of the bill, or +0.83 credits per call.
  let rows = 0;
  for (const [id, , fam] of MODELS) { const Rt = H.GPT_COMFY_RATES[fam];
    for (const a of SHAPES) for (const r of RES) for (const t of TIERS) for (const chars of [20, 1500, 6000]) { const { width, height } = S.gptWH(S.GPT_IMAGE_SIZES[r][a]);
      const tok = H.gptImageTokens(fam, t === 'med' ? 'medium' : t, width, height) + 4; const explained = (tok * Rt.imageOut + (chars / 4 + 20) * Rt.textIn) / 1e6;
      const derivedUsd = Math.max(explained * 1.18, explained + 0.83) / 211;
      const credits = P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: id, tier: t, imageRes: r, aspect: a, promptBytes: chars }).credits;
      assert.ok(credits * 0.01 >= derivedUsd, `${id} ${a} ${r} ${t} ${chars} chars: quote ${credits} credits < derived $${derivedUsd.toFixed(4)}`); rows++; }
    // no shape known = the costliest shape (never below any shape's quote)
    for (const r of RES) for (const t of TIERS) { const bare = P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: id, tier: t, imageRes: r }).credits;
      for (const a of SHAPES) assert.ok(bare >= P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: id, tier: t, imageRes: r, aspect: a }).credits); } }
  // the real bill: Flare, 1K 1:1 medium, ~1,500-char prompt, charged $0.0258
  const run = P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: 'api-gpt-image-25-flare', tier: 'med', imageRes: '1K', aspect: '1:1', promptBytes: 1500 });
  assert.ok(run.credits * 0.01 >= 0.0258, `real run covered: ${run.credits}`); assert.equal(run.credits, 3);
  assert.match(run.breakdown.map((x) => x.label).join(' | '), /≈ 1024x1024: ~447 image tokens \+ ~700 prompt tokens/);
  // rounded up, and a longer prompt costs more; n images = per image × n
  const p0 = P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: 'api-gpt-image-25-flare', tier: 'low', imageRes: '1K', aspect: '1:1', promptBytes: 10 }).credits;
  const p9 = P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: 'api-gpt-image-25-flare', tier: 'low', imageRes: '1K', aspect: '1:1', promptBytes: 10000 }).credits; assert.ok(p9 > p0, `${p9} > ${p0}`);
  assert.equal(P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: 'api-gpt-image', tier: 'high', imageRes: '4K', aspect: '9:16', promptBytes: 100, count: 3 }).credits,
    3 * P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: 'api-gpt-image', tier: 'high', imageRes: '4K', aspect: '9:16', promptBytes: 100 }).credits);
  assert.equal(H.promptBucket(0), 500); assert.equal(H.promptBucket(501), 1000); assert.equal(H.promptBucket(undefined), 500);
  ok(`quote ≥ derived charge on ${rows} size × quality × prompt rows (3 models); the real $0.0258 run quotes 3 credits; longer prompts cost more; n × per image`);
}

// ---------------- fake api.comfy.org ----------------
const calls: { model: string; body: any }[] = []; const reqs = new Map<string, { model: string }>();
const fake = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const raw = Buffer.concat(chunks).toString();
  const send = (code: number, o: any, h: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'x-comfy-request-id': randomUUID(), ...h }); res.end(JSON.stringify(o)); };
  if (req.headers['x-api-key'] !== KEY) return send(401, { detail: 'no usable credential', error_type: 'unauthorized' }, { 'x-comfy-error-type': 'unauthorized' });
  let m = /^\/v2\/models\/([^/]+)\/([^/?]+)(\/estimate|\/requests)?(?:\?fallback_provider=false)?$/.exec(req.url!);
  if (m && req.method === 'POST') { const model = `${m[1]}/${m[2]}`;
    if (m[3] === '/estimate') return send(200, { source: 'exact', currency: 'USD', amount: '0.0100', amount_cents: 1, credits: 2.11, provider: m[1], model });
    const id = randomUUID(); calls.push({ model, body: JSON.parse(raw || '{}') }); reqs.set(id, { model }); const base = `${FAKE}/v2/models/${m[1]}/${m[2]}/requests/${id}`;
    return send(201, { request_id: id, status: 'IN_QUEUE', status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel` }); }
  m = /^\/v2\/models\/[^/]+\/[^/]+\/requests\/([^/]+)(\/status|\/cancel)?$/.exec(req.url!);
  if (m) { if (!reqs.get(m[1])) return send(404, { detail: 'x', error_type: 'request_not_found' });
    if (m[2] === '/status') return send(200, { request_id: m[1], status: 'COMPLETED' }, { 'retry-after': '1' });
    return send(200, { created: 1, data: [{ b64_json: OUT }], usage: { input_tokens: 40, output_tokens: 443, total_tokens: 483 } }, { 'x-comfy-credits-used': '5' }); }
  send(404, { detail: 'unknown', error_type: 'model_not_found' });
});
await new Promise<void>((r) => fake.listen(PORT_FAKE, '127.0.0.1', r));
let proc: ChildProcess | null = null;
const DD = fs.mkdtempSync(path.join(D, 'data-')); const B = `http://localhost:${PORT}`;
const J = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const post = async (f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...f })) fd.append(k, v);
  for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: 'image/png' }), path.basename(p)); return J(await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd })); };
const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'canceled', 'blocked', 'needs_decision'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 50)); } throw new Error('timeout ' + id); };
const peek = async (fields: Record<string, string>, files: Record<string, number> = {}, photo?: { width: number; height: number }) => J(await fetch(`${B}/api/tools/create-image/prompt-peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields, files, photo }) }));
let err = '';
try {
  proc = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...NOKEYS, COMFY_API_KEY: KEY, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, 'sandbox.env'),
    OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nofilm.json'),
    OPENHIGGSFIELD_COMFY_ROUTER_URL: FAKE, OPENHIGGSFIELD_ROUTER_RETRY_SCALE: '0.02', OPENHIGGSFIELD_ROUTING_TIMEOUT_MS: '3000', OPENHIGGSFIELD_MAX_QUEUED: '500' } });
  proc.stderr!.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  const route = 'comfy-router:api-gpt-image-25-flare'; const fl = (f: Record<string, string>) => ({ provider: 'api-gpt-image-25-flare', route, prompt: 'a lighthouse at dusk', ...f });

  // ---- every shape × size on Flare: one call each, the exact size ----
  for (const r of RES) for (const a of SHAPES) { const c0 = calls.length; const s = await post(fl({ types: '["generate"]', aspect: a, imageResolution: r, quality: 'low' })); assert.equal(s.status, 200, `${a} ${r}: ${JSON.stringify(s.body)}`);
    const d = await until(s.body.id); assert.equal(d.status, 'done', `${a} ${r}: ${d.error} ${err.slice(-600)}`); assert.equal(calls.length - c0, 1);
    const b = calls.at(-1)!; assert.equal(b.model, 'openai/gpt-image-2.5-flare'); assert.equal(b.body.size, S.GPT_IMAGE_SIZES[r][a]); assert.equal(b.body.quality, 'low'); assert.equal(b.body.n, 1); assert.equal(b.body.image, undefined); }
  ok('Flare t2i: all 30 shape × size pairs sent exactly (one Router call each)');

  // ---- a tall poster, 2K high, count 2: quote (with the bar's promptBytes) = charge; exact body ----
  { const prompt = 'a vertical film poster, bold title at the top, '.repeat(30); const pb = Buffer.byteLength(prompt);
    const q = await get(`/api/models/quote?model=api-gpt-image-25-flare&aspect=2:3&imageResolution=2K&quality=high&n=2&promptBytes=${Math.ceil(pb / 500) * 500}&route=${route}`); assert.ok(q.credits > 0, JSON.stringify(q));
    const want = P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: 'api-gpt-image-25-flare', tier: 'high', imageRes: '2K', aspect: '2:3', promptBytes: pb, count: 2 }).credits; assert.equal(q.credits, want, 'quote = the shared formula');
    const b0 = (await get('/api/ledger')).balance; const c0 = calls.length; const s = await post(fl({ types: '["generate"]', prompt, aspect: '2:3', imageResolution: '2K', quality: 'high', n: '2', quotedCredits: String(q.credits) })); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(s.body.id); assert.equal(d.status, 'done', `${d.error} ${err.slice(-600)}`); assert.equal(calls.length - c0, 2, 'count 2 = 2 calls');
    for (const c of calls.slice(-2)) assert.deepEqual({ ...c.body, prompt: '<prompt>' }, { prompt: '<prompt>', quality: 'high', size: '1344x2016', n: 1, output_format: 'png' });
    const charged = b0 - (await get('/api/ledger')).balance; assert.equal(charged, q.credits, `quote ${q.credits} = charge ${charged}`);
    const big = await get(`/api/models/quote?model=api-gpt-image-25-flare&aspect=1:1&imageResolution=4K&quality=high&n=1&promptBytes=500&route=${route}`); const small = await get(`/api/models/quote?model=api-gpt-image-25-flare&aspect=21:9&imageResolution=1K&quality=low&n=1&promptBytes=500&route=${route}`);
    assert.ok(big.credits > small.credits, `4K high square ${big.credits} > 1K low 21:9 ${small.credits}`);
    ok(`tall 2K high ×2: body { quality high, size 1344x2016, n 1, output_format png } twice; quote ${q.credits} = charge; 4K high square ${big.credits} vs 1K low 21:9 ${small.credits}`); }

  // ---- an edit with 2 images ----
  { const c0 = calls.length; const s = await post(fl({ types: '["edit"]', aspect: '4:5', imageResolution: '1K', quality: 'med' }), [['image', PNG], ['refs', PNG]]); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(s.body.id); assert.equal(d.status, 'done', `${d.error} ${err.slice(-600)}`); assert.equal(calls.length - c0, 1);
    const b = calls.at(-1)!.body; assert.equal(b.size, '1024x1280'); assert.equal(b.quality, 'medium'); assert.equal(b.image.length, 2);
    const a = await post(fl({ types: '["edit"]', aspect: 'auto' }), [['image', PNG]]); assert.equal(a.status, 200, 'Auto on an edit picks the shape closest to the photo (2026-10-27)');
    await until(a.body.id); // its Router call lands before the next section counts calls
    ok('edit with 2 images: size 1024x1280, quality medium, 2 images inline; Auto picks the photo shape'); }

  // ---- off-list shapes via the API: D5 (user, 2026-10-28) snaps to the closest listed shape / usual quality with a note, one call at the snapped size ----
  for (const [f, re, size] of [[fl({ types: '["generate"]', aspect: '5:7' }), /Made at 3:4, the closest shape/, S.GPT_IMAGE_SIZES['1K']['3:4']], [fl({ types: '["generate"]', aspect: '1:4' }), /closest shape this model offers \(you picked 1:4\)/, null],
    [{ ...fl({ types: '["generate"]', aspect: '9:21' }), provider: 'api-gpt-image', route: 'comfy-router:api-gpt-image' }, /Made at 9:16, the closest shape/, S.GPT_IMAGE_SIZES['1K']['9:16']]] as const) {
    const c0 = calls.length; const s = await post(f as Record<string, string>); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.match(s.body.warnings.join(' '), re);
    const d = await until(s.body.id); assert.equal(d.status, 'done', `${d.error}`); assert.equal(calls.length - c0, 1, 'one Router call'); if (size) assert.equal(calls.at(-1)!.body.size, size); }
  { const c0 = calls.length; const x = await post(fl({ types: '["generate"]', aspect: '1:1', quality: 'xhigh' })); assert.equal(x.status, 400, 'xhigh is no Create Image quality at all: the form refuses it'); assert.match(x.body.error, /Quality xhigh isn't supported/); assert.equal(calls.length, c0); }
  { const q = await J(await fetch(`${B}/api/models/quote?model=api-gpt-image-25-flare&aspect=5:7&route=${route}`)); assert.equal(q.status, 200, JSON.stringify(q.body)); assert.ok(q.body.credits > 0); }
  ok('API (D5): 5:7, 1:4, 9:21 (GPT Image 2) snap to the closest shape with a note, one Router call each; xhigh (no such quality) refused, no call; the quote prices 5:7');

  // ---- prompt peek: the Request row ----
  { const p = await peek(fl({ types: '["generate"]', aspect: '9:16', imageResolution: '4K', quality: 'high', n: '3' })); assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.deepEqual(p.body.request, { model: 'openai/gpt-image-2.5-flare', aspectRatio: null, imageSize: null, images: 0, size: '2160x3840', quality: 'high', n: 1 }); assert.equal(p.body.settings.n, 3);
    const e = await peek(fl({ types: '["edit"]', aspect: '3:4', imageResolution: '2K', quality: 'low' }), { image: 1 }, { width: 640, height: 480 }); assert.equal(e.status, 200, JSON.stringify(e.body));
    assert.equal(e.body.request.size, '1536x2048'); assert.equal(e.body.request.quality, 'low');
    const snap = await peek(fl({ types: '["generate"]', aspect: '5:7' })); assert.equal(snap.status, 200, JSON.stringify(snap.body)); assert.equal(snap.body.request.size, S.GPT_IMAGE_SIZES['1K']['3:4'], 'D5: 5:7 peeks as 3:4');
    ok('peek: request { size 2160x3840, quality high, n 1 } for 9:16 4K high; 1536x2048 on a 3:4 2K edit; 5:7 snaps to 3:4 (D5)'); }
  console.log('ALL OK gpt-image-sizes');
} catch (e) { console.error(err.slice(-3000)); throw e; } finally {
  if (proc?.pid) { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* gone */ } }
  fake.close(); setTimeout(() => process.exit(process.exitCode ?? 0), 300).unref();
}
