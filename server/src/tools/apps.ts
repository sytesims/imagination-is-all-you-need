import { IMAGE_PAGE } from '../shared/pages.js';
import { upscaleOutputSize } from '../shared/pricing.js';
import { LTX_LORAS, ltxLoraPrompt, PHOTO_FX_LTX_LORA } from '../shared/ltxLoras.js';
import { H3_CAMERA_MOVES } from './h3/catalog.js';
import { CAMERA_CATALOG } from '../cinema/cameraCatalog.js';
import { OPTION_MEDIA, wireOptionMedia, voiceSampleUrl, voiceSampleKind, wireSamplePresetMedia } from '../interimTiles.js';
import { parseLightRig, rigPhrases, rigJson, spherePresetOf, lightUntouched, DEFAULT_RIG, type LightRig } from '../shared/lightRig.js';
import { PRODUCT_SCENES, PRODUCT_KEEP, TRANSITION_TYPES, UGC_PRESENTERS, UGC_HOOKS, UGC_SETTINGS, UGC_FRAMINGS, ORBIT_TYPES, ORBIT_BACKDROPS, RELIGHT_DIRECTIONS, RELIGHT_QUALITY, RELIGHT_COLOUR_PRESETS, RELIGHT_LOOKS, relightLookOf, brightnessWord, colourName, padPhrase, LANGUAGE_NATIVE, CHARACTER_LAYOUTS, CHARACTER_LAYOUT_DEFAULT, type CharacterLayout, type AppField, type AppOption } from './appRows.js';
import { TRANSLATE_LANGS } from '../comfy/plans.js';
import { SHOT_ANGLES, SHOT_DEFAULTS, parseShots, shotPrompt, PERSON_SWAP_WHO, PERSON_SWAP_KEEP_OUTFIT_WHO, PERSON_SWAP_KEEP_OUTFIT, PERSON_SWAP_OUTFITS, type ShotAngle } from './shots.js';
import { GENERATE_MODELS, EDIT_MODELS, TWO_IMAGE_MODELS, MATERIAL_SWAP_MODELS, AD_PACK_MODELS, MASK_MODELS, REMOVE_BG_MODELS, EXPAND_MODELS, ERASE_MODELS, TRYON_MODELS, featureById, gridModelOf } from '../shared/imageFeatures.js';
import { promptGrammarOf } from '../shared/promptGrammar.js';
import { fillPattern, patternFor } from '../shared/promptPatterns.js';
import { PHONE_HOLDERS, PHONE_LIGHTS, PHONE_DEFAULTS, phonePhotoPrompt } from '../shared/phonePhoto.js';
import { EXPAND_ASPECTS, EXPAND_ASPECT_LABELS, TRYON_CATEGORIES, TRYON_PHOTO_TYPES, expandBlock, expandCanvas, photoBlock, eraseMaskBlock } from '../shared/imagePhotoTools.js';
import { maskCover } from './imageFalApps.js';
import { AD_STYLES, AD_STYLE_DEFAULT, AD_STYLE_IDS, AD_PLACEMENTS, AD_PLACEMENT_DEFAULT, AD_CORNERS, AD_TEXT_MAX, AD_ASPECT, adPrompt, placementOf } from '../shared/adPack.js';
import { BRAND_ACCENTS, BRAND_LOGO_SPOT, brandAccentWords, logoFor, type BrandKit } from '../shared/brandKit.js';
import { getBrandKit } from '../brandKits.js';
import { LAYER_MODELS, LAYER_SIZES, LAYER_SIZE_DEFAULT, LAYERS_NO_PROMPT, layersPhotoBlock, layerLabel } from '../shared/imageLayers.js';
import { mockLayerNames, mockLayerCount } from './mockLayers.js';
import { checkImageCaps, capsFor, ratioOf } from '../shared/imageCaps.js';
import { closestAspect } from '../shared/imageSnap.js';
import { typedFromFrames, normPrompt, type PromptFrame } from '../shared/typedPrompt.js';
import { VOICE_LANGUAGES } from './mediaPresets.js';
import { ROUTER_APP_MODELS } from '../shared/videoAppWorkflows.js';
import { addAdjustNote } from '../shared/snap.js';
import { VIDEO_LIMITS, hasToolDurations, registerToolDurations, durationsFor, durationsByProvider, defaultDurationByProvider, defaultDurationFor, resolveDuration, durationErrorBody } from './h3/videoCaps.js';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Preset, ToolDef } from './types.js';
import type { Job } from '../jobs.js';
import { DATA_DIR } from '../config.js';
import { validateMentions } from '../shared/mentions.js';
import { GPU_LTX, mockRun, parseCommon, seedOf, mockFailOf } from './shared.js';
import { probe, RESOLUTIONS } from '../media.js';
import { LOCAL_LABEL } from '../shared/modelIds.js';

/**
 * Generic small-app template (per spec, preset pattern: style grid + creation rail + history).
 * One config → registry entry + validation + mock run + the shared web 'app' screen. Upload → pick type → Generate.
 */
export interface FieldSpec {
  name: string; label?: string; kind: 'select' | 'text' | 'number' | 'boolean'; help?: string;
  options?: { value: string; label?: string }[]; default?: string | number | boolean; min?: number; max?: number; maxLength?: number; required?: boolean;
}
/** Validate generic fields → typed values or an error message. */
export function parseFields(specs: FieldSpec[], fields: Record<string, string>): Record<string, string | number | boolean> | { error: string } {
  const out: Record<string, string | number | boolean> = {};
  for (const f of specs) {
    const raw = fields[f.name]; const label = f.label ?? f.name; const has = raw != null && raw !== '';
    if (!has) { if (f.required && f.default == null) return { error: `${label} is required.` }; if (f.default != null) out[f.name] = f.default; continue; }
    if (f.kind === 'select') { if (!f.options?.some((o) => o.value === raw)) return { error: `${label} must be one of ${f.options?.map((o) => o.label ?? o.value).join(', ')}.` }; out[f.name] = raw; }
    else if (f.kind === 'number') { const n = Number(raw); if (!Number.isFinite(n) || (f.min != null && n < f.min) || (f.max != null && n > f.max)) return { error: `${label} must be a number${f.min != null ? ` ≥ ${f.min}` : ''}${f.max != null ? ` and ≤ ${f.max}` : ''}.` }; out[f.name] = n; }
    else if (f.kind === 'boolean') out[f.name] = /^(1|true|on|yes)$/i.test(raw);
    else { if (f.maxLength && raw.length > f.maxLength) return { error: `${label} is too long (max ${f.maxLength}).` }; out[f.name] = raw; }
  }
  return out;
}
export interface AppConfig {
  id: string; name: string; description: string; category?: string; status?: string; previewUrl?: string | null;
  input: 'image' | 'video';
  /** Additional workflow variants (e.g. camera-ltx-api.json). */
  extraWorkflows?: string[];
  /** Image apps: true when this provider runs these types from the prompt alone (Camera Moves text-to-video); the job then has no imagePath and t2v:true. */
  imageOptional?: (provider: string, types: string[]) => boolean;
  /** Selectable types (grid). `group` groups the grid. */
  types: Preset[];
  /** Allow combining up to N types ("Mix"). Default 1. */
  mix?: number;
  /** Frame shapes per provider (field `aspect`; 'auto' = follow the image). Presets may narrow providers with `providers`. */
  aspects?: Record<string, string[]>;
  /** Output durations in seconds (image → video apps). */
  durations?: number[];
  /** Expose an "Enhance prompt" toggle. */
  enhance?: boolean;
  /** Advanced: sampler steps options. */
  steps?: number[];
  /** Show a free-text prompt. */
  prompt?: boolean;
  /** Output resolutions (default 480p/720p/1080p). */
  resolutions?: string[];
  /** Extra generic form fields (plugins): rendered by the web AppTool, validated here, passed as input.fields. */
  fields?: FieldSpec[];
  workflow: string; model: string;
  gpuSecPerSec?: Record<string, number>;
  stages?: [string, string][];
  providers?: string[];
  /** Video upscale factors (×), capped so the long side ≤ maxLongSide (4K). Jobs report inputSize/outputSize. */
  scales?: number[]; maxLongSide?: number;
  /** Default scale (else scales[0]) and the scales each provider supports (else all of `scales`). */
  defaultScale?: number; scalesByProvider?: Record<string, number[]>;
  /** Optional named image slots (Photo FX: character/location/products) passed to the workflow as references. */
  refSlots?: { name: string; label: string; max?: number }[];
  /** Upscale: scene presets (field `scene`; prompt modifier, no price effect). */
  scenes?: Preset[];
  /** Upscale: output targets (field `maxOutput`) → long side, and the largest long side each engine really supports. 8K only where an engine can. */
  outputTargets?: Record<string, number>; maxLongSideByProvider?: Record<string, number>;
  /** When an image is sent to a video-input app: point to this tool instead (e.g. image-upscale). */
  imageHintTool?: string;
}

function ff(args: string[]) {
  return new Promise<boolean>((res) => { const p = spawn('ffmpeg', ['-y', '-v', 'error', ...args]); p.on('close', (c) => res(c === 0)); p.on('error', () => res(false)); });
}
/** Mock "image → video": a slow push-in on the still (local media only). */
async function stillToVideo(img: string, out: string, seconds: number, motion = true) {
  const fit = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2';
  const vf = motion ? `${fit},zoompan=z='min(zoom+0.0015,1.3)':d=1:s=1280x720:fps=24,format=yuv420p` : `${fit},fps=24,format=yuv420p`;
  return ff(['-loop', '1', '-i', img, '-t', String(seconds), '-vf', vf, '-c:v', 'libx264', '-preset', 'ultrafast', out]);
}

const MIN_IMG_PX = 409_600;

/** Upscale target long edge from targetLongEdge=<px> or target=<W>x<H>; null when neither is given, NaN when malformed. */
export function upscaleTargetLong(f: Record<string, any>): number | null {
  if (f.targetLongEdge != null && f.targetLongEdge !== '') { const n = Number(f.targetLongEdge); return Number.isInteger(n) ? n : NaN; }
  if (f.target != null && f.target !== '') { const m = /^(\d{2,5})\s*x\s*(\d{2,5})$/i.exec(String(f.target).trim()); return m ? Math.max(Number(m[1]), Number(m[2])) : NaN; }
  return null;
}
export function makeApp(c: AppConfig): ToolDef {
  // ONE duration rule (tools/h3/videoCaps): the app's own lengths cover its local graphs; hosted models keep their videoCaps row (quote = submit)
  const PROVS = c.providers ?? ['comfy-open']; if (c.durations) registerToolDurations(c.id, c.durations);
  const ALL_DURS = c.durations ? [...new Set(PROVS.flatMap((p) => durationsFor(c.id, p) ?? []))].sort((a, b) => a - b) : null;
  const stages = c.stages ?? (c.input === 'image'
    ? [['uploading', 'Uploading'], ['keyframe', 'Reading start image'], ['motion', 'Planning motion'], ['rendering', 'Rendering frames'], ['encoding', 'Encoding']] as [string, string][]
    : [['uploading', 'Uploading'], ['analyzing', 'Analyzing clip'], ['rendering', 'Processing frames'], ['muxing', 'Muxing audio']] as [string, string][]);
  const resolutions = c.resolutions ?? [...RESOLUTIONS];
  return {
    id: c.id, name: c.name, description: c.description, category: c.category ?? 'Apps', status: c.status, previewUrl: c.previewUrl ?? null, ui: 'app', route: `/tools/${c.id}`,
    inputs: [
      c.input === 'image' ? { name: 'image', kind: 'file', required: true, accept: 'image/png,image/jpeg,image/webp' } : { name: 'video', kind: 'file', required: true, accept: 'video/mp4,video/quicktime,video/webm' },
      { name: 'types', kind: 'list', required: true, max: c.mix ?? 1, options: c.types.map((t) => t.id) },
      ...(c.prompt ? [{ name: 'prompt', kind: 'text' as const }] : []),
      ...(c.scales ? [{ name: 'scale', kind: 'select' as const, options: c.scales.map(String), default: String(c.defaultScale ?? c.scales[0]) }] : []),
      ...(c.scenes ? [{ name: 'scene', kind: 'select' as const, options: ['auto', ...c.scenes.map((x) => x.id)], default: 'auto' }] : []),
      ...(c.outputTargets ? [{ name: 'maxOutput', kind: 'select' as const, options: Object.keys(c.outputTargets), default: Object.keys(c.outputTargets)[0] }, { name: 'targetLongEdge', kind: 'number' as const, min: 720, max: c.maxLongSide ?? 3840 } as any, { name: 'target', kind: 'text' as const, help: 'WxH, e.g. 2560x1440 (long side used; aspect follows the source)' } as any] : []),
      ...(c.refSlots ?? []).map((r) => ({ name: r.name, kind: 'files' as const, accept: 'image/png,image/jpeg,image/webp', max: r.max ?? 1 })),
      ...(c.aspects ? [{ name: 'aspect', kind: 'select' as const, options: [...new Set(Object.values(c.aspects).flat())], default: 'auto', byProvider: c.aspects } as any] : []),
      ...(c.durations ? [{ name: 'duration', kind: 'select' as const, options: ALL_DURS!.map(String), default: String(c.durations[c.durations.length - 1]) /* union; per model: app.durationsByProvider */ }] : []),
      ...(c.enhance ? [{ name: 'enhance', kind: 'select' as const, options: ['0', '1'], default: '1' }] : []),
      ...(c.steps ? [{ name: 'steps', kind: 'select' as const, options: c.steps.map(String), default: String(c.steps[0]) }] : []),
      ...(c.fields ?? []).map((f) => ({ name: f.name, kind: (f.kind === 'boolean' ? 'select' : f.kind) as 'select' | 'text' | 'number', options: f.kind === 'boolean' ? ['0', '1'] : f.options?.map((o) => o.value), default: f.default != null ? String(f.default) : undefined, required: f.required })),
      { name: 'resolution', kind: 'select', options: resolutions, default: resolutions.includes('720p') ? '720p' : resolutions[0] },
      { name: 'seed', kind: 'number' },
    ],
    presets: c.types,
    app: { input: c.input, mix: c.mix ?? 1, scales: c.scales ?? null, defaultScale: c.defaultScale ?? c.scales?.[0] ?? null, scalesByProvider: c.scalesByProvider ?? null, maxLongSide: c.maxLongSide ?? null, scenes: c.scenes ?? null, outputTargets: c.outputTargets ?? null, maxLongSideByProvider: c.maxLongSideByProvider ?? null, ...(c.outputTargets ? { outputTargetsByProvider: Object.fromEntries((c.providers ?? ['comfy-open']).map((pv) => [pv, Object.entries(c.outputTargets!).filter(([, ls]) => ls <= (c.maxLongSideByProvider?.[pv] ?? c.maxLongSide ?? 3840)).map(([k]) => k)])) } : {}), refSlots: c.refSlots ?? [], durations: c.durations ?? null, ...(c.durations ? { durationsByProvider: durationsByProvider(c.id, PROVS), defaultDurationByProvider: defaultDurationByProvider(c.id, PROVS) } : {}), enhance: !!c.enhance, steps: c.steps ?? null, prompt: !!c.prompt, resolutions, fields: c.fields ?? [] },
    workflows: [c.workflow, ...(c.extraWorkflows ?? [])], model: c.model,
    gpuSecPerSec: c.gpuSecPerSec ?? GPU_LTX, stages,
    providers: c.providers ?? ['comfy-open'],
    async parseInput(fields, files) {
      let types: string[] = [];
      try { types = JSON.parse(fields.types || '[]'); } catch { types = (fields.types || '').split(','); }
      types = types.map((t) => String(t).trim()).filter(Boolean);
      if (!types.length) return { error: 'Pick a type.', code: 'type_required', issues: [{ code: 'type_required', field: 'types', message: 'Pick a type.' }] } as any;
      if (types.length > (c.mix ?? 1)) return { error: c.mix && c.mix > 1 ? `Mix up to ${c.mix} types.` : 'Pick one type.' };
      const bad = types.find((t) => !c.types.some((p) => p.id === t)); if (bad) { const code = c.id === 'camera' ? 'unknown_move' : c.id === 'photo-fx' ? 'unknown_effect' : 'unknown_type'; const what = c.id === 'camera' ? 'camera move' : c.id === 'photo-fx' ? 'effect' : 'type';
        const msg = `That ${what} isn't on the list. Pick one from the list.`; return { error: msg, code, issues: [{ code, field: 'types', message: msg }] } as any; } // BH P3 #6: never echo the raw value
      let aspect: string | undefined;
      if (c.aspects) { const prov = fields.provider || (c.providers ?? ['comfy-open'])[0]; const ok = c.aspects[prov] ?? ['auto'];
        const off = types.find((t) => { const ps = (c.types.find((p) => p.id === t) as any)?.providers as string[] | undefined; return ps && !ps.includes(prov); });
        if (off) return presetUnsupportedBody(c.types, off, prov, c.id === 'photo-fx' ? PHOTO_FX_ENGINE : undefined) as any;
        aspect = fields.aspect || 'auto'; if (!ok.includes(aspect)) return aspectUnsupportedBody(prov, ok) as any; }
      const prompt = (fields.prompt || '').slice(0, 10_000);
      const typePrompt = types.map((t) => c.types.find((p) => p.id === t)!.prompt).join(', then ');
      const enhance = c.enhance ? fields.enhance !== '0' : false;
      const steps = c.steps ? (c.steps.includes(Number(fields.steps)) ? Number(fields.steps) : c.steps[0]) : null;
      const draft = /^(1|true|on)$/i.test(fields.draft || '');
      const resolution = draft ? '480p' : (fields.resolution || (resolutions.includes('720p') ? '720p' : resolutions[0]));
      if (!resolutions.includes(resolution) && !draft) return { error: `Resolution must be one of ${resolutions.join(', ')}.` };
      const pf = parseFields(c.fields ?? [], fields); if ('error' in pf) return { error: String(pf.error) };
      const extra = { fields: pf, types, typePrompt, ...(aspect ? { aspect } : {}), finalPrompt: moveFirst(typePrompt, [prompt, enhance ? fillPattern('camera-enhance', null) /* a plain sentence, not an "(enhanced: …)" note */ : ''].filter(Boolean).join('. ')), enhance, steps: draft && steps ? Math.max(4, Math.round(steps / 2)) : steps };
      const durProv = fields.provider || PROVS[0]; const durRaw = fields.duration != null && fields.duration !== '' ? fields.duration : fields.seconds;
      const rd = c.durations ? resolveDuration(c.id, durProv, durRaw) : undefined; // same rule as the price quote: an off-list length snaps to the nearest (D5)
      if (rd && 'error' in rd) return { ...durationErrorBody(rd, fields.duration != null && fields.duration !== '' ? 'duration' : 'seconds') } as any;
      if (rd && rd.snapped) (extra as any).adjustNotes = [rd.snapped.note]; // shown by Generate and on the job (routing/select.ts adjustNotesFor)
      if (c.input === 'video') {
        const vf = files.video?.[0] ?? '';
        if (c.imageHintTool && /\.(png|jpe?g|webp|gif)$/i.test(vf)) return { error: `${c.name} takes a video. For a still image, use Upscale in the Image menu.`, issues: [{ code: 'format', field: 'video', message: `${c.name} takes a video. For a still image, use Upscale in the Image menu.` }], hint: { toolId: c.imageHintTool } } as any;
        let scaleOut: Record<string, any> = {};
        let sceneOut: Record<string, any> = {};
        if (c.scenes) {
          const sc = fields.scene || 'auto'; const sp = c.scenes.find((x) => x.id === sc);
          if (sc !== 'auto' && !sp) return { error: `Scene must be auto or one of ${c.scenes.map((x) => x.id).join(', ')}.`, issues: [{ code: 'invalid', field: 'scene', message: `Unknown scene "${sc}".` }] } as any;
          sceneOut = { scene: sc, ...(sp ? { finalPrompt: [extra.finalPrompt, sp.prompt].filter(Boolean).join('. ') } : {}) };
        }
        let maxLong = c.maxLongSide ?? 3840;
        if (c.outputTargets) {
          const tgt = fields.maxOutput || Object.keys(c.outputTargets)[0]; const want = c.outputTargets[tgt];
          const prov = fields.provider || (c.providers ?? ['comfy-open'])[0]; const can = c.maxLongSideByProvider?.[prov] ?? c.maxLongSide ?? 3840;
          if (want == null) return { error: `maxOutput must be ${Object.keys(c.outputTargets).join(' or ')}.`, issues: [{ code: 'invalid', field: 'maxOutput', message: `maxOutput must be ${Object.keys(c.outputTargets).join(' or ')}.` }] } as any;
          if (want > can) { const ok = Object.entries(c.outputTargets).filter(([, v]) => v <= can).map(([k]) => k); return { error: `This engine can't output ${tgt.toUpperCase()}; it tops out at ${can} px on the long side. Use ${ok.join(', ')}.`, issues: [{ code: 'unsupported', field: 'maxOutput', message: `This engine can't output ${tgt.toUpperCase()}.`, allowed: ok }] } as any; }
          maxLong = want; sceneOut.maxOutput = tgt;
        }
        // GAP-MATRIX 13: exact target. targetLongEdge=<px> or target=<W>x<H> (long side used; aspect always follows the source). 720 px ≤ target ≤ the engine's max.
        { const tl = upscaleTargetLong(fields); if (tl != null) { const prov = fields.provider || (c.providers ?? ['comfy-open'])[0]; const can = c.maxLongSideByProvider?.[prov] ?? c.maxLongSide ?? 3840;
            if (!(tl >= 720) || tl > can) { const msg = `Target must be 720–${can} px on the long side for this engine (got ${Number.isFinite(tl) ? tl : 'an invalid value'}).`; return { error: msg, issues: [{ code: tl > can ? 'unsupported' : 'invalid', field: fields.target ? 'target' : 'targetLongEdge', message: msg, max: can }] } as any; }
            maxLong = tl; sceneOut.targetLongEdge = tl; } }
        if (c.scales) {
          const scale = fields.scale ? Number(fields.scale) : c.defaultScale ?? c.scales[0];
          const prov = fields.provider || (c.providers ?? ['comfy-open'])[0]; const allowed = c.scalesByProvider?.[prov] ?? c.scales;
          if (c.scales.includes(scale) && !allowed.includes(scale)) return { error: `This model upscales ${allowed.map((x) => `${x}×`).join(', ')} only.`, issues: [{ code: 'unsupported', field: 'scale', message: `This model upscales ${allowed.map((x) => `${x}×`).join(', ')} only.`, allowed }] } as any;
          if (!c.scales.includes(scale)) return { error: `Scale must be ${c.scales.map((x) => `${x}×`).join(' or ')}.`, issues: [{ code: 'invalid', field: 'scale', message: `Scale must be ${c.scales.map((x) => `${x}×`).join(' or ')}.` }] } as any;
          scaleOut = { scale };
        }
        const base = await parseCommon({ ...fields, prompt }, files, { refsRequired: false, maxRefs: 0 });
        if ('error' in base) return base;
        if (c.scales) {
          const max = maxLong; const long = Math.max(base.width, base.height);
          const o = upscaleOutputSize(base.width, base.height, scaleOut.scale, max); void long;
          scaleOut = { ...scaleOut, inputSize: { width: base.width, height: base.height }, outputSize: { width: o.width, height: o.height }, capped: o.capped };
        }
        return { ...base, ...extra, ...sceneOut, ...scaleOut, mode: c.id, target: '' };
      }
      // image input
      const img = files.image?.[0] ?? files.refs?.[0];
      if (!img && c.imageOptional?.(durProv, types)) { // text-to-video (Camera Moves on an LTX / hosted text route): no keyframe
        const mv0 = validateMentions(prompt, { images: 0, videos: 0 });
        if (!mv0.ok) return { error: mv0.issues[0].message, mentionIssues: mv0.issues.map((i) => ({ code: i.code, mention: i.mention.raw, start: i.mention.start, end: i.mention.end, message: i.message })) } as any;
        const duration0 = c.durations ? (rd && 'seconds' in rd ? rd.seconds : defaultDurationFor(c.id, durProv)!) : 5;
        return { ...extra, t2v: true, refUrls: [], refPaths: [], duration: duration0, resolution, seed: seedOf(fields.seed), prompt, draft, warnings: [], mode: c.id, target: '', simulate: mockFailOf(fields) };
      }
      if (!img) return { error: 'An image is required (PNG/JPG).' };
      if (!/\.(png|jpe?g)$/i.test(img)) return { error: 'Unsupported format: use PNG or JPG.' };
      const p = await probe(path.join(DATA_DIR, img));
      if (!p) return { error: 'Unsupported format: use PNG or JPG.' };
      if (p.width * p.height < MIN_IMG_PX) return { error: `Image too small: needs ≥ 409,600 px (e.g. 854×480). Yours is ${p.width}×${p.height}. A sharper start image gives a sharper result.` };
      const mv = validateMentions(prompt, { images: 1, videos: 0 });
      if (!mv.ok) return { error: mv.issues[0].message, mentionIssues: mv.issues.map((i) => ({ code: i.code, mention: i.mention.raw, start: i.mention.start, end: i.mention.end, message: i.message })) } as any;
      const duration = c.durations ? (rd && 'seconds' in rd ? rd.seconds : defaultDurationFor(c.id, durProv)!) : 5;
      const slotRefs: Record<string, string[]> = {};
      for (const r of c.refSlots ?? []) {
        const fs = files[r.name] ?? []; if (fs.length > (r.max ?? 1)) return { error: `${r.label}: up to ${r.max ?? 1} image(s).` };
        const badF = fs.find((f) => !/\.(png|jpe?g|webp)$/i.test(f)); if (badF) return { error: `${r.label}: use PNG, JPG or WebP.` };
        if (fs.length) slotRefs[r.name] = fs;
      }
      const slotList = Object.entries(slotRefs).flatMap(([k, fs]) => fs.map((f) => ({ slot: k, url: `/files/${f}` })));
      return {
        ...(c.refSlots ? { slotRefs: slotList } : {}),
        ...extra, imagePath: path.join(DATA_DIR, img), imageUrl: `/files/${img}`, refUrls: [`/files/${img}`, ...slotList.map((x) => x.url)], refPaths: [path.join(DATA_DIR, img), ...slotList.map((x) => path.join(DATA_DIR, x.url.slice(7)))],
        duration, resolution, seed: seedOf(fields.seed), prompt, draft, warnings: [], mode: c.id, target: '',
        simulate: mockFailOf(fields),
      };
    },
    async run(job: Job) {
      if (c.input === 'image') {
        // BEFORE = the uploaded image held as a static clip; the mock AFTER = the tool's sample result clip.
        const still = `${job.id}-still.mp4`;
        job.status = 'running'; job.stage = stages[0][0]; job.progress = 2;
        if (!job.input.imagePath) { const label0 = job.input.types.map((t: string) => c.types.find((p) => p.id === t)?.label ?? t).join(' + '); return mockRun(job, stages, [label0], 6000); } // text-to-video: no keyframe, no BEFORE clip
        const ok = await stillToVideo(job.input.imagePath, path.join(DATA_DIR, still), job.input.duration, false);
        if (!ok) {
          job.status = 'failed'; job.errorType = 'temporary'; job.error = 'Something went wrong preparing the start image. Credits went back to your balance.'; return;
        }
        if ((job.status as string) === 'canceled') return;
        job.input.videoPath = path.join(DATA_DIR, still); job.input.videoUrl = `/files/${still}`; // mock AFTER comes from server/samples
      }
      const label = job.input.types.map((t: string) => c.types.find((p) => p.id === t)?.label ?? t).join(' + ');
      return mockRun(job, stages, [label], 6000);
    },
  };
}

