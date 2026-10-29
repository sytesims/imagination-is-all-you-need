/**
 * Stitch timeline math, shared by the server's ffmpeg export (agentBudget.ts POST /api/compose → compose.ts) and the web panel's preview
 * (ui/video/StitchPanel.tsx), so the length, the transition overlaps, the title / end card windows and the output frame agree to the frame.
 *  - transitions: cut, crossfade or dip to black between every pair of segments (clips and cards on black). A crossfade or a dip overlaps the
 *    two segments by its length, so each joint shortens the film by that much (the same as ffmpeg xfade / acrossfade).
 *  - cards: a title at the start and an end card, each either its own segment on black or laid over the first / last clip.
 *  - reframe: 16:9 / 9:16 / 1:1 from the first clip's short side (fit with bars, fill with a crop at a chosen point, or fill with a blurred copy).
 *  - mix: each track is levelled to a target loudness, then its slider applies; the bed (clip sound + music) dips under the voice.
 */

export type StitchTransition = 'cut' | 'crossfade' | 'dip';
export const TRANSITIONS: StitchTransition[] = ['cut', 'crossfade', 'dip'];
export type ReframeFit = 'fit' | 'fill' | 'blur';
export const REFRAME_FITS: ReframeFit[] = ['fit', 'fill', 'blur'];
export type CardMode = 'black' | 'over';
export type CardStyle = 'clean' | 'bold' | 'quiet' | 'lower';
export const CARD_STYLES: CardStyle[] = ['clean', 'bold', 'quiet', 'lower'];
export const END_CARD_TEXT = 'Imagination is all you need.';
export const CARD_TEXT_MAX = 120;
export const CARD_SEC = { min: 1, max: 6, title: 2.5, end: 2.5 } as const;
export const TRANSITION_SEC = { min: 0.2, max: 2, default: 0.5 } as const;
/** How each card style looks (the web panel's canvas and the server's fallback, cardText.ts, both draw from this):
 *  size = text height as a share of the frame's short side; tracking in em; y = the text block's centre as a share of the height. */
export const CARD_LOOKS: Record<CardStyle, { label: string; size: number; weight: number; upper: boolean; tracking: number; align: 'center' | 'left'; y: number; accent: 'none' | 'under' | 'bar'; maxW: number }> = {
  clean: { label: 'Clean', size: 0.072, weight: 700, upper: false, tracking: -0.01, align: 'center', y: 0.5, accent: 'none', maxW: 0.8 },
  bold: { label: 'Bold', size: 0.1, weight: 700, upper: true, tracking: 0.01, align: 'center', y: 0.5, accent: 'under', maxW: 0.84 },
  quiet: { label: 'Quiet', size: 0.046, weight: 600, upper: true, tracking: 0.16, align: 'center', y: 0.5, accent: 'none', maxW: 0.76 },
  lower: { label: 'Lower third', size: 0.058, weight: 700, upper: false, tracking: 0, align: 'left', y: 0.8, accent: 'bar', maxW: 0.7 },
};
export const BRAND_ORANGE = '#FF7A1A';
/** fade in / out of a card's text (seconds), at most a third of the card */
export const cardFade = (sec: number) => Math.min(0.5, sec / 3);

/** Loudness targets (LUFS, integrated): the export lands on EXPORT_LUFS; inside the mix the voice sits above the bed before any ducking. */
export const EXPORT_LUFS = -14;
export const LEVEL = { voice: -16, clip: -19, music: -19 } as const;
/** Volume sliders: a gain on the levelled track (1 = the level above); 0–2. */
export const VOLUME = { min: 0, max: 2 } as const;
export const DEFAULT_MIX = { clip: 1, music: 0.6, voice: 1, duck: true, duckAmount: 0.6 } as const;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export interface CardTiming { mode: CardMode; sec: number }
export interface Segment { kind: 'clip' | 'title' | 'end'; clip?: number; dur: number; start: number }
/** A joint as planned: the picture's join, or a split edit (Film, 2026-10-27): a J-cut (B's sound arrives `sec` before its picture) or an
 *  L-cut (A's sound runs `sec` past the picture cut, under B). Both are hard picture cuts; the sound is placed on the timeline. */
