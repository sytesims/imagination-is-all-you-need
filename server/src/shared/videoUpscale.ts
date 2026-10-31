/**
 * Video Upscale (tool `upscale`, and Draft Upscale `app-video-upscale` on top of it): the ONE table that says which models upscale a clip, where
 * each runs, its real model name, which output sizes it can make, how the output size is worked out, and how long it takes locally. The tool
 * (submit), every quote path (GET /api/tools/upscale/price, /api/routes, POST /api/models/quotes, the Edit Video price), the ComfyUI plan, the
 * model menu (Video, Canvas and MCP all list the tool's providers) and the speed estimates read it, so the page, the price and the run agree.
 * Isomorphic: no imports.
 *
 * Measured on the user's M1 Max 64 GB (2026-10-26, 5 s at 1024×576 → 1080p, ComfyUI 0.42.5):
 *  - Real-ESRGAN x2plus, then lanczos to the target: 265 s (about 53 s per clip second). Best balance on a Mac.
 *  - 4x-UltraSharp, then lanczos to the target: 786 s (about 157 s per clip second). Sharpest, but fine texture shimmers most.
 *  - SeedVR2 3B (native nodes): over 60 min for 2 s, so it is offered locally on NVIDIA (CUDA) GPUs only.
 * Cloud prices (1 credit = $0.01; Comfy credits at 211 = $1) live in shared/hostedPrices.ts rows registered by tools/videoUpscaleModels.ts.
 */

/** Output targets: id → short side in px (720p … 4K). `2k` is the old id of 1440p (still accepted); `8k` no engine can make (clean 400). */
export const VUP_TARGET_SHORT: Record<string, number> = { '1080p': 1080, '720p': 720, '1440p': 1440, '4k': 2160, '2k': 1440, '8k': 4320 };
/** The targets the page offers, in menu order. */
export const VUP_TARGETS = ['720p', '1080p', '1440p', '4k'] as const;
export const VUP_TARGET_LABEL: Record<string, string> = { '720p': '720p', '1080p': '1080p', '1440p': '1440p', '2k': '1440p', '4k': '4K', '8k': '8K' };
/** The job's resolution value for a target (the speed estimate and per-quality prices are keyed by it). */
export const vupResolution = (target: string) => (target === '4k' ? '2160p' : target === '2k' ? '1440p' : target);
/** Long side of a 16:9 frame at each target (the tool's outputTargets: the long-side caps the old fields use). */
export const VUP_TARGET_LONG: Record<string, number> = Object.fromEntries(Object.entries(VUP_TARGET_SHORT).map(([k, s]) => [k, Math.round((s * 16) / 9 / 2) * 2]));
export const VUP_DEFAULT_TARGET = '1080p';

/** How a model sizes its output:
 *  short = the clip's short side becomes the target (portrait and landscape alike), aspect kept (Real-ESRGAN, UltraSharp, SeedVR2);
 *  long  = the long side becomes 1920 (1080p) or 3840 (4K), aspect kept (Topaz Video Enhance, per its node docs);
 *  scale = source × factor, long side capped at the target (FLUX Video Upscale, Crystal). */