const t = (group: string, id: string, label: string, prompt: string): Preset => ({ id, label, prompt, group });

/** Camera Moves 'New' group: the date each preset group shipped in this repo (first commit 2026-10-16; H3 camera presets
 * landed 2026-10-17 with the H3 additions). New = shipped after the tool launch and within NEW_DAYS; Trending = real job counts (GET /api/camera/categories). */
export const CAMERA_LAUNCH = '2026-10-16';
const CAMERA_ADDED_AT: Record<string, string> = { 'H3 camera': '2026-10-17' };
/** DoP-style camera presets on a still (CLEANROOM dop-camera-motion). Our own preset names. */
/** Page-11 catalogue ids that duplicate an original move: listed once (the original id), still accepted on submit, shown as `aliases` (94 → 88 moves).
 *  2026-10-27 (preset audit): 6 more near-duplicates folded into the original move (88 → 82). */
export const CAMERA_ALIASES: Record<string, string> = { 'pan-l': 'pan-left', 'pan-r': 'pan-right', 'tilt-u': 'tilt-up', 'tilt-d': 'tilt-down', 'impact-shake': 'shake', 'focus-rack': 'focus-pull',
  'push-slow': 'push-in', 'pull-slow': 'pull-out', locked: 'static', 'orbit-r': 'orbit', 'vertigo-in': 'vertigo', 'crash-in': 'snap-zoom' };
export const cameraMoveId = (id: string) => CAMERA_ALIASES[id] ?? id;
const CAMERA_OLD_IDS = new Set(['push-in', 'pull-out', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'static', 'handheld', 'crane-up', 'orbit', 'fpv', 'vertigo', 'flyover', 'whip', 'snap-zoom', 'shake', 'roll', 'focus-pull', 'beat-zoom', 'strobe']);
/** Camera aspect per provider: hosted from their videoCaps (docs.comfy.org); local Wan/LTX workflows take 16:9 / 9:16 / 1:1 (unverified until real ComfyUI); H3 camera follows the keyframe. */
export const CAMERA_ASPECTS: Record<string, string[]> = { 'comfy-open': ['auto', '16:9', '9:16', '1:1'], 'cloud-ltx-camera': ['auto', '16:9', '9:16', '1:1'], 'comfy-h3-camera': ['auto'],
  ...Object.fromEntries(ROUTER_APP_MODELS.map((id) => [id, VIDEO_LIMITS[id]?.aspects ?? ['auto']])) }; // Router: with a photo, the photo is centre-cropped to the aspect (routing/routerModels.ts)
/** DP #21: Photo FX aspect per engine (local Wan 2.2 graph: auto = 16:9 landscape, or 16:9 / 9:16 / 1:1; partner models: their own list). */
export const PHOTO_FX_ASPECTS: Record<string, string[]> = { 'comfy-open': ['auto', '16:9', '9:16', '1:1'], 'comfy-ltx25-video': ['auto', '16:9', '9:16', '1:1'],
  ...Object.fromEntries(ROUTER_APP_MODELS.map((id) => [id, VIDEO_LIMITS[id]?.aspects ?? ['auto']])) };
/** BH12: an app with per-engine aspect lists (Photo FX, Camera Moves) accepts an aspect per route: the local graph's list, or the partner model's own.
 *  Quote and submit share this body (400 code unsupported_aspect, allowed = that engine's list), so the price and the job follow the same engine. */
export function aspectUnsupportedBody(provider: string, ok: string[]) {
  const name = CAMERA_ENGINE[provider] ?? provider; const message = `Aspect must be one of ${ok.join(', ')} on ${provider === 'comfy-open' ? 'the local model' : name}.`;
  return { error: message, errorType: 'validation', code: 'unsupported_aspect', field: 'aspect', allowed: ok, provider, issues: [{ code: 'unsupported_aspect', field: 'aspect', message }] };
}
/** The per-engine aspect check for a quote: null when the tool has no per-engine list, no aspect was sent, or the engine takes it. */
export function aspectForProviderError(tool: ToolDef | undefined, provider: string | undefined, aspect: string | undefined) {
  if (!tool || !provider || aspect == null || aspect === '') return null;
  const inp: any = (tool.inputs ?? []).find((i: any) => i?.name === 'aspect' && i.byProvider); if (!inp) return null;
  const ok: string[] = inp.byProvider[provider] ?? ['auto']; return ok.some((x) => x.toLowerCase() === String(aspect).toLowerCase()) ? null : aspectUnsupportedBody(provider, ok);
}
const CAMERA_PROMPT_PROVIDERS = [...ROUTER_APP_MODELS, 'comfy-open']; // B6 quality order
const OLD_CATEGORY: Record<string, string> = { 'Basic moves': 'Basic', 'Epic moves': 'Orbit', Effects: 'Style', Rhythm: 'Style', 'LTX camera': 'LTX camera', /* BH9: own group, was 'Rig' */ 'H3 camera': 'Rig' };
/** Page-11 fields on every camera preset: category, description, camera{verb,direction,speed,framing}, providers, aspects (union over its providers), order. */
/** Oct 18 #3: the engine a Camera preset runs on, per provider (DP shows modelName instead of matching 'LTX-2 19B' in labels). LTX presets run LTX-2 19B on
 *  comfy-open and cloud-ltx-camera; other comfy-open presets run Wan 2.2 Fun Camera 14B. Same names as /api/models (LTX_CAMERA_MODEL, catalogue names). */
const CAMERA_ENGINE: Record<string, string> = { 'comfy-open': 'Wan 2.2 Fun Camera 14B', 'cloud-ltx-camera': 'LTX-2 19B', 'comfy-h3-camera': 'H3 Camera Motion', 'router-kling': 'Kling', 'router-veo': 'Veo', 'router-seedance': 'Seedance', 'api-minimax-h3': 'MiniMax H3' };
const cameraEngine = (provider: string, ltx: boolean) => (ltx && (provider === 'comfy-open' || provider === 'cloud-ltx-camera') ? 'LTX-2 19B' : CAMERA_ENGINE[provider] ?? provider);
function cameraPresetMeta(x: Preset, i: number): Preset {
  const e = CAMERA_CATALOG.find((c) => c.id === x.id) ?? CAMERA_CATALOG.find((c) => CAMERA_ALIASES[c.id] === x.id); const aliases = Object.keys(CAMERA_ALIASES).filter((a) => CAMERA_ALIASES[a] === x.id); const providers: string[] = (x as any).providers ?? (x.group === 'LTX camera' ? ['comfy-open', 'cloud-ltx-camera'] : CAMERA_PROMPT_PROVIDERS);
  const aspects = [...new Set(providers.flatMap((p) => CAMERA_ASPECTS[p] ?? ['auto']))];
  return { ...x, ...(aliases.length ? { aliases } : {}), category: e?.category ?? OLD_CATEGORY[x.group ?? ''] ?? 'Basic', description: e?.description ?? `${(x.prompt || x.label)[0].toUpperCase()}${(x.prompt || x.label).slice(1)}.`,
    camera: e?.camera ?? null, providers, modelName: cameraEngine(providers[0], x.group === 'LTX camera'), modelNameByProvider: Object.fromEntries(providers.map((p) => [p, cameraEngine(p, x.group === 'LTX camera')])), aspects, aspectsByProvider: Object.fromEntries(providers.map((p) => [p, CAMERA_ASPECTS[p] ?? ['auto']])), order: e?.order ?? 100 + i, loraRecommended: e?.loraRecommended ?? false,
    // placeholder poster (local procedural pipeline: scripts/gen-example-media.py --tool-presets) for the 65 catalogue presets; posterPlaceholder:true until real footage exists
    ...(e && !x.posterUrl ? { posterUrl: `/samples/presets/camera-${e.id}.jpg`, posterPlaceholder: true } : {}) } as Preset;
}
export const cameraApp = makeApp({
  id: 'camera', name: 'Camera Moves', category: 'Video', status: 'new', input: 'image',
  description: 'Turn one start image into a short shot with one preset camera move, 3 or 5 s.',
  types: [
    t('Basic moves', 'push-in', 'Push in', 'slow dolly push in'), t('Basic moves', 'pull-out', 'Pull out', 'slow dolly pull out'),
    t('Basic moves', 'pan-left', 'Pan left', 'smooth pan to the left'), t('Basic moves', 'pan-right', 'Pan right', 'smooth pan to the right'),
    t('Basic moves', 'tilt-up', 'Tilt up', 'tilt up'), t('Basic moves', 'tilt-down', 'Tilt down', 'tilt down'),
    t('Basic moves', 'static', 'Locked off', 'static tripod shot, subtle life'), t('Basic moves', 'handheld', 'Handheld', 'gentle handheld sway'),
    t('Epic moves', 'crane-up', 'Crane rise', 'crane up revealing the scene'), t('Epic moves', 'orbit', 'Orbit', '180° orbit around the subject'),
    t('Epic moves', 'fpv', 'FPV dive', 'fast fpv drone dive'), t('Epic moves', 'vertigo', 'Vertigo', 'dolly zoom, background stretches'),
    t('Epic moves', 'flyover', 'Flyover', 'high aerial flyover'), t('Epic moves', 'whip', 'Whip pan', 'fast whip pan'),
    t('Effects', 'snap-zoom', 'Snap zoom', 'sudden crash zoom'), t('Effects', 'shake', 'Impact shake', 'camera shake on impact'),
    t('Effects', 'roll', 'Barrel roll', 'camera rolls 360°'), t('Effects', 'focus-pull', 'Focus pull', 'rack focus from foreground to subject'),
    t('Rhythm', 'beat-zoom', 'Beat zooms', 'rhythmic zoom pulses'), t('Rhythm', 'strobe', 'Strobe cut', 'quick strobe-like push cuts'),
    // LTX-2 camera-control LoRAs (camera-ltx-api.json; LTX-2 Community License)
    t('LTX camera', 'ltx-dolly-in', 'Dolly in · LTX', 'dolly in'), t('LTX camera', 'ltx-dolly-out', 'Dolly out · LTX', 'dolly out'),
    t('LTX camera', 'ltx-dolly-left', 'Dolly left · LTX', 'dolly left'), t('LTX camera', 'ltx-dolly-right', 'Dolly right · LTX', 'dolly right'),
    t('LTX camera', 'ltx-jib-up', 'Jib up · LTX', 'jib up'), t('LTX camera', 'ltx-jib-down', 'Jib down · LTX', 'jib down'), t('LTX camera', 'ltx-static', 'Static · LTX', 'locked-off static camera'),
    // MiniMax H3 camera_motion_h3 LoRA presets (H3 addition 4; provider comfy-h3-camera; intensity field Slow/Aggressive = LoRA strength)
    ...H3_CAMERA_MOVES.map(([id, label, move]) => ({ ...t('H3 camera', id, `${label} · H3`, `camera motion, ${move}`), providers: ['comfy-h3-camera'] })),
    // Page 11 catalogue (65, cinema/cameraCatalog.ts): ids not already above
  ].concat(CAMERA_CATALOG.filter((e) => !CAMERA_OLD_IDS.has(e.id) && !CAMERA_ALIASES[e.id]).map((e) => ({ id: e.id, label: e.label, prompt: e.prompt, group: e.category })) as Preset[])
   .map((x) => (x.group === 'LTX camera' ? { ...x, license: 'ltx-2-community' as const } : x)).map((x) => ({ ...x, addedAt: CAMERA_ADDED_AT[x.group!] ?? CAMERA_LAUNCH })).map(cameraPresetMeta),
  fields: [{ name: 'intensity', label: 'Intensity', kind: 'select', options: [{ value: 'slow', label: 'Slow' }, { value: 'aggressive', label: 'Aggressive' }], default: 'slow', providers: ['comfy-h3-camera'] } as any],
  mix: 1 /* single-select picker: one move per shot (types.max = app.mix = 1) */, durations: [3, 5], enhance: true, steps: [20, 30, 40], prompt: true, aspects: CAMERA_ASPECTS,
  workflow: 'camera-moves-api.json', extraWorkflows: ['camera-ltx-api.json', 'h3-camera-motion-api.json'], model: 'Wan 2.2 Fun Camera 14B (camera presets)',
  gpuSecPerSec: { '480p': 10, '720p': 21, '1080p': 45 },
  providers: [...ROUTER_APP_MODELS, 'comfy-open', 'comfy-h3-camera', 'cloud-ltx-camera'], // Router photo-first recipes: Seedance 2.0 / MiniMax H3. Cloud-first quality order; choose the first runnable route. cloud-ltx-camera remains a compatibility alias.
  imageOptional: (provider, types) => !cameraImageRequired(provider, types),
});

