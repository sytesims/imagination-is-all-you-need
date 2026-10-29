/**
 * Google Gemini API as a direct provider (batch 2, 2026-10-23): Nano Banana 2.1 / 2 / Pro as extra Run on places of their Comfy engines,
 * and Nano Banana 2 Lite as a new hosted-direct engine ('direct-gemini-nb2-lite').
 *
 * Endpoint: the Interactions API, the shape the image guide now leads with and the one in Google's own OpenAPI file
 * (https://ai.google.dev/static/api/interactions-v1.openapi.json, read 2026-10-23):
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions   header x-goog-api-key (never in the URL)
 *   { model, input: [{ type: 'text', text }, { type: 'image', mime_type, data }…], response_format: { type: 'image', aspect_ratio, image_size },
 *     generation_config: { seed }, store: false }
 * One sync call. The answer is an Interaction: status, steps[] (model_output steps hold content blocks { type: 'image', data, mime_type }),
 * usage { total_input_tokens, total_output_tokens, output_tokens_by_modality[{ modality, tokens }], total_thought_tokens }, errors[{ code, message }].
 * We leave out response_format.mime_type (the only value is image/jpeg) and delivery (inline is the default) and send store: false (no copy kept).
 * Errors: { error: { code (snake_case), message } } (https://ai.google.dev/gemini-api/docs/api-errors); the older generateContent shape
 * ({ error: { code: 400, status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }) is read too.
 * Models, sizes, aspect ratios and reference limits: https://ai.google.dev/gemini-api/docs/image-generation; prices:
 * https://ai.google.dev/gemini-api/docs/pricing (no free tier for any of these models). All read 2026-10-23.
 */
import { DirectError, registerDirectProvider, type DirectCost, type DirectOutput, type DirectReason, type DirectSpec } from './direct.js';
import { handOff } from '../mediaHandoff.js';
import { HOSTED_BY_ID, NB_THINK_TOKENS, NB_PROMPT_TOKENS, type HostedPrice } from '../shared/hostedPrices.js';
import { GEMINI_ASPECTS_10, GEMINI_ASPECTS_14 } from '../shared/imageCaps.js';
import type { RouteDef } from '../routing/types.js';

const D = '2026-10-23' as const;
export const GEMINI_ENV = 'OPENHIGGSFIELD_GEMINI_API_KEY';
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
export const GEMINI_URL = `${GEMINI_BASE}/v1beta/interactions`;
const GUIDE = 'https://ai.google.dev/gemini-api/docs/image-generation';
const PRICING = 'https://ai.google.dev/gemini-api/docs/pricing';

