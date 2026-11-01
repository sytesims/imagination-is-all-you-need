import path from 'node:path';
import { engineModelKey } from '../shared/modelIds.js';
import { META_TAGS_BY_PROVIDER, META_TAG_STYLES } from './voiceTags.js';
import { spawn } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import type { Preset, ToolDef } from './types.js';
import type { Job } from '../jobs.js';
import { DATA_DIR } from '../config.js';
import { probe } from '../media.js';
import { validateMentions } from '../shared/mentions.js';
import { capsFor, checkImageCaps, NEG_PROMPT_MAX, ALL_IMAGE_ASPECTS } from '../shared/imageCaps.js';
import { readModelOptions } from '../shared/imageOptions.js';
import { imageDimsOfFile } from '../imageDims.js';
import { parseRig, rigLabel, rigSentence, withRig } from '../shared/cameraLens.js';
import { mockRun, mockFailOf, parseCommon, seedOf, imageLabels } from './shared.js';
import { registerWorkflowLicense, registerLicense } from '../licenses.js';
import { registerProvider, getProvider } from '../providers.js';
import { catalogFor, cleanName } from '../shared/modelCatalog.js';
import { enhanceRules } from '../cinema/enhance.js';
import { parseLayoutBoxes, LAYOUT_BOX_MODELS, withFlux3BoxRows, FLUX3_IMAGE_PROMPT_MAX } from '../shared/layoutBoxes.js';
import { STYLE_PRESETS, VOICE_LANGUAGES, VOICE_LIBRARY } from './mediaPresets.js';
import { DRAMA3_META_TAGS } from './drama3Tags.js';
import { VOICE_CAPS, VOICE_LIMITS, parseVoiceControls, voiceFieldsOf } from './voice/voiceControls.js';
import { QWEN3_TTS, QWEN3_TTS_WORKFLOW, QWEN3_TTS_SPEAKERS, QWEN3_TTS_LANGUAGES, QWEN3_TTS_DEFAULT_SPEAKER } from './voice/qwen3tts.js';
import { TRANSLATE_LANGS } from '../comfy/plans.js';
import { SEPARATION_PROVIDER, SEPARATION_WORKFLOW, SEPARATION_NODES } from '../comfy/separation.js';
import { registerToolProviderDurations, resolveDuration, durationErrorBody } from './h3/videoCaps.js';
import { addAdjustNote } from '../shared/snap.js';
import { IMAGE_PAGE, VIDEO_PAGE, AUDIO_PAGE } from '../shared/pages.js';
import { UPSCALE_MAX_SIDE, UPSCALE_FACTORS_BY_PROVIDER, UPSCALE_ORDER, UPSCALE_LOCAL, UPSCALE_WORKFLOWS, imageUpscaleInfo, imageUpscaleWorkflowOrDefault, upscaleBlock, upscaleOutSize, upscaleScaleOf } from '../shared/imageUpscale.js';
import './imageUpscaleModels.js'; // Upscale engines, prices and cloud routes added 2026-10-22
import './imageFalModels.js'; // fal image pass (2026-10-22): fal edit routes on existing image models, Bria GenFill for Brush Edit
import './imageFalApps.js'; // photo tools (2026-10-23): Remove Background, Expand, Erase Object, Virtual Try-On on fal
import { assemblePrompt } from '../shared/modePrompt.js';
import { LTX_DFR } from '../shared/ltxDfr.js';
import './imageLayerApps.js'; // Image to layers (2026-10-24): Seedream 5.0 layer separation (Comfy Router), Qwen-Image-Layered listed for Local
import { LYRICS_MAX } from '../shared/audioWorkflows.js';

/**
 * Media tools (Create Image, Generate Video · H3, Audio, Add soundtrack). Same 'app' screen as makeApp, with:
 *  - modes = the tool's presets (one picked); app.providerModes says which providers fit each mode (UI filters, server enforces);
 *  - app.input 'none' (prompt only) | 'image-optional' (image needed only for app.imageModes) | 'video';
 *  - outKind drives the mock render (png / m4a / mp4 with generated audio).
 */
interface MediaCfg {
  id: string; name: string; category: string; description: string; status?: string;
  /** The page's address when it isn't /tools/<id> (Create Image, Create Video and Audio live at /image, /video, /audio: shared/pages.ts). */ route?: string;
  /** Modes that run without a video (Voice Studio voiceover → audio file). */ videoOptionalModes?: string[];
  /** Modes that take an audio file (field `audio`) instead of a video and return audio (Change Voice). */ audioInputModes?: string[];
  /** Batch outputs 1..maxN (priced per output). */ maxN?: number;
  input: 'none' | 'image-optional' | 'video'; outKind: 'image' | 'audio' | 'soundtrack' | 'av-video';
  modes: (Preset & { audioKind?: string })[]; providerModes: Record<string, string[]>; providers: string[];
  imageModes?: string[]; promptOptionalModes?: string[]; durations?: number[]; /** Length when none is sent (default: durations[0]). */ defaultDuration?: number; resolutions: string[];
  rates: Record<string, number>; workflows: string[]; model: string; stages: [string, string][]; fields?: any[];
  /** Style presets (prompt suffix and/or LoRA) — field `style`. */ styles?: (Preset & { lora?: { name: string; strength: number; license: string } | null })[];
  /** Modes that need a mask image (file field `mask`, white = repaint). */ maskModes?: string[];
  /** Expose the prompt-enhance toggle (field `enhance`=1, rules template from cinema/enhance.ts). */ enhance?: boolean;
}
const truthy = (v?: string) => /^(1|true|on|yes)$/i.test(v || '');

export { structuredPrompt } from '../shared/modePrompt.js'; // moved to the shared prompt helper (2026-10-29)

