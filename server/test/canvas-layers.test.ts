// Image to layers on the board (B10, 2026-10-31): a layered job is ONE take (the composite) holding its layers, like the Image page's
// "13 layers", never 13 versions to pick from. Run: npx tsx test/canvas-layers.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { takesOf, layerTakeOf, layersLine, addVersions } from '../../web/src/canvas/cardModel.ts';

const layered = (n: number, poster: string | null = '/files/lay-poster.png') => ({ id: 'job1', status: 'done', input: { layers: true, prompt: `${n} layers` }, layersPosterUrl: poster, resultUrl: '/files/l0.png',
  outputs: Array.from({ length: n }, (_, k) => ({ url: `/files/l${k}.png`, label: k === 3 ? '  Sun ' : '' })) }) as any;

const t13 = takesOf(layered(13));
assert.equal(t13.length, 1);
assert.equal(t13[0].url, '/files/lay-poster.png'); assert.equal(t13[0].kind, 'image');
assert.equal(t13[0].layers!.length, 13);
assert.deepEqual(t13[0].layers!.slice(0, 4).map(l => l.label), ['Background', 'Layer 1', 'Layer 2', 'Sun']);
assert.equal(layersLine(t13[0]), '13 layers');
// no composite yet: the top layer stands for the picture
assert.equal(takesOf(layered(3, null))[0].url, '/files/l2.png');
// a second run joins as a second version, each keeping its own layers
const v = addVersions(t13, takesOf({ ...layered(2, '/files/p2.png'), id: 'job2' }));
assert.equal(v.takes.length, 2); assert.equal(v.takes[1].layers!.length, 2);
// not layered (a 4-picture batch, or one "layer" only): one take per output, no layers line
const batch = { id: 'b', status: 'done', input: {}, outputs: [1, 2, 3, 4].map(k => ({ url: `/files/b${k}.png` })) } as any;
assert.equal(takesOf(batch).length, 4); assert.equal(layersLine(takesOf(batch)[0]), null);
assert.equal(layerTakeOf(layered(1)), null);
console.log('canvas layers: ok');
