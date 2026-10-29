// (7) MOSS-Image (OpenMOSS, Apache-2.0): SFT default + Base variant as local open-weights Create Image models, 0 credits, minComfyVersion 0.41.3.
// Checks the plan graph (CLIPLoader type moss_image, prompt/seed/size wiring), /api/models + /api/tools fields, price 0 and a mock run.
// Run: npx tsx test/moss.e2e.ts (port 8971; temp data dir).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'moss-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const IDS = ['comfy-moss-image', 'comfy-moss-image-base'] as const;
const FILES = { 'comfy-moss-image': 'create-image-moss-image-api.json', 'comfy-moss-image-base': 'create-image-moss-image-base-api.json' } as const;
{ // plan graphs (in-process)
  await import('../src/tools/index.js').catch(() => import('../src/tools/media.js'));
  const { buildPlan } = await import('../src/comfy/plans.js');
  for (const id of IDS) {
    const job: any = { id: 'moss1234', toolId: 'create-image', provider: id, input: { prompt: 'A poster that says "HELLO"', seed: 42, imageResolution: '1K', aspect: '16:9', types: ['generate'] } };
    const plan = buildPlan(job); const pass = plan.passes[0]; const g = pass.graph as any; const byCt = (ct: string) => Object.values<any>(g).filter((n) => n.class_type === ct);
    assert.equal(pass.workflow, FILES[id]); assert.equal(byCt('CLIPLoader')[0].inputs.type, 'moss_image'); assert.equal(byCt('CLIPLoader')[0].inputs.clip_name, 'qwen3.5_9b_w4a8_gptq.safetensors');
    assert.equal(byCt('VAELoader')[0].inputs.vae_name, 'flux2-vae_small.safetensors');
    assert.equal(byCt('UNETLoader')[0].inputs.unet_name, id === 'comfy-moss-image' ? 'moss_image_sft_int8_convrot.safetensors' : 'moss_image_base_int8_convrot.safetensors');
    assert.equal(g['4'].inputs.text, 'A poster that says "HELLO"'); assert.equal(g['7'].inputs.seed, 42);
    const lat = byCt('EmptyFlux2LatentImage')[0].inputs; assert.ok(lat.width % 16 === 0 && lat.height % 16 === 0 && lat.width > lat.height, JSON.stringify(lat));
    assert.equal(byCt('SkipLayerGuidanceDiTSimple').length, id === 'comfy-moss-image-base' ? 1 : 0, 'SLG (layer 22) only on Base, as in the Comfy templates');
    ok(`${id}: plan ${pass.workflow} (moss_image encoder, prompt/seed/${lat.width}x${lat.height})`);
  }
}
const PORT = testPort(8971); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const models = (await get('/api/models?toolId=create-image')).body; const list: any[] = models.groups.find((g: any) => g.toolId === 'create-image').models;
  for (const id of IDS) {
    const m = list.find((x) => x.id === id); assert.ok(m, `${id} in /api/models: ${JSON.stringify(list.map((x) => x.id))}`);
    assert.equal(m.openWeights, true); assert.equal(m.kind, 'open-weights'); assert.equal(m.minComfyVersion, '0.41.3'); assert.match(m.description, /text and posters/); assert.match(m.license.name ?? m.license.id, /Apache/i); assert.equal(m.licenseName, 'Apache-2.0'); assert.equal(m.requirementNote, 'Needs ComfyUI 0.41.3 or newer.'); assert.ok(!/ComfyUI 0\.41/.test(m.description), 'version note only in requirementNote (not duplicated)'); /* P2 3b */
    assert.deepEqual(m.workflows, [FILES[id]]); assert.equal(m.localOnly, true);
  }
  ok(`/api/models: ${IDS.join(', ')} open weights, Apache-2.0, minComfyVersion 0.41.3, 'text and posters'`);
  for (const id of IDS) { const pg = await (await fetch(`${B}/api/models/${id}`)).json() as any; assert.equal(pg.licenseName, 'Apache-2.0', id); assert.equal(pg.requirementNote, 'Needs ComfyUI 0.41.3 or newer.', id); }
  ok('/api/models/:id (model page): licenseName Apache-2.0 + requirementNote');
  const tools = (await get('/api/tools')).body; const ci = (Array.isArray(tools) ? tools : tools.items).find((t: any) => t.id === 'create-image');
  for (const id of IDS) assert.equal(ci.providers.find((x: any) => x.id === id)?.minComfyVersion, '0.41.3');
  ok('/api/tools create-image providers carry minComfyVersion');
  for (const id of IDS) {
    const q = (await get(`/api/tools/create-image/price?provider=${id}`)).body; assert.equal(q.credits, 0, JSON.stringify(q).slice(0, 400));
    const fd = new FormData(); for (const [k, v] of Object.entries({ types: '["generate"]', prompt: 'a poster that says OPEN', provider: id, route: 'auto', rights: '1' })) fd.append(k, v);
    const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); const j = (await r.json()) as any; assert.equal(r.status, 200, JSON.stringify(j).slice(0, 500)); assert.equal(j.cost, 0);
    let s: any; for (let i = 0; i < 60; i++) { s = (await get(`/api/jobs/${j.id}`)).body; if (['done', 'failed'].includes(s.status)) break; await new Promise((res) => setTimeout(res, 500)); }
    assert.equal(s.status, 'done', JSON.stringify(s).slice(0, 400)); assert.equal(s.provider, id);
    ok(`${id}: quote 0, job ${j.id} done at cost 0`);
  }
  console.log('ALL OK moss');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
