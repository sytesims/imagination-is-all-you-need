/**
 * Picking a model adapts the current settings to the nearest ones it makes (2026-10-27, one rule for Image, Video and Audio). Before this a row
 * whose model couldn't take the bar's length or size said "Not for these settings" and the user couldn't tell why or what to do.
 *  - fitSettings: the bar's values snapped to a model's (or its place's) caps: length = the longest it makes up to the current one (else its
 *    shortest), resolution = the highest up to the current one (else its lowest), aspect = the closest shape, sound = off on a silent model and
 *    on where it can't be turned off, quality = kept where offered, else the model's default. Each change is listed, so the menu row, the bar's
 *    note and the reply of an API / MCP run name the same thing.
 *  - fitNote: those changes in one calm sentence ("Length set to 10 s, the longest LTX-2.5 Pro makes.").
 *  - needOf: a job no setting can fix (the place only does image to video and there's no start image): what it needs in a few words, the full
 *    sentence and the action the bar can offer ("Add image" opens the slot).
 * Pure and isomorphic: the model menu (web), the batch quote (routing/quotesBatch.ts) and MCP use it, the server stays the authority (the batch
 * row carries `fit`, the bar applies its values). The API never changes a setting the caller sent; only a model switch adapts.
 */
import { closestAspect } from './imageSnap.js';

export type FitField = 'duration' | 'resolution' | 'aspect' | 'audio' | 'quality';
/** What a model (or the place that runs it) takes. Missing / empty = no limit on that setting. */
export interface FitCaps {
  durations?: number[] | null; /** Lengths allowed at one resolution only (Veo 1080p = 8 s). */ durationsByResolution?: Record<string, number[]> | null;
  resolutions?: string[] | null; aspects?: string[] | null; audio?: { supported: boolean; toggle?: boolean; default?: boolean } | null;
  qualities?: string[] | null; defaultQuality?: string | null;
}
/** The bar's current values, as the quote sends them (strings). audio: '1' | '0'. */
export interface FitValues { duration?: string; resolution?: string; aspect?: string; audio?: string; quality?: string }
/** One adapted setting. why: longest = the longest it makes up to yours, shortest = it makes nothing that short, only = its one value,
 *  highest / lowest likewise for resolution, closest = the nearest shape, silent / always = sound it can't make or can't turn off, default. */
export interface FitChange { field: FitField; from: string; to: string; why: 'longest' | 'shortest' | 'only' | 'highest' | 'lowest' | 'closest' | 'silent' | 'always' | 'default' }
export interface Fit { values: FitValues; changes: FitChange[] }