export type VupFit = 'short' | 'long' | 'scale';
export type VupPlace = 'local' | 'cloud';
export interface VupModel {
  /** The real model, shown wherever the model is named (menu, job, history). */ name: string;
  place: VupPlace; placeLabel: string; label: 'Fast' | 'Balanced' | 'Best detail' | 'Creative';
  blurb: string; fit: VupFit; targets: string[]; scales?: number[];
  /** Mode presets (precise / creative / smooth60) this model runs. */ modes: string[];
  /** Price text for the menu (the quote is exact; this is the rule). */ price: string;
  /** Local: weights file the graph loads (models/upscale_models). */ file?: string;
  /** Local ComfyUI graph (workflows/). */ workflow?: string;
  /** Local route is practical only on an NVIDIA (CUDA) GPU (SeedVR2 3B: runs on Apple Silicon, but over an hour for 2 s). */ cudaOnly?: boolean;
  /** Seconds per clip second on each machine class at each target (timing.ts anchors). measured = from a real run. */
  speed?: { mseries?: Record<string, { s: number; measured: boolean; note: string }>; rtx4090?: Record<string, { s: number; measured: boolean; note: string }> };
  /** Credit: where the graph or the request body comes from. */ source: { kind: 'official' | 'community' | 'ours'; name: string; url: string | null; author: string };
}
const TPL = 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/';
/** M1 Max measurement: 5 s at 1024×576 → 1080p. Other targets: the same model pass on the source, then a larger resize and encode (estimates). */
const esrganMac = { '720p': { s: 50, measured: false, note: 'ESTIMATE: the 1080p run minus a smaller resize and encode' }, '1080p': { s: 53, measured: true, note: 'measured on our test laptop: 5 s at 1024×576 → 1080p in 265 s' },
  '1440p': { s: 58, measured: false, note: 'ESTIMATE: the 1080p run plus a larger resize and encode' }, '2160p': { s: 70, measured: false, note: 'ESTIMATE: the 1080p run plus a 4K resize and encode' } };
const ultraMac = { '720p': { s: 150, measured: false, note: 'ESTIMATE: the 1080p run minus a smaller resize and encode' }, '1080p': { s: 157, measured: true, note: 'measured on our test laptop: 5 s at 1024×576 → 1080p in 786 s' },
  '1440p': { s: 165, measured: false, note: 'ESTIMATE: the 1080p run plus a larger resize and encode' }, '2160p': { s: 180, measured: false, note: 'ESTIMATE: the 1080p run plus a 4K resize and encode' } };
/** NVIDIA cells: no run of ours yet (estimates; the app replaces them with this computer's own timed runs). */
const est = (s: Record<string, number>, note: string) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { s: v, measured: false, note: `ESTIMATE: ${note}` }]));

