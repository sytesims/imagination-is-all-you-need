// Plugin placement (2026-11-01): "drop a folder in and your workflow shows up in the app, next to ours" (shared/pluginPlacement.ts).
// Manifest tab / category / goal / author are checked; a placed plugin joins its tab (Video: VIDEO_WORKFLOWS, once; other tabs: menu rows),
// the Workflows page catalogue and search (capabilities); Cutout comes from its own manifest, not a hand-written line.
// Free, single-process: temp plugins dir, mock backend, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-placement-')); const P = path.join(D, 'plugins'); const DATA = path.join(D, 'data');
fs.mkdirSync(P); fs.mkdirSync(DATA);
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_PLUGINS_DIR: P, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'absent.env'), OPENHIGGSFIELD_BACKEND: 'mock' });
globalThis.fetch = (async () => { throw new Error('network forbidden'); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);

const REPO = path.resolve(import.meta.dirname, '../..');
fs.cpSync(path.join(REPO, 'plugins/cutout'), path.join(P, 'cutout'), { recursive: true });
const graph = { '1': { class_type: 'LoadImage', inputs: { image: 'in.png' } }, '2': { class_type: 'ImageInvert', inputs: { image: ['1', 0] } }, '3': { class_type: 'SaveImage', inputs: { images: ['2', 0] } } };
const write = (id: string, extra: Record<string, unknown>) => { fs.mkdirSync(path.join(P, id));
  fs.writeFileSync(path.join(P, id, 'plugin.json'), JSON.stringify({ schema: 1, id, name: `Test ${id}`, category: 'Image', description: 'Turn a photo into its negative. A test plugin.', input: 'image', license: { id: 'mit' },
    components: [{ kind: 'model', name: 'm', license: 'mit', url: 'https://example.com' }], presets: [{ id: 'default', label: 'Default', prompt: '' }], pricing: { gpuSecPerSec: { '720p': 1 } },
    workflow: 'workflow.json', nodeMap: 'node-map.json', ...extra }));
  fs.writeFileSync(path.join(P, id, 'workflow.json'), JSON.stringify(graph)); fs.writeFileSync(path.join(P, id, 'node-map.json'), JSON.stringify({ inputs: { image: { node: '1', field: 'image' } }, output: { node: '3' } })); };
write('img-placed', { tab: 'image', category: 'edit', goal: 'fix', author: 'Tester' });
write('no-tab', {});
write('bad-tab', { tab: 'music', category: 'edit' });
write('bad-cat', { tab: 'video', category: 'Video' });
write('bad-goal', { tab: 'image', category: 'edit', goal: 'Fix It!' });

const { placementErrors, placeVideoPlugins, pluginMenuRows, pluginWfEntries, pluginVideoWorkflow, PLUGIN_CATEGORIES } = await import('../src/shared/pluginPlacement.ts');
const { VIDEO_WORKFLOWS, VIDEO_REDIRECTS, VIDEO_PAGE, videoRedirect, videoWorkflowHref } = await import('../src/shared/videoWorkflows.ts');

// 1. manifest fields
assert.deepEqual(placementErrors({}), [], 'no placement: fine');
assert.deepEqual(placementErrors({ category: 'Anything' }), [], 'without a tab, category stays free (the tool group)');
assert.deepEqual(placementErrors({ tab: 'video', category: 'edit', goal: 'fix', author: 'Me' }), []);
assert.match(placementErrors({ tab: 'music', category: 'edit' }).join(), /tab must be one of image, video, audio, 3d/);
assert.match(placementErrors({ tab: 'video', category: 'people' }).join(), /Video tab's categories: create, edit, motion, camera, apps/);
assert.match(placementErrors({ tab: 'image', category: 'edit', goal: 'Fix It!' }).join(), /goal must be/);
assert.match(placementErrors({ author: 'x'.repeat(81) }).join(), /author/);
assert.deepEqual(PLUGIN_CATEGORIES.image, ['edit', 'people', 'product', 'camera']); assert.deepEqual(PLUGIN_CATEGORIES['3d'], ['create', 'edit', 'video']);
ok('tab / category / goal / author checked; category is free without a tab');

// 2. load: good plugins load, bad placement is refused with the reason
const { loadPlugins } = await import('../src/plugins.ts'); const { getTool, listTools } = await import('../src/tools/registry.ts');
const st = Object.fromEntries((await loadPlugins()).map((s) => [s.id, s]));
for (const id of ['cutout', 'img-placed', 'no-tab']) assert.ok(st[id]?.ok, `${id} loads: ${st[id]?.errors.join('; ')}`);
assert.match(st['bad-tab'].errors.join(), /tab must be/); assert.match(st['bad-cat'].errors.join(), /category must be one of the Video tab/); assert.match(st['bad-goal'].errors.join(), /goal/);
const cut = getTool('cutout')!.plugin!; assert.equal(cut.tab, 'video'); assert.equal(cut.category, 'edit'); assert.equal(cut.goal, 'fix'); assert.ok(cut.author); assert.equal(cut.handler, true);
assert.equal(getTool('cutout')!.category, 'Video', 'a placed plugin\'s tool group is its tab'); assert.equal(getTool('no-tab')!.category, 'Image', 'no tab: the manifest category stays the group');
ok('placed plugins load with their placement; bad ones are refused with the reason');

// 3. Cutout: from its manifest, once, among the Edit workflows, with its badge; old links still open it
const src = fs.readFileSync(path.join(REPO, 'server/src/shared/videoWorkflows.ts'), 'utf8'); assert.doesNotMatch(src, /id: 'cutout'/, 'no hand-written Cutout line');
const cuts = VIDEO_WORKFLOWS.filter((w) => w.id === 'cutout'); assert.equal(cuts.length, 1, 'Cutout is in the Video workflows once');
const w = cuts[0]; assert.equal(w.toolId, 'cutout'); assert.equal(w.category, 'edit'); assert.ok(w.plugin?.runsCode, 'badge says it runs code'); assert.equal(w.plugin?.licence, 'MIT');
assert.equal(w.tagline, 'Subject + black-and-white mask for editing', 'its own line, distinct from Remove Background');
assert.notEqual(w.tagline, VIDEO_WORKFLOWS.find((x) => x.id === 'remove-bg')!.tagline);
const i = VIDEO_WORKFLOWS.indexOf(w); assert.equal(VIDEO_WORKFLOWS[i - 1].category, 'edit', 'placed next to the built-in edits');
assert.equal(VIDEO_REDIRECTS['/tools/cutout'], undefined); assert.equal(videoRedirect('/tools/cutout', '?fromJob=a', ''), `${VIDEO_PAGE}?workflow=cutout&fromJob=a`, '/tools/cutout still opens it');
assert.equal(videoWorkflowHref('cutout'), `${VIDEO_PAGE}?workflow=cutout`);
placeVideoPlugins(listTools() as any); placeVideoPlugins(listTools() as any);
assert.equal(VIDEO_WORKFLOWS.filter((w) => w.id === 'cutout').length, 1, 'placing again never duplicates');
assert.ok(!VIDEO_WORKFLOWS.some((x) => x.id === 'img-placed' || x.id === 'no-tab'), 'only video-tab plugins join the Video list');
placeVideoPlugins([{ id: 'remove-bg', name: 'Fake', plugin: { id: 'remove-bg', tab: 'video', category: 'edit' } }]);
assert.equal(VIDEO_WORKFLOWS.filter((x) => x.id === 'remove-bg').length, 1, 'a built-in id wins over a plugin');
assert.ok(!VIDEO_WORKFLOWS.some((x) => x.id === 'cutout'), 'a plugin that is gone (disabled) leaves the list');
placeVideoPlugins(listTools() as any);
assert.equal(pluginVideoWorkflow({ id: 'x', name: 'X', plugin: { id: 'x', tab: 'video', category: 'nope', input: 'image' } }).category, 'apps', 'unknown category → Apps');
ok('Cutout comes from its manifest: once, among the edits, with its badge; /tools/cutout still opens it');

// 4. other tabs, the Workflows page and search
const tools = listTools() as any[];
const rows = pluginMenuRows(tools, 'image'); assert.deepEqual(rows.map((r) => r.key), ['img-placed'], 'the image plugin is an Image menu row');
assert.equal(rows[0].to, '/tools/img-placed'); assert.equal(rows[0].plugin.author, 'Tester'); assert.equal(rows[0].plugin.runsCode, false);
assert.deepEqual(pluginMenuRows(tools, 'audio'), []);
const entries = pluginWfEntries(tools); assert.deepEqual(entries.map((e) => e.id).sort(), ['i-img-placed', 'v-cutout'], 'Workflows page entries for placed plugins only');
const ve = entries.find((e) => e.id === 'v-cutout')!; assert.equal(ve.cat, 'clip'); assert.equal(ve.href, `${VIDEO_PAGE}?workflow=cutout`); assert.equal(ve.goal, 'fix'); assert.ok(ve.tags.includes('plugin'));
assert.equal(entries.find((e) => e.id === 'i-img-placed')!.cat, 'photo');
const { capabilities } = await import('../src/capabilities.ts');
assert.equal(capabilities().filter((c) => c.id === 'video/cutout').length, 1, 'search (capabilities) finds Cutout once');
ok('image plugin in the Image menu; Workflows page entries and search see placed plugins');
fs.rmSync(D, { recursive: true, force: true });
