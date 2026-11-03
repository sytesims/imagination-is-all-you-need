// Presets picker (shared/LookPicker.tsx) and every preset grid: each tile shows its OWN preview (shared/presetMedia.ts + PresetTile.tsx).
// A camera move plays its own clip (server/src/cameraPreview.ts → server/samples/camera/) or is drawn as an icon card (its move over a drawn
// scene); never a placeholder poster and never one shared stock photo. Also: the picker and its chip say "Presets", not "Look".
// Run: npx tsx test/preset-media.test.ts
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
await import('../src/tools/apps.ts'); const { listTools } = await import('../src/tools/registry.ts');
const { movePreview, SAME_MOVE_CLIP, CAMERA_PREVIEW_DIR } = await import('../src/cameraPreview.ts');
const { presetMedia } = await import('../../web/src/shared/presetMedia.ts');
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

const camera = (listTools() as any[]).find((t) => t.id === 'camera');
/* the Presets picker's Camera tab: every move but Free and the model-tied LoRA moves (VideoStudio camList) */
const picker = (camera.presets as any[]).filter((x) => x.id !== 'free' && !/^(ltx|h3)-/.test(x.id));
assert.ok(picker.length > 50, 'the Camera tab lists the catalogue moves');
const clips: string[] = [], cards: string[] = [];
for (const p of picker) {
  const listed = { ...p, ...(movePreview('camera', p.id) ?? {}), previewUrl: p.previewUrl ?? movePreview('camera', p.id)?.previewUrl ?? null }; // as GET /api/presets lists it
  const m = presetMedia(listed, { camera: true });
  assert.ok(m.video || m.image || m.motion, `${p.id}: has media`);
  if (p.posterPlaceholder) assert.ok(m.image !== p.posterUrl && m.video?.poster !== p.posterUrl, `${p.id}: a placeholder poster is never shown`);
  assert.ok(!/\/showcase\//.test(String(m.image ?? '')) && !/\/showcase\//.test(String(m.video?.poster ?? '')), `${p.id}: never a showcase stock photo`);
  if (m.video) { for (const u of [m.video.mp4, m.video.webm]) assert.ok(u && existsSync(path.join(CAMERA_PREVIEW_DIR, path.basename(u))), `${p.id}: clip ${u} exists`); clips.push(p.id); }
  else { assert.ok(m.motion?.id === p.id, `${p.id}: no clip → its own icon card`); cards.push(p.id); }
}
for (const [id, clip] of Object.entries(SAME_MOVE_CLIP)) assert.equal(movePreview('camera', id)?.previewUrl, `/samples/camera/${clip}.mp4`, `${id} reuses the same move's clip`);
for (const id of ['push-in', 'pan-left', 'orbit', 'track-left', 'jib-up']) assert.ok(clips.includes(id), `${id} plays its clip`);
assert.equal(movePreview('photo-fx', 'push-in'), null, 'clips are camera-only');
ok(`${clips.length} moves play their own clip, ${cards.length} are icon cards (${cards.join(', ')})`);

/* different moves never resolve to the same picture */
const pics = picker.map((p) => { const m = presetMedia({ ...p, ...(movePreview('camera', p.id) ?? {}) }, { camera: true }); return m.video?.mp4 ?? m.image ?? `card:${p.id}`; });
const dupes = pics.filter((x, i) => pics.indexOf(x) !== i && !Object.values(SAME_MOVE_CLIP).some((c) => x.includes(c)));
assert.deepEqual(dupes, [], 'no two moves share one preview');

/* the tile: no stock still to move over; the move is drawn (scene + glyph); clips load metadata only, smaller mp4 first */
const tile = read('web/src/shared/PresetTile.tsx');
assert.ok(!/MOTION_STILL|showcaseById|SHOWCASE_HERO/.test(tile), 'PresetTile has no shared stock photo');
assert.ok(/<Scene \/>/.test(tile) && /pt-mo-g/.test(tile), 'a move with no clip is an icon card: drawn scene + the move glyph');
assert.ok(/preload="metadata"/.test(tile) && /video!\.mp4 \|\| video!\.webm/.test(tile), 'clips: metadata only, the smaller mp4 first');
for (const f of ['web/src/ui/video/VideoStudio.tsx', 'web/src/ui/video/VideoWorkflowBar.tsx']) assert.ok(/presetMedia\(/.test(read(f)), `${f} uses the shared presetMedia`);
ok('one tile, one media rule; no stock photo');

/* the name: Presets */
const vs = read('web/src/ui/video/VideoStudio.tsx'), look = read('web/src/shared/LookPicker.tsx');
assert.ok(/label="Presets" testId="vs-look"/.test(vs) && /<b>Presets<\/b>/.test(vs) && !/<b>Look<\/b>/.test(vs), 'Video: the chip and the panel say Presets');
assert.ok(/label = 'Presets'/.test(look), 'the shared picker defaults to Presets');
const ic = read('web/src/ui/next/ImageCanvas.tsx');
assert.ok(/<small>Preset<\/small>/.test(ic) && /label="Presets"><div className="ic-pop-style/.test(ic) && !/Search looks/.test(ic), 'Image: the preset chip and its panel say Preset(s)');
ok('Look is now Presets on Video and Image');
