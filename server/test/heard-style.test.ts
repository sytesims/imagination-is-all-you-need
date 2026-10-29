// The bean hears its style (2026-10-25): web shared/heardStyle.ts maps YAMNet's 521 AudioSet class scores to our style packs (the mapping is
// data: CLASS_PACKS), with a confidence; chooseStyle() combines that with the prompt-word guess (a pick wins; the sound wins when
// confident; the words break a close call or fill in when the sound is unsure); listenWindows() picks where to listen. Also the server's
// danceStyle meta validation (server/src/danceStyle.ts). No floating particles anywhere (user, 2026-10-25).
// Run: npx tsx test/heard-style.test.ts   (no server, no network, no model: synthetic score vectors)
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { CLASS_PACKS, CONFIDENT, GENRE_W, heardFromScores, chooseStyle, listenWindows, labelOf, migrateHeard } from '../../web/src/shared/heardStyle.ts';
import { detectStyle, PACKS, PACK_IDS } from '../../web/src/shared/beanStyle.ts';
import { mergeDanceStyle, cleanHeard, DANCE_PACKS } from '../src/danceStyle.ts';
import { toPackId, migrateLabel } from '../../web/src/shared/beanStyle.ts';
const ok = (m: string) => console.log('ok ' + m);
const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');

/* The class names the app ships (web/public/models/yamnet/classes.json, from yamnet_class_map.csv). */
const NAMES: string[] = JSON.parse(fs.readFileSync(path.join(WEB, 'public/models/yamnet/classes.json'), 'utf8'));
const idx = (n: string) => { const i = NAMES.indexOf(n); assert.ok(i >= 0, `class "${n}" exists`); return i; };
const vec = (o: Record<string, number>) => { const v = new Float32Array(521); for (const [k, s] of Object.entries(o)) v[idx(k)] = s; return v; };

// ---- the mapping table is valid data ----
{
  assert.equal(NAMES.length, 521); assert.equal(NAMES[0], 'Speech'); assert.equal(NAMES[132], 'Music'); assert.equal(NAMES[494], 'Silence');
  for (const [c, [p, w]] of Object.entries(CLASS_PACKS)) { idx(c); assert.ok(PACK_IDS.includes(p), `${c} → ${p}`); assert.ok(w > 0 && w <= 1.5, `${c} weight`); }
  const m = (c: string) => CLASS_PACKS[c][0];
  assert.equal(m('Hip hop music'), 'rap'); assert.equal(m('Rapping'), 'rap');
  for (const c of ['Rock music', 'Heavy metal', 'Punk rock']) assert.equal(m(c), 'rock');
  for (const c of ['Electronic music', 'House music', 'Techno', 'Dubstep', 'Trance music', 'Drum and bass']) assert.equal(m(c), 'edm');
  for (const c of ['Classical music', 'Orchestra', 'Opera']) assert.equal(m(c), 'classical');
  for (const c of ['Jazz', 'Blues']) { assert.equal(m(c), 'lofi'); assert.equal(CLASS_PACKS[c][2], 'Jazzy'); }
  for (const c of ['Ambient music', 'New-age music', 'Lullaby']) { assert.equal(m(c), 'lofi'); assert.equal(CLASS_PACKS[c][2], 'Calm'); }
  assert.equal(m('Sad music'), 'peaceful'); assert.equal(m('Tender music'), 'love'); assert.equal(m('Soul music'), 'love');
  assert.ok(CLASS_PACKS['Drum machine'][1] < GENRE_W && CLASS_PACKS['Synthesizer'][1] < GENRE_W, 'instruments only lean, genres decide');
  assert.ok(!Object.values(PACKS).some(p => 'particles' in p || 'rate' in p), 'no floating particles in any pack');
  for (const p of PACK_IDS) assert.ok(labelOf(p).length > 0, `${p} has a menu label`);
}
ok('mapping table: every class exists, maps to a real pack; genres vs instrument cues; no particles');

