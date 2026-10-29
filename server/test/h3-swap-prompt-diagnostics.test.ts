// Free, single-process checks: no server, real uploads, keys or network; synthetic tiny videos only.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-prompt-diag-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'absent.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'absent-filming.json') });
for (const k of ['COMFY_API_KEY', 'COMFY_RUNNER_TOKEN', 'OPENHIGGSFIELD_COMFY_API_KEY', 'OPENHIGGSFIELD_CAPTURE_GRAPHS']) delete process.env[k];
globalThis.fetch = (async () => { throw new Error('network forbidden'); }) as typeof fetch;
const { composeH3SwapPrompt, h3SwapPrompt } = await import('../src/shared/h3SwapPrompt.ts');
const { buildCloudPlan } = await import('../src/comfy/cloudWorkflows.ts');
const { promptPeek } = await import('../src/routesPromptPeek.ts');
const { objectSwapTool } = await import('../src/tools/videoSwap.ts');
const { notePlanPrompts, jobAppPrompts } = await import('../src/jobSource.ts');
const { formFromInput } = await import('../src/routesPrefill.ts');
const { buildWorkflowExport, recordSubmittedPass } = await import('../src/workflowExport.ts');
const { runNative } = await import('../src/comfy/runNative.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const CS = await import('../src/comfy/h3CharSwapCloud.ts');
const base = { videoPath: '/fake/source.mp4', refPaths: ['/fake/person.png'], duration: 4, width: 720, height: 1280, resolution: '720p', seed: 703835, target: 'main person', mode: 'object_swap', hasAudio: true, keepAudio: true };
const typed = 'switch the person in @video1 with the person in @image1 ';
const make = (extra: Record<string, any> = {}) => buildCloudPlan({ id: 'test-h3', toolId: 'object-swap', provider: 'cloud-h3-charswap', input: { ...base, ...extra } });
try {
  assert.equal(composeH3SwapPrompt({ target: base.target }), h3SwapPrompt(base.target), 'empty prompt unchanged');
  const core = h3SwapPrompt('the woman on the right');
  for (const prompt of [core, `${core}\n\nAdditional direction: softer lighting`, `${core} Keep her glasses.`]) {
    assert.equal(composeH3SwapPrompt({ target: 'the woman on the right', prompt }), prompt, 'known structured prompt is not duplicated');
  }
  assert.match(composeH3SwapPrompt({ target: 'person on the left', prompt: core }), /^Replace person on the left/, 'different explicit target is never silently accepted as the selected target');
  assert.ok(composeH3SwapPrompt({ target: base.target, prompt: 'x'.repeat(5000) }).length <= 4000);
  const input = { ...base, prompt: typed }; const snapshot = structuredClone(input);
  const p = buildCloudPlan({ id: 'test-h3', toolId: 'object-swap', provider: 'cloud-h3-charswap', input }); const g = p.passes[0].graph;
  assert.deepEqual(input, snapshot, 'builder preserves exact typed input for history/Recreate');
  assert.equal(g['13'].inputs.value, `${h3SwapPrompt(base.target)}\n\nAdditional direction: switch the person in <Video 1> with the person in <Picture 1>`);
  const job: any = { input }; notePlanPrompts(job, p);
  assert.equal(input.prompt, typed); assert.equal(jobAppPrompts(job)[0], g['13'].inputs.value);
  const recreated = formFromInput(objectSwapTool, { ...job, provider: 'comfy-h3-charswap' }, { sameSeed: true });
  assert.equal(recreated.form.prompt, typed, 'Recreate restores the exact typed sentence, not the composed prompt');
  const historical: any = { input: { prompt: typed } }; assert.deepEqual(jobAppPrompts(historical), [], 'old history has no invented new composed prompt');
  const old: any = { id: 'old-graph-missing', status: 'done', toolId: 'object-swap', provider: 'comfy-h3-charswap', route: 'comfy-cloud:cloud-h3-charswap', input: snapshot };
  const noGraph = await buildWorkflowExport(old); assert.equal(noGraph.exact, false); assert.deepEqual(noGraph.graphs, []); assert.match(noGraph.reason!, /historical graph cannot/);
  const oldGraph = structuredClone(g); oldGraph['13'].inputs.value = 'historical exact words';
  recordSubmittedPass(old, 0, { label: 'Character swap', workflow: CS.CHARSWAP_CLOUD_GRAPH }, oldGraph, 'comfy-cloud');
  const saved = await buildWorkflowExport(old); assert.equal(saved.exact, true); assert.equal(saved.graphs[0]['13'].inputs.value, 'historical exact words');
  const pk: any = await promptPeek(objectSwapTool, { provider: 'comfy-h3-charswap', runOn: 'comfy-cloud', target: base.target, prompt: typed, trimStart: '0', trimEnd: '4', resolution: '720p', keepAudio: '1' }, { video: 1, refs: 1 });
  assert.equal(pk.error, undefined, JSON.stringify(pk)); assert.equal(pk.prompt, g['13'].inputs.value, 'preview exactly matches submitted graph');
  assert.match(pk.promptNote, /original words.*Recreate/); assert.match(pk.promptNote, /overhead.*unmeasured/);
  assert.equal(pk.settings.duration, 4);
  console.log('ok core instructions + extra direction, structured idempotence, target, typed/history preservation, exact Cloud peek');

  const OI = JSON.parse(fs.readFileSync(new URL('./fixtures/object-info-comfy-cloud-2026-10-26.json', import.meta.url), 'utf8'));
  for (const extra of [{}, { point: { x: .7, y: .3 } }, { target: 'person on the right' }, { maskPath: '/fake/mask.mp4', maskMode: 'upload' }, { hasAudio: false }]) {
    const pass = make(extra).passes[0]; const graph = pass.graph;
    assert.equal(pass.output, '30'); assert.equal(pass.extraOutputs, undefined); assert.equal(pass.diagnostics?.length, 2);
    assert.deepEqual(graph['71'].inputs.image, ['49', 0], 'selection preview reuses actual raw mask branch');
    assert.deepEqual(graph['74'].inputs.mask, ['62', 0], 'edit preview is exact pre-native branch');
    assert.deepEqual(graph['25'].inputs.latent_image, ['66', 0]); assert.deepEqual(graph['64'].inputs.mask, ['62', 0]);
    for (const id of ['72', '76']) { assert.equal(graph[id].inputs.audio, undefined); assert.equal(graph[id].inputs.fps, 24); }
    const r = checkCloudGraph(graph, OI);
    assert.deepEqual(r.errors.filter(e => !e.includes(CS.CHARSWAP_LORA_DEFAULT)), [], JSON.stringify(r));
    for (const n of Object.values<any>(graph)) for (const v of Object.values(n.inputs)) if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string') assert.ok(graph[v[0]], v[0]);
  }
  for (const extra of [{ maskMode: 'none' }, { charswapMask: 'off' }, { mode: 'motion_transfer' }]) {
    const pass = make(extra).passes[0]; assert.deepEqual(pass.diagnostics, []);
    for (let i = 70; i <= 77; i++) assert.equal(pass.graph[String(i)], undefined);
    assert.deepEqual(pass.graph['25'].inputs.latent_image, ['20', 1]);
  }
  assert.match(make({ mode: 'motion_transfer', prompt: 'Original motion wording' }).passes[0].graph['13'].inputs.value, /^Original motion wording$/);
  console.log('ok semantic/point/upload/silent diagnostics and explicit off/motion; schema and links; sampler path unchanged');

  // Transport fixture returns diagnostic nodes before the result: ordering must never select the mask as the generated result.
  const video = (name: string, color: string, sound: boolean) => {
    const file = path.join(D, name);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:size=64x96:rate=24:duration=1`, ...(sound ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1'] : []), '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', ...(sound ? ['-c:a', 'aac', '-shortest'] : ['-an']), file]); return file;
  };
  const main = video('main.mp4', 'red', true), mask = video('mask.mp4', 'white', false);
  const run = async (missing: boolean, keepAudio: boolean) => {
    const j: any = { id: `stub-${missing}-${keepAudio}`, toolId: 'object-swap', provider: 'comfy-h3-charswap', route: 'comfy-cloud:cloud-h3-charswap', input: { ...base, videoPath: main, prompt: typed, keepAudio }, outputs: [], warnings: [] };
    const plan = make({ keepAudio }); plan.passes[0].prep = [];
    const transport: any = {
      upload: async () => ({ fixture: true }),
      run: async () => ({ promptId: 'fixture', outputs: { ...(missing ? {} : { '77': [{ filename: 'mask.mp4' }], '73': [{ filename: 'mask.mp4' }] }), '30': [{ filename: 'main.mp4' }] } }),
      download: async (o: any, dest: string) => { fs.copyFileSync(o.filename === 'mask.mp4' ? mask : main, dest); return dest; },
    };
    await runNative(j, transport, () => plan);
    assert.equal(j.status, 'done'); assert.equal(j.outputs.length, 1); assert.equal(j.outputs[0].label, 'Character swap');
    assert.equal(j.resultUrl, j.outputs[0].url); assert.ok(!j.resultUrl.includes('diagnostic'));
    assert.equal(j.input.prompt, typed);
    if (missing) { assert.equal(j.diagnostics, undefined); assert.equal(j.warnings.length, 2); }
    else {
      assert.equal(j.diagnostics.length, 2);
      for (const d of j.diagnostics) { assert.equal(d.jobId, j.id); assert.equal(d.requestId, 'fixture'); assert.equal(d.route, j.route); assert.equal(d.pass, 0); assert.match(d.url, /-diagnostic-p0-/); assert.match(d.note, /not lossless mask data/); assert.deepEqual(fs.readFileSync(path.join(D, path.basename(d.url))), fs.readFileSync(mask), 'diagnostic not audio-muxed or postprocessed'); }
    }
    const streams = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path.join(D, path.basename(j.resultUrl))]).toString()).streams;
    assert.equal(streams.some((s: any) => s.codec_type === 'audio'), keepAudio, 'result sound policy unchanged');
  };
  await run(false, true); await run(false, false); await run(true, true);
  console.log('ok fake transport: diagnostics persisted separately, main output and sound preserved, missing diagnostics cannot replace/fail result');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
