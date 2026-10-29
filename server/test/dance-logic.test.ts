// The dancing bean (2026-10-25): web shared/danceLogic.ts picks ballet / groove moves from what the music does (tempo, beat phase, energy,
// bass vs treble, onsets, drops, end of track); beanDancer.ts poses the SVG rig.
// Run: npx tsx test/dance-logic.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { MOVES, REST, POSE_KEYS, blendPose, mirrorPose, sampleMove, scalePose, ease, estimateTempo, foldBpm, BeatClock, MusicSense, featuresFromBins, featuresFromLevel,
  chooseMove, Choreographer, type Sense, type ChoiceCtx, type MoveName } from '../../web/src/shared/danceLogic.ts';
import { poseTransforms, dancerSvg, faceOpacity, JOINTS } from '../../web/src/shared/beanDancer.ts';
const ok = (m: string) => console.log('ok ' + m);
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---- blending endpoints, easing, mirroring ----
{
  const a = MOVES.plie.keys[1].p, b = MOVES.arabesque.keys[1].p;
  assert.deepEqual(blendPose(a, b, 0), a); assert.deepEqual(blendPose(a, b, 1), b);
  assert.deepEqual(blendPose(a, b, -3), a, 'clamped below'); assert.deepEqual(blendPose(a, b, 9), b, 'clamped above');
  const mid = blendPose(a, b, 0.5); for (const k of POSE_KEYS) if (k !== 'spin') assert.ok(near(mid[k], (a[k] + b[k]) / 2));
  assert.ok(near(blendPose({ ...REST, spin: 350 }, { ...REST, spin: 10 }, 0.5).spin % 360, 0), 'spin takes the short way round');
  assert.ok(near(blendPose({ ...REST, spin: 720 }, REST, 0.5).spin % 360, 0), 'a finished pirouette never unwinds');
  assert.equal(ease(0), 0); assert.equal(ease(1), 1); assert.ok(near(ease(0.5), 0.5)); assert.ok(ease(0.1) < 0.1, 'eases in');
  for (const m of Object.values(MOVES)) {
    assert.equal(m.keys[0].t, 0, `${m.name} starts at 0`); assert.equal(m.keys[m.keys.length - 1].t, 1, `${m.name} ends at 1`);
    for (let i = 1; i < m.keys.length; i++) assert.ok(m.keys[i].t > m.keys[i - 1].t, `${m.name} keys in order`);
    assert.deepEqual(sampleMove(m, 0), m.keys[0].p, `${m.name}: t=0 is the first key`);
    assert.deepEqual(sampleMove(m, 1), m.keys[m.keys.length - 1].p, `${m.name}: t=1 is the last key`);
    for (const k of m.keys) assert.deepEqual(sampleMove(m, k.t), k.p, `${m.name}: lands exactly on its key at ${k.t}`);
    for (let t = 0; t <= 1; t += 0.01) for (const key of POSE_KEYS) assert.ok(isFinite(sampleMove(m, t)[key]));
    if (!m.hold && m.name !== 'pirouette' && m.name !== 'spin') { const e = m.keys[m.keys.length - 1].p; assert.ok(Math.abs(e.y) <= 2.5 && Math.abs(e.x) <= 0.01 && Math.abs(e.tilt) < 0.01, `${m.name} ends near a neutral stance`); }
  }
  /* smooth: no jump between neighbouring frames */
  for (const m of Object.values(MOVES)) for (let t = 0; t < 1; t += 0.005) { const p = sampleMove(m, t), q = sampleMove(m, t + 0.005); for (const k of POSE_KEYS) assert.ok(Math.abs(p[k] - q[k]) < (k === 'spin' ? 20 : 9), `${m.name} ${k} glides at ${t.toFixed(3)}`); }
  const ar = MOVES.arabesque.keys[1].p, mr = mirrorPose(ar);
  assert.equal(mr.lHip, ar.rHip); assert.equal(mr.rSh, ar.lSh); assert.equal(mr.x, -ar.x); assert.equal(mr.tilt, -ar.tilt); assert.deepEqual(mirrorPose(mr), ar, 'mirror twice = same');
  assert.deepEqual(scalePose(ar, 1), ar); assert.deepEqual(scalePose(ar, 0), { ...REST, spin: ar.spin });
}
ok('blending endpoints, eased keys, every move starts / ends cleanly and glides, mirror');

