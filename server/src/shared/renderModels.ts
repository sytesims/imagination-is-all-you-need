/**
 * Render models (Direct a Shot step 3, 2026-10-26): ONE isomorphic list of the models the Render sheet offers, read by the server (tool make-it-real,
 * the Router request bodies, the quote) and the web (the model picker, lengths, qualities, the first-frame hint, the price line). No imports beyond
 * the shared make-it-real rules.
 *
 * Plan and evidence: the render-models research (22 models ranked, 2026-10-26). This step wires the models that need no new upload plumbing:
 *  - LTX-2.5 + Layout to Render, local and free (the default; shared/makeItReal.ts keeps its own recipe and sizes)
 *  - Kling 3.0 Omni Edit (Router kling/kling-v3-omni, video_list refer_type base): the mockup is the video to edit, the first frame an image reference
 *  - Runway Aleph 2 (Router runway/aleph2): the mockup inline as videoUri, the first frame as promptImage position first (its true first-frame slot)
 *  - Luma Ray 3.2 Edit (Router luma_2/ray-3.2, type video_edit, edit strength adhere_1): the mockup inline as source.data; no first frame
 *  - Seedance 2.5 Edit (Router byteplus/dreamina-seedance-2-5-260628, duration -1): the adapter is built, but Seedance takes a video only as a public
 *    link. Until Comfy's storage upload helper exists here it runs only with OPENHIGGSFIELD_PUBLIC_BASE_URL set; the picker shows it greyed with why.
 *
 * Each row says which Preview style the model reads best (Clay for edit models: shading gives form and light direction; never Depth for an edit model,
 * which would keep the depth look), where the first frame goes, the clip limits, qualities, how the clip travels and its prompt template (our words).
 */
import { MAKE_REAL_PROVIDER, stripAvoidWords } from './makeItReal.js';

export type RenderStyle = 'clay' | 'simple' | 'depth';
export const RENDER_STYLE_LABEL: Record<RenderStyle, string> = { clay: 'Clay', simple: 'Simple', depth: 'Depth' };
export interface RenderQuality { id: string; label: string; hint: string }
export interface RenderModel {
  /** Our provider id (the engine the job runs on). */ id: string;
  /** The real model name shown everywhere. */ name: string; maker: string;
  route: 'local' | 'router';
  /** Comfy Router model id (router rows). */ routerModel?: string;
  /** The Preview style this model reads best, and why (the sheet's "Best with" line). */ style: RenderStyle; styleWhy: string;
  /** required: Render waits for it · optional: used when given · none: the model takes no picture (a picture is left out, with a note). */ firstFrame: 'required' | 'optional' | 'none';
  /** Where the picture goes: a guide frame (LTX), the output's first frame (Aleph), a reference image (Kling, Seedance). */ firstFrameAs: 'guide' | 'first' | 'reference' | null;
  /** The sheet's hint under First frame for this model. */ firstFrameHint: string;
  /** Clip limits in seconds and pixels (the mockup is cut and, if needed, scaled to fit). maxFps: the clip is sent at 24 fps, which every row takes. */
  clip: { minSec: number; maxSec: number; minSide?: number; maxSide?: number; maxFps?: number };
  /** Our quality ids, cheapest first; Aleph has one (its output follows the clip's size). */ qualities: RenderQuality[]; defaultQuality: string;
  /** local file · inline (data URI / base64 in the body) · url (a public link only). */ transport: 'local' | 'inline' | 'url';
  /** Prompt cap in characters (the schema's). */ promptMax: number;
  /** A first time range in seconds (cloud: queue + render), shown as "about N min" until this computer has timed one. */ eta: { low: number; high: number };
  /** Router doc page (request body source). */ doc: string;
  /** Short line for the picker. */ blurb: string;
}
const DOC = (p: string) => `https://docs.comfy.org/development/comfy-router/models/${p}/code`;
const RAY_RES: RenderQuality[] = [{ id: '360p', label: '360p', hint: 'Draft · cheapest' }, { id: '540p', label: '540p', hint: 'Cheaper' }, { id: '720p', label: '720p', hint: 'Sharper' }, { id: '1080p', label: '1080p', hint: 'Sharpest' }];

/** Ids of the cloud rows (provider ids; Kling and Seedance are the same engines Video Swap uses, so prices, catalogue and receipts are shared). */
export const RENDER_KLING = 'router-kling-edit';
export const RENDER_ALEPH = 'router-aleph2';
export const RENDER_RAY = 'router-ray32-edit';
export const RENDER_SEEDANCE = 'router-seedance-25-edit';

/** In picker order: the local default first, then the cloud models by price for a 5 s Render (Kling 720p $0.63 · Ray 720p $1.08 · Aleph $2.00),
 *  Seedance last while it needs the upload helper. */
