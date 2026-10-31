/**
 * Cloud character swap (Video Swap: Person swap and Motion transfer) — ONE shared source for the server (Router bodies, limits, quotes) and the
 * web (Video Swap form: character image, Who to replace, Quality, Trim). Isomorphic: no imports.
 *
 * Edit intent: replace ONE described person in the source scene. Motion Transfer instead generates a NEW video from image appearance and clip
 * performance guidance. Neither intent is a measured preservation guarantee. The current audio policy remuxes the source sound, or outputs silence.
 *
 * Shared pieces (used by every cloud swap model, and meant for a later H3-on-cloud swap too):
 *  - CLOUD_SWAP_MODELS: per model the pass length, the total swap range, the qualities and how many character images it takes.
 *  - planPasses: split a swap range into balanced passes of whole seconds (Kling edits ≤ 10 s per request); the server joins them and puts the
 *    source audio back.
 *  - clampTrim: the swap range a clip allows for a model (whole seconds, max shown in the form).
 *  - swapPrompt: the prompt template built from the user's "Who to replace" text (own words).
 */
export type SwapMode = 'object_swap' | 'motion_transfer';
export interface CloudSwapModel {
  /** Our provider id (Video Swap model). */ id: string;
  /** The real model name shown in the UI. */ name: string;
  /** Comfy Router model id. */ routerModel: string;
  /** Longest source clip one request takes (seconds); longer swap ranges run as several passes and are joined. */ maxPassSec: number;
  /** Shortest clip one request takes (seconds). */ minPassSec: number;
  /** Longest swap range in one job (seconds) and the shortest. */ maxTotalSec: number; minTotalSec: number;
  /** Qualities (our resolution ids) the model renders, cheapest first; the default is `defaultQuality`. */ qualities: string[]; defaultQuality: string;
  /** Short words per quality for the picker. */ qualityHints: Record<string, string>;
  /** Character images one Person swap request takes (we send exactly one: "a clear full view or a character sheet"). */ maxImages: number;
  /** Character images one Motion transfer request takes (2026-10-26: several people in one clip, Image 1, Image 2… in order; the prompt says who goes where). */ maxCharacterImages: number;
  /** Router doc page (request body source). */ doc: string;
  /** A known problem, said in one line on its menu row and card (it stays listed and pickable, but is never the automatic pick). */ warning?: string;
}
/** Seedance 2.5 Edit (BytePlus) turns down most photos of real people (content rules); a drawn or made-up character runs. */
export const SEEDANCE_PEOPLE_WARNING = 'Often refuses photos of real people';
/** A swap model with a known problem: listed and pickable, never the automatic pick on Video Swap / Motion Transfer (routing/defaults.ts). */
export const swapNeverAuto = (provider: string | null | undefined): boolean => !!cloudSwapOf(provider)?.warning;
const DOC = (p: string) => `https://docs.comfy.org/development/comfy-router/models/${p}/code`;
/** Facts from the Router schemas and official node documentation (reviewed 2026-10-25):
 *  - Kling 3.0 Omni edit (video_list refer_type base): source video 3–10.05 s, 720–2160 px a side, 24–60 fps, mp4 / mov, ≤ 200 MB; ≤ 4 reference images
 *    when a video is sent (≥ 300 px, aspect 1:2.5–2.5:1); output length = source length; mode std = 720p, pro = 1080p; keep_original_sound yes / no.
 *  - Seedance 2.5 video edit (reference_video + reference_image, duration -1): input video ≥ 2 s, total input ≤ 30 s, a public URL only; 480p / 720p / 1080p. */
export const CLOUD_SWAP_MODELS: Record<string, CloudSwapModel> = {
  'router-kling-edit': { id: 'router-kling-edit', name: 'Kling 3.0 Omni Edit', routerModel: 'kling/kling-v3-omni', maxPassSec: 10, minPassSec: 3, maxTotalSec: 30, minTotalSec: 4,
    qualities: ['720p', '1080p'], defaultQuality: '720p', qualityHints: { '720p': 'Standard · cheaper', '1080p': 'Pro · sharper' }, maxImages: 1, maxCharacterImages: 4 /* ≤ 4 reference images with a video */, doc: DOC('kling/kling-v3-omni') },
  'router-seedance-25-edit': { id: 'router-seedance-25-edit', name: 'Seedance 2.5 Edit', routerModel: 'byteplus/dreamina-seedance-2-5-260628', maxPassSec: 30, minPassSec: 4, maxTotalSec: 30, minTotalSec: 4,
    qualities: ['480p', '720p', '1080p'], defaultQuality: '720p', qualityHints: { '480p': 'Faster · cheaper', '720p': 'Sharper', '1080p': 'Sharpest · slow' }, maxImages: 1, maxCharacterImages: 30 /* Seedance 2.5 reference images (shared/promptGrammar.ts seedance-2.5-edit) */, doc: DOC('byteplus/dreamina-seedance-2-5-260628'),
    // 2026-10-31: 0 of 2 motion transfers ran; both were content-policy refusals of a real person's photo (BytePlus PrivacyInformation)
    warning: SEEDANCE_PEOPLE_WARNING },
};
export const isCloudSwap = (provider: string | null | undefined): boolean => !!provider && provider in CLOUD_SWAP_MODELS;
export const cloudSwapOf = (provider: string | null | undefined): CloudSwapModel | null => (provider && CLOUD_SWAP_MODELS[provider]) || null;
/** Character images a job of this mode takes on this model (motion transfer: several people; person swap: one). */
export const swapImagesMax = (m: CloudSwapModel, mode: SwapMode): number => (mode === 'motion_transfer' ? m.maxCharacterImages : m.maxImages);

