import type { ToolDef, Preset } from './types.js';
import { wireInterimPreset, wireRestyleStyleMedia } from '../interimTiles.js';
import { runRefBatches } from './shared.js';
import { config } from '../config.js';
import { startJob } from '../pipeline.js';
import { GPU_DEFAULT, GPU_LTX, mockRun, parseCommon, MAX_CHAR_REF_BYTES, applyBatch, BATCH_MAX } from './shared.js';
/** Restyle: up to 30 character references (was 5), split into groups of ≤8 like the swap tools. */
export const RESTYLE_MAX_REFS = 30;
import { styleFor } from '../comfy/restyle.js';
import { LIMITS, RESOLUTIONS, probe } from '../media.js';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { MASK_GROW_PX } from '../comfy/objectSwap.js';
import { charswapFields } from '../comfy/h3CharSwapCloud.js';
import { cutRange } from '../swapClips.js';
import { CLOUD_SWAP_MODELS, isCloudSwap, swapRangeSeconds } from '../shared/cloudSwap.js';
import type { Issue } from './shared.js';

/** Swap range (Video Swap Trim, shared by Person swap and Motion transfer on every model): trimStart / trimEnd in seconds of the uploaded clip. A range is
 *  cut from the upload before anything else reads it (frame-accurate, sound kept), so the job, its price and every route see only that range. Whole
 *  seconds, LIMITS.minSec–LIMITS.maxSec long, anywhere in the clip (a long upload is no longer cut to its first 30 s when a range is given). */
export async function applySwapTrim(fields: Record<string, string>, files: Record<string, string[]>): Promise<{ trim: { start: number; end: number } | null } | { error: string; issues: Issue[] }> {
  const has = (k: string) => fields[k] != null && String(fields[k]).trim() !== '';
  if (!has('trimStart') && !has('trimEnd')) return { trim: null };
  const video = files.video?.[0]; if (!video) return { trim: null }; // parseCommon reports the missing video
  const p = await probe(path.join(DATA_DIR, video)); if (!p || !(p.duration > 0)) return { trim: null }; // parseCommon reports an unreadable clip
  const bad = (message: string) => ({ error: message, issues: [{ code: 'invalid_trim', field: 'trim', message }] });
  const start = has('trimStart') ? Number(fields.trimStart) : 0; const end = has('trimEnd') ? Number(fields.trimEnd) : Math.min(p.duration, start + LIMITS.maxSec);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return bad('The swap range must start before it ends, inside your clip.');
  if (end > p.duration + 0.05) return bad(`The swap range ends at ${end} s, after your clip ends (${Math.round(p.duration * 10) / 10} s).`);
  const len = Math.round((end - start) * 100) / 100;
  if (len < LIMITS.minSec - 0.01) return bad(`The swap range must be at least ${LIMITS.minSec} s; yours is ${len} s.`);
  if (len > LIMITS.maxSec + 0.01) return bad(`The swap range can be at most ${LIMITS.maxSec} s; yours is ${len} s. Trim it or split the clip.`);
  if (start < 0.05 && Math.abs(end - p.duration) < 0.05) return { trim: { start: 0, end: Math.round(end * 100) / 100 } }; // the whole clip: nothing to cut (the range stays what was asked: 0–8 on an 8.04 s file bills 8 s, as quoted)
  const cut = video.replace(/(\.[^.]+)?$/, `-range-${Math.round(start * 100)}-${Math.round(end * 100)}.mp4`);
  try { await cutRange(path.join(DATA_DIR, video), path.join(DATA_DIR, cut), start, len); } catch (e) { return bad(`Couldn't cut the swap range: ${e instanceof Error ? e.message : String(e)}.`); }
  files.video = [cut]; return { trim: { start, end } };
}
/** Video Swap models in quality order. Cloud person swap first (Kling 3.0 Omni Edit is the default: cheapest serious hosted edit; Seedance 2.5 Edit is the
 *  higher-quality, longer one), then the local models (Wan 2.2 Animate, H3 Character Swap backup), which stay available but are not the default. */
