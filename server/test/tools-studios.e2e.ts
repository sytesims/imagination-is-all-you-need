// Tools and workflows as plugins (plan Phase 3: services/tools.ts, services/workflows.ts, plugins-builtin/studios.ts, plugins-builtin/workflow-folders.ts).
// In process (no server; boot without the legacy plugin):
//  - nav order: the same tool ids in the same order as before the rebuild (snapshot), without a boot and booted, the folders' tools last;
//  - a studio off hides its tools only (and the gallery recipes built on them); they answer "turned off"; on again → the same order;
//  - plugins/cutout (schema 1 + handler.ts) loads unchanged through the workflow-folders plugin: its own fiber, tool, graph and handler;
//  - "Add a workflow": a folder you add mounts its own fiber with no restart; removing it disposes that fiber (tool and graph gone); add again works;
//  - workflow-folders off: no folder loads, adding one says so and leaves nothing behind.
// Run: npx tsx test/tools-studios.e2e.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-studios-'));
Object.assign(process.env, { OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'data'), OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'none.env'), OPENHIGGSFIELD_FILMING_FILE: path.join(dir, 'nofilm.json'),
  OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9', OPENHIGGSFIELD_PROFILE: '' });
for (const k of Object.keys(process.env)) if (/(_KEY|_TOKEN)$|^COMFY_(BASE|DEPLOY|RUNNER)_URL$/.test(k)) delete process.env[k];
const REPO = path.resolve(import.meta.dirname, '../..');

/** GET /api/tools order before Phase 3 (origin/v2 ce69560c, mock backend). */
const NAV = ['object-swap', 'motion-transfer', 'restyle', 'reshoot', 'camera', 'photo-fx', 'upscale', 'create-image', 'h3-video', 'h3-extend', 'audio', 'soundtrack', 'cinema', 'voice',
  'image-upscale', 'soul', 'three-d', 'three-d-turntable', 'plan-a-shot', 'make-it-real', 'footage-fx', 'two-person-swap', 'prompt-edit', 'finish', 'reframe', 'remove-bg', 'sdr-hdr',
  'fps-boost', 'depth-map', 'photos-reel', 'app-character-sheet', 'app-product-shot', 'app-phone-photo', 'app-inpaint', 'app-relight', 'app-photos-to-reel', 'app-transition',
  'app-ugc-ad', 'app-orbit-shot', 'app-anime-restyle', 'app-video-upscale', 'app-change-voice', 'app-translate-video', 'app-face-swap', 'app-shots', 'app-person-swap',
  'app-material-swap', 'app-ad-pack', 'app-remove-bg', 'app-expand', 'app-erase', 'app-try-on', 'app-image-layers', 'app-image-vector', 'app-music-bed'];
const STUDIOS = ['studio-video', 'studio-image', 'studio-audio', 'studio-3d', 'studio-edit', 'apps-gallery'];
const PLACES = ['place-comfy-local', 'place-comfy-cloud', 'place-comfy-router', 'place-fal', 'place-replicate', 'place-direct', 'place-sample'];

const reg = await import('../src/tools/registry.js'); const ids = () => reg.listTools().map((t) => t.id);
// ---- no boot (scripts, tests): every built-in, in nav order ----
assert.deepEqual(ids(), NAV); assert.equal(reg.getTool('face-swap')?.id, 'object-swap', 'aliases'); assert.equal(reg.getTool('hdr')?.id, 'sdr-hdr');
assert.deepEqual(reg.listSoon().map((s) => s.id), ['edit-recreate', 'scene-studio', 'cutout', 'character-builder', 'lipsync', 'storyboard'], 'roadmap entries: a real tool takes its entry\'s place');
ok(`nav order without a boot: ${NAV.length} built-in tools, same order as before`);

const { boot, BUILTIN_PLUGINS } = await import('../src/boot.js'); const { mounted } = await import('../src/kernel/index.js');
const { pluginStatus } = await import('../src/plugins.js'); const { pluginSpec } = await import('../src/pluginGraph.js');
const { folderFibers } = await import('../src/plugins-builtin/workflow-folders.js');
const fiberOf = (name: string) => mounted.filter((m) => m.name === name).at(-1)!.fiber;
const DISPOSED = 4; const ACTIVE = 2;

