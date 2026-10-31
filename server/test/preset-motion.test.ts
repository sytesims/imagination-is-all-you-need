// Camera-move previews (web/src/shared/presetMotion.ts + PresetTile.tsx) and the Video Look picker (shared/LookPicker.tsx, cameraMove on Generate Video): every Camera Moves preset id has a motion recipe
// (by id, else its category, else the default), and the shared tile prints the small line (category) once, in the caption only.
// Run: npx tsx test/preset-motion.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { MOTION_BY_ID, MOTION_BY_CATEGORY, DEFAULT_MOTION, motionFor } = await import('../../web/src/shared/presetMotion.ts');
await import('../src/tools/apps.ts'); const { listTools } = await import('../src/tools/registry.ts');
const ok = (m: string) => console.log('ok ' + m);

const camera = (listTools() as any[]).find((t) => t.id === 'camera');
assert.ok(camera?.presets?.length > 50, 'camera tool lists its presets');
const css = readFileSync(new URL('../../web/src/shared/presetTile.css', import.meta.url), 'utf8');
const missing: string[] = [];
for (const p of camera.presets as any[]) {
  const r = motionFor(p.id, p.category);
  assert.ok(r && r.move && r.glyph, `${p.id}: has a recipe`);
  assert.ok(css.includes(`.pt-mv-${r.move}`), `${p.id}: move ${r.move} has CSS`);
  if (!MOTION_BY_ID[p.id]) missing.push(p.id);
}
assert.deepEqual(missing, [], 'every camera preset id is mapped by id (not only by category or the default)');
ok(`${camera.presets.length} camera presets each have a motion recipe with CSS`);

for (const r of [...Object.values(MOTION_BY_CATEGORY), DEFAULT_MOTION]) assert.ok(css.includes(`.pt-mv-${r.move}`), `fallback ${r.move} has CSS`);
assert.deepEqual(motionFor('not-a-preset', 'Orbit'), MOTION_BY_CATEGORY.orbit, 'unknown id → its category');
assert.deepEqual(motionFor('not-a-preset', 'Nope'), DEFAULT_MOTION, 'unknown id and category → the default');
assert.deepEqual(motionFor(undefined, null), DEFAULT_MOTION, 'nothing → the default');
ok('unknown ids fall back to the category, then the default');

