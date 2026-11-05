// Presets picker (shared/LookPicker.tsx) and every preset grid: each tile shows its OWN preview (shared/presetMedia.ts + PresetTile.tsx).
// Camera moves: one card style for all, the move's own line icon (shared/moveIcons.tsx); never a clip, a placeholder still or a stock photo.
// Also: the picker and its chip say "Presets", not "Look".
// Run: npx tsx test/preset-media.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
await import('../src/tools/apps.ts'); const { listTools } = await import('../src/tools/registry.ts');
const { presetMedia } = await import('../../web/src/shared/presetMedia.ts');
(globalThis as any).React = (await import('react')).default; // the server's tsx compiles JSX the classic way
const { MOVE_ICONS } = await import('../../web/src/shared/moveIcons.tsx');
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

const camera = (listTools() as any[]).find((t) => t.id === 'camera');
/* the Presets picker's Camera tab: every move but Free and the model-tied LoRA moves (VideoStudio camList) */
const picker = (camera.presets as any[]).filter((x) => x.id !== 'free' && !/^(ltx|h3)-/.test(x.id));
assert.ok(picker.length > 50, 'the Camera tab lists the catalogue moves');
for (const p of picker) {
  const m = presetMedia({ ...p, previewUrl: `/samples/camera/${p.id}.mp4`, previewWebm: `/samples/camera/${p.id}.webm` }, { camera: true });
  assert.ok(!m.video && !m.image, `${p.id}: no clip, no still (no diagram clips, no placeholder, no stock photo)`);
  assert.equal(m.motion?.id, p.id, `${p.id}: its own move card`);
  assert.ok(MOVE_ICONS[p.id], `${p.id}: has its own icon`);
}
const drawn = picker.map((p) => renderToStaticMarkup(MOVE_ICONS[p.id].draw as any));
const same = picker.filter((p, i) => drawn.indexOf(drawn[i]) !== i).map((p) => p.id);
assert.deepEqual(same, [], 'no two moves share one drawing');
ok(`${picker.length} camera moves, each its own icon card`);

/* the tile: no stock still, no scene; one card for moves */
const tile = read('web/src/shared/PresetTile.tsx');
assert.ok(!/MOTION_STILL|showcaseById|SHOWCASE_HERO|<Scene/.test(tile), 'PresetTile has no shared stock photo or drawn scene');
assert.ok(/<MoveCard /.test(tile) && /moveIconFor\(/.test(tile), 'a camera move is the MoveCard with its own icon');
for (const f of ['web/src/ui/video/VideoStudio.tsx', 'web/src/ui/video/VideoWorkflowBar.tsx']) assert.ok(/presetMedia\(/.test(read(f)), `${f} uses the shared presetMedia`);
/* other presets keep their own art */
assert.deepEqual(presetMedia({ id: 'x', posterUrl: '/a.jpg', previewWebm: '/a.webm' }), { video: { mp4: null, webm: '/a.webm', poster: '/a.jpg' }, image: '/a.jpg', motion: null });
assert.equal(presetMedia({ id: 'x', posterUrl: '/p.jpg', posterPlaceholder: true }).image, null, 'a placeholder poster never shows');
ok('one tile, one media rule; no stock photo');

/* the name: Presets */
const vs = read('web/src/ui/video/VideoStudio.tsx'), look = read('web/src/shared/LookPicker.tsx');
assert.ok(/label="Presets" testId="vs-look"/.test(vs) && /<b>Presets<\/b>/.test(vs) && !/<b>Look<\/b>/.test(vs), 'Video: the chip and the panel say Presets');
assert.ok(/label = 'Presets'/.test(look), 'the shared picker defaults to Presets');
const ic = read('web/src/ui/next/ImageCanvas.tsx');
assert.ok(/<small>Preset<\/small>/.test(ic) && /label="Presets"><div className="ic-pop-style/.test(ic) && !/Search looks/.test(ic), 'Image: the preset chip and its panel say Preset(s)');
ok('Look is now Presets on Video and Image');