/** Camera Moves without a start image (text-to-video), per route:
 *  - LTX-2 (local comfy-open with ltx-* moves, cloud-ltx-camera): camera-ltx-api.json with the image conditioning bypassed (LTXVImgToVideoInplace bypass=true,
 *    blank guide image) — the same text-to-video path the Director already uses (comfy/plans.ts director). The end frame (camera-ltx-flf) still works.
 *  - Seedance 2.0 / MiniMax H3 on Comfy Router: their bodies take a prompt without a first frame.
 *  - Wan 2.2 Fun Camera (comfy-open with the non-LTX moves: WanCameraImageToVideo) and MiniMax H3 camera (MiniMaxH3ImageToVideo + camera LoRA): image-to-video only. */
const CAMERA_TEXT_PROVIDERS = new Set(['cloud-ltx-camera', ...ROUTER_APP_MODELS]);
export function cameraImageRequired(provider: string, types: string[] = []): boolean {
  if (CAMERA_TEXT_PROVIDERS.has(provider)) return false;
  if (provider === 'comfy-open') return !(types.length > 0 && types.every((t) => /^ltx-/.test(cameraMoveId(t))));
  return true;
}
/** Oct 18 #6: Translate target language per route (Voice Studio translate, Translate Video). A chosen translate route must voice the language; Auto picks the
 *  first enabled translate route that does; none → 400 unsupported_language (quote = submit, nothing charged). Non-translate jobs pass through. */
export function translateLanguages() { return VOICE_LANGUAGES.map((l) => { const providers = Object.keys(TRANSLATE_LANGS).filter((p) => TRANSLATE_LANGS[p].includes(l.code)); return { ...l, nativeName: LANGUAGE_NATIVE[l.code] ?? l.label, providers, available: providers.length > 0 }; }); }
export function translateRoute(language: string, provider: string | null, usable: string[]): { provider: string | null } | { error: string; errorType: 'validation'; code: 'unsupported_language'; issues: any[]; languages: string[]; languagesByProvider: Record<string, string[]>; providers: string[] } {
  const known = VOICE_LANGUAGES.find((l) => l.code === language); const tr = usable.filter((p) => TRANSLATE_LANGS[p]);
  if (!known) { const msg = "That language isn't on the list. Pick one from the list."; const langs = [...new Set(tr.flatMap((p) => TRANSLATE_LANGS[p]))]; // Oct 19 #5: an unknown code is never echoed back
    return { error: msg, errorType: 'validation', code: 'invalid_language' as any, issues: [{ code: 'invalid_language', field: 'language', message: msg }], languages: langs, languagesByProvider: TRANSLATE_LANGS, providers: tr } as any; }
  const name = known.label;
  const fail = (msg: string, langs: string[]) => ({ error: msg, errorType: 'validation' as const, code: 'unsupported_language' as const, issues: [{ code: 'unsupported_language', field: 'language', message: msg }], languages: langs, languagesByProvider: TRANSLATE_LANGS, providers: tr.filter((p) => TRANSLATE_LANGS[p].includes(language)) });
  const label = (p: string) => (p.includes('chatterbox') ? 'Chatterbox' : p.includes('f5') ? 'F5-TTS' : p);
  if (provider && TRANSLATE_LANGS[provider]) return TRANSLATE_LANGS[provider].includes(language) ? { provider }
    : fail(`${label(provider)} can't voice ${name}. ${tr.some((p) => TRANSLATE_LANGS[p].includes(language)) ? `Pick ${tr.filter((p) => TRANSLATE_LANGS[p].includes(language)).map(label).join(' or ')} for ${name}, or another language.` : 'Pick another language.'}`, TRANSLATE_LANGS[provider]);
  if (provider) return { provider }; // not a translate route: unchanged
  const pick = tr.find((p) => TRANSLATE_LANGS[p].includes(language));
  return pick ? { provider: pick } : fail(`No translate route here can voice ${name} yet. Pick another language.`, [...new Set(tr.flatMap((p) => TRANSLATE_LANGS[p]))]);
}
/** Is this job a translate (Voice Studio types translate, or an app locked to it)? → its target language (field, else the app/tool default). */
export function translateJob(tool: ToolDef, fields: Record<string, any>): string | null {
  const G = (tool as any).app?.gallery; const base = G?.base ?? tool.id; if (base !== 'voice') return null;
  const ty = parseTypesField(fields.types ?? G?.locked?.types)[0]; if (ty !== 'translate') return null;
  const def = G?.defaults?.language ?? ((tool as any).fields ?? tool.inputs ?? []).find((f: any) => f.name === 'language')?.default ?? 'en';
  return String(fields.language || def);
}
/** A preset that runs on other models only (H3 moves → H3 Camera Motion): one plain 400 for quote and submit (code unsupported, field types). */
export function presetUnsupportedBody(types: Preset[], off: string, provider: string, names: Record<string, string> = CAMERA_ENGINE) {
  const p: any = types.find((x) => x.id === off); const label = p?.label ?? off; const on = ((p?.providers ?? []) as string[]).map((x) => names[x] ?? x);
  const msg = `${label} isn't available on ${names[provider] ?? 'this model'}. It runs on ${on.join(' or ')}.`;
  return { error: msg, errorType: 'validation', code: 'unsupported', issues: [{ code: 'unsupported', field: 'types', message: msg }], presetProviders: p?.providers ?? [] };
}
/** Camera Auto (no provider sent) with a move that only some models run (H3 moves): the first enabled model that runs every move, else null (quote = submit). */
export function cameraPresetProvider(types: string[], usable: string[]): string | null {
  const lists = types.map((t) => cameraPresetProviders(t)).filter((x): x is string[] => !!x); if (!lists.length || (usable[0] && lists.every((l) => l.includes(usable[0])))) return null; // the default model runs it: Auto unchanged
  return usable.find((p) => lists.every((l) => l.includes(p))) ?? null;
}
/** The move the chosen model can't run (quote check, same rule as the job parser), or null. */
/** Oct 19 #2: the move a Camera job on this model starts with (first preset the model runs): the route listing judges routes on it, like the quote/job. */
export const cameraDefaultMove = (provider: string): string | null => (cameraApp.presets ?? []).find((p) => !cameraPresetOff([p.id], provider))?.id ?? null;
export const cameraPresetOff = (types: string[], provider: string) => types.map(cameraMoveId).find((t) => { const ps = cameraPresetProviders(t); return !!ps && !ps.includes(provider); }) ?? null;
/** A Camera Moves preset's prompt phrase by id (old ids too), from the same preset list the Camera Moves job parser checks: '' for Free camera,
 *  null when the id isn't a move. Generate Video's Look → Camera (job field cameraMove) puts this phrase first, the same rule as a Camera Moves job. */
export const cameraMovePrompt = (id: string): string | null => { const p = (cameraApp.presets ?? []).find((x) => x.id === cameraMoveId(String(id ?? '').trim())); return p ? String(p.prompt ?? '') : null; };
/** The Camera Moves prompt rule: the move's phrase first, then the rest of the prompt (makeApp finalPrompt: typePrompt, then prompt). */
export const moveFirst = (move: string, text: string | null | undefined) => [move, text].filter(Boolean).join('. ');
const cameraPresetProviders = (id: string): string[] | null => ((cameraApp.presets ?? []).find((x) => x.id === cameraMoveId(id)) as any)?.providers ?? null;
/** Providers (in the given order) that run these moves without an image. Auto with no image picks the first; never an image-only route. */
export function cameraTextProviders(types: string[], usable: string[]): string[] {
  return usable.filter((p) => !cameraImageRequired(p, types) && types.every((t) => { const ps = cameraPresetProviders(t); return !ps || ps.includes(p); }));
}
export const parseTypesField = (v: unknown): string[] => { const s = String(v ?? ''); if (!s) return []; try { const t = JSON.parse(s); return (Array.isArray(t) ? t : [t]).map((x) => String(x).trim()).filter(Boolean); } catch { return s.split(',').map((x) => x.trim()).filter(Boolean); } };
/** 400 body when a Camera Moves run has no image and the chosen (or every enabled) route is image-to-video only. */
export function cameraImageRequiredBody(types: string[], provider: string | null, usable: string[]) {
  const alt = cameraTextProviders(types, usable); const moves = types.map((t) => (cameraApp.presets ?? []).find((x) => x.id === cameraMoveId(t))?.label ?? t).join(' + ');
  const NAMES: Record<string, string> = { 'comfy-open': 'LTX-2 19B (local)', 'cloud-ltx-camera': 'LTX-2 19B on Comfy Cloud', 'router-seedance': 'Seedance', 'api-minimax-h3': 'MiniMax H3' };
  const list = (xs: string[]) => { const n = xs.map((x) => NAMES[x] ?? x); return n.length > 1 ? `${n.slice(0, -1).join(', ')} or ${n[n.length - 1]}` : n[0]; };
  const h3 = types.some((t) => (cameraPresetProviders(t) ?? []).every((p) => p === 'comfy-h3-camera'));
  const why = h3 ? 'H3 camera moves run on MiniMax H3 image-to-video only' : provider === 'comfy-h3-camera' ? 'MiniMax H3 camera is image-to-video only' : 'Wan 2.2 Fun Camera is image-to-video only';
  const msg = `Add a start image: ${why}${alt.length ? `. To run ${moves || 'this move'} from text alone, use ${list(alt)}.` : types.some((t) => !/^ltx-/.test(cameraMoveId(t))) && !h3 ? '. Without an image, pick an LTX move or enable Seedance or MiniMax H3.' : h3 ? '. Without an image, pick an LTX move.' : '.'}`;
  return { error: msg, errorType: 'validation', code: 'image_required', issues: [{ code: 'required', field: 'image', message: msg }], textProviders: alt };
}
/** app.capabilities for DP: which routes need the start image. comfy-open needs one except for the LTX moves (imageOptionalPresetsByProvider). */
export function cameraImageCaps() {
  const provs = cameraApp.providers; const ltx = (cameraApp.presets ?? []).filter((x) => /^ltx-/.test(x.id)).map((x) => x.id);
  return { imageRequiredByProvider: Object.fromEntries(provs.map((p) => [p, cameraImageRequired(p)])), imageOptionalPresetsByProvider: { 'comfy-open': ltx }, imageOptional: provs.some((p) => !cameraImageRequired(p) || p === 'comfy-open') };
}

// Old catalogue ids (pan-l, impact-shake, …) still work on submit: mapped onto the listed move before validation.
{ const p0 = cameraApp.parseInput.bind(cameraApp);
  cameraApp.parseInput = async (fields, files) => {
    const f = { ...fields };
    if (f.types) { try { const t = JSON.parse(f.types); if (Array.isArray(t)) f.types = JSON.stringify(t.map((x) => cameraMoveId(String(x)))); } catch { f.types = f.types.split(',').map((x) => cameraMoveId(x.trim())).join(','); } }
    if (f.preset) f.preset = cameraMoveId(f.preset);
    if (!files.image?.length && !files.refs?.length) { const ty = parseTypesField(f.types); const prov = f.provider || cameraApp.providers[0];
      const dr = resolveDuration('camera', prov, f.duration != null && f.duration !== '' ? f.duration : f.seconds); // a bad length reports first (same order as before)
      if (ty.length && cameraImageRequired(prov, ty) && !(dr && 'error' in dr)) return { ...cameraImageRequiredBody(ty, f.provider || null, cameraApp.providers) } as any; }
    const r: any = await p0(f, files); if (!r || r.error) return r;
    // (O) optional end frame (file field endImage) + generateAudio (default true) for the LTX-2 camera presets
    const ltx = (r.types ?? []).some((x: string) => /^ltx-/.test(x)); const end = files.endImage?.[0];
    if (end && ltx) Object.assign(r, { endImagePath: path.join(DATA_DIR, end), endImageUrl: `/files/${end}` });
    else if (end) r.warnings = [...(r.warnings ?? []), 'The end frame was not used: only the LTX camera presets take one.'];
    if (f.generateAudio != null && f.generateAudio !== '') { const v = /^(1|true|on|yes)$/i.test(f.generateAudio) ? true : /^(0|false|off|no)$/i.test(f.generateAudio) ? false : null; if (v == null) return { error: 'generateAudio must be true or false' }; if (ltx) r.generateAudio = v; }
    return r;
  }; }
(cameraApp as any).app = { ...(cameraApp as any).app, moveAliases: CAMERA_ALIASES, capabilities: { ...((cameraApp as any).app?.capabilities ?? {}), ...cameraImageCaps() }, imageOptional: true };
cameraApp.routeInput = () => ({ mode: 'camera' }); // quotes / listings judge routes on the job's own mode (the Router video bodies map Camera Moves jobs)
(cameraApp as any).imageOptional = true; // top-level: some route runs a move from the prompt alone (app.capabilities.imageRequiredByProvider says which)
cameraApp.inputs = cameraApp.inputs.map((x: any) => (x.name === 'image' ? { ...x, required: false, requiredByProvider: cameraImageCaps().imageRequiredByProvider, description: 'Start image (the first frame). Optional on LTX moves and on Seedance / MiniMax H3 (text-to-video); required on Wan Fun Camera and H3 camera.' } : x));
// (O) advertise the optional LTX inputs: endImage (last frame of the last LTX move) and generateAudio (LTX-2 audio track, default on)
cameraApp.inputs = [...cameraApp.inputs.filter((x: any) => !['endImage', 'generateAudio'].includes(x.name)),
  { name: 'endImage', kind: 'file', required: false, accept: 'image/png,image/jpeg,image/webp', presets: 'ltx-*', description: 'Optional last frame: the clip ends on this picture (LTX camera presets only).' } as any,
  { name: 'generateAudio', kind: 'boolean', required: false, default: true, presets: 'ltx-*', description: 'Add the sound LTX-2 generates with the clip (LTX camera presets only).' } as any];

/** Photo FX effects added 2026-10-21 (FEATURE-MAP §2): one prompt template each on the existing image-to-video route, every model.
 *  `addedAt` drives /api/presets?sort=new and the homepage order; `description` is the one-line card text. Our own names and wording. */
const fx = (group: string, id: string, label: string, description: string, prompt: string): Preset => ({ id, label, group, description, prompt, addedAt: '2026-10-21' });
export const PHOTO_FX_NEW: Preset[] = [
  fx('Physics', 'slow-fall', 'Slow fall', 'Tip back and drift down through open air.', 'the subject tips backward and falls slowly through open air, hair and clothes fluttering upward, the camera gliding down alongside them'),
  fx('Physics', 'backflip', 'Backflip', 'One clean backflip, landed on the spot.', 'the subject bends their knees, springs up and lands a clean backflip on the same spot in one smooth motion, steady camera'),
  fx('Physics', 'dust-away', 'Dust away', 'Crumble into glowing dust that blows off.', 'the subject crumbles into fine glowing dust from the edges inward, the particles carried away on the wind until only the empty background is left'),
  fx('Elements', 'flame-aura', 'Flame aura', 'Calm, unharmed, wrapped in bright flames.', 'bright stylised flames rise along the outline of the subject, who stays calm and unharmed, sparks drifting up into dark air'),
  fx('Elements', 'ice-statue', 'Ice statue', 'Frost climbs up and freezes you solid.', 'frost creeps up from the ground and the subject freezes into a clear ice statue, cold mist rolling off, light glinting through the ice'),
  fx('Transform', 'fade-out', 'Fade out', 'Turn see-through and vanish from the shot.', 'the subject slowly turns translucent and fades out of the frame, leaving the empty scene behind them'),
  fx('Transform', 'clone-crowd', 'Clone crowd', 'Copy after copy until the frame is full.', 'copy after copy of the subject steps into the frame from both sides until a crowd of identical clones fills the whole scene'),
  fx('Transform', 'scene-hop', 'Scene hop', 'You stay put while the world keeps changing.', 'the subject stays in place while the world around them morphs smoothly through different places: a sunny beach, a neon city street, a snowy forest'),
  fx('Camera', 'eye-dive', 'Eye dive', 'Push into the eye and through the iris.', "the camera pushes straight into the subject's eye and travels through the iris into a glowing swirl of colour"),
  fx('Camera', 'coaster-rush', 'Coaster rush', 'Front seat of a roller coaster at full speed.', 'the subject rides in the front seat of a speeding roller coaster, wind rushing through their hair, the track dropping away below'),
  fx('Camera', 'picture-loop', 'Picture loop', 'Zoom into a photo of the same shot, again and again.', 'the subject holds up a framed photo of this same scene and the camera zooms into the photo, again and again, in an endless loop'),
];
/** Photo FX effects that need a LoRA on local LTX-2.5 22B (2026-10-26; registry shared/ltxLoras.ts). They run on that model only (providers),
 *  so the effect card names it (modelName) and picking one switches the model. Exploded view: XPLDV (DigitalByte), strength 0.5 for a start frame. */
const loraFx = (group: string, id: string, label: string, description: string): Preset => { const l = LTX_LORAS[PHOTO_FX_LTX_LORA[id]];
  return { id, label, group, description, prompt: ltxLoraPrompt(l.id), addedAt: '2026-10-26', providers: ['comfy-ltx25-video'], modelName: `LTX-2.5 22B + ${l.label.replace(/^.*\((.+)\)$/, '$1')} LoRA`,
    lora: { id: l.id, file: l.file, folder: l.folder, bytes: l.bytes, sourceUrl: l.sourceUrl, credit: l.credit } } as Preset; };
export const PHOTO_FX_LORA: Preset[] = [
  loraFx('Transform', 'exploded-view', 'Exploded view', 'Your object comes apart into a neat exploded view. Name it in the prompt.'),
];
/** Photo FX model names for messages (the shared map names Camera Moves' engines). */
const PHOTO_FX_ENGINE: Record<string, string> = { ...CAMERA_ENGINE, 'comfy-open': 'Wan 2.2 I2V 14B', 'comfy-ltx25-video': 'LTX-2.5 22B' };
/** Photo FX on LTX-2.5 22B: its own two sizes (Draft / Sharper), the same as the Video tab. */
export const PHOTO_FX_LTX_RES = ['448p', '576p'];
/** Example app 1: photo → short VFX clip (CLEANROOM viral-presets-effects). Our own effect names. */
export const photoFxApp = makeApp({
  id: 'photo-fx', name: 'Photo FX', category: 'Apps', status: 'new', input: 'image',
  description: 'Upload a photo, pick an effect, get a short animated clip.',
  types: [
    t('Physics', 'float', 'Zero gravity', 'the subject slowly floats upward'), t('Physics', 'shatter', 'Glass shatter', 'the scene cracks and shatters'),
    t('Elements', 'ember', 'Ember storm', 'glowing embers swirl around the subject'), t('Elements', 'liquid', 'Liquid melt', 'the subject melts into liquid'),
    t('Scale', 'giant', 'City giant', 'the subject becomes giant among buildings'), t('Scale', 'mini', 'Tiny world', 'tilt-shift miniature world'),
    t('Camera', 'freeze', 'Freeze orbit', 'time freezes while the camera orbits'), t('Camera', 'clone', 'Mirror clones', 'the subject multiplies into clones'),
    // more effects (our own names and wording)
    t('Physics', 'levitate-objects', 'Levitating room', 'objects around the subject lift off and drift in the air'), t('Physics', 'ripple', 'Reality ripple', 'the image ripples like water from the centre'),
    t('Physics', 'pixel-break', 'Pixel scatter', 'the subject breaks into small cubes that scatter away'), t('Elements', 'frost', 'Frost bloom', 'ice crystals spread across the scene and the subject'),
    t('Elements', 'bloom', 'Flower burst', 'flowers grow and bloom all around the subject'), t('Elements', 'smoke', 'Smoke reveal', 'thick smoke rolls in and clears to reveal the subject'),
    t('Elements', 'lightning', 'Storm charge', 'blue electric arcs crackle around the subject'), t('Scale', 'zoom-space', 'Earth zoom-out', 'the camera pulls back from the subject up to orbit view'),
    t('Scale', 'dollhouse', 'Dollhouse', 'the scene becomes a cutaway dollhouse model'), t('Camera', 'spin-360', 'Hero spin', 'the camera circles the subject in one fast spin'),
    t('Camera', 'push-portal', 'Portal push', 'the camera pushes through a glowing portal behind the subject'), t('Camera', 'paper-fold', 'Paper fold', 'the scene folds up like a paper pop-up book'),
    // 2026-10-21 quick wins (FEATURE-MAP §2 signature effects): prompt templates on the same I2V route, our own names and wording
    ...PHOTO_FX_NEW,
    ...PHOTO_FX_LORA,
  ],
  refSlots: [{ name: 'character', label: 'Character' }, { name: 'location', label: 'Location' }, { name: 'products', label: 'Products', max: 3 }],
  prompt: true, // optional twist prompt, appended after the effect prompt
  durations: [5], providers: [...ROUTER_APP_MODELS, 'comfy-open', 'comfy-ltx25-video' /* free local LTX-2.5 22B: every effect + the LoRA effects (2–5 s) */] /* B6 quality order; Router: effect prompt recipe + photo as first frame */, aspects: PHOTO_FX_ASPECTS, workflow: 'photo-fx-api.json', model: 'Wan 2.2 I2V 14B + LightX2V 4-step LoRAs, per-effect prompt',
});

