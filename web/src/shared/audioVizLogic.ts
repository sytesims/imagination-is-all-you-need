/**
 * Pure logic behind the living audio cards (AudioCard, the viewer's audio stage, Assets tiles): the generated cover (palette + shapes from the
 * prompt's genre and mood words, deterministic per job), the beat detector the bean dances to, and the analyser maths (bar levels, loudness,
 * how often a note floats up). No React, no DOM, so tests import it.
 */

export type AudioKind = 'music' | 'voice' | 'sfx';
export type CoverMood = 'dusk' | 'ember' | 'neon' | 'sunrise' | 'mist' | 'fire' | 'earth' | 'bloom' | 'dawn' | 'brand';
export type Palette = { a: string; b: string; c: string };

/** a: the main glow, b: the second glow, c: the highlight for lines and sparks. Every palette keeps a warm note so the brand reads through. */
export const PALETTES: Record<CoverMood, Palette> = {
  brand: { a: '#FF7A1A', b: '#FFB27A', c: '#FFD9BC' },
  dusk: { a: '#5B4BDB', b: '#FF8A3D', c: '#FFC9A3' },
  ember: { a: '#C2361B', b: '#FF7A1A', c: '#FFD0A8' },
  neon: { a: '#D63CF0', b: '#FF6A3D', c: '#7FE7FF' },
  sunrise: { a: '#FF9F2E', b: '#FF5E8A', c: '#FFE48A' },
  mist: { a: '#3FB8A6', b: '#9B86F2', c: '#D8FFF5' },
  fire: { a: '#E5321B', b: '#FF8A1A', c: '#FFE0B0' },
  earth: { a: '#C98A2E', b: '#7A9A3A', c: '#F5DDAF' },
  /* the soft ones (2026-10-25): rose and peach for love songs, lavender and peach for wistful, hopeful tracks */
  bloom: { a: '#F27BA3', b: '#FFB27A', c: '#FFE3EC' },
  dawn: { a: '#9C8CF0', b: '#FFB38A', c: '#FFE9D6' },
};

/** Genre and mood words per palette (whole words, any case). The palette with the most hits wins; ties go to the first in this list. */
const MOOD_WORDS: [CoverMood, RegExp][] = [
  ['neon', /\b(synth\w*|80s|neon|retro|electro\w*|edm|techno|house|trance|dance|club|cyber\w*|disco|arcade|chiptune|8-?bit|future\w*|vaporwave)\b/gi],
  ['ember', /\b(epic|orchestra\w*|cinematic|trailer|dark|heroic|choir|dramatic|battle|war|tension|suspense|horror|thriller|ominous|brass)\b/gi],
  ['fire', /\b(rock|metal|punk|aggressive|heavy|grunge|distorted|angry|rage|hardcore|riff\w*|explosion|fire)\b/gi],
  ['dusk', /\b(lo-?fi|chill\w*|jazz\w*|rain\w*|night\w*|mellow|study|vinyl|rhodes|nocturn\w*|midnight|smooth|r&b|soul|noir|late)\b/gi],
  ['sunrise', /\b(happy|pop|upbeat|summer|sunny|bright|joyful|cheerful|fun|tropical|reggae\w*|latin|party|uplifting|kids?|morning)\b/gi],
  ['mist', /\b(ambient|calm|peaceful|piano|meditat\w*|soft|dream\w*|ethereal|relax\w*|serene|gentle|ocean|wind|space|airy|lullaby|spa)\b/gi],
  ['earth', /\b(acoustic|folk|country|guitar|banjo|blues|bluegrass|western|campfire|forest|nature|wood\w*|rustic|world|celtic)\b/gi],
  ['bloom', /\b(love|lovers?|romant\w*|tender|ballad|wedding|sweet\w*|heart\w*|valentine|crush|darling)\b/gi],
  ['dawn', /\b(sad\w*|wistful|melanchol\w*|hopeful|nostalg\w*|bittersweet|goodbye|healing|lonely|tearful|longing|tranquil)\b/gi],
];
const FAST = /\b(fast|upbeat|driving|energetic|punchy|dance|drums?|bass|hype|intense|epic|aggressive|explosion|rapid|run\w*|speed|loud|heavy|bpm\s*1[3-9]\d)\b/gi;
const SLOW = /\b(slow|calm|soft|ambient|mellow|chill\w*|gentle|quiet|lullaby|peaceful|sleep\w*|relax\w*|whisper\w*|bpm\s*[5-8]\d)\b/gi;

