/**
 * Stitch (2026-10-27): the timeline's plain logic, kept apart from the panel (ui/video/StitchPanel.tsx) so it is tested without a browser
 * (server/test/stitch-panel.test.ts). Clips in order, each with an optional in/out trim; music and a voice; shape, clip sound and fade.
 * Export posts the body composeBody() builds to POST /api/compose (ffmpeg on this computer, $0).
 * Editor (2026-10-27): the sound mix (sliders, auto-duck), transitions, title and end cards, reframe (fit / fill / blur, crop point) and
 * voice captions. Lengths, overlaps and the frame come from the server's own math (shared/stitchTimeline.ts), so the panel and the export agree.
 */
import { planTimeline, outputSize, TRANSITIONS, REFRAME_FITS, CARD_STYLES, CARD_SEC, TRANSITION_SEC, DEFAULT_MIX, END_CARD_TEXT, CARD_TEXT_MAX,
  type StitchTransition, type ReframeFit, type CardStyle, type CardMode, type TimelinePlan } from '../../../../server/src/shared/stitchTimeline';

export const MAX_CLIPS = 20;
/** The shortest part of a clip a trim keeps (the server's own floor, agentBudget.ts clampTrim). */
export const MIN_TRIM = 0.1;
export type StitchAspect = 'auto' | '16:9' | '9:16' | '1:1';
export const STITCH_ASPECTS: StitchAspect[] = ['auto', '16:9', '9:16', '1:1'];
export interface StitchTrim { start: number; end: number }
export interface StitchClip {
  /** stable key for React and drag (a clip can be in the strip twice) */ key: string;
  /** /files/… (an upload or a result) */ url: string;
  /** the job it came from, when picked as a result */ jobId?: string | null;
  name: string;
  /** seconds; 0 until the metadata is in */ dur: number; w: number; h: number;
  /** null = the whole clip */ trim: StitchTrim | null;
  /** the file didn't load (removed from disk, a bad link) */ missing?: boolean;
}
export interface StitchSound { url: string; name: string; dur?: number; jobId?: string | null }
export interface StitchMix { clip: number; music: number; voice: number; duck: boolean; duckAmount: number }
export interface StitchCard { on: boolean; text: string; style: CardStyle; mode: CardMode; sec: number }
export type CaptionLook = 'film' | 'box';
export interface StitchDraft {
  clips: StitchClip[]; music: StitchSound | null; voice: StitchSound | null; aspect: StitchAspect; keepAudio: boolean; fade: boolean;
  mix: StitchMix; musicLoop: boolean; transition: StitchTransition; transitionSec: number; fit: ReframeFit; crop: { x: number; y: number };
  title: StitchCard; end: StitchCard; captions: { on: boolean; look: CaptionLook };
}
export const EMPTY_DRAFT: StitchDraft = {
  clips: [], music: null, voice: null, aspect: 'auto', keepAudio: true, fade: true,
  mix: { clip: DEFAULT_MIX.clip, music: DEFAULT_MIX.music, voice: DEFAULT_MIX.voice, duck: DEFAULT_MIX.duck, duckAmount: DEFAULT_MIX.duckAmount }, musicLoop: true,
  transition: 'cut', transitionSec: TRANSITION_SEC.default, fit: 'fill', crop: { x: 0.5, y: 0.5 },
  title: { on: false, text: '', style: 'clean', mode: 'over', sec: CARD_SEC.title }, end: { on: true, text: END_CARD_TEXT, style: 'clean', mode: 'black', sec: CARD_SEC.end },
  captions: { on: false, look: 'film' },
};
export { END_CARD_TEXT, CARD_STYLES, TRANSITIONS, REFRAME_FITS, CARD_SEC, TRANSITION_SEC, CARD_TEXT_MAX };
export type { StitchTransition, ReframeFit, CardStyle, CardMode, TimelinePlan };

