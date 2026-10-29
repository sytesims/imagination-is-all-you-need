// The one media manager (web/src/shared/mediaPause.ts + mediaBudget.ts): hidden → pause what plays; visible → resume only that, never
// louder; off-screen decorative clips pause and drop their source after a while; at most 3 decorative clips play at once.
// Run: npx tsx test/media-pause.test.ts   (no server, no DOM)
import assert from 'node:assert/strict';
import { createMediaPause } from '../../web/src/shared/mediaPause.ts';
import { createMediaBudget, isDecorative, type BudgetMedia } from '../../web/src/shared/mediaBudget.ts';
const ok = (m: string) => console.log('ok ' + m);

class FakeMedia implements BudgetMedia {
  paused = true; muted = false; loop = false; controls = false; isConnected = true; ended = false; plays = 0; loads = 0; refuseSound = false;
  attrs = new Map<string, string>();
  constructor(o: Partial<FakeMedia> & { src?: string; keep?: boolean } = {}) { const { src, keep, ...rest } = o; Object.assign(this, rest); if (src) this.attrs.set('src', src); if (keep) this.attrs.set('data-media-keep', ''); }
  getAttribute(n: string) { return this.attrs.get(n) ?? null; } setAttribute(n: string, v: string) { this.attrs.set(n, v); } removeAttribute(n: string) { this.attrs.delete(n); } hasAttribute(n: string) { return this.attrs.has(n); }
  play() { if (this.refuseSound && !this.muted) { const e = Object.assign(new Error('no'), { name: 'NotAllowedError' }); return Promise.reject(e); } this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; } load() { this.loads++; }
}
const tick = () => new Promise(r => setTimeout(r, 0));

// ---- hidden / visible ----
{
  let hidden = false; const hero = new FakeMedia({ paused: false, muted: false }); const tile = new FakeMedia({ paused: false, muted: true, loop: true });
  const stopped = new FakeMedia({ paused: true }); const els = [hero, tile, stopped];
  const m = createMediaPause({ list: () => els, hidden: () => hidden });
  hidden = true; m.hide();
  assert.ok(hero.paused && tile.paused && stopped.paused); assert.equal(m.heldCount, 2);
  hidden = false; m.show();
  assert.equal(hero.paused, false); assert.equal(hero.muted, false); assert.equal(tile.paused, false); assert.equal(tile.muted, true);
  assert.equal(stopped.paused, true); assert.equal(stopped.plays, 0); assert.equal(m.heldCount, 0);
  ok('hidden pauses what plays; visible resumes only those, sound as it was');
}
{
  let hidden = true; const a = new FakeMedia({ paused: false, muted: true }); const m = createMediaPause({ list: () => [a], hidden: () => hidden });
  m.hide(); a.muted = false; /* something unmuted it while hidden */ hidden = false; m.show();
  assert.equal(a.paused, false); assert.equal(a.muted, true);
  ok('a clip that left muted never comes back with sound');
}
{
  let hidden = true; const a = new FakeMedia({ paused: false }); const m = createMediaPause({ list: () => [a], hidden: () => hidden });
  m.hide(); m.show(); assert.equal(a.paused, true, 'show() while still hidden does nothing');
  hidden = false; a.play(); a.plays = 0; m.show(); assert.equal(a.plays, 0, 'already playing: not played twice');
  ok('show() waits for a visible tab and skips what already plays');
}
{
  let hidden = true; const late = new FakeMedia({ paused: true }); const m = createMediaPause({ list: () => [late], hidden: () => hidden });
  m.hide(); late.play(); m.onPlay(late); assert.equal(late.paused, true); hidden = false; m.show(); assert.equal(late.paused, false);
  ok('a play that starts while hidden is paused and resumed with the rest');
}
{
  let hidden = true; const gone = new FakeMedia({ paused: false }); const m = createMediaPause({ list: () => [gone], hidden: () => hidden });
  m.hide(); gone.isConnected = false; hidden = false; m.show(); assert.equal(gone.paused, true);
  const det = new FakeMedia({ paused: false, isConnected: false }); const m2 = createMediaPause({ list: () => [], hidden: () => hidden });
  m2.register(det); hidden = true; m2.hide(); assert.equal(det.paused, true); hidden = false; m2.show(); assert.equal(det.paused, false);
  ok('a removed element stays paused; a registered detached player (new Audio) pauses and resumes');
}
{
  let hidden = true; const a = new FakeMedia({ paused: false, muted: false, refuseSound: true }); const m = createMediaPause({ list: () => [a], hidden: () => hidden });
  m.hide(); hidden = false; m.show(); await tick(); await tick();
  assert.equal(a.paused, false); assert.equal(a.muted, true);
  ok('sound refused on return: it plays muted, never silent-fails or blasts');
}
{
  let hidden = false; let state = 'running'; const ctx = { get state() { return state; }, suspend: async () => { state = 'suspended'; }, resume: async () => { state = 'running'; } };
  const m = createMediaPause({ list: () => [], hidden: () => hidden }); m.registerContext(ctx);
  hidden = true; m.hide(); await tick(); assert.equal(state, 'suspended'); hidden = false; m.show(); await tick(); assert.equal(state, 'running');
  ok('a Web Audio graph is suspended and resumed');
}

