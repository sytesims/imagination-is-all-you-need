// Images, radical transparency (2026-10-22): plain feature names, real model names, workflow sources and
// capability-driven options. Covers: shared/imageFeatures (names, menu order, old URL redirects, models per feature, supports, workflow credit),
// shared/workflowSources.ts in sync with workflows/provenance/image-grid.json, the raised hosted reference caps, models hidden where their route
// can't do the feature (no mask on Nano Banana 2 / Ideogram V4; no image on Ideogram / Grok), Camera & Lens recipe, and the API:
// /api/image-features, /api/workflows/:file, tool names and URLs, job.feature ("Relight · Nano Banana 2"), Person Swap.
// Run: PATH=/opt/homebrew/bin:$PATH npx tsx test/image-features.e2e.ts   (own mock server :9177, temp data dir, no keys, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { IMAGE_FEATURES, MENU_FEATURES, IMAGE_REDIRECTS, featureForPath, supportsFor, workflowFor, workflowLine, featureOfJob, modelNameOf, GENERATE_MODELS, EDIT_MODELS, MASK_MODELS, TWO_IMAGE_MODELS } from '../src/shared/imageFeatures.js';
import { checkImageCaps, IMAGE_CAPS } from '../src/shared/imageCaps.js';
import { parseRig, rigSentence, CAMERA_BODIES, LENSES, FILM_STOCKS, LIGHTING, ERAS } from '../src/shared/cameraLens.js';
const ROOT = path.resolve(import.meta.dirname, '..'); const REPO = path.resolve(ROOT, '..');
const ok = (m: string) => console.log('ok ' + m);

// ---------------- names, menu, redirects ----------------
assert.deepEqual(MENU_FEATURES.map((f) => f.name), ['Create Image', 'Upscale', 'Relight', 'Face Swap', 'Person Swap', 'Camera Angles', 'Camera & Lens', 'Brush Edit', 'Remove Background', 'Expand', 'Erase Object', 'Virtual Try-On', 'Material Swap', 'Ad Pack', 'Image to layers', 'Character Sheet', 'Product Shot']); // photo tools (2026-10-23) after Brush Edit; Image to layers after them
assert.ok(!MENU_FEATURES.some((f) => f.id === 'edit-image'), 'Edit Image is not a menu item (it lives inside Create Image, like the reference)');
assert.equal(IMAGE_FEATURES.find((f) => f.id === 'edit-image')?.name, 'Edit Image');
assert.ok(!JSON.stringify(IMAGE_FEATURES.map((f) => [f.name, f.tagline, f.description])).includes('OpenSoul'), 'no house name in feature copy');
assert.equal(IMAGE_REDIRECTS['/soul'], '/image'); assert.equal(IMAGE_REDIRECTS['/tools/soul'], '/image');
assert.equal(IMAGE_REDIRECTS['/tools/app-shots'], '/image?workflow=camera-angles'); assert.equal(IMAGE_REDIRECTS['/tools/app-inpaint'], '/image?workflow=brush-edit'); // workflows live in the Create bar (2026-10-23)
assert.equal(IMAGE_REDIRECTS['/tools/edit-image'], '/image?mode=edit', 'an old edit URL opens Create Image in edit mode');
assert.equal(featureForPath('/image')?.toolId, 'create-image'); assert.equal(featureForPath('/tools/brush-edit'), undefined); // workflow pages are now Create-bar redirects
ok('plain names in menu order, Edit Image inside Create Image, old URLs redirect (/soul, /tools/app-shots, /tools/app-inpaint, /tools/edit-image)');