const SWAP_PROVIDERS = ['router-kling-edit', 'router-seedance-25-edit', 'router-seedance' /* unchanged: listed as before (its Router body isn't wired for swaps) */, 'comfy-open', 'comfy-h3-charswap'];

const commonInputs = [
  { name: 'video', kind: 'file' as const, required: true, accept: 'video/mp4,video/quicktime,video/webm' },
  { name: 'refs', kind: 'files' as const, accept: 'image/png,image/jpeg,image/webp,image/gif', max: LIMITS.maxRefs },
  { name: 'prompt', kind: 'text' as const, max: LIMITS.maxPrompt },
  { name: 'preset', kind: 'select' as const },
  { name: 'resolution', kind: 'select' as const, options: [...RESOLUTIONS], default: '720p', byProvider: Object.fromEntries(Object.values(CLOUD_SWAP_MODELS).map((m) => [m.id, m.qualities])) /* cloud swaps: the qualities each renders (shared/cloudSwap.ts) */,
    choices: [{ value: '480p', label: '480p · faster' }, { value: '720p', label: '720p · sharper' }, { value: '1080p', label: '1080p · sharpest' }] } as any,
  { name: 'seed', kind: 'number' as const },
  { name: 'keepAudio', kind: 'select' as const, options: ['1', '0'], default: '1' },
  { name: 'count', kind: 'number' as const, max: BATCH_MAX, default: '1' }, // batch: versions of one setup, price × count
];

