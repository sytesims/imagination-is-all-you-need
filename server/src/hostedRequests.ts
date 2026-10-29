/**
 * Request builders for hosted providers (pure: nothing here makes a network call; providers/direct.ts sends the direct ones).
 * - Partner nodes: the Comfy API-format node a workflow would carry (`{class_type, inputs}`), dynamic-combo
 *   sub-inputs keyed `model.<field>` as ComfyUI expects.
 * - Comfy Router: provider/model ids + partner-native body, routed through routerPlan() (comfyRouter.ts).
 * - Direct vendor fallbacks (no Comfy node): MiniMax T2A v2, Alibaba Model Studio Qwen TTS, BFL FLUX.2 [flex].
 * Contract tests: readiness/contracts/run.ts (npm run contracts:test). Sources in each builder's comment.
 */
import { routerPlan, type RouterPlan } from './comfyRouter.js';

/** A prompt over a route's cap is refused, never cut (prompt grammar #9): routing/select.ts refuses it at quote / submit, this guards the body. */
const capped = (t: string, max: number, name: string) => { if (t.length > max) throw new Error(`${name} takes prompts up to ${max.toLocaleString('en-US')} characters; yours is ${t.length.toLocaleString('en-US')}`); return t; };
export interface GenInput {
  prompt?: string; negativePrompt?: string; seed?: number; aspectRatio?: string; width?: number; height?: number;
  /** Create Image quality tier as asked (low | med | high; synonyms medium). GPT Image sends it as model.quality (B6: no longer hard-coded low). */ quality?: string;
  resolution?: string; duration?: number; n?: number; text?: string; /** Song lyrics (every music model reads this one field; `text` = old alias) */ lyrics?: string; voice?: string; images?: string[]; model?: string; idempotencyKey?: string; /** Voice Studio engine-native params (tools/voice/voiceControls.ts) */ native?: Record<string, any>;
}
export type ApiNode = { class_type: string; inputs: Record<string, unknown> };
export type ApiPrompt = Record<string, ApiNode>;

const U31 = 2147483647, U32 = 4294967295;
/** Our seeds are random 0..2^53; each node caps them differently, so fold into the node's range (deterministic). */
const seedIn = (s: number | undefined, max: number, dflt = 0) => (s == null ? dflt : Number(BigInt(Math.trunc(Math.abs(s))) % BigInt(max + 1)));
/** Pick the allowed aspect ratio closest to the requested one. */
function nearestRatio(want: string | undefined, allowed: string[], sep = ':'): string {
  const r = (x: string) => { const [a, b] = x.split(sep).map(Number); return a / b; };
  if (!want || want === 'auto') return allowed[0];
  if (allowed.includes(want.replace(':', sep))) return want.replace(':', sep);
  const t = r(want.replace(sep, ':').replace(':', sep));
  return allowed.filter((a) => /\d/.test(a)).reduce((best, a) => (Math.abs(Math.log(r(a) / t)) < Math.abs(Math.log(r(best) / t)) ? a : best), allowed.find((a) => /\d/.test(a))!);
}
const dims = (i: GenInput, d = 1024) => ({ w: i.width ?? d, h: i.height ?? d });
const snap = (v: number, step: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v / step) * step));
const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
const node = (class_type: string, inputs: Record<string, unknown>): ApiNode => ({ class_type, inputs });