// ---------------- models per feature (only models that really work) ----------------
assert.ok(GENERATE_MODELS.includes('direct-flux2-flex'), 'FLUX.2 [flex] runs on the BFL API (2026-10-23)'); for (const hidden of ['api-hunyuan-image', 'api-meta-muse']) assert.ok(!GENERATE_MODELS.includes(hidden), `${hidden} is not runnable here`);
assert.deepEqual(MASK_MODELS, ['api-gpt-image', 'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-gpt-image-15', 'api-bria-fibo2', 'comfy-flux3-klein', 'comfy-qwen-image', 'api-ideogram-45', 'fal-bria-genfill'], 'Brush Edit: only routes with a mask (Ideogram 4.5 and Bria GenFill on fal; GPT Image 1.5 added 2026-10-25; Bria FIBO 2.0 added 2026-10-26, 5ceab785: its bria/fibo edit takes an optional mask)');
assert.ok(EDIT_MODELS.includes('api-grok-image'), 'Grok Imagine 2.0 edits on its fal route (xai/grok-imagine-image/v2.0/edit)');
assert.ok(EDIT_MODELS.includes('api-runway-image'), 'Runway Gen-4 Image: its photos guide the picture (referenceImages, up to 3; 2026-10-24)');
for (const m of ['api-ideogram', 'api-krea', 'api-recraft', 'api-recraft-41', 'api-recraft-41-pro']) assert.ok(!EDIT_MODELS.includes(m), `${m}: its route sends no image`);
assert.ok(EDIT_MODELS.includes('api-qwen-image') && EDIT_MODELS.includes('api-ideogram-45'), 'Qwen Image 3.0 and Ideogram 4.5 edits: their Router bodies send the images (2026-10-22)');
assert.ok(TWO_IMAGE_MODELS.includes('comfy-qwen21') && !TWO_IMAGE_MODELS.includes('comfy-klein4b'), 'two-image swaps need a route that takes 2 images (Qwen 2.1: the official edit template\'s two inputs)');
for (const f of IMAGE_FEATURES) for (const p of f.providers) { assert.ok(modelNameOf(p, f.mode), `${f.id}/${p} has a real model name`); assert.ok(supportsFor(f.id, p), `${f.id}/${p} supports`); }
assert.equal(modelNameOf('comfy-qwen-image', 'edit'), 'Qwen-Image-Edit-2509'); assert.equal(modelNameOf('comfy-qwen-image', 'generate'), 'Qwen-Image'); assert.equal(modelNameOf('api-gpt-image'), 'GPT Image 2');
ok(`models per feature: ${IMAGE_FEATURES.map((f) => `${f.name} ${f.providers.length}`).join(', ')}`);

// ---------------- supports / caps ----------------
assert.equal(IMAGE_CAPS['api-gpt-image'].supports.maxRefs, 16); assert.equal(IMAGE_CAPS['api-seedream'].supports.maxRefs, 10); assert.equal(IMAGE_CAPS['api-flux2'].supports.maxRefs, 9);
assert.equal(IMAGE_CAPS['api-luma-image'].supports.maxRefs, 9); assert.equal(IMAGE_CAPS['api-kling-image'].supports.maxRefs, 4); assert.equal(IMAGE_CAPS['api-nano-banana'].supports.maxRefs, 4);
assert.equal(checkImageCaps('api-gpt-image', { refs: 16, mode: 'edit' }).ok, true); assert.equal(checkImageCaps('api-seedream', { refs: 11, mode: 'edit' }).ok, false);
assert.equal(checkImageCaps('api-nano-banana', { mode: 'inpaint', refs: 1 }).ok, false, 'Nano Banana 2 has no mask route'); assert.equal(checkImageCaps('api-ideogram', { mode: 'edit', refs: 1 }).ok, false, 'Ideogram V4 takes no image here');
assert.deepEqual(supportsFor('relight', 'api-nano-banana'), { aspects: [], allowAuto: false, resolutions: [], qualityTiers: [], maxImages: 1, minImages: 1, mask: false, strength: false, seed: true, maxCount: 1 });
assert.equal(supportsFor('face-swap', 'api-gpt-image')!.maxImages, 2); assert.equal(supportsFor('face-swap', 'api-gpt-image')!.seed, false, 'GPT Image 2 Router body sends no seed');
assert.equal(supportsFor('brush-edit', 'comfy-flux3-klein')!.mask, true); assert.equal(supportsFor('camera-angles', 'comfy-qwen-angles')!.maxCount, 9);
assert.equal(supportsFor('brush-edit', 'api-nano-banana'), null, 'not offered: no pair');
ok('hosted reference caps raised to the Router limits (GPT 16, Seedream 10, FLUX.2 [pro] 9, Luma 9, Kling 4, NB2 4); supports per pair');

