/**
 * Fit to model (2026-10-26): ONE shared place for what a model takes as an INPUT video, and the free, local fix that makes a clip fit before upload.
 * Isomorphic (server: quote, submit, the job's run; web: the bar's note and the two-choice preview; MCP goes through the same HTTP quote / submit).
 *
 *   VIDEO_INPUT_LIMITS  per model (provider id) and, where a model runs two jobs, per tool: input sides / pixels / aspect, length, fps, file size and
 *                       container, and what the OUTPUT aspect does (follows the clip, or snaps to a short list). Facts come from the existing per-model
 *                       modules (shared/cloudSwap.ts CLOUD_SWAP_MODELS, shared/renderModels.ts RENDER_MODELS) plus the docs each row names (the local
 *                       Official Comfy documentation: docs.comfy.org). Unstated limits remain unset rather than guessed.
 *   planVideoFit()      the fix for one clip on one model (pure maths): upscale / downscale, pad or crop to an aspect the model keeps, trim, fps, MP4.
 *   restoreRect()       after the run: where the source picture sits in the result, so the padding is cropped back off (the result keeps the
 *                       clip's own framing; sound untouched, so it stays in sync).
 *   videoFitFor()       job-shaped input (width, height, duration, fps, fit) → the plan; the quote, the submit and the route check all call it.
 *
 * Why pad with black (not a blurred fill): edit models see letterboxed film all the time and keep bars as plain bars, so the picture area stays
 * where it was and the crop-back is exact. A blurred fill reads as more scene: the model tends to move people or motion into it and to shift the
 * framing, which the crop-back then cuts. 'blur' is kept as an option of the ffmpeg step, not offered in the bar.
 */
import { CLOUD_SWAP_MODELS } from './cloudSwap.js';
import { RENDER_MODELS, RENDER_KLING, RENDER_ALEPH, RENDER_RAY, RENDER_SEEDANCE } from './renderModels.js';

export type FitMode = 'pad' | 'crop' | 'off';
export interface VideoInputLimits {
  /** Model name for messages ("Kling 3.0 Omni Edit"); the short name ("Kling") is its first word. */ name: string;
  /** Each side, px (Kling edit: 720–2160). */ minSide?: number; maxSide?: number;
  /** Pixels per frame (Seedance reference videos: 409,600–2,086,876). */ minPixels?: number; maxPixels?: number;
  /** Largest width × height (BFL upscaler: 2560×1440, either way round). */ maxBox?: [number, number];
  /** Input shape the model accepts, width / height (Seedance: 0.4–2.5). */ aspect?: [number, number];
  /** What the result's shape does: 'source' = follows the clip; snap = the model returns one of these and centre-crops the rest (Kling edit:
   *  a 1720×720 clip came back 1280×720, sides cut, 2026-10-26); 'unknown' = not documented. */ output: 'source' | { snap: string[] } | 'unknown';
  /** Seconds (per job; a model that joins passes takes the job total). */ minSec?: number; maxSec?: number;
  /** Frame rate range; outside it the clip is converted (to the nearest end). */ fps?: [number, number];
  /** Largest file (bytes), and the container it must be (re-encoded to MP4 when not). */ maxBytes?: number; formats?: string[];
  /** false: a size problem is refused, not fixed (upscalers: shrinking a clip before upscaling it makes no sense). */ autoSize?: boolean;
  /** Where each figure comes from. */ source: string; verified: boolean; note?: string;
}

