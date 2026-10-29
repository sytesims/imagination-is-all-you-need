/**
 * The bean's style, heard from the sound itself (pure logic, no DOM, so tests import it). YAMNet (Google's AudioSet classifier, run in the
 * browser by listenStyle.ts) gives 521 class scores averaged over a few windows of the track; this file turns them into one of our style
 * packs (beanStyle.ts) with a confidence, and combines that with the prompt-word guess: the sound wins when it is confident, the words break
 * a tie or fill in when the sound is unsure (silence, a very short clip, a plain "Music" with no genre).
 *
 * CLASS_PACKS is the whole mapping, as data: AudioSet display name → [pack, weight, chip label?]. Classes not listed only count towards the
 * broad groups (music, speech, sound effect) below.
 */
import { PACKS, PACK_IDS, LEGACY_PACKS, toPackId, migrateLabel, type PackId, type StyleGuess } from './beanStyle';

/** [pack, weight, label]: the label names the chip when this class leads its pack (e.g. Jazz → "Jazzy" inside the lo-fi pack). Genres weigh
 *  0.6 or more and count as evidence; instruments and moods (< 0.6) only lean the choice (a drum machine is in hip hop and techno alike). */
export type ClassRule = [PackId, number, string?];

export const CLASS_PACKS: Record<string, ClassRule> = {
  /* rap */
  'Hip hop music': ['rap', 1.2], 'Rapping': ['rap', 1.3], 'Beatboxing': ['rap', 0.8], 'Scratching (performance technique)': ['rap', 0.7],
  /* rock */
  'Rock music': ['rock', 1], 'Heavy metal': ['rock', 1.2], 'Punk rock': ['rock', 1.2], 'Grunge': ['rock', 1.1], 'Progressive rock': ['rock', 1],
  'Rock and roll': ['rock', 1], 'Psychedelic rock': ['rock', 1], 'Angry music': ['rock', 0.6], 'Electric guitar': ['rock', 0.3], 'Distortion': ['rock', 0.25],
  /* EDM / dance */
  'Electronic music': ['edm', 0.9], 'House music': ['edm', 1.1], 'Techno': ['edm', 1.1], 'Dubstep': ['edm', 1.1], 'Drum and bass': ['edm', 1.1],
  'Electronica': ['edm', 0.9], 'Electronic dance music': ['edm', 1.2], 'Trance music': ['edm', 1.1], 'Dance music': ['edm', 0.9], 'Disco': ['edm', 0.9],
  'Exciting music': ['edm', 0.4], 'Drum machine': ['edm', 0.12], 'Synthesizer': ['edm', 0.12], 'Sampler': ['edm', 0.1],
  /* lo-fi / jazz / calm (one pack, three chips) */
  'Jazz': ['lofi', 1.1, 'Jazzy'], 'Blues': ['lofi', 1, 'Jazzy'], 'Swing music': ['lofi', 1, 'Jazzy'], 'Saxophone': ['lofi', 0.4, 'Jazzy'],
  'Double bass': ['lofi', 0.3, 'Jazzy'], 'Vibraphone': ['lofi', 0.35, 'Jazzy'], 'Electric piano': ['lofi', 0.35],
  'Ambient music': ['lofi', 1.1, 'Calm'], 'New-age music': ['lofi', 1.1, 'Calm'], 'Lullaby': ['lofi', 1, 'Calm'], 'Singing bowl': ['lofi', 0.6, 'Calm'],
  'Wind chime': ['lofi', 0.3, 'Calm'], 'Music for children': ['lofi', 0.4, 'Calm'], 'Background music': ['lofi', 0.35], 'Folk music': ['lofi', 0.5], 'Acoustic guitar': ['lofi', 0.2],
  /* classical / epic */
  'Classical music': ['classical', 1.1], 'Orchestra': ['classical', 1], 'Opera': ['classical', 1.1], 'String section': ['classical', 0.6], 'Bowed string instrument': ['classical', 0.4],
  'Violin, fiddle': ['classical', 0.4], 'Cello': ['classical', 0.5], 'Harp': ['classical', 0.4], 'Harpsichord': ['classical', 0.6], 'Pizzicato': ['classical', 0.5],
  'Timpani': ['classical', 0.5], 'French horn': ['classical', 0.4], 'Choir': ['classical', 0.5, 'Epic'], 'Soundtrack music': ['classical', 0.6, 'Epic'],
  'Theme music': ['classical', 0.4, 'Epic'], 'Scary music': ['classical', 0.5, 'Epic'], 'Piano': ['classical', 0.2],
  /* peaceful (slow, tender, wistful: YAMNet's "Sad music") / love */
  'Sad music': ['peaceful', 1.2], 'Crying, sobbing': ['peaceful', 0.4], 'Tender music': ['love', 1.1], 'Wedding music': ['love', 0.9], 'Soul music': ['love', 0.7],
  'Rhythm and blues': ['love', 0.7], 'Pop music': ['love', 0.35], 'Christian music': ['love', 0.3], 'Gospel music': ['love', 0.4],
  /* the neutral groove: music with a clear character that none of our packs fits */
  'Reggae': ['groove', 0.8], 'Ska': ['groove', 0.8], 'Funk': ['groove', 0.7], 'Country': ['groove', 0.7], 'Music of Latin America': ['groove', 0.7], 'Salsa music': ['groove', 0.8],
  'Flamenco': ['groove', 0.8], 'Music of Africa': ['groove', 0.7], 'Music of Asia': ['groove', 0.6], 'Music of Bollywood': ['groove', 0.7], 'Carnatic music': ['groove', 0.7],
  'Middle Eastern music': ['groove', 0.7], 'Traditional music': ['groove', 0.5], 'Happy music': ['groove', 0.5], 'Christmas music': ['groove', 0.6], 'Video game music': ['groove', 0.5],
};

