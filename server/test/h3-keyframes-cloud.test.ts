// MiniMax H3 Keyframes · Comfy Cloud (2026-10-27): the official template video_minimax_h3_multiframe_reference as the Keyframes mode of the MiniMax H3 card.
// FAKE fetches only (no network, no key, no spend).
//  1 graph: the saved graph passes Comfy Cloud's object_info (2026-10-26 cut), fp16 video VAE, the template's sampler and turbo switch
//  2 plan: 2–5 frames × 768p / 480p × lengths: frame 1 = ref_image_0, one chained Add Guide per later frame at round(s × 24) (kept inside the length),
//    every frame on ref_images (<Picture N>), prompt / seconds / seed / size / turbo; refusals
//  3 shared rules: spreadTimes, keyframeTimesIssue, parseKeyframeTimes
//  4 routes + price + job: a twin route of comfy-h3 for mode keyframes only; the local route refuses it; estimate row; quote = charge; the job parser
//  5 run (fake Comfy Cloud): unmeasured → nothing sent; allowed → frames uploaded and the graph submitted
// Run: npx tsx test/h3-keyframes-cloud.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3kf-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const KEY = 'comfyui-fake-h3kf-key-123';
const F = await import('../src/comfy/h3KeyframesCloud.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES, routeRunnable } = await import('../src/routing/runnable.ts');
const { routeCredits, routeInput } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { getProvider, providerOpenWeights } = await import('../src/providers.ts');
const { WORKFLOWS_DIR } = await import('../src/config.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-h3-keyframes-cloud-2026-10-26.json'), 'utf8'));
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
const clean = (label: string, g: Record<string, any>) => { const c = checkCloudGraph(g, OI); assert.deepEqual(c.errors, [], `${label}: ${c.errors.join(' | ')}`); assert.deepEqual(c.warnings, [], `${label}: ${c.warnings.join(' | ')}`); };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const frames = (n: number) => Array.from({ length: n }, (_, k) => `/x/frame${k + 1}.png`);
const plan = (input: Record<string, any>) => buildCloudPlan({ id: 'j1', toolId: 'h3-video', provider: F.H3KF_PROVIDER, input: { mode: 'keyframes', ...input } });
/** The Add Guide chain from the BasicGuider back to the Reference to Video node: [guide id, frame index, image file]. */
const chain = (g: Record<string, any>) => { const out: [string, number, string][] = []; let cur = g['126'].inputs.conditioning[0];
  while (cur !== '136') { const n = g[cur]; const sec = g[g[n.inputs.frame_idx[0]].inputs['values.a'][0]].inputs.value; out.push([cur, Math.round(sec * 24), g[n.inputs.image[0]].inputs.image.__file]); cur = n.inputs.positive[0]; }
  return out.reverse(); };
