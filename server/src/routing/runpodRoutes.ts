/**
 * RunPod place (place-runpod, installable, 2026-11-06): our own ComfyUI image workflows (the Create Image plans in comfy/plans.ts, the graphs
 * Your computer runs) on the user's own RunPod Serverless endpoint running the official worker-comfyui image. One route per image model:
 * `runpod:<model id>`, listed on Create Image only. Hidden until both the RunPod key and the Endpoint ID are set (services/places.ts
 * KEY_GATED_KINDS + place-runpod ready()), and off unless place-runpod is in the profile (INSTALLABLE_KINDS).
 *
 * Price: RunPod bills GPU seconds, known only after the run, so the quote is an ESTIMATE (the D1 estimate mechanism: a price row with usd null and
 * estimateUsd = the seconds we expect per image × your GPU rate, both settings below). After the run the real figure (executionTime × the rate) is
 * recorded as the job's actual cost (place-runpod.ts).
 * Settings (ctx.settings: profile `config: place-runpod:` → env OPENHIGGSFIELD_PLACE_RUNPOD_<FIELD> → saved in the app):
 *   endpointId        your endpoint's id (Connections → RunPod → Endpoint ID); empty = not set up
 *   gpuUsdPerSecond   default 0.000486: RunPod's listed Serverless rate for the 48 GB class (L40 / L40S / 6000 Ada, $1.75/h, runpod.io/pricing, read
 *                     2026-11-06); set your endpoint's own GPU rate (24 GB L4 / A5000 / 3090 $0.75/h = 0.000208, 80 GB A100 $2.72/h = 0.000756)
 *   secondsPerImage   default 60: a guess on the safe side for one 1K image including a cold start; a warm worker is usually faster
 *   baseUrl           https://api.runpod.ai/v2 (tests point it at a local fake server)
 */
import { z } from 'zod';
import type { RouteDef } from './types.js';
import type { HostedPrice } from '../shared/hostedPrices.js';
import { HOSTED_BY_ID } from '../shared/hostedPrices.js';
import { pluginSettings } from '../kernel/settings.js';
import { imagePlanProviders } from '../comfy/plans.js';

/** RunPod's Serverless API (providers/runpod.ts reads it from the settings below). */
export const RUNPOD_BASE = 'https://api.runpod.ai/v2';
export const RUNPOD_ENV = 'OPENHIGGSFIELD_RUNPOD_API_KEY';
export const RUNPOD_KEYS = [RUNPOD_ENV, 'RUNPOD_API_KEY'];
export const RUNPOD_PRICE_REF = 'runpod:gpu-time';
export const RunpodSettings = z.object({
  endpointId: z.string().trim().default(''),
  gpuUsdPerSecond: z.number().positive().default(0.000486),
  secondsPerImage: z.number().positive().default(60),
  baseUrl: z.string().url().default(RUNPOD_BASE),
});
export type RunpodSettings = z.infer<typeof RunpodSettings>;
export const runpodSettings = (): RunpodSettings => pluginSettings('place-runpod', RunpodSettings);
/** An Endpoint ID as RunPod shows it (letters and digits, a dash or underscore); anything else is refused when saved. */
export const RUNPOD_ENDPOINT_RE = /^[A-Za-z0-9_-]{4,64}$/;
export const runpodEndpoint = (): string => { try { const e = runpodSettings().endpointId; return RUNPOD_ENDPOINT_RE.test(e) ? e : ''; } catch { return ''; } };
/** Dollars for GPU time on your endpoint (ms from RunPod's executionTime). */
export const runpodUsd = (ms: number, s: RunpodSettings = runpodSettings()) => Math.round((ms / 1000) * s.gpuUsdPerSecond * 1e6) / 1e6;

/** The image models RunPod runs (a Create Image plan exists for each). */
export const runpodModels = (): Set<string> => new Set(imagePlanProviders());
/** The RunPod route of an image model, from its local route (same graph, same caps), or null for a model without an image plan. */
export function runpodRouteOf(native: RouteDef): RouteDef | null {
  if (native.kind !== 'local' || !runpodModels().has(native.modelId)) return null;
  return { routeId: `runpod:${native.modelId}`, kind: 'runpod', modelId: native.modelId, endpoint: 'POST https://api.runpod.ai/v2/<your endpoint>/run (worker-comfyui)', priceRef: RUNPOD_PRICE_REF,
    sourceUrl: 'https://github.com/runpod-workers/worker-comfyui', checkedAt: '2026-11-06', typicalLatencySec: 60, latencyEstimated: true,
    latencySource: 'estimated: GPU time on your endpoint, plus a cold start when it has scaled to zero', envKey: RUNPOD_ENV, envAliases: ['RUNPOD_API_KEY'],
    label: 'RunPod', tools: ['create-image'], output: 'image', ...(native.caps ? { caps: { ...native.caps, localOnly: false } } : {}) };
}

/** The estimate row: per image, GPU seconds × your rate (read when quoted, so a changed setting prices the next quote). */
export const RUNPOD_PRICE: HostedPrice = {
  providerId: RUNPOD_PRICE_REF, model: 'Your RunPod endpoint (GPU time)', unit: 'image', usd: null,
  get estimateUsd() { try { const s = runpodSettings(); return Math.round(s.secondsPerImage * s.gpuUsdPerSecond * 1e5) / 1e5; } catch { return 0.03; } },
  get estimateNote() { try { const s = runpodSettings(); return `Estimate: about ${s.secondsPerImage} GPU seconds per image × $${s.gpuUsdPerSecond} per second (your GPU rate). RunPod bills the real GPU time; it is recorded after the run.`; } catch { return 'Estimate from GPU time.'; } },
  sourceUrl: 'https://www.runpod.io/pricing', checkedAt: '2026-11-06', estimated: true,
  note: 'RunPod Serverless bills per GPU second. No fixed price per image, so it runs on an estimate; the real cost (executionTime × your rate) is recorded after each run.',
} as HostedPrice;
if (!HOSTED_BY_ID[RUNPOD_PRICE_REF]) HOSTED_BY_ID[RUNPOD_PRICE_REF] = RUNPOD_PRICE;
