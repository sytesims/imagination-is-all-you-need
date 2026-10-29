/** Public page metadata and usage helpers. */
import type { Job } from './jobs.js';
/** Job field `enhanced`: an upscale / enhance / edit tool, or a job derived from another one (has parentId), except a re-run of it. */
export const ENHANCE_TOOL = /(upscale|enhance|edit)/i;
/** S-04: a retry / Try on / failed-groups re-run (job.rerun; jobs saved before that field: input.retryOf / input.retryGroups). */
export const isRerun = (j: { rerun?: string | null; input?: Record<string, any> }) => !!j.rerun || !!j.input?.retryOf || !!j.input?.retryGroups;
/** A frame saved from a video (POST /api/media/frame, videoFrame.ts): a finished local job with the PNG as its output, so Assets, Trash,
 *  projects and the viewer treat it like any result; parentId = the source video's job. */
export const FRAME_TOOL = 'video-frame';
export const isEnhanced = (j: Pick<Job, 'toolId'> & { parentId?: string | null; rerun?: string | null; input?: Record<string, any> }) => j.toolId !== FRAME_TOOL && (ENHANCE_TOOL.test(j.toolId) || (!!j.parentId && !isRerun(j)));
const IMAGE_TOOLS = new Set(['create-image', 'soul', 'photo-fx', 'image-upscale']); const AUDIO_TOOLS = new Set(['audio', 'soundtrack', 'voice']);
export const kindOfUrl = (url: string) => (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ? 'image' : /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|m4a|flac|ogg)(\?|$)/i.test(url) ? 'audio' : null);
/** Media of a job: its first output's file type, else the tool's media (image/audio tools, everything else video). */
export function mediaOf(j: Pick<Job, 'toolId'> & { outputs?: { url: string }[] }): 'image' | 'video' | 'audio' {
  const k = j.outputs?.length ? kindOfUrl(j.outputs[0].url) : null; if (k) return k as any;
  return IMAGE_TOOLS.has(j.toolId) ? 'image' : AUDIO_TOOLS.has(j.toolId) ? 'audio' : 'video';
}
/** ISO / ms → epoch ms; undefined when absent; NaN when unparsable. */
export const parseWhen = (v?: string) => (v == null || v === '' ? undefined : /^\d+$/.test(v) ? Number(v) : Date.parse(v));
/** Usage buckets on local midnight / local hour of an IANA zone (handles :30 / :45 offsets and DST). Keys: YYYY-MM-DD or YYYY-MM-DDTHH (local). */
export function tzKeyer(timeZone: string, bucket: 'day' | 'hour') {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }); // throws RangeError on a bad zone
  return (ts: number) => { const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value])); return bucket === 'day' ? `${p.year}-${p.month}-${p.day}` : `${p.year}-${p.month}-${p.day}T${p.hour}`; };
}
/** Zero-fill keys from `since` to `now`, oldest first, each with its UTC start (every zone offset is a multiple of 15 min). */
export function tzBuckets(key: (ts: number) => string, since: number, now: number) {
  const Q = 900_000; const out: { key: string; start: number }[] = []; let last = '';
  let t0 = Math.floor(since / Q) * Q; const k0 = key(t0); for (let i = 0; i < 200 && key(t0 - Q) === k0; i++) t0 -= Q; // first row starts at its local bucket start, not the window start
  for (let t = t0; t <= now; t += Q) { const k = key(t); if (k !== last) { out.push({ key: k, start: t }); last = k; } }
  return out;
}