// ---- booted with studio-image off ----
const ctx = await boot({ name: 't', plugins: [...PLACES, ...STUDIOS.filter((s) => s !== 'studio-image'), 'workflow-folders', 'legacy'], file: 't.yml' }, { legacy: false });
const IMAGE = ['create-image', 'image-upscale', 'soul']; const imageApps = NAV.filter((id) => id.startsWith('app-') && !reg.listTools().some((t) => t.id === id));
for (const id of IMAGE) { assert.equal(reg.getTool(id), undefined, `${id} is gone`); assert.equal(reg.isToolHidden(id), true, `${id}: turned off`); assert.equal(reg.studioOf(id), 'studio-image'); }
assert.equal(reg.getTool('opensoul'), undefined, 'its aliases too');
assert.ok(imageApps.length >= 10 && imageApps.includes('app-product-shot') && !imageApps.includes('app-transition'), 'gallery recipes on Create Image are left out; the others stay');
assert.deepEqual(ids(), [...NAV.filter((id) => !IMAGE.includes(id) && !imageApps.includes(id)), 'cutout'], 'every other tool, in the same order; the folder last');
for (const id of ['h3-video', 'audio', 'three-d', 'finish', 'upscale']) { assert.ok(reg.getTool(id), `${id} stays`); assert.equal(reg.isToolHidden(id), false); }
assert.equal((ctx as any).tools.list().length, ids().length, 'ctx.tools lists the same');
ok(`studio-image off: its ${IMAGE.length} tools and ${imageApps.length} gallery recipes are gone ("turned off"); the rest keep their order`);

// ---- on again (and the gallery again, for its recipes): the full order ----
await (ctx as any).plugin((await BUILTIN_PLUGINS['studio-image']()).default); await fiberOf('apps-gallery').dispose();
await (ctx as any).plugin((await BUILTIN_PLUGINS['apps-gallery']()).default);
assert.deepEqual(ids(), [...NAV, 'cutout'], 'nav order identical to before, folders last');
// a studio disposed at runtime: only its tools leave
const audio = fiberOf('studio-audio'); await audio.dispose(); assert.equal(audio.state, DISPOSED);
assert.deepEqual(ids(), [...NAV, 'cutout'].filter((id) => !['audio', 'soundtrack', 'voice'].includes(id)), 'studio-audio off: audio, soundtrack, voice gone');
assert.ok(reg.getTool('app-music-bed'), 'a recipe already registered keeps its own copy of the base until the gallery reloads');
ok('studio on again: identical nav order; a studio disposed at runtime takes only its own tools');

// ---- plugins/cutout loads unchanged ----
const cut = pluginStatus().find((s) => s.id === 'cutout')!;
assert.ok(cut.ok, cut.errors.join('; ')); assert.equal(cut.handler, true, 'its handler.ts runs (shipped folders may have one)'); assert.equal(cut.user, undefined);
const ct = reg.getTool('cutout')!; assert.equal(ct.plugin?.handler, true); assert.equal(ct.plugin?.tab, 'video'); assert.ok(pluginSpec('cutout'), 'its graph + node map are in the store');
assert.equal((ctx as any).workflows.graph('cutout'), pluginSpec('cutout'), 'ctx.workflows reads the same store');
assert.equal(folderFibers.get('cutout')?.state, ACTIVE, 'one fiber for the folder');
const files = fs.readdirSync(path.join(REPO, 'plugins/cutout')).sort(); assert.ok(files.includes('plugin.json') && files.includes('workflow.json') && files.includes('node-map.json') && files.includes('handler.ts'), 'schema-1 folder as it is');
ok('plugins/cutout: schema 1 + handler.ts loads unchanged, as its own fiber (tool, graph)');

