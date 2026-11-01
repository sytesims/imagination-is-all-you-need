// Pika H3 Flex on your own ComfyUI (2026-11-01): the same official templates, the template's own files, NVIDIA only. In-process, no network, no ComfyUI.
//  1 one card, two places: "Pika H3 Flex" = this computer + its Comfy Cloud twin; text / start frame / start + end on both
//  2 local plan: the local graph (template's int8 VAE) with every template setting; View workflow rebuilds it
//  3 files: the manifest names the LoRA with its Hugging Face link and size; with the H3 base on disk, the missing-file check and the one-click
//    download name only the LoRA
//  4 hardware: on an Apple chip it says it won't run here (the H3 files don't load on MPS), like MiniMax H3; Spark (NVIDIA) is not blocked
// Run: npx tsx test/pika-h3-flex-local.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-local-')); const MD = path.join(D, 'models');
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_COMFY_MODELS_DIR: MD });
for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL', 'OPENHIGGSFIELD_HW_MOCK']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const P = await import('../src/comfy/pikaH3Flex.ts');
const { buildPlan, hasPlan } = await import('../src/comfy/plans.ts');
const { routesFor } = await import('../src/routing/routes.ts');
const { getTool } = await import('../src/tools/registry.ts');
const HW = await import('../src/hardware.ts'); const R = await import('../src/hardware/requirements.ts');
const { planFiles } = await import('../src/hardware/downloads.ts');
const { MODELS } = await import('../src/shared/modelIds.ts');
const LOCAL = 'comfy-h3-pika'; const tool = getTool('h3-video')!;
try {
  // ---- 1. one card, two places ----
  assert.equal(MODELS['pika-h3-flex'].blurbKey, LOCAL); assert.ok(tool.providers.includes(LOCAL)); assert.ok(!tool.providers.includes(P.PIKA_PROVIDER), 'the Cloud twin is a place of the card, not a second card');
  const rs = routesFor(LOCAL, tool); assert.deepEqual(rs.map((r) => r.routeId), [`local:${LOCAL}`, P.PIKA_ROUTE]); assert.deepEqual(rs.map((r) => r.kind), ['local', 'comfy-cloud']);
  for (const r of rs) { assert.equal(r.unavailableFor?.({ mode: 'r2v', duration: 5 }) ? 'refused' : 'ok', 'refused', `${r.routeId}: references not offered`); assert.equal(r.unavailableFor?.({ mode: 'flf', duration: 5, resolution: '480p' }) ?? null, null, `${r.routeId}: start + end ok`);
    assert.equal(r.unavailableFor?.({ mode: 't2v', duration: 16 }) ? 'refused' : 'ok', 'refused', `${r.routeId}: 5–15 s`); }
  assert.deepEqual((tool as any).providerModes?.[LOCAL] ?? (tool as any).app?.providerModes?.[LOCAL], ['t2v', 'i2v', 'flf']);
  ok('one "Pika H3 Flex" card: this computer + Comfy Cloud, text / start frame / start + end, 5–15 s');

  // ---- 2. local plan ----
  const job = (input: Record<string, any>) => ({ id: 'l1', toolId: 'h3-video', provider: LOCAL, input } as any);
  for (const [mode, extra] of [['t2v', {}], ['i2v', { imagePath: '/x/a.png' }], ['flf', { imagePath: '/x/a.png', lastFramePath: '/x/b.png' }]] as const) {
    const j = job({ mode, prompt: 'a fox', finalPrompt: 'a fox', duration: 7, resolution: '768p', seed: 9, ...extra }); assert.ok(hasPlan(j), `${mode}: has a local plan`);
    const pl = buildPlan(j); const g = pl.passes[0].graph; assert.equal(pl.passes[0].workflow, P.PIKA_LOCAL_GRAPHS[mode === 't2v' ? 't2v' : 'fl2va']);
    assert.equal(g['140:119'].inputs.vae_name, 'minimax_h3_video_vae_int8_convrot.safetensors', 'the template\'s own VAE locally');
    assert.deepEqual([g['140:134'].inputs.lora_name, g['140:134'].inputs.strength_model, g['140:123'].inputs.sampler_name, g['140:143'].inputs.sigmas, g['140:130'].inputs.fps], [P.PIKA_LORA, 1, 'lcm', P.PIKA_SIGMAS, 24]);
    assert.equal(Object.values<any>(g).filter((n) => n.class_type === 'LoraLoaderModelOnly').length, 1, 'no turbo LoRA'); assert.equal(g['140:133'].inputs.value, 7);
    if (mode !== 't2v') assert.deepEqual(g['148'].inputs.image, { __file: '/x/a.png' }); if (mode === 'flf') assert.deepEqual(g['147'].inputs.image, { __file: '/x/b.png' }); }
  { const { buildWorkflowExport } = await import('../src/workflowExport.ts');
    const x = await buildWorkflowExport({ id: 'l2', toolId: 'h3-video', provider: LOCAL, route: `local:${LOCAL}`, status: 'done', input: { mode: 'flf', prompt: 'a fox', finalPrompt: 'a fox', duration: 5, resolution: '480p', imagePath: '/x/a.png', lastFramePath: '/x/b.png' }, outputs: [] } as any);
    assert.equal(x.available, true, x.reason); assert.equal(x.passes[0].workflow, P.PIKA_LOCAL_GRAPHS.fl2va); assert.equal(x.graphs[0]['140:134'].inputs.lora_name, P.PIKA_LORA);
    const c = await buildWorkflowExport({ id: 'c2', toolId: 'h3-video', provider: LOCAL, route: P.PIKA_ROUTE, status: 'done', input: { mode: 't2v', prompt: 'a fox', finalPrompt: 'a fox', duration: 5, resolution: '768p' }, outputs: [] } as any);
    assert.equal(c.available, true, c.reason); assert.equal(c.passes[0].workflow, P.PIKA_GRAPHS.t2v); assert.equal(c.graphs[0]['140:119'].inputs.vae_name, 'minimax_h3_video_vae_fp16.safetensors'); }
  ok('local plan: the template graph with its own files and settings; View workflow shows the real graph on both places');

  // ---- 3. files ----
  const m = R.manifest(); const row = m.models.find((x) => x.file === P.PIKA_LORA)!; assert.ok(row, 'the LoRA is in the manifest');
  assert.equal(row.url, 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/loras/pika_h3_flex_fl2va_v1_bf16.safetensors'); assert.equal(row.size, P.PIKA_LORA_BYTES); assert.equal(row.folder, 'loras');
  for (const w of Object.values(P.PIKA_LOCAL_GRAPHS)) assert.ok(m.workflows[`workflows/${w}`]?.models.includes(P.PIKA_LORA), `${w} lists the LoRA`);
  // the H3 base already on disk (sparse files at full size), the LoRA not
  for (const f of m.workflows[`workflows/${P.PIKA_LOCAL_GRAPHS.t2v}`].models.filter((x) => x !== P.PIKA_LORA)) { const r = m.models.find((x) => x.file === f)!;
    fs.mkdirSync(path.join(MD, r.folder), { recursive: true }); const fd = fs.openSync(path.join(MD, r.folder, f), 'w'); fs.ftruncateSync(fd, r.size!); fs.closeSync(fd); }
  HW.setHardwareOverride('spark'); R.clearRequirementsCache();
  for (const types of [['t2v'], ['flf']]) { const req = R.requirementsFor(tool, LOCAL, { types, mode: types[0] })!;
    assert.equal(req.missingBytesSource, 'checked'); assert.deepEqual(req.missingFiles!.map((f) => [f.file, f.folder, f.url, f.bytes]), [[P.PIKA_LORA, 'loras', row.url, P.PIKA_LORA_BYTES]], `${types}: only the LoRA is missing, with its link`);
    assert.equal(req.missingBytes, P.PIKA_LORA_BYTES);
    const dl = planFiles({ downloadId: req.downloadId }, MD); assert.ok(dl.files.some((f) => f.file === P.PIKA_LORA && (f as any).url === row.url), `one-click download names the LoRA (${JSON.stringify(dl.files.map((f) => f.file))})`); }
  const gate = R.weightsGate(tool, LOCAL, { types: ['t2v'], mode: 't2v' }); if (gate) assert.match(JSON.stringify(gate), /pika_h3_flex_fl2va_v1_bf16/, 'the gate names the LoRA');
  ok(`files: manifest row ${row.url} (${(row.size! / 1e9).toFixed(2)} GB); with the H3 base on disk only the LoRA is missing and downloadable`);

  // ---- 4. hardware ----
  for (const prof of ['mac64', 'mac256']) { HW.setHardwareOverride(prof); R.clearRequirementsCache(); const f = R.fitFor(tool, LOCAL, { types: ['t2v'], mode: 't2v' });
    assert.equal(f.reasonCode, 'unsupported_weights', `${prof}: ${f.verdict}/${f.reasonCode}`); assert.equal(R.fitFor(tool, 'comfy-h3', { types: ['t2v'] }).reasonCode, 'unsupported_weights', 'same as MiniMax H3');
    assert.match(R.tooHeavyWarning(f, 'Pika H3 Flex'), /needs an NVIDIA graphics card/); assert.doesNotMatch(R.tooHeavyWarning(f, 'Pika H3 Flex'), /\bMac\b/); }
  HW.setHardwareOverride('spark'); R.clearRequirementsCache(); assert.notEqual(R.fitFor(tool, LOCAL, { types: ['t2v'], mode: 't2v' }).reasonCode, 'unsupported_weights', 'NVIDIA: not blocked');
  ok('hardware: on an Apple chip "needs an NVIDIA graphics card" (as MiniMax H3); NVIDIA Spark not blocked');
  console.log('ALL OK pika-h3-flex-local');
} finally { HW.setHardwareOverride(null); fs.rmSync(D, { recursive: true, force: true }); }
