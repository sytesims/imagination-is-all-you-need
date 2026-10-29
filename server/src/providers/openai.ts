/**
 * OpenAI Images API as a direct provider (batch 2, 2026-10-23): GPT Image 2, GPT Image 2.5 Flare and GPT Image 2.5 Sunburst as extra
 * "Run on" places of the existing models (api-gpt-image*), next to Comfy Router.
 *
 *   generate  POST https://api.openai.com/v1/images/generations   JSON { model, prompt, n: 1, quality, size, output_format: 'png' }
 *   edit      POST https://api.openai.com/v1/images/edits         multipart: model, prompt, image[] (1–16 files), mask (inpaint: PNG with alpha,
 *                                                                  same size as the FIRST image), n, quality, size, output_format
 * Both are one sync call; GPT image models always answer base64 (data[].b64_json). usage (input text / image tokens, output tokens) is
 * recorded as the real cost; the price row below is what we quote and charge.
 *
 * Docs read 2026-10-23:
 *   https://developers.openai.com/api/docs/guides/image-generation  (sizes, quality, mask, curl examples with image[] and mask)
 *   https://developers.openai.com/api/reference/cli/resources/images/methods/edit/index.md  (model enum, ≤16 images, ≤50 MB each, n 1–10)
 *   https://developers.openai.com/api/docs/pricing  ($5 text in / $8 image in / $30 image out per 1M, same for all three models)
 *   https://developers.openai.com/api/docs/guides/error-codes  (401, 403 region, 429 billing codes vs rate limits, 500, 503)
 * Size rules (all three models take custom sizes): both edges multiples of 16, long:short ≤ 3:1, longest edge ≤ 3840, 655,360–8,294,400 pixels;
 * above 2560×1440 is "experimental".
 */
import { handOffBytes } from '../mediaHandoff.js';
import { gptMaskBytes } from '../gptMask.js';
import path from 'node:path';
import { DirectError, registerDirectProvider, type DirectCost, type DirectOutput, type DirectSpec, type DirectReason } from './direct.js';
import type { HttpRequest } from '../hostedRequests.js';
import type { RouteDef } from '../routing/types.js';
import { HOSTED_BY_ID, gptImageTokens, type HostedPrice } from '../shared/hostedPrices.js';
import { type ImageRes, type Tier } from '../shared/imageCaps.js';
import { GPT_IMAGE_ASPECTS, GPT_SIZE_RULES, gptImageSize, gptWH, gptAspectMessage } from '../shared/gptImageSizes.js';

const D = '2026-10-23';
const BASE = 'https://api.openai.com';
const GUIDE = 'https://developers.openai.com/api/docs/guides/image-generation';
const REF = 'https://developers.openai.com/api/reference/cli/resources/images/methods/edit/index.md';
const PRICING = 'https://developers.openai.com/api/docs/pricing';
export const OPENAI_ENV = 'OPENHIGGSFIELD_OPENAI_API_KEY';
/** Per 1M tokens, the same for gpt-image-2, gpt-image-2.5-flare and gpt-image-2.5-sunburst (pricing page, 2026-10-23). */
export const OPENAI_RATES = { textIn: 5, imageIn: 8, imageOut: 30 };
export const OPENAI_MAX_REFS = 16;
export type OpenAIImageModel = 'gpt-image-2' | 'gpt-image-2.5-flare' | 'gpt-image-2.5-sunburst';

// ---- errors ----
const cut = (s: string) => s.slice(0, 300);
const BILLING = /^(insufficient_quota|billing_hard_limit_reached|credit_balance_exhausted|organization_spend_limit_exceeded|project_spend_limit_exceeded|organization_usage_limit_exceeded)$/;
const VERIFY = /must be verified|organi[sz]ation verification|verify (your|the) organi[sz]ation/i;
export const OPENAI_VERIFY_MESSAGE = 'OpenAI: this model needs a verified organization. Verify it at platform.openai.com/settings/organization/general, then try again.';
/** OpenAI error → DirectError. Body shape: { error: { message, type, param, code } }. */
export function openaiError(status: number, json: any, text: string): DirectError {
  const e = json?.error ?? {}; const code = String(e.code ?? ''); const type = String(e.type ?? ''); const msg = String(e.message ?? text ?? '');
  const r = (reason: DirectReason, m = `OpenAI ${status}: ${cut(msg)}`) => new DirectError(m, reason, status);
  if (VERIFY.test(msg)) return r('key_invalid', OPENAI_VERIFY_MESSAGE);
  if (status === 401 || status === 403) return r('key_invalid');
  if (status === 429) return BILLING.test(code) || BILLING.test(type) ? r('provider_credits') : r('queue_full');
  if (status === 400 && (/^(moderation_blocked|content_policy_violation)$/.test(code) || /safety system/i.test(msg))) return r('content_blocked');
  if (status === 400 || status === 404 || status === 413 || status === 415 || status === 422) return r('input_invalid');
  return r('provider_error');
}
registerDirectProvider({ id: 'openai', name: 'OpenAI', tag: 'OpenAI', auth: (key) => ({ Authorization: `Bearer ${key}` }), defaultBase: BASE, baseEnv: 'OPENAI_BASE_URL', pollMs: 2000, httpError: openaiError });

