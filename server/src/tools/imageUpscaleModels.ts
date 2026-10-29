/**
 * Upscale (image-upscale) models added 2026-10-22. The factor / workflow / cap table and the menu copy live in
 * shared/imageUpscale.ts; this file registers the engines, their prices and their cloud routes.
 *  - Comfy Router: SeedVR2 via WaveSpeed (`wavespeed/seedvr2`, 2.11 credits = $0.01 per image) and Clarity Crystal (`fal/crystal-upscaler`, Router
 *    price not published → listed, never run there). Bodies: routing/routerModels.ts.
 *  - fal: Crystal (`clarityai/crystal-upscaler`, $0.016 / output MP), Topaz Wonder 3.5 (`topaz/upscale/image/generative`, $0.08 per started 8 MP),
 *    Topaz Standard V2 (`topaz/upscale/image/precision`, $0.08 per started 24 MP), SeedVR2 (`fal-ai/seedvr/upscale/image`, $0.001 / MP).
 *    Schemas and prices read on the fal model pages (API tab) 2026-10-22. Images go inline as data URIs (fal: "your own URL or a Base64 data URI").
 *  - Local: SeedVR2 3B fp16 (native nodes), Z-Image-Turbo 2K, 4x Nomos2 DAT2 (graphs: scripts/build-image-upscale.py).
 * Nothing here was run against a paid API: the request bodies are checked against the schemas in test/image-upscale-page.e2e.ts.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { registerProvider } from '../providers.js';
import { registerLicense, registerWorkflowLicense } from '../licenses.js';
import { HOSTED_BY_ID, type HostedPrice } from '../shared/hostedPrices.js';
import { EXTRA_ROUTES, COMING_SOON, FAL_ENV } from '../routing/routes.js';
import type { RouteDef } from '../routing/types.js';
import { upscaleScaleOf } from '../shared/imageUpscale.js';
import { handOff } from '../mediaHandoff.js';

const D = '2026-10-22' as const;
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
/** A photo for a fal image field (image_url…): the shared hand-off (small inline, larger via fal's CDN upload). */
export const imageDataUri = (p: string) => handOff(p, 'image', 'fal', { mime: MIME[path.extname(p).toLowerCase()] ?? 'image/png' });
/** The job's factor (scale, or types x<n>). */
export const jobScale = (i: Record<string, any>) => { const s = Number(i.scale) || upscaleScaleOf({ types: i.types, mode: i.mode }) || 2; return Number.isFinite(s) ? s : 2; };

// ---------- licences ----------
registerLicense({ id: 'cc-by-4.0', name: 'CC BY 4.0', osi: false, url: 'https://creativecommons.org/licenses/by/4.0/', attribution: '4xNomos2_hq_dat2 by Philip Hofmann (Phhofm), CC BY 4.0' } as any);
registerWorkflowLicense('image-upscale-seedvr2-3b-api.json', ['apache-2.0']);
registerWorkflowLicense('image-upscale-zimage-2k-api.json', ['apache-2.0', 'bsd-3-clause']);
for (const f of ['image-upscale-nomos2-x2-api.json', 'image-upscale-nomos2-x4-api.json']) registerWorkflowLicense(f, ['cc-by-4.0']);

// ---------- engines ----------
const local = (id: string, name: string, workflows: string[], docUrl: string) =>
  registerProvider({ id, name, kind: 'open-weights', via: `local ComfyUI core nodes, workflows/${workflows.join(' + ')} (mock unless OPENHIGGSFIELD_BACKEND=comfy)`, workflows, docUrl } as any);
