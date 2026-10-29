/**
 * Photo tools in Create Image's bar (2026-10-23): Remove Background, Expand, Erase Object and Virtual Try-On, all hosted on fal (no model for
 * these is installed for Local, so there is no local route). Each is a fal-only model card (one feature each), run by its app tool in
 * tools/apps.ts (app-remove-bg, app-expand, app-erase, app-try-on). The geometry and block rules the bar shares live in shared/imagePhotoTools.ts.
 * Endpoints, request schemas (fal OpenAPI: fal.ai/api/openapi/queue/openapi.json?endpoint_id=…) and prices (the model page's billing line)
 * read 2026-10-23. Images and masks go inline as data URIs, like the other fal image routes. Nothing here was run against the paid API:
 * the bodies are checked against the schemas in test/image-photo-tools.test.ts.
 *
 *  Model card                   fal endpoint                        Price (published)
 *  Bria RMBG 2.0                fal-ai/bria/background/remove       $0.018 per image without a prompt (we never send one; $0.03 with one)
 *  Ideogram Remove Background   fal-ai/ideogram/remove-background   $0.01 per image
 *  Bria Expand                  fal-ai/bria/expand                  $0.04 per generation
 *  Ideogram 3.0 Reframe         fal-ai/ideogram/v3/reframe          $0.06 per image at BALANCED (what we send; $0.03 TURBO, $0.09 QUALITY)
 *  Bria Eraser                  fal-ai/bria/eraser                  $0.04 per generation
 *  fal Object Removal           fal-ai/object-removal/mask          $0.024 at best_quality (what we send; $0.006 low, $0.012 medium, $0.018 high)
 *  FASHN Virtual Try-On v1.6    fal-ai/fashn/tryon/v1.6             $0.075 per generation (num_samples 1)
 * One key runs everything (2026-10-27): Bria's three cards also run on Comfy Router (Bria's own API, the Comfy key), listed first (place order Comfy →
 * other API); Virtual Try-On gets a Comfy card, Bria Virtual Try-On (bria/image-edit-product-virtual-tryon). Router bodies: routing/routerModels.ts.
 *  Bria RMBG 2.0      bria/image-edit-remove-background      $0.018 per image
 *  Bria Expand        bria/image-edit-expand                 $0.0286 per image
 *  Bria Eraser        bria/image-edit-erase                  $0.0286 per image
 *  Bria Try-On        bria/image-edit-product-virtual-tryon  $0.0572 per image
 * Ideogram Remove Background, Ideogram 3.0 Reframe, fal Object Removal and FASHN stay on fal only (no Comfy place for those models).
 */
import { spawn } from 'node:child_process';
import { registerProvider } from '../providers.js';
import { HOSTED_BY_ID, type HostedPrice } from '../shared/hostedPrices.js';
import { EXTRA_ROUTES, COMING_SOON, FAL_ENV, routerPlace } from '../routing/routes.js';
import type { RouteDef } from '../routing/types.js';
import { imageDataUri } from './imageUpscaleModels.js';
import { IDEOGRAM_REFRAME_SIZES } from '../shared/imagePhotoTools.js';

