// Comfy Router image models, batch A (2026-10-24): Seedream 5.0 Pro / Flash, Qwen Image 3.0 / 3.0 Pro, Wan 2.5 match Comfy's Router pages.
// Unit: the shared size table (shared/routerImageSizes.ts) sits inside each model's documented pixel and ratio range, every size is exactly its shape,
//  the bar's lists (imageCaps) are the table's, the Router body sends the exact size for every shape × size, Match photo sends the photo's shape,
//  a shape / size / photo the model can't do is refused before any call (block + body), unsupported fields are gone (sequential_image_generation),
//  the extras (negative prompt, prompt rewrite) go only where documented, the outputs read refusals, and the quote is ≥ the charge derived from the
//  Router / partner price pages for every size × image count (worst reading).
// E2E: one mock-backend server (:8776) with a FAKE api.comfy.org (:8774, fake key, no network, no spend): every model × shape × size sent exactly (one call
//  each), edits with images and on Match photo, quote = charge with images, refusals (400) with zero calls, the prompt peek's Request row.
// Run: npx tsx test/router-image-sizes.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import { randomUUID } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'router-sizes-'));
const KEY = 'test-not-a-real-key'; const PORT_FAKE = testPort(8774); const FAKE = `http://127.0.0.1:${PORT_FAKE}`; const PORT = testPort(8776);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_GEMINI_API_KEY: '', OPENHIGGSFIELD_OPENAI_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_BYTEPLUS_API_KEY: '', ARK_API_KEY: '' };
const ok = (m: string) => console.log('ok ' + m);
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock' });
const png = (w: number, h: number, c = 'blue') => { const f = path.join(D, `in-${w}x${h}.png`); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${c}:s=${w}x${h}`, '-frames:v', '1', f]); return f; };
const PNG = png(640, 480); const TALL = png(300, 2700); /* 1:9: inside Seedream's 16:1, past Qwen's 8:1 */ const OUTB = fs.readFileSync(png(64, 64, 'red'));

const S = await import('../src/shared/routerImageSizes.ts'); const C = await import('../src/shared/imageCaps.ts'); const M = await import('../src/routing/routerModels.ts');
const H = await import('../src/shared/hostedPrices.ts'); const P = await import('../src/shared/pricing.ts'); const Cat = await import('../src/shared/modelCatalog.ts');
const SHAPES = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
type Fam = 'seedream' | 'qwen' | 'wan';
/** Per model: the Router id, family, sizes, image limit and the price pages' figures (Comfy credits) — Source URLs in shared/routerImageSizes.ts and hostedPrices.ts. */
const MODELS: { id: string; rid: string; fam: Fam; res: ('1K' | '2K')[]; maxRefs: number; minPx: number; maxPx: number; maxRatio: number;
  /** derived charge per output (Comfy credits), worst reading of the Router and partner pages */ charge: (px: number, refs: number) => number }[] = [
  // Router page 9.495 (Standard) / 18.99 (Large); partner page 9.50 (1K ≤ 2.61 MP) / 18.99; refs: Router 0.633 after the first, partner every image beyond the first (outputs + inputs)
  { id: 'api-seedream', rid: 'byteplus/seedream-5-0-pro-260628', fam: 'seedream', res: ['1K', '2K'], maxRefs: 10, minPx: 1_048_576, maxPx: 4_194_304, maxRatio: 16, charge: (px, r) => (px <= 2_610_000 ? 9.5 : 18.99) + 0.633 * r },
  { id: 'api-seedream-flash', rid: 'byteplus/seedream-5-0-flash-260915', fam: 'seedream', res: ['1K', '2K'], maxRefs: 10, minPx: 921_600, maxPx: 4_624_220, maxRatio: 16, charge: (_px, r) => 5.4311 + 0.633 * r },
  // Router page: qwen-image-3.0 9.0519 at 1K and 2K, 3.0-pro 12.0692 / 22.6297 (partner page: 1K ≤ 2.25 MP); 0.9052 per input image
  { id: 'api-qwen-image', rid: 'qwen/qwen-image-3.0', fam: 'qwen', res: ['1K', '2K'], maxRefs: 3, minPx: 262_144, maxPx: 6_553_600, maxRatio: 8, charge: (_px, r) => 9.0519 + 0.9052 * r },
  { id: 'api-qwen-image-pro', rid: 'qwen/qwen-image-3.0-pro', fam: 'qwen', res: ['1K', '2K'], maxRefs: 3, minPx: 262_144, maxPx: 6_553_600, maxRatio: 8, charge: (px, r) => (px <= 2_250_000 ? 12.0692 : 22.6297) + 0.9052 * r },
  // Router page: wan2.5-t2i-preview 6.33 per generation (n 1)
  { id: 'api-wan-image', rid: 'wan/wan2.5-t2i-preview', fam: 'wan', res: ['1K'], maxRefs: 0, minPx: 1_638_400, maxPx: 2_073_600, maxRatio: 4, charge: () => 6.33 },
];
const sizeOf = (fam: Fam, b: any) => (fam === 'seedream' ? b.size : b.parameters.size);
const imagesOf = (fam: Fam, b: any) => (fam === 'seedream' ? (b.image ?? []).length : fam === 'qwen' ? b.input.messages[0].content.filter((c: any) => c.image).length : 0);

// ---------------- unit ----------------
{ // the size table: inside each documented range, exact shape, ×16, tiers line up with the price split
  for (const m of MODELS) { const r = S.ROUTER_SIZE_RULES[m.id]; assert.equal(r.model, m.rid); assert.equal(r.minPx, m.minPx); assert.equal(r.maxPx, m.maxPx); assert.equal(r.maxRatio, m.maxRatio);
    assert.deepEqual(S.routerSizeResolutions(m.id), m.res); assert.match(r.source, /^https:\/\/docs\.comfy\.org\/development\/comfy-router\/models\//);
    for (const res of m.res) { assert.deepEqual(Object.keys(S.ROUTER_SIZE_TABLE[m.id][res]!).sort(), [...SHAPES].sort());
      for (const a of SHAPES) { const s = S.routerImageSize(m.id, a, res)!; const { width: w, height: h } = S.routerWH(s); const [x, y] = a.split(':').map(Number);
        assert.equal(s.includes(m.fam === 'seedream' ? 'x' : '*'), true, `${m.id} separator`); assert.ok(w % 16 === 0 && h % 16 === 0, `${s} ×16`); assert.equal(w * y, h * x, `${m.id} ${a} ${res} → ${s} is exactly ${a}`);
        assert.ok(w * h >= m.minPx && w * h <= m.maxPx, `${m.id} ${s}: ${w * h} px inside ${m.minPx}…${m.maxPx}`);
        if (res === '1K') assert.ok(w * h >= (m.fam === 'wan' ? 1_638_400 : 1024 * 1024), `${s} ≥ the 1K floor`); else assert.ok(w * h <= 2048 * 2048, `${s} ≤ 2048²`);
        if (r.tierPx) assert.equal(S.routerSizeTier(m.id, s), res, `${m.id} ${s} bills as ${res}`); } }
    assert.equal(S.routerImageSize(m.id, '1:4', '1K'), null); assert.equal(S.routerImageSize(m.id, '1:1', '4K'), null); }
  assert.equal(S.routerImageSize('api-seedream', '16:9', '2K'), '2560x1440'); assert.equal(S.routerImageSize('api-qwen-image', '21:9', '1K'), '1568*672'); assert.equal(S.routerImageSize('api-wan-image', '1:1', '1K'), '1280*1280');
  // Match photo: the photo's shape (±1%), the size's area, inside the range; past the ratio limit → null
  for (const m of MODELS.filter((x) => x.maxRefs)) for (const res of m.res) for (const [w, h] of [[640, 480], [4000, 3000], [1080, 1920], [333, 1000], [5000, 1000], [1000, 7000]]) {
    const s = S.routerPhotoSize(m.id, res, { width: w, height: h }); if (Math.max(w / h, h / w) > m.maxRatio) { assert.equal(s, null); continue; }
    assert.ok(s, `${m.id} ${res} ${w}x${h}`); const o = S.routerWH(s!); assert.ok(Math.abs(o.width / o.height / (w / h) - 1) <= 0.0101, `${s} keeps ${w}x${h}`); assert.ok(o.width * o.height >= m.minPx && o.width * o.height <= m.maxPx);
    if (S.ROUTER_SIZE_RULES[m.id].tierPx) assert.equal(S.routerSizeTier(m.id, s!), res, `${m.id} match photo ${s} bills as ${res}`); }
  assert.equal(S.routerPhotoSize('api-qwen-image', '1K', { width: 1000, height: 9000 }), null, 'Qwen: past 1:8'); assert.equal(S.routerPhotoSize('api-seedream', '1K', null), null);
  ok('size table: 5 models × 10 shapes × their sizes, each exactly its shape, ×16, inside the documented pixel range; tiers match the price split; Match photo keeps the photo shape');
}
{ // caps: the bar's lists = the table; Auto only on an edit (Match photo); extras where documented
  for (const m of MODELS) { const c = C.IMAGE_CAPS[m.id];
    assert.deepEqual([...c.aspects].sort(), [...SHAPES].sort()); assert.deepEqual(c.resolutions, m.res); assert.equal(c.allowAuto, false); assert.equal(c.verified, true);
    assert.equal(c.supports.maxRefs, m.maxRefs); assert.ok(!c.unverified.includes('aspects') && !c.unverified.includes('resolutions') && !c.unverified.includes('maxRefs'));
    assert.match(c.source, /comfy-router\/models/); assert.match(c.source, /pricing/);
    if (m.maxRefs) { assert.equal(c.edit!.allowAuto, true); assert.deepEqual([...c.edit!.aspects].sort(), [...SHAPES].sort()); assert.deepEqual(c.edit!.resolutions, m.res);
      assert.equal((C.checkImageCaps(m.id, { aspect: 'auto', mode: 'edit', refs: 1 }) as any).ok, true, `${m.id}: Match photo on an edit`); } else assert.equal(c.edit, undefined);
    { const r = C.checkImageCaps(m.id, { aspect: 'auto' }) as any; assert.ok(r.ok && r.aspect !== 'auto', `${m.id}: Auto without a photo picks a listed shape`); }
    for (const a of SHAPES) for (const r of m.res) assert.equal((C.checkImageCaps(m.id, { aspect: a, imageResolution: r }) as any).ok, true);
    for (const a of ['1:4', '5:7', '9:21']) { const k = C.checkImageCaps(m.id, { aspect: a }) as any; assert.equal(k.ok, true, JSON.stringify(k)); assert.notEqual(k.aspect, a); assert.match(k.notes[0], /closest shape this model offers/); } // D5: snapped with a note
    { const k = C.checkImageCaps(m.id, { aspect: '1:1', imageResolution: '4K' }) as any; assert.equal(k.ok, true); assert.ok(m.res.includes(k.imageResolution), `${m.id}: 4K → the nearest size`); }
    assert.equal((C.checkImageCaps(m.id, { aspect: '1:1', refs: m.maxRefs + 1, mode: 'edit' }) as any).ok, false, `${m.id}: ${m.maxRefs + 1} images refused`);
    assert.deepEqual(c.extras ? { n: !!c.extras.negativePrompt, r: !!c.extras.promptRewrite } : null, m.fam === 'seedream' ? null : { n: true, r: true }, `${m.id} extras`);
    const desc = Cat.MODEL_CATALOG?.[m.id]?.description ?? (Cat as any).catalogFor?.('create-image', m.id)?.description; if (desc) { assert.doesNotMatch(desc, /Model Studio/, `${m.id}: runs on Comfy Router`); assert.ok(desc.length <= 120, `${m.id} description short`); } }
  ok('caps: 10 shapes × each model\'s sizes, verified; Match photo on edits (Seedream, Qwen), none on Wan (text to image); 1:4, 5:7, 4K, too many images refused; negative prompt / rewrite on Qwen and Wan only');
}
{ // the Router body: exact size per shape × size; unsupported fields gone; Match photo; refusals throw (no call)
  for (const m of MODELS) { const R = M.ROUTER_MODELS[m.id]; assert.equal(R.id, m.rid); assert.equal(R.maxRefs, m.maxRefs);
    for (const a of SHAPES) for (const r of m.res) { const i = { types: ['generate'], prompt: 'p', aspect: a, imageResolution: r, seed: 5 }; const b: any = await R.body(i, 1);
      assert.equal(sizeOf(m.fam, b), S.routerImageSize(m.id, a, r)); assert.equal(R.block!(i), null); }
    for (const [a, r, re] of [['1:4', '1K', /Aspect 1:4 isn't supported/], ['5:7', '1K', /Aspect 5:7 isn't supported/], ['1:1', '4K', /Resolution 4K isn't offered/]] as const) {
      await assert.rejects(R.body({ types: ['generate'], prompt: 'p', aspect: a, imageResolution: r }, 0), re); assert.match(String(R.block!({ types: ['generate'], aspect: a, imageResolution: r })), re); }
    if (m.maxRefs) { const e: any = await R.body({ types: ['edit'], prompt: 'p', aspect: '1:1', aspectAuto: true, imageResolution: '1K', refPaths: [PNG] }, 0); assert.equal(sizeOf(m.fam, e), S.routerPhotoSize(m.id, '1K', { width: 640, height: 480 }));
      assert.equal(imagesOf(m.fam, e), 1); const p: any = await R.body({ types: ['edit'], prompt: 'p', aspect: '9:16', aspectAuto: false, imageResolution: '2K', refPaths: Array(m.maxRefs).fill(PNG) }, 0);
      assert.equal(sizeOf(m.fam, p), S.routerImageSize(m.id, '9:16', '2K'), 'a picked shape on an edit is sent'); assert.equal(imagesOf(m.fam, p), m.maxRefs);
      assert.match(String(R.block!({ types: ['edit'], refPaths: Array(m.maxRefs + 1).fill(PNG) })), new RegExp(`up to ${m.maxRefs}`)); }
    else assert.match(String(R.block!({ types: ['edit'], refPaths: [PNG] })), /prompt only/); }
  // Qwen: a 1:9 photo is past its 8:1 range → Match photo refused (block + body), never guessed
  await assert.rejects(M.ROUTER_MODELS['api-qwen-image'].body({ types: ['edit'], prompt: 'p', aspectAuto: true, refPaths: [TALL] }, 0), /Match photo/); assert.match(String(M.ROUTER_MODELS['api-qwen-image'].block!({ types: ['edit'], aspectAuto: true, refPaths: [TALL] })), /Match photo/);
  assert.ok(M.ROUTER_MODELS['api-seedream'].block!({ types: ['edit'], aspectAuto: true, refPaths: [TALL] }) === null, 'Seedream takes 1:9 (up to 16:1)');
  // exact bodies
  const sp: any = await M.ROUTER_MODELS['api-seedream'].body({ types: ['generate'], finalPrompt: 'a lighthouse', aspect: '16:9', imageResolution: '2K', seed: 41 }, 1);
  assert.deepEqual(sp, { prompt: 'a lighthouse', size: '2560x1440', seed: 42, response_format: 'url', output_format: 'png', watermark: false }, 'Seedream Pro: no sequential_image_generation, no guidance_scale');
  const sf: any = await M.ROUTER_MODELS['api-seedream-flash'].body({ types: ['edit'], prompt: 'night', aspect: '4:5', imageResolution: '1K', refPaths: [PNG, PNG] }, 0);
  assert.deepEqual({ ...sf, image: sf.image.map(() => '<img>') }, { prompt: 'night', size: '960x1200', response_format: 'url', output_format: 'png', watermark: false, image: ['<img>', '<img>'] }); assert.match(sf.image[0], /^data:image\/png;base64,/);
  const q: any = await M.ROUTER_MODELS['api-qwen-image-pro'].body({ types: ['edit'], prompt: 'add a hat', aspect: '3:4', imageResolution: '2K', refPaths: [PNG], seed: 3, negativePrompt: '  blurry  ', promptRewrite: true }, 0);
  assert.deepEqual({ ...q, input: { messages: [{ ...q.input.messages[0], content: q.input.messages[0].content.map((c: any) => (c.image ? { image: '<img>' } : c)) }] } },
    { input: { messages: [{ role: 'user', content: [{ image: '<img>' }, { text: 'add a hat' }] }] }, parameters: { n: 1, size: '1728*2304', seed: 3, prompt_extend: true, watermark: false, negative_prompt: 'blurry' } });
  const q0: any = await M.ROUTER_MODELS['api-qwen-image'].body({ types: ['generate'], prompt: 'x' }, 0); assert.deepEqual(q0.parameters, { n: 1, size: '1024*1024', prompt_extend: false, watermark: false }, 'Qwen: rewrite off by default, no shape = 1:1');
  const w: any = await M.ROUTER_MODELS['api-wan-image'].body({ types: ['generate'], prompt: 'a fox', aspect: '21:9', negativePrompt: 'text', seed: 9 }, 0);
  assert.deepEqual(w, { input: { prompt: 'a fox', negative_prompt: 'text' }, parameters: { n: 1, size: '2016*864', seed: 9, prompt_extend: false, watermark: false } });
  const long = 'x'.repeat(801); await assert.rejects(M.ROUTER_MODELS['api-wan-image'].body({ types: ['generate'], prompt: long, aspect: '1:1' }, 0), /up to 800 characters/);
  assert.match(String(M.ROUTER_MODELS['api-wan-image'].block!({ types: ['generate'], prompt: long, aspect: '1:1' })), /up to 800 characters; yours is 801/); assert.equal(M.ROUTER_MODELS['api-wan-image'].block!({ types: ['generate'], prompt: 'x'.repeat(800), aspect: '1:1' }), null);
  // outputs: refusals in a 200
  assert.deepEqual(M.ROUTER_MODELS['api-seedream'].outputs({ error: { code: 'OutputImageSensitiveContentDetected', message: 'blocked' } }), { refused: 'blocked' });
  assert.deepEqual(M.ROUTER_MODELS['api-qwen-image'].outputs({ output: { choices: [{ message: { content: [{ text: 'I cannot draw that' }] } }] } }), { refused: 'I cannot draw that' });
  assert.deepEqual(M.ROUTER_MODELS['api-qwen-image'].outputs({ output: { choices: [{ message: { content: [{ image: 'https://x.invalid/a.png' }] } }] } }), [{ url: 'https://x.invalid/a.png' }]);
  assert.deepEqual(M.ROUTER_MODELS['api-wan-image'].outputs({ code: 'DataInspectionFailed', message: 'input blocked' }), { refused: 'input blocked' });
  assert.deepEqual(M.ROUTER_MODELS['api-wan-image'].outputs({ output: { task_status: 'SUCCEEDED', results: [{ code: 'DataInspectionFailed', message: 'rejected' }] } }), { refused: 'rejected' });
  assert.deepEqual(M.ROUTER_MODELS['api-wan-image'].outputs({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://x.invalid/w.png' }] } }), [{ url: 'https://x.invalid/w.png' }]);
  ok('Router body: every shape × size sent exactly; 1:4 / 5:7 / 4K throw before a call; Match photo = the photo\'s shape (Qwen refuses a 1:9 photo); exact Seedream / Qwen / Wan bodies; no sequential_image_generation; Wan 800-char limit; refusals read');
}
{ // quote ≥ the derived charge for every size × image count; n × per image; rounded up
  let rows = 0;
  for (const m of MODELS) for (const res of m.res) for (const a of SHAPES) for (let refs = 0; refs <= m.maxRefs; refs++) { const { width, height } = S.routerWH(S.routerImageSize(m.id, a, res)!);
    const derivedUsd = m.charge(width * height, refs) / 211; const cr = P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: m.id, imageRes: res, refImages: refs }).credits;
    assert.ok(cr * 0.01 >= derivedUsd - 1e-9, `${m.id} ${res} ${a} ${refs} images: quote ${cr} < $${derivedUsd.toFixed(5)}`); assert.ok(cr * 0.01 - derivedUsd < 0.01 + 1e-9, `${m.id}: rounded up by under a credit`); rows++; }
  for (const m of MODELS) assert.equal(P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: m.id, imageRes: m.res.at(-1), count: 4, refImages: m.maxRefs }).credits, 4 * P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: m.id, imageRes: m.res.at(-1), refImages: m.maxRefs }).credits);
  // the figures: Seedream Pro 1K 9.50 → 5 credits, + 10 images (6.33) → 8; Qwen Pro 2K 22.6297 + 3 × 0.9052 → 13; Wan 6.33 → 3
  const at = (id: string, res: string, refImages = 0) => P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: id, imageRes: res, refImages }).credits;
  assert.equal(at('api-seedream', '1K'), 5); assert.equal(at('api-seedream', '1K', 10), 8); assert.equal(at('api-seedream', '2K', 1), 10); assert.equal(at('api-seedream-flash', '2K', 10), 6);
  assert.equal(at('api-qwen-image', '2K', 3), 6); assert.equal(at('api-qwen-image-pro', '2K', 3), 13); assert.equal(at('api-qwen-image-pro', '1K'), 6); assert.equal(at('api-wan-image', '1K'), 3);
  assert.equal(H.HOSTED_BY_ID['api-seedream'].refImages!.free, 0, 'Seedream Pro: every input image quoted');
  ok(`quote ≥ derived charge on ${rows} size × shape × image-count rows (5 models), rounded up by under a credit; n × per image`);
}

// ---------------- fake api.comfy.org ----------------
const calls: { model: string; body: any }[] = []; const reqs = new Map<string, { model: string }>();
const reply = (model: string, id: string) => (model.startsWith('byteplus/') ? { created: 1, data: [{ url: `${FAKE}/assets/${id}.png`, size: '1024x1024' }], usage: { generated_images: 1 } }
  : model.startsWith('qwen/') ? { output: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: [{ image: `${FAKE}/assets/${id}.png` }] } }] }, request_id: id, usage: { output_image_count: 1 } }
  : { output: { task_id: id, task_status: 'SUCCEEDED', results: [{ url: `${FAKE}/assets/${id}.png` }] }, request_id: id, usage: { image_count: 1 } });
const fake = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const raw = Buffer.concat(chunks).toString();
  if (req.url!.startsWith('/assets/')) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(OUTB); }
  const send = (code: number, o: any, h: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'x-comfy-request-id': randomUUID(), ...h }); res.end(JSON.stringify(o)); };
  if (req.headers['x-api-key'] !== KEY) return send(401, { detail: 'no usable credential', error_type: 'unauthorized' }, { 'x-comfy-error-type': 'unauthorized' });
  let m = /^\/v2\/models\/([^/]+)\/([^/?]+)(\/estimate|\/requests)?(?:\?fallback_provider=false)?$/.exec(req.url!);
  if (m && req.method === 'POST') { const model = `${m[1]}/${m[2]}`;
    if (m[3] === '/estimate') return send(200, { source: 'exact', currency: 'USD', amount: '0.0100', amount_cents: 1, credits: 2.11, provider: m[1], model });
    const id = randomUUID(); calls.push({ model, body: JSON.parse(raw || '{}') }); reqs.set(id, { model }); const base = `${FAKE}/v2/models/${m[1]}/${m[2]}/requests/${id}`;
    return send(201, { request_id: id, status: 'IN_QUEUE', status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel` }); }
  m = /^\/v2\/models\/[^/]+\/[^/]+\/requests\/([^/]+)(\/status|\/cancel)?$/.exec(req.url!);
  if (m) { const r = reqs.get(m[1]); if (!r) return send(404, { detail: 'x', error_type: 'request_not_found' });
    if (m[2] === '/status') return send(200, { request_id: m[1], status: 'COMPLETED' }, { 'retry-after': '1' });
    return send(200, reply(r.model, m[1]), { 'x-comfy-credits-used': '5' }); }
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
  const f = (id: string, x: Record<string, string>) => ({ provider: id, route: `comfy-router:${id}`, prompt: 'a lighthouse at dusk', ...x });
  const run = async (id: string, x: Record<string, string>, files: [string, string][] = [], n = 1) => { const c0 = calls.length; const s = await post(f(id, x), files); assert.equal(s.status, 200, `${id} ${JSON.stringify(x)}: ${JSON.stringify(s.body)}`);
    const d = await until(s.body.id); assert.equal(d.status, 'done', `${id}: ${d.error} ${err.slice(-800)}`); assert.equal(calls.length - c0, n, `${id}: ${n} Router call(s)`); return { s, d, bodies: calls.slice(-n) }; };

  // ---- every model × shape × size: one call each, the exact size ----
  let runs = 0;
  for (const m of MODELS) for (const r of m.res) for (const a of SHAPES) { const { bodies: [b] } = await run(m.id, { types: '["generate"]', aspect: a, imageResolution: r });
    assert.equal(b.model, m.rid); assert.equal(sizeOf(m.fam, b.body), S.routerImageSize(m.id, a, r)); assert.equal(b.body.sequential_image_generation, undefined); runs++; }
  ok(`t2i: all ${runs} model × shape × size pairs sent exactly (one Router call each)`);

  // ---- edits: images inline, Match photo (the photo's shape), quote = charge with images ----
  for (const m of MODELS.filter((x) => x.maxRefs)) { const imgs: [string, string][] = [['image', PNG], ...Array.from({ length: m.maxRefs - 1 }, () => ['refs', PNG] as [string, string])];
    const q = await get(`/api/models/quote?model=${m.id}&aspect=auto&imageResolution=2K&n=2&mode=edit&refs=${m.maxRefs}&route=comfy-router:${m.id}`); assert.ok(q.credits > 0, JSON.stringify(q));
    const want = P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: m.id, imageRes: '2K', refImages: m.maxRefs, count: 2 }).credits; assert.equal(q.credits, want, `${m.id}: quote = the shared price`);
    const b0 = (await get('/api/ledger')).balance; const { bodies } = await run(m.id, { types: '["edit"]', aspect: 'auto', imageResolution: '2K', n: '2', quotedCredits: String(q.credits) }, imgs, 2);
    for (const b of bodies) { assert.equal(sizeOf(m.fam, b.body), S.routerPhotoSize(m.id, '2K', { width: 640, height: 480 }), `${m.id}: Match photo`); assert.equal(imagesOf(m.fam, b.body), m.maxRefs); }
    assert.equal(b0 - (await get('/api/ledger')).balance, q.credits, `${m.id}: charge = quote`);
    const { bodies: [p] } = await run(m.id, { types: '["edit"]', aspect: '21:9', imageResolution: '1K' }, [['image', PNG]]); assert.equal(sizeOf(m.fam, p.body), S.routerImageSize(m.id, '21:9', '1K'), `${m.id}: a picked shape on an edit`); }
  ok('edits: Seedream Pro / Flash (10 images) and Qwen 3.0 / Pro (3) on Match photo send the photo\'s shape at 2K, ×2 = 2 calls, quote = charge; a picked 21:9 edit is sent as 21:9');

  // ---- extras: Qwen and Wan take a negative prompt and the rewrite switch; Seedream refuses them ----
  { const { bodies: [b] } = await run('api-qwen-image', { types: '["generate"]', aspect: '1:1', negativePrompt: 'watermark, text', promptRewrite: '1' }); assert.equal(b.body.parameters.negative_prompt, 'watermark, text'); assert.equal(b.body.parameters.prompt_extend, true);
    const { bodies: [w] } = await run('api-wan-image', { types: '["generate"]', aspect: '9:16', negativePrompt: 'blur' }); assert.equal(w.body.input.negative_prompt, 'blur'); assert.equal(w.body.parameters.prompt_extend, false); assert.equal(w.body.parameters.size, '1008*1792'); }
  ok('extras: Qwen negative_prompt + prompt_extend on; Wan negative_prompt, prompt_extend off by default');

  // ---- refusals: 400, no call ----
  for (const [id, x, re, files] of [
    /* D5 (2026-10-28): an unsupported shape (Seedream 1:4) or size (Seedream Flash 4K, Wan 2K) snaps to the nearest one with a note, so they aren't refused any more */
    ['api-wan-image', { types: '["generate"]', aspect: '1:1', prompt: 'y'.repeat(801) }, /up to 800 characters/, []],
    ['api-seedream', { types: '["generate"]', aspect: '1:1', negativePrompt: 'blur' }, /no negative prompt/, []], ['api-seedream-flash', { types: '["generate"]', aspect: '1:1', promptRewrite: '1' }, /no prompt rewrite/, []],
    ['api-qwen-image', { types: '["generate"]', aspect: '1:1', negativePrompt: 'z'.repeat(501) }, /up to 500 characters/, []],
    ['api-qwen-image', { types: '["edit"]', aspect: '1:1' }, /up to 3 images/, [['image', PNG], ['refs', PNG], ['refs', PNG], ['refs', PNG]]],
    ['api-qwen-image', { types: '["edit"]', aspect: 'auto' }, /Match photo/, [['image', TALL]]],
  ] as [string, Record<string, string>, RegExp, [string, string][]][]) {
    const c0 = calls.length; const s = await post(f(id, x), files); if (s.status === 200) { const d = await until(s.body.id); assert.notEqual(d.status, 'done', `${id} ${JSON.stringify(x)} should be refused`); assert.match(String(d.error ?? d.reason ?? ''), re); }
    else { assert.ok(s.status >= 400, JSON.stringify(s.body)); assert.match(String(s.body.error ?? s.body.message ?? JSON.stringify(s.body)), re, `${id}: ${JSON.stringify(s.body)}`); }
    assert.equal(calls.length, c0, `${id} ${JSON.stringify(x).slice(0, 80)}: no Router call`); }
  { const q = await J(await fetch(`${B}/api/models/quote?model=api-seedream&aspect=1:4&route=comfy-router:api-seedream`)); assert.equal(q.status, 200, JSON.stringify(q.body).slice(0, 300)); assert.notEqual(q.body.aspect, '1:4'); }
  ok('refusals with zero Router calls: Wan 801-char prompt, negative prompt / rewrite on Seedream, a 501-char negative prompt, 4 images on Qwen, a 1:9 photo on Qwen Match photo; 1:4 / 4K / Wan 2K now snap (D5), the quote too');

  // ---- prompt peek: the Request row ----
  { const p = await peek(f('api-seedream', { types: '["generate"]', aspect: '2:3', imageResolution: '2K' })); assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.deepEqual(p.body.request, { model: 'byteplus/seedream-5-0-pro-260628', aspectRatio: null, imageSize: null, images: 0, size: '1664x2496' });
    const e = await peek(f('api-qwen-image-pro', { types: '["edit"]', aspect: 'auto', imageResolution: '1K', negativePrompt: 'blur' }), { image: 1 }, { width: 640, height: 480 }); assert.equal(e.status, 200, JSON.stringify(e.body));
    assert.deepEqual(e.body.request, { model: 'qwen/qwen-image-3.0-pro', aspectRatio: null, imageSize: null, images: 1, size: S.routerPhotoSize('api-qwen-image-pro', '1K', { width: 640, height: 480 })!, n: 1, promptRewrite: false, negativePrompt: 'blur' });
    const w = await peek(f('api-wan-image', { types: '["generate"]', aspect: '16:9', promptRewrite: '1' })); assert.equal(w.body.request.size, '1792*1008'); assert.equal(w.body.request.promptRewrite, true);
    ok('peek: Seedream 2:3 2K → size 1664x2496; Qwen Pro edit on Match photo → the photo\'s shape, negative prompt shown; Wan 16:9 → 1792*1008, prompt_extend on'); }
  console.log('ALL OK router-image-sizes');
} catch (e) { console.error(err.slice(-3000)); throw e; } finally {
  if (proc?.pid) { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* gone */ } }
  fake.close(); setTimeout(() => process.exit(process.exitCode ?? 0), 300).unref();
}