export type JointType = StitchTransition | 'jcut' | 'lcut';
export const SPLIT_JOINTS = ['jcut', 'lcut'] as const;
export const isSplitJoint = (t: string | null | undefined): t is 'jcut' | 'lcut' => t === 'jcut' || t === 'lcut';
export interface TimelinePlan {
  segments: Segment[];
  /** the overlap at every joint (0 for a cut, or when a segment is too short for one); with per-seam transitions, the longest one */ overlap: number;
  /** per joint: overlaps[k] / joints[k] join segment k-1 and k (index 0 unused: 0 / 'cut'). Equal to overlap / the transition without seams. */
  overlaps: number[]; joints: JointType[];
  total: number;
  /** cards laid over the picture: [start, end] in film time */ overTitle: [number, number] | null; overEnd: [number, number] | null;
  /** where each clip starts and ends in the film (cards and overlaps counted) */ clipSpans: [number, number][];
}

/** Clamp a transition to what the clips allow: at most 45 % of the shortest segment, 0.2–2 s; a cut is 0. J / L cuts overlap the same way
 *  (the two clips share `sec` of film time: one side's picture, the other side's sound). */
export function overlapOf(kind: JointType, sec: number | undefined, durs: number[]): number {
  if (kind === 'cut' || durs.length < 2) return 0;
  const want = Math.min(TRANSITION_SEC.max, Math.max(TRANSITION_SEC.min, Number(sec) || TRANSITION_SEC.default));
  const room = Math.min(...durs) * 0.45; return room < 0.1 ? 0 : r3(Math.min(want, room));
}

/** The film's segments in order with their start times, the total length and the card windows. */
/** A transition at one seam between two clips (Film, 2026-10-27): seams[i] joins clip i and clip i+1; null = the film-wide transition.
 *  jcut / lcut: a split edit. The clips overlap by `sec` (clamped like a crossfade): a J-cut shows A's picture to its end while B's sound has
 *  already started (B's first `sec` of picture is hidden); an L-cut cuts to B's picture early while A's sound runs on to its end (B's first
 *  `sec` of sound is hidden). Picture and sound stay in sync on both clips; the film gets `sec` shorter, like a crossfade. */
export interface Seam { type: JointType; sec?: number }
export function planTimeline(durs: number[], o: { transition?: StitchTransition; transitionSec?: number; title?: CardTiming | null; end?: CardTiming | null; seams?: (Seam | null)[] | null } = {}): TimelinePlan {
  const segs: Omit<Segment, 'start'>[] = [];
  const title = o.title && o.title.sec > 0 ? o.title : null; const end = o.end && o.end.sec > 0 ? o.end : null;
  if (title?.mode === 'black') segs.push({ kind: 'title', dur: r3(title.sec) });
  durs.forEach((d, i) => segs.push({ kind: 'clip', clip: i, dur: r3(Math.max(0, d)) }));
  if (end?.mode === 'black') segs.push({ kind: 'end', dur: r3(end.sec) });
  const T = overlapOf(o.transition ?? 'cut', o.transitionSec, segs.map((s) => s.dur));
  /* per-seam transitions between two clips (each clamped to its two neighbours); joints next to a card keep the film-wide one */
  const joints: JointType[] = segs.map(() => o.transition ?? 'cut'); const overlaps = segs.map((_, k) => (k === 0 ? 0 : T)); joints[0] = 'cut';
  if (o.seams?.length) segs.forEach((s, k) => { const a = segs[k - 1]; if (!k || s.kind !== 'clip' || a?.kind !== 'clip') return; const sm = o.seams![a.clip!]; if (!sm) return;
    joints[k] = sm.type; overlaps[k] = overlapOf(sm.type, sm.sec, [a.dur, s.dur]); });
  let t = 0; const segments: Segment[] = segs.map((s, k) => { const start = r3(k === 0 ? 0 : t - overlaps[k]); t = r3(start + s.dur); return { ...s, start }; });
  const total = r3(segments.length ? t : 0);
  const clipSpans = segments.filter((s) => s.kind === 'clip').map((s) => [s.start, r3(s.start + s.dur)] as [number, number]);
  const firstClip = clipSpans[0]; const lastClip = clipSpans[clipSpans.length - 1];
  const overTitle = title?.mode === 'over' && firstClip ? [firstClip[0], r3(Math.min(firstClip[0] + title.sec, total))] as [number, number] : null;
  const overEnd = end?.mode === 'over' && lastClip ? [r3(Math.max(0, lastClip[1] - end.sec)), lastClip[1]] as [number, number] : null;
  const seamed = !!o.seams?.some(Boolean);
  return { segments, overlap: seamed ? Math.max(0, ...overlaps) : T, overlaps, joints, total, overTitle, overEnd, clipSpans };
}