// ---- heardFromScores ----
{
  let h = heardFromScores(vec({ Music: 0.95, 'Hip hop music': 0.4, Rapping: 0.3, 'Drum machine': 0.2 }), NAMES);
  assert.equal(h.pack, 'rap'); assert.ok(h.conf >= CONFIDENT, `rap confident (${h.conf})`); assert.equal(h.label, 'Hip hop'); assert.equal(h.top[0].c, 'Music');
  h = heardFromScores(vec({ Music: 0.9, 'Heavy metal': 0.35, 'Rock music': 0.3, 'Electric guitar': 0.4 }), NAMES); assert.equal(h.pack, 'rock'); assert.ok(h.conf >= CONFIDENT);
  h = heardFromScores(vec({ Music: 0.95, Techno: 0.3, 'Electronic music': 0.3, 'House music': 0.1 }), NAMES); assert.equal(h.pack, 'edm'); assert.equal(h.label, 'Party');
  h = heardFromScores(vec({ Music: 0.8, Jazz: 0.25, Saxophone: 0.3 }), NAMES); assert.equal(h.pack, 'lofi'); assert.equal(h.label, 'Jazzy');
  h = heardFromScores(vec({ Music: 0.8, 'Ambient music': 0.3, 'New-age music': 0.2 }), NAMES); assert.equal(h.pack, 'lofi'); assert.equal(h.label, 'Calm');
  h = heardFromScores(vec({ Music: 0.9, Orchestra: 0.4, 'Classical music': 0.3 }), NAMES); assert.equal(h.pack, 'classical');
  h = heardFromScores(vec({ Music: 0.9, 'Sad music': 0.35, Piano: 0.2 }), NAMES); assert.equal(h.pack, 'peaceful'); assert.equal(h.label, 'Peaceful');
  /* speech only → voice; speech over music without genre → nothing confident (the words decide) */
  h = heardFromScores(vec({ Speech: 0.98, 'Narration, monologue': 0.1 }), NAMES); assert.equal(h.pack, 'voice'); assert.equal(h.label, 'Listening');
  h = heardFromScores(vec({ Speech: 0.93, Music: 0.59 }), NAMES); assert.notEqual(h.pack, 'voice', 'speech over music is not a plain voice'); assert.ok(h.pack === null || h.conf < CONFIDENT);
  /* speech over music with a genre → that genre */
  h = heardFromScores(vec({ Speech: 0.7, Music: 0.8, 'Hip hop music': 0.35 }), NAMES); assert.equal(h.pack, 'rap');
  /* non-music sounds → sfx; a steady tone (the mock backend's music) is a dial tone → sfx */
  h = heardFromScores(vec({ Explosion: 0.6, Boom: 0.4 }), NAMES); assert.equal(h.pack, 'sfx'); assert.equal(h.label, 'Sound FX');
  h = heardFromScores(vec({ 'Dial tone': 0.87, 'Sine wave': 0.3 }), NAMES); assert.equal(h.pack, 'sfx');
  /* silence (by score, or by the decoded loudness) → nothing */
  h = heardFromScores(vec({ Silence: 1 }), NAMES); assert.equal(h.pack, null); assert.equal(h.conf, 0);
  h = heardFromScores(vec({ Music: 0.9, Techno: 0.4 }), NAMES, 0.0001); assert.equal(h.pack, null, 'near-silent audio is not trusted');
  /* plain "Music" with no genre → no confident pack; a room tone or noise alone is not a sound effect */
  h = heardFromScores(vec({ Music: 0.85 }), NAMES); assert.ok(h.pack === null || h.conf < 0.12, `plain music unsure (${h.pack} ${h.conf})`);
  h = heardFromScores(vec({ 'Inside, small room': 0.5, 'White noise': 0.4 }), NAMES); assert.notEqual(h.pack, 'sfx');
  /* shorter score arrays / extra names never crash */
  h = heardFromScores(new Float32Array(10), NAMES); assert.equal(h.pack, null);
}
ok('heardFromScores: rap, rock, EDM, jazz, calm, classical, peaceful, voice, speech over music, sfx, tone, silence, plain music');

