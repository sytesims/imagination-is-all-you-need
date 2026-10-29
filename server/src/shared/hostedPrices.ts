/**
 * Official hosted-provider prices (PRICING OVERRIDE, 2026-10-16). Isomorphic: no imports (web imports it via pricing.ts).
 * Rule: 1 Imagination Is All You Need credit = $0.01, no markup. Open-weights / local runs always cost 0 (not in this table).
 * Comfy partner-node prices are published in Comfy credits; Comfy's rate is 211 credits = $1
 * (https://support.comfy.org/articles/1982697177-partner-nodes-pricing), so usd = comfyCredits / 211.
 * estimated:true = the page has no exact per-unit figure for how we call it (token billing, "~" approximations,
 * node/model mapping not 1:1); `note` says why. usd:null = no price could be verified: the run goes ahead on `estimateUsd` (user decision
 * 2026-10-28, D1: "About $X (estimate)" before Generate, the real cost recorded after), else on the row's dearest known rate.
 */
export type HostedUnit = 'second' | 'minute' | 'image' | 'run' | '1k_chars' | '1k_bytes' | 'mp_second' | 'megapixel';
/** Plain display text per billing unit (the raw `unit` stays the machine value). unitLabel = "per …"; one / many = the quantity noun; unitHelp = what is counted. */
export const UNIT_LABELS: Record<HostedUnit, { unitLabel: string; one: string; many: string; unitHelp: string }> = {
  second: { unitLabel: 'per second', one: 'second', many: 'seconds', unitHelp: 'Seconds of output video or audio.' },
  minute: { unitLabel: 'per minute', one: 'minute', many: 'minutes', unitHelp: 'Minutes of output audio.' },
  image: { unitLabel: 'per image', one: 'image', many: 'images', unitHelp: 'Each output image.' },
  run: { unitLabel: 'per run', one: 'run', many: 'runs', unitHelp: 'One flat price per generation.' },
  '1k_chars': { unitLabel: 'per 1,000 characters', one: 'thousand characters', many: 'thousand characters', unitHelp: 'Characters of script text, billed per 1,000.' },
  '1k_bytes': { unitLabel: 'per 1,000 bytes of text', one: 'thousand bytes of text', many: 'thousand bytes of text', unitHelp: 'Script text measured in UTF-8 bytes, billed per 1,000 (plain English letters are 1 byte each; accented and non-Latin characters take 2–4).' },
  megapixel: { unitLabel: 'per output megapixel', one: 'output megapixel', many: 'output megapixels', unitHelp: 'Size of the output image in megapixels (e.g. 4096 × 4096 is about 16.8 MP). Rows with a block size bill per started block.' },
  mp_second: { unitLabel: 'per megapixel-second', one: 'megapixel-second', many: 'megapixel-seconds', unitHelp: 'Output frame size in megapixels × clip seconds (e.g. a 4K frame is about 8.3 MP, so 10 s of 4K is about 83 megapixel-seconds).' },
};
export const unitInfo = (u: string) => UNIT_LABELS[u as HostedUnit] ?? { unitLabel: `per ${u}`, one: u, many: u, unitHelp: '' };
export const unitQty = (u: string, n: number) => { const i = unitInfo(u); return `${n} ${n === 1 ? i.one : i.many}`; };
/** Image to layers: the most images one run can return (the base + 16 layers) and the note shown with its '≈ up to' quote. */
export const LAYERS_MAX_OUT = 17;
export const LAYERS_UP_TO = 'billed per layer returned (up to 16 layers + the base); most photos give 5–13';
export interface HostedPrice {
  providerId: string; model: string; unit: HostedUnit;
  /** USD per unit (default rate). */
  usd: number | null;
  /** The bill follows the real output and can be lower: the quote is the worst case, shown as '≈ up to $X' (this text is the note). */
  upTo?: string;
  /** unit megapixel: billed per STARTED block of this many output megapixels (Topaz on fal: "$0.08 per started 8 megapixels"). */
  mpBlock?: number;
  /** USD per unit by our quality id (480p/720p/1080p) when the provider prices by resolution. */
  usdByQuality?: Record<string, number>;
  /** Rate per (input video s + output s) when a reference video is connected (token-billed: Seedance). */
  videoInput?: { usd: number; usdByQuality: Record<string, number>; note: string };
  /** Reference-video seconds billed at the row's own per-second rate on top of the output (MiniMax H3): billed s = whole seconds of
   *  min(reference total, maxTotal), rounded UP (each clip is at least minEach s: the form and the route refuse shorter ones). */
  refVideoAtRate?: { minEach: number; maxTotal: number; sourceUrl: string; checkedAt: string; note: string };
  /** Same model with generated audio on (when the provider prices it separately). Used when the job asks for audio. */
  audio?: { model: string; usd: number; usdByQuality?: Record<string, number>; sourceUrl: string; checkedAt: string; note?: string };
  /** USD per unit by mode id (e.g. FLUX 3 Upscaler precise / creative, unit mp_second = output megapixels × seconds). */
  usdByMode?: Record<string, number>;
  /** Create Image: USD per image by output resolution (1K/2K/4K), when the provider publishes it. */
  usdByResolution?: Partial<Record<'0.75K' | '1K' | '1.5K' | '2K' | '4K', number>>;
  /** Create Image: USD per image by quality tier (low/med/high); null = tier exists but no published price. */
  usdByTier?: Partial<Record<'low' | 'med' | 'high', number | null>>;
  /** Create Image: USD per image keyed `${tier}:${res}` when both matter. */
  usdByTierRes?: Record<string, number>;
  /** Vendor's own list price for the model when our route bills differently (reference only, never used to charge). */
  officialModelPrice?: { vendor: string; model: string; unit: string; usdByTierSize: Record<string, number>; sourceUrl: string; checkedAt: string; appliesToOurRoute: boolean };
  /** Per-reference-image surcharge per output (one Router request each): max(0, refs sent − free) × rate. refs = the reference images the
   *  job's Router body really sends (routing/routerModels.ts refsSent). usdByResolution: Create Image rate by output resolution. */
  refImages?: { usd: number; usdByResolution?: Partial<Record<'1K' | '2K' | '4K', number>>; free: number; sourceUrl: string; checkedAt: string; estimated: boolean; note: string };
  /** Source + date for the tier/resolution figures. */
  detailSourceUrl?: string; detailCheckedAt?: string; detailNote?: string;
  /** unit second, speech models that take no length (Seed Audio): the billed seconds are estimated from the script, slow on purpose (an "up to"
   *  figure), capped at the provider's billing cap. CJK characters (Chinese / Japanese / Korean) are counted from UTF-8 bytes (3 bytes each). */
  speech?: { charsPerSec: number; cjkCharsPerSec: number; minSec: number; maxSec: number; note: string;
    /** Modes whose prompt describes a sound rather than a script read aloud (Seed Audio music / sound effects): quoted at maxSec. Every other mode is estimated from the script. */ capModes?: string[];
    /** The note for those other modes. */ capNote?: string };
  /** unit second / minute: the provider's longest output; the quote counts min(picked length, maxSec) (the body sends the same clamp). */
  maxSec?: number;
  /** Comfy Cloud workflow rows: the price is a placeholder until a measured run (Comfy bills GPU-seconds incl. model load), so real runs stay off. */
  priceUnmeasured?: boolean;
  /** usd:null rows (no published price): the per-unit USD the run is quoted at as an estimate (D1, 2026-10-28), with why in `estimateNote`. */
  estimateUsd?: number; estimateNote?: string;
  sourceUrl: string; checkedAt: '2026-10-16' | '2026-10-17' | '2026-10-21' | '2026-10-22' | '2026-10-23' | '2026-10-24' | '2026-10-25' | '2026-10-26' | '2026-10-27' | '2026-10-28'; estimated: boolean; note?: string;
  /** GPT Image (2026-10-24): priced per job by gptImageQuote (the exact size from the aspect, the prompt length); usdByTierRes = no shape or prompt known. */
  tokenImage?: { family: 'gpt-image-2' | 'gpt-image-2.5' | 'gpt-image-1.5' };
  /** FLUX.2 on Comfy Router (2026-10-24): priced per job on the exact size the body sends for the shape (shared/hostedAspects.ts flux2Size):
   *  first Comfy credits for the first started megapixel + extra per further started megapixel (converted like every row, after the sum). usdByResolution = the square (the largest size). */
  mpImage?: { first: number; extra: number };
  /** Round credits UP. Kept for the GPT rows; since 2026-10-24 every hosted row rounds up (usdToCredits, one rule), so this is informational. */
  roundUp?: boolean;
}
import { GPT_IMAGE_ASPECTS, GPT15_ASPECTS, gptImageSize, gpt15ImageSize, gptWH, type GptRes } from './gptImageSizes.js';
import { flux2Size, flux2StartedMp } from './hostedAspects.js';
export const USD_PER_CREDIT = 0.01;
/** THE rounding of a hosted price to app credits (1 credit = $0.01), used by every quote, menu price and count total: rounded UP per request
 *  (after a 1e-6 tidy, so 4.0000000001 stays 4), so a quote is never below the real cost. A count multiplies this per-request figure. */
export const usdToCredits = (usd: number) => Math.ceil(Math.round((usd / USD_PER_CREDIT) * 1e6) / 1e6);
export const COMFY_CREDITS_PER_USD = 211;
const C = 'https://docs.comfy.org/tutorials/partner-nodes/pricing';
/** Comfy Router pricing page (credits per Router model id; same 211 credits = $1). */
const CR = 'https://docs.comfy.org/development/comfy-router/pricing';
const d22 = '2026-10-22' as const;
const d24 = '2026-10-24' as const;
/** Your Comfy deployment (comfy.org/pricing, read 2026-10-26): per worker-hour, billed per second incl. startup + model load + ~30 s idle. */
export const DEPLOY_GPU_USD_PER_HOUR = { 'rtx-pro-6000-96gb': 3.49, 'h100-80gb': 6.23, 'h200-141gb': 7.71, 'b200-180gb': 11.23 } as const;
export const DEPLOY_PRICE_URL = 'https://www.comfy.org/pricing';
/** USD for `seconds` of one worker on `gpu` (default RTX PRO 6000 96 GB), rounded up to the cent. */
/** Comfy Cloud workflow jobs: USD for `gpuSeconds` of active GPU time at 0.39 credits per GPU-second (211 credits = $1), rounded up to the cent. */
export const cloudGpuUsd = (gpuSeconds: number) => Math.ceil((0.39 * gpuSeconds / 211) * 1000) / 1000;
/** LTX-2.5 DFR on Comfy Cloud (2026-10-29, shared/ltxDfr.ts price keys): NOT measured, an estimate scaled from the 720p rate by the work per stage
 *  (latent size × steps). 720p today = 8 steps at quarter area + 3 at full ≈ 5 full-size step units. DFR: stage 1 = 8 × ¼ area with one generated
 *  keyframe per second (+⅓ latent frames) ≈ 2.7; stage 2 = 3 at full area + the half-size reference (+¼) + keyframes (+⅓) ≈ 4.75 → 1.5× the 720p
 *  work without the 48 fps pass; stage 3 = 4 steps on twice the frames with the keyframe guides (≈ +½) ≈ 12 → ≈ 3.9× with it. Plus a bigger text
 *  encoder (bf16 Gemma, 26 GB) and two more model files to load. So 24 / 60 GPU-seconds per rendered second (720p: 15), keeping the 720p row's margin. */
export const LTX_DFR_USD = { dfr: cloudGpuUsd(60), 'dfr-24': cloudGpuUsd(24) } as const;
export const LTX_DFR_NOTE = 'DFR (not measured yet, an estimate): 60 GPU-seconds per second with Smooth motion (48 fps, three stages), 24 without (two stages), from the work per stage against the 720p rate (shared/hostedPrices.ts LTX_DFR_USD).';
export const deployUsd = (seconds: number, gpu: keyof typeof DEPLOY_GPU_USD_PER_HOUR = 'rtx-pro-6000-96gb') => Math.ceil((DEPLOY_GPU_USD_PER_HOUR[gpu] * seconds / 3600) * 100) / 100;
const c = (comfyCredits: number) => Math.round((comfyCredits / COMFY_CREDITS_PER_USD) * 1e5) / 1e5;
const d = '2026-10-16' as const;
const d0 = d;
/** OpenAI's published image-output token formula (the calculator on developers.openai.com/api/docs/guides/image-generation, read 2026-10-22):
 *  base per quality (gpt-image-2: low 16 / medium 48 / high 96; gpt-image-2.5: low 16 / medium 24 / high 48 / xhigh 64 / max 96), scaled by the aspect,
 *  tokens = ceil(base_long × base_short × (2e6 + W×H) / 4e6). 1024² low on 2.5 = 196 tokens (the page's own example). */
