/**
 * Live price: ONE source of truth for server (charge) and web (Generate button).
 * Isomorphic: no imports, no Node/DOM APIs. Web imports this file directly (web/src/shared/price.ts).
 * 1 credit = $0.01.
 */
export const DRAFT_FACTOR = 0.3;
export const MIN_PRICE = 5;
export const DEFAULT_DURATION = 8;
/** Mock price multipliers per provider (open weights = 1). */
export const PROVIDER_FACTORS: Record<string, number> = {
  'comfy-open': 1, 'cloud-infinitetalk': 1, 'cloud-h3-extend': 1, 'comfy-funcamera': 1, 'router-kling': 1.6, 'router-veo': 2.2, 'router-seedance': 1.4, 'cloud-h3': 1.3, 'cloud-h3-wf': 1.3, 'cloud-h3-fast': 1, 'cloud-h3-keyframes': 1, 'cloud-ltx-camera': 1, 'cloud-ltx25-video': 1, 'cloud-ltx25-extend': 1, 'cloud-ltx25-layout': 1, 'cloud-ltx23-vfx': 1, 'cloud-reshoot': 1, 'cloud-h3-crossview': 1.3,
};
/** Per-tool option multipliers keyed by preset/type id (others = 1). */
export const OPTION_FACTORS: Record<string, Record<string, number>> = {
  upscale: { precise: 1, creative: 2.2, smooth60: 1.4 },
};
import { HOSTED_BY_ID, unitInfo, unitQty, usdToCredits, gptImageUsd, gptImageQuote, mpImageUsd, promptBucket, promptBytesOf, type HostedPrice } from './hostedPrices.js';
import { usdPerImage, type ImageRes, type Tier } from './imageCaps.js';
export * from './hostedPrices.js';
export { gptImageSize } from './gptImageSizes.js';
export { routerImageSize } from './routerImageSizes.js';
export { flux2Size } from './hostedAspects.js';
/** Removed by the PRICING OVERRIDE (2026-10-16): no spec ladders; kept empty for importers. */
export const PRICE_LADDERS: Record<string, Record<string, number>> = {};
export interface PriceInput {
  toolId: string;
  /** Total seconds of connected reference videos (ffprobe at upload). Token-billed providers with `videoInput` bill (in + out) s at the video-input rate. */
  refVideoSec?: number;
  /** tool.gpuSecPerSec (GPU seconds per source second, by quality). */
  rates: Record<string, number>;
  quality: string;
  durationSec?: number | null;
  provider?: string;
  /** Draft = 480p preview at ~30%. */
  draft?: boolean;
  /** Render passes (Re-shoot: angles × (fullClip ? 2 : 1)). */
  passes?: number;
  /** Picked preset/type ids (option factors). */
  types?: string[];
  /** Uses a free run (price 0). */
  free?: boolean;
  /** Overrides for registry-driven tools (plugins): per-type factors and the provider factor. */
  optionFactors?: Record<string, number>;
  providerFactor?: number;
  /** Text length for per-character hosted prices (TTS). */
  chars?: number;
  /** UTF-8 byte length of the script (Fish bills per 1k bytes); falls back to chars. */ bytes?: number;
  /** Output count (Create Image n, 1–4): rounded per-output price × count, so price = per image × n exactly. */
  count?: number;
  /** Generated audio on (uses the hosted row's `audio` price when it has one). */
  audio?: boolean;
  /** Create Image: quality tier (low/med/high) and output resolution (1K/2K/4K) for per-image rates. */
  tier?: string | null;
  imageRes?: string;
  /** Per-megapixel-second prices (unit mp_second): output megapixels per frame. */
  megapixels?: number;
  /** Output megapixels of an image (unit megapixel: image upscale). Default 1. */
  outMegapixels?: number;
  /** Mode id for usdByMode rates (e.g. upscale precise / creative). */
  mode?: string;
  /** Reference images the job's request really sends, per output (hosted rows with `refImages` add a per-reference surcharge). */
  refImages?: number;
  /** Create Image shape ("2:3"): token-billed rows (tokenImage: GPT Image) price the exact size it sends. Unknown = the costliest shape. */
  aspect?: string | null;
  /** UTF-8 bytes of the prompt (tokenImage rows bill prompt text; counted in steps of 500, a short prompt (500) when unknown). */
  promptBytes?: number | null;
}
/** Prompt bytes a job or quote carries: the prompt itself when present (submit, API quotes), else the bar's promptBytes (its quote sends the count). */
export const promptBytesFor = (input: Record<string, any> | null | undefined): number | undefined => { if (!input) return undefined;
  if (typeof input.prompt === 'string') return promptBytesOf(input.prompt); const n = Number(input.promptBytes); return input.promptBytes != null && input.promptBytes !== '' && Number.isFinite(n) && n >= 0 ? n : undefined; };