// ---- chooseStyle: pick > confident sound > words > unsure sound > groove; tie-break by words ----
{
  const words = (prompt: string, kind: 'music' | 'voice' | 'sfx' = 'music') => detectStyle({ prompt, kind });
  const rap = heardFromScores(vec({ Music: 0.95, 'Hip hop music': 0.45, Rapping: 0.3 }), NAMES);
  assert.deepEqual(chooseStyle(words('a soft love ballad'), rap), { pack: 'rap', label: 'Hip hop', source: 'heard' }, 'sound wins when confident');
  assert.equal(chooseStyle(words('a soft love ballad'), rap, 'rock').pack, 'rock', 'a pick wins over everything');
  assert.equal(chooseStyle(words('a soft love ballad'), rap, 'rock').source, 'picked');
  assert.equal(chooseStyle(words('a soft love ballad'), null).pack, 'love', 'no sound heard: the words');
  assert.equal(chooseStyle(words(''), null).pack, 'groove');
  const unsure = heardFromScores(vec({ Music: 0.5, Jazz: 0.03, Techno: 0.025 }), NAMES); /* two weak genres split the evidence */
  assert.ok(unsure.conf < CONFIDENT);
  assert.equal(chooseStyle(words('heavy metal riffs'), unsure).pack, 'rock', 'unsure sound: the words decide');
  if (unsure.pack && unsure.conf >= 0.12) assert.equal(chooseStyle(words(''), unsure).pack, unsure.pack, 'no words: even an unsure sound helps');
  /* close call between two packs: the words choose between them */
  const close = heardFromScores(vec({ Music: 0.95, Techno: 0.3, 'Hip hop music': 0.27 }), NAMES);
  assert.ok(['edm', 'rap'].includes(close.pack!));
  assert.equal(chooseStyle(words('trap beat with hard 808s and bars'), close).pack, 'rap', 'tie → words (rap)');
  assert.equal(chooseStyle(words('euphoric techno rave'), close).pack, 'edm', 'tie → words (edm)');
  /* voice / sfx tools keep their pack unless the sound is surely music */
  assert.equal(chooseStyle(words('', 'voice'), rap, null, 'voice').pack, rap.conf >= 0.6 ? 'rap' : 'voice');
  const speech = heardFromScores(vec({ Speech: 0.99 }), NAMES);
  assert.deepEqual(chooseStyle(words('', 'sfx'), speech, null, 'sfx'), { pack: 'sfx', label: 'Sound FX', source: 'tool' });
  /* a music job that turns out to be speech → Listening */
  assert.equal(chooseStyle(words('upbeat pop song'), speech).pack, 'voice');
  /* a bad pick id is ignored */
  assert.equal(chooseStyle(words('heavy metal'), null, 'polka' as any).pack, 'rock');
}
ok('chooseStyle: pick, confident sound, words, tie-break, tool kinds, speech');

// ---- where to listen ----
{
  assert.deepEqual(listenWindows(0), []); assert.deepEqual(listenWindows(NaN), []);
  assert.deepEqual(listenWindows(1.2), [{ start: 0, len: 1.2 }], 'very short clip: whole');
  const mid = listenWindows(15); assert.equal(mid.length, 4); assert.ok(mid.every(x => x.len === 4.8), 'one window size (one WebGL shape)');
  assert.equal(mid[0].start, 0); assert.ok(Math.abs(mid[3].start + 4.8 - 15) < 1e-9, 'the last window ends at the end');
  assert.deepEqual(listenWindows(4.8), [{ start: 0, len: 4.8 }]);
  const w = listenWindows(600); assert.equal(w.length, 4); assert.ok(w.every(x => x.len === 4.8 && x.start >= 0 && x.start + x.len <= 600));
  assert.ok(w[0].start < 60 && w[1].start > 150 && w[3].start > 450, 'start, middle, later');
  assert.ok(w.reduce((a, x) => a + x.len, 0) <= 20, 'never more than ~20 s heard');
}
ok('listenWindows: short whole, long four spread windows, ≤ 20 s');

// ---- server meta ----
{
  assert.deepEqual([...DANCE_PACKS].sort(), [...PACK_IDS].sort(), 'server and web agree on the pack ids');
  const h = heardFromScores(vec({ Music: 0.95, 'Hip hop music': 0.45 }), NAMES);
  const a = mergeDanceStyle(null, { heard: h }); assert.ok(typeof a !== 'string'); assert.equal(a.heard!.pack, 'rap'); assert.equal(a.picked, null);
  const b = mergeDanceStyle(a, { picked: 'love' }); assert.ok(typeof b !== 'string'); assert.equal(b.picked, 'love'); assert.equal(b.heard!.pack, 'rap', 'a pick keeps what was heard');
  const c = mergeDanceStyle(b, { picked: null }); assert.ok(typeof c !== 'string'); assert.equal(c.picked, null);
  assert.equal(typeof mergeDanceStyle(a, { picked: 'polka' }), 'string'); assert.equal(typeof mergeDanceStyle(a, {}), 'string'); assert.equal(typeof mergeDanceStyle(a, null), 'string');
  assert.equal(typeof mergeDanceStyle(a, { heard: { pack: 'nope', conf: 1 } }), 'string');
  const big = cleanHeard({ pack: 'edm', label: 'x'.repeat(200), conf: 7, top: Array.from({ length: 50 }, (_, i) => ({ c: 'c' + i, s: i })), groups: { music: 2, junk: 1 }, scores: { edm: 0.5, polka: 1 } })!;
  assert.equal(big.label.length, 40); assert.equal(big.conf, 1); assert.equal(big.top.length, 8); assert.deepEqual(Object.keys(big.groups), ['music']); assert.deepEqual(Object.keys(big.scores), ['edm']);
}
ok('server danceStyle meta: merge, clear, validation, size caps');

