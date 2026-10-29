// Share step 1: metadata stripping (cleanMedia.ts) and GET /files/<name>?clean=1. Run: npx tsx test/clean-media.test.ts (needs ffmpeg/ffprobe)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { execFileSync, spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-')); process.env.OPENHIGGSFIELD_DATA_DIR = D;
const M = await import('../src/cleanMedia.js');
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-show_chapters', '-of', 'json', f]).toString());
const pixels = (f: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type, 'latin1'); const h = Buffer.alloc(4); h.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0); return Buffer.concat([h, t, data, c]); };
const SECRET = 'a cat astronaut, secret prompt';
try {
  // PNG: a ComfyUI-style tEXt "prompt" chunk (graph + prompt), plus iTXt, zTXt and eXIf
  const src = path.join(D, 'src.png'); ff('-f', 'lavfi', '-i', 'testsrc2=s=320x240', '-frames:v', '1', src); const raw = fs.readFileSync(src);
  const graph = JSON.stringify({ '6': { class_type: 'CLIPTextEncode', inputs: { text: SECRET } } });
  const extra = Buffer.concat([chunk('tEXt', Buffer.from(`prompt\0${graph}`, 'latin1')), chunk('tEXt', Buffer.from(`workflow\0{"nodes":[]}`, 'latin1')), chunk('iTXt', Buffer.from(`parameters\0\0\0\0\0${SECRET}`, 'utf8')),
    chunk('zTXt', Buffer.concat([Buffer.from('Comment\0\0', 'latin1'), zlib.deflateSync(SECRET)])), chunk('eXIf', Buffer.from('MM\0*\0\0\0\x08\0\0', 'latin1'))]);
  const dirty = Buffer.concat([raw.subarray(0, 33), extra, raw.subarray(33)]); // after IHDR
  const pngPath = path.join(D, 'comfy.png'); fs.writeFileSync(pngPath, dirty); assert.ok(dirty.includes(SECRET));
  const clean = M.cleanPng(dirty);
  assert.ok(!clean.includes(SECRET) && !clean.includes('workflow') && !clean.includes('eXIf') && !clean.includes('zTXt'), 'png text gone');
  assert.ok(clean.equals(raw), 'every other PNG chunk byte for byte');
  fs.writeFileSync(path.join(D, 'clean.png'), clean); assert.ok(pixels(path.join(D, 'clean.png')).equals(pixels(pngPath)), 'png pixels unchanged');
  assert.equal(M.cleanImage(Buffer.from('not an image')).toString(), 'not an image'); assert.ok(M.cleanPng(dirty.subarray(0, 60)).length > 0, 'truncated png does not throw');

  // JPEG: APP1 EXIF + APP1 XMP + COM after SOI; APP0/JFIF and the image data stay
  const jsrc = path.join(D, 'src.jpg'); ff('-f', 'lavfi', '-i', 'testsrc2=s=320x240', '-frames:v', '1', '-q:v', '3', jsrc); const jraw = fs.readFileSync(jsrc);
  const seg = (m: number, body: Buffer) => { const h = Buffer.from([0xff, m, 0, 0]); h.writeUInt16BE(body.length + 2, 2); return Buffer.concat([h, body]); };
  const jdirty = Buffer.concat([jraw.subarray(0, 2), seg(0xe1, Buffer.from(`Exif\0\0MM\0*${SECRET}`, 'latin1')), seg(0xe1, Buffer.from(`http://ns.adobe.com/xap/1.0/\0<x>${SECRET}</x>`, 'latin1')), seg(0xfe, Buffer.from(SECRET)), jraw.subarray(2)]);
  const jp = path.join(D, 'dirty.jpg'); fs.writeFileSync(jp, jdirty); const jclean = M.cleanJpeg(jdirty);
  assert.ok(!jclean.includes(SECRET), 'jpeg exif/xmp/comment gone'); assert.ok(jclean.equals(M.cleanJpeg(jraw)), 'same as the source without the added segments');
  fs.writeFileSync(path.join(D, 'clean.jpg'), jclean); assert.ok(pixels(path.join(D, 'clean.jpg')).equals(pixels(jp)), 'jpeg pixels unchanged');

  // MP4 with title/comment tags, a chapter and audio → stream copy without them
  const mp4 = path.join(D, 'tagged.mp4');
  fs.writeFileSync(path.join(D, 'ch.txt'), `;FFMETADATA1\ntitle=${SECRET}\ncomment=${SECRET}\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1000\ntitle=${SECRET}\n`);
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x240:d=2', '-f', 'lavfi', '-i', 'sine=d=2', '-i', path.join(D, 'ch.txt'), '-map', '0', '-map', '1', '-map_metadata', '2', '-map_chapters', '2', '-c:v', 'libx264', '-c:a', 'aac', '-metadata', `description=${SECRET}`, mp4);
  assert.ok(JSON.stringify(probe(mp4)).includes(SECRET), 'fixture is tagged');
  const cmp4 = await M.cleanAvFile(mp4); const pc = probe(cmp4); assert.notEqual(cmp4, mp4);
  assert.ok(!JSON.stringify(pc).includes(SECRET), 'mp4 tags gone'); assert.equal(pc.chapters.length, 0, 'chapters gone');
  assert.deepEqual(Object.keys(pc.format.tags ?? {}).filter((k) => !/^(major_brand|minor_version|compatible_brands)$/.test(k)), [], 'no format tags left');
  const hash = (f: string, s: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-map', s, '-c', 'copy', '-f', 'hash', '-']).toString();
  assert.equal(hash(cmp4, '0:v'), hash(mp4, '0:v'), 'video stream copied, not re-encoded'); assert.equal(hash(cmp4, '0:a'), hash(mp4, '0:a'), 'audio stream copied');
  assert.equal(await M.cleanAvFile(mp4), cmp4, 'cached');

  // Audio: MP3 with ID3 tags
  const mp3 = path.join(D, 'song.mp3'); ff('-f', 'lavfi', '-i', 'sine=d=1', '-metadata', `title=${SECRET}`, '-metadata', `lyrics=${SECRET}`, mp3);
  const cmp3 = await M.cleanAvFile(mp3); assert.ok(!JSON.stringify(probe(cmp3)).includes(SECRET), 'mp3 tags gone'); assert.ok(!fs.readFileSync(cmp3).includes(SECRET));

  // HTTP: /files/<name>?clean=1 serves the clean copy; without it the original; the original on disk is untouched
  const PORT = testPort(8919), B = `http://localhost:${PORT}`;
  const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '' }, stdio: 'ignore', detached: true });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
    const orig = Buffer.from(await (await fetch(`${B}/files/comfy.png`)).arrayBuffer()); assert.ok(orig.equals(dirty), 'in-app view keeps the original');
    const r = await fetch(`${B}/files/comfy.png?clean=1`); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png'); assert.equal(r.headers.get('x-clean'), '1');
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(clean));
    const v = await fetch(`${B}/files/tagged.mp4?clean=1`); const vb = Buffer.from(await v.arrayBuffer()); assert.equal(v.status, 200); assert.ok(!vb.includes(SECRET));
    const rg = await fetch(`${B}/files/tagged.mp4?clean=1`, { headers: { range: 'bytes=0-99' } }); assert.equal(rg.status, 206); assert.equal((await rg.arrayBuffer()).byteLength, 100);
    assert.equal((await fetch(`${B}/files/..%2F..%2Fetc%2Fpasswd?clean=1`)).status === 200, false, 'no escape from the data dir');
    assert.equal((await fetch(`${B}/files/nope.png?clean=1`)).status, 404);
    assert.ok(fs.readFileSync(pngPath).equals(dirty), 'original on disk untouched');
  } finally { try { process.kill(-srv.pid!); } catch { /* */ } }
  console.log('ok clean-media: png (tEXt/iTXt/zTXt/eXIf), jpeg (APP1/COM), mp4 (tags, chapters; stream copy), mp3 tags, /files ?clean=1 incl. Range');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