export const VUP_MODELS: Record<string, VupModel> = {
  'comfy-video-esrgan': { name: 'Real-ESRGAN x2', place: 'local', placeLabel: 'Local', label: 'Balanced', fit: 'short', targets: [...VUP_TARGETS], modes: ['precise'], price: 'Free',
    blurb: 'Sharpens every frame, then resizes to your size. The sound stays. The quickest free option.',
    file: 'RealESRGAN_x2plus.pth', workflow: 'upscale-esrgan-api.json',
    speed: { mseries: esrganMac, rtx4090: est({ '720p': 5, '1080p': 6, '1440p': 7, '2160p': 9 }, 'about a tenth of our test laptop’s time (estimate)') },
    source: { kind: 'ours', name: 'upscale-esrgan-api.json (core nodes: LoadVideo → ImageUpscaleWithModel → ResizeImageMaskNode → CreateVideo)', url: null, author: 'Imagination Is All You Need' } },
  'comfy-video-ultrasharp': { name: '4x-UltraSharp', place: 'local', placeLabel: 'Local', label: 'Best detail', fit: 'short', targets: [...VUP_TARGETS], modes: ['precise'], price: 'Free',
    blurb: '4x-UltraSharp: sharper, may shimmer. About three times slower than Real-ESRGAN x2.',
    file: '4x-UltraSharp.pth', workflow: 'upscale-ultrasharp-api.json',
    speed: { mseries: ultraMac, rtx4090: est({ '720p': 15, '1080p': 16, '1440p': 17, '2160p': 19 }, 'about a tenth of our test laptop’s time (estimate)') },
    source: { kind: 'ours', name: 'upscale-ultrasharp-api.json (model: 4x-UltraSharp by Kim2091)', url: 'https://huggingface.co/Kim2091/UltraSharp', author: 'Imagination Is All You Need' } },
  'comfy-seedvr2': { name: 'SeedVR2', place: 'cloud', placeLabel: 'fal', label: 'Best detail', fit: 'short', targets: [...VUP_TARGETS], modes: ['precise'], price: '$0.001 per output megapixel per frame (fal)',
    blurb: 'SeedVR2: one-step diffusion, real texture, content kept. On fal (the cheapest good cloud option); locally SeedVR2 3B, quick on NVIDIA, very slow on Apple chips.',
    workflow: 'upscale-seedvr2-native-api.json', cudaOnly: true,
    speed: { mseries: { '1080p': { s: 1800, measured: true, note: 'measured: over 60 min for 2 s on our test laptop (runs, but slow)' } }, rtx4090: est({ '720p': 20, '1080p': 30, '1440p': 50, '2160p': 110 }, 'SeedVR2 3B int8 one-step, scaled by output pixels (no run of ours on NVIDIA yet)') },
    source: { kind: 'official', name: 'Video Upscale: SeedVR2 (utility_seedvr2_video_upscale), native nodes', url: `${TPL}utility_seedvr2_video_upscale.json`, author: 'Comfy Org' } },
  'cloud-topaz-starlight-fast': { name: 'Topaz Starlight Fast', place: 'cloud', placeLabel: 'Comfy', label: 'Fast', fit: 'long', targets: ['1080p', '4k'], modes: ['precise'], price: '≈0.43 Comfy credits per source frame (1080p), ≈0.85 (4K)',
    blurb: 'Topaz Starlight (Astra) Fast: clean, faithful upscale to 1080p or 4K. Cheapest Topaz.',
    source: { kind: 'official', name: 'Topaz Astra Video Upscale (api_topaz_video_enhance)', url: `${TPL}api_topaz_video_enhance.json`, author: 'Comfy Org' } },
  'cloud-topaz-precise': { name: 'Topaz Starlight Precise 2.5', place: 'cloud', placeLabel: 'Comfy', label: 'Best detail', fit: 'long', targets: ['1080p', '4k'], modes: ['precise'], price: '≈0.70 Comfy credits per source frame (1080p), ≈1.54 (4K)',
    blurb: 'Topaz Starlight Precise 2.5: the most faithful Topaz model; restores detail without changing faces.',
    source: { kind: 'official', name: 'Topaz Starlight Precise 2.5 (api_topaz_starlight_precise25)', url: `${TPL}api_topaz_starlight_precise25.json`, author: 'Comfy Org' } },
  'direct-flux3-upscale': { name: 'FLUX Video Upscale', place: 'cloud', placeLabel: 'Black Forest Labs', label: 'Best detail', fit: 'scale', targets: [...VUP_TARGETS], scales: [1.5, 2, 3], modes: ['precise', 'creative'], price: 'per output megapixel-second: $0.035 precise / $0.05 creative (BFL); Comfy Router per GPU-second',
    blurb: 'FLUX Video Upscale by Black Forest Labs: 1.5×–3×, Precise keeps the source, Creative adds detail. Clips up to 20 s.',
    source: { kind: 'official', name: 'FLUX Video Upscale (api_bfl_flux_video_upscale)', url: `${TPL}api_bfl_flux_video_upscale.json`, author: 'Comfy Org' } },
  'cloud-topaz-astra2': { name: 'Topaz Astra 2', place: 'cloud', placeLabel: 'Comfy', label: 'Creative', fit: 'long', targets: ['1080p', '4k'], modes: ['precise', 'creative'], price: '≈1.72 Comfy credits per source frame (1080p), ≈2.85 (4K)',
    blurb: 'Topaz Astra 2: creative upscale that rebuilds texture; best on soft AI video. Small things can change.',
    source: { kind: 'official', name: 'Topaz Astra 2 (api_topaz_astra2)', url: `${TPL}api_topaz_astra2.json`, author: 'Comfy Org' } },
  'cloud-topaz-creative': { name: 'Topaz Starlight Creative', place: 'cloud', placeLabel: 'Comfy', label: 'Creative', fit: 'long', targets: ['1080p', '4k'], modes: ['precise', 'creative'], price: '≈2.25 Comfy credits per source frame (1080p), ≈3.99 (4K)',
    blurb: 'Topaz Starlight (Astra) Creative: the strongest Topaz re-imagining of detail. Most expensive.',
    source: { kind: 'official', name: 'Topaz Astra Video Upscale (api_topaz_video_enhance), Creative model', url: `${TPL}api_topaz_video_enhance.json`, author: 'Comfy Org' } },
  'router-crystal-video': { name: 'Crystal Video Upscaler', place: 'cloud', placeLabel: 'Comfy', label: 'Best detail', fit: 'scale', targets: [...VUP_TARGETS], scales: [2, 4], modes: ['precise'], price: 'Not published by Comfy yet',
    blurb: 'Clarity Crystal Video Upscaler: faithful, keeps frame rate and audio. Listed only until Comfy publishes its price.',
    source: { kind: 'official', name: 'Clarity AI Crystal Video Upscale (api_clarity_ai_crystal_video_upscale)', url: `${TPL}api_clarity_ai_crystal_video_upscale.json`, author: 'Comfy Org' } },
};
/** Menu order (= the tool's providers): local first (Real-ESRGAN x2, 4x-UltraSharp), then cloud cheapest-good (SeedVR2 on fal, Topaz Fast),
 *  then best quality (Topaz Precise 2.5, FLUX Video Upscale, Astra 2, Topaz Creative), Crystal last (no price yet). */
