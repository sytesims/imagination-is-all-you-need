// Prompt Edit · Bernini-R · Comfy Cloud (2026-10-27, tools/promptEdit.ts + comfy/berniniCloud.ts). FAKE fetches only (no network, no real key, no spend).
//  1 graph: the reference file and the builder's graphs (wide, tall, square; 1 s, 3 s, 5 s, a longer clip) pass Comfy Cloud's object_info
//    (0 errors, 0 warnings); the checker catches a wrong model file; the template's turbo settings, task line and file set are kept
//  2 limits: 4n + 1 frames at 16 fps, at most 81 (the first 5 s); the 480p canvas by shape; a clip under 1 s and a too-long instruction are refused
//  3 route: Comfy Cloud, open weights (tier 0), on the Cloud runner, no partner key; the price row is an estimate held as unmeasured
//  4 tool: Prompt Edit in Edit Video, in the Video bar; an empty instruction and a photo are refused; a 7 s clip is edited on its first 5 s (a warning)
//  5 prep: our ffmpeg conforms a 7 s 24 fps clip to 81 frames at 16 fps, 832 × 480, its sound kept; the plan submits that clip
// Run: npx tsx test/bernini-edit.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'bernini-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const HERE = path.dirname(new URL(import.meta.url).pathname); const ROOT = path.resolve(HERE, '../..');
const OI = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'object-info-bernini-cloud-2026-10-26.json'), 'utf8'));
const B = await import('../src/comfy/berniniCloud.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { CLOUD_WORKFLOWS, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { routesFor, tierOf } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { CLOUD_RUNNER_ROUTES } = await import('../src/routing/runnable.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { getProvider, providerOpenWeights } = await import('../src/providers.ts');
const { VIDEO_WORKFLOWS } = await import('../src/shared/videoWorkflows.ts');
const { VIDEO_BARS } = await import('../src/shared/videoBar.ts');
const { EDIT_VIDEO_MENU } = await import('../src/tools/editVideo/index.ts');
const ASSET = { __type: 'core/ASSET', info: { id: 'asset_1', hash: 'blake3:00', file_path: 'clip.mp4' } };
const clean = (name: string, g: Record<string, any>) => { const r = checkCloudGraph(g, OI); assert.deepEqual(r.errors, [], `${name}: ${r.errors.join(' | ')}`); assert.deepEqual(r.warnings, [], `${name}: ${r.warnings.join(' | ')}`); };
const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);