// ---------------- workflow sources ----------------
const gen = await import(pathToFileURL(path.join(REPO, 'scripts/gen-workflow-sources.mjs')).href);
assert.equal(gen.render(JSON.parse(fs.readFileSync(path.join(REPO, 'workflows/provenance/image-grid.json'), 'utf8'))), fs.readFileSync(path.join(ROOT, 'src/shared/workflowSources.ts'), 'utf8'), 'workflowSources.ts matches the public provenance input (run node scripts/gen-workflow-sources.mjs)');
for (const f of IMAGE_FEATURES) for (const p of f.providers) { const w = workflowFor(f.id, p); assert.ok(w, `${f.id}/${p} has a workflow credit`); assert.ok(w!.source === 'ours' ? w!.file || ((f.id === 'upscale' || p.startsWith('direct-') || p.startsWith('fal-') || /\/comfy-router\/models\//.test(String(w!.url))) && w!.url) /* hosted upscale, official lab APIs, fal-only photo tools and Router models with no official template (2026-10-25): our request body, linked to the API page */ : w!.url, `${f.id}/${p} credit links somewhere`);
  if (w!.file) assert.ok(fs.existsSync(path.join(REPO, 'workflows', w!.file)), `${f.id}/${p}: workflows/${w!.file} exists`); }
assert.equal(workflowLine(workflowFor('relight', 'api-nano-banana')), 'Official Comfy template · Nano Banana 2: Image Edit');
assert.equal(workflowFor('relight', 'api-nano-banana')!.recipe?.startsWith('Our light recipe'), true, 'Relight credits the edit template it runs + our recipe (not an upgrade we have not wired)');
assert.equal(workflowLine(workflowFor('brush-edit', 'comfy-flux3-klein')), 'Ours · create-image-flux3klein-inpaint-api.json');
assert.equal(workflowFor('camera-angles', 'comfy-qwen-angles')!.author, '@hellorob'); assert.equal(workflowFor('camera-angles', 'comfy-qwen-angles')!.file, 'shots-qwen-edit2509-angles-api.json');
assert.match(workflowLine(workflowFor('face-swap', 'comfy-qwen-image')), /^Ours · create-image-qwen-edit2509-multiref-api\.json$/);
assert.equal(featureOfJob({ toolId: 'app-relight', provider: 'api-nano-banana', input: {} })!.label, 'Relight · Nano Banana 2');
assert.equal(featureOfJob({ toolId: 'create-image', provider: 'api-gpt-image', input: { types: ['edit'] } })!.label, 'Edit Image · GPT Image 2');
assert.equal(featureOfJob({ toolId: 'create-image', provider: 'comfy-qwen-image', input: { types: ['inpaint'] } })!.label, 'Brush Edit · Qwen-Image-Edit-2509');
assert.equal(featureOfJob({ toolId: 'soul', provider: 'comfy-soul', input: {} }, 'Z-Image-Turbo + Realism LoRA')!.label, 'Create Image · Z-Image-Turbo + Realism LoRA');
ok('workflow sources match the grid, every pair credited and linked, our files exist; job labels "<Feature> · <Model>"');

// ---------------- Camera & Lens recipe ----------------
assert.equal(parseRig({}), null); assert.ok('error' in (parseRig({ cameraBody: 'nope' }) as any)); assert.ok('error' in (parseRig({ focal: '33' }) as any));
const rig = parseRig({ cameraBody: 'leica-m6', film: 'portra-400', focal: '85' }) as any; assert.deepEqual(rig.rig, { body: 'leica-m6', film: 'portra-400', lens: 'modern-prime', focal: 85, aperture: '4' });
assert.match(rigSentence(rig.rig), /Leica M6.*85 mm focal length.*f\/4.*Portra 400/); assert.ok('error' in (parseRig({ film: 'nope' }) as any));
assert.ok(CAMERA_BODIES.length >= 25 && LENSES.length >= 35 && FILM_STOCKS.length >= 30 && LIGHTING.length >= 12 && ERAS.length >= 8, 'a full rig vocabulary');
const ids = [...CAMERA_BODIES, ...LENSES, ...FILM_STOCKS, ...LIGHTING, ...ERAS].map((x) => `${x.group}:${x.id}`); assert.equal(new Set(ids).size, ids.length, 'unique ids');
ok('Camera & Lens: rig → camera sentence; bad values refused');

// ---------------- API ----------------
const PORT = testPort(9177); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'imgfeat-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const PNG = fs.readFileSync(path.join(ROOT, 'samples/sample-keyframe.png'));
const job = async (tool: string, f: Record<string, string>, files: Record<string, number> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  for (const [k, n] of Object.entries(files)) for (let i = 0; i < n; i++) fd.append(k, new Blob([PNG], { type: 'image/png' }), `${k}${i}.png`);
  const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const tools = (await get('/api/tools')).body as any[]; const T = (id: string) => tools.find((t) => t.id === id);
  assert.equal(T('app-inpaint').name, 'Brush Edit'); assert.equal(T('app-inpaint').route, '/tools/brush-edit'); assert.equal(T('app-shots').name, 'Camera Angles'); assert.equal(T('app-shots').route, '/tools/camera-angles');
  assert.equal(T('image-upscale').name, 'Upscale'); assert.equal(T('app-person-swap').name, 'Person Swap'); assert.equal(T('app-person-swap').route, '/tools/person-swap');
  assert.equal(T('soul').listed, false); assert.ok(!tools.some((t) => /OpenSoul/.test(t.name)), 'no OpenSoul tool name');
  assert.deepEqual(T('app-inpaint').providers.map((p: any) => p.id), MASK_MODELS);
  assert.deepEqual(T('app-person-swap').providers.map((p: any) => p.id), TWO_IMAGE_MODELS);
  for (const m of ['api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-nano-banana-21', 'api-nano-banana-pro', 'api-flux3-image']) assert.ok(TWO_IMAGE_MODELS.includes(m), `${m} takes 2+ images, so Face / Person Swap list it`);
  assert.ok(!T('create-image').app.providerModes['api-nano-banana'].includes('inpaint') && !T('create-image').app.providerModes['api-ideogram'].includes('edit'), 'create-image modes follow the routes');
  assert.equal(T('create-image').providers.find((p: any) => p.id === 'api-gpt-image').name, 'GPT Image 2');
  const br = (await get('/api/browse/image')).body.tools.map((t: any) => t.name); assert.deepEqual(br, MENU_FEATURES.map((f) => f.name), '/image lists the features in menu order');
  const sr = (await get('/api/search?q=opensoul&types=tool')).body.results; assert.equal(sr.length, 0, 'search: no OpenSoul');
  const cl = (await get('/api/search?q=camera%20%26&types=tool')).body.results; assert.ok(cl.some((r: any) => r.route === '/image?workflow=camera-lens'), 'search finds Camera & Lens');
  ok('API: tool names and URLs, Person Swap, legacy look tool unlisted, picker lists, /image order, search');

  const feats = (await get('/api/image-features')).body.features; assert.equal(feats.length, IMAGE_FEATURES.length);
  const ifs = (await get('/api/image-features')).body; assert.ok(ifs.camera.options.film.length >= 30); assert.match(ifs.camera.communityNode.repo, /Mexes1978\/film_prompt_styler/);
  const rl = feats.find((f: any) => f.id === 'relight'); assert.equal(rl.models[0].workflow.source, 'official'); assert.equal(rl.models[0].model, 'Nano Banana 2');
  const wf = await get('/api/workflows/create-image-flux3klein-inpaint-api.json'); assert.equal(wf.status, 200); assert.equal(typeof wf.body, 'object');
  assert.equal((await get('/api/workflows/..%2Fpackage.json')).status, 400); assert.equal((await get('/api/workflows/nope-api.json')).status, 404);
  ok('/api/image-features (models, supports, workflow) and /api/workflows/:file (ours; no traversal)');

  // jobs: feature label + workflow credit; Camera & Lens rig; edit with GPT Image 2's 16 images accepted; Nano Banana 2 inpaint refused
  const r1 = await job('app-relight', { provider: 'api-nano-banana', direction: 'left', rights: '1' }, { image: 1 }); assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const j1 = await until(r1.body.id); assert.equal(j1.feature.label, 'Relight · Nano Banana 2'); assert.equal(j1.feature.workflow.source, 'official'); assert.match(j1.feature.workflow.url, /api_google_nano_banana2_image_edit/);
  const r2 = await job('create-image', { types: '["generate"]', prompt: 'a lighthouse', provider: 'comfy-zimage-turbo', cameraBody: 'arriflex-416', lens: 'classic-anamorphic', focal: '24', aperture: '2.8', film: 'vision3-500t', lighting: 'neon', rights: '1' }); assert.equal(r2.status, 200, JSON.stringify(r2.body));
  const j2 = await until(r2.body.id); assert.equal(j2.feature.id, 'camera-lens'); assert.equal(j2.feature.label, 'Camera & Lens · Z-Image-Turbo'); assert.equal(j2.input.camera.focal, 24); assert.match(j2.input.finalPrompt, /16 mm film.*anamorphic.*24 mm.*f\/2\.8.*Vision3 500T.*neon/); assert.equal(j2.input.camera.film, 'vision3-500t');
  const r3 = await job('create-image', { types: '["generate"]', prompt: 'x', cameraBody: 'imax', rights: '1' }); assert.equal(r3.status, 400); assert.equal(r3.body.issues[0].field, 'cameraBody');
  const r4 = await job('create-image', { types: '["inpaint"]', prompt: 'x', provider: 'api-nano-banana', rights: '1' }, { image: 1, mask: 1 }); assert.equal(r4.status, 400, 'Nano Banana 2 cannot inpaint');
  const r5 = await job('create-image', { types: '["edit"]', prompt: 'x', provider: 'api-ideogram', rights: '1' }, { image: 1 }); assert.equal(r5.status, 400, 'Ideogram V4 cannot edit here');
  const r6 = await job('create-image', { types: '["edit"]', prompt: 'combine them', provider: 'api-gpt-image', rights: '1' }, { image: 1, refs: 15 }); assert.equal(r6.status, 200, JSON.stringify(r6.body));
  const j6 = await until(r6.body.id); assert.equal(j6.feature.label, 'Edit Image · GPT Image 2');
  const r7 = await job('app-person-swap', { provider: 'api-nano-banana', rights: '1' }, { image: 1, person: 1 }); assert.equal(r7.status, 200, JSON.stringify(r7.body));
  const j7 = await until(r7.body.id); assert.equal(j7.feature.label, 'Person Swap · Nano Banana 2'); assert.match(j7.input.finalPrompt ?? j7.input.prompt, /replace the person in image 1 with the person from image 2/i);
  const r8 = await job('app-person-swap', { provider: 'api-nano-banana', rights: '1' }, { image: 1 }); assert.equal(r8.status, 400); assert.equal(r8.body.issues[0].field, 'person');
  // Character Sheet (Oct 22): an optional photo switches it to Edit image on edit-capable models only (local Qwen Image 2.1 edit and Comfy Router ones); no photo = text-to-image
  const cs = T('app-character-sheet'); assert.ok(cs.inputs.some((i: any) => i.name === 'image' && i.label === 'Your photo' && !i.required), 'optional "Your photo" input');
  assert.deepEqual([...cs.app.gallery.providersByMode.edit].sort(), [...EDIT_MODELS].sort(), 'with a photo: only edit-capable models');
  assert.ok(cs.app.gallery.providersByMode.edit.includes('comfy-qwen21') && cs.app.gallery.providersByMode.edit.includes('api-nano-banana'));
  assert.ok(!cs.app.gallery.providersByMode.edit.includes('api-ideogram'));
  assert.deepEqual(cs.app.gallery.preview, { before: '/examples/workflows/character-sheet-before.jpg', after: '/examples/workflows/character-sheet-after.jpg', beforeLabel: 'Your photo', afterLabel: 'Character sheet', model: 'Qwen Image 2.1 · Your computer' });
  const r9 = await job('app-character-sheet', { provider: 'comfy-qwen21', prompt: 'a young explorer', rights: '1' }, { image: 1 }); assert.equal(r9.status, 200, JSON.stringify(r9.body));
  const j9 = await until(r9.body.id); assert.equal(j9.input.mode, 'edit'); assert.match(j9.input.finalPrompt ?? j9.input.prompt, /Character reference sheet of the person in image 1 \(a young explorer\): one image split into three equal vertical panels.*Keep exactly one identical person in all three views.*accessories from image 1/); assert.equal(j9.input.aspect, '4:3');
  const r10 = await job('app-character-sheet', { provider: 'comfy-zimage-turbo', prompt: 'a knight', rights: '1' }); assert.equal(r10.status, 200, JSON.stringify(r10.body));
  const j10 = await until(r10.body.id); assert.equal(j10.input.mode, 'generate'); assert.match(j10.input.finalPrompt ?? j10.input.prompt, /^Character reference sheet of a knight: one image split into three equal vertical panels.*Keep exactly one identical person/); assert.equal(j10.input.aspect, '4:3'); assert.ok(!j10.input.style, 'no style preset on top of the sheet prompt');
  const r11 = await job('app-character-sheet', { provider: 'api-ideogram', prompt: 'x', rights: '1' }, { image: 1 }); assert.equal(r11.status, 400, 'a text-to-image-only model cannot take the photo');
  ok('Character Sheet: optional photo → edit on edit-capable models (Qwen Image 2.1 local + Router), no photo → text-to-image, preview metadata');
  ok('jobs: "Relight · Nano Banana 2" + workflow credit, Camera & Lens rig in the prompt and on input.camera, NB2 inpaint and Ideogram edit refused, GPT Image 2 takes 16 images, Person Swap runs and needs both photos');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
