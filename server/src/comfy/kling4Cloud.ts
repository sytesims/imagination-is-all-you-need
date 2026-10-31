/**
 * Kling 4.0 · Comfy Cloud (2026-10-31): Kuaishou's Kling 4.0 through its Comfy partner nodes, run as an ordinary Comfy Cloud workflow job (API v2)
 * with the Comfy key once in extra_data.api_key_comfy_org (the same path as FLUX 3 Max and Gemini Omni: comfy/flux3MaxCloud.ts).
 * Why the partner nodes and not Comfy Router (where Kling 3.0 Omni runs): Router's catalog has no kling-4.0 page yet (docs.comfy.org read 2026-10-31).
 * Nodes (ComfyUI PR #17364, github.com/Comfy-Org/ComfyUI/pull/17364, in ComfyUI v0.43.0; Comfy Cloud runs v0.43.2):
 *   Kling4TextToVideoNode, Kling4ImageToVideoNode (first / middle / last frames), Kling4ReferenceToVideoNode (up to 10 images), Kling4EditVideoNode.
 *   `model` is a dynamic combo ("kling-4.0"), so every input is "model.<name>": prompt, resolution (720p 1080p), duration (3–30), seed, aspect_ratio
 *   (text: 16:9 9:16 1:1 21:9; reference: adaptive + those), first_frame, last_frame, the autogrow "model.reference_images.image_1…image_10".
 *   Images: 10 at most, each ≥ 300 px a side, aspect 2:5 to 5:2. Prompt up to 26,000 characters; it names inputs @Image1, @Image2… (the node turns
 *   them into Kling's @image_1). Sound: every clip has stereo sound made in the same pass (no switch).
 * Graphs = the official Comfy templates api_kling4_t2v / api_kling4_i2v / api_kling4_r2v (github.com/Comfy-Org/workflow_templates, MIT).
 * Wired here: text to video, image to video (start frame), start + end frame, reference to video (1–10 images). Not wired yet: middle keyframes
 * (the bar's Keyframes mode is MiniMax H3's, with pinned times; Kling spaces middle frames evenly), reference videos (a price range, not one figure)
 * and the Edit Video node (Prompt Edit is a one-model app today).
 * Price: the nodes' price badge, per second of the clip by resolution: $0.22451 at 720p, $0.33605 at 1080p (shared/hostedPrices.ts row cloud-kling4).
 */
import type { Plan } from './plans.js';
import { imageDimsOfFile } from '../imageDims.js';

export const K4_PROVIDER = 'cloud-kling4';
export const K4_ROUTE = `comfy-cloud:${K4_PROVIDER}`;
export const K4_NAME = 'Kling 4.0';
export const K4_NODE_MODEL = 'kling-4.0';
export const K4_T2V_NODE = 'Kling4TextToVideoNode';
export const K4_I2V_NODE = 'Kling4ImageToVideoNode';
export const K4_R2V_NODE = 'Kling4ReferenceToVideoNode';
export const K4_TEMPLATES = { t2v: 'api_kling4_t2v', i2v: 'api_kling4_i2v', r2v: 'api_kling4_r2v' } as const;
export const K4_PR = 'https://github.com/Comfy-Org/ComfyUI/pull/17364';
export const K4_TEMPLATE_URL = 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/api_kling4_t2v.json';
export const K4_SECONDS = Array.from({ length: 28 }, (_, k) => k + 3); // 3–30 s
export const K4_DEFAULT_SECONDS = 5;
export const K4_RESOLUTIONS = ['720p', '1080p'] as const;
/** Our shapes: auto (text: 16:9; references: the node's "adaptive") + the node's four. Image to video takes the start frame's shape. */
export const K4_ASPECTS = ['auto', '16:9', '9:16', '1:1', '21:9'] as const;
export const K4_MAX_IMAGES = 10;
export const K4_MAX_CHARS = 26000;
export const K4_MODES = ['t2v', 'i2v', 'flf', 'r2v'] as const;
/** USD per second of the clip (the nodes' price badge: 0.22451 / 0.33605 × duration). */
export const K4_RATES = { '720p': 0.22451, '1080p': 0.33605 } as const;

