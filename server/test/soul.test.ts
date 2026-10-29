/** OpenSoul: input validation, preset → LoRA mapping, engine choice, colour match, batch/upscale → ComfyUI plans.
 *  Run: npx tsx test/soul.test.ts [outDir]  (writes every graph to outDir for scripts/validate-workflows.py). */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, SAMPLES_DIR } from '../src/config.js';
import { soulTool } from '../src/tools/soul/tool.js';
import '../src/tools/soul/index.js';
import { SOUL_PRESETS, SOUL_LORAS } from '../src/tools/soul/presets.js';
import { pickEngine } from '../src/tools/soul/plan.js';
import { buildPlan, hasPlan } from '../src/comfy/plans.js';
import { routesFor } from '../src/routing/routes.js';
import { buildLicenseReport } from '../src/licensesReport.js';
const out = process.argv[2]; if (out) mkdirSync(out, { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });
for (const f of ['soul-t-ref1.png', 'soul-t-ref2.png', 'soul-t-col.png']) copyFileSync(path.join(SAMPLES_DIR, 'sample-character.png'), path.join(DATA_DIR, f));
let dumped = 0; const dump = (name: string, p: any) => { if (out) for (const x of p.passes) writeFileSync(`${out}/${name}-${dumped++}.json`, JSON.stringify(x.graph)); };
const parse = (f: Record<string, string>, files: Record<string, string[]> = {}) => soulTool.parseInput({ prompt: 'a woman in a cafe', seed: '7', ...f }, files) as Promise<any>;
const plan = async (f: Record<string, string>, files: Record<string, string[]> = {}) => { const i = await parse(f, files); assert.ok(!i.error, i.error); const j = { id: 't', toolId: 'soul', provider: 'comfy-soul', input: i }; assert.ok(hasPlan(j)); return { i, p: buildPlan(j as any) }; };
let ok = 0; const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); ok++; console.log('ok', name); };