/** B6: GPT Image follows the requested quality (low / medium / high); the price follows the same tier (shared/hostedPrices.ts api-gpt-image usdByTier). */
export const gptQuality = (q?: string) => (/^(high|hd)$/i.test(q ?? '') ? 'high' : /^(med|medium|standard)$/i.test(q ?? '') ? 'medium' : 'low');
/** One builder per partner node (input names from docs.comfy.org/built-in-nodes/<Node>; validated against object_info in the contract test). */
export const PARTNER_NODES: Record<string, (i: GenInput) => ApiPrompt> = {
  Flux2ImageNode: (i) => { const { w, h } = dims(i); return { 1: node('Flux2ImageNode', { prompt: i.prompt ?? '', model: i.model ?? 'Flux.2 [pro]', 'model.width': snap(w, 32, 256, 2048), 'model.height': snap(h, 32, 256, 2048), seed: seedIn(i.seed, Number.MAX_SAFE_INTEGER) }) }; },
  OpenAIGPTImageNodeV2: (i) => ({ 1: node('OpenAIGPTImageNodeV2', { prompt: i.prompt ?? '', model: i.model ?? 'gpt-image-2', 'model.size': 'auto', 'model.custom_width': 1024, 'model.custom_height': 1024, 'model.background': 'auto', 'model.quality': gptQuality(i.quality), n: Math.min(8, i.n ?? 1), seed: seedIn(i.seed, U31) }) }),
  GeminiNanoBanana2: (i) => ({ 1: node('GeminiNanoBanana2', { prompt: i.prompt ?? '', model: 'Nano Banana 2 (Gemini 3.1 Flash Image)', seed: seedIn(i.seed, Number.MAX_SAFE_INTEGER, 42), aspect_ratio: nearestRatio(i.aspectRatio, ['auto', ...RATIOS]), resolution: i.resolution ?? '1K', response_modalities: 'IMAGE', thinking_level: 'MINIMAL' }) }),
  ByteDanceSeedreamNodeV3: (i) => { const { w, h } = dims(i, 2048); return { 1: node('ByteDanceSeedreamNodeV3', { prompt: i.prompt ?? '', model: i.model ?? 'seedream 5.0 pro', 'model.size_preset': '(1K) 1024x1024 (1:1)', 'model.width': snap(w, 1, 1024, 4514), 'model.height': snap(h, 1, 1024, 4514), 'model.prompt_optimization': 'standard', 'model.seed': seedIn(i.seed, U31, 42), 'model.watermark': false, 'model.thinking': false }) }; },
  IdeogramV4: (i) => ({ 1: node('IdeogramV4', { prompt: i.prompt ?? '', resolution: 'Auto', rendering_speed: 'DEFAULT', seed: seedIn(i.seed, U31) }) }),
  RecraftV4TextToImageNode: (i) => ({ 1: node('RecraftV4TextToImageNode', { prompt: i.prompt ?? '', negative_prompt: i.negativePrompt ?? '', model: i.model ?? 'recraftv4_1', 'model.size': '1024x1024', n: Math.min(6, i.n ?? 1), seed: seedIn(i.seed, Number.MAX_SAFE_INTEGER) }) }),
  LumaImageNode2: (i) => ({ 1: node('LumaImageNode2', { prompt: i.prompt ?? '', model: 'uni-1', 'model.aspect_ratio': nearestRatio(i.aspectRatio, ['auto', '16:9', '3:2', '1:1', '2:1', '3:1']), 'model.style': 'auto', 'model.web_search': false, seed: seedIn(i.seed, U31) }) }),
  KlingOmniProImageNode: (i) => ({ 1: node('KlingOmniProImageNode', { model_name: 'kling-v3-omni', prompt: i.prompt ?? '', resolution: i.resolution ?? '1K', aspect_ratio: nearestRatio(i.aspectRatio, ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2']), series_amount: 'disabled' }) }),
  Krea3ImageNode: (i) => ({ 1: node('Krea3ImageNode', { model: 'Krea 3', 'model.prompt': i.prompt ?? '', 'model.aspect_ratio': nearestRatio(i.aspectRatio, ['auto', '1:1', '3:4', '2:3', '9:16']), 'model.resolution': '2K', 'model.thinking_mode': 'fast', 'model.precise_edit': false, 'model.seed': seedIn(i.seed, U31, 42) }) }),
  RunwayTextToImageNode: (i) => ({ 1: node('RunwayTextToImageNode', { prompt: i.prompt ?? '', ratio: nearestRatio(i.aspectRatio, ['1920:1080', '1080:1920', '1024:1024', '1360:768', '1168:880'], ':') }) }),
  GrokImageNode: (i) => ({ 1: node('GrokImageNode', { model: 'grok-imagine-image-2.0', prompt: i.prompt ?? '', aspect_ratio: nearestRatio(i.aspectRatio, RATIOS), number_of_images: Math.min(10, i.n ?? 1), seed: seedIn(i.seed, U31) }) }),
  QwenImageTextToImageApi: (i) => { const { w, h } = dims(i); return { 1: node('QwenImageTextToImageApi', { model: 'qwen-image-3.0-pro', 'model.prompt': i.prompt ?? '', 'model.negative_prompt': i.negativePrompt ?? '', 'model.width': snap(w, 1, 256, 2560), 'model.height': snap(h, 1, 256, 2560), n: Math.min(6, i.n ?? 1), seed: seedIn(i.seed, U31, 42), prompt_extend: false, watermark: false }) }; },
  WanTextToImageApi: (i) => ({ 1: node('WanTextToImageApi', { model: 'wan2.5-t2i-preview', prompt: i.prompt ?? '' }) }),
  HunyuanImageTextToImageApi: (i) => ({ 1: node('HunyuanImageTextToImageApi', { model: 'hy-image-3.5-preview', 'model.prompt': i.prompt ?? '', 'model.aspect_ratio': nearestRatio(i.aspectRatio, ['auto', ...RATIOS]), 'model.resolution': '2K', 'model.width': 2048, 'model.height': 2048, 'model.seed': seedIn(i.seed, U31, 42), 'model.watermark': false }) }),
  MetaMuseImageTextToImageApi: (i) => ({ 1: node('MetaMuseImageTextToImageApi', { model: 'muse-image-1.0', 'model.prompt': i.prompt ?? '', 'model.aspect_ratio': nearestRatio(i.aspectRatio, ['auto', ...RATIOS]), 'model.reasoning_strength': 'low', 'model.enable_web_search': false, 'model.enable_image_search': false, 'model.enable_shell': false, 'model.seed': seedIn(i.seed, U31, 42) }) }),
  MinimaxHailuo03TextToVideoNode: (i) => ({ 1: node('MinimaxHailuo03TextToVideoNode', { model: i.model ?? 'MiniMax H3', 'model.prompt': i.prompt ?? '', 'model.resolution': i.resolution === '2K' ? '2K' : '768P', 'model.ratio': nearestRatio(i.aspectRatio, ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9']), 'model.duration': Math.min(15, Math.max(4, Math.round(i.duration ?? 5))), seed: seedIn(i.seed, U32, 42), watermark: false }) }),
  MinimaxHailuo03FirstLastFrameNode: (i) => ({ 1: node('LoadImage', { image: i.images?.[0] ?? 'input.png' }), 2: node('MinimaxHailuo03FirstLastFrameNode', { model: i.model ?? 'MiniMax H3', 'model.prompt': i.prompt ?? '', 'model.resolution': i.resolution === '2K' ? '2K' : '768P', 'model.duration': Math.min(15, Math.max(4, Math.round(i.duration ?? 5))), first_frame: ['1', 0], seed: seedIn(i.seed, U32, 42), watermark: false }) }),
  MinimaxHailuo03ReferenceNode: (i) => {
    const p: ApiPrompt = {}; const refs: Record<string, unknown> = {};
    (i.images ?? []).slice(0, 9).forEach((img, k) => { p[String(10 + k)] = node('LoadImage', { image: img }); refs[`model.reference_images.image_${k + 1}`] = [String(10 + k), 0]; });
    p[1] = node('MinimaxHailuo03ReferenceNode', { model: i.model ?? 'MiniMax H3', 'model.prompt': i.prompt ?? '', 'model.resolution': i.resolution === '2K' ? '2K' : '768P', 'model.ratio': i.aspectRatio && ['16:9', '4:3', '1:1', '3:4', '9:16'].includes(i.aspectRatio) ? i.aspectRatio : 'adaptive', 'model.duration': Math.min(15, Math.max(4, Math.round(i.duration ?? 5))), ...refs, seed: seedIn(i.seed, U32, 42), watermark: false });
    return p;
  },
  ElevenLabsTextToSpeech: (i) => ({ 2: node('ElevenLabsVoiceSelector', { voice: i.voice ?? 'Sarah (female, american)' }), 1: node('ElevenLabsTextToSpeech', { voice: ['2', 0], text: i.text ?? i.prompt ?? '', stability: i.native?.stability ?? 0.5, apply_text_normalization: 'auto', model: 'eleven_v4', 'model.similarity_boost': 0.75, language_code: '', seed: seedIn(i.seed, U31, 1), output_format: 'mp3_44100_192' }) }),
  ElevenLabsTextToSoundEffects: (i) => ({ 1: node('ElevenLabsTextToSoundEffects', { text: i.text ?? i.prompt ?? '', model: 'eleven_sfx_v2', 'model.duration': Math.min(30, Math.max(0.5, i.duration ?? 5)), 'model.loop': false, 'model.prompt_influence': 0.3, output_format: 'mp3_44100_192' }) }),
  ComfyCloudMiniMaxH3TextToVideoNode: (i) => ({ 1: node('ComfyCloudMiniMaxH3TextToVideoNode', { prompt: i.prompt ?? '', seed: seedIn(i.seed, Number.MAX_SAFE_INTEGER, 42), aspect_ratio: nearestRatio(i.aspectRatio, ['1:1', '3:4', '2:3', '3:2', '4:3', '16:9']), resolution: i.resolution === '720p' ? '720p' : '480p', duration_seconds: Math.min(15, Math.max(5, Math.round(i.duration ?? 5))) }) }),
  ComfyCloudMiniMaxH3ImageToVideoNode: (i) => ({ 1: node('LoadImage', { image: i.images?.[0] ?? 'input.png' }), 2: node('ComfyCloudMiniMaxH3ImageToVideoNode', { first_frame: ['1', 0], prompt: i.prompt ?? '', seed: seedIn(i.seed, Number.MAX_SAFE_INTEGER, 42), aspect_ratio: nearestRatio(i.aspectRatio, ['1:1', '3:4', '2:3', '3:2', '4:3', '16:9']), resolution: i.resolution === '720p' ? '720p' : '480p', duration_seconds: Math.min(15, Math.max(5, Math.round(i.duration ?? 5))) }) }),
  SoniloTextToMusic: (i) => ({ 1: node('SoniloTextToMusic', { prompt: i.prompt ?? '', duration: Math.min(360, Math.max(1, Math.round(i.duration ?? 30))), seed: seedIn(i.seed, Number.MAX_SAFE_INTEGER) }) }),
  SoniloVideoToMusic: (i) => ({ 1: node('LoadVideo', { file: i.images?.[0] ?? 'input.mp4' }), 2: node('SoniloVideoToMusic', { video: ['1', 0], prompt: i.prompt ?? '', seed: seedIn(i.seed, Number.MAX_SAFE_INTEGER) }) }),
  // Not our path since 2026-10-27 (cloud-minimax-music runs the official template on Comfy Cloud, comfy/cloudWorkflows.ts); kept as the node's contract.
  ComfyCloudMiniMaxMusic3TextToAudioNode: (i) => ({ 1: node('ComfyCloudMiniMaxMusic3TextToAudioNode', { prompt: i.prompt ?? '', lyrics: i.lyrics ?? i.text ?? '', seed: seedIn(i.seed, Number.MAX_SAFE_INTEGER, 42), max_duration: Math.min(360, Math.max(0.04, i.duration ?? 120)), audio_quality: 'V0' }) }),
  ByteDanceSeedAudio: (i) => ({ 1: node('ByteDanceSeedAudio', { text_prompt: i.text ?? i.prompt ?? '', reference_mode: 'text only', sample_rate: '24000', speech_rate: 0, loudness_rate: 0, pitch_rate: 0, seed: seedIn(i.seed, U31, 42), model: 'seed-audio-1.0-multilingual' }) }),
  FishAudioTextToSpeech: (i) => ({ 1: node('FishAudioTextToSpeech', { text: i.text ?? i.prompt ?? '', model: 's2.1-pro', 'model.temperature': 0.7, 'model.top_p': 0.7, 'model.speed': 1, 'model.volume': 0, 'model.normalize': true, seed: seedIn(i.seed, U31, 42) }) }),
  HeyGenTextToSpeechNode: (i) => ({ 1: node('HeyGenTextToSpeechNode', { text: i.text ?? i.prompt ?? '', voice: i.voice ?? 'Aria (English, female)', speed: i.native?.speed ?? 1, ssml: false, seed: seedIn(i.seed, U31, 42) }) }),
};
export const partnerNodePrompt = (nodeClass: string, i: GenInput): ApiPrompt => {
  const b = PARTNER_NODES[nodeClass]; if (!b) throw new Error(`no request builder for partner node ${nodeClass}`); return b(i);
};

/** Comfy Router model ids for our router-* providers (integration cards (internal) kling.md / google.md / bytedance.md / minimax.md). */
export const ROUTER_MODELS: Record<string, { provider: string; model: string; long: boolean }> = {
  'router-kling': { provider: 'kling', model: 'kling-v3-omni', long: true },
  'router-veo': { provider: 'veo', model: 'veo-3.1-generate-001', long: true },
  'router-seedance': { provider: 'byteplus', model: 'dreamina-seedance-2-0-260128', long: true },
  'router-seedance-25': { provider: 'byteplus', model: 'dreamina-seedance-2-5-260628', long: true },
  'router-seedance-20-fast': { provider: 'byteplus', model: 'dreamina-seedance-2-0-fast-260128', long: true },
  'router-seedance-20-mini': { provider: 'byteplus', model: 'dreamina-seedance-2-0-mini', long: true },
  'router-veo-fast': { provider: 'veo', model: 'veo-3.1-fast-generate-001', long: true },
  'api-minimax-h3': { provider: 'minimax', model: 'minimax-h3', long: true },
};
export interface RouterCall { plan: RouterPlan; headers: Record<string, string>; body: Record<string, unknown> }
/** Partner-native body. The per-model schema (/v2/models/{p}/{m}/openapi.json) needs auth, so only the shared fields are set. */
export function routerCall(providerId: string, i: GenInput): RouterCall {
  const m = ROUTER_MODELS[providerId]; if (!m) throw new Error(`no Router model id for ${providerId}`);
  const body: Record<string, unknown> = { prompt: i.prompt ?? '' };
  if (i.duration != null) body.duration = Math.round(i.duration);
  if (i.aspectRatio) body.aspect_ratio = i.aspectRatio;
  if (i.resolution) body.resolution = i.resolution;
  if (i.seed != null) body.seed = seedIn(i.seed, U31);
  if (i.images?.length) body.image = i.images[0];
  const plan = routerPlan({ provider: m.provider, model: m.model, body, long: m.long });
  const headers: Record<string, string> = { ...plan.headers, 'Content-Type': 'application/json', ...(i.idempotencyKey ? { 'Idempotency-Key': i.idempotencyKey.slice(0, 255) } : {}) };
  return { plan, headers, body };
}
/** Router queue handle (201): use the returned URLs, never compose them (router-openapi.yaml RouterQueueUrls). */
export function parseRouterSubmit(r: any) {
  for (const k of ['request_id', 'status', 'status_url', 'response_url', 'cancel_url']) if (!r?.[k]) throw new Error(`router submit: missing ${k}`);
  return { requestId: String(r.request_id), status: String(r.status), statusUrl: String(r.status_url), resultUrl: String(r.response_url), cancelUrl: String(r.cancel_url), queuePosition: r.queue_position as number | undefined };
}
export function parseRouterStatus(r: any, retryAfter?: string | null) {
  if (!['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'].includes(r?.status)) throw new Error(`router status: unknown ${r?.status}`);
  return { done: r.status === 'COMPLETED', failed: r.status === 'COMPLETED' && !!r.error_type, errorType: r.error_type as string | undefined, retryAfterMs: retryAfter ? Number(retryAfter) * 1000 : undefined };
}

// ---- Direct vendor APIs (fallback only; key from apiKeyEnv) ----
/** form: a multipart body (OpenAI /v1/images/edits); sent instead of the JSON body, with fetch's own multipart Content-Type. */
export interface HttpRequest { method: 'POST' | 'GET'; url: string; headers: Record<string, string>; body?: Record<string, unknown>; form?: FormData }
/** MiniMax T2A v2 (sync). https://platform.minimax.io/docs/api-reference/speech-t2a-http */
/** speech-2.8-hd / speech-2.8-turbo; emotion only from the documented enum (2.8: happy, sad, angry, fearful, disgusted, surprised, calm); sample_rate from the
 *  documented list (8000 … 44100); output_format url (valid 24 h, downloaded right away). Read 2026-10-23. */
export const MINIMAX_EMOTIONS = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm'];
export const MINIMAX_SAMPLE_RATES = [8000, 16000, 22050, 24000, 32000, 44100];
export function minimaxSpeechRequest(i: GenInput & { speed?: number; format?: string; native?: Record<string, any>; speechModel?: 'speech-2.8-hd' | 'speech-2.8-turbo' }, key = '<OPENHIGGSFIELD_MINIMAX_API_KEY>'): HttpRequest {
  const emo = i.native?.['voice_setting.emotion']; const sr = Number(i.native?.['audio_setting.sample_rate']);
  return { method: 'POST', url: 'https://api.minimax.io/v1/t2a_v2', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: { model: i.speechModel ?? 'speech-2.8-hd', text: capped(i.text ?? i.prompt ?? '', 9999, 'MiniMax Speech'), stream: false, output_format: 'url', language_boost: 'auto',
      voice_setting: { voice_id: i.voice ?? 'English_expressive_narrator', speed: Math.min(2, Math.max(0.5, i.native?.['voice_setting.speed'] ?? i.speed ?? 1)), vol: Math.min(10, Math.max(0.01, i.native?.['voice_setting.vol'] ?? 1)), pitch: Math.round(Math.min(12, Math.max(-12, i.native?.['voice_setting.pitch'] ?? 0))),
        ...(MINIMAX_EMOTIONS.includes(emo) ? { emotion: emo } : {}) },
      audio_setting: { sample_rate: MINIMAX_SAMPLE_RATES.includes(sr) ? sr : 32000, bitrate: 128000, format: ['mp3', 'wav', 'flac', 'opus'].includes(String(i.format)) ? i.format : 'mp3', channel: 1 } } };
}
export function parseMinimaxSpeech(r: any) {
  if (r?.base_resp?.status_code !== 0) throw new Error(`minimax t2a: ${r?.base_resp?.status_code} ${r?.base_resp?.status_msg}`);
  return { audio: String(r.data.audio), isUrl: /^https?:/.test(String(r.data.audio)), durationMs: r.extra_info?.audio_length as number, traceId: r.trace_id as string };
}
/** BFL FLUX.2 [flex] (async: id + polling_url). https://docs.bfl.ai/api-reference/models/generate-or-edit-an-image-with-flux2-[flex] */
export function bflFlexRequest(i: GenInput & { steps?: number; guidance?: number }, key = '<OPENHIGGSFIELD_BFL_API_KEY>'): HttpRequest {
  const { w, h } = dims(i); const body: Record<string, unknown> = { prompt: i.prompt ?? '', width: snap(w, 16, 64, 4096), height: snap(h, 16, 64, 4096), steps: Math.min(50, Math.max(1, i.steps ?? 50)), guidance: Math.min(10, Math.max(1.5, i.guidance ?? 5)), safety_tolerance: 2, output_format: 'png', prompt_upsampling: false };
  if (i.seed != null) body.seed = seedIn(i.seed, U31);
  (i.images ?? []).slice(0, 8).forEach((img, k) => { body[k ? `input_image_${k + 1}` : 'input_image'] = img; });
  return { method: 'POST', url: 'https://api.bfl.ai/v1/flux-2-flex', headers: { 'x-key': key, 'Content-Type': 'application/json', accept: 'application/json' }, body };
}
/** cost: BFL's AsyncResponse.cost ("Cost in credits for this request", 1 credit = $0.01; https://api.bfl.ai/openapi.json), null when absent. */
export function parseBflSubmit(r: any) { if (!r?.id || !r?.polling_url) throw new Error('bfl: missing id/polling_url'); const c = Number(r.cost); return { id: String(r.id), pollingUrl: String(r.polling_url), cost: r.cost != null && Number.isFinite(c) ? c : null }; }
export function parseBflPoll(r: any) {
  if (r?.status === 'Ready') { const c = Number(r.cost); return { done: true, url: String(r.result?.sample), cost: r.cost != null && Number.isFinite(c) ? c : null }; } // SettledCostResultResponse.cost: settled cost in credits
  if (['Error', 'Failed', 'Request Moderated', 'Content Moderated', 'Task not found'].includes(r?.status)) return { done: true, error: String(r.status) };
  return { done: false };
}
/** BFL FLUX 3 Image Klein: text-to-image, or edit with 1–10 reference images (http(s) URL or base64). https://docs.bfl.ml/api-reference/utility/generate-an-image-with-flux-3-klein */
export const KLEIN3_ASPECTS = ['21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2', '9:21'];
export function bflKleinRequest(i: GenInput & { imageRes?: string }, key = '<OPENHIGGSFIELD_BFL_API_KEY>'): HttpRequest {
  const body: Record<string, unknown> = { prompt: i.prompt ?? '', output_format: 'png' };
  const ar = i.aspectRatio && KLEIN3_ASPECTS.includes(i.aspectRatio) ? i.aspectRatio : undefined; if (ar) body.aspect_ratio = ar;
  const res = ({ '1K': '1k', '2K': '2k', '4K': '4k' } as Record<string, string>)[i.imageRes ?? i.resolution ?? ''] ; if (res) body.resolution = res;
  const imgs = (i.images ?? []).slice(0, 10); if (imgs.length) body.images = imgs;
  if (i.seed != null) body.seed = seedIn(i.seed, U31);
  return { method: 'POST', url: 'https://api.bfl.ai/v1/flux-3-image-klein', headers: { 'x-key': key, 'Content-Type': 'application/json', accept: 'application/json' }, body };
}
/** BFL FLUX 3 Image (https://docs.bfl.ml/api-reference/utility/generate-an-image-with-flux-3, read 2026-10-22): prompt, aspect_ratio (enum or auto),
 *  resolution 768sq / 1k / 1.5k / 2k / 4k, images 1–10 (URL or base64), safety_tolerance, grounding. additionalProperties false: no seed, no output_format. */
export function bflFlux3ImageRequest(i: GenInput & { imageRes?: string }, key = '<OPENHIGGSFIELD_BFL_API_KEY>'): HttpRequest {
  const body: Record<string, unknown> = { prompt: i.prompt ?? '' };
  const ar = i.aspectRatio && KLEIN3_ASPECTS.includes(i.aspectRatio) ? i.aspectRatio : undefined; if (ar) body.aspect_ratio = ar;
  const res = ({ '1K': '1k', '2K': '2k', '4K': '4k' } as Record<string, string>)[i.imageRes ?? i.resolution ?? '']; if (res) body.resolution = res;
  const imgs = (i.images ?? []).slice(0, 10); if (imgs.length) body.images = imgs;
  return { method: 'POST', url: 'https://api.bfl.ai/v1/flux-3-image', headers: { 'x-key': key, 'Content-Type': 'application/json', accept: 'application/json' }, body };
}
/** BFL FLUX Video Upscale (FLUX 3 Upscaler). Source ≤20 s, ≤50 MB, ≤2560×1440; factor 1.5–3; creativity 0 precise / 1 creative. https://docs.bfl.ai/flux_tools/flux_video_upscale */
export function bflVideoUpscaleRequest(i: { inputVideo: string; factor?: number; mode?: string; prompt?: string }, key = '<OPENHIGGSFIELD_BFL_API_KEY>'): HttpRequest {
  const body: Record<string, unknown> = { input_video: i.inputVideo, upscale_factor: Math.min(3, Math.max(1.5, i.factor ?? 2)), creativity: i.mode === 'creative' ? 1 : 0, safety_tolerance: 2 };
  if (i.prompt?.trim() && i.mode === 'creative') body.prompt = i.prompt.trim();
  return { method: 'POST', url: 'https://api.bfl.ai/v1/flux-tools/video-upscale-v1', headers: { 'x-key': key, 'Content-Type': 'application/json', accept: 'application/json' }, body };
}
// ---- Direct lab APIs, batch 1 (2026-10-23; schemas read on the official docs that day) ----
/** Our Generate Video resolution → MiniMax model + resolution: 480p → MiniMax-H3-Max 480P, 720p / 768p → MiniMax-H3 768P, 1080p / 2K → MiniMax-H3 2K. */
export function minimaxVideoTier(res?: string): { model: 'MiniMax-H3' | 'MiniMax-H3-Max'; resolution: '480P' | '768P' | '2K'; ourTier: '480p' | '768p' | '2K' } {
  const r = String(res ?? '').toLowerCase();
  return r === '480p' ? { model: 'MiniMax-H3-Max', resolution: '480P', ourTier: '480p' } : r === '1080p' || r === '2k' ? { model: 'MiniMax-H3', resolution: '2K', ourTier: '2K' } : { model: 'MiniMax-H3', resolution: '768P', ourTier: '768p' };
}
export const MINIMAX_RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
/** MiniMax H3 / H3-Max video v2 (https://platform.minimax.io/docs/api-reference/video-generation-v2-create): model, content[] (text ≤7000 chars +
 *  image_url first_frame / last_frame, or reference_image ≤9 / reference_video ≤3 / reference_audio ≤3; never both kinds), resolution, duration
 *  (H3 4–15, H3-Max 5–15), ratio (text-to-video: a concrete ratio, never adaptive; first/last frame: adaptive; references: optional), extra.prompt_expansion_mode (H3-Max only).
 *  No seed field. Media as URLs or data URIs (body ≤ 64 MB). */
export function minimaxVideoRequest(i: { prompt: string; resolution?: string; duration?: number; aspect?: string; mode?: string; first?: string; last?: string; refImages?: string[]; refVideos?: string[]; refAudio?: string[] }, key = '<OPENHIGGSFIELD_MINIMAX_API_KEY>'): HttpRequest {
  const t = minimaxVideoTier(i.resolution); const mode = i.mode ?? (i.first ? 'i2v' : (i.refImages?.length || i.refVideos?.length || i.refAudio?.length) ? 'r2v' : 't2v');
  const content: Record<string, unknown>[] = [{ type: 'text', text: capped(i.prompt ?? '', 7000, 'MiniMax H3 on the MiniMax API') }];
  if ((mode === 'i2v' || mode === 'flf') && i.first) content.push({ type: 'image_url', image_url: { url: i.first }, role: 'first_frame' });
  if (mode === 'flf' && i.last) content.push({ type: 'image_url', image_url: { url: i.last }, role: 'last_frame' });
  if (mode === 'r2v') {
    for (const u of (i.refImages ?? []).slice(0, 9)) content.push({ type: 'image_url', image_url: { url: u }, role: 'reference_image' });
    for (const u of (i.refVideos ?? []).slice(0, 3)) content.push({ type: 'video_url', video_url: { url: u }, role: 'reference_video' });
    for (const u of (i.refAudio ?? []).slice(0, 3)) content.push({ type: 'audio_url', audio_url: { url: u }, role: 'reference_audio' });
  }
  const lo = t.model === 'MiniMax-H3-Max' ? 5 : 4; const duration = Math.min(15, Math.max(lo, Math.round(Number(i.duration) || 5)));
  const body: Record<string, unknown> = { model: t.model, content, resolution: t.resolution, duration };
  if (mode === 't2v') body.ratio = MINIMAX_RATIOS.includes(String(i.aspect)) ? i.aspect : '16:9';
  else if (mode === 'r2v') body.ratio = MINIMAX_RATIOS.includes(String(i.aspect)) ? i.aspect : 'adaptive';
  if (t.model === 'MiniMax-H3-Max') body.extra = { prompt_expansion_mode: 'disabled' }; // our prompt as written (the default would be 'balanced')
  return { method: 'POST', url: 'https://api.minimax.io/v2/video_generation', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body };
}
/** v2 query: GET /v2/query/video_generation/{task_id} → task.status queued | running | succeeded | failed | cancelled; task.content.url; task.usage.output_seconds. */
export function parseMinimaxVideoTask(r: any): { done: boolean; status: string; url?: string; error?: string; errorCode?: string; outputSeconds?: number } {
  const t = r?.task; const st = String(t?.status ?? '');
  if (st === 'succeeded') return { done: true, status: st, url: t?.content?.url ? String(t.content.url) : undefined, outputSeconds: Number(t?.usage?.output_seconds) || undefined };
  if (st === 'failed' || st === 'cancelled') return { done: true, status: st, errorCode: t?.error?.code != null ? String(t.error.code) : undefined, error: `${st}${t?.error?.code ? ` (${t.error.code})` : ''}: ${t?.error?.message ?? ''}`.trim() };
  if (st !== 'queued' && st !== 'running') throw new Error(`minimax video: unknown status ${st || '(none)'}`);
  return { done: false, status: st };
}
/** MiniMax image-01 (https://platform.minimax.io/docs/api-reference/image-generation-t2i, sync): prompt ≤1500, aspect_ratio from its list, response_format url (24 h), n, seed, prompt_optimizer. */
import { MINIMAX_IMAGE_ASPECTS } from './shared/hostedAspects.js'; export { MINIMAX_IMAGE_ASPECTS }; // one list with the bar (shared/imageCaps.ts)
export function minimaxImageRequest(i: GenInput, key = '<OPENHIGGSFIELD_MINIMAX_API_KEY>'): HttpRequest {
  const body: Record<string, unknown> = { model: 'image-01', prompt: capped(i.prompt ?? '', 1500, 'MiniMax image-01'), aspect_ratio: nearestRatio(i.aspectRatio && i.aspectRatio !== 'auto' ? i.aspectRatio : '1:1', MINIMAX_IMAGE_ASPECTS), response_format: 'url', n: 1, prompt_optimizer: false };
  if (i.seed != null) body.seed = seedIn(i.seed, U31);
  return { method: 'POST', url: 'https://api.minimax.io/v1/image_generation', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body };
}
export function parseMinimaxImage(r: any): { urls: string[]; b64: string[]; failed: number } {
  return { urls: (r?.data?.image_urls ?? []).map(String), b64: (r?.data?.image_base64 ?? []).map(String), failed: Number(r?.metadata?.failed_count) || 0 };
}
/** LTX (https://docs.ltx.io, async v2): models and the resolution grid per model (docs.ltx.io/models/ltx-2-5, ltx-2-3; read 2026-10-23). */
export type LtxModel = 'ltx-2-5-pro' | 'ltx-2-5-fast' | 'ltx-2-3-fast' | 'ltx-2-3-pro';
const LTX_GRID: Record<string, Record<string, string>> = {
  '720p': { '16:9': '1280x720', '9:16': '720x1280', '1:1': '720x720', '3:2': '1080x720', '2:3': '720x1080' },
  '1080p': { '16:9': '1920x1080', '9:16': '1080x1920', '1:1': '1080x1080', '3:2': '1620x1080', '2:3': '1080x1620' },
  '1440p': { '16:9': '2560x1440', '9:16': '1440x2560', '1:1': '1440x1440', '3:2': '2160x1440', '2:3': '1440x2160' },
  '4K': { '16:9': '3840x2160', '9:16': '2160x3840', '1:1': '2160x2160', '3:2': '3240x2160', '2:3': '2160x3240' },
};
export const LTX_ASPECTS: Record<LtxModel, string[]> = { 'ltx-2-5-pro': ['16:9', '9:16', '1:1', '3:2', '2:3'], 'ltx-2-5-fast': ['16:9', '9:16', '1:1', '3:2', '2:3'], 'ltx-2-3-fast': ['16:9', '9:16'], 'ltx-2-3-pro': ['16:9', '9:16'] };
export const LTX_CAMERA = ['dolly_in', 'dolly_out', 'dolly_left', 'dolly_right', 'jib_up', 'jib_down', 'static', 'focus_shift'];
/** "WxH" for our tier (720p / 1080p / 1440p / 4K) at the asked aspect, snapped to the model's own aspects. */
export function ltxResolution(model: LtxModel, tier?: string, aspect?: string): string {
  const t = Object.keys(LTX_GRID).find((k) => k.toLowerCase() === String(tier ?? '').toLowerCase()) ?? '1080p';
  const a = nearestRatio(aspect && aspect !== 'auto' ? aspect : '16:9', LTX_ASPECTS[model]); return LTX_GRID[t][a];
}
/** POST /v2/text-to-video | /v2/image-to-video: prompt, model, duration (int), resolution "WxH", fps 24, generate_audio, camera_motion; i2v image_uri + last_frame_uri. No seed. */
export function ltxVideoRequest(i: { model: LtxModel; prompt: string; resolution?: string; aspect?: string; duration?: number; audio?: boolean; cameraMotion?: string; image?: string; lastImage?: string }, key = '<OPENHIGGSFIELD_LTX_API_KEY>'): HttpRequest {
  const body: Record<string, unknown> = { prompt: i.prompt ?? '', model: i.model, duration: Math.round(Number(i.duration) || 6), resolution: ltxResolution(i.model, i.resolution, i.aspect), fps: 24, generate_audio: i.audio !== false };
  if (i.cameraMotion && LTX_CAMERA.includes(i.cameraMotion)) body.camera_motion = i.cameraMotion;
  if (i.image) { body.image_uri = i.image; if (i.lastImage) body.last_frame_uri = i.lastImage; }
  return { method: 'POST', url: `https://api.ltx.io/v2/${i.image ? 'image-to-video' : 'text-to-video'}`, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body };
}
/** GET /v2/{endpoint}/{id}: status pending | processing | completed | failed; result.video_url; error {type, message}. */
export function parseLtxJob(r: any): { done: boolean; status: string; url?: string; errorType?: string; error?: string } {
  const st = String(r?.status ?? '');
  if (st === 'completed') return { done: true, status: st, url: r?.result?.video_url ? String(r.result.video_url) : undefined };
  if (st === 'failed') return { done: true, status: st, errorType: String(r?.error?.type ?? 'api_error'), error: String(r?.error?.message ?? 'failed') };
  if (st !== 'pending' && st !== 'processing') throw new Error(`ltx: unknown status ${st || '(none)'}`);
  return { done: false, status: st };
}
/** BFL FLUX 3 Video (https://docs.bfl.ml/flux_3/flux3_video, read 2026-10-23): POST /v1/flux-3-video, mode t2v | i2v, prompt, keyframes (one image,
 *  or first + last), resolution hd | fhd | qhd | uhd, duration 5–20, aspect_ratio, generate_audio, draft (hd only), safety_tolerance 0–4. */
export const BFL_VIDEO_RES: Record<string, string> = { '720p': 'hd', '1080p': 'fhd', '1440p': 'qhd', '4k': 'uhd' };
export const BFL_VIDEO_ASPECTS = ['auto', '21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21'];
export function bflVideoRequest(i: { prompt: string; resolution?: string; duration?: number; aspect?: string; audio?: boolean; draft?: boolean; keyframes?: string[] }, key = '<OPENHIGGSFIELD_BFL_API_KEY>'): HttpRequest {
  const kf = (i.keyframes ?? []).slice(0, 2);
  const body: Record<string, unknown> = { mode: kf.length ? 'i2v' : 't2v', prompt: i.prompt ?? '', resolution: i.draft ? 'hd' : BFL_VIDEO_RES[String(i.resolution ?? '').toLowerCase()] ?? 'hd',
    duration: Math.min(20, Math.max(5, Math.round(Number(i.duration) || 5))), aspect_ratio: BFL_VIDEO_ASPECTS.includes(String(i.aspect)) ? i.aspect : 'auto', generate_audio: i.audio !== false, safety_tolerance: 2 };
  if (i.draft) body.draft = true;
  if (kf.length) body.keyframes = kf.length === 1 ? kf[0] : kf;
  return { method: 'POST', url: 'https://api.bfl.ai/v1/flux-3-video', headers: { 'x-key': key, 'Content-Type': 'application/json', accept: 'application/json' }, body };
}
/** BFL FLUX.2 [klein] 4B / 9B (https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-[klein]-4b): prompt, input_image … input_image_4,
 *  width / height (≥64), seed, safety_tolerance, output_format. We ask ≤1 MP (the 1K tier the price row covers). */
export const oneMp = (aspect?: string) => { const [a, b] = /^(\d+):(\d+)$/.test(aspect ?? '') ? aspect!.split(':').map(Number) : [1, 1]; const r = a / b;
  return { width: Math.floor(Math.sqrt(1_000_000 * r) / 16) * 16, height: Math.floor(Math.sqrt(1_000_000 / r) / 16) * 16 }; };
export function bflKlein2Request(variant: '4b' | '9b', i: GenInput, key = '<OPENHIGGSFIELD_BFL_API_KEY>'): HttpRequest {
  const body: Record<string, unknown> = { prompt: i.prompt ?? '', ...oneMp(i.aspectRatio), safety_tolerance: 2, output_format: 'png' };
  if (i.seed != null) body.seed = seedIn(i.seed, U31);
  (i.images ?? []).slice(0, 4).forEach((img, k) => { body[k ? `input_image_${k + 1}` : 'input_image'] = img; });
  return { method: 'POST', url: `https://api.bfl.ai/v1/flux-2-klein-${variant}`, headers: { 'x-key': key, 'Content-Type': 'application/json', accept: 'application/json' }, body };
}
/** Builder per hosted-direct provider id (providers.ts direct(...)). */
export const DIRECT_CLIENTS: Record<string, (i: GenInput) => HttpRequest> = {
  'direct-minimax-speech': (i) => minimaxSpeechRequest(i), 'direct-flux2-flex': (i) => bflFlexRequest(i), 'direct-flux3-upscale': (i) => bflVideoUpscaleRequest({ inputVideo: 'https://example.invalid/clip.mp4', factor: 2, mode: i.model === 'creative' ? 'creative' : 'precise', prompt: i.prompt }),
};