export interface PriceLine { label: string; factor: number }
export interface Price {
  /** Credits charged (0 when free). */
  credits: number;
  /** Estimated GPU seconds (charged amount when not free). */
  gpuSec: number;
  /** Same setup as a 480p draft. */
  draftCredits: number;
  free: boolean;
  quality: string;
  breakdown: PriceLine[];
  /** 'open-weights' = always 0; 'hosted' = HOSTED_PRICES entry. */
  basis?: 'open-weights' | 'hosted' | 'unavailable';
  hosted?: HostedPrice | null;
  /** D1: the row has no published price for this run, so it is quoted on an estimate ("About $X (estimate)"). */
  unconfirmed?: boolean;
  /** Hosted rows: the run's USD before rounding to whole credits (rate × units + references, × passes × count). The Comfy-credit figure is
   *  worked out from this (billing.ts comfyUnits), never from the cent-rounded credits. */
  exactUsd?: number;
}
/** Speech seconds a script is quoted at (rows with `speech`: no length field, billed on the real output). Slow on purpose → an "up to" figure.
 *  CJK characters take 3 UTF-8 bytes, so (bytes − chars) / 2 counts them (accented letters add 1 byte each and count a little slower: safe side).
 *  No script known → the billing cap. */
export function speechSeconds(sp: NonNullable<HostedPrice['speech']>, chars?: number, bytes?: number): number {
  const n = Number(chars); if (!(n > 0)) return sp.maxSec;
  const cjk = Math.max(0, Math.min(n, Math.floor(((Number(bytes) || n) - n) / 2)));
  return Math.min(sp.maxSec, Math.max(sp.minSec, Math.ceil((n - cjk) / sp.charsPerSec + cjk / sp.cjkCharsPerSec)));
}
/** The script a speech row bills on: none in a mode that is not a script (Seed Audio music / sound effects), so speechSeconds gives the billing cap.
 *  One rule for the quote and the charge (priceOf, routing/audioQuote.ts perUnitOf). */
export const scriptOf = (h: HostedPrice, mode: string | undefined, chars?: number, bytes?: number): { chars?: number; bytes?: number } =>
  (mode && h.speech?.capModes?.includes(mode) ? {} : { chars, bytes });
