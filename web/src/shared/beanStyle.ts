/**
 * The dancing bean's style packs (pure logic, no DOM, so tests import it): which character a track has, read from the job's words (the prompt /
 * style tags and the lyrics) and its kind, and what that means for the bean: a move set and a look (accessory + faces). heardStyle.ts can
 * override the words with what the sound itself is (YAMNet, in the browser).
 *
 *   rap (head nods, shoulder bounce, arm gestures; cap + chain)      love (slow sway, hand on heart; blush, eyes closed)
 *   rock (headbang, air guitar, jumps; headband)                     edm (arms up, bounce, jumps on drops; shades)
 *   lofi (gentle nod; headphones)                                     classical (ballet + conducting; bow tie + baton)
 *   peaceful (slow sway, soft breathing, arms float; eyes softly closed; a little sprout)   voice (listening nods; headset)
 *   sfx (startle / spin; goggles)   groove (unknown: neutral)
 *
 * Chip names are plain and friendly ("Hip hop", "Party", "Chill", "Peaceful"...). The peaceful pack was called "sad" until 2026-10-25: saved
 * picks and heard results that say 'sad' (or an old chip name like "Rap mode") are read through toPackId / migrateLabel, so nothing is lost.
 *
 * The pack is the base; danceLogic's chooseMove still follows the live sound (a rap track still jumps on a big drop, a ballad goes calm in a
 * breakdown).
 */
import type { MoveName, Face } from './danceLogic';

export type PackId = 'rap' | 'love' | 'rock' | 'edm' | 'lofi' | 'classical' | 'peaceful' | 'voice' | 'sfx' | 'groove';
export const PACK_IDS: PackId[] = ['rap', 'love', 'rock', 'edm', 'lofi', 'classical', 'peaceful', 'voice', 'sfx', 'groove'];
export type Accessory = 'cap' | 'heart' | 'headband' | 'shades' | 'headphones' | 'bowtie' | 'sprout' | 'headset' | 'goggles' | 'none';

/** Old pack ids still found in saved picks / heard results (localStorage, job meta) → today's id. */
export const LEGACY_PACKS: Record<string, PackId> = { sad: 'peaceful' };
/** A saved pack id, migrated ('sad' → 'peaceful'); null when it isn't one. */
export const toPackId = (v: unknown): PackId | null => {
  if (typeof v !== 'string') return null; const p = (LEGACY_PACKS[v] ?? v) as PackId; return PACK_IDS.includes(p) ? p : null;
};
/** Old chip names (before 2026-10-25) → today's friendly ones; anything else unchanged. */
export const LEGACY_LABELS: Record<string, string> = { 'Rap mode': 'Hip hop', 'Rock mode': 'Rock out', 'Dance mode': 'Party', 'Chill mode': 'Chill', 'Ballet mode': 'Ballet',
  'Sad song': 'Peaceful', 'Jazz mode': 'Jazzy', 'Calm mode': 'Calm', 'Epic mode': 'Epic', 'Groove mode': 'Groove' };
export const migrateLabel = (l: unknown): string => { const s = typeof l === 'string' ? l : ''; return LEGACY_LABELS[s] ?? s; };

export type Pack = {
  id: PackId;
  /** The small chip on the card ('' = none). */
  label: string;
  /** steady beat / calm section or slow tempo / rising energy / a bass hit / a drop / near silence. */
  steady: MoveName[]; gentle: MoveName[]; lift: MoveName[]; hit: MoveName | null; drop: MoveName; rest: MoveName;
  /** Moves bigger (1) or smaller for this style: a ballad never flails. */
  scale: number;
  /** Faces: the move's own face is swapped through this map (a love song turns every smile dreamy). */
  faces?: Partial<Record<Face, Face>>;
  accessory: Accessory;
};

