// Per-workflow default models (2026-10-23, shared/imageDefaults.ts + routing/defaults.ts + web/src/shared/workflowDefaults.ts).
// Covers: every workflow has defaults, and each one is a model that workflow really offers (feature providers AND the /api/image-workflows
// models list for some mode); the resolution order (saved route pin > the default for the active setup when it runs > the first that runs),
// local vs hosted by Use local, Z-Image-Turbo when Qwen Image 2.1 is too heavy; the bar's start / "Default" / "Your pick" / Reset rules;
// and the API (GET /api/tools workflowDefaults + editorialDefault, GET /api/image-workflows defaults.active, GET /api/image-features defaults).
// Run: npx tsx test/image-defaults.test.ts   (own mock server :9197, temp data dir, no keys, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { IMAGE_DEFAULTS, pickEditorial, featureForToolMode, type DefaultModelState } from '../src/shared/imageDefaults.ts';
import { IMAGE_FEATURES } from '../src/shared/imageFeatures.ts';
import { startModel, pickKindOf, wfDefaultOf } from '../../web/src/shared/workflowDefaults.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9197); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'imgdef-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. pure: the table and the resolver ----
for (const f of IMAGE_FEATURES) {
  const d = IMAGE_DEFAULTS[f.id]; assert.ok(d, `${f.id} has defaults`); assert.ok(d.hosted || d.local, `${f.id}: at least one default`);
  for (const id of [d.local, d.hosted, d.localLight].filter(Boolean) as string[]) assert.ok(f.providers.includes(id), `${f.id}: ${id} is one of its models`);
  if (d.local || d.hosted) assert.ok(d.why[d.hosted ? 'hosted' : 'local'], `${f.id}: a why line`);
}
ok('every feature has defaults that are its own models');
const st = (o: Record<string, Partial<DefaultModelState>>) => (id: string) => (o[id] ? { runnable: false, demo: false, routeKind: null, reasonCode: null, reason: null, ...o[id] } as DefaultModelState : undefined);
const CI = IMAGE_DEFAULTS['create-image'];
const both = st({ 'comfy-qwen21': { runnable: true, routeKind: 'local' }, 'api-flux3-image': { runnable: true, routeKind: 'comfy-router' }, 'comfy-zimage-turbo': { runnable: true, routeKind: 'local' } });
assert.deepEqual([pickEditorial(CI, both, true).id, pickEditorial(CI, both, true).setup], ['comfy-qwen21', 'local'], 'both run + Use local on → local');
assert.deepEqual([pickEditorial(CI, both, false).id, pickEditorial(CI, both, false).setup], ['api-flux3-image', 'hosted'], 'both run + Use local off → hosted');
const noKey = st({ 'comfy-qwen21': { runnable: true, routeKind: 'local' }, 'api-flux3-image': { reasonCode: 'key_missing', reason: 'Add a Comfy key' } });
assert.equal(pickEditorial(CI, noKey, true).id, 'comfy-qwen21'); const nk = pickEditorial(CI, noKey, false);
assert.equal(nk.id, 'api-flux3-image'); assert.equal(nk.runs, false); assert.equal(nk.reason, 'Add a Comfy key', 'no key, Use local off: the hosted default is named, with why it cannot run');
const heavy = st({ 'comfy-qwen21': { reasonCode: 'too_heavy', reason: 'Too heavy' }, 'comfy-zimage-turbo': { runnable: true, routeKind: 'local' }, 'api-flux3-image': { reasonCode: 'key_missing' } });
assert.equal(pickEditorial(CI, heavy, true).id, 'comfy-zimage-turbo', 'small GPU: Z-Image-Turbo');
const RB = IMAGE_DEFAULTS['remove-bg']; assert.equal(pickEditorial(RB, st({ 'fal-bria-rmbg': { demo: true, routeKind: 'fal' } }), true).id, 'fal-bria-rmbg', 'no local route: hosted even with Use local on');
assert.equal(pickEditorial(RB, st({}), true).id, null, 'the default model not listed (mode / only filter): no editorial pick');
assert.equal(featureForToolMode(IMAGE_FEATURES, 'create-image', 'inpaint'), 'brush-edit'); assert.equal(featureForToolMode(IMAGE_FEATURES, 'app-shots', 'edit'), 'camera-angles');
ok('resolver: local / hosted by Use local, can-not-run reason, light local model, no local route');
// the bar: saved pick > default (when it runs) > fallback start > mode default > first
const dRuns = { id: 'a', start: 'a', setup: 'hosted' as const, runs: true, reason: null, why: 'w', note: null };
const dOff = { ...dRuns, runs: false, start: 'b', reason: 'needs key' };
assert.equal(startModel('c', ['a', 'b', 'c'], dRuns), 'c', 'saved pick wins'); assert.equal(startModel('', ['a', 'b', 'c'], dRuns), 'a', 'reset (no pick) → default');
assert.equal(startModel('gone', ['a', 'b'], dRuns), 'a', 'a pick that is no longer offered falls back to the default');
assert.equal(startModel(null, ['a', 'b'], dOff), 'b', 'default cannot run → the fallback'); assert.equal(startModel(null, ['b', 'x'], { ...dRuns, id: 'z', start: 'z' }, 'x'), 'x', 'default not offered in this mode → mode default');
assert.equal(pickKindOf('a', dRuns, false), 'default'); assert.equal(pickKindOf('c', dRuns, true), 'yours'); assert.equal(pickKindOf('c', dRuns, false), null, "a link's model is not Your pick");
assert.equal(pickKindOf('a', dRuns, true), 'default', 'picking the default itself reads Default');
assert.equal(wfDefaultOf({ defaultsByMode: { inpaint: { defaultProvider: 'p', editorialDefault: { id: 'p', feature: 'brush-edit', runs: true } } } }, 'brush-edit')?.id, 'p', 'a mode of the tool can carry the feature');
ok('bar rules: start, Default / Your pick, Reset');

