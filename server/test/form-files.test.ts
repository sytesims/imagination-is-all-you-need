// Submit bodies with files that can't be read any more (web/src/shared/formFiles.ts, 2026-10-27): Video → LTX-2.5 Pro with a start image
// failed as "Can't reach the server" because the browser cut the upload (API: aborted / ECONNRESET) and the client retried the same dead file.
// Run: npx tsx test/form-files.test.ts   (no server, no DOM)
import assert from 'node:assert/strict';
import { probeFormFiles, blobReadable, materializeFile, FILE_UNREADABLE, unreadableMessage } from '../../web/src/shared/formFiles.ts';
const ok = (m: string) => console.log('ok ' + m);

/** A File whose bytes are gone: every read rejects like a dropped IndexedDB blob / a file changed on disk (NotReadableError). */
const deadFile = (name: string, size = 22848) => ({ name, size, type: 'image/png', slice: () => ({ arrayBuffer: () => Promise.reject(Object.assign(new Error('The requested file could not be read'), { name: 'NotReadableError' })) }) });

{ const fd = new FormData(); fd.append('types', '["i2v"]'); fd.append('image', new File([new Uint8Array(4000)], 'start.png', { type: 'image/png' })); fd.append('lastFrame', new File([], 'empty.png'));
  await probeFormFiles(fd); ok('readable files (and an empty one) pass'); }

{ const fd = { forEach: (cb: (v: any, k: string) => void) => { cb('["i2v"]', 'types'); cb('6', 'duration'); cb(deadFile('start.png'), 'image'); } };
  await assert.rejects(probeFormFiles(fd), (e: any) => { assert.equal(e.code, FILE_UNREADABLE); assert.equal(e.errorType, 'validation'); assert.equal(e.charged, false);
    assert.equal(e.issues[0].field, 'image'); assert.match(e.message, /start image \(start\.png\) can’t be read any more/); assert.doesNotMatch(e.message, /reach the server/); return true; });
  ok('an unreadable start image throws file_unreadable on field image, never a network error'); }

{ const fd = { forEach: (cb: (v: any, k: string) => void) => { cb(new File([new Uint8Array(10)], 'a.png'), 'image'); cb(deadFile('end.png'), 'lastFrame'); } };
  await assert.rejects(probeFormFiles(fd), (e: any) => e.issues[0].field === 'lastFrame' && /end image/.test(e.message)); ok('names the field of the dead file (end frame)'); }

{ // only the last byte is gone (a file truncated on disk after it was picked)
  const half = { name: 'x.png', size: 10, slice: (a = 0) => ({ arrayBuffer: () => a >= 9 ? Promise.reject(new Error('gone')) : Promise.resolve(new ArrayBuffer(1)) }) };
  assert.equal(await blobReadable(half), false); ok('a file whose tail can’t be read is unreadable'); }

{ const src = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }); const f = await materializeFile(src, 'd.png', 'image/png', 1234);
  assert.ok(f instanceof File); assert.equal(f!.name, 'd.png'); assert.equal(f!.type, 'image/png'); assert.equal(f!.lastModified, 1234); assert.deepEqual([...new Uint8Array(await f!.arrayBuffer())], [1, 2, 3, 4]);
  const gone = { size: 5, arrayBuffer: () => Promise.reject(new Error('gone')) } as unknown as Blob; assert.equal(await materializeFile(gone, 'g.png', 'image/png'), null);
  ok('a restored draft is copied into memory; a dead stored copy restores as nothing'); }

assert.match(unreadableMessage('refs', ''), /^Your reference image can’t be read/); assert.match(unreadableMessage('weird', 'q.bin'), /^Your file \(q\.bin\)/); ok('plain labels per field');
console.log('form-files: all ok');
