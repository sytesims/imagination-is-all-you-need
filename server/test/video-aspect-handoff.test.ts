// Explore → Video aspect hand-off (2026-10-26): ?aspect= / ?duration= on a tool link become the bar's settings (web/src/shared/prefillParams.ts,
// read by usePrefill like ?prompt=), and an aspect the picked model lacks snaps to its nearest shape (VideoStudio, shared imageSnap.closestAspect).
// Run: npx tsx test/video-aspect-handoff.test.ts   (pure, no server)
import assert from 'node:assert/strict';
const { urlSettings } = await import('../../web/src/shared/prefillParams.ts');
const { closestAspect } = await import('../src/shared/imageSnap.ts');
const u = (s: string) => urlSettings(new URLSearchParams(s));
assert.deepEqual(u('aspect=16:9'), { aspect: '16:9' }); assert.deepEqual(u('aspect=9:16&duration=4'), { aspect: '9:16', duration: '4' });
assert.deepEqual(u('model=veo-3.1&aspect=1:1'), { aspect: '1:1' }); assert.deepEqual(u('aspect=auto'), { aspect: 'auto' });
assert.equal(u('prompt=hi'), null, 'nothing passed'); assert.equal(u('aspect=wide&duration=-3'), null, 'junk ignored'); assert.deepEqual(u('duration=05'), { duration: '5' });
// a model without the shape: the nearest it makes (Veo 3.1: 16:9 / 9:16; ties take the first listed)
const veo = ['auto', '16:9', '9:16'];
assert.equal(closestAspect(veo, 1), '16:9'); assert.equal(closestAspect(veo, 4 / 5), '9:16'); assert.equal(closestAspect(['auto', '16:9', '9:16', '1:1'], 5 / 4), '1:1'); assert.equal(closestAspect(veo, 21 / 9), '16:9');
console.log('ok video aspect hand-off: url settings + nearest shape');
