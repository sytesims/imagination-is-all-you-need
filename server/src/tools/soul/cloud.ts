/**
 * OpenSoul on cloud routes (fal / Replicate), additive to routing/: route defs with capabilities, per-job request extras, and the
 * post-process run on returned images. Request shapes + prices are from the official model pages (read 2026-10-17; prices in
 * routing/routePrices.ts with source URL + date):
 *   fal-ai/z-image/turbo/lora      text → image, `loras` ≤3 (URL/HF repo, scale 0–4), image_size {width,height}   $0.0085/MP
 *   replicate prunaai/z-image-turbo text → image, width/height, no LoRA input                                       $0.005 ≤1 MP
 *   fal-ai/qwen-image-edit-2511    refs → image, image_urls[] (data URI or URL), image_size                       $0.03/MP
 *   fal-ai/flux-pulid              one face → image, reference_image_url, image_size, id_weight                   $0.0333/MP (rounded up to whole MP)
 *   replicate qwen/qwen-image-edit-2511 (official) refs → image, image[] (uri), aspect_ratio                       $0.03/output image
 *   fal-ai/esrgan (upscale)        image_url, scale 2|4, model RealESRGAN_x2plus|x4plus                           $0.00111/compute second
 * Colour match on cloud = server-side Reinhard LAB transfer (colour_transfer.py, same maths as core ColorTransfer reinhard_lab), 0 credits.
 * Server-side Real-ESRGAN on CPU was not used: ~1 min+ per 1 MP image on the box CPU (round-2 CPU run), so cloud upscale = fal-ai/esrgan only.
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { RouteDef } from '../../routing/types.js';
import { keyConfigured } from '../../routing/keys.js';
import { DATA_DIR } from '../../config.js';
import { runFfmpeg } from '../../ffmpeg.js';
import { falRun } from '../../providers/fal.js';
import { readFile, writeFile } from 'node:fs/promises';
import { handOff } from '../../mediaHandoff.js';

export const SOUL_ASPECT_SIZE: Record<string, [number, number]> = { '1:1': [1024, 1024], '3:4': [896, 1184], '4:3': [1184, 896], '2:3': [832, 1248], '3:2': [1248, 832], '9:16': [768, 1360], '16:9': [1360, 768] };
const FAL_ENV = 'OPENHIGGSFIELD_FAL_KEY';
const falKey = () => keyConfigured(FAL_ENV, ['FAL_KEY']);
/** Upscale on cloud = fal-ai/esrgan: est. 3 compute-s × $0.00111 = $0.0033 → 1 credit per image (1-credit minimum). */
export const UPSCALE_CREDITS_PER_IMAGE = 1;
const upExtra = (i: Record<string, any>) => (i.upscale && i.upscale !== 'off' ? UPSCALE_CREDITS_PER_IMAGE * (Number(i.n) === 4 ? 4 : 1) : 0);
const upBlock = (i: Record<string, any>) => (i.upscale && i.upscale !== 'off' && !falKey() ? 'Cloud upscale runs on fal: add a fal key in Settings' : null);
const COLOUR = { colour: { how: 'server', note: 'server-side Reinhard LAB transfer on the returned image, 0 credits', strength: [0.3, 0.7], sources: ['image', 'hex'] } };
const UPSCALE = { upscale: { how: 'fal-ai/esrgan', factors: ['x2', 'x4'], requires: FAL_ENV, creditsPerImage: UPSCALE_CREDITS_PER_IMAGE, estimated: true } };
type Mk = (o: { kind: 'fal' | 'replicate'; slug: string; label: string; sec: number; modes: string[]; caps: Record<string, unknown> }) => RouteDef;
/** Built by routing/routes.ts (so fal()/rep() defaults stay in one place). */
export function soulCloudRoutes(mk: Mk): RouteDef[] {
  const add = (r: RouteDef): RouteDef => ({ ...r, extraCredits: upExtra, unavailableFor: upBlock });
  return [
    add(mk({ kind: 'fal', slug: 'fal-ai/z-image/turbo/lora', label: 'Z-Image-Turbo + LoRA', sec: 4, modes: ['generate'], caps: { character: false, looks: 'zit-loras (≤3, other looks prompt-only)', aspect: true, n: [1, 4], ...COLOUR, ...UPSCALE } })),
    add(mk({ kind: 'replicate', slug: 'prunaai/z-image-turbo', label: 'Z-Image-Turbo', sec: 4, modes: ['generate'], caps: { character: false, looks: 'prompt-only', aspect: true, n: [1, 4], ...COLOUR, ...UPSCALE } })),
    add(mk({ kind: 'fal', slug: 'fal-ai/qwen-image-edit-2511', label: 'Qwen-Image-Edit-2511 (references)', sec: 12, modes: ['character-1', 'character-multi'], caps: { character: { engine: 'qwen-edit', refs: [1, 3] }, looks: 'prompt-only', aspect: true, n: [1, 4], ...COLOUR, ...UPSCALE } })),
    add(mk({ kind: 'fal', slug: 'fal-ai/flux-pulid', label: 'FLUX PuLID (one face)', sec: 15, modes: ['character-1'], caps: { character: { engine: 'pulid', refs: [1, 1] }, looks: 'prompt-only', aspect: true, n: [1, 4], ...COLOUR, ...UPSCALE } })),
    add(mk({ kind: 'replicate', slug: 'qwen/qwen-image-edit-2511', label: 'Qwen-Image-Edit-2511 (references)', sec: 15, modes: ['character-1', 'character-multi'], caps: { character: { engine: 'qwen-edit', refs: [1, 3] }, looks: 'prompt-only', aspect: true, n: [1, 4], ...COLOUR, ...UPSCALE } })),
  ];
}
/** Local route capabilities (everything runs in the ComfyUI graphs). */
export const SOUL_LOCAL_CAPS = { character: { engines: ['pulid', 'infiniteyou', 'aceplus', 'qwen-edit'], refs: [1, 3] }, looks: 'all 22 (LoRAs)', aspect: true, n: [1, 4], colour: { how: 'comfy ColorTransfer', strength: [0.3, 0.7], sources: ['image', 'hex'] }, upscale: { how: 'comfy Real-ESRGAN', factors: ['x2', 'x4'], creditsPerImage: 0 } };

