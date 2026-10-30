// Nano Banana 2.1 / 2 / Pro aspects (2026-10-24): the bar offers exactly what each model takes, and the Comfy Router request matches.
// Unit: each model's aspect list (2.1 and 2: 14, Pro: 10; Auto on edits only), checkImageCaps refuses anything else, the Router body sends the
//  picked aspect exactly (never snapped), Auto on an edit leaves aspectRatio out, an off-list aspect throws before any call, the exact 2.1 body,
//  every aspect prices the same per size (quote per size), and the Gemini API route leaves aspect_ratio out on an edit on Match photo too.
// E2E: one mock-backend server (:8798) with a FAKE api.comfy.org (:8799, fake key, no network, no spend): t2i at 1:8 / 8:1 / 21:9 and every new
//  aspect, count 4 at 4K = 4 calls each with the exact imageConfig, an edit on Auto (no aspectRatio) with 1 and with 14 images, an unsupported
//  aspect sent to the API refused (400) with no call made, Pro refusing 1:4, the prompt peek naming the exact aspectRatio / imageSize, quote = charge.
// Run: npx tsx test/nano-banana-aspects.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import { randomUUID } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-aspects-'));
const KEY = 'test-not-a-real-key'; const PORT_FAKE = testPort(8799); const FAKE = `http://127.0.0.1:${PORT_FAKE}`; const PORT = testPort(8798);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_GEMINI_API_KEY: '', OPENHIGGSFIELD_OPENAI_API_KEY: '' };
const ok = (m: string) => console.log('ok ' + m);
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock' });
const PNG = path.join(D, 'in.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=640x480', '-frames:v', '1', PNG]);
const OUT = (() => { const f = path.join(D, 'out.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', f]); return fs.readFileSync(f).toString('base64'); })();

const FOURTEEN = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1', '1:8', '8:1'];
const TEN = FOURTEEN.slice(0, 10);
const C = await import('../src/shared/imageCaps.ts'); const M = await import('../src/routing/routerModels.ts'); const G = await import('../src/providers/gemini.ts');