// ---- the sad → peaceful rename (user, 2026-10-25): saved picks and heard results keep working ----
{
  assert.equal(toPackId('sad'), 'peaceful'); assert.equal(toPackId('peaceful'), 'peaceful'); assert.equal(toPackId('rap'), 'rap');
  assert.equal(toPackId('polka'), null); assert.equal(toPackId(null), null); assert.equal(toPackId(7), null);
  assert.equal(migrateLabel('Sad song'), 'Peaceful'); assert.equal(migrateLabel('Rap mode'), 'Hip hop'); assert.equal(migrateLabel('Jazz mode'), 'Jazzy'); assert.equal(migrateLabel('Party'), 'Party'); assert.equal(migrateLabel(undefined), '');
  /* a heard result saved before the rename (localStorage or job meta) */
  const old = { pack: 'sad', label: 'Sad song', conf: 0.6, scores: { sad: 0.7, love: 0.2 }, top: [{ c: 'Sad music', s: 0.4 }], groups: { music: 0.9, speech: 0, sfx: 0, silence: 0 } };
  const m = migrateHeard(old)!; assert.equal(m.pack, 'peaceful'); assert.equal(m.label, 'Peaceful'); assert.deepEqual(m.scores, { peaceful: 0.7, love: 0.2 });
  assert.equal(old.pack, 'sad', 'the stored object is not mutated');
  assert.equal(migrateHeard({ pack: 'rap', label: 'Rap mode', conf: 0.5, scores: { rap: 1 }, top: [], groups: {} })!.label, 'Hip hop');
  const cur = heardFromScores(vec({ Music: 0.95, 'Hip hop music': 0.45 }), NAMES); assert.equal(migrateHeard(cur), cur, 'a current result comes back as is');
  assert.equal(migrateHeard({ pack: null, label: '', conf: 0, scores: {}, top: [], groups: {} })!.pack, null, 'nothing heard stays nothing');
  assert.equal(migrateHeard({ pack: 'polka', conf: 1 }), null); assert.equal(migrateHeard(null), null); assert.equal(migrateHeard('x'), null); assert.equal(migrateHeard({ pack: 'rap' }), null, 'no confidence: not a heard result');
  /* chooseStyle with an old pick / old heard: dances peaceful */
  assert.equal(chooseStyle(detectStyle({ prompt: 'heavy metal' }), m, toPackId('sad')).pack, 'peaceful');
  assert.deepEqual(chooseStyle(detectStyle({ prompt: '' }), m), { pack: 'peaceful', label: 'Peaceful', source: 'heard' });
  /* the server: an old body or an old saved meta is migrated, never rejected */
  const a = mergeDanceStyle({ heard: old as any, picked: 'sad' as any, at: 1 }, { picked: 'love' }); assert.ok(typeof a !== 'string'); assert.equal(a.picked, 'love'); assert.equal(a.heard!.pack, 'peaceful'); assert.deepEqual(a.heard!.scores, { peaceful: 0.7, love: 0.2 });
  const b = mergeDanceStyle({ heard: null, picked: 'sad' as any, at: 1 }, { heard: null }); assert.ok(typeof b !== 'string'); assert.equal(b.picked, 'peaceful', 'an old saved pick reads as peaceful');
  const c = mergeDanceStyle(null, { picked: 'sad' }); assert.ok(typeof c !== 'string'); assert.equal(c.picked, 'peaceful', 'an old page sending sad is understood');
  assert.equal(cleanHeard(old)!.pack, 'peaceful');
  assert.ok(!(DANCE_PACKS as readonly string[]).includes('sad') && !PACK_IDS.includes('sad' as any), 'sad is no longer a pack id');
}
ok('sad → peaceful: ids, chip names, heard results, picks, server meta');

// YAMNet's lazy TF.js imports split the worker into chunks: Vite's default IIFE output cannot build them.
{
  const config = (await import('../../web/vite.config.ts')).default as { worker?: { format?: string } };
  assert.equal(config.worker?.format, 'es', 'production audio-analysis worker supports dynamic-import chunks');
}
ok('production worker: ES module output supports lazy TF.js chunks');

console.log('heard-style: all ok');
