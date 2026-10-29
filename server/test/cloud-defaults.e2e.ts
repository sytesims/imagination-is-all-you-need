// Cloud-first defaults and ★ Make default (2026-10-27): shared/cloudDefaults.ts + routing/defaults.ts + GET/PUT /api/me/defaults.
// Covers: 1 the per-workflow tables read their hosted model from the one cloud table; 2 keyless sample server: every tool with a cloud model starts
// on it, on a Comfy key route; 3 with a (fake) Comfy key the same defaults run; 4 favourites: set, wins, persists across a restart, survives a
// routing PUT, reset, validation, a run with no model (the MCP path) uses it, a named model still wins; 5 a favourite that can't run or is gone says
// so and the recommended default is used; 6 no key on a real backend: the default still shows, the quote needs the Comfy key, the message names Settings
// and the free local way out.
// Run: npx tsx test/cloud-defaults.e2e.ts   (own servers on :9661-9663, temp data dirs, fake key only, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import Database from 'better-sqlite3';
import { CLOUD_DEFAULTS, cloudModel } from '../src/shared/cloudDefaults.ts';
import { IMAGE_DEFAULTS } from '../src/shared/imageDefaults.ts';
import { VIDEO_DEFAULTS } from '../src/shared/videoDefaults.ts';
import { AUDIO_DEFAULTS } from '../src/shared/audioDefaults.ts';
import { THREE_D_DEFAULTS } from '../src/shared/threeDDefaults.ts';
import { preflightProblems, FREE_LOCAL_TAIL } from '../src/shared/preflight.ts';
import { startModel, pickKindOf, wfDefaultOf, PICK_LABEL } from '../../web/src/shared/workflowDefaults.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_ARK_API_KEY: '',
  OPENHIGGSFIELD_OPENAI_API_KEY: '', OPENHIGGSFIELD_GEMINI_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_LTX_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_LOCAL_AVAILABLE: '', OPENHIGGSFIELD_USE_LOCAL: '0', COMFY_BASE_URL: '' };
const procs: ChildProcess[] = []; const dirs: string[] = [];
function boot(port: number, extra: Record<string, string>, dir?: string) {
  const D = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'clouddef-')); if (!dir) dirs.push(D);
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(port), HOST: '127.0.0.1', OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_SEED_COMMUNITY: '0', ...extra }, stdio: ['ignore', 'ignore', 'ignore'], detached: true });
  procs.push(p); return { B: `http://127.0.0.1:${port}`, D, p };
}
const up = async (B: string) => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('server did not start'); };
const stop = async (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } await new Promise((r) => setTimeout(r, 900)); };
const get = async (B: string, u: string) => (await (await fetch(B + u)).json()) as any;
const send = async (B: string, m: string, u: string, body?: any) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: (await r.json().catch(() => null)) as any }; };
const tools = async (B: string) => Object.fromEntries(((await get(B, '/api/tools')) as any[]).map((t) => [t.id, t]));
const submit = async (B: string, toolId: string, form: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(form)) fd.append(k, v);
  const r = await fetch(`${B}/api/tools/${toolId}/jobs`, { method: 'POST', body: fd }); return { status: r.status, j: (await r.json()) as any }; };