// ---- errors ----
/** Generation blocked codes (api-errors page, "Generation blocked codes") + no_image (a generation error: the model made no image). */
export const GEMINI_BLOCKED = ['safety', 'recitation', 'language', 'prohibited_content', 'spii', 'blocklist', 'image_safety', 'image_prohibited_content', 'image_recitation', 'image_other', 'content_blocked', 'no_image'];
const cut = (s: string) => s.slice(0, 300);
const lower = (x: unknown) => String(x ?? '').toLowerCase();
const BILLING = /billing|free tier|prepay|credits? (are )?depleted|limit: ?0\b|not available on the free tier|quota.*(billing|plan)/i;
const REGION = /location|region|country|not supported in your/i;
/** Google error JSON → DirectError. Pure: tests call it directly. */
export function geminiHttpError(status: number, j: any, text: string): DirectError {
  const e = j?.error ?? {}; const code = lower(typeof e.code === 'string' ? e.code : e.status); const msg = String(e.message ?? text ?? '');
  const reasons = (Array.isArray(e.details) ? e.details : []).map((d: any) => String(d?.reason ?? '')).join(' ');
  const err = (r: DirectReason, line?: string) => new DirectError(`Gemini ${status}: ${line ? `${line} ` : ''}(${cut(msg) || code || 'error'})`, r, status);
  if (GEMINI_BLOCKED.includes(code)) return err('content_blocked', 'Google blocked this request; change the prompt or images and try again.');
  if (status === 401 || status === 403 || code === 'authentication' || code === 'permission_denied' || /API_KEY_INVALID|API_KEY_EXPIRED/.test(reasons + ' ' + msg)) return err('key_invalid');
  if (status === 402 || code === 'payment_required') return err('provider_credits', 'Your Google prepay credits are used up; add credits in Google AI Studio.');
  if (status === 429) return BILLING.test(msg)
    ? err('provider_credits', 'Nano Banana has no free tier: turn on billing for this key\'s Google project (Google AI Studio → Billing).') : err('queue_full');
  if (code === 'failed_precondition') return BILLING.test(msg) ? err('provider_credits', 'Turn on billing for this key\'s Google project (Google AI Studio → Billing).')
    : REGION.test(msg) ? err('input_invalid', 'The Gemini API is not available in your region.') : err('input_invalid');
  if (status >= 500 || status === 499) return err('provider_error');
  if (status >= 400) return err('input_invalid');
  return err('provider_error');
}
/** Refusals and failures inside a 200: interaction status failed / cancelled, or errors[] with a generation blocked code. */
export function geminiBodyError(j: any): DirectError | null {
  const errs: any[] = Array.isArray(j?.errors) ? j.errors : []; const blocked = errs.find((x) => GEMINI_BLOCKED.includes(lower(x?.code)));
  if (blocked) return new DirectError(`Gemini: Google blocked this image (${cut(String(blocked.code))}${blocked.message ? `: ${cut(String(blocked.message))}` : ''})`, 'content_blocked');
  const st = lower(j?.status);
  if (st === 'failed' || st === 'cancelled') return new DirectError(`Gemini: the request ${st}${errs[0] ? ` (${cut(String(errs[0].code ?? ''))}: ${cut(String(errs[0].message ?? ''))})` : ''}`, 'provider_error');
  return null;
}

registerDirectProvider({ id: 'google', name: 'Google Gemini API', tag: 'Gemini', auth: (k) => ({ 'x-goog-api-key': k }), defaultBase: GEMINI_BASE, baseEnv: 'GEMINI_BASE_URL',
  pollMs: 2000 /* sync only: one call per image, no polling */, httpError: geminiHttpError, bodyError: geminiBodyError });

// ---- models ----
export type GeminiImageModel = 'gemini-nano-banana-2.1' | 'gemini-3.1-flash-image' | 'gemini-3-pro-image' | 'gemini-3.1-flash-lite-image';
type Res = '1K' | '2K' | '4K';
const TEN = [...GEMINI_ASPECTS_10]; const FOURTEEN = [...GEMINI_ASPECTS_14]; // one list with the bar and the Router body (shared/imageCaps.ts)
/** Per model (image guide tables): sizes we offer (512 px on Nano Banana 2 is not one of our sizes), aspect ratios, reference images
 *  (objects + characters + style; we can't tell them apart, so the cap is the documented total of 14), and the token rates (USD per 1M). */
export const GEMINI_MODELS: Record<GeminiImageModel, { name: string; res: Res[]; aspects: string[]; maxRefs: number; refsNote: string; rate: { input: number; text: number; image: number }; perImage: Partial<Record<Res, number>> }> = {
  'gemini-nano-banana-2.1': { name: 'Nano Banana 2.1', res: ['1K', '2K', '4K'], aspects: FOURTEEN, maxRefs: 14, refsNote: 'up to 10 objects + 4 characters', rate: { input: 1.5, text: 7.5, image: 30 }, perImage: { '1K': 0.0336, '2K': 0.0504, '4K': 0.113 } },
  'gemini-3.1-flash-image': { name: 'Nano Banana 2', res: ['1K', '2K', '4K'], aspects: FOURTEEN, maxRefs: 14, refsNote: 'up to 10 objects + 4 characters', rate: { input: 0.5, text: 3, image: 60 }, perImage: { '1K': 0.067, '2K': 0.101, '4K': 0.151 } },
  'gemini-3-pro-image': { name: 'Nano Banana Pro', res: ['1K', '2K', '4K'], aspects: TEN, maxRefs: 14, refsNote: 'up to 6 objects + 5 characters + 3 style', rate: { input: 2, text: 12, image: 120 }, perImage: { '1K': 0.134, '2K': 0.134, '4K': 0.24 } },
  'gemini-3.1-flash-lite-image': { name: 'Nano Banana 2 Lite', res: ['1K'], aspects: TEN, maxRefs: 14, refsNote: 'up to 14 objects', rate: { input: 0.25, text: 1.5, image: 30 }, perImage: { '1K': 0.0336 } },
};

