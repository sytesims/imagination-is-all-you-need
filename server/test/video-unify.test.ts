// One Video page, steps 2 and 3 (2026-10-25): every video workflow resolves to the one Video page (/video?workflow=<id>) and runs
// in its own bar (shared/videoBar.ts recipes; Object Swap's "what to replace" and Re-shoot's angles as bar extras, ui/video/barExtras/); old pages, the Camera Moves / Photo FX galleries and the old Edit Video list redirect there
// with their query kept; links, Recreate and hand-offs go straight to the workflow and ask the server for the workflow's own tool.
// Run: npx tsx test/video-unify.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { VIDEO_WORKFLOWS, VIDEO_REDIRECTS, VIDEO_PAGE, videoRedirect, videoWorkflowHref, isEditHub, isPanelWorkflow } = await import('../src/shared/videoWorkflows.ts');
const { VIDEO_BARS, videoBarOf, typesOf } = await import('../src/shared/videoBar.ts');
const { redirectTarget, toolOpenHref, toolHandoffHref, workflowRecreateHref, videoWorkflowOfJob, pageToolId, withSearch } = await import('../../web/src/shared/workflowLinks.ts');
const ok = (m: string) => console.log('ok ' + m);
/* Cutout is a plugin (plugins/cutout/plugin.json, tab video): placed into VIDEO_WORKFLOWS from its manifest, as the server and app do (shared/pluginPlacement.ts) */
{ const fs = await import('node:fs'); const m = JSON.parse(fs.readFileSync(new URL('../../plugins/cutout/plugin.json', import.meta.url), 'utf8'));
  (await import('../src/shared/pluginPlacement.ts')).placeVideoPlugins([{ id: m.id, name: m.name, description: m.description, plugin: { id: m.id, tab: m.tab, category: m.category, input: m.input, author: m.author, handler: !!m.handler, license: { id: m.license.id, name: 'MIT' } } }]); }
const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/src');

await import('../src/tools/apps.ts'); const { listTools } = await import('../src/tools/registry.ts');
const tools = new Map((listTools() as any[]).map((t) => [t.id, t]));
/** tools that come from plugins/ at server start (not in the registry this test loads) */
const PLUGIN_TOOLS = new Set(['cutout']);
/** the workflows whose extra step lives in a bar extra (ui/video/barExtras/): one chip + popover in the same bar */
const EXTRAS = { 'object-swap': 'ObjectSwapExtra', reshoot: 'ReshootExtra' } as Record<string, string>;

// 1. every workflow resolves to the one Video page and runs in its bar: Create, or a bar recipe (all 20); the Edit Video list is the picker's Edit tab
const runnable = VIDEO_WORKFLOWS.filter((w) => w.id !== 'create' && !isEditHub(w.id) && !isPanelWorkflow(w)); /* Stitch: its own panel (StitchPanel), in the same dock */
for (const w of VIDEO_WORKFLOWS) {
  const href = videoWorkflowHref(w.id);
  assert.ok(href === VIDEO_PAGE || href.startsWith(`${VIDEO_PAGE}?workflow=${w.id}`), `${w.id}: opens the Video page`);
  const kind = w.id === 'create' ? 'create' : isEditHub(w.id) ? 'hub' : isPanelWorkflow(w) ? 'panel' : videoBarOf(w.id) ? 'bar' : 'missing';
  assert.notEqual(kind, 'missing', `${w.id}: runs in the Video bar (has a recipe)`);
}
assert.equal(runnable.length, 24, '24 selectable video workflows besides Create and the Edit list (two-person swap retired)');
for (const w of runnable) assert.ok(videoBarOf(w.id), `${w.id}: in the Video bar, the same page as every other workflow`);
assert.ok(isEditHub('edit-video') && !isEditHub('extend') && !isEditHub(null), 'Edit Video is the only hub');
const bars = Object.keys(VIDEO_BARS); assert.equal(bars.length, 24, `${bars.length} workflows in the bar`);
for (const id of bars) assert.ok(VIDEO_WORKFLOWS.some((w) => w.id === id), `${id}: a known workflow`);
ok(`${VIDEO_WORKFLOWS.length} entries: all ${runnable.length} workflows in the Video bar, Create, and the Edit list as the picker's Edit tab`);

