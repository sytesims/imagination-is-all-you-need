// The dancing bean's style packs (2026-10-25): web shared/beanStyle.ts reads a track's character from its prompt / style words and lyrics
// (rap, love song, rock, EDM, lo-fi, classical, peaceful, voice, sound effect; unknown → neutral groove); danceLogic.ts picks moves from the pack
// blended with the live sound; the calm-section rule works on real (decibel-scaled) analyser frames; the rig has no tutu.
// Run: npx tsx test/bean-style.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { detectStyle, PACKS, PACK_IDS } from '../../web/src/shared/beanStyle.ts';
import { MOVES, MusicSense, BeatClock, Choreographer, chooseMove, featuresFromBins, ANALYSER_DB_RANGE, type Sense, type ChoiceCtx, type MoveName } from '../../web/src/shared/danceLogic.ts';
import { dancerSvg, FACES } from '../../web/src/shared/beanDancer.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- style detection from the prompt / style tags and the lyrics ----
{
  const d = (prompt: string, lyrics?: string, kind: 'music' | 'voice' | 'sfx' = 'music') => detectStyle({ prompt, lyrics, kind });
  assert.equal(d('Hard-hitting trap beat, 808 bass, hip hop').pack, 'rap');
  assert.equal(d('boom bap RAP with a jazzy sample').pack, 'rap', 'any case');
  assert.equal(d('Romantic ballad, soft piano').pack, 'love');
  assert.equal(d('pop song', 'I give you my heart, my love, forever, baby').pack, 'love', 'the lyrics alone can say it');
  assert.equal(d('Heavy metal riffs, distorted guitars').pack, 'rock');
  assert.equal(d('Euphoric EDM house track with a huge drop').pack, 'edm');
  assert.equal(d('Lo-fi hip hop beat for study, vinyl crackle').pack, 'lofi', 'lo-fi hip hop is chill, not rap');
  assert.equal(d('Orchestral waltz with strings').pack, 'classical');
  const jazz = d('Smooth jazz trio, late night'); assert.equal(jazz.pack, 'lofi'); assert.equal(jazz.label, 'Jazzy', 'jazz dances chill under its own name');
  const epic = d('Epic cinematic trailer'); assert.equal(epic.pack, 'classical'); assert.equal(epic.label, 'Epic');
  assert.equal(d('Sad song about a heartbreak, I miss you, tears and love lost').pack, 'peaceful', 'heartbreak beats love, and dances peaceful');
  const calm = d('Peaceful, serene piano, gentle and hopeful'); assert.equal(calm.pack, 'peaceful'); assert.equal(calm.label, 'Peaceful', 'the friendly chip name');
  assert.equal(d('Upbeat EDM club anthem').label, 'Party'); assert.equal(d('Lo-fi chill study beat').label, 'Chill'); assert.equal(d('trap beat, 808s').label, 'Hip hop');
  assert.equal(d('pop song', 'Grab the mic, I spit these bars, my flow is cold\n[Rap]\nYo').pack, 'rap', 'a [Rap] section tag in the lyrics');
  assert.equal(d('Welcome to the show', undefined, 'voice').pack, 'voice'); assert.equal(d('love ballad', undefined, 'voice').pack, 'voice', 'a voice keeps its own pack');
  assert.equal(d('An explosion', undefined, 'sfx').pack, 'sfx');
  const none = d('a glass of water on a table'); assert.equal(none.pack, 'groove'); assert.equal(none.label, '', 'unknown: neutral groove, no chip');
  assert.equal(detectStyle({}).pack, 'groove'); assert.equal(detectStyle({ prompt: null, lyrics: null }).pack, 'groove');
  assert.equal(d('sparked a bassoon').pack, 'groove', 'whole words only ("rap" is not in "trap door"... nor "sparked")');
  assert.equal(d('x'.repeat(20000), 'love '.repeat(5000)).pack, 'love', 'huge lyrics: still answers');
  assert.equal(d('rock', 'love, my love').pack, 'rock', 'the prompt counts double');
  for (const p of PACK_IDS) { const P = PACKS[p]; for (const m of [...P.steady, ...P.gentle, ...P.lift, P.drop, P.rest, ...(P.hit ? [P.hit] : [])]) assert.ok(MOVES[m], `${p}: ${m} exists`); assert.ok(P.accessory); assert.ok(!('particles' in P), 'no floating particles (user, 2026-10-25)'); }
}
ok('style detection: rap, love (prompt or lyrics), rock, EDM, lo-fi (and jazz), classical (and epic), peaceful, voice, sfx, unknown → groove');