local('comfy-seedvr2-image', 'SeedVR2 3B fp16 (native nodes)', ['image-upscale-seedvr2-3b-api.json'], 'https://huggingface.co/Comfy-Org/SeedVR2');
local('comfy-zimage-upscale', 'Z-Image-Turbo 2K upscaler', ['image-upscale-zimage-2k-api.json'], 'https://huggingface.co/Comfy-Org/z_image_turbo');
local('comfy-nomos2', '4x Nomos2 DAT2 (CC-BY 4.0)', ['image-upscale-nomos2-x2-api.json', 'image-upscale-nomos2-x4-api.json'], 'https://github.com/Phhofm/models/releases/tag/4xNomos2_hq_dat2');
registerProvider({ id: 'router-seedvr2-upscale', name: 'SeedVR2 (WaveSpeed)', kind: 'hosted', via: 'Comfy Router wavespeed/seedvr2 (routing/routerModels.ts; sample output without a key)', docUrl: 'https://docs.comfy.org/development/comfy-router/models/wavespeed/seedvr2/code' } as any);
registerProvider({ id: 'api-crystal-upscale', name: 'Crystal Upscaler (Clarity AI)', kind: 'hosted', via: 'fal clarityai/crystal-upscaler; Comfy Router fal/crystal-upscaler listed (price not published)', docUrl: 'https://fal.ai/models/clarityai/crystal-upscaler' } as any);
const falOnly = (id: string, name: string, docUrl: string) => { registerProvider({ id, name, kind: 'hosted-direct', apiKeyEnv: FAL_ENV, via: `fal (key in ${FAL_ENV}; sample output without a key)`, docUrl } as any); COMING_SOON[id] = 'Runs on fal'; };
falOnly('fal-topaz-wonder', 'Topaz Wonder 3.5', 'https://fal.ai/models/topaz/upscale/image/generative');
falOnly('fal-topaz-precision', 'Topaz Standard V2', 'https://fal.ai/models/topaz/upscale/image/precision');
falOnly('fal-seedvr2-upscale', 'SeedVR2 (fal)', 'https://fal.ai/models/fal-ai/seedvr/upscale/image');
// fal image pass (2026-10-22): page, OpenAPI schema and billing block read on fal
falOnly('fal-topaz-bloom', 'Topaz Bloom 2', 'https://fal.ai/models/topaz/upscale/image/creative');
falOnly('fal-bria-upscale', 'Bria Increase Resolution', 'https://fal.ai/models/bria/increase-resolution');

// ---------- prices (1 credit = $0.01; per-MP rows bill the output size: shared/pricing.ts unit megapixel) ----------
export const IMAGE_UPSCALE_PRICES: HostedPrice[] = [
  { providerId: 'router-seedvr2-upscale', model: 'SeedVR2 (wavespeed/seedvr2)', unit: 'image', usd: 0.01, sourceUrl: 'https://docs.comfy.org/development/comfy-router/pricing', checkedAt: D, estimated: false, note: '2.11 Comfy credits ($0.01) per generation, any of 2K / 4K / 8K (Router pricing, updated Oct 1, 2026).' },
  { providerId: 'api-crystal-upscale', model: 'Crystal Upscaler (fal/crystal-upscaler on Comfy Router)', unit: 'megapixel', usd: null, estimateUsd: 0.0229, estimateNote: 'Estimate from the Clarity AI Crystal Upscale partner node on the same Comfy account: 4.83 credits per output megapixel (docs.comfy.org/tutorials/partner-nodes/pricing, read 2026-10-26).', sourceUrl: 'https://docs.comfy.org/development/comfy-router/pricing', checkedAt: D, estimated: true, note: 'Router pricing lists it as "Not published": runs on an estimate (the partner node\'s rate); the fal route has a published price.' },
  { providerId: 'fal:clarityai/crystal-upscaler', model: 'Crystal Upscaler (fal)', unit: 'megapixel', usd: 0.016, sourceUrl: 'https://fal.ai/models/clarityai/crystal-upscaler', checkedAt: D, estimated: false, note: '"Your request will cost $0.016 per megapixel" (output).' },
  { providerId: 'fal:topaz/upscale/image/generative', model: 'Topaz Wonder 3.5 (fal)', unit: 'megapixel', mpBlock: 8, usd: 0.08, sourceUrl: 'https://fal.ai/models/topaz/upscale/image/generative', checkedAt: D, estimated: false, note: '"$0.08 per started 8 megapixels of output with Wonder 3 or Wonder 3.5".' },
  { providerId: 'fal:topaz/upscale/image/precision', model: 'Topaz Standard V2 (fal precision)', unit: 'megapixel', mpBlock: 24, usd: 0.08, sourceUrl: 'https://fal.ai/models/topaz/upscale/image/precision', checkedAt: D, estimated: false, note: '"$0.08 per started 24 megapixels of output for every precision model".' },
  { providerId: 'fal:topaz/upscale/image/creative', model: 'Topaz Bloom 2 (fal creative)', unit: 'megapixel', mpBlock: 2, usd: 0.08, sourceUrl: 'https://fal.ai/models/topaz/upscale/image/creative', checkedAt: D, estimated: false, note: '"$0.08 per started 2 megapixels of output with Bloom 2, Bloom, or Bloom Realism. For example, a 24 MP output costs $0.96."' },
  { providerId: 'fal:bria/increase-resolution', model: 'Bria Increase Resolution (fal)', unit: 'image', usd: 0.04, sourceUrl: 'https://fal.ai/models/bria/increase-resolution', checkedAt: D, estimated: false, note: '"Your request will cost $0.04 per image." ×2 or ×4, up to 8192×8192.' },
  { providerId: 'fal:fal-ai/seedvr/upscale/image', model: 'SeedVR2 image upscale (fal)', unit: 'megapixel', usd: 0.001, sourceUrl: 'https://fal.ai/models/fal-ai/seedvr/upscale/image', checkedAt: D, estimated: false, note: '"$0.001 per megapixel" (output). Rounds up to the 1-credit minimum.' },
];
for (const p of IMAGE_UPSCALE_PRICES) if (!HOSTED_BY_ID[p.providerId]) HOSTED_BY_ID[p.providerId] = p;