export const GPT_IMAGE_BASE: Record<string, Record<string, number>> = { 'gpt-image-2': { low: 16, medium: 48, high: 96 }, 'gpt-image-2.5': { low: 16, medium: 24, high: 48, xhigh: 64, max: 96 } };
/** GPT Image 1.5 (2026-10-25): no formula, a fixed table per size, the one OpenAI publishes for gpt-image-1 (image guide, "Cost and latency": low 272 /
 *  408 / 400, medium 1,056 / 1,584 / 1,568, high 4,160 / 6,240 / 6,208 output tokens for 1024x1024 / 1024x1536 / 1536x1024). gpt-image-1.5's per-image list
 *  prices at $32 / 1M output tokens ($0.009 / $0.013 / $0.013 low … $0.133 / $0.20 / $0.20 high) are the same token counts, so the table is reused (estimated). */
export const GPT15_TOKENS: Record<string, Record<string, number>> = {
  low: { '1024x1024': 272, '1024x1536': 408, '1536x1024': 400 }, medium: { '1024x1024': 1056, '1024x1536': 1584, '1536x1024': 1568 }, high: { '1024x1024': 4160, '1024x1536': 6240, '1536x1024': 6208 } };
export function gptImageTokens(model: GptFamily, quality: string, w: number, h: number): number {
  if (model === 'gpt-image-1.5') { const t = GPT15_TOKENS[quality]?.[`${w}x${h}`]; if (t === undefined) throw new Error(`unsupported size ${w}x${h} / quality ${quality} for gpt-image-1.5`); return t; }
  const o = GPT_IMAGE_BASE[model][quality]; if (o === undefined) throw new Error(`unsupported quality ${quality} for ${model}`);
  const s = o / (Math.max(w, h) / Math.min(w, h)); const l = Math.floor(s); const u = s - l === 0.5 ? l + (l % 2) : Math.round(s);
  return Math.ceil(((w >= h ? o : u) * (w >= h ? u : o) * (2e6 + w * h)) / 4e6);
}
/** GPT Image quote (2026-10-24), Comfy Router, one request per image. Why the old quote was low: it counted image-output tokens only, at 1024².
 *  The bill also has prompt text (text-input rate) and a remainder we can't attribute: a real run (2.5 Flare, 1K 1:1 medium, ~1,500-char prompt)
 *  was charged $0.0258 = 5.44 Comfy credits; image output (~443 tokens: OpenAI's formula + 4, as published measured runs show) is 4.01 and
 *  ~400 prompt tokens 0.60, so ~0.8 credits (~18%) is unexplained (Comfy's Router page lists a text-OUTPUT rate for 2.5, 3017.3 / 1M: likely
 *  text the model writes). So per image, in Comfy credits:
 *    base  = (output tokens of the exact size + 8) × image-output rate + (100 + prompt bytes ÷ 2.5) × text-input rate
 *    quote = max(base × 1.2, base + 1.0)     (covers the remainder whether it is a share of the bill or a flat amount per call)
 *  then rounded UP to whole credits (roundUp). Prompt bytes are counted in steps of 500 (promptBucket). A quote with no prompt (the menu, an API
 *  quote without prompt / promptBytes) counts a short one (500); the bar sends its prompt's length and the submit counts the real prompt.
 *  Rates: gpt-image-2 input 2025.6, image output 7,600 / 1M (partner-node page C); gpt-image-2.5 flare / sunburst text input 1508.65, image input
 *  2413.84, image output 9051.9 / 1M (Router page CR and C). */
export type GptFamily = 'gpt-image-2' | 'gpt-image-2.5' | 'gpt-image-1.5';
/** gpt-image-1.5 (Router pricing page CR, Comfy token rates, read 2026-10-25): input text 1055 / image 1688, output image 6752 per 1M tokens. */
export const GPT_COMFY_RATES: Record<GptFamily, { textIn: number; imageIn: number; imageOut: number }> = {
  'gpt-image-2': { textIn: 2025.6, imageIn: 2025.6, imageOut: 7600 }, 'gpt-image-2.5': { textIn: 1508.65, imageIn: 2413.84, imageOut: 9051.9 }, 'gpt-image-1.5': { textIn: 1055, imageIn: 1688, imageOut: 6752 } };
export const GPT_QUOTE = { outTokenPad: 8, promptOverheadTokens: 100, bytesPerToken: 2.5, promptStep: 500, defaultPromptBytes: 500, margin: 1.2, perCallAllowance: 1.0 } as const;
/** Prompt bytes as the quote counts them: whole steps of 500 (so the bar requotes rarely), at least 500; unknown = 500. */
export const promptBucket = (bytes?: number | null) => { const b = bytes == null || !Number.isFinite(Number(bytes)) ? GPT_QUOTE.defaultPromptBytes : Math.max(0, Number(bytes));
  return Math.max(GPT_QUOTE.promptStep, Math.ceil(b / GPT_QUOTE.promptStep) * GPT_QUOTE.promptStep); };
/** UTF-8 bytes of a prompt (the same count on the server and in the browser). */
export const promptBytesOf = (s: unknown) => (typeof s === 'string' ? new TextEncoder().encode(s).length : 0);
/** One GPT Image output on Comfy Router: tokens and Comfy credits (see above). aspect unknown / not offered = the costliest shape at that size. */
export function gptImageQuote(family: GptFamily, tier: string | null | undefined, res: string | null | undefined, aspect?: string | null, promptBytes?: number | null) {
  const q = tier === 'low' ? 'low' : tier === 'high' ? 'high' : 'medium'; const r = (['1K', '2K', '4K'].includes(String(res)) ? res : '1K') as GptRes;
  const v15 = family === 'gpt-image-1.5'; /* 1.5: its three 1K sizes only (shared/gptImageSizes.ts GPT15_*) */
  const one = v15 ? gpt15ImageSize(aspect, '1K') : gptImageSize(aspect, r); const sizes = one ? [one] : v15 ? GPT15_ASPECTS.map((a) => gpt15ImageSize(a, '1K')!) : GPT_IMAGE_ASPECTS.map((a) => gptImageSize(a, r)!);
  const outTokens = Math.max(...sizes.map((s) => { const { width, height } = gptWH(s); return gptImageTokens(family, q, width, height); })) + GPT_QUOTE.outTokenPad;
  const textTokens = GPT_QUOTE.promptOverheadTokens + Math.ceil(promptBucket(promptBytes) / GPT_QUOTE.bytesPerToken); const R = GPT_COMFY_RATES[family];
  const base = (outTokens * R.imageOut + textTokens * R.textIn) / 1e6; const credits = Math.max(base * GPT_QUOTE.margin, base + GPT_QUOTE.perCallAllowance);
  return { size: one, outTokens, textTokens, baseComfyCredits: base, comfyCredits: credits, usd: credits / COMFY_CREDITS_PER_USD };
}
/** USD per image as the table stores it (5 decimals, rounded up so it never sits below the quote). */
export const gptImageUsd = (family: GptFamily, tier: string | null | undefined, res: string | null | undefined, aspect?: string | null, promptBytes?: number | null) =>
  Math.ceil(gptImageQuote(family, tier, res, aspect, promptBytes).usd * 1e5) / 1e5;
/** tier × size → USD with no prompt or shape known (the menu's per-image figure): the costliest shape, a short prompt. */
const gptTierRes = (family: GptFamily) => Object.fromEntries((['low', 'med', 'high'] as const).flatMap((t) => (family === 'gpt-image-1.5' ? ['1K'] as const : ['1K', '2K', '4K'] as const).map((r) => [`${t}:${r}`, gptImageUsd(family, t, r)])));
/** Input tokens per 1024² reference image assumed (no published figure): Comfy's gpt-image-2 example, 2.47 credits at 2025.6 / 1M (~1,219 tokens),
 *  × 1.2 like the image quote (a published measured 2.5 edit added ~995 input tokens; WaveSpeed's 2.5 edit rows add ~1,310). */
const GPT_REF_TOKENS = Math.round((2.47 / 2025.6) * 1e6 * GPT_QUOTE.margin);
const GPT_GUIDE = 'https://developers.openai.com/api/docs/guides/image-generation#calculating-costs';
/** A GPT Image row on Comfy Router: priced per job by gptImageQuote (priceOf, tokenImage), rounded up; usdByTierRes = no shape / prompt known. */
const gptEntry = (providerId: string, model: string, family: GptFamily): HostedPrice => { const t = gptTierRes(family); const R = GPT_COMFY_RATES[family];
  return { providerId, model, unit: 'image', usd: t['med:1K'], usdByTierRes: t, tokenImage: { family }, roundUp: true, sourceUrl: CR, checkedAt: d24, estimated: true,
    note: `Token-billed (≈): image output ${R.imageOut} and prompt text ${R.textIn} Comfy credits / 1M tokens. Per image = (output tokens for the exact size + 8) and (100 + prompt bytes ÷ 2.5) text tokens at those rates, then the larger of × 1.2 and + 1 credit (a real 2.5 Flare run was billed ~18% above image + prompt tokens), rounded up. The Router's estimate is checked before each run.`,
    detailSourceUrl: GPT_GUIDE, detailCheckedAt: d24,
    detailNote: family === 'gpt-image-1.5' ? `Output tokens from OpenAI's fixed table (gpt-image-1 / 1.5; 1024²: ${(['low', 'medium', 'high'] as const).map((q) => gptImageTokens(family, q, 1024, 1024)).join(' / ')} tokens). Sizes: 1024x1024, 1024x1536, 1536x1024 only.`
      : `Output tokens from OpenAI's formula (${family} base low / medium / high ${family === 'gpt-image-2' ? '16 / 48 / 96' : '16 / 24 / 48'}; 1024²: ${(['low', 'medium', 'high'] as const).map((q) => gptImageTokens(family, q, 1024, 1024)).join(' / ')} tokens). Sizes: shared/gptImageSizes.ts. xhigh / max${family === 'gpt-image-2' ? ' do not exist on gpt-image-2' : ' exist on 2.5 but are not offered'}.` }; };
/** Nano Banana (Gemini image) on Comfy Router bills three token kinds per image (Router pricing page, CR, read 2026-10-24): image output, text /
 *  reasoning output (the model's thinking: Gemini 3 image models always think, and Google bills it at the text rate) and input (prompt + refs).
 *  The image tokens alone under-quoted real runs: Nano Banana 2.1 at 1K, 1 image, no refs was quoted 10.14 credits ($0.048) and charged
 *  ≈12.07 ($0.0572) and ≈13.3 ($0.063); the 1.9–3.2 credits on top are thinking (≈700–1,300 tokens at 2,262.975 / 1M) plus the prompt.
 *  So every Nano Banana quote adds a per-image allowance: up to 2,000 thinking / text tokens and 2,500 input tokens (a 10,000-character prompt,
 *  our limit) at the model's own rates, plus ~1,120 input tokens per reference image (Gemini 3's default high media resolution). The quote is
 *  then an honest ceiling for a normal run: the charge stays at or under it. */
export const NB_THINK_TOKENS = 2000; export const NB_PROMPT_TOKENS = 2500; export const NB_REF_TOKENS = 1120;
/** Comfy Router token rates per 1M (credits), serving provider Comfy (CR). */
export const NB_ROUTER_RATES = {
  'api-nano-banana-21': { input: 452.595, text: 2262.975, image: 9051.9 }, // vertexai/gemini-nano-banana-2.1
  'api-nano-banana': { input: 126.6, text: 759.6, image: 15192 }, // vertexai/gemini-3.1-flash-image
  'api-nano-banana-pro': { input: 506.4, text: 3038.4, image: 30384 }, // vertexai/gemini-3-pro-image
  'comfy-router:direct-gemini-nb2-lite': { input: 63.3, text: 379.8, image: 7596 }, // vertexai/gemini-3.1-flash-lite-image (Nano Banana 2 Lite on Comfy Router, read 2026-10-25)
} as const;
/** Credits per image: image tokens × image rate + the thinking and prompt allowance. */
export const nbCredits = (id: keyof typeof NB_ROUTER_RATES, imageTokens: number) => { const r = NB_ROUTER_RATES[id];
  return (imageTokens * r.image + NB_THINK_TOKENS * r.text + NB_PROMPT_TOKENS * r.input) / 1e6; };
const nbRow = (id: keyof typeof NB_ROUTER_RATES, tok: { '1K': number; '2K'?: number; '4K'?: number }) => ({ usd: c(nbCredits(id, tok['1K'])),
  usdByResolution: Object.fromEntries((['1K', '2K', '4K'] as const).filter((r) => tok[r] != null).map((r) => [r, c(nbCredits(id, tok[r]!))])) as Partial<Record<'1K' | '2K' | '4K', number>> });