const MB = 1024 * 1024;
const COMFY = (n: string) => `https://docs.comfy.org/built-in-nodes/${n}`;
const KS = CLOUD_SWAP_MODELS['router-kling-edit']; const SS = CLOUD_SWAP_MODELS['router-seedance-25-edit'];
const R = (id: string) => RENDER_MODELS.find((m) => m.id === id)!;
/** Kling 3.0 Omni edit (KlingOmniProEditVideoNode): 720×720–2160×2160, 24–60 fps, mp4 / mov ≤ 200 MB; the result snaps to 16:9 / 9:16 / 1:1. */
const KLING_EDIT = { name: KS.name, minSide: 720, maxSide: 2160, fps: [24, 60] as [number, number], maxBytes: 200 * MB, formats: ['mp4', 'mov'], output: { snap: ['16:9', '9:16', '1:1'] },
  source: `${COMFY('KlingOmniProEditVideoNode')} (720×720–2160×2160, 3–10.05 s a request) + ${KS.doc} (video_list: mp4 / mov, ≤ 200 MB, 24–60 fps; aspect_ratio 16:9 / 9:16 / 1:1); output snap observed 2026-10-26 (1720×720 in, 1280×720 out)`, verified: true };
/** Seedance reference / edit video (ByteDance2ReferenceNode + the BytePlus 2.x size table): a pixel budget per frame and 0.4–2.5 wide per tall. */
const SEEDANCE_PIXELS: [number, number] = [409_600, 2_086_876];
const SEEDANCE_SRC = `${COMFY('ByteDance2ReferenceNode')} (reference videos ≥ 1.8 s, pixel-count limits per resolution, 15.1 s in total on 2.0; video editing on 2.5: output = the reference video's own length and aspect) + ${SS.doc}`;

/** Per model; `byTool` narrows a model that runs two jobs (Kling / Seedance edit: Video Swap and Render). Local models keep the generic floor the
 *  tools already check (tools/shared.ts parseCommon: ≥ 409,600 px, 4–30 s): no page states more, so nothing else is enforced for them. */
export const VIDEO_INPUT_LIMITS: Record<string, VideoInputLimits & { byTool?: Record<string, Partial<VideoInputLimits>> }> = {
  'router-kling-edit': { ...KLING_EDIT, minSec: KS.minTotalSec, maxSec: KS.maxTotalSec, note: `Video Swap joins passes of ≤ ${KS.maxPassSec} s (shared/cloudSwap.ts planPasses), so a job takes ${KS.minTotalSec}–${KS.maxTotalSec} s.`,
    byTool: { 'make-it-real': { minSec: R(RENDER_KLING).clip.minSec, maxSec: R(RENDER_KLING).clip.maxSec, note: 'Render: one request (shared/renderModels.ts).' } } },
  'router-seedance-25-edit': { name: SS.name, minPixels: SEEDANCE_PIXELS[0], maxPixels: SEEDANCE_PIXELS[1], aspect: [0.4, 2.5], output: 'source', minSec: SS.minTotalSec, maxSec: SS.maxTotalSec, formats: ['mp4', 'mov'],
    source: SEEDANCE_SRC, verified: true, byTool: { 'make-it-real': { minSec: R(RENDER_SEEDANCE).clip.minSec, maxSec: R(RENDER_SEEDANCE).clip.maxSec },
      'motion-transfer': { output: 'unknown', note: 'New reference-guided generation with adaptive aspect, not a source-scene edit. Input padding is not cropped back out of the generated scene.' } } },
  // Seedance 2.0 takes the clip as a reference video (Restyle, Re-shoot, Cinema): ≥ 1.8 s, ≤ 15.1 s in total, the same pixel budget and shape range.
  'router-seedance': { name: 'Seedance 2.0', minPixels: SEEDANCE_PIXELS[0], maxPixels: SEEDANCE_PIXELS[1], aspect: [0.4, 2.5], output: 'unknown', minSec: 1.8, maxSec: 15.1, formats: ['mp4', 'mov'], source: SEEDANCE_SRC, verified: true },
  [RENDER_ALEPH]: { name: R(RENDER_ALEPH).name, minSec: R(RENDER_ALEPH).clip.minSec, maxSec: R(RENDER_ALEPH).clip.maxSec, fps: [1, 30], output: 'source',
    source: `${COMFY('RunwayAleph2VideoToVideoNode')} (2–30 s at ≤ 30 fps; output resolution matches the input) + shared/renderModels.ts (Render offers 2–10 s)`, verified: true },
  [RENDER_RAY]: { name: R(RENDER_RAY).name, minSec: R(RENDER_RAY).clip.minSec, maxSec: R(RENDER_RAY).clip.maxSec, output: 'unknown',
    source: `${COMFY('LumaRay32VideoEditNode')} (source ≤ 18 s; output keeps the source length) + shared/renderModels.ts (Render offers 2–10 s)`, verified: true },
  // Video Upscale: sizes are the model's own rule (shared/videoUpscale.ts vupBlock refuses what doesn't fit); here only length, file and container.
  'direct-flux3-upscale': { name: 'FLUX 3 Upscaler', maxBox: [2560, 1440], maxSec: 20, maxBytes: 50 * MB, output: 'source', autoSize: false, source: 'https://docs.bfl.ai/flux_tools/flux_video_upscale (source ≤ 2560×1440, ≤ 20 s, ≤ 50 MB)', verified: true },
  ...Object.fromEntries(['cloud-topaz-starlight-fast', 'cloud-topaz-precise', 'cloud-topaz-astra2', 'cloud-topaz-creative'].map((id) => [id, { name: 'Topaz', formats: ['mp4'], output: 'source' as const, autoSize: false,
    ...(id === 'cloud-topaz-astra2' ? { maxSec: 300, note: 'Astra 2: ≤ 9000 input frames (300 s at 30 fps).' } : {}), source: `${COMFY('TopazVideoEnhanceV2')} (MP4 container; Astra 2 ≤ 9000 input frames)`, verified: true }])),
};