// ---------- fal routes ----------
const falRoute = (modelId: string, slug: string, label: string, sec: number, request: RouteDef['request'], caps: Record<string, unknown>): RouteDef => ({
  routeId: `fal:${slug}`, kind: 'fal', modelId, endpoint: slug, priceRef: `fal:${slug}`, sourceUrl: `https://fal.ai/models/${slug}/api`, checkedAt: D, typicalLatencySec: sec, latencyEstimated: true,
  latencySource: 'estimated: fal publishes no per-model latency', envKey: FAL_ENV, envAliases: ['FAL_KEY'], label: `${label} via fal`, output: 'image', request, caps });
/** fal request bodies (exported for the schema test). */
export const FAL_UPSCALE_BODIES = {
  crystal: async (i: Record<string, any>) => ({ image_url: await imageDataUri(i.imagePath), scale_factor: jobScale(i), output_format: 'png' }),
  wonder: async (i: Record<string, any>) => ({ image_url: await imageDataUri(i.imagePath), model: 'Wonder 3.5', upscale_factor: jobScale(i), output_format: 'png' }),
  precision: async (i: Record<string, any>) => ({ image_url: await imageDataUri(i.imagePath), model: 'Standard V2', upscale_factor: jobScale(i), output_format: 'png' }),
  /** topaz/upscale/image/creative: model Bloom 2 (default), upscale_factor 1–4. */
  bloom: async (i: Record<string, any>) => ({ image_url: await imageDataUri(i.imagePath), model: 'Bloom 2', upscale_factor: jobScale(i), output_format: 'png' }),
  /** bria/increase-resolution: desired_increase 2 | 4 (output up to 8192×8192). */
  bria: async (i: Record<string, any>) => ({ image_url: await imageDataUri(i.imagePath), desired_increase: jobScale(i) === 4 ? 4 : 2, output_type: 'png' }),
  seedvr2: async (i: Record<string, any>) => ({ image_url: await imageDataUri(i.imagePath), upscale_mode: 'factor', upscale_factor: jobScale(i), output_format: 'png', ...(Number.isInteger(i.seed) ? { seed: i.seed } : {}) }),
};
EXTRA_ROUTES['api-crystal-upscale'] = [falRoute('api-crystal-upscale', 'clarityai/crystal-upscaler', 'Crystal', 20, (j) => FAL_UPSCALE_BODIES.crystal(j.input), { factors: [2, 4] })];
EXTRA_ROUTES['fal-topaz-wonder'] = [falRoute('fal-topaz-wonder', 'topaz/upscale/image/generative', 'Topaz Wonder 3.5', 100, (j) => FAL_UPSCALE_BODIES.wonder(j.input), { factors: [2, 4] })];
EXTRA_ROUTES['fal-topaz-precision'] = [falRoute('fal-topaz-precision', 'topaz/upscale/image/precision', 'Topaz Standard V2', 40, (j) => FAL_UPSCALE_BODIES.precision(j.input), { factors: [2, 4] })];
EXTRA_ROUTES['fal-seedvr2-upscale'] = [falRoute('fal-seedvr2-upscale', 'fal-ai/seedvr/upscale/image', 'SeedVR2', 40, (j) => FAL_UPSCALE_BODIES.seedvr2(j.input), { factors: [2, 4] })];
EXTRA_ROUTES['fal-topaz-bloom'] = [falRoute('fal-topaz-bloom', 'topaz/upscale/image/creative', 'Topaz Bloom 2', 100, (j) => FAL_UPSCALE_BODIES.bloom(j.input), { factors: [2, 4] })];
EXTRA_ROUTES['fal-bria-upscale'] = [falRoute('fal-bria-upscale', 'bria/increase-resolution', 'Bria Increase Resolution', 30, (j) => FAL_UPSCALE_BODIES.bria(j.input), { factors: [2, 4] })];
