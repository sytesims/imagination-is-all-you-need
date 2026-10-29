// Product Shot QA fixes (2026-10-23), own mock server :9187, temp data dir, no keys, no network:
//  #1 Auto on an API model (no Auto aspect of its own): the app picks the closest listed shape (or the default); it quotes and runs. Was: the quote refused with the SAME 400 as the
//     submit, on the app and on Create Image itself; the bar's default for that model (modelInfo.defaultAspect) quotes and runs at the same price;
//     a local model that takes Auto still quotes and runs with Auto.
//  #4 no product photo and no description → 400 required (plain message); a photo alone or a description alone runs.
//  #16 a model that can't do the mode is named by its display name, never its id.
//  #17 /api/tools lists every scene the server accepts (one list: tools/appRows.ts PRODUCT_SCENES).
// Run: npx tsx test/product-shot-shape.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { PRODUCT_SCENES } from '../src/tools/appRows.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9187); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'pshot-'));
const ok = (m: string) => console.log('ok ' + m);
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1' }, stdio: 'ignore', detached: true });
const IMG = fs.readFileSync(path.join(ROOT, 'samples/sample-keyframe.png'));
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
const submit = async (tool: string, f: Record<string, string>, withImage = false) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  if (withImage) fd.append('image', new Blob([IMG], { type: 'image/png' }), 'image.png');
  const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const same = (q: any, s: any, what: string) => { assert.equal(q.status, 400, `${what} quote: ${JSON.stringify(q.body).slice(0, 200)}`); assert.equal(s.status, 400, `${what} submit: ${JSON.stringify(s.body).slice(0, 200)}`);
  assert.equal(q.body.error, s.body.error, `${what}: same message`); assert.equal(q.body.code, s.body.code, `${what}: same code`); assert.equal(q.body.issues?.[0]?.field, s.body.issues?.[0]?.field, `${what}: same field`); };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const wf = (await get('/api/image-workflows')).body.workflows.find((w: any) => w.id === 'product-shot');
  // Nano Banana edits follow the photo since 2026-10-23 (imageCaps editAny: edit offers Auto), so the no-Auto API model here is GPT Image 2 (no Auto in either mode)
  { const nb = wf.modelInfo['api-nano-banana']; assert.ok(!nb.aspects.generate.includes('auto') && nb.aspects.edit.includes('auto'), 'Nano Banana: no Auto for text-to-image, Auto (follow the photo) for edits'); }
  const API = 'api-gpt-image'; const mi = wf.modelInfo[API];
  assert.ok(!mi.aspects.generate.includes('auto') && !mi.aspects.edit.includes('auto'), 'an API model offers no Auto'); assert.equal(mi.defaultAspect, '1:1');
  assert.deepEqual(wf.prompt.requiredWithout, { slot: 'image', missing: 'Add a photo or text' });
  ok(`/api/image-workflows: ${API} shapes ${mi.aspects.generate.join(' ')} (default ${mi.defaultAspect}); the bar blocks with no photo and no text`);

  // #1 (2026-10-27): Auto on an API model means "the app picks": the shape closest to the photo, else the model's default. Never "Not for these settings".
  for (const photo of [false, true]) {
    const q = await get(`/api/tools/app-product-shot/price?provider=${API}&aspect=auto&scene=marble${photo ? '&image=1' : ''}`); assert.equal(q.status, 200, JSON.stringify(q.body).slice(0, 200)); assert.ok(q.body.credits > 0);
    const s = await submit('app-product-shot', { provider: API, aspect: 'auto', scene: 'marble', prompt: 'a glass bottle' }, photo); assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 300));
    assert.equal(s.body.cost, q.body.credits, `Product Shot Auto${photo ? ' + photo' : ''}: charged = quoted`);
  }
  { const q = await get(`/api/tools/create-image/price?provider=${API}&aspect=auto&types=${encodeURIComponent('["generate"]')}`); assert.equal(q.status, 200, 'Create Image Auto quotes'); }
  ok('Auto on an API model: the app picks the shape; quote = charge');
  // the bar's default shape for that model: priced, runs, charged what was quoted
  for (const photo of [false, true]) {
    const q = await get(`/api/tools/app-product-shot/price?provider=${API}&aspect=${mi.defaultAspect}${photo ? '&image=1' : ''}`); assert.equal(q.status, 200, JSON.stringify(q.body).slice(0, 200)); assert.ok(q.body.credits > 0);
    const s = await submit('app-product-shot', { provider: API, aspect: mi.defaultAspect, prompt: photo ? '' : 'a glass bottle' }, photo); assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 300));
    assert.equal(s.body.cost, q.body.credits, `charged ${s.body.cost} = quoted ${q.body.credits}`);
  }
  ok(`default shape ${mi.defaultAspect}: quote = charge, runs with and without a photo`);
  // a model that does take Auto keeps it
  { const L = wf.models.generate.find((p: string) => wf.modelInfo[p]?.aspects?.generate.includes('auto')); assert.ok(L, 'a local model with Auto');
    const q = await get(`/api/tools/app-product-shot/price?provider=${L}&aspect=auto`); assert.equal(q.status, 200, JSON.stringify(q.body).slice(0, 200));
    const s = await submit('app-product-shot', { provider: L, aspect: 'auto', prompt: 'a glass bottle' }); assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 200));
    ok(`${L} with Auto: quoted and ran`); }

  // #4: a product photo or a description
  { const s = await submit('app-product-shot', { provider: API, aspect: '1:1' }); assert.equal(s.status, 400); assert.equal(s.body.error, 'Add a product photo or describe the product.');
    assert.equal(s.body.issues[0].code, 'required');
    const blank = await submit('app-product-shot', { provider: API, aspect: '1:1', prompt: '   ' }); assert.equal(blank.status, 400, 'spaces are no description');
    assert.equal((await submit('app-product-shot', { provider: API, aspect: '1:1', prompt: 'a leather wallet' })).status, 200);
    assert.equal((await submit('app-product-shot', { provider: API, aspect: '1:1' }, true)).status, 200);
    ok('no photo and no description → 400 "Add a product photo or describe the product."; either one runs'); }

  // #16: display names, not ids
  { const s = await submit('create-image', { provider: 'api-ideogram', types: '["edit"]', prompt: 'make it blue' }, true); assert.equal(s.status, 400);
    assert.match(s.body.error, /^Ideogram V4 can't do Edit image\. Pick one of: Nano Banana 2/); assert.ok(!/\bapi-[\w-]+|comfy-[\w-]+/.test(s.body.error), s.body.error);
    ok(`plain names: "${s.body.error}"`); }

  // #17: every scene the server accepts is listed
  { const tools = (await get('/api/tools')).body; const t = (Array.isArray(tools) ? tools : tools.tools).find((x: any) => x.id === 'app-product-shot');
    const listed = t.inputs.find((i: any) => i.name === 'scene').options; assert.deepEqual(listed, PRODUCT_SCENES.map((o) => o.value));
    assert.deepEqual(wf.controls.find((c: any) => c.field === 'scene').options.map((o: any) => o.value), listed);
    for (const v of ['flat-lay', 'podium']) assert.equal((await submit('app-product-shot', { provider: API, aspect: '1:1', prompt: 'a mug', scene: v })).status, 200);
    ok(`/api/tools and the bar list all ${listed.length} scenes the server accepts`); }
  console.log('ALL OK product-shot-shape');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