/* The broad groups, by YAMNet class index (AudioSet ontology order in yamnet_class_map.csv). */
const SPEECH = [0, 1, 2, 3, 5, 12]; /* Speech, Child speech, Conversation, Narration, Speech synthesizer, Whispering */
const SINGING = [24, 25, 26, 27, 29, 30, 31, 32]; /* Singing, Choir, Yodeling, Chant, Child singing, Synthetic singing, Rapping, Humming */
const MUSIC = 132; /* "Music"; 133..276 are instruments and genres */
const isMusicIdx = (i: number) => (i >= 132 && i <= 276) || SINGING.includes(i);
/** Not a sound effect: silence, the room, noise floors, TV / radio, field recording. */
const AMBIENT = new Set([494, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 512, 514, 515, 518, 519, 520]);

export type HeardTop = { c: string; s: number };
export type Heard = {
  /** null: nothing confident (silence, too short, unclear), keep the words. */
  pack: PackId | null;
  label: string;
  /** 0..1: how sure the sound is of `pack`. */
  conf: number;
  /** Pack scores from the sound (normalised so they sum to 1 over the music packs; voice / sfx carry their group strength). */
  scores: Partial<Record<PackId, number>>;
  /** The strongest YAMNet classes (for the log and the job meta). */
  top: HeardTop[];
  /** music / speech / sfx group strengths (0..1). */
  groups: { music: number; speech: number; sfx: number; silence: number };
};

/** Above this the sound decides on its own; below it the words decide when they found something. */
export const CONFIDENT = 0.35;
/** Rules at or above this weight are genres (evidence); below, instruments and moods (cues). */
export const GENRE_W = 0.6;