export const RENDER_MODELS: RenderModel[] = [
  { id: MAKE_REAL_PROVIDER, name: 'LTX-2.5 · Layout to Render', maker: 'Lightricks', route: 'local', style: 'clay', styleWhy: 'Lightricks’ LoRA reads shapes and motion; Clay or Simple both work',
    firstFrame: 'required', firstFrameAs: 'guide', firstFrameHint: 'Painted for you on this computer when you press Render (the mockup’s first frame in the finished look). Swap it for your own picture any time.',
    clip: { minSec: 1.7, maxSec: 10 }, qualities: [], defaultQuality: '', transport: 'local', promptMax: 1500, eta: { low: 510, high: 690 }, doc: 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render',
    blurb: 'Free, on your computer · slow (minutes) · needs a first frame' },
  { id: RENDER_KLING, name: 'Kling 3.0 Omni Edit', maker: 'Kuaishou', route: 'router', routerModel: 'kling/kling-v3-omni', style: 'clay', styleWhy: 'Clay shading shows form and light; Depth would be kept as the look',
    firstFrame: 'optional', firstFrameAs: 'reference', firstFrameHint: 'Optional: a picture of the person or the look you want. Kling takes it as a reference.',
    clip: { minSec: 3, maxSec: 10, minSide: 720, maxSide: 2160, maxFps: 60 }, qualities: [{ id: '720p', label: '720p', hint: 'Standard · cheaper' }, { id: '1080p', label: '1080p', hint: 'Pro · sharper' }], defaultQuality: '720p',
    transport: 'url' /* inline video is refused (invalid_input, 2026-10-26) */, promptMax: 2500, eta: { low: 60, high: 180 }, doc: DOC('kling/kling-v3-omni'), blurb: 'Cheapest cloud edit · 3–10 s · picture optional' },
  { id: RENDER_RAY, name: 'Luma Ray 3.2 Edit', maker: 'Luma AI', route: 'router', routerModel: 'luma_2/ray-3.2', style: 'clay', styleWhy: 'Its “adhere” strength keeps structure; Clay gives it form to keep',
    firstFrame: 'none', firstFrameAs: null, firstFrameHint: 'Ray 3.2 Edit takes no picture: the prompt carries the look.',
    clip: { minSec: 2, maxSec: 10 }, qualities: RAY_RES, defaultQuality: '720p', transport: 'inline', promptMax: 6000, eta: { low: 60, high: 120 }, doc: DOC('luma_2/ray-3-2'),
    blurb: 'Keeps structure (adhere) · billed as 5 s or 10 s · no first frame' },
  { id: RENDER_ALEPH, name: 'Runway Aleph 2', maker: 'Runway', route: 'router', routerModel: 'runway/aleph2', style: 'clay', styleWhy: 'Clay shading shows form and light; Depth would be kept as the look',
    firstFrame: 'optional', firstFrameAs: 'first', firstFrameHint: 'Optional: a finished first frame. Aleph 2 starts the video on it, so it sets the look exactly.',
    clip: { minSec: 2, maxSec: 10, maxFps: 30 }, qualities: [{ id: 'source', label: 'Source size', hint: 'The output follows the clip' }], defaultQuality: 'source',
    transport: 'inline', promptMax: 1000, eta: { low: 60, high: 120 }, doc: DOC('runway/aleph2'), blurb: 'True first-frame slot · output at the clip’s size' },
  { id: RENDER_SEEDANCE, name: 'Seedance 2.5 Edit', maker: 'ByteDance', route: 'router', routerModel: 'byteplus/dreamina-seedance-2-5-260628', style: 'clay', styleWhy: 'Clay shading shows form and light; Depth would be kept as the look',
    firstFrame: 'optional', firstFrameAs: 'reference', firstFrameHint: 'Optional: a picture of the person or the look you want. Seedance takes it as a reference.',
    clip: { minSec: 2, maxSec: 10 }, qualities: [{ id: '480p', label: '480p', hint: 'Cheaper' }, { id: '720p', label: '720p', hint: 'Sharper' }, { id: '1080p', label: '1080p', hint: 'Sharpest' }], defaultQuality: '720p',
    transport: 'url', promptMax: 2000, eta: { low: 60, high: 180 }, doc: DOC('byteplus/dreamina-seedance-2-5-260628'), blurb: 'Most faithful cloud edit · needs a public link for the clip' },
];
export const renderModelOf = (id: string | null | undefined): RenderModel | null => RENDER_MODELS.find((m) => m.id === id) ?? null;
export const isCloudRender = (id: string | null | undefined) => renderModelOf(id)?.route === 'router';
export const RENDER_PROVIDERS = RENDER_MODELS.map((m) => m.id);

