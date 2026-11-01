// Camera Moves: one shared list of the moves each graph route runs (comfy/cameraPresets.ts CAMERA_ENGINE_MOVES) drives every preset's providers.
// Every one of the 82 presets × every engine listed for it builds a non-empty plan (local graphs) or prompt (cloud models); every unlisted pair is
// refused with a plain 400 by the job check, before anything runs.
// Run: npx tsx test/camera-engine-moves.test.ts   (in-process, mock backend, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'camera-engine-moves-')); process.env.OPENHIGGSFIELD_BACKEND ??= 'mock';
const ok = (m: string) => console.log('ok ' + m);
const { cameraApp, cameraPresetOff } = await import('../src/tools/apps.ts');
const { CAMERA_ENGINE_MOVES, cameraEnginesFor } = await import('../src/comfy/cameraPresets.ts');
const { buildPlan } = await import('../src/comfy/plans.ts');
const { videoAppPrompt } = await import('../src/routing/routerModels.ts');
const { ROUTER_APP_MODELS } = await import('../src/shared/videoAppWorkflows.ts');

const presets = cameraApp.presets as any[]; const engines = cameraApp.providers;
assert.equal(presets.length, 82, '82 camera presets');

// ---- the providers come from the shared list: graph routes only for the moves their plan knows
for (const p of presets) {
  const graphs = cameraEnginesFor(p.id);
  for (const g of Object.keys(CAMERA_ENGINE_MOVES)) assert.equal(p.providers.includes(g), graphs.includes(g), `${p.id} on ${g}: listed only when the graph runs it`);
  assert.ok(p.providers.length > 0, `${p.id}: at least one engine`);
  for (const pr of p.providers) assert.ok(engines.includes(pr), `${p.id}: ${pr} is a Camera Moves engine`);
}
const local = presets.filter((p) => p.providers.includes('comfy-open')).map((p) => p.id);
assert.equal(local.length, 27, '20 Wan 2.2 Fun Camera moves + 7 LTX moves on your own computer'); assert.ok(!local.includes('fisheye') && !local.includes('free'), 'catalogue moves stay off');
ok(`providers from CAMERA_ENGINE_MOVES (${local.length} moves on your own computer)`);

// ---- every listed pair builds a non-empty plan / prompt
const img = path.join(process.env.OPENHIGGSFIELD_DATA_DIR!, 'start.png'); let pairs = 0;
for (const p of presets) for (const pr of p.providers) {
  const input = { types: [p.id], typePrompt: p.prompt, prompt: 'a lighthouse on a cliff at dusk', imagePath: img, duration: 5, mode: 'camera' };
  if ((ROUTER_APP_MODELS as string[]).includes(pr)) { const t = videoAppPrompt(input); assert.ok(t.includes('lighthouse') && (!p.prompt || t.includes(String(p.prompt).replace(/[.\s]+$/, ''))), `${p.id} on ${pr}: prompt carries the move`); }
  else { const plan = buildPlan({ id: `t-${p.id}`, toolId: 'camera', provider: pr, input } as any); assert.ok(plan.passes.length > 0, `${p.id} on ${pr}: plan has passes`);
    for (const ps of plan.passes) assert.ok(ps.graph && Object.keys(ps.graph).length > 0, `${p.id} on ${pr}: graph`); }
  pairs++;
}
ok(`${pairs} preset × engine pairs build a non-empty plan or prompt`);

// ---- every unlisted pair: the job check refuses it (400 code unsupported), and the plan builder never runs an empty plan
let refused = 0;
for (const p of presets) for (const pr of engines.filter((e) => !p.providers.includes(e))) {
  assert.equal(cameraPresetOff([p.id], pr), p.id, `${p.id} off on ${pr}`);
  const r: any = await cameraApp.parseInput({ types: JSON.stringify([p.id]), prompt: 'x', provider: pr, duration: '5' }, {});
  assert.equal(r.code, 'unsupported', `${p.id} on ${pr}: ${JSON.stringify(r).slice(0, 160)}`); assert.match(r.error, /isn't available on .+\. It runs on .+\.$/); refused++;
}
{ const r: any = await cameraApp.parseInput({ types: '["fisheye"]', prompt: 'x', provider: 'comfy-open' }, {});
  assert.equal(r.error, "Fisheye isn't available on Wan 2.2 Fun Camera 14B. It runs on Seedance or MiniMax H3.");
  const l: any = await cameraApp.parseInput({ types: '["ltx-dolly-in"]', prompt: 'x', provider: 'router-seedance' }, {}); assert.match(l.error, /It runs on LTX-2 19B\.$/, 'LTX moves name LTX-2, not Fun Camera'); }
assert.throws(() => buildPlan({ id: 't-off', toolId: 'camera', provider: 'comfy-open', input: { types: ['fisheye'], imagePath: img, duration: 5 } } as any), /runs on Seedance or MiniMax H3/);
ok(`${refused} unsupported pairs refused with a plain 400; an unknown move never builds an empty plan`);