/** Map averaged YAMNet scores (521, in class order) to a pack. `rms`: the decoded audio's loudness (near 0 = silence). */
export function heardFromScores(scores: ArrayLike<number>, names: readonly string[], rms = 1): Heard {
  const n = Math.min(scores.length, names.length);
  const at = (i: number) => (i < n ? Number(scores[i]) || 0 : 0);
  const top: HeardTop[] = [];
  for (let i = 0; i < n; i++) top.push({ c: names[i], s: at(i) });
  top.sort((a, b) => b.s - a.s); top.length = Math.min(top.length, 6);
  const rounded = top.map(t => ({ c: t.c, s: Math.round(t.s * 1000) / 1000 }));

  const speech = Math.min(1, Math.max(...SPEECH.map(at)));
  let musicMax = at(MUSIC); for (let i = 133; i <= 276; i++) musicMax = Math.max(musicMax, at(i)); for (const i of SINGING) musicMax = Math.max(musicMax, at(i) * 0.8);
  let sfx = 0; for (let i = 0; i < n; i++) if (!isMusicIdx(i) && !SPEECH.includes(i) && !AMBIENT.has(i)) sfx = Math.max(sfx, at(i));
  const silence = rms < 0.003 ? 1 : at(494);
  const groups = { music: round(musicMax), speech: round(speech), sfx: round(sfx), silence: round(silence) };
  const none = (): Heard => ({ pack: null, label: '', conf: 0, scores: {}, top: rounded, groups });
  if (silence > 0.5 || (musicMax < 0.08 && speech < 0.15 && sfx < 0.15)) return none();

  /* Pack scores from the mapped classes; a pack's chip label comes from its strongest labelled class. */
  const raw: Partial<Record<PackId, number>> = {}; const lab = new Map<PackId, [string, number]>();
  for (let i = 0; i < n; i++) {
    const r = CLASS_PACKS[names[i]]; if (!r) continue; const v = at(i) * r[1]; if (v <= 0) continue;
    raw[r[0]] = (raw[r[0]] ?? 0) + v;
    const cur = lab.get(r[0]); if (!cur || v > cur[1]) lab.set(r[0], [r[2] ?? '', v]);
  }
  let total = 0; for (const v of Object.values(raw)) total += v ?? 0;
  let genre = 0; for (let i = 0; i < n; i++) { const r = CLASS_PACKS[names[i]]; if (r && r[1] >= GENRE_W) genre += at(i) * r[1]; }
  const norm: Partial<Record<PackId, number>> = {}; for (const [p, v] of Object.entries(raw)) norm[p as PackId] = round((v ?? 0) / (total || 1));

  /* Speech with little music: a voice. Sound with neither: a sound effect. */
  if (speech >= 0.45 && musicMax < 0.3 && speech > musicMax * 1.6) return { pack: 'voice', label: PACKS.voice.label, conf: round(Math.min(1, speech)), scores: { ...norm, voice: round(speech) }, top: rounded, groups };
  if (musicMax < 0.15 && speech < 0.3 && sfx >= 0.1) return { pack: 'sfx', label: PACKS.sfx.label, conf: round(Math.min(1, sfx * 1.2)), scores: { ...norm, sfx: round(sfx) }, top: rounded, groups };

  /* Music: the strongest pack. Confidence = its share of the genre evidence × how much genre evidence there is × how musical it is. */
  let best: PackId | null = null, bestV = 0, second = 0;
  for (const p of PACK_IDS) { const v = norm[p] ?? 0; if (v > bestV) { second = bestV; bestV = v; best = p; } else if (v > second) second = v; }
  if (!best || genre < 0.01) return { ...none(), scores: norm };
  const evidence = Math.min(1, genre / 0.2), musical = Math.min(1, musicMax / 0.4);
  const conf = round(Math.max(0, bestV - 0.5 * second) * 1.6 * evidence * musical);
  const label = (lab.get(best)?.[0] || PACKS[best].label || 'Groove');
  return { pack: best, label, conf: Math.min(1, conf), scores: norm, top: rounded, groups };
}

export type StyleChoice = { pack: PackId; label: string; source: 'heard' | 'words' | 'picked' | 'tool' };