// procedural preview (scripts/gen-example-media.py --tool-presets). Live: an effect whose still isn't in server/samples/presets yet gets
// posterUrl/previewWebm null + standIn true (the web shows the branded stand-in tile, never a 404); it is listed in GET /api/posters slots.
for (const p of photoFxApp.presets ?? []) wireSamplePresetMedia(p as any, `presets/photo-fx-${p.id}`);
photoFxApp.routeInput = () => ({ mode: 'photo-fx' });
// LTX-2.5 22B (2026-10-26): Draft / Sharper sizes, and the LoRA effects' prompt (the LoRA's trigger first; your prompt names the object).
(photoFxApp as any).app = { ...(photoFxApp as any).app, resolutionsByProvider: { 'comfy-ltx25-video': PHOTO_FX_LTX_RES }, defaultResolutionByProvider: { 'comfy-ltx25-video': '448p' },
  videoLimits: { 'comfy-ltx25-video': { resolutionLabels: { '448p': 'Draft', '576p': 'Sharper' } } } };
{ const p0 = photoFxApp.parseInput.bind(photoFxApp);
  photoFxApp.parseInput = async (fields, files) => {
    if ((fields.provider || '') !== 'comfy-ltx25-video') return p0(fields, files);
    const res = fields.draft && /^(1|true|on)$/i.test(fields.draft) ? '448p' : fields.resolution || '448p';
    if (!PHOTO_FX_LTX_RES.includes(res)) { const msg = 'Resolution must be Draft (448p) or Sharper (576p) on LTX-2.5 22B.'; return { error: msg, errorType: 'validation', code: 'invalid', issues: [{ code: 'invalid', field: 'resolution', message: msg, allowed: PHOTO_FX_LTX_RES }] } as any; }
    const r: any = await p0({ ...fields, resolution: '720p', draft: '' }, files); if (!r || r.error) return r;
    r.resolution = res; const lora = (r.types as string[]).map((t) => PHOTO_FX_LTX_LORA[t]).find(Boolean);
    if (lora) r.finalPrompt = ltxLoraPrompt(lora, r.prompt); // the LoRA's own wording: "<object> separates into an ordered exploded view. …"
    return r;
  }; } // quotes / listings judge routes on the job's own mode (the Router video bodies map Photo FX jobs)

/** Example app 2: video → video upscale (CLEANROOM upscale). */
export const upscaleApp = makeApp({
  id: 'upscale', name: 'Upscale', category: 'Apps', status: 'new', input: 'video',
  description: 'Make your clip sharper and bigger. The sound stays.',
  types: [t('Mode', 'precise', 'Precise', 'faithful upscale'), t('Mode', 'creative', 'Creative', 'detail-adding upscale'), t('Mode', 'smooth60', '60 fps smooth', 'upscale + frame interpolation to 60 fps')],
  scales: [1.5, 2, 3, 4], defaultScale: 2, maxLongSide: 3840, imageHintTool: 'image-upscale',
  // scene presets (our names): prompt modifiers only, no price effect.
  scenes: [t('Scene', 'ai-gen', 'AI-generated clip', 'clean up AI-generation artifacts, keep faces and text stable'), t('Scene', 'short-series', 'Short series / drama', 'cinematic drama footage, natural skin, keep film look'),
    t('Scene', 'ugc', 'Phone / UGC', 'handheld phone footage, reduce compression noise, keep it natural'), t('Scene', 'old-film', 'Old film', 'restore old film footage, reduce grain and scratches, keep period colour')],
  // 8K is offered only where an engine really supports it: SeedVR2 here is wired to a 3840 px long side and BFL caps output at ~14.4 MP, so today no engine allows 8K (clean 400).
  outputTargets: { '4k': 3840, '8k': 7680 }, maxLongSideByProvider: { 'comfy-open': 3840, 'direct-flux3-upscale': 3840 },
  // SeedVR2 local: 2× / 4×; BFL FLUX Video Upscale: 1.5×–3× (docs.bfl.ai/flux_tools/flux_video_upscale)
  scalesByProvider: { 'comfy-open': [2, 4], 'direct-flux3-upscale': [1.5, 2, 3] },
  prompt: true, resolutions: ['1080p'], workflow: 'upscale-api.json', extraWorkflows: ['upscale-creative-api.json', 'upscale-60fps-api.json'], model: 'SeedVR2 3B (Precise) / 7B (Creative) / 3B + RIFE (60 fps)',
  gpuSecPerSec: { '480p': 4, '720p': 6, '1080p': 8 },
  // FLUX 3 Upscaler: hosted, coming soon (mock placeholder, unpriced, all routes unavailable). Last = never the default.
  providers: ['comfy-open', 'direct-flux3-upscale'],
});

for (const p of upscaleApp.presets ?? []) p.posterUrl ??= `/samples/presets/upscale-${p.id}.jpg`;
for (const p of (upscaleApp.app?.scenes ?? []) as Preset[]) p.posterUrl ??= `/samples/presets/upscale-scene-${p.id}.jpg`;

// ---- Apps gallery: one-purpose preset tools declared as data (per spec). ----
// Each entry = base tool + locked params + exposed fields; registered as its own runnable tool `app-<id>` and listed at GET /api/apps.
/** One option of a one-output-per-pick app (Shots angles, Ad Pack styles). */
export type PerOutputOption = AppOption & { description?: string; prompt?: string; mockVf?: string };
export interface GalleryApp {
  id: string; name: string; description: string; category: string; poster: string | null;
  base: string; locked: Record<string, string>; exposed: string[];
  /** Optional prompt template; `{prompt}` = the user's text (blank allowed). Apps with `compose` build the prompt from their own fields instead. */
  promptTemplate?: string;
  /** Display labels for exposed inputs (e.g. image → "Product image"). A labelled input is optional unless it is in `required`. */
  labels?: Record<string, string>;
  /** Mode switch by upload: when this file field is sent, `types` becomes the given value instead of the locked one (Product Shot: a photo → Edit image; UGC Ad: a product or presenter photo → Reference to video). */
  modeWhenFile?: Record<string, string>;
  // ---- LOW-ROWS-SPEC (Oct 18) ----
  /** Web renderer override (Orbit Shot: 'app' = AppTool, not the inherited Director page). */
  ui?: string;
  /** Only these engines (Orbit Shot: LTX-2 camera + Wan Fun Camera). */
  providers?: string[];
  /** Defaults for fields the user left blank (not locks: the user may change them). A duration default falls back to the longest allowed length ≤ it for the model. */
  defaults?: Record<string, string>;
  /** App-level clip lengths for models without their own videoCaps row (Orbit Shot 5 / 10 s); quote and submit use the same rule. */
  durations?: number[];
  /** App-only fields (tiles, sliders, colour). Stored on job.input under the same names (Recreate restores them); composed into the prompt server side. */
  fields?: AppField[];
  /** The prompt peek's line for an app whose models take no prompt (Try-On). */
  noPrompt?: string;
  /** Builds the prompt from the user's text + the app fields. */
  compose?: (v: Record<string, string>, ctx: { prompt: string; has: (file: string) => boolean; /** the picked engine (provider id), when the request names one */ provider?: string; /** apps with `brand`: the kit in use */ brandKit?: BrandKit | null; /** the logo apps: "Use brand colours" is on (a touch of the palette, brandAccentWords) */ brandColours?: boolean;
    /** that engine's prompt cap (shared/promptGrammar.ts limits.maxChars), so a recipe can pick its short wording; the route check still refuses what doesn't fit */ maxChars?: number }) => string;
  /** Locks that follow the app fields and the engine (2026-10-25, Character Sheet: each layout's own aspect, snapped to the model). Applied
   *  after `locked` on submit and on the quote (appQuoteParams), so the price and the run use the same shape. */
  lockedFor?: (v: Record<string, string>, ctx: { provider?: string; mode: string }) => Record<string, string>;
  /** The field lockedFor reads (default: the app's tiles field), so every value it can give is allowed (Ad Pack: placement). */
  lockedField?: string;
  /** App-only file inputs (Orbit Shot `image` = subject photo; UGC Ad `presenterImage`). */
  extraInputs?: Record<string, any>[];
  /** File fields that must be present (400 `required` otherwise). Arrays = any one of them. */
  required?: (string | string[])[];
  /** A photo in `file` OR a typed prompt (Product Shot: a product photo or a description); neither → 400 `required` with `message`. */
  fileOrPrompt?: { file: string; message: string };
  /** Locked values worth a read-only chip next to the title (e.g. 9:16 on UGC Ad). */
  showLocked?: string[];
  /** Narrowed options for an exposed select (value → the base value it runs as). Change Voice / Translate: only the voices that really differ. */
  inputOptions?: Record<string, { value: string; label: string; runsAs: string; help?: string }[]>;
  /** Uploads → the base tool's file fields (Orbit Shot image → refs[0]; UGC Ad presenter + product → 2 references). */
  fileMap?: (files: Record<string, string[]>) => Record<string, string[]>;
  /** Plain-language limits shown under the composer (what the engine can and can't do here). */
  notes?: string[];
  /** Extra data for DP (catalogue filters, per-route language lists). */
  extra?: Record<string, unknown>;
  /** Engines outside the base tool's own list that only this app offers (Shots: the multiple-angles LoRA route). They take the app's locked mode. */
  extraProviders?: string[];
  /** Page URL when it differs from /tools/app-<id> (renamed image features: Brush Edit = /tools/brush-edit; the old URL redirects in the web). */
  route?: string;
  /** One output per picked option, each with its own prompt (Shots: camera angles). The job runs n = picked options; price = n × the one-output
   *  price (routing/select.ts routeCredits caps n at `max`, not Create Image's 4). Field value: JSON array or comma list; blank = every option. */
  perOutput?: { field: string; label: string; options: PerOutputOption[]; max: number; parse: (raw: unknown) => { ids: string[] } | { error: string; code: string };
    /** Ad Pack: the options picked when nothing is sent (else every option) */ defaults?: string[];
    prompt: (o: PerOutputOption, userPrompt: string, ctx: { vals: Record<string, string>; provider?: string; has: (file: string) => boolean; brandKit: BrandKit | null }) => string };
  /** The app words the brand itself (Ad Pack, Product Shot, Phone Photo, UGC Ad; shared/brandKit BRAND_APPS): Brand's kit reaches compose / perOutput as ctx.brandKit and the job as brandKitId; no phrase is added to the prompt. */
  brand?: boolean;
  /** After the base tool parsed the job (files saved, sizes readable): a check that needs the files (Expand: the photo's shape vs the target), or
   *  extra keys for the run. `{ error }` = 400 with that field and code, nothing charged. Runs on submit only (a quote has no files). */
  prepare?: (r: Record<string, any>, vals: Record<string, string>) => Promise<{ error: { field: string; message: string; code: string } } | Record<string, any>>;
  /** App fields the base tool also reads (Image to layers: imageResolution → Create Image's per-model caps check and the per-size price, quote = charge). */
  passFields?: string[];
  /** Last step of the job input (after the base tool parsed it): extra keys for the run (output label, mock inset). */
  finish?: (r: Record<string, any>) => Record<string, any>;
  /** Fixed routing fields for quotes and listings (ToolDef.routeInput), so a route judges the app's job like the submit does. */
  routeInput?: ToolDef['routeInput'];
  /** Workflows page card: a before / after split preview (real input photo and real result under web/public). Both URLs or none; labels default to "Before" / "After". */
  previewBefore?: string; previewAfter?: string; previewLabels?: [string, string];
  /** Which model (and where) really made the preview: "Model · Where", shown under the card as "Preview made with Model on where". */
  previewModel?: string;
}
/** Orbit Shot Auto prompt: used when the prompt box is empty (free: plain text, no extra model call). */
export const ORBIT_AUTO_PROMPT = 'the subject from the photo, centred in frame, sharp detail, smooth steady camera';
const pick = (opts: AppOption[], v: string | undefined) => opts.find((o) => o.value === v);
/** Relight on the Qwen edit models: the change asked for clearly, and only identity / pose / clothes / framing locked (not the light). */
const QWEN_EDIT = new Set(['comfy-qwen21', 'comfy-qwen21-turbo', 'comfy-qwen-image']);
export const RELIGHT_CHANGE = 'the light direction, shadows, highlights and colour of the whole image change clearly to match this new light';
export const RELIGHT_KEEP = 'keep the same person, face, pose, clothes and framing';
/** Relight looks: which prompt wording a model gets. 'qwen' = new light first, clear change, identity lock (2026-10-22 lesson);
 *  'sentence' = GPT Image / Nano Banana, which follow plain instruction sentences best; 'flux' = everything else (FLUX, Seedream…), today's order. */
export type RelightFamily = 'qwen' | 'sentence' | 'flux';
const NANO_BANANA = /^(api-nano-banana|direct-gemini-nb)/;
export const relightFamilyOf = (provider?: string): RelightFamily => !provider ? 'flux' : QWEN_EDIT.has(provider) ? 'qwen' : /^api-gpt-image/.test(provider) || NANO_BANANA.test(provider) ? 'sentence' : 'flux';
/** Where the keep sentence goes (shared/promptPatterns.ts relight): first on Nano Banana (Comfy's NB2 relight template locks identity first), last elsewhere. */
export const relightKeepFirst = (provider?: string) => patternFor('relight', provider && NANO_BANANA.test(provider) ? 'nano-banana' : provider && /^api-gpt-image/.test(provider) ? 'gpt-image' : null)?.keep === 'first';
const keepPlaced = (provider: string | undefined, parts: string[]) => (relightKeepFirst(provider) ? [RELIGHT_SENTENCE_KEEP, ...parts] : [...parts, RELIGHT_SENTENCE_KEEP]).filter(Boolean).join(' ');
/** FLUX-type models also get a short "make it visible" line (a soft white light from the left barely changed a real FLUX.2 klein run). */
export const RELIGHT_LOOK_CHANGE = 'the new lighting is clearly visible across the whole image';
export const RELIGHT_SENTENCE_CHANGE = 'Only the lighting changes: shadows, highlights and colour across the whole image follow the new light.';
export const RELIGHT_SENTENCE_KEEP = 'Keep the same person, face, expression, pose, clothes, objects and framing exactly as they are.';
/** Relight with the light sphere's rig (shared/lightRig.ts): direction in words plus degrees, height, the named colour temperature, softness,
 *  rim light and ambient, worded per model family like the looks. A look (or a sphere preset) names the setup; a look keeps its rich
 *  description, but its fixed colour temperature gives way to the rig's own (the sphere always states it). */
export function relightRigPrompt(rig: LightRig, look: string | undefined, userPrompt: string, provider?: string): string {
  const fam = relightFamilyOf(provider); const L = relightLookOf(look); const P = rigPhrases(rig);
  const setup = L?.light || spherePresetOf(rig.preset)?.light || ''; const desc = L?.prompt;
  const key = `key light ${P.keyDir}, ${P.keyTint}`;
  if (fam === 'qwen') return joinPrompt(`Relight the scene${setup ? ` with ${setup}` : ''}: ${key}`, P.quality, P.rim, P.ambient, desc, userPrompt, RELIGHT_CHANGE, RELIGHT_KEEP);
  if (fam === 'sentence') { const S = (x?: string) => (x && x.trim() ? `${x.trim()[0].toUpperCase()}${x.trim().slice(1).replace(/[.;,]+$/, '')}.` : '');
    return keepPlaced(provider, [`Relight this photo${setup ? ` with ${setup}` : ''}.`, S(`The key light comes ${P.keyDir}; ${P.keyTint}`), S(`Light quality: ${P.quality}`), P.rim ? S(`Add a ${P.rim}`) : '', S(P.ambient),
      desc ? S(`The setup: ${desc}`) : '', S(userPrompt), RELIGHT_SENTENCE_CHANGE]); }
  return joinPrompt(`relight the scene${setup ? ` with ${setup}` : ''}`, key, P.quality, P.rim, P.ambient, desc, userPrompt, RELIGHT_LOOK_CHANGE, 'keep the subject, pose and composition unchanged');
}
/** The Relight prompt, worded per model family (Qwen / sentence / FLUX-type) with or without a look. A `light` rig (the light panel) words the
 *  light precisely; untouched fields (no rig, no look, every light field at its default) use the panel's starting light, DEFAULT_RIG, so the
 *  first run shows a clear change and names the spot the panel shows. Old drafts and links with their own light fields keep their light. */
export function relightPrompt(v: Record<string, string>, userPrompt: string, provider?: string): string {
  const pr = v.light ? parseLightRig(v.light) : null; if (pr && 'rig' in pr) return relightRigPrompt(pr.rig, v.look, userPrompt, provider);
  if (lightUntouched(v)) return relightRigPrompt(DEFAULT_RIG, undefined, userPrompt, provider);
  const pad = v.lightX !== '' && v.lightX != null && v.lightY !== '' && v.lightY != null ? padPhrase(Number(v.lightX), Number(v.lightY)) : pick(RELIGHT_DIRECTIONS, v.direction)?.prompt;
  const light = `${brightnessWord(Number(v.brightness))} ${colourName(v.color)} light`; const quality = pick(RELIGHT_QUALITY, v.lightQuality)?.prompt;
  const fam = relightFamilyOf(provider); const L = relightLookOf(v.look); const named = L ? ` with ${L.light}` : '';
  // the look's colour temperature only while the colour is still its own (a teal light on "Golden hour" drops "warm golden sunlight")
  const tone = L && String(v.color ?? '').toUpperCase() === L.sets.color.toUpperCase() ? L.tone : '';
  // Qwen edit models (2026-10-22 real runs): a "keep … unchanged" lock made them hold the old light. Name the new light first, ask for a clear
  // change of light, shadows and colour, and lock only identity, pose, clothes and framing.
  if (fam === 'qwen') return joinPrompt(`Relight the scene${named}: ${light}, ${pad}`, L?.prompt, tone, quality, userPrompt, RELIGHT_CHANGE, RELIGHT_KEEP);
  if (fam === 'sentence') { const S = (x?: string) => (x && x.trim() ? `${x.trim()[0].toUpperCase()}${x.trim().slice(1).replace(/[.;,]+$/, '')}.` : '');
    return keepPlaced(provider, [`Relight this photo${named}.`, S(`The main light is ${light.replace(/ light$/, '')}${pad?.startsWith('light ') ? `, ${pad.replace(/^light /, 'coming ')}` : `: ${pad}`}`), L ? S(`The setup: ${L.prompt}`) : '', tone ? S(`Colour temperature: ${tone}`) : '', S(quality), S(userPrompt), RELIGHT_SENTENCE_CHANGE]); }
  return joinPrompt(`relight the scene${named}`, pad, quality, light, L?.prompt, tone, userPrompt, RELIGHT_LOOK_CHANGE, 'keep the subject, pose and composition unchanged');
}
/** Material Swap (2026-10-31): the object in image 1 takes the material of image 2; everything else stays. Our own wording, after the official
 *  Qwen-Image-Edit-2511 "change material" pattern (give the object the new texture "instead of its" old material). Written with "image 1 / image 2":
 *  the shared prompt rules (shared/promptRefs.ts) turn those into each model's own tokens (<image1> on Qwen Image 2.1). Each family gets its
 *  own sentence shape: Qwen one blanket keep clause; Nano Banana "Using … change only …, preserving …"; GPT Image a role per image + "change only";
 *  Seedream names what stays fixed. Blank fields read as "the main object" and "its current material". */