function makeMediaTool(c: MediaCfg): ToolDef {
  return {
    id: c.id, name: c.name, category: c.category, description: c.description, status: c.status ?? 'new', route: c.route ?? `/tools/${c.id}`, ui: 'app',
    inputs: [
      ...(c.input === 'video' ? [{ name: 'video', kind: 'file' as const, required: !c.videoOptionalModes?.length, accept: 'video/*' }] : []),
      ...(c.maxN ? [{ name: 'n', kind: 'select' as const, options: Array.from({ length: c.maxN }, (_, i) => String(i + 1)), default: '1' }] : []),
      ...(c.input === 'image-optional' ? [{ name: 'image', kind: 'file' as const, accept: 'image/png,image/jpeg,image/webp' }] : []),
      ...(c.maskModes?.length ? [{ name: 'mask', kind: 'file' as const, accept: 'image/png' }] : []),
      ...(c.styles?.length ? [{ name: 'style', kind: 'select' as const, options: ['none', ...c.styles.map((x) => x.id)], default: 'none' }] : []),
      ...(c.enhance ? [{ name: 'enhance', kind: 'select' as const, options: ['0', '1'], default: '0' }] : []),
      { name: 'types', kind: 'list', required: true, options: c.modes.map((m) => m.id) },
      { name: 'prompt', kind: 'text' },
      ...(c.durations ? [{ name: 'duration', kind: 'select' as const, options: c.durations.map(String), default: String(c.defaultDuration ?? c.durations[0]) }] : []),
      ...(c.fields ?? []).map((f) => ({ name: f.name, kind: 'select' as const, options: f.options.map((o: any) => o.value), default: f.default })),
      { name: 'resolution', kind: 'select', options: c.resolutions, default: c.resolutions[0] },
      { name: 'seed', kind: 'number' },
    ],
    presets: c.modes,
    app: { input: c.input, mix: 1, durations: c.durations ?? null, enhance: !!c.enhance, styles: c.styles ?? [], maskModes: c.maskModes ?? [], steps: null, prompt: true, resolutions: c.resolutions, fields: c.fields ?? [],
      kind: c.outKind, modes: true, imageModes: c.imageModes ?? [], promptOptionalModes: c.promptOptionalModes ?? [], providerModes: c.providerModes },
    workflows: c.workflows, model: c.model, gpuSecPerSec: c.rates, stages: c.stages, providers: c.providers,
    async parseInput(fields, files) {
      let types: string[] = [];
      try { types = JSON.parse(fields.types || '[]'); } catch { types = (fields.types || '').split(','); }
      const mode = c.modes.find((m) => m.id === String(types[0] ?? '').trim());
      if (!mode) { const msg = `Pick a mode: ${c.modes.map((m) => m.label).join(', ')}.`; const code = types.length ? 'invalid_type' : 'type_required'; return { error: msg, code, issues: [{ code, field: 'types', message: msg }] } as any; }
      const provider = fields.provider || c.providers.find((p) => c.providerModes[p]?.includes(mode.id)) || c.providers[0];
      if (!c.providerModes[provider]?.includes(mode.id)) { // plain model names, never internal ids (QA #16)
        const nameOf = (p: string) => catalogFor(c.id, p)?.name ?? (getProvider(p)?.name ? cleanName(String(getProvider(p)!.name)) : p);
        const ok = [...new Set(c.providers.filter((p) => c.providerModes[p]?.includes(mode.id)).map(nameOf))];
        const msg = `${nameOf(provider)} can't do ${mode.label}. Pick one of: ${ok.length > 6 ? `${ok.slice(0, 6).join(', ')} (or ${ok.length - 6} more)` : ok.join(', ')}.`;
        return { error: msg, code: 'unsupported', issues: [{ code: 'unsupported', field: 'provider', message: msg }] } as any; }
      const prompt = (fields.prompt || '').slice(0, 10_000);
      if (!prompt.trim() && !(c.promptOptionalModes ?? []).includes(mode.id)) return { error: 'Describe what to generate.' };
      const draft = truthy(fields.draft);
      const resolution = draft && c.resolutions.includes('480p') ? '480p' : (fields.resolution || c.resolutions[0]);
      if (c.id === 'image-upscale' && /^(1440p|2160p|4k)$/i.test(resolution)) return { error: 'Upscale works by factor, not target resolution: pick 2x, 4x or 8x of your source (a 1000 px image at 4x = 4000 px).', issues: [{ code: 'invalid', field: 'resolution', message: 'Pick 2x, 4x or 8x instead of a target resolution.' }] } as any;
      if (c.id === 'image-upscale' && /^(1440p|2160p|4k)$/i.test(resolution)) return { error: 'Upscale works by factor, not target resolution: pick 2x, 4x or 8x of your source (a 1000 px image at 4x = 4000 px).', issues: [{ code: 'invalid', field: 'resolution', message: 'Pick 2x, 4x or 8x instead of a target resolution.' }] } as any;
      if (!c.resolutions.includes(resolution)) return { error: `Quality must be one of ${c.resolutions.join(', ')}.` };
      if (c.durations && fields.duration != null && fields.duration !== '' && !c.durations.includes(Number(fields.duration)))
        return { error: `Duration must be ${c.durations.join(', ').replace(/, (\d+)$/, ' or $1')} s.`, issues: [{ code: 'invalid', field: 'duration', message: `Duration must be ${c.durations.join(', ')} s.` }] } as any;
      const duration = c.durations ? (c.durations.includes(Number(fields.duration)) ? Number(fields.duration) : c.defaultDuration ?? c.durations[0]) : 1;
      const extra: Record<string, any> = {};
      for (const f of c.fields ?? []) { const v = fields[f.name] ?? f.default;
        /* Create Image: a well-formed aspect is checked per model below (checkImageCaps), so the 400 names that model's own list, not every model's */
        if (c.id === 'create-image' && f.name === 'aspect' && capsFor(provider) && /^\d{1,4}(\.\d{1,2})?:\d{1,4}(\.\d{1,2})?$/.test(String(v))) { extra[f.name] = v; continue; }
        if (!f.options.some((o: any) => o.value === v)) return { error: `${f.label}: pick one of ${f.options.map((o: any) => o.value).join(', ')}.` }; extra[f.name] = v; }
      const style = c.styles?.find((x) => x.id === fields.style) ?? null;
      if (fields.style && fields.style !== 'none' && !style) return { error: `Unknown style "${fields.style}".` };
      const enhanced = c.enhance && truthy(fields.enhance) && prompt.trim() ? enhanceRules(prompt, c.outKind === 'image' ? 'image' : c.outKind === 'audio' ? 'audio' : 'video', undefined, engineModelKey(c.id, provider)).prompt /* the model's cap and name (prompt grammar) */ : null;
      const common = { types: [mode.id], mode: mode.id, audioKind: mode.audioKind, outKind: c.outKind, prompt, enhancedPrompt: enhanced, style: style?.id ?? null, styleLora: style?.lora ?? null,
        // the mode's words only when needed, per model, and a default for an image with no prompt (shared/modePrompt.ts, 2026-10-29); `prompt` keeps the typed words (Recreate)
        finalPrompt: assemblePrompt({ mode: mode.id, modePhrase: mode.prompt, prompt: enhanced ?? prompt, style: style?.prompt, provider, model: engineModelKey(c.id, provider) }),
        resolution, duration, draft, seed: seedOf(fields.seed), simulate: mockFailOf(fields), target: '', ...extra };
      if ((fields.n == null || fields.n === '') && (fields.count || fields.batch)) fields.n = String(fields.count || fields.batch); // aliases: count / batch
      let nOut = Number(fields.n || extra.n) || 1; // Create Image: `n` comes from its field list (validated 1–4 above)
      if (c.maxN && fields.n != null && fields.n !== '') { nOut = Number(fields.n); if (!Number.isInteger(nOut) || nOut < 1 || nOut > c.maxN) return { error: `Outputs (n) must be 1–${c.maxN}.`, issues: [{ code: 'invalid', field: 'n', message: `Outputs (n) must be 1–${c.maxN}.` }] } as any; }
      (common as any).n = nOut;
      if (c.id === 'create-image') { // per-model capabilities (shared/imageCaps.ts): 400, nothing charged
        const nImgs = (files.image?.length ?? 0) + (files.refs?.length ?? 0);
        /* input prep (2026-10-23): an edit on a model that follows the photo can still deliver a picked aspect when the photo already has it (the bar fitted / cropped it) */
        const img0 = mode.id === 'edit' && fields.aspect && fields.aspect !== 'auto' ? files.image?.[0] : undefined; const dims = img0 ? imageDimsOfFile(path.join(DATA_DIR, img0)) : null;
        const cap = checkImageCaps(provider, { aspect: fields.aspect, quality: fields.quality, imageResolution: fields.imageResolution, n: nOut, refs: (c.imageModes ?? []).includes(mode.id) ? nImgs : 0, mode: mode.id, ...(dims ? { photoAspect: `${dims.width}:${dims.height}` } : {}) });
        if (!cap.ok) return { error: cap.issues[0].message, issues: cap.issues } as any;
        Object.assign(common, { aspect: cap.aspect, quality: cap.tier ?? 'med', tier: cap.tier, imageResolution: cap.imageResolution });
        for (const n of cap.notes ?? []) addAdjustNote(common as any, n); // D5: a setting this model doesn't offer, snapped to the nearest one
        /* model extras (shared/imageCaps.ts extras): a negative prompt and the model's own prompt rewrite, only where the model documents them */
        const ex = capsFor(provider)?.extras; const neg = String(fields.negativePrompt ?? '').trim(); const rw = String(fields.promptRewrite ?? '').trim();
        if (neg) { if (!ex?.negativePrompt) return { error: 'This model has no negative prompt.', issues: [{ code: 'unsupported', field: 'negativePrompt', message: 'This model has no negative prompt.' }] } as any;
          if (neg.length > NEG_PROMPT_MAX) return { error: `Negative prompt: up to ${NEG_PROMPT_MAX} characters (yours is ${neg.length}).`, issues: [{ code: 'invalid', field: 'negativePrompt', message: `Up to ${NEG_PROMPT_MAX} characters.` }] } as any;
          (common as any).negativePrompt = neg; }
        if (truthy(rw)) { if (!ex?.promptRewrite) return { error: 'This model has no prompt rewrite option.', issues: [{ code: 'unsupported', field: 'promptRewrite', message: 'This model has no prompt rewrite option.' }] } as any;
          (common as any).promptRewrite = true; }
        else if (ex?.promptRewriteDefault) (common as any).promptRewrite = !rw; // FLUX.2: rewrites by default; promptRewrite=0 turns it off (the job says which, so a rerun matches)
        /* layout boxes (2026-10-27, shared/layoutBoxes.ts): field `boxes` = [{label, box: [top, left, bottom, right] on 0–1000}], FLUX 3 Klein (local) and FLUX 3 Image; empty = nothing changes */
        const lb = parseLayoutBoxes(fields.boxes);
        if (!lb.ok) return { error: lb.message, issues: [{ code: 'invalid', field: 'boxes', message: lb.message }] } as any;
        if (lb.boxes.length) { if (!LAYOUT_BOX_MODELS[provider]) { const msg = `Layout boxes work on ${Object.values(LAYOUT_BOX_MODELS).map((x) => x.name).join(' and ')}; this model has none.`; return { error: msg, issues: [{ code: 'unsupported', field: 'boxes', message: msg }] } as any; }
          const withRows = provider === 'api-flux3-image' ? withFlux3BoxRows(common.finalPrompt, lb.boxes).length : 0;
          if (withRows > FLUX3_IMAGE_PROMPT_MAX) { const msg = `The prompt with its layout boxes is ${withRows} characters; FLUX 3 Image takes up to ${FLUX3_IMAGE_PROMPT_MAX}. Shorten the prompt or the box labels.`; return { error: msg, issues: [{ code: 'invalid', field: 'boxes', message: msg }] } as any; }
          (common as any).layoutBoxes = lb.boxes; }
        /* model options (shared/imageOptions.ts): Style and the like, only the fields the model documents; none change the price */
        const mo = readModelOptions(capsFor(provider)?.options, fields);
        if (!mo.ok) return { error: mo.message, issues: [{ code: 'unsupported', field: mo.field, message: mo.message }] } as any;
        if (Object.keys(mo.values).length) (common as any).options = mo.values;
        if (mode.id === 'edit') { // Edit Image: Auto = follow the photo (plans editSize); "@image2" mentions become plain "image 2" (Qwen 2.1 turns them into its <image2> tags)
          (common as any).aspectAuto = !fields.aspect || fields.aspect === 'auto' || cap.followsPhoto === true; const words = (x: string | null) => x && x.replace(/@image\s*([1-9])\b/gi, 'image $1');
          common.finalPrompt = words(common.finalPrompt)!; if (common.enhancedPrompt) common.enhancedPrompt = words(common.enhancedPrompt); }
        // Camera & Lens: a rig (cameraBody, lens, focal, aperture) adds our camera sentence to the prompt on any model; stored as input.camera (the job then shows as Camera & Lens)
        const rig = parseRig(fields);
        if (rig && 'error' in rig) return { error: rig.error, issues: [{ code: 'invalid', field: rig.field, message: rig.error }] } as any;
        if (rig) Object.assign(common, { camera: { ...rig.rig, label: rigLabel(rig.rig), sentence: rigSentence(rig.rig) }, finalPrompt: withRig(common.finalPrompt, rig.rig) });
      }
      if (c.input === 'video' && !files.video?.length && (c.videoOptionalModes ?? []).includes(mode.id)) {
        if (!prompt.trim()) return { error: 'Write the script to voice.', issues: [{ code: 'required', field: 'prompt', message: 'Write the script to voice.' }] } as any;
        const sample = files.voiceAudio?.[0];
        if (extra.voice === 'clone' && !sample) return { error: 'Upload a 5–15 second sample of the voice to clone (field voiceAudio).' };
        const secs = Math.max(2, Math.min(120, Math.round(prompt.trim().split(/\s+/).length / 2.5)));
        return { ...common, outKind: 'audio', audioOnly: true, videoPath: '', videoUrl: '', duration: secs, outputDuration: secs, warnings: [], keepAudio: false,
          ...(sample ? { voiceSamplePath: path.join(DATA_DIR, sample), voiceSampleUrl: `/files/${sample}` } : {}) };
      }
      if (c.input === 'video' && !files.video?.length && files.audio?.length && (c.audioInputModes ?? []).includes(mode.id)) { // DP #22: Change Voice on an audio file → an audio file back
        const a = files.audio[0]; const secs = await (await import('../ffmpeg.js')).mediaDuration(path.join(DATA_DIR, a)).catch(() => 0);
        if (!(secs > 0)) return { error: 'That audio file could not be read. Use MP3, WAV, M4A, AAC, OGG or FLAC.', issues: [{ code: 'format', field: 'audio', message: 'That audio file could not be read.' }] } as any;
        const sample = files.voiceAudio?.[0];
        if (extra.voice === 'clone' && !sample) return { error: 'Upload a 5–15 second sample of the voice to clone (field voiceAudio).' };
        const d = Math.round(secs * 100) / 100;
        return { ...common, outKind: 'audio', audioKind: 'voice', audioOnly: true, audioInput: true, videoPath: '', videoUrl: '', sourceAudioPath: path.join(DATA_DIR, a), sourceAudioUrl: `/files/${a}`,
          duration: Math.min(d, 30), outputDuration: d, warnings: [], keepAudio: false, ...(sample ? { voiceSamplePath: path.join(DATA_DIR, sample), voiceSampleUrl: `/files/${sample}` } : {}) };
      }
      if (c.input === 'video') {
        const base = await parseCommon({ ...fields, prompt }, files, { refsRequired: false, maxRefs: 0, soundOnly: c.id === 'soundtrack' });
        if ('error' in base) return base;
        const sample = files.voiceAudio?.[0]; // Voice Studio: "My cloned voice" sample (5–15 s speech), file field `voiceAudio`
        if (extra.voice === 'clone' && !sample) return { error: 'Upload a 5–15 second sample of the voice to clone (field voiceAudio).' };
        const samplePart = sample ? { voiceSamplePath: path.join(DATA_DIR, sample), voiceSampleUrl: `/files/${sample}` } : {};
        return { ...base, ...common, ...samplePart, resolution: base.resolution, duration: Math.min(base.duration, 30), outputDuration: base.duration };
      }
      const img = files.image?.[0] ?? files.refs?.[0];
      const needImg = (c.imageModes ?? []).includes(mode.id);
      if (needImg && !img) return { error: `${mode.label} needs an image (PNG/JPG).` };
      const allImgs = [...(files.image ?? []), ...(files.refs ?? [])]; // Create Image: up to the model's maxRefs (checked above); FLUX 3 Klein takes 10
      const mv = validateMentions(prompt, { images: img && needImg ? allImgs.length : mode.id === 'keyframes' ? (files.keyframes?.length ?? 0) /* Keyframes: @image1… = frame 1… */ : 0, videos: mode.id === 'r2v' ? (files.refVideos?.length ?? 0) /* Reference mode: @video1… = the reference clips */ : 0 });
      if (!mv.ok) return { error: mv.issues[0].message, mentionIssues: mv.issues.map((i) => ({ code: i.code, mention: i.mention.raw, start: i.mention.start, end: i.mention.end, message: i.message })) } as any;
      const needMask = (c.maskModes ?? []).includes(mode.id); const mask = files.mask?.[0];
      if (needMask && !mask) return { error: `${mode.label} needs a mask: paint the area to change (white = repaint).` };
      if (mask && (!/\.png$/i.test(mask) || !(await probe(path.join(DATA_DIR, mask))))) return { error: 'The mask must be a PNG.' };
      const maskPart = needMask && mask ? { maskPath: path.join(DATA_DIR, mask), maskUrl: `/files/${mask}` } : {};
      if (img && needImg) {
        for (const f of allImgs) if (!/\.(png|jpe?g)$/i.test(f) || !(await probe(path.join(DATA_DIR, f)))) return { error: 'Unsupported format: use PNG or JPG.' };
        const use = mode.id === 'inpaint' ? [img] : allImgs;
        return { ...common, ...maskPart, imagePath: path.join(DATA_DIR, img), imageUrl: `/files/${img}`, refUrls: use.map((f) => `/files/${f}`), refPaths: use.map((f) => path.join(DATA_DIR, f)), warnings: [] };
      }
      return { ...common, warnings: img ? ['The image was ignored: this mode is prompt-only.'] : [] };
    },
    run(job: Job) {
      const label = c.modes.find((m) => m.id === job.input.mode)?.label ?? 'Result';
      const n = Math.max(1, Number(job.input.n) || 1); // batch: one output per image (Create Image n = 1–4; Shots: one per angle, labelled)
      return mockRun(job, c.stages, c.outKind === 'image' ? imageLabels(job.input, label) : n > 1 ? Array.from({ length: n }, (_, k) => `${label} ${k + 1}`) : [label], c.outKind === 'image' ? 4000 : 6000);
    },
  };
}
const m = (id: string, label: string, prompt: string, audioKind?: string): Preset & { audioKind?: string } => ({ id, label, prompt, group: 'Mode', audioKind });
const IMG_OPEN = ['comfy-flux3-klein', 'comfy-zimage-turbo', 'comfy-zimage', 'comfy-klein4b', 'comfy-flux2dev', 'comfy-moss-image', 'comfy-moss-image-base'];
const IMG_HOSTED = ['direct-flux2-flex', 'direct-flux2-klein-9b', 'direct-minimax-image', 'direct-gemini-nb2-lite', 'api-flux2', 'api-gpt-image', 'api-nano-banana', 'api-seedream', 'api-ideogram', 'api-recraft', 'api-luma-image', 'api-kling-image', 'api-krea', 'api-runway-image', 'api-grok-image', 'api-qwen-image', 'api-wan-image', 'api-hunyuan-image', 'api-meta-muse',
  // added 2026-10-22 (model-catalog pass)
  'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-nano-banana-21', 'api-nano-banana-pro', 'api-flux3-image', 'api-flux2-max', 'api-seedream-flash', 'api-ideogram-45', 'api-qwen-image-pro', 'api-recraft-41', 'api-recraft-41-pro', 'api-luma-uni1-max',
  // added 2026-10-25 (Comfy Router image batch)
  'api-gpt-image-15', 'api-seedream-45', 'api-grok-image-pro',
  'api-bria-fibo2' /* 2026-10-26 */];