// Our own preset wording (placeholders; spec only says "30+ presets" / "20+ styles" without names).
const p = (id: string, label: string, prompt: string): Preset => ({ id, label, prompt });
// Groups per CLEANROOM-SPEC Builder Q&A #2 (our choice).
const SWAP_GROUPS: Record<string, string[]> = {
  Wardrobe: ['outfit', 'shoes', 'hat', 'glasses', 'bag', 'jacket', 'watch'],
  Product: ['product', 'drink', 'phone', 'food', 'bottle', 'package', 'logo', 'screen', 'poster'],
  Character: ['main-person', 'left-person', 'right-person', 'pet', 'robot', 'creature', 'mascot', 'toy'],
  Location: ['location', 'sky', 'furniture', 'plant'],
};
const swapGroup = (id: string) => Object.entries(SWAP_GROUPS).find(([, ids]) => ids.includes(id))?.[0] ?? 'Look';
const STYLE_GROUPS: Record<string, string[]> = {
  Anime: ['Anime cel', 'Ukiyo-e print', 'Vaporwave'], 'Toon 3D': ['3D toon', 'Low poly', 'Retro 80s cartoon'],
  Clay: ['Claymation', 'Stop-motion felt', 'Paper cutout'], Watercolor: ['Watercolor', 'Gouache storybook', 'Oil painting'],
  'Comic Ink': ['Comic ink', 'Pop art', 'Graffiti', 'Woodcut', 'Charcoal', 'Pencil sketch'], Pixel: ['Pixel art', 'Stained glass', 'Blueprint'],
  'Live-Action': ['Live-action', 'Neon noir'],
};
const styleGroup = (s: string) => Object.entries(STYLE_GROUPS).find(([, xs]) => xs.includes(s))?.[0] ?? 'Look';
const SWAP_PRESETS: Preset[] = [
  ['main-person', 'Main person → reference', 'replace the main person with the reference character'],
  ['left-person', 'Person on the left', 'replace the person on the left with the reference character'],
  ['right-person', 'Person on the right', 'replace the person on the right with the reference character'],
  ['outfit', 'Outfit swap', 'change the main person\'s outfit to the reference outfit'],
  ['product', 'Product in hand', 'replace the product held in hand with the reference product'],
  ['drink', 'Drink / can', 'replace the drink with the reference can or bottle'],
  ['car', 'Car', 'replace the car with the reference vehicle'],
  ['pet', 'Pet', 'replace the animal with the reference animal'],
  ['location', 'Location', 'replace the background location with the reference location'],
  ['sky', 'Sky', 'replace the sky with the reference sky'],
  ['furniture', 'Furniture', 'replace the main piece of furniture with the reference item'],
  ['logo', 'Logo / sign', 'replace the visible logo or sign with the reference artwork'],
  ['shoes', 'Shoes', 'replace the shoes with the reference shoes'],
  ['hat', 'Headwear', 'replace the headwear with the reference item'],
  ['glasses', 'Eyewear', 'replace the eyewear with the reference glasses'],
  ['bag', 'Bag', 'replace the bag with the reference bag'],
  ['phone', 'Phone / device', 'replace the device with the reference device'],
  ['food', 'Food', 'replace the food with the reference dish'],
  ['toy', 'Toy / figure', 'replace the toy with the reference figure'],
  ['robot', 'Robot cast', 'replace the main person with the reference robot'],
  ['creature', 'Creature cast', 'replace the main person with the reference creature'],
  ['mascot', 'Mascot', 'replace the main person with the reference mascot'],
  ['jacket', 'Jacket', 'replace the jacket with the reference jacket'],
  ['poster', 'Wall poster', 'replace the poster on the wall with the reference image'],
  ['screen', 'Screen content', 'replace what is shown on the screen with the reference image'],
  ['bottle', 'Bottle', 'replace the bottle with the reference bottle'],
  ['watch', 'Watch', 'replace the watch with the reference watch'],
  ['plant', 'Plant', 'replace the plant with the reference plant'],
  ['bike', 'Bike', 'replace the bike with the reference bike'],
  ['package', 'Package / box', 'replace the box with the reference package'],
  ['instrument', 'Instrument', 'replace the instrument with the reference instrument'],
].map(([a, b, c]) => ({ ...p(a, b, c), group: swapGroup(a) }));
const MOTION_PRESETS: Preset[] = [
  ['new-cast', 'New cast', 'rebuild the scene with the reference character performing the same motion'],
  ['new-location', 'New location', 'keep the motion and camera, move the action to the reference location'],
  ['new-look', 'New look', 'keep the motion and timing, apply the reference look to everything'],
  ['cast-and-location', 'Cast + location', 'reference character in the reference location, same motion and camera'],
].map(([a, b, c]) => p(a, b, c));
const STYLES: Preset[] = [
  'Anime cel', 'Watercolor', 'Claymation', 'Pixel art', 'Comic ink', 'Oil painting', 'Paper cutout', 'Pencil sketch',
  '3D toon', 'Low poly', 'Neon noir', 'Ukiyo-e print', 'Stained glass', 'Charcoal', 'Retro 80s cartoon', 'Stop-motion felt',
  'Vaporwave', 'Blueprint', 'Pop art', 'Graffiti', 'Gouache storybook', 'Woodcut', 'Live-action',
].map((s) => ({ group: styleGroup(s), ...p(s.toLowerCase().replace(/[^a-z0-9]+/g, '-'), s, `redraw the whole clip in ${s.toLowerCase()} style, keep motion and timing`) }))
  .map((pr) => { const st = styleFor(pr.id); return st ? { ...pr, swatchUrl: st.swatch, promptTemplate: st.prompt } : pr; });

const swapStages: [string, string][] = [['uploading', 'Uploading'], ['tracking', 'Tracking subject'], ['swapping', 'Swapping'], ['rendering', 'Rendering frames'], ['muxing', 'Muxing audio']];
const motionStages: [string, string][] = [['uploading', 'Uploading'], ['pose', 'Extracting motion'], ['keyframe', 'Building first frame'], ['rendering', 'Rendering frames'], ['muxing', 'Muxing audio']];
const restyleStages: [string, string][] = [['uploading', 'Uploading'], ['keyframe', 'Styling first frame'], ['control', 'Extracting depth/pose'], ['rendering', 'Redrawing clip'], ['muxing', 'Muxing audio']];