// ---- tempo from onsets ----
{
  const at = (ms: number, n: number, jitter = 0, drop: number[] = []) => Array.from({ length: n }, (_, i) => i * ms + (jitter ? Math.sin(i * 7.3) * jitter : 0)).filter((_, i) => !drop.includes(i));
  const t120 = estimateTempo(at(500, 16))!; assert.ok(Math.abs(t120.bpm - 120) < 1.5, `120 BPM, got ${t120.bpm}`); assert.ok(t120.confidence > 0.4);
  const t100 = estimateTempo(at(600, 14, 15, [3, 8]))!; assert.ok(Math.abs(t100.bpm - 100) < 3, `100 BPM with jitter + missed beats, got ${t100.bpm}`);
  const t140 = estimateTempo(at(60000 / 140, 20))!; assert.ok(Math.abs(t140.bpm - 140) < 2, `140, got ${t140.bpm}`);
  const t170 = estimateTempo(at(60000 / 170, 20))!; assert.ok(Math.abs(t170.bpm - 85) < 2, `170 folds to 85, got ${t170.bpm}`);
  const t60 = estimateTempo(at(1000, 10))!; assert.ok(Math.abs(t60.bpm - 120) < 2, `60 folds to 120, got ${t60.bpm}`);
  /* off-beat eighths on top of the beat still find the beat */
  const withEighths = [...at(500, 16), ...at(500, 16).map(t => t + 250).filter((_, i) => i % 3 === 0)];
  assert.ok(Math.abs(estimateTempo(withEighths)!.bpm - 120) < 3);
  assert.equal(estimateTempo([]), null); assert.equal(estimateTempo([0, 500, 1000]), null, 'needs 4 onsets'); assert.equal(estimateTempo([0, 1, 2, 3]), null, 'too close: no votes');
  assert.ok(estimateTempo([0, 500, 1000, 1500, NaN])!.bpm > 0, 'NaN ignored');
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const noise = Array.from({ length: 30 }, () => rnd() * 8000); const tn = estimateTempo(noise)!; assert.ok(tn.confidence < t120.confidence, 'random onsets: lower confidence');
  assert.equal(foldBpm(0), 0); assert.equal(foldBpm(Infinity), 0); assert.equal(foldBpm(300), 75); assert.equal(foldBpm(40), 80);
}
ok('tempo estimate from synthetic onsets: steady, jitter, missed beats, folding, eighths, noise');

// ---- beat clock locks onto onsets ----
{
  const c = new BeatClock(120); c.pos = 0.2; c.onset(); assert.ok(c.pos < 0.2 && c.pos > 0, 'an early onset pulls the clock toward the beat');
  const d = new BeatClock(120); d.pos = 0.5; d.onset(); assert.equal(d.pos, 0.5, 'an off-beat onset is ignored');
  const e = new BeatClock(120); e.advance(1); assert.ok(near(e.pos, 2)); e.advance(-5); assert.ok(near(e.pos, 2), 'never runs backwards');
}
ok('beat clock: tempo + soft phase lock');

// ---- the music sense on synthetic analyser frames ----
const kickFrames = (bpm: number, seconds: number, o: { bass?: number; treble?: number; base?: number } = {}) => {
  const s = new MusicSense(); let prev: Uint8Array | null = null; const period = 60000 / bpm; let onsets = 0;
  for (let t = 0; t < seconds * 1000; t += 16) {
    const b = new Uint8Array(128); const ph = (t % period) / period; const hit = ph < 0.12 ? 1 - ph / 0.12 : 0;
    for (let i = 1; i < 128; i++) b[i] = Math.min(255, (o.base ?? 60) + (i < 6 ? (o.bass ?? 190) * hit : i > 24 ? (o.treble ?? 20) : 40 * hit));
    if (s.update(featuresFromBins(b, prev), t)) onsets++; prev = b;
  }
  return { s, onsets, snap: s.snapshot(seconds * 1000) };
};
{
  const { s, onsets } = kickFrames(120, 8); assert.ok(onsets >= 12 && onsets <= 20, `~16 kicks in 8 s, got ${onsets}`);
  assert.ok(Math.abs(s.bpm - 120) < 4, `tempo from a 120 BPM kick, got ${s.bpm}`); assert.ok(s.confidence > 0.2);
  const k95 = kickFrames(95, 10).s; assert.ok(Math.abs(k95.bpm - 95) < 4, `95 BPM, got ${k95.bpm}`);
  const silent = new MusicSense(); for (let t = 0; t < 3000; t += 16) assert.equal(silent.update(featuresFromBins(new Uint8Array(128), new Uint8Array(128)), t), false, 'silence never onsets');
  assert.ok(silent.snapshot(3000).quiet);
  const f = featuresFromBins(new Uint8Array(128).fill(255)); assert.equal(f.rms, 1); assert.equal(f.flux, 0, 'no previous frame: no flux');
  const l = featuresFromLevel(0.8, 0.2); assert.ok(l.bassFlux > 0 && l.rms > 0); assert.equal(featuresFromLevel(NaN, 0).rms, 0);
}
{
  /* a song shape: 6 s of beat, a 3 s breakdown (no kick, softer), then the drop (louder than before) */
  const s = new MusicSense(); let prev: Uint8Array | null = null; const period = 500; let quietInBreak = 0, framesInBreak = 0; let firstDrop = -1;
  for (let t = 0; t < 14000; t += 16) {
    const brk = t >= 6000 && t < 9000, drop = t >= 9000; const ph = (t % period) / period; const hit = brk ? 0 : ph < 0.12 ? 1 - ph / 0.12 : 0;
    const b = new Uint8Array(128); for (let i = 1; i < 128; i++) b[i] = Math.min(255, (brk ? 25 : drop ? 110 : 70) + (i < 6 ? 170 * hit : 30 * hit));
    s.update(featuresFromBins(b, prev), t); prev = b; const snap = s.snapshot(t);
    if (brk && t > 7000) { framesInBreak++; if (snap.quiet) quietInBreak++; }
    if (firstDrop < 0 && snap.dropAgo < 50) firstDrop = t;
  }
  assert.ok(quietInBreak / framesInBreak > 0.9, `the breakdown reads as calm (${quietInBreak}/${framesInBreak})`);
  assert.ok(firstDrop >= 9000 && firstDrop < 10500, `the drop is found right after the breakdown, got ${firstDrop}`);
  const w = new MusicSense(); let pv: Uint8Array | null = null;
  for (let t = 0; t < 2500; t += 16) { const b = new Uint8Array(128).fill(t < 300 ? 0 : 180); w.update(featuresFromBins(b, pv), t); pv = b; assert.ok(w.snapshot(t).dropAgo > 1e9, 'no drop while warming up (the song just started)'); }
}
ok('music sense: onsets, tempo and quiet from synthetic frames');

