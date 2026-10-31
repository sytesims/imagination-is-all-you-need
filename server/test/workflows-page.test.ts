// Workflows page (was Apps, 2026-10-22): every app tool's models carry a workflow credit where one is recorded, and every "file" exists.
// Run: npx tsx test/workflows-page.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const { appWorkflowFor } = await import('../src/shared/appWorkflows.ts');
const ok = (m: string) => console.log('ok ' + m);
const WF = path.resolve(import.meta.dirname, '../../workflows');

// Sources per default model, as recorded
const want: [string, string, string][] = [
  ['app-relight', 'api-nano-banana', 'official'], ['app-inpaint', 'api-gpt-image', 'official'], ['app-face-swap', 'comfy-qwen21', 'community'],
  ['photo-fx', 'router-seedance', 'official'], ['photo-fx', 'comfy-open', 'official'], ['upscale', 'comfy-seedvr2', 'official'], ['app-video-upscale', 'direct-flux3-upscale', 'official'],
  ['app-transition', 'comfy-h3', 'ours'], ['app-ugc-ad', 'comfy-h3', 'official'], ['app-orbit-shot', 'comfy-open', 'ours'], ['app-anime-restyle', 'comfy-h3-restyle', 'community'],
  ['app-change-voice', 'comfy-chatterbox-vc', 'official'], ['app-translate-video', 'local-whisper-nllb-chatterbox', 'ours'], ['app-music-bed', 'api-seed-audio', 'official'],
];
for (const [t, p, s] of want) { const w = appWorkflowFor(t, p); assert.equal(w?.source, s, `${t} ${p}`); if (w?.source !== 'ours') assert.match(String(w?.url), /^https:\/\//); if (w?.file) assert.ok(fs.existsSync(path.join(WF, w.file)), w.file); }
ok(`${want.length} recorded app credits (source, link, local file present)`);
// photo tools (2026-10-23): every fal model carries its credit on its card (Bria: the official Comfy partner template; the others: our fal request)
for (const [t, p, src] of [['app-remove-bg', 'fal-bria-rmbg', 'official'], ['app-remove-bg', 'fal-ideogram-rmbg', 'ours'], ['app-expand', 'fal-bria-expand', 'official'], ['app-expand', 'fal-ideogram-reframe', 'ours'],
  ['app-erase', 'fal-bria-eraser', 'official'], ['app-erase', 'fal-object-removal', 'ours'], ['app-try-on', 'fal-fashn-tryon', 'ours']] as const) { const w = appWorkflowFor(t, p); assert.equal(w?.source, src, `${t} ${p}`); assert.match(String(w?.url), /^https:\/\//); }
ok('photo tools: 7 model credits with links');
assert.equal(appWorkflowFor('app-anime-restyle', 'router-seedance'), null, 'no invented source'); ok('a pair with no ComfyUI workflow stays without a credit');
assert.equal(appWorkflowFor('photo-fx', 'router-seedance')?.name.includes('First-Last-Frame'), true); ok('Router video apps keep their credit');
// Card previews (Oct 22): Character Sheet carries a before / after pair (real files under web/public, small enough for a card); cards without one have none
{
  await import('../src/tools/apps.ts'); const { getTool, listTools } = await import('../src/tools/registry.ts');
  const pv = (getTool('app-character-sheet') as any).app.gallery.preview; assert.equal(pv.beforeLabel, 'Your photo'); assert.equal(pv.afterLabel, 'Character sheet');
  for (const u of [pv.before, pv.after]) { const f = path.resolve(import.meta.dirname, '../../web/public', u.replace(/^\//, '')); assert.ok(fs.existsSync(f), u); assert.ok(fs.statSync(f).size <= 220_000, `${u}: ${fs.statSync(f).size} B`); }
  assert.ok(!(getTool('app-product-shot') as any).app.gallery.preview, 'no preview without metadata');
  const withPv = listTools().filter((t: any) => t.app?.gallery?.preview).map((t) => t.id); assert.deepEqual(withPv, ['app-character-sheet']);
  ok('card previews: Character Sheet before / after files present (≤ 220 KB each); other cards unchanged');
}
// Unified Create (2026-10-22): the cards of the workflows in Create Image's bar open it with the workflow picked; Recreate does too
{
  const { workflowOpenHref, workflowRecreateHref } = await import('../../web/src/shared/workflowLinks.ts');
  for (const [t, w] of [['app-relight', 'relight'], ['app-face-swap', 'face-swap'], ['app-person-swap', 'person-swap'], ['app-character-sheet', 'character-sheet'], ['app-product-shot', 'product-shot'], ['image-upscale', 'upscale'], ['app-inpaint', 'brush-edit'], ['app-shots', 'camera-angles'], ['app-remove-bg', 'remove-bg'], ['app-expand', 'expand'], ['app-erase', 'erase'], ['app-try-on', 'try-on']])
    assert.equal(workflowOpenHref(t), `/image?workflow=${w}`, t);
  /* 2026-10-23: Brush Edit and Camera Angles cards open the bar too; a Create Image job with a camera rig recreates into Camera & Lens, a plain one stays plain */
  assert.equal(workflowRecreateHref({ id: 'j2', toolId: 'app-inpaint' }), '/image?workflow=brush-edit&recreate=j2');
  assert.equal(workflowRecreateHref({ id: 'j3', toolId: 'app-shots' }), '/image?workflow=camera-angles&recreate=j3');
  assert.equal(workflowRecreateHref({ id: 'j4', toolId: 'create-image', input: { camera: { body: 'nikon-f3' } } } as any), '/image?workflow=camera-lens&recreate=j4');
  assert.equal(workflowRecreateHref({ id: 'j5', toolId: 'create-image', input: {} } as any), null);
  assert.equal(workflowRecreateHref({ id: 'j1', toolId: 'image-upscale' }), '/image?workflow=upscale&recreate=j1');
  const { IMAGE_REDIRECTS, featureById } = await import('../src/shared/imageFeatures.ts');
  assert.equal(IMAGE_REDIRECTS['/tools/image-upscale'], '/image?workflow=upscale', 'the old Upscale page redirects'); assert.equal(featureById('upscale')!.route, '/image?workflow=upscale');
  ok('cards and Recreate open Create Image with the workflow; /tools/image-upscale redirects');
}
// Truth (2026-10-27, workflow audit): a card with a recorded example leads with the EXAMPLE's model and real cost, not the tool's lead or free
// model; "Made here" needs a job id; ACE-Step shows "set up", never Local, while it isn't installed. Tools as GET /api/tools shapes them.
{
  const { resolveRow, runsPrice } = await import('../../web/src/ui/pages/workflowRows.ts');
  const { wfEntryById } = await import('../src/shared/workflowCatalog.ts');
  const local = (status: string) => [{ id: 'local', status }]; const cloud = [{ id: 'comfy-cloud', status: 'ready' }];
  const M = (key: string, displayName: string, fromPrice: number | null, runsOn: any[]) => ({ key, displayName, fromPrice, runsOn, engines: [`eng-${key}`] });
  /* the examples' own models are offered here (2026-10-28: a card names the model Open runs, so an example's model leads only when it is offered and runs now) */
  const imageModels = [M('qwen-image-2.1', 'Qwen Image 2.1', 0, local('ready')), M('gpt-image-2.5-flare', 'GPT Image 2.5 Flare', 1, cloud),
    M('z-image-turbo', 'Z-Image-Turbo', 0, local('ready')), M('flux-2-klein-4b', 'FLUX.2 [klein] 4B', 0, local('ready')), M('qwen-image-2.1-turbo', 'Qwen Image 2.1 Turbo', 0, local('ready'))];
  const tool = (e: string, models: any[]) => ({ id: wfEntryById(e)!.toolId, models, providers: [], app: {} });
  const tools: any[] = [
    tool('v-create', [M('wan-2.2-5b', 'Wan 2.2 5B', 0, local('ready')), M('ltx-2.5-pro', 'LTX-2.5 Pro', 195, cloud), M('minimax-h3', 'MiniMax H3', 64, cloud)]),
    tool('i-create-image', imageModels), tool('i-relight', imageModels), tool('i-character-sheet', imageModels), tool('i-product-shot', imageModels),
    tool('v-direct-a-shot', [M('ltx-2.5-22b', wfEntryById('v-direct-a-shot')!.name, 0, local('ready'))]),
    tool('v-motion-control', [M('kling-v3-omni-edit', 'Kling 3.0 Omni Edit', 101, cloud)]), tool('v-extend', [M('minimax-h3-extend', 'H3 Extend', 30, cloud)]),
    tool('a-music', [M('ace-step-1.5', 'ACE-Step 1.5', 0, local('not-installed')), M('yue2', 'YuE2', 0, local('ready'))]),
  ];
  const hub = { workflows: [{ id: 'product-shot', example: { kind: 'single', url: '/examples/presets/cafe-counter.jpg', model: 'Qwen Image 2.1', jobId: null } }] } as any;
  const row = (id: string) => resolveRow(wfEntryById(id)!, tools, hub)!;
  const want: [string, string, string][] = [['v-create', 'LTX-2.5 Pro', '$1.72'], ['i-create-image', 'Z-Image-Turbo', 'Free · on your computer'], ['i-relight', 'FLUX.2 [klein] 4B', 'Free · on your computer'],
    ['i-character-sheet', 'Qwen Image 2.1 Turbo', 'Free · on your computer'], ['v-direct-a-shot', 'LTX-2.5 + Layout to Render', '$0.30'],
    ['v-motion-control', 'Kling 3.0 Omni Edit', '$1.65'], ['v-extend', 'H3 Extend', '$1.32']];
  for (const [id, model, price] of want) { const r = row(id); assert.ok(r.made, `${id}: made here`); assert.equal(r.model, model, `${id}: the example's model`); assert.equal(r.price?.text, price, `${id}: the example's real cost`); }
  assert.deepEqual(row('v-motion-control').runs.map((x) => x.jobId), ['dc114104', '1c5974e8'], 'Motion Control: the swap and its Topaz upscale');
  assert.deepEqual(row('v-extend').runs.map((x) => [x.jobId, x.costUsd]), [['42ceb1af', 0.8], ['50d2a3a0', 0.52]], 'Extend: both runs of the 20 s take');
  assert.equal(row('v-motion-control').runs[0].place, 'Comfy Router', 'a Comfy Router run names its place (shared/modelIds.ts PLACE_LABELS)');
  const ps = row('i-product-shot'); assert.equal(ps.made, false, 'Product Shot: a preset picture with no job id is not "Made here"'); assert.notEqual(ps.media.kind, 'art');
  const mu = row('a-music'); assert.equal(mu.models[0].key, 'yue2', 'Music leads with YuE2'); assert.equal(mu.models.find((m) => m.key === 'ace-step-1.5')!.run.kind, 'setup', 'ACE-Step: set up first, never "Free · on your computer"');
  /* the card's one line is the lead model's best place: the example's own model when it runs here (LTX-2.5 Pro on Comfy), else a free local one */
  assert.equal(row('v-create').run.text, 'On Comfy Cloud · from $1.95', 'Create Video: the example model’s live place and price');
  assert.equal(row('i-relight').run.text, 'Free · on your computer');
  assert.equal(runsPrice([]), null);
  ok(`cards with an example show its model and real cost (${want.length}); no job id, no "Made here"; ACE-Step not Local until installed`);
  /* 2026-10-28 (picks audit): Open passes the card's model on, so the tab opens what the card names */
  assert.equal(row('i-character-sheet').openHref, '/image?workflow=character-sheet&model=qwen-image-2.1-turbo');
  assert.equal(row('v-extend').openHref, '/video?workflow=extend&model=minimax-h3-extend');
  assert.equal(row('v-direct-a-shot').openHref, wfEntryById('v-direct-a-shot')!.href, 'a tool with one model keeps its own link');
  /* the example's model leads only when it runs now: with no LTX key, Create Video leads with what runs (and names it), never "Needs an LTX key" */
  const noKey = tools.map((t) => t.id !== wfEntryById('v-create')!.toolId ? t : { ...t, models: t.models.map((m: any) => m.key === 'ltx-2.5-pro' ? { ...m, runsOn: [{ id: 'ltx', status: 'needs-key' }] } : m) });
  const cv = resolveRow(wfEntryById('v-create')!, noKey, hub)!; assert.equal(cv.models[0].key, 'wan-2.2-5b'); assert.equal(cv.model, 'Wan 2.2 5B', 'the card names the model Open runs');
  assert.equal(cv.openHref, '/video?model=wan-2.2-5b'); assert.ok(cv.made && cv.exampleModel === 'LTX-2.5 Pro', 'the example keeps its own model (said in the sheet)');
  /* the server's own pick of place (models[].autoRunOn: "Use local ComfyUI" off → the cloud) is the place the card says */
  const auto = tools.map((t) => t.id !== wfEntryById('v-create')!.toolId ? t : { ...t, models: t.models.map((m: any) => m.key === 'minimax-h3' ? { ...m, runsOn: [{ id: 'local', status: 'ready', credits: 0 }, { id: 'comfy-cloud', status: 'ready', credits: 64 }], autoRunOn: 'comfy-cloud' } : m) });
  const h3 = resolveRow(wfEntryById('v-create')!, auto, hub)!.models.find((m) => m.key === 'minimax-h3')!; assert.equal(h3.run.id, 'comfy-cloud', 'the tab’s own place, not the free local one it won’t pick');
  ok('Open carries the card’s model; the lead runs now; the card says the place the tab picks');
}