// the shared tile prints its small line (category) once, in the caption; the Video page has no per-grid fallback with the category inside the box
const tile = readFileSync(new URL('../../web/src/shared/PresetTile.tsx', import.meta.url), 'utf8');
assert.equal(tile.match(/\{sub\}/g)?.length, 1, 'PresetTile renders `sub` once');
assert.ok(!/<small>\{(?!sub)/.test(tile), 'no other <small> text in the tile');
const vs = readFileSync(new URL('../../web/src/ui/video/VideoStudio.tsx', import.meta.url), 'utf8');
const look = readFileSync(new URL('../../web/src/shared/LookPicker.tsx', import.meta.url), 'utf8');
assert.ok(!vs.includes('cg-blank'), 'Video page: no blank fallback with the category inside');
assert.ok(!/className="vs-ptile[^"]*"\s+(onClick|title)/.test(vs), 'Video page: no hand-made preset tiles');
assert.ok(/<LookPicker /.test(vs) && !/<PresetTile /.test(vs), 'Video page: Look uses the shared LookPicker (no grid of its own)');
assert.ok(/<PresetTile [^>]*size="compact"/.test(look), 'LookPicker tiles are the shared PresetTile, compact size');
assert.ok(/size\?: 'default' \| 'compact'/.test(tile) && /compact \? hover/.test(tile), 'PresetTile compact: a prop on the one tile, plays on hover only');
ok('the category shows once; Look is the shared LookPicker with compact shared tiles');

// Look: no full-screen overlay, no workflow-switching tiles; a camera tile sets the move on THIS run (no navigation)
assert.ok(!vs.includes('className="vs-ov"') && !vs.includes("setOverlay("), 'no full-screen overlay on the Video page');
const tabsSrc = vs.slice(vs.indexOf('const lookTabs: LookTab[]'), vs.indexOf('const hosted = useHostedVideoFeed(')); /* up to the render (One Video feed, 2026-10-26) */
assert.ok(tabsSrc.length > 200, 'Look tabs found');
for (const bad of ['pickVideoWorkflow', 'vs-more-', 'Switches the workflow', 'MORE.map', 'workflow=']) assert.ok(!tabsSrc.includes(bad) && !look.includes(bad), `Look has no workflow-switching tiles (${bad})`);
assert.ok(!/\bconst MORE\b/.test(vs), 'the MORE workflow list is gone');
assert.deepEqual([...tabsSrc.matchAll(/\{ id: '(\w+)', label: '(\w+)'/g)].map((m) => m[2]), ['Camera', 'Style', 'Mode'], 'tabs: Camera · Style · Mode');
const camTab = tabsSrc.slice(tabsSrc.indexOf("{ id: 'camera', label"), tabsSrc.indexOf("{ id: 'style', label"));
assert.ok(/onPick: \(\) => pickLook\(\(\) => \{ if \(camFollows\) p\.setFv\('cameraMove', x\.id\)/.test(camTab), 'a camera tile sets fv.cameraMove on this run');
assert.equal((camTab.match(/navigate\(/g) ?? []).length, 1, 'the only navigation in Camera is the explicit "Use Camera Moves instead" button');
assert.ok(/data-testid="vs-look-use-camera"[^>]*onClick=\{\(\) => \{ closePop\(\); navigate\(/.test(camTab), '…which is that button');
assert.ok(!look.includes('navigate('), 'LookPicker itself never navigates');
ok('Look: Camera · Style · Mode, no workflow tiles, a camera pick stays on the page');

// the server: Generate Video with cameraMove puts the Camera Moves preset phrase first (the Camera Moves rule), same as a Camera Moves job
await import('../src/tools/h3/index.ts');
const { cameraMovePrompt, moveFirst, cameraApp } = await import('../src/tools/apps.ts');
const h3 = (listTools() as any[]).find((t) => t.id === 'h3-video');
const pull = (camera.presets as any[]).find((x) => x.id === 'pull-out');
assert.equal(cameraMovePrompt('pull-out'), pull.prompt, 'the phrase comes from the Camera Moves preset list');
assert.equal(cameraMovePrompt('pull-slow'), pull.prompt, 'a folded near-duplicate id (2026-10-27) runs the kept move');
assert.equal(cameraMovePrompt('pan-l'), cameraMovePrompt('pan-left'), 'old ids map like Camera Moves');
assert.equal(cameraMovePrompt('free'), '', 'Free camera adds nothing'); assert.equal(cameraMovePrompt('nope'), null, 'not a move → null');
const base = { types: JSON.stringify(['t2v']), prompt: 'A lighthouse on a cliff at dusk', provider: 'router-seedance', duration: '5' };
const r: any = await h3.parseInput({ ...base, cameraMove: 'pull-slow' }, {});
assert.ok(!r.error, String(r.error)); assert.equal(r.cameraMove, 'pull-out', 'the old id is stored as the kept move');
assert.ok(r.finalPrompt.startsWith(`${pull.prompt}. A lighthouse on a cliff at dusk`), `move phrase first: ${r.finalPrompt}`);
assert.equal(r.prompt, 'A lighthouse on a cliff at dusk', 'the typed prompt is kept as written');
const r0: any = await h3.parseInput(base, {}); assert.ok(!r0.cameraMove && !r0.finalPrompt.includes(pull.prompt), 'no move → prompt untouched');
const rf: any = await h3.parseInput({ ...base, cameraMove: 'free' }, {}); assert.equal(rf.finalPrompt, r0.finalPrompt, 'free → unchanged');
const rb: any = await h3.parseInput({ ...base, cameraMove: '<script>' }, {}); assert.equal(rb.issues?.[0]?.code, 'unknown_move'); assert.ok(!String(rb.error).includes('<script>'), 'the raw value is never echoed');
const rc: any = await cameraApp.parseInput({ types: JSON.stringify(['pull-slow']), prompt: 'A lighthouse on a cliff at dusk', provider: 'router-seedance', duration: '5', enhance: '0' }, { image: [] } as any);
assert.equal(rc.finalPrompt, moveFirst(pull.prompt, 'A lighthouse on a cliff at dusk'), 'Camera Moves jobs use the same rule');
assert.equal(r.finalPrompt, rc.finalPrompt, 'same words as the Camera Moves workflow for the same move and prompt');
ok('cameraMove on Generate Video: the Camera Moves phrase first; unknown → 400 unknown_move; same rule as Camera Moves');

// the explicit "Use Camera Moves instead" target is still the Camera Moves workflow on the Video page
const { toolHandoffHref } = await import('../../web/src/shared/workflowLinks.ts');
assert.equal(toolHandoffHref({ id: 'camera' }, 'preset=orbit-r'), '/video?workflow=camera-moves&preset=orbit-r');
ok('Use Camera Moves instead → /video?workflow=camera-moves&preset=<id>');