try {
  // ---- 1. graph ----
  { const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', B.BERNINI_GRAPH_FILE), 'utf8')); clean('workflows/cloud/bernini-r-edit-api.json', file);
    let n = 0;
    for (const [d, w, h, size] of [[1, 1920, 1080, [832, 480]], [3, 1080, 1920, [480, 832]], [5, 1000, 1000, [624, 624]], [9, 1280, 720, [832, 480]]] as const) {
      const g = B.berniniGraph({ duration: d, width: w, height: h, prompt: 'make it night', seed: 7 }, ASSET); clean(`${d}s ${w}x${h}`, g); n++;
      assert.deepEqual([g['298:278'].inputs.width, g['298:278'].inputs.height], size); assert.equal(g['298:284'].inputs.string_b, 'make it night'); assert.equal(g['298:275'].inputs.noise_seed, 7);
      assert.deepEqual(g['298:278'].inputs.length, ['111', 2], 'length = the clip’s frames, as the template wires it');
      assert.ok(Math.round(g['109'].inputs.duration * B.BERNINI_FPS) >= B.berniniFrames(d), 'Video Slice keeps every prepared frame'); }
    const g = B.berniniGraph({ duration: 4, prompt: 'x' }, ASSET);
    assert.equal(g['298:284'].inputs.string_a, 'You are a helpful assistant specialized in video editing on content propagation.', 'the template’s default task line');
    assert.equal(g['298:276'].inputs.steps, 6); assert.equal(g['298:268'].inputs.step, 3); assert.equal(g['298:275'].inputs.cfg, 1); assert.equal(g['298:269'].inputs.sampler_name, 'res_multistep');
    assert.equal(g['298:271'].inputs.strength_model, 3); assert.equal(g['298:266'].inputs.strength_model, 1.5); assert.deepEqual(g['298:275'].inputs.model, ['298:271', 0]); assert.deepEqual(g['298:277'].inputs.model, ['298:266', 0]);
    assert.deepEqual(B.BERNINI_REQUIRES.models.map((m) => m.file).sort(), Object.values(B.BERNINI_FILES).sort(), 'the template’s files, no swap');
    assert.ok(!B.berniniGraph({ duration: 4, prompt: 'x' }, ASSET, { keepAudio: false })['298:274'].inputs.audio, 'sound off: no audio on CreateVideo');
    const x = structuredClone(g); x['298:270'].inputs.unet_name = 'wan2.2_bernini_r_high_noise_fp4.safetensors'; assert.ok(checkCloudGraph(x, OI).errors.some((e) => /not in the list/.test(e)));
    ok(`${n + 1} graphs pass Comfy Cloud's object_info (0 errors, 0 warnings); turbo settings, task line and files are the template's`); }

  // ---- 2. limits ----
  { assert.equal(B.berniniFrames(5), 81); assert.equal(B.berniniFrames(12), 81); assert.equal(B.berniniFrames(3), 49); assert.equal(B.berniniFrames(1), 17); assert.equal(B.berniniFrames(0.3), 17);
    for (const s of [1, 1.7, 2.3, 4.4, 5, 30]) assert.equal((B.berniniFrames(s) - 1) % 4, 0, `${s} s: 4n + 1`);
    assert.equal(B.berniniSeconds({ duration: 9 }), 5.06); assert.equal(B.berniniSeconds({ duration: 3 }), 3.06);
    assert.match(String(B.berniniIssue({ duration: 0.5 })), /at least 1 s/); assert.match(String(B.berniniIssue({ duration: 3, prompt: 'x'.repeat(B.BERNINI_MAX_CHARS + 1) })), /under/);
    assert.equal(B.berniniIssue({ duration: 9, prompt: 'make it night' }), null, 'a longer clip is fine: its first 5 s');
    ok('limits: 4n + 1 frames at 16 fps up to 81 (5 s), 480p by shape; too short and too long an instruction refused'); }

  // ---- 3. route + price ----
  const tool = getTool('prompt-edit')!;
  { assert.ok(tool, 'Prompt Edit is registered'); const [r] = routesFor(B.BERNINI_PROVIDER, tool); assert.equal(r.routeId, B.BERNINI_ROUTE); assert.equal(r.label, 'Comfy Cloud'); assert.equal(tierOf(r), 0, 'open weights on Comfy Cloud');
    assert.ok(providerOpenWeights(getProvider(B.BERNINI_PROVIDER))); assert.ok(CLOUD_RUNNER_ROUTES.has(B.BERNINI_ROUTE)); assert.ok(isStandalone(CLOUD_WORKFLOWS[B.BERNINI_ROUTE])); assert.ok(!(CLOUD_WORKFLOWS[B.BERNINI_ROUTE] as any).partnerAuth);
    const h = HOSTED_BY_ID[B.BERNINI_PROVIDER]; assert.equal(h.priceUnmeasured, true); assert.equal(h.unit, 'second'); assert.ok(h.usd! > 0.03 && h.usd! < 0.07, 'about 25 GPU-s per second');
    assert.deepEqual(r.priceInput!({ duration: 9 }).duration, 5.06, 'billed on the seconds it renders');
    ok('route: Comfy Cloud, open weights, Cloud runner, no partner key; price an estimate (unmeasured), billed on rendered seconds'); }

  // ---- 4. tool ----
  { const wf = VIDEO_WORKFLOWS.find((w) => w.id === 'prompt-edit')!; assert.equal(wf.toolId, 'prompt-edit'); assert.equal(wf.category, 'edit');
    assert.equal(VIDEO_BARS['prompt-edit'].prompt.mode, 'required'); assert.ok(EDIT_VIDEO_MENU.some((m) => m.id === 'prompt-edit'));
    ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '7', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(D, 'c7.mp4')]);
    ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240', '-frames:v', '1', path.join(D, 'p.png')]);
    const e1: any = await tool.parseInput({ prompt: '   ' }, { video: ['c7.mp4'] }); assert.equal(e1.code, 'prompt_required');
    const e2: any = await tool.parseInput({ prompt: 'x' }, { video: ['p.png'] }); assert.equal(e2.code, 'format');
    const r: any = await tool.parseInput({ prompt: 'make it night' }, { video: ['c7.mp4'] }); assert.ok(!r.error, r.error);
    assert.equal(r.duration, 5); assert.equal(r.trimmed, true); assert.match(r.warnings[0], /first 5 s/); assert.equal(r.finalPrompt, 'make it night'); assert.equal(r.hasAudio, true);
    ok('tool: in Edit Video and the Video bar; empty instruction and photo refused; a 7 s clip uses its first 5 s with a warning');

    // ---- 5. prep + plan ----
    const job: any = { id: 'bprep', input: structuredClone(r) }; await B.prepareBerniniCloud(job);
    const probe = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'csv=p=0', job.input.bernini.video]).toString().trim();
    assert.equal(probe, '832,480,16/1,81'); assert.match(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', job.input.bernini.video]).toString(), /audio/);
    const p = B.berniniCloudPlan({ id: 'bprep', toolId: 'prompt-edit', provider: B.BERNINI_PROVIDER, input: job.input });
    assert.deepEqual(p.passes[0].graph['47'].inputs.file, { __file: job.input.bernini.video }); assert.equal(p.passes[0].output, '46'); clean('plan', { ...p.passes[0].graph, 47: { ...p.passes[0].graph['47'], inputs: { file: ASSET } } });
    assert.throws(() => B.berniniCloudPlan({ id: 'b2', toolId: 'prompt-edit', provider: B.BERNINI_PROVIDER, input: { ...job.input, prompt: '', finalPrompt: '' } }), /Say what to change/);
    ok('prep: 81 frames at 16 fps, 832×480, sound kept; the plan submits the prepared clip'); }
} finally { fs.rmSync(D, { recursive: true, force: true }); }