// 2. every recipe matches the tool it runs on: slots are the tool's file inputs, option values are ones the tool takes
const FIXED_OK = new Set(['mode', 'target', 'count', 'types', 'prompt', 'enhance', 'steps', 'volume', 'preset', 'resolution', 'voice', 'language', 'mix']);
for (const [id, bar] of Object.entries(VIDEO_BARS) as [string, any][]) {
  const w = VIDEO_WORKFLOWS.find((x) => x.id === id)!; const t = tools.get(w.toolId);
  if (!t) { assert.ok(PLUGIN_TOOLS.has(w.toolId), `${id}: tool ${w.toolId} registered`); continue; }
  const inp = (n: string) => t.inputs.find((i: any) => i.name === n);
  for (const s of bar.slots) { const i = inp(s.name); if (s.altImage) assert.match(String(inp(s.altImage)?.kind), /^file$/, `${id}: ${s.name} also takes a photo as ${s.altImage}`); assert.ok(i, `${id}: slot ${s.name} is a tool input`); assert.match(String(i.kind), /^files?$/, `${id}: slot ${s.name} is a file input`);
    assert.ok(s.label && s.hint, `${id}: slot ${s.name} has a label and a hint`); if (s.required) assert.ok(s.missing, `${id}: required slot ${s.name} says what's missing`); }
  for (const c of bar.controls) {
    assert.ok(bar.groups.some((g: any) => g.id === c.group) || c.kind === 'toggle', `${id}: ${c.field} sits in a group`);
    const target = c.send === 'types' ? inp('types') : inp(c.field);
    if (c.send !== 'types' && c.from !== 'durations' && c.from !== 'resolutions') assert.ok(target || c.field === 'audio' || c.field === 'keepAudio' || c.field === 'move' || c.field === 'effect' || (t.app?.fields ?? []).some((f: any) => f.name === c.field), `${id}: ${c.field} is a tool input`);
    if (c.options && Array.isArray(target?.options) && target.options.length) for (const o of c.options) assert.ok([...target.options, ...Object.values<any>(target.byProvider ?? {}).flat()].includes(o.value), /* a model's own values (LTX-2.5 lip sync: Draft / Sharper) */ `${id}: ${c.field}=${o.value} is a value the tool takes`);
    if (c.from === 'presets') assert.ok((t.presets ?? []).length > 0, `${id}: ${c.field} lists the tool's presets`);
    if (c.from === 'input') assert.ok(Array.isArray(inp(c.field)?.options) && inp(c.field).options.length, `${id}: ${c.field} options come from the tool`);
  }
  for (const k of Object.keys(bar.fixed ?? {})) assert.ok(inp(k) || FIXED_OK.has(k), `${id}: fixed ${k} is a field the tool reads`);
  for (const k of Object.keys(bar.typesWhenFile ?? {})) assert.ok(bar.slots.some((s: any) => s.name === k), `${id}: typesWhenFile ${k} is a slot`);
  for (const c of bar.controls) if (c.whenPhoto) assert.ok(bar.slots.some((s: any) => s.name === c.whenPhoto && s.altImage), `${id}: ${c.field} follows a slot that takes a photo`);
  for (const c of bar.controls.filter((x: any) => x.kind === 'tiles')) assert.ok(inp(c.field)?.appField && inp(c.field)?.control === 'tiles', `${id}: ${c.field} is the tool's tiles field`);
  assert.ok(bar.generateLabel, `${id}: Generate label`);
}
assert.equal(typesOf({ field: 'x', send: 'types' } as any, 'green'), '["green"]'); assert.equal(typesOf({ field: 'x' } as any, 'green'), null);
assert.equal(typesOf({ field: 'x', send: 'field+types' } as any, ''), null);
ok('every bar recipe matches its tool: file slots, option values, fixed fields');

