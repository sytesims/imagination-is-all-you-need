/**
 * ETA registry: GPU seconds per output second (per image for image tools), per GPU class and quality.
 * Every number is either `cited` (taken or directly derived from a published benchmark; URL in `src`) or an `estimate`
 * (no published benchmark found for that class/quality; `note` says how it was derived). No cross-GPU scaling factors.
 * Derivation rule for cited cells: reported wall time ÷ clip seconds (81 frames @16 fps = 5.06 s, 121 @24 = 5.04 s, 241 @24 = 10 s).
 * Engineering estimates, not verified benchmarks for every supported machine.
 */
import { VUP_MODELS, VUP_LOCAL } from './shared/videoUpscale.js';
type Cell = { s: number; cited: boolean; src?: string; note: string };
type Q = '480p' | '720p' | '1080p' | '448p' | '576p' | '1440p' | '2160p' | 'standard' | 'high'; // 1440p / 2160p: Video Upscale targets // 448p / 576p: LTX-2.5 22B local Draft / Sharper (Generate Video) // standard / high: the Audio tool's qualities (Qwen3 TTS)
type Anchor = Record<string, Partial<Record<Q, Cell>>>;
export const GPU_CLASSES = ['rtx4090', 'rtx5090', 'h100', 'mseries'] as const;

const c = (s: number, src: string, note: string): Cell => ({ s, cited: true, src, note });
const e = (s: number, note: string): Cell => ({ s, cited: false, note: 'ESTIMATE (no published benchmark found): ' + note });

const U = {
  chimolog: 'https://chimolog.co/bto-gpu-wan22-specs/',
  reddit4090: 'https://www.reddit.com/r/comfyui/comments/1r37x22/how_long_does_your_pc_take_to_render_a_480x480/',
  laptop5090: 'https://github.com/lifeidle/comfyui-5090-laptop-minimax-h3-wan2.2-nvfp4',
  wanH100: 'https://github.com/Wan-Video/Wan2.2/issues/39',
  m3max: 'https://www.reddit.com/r/comfyui/comments/1o7iyap/wan22_on_apple_silicon/',
  m1max: 'https://www.reddit.com/r/comfyui/comments/1pad4uh/anyone_here_using_a_mac_need_advice_on_running/',
  animate5090: 'https://huggingface.co/treksis/video-lab/blob/388af7f05d784c408d1a1b09e5c262514095f0cc/',
  apatero: 'https://apatero.com/blog/ai-video-generation-speed-benchmarks-2025',
  ltx5090: 'https://www.reddit.com/r/StableDiffusion/comments/1q74kev/',
  ltxReport: 'https://videos.ltx.io/LTX-2/grants/LTX_2_Technical_Report_compressed.pdf',
  wan22: 'https://github.com/Wan-Video/Wan2.2',
};