try {
  // ---- 1. graph ----
  { const g = load(F.H3KF_GRAPH); clean('saved graph', g);
    assert.equal(g['119'].inputs.vae_name, 'minimax_h3_video_vae_fp16.safetensors', 'the fp16 video VAE (int8 ConvRot is not on Cloud)'); assert.equal(g['127'].inputs.unet_name, 'minimax_h3_ref2va_pruned_int8_convrot.safetensors');
    assert.equal(g['123'].inputs.sampler_name, 'res_multistep'); assert.equal(g['145'].inputs.lora_name, 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors'); assert.deepEqual([g['143'].inputs.value, g['144'].inputs.value], [20, 4]);
    assert.equal(g['92'].class_type, 'SaveVideo'); assert.ok(!Object.values<any>(g).some((n) => n.class_type === 'MarkdownNote'));
    for (const m of F.H3KF_REQUIRES.models) { const s = OI[m.loader].input.required[m.field]; const o = Array.isArray(s[0]) ? s[0] : s[1].options; assert.ok(o.includes(m.file), `${m.file} on Comfy Cloud`); } }
  ok('graph: the official template passes Comfy Cloud\'s object_info, fp16 video VAE, res_multistep, turbo LoRA behind its switch (20 / 4 steps), every model file in the shared library');

  // ---- 2. plan ----
  let n = 0;
  for (const k of [2, 3, 4, 5]) for (const resolution of ['768p', '480p']) for (const s of [5, 8, 15]) {
    const pl = plan({ prompt: 'a dancer, then <Picture 2>', finalPrompt: 'a dancer, then <Picture 2>', duration: s, resolution, aspect: '9:16', seed: 7, keyframePaths: frames(k), refPaths: frames(k) });
    const g = pl.passes[0].graph; clean(`${k} frames ${resolution} ${s}s`, g); n++;
    assert.equal(pl.passes[0].workflow, F.H3KF_GRAPH); assert.equal(g['132'].inputs.value, s); assert.equal(g['129'].inputs.noise_seed, 7); assert.equal(g['138'].inputs.value, 'a dancer, then <Picture 2>');
    assert.deepEqual([g['115'].inputs.aspect_ratio, g['115'].inputs.megapixels], ['9:16 (Portrait Widescreen)', resolution === '480p' ? 0.4 : 0.98]); assert.equal(g['146'].inputs.value, false, 'Quality = 20 steps');
    assert.deepEqual(g['164'].inputs.image, { __file: '/x/frame1.png' }); assert.deepEqual(g['136'].inputs['ref_images.ref_image_0'], ['164', 0]);
    const c = chain(g); const times = F.spreadTimes(k, s);
    assert.deepEqual(c.map((x) => x[2]), frames(k).slice(1), 'one guide per later frame, in order'); assert.deepEqual(c.map((x) => x[1]), times.slice(1).map((t) => F.h3kfFrameIndex(t, s)));
    assert.ok(c.every((x) => x[1] < F.h3kfLength(s)), 'every guide inside the length');
    for (let j = 1; j < k; j++) assert.deepEqual(g['136'].inputs[`ref_images.ref_image_${j}`], [c[j - 1][0] === '147' ? '157' : c[j - 1][0] === '162' ? '159' : c[j - 1][0] === '169' ? '167' : g[c[j - 1][0]].inputs.image[0], 0], `<Picture ${j + 1}>`);
    assert.ok(!g['136'].inputs[`ref_images.ref_image_${k}`]); }
  { const g = plan({ prompt: 'x', duration: 8, resolution: '480p', quality: 'fast', keyframePaths: frames(5), keyframeTimes: '[0, 2, 4, 6, 8]' }).passes[0].graph;
    assert.equal(g['146'].inputs.value, true, 'Fast = the template\'s 4-step turbo LoRA'); assert.deepEqual(chain(g).map((x) => x[1]), [48, 96, 144, 191], '8 s = 192 frames: the last frame is index 191'); }
  assert.throws(() => plan({ prompt: 'x', duration: 5, keyframePaths: frames(1) }), /2 to 5 frames/); assert.throws(() => plan({ prompt: 'x', duration: 5, keyframePaths: frames(6) }), /2 to 5 frames/);
  assert.throws(() => plan({ prompt: 'x', duration: 4, keyframePaths: frames(2) }), /5–15 s/); assert.throws(() => plan({ prompt: 'x', duration: 5, keyframePaths: frames(3), keyframeTimes: [0, 3, 2] }), /has to come after/);
  assert.throws(() => plan({ mode: 't2v', prompt: 'x', duration: 5, keyframePaths: frames(2) }), /only makes Keyframes/);
  ok(`plan: ${n} variants (2–5 frames × 768p / 480p × 5 / 8 / 15 s) pass Cloud, guides chained in order at round(s × 24), every frame a <Picture N>; Fast = turbo; refusals`);

  // ---- 3. shared rules ----
  assert.deepEqual(F.spreadTimes(4, 5), [0, 1.5, 3.5, 5]); assert.deepEqual(F.spreadTimes(2, 5), [0, 5]); assert.equal(F.h3kfLength(5), 124); assert.equal(F.h3kfLength(8), 192);
  assert.equal(F.keyframeTimesIssue([0, 1.5, 3, 5], 5), null, 'the template\'s own times'); assert.match(F.keyframeTimesIssue([1, 2], 5)!, /start of the clip/); assert.match(F.keyframeTimesIssue([0, 6], 5)!, /after the end/);
  assert.deepEqual(F.parseKeyframeTimes('[0,1.5]'), [0, 1.5]); assert.deepEqual(F.parseKeyframeTimes('0, 2'), [0, 2]); assert.equal(F.parseKeyframeTimes(''), null);
  assert.equal(F.jobModeOf({ types: '["keyframes"]' }), 'keyframes'); assert.equal(F.jobModeOf({ types: 'keyframes' }), 'keyframes'); assert.equal(F.jobModeOf({ types: ['t2v'] }), 't2v');
  ok('shared rules: even spread on 0.5 s, the template\'s 0 / 1.5 / 3 / 5 s pass, times checked, any types format');

  // ---- 4. routes + price + job ----
  const tool = getTool('h3-video')!; const pm = (tool as any).app?.providerModes;
  assert.ok(pm['comfy-h3'].includes('keyframes') && pm[F.H3KF_PROVIDER].join() === 'keyframes'); assert.ok((tool.presets ?? []).some((p) => p.id === 'keyframes' && p.label === 'Keyframes' && !p.prompt), 'no mode words in front of the prompt');
  const rs = routesFor('comfy-h3', tool); const tw = rs.find((r) => r.routeId === F.H3KF_ROUTE)!; assert.ok(tw, 'a route of the MiniMax H3 card'); assert.deepEqual(tw.modes, ['keyframes']); assert.equal(tw.label, 'Comfy Cloud');
  const local = rs.find((r) => r.kind === 'local')!; assert.equal(local.unavailableFor!({ mode: 'keyframes', duration: 5 }), F.KEYFRAMES_CLOUD_ONLY); assert.equal(local.unavailableFor!({ mode: 't2v', duration: 5 }), null);
  for (const t of ['app-transition', 'app-ugc-ad']) { const at = getTool(t); if (at) assert.ok(!routesFor('comfy-h3', at).some((r) => r.routeId === F.H3KF_ROUTE), `${t} never lists the Keyframes route`); }
  assert.ok((await import('../src/routing/routes.ts')).NOT_A_CHOICE.has(F.H3KF_ROUTE), 'never a Run-on choice (picked by the mode alone)');
  for (const r of rs) if (r.routeId !== F.H3KF_ROUTE && r.kind !== 'local') assert.ok(r.modes && !r.modes.includes('keyframes'), `${r.routeId} never takes Keyframes`);
  { const pv = getProvider(F.H3KF_PROVIDER)!; assert.equal(pv.name, F.H3KF_NAME); assert.ok(providerOpenWeights(pv), 'open weights');
    const row = HOSTED_BY_ID[F.H3KF_PROVIDER]; assert.ok(row?.priceUnmeasured && row.estimated); assert.match(row.note!, /billed by GPU time/); assert.ok(row.usdByQuality!['768p'] > row.usdByQuality!['480p']);
    assert.ok(CLOUD_RUNNER_ROUTES.has(F.H3KF_ROUTE)); assert.ok(routeRunnable(tw)); const w = CLOUD_WORKFLOWS[F.H3KF_ROUTE]; assert.ok(isStandalone(w) && w.target === 'cloud' && !w.preflight); }
  const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
  const seen: Record<string, number> = {};
  for (const [s, res] of [[5, '768p'], [5, '480p'], [10, '768p']] as const) {
    const qs = new URLSearchParams({ provider: 'comfy-h3', duration: String(s), resolution: res, types: 'keyframes' });
    const r = await app.inject({ url: `/api/tools/h3-video/price?${qs}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json(); assert.equal(b.route, F.H3KF_ROUTE, JSON.stringify(b).slice(0, 300));
    const quoted = b.listCredits ?? b.credits; const charge = routeCredits(tool, tw, routeInput(tool, { mode: 'keyframes', types: ['keyframes'], duration: s, resolution: res, prompt: 'x', keyframePaths: frames(2) }))!;
    assert.equal(quoted, charge, `${s} s ${res}: quote ${quoted} = charge ${charge}`); seen[`${s}s ${res}`] = quoted; }
  assert.ok(seen['10s 768p'] > seen['5s 768p'] && seen['5s 768p'] > seen['5s 480p'], JSON.stringify(seen)); await app.close();
  { const png = (n: string) => { fs.copyFileSync(path.join(import.meta.dirname, '..', '..', 'web', 'public', 'favicon-16.png'), path.join(D, n)); return n; };
    const kf = ['a.png', 'b.png', 'c.png'].map(png);
    const r: any = await tool.parseInput({ types: '["keyframes"]', prompt: 'subject_definitions:\n<Subject 1> is the dancer in <Picture 1>.', provider: 'comfy-h3', duration: '5', resolution: '768p', keyframeTimes: '[0,2,5]' }, { keyframes: kf });
    assert.ok(!r.error, r.error); assert.deepEqual(r.keyframeTimes, [0, 2, 5]); assert.equal(r.keyframePaths.length, 3); assert.equal(r.refPaths.length, 3, '<Picture 1–3>');
    assert.ok(r.finalPrompt.startsWith('subject_definitions:'), 'the official format goes as written');
    const one: any = await tool.parseInput({ types: '["keyframes"]', prompt: 'x', provider: 'comfy-h3', duration: '5' }, { keyframes: [kf[0]] }); assert.match(one.error, /2 to 5 frames/);
    const late: any = await tool.parseInput({ types: '["keyframes"]', prompt: 'x', provider: 'comfy-h3', duration: '5', keyframeTimes: '[0,7]' }, { keyframes: kf.slice(0, 2) }); assert.match(late.error, /after the end/);
    const even: any = await tool.parseInput({ types: '["keyframes"]', prompt: 'x', provider: 'comfy-h3', duration: '5' }, { keyframes: kf }); assert.deepEqual(even.keyframeTimes, [0, 2.5, 5], 'none sent = evenly spread'); }
  ok(`routes + price + job: the H3 card's Keyframes place (Comfy Cloud only), estimate row, quote = charge ${JSON.stringify(seen)}; the job parser takes 2–5 frames with valid times`);

  // ---- 5. run on a fake Comfy Cloud ----
  const runOnce = async () => { const calls: { url: string; method: string; body?: any }[] = [];
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); calls.push({ url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}` }); if (url.endsWith('/api/v2/jobs')) return json({ id: 'j1' });
      if (url.endsWith('/api/v2/jobs/j1')) return json({ status: 'succeeded', outputs: [{ node_id: '92', id: 'o1', name: 'h3.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(Buffer.from('fake-mp4'), { status: 200 }); }) as typeof fetch, 1);
    for (const f of ['k1.png', 'k2.png', 'k3.png']) fs.writeFileSync(path.join(D, f), 'png');
    const kp = ['k1.png', 'k2.png', 'k3.png'].map((f) => path.join(D, f));
    const job: any = { id: `kf${Math.random().toString(36).slice(2, 7)}`, toolId: 'h3-video', provider: 'comfy-h3', route: F.H3KF_ROUTE, input: { mode: 'keyframes', types: ['keyframes'], prompt: 'a dancer', finalPrompt: 'a dancer', duration: 5, resolution: '480p', aspect: '16:9', seed: 3, keyframePaths: kp, refPaths: kp, keyframeTimes: [0, 2, 5] }, status: 'queued', outputs: [] };
    let err: Error | null = null; try { await runCloudWorkflow(job, findRoute(F.H3KF_ROUTE)!, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  process.env.COMFY_API_KEY = KEY;
  { const a = await runOnce(); assert.equal(a.calls.length, 0, 'unmeasured price: nothing sent'); assert.equal(a.job.reasonCode, 'price_unmeasured'); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1';
  { const a = await runOnce(); assert.equal(a.err, null, String(a.err?.message)); const wf = a.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs'))!.body.workflow;
    assert.equal(a.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/v2/assets')).length, 3, 'three frames uploaded'); assert.deepEqual(chain(Object.fromEntries(Object.entries<any>(wf).map(([k, v]) => [k, { ...v, inputs: { ...v.inputs, ...(v.class_type === 'LoadImage' ? { image: { __file: String(v.inputs.image) } } : {}) } }]))).map((x) => x[1]), [48, 120]);
    assert.equal(a.job.status, 'done', a.job.error); assert.ok(!JSON.stringify(a.job).includes(KEY)); }
  ok('run: unmeasured → nothing sent; allowed → three frames uploaded, guides at frames 48 and 120, done');
  console.log('ALL OK h3-keyframes-cloud');
} finally { setCloudFetch(null); delete process.env.COMFY_API_KEY; process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; fs.rmSync(D, { recursive: true, force: true }); }