// 3. old URLs land on the Video page with the workflow, query and hash kept
for (const w of VIDEO_WORKFLOWS) for (const old of w.oldRoutes) {
  const to = redirectTarget(old, '?fromJob=j1&out=0', '#h', VIDEO_REDIRECTS) ?? (w.plugin ? videoRedirect(old, '?fromJob=j1&out=0', '#h') /* a placed plugin: the run-time check */ : null); assert.ok(to?.startsWith(`${VIDEO_PAGE}?workflow=${w.id}`) && to.endsWith('&fromJob=j1&out=0#h'), `${old} → ${to}`);
}
assert.equal(videoRedirect('/camera-moves', ''), `${VIDEO_PAGE}?workflow=camera-moves&pick=move`, 'the Camera Moves gallery opens the move picker');
assert.equal(videoRedirect('/camera-moves/', '?x=1', '#h'), `${VIDEO_PAGE}?workflow=camera-moves&pick=move&x=1#h`);
assert.equal(videoRedirect('/camera-moves/orbit-r', '?fromJob=j2'), `${VIDEO_PAGE}?workflow=camera-moves&preset=orbit-r&fromJob=j2`, 'a move page picks that move');
assert.equal(videoRedirect('/photo-fx', ''), `${VIDEO_PAGE}?workflow=photo-fx&pick=effect`); assert.equal(videoRedirect('/photo-fx/shatter', ''), `${VIDEO_PAGE}?workflow=photo-fx&preset=shatter`);
assert.equal(videoRedirect('/photo-fxx', ''), null); assert.equal(videoRedirect('/camera-moves/a/b', ''), null, 'deeper paths are not a gallery');
assert.equal(VIDEO_REDIRECTS['/tools/edit-video'], `${VIDEO_PAGE}?workflow=edit-video`, 'the old Edit Video list opens the picker (its Edit tab)');
for (const g of ['camera-moves', 'photo-fx']) { const pick = new URLSearchParams(videoRedirect(`/${g}`, '')!.split('?')[1]).get('pick')!; assert.ok(VIDEO_BARS[g].groups.some((x: any) => x.id === pick), `${g}: pick=${pick} is a bar group`); }
ok('old pages, galleries and the Edit Video list redirect to the Video page, query + hash kept');

// 4. links skip the hop, Recreate and hand-offs reopen the workflow, and the page asks the server about the workflow's own tool
for (const w of VIDEO_WORKFLOWS.filter((x) => x.toolId && !x.params && x.id !== 'create')) {
  assert.equal(toolOpenHref({ id: w.toolId, route: `/tools/${w.toolId}` }), videoWorkflowHref(w.id), `${w.toolId}: opens its workflow`);
  assert.equal(workflowRecreateHref({ id: 'j9', toolId: w.toolId }), `${videoWorkflowHref(w.id)}&recreate=j9`, `${w.toolId}: Recreate reopens the workflow`);
  assert.equal(pageToolId(VIDEO_PAGE, `?workflow=${w.id}&fromJob=j1`), w.toolId, `${w.id}: a hand-off asks for ${w.toolId}'s slot`);
}
assert.equal(toolHandoffHref({ id: 'h3-extend' }, 'fromJob=j1&out=0&ext=10'), `${VIDEO_PAGE}?workflow=extend&fromJob=j1&out=0&ext=10`);
assert.equal(videoWorkflowOfJob({ toolId: 'voice', input: { types: '["lipsync"]' } }), 'lip-sync'); assert.equal(videoWorkflowOfJob({ toolId: 'voice', input: { types: ['voiceover'] } }), null);
assert.equal(workflowRecreateHref({ id: 'j3', toolId: 'voice', input: { types: ['lipsync'] } }), `${VIDEO_PAGE}?workflow=lip-sync&mode=lipsync&recreate=j3`);
assert.equal(workflowRecreateHref({ id: 'j4', toolId: 'h3-video' }), null, 'Create Video keeps its own ?recreate=');
assert.equal(workflowRecreateHref({ id: 'j5', toolId: 'app-relight' }), '/image?workflow=relight&recreate=j5', 'image workflows unchanged');
assert.equal(pageToolId(VIDEO_PAGE, ''), 'h3-video'); assert.equal(pageToolId(VIDEO_PAGE, '?workflow=lip-sync&mode=lipsync'), 'voice'); assert.equal(pageToolId(VIDEO_PAGE, '?workflow=nope'), 'h3-video');
assert.equal(pageToolId('/image', '?workflow=relight'), 'create-image', 'other pages: the path');
assert.equal(withSearch(videoWorkflowHref('restyle'), 'preset=anime-cel'), `${VIDEO_PAGE}?workflow=restyle&preset=anime-cel`, 'a query-shaped route joins with &');
ok('open, hand-off and Recreate links go straight to the workflow; hand-offs ask for the workflow tool’s slot');

// 5. the separate pages are gone and nothing renders them
for (const f of ['ui/camera/CameraGallery.tsx', 'ui/edit/EditVideo.tsx', 'tools/edit/EditTool.tsx', 'tools/upscale/UpscaleTool.tsx']) assert.ok(!fs.existsSync(path.join(WEB, f)), `${f} removed`);
const app = fs.readFileSync(path.join(WEB, 'App.tsx'), 'utf8');
assert.match(app, /videoBarOf\(vwf\.id\)/, 'App renders a picked workflow with a recipe in the Video bar');
assert.doesNotMatch(app, /CameraGallery|EditVideoHub|'\/camera-moves'|'\/photo-fx'/, 'no gallery or hub routes');
assert.match(fs.readFileSync(path.join(WEB, 'ui/video/VideoStudio.tsx'), 'utf8'), /videoWorkflowHref\('camera-moves'\)}&pick=move/, 'Look → See all opens Camera Moves in the bar');
ok('the galleries, the Edit Video list and the old edit screens are gone');