// Wan 2.2 A14B T2V/I2V, FP8 + Lightning/lightx2v 4-step LoRA, 81 frames.
const WAN_14B: Anchor = {
  rtx4090: { '480p': c(18, U.chimolog, '800×448, 81f, 2+2+4 steps ≈90 s'), '720p': c(35, U.reddit4090, '1280×720, 81f, default ComfyUI template fp8 + lightx2v 4-step, 177 s'), '1080p': e(79, '720p cited × 2.25 pixel ratio') },
  rtx5090: { '480p': c(19, U.laptop5090, '832×480, 81f, 4 steps ≈94 s (5090 laptop)'), '720p': c(35, U.chimolog, '720p 5 s "under 3 min" (desktop 5090)'), '1080p': e(80, '720p cited × 2.25 pixel ratio') },
  h100: { '480p': e(9, '720p derived × 0.44 pixel ratio'), '720p': c(21, U.wanH100, 'official 1041 s @1280×720 with 40 steps; ÷10 for the 4-step LoRA schedule (derived, step-linear)'), '1080p': e(47, '720p × 2.25 pixel ratio') },
  mseries: { '480p': c(356, U.m3max, 'M3 Max 36 GB, 640×480, 81f, GGUF + Lightning 4 steps ≈30 min'), '720p': c(2134, U.m1max, 'M1 Max 64 GB, near-720p 81f, 6-bit + 4 steps ≈3 h (Draw Things)'), '1080p': e(4800, '720p cited × 2.25; likely does not fit in memory') },
};
// Wan 2.2 Animate 14B: only the 5090 is benchmarked; other classes use the Wan 14B ratio vs 5090 at the same quality.
const animate = (q: Q, gpu: string, s5090: number) => gpu === 'rtx5090' ? c(s5090, U.animate5090, 'FP8 + 4-step LoRA, 5 s clip: 1.5–2 min @480p, 3–5 min @720p') : e(Math.round(s5090 * WAN_14B[gpu][q]!.s / WAN_14B.rtx5090[q]!.s), 'Wan 2.2 Animate 5090 figure × (this GPU ÷ 5090) for Wan 14B');
const WAN_ANIMATE: Anchor = Object.fromEntries(GPU_CLASSES.map((g) => [g, { '480p': animate('480p', g, 21), '720p': animate('720p', g, 48), '1080p': { ...animate('1080p', g, 100), cited: false, note: 'ESTIMATE: 720p × 2.1' } }]));
// Wan 2.1 VACE 14B: same 14B DiT; no VACE-specific benchmark anywhere -> all estimates borrowed from Wan 14B.
const WAN_VACE: Anchor = Object.fromEntries(GPU_CLASSES.map((g) => [g, Object.fromEntries((['480p', '720p', '1080p'] as Q[]).map((q) => [q, e(WAN_14B[g][q]!.s, 'Wan 2.2 14B figure applied to Wan 2.1 VACE 14B (same DiT size)')]))]));
// LTX-2 19B.
const LTX2: Anchor = {
  rtx4090: { '480p': c(9, U.apatero, '768×512, 121f, 30 steps, 47 s'), '720p': c(27, U.apatero, '1280×720, 121f, 50 steps, 2 m 15 s'), '1080p': e(61, '720p cited × 2.25') },
  rtx5090: { '480p': e(9, '720p cited × 0.44'), '720p': c(21, U.ltx5090, 'FP8 dev 1280×720, 241f, 20 steps ≈210 s'), '1080p': e(47, '720p cited × 2.25') },
  h100: { '480p': e(2, '720p derived × 0.44'), '720p': c(5, U.ltxReport, 'tech report Table 1: 1.22 s/step @720p 121f; × 20 steps = 24 s (derived)'), '1080p': e(11, '720p × 2.25') },
  mseries: { '480p': e(171, 'no LTX-2 Apple benchmark; Wan 480p M-series/5090 ratio (356/19 ≈ 19×) × LTX-2 5090 480p'), '720p': e(399, 'same 19× ratio × LTX-2 5090 720p'), '1080p': e(893, 'same 19× ratio') },
};
// Wan 2.2 TI2V 5B (Generate Video, local route comfy-wan22-5b; 24 fps, 20 steps). Its 704p tier is filed under '720p' (requirements.ts falls back to 720p).
// The Mac cells are first estimates for the ETA to start from; the app replaces them with this computer's own timed runs (etaLearn / stepEta).
const WAN_5B: Anchor = {
  rtx4090: { '480p': e(48, '720p cited × 0.44 pixel ratio'), '720p': c(108, U.wan22, 'README: TI2V-5B makes a 5 s 720P clip in under 9 minutes on one consumer GPU (4090 class); 540 s ÷ 5 s') },
  rtx5090: { '480p': e(34, '4090 480p × 0.7'), '720p': e(76, '4090 720p cited × 0.7') },
  h100: { '480p': e(20, '720p × 0.44'), '720p': e(45, 'about 2.4× a 4090 (Wan 14B h100/4090 cells)') },
  mseries: { '480p': e(120, '704p estimate × 0.44 pixel ratio'), '720p': e(300, 'research brief 2026-10-24: M1 Max 64 GB, 5B at ~704p, 2 s ≈ 9 min (270 s per output second), 5 s 30+ min (360); midpoint') },
};
// Render (Direct a Shot step 3, provider comfy-ltx25-layout): LTX-2.5 22B distilled GGUF Q4_K_M + Layout to Render, 8 + 3 steps, the layout guide doubles the tokens.
// Filed under '720p' = the Standard draft (1024×576, stage 1 at 512×288). Mac only: a first estimate (shared/makeItReal.ts makeRealEtaSeconds), replaced by this computer's timed runs.
const LTX25_LAYOUT: Anchor = {
  mseries: { '480p': e(228, 'our own measured run (2026-10-25): Draft 768×448, 5 s ≈ 19 min on an M1 Max ≈ 228 s per output second'), '720p': e(390, 'Sharper 1024×576: the Draft run × (pixel ratio 1.71)^1.12 (shared/makeItReal.ts makeRealEtaSeconds) ≈ 390 s per output second') },
};
// LTX-2.5 22B on Generate Video (provider comfy-ltx25-video): distilled GGUF Q4_K_M, 8 + 3 steps, two stages. Cells keyed by the job's resolution value
// (448p = Draft 768×448, 576p = Sharper 1024×576). Mac only, first estimates replaced by this computer's timed runs (stepEta).
const LTX25_VIDEO: Anchor = {
  mseries: { '448p': e(228, 'one 5 s Draft clip took about 19 min on an M1 Max (main session, 2026-10-25; incl. loading): 1140 s ÷ 5 s'), '576p': e(425, 'Draft × (1.71 pixel ratio)^1.15, the same scaling as shared/makeItReal.ts makeRealEtaSeconds') },
};
// Footage Effects (provider comfy-ltx25-iclora): the shared IC-LoRA video-to-video base, the same token count as Layout to Render (guide = 2× tokens).
// Keyed by the job's resolution (448p = Draft 768×448, 576p = Sharper 1024×576). Mac only; first estimates, replaced by this computer's timed runs.
const LTX25_ICLORA: Anchor = {
  mseries: { '448p': e(240, 'our LTX-2.5 runs on an M1 Max: a 2 s Draft ≈ 8 min (≈ 240 s per output second), a 5 s Draft ≈ 19 min (shared/footageFx.ts footageFxEtaSeconds)'), '576p': e(430, 'Draft × (1.71 pixel ratio)^1.12, the same scaling as shared/footageFx.ts') },
};