/** Hosted nodes that also take an input image for editing (partner nodes with an image input). */
const IMG_EDIT_HOSTED = ['comfy-flux3-klein', 'comfy-klein4b', 'direct-flux2-flex', 'direct-flux2-klein-9b', 'direct-gemini-nb2-lite' /* Gemini API (batch 2) */, /* BFL API edit routes (routing/directRoutes.ts) */, 'comfy-flux2dev' /* FLUX.2 dev reference edit: workflow create-image-flux2dev-api.json (ReferenceLatent, 1 ref) */, 'api-flux2', 'api-gpt-image', 'api-nano-banana', 'api-seedream', 'api-luma-image', 'api-kling-image',
  'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-nano-banana-21', 'api-nano-banana-pro', 'api-flux3-image', 'api-flux2-max', 'api-seedream-flash', 'api-ideogram-45', 'api-qwen-image-pro', 'api-qwen-image', 'api-luma-uni1-max',
  'api-grok-image' /* edits on its fal route only (xai/grok-imagine-image/v2.0/edit); the Router body sends no image */,
  'api-runway-image' /* 2026-10-24: up to 3 photos as referenceImages (data URIs) on its Comfy Router body */,
  'api-gpt-image-15', 'api-seedream-45' /* 2026-10-25: Router edits (16 / 14 images). Grok Imagine Image Pro is out: its Router schema takes no image */,
  'api-bria-fibo2' /* 2026-10-26: FIBO 2.0 edits one photo on Router bria/fibo */];
// Image grid (2026-10-22): only routes that really send the image edit. Ideogram V4 and Grok Imagine 2.0 are out (their Comfy Router body sends no image); FLUX.2 [flex] has no wired route.
/** Routes with a mask input. Image grid finding 2: Nano Banana 2 and Ideogram V4 have no mask route, so they never inpaint. */
const IMG_INPAINT_HOSTED = ['comfy-flux3-klein', 'api-gpt-image', 'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-ideogram-45' /* mask on its fal route (ideogram/v4.5/edit mask_url) */, 'api-gpt-image-15', 'api-bria-fibo2' /* bria/fibo mask */];

/** Create Image quality order. Nano Banana 2 first (Comfy partner node when available; fal / Replicate alternatives),
 *  GPT Image, then FLUX 3 Klein (the open-weights alternate: BFL / fal / local), then the other hosted models, then the local open models.
 *  The old "Qwen Image 2.1 always default" rule is gone; Qwen Image 2.1 runs locally only, so it is never a cloud default. */
const IMG_QUALITY = ['api-nano-banana', 'api-gpt-image', 'comfy-flux3-klein', 'api-seedream', 'api-flux2', 'direct-flux2-flex', 'api-ideogram'];
const qwenOrder = ['comfy-qwen21', 'comfy-qwen21-turbo', 'comfy-qwen-image'];
const uniqIds = (xs: string[]) => [...new Set(xs)];

