// The 3D page, 2026-10-23 (shared/threeD.ts, shared/threeDDefaults.ts, tools/threeD.ts, routes3d.ts, glbInfo.ts).
// Covers: the workflow registry (ids, roadmap rows never runnable, deep links, redirects, Send to 3D), the defaults table, model settings and the
// price keys (every rate = the provider's published price), the request bodies against the providers' schemas (Tripo graph vs the ComfyUI
// object_info snapshot; fal bodies vs the fal OpenAPI properties), GLB meta, and against its own mock server: quote = charge for every hosted
// route and setting, the '3d' result kind in jobs (GLB served as model/gltf-binary, meta, poster), a failed job, the turntable (free MP4, linked
// back) and that Image / Video quotes still work.
// Run: npx tsx test/three-d.test.ts   (own mock server :9241, temp data dir, fake keys only, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'threed-')); process.env.OPENHIGGSFIELD_DATA_DIR ||= path.join(D, 'pure');
const T = await import('../src/shared/threeD.ts');
const { THREE_D_DEFAULTS } = await import('../src/shared/threeDDefaults.ts');
const { getTool } = await import('../src/tools/registry.ts');
const TD = await import('../src/tools/threeD.ts');
const { glbInfo } = await import('../src/glbInfo.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9241); const B = `http://localhost:${PORT}`;
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. registry ----
const ids = T.THREE_D_WORKFLOWS.map((w) => w.id);
assert.equal(new Set(ids).size, ids.length, 'unique workflow ids'); assert.equal(T.THREE_D_DEFAULT_WORKFLOW, 'image-to-3d'); assert.equal(ids[0], 'image-to-3d', 'Image to 3D first');
for (const w of T.THREE_D_WORKFLOWS) {
  if (w.status === 'ready') { assert.ok(w.toolId && getTool(w.toolId), `${w.id}: its tool is registered`); assert.ok(w.mode && (getTool(w.toolId)!.presets ?? []).some((p) => p.id === w.mode), `${w.id}: mode ${w.mode} is a mode of ${w.toolId}`); }
  else { assert.equal(w.toolId, null, `${w.id}: roadmap rows have no tool`); }
  assert.ok(w.how.length >= 2 && w.tagline && w.needs, `${w.id}: how it works, tagline, needs`);
}
assert.deepEqual(T.THREE_D_WORKFLOWS.filter((w) => w.status === 'soon').map((w) => w.id).sort(), ['retexture', 'rig']);
assert.equal(T.currentThreeDWorkflow('?workflow=turntable').id, 'turntable'); assert.equal(T.currentThreeDWorkflow('?workflow=nope').id, 'image-to-3d'); assert.equal(T.currentThreeDWorkflow('').id, 'image-to-3d');
assert.equal(T.threeDRoute('image-to-3d'), '/3d?workflow=image-to-3d');
assert.equal(T.threeDRedirectTarget('/tools/three-d', '?fromJob=j1'), '/3d?fromJob=j1'); assert.equal(T.threeDRedirectTarget('/tools/turntable/', ''), '/3d?workflow=turntable');
assert.equal(T.threeDRedirectTarget('/tools/image-to-3d', '?fromJob=a&out=1', '#x'), '/3d?workflow=image-to-3d&fromJob=a&out=1#x'); assert.equal(T.threeDRedirectTarget('/3d', ''), null);
assert.equal(T.sendTo3dHref('ab c', 2), '/3d?workflow=image-to-3d&fromJob=ab%20c&out=2');
assert.equal(T.threeDWorkflowForToolMode('three-d', 'image-to-3d'), 'image-to-3d'); assert.equal(T.threeDWorkflowForToolMode('h3-video', 't2v'), null);
const tool = getTool('three-d')! as any; assert.equal(tool.route, '/3d'); assert.equal(tool.media, '3d'); assert.equal(getTool('image-to-3d')?.id, 'three-d', 'alias');
assert.equal((getTool('three-d-turntable') as any).listed, false, 'turntable tool is hidden from menus');
ok('registry: workflows, roadmap rows, deep links, redirects, Send to 3D');

// ---- 2. defaults ----
for (const [id, d] of Object.entries(THREE_D_DEFAULTS)) { const w = T.threeDWorkflowById(id)!; const t = getTool(w.toolId!)! as any;
  for (const p of [d!.local, d!.hosted, d!.hostedFallback].filter(Boolean) as string[]) { assert.ok(t.providers.includes(p), `${id}: ${p} offered`); assert.ok(t.app.providerModes[p]?.includes(w.mode), `${id}: ${p} does ${w.mode}`); } }
assert.deepEqual([THREE_D_DEFAULTS['image-to-3d']!.hosted, THREE_D_DEFAULTS['image-to-3d']!.hostedFallback, THREE_D_DEFAULTS['image-to-3d']!.local], ['cloud-tripo-31', 'fal-trellis2', 'comfy-pixal3d-trellis2']);
ok('defaults: Tripo (Comfy) hosted, TRELLIS.2 (fal) fallback, Pixal3D + TRELLIS.2 local');
{ const loc = T.threeDModel('comfy-pixal3d-trellis2')!; assert.equal(T.fmtGB(loc.download!.bytes), '15.2 GB', 'the local template needs 15.2 GB'); assert.match(loc.priceNote, /15\.2 GB/); assert.equal(loc.download!.files.length, 7);
  for (const m of T.THREE_D_MODELS) assert.ok(m.typicalSec > 0 && m.licence.url, `${m.id}: time and licence`); }
ok('local model: listed with its 15.2 GB download (7 files) and licence; never downloaded');

// ---- 3. settings and prices ----
assert.deepEqual(T.normalizeSettings('fal-hunyuan3d-31', { detail: 'high', texture: 'hd', faces: '10k' }), { detail: 'standard', texture: 'standard', faces: '50k' }, 'Hunyuan: no detail, HD → standard, 10k → 50k (min 40k)');
assert.deepEqual(T.normalizeSettings('fal-trellis2', { texture: 'pbr', detail: 'nope' }), { detail: 'standard', texture: 'standard', faces: 'auto' }, 'TRELLIS.2: pbr → standard, unknown → default');
assert.deepEqual(T.normalizeSettings('cloud-tripo-31', { detail: 'low', texture: 'off' }), { detail: 'standard', texture: 'off', faces: 'auto' });
assert.equal(T.threeDPriceKey({ detail: 'high', texture: 'hd', faces: '50k' }), 'high.hd.50k'); assert.equal(T.threeDPriceKey({}), 'standard.standard.auto'); assert.equal(T.ALL_PRICE_KEYS.length, 48);
const usd = (m: string, k: string) => T.usdByKey(m)[k];
// published: Tripo v3.x Image to Model credits / 211 (docs.comfy.org partner-node pricing)
for (const [k, credits] of [['standard.off.auto', 42.2], ['high.off.auto', 84.4], ['standard.standard.auto', 63.3], ['standard.pbr.200k', 63.3], ['high.standard.auto', 105.5], ['standard.hd.auto', 84.4], ['high.hd.10k', 126.6]] as const)
  assert.equal(usd('cloud-tripo-31', k), Math.round((credits / 211) * 1e5) / 1e5, `Tripo ${k}`);
for (const [k, v] of [['low.standard.auto', 0.25], ['standard.hd.200k', 0.3], ['high.standard.auto', 0.35]] as const) assert.equal(usd('fal-trellis2', k), v, `TRELLIS.2 ${k}`);
for (const [k, v] of [['standard.standard.auto', 0.375], ['standard.pbr.auto', 0.525], ['standard.standard.50k', 0.525], ['high.pbr.200k', 0.675], ['standard.off.auto', 0.375]] as const) assert.equal(usd('fal-hunyuan3d-31', k), v, `Hunyuan ${k}`);
for (const ref of ['cloud-tripo-31', 'fal:fal-ai/trellis-2', 'fal:fal-ai/hunyuan-3d/v3.1/pro/image-to-3d']) { const h = HOSTED_BY_ID[ref]; assert.ok(h && h.unit === 'run' && !h.estimated && h.sourceUrl && h.usdByQuality, `${ref}: a published per-run price row`); }
ok('prices: every key matches the published rate (Tripo credits/211, TRELLIS.2 by resolution, Hunyuan add-ons)');

// ---- 4. request bodies vs schemas ----
const stub = JSON.parse(fs.readFileSync(path.resolve(ROOT, '../readiness/stub/object_info.json'), 'utf8'));
const g = TD.tripoGraph({ detail: 'high', texture: 'hd', faces: '50k', seed: 7 }, { __type: 'core/ASSET', info: { id: 'x' } }) as Record<string, any>;
for (const n of Object.values(g)) { const spec = stub[n.class_type]; assert.ok(spec, `${n.class_type} is a ComfyUI node`); const known = new Set([...Object.keys(spec.input.required ?? {}), ...Object.keys(spec.input.optional ?? {})]);
  for (const k of Object.keys(n.inputs)) assert.ok(known.has(k), `${n.class_type}.${k} is a real input`);
  for (const [k, v] of Object.entries<any>(spec.input.optional ?? {})) if (Array.isArray(v[1]?.options) && n.inputs[k] != null && !Array.isArray(n.inputs[k])) assert.ok(v[1].options.includes(n.inputs[k]), `${n.class_type}.${k}=${n.inputs[k]} is an allowed option`); }
assert.deepEqual([g['2'].inputs.texture_quality, g['2'].inputs.geometry_quality, g['2'].inputs.face_limit, g['2'].inputs.pbr, g['2'].inputs.model_seed, g['2'].inputs.quad], ['detailed', 'detailed', 50000, false, 7, false]);
assert.deepEqual(g['3'].inputs.mesh, ['2', 1], 'SaveGLB takes the GLB output');
assert.equal((TD.tripoGraph({ texture: 'off' }, null) as any)['2'].inputs.texture, false);
const img = path.join(D, 'in.png'); fs.copyFileSync(path.resolve(ROOT, 'samples/sample-product.png'), img);
const tb = await TD.THREE_D_BODIES.trellis2({ imagePath: img, detail: 'low', texture: 'hd', faces: '10k', seed: 3 });
const TRELLIS_PROPS = ['image_url', 'resolution', 'texture_size', 'decimation_target', 'seed', 'remesh', 'remesh_band', 'remesh_project', 'ss_guidance_strength', 'ss_sampling_steps', 'shape_slat_guidance_strength', 'tex_slat_guidance_strength']; // fal OpenAPI Trellis2Input (subset we may send), 2026-10-23
for (const k of Object.keys(tb)) assert.ok(TRELLIS_PROPS.includes(k), `trellis-2 takes ${k}`);
assert.deepEqual([tb.resolution, tb.texture_size, tb.decimation_target, tb.seed], [512, 4096, 5000, 3]); assert.match(String(tb.image_url), /^data:image\/png;base64,/);
const hb = await TD.THREE_D_BODIES.hunyuan31({ imagePath: img, texture: 'pbr', faces: '200k' }); const HUN_PROPS = ['input_image_url', 'generate_type', 'enable_pbr', 'face_count', 'left_image_url', 'right_image_url', 'back_image_url'];
for (const k of Object.keys(hb)) assert.ok(HUN_PROPS.includes(k), `hunyuan 3.1 takes ${k}`); assert.deepEqual([hb.generate_type, hb.enable_pbr, hb.face_count], ['Normal', true, 200000]);
assert.equal('face_count' in (await TD.THREE_D_BODIES.hunyuan31({ imagePath: img, faces: 'auto' })), false, 'Auto faces sends no face_count (no +$0.15)');
ok('bodies: Tripo graph inputs are real node inputs/options; fal bodies use schema fields only');

// ---- 5. GLB meta ----
const gi = await glbInfo(path.resolve(ROOT, 'samples/result-3d.glb')); assert.equal(gi.valid, true); assert.equal(gi.faces, 7168); assert.equal(gi.textured, false);
const bad = path.join(D, 'bad.glb'); fs.writeFileSync(bad, 'not a glb'); assert.equal((await glbInfo(bad)).valid, false); assert.equal((await glbInfo(path.join(D, 'none.glb'))).valid, false);
ok('glb meta: faces, textures; bad and missing files are invalid, never a throw');

// ---- 6. server ----
const data = path.join(D, 'srv'); fs.mkdirSync(data, { recursive: true });
const env = { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: data, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '400',
  OPENHIGGSFIELD_FAL_KEY: 'test-not-a-key', FAL_KEY: '', COMFY_API_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_USE_LOCAL: '0' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'], detached: true }); let errs = ''; srv.stderr!.on('data', (c) => { errs += c; });
const stop = () => { try { process.kill(-srv.pid!); } catch { /* gone */ } };
try {
  for (let i = 0; i < 480; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); } // up to 2 min: a busy 2-core CI runner boots slowly
  const j = async (u: string, init?: RequestInit) => { const r = await fetch(B + u, init); return { status: r.status, body: await r.json().catch(() => ({})) as any }; };
  const wf = (await j('/api/3d-workflows')).body; assert.equal(wf.default, 'image-to-3d'); assert.equal(wf.workflows.find((w: any) => w.id === 'image-to-3d').defaults.hosted, 'cloud-tripo-31');
  assert.equal(wf.workflows.find((w: any) => w.id === 'rig').runnable, false); assert.equal(wf.showcase.items.length, 10); assert.match(wf.showcase.dataset.licence, /CC BY 4\.0/);
  for(const mode of ['text-to-3d','multiview-to-3d']) assert.deepEqual(wf.workflows.find((w:any)=>w.id===mode).modelIds,['cloud-tripo-31']);
  ok('GET /api/3d-workflows: defaults, roadmap rows not runnable, showcase with its licence');
  const submit = async (fields: Record<string, string>, file = img) => { const fd = new FormData(); fd.append('image', new Blob([fs.readFileSync(file)], { type: 'image/png' }), 'in.png'); for (const [k, v] of Object.entries(fields)) fd.append(k, v); return j('/api/tools/three-d/jobs', { method: 'POST', body: fd }); };
  const done = async (id: string) => { for (let i = 0; i < 300; i++) { const b = (await j(`/api/jobs/${id}`)).body; if (!['queued', 'running'].includes(b.status)) return b; await new Promise((r) => setTimeout(r, 200)); } throw new Error(`job ${id} did not finish`); };
  const cases: [string, Record<string, string>, number][] = [['cloud-tripo-31', { detail: 'standard', texture: 'pbr', faces: 'auto' }, 30], ['cloud-tripo-31', { detail: 'high', texture: 'hd', faces: '50k' }, 60], ['cloud-tripo-31', { texture: 'off' }, 20],
    ['fal-trellis2', { detail: 'low' }, 25], ['fal-trellis2', { detail: 'high', texture: 'hd' }, 35], ['fal-hunyuan3d-31', { texture: 'pbr', faces: '200k' }, 68], ['fal-hunyuan3d-31', {}, 38]];
  let firstGlb = ''; let firstId = '';
  for (const [p, s, want] of cases) {
    const q = (await j(`/api/tools/three-d/price?${new URLSearchParams({ provider: p, types: 'image-to-3d', ...s })}`)).body;
    assert.equal(q.credits, want, `${p} ${JSON.stringify(s)}: quote ${q.credits} = ${want}`); assert.equal(q.runnable, true);
    const r = await submit({ provider: p, types: '["image-to-3d"]', ...s }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300)); assert.equal(r.body.cost, want, `${p}: charge = quote`);
    const b = await done(r.body.id); assert.equal(b.status, 'done', b.error); assert.match(b.resultUrl, /\.glb$/); assert.equal(b.outputs[0].kind, '3d'); assert.equal(b.cost, want);
    if (!firstGlb) { firstGlb = b.resultUrl; firstId = b.id; }
  }
  const submitMode=async(mode:string,fields:Record<string,string>={},slots:string[]=[])=>{const fd=new FormData();fd.append('types',JSON.stringify([mode]));fd.append('provider','cloud-tripo-31');for(const [k,v] of Object.entries(fields))fd.append(k,v);for(const slot of slots)fd.append(slot,new Blob([fs.readFileSync(slot==='image'?img:side)],{type:'image/png'}),`${slot}.png`);return j('/api/tools/three-d/jobs',{method:'POST',body:fd});};
  const side=path.join(D,'side.png');execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=blue:s=480x640','-frames:v','1',side]);
  for(const mode of ['text-to-3d','multiview-to-3d']) for(const [settings,want] of [[{texture:'off'},mode==='text-to-3d'?10:20],[{texture:'pbr',detail:'standard'},mode==='text-to-3d'?20:30],[{texture:'hd',detail:'high'},mode==='text-to-3d'?50:60]] as [Record<string,string>,number][]) {
    const q=(await j(`/api/tools/three-d/price?${new URLSearchParams({provider:'cloud-tripo-31',types:mode,...settings})}`)).body;
    assert.equal(q.credits,want,`${mode}: full quote`);
    const r=await submitMode(mode,{prompt:'A ceramic fox',...settings},mode==='multiview-to-3d'?['image','image_left']:[]);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.cost,q.credits);
    const result=await done(r.body.id);assert.equal(result.status,'done',result.error);assert.match(result.resultUrl,/\.glb$/);assert.equal(result.outputs[0].kind,'3d');assert.equal(result.cost,want);
  }
  for(const mode of ['text-to-3d','multiview-to-3d']) {
    const q=await j(`/api/tools/three-d/price?provider=fal-trellis2&types=${mode}`);
    assert.ok(q.status>=400||q.body.runnable===false||q.body.valid===false,'unsupported model cannot offer a runnable quote');
    const fd=new FormData();fd.append('provider','fal-trellis2');fd.append('types',JSON.stringify([mode]));fd.append('prompt','A ceramic fox');
    assert.ok((await j('/api/tools/three-d/jobs',{method:'POST',body:fd})).status>=400);
  }
  for(const types of ['null','42','\"text-to-3d\"','[null]']) assert.equal((await submit({types})).status,400,`malformed mode ${types} returns plain validation`);
  assert.equal((await submitMode('text-to-3d',{prompt:'  '})).status,400);
  assert.equal((await submitMode('multiview-to-3d',{},['image'])).status,400);
  assert.equal((await submitMode('multiview-to-3d',{},['image_left','image_back'])).status,400);
  assert.equal((await submitMode('multiview-to-3d',{},['image','image','image_left'])).status,400);
  const four=await submitMode('multiview-to-3d',{},['image','image_left','image_back','image_right']);assert.equal(four.status,200,JSON.stringify(four.body));assert.equal((await done(four.body.id)).status,'done');
  const failed=await submitMode('text-to-3d',{prompt:'A ceramic fox',simulate:'temporary'});const failure=await done(failed.body.id);assert.equal(failure.status,'failed');assert.ok(failure.error);
  const retry=await j(`/api/jobs/${failed.body.id}/retry`,{method:'POST'});assert.equal(retry.status,200,JSON.stringify(retry.body));assert.equal((await done(retry.body.id)).status,'done');
  const cancel=await submitMode('multiview-to-3d',{},['image','image_back']);assert.equal(cancel.status,200);await j(`/api/jobs/${cancel.body.id}/cancel`,{method:'POST'});assert.equal((await done(cancel.body.id)).status,'canceled');
  ok('text/multiview quotes equal charges; GLB results; mixed image sizes; empty prompt, missing/duplicate views; failure, retry and cancel');
  ok('quote = charge: Tripo (Comfy) and TRELLIS.2 / Hunyuan 3D (fal) for every priced setting; results are GLBs of kind 3d');
  const head = await fetch(B + firstGlb); assert.equal(head.headers.get('content-type'), 'model/gltf-binary'); await head.arrayBuffer();
  const meta = (await j(`/api/3d/meta?url=${encodeURIComponent(firstGlb)}`)).body; assert.equal(meta.faces, 7168); assert.equal(meta.big, false);
  assert.equal((await j('/api/3d/meta?url=/etc/passwd')).status, 400); assert.equal((await j('/api/3d/meta?url=/files/none.glb')).status, 404);
  const pfd = new FormData(); pfd.append('image', new Blob([fs.readFileSync(img)], { type: 'image/png' }), 'p.png'); const pr = await j(`/api/jobs/${firstId}/3d-poster`, { method: 'POST', body: pfd }); assert.equal(pr.status, 200);
  const after = (await j(`/api/jobs/${firstId}`)).body; assert.equal(after.threeD.posterUrl, pr.body.posterUrl); assert.equal(after.outputs[0].posterUrl, pr.body.posterUrl);
  assert.equal((await j('/api/jobs/nope/3d-poster', { method: 'POST', body: pfd })).status, 404);
  ok('3d kind: GLB served as model/gltf-binary, meta, poster saved on the job; bad urls refused');
  // validation: no image, a bad setting, a roadmap mode, a non-3D model → 400, nothing charged
  { const fd = new FormData(); fd.append('types', '["image-to-3d"]'); const r = await j('/api/tools/three-d/jobs', { method: 'POST', body: fd }); assert.equal(r.status, 400); }
  assert.equal((await submit({ provider: 'fal-trellis2', detail: 'ultra' })).status, 400); assert.equal((await submit({ types: '["text-to-3d"]' })).status, 400);
  assert.ok([400, 409].includes((await submit({ provider: 'api-gpt-image' })).status), 'a non-3D model is refused');
  assert.equal((await submit({ provider: 'comfy-pixal3d-trellis2' })).status >= 400, true, 'the local template never runs before its download');
  ok('validation: missing image, bad setting, roadmap workflow, wrong model and the not-downloaded local model are refused');
  // a failed job: refunded
  const fr = await submit({ provider: 'fal-trellis2', simulate: 'temporary' }); const fb = await done(fr.body.id); assert.equal(fb.status, 'failed'); assert.ok(fb.refund?.refunded || fb.creditsBack, 'credits back');
  ok('a failed 3D job ends failed with its credits back');
  // turntable: free MP4 linked back to the 3D job
  const vid = path.join(D, 'tt.webm'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=d=2:s=320x240:r=24', '-c:v', 'libvpx-vp9', '-b:v', '200k', vid]);
  const tq = (await j('/api/tools/three-d-turntable/price?types=turntable')).body; assert.equal(tq.credits, 0);
  const tfd = new FormData(); tfd.append('video', new Blob([fs.readFileSync(vid)], { type: 'video/webm' }), 'turntable.webm'); tfd.append('sourceJob', firstId); tfd.append('types', '["turntable"]');
  const tr = await j('/api/tools/three-d-turntable/jobs', { method: 'POST', body: tfd }); assert.equal(tr.status, 200, JSON.stringify(tr.body).slice(0, 300)); assert.equal(tr.body.cost, 0);
  const tb2 = await done(tr.body.id); assert.equal(tb2.status, 'done', tb2.error); assert.match(tb2.resultUrl, /\.mp4$/); assert.equal(tb2.outputs[0].kind, 'video');
  assert.equal((await j(`/api/jobs/${firstId}`)).body.threeD.turntableUrl, tb2.resultUrl, 'linked back');
  ok('turntable: a free MP4 video result, linked back to its 3D job');
  // the rest still quotes
  assert.equal(typeof (await j('/api/tools/create-image/price?types=generate')).body.credits, 'number'); assert.equal(typeof (await j('/api/tools/h3-video/price?types=t2v&duration=6')).body.credits, 'number');
  const tools = (await j('/api/tools')).body; const list = Array.isArray(tools) ? tools : tools.tools; assert.equal(list.find((t: any) => t.id === 'three-d').media, '3d');
  ok('Image and Video quotes unchanged; /api/tools lists 3D with media 3d');
} catch (e) { console.error(errs.slice(-2000)); throw e; } finally { stop(); }
console.log('all 3D tests passed');
