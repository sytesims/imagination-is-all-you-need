/** H3 additions: rules (17n+5, x32, area cap, LoRA family), plans for every new graph, routes/caps/prices, input parsing.
 *  Run: npx tsx test/h3.test.ts [outDir]  (writes every graph to outDir for scripts/validate-workflows.py). */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DATA_DIR, SAMPLES_DIR } from '../src/config.js';
import '../src/tools/registry.js';
import { getTool } from '../src/tools/registry.js';
import { h3Frames, framesOk, h3Size, sizeIssues, loraIssues, H3_AREA_CAP } from '../src/tools/h3/rules.js';
import { buildPlan, hasPlan } from '../src/comfy/plans.js';
import { routesFor } from '../src/routing/routes.js';
import { routeCredits } from '../src/routing/select.js';
import { HOSTED_BY_ID } from '../src/shared/hostedPrices.js';
const out = process.argv[2]; if (out) mkdirSync(out, { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });
copyFileSync(path.join(SAMPLES_DIR, 'sample-character.png'), path.join(DATA_DIR, 'h3t-a.png')); copyFileSync(path.join(SAMPLES_DIR, 'sample-character.png'), path.join(DATA_DIR, 'h3t-b.png'));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=4', path.join(DATA_DIR, 'h3t-speech.wav')]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24:duration=6', '-f', 'lavfi', '-i', 'sine=duration=6', '-shortest', '-pix_fmt', 'yuv420p', path.join(DATA_DIR, 'h3t-src.mp4')]);
let ok = 0; let dumped = 0; const t = async (n: string, fn: () => unknown) => { await fn(); ok++; console.log('ok', n); };
const dump = (name: string, p: any) => { if (out) for (const x of p.passes) writeFileSync(`${out}/h3-${name}-${dumped++}.json`, JSON.stringify(x.graph)); };
const job = (toolId: string, provider: string, input: any) => ({ id: 'h3t', toolId, provider, input });