export const VUP_ORDER = ['comfy-video-esrgan', 'comfy-video-ultrasharp', 'comfy-seedvr2', 'cloud-topaz-starlight-fast', 'cloud-topaz-precise', 'direct-flux3-upscale', 'cloud-topaz-astra2', 'cloud-topaz-creative', 'router-crystal-video'];
/** Engines with a local ComfyUI graph. */
export const VUP_LOCAL = ['comfy-video-esrgan', 'comfy-video-ultrasharp', 'comfy-seedvr2'];
/** Topaz upscaler_model values (TopazVideoEnhanceV2, object_info read 2026-10-26). */
export const TOPAZ_MODEL: Record<string, string> = { 'cloud-topaz-starlight-fast': 'Starlight (Astra) Fast', 'cloud-topaz-precise': 'Starlight Precise 2.5', 'cloud-topaz-astra2': 'Astra 2', 'cloud-topaz-creative': 'Starlight (Astra) Creative' };
/** Comfy credits per SOURCE frame (docs.comfy.org/tutorials/partner-nodes/pricing, Topaz › Video, read 2026-10-26), by upscaler_resolution. */
export const TOPAZ_CREDITS_PER_FRAME: Record<string, { '1080p': number; '2160p': number }> = {
  'cloud-topaz-starlight-fast': { '1080p': 0.43, '2160p': 0.85 }, 'cloud-topaz-precise': { '1080p': 0.70, '2160p': 1.54 },
  'cloud-topaz-astra2': { '1080p': 1.72, '2160p': 2.85 }, 'cloud-topaz-creative': { '1080p': 2.25, '2160p': 3.99 },
};
/** Frame rate the per-frame and per-megapixel-frame prices are quoted at (the job's own clip rate when known; 24 fps for a clip not loaded yet). */
export const VUP_PRICE_FPS = 24;

