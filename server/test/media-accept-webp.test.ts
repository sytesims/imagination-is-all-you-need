/** Every picture slot takes WebP (shared/mediaAccept.ts) and the server turns an uploaded WebP into a PNG (imageNormalize.ts), so routes that take
 *  only PNG / JPEG (MiniMax H3's end frame, Veo, Kling…) get one. Run: npx tsx test/media-accept-webp.test.ts */
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ACCEPT, IMAGE_ACCEPT, fileFits, kindOfFile, wrongTypeText } from '../src/shared/mediaAccept.js';
import { normalizeImageFiles, toPngIfNeeded } from '../src/imageNormalize.js';

// one list per kind
assert.ok(IMAGE_ACCEPT.includes('image/webp') && IMAGE_ACCEPT.includes('image/png') && IMAGE_ACCEPT.includes('image/jpeg'));
assert.ok(ACCEPT.video.includes('video/webm') && ACCEPT.video.includes('video/quicktime'));
for (const x of ['.mp3', '.wav', '.m4a', '.ogg', '.flac']) assert.ok(ACCEPT.audio.includes(x), x);
// what fits
assert.equal(fileFits('image', { type: 'image/webp', name: 'a.webp' }), true);
assert.equal(fileFits('image', { type: 'image/jpeg', name: 'a.jpg' }), true);
assert.equal(fileFits('image', { type: 'image/heic', name: 'a.heic' }), false);
assert.equal(fileFits('image', { type: 'image/gif', name: 'a.gif' }), false);
assert.equal(fileFits('audio', { type: '', name: 'take.flac' }), true, 'no browser type: the name decides');
assert.equal(fileFits('video', { type: 'video/quicktime', name: 'clip.mov' }), true);
assert.equal(kindOfFile({ type: 'video/webm', name: 'x.webm' }, ['image', 'video']), 'video');
assert.equal(kindOfFile({ type: 'application/pdf', name: 'x.pdf' }), null);
assert.match(wrongTypeText('photo.heic', ['image']), /photo\.heic can’t be used here\. This takes PNG, JPG or WebP pictures\./);

// a WebP upload becomes a PNG; PNG / JPEG stay as they are
const dir = mkdtempSync(path.join(os.tmpdir(), 'webp-'));
/* a 1×1 lossless WebP (ffmpeg builds often have no WebP encoder, so the fixture is inline) */
writeFileSync(path.join(dir, 'ab12cd34-lastFrame1.webp'), Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'));
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240', '-frames:v', '1', path.join(dir, 'ab12cd34-image0.png')]);
assert.equal(await toPngIfNeeded(dir, 'ab12cd34-image0.png'), 'ab12cd34-image0.png');
const files: Record<string, string[]> = { image: ['ab12cd34-image0.png'], lastFrame: ['ab12cd34-lastFrame1.webp'], refs: ['ab12cd34-lastFrame1.webp', 'ab12cd34-lastFrame1.webp'] };
const moved = await normalizeImageFiles(dir, files);
assert.deepEqual(files, { image: ['ab12cd34-image0.png'], lastFrame: ['ab12cd34-lastFrame1.png'], refs: ['ab12cd34-lastFrame1.png', 'ab12cd34-lastFrame1.png'] });
assert.equal(moved.get('ab12cd34-lastFrame1.webp'), 'ab12cd34-lastFrame1.png');
const png = readFileSync(path.join(dir, 'ab12cd34-lastFrame1.png'));
assert.equal(png.subarray(1, 4).toString(), 'PNG', 'a real PNG');
// a broken WebP stays as it was (the tool's own check then says what's wrong)
writeFileSync(path.join(dir, 'bad.webp'), 'not a picture');
assert.equal(await toPngIfNeeded(dir, 'bad.webp'), 'bad.webp');
assert.equal(existsSync(path.join(dir, 'bad.png')), false);

// MiniMax H3 (Create Video): its end frame takes PNG / JPG only, so the converted WebP passes where the raw one would not
const { DATA_DIR } = await import('../src/config.js');
const { mkdirSync, copyFileSync } = await import('node:fs'); mkdirSync(DATA_DIR, { recursive: true });
await import('../src/tools/registry.js'); const { getTool } = await import('../src/tools/registry.js');
const h3 = getTool('h3-video')!; assert.ok(h3, 'h3-video tool');
for (const n of ['ab12cd34-image0.png', 'ab12cd34-lastFrame1.png']) copyFileSync(path.join(dir, n), path.join(DATA_DIR, n));
copyFileSync(path.join(dir, 'ab12cd34-lastFrame1.webp'), path.join(DATA_DIR, 'ab12cd34-lastFrame1.webp'));
const parse = (last: string) => (h3 as any).parseInput({ prompt: 'the fox turns its head', types: JSON.stringify(['flf']), provider: h3.providers[0].id, duration: '5' }, { image: ['ab12cd34-image0.png'], lastFrame: [last] });
const raw = await parse('ab12cd34-lastFrame1.webp'); const ok = await parse('ab12cd34-lastFrame1.png');
const msg = (r: any) => String(r?.error ?? r?.issues?.[0]?.message ?? '');
assert.ok(!/End frame: use PNG or JPG/.test(msg(ok)), `converted end frame accepted (${msg(ok)})`);
assert.ok(h3.inputs.filter((i: any) => i.kind === 'file' && /image\//.test(i.accept ?? '')).every((i: any) => /image\/webp/.test(i.accept)), 'every H3 picture input lists WebP');
console.log(`media-accept-webp: ok (raw webp end frame: ${msg(raw) || 'accepted'})`);