const NB_ALLOWANCE = `Each image adds an allowance of ${NB_THINK_TOKENS.toLocaleString('en-US')} thinking / text tokens and ${NB_PROMPT_TOKENS.toLocaleString('en-US')} prompt tokens at the model's own rates (real Nano Banana 2.1 runs were charged 1.9–3.2 credits above the image tokens).`;
const nbRefs = (id: keyof typeof NB_ROUTER_RATES, note: string) => ({ usd: c(NB_REF_TOKENS * NB_ROUTER_RATES[id].input / 1e6), free: 0, sourceUrl: CR, checkedAt: d22, estimated: true, note });
/** FLUX.2 [pro] / [max] (partner-node page: first MP + per extra MP). Counted as STARTED megapixels of the real output at 10^6 px (2048² = 4.19 MP → 5;
 *  BFL does not publish its rounding): each resolution is quoted at its largest output, the square (1K 1024² → 2 MP, 2K and 4K-sent-as-2K 2048² → 5 MP).
 *  Reference images: input megapixels are billed too (Comfy's node page: the cost depends on the reference images); each is quoted at up to 4 MP. */
const FLUX2_MP = { '1K': Math.ceil((1024 * 1024) / 1e6), '2K': Math.ceil((2048 * 2048) / 1e6) } as const;
const FLUX2_MP_NOTE = 'priced on the exact size sent for the shape (shared/hostedAspects.ts flux2Size): 1K ≈ 1024² = 2 started MP for every shape; 2K 2048² = 5 for the square, fewer for long shapes (capped at 2048 px a side); the megapixel rounding is not published';
const flux2Usd = (first: number, extra: number, mp: number) => c(first + (mp - 1) * extra);
/** USD for one FLUX.2 image at this shape and resolution (the size the Router body sends); no shape = the square (the largest). */
export const mpImageUsd = (m: { first: number; extra: number }, aspect: string | null, res: string) => flux2Usd(m.first, m.extra, flux2StartedMp(flux2Size(aspect && aspect !== 'auto' ? aspect : '1:1', res)));
const flux2Row = (first: number, extra: number) => ({ usd: flux2Usd(first, extra, FLUX2_MP['1K']), mpImage: { first, extra },
  usdByResolution: { '1K': flux2Usd(first, extra, FLUX2_MP['1K']), '2K': flux2Usd(first, extra, FLUX2_MP['2K']), '4K': flux2Usd(first, extra, FLUX2_MP['2K']) } });
const flux2Refs = (extra: number) => ({ usd: c(4 * extra), free: 0, sourceUrl: 'https://docs.comfy.org/built-in-nodes/Flux2ImageNode', checkedAt: d24, estimated: true,
  note: `Input megapixels are billed too (BFL); each reference is quoted at up to 4 MP × ${extra} credits. Not confirmed on Comfy's pages.` });
