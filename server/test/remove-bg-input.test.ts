/** Remove Background (and the other local video graphs) must process the user's upload, never the template's sample clip.
 *  Job 44ba4440 (2026-11-01): a 480×864 cartoon upload came back as a 1280×720 sample clip cut out in a circle, because remove-bg had no
 *  local plan and fell back to the mock render on a real ComfyUI. Run: npx tsx test/remove-bg-input.test.ts */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { buildPlan, hasPlan, templateVideoDefaults, wireVideo } from '../src/comfy/plans.js';
import { WORKFLOWS_DIR, config } from '../src/config.js';
import { alphaFrame } from '../src/tools/shared.js';
import { removeBgTool, depthMapTool } from '../src/tools/editVideo/index.js';

const SRC = '/data/44ba4440-video0.mp4';
const job = (toolId: string, provider: string, input: Record<string, any>) => ({ id: 'tplan', toolId, provider, input: { videoPath: SRC, width: 480, height: 864, keepAudio: true, hasAudio: true, ...input } });
const outsOf = (p: any) => p.passes.map((x: any) => [x.output, ...(x.extraOutputs ?? []).map((e: any) => e.node)]);

// 1. the built plan's load node points at the uploaded file (every background), and the local route has a plan at all
assert.equal(hasPlan(job('remove-bg', 'comfy-birefnet-video', { types: ['transparent'] }) as any), true, 'remove-bg must have a local plan');
assert.equal(hasPlan(job('depth-map', 'comfy-depth-anything-v2', { types: ['grey'] }) as any), true, 'depth-map must have a local plan');
for (const bg of ['transparent', 'green', 'black', 'white']) {
  const p = buildPlan(job('remove-bg', 'comfy-birefnet-video', { types: [bg], alpha: bg === 'transparent' }) as any); const g = p.passes[0].graph;
  assert.deepEqual(g['1'].inputs.file, { __file: SRC }, `${bg}: LoadVideo reads the upload`);
  assert.equal(p.passes.length, 1); assert.equal(p.muxSourceAudio, true);
  assert.equal(p.passes[0].output, bg === 'transparent' ? '6' : '13');
  assert.ok(!g['9'], `${bg}: the matte preview is not part of the run`);
  // no template composite, circle mask or resize on the output path: the result is the clip's own frames at the clip's own size
  for (const [id, n] of Object.entries<any>(g)) assert.ok(!/Scale|Resize|Crop|Pad|Composite|geq|Circle|Ellipse/i.test(n.class_type), `${bg}: node ${id} ${n.class_type} changes the frame`);
  if (bg === 'transparent') { assert.equal(g['6'].class_type, 'SaveWEBM'); assert.deepEqual(g['11'].inputs.image, ['2', 0], 'alpha joins the source frames'); }
  else { assert.equal(g['4'].inputs.fill_color, true); assert.equal(g['4'].inputs.color, { green: 0x00ff00, black: 0, white: 0xffffff }[bg]); assert.deepEqual(g['12'].inputs.images, ['4', 0]); }
  assert.deepEqual(templateVideoDefaults(g, p.passes[0].workflow, outsOf(p)[0]), [], `${bg}: no template default left`);
}
for (const t of ['grey', 'inverted']) {
  const p = buildPlan(job('depth-map', 'comfy-depth-anything-v2', { types: [t] }) as any); const g = p.passes[0].graph;
  assert.deepEqual(g['1'].inputs.file, { __file: SRC }); assert.equal(!!g['6'], t === 'inverted');
}

// 2. refuse to run when the load node can't be wired (never silently use the graph's default file)
assert.throws(() => buildPlan(job('remove-bg', 'comfy-birefnet-video', { types: ['transparent'], videoPath: undefined }) as any), /No source video/);
assert.throws(() => buildPlan(job('depth-map', 'comfy-depth-anything-v2', { types: ['grey'], videoPath: '' }) as any), /No source video/);
assert.throws(() => buildPlan(job('fps-boost', 'comfy-rife', { types: ['60'], videoPath: null }) as any), /No source video/);
assert.throws(() => wireVideo({ '1': { class_type: 'LoadImage', inputs: { image: 'x.png' } } }, '1', SRC), /not a video loader/);
assert.throws(() => wireVideo({}, '7', SRC), /not a video loader/);
assert.throws(() => buildPlan(job('remove-bg', 'comfy-birefnet-video', { types: ['purple'] }) as any), /no "purple" background/);

