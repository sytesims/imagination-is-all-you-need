import path from 'node:path';
import type { ToolDef } from '../tools/types.js';
import type { Job } from '../jobs.js';
import { DATA_DIR } from '../config.js';
import { probe } from '../media.js';
import { CINEMA_LOCAL_DURATIONS, durationsFor, resolveDuration, defaultDurationFor, durationErrorBody } from '../tools/h3/videoCaps.js';
import { validateMentions } from '../shared/mentions.js';
import { resolveElements } from '../elements/resolve.js';
import { listElements } from '../library.js';
import { mockRun, mockFailOf, seedOf } from '../tools/shared.js';
import { LOOK_OPTIONS, LOOK_FIELDS, parseLook } from './look.js';
import { CAMERA_MOVES, EMOTIONS, INTENSITIES, parseTimeline, timelinePhrase, emotionPhrase, emotionStrength, autoPanels } from './timeline.js';

/**
 * Director (id `cinema`): @asset mentions + #timed camera moves → camera timeline, 4 Auto panels, emotion wheel.
 * Default backend LTX-2 (camera LoRAs, workflows/camera-ltx-api.json); Wan Fun Camera fallback. Mock renders a clip with audio per panel.
 */
const CINEMA_PROVIDERS = ['router-seedance', 'router-veo', 'router-kling', 'comfy-open', 'comfy-funcamera']; // Cloud-first quality order; the default is the first runnable choice (routing/defaults.ts).
const CINEMA_ALL_DURATIONS = [...new Set(CINEMA_PROVIDERS.flatMap((p) => durationsFor('cinema', p) ?? []))].sort((a, b) => a - b);
const RES = ['720p', '1080p', '480p'];
const truthy = (v?: string) => /^(1|true|on|yes)$/i.test(v || '');
const STAGES: [string, string][] = [['uploading', 'Uploading'], ['planning', 'Planning shots'], ['camera', 'Building camera timeline'], ['rendering', 'Rendering frames'], ['muxing', 'Muxing audio']];

/** Per-backend Director capabilities: output aspects and whether the model makes its own audio track.
 *  verified=false where we haven't checked the provider's official docs for this exact call; the UI shows the flag, the server enforces the sets. */
export const CINEMA_CAPS: Record<string, { aspects: string[]; audio: boolean; verified: boolean; source: string; note: string }> = {
  'comfy-open': { aspects: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], audio: true, verified: true, source: 'https://huggingface.co/Lightricks/LTX-2',
    note: 'LTX-2 model card: joint audio+video in one model; width/height divisible by 32 (64 for two-stage), so any aspect works. Checked 2026-10-16.' },
  'comfy-funcamera': { aspects: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], audio: false, verified: true, source: 'https://docs.comfy.org/built-in-nodes/WanCameraImageToVideo',
    note: 'WanCameraEmbedding / WanCameraImageToVideo take free width/height (step 16), so any aspect; video only, no audio output. Checked 2026-10-16.' },
  'router-seedance': { aspects: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'], audio: true, verified: true, source: 'https://docs.comfy.org/built-in-nodes/ByteDance2ReferenceNode',
    note: 'Seedance 2.x nodes: ratio 16:9/4:3/1:1/3:4/9:16/21:9 (+adaptive), generate_audio (default true). Token-billed, same price with or without audio. Checked 2026-10-16.' },
  'router-veo': { aspects: ['16:9', '9:16'], audio: true, verified: true, source: 'https://docs.comfy.org/built-in-nodes/Veo3VideoGenerationNode',
    note: 'Veo3VideoGenerationNode: aspect_ratio 16:9/9:16, generate_audio (default false). Audio billed at the with-audio rate (84.4 vs 42.2 Comfy credits/s). Checked 2026-10-16.' },
  'router-kling': { aspects: ['16:9', '9:16', '1:1'], audio: true, verified: true, source: 'https://docs.comfy.org/built-in-nodes/KlingVideoNode',
    note: 'KlingVideoNode (Kling V3): aspect_ratio 16:9/9:16/1:1, generate_audio. Audio billed at the with-audio rate (23.63 / 29.54 Comfy credits/s). Checked 2026-10-16.' },
};
/** Default audio per provider when the request doesn't say: on where the model's own default is on and it costs nothing extra. */
const AUDIO_DEFAULT: Record<string, boolean> = { 'comfy-open': true, 'router-seedance': true, 'router-veo': false, 'router-kling': false, 'comfy-funcamera': false };
export const CINEMA_MAX_COUNT = 4;
/** Reference images per route (up to 50). Hosted limits follow the verified video caps (tools/h3/videoCaps.ts); local LTX-2 / Fun Camera keep our 8.
 *  No route here is verified for 50, so 50 is never accepted. */