// 6. step 3: Object Swap, Re-shoot and UGC Ad in the same bar, sending what their old screens sent (dry runs, 2026-10-25: same fields, same price)
assert.doesNotMatch(app, /VwfComp/, 'no workflow renders a screen of its own on the Video page');
const vbar = fs.readFileSync(path.join(WEB, 'ui/video/VideoWorkflowBar.tsx'), 'utf8');
for (const [wid, comp] of Object.entries(EXTRAS)) { assert.match(vbar, new RegExp(`'?${wid}'?: use${comp}`), `${wid}: its extra step is registered in the bar`);
  const src = fs.readFileSync(path.join(WEB, `ui/video/barExtras/${comp}.tsx`), 'utf8'); assert.match(src, /BarPopover/, `${wid}: the extra step is a popover in the bar, not a page`); assert.doesNotMatch(src, /navigate\(/, `${wid}: no page change`); }
{ const b = VIDEO_BARS['object-swap']; assert.equal(b.fixed?.mode, 'object_swap'); assert.deepEqual(b.controls.find((c: any) => c.field === 'swapType')?.options.map((o: any) => o.value), ['person', 'object']);
  assert.ok(b.controls.find((c: any) => c.field === 'preset')?.optional, 'Object Swap: the preset is optional');
  const os = fs.readFileSync(path.join(WEB, 'ui/video/barExtras/ObjectSwapExtra.tsx'), 'utf8');
  for (const f of ['maskMode', 'maskPrompt', 'maskGrow', 'point', 'matte', 'target', 'passes']) assert.ok(os.includes(f), `Object Swap sends ${f} as before`);
  assert.match(os, /ObjectMask/, 'Object Swap keeps the old mask step (name it, click it, mask clip, free preview)'); }
{ const b = VIDEO_BARS.reshoot; assert.equal(b.slots[0].altImage, 'sourceImage', 'Re-shoot: the take slot takes a photo too');
  for (const f of ['fullClip', 'angleCount', 'seconds', 'resolution', 'generateAudio']) assert.ok(b.controls.some((c: any) => c.field === f), `Re-shoot: ${f} in the bar`);
  assert.ok(b.controls.find((c: any) => c.field === 'generateAudio')?.omitOff, 'Re-shoot: Seedance sound is only sent when on, as before');
  const rs = fs.readFileSync(path.join(WEB, 'ui/video/barExtras/ReshootExtra.tsx'), 'utf8');
  for (const f of ['angles', 'passes', 'sourceImage', 'refVideoSeconds', 'angleCount', 'OrbitPad', 'AngleTimeline']) assert.ok(rs.includes(f), `Re-shoot keeps ${f}`); }
{ const b = VIDEO_BARS['ugc-ad']; assert.equal(b.fixed?.types, '["t2v"]'); assert.deepEqual(b.typesWhenFile, { image: '["r2v"]', presenterImage: '["r2v"]' }, 'UGC Ad: a product or presenter photo runs as reference video');
  assert.equal(b.controls.find((c: any) => c.field === 'duration')?.default, '15', 'UGC Ad: 15 s by default, as before'); }
assert.match(vbar, /<SameSeed /, 'Same seed (the shared switch) is in the Video bar');
ok('Object Swap, Re-shoot and UGC Ad run in the same Video bar with their old fields; Same seed in the bar');
// Settings audit (2026-11-01): no hidden enhance. Transitions, Camera Moves and UGC Ad show the shared Enhance chip, on to start; Lip Sync sends only its mode
for (const id of ['transitions', 'camera-moves', 'ugc-ad']) { assert.equal(VIDEO_BARS[id].enhance, '1', `${id}: the Enhance chip starts on`); assert.equal(VIDEO_BARS[id].fixed?.enhance, undefined, `${id}: enhance is not a hidden fixed value`); }
assert.deepEqual(VIDEO_BARS['lip-sync'].fixed, { types: '["lipsync"]' }, 'Lip Sync: no hidden voice / language / mix / volume (the server defaults)');
assert.match(vbar, /<EnhanceChip /, 'the workflow bar uses the shared Enhance chip'); assert.match(vbar, /enhance: enhOn \? '1' : '0'/, 'Enhance off sends enhance=0');
ok('Enhance is a visible chip on Transitions, Camera Moves and UGC Ad; Lip Sync sends no hidden voice settings');