/** Balanced passes of whole seconds for a swap range: ceil(total / maxPass) passes whose lengths differ by ≤ 1 s (25 s at 10 → 9 / 8 / 8).
 *  Every pass is ≥ minPass when total ≥ minPass. Returns [] for a range the model can't take. */
export function planPasses(totalSec: number, maxPass: number, minPass = 1): { start: number; dur: number }[] {
  const T = Math.round(totalSec); if (!(T >= minPass) || !(maxPass >= minPass)) return [];
  const n = Math.ceil(T / maxPass); const base = Math.floor(T / n); const rem = T % n; if (base < minPass) return [];
  const out: { start: number; dur: number }[] = []; let t = 0;
  for (let k = 0; k < n; k++) { const d = base + (k < rem ? 1 : 0); out.push({ start: t, dur: d }); t += d; }
  return out;
}

/** Seconds a swap range bills: the range's own length (trimEnd − trimStart, to 0.01 s), never the uploaded file's length. The ONE rule the quote
 *  (web bar `seconds`, GET /price with videoPath) and the submit (tools/videoSwap.ts) share: a 8.04 s upload with range 0–8 bills 8 s on both. */
export const swapRangeSeconds = (r: { start: number; end: number }): number => Math.round((Number(r.end) - Number(r.start)) * 100) / 100;

/** The swap range a clip allows for a model: whole seconds inside the clip, at most maxTotal long, at least minTotal. Default = from the start, as
 *  long as the model allows. Returns null when the clip is shorter than the model's minimum. */
export function clampTrim(clipSec: number, want: { start?: number | null; end?: number | null } = {}, maxTotal = 30, minTotal = 4): { start: number; end: number } | null {
  const clip = Math.floor(Math.max(0, Number(clipSec) || 0) + 0.05); if (clip < minTotal) return null;
  let start = Math.max(0, Math.min(clip - minTotal, Math.round(Number(want.start) || 0)));
  let end = want.end == null || !Number.isFinite(Number(want.end)) ? start + maxTotal : Math.round(Number(want.end));
  end = Math.min(clip, Math.max(start + minTotal, Math.min(start + maxTotal, end)));
  if (end - start < minTotal) start = Math.max(0, end - minTotal);
  return { start, end };
}

/** How the form describes a range on this model: "One pass" or "3 passes of up to 10 s, joined; your clip's sound is kept". */
export function passNote(m: CloudSwapModel, totalSec: number): string {
  const ps = planPasses(totalSec, m.maxPassSec, m.minPassSec); if (ps.length <= 1) return `${m.name} swaps this in one pass.`;
  return `${m.name} takes up to ${m.maxPassSec} s per pass: this runs as ${ps.length} passes (${ps.map((p) => `${p.dur} s`).join(' + ')}), joined into one clip with your clip's own sound.`;
}

/** Placeholder text and hint for "Who to replace" (describe one person so nobody else changes). */
export const WHO_HINT = 'Describe ONE person so no one else changes: position, clothes or hair, e.g. "the man on the left in the black hoodie".';
export const CHARACTER_HINT = 'One image of the new character: a clear full view or a character sheet.';
/** Motion transfer on a model that takes several character images (the bar's Character slot). */
export const CHARACTERS_HINT = 'Images of the new people, in order: Image 1, Image 2… Use @image1 in the prompt to say who goes where.';

/** Our route policy, not a promise that Router exposes an explicit task selector. No unsupported BytePlus fields are sent. */
export const SEEDANCE_TASK_NOTE = 'Comfy Router selects the task automatically from the prompt and inputs; this route cannot force reference or edit mode.';
export const MOTION_GENERATION_NOTE = 'Generates a new video: images guide appearance; the clip guides performance. Camera, framing and timing may differ. Output length is requested to match the selected range.';
export const MOTION_AUDIO_NOTE = 'Sound on reuses the original clip’s soundtrack, not generated audio. It may not align with the new performance. Sound off produces silence.';

/** Prompt template for a cloud swap (our own words). `video` / `image` = how the model names its inputs (Kling: <<<video_1>>> / <<<image_1>>>).
 *  Swap: replace the described person, keep everything else. Motion: the character performs the clip's motion. The user's extra prompt goes last. */
export function swapPrompt(o: { mode: SwapMode; who?: string | null; extra?: string | null; video: string; image: string; images?: string[]; keepSound?: boolean }): string {
  const who = String(o.who ?? '').trim().replace(/[.\s]+$/, '') || 'the main person';
  const extra = String(o.extra ?? '').trim();
  const many = o.images && o.images.length > 1 ? o.images : null;
  const core = o.mode === 'motion_transfer' && many
    ? `Generate a new video with the characters from ${many.slice(0, -1).join(', ')} and ${many[many.length - 1]}. Use ${o.video} only as performance guidance for their movements, gestures and expressions, rather than reproducing its scene. Use each image for that character's face, hair, body and outfit. Compose the new scene around these characters; camera, framing and timing need not match the reference clip.`
    : o.mode === 'motion_transfer'
    ? `Generate a new video with the character from ${o.image}. Use ${o.video} only as performance guidance for movements, gestures and expressions, rather than reproducing its scene. Use ${o.image} for the character's face, hair, body and outfit. Compose the new scene around this character; camera, framing and timing need not match the reference clip.`
    : `Replace ${who} in ${o.video} with the character from ${o.image}. Keep that person's exact motion, pose, gestures, lip movement and timing. Keep the camera, framing, lighting, background and every other person unchanged. The character keeps the face, hair, body and full outfit shown in ${o.image}.`;
  return [core, extra].filter(Boolean).join(' ');
}