// ---- pack selection with live features ----
const S = (o: Partial<Sense> = {}): Sense => ({ level: 0.3, rms: 0.3, bass: 0.3, treble: 0.1, bright: 0.25, trend: 1, bpm: 120, confidence: 0.5, onsetAgo: 300, bassHitAgo: Infinity, dropAgo: Infinity, onsetStrength: 0.3, quiet: false, power: 0.3, calmRatio: 1, ...o });
const C = (o: Partial<ChoiceCtx> = {}): ChoiceCtx => ({ kind: 'music', prev: null, history: [], beatsSinceSpin: 99, ending: false, rnd: () => 0.3, ...o });
{
  const many = (s: Sense, c: Partial<ChoiceCtx>) => { const out = new Set<MoveName>(); for (let i = 0; i < 20; i++) out.add(chooseMove(s, C({ ...c, rnd: () => i / 20 }))); return [...out]; };
  for (const p of ['rap', 'love', 'rock', 'edm', 'lofi', 'classical', 'peaceful'] as const) {
    const st = many(S(), { pack: p }); assert.ok(st.every(m => PACKS[p].steady.includes(m)), `${p}: steady beat → its own moves, got ${st}`);
    const q = many(S({ quiet: true, rms: 0.2 }), { pack: p }); assert.ok(q.every(m => PACKS[p].gentle.includes(m)), `${p}: calm section → its gentle moves, got ${q}`);
  }
  assert.ok(many(S(), { pack: 'rap' }).includes('rapNod') && many(S(), { pack: 'rock' }).includes('headbang') && many(S(), { pack: 'love' }).includes('heartHands'));
  assert.equal(chooseMove(S({ dropAgo: 100 }), C({ pack: 'rap' })), 'saute', 'a rap track still jumps on a big drop');
  assert.equal(chooseMove(S({ dropAgo: 100 }), C({ pack: 'edm' })), 'saute', 'EDM jumps on the drop');
  assert.equal(chooseMove(S({ dropAgo: 100 }), C({ pack: 'rock' })), 'rockJump');
  assert.equal(chooseMove(S({ bassHitAgo: 50, bass: 0.6 }), C({ pack: 'rock' })), 'rockJump', 'rock: bass hits jump');
  assert.notEqual(chooseMove(S({ bassHitAgo: 50, bass: 0.5, level: 0.25 }), C({ pack: 'love' })), 'saute', 'a ballad never jumps on an ordinary bass note');
  assert.equal(chooseMove(S({ bassHitAgo: 50, bass: 0.7, level: 0.5 }), C({ pack: 'love' })), 'saute', '...but blends with the sound: a really loud hit still jumps');
  assert.ok(PACKS.groove.steady.includes(chooseMove(S(), C())), 'no pack: the neutral groove');
  assert.equal(chooseMove(S(), C({ pack: 'rap', kind: 'voice' })), 'listen', 'a voice listens, whatever the words');
  assert.equal(chooseMove(S({ rms: 0.01 }), C({ pack: 'rock' })), 'breathe', 'silence → breathe in every pack');
  /* faces follow the pack */
  const love = new Choreographer('music', () => 0.4, 'love'); let f = love.update(0, S(), { ending: false }); for (let b = 0; b < 20; b += 0.1) f = love.update(b, S(), { ending: false });
  assert.equal(f.face, 'dreamy', 'a love song dances with dreamy closed eyes');
  /* peaceful: calm and gentle, never droopy or teary (user, 2026-10-25) */
  const pc = new Choreographer('music', () => 0.4, 'peaceful'); const pcSeen = new Set<string>();
  for (let b = 0; b < 40; b += 0.1) { f = pc.update(b, S(), { ending: false }); pcSeen.add(f.move); assert.equal(f.face, 'calm', 'eyes softly closed');
    assert.ok(f.pose.nod <= 0.01, `no head droop (${f.move} nod ${f.pose.nod})`); assert.ok(f.pose.y <= 0.5, `never sinks (${f.move} y ${f.pose.y})`); }
  assert.ok(PACKS.peaceful.steady.includes(f.move)); assert.ok(pcSeen.has('floatSway') || pcSeen.has('softBreathe'));
  assert.equal(PACKS.peaceful.label, 'Peaceful'); assert.equal(PACKS.peaceful.hit, null, 'never jumps on an ordinary beat'); assert.equal(PACKS.peaceful.accessory, 'sprout');
  assert.ok(!('droop' in MOVES) && !('droopSway' in MOVES), 'the droopy moves are gone');
  /* a hello on play: the first beats are a hop and a wave, then the dance */
  const g = new Choreographer('music', () => 0.4, 'edm', { greet: true }); f = g.update(0.5, S(), { ending: false }); assert.equal(f.move, 'hello');
  assert.ok(f.pose.rSh > 120, 'the hand is up, waving'); for (let b = 0.5; b < 3; b += 0.1) f = g.update(b, S(), { ending: false }); assert.notEqual(f.move, 'hello', 'then it dances');
  assert.equal(new Choreographer('music', () => 0.4, 'edm').update(0.5, S(), { ending: false }).move, 'breathe', 'no greet: the opening breath as before');
  const rap = new Choreographer('music', () => 0.4, 'rap'); const seen = new Set<string>(); for (let b = 0; b < 40; b += 0.1) seen.add(rap.update(b, S(), { ending: false }).move);
  assert.ok([...seen].some(m => PACKS.rap.steady.includes(m as MoveName)), `rap dances rap moves, got ${[...seen]}`);
  assert.equal(new Choreographer('voice', Math.random, 'rap').pack.id, 'voice'); assert.equal(new Choreographer('music', Math.random, 'sfx').pack.id, 'groove', 'music never takes the sfx pack');
}
ok('pack selection: each pack its moves, calm → gentle, drops / loud hits jump, faces per pack');