/** Why a model can't run here yet (null = it can). Kling and Seedance take the clip only as a link: Comfy's storage upload helper
 *  (routing/renderUpload.ts) or OPENHIGGSFIELD_PUBLIC_BASE_URL. `publicBase` = the server has a public address; `upload` = the helper is here. */
export function renderNeeds(id: string, o: { publicBase?: boolean; upload?: boolean } = {}): string | null {
  const m = renderModelOf(id); if (!m || m.transport !== 'url' || o.publicBase || o.upload) return null;
  return `Needs the upload helper: ${m.name.split(' ')[0]} takes your mockup only as a web link, and the app can’t make one yet`;
}

/** Whole-second lengths a cloud model can render from a mockup of `seconds` (never longer than the mockup; [] when it is too short). */
export function renderLengths(id: string, seconds: number): number[] {
  const m = renderModelOf(id); if (!m || m.route === 'local') return [];
  const top = Math.min(m.clip.maxSec, Math.floor(seconds + 0.05)); const lo = Math.ceil(m.clip.minSec);
  const out: number[] = []; for (let s = lo; s <= top; s++) out.push(s); return out;
}
/** The default length: the whole mockup (what was staged), as long as the model allows. */
export const renderDefaultLength = (id: string, seconds: number) => { const ls = renderLengths(id, seconds); return ls[ls.length - 1] ?? null; };
/** Seconds the provider bills for a Render of `sec` (Ray 3.2 Edit bills a clip up to 5 s as 5 s and 5–10 s as 10 s; the others bill the clip's seconds). */
export const renderBillSeconds = (id: string, sec: number) => (id === RENDER_RAY ? (sec <= 5 ? 5 : 10) : sec);
export const renderQualityOf = (id: string, q: string | null | undefined) => { const m = renderModelOf(id); if (!m || !m.qualities.length) return ''; return m.qualities.some((x) => x.id === q) ? String(q) : m.defaultQuality; };

/** The recording to send for a model: the output in the model's style when the mockup has it, else the first one (with a note). Labels: Simple / Clay / Depth. */
export function pickStyleOutput<T extends { label?: string | null; url: string }>(outputs: T[], style: RenderStyle): { out: T | null; style: RenderStyle | null; matched: boolean; note: string | null } {
  // labels are "Clay view" / "Simple view" / "Depth view" (tools/previz.ts PASS_LABEL); a bare "Clay" reads the same
  const styleOf = (o: T): RenderStyle | null => (Object.entries(RENDER_STYLE_LABEL).find(([, l]) => String(o.label ?? '').trim().toLowerCase().replace(/\s+view$/, '') === l.toLowerCase())?.[0] as RenderStyle) ?? null;
  const vids = outputs.filter((o) => /\.mp4(\?|$)/i.test(o.url)); const hit = vids.find((o) => styleOf(o) === style);
  if (hit) return { out: hit, style, matched: true, note: null };
  const first = vids.find((o) => styleOf(o) !== 'depth') ?? vids[0] ?? null; const got = first ? styleOf(first) : null;
  return { out: first, style: got, matched: false, note: first ? `This mockup has no ${RENDER_STYLE_LABEL[style]} view, so its ${got ? RENDER_STYLE_LABEL[got] : 'first'} view is used. Record a ${RENDER_STYLE_LABEL[style]} view for the best result.` : null };
}

/** The prompt a cloud model gets (our words): the user's shot (avoid-words stripped) inside "keep the camera, layout and motion; change only the look". */
export function renderPrompt(id: string, user: string, hasFirstFrame: boolean): string {
  const shot = stripAvoidWords(String(user ?? '')).replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
  const keep = 'Keep the camera movement, framing, composition, timing and the position and motion of every object exactly the same; only change the materials, lighting and rendering';
  if (id === RENDER_KLING) return `Turn <<<video_1>>> into a finished live-action shot: ${shot}. ${keep}.${hasFirstFrame ? ' <<<image_1>>> is a reference for the people and the look.' : ''}`;
  if (id === RENDER_SEEDANCE) return `Turn Video 1 into a finished live-action shot: ${shot}. ${keep}.${hasFirstFrame ? ' Image 1 is a reference for the people and the look.' : ''} No additional content.`; // Seedance's own labels: Video 1 / Image 1
  if (id === RENDER_ALEPH) return `Turn this rough previs into a finished live-action shot: ${shot}. ${keep}.`;
  if (id === RENDER_RAY) return `A finished live-action shot: ${shot}. Real materials, textures and light. ${keep}.`;
  return shot;
}
/** "about 2 min" for a cloud model (the row's range). */
export const renderEtaText = (m: Pick<RenderModel, 'eta'>) => `about ${Math.max(1, Math.round((m.eta.low + m.eta.high) / 2 / 60))} min`;