// ---- choreographer: features → move ----
const S = (o: Partial<Sense> = {}): Sense => ({ level: 0.3, rms: 0.3, bass: 0.3, treble: 0.1, bright: 0.25, trend: 1, bpm: 120, confidence: 0.5, onsetAgo: 300, bassHitAgo: Infinity, dropAgo: Infinity, onsetStrength: 0.3, quiet: false, power: 0.3, calmRatio: 1, ...o });
const C = (o: Partial<ChoiceCtx> = {}): ChoiceCtx => ({ kind: 'music', prev: null, history: [], beatsSinceSpin: 99, ending: false, rnd: () => 0.3, pack: 'classical', ...o });
{
  assert.equal(chooseMove(S(), C({ ending: true })), 'bow', 'end of track → bow');
  assert.equal(chooseMove(S({ dropAgo: 200 }), C()), 'pirouette', 'a drop → pirouette');
  assert.notEqual(chooseMove(S({ dropAgo: 200 }), C({ beatsSinceSpin: 3 })), 'pirouette', 'not two pirouettes in a row');
  assert.equal(chooseMove(S({ rms: 0.01, level: 0.01, quiet: true }), C()), 'breathe', 'silence → breathe');
  for (let i = 0; i < 10; i++) assert.ok(['portDeBras', 'sway', 'conduct'].includes(chooseMove(S({ rms: 0.05, level: 0.05, quiet: true }), C({ rnd: () => i / 10 }))), 'quiet → the pack\'s gentle moves');
  assert.equal(chooseMove(S({ bassHitAgo: 100, bass: 0.6 }), C()), 'saute', 'bass hit → sauté');
  assert.notEqual(chooseMove(S({ bassHitAgo: 100, bass: 0.6 }), C({ history: ['saute', 'saute'], prev: 'saute' })), 'saute', 'at most two jumps in a row');
  assert.notEqual(chooseMove(S({ bassHitAgo: 100, bass: 0.2 }), C()), 'saute', 'a weak bass is no jump');
  assert.ok(['releve', 'flourish'].includes(chooseMove(S({ trend: 1.4 }), C())), 'rising energy → relevé / flourish');
  assert.ok(['releve', 'flourish'].includes(chooseMove(S({ bright: 0.6, level: 0.4 }), C())), 'bright and loud → relevé / flourish');
  const steady = new Set<MoveName>(); for (let i = 0; i < 20; i++) steady.add(chooseMove(S(), C({ rnd: () => i / 20 })));
  assert.ok([...steady].every(m => ['plie', 'conduct', 'arabesque', 'portDeBras'].includes(m)) && steady.has('plie') && steady.has('conduct'), `steady beat (ballet pack) → pliés + conducting, got ${[...steady]}`);
  for (let i = 0; i < 10; i++) assert.ok(['portDeBras', 'sway', 'conduct'].includes(chooseMove(S({ bpm: 80 }), C({ rnd: () => i / 10 }))), 'slow → gentle');
  assert.ok(['portDeBras', 'sway', 'conduct'].includes(chooseMove(S({ confidence: 0.05 }), C())), 'unclear tempo → gentle');
  assert.notEqual(chooseMove(S(), C({ prev: 'plie', rnd: () => 0 })), 'plie', 'no immediate repeat');
  assert.equal(chooseMove(S(), C({ kind: 'voice' })), 'listen', 'voice → listening nods');
  assert.equal(chooseMove(S({ rms: 0.01 }), C({ kind: 'voice' })), 'breathe');
  assert.equal(chooseMove(S({ onsetAgo: 50, onsetStrength: 0.8 }), C({ kind: 'sfx' })), 'startle', 'sound effect hit → startle');
  assert.equal(chooseMove(S({ onsetAgo: 2000, level: 0.5, trend: 1.2 }), C({ kind: 'sfx', prev: 'startle' })), 'spin', 'loud sound effect → spin');
  assert.equal(chooseMove(S({ onsetAgo: 2000, level: 0.2 }), C({ kind: 'sfx' })), 'sway');
}
ok('choreographer: features → move choice');

