// Mock test (no ComfyUI): Wan Animate workflow set wiring + optional matte. Run: npx tsx test/object-swap-wan.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'osw-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const { pickVariant, planObjectSwap, patchGraph, prepareObjectSwap, swapSet } = await import('../src/comfy/objectSwap.js');
const { buildPlan } = await import('../src/comfy/plans.js'); const { config } = await import('../src/config.js');
const rd = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', f]).toString()).streams[0];

assert.equal(swapSet(), 'object-swap-wan-animate'); assert.ok(config.workflowPath.endsWith('object-swap-wan-animate-api.json'), config.workflowPath);
for (const [d, ext] of [[4, 0], [10, 2], [40, 6]] as const) { const v = pickVariant(d); assert.equal(v.ext, ext); assert.ok(v.file.endsWith(`object-swap-wan-animate/ext-${ext}.json`)); assert.equal(v.mask, false);
  const m = pickVariant(d, { mask: true }); assert.ok(m.file.endsWith(`object-swap-wan-animate/mask-ext-${ext}.json`)); assert.equal(m.mask, true); }
process.env.OPENHIGGSFIELD_SWAP_WORKFLOWS = 'legacy';
{ const v = pickVariant(10, { mask: true }); assert.equal(v.set, 'object-swap'); assert.ok(v.file.endsWith('object-swap/ext-2.json')); assert.equal(v.mask, false, 'legacy has no mask-ext → matte ignored'); }
delete process.env.OPENHIGGSFIELD_SWAP_WORKFLOWS;
console.log('ok pickVariant: wan set default, mask-ext-N with a matte, legacy fallback (OPENHIGGSFIELD_SWAP_WORKFLOWS=legacy)');

const base = { duration: 10, width: 1280, height: 720, resolution: '720p' };
{ const p = planObjectSwap(base); const g = patchGraph(rd(p.file), p, { image: 'r.png', video: 'v.mp4', prompt: 'x', seed: 7 }); assert.ok(!g.oj_mask_video); assert.equal(g['145'].inputs.file, 'v.mp4');
  const pm = planObjectSwap({ ...base, maskPath: '/x/m.mp4' }); const gm = patchGraph(rd(pm.file), pm, { image: 'r.png', video: 'v.mp4', prompt: 'x', seed: 7, mask: 'm16.mp4' });
  assert.equal(gm.oj_mask_video.inputs.file, 'm16.mp4'); assert.deepEqual(gm['274'].inputs.mask, ['oj_mask', 0]); assert.ok(!gm['107'] && !gm['108']);
  assert.throws(() => patchGraph(rd(pm.file), pm, { image: 'r.png', video: 'v.mp4', prompt: 'x', seed: 7 }), /mask video/); console.log('ok patchGraph sets oj_mask_video.file (mask-ext graph), plain graph untouched'); }

// prepareObjectSwap: real ffmpeg conversion of source + matte to 16 fps at the processed size
const src = path.join(D, 'src.mp4'), matte = path.join(D, 'matte.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-t', '5', '-pix_fmt', 'yuv420p', src]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:size=1920x1080:rate=30', '-vf', 'drawbox=x=600:y=200:w=400:h=600:color=white:t=fill', '-t', '5', '-pix_fmt', 'yuv420p', matte]);
{ const job = { id: 'tjob', input: { videoPath: src, imagePath: path.join(D, 'r.png'), maskPath: matte, duration: 5, width: 1280, height: 720, resolution: '720p', seed: 3, refPaths: [] } };
  const r = await prepareObjectSwap(job as any, 'swap', (p: string) => path.basename(p)); assert.ok(r.plan.mask && r.mask16);
  const s = probe(r.video16), m = probe(r.mask16!); assert.equal(m.r_frame_rate, '16/1'); assert.deepEqual([m.width, m.height], [s.width, s.height]); assert.deepEqual([m.width, m.height], [r.plan.width, r.plan.height]);
  assert.equal(r.graph.oj_mask_video.inputs.file, 'tjob-matte-16fps.mp4'); assert.ok(r.plan.file.endsWith('mask-ext-1.json'));
  const r0 = await prepareObjectSwap({ ...job, id: 'tjob0', input: { ...job.input, maskPath: undefined } } as any, 'swap', (p: string) => path.basename(p)); assert.equal(r0.mask16, null); assert.ok(r0.plan.file.endsWith('/ext-1.json'));
  console.log(`ok prepareObjectSwap: matte → ${m.width}x${m.height} @ ${m.r_frame_rate} (= source), graph ${path.basename(r.plan.file)}; no matte → ${path.basename(r0.plan.file)}`); }

// dry-run plan (comfy/plans.ts): mask prep step + graph
{ const job: any = { id: 'pj', toolId: 'object-swap', provider: 'comfy-open', status: 'queued', input: { mode: 'object_swap', videoPath: src, imagePath: path.join(D, 'r.png'), refPaths: [path.join(D, 'r.png')], maskPath: matte, duration: 5, width: 1280, height: 720, resolution: '720p', seed: 1, prompt: 'swap' }, outputs: [], createdAt: Date.now() };
  try { const plan: any = buildPlan(job); const pass = plan.passes[0]; assert.ok(pass.workflow.endsWith('mask-ext-1.json'), pass.workflow); assert.equal(pass.prep.length, 2); assert.equal(pass.prep[1].src, matte); assert.equal(pass.prep[1].fps, 16);
    assert.equal(pass.graph.oj_mask_video.inputs.file.__file, `${matte}.pj-16fps.mp4`); assert.equal(pass.prep[1].out, `${matte}.pj-16fps.mp4`); console.log(`ok buildPlan dry-run: ${pass.workflow}, prep fps×2 (source + matte)`); }
  catch (e: any) { if (/no ComfyUI plan|h3/i.test(e.message)) console.log(`note buildPlan: ${e.message}`); else throw e; } }
console.log('ALL OK object-swap-wan');