const D = '2026-10-23' as const;
type In = Record<string, any>;
const page = (slug: string) => `https://fal.ai/models/${slug}`;
const photoOf = (i: In) => String(i.imagePath ?? i.refPaths?.[0] ?? '');
const seedOf = (i: In) => (Number.isInteger(i.seed) ? { seed: Math.abs(i.seed) % 2147483648 } : {});
/** Expand: only the user's own words go to the model ("Bria currently supports prompts in English only, excluding special characters"). */
const expandText = (i: In) => String(i.appPrompt ?? '').replace(/[^\p{L}\p{N}\s,.'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);

/** The provider ids, in the order each workflow lists them (the first is the default). */
export const PHOTO_TOOL_MODELS = {
  'remove-bg': ['fal-bria-rmbg', 'fal-ideogram-rmbg'],
  expand: ['fal-bria-expand', 'fal-ideogram-reframe'],
  erase: ['fal-bria-eraser', 'fal-object-removal'],
  'try-on': ['fal-fashn-tryon', 'router-bria-tryon'],
} as const;

// ---------- request bodies (exported for the schema test) ----------
export const FAL_PHOTO_BODIES = {
  /** fal-ai/bria/background/remove: image_url (required); prompt left out (it changes the price to $0.03). */
  briaRmbg: async (i: In) => ({ image_url: await imageDataUri(photoOf(i)) }),
  /** fal-ai/ideogram/remove-background: image_url (required). */
  ideogramRmbg: async (i: In) => ({ image_url: await imageDataUri(photoOf(i)) }),
  /** fal-ai/bria/expand: image_url + canvas_size (required); the photo's size and place on the canvas (aspect_ratio left out: it would override them). */
  briaExpand: async (i: In) => { const x = i.expand ?? {}; const t = expandText(i);
    return { image_url: await imageDataUri(photoOf(i)), canvas_size: x.canvas, original_image_size: x.original, original_image_location: x.location, ...(t ? { prompt: t } : {}), ...seedOf(i) }; },
  /** fal-ai/ideogram/v3/reframe: image_url + image_size (required); BALANCED speed (the price we quote). */
  ideogramReframe: async (i: In) => ({ image_url: await imageDataUri(photoOf(i)), image_size: IDEOGRAM_REFRAME_SIZES[String(i.target)] ?? IDEOGRAM_REFRAME_SIZES['1:1'], rendering_speed: 'BALANCED', num_images: 1, ...seedOf(i) }),
  /** fal-ai/bria/eraser: image_url + mask_url (white = the area to clean, same as our mask), mask_type manual (a painted mask). */
  briaEraser: async (i: In) => ({ image_url: await imageDataUri(photoOf(i)), mask_url: await imageDataUri(i.maskPath), mask_type: 'manual' }),
  /** fal-ai/object-removal/mask: image_url + mask_url ("White pixels (255) indicate areas to remove"), best_quality (the price we quote). */
  objectRemoval: async (i: In) => ({ image_url: await imageDataUri(photoOf(i)), mask_url: await imageDataUri(i.maskPath), model: 'best_quality', mask_expansion: 15 }),
  /** fal-ai/fashn/tryon/v1.6: model_image (the person) + garment_image, category, garment_photo_type, one sample, PNG. */
  fashn: async (i: In) => ({ model_image: await imageDataUri(photoOf(i)), garment_image: await imageDataUri(String(i.refPaths?.[1] ?? '')), category: String(i.category ?? 'auto'),
    garment_photo_type: String(i.garmentPhoto ?? 'auto'), mode: 'balanced', num_samples: 1, output_format: 'png', ...seedOf(i) }),
};

// ---------- model cards ----------
const card = (id: string, name: string, slug: string) => {
  registerProvider({ id, name, kind: 'hosted-direct', apiKeyEnv: FAL_ENV, via: `fal ${slug} (key in ${FAL_ENV}; sample output without a key)`, docUrl: page(slug) } as any);
  COMING_SOON[id] = 'Runs on fal';
};

// ---------- prices (1 credit = $0.01) ----------
const price = (slug: string, model: string, usd: number, note: string): HostedPrice => ({ providerId: `fal:${slug}`, model, unit: 'image', usd, sourceUrl: page(slug), checkedAt: D, estimated: false, note } as HostedPrice);
export const FAL_PHOTO_PRICES: HostedPrice[] = [
  price('fal-ai/bria/background/remove', 'Bria RMBG 2.0 (fal)', 0.018, '"Your request will cost $0.018 per image without a prompt and $0.03 per image with a prompt." We send no prompt.'),
  price('fal-ai/ideogram/remove-background', 'Ideogram Remove Background (fal)', 0.01, '"Each image costs $0.01."'),
  price('fal-ai/bria/expand', 'Bria Expand (fal)', 0.04, '"Your request will cost $0.04 per generation."'),
  price('fal-ai/ideogram/v3/reframe', 'Ideogram 3.0 Reframe (fal)', 0.06, '"Each image costs $0.03 with TURBO, $0.06 with BALANCED, and $0.09 with QUALITY." We send BALANCED.'),
  price('fal-ai/bria/eraser', 'Bria Eraser (fal)', 0.04, '"Your request will cost $0.04 per generation."'),
  price('fal-ai/object-removal/mask', 'fal Object Removal (mask)', 0.024, '"$0.006 with Low Quality, $0.012 with Medium Quality, $0.018 with High Quality, and $0.024 with Best Quality." We send best_quality.'),
  price('fal-ai/fashn/tryon/v1.6', 'FASHN Virtual Try-On v1.6 (fal)', 0.075, '"Your request will cost $0.075 per generation." We send num_samples 1.'),
];
for (const p of FAL_PHOTO_PRICES) if (!HOSTED_BY_ID[p.providerId]) HOSTED_BY_ID[p.providerId] = p;

// ---------- routes ----------
const route = (modelId: string, slug: string, label: string, sec: number, mode: 'edit' | 'inpaint', maxRefs: number, body: (i: In) => Promise<Record<string, unknown>>, caps: Record<string, unknown> = {}): RouteDef => ({
  routeId: `fal:${slug}`, kind: 'fal', modelId, endpoint: slug, priceRef: `fal:${slug}`, sourceUrl: `${page(slug)}/api`, checkedAt: D, typicalLatencySec: sec, latencyEstimated: true,
  latencySource: 'estimated: fal publishes no per-model latency', envKey: FAL_ENV, envAliases: ['FAL_KEY'], label: `${label} via fal`, output: 'image', eachImage: true, modes: [mode],
  request: (job) => body(job.input), caps: { maxRefs, ...caps } } as RouteDef);
export const FAL_PHOTO_ROUTES: RouteDef[] = [
  route('fal-bria-rmbg', 'fal-ai/bria/background/remove', 'Bria RMBG 2.0', 8, 'edit', 1, FAL_PHOTO_BODIES.briaRmbg, { transparent: true }),
  route('fal-ideogram-rmbg', 'fal-ai/ideogram/remove-background', 'Ideogram Remove Background', 10, 'edit', 1, FAL_PHOTO_BODIES.ideogramRmbg, { transparent: true }),
  route('fal-bria-expand', 'fal-ai/bria/expand', 'Bria Expand', 20, 'edit', 1, FAL_PHOTO_BODIES.briaExpand),
  route('fal-ideogram-reframe', 'fal-ai/ideogram/v3/reframe', 'Ideogram 3.0 Reframe', 20, 'edit', 1, FAL_PHOTO_BODIES.ideogramReframe),
  route('fal-bria-eraser', 'fal-ai/bria/eraser', 'Bria Eraser', 12, 'inpaint', 1, FAL_PHOTO_BODIES.briaEraser, { mask: true }),
  route('fal-object-removal', 'fal-ai/object-removal/mask', 'fal Object Removal', 15, 'inpaint', 1, FAL_PHOTO_BODIES.objectRemoval, { mask: true }),
  route('fal-fashn-tryon', 'fal-ai/fashn/tryon/v1.6', 'FASHN Virtual Try-On v1.6', 30, 'edit', 2, FAL_PHOTO_BODIES.fashn),
];
card('fal-bria-rmbg', 'Bria RMBG 2.0', 'fal-ai/bria/background/remove');
card('fal-ideogram-rmbg', 'Ideogram Remove Background', 'fal-ai/ideogram/remove-background');
card('fal-bria-expand', 'Bria Expand', 'fal-ai/bria/expand');
card('fal-ideogram-reframe', 'Ideogram 3.0 Reframe', 'fal-ai/ideogram/v3/reframe');
card('fal-bria-eraser', 'Bria Eraser', 'fal-ai/bria/eraser');
card('fal-object-removal', 'fal Object Removal', 'fal-ai/object-removal/mask');
card('fal-fashn-tryon', 'FASHN Virtual Try-On v1.6', 'fal-ai/fashn/tryon/v1.6');
for (const r of FAL_PHOTO_ROUTES) (EXTRA_ROUTES[r.modelId] ??= []).push(r);
// Comfy Router places (one key runs everything, 2026-10-27): first in each card, so a Comfy key alone runs them.
const ROUTER_PHOTO: [string, string, 'edit' | 'inpaint', Record<string, unknown>][] = [['fal-bria-rmbg', 'app-remove-bg', 'edit', { transparent: true }], ['fal-bria-expand', 'app-expand', 'edit', {}], ['fal-bria-eraser', 'app-erase', 'inpaint', { mask: true }]];
for (const [id, tool, mode, caps] of ROUTER_PHOTO) EXTRA_ROUTES[id] = [routerPlace(id, caps, { modes: [mode], tools: [tool], checkedAt: '2026-10-27', typicalLatencySec: 15 }), ...(EXTRA_ROUTES[id] ?? [])];
registerProvider({ id: 'router-bria-tryon', name: 'Bria Virtual Try-On', kind: 'hosted', license: 'proprietary', licenseUrl: 'https://bria.ai/legal', via: 'Comfy Router bria/image-edit-product-virtual-tryon (routing/routerModels.ts; sample output without a key)',
  docUrl: 'https://docs.comfy.org/development/comfy-router/models/bria/image-edit-product-virtual-tryon/code' } as any);

/** Share of a mask painted white (0–1), read at 64 × 64 (Erase Object: a mask over the whole photo is refused). null = unreadable. */
export function maskCover(maskPath: string): Promise<number | null> {
  return new Promise((res) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', maskPath, '-vf', 'format=gray,scale=64:64:flags=area', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
    const chunks: Buffer[] = []; p.stdout.on('data', (c) => chunks.push(c)); p.on('error', () => res(null));
    p.on('close', (code) => { const b = Buffer.concat(chunks); if (code !== 0 || !b.length) return res(null); let s = 0; for (const v of b) s += v; res(s / (255 * b.length)); });
  });
}