export const createImageTool = makeMediaTool({
  id: 'create-image', route: IMAGE_PAGE /* the Image page (2026-10-31): /image; the tool id stays create-image */, name: 'Create Image', category: 'Image', input: 'image-optional', outKind: 'image',
  description: 'Make an image from your words, or change one you upload. Pick any model; the price shows before you generate.',
  modes: [m('generate', 'Generate', ''), m('edit', 'Edit image', '') /* no prefix: the prompt the user wrote is what the model (and Details) gets */, m('inpaint', 'Inpaint (mask)', 'change only the masked area as described, keep everything else')], imageModes: ['edit', 'inpaint'], maskModes: ['inpaint'],
  styles: STYLE_PRESETS, enhance: true,
  providers: uniqIds([...IMG_QUALITY, ...IMG_HOSTED, ...qwenOrder, ...IMG_OPEN]),
  providerModes: Object.fromEntries([['comfy-qwen21', ['generate', 'edit']], ['comfy-qwen21-turbo', ['generate', 'edit']], ['comfy-qwen-image', ['generate', 'edit', 'inpaint']], ...[...IMG_OPEN, ...IMG_HOSTED].map((p) => [p, IMG_EDIT_HOSTED.includes(p) ? (IMG_INPAINT_HOSTED.includes(p) ? ['generate', 'edit', 'inpaint'] : ['generate', 'edit']) : ['generate']])]),
  resolutions: ['720p', '1080p', '480p'], rates: { '480p': 6, '720p': 12, '1080p': 22 },
  workflows: ['create-image-qwen21-t2i-api.json', 'create-image-qwen21-edit-api.json', 'create-image-qwen21-turbo-t2i-api.json', 'create-image-qwen21-turbo-edit-api.json', 'create-image-qwen-t2i-api.json', 'create-image-qwen-edit2509-api.json',
    'create-image-zimage-turbo-api.json', 'create-image-zimage-api.json', 'create-image-klein4b-t2i-api.json', 'create-image-klein4b-edit-api.json', 'create-image-flux2dev-api.json', 'create-image-qwen-edit2509-inpaint-api.json',
    'create-image-flux3klein-t2i-api.json', 'create-image-flux3klein-edit-api.json', 'create-image-flux3klein-inpaint-api.json', 'create-image-flux3klein-multiref-api.json',
    'create-image-moss-image-api.json', 'create-image-moss-image-base-api.json'],
  model: 'Nano Banana 2 (default) · FLUX 3 Klein · Qwen Image 2.1 (+ Turbo) · Qwen-Image / Qwen-Image-Edit-2509 (Apache) · hosted partner image nodes',
  stages: [['uploading', 'Uploading'], ['encoding', 'Encoding prompt'], ['rendering', 'Rendering image'], ['saving', 'Saving']],
  /** Image count (price = per-image × n), aspect ratio and quality tier; validated by makeMediaTool's field check. */
  fields: [
    { name: 'n', label: 'Images', kind: 'select', options: ['1', '2', '3', '4'].map((v) => ({ value: v, label: v })), default: '1' },
    /* every aspect some model takes (shared/imageCaps.ts ALL_IMAGE_ASPECTS, from each model's own list; that list is checked per model by checkImageCaps) */
    { name: 'aspect', label: 'Aspect ratio', kind: 'select', options: ['auto', ...ALL_IMAGE_ASPECTS].map((v) => ({ value: v, label: v === 'auto' ? 'Auto' : v })), default: 'auto' },
    { name: 'quality', label: 'Quality', kind: 'select', options: [{ value: 'low', label: 'Low' }, { value: 'med', label: 'Medium' }, { value: 'high', label: 'High' }], default: 'med' },
  ],
});
for (const p of createImageTool.presets ?? []) p.posterUrl ??= `/samples/presets/create-image-${p.id}.jpg`;
// More reference images (Edit image; up to 9 besides `image`, capped per model by imageCaps maxRefs, e.g. FLUX 3 Klein 10 in total). Right after `image`,
// so Recreate prefill lists files {image, refs} and submit {fromJob, reuseInputs:"image,refs"} (refs = refUrls minus imageUrl, routesPrefill.formFromInput).
{ const at = createImageTool.inputs.findIndex((i) => i.name === 'image');
  createImageTool.inputs.splice(at + 1, 0, { name: 'refs', kind: 'files', accept: 'image/png,image/jpeg,image/webp', max: 15, label: 'More reference images' }); } // up to 16 images in total (GPT Image 2)

