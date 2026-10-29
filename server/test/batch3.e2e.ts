// E2E (own mock server, :8851): backend gap leftovers, non-H3 videoCaps, fal FLUX 3 Klein. Run: npx tsx test/batch3.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { falImageInput, kleinImageSize } from '../src/providers/fal.js';
const PORT = testPort(8851), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-')); const ROOT = path.resolve(import.meta.dirname, '..');
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await fetch(B + u)).json();
const js = (method: string, body: unknown) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  await fetch(`${B}/api/me/routing`, js('PUT', { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }));
  // 16 presets paging + media filter
  { const all = await get('/api/presets'); const p1 = await get('/api/presets?limit=10'); assert.equal(p1.items.length, 10); assert.equal(p1.total, all.total); assert.equal(p1.nextCursor, '10');
    const p2 = await get(`/api/presets?limit=10&cursor=${p1.nextCursor}`); assert.notEqual(p2.items[0].id + p2.items[0].toolId, p1.items[0].id + p1.items[0].toolId);
    const last = await get(`/api/presets?limit=200&cursor=0`); assert.equal(last.nextCursor, all.total > 200 ? '200' : null);
    const v = await get('/api/presets?media=video&tool=restyle'); assert.ok(v.items.length > 0 && v.items.every((x: any) => x.toolId === 'restyle'));
    assert.equal((await fetch(`${B}/api/presets?media=bogus`)).status, 400); console.log(`ok presets paging (total ${all.total}), media, tool alias`); }
  // 07/08/09 previewWebm
  { const t = (await get('/api/tools')).find((x: any) => x.id === 'restyle'); const w = t.presets[0].previewWebm; assert.ok(w?.endsWith('.webm'));
    for (const id of ['object-swap', 'motion-transfer', 'restyle']) for (const p of (await get('/api/tools')).find((x: any) => x.id === id).presets) assert.ok(fs.existsSync(path.join(ROOT, 'samples', p.previewWebm.split('/samples/')[1])), p.previewWebm);
    assert.equal((await fetch(B + w)).status, 200); console.log('ok preset previewWebm files exist for swap/motion/restyle'); }
  // 18 project subfolders
  { const a = await (await fetch(`${B}/api/projects`, js('POST', { name: 'A' }))).json(); const b = await (await fetch(`${B}/api/projects`, js('POST', { name: 'B', parentId: a.id }))).json();
    assert.equal(b.parentId, a.id); assert.equal((await fetch(`${B}/api/projects/${a.id}`, js('PATCH', { parentId: b.id }))).status, 400, 'cycle refused');
    const r = await (await fetch(`${B}/api/projects/${b.id}`, js('PATCH', { name: 'B2', parentId: null }))).json(); assert.equal(r.name, 'B2'); assert.equal(r.parentId, null);
    await fetch(`${B}/api/projects/${b.id}`, js('PATCH', { parentId: a.id })); await fetch(`${B}/api/projects/${a.id}`, { method: 'DELETE' });
    assert.equal((await get('/api/projects')).find((x: any) => x.id === b.id).parentId, null, 'children move up on delete'); console.log('ok projects parentId (subfolders, cycle 400, delete lifts children)'); }
  // 20 grant is dev-only (mock backend → allowed)
  { assert.equal((await fetch(`${B}/api/ledger/grant`, js('POST', { amount: 5 }))).status, 200); console.log('ok ledger/grant allowed on mock (403 dev_only otherwise)'); }
  // non-H3 videoCaps
  { const r = await get('/api/routes'); const caps: Record<string, any> = {}; for (const g of r.routes) for (const x of g.routes) if (x.caps?.videoCaps) caps[x.routeId] = x.caps.videoCaps;
    for (const id of ['comfy-router:router-kling', 'comfy-router:router-veo', 'comfy-router:router-seedance', 'fal:fal-ai/seedvr/upscale/video', 'fal:fal-ai/rife/video', 'fal:bria/video/background-removal', 'fal:fal-ai/luma-dream-machine/ray-2/reframe', 'fal:fal-ai/luma-dream-machine/ray-2-flash/reframe', 'direct:direct-flux3-upscale', 'local:comfy-funcamera']) {
      const c = caps[id]; assert.ok(c, `videoCaps for ${id}`); for (const k of ['durations', 'aspects', 'resolutions', 'audio', 'refKinds', 'refMax', 'sourceUrl', 'verified']) assert.ok(k in c, `${id}.${k}`); if (c.verified) assert.match(c.sourceUrl, /^https:\/\//); }
    assert.deepEqual(caps['comfy-router:router-veo'].durations, [4, 6, 8]); assert.equal(caps['fal:bria/video/background-removal'].maxSeconds, 30); assert.equal(caps['local:comfy-funcamera'].verified, false);
    assert.ok(!Object.keys(caps).some((k) => /h3/.test(k)), 'H3 routes untouched'); console.log(`ok videoCaps on ${Object.keys(caps).length} non-H3 video routes`); }
  // fal FLUX 3 Klein: request bodies + routes + price
  { assert.deepEqual(kleinImageSize('2K', '1:1'), { width: 2048, height: 2048 }); const k4 = kleinImageSize('4K', '16:9')!; assert.ok(k4.width === 4096 && k4.height <= 4096 && k4.height >= 256);
    const t = falImageInput('blackforestlabs/flux-3/klein/text-to-image', { prompt: 'p', seed: 3, imageRes: '2K', aspectRatio: '1:1' }); assert.deepEqual(t, { prompt: 'p', seed: 3, image_size: { width: 2048, height: 2048 }, num_images: 1, output_format: 'png' });
    const e = falImageInput('blackforestlabs/flux-3/klein/edit-image', { prompt: 'p', imageUrls: Array.from({ length: 12 }, (_, i) => `data:${i}`) }) as any; assert.equal(e.image_urls.length, 10); assert.ok(!('image_size' in e));
    const rs = (await get('/api/routes?modelId=comfy-flux3-klein')).routes.flatMap((g: any) => g.routes); const ed = rs.find((x: any) => x.routeId === 'fal:blackforestlabs/flux-3/klein/edit-image');
    assert.ok(ed && ed.caps.maxRefs === 10); assert.ok(rs.find((x: any) => x.routeId === 'fal:blackforestlabs/flux-3/klein/text-to-image').caps.maxRefs === 0);
    await fetch(`${B}/api/me/routing`, js('PUT', { global: { mode: 'auto', allowFallback: true, useLocal: false, mockKeys: true } }));
    for (const [r, c] of [['1K', 1], ['2K', 2], ['4K', 4]] as const) assert.equal((await get(`/api/models/quote?model=comfy-flux3-klein&imageResolution=${r}&n=1`)).credits, c, `klein ${r}`); // $0.009 / $0.014 / $0.036 → whole credits, rounded up per request
    console.log('ok fal FLUX 3 Klein t2i + edit bodies, routes, caps'); }
  console.log('ALL OK batch3');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
