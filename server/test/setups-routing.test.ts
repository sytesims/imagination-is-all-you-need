// Setup and result provenance regressions. Fake keys and in-process route selection only; no generation or external requests.
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'setups-routing-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: scratch, OPENHIGGSFIELD_ENV_FILE: path.join(scratch, 'absent.env'), OPENHIGGSFIELD_FILMING_FILE: path.join(scratch, 'absent.json'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '0', OPENHIGGSFIELD_SEED_FEATURED: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'OPENHIGGSFIELD_LOCAL_AVAILABLE']) delete process.env[k];
globalThis.fetch = (async () => { throw new Error('External requests forbidden in setup regressions'); }) as typeof fetch;
const { config } = await import('../src/config.js');
const S = await import('../src/routing/select.js');
const H = await import('../src/hardware.js');
const { getTool } = await import('../src/tools/registry.js');
const { savePrefs, DEFAULT_PREFS } = await import('../src/routing/prefs.js');
const { placeOf } = await import('../src/shared/modelIds.js');
const { jobWorkflow, jobAppPrompts, notePlanPrompts } = await import('../src/jobSource.js');
const { deployNeeds } = await import('../src/comfy/deploy.js');
config.backend = 'comfy';
const video = getTool('h3-video')!;
const audio = getTool('audio')!;
function setup(cloud: boolean, local: boolean) {
  if (cloud) process.env.COMFY_API_KEY = 'fake-test-key-never-sent'; else delete process.env.COMFY_API_KEY;
  S.setLocalAvailable(local);
  savePrefs({ ...DEFAULT_PREFS, global: { ...DEFAULT_PREFS.global, useLocal: local, mockKeys: false }, perModel: {}, perTool: {} });
}
for (const [cloud, local, kind] of [[true, false, 'cloud'], [false, true, 'local'], [true, true, 'both'], [false, false, 'none']] as const) {
  setup(cloud, local);
  assert.equal(S.setupKind(), kind);
  assert.equal(S.needsConnection(), kind === 'none');
  const a = S.resolveRoute(video, 'comfy-h3', { types: ['t2v'], duration: 5, resolution: '480p' });
  const b = S.resolveRoute(video, 'comfy-h3', { types: ['t2v'], duration: 5, resolution: '480p' });
  if (!('error' in a) && !('error' in b)) { assert.deepEqual(a.routing, b.routing, `${kind}: quote and submit share the route order and prices`); assert.equal(a.first.routeId, b.first.routeId); assert.equal(a.first.credits, b.first.credits); } else assert.equal('error' in a, 'error' in b);
  if (kind === 'none') assert.ok('error' in a);
  else { assert.ok(!('error' in a), `${kind}: H3 has a real route`); assert.equal(a.first.kind, kind === 'local' ? 'local' : 'comfy-cloud'); assert.equal(a.routing.demo, undefined); }
}
setup(false, false);
const yueNo = S.resolveRoute(audio, 'comfy-yue2', { mode: 'music', duration: 30 });
assert.ok('error' in yueNo && yueNo.errorType === 'no_provider');
assert.equal((yueNo as any).needsKey, false);
assert.match(yueNo.error, /Set up ComfyUI/);
setup(false, true);
const yue = S.resolveRoute(audio, 'comfy-yue2', { mode: 'music', duration: 30 });
assert.ok(!('error' in yue)); assert.equal(yue.first.kind, 'local'); assert.equal(yue.first.credits, 0);
assert.ok(yue.routing.order.every(r => !/minimax/.test(r)), 'YuE2 never runs another model');
S.setLocalAvailable(null);
H.setComfyReachableOverride(null);
config.comfyBaseUrl = '';
assert.equal(H.localReachable(), false, 'cloud key alone is not a local ComfyUI');
config.comfyBaseUrl = 'https://cloud.comfy.org';
assert.equal(H.localReachable(), false, 'shared cloud URL is not local');
config.backend = 'mock';
assert.equal(S.needsConnection(), false, 'development mock stays available');
const places = [
  ['local:comfy-yue2', 'Your computer', 'free'],
  ['comfy-cloud:cloud-h3-two-swap', 'Comfy Cloud', 'gpu-time'],
  ['comfy-router:api-minimax-h3', 'Comfy Router', 'set-price'],
  ['comfy-deploy:cloud-h3-crossview', 'Comfy deployment', 'gpu-time'],
  ['fal:foo', 'fal', 'set-price'], ['replicate:foo', 'Replicate', 'set-price'],
];
for (const [route, label, billing] of places) { const p = placeOf({ route }); assert.equal(p?.label, label); assert.equal(p?.billing, billing); }
assert.equal(placeOf(null), null);
const swap = jobWorkflow({ toolId: 'two-person-swap', provider: 'cloud-h3-two-swap', route: 'comfy-cloud:cloud-h3-two-swap' });
assert.equal(swap?.file, 'cloud/h3-two-person-swap-api.json'); assert.equal(swap?.source, 'ours');
const h3 = jobWorkflow({ toolId: 'h3-video', provider: 'comfy-h3', route: 'comfy-cloud:cloud-h3-wf', input: { imagePath: 'fake.png', mode: 'i2v' } });
assert.equal(h3?.file, 'cloud/h3-i2v-api.json'); assert.match(h3!.url!, /video_minimax_h3_i2v/);
const hosted = jobWorkflow({ toolId: 'h3-video', provider: 'comfy-h3', route: 'comfy-router:api-minimax-h3' });
assert.equal(hosted?.file, null); assert.match(hosted!.name, /request on Comfy Router/);
assert.equal(jobWorkflow({ toolId: 'unknown', input: { comfyPlan: { passes: [{ workflow: 'uncredited-community.json' }] } } }), null, 'never invent a missing workflow');
const j = { toolId: 'two-person-swap', input: { comfyPlan: { post: 'each' } } as Record<string, any> };
notePlanPrompts(j, { passes: [{ workflow: 'cloud/h3-two-person-swap-api.json', expect: { prompts: ['Replace the first person', 'Replace the second person'] } }] });
assert.deepEqual(jobAppPrompts(j), ['Replace the first person', 'Replace the second person']);
assert.equal(j.input.comfyPlan.post, 'each'); assert.equal(j.input.comfyPlan.passes[0].workflow, swap!.file);
assert.ok(!deployNeeds().some(r => r.id === 'h3-charswap'), 'shared-cloud Character Swap does not add stale requirements to CrossView deployment');
console.log('setups-routing: cloud/local/both/none, no fake runs, YuE2, places and exact source all pass');