export const PACKS: Record<PackId, Pack> = {
  rap: { id: 'rap', label: 'Hip hop', steady: ['rapNod', 'shoulderBounce', 'rapGesture', 'rapNod', 'rapGesture'], gentle: ['rapNod', 'chillNod'], lift: ['rapGesture', 'shoulderBounce'],
    hit: 'saute', drop: 'saute', rest: 'rapNod', scale: 1, faces: { smile: 'cool', happy: 'cool' }, accessory: 'cap' },
  love: { id: 'love', label: 'Love song', steady: ['slowSway', 'heartHands', 'slowSway', 'sway'], gentle: ['slowSway', 'heartHands'], lift: ['heartHands', 'portDeBras'],
    hit: null, drop: 'spin', rest: 'slowSway', scale: 0.85, faces: { smile: 'dreamy', happy: 'dreamy', wink: 'dreamy' }, accessory: 'heart' },
  rock: { id: 'rock', label: 'Rock out', steady: ['headbang', 'airGuitar', 'headbang', 'airGuitar', 'rockJump'], gentle: ['airGuitar', 'headBob'], lift: ['rockJump', 'airGuitar'],
    hit: 'rockJump', drop: 'rockJump', rest: 'headBob', scale: 1, faces: { smile: 'shout', happy: 'shout' }, accessory: 'headband' },
  edm: { id: 'edm', label: 'Party', steady: ['bounce', 'armsUp', 'bounce', 'sideStep', 'armsUp'], gentle: ['sway', 'chillSway'], lift: ['armsUp', 'flourish'],
    hit: 'saute', drop: 'saute', rest: 'bounce', scale: 1, accessory: 'shades' },
  lofi: { id: 'lofi', label: 'Chill', steady: ['chillNod', 'chillSway', 'chillNod'], gentle: ['chillNod', 'chillSway'], lift: ['chillSway', 'headBob'],
    hit: null, drop: 'sway', rest: 'chillNod', scale: 0.8, faces: { smile: 'dreamy', happy: 'dreamy' }, accessory: 'headphones' },
  classical: { id: 'classical', label: 'Ballet', steady: ['plie', 'conduct', 'arabesque', 'portDeBras', 'conduct'], gentle: ['portDeBras', 'sway', 'conduct'], lift: ['releve', 'flourish'],
    hit: 'saute', drop: 'pirouette', rest: 'breathe', scale: 1, accessory: 'bowtie' },
  /* calm and gentle, never droopy: a slow sway, soft breathing, arms that float up and down, eyes softly closed */
  peaceful: { id: 'peaceful', label: 'Peaceful', steady: ['floatSway', 'softBreathe', 'floatSway', 'armFloat'], gentle: ['softBreathe', 'floatSway'], lift: ['armFloat', 'floatSway'],
    hit: null, drop: 'armFloat', rest: 'softBreathe', scale: 0.85, faces: { smile: 'calm', happy: 'calm', wink: 'calm', dreamy: 'calm' }, accessory: 'sprout' },
  voice: { id: 'voice', label: 'Listening', steady: ['listen'], gentle: ['listen'], lift: ['listen'], hit: null, drop: 'listen', rest: 'breathe', scale: 1,
    accessory: 'headset' },
  sfx: { id: 'sfx', label: 'Sound FX', steady: ['sway'], gentle: ['sway'], lift: ['spin'], hit: 'startle', drop: 'spin', rest: 'breathe', scale: 1,
    accessory: 'goggles' },
  groove: { id: 'groove', label: '', steady: ['sideStep', 'headBob', 'bounce', 'plie', 'sideStep'], gentle: ['sway', 'portDeBras'], lift: ['flourish', 'releve'],
    hit: 'saute', drop: 'spin', rest: 'breathe', scale: 1, accessory: 'none' },
};

/* ---------------- detection from words ---------------- */