// ---- sizes ----
/** One size table for every GPT Image route (shared/gptImageSizes.ts): the shape × 1K / 2K / 4K the bar offers → the exact WIDTHxHEIGHT sent. */
export const OPENAI_SIZE_RULES = GPT_SIZE_RULES;
/** Our aspect × resolution → the exact size (no shape = 1:1); null when we don't offer that shape. */
export function openaiSize(aspect: string | null | undefined, res: ImageRes): { width: number; height: number } | null {
  const s = gptImageSize(aspect && aspect !== 'auto' ? aspect : '1:1', res); return s ? gptWH(s) : null; }
/** The size field: always an exact WxH from the table (never "auto", never snapped). */
export const openaiSizeField = (aspect: string | null | undefined, res: ImageRes) => { const s = openaiSize(aspect, res); if (!s) throw new Error(gptAspectMessage(String(aspect))); return `${s.width}x${s.height}`; };

// ---- job input ----
type In = Record<string, any>;
const modeOf = (i: In) => { const t = Array.isArray(i.types) ? i.types[0] : typeof i.types === 'string' ? i.types.split(',')[0] : null; return String(t ?? i.mode ?? 'generate').trim(); };
/** The images an edit / inpaint job sends (a prompt-only job sends none). */
export const openaiRefs = (i: In): string[] => (modeOf(i) === 'generate' ? [] : (Array.isArray(i.refPaths) && i.refPaths.length ? i.refPaths : i.imagePath ? [i.imagePath] : [])).filter((x: unknown): x is string => typeof x === 'string');
const promptOf = (i: In) => String(i.hostedPrompt ?? i.finalPrompt ?? i.prompt ?? '');
const resOf = (i: In): ImageRes => (['1K', '2K', '4K'].includes(i.imageResolution) ? i.imageResolution : '1K');
const tierOf = (i: In): Tier => { const q = String(i.tier ?? i.quality ?? 'med'); return /^(high|hd)$/i.test(q) ? 'high' : /^low$/i.test(q) ? 'low' : 'med'; };
const quality = (t: Tier) => (t === 'med' ? 'medium' : t);
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const mimeOf = (p: string) => MIME[path.extname(p).toLowerCase()] ?? 'image/png';

// ---- request builders (pure apart from reading the files) ----
export interface OpenAIImageArgs { model: OpenAIImageModel; prompt: string; tier: Tier; size: string }
/** POST /v1/images/generations (JSON). background / moderation stay at their defaults (auto). */
export const openaiGenerateRequest = (a: OpenAIImageArgs): HttpRequest => ({ method: 'POST', url: `${BASE}/v1/images/generations`, headers: {},
  body: { model: a.model, prompt: a.prompt, n: 1, quality: quality(a.tier), size: a.size, output_format: 'png' } });