export type MaterialFamily = 'qwen' | 'nano' | 'gpt' | 'seedream';
export const materialFamilyOf = (provider?: string): MaterialFamily => /^api-nano-banana|^direct-gemini/.test(provider ?? '') ? 'nano' : /^api-gpt-image/.test(provider ?? '') ? 'gpt' : /^api-seedream/.test(provider ?? '') ? 'seedream' : 'qwen';
export const MATERIAL_TEXT_MAX = 60;
const bare = (x?: string) => String(x ?? '').replace(/\s+/g, ' ').trim().replace(/^(a|an|the)\s+/i, '').replace(/[.;,:]+$/, '');
const sentence = (x?: string) => { const t = String(x ?? '').replace(/\s+/g, ' ').trim().replace(/[.;,\s]+$/, ''); return t ? `${t[0].toUpperCase()}${t.slice(1)}.` : ''; };
/** The model key a swap's prompt pattern is picked by (shared/promptPatterns.ts: the key, then its family, then the shared row). */
const swapPatternModel = (provider?: string) => (provider ? gridModelOf(provider, 'edit') ?? provider : null);
export function materialSwapPrompt(v: Record<string, string>, userPrompt: string, provider?: string): string {
  const obj = bare(v.object) || 'main object'; const was = bare(v.fromMaterial); const old = was ? `its ${was}` : 'its current material'; const touch = sentence(userPrompt);
  const fam = materialFamilyOf(provider); const join = (...xs: string[]) => xs.filter(Boolean).join(' ');
  if (fam === 'nano') return join(`Using image 1 and image 2, change only the material of the ${obj} in image 1: give it the material and texture shown in image 2 instead of ${old}.`, touch,
    'Keep everything else in image 1 the same, preserving the original shape, lighting and composition.');
  if (fam === 'gpt') return join(`Image 1: the photo with the ${obj}. Image 2: the material reference. Give the ${obj} in image 1 the material and texture from image 2 instead of ${old}.`, touch,
    'Change only its material; keep everything else the same.');
  if (fam === 'seedream') return join(`Replace ${was ? `the ${was}` : 'the material'} of the ${obj} in image 1 with the material and texture from image 2.`, touch,
    `Keep the ${obj}'s shape, the background, the lighting and the framing of image 1 unchanged.`);
  return join(`Give the ${obj} in image 1 the material and texture from image 2 instead of ${old}.`, touch, 'Keep everything else in image 1 unchanged.');
}
/** Character Sheet (rewritten Oct 22; layouts 2026-10-25, our own wording): the subject, the layout's panels (appRows CHARACTER_LAYOUTS), one grey
 *  studio backdrop and light for every panel, then a "keep" block that fits the layout (feet and no body cropping only where there are full-body panels).
 *  2026-11-01: with a photo the subject is "the person in image 1 (your words)" (each model reads its own token, and the words pick the person in a
 *  group photo); the photo-realism words only when your words name no style (anime, illustration, 3D… keep their style in every panel). */
const CHARACTER_STUDIO = 'Every panel has the same plain neutral grey seamless studio backdrop and soft, even, almost shadowless light';
const CHARACTER_PHOTO_LOOK = 'neutral 5600K white balance, natural skin texture with visible detail, catchlights in the eyes';
const CHARACTER_REAL_TAIL = 'sharp, realistic photo'; const CHARACTER_STYLED_TAIL = 'in the style described above, the same style in every panel';
/** Words that name a look other than a photo: the sheet keeps it instead of asking for a realistic photo. */
export const CHARACTER_STYLE_WORDS = /\b(anime|manga|chibi|cartoons?|cartoony|toon|comics?|comic[- ]book|illustrat\w*|drawing|drawn|sketch\w*|line[- ]art|3d|cgi|rendered|render|low[- ]poly|voxel|clay|claymation|stop[- ]motion|paintings?|painterly|watercolou?rs?|oil[- ]paint\w*|gouache|pixel[- ]?art|vector|cel[- ]shaded|stylis\w*|styliz\w*|figurine|plush|lego)\b/i;
export const characterStyled = (words: string) => CHARACTER_STYLE_WORDS.test(String(words ?? ''));
/** Your words as the sheet's subject: one line, no trailing . ; , : (the sheet's own colon follows), no leading "character (reference) sheet of". */
export const characterSheetWords = (words: string) => String(words ?? '').replace(/\s+/g, ' ').trim().replace(/^(?:an?\s+)?character\s+(?:reference\s+)?sheet(?:\s+of\b)?[\s,:;.-]*/i, '').replace(/[\s.;,:]+$/, '');
const characterSubject = (words: string, fromPhoto: boolean) => { const w = String(words ?? '').trim().replace(/[\s.;,:]+$/, '');
  return fromPhoto ? `the person in image 1${w ? ` (${w})` : ''}` : w || 'one character'; };
export const characterLayoutOf = (v?: string) => CHARACTER_LAYOUTS.find((l) => l.value === v) ?? CHARACTER_LAYOUTS[0];
export function characterKeep(l: CharacterLayout, fromPhoto: boolean, styled = false): string {
  const k = l.keep; const what = k.fullBody ? ', body proportions and the complete outfit and accessories' : ' and the clothing and accessories in view';
  return [`exactly one identical person in ${k.views}: the same face, hair, skin tone${what}${fromPhoto ? ' from image 1' : ''}`, k.extra, k.fullBody ?? '',
    `no extra people, no text, no props${k.fullBody ? ', no cropping of the body' : ''}`, styled ? CHARACTER_STYLED_TAIL : CHARACTER_REAL_TAIL].filter(Boolean).join('; ');
}
export const CHARACTER_KEEP = characterKeep(CHARACTER_LAYOUTS[0], false);
/** The short sheet (2026-10-26) for models whose prompt cap the full one overflows (Wan 2.5 Image: 800 characters, the full Classic sheet is ~960):
 *  the same panels, one plain backdrop, the same person and outfit, a neutral pose. */
export function characterSheetShort(words: string, fromPhoto: boolean, l: CharacterLayout): string {
  const styled = characterStyled(words);
  return `Character reference sheet of ${characterSubject(words, fromPhoto)}: ${l.short}. Plain neutral grey studio backdrop and soft even light in every panel. `
    + `Keep exactly one identical person: the same face, hair and outfit${fromPhoto ? ' as in image 1' : ''} in every panel${l.keep.fullBody ? ', neutral relaxed standing pose, feet in frame' : ', only the expression changes'}; no extra people, no text; ${styled ? CHARACTER_STYLED_TAIL : CHARACTER_REAL_TAIL}`;
}
/** The sheet prompt. `words` = your words (with a photo they say which person, or add detail; without one they describe the character); `layout` =
 *  a CHARACTER_LAYOUTS value (Classic by default). `maxChars` = the model's prompt cap: over it, the short sheet (still too long = the route refuses
 *  with the usual message). */
export const characterSheetPrompt = (words: string, fromPhoto: boolean, layout?: string, maxChars?: number) => { const L = characterLayoutOf(layout); const styled = characterStyled(words);
  const full = `Character reference sheet of ${characterSubject(words, fromPhoto)}: ${L.prompt}. ${CHARACTER_STUDIO}${styled ? '' : `, ${CHARACTER_PHOTO_LOOK}`}. Keep ${characterKeep(L, fromPhoto, styled)}`;
  return maxChars && full.length > maxChars ? characterSheetShort(words, fromPhoto, L) : full; };
/** A provider id's (or model key's) prompt cap, for compose (the grammar's limit; null = none known). */
export const providerPromptCap = (provider?: string): number | undefined => { if (!provider) return undefined;
  return (promptGrammarOf(provider) ?? promptGrammarOf(gridModelOf(provider)))?.limits?.maxChars ?? undefined; };
/** A layout's frame on this model (2026-10-25): its own shape when the model takes it, else the nearest one it takes (21:9 → 16:9). Edits on a
 *  model that keeps the photo's shape stay on the recipe's locked 4:3 (the bar fits the photo to it first, shared/workflows.ts photoFitOf): null. */
