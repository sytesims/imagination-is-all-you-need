// B2 + B7 unit (Oct 19): the generalised Comfy Cloud workflow runner with a FAKE transport (mocked fetch: no network, no key, no spend).
//  - registry = runnable gate (CLOUD_RUNNER_ROUTES), every cloud graph node-compatible with its local twin (static widget overrides only)
//  - buildCloudPlan: cloud-h3-wf / cloud-ltx-camera (+ end frame) / cloud-reshoot passes move onto workflows/cloud/*, plan-set values kept,
//    a pass with no cloud graph (Wan camera move) is refused before anything is uploaded
//  - full run (runCloudWorkflow → runNative → ComfyCloudV2): upload → submit (Idempotency-Key) → poll → download → output file
//  - poll 404 = cloud_job_gone (stops, no resubmit); 422 idempotency_key_reuse = submit_uncertain (never resent)
//  - B7 cancelOrphan: interrupted attempt ends failed, the stored Cloud job id gets ONE cancel; no id / not a cloud route → no call
//  - gate: with a key a cloud workflow route is runnable AND real on any backend (never a charged mock render)
// Run: npx tsx test/cloud-runner.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudrun-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_BACKEND = 'mock'; process.env.OPENHIGGSFIELD_ROUTING_LIVE = '';
process.env.OPENHIGGSFIELD_FILMING_FILE = path.join(D, 'nofilm.json'); process.env.COMFY_API_KEY = 'comfyui-fake-test-key';
const ok = (m: string) => console.log('ok ' + m);
const { CLOUD_WORKFLOWS, cloudOverrides, buildCloudPlan } = await import('../src/comfy/cloudWorkflows.ts');
const { CLOUD_RUNNER_ROUTES, routeRunnable } = await import('../src/routing/runnable.ts');
const { ComfyCloudV2, CloudError } = await import('../src/comfy/cloudV2.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { cancelOrphan, setOrphanCancel } = await import('../src/routing/orphans.ts');
type Call = { url: string; method: string; headers: Record<string, string>; body?: any };
const mk = (handler: (c: Call, n: number) => Response | Promise<Response>) => { const calls: Call[] = [];
  const f = (async (u: any, init: any = {}) => { const c: Call = { url: String(u), method: init.method ?? 'GET', headers: { ...(init.headers ?? {}) }, body: init.body }; calls.push(c); return handler(c, calls.length); }) as typeof fetch;
  return { f, calls }; };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
try {
  // registry = gate; graphs compatible
  assert.deepEqual([...CLOUD_RUNNER_ROUTES].sort(), Object.keys(CLOUD_WORKFLOWS).sort());
  for (const w of Object.values(CLOUD_WORKFLOWS)) if ('files' in w) for (const [l, c] of Object.entries(w.files)) { assert.ok(fs.existsSync(path.resolve(import.meta.dirname, '../../workflows', c)), c); cloudOverrides(l, c); }
  assert.deepEqual(cloudOverrides('h3-t2v-api.json', 'cloud/h3-t2v-api.json'), { '140:119': { vae_name: 'minimax_h3_video_vae_fp16.safetensors' } });
  ok(`registry (${Object.keys(CLOUD_WORKFLOWS).join(', ')}) = CLOUD_RUNNER_ROUTES; every workflows/cloud graph is node-compatible with its local twin`);
  // gate: a cloud workflow route is runnable (with a key: real run on any backend); API-node routes never
  for (const id of CLOUD_RUNNER_ROUTES) assert.equal(routeRunnable({ kind: 'comfy-cloud', routeId: id } as any), true, id);
  assert.equal(routeRunnable({ kind: 'comfy-cloud', routeId: 'comfy-cloud:cloud-h3' } as any), false, 'API-node route never runnable');
  { const { cloudLive } = await import('../src/routing/cloudRun.ts'); for (const id of CLOUD_RUNNER_ROUTES) if (!id.startsWith('comfy-deploy:')) assert.equal(cloudLive({ routeId: id, envKey: 'COMFY_API_KEY' }), true, `${id} live with a key on the mock backend`); // deployment routes: test/deploy-runner.test.ts
    assert.equal(cloudLive({ routeId: 'comfy-cloud:cloud-h3-wf', envKey: 'NO_SUCH_KEY_X' }), false); }
  ok('gate: cloud workflow routes are runnable and live (real run, never a mock render) with a key; API-node routes never runnable');
  // plans
  const IMG = path.join(D, 'in.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', IMG]);
  const END = path.join(D, 'end.png'); fs.copyFileSync(IMG, END);
  { const p = buildCloudPlan({ id: 'h1', toolId: 'h3-video', provider: 'cloud-h3-wf', input: { mode: 'i2v', prompt: 'a red kite', duration: 5, imagePath: IMG } });
    assert.equal(p.passes[0].workflow, 'cloud/h3-i2v-api.json'); assert.equal(p.passes[0].graph['105:11'].inputs.vae_name, 'minimax_h3_video_vae_fp16.safetensors');
    assert.ok(JSON.stringify(p.passes[0].graph).includes('a red kite')); }
  { const p = buildCloudPlan({ id: 'c1', toolId: 'camera', provider: 'cloud-ltx-camera', input: { types: ['ltx-dolly-in'], prompt: 'a lighthouse', duration: 3, imagePath: IMG, seed: 7 } });
    assert.equal(p.passes.length, 1); assert.equal(p.passes[0].workflow, 'cloud/camera-ltx-api.json'); const g = p.passes[0].graph;
    assert.match(g['300'].inputs.lora_name, /camera-control-dolly-in/); assert.equal(g['92:11'].inputs.noise_seed, 7); assert.match(JSON.stringify(g['92:3'].inputs), /a lighthouse/);
    assert.deepEqual(g['98'].inputs.image, { __file: IMG }); }
  { const p = buildCloudPlan({ id: 'c2', toolId: 'camera', provider: 'cloud-ltx-camera', input: { types: ['ltx-jib-up'], prompt: 'p', duration: 5, imagePath: IMG, endImagePath: END } });
    assert.equal(p.passes[0].workflow, 'cloud/camera-ltx-flf-api.json'); }
  assert.throws(() => buildCloudPlan({ id: 'c3', toolId: 'camera', provider: 'cloud-ltx-camera', input: { types: ['orbit'], prompt: 'p', duration: 5, imagePath: IMG } }), /no Comfy Cloud graph yet/);
  { const p = buildCloudPlan({ id: 'r1', toolId: 'reshoot', provider: 'cloud-reshoot', input: { videoPath: path.join(D, 'src.mp4'), duration: 4, resolution: '720p', width: 1280, height: 720, angles: [{ start: 0, end: 2, angle: 'dolly-in' }] } });
    assert.ok(p.passes.length >= 1); assert.ok(p.passes.every((x) => x.workflow === 'cloud/reshoot-cloud-api.json')); }
  ok('buildCloudPlan: H3 i2v (fp16 VAE swapped in, prompt kept), LTX camera (LoRA/seed/prompt/image kept) + end frame → camera-ltx-flf, re-shoot → reshoot-cloud; a Wan move is refused');
  // full run through the fake transport
  const MP4 = path.join(D, 'out.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1:r=24', '-pix_fmt', 'yuv420p', MP4]); const bytes = fs.readFileSync(MP4);
  { let polls = 0; const { f, calls } = mk((c) => {
      if (c.url.endsWith('/api/v2/assets')) return json({ id: 'a-1', file_path: 'in.png' }, 201);
      if (c.url.endsWith('/api/v2/jobs') && c.method === 'POST') return json({ id: 'cj-1', status: 'queued' }, 201);
      if (c.url.endsWith('/api/v2/jobs/cj-1')) { polls++; return json(polls < 2 ? { id: 'cj-1', status: 'running', progress: { value: 0.4 } } : { id: 'cj-1', status: 'succeeded', outputs: [{ node_id: '75', name: 'o.mp4', type: 'video', content_type: 'video/mp4', id: 'o1', url: 'https://cc.test/api/v2/assets/o1/content' }] }); }
      if (c.url.endsWith('/api/v2/assets/o1/content')) return new Response(null, { status: 302, headers: { location: 'https://signed.example/o1?sig=x' } });
      if (c.url.startsWith('https://signed.example/')) return new Response(bytes, { status: 200 });
      return json({ error: { code: 'not_found', message: 'x' } }, 404); });
    setCloudFetch(f, 1);
    const job: any = { id: 'run1', toolId: 'camera', provider: 'cloud-ltx-camera', status: 'running', stage: 'queued', progress: 0, input: { types: ['ltx-dolly-in'], prompt: 'a lighthouse', duration: 3, imagePath: IMG }, outputs: [], warnings: [] };
    const attempt: any = { n: 1, routeId: 'comfy-cloud:cloud-ltx-camera', status: 'running', charged: 0, refunded: 0 };
    await runCloudWorkflow(job, { routeId: 'comfy-cloud:cloud-ltx-camera', envKey: 'COMFY_API_KEY' } as any, attempt);
    assert.equal(job.status, 'done', job.error); assert.equal(job.cloudJobId, 'cj-1'); assert.equal(attempt.requestId, 'cj-1'); assert.ok(job.outputs.length >= 1);
    const sub = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs')); assert.equal(sub.length, 1, 'one submit'); assert.match(sub[0].headers['Idempotency-Key'], /^run1-a1-p/);
    const wfSent = JSON.parse(sub[0].body).workflow; assert.deepEqual(wfSent['98'].inputs.image, { __type: 'core/ASSET', info: { id: 'a-1', file_path: 'in.png' } });
    assert.ok(!calls.find((c) => c.url.startsWith('https://signed.example/'))!.headers.Authorization, 'signed URL fetched without the key');
    assert.deepEqual(job.input.comfyPlan.passes.map((p: any) => p.workflow), ['cloud/camera-ltx-api.json']);
    ok('full run on the fake transport: upload → one submit (Idempotency-Key run1-a1-p*) with core/ASSET → poll → 302 download without the key → job done, cloudJobId stored');
    setCloudFetch(null); }
  // poll 404 → cloud_job_gone; 422 idempotency_key_reuse → submit_uncertain
  { const { f, calls } = mk((c) => (c.method === 'POST' ? json({ id: 'cj-2' }, 201) : json({ error: { code: 'not_found', message: 'gone' } }, 404)));
    const c = new ComfyCloudV2('https://cc.test', 'k', 'g1-a1', f, 1);
    await assert.rejects(c.run({ '1': { class_type: 'X', inputs: {} } }), (e: any) => e instanceof CloudError && e.reasonCode === 'cloud_job_gone' && e.temporary === false);
    assert.equal(calls.filter((x) => x.method === 'POST').length, 1, 'never resubmitted'); }
  { const { f, calls } = mk(() => json({ error: { code: 'idempotency_key_reuse', message: 'reused' } }, 422)); const c = new ComfyCloudV2('https://cc.test', 'k', 'g2-a1', f, 1);
    await assert.rejects(c.run({ '1': { class_type: 'X', inputs: {} } }), (e: any) => e.reasonCode === 'submit_uncertain'); assert.equal(calls.length, 1); }
  { const { f } = mk((c) => (c.url.includes('/gone') ? json({ error: { code: 'not_found' } }, 404) : json({ id: 'x', status: 'running' }))); const c = new ComfyCloudV2('https://cc.test', 'k', 'g3', f, 1);
    assert.equal(await c.status('gone'), null); assert.equal((await c.status('x')).status, 'running'); assert.equal(await c.cancel('gone'), true); }
  ok('poll 404 → cloud_job_gone (not temporary, no resubmit); 422 idempotency_key_reuse → submit_uncertain (one call); status() null when gone; cancel() of a gone job counts as done');
  // B7 orphan cancel
  { const seen: string[] = []; setOrphanCancel(async (id) => { seen.push(id); return true; });
    const j: any = { id: 'orph1', toolId: 'camera', provider: 'cloud-ltx-camera', input: {}, cloudJobId: 'cj-9', routeAttempts: [{ n: 1, routeId: 'comfy-cloud:cloud-ltx-camera', status: 'running', charged: 30, refunded: 0, requestId: 'cj-9' }] };
    assert.equal(await cancelOrphan(j), true); assert.deepEqual(seen, ['cj-9']); assert.equal(j.routeAttempts[0].status, 'failed'); assert.equal(j.routeAttempts[0].remoteCanceled, true); assert.equal(j.orphanCanceled.ok, true);
    const local: any = { id: 'orph2', toolId: 'camera', provider: 'comfy-open', input: {}, routeAttempts: [{ n: 1, routeId: 'local:comfy-open', status: 'running', charged: 0, refunded: 0 }] };
    assert.equal(await cancelOrphan(local), false); assert.equal(local.routeAttempts[0].status, 'failed'); assert.deepEqual(seen, ['cj-9'], 'local orphan: no remote call');
    const noId: any = { id: 'orph3', toolId: 'camera', provider: 'cloud-ltx-camera', input: {}, routeAttempts: [{ n: 1, routeId: 'comfy-cloud:cloud-ltx-camera', status: 'running', charged: 30, refunded: 0 }] };
    assert.equal(await cancelOrphan(noId), false); assert.deepEqual(seen, ['cj-9'], 'never submitted: nothing to cancel');
    setOrphanCancel(async () => { throw new Error('net down'); }); const j2: any = { ...j, id: 'orph4', routeAttempts: [{ ...j.routeAttempts[0], status: 'running' }] };
    assert.equal(await cancelOrphan(j2), false); assert.equal(j2.orphanCanceled.ok, false);
    setOrphanCancel(null); }
  ok('B7 cancelOrphan: interrupted attempt → failed; stored Cloud job id gets one cancel (remoteCanceled); local / never-submitted orphans make no call; a failing cancel never throws');
  console.log('ALL OK cloud-runner');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