/** Reference photos → small JPEG (≤768 px, q≈85) → the shared hand-off for the route's provider (fal or Replicate: inline when small, else their upload). */
async function dataUri(file: string, i: number, jobId: string, provider: 'fal' | 'replicate' = 'fal') {
  const out = path.join(DATA_DIR, `${jobId}-cloudref${i}.jpg`);
  if ((await runFfmpeg(['-y', '-v', 'error', '-i', file, '-vf', 'scale=768:768:force_original_aspect_ratio=decrease', '-q:v', '4', '-frames:v', '1', out])) !== 0) throw new Error('could not prepare reference photo');
  return handOff(out, 'image', provider, { mime: 'image/jpeg' });
}
/** Per-job request extras for routing/run.ts (computed at run time so data URIs never sit in the job record). */
export async function soulRoutedExtras(job: { id: string; input: Record<string, any>; route?: string | null }) {
  const provider = String(job.route ?? '').startsWith('replicate:') ? 'replicate' : 'fal';
  const [width, height] = SOUL_ASPECT_SIZE[job.input.aspect] ?? [896, 1184];
  const refs: string[] = job.input.refPaths ?? [];
  return { imageSize: { width, height }, aspect: job.input.aspect as string, imageUrls: await Promise.all(refs.slice(0, 3).map((f, i) => dataUri(f, i, job.id, provider))) };
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PY = process.env.OPENHIGGSFIELD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'); // Windows has python (py launcher installs); python3 there is the Store stub
/** Server-side colour match (free). Returns false if Python/PIL/numpy are missing (job gets a warning, output unchanged). */
export function colourTransfer(target: string, ref: string, strength: number, method: string): Promise<boolean> {
  const script = path.join(HERE, 'colour_transfer.py'); const src = script.replace(/([\\/])dist([\\/])(?!.*[\\/]dist[\\/])/, '$1src$2'); // built server: the .py stays in src/ (either slash: Windows paths use \\)
  return new Promise((res) => { const c = spawn(PY, [src, target, ref, String(strength), method]); c.on('close', (x) => res(x === 0)); c.on('error', () => res(false)); });
}
/** After a routed run: colour match each output (server), then upscale (fal-ai/esrgan live; mock = lanczos resize, labelled). */
/** fal-ai/esrgan on a local output file (sent as a data URI; schema: image_url, scale, model; output image.url). Overwrites the file. */
export async function falEsrgan(file: string, scale: number, key: string) {
  const uri = await handOff(file, 'image', 'fal', { mime: 'image/png' });
  const r: any = await falRun('fal-ai/esrgan', { image_url: uri, scale, model: scale === 4 ? 'RealESRGAN_x4plus' : 'RealESRGAN_x2plus', output_format: 'png' }, key, { timeoutMs: 10 * 60_000 });
  const url = r.result?.image?.url; if (!url) throw new Error('fal-ai/esrgan returned no image');
  const d = await fetch(url); if (!d.ok) throw new Error(`esrgan download ${d.status}`); await writeFile(file, Buffer.from(await d.arrayBuffer()));
}
export async function soulRoutedPost(job: any, ctx: { live: boolean; falKey?: string | null }) {
  const i = job.input; const warn: string[] = [];
  for (const o of job.outputs ?? []) {
    const f = path.join(DATA_DIR, String(o.url).slice('/files/'.length));
    if (i.colour) { job.stage = 'colour'; if (!(await colourTransfer(f, i.colour.path, i.colour.strength, i.colour.method))) warn.push('Colour match skipped: server needs python3 with Pillow + numpy.'); }
    if (i.upscale && i.upscale !== 'off') {
      job.stage = 'upscaling'; const scale = i.upscale === 'x4' ? 4 : 2;
      if (ctx.live && ctx.falKey) await falEsrgan(f, scale, ctx.falKey);
      else if (ctx.live) throw new Error('cloud upscale needs OPENHIGGSFIELD_FAL_KEY (fal-ai/esrgan)');
      else { const tmp = f.replace(/\.(\w+)$/, '.up.$1'); if ((await runFfmpeg(['-y', '-v', 'error', '-i', f, '-vf', `scale=iw*${Math.min(scale, 2)}:ih*${Math.min(scale, 2)}:flags=lanczos`, tmp])) === 0) await rename(tmp, f); }
    }
  }
  if (warn.length) job.warnings = [...new Set([...(job.warnings ?? []), ...warn])];
}
