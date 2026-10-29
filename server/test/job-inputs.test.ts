/** Display-only input collection: bundled examples and ordinary uploaded jobs. No server, keys or generation. */
import assert from 'node:assert/strict';
import { jobInputs, isFileUrl } from '../../web/src/shared/jobInputs.ts';
import { FEATURED, isStarter } from '../src/shared/featured.ts';
const job = (input: Record<string, unknown>, toolId = 'create-image') => ({ toolId, input }) as any;
const bundled = FEATURED.find(f => f.key === 'presenter-talk')!;
assert.deepEqual(jobInputs(job(bundled.input, bundled.toolId)).map(x => [x.url, x.slot]), [
  ['/examples/starter/presenter-talk-in.jpg', 'Image 1'], ['/examples/starter/presenter-talk-speech.mp3', 'Speech'],
], 'Lip Sync shows its shipped portrait AND speech, not just the output');
assert.deepEqual(jobInputs(job({ imageUrl: '/showcase/photo.webp' })).map(x => x.url), ['/showcase/photo.webp']);
for (const url of [null, 2, 'javascript:alert(1)', 'data:image/png;base64,AA', 'https://other.test/a.png', '//other.test/a.png',
  '/showcase/../private.png', '/showcase/./photo.png', '/showcase/a\\b.png', '/showcase/%2e%2e/private.png',
  '/showcase/a%2fb.png', '/showcase/%252e%252e/private.png', '/showcase/a.svg', '/showcase/a.html', '/showcase/a.png/extra',
  '/showcase//a.png', '/showcase/a.png?x=1', '/showcase/a.png#x', '/examples/a\nb.png', '/other/a.png']) {
  assert.equal(jobInputs(job({ imageUrl: url, refUrls: [url], maskUrl: url, speechUrl: url })).length, 0, String(url));
}
assert.equal(isFileUrl('/showcase/photo.webp'), false, 'do not widen the existing action/prep guard');
for (const url of ['/files/a.png', '/files/folder/a.wav?x=1', '/samples/a.mp4']) {
  assert.equal(isFileUrl(url), true); assert.equal(jobInputs(job({ imageUrl: url }))[0].url, url, 'existing uploaded/sample semantics');
}
const refs = ['/showcase/target.jpg', '/showcase/face.jpg', '/showcase/face.jpg'];
const swapped = jobInputs(job({ imageUrl: refs[0], refUrls: refs, maskUrl: '/showcase/mask.png' }, 'app-face-swap'));
assert.deepEqual(swapped.map(x => x.url), refs, 'reference duplicates/order stay intact');
assert.deepEqual(swapped.map(x => x.slot), ['Target', 'Face', 'Image 3']);
assert.deepEqual(swapped.map(x => x.mask), ['/showcase/mask.png', null, null], 'mask belongs to the source photo only');
assert.deepEqual(jobInputs(job({ imageUrl: refs[0], refUrls: [refs[1]], maskUrl: '/showcase/mask.png' })).map(x => x.url), refs.slice(0, 2));
assert.equal(jobInputs(job({ imageUrl: refs[0], maskUrl: 'https://other.test/mask.png' }))[0].mask, null);
const flf = jobInputs(job({ imageUrl: refs[0], refUrls: [refs[0], refs[1]], lastFrameUrl: refs[1] }));
assert.deepEqual(flf.map(x => x.slot), ['Image 1', 'Last frame']);
assert.deepEqual(jobInputs(job({ imageUrl: refs[0], lastFrameUrl: refs[1] })).map(x => x.url), refs.slice(0, 2));
const media = jobInputs(job({ videoUrl: '/showcase/source.mp4', sourceAudioUrl: '/samples/source.wav', voiceSampleUrl: '/files/voice.wav',
  voiceSampleUrls: ['/files/voice.wav', '/files/voice2.wav'], refVideoUrls: ['/files/ref.webm'], refAudioUrls: ['/files/ref.mp3'] }));
assert.deepEqual(media.map(x => x.kind), ['video', 'audio', 'audio', 'video', 'audio', 'audio']);
assert.deepEqual(media.map(x => x.slot), ['Video', 'Audio', 'Voice sample', 'Video reference 1', 'Audio reference 1', 'Voice sample 2']);
assert.deepEqual(jobInputs(job({ makeReal: { planUrl: '/examples/starter/mossbun-mockup-plan.mp4' } }))[0],
  { url: '/examples/starter/mossbun-mockup-plan.mp4', kind: 'video', slot: 'Guide clip', named: true, mask: null });
assert.equal(jobInputs(job({ prompt: 'Tell a story', coverUrl: '/showcase/cover.webp', posterUrl: '/showcase/poster.webp' })).length, 0, 'never invent media from prompt/cover/poster');
assert.equal(jobInputs(job({ voiceSampleUrls: Array.from({ length: 20 }, (_, i) => `/files/${i}.wav`) })).length, 16, 'existing shared display cap unchanged');
const examples = FEATURED.filter(isStarter);
const fixed = examples.filter(f => jobInputs(job(f.input, f.toolId)).length);
assert.equal(examples.length, 52);
assert.equal(fixed.length, 16, 'all ordinary examples with stored media inputs are visible');
for (const f of FEATURED) {
  const input: any = f.input;
  const expected = [input.imageUrl, ...(input.refUrls ?? []), input.lastFrameUrl, input.videoUrl, input.sourceAudioUrl, input.voiceSampleUrl,
    input.speechUrl, ...(input.refVideoUrls ?? []), ...(input.refAudioUrls ?? []), ...(input.voiceSampleUrls ?? []), input.makeReal?.planUrl].filter(Boolean);
  assert.deepEqual(new Set(jobInputs(job(input, f.toolId)).map(x => x.url)), new Set(expected), `${f.key}: every serialized input media slot appears`);
}
console.log(`job-inputs: PASS; ${fixed.length}/${examples.length} ordinary examples have stored media inputs; ${examples.length - fixed.length} have none`);