const num = (s: unknown) => { const n = Number(String(s ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n : NaN; };
/** A resolution's height in pixels for ordering: '480p' → 480, '2K' → 1440, '4K' → 2160, '1K' → 1024 (image sizes). NaN = not a size. */
export function resRank(r: string): number {
  const s = String(r).trim(); const p = /^(\d{3,4})p$/i.exec(s); if (p) return Number(p[1]);
  const k = /^(\d)K$/i.exec(s); if (k) return ({ 1: 1024, 2: 1440, 3: 1800, 4: 2160, 8: 4320 } as Record<number, number>)[Number(k[1])] ?? Number(k[1]) * 1000;
  return NaN;
}
/** The length to use: the current one when allowed, else the longest allowed up to it, else the shortest allowed. */
export function fitLength(list: number[], cur: number): { to: number; why: FitChange['why'] } | null {
  const ds = [...new Set(list.filter((x) => Number.isFinite(x)))].sort((a, b) => a - b); if (!ds.length || !Number.isFinite(cur) || ds.includes(cur)) return null;
  if (ds.length === 1) return { to: ds[0], why: 'only' };
  const under = ds.filter((d) => d <= cur); return under.length ? { to: under[under.length - 1], why: 'longest' } : { to: ds[0], why: 'shortest' };
}
/** The resolution to use: the current one when allowed (any case), else the highest allowed up to it, else the lowest allowed above it. */
export function fitResolution(list: string[], cur: string): { to: string; why: FitChange['why'] } | null {
  if (!list.length || !cur) return null; if (list.some((r) => r.toLowerCase() === cur.toLowerCase())) return null;
  if (list.length === 1) return { to: list[0], why: 'only' };
  const c = resRank(cur); const ranked = list.filter((r) => Number.isFinite(resRank(r))).sort((a, b) => resRank(a) - resRank(b));
  if (!Number.isFinite(c) || !ranked.length) return { to: list[0], why: 'default' };
  const under = ranked.filter((r) => resRank(r) <= c); return under.length ? { to: under[under.length - 1], why: 'highest' } : { to: ranked[0], why: 'lowest' };
}
const ratioOf = (a: string) => { const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(a); return m ? Number(m[1]) / Number(m[2]) : null; };
/** The aspect to use: kept when listed (auto included, any case), else the closest listed shape, else Auto / the first. */
export function fitAspect(list: string[], cur: string): { to: string; why: FitChange['why'] } | null {
  if (!list.length || !cur) return null; const lc = cur.toLowerCase(); if (list.some((a) => a.toLowerCase() === lc)) return null;
  const r = ratioOf(cur); const near = r ? closestAspect(list, r) : null; if (near) return { to: near, why: list.length === 1 ? 'only' : 'closest' };
  const auto = list.find((a) => a.toLowerCase() === 'auto'); return { to: auto ?? list[0], why: list.length === 1 ? 'only' : 'default' };
}

/**
 * The settings this model runs when it is picked: every value it can't take moved to the nearest one it makes. `pinned` fields are never
 * changed (an API caller's exact settings): a pinned value it can't take stays as sent, and the quote refuses it as before.
 */
export function fitSettings(caps: FitCaps | null | undefined, cur: FitValues, o: { pinned?: readonly FitField[] } = {}): Fit {
  const c = caps ?? {}; const pin = new Set(o.pinned ?? []); const values: FitValues = { ...cur }; const changes: FitChange[] = [];
  const set = (field: FitField, to: string, why: FitChange['why']) => { const from = String(values[field] ?? ''); if (pin.has(field) || from === to) return; values[field] = to; changes.push({ field, from, to, why }); };
  if (c.resolutions?.length && values.resolution) { const f = fitResolution(c.resolutions, values.resolution); if (f) set('resolution', f.to, f.why); }
  // length after resolution: some lengths exist at one size only
  const ds = (values.resolution && c.durationsByResolution?.[values.resolution]) || c.durations;
  if (ds?.length && values.duration != null && values.duration !== '') { const f = fitLength(ds, num(values.duration)); if (f) set('duration', String(f.to), f.why); }
  if (c.aspects?.length && values.aspect) { const f = fitAspect(c.aspects, values.aspect); if (f) set('aspect', f.to, f.why); }
  if (c.audio && values.audio != null && values.audio !== '') {
    if (!c.audio.supported && values.audio !== '0') set('audio', '0', 'silent');
    else if (c.audio.supported && c.audio.toggle === false && values.audio !== '1') set('audio', '1', 'always');
  }
  if (c.qualities?.length && values.quality && !c.qualities.includes(values.quality)) set('quality', c.defaultQuality && c.qualities.includes(c.defaultQuality) ? c.defaultQuality : c.qualities[0], 'default');
  return { values, changes };
}
/** The changes between two param sets as FitChanges (for a row adapted by the quote's own retries). Only the fields the bar shows. */
export function changesBetween(from: Record<string, string | undefined>, to: Record<string, string | null | undefined>, caps?: FitCaps | null): FitChange[] {
  const out: FitChange[] = []; const key = (f: FitField) => (f === 'duration' && from.duration == null && from.seconds != null ? 'seconds' : f === 'resolution' && from.resolution == null && from.imageResolution != null ? 'imageResolution' : f);
  for (const f of ['duration', 'resolution', 'aspect', 'audio', 'quality'] as FitField[]) {
    const k = key(f); const a = from[k]; const b = to[k]; if (b == null || a == null || String(a) === String(b)) continue;
    let why: FitChange['why'] = 'default';
    if (f === 'duration') { const ds = caps?.durations ?? []; why = ds.length === 1 ? 'only' : num(b) <= num(a) ? 'longest' : 'shortest'; }
    else if (f === 'resolution') { const rs = caps?.resolutions ?? []; why = rs.length === 1 ? 'only' : resRank(String(b)) <= resRank(String(a)) ? 'highest' : 'lowest'; }
    else if (f === 'aspect') why = /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(String(a)) ? 'closest' : 'default'; else if (f === 'audio') why = caps?.audio?.supported && caps.audio.toggle !== false ? 'default' : b === '0' ? 'silent' : 'always';
    out.push({ field: f, from: String(a), to: String(b), why });
  }
  return out;
}

const RES_WORD = (v: string) => (v === '448p' ? 'Draft' : v === '576p' ? 'Sharper' : v);
const valWord = (c: FitChange) => (c.field === 'duration' ? `${c.to} s` : c.field === 'resolution' ? RES_WORD(c.to) : c.field === 'aspect' ? (c.to.toLowerCase() === 'auto' ? 'Auto' : c.to)
  : c.field === 'audio' ? (c.to === '1' ? 'sound on' : 'sound off') : c.field === 'quality' ? `${c.to === 'med' ? 'medium' : c.to} quality` : c.to);
/** The adapted values in a few words for a hover ("Will use 10 s, 1080p"). */
export const fitHint = (changes: FitChange[]): string => (changes.length ? `Will use ${changes.map(valWord).join(', ')}` : '');
/**
 * One calm sentence for the bar after a switch. One change says why ("Length set to 10 s, the longest LTX-2.5 Pro makes."); several are
 * listed ("Set to 10 s and 1080p for LTX-2.5 Pro."). '' = nothing changed.
 */
export function fitNote(changes: FitChange[], model: string): string {
  if (!changes.length) return ''; const m = model || 'this model';
  if (changes.length > 1) { const ws = changes.map(valWord); return `Set to ${ws.slice(0, -1).join(', ')} and ${ws[ws.length - 1]} for ${m}.`; }
  const c = changes[0]; const v = valWord(c);
  if (c.field === 'audio') return c.why === 'silent' ? `Sound off: ${m} makes clips without sound.` : c.why === 'always' ? `Sound on: ${m} always adds sound.` : `Sound ${c.to === '1' ? 'on' : 'off'}, how ${m} starts.`;
  const lead = c.field === 'duration' ? `Length set to ${v}` : c.field === 'resolution' ? `Resolution set to ${v}` : c.field === 'aspect' ? `Aspect set to ${v}` : `Quality set to ${c.to === 'med' ? 'medium' : c.to}`;
  const why = c.why === 'only' ? `, the only ${c.field === 'duration' ? 'length' : c.field === 'aspect' ? 'shape' : 'size'} ${m} makes`
    : c.why === 'longest' ? `, the longest ${m} makes` : c.why === 'shortest' ? `, the shortest ${m} makes`
    : c.why === 'highest' ? `, the highest ${m} makes` : c.why === 'lowest' ? `, the lowest ${m} makes`
    : c.why === 'closest' ? `, the closest shape ${m} makes` : ` for ${m}`;
  return `${lead}${why}.`;
}

/** A job no setting can fix on this model / place, in a few words, the sentence for the hover and the bar's action (null = none). */
export interface Need { code: 'start_image' | 'two_images' | 'end_frame' | 'video' | 'audio' | 'mask' | 'reference'; short: string; full: string; action: 'add-image' | 'add-end-frame' | 'add-video' | 'add-audio' | null }
const NEEDS: { re: RegExp; need: Omit<Need, 'full'> }[] = [
  { re: /needs (the |a |an )?(last|end) frame/i, need: { code: 'end_frame', short: 'Needs an end frame', action: 'add-end-frame' } },
  { re: /only (does|takes|runs) (image to video|first and last frame)(,? or (image to video|first and last frame))?\b(?! or text)|needs (a |an |the )?(start|first) (frame|image)|needs (a |an )?(photo|image|picture)\b/i, need: { code: 'start_image', short: 'Needs a start image', action: 'add-image' } },
  { re: /needs (two|2) (images|frames)/i, need: { code: 'two_images', short: 'Needs 2 images', action: 'add-end-frame' } },
  { re: /needs (a |an |the )?(video|clip)\b|only (does|takes) (a )?video/i, need: { code: 'video', short: 'Needs a video', action: 'add-video' } },
  { re: /needs (a |an |the )?(audio|voice|song|track)\b/i, need: { code: 'audio', short: 'Needs audio', action: 'add-audio' } },
  { re: /needs (a |an |the )?mask\b/i, need: { code: 'mask', short: 'Needs a mask', action: null } },
  { re: /only (does|takes) reference/i, need: { code: 'reference', short: 'Needs a reference', action: 'add-image' } },
];
/** What a blocked quote's reason says the job needs, from its words (the route's modes) — null when the reason is something else. */
export function needOf(reason: string | null | undefined): Need | null {
  const t = String(reason ?? '').replace(/^[^.]*can[’']t run this job\.\s*/i, '').trim(); if (!t) return null;
  // "only does image to video or first and last frame" = a start image is the least it needs; "only does first and last frame" = two
  if (/only (does|takes|runs) first and last frame\b/i.test(t) && !/image to video/i.test(t)) return { code: 'two_images', short: 'Needs 2 images', action: 'add-end-frame', full: t };
  for (const n of NEEDS) if (n.re.test(t)) return { ...n.need, full: t };
  return null;
}
/** A model's caps from its video limits (tools/h3/videoCaps.ts VideoLimits, or a route's caps block) in FitCaps form. */
export function videoFitCaps(L: { durations?: number[] | null; durationsByResolution?: Record<string, number[]> | null; resolutions?: string[] | null; aspects?: string[] | null;
  audio?: { supported: boolean; toggle?: boolean; default?: boolean } | boolean | null; audioToggle?: { supported: boolean; toggle?: boolean; default?: boolean } | null } | null | undefined): FitCaps | null {
  if (!L) return null; const au = L.audioToggle ?? (typeof L.audio === 'object' ? L.audio : null);
  return { durations: L.durations ?? null, durationsByResolution: L.durationsByResolution ?? null, resolutions: L.resolutions ?? null, aspects: L.aspects ?? null, audio: au ?? null };
}
/** A model's image caps (shared/imageCaps.ts ImageCaps) in FitCaps form: its sizes, its shapes with Auto where offered, its quality tiers. */
export function imageFitCaps(c: { aspects?: string[]; allowAuto?: boolean; defaultAspect?: string | null; resolutions?: string[]; qualityTiers?: string[]; defaultTier?: string | null } | null | undefined): FitCaps | null {
  if (!c) return null; const own = c.aspects ? [...c.aspects].sort((a, b) => Number(b === c.defaultAspect) - Number(a === c.defaultAspect)) : null; // its default shape first: Auto on a model without Auto goes there
  return { resolutions: c.resolutions ?? null, aspects: own ? [...(c.allowAuto !== false ? ['auto'] : []), ...own] : null, qualities: c.qualityTiers ?? null, defaultQuality: c.defaultTier ?? null };
}
