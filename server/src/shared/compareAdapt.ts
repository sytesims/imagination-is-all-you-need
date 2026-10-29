/**
 * Compare models (Create Image toolbar): the SAME prompt + settings on 2–4 models. Each model gets the settings it can take
 * (shared/imageCaps.ts); a setting it can't take is adapted to its closest allowed value and the change is named in words.
 * Isomorphic (server quote + web picker use the same rules).
 */
import { capsFor, RES_PX, type ImageRes } from './imageCaps.js';

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;
export interface CompareWant { aspect?: string; quality?: string; imageResolution?: string; n?: number; refs?: number; mode?: 'generate' | 'edit' | string }
export interface CompareParams { aspect: string; quality?: string; imageResolution?: string; n: number; refs: number; mode: 'generate' | 'edit' }
export interface CompareChange { field: 'aspect' | 'quality' | 'imageResolution' | 'n'; from: string; to: string; message: string }
export type CompareAdapt = { ok: true; params: CompareParams; changes: CompareChange[] } | { ok: false; code: 'text_only' | 'too_many_photos'; reason: string };

const ratio = (a: string) => { const [x, y] = a.split(':').map(Number); return x && y ? x / y : 1; };
/** The listed aspect closest in shape (log-ratio distance). */
export const closestAspect = (want: string, list: string[]) => list.slice().sort((a, b) => Math.abs(Math.log(ratio(a) / ratio(want))) - Math.abs(Math.log(ratio(b) / ratio(want))))[0];
const closestRes = (want: string, list: string[]) => list.slice().sort((a, b) => Math.abs((RES_PX[a as ImageRes] ?? 1024) - (RES_PX[want as ImageRes] ?? 1024)) - Math.abs((RES_PX[b as ImageRes] ?? 1024) - (RES_PX[want as ImageRes] ?? 1024)))[0];
const TIER: Record<string, string> = { low: 'Low', med: 'Medium', high: 'High' };

/** The settings model `id` will run with, and what changed. A photo edit on a text-only model, or more photos than it takes, excludes it. */
export function adaptForModel(id: string, want: CompareWant): CompareAdapt {
  const mode: 'generate' | 'edit' = want.mode === 'edit' ? 'edit' : 'generate'; const refs = Math.max(0, Number(want.refs) || 0);
  const n0 = Math.max(1, Math.min(4, Number(want.n) || 1)); const a0 = !want.aspect || want.aspect === 'Auto' ? 'auto' : want.aspect;
  const c = capsFor(id); const changes: CompareChange[] = [];
  if (!c) return { ok: true, params: { aspect: a0, ...(want.quality ? { quality: want.quality } : {}), ...(want.imageResolution ? { imageResolution: want.imageResolution } : {}), n: n0, refs, mode }, changes };
  if (mode === 'edit' && (!c.supports.refs || c.supports.maxRefs <= 0)) return { ok: false, code: 'text_only', reason: 'Text only: it can’t edit your photo' };
  if (refs > c.supports.maxRefs) return { ok: false, code: 'too_many_photos', reason: `Takes up to ${c.supports.maxRefs} photo${c.supports.maxRefs > 1 ? 's' : ''}; you have ${refs}` };
  const ed = mode === 'edit' ? c.edit : undefined; const aspects = ed ? ed.aspects : c.aspects; const allowAuto = ed ? ed.allowAuto : c.allowAuto;
  let aspect = a0;
  if (aspect === 'auto') { if (!allowAuto) { aspect = c.defaultAspect; changes.push({ field: 'aspect', from: 'Auto', to: aspect, message: `No Auto aspect: uses ${aspect}` }); } }
  else if (!aspects.length) { aspect = 'auto'; changes.push({ field: 'aspect', from: a0, to: 'Auto', message: 'Keeps your photo’s shape' }); }
  else if (!aspects.includes(aspect)) { const to = closestAspect(aspect, aspects); changes.push({ field: 'aspect', from: aspect, to, message: `No ${aspect}: uses ${to}, the closest shape` }); aspect = to; }
  let quality: string | undefined;
  if (c.qualityTiers.length) { if (want.quality && (c.qualityTiers as string[]).includes(want.quality)) quality = want.quality; else { quality = c.defaultTier ?? c.qualityTiers[0]; if (want.quality) changes.push({ field: 'quality', from: want.quality, to: quality, message: `No ${TIER[want.quality] ?? want.quality} quality: uses ${TIER[quality] ?? quality}` }); } }
  else if (want.quality && want.quality !== 'med') changes.push({ field: 'quality', from: want.quality, to: 'none', message: 'Has no quality setting' });
  const resList: string[] = ed ? ed.resolutions : c.resolutions; let imageResolution: string | undefined;
  if (resList.length) { if (want.imageResolution && resList.includes(want.imageResolution)) imageResolution = want.imageResolution;
    else { imageResolution = want.imageResolution ? closestRes(want.imageResolution, resList) : resList.includes(c.defaultResolution) ? c.defaultResolution : resList[0]; if (want.imageResolution) changes.push({ field: 'imageResolution', from: want.imageResolution, to: imageResolution, message: `No ${want.imageResolution}: renders ${imageResolution}` }); } }
  let n = n0; if (n > c.maxBatch) { n = c.maxBatch; changes.push({ field: 'n', from: String(n0), to: String(n), message: `Makes at most ${n} image${n > 1 ? 's' : ''} per run` }); }
  return { ok: true, params: { aspect, ...(quality ? { quality } : {}), ...(imageResolution ? { imageResolution } : {}), n, refs, mode }, changes };
}
