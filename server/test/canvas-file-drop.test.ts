// Canvas file drops (B2, 2026-10-31): files dropped on a generate card fill its slots in order; the rest say why or become Upload nodes.
// Run: npx tsx test/canvas-file-drop.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { planFileDrop, mediaPoster, uploadedInput, type DropSlot } from '../../web/src/canvas/fileDrop.ts';

const lipSync: DropSlot[] = [{ name: 'image', label: 'Portrait', accept: 'image', max: 1 }, { name: 'audio', label: 'Speech', accept: 'audio', max: 1 }];
const png = { name: 'face.png', type: 'image/png' }, mp3 = { name: 'talk.mp3', type: 'audio/mpeg' }, mp4 = { name: 'clip.mp4', type: 'video/mp4' };

// a picture fills Portrait, an mp3 fills Speech (audio is accepted, not only pictures); a file with no type goes by its name
assert.deepEqual(planFileDrop([png], lipSync).fills, [{ file: 0, slot: 'image', kind: 'image' }]);
assert.deepEqual(planFileDrop([mp3], lipSync).fills, [{ file: 0, slot: 'audio', kind: 'audio' }]);
assert.deepEqual(planFileDrop([{ name: 'talk.m4a', type: '' }], lipSync).fills, [{ file: 0, slot: 'audio', kind: 'audio' }]);
// several at once, in order: each slot once, the extra picture is left over (an Upload node), not dropped
const three = planFileDrop([png, mp3, { name: 'b.jpg', type: 'image/jpeg' }], lipSync);
assert.deepEqual(three.fills.map(f => f.slot), ['image', 'audio']);
assert.deepEqual(three.rest.map(r => [r.file, r.kind]), [[2, 'image']]);
assert.match(three.rest[0].why, /^Portrait is full/);
// already filled slots count: a full Portrait says so
assert.match(planFileDrop([png], lipSync, { image: 1 }).rest[0].why, /Portrait is full\. Remove one to use face\.png/);
// a clip on a picture-only card: the picker's wrong-type line
const pic: DropSlot[] = [{ name: 'image', label: 'Picture', accept: 'image', max: 4 }];
const v = planFileDrop([mp4], pic); assert.equal(v.fills.length, 0); assert.equal(v.rest[0].kind, 'video');
assert.equal(v.rest[0].why, 'clip.mp4 can’t be used here. This takes PNG, JPG or WebP pictures.');
// the first EMPTY slot of the kind wins over one that still has room
const two: DropSlot[] = [{ name: 'refs', label: 'References', accept: 'image', max: 4 }, { name: 'start', label: 'Start frame', accept: 'image', max: 1 }];
assert.equal(planFileDrop([png], two, { refs: 1 }).fills[0].slot, 'start');
assert.deepEqual(planFileDrop([png, png, png], two).fills.map(f => f.slot), ['refs', 'start', 'refs']);
// no card (empty board): every media file is left over for an Upload node; a file nothing takes has kind null and a reason
const loose = planFileDrop([png, mp4, { name: 'doc.pdf', type: 'application/pdf' }], []);
assert.deepEqual(loose.rest.map(r => r.kind), ['image', 'video', null]); assert.match(loose.rest[2].why, /^doc\.pdf can’t be used here/);
// posters and unique keys
assert.equal(mediaPoster('image', '/files/a.png'), '/files/a.png'); assert.equal(mediaPoster('audio', '/files/a.mp3'), '');
assert.equal(mediaPoster('video', '/files/a b.mp4'), '/api/media/thumb?url=%2Ffiles%2Fa%20b.mp4');
const keys = new Set(Array.from({ length: 20 }, () => uploadedInput('image', '/files/a.png', 'a').key)); assert.equal(keys.size, 20);
console.log('ok canvas file drop: slots fill in order, audio and clips count, full / wrong-type say why, the rest become uploads');
process.exit(0);