// ---- request ----
type In = Record<string, any>;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff' };
const mimeOf = (p: string) => MIME[p.split('.').pop()!.toLowerCase()] ?? 'image/png';
const modeOf = (i: In) => String((Array.isArray(i.types) ? i.types[0] : typeof i.types === 'string' ? i.types.replace(/[[\]"\s]/g, '').split(',')[0] : null) ?? i.mode ?? 'generate');
const promptOf = (i: In) => String(i.hostedPrompt ?? i.finalPrompt ?? i.prompt ?? '');
/** Reference images the request sends: none on a prompt-only job; the photo + more refs on an edit. */
export const geminiRefs = (i: In): string[] => (modeOf(i) === 'generate' ? [] : (Array.isArray(i.refPaths) && i.refPaths.length ? i.refPaths : i.imagePath ? [i.imagePath] : [])).filter((x: unknown): x is string => typeof x === 'string');
const ratio = (a: string) => { const [x, y] = a.split(':').map(Number); return x / y; };
/** Our aspect → the model's list (nearest by ratio); Auto / none → left out (the model picks, or follows the photo on an edit). */
export const geminiAspect = (model: GeminiImageModel, aspect?: string | null): string | undefined => {
  if (!aspect || aspect === 'auto' || !/^\d+:\d+$/.test(aspect)) return undefined; const list = GEMINI_MODELS[model].aspects; if (list.includes(aspect)) return aspect; const t = ratio(aspect);
  return list.reduce((b, a) => (Math.abs(Math.log(ratio(a) / t)) < Math.abs(Math.log(ratio(b) / t)) ? a : b), list[0]); };
/** Our 1K / 2K / 4K → image_size (uppercase K, as the docs require); anything else → 1K. */
export const geminiSize = (model: GeminiImageModel, res?: string): Res => { const r = String(res ?? '1K').toUpperCase() as Res; return GEMINI_MODELS[model].res.includes(r) ? r : '1K'; };
/** Interactions body for one image. Pure apart from reading the reference files. */
export async function geminiImageBody(model: GeminiImageModel, i: In) {
  const refs = geminiRefs(i).slice(0, GEMINI_MODELS[model].maxRefs);
  const aspect = i.aspectAuto === true && refs.length ? undefined /* an edit on Match photo: the result keeps the photo's shape */ : geminiAspect(model, i.aspect);
  const input: any[] = [{ type: 'text', text: promptOf(i) }, ...(await Promise.all(refs.map(async (p) => ({ type: 'image', mime_type: mimeOf(p), data: await handOff(p, 'image', 'google', { accepts: ['base64'] }) }))))];
  return { model, input, response_format: { type: 'image', ...(aspect ? { aspect_ratio: aspect } : {}), image_size: geminiSize(model, i.imageResolution) },
    ...(Number.isInteger(i.seed) ? { generation_config: { seed: Math.abs(i.seed) % 2147483648 } } : {}), store: false };
}

// ---- response ----
/** Image blocks of the model's output steps (thought steps carry interim images: not ours). The last one is the answer (the SDK's output_image). */
export function parseGeminiInteraction(j: any): { outputs: DirectOutput[]; id: string | null; text: string } {
  const steps: any[] = Array.isArray(j?.steps) ? j.steps : []; const blocks = steps.filter((s) => s?.type === 'model_output').flatMap((s) => (Array.isArray(s.content) ? s.content : []));
  const imgs = blocks.filter((c) => c?.type === 'image' && typeof c.data === 'string' && c.data);
  if (!imgs.length && typeof j?.output_image?.data === 'string') imgs.push({ data: j.output_image.data, mime_type: j.output_image.mime_type });
  const last = imgs.at(-1); const text = blocks.filter((c) => c?.type === 'text').map((c) => String(c.text ?? '')).join(' ').trim();
  return { outputs: last ? [{ b64: last.data, mime: last.mime_type ?? 'image/jpeg' }] : [], id: j?.id ? String(j.id) : null, text };
}
/** Real cost from usage: image output tokens × the image rate + other output and thinking tokens × the text rate + input tokens × the input rate. */
export function geminiCost(model: GeminiImageModel, j: any): DirectCost | null {
  const u = j?.usage; if (!u) return null; const r = GEMINI_MODELS[model].rate;
  const img = Number((Array.isArray(u.output_tokens_by_modality) ? u.output_tokens_by_modality : []).find((m: any) => lower(m?.modality) === 'image')?.tokens) || 0;
  if (!(img > 0)) return null;
  const other = Math.max(0, (Number(u.total_output_tokens) || 0) - img) + (Number(u.total_thought_tokens) || 0); const input = Number(u.total_input_tokens) || 0;
  const usd = (img * r.image + other * r.text + input * r.input) / 1e6;
  return { usd: Math.round(usd * 1e6) / 1e6, units: img, unitLabel: 'image tokens', settled: true, source: 'gemini:usage' };
}
export const geminiSpec = (model: GeminiImageModel): DirectSpec => ({ provider: 'google', mode: 'sync', perOutput: true,
  build: async (job) => ({ method: 'POST', url: GEMINI_URL, headers: {}, body: await geminiImageBody(model, job.input) }),
  sync: (j) => { const r = parseGeminiInteraction(j);
    if (!r.outputs.length) throw new DirectError(`Gemini: no image came back${lower(j?.status) === 'incomplete' ? ' (incomplete)' : ''}${r.text ? ` (${cut(r.text)})` : ''}; Google usually does this when it holds an image back`, 'content_blocked');
    return { outputs: r.outputs, id: r.id }; },
  cost: (j) => geminiCost(model, j) });

// ---- routes ----
const ENGINE: Record<GeminiImageModel, string> = { 'gemini-nano-banana-2.1': 'api-nano-banana-21', 'gemini-3.1-flash-image': 'api-nano-banana', 'gemini-3-pro-image': 'api-nano-banana-pro', 'gemini-3.1-flash-lite-image': 'direct-gemini-nb2-lite' };
export const GEMINI_LITE_ENGINE = 'direct-gemini-nb2-lite';
const endpoint = (model: GeminiImageModel) => `POST ${GEMINI_URL} (model ${model}, x-goog-api-key; text + inline images in, base64 image out)`;
/** Why this job can't run on this model's Gemini API route (null = fine). */
export const geminiUnavailable = (model: GeminiImageModel) => (i: In): string | null => { const m = GEMINI_MODELS[model]; const mode = modeOf(i); const n = geminiRefs(i).length;
  if (mode === 'inpaint') return `${m.name} on the Gemini API takes no mask; use Edit with a prompt instead`;
  if (mode === 'edit' && !n) return 'Needs at least one reference image';
  if (n > m.maxRefs) return `${m.name} takes up to ${m.maxRefs} reference images (${m.refsNote}); you added ${n}`;
  const res = String(i.imageResolution ?? '1K').toUpperCase(); if (!m.res.includes(res as Res)) return `${m.name} on the Gemini API makes ${m.res.join(' / ')} images`;
  return null; };
const common = (model: GeminiImageModel): Partial<RouteDef> => ({ vendor: 'google', label: `${GEMINI_MODELS[model].name} via Gemini API`, endpoint: endpoint(model), sourceUrl: GUIDE, checkedAt: D,
  output: 'image', modes: ['generate', 'edit'], typicalLatencySec: model === 'gemini-3-pro-image' ? 40 : 20, direct: geminiSpec(model), unavailableFor: geminiUnavailable(model),
  caps: { resolutions: GEMINI_MODELS[model].res, maxRefs: GEMINI_MODELS[model].maxRefs, aspects: GEMINI_MODELS[model].aspects },
  ...(model === 'gemini-3-pro-image' ? { refsPriced: (i: In) => Math.min(GEMINI_MODELS[model].maxRefs, geminiRefs(i).length) } : {}) });
const route = (model: GeminiImageModel): RouteDef => ({ routeId: `direct:google/${model}`, kind: 'direct', modelId: ENGINE[model], priceRef: `direct:google/${model}`, envKey: GEMINI_ENV,
  latencyEstimated: true, latencySource: 'estimated: Google publishes no latency; recorded per run', typicalLatencySec: 20, endpoint: '', sourceUrl: GUIDE, checkedAt: D, label: '', ...common(model) } as RouteDef);
/** Extra Run on places of the Comfy Nano Banana engines (merged like DIRECT_ROUTES). */
export const GEMINI_ROUTES: Record<string, RouteDef[]> = {
  'api-nano-banana-21': [route('gemini-nano-banana-2.1')],
  'api-nano-banana': [route('gemini-3.1-flash-image')],
  'api-nano-banana-pro': [route('gemini-3-pro-image')],
};
/** Native route fields of the hosted-direct Nano Banana 2 Lite engine (merged like NATIVE_DIRECT; priceRef = the engine id). */
export const GEMINI_NATIVE: Record<string, Partial<RouteDef>> = {
  [GEMINI_LITE_ENGINE]: { ...common('gemini-3.1-flash-lite-image'), latencyEstimated: true, latencySource: 'estimated: Google publishes no latency; recorded per run' },
};

// ---- prices (quote = charge: these rows; the recorded cost comes from usage) ----
/** Per image: Google's per-image price + the same thinking / prompt allowance as the Comfy Router rows (shared/hostedPrices.ts NB_THINK_TOKENS):
 *  Gemini 3 image models always think, billed at the text rate, so the image price alone under-quotes. */
export const geminiQuoteUsd = (model: GeminiImageModel, res: Res): number | null => { const m = GEMINI_MODELS[model]; const p = m.perImage[res]; if (p == null) return null;
  return Math.round((p + (NB_THINK_TOKENS * m.rate.text + NB_PROMPT_TOKENS * m.rate.input) / 1e6) * 1e5) / 1e5; };
const row = (providerId: string, model: GeminiImageModel, note: string, extra: Partial<HostedPrice> = {}): HostedPrice => {
  const p = Object.fromEntries(GEMINI_MODELS[model].res.map((r) => [r, geminiQuoteUsd(model, r)!])) as Partial<Record<Res, number>>;
  return { providerId, model: `${GEMINI_MODELS[model].name} (Gemini API, ${model})`, unit: 'image', usd: p['1K']!, usdByResolution: p, sourceUrl: PRICING, checkedAt: D, estimated: true, note, ...extra }; };
export const GEMINI_PRICES: HostedPrice[] = [
  row('direct:google/gemini-nano-banana-2.1', 'gemini-nano-banana-2.1', 'Standard tier: $0.0336 / $0.0504 / $0.113 per 1K / 2K / 4K image ($30 per 1M image tokens). The quote adds 2,000 thinking tokens ($7.50 / 1M) and 2,500 prompt tokens ($1.50 / 1M); the recorded cost reads the real counts from usage. No free tier.'),
  row('direct:google/gemini-3.1-flash-image', 'gemini-3.1-flash-image', 'Standard tier: $0.067 / $0.101 / $0.151 per 1K / 2K / 4K image ($60 per 1M image tokens). The quote adds 2,000 thinking tokens ($3 / 1M) and 2,500 prompt tokens ($0.50 / 1M); the recorded cost reads the real counts from usage. No free tier.'),
  row('direct:google/gemini-3-pro-image', 'gemini-3-pro-image', 'Standard tier: $0.134 per 1K / 2K image, $0.24 per 4K ($120 per 1M image tokens). The quote adds 2,000 thinking tokens ($12 / 1M) and 2,500 prompt tokens ($2 / 1M); the recorded cost reads the real counts from usage. No free tier.',
    { refImages: { usd: 0.0011, free: 0, sourceUrl: PRICING, checkedAt: D, estimated: false, note: 'Input: $2 per 1M tokens, "$0.0011 per image" (560 tokens per input image).' } }),
  row(GEMINI_LITE_ENGINE, 'gemini-3.1-flash-lite-image', 'Standard tier: $0.0336 per 1K image ($30 per 1M image tokens); 1K only. The quote adds 2,000 thinking tokens ($1.50 / 1M) and 2,500 prompt tokens ($0.25 / 1M). No free tier.'),
];
// Added to the shared price map like routing/routePrices.ts (additive: a row already there wins).
for (const p of GEMINI_PRICES) if (!HOSTED_BY_ID[p.providerId]) HOSTED_BY_ID[p.providerId] = p;