// tool (and mode) → the cloud default it starts on (one per Comfy-key slot of shared/cloudDefaults.ts)
const EXPECT: [string, string | null, string][] = [
  ['create-image', null, 'create-image'], ['create-image', 'edit', 'edit-image'], ['create-image', 'inpaint', 'brush-edit'], ['image-upscale', null, 'upscale'], ['app-relight', null, 'relight'],
  ['app-face-swap', null, 'face-swap'], ['app-person-swap', null, 'person-swap'], ['app-shots', null, 'camera-angles'], ['app-character-sheet', null, 'character-sheet'], ['app-product-shot', null, 'product-shot'],
  ['app-inpaint', null, 'brush-edit'], ['app-image-layers', null, 'image-layers'], ['h3-video', null, 'h3-video'], ['h3-video', 'r2v', 'h3-video:r2v'], ['upscale', null, 'video-upscale'], ['app-video-upscale', null, 'video-upscale'], ['h3-extend', null, 'h3-extend'],
  ['object-swap', null, 'object-swap'], ['motion-transfer', null, 'motion-transfer'], ['make-it-real', null, 'make-it-real'], ['camera', null, 'camera'], ['photo-fx', null, 'photo-fx'], ['app-transition', null, 'app-transition'],
  ['app-ugc-ad', null, 'app-ugc-ad'], ['app-orbit-shot', null, 'app-orbit-shot'], ['footage-fx', null, 'footage-fx'], ['audio', 'music', 'music'], ['audio', 'sfx', 'sfx'], ['voice', null, 'voiceover'], ['voice', 'lipsync', 'voice:lipsync'],
  ['soundtrack', 'music', 'soundtrack-music'], ['app-music-bed', null, 'soundtrack-music'], ['three-d', null, 'image-to-3d'],
];
const defOf = (t: any, mode: string | null) => (mode && t.defaultsByMode?.[mode] ? t.defaultsByMode[mode] : t);