/** POST /v1/images/edits (multipart): one `image[]` part per image, `mask` (PNG) for the first image. */
export const openaiEditRequest = (a: OpenAIImageArgs & { images: { name: string; data: Uint8Array<ArrayBuffer>; mime: string }[]; mask?: { name: string; data: Uint8Array<ArrayBuffer> } }): HttpRequest => {
  const f = new FormData(); f.append('model', a.model); f.append('prompt', a.prompt);
  for (const im of a.images.slice(0, OPENAI_MAX_REFS)) f.append('image[]', new Blob([im.data], { type: im.mime }), im.name);
  if (a.mask) f.append('mask', new Blob([a.mask.data], { type: 'image/png' }), a.mask.name);
  f.append('n', '1'); f.append('quality', quality(a.tier)); f.append('size', a.size); f.append('output_format', 'png');
  return { method: 'POST', url: `${BASE}/v1/images/edits`, headers: {}, form: f };
};
/** Job → request: images → edit, else generate; the mask only on inpaint with an image. */
export async function openaiRequest(model: OpenAIImageModel, i: In): Promise<HttpRequest> {
  const refs = openaiRefs(i).slice(0, OPENAI_MAX_REFS); const a = { model, prompt: promptOf(i), tier: tierOf(i), size: openaiSizeField(i.aspect, resOf(i)) };
  const mask = modeOf(i) === 'inpaint' ? { name: 'mask.png', data: new Uint8Array(await gptMaskBytes(i.maskPath, refs[0], 'openai')) } : undefined;
  if (!refs.length) return openaiGenerateRequest(a);
  const images = await Promise.all(refs.map(async (p) => ({ name: path.basename(p), data: new Uint8Array(await handOffBytes(p, 'image', 'openai')), mime: mimeOf(p) })));
  return openaiEditRequest({ ...a, images, mask });
}

// ---- response + real cost ----
export const parseOpenaiImages = (j: any): { outputs: DirectOutput[] } => ({ outputs: (j?.data ?? []).filter((d: any) => typeof d?.b64_json === 'string' && d.b64_json)
  .map((d: any) => ({ b64: d.b64_json, mime: `image/${j?.output_format === 'jpeg' ? 'jpeg' : j?.output_format === 'webp' ? 'webp' : 'png'}` })) });
/** usage → $: text in × $5, image in × $8, output × $30 per 1M. */
export function openaiCost(j: any): DirectCost | null {
  const u = j?.usage; if (!u) return null; const out = Number(u.output_tokens) || 0; const d = u.input_tokens_details ?? {};
  const text = Number(d.text_tokens) || 0; const img = Number(d.image_tokens) || 0; const rest = d.text_tokens == null && d.image_tokens == null ? Number(u.input_tokens) || 0 : 0;
  if (!(out > 0)) return null;
  const usd = ((text + rest) * OPENAI_RATES.textIn + img * OPENAI_RATES.imageIn + out * OPENAI_RATES.imageOut) / 1e6;
  return { usd: Math.round(usd * 1e6) / 1e6, units: out, unitLabel: 'tokens', settled: true, source: 'openai:usage' };
}
export const openaiSpec = (model: OpenAIImageModel): DirectSpec => ({ provider: 'openai', mode: 'sync', perOutput: true,
  build: async (job) => openaiRequest(model, job.input),
  sync: (j) => parseOpenaiImages(j),
  cost: (j) => openaiCost(j) });