/** The limits a model applies to a tool's source clip (null: no row, nothing to fit). */
export function videoInputLimits(toolId: string | null | undefined, providerId: string | null | undefined): VideoInputLimits | null {
  const row = providerId ? VIDEO_INPUT_LIMITS[providerId] : undefined; if (!row) return null;
  const { byTool, ...base } = row; const t = toolId ? byTool?.[toolId] : undefined; return t ? { ...base, ...t } : base;
}
export const shortName = (l: Pick<VideoInputLimits, 'name'>) => l.name.split(' ')[0];

// ---------------------------------------------------------------- maths
export interface Rect { x: number; y: number; width: number; height: number }
export interface FitStep { kind: 'pad' | 'crop' | 'upscale' | 'downscale' | 'trim' | 'fps' | 'format'; text: string }
export interface VideoFitPlan {
  /** Short model name ("Kling"). */ model: string; mode: FitMode;
  source: { width: number; height: number; seconds: number | null; fps: number | null; aspect: string };
  /** The clip runs (as is, or after the free fix). */ ok: boolean; /** Anything is done to the clip. */ changed: boolean;
  /** Why it can't run (nothing the free fix can do, or Fit is off); null = it runs. */ blocked: string | null;
  /** What doesn't fit the model, in plain words ("Kling needs the clip at least 720 px tall; yours is 536 px."). */ problems: string[];
  /** The fix in a few words each ("enlarge to 720p"). */ fixes: string[]; steps: FitStep[];
  /** The frame that is sent (after pad / crop and scaling). */ frame: { width: number; height: number };
  /** Pad: where the clip's picture sits inside the frame. */ content: Rect | null;
  /** Crop: the part of the source that is kept (source pixels). */ crop: Rect | null;
  scale: number; trimTo: number | null; fps: number | null; toMp4: boolean;
  /** The aspect the model keeps, when the clip's isn't one: the bar offers Keep everything (pad) / Crop to fill. */ aspect: { target: string | null; choice: boolean };
  /** After the run, crop the result back to the clip's framing (pad mode with padding). */ restore: boolean; fill: 'black' | 'blur';
  /** One line for the bar ("Adjusted for Kling: padded to 16:9, full frame kept"). */ note: string | null;
  /** Problems + fix, one sentence ("Kling needs …; yours is 536 px. Fix: enlarge to 720p (free)"). */ reason: string | null;
  limitsSource: string;
}