const r1 = (n: number) => Math.round(n * 10) / 10;
let seq = 0;
export const clipKey = () => `c${Date.now().toString(36)}${(++seq).toString(36)}`;

/** A trim kept inside the clip: start ≥ 0, end ≤ length, at least MIN_TRIM long. A trim that keeps the whole clip is null. */
export function clampTrim(t: StitchTrim | null | undefined, dur: number): StitchTrim | null {
  if (!t || !(dur > 0)) return t && !(dur > 0) ? { start: Math.max(0, r1(t.start)), end: Math.max(r1(t.start) + MIN_TRIM, r1(t.end)) } : null;
  const start = r1(Math.min(Math.max(0, t.start), Math.max(0, dur - MIN_TRIM)));
  const end = r1(Math.max(start + MIN_TRIM, Math.min(t.end, dur)));
  return start <= 0.05 && end >= dur - 0.05 ? null : { start, end: Math.min(end, r1(dur)) };
}
/** Seconds this clip plays for in the film. */
export const playLen = (c: Pick<StitchClip, 'dur' | 'trim'>): number => { const t = clampTrim(c.trim, c.dur); return t ? r1(t.end - t.start) : r1(c.dur || 0); };
/** The clips' kept parts added up (no cards, no overlaps). */
export const totalLen = (cs: Pick<StitchClip, 'dur' | 'trim' | 'missing'>[]): number => r1(cs.reduce((s, c) => s + playLen(c), 0));
/** The film as the export makes it: cards, transitions and all (the server's planTimeline on the clips' kept parts). */
export function planOf(d: Pick<StitchDraft, 'clips' | 'transition' | 'transitionSec' | 'title' | 'end'>): TimelinePlan {
  const cs = d.clips.filter((c) => !c.missing);
  return planTimeline(cs.map((c) => { const t = clampTrim(c.trim, c.dur); return t ? t.end - t.start : c.dur || 0; }), { transition: d.transition, transitionSec: d.transitionSec,
    title: cardOn(d.title) ? { mode: d.title.mode, sec: d.title.sec } : null, end: cardOn(d.end) ? { mode: d.end.mode, sec: d.end.sec } : null });
}
export const cardOn = (c: StitchCard) => c.on && !!c.text.trim();
/** 0:07, 1:05 */
export const clock = (s: number): string => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
/** "4.5 s" under a minute, else the clock. */
export const secText = (s: number): string => (s < 60 ? `${Number.isInteger(r1(s)) ? r1(s) : r1(s).toFixed(1)} s` : clock(s));
/** 0.6 → "60%" */
export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Move one clip from → to (both indexes in the current list). */
export function moveClip<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list; const out = list.slice(); const [x] = out.splice(from, 1); out.splice(Math.max(0, Math.min(out.length, to)), 0, x); return out;
}
/** Add clips at the end, up to MAX_CLIPS; `dropped` is how many did not fit. */
export function addClips(list: StitchClip[], more: StitchClip[]): { list: StitchClip[]; dropped: number } {
  const room = Math.max(0, MAX_CLIPS - list.length); return { list: [...list, ...more.slice(0, room)], dropped: Math.max(0, more.length - room) };
}

/** How a clip fits the film's frame: the same shape, or (another shape) what reframe does to it: bars (fit), a crop (fill) or a blurred fill. */
export function fitOf(c: Pick<StitchClip, 'w' | 'h'>, frame: { w: number; h: number } | null | undefined, fit: ReframeFit = 'fit'): 'same' | 'bars' | 'crop' | 'blur' {
  if (!frame || !(c.w > 0 && c.h > 0 && frame.w > 0 && frame.h > 0)) return 'same';
  if (Math.abs(c.w / c.h - frame.w / frame.h) < 0.02) return 'same';
  return fit === 'fill' ? 'crop' : fit === 'blur' ? 'blur' : 'bars';
}
/** The film's frame: the first clip's frame (Auto), or the shape from its short side (the server's outputSize with reframe). */
export function filmSize(first: Pick<StitchClip, 'w' | 'h'> | undefined, aspect: StitchAspect): { w: number; h: number } | null {
  return outputSize(first ?? null, aspect === 'auto' ? null : aspect, 'fit');
}