const ev = (n: number) => Math.max(2, Math.round(n / 2) * 2);
/** Normalise a target id (accepts 2160p, 4K, 2k …). null = unknown. */
export function vupTarget(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase(); if (!s) return null;
  if (s === '2160p' || s === '4k') return '4k'; if (s === '1440p' || s === '2k') return s === '2k' ? '2k' : '1440p';
  return VUP_TARGET_SHORT[s] != null ? s : null;
}
/** Output size of an upscale for this model, source and target (+ factor for the scale models). Even numbers. */
export function vupOutputSize(provider: string, w: number, h: number, target: string, scale = 2): { width: number; height: number; capped: boolean } {
  const m = VUP_MODELS[provider]; const t = vupTarget(target) ?? VUP_DEFAULT_TARGET; const short = VUP_TARGET_SHORT[t]; const long = VUP_TARGET_LONG[t];
  const fit: VupFit = m?.fit ?? 'scale';
  if (fit === 'short') { const k = short / Math.min(w, h); return { width: ev(w * k), height: ev(h * k), capped: false }; }
  if (fit === 'long') { const k = long / Math.max(w, h); return { width: ev(w * k), height: ev(h * k), capped: false }; }
  const k = Math.min(scale, long / Math.max(w, h)); return { width: ev(w * k), height: ev(h * k), capped: k < scale };
}
/** Plain reason this model can't make this target from this source (null = fine). */
export function vupBlock(provider: string, i: { inputSize?: { width: number; height: number } | null; maxOutput?: string | null; types?: unknown; mode?: unknown; targetLongEdge?: unknown; target?: unknown }): string | null {
  const m = VUP_MODELS[provider]; if (!m) return null;
  const t = vupTarget(i.maxOutput) ?? VUP_DEFAULT_TARGET;
  if (!m.targets.includes(t === '2k' ? '1440p' : t)) return `${m.name} makes ${m.targets.map((x) => VUP_TARGET_LABEL[x]).join(' or ')} only`;
  let mode: any = i.types; if (typeof mode === 'string') { try { mode = JSON.parse(mode); } catch { mode = mode.split(','); } } mode = Array.isArray(mode) ? mode[0] : mode ?? i.mode;
  if (typeof mode === 'string' && ['precise', 'creative', 'smooth60'].includes(mode) && !m.modes.includes(mode)) /* other tools' mode ids (t2v, r2v …) are not upscale modes: the tool's own parser refuses them */ return mode === 'smooth60' ? `${m.name} has no 60 fps mode: upscale first, then use FPS Boost` : `${m.name} has no ${mode === 'creative' ? 'Creative' : mode} mode`;
  const tl = vupExactLong(i as any);
  if (tl && m.place === 'cloud' && m.fit !== 'scale') return `${m.name} makes ${m.targets.map((x) => VUP_TARGET_LABEL[x]).join(', ')} only, not an exact size. Pick a size, or use Real-ESRGAN x2 for an exact size`;
  const s0 = i.inputSize; if (tl && s0 && s0.width > 0 && Math.max(s0.width, s0.height) >= tl) return `Your clip is already ${Math.max(s0.width, s0.height)} px wide, so ${tl} px would not make it larger. Pick a bigger size`;
  if ((i as any).sameSize) return null; // vupSizing found no larger size this model makes: it runs at the same size, with a note (never refused, 2026-10-28)
  return vupSizeIssue(provider, i, t, tl);
}
/** The clip is already this size or larger for this target (or a scale model would enlarge it less than its minimum). null = the target enlarges it. */
function vupSizeIssue(provider: string, i: { inputSize?: { width: number; height: number } | null; outputSize?: unknown }, t: string, tl: number | null): string | null {
  const m = VUP_MODELS[provider]; if (!m) return null;
  if (m.fit === 'scale' && (i as any).outputSize && i.inputSize) { const f = vupFactor(i as any); const mn = VUP_MIN_FACTOR[provider] ?? 1;
    if (f < mn - 1e-6) return `${m.name} enlarges at least ${mn}×; ${VUP_TARGET_LABEL[t] ?? t} is only ${f}× your clip. Pick a bigger size, or Real-ESRGAN x2 to re-sharpen it at its size`; }
  const s = i.inputSize; if (!tl && s && s.width > 0 && s.height > 0 && m.fit !== 'scale') {
    const have = Math.min(s.width, s.height); const want = m.fit === 'long' ? VUP_TARGET_LONG[t] : VUP_TARGET_SHORT[t]; const own = m.fit === 'long' ? Math.max(s.width, s.height) : have;
    if (own >= want) return `Your clip is already ${have}p, so ${VUP_TARGET_LABEL[t]} would not make it larger. Pick a bigger size`;
  }
  return null;
}
/** Seconds this job takes locally on a machine class (null = no figure): seconds per clip second × clip seconds. */
export function vupLocalSeconds(provider: string, cls: 'mseries' | 'rtx4090', target: string, seconds: number): number | null {
  const c = VUP_MODELS[provider]?.speed?.[cls]?.[vupResolution(vupTarget(target) ?? VUP_DEFAULT_TARGET)]; return c ? Math.round(c.s * seconds) : null;
}
export const VUP_TOOLS = new Set(['upscale', 'app-video-upscale']);
/** The mode a job runs on a model: what was asked, never swapped for another (a Precise-only model refuses Creative: vupBlock). The Topaz creative models
 *  (Astra 2, Starlight Creative) take either label: the model itself is the creative choice, so the bar's default Precise runs them as they are. */
