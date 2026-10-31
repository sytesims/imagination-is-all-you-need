// H3 Character Swap · Comfy Cloud (Oct 26): the Openjutsu recipe on shared Comfy Cloud with the user's imported LoRA. FAKE fetches only (no network,
// no key, no spend).
//  - graph: core nodes only, the Cloud model files (NVFP4 text encoder, fp16 video VAE, shared fl2v turbo), sigma shift, comfy kitchen attention,
//    LoRA chain, audio guide, SAM 3.1 edit mask on the video latent only (Oct 27)
//  - mask plan: H3 latent grid (16 px), grow, side / click point / uploaded mask / off / motion transfer, empty-frame fallback, every variant passes the
//    object_info check; presets (Openjutsu 768p default, fast 480p), turbo off (20 steps res_multistep/simple), steps + LoRA strength, form fields
//  - plan: 0.5 MP / 1.0 MP budgets in the source's shape, 17k+5 frames, 24 fps prep with sound padded to the grid, prompt (user words in <Picture 1>/<Video 1> form, else
//    "Replace <target>…", motion transfer wording), seed, silent clip (no audio refs), 9:16 source, 2–15 s range (16 s refused, 1 s refused)
//  - route: twin of the H3 Character Swap card on Object Swap + Motion Transfer, priceUnmeasured estimate row, runnable
//  - run: LoRA not imported → refused with the HF link, nothing uploaded; imported (asset search) → its loader_path in the graph;
//    asset search empty but object_info lists it → runs; checks unanswered → goes on; all calls GET first, then upload → submit on Comfy Cloud;
//    the 768p turbo import is used at 768p when the library has it
// Run: npx tsx test/h3-charswap-cloud.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; // these checks cover the held state (cloud runs before a measured price are allowed by default since 2026-10-27)
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3cs-')); Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_CLOUD_CHARSWAP_LORA', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const KEY = 'comfyui-fake-charswap-key-321';
const CS = await import('../src/comfy/h3CharSwapCloud.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES, routeRunnable } = await import('../src/routing/runnable.ts');
const { deployNeeds } = await import('../src/comfy/deploy.ts');
const { WORKFLOWS_DIR } = await import('../src/config.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const OI = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures/object-info-comfy-cloud-2026-10-26.json'), 'utf8'));
const clip = (name: string, secs: number, size = '1280x720', audio = true) => { const f = path.join(D, name);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=30:duration=${secs}`, ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${secs}`] : []), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac', '-shortest'] : []), f]); return f; };
const png = path.join(D, 'face.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:size=512x512', '-frames:v', '1', png]);
const plan = (input: Record<string, any>, toolId = 'object-swap') => buildCloudPlan({ id: 'j1', toolId, provider: CS.CHARSWAP_CLOUD_PROVIDER, input });
const base = { videoPath: '/x/v.mp4', refPaths: ['/x/face.png'], duration: 5, width: 1280, height: 720, resolution: '480p', target: 'the woman on the right', hasAudio: true, keepAudio: true, seed: 904239 };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
try {
  // ---- graph ----
  const g = JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, CS.CHARSWAP_CLOUD_GRAPH), 'utf8'));
  const cls = new Set(Object.values<any>(g).map((n) => n.class_type));
  for (const c of cls) assert.ok(!/Relay|CharacterSwap|ComfyCloud|Api|Partner/.test(c), `core node only: ${c}`);
  assert.equal(g['4'].inputs.clip_name, 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'); assert.equal(g['5'].inputs.vae_name, 'minimax_h3_video_vae_fp16.safetensors');
  assert.deepEqual([g['7'].inputs.shift_video, g['7'].inputs.shift_audio], [12, 3]); assert.deepEqual(g['8'].inputs, { model: ['7', 0], attention: 'comfy kitchen attention' });
  assert.deepEqual(g['3'].inputs.model, ['8', 0]); assert.deepEqual(g['2'].inputs.model, ['3', 0]); assert.equal(g['3'].inputs.lora_name, CS.TURBO_SHARED);
  assert.deepEqual(g['20'].inputs['ref_audios.ref_audio_0'], ['11', 1]); assert.equal(g['40'].inputs.ckpt_name, 'sam3.1_multiplex_fp16.safetensors');
  assert.equal(g['2'].inputs.strength_model, 1); assert.equal(g['23'].inputs.steps, 8); assert.equal(g['22'].inputs.sampler_name, 'er_sde'); assert.equal(g['23'].inputs.scheduler, 'normal');
  assert.deepEqual(g['24'].inputs.conditioning, ['19', 0]); assert.equal(g['28'].inputs.fps, 24);
  assert.ok(CS.CHARSWAP_CLOUD_REQUIRES.models.some((m) => m.file === 'akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors')); assert.equal(g['2'].inputs.lora_name, 'akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors');
  assert.ok(!deployNeeds().some((n) => n.id === CS.CHARSWAP_CLOUD_PROVIDER), 'a shared-Cloud workflow is not a deployment need');
  // the edit mask goes on the video half only: source frames → VAEEncode → SetLatentNoiseMask → Concat with H3's own (fresh) audio latent
  assert.deepEqual(g['63'].inputs, { pixels: ['11', 0], vae: ['5', 0] }); assert.deepEqual(g['64'].inputs, { samples: ['63', 0], mask: ['62', 0] });
  assert.deepEqual(g['65'].inputs, { av_latent: ['20', 1] }); assert.deepEqual(g['66'].inputs, { video_latent: ['64', 0], audio_latent: ['65', 1] });
  assert.deepEqual(g['19'].inputs.latent, ['66', 0]); assert.deepEqual(g['25'].inputs.latent_image, ['66', 0]);
  assert.deepEqual(g['47'].inputs.images, ['11', 0]); assert.equal(g['47'].inputs.max_objects, 1); assert.equal(g['43'].inputs.threshold, 0.35);
  assert.equal(g['50'].inputs.upscale_method, 'area'); assert.deepEqual(g['52'].inputs.mask, ['51', 0]); assert.equal(g['62'].inputs.operation, 'add');
  for (const k of CS.CHARSWAP_MASK_NODES) assert.ok(g[k], `mask node ${k} in the graph`);
  ok('graph: core nodes, Cloud model files (NVFP4 TE, fp16 VAE), shift 12/3 → comfy kitchen → turbo → character LoRA 1.0, 8 steps er_sde/normal, audio guide, 24 fps, SAM 3.1 mask on the video latent');

  // ---- plan ----
  const sizes = [[1280, 720, '480p', 928, 512], [1280, 720, '720p', 1344, 736], [1280, 720, '1080p', 1344, 736], [1280, 720, undefined, 1344, 736], [720, 1280, '480p', 512, 928], [0, 0, '480p', 928, 512], [1024, 1024, '720p', 992, 992]] as const;
  for (const [w, h, res, ew, eh] of sizes) { const p = plan({ ...base, width: w, height: h, resolution: res }); const c = p.passes[0].graph['20'].inputs; assert.deepEqual([c.width, c.height], [ew, eh], `${w}x${h} ${res}`);
    assert.equal(c.width % 32, 0); assert.equal(c.height % 32, 0); assert.ok(c.width * c.height <= (res === '480p' ? 500_000 : 1_000_000)); }
  assert.deepEqual([2, 3, 5, 8, 15].map(CS.charswapFrames), [56, 73, 124, 192, 362]); for (const f of [56, 73, 124, 192, 362]) assert.equal(f % 17, 5);
  const p5 = plan(base); const pass = p5.passes[0]; const gp = pass.graph;
  assert.equal(gp['20'].inputs.length, 124); assert.equal(gp['21'].inputs.noise_seed, 904239); assert.equal(gp['2'].inputs.lora_name, 'akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors');
  assert.match(gp['13'].inputs.value, /^Replace the woman on the right in <Video 1> with the character in <Picture 1>\./);
  assert.deepEqual(gp['12'].inputs.image, { __file: '/x/face.png' }); assert.match(gp['10'].inputs.file.__file, /charswap24\.mp4$/);
  assert.deepEqual(pass.prep![0], { kind: 'fps', src: '/x/v.mp4', out: gp['10'].inputs.file.__file, fps: 24, width: 928, height: 512, seconds: 5, frames: 124, audio: true });
  assert.equal(p5.muxSourceAudio, true); assert.equal(plan({ ...base, keepAudio: false }).muxSourceAudio, false); assert.ok(p5.notes.some((n) => /Comfy Cloud workflow \(cloud-h3-charswap\)/.test(n)));
  { const pm = plan({ ...base, target: '' }, 'motion-transfer'); assert.match(pm.passes[0].graph['13'].inputs.value, /^Rebuild <Video 1> with the character in <Picture 1>/); }
  { const pu = plan({ ...base, prompt: 'Swap the dancer on the right in @video1 for the woman in @image1' }); const v = pu.passes[0].graph['13'].inputs.value; assert.ok(!/@image1|@video1/.test(v), v); assert.match(v, /<Picture 1>/); assert.match(v, /<Video 1>/); }
  { const ps = plan({ ...base, hasAudio: false }).passes[0]; assert.equal(ps.graph['19'], undefined); assert.deepEqual(ps.graph['24'].inputs.conditioning, ['20', 0]); assert.ok(!('ref_audios.ref_audio_0' in ps.graph['20'].inputs)); assert.deepEqual(ps.graph['25'].inputs.latent_image, ['66', 0]); assert.equal(ps.prep![0].kind === 'fps' && ps.prep![0].audio, false); }
  { const p15 = plan({ ...base, duration: 15 }); assert.equal(p15.passes[0].graph['20'].inputs.length, 362); }
  assert.throws(() => plan({ ...base, duration: 16 }), /up to 15 s/); assert.throws(() => plan({ ...base, duration: 1 }), /at least 2 s/); assert.throws(() => plan({ ...base, refPaths: [], imagePath: undefined }), /character image/);
  { const pl = plan({ ...base, charswapLora: 'loras/mine/h3_character_swap_v1.5.safetensors' }); assert.equal(pl.passes[0].graph['2'].inputs.lora_name, 'loras/mine/h3_character_swap_v1.5.safetensors'); }
  process.env.COMFY_CLOUD_CHARSWAP_LORA = 'my_swap.safetensors'; assert.equal(plan(base).passes[0].graph['2'].inputs.lora_name, 'my_swap.safetensors'); delete process.env.COMFY_CLOUD_CHARSWAP_LORA;
  ok('plan: 0.5/1.0 MP budgets in the source shape (16:9, 9:16, square, unknown; no resolution → Openjutsu 768p), 17k+5 frames, 24 fps prep padded to the grid, prompt forms, silent clip, 2–15 s, LoRA name override');

  // ---- edit mask + settings ----
  const IMPORTED = [CS.CHARSWAP_LORA_DEFAULT, CS.TURBO_768_DEFAULT];
  const clean = (name: string, gg: Record<string, any>) => { const r = checkCloudGraph(gg, OI); const errs = r.errors.filter((e) => !IMPORTED.some((m) => e.includes(JSON.stringify(m))));
    assert.deepEqual(errs, [], `${name}: ${errs.join(' | ')}`); assert.deepEqual(r.warnings, [], `${name}: ${r.warnings.join(' | ')}`);
    const ids = new Set(Object.keys(gg)); for (const [id, n] of Object.entries<any>(gg)) for (const v of Object.values<any>(n.inputs)) if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string') assert.ok(ids.has(v[0]), `${name}: ${id} links to removed ${v[0]}`); };
  const variants: [string, Record<string, any>, string?][] = [['text right', {}], ['fast', { charswapPreset: 'fast' }], ['point', { point: { x: 0.72, y: 0.4 } }], ['upload', { maskPath: '/x/m.mp4', maskMode: 'upload' }],
    ['text left', { target: 'the man on the left' }], ['no side', { target: 'the dancer' }], ['mask text', { maskMode: 'text', maskPrompt: 'drummer' }], ['off', { maskMode: 'none' }], ['motion', {}, 'motion-transfer'],
    ['no turbo', { turbo: false }], ['silent', { hasAudio: false }], ['turbo 768p', { resolution: '720p', charswapTurbo: CS.TURBO_768_DEFAULT }], ['9:16 15 s', { width: 720, height: 1280, duration: 15 }], ['silent off', { hasAudio: false, maskMode: 'none' }]];
  const V: Record<string, any> = {}; for (const [name, extra, tool] of variants) { const pv = plan({ ...base, resolution: '720p', ...extra }, tool); V[name] = pv; clean(name, pv.passes[0].graph); }
  { const gt = V['text right'].passes[0].graph; assert.deepEqual([gt['50'].inputs.width, gt['50'].inputs.height], [84, 46], '1344×736 → 84×46 latent cells'); assert.deepEqual([gt['60'].inputs.width, gt['60'].inputs.height], [84, 46]);
    assert.equal(gt['53'].inputs.expand, 4, '64 px at 768p'); assert.equal(gt['41'].inputs.text, 'woman'); assert.deepEqual([gt['45'].inputs.width, gt['45'].inputs.height, gt['46'].inputs.x], [672, 736, 0], 'right: the left half is cleared');
    assert.deepEqual(gt['47'].inputs.initial_mask, ['46', 0]); assert.ok(!gt['44'] && !gt['36']); assert.equal(V['text right'].passes[0].expect.mask, 'text'); assert.match(V['text right'].notes[0], /SAM 3\.1 "woman" on the right/); }
  { const gl = V['text left'].passes[0].graph; assert.equal(gl['46'].inputs.x, 672); assert.equal(gl['41'].inputs.text, 'man'); }
  { const gn = V['no side'].passes[0].graph; assert.ok(!gn['45'] && !gn['46']); assert.deepEqual(gn['47'].inputs.initial_mask, ['43', 0]); assert.equal(gn['41'].inputs.text, 'person'); assert.equal(V['mask text'].passes[0].graph['41'].inputs.text, 'drummer'); }
  { const gp2 = V['point'].passes[0].graph; assert.equal(gp2['44'].inputs.value, JSON.stringify([{ x: 968, y: 294 }])); assert.deepEqual(gp2['43'].inputs.positive_coords, ['44', 0]); assert.ok(!('conditioning' in gp2['43'].inputs), 'point only: text would union everyone');
    assert.deepEqual(gp2['47'].inputs.initial_mask, ['43', 0]); assert.deepEqual(gp2['47'].inputs.conditioning, ['41', 0]); }
  { const pu = V['upload'].passes[0]; const gu = pu.graph; assert.ok(!gu['40'] && !gu['47']); assert.deepEqual(gu['49'].inputs.mask, ['38', 0]); assert.match(gu['36'].inputs.file.__file, /charswap24-mask\.mp4$/);
    assert.deepEqual(pu.prep![1], { kind: 'fps', src: '/x/m.mp4', out: gu['36'].inputs.file.__file, fps: 24, width: 1344, height: 736, seconds: 5, frames: 124, audio: false }); }
  for (const k of ['off', 'motion', 'silent off']) { const go = V[k].passes[0].graph; for (const id of CS.CHARSWAP_MASK_NODES) assert.ok(!go[id], `${k}: no mask node ${id}`); assert.deepEqual(go['25'].inputs.latent_image, ['20', 1]); assert.match(V[k].notes[0], /mask-free/); }
  assert.deepEqual(V['off'].passes[0].graph['19'].inputs.latent, ['20', 1]);
  { const gf = V['fast'].passes[0].graph; assert.deepEqual([gf['20'].inputs.width, gf['20'].inputs.height], [928, 512], 'fast preset = 480p even when 720p is picked'); assert.deepEqual([gf['50'].inputs.width, gf['50'].inputs.height], [58, 32]); assert.equal(gf['53'].inputs.expand, 3); }
  { const gs = V['silent'].passes[0].graph; assert.ok(!gs['19']); assert.deepEqual(gs['24'].inputs.conditioning, ['20', 0]); }
  { const gnt = V['no turbo'].passes[0].graph; assert.ok(!gnt['3'] && !gnt['7']); assert.deepEqual(gnt['8'].inputs.model, ['1', 0]); assert.deepEqual(gnt['2'].inputs.model, ['8', 0]);
    assert.deepEqual([gnt['23'].inputs.steps, gnt['23'].inputs.scheduler, gnt['22'].inputs.sampler_name], [20, 'simple', 'res_multistep']); }
  assert.equal(V['turbo 768p'].passes[0].graph['3'].inputs.lora_name, CS.TURBO_768_DEFAULT); assert.equal(plan({ ...base, charswapTurbo: CS.TURBO_768_DEFAULT }).passes[0].graph['3'].inputs.lora_name, CS.TURBO_SHARED, '480p keeps the shared build');
  assert.equal(V['text right'].passes[0].graph['3'].inputs.lora_name, CS.TURBO_SHARED, 'not imported → shared build');
  { const g12 = plan({ ...base, steps: 12, loraStrength: 0.8 }).passes[0].graph; assert.equal(g12['23'].inputs.steps, 12); assert.equal(g12['2'].inputs.strength_model, 0.8);
    const gx = plan({ ...base, steps: 99, loraStrength: 7 }).passes[0].graph; assert.equal(gx['23'].inputs.steps, 8); assert.equal(gx['2'].inputs.strength_model, 1); }
  assert.deepEqual(CS.charswapFields({ charswapPreset: 'fast', turbo: '0', steps: '12', loraStrength: '0.9', charswapMask: 'off' }), { charswapPreset: 'fast', turbo: false, steps: 12, loraStrength: 0.9, charswapMask: 'off' });
  assert.deepEqual(CS.charswapFields({}), {}); for (const f of [{ charswapPreset: 'max' }, { steps: '2' }, { steps: '8.5' }, { loraStrength: '3' }, { turbo: 'maybe' }, { charswapMask: 'x' }]) assert.ok('error' in CS.charswapFields(f as any), JSON.stringify(f));
  assert.equal(plan({ ...base, charswapMask: 'off' }).passes[0].expect.mask, 'off');
  assert.deepEqual(['the woman on the right', 'the man', 'a kid', 'the dancer', 'the woman next to the man'].map(CS.samNoun), ['woman', 'man', 'child', 'person', 'woman']);
  assert.deepEqual(['on the right', 'left side', 'left and right', '', 'brightly lit'].map(CS.samSide), ['right', 'left', null, null, null]);
  { const rep = CS.charswapRecommendedReport({ state: 'present', loaderPath: CS.CHARSWAP_LORA_DEFAULT }, { state: 'missing', loaderPath: null }); assert.equal(rep.length, 2);
    assert.equal(rep[0].todo, undefined); assert.match(rep[1].todo!, /lightx2v\/Minimax-h3-Turbo\/resolve\/main\/minimax_h3_fl2v_turbo_8step_v1\.0_768p_comfyui_bf16\.safetensors/); assert.match(rep[1].todo!, /lightx2v__Minimax-h3-Turbo__minimax_h3_fl2v_turbo_8step_v1\.0_768p_comfyui_bf16\.safetensors/); }
  ok('edit mask: latent grid + grow, side / point / upload / off / motion wiring, every variant passes object_info with no dangling links; presets, turbo off, steps + LoRA strength, 768p turbo import, form fields, report');

  // ---- route + price ----
  for (const tool of ['object-swap', 'motion-transfer']) { const rs = routesFor('comfy-h3-charswap', tool); const r = rs.find((x) => x.routeId === CS.CHARSWAP_CLOUD_ROUTE);
    assert.ok(r, tool); assert.equal(r!.kind, 'comfy-cloud'); assert.equal(r!.label, 'Comfy Cloud'); assert.ok(rs.some((x) => x.kind === 'local'), 'local route stays');
    assert.match(String(r!.unavailableFor?.({ duration: 20 })), /up to 15 s/); assert.equal(r!.unavailableFor?.({ duration: 8 }), null); }
  assert.ok(!routesFor('comfy-h3-charswap', 'restyle').some((x) => x.routeId === CS.CHARSWAP_CLOUD_ROUTE));
  const rt = findRoute(CS.CHARSWAP_CLOUD_ROUTE)!; assert.ok(rt); assert.ok(CLOUD_RUNNER_ROUTES.has(rt.routeId)); assert.ok(routeRunnable(rt));
  const w = CLOUD_WORKFLOWS[CS.CHARSWAP_CLOUD_ROUTE]; assert.ok(isStandalone(w) && w.target === 'cloud' && !!w.preflight);
  const row = HOSTED_BY_ID['cloud-h3-charswap']; assert.ok(row?.priceUnmeasured && row.estimated); assert.ok(row.usdByQuality!['480p'] > 0 && row.usdByQuality!['720p'] > row.usdByQuality!['480p']);
  ok('route: Comfy Cloud twin of H3 Character Swap on Object Swap + Motion Transfer (not Restyle), >15 s refused, runnable, estimate row (priceUnmeasured)');

  // ---- run (fake Comfy Cloud) ----
  const src = clip('src.mp4', 5); const input = { ...base, videoPath: src, refPaths: [png] };
  type Call = { url: string; method: string; body?: any };
  const mp4 = fs.readFileSync(src);
  const runOnce = async (lib: { assets?: any[]; objectInfo?: string[] | null; assetsDown?: boolean }) => { const calls: Call[] = [];
    const h = (c: Call) => {
      if (c.url.includes('/api/assets?')) return lib.assetsDown ? new Response('x', { status: 500 }) : json({ assets: lib.assets ?? [], total: (lib.assets ?? []).length, has_more: false });
      if (c.url.endsWith('/api/object_info')) return lib.objectInfo == null ? new Response('x', { status: 503 }) : json({ LoraLoaderModelOnly: { input: { required: { lora_name: [lib.objectInfo, {}] } } } });
      if (c.url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}` }); if (c.url.endsWith('/api/v2/jobs')) return json({ id: 'j1' });
      if (c.url.endsWith('/api/v2/jobs/j1')) return json({ status: 'succeeded', outputs: [{ node_id: '30', id: 'o1', name: 'swap.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(mp4, { status: 200 }); };
    setCloudFetch((async (u: any, init: any = {}) => { const c: Call = { url: String(u), method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined }; calls.push(c); return h(c); }) as typeof fetch, 1);
    const job: any = { id: `cs${Math.random().toString(36).slice(2, 7)}`, toolId: 'object-swap', provider: 'comfy-h3-charswap', route: rt.routeId, input: structuredClone(input), status: 'queued', outputs: [] };
    let err: Error | null = null; try { await runCloudWorkflow(job, rt, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  process.env.COMFY_API_KEY = KEY;
  { const r = await runOnce({}); assert.equal(r.calls.length, 0); assert.equal(r.job.reasonCode, 'price_unmeasured'); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1';
  { const r = await runOnce({ assets: [], objectInfo: ['minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'] });
    assert.equal(r.job.reasonCode, 'cloud_import_missing'); assert.match(r.err!.message, /H3 Character Swap needs the Character Swap LoRA .* in your Comfy Cloud model library \(a one-time setup\)/); assert.match(r.err!.message, /huggingface\.co\/akatz-ai\/MiniMax-H3-Character-Swap-LoRA/);
    assert.ok(r.calls.every((c) => c.method === 'GET'), 'only free GETs: nothing uploaded or submitted'); assert.ok(r.calls.every((c) => c.url.startsWith('https://cloud.comfy.org/'))); }
  const subOf = (r: { calls: Call[] }) => r.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs'))!.body.workflow;
  { const r = await runOnce({ assets: [{ name: 'akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors', loader_path: 'akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors', file_path: 'models/loras/akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors', is_immutable: false }] });
    assert.equal(r.err, null, String(r.err)); assert.equal(r.job.status, 'done'); const sub = subOf(r);
    assert.equal(sub['2'].inputs.lora_name, 'akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors'); assert.ok(r.calls.some((c) => /name_contains=h3_character_swap&/.test(c.url))); assert.equal(sub['20'].inputs.width, 928); assert.equal(sub['20'].inputs.length, 124); assert.equal(sub['3'].inputs.lora_name, CS.TURBO_SHARED);
    assert.equal(sub['10'].inputs.file.__type, 'core/ASSET'); assert.equal(r.calls.filter((c) => c.url.endsWith('/api/v2/assets')).length, 2, 'clip + character uploaded once each');
    assert.ok(!r.calls.some((c) => c.url.endsWith('/api/object_info')), 'object_info only when the search finds nothing'); assert.ok(!JSON.stringify(r.job).includes(KEY)); assert.equal(r.job.outputs.length, 1);
    const prepped = fs.readdirSync(D).find((f) => /charswap24\.mp4$/.test(f))!; const st = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate', '-of', 'csv=p=0', path.join(D, prepped)]).toString();
    assert.match(st, /video,928,512,24\/1/); assert.match(st, /audio/);
    assert.equal(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(D, prepped)]).toString().trim(), '124', 'padded to the 17k+5 grid'); }
  { const turbo = { name: CS.TURBO_768_DEFAULT, loader_path: CS.TURBO_768_DEFAULT, is_immutable: false }; const lora = { name: CS.CHARSWAP_LORA_DEFAULT, loader_path: CS.CHARSWAP_LORA_DEFAULT, is_immutable: false };
    input.resolution = '720p'; const r = await runOnce({ assets: [lora, turbo] }); input.resolution = '480p'; assert.equal(r.err, null, String(r.err));
    assert.equal(subOf(r)['3'].inputs.lora_name, CS.TURBO_768_DEFAULT, 'the imported 768p turbo at 768p'); assert.ok(r.calls.some((c) => /name_contains=turbo_8step_v1\.0_768p/.test(c.url))); }
  { const r = await runOnce({ assets: [], objectInfo: ['other.safetensors', 'akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors'] }); assert.equal(r.err, null, String(r.err)); assert.equal(subOf(r)['2'].inputs.lora_name, 'akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors'); }
  { const r = await runOnce({ assets: [{ name: 'h3_character_swap_v1.5.safetensors', loader_path: 'h3_character_swap_v1.5.safetensors', is_immutable: false }] }); assert.equal(r.err, null, String(r.err)); assert.equal(subOf(r)['2'].inputs.lora_name, 'h3_character_swap_v1.5.safetensors', 'a plain-name import is found too'); }
  { const r = await runOnce({ assets: [{ name: 'h3_character_swap_v1.5_extra.safetensors', loader_path: 'h3_character_swap_v1.5_extra.safetensors' }], objectInfo: ['h3_character_swap_v1.safetensors'] }); assert.equal(r.job.reasonCode, 'cloud_import_missing', 'near names do not count'); }
  { const r = await runOnce({ assetsDown: true, objectInfo: null }); assert.equal(r.err, null, String(r.err)); assert.equal(subOf(r)['2'].inputs.lora_name, 'akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors'); }
  { // 2026-10-26 (job 7d482af2): Cloud reads only the fields before `file`; every upload (clip and photo) sends content_type, file_path, then the file.
    // A refused upload is upload_failed with Cloud's words kept, never "a model or node is missing"; nothing is submitted.
    const runUp = async (refuse: boolean) => { const forms: { keys: string[]; ct: unknown }[] = []; let submitted = 0;
      setCloudFetch((async (u: any, init: any = {}) => { const url = String(u);
        if (url.includes('/api/assets?')) return json({ assets: [{ name: CS.charswapLoraName(), loader_path: CS.charswapLoraName(), is_immutable: false }], total: 1, has_more: false });
        if (url.endsWith('/api/v2/assets')) { const fd = init.body as FormData; const keys = [...fd.keys()]; forms.push({ keys, ct: fd.get('content_type') });
          return refuse || keys[keys.length - 1] !== 'file' ? json({ error: { code: 'invalid_body', message: 'content_type is required and must be sent before the file field' } }, 422) : json({ id: `a${forms.length}` }); }
        if (url.endsWith('/api/v2/jobs')) { submitted++; return json({ id: 'j1' }); }
        if (url.endsWith('/api/v2/jobs/j1')) return json({ status: 'succeeded', outputs: [{ node_id: '30', id: 'o1', name: 'swap.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
        return new Response(mp4, { status: 200 }); }) as typeof fetch, 1);
      const job: any = { id: `cu${Math.random().toString(36).slice(2, 7)}`, toolId: 'object-swap', provider: 'comfy-h3-charswap', route: rt.routeId, input: structuredClone(input), status: 'queued', outputs: [] };
      let err: Error | null = null; try { await runCloudWorkflow(job, rt, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, forms, submitted }; };
    const good = await runUp(false); assert.equal(good.err, null, String(good.err)); assert.ok(good.forms.length >= 2, 'clip and photo uploaded');
    for (const f of good.forms) assert.deepEqual(f.keys, ['content_type', 'file_path', 'file']); assert.deepEqual(good.forms.map((f) => f.ct).sort(), ['image/png', 'video/mp4']);
    const bad = await runUp(true); assert.equal(bad.job.reasonCode, 'upload_failed'); assert.equal(bad.submitted, 0); assert.match(bad.err!.message, /upload to Comfy Cloud failed.*content_type is required/);
    assert.equal(bad.job.providerError?.errorType, 'invalid_body'); assert.equal(bad.job.providerError?.step, 'upload'); assert.ok(!JSON.stringify(bad.job).includes(KEY));
    ok('uploads: content_type + file_path before the file (video/mp4, image/png); a refused upload → upload_failed with Cloud’s words kept, nothing submitted'); }
  delete process.env.COMFY_API_KEY; { const r = await runOnce({}); assert.equal(r.calls.length, 0); assert.equal(r.job.reasonCode, 'key_missing'); }
  ok('run: unmeasured → refused; LoRA missing → refused with the HF link after GETs only; imported (assets) → its loader_path; object_info fallback; checks down → goes on; no key → key_missing; key never in the job');
  { // 2026-10-31: H3 needs WHO: a click or a side. Empty / "main person" came back unchanged (3 of 6 runs); every side or click swapped.
    const SW = await import('../src/shared/cloudSwap.ts'); const H = await import('../src/routing/http.ts'); const { getTool } = await import('../src/tools/registry.ts');
    const j = (o: Record<string, any>) => ({ mode: 'object_swap', swapType: 'person', duration: 5, target: '', point: null, ...o });
    assert.match(SW.charswapWhoIssue(j({}))!, /click the person to swap, or pick left\/right/); assert.match(SW.charswapWhoIssue(j({ target: 'main person' }))!, /left\/right/);
    assert.equal(SW.charswapWhoIssue(j({ target: 'the woman on the right' })), null); assert.equal(SW.charswapWhoIssue(j({ target: 'person on the left' })), null);
    assert.match(SW.charswapWhoIssue(j({ target: 'left and right' }))!, /left\/right/, 'both sides = no side');
    assert.equal(SW.charswapWhoIssue(j({ point: { x: 0.7, y: 0.4, t: 0 } })), null); assert.equal(SW.charswapWhoIssue(j({ maskPath: '/x/m.mp4' })), null);
    assert.equal(SW.charswapWhoIssue(j({ mode: 'motion_transfer' })), null, 'motion transfer: no person to find');
    assert.equal(SW.charswapWhoIssue({ mode: 'object_swap', duration: 5 }), null, 'a quote without the fields is not judged');
    assert.equal(CS.samSide('the man on the left'), 'left', 'the mask uses the same side rule');
    // both places, quote and submit: the route refuses the job and the quote (its input carries target / point, routing/http.ts swapQuoteFields)
    const t = getTool('object-swap')!; const rs = routesFor('comfy-h3-charswap', t); const cloud = rs.find((r) => r.routeId === CS.CHARSWAP_CLOUD_ROUTE)!; const local = rs.find((r) => r.kind === 'local')!;
    for (const r of [cloud, local]) { assert.match(r.unavailableFor!(j({ target: 'main person' }))!, /left\/right/, r.routeId); assert.equal(r.unavailableFor!(j({ target: 'the woman on the right' })), null, r.routeId);
      const q = (x: Record<string, string>) => ({ ...H.routeQuoteInput(t, { duration: '5', mode: 'object_swap', swapType: 'person', ...x }), mode: 'object_swap' });
      assert.match(r.unavailableFor!(q({ target: '' }))!, /left\/right/, `${r.routeId}: quote refuses`); assert.equal(r.unavailableFor!(q({ target: '', point: '0.7,0.4,0' })), null, `${r.routeId}: a click runs`); }
    const cat = (await import('../src/shared/modelCatalog.ts')).MODEL_CATALOG['object-swap:comfy-h3-charswap']; assert.equal(cat.experimental, true, 'labelled Experimental in the menu');
    ok('who: H3 needs a click, a side or a mask clip ("main person" / empty refused) on both places, quote and submit; motion transfer exempt; Experimental');
  }
  console.log('ALL OK h3-charswap-cloud');
} finally { setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