try {
  // ---- 1. one table: the per-workflow tables' hosted model is the cloud default ----
  for (const [id, d] of Object.entries(IMAGE_DEFAULTS)) assert.equal(d.hosted, cloudModel(id), `image ${id}: hosted from cloudDefaults`);
  assert.equal(VIDEO_DEFAULTS['h3-video'].hosted, cloudModel('h3-video')); assert.equal(VIDEO_DEFAULTS.upscale.hosted, cloudModel('video-upscale'));
  for (const [id, d] of Object.entries(AUDIO_DEFAULTS)) assert.equal(d.hosted, cloudModel(id), `audio ${id}: hosted from cloudDefaults`);
  for (const [id, d] of Object.entries(THREE_D_DEFAULTS)) assert.equal(d!.hosted, cloudModel(id), `3D ${id}: hosted from cloudDefaults`);
  for (const [slot, c] of Object.entries(CLOUD_DEFAULTS)) { if (c.model) { assert.ok(c.place, `${slot}: place`); assert.ok(c.why, `${slot}: why`); } if (c.comfyKey) assert.ok(c.place === 'Comfy Router' || c.place === 'Comfy Cloud', `${slot}: a Comfy-key default runs on Comfy`);
    if (c.model && !c.comfyKey) assert.ok(c.next || ['soul', 'reframe'].includes(slot), `${slot}: names the Comfy Router model that would replace it`); }
  // sponsors first (user, 2026-10-27): LTX, MiniMax and FLUX wherever they run on the Comfy key and fit the job; every other pick says why
  const SP: Record<string, string> = { 'h3-video': 'Lightricks', 'footage-fx': 'Lightricks', 'h3-video:r2v': 'MiniMax', 'h3-extend': 'MiniMax', 'voice:lipsync': 'MiniMax', camera: 'MiniMax', 'photo-fx': 'MiniMax',
    'app-transition': 'MiniMax', 'app-ugc-ad': 'MiniMax', 'app-orbit-shot': 'MiniMax', 'create-image': 'Black Forest Labs', 'edit-image': 'Black Forest Labs', relight: 'Black Forest Labs', 'product-shot': 'Black Forest Labs' };
  for (const [slot, sp] of Object.entries(SP)) assert.equal(CLOUD_DEFAULTS[slot].sponsor, sp, `${slot}: ${sp}`);
  assert.equal(cloudModel('h3-video'), 'router-ltx-25-pro'); assert.equal(cloudModel('create-image'), 'api-flux3-image'); assert.equal(cloudModel('h3-video:r2v'), 'api-minimax-h3');
  for (const [slot, c] of Object.entries(CLOUD_DEFAULTS)) if (c.model && c.comfyKey && !c.sponsor) assert.ok(c.note, `${slot}: no sponsor model, so a note says why`);
  ok(`1. one source: ${Object.keys(CLOUD_DEFAULTS).length} slots; image / video / audio / 3D tables read their hosted model from it; ${Object.keys(SP).length} sponsor defaults, the rest say why`);
  // the Create bar (web/src/shared/workflowDefaults.ts): the user's own default starts the bar and reads "Your default"
  { const tool = { workflowDefaults: { 'create-image': { defaultProvider: 'api-seedream', defaultSource: 'favourite', editorialDefault: { id: 'api-nano-banana-21', runs: true, setup: 'hosted' } } } };
    const d = wfDefaultOf(tool, 'create-image')!; assert.equal(d.fav, 'api-seedream'); assert.equal(d.id, 'api-nano-banana-21', 'the recommended row stays the workflow default');
    assert.equal(startModel(null, ['api-nano-banana-21', 'api-seedream'], d), 'api-seedream', 'no pick on this browser: the favourite');
    assert.equal(startModel('api-nano-banana-21', ['api-nano-banana-21', 'api-seedream'], d), 'api-nano-banana-21', 'a pick on this page still wins');
    assert.equal(startModel(null, ['api-nano-banana-21'], d), 'api-nano-banana-21', 'favourite not offered here: the default');
    assert.equal(pickKindOf('api-seedream', d, false), 'favourite'); assert.equal(PICK_LABEL.favourite, 'Your default'); assert.equal(pickKindOf('api-nano-banana-21', d, false), null);
    const plain = wfDefaultOf({ workflowDefaults: { 'create-image': { defaultProvider: 'api-nano-banana-21', defaultSource: 'cloud', editorialDefault: { id: 'api-nano-banana-21', runs: true } } } }, 'create-image')!;
    assert.equal(plain.fav, null); assert.equal(pickKindOf('api-nano-banana-21', plain, false), 'default'); }
  ok('1b. the Create bar starts on the favourite and calls it Your default');

  // ---- 2. keyless sample server (a first install): every tool starts on its cloud default, a Comfy-key route ----
  const A = boot(testPort(9661), {}); await up(A.B); let T = await tools(A.B);
  for (const [tid, mode, slot] of EXPECT) { const t = T[tid]; assert.ok(t, `${tid} listed`); const d = defOf(t, mode); const want = CLOUD_DEFAULTS[slot].model;
    assert.equal(d.defaultProvider, want, `${tid}${mode ? ':' + mode : ''}: starts on the cloud default ${want}`);
    const r = await get(A.B, `/api/routes?toolId=${tid}&modelId=${want}`); const rs = (r.routes?.[0]?.routes ?? []) as any[];
    assert.ok(rs.some((x) => x.envKey === 'COMFY_API_KEY' && /^comfy-(router|cloud)$/.test(x.kind)), `${tid}: ${want} has a Comfy-key route`); }
  for (const tid of ['create-image', 'h3-video', 'audio', 'three-d']) { assert.equal(T[tid].defaultSource, 'cloud', `${tid}: defaultSource cloud`); assert.equal(T[tid].defaultFallback, null, `${tid}: no note`); assert.equal(T[tid].recommendedProvider, T[tid].defaultProvider); assert.equal(T[tid].favouriteProvider, null); }
  for (const tid of ['finish', 'sdr-hdr', 'plan-a-shot', 'three-d-turntable', 'depth-map']) assert.notEqual(T[tid].defaultSource, 'cloud', `${tid}: no cloud model, stays free on your computer`);
  ok(`2. keyless: ${EXPECT.length} tool/mode defaults on their cloud model with a Comfy-key route; free tools unchanged`);

  // ---- 4. favourites ----
  const bad1 = await send(A.B, 'PUT', '/api/me/defaults', { toolId: 'nope', model: 'api-seedream' }); assert.equal(bad1.status, 400);
  const bad2 = await send(A.B, 'PUT', '/api/me/defaults', { toolId: 'create-image', model: 'not-a-model' }); assert.equal(bad2.status, 400); assert.match(bad2.j.error, /doesn't offer/);
  const bad3 = await send(A.B, 'PUT', '/api/me/defaults', { toolId: 'create-image', model: 42 }); assert.equal(bad3.status, 400);
  const set = await send(A.B, 'PUT', '/api/me/defaults', { toolId: 'create-image', model: 'api-seedream' }); assert.equal(set.status, 200, JSON.stringify(set.j));
  assert.equal(set.j.favourite, 'api-seedream'); assert.equal(set.j.defaultProvider, 'api-seedream'); assert.equal(set.j.recommendedProvider, 'api-flux3-image'); assert.equal(set.j.defaultSource, 'favourite');
  T = await tools(A.B); assert.equal(T['create-image'].defaultProvider, 'api-seedream'); assert.equal(T['create-image'].favouriteProvider, 'api-seedream'); assert.equal(T['create-image'].recommendedProvider, 'api-flux3-image');
  assert.equal(T['create-image'].defaultsByMode.edit.defaultProvider, 'api-seedream', 'the favourite applies in every mode that lists it');
  assert.equal(T['app-relight'].defaultProvider, 'api-flux3-image', 'another tool keeps its own default');
  { const wd = T['create-image'].workflowDefaults?.['create-image']; assert.equal(wd?.defaultProvider, 'api-seedream', 'the Create workflow default follows'); assert.equal(wd?.defaultSource, 'favourite'); assert.equal(wd?.recommendedProvider, 'api-flux3-image'); }
  // a model key works too (what MCP's list_models gives)
  const key = ((T['create-image'].models as any[]).find((m) => (m.engines ?? []).includes('api-gpt-image-25-flare')))?.key; assert.ok(key, 'GPT Image 2.5 Flare has a model key');
  const k2 = await send(A.B, 'PUT', '/api/me/defaults', { toolId: 'create-image', model: key }); assert.equal(k2.status, 200); assert.equal(k2.j.favourite, 'api-gpt-image-25-flare');
  await send(A.B, 'PUT', '/api/me/defaults', { toolId: 'create-image', model: 'api-seedream' });
  // the routing PUT (Settings, Run on) keeps favourites
  assert.equal((await send(A.B, 'PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: false, useLocal: false }, perTool: {} })).status, 200);
  assert.equal((await get(A.B, '/api/me/defaults')).favourites['create-image'], 'api-seedream', 'a routing PUT keeps the favourite');
  // a run with no model (MCP's run tools) uses the favourite; a named model (Recreate, Workflows cards, MCP model=) still wins
  const j1 = await submit(A.B, 'create-image', { prompt: 'a red kite over a beach', types: 'generate' }); assert.ok(j1.status < 300, JSON.stringify(j1.j)); assert.equal(j1.j.provider, 'api-seedream', `no model → favourite (${JSON.stringify(j1.j).slice(0, 200)})`);
  const j2 = await submit(A.B, 'create-image', { prompt: 'a red kite over a beach', types: 'generate', provider: 'api-gpt-image' }); assert.ok(j2.status < 300); assert.equal(j2.j.provider, 'api-gpt-image', 'a named model wins');
  const q = await get(A.B, '/api/tools/create-image/price'); assert.equal(q.defaultProvider, 'api-seedream', 'the quote with no model follows the favourite');
  ok('4. favourite: validated, wins in every listed mode, workflow defaults follow, survives a routing PUT; no-model runs (MCP) and quotes use it; named models still win');
  // persists across a restart
  await stop(A.p); const A2 = boot(testPort(9661), {}, A.D); await up(A2.B); T = await tools(A2.B);
  assert.equal(T['create-image'].defaultProvider, 'api-seedream', 'remembered on the server after a restart'); assert.equal(T['create-image'].defaultSource, 'favourite');
  const reset = await send(A2.B, 'PUT', '/api/me/defaults', { toolId: 'create-image', model: null }); assert.equal(reset.j.favourite, null); assert.equal(reset.j.defaultProvider, 'api-flux3-image'); assert.equal(reset.j.defaultSource, 'cloud');
  T = await tools(A2.B); assert.equal(T['create-image'].favouriteProvider, null); assert.equal(T['create-image'].defaultProvider, 'api-flux3-image');
  ok('4b. favourite persists across a restart; Reset to recommended goes back to the cloud default');
  // ---- 5. a favourite that is gone: the note says so, the recommended default is used ----
  await send(A2.B, 'PUT', '/api/me/defaults', { toolId: 'h3-video', model: 'router-veo' }); await stop(A2.p);
  { const db = new Database(path.join(A.D, 'openhiggsfield.db')); const row = db.prepare('SELECT data FROM kv WHERE id = ?').get('routingPrefs') as { data: string }; const p = JSON.parse(row.data);
    assert.equal(p.favourites['h3-video'], 'router-veo'); p.favourites['h3-video'] = 'router-gone-model'; db.prepare('UPDATE kv SET data = ? WHERE id = ?').run(JSON.stringify(p), 'routingPrefs'); db.close(); }
  const A3 = boot(testPort(9661), {}, A.D); await up(A3.B); T = await tools(A3.B);
  assert.equal(T['h3-video'].defaultProvider, 'router-ltx-25-pro', 'a gone favourite: the recommended default'); assert.match(T['h3-video'].defaultFallback?.note ?? '', /^Your default, .* isn’t available any more, so LTX-2\.5 Pro is used\.$/);
  await stop(A3.p); ok('5. a favourite that is gone: recommended default + a plain note');

  // ---- 3. a Comfy key (fake: never sent anywhere on the mock backend): the cloud defaults run ----
  const K = boot(testPort(9662), { COMFY_API_KEY: 'test-not-real' }); await up(K.B); T = await tools(K.B);
  for (const [tid, mode, slot] of EXPECT) { const d = defOf(T[tid], mode); assert.equal(d.defaultProvider, CLOUD_DEFAULTS[slot].model, `key: ${tid}${mode ? ':' + mode : ''}`); }
  for (const tid of ['create-image', 'h3-video', 'three-d', 'voice', 'object-swap']) { const s = T[tid].defaultState; assert.equal(s.runnable, true, `${tid}: runs with the key`); assert.match(String(s.routeId), /^comfy-(router|cloud):/, `${tid}: on Comfy`); }
  assert.equal(T['image-upscale'].defaultProvider, 'router-seedvr2-upscale', 'Upscale stays on SeedVR2 (it waits only for the photo), not a fal model');
  await stop(K.p); ok('3. fake Comfy key: every cloud default runs on a Comfy route');

  // ---- 6. a real backend with no key and no local GPU running: the default shows; Generate says how to add the key or go local ----
  const C = boot(testPort(9663), { OPENHIGGSFIELD_BACKEND: 'comfy', COMFY_BASE_URL: `http://127.0.0.1:${testPort(9664)}` }); await up(C.B); await new Promise((r) => setTimeout(r, 2500));
  T = await tools(C.B); assert.equal(T['create-image'].defaultProvider, 'api-flux3-image', 'no key: the cloud default still shows'); assert.equal(T['create-image'].defaultSource, 'cloud');
  const nq = await get(C.B, '/api/tools/create-image/price'); assert.equal(nq.needsKey, true); assert.equal(nq.runnable, false); assert.deepEqual([nq.setup?.action, nq.setup?.runOnLabel, nq.setupOptions?.[0]?.credits], ['add_key', 'Comfy Cloud', 7], 'the first step: add the Comfy key; the price once added is shown');
  const pf = preflightProblems({ quote: nq, modelName: 'FLUX 3 Image', freeLocal: true }).find((x) => x.code === 'needs_key'); assert.ok(pf, 'a needs_key step');
  assert.match(pf!.message, /^Needs a Comfy Cloud key, or pick a free model that runs on your computer$/, pf!.message); assert.ok(pf!.message.endsWith(FREE_LOCAL_TAIL)); assert.equal(pf!.fix?.kind, 'add-key');
  // a local favourite that can't run here (ComfyUI isn't running): its own note, the cloud default is used
  await send(C.B, 'PUT', '/api/me/defaults', { toolId: 'create-image', model: 'comfy-qwen21' }); T = await tools(C.B);
  assert.equal(T['create-image'].defaultProvider, 'api-flux3-image'); assert.equal(T['create-image'].favouriteProvider, 'comfy-qwen21'); assert.match(T['create-image'].defaultFallback?.note ?? '', /^Your default, .*, so FLUX 3 Image is used\.$/);
  await stop(C.p); ok('6. no key: the cloud default shows, the quote needs the Comfy key, the message names the free local way; a local favourite that can’t run says why');
} finally { for (const p of procs) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } } for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); }
console.log('cloud-defaults: all checks passed');