export function vupMode(_provider: string, types: unknown): string {
  let t: any = types; if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = t.split(','); } }
  return String((Array.isArray(t) ? t[0] : t) ?? 'precise') || 'precise';
}
/** Job-shaped sizing for an upscale job or quote (one rule: submit and every quote path): target, the job's resolution (2160p for 4K), the
 *  output size from the model's fit, and the mode the model will run. Mutates and returns `input`. */
/** An exact long side asked for (targetLongEdge=<px> or target=<W>x<H>), else null. */
export function vupExactLong(q: Record<string, any>): number | null {
  const n = Number(q?.targetLongEdge); if (Number.isFinite(n) && n >= 720) return Math.round(n);
  const m = /^(\d{2,5})\s*x\s*(\d{2,5})$/i.exec(String(q?.target ?? '').trim()); return m ? Math.max(Number(m[1]), Number(m[2])) : null;
}
/** Job-shaped sizing for an upscale job or quote (one rule: submit and every quote path): target, the job's resolution (2160p for 4K), the
 *  output size from the model's fit (an exact long side when one is asked: targetLongEdge / target WxH), and the mode the model will run. Mutates and returns `input`. */
export function vupSizing(provider: string, input: Record<string, any>, q: Record<string, any> = {}) {
  const t = vupTarget(q.maxOutput ?? input.maxOutput) ?? VUP_DEFAULT_TARGET; input.maxOutput = t === '2k' ? '1440p' : t; input.resolution = vupResolution(input.maxOutput);
  const w = Number(q.width ?? input.inputSize?.width), h = Number(q.height ?? input.inputSize?.height);
  const tl = vupExactLong(q) ?? vupExactLong(input); if (tl) input.targetLongEdge = tl;
  if (VUP_MODELS[provider]) { const mode = vupMode(provider, input.types); if (mode) input.types = [mode];
    if (w > 0 && h > 0) { input.inputSize = { width: w, height: h };
      const o = tl && VUP_MODELS[provider].fit !== 'scale' ? { width: ev((w * tl) / Math.max(w, h)), height: ev((h * tl) / Math.max(w, h)), capped: false }
        : vupOutputSize(provider, w, h, input.maxOutput, Number(input.scale) || 2);
      const oc = tl && VUP_MODELS[provider].fit === 'scale' && Math.max(o.width, o.height) > tl ? { width: ev((o.width * tl) / Math.max(o.width, o.height)), height: ev((o.height * tl) / Math.max(o.width, o.height)), capped: true } : o;
      input.outputSize = { width: oc.width, height: oc.height }; input.capped = oc.capped;
      if (!tl) vupSnapTarget(provider, input, w, h); } }
  return input;
}
/** 2026-10-28 (never refuse over our own size rule): a picked size that would not make the clip larger moves up to the next size this model makes,
 *  with a note. When the model makes nothing larger, a model that can run at the clip's own size does so (re-sharpened), with a note; a scale model
 *  below its minimum factor (FLUX Video Upscale 1.5×) keeps its reason, which names a model that can. Same rule on every quote and the submit. */