export const h3VideoTool = makeMediaTool({
  id: 'h3-video', route: VIDEO_PAGE /* the one Video page (2026-10-31): /video; the tool id stays h3-video */, name: 'Generate Video', category: 'Video', input: 'image-optional', outKind: 'av-video',
  description: 'Text or a photo into a clip with sound. Pick any model; the price shows before you generate.',
  modes: [m('t2v', 'Text to video', ''), m('i2v', 'Image to video', 'animate the image'), m('flf', 'Start + end frame', 'move from the start frame to the end frame'), m('r2v', 'Reference to video', 'keep the referenced subject'), m('keyframes', 'Keyframes', '') /* 2–5 stills at chosen times → one shot (MiniMax H3 Keyframes · Comfy Cloud, 2026-10-27); frames go as field `keyframes` */], imageModes: ['i2v', 'flf', 'r2v'], promptOptionalModes: ['i2v'] /* an image with no prompt sends a plain default (shared/modePrompt.ts) */,
  providers: ['comfy-h3', 'comfy-wan22-5b' /* Wan 2.2 5B: free local, runs on Apple Silicon (2026-10-24) */, 'comfy-ltx25-video' /* LTX-2.5 22B: free local with sound (2026-10-25) */, 'router-seedance', 'router-veo', 'router-kling', 'router-wan3' /* Wan 3.0 on Comfy Router, 2026-10-25 */, 'api-minimax-h3', 'cloud-h3', 'cloud-h3-wf', 'cloud-h3-fast' /* MiniMax H3 Fast · Comfy Cloud (FastH3 templates, 2026-10-27) */, 'comfy-h3-pika' /* Pika H3 Flex: your ComfyUI, and Comfy Cloud as its twin cloud-h3-pika (official templates, 2026-11-01) */, 'cloud-h3-keyframes' /* the H3 card's Keyframes place (hidden twin alias, 2026-10-27) */, 'direct-ltx-25-pro', 'router-ltx-25-pro', 'direct-ltx-25-fast', 'direct-flux3-video', 'router-flux3-video' /* LTX-2.5 Pro / FLUX 3 Video on Comfy Router: another place of the same model */, 'direct-ltx-23-fast', 'direct-seedance-25', 'direct-seedance-20-fast', 'direct-seedance-20-mini', 'router-seedance-25', 'router-seedance-20-fast', 'router-seedance-20-mini', 'router-veo-fast' /* Comfy Router places of the same models (2026-10-25) */, 'router-wan3-prime', 'router-veo-lite', 'router-pvideo2', 'router-grok-video-lite' /* Comfy Router video models (2026-10-31) */] /* official lab APIs (2026-10-23): LTX on the LTX API, FLUX 3 Video on BFL */, // B6: MiniMax H3 stays the default here (its first route is the H3 Comfy Cloud workflow; cloud-h3-wf = hidden alias); Seedance 2.0 / Veo 3.1 / Kling v3 next
  // H3 additions (2026-10-17): Fast (LightX2V 8-step) / Quality (20 steps) on the local route; cloud routes always run their own quality.
  fields: [{ name: 'quality', label: 'Mode', kind: 'select', options: [{ value: 'quality', label: 'Quality' }, { value: 'fast', label: 'Fast' }], default: 'quality' }],
  providerModes: { 'comfy-h3': ['t2v', 'i2v', 'flf', 'r2v', 'keyframes' /* Comfy Cloud only (routes.ts TWINS) */], 'cloud-h3-keyframes': ['keyframes'], 'comfy-wan22-5b': ['t2v', 'i2v'], 'comfy-ltx25-video': ['t2v', 'i2v', 'flf'], 'direct-seedance-25': ['t2v', 'i2v', 'flf', 'r2v'], 'direct-seedance-20-fast': ['t2v', 'i2v', 'flf', 'r2v'], 'direct-seedance-20-mini': ['t2v', 'i2v', 'flf', 'r2v'], 'cloud-h3-wf': ['t2v', 'i2v'], 'cloud-h3-fast': ['t2v', 'i2v'], 'comfy-h3-pika': ['t2v', 'i2v', 'flf'], 'cloud-h3-pika': ['t2v', 'i2v', 'flf'], 'cloud-h3': ['t2v', 'i2v'], 'api-minimax-h3': ['t2v', 'i2v', 'flf', 'r2v'] /* flf: the Router body and the MiniMax API both take first + last frame */, 'direct-ltx-25-pro': ['t2v', 'i2v', 'flf'], 'direct-ltx-25-fast': ['t2v', 'i2v', 'flf'], 'direct-ltx-23-fast': ['t2v', 'i2v', 'flf'], 'direct-flux3-video': ['t2v', 'i2v', 'flf'], 'router-kling': ['t2v', 'i2v', 'flf', 'r2v'] /* Kling 3.0 Omni (kling/kling-v3-omni): text, first / end frame, up to 7 reference images */, 'router-wan3': ['t2v', 'i2v', 'flf', 'r2v'], 'router-ltx-25-pro': ['t2v', 'i2v', 'flf'] /* text on Comfy Router (ltx/ltx-2-5-pro has no image input); start image / first + last on Comfy Cloud via the LTX-2.5 partner node (2026-10-27) */, 'router-flux3-video': ['t2v', 'i2v', 'flf'], 'router-veo': ['t2v', 'i2v'], 'router-seedance': ['t2v', 'i2v', 'r2v'],
    'router-seedance-25': ['t2v', 'i2v', 'flf', 'r2v'], 'router-seedance-20-fast': ['t2v', 'i2v', 'flf', 'r2v'], 'router-seedance-20-mini': ['t2v', 'i2v', 'flf', 'r2v'] /* the Seedance Router body takes first + last frame */, 'router-veo-fast': ['t2v', 'i2v'] /* as Veo 3.1 */,
    'router-veo-lite': ['t2v', 'i2v'] /* as Veo 3.1 */, 'router-wan3-prime': ['t2v', 'i2v', 'flf', 'r2v'] /* as Wan 3.0 */, 'router-pvideo2': ['t2v', 'i2v', 'flf'], 'router-grok-video-lite': ['t2v', 'i2v'] /* 2026-10-31 */ },
  durations: Array.from({ length: 29 }, (_, k) => k + 2) /* 2–30 s: the union of every model's lengths (LTX Fast / FLUX 3 to 20 s, Wan 3.0 / Seedance 2.5 to 30 s); each model's own list is the rule (tools/h3/videoCaps.ts resolveDuration, same on quote and submit) */, resolutions: ['768p', '480p', '720p', '1080p', '2K', '1440p', '4K', '704p', '448p', '576p', LTX_DFR] /* per model: videoCaps resolutions (704p = Wan 2.2 5B's 1280×704; 448p / 576p = LTX-2.5 22B local Draft / Sharper; dfr = its DFR quality, shared/ltxDfr.ts) */, rates: { '768p': 30, '480p': 30, '720p': 30, '1080p': 30, '2K': 30, '1440p': 30, '4K': 30, '704p': 30, '448p': 30, '576p': 30, [LTX_DFR]: 30 },
  workflows: ['h3-t2v-api.json', 'h3-i2v-api.json', 'h3-r2v-api.json', 'h3-cloud-t2v-api.json', 'h3-cloud-i2v-api.json', 'cloud/h3-t2v-api.json', 'cloud/h3-i2v-api.json', 'cloud/h3-fast-t2v-api.json', 'cloud/h3-fast-i2v-api.json', 'pika-h3-flex-t2v-api.json', 'pika-h3-flex-fl2va-api.json', 'cloud/pika-h3-flex-t2v-api.json', 'cloud/pika-h3-flex-fl2va-api.json', 'cloud/h3-multiframe-api.json', 'h3-t2v-fast-api.json', 'h3-flf-api.json', 'h3-flf-fast-api.json', 'wan22-ti2v-5b-api.json', 'ltx25-ti2v-api.json', 'ltx25-flf-api.json'], model: 'MiniMax H3 (video + audio, 768p) · Wan 2.2 5B (local, silent) · LTX-2.5 22B (local, with sound)',
  stages: [['uploading', 'Uploading'], ['encoding', 'Encoding prompt'], ['rendering', 'Rendering video + audio'], ['muxing', 'Muxing audio']],
  enhance: true /* Create Video's ✨ (2026-10-23): field enhance=1 adds the video rules words to finalPrompt, the same path as Create Image; off unless sent */,
});
// B6 quality order per mode (best first; the default is the first that runs).
// 2026-10-27: MiniMax Music 3 is ONE card (open weights): comfy-minimax-music3 runs it locally, cloud-minimax-music (its Comfy Cloud twin, a hidden alias
// here: routing/routes.ts TWINS) on Comfy Cloud. Seed Audio 1.0 Multilingual (Comfy Router) makes music and sound effects too (Comfy docs:
// tutorials/partner-nodes/bytedance/seed-audio-1-0, "speech, music, sound effects"): one prompt, no lyrics field, no length field (up to 2 min).
const MUSIC = ['api-sonilo-music', 'api-seed-audio', 'comfy-yue2', 'comfy-minimax-music3', 'cloud-minimax-music' /* after its open engine: the card's primary stays Local */, 'comfy-acestep']; // local: YuE2 > MiniMax Music 3 > ACE-Step (2026-10-23)
/** Cover a song (2026-10-23): a reference song in, a new version with the same melody out. YuE2 only (SheetSage2 → YuE2, official template audio_yue2_music_cover). */
const COVER = ['comfy-yue2'];
const SFX = ['api-eleven-sfx', 'api-seed-audio', 'comfy-stable-audio'];
// Seed Audio 1.0 Multilingual (Comfy Router) reads a script here; in Music and Sound effects (above) its prompt describes the sound (2026-10-27).
// 2026-10-27: Qwen3 TTS is ONE card, local open weights (comfy-qwen3tts); the paid direct Alibaba entry (direct-qwen3-tts) is retired (shared/lifecycle.ts).
const VOICE = ['api-eleven-tts', 'api-eleven-v3', 'api-eleven-v4-turbo', 'direct-minimax-speech', 'direct-minimax-speech-turbo', 'api-fish-tts', 'api-heygen-tts', 'api-seed-audio', 'comfy-chatterbox', QWEN3_TTS, 'comfy-drama3', 'comfy-f5tts'];
const uniq = (xs: string[]) => [...new Set(xs)];
// Audio lengths (2026-10-25): music and local sound effects keep 10 / 30 / 60 s; ElevenLabs SFX v2 takes 0.5–30 s on Comfy Router (docs.comfy.org/development/
// comfy-router/models/elevenlabs/eleven-sfx-v2), so short one-shots are offered there. The tool list is the union (what submit accepts); the per-model
// list (app.durationsByProvider) is what the Audio page offers. Price: per minute of the length sent (shared/hostedPrices.ts), so the quote follows.
const AUDIO_DURATIONS = [10, 30, 60]; const ELEVEN_SFX_DURATIONS = [1, 2, 3, 5, 10, 15, 30];
// Each music / sound model's own lengths (2026-10-27, Audio fixes B), inside what the model really takes (docs.comfy.org node pages, checked 2026-10-27):
//  Sonilo Text to Music: duration 1–360 s · ACE-Step 1.5: 10 s to 10 min · YuE2: max_duration (our plan caps it at 360 s; the template uses 120)
//  · MiniMax Music 3: max_duration, the model makes up to ~5 min (local and Comfy Cloud) · Stable Audio Open 1.0: up to 47 s (EmptyLatentAudio 47.6).
// YuE2 and MiniMax Music 3 treat the length as a cap: the song can end sooner (AUDIO_LENGTH_UP_TO, shown as "up to" on the Audio page).
export const AUDIO_LENGTHS: Record<string, number[]> = {
  'api-sonilo-music': [10, 30, 60, 120, 180, 240, 360], 'comfy-acestep': [10, 30, 60, 120, 180, 240, 360, 600],
  'comfy-yue2': [30, 60, 120, 180, 240, 360], 'comfy-minimax-music3': [30, 60, 120, 180, 240, 300], 'cloud-minimax-music': [30, 60, 120, 180, 240, 300],
  'comfy-stable-audio': [5, 10, 20, 30, 47], 'api-eleven-sfx': ELEVEN_SFX_DURATIONS, 'api-seed-audio': [] /* no length field: the model decides, up to 2 min */,
};
export const AUDIO_LENGTH_UP_TO = ['comfy-yue2', 'comfy-minimax-music3', 'cloud-minimax-music'];
/* the price quote and the submit check the same per-model lengths (videoCaps resolveDuration; quote = submit). ElevenLabs SFX v2 keeps its old rule:
 * any length is taken and sent clamped to 30 s (audio-quote.test 1c), so it is left out here. */
const AUDIO_LENGTHS_CHECKED = Object.fromEntries(Object.entries(AUDIO_LENGTHS).filter(([p, v]) => p !== 'api-eleven-sfx' && v.length));
registerToolProviderDurations('audio', AUDIO_LENGTHS_CHECKED);
export const audioTool = makeMediaTool({
  id: 'audio', route: AUDIO_PAGE /* the Audio page (2026-10-31): /audio; the tool id stays audio */, name: 'Audio', category: 'Audio', input: 'none', outKind: 'audio',
  description: 'Music, sound effects or a voice from a prompt, or a cover of a song. Free on your computer, or in the cloud.',
  modes: [m('music', 'Music', '', 'music'), m('sfx', 'Sound effects', '', 'sfx'), m('voice', 'Voice', '', 'voice'), m('cover', 'Cover a song', '', 'music')],
  providers: uniq([...MUSIC, ...SFX, ...VOICE, ...COVER]),
  providerModes: Object.fromEntries(uniq([...MUSIC, ...SFX, ...VOICE, ...COVER]).map((p) => [p, [MUSIC.includes(p) && 'music', SFX.includes(p) && 'sfx', VOICE.includes(p) && 'voice', COVER.includes(p) && 'cover'].filter(Boolean) as string[]])),
  durations: [...new Set([...AUDIO_DURATIONS, ...Object.values(AUDIO_LENGTHS).flat()])].sort((a, b) => a - b), defaultDuration: 10, resolutions: ['standard', 'high'], rates: { standard: 1, high: 2 },
  workflows: ['audio-music-api.json', 'audio-sfx-api.json', 'voice-chatterbox-tts-api.json', 'voice-drama3-tts-api.json', QWEN3_TTS_WORKFLOW, 'audio-yue2-song-api.json', 'audio-yue2-cover-api.json', 'audio-minimax-music3-local-api.json'], model: 'YuE2 · MiniMax Music 3 · ACE-Step 1.5 · Stable Audio Open · Chatterbox / F5-TTS · hosted audio nodes',
  stages: [['encoding', 'Encoding prompt'], ['generating', 'Generating audio'], ['saving', 'Saving']],
});
const V2S = ['api-sonilo-v2m', 'comfy-mmaudio'];
export const soundtrackTool = makeMediaTool({
  id: 'soundtrack', name: 'Add soundtrack', category: 'Audio', input: 'video', outKind: 'soundtrack',
  description: 'Generate music or video-matched sound for a clip and mux it onto the video.',
  modes: [m('music', 'Music', '', 'music'), m('v2s', 'Video to sound', 'sound matching the on-screen action', 'sfx'), m('sfx', 'Sound effects (prompt)', '', 'sfx')], promptOptionalModes: ['v2s'],
  providers: uniq([...MUSIC, ...V2S, ...SFX]),
  providerModes: Object.fromEntries(uniq([...MUSIC, ...V2S, ...SFX]).map((p) => [p, [MUSIC.includes(p) && 'music', V2S.includes(p) && 'v2s', SFX.includes(p) && 'sfx'].filter(Boolean) as string[]])),
  fields: [{ name: 'mix', label: 'Original audio', kind: 'select', options: [{ value: 'replace', label: 'Replace' }, { value: 'blend', label: 'Blend under new track' }], default: 'replace' }],
  resolutions: ['720p', '1080p', '480p'], rates: { '480p': 2, '720p': 3, '1080p': 4 },
  workflows: ['soundtrack-music-api.json', 'soundtrack-sfx-api.json', 'soundtrack-mmaudio-api.json', 'audio-yue2-song-api.json', 'audio-minimax-music3-local-api.json'], model: 'YuE2 · MiniMax Music 3 · ACE-Step 1.5 · MMAudio · Stable Audio Open · hosted (mux via ffmpeg)',
  stages: [['uploading', 'Uploading'], ['generating', 'Generating audio'], ['muxing', 'Muxing onto video']],
});