export const CINEMA_MAX_REFS: Record<string, number> = { 'comfy-open': 8, 'comfy-funcamera': 8, 'router-seedance': 9, 'router-veo': 1, 'router-kling': 1 };
export const CINEMA_MAX_REFS_ANY = Math.max(...Object.values(CINEMA_MAX_REFS));
/** Director modes. extend/edit need `video` (≤30 s) and a model that takes a video input. */
export const CINEMA_MODES = ['generate', 'extend', 'edit', 'image'] as const;
export const CINEMA_MODE_PROVIDERS: Record<string, string[]> = { generate: ['comfy-open', 'comfy-funcamera', 'router-seedance', 'router-veo', 'router-kling'], extend: ['comfy-open', 'router-seedance'], edit: ['comfy-open', 'router-seedance'], image: ['comfy-open'] }; // image: one still from the same direction (local, 0 credits); no hosted still route is priced here
const CINEMA_MAX_SOURCE_SEC = 30;
const ALL_ASPECTS = [...new Set(Object.values(CINEMA_CAPS).flatMap((c) => c.aspects))];
/** Page 14 image mode: its own stage list (shown instead of the video stages). */
const IMAGE_STAGES: [string, string][] = [['uploading', 'Uploading'], ['planning', 'Planning the frame'], ['rendering', 'Rendering the still'], ['finishing', 'Finishing']];
/** Page 14 panel layout, defined on the server so web and API agree: section id, label, the inputs in it, and the modes it shows in. */
const CINEMA_SECTIONS = [
  { id: 'assets', label: 'Cast & assets', fields: ['refs'], modes: ['generate', 'extend', 'edit', 'image'] },
  { id: 'source', label: 'Source clip', fields: ['video'], modes: ['extend', 'edit'] },
  { id: 'scene', label: 'Scene', fields: ['prompt', 'auto'], modes: ['generate', 'extend', 'edit', 'image'] },
  { id: 'look', label: 'Film look', fields: [...LOOK_FIELDS], modes: ['generate', 'extend', 'edit', 'image'] },
  { id: 'performance', label: 'Performance', fields: ['emotion', 'intensity'], modes: ['generate', 'extend', 'edit', 'image'] },
  { id: 'output', label: 'Output', fields: ['duration', 'resolution', 'aspect', 'audio', 'count', 'seed'], modes: ['generate', 'extend', 'edit'] },
  { id: 'output-image', label: 'Output', fields: ['resolution', 'aspect', 'seed'], modes: ['image'] },
];
export const cinemaTool: ToolDef = {
  // Removed from the app (user, 2026-10-23): no page, menu, tile or search entry; /tools/cinema redirects to the Video page.
  // Kept for compatibility: the API (POST /api/tools/cinema/jobs, /api/cinema/*, /api/stories), MCP (create_story, …), old jobs and Orbit Shot (its base) still run on it.
  id: 'cinema', name: 'Director', category: 'Video', status: 'new', route: '/tools/cinema', ui: 'cinema', listed: false,
  description: 'Direct a shot: tag your assets with @image1…, add timed camera moves like "#dolly-in 0-2s #orbit 2-5s", set an emotion, or let 4 Auto panels pick shots for you.',
  inputs: [
    { name: 'refs', kind: 'files', accept: 'image/png,image/jpeg,image/webp', max: CINEMA_MAX_REFS_ANY }, // per route: app.capabilities.maxRefsByProvider
    { name: 'mode', kind: 'select', options: [...CINEMA_MODES], default: 'generate' },
    { name: 'video', kind: 'file', accept: 'video/mp4,video/quicktime,video/webm' }, // mode extend | edit
    ...LOOK_FIELDS.map((k) => ({ name: k, kind: 'select' as const, options: ['auto', ...LOOK_OPTIONS[k].map((x) => x.id)], default: 'auto' })),
    { name: 'prompt', kind: 'text', required: false },
    { name: 'auto', kind: 'select', options: ['0', '1'], default: '0' },
    { name: 'emotion', kind: 'select', options: [...EMOTIONS], default: 'neutral' },
    { name: 'intensity', kind: 'select', options: [...INTENSITIES], default: 'clear' },
    { name: 'duration', kind: 'select', options: CINEMA_ALL_DURATIONS.map(String), default: '5' }, // union; per model: app.capabilities.durationsByProvider / routes[].durations
    { name: 'resolution', kind: 'select', options: RES, default: '1080p' }, // default 1080p
    { name: 'seed', kind: 'number' },
    { name: 'aspect', kind: 'select', options: ALL_ASPECTS, default: '16:9' },
    { name: 'audio', kind: 'select', options: ['0', '1'] },
    { name: 'count', kind: 'number', default: '1' },
  ],
  app: { /** B6: which models do each mode (generate / extend / edit / image), so defaults and send-to pick a model that can run it. */ modeProviders: CINEMA_MODE_PROVIDERS, capabilities: { aspectsByProvider: Object.fromEntries(Object.entries(CINEMA_CAPS).map(([k, v]) => [k, v.aspects])), audioByProvider: Object.fromEntries(Object.entries(CINEMA_CAPS).map(([k, v]) => [k, v.audio])), verified: Object.fromEntries(Object.entries(CINEMA_CAPS).map(([k, v]) => [k, v.verified])), sources: Object.fromEntries(Object.entries(CINEMA_CAPS).map(([k, v]) => [k, v.source])), audioDefaultByProvider: AUDIO_DEFAULT, durationsByProvider: Object.fromEntries(CINEMA_PROVIDERS.map((p) => [p, durationsFor('cinema', p)])), defaultDurationByProvider: Object.fromEntries(CINEMA_PROVIDERS.map((p) => [p, defaultDurationFor('cinema', p)])), defaultAspect: '16:9', defaultResolution: '1080p', outKinds: { generate: 'video', extend: 'video', edit: 'video', image: 'image' }, stagesByMode: { image: IMAGE_STAGES }, sections: CINEMA_SECTIONS, maxCount: CINEMA_MAX_COUNT, countPricing: 'per output', maxRefsByProvider: CINEMA_MAX_REFS, modes: [...CINEMA_MODES], modeProviders: CINEMA_MODE_PROVIDERS, maxSourceSeconds: CINEMA_MAX_SOURCE_SEC }, look: Object.fromEntries(LOOK_FIELDS.map((k) => [k, LOOK_OPTIONS[k].map(({ id, label }) => ({ id, label }))])), kind: 'av-video', cameraMoves: CAMERA_MOVES.map(({ id, label, ltx, funCamera }) => ({ id, label, ltx: ltx ?? null, funCamera: funCamera ?? null })), emotions: [...EMOTIONS], intensities: [...INTENSITIES], durations: CINEMA_ALL_DURATIONS /* union; per model: durationsByProvider */, resolutions: RES, autoPanels: 4, maxRefs: CINEMA_MAX_REFS_ANY },
  workflows: ['camera-ltx-api.json', 'reshoot-funcamera-api.json'], model: 'LTX-2 + camera LoRAs (default) · Wan 2.2 Fun Camera fallback',
  gpuSecPerSec: { '480p': 10, '720p': 21, '1080p': 45 }, stages: STAGES,
  providers: [...CINEMA_PROVIDERS],
  async parseInput(fields, files) {
    const issues: { code: string; field: string; message: string }[] = [];
    const bad = (code: string, field: string, message: string) => issues.push({ code, field, message });
    const prompt = (fields.prompt || '').slice(0, 10_000);
    const provId0 = fields.provider || 'comfy-open';
    // ONE duration rule with the price quote (tools/h3/videoCaps durationsFor): an unsupported length → 400 invalid_duration + allowed list, never coerced
    const rd = resolveDuration('cinema', provId0, fields.duration ?? fields.seconds); if (rd && 'error' in rd) return { ...durationErrorBody(rd, fields.duration != null && fields.duration !== '' ? 'duration' : 'seconds') } as any;
    const duration = rd ? rd.seconds : defaultDurationFor('cinema', provId0)!;
    const resolution = truthy(fields.draft) ? '480p' : (fields.resolution || '1080p');
    if (!RES.includes(resolution)) bad('resolution', 'resolution', `Quality must be one of ${RES.join(', ')}.`);
    const emotion = fields.emotion || 'neutral'; const intensity = fields.intensity || 'clear';
    if (!EMOTIONS.includes(emotion as any)) bad('emotion', 'emotion', `Emotion must be one of ${EMOTIONS.join(', ')}.`);
    if (!INTENSITIES.includes(intensity as any)) bad('intensity', 'intensity', `Intensity must be one of ${INTENSITIES.join(', ')}.`);
    const refs = files.refs ?? [];
    const provId = fields.provider || 'comfy-open'; const maxRefs = CINEMA_MAX_REFS[provId] ?? 8;
    if (refs.length > maxRefs) bad('too_many', 'refs', `Up to ${maxRefs} assets on this model.`);
    const mode = (fields.mode || 'generate') as typeof CINEMA_MODES[number];
    let source: { path: string; url: string; duration: number } | null = null;
    if (!CINEMA_MODES.includes(mode)) bad('invalid', 'mode', `mode must be ${CINEMA_MODES.join(', ')}.`);
    else if (mode === 'image') {
      if (!CINEMA_MODE_PROVIDERS.image.includes(provId)) bad('unsupported', 'mode', `Image mode runs on ${CINEMA_MODE_PROVIDERS.image.join(', ')} (a local still); hosted video models make video only.`);
      if (truthy(fields.auto)) bad('invalid', 'auto', 'Auto works in generate mode only.');
      if (fields.count && Number(fields.count) > 1) bad('count', 'count', 'Image mode makes one still; set count to 1.');
    }
    else if (mode !== 'generate') {
      if (!CINEMA_MODE_PROVIDERS[mode].includes(provId)) bad('unsupported', 'mode', `${mode === 'extend' ? 'Extend' : 'Edit'} needs a model that takes a video: ${CINEMA_MODE_PROVIDERS[mode].join(', ')}.`);
      const v = files.video?.[0];
      if (!v) bad('required', 'video', `Upload the clip to ${mode}.`);
      else { const pv = await probe(path.join(DATA_DIR, v)); if (!pv) bad('format', 'video', 'Unsupported video format.'); else if (pv.duration > CINEMA_MAX_SOURCE_SEC + 0.05) bad('too_long', 'video', `Clip is too long: up to ${CINEMA_MAX_SOURCE_SEC} s.`); else source = { path: path.join(DATA_DIR, v), url: `/files/${v}`, duration: pv.duration }; }
      if (truthy(fields.auto)) bad('invalid', 'auto', `Auto works in generate mode only.`);
    }
    const look = parseLook(fields); for (const i of look.issues) bad(i.code, i.field, i.message);
    for (const r of refs) if (!/\.(png|jpe?g)$/i.test(r) || !(await probe(path.join(DATA_DIR, r)))) { bad('format', 'refs', 'Assets must be PNG or JPG.'); break; }
    const tl = parseTimeline(prompt, duration);
    if (!tl.cleanPrompt && !truthy(fields.auto) && mode !== 'extend') bad('required', 'prompt', 'Describe the scene, or turn on Auto to plan from your assets.');
    for (const u of resolveElements(prompt, listElements()).unknown) bad('unknown_element', 'prompt', `Unknown element ${u}. Add it in Cast & props`);
    for (const i of tl.issues.filter((x) => x.code === 'unknown_move' || x.code === 'bad_range')) bad(i.code, 'prompt', i.message);
    const mv = validateMentions(prompt, { images: refs.length, videos: 0 });
    for (const i of mv.issues) bad(i.code, 'prompt', i.message);
    if (issues.length) return { error: issues[0].message, issues, mentionIssues: mv.issues.map((i) => ({ code: i.code, mention: i.mention.raw, start: i.mention.start, end: i.mention.end, message: i.message })) } as any;
    const cap = CINEMA_CAPS[fields.provider || 'comfy-open'] ?? CINEMA_CAPS['comfy-open'];
    const aspect = fields.aspect || '16:9';
    if (!cap.aspects.includes(aspect)) bad('aspect', 'aspect', `Aspect ${aspect} isn't supported by this model. Use ${cap.aspects.join(', ')}.`);
    const audioAsked = fields.audio == null || fields.audio === '' ? null : truthy(fields.audio);
    if (audioAsked && !cap.audio) bad('audio_unsupported', 'audio', "This model doesn't generate audio. Turn audio off or pick a model with audio.");
    const audio = audioAsked ?? (cap.audio && (AUDIO_DEFAULT[fields.provider || 'comfy-open'] ?? false));
    const count = fields.count == null || fields.count === '' ? 1 : Number(fields.count);
    if (!Number.isInteger(count) || count < 1 || count > CINEMA_MAX_COUNT) bad('count', 'count', `Count must be 1–${CINEMA_MAX_COUNT}.`);
    else if (count > 1 && truthy(fields.auto)) bad('count', 'count', 'Auto already makes 4 shot options; set count to 1.');
    if (issues.length) return { error: issues[0].message, issues } as any;
    const seed = seedOf(fields.seed); const auto = truthy(fields.auto);
    const panels = auto ? autoPanels(seed, duration, tl.segments) : [];
    const emo = emotionPhrase(emotion, intensity);
    const lookPhrase = look.phrase ? `Look: ${look.phrase}` : '';
    const modePhrase = mode === 'extend' ? 'Continue the uploaded clip seamlessly from its last frame' : mode === 'edit' ? 'Edit the uploaded clip, keep its motion and timing' : '';
    const finalPrompt = [modePhrase, tl.cleanPrompt, tl.segments.length ? `Camera: ${timelinePhrase(tl.segments)}` : '', emo, lookPhrase].filter(Boolean).join('. ');
    return {
      prompt, finalPrompt, cleanPrompt: tl.cleanPrompt, timeline: tl.segments, timelineWarnings: tl.issues.map((i) => i.message),
      cameraPresets: [...new Set(tl.segments.map((s) => s.ltx).filter(Boolean))], funCameraPresets: [...new Set(tl.segments.map((s) => s.funCamera).filter(Boolean))],
      emotion, intensity, emotionStrength: emotionStrength(emotion, intensity), auto, panels: panels.map((p) => ({ ...p, finalPrompt: [tl.cleanPrompt, p.shot, `Camera: ${timelinePhrase(p.segments)}`, emo, lookPhrase].filter(Boolean).join('. ') })),
      look: look.values, lookPhrase: look.phrase, cinemaMode: mode, ...(source ? { videoPath: source.path, videoUrl: source.url, sourceSeconds: source.duration, refVideoSeconds: provId === 'router-seedance' ? Math.round(source.duration * 100) / 100 : 0 } : {}),
      refUrls: refs.map((r) => `/files/${r}`), refPaths: refs.map((r) => path.join(DATA_DIR, r)), mentions: mv.mentions.map((m) => m.raw),
      types: [auto ? 'auto' : 'direct'], mode: auto ? 'auto' : 'direct', outKind: mode === 'image' ? 'image' : 'av-video', outputKind: mode === 'image' ? 'image' : 'video',
      aspect, audio: mode === 'image' ? false : audio, count, n: count, audioKind: audio && mode !== 'image' ? 'music' : 'none',
      duration: mode === 'image' ? 1 : duration, resolution, draft: truthy(fields.draft), seed, warnings: tl.issues.filter((i) => i.code === 'overlap' || i.code === 'out_of_range').map((i) => i.message),
      simulate: mockFailOf(fields), target: '',
    };
  },
  run(job: Job) {
    const n = Number(job.input.count) || 1;
    const labels = job.input.auto ? (job.input.panels as { label: string }[]).map((p) => p.label) : n > 1 ? Array.from({ length: n }, (_, i) => `Take ${i + 1}`) : [job.input.cinemaMode === 'image' ? 'Still' : 'Shot'];
    return mockRun(job, job.input.cinemaMode === 'image' ? IMAGE_STAGES : STAGES, labels, job.input.cinemaMode === 'image' ? 4000 : job.input.auto ? 9000 : 6000);
  },
};
(cinemaTool as any).draft = { quality: '480p', factor: 0.3 };