// ---- the choreographer over time: moves start on beats, blend without snapping, bow holds ----
{
  let r = 1; const rnd = () => ((r = (r * 48271) % 2147483647) / 2147483647);
  const ch = new Choreographer('music', rnd, 'classical'); const starts: number[] = []; let prevMove = '', prevPose = REST;
  for (let beat = 0; beat < 64; beat += 0.02) {
    const f = ch.update(beat, S({ bassHitAgo: beat > 19.5 && beat < 28 ? 100 : Infinity, bass: 0.6, dropAgo: Math.abs(beat - 40) < 0.5 ? 100 : Infinity }), { ending: false, amount: 1 });
    if (f.move !== prevMove) { starts.push(ch.start); prevMove = f.move; }
    for (const k of POSE_KEYS) if (k !== 'spin') assert.ok(Math.abs(f.pose[k] - prevPose[k]) < 12, `no snap in ${k} at beat ${beat.toFixed(2)} (${f.move})`);
    prevPose = f.pose;
  }
  assert.ok(starts.length > 8, 'many moves over 64 beats'); for (const s of starts) assert.ok(Number.isInteger(s), `moves start on a beat (${s})`);
  assert.ok(ch.history.includes('saute'), 'bass section jumped'); assert.ok(ch.history.includes('pirouette'), 'the drop spun');
  const end = new Choreographer('music', rnd); let last = '';
  for (let beat = 0; beat < 20; beat += 0.05) last = end.update(beat, S(), { ending: beat > 6 }).move;
  assert.equal(last, 'bow', 'ends in a bow and holds it'); assert.equal(end.update(20, S(), { ending: true }).face, 'wink');
  const sfx = new Choreographer('sfx', rnd); sfx.update(0, S({ onsetAgo: 5000, level: 0.1 }), { ending: false });
  assert.equal(sfx.update(0.3, S({ onsetAgo: 10, onsetStrength: 0.9 }), { ending: false, cutIn: true }).move, 'startle', 'a sound effect hit cuts in at once');
}
ok('choreographer over time: on the beat, no snapping, drops spin, bow holds');

// ---- the rig ----
{
  const tf = poseTransforms(REST); for (const j of JOINTS) assert.ok(tf[j] && !/NaN|Infinity/.test(tf[j]), j);
  for (const m of Object.values(MOVES)) for (let t = 0; t <= 1; t += 0.1) for (const v of Object.values(poseTransforms(sampleMove(m, t)))) assert.ok(!/NaN|Infinity/.test(v));
  const svg = dancerSvg('t1'); for (const j of JOINTS) assert.ok(svg.includes(`data-j="${j}"`), `rig has ${j}`);
  for (const f of ['happy', 'smile', 'surprised', 'sleepy', 'wink']) assert.ok(svg.includes(`data-face-l="${f}"`));
  assert.ok(!dancerSvg('a').includes('id="b'), 'ids are per instance'); assert.ok(dancerSvg('x:1').includes('id="x1h"'), 'uid is sanitised');
  assert.equal(faceOpacity(0), 1); assert.equal(faceOpacity(180), 0, 'back turned: no face');
  assert.ok(poseTransforms({ ...REST, spin: 90 }).root.includes('scale(0.01'), 'side-on in a spin is a sliver, never a zero scale');
}
ok('rig: every joint transformable, faces, per-instance ids');