/** What Export still needs, in Generate's words (null = ready). */
export function missingStep(d: Pick<StitchDraft, 'clips'>): string | null {
  if (!d.clips.length) return 'Add clips';
  if (d.clips.some((c) => c.missing)) return 'Remove the missing clip';
  return null;
}

/** POST /api/compose body (cards and captions go as PNG parts next to it, StitchPanel exportNow). trims only when one is set. */
export function composeBody(d: StitchDraft) {
  const trims = d.clips.map((c) => { const t = clampTrim(c.trim, c.dur); return t ? { in: t.start, out: t.end } : null; });
  const len = planOf(d).total;
  const card = (c: StitchCard) => (cardOn(c) ? { text: c.text.trim().slice(0, CARD_TEXT_MAX), style: c.style, mode: c.mode, sec: c.sec } : null);
  return {
    clips: d.clips.map((c) => c.url),
    ...(trims.some(Boolean) ? { trims } : {}),
    ...(d.music ? { audio: d.music.url, musicVolume: d.mix.music, musicLoop: d.musicLoop } : {}),
    ...(d.voice ? { voice: d.voice.url, voiceVolume: d.mix.voice } : {}),
    ...(d.aspect !== 'auto' ? { aspect: d.aspect } : {}),
    fit: d.fit, ...(d.fit === 'fill' ? { cropX: d.crop.x, cropY: d.crop.y } : {}),
    keepClipAudio: d.keepAudio, clipVolume: d.mix.clip, duck: d.mix.duck, duckAmount: d.mix.duckAmount, normalize: true,
    transition: d.transition, ...(d.transition !== 'cut' ? { transitionSec: d.transitionSec } : {}),
    titleCard: card(d.title), endCard: card(d.end),
    fadeOutSec: d.fade ? 1 : 0, videoFade: d.fade,
    title: `Stitch · ${d.clips.length} clip${d.clips.length === 1 ? '' : 's'} · ${secText(len)}`,
  };
}

const clampN = (v: unknown, lo: number, hi: number, dflt: number) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
function parseCard(c: any, dflt: StitchCard): StitchCard {
  if (!c || typeof c !== 'object') return dflt;
  return { on: typeof c.on === 'boolean' ? c.on : dflt.on, text: typeof c.text === 'string' ? c.text.slice(0, CARD_TEXT_MAX) : dflt.text, style: CARD_STYLES.includes(c.style) ? c.style : dflt.style,
    mode: c.mode === 'black' || c.mode === 'over' ? c.mode : dflt.mode, sec: clampN(c.sec, CARD_SEC.min, CARD_SEC.max, dflt.sec) };
}
/** A saved draft (localStorage), checked field by field; anything odd falls back to the empty draft's value. */
export function parseDraft(raw: unknown): StitchDraft {
  const o = raw && typeof raw === 'object' ? raw as Record<string, any> : {};
  const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  const sound = (s: any): StitchSound | null => s && typeof s.url === 'string' && /^\/files\//.test(s.url) ? { url: s.url, name: String(s.name ?? 'Sound').slice(0, 120), dur: num(s.dur) || undefined, jobId: typeof s.jobId === 'string' ? s.jobId : null } : null;
  const clips = (Array.isArray(o.clips) ? o.clips : []).filter((c: any) => c && typeof c.url === 'string' && /^\/files\//.test(c.url)).slice(0, MAX_CLIPS).map((c: any): StitchClip => {
    const dur = num(c.dur); const t = c.trim && typeof c.trim === 'object' ? { start: num(c.trim.start), end: num(c.trim.end) } : null;
    return { key: typeof c.key === 'string' && c.key ? c.key : clipKey(), url: c.url, jobId: typeof c.jobId === 'string' ? c.jobId : null, name: String(c.name ?? 'Clip').slice(0, 120), dur, w: num(c.w), h: num(c.h), trim: t && t.end > t.start ? t : null };
  });
  const E = EMPTY_DRAFT; const m = o.mix && typeof o.mix === 'object' ? o.mix : {};
  return { clips, music: sound(o.music), voice: sound(o.voice), aspect: STITCH_ASPECTS.includes(o.aspect) ? o.aspect : E.aspect,
    keepAudio: typeof o.keepAudio === 'boolean' ? o.keepAudio : E.keepAudio, fade: typeof o.fade === 'boolean' ? o.fade : E.fade,
    mix: { clip: clampN(m.clip, 0, 2, E.mix.clip), music: clampN(m.music, 0, 2, E.mix.music), voice: clampN(m.voice, 0, 2, E.mix.voice), duck: typeof m.duck === 'boolean' ? m.duck : E.mix.duck, duckAmount: clampN(m.duckAmount, 0, 1, E.mix.duckAmount) },
    musicLoop: typeof o.musicLoop === 'boolean' ? o.musicLoop : E.musicLoop, transition: TRANSITIONS.includes(o.transition) ? o.transition : E.transition,
    transitionSec: clampN(o.transitionSec, TRANSITION_SEC.min, TRANSITION_SEC.max, E.transitionSec), fit: REFRAME_FITS.includes(o.fit) ? o.fit : E.fit,
    crop: { x: clampN(o.crop?.x, 0, 1, 0.5), y: clampN(o.crop?.y, 0, 1, 0.5) }, title: parseCard(o.title, E.title), end: parseCard(o.end, E.end),
    captions: { on: o.captions?.on === true, look: o.captions?.look === 'box' ? 'box' : 'film' } };
}