type Rule = { pack: PackId; re: RegExp; w?: number; label?: string };
/** Whole words, any case. A rule's weight (default 1) counts per hit; the prompt / style tags count double the lyrics. */
const RULES: Rule[] = [
  { pack: 'lofi', re: /\b(lo-?fi|chill\w*|chillhop|study|mellow|vinyl|rhodes|laid-?back|cozy|coffee|downtempo|bossa)\b/gi, w: 1.6 },
  { pack: 'lofi', re: /\b(jazz\w*|swing|bebop|smooth)\b/gi, w: 1.3, label: 'Jazzy' },
  { pack: 'lofi', re: /\b(ambient|calm|lullaby|meditat\w*|relax\w*|sleep\w*|soothing)\b/gi, w: 1.1, label: 'Calm' },
  { pack: 'rap', re: /\b(rap\w*|hip-?hop|trap|drill|boom-?bap|grime|freestyle|bars|mc|808s?|flow|rhymes?|mic)\b/gi, w: 1.4 },
  { pack: 'love', re: /\b(love|lovers?|loving|romant\w*|ballad|heart\w*|darling|kiss\w*|tender|valentine|wedding|crush|sweetheart|forever|baby|honey)\b/gi },
  { pack: 'rock', re: /\b(rock\w*|metal\w*|punk|grunge|riffs?|shred\w*|headbang\w*|distort\w*|guitar solo|hard rock|power chords?|mosh)\b/gi, w: 1.4 },
  { pack: 'edm', re: /\b(edm|house|techno|trance|dubstep|electro\w*|rave|club|dance\w*|disco|drum and bass|dnb|synth-?pop|synthwave|big room|euphoric|drop)\b/gi, w: 1.2 },
  { pack: 'classical', re: /\b(classical|orchestra\w*|symphon\w*|ballet|piano sonata|concerto|strings|string quartet|baroque|waltz|opera\w*|chamber|violin|cello)\b/gi, w: 1.3 },
  { pack: 'classical', re: /\b(epic|cinematic|trailer|heroic|choir)\b/gi, w: 1.1, label: 'Epic' },
  /* slow, tender or wistful songs (sad words included) dance the peaceful pack: calm, not gloomy */
  { pack: 'peaceful', re: /\b(sad\w*|melanchol\w*|heartbreak\w*|heartbroken|lonely|loneliness|grief|tears?|cry\w*|sorrow\w*|blue|goodbye|miss you|rain\w*|somber|mourn\w*|wistful)\b/gi, w: 1.2 },
  { pack: 'peaceful', re: /\b(peaceful|serene|tranquil|gentle|hopeful|healing|floating|stillness)\b/gi, w: 1.2 },
];
const SECTION_TAGS: [RegExp, PackId, number][] = [[/\[(rap|verse \d*:? ?rap|freestyle)[^\]]*\]/gi, 'rap', 2], [/\[(guitar solo|breakdown: guitar)[^\]]*\]/gi, 'rock', 1.5], [/\[(drop|build-?up)[^\]]*\]/gi, 'edm', 1.5]];

export type StyleGuess = { pack: PackId; label: string; scores: Record<PackId, number> };

/** The pack for one result: a voice or a sound effect keeps its own pack; music is scored from the prompt (x2) and the lyrics (x1). Heartbreak
 *  words lift "peaceful" over "love"; "lo-fi hip hop" is chill, not rap. Nothing clear (score < 1): the neutral groove. */
export function detectStyle(o: { prompt?: string | null; lyrics?: string | null; kind?: 'music' | 'voice' | 'sfx' }): StyleGuess {
  const scores = Object.fromEntries(PACK_IDS.map(p => [p, 0])) as Record<PackId, number>; const byLabel = new Map<string, number>(); /* "pack|label" → score: the strongest rule names the chip */
  if (o.kind === 'voice' || o.kind === 'sfx') { scores[o.kind] = 99; return { pack: o.kind, label: PACKS[o.kind].label, scores }; }
  const prompt = String(o.prompt ?? ''), lyrics = String(o.lyrics ?? '').slice(0, 4000);
  for (const [text, mul] of [[prompt, 2], [lyrics, 1]] as const) {
    if (!text) continue;
    for (const r of RULES) { const n = (text.match(r.re) ?? []).length; if (!n) continue; const add = n * (r.w ?? 1) * mul; scores[r.pack] += add;
      const key = `${r.pack}|${r.label ?? ''}`; byLabel.set(key, (byLabel.get(key) ?? 0) + add); }
    for (const [re, p, w] of SECTION_TAGS) scores[p] += (text.match(re) ?? []).length * w;
  }
  if (/\blo-?fi\b/i.test(prompt) && scores.rap > 0) scores.rap *= 0.4; /* lo-fi hip hop: chill */
  if (scores.peaceful > 0 && scores.love > 0) scores.peaceful += 0.5; /* heartbreak songs mention love too */
  let best: PackId = 'groove', top = 0;
  for (const p of PACK_IDS) if (p !== 'voice' && p !== 'sfx' && p !== 'groove' && scores[p] > top + 1e-9) { top = scores[p]; best = p; }
  if (top < 1) best = 'groove';
  let label = PACKS[best].label, bestN = 0;
  for (const [key, n] of byLabel) { const [p, l] = key.split('|'); if (p === best && n > bestN) { bestN = n; label = l || PACKS[best].label; } }
  return { pack: best, label, scores };
}

/** The face to show: the move's face through the pack's map. */
export const packFace = (pack: Pack, f: Face): Face => pack.faces?.[f] ?? f;