/** True when this run is quoted at a speech row's cap because its mode is not a script (Seed Audio music / sound effects). */
export const speechAtCap = (h: HostedPrice | undefined, mode: string | undefined) => !!(mode && h?.speech?.capModes?.includes(mode));
/** Units of a hosted price for this run. */
export function hostedQty(h: HostedPrice, dur: number, chars?: number, mp?: number, bytes?: number) {
  if (h.speech && h.unit === 'second') return speechSeconds(h.speech, chars, bytes);
  if (h.maxSec && (h.unit === 'second' || h.unit === 'minute')) dur = Math.min(dur, h.maxSec); // the body sends the same clamp (SFX: 30 s)
  switch (h.unit) { case 'megapixel': { const m = Math.max(0, mp ?? 1); return h.mpBlock ? Math.max(1, Math.ceil(Math.round((m / h.mpBlock) * 1e6) / 1e6)) : m; } case 'mp_second': return dur * Math.max(0, mp ?? 1); case 'second': return dur; case 'minute': return dur / 60; case '1k_chars': return Math.max(1, chars ?? 1000) / 1000; case '1k_bytes': return Math.max(1, bytes ?? chars ?? 1000) / 1000; default: return 1; }
}
/** PRICING OVERRIDE: open weights → 0 credits always; hosted → official price ($ → credits at 1 credit = $0.01, no markup). */
/** Output megapixels per frame for per-MP-second prices (video upscale outputSize), capped at BFL's ~14.4 MP. */
export const outputMegapixels = (input: Record<string, any>): number | undefined => input?.outputSize?.width && input?.outputSize?.height ? Math.min(14.4, (input.outputSize.width * input.outputSize.height) / 1e6) : undefined;
export const priceMode = (input: Record<string, any>): string | undefined => { let t = input?.types; if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = t.split(','); } } return (Array.isArray(t) ? t[0] : undefined) ?? input?.mode; };
/** Video upscale output size: source × scale, long side capped at maxLongSide, even numbers (same for the job and the price quote). */
export function upscaleOutputSize(width: number, height: number, scale: number, maxLongSide = 3840) {
  const k = Math.min(scale, maxLongSide / Math.max(width, height)); const ev = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: ev(width), height: ev(height), capped: k < scale };
}
/** Tools whose source video is itself a model input on hosted video-to-video routes (Seedance prices input video seconds). */
export const V2V_TOOLS = new Set(['object-swap', 'motion-transfer', 'restyle', 'reshoot', 'app-anime-restyle', 'make-it-real' /* Render: the mockup is the model's input video (Seedance bills it) */]);
/** D1: the per-unit rate a row with no published price is quoted at: its estimateUsd, else the dearest rate it lists (safe side), else null. */
export function estimateRate(h: HostedPrice): number | null {
  if (typeof h.estimateUsd === 'number' && h.estimateUsd > 0) return h.estimateUsd;
  const all = [h.usd, ...Object.values(h.usdByQuality ?? {}), ...Object.values(h.usdByResolution ?? {}), ...Object.values(h.usdByTier ?? {}), ...Object.values(h.usdByTierRes ?? {}), ...Object.values(h.usdByMode ?? {})]
    .filter((x): x is number => typeof x === 'number' && x > 0);
  return all.length ? Math.max(...all) : null;
}
export function priceOf(i: PriceInput): Price {
  const quality = i.draft ? '480p' : i.quality;
  const dur0 = i.durationSec && i.durationSec > 0 ? i.durationSec : DEFAULT_DURATION;
  const passes = Math.max(1, i.passes ?? 1);
  const count = Math.max(1, Math.floor(i.count ?? 1));
  const h0 = i.provider ? HOSTED_BY_ID[i.provider] : undefined;
  const h1: HostedPrice | undefined = h0 && i.audio && h0.audio ? ({ ...h0, ...h0.audio } as HostedPrice) : h0;
  // Video-to-video tools send the SOURCE clip to the model too (Seedance edit): its seconds are input video, like reference clips.
  const srcIn = V2V_TOOLS.has(i.toolId ?? '') ? dur0 : 0;
  const vinRaw = (i.refVideoSec ?? 0) + srcIn;
  const vin = vinRaw > 0 && h1?.videoInput ? Math.round(vinRaw * 100) / 100 : 0; // input-video seconds (source + references) billed as input tokens
  const h2: HostedPrice | undefined = vin && h1 ? ({ ...h1, model: `${h1.model.replace(/, no video input$/, '')}, with ${vin} s video input`, usd: h1.videoInput!.usd, usdByQuality: h1.videoInput!.usdByQuality } as HostedPrice) : h1;
  // Reference videos billed at the output rate (MiniMax H3): + whole seconds of min(total, cap), rounded up (quote ≥ charge).
  const rvAt = h2?.refVideoAtRate && (i.refVideoSec ?? 0) > 0 ? Math.ceil(Math.min(i.refVideoSec ?? 0, h2.refVideoAtRate.maxTotal) - 1e-9) : 0;
  const h: HostedPrice | undefined = rvAt && h2 ? ({ ...h2, model: `${h2.model}, with ${rvAt} s reference video` } as HostedPrice) : h2;
  if (!h) return { credits: 0, gpuSec: 0, draftCredits: 0, free: true, quality, breakdown: [{ label: 'Free on your computer', factor: 0 }], basis: 'open-weights', hosted: null };
  const dur = dur0 + vin + rvAt; // token formula: (input video s + output s) × W × H × fps ÷ 1024; H3: output s + reference-video s
  const imgRate = h.tokenImage ? gptImageUsd(h.tokenImage.family, i.tier ?? null, i.imageRes ?? '1K', i.aspect ?? null, i.promptBytes ?? null) /* GPT Image: exact size + prompt */
    : h.mpImage ? mpImageUsd(h.mpImage, i.aspect ?? null, i.imageRes ?? '1K') /* FLUX.2 on Comfy Router: started megapixels of the exact size sent for the shape */
    : (h.unit === 'image' || (h.unit === 'run' && h.usdByResolution)) /* a per-run price by output size (Image to layers) */ && (i.imageRes || i.tier) ? (i.mode && h.usdByMode?.[i.mode] != null && !h.usdByTierRes && !h.usdByResolution && !h.usdByTier ? h.usdByMode[i.mode] /* a per-mode image price (Luma UNI-1: generate / edit, 2026-10-25) */ : usdPerImage(h.providerId, (i.tier as Tier) ?? null, (i.imageRes as ImageRes) ?? '1K')) : undefined;
  const rate0 = (q: string) => imgRate !== undefined ? imgRate : (i.mode && h.usdByMode?.[i.mode] != null ? h.usdByMode[i.mode] : h.usdByQuality?.[q] ?? h.usd);
  // D1 (user decision 2026-10-28): no published price never blocks a run. It is quoted on the row's estimate (estimateUsd), else on its dearest
  // known rate (the safe side), shown as "About $X (estimate)"; the real cost is recorded after the run when the provider reports one.
  const est = estimateRate(h); const rate = (q: string) => rate0(q) ?? est;
  const unconfirmed = rate0(quality) == null && est != null;
  const mp = h.unit === 'mp_second' ? (i.megapixels ?? 1) : h.unit === 'megapixel' ? (i.outMegapixels ?? 1) : undefined;
  // Per-reference surcharge (per output request): max(0, refs sent − free) × the reference rate (by output resolution for images).
  const R = h.refImages; const billedRefs = R ? Math.max(0, Math.floor(i.refImages ?? 0) - R.free) : 0;
  const refRate = R && billedRefs ? (R.usdByResolution?.[((i.imageRes as ImageRes) ?? '1K') as '1K' | '2K' | '4K'] ?? R.usd) : 0; const refUsd = billedRefs * refRate;
  const toCredits = usdToCredits; // ONE rule for every hosted row: rounded UP per request (hostedPrices.ts usdToCredits), then × count; a quote is never below the real cost (the GPT rows' roundUp flag is now the default for all)
  const { chars: tChars, bytes: tBytes } = scriptOf(h, i.mode, i.chars, i.bytes); // Seed Audio music / sound effects: no script → the 120 s cap
  const at = (q: string) => { const r = rate(q); return r == null ? null : Math.max(1, toCredits((r * hostedQty(h, dur, tChars, mp, tBytes) + refUsd) * passes)) * count; };
  const credits = at(quality); const draftCredits = at('480p') ?? 0;
  if (credits == null) return { credits: 0, gpuSec: 0, draftCredits: 0, free: false, quality, breakdown: [{ label: `${h.model}: price unavailable`, factor: 0 }], basis: 'unavailable', hosted: h };
  const breakdown: PriceLine[] = [
    { label: `${h.model}: $${rate(quality)} ${h.mpBlock ? `per started ${h.mpBlock} MP of output` : unitInfo(h.unit).unitLabel}${unconfirmed ? ' (estimate: no published price yet)' : h.estimated ? ' (estimated)' : ''}`, factor: rate(quality)! },
    ...(h.unit === 'megapixel' && h.mpBlock ? [{ label: `× ${hostedQty(h, dur, tChars, mp, tBytes)} started block${hostedQty(h, dur, tChars, mp, tBytes) > 1 ? 's' : ''} of ${h.mpBlock} MP (${Math.round((mp ?? 1) * 100) / 100} MP out)`, factor: hostedQty(h, dur, tChars, mp, tBytes) }]
      : h.unit !== 'image' && h.unit !== 'run' ? [{ label: `× ${unitQty(h.unit, Math.round(hostedQty(h, dur, tChars, mp, tBytes) * 100) / 100)}`, factor: hostedQty(h, dur, tChars, mp, tBytes) }] : []),
    ...(h.tokenImage ? (() => { const g = gptImageQuote(h.tokenImage.family, i.tier ?? null, i.imageRes ?? '1K', i.aspect ?? null, i.promptBytes ?? null);
      return [{ label: `≈ ${g.size ?? 'largest shape'}: ~${g.outTokens} image tokens + ~${g.textTokens} prompt tokens (prompt counted as ${promptBucket(i.promptBytes)} bytes), with headroom`, factor: 1 }]; })() : []),
    ...(billedRefs ? [{ label: `+ ${billedRefs} reference image${billedRefs > 1 ? 's' : ''} × $${refRate}${R!.estimated ? ' (estimated)' : ''}`, factor: refRate }] : []),
    ...(passes > 1 ? [{ label: `${passes} passes`, factor: passes }] : []),
    ...(count > 1 ? [{ label: `× ${count} images`, factor: count }] : []),
    { label: '1 credit = $0.01', factor: 100 },
  ];
  const exactUsd = Math.round((rate(quality)! * hostedQty(h, dur, tChars, mp, tBytes) + refUsd) * passes * count * 1e8) / 1e8;
  return { credits: i.free ? 0 : credits, gpuSec: credits, draftCredits, free: !!i.free, quality, breakdown, basis: 'hosted', exactUsd, ...(unconfirmed ? { unconfirmed: true } : {}), hosted: { ...h, ...(unconfirmed ? { estimated: true } : {}), unitLabel: unitInfo(h.unit).unitLabel, unitHelp: unitInfo(h.unit).unitHelp } as HostedPrice };
}
/** Generate CTA: plain "Generate" while inputs are missing, "Generate · $0.42" once valid (dollars only, 2026-10-26; credits are 1 = $0.01). */
export const generateLabel = (price: Price | null, missing: number, base = 'Generate') =>
  missing > 0 || !price ? base : price.free || price.credits === 0 ? `${base} · Free` : `${base} · $${(price.credits / 100).toFixed(2)}`;