/**
 * The style to dance in: a pick by the user wins; then the sound when confident; then the words (when they found something); then the sound
 * when it found anything at all; else the neutral groove. Voice / SFX tools keep their own pack unless the sound is confident it is music.
 * Tie-break: when the sound's top two packs are close and the words name one of them, the words choose.
 */
export function chooseStyle(words: StyleGuess, heard: Heard | null | undefined, picked?: PackId | null, kind: 'music' | 'voice' | 'sfx' = 'music'): StyleChoice {
  if (picked && PACK_IDS.includes(picked)) return { pack: picked, label: labelOf(picked), source: 'picked' };
  if (kind !== 'music') {
    if (heard?.pack && heard.pack !== 'voice' && heard.pack !== 'sfx' && heard.conf >= 0.6 && (heard.groups.music ?? 0) >= 0.5) return { pack: heard.pack, label: heard.label, source: 'heard' };
    return { pack: kind, label: PACKS[kind].label, source: 'tool' };
  }
  const wordsFound = words.pack !== 'groove';
  if (heard?.pack) {
    const order = PACK_IDS.filter(p => (heard.scores[p] ?? 0) > 0).sort((a, b) => (heard.scores[b] ?? 0) - (heard.scores[a] ?? 0));
    const close = order.length > 1 && (heard.scores[order[0]] ?? 0) - (heard.scores[order[1]] ?? 0) < 0.12;
    if (close && wordsFound && order.slice(0, 2).includes(words.pack) && heard.pack !== 'voice' && heard.pack !== 'sfx') return { pack: words.pack, label: words.label, source: 'words' };
    if (heard.conf >= CONFIDENT) return { pack: heard.pack, label: heard.label, source: 'heard' };
    if (!wordsFound && heard.conf >= 0.12) return { pack: heard.pack, label: heard.label, source: 'heard' };
  }
  return { pack: words.pack, label: words.label, source: 'words' };
}

/** A chip label for every pack (the neutral groove has none of its own). */
export const labelOf = (p: PackId) => PACKS[p].label || 'Groove';

/** A heard result read back from storage (localStorage or the job meta), migrated to today's ids and chip names: 'sad' → 'peaceful',
 *  "Rap mode" → "Hip hop". null when it isn't a heard result. */
export function migrateHeard(h: unknown): Heard | null {
  const o = h as Heard | null;
  if (!o || typeof o !== 'object' || typeof o.conf !== 'number') return null;
  const pack = o.pack === null ? null : toPackId(o.pack); if (o.pack !== null && !pack) return null;
  const scores: Partial<Record<PackId, number>> = {};
  for (const [k, v] of Object.entries(o.scores ?? {})) { const p = toPackId(k); if (p && typeof v === 'number') scores[p] = (scores[p] ?? 0) + v; }
  const changed = pack !== o.pack || migrateLabel(o.label) !== o.label || Object.keys(o.scores ?? {}).some(k => k in LEGACY_PACKS);
  return changed ? { ...o, pack, label: migrateLabel(o.label), scores } : o;
}

/** Where to listen: up to `max` windows of `win` seconds spread over the track (start, middle, later), clamped to its length. Short tracks: the whole thing. */
export function listenWindows(duration: number, win = 4.8, max = 4): { start: number; len: number }[] {
  if (!(duration > 0)) return [];
  /* Every window is `win` long (one input shape: the WebGL backend compiles once per shape). A clip shorter than one window: the whole clip
     (the caller loops it to fill the window). Up to max × win: back-to-back windows, the last one ending at the end. */
  if (duration <= win) return [{ start: 0, len: duration }];
  if (duration <= win * max) { const n = Math.ceil(duration / win - 1e-9); return Array.from({ length: n }, (_, i) => ({ start: Math.min(i * win, duration - win), len: win })); }
  const spots = [0.08, 0.35, 0.6, 0.85].slice(0, max);
  return spots.map(f => ({ start: Math.max(0, Math.min(duration - win, f * duration - win / 2)), len: win }));
}

const round = (v: number) => Math.round(v * 1000) / 1000;
