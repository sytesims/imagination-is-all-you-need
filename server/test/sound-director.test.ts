// The sound director (2026-10-28, Explore): one page-wide sound choice, the clip most in view carries it, an explicit film wins, old keys migrate.
// Pure: no server, no DOM. Run: npx tsx test/sound-director.test.ts
import assert from 'node:assert/strict';
import { readSoundChoice, pickSound, SOUND_KEY, OLD_SOUND_KEYS, MIN_SHARE, type SoundCandidate } from '../../web/src/shared/soundPick.ts';
const ok = (m: string) => console.log('ok ' + m);

const from = (o: Record<string, string>) => (k: string) => o[k] ?? null;
assert.deepEqual(readSoundChoice(from({})), { on: true, migrated: false }, 'nothing saved: on by default');
assert.deepEqual(readSoundChoice(from({ [SOUND_KEY]: '0' })), { on: false, migrated: false });
assert.deepEqual(readSoundChoice(from({ [SOUND_KEY]: '1', 'ohf.explore.heroSound': '0' })), { on: true, migrated: false }, 'the new key wins');
assert.deepEqual(readSoundChoice(from({ 'ohf.explore.heroSound': '0' })), { on: false, migrated: true }, 'the hero muted: page muted');
assert.deepEqual(readSoundChoice(from({ 'ohf.explore.heroSound': '0', 'ohf.explore.koiSound': '1' })), { on: true, migrated: true }, 'any section on: on');
assert.ok(OLD_SOUND_KEYS.includes('ohf.explore.x3dSound') && OLD_SOUND_KEYS.includes('ohf.explore.layersSound'), 'every old per-section key folds in');
ok('the choice: on by default, remembered, old per-section keys migrate (any on → on, else any off → off)');

let n = 0; const c = (id: string, share: number, o: Partial<SoundCandidate> = {}): SoundCandidate => ({ id, sound: true, share, off: 0.2, explicit: false, playing: true, order: ++n, ...o });
assert.equal(pickSound([]), null);
assert.equal(pickSound([c('a', 0.9), c('b', 0.5)]), 'a', 'the most in view');
assert.equal(pickSound([c('a', 0.9, { sound: false }), c('b', 0.5)]), 'b', 'a silent clip never carries sound');
assert.equal(pickSound([c('a', MIN_SHARE - 0.01)]), null, 'barely in view: silence');
assert.equal(pickSound([c('a', 0.95, { off: 0.4 }), c('b', 1, { off: 0.05 })]), 'b', 'near-equal shares: the one nearer the middle');
assert.equal(pickSound([c('a', 1, { off: 0.05 }), c('b', 0.6, { off: 0.5 })], 'b'), 'b', 'the clip you unmuted from stays preferred while in view');
assert.equal(pickSound([c('a', 1), c('b', 0.2)], 'b'), 'a', 'preferred but out of view: the one in view');
assert.equal(pickSound([c('a', 1), c('f', 0.3, { explicit: true })]), 'f', 'a film you pressed Play on wins while it plays and shows');
assert.equal(pickSound([c('a', 1), c('f', 0.3, { explicit: true, playing: false })]), 'a', 'paused or ended: back to scroll-follow');
assert.equal(pickSound([c('a', 1), c('f', 0, { explicit: true })]), 'a', 'scrolled fully away: back to scroll-follow');
ok('who sounds: most in view, silent and barely-visible clips never, preferred while in view, explicit films win while playing');
assert.equal(pickSound([c('a', 1, { explicit: true }), c('b', 1)], 'a', 'b'), 'b', 'temporary hover takes over even after another trend was explicitly played');
for (const o of [{ playing: false }, { sound: false }, { share: MIN_SHARE - .01 }]) {
  assert.equal(pickSound([c('a', 1), c('b', 1, o)], null, 'b'), 'a', 'hover never promotes paused, silent or barely-visible media');
}
assert.equal(pickSound([c('a', 1), c('b', 1, { explicit: true })], null, null), 'b', 'releasing hover restores the existing explicit/scroll policy');
assert.equal(pickSound([c('a', 1)], null, 'removed'), 'a', 'stale hover cannot pin an unmounted player');
ok('temporary hover: playing and visible only, explicit comparison override, release and stale-intent fallback');
console.log('sound-director: all checks passed');