/** FNV-1a, 32-bit: a stable number from any string (same job → same cover everywhere). */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** A small seeded random (mulberry32): the same seed gives the same sequence. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hits = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/** The palette a prompt's words point to ('brand' orange when nothing matches). */
export function moodOf(prompt: string | null | undefined): CoverMood {
  const s = String(prompt ?? ''); let best: CoverMood = 'brand'; let n = 0;
  for (const [m, re] of MOOD_WORDS) { const k = hits(re, s); if (k > n) { n = k; best = m; } }
  return best;
}
/** 0 (calm) .. 1 (driving): how busy the cover's lines are. 0.5 when the prompt says nothing either way. */
export function energyOf(prompt: string | null | undefined): number {
  const s = String(prompt ?? ''); const f = hits(FAST, s), w = hits(SLOW, s);
  return Math.max(0, Math.min(1, 0.5 + 0.18 * (f - w)));
}

/** Which family a result belongs to, from its workflow / mode / tool: a voice (speech bubble), a sound effect (sparks) or music (vinyl). */
export function audioKindOf(o: { toolId?: string | null; mode?: string | null; workflow?: string | null }): AudioKind {
  const m = String(o.workflow ?? o.mode ?? '').toLowerCase(); const t = String(o.toolId ?? '').toLowerCase();
  if (/^(sfx|soundtrack-sound|v2s|sound)$/.test(m)) return 'sfx';
  if (/^(voiceover|change-voice|translate|tts|voice|clone)$/.test(m) || (!m && t === 'voice')) return 'voice';
  if (t === 'voice' && !/^(music|cover)$/.test(m)) return 'voice';
  return 'music';
}
/** The same, read off a job (input.types[0] or input.mode, then the tool). */
export const audioKindOfJob = (j: { toolId?: string | null; input?: any } | null | undefined): AudioKind =>
  audioKindOf({ toolId: j?.toolId, mode: j?.input?.types?.[0] ?? j?.input?.mode ?? null });

export type Blob = { x: number; y: number; r: number; color: string; o: number };
export type CoverSpec = {
  kind: AudioKind; mood: CoverMood; palette: Palette; energy: number;
  /** Background glows, in a 320 × 180 box. */
  blobs: Blob[];
  /** Music: vinyl rings (centre and radii); voice: the bubble's corner; sfx: the burst's centre. */
  cx: number; cy: number; rings: number[];
  /** Flowing lines (music) / sound arcs (voice) / rays (sfx), as SVG path data. */
  lines: string[];
  /** Sfx: spark positions. */
  sparks: { x: number; y: number; s: number }[];
};
export const COVER_W = 320; export const COVER_H = 180;

/** The cover for one result: deterministic from the seed (the job id), shaped by its prompt and kind. */
export function coverOf({ seed, prompt, kind = 'music' }: { seed: string; prompt?: string | null; kind?: AudioKind }): CoverSpec {
  const mood = moodOf(prompt); const palette = PALETTES[mood]; const energy = energyOf(prompt);
  const r = seeded(hashStr(`${kind}|${seed}|${prompt ?? ''}`)); const W = COVER_W, H = COVER_H;
  const blobs: Blob[] = [
    { x: W * (0.15 + 0.3 * r()), y: H * (0.2 + 0.5 * r()), r: 110 + 50 * r(), color: palette.a, o: 0.55 },
    { x: W * (0.55 + 0.35 * r()), y: H * (0.3 + 0.6 * r()), r: 90 + 50 * r(), color: palette.b, o: 0.45 },
    { x: W * r(), y: H * r(), r: 50 + 30 * r(), color: palette.c, o: 0.16 },
  ];
  const f = (n: number) => +n.toFixed(1);
  const lines: string[] = []; const sparks: CoverSpec['sparks'] = []; let rings: number[] = []; let cx = 0, cy = 0;
  if (kind === 'music') {
    cx = W * (0.68 + 0.18 * r()); cy = H * (0.35 + 0.35 * r());
    const n = 5 + Math.round(3 * r()); rings = Array.from({ length: n }, (_, i) => f(26 + i * (12 + 4 * r())));
    const count = 2 + Math.round(3 * energy); const amp = 6 + 22 * energy; const waves = 1.2 + 3.5 * energy;
    for (let k = 0; k < count; k++) {
      const y0 = H * (0.42 + 0.4 * r()); const ph = r() * Math.PI * 2; const a = amp * (0.5 + 0.6 * r()); let d = `M0 ${f(y0)}`;
      for (let x = 8; x <= W; x += 8) d += ` L${x} ${f(y0 + a * Math.sin(ph + (x / W) * Math.PI * 2 * waves))}`;
      lines.push(d);
    }
  } else if (kind === 'voice') {
    cx = W * (0.2 + 0.25 * r()); cy = H * (0.28 + 0.2 * r());
    for (let k = 1; k <= 3; k++) { const rr = 18 + k * 16; const x = cx + 92; const y = cy + 34; lines.push(`M${f(x + rr * Math.cos(-0.7))} ${f(y + rr * Math.sin(-0.7))} A${rr} ${rr} 0 0 1 ${f(x + rr * Math.cos(0.7))} ${f(y + rr * Math.sin(0.7))}`); }
  } else {
    cx = W * (0.4 + 0.25 * r()); cy = H * (0.38 + 0.25 * r());
    const rays = 10 + Math.round(6 * energy);
    for (let k = 0; k < rays; k++) { const ang = (k / rays) * Math.PI * 2 + r() * 0.3; const r0 = 18 + 8 * r(), r1 = 50 + 60 * r(); lines.push(`M${f(cx + r0 * Math.cos(ang))} ${f(cy + r0 * Math.sin(ang))} L${f(cx + r1 * Math.cos(ang))} ${f(cy + r1 * Math.sin(ang))}`); }
    for (let k = 0; k < 6; k++) sparks.push({ x: f(W * r()), y: f(H * r()), s: f(3 + 6 * r()) });
  }
  return { kind, mood, palette, energy, blobs, cx: f(cx), cy: f(cy), rings, lines, sparks };
}

