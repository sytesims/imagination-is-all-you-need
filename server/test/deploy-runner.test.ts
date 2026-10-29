// H3 runner Step 1 (Oct 26): "Your Comfy deployment" with FAKE fetches only (no network, no key, no spend).
//  - env state: names only, never values (COMFY_DEPLOY_URL + COMFY_API_KEY, or COMFY_RUNNER_URL [+ COMFY_RUNNER_TOKEN]); bad URL / missing key
//  - per-route base URL: a deployment route goes to the deployment (Bearer key), a Comfy Cloud route still goes to cloud.comfy.org
//  - standalone entry: own plan builder (smoke graph LoadImage → ImageInvert → SaveImage), no twin; price gate refuses it until measured
//  - the free probe: health → job-list fallback → key / 501 / 404 / unreachable; nodes=1 reads object_info and lists missing nodes + model files
//  - routing: findRoute, run-on (Comfy), comfyVariant 'deployment', tier 0; orphan cancel goes to the deployment; endpoints (confirm gate, no values)
// Run: npx tsx test/deploy-runner.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'deployrun-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_BACKEND = 'mock';
process.env.OPENHIGGSFIELD_FILMING_FILE = path.join(D, 'nofilm.json'); process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0';
const KEY = 'comfyui-fake-deploy-key-123'; const TOKEN = 'fake-runner-token-456'; const DEP = 'https://my-dep.run.comfy.app';
const clear = () => { for (const k of ['COMFY_DEPLOY_URL', 'COMFY_API_KEY', 'COMFY_RUNNER_URL', 'COMFY_RUNNER_TOKEN']) delete process.env[k]; };
clear();
const ok = (m: string) => console.log('ok ' + m);
const { deployState, deployTarget, probeDeploy, comboOf, deployNeeds } = await import('../src/comfy/deploy.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { cloudLive, cloudTargetFor, runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { DEPLOY_SMOKE_ROUTE, deployRoute } = await import('../src/routing/deployRoutes.ts');
const { findRoute, tierOf } = await import('../src/routing/routes.ts');
const { comfyVariantOf } = await import('../src/routing/modelRegistry.ts');
const { runOnOfRouteId, runOnOfRoute, normRunOn } = await import('../src/shared/modelIds.ts');
const { HOSTED_BY_ID, deployUsd } = await import('../src/shared/hostedPrices.ts');
const { cancelOrphan } = await import('../src/routing/orphans.ts');
type Call = { url: string; method: string; headers: Record<string, string> };
const mk = (h: (c: Call, n: number) => Response | Promise<Response>) => { const calls: Call[] = [];
  const f = (async (u: any, init: any = {}) => { const c: Call = { url: String(u), method: init.method ?? 'GET', headers: { ...(init.headers ?? {}) } }; calls.push(c); return h(c, calls.length); }) as typeof fetch; return { f, calls }; };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const noLeak = (o: unknown) => { const s = JSON.stringify(o); for (const v of [KEY, TOKEN, DEP, 'my-dep']) assert.ok(!s.includes(v), `value leaked: ${v}`); };
try {
  // ---- env state ----
  assert.equal(deployTarget(), null); assert.equal(deployState().reasonCode, 'deploy_missing'); assert.match(deployState().reason!, /COMFY_DEPLOY_URL/);
  process.env.COMFY_DEPLOY_URL = 'not a url'; process.env.COMFY_API_KEY = KEY; assert.equal(deployState().reasonCode, 'deploy_url_invalid'); assert.equal(deployTarget(), null);
  process.env.COMFY_DEPLOY_URL = DEP + '/'; delete process.env.COMFY_API_KEY; assert.equal(deployState().reasonCode, 'key_missing'); assert.equal(deployTarget(), null);
  process.env.COMFY_API_KEY = KEY; assert.deepEqual(deployTarget(), { via: 'comfy-deploy', base: DEP, token: KEY }); assert.equal(deployState().configured, true); noLeak(deployState());
  process.env.COMFY_RUNNER_URL = 'http://10.0.0.5:8189'; assert.equal(deployTarget()!.via, 'comfy-deploy', 'COMFY_DEPLOY_URL wins');
  delete process.env.COMFY_DEPLOY_URL; assert.deepEqual(deployTarget(), { via: 'runner', base: 'http://10.0.0.5:8189', token: '' }, 'runner without a token (keyless proxy)');
  process.env.COMFY_RUNNER_TOKEN = TOKEN; assert.equal(deployTarget()!.token, TOKEN);
  ok('env: nothing / bad URL / URL without key → not configured; deployment wins over runner; runner token optional; state has no values');

  // ---- registry + routing ----
  const w = CLOUD_WORKFLOWS['comfy-deploy:deploy-smoke']; assert.ok(isStandalone(w)); assert.equal(w.target, 'deploy');
  assert.ok(fs.existsSync(path.resolve(import.meta.dirname, '../../workflows', w.graphs[0])));
  const IMG = path.join(D, 'in.png'); fs.writeFileSync(IMG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  { const p = buildCloudPlan({ id: 's1', toolId: 'deploy-smoke', provider: 'deploy-smoke', input: { imagePath: IMG } });
    assert.equal(p.passes.length, 1); assert.equal(p.passes[0].workflow, 'deploy/smoke-invert-api.json'); assert.deepEqual(p.passes[0].graph['1'].inputs.image, { __file: IMG });
    assert.deepEqual(Object.values<any>(p.passes[0].graph).map((n) => n.class_type).sort(), ['ImageInvert', 'LoadImage', 'SaveImage']); }
  assert.throws(() => buildCloudPlan({ id: 's2', toolId: 'deploy-smoke', provider: 'deploy-smoke', input: {} }), /needs an input image/);
  assert.equal(findRoute('comfy-deploy:deploy-smoke')?.label, 'Your Comfy deployment'); assert.equal(findRoute('comfy-deploy:nope'), undefined);
  assert.equal(runOnOfRouteId('comfy-deploy:deploy-smoke'), 'comfy-cloud'); assert.equal(runOnOfRoute(DEPLOY_SMOKE_ROUTE), 'comfy-cloud'); assert.equal(normRunOn('comfy-deploy'), 'comfy-cloud');
  assert.equal(comfyVariantOf(DEPLOY_SMOKE_ROUTE), 'deployment'); assert.equal(tierOf(DEPLOY_SMOKE_ROUTE), 0);
  assert.equal(deployRoute('comfy-h3', 'cloud-h3-charswap').routeId, 'comfy-deploy:cloud-h3-charswap');
  const row = HOSTED_BY_ID['deploy-smoke']; assert.equal(row.priceUnmeasured, true); assert.equal(row.usd, deployUsd(60)); assert.equal(deployUsd(3600), 3.49); assert.equal(deployUsd(100, 'h100-80gb'), 0.18);
  ok('standalone smoke entry: own plan (core nodes, uploaded image), no twin; route comfy-deploy:deploy-smoke = Run on Comfy, variant deployment, tier 0; priceUnmeasured row ≈ GPU $/h × s');

  // ---- per-route base URL + live gate ----
  clear(); process.env.COMFY_API_KEY = KEY;
  assert.equal(cloudLive(DEPLOY_SMOKE_ROUTE), false, 'key alone does not make a deployment route live');
  assert.deepEqual(cloudTargetFor({ routeId: 'comfy-cloud:cloud-h3-wf', envKey: 'COMFY_API_KEY' }), { base: 'https://cloud.comfy.org', token: KEY });
  process.env.COMFY_DEPLOY_URL = DEP; assert.equal(cloudLive(DEPLOY_SMOKE_ROUTE), true);
  assert.deepEqual(cloudTargetFor(DEPLOY_SMOKE_ROUTE), { base: DEP, token: KEY }); assert.equal(cloudTargetFor({ routeId: 'comfy-cloud:cloud-h3-wf', envKey: 'COMFY_API_KEY' })!.base, 'https://cloud.comfy.org', 'Cloud routes unchanged');
  ok('per-route base: deployment route → COMFY_DEPLOY_URL with COMFY_API_KEY; Comfy Cloud routes still → cloud.comfy.org; live only when a deployment is set');

  // ---- full run on the fake deployment ----
  const run = async (handler: Parameters<typeof mk>[0]) => { const m = mk(handler); setCloudFetch(m.f, 1);
    const job: any = { id: `dj${Math.random().toString(36).slice(2, 7)}`, toolId: 'deploy-smoke', provider: 'deploy-smoke', route: DEPLOY_SMOKE_ROUTE.routeId, input: { imagePath: IMG }, status: 'queued' };
    let err: Error | null = null; try { await runCloudWorkflow(job, DEPLOY_SMOKE_ROUTE, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls: m.calls }; };
  const happy = (c: Call) => c.url.endsWith('/api/v2/assets') ? json({ id: 'a1' }) : c.url.endsWith('/api/v2/jobs') ? json({ id: 'j1' })
    : c.url.endsWith('/api/v2/jobs/j1') ? json({ status: 'succeeded', outputs: [{ node_id: '3', id: 'o1', name: 'ohf_deploy_smoke_00001_.png', content_type: 'image/png', url: '/api/v2/assets/o1/content' }] })
    : c.url.endsWith('/content') ? new Response(null, { status: 302, headers: { location: 'https://signed.example/o1.png' } }) : new Response(fs.readFileSync(IMG), { status: 200 });
  { const r = await run(happy); assert.equal(r.calls.length, 0, 'unmeasured price: nothing sent'); assert.equal(r.job.reasonCode, 'price_unmeasured'); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1';
  { const r = await run(happy); assert.equal(r.err, null, String(r.err)); assert.equal(r.job.status, 'done'); assert.equal(r.job.cloudJobId, 'j1');
    const toDep = r.calls.filter((c) => c.url.startsWith(DEP)); assert.ok(toDep.length >= 4); assert.ok(!r.calls.some((c) => c.url.includes('cloud.comfy.org')), 'never shared Cloud');
    for (const c of toDep) assert.equal(c.headers.Authorization, `Bearer ${KEY}`); assert.equal(r.calls.find((c) => c.url.startsWith('https://signed'))!.headers.Authorization, undefined, 'signed URL fetched without the key');
    assert.ok(r.job.outputs?.[0]?.url?.startsWith('/files/')); }
  clear(); process.env.COMFY_RUNNER_URL = 'http://127.0.0.1:18189';
  { const r = await run(happy); assert.equal(r.err, null, String(r.err)); for (const c of r.calls.filter((c) => c.url.startsWith('http://127.0.0.1:18189'))) assert.equal(c.headers.Authorization, undefined, 'keyless proxy: no auth header'); }
  clear();
  { const r = await run(happy); assert.equal(r.calls.length, 0); assert.equal(r.job.reasonCode, 'deploy_missing'); assert.match(r.err!.message, /isn't set up/); }
  process.env.COMFY_DEPLOY_URL = DEP; process.env.COMFY_API_KEY = KEY;
  { const r = await run((c) => c.url.endsWith('/api/v2/assets') ? json({ id: 'a1' }) : json({ error: { code: 'invalid_workflow' } }, 400)); assert.equal(r.job.reasonCode, 'workflow_invalid'); assert.ok(!String(r.err?.message).includes(KEY)); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; setCloudFetch(null);
  ok('run: refused while unmeasured (no call); with the measuring flag upload → submit → poll → download all on the deployment with Bearer key; runner w/o token sends no auth; not set up → deploy_missing; 400 → workflow_invalid');

  // ---- probe ----
  clear();
  { const m = mk(() => json({})); const p = await probeDeploy({ f: m.f, nodes: true }); assert.equal(p.code, 'not_configured'); assert.equal(m.calls.length, 0); }
  process.env.COMFY_DEPLOY_URL = DEP; process.env.COMFY_API_KEY = KEY;
  { const m = mk((c) => c.url.endsWith('/api/v2/health') ? json({ status: 'healthy' }) : json({})); const p = await probeDeploy({ f: m.f });
    assert.equal(p.connected, true); assert.equal(m.calls.length, 1); assert.equal(m.calls[0].method, 'GET'); assert.equal(m.calls[0].headers.Authorization, `Bearer ${KEY}`); assert.equal(p.nodes.checked, false); noLeak(p); }
  { const m = mk((c) => c.url.endsWith('/api/v2/health') ? new Response('', { status: 404 }) : c.url.endsWith('/api/v2/jobs?limit=1') ? json({ jobs: [] }) : json({})); const p = await probeDeploy({ f: m.f });
    assert.equal(p.connected, true); assert.deepEqual(m.calls.map((c) => c.url.slice(DEP.length)), ['/api/v2/health', '/api/v2/jobs?limit=1']); }
  for (const [st, code] of [[401, 'key_invalid'], [403, 'key_invalid'], [501, 'not_a_v2_host'], [500, 'error']] as const) {
    const m = mk(() => new Response('', { status: st })); const p = await probeDeploy({ f: m.f }); assert.equal(p.code, code, String(st)); assert.equal(p.connected, false); noLeak(p); }
  { const m = mk(() => new Response('', { status: 404 })); assert.equal((await probeDeploy({ f: m.f })).code, 'not_a_v2_host'); }
  { const m = mk(() => { throw new TypeError('fetch failed'); }); const p = await probeDeploy({ f: m.f }); assert.equal(p.code, 'unreachable'); noLeak(p); }
  // object_info: the smoke nodes + some H3 bits; the old list form and the COMBO form both read
  const info = { LoadImage: {}, ImageInvert: {}, SaveImage: {}, MiniMaxH3ReferenceToVideo: {}, MiniMaxH3SigmaShift: {}, SAM3_Detect: {}, H3RelayWindowPlan: {}, H3RelayWindowInputs: {}, H3RelayFinishWindows: {},
    UNETLoader: { input: { required: { unet_name: [['minimax_h3_ref2va_pruned_int8_convrot.safetensors'], {}] } } },
    LoraLoaderModelOnly: { input: { required: { lora_name: ['COMBO', { options: ['h3_character_swap_v1.5.safetensors', 'minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors'] }] } } } };
  assert.deepEqual(comboOf(info, 'UNETLoader', 'unet_name'), ['minimax_h3_ref2va_pruned_int8_convrot.safetensors']); assert.equal(comboOf(info, 'Nope', 'x').length, 0);
  { const m = mk((c) => c.url.endsWith('/api/object_info') ? json(info) : json({ status: 'healthy' })); const p = await probeDeploy({ f: m.f, nodes: true });
    assert.equal(p.nodes.checked, true); assert.equal(p.nodes.count, Object.keys(info).length);
    const by = Object.fromEntries(p.recipes.map((r) => [r.id, r])); assert.equal(by['deploy-smoke'].ready, true); assert.equal(by['h3-charswap'], undefined, 'Character Swap uses shared Cloud, not a deployment recipe');
    assert.equal(by['cloud-h3-crossview'].ready, false); for (const n of ['CrossViewWarp', 'CrossViewPrepareClip', 'MoGeInference', 'MiniMaxH3AddGuide']) assert.ok(by['cloud-h3-crossview'].missingNodes.includes(n), n); // Step 3: registered workflow
    assert.ok(by['cloud-h3-crossview'].missingModels.includes('MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1_3500.safetensors')); assert.ok(!by['cloud-h3-crossview'].missingModels.includes('minimax_h3_ref2va_pruned_int8_convrot.safetensors'));
    assert.ok(p.missing.includes('CrossViewWarp')); noLeak(p); }
  { const m = mk((c) => c.url.endsWith('/api/object_info') ? new Response('', { status: 404 }) : json({ status: 'healthy' })); const p = await probeDeploy({ f: m.f, nodes: true });
    assert.equal(p.connected, true); assert.equal(p.nodes.checked, false); assert.match(p.nodes.note!, /doesn’t share/); assert.ok(p.recipes.every((r) => r.ready === null)); }
  assert.ok(deployNeeds().some((n) => n.id === 'deploy-smoke'));
  ok('probe: not set → no call; health / job-list fallback (GET only, Bearer key); 401/403 key_invalid, 501 shared Cloud, 404 not v2, unreachable; object_info → node count + missing nodes / model files per recipe; no node list → note');

  // ---- orphan cancel goes to the deployment ----
  { const m = mk(() => json({})); const orig = globalThis.fetch; (globalThis as any).fetch = m.f;
    try { const j: any = { id: 'orph-d', provider: 'deploy-smoke', cloudJobId: 'jx', routeAttempts: [{ n: 1, routeId: 'comfy-deploy:deploy-smoke', status: 'running' }] };
      assert.equal(await cancelOrphan(j), true); assert.equal(m.calls.length, 1); assert.equal(m.calls[0].url, `${DEP}/api/v2/jobs/jx/cancel`); }
    finally { (globalThis as any).fetch = orig; } }
  ok('orphan cancel of a deployment job → POST <deployment>/api/v2/jobs/<id>/cancel (never shared Cloud)');

  // ---- endpoints ----
  { const Fastify = (await import('fastify')).default; const app = Fastify(); const { registerComfyDeploy } = await import('../src/routesComfyDeploy.ts'); registerComfyDeploy(app);
    const g = await app.inject({ method: 'GET', url: '/api/comfy-deploy' }); assert.equal(g.statusCode, 200); const gb = g.json(); assert.equal(gb.configured, true); assert.equal(gb.envVars.url, 'COMFY_DEPLOY_URL'); noLeak(gb);
    const s = await app.inject({ method: 'POST', url: '/api/comfy-deploy/smoke', payload: {} }); assert.equal(s.statusCode, 400); assert.equal(s.json().code, 'confirm_required');
    clear(); const s2 = await app.inject({ method: 'POST', url: '/api/comfy-deploy/smoke', payload: { confirm: true } }); assert.equal(s2.statusCode, 409); assert.equal(s2.json().code, 'deploy_missing');
    const pr = await app.inject({ method: 'GET', url: '/api/comfy-deploy/probe?nodes=1' }); assert.equal(pr.json().code, 'not_configured'); await app.close(); }
  ok('endpoints: GET shows names only; smoke needs confirm:true and a deployment; probe without a deployment makes no call');
  console.log('ALL OK deploy-runner');
} finally { clear(); fs.rmSync(D, { recursive: true, force: true }); }