// ---- Voice Studio (Audio): voiceover / change voice / translate over a video (per spec) ----
registerLicense({ id: 'whisper', name: 'MIT (OpenAI Whisper code + weights)', osi: true, url: 'https://github.com/openai/whisper/blob/main/LICENSE' });
registerLicense({ id: 'faster-whisper', name: 'MIT (faster-whisper + CTranslate2; Whisper weights MIT)', osi: true, url: 'https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE' });
registerLicense({ id: 'nllb-nc', name: 'CC BY-NC 4.0 (NLLB-200 weights)', osi: false, url: 'https://huggingface.co/facebook/nllb-200-distilled-600M' });
registerLicense({ id: 'seamless-nc', name: 'CC BY-NC 4.0 (SeamlessM4T v2)', osi: false, url: 'https://huggingface.co/facebook/seamless-m4t-v2-large' });
registerLicense({ id: 'openvoice', name: 'MIT (OpenVoice V2 code + weights)', osi: true, url: 'https://github.com/myshell-ai/OpenVoice/blob/main/LICENSE' });
registerLicense({ id: 'rvc', name: 'MIT (RVC WebUI code; voice models are user-supplied)', osi: true, url: 'https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/main/LICENSE' });
registerWorkflowLicense('create-image-qwen-edit2509-inpaint-api.json', ['apache-2.0']);
registerWorkflowLicense('voice-chatterbox-tts-api.json', ['chatterbox']); registerWorkflowLicense('voice-chatterbox-vc-api.json', ['chatterbox']);
registerWorkflowLicense('voice-chatterbox-ml-api.json', ['chatterbox']); registerWorkflowLicense('voice-f5tts-api.json', ['f5-tts-weights']);
registerWorkflowLicense('soundtrack-mmaudio-api.json', ['mmaudio-weights']); registerWorkflowLicense(QWEN3_TTS_WORKFLOW, ['apache-2.0']);
const vlocal = (id: string, name: string, via: string, docUrl: string, licenseParts: string[], nodes: string[] = [], workflows: string[] = []) =>
  registerProvider({ id, name, kind: 'open-weights', via: workflows.length ? `${via}, workflows/${workflows.join(' + ')} (mock unless OPENHIGGSFIELD_BACKEND=comfy)` : `${via} (mock only: node pack not installed on the validator)`, docUrl, licenseParts, nodes, workflows });
vlocal('comfy-chatterbox-vc', 'Chatterbox VC (voice conversion)', 'wildminder/ComfyUI-Chatterbox (Apache-2.0) ChatterboxVC node', 'https://huggingface.co/ResembleAI/chatterbox', ['chatterbox'], ['ChatterboxVC'], ['voice-chatterbox-vc-api.json']);
vlocal('local-whisper-nllb-chatterbox', 'Whisper → NLLB-200 → Chatterbox (translate)', 'faster-whisper transcribe + NLLB-200 distilled 600M translate (server/py/voice_runner.py, CPU; or OPENHIGGSFIELD_TRANSLATE_URL LibreTranslate) + Chatterbox multilingual TTS (wildminder/ComfyUI-Chatterbox) + ffmpeg mux', 'https://github.com/SYSTRAN/faster-whisper', ['faster-whisper', 'nllb-nc', 'chatterbox'], ['ChatterboxMTLTTS'], ['voice-chatterbox-ml-api.json']);
vlocal('local-whisper-nllb-f5', 'Whisper → NLLB-200 → F5-TTS (translate)', 'faster-whisper + NLLB-200 distilled 600M (server/py/voice_runner.py, CPU; or LibreTranslate) + F5-TTS (en/zh/de/es/fr/hi/it/ja models) + ffmpeg mux', 'https://github.com/SYSTRAN/faster-whisper', ['faster-whisper', 'nllb-nc', 'f5-tts-weights'], ['F5TTSAudioInputs'], ['voice-f5tts-api.json']);
// Keep the background (2026-11-01, comfy/separation.ts): not a model you pick. Translate a video and Change Voice use it when it's installed; registered so its
// file comes through the normal download flow (POST /api/local/downloads {downloadId: 'comfy-melband-separation'}) and shows its licence.
registerWorkflowLicense(SEPARATION_WORKFLOW, ['melband-roformer']);
vlocal(SEPARATION_PROVIDER, 'MelBand RoFormer (voice and background separation)', 'official Comfy template audio_melbandroformer_audio_separation on kijai/ComfyUI-MelBandRoFormer', 'https://huggingface.co/KimberleyJSN/melbandroformer', ['melband-roformer'], SEPARATION_NODES, [SEPARATION_WORKFLOW]);
const VO = ['api-eleven-tts', 'api-eleven-v3', 'api-eleven-v4-turbo' /* MiniMax Speech isn't listed here: it has no voiceover mux on Voice Studio and runs on Audio (2026-11-02) */, 'api-fish-tts', 'api-heygen-tts', 'api-seed-audio', 'comfy-chatterbox', QWEN3_TTS, 'comfy-drama3', 'comfy-f5tts']; // B6 quality order
// Removed (not feasible on this CPU stack, 2026-10-16): OpenVoice V2 (requirements pin numpy==1.22 / librosa 0.9 / gradio 3, no wheels for
// Python 3.13; no maintained ComfyUI pack found), RVC (needs fairseq, which does not build on Python ≥3.11; no maintained ComfyUI pack found),
// SeamlessM4T v2 (no ComfyUI pack; 2.3B params ≈9 GB fp32, over the CPU smoke budget; CC BY-NC). Translate = faster-whisper + NLLB-200 + TTS instead.
const VC = ['comfy-chatterbox-vc'];
const TR = ['local-whisper-nllb-chatterbox', 'local-whisper-nllb-f5'];
const LS = ['comfy-h3-lipsync', 'comfy-ltx25-lipsync' /* LTX-2.5 Talking Photo: free local, photo optional (2026-10-26) */, 'cloud-infinitetalk' /* InfiniteTalk (Wan 2.1) · Comfy Cloud: up to 60 s (2026-10-27) */]; // Talking photo (H3 addition 2): portrait + speech → lipsync video
export const voiceStudioTool = makeMediaTool({
  id: 'voice', name: 'Voice Studio', category: 'Audio', input: 'video', outKind: 'soundtrack',
  description: 'Voiceover a clip from a script, change the voice while keeping the timing, or translate the speech into another language.',
  modes: [m('voiceover', 'Voiceover', '', 'voice'), m('change-voice', 'Change voice', 'keep the original timing and delivery', 'voice'), m('translate', 'Translate', 'keep timing close to the original', 'voice'), m('lipsync', 'Talking photo', '')],
  promptOptionalModes: ['change-voice', 'translate', 'lipsync'], videoOptionalModes: ['voiceover', 'lipsync'], maxN: 4, audioInputModes: ['change-voice'],
  providers: uniq([...VO, ...VC, ...TR, ...LS]),
  providerModes: Object.fromEntries(uniq([...VO, ...VC, ...TR, ...LS]).map((p) => [p, [VO.includes(p) && 'voiceover', VC.includes(p) && 'change-voice', TR.includes(p) && 'translate', LS.includes(p) && 'lipsync'].filter(Boolean) as string[]])),
  fields: [
    { name: 'voice', label: 'Voice', kind: 'select', options: VOICE_LIBRARY.map((v) => ({ value: v.id, label: v.label })), default: VOICE_LIBRARY[0].id },
    { name: 'language', label: 'Target language', kind: 'select', options: VOICE_LANGUAGES.map((l) => ({ value: l.code, label: l.label })), default: 'en' },
    { name: 'mix', label: 'Original audio', kind: 'select', options: [{ value: 'replace', label: 'Replace' }, { value: 'blend', label: 'Duck under new voice' }], default: 'replace' },
  ],
  resolutions: ['720p', '1080p', '480p'], rates: { '480p': 1, '720p': 1, '1080p': 1 },
  workflows: ['cloud/wan21-infinitetalk-api.json', 'voice-chatterbox-tts-api.json', 'voice-f5tts-api.json', 'voice-chatterbox-vc-api.json', 'voice-chatterbox-ml-api.json', 'voice-drama3-tts-api.json', 'voice-drama3-clone-api.json', QWEN3_TTS_WORKFLOW, 'h3-lipsync-api.json', 'ltx25-a2v-api.json'], model: 'Chatterbox / F5-TTS (voiceover) · Chatterbox VC (change voice) · faster-whisper + NLLB-200 + TTS (translate)',
  stages: [['uploading', 'Uploading'], ['transcribing', 'Transcribing'], ['generating', 'Generating voice'], ['muxing', 'Muxing onto video']],
});