export const objectSwapTool: ToolDef = {
  id: 'object-swap', name: 'Object / Person Swap', category: 'Swap & Motion', ui: 'video-swap', freeGens: true, route: '/tools/object-swap',
  description: 'Replace a product, outfit, person or place in a 4–30 s clip. Camera, motion and cuts stay the same.',
  inputs: [...commonInputs, { name: 'target', kind: 'text' }, { name: 'point', kind: 'text' },
    // optional matte video (white = replace): replaces the SAM2 click mask; Wan Animate set only (workflows/object-swap-wan-animate/mask-ext-N.json)
    { name: 'matte', kind: 'file', accept: 'video/mp4,video/quicktime,video/webm' },
    // C2: Object Swap UI fields (maskGrow drives the Wan Animate mask; firstFrame is accepted but only LTX-2.3 Inpaint would use it)
    { name: 'swapType', kind: 'select', options: ['person', 'object'] } as any, { name: 'maskMode', kind: 'select', options: ['text', 'point', 'upload', 'none'] } as any,
    { name: 'maskPrompt', kind: 'text' }, { name: 'maskGrow', kind: 'select', options: ['tight', 'normal', 'loose', 'box'] } as any,
    { name: 'firstFrameMode', kind: 'select', options: ['auto', 'upload'] } as any, { name: 'firstFrame', kind: 'file', accept: 'image/png,image/jpeg,image/webp' },
    { name: 'trimStart', kind: 'number' }, { name: 'trimEnd', kind: 'number' }],
  presets: SWAP_PRESETS,
  workflows: [path.basename(config.workflowPath)],
  model: 'Wan 2.2 Animate 14B (replace/mix) + SAM2 masks; LTX In/Outpaint IC-LoRA for objects',
  gpuSecPerSec: GPU_DEFAULT, stages: swapStages,
  // Kling 3.0 Omni's Router edit DOES take images (kling/kling-v3-omni schema: image_list next to video_list refer_type base, ≤ 4 with a video; checked
  // 2026-10-25), so it is the default cloud swap.
  providers: SWAP_PROVIDERS,
  async parseInput(fields, files) {
    const t = await applySwapTrim(fields, files); if ('error' in t) return t;
    const c = await parseCommon(fields, files, { refsRequired: true });
    if ('error' in c) return c;
    // [R6] prompt is optional when refs are given; only "no refs and no prompt" is an error (refs are required here anyway).
    if (!c.refPaths.length && !fields.prompt?.trim()) return { error: 'Add a reference image or describe the change.', issues: [{ code: 'required', field: 'prompt', message: 'Add a reference image or describe the change.' }] };
    let point: { x: number; y: number; t: number } | null = null; // optional click-on-frame → SAM2 point (normalized)
    if (fields.point) {
      const [x, y, t] = fields.point.split(',').map(Number);
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return { error: 'point must be "x,y[,t]" with x,y in 0..1' };
      point = { x, y, t: t || 0 };
    }
    let maskPath: string | undefined; let maskUrl: string | undefined; // matte: optional mask video, same clip length (converted to 16 fps at run time)
    const matte = files.matte?.[0];
    if (matte) {
      const mp = /\.(mp4|mov|webm|m4v)$/i.test(matte) ? await probe(path.join(DATA_DIR, matte)) : null;
      if (!mp || !(mp.duration > 0)) return { error: 'matte must be a readable video (MP4, MOV or WEBM): white where the subject should be replaced.', issues: [{ code: 'format', field: 'matte', message: 'matte must be a readable video (MP4, MOV or WEBM).' }] };
      maskPath = path.join(DATA_DIR, matte); maskUrl = `/files/${matte}`;
    }
    // C2: swapType / maskMode / maskPrompt / maskGrow / firstFrameMode / firstFrame (Object Swap UI). maskGrow drives the Wan Animate GrowMask/BlockifyMask
    // (same px as the free mask preview). A first frame is only used by LTX-2.3 Inpaint, which no Object Swap provider here runs: accepted, ignored, warned.
    const maskGrow = fields.maskGrow || undefined;
    if (maskGrow && !(maskGrow in MASK_GROW_PX)) return { error: 'maskGrow must be tight, normal, loose or box.', issues: [{ code: 'invalid', field: 'maskGrow', message: 'maskGrow must be tight, normal, loose or box.' }] };
    const maskMode = fields.maskMode || undefined;
    if (maskMode && !['text', 'point', 'upload', 'none'].includes(maskMode)) return { error: 'maskMode must be text, point, upload or none.', issues: [{ code: 'invalid', field: 'maskMode', message: 'maskMode must be text, point, upload or none.' }] };
    if (maskMode === 'upload' && !maskPath) return { error: 'Upload the mask video (field matte, white = replace).', issues: [{ code: 'required', field: 'matte', message: 'Upload the mask video (field matte, white = replace).' }] };
    const ffMode = fields.firstFrameMode || undefined;
    if (ffMode && !['auto', 'upload'].includes(ffMode)) return { error: 'firstFrameMode must be auto or upload.', issues: [{ code: 'invalid', field: 'firstFrameMode', message: 'firstFrameMode must be auto or upload.' }] };
    const warnings = [...((c as any).warnings ?? [])];
    if (ffMode === 'upload' || files.firstFrame?.length) warnings.push('Your first frame was not used: only LTX-2.3 Inpaint takes one, and it is not available for Object Swap here.');
    const target = fields.target || (maskMode === 'text' ? (fields.maskPrompt || '').trim() : '') || '';
    const cs = charswapFields(fields); if ('error' in cs) return { error: cs.error as string, issues: [{ code: 'invalid', field: 'charswap', message: cs.error as string }] }; // H3 Character Swap · Comfy Cloud settings
    return applyBatch({ ...c, ...cs, warnings, mode: 'object_swap', target, ...(t.trim ? { trim: t.trim, duration: swapRangeSeconds(t.trim) /* billed = the range, same rule as the quote */ } : {}), point, swapType: fields.swapType || undefined, maskMode, maskPrompt: fields.maskPrompt || undefined, maskGrow, firstFrameMode: ffMode, ...(maskPath ? { maskPath, maskUrl } : {}) }, fields);
  },
  async run(job) {
    if (config.backend === 'comfy') {
      await runRefBatches(job, startJob); // existing Wan Animate path (falls back to mock internally)
      return;
    }
    return runRefBatches(job, (j) => mockRun(j, swapStages));
  },
};