// Qwen3 TTS 1.7B (provider comfy-qwen3tts, 2026-10-27): seconds of work per second of speech. Mac: one free run on an M1 Max, a 6.5 s line in 66 s
// including the first model load (≈10 s per second). NVIDIA: estimates until this computer's own timed runs replace them. The voice tool's job keys
// its quality as 480p/720p/1080p (the clip's, unused for a voice line) and the Audio tool as standard/high: the same figure for each.
const QWEN3_TTS_CELLS = (s: number, note: string) => Object.fromEntries(['480p', '720p', '1080p', 'standard', 'high'].map((q) => [q, e(s, note)]));
const QWEN3_TTS: Anchor = {
  mseries: QWEN3_TTS_CELLS(10, 'our free run on an M1 Max 64 GB (main session, 2026-10-27): 6.5 s of speech in 66 s incl. the first load'),
  rtx4090: QWEN3_TTS_CELLS(1.5, 'no benchmark: a 1.7B autoregressive TTS on CUDA, assumed a little slower than real time with sdpa'),
  rtx5090: QWEN3_TTS_CELLS(1.2, 'no benchmark: the 4090 figure × 0.8'),
};
const BY_TOOL: Record<string, Anchor> = {
  'object-swap': WAN_ANIMATE, 'motion-transfer': WAN_ANIMATE, restyle: WAN_VACE, 'app-anime-restyle': WAN_VACE,
  reshoot: LTX2, cinema: LTX2, 'app-orbit-shot': LTX2, camera: WAN_14B, 'photo-fx': WAN_14B,
};
export const ETA_ANCHORS = { WAN_14B, WAN_ANIMATE, WAN_VACE, LTX2, WAN_5B, LTX25_LAYOUT, LTX25_VIDEO, LTX25_ICLORA };