export const HOSTED_PRICES: HostedPrice[] = [
  // ---- video (Comfy API Router / partner nodes) ----
  // Kling 3.0 Omni on every Generate Video mode (2026-10-25; routerModels.ts router-kling): partner-node rates for kling-v3-omni (the Router page bills Kling per
  // Kling credit at 29.54; the per-second credits are the partner-node table). Same as kling-v3 with sound off, lower with sound on.
  { providerId: 'router-kling', model: 'kling-v3-omni generation, no audio', unit: 'second', usd: c(17.72), usdByQuality: { '480p': c(17.72), '720p': c(17.72), '1080p': c(23.63) }, sourceUrl: C, checkedAt: d24, estimated: false, note: 'kling-v3-omni: 17.72 / 23.63 Comfy credits per s (720p Standard / 1080p Pro). No 480p tier: 480p billed at 720p. Reference images and first / end frames cost nothing extra.', audio: { model: 'kling-v3-omni generation, generate_audio=true', usd: c(23.63), usdByQuality: { '480p': c(23.63), '720p': c(23.63), '1080p': c(29.54) }, sourceUrl: C, checkedAt: d24, note: 'kling-v3-omni with generate_audio true: 23.63 / 29.54 Comfy credits per s (720p / 1080p). No 480p tier: 480p billed at 720p.' } },
  // Video Swap on Comfy Router (2026-10-25; routerModels.ts swapSpec). Kling 3.0 Omni "video to video, edit": 26.59 / 35.45 credits per s of OUTPUT (720p std /
  // 1080p pro; partner-node pricing, kling-v3-omni and kling-video-o1 alike), the output as long as the clip; passes are whole seconds, so the sum = the range.
  { providerId: 'router-kling-edit', model: 'kling-v3-omni video edit', unit: 'second', usd: c(26.59), usdByQuality: { '480p': c(26.59), '720p': c(26.59), '1080p': c(35.45) }, sourceUrl: C, checkedAt: '2026-10-25', estimated: false, note: 'kling-v3-omni video to video, edit: 26.59 / 35.45 Comfy credits per s of output (720p Standard / 1080p Pro); the output is as long as your clip. No 480p tier. The character image costs nothing extra.' },
  // Seedance 2.5 video edit: token billing on (input video s + output s) × W × H × 24 / 1024 at the video-input rate (1931.072 credits / 1M tokens at 480p / 720p,
  // 2112.11 at 1080p; Router pricing "Video to video"), at the largest frame per tier like the Seedance rows below → 19.3957 / 41.974 / 103.3057 per (in + out) s.
  // V2V tools count the source clip as input (pricing.ts V2V_TOOLS), so an 8 s edit is quoted on 16 s. BytePlus notes a minimum token use with video input (no figure published).
  { providerId: 'router-seedance-25-edit', model: 'Seedance 2.5 video edit (dreamina-seedance-2-5-260628)', unit: 'second', usd: c(70.1753), usdByQuality: { '480p': c(32.4272), '720p': c(70.1753), '1080p': c(172.6682) }, sourceUrl: CR, checkedAt: '2026-10-25', estimated: false, note: 'Seedance 2.5 video edit on Comfy Router: billed on (your clip s + output s) at the video-input rate, 1931.072 credits/1M tokens (480p, 720p) and 2112.11 (1080p); tokens per second = W×H×24/1024 at the largest frame per resolution. A minimum token use may apply to video input (no figure published).',
    videoInput: { usd: c(41.974), usdByQuality: { '480p': c(19.3957), '720p': c(41.974), '1080p': c(103.3057) }, note: 'Seedance 2.5 with video input: 1931.072 credits/1M tokens (480p, 720p), 2112.11 (1080p), on (input video s + output s) × W×H×24/1024.' } },
  // Render (Direct a Shot step 3, 2026-10-26; routerModels.ts renderSpec). Runway Aleph 2 on Comfy Router: 84.4844 credits ($0.4004) per second of the clip (the
  // output keeps the clip's length). Luma Ray 3.2 video edit (SDR): per generation by resolution, 5 s = 113.94 / 151.92 / 227.88 / 455.76 credits and 10 s double;
  // a clip up to 5 s bills as 5 s and 5–10 s as 10 s (LumaRay32VideoEditNode), so the job's duration is that billed length (shared/renderModels.ts renderBillSeconds).
  { providerId: 'router-aleph2', model: 'Runway Aleph 2 (runway/aleph2) video to video', unit: 'second', usd: c(84.4844), sourceUrl: CR, checkedAt: '2026-10-26', estimated: false, note: 'Runway Aleph 2 on Comfy Router: 84.4844 Comfy credits ($0.4004) per second; the output is as long as your clip.' },
  { providerId: 'router-ray32-edit', model: 'Luma Ray 3.2 video edit (luma_2/ray-3.2, SDR)', unit: 'second', usd: c(45.576), usdByQuality: { '360p': c(22.788), '480p': c(22.788), '540p': c(30.384), '720p': c(45.576), '1080p': c(91.152) }, sourceUrl: CR, checkedAt: '2026-10-26', estimated: false, note: 'Luma Ray 3.2 video edit on Comfy Router: 113.94 / 151.92 / 227.88 / 455.76 Comfy credits per 5 s (360p / 540p / 720p / 1080p), 10 s double. A clip up to 5 s bills as 5 s, 5–10 s as 10 s.' },
  // Wan 3.0 (2026-10-25): Comfy Router pricing page, per second by resolution. The partner-node page lists 15.09 / 30.17 / 60.35 as the pre-discount
  // prices of a 30%-off offer that ran to 2026-09-30; the Router page (fetched 2026-10-24) still shows 10.55 / 21.1 / 42.2, and the Router estimate is
  // checked before each run (routerRun.ts: a higher figure stops the run before anything is charged).
  { providerId: 'router-wan3', model: 'wan3.0-video', unit: 'second', usd: c(21.1), usdByQuality: { '480p': c(10.55), '720p': c(21.1), '1080p': c(42.2) }, sourceUrl: CR, checkedAt: d24, estimated: false, note: 'Comfy Router: wan3.0-video 10.55 / 21.1 / 42.2 credits per s at 480P / 720P / 1080P; sound on or off and reference images do not change it.' },
  // Veo 3.1: the price follows the Sound toggle (priceOf uses `audio` when the job asks for audio; VIDEO_LIMITS router-veo audio.priceAffects). Retiring: shared/lifecycle.ts.
  // 4K (2026-10-28): Router pricing (comfy-docs pages/development/comfy-router/pricing.md, Veo table) lists 84.4 credits/s without sound and 126.6 with sound.
  { providerId: 'router-veo', model: 'veo-3.1-generate, no audio', unit: 'second', usd: c(42.2), usdByQuality: { '720p': c(42.2), '1080p': c(42.2), '4K': c(84.4) }, sourceUrl: CR, checkedAt: '2026-10-28', estimated: false, note: '42.2 Comfy credits per s at 720p and 1080p with sound off (84.4 at 4K); 84.4 with sound on (126.6 at 4K). Google is retiring the Veo 3.1 previews from 2026-10-22 (https://ai.google.dev/gemini-api/docs/deprecations).', audio: { model: 'veo-3.1-generate, generate_audio=true', usd: c(84.4), usdByQuality: { '720p': c(84.4), '1080p': c(84.4), '4K': c(126.6) }, sourceUrl: CR, checkedAt: '2026-10-28', note: '84.4 Comfy credits per s at 720p and 1080p with audio, 126.6 at 4K (Router pricing, generate_audio true).' } },
  // Seedance 2.0 (dreamina-seedance-2-0-260128, the model we call): official token rate × the page's own formula tokens = (in + out s) × W × H × fps ÷ 1024, 24 fps, no video input.
  // 2.112 credits/1K tokens at 480p/720p, 2.323 at 1080p. Priced at the LARGEST frame BytePlus renders per resolution (any ratio), so no shape is under-quoted:
  // 480p 864×496 / 992×432 (428,544 px) → 10,044 tok/s → 21.2129; 720p 1112×834 (927,408 px) → 21,736.125 tok/s → 45.9067; 1080p 2206×946 (2,086,876 px) → 48,911.16 tok/s → 113.6206.
  { providerId: 'router-seedance', model: 'Seedance 2.0 (dreamina-seedance-2-0-260128), no video input', unit: 'second', usd: c(45.9067), usdByQuality: { '480p': c(21.2129), '720p': c(45.9067), '1080p': c(113.6206) }, sourceUrl: C, checkedAt: d24, estimated: false, note: 'Seedance 2.0 rate 2.112 credits/1K tokens (480p, 720p) and 2.323 (1080p), no video input; tokens per output second = W×H×24/1024 at the largest frame per resolution (480p 864×496, 720p 1112×834, 1080p 2206×946), so every ratio is covered. With reference videos, all tokens (input video s + output s) bill at the video-input rate (videoInput).',
    // video input: 1.297 (480p/720p), 1.418 (1080p) credits/1K tokens → per (in+out) second at the same largest frames: 480p 13.0271, 720p 28.1918, 1080p 69.356
    videoInput: { usd: c(28.1918), usdByQuality: { '480p': c(13.0271), '720p': c(28.1918), '1080p': c(69.356) }, note: 'Seedance 2.0 with video input: 1.297 credits/1K tokens (480p, 720p), 1.418 (1080p); tokens = (input video s + output s) × W×H×24/1024. The page notes a minimum token usage may apply to video-to-video; no figure is published for 2.0.' } },
  // LTX-2.5 Pro and FLUX 3 Video on Comfy Router (2026-10-25): the Router place of models that also run on their lab's API (routePrices.ts direct rows).
  { providerId: 'router-ltx-25-pro', model: 'ltx-2-5-pro (Comfy Router)', unit: 'second', usd: c(51.2941), usdByQuality: { '720p': c(36.2076), '1080p': c(51.2941) }, sourceUrl: CR, checkedAt: d24, estimated: false, note: 'Comfy Router: ltx-2-5-pro 36.2076 / 51.2941 credits per s at 720p / 1080p; sound does not change it.' },
  // 2026-10-27: LTX-2.5 Pro / Fast image to video and first + last frame through the partner node LtxApi25ImageToVideo on Comfy Cloud (comfy/ltx25ApiCloud.ts).
  // Partner-node table (Lightricks): Pro 36.21 / 51.29 credits per s at 720p / 1080p; Fast 27.16 / 39.22 / 57.33 / 90.52 at 720p / 1080p / 1440p / 4K. The node's own price
  // badge says $0.1716 / $0.2431 (Pro) and $0.1287 / $0.1859 / $0.2717 / $0.429 (Fast) per s, the same as the Router rows (exact credits from the Router pricing page).
  { providerId: 'cloud-ltx25-pro-api', model: 'LTX-2.5 (Pro) partner node on Comfy Cloud', unit: 'second', usd: c(51.2941), usdByQuality: { '720p': c(36.2076), '1080p': c(51.2941) }, sourceUrl: C, checkedAt: '2026-10-27', estimated: false, note: 'Partner-node page (Lightricks): LTX-2.5 (Pro) 36.21 / 51.29 credits per s at 720p / 1080p (node price badge $0.1716 / $0.2431 per s; Router ltx-2-5-pro 36.2076 / 51.2941). Sound and fps do not change it.' },
  { providerId: 'cloud-ltx25-fast-api', model: 'LTX-2.5 (Fast) partner node on Comfy Cloud', unit: 'second', usd: c(39.2249), usdByQuality: { '720p': c(27.1557), '1080p': c(39.2249), '1440p': c(57.3287), '4K': c(90.519) }, sourceUrl: C, checkedAt: '2026-10-27', estimated: false, note: 'Partner-node page (Lightricks): LTX-2.5 (Fast) 27.16 / 39.22 / 57.33 / 90.52 credits per s at 720p / 1080p / 1440p / 4K (node price badge $0.1287 / $0.1859 / $0.2717 / $0.429 per s; Router ltx-2-5-fast 27.1557 / 39.2249 / 57.3287 / 90.519). Sound and fps do not change it.' },
  { providerId: 'router-flux3-video', model: 'FLUX 3 Video (Comfy Router)', unit: 'second', usd: c(87.5), usdByQuality: { '720p': c(51.29), '1080p': c(87.5), '1440p': c(120.69), '4K': c(241.38) }, sourceUrl: C, checkedAt: '2026-10-28', estimated: true, note: 'Partner-node pricing (comfy-docs pages/tutorials/partner-nodes/pricing.md, FLUX 3 video): 51.29 / 87.50 / 120.69 / 241.38 credits per s at 720p / 1080p / 1440p / 4K; sound does not change it. The Router pricing page lists bfl/flux-3-video as usage-based (0.266 / GPU-second): docs conflict, so the Router estimate is checked before each run.' },
  // Comfy Router places of Seedance 2.5 / 2.0 Fast / 2.0 Mini (2026-10-25, Router pricing "Per 1M tokens by resolution" and "Seedance video token rates").
  // Same formula as Seedance 2.0 above: tokens/s = W×H×24/1024 at the LARGEST frame BytePlus renders per tier (480p 10,044, 720p 21,736.125, 1080p 48,911.156;
  // the 2.5 size table only changes 480p 16:9 to 854×480, still under 992×432), so no ratio is under-quoted. Audio on or off costs the same.
  //   2.5: 3228.511 credits/1M tokens (480p, 720p), 3530.241 (1080p) → 32.4272 / 70.1753 / 172.6682 per s. No video-input row: this route takes no reference videos.
  //   2.0 Fast: 1689.688 (one rate, 480p/720p) → 16.9712 / 36.7273; video input 995.709 → 10.0009 / 21.6429.
  //   2.0 Mini: 1056.055 → 10.607 / 22.9545; video input 633.633 → 6.3642 / 13.7727.
  { providerId: 'router-seedance-25', model: 'Seedance 2.5 (dreamina-seedance-2-5-260628), no video input', unit: 'second', usd: c(70.1753), usdByQuality: { '480p': c(32.4272), '720p': c(70.1753), '1080p': c(172.6682) }, sourceUrl: CR, checkedAt: '2026-10-25', estimated: false, note: 'Seedance 2.5 on Comfy Router: 3228.511 credits/1M tokens (480p, 720p), 3530.241 (1080p); tokens per output second = W×H×24/1024 at the largest frame per resolution, so every ratio is covered. Sound on or off costs the same.' },
  { providerId: 'router-seedance-20-fast', model: 'Seedance 2.0 Fast (dreamina-seedance-2-0-fast-260128), no video input', unit: 'second', usd: c(36.7273), usdByQuality: { '480p': c(16.9712), '720p': c(36.7273) }, sourceUrl: CR, checkedAt: '2026-10-25', estimated: false, note: 'Seedance 2.0 Fast on Comfy Router: 1689.688 credits/1M tokens; tokens per output second = W×H×24/1024 at the largest frame per resolution (480p 864×496, 720p 1112×834). No 1080p. Sound on or off costs the same.',
    videoInput: { usd: c(21.6429), usdByQuality: { '480p': c(10.0009), '720p': c(21.6429) }, note: 'Seedance 2.0 Fast with video input: 995.709 credits/1M tokens on (input video s + output s) × W×H×24/1024.' } },
  { providerId: 'router-seedance-20-mini', model: 'Seedance 2.0 Mini (dreamina-seedance-2-0-mini), no video input', unit: 'second', usd: c(22.9545), usdByQuality: { '480p': c(10.607), '720p': c(22.9545) }, sourceUrl: CR, checkedAt: '2026-10-25', estimated: false, note: 'Seedance 2.0 Mini on Comfy Router: 1056.055 credits/1M tokens; tokens per output second = W×H×24/1024 at the largest frame per resolution (480p 864×496, 720p 1112×834). No 1080p. Sound on or off costs the same.',
    videoInput: { usd: c(13.7727), usdByQuality: { '480p': c(6.3642), '720p': c(13.7727) }, note: 'Seedance 2.0 Mini with video input: 633.633 credits/1M tokens on (input video s + output s) × W×H×24/1024.' } },
  // Veo 3.1 Fast (Router pricing per second by resolution, comfy-docs pages/development/comfy-router/pricing.md): sound off 16.88 / 21.1 / 52.75 (720p / 1080p / 4K),
  // sound on 21.1 / 25.32 / 63.3 credits per s (4K added 2026-10-28).
  { providerId: 'router-veo-fast', model: 'veo-3.1-fast-generate-001, no audio', unit: 'second', usd: c(16.88), usdByQuality: { '720p': c(16.88), '1080p': c(21.1), '4K': c(52.75) }, sourceUrl: CR, checkedAt: '2026-10-28', estimated: false, note: '16.88 / 21.1 / 52.75 Comfy credits per s (720p / 1080p / 4K) with sound off; 21.1 / 25.32 / 63.3 with sound on.',
    audio: { model: 'veo-3.1-fast-generate-001, generateAudio=true', usd: c(21.1), usdByQuality: { '720p': c(21.1), '1080p': c(25.32), '4K': c(63.3) }, sourceUrl: CR, checkedAt: '2026-10-28', note: '21.1 / 25.32 / 63.3 Comfy credits per s (720p / 1080p / 4K) with sound on.' } },
  { providerId: 'api-minimax-h3', model: 'MiniMax H3', unit: 'second', usd: c(27.1557), usdByQuality: { '480p': c(27.1557), '720p': c(27.1557), '768p': c(27.1557), '1080p': c(39.2249), '2K': c(39.2249) }, sourceUrl: CR, checkedAt: d24, estimated: false, note: 'Comfy Router: 27.1557 credits/s at 768P, 39.2249 at 2K. Our 480p/720p → 768P, 1080p → 2K.',
    refImages: { usd: c(12.0692), free: 5, sourceUrl: CR, checkedAt: d22, estimated: false, note: 'MiniMax H3 reference-to-video: 12.0692 credits per reference image beyond 5 (once per clip).' },
    // Router pricing: "Video rates apply to output plus reference-video duration"; partner-node pricing: H3 Reference to Video bills reference videos at 27.16 /
    // 39.22 credits per s (2 s per video at least, up to 15 s in total). Reference audio is not billed.
    refVideoAtRate: { minEach: 2, maxTotal: 15, sourceUrl: CR, checkedAt: d24, note: 'Reference videos bill at the same per-second rate as the output (768P 27.1557, 2K 39.2249 credits per s), whole seconds rounded up, 15 s at most; reference audio is free.' } },
  // internal: placeholder until B6 (Oct 23: Comfy Cloud GPU-seconds × 0.266 cr + load time); mock runs only until the runner lands. User-facing note below stays neutral (BH3 L13).
  { providerId: 'cloud-h3-wf', model: 'MiniMax H3 workflow on Comfy Cloud', unit: 'second', usd: 0.08, usdByQuality: { '480p': 0.03, '720p': 0.08, '1080p': 0.13 }, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-27', estimated: true, priceUnmeasured: true, note: 'Price not measured yet at 768p and above. Billed by GPU time: Comfy Cloud charges for how long the GPU runs (0.39 credits per GPU-second, 211 credits = $1), model load included, so the bill follows the render, not a fixed price. Draft (480p): about $0.03 per second, from real 15 s runs on Oct 27 that billed about $0.30–0.55 each. 768p and above: MiniMax’s H3 list price ($0.08 per second) as a safe upper estimate until measured.' },
  // internal: placeholder until B6 (Comfy Cloud GPU-seconds × 0.266 cr ≈ 1.3 cr/s at 720p, rounded up to 2 cr/s for load); mock runs until the runner lands (B2).
  { providerId: 'cloud-reshoot', model: 'LTX-2 19B re-shoot workflow on Comfy Cloud', unit: 'second', usd: 0.03, usdByQuality: { '480p': 0.02, '720p': 0.03, '1080p': 0.06 }, sourceUrl: 'https://docs.comfy.org/', checkedAt: d, estimated: true, priceUnmeasured: true, note: 'Price not measured yet: Comfy Cloud bills GPU time (0.266 Comfy credits per GPU-second, including model load), so real runs stay off until a measured run sets this price. Sample runs only. The figure shown is a placeholder.' },
  { providerId: 'cloud-ltx-camera', model: 'LTX-2 19B camera workflow on Comfy Cloud', unit: 'second', usd: 0.02, usdByQuality: { '480p': 0.01, '720p': 0.02, '1080p': 0.04 }, sourceUrl: 'https://docs.comfy.org/', checkedAt: d, estimated: true, priceUnmeasured: true, note: 'Price not measured yet: Comfy Cloud bills GPU time (0.266 Comfy credits per GPU-second, including model load), so real runs stay off until a measured run sets this price. Sample runs only. The figure shown is a placeholder.' },
  // H3 runner Step 1 (Oct 26): Your Comfy deployment (a Build on platform.comfy.org). Billed by Comfy per GPU-second while a worker runs, incl. startup and
  // model load + a ~30 s idle tail (min 0 = cold start on the first job). Estimate = GPU $/h × measured seconds (DEPLOY_GPU_USD_PER_HOUR); placeholder until a measured run.
  { providerId: 'deploy-smoke', model: 'Deployment test on your Comfy deployment', unit: 'run', usd: deployUsd(60), sourceUrl: DEPLOY_PRICE_URL, checkedAt: '2026-10-26', estimated: true, priceUnmeasured: true, note: 'Price not measured yet: your Comfy deployment bills GPU time per second (RTX PRO 6000 about $3.49 per hour), including startup, model load and about 30 s idle after the job. With min 0 workers the first job also pays a cold start (often 1–3 minutes). The figure shown is about one minute of GPU time, a placeholder.' },
  // H3 runner Step 3 (Oct 26): New angle · H3 CrossView · cloud on your Comfy deployment. Per output second, guessed at ~25 GPU-s (480p) / ~50 GPU-s (768p) per second
  // of video on an RTX PRO 6000 (PLAN: 3–6 min warm for 8 s at 480p), cold start not included. Placeholder until a measured run.
  { providerId: 'cloud-h3-crossview', model: 'H3 CrossView (MiniMax H3 + CrossView-Warp LoRA) on your Comfy deployment', unit: 'second', usd: deployUsd(25), usdByQuality: { '480p': deployUsd(25), '768p': deployUsd(50) }, sourceUrl: DEPLOY_PRICE_URL, checkedAt: '2026-10-26', estimated: true, priceUnmeasured: true, note: 'Price not measured yet: your Comfy deployment bills GPU time per second (RTX PRO 6000 about $3.49 per hour), including startup, model load (about 54 GB for this recipe) and about 30 s idle. The figure is a guess of about 25 GPU-seconds per second of video at 480p and 50 at 768p, without a cold start (often a few minutes after the deployment scaled to zero).' },
  // Oct 26: H3 Character Swap · Comfy Cloud (shared Comfy Cloud workflow job, the user's imported LoRA). Comfy Cloud bills active GPU time; the rate
  // used is 0.39 credits per GPU-second (Comfy blog, Dec 2025; 211 credits = $1), guessed at ~30 GPU-s per output second at 480p and ~60 at 768p
  // (720p / 1080p render at 768p), model load included. Placeholder until the first measured run (billing usage before/after) sets it.
  // Oct 27: LTX-2.5 22B · Comfy Cloud (Generate Video / Loop / Morph and Extend share one row). Unit = one RENDERED second: Extend bills its context or guide
  // frames + the new seconds (routing/routes.ts TWINS priceInput → comfy/ltx25Cloud.ts ltx25CloudRenderSeconds; +5 s continuation renders 241 frames = 10.04 s).
  // GPU time estimated (2026-10-27): +5 s guide at 720p (5.4 s rendered) 60–120 GPU-s, +5 s continuation (10 s rendered)
  // 100–200 GPU-s → ~15 GPU-s per rendered second at 720p (1280×704), scaled by pixels for 576p (1024×576) ≈ 10 and 448p (768×448) ≈ 6.
  // Checked Oct 27 against two real runs' wall times (24.5 s for a 5 s 720p clip, 44.7 s for +5 s Extend): billed GPU time can't exceed those, so these
  // rates sit ~3x above the most those runs could cost. Released from the held state (priceUnmeasured off); a balance before/after on the next run tightens it.
  { providerId: 'cloud-ltx25-video', model: 'LTX-2.5 22B (distilled int8) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(15), usdByQuality: { '448p': cloudGpuUsd(6), '576p': cloudGpuUsd(10), '720p': cloudGpuUsd(15), ...LTX_DFR_USD }, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-27', estimated: true, note: 'An upper estimate, checked against real runs. Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. A 5 s 720p first-and-last-frame clip took 24.5 s from start to finish (job 1702b7ea, Oct 27), so it can bill at most about 10 credits ($0.05); this rate prices it at about $0.14 (15 GPU-seconds per rendered second at 720p, 10 at Sharper, 6 at Draft), on the safe side. Extend renders the kept context too. ' + LTX_DFR_NOTE },
  { providerId: 'cloud-ltx25-extend', model: 'LTX-2.5 22B Extend (distilled int8) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(15), usdByQuality: { '448p': cloudGpuUsd(6), '576p': cloudGpuUsd(10), '720p': cloudGpuUsd(15) }, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-27', estimated: true, note: 'An upper estimate per rendered second, the same rate as LTX-2.5 22B · Comfy Cloud, checked against a real run: +5 s at 720p with picture-and-sound continuation (5.04 s of kept context + 5 s new, 10.04 s rendered) took 44.7 s from start to finish (job 9979c0ca, Oct 26), so it can bill at most about 17 credits ($0.08); this rate prices it at about $0.29. With the last-frames guide it renders 0.375 s + 5 s.' },
  // Oct 27: Render · LTX-2.5 + Layout to Render · Comfy Cloud. Unit = one rendered second of the mockup (the job's duration = the whole seconds picked;
  // quote and charge read the same seconds and size). GPU time from today's LTX-2.5 22B Cloud runs (5 s 720p text-to-video ~36 s, +5 s guide ~27 s,
  // 10 s continuation ~45 s, model load included) with the layout guide doubling the video tokens on both stages: an 8 s 720p Render reads
  // ~80–100 GPU-s; priced at 18 GPU-s per second at 720p (1280×704), 12 at Sharper, 7 at Draft (by pixels), on the safe side. Not measured.
  { providerId: 'cloud-ltx25-layout', model: 'LTX-2.5 22B + Layout to Render IC-LoRA on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(18), usdByQuality: { '448p': cloudGpuUsd(7), '576p': cloudGpuUsd(12), '720p': cloudGpuUsd(18) }, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-27', estimated: true, priceUnmeasured: true, note: 'Price not measured yet: an estimate. Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. Guessed at about 7 / 12 / 18 GPU-seconds per second of mockup at Draft / Sharper / 720p (the layout guide doubles the work of a plain LTX-2.5 clip). One measured run sets the real rate.' },
  { providerId: 'cloud-ltx23-vfx', model: 'LTX-2.3 22B + IC-LoRA (official Comfy templates) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(15), usdByQuality: { '448p': cloudGpuUsd(9), '576p': cloudGpuUsd(15) }, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-27', estimated: true, priceUnmeasured: true, note: 'Price not measured yet: an estimate. Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. One rate for all four Footage Effects templates, set by the heaviest: Restore and Remove subtitles run LTX-2.3 22B dev in two stages (8 + 3 steps) with the clip as a guide on both, guessed at about 9 / 15 GPU-seconds per second of clip at Draft / Sharper; Remove an object and Extend the frame run one 8-step stage and should cost less. One measured run sets the real rate.' },
  { providerId: 'cloud-h3-keyframes', model: 'MiniMax H3 Keyframes (official Multiframe Reference template) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(48), usdByQuality: { '480p': cloudGpuUsd(22), '720p': cloudGpuUsd(48), '768p': cloudGpuUsd(48) }, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-27', estimated: true, priceUnmeasured: true, note: 'Price not measured yet: an upper estimate, billed by GPU time. Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. Set at the slow setting (Quality, 20 steps, all 5 frames as references and guides): about 22 / 48 GPU-seconds per second of clip at 480p / 768p, from our measured MiniMax H3 text to video (10 s at 20 steps ≈ $0.80) plus the reference frames. Fast (the template\'s 4-step turbo LoRA) bills well under this. One measured run sets the real rate.' },
  { providerId: 'cloud-h3-fast', model: 'MiniMax H3 Fast (FastVideo FastH3 8-Step V2) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(18), usdByQuality: { '480p': cloudGpuUsd(9), '720p': cloudGpuUsd(18), '768p': cloudGpuUsd(18) }, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-27', estimated: true, priceUnmeasured: true, note: 'Price not measured yet: an estimate. Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. Anchored on our one measured MiniMax H3 run on Comfy Cloud (H3 Character Swap, 8 steps with a mask: about 14 / 28 GPU-seconds per second at 480p / 768p); FastH3 runs the same 8 steps with sparse attention and no mask, guessed at about 9 / 18 GPU-seconds per second at 480p / 768p, well under full H3. One measured run sets the real rate.' },
  { providerId: 'cloud-h3-charswap', model: 'H3 Character Swap (MiniMax H3 + Character Swap LoRA) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(14), usdByQuality: { '480p': cloudGpuUsd(14), '720p': cloudGpuUsd(28), '1080p': cloudGpuUsd(28) }, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-26', estimated: true, priceUnmeasured: true, note: 'Price not measured yet: an estimate. Comfy Cloud bills active GPU time, including model load. Measured once (job 2514ca92, 2026-10-26): about 21 Comfy credits (≈ 54 GPU-seconds, ≈ $0.10) for 5 s at 480p, 8 steps, no mask. With the edit mask (SAM 3.1 tracking + source encode) and the 0.5 MP canvas this is about 14 GPU-seconds per second at 480p. 768p (720p and 1080p here) is about 2.4× the pixels: about 28 GPU-seconds per second, not measured yet. Turning turbo off (20 steps) costs about 2.5× the sampling.' },
  // Oct 27: H3 Extend · Comfy Cloud. Unit = one RENDERED second (the 22-frame context + the new seconds, on H3's 17k + 5 grid: +5 s renders 158 frames
  // = 6.58 s, +10 s 277 = 11.54 s; routes.ts TWINS priceInput → comfy/h3ExtendCloud.ts h3xRenderSeconds). Estimate from two measured Cloud runs:
  // H3 Character Swap 5 s at 768p, 8-step turbo with a 5 s reference clip ≈ $0.26 (job d39ac752, ≈ 27 GPU-s per rendered second) and H3 text to video
  // 10 s at 768p, 20 steps ≈ $0.80 (job 42ceb1af, ≈ 42 GPU-s per second, ≈ 19 at 8 steps). Guessed at 24 GPU-s per rendered second at 768p (≈ 1 MP),
  // 12 at 480p. Not measured for Extend itself.
  { providerId: 'cloud-h3-extend', model: 'H3 Extend (MiniMax H3, 8-step turbo) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(24), usdByQuality: { '480p': cloudGpuUsd(12), '768p': cloudGpuUsd(24), '720p': cloudGpuUsd(24), '1080p': cloudGpuUsd(24) }, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-27', estimated: true, priceUnmeasured: true, note: 'Price not measured yet: an estimate per rendered second: the 22-frame context + the new seconds on H3\'s frame grid (+5 s renders 6.58 s, +10 s 11.54 s). Comfy Cloud bills active GPU time, model load included; guessed at about 24 GPU-seconds per rendered second at 768p from two measured H3 runs (Character Swap 5 s ≈ $0.26, text to video 10 s at 20 steps ≈ $0.80). One measured run sets the real rate.' },
  { providerId: 'cloud-infinitetalk', model: 'InfiniteTalk (Wan 2.1 I2V 14B 480p fp8 + lightx2v) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(15), usdByQuality: { '480p': cloudGpuUsd(15) }, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-27', estimated: true, priceUnmeasured: true, note: 'Price not measured yet: an estimate per RENDERED second. Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. Every 3.24 s window renders 81 frames at 480p in 6 steps; guessed at about 15 GPU-seconds per rendered second (about 49 per window). The speech sets the windows: 10 s of speech = 4 windows = 12.96 rendered seconds. One measured run sets the real rate.' },
  { providerId: 'cloud-h3', model: 'MiniMax H3 · Comfy Cloud', unit: 'second', usd: 0.08, usdByQuality: { '480p': 0.08, '720p': 0.08, '1080p': 0.13 }, sourceUrl: 'https://platform.minimax.io/docs/guides/pricing', checkedAt: d, estimated: true, priceUnmeasured: true, note: 'Price not measured yet: Comfy Cloud bills GPU time (0.266 Comfy credits per GPU-second, including model load), so real runs stay off until a measured run sets this price. Sample runs only. The figure shown is MiniMax\'s own H3 list price ($0.08/s 768P, $0.13/s 2K), a placeholder.' },
  // ---- image (per output image) ----
  { providerId: 'api-flux2', model: 'FLUX.2 [pro]', unit: 'image', ...flux2Row(6.33, 3.17), sourceUrl: C, checkedAt: d24, estimated: true, note: `6.33 credits/run for the first MP + 3.17 per extra MP, counted on the real output size in started megapixels (${FLUX2_MP_NOTE}).`,
    refImages: flux2Refs(3.17) },
  { ...gptEntry('api-gpt-image', 'gpt-image-2 (Comfy Router)', 'gpt-image-2'), sourceUrl: C,
    // Billing method UNVERIFIED: the Router page lists openai/gpt-image-2 (provider Comfy) as "0.266 / GPU-second"; the partner-node page gives tokens
    // (input 2025.6, image output 7,600 / 1M). We quote the token formula, with the same headroom as 2.5; the Router /estimate before each run is the check.
    note: `${gptEntry('api-gpt-image', '', 'gpt-image-2').note} Unverified: Comfy's Router page lists gpt-image-2 as billed per GPU-second (0.266 credits), its partner-node page by tokens; we quote the token price.`,
    refImages: { usd: c(GPT_REF_TOKENS * 2025.6 / 1e6), free: 0, sourceUrl: C, checkedAt: d24, estimated: true, note: 'Token-billed image input (2025.6 credits / 1M tokens): the page says each 1024x1024 reference image adds about 2.47 credits; quoted × 1.2 (≈2.96). Larger references may cost more.' },
    officialModelPrice: { vendor: 'OpenAI', model: 'gpt-image-2', unit: 'image (output only; prompt/input-image tokens extra)', usdByTierSize: { 'low:1024x1024': 0.006, 'low:1024x1536': 0.005, 'low:1536x1024': 0.005, 'med:1024x1024': 0.053, 'med:1024x1536': 0.041, 'med:1536x1024': 0.041, 'high:1024x1024': 0.211, 'high:1024x1536': 0.165, 'high:1536x1024': 0.165 }, sourceUrl: GPT_GUIDE, checkedAt: d22, appliesToOurRoute: false } },
  // Provider audit 2026-10-21: Google's NB2 list price ($0.067 per 1K image at $60 / 1M output tokens, https://ai.google.dev/gemini-api/docs/pricing) implies ~1,120 tokens per 1K image (was 1,290 → $0.093).
  { providerId: 'api-nano-banana', model: 'Nano Banana 2', unit: 'image', ...nbRow('api-nano-banana', { '1K': 1120, '2K': 1680, '4K': 2520 }), sourceUrl: CR, checkedAt: d22, estimated: true,
    note: `Token-billed on Comfy Router: image output 15,192, text / thinking 759.6, input 126.6 Comfy credits / 1M tokens. ~1,120 / 1,680 / 2,520 image tokens for a 1K / 2K / 4K image (Google: $0.067 / $0.101 / $0.151 per image at $60 / 1M, https://ai.google.dev/gemini-api/docs/pricing). ${NB_ALLOWANCE}`,
    refImages: nbRefs('api-nano-banana', 'Input 126.6 Comfy credits / 1M tokens; ~1,120 tokens per reference image assumed (Google publishes no count for this model).') },
  // Seedream 5.0 Pro (checked 2026-10-24): Router page 9.495 / 18.99 per output image (Standard / Large), partner page 9.50 (1K, ≤2.61 MP) / 18.99 (2K):
  // the higher figure is quoted. Our 1K sizes are 1.05–1.33 MP, our 2K sizes 3.69–4.19 MP (shared/routerImageSizes.ts), so each lands in its own tier.
  // Images: the Router page bills 0.633 per input image after the first; the partner page counts every image beyond the first, outputs and inputs
  // together, and with one output per request that is every input image. The quote takes that reading (free 0), so it is never below either.
  { providerId: 'api-seedream', model: 'seedream 5.0 pro', unit: 'image', usd: c(9.5), sourceUrl: C, checkedAt: d24, estimated: false,
    note: 'Seedream 5.0 Pro: 9.50 credits per image at 1K (up to 2.61 MP), 18.99 at 2K; each input image adds 0.633.',
    refImages: { usd: c(0.633), free: 0, sourceUrl: C, checkedAt: d24, estimated: false, note: 'Seedream 5.0 Pro: 0.633 credits per input image (Router page: after the first; partner page: every image beyond the first, outputs included, so every input with one output). Quoted on every input.' } },
  { providerId: 'api-ideogram', model: 'Ideogram V4 DEFAULT', unit: 'image', usd: c(18.1038), sourceUrl: CR, checkedAt: d24, estimated: false },
  { providerId: 'api-recraft', model: 'recraftv4', unit: 'image', usd: c(12.07), sourceUrl: C, checkedAt: d, estimated: false },
  { providerId: 'api-luma-image', model: 'Luma uni-1', unit: 'image', usd: c(8.5244), usdByMode: { generate: c(8.5244), edit: c(9.1574) } /* Router pricing "Image generation and then image edit" (re-read 2026-10-25); edit = type image_edit (routerModels.ts lumaBody) */, sourceUrl: CR, checkedAt: d24, estimated: true, note: 'Mapping of LumaImageNode2 to uni-1 not confirmed on the page; generation 8.5244 credits, edit 9.1574; reference images priced in refImages.',
    refImages: { usd: c(0.633), free: 0, sourceUrl: CR, checkedAt: d22, estimated: false, note: 'Luma UNI-1 on Comfy Router: 0.633 credits per reference image (up to 9).' } },
  { providerId: 'api-kling-image', model: 'kling-image-o1 1K/2K', unit: 'image', usd: c(5.91), sourceUrl: C, checkedAt: d, estimated: false },
  // Krea 3 (krea/krea-3): thinking_mode fast / high / ultra = our tiers low / med / high (shared/imageCaps.ts; the body sends thinking_mode).
  // Router pricing "Per generation by resolution": fast 9.0519 / 18.1038, high 15.0865 / 24.1384, ultra 2K only 78.4498 (no 1K cell: ultra needs 2k).
  { providerId: 'api-krea', model: 'Krea 3 (krea/krea-3)', unit: 'image', usd: c(9.0519), usdByResolution: { '1K': c(9.0519), '2K': c(18.1038) },
    usdByTierRes: { 'low:1K': c(9.0519), 'low:2K': c(18.1038), 'med:1K': c(15.0865), 'med:2K': c(24.1384), 'high:2K': c(78.4498) }, sourceUrl: CR, checkedAt: d24, estimated: false, detailSourceUrl: CR, detailCheckedAt: d24,
    note: 'Comfy Router pricing, Krea 3 per image: fast thinking 9.0519 (1K) / 18.1038 (2K), high 15.0865 / 24.1384, ultra 78.4498 (2K only).', detailNote: 'Krea 3: Fast 1K 9.0519, 2K 18.1038; Think more (high) 15.0865 / 24.1384; Think most (ultra) 2K 78.4498 credits/image.',
    refImages: { usd: c(6.0346), usdByResolution: { '1K': c(6.0346), '2K': c(21.1211) }, free: 0, sourceUrl: CR, checkedAt: d22, estimated: false, note: 'Krea 3 reference images: 6.0346 credits each at 1K, 21.1211 at 2K. Our Router body sends none yet (references need the Krea upload proxy), so none are quoted.' } },
  { providerId: 'api-runway-image', model: 'gen4_image', unit: 'image', usd: c(24.1384), sourceUrl: CR, checkedAt: d24, estimated: false },
  { providerId: 'api-grok-image', model: 'grok-imagine-image-2.0 1K medium', unit: 'image', usd: c(12.66), sourceUrl: C, checkedAt: d, estimated: false },
  // Grok Imagine Image Pro (2026-10-25): partner page 14.77 credits per output image, no resolution split ("—"; the GrokImageNode page: "$0.07 per image").
  // The Router page lists xai/grok-imagine-image-pro as usage-based (0.266 / GPU-second); the Router estimate is checked before each run.
  // Bria FIBO 2.0 (2026-10-26): Router pricing bria/image 12.0692 credits ($0.0572) per new image, bria/fibo 8.44 credits ($0.04) per edit (with or without a mask).
  // One price per image at 1MP and 4MP (the page lists no resolution split); the partner page lists both FIBO 2.0 nodes at 12.07 credits per run.
  { providerId: 'api-bria-fibo2', model: 'Bria FIBO 2.0', unit: 'image', usd: c(12.0692), usdByMode: { generate: c(12.0692), edit: c(8.44), inpaint: c(8.44) }, sourceUrl: CR, checkedAt: '2026-10-26', estimated: false,
    note: 'Router pricing: bria/image (new image) 12.0692 credits, bria/fibo (edit, optional mask) 8.44 credits per image; the Router estimate is checked before each run.' },
  { providerId: 'api-grok-image-pro', model: 'grok-imagine-image-pro', unit: 'image', usd: c(14.77), usdByResolution: { '1K': c(14.77), '2K': c(14.77) }, sourceUrl: C, checkedAt: d24, estimated: true,
    note: 'Partner page: 14.77 credits per output image at any resolution. The Router pricing page lists it as usage-based (0.266 credits / GPU-second).' },
  { providerId: 'api-qwen-image', model: 'qwen-image-3.0', unit: 'image', usd: c(9.0519), sourceUrl: CR, checkedAt: d24, estimated: false,
    refImages: { usd: c(0.9052), free: 0, sourceUrl: CR, checkedAt: d22, estimated: false, note: 'Qwen Image 3.0 edit on Comfy Router: 0.9052 credits per input image (1–3, 1K / 2K).' } },
  { providerId: 'api-wan-image', model: 'wan2.5-t2i-preview', unit: 'image', usd: c(6.33), sourceUrl: CR, checkedAt: d24, estimated: false, note: 'Wan 2.5 T2I: 6.33 credits per generation (Router pricing; partner page 6.33 / run); we send n 1, so one image per run.' },
  // ---- image models added 2026-10-22 (model-catalog pass). Router rates: docs.comfy.org/development/comfy-router/pricing (CR, serving provider Comfy = the
  // default, no model_provider sent); per-image rows from the partner-node page (C) where the Router page only says "GPU-second" (ROUTER-AUDIT finding 9).
  // Token-billed models (GPT Image 2.5, Nano Banana 2.1 / Pro): Comfy's token rate × the vendor's published tokens per image → estimated; the Router
  // estimate is checked before each run (routerRun.ts: refused above the quote + $0.002, nothing charged).
  { ...gptEntry('api-gpt-image-25-flare', 'gpt-image-2.5-flare (Comfy Router)', 'gpt-image-2.5'),
    refImages: { usd: c(GPT_REF_TOKENS * 2413.84 / 1e6), free: 0, sourceUrl: CR, checkedAt: d24, estimated: true, note: 'Image input 2413.84 credits / 1M tokens. OpenAI publishes no input-token count for 2.5; ~1,463 tokens per reference assumed (Comfy\'s gpt-image-2 example, ~1,219, × 1.2).' } },
  { ...gptEntry('api-gpt-image-25-sunburst', 'gpt-image-2.5-sunburst (Comfy Router)', 'gpt-image-2.5'),
    refImages: { usd: c(GPT_REF_TOKENS * 2413.84 / 1e6), free: 0, sourceUrl: CR, checkedAt: d24, estimated: true, note: 'Image input 2413.84 credits / 1M tokens; ~1,463 tokens per reference assumed (no published count for 2.5). Same rates as Flare.' } },
  // GPT Image 1.5 (2026-10-25): token-billed on Comfy Router (CR: input text 1055 / image 1688, output image 6752 per 1M); OpenAI's fixed gpt-image-1 token table
  // for its three sizes (GPT15_TOKENS), quoted the same way as GPT Image 2 / 2.5 (gptImageQuote: + 8 tokens, prompt text, max(× 1.2, + 1 credit)).
  { ...gptEntry('api-gpt-image-15', 'gpt-image-1.5 (Comfy Router)', 'gpt-image-1.5'),
    refImages: { usd: c(GPT_REF_TOKENS * 1688 / 1e6), free: 0, sourceUrl: CR, checkedAt: d24, estimated: true, note: 'Image input 1688 credits / 1M tokens; ~1,463 tokens per reference assumed (Comfy\'s gpt-image-2 example, ~1,219, × 1.2; OpenAI publishes no input count for 1.5).' } },
  // Nano Banana 2.1: Comfy 9051.9 / 2262.975 / 452.595 credits per 1M image / text+thinking / input tokens; Google: 1,120 / 1,680 / 3,780 image tokens per 1K / 2K / 4K
  { providerId: 'api-nano-banana-21', model: 'Nano Banana 2.1 (vertexai/gemini-nano-banana-2.1)', unit: 'image', ...nbRow('api-nano-banana-21', { '1K': 1120, '2K': 1680, '4K': 3780 }),
    sourceUrl: CR, checkedAt: d22, estimated: true, note: `Token-billed on Comfy Router: image output 9,051.9, text / thinking 2,262.975, input 452.595 Comfy credits / 1M tokens. 1,120 / 1,680 / 3,780 image tokens per 1K / 2K / 4K image (Google's table, https://ai.google.dev/gemini-api/docs/pricing). ${NB_ALLOWANCE}`,
    refImages: nbRefs('api-nano-banana-21', 'Input 452.595 Comfy credits / 1M tokens; ~1,120 tokens per reference image assumed (Google publishes no count for this model).') },
  // Nano Banana Pro: Comfy 30384 / 3038.4 / 506.4 per 1M; Google $0.134 per 1K/2K, $0.24 per 4K at $120 / 1M → 1,120 / 2,000 image tokens; input $0.0011 per image (~560 tokens)
  { providerId: 'api-nano-banana-pro', model: 'Nano Banana Pro (vertexai/gemini-3-pro-image)', unit: 'image', ...nbRow('api-nano-banana-pro', { '1K': 1120, '2K': 1120, '4K': 2000 }),
    sourceUrl: CR, checkedAt: d22, estimated: true, note: `Token-billed on Comfy Router: image output 30,384, text / thinking 3,038.4, input 506.4 Comfy credits / 1M tokens. 1,120 image tokens per 1K / 2K image, 2,000 per 4K (Google: $0.134 / $0.24 at $120 / 1M, https://ai.google.dev/gemini-api/docs/pricing). ${NB_ALLOWANCE}`,
    refImages: { usd: c(506.4 * (0.0011 / 2e-6) / 1e6), free: 0, sourceUrl: CR, checkedAt: d22, estimated: true, note: 'Input 506.4 Comfy credits / 1M tokens; Google: an input image ≈ $0.0011 at $2 / 1M (~550 tokens).' } },
  // Nano Banana 2 Lite on Comfy Router (2026-10-25): a second Run on place of the Gemini API engine (routes.ts, route comfy-router:direct-gemini-nb2-lite).
  // Comfy 7596 / 379.8 / 63.3 credits per 1M image / text+thinking / input tokens; 1,120 image tokens per 1K image (Google: $0.0336 at $30 / 1M). 1K only.
  { providerId: 'comfy-router:direct-gemini-nb2-lite', model: 'Nano Banana 2 Lite (vertexai/gemini-3.1-flash-lite-image, Comfy Router)', unit: 'image', ...nbRow('comfy-router:direct-gemini-nb2-lite', { '1K': 1120 }),
    sourceUrl: CR, checkedAt: d24, estimated: true, note: `Token-billed on Comfy Router: image output 7,596, text / thinking 379.8, input 63.3 Comfy credits / 1M tokens. ~1,120 image tokens per 1K image (Google: $0.0336 at $30 / 1M, https://ai.google.dev/gemini-api/docs/pricing). 1K only. ${NB_ALLOWANCE}`,
    refImages: nbRefs('comfy-router:direct-gemini-nb2-lite', 'Input 63.3 Comfy credits / 1M tokens; ~1,120 tokens per reference image assumed (Google publishes no count for this model).') },
  // FLUX 3 Image: partner page per image by resolution (the Router page lists bfl/flux-3-image as GPU-second: docs conflict, ROUTER-AUDIT finding 9)
  { providerId: 'api-flux3-image', model: 'FLUX 3 Image (bfl/flux-3-image)', unit: 'image', usd: c(14.48), usdByResolution: { '0.75K': c(12.37), '1K': c(14.48), '1.5K': c(21.12), '2K': c(30.17), '4K': c(183.15) }, sourceUrl: C, checkedAt: d24, estimated: true,
    note: 'Partner-node page: FLUX 3 Image 0.75K 12.37, 1K 14.48, 1.5K 21.12, 2K 30.17, 4K 183.15 credits per image. The Router pricing page lists bfl/flux-3-image as usage-based (0.266 / GPU-second); the Router estimate is checked before each run.' },
  { providerId: 'api-flux2-max', model: 'FLUX.2 [max] (bfl/flux-2-max)', unit: 'image', ...flux2Row(14.77, 6.33), sourceUrl: C, checkedAt: d24, estimated: true,
    note: `Partner-node page: 14.77 credits / run for the first MP + 6.33 per extra MP, counted on the real output size in started megapixels (${FLUX2_MP_NOTE}). The Router page lists bfl/flux-2-max as GPU-second.`,
    refImages: flux2Refs(6.33) },
  // Seedream 4.5 (2026-10-25): Router pricing 8.44 credits per image (partner page the same), one price at 2K and 4K. Images: the partner page's Seedream note
  // ("the first image in each request is free; each additional image, outputs and inputs together, adds 0.63") is written next to 5.0 and not confirmed for
  // 4.5, so it is quoted on every input image (like Flash) to keep the quote at or above the bill.
  { providerId: 'api-seedream-45', model: 'seedream 4.5 (seedream-4-5-251128)', unit: 'image', usd: c(8.44) /* one price at every size (no per-size row: a bare quote with no size still prices; the job runs at 2K, imageCaps.ts) */, sourceUrl: CR, checkedAt: d24, estimated: false,
    note: 'Flat 8.44 credits per image at 2K and 4K (Router pricing page; partner page 8.44).',
    refImages: { usd: c(0.633), free: 0, sourceUrl: C, checkedAt: d24, estimated: true, note: 'Seedream input images: 0.633 credits each, quoted on every input (the partner page states it for Seedream 5.0; not confirmed for 4.5).' } },
  { providerId: 'api-seedream-flash', model: 'seedream 5.0 flash (seedream-5-0-flash-260915)', unit: 'image', usd: c(5.4311), usdByResolution: { '1K': c(5.4311), '2K': c(5.4311) }, sourceUrl: CR, checkedAt: d22, estimated: false,
    note: 'Flat 5.4311 credits per image at every resolution (Router pricing page; partner page 5.43).',
    refImages: { usd: c(0.633), free: 0, sourceUrl: C, checkedAt: d24, estimated: false, note: 'Partner page: the first image in a request is free and every image beyond it, outputs and inputs together, adds 0.63 credits (0.633 on the Router page for Pro), so with one output each input image adds 0.633.' } },
  { providerId: 'api-ideogram-45', model: 'Ideogram 4.5 (ideogram/ideogram-4-5)', unit: 'image', usd: c(18.1038), usdByTier: { low: c(9.0519), med: c(18.1038), high: c(60.346) }, sourceUrl: CR, checkedAt: d22, estimated: false,
    note: 'Router pricing: low 9.0519, medium 18.1038, high 60.346 credits per image (very_low 2.41384 needs source images; not offered). Partner page: edit at the same rates.' },
  { providerId: 'api-qwen-image-pro', model: 'qwen-image-3.0-pro', unit: 'image', usd: c(12.0692), usdByResolution: { '1K': c(12.0692), '2K': c(22.6297) }, sourceUrl: CR, checkedAt: d22, estimated: false,
    note: 'Router pricing: 12.0692 (1K, ≤2.25 MP) / 22.6297 (2K) credits per output image.',
    refImages: { usd: c(0.9052), free: 0, sourceUrl: CR, checkedAt: d22, estimated: false, note: 'Qwen Image 3.0 Pro: 0.9052 credits per input image (1K / 2K).' } },
  { providerId: 'api-recraft-41', model: 'recraftv4_1', unit: 'image', usd: c(10.56), sourceUrl: C, checkedAt: d22, estimated: false, note: 'Partner page 10.56 credits / image = 35 Recraft units × 0.3017 (Router: 0.3017 credits per Recraft unit; Recraft: V4.1 raster $0.035).' },
  { providerId: 'api-recraft-41-pro', model: 'recraftv4_1_pro', unit: 'image', usd: c(63.36), sourceUrl: C, checkedAt: d22, estimated: false, note: 'Partner page 63.36 credits / image = 210 Recraft units × 0.3017 (Recraft: V4.1 Pro raster $0.21).' },
  { providerId: 'api-luma-uni1-max', model: 'Luma uni-1-max', unit: 'image', usd: c(21.1), usdByMode: { generate: c(21.1), edit: c(21.733) }, sourceUrl: CR, checkedAt: d22, estimated: false, note: 'Router pricing: uni-1-max image generation 21.1 credits, image edit 21.733 (an edit run sends type image_edit, re-read 2026-10-25).',
    refImages: { usd: c(0.633), free: 0, sourceUrl: CR, checkedAt: d22, estimated: false, note: 'Luma UNI-1 Max on Comfy Router: 0.633 credits per reference image (up to 9).' } },
  { providerId: 'api-hunyuan-image', model: 'hy-image-3.5-preview 1K/2K', unit: 'image', usd: c(7.24), sourceUrl: C, checkedAt: d, estimated: false },
  { providerId: 'api-meta-muse', model: 'Meta Muse Image', unit: 'image', usd: c(3.017), sourceUrl: C, checkedAt: d, estimated: false },
  { providerId: 'direct-flux2-flex', model: 'FLUX.2 [flex] (BFL direct)', unit: 'image', usd: 0.05, usdByResolution: { '1K': 0.05 }, sourceUrl: 'https://bfl.ai/pricing', checkedAt: '2026-10-23', estimated: true, note: 'BFL lists FLUX.2 [flex] text-to-image "from $0.05" per megapixel; our body asks ≤1 MP (1K). Edits run on their own route ($0.10 from). The submit response returns the real cost.' },
  { providerId: 'direct-flux3-upscale', model: 'FLUX 3 Upscaler (BFL FLUX Video Upscale)', unit: 'mp_second', usd: 0.035, usdByMode: { precise: 0.035, creative: 0.05 }, sourceUrl: 'https://bfl.ai/pricing', checkedAt: '2026-10-23', estimated: false, note: 'Video Upscale: $0.035 (Precise) / $0.05 (Creative) per output megapixel-second (BFL pricing, re-read 2026-10-23; was $0.07 / $0.10 at launch). Price = output MP (≤14.4, BFL cap) × seconds × rate, rounded UP to whole credits. Rejected sources (>20 s, >2560×1440, >50 MB) are not charged.' },
  // ---- audio ----
  { providerId: 'api-eleven-tts', model: 'eleven_v4', unit: '1k_chars', usd: c(24.14), sourceUrl: C, checkedAt: d, estimated: false },
  // ElevenLabs v3 / v4 Turbo (2026-10-25): Comfy Router pricing page rows, per 1,000 characters of script (v3 21.1 = $0.10, v4 Turbo 12.0692 = $0.0572).
  { providerId: 'api-eleven-v3', model: 'eleven_v3', unit: '1k_chars', usd: c(21.1), sourceUrl: CR, checkedAt: '2026-10-25', estimated: false, note: 'Comfy Router: 21.1 credits per 1,000 characters of script.' },
  { providerId: 'api-eleven-v4-turbo', model: 'eleven_v4_turbo', unit: '1k_chars', usd: c(12.0692), sourceUrl: CR, checkedAt: '2026-10-25', estimated: false, note: 'Comfy Router: 12.0692 credits per 1,000 characters of script.' },
  { providerId: 'api-eleven-sfx', model: 'Text to Sound Effects', unit: 'minute', usd: c(29.54), maxSec: 30, sourceUrl: CR, checkedAt: d24, estimated: false, note: 'eleven_sfx_v2 on Comfy Router: 29.54 credits per minute of the requested length (0.5–30 s), so a longer pick is quoted and sent as 30 s.' },
  { providerId: 'api-fish-tts', model: 's2.1-pro', unit: '1k_bytes', usd: c(4.53), sourceUrl: C, checkedAt: d, estimated: true, note: 'Page marks it "~" (approximate).' },
  { providerId: 'api-heygen-tts', model: 'HeyGen Text to Speech', unit: 'second', usd: c(0.2), sourceUrl: C, checkedAt: d, estimated: true, note: 'Page marks it "~0.20 / sec".' },
  { providerId: 'api-sonilo-music', model: 'Sonilo Text to Music', unit: 'second', usd: c(0.5275), sourceUrl: C, checkedAt: d, estimated: false },
  { providerId: 'api-sonilo-v2m', model: 'Sonilo Video to Music', unit: 'second', usd: c(1.9), sourceUrl: C, checkedAt: d, estimated: false },
  // Seed Audio 1.0 Multilingual is text to speech with no length field: Comfy bills the real output (original_duration, capped at 120 s) at 0.7543 / s.
  // 2026-10-27: also Music and Sound effects (tools/media.ts). Those prompts describe the sound rather than read a script, so they are quoted at the 120 s cap.
  { providerId: 'api-seed-audio', model: 'ByteDance Seed Audio 1.0 Multilingual', unit: 'second', usd: c(0.7543), sourceUrl: CR, checkedAt: d24, estimated: true,
    speech: { charsPerSec: 8, cjkCharsPerSec: 2.5, minSec: 3, maxSec: 120, capModes: ['music', 'sfx'], capNote: 'Billed per second of audio returned, capped at 2 minutes. The request has no length field, so music and sound effects are quoted at the 2-minute cap (an "up to" figure).', note: 'Seconds estimated from the script, slower than normal speech on purpose (8 letters or 2.5 CJK characters per second), so it is an "up to" figure, capped at the 120 s Comfy bills at most.' },
    note: 'Comfy Router: 0.7543 credits per second of audio returned, capped at 120 s. The request has no length field: speech is quoted from the script (an upper estimate); music and sound effects at the 120 s cap.' },
  // MiniMax Music 3 · Comfy Cloud (2026-10-27): the official template on shared Comfy Cloud, billed by active GPU time (0.39 credits per GPU-second, 211 credits
  // = $1; Comfy docs cloud-nodes/overview: "billed per GPU-second"). No per-song price is published. Unit = one second of the song asked (max_duration: the
  // autoregressive model and its 30-step decode scale with the length), guessed at 4 GPU-seconds per song second including model load. Not measured.
  { providerId: 'cloud-minimax-music', model: 'MiniMax Music 3 (open weights) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(4), maxSec: 360, sourceUrl: 'https://www.comfy.org/cloud/pricing', checkedAt: '2026-10-27', estimated: true, priceUnmeasured: true, note: 'Price not measured yet: an estimate. Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. Guessed at about 4 GPU-seconds per second of song. One measured run sets the real rate.' },
  { providerId: 'direct-minimax-speech', model: 'speech-2.8-hd', unit: '1k_chars', usd: 0.1, sourceUrl: 'https://platform.minimax.io/docs/guides/pricing', checkedAt: d, estimated: false, note: '$100 / M characters.' },
  // ---- Image to layers (2026-10-24, shared/imageLayers.ts): Seedream 5.0 layer separation on Comfy Router, one flat price per run (the base plate and
  // every layer included, whatever the count). Router pricing page rows for layer separation; the partner-node page lists the same (Pro 6.79 / 13.58, Flash 5.43).
  // 2026-10-24: billed PER OUTPUT IMAGE, not per run. A real Flash run returned 13 layers and was charged 70.6 credits = 13 × 5.4311. The count is only
  // known after the run (the base image + up to 16 layers), so the quote is the worst case, 17 × the per-image rate, shown as '≈ up to'.
  { providerId: 'api-seedream-layers-flash', model: 'Seedream 5.0 Flash layer separation (byteplus/seedream-5-0-flash-260915)', unit: 'run', usd: c(LAYERS_MAX_OUT * 5.4311), usdByResolution: { '1K': c(LAYERS_MAX_OUT * 5.4311), '2K': c(LAYERS_MAX_OUT * 5.4311) }, upTo: LAYERS_UP_TO,
    sourceUrl: CR, checkedAt: '2026-10-24' as HostedPrice['checkedAt'], estimated: false,
    note: 'Billed 5.4311 credits per output image (Router pricing lists it per generation, but a real run returning 13 layers was charged 13 × 5.4311 = 70.6). Quote = 17 images (base + up to 16 layers).' },
  { providerId: 'api-seedream-layers-pro', model: 'Seedream 5.0 Pro layer separation (byteplus/seedream-5-0-pro-260628)', unit: 'run', usd: c(LAYERS_MAX_OUT * 6.7889), usdByResolution: { '1K': c(LAYERS_MAX_OUT * 6.7889), '2K': c(LAYERS_MAX_OUT * 13.5778) }, upTo: LAYERS_UP_TO,
    sourceUrl: CR, checkedAt: '2026-10-24' as HostedPrice['checkedAt'], estimated: false,
    note: 'Assumed billed per output image like Flash: 6.7889 (1K) / 13.5778 (2K) credits each. Quote = 17 images (base + up to 16 layers). We send size 1K or 2K.' },
];
export const HOSTED_BY_ID: Record<string, HostedPrice> = Object.fromEntries(HOSTED_PRICES.map((p) => [p.providerId, p]));
/** Route price rows (fal / Replicate, registered elsewhere) that the /api/pricing table lists too, e.g. the Reframe routes (tools/editVideo). */
export const PRICING_TABLE_EXTRA: HostedPrice[] = [];
// ---- Official Comfy templates from comfy.org/workflows "Most popular" (2026-10-27, tools/comfyFeatured.ts): Gemini Omni 1.1 Flash, Topaz Bloom 2,
// Wan Animate 2, all on Comfy Cloud. Partner-node rows: docs.comfy.org/tutorials/partner-nodes/pricing ("approximate" there, so estimated here).
const COMFY_TEMPLATE_PRICES: HostedPrice[] = [
  { providerId: 'cloud-gemini-omni', model: 'Gemini Omni 1.1 Flash (GeminiVideoOmniV2 partner node) on Comfy Cloud', unit: 'second', usd: c(30.57), usdByQuality: { '720p': c(30.57), '1080p': c(45.87), '4K': c(91.76) },
    sourceUrl: C, checkedAt: '2026-10-27' as HostedPrice['checkedAt'], estimated: true,
    note: 'Partner-node page, Video: Google Gemini Omni, "billed per second of generated video, rates are approximate": Omni Flash 1.1 at 720p 30.57, 1080p 45.87, 4k 91.76 credits per s (360p 10.19, not offered). Sound is always on and does not change it. The node reads the length from the prompt, so the clip can come out a little shorter or longer than asked.' },
  { providerId: 'cloud-topaz-bloom2', model: 'Topaz Bloom 2 (TopazImageEnhanceV2 partner node) on Comfy Cloud', unit: 'megapixel', mpBlock: 8, usd: c(96.55), sourceUrl: C, checkedAt: '2026-10-27' as HostedPrice['checkedAt'], estimated: true,
    note: 'Partner-node page, Topaz Image Enhance (current node): "charges per 8 megapixels of output (approximate)", Bloom 2 96.55 credits per 8 MP; quoted per started 8 MP block of the output.' },
  { providerId: 'cloud-wan-animate2', model: 'Wan Animate 2 (int8 + lightx2v, 6 steps, 480p) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(25), usdByQuality: { '480p': cloudGpuUsd(25) }, sourceUrl: 'https://www.comfy.org/cloud/pricing',
    checkedAt: '2026-10-27' as HostedPrice['checkedAt'], estimated: true, priceUnmeasured: true,
    note: 'Price not measured yet: an estimate per RENDERED second (every 81-frame window renders 3.33 s at 24 fps). Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. Guessed at about 25 GPU-seconds per rendered second (14B at 480p, 6 steps, with the pose branch). Real runs stay off until a measured run sets this price.' },
  // Swap Two People (2026-10-27, tools/twoPersonSwap.ts + comfy/h3TwoPersonSwapCloud.ts): the one-person H3 Character Swap recipe run twice in one job
  { providerId: 'cloud-h3-two-swap', model: 'H3 Character Swap ×2 (MiniMax H3 + Character Swap LoRA, one pass per person, 8 steps) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(56), usdByQuality: { '480p': cloudGpuUsd(28), '768p': cloudGpuUsd(56) }, sourceUrl: 'https://www.comfy.org/cloud/pricing',
    checkedAt: '2026-10-27' as HostedPrice['checkedAt'], estimated: true, priceUnmeasured: true,
    note: 'Price not measured yet: an estimate per RENDERED second (H3\'s 17k+5 frame grid at 24 fps: 5 s renders 124 frames = 5.17 s). Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. Two one-person passes in one job: about twice the one-person route (cloud-h3-charswap, ~14 GPU-seconds per second at 480p, ~28 at 768p), with two SAM 3.1 tracks and the models loaded once. One measured run sets the real rate.' },
  // Prompt Edit (2026-10-27, tools/promptEdit.ts + comfy/berniniCloud.ts): Bernini-R, the official template video_bernini_r_video_editing (turbo)
  { providerId: 'cloud-bernini-r', model: 'Bernini-R (Wan 2.2 high + low fp8, lightx2v turbo, 6 steps, 480p) on Comfy Cloud', unit: 'second', usd: cloudGpuUsd(25), usdByQuality: { '480p': cloudGpuUsd(25) }, sourceUrl: 'https://www.comfy.org/cloud/pricing',
    checkedAt: '2026-10-27' as HostedPrice['checkedAt'], estimated: true, priceUnmeasured: true,
    note: 'Price not measured yet: an estimate per RENDERED second (the clip\'s first 5 s at most, 16 fps: 81 frames = 5.06 s). Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. Guessed at about 25 GPU-seconds per rendered second (two 14B experts at 480p, 6 steps, with the clip as context). One measured run sets the real rate.' },
];
// FLUX 3 Max (2026-10-27, comfy/flux3MaxCloud.ts): launch rates until 2026-11-07 00:00 UTC, then the standard rates (both on the pages); the getters
// switch on the date, so a quote and its charge read the same rate. Billed per second of the clip; reasoning_level and sound don't change it.
const F3M_PROMO_END = Date.UTC(2026, 10, 7); const f3mPromo = () => Date.now() < F3M_PROMO_END;
COMFY_TEMPLATE_PRICES.push(
  { providerId: 'cloud-flux3-max', model: 'FLUX 3 Max (Flux3Max partner nodes) on Comfy Cloud', unit: 'second', get usd() { return f3mPromo() ? 0.103675 : 0.4147; },
    get usdByQuality() { return f3mPromo() ? { '720p': 0.060775, '1080p': 0.103675 } : { '720p': 0.2431, '1080p': 0.4147 }; }, sourceUrl: 'https://docs.comfy.org/built-in-nodes/Flux3MaxImageToVideoNode',
    checkedAt: '2026-10-27' as HostedPrice['checkedAt'], estimated: false,
    note: 'Partner nodes FLUX 3 Max Text / Image to Video: $0.060775 per s at 720p and $0.103675 at 1080p until November 7, 2026 (12.82 / 21.88 credits per s on the partner-node page), then $0.2431 / $0.4147 (51.29 / 87.50 credits). Reasoning and sound do not change it.' } as HostedPrice,
  { providerId: 'comfy-router:cloud-flux3-max', model: 'FLUX 3 Max (fal/flux-3-max) on Comfy Router, 720p text to video', unit: 'second', get usd() { return f3mPromo() ? 0.0303875 : 0.12155; },
    get usdByQuality() { return f3mPromo() ? { '720p': 0.0303875 } : { '720p': 0.12155 }; }, sourceUrl: CR, checkedAt: '2026-10-27' as HostedPrice['checkedAt'], estimated: false,
    note: 'Comfy Router pricing, fal rates per second: fal/flux-3-max $0.0303875 per s until November 7, 2026, then $0.12155. Router publishes one rate, so this place takes 720p text to video only; 1080p runs on the partner node.' } as HostedPrice,
);
// One key runs everything (2026-10-27): the photo and clip tools that ran on fal only, on Comfy Router (pricing page, USD columns; routing/routerModels.ts).
COMFY_TEMPLATE_PRICES.push(
  { providerId: 'comfy-router:fal-bria-rmbg', model: 'Bria Remove Background (bria/image-edit-remove-background) on Comfy Router', unit: 'image', usd: 0.018, sourceUrl: CR, checkedAt: '2026-10-27', estimated: false, note: 'Comfy Router: $0.018 (3.798 credits) per image.' },
  { providerId: 'comfy-router:fal-bria-expand', model: 'Bria Expand (bria/image-edit-expand) on Comfy Router', unit: 'image', usd: 0.0286, sourceUrl: CR, checkedAt: '2026-10-27', estimated: false, note: 'Comfy Router: $0.0286 (6.0346 credits) per image.' },
  { providerId: 'comfy-router:fal-bria-eraser', model: 'Bria Erase (bria/image-edit-erase) on Comfy Router', unit: 'image', usd: 0.0286, sourceUrl: CR, checkedAt: '2026-10-27', estimated: false, note: 'Comfy Router: $0.0286 (6.0346 credits) per image.' },
  { providerId: 'router-bria-tryon', model: 'Bria Product Virtual Try-On (bria/image-edit-product-virtual-tryon) on Comfy Router', unit: 'image', usd: 0.0572, sourceUrl: CR, checkedAt: '2026-10-27', estimated: false, note: 'Comfy Router: $0.0572 (12.0692 credits) per image.' },
  { providerId: 'comfy-router:comfy-birefnet-video', model: 'Bria Video Background Removal (bria/video-edit-remove-background) on Comfy Router', unit: 'second', usd: 0.05, sourceUrl: CR, checkedAt: '2026-10-27', estimated: false, note: 'Comfy Router: $0.05 (10.55 credits) per second of clip, any background.' },
  { providerId: 'comfy-router:luma-ray32-reframe', model: 'Luma Ray 3.2 Reframe (luma_2/ray-3.2, video_reframe) on Comfy Router', unit: 'second', usd: 0.12, usdByQuality: { '360p': 0.03, '540p': 0.06, '720p': 0.12, '1080p': 0.36 }, sourceUrl: CR, checkedAt: '2026-10-27', estimated: true,
    note: 'Comfy Router, Ray 3.2 video reframe: $0.03 / $0.06 / $0.12 / $0.36 per s at 360p / 540p / 720p / 1080p. We send 720p (High) or 540p (Fast). Quoted on the clip\'s length; the page doesn\'t say how a partial second is billed.' },
);
for (const p of COMFY_TEMPLATE_PRICES) { HOSTED_PRICES.push(p); HOSTED_BY_ID[p.providerId] = p; }

/**
 * Create Image price detail (additive): per-resolution / per-tier rates from the Comfy partner-node pricing page,
 * checked 2026-10-16, converted at 211 Comfy credits = $1. Merged into the entries above.
 */
const IMAGE_DETAIL: Record<string, Partial<HostedPrice>> = {
  'api-seedream': { usdByResolution: { '1K': c(9.5), '2K': c(18.99) }, detailNote: 'seedream 5.0 pro: 1K (≤2.61 MP) 9.50, 2K 18.99 credits/image (Router page: 9.495 / 18.99).' },
  'api-kling-image': { usdByResolution: { '1K': c(5.91), '2K': c(5.91), '4K': c(11.82) }, detailNote: 'kling-image-o1: 1K/2K 5.91, 4K 11.82 credits/image.' },
  'api-qwen-image': { usdByResolution: { '1K': c(9.0519), '2K': c(9.0519) }, detailNote: 'qwen-image-3.0: 1K, 2K 9.0519 credits/image (Comfy Router pricing).' },
  'api-hunyuan-image': { usdByResolution: { '1K': c(7.24), '2K': c(7.24), '4K': c(9.66) }, detailNote: 'hy-image-3.5-preview: 1K/2K 7.24, 4K 9.66 credits/image.' },
  'api-grok-image': { usdByTierRes: { 'low:1K': c(8.44), 'med:1K': c(12.66), 'low:2K': c(12.66), 'med:2K': c(16.88) }, detailNote: 'grok-imagine-image-2.0 generate: 1K 8.44 low / 12.66 medium; 2K 12.66 low / 16.88 medium.' },
  'api-ideogram': { usdByTier: { low: c(9.0519), med: c(18.1038), high: c(30.173) }, detailNote: 'Ideogram V4 rendering_speed TURBO 9.0519 / DEFAULT 18.1038 / QUALITY 30.173 (Comfy Router pricing); our low/med/high = TURBO/DEFAULT/QUALITY.' },
  'api-flux2': { detailNote: `FLUX.2 [pro] 6.33/run first MP + 3.17 per extra MP, started megapixels of the real output (${FLUX2_MP_NOTE}).` },
};
for (const [id, d] of Object.entries(IMAGE_DETAIL)) { const e = HOSTED_PRICES.find((p) => p.providerId === id); if (e) Object.assign(e, d, { detailSourceUrl: C, detailCheckedAt: d0 }); }
