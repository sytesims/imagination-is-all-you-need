import type { JobState } from '../api';
/* The job's input files, in order, with their slot names: one source for the result viewer (ResultView) and the in-progress screen (RunStage). */
/** The input photos' names by the tool that took them (the workflow's slot names), else Image 1, Image 2… */
export const INPUT_LABELS: Record<string, string[]> = { 'app-face-swap': ['Target', 'Face'], 'app-person-swap': ['Target', 'Person'], 'app-material-swap': ['Object', 'Material'], 'app-ad-pack': ['Product', 'Side 2', 'Side 3'], 'image-upscale': ['Photo'], 'app-relight': ['Photo'], 'app-inpaint': ['Photo'], 'app-character-sheet': ['Your photo'], 'app-product-shot': ['Product photo'], 'app-shots': ['Photo'] };
/** Video tools that reuse the viewer: their source clip or audio is an input too */
export const MEDIA_INPUTS: [string, string][] = [['videoUrl', 'Video'], ['sourceAudioUrl', 'Audio'], ['voiceSampleUrl', 'Voice sample'], ['speechUrl', 'Speech']];
export const isFileUrl = (u: unknown): u is string => typeof u === 'string' && /^\/(files|samples)\//.test(u);
/** Known shipped media filenames for input display and explicit refUrl handoffs.
 * No protocols, escapes, dot segments, queries or executable extensions. Keep isFileUrl unchanged:
 * uploaded-image editing/preparation guards must not be widened with this display fix. */
export const isBundledInputUrl = (u: unknown): u is string => typeof u === 'string' &&
  /^\/(showcase|examples)\/(?:[\w-]+\/)*[\w-][\w.-]*\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v|mkv|mp3|wav|m4a|aac|ogg|oga|flac|opus)$/i.test(u) && !u.includes('..');
const isInputUrl = (u: unknown): u is string => isFileUrl(u) || isBundledInputUrl(u);
export const mediaKindOf = (u: string): 'image' | 'video' | 'audio' => /\.(mp4|webm|mov|m4v|mkv)($|\?)/i.test(u) ? 'video' : /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)($|\?)/i.test(u) ? 'audio' : 'image';
export type JobInput = { url: string; kind: 'image' | 'video' | 'audio'; slot: string; named: boolean; mask: string | null };
/** The job's inputs in order: the photo(s) (imageUrl + refUrls; the same file twice stays twice), a last frame, then a source clip / audio. Up to 16 (GPT Image's limit). */
export const jobInputs = (job: JobState): JobInput[] => { const i0: any = job.input ?? {}; const refs: string[] = Array.isArray(i0.refUrls) ? i0.refUrls.filter(isInputUrl) : [];
  const imgs = isInputUrl(i0.imageUrl) && !refs.includes(i0.imageUrl) ? [i0.imageUrl, ...refs] : refs;
  const all: [string, string][] = imgs.map((u, i) => [u, u === i0.lastFrameUrl && i > 0 ? 'Last frame' : '']);
  if (isInputUrl(i0.lastFrameUrl) && !imgs.includes(i0.lastFrameUrl)) all.push([i0.lastFrameUrl, 'Last frame']);
  for (const [k, name] of MEDIA_INPUTS) if (isInputUrl(i0[k]) && !all.some(([u]) => u === i0[k])) all.push([i0[k], name]);
  for (const [k, name] of [['refVideoUrls', 'Video reference'], ['refAudioUrls', 'Audio reference'], ['voiceSampleUrls', 'Voice sample']]) {
    if (Array.isArray(i0[k])) i0[k].forEach((u: unknown, i: number) => { if (isInputUrl(u) && !(k === 'voiceSampleUrls' && u === i0.voiceSampleUrl)) all.push([u, `${name} ${i + 1}`]); });
  }
  const guide = i0.makeReal?.planUrl; if (isInputUrl(guide) && !all.some(([u]) => u === guide)) all.push([guide, 'Guide clip']);
  const names = INPUT_LABELS[job.toolId]; const mask = isInputUrl(i0.maskUrl) ? i0.maskUrl : null;
  return all.slice(0, 16).map(([u, name], i) => ({ url: u, kind: mediaKindOf(u), slot: name || names?.[i] || (all.length > 1 ? `Image ${i + 1}` : 'Input'), named: !!(name || names?.[i]), mask: mask && i === 0 && u === i0.imageUrl ? mask : null })); };
