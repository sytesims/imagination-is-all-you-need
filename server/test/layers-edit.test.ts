// Video to layers: changing a split (layers/edit.ts, editRender.ts, editTool.ts). Pure rules first, then one real ffmpeg render on tiny frames.
//  1. the spec: clamped, unknown layers dropped, texts tidied (4 at most), "behind" a layer that doesn't exist → in front.
//  2. stacking: texts just under the layer they sit behind, "in front" on top.
//  3. ffmpeg pieces: colour (hue / saturation / brightness ×), move + scale about the centre, the composite's overlay chain.
//  4. a real render: a moved, recoloured layer and a text behind it, over a clean background → composite, previews, layers.json, per-layer footage.
//  5. the tool: refuses a job that isn't a finished split; hidden from menus; free on this computer.
// Run: npx tsx test/layers-edit.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'layers-edit-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '' });
const ok = (m: string) => console.log('ok ' + m);
const E = await import('../src/layers/edit.ts'); const R = await import('../src/layers/editRender.ts'); const A = await import('../src/layers/assemble.ts');

// ---------------- 1. spec ----------------
{
  const s = E.normEdit(JSON.stringify({ layers: [{ id: 0, x: 9999, y: -10, scale: 9, hue: 400, saturation: -1, brightness: 1.5 }, { id: 7, x: 5 }],
    texts: [{ text: '  Hi   there ', font: 'nope', colour: 'red', size: 1000, x: -5, y: 50, slot: 3 }, { text: '', slot: 'front' }, ...Array(6).fill({ text: 'x', slot: 0 })] }), [0, 1], { width: 64, height: 36 });
  assert.deepEqual(s.layers, [{ id: 0, hidden: false, x: 64, y: -10, scale: 3, hue: 180, saturation: 0, brightness: 1.5 }]);
  assert.equal(s.texts.length, 3, 'four at most, empty ones dropped'); assert.deepEqual(s.texts[0], { text: 'Hi there', font: 'display', colour: '#ffffff', size: 240, x: 0, y: 36, slot: 'front' });
  assert.equal(s.texts[1].slot, 0); assert.throws(() => E.normEdit('{bad', [0], { width: 1, height: 1 }), /could not be read/);
  assert.equal(E.isChanged({ id: 0 }), false); assert.equal(E.isChanged({ id: 0, hidden: true }), true); assert.equal(E.isChanged({ id: 0, hue: 10 }), true);
  assert.equal(E.editSummary(s, { 0: 'woman' }), 'woman moved and scaled and recoloured, 3 texts');
  ok('spec: clamped, unknown layers dropped, texts tidied, a missing "behind" → in front, a plain summary');
}
// ---------------- 2. stacking ----------------
{
  assert.deepEqual(E.stackOrder([1, 0], [{ slot: 0 }, { slot: 'front' }, { slot: 1 }]),
    [{ kind: 'text', index: 2 }, { kind: 'layer', id: 1 }, { kind: 'text', index: 0 }, { kind: 'layer', id: 0 }, { kind: 'text', index: 1 }]);
  ok('stacking: a text sits just under the layer it is behind; in front = on top');
}
// ---------------- 3. ffmpeg pieces ----------------
{
  assert.equal(E.colourFilter({}), ''); assert.equal(E.colourFilter({ hue: 120, saturation: 1.4 }), 'hue=h=120:s=1.4');
  assert.match(E.colourFilter({ brightness: 1.1 }), /^lutrgb=r='clip\(val\*1\.1,0,255\)'/);
  assert.equal(E.placeFilter('[0:v]', {}, 64, 36, '[s]', 24, 'gray'), '[0:v]format=gray[s]', 'unchanged: no canvas');
  const f = E.placeFilter('[0:v]', { x: 10, y: -4, scale: 0.5 }, 64, 36, '[s]', 24, 'rgb24');
  assert.match(f, /scale=32:18/); assert.match(f, /overlay=26:5:shortest=1/, 'about the centre: (64-32)/2+10, (36-18)/2-4');
  const c = R.compositeArgs({ base: 'b.mp4', pairs: [{ src: 's0', matte: 'm0' }, { src: 's1', matte: 'm1' }], W: 64, H: 36, frames: 10, out: 'o.mp4' }).join(' ');
  assert.match(c, /\[b0\]\[l0\]overlay=shortest=1\[b1\];.*\[b1\]\[l1\]overlay=shortest=1\[b2\]/);
  ok('ffmpeg pieces: colour, move + scale about the centre, the overlay chain');
}
// ---------------- 4. a real render ----------------
{
  const fx = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
  const src = path.join(DATA, 'src.mp4'), bg = path.join(DATA, 'j1-background.mp4'); fx(['-f', 'lavfi', '-i', 'color=red:s=64x36:r=8:d=1', '-pix_fmt', 'yuv420p', src]);
  fx(['-f', 'lavfi', '-i', 'color=blue:s=64x36:r=8:d=1', '-pix_fmt', 'yuv420p', bg]);
  const w = A.workDir('j1'); fs.mkdirSync(w, { recursive: true });
  fx(['-f', 'lavfi', '-i', "color=black:s=64x36:r=8:d=1,format=gray,geq=lum='255*between(X\\,24\\,39)'", '-c:v', 'ffv1', '-pix_fmt', 'gray', path.join(w, 'matte0.mkv')]);
  const png = path.join(DATA, 't.png'); fx(['-f', 'lavfi', '-i', "color=white@0:s=64x36,format=rgba,geq=r=255:g=255:b=0:a='255*lt(Y\\,6)'", '-frames:v', '1', png]);
  const m: any = { jobId: 'j1', width: 64, height: 36, fps: 8, frames: 8, seconds: 1, layers: [{ id: 0, name: 'box', colour: '#fff', order: 0, depth: null, coverage: 1, previewUrl: '', matteUrl: '' }],
    background: { url: '/files/j1-background.mp4', seconds: 1, model: 'x', note: null }, depth: { url: null, bits: null, range: null, nearIs: 'white', model: null }, overviewUrl: '', sourceUrl: '/files/src.mp4', models: [], where: 'your-computer' };
  const spec = { layers: [{ id: 0, x: 16, y: 0, scale: 1, hue: 120, saturation: 1, brightness: 1 }], texts: [{ text: 'T', font: 'display', colour: '#ffff00', size: 12, x: 32, y: 3, slot: 0 as const }] };
  const finals = await R.renderEdit({ jobId: 'j2', from: { id: 'j1', m }, spec, textPngs: [png], textNames: ['Text “T”'] });
  assert.deepEqual(finals.map((f) => f.label), ['Your changes', 'box', 'Text “T”']);
  const px = (x: number, y: number) => { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', finals[0].file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']); const i = (y * 64 + x) * 3; return [b[i], b[i + 1], b[i + 2]]; };
  const [r1, g1, b1] = px(30, 20); assert.ok(b1 > 150 && r1 < 90, `where the box was: the clean background (blue) (${[r1, g1, b1]})`);
  const [r2, g2] = px(46, 20); assert.ok(g2 > 120 && r2 < 120, `moved 16 px right and recoloured red → green (${px(46, 20)})`);
  const [r3, g3, b3] = px(10, 2); assert.ok(r3 > 180 && g3 > 180 && b3 < 90, `the text over the background (${[r3, g3, b3]})`);
  const [, g4] = px(46, 2); assert.ok(g4 > 120 && px(46, 2)[2] < 120 && px(46, 2)[0] < 150, `the text behind the box: the box wins (${px(46, 2)})`);
  const man = JSON.parse(fs.readFileSync(A.manifestPath('j2'), 'utf8')); assert.deepEqual(man.layers.map((l: any) => [l.name, l.order]), [['Text “T”', 0], ['box', 1]]);
  assert.equal(man.layers[1].depth, null, 'a moved layer no longer matches the depth pass'); assert.ok(fs.existsSync(path.join(A.workDir('j2'), 'src0.mkv')) && fs.existsSync(path.join(A.workDir('j2'), 'matte100.mkv')));
  assert.equal(R.layerSource('j2', man, 0), path.join(A.workDir('j2'), 'src0.mkv'), 'the export reads each edited layer’s own footage');
  ok('a real render: background where the layer was, the moved green layer, a text behind it, layers.json and per-layer footage');
}
// ---------------- 5. the tool ----------------
{
  const { layersEditTool } = await import('../src/layers/editTool.ts');
  assert.equal(layersEditTool.listed, false); assert.deepEqual(layersEditTool.providers, ['local-layers-edit']);
  const r: any = await layersEditTool.parseInput({ layersJob: 'nope', edit: '{}' }, {}); assert.equal(r.issues[0].field, 'layersJob');
  ok('the tool: hidden, free on this computer, refuses a job that isn’t a finished split');
}
fs.rmSync(D, { recursive: true, force: true });
