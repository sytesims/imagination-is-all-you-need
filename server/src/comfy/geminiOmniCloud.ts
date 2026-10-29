/**
 * Gemini Omni 1.1 Flash · Comfy Cloud (2026-10-27, official Comfy template "Gemini Omni 1.1 Flash: Image to Video", comfy.org/workflows
 * c0d1253e51dd, template api_google_gemini_omni_flash_1_1_i2v): Google's GeminiVideoOmniV2 partner node run as an ordinary Comfy Cloud workflow job (API v2), the Comfy key once in
 * extra_data.api_key_comfy_org, the same path as LTX-2.5 Pro / Fast · Comfy Cloud (comfy/ltx25ApiCloud.ts).
 * Why the partner node and not Comfy Router: Router's gemini-interactions/gemini-omni-1.1-flash schema takes `input` (a prompt or content parts)
 * only, with no resolution, shape or task field, and it bills by tokens (5280.275 credits per 1M video output tokens) with no tokens-per-second
 * figure, so a run could not be quoted. The partner node has every control and a per-second price.
 *
 * Graph (API format) = the template: LoadImage (start) [+ LoadImage (last)] → GeminiVideoOmniV2 → SaveVideo. Text to video drops the images.
 * Node inputs as Comfy Cloud's object_info lists them (full copy 2026-10-26; test fixture
 * test/fixtures/object-info-comfy-cloud-featured-2026-10-26.json): `model` is a dynamic combo, so "Omni Flash 1.1" adds "model.prompt",
 * "model.resolution" (360p 720p 1080p 4k), "model.aspect_ratio" (16:9 9:16), "model.task_type" (auto text_to_video image_to_video
 * reference_to_video edit extend), "model.seed" (0–2147483647) and the autogrow "model.images.image_1…image_14" / "model.videos.video_1…3".
 * Length: the node has no length input. Its tooltip: "Specify the length directly in the prompt … the generated length may be 3-10 seconds and
 * defaults to 10." So we ask for it in words at the end of the prompt ("A 6-second clip."), and quote that length.
 * Price: billed per second of generated video, by resolution (docs.comfy.org/tutorials/partner-nodes/pricing › Video: Google Gemini Omni,
 * "Rates are approximate"): 720p 30.57, 1080p 45.87, 4k 91.76 credits per second (shared/hostedPrices.ts row cloud-gemini-omni).
 */
import type { Plan } from './plans.js';
import { videoSize } from '../ffmpeg.js';

export const OMNI_PROVIDER = 'cloud-gemini-omni';
export const OMNI_ROUTE = `comfy-cloud:${OMNI_PROVIDER}`;
export const OMNI_NODE = 'GeminiVideoOmniV2';
export const OMNI_MODEL = 'Omni Flash 1.1';
export const OMNI_NAME = 'Gemini Omni 1.1 Flash';
/** The official template (Comfy-Org/workflow_templates, MIT) and its page on comfy.org/workflows. */
export const OMNI_TEMPLATE = 'api_google_gemini_omni_flash_1_1_i2v';
export const OMNI_TEMPLATE_URL = 'https://comfy.org/workflows/c0d1253e51dd-c0d1253e51dd/';
export const OMNI_DOC = 'https://docs.comfy.org/built-in-nodes/GeminiVideoOmniV2';
/** What we offer: 720p / 1080p / 4K (the node's "4k"), 3–10 s, 16:9 or 9:16. 360p is the node's too; the Create Video bar has no 360p tier yet. */
export const OMNI_RESOLUTIONS = ['720p', '1080p', '4K'] as const;
export const OMNI_SECONDS = [3, 4, 5, 6, 7, 8, 9, 10] as const;
export const OMNI_DEFAULT_SECONDS = 6;
export const OMNI_MODES = ['t2v', 'i2v', 'flf'] as const;
const NODE_RES: Record<string, string> = { '720p': '720p', '1080p': '1080p', '4K': '4k' };

type In = Record<string, any>;
const modeOf = (i: In): string => { const t = Array.isArray(i.types) ? i.types[0] : typeof i.types === 'string' ? (() => { try { const x = JSON.parse(i.types); return Array.isArray(x) ? x[0] : x; } catch { return i.types.split(',')[0]; } })() : null;
  return String(i.mode ?? t ?? '').trim() || (i.imagePath ? 'i2v' : 't2v'); };
/** '720p' / '1080p' / '4K' as asked (case-insensitive, '4k' too); unset → 720p (the node's default). */
export const omniResolution = (i: In): string => { const r = String(i.resolution ?? '').trim(); if (!r) return '720p'; return OMNI_RESOLUTIONS.find((k) => k.toLowerCase() === r.toLowerCase()) ?? r; };
export const omniSeconds = (i: In): number => { const s = Math.round(Number(i.duration)); return (OMNI_SECONDS as readonly number[]).includes(s) ? s : OMNI_DEFAULT_SECONDS; };