function vupSnapTarget(provider: string, input: Record<string, any>, w: number, h: number) {
  const m = VUP_MODELS[provider]; delete input.sameSize; delete input.adjustNote; const asked = String(input.maxOutput);
  if (!vupSizeIssue(provider, input, asked, null)) return;
  const have = Math.min(w, h); const askedShort = VUP_TARGET_SHORT[asked] ?? 0;
  for (const t of [...m.targets].filter((x) => (VUP_TARGET_SHORT[x] ?? 0) > askedShort).sort((a, b) => VUP_TARGET_SHORT[a] - VUP_TARGET_SHORT[b])) {
    const o = vupOutputSize(provider, w, h, t, Number(input.scale) || 2); const trial = { ...input, maxOutput: t, outputSize: { width: o.width, height: o.height } };
    if (vupSizeIssue(provider, trial, t, null)) continue;
    input.maxOutput = t; input.resolution = vupResolution(t); input.outputSize = trial.outputSize; input.capped = o.capped; input.targetAdjusted = { from: asked, to: t };
    input.adjustNote = `Your clip is already ${have}p, so it is upscaled to ${VUP_TARGET_LABEL[t]} instead of ${VUP_TARGET_LABEL[asked] ?? asked} (the next size ${m.name} makes).`;
    return;
  }
  if (m.fit === 'scale' && (VUP_MIN_FACTOR[provider] ?? 1) > 1) return; // can't run at its own size: vupBlock names a model that can
  input.sameSize = true; input.outputSize = { width: ev(w), height: ev(h) }; input.capped = false;
  input.adjustNote = `Your clip is already ${have}p, as large as ${m.name} makes: it is re-sharpened at the same size.`;
}
/** The factor a scale model is asked for: the output's long side over the source's (so the provider makes exactly the size we quoted), else the job's scale. */
export const vupFactor = (i: { outputSize?: { width: number; height: number } | null; inputSize?: { width: number; height: number } | null; scale?: unknown }) => {
  const o = i?.outputSize, s = i?.inputSize; if (o && s && s.width > 0 && s.height > 0) return Math.round((Math.max(o.width, o.height) / Math.max(s.width, s.height)) * 100) / 100;
  return Number(i?.scale) || 2; };
/** Smallest factor each scale model takes (FLUX Video Upscale 1.5–3; Crystal from 1). */
export const VUP_MIN_FACTOR: Record<string, number> = { 'direct-flux3-upscale': 1.5, 'router-crystal-video': 1 };
/** Local Real-ESRGAN / UltraSharp time grows with the SOURCE size (the model runs on every source frame): measured at 1024×576, scaled by pixels. */
export const VUP_MEASURED_SOURCE_PX = 1024 * 576;
export function vupSourceFactor(provider: string, i: { inputSize?: { width: number; height: number } | null }): number {
  const m = VUP_MODELS[provider]; const s = i?.inputSize; if (!m || m.place !== 'local' || m.cudaOnly || !s || !(s.width > 0 && s.height > 0)) return 1;
  return Math.round(Math.max(0.5, (s.width * s.height) / VUP_MEASURED_SOURCE_PX) * 100) / 100;
}
/** /api/tools tool.app.videoUpscale: everything the page needs to draw the model menu and size picker honestly. */
export const videoUpscaleInfo = () => ({ targets: [...VUP_TARGETS], targetLabels: VUP_TARGET_LABEL, defaultTarget: VUP_DEFAULT_TARGET, models: VUP_MODELS, order: VUP_ORDER, local: VUP_LOCAL,
  targetsByProvider: Object.fromEntries(VUP_ORDER.map((p) => [p, VUP_MODELS[p].targets])) });