await t('frames 17n+5', () => { for (const s of [1, 5, 6, 10, 15]) assert.ok(framesOk(h3Frames(s)), String(s)); assert.equal(h3Frames(5), 124); assert.equal(h3Frames(10), 243); assert.ok(!framesOk(120)); });
await t('sizes x32 and ≤ 1344×768', () => { for (const a of ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']) for (const r of ['768p', '480p']) { const s = h3Size(a, r); assert.deepEqual(sizeIssues(s.width, s.height), [], `${a} ${r}`); assert.ok(s.width * s.height <= H3_AREA_CAP); } assert.deepEqual(h3Size('16:9'), { width: 1344, height: 768 }); assert.equal(sizeIssues(1360, 768).length, 2); });
await t('LoRA family check (+ akatz exception)', () => {
  assert.equal(loraIssues('minimax_h3_fl2va_pruned_int8_convrot.safetensors', [{ file: 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors' }]).length, 1);
  assert.deepEqual(loraIssues('minimax_h3_ref2va_pruned_int8_convrot.safetensors', [{ file: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors' }]), []);
  assert.equal(loraIssues('minimax_h3_ref2va_pruned_int8_convrot.safetensors', [{ file: 'x.safetensors', family: 'ref2va', fullBuild: true }]).length, 1);
});
const parse = (tool: string, f: Record<string, string>, files: Record<string, string[]> = {}) => getTool(tool)!.parseInput({ rights: '1', seed: '7', ...f }, files) as Promise<any>;
await t('Generate Video: start + end frame, Fast/Quality', async () => {
  const miss = await parse('h3-video', { types: '["flf"]', prompt: 'a door opens' }, { image: ['h3t-a.png'] }); assert.match(miss.error, /end frame/);
  for (const quality of ['quality', 'fast']) {
    const i = await parse('h3-video', { types: '["flf"]', prompt: 'a door opens', quality, duration: '6' }, { image: ['h3t-a.png'], lastFrame: ['h3t-b.png'] }); assert.ok(!i.error, i.error);
    assert.ok(i.lastFramePath && i.audio === true); const j = job('h3-video', 'comfy-h3', i); assert.ok(hasPlan(j)); const p = buildPlan(j as any); dump(`flf-${quality}`, p);
    const g = p.passes[0].graph; assert.equal(g['11'].inputs.value, quality === 'fast' ? 8 : 20); assert.deepEqual(g['50'].inputs.image, { __file: i.imagePath }); assert.deepEqual(g['51'].inputs.image, { __file: i.lastFramePath });
  }
  const f = await parse('h3-video', { types: '["t2v"]', prompt: 'surf', quality: 'fast' }); const p = buildPlan(job('h3-video', 'comfy-h3', f) as any); dump('t2v-fast', p); assert.equal(p.passes[0].workflow, 'h3-t2v-fast-api.json');
});
await t('Voice: talking photo', async () => {
  const i = await parse('voice', { types: '["lipsync"]', provider: 'comfy-h3-lipsync' }, { image: ['h3t-a.png'], speech: ['h3t-speech.wav'] }); assert.ok(!i.error, i.error);
  assert.equal(i.duration, 4); assert.equal(i.outKind, 'av-video'); const p = buildPlan(job('voice', 'comfy-h3-lipsync', i) as any); dump('lipsync', p);
  const g = p.passes[0].graph; assert.equal(g['11'].inputs.value, 6); assert.deepEqual(g['52'].inputs.audio, { __file: i.speechPath });
  assert.match((await parse('voice', { types: '["lipsync"]' }, { image: ['h3t-a.png'] })).error, /speech/);
});
await t('Camera Moves: H3 presets + intensity', async () => {
  for (const intensity of ['slow', 'aggressive']) {
    const i = await parse('camera', { types: '["h3-orbit"]', intensity, provider: 'comfy-h3-camera', duration: '5' }, { image: ['h3t-a.png'] }); assert.ok(!i.error, i.error);
    const p = buildPlan(job('camera', 'comfy-h3-camera', i) as any); dump(`camera-${intensity}`, p); const g = p.passes[0].graph;
    assert.equal(g['30'].inputs.strength_model, intensity === 'slow' ? 0.6 : 1.0); assert.match(g['20'].inputs.prompt, /^camera motion, .*orbit/);
  }
  assert.equal(getTool('camera')!.presets.filter((x: any) => x.group === 'H3 camera').length, 7);
});
await t('Extend +5/+10', async () => {
  for (const s of ['5', '10']) {
    const i = await parse('h3-extend', { prompt: 'she turns and waves', extendSeconds: s }, { video: ['h3t-src.mp4'] }); assert.ok(!i.error, i.error); assert.equal(i.duration, Number(s));
    const p = buildPlan(job('h3-extend', 'comfy-h3-extend', i) as any); dump(`extend-${s}`, p); assert.equal(p.passes[0].prep![0].kind, 'fps');
  }
  assert.match((await parse('h3-extend', { prompt: 'x', extendSeconds: '15' }, { video: ['h3t-src.mp4'] })).error, /2–14 seconds/); // +7 s is H3 Extend · Comfy Cloud's (2–14 s); 15 s is no place's
});
await t('Restyle + VFX (local only)', async () => {
  for (const prov of ['comfy-h3-restyle', 'comfy-h3-vfx']) {
    const i = await parse('restyle', { preset: 'watercolor', provider: prov }, { video: ['h3t-src.mp4'], refs: ['h3t-a.png'] }); assert.ok(!i.error, i.error);
    const p = buildPlan(job('restyle', prov, i) as any); dump(prov, p); assert.match(p.passes[0].graph['20'].inputs.prompt, prov.endsWith('vfx') ? /^vfx_edit: / : /^style_transfer: /);
    assert.equal(routesFor(prov).length, 1, 'no cloud route (licence)');
  }
});
await t('Motion Transfer excludes H3 Character Swap but keeps Kling, Seedance and Wan', () => { const mt = getTool('motion-transfer')!; assert.ok(!mt.providers.includes('comfy-h3-charswap')); assert.equal(mt.providers[0], 'router-kling-edit'); assert.ok(mt.providers.includes('router-seedance')); assert.ok(mt.providers.includes('router-seedance-25-edit')); assert.ok(mt.providers.includes('comfy-open')); assert.ok(getTool('object-swap')!.providers.includes('comfy-h3-charswap')); });
await t('routes, caps and prices (charge = shown)', () => {
  const v = routesFor('comfy-h3'); assert.deepEqual(v.map((r) => r.routeId), ['local:comfy-h3', 'fal:minimax/h3/text-to-video', 'fal:minimax/h3/image-to-video', 'fal:minimax/h3/reference-to-video', 'replicate:minimax/h3', 'direct:minimax/h3' /* MiniMax API, 2026-10-23 */]);
  assert.equal(v[0].priceRef, null); assert.ok(v.every((r) => (r.caps as any)?.audio === true));
  const tool = getTool('h3-video')!;
  assert.equal(routeCredits(tool, v[1], { mode: 't2v', duration: 10, resolution: '768p' }), 60); assert.equal(routeCredits(tool, v[1], { mode: 't2v', duration: 10, resolution: '480p' }), 50);
  assert.equal(routeCredits(tool, v[4], { mode: 't2v', duration: 10, resolution: '768p' }), 80); assert.equal(routeCredits(tool, v[0], { duration: 10 }), 0);
  const ext = routesFor('comfy-h3-extend'); assert.equal(routeCredits(getTool('h3-extend')!, ext[1], { duration: 5, resolution: '768p' }), 40); assert.equal(routeCredits(getTool('h3-extend')!, ext[1], { duration: 10, resolution: '768p' }), 80);
  const ls = routesFor('comfy-h3-lipsync'); assert.equal(routeCredits(getTool('voice')!, ls.find((r) => r.routeId === 'fal:minimax/h3/reference-to-video#lipsync')!, { mode: 'lipsync', duration: 4, resolution: '768p' }), 24); // the Router place (2026-10-26) is listed first
  for (const id of ['fal:minimax/h3/text-to-video', 'fal:minimax/h3/image-to-video', 'fal:minimax/h3/reference-to-video', 'fal:minimax/h3-max/extend-video', 'replicate:minimax/h3']) { const h = HOSTED_BY_ID[id]; assert.ok(h && h.sourceUrl.startsWith('https://') && h.checkedAt === '2026-10-17', id); }
  assert.equal(routesFor('comfy-h3-camera')[1].routeId, 'fal:minimax/h3/image-to-video#camera');
});
console.log(`\n${ok} passed`);

// Design Planner bug (2026-10-17): h3-extend declared options = what parseInput accepts; default valid; caps on H3 Character Swap
{
  const { getTool } = await import('../src/tools/registry.js'); const { routesFor } = await import('../src/routing/routes.js'); const { catalogFor } = await import('../src/shared/modelCatalog.js');
  const t: any = getTool('h3-extend'); const f = t.inputs.find((x: any) => x.name === 'resolution');
  if (JSON.stringify(f.options) !== JSON.stringify(t.app.resolutions) || !f.options.includes(f.default)) throw new Error('h3-extend resolution options/default disagree');
  const r = await t.parseInput({ resolution: '720p', prompt: 'x', extendSeconds: '5' }, {}); if (!r.error || r.issues?.[0]?.field !== 'resolution') throw new Error('h3-extend should reject 720p');
  const native = routesFor('comfy-h3-charswap')[0]; if (!native.caps?.experimental || !native.caps?.localOnly) throw new Error('charswap caps');
  for (const k of ['object-swap', 'motion-transfer']) { const c = catalogFor(k, 'comfy-h3-charswap'); if (!c?.experimental || !c?.localOnly) throw new Error(`charswap card ${k}`); }
  console.log('ok h3-extend resolution options = validation (768p default), H3 Character Swap experimental + localOnly');
}