// ---- 2. the API on a keyless mock server (Use local off, local reachable) ----
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_SEED_COMMUNITY: '0' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; srv.stderr!.on('data', (b) => { stderr += String(b); });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const put = async (body: any) => { const r = await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); assert.ok(r.ok, `PUT routing ${r.status}`); };
const toolsNow = async () => Object.fromEntries(((await get('/api/tools')) as any[]).map((t) => [t.id, t]));
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); }
  // every workflow lists defaults, and each default is offered (or greyed with a reason) by that workflow
  const wfs = (await get('/api/image-workflows')).workflows as any[];
  for (const w of wfs) {
    assert.ok(w.defaults, `${w.id} defaults`); const offered = new Set([...Object.values<string[]>(w.models).flat(), ...Object.values<any[]>(w.unavailable ?? {}).flat().map((x) => x.id)]);
    for (const id of [w.defaults.local, w.defaults.hosted].filter(Boolean)) assert.ok(offered.has(id), `${w.id}: default ${id} is in its models list`);
    assert.ok(w.defaults.active?.id, `${w.id}: active default`); assert.ok(w.defaults.active.defaultProvider, `${w.id}: what the bar starts on`);
  }
  ok(`/api/image-workflows: defaults on all ${wfs.length} workflows, each one offered`);
  const feats = (await get('/api/image-features')).features as any[]; assert.ok(feats.every((f) => f.defaults && (f.defaults.local || f.defaults.hosted)), 'image-features carry defaults');
  let T = await toolsNow();
  assert.equal(T['app-face-swap'].defaultProvider, 'api-nano-banana', 'Use local off: Face Swap starts on its hosted default (sample run, keyless)');
  assert.equal(T['app-face-swap'].editorialDefault.source, 'editorial'); assert.equal(T['app-face-swap'].defaultFallback, null);
  assert.equal(T['create-image'].workflowDefaults['camera-lens'].defaultProvider, 'api-gpt-image-25-flare', 'Camera & Lens has its own default on create-image');
  assert.equal(T['create-image'].workflowDefaults['create-image'].defaultProvider, 'api-flux3-image');
  assert.equal(T['app-inpaint'].defaultProvider, 'api-gpt-image-25-sunburst');
  assert.equal(T['image-upscale'].defaultProvider, 'router-seedvr2-upscale');
  ok('hosted setup: the hosted defaults');
  await put({ global: { mode: 'auto', allowFallback: false, useLocal: true } }); T = await toolsNow();
  assert.equal(T['app-face-swap'].defaultProvider, 'comfy-qwen21', 'Use local on: the local default'); assert.equal(T['app-face-swap'].editorialDefault.setup, 'local');
  assert.equal(T['app-inpaint'].defaultProvider, 'comfy-flux3-klein'); assert.equal(T['image-upscale'].defaultProvider, 'comfy-seedvr2-image'); assert.equal(T['app-shots'].defaultProvider, 'comfy-qwen-angles');
  assert.equal(T['app-remove-bg'].defaultProvider, 'fal-bria-rmbg', 'no local route: the hosted default stays');
  ok('local setup: the local defaults');
  // a saved route pin beats the default
  const m = (T['app-face-swap'].models as any[]).find((x) => x.engines?.includes('api-seedream')); assert.ok(m, 'Seedream listed on Face Swap');
  const place = (m.runsOn as any[]).find((r) => r.id !== 'local')?.id; assert.ok(place, 'Seedream has a hosted place');
  await put({ perTool: { 'app-face-swap': { [m.key]: { runOn: place } } } }); T = await toolsNow();
  assert.equal(T['app-face-swap'].defaultProvider, 'api-seedream', 'saved pin wins over the default'); assert.equal(T['app-face-swap'].editorialDefault.source, 'pin');
  await put({ perTool: {} }); T = await toolsNow(); assert.equal(T['app-face-swap'].defaultProvider, 'comfy-qwen21', 'pin cleared: the default again');
  ok('order: saved pin > default for the setup');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); if (process.exitCode) console.error(stderr.slice(-2000)); }