await t('22 presets, LoRA files exist in catalog, fallbacks flagged', () => {
  assert.equal(SOUL_PRESETS.length, 22);
  for (const p of SOUL_PRESETS) { assert.equal(p.fallback, p.loras.length === 0); for (const l of p.loras) { assert.ok(SOUL_LORAS[l.lora], l.lora); assert.equal(SOUL_LORAS[l.lora].base, p.base, `${p.id} LoRA base`); assert.ok(l.strength > 0 && l.strength <= 1); } }
});
await t('default = ZIT + realism LoRA 0.5, styles bypassed', async () => {
  const { p } = await plan({}); const g = p.passes[0].graph; dump('zit-default', p);
  assert.equal(g['1'].inputs.unet_name, 'z_image_turbo_bf16.safetensors'); assert.equal(g['10'].inputs.strength_model, 0.5); assert.ok(!g['11'] && !g['12'] && !g['41'] && !g['51']);
  assert.deepEqual(g['13'].inputs.model, ['10', 0]); assert.deepEqual(g['9'].inputs.images, ['32', 0]);
});
await t('every preset plans with the right base + LoRAs', async () => {
  for (const pr of SOUL_PRESETS) {
    const { p } = await plan({ preset: pr.id }); const g = p.passes[0].graph; dump(`preset-${pr.id}`, p);
    const files = Object.values<any>(g).filter((n) => n.class_type === 'LoraLoaderModelOnly').map((n) => n.inputs.lora_name);
    for (const l of pr.loras) assert.ok(files.includes(SOUL_LORAS[l.lora].file), `${pr.id} has ${l.lora}`);
    assert.ok(g['20'].inputs.text.includes(pr.prompt.split(',')[0]));
  }
});
await t('aspect, n=4 → 4 passes with distinct seeds, upscale x4', async () => {
  const { p } = await plan({ aspect: '9:16', n: '4', upscale: 'x4' }); dump('batch', p);
  assert.equal(p.passes.length, 4); assert.deepEqual(p.passes.map((x) => x.graph['31'].inputs.seed), [7, 8, 9, 10]);
  assert.equal(p.passes[0].graph['30'].inputs.width, 768); assert.equal(p.passes[0].graph['30'].inputs.height, 1360); assert.equal(p.passes[0].graph['50'].inputs.model_name, 'RealESRGAN_x4plus.pth');
});
await t('validation errors', async () => {
  for (const [f, field] of [[{ n: '2' }, 'n'], [{ aspect: '5:4' }, 'aspect'], [{ upscale: 'x8' }, 'upscale'], [{ preset: 'nope' }, 'preset'], [{ colourHex: '#zzz' }, 'colourHex'], [{ colourHex: '#112233', colourStrength: '0.9' }, 'colourStrength'], [{ colourHex: '#112233', colourStrength: '0.2' }, 'colourStrength'], [{ prompt: '' }, 'prompt'], [{ engine: 'x' }, 'engine']] as const) {
    const r = await parse(f as any); assert.ok(r.error, JSON.stringify(f)); assert.equal(r.issues[0].field, field);
  }
  assert.ok(!(await parse({}, { refs: ['soul-t-ref1.png'] })).issues?.some((i: any) => i.field === 'rights'), 'no rights confirmation required (no policing layer)');
  assert.equal((await parse({ rights: '1', engine: 'pulid' }, { refs: ['soul-t-ref1.png', 'soul-t-ref2.png'] })).issues[0].field, 'refs');
});
await t('colour match: HEX palette swatch + image ref, strength 0.3–0.7', async () => {
  const { i, p } = await plan({ colourHex: '#ff8800, #003366', colourStrength: '0.6', colourMethod: 'mkl_lab' }); dump('colour-hex', p);
  assert.equal(i.colour.source, 'hex'); const g = p.passes[0].graph; assert.equal(g['41'].inputs.strength, 0.6); assert.equal(g['41'].inputs.method, 'mkl_lab'); assert.ok(g['40'].inputs.image.__file.endsWith('.png'));
  const r = await plan({ colourStrength: '0.3' }, { colourRef: ['soul-t-col.png'] }); assert.equal(r.i.colour.source, 'image'); assert.equal(r.p.passes[0].graph['41'].inputs.strength, 0.3);
});
await t('engine auto: 1 face → PuLID, max → InfiniteYou, subject → ACE++, 2 refs → Qwen-Edit', async () => {
  assert.equal(pickEngine({ refs: 1 }), 'pulid'); assert.equal(pickEngine({ refs: 1, likeness: 'max' }), 'infiniteyou'); assert.equal(pickEngine({ refs: 1, refKind: 'subject' }), 'aceplus'); assert.equal(pickEngine({ refs: 3 }), 'qwen-edit');
  const r1 = { refs: ['soul-t-ref1.png'] };
  let x = await plan({ rights: '1', preset: 'magazine-cover' }, r1); dump('pulid', x.p); let g = x.p.passes[0].graph; assert.equal(x.i.engine, 'pulid'); assert.ok(g['73'] && g['60'].inputs.image.__file); assert.equal(g['12'] ? 1 : 0, 0); assert.equal(g['11'].inputs.lora_name, 'flux-fash.safetensors');
  x = await plan({ rights: '1', likeness: 'max' }, r1); dump('infiniteyou', x.p); g = x.p.passes[0].graph; assert.equal(x.i.engine, 'infiniteyou'); assert.ok(g['78']); assert.equal(g['74'].inputs.image_proj_model_name, 'sim_stage1/image_proj_model.bin');
  x = await plan({ rights: '1', refKind: 'subject', aspect: '1:1' }, r1); dump('aceplus', x.p); g = x.p.passes[0].graph; assert.equal(x.i.engine, 'aceplus'); assert.equal(g['14'].inputs.lora_name, 'comfyui_subject_lora16.safetensors'); assert.equal(g['85'].inputs.x, g['80'].inputs.width);
  x = await plan({ rights: '1', preset: 'y2k-street' }, { refs: ['soul-t-ref1.png', 'soul-t-ref2.png'] }); dump('qwenedit', x.p); g = x.p.passes[0].graph; assert.equal(x.i.engine, 'qwen-edit'); assert.ok(g['61'] && !g['62'] && !('image3' in g['20'].inputs)); assert.equal(g['11'].inputs.lora_name, 'CoolShot_2000s_qwen.safetensors');
  x = await plan({ rights: '1', preset: 'retro-bw' }, r1); assert.ok(x.p.notes.some((s) => /prompt only/.test(s)), 'ZIT look on a FLUX engine → prompt-only note');
});
await t('hosted routes: fal Z-Image-Turbo LoRA (ZIT LoRAs, ≤3) + Replicate; local free', async () => {
  const r = routesFor('comfy-soul').map((x) => x.routeId); assert.deepEqual(r, ['local:comfy-soul', 'fal:fal-ai/z-image/turbo/lora', 'replicate:prunaai/z-image-turbo', 'fal:fal-ai/qwen-image-edit-2511', 'fal:fal-ai/flux-pulid', 'replicate:qwen/qwen-image-edit-2511']);
  const i = await parse({ preset: 'polaroid' }); assert.equal(i.hostedLoras.length, 2); assert.ok(i.hostedLoras.every((l: any) => /^https:\/\//.test(l.path))); assert.ok(i.hostedPrompt.startsWith('Candid Instax Photo,'));
  const f = await parse({ preset: 'flash-editorial' }); assert.equal(f.hostedLoras.length, 1, 'FLUX look on hosted ZIT → realism only');
});
await t('licences: components recorded on the licence report only', () => {
  const rep: any = buildLicenseReport(); assert.ok(rep.components.soul.length >= 25); assert.ok(rep.components.soul.some((c: any) => /InfiniteYou/.test(c.model) && c.commercial === 'no'));
  assert.ok(!JSON.stringify(soulTool).match(/non-commercial|licen[cs]e/i), 'no licence text in the tool payload');
});
await t('cloud: route modes by refs, caps, upscale add-on + fal-key gate, prices with sources', async () => {
  const { option } = await import('../src/routing/select.js'); const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.js');
  const saved = { f: process.env.OPENHIGGSFIELD_FAL_KEY, r: process.env.OPENHIGGSFIELD_REPLICATE_API_TOKEN };
  process.env.OPENHIGGSFIELD_FAL_KEY = 'test'; process.env.OPENHIGGSFIELD_REPLICATE_API_TOKEN = 'test';
  const avail = (i: any) => Object.fromEntries(routesFor('comfy-soul').map((r) => [r.routeId, option(soulTool, r, i)]));
  const txt = avail(await parse({})); assert.ok(txt['fal:fal-ai/z-image/turbo/lora'].available && !txt['fal:fal-ai/qwen-image-edit-2511'].available && !txt['fal:fal-ai/flux-pulid'].available);
  const one = avail(await parse({ rights: '1' }, { refs: ['soul-t-ref1.png'] })); assert.ok(one['fal:fal-ai/flux-pulid'].available && one['fal:fal-ai/qwen-image-edit-2511'].available && one['replicate:qwen/qwen-image-edit-2511'].available && !one['fal:fal-ai/z-image/turbo/lora'].available);
  const two = avail(await parse({ rights: '1' }, { refs: ['soul-t-ref1.png', 'soul-t-ref2.png'] })); assert.ok(!two['fal:fal-ai/flux-pulid'].available && two['fal:fal-ai/qwen-image-edit-2511'].available);
  for (const o of Object.values(txt)) assert.ok((o as any).caps, `caps on ${(o as any).routeId}`);
  assert.equal((txt['local:comfy-soul'] as any).caps.upscale.creditsPerImage, 0); assert.equal((txt['fal:fal-ai/z-image/turbo/lora'] as any).caps.colour.how, 'server');
  assert.equal(txt['local:comfy-soul'].credits, 0);
  const base = avail(await parse({ n: '4' }))['fal:fal-ai/z-image/turbo/lora'].credits!; const up = avail(await parse({ n: '4', upscale: 'x2' }))['fal:fal-ai/z-image/turbo/lora'].credits!; assert.equal(up - base, 4, 'upscale = 1 credit per image');
  delete process.env.OPENHIGGSFIELD_FAL_KEY; delete process.env.FAL_KEY;
  const noFal = avail(await parse({ upscale: 'x2' }))['replicate:prunaai/z-image-turbo']; assert.ok(!noFal.available && /Cloud upscale runs on fal/.test(noFal.reason!), noFal.reason);
  assert.ok(avail(await parse({}))['replicate:prunaai/z-image-turbo'].available, 'no upscale → replicate fine without fal key');
  for (const id of ['fal:fal-ai/qwen-image-edit-2511', 'fal:fal-ai/flux-pulid', 'replicate:qwen/qwen-image-edit-2511', 'fal:fal-ai/esrgan']) { const h = HOSTED_BY_ID[id]; assert.ok(h && /^https:\/\/(fal\.ai|replicate\.com)\//.test(h.sourceUrl) && h.checkedAt === '2026-10-17', id); }
  if (saved.f) process.env.OPENHIGGSFIELD_FAL_KEY = saved.f; if (saved.r) process.env.OPENHIGGSFIELD_REPLICATE_API_TOKEN = saved.r; else delete process.env.OPENHIGGSFIELD_REPLICATE_API_TOKEN;
});
await t('cloud post-process: server colour match (image + HEX) changes pixels, free; mock upscale resizes', async () => {
  const { soulRoutedPost } = await import('../src/tools/soul/cloud.js'); const { runFfmpeg } = await import('../src/ffmpeg.js'); const { readFileSync } = await import('node:fs');
  const mk = async (name: string) => { await runFfmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=256x320', '-frames:v', '1', path.join(DATA_DIR, name)]); return `/files/${name}`; };
  const i = await parse({ colourHex: '#ff8800', colourStrength: '0.7', upscale: 'x2' }); const url = await mk('soul-t-out.png'); const before = readFileSync(path.join(DATA_DIR, 'soul-t-out.png'));
  const job: any = { id: 'soul-t', input: i, outputs: [{ label: 'Result', url }], warnings: [] }; await soulRoutedPost(job, { live: false });
  assert.deepEqual(job.warnings, []); assert.ok(!before.equals(readFileSync(path.join(DATA_DIR, 'soul-t-out.png'))), 'colour changed');
  const { probe } = await import('../src/media.js'); const pr = await probe(path.join(DATA_DIR, 'soul-t-out.png')); assert.equal(pr?.width, 512);
  const j2 = await parse({ colourStrength: '0.3' }, { colourRef: ['soul-t-col.png'] }); const u2 = await mk('soul-t-out2.png'); const job2: any = { id: 'soul-t2', input: j2, outputs: [{ label: 'R', url: u2 }] }; await soulRoutedPost(job2, { live: false }); assert.ok(!job2.warnings);
});
console.log(`soul: ${ok} groups passed${out ? `, ${dumped} graphs in ${out}` : ''}`);
