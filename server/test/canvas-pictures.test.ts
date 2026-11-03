// Canvas pictures (2026-11-03, shared/canvasPictures.ts): the names dropped / attached pictures get, what the dock takes, and how the agent reads them.
// Run: cd server && npx tsx test/canvas-pictures.test.ts   (pure, no server)
import assert from 'node:assert/strict';
import { pictureName, uploadNodeName, uploadNodeSummary, planDockPictures, pictureLines, MAX_DOCK_PICTURES } from '../src/shared/canvasPictures.js';
const ok = (m: string) => console.log('ok ' + m);

assert.equal(pictureName('chair.png'), 'chair'); assert.equal(pictureName('Velvet_swatch 02.JPEG'), 'Velvet swatch 02'); assert.equal(pictureName('a.b.webp'), 'a.b');
assert.equal(pictureName('C:\\pics\\lamp.jpg'), 'lamp'); assert.equal(pictureName(''), 'Picture'); assert.equal(pictureName('.png', 'Upload'), 'Upload'); assert.equal(pictureName('x'.repeat(90) + '.png').length, 60);
ok('pictureName: no folder, no extension, tidy, never empty');

assert.equal(uploadNodeName({ meta: { name: ' Hero ' }, props: { label: 'lamp.png' } }), 'Hero');
assert.equal(uploadNodeName({ meta: {}, props: { label: 'old sofa.jpg' } }), 'old sofa'); assert.equal(uploadNodeName({ props: {} }), null);
assert.deepEqual(uploadNodeSummary({ id: 'shape:a', meta: {}, props: { url: '/files/a.png', mediaKind: 'image', label: 'chair.png', poster: '/files/a.png' } }),
  { id: 'shape:a', type: 'upload', kind: 'image', name: 'chair', title: 'chair', results: [{ url: '/files/a.png', kind: 'image', poster: '/files/a.png' }] });
assert.equal(uploadNodeSummary({ id: 'shape:b', props: { url: '' } }), null);
assert.equal(uploadNodeSummary({ id: 'shape:c', props: { url: '/files/c.png', mediaKind: 'image' } })!.title, 'Picture');
ok('Upload nodes: own name first, else the file name; summary carries name, kind and file');

const f = (name: string, type = 'image/png', size = 1000) => ({ name, type, size });
assert.deepEqual(planDockPictures([f('a.png'), f('b.jpg', 'image/jpeg'), f('c.webp', 'image/webp')]), { take: [0, 1, 2], refused: [] });
const wrong = planDockPictures([f('doc.pdf', 'application/pdf'), f('clip.mp4', 'video/mp4'), f('a.heic', 'image/heic')]);
assert.deepEqual(wrong.take, []); assert.equal(wrong.refused.length, 3); assert.match(wrong.refused[0].why, /doc\.pdf can’t be used here\. This takes PNG, JPG or WebP pictures\./);
const big = planDockPictures([f('huge.png', 'image/png', 300 * 1024 * 1024)]); assert.deepEqual(big.take, []); assert.match(big.refused[0].why, /too big/);
const many = planDockPictures(Array.from({ length: 8 }, (_, i) => f(`p${i}.png`)), 2); assert.equal(many.take.length, MAX_DOCK_PICTURES - 2); assert.equal(many.refused.length, 4); assert.match(many.refused[0].why, /Up to 6/);
assert.deepEqual(planDockPictures([f('a.png')], MAX_DOCK_PICTURES).take, []);
assert.deepEqual(planDockPictures([{ name: 'nameonly.jpg' }]).take, [0], 'no type: judged by name');
ok('planDockPictures: pictures only, size limit, up to 6 per message, says why');

assert.deepEqual(pictureLines([{ card_id: 'shape:1', name: 'chair', url: '/f/1' }, { card_id: 'shape:2', name: 'swatch', url: '/f/2' }]), ['image 1: chair (card shape:1)', 'image 2: swatch (card shape:2)']);
assert.deepEqual(pictureLines(undefined), []);
ok('pictureLines: in order, with card ids');
console.log('canvas-pictures: all ok');