/* ---------------- analyser maths ---------------- */

/** 0..1 loudness of the bins in [from, to): the root mean square of byte magnitudes. */
export function energyOfBins(bins: ArrayLike<number>, from = 0, to = bins.length): number {
  const a = Math.max(0, from), b = Math.min(bins.length, to); if (b <= a) return 0;
  let s = 0; for (let i = a; i < b; i++) { const v = bins[i] / 255; s += v * v; }
  return Math.sqrt(s / (b - a));
}

/** One 0..1 level per waveform bar from an analyser's frequency bins: bars spread over the musical range on a power curve (more bars for the lows and mids, low on the left),
 *  with a gentle lift for the highs so the right side moves too. Reuses `out` when its length fits. */
export function barLevels(bins: ArrayLike<number>, bars: number, out?: number[]): number[] {
  const res = out && out.length === bars ? out : new Array<number>(bars);
  const top = Math.max(2, Math.floor(bins.length * 0.72)); /* the top bins are mostly empty */
  for (let i = 0; i < bars; i++) {
    const lo = 1 + Math.floor((top - 1) * Math.pow(i / bars, 1.7)); const hi = Math.max(lo + 1, 1 + Math.floor((top - 1) * Math.pow((i + 1) / bars, 1.7)));
    let m = 0; for (let j = lo; j < hi && j < bins.length; j++) if (bins[j] > m) m = bins[j];
    res[i] = Math.min(1, (m / 255) * (1 + 0.6 * (i / bars)));
  }
  return res;
}

/** No analyser (another site's file, no Web Audio): a believable level from the decoded peaks around the play head, with a little shimmer. */
export function peakLevel(peaks: ArrayLike<number>, t: number, duration: number, nowMs: number): number {
  if (!peaks.length || !(duration > 0)) return 0.4 + 0.25 * Math.abs(Math.sin(nowMs / 180));
  const i = Math.max(0, Math.min(peaks.length - 1, Math.floor((t / duration) * peaks.length)));
  return Math.max(0, Math.min(1, peaks[i] * (0.75 + 0.25 * Math.abs(Math.sin(nowMs / 140)))));
}

export type BeatOptions = {
  /** A beat is energy this many times above the running average... */
  ratio: number;
  /** ...and above this floor (0..1), so near-silence never "beats"... */
  floor: number;
  /** ...and at least this long after the last beat (ms): 260 ms caps it near 230 BPM. */
  minGapMs: number;
  /** How slowly the running average follows (0..1 per frame; higher = slower). */
  smooth: number;
  /** A steady sound with no clear onsets still gets a gentle bob this often (ms), so the bean never freezes mid-song. 0: off. */
  idleBeatMs: number;
};
export const BEAT_DEFAULTS: BeatOptions = { ratio: 1.3, floor: 0.12, minGapMs: 260, smooth: 0.9, idleBeatMs: 640 };

/** Simple energy beat detector: feed it the low-band energy each frame; `update` says whether this frame is a beat. */
export class BeatTracker {
  avg = -1; last = -Infinity; readonly o: BeatOptions;
  constructor(o: Partial<BeatOptions> = {}) { this.o = { ...BEAT_DEFAULTS, ...o }; }
  update(energy: number, nowMs: number): boolean {
    const e = isFinite(energy) ? Math.max(0, energy) : 0;
    if (this.avg < 0) { this.avg = e; return false; }
    const gap = nowMs - this.last; const loudEnough = e > this.o.floor;
    const beat = loudEnough && gap >= this.o.minGapMs && (e > this.avg * this.o.ratio || (this.o.idleBeatMs > 0 && gap >= this.o.idleBeatMs));
    if (beat) this.last = nowMs;
    this.avg = this.avg * this.o.smooth + e * (1 - this.o.smooth);
    return beat;
  }
  reset() { this.avg = -1; this.last = -Infinity; }
}