// ---- Image upscale (×2/×4/×8; which factor each model does, the workflow per factor and the 8192 px cap: shared/imageUpscale.ts). Core-node graphs from scripts/build-image-upscale.py. ----
// 2026-10-22: Sharpen / Denoise / Face enhance are gone: the fixed graphs never read them (a real run ignored them). Old clients may still send
// them; they are ignored. `scale` (2|4|8, alias of types=["x<scale>"]) is accepted on quote and submit.
registerLicense({ id: 'bsd-3-clause', name: 'BSD-3-Clause', osi: true, url: 'https://opensource.org/license/bsd-3-clause' });
registerLicense({ id: 'ultrasharp-nc', name: 'CC BY-NC-SA 4.0 (4x-UltraSharp)', osi: false, url: 'https://huggingface.co/Kim2091/UltraSharp' });
for (const f of ['image-upscale-x2-api.json', 'image-upscale-x4-api.json', 'image-upscale-x8-api.json']) registerWorkflowLicense(f, ['bsd-3-clause']);
registerWorkflowLicense('image-upscale-ultrasharp-x4-api.json', ['ultrasharp-nc']);
registerProvider({ id: 'comfy-realesrgan', name: 'Real-ESRGAN x2plus / x4plus (BSD-3-Clause)', kind: 'open-weights', via: 'local ComfyUI core UpscaleModelLoader, workflows/image-upscale-x{2,4,8}-api.json (mock unless OPENHIGGSFIELD_BACKEND=comfy)',
  workflows: ['image-upscale-x2-api.json', 'image-upscale-x4-api.json', 'image-upscale-x8-api.json'], docUrl: 'https://github.com/xinntao/Real-ESRGAN' });
registerProvider({ id: 'comfy-ultrasharp', name: '4x-UltraSharp', kind: 'open-weights', via: 'local ComfyUI core UpscaleModelLoader, workflows/image-upscale-ultrasharp-x4-api.json',
  workflows: ['image-upscale-ultrasharp-x4-api.json'], docUrl: 'https://huggingface.co/Kim2091/UltraSharp' });
const upscaleBase = makeMediaTool({
  id: 'image-upscale', name: 'Upscale', category: 'Image', input: 'image-optional', outKind: 'image',
  description: 'Make an image 2x, 4x or 8x larger and sharper (SeedVR2, Crystal, Topaz, Z-Image-Turbo 2K, 4x Nomos2, Real-ESRGAN or 4x-UltraSharp).',
  modes: [m('x2', '2x', ''), m('x4', '4x', ''), m('x8', '8x', '')], imageModes: ['x2', 'x4', 'x8'], promptOptionalModes: ['x2', 'x4', 'x8'],
  providers: [...UPSCALE_ORDER], /* best first per place: Comfy Router → other API (fal) → Local, classics last (shared/imageUpscale.ts) */ providerModes: Object.fromEntries(Object.entries(UPSCALE_FACTORS_BY_PROVIDER).map(([p, xs]) => [p, xs.map((x) => `x${x}`)])),
  resolutions: ['source'], rates: { source: 2 },
  workflows: [...new Set(Object.values(UPSCALE_WORKFLOWS).flatMap((w) => Object.values(w)))],
  model: 'SeedVR2 · Crystal · Topaz Wonder 3.5 / Standard V2 · Z-Image-Turbo 2K · 4x Nomos2 · Real-ESRGAN · 4x-UltraSharp',
  stages: [['uploading', 'Uploading'], ['upscaling', 'Upscaling'], ['saving', 'Saving']],
});
const MAX_SIDE = UPSCALE_MAX_SIDE;
export const imageUpscaleTool: ToolDef = {
  ...upscaleBase,
  inputs: [...upscaleBase.inputs.map((i: any) => (i.name === 'types' ? { ...i, required: false } : i)), { name: 'scale', kind: 'select', options: ['2', '4', '8'], default: '2' } as any],
  app: { ...(upscaleBase as any).app, prompt: false, imageUpscale: imageUpscaleInfo() },
  async parseInput(fields, files) {
    const named = upscaleScaleOf({ scale: fields.scale }); // scale=4 → types=["x4"] (same job as before); both sent and different → 400
    if (named != null) {
      const t = upscaleScaleOf({ types: fields.types });
      if (!Number.isFinite(named) || ![2, 4, 8].includes(named)) return { error: 'Scale must be 2, 4 or 8.', code: 'invalid_scale', issues: [{ code: 'invalid_scale', field: 'scale', message: 'Scale must be 2, 4 or 8.' }] } as any;
      if (t != null && t !== named) return { error: `scale=${named} and types=x${t} disagree. Send one.`, code: 'invalid_scale', issues: [{ code: 'invalid_scale', field: 'scale', message: 'scale and types disagree. Send one.' }] } as any;
      fields = { ...fields, types: JSON.stringify([`x${named}`]) };
    }
    const r = await upscaleBase.parseInput(fields, files);
    if ('error' in r) return r;
    const scale = Number(String(r.mode).slice(1)); const p = await probe(r.imagePath);
    const out = p ? upscaleOutSize(p.width, p.height, scale) : null;
    const provider = fields.provider || upscaleBase.providers.find((x) => UPSCALE_FACTORS_BY_PROVIDER[x]?.includes(scale)) || upscaleBase.providers[0];
    const block = upscaleBlock(provider, scale, p ? { width: p.width, height: p.height } : null);
    if (block?.code === 'output_too_large') return { error: block.message, code: block.code, issues: [{ code: block.code, field: 'scale', message: block.message }] } as any; // 8192 px cap on every backend (was mock only)
    return { ...r, scale, sourceSize: p ? { width: p.width, height: p.height } : null, outputSize: out, workflow: UPSCALE_LOCAL.includes(provider) ? imageUpscaleWorkflowOrDefault(provider, scale) : null /* hosted: no local graph */, warnings: [...(r.warnings ?? [])] };
  },
  async run(job) {
    // Sample render = a plain resize of your image (no fake sharpen / denoise), made while the mock run counts down, then swapped in.
    const o = job.input.outputSize as { width: number; height: number } | null; let pre: Promise<string | null> = Promise.resolve(null);
    if (o) { const k = Math.min(1, MAX_SIDE / Math.max(o.width, o.height)); const w = Math.round(o.width * k / 2) * 2, h = Math.round(o.height * k / 2) * 2;
      const tmp = path.join(DATA_DIR, `${job.id}-upscale.tmp.png`);
      pre = new Promise((res) => { const c = spawn('ffmpeg', ['-y', '-v', 'error', '-i', job.input.imagePath, '-vf', `scale=${w}:${h}:flags=lanczos`, tmp]); c.on('close', (x) => res(x === 0 ? tmp : null)); c.on('error', () => res(null)); }); }
    await mockRun(job, upscaleBase.stages, [`${job.input.mode} upscale`], 4000);
    const tmp = await pre; if (!tmp) return;
    if (job.status !== 'done' || !job.outputs[0]) { await rm(tmp, { force: true }); return; }
    await rename(tmp, path.join(DATA_DIR, job.outputs[0].url.slice('/files/'.length))); (await import('../outputMeta.js')).forgetOutputMeta(job.outputs[0].url); // re-probe: the file now has the upscaled size
  },
};

/** Draft = 480p at 0.3× price (same as the swap tools), so finished drafts get the 'upscale' action. */
export const DRAFT_SETTING = { quality: '480p', factor: 0.3 };
(h3VideoTool as any).draft = DRAFT_SETTING;

// ---- Fish Audio Drama 3: inline control tags as data for the tag chips (shown when provider is in metaTagProviders) ----
// Prompt grammar step 2 (2026-10-26): ElevenLabs v3 [tags] and MiniMax (sounds) / <#pauses#> too, per provider (tools/voiceTags.ts). metaTags /
// metaTagProviders stay for older clients (Drama 3 only).
for (const t of [audioTool, voiceStudioTool]) Object.assign((t as any).app, { metaTags: DRAMA3_META_TAGS, metaTagProviders: ['comfy-drama3'], metaTagsByProvider: META_TAGS_BY_PROVIDER, metaTagStyles: META_TAG_STYLES });

