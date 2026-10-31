// Create Video, Reference mode with pictures and no start frame (2026-10-31, many references): "+ → References" fills only the bar's
// picture references, and Generate said "Add a reference" because the bar wanted the start frame. The server already takes the first picture
// reference as picture 1 (files.image ?? files.refs[0]), so the bar now counts them (web/src/tools/app/AppTool.tsx refPics). This pins the
// server half: refs only → a valid Reference-mode job whose picture 1 is the first ref and that sends every ref; no picture at all still asks.
// Run: npx tsx test/video-refs-picture.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vrefpic-')); process.env.OPENHIGGSFIELD_DATA_DIR = D;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const refs = ['r1.png', 'r2.png', 'r3.png']; for (const f of refs) fs.writeFileSync(path.join(D, f), PNG);
const { h3VideoTool } = await import('../src/tools/h3/index.js').then(() => import('../src/tools/media.js'));
try {
  const r: any = await h3VideoTool.parseInput({ types: '["r2v"]', prompt: 'a dancer in the style of @image2', provider: 'router-seedance', duration: '5' }, { refs });
  assert.ok(!r.error, r.error); assert.equal(r.mode, 'r2v');
  assert.equal(r.imagePath, path.join(D, 'r1.png'), 'picture 1 is the first reference');
  assert.deepEqual(r.refPaths, refs.map(f => path.join(D, f)), 'every picture reference is sent');
  const clip = 'c1.mp4'; fs.writeFileSync(path.join(D, clip), Buffer.alloc(0));
  const m: any = await h3VideoTool.parseInput({ types: '["r2v"]', prompt: 'move like @video1', provider: 'router-seedance', duration: '5' }, { refs, refVideos: [clip] });
  assert.ok(!(m.mentionIssues ?? []).length && !/@video1/.test(String(m.error ?? '')), `@video1 names the first reference clip in Reference mode: ${m.error}`);
  const none: any = await h3VideoTool.parseInput({ types: '["r2v"]', prompt: 'a dancer', provider: 'router-seedance', duration: '5' }, {});
  assert.ok(none.error, 'no picture at all: Reference mode still asks for one');
  console.log('ok video refs: Reference mode runs with picture references and no start frame');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
// the bar's half (refFit hasPicture, read by AppTool's missing list)
{ const { hasPicture } = await import('../src/shared/refFit.js');
  assert.equal(hasPicture('r2v', false, 9), true, 'Reference mode: 9 picture references and a prompt are enough');
  assert.equal(hasPicture('r2v', false, 0), false, 'Reference mode with no picture: still asks');
  assert.equal(hasPicture('i2v', false, 9), false, 'image to video needs the start frame');
  assert.equal(hasPicture('i2v', true, 0), true);
  console.log('ok video refs: the bar counts picture references in Reference mode'); }