// 3. guard: every video load node in every workflow is seen by the check (raw template = its sample file left), and no built
//    local video plan keeps one
const files: string[] = []; const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.json')) files.push(p); } }; walk(WORKFLOWS_DIR);
let loaders = 0;
for (const f of files) {
  let g: any; try { g = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; } if (!g || typeof g !== 'object' || Array.isArray(g)) continue;
  const ids = Object.keys(g).filter((k) => /^(LoadVideo|VHS_LoadVideo)/.test(String(g[k]?.class_type)) && typeof (g[k].inputs?.file ?? g[k].inputs?.video) === 'string'); if (!ids.length) continue;
  loaders += ids.length; const left = templateVideoDefaults(g, path.relative(WORKFLOWS_DIR, f), ids);
  assert.equal(left.length, ids.length, `${path.relative(WORKFLOWS_DIR, f)}: the guard must see every sample file (${left.join(', ')})`);
}
assert.ok(loaders >= 20, `scanned ${loaders} video load nodes`);
const localVideo: [string, string, Record<string, any>][] = [
  ...['transparent', 'green', 'black', 'white'].map((bg) => ['remove-bg', 'comfy-birefnet-video', { types: [bg] }] as [string, string, Record<string, any>]),
  ['depth-map', 'comfy-depth-anything-v2', { types: ['grey'] }], ['depth-map', 'comfy-depth-anything-v2', { types: ['inverted'] }],
  ['fps-boost', 'comfy-rife', { types: ['60'] }], ['fps-boost', 'comfy-rife', { types: ['48'] }],
  ...['comfy-video-esrgan', 'comfy-video-ultrasharp', 'comfy-seedvr2'].map((pv) => ['upscale', pv, { types: ['precise'], resolution: '1080p', outputSize: { width: 1080, height: 1920 } }] as [string, string, Record<string, any>]),
];
for (const [tool, provider, input] of localVideo) {
  const j = job(tool, provider, input); assert.equal(hasPlan(j as any), true, `${tool} on ${provider} has a plan`);
  const p = buildPlan(j as any);
  p.passes.forEach((x: any, k: number) => assert.deepEqual(templateVideoDefaults(x.graph, x.workflow, outsOf(p)[k]), [], `${tool} on ${provider}: the template's sample clip survived`));
}

// 4. a portrait input keeps portrait output size (real graph: no resize; the sample render: the clip's own size)
assert.deepEqual(alphaFrame({ width: 480, height: 864, resolution: '720p' }), [480, 864]);
assert.deepEqual(alphaFrame({ width: 481, height: 865, resolution: '720p' }), [482, 866], 'even sizes for VP9');
assert.deepEqual(alphaFrame({ resolution: '720p' }), [1280, 720], 'no size known: the old 720p frame');
{ const [w, h] = alphaFrame({ width: 1080, height: 1920 }); assert.ok(h > w, 'portrait stays portrait'); }
{ const p = buildPlan(job('remove-bg', 'comfy-birefnet-video', { types: ['transparent'] }) as any); assert.deepEqual([p.passes[0].expect.width, p.passes[0].expect.height], [480, 864]); }

// 5. on a real backend the tool never hands back a sample when its graph can't run
{ const was = config.backend; (config as any).backend = 'comfy';
  try {
    for (const tool of [removeBgTool, depthMapTool]) {
      const j: any = { id: 'tx', toolId: tool.id, provider: tool.providers[0], status: 'queued', input: { videoPath: SRC, types: [tool.id === 'remove-bg' ? 'transparent' : 'grey'], alpha: tool.id === 'remove-bg' }, outputs: [] };
      await tool.run(j);
      assert.equal(j.status, 'failed', `${tool.id}: failed, not a sample`); assert.equal(j.outputs.length, 0); assert.ok(!j.simulated, `${tool.id}: not marked as a sample`); assert.match(j.error, /nothing was made/);
    }
  } finally { (config as any).backend = was; } }

console.log(`remove-bg input ok (${files.length} workflows, ${loaders} video load nodes, ${localVideo.length} local video plans)`);