const ASPECTS: [string, number][] = [['21:9', 21 / 9], ['2.39:1', 2.39], ['2:1', 2], ['16:9', 16 / 9], ['3:2', 1.5], ['4:3', 4 / 3], ['5:4', 1.25], ['1:1', 1], ['4:5', 0.8], ['3:4', 0.75], ['2:3', 2 / 3], ['9:16', 9 / 16], ['1:2', 0.5], ['9:21', 9 / 21]];
export const ratioOf = (a: string): number => { const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(a); return m ? Number(m[1]) / Number(m[2]) : NaN; };
const near = (a: number, b: number, tol = 0.02) => Math.abs(Math.log(a / b)) <= tol;
/** "16:9", "2.39:1" or "2.62:1": the clip's shape in words. */
export function aspectLabel(w: number, h: number): string { const r = w / h; const k = ASPECTS.find(([, v]) => near(r, v, 0.012)); return k ? k[0] : r >= 1 ? `${(Math.round(r * 100) / 100)}:1` : `1:${Math.round((1 / r) * 100) / 100}`; }
const evenDown = (n: number) => Math.max(2, Math.floor(n / 2) * 2); const evenUp = (n: number) => Math.max(2, Math.ceil(n / 2) * 2); const evenNear = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const pxText = (n: number) => n.toLocaleString('en-US');
const pLabel = (w: number, h: number) => `${Math.min(w, h)}p`;

/** Scale factor that brings a W×H frame inside the size rules (1 = fits). null = no scale can (e.g. too wide for both side limits). */
export function sizeScale(W: number, H: number, l: Pick<VideoInputLimits, 'minSide' | 'maxSide' | 'minPixels' | 'maxPixels' | 'maxBox'>): number | null {
  let k = 1; const lo = Math.min(W, H), hi = Math.max(W, H);
  if (l.minSide && lo * k < l.minSide) k = l.minSide / lo;
  if (l.minPixels && W * H * k * k < l.minPixels) k = Math.max(k, Math.sqrt(l.minPixels / (W * H)));
  let down = Infinity; if (l.maxSide) down = Math.min(down, l.maxSide / hi); if (l.maxPixels) down = Math.min(down, Math.sqrt(l.maxPixels / (W * H)));
  if (l.maxBox) { const [bw, bh] = W >= H ? l.maxBox : [l.maxBox[1], l.maxBox[0]]; down = Math.min(down, bw / W, bh / H); }
  if (k > 1 + 1e-9) return k > down + 1e-9 ? null : k; // needs both bigger and smaller: no single scale
  return Math.min(1, down);
}
const sizeOk = (W: number, H: number, l: VideoInputLimits) => !(l.minSide && Math.min(W, H) < l.minSide) && !(l.maxSide && Math.max(W, H) > l.maxSide)
  && !(l.minPixels && W * H < l.minPixels) && !(l.maxPixels && W * H > l.maxPixels) && !(l.maxBox && (W >= H ? W > l.maxBox[0] || H > l.maxBox[1] : W > l.maxBox[1] || H > l.maxBox[0]));
/** What a frame breaks, in plain words (first rule only: the one a user would fix first). */
function sizeProblem(W: number, H: number, l: VideoInputLimits, who: string): string | null {
  const short = W <= H ? 'wide' : 'tall'; const long = W <= H ? 'tall' : 'wide';
  if (l.minSide && Math.min(W, H) < l.minSide) return `${who} needs the clip at least ${l.minSide} px ${short}; yours is ${Math.min(W, H)} px.`;
  if (l.maxSide && Math.max(W, H) > l.maxSide) return `${who} takes clips up to ${l.maxSide} px ${long}; yours is ${Math.max(W, H)} px.`;
  if (l.minPixels && W * H < l.minPixels) return `${who} needs at least ${pxText(l.minPixels)} pixels a frame; yours is ${W}×${H} (${pxText(W * H)}).`;
  if (l.maxPixels && W * H > l.maxPixels) return `${who} takes up to ${pxText(l.maxPixels)} pixels a frame; yours is ${W}×${H} (${pxText(W * H)}).`;
  if (l.maxBox && !sizeOk(W, H, { ...l, minSide: undefined, maxSide: undefined, minPixels: undefined, maxPixels: undefined } as VideoInputLimits)) return `${who} takes clips up to ${l.maxBox[0]}×${l.maxBox[1]}; yours is ${W}×${H}.`;
  return null;
}
/** The aspect a clip must take for this model: the nearest snap aspect when the model snaps and the clip isn't one; the nearest end of the accepted
 *  range when the clip is outside it; else null (the shape is fine). */