// ---- budget: off screen, unload, at most 3 ----
const fakeTimers = () => { let id = 0; const q = new Map<number, () => void>(); return { set: (f: () => void) => { q.set(++id, f); return id; }, clear: (t: unknown) => { q.delete(t as number); }, runAll: () => { const fs = [...q.values()]; q.clear(); fs.forEach(f => f()); }, size: () => q.size }; };
{
  assert.equal(isDecorative(new FakeMedia({ muted: true, loop: true })), true);
  assert.equal(isDecorative(new FakeMedia({ muted: false, loop: true })), false);
  assert.equal(isDecorative(new FakeMedia({ muted: true, loop: true, controls: true })), false);
  assert.equal(isDecorative(new FakeMedia({ muted: true, loop: true, keep: true })), false);
  ok('decorative = muted + loop, no controls, not data-media-keep');
}
{
  let seen: (el: BudgetMedia, near: boolean) => void = () => {}; const T = fakeTimers(); let hidden = false;
  const b = createMediaBudget({ hidden: () => hidden, observer: cb => { seen = cb; return { observe() {}, unobserve() {} }; }, setTimer: T.set, clearTimer: T.clear });
  const v = new FakeMedia({ muted: true, loop: true, paused: false, src: '/files/a.mp4' }); v.setAttribute('preload', 'auto'); b.watch(v);
  seen(v, false); assert.equal(v.paused, true, 'off screen: paused'); assert.equal(v.getAttribute('src'), '/files/a.mp4', 'not unloaded yet');
  T.runAll(); assert.equal(v.getAttribute('src'), null); assert.equal(v.getAttribute('preload'), 'none'); assert.equal(v.loads, 1); assert.ok(b.isUnloaded(v));
  seen(v, true); assert.equal(v.getAttribute('src'), '/files/a.mp4'); assert.equal(v.getAttribute('preload'), 'auto'); assert.equal(v.paused, false, 'resumed: we paused it');
  ok('off screen: pause, then drop the source; back near: source back and playing again');
  const w = new FakeMedia({ muted: true, loop: true, paused: true, src: '/files/b.mp4' }); b.watch(w); seen(w, false); seen(w, true); T.runAll();
  assert.equal(w.getAttribute('src'), '/files/b.mp4'); assert.equal(w.paused, true, 'it was not playing: stays paused');
  ok('back before the delay: nothing unloaded, a paused clip stays paused');
  const player = new FakeMedia({ muted: false, loop: false, controls: true, paused: false, src: '/files/c.mp4' }); b.watch(player); seen(player, false); T.runAll();
  assert.equal(player.paused, false); assert.equal(player.getAttribute('src'), '/files/c.mp4');
  const hero = new FakeMedia({ muted: true, loop: true, paused: false, src: '/files/h.mp4', keep: true }); b.watch(hero); seen(hero, false); T.runAll();
  assert.equal(hero.getAttribute('src'), '/files/h.mp4');
  ok('a real player and the kept hero are left alone');
  const x = new FakeMedia({ muted: true, loop: true, paused: true, src: '/files/x.mp4' }); b.watch(x); seen(x, false); T.runAll(); x.setAttribute('src', '/files/new.mp4'); seen(x, true);
  assert.equal(x.getAttribute('src'), '/files/new.mp4');
  ok('a source the page changed meanwhile wins over the saved one');
}
{
  const T = fakeTimers(); let hidden = false; let seen: (el: BudgetMedia, near: boolean) => void = () => {};
  const b = createMediaBudget({ hidden: () => hidden, observer: cb => { seen = cb; return { observe() {}, unobserve() {} }; }, setTimer: T.set, clearTimer: T.clear });
  const vs = [1, 2, 3, 4].map(i => new FakeMedia({ muted: true, loop: true, src: `/files/${i}.mp4` }));
  vs.forEach(v => { b.watch(v); seen(v, true); v.play(); b.onPlay(v); });
  assert.deepEqual(vs.map(v => v.paused), [true, false, false, false]); assert.equal(b.stats().playing, 3);
  const sound = new FakeMedia({ muted: false, loop: false, src: '/files/s.mp4' }); sound.play(); b.onPlay(sound); assert.equal(vs.filter(v => !v.paused).length, 3, 'a real player does not count');
  ok('at most 3 decorative clips play: the 4th pauses the first');
  hidden = true; vs.forEach(v => v.pause()); b.onHidden(); T.runAll(); assert.ok(vs.every(v => v.getAttribute('src') === null), 'hidden a while: all dropped');
  seen(vs[3], false); hidden = false; b.onShown();
  assert.deepEqual(vs.map(v => v.getAttribute('src') != null), [true, true, true, false]);
  ok('a long hidden tab drops every clip; back on screen the ones near the screen get their source back');
}
console.log('media-pause: all ok');