// ---- prices: quote = charge (OpenAI's output-token formula at the largest-token size we send per resolution × $30 / 1M) ----
const ENGINES: { engine: string; model: OpenAIImageModel; name: string; formula: 'gpt-image-2' | 'gpt-image-2.5' }[] = [
  { engine: 'api-gpt-image', model: 'gpt-image-2', name: 'GPT Image 2', formula: 'gpt-image-2' },
  { engine: 'api-gpt-image-25-flare', model: 'gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare', formula: 'gpt-image-2.5' },
  { engine: 'api-gpt-image-25-sunburst', model: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', formula: 'gpt-image-2.5' },
];
export const OPENAI_RESOLUTIONS: ImageRes[] = ['1K', '2K', '4K'];
const TIERS: Tier[] = ['low', 'med', 'high'];
/** Every size a job at this resolution can send (one per shape). */
export const sizesFor = (res: ImageRes) => GPT_IMAGE_ASPECTS.map((a) => openaiSize(a, res)!);
/** The most output tokens any size at this resolution can use (never under-quote). */
export const maxOutputTokens = (formula: 'gpt-image-2' | 'gpt-image-2.5', tier: Tier, res: ImageRes) => Math.max(...sizesFor(res).map((s) => gptImageTokens(formula, quality(tier), s.width, s.height)));
/** Prompt text allowance per image: 500 text tokens × $5 / 1M (a long prompt; most are far shorter). */
export const TEXT_ALLOWANCE_USD = (500 * OPENAI_RATES.textIn) / 1e6;
/** Input tokens per reference image assumed: ~1,219 (the count behind Comfy's gpt-image-2 example, 2.47 credits at 2025.6 / 1M; = GPT_REF_TOKENS in hostedPrices.ts). */
export const REF_TOKENS = Math.round((2.47 / 2025.6) * 1e6);
const usd5 = (x: number) => Math.round(x * 1e5) / 1e5;
export const openaiImageUsd = (formula: 'gpt-image-2' | 'gpt-image-2.5', tier: Tier, res: ImageRes) => usd5((maxOutputTokens(formula, tier, res) * OPENAI_RATES.imageOut) / 1e6 + TEXT_ALLOWANCE_USD);
const routeIdOf = (model: OpenAIImageModel) => `direct:openai/${model}`;
export const OPENAI_PRICES: HostedPrice[] = ENGINES.map(({ model, name, formula }) => {
  const usdByTierRes = Object.fromEntries(TIERS.flatMap((t) => OPENAI_RESOLUTIONS.map((r) => [`${t}:${r}`, openaiImageUsd(formula, t, r)])));
  return { providerId: routeIdOf(model), model: `${model} (OpenAI API)`, unit: 'image', usd: usdByTierRes['low:1K'] /* bare quote (no tier) = low, like the Comfy rows */, usdByTierRes, sourceUrl: PRICING, checkedAt: D, estimated: true,
    detailSourceUrl: `${GUIDE}#calculating-costs`, detailCheckedAt: D,
    refImages: { usd: usd5((REF_TOKENS * OPENAI_RATES.imageIn) / 1e6), free: 0, sourceUrl: PRICING, checkedAt: D, estimated: true,
      note: `Image input $8 / 1M tokens; ~${REF_TOKENS} tokens per reference assumed (OpenAI publishes no per-image input count${model === 'gpt-image-2' ? '; gpt-image-2 always reads inputs at high fidelity, so large references may use more' : ''}).` },
    note: `Token-billed: image output $30 / 1M. Per image = OpenAI's output-token formula (${formula} base low/medium/high) at the largest-token size we send for that resolution × $30 / 1M, plus a 500-token prompt allowance ($0.0025). The usage in each answer is recorded as the real cost. 2K / 4K are above 2560×1440 ("experimental" on OpenAI's guide).` };
});
for (const p of OPENAI_PRICES) if (!HOSTED_BY_ID[p.providerId]) HOSTED_BY_ID[p.providerId] = p;

// ---- routes: one per engine, generate / edit / inpaint (the endpoint follows whether images are attached) ----
export const openaiUnavailable = (i: In): string | null => {
  const n = openaiRefs(i).length; const m = modeOf(i);
  if (n > OPENAI_MAX_REFS) return `OpenAI takes up to ${OPENAI_MAX_REFS} images; you added ${n}`;
  if ((m === 'edit' || m === 'inpaint') && !n) return 'Needs at least one image';
  if (m === 'inpaint' && !i.maskPath) return 'Draw needs a mask';
  if (i.imageResolution && !OPENAI_RESOLUTIONS.includes(i.imageResolution)) return `OpenAI makes ${OPENAI_RESOLUTIONS.join(' / ')} images`;
  if (typeof i.aspect === 'string' && i.aspect && i.aspect !== 'auto' && !openaiSize(i.aspect, resOf(i))) return gptAspectMessage(i.aspect);
  return null;
};
const route = ({ engine, model, name }: (typeof ENGINES)[number]): RouteDef => ({ routeId: routeIdOf(model), kind: 'direct', modelId: engine, priceRef: routeIdOf(model), checkedAt: D,
  vendor: 'openai', envKey: OPENAI_ENV, output: 'image', modes: ['generate', 'edit', 'inpaint'], label: `${name} via OpenAI API`,
  endpoint: `POST https://api.openai.com/v1/images/generations (JSON) or /v1/images/edits (multipart image[] ≤${OPENAI_MAX_REFS}, mask) · model ${model}, Bearer, b64_json`,
  sourceUrl: GUIDE, typicalLatencySec: 60, latencyEstimated: true, latencySource: 'estimated: OpenAI publishes no latency; recorded per run',
  caps: { resolutions: OPENAI_RESOLUTIONS, maxRefs: OPENAI_MAX_REFS, mask: true }, direct: openaiSpec(model), refsPriced: (i) => Math.min(OPENAI_MAX_REFS, openaiRefs(i).length),
  unavailableFor: openaiUnavailable });
export const OPENAI_ROUTES: Record<string, RouteDef[]> = Object.fromEntries(ENGINES.map((e) => [e.engine, [route(e)]]));
export const OPENAI_DOCS = { guide: GUIDE, reference: REF, pricing: PRICING };