export const motionTransferTool: ToolDef = {
  id: 'motion-transfer', name: 'Motion Transfer', category: 'Swap & Motion', ui: 'video-swap', freeGens: true, route: '/tools/motion-transfer',
  description: 'Keep the motion, camera and timing of a driving video. Rebuild cast, location and look from references.',
  inputs: [...commonInputs, { name: 'target', kind: 'text' as const }, { name: 'trimStart', kind: 'number' as const }, { name: 'trimEnd', kind: 'number' as const }], presets: MOTION_PRESETS,
  workflows: ['motion-transfer-api.json'],
  model: 'Wan 2.2 Animate 14B (Move mode)',
  gpuSecPerSec: GPU_DEFAULT, stages: motionStages,
  providers: SWAP_PROVIDERS.filter((id) => id !== 'comfy-h3-charswap'), // H3 remains on Object / Person Swap, not Motion Control.
  async parseInput(fields, files) {
    const t = await applySwapTrim(fields, files); if ('error' in t) return t;
    const c = await parseCommon(fields, files, { refsRequired: true });
    if ('error' in c) return c;
    /* a cloud model takes every character image in ONE request (Image 1, Image 2…: several people in one clip), never split into ref groups */
    const one = isCloudSwap(fields.provider) ? { refBatches: [c.refPaths], refGroupLabels: ['Result'], warnings: c.warnings.filter((w) => !/ references are split into /.test(w)) } : {};
    const cs = charswapFields(fields); if ('error' in cs) return { error: cs.error as string, issues: [{ code: 'invalid', field: 'charswap', message: cs.error as string }] }; // H3 Character Swap · Comfy Cloud settings
    return applyBatch({ ...c, ...one, ...cs, mode: 'motion_transfer', target: (fields.target || '').trim(), ...(t.trim ? { trim: t.trim, duration: swapRangeSeconds(t.trim) /* billed = the range, same rule as the quote */ } : {}) }, fields);
  },
  run: (job) => runRefBatches(job, config.backend === 'comfy' ? startJob : (j) => mockRun(j, motionStages)),
};

