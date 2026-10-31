// Canvas "Made from": the inputs a run sends, in slot order, kept on each new version (cardModel.madeFromOf / withFrom).
// Run: npx tsx test/canvas-made-from.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { madeFromOf, withFrom, addVersions, type BoardInput, type Take } from '../../web/src/canvas/cardModel.ts';

const slots = [{ name: 'image', label: 'Portrait' }, { name: 'audio', label: 'Speech' }];
const pic: BoardInput = { key: 'u:1', kind: 'image', url: '/files/a.png', poster: '/files/a.png', jobId: '', label: 'a.png' };
const arrow: BoardInput = { key: 'shape:x', kind: 'audio', url: '/files/s.mp3', poster: '', jobId: 'j0', label: 'Speech v1', shapeId: 'shape:x', arrowId: 'shape:arr' };

// slot order (not input order), chip inputs and arrow inputs alike; only arrow inputs carry a card to jump to
const from = madeFromOf(slots, { audio: [arrow], image: [pic] });
assert.deepEqual(from, [
  { slot: 'Portrait', kind: 'image', label: 'a.png', poster: '/files/a.png', url: '/files/a.png' },
  { slot: 'Speech', kind: 'audio', label: 'Speech v1', poster: '', url: '/files/s.mp3', shapeId: 'shape:x' }]);
assert.deepEqual(madeFromOf(slots, {}), [], 'nothing filled: nothing listed');
assert.deepEqual(madeFromOf([], { image: [pic] }), [], 'a slot that no longer exists is not listed');
console.log('ok madeFromOf: slot order, labels, jump only for arrow inputs');

// every new version keeps the list; none: the takes are untouched; old versions keep their own list
const t = (url: string): Take => ({ url, poster: url, kind: 'video', jobId: 'j1', out: 0 });
assert.equal(withFrom([t('/a.mp4')], []).at(0)?.from, undefined);
const fresh = withFrom([t('/b.mp4'), t('/c.mp4')], from);
assert.ok(fresh.every(x => x.from === from));
const old = { ...t('/a.mp4'), from: [from[0]] };
const v = addVersions([old], fresh);
assert.deepEqual(v.takes.map(x => x.from?.length), [1, 2, 2]); assert.equal(v.take, 1);
assert.deepEqual(JSON.parse(JSON.stringify(v.takes)), v.takes, 'JSON only (tldraw json props refuse undefined)');
console.log('ok withFrom: new versions keep their inputs, old ones keep theirs');