// ---- the calm-section rule on decibel-scaled frames (the live bug) ----
/* An AnalyserNode's getByteFrequencyData maps decibels to bytes (here -88..-8 dB → 0..255). A breakdown 12 dB softer only drops each byte by
 * ~38, so loudness from the bytes falls by ~25 %: the old "level < 62 % of the last few seconds" rule never fired live. */
const byteOf = (db: number) => Math.max(0, Math.min(255, Math.round(((db + 88) / ANALYSER_DB_RANGE) * 255)));
function songFrames(o: { bpm: number; breakFrom: number; breakTo: number; total: number; dropDb?: number }) {
  const period = 60000 / o.bpm; const frames: { t: number; bins: Uint8Array }[] = [];
  for (let t = 0; t < o.total; t += 16) {
    const brk = t >= o.breakFrom && t < o.breakTo; const after = t >= o.breakTo; const ph = (t % period) / period; const hit = brk ? 0 : ph < 0.15 ? 1 - ph / 0.15 : 0;
    const b = new Uint8Array(128);
    for (let i = 1; i < 128; i++) {
      const pad = brk ? -46 : -38 + (after ? (o.dropDb ?? 2) : 0); const kick = i < 6 ? -10 + 40 * (hit - 1) : i < 20 ? -24 + 36 * (hit - 1) : -70; const hat = i > 24 && !brk && ph > 0.45 && ph < 0.55 ? -32 : -70;
      const db = 10 * Math.log10(10 ** (pad / 10) + 10 ** (kick / 10) + 10 ** (hat / 10)); b[i] = byteOf(db);
    }
    frames.push({ t, bins: b });
  }
  return frames;
}
{
  const fr = songFrames({ bpm: 120, breakFrom: 8000, breakTo: 14000, total: 20000 });
  const s = new MusicSense(); let prev: Uint8Array | null = null; let qIn = 0, nIn = 0, qBeat = 0, nBeat = 0, oldRule = 0, firstQuiet = -1; let dropAt = -1;
  for (const { t, bins } of fr) {
    s.update(featuresFromBins(bins, prev), t); prev = bins; const sn = s.snapshot(t);
    if (t > 8800 && t < 14000) { nIn++; if (sn.quiet) qIn++; if (s.level < s.longRms * 0.62) oldRule++; }
    if (t > 3500 && t < 8000) { nBeat++; if (sn.quiet) qBeat++; }
    if (firstQuiet < 0 && t >= 8000 && sn.quiet) firstQuiet = t;
    if (dropAt < 0 && sn.dropAgo < 40) dropAt = t;
  }
  assert.ok(oldRule / nIn < 0.2, `the old byte-loudness rule misses this breakdown (${oldRule}/${nIn}): the bug, reproduced`);
  assert.ok(qIn / nIn > 0.95, `the breakdown reads as calm on linear loudness (${qIn}/${nIn})`);
  assert.ok(qBeat / nBeat < 0.05, `the beat section is not calm (${qBeat}/${nBeat})`);
  assert.ok(firstQuiet >= 8000 && firstQuiet < 9200, `calm is noticed within ~1 s (${firstQuiet})`);
  assert.ok(dropAt >= 14000 && dropAt < 15500, `the return is a drop (${dropAt})`);
  /* a long, 12 s breakdown stays calm all the way (the loud reference lets go slowly inside a calm section) */
  const long = songFrames({ bpm: 100, breakFrom: 6000, breakTo: 18000, total: 22000 }); const s2 = new MusicSense(); let p2: Uint8Array | null = null; let q2 = 0, n2 = 0;
  for (const { t, bins } of long) { s2.update(featuresFromBins(bins, p2), t); p2 = bins; if (t > 7000 && t < 18000) { n2++; if (s2.snapshot(t).quiet) q2++; } }
  assert.ok(q2 / n2 > 0.95, `a 12 s breakdown stays calm (${q2}/${n2})`);
  /* a steady track that never changes is never calm */
  const flat = songFrames({ bpm: 120, breakFrom: 1e9, breakTo: 1e9, total: 15000 }); const s3 = new MusicSense(); let p3: Uint8Array | null = null; let q3 = 0;
  for (const { t, bins } of flat) { s3.update(featuresFromBins(bins, p3), t); p3 = bins; if (t > 3000 && s3.snapshot(t).quiet) q3++; }
  assert.equal(q3, 0, 'a steady track is never calm');
}
{
  /* live-like: sense → beat clock → choreographer; in the breakdown the bean switches to gentle moves within two beats and stays gentle */
  for (const pack of ['groove', 'rock', 'rap', 'edm'] as const) {
    const fr = songFrames({ bpm: 120, breakFrom: 8000, breakTo: 14000, total: 16000 }); const s = new MusicSense(); const clock = new BeatClock(120);
    let r = 3; const ch = new Choreographer('music', () => ((r = (r * 48271) % 2147483647) / 2147483647), pack); let prev: Uint8Array | null = null; let lastT = 0; let gentleAt = -1; let steadyInBreak = 0;
    for (const { t, bins } of fr) {
      const onset = s.update(featuresFromBins(bins, prev), t); prev = bins; const sn = s.snapshot(t); clock.bpm = sn.bpm; if (onset) clock.onset(); clock.advance((t - lastT) / 1000); lastT = t;
      const f = ch.update(clock.pos, sn, { ending: false });
      const gentle = PACKS[pack].gentle.includes(f.move) || f.move === 'breathe';
      if (t >= 8000 && gentleAt < 0 && gentle) gentleAt = t;
      if (t > 10000 && t < 14000 && !gentle) steadyInBreak++;
    }
    assert.ok(gentleAt >= 8000 && gentleAt < 8000 + 1200 + 2 * 500, `${pack}: gentle within ~2 beats of the breakdown (${gentleAt})`);
    assert.equal(steadyInBreak, 0, `${pack}: no steps inside the breakdown`);
  }
}
ok('calm sections on decibel-scaled frames: the old rule misses them, the new one catches them fast, holds long ones, the dance switches to gentle');

// ---- the rig: no tutu, every pack's look, every face ----
{
  const svg = dancerSvg('t1');
  assert.ok(!/tutu|skirt/i.test(svg), 'no tutu'); assert.ok(!svg.includes('#FFE3D2') && !svg.includes('#E9A27A'), 'none of the old tutu colours');
  assert.ok(!/q-?[\d.]+ 3\.4 -?[\d.]+ 0/.test(svg), 'no scalloped hem');
  for (const p of ['rap', 'love', 'rock', 'edm', 'lofi', 'classical', 'peaceful', 'voice', 'sfx']) assert.ok(svg.includes(`data-acc="${p}"`), `the ${p} look is drawn`);
  assert.ok(!svg.includes('data-acc="sad"') && !svg.includes('data-face-l="sad"') && !svg.includes('#8EC5FF'), 'no tear, no sad face');
  for (const f of FACES) assert.ok(svg.includes(`data-face-l="${f}"`), `face ${f}`);
  assert.ok(!/NaN|undefined/.test(svg));
}
ok('rig: no tutu, every pack look and face drawn');
console.log('bean-style: all ok');