/** Ad Pack styles: a JSON list or comma list of style ids; blank = the three default styles (adPack.ts AD_STYLE_DEFAULT). */
export function parseAdStyles(raw: unknown): { ids: string[] } | { error: string; code: string } {
  const t = String(raw ?? '').trim(); if (!t) return { ids: [...AD_STYLE_DEFAULT] };
  let xs: unknown; try { xs = JSON.parse(t); } catch { xs = t.split(','); }
  const ids = [...new Set((Array.isArray(xs) ? xs : [xs]).map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return { error: 'Pick at least one style.', code: 'required' };
  if (ids.some((x) => !AD_STYLE_IDS.includes(x))) return { error: `That style isn't on the list. Pick from: ${AD_STYLES.map((a) => a.label).join(', ')}.`, code: 'invalid' };
  return { ids: AD_STYLE_IDS.filter((x) => ids.includes(x)) };
}
export function sheetAspect(want: string, provider: string | undefined, mode: string): string | null {
  const c = provider ? capsFor(provider) : null; if (!c) return want;
  if (mode === 'edit' && c.edit && !c.edit.aspects.length) return null;
  const list = mode === 'edit' && c.edit ? c.edit.aspects : c.aspects;
  return list.includes(want) ? want : closestAspect(list, ratioOf(want)) ?? want;
}
const joinPrompt = (...xs: (string | undefined | false)[]) => xs.filter((x) => x && String(x).trim()).map((x) => String(x).trim().replace(/[.;,]+$/, '')).join('; ');
/** The logo apps' "Use brand colours" words ('' when off or no kit): a touch of the palette on small things (shared/brandKit BRAND_ACCENTS). */
const brandAccents = (c: { brandKit?: BrandKit | null; brandColours?: boolean }, id: string) => (c.brandKit && c.brandColours ? brandAccentWords(c.brandKit, BRAND_ACCENTS[id]) : '');
/** Product Shot / Phone Photo with Brand: the kit's logo goes onto the finished picture by our code, small, bottom right (adPackLogo.ts
 *  stampAdLogos, the plain picture kept as plainUrl, the viewer's Adjust logo to move or remove it). A kit with no logo: nothing. */
function brandLogoFinish(r: Record<string, any>): Record<string, any> {
  const k = r.brandKitId ? getBrandKit(String(r.brandKitId)) : null; return k && logoFor(k, 'main') ? { adLogo: { kit: k.id, ...BRAND_LOGO_SPOT } } : {};
}
export const APP_GALLERY: GalleryApp[] = [
  { id: 'character-sheet', name: 'Character Sheet', category: 'Image', base: 'create-image', poster: null, description: 'One image, same person in several panels on a flat background: a reusable reference.',
    // Oct 22: an optional photo of the person switches to Edit image (same face, hair and outfit; edit-capable models only, as Product Shot); no photo = text-to-image.
    providers: GENERATE_MODELS /* shared/imageFeatures.ts: models that really work here */, // Landscape 4:3 for three tall panels (every listed model takes 4:3); no style preset (the sheet prompt sets backdrop and light itself).
    // Local Qwen Image 2.1 edit: plans.ts sizes the output to this aspect instead of following the photo (CHARACTER_SHEET_TOOLS).
    // Layouts (2026-10-25): the locked 4:3 is Classic's; lockedFor gives each layout its own shape, snapped to the model (sheetAspect). Price unchanged: one image.
    locked: { types: '["generate"]', aspect: '4:3' }, modeWhenFile: { image: '["edit"]' }, exposed: ['image', 'prompt', 'provider', 'seed', 'layout'],
    labels: { image: 'Your photo' }, previewBefore: '/examples/workflows/character-sheet-before.jpg', previewAfter: '/examples/workflows/character-sheet-after.jpg', previewLabels: ['Your photo', 'Character sheet'],
    previewModel: `Qwen Image 2.1 · ${LOCAL_LABEL}`,
    // no promptTemplate (2026-10-25): it was the whole composed sheet, and the subject box must only ever hold your words
    fileOrPrompt: { file: 'image', message: 'Add a photo of the person or describe the character.' },
    fields: [{ name: 'layout', label: 'Layout', kind: 'select', control: 'tiles', options: CHARACTER_LAYOUTS, default: CHARACTER_LAYOUT_DEFAULT }],
    lockedFor: (v, c) => { const a = sheetAspect(characterLayoutOf(v.layout).aspect, c.provider, c.mode); return a ? { aspect: a } : {} as Record<string, string>; },
    compose: (v, c) => characterSheetPrompt(characterSheetWords(c.prompt), c.has('image'), v.layout, c.maxChars) },
  // T23: a product photo switches to Edit image (keeps the product); no photo = text-to-image. Scene tiles are prompt modifiers.
  { id: 'product-shot', name: 'Product Shot', category: 'Image', base: 'create-image', poster: null, description: 'Turn a product photo into a clean studio or lifestyle shot; the product stays as it is.',
    providers: GENERATE_MODELS, locked: { types: '["generate"]', style: 'product', enhance: '1' }, modeWhenFile: { image: '["edit"]' }, exposed: ['image', 'prompt', 'aspect', 'provider', 'resolution', 'rights', 'seed', 'scene'],
    labels: { image: 'Product photo' }, promptTemplate: 'product photo of the uploaded item: {prompt}', fileOrPrompt: { file: 'image', message: 'Add a product photo or describe the product.' },
    fields: [{ name: 'scene', label: 'Scene', kind: 'select', control: 'tiles', options: PRODUCT_SCENES, default: 'studio-white' }],
    brand: true /* Brand: the kit's logo on the result (brandLogoFinish); "Use brand colours" adds a few small accents last (PRODUCT_KEEP leads, never the backdrop or the product) */, finish: brandLogoFinish,
    compose: (v, c) => joinPrompt(c.has('image') ? `product photo of the uploaded item: ${c.prompt}` : `product photo of ${c.prompt}`, c.has('image') && PRODUCT_KEEP, pick(PRODUCT_SCENES, v.scene)?.prompt, brandAccents(c, 'app-product-shot')) },
  // Phone Photo (2026-11-01, shared/phonePhoto.ts): a casual phone photo of an AI-made person. Two chip rows (who holds the phone, the light) and
  // your words for who is in it; each model gets its own wording (promptPatterns ugc-photo). Text to image only; style off (no added look words).
  { id: 'phone-photo', name: 'Phone Photo', category: 'Image', base: 'create-image', poster: null, description: 'An everyday phone photo of a made-up person: a selfie, a mirror shot or a friend\'s snap, in real room light.',
    providers: GENERATE_MODELS, locked: { types: '["generate"]', style: 'none' }, exposed: ['prompt', 'aspect', 'provider', 'resolution', 'rights', 'seed', 'holder', 'light'],
    labels: { prompt: 'Who is in the photo' },
    fields: [{ name: 'holder', label: 'Taken by', kind: 'select', control: 'segmented', options: PHONE_HOLDERS.map(({ value, label }) => ({ value, label })), default: PHONE_DEFAULTS.holder },
      { name: 'light', label: 'Light', kind: 'select', control: 'segmented', options: PHONE_LIGHTS.map(({ value, label }) => ({ value, label })), default: PHONE_DEFAULTS.light }],
    brand: true /* Brand: the kit's logo on the result (brandLogoFinish); "Use brand colours" puts one small item in the palette, in the model's own {detail} slot (never in "who") */, finish: brandLogoFinish,
    compose: (v, c) => phonePhotoPrompt({ who: c.prompt, holder: v.holder, light: v.light, detail: brandAccents(c, 'app-phone-photo') || undefined }, c.provider),
    notes: ['Made-up people only. Results are AI pictures, never real reviews or real customers.'] },
  // Brush Edit (was Inpaint; id kept so saved jobs and the API keep working). Only models whose route takes a mask (image grid finding 2: no Nano Banana 2, no Ideogram V4).
  { id: 'inpaint', name: 'Brush Edit', route: '/tools/brush-edit', category: 'Edit', base: 'create-image', poster: null, description: 'Paint over the area to change and describe it; everything else stays as it was.',
    locked: { types: '["inpaint"]' }, providers: MASK_MODELS /* quality order: GPT Image 2 (true mask inpaint), FLUX 3 Klein, Qwen-Image-Edit-2509 */, extraProviders: ['fal-bria-genfill'] /* Brush Edit-only engine (fal, tools/imageFalModels.ts) */, exposed: ['image', 'mask', 'prompt', 'provider', 'rights', 'seed'] },
  // T25: light controls compose into the edit prompt (no relighting model on disk; prompt-driven edit on the open edit models).
  { id: 'relight', name: 'Relight', category: 'Edit', base: 'create-image', poster: null, description: 'Change where the light comes from, how hard, how bright and what colour; the subject, pose and framing stay.',
    locked: { types: '["edit"]' }, providers: EDIT_MODELS, exposed: ['image', 'prompt', 'provider', 'rights', 'seed', 'look', 'direction', 'lightQuality', 'brightness', 'color', 'lightX', 'lightY', 'light'],
    labels: { prompt: 'Extra details (optional)' }, required: ['image'], promptTemplate: 'relight the scene: {prompt}; keep the subject, pose and composition unchanged',
    fields: [
      // Looks (2026-10-23): a named setup sets the four controls below and adds its own description; Custom (default) = no look (untouched: the default light, DEFAULT_RIG).
      { name: 'look', label: 'Look', kind: 'select', control: 'tiles', options: RELIGHT_LOOKS, default: 'custom' },
      { name: 'direction', label: 'Light direction', kind: 'select', control: 'grid', options: RELIGHT_DIRECTIONS, default: 'front' },
      { name: 'lightX', label: 'Light position X', kind: 'number', control: 'pad', min: -1, max: 1, step: 0.1, optional: true, help: 'Pad (P2): x and y in −1…1 override the direction buttons.' },
      { name: 'lightY', label: 'Light position Y', kind: 'number', control: 'pad', min: -1, max: 1, step: 0.1, optional: true },
      { name: 'lightQuality', label: 'Light quality', kind: 'select', control: 'segmented', options: RELIGHT_QUALITY, default: 'soft' },
      { name: 'brightness', label: 'Brightness', kind: 'number', control: 'slider', min: 0, max: 100, step: 5, default: '50' },
      { name: 'color', label: 'Light colour', kind: 'color', control: 'swatches', options: RELIGHT_COLOUR_PRESETS, pattern: '^#[0-9a-fA-F]{6}$', default: '#FFFFFF', help: 'Use a hex colour like #FFAA33.' },
      // Light sphere (2026-10-24): the 3D rig as JSON ({ key: { az, el, kelvin, color?, intensity, softness }, rim?, ambient }); when sent it words the light
      // by its nearest fixed position (shared/lightRig.ts lightCell, 2026-10-31) and the direction / pad / quality / brightness / colour fields above are
      // ignored (they still drive old drafts and links).
      { name: 'light', label: 'Light sphere', kind: 'json', control: 'sphere', optional: true, help: 'JSON: { key: { az, el, kelvin, color?, intensity, softness }, rim?, ambient }. Each light is worded by its nearest fixed position (every 45°, plus straight above and below).',
        parse: (raw) => { const r = parseLightRig(raw); return !r ? { value: '' } : 'error' in r ? r : { value: rigJson(r.rig) }; } },
    ],
    compose: (v, c) => relightPrompt(v, c.prompt, c.provider) },
  { id: 'photos-to-reel', name: 'Photos → Reel', category: 'Video', base: 'photos-reel', poster: null,
    description: 'Turn 8–15 photos into a vertical reel with gentle movement, title cards and optional music.',
    locked: { aspect: '9:16' }, exposed: ['photos', 'title', 'endLine', 'kind', 'seconds', 'motion', 'music', 'aspect', 'provider', 'resolution', 'seed'],
    defaults: { kind: 'listing', seconds: '30', motion: 'heroes', music: 'on' }, required: ['photos'], labels: { photos: 'Photos' },
    route: '/video?workflow=photos-to-reel',
    notes: ['Keep 8–15 photos in the order you want them shown. Hero photos use camera moves; the other photos use a slow zoom.'] },
  // T26: start + end frame on MiniMax H3 (h3-flf, local route only); the transition type is a prompt modifier.
  // 2026-10-26: also LTX-2.5 22B local (Morph with its own sound, the official video_ltx2_5_flf2v graph; 2–5 s, Draft / Sharper; comfy/ltx25Video.ts).
  { id: 'transition', name: 'Transitions', category: 'Video', base: 'h3-video', poster: null, description: 'A short clip that moves from a start image to an end image with the transition you pick.',
    locked: { types: '["flf"]' }, exposed: ['image', 'lastFrame', 'prompt', 'duration', 'aspect', 'rights', 'seed', 'transition'], required: ['image', 'lastFrame'], defaults: { duration: '5' },
    promptTemplate: 'seamless transition: {prompt}', labels: { image: 'Start image', lastFrame: 'End image' },
    fields: [{ name: 'transition', label: 'Transition', kind: 'select', control: 'tiles', options: TRANSITION_TYPES, default: 'morph' }], extra: { promptOptional: true },
    compose: (v, c) => joinPrompt('seamless transition', pick(TRANSITION_TYPES, v.transition)?.prompt, c.prompt) },
  // T27: no photo = text to video; a product photo (and/or a presenter photo) = reference to video with up to 2 references (presenter first, product second).
  { id: 'ugc-ad', name: 'UGC Ad', category: 'Marketing', base: 'h3-video', poster: null, description: 'A vertical phone-style ad where a presenter talks about your product.',
    locked: { types: '["t2v"]', aspect: '9:16' }, defaults: { duration: '15' }, modeWhenFile: { image: '["r2v"]', presenterImage: '["r2v"]' }, exposed: ['image', 'prompt', 'provider', 'rights', 'seed', 'presenter', 'hook', 'presenterImage'], showLocked: ['aspect'],
    promptTemplate: 'UGC selfie-style vertical ad, handheld phone camera, creator speaks to camera with a strong opening hook about {prompt}', labels: { image: 'Product photo (optional)', prompt: 'Product and pitch' },
    extraInputs: [{ name: 'presenterImage', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'Presenter photo (optional)' }],
    fields: [{ name: 'presenter', label: 'Presenter', kind: 'select', control: 'tiles', options: UGC_PRESENTERS, default: 'home-sofa' },
      { name: 'hook', label: 'Hook style', kind: 'select', control: 'segmented', options: UGC_HOOKS, default: 'question' }],
    compose: (v, c) => joinPrompt('UGC selfie-style vertical ad, handheld phone camera', c.has('presenterImage') ? 'the presenter from the first reference image speaks to camera' : pick(UGC_PRESENTERS, v.presenter)?.prompt,
      pick(UGC_HOOKS, v.hook)?.prompt, `about ${c.prompt}`, c.has('image') ? `the product from the ${c.has('presenterImage') ? 'second' : ''} reference image appears clearly in hand`.replace('  ', ' ') : '',
      brandAccents(c, 'app-ugc-ad')),
    brand: true /* Brand: the viewer's Add logo (a video's logo is stamped from the result); "Use brand colours" adds a few small set details last (never the presenter) */,
    fileMap: (f) => { const pres = f.presenterImage ?? []; const prod = f.image ?? []; if (!pres.length) return f; const { presenterImage: _p, ...rest } = f; return { ...rest, image: pres.slice(0, 1), refs: prod.slice(0, 1) }; },
    extra: { presenterFilters: { setting: UGC_SETTINGS, framing: UGC_FRAMINGS } },
    notes: ['Presenter tiles are descriptions until our own presenter stills exist; upload a presenter photo to use a face as reference 1.'] },
  // T28: its own AppTool page; orbit type = Director prompt tag at the start of the prompt (the move runs the whole clip).
  { id: 'orbit-shot', name: 'Orbit Shot', category: 'Video', base: 'cinema', poster: null, description: 'One photo of your subject becomes a clip where the camera circles it.', ui: 'app',
    providers: [...ROUTER_APP_MODELS, 'comfy-open', 'comfy-funcamera'] /* B6: Seedance first; Router: orbit prompt recipe + subject photo as first frame */, extraProviders: ['api-minimax-h3'], durations: [5, 10], defaults: { aspect: '1:1', resolution: '720p', duration: '5' },
    locked: { auto: '0', mode: 'generate', count: '1' }, exposed: ['image', 'refs', 'prompt', 'duration', 'aspect', 'resolution', 'rights', 'seed', 'orbit', 'backdrop'], required: [['image', 'refs']], promptTemplate: '#orbit-360 {prompt}',
    extraInputs: [{ name: 'image', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'Subject photo' }],
    fields: [{ name: 'orbit', label: 'Orbit type', kind: 'select', control: 'tiles', options: ORBIT_TYPES, default: 'full' },
      { name: 'backdrop', label: 'Backdrop', kind: 'select', control: 'segmented', options: ORBIT_BACKDROPS, default: 'keep' }],
    // Orbit P1: no prompt = Auto prompt (a fixed subject phrase after the orbit tag), so an image-only run never 400s. Plain text, no planner
    // pass and no extra model call, so it costs 0 credits on every route: quote = charge unchanged. (The Director's `auto` = 4 shot options, not used here.)
    compose: (v, c) => `${pick(ORBIT_TYPES, v.orbit)?.tag ?? '#orbit-360'} ${joinPrompt(c.prompt || ORBIT_AUTO_PROMPT, pick(ORBIT_BACKDROPS, v.backdrop)?.prompt)}`.trim(),
    fileMap: (f) => (f.image?.length ? { ...f, refs: [f.image[0], ...(f.refs ?? [])] } : f),
    extra: { promptOptional: true, autoPrompt: { whenEmpty: true, text: ORBIT_AUTO_PROMPT, credits: 0 } }, routeInput: () => ({ cinemaMode: 'generate' }) /* the job's own shape (a Director generate job): the Router video bodies map it */,
    notes: ['No orbit add-on (LoRA) for LTX-2 19B on this server: the orbit comes from the prompt, so a full 360° turn may come out as a partial arc.'] },
  { id: 'anime-restyle', name: 'Anime Restyle', category: 'Video', base: 'restyle', poster: null, description: 'Turn a clip into cel-shaded anime. No prompt needed.',
    locked: { preset: 'anime-cel' }, exposed: ['video', 'resolution', 'rights', 'seed'] }, // restyle's style field is `preset`; 'style' never reached it ('Pick a style')
  { id: 'video-upscale', name: 'Draft Upscale', category: 'Video', base: 'upscale', poster: null, description: 'Upscale a 480p draft keeper to 1080p (content unchanged).',
    locked: { types: '["precise"]' }, exposed: ['video', 'rights'] },
  // T31: Chatterbox VC has ONE built-in target voice (the library presets are TTS delivery settings and don't change it), so the picker offers what really differs.
  { id: 'change-voice', name: 'Change Voice', category: 'Audio', base: 'voice', poster: null, description: 'A different voice on the same clip, with the lips still in sync.',
    locked: { types: '["change-voice"]' }, exposed: ['video', 'audio', 'voice', 'voiceAudio', 'provider', 'rights'], required: [['video', 'audio']],
    inputOptions: { voice: [{ value: 'builtin', label: 'Built-in voice', runsAs: 'narrator-warm' }, { value: 'clone', label: 'My voice (upload 1–3 samples)', runsAs: 'clone' }] }, defaults: { voice: 'builtin' },
    notes: ['The engine (Chatterbox voice conversion) has one built-in voice; for any other voice, upload a sample of it.'] },
  // T32: the translated speech is voiced from the clip's own speaker by default (the source audio is the voice reference).
  { id: 'translate-video', name: 'Translate Video', category: 'Audio', base: 'voice', poster: null, description: 'Re-voice a clip in another language.',
    locked: { types: '["translate"]' }, exposed: ['video', 'language', 'voice', 'voiceAudio', 'rights'], required: ['video'],
    inputOptions: { voice: [{ value: 'original', label: 'Keep the original speaker', runsAs: 'narrator-warm' }, { value: 'clone', label: 'My voice (upload 1–3 samples)', runsAs: 'clone' }] }, defaults: { voice: 'original', language: 'es' },
    extra: { languages: VOICE_LANGUAGES.map((l) => { const providers = Object.keys(TRANSLATE_LANGS).filter((p) => TRANSLATE_LANGS[p].includes(l.code)); return { ...l, nativeName: LANGUAGE_NATIVE[l.code] ?? l.label, providers, available: providers.length > 0 }; }), languagesByProvider: TRANSLATE_LANGS },
    notes: ['The language list shows what the chosen engine can voice. A language it can\'t voice is refused before anything is charged.'] },
  // Phase 1 quick wins (2026-10-21): image Face Swap and Shots (tools/shots.ts). Both run Create Image's edit mode; open weights first
  // (Qwen-Image-Edit-2509, Apache-2.0, two images on workflows/create-image-qwen-edit2509-multiref-api.json), then a hosted pay-per-run model.
  { id: 'face-swap', name: 'Face Swap', category: 'Image', base: 'create-image', poster: null, description: 'Put the face from one photo onto the person in another. Pose, light, hair and background stay as they were.',
    locked: { types: '["edit"]' }, providers: TWO_IMAGE_MODELS /* every model whose route takes 2+ images (hosted caps raised to the Router limits, grid finding 1) */,
    exposed: ['image', 'face', 'prompt', 'provider', 'rights', 'seed'], labels: { image: 'Target photo', face: 'Face', prompt: 'Touch-ups (optional)' }, required: ['image', 'face'],
    extraInputs: [{ name: 'face', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'Face' }],
    // image 1 = the target photo, image 2 = the face (the edit models read the references in this order)
    fileMap: (f) => { const { face, ...rest } = f; return { ...rest, refs: (face ?? []).slice(0, 1) }; },
    // the registry's face-swap row for the picked model's family (GPT Image, Nano Banana, else the shared row); touch-ups as the last sentence
    compose: (_v, c) => [fillPattern('face-swap', swapPatternModel(c.provider)), sentence(c.prompt)].filter(Boolean).join(' '),
    extra: { promptOptional: true, outputLabel: 'Face swap' },
    finish: (r) => ({ outputLabel: 'Face swap', ...(r.refPaths?.[1] ? { insetPath: r.refPaths[1] } : {}) }),
    notes: ['Works best with a clear, front-facing face photo and a target where the face is visible and not too small.'] },
  // Camera Angles (was Shots; id kept).
  { id: 'shots', name: 'Camera Angles', route: '/tools/camera-angles', category: 'Image', base: 'create-image', poster: null, description: 'One photo becomes new camera angles of the same subject: front, three-quarter, side, back, low, high, close-up, wide, over the shoulder and full body.',
    locked: { types: '["edit"]' }, providers: featureById('camera-angles')!.providers.filter((p) => p !== 'comfy-qwen-angles'), extraProviders: ['comfy-qwen-angles'],
    exposed: ['image', 'prompt', 'provider', 'rights', 'seed'], labels: { image: 'Photo', prompt: 'Subject (optional)' }, required: ['image'],
    perOutput: { field: 'shots', label: 'Angles', options: SHOT_ANGLES, max: SHOT_ANGLES.length, defaults: SHOT_DEFAULTS, parse: parseShots, prompt: (o, u, x) => shotPrompt(o as ShotAngle, u, x.provider) /* worded for the engine's family */ },
    compose: (_v, c) => shotPrompt(SHOT_ANGLES[0], c.prompt, c.provider),
    extra: { promptOptional: true },
    notes: ['Each angle is its own image, priced like one image. Views the photo never showed (the back, the far side) are the model\'s best guess.'] },
  // Person Swap (image; 2026-10-22): the whole person from photo 2 replaces the person in photo 1. Same two-image edit as Face Swap (image grid: character swap,
  // official edit templates for the hosted models, our multi-reference graph for Qwen-Image-Edit-2509 and FLUX 3 Klein).
  { id: 'person-swap', name: 'Person Swap', route: '/tools/person-swap', category: 'Image', base: 'create-image', poster: null, description: 'Replace the person in a photo with the person from another photo: face, hair, body and outfit, or keep the photo\'s outfit. Pose, framing and the scene stay.',
    locked: { types: '["edit"]' }, providers: TWO_IMAGE_MODELS,
    exposed: ['image', 'person', 'prompt', 'provider', 'rights', 'seed', 'outfit'], labels: { image: 'Target photo', person: 'Person', prompt: 'Touch-ups (optional)' }, required: ['image', 'person'],
    extraInputs: [{ name: 'person', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'Person' }],
    // Outfit (2026-11-01): 'person' = today's swap (default; older jobs have no value and run the same); 'keep' = only who the person is changes
    fields: [{ name: 'outfit', label: 'Outfit', kind: 'select', control: 'segmented', options: PERSON_SWAP_OUTFITS.map((o) => ({ ...o })), default: 'person',
      help: 'Works best with one person. With several, say who in Touch-ups (e.g. the woman on the left).' }],
    fileMap: (f) => { const { person, ...rest } = f; return { ...rest, refs: (person ?? []).slice(0, 1) }; },
    // the registry's person-swap row for the picked model's family (GPT Image, Nano Banana, else the shared row), {who} by the Outfit choice; touch-ups last
    compose: (v, c) => [fillPattern('person-swap', swapPatternModel(c.provider), v.outfit === 'keep' ? { who: PERSON_SWAP_KEEP_OUTFIT_WHO, keepOutfit: PERSON_SWAP_KEEP_OUTFIT } : { who: PERSON_SWAP_WHO }),
      sentence(c.prompt)].filter(Boolean).join(' '),
    extra: { promptOptional: true, outputLabel: 'Person swap' },
    finish: (r) => ({ outputLabel: 'Person swap', ...(r.refPaths?.[1] ? { insetPath: r.refPaths[1] } : {}) }),
    notes: ['Works best when both people are fully visible and roughly the same size in frame. Only swap people who agreed to it.',
      'Outfit: "Use the person\'s outfit" (default) brings the clothes from the person photo; "Keep the photo\'s outfit" keeps the target\'s clothes and accessories.',
      'On Qwen Image 2.1 (local), "Keep the photo\'s outfit" runs the head swap: the face and hair change, the body and clothes stay.',
      'With several people in the target, say who in Touch-ups (e.g. the woman on the left). Sunglasses on the person photo hide the face, so it won\'t carry over. Crop phone status bars off screenshots first.'] },
  // Material Swap (2026-10-31): object photo + material photo on the two-image edit route (local Qwen Image 2.1 by default: its official edit template's
  // two inputs), plus hosted edit models that take 2+ images. Two optional short words fill our prompt (materialSwapPrompt); no new model.
  { id: 'material-swap', name: 'Material Swap', route: `${IMAGE_PAGE}?workflow=material-swap`, category: 'Image', base: 'create-image', poster: null,
    description: 'A photo of an object and a photo of a material: the object takes that material, its shape, light and scene kept.',
    locked: { types: '["edit"]' }, providers: MATERIAL_SWAP_MODELS, exposed: ['image', 'material', 'prompt', 'provider', 'rights', 'seed', 'object', 'fromMaterial'],
    labels: { image: 'Object', material: 'Material', prompt: 'Touch-ups (optional)' }, required: ['image', 'material'],
    extraInputs: [{ name: 'material', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'Material' }],
    fields: [{ name: 'object', label: 'What the object is', kind: 'text', optional: true, maxLength: MATERIAL_TEXT_MAX, placeholder: 'Optional, e.g. sofa' },
      { name: 'fromMaterial', label: 'Current material', kind: 'text', optional: true, maxLength: MATERIAL_TEXT_MAX, placeholder: 'Optional, e.g. grey fabric' }],
    // image 1 = the object, image 2 = the material
    fileMap: (f) => { const { material, ...rest } = f; return { ...rest, refs: (material ?? []).slice(0, 1) }; },
    compose: (v, c) => materialSwapPrompt(v, c.prompt, c.provider),
    extra: { promptOptional: true, outputLabel: 'Material swap' },
    finish: (r) => ({ outputLabel: 'Material swap', ...(r.refPaths?.[1] ? { insetPath: r.refPaths[1] } : {}) }),
    notes: ['Works best with one clear object in picture 1 and a close, evenly lit material in picture 2 (a swatch or a flat surface).'] },
  // Ad Pack (2026-10-31, shared/adPack.ts): 1–3 product photos + headline / offer + Brand → one finished ad per picked style (the Shots
  // one-output-per-pick run: n images, n × the one-image price), in the picked platform size. The model paints the words; the kit's logo is
  // added by our code after the run (adPackLogo.ts, providers.runWithProvider), so the prompt only keeps its corner empty.
  { id: 'ad-pack', name: 'Ad Pack', route: `${IMAGE_PAGE}?workflow=ad-pack`, category: 'Image', base: 'create-image', poster: null, brand: true,
    description: 'A product photo and your offer: finished ads in several styles, sized for the platform, with your logo added.',
    locked: { types: '["edit"]' }, providers: AD_PACK_MODELS, exposed: ['image', 'product2', 'product3', 'prompt', 'provider', 'rights', 'seed', 'headline', 'offer', 'placement', 'logoCorner'],
    labels: { image: 'Product photo', prompt: 'About the product (optional)' }, required: ['image'],
    extraInputs: [{ name: 'product2', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'Another side (optional)' }, { name: 'product3', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'Another side (optional)' }],
    fields: [{ name: 'headline', label: 'Headline', kind: 'text', optional: true, maxLength: AD_TEXT_MAX, placeholder: 'Optional, e.g. Run lighter' },
      { name: 'offer', label: 'Offer', kind: 'text', optional: true, maxLength: AD_TEXT_MAX, placeholder: 'e.g. 20% off this weekend' },
      { name: 'placement', label: 'Platform', kind: 'select', control: 'segmented', options: AD_PLACEMENTS.map((p) => ({ value: p.value, label: p.label })), default: AD_PLACEMENT_DEFAULT },
      { name: 'logoCorner', label: 'Logo corner', kind: 'select', control: 'segmented', options: AD_CORNERS.map((c) => ({ ...c })), default: 'tl', help: 'Used with Brand on' }],
    // image 1 = the main product photo, images 2–3 = other sides of it
    fileMap: (f) => { const { product2, product3, ...rest } = f; return { ...rest, refs: [...(product2 ?? []), ...(product3 ?? [])].slice(0, 2) }; },
    // the platform's shape, snapped to what the model makes (null = this edit route keeps the photo's shape; the logo still follows the result's size)
    lockedFor: (v, c) => { const a = sheetAspect(AD_ASPECT[placementOf(v.placement).shape], c.provider, c.mode); return a ? { aspect: a } : {} as Record<string, string>; }, lockedField: 'placement',
    perOutput: { field: 'shots', label: 'Styles', options: AD_STYLES.map(({ value, label, description }) => ({ value, label, description })), max: AD_STYLES.length, defaults: AD_STYLE_DEFAULT,
      parse: parseAdStyles, prompt: (o, u, c) => adPrompt({ style: o.value, provider: c.provider, headline: c.vals.headline, offer: c.vals.offer, details: u, placement: c.vals.placement, corner: c.vals.logoCorner,
        extraPhotos: Number(c.has('product2')) + Number(c.has('product3')), kit: c.brandKit, logo: !!(c.brandKit && logoFor(c.brandKit, 'main')) }) },
    compose: (v, c) => adPrompt({ style: AD_STYLE_DEFAULT[0], provider: c.provider, headline: v.headline, offer: v.offer, details: c.prompt, placement: v.placement, corner: v.logoCorner, kit: c.brandKit, logo: !!(c.brandKit && logoFor(c.brandKit, 'main')) }),
    extra: { promptOptional: true, outputLabel: 'Ad' },
    finish: (r) => ({ outputLabel: 'Ad', ...(r.brandKitId ? { adLogo: { kit: r.brandKitId, corner: r.appFields?.logoCorner || 'tl', placement: r.appFields?.placement || AD_PLACEMENT_DEFAULT } } : {}) }),
    notes: ['Short words come out cleanest: a headline and an offer of a few words each. Your logo is added after, never drawn by the model.'] },
  // ---- Photo tools (2026-10-23): fal-only models (tools/imageFalApps.ts), each in Create Image's bar. The prompt is ours (Expand also takes the user's
  // words for the new area); the models get only what their schema takes. Sizes and the mask are checked on submit (shared/imagePhotoTools.ts).
  { id: 'remove-bg', name: 'Remove Background', route: `${IMAGE_PAGE}?workflow=remove-bg`, category: 'Edit', base: 'create-image', poster: null,
    description: 'Keeps the subject and makes everything else transparent: a PNG you can drop on any background.',
    locked: { types: '["edit"]' }, providers: [], extraProviders: REMOVE_BG_MODELS, exposed: ['image', 'provider', 'rights', 'seed'], labels: { image: 'Photo' }, required: ['image'],
    compose: () => 'remove the background, keep the subject on a transparent background',
    prepare: async (r) => { const p = await probe(r.imagePath); const b = photoBlock(p); return b ? { error: { field: 'image', ...b } } : { sourceSize: p ? { width: p.width, height: p.height } : null }; },
    extra: { promptOptional: true, outputLabel: 'Cutout' }, finish: () => ({ outputLabel: 'Cutout', transparent: true, mockLook: 'cutout' }),
    notes: ['Works best with one clear subject. A photo with no clear subject may keep too much or too little.', 'The result is a PNG with a transparent background.'] },
  { id: 'expand', name: 'Expand', route: `${IMAGE_PAGE}?workflow=expand`, category: 'Edit', base: 'create-image', poster: null,
    description: 'Pick a new shape; the model paints the missing area around your photo, which stays as it was.',
    locked: { types: '["edit"]' }, providers: [], extraProviders: EXPAND_MODELS, exposed: ['image', 'prompt', 'provider', 'rights', 'seed', 'target'], labels: { image: 'Photo', prompt: 'What fills the new area (optional)' }, required: ['image'],
    fields: [{ name: 'target', label: 'New shape', kind: 'select', control: 'segmented', options: EXPAND_ASPECTS.map((a) => ({ value: a, label: EXPAND_ASPECT_LABELS[a] })), default: '1:1' }],
    compose: (_v, c) => c.prompt.trim() || 'extend the scene around the photo naturally',
    prepare: async (r, v) => { const p = await probe(r.imagePath); const src = p ? { width: p.width, height: p.height } : null; const target = String(v.target || '1:1');
      const b = expandBlock(src, target); if (b) return { error: { field: b.code === 'photo_too_large' ? 'image' : 'target', ...b } };
      return src ? { sourceSize: src, expand: expandCanvas(src, target) } : { error: { field: 'image', code: 'format', message: 'That photo could not be read. Use a PNG or JPG.' } }; },
    extra: { promptOptional: true, outputLabel: 'Expanded' }, finish: () => ({ outputLabel: 'Expanded', mockLook: 'expand' }),
    notes: ['Your photo stays as it was; only the new area is painted.', 'Bria Expand keeps your photo at full size (up to 25 MP in all); Ideogram 3.0 Reframe returns about 1 MP.'] },
  { id: 'erase', name: 'Erase Object', route: `${IMAGE_PAGE}?workflow=erase`, category: 'Edit', base: 'create-image', poster: null,
    description: 'Paint over a person, object or text; it disappears and the background is filled in. No prompt needed.',
    locked: { types: '["inpaint"]' }, providers: [], extraProviders: ERASE_MODELS, exposed: ['image', 'mask', 'provider', 'rights', 'seed'], labels: { image: 'Photo', mask: 'mask: paint over what to erase' }, required: ['image', 'mask'],
    compose: () => 'remove the painted object and fill in the background',
    prepare: async (r) => { const p = await probe(r.imagePath); const b = photoBlock(p); if (b) return { error: { field: 'image', ...b } };
      const cover = r.maskPath ? await maskCover(r.maskPath) : null; // read at 64 × 64: a tiny dab on a huge photo can read as 0, so only the whole-photo case is refused here
      const mb = eraseMaskBlock(cover); return mb ? { error: { field: 'mask', ...mb } } : { maskCover: cover }; },
    extra: { promptOptional: true, outputLabel: 'Erased' }, finish: () => ({ outputLabel: 'Erased', mockLook: 'erase' }),
    notes: ['Paint a little past the edges, shadow included. Very small areas are widened a few pixels by the model.'] },
  { id: 'try-on', name: 'Virtual Try-On', route: `${IMAGE_PAGE}?workflow=try-on`, category: 'Image', base: 'create-image', poster: null,
    description: 'A photo of a person and a photo of a top, bottom or one-piece: the person wears it, pose and face kept.',
    locked: { types: '["edit"]' }, providers: [], extraProviders: TRYON_MODELS, exposed: ['image', 'garment', 'provider', 'rights', 'seed', 'category', 'garmentPhoto'],
    labels: { image: 'Person', garment: 'Garment' }, required: ['image', 'garment'],
    extraInputs: [{ name: 'garment', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'Garment' }],
    fields: [{ name: 'category', label: 'Garment', kind: 'select', control: 'segmented', options: TRYON_CATEGORIES.map((o) => ({ ...o })), default: 'auto' },
      { name: 'garmentPhoto', label: 'Garment photo', kind: 'select', control: 'segmented', options: TRYON_PHOTO_TYPES.map((o) => ({ ...o })), default: 'auto' }],
    // image 1 = the person, image 2 = the garment
    fileMap: (f) => { const { garment, ...rest } = f; return { ...rest, refs: (garment ?? []).slice(0, 1) }; },
    // No prompt (2026-11-01): FASHN takes none and Bria's optional `instruction` carries only the user's words (routerModels briaText), which Try-On
    // doesn't ask for, so nothing is stored or shown as "the prompt". TODO: Bria's docs use `instruction` to steer layering ("worn over the t-shirt");
    // an optional styling note sent to Bria only could use it.
    compose: () => '', noPrompt: 'No prompt: the model reads the two photos only',
    prepare: async (r) => { for (const [k, p0] of [['image', r.refPaths?.[0]], ['garment', r.refPaths?.[1]]] as const) { const b = photoBlock(p0 ? await probe(p0) : null); if (b) return { error: { field: k, ...b } }; } return {}; },
    extra: { promptOptional: true, outputLabel: 'Try-on' }, finish: (r) => ({ outputLabel: 'Try-on', mockLook: 'tryon', ...(r.refPaths?.[1] ? { insetPath: r.refPaths[1] } : {}) }),
    notes: ['Tops, bottoms and one-pieces (dresses, jumpsuits). Shoes, bags and jewellery are not supported.', 'Works with a garment worn by someone or laid flat; a clear, front-facing person photo works best. Only use photos of people who agreed to it.'] },
  // ---- Image to layers (2026-10-24, shared/imageLayers.ts): Seedream 5.0 layer separation on Comfy Router (Flash default, Pro), Qwen-Image-Layered listed for Local.
  // One photo in, the background plate and each element back as transparent PNG layers (one Router call, one flat price). The prompt is optional and only the
  // user's own words go to the model (it can name the elements to pull out). Size 1K / 2K goes to the base tool too (caps check + per-size price).
  { id: 'image-layers', name: 'Image to layers', route: `${IMAGE_PAGE}?workflow=image-layers`, category: 'Edit', base: 'create-image', poster: null,
    description: 'One photo in: the background and each element (people, objects, text) come back as their own transparent PNG layers, ready to move or edit.',
    locked: { types: '["edit"]' }, providers: [], extraProviders: LAYER_MODELS, exposed: ['image', 'prompt', 'provider', 'rights', 'seed'], labels: { image: 'Photo', prompt: 'Name the layers to pull out (optional)' }, required: ['image'],
    fields: [{ name: 'imageResolution', label: 'Size', kind: 'select', control: 'segmented', options: LAYER_SIZES.map((v) => ({ value: v, label: v })), default: LAYER_SIZE_DEFAULT }], passFields: ['imageResolution'],
    compose: (_v, c) => c.prompt.trim() || LAYERS_NO_PROMPT /* a label only: the request carries just the user's words (none = the model finds the elements itself) */,
    prepare: async (r) => { const p = await probe(r.imagePath); const b = photoBlock(p) ?? layersPhotoBlock(p); return b ? { error: { field: 'image', ...b } } : { sourceSize: p ? { width: p.width, height: p.height } : null }; },
    extra: { promptOptional: true, outputLabel: 'Layers' }, finish: (r) => ({ outputLabel: 'Layers', layers: true, transparent: true, mockLayers: mockLayerNames(mockLayerCount(r.appPrompt, r.seed)).map((nm, k) => layerLabel(k, nm)) /* sample layers (mock only): 2–13, from "N layers" in the prompt, else the seed */ }),
    notes: ['Up to 16 layers plus the background; the model decides how many. Name the elements in the prompt to steer it.', 'Each layer is a PNG with a transparent background, the size of the picture. The photo needs at least 512 px on each side.'] },
  { id: 'music-bed', name: 'Music Bed', category: 'Audio', base: 'soundtrack', poster: null, description: 'Add a music track under a clip, original audio kept underneath.',
    locked: { types: '["music"]', mix: 'blend' }, exposed: ['video', 'prompt', 'rights'], promptTemplate: '{prompt}' },
];
const typesOf = (t: string | undefined) => { try { return JSON.parse(String(t ?? '[]'))[0] as string | undefined; } catch { return undefined; } };
const appFieldInput = (f: AppField) => ({ name: f.name, label: f.label, kind: f.kind === 'select' ? 'select' : f.kind === 'number' ? 'number' : 'text', appField: true, control: f.control,
  ...(f.options ? { options: f.options.map((o) => o.value), choices: f.options.map(({ prompt: _p, ...o }) => o) } : {}), ...(f.default != null ? { default: f.default } : {}),
  ...(f.min != null ? { min: f.min, max: f.max, step: f.step } : {}), ...(f.pattern ? { pattern: f.pattern } : {}), ...(f.help ? { help: f.help } : {}), ...(f.maxLength ? { maxLength: f.maxLength } : {}), ...(f.placeholder ? { placeholder: f.placeholder } : {}), required: false });
/** App duration rule: the app's own lengths when it has them (Orbit Shot), else the base tool's. */
export const durToolOf = (t: ToolDef | undefined): string | undefined => !t ? undefined : hasToolDurations(t.id) ? t.id : ((t.app as any)?.gallery?.base ?? t.id);
/** A blank duration on an app with a default: the longest allowed length ≤ the default for this model (UGC Ad 15 s → Veo 8 s). Quote and submit both use it. */
export function appDefaultDuration(t: ToolDef | undefined, provider: string | undefined): number | undefined {
  const d = Number((t?.app as any)?.gallery?.defaults?.duration); if (!(d > 0)) return undefined;
  const list = durationsFor(durToolOf(t), provider); if (!list) return d; const ok = list.filter((x) => x <= d); return ok.length ? Math.max(...ok) : Math.min(...list);
}
/** B6: the default model for an app mode (routing/defaults.ts registers it: the first in quality order that runs now, else the cloud default). */
let appDefaultFor: ((t: ToolDef, mode: string, ids: string[]) => string | null) | null = null;
export const setAppDefaultResolver = (f: typeof appDefaultFor) => { appDefaultFor = f; };
/** Quote side of an app: locks, defaults, file-driven mode switch and the engine the job would pick for that mode (same as the job parser). */
/** Relight (BH12): the quote checks the app's number fields like submit does: lightX / lightY both or neither (400 code required), each in its range
 *  (−1…1, final; 400 code out_of_range). Same messages as parseInput. null = fine. */
export function appFieldQuoteError(t: ToolDef | undefined, q: Record<string, string>) {
  const G = (t?.app as any)?.gallery; if (!G) return null;
  const bad = (field: string, message: string, code: string) => ({ error: message, errorType: 'validation', code, field, issues: [{ code, field, message }] });
  const fields: any[] = G.fields ?? []; const sent = (n: string) => q[n] != null && String(q[n]).trim() !== '';
  for (const f of fields) if (f.kind === 'json' && sent(f.name) && typeof f.parse === 'function') { const r = f.parse(String(q[f.name])); if ('error' in r) return bad(f.name, r.error, 'format'); }
  for (const f of fields) if (f.kind === 'number' && sent(f.name)) { const n = Number(q[f.name]); if (!Number.isFinite(n) || n < f.min || n > f.max) return bad(f.name, `${f.label} must be ${f.min}–${f.max}.`, 'out_of_range'); }
  if (fields.some((f) => f.name === 'lightX') && sent('lightX') !== sent('lightY')) return bad(sent('lightX') ? 'lightY' : 'lightX', 'Send both lightX and lightY (or neither).', 'required');
  return null;
}
/** Create Image tools and apps (Product Shot, Character Sheet…): the quote runs the same per-model caps check as the submit (tools/media.ts
 *  checkImageCaps): aspect (e.g. Auto on a model without Auto), quality tier, image size, count. Same 400 body as the submit. null = fine. */
/** The photo's shape a quote names (photoAspect=4:3, or photoWidth + photoHeight): input prep (the bar fits or crops the photo first). */
export const photoAspectOf = (q: Record<string, any>): string | undefined => q.photoAspect ? String(q.photoAspect) : Number(q.photoWidth) > 0 && Number(q.photoHeight) > 0 ? `${Number(q.photoWidth)}:${Number(q.photoHeight)}` : undefined;
export function imageCapsQuoteError(t: ToolDef | undefined, q: Record<string, string>, fallbackProvider?: string) {
  if (!t) return null; const G = (t.app as any)?.gallery; if ((G?.base ?? t.id) !== 'create-image') return null;
  const p = G ? appQuoteParams(t, { ...q }) : { ...q };
  const provider = p.provider || p.model || fallbackProvider; if (!provider) return null;
  const mode = p.mode || typesOf(p.types) || (!G && p.image ? 'edit' : 'generate');
  const tier = /^(low|med|high)$/.test(String(p.quality ?? '')) ? p.quality : /^(low|med|high)$/.test(String(p.tier ?? '')) ? p.tier : undefined; // the generic 720p quality is not a tier
  const res = /^[124]K$/.test(String(p.imageResolution ?? '')) ? p.imageResolution : undefined;
  const refs = (mode === 'edit' || mode === 'inpaint') && Number(p.refs) > 0 ? Number(p.refs) : undefined; // the images sent (photo + references), as the submit counts them
  const cap = checkImageCaps(provider, { aspect: p.aspect || undefined, quality: tier, imageResolution: res, n: G?.perOutput ? 1 /* Shots: one image per angle, n capped by perOutput.max, not the batch size */ : p.n || p.count || 1, refs, mode, photoAspect: photoAspectOf(p) });
  if (cap.ok) { // D5: the snapped settings price and run (quote = submit); the notes ride on the query to the routing hook (routing/http.ts)
    if (cap.notes?.length) { if (p.aspect && p.aspect !== cap.aspect) q.aspect = cap.aspect; if (tier && cap.tier && tier !== cap.tier) { q.quality = cap.tier; if (q.tier) q.tier = cap.tier; } if (res && res !== cap.imageResolution) q.imageResolution = cap.imageResolution;
      (q as any).__snapNotes = cap.notes; }
    return null; }
  return { error: cap.issues[0].message, errorType: 'validation', code: cap.issues[0].code, field: cap.issues[0].field, issues: cap.issues };
}
export function appQuoteParams(t: ToolDef | undefined, q: Record<string, string>): Record<string, string> {
  const G = (t?.app as any)?.gallery; if (!G) return q;
  const out: Record<string, string> = { ...q };
  for (const [k, v] of Object.entries<string>(G.defaults ?? {})) if (k !== 'duration' && (out[k] == null || out[k] === '')) out[k] = v;
  Object.assign(out, G.locked ?? {});
  for (const [f, ty] of Object.entries<string>(G.modeWhenFile ?? {})) if (q[f]) out.types = ty;
  const PO = G.perOutput as { field: string; max: number; options: { value: string }[]; defaults?: string[] } | null; // Shots: n = the picked angles (blank = all; Ad Pack: its default styles, as the submit), so quote = n × one image
  if (PO) { const raw = String(q[PO.field] ?? '').trim(); let ids: string[] = [];
    if (raw) { let xs: unknown; try { xs = JSON.parse(raw); } catch { xs = raw.split(','); } ids = [...new Set((Array.isArray(xs) ? xs : [xs]).map((x) => String(x).trim()))].filter((x) => PO.options.some((o) => o.value === x)); }
    out.n = String(Math.min(PO.max, ids.length || (raw ? 0 : Number(q.n) > 0 ? Number(q.n) : PO.defaults?.length || PO.options.length)) || 1); }
  const m = typesOf(out.types); const pm = G.providersByMode as Record<string, string[]> | undefined;
  if (m && pm?.[m] && !out.provider && !out.model) { const first = (t && appDefaultFor?.(t, m, pm[m])) || pm[m][0]; if (first) out.provider = first; }
  if (typeof G.lockedFor === 'function') { const vals = Object.fromEntries(((G.fields ?? []) as any[]).map((f) => [f.name, String(out[f.name] ?? '') || String(f.default ?? '')]));
    Object.assign(out, G.lockedFor(vals, { provider: out.provider || out.model || (t?.providers?.[0] as any)?.id || (t?.providers?.[0] as any), mode: m ?? '' })); } // Character Sheet: the layout's aspect on this model
  return out;
}
/**
 * The recipe text around the user's words, per app (2026-10-25, shared/typedPrompt.ts): compose a marker with and without each photo, for every
 * option of the app's first tile field (Character Sheet layouts, Product Shot scenes) and the other fields at their defaults. A template app
 * splits its `{prompt}`. Cached per app. The web gets them too (gallery.promptFrames) to keep a composed prompt out of the subject box.
 */
const MARK = '⁣TYPED⁣'; const frameCache = new Map<string, PromptFrame[]>();
export function promptFrames(a: GalleryApp): PromptFrame[] {
  const hit = frameCache.get(a.id); if (hit) return hit;
  const out: PromptFrame[] = []; const add = (withMark: string, empty: string) => { const s = normPrompt(withMark); const i = s.indexOf(MARK); if (i < 0) return;
    const f = { head: s.slice(0, i), tail: s.slice(i + MARK.length), empty: normPrompt(empty) }; if ((f.head || f.tail) && !out.some((x) => x.head === f.head && x.tail === f.tail)) out.push(f); };
  if (a.compose) {
    const defs: Record<string, string> = Object.fromEntries((a.fields ?? []).map((f) => [f.name, f.default ?? '']));
    const tile = (a.fields ?? []).find((f) => f.control === 'tiles' && f.options?.length);
    const files = [...new Set([...Object.keys(a.modeWhenFile ?? {}), ...(a.fileOrPrompt ? [a.fileOrPrompt.file] : []), ...(a.required ?? []).flat()])];
    for (const v of tile ? tile.options!.map((o) => ({ ...defs, [tile.name]: o.value })) : [defs]) for (const has of [true, false]) {
      const h = (n: string) => (files.includes(n) ? has : true);
      for (const maxChars of [undefined, 1 /* the short wording a capped model gets (Character Sheet on Wan) */]) try { add(a.compose(v, { prompt: MARK, has: h, maxChars }), a.compose(v, { prompt: '', has: h, maxChars })); } catch { /* a recipe that needs more than defaults: no frame */ }
    }
  } else if (a.promptTemplate?.includes('{prompt}')) add(a.promptTemplate.replace('{prompt}', MARK), a.promptTemplate.replace('{prompt}', ''));
  frameCache.set(a.id, out); return out;
}
/** The user's own words for app `appId` out of `text` (a stored prompt, or a full prompt a caller sent): the recipe text peeled off, as often as it was added. */
export function appTypedPrompt(appId: string, text: string): string {
  const a = APP_GALLERY.find((x) => x.id === appId || `app-${x.id}` === appId); const t = String(text ?? '').trim(); if (!a || !t) return t;
  return typedFromFrames(t, promptFrames(a));
}
/** DP #21 / DP #27: the built-in voice choice carries sampleUrl (web/public/examples/voice/builtin.mp3) or null + needsSample:true; sampleKind 'real' | 'standin' + sampleIsStandIn. */
export const wireVoiceSample = <T extends Record<string, any>>(x: T): T => {
  Object.defineProperty(x, 'sampleUrl', { enumerable: true, configurable: true, get: () => voiceSampleUrl(String(x.value)) });
  Object.defineProperty(x, 'needsSample', { enumerable: true, configurable: true, get: () => !voiceSampleUrl(String(x.value)) });
  // sampleKind: 'real' only when examples/voice/<value>.json says {"kind":"real"} (a recording of the built-in Chatterbox voice); else 'standin'
  Object.defineProperty(x, 'sampleKind', { enumerable: true, configurable: true, get: () => voiceSampleKind(String(x.value)) });
  Object.defineProperty(x, 'sampleIsStandIn', { enumerable: true, configurable: true, get: () => voiceSampleKind(String(x.value)) !== 'real' });
  return x;
};
/** Input prep (2026-10-23): the bar fitted or cropped the photo before sending it (imagePrep = {"kind":"fit"|"crop","aspect":"4:3"}); the photo as
 *  picked comes along as imageOriginal, so the viewer's Inputs strip shows it with a "Fitted" badge. The run itself uses the prepared photo. */
export function imagePrepOf(fields: Record<string, string>, files: Record<string, string[]>): { imagePrep?: { kind: 'fit' | 'crop'; aspect: string; originalUrl: string | null } } {
  let x: any; try { x = JSON.parse(String(fields.imagePrep ?? '')); } catch { return {}; }
  if (!x || !/^(fit|crop)$/.test(String(x.kind)) || !/^\d{1,4}(\.\d{1,2})?:\d{1,4}(\.\d{1,2})?$/.test(String(x.aspect))) return {};
  const o = files.imageOriginal?.[0]; return { imagePrep: { kind: x.kind, aspect: String(x.aspect), originalUrl: o ? `/files/${o}` : null } };
}
/** Wrap a base tool as a one-purpose app: locked params override the user's, app fields compose the prompt, inputs narrowed to `exposed`. */
export function makeGalleryApp(a: GalleryApp, base: ToolDef): ToolDef {
  const appId = `app-${a.id}`;
  const req = new Set((a.required ?? []).filter((r): r is string => typeof r === 'string'));
  const baseInputs = [...base.inputs, ...(a.extraInputs ?? []).filter((x) => !base.inputs.some((i) => i.name === x.name))] as any[];
  const exposedInputs = [
    ...baseInputs.filter((i) => a.exposed.includes(i.name) || i.name === 'seed').map((i) => {
      let o: any = a.labels?.[i.name] ? { ...i, label: a.labels[i.name], required: req.has(i.name) } : req.has(i.name) ? { ...i, required: true } : i;
      const io = a.inputOptions?.[i.name]; if (io) o = { ...o, options: io.map((x) => x.value), choices: io.map(({ runsAs: _r, ...x }) => (x.value === 'builtin' ? wireVoiceSample(x) : x)), default: a.defaults?.[i.name] ?? io[0].value };
      else if (a.defaults?.[i.name] != null && i.kind === 'select') o = { ...o, default: a.defaults[i.name] };
      if (i.name === 'prompt' && a.extra?.promptOptional) o = { ...o, required: false }; // DP #21: the app composes a prompt itself (Transitions, Orbit Shot)
      return o;
    }),
    ...(a.fields ?? []).map(appFieldInput),
    ...(a.perOutput ? [{ name: a.perOutput.field, label: a.perOutput.label, kind: 'list', appField: true, control: 'chips', options: a.perOutput.options.map((o) => o.value), max: a.perOutput.max,
      default: JSON.stringify(a.perOutput.defaults ?? a.perOutput.options.map((o) => o.value)), choices: a.perOutput.options.map(({ prompt: _p, mockVf: _m, ...o }) => o), required: false }] : []),
  ];
  if (a.durations) registerToolDurations(appId, a.durations, Number(a.defaults?.duration) || a.durations[0]);
  const pm = base.app?.providerModes as Record<string, string[]> | undefined;
  const lockedMode = typesOf(a.locked?.types); const switchModes = Object.values(a.modeWhenFile ?? {}).map(typesOf).filter(Boolean) as string[];
  const modes = [...new Set([lockedMode, ...switchModes].filter(Boolean) as string[])];
  const pool = [...new Set([...(a.providers ? a.providers.filter((p) => base.providers.includes(p) || a.extraProviders?.includes(p)) : base.providers), ...(a.extraProviders ?? [])])]; // B6: an app's own list is its quality order (an extra engine it names keeps its place)
  if (pm && a.extraProviders) for (const p of a.extraProviders) pm[p] ??= [...new Set([typesOf(a.locked?.types)].filter(Boolean) as string[])]; // the base parser checks provider × mode
  const canDo = (p: string, m?: string) => !m || !pm?.[p] || pm[p].includes(m);
  // Only engines that can do one of the app's modes (e.g. Change Voice never lists Talking Photo; Anime Restyle never lists H3 VFX Edit).
  // (4) An app that locks its provider runs only that engine, so it lists only that one (listing = quote = what runs; e.g. Inpaint = Qwen Image).
  const providers = typeof a.locked?.provider === 'string' ? [a.locked.provider] : pool.filter((p) => (!modes.length || modes.some((m) => canDo(p, m))) && !(base.id === 'restyle' && p === 'comfy-h3-vfx') && !(base.id === 'h3-video' && (p === 'comfy-wan22-5b' || (p === 'comfy-ltx25-video' && lockedMode !== 'flf')))); // local 2–5 s drafts (Wan 2.2 5B, LTX-2.5 22B) stay on Generate Video itself, not its apps (UGC Ad runs 15 s); LTX-2.5 22B also morphs in Transitions (first + last frame, 2026-10-26)
  const providersByMode = modes.length > 1 ? Object.fromEntries(modes.map((m) => [m, providers.filter((p) => canDo(p, m))])) : null;
  // §0.4: what the web must NOT render from the inherited base-tool config (DP render guards).
  const shown = new Set([...exposedInputs.map((i) => i.name), 'seed']);
  const hideControls = [...new Set([...base.inputs.map((i) => i.name).filter((n) => !shown.has(n)), ...(a.locked?.types ? ['types'] : []), ...(!shown.has('prompt') ? ['prompt', 'enhance'] : [])])];
  const lockedChips = (a.showLocked ?? []).filter((k) => a.locked[k] != null).map((k) => ({ field: k, value: a.locked[k], label: a.locked[k] }));
  const durs = a.durations ? { durationsByProvider: durationsByProvider(appId, providers), defaultDurationByProvider: defaultDurationByProvider(appId, providers) } : {};
  const baseCaps = (base.app as any)?.capabilities;
  const def: ToolDef = {
    ...base, id: appId, name: a.name, description: a.description, category: 'Apps', status: undefined, listed: undefined /* an app is listed even when its base tool is hidden (Orbit Shot on the retired Director) */, route: a.route ?? `/tools/app-${a.id}`, ...(a.ui ? { ui: a.ui } : {}), ...(a.routeInput ? { routeInput: a.routeInput } : {}),
    inputs: exposedInputs, ...(a.poster && !/^\/(samples\/(?!presets\/)|examples\/)/.test(a.poster) ? { posterUrl: a.poster } : {}) /* BH P2: never a sample / example gradient; /api/posters/<id>.jpg runs the cover fallback order */, providers,
    app: { ...(base.app ?? {}), ...(baseCaps && a.durations ? { capabilities: { ...baseCaps, ...durs } } : {}),
      gallery: { id: a.id, base: base.id, locked: a.locked, exposed: a.exposed, labels: a.labels ?? {} /* the submit's "Add a garment." names the slot (index.ts required check) */, promptTemplate: a.promptTemplate ?? null, ...(a.noPrompt ? { noPrompt: a.noPrompt } : {}), modeWhenFile: a.modeWhenFile ?? null,
        defaults: a.defaults ?? {}, fields: (a.fields ?? []).map((f) => ({ ...f, options: f.options?.map(({ prompt: _p, ...o }) => (OPTION_MEDIA[a.id] === f.name ? wireOptionMedia(a.id, f.name, o) : o)) })), required: a.required ?? [], fileOrPrompt: a.fileOrPrompt ?? null, providersByMode,
        hideControls, modeRow: false, promptBox: shown.has('prompt'), promptFrames: a.compose || a.promptTemplate ? promptFrames(a) : [] /* 2026-10-25: the web keeps recipe text out of the subject box (shared/typedPrompt.ts) */,
        ...(a.previewBefore && a.previewAfter ? { preview: { before: a.previewBefore, after: a.previewAfter, beforeLabel: a.previewLabels?.[0] ?? 'Before', afterLabel: a.previewLabels?.[1] ?? 'After', model: a.previewModel ?? null } } : {}),
        perOutput: a.perOutput ? { field: a.perOutput.field, label: a.perOutput.label, max: a.perOutput.max, ...(a.perOutput.defaults ? { defaults: a.perOutput.defaults } : {}), options: a.perOutput.options.map(({ prompt: _p, mockVf: _m, ...o }) => o) } : null, lockedChips, ui: a.ui ?? base.ui ?? null, notes: a.notes ?? [], ...(a.durations ? { durations: a.durations, ...durs } : {}), ...(a.extra ?? {}) } },
    async parseInput(fields, files0) {
      const bad = (field: string, message: string, code = 'invalid') => ({ error: message, issues: [{ code, field, message }] }) as any;
      // 2026-10-25: a composed prompt sent back as the words (a box that got the recipe text, a caller sending the whole prompt) is peeled first, so it is never composed twice
      const f: Record<string, string> = { ...fields }; const userPrompt = a.compose || a.promptTemplate ? appTypedPrompt(a.id, fields.prompt || '') : (fields.prompt || '').trim();
      for (const [k, v] of Object.entries(a.defaults ?? {})) if ((f[k] == null || f[k] === '') && k !== 'duration') f[k] = v;
      if ((f.duration == null || f.duration === '') && (f.seconds == null || f.seconds === '') && a.defaults?.duration) { const d = appDefaultDuration(def, f.provider || providers[0]); if (d) f.duration = String(d); }
      for (const r of a.required ?? []) {
        const any = Array.isArray(r) ? r : [r];
        if (any.some((n) => files0[n]?.length)) continue;
        // Either/or required groups name every alternative (Change Voice: "Add a video or an audio clip.").
        const labelOf = (n: string) => (a.labels?.[n] ?? (a.extraInputs ?? []).find((x) => x.name === n)?.label ?? exposedInputs.find((i: any) => i.name === n)?.label ?? n).replace(/ \(optional\)$/, '').toLowerCase();
        const art = (l: string) => (/^(a|an|the|your|some|one)\s/i.test(l) ? l : /^[aeiou]/i.test(l) ? `an ${l}` : `a ${l}`);
      const phrase = (n: string) => ({ video: 'a video', audio: 'an audio clip', image: 'an image', refs: 'a reference image' } as Record<string, string>)[n]
          ?? (/^(a|an|the|your|some|one)\s/i.test(labelOf(n)) ? labelOf(n) : /^[aeiou]/i.test(labelOf(n)) ? `an ${labelOf(n)}` : `a ${labelOf(n)}`);
        const msg = any.length === 1
          ? `Add ${a.labels?.[any[0]] ? art(labelOf(any[0])) : phrase(any[0])}.` /* BH P3: a/an on the single-input branch too ('Add an image.') */
          : `Add ${any.slice(0, -1).map(phrase).join(', ')} or ${phrase(any[any.length - 1])}.`;
        return bad(any[0], msg, 'required');
      }
      if (a.fileOrPrompt && !files0[a.fileOrPrompt.file]?.length && !userPrompt) return bad('prompt', a.fileOrPrompt.message, 'required');
      for (const n of ['presenterImage', ...(a.extraInputs ?? []).filter((x) => x.kind === 'file' && /image/.test(String(x.accept ?? ''))).map((x) => String(x.name))]) for (const x of files0[n] ?? []) if (!/\.(png|jpe?g)$/i.test(x)) return bad(n, 'Use a PNG or JPG.', 'format');
      let perIds: string[] | null = null; // Shots: one output per picked option
      if (a.perOutput) { const po = a.perOutput; const ps = po.parse(f[po.field]); if ('error' in ps) return bad(po.field, ps.error, ps.code);
        if (ps.ids.length > po.max) return bad(po.field, `Pick up to ${po.max}.`, 'too_many'); perIds = ps.ids; delete f[po.field]; delete f.n; delete f.count; delete f.batch; }
      // App fields: validated, defaulted, stored raw (Recreate) and composed into the prompt.
      const vals: Record<string, string> = {};
      for (const af of a.fields ?? []) {
        let v = f[af.name]; if (af.kind === 'text' && v != null) v = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); // short words: one line, spaces collapsed
        if (v == null || v === '') v = af.default ?? '';
        if (v === '' && af.optional) { vals[af.name] = ''; continue; }
        if (af.kind === 'select' && !af.options!.some((o) => o.value === v)) return bad(af.name, `${af.label}: pick one of ${af.options!.map((o) => o.value).join(', ')}.`);
        if (af.kind === 'number') { const n = Number(v); if (!Number.isFinite(n) || n < af.min! || n > af.max!) return bad(af.name, `${af.label} must be ${af.min}–${af.max}.`, 'out_of_range'); v = String(n); }
        if (af.kind === 'color') { if (!new RegExp(af.pattern!).test(v)) return bad(af.name, af.help ?? `${af.label}: use a hex colour like #FFAA33.`, 'format'); v = v.toUpperCase(); }
        if (af.kind === 'text' && af.maxLength && v.length > af.maxLength) return bad(af.name, `${af.label}: up to ${af.maxLength} characters.`, 'too_long');
        if (af.kind === 'json' && af.parse) { const r = af.parse(String(v)); if ('error' in r) return bad(af.name, r.error, 'format'); v = r.value; }
        vals[af.name] = v; if (a.passFields?.includes(af.name)) f[af.name] = v; else delete f[af.name]; // passFields: the base tool reads it too
      }
      if (a.fields?.some((x) => x.name === 'lightX') && (vals.lightX === '') !== (vals.lightY === '')) return bad(vals.lightX === '' ? 'lightX' : 'lightY', 'Send both lightX and lightY (or neither).', 'required');
      for (const [k, opts] of Object.entries(a.inputOptions ?? {})) if (f[k] != null && f[k] !== '') { const o = opts.find((x) => x.value === f[k] || x.runsAs === f[k]);
        if (o) { vals[k] = o.value; f[k] = o.runsAs; } else if (!baseInputs.find((i) => i.name === k)?.options?.includes(f[k])) return bad(k, `Pick one of ${opts.map((x) => x.value).join(', ')}.`); else vals[k] = f[k]; } // older clients' library ids still run (same voice)
      let appSnap: string | null = null; // D5: an off-list length runs at the nearest one, with a note
      if (a.durations) { const rd = resolveDuration(appId, f.provider || providers[0], f.duration ?? f.seconds); if (rd && 'error' in rd) return { ...durationErrorBody(rd, f.duration != null && f.duration !== '' ? 'duration' : 'seconds') } as any;
        if (rd?.snapped) { f.duration = String(rd.seconds); delete f.seconds; appSnap = rd.snapped.note; } }
      const kit = a.brand && fields.brandKit ? getBrandKit(String(fields.brandKit)) ?? null : null; // brand apps: Brand's kit (index.ts already refused an unknown id)
      const colours = !!kit && /^(1|true|on)$/i.test(String(fields.brandColours ?? '')); delete f.brandColours; // the logo apps' "Use brand colours"
      if (a.compose) { const pv = typeof f.provider === 'string' ? f.provider : undefined; f.prompt = a.compose(vals, { prompt: userPrompt, has: (n) => !!files0[n]?.length, provider: pv, maxChars: providerPromptCap(pv), brandKit: kit, brandColours: colours }).replace(/\s+([:,.;])/g, '$1').trim(); }
      else if (a.promptTemplate) f.prompt = a.promptTemplate.replace('{prompt}', userPrompt).replace(/\s+([:,.])/g, '$1').trim();
      Object.assign(f, a.locked);
      for (const [field, types] of Object.entries(a.modeWhenFile ?? {})) if (files0[field]?.length) {
        f.types = types; const m = typesOf(types)!;
        // provider not exposed (or blank): an engine that can't do the switched mode gives way to the first one that can (same as the quote)
        if (f.provider && pm?.[f.provider] && !pm[f.provider].includes(m) && !a.exposed.includes('provider')) delete f.provider;
        if (!f.provider) { const first = (providersByMode?.[m] && appDefaultFor?.(def, m, providersByMode[m])) || providersByMode?.[m]?.[0]; if (first) f.provider = first; }
      }
      if (!f.provider && a.providers) f.provider = providers[0];
      if (a.lockedFor) Object.assign(f, a.lockedFor(vals, { provider: f.provider || providers[0], mode: typesOf(f.types) ?? '' })); // Character Sheet: the layout's aspect, snapped to this model
      const files = a.fileMap ? a.fileMap(files0) : files0;
      // an app whose models take no prompt (Try-On): the base's "describe it" check gets the label, and the job keeps no prompt (nothing was sent)
      if (a.noPrompt) f.prompt = a.noPrompt;
      const r: any = await base.parseInput(f, files);
      if ('error' in r) return r; if (a.noPrompt) for (const k of ['prompt', 'finalPrompt', 'hostedPrompt', 'enhancedPrompt']) if (typeof r[k] === 'string') r[k] = ''; if (appSnap) addAdjustNote(r, appSnap);
      if (a.prepare) { const x = await a.prepare(r, vals); if (x && 'error' in x && x.error && typeof x.error === 'object') return bad(x.error.field, x.error.message, x.error.code); Object.assign(r, x); }
      const extraUrls: Record<string, string> = {};
      for (const x of a.extraInputs ?? []) { const up = files0[x.name]?.[0]; if (up) extraUrls[`${x.name}Url`] = `/files/${up}`; }
      const per = a.perOutput && perIds ? (() => { const po = a.perOutput!; const shots = perIds.map((id) => { const o = po.options.find((x) => x.value === id)!; return { id, label: o.label, prompt: po.prompt(o, userPrompt, { vals, provider: f.provider || providers[0], has: (n) => !!files0[n]?.length, brandKit: kit }) }; });
        vals[po.field] = JSON.stringify(perIds); return { shots, n: shots.length, finalPrompt: shots[0].prompt }; })() : {};
      const out = { ...r, ...Object.fromEntries(Object.entries(vals).filter(([k]) => r[k] == null || k === 'voice')), ...per /* the shots list wins over its raw field value */, ...extraUrls, ...imagePrepOf(fields, files0), ...(kit ? { brandKitId: kit.id } : {}), ...(colours ? { brandColours: true } : {}), appFields: vals, appPrompt: userPrompt, appId: a.id, baseTool: base.id };
      return a.finish ? { ...out, ...a.finish(out) } : out;
    },
  } as ToolDef;
  // DP #21: an app that locks its base tool's style (Anime Restyle: preset anime-cel) names it, live (the preset's poster follows interim stills).
  if (a.lockedFor) { const G = (def.app as any).gallery; Object.defineProperty(G, 'lockedFor', { enumerable: false, value: a.lockedFor }); // the quote (appQuoteParams) applies it too; never on the wire
    // every value those locks can give, per field (shared/enumParams.ts allowlist: Character Sheet's aspect = its layouts' shapes on each model)
    const tile = (a.fields ?? []).find((f) => (a.lockedField ? f.name === a.lockedField : f.control === 'tiles')); const combos = tile ? tile.options!.map((o) => ({ [tile.name]: o.value })) : [{}]; const vs: Record<string, Set<string>> = {};
    for (const v of combos) for (const p of providers) for (const mode of ['', ...Object.values(a.modeWhenFile ?? {}).map((t) => typesOf(t) ?? ''), typesOf(a.locked.types) ?? '']) for (const [k, x] of Object.entries(a.lockedFor(v, { provider: p, mode }))) (vs[k] ??= new Set(a.locked[k] ? [a.locked[k]] : [])).add(x);
    G.lockedValues = Object.fromEntries(Object.entries(vs).map(([k, s]) => [k, [...s]])); }
  const lockedPreset = typeof a.locked?.preset === 'string' ? a.locked.preset : null;
  if (lockedPreset) Object.defineProperty((def.app as any).gallery, 'lockedStyle', { enumerable: true, configurable: true, get: () => {
    const p: any = (base.presets ?? []).find((x) => x.id === lockedPreset); if (!p) return { field: 'preset', id: lockedPreset, label: lockedPreset, description: null, posterUrl: null, previewWebm: null };
    return { field: 'preset', id: p.id, label: p.label ?? p.id, description: p.description ?? null, group: p.group ?? p.category ?? null, posterUrl: p.posterUrl ?? null, previewWebm: p.previewWebm ?? null };
  } });
  return def;
}