export function targetAspect(r: number, l: Pick<VideoInputLimits, 'output' | 'aspect'>): { label: string; ratio: number } | null {
  if (typeof l.output === 'object') { if (l.output.snap.some((a) => near(r, ratioOf(a)))) return null;
    const best = [...l.output.snap].sort((a, b) => Math.abs(Math.log(r / ratioOf(a))) - Math.abs(Math.log(r / ratioOf(b))))[0]; return { label: best, ratio: ratioOf(best) }; }
  if (l.aspect) { const [lo, hi] = l.aspect; if (r < lo - 1e-9) return { label: aspectLabel(lo * 100, 100), ratio: lo }; if (r > hi + 1e-9) return { label: `${hi}:1`, ratio: hi }; }
  return null;
}

/** The free fix for one clip on one model. src seconds / fps may be unknown (a quote before the clip is read): those checks wait for the submit. */
export function planVideoFit(src: { width: number; height: number; seconds?: number | null; fps?: number | null; format?: string | null }, l: VideoInputLimits, mode: FitMode = 'pad', fill: 'black' | 'blur' = 'black'): VideoFitPlan {
  const who = shortName(l); const w = Math.round(src.width), h = Math.round(src.height); const r = w / h; const sec = src.seconds && src.seconds > 0 ? src.seconds : null; const fps = src.fps && src.fps > 0 ? src.fps : null;
  const problems: string[] = []; const fixes: string[] = []; const steps: FitStep[] = []; let blocked: string | null = null;
  // 1. shape
  const tgt = targetAspect(r, l); let FW = w, FH = h; let content: Rect | null = null; let crop: Rect | null = null;
  if (tgt) {
    problems.push(typeof l.output === 'object' ? `${who} makes ${l.output.snap.join(', ').replace(/, ([^,]*)$/, ' or $1')} videos; yours is ${aspectLabel(w, h)}.` : `${who} takes clips from ${l.aspect![0]} to ${l.aspect![1]} wide per tall; yours is ${aspectLabel(w, h)}.`);
    if (mode === 'pad') { if (r > tgt.ratio) { FW = w; FH = w / tgt.ratio; } else { FH = h; FW = h * tgt.ratio; } content = { x: 0, y: 0, width: w, height: h }; fixes.push(`pad to ${tgt.label}${l.output === 'unknown' ? ' for input guidance only' : ' and crop the result back'}`); steps.push({ kind: 'pad', text: `padded to ${tgt.label}, full ${l.output === 'unknown' ? 'input ' : ''}frame kept` }); }
    else if (mode === 'crop') { const cw = r > tgt.ratio ? h * tgt.ratio : w; const ch = r > tgt.ratio ? h : w / tgt.ratio; crop = { x: Math.floor((w - evenDown(cw)) / 4) * 2, y: Math.floor((h - evenDown(ch)) / 4) * 2, width: evenDown(cw), height: evenDown(ch) }; FW = cw; FH = ch; fixes.push(`crop to ${tgt.label}`); steps.push({ kind: 'crop', text: `cropped to ${tgt.label}` }); }
  }
  // 2. size (of the frame that is sent)
  const sp = sizeProblem(w, h, l, who); if (sp) problems.unshift(sp);
  let k = 1;
  if (!sizeOk(Math.round(FW), Math.round(FH), l)) {
    const s = sizeScale(FW, FH, l);
    if (s == null) blocked = blocked ?? `${sizeProblem(Math.round(FW), Math.round(FH), l, who) ?? sp} No size fits ${who}'s limits at this shape.`;
    else if (l.autoSize === false) blocked = blocked ?? `${sizeProblem(Math.round(FW), Math.round(FH), l, who)} Use a ${s > 1 ? 'larger' : 'smaller'} clip.`;
    else k = s;
  }
  let fw = k > 1 ? evenUp(FW * k) : k < 1 ? evenDown(FW * k) : evenNear(FW); let fh = k > 1 ? evenUp(FH * k) : k < 1 ? evenDown(FH * k) : evenNear(FH);
  if (content) { const cw = Math.min(fw, k > 1 ? evenUp(w * k) : k < 1 ? evenDown(w * k) : evenNear(w)); const ch = Math.min(fh, k > 1 ? evenUp(h * k) : k < 1 ? evenDown(h * k) : evenNear(h));
    content = { x: Math.floor((fw - cw) / 4) * 2, y: Math.floor((fh - ch) / 4) * 2, width: cw, height: ch }; }
  if (k > 1.001) { const t = `enlarged to ${pLabel(fw, fh)}`; steps.push({ kind: 'upscale', text: t }); fixes.push(`enlarge to ${pLabel(fw, fh)}`); }
  else if (k < 0.999) { const t = `reduced to ${fw}×${fh}`; steps.push({ kind: 'downscale', text: t }); fixes.push(`reduce to ${fw}×${fh}`); }
  // 3. length
  let trimTo: number | null = null;
  if (sec != null && l.minSec && sec < l.minSec - 0.01) blocked = blocked ?? `${who} needs at least ${l.minSec} s of clip; yours is ${Math.round(sec * 10) / 10} s. Use a longer clip.`;
  if (sec != null && l.maxSec && sec > l.maxSec + 0.05) { trimTo = l.maxSec; problems.push(`${who} takes up to ${l.maxSec} s; yours is ${Math.round(sec * 10) / 10} s.`); fixes.push(`trim to the first ${l.maxSec} s`); steps.push({ kind: 'trim', text: `trimmed to ${l.maxSec} s` }); }
  // 4. frame rate
  let toFps: number | null = null;
  if (fps != null && l.fps && (fps < l.fps[0] - 0.01 || fps > l.fps[1] + 0.01)) { toFps = fps < l.fps[0] ? l.fps[0] : l.fps[1]; problems.push(`${who} takes ${l.fps[0]}–${l.fps[1]} fps; yours is ${Math.round(fps * 100) / 100} fps.`); fixes.push(`convert to ${toFps} fps`); steps.push({ kind: 'fps', text: `set to ${toFps} fps` }); }
  // 5. container
  const fmt = String(src.format ?? '').toLowerCase().replace(/^\./, ''); const toMp4 = !!fmt && !!l.formats && !l.formats.includes(fmt);
  if (toMp4) { problems.push(`${who} takes ${l.formats!.map((f) => f.toUpperCase()).join(' or ')} files; yours is ${fmt.toUpperCase()}.`); fixes.push('convert to MP4'); steps.push({ kind: 'format', text: 'converted to MP4' }); }
  const changed = steps.length > 0;
  if (mode === 'off' && (problems.length || blocked)) blocked = blocked ?? `${problems.join(' ')} Turn on Fit to model to fix it for free, or use another clip.`;
  if (mode === 'off') return { model: who, mode, source: { width: w, height: h, seconds: sec, fps, aspect: aspectLabel(w, h) }, ok: !blocked, changed: false, blocked, problems, fixes: [], steps: [], frame: { width: w, height: h }, content: null, crop: null, scale: 1, trimTo: null, fps: null, toMp4: false,
    aspect: { target: tgt?.label ?? null, choice: !!tgt }, restore: false, fill, note: null, reason: blocked, limitsSource: l.source };
  const restore = l.output !== 'unknown' && !!content && (content.width < fw - 1 || content.height < fh - 1);
  const note = changed && !blocked ? `Adjusted for ${who}: ${steps.map((s) => s.text).join(', ')}` : null;
  const reason = blocked ?? (problems.length ? `${problems.join(' ')} Fix: ${fixes.join(', ')} (free)` : null);
  return { model: who, mode, source: { width: w, height: h, seconds: sec, fps, aspect: aspectLabel(w, h) }, ok: !blocked, changed: changed && !blocked, blocked, problems, fixes, steps, frame: { width: fw, height: fh },
    content: restore ? content : null, crop, scale: Math.round(k * 10000) / 10000, trimTo, fps: toFps, toMp4, aspect: { target: tgt?.label ?? null, choice: !!tgt }, restore, fill, note, reason, limitsSource: l.source };
}

