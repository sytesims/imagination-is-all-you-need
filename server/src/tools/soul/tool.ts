/**
 * OpenSoul (tool `soul`): realistic photo generator. Z-Image-Turbo + realism LoRA (0.5) by default; each of the 22 looks maps to an
 * existing community LoRA on the base it was trained for (FLUX.1-dev / Qwen-Image / ZIT), prompt-only where none exists.
 * Character consistency from reference photos only (PuLID-FLUX · InfiniteYou · ACE++ · Qwen-Image-Edit-2511; `engine=auto` picks).
 * Colour match = core ColorTransfer from a reference image or a HEX palette (strength 0.3–0.7). Aspect, n ∈ {1,4}, optional Real-ESRGAN upscale.
 * Local = 0 credits; hosted = fal Z-Image-Turbo LoRA endpoint / Replicate Z-Image-Turbo at provider cost (routing/routes.ts).
 * No training of any kind.
 */
import path from 'node:path';
import { rename } from 'node:fs/promises';
import type { ToolDef } from '../types.js';
import type { Job } from '../../jobs.js';
import { DATA_DIR } from '../../config.js';
import { probe } from '../../media.js';
import { runFfmpeg } from '../../ffmpeg.js';
import { enhanceRules } from '../../cinema/enhance.js';
import { mockRun, mockFailOf, seedOf, mockStillFor } from '../shared.js';
import { SOUL_PRESETS, SOUL_LORAS, presetById } from './presets.js';
import { SOUL_ASPECTS, SOUL_ENGINES, pickEngine, loraStack } from './plan.js';
import { soulRoutedExtras, soulRoutedPost } from './cloud.js';

const truthy = (v?: string) => /^(1|true|on|yes)$/i.test(v || '');
export const COLOUR_METHODS = ['reinhard_lab', 'mkl_lab', 'histogram'];
export const UPSCALES = ['off', 'x2', 'x4'];
const HEX = /^#?[0-9a-f]{6}$/i;
const stages: [string, string][] = [['encoding', 'Encoding prompt'], ['identity', 'Reading reference photos'], ['generating', 'Generating'], ['colour', 'Colour match'], ['saving', 'Saving']];
type Issue = { code: string; field: string; message: string };
const bad = (field: string, message: string, code = 'invalid') => ({ error: message, issues: [{ code, field, message }] as Issue[] }) as any;

/** HEX palette → swatch PNG (equal vertical bands) used as ColorTransfer's image_ref. */
export async function hexSwatch(hexes: string[], out: string) {
  const cs = hexes.map((h) => h.replace('#', ''));
  const inputs = cs.flatMap((c) => ['-f', 'lavfi', '-i', `color=c=0x${c}:s=128x512:d=1`]);
  const fc = cs.length > 1 ? `${cs.map((_, k) => `[${k}:v]`).join('')}hstack=inputs=${cs.length}[v]` : '[0:v]null[v]';
  return (await runFfmpeg(['-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-frames:v', '1', out])) === 0;
}