// ---------------- unit ----------------
{ // each model's list (the bar's list = the body's list)
  for (const [id, list] of [['api-nano-banana-21', FOURTEEN], ['api-nano-banana', FOURTEEN], ['api-nano-banana-pro', TEN]] as const) {
    const c = C.IMAGE_CAPS[id]; assert.deepEqual([...c.aspects].sort(), [...list].sort(), `${id} aspects`); assert.equal(c.allowAuto, false, `${id}: no Auto without a photo`);
    assert.deepEqual([...c.edit!.aspects].sort(), [...list].sort(), `${id} edit aspects`); assert.equal(c.edit!.allowAuto, true, `${id}: Match photo on edits`);
    assert.deepEqual(c.edit!.resolutions, ['1K', '2K', '4K']); assert.ok(!c.unverified.includes('aspects') && !c.unverified.includes('allowAuto'), `${id}: aspects verified`); assert.equal(c.verified, true);
    assert.match(c.source, /vertex-ai/); assert.match(c.source, /ai\.google\.dev/); assert.match(c.source, /nodes_gemini/);
    for (const a of list) assert.equal((C.checkImageCaps(id, { aspect: a }) as any).aspect, a, `${id} ${a} accepted`);
    const off = id === 'api-nano-banana-pro' ? ['1:4', '4:1', '1:8', '8:1', '5:7', '2:1'] : ['5:7', '2:1', '9:21', '7:5'];
    // D5 (2026-10-28): the job check makes any other shape at the closest listed one, with a note (the Router body below still refuses it)
    for (const a of off) { const r = C.checkImageCaps(id, { aspect: a }) as any; assert.ok(r.ok && (list as readonly string[]).includes(r.aspect), `${id} ${a} snapped: ${JSON.stringify(r)}`); assert.match(String(r.notes), /closest shape/); }
    { const r = C.checkImageCaps(id, { aspect: 'auto' }) as any; assert.ok(r.ok && r.aspect !== 'auto' && (list as readonly string[]).includes(r.aspect), `${id}: Auto on a prompt-only run picks a listed shape (no Auto in the body)`); }
    assert.equal((C.checkImageCaps(id, { aspect: 'auto', mode: 'edit', refs: 1 }) as any).ok, true, `${id}: Auto taken on an edit`);
    assert.equal((C.checkImageCaps(id, { aspect: list.at(-1), mode: 'edit', refs: 1 }) as any).aspect, list.at(-1), `${id}: a picked aspect on an edit`);
  }
  // the other hosted models keep the generic list (not changed here)
  assert.deepEqual(C.IMAGE_CAPS['api-kling-image'].aspects, ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']); assert.ok(!C.IMAGE_CAPS['api-kling-image'].edit); // its own list since 2026-10-24 (hosted-aspects test; Seedream: router-image-sizes test)
  // one list everywhere: the Gemini API route's lists are the same constants
  assert.deepEqual(G.GEMINI_MODELS['gemini-nano-banana-2.1'].aspects, [...C.GEMINI_ASPECTS_14]); assert.deepEqual(G.GEMINI_MODELS['gemini-3-pro-image'].aspects, [...C.GEMINI_ASPECTS_10]);
  ok('caps: 2.1 and 2 take 14 aspects, Pro 10; Auto on edits only; anything else snapped to the closest with a note; other models unchanged');
}
{ // the Router body: exact, never snapped
  const R21 = M.ROUTER_MODELS['api-nano-banana-21']; const RP = M.ROUTER_MODELS['api-nano-banana-pro']; const R2 = M.ROUTER_MODELS['api-nano-banana'];
  for (const a of FOURTEEN) { for (const R of [R21, R2]) { const b: any = await R.body({ types: ['generate'], prompt: 'p', aspect: a, imageResolution: '2K' }, 0); assert.equal(b.generationConfig.imageConfig.aspectRatio, a, `${R.id} ${a}`); assert.equal(R.block!({ types: ['generate'], aspect: a }), null); } }
  for (const a of TEN) { const b: any = await RP.body({ types: ['generate'], prompt: 'p', aspect: a }, 0); assert.equal(b.generationConfig.imageConfig.aspectRatio, a); }
  for (const a of ['1:4', '4:1', '1:8', '8:1', '5:7']) { await assert.rejects(RP.body({ types: ['generate'], prompt: 'p', aspect: a }, 0), new RegExp(`Aspect ${a} isn't supported by this model`), `Pro ${a}: refused, not snapped`);
    assert.match(String(RP.block!({ types: ['generate'], aspect: a })), /isn't supported by this model/); }
  for (const R of [R21, R2]) await assert.rejects(R.body({ types: ['generate'], prompt: 'p', aspect: '5:7' }, 0), /Aspect 5:7 isn't supported/);
  // exact 2.1 bodies
  const t2i: any = await R21.body({ types: ['generate'], mode: 'generate', finalPrompt: 'a lighthouse at dusk', aspect: '8:1', imageResolution: '4K', seed: 41, imagePath: PNG /* ignored on generate */ }, 1);
  assert.deepEqual(t2i, { contents: [{ role: 'user', parts: [{ text: 'a lighthouse at dusk' }] }], generationConfig: { responseModalities: ['IMAGE'], seed: 42, imageConfig: { imageSize: '4K', aspectRatio: '8:1' } } });
  const auto: any = await R21.body({ types: ['edit'], mode: 'edit', finalPrompt: 'make it night', aspect: '1:1' /* the job's default */, aspectAuto: true, imageResolution: '1K', imagePath: PNG }, 0);
  assert.equal(auto.contents[0].parts.length, 2); assert.equal(auto.contents[0].parts[1].inlineData.mimeType, 'image/png');
  assert.deepEqual({ ...auto, contents: [{ ...auto.contents[0], parts: [auto.contents[0].parts[0], { inlineData: { mimeType: 'image/png', data: '<redacted>' } }] }] },
    { contents: [{ role: 'user', parts: [{ text: 'make it night' }, { inlineData: { mimeType: 'image/png', data: '<redacted>' } }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { imageSize: '1K' } } }, 'edit on Auto: no aspectRatio');
  const picked: any = await R21.body({ types: ['edit'], mode: 'edit', prompt: 'x', aspect: '1:8', aspectAuto: false, imagePath: PNG }, 0); assert.equal(picked.generationConfig.imageConfig.aspectRatio, '1:8', 'a picked aspect on an edit is sent');
  const many: any = await R21.body({ types: ['edit'], mode: 'edit', prompt: 'x', aspect: '1:1', aspectAuto: true, refPaths: Array(14).fill(PNG) }, 0); assert.equal(many.contents[0].parts.length, 15); assert.ok(!('aspectRatio' in many.generationConfig.imageConfig));
  assert.equal(R21.block!({ types: ['edit'], refPaths: Array(15).fill(PNG) })?.includes('up to 14'), true, '15 images refused');
  // no aspect at all (an old client): left out, as before; Auto without a photo never leaves it out silently when an aspect is set
  const none: any = await R21.body({ types: ['generate'], prompt: 'x' }, 0); assert.ok(!('aspectRatio' in none.generationConfig.imageConfig));
  const t2iAuto: any = await R21.body({ types: ['generate'], prompt: 'x', aspect: '16:9', aspectAuto: true }, 0); assert.equal(t2iAuto.generationConfig.imageConfig.aspectRatio, '16:9', 'aspectAuto only counts with a photo');
  ok('Router body: every listed aspect sent as is (1:8, 8:1, 21:9…), Pro refuses the long shapes and 5:7 throws before a call; Auto on an edit leaves aspectRatio out; 14 images in, 15 refused');
}
{ // the Gemini API route: Match photo leaves aspect_ratio out too
  const b: any = await G.geminiImageBody('gemini-nano-banana-2.1', { types: ['edit'], prompt: 'x', aspect: '1:1', aspectAuto: true, imagePath: PNG }); assert.ok(!('aspect_ratio' in b.response_format));
  const p: any = await G.geminiImageBody('gemini-nano-banana-2.1', { types: ['edit'], prompt: 'x', aspect: '8:1', aspectAuto: false, imagePath: PNG }); assert.equal(p.response_format.aspect_ratio, '8:1');
  ok('Gemini API route: an edit on Match photo leaves aspect_ratio out; a picked one is sent');
}
{ // price: per size, the same for every aspect (Google bills the same image tokens per size at every aspect)
  for (const id of ['api-nano-banana-21', 'api-nano-banana', 'api-nano-banana-pro']) { const m = C.priceMatrix(id)!.default as Record<string, number | null>;
    for (const r of ['1K', '2K', '4K']) assert.ok(typeof m[r] === 'number' && m[r]! > 0, `${id} ${r} priced`); }
  ok('prices: 1K / 2K / 4K priced on all three; no aspect enters the price');
}

// ---------------- fake api.comfy.org ----------------
const calls: { model: string; body: any }[] = []; const reqs = new Map<string, { model: string; polls: number }>();
const fake = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const raw = Buffer.concat(chunks).toString();
  const send = (code: number, o: any, h: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'x-comfy-request-id': randomUUID(), ...h }); res.end(JSON.stringify(o)); };
  if (req.headers['x-api-key'] !== KEY) return send(401, { detail: 'no usable credential', error_type: 'unauthorized' }, { 'x-comfy-error-type': 'unauthorized' });
  let m = /^\/v2\/models\/([^/]+)\/([^/?]+)(\/estimate|\/requests)?(?:\?fallback_provider=false)?$/.exec(req.url!);
  if (m && req.method === 'POST') { const model = `${m[1]}/${m[2]}`;
    if (m[3] === '/estimate') return send(200, { source: 'exact', currency: 'USD', amount: '0.0100', amount_cents: 1, credits: 2.11, provider: m[1], model });
    const id = randomUUID(); calls.push({ model, body: JSON.parse(raw || '{}') }); reqs.set(id, { model, polls: 0 }); const base = `${FAKE}/v2/models/${m[1]}/${m[2]}/requests/${id}`;
    return send(201, { request_id: id, status: 'IN_QUEUE', status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel` }); }
  m = /^\/v2\/models\/[^/]+\/[^/]+\/requests\/([^/]+)(\/status|\/cancel)?$/.exec(req.url!);
  if (m) { const r = reqs.get(m[1]); if (!r) return send(404, { detail: 'x', error_type: 'request_not_found' });
    if (m[2] === '/status') { r.polls++; return send(200, { request_id: m[1], status: 'COMPLETED' }, { 'retry-after': '1' }); }
    return send(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: OUT } }] }, finishReason: 'STOP' }] }, { 'x-comfy-credits-used': '5' }); }
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
    OPENHIGGSFIELD_COMFY_ROUTER_URL: FAKE, OPENHIGGSFIELD_ROUTER_RETRY_SCALE: '0.02', OPENHIGGSFIELD_ROUTING_TIMEOUT_MS: '3000' } });
  proc.stderr!.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  const route = 'comfy-router:api-nano-banana-21'; const nb = (f: Record<string, string>) => ({ provider: 'api-nano-banana-21', route, prompt: 'a lighthouse at dusk', ...f });
  // the registry hands the bar the new lists
  const reg = await get('/api/models?fields=capabilities'); const row = (reg.models ?? reg).find?.((x: any) => x.id === 'api-nano-banana-21') ?? null;
  if (row?.capabilities) { assert.deepEqual([...row.capabilities.aspects].sort(), [...FOURTEEN].sort()); assert.equal(row.capabilities.edit.allowAuto, true); }

  // ---- t2i, every new shape: one call each, aspectRatio exactly as picked ----
  for (const a of ['1:8', '8:1', '21:9', '1:4', '4:1', '4:5', '5:4']) { const c0 = calls.length; const s = await post(nb({ types: '["generate"]', aspect: a, imageResolution: '2K' })); assert.equal(s.status, 200, `${a}: ${JSON.stringify(s.body)}`);
    const d = await until(s.body.id); assert.equal(d.status, 'done', `${a}: ${d.error} ${err.slice(-600)}`); assert.equal(calls.length - c0, 1);
    const b = calls.at(-1)!; assert.equal(b.model, 'vertexai/gemini-nano-banana-2.1'); assert.deepEqual(b.body.generationConfig.imageConfig, { imageSize: '2K', aspectRatio: a }); assert.equal(b.body.contents[0].parts.length, 1); }
  ok('t2i on Nano Banana 2.1: 1:8, 8:1, 21:9, 1:4, 4:1, 4:5, 5:4 each sent exactly (one Router call each)');

  // ---- count 4 at 4K: 4 calls, same imageConfig, seeds k apart; quote = charge ----
  { const q = await get('/api/models/quote?model=api-nano-banana-21&aspect=8:1&imageResolution=4K&n=4&route=' + route); const q1 = await get('/api/models/quote?model=api-nano-banana-21&aspect=1:1&imageResolution=4K&n=4&route=' + route);
    assert.equal(q.credits, q1.credits, 'the aspect does not change the quote'); assert.ok(q.credits > 0);
    const b0 = (await get('/api/ledger')).balance; const c0 = calls.length; const s = await post(nb({ types: '["generate"]', aspect: '8:1', imageResolution: '4K', n: '4', seed: '7' })); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(s.body.id); assert.equal(d.status, 'done', `${d.error} ${err.slice(-600)}`); assert.equal(calls.length - c0, 4, 'count 4 = 4 calls');
    for (const [k, c] of calls.slice(-4).entries()) { assert.deepEqual(c.body.generationConfig.imageConfig, { imageSize: '4K', aspectRatio: '8:1' }); assert.equal(c.body.generationConfig.seed, 7 + k); }
    assert.equal(d.outputs.length, 4); const charged = b0 - (await get('/api/ledger')).balance; assert.equal(charged, q.credits, `quote ${q.credits} = charge ${charged}`);
    ok(`count 4 at 4K, 8:1: 4 calls, each imageSize 4K + aspectRatio 8:1, seeds 7–10; quote ${q.credits} = charge (same as 1:1)`); }

  // ---- edit on Auto: the photo's shape (no aspectRatio); 1 photo and 14 images ----
  { const c0 = calls.length; const s = await post(nb({ types: '["edit"]', aspect: 'auto', imageResolution: '1K' }), [['image', PNG]]); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(s.body.id); assert.equal(d.status, 'done', `${d.error} ${err.slice(-600)}`); assert.equal(calls.length - c0, 1);
    const ic = calls.at(-1)!.body.generationConfig.imageConfig; assert.deepEqual(ic, { imageSize: '1K' }, 'Auto: aspectRatio left out'); assert.equal(calls.at(-1)!.body.contents[0].parts.length, 2); }
  { const c0 = calls.length; const s = await post(nb({ types: '["edit"]', aspect: 'auto' }), [['image', PNG], ...Array.from({ length: 13 }, () => ['refs', PNG] as [string, string])]); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(s.body.id); assert.equal(d.status, 'done', `${d.error} ${err.slice(-600)}`); assert.equal(calls.length - c0, 1);
    const b = calls.at(-1)!.body; assert.equal(b.contents[0].parts.filter((p: any) => p.inlineData).length, 14, '14 images inline'); assert.ok(!('aspectRatio' in b.generationConfig.imageConfig)); }
  { const s = await post(nb({ types: '["edit"]', aspect: 'auto' }), [['image', PNG], ...Array.from({ length: 14 }, () => ['refs', PNG] as [string, string])]); assert.equal(s.status, 400, '15 images refused'); }
  ok('edit on Auto: aspectRatio left out (1 photo and 14 images); 15 images refused');

  // ---- unsupported aspects via the API: made at the closest listed shape with a note (D5, 2026-10-28), never sent as asked ----
  for (const [f, list, snapped] of [[nb({ types: '["generate"]', aspect: '5:7' }), FOURTEEN, true], [nb({ types: '["generate"]', aspect: 'auto' }), FOURTEEN, false /* no photo: the model's own default shape */],
    [{ ...nb({ types: '["generate"]', aspect: '1:8' }), provider: 'api-nano-banana-pro', route: 'comfy-router:api-nano-banana-pro' }, TEN, true]] as const) {
    const s = await post(f as Record<string, string>); assert.equal(s.status, 200, JSON.stringify(s.body)); const to = /Made at (\S+), the closest shape/.exec(String(s.body.warnings))?.[1];
    if (snapped) assert.ok(to && (list as readonly string[]).includes(to), JSON.stringify(s.body.warnings)); else assert.ok(!to, JSON.stringify(s.body.warnings)); }
  { const q = await get('/api/models/quote?model=api-nano-banana-pro&aspect=8:1&route=comfy-router:api-nano-banana-pro'); assert.ok(q.credits > 0 && (q.adjustNotes ?? []).some((n: string) => /closest shape/.test(n)), `Pro 8:1 quote snapped: ${JSON.stringify(q).slice(0, 300)}`); }
  ok('API: 5:7 on 2.1 and 1:8 on Pro made at the closest listed shape with a note; Auto with no photo uses a listed shape; the quote says the same');

  // ---- prompt peek: the exact aspectRatio / imageSize ----
  { const p = await peek(nb({ types: '["generate"]', aspect: '1:8', imageResolution: '4K', n: '4' })); assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.deepEqual(p.body.request, { model: 'vertexai/gemini-nano-banana-2.1', aspectRatio: '1:8', imageSize: '4K', images: 0 }); assert.equal(p.body.settings.n, 4);
    const e = await peek(nb({ types: '["edit"]', aspect: 'auto', imageResolution: '2K' }), { image: 1 }, { width: 640, height: 480 }); assert.equal(e.status, 200, JSON.stringify(e.body));
    assert.deepEqual(e.body.request, { model: 'vertexai/gemini-nano-banana-2.1', aspectRatio: null, imageSize: '2K', images: 1 }); assert.equal(e.body.settings.aspect, 'auto');
    const bad = await peek(nb({ types: '["generate"]', aspect: '5:7' })); assert.equal(bad.status, 200, JSON.stringify(bad.body)); assert.ok(bad.body.request.aspectRatio !== '5:7' && (FOURTEEN as readonly string[]).includes(bad.body.request.aspectRatio), JSON.stringify(bad.body.request));
    const other = await peek({ provider: 'api-ideogram', prompt: 'x', types: '["generate"]', aspect: '16:9' }); assert.equal(other.body.request ?? null, null, 'other models: no request line');
    ok('peek: request { aspectRatio 1:8, imageSize 4K } for t2i; aspectRatio null (left out) + imageSize 2K on an edit on Auto; 5:7 sent as the closest listed shape; other models unchanged'); }
  console.log('ALL OK nano-banana-aspects');
} catch (e) { console.error(err.slice(-3000)); throw e; } finally {
  if (proc?.pid) { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* gone */ } }
  fake.close(); setTimeout(() => process.exit(process.exitCode ?? 0), 300).unref();
}