type In = Record<string, any>;
const modeOf = (i: In): string => { const t = Array.isArray(i.types) ? i.types[0] : typeof i.types === 'string' ? (() => { try { const x = JSON.parse(i.types); return Array.isArray(x) ? x[0] : x; } catch { return i.types.split(',')[0]; } })() : null;
  return String(i.mode ?? t ?? '').trim() || (i.imagePath ? 'i2v' : 't2v'); };
export const k4Resolution = (i: In): string => { const r = String(i.resolution ?? '').trim(); if (!r) return '720p'; return K4_RESOLUTIONS.find((k) => k.toLowerCase() === r.toLowerCase()) ?? r; };
export const k4Seconds = (i: In): number => { const s = Math.round(Number(i.duration)); return K4_SECONDS.includes(s) ? s : K4_DEFAULT_SECONDS; };
const pathsOf = (x: unknown): string[] => (Array.isArray(x) ? x.filter((p): p is string => typeof p === 'string' && !!p) : []);
/** The images a job sends, in order: the start frame (i2v), start + end (flf), or the reference images (r2v). */
export const k4Images = (i: In): string[] => { const m = modeOf(i);
  if (m === 'i2v') return pathsOf([i.imagePath]); if (m === 'flf') return pathsOf([i.imagePath, i.lastFramePath]);
  if (m === 'r2v') { const refs = pathsOf(i.refPaths); return refs.length ? refs : pathsOf([i.imagePath]); } return []; };
/** How many images before the files exist (a quote): the count the form sends, else the files. */
const imageCount = (i: In): number => { const m = modeOf(i); if (m === 'i2v') return 1; if (m === 'flf') return 2;
  if (m === 'r2v') return Number(i.refCount) > 0 ? Number(i.refCount) : k4Images(i).length; return 0; };
const promptOf = (i: In) => String(i.hostedPrompt || i.finalPrompt || i.prompt || '');

/** What this route can't take (null = fine). Same check on the quote, the submit and the plan (quote = charge). */
export function k4Issue(i: In): string | null {
  const m = modeOf(i);
  if (!(K4_MODES as readonly string[]).includes(m)) return `${K4_NAME} makes text to video, image to video, start + end frame and reference to video`;
  if (i.videoPath || i.speechPath || pathsOf(i.refVideoPaths).length || pathsOf(i.refAudioPaths).length) return `${K4_NAME} takes a prompt and pictures here (reference clips and sound are not wired yet)`;
  if (i.draft) return `${K4_NAME} has no draft mode`;
  if (!(K4_RESOLUTIONS as readonly string[]).includes(k4Resolution(i))) return `${K4_NAME} makes 720p or 1080p`;
  if (i.duration != null && i.duration !== '' && !K4_SECONDS.includes(Number(i.duration))) return `${K4_NAME} makes 3 to 30 s clips`;
  if (m === 't2v' && i.aspect && !(K4_ASPECTS as readonly string[]).includes(String(i.aspect))) return `${K4_NAME} makes ${K4_ASPECTS.filter((a) => a !== 'auto').join(', ')}`;
  const n = imageCount(i); if (n > K4_MAX_IMAGES) return `${K4_NAME} takes up to ${K4_MAX_IMAGES} reference images; you added ${n}`;
  const len = promptOf(i).length; if (len > K4_MAX_CHARS) return `${K4_NAME} takes prompts up to ${K4_MAX_CHARS.toLocaleString('en-US')} characters; yours is ${len.toLocaleString('en-US')}. Shorten it`;
  return null;
}
/** One picture's rule (≥ 300 px a side, 2:5 to 5:2). */
const imageIssue = (p: string, what: string): string | null => { const d = imageDimsOfFile(p); if (!d) return null;
  if (Math.min(d.width, d.height) < 300) return `${what} is ${d.width}×${d.height}; ${K4_NAME} needs at least 300 px a side`;
  const r = d.width / d.height; return r > 2.5 || r < 0.4 ? `${what} is ${d.width}×${d.height}; ${K4_NAME} takes shapes from 2:5 to 5:2. Crop it` : null; };