/** Where the clip's picture sits in a result of outW×outH (the model kept the padded frame's shape, maybe at another size). null = nothing to undo,
 *  or the result's shape isn't the frame's (the model did something else: leave it as is). Even numbers, inside the result. */
export function restoreRect(outW: number, outH: number, p: Pick<VideoFitPlan, 'restore' | 'content' | 'frame'>): Rect | null {
  if (!p.restore || !p.content || !(outW > 0 && outH > 0)) return null;
  if (!near(outW / outH, p.frame.width / p.frame.height, 0.02)) return null;
  const sx = outW / p.frame.width, sy = outH / p.frame.height; const c = p.content;
  const width = Math.min(outW, evenNear(c.width * sx)), height = Math.min(outH, evenNear(c.height * sy));
  const x = Math.max(0, Math.min(outW - width, evenNear(c.x * sx))), y = Math.max(0, Math.min(outH - height, evenNear(c.y * sy)));
  return { x, y, width, height };
}

/** The fit mode a request asks for: fit=pad (default) | crop | off. */
export const fitModeOf = (v: unknown): FitMode => { const s = String(v ?? '').toLowerCase().trim(); return s === 'crop' ? 'crop' : /^(off|0|false|no|none)$/.test(s) ? 'off' : 'pad'; };
/** Job-shaped input → the plan for this tool on this model (null: the model has no row, or the clip's size isn't known yet). Reads width, height,
 *  duration (the job's clip seconds: the swap range on Video Swap), fps, videoFormat and fit, the names the quote and the submit both use. */