// ---- Add a workflow: add → own fiber, remove → fiber disposed, add again ----
const { saveWorkflow, removeWorkflow } = await import('../src/workflowImport.js');
const wf = JSON.parse(fs.readFileSync(path.join(REPO, 'workflows/depth-map-dav2-api.json'), 'utf8'));
const body = { workflow: wf, name: 'Studio Depth', tab: 'video', category: 'edit', input: '1.file', output: '5', license: 'Your own' };
let r = await saveWorkflow(body); assert.ok(r.ok, JSON.stringify(r));
const f1 = folderFibers.get('studio-depth')!; assert.equal(f1.state, ACTIVE); assert.ok(reg.getTool('studio-depth')); assert.ok(pluginSpec('studio-depth'));
assert.equal(ids().at(-1), 'studio-depth', 'after every built-in and the shipped folders');
assert.deepEqual(await removeWorkflow('studio-depth'), { ok: true });
assert.equal(f1.state, DISPOSED, 'its fiber is disposed'); assert.equal(reg.getTool('studio-depth'), undefined); assert.equal(pluginSpec('studio-depth'), null, 'its graph left with it');
assert.ok(!folderFibers.has('studio-depth')); assert.ok(!fs.existsSync(path.join(process.env.OPENHIGGSFIELD_DATA_DIR!, 'plugins', 'studio-depth')));
r = await saveWorkflow(body); assert.ok(r.ok, `added again: ${JSON.stringify(r)}`); assert.notEqual(folderFibers.get('studio-depth'), f1, 'a new fiber');
assert.deepEqual(await removeWorkflow('studio-depth'), { ok: true });
ok('Add a workflow: its own fiber with no restart; Remove disposes it (tool, graph, folder); adding it again works');

// ---- workflow-folders off ----
await fiberOf('workflow-folders').dispose();
assert.equal(reg.getTool('cutout'), undefined, 'the shipped folders leave with it'); assert.equal(pluginSpec('cutout'), null); assert.deepEqual(pluginStatus(), []);
r = await saveWorkflow(body); assert.equal(r.ok, false); assert.match((r as any).errors.join(' '), /workflow folders are turned off/);
assert.ok(!fs.existsSync(path.join(process.env.OPENHIGGSFIELD_DATA_DIR!, 'plugins', 'studio-depth')), 'nothing left behind');
assert.ok(reg.getTool('create-image') && reg.getTool('h3-video'), 'the studios keep working');
ok('workflow-folders off: no folder loads, adding one says it is off and leaves nothing; the studios keep working');

// ---- e2e: a server with studio-image off answers for the rest and refuses only its tools ----
{ const { spawn } = await import('node:child_process'); const { testPort } = await import('./_ports.js');
  const prof = path.join(dir, 'noimage.yml'); const desktop = fs.readFileSync(path.resolve(import.meta.dirname, '../profiles/desktop.yml'), 'utf8');
  fs.writeFileSync(prof, desktop.split('\n').filter((l) => !/^\s+- studio-image\b/.test(l)).join('\n'));
  const port = testPort(9501); const B = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_PROFILE: prof, OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'srv-data'), OPENHIGGSFIELD_DEMO_AUTO: '0' } });
  try {
    for (let i = 0; i < 400; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 50)); }
    const h = await (await fetch(`${B}/api/health`)).json() as any; assert.equal(h.backend, 'mock');
    const tl = await (await fetch(`${B}/api/tools`)).json() as any[]; assert.ok(!tl.some((t) => ['create-image', 'image-upscale', 'app-product-shot'].includes(t.id)) && tl.some((t) => t.id === 'h3-video'));
    assert.equal((await fetch(`${B}/api/models/quote?model=comfy-qwen-image&toolId=create-image`)).status, 404, 'a quote on Create Image: unknown tool, never a 500');
    for (const u of ['/api/models', '/api/capabilities', '/api/image-workflows', '/api/models/quote?model=comfy-acestep&toolId=audio', '/api/workflow-folders']) assert.equal((await fetch(B + u)).status, 200, u);
    const fd = new FormData(); fd.append('prompt', 'a fox in the snow'); fd.append('types', '["t2v"]');
    assert.ok((await fetch(`${B}/api/tools/h3-video/jobs`, { method: 'POST', body: fd })).status < 500, 'a video job is taken as before');
    assert.ok(((await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: new FormData() })).status) < 500, 'a Create Image job is refused, not a crash');
  } finally { srv.kill('SIGTERM'); await new Promise((r) => srv.on('exit', r)); }
  ok('e2e: a server with studio-image off serves the other studios; its tools are refused, never a 500'); }

fs.rmSync(dir, { recursive: true, force: true });
process.exit(0); // the queue's timers keep the loop alive