/** Camera Moves runs two graph families: Wan 2.2 Fun Camera (WAN_14B) and the LTX-2 camera-LoRA presets (camera-ltx-api.json: local or cloud-ltx-camera) → LTX2. */
const BY_PRESET_GROUP: Record<string, Anchor> = { 'LTX camera': LTX2 };
const BY_PROVIDER: Record<string, Anchor> = { 'comfy-qwen3tts': QWEN3_TTS, 'cloud-ltx-camera': LTX2, 'comfy-wan22-5b': WAN_5B, 'comfy-ltx25-layout': LTX25_LAYOUT, 'comfy-ltx25-video': LTX25_VIDEO, 'comfy-ltx25-extend': LTX25_VIDEO /* Extend: the same ladder, per added second (+0.375 s of guide frames) */, 'comfy-ltx25-lipsync': LTX25_VIDEO /* Talking photo: same ladder and pixel count (Draft portrait 448×768); no audio decode (PLAN-2 step 9) */, 'comfy-ltx25-iclora': LTX25_ICLORA };
// Video Upscale (shared/videoUpscale.ts speed cells): seconds per clip second by target. Mac cells from our own M1 Max runs (Real-ESRGAN x2 53, 4x-UltraSharp 157
// at 1080p, measured 2026-10-26); NVIDIA cells are estimates until this computer's own timed runs replace them. A cell from a real run counts as cited.
const vupAnchor = (id: string): Anchor => Object.fromEntries(Object.entries(VUP_MODELS[id]?.speed ?? {}).map(([g, qs]) => [g, Object.fromEntries(Object.entries(qs ?? {}).map(([q, x]) => [q, x.measured ? c(x.s, 'local run (main session, 2026-10-26)', x.note) : e(x.s, x.note)]))]));
for (const id of VUP_LOCAL) BY_PROVIDER[id] = vupAnchor(id);
/** Anchor narrowed by provider or preset group when given (camera LTX presets → LTX2, not WAN_14B). */
export function etaFor(t: { id: string; gpuSecPerSec?: Record<string, number> }, ctx: { providerId?: string; presetGroup?: string } = {}) {
  const a = (ctx.providerId && BY_PROVIDER[ctx.providerId]) || (ctx.presetGroup && BY_PRESET_GROUP[ctx.presetGroup]) || BY_TOOL[t.id];
  const cells: Anchor = a ?? Object.fromEntries(GPU_CLASSES.map((g) => [g, Object.fromEntries(Object.entries(t.gpuSecPerSec ?? {}).map(([q, s]) => [q, g === 'rtx5090' ? e(s, 'tool gpuSecPerSec planning figure (5090)') : { s: 0, cited: false, note: 'no benchmark and no estimate for this GPU class' }]))]));
  const byGpu = Object.fromEntries(Object.entries(cells).map(([g, qs]) => [g, Object.fromEntries(Object.entries(qs).filter(([, x]) => x!.s > 0).map(([q, x]) => [q, x!.s]))]));
  const anyCited = Object.values(cells).some((qs) => Object.values(qs).some((x) => x!.cited));
  return {
    eta: { estimate: !anyCited, unit: 'gpu seconds per output second (per image for image tools)', byGpu },
    etaSource: { cited: anyCited, cells, gpuScaling: 'None: each GPU class/quality cell is cited separately or labelled ESTIMATE.' },
  };
}