export function videoFitFor(toolId: string, providerId: string, i: Record<string, any>): VideoFitPlan | null {
  const l = videoInputLimits(String(i.mode ?? '').replace(/_/g, '-') === 'motion-transfer' ? 'motion-transfer' : toolId, providerId); const w = Number(i.width), h = Number(i.height); if (!l || !(w > 0 && h > 0)) return null;
  return planVideoFit({ width: w, height: h, seconds: Number(i.clipSeconds ?? i.duration) || null, fps: Number(i.fps) || null, format: i.videoFormat ?? null }, l, fitModeOf(i.fit));
}
/** The route check (routing/select.ts option, quote and submit alike): a clip that can't run on this model, with the plain reason; null = it runs. */
export function videoFitBlock(toolId: string, providerId: string, i: Record<string, any>): string | null { const p = videoFitFor(toolId, providerId, i); return p?.blocked ?? null; }
/** What the quote carries for the bar (and MCP): the note, the reason, the two-choice geometry. */
export function videoFitQuote(p: VideoFitPlan | null) {
  if (!p) return null;
  return { model: p.model, mode: p.mode, ok: p.ok, changed: p.changed, blocked: p.blocked, note: p.note, reason: p.reason, problems: p.problems, fixes: p.fixes, steps: p.steps.map((s) => s.kind),
    source: p.source, frame: p.frame, content: p.content, crop: p.crop, aspect: p.aspect, restore: p.restore, trimTo: p.trimTo, fps: p.fps };
}
/** The job's record (viewer details): what was done, in one line, plus the numbers. */
export const videoFitSummary = (p: VideoFitPlan, restored: boolean | null = null) => ({ note: p.note, mode: p.mode, steps: p.steps.map((s) => s.text), from: `${p.source.width}×${p.source.height}`, sent: `${p.frame.width}×${p.frame.height}`,
  ...(p.trimTo ? { trimTo: p.trimTo } : {}), ...(p.fps ? { fps: p.fps } : {}), restore: p.restore, restored });
