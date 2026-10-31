/** MODEL-ROUTE-SPEC steps 1–2 (in-process): model registry integrity, the engine alias table, request resolution (deterministic),
 *  per-(tool, model) pins with the read-time migration of old per-engine pins (no cross-tool leak), and old jobs derived on read.
 *  Run: npx tsx test/model-registry.test.ts (temp data dir, mock backend, no keys). */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'modelreg-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_USE_LOCAL: '',
  OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BFL_API_KEY: '' });
await import('../src/tools/registry.js');
const { listTools, getTool } = await import('../src/tools/registry.js');
const { getProvider } = await import('../src/providers.js');
const R = await import('../src/routing/modelRegistry.js');
const { MODELS, ENGINE_MODEL, TOOL_SPLITS, normRunOn, runOnOfRouteId } = await import('../src/shared/modelIds.js');
const { routesFor } = await import('../src/routing/routes.js');
const S = await import('../src/routing/select.js');
const { getPrefs, savePrefs, DEFAULT_PREFS } = await import('../src/routing/prefs.js');
const { perToolView } = await import('../src/routing/http.js');
S.setLocalAvailable(true);
let ok = 0; const t = async (n: string, fn: () => unknown) => { await fn(); ok++; console.log('ok', n); };

await t('model table: unique keys; every key ENGINE_MODEL / TOOL_SPLITS names exists', () => {
  for (const [k, d] of Object.entries(MODELS)) assert.equal(d.key, k);
  const named = [...Object.values(ENGINE_MODEL).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))), ...Object.values(TOOL_SPLITS).flatMap((x) => Object.values(x).flat().map((s) => s.model))];
  for (const k of named) assert.ok(MODELS[k], `unknown model key ${k}`);
});
await t('registry integrity: every offered model has ≥1 route; no duplicate model keys per tool; every engine id of every tool resolves', () => {
  const engines = new Set<string>(); let rows = 0;
  for (const tool of listTools()) {
    const ms = R.toolModels(tool); const keys = ms.map((m) => m.key);
    assert.equal(new Set(keys).size, keys.length, `${tool.id}: duplicate model keys ${keys}`);
    for (const m of ms) { rows++; assert.ok(R.modelRoutes(tool, m).length >= 1, `${tool.id}/${m.key}: no route`); assert.ok(m.parts.some((p) => p.engine === m.primary)); }
    for (const e of tool.providers) { engines.add(e); const a = R.engineAlias(tool, e); assert.ok(keys.includes(a.model), `${tool.id}:${e} → ${a.model} not offered`);
      assert.ok(a.runOn === 'auto' || normRunOn(a.runOn) === a.runOn); assert.ok(!MODELS[a.model] || MODELS[a.model].key === a.model); }
    // every route of every engine on the tool belongs to some model (nothing orphaned by a split)
    for (const e of tool.providers) for (const r of routesFor(e, tool)) assert.ok(ms.some((m) => m.parts.some((p) => p.engine === e && (!p.routes || p.routes.includes(r.routeId)))), `${tool.id}:${e} route ${r.routeId} has no model`);
  }
  assert.ok(engines.size >= 73, `engine ids: ${engines.size}`);
  // only plugin engines may be derived (not in the table)
  for (const tool of listTools()) for (const m of R.toolModels(tool)) if (m.def.derived) assert.ok(!ENGINE_MODEL[m.primary] || tool.id.startsWith('plugin'), `${tool.id}/${m.key} derived`);
  console.log(`   ${engines.size} engine ids → ${new Set(listTools().flatMap((x) => R.toolModels(x).map((m) => m.key))).size} models, ${rows} tool×model rows`);
});
await t('alias table: comfy-open per tool, H3 engines, twins, splits', () => {
  const A = (tool: string, e: string, input?: any) => { const a = R.engineAlias(getTool(tool)!, e, input); return `${a.model}@${a.runOn}`; };
  const comfyOpen: Record<string, string> = { 'object-swap': 'wan-2.2-animate-14b', 'motion-transfer': 'wan-2.2-animate-14b', restyle: 'wan-2.1-vace-14b', 'app-anime-restyle': 'wan-2.1-vace-14b',
    reshoot: 'ltx-2-19b', cinema: 'ltx-2-19b', 'app-orbit-shot': 'ltx-2-19b', camera: 'wan-2.2-fun-camera-14b', 'photo-fx': 'wan-2.2-i2v-14b', upscale: 'seedvr2', 'app-video-upscale': 'seedvr2' };
  for (const [tool, m] of Object.entries(comfyOpen)) assert.equal(R.modelKeyOf(tool, 'comfy-open'), m, tool);
  if (getTool('cutout')) assert.equal(R.modelKeyOf('cutout', 'comfy-open'), 'birefnet');
  // Camera Moves comfy-open runs two models: the move decides
  assert.equal(R.modelKeyOf('camera', 'comfy-open', { types: ['ltx-dolly-in'] }), 'ltx-2-19b');
  assert.equal(R.modelKeyOf('camera', 'comfy-open', { types: '["push-in"]' }), 'wan-2.2-fun-camera-14b');
  assert.equal(A('camera', 'cloud-ltx-camera'), 'ltx-2-19b@comfy-cloud'); assert.equal(A('reshoot', 'cloud-reshoot'), 'ltx-2-19b@comfy-cloud');
  for (const e of ['comfy-h3', 'cloud-h3-wf', 'cloud-h3', 'api-minimax-h3']) assert.equal(R.modelKeyOf('h3-video', e), 'minimax-h3', e);
  assert.equal(A('h3-video', 'cloud-h3-wf'), 'minimax-h3@comfy-cloud'); assert.equal(A('h3-video', 'api-minimax-h3'), 'minimax-h3@comfy-cloud'); assert.equal(A('h3-video', 'comfy-h3'), 'minimax-h3@auto');
  assert.equal(A('object-swap', 'comfy-open'), 'wan-2.2-animate-14b@local');
  assert.equal(R.routeModelKey('remove-bg', 'comfy-birefnet-video', 'fal:bria/video/background-removal'), 'bria-video-background-removal');
  assert.equal(R.routeModelKey('h3-extend', 'comfy-h3-extend', 'fal:minimax/h3-max/extend-video'), 'minimax-h3-max-extend');
  assert.equal(R.modelKeyOf('app-face-swap', 'comfy-qwen-image'), 'qwen-image-edit-2509'); assert.equal(R.modelKeyOf('create-image', 'comfy-qwen-image'), 'qwen-image');
  assert.equal(R.modelKeyOf('nope', 'whatever'), 'whatever'); // never throws
  // Generate Video: the 4 H3 engines are ONE model row
  assert.deepEqual(R.toolModels('h3-video').map((m) => m.key), ['minimax-h3', 'wan-2.2-ti2v-5b' /* local, 2026-10-24 */, 'ltx-2.5-22b' /* local with sound, 2026-10-25 */, 'seedance-2.0', 'veo-3.1', 'kling-v3', 'wan-3.0' /* Comfy Router, 2026-10-25 */, 'minimax-h3-fast' /* Comfy Cloud, 2026-10-27 */, 'ltx-2.5-pro', 'ltx-2.5-fast', 'flux-3-video', 'ltx-2.3-fast', 'seedance-2.5', 'seedance-2.0-fast', 'seedance-2.0-mini', 'veo-3.1-fast' /* Comfy Router, 2026-10-25 */, 'wan-3.0-prime', 'veo-3.1-lite', 'p-video-2', 'grok-imagine-video-1.5-lite' /* Comfy Router, 2026-10-31 */, 'gemini-omni-1.1-flash' /* Comfy Cloud partner node, official template (2026-10-27) */, 'flux-3-max' /* Comfy Cloud partner nodes + Comfy Router (2026-10-27) */] /* + the official lab API models (2026-10-23) */);
  assert.deepEqual(R.toolModels('camera').map((m) => m.key).filter((k) => /ltx|wan/.test(k)), ['wan-2.2-fun-camera-14b', 'ltx-2-19b']);
});
await t('resolveModelRequest: deterministic; precedence route > runOn > default; legacy ids untouched; errors', () => {
  const rv = (tool: string, req: any) => R.resolveModelRequest(tool, req) as any;
  for (const tool of listTools()) for (const m of R.toolModels(tool)) for (const ro of [null, 'auto', ...R.runOnsOf(tool, m)]) {
    const a = rv(tool.id, { model: m.key, runOn: ro }); const b = rv(tool.id, { model: m.key, runOn: ro }); assert.deepEqual(a, b);
    if (a.ok) { assert.ok(m.parts.some((p) => p.engine === a.provider), `${tool.id}/${m.key}/${ro}: engine ${a.provider}`); assert.equal(a.modelKey, m.key); }
  }
  assert.equal(rv('h3-video', { model: 'minimax-h3' }).provider, 'comfy-h3');
  assert.equal(rv('h3-video', { model: 'minimax-h3', route: 'comfy-cloud:cloud-h3' }).provider, 'cloud-h3');
  assert.equal(rv('h3-video', { model: 'minimax-h3', runOn: 'comfy', mode: 'r2v' }).provider, 'api-minimax-h3'); // the reference node is the Comfy route that takes r2v
  assert.equal(rv('h3-video', { model: 'minimax-h3', runOn: 'comfy', mode: 't2v' }).provider, 'comfy-h3'); // our open workflow first
  assert.deepEqual(rv('camera', { model: 'ltx-2-19b' }).allowRoutes, ['local:comfy-open', 'comfy-cloud:cloud-ltx-camera']);
  assert.match(String(rv('camera', { model: 'ltx-2-19b' }).types), /ltx-/);
  assert.equal(rv('camera', { model: 'wan-2.2-fun-camera-14b', types: '["ltx-dolly-in"]' }).code, 'preset_model_mismatch');
  assert.deepEqual(rv('remove-bg', { model: 'bria-video-background-removal' }).allowRoutes, ['comfy-router:comfy-birefnet-video', 'fal:bria/video/background-removal'] /* Comfy Router first, 2026-10-27 */);
  const legacy = rv('camera', { model: 'comfy-open' }); assert.equal(legacy.provider, 'comfy-open'); assert.equal(legacy.allowRoutes, null); assert.equal(legacy.legacy, true);
  assert.equal(rv('h3-video', { provider: 'cloud-h3-wf' }).provider, 'cloud-h3-wf'); // no model: unchanged
  assert.equal(rv('h3-video', { model: 'nope' }).code, 'unknown_model'); assert.equal(rv('h3-video', { model: 'minimax-h3', runOn: 'bfl' }).code, 'run_on_unavailable');
  assert.equal(rv('h3-video', { model: 'minimax-h3', runOn: 'mars' }).code, 'invalid_run_on'); assert.equal(rv('h3-video', { model: 'minimax-h3', provider: 'router-veo' }).code, 'model_provider_mismatch');
  assert.equal(rv('h3-video', { model: 'minimax-h3', route: 'fal:fal-ai/nano-banana-2' }).code, 'route_not_in_model');
  assert.equal(normRunOn('GPU'), 'local'); assert.equal(normRunOn('comfy'), 'comfy-cloud'); assert.equal(normRunOn('auto'), 'auto'); assert.equal(normRunOn('x'), null);
});
await t('plan(): runOn picks that account; allowRoutes keeps Auto and fallbacks inside the model', () => {
  const cam = getTool('camera')!; const rm = getTool('remove-bg')!; const h3 = getTool('h3-video')!;
  const p1 = S.resolveRoute(h3, 'comfy-h3', { types: ['t2v'], duration: 5 }, 1, { runOn: 'fal' }) as any; assert.ok(!('error' in p1)); assert.equal(p1.first.routeId, 'fal:minimax/h3/text-to-video'); assert.equal(p1.routing.runOn, 'fal');
  const p2 = S.resolveRoute(h3, 'comfy-h3', { types: ['i2v'], imagePath: 'x.png', duration: 5 }, 1, { runOn: 'fal' }) as any; assert.equal(p2.first.routeId, 'fal:minimax/h3/image-to-video');
  const p3 = S.resolveRoute(rm, 'comfy-birefnet-video', { duration: 4 }, 1, { allowRoutes: ['fal:bria/video/background-removal'], modelKey: 'bria-video-background-removal' }) as any;
  assert.equal(p3.first.routeId, 'fal:bria/video/background-removal'); assert.deepEqual(p3.routing.order, ['fal:bria/video/background-removal']); assert.equal(p3.routing.modelKey, 'bria-video-background-removal');
  const p4 = S.resolveRoute(cam, 'comfy-open', { types: ['push-in'], imagePath: 'x.png', duration: 5 }, 1, { allowRoutes: ['local:comfy-open'] }) as any; assert.equal(p4.first.routeId, 'local:comfy-open'); assert.equal(p4.routing.modelKey, 'wan-2.2-fun-camera-14b');
  const p5 = S.resolveRoute(h3, 'comfy-h3', { types: ['t2v'] }, 1, { runOn: 'bfl' }) as any; assert.equal(p5.code, 'run_on_unavailable');
});
await t('pins: per (tool, model); old per-engine pins migrate on read without the cross-tool leak', () => {
  const cam = getTool('camera')!; const os_ = getTool('object-swap')!; const rs = getTool('restyle')!;
  const camIn = { types: ['push-in'], imagePath: 'x.png', duration: 5 }; const osIn = { duration: 4 };
  // 1) old pin made on Camera for its Comfy Cloud twin route: applies on Camera, NOT on Object Swap (it used to raise pin_invalid there)
  savePrefs({ ...DEFAULT_PREFS, perModel: { 'comfy-open': { route: 'comfy-cloud:cloud-ltx-camera' } } });
  assert.equal(S.savedPinOf(cam, 'comfy-open', { types: ['ltx-dolly-in'] })?.route, 'comfy-cloud:cloud-ltx-camera');
  assert.equal(S.savedPinOf(os_, 'comfy-open', osIn), undefined);
  const po = S.resolveRoute(os_, 'comfy-open', osIn) as any; assert.ok(!po.routing?.planFallback, 'no stale-pin notice on another tool');
  const view = perToolView(getPrefs()); assert.equal(view.camera?.['ltx-2-19b']?.source, 'legacy'); assert.equal(view['object-swap'], undefined);
  // 2) an old local pin (route served everywhere) keeps applying on every tool where the engine means a model (behaviour preserved)
  savePrefs({ ...DEFAULT_PREFS, perModel: { 'comfy-open': { route: 'local:comfy-open' } } });
  for (const tl of [cam, os_, rs]) assert.equal(S.savedPinOf(tl, 'comfy-open', tl === cam ? camIn : osIn)?.route, 'local:comfy-open', tl.id);
  const v2 = perToolView(getPrefs()); assert.equal(v2['object-swap']['wan-2.2-animate-14b'].runOn, 'local'); assert.equal(v2.camera['wan-2.2-fun-camera-14b'].engine, 'comfy-open'); assert.equal(v2.camera['ltx-2-19b'].source, 'legacy');
  // 3) v2: a per-tool choice overrides the legacy pin for that (tool, model) only; Object Swap keeps its own
  savePrefs({ ...getPrefs(), perTool: { camera: { 'wan-2.2-fun-camera-14b': { runOn: 'auto' } } } });
  assert.equal(S.savedPinOf(cam, 'comfy-open', camIn)?.route, 'auto'); assert.equal(S.savedPinOf(os_, 'comfy-open', osIn)?.route, 'local:comfy-open');
  // 4) the leak is gone for new choices: Local on Camera Moves pins only Camera Moves' Wan Fun Camera model
  savePrefs({ ...DEFAULT_PREFS, perTool: { camera: { 'wan-2.2-fun-camera-14b': { runOn: 'local' } } } });
  const pc = S.resolveRoute(cam, 'comfy-open', camIn) as any; assert.equal(pc.routing.mode, 'pinned'); assert.equal(pc.first.routeId, 'local:comfy-open');
  for (const tl of [os_, rs]) { assert.equal(S.savedPinOf(tl, 'comfy-open', osIn), undefined, tl.id); const pr = S.resolveRoute(tl, 'comfy-open', osIn) as any; assert.notEqual(pr.routing?.mode, 'pinned', tl.id); }
  assert.equal(S.savedPinOf(cam, 'comfy-open', { types: ['ltx-dolly-in'] }), undefined, 'the LTX model on the same engine is a different choice');
  // 5) a runOn pin resolves to that account's best route for THIS job (fal endpoint by mode)
  savePrefs({ ...DEFAULT_PREFS, perTool: { 'h3-video': { 'minimax-h3': { runOn: 'fal' } } } });
  assert.equal((S.resolveRoute(getTool('h3-video')!, 'cloud-h3-wf', { types: ['i2v'], imagePath: 'x.png', duration: 5 }) as any).first.routeId, 'comfy-cloud:cloud-h3-wf', 'a twin engine with no fal route ignores the fal pin');
  assert.equal((S.resolveRoute(getTool('h3-video')!, 'comfy-h3', { types: ['i2v'], imagePath: 'x.png', duration: 5 }) as any).first.routeId, 'fal:minimax/h3/image-to-video');
  savePrefs(DEFAULT_PREFS);
});
await t('old jobs: modelKey / runOn derived on read; stored values win; route beats a stale stored runOn', () => {
  assert.deepEqual(R.jobModelFields({ toolId: 'camera', provider: 'comfy-open', route: 'comfy-cloud:cloud-ltx-camera', input: { types: ['ltx-dolly-in'] } }), { modelKey: 'ltx-2-19b', runOn: 'comfy-cloud', runOnLabel: 'Comfy Cloud' });
  assert.equal(R.jobModelFields({ toolId: 'camera', provider: 'comfy-open', route: 'local:comfy-open', input: { types: ['push-in'] } }).modelKey, 'wan-2.2-fun-camera-14b');
  assert.equal(R.jobModelFields({ toolId: 'h3-video', provider: 'api-minimax-h3', route: null }).runOn, 'comfy-cloud'); // pre-routing job: the engine's native route
  assert.equal(R.jobModelFields({ toolId: 'object-swap', provider: 'comfy-open' }).runOn, 'local');
  assert.equal(R.jobModelFields({ toolId: 'create-image', provider: 'api-nano-banana', route: 'fal:fal-ai/nano-banana-2/edit' }).runOn, 'fal');
  assert.equal(R.jobModelFields({ toolId: 'upscale', provider: 'direct-flux3-upscale', route: 'direct:direct-flux3-upscale' }).runOn, 'bfl');
  assert.equal(R.jobModelFields({ toolId: 'create-image', provider: 'api-reve', route: null }).modelKey, 'api-reve'); // removed model: its id, never a throw
  assert.equal(R.jobModelFields({ toolId: 'h3-video', provider: 'comfy-h3', route: 'fal:minimax/h3/text-to-video', modelKey: 'minimax-h3', runOn: 'local' }).runOn, 'fal');
  assert.equal(runOnOfRouteId('direct:bfl/flux-3-image-klein'), 'bfl'); assert.equal(runOnOfRouteId('comfy-router:router-veo'), 'comfy-cloud');
  assert.ok(getProvider('comfy-open'));
});
console.log(`model-registry: ${ok} checks passed`);
process.exit(0);