// ---- Voice Studio controls (DESIGN-NOTES "Voice / Audio"): voiceDetails, expression, mood, speed, pitch, volume, outputFormat, sampleRate, voiceAudio ×3 ----
{
  const t = voiceStudioTool as any; const baseParse = t.parseInput.bind(t); // run: pre/post hooks in providers.ts runWithProvider (all backends)
  t.inputs = t.inputs.filter((i: any) => i.name !== 'voiceAudio').concat([
    { name: 'voiceAudio', kind: 'file', accept: 'audio/*', multiple: true, maxFiles: 3 },
    { name: 'audio', kind: 'file', accept: 'audio/*', modes: ['change-voice'], help: 'Change voice on an audio file (instead of a video): returns an audio file in outputFormat (MP3 by default), same length.' },
    { name: 'voiceDetails', kind: 'text', maxLength: 500, help: 'A free-text voice description or style instruction, for models that take one (Qwen3 TTS: "Style", its instruct).' },
    // A model's own preset voices and spoken language (2026-10-27, Qwen3 TTS): app.voiceCaps[provider].voices / .languages say which model takes them
    { name: 'speaker', kind: 'select', options: QWEN3_TTS_SPEAKERS.map((v) => v.id), help: `The model's own voice (models with voiceCaps.voices; Qwen3 TTS: 9 preset voices, ${QWEN3_TTS_DEFAULT_SPEAKER} when empty). Other models use \`voice\`; leave it empty for them.` },
    { name: 'speechLanguage', kind: 'select', options: QWEN3_TTS_LANGUAGES.map((l) => l.value), help: 'The language the script is spoken in (models with voiceCaps.languages; empty or auto = read from the script). Leave it empty for other models.' },
    { name: 'expression', kind: 'number', min: 0, max: 10, default: 5 }, { name: 'mood', kind: 'number', min: -1, max: 1, default: 0 },
    { name: 'speed', kind: 'number', min: 0.5, max: 2, default: 1 }, { name: 'pitch', kind: 'number', min: -12, max: 12, default: 0 }, { name: 'volume', kind: 'number', min: 0, max: 200, default: 100 },
    { name: 'outputFormat', kind: 'select', options: ['mp3', 'wav', 'opus'], default: 'mp3' }, { name: 'sampleRate', kind: 'select', options: VOICE_LIMITS.sampleRate.options.map(String), default: '24000' },
  ]);
  Object.assign(t.app, { videoOptionalModes: ['voiceover', 'lipsync'], voiceControls: VOICE_LIMITS, voiceCaps: VOICE_CAPS, voiceControlModes: ['voiceover', 'change-voice', 'translate', 'lipsync'], languagesByProvider: TRANSLATE_LANGS, // Oct 18 #6: target languages per translate route
    languages: VOICE_LANGUAGES.map((l) => { const providers = Object.keys(TRANSLATE_LANGS).filter((p) => TRANSLATE_LANGS[p].includes(l.code)); return { ...l, providers, available: providers.length > 0 }; }) });
  { const li: any = t.inputs.find((i: any) => i.name === 'language'); if (li) li.byProvider = TRANSLATE_LANGS; }
  t.parseInput = async (fields: Record<string, string>, files: Record<string, string[]>) => {
    const r = await baseParse(fields, files); if ('error' in r) return r;
    const samples = files.voiceAudio ?? [];
    const v = parseVoiceControls(fields, fields.provider || '' /* Auto: route picked later; checked again for job.provider in run() */, samples.length, fields.prompt);
    if (!v.ok) return { error: v.issues[0].message, issues: v.issues } as any;
    return { ...r, voice: r.voice, voiceControls: v.controls, voiceNative: v.native, voicePost: v.post, voiceFields: voiceFieldsOf(fields), voiceSamplePaths: samples.map((s) => path.join(DATA_DIR, s)), voiceSampleUrls: samples.map((s) => `/files/${s}`) };
  };
}

// Audio tool, Voice mode: same engines (Chatterbox / Drama 3 / F5 + hosted TTS) → same controls, caps and validation.
{
  const a = audioTool as any; const baseParse = a.parseInput.bind(a);
  a.inputs = a.inputs.concat((voiceStudioTool as any).inputs.filter((i: any) => ['voiceAudio', 'voiceDetails', 'expression', 'mood', 'speed', 'pitch', 'volume', 'outputFormat', 'sampleRate', 'speaker', 'speechLanguage'].includes(i.name)));
  Object.assign(a.app, { voiceControls: VOICE_LIMITS, voiceCaps: VOICE_CAPS, voiceControlModes: ['voice'],
    durationsByProvider: Object.fromEntries(a.providers.map((p: string) => [p, AUDIO_LENGTHS[p] ?? AUDIO_DURATIONS])) /* each model's own lengths (AUDIO_LENGTHS); ElevenLabs SFX v2 on Comfy Router: 0.5–30 s (the body clamps to 30, the quote counts min(length, 30)); Seed Audio takes no length (no Length control); voice models take none (the list is unused there) */,
    lengthUpTo: AUDIO_LENGTH_UP_TO });
  a.parseInput = async (fields: Record<string, string>, files: Record<string, string[]>) => {
    /* each music / sound model's own lengths, the same rule as the price quote (quote = submit) */
    let snap: string | null = null; // D5: an off-list length runs at the nearest one this model makes, with a note
    if (AUDIO_LENGTHS_CHECKED[fields.provider ?? '']) { const rd = resolveDuration('audio', fields.provider, fields.duration); if (rd && 'error' in rd) return { ...durationErrorBody(rd) } as any;
      if (rd?.snapped) { fields = { ...fields, duration: String(rd.seconds) }; snap = rd.snapped.note; } }
    const r = await baseParse(fields, files); if (!('error' in r) && snap) addAdjustNote(r as any, snap); if ('error' in r || r.mode !== 'voice') return r;
    const samples = files.voiceAudio ?? []; const v = parseVoiceControls(fields, fields.provider || '', samples.length, fields.prompt);
    if (!v.ok) return { error: v.issues[0].message, issues: v.issues } as any;
    return { ...r, voiceControls: v.controls, voiceNative: v.native, voicePost: v.post, voiceFields: voiceFieldsOf(fields),
      voiceSamplePaths: samples.map((s) => path.join(DATA_DIR, s)), voiceSampleUrls: samples.map((s) => `/files/${s}`), ...(samples[0] ? { voiceSamplePath: path.join(DATA_DIR, samples[0]) } : {}) };
  };
}

// Lyrics and Cover a song use one job field, `lyrics` (ACE-Step's graph, YuE2,
// local MiniMax Music 3 and the hosted MiniMax Music 3 node). `text` is still taken as an alias in the music modes (old clients). Cover = a song
// file in (field `audio`), its melody kept (SheetSage2 → YuE2), new style (prompt) and lyrics.
export { LYRICS_MAX }; /* one number with the web's boxes: shared/audioWorkflows.ts */
/** Models that can't make a song without lyrics (YuE2 is lyrics-driven); the others fall back to an instrumental. */
export const LYRICS_REQUIRED = ['comfy-yue2'];
const lyricsOf = (fields: Record<string, string>, mode: string) => { const v = fields.lyrics ?? (mode === 'music' || mode === 'cover' ? fields.text : undefined); const t = String(v ?? '').replace(/\r\n?/g, '\n').slice(0, LYRICS_MAX); return t.trim() ? t : undefined; }; // form posts send CRLF line breaks
const lyricsInput = { name: 'lyrics', kind: 'text', maxLength: LYRICS_MAX, modes: ['music', 'cover'], help: 'Song lyrics with section tags ([Verse], [Chorus], [Bridge]…). Read by every music model that sings; empty = instrumental where the model allows it.' };
{
  const a = audioTool as any; const baseParse = a.parseInput.bind(a);
  a.inputs = a.inputs.concat([lyricsInput, { name: 'audio', kind: 'file', accept: 'audio/*', modes: ['cover'], help: 'Cover a song: the song to cover (MP3, WAV, FLAC, M4A, OGG). Its melody is kept.' }]);
  Object.assign(a.app, { lyricsModes: ['music', 'cover'], lyricsRequired: LYRICS_REQUIRED, audioInputModes: ['cover'] });
  a.parseInput = async (fields: Record<string, string>, files: Record<string, string[]>) => {
    const r = await baseParse(fields, files); if ('error' in r || (r.mode !== 'music' && r.mode !== 'cover')) return r;
    const lyrics = lyricsOf(fields, r.mode); const provider = fields.provider || (r.mode === 'cover' ? COVER[0] : '');
    if (!lyrics && (r.mode === 'cover' || LYRICS_REQUIRED.includes(provider))) return { error: 'Add the lyrics to sing.', code: 'required', issues: [{ code: 'required', field: 'lyrics', message: 'Add the lyrics to sing.' }] } as any;
    if (r.mode !== 'cover') return { ...r, ...(lyrics ? { lyrics } : {}) };
    const f = files.audio?.[0];
    if (!f) return { error: 'Add the song to cover (MP3, WAV, FLAC, M4A or OGG).', code: 'required', issues: [{ code: 'required', field: 'audio', message: 'Add the song to cover.' }] } as any;
    const secs = await (await import('../ffmpeg.js')).mediaDuration(path.join(DATA_DIR, f)).catch(() => 0);
    if (!(secs > 0)) return { error: 'That audio file could not be read. Use MP3, WAV, FLAC, M4A or OGG.', code: 'format', issues: [{ code: 'format', field: 'audio', message: 'That audio file could not be read.' }] } as any;
    const d = Math.round(secs * 100) / 100;
    return { ...r, lyrics, audioInput: true, sourceAudioPath: path.join(DATA_DIR, f), sourceAudioUrl: `/files/${f}`, duration: d, outputDuration: d };
  };
}
{
  const s = soundtrackTool as any; const baseParse = s.parseInput.bind(s);
  s.inputs = s.inputs.concat([{ ...lyricsInput, modes: ['music'] }]); Object.assign(s.app, { lyricsModes: ['music'], lyricsRequired: LYRICS_REQUIRED });
  s.parseInput = async (fields: Record<string, string>, files: Record<string, string[]>) => {
    const r = await baseParse(fields, files); if ('error' in r || r.mode !== 'music') return r;
    const lyrics = lyricsOf(fields, 'music');
    if (!lyrics && LYRICS_REQUIRED.includes(fields.provider || '')) return { error: 'Add the lyrics to sing.', code: 'required', issues: [{ code: 'required', field: 'lyrics', message: 'Add the lyrics to sing.' }] } as any;
    return lyrics ? { ...r, lyrics } : r;
  };
}