/** Where each segment's own sound plays when a plan has J / L cuts (compose places each clip's sound with adelay and mixes them): the window in
 *  film time [from, to], the offset into the clip's (trimmed) sound, and the fades at each end (a crossfade or dip fades over its overlap; a
 *  cut or split edit gets a short click-free ramp). Exported for tests and the web's timing note. */
export interface SoundPlace { seg: number; from: number; to: number; offset: number; fadeIn: number; fadeOut: number; curveIn: 'tri' | 'exp'; curveOut: 'tri' | 'exp' }
export const DECLICK_SEC = 0.02;
export function soundPlaces(plan: TimelinePlan): SoundPlace[] {
  const segs = plan.segments; const ov = (k: number) => plan.overlaps[k] ?? 0; const jt = (k: number): JointType => plan.joints[k] ?? 'cut';
  return segs.map((s, k) => {
    const inJ = k > 0 ? jt(k) : 'cut'; const outJ = k < segs.length - 1 ? jt(k + 1) : 'cut';
    const head = inJ === 'lcut' ? ov(k) : 0; /* L-cut in: A's sound still plays; this clip's sound starts where A's picture would have ended */
    const tail = outJ === 'jcut' ? ov(k + 1) : 0; /* J-cut out: the next clip's sound has started; this clip's sound stops there */
    const blend = (j: JointType, o: number) => (j === 'crossfade' || j === 'dip') && o > 0 ? o : DECLICK_SEC;
    const fadeIn = k > 0 ? Math.min(blend(inJ, ov(k)), (s.dur - head - tail) / 2) : 0; const fadeOut = k < segs.length - 1 ? Math.min(blend(outJ, ov(k + 1)), (s.dur - head - tail) / 2) : 0;
    return { seg: k, from: r3(s.start + head), to: r3(s.start + s.dur - tail), offset: r3(head), fadeIn: r3(Math.max(0, fadeIn)), fadeOut: r3(Math.max(0, fadeOut)),
      curveIn: inJ === 'dip' ? 'exp' : 'tri', curveOut: outJ === 'dip' ? 'exp' : 'tri' };
  });
}
export const hasSplitJoint = (plan: Pick<TimelinePlan, 'joints'>): boolean => plan.joints.some(isSplitJoint);

/** The output frame. Reframe (fit given): the first clip's short side (240–1080) in the chosen shape; "auto" keeps the first clip's frame.
 *  Without fit (the older API): the first clip's frame, centre-cropped to the shape. */
export function outputSize(first: { w: number; h: number } | null | undefined, aspect: string | null | undefined, fit?: ReframeFit | null): { w: number; h: number } | null {
  if (!first || !(first.w > 0 && first.h > 0)) return null;
  const W0 = first.w - (first.w % 2), H0 = first.h - (first.h % 2); const m = aspect ? /^(\d{1,2}):(\d{1,2})$/.exec(aspect) : null;
  if (!m || !Number(m[1]) || !Number(m[2])) return { w: W0, h: H0 };
  const a = Number(m[1]), b = Number(m[2]); const r = a / b;
  if (!fit) { return W0 / H0 > r ? { w: even(H0 * r), h: H0 } : { w: W0, h: even(W0 / r) }; }
  const s = even(Math.min(1080, Math.max(240, Math.min(W0, H0))));
  return a >= b ? { w: even(s * r), h: s } : { w: s, h: even(s / r) };
}

/** dB ↔ linear */
export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity);
/** A track's gain: from its measured loudness to its level, then the slider (capped at +24 dB so a near-silent track isn't blown up). */
export function trackGain(measuredLufs: number | null, target: number, volume: number): number {
  const v = Math.min(VOLUME.max, Math.max(VOLUME.min, Number.isFinite(volume) ? volume : 1));
  if (measuredLufs == null || !Number.isFinite(measuredLufs) || measuredLufs < -70) return v;
  return r3(dbToGain(Math.min(24, target - measuredLufs)) * v);
}
/** Ducking: how far the bed dips under the voice, from the amount slider (0–1) → a sidechain compressor's ratio (1 = off … 20). */
export const duckRatio = (amount: number) => r3(1 + Math.min(1, Math.max(0, amount)) * 19);
/** About how many dB the bed dips while the voice talks (for the panel's note and its preview). */
export const duckDb = (amount: number) => Math.round(Math.min(1, Math.max(0, amount)) * 18);