export const soulTool: ToolDef = {
  // Transparency (2026-10-22): no house name. Kept for the API, MCP and saved jobs, hidden from the menus (listed: false); its page redirects to Create Image.
  id: 'soul', name: 'Photo Looks', category: 'Image', status: 'new', route: '/tools/soul', ui: 'app', listed: false,
  description: 'Realistic photos with 22 camera looks, character consistency from your reference photos, colour match and upscale.',
  inputs: [
    { name: 'prompt', kind: 'text', required: true },
    { name: 'enhance', kind: 'select', options: ['0', '1'], default: '0' },
    { name: 'preset', kind: 'select', options: ['none', ...SOUL_PRESETS.map((x) => x.id)], default: 'none' },
    { name: 'refs', kind: 'files', accept: 'image/png,image/jpeg,image/webp', max: 3 },
    { name: 'engine', kind: 'select', options: ['auto', ...SOUL_ENGINES], default: 'auto' },
    { name: 'refKind', kind: 'select', options: ['face', 'subject'], default: 'face' },
    { name: 'likeness', kind: 'select', options: ['balanced', 'max'], default: 'balanced' },
    { name: 'colourRef', kind: 'file', accept: 'image/png,image/jpeg,image/webp' },
    { name: 'colourHex', kind: 'text' },
    { name: 'colourStrength', kind: 'number', default: '0.5' },
    { name: 'colourMethod', kind: 'select', options: COLOUR_METHODS, default: 'reinhard_lab' },
    { name: 'aspect', kind: 'select', options: Object.keys(SOUL_ASPECTS), default: '3:4' },
    { name: 'n', kind: 'select', options: ['1', '4'], default: '1' },
    { name: 'upscale', kind: 'select', options: UPSCALES, default: 'off' },
    { name: 'seed', kind: 'number' },
  ],
  presets: SOUL_PRESETS.map((x) => ({ id: x.id, label: x.label, prompt: x.prompt, group: x.base, posterUrl: x.posterUrl })),
  app: { kind: 'image', input: 'image-optional', enhance: true, prompt: true, modes: false, aspects: Object.keys(SOUL_ASPECTS), counts: [1, 4], engines: ['auto', ...SOUL_ENGINES], maxRefs: 3,
    colour: { strength: { min: 0.3, max: 0.7, step: 0.05, default: 0.5 }, methods: COLOUR_METHODS, maxHex: 5 }, upscales: UPSCALES,
    looks: SOUL_PRESETS.map((x) => ({ id: x.id, label: x.label, posterUrl: x.posterUrl, base: x.base, promptOnly: x.fallback })) },
  workflows: ['soul-zit-api.json', 'soul-flux1dev-api.json', 'soul-qwen-api.json', 'soul-ref-pulid-api.json', 'soul-ref-infiniteyou-api.json', 'soul-ref-aceplus-api.json', 'soul-ref-qwenedit-api.json'],
  model: 'Z-Image-Turbo + realism LoRA · FLUX.1-dev / Qwen-Image-2512 for looks · PuLID-FLUX / InfiniteYou / ACE++ / Qwen-Image-Edit-2511 for characters',
  gpuSecPerSec: { '1:1': 6, '3:4': 6, '4:3': 6, '2:3': 6, '3:2': 6, '9:16': 6, '16:9': 6 },
  stages, providers: ['comfy-soul'],
  async parseInput(fields, files) {
    const prompt = (fields.prompt || '').slice(0, 10_000);
    if (!prompt.trim()) return bad('prompt', 'Describe the photo.', 'required');
    const presetId = fields.preset && fields.preset !== 'none' ? fields.preset : null; const pr = presetId ? presetById(presetId) : null;
    if (presetId && !pr) return bad('preset', `Unknown look "${presetId}". Pick one of: ${SOUL_PRESETS.map((x) => x.id).join(', ')}.`);
    const aspect = fields.aspect || '3:4'; if (!SOUL_ASPECTS[aspect]) return bad('aspect', `Aspect must be one of ${Object.keys(SOUL_ASPECTS).join(', ')}.`);
    const n = fields.n ? Number(fields.n) : 1; if (n !== 1 && n !== 4) return bad('n', 'Batch must be 1 or 4.');
    const upscale = fields.upscale || 'off'; if (!UPSCALES.includes(upscale)) return bad('upscale', 'Upscale must be off, x2 or x4.');
    const engineIn = fields.engine || 'auto'; if (engineIn !== 'auto' && !SOUL_ENGINES.includes(engineIn as any)) return bad('engine', `Engine must be auto or one of ${SOUL_ENGINES.join(', ')}.`);
    const refKind = fields.refKind || 'face'; if (!['face', 'subject'].includes(refKind)) return bad('refKind', 'refKind must be face or subject.');
    const likeness = fields.likeness || 'balanced'; if (!['balanced', 'max'].includes(likeness)) return bad('likeness', 'likeness must be balanced or max.');
    // reference photos (character consistency, 1–3)
    const refs = files.refs ?? [];
    if (refs.length > 3) return bad('refs', 'Up to 3 reference photos.');
    for (const r of refs) if (!/\.(png|jpe?g)$/i.test(r) || !(await probe(path.join(DATA_DIR, r)))) return bad('refs', 'Reference photos must be PNG or JPG.');
    const engine = refs.length ? pickEngine({ refs: refs.length, refKind, likeness, engine: engineIn }) : null;
    if (engine && engine !== 'qwen-edit' && refs.length > 1) return bad('refs', `${engine} uses one reference photo; pick engine qwen-edit (or auto) for 2–3 photos.`);
    // colour match
    const cRef = files.colourRef?.[0]; const hexRaw = (fields.colourHex || '').trim();
    let colour: { path: string; url: string; source: 'image' | 'hex'; hex?: string[]; strength: number; method: string } | null = null;
    if (cRef && hexRaw) return bad('colourHex', 'Use a colour reference image or a HEX palette, not both.');
    if (cRef || hexRaw) {
      const s = fields.colourStrength == null || fields.colourStrength === '' ? 0.5 : Number(fields.colourStrength);
      if (!Number.isFinite(s) || s < 0.3 || s > 0.7) return bad('colourStrength', 'Colour match strength must be between 0.3 and 0.7.');
      const method = fields.colourMethod || 'reinhard_lab'; if (!COLOUR_METHODS.includes(method)) return bad('colourMethod', `Method must be one of ${COLOUR_METHODS.join(', ')}.`);
      if (cRef) {
        if (!/\.(png|jpe?g)$/i.test(cRef) || !(await probe(path.join(DATA_DIR, cRef)))) return bad('colourRef', 'The colour reference must be PNG or JPG.');
        colour = { path: path.join(DATA_DIR, cRef), url: `/files/${cRef}`, source: 'image', strength: s, method };
      } else {
        const hex = hexRaw.split(/[\s,]+/).filter(Boolean);
        if (!hex.length || hex.length > 5 || !hex.every((h) => HEX.test(h))) return bad('colourHex', 'HEX palette: 1–5 colours like #1a2b3c, comma-separated.');
        const norm = hex.map((h) => `#${h.replace('#', '').toLowerCase()}`); const name = `soul-swatch-${norm.map((h) => h.slice(1)).join('-')}.png`;
        if (!(await hexSwatch(norm, path.join(DATA_DIR, name)))) return bad('colourHex', 'Could not build the palette swatch.');
        colour = { path: path.join(DATA_DIR, name), url: `/files/${name}`, source: 'hex', hex: norm, strength: s, method };
      }
    }
    const enhanced = truthy(fields.enhance) ? enhanceRules(prompt, 'image').prompt : null;
    const finalPrompt = [enhanced ?? prompt, pr?.prompt].filter(Boolean).join(', ');
    const family = engine ? (engine === 'qwen-edit' ? 'qwen' : 'flux1dev') : pr?.base ?? 'zit';
    const st = loraStack(presetId, family as any, engine);
    // Hosted route (fal Z-Image-Turbo LoRA): ZIT LoRAs only, max 3 (fal docs); other looks run there as prompt-only.
    const zit = loraStack(presetId, 'zit', null);
    const hostedLoras = [zit.realism, ...zit.style].filter(Boolean).slice(0, 3).map((l) => ({ path: SOUL_LORAS[l!.lora].download, scale: l!.strength }));
    const hostedPrompt = [zit.triggers.join(', '), finalPrompt].filter(Boolean).join(', ');
    return {
      outKind: 'image', prompt, enhancedPrompt: enhanced, finalPrompt, preset: presetId, /* route mode (routing/select jobMode): text vs reference routes */ types: [refs.length > 1 ? 'character-multi' : refs.length ? 'character-1' : 'generate'], mode: refs.length ? 'character' : 'generate', aspect, n, upscale, engine, refKind, likeness,
      refPaths: refs.map((r) => path.join(DATA_DIR, r)), refUrls: refs.map((r) => `/files/${r}`), colour,
      stack: { family, realism: st.realism, loras: st.style.map((l) => ({ id: l.lora, file: SOUL_LORAS[l.lora].file, strength: l.strength })), promptOnly: st.promptOnly },
      hostedPrompt, hostedLoras, resolution: aspect, duration: 1, seed: seedOf(fields.seed), simulate: mockFailOf(fields), target: '', warnings: [],
    };
  },
  async run(job: Job) {
    const label = presetById(job.input.preset)?.label ?? 'Z-Image-Turbo'; const n = job.input.n === 4 ? 4 : 1;
    await mockRun(job, stages, n > 1 ? Array.from({ length: n }, (_, k) => `${label} ${k + 1}`) : [label], 4000);
    if (job.status !== 'done') return;
    // Mock render at the requested aspect: our own sample frame (or the first reference), B&W looks desaturated, colour ref blended in.
    const [w, h] = SOUL_ASPECTS[job.input.aspect] ?? [896, 1184]; const k = job.input.upscale === 'x4' ? 4 : job.input.upscale === 'x2' ? 2 : 1;
    const ow = Math.round((w * Math.min(k, 2)) / 2) * 2, oh = Math.round((h * Math.min(k, 2)) / 2) * 2; // mock caps at 2× to stay light
    for (const [idx, o] of job.outputs.entries()) {
      const f = path.join(DATA_DIR, o.url.slice('/files/'.length)); const tmp = f.replace(/\.(\w+)$/, '.soul.$1');
      const src = job.input.refPaths?.[0] ? ['-i', job.input.refPaths[0]] : ['-i', mockStillFor(idx, Number(job.input.seed) || 0)];
      const look = job.input.preset === 'retro-bw' ? ',hue=s=0' : '';
      const c = job.input.colour; const vf = `scale=${ow}:${oh}:force_original_aspect_ratio=increase,crop=${ow}:${oh}${look}`;
      const args = c ? ['-y', ...src, '-i', c.path, '-filter_complex', `[0:v]${vf}[a];[1:v]scale=${ow}:${oh}[b];[a][b]blend=all_mode=normal:all_opacity=${c.strength * 0.4}`, '-frames:v', '1', tmp]
        : ['-y', ...src, '-frames:v', '1', '-vf', vf, tmp];
      if ((await runFfmpeg(args)) === 0) await rename(tmp, f);
    }
  },
  /** P0 (BUG-HUNT-7): route mode as parseInput sets it (generate / character-1 / character-multi by reference count), for the shared resolver.
   *  A quote's types query holds a look preset id, not a route mode, so it is derived from the uploads (refs=<n>) the quote marks. */
  routeInput: (i: Record<string, any>) => { const t = Array.isArray(i.types) ? String(i.types[0]) : ''; if (/^(generate|character-1|character-multi)$/.test(t)) return {};
    const n = Array.isArray(i.refPaths) ? i.refPaths.length : 0; return { types: [n > 1 ? 'character-multi' : n ? 'character-1' : 'generate'], mode: n ? 'character' : 'generate' }; },
};
soulTool.routedExtras = soulRoutedExtras as any; soulTool.routedPost = soulRoutedPost;