/** What this route can't take (null = fine). Same check on the quote, the submit and the plan (quote = charge). */
export function omniIssue(i: In): string | null {
  const m = modeOf(i);
  if (!(OMNI_MODES as readonly string[]).includes(m)) return `${OMNI_NAME} makes text to video, image to video and start + end frame clips`;
  if (i.videoPath || (Array.isArray(i.refVideoPaths) && i.refVideoPaths.length) || (Array.isArray(i.refAudioPaths) && i.refAudioPaths.length) || i.speechPath) return `${OMNI_NAME} takes a prompt and images only here`;
  if (i.draft) return `${OMNI_NAME} has no draft mode`;
  const res = omniResolution(i); if (!(OMNI_RESOLUTIONS as readonly string[]).includes(res)) return `${OMNI_NAME} makes 720p, 1080p or 4K`;
  if (i.duration != null && i.duration !== '' && !(OMNI_SECONDS as readonly number[]).includes(Number(i.duration))) return `${OMNI_NAME} makes 3 to 10 s clips`;
  if (i.aspect && i.aspect !== 'auto' && !['16:9', '9:16'].includes(String(i.aspect))) return `${OMNI_NAME} makes 16:9 or 9:16`;
  return null;
}
/** The frames a run needs (a quote has no files yet). */
const framesIssue = (i: In): string | null => { const m = modeOf(i);
  return (m === 'i2v' || m === 'flf') && !i.imagePath ? `${OMNI_NAME} needs a start image for image to video` : m === 'flf' && !i.lastFramePath ? `${OMNI_NAME} needs an end frame for start + end frame` : null; };
const refuse = (msg: string) => Object.assign(new Error(`${msg}. Nothing was sent or charged`), { reasonCode: 'input_blocked', errorType: 'validation' });

/** The clip's shape: the asked 16:9 / 9:16, else the start image's orientation (portrait → 9:16), else 16:9. */
export const omniAspect = (i: In, img?: { width: number; height: number } | null): '16:9' | '9:16' =>
  i.aspect === '9:16' || i.aspect === '16:9' ? i.aspect : img && img.height > img.width ? '9:16' : '16:9';
/** The prompt the node gets: the user's words, then the length in words (the node reads the length from the prompt). */
export const omniPrompt = (i: In): string => { const p = String(i.hostedPrompt || i.finalPrompt || i.prompt || '').trim(); const s = omniSeconds(i);
  return `${p}${p && !/[.!?]$/.test(p) ? '.' : ''}${p ? ' ' : ''}A ${s}-second clip.`; };
const seed31 = (s: unknown) => (Number.isFinite(Number(s)) ? Math.abs(Math.floor(Number(s))) % 2147483648 : 42);

/** The API-format graph (template shape). `start` / `last` are upload placeholders ({__file}) or Cloud asset refs. */
export function omniGraph(i: In, files: { start?: unknown; last?: unknown } = {}, o: { aspect?: '16:9' | '9:16' } = {}): Record<string, any> {
  const m = modeOf(i); const withStart = (m === 'i2v' || m === 'flf') && files.start != null; const withLast = m === 'flf' && withStart && files.last != null;
  const task = m === 't2v' ? 'text_to_video' : 'image_to_video';
  return {
    ...(withStart ? { '11': { class_type: 'LoadImage', inputs: { image: files.start } } } : {}),
    ...(withLast ? { '12': { class_type: 'LoadImage', inputs: { image: files.last } } } : {}),
    '7': { class_type: OMNI_NODE, inputs: { model: OMNI_MODEL, 'model.prompt': omniPrompt(i), 'model.resolution': NODE_RES[omniResolution(i)] ?? '720p', 'model.aspect_ratio': o.aspect ?? omniAspect(i),
      'model.task_type': task, ...(withStart ? { 'model.images.image_1': ['11', 0] } : {}), ...(withLast ? { 'model.images.image_2': ['12', 0] } : {}), 'model.seed': seed31(i.seed) } },
    '8': { class_type: 'SaveVideo', inputs: { video: ['7', 0], filename_prefix: 'video/openhiggsfield-gemini-omni', format: 'auto', 'format.codec': 'auto' } },
  };
}
/** Free local prep before any upload (routing/cloudRun.ts → CloudWorkflowEntry.prepare): the shape from the start image. Nothing is resized:
 *  the node takes any image and frames it itself. A refused job throws with reasonCode (nothing sent). */
export async function prepareOmniCloud(job: { id: string; input: In }) {
  const i = job.input; const bad = omniIssue(i) ?? framesIssue(i); if (bad) throw refuse(bad);
  const img = i.imagePath && modeOf(i) !== 't2v' ? await videoSize(String(i.imagePath)).catch(() => null) : null;
  i.omni = { aspect: omniAspect(i, img) };
}
/** The plan (comfy/cloudWorkflows.ts standalone entry): one pass. */
export function omniCloudPlan(j: { id: string; toolId: string; provider: string; input: In }): Plan {
  const i = j.input; const bad = omniIssue(i) ?? framesIssue(i); if (bad) throw refuse(bad); const m = modeOf(i);
  const graph = omniGraph(i, { start: i.imagePath ? { __file: String(i.imagePath) } : undefined, last: i.lastFramePath ? { __file: String(i.lastFramePath) } : undefined }, { aspect: i.omni?.aspect });
  const n = graph['7'].inputs;
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`${OMNI_NAME} partner node (${OMNI_NODE}) on Comfy Cloud: ${omniSeconds(i)} s asked in the prompt, ${n['model.resolution']}, ${n['model.aspect_ratio']}, ${m === 't2v' ? 'text to video' : m === 'flf' ? 'start + end frame' : 'image to video'}, with sound`],
    passes: [{ label: 'Result', workflow: `template:${OMNI_TEMPLATE}`, graph, output: '8', expect: { model: OMNI_MODEL, resolution: n['model.resolution'] } }] };
}