/** The files a run needs (the plan; a quote has no files yet). */
const filesIssue = (i: In): string | null => { const m = modeOf(i); const imgs = k4Images(i);
  if (m === 'i2v' && !imgs.length) return `${K4_NAME} needs a start frame for image to video`;
  if (m === 'flf' && imgs.length < 2) return `${K4_NAME} needs a start and an end frame`;
  if (m === 'r2v' && !imgs.length) return `${K4_NAME} needs at least one reference image`;
  if ((m === 't2v' || m === 'r2v') && !promptOf(i).trim()) return `${K4_NAME} needs a prompt for ${m === 't2v' ? 'text' : 'reference'} to video`;
  const label = (k: number) => (m === 'r2v' ? `Image ${k + 1}` : k === 0 ? 'The start frame' : 'The end frame');
  for (const [k, p] of imgs.entries()) { const bad = imageIssue(p, label(k)); if (bad) return bad; }
  return null; };
const refuse = (msg: string) => Object.assign(new Error(`${msg}. Nothing was sent or charged`), { reasonCode: 'input_blocked', errorType: 'validation' });
const seedOf = (s: unknown) => (Number.isFinite(Number(s)) ? Math.abs(Math.floor(Number(s))) % 2147483648 : 42);

/** The API-format graph (official template shape). `files` are upload placeholders ({__file}) or Cloud asset refs, in the order k4Images gives. */
export function k4Graph(i: In, files: unknown[] = []): Record<string, any> {
  const m = modeOf(i); const aspect = typeof i.aspect === 'string' && i.aspect !== 'auto' && (K4_ASPECTS as readonly string[]).includes(i.aspect) ? i.aspect : null;
  const common = { model: K4_NODE_MODEL, 'model.prompt': promptOf(i), 'model.resolution': k4Resolution(i), 'model.duration': k4Seconds(i), 'model.seed': seedOf(i.seed) };
  const save = { class_type: 'SaveVideo', inputs: { video: ['1', 0], filename_prefix: 'video/openhiggsfield-kling4', format: 'auto', 'format.codec': 'auto' } };
  const loads = Object.fromEntries(files.slice(0, K4_MAX_IMAGES).map((f, k) => [String(10 + k), { class_type: 'LoadImage', inputs: { image: f } }]));
  if (m === 'r2v' && files.length) return { ...loads, '1': { class_type: K4_R2V_NODE, inputs: { ...common, 'model.aspect_ratio': aspect ?? 'adaptive',
    ...Object.fromEntries(Object.keys(loads).map((id, k) => [`model.reference_images.image_${k + 1}`, [id, 0]])) } }, '2': save };
  if ((m === 'i2v' || m === 'flf') && files.length) return { ...loads, '1': { class_type: K4_I2V_NODE, inputs: { ...common, 'model.first_frame': ['10', 0], ...(m === 'flf' && files.length > 1 ? { 'model.last_frame': ['11', 0] } : {}) } }, '2': save };
  return { '1': { class_type: K4_T2V_NODE, inputs: { ...common, 'model.aspect_ratio': aspect ?? '16:9' } }, '2': save };
}
/** The plan (comfy/cloudWorkflows.ts standalone entry): one pass on the template that fits the job. */
export function k4CloudPlan(j: { id: string; toolId: string; provider: string; input: In }): Plan {
  const i = j.input; const bad = k4Issue(i) ?? filesIssue(i); if (bad) throw refuse(bad); const m = modeOf(i);
  const graph = k4Graph(i, k4Images(i).map((p) => ({ __file: p }))); const n = graph['1'].inputs; const k = k4Images(i).length;
  const what = m === 't2v' ? `text to video, ${n['model.aspect_ratio']}` : m === 'i2v' ? 'start frame (its shape)' : m === 'flf' ? 'start + end frame (the start frame’s shape)' : `${k} reference image${k === 1 ? '' : 's'}, ${n['model.aspect_ratio']}`;
  const tpl = m === 't2v' ? K4_TEMPLATES.t2v : m === 'r2v' ? K4_TEMPLATES.r2v : K4_TEMPLATES.i2v;
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`${K4_NAME} partner node (${graph['1'].class_type}) on Comfy Cloud: ${what}, ${n['model.duration']} s, ${n['model.resolution']}, stereo sound`],
    passes: [{ label: 'Result', workflow: `template:${tpl}`, graph, output: '2', expect: { duration: n['model.duration'], resolution: n['model.resolution'] } }] };
}