export const restyleTool: ToolDef = {
  id: 'restyle', name: 'Restyle', category: 'Swap & Motion', ui: 'video-swap', freeGens: true, route: '/tools/restyle',
  description: 'Redraw the whole clip in an animation style (or a custom style from reference images). Motion stays.',
  inputs: [...commonInputs.map((i) => (i.name === 'refs' ? { ...i, max: RESTYLE_MAX_REFS, maxBytes: 64 * 1024 * 1024 } : i.name === 'preset' ? { ...i, required: true } : i)), { name: 'customStyle', kind: 'select' as const, options: ['0', '1'], default: '0' }], presets: STYLES,
  workflows: ['restyle-api.json'],
  model: 'Wan 2.1 VACE 14B video-to-video (Canny structure + style reference)',
  gpuSecPerSec: GPU_LTX, stages: restyleStages,
  providers: ['router-seedance', 'comfy-open'], // B6 quality order
  async parseInput(fields, files) {
    // [R8] a style is required (customStyle=1 = our labelled extra: style from refs/prompt). [R9] ≤5 character refs, 64 MB each.
    const custom = /^(1|true|on)$/i.test(fields.customStyle || '');
    const c = await parseCommon(fields, files, { refsRequired: false, maxRefs: RESTYLE_MAX_REFS, maxRefBytes: MAX_CHAR_REF_BYTES });
    const unknown = fields.preset && !STYLES.some((st) => st.id === fields.preset);
    const styleIssue = !fields.preset && !custom ? { code: 'required', field: 'preset', message: 'Pick a style.' }
      : unknown ? { code: 'unknown_style', field: 'preset', message: `Unknown style "${fields.preset}". Pick one from the style catalog (GET /api/tools/restyle → presets).` } : null;
    if ('error' in c) return styleIssue ? { ...c, issues: [...(c.issues ?? []), styleIssue] } : c;
    if (styleIssue) return { error: styleIssue.message, issues: [styleIssue] };
    if (custom && !fields.preset && !c.refPaths.length && !c.prompt.trim()) return { error: 'Custom style needs a style prompt or reference images.', issues: [{ code: 'required', field: 'prompt', message: 'Custom style needs a style prompt or reference images.' }] };
    return applyBatch({ ...c, mode: 'restyle', target: '', customStyle: custom }, fields);
  },
  run: (job) => runRefBatches(job, config.backend === 'comfy' ? startJob : (j) => mockRun(j, restyleStages)),
};

// Preset tile posters: our own procedural art from scripts/gen-example-media.py --tool-presets.
// Interim AI tiles (manifest §1–3): /examples/<tool>/<id>.jpg once DP's still exists (aiGenerated, credit, hover clip off), else this art. swatchUrl is untouched (it is the model's style input).
for (const [tool, ps] of [['object-swap', SWAP_PRESETS], ['motion-transfer', MOTION_PRESETS], ['restyle', STYLES]] as const) for (const pr of ps) {
  if (!pr.posterUrl) wireInterimPreset(tool, pr as any, `/samples/presets/${tool}-${pr.id}.jpg`, (pr as any).previewWebm ?? `/samples/presets/${tool}-${pr.id}.webm`);
  if (tool === 'restyle') wireRestyleStyleMedia(pr as any); // DP #27: loopUrl / needsRealLoop / standIn on the style objects themselves
}