/** Recreate (?recreate=<compose job>): the job's own clips, trims, sound and settings back in the strip. */
export function draftFromJob(input: Record<string, any> | null | undefined): StitchDraft | null {
  const i = input ?? {}; const urls: string[] = Array.isArray(i.clipUrls) ? i.clipUrls.filter((u: unknown) => typeof u === 'string') : []; if (!urls.length) return null;
  const tr: any[] = Array.isArray(i.trims) ? i.trims : []; const ids: any[] = Array.isArray(i.clipJobIds) ? i.clipJobIds : [];
  const nameOf = (u: string) => decodeURIComponent(u.split('/').pop() ?? 'clip');
  const card = (c: any, off: StitchCard) => (c && typeof c === 'object' ? { ...c, on: true, text: c.text ?? '' } : { ...off, on: false });
  return parseDraft({
    clips: urls.map((url, k) => ({ url, jobId: ids[k] ?? null, name: nameOf(url), trim: tr[k] && typeof tr[k] === 'object' ? { start: Number(tr[k].in) || 0, end: Number(tr[k].out) || 0 } : null })),
    music: i.audioUrl ? { url: i.audioUrl, name: nameOf(i.audioUrl), jobId: i.audioJobId ?? null } : null, voice: i.voiceUrl ? { url: i.voiceUrl, name: nameOf(i.voiceUrl), jobId: i.voiceJobId ?? null } : null,
    aspect: i.aspect ?? 'auto', keepAudio: i.keepClipAudio === true, fade: i.videoFade === true || (i.fadeOutSec ?? 1) > 0,
    mix: i.mix ? { ...i.mix } : undefined, musicLoop: i.mix?.musicLoop, transition: i.transition, transitionSec: i.transitionSec ?? undefined, fit: i.fit ?? (i.aspect ? 'fill' : undefined), crop: i.crop ?? undefined,
    title: card(i.titleCard, EMPTY_DRAFT.title), end: i.titleCard !== undefined || i.endCard !== undefined ? card(i.endCard, EMPTY_DRAFT.end) : { ...EMPTY_DRAFT.end, on: false },
    captions: { on: (i.captions ?? 0) > 0 },
  });
}
