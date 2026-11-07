// Leaving Explore (2026-11-07): a route change hides the page (Suspense keeps it mounted while the next page's code loads) and only then
// removes it, so the page's sound scope (shared/soundDirector.ts useSoundScope) stops every player inside it at once. Pure: no server, no DOM.
// Run: npx tsx test/sound-scope.test.ts
import assert from 'node:assert/strict';
import { stopPlayers, silence } from '../../web/src/shared/soundDirector.ts';
const ok = (m: string) => console.log('ok ' + m);

type P = { paused: boolean; muted: boolean; volume: number; pauses: number; pause(): void };
const player = (o: Partial<P> = {}): P => ({ paused: false, muted: false, volume: 1, pauses: 0, ...o, pause() { this.paused = true; this.pauses++; } });

const song = player(); const hero = player({ muted: true }); const idle = player({ paused: true });
stopPlayers([song, hero, idle]);
assert.ok(song.paused && hero.paused, 'every playing player pauses, with sound or muted');
assert.equal(idle.pauses, 0, 'a paused player is left alone');
assert.equal(song.muted, false, 'pausing never mutes a player the page owns (the voice comes back with sound when you return)');
ok('stopPlayers: everything that plays stops now; nothing else changes');

const gone = player(); stopPlayers([gone]); stopPlayers([gone]); assert.equal(gone.pauses, 1, 'twice is harmless'); ok('stopPlayers is idempotent');

// silence(root): every <video>/<audio> inside the page (the director's clips and the page's own players, like the presenter's voice)
const a = player(); const v = player({ muted: true }); const outside = player();
const root = { querySelectorAll: (s: string) => { assert.equal(s, 'video, audio'); return [a, v]; }, contains: () => false } as unknown as Element;
silence(root);
assert.ok(a.paused && v.paused, 'the page’s players stop'); assert.equal(outside.paused, false, 'a player on another part of the app is not touched');
ok('silence: the page that left goes quiet, the rest of the app keeps playing');

// players outside the DOM (registerMedia: new Audio() voice and look previews) stop with the page; a closing viewer leaves them alone
{
  const { registerMedia } = await import('../../web/src/shared/mediaPause.ts');
  const empty = { querySelectorAll: () => [], contains: () => false } as unknown as Element;
  const preview = player(); const off = registerMedia(preview as never);
  silence(empty, false); assert.equal(preview.paused, false, 'a viewer closing keeps the page’s preview going');
  silence(empty); assert.ok(preview.paused, 'leaving the page stops its preview');
  off(); ok('silence: previews outside the page stop when the page leaves, not when a viewer closes');
}
