import { LIMITS } from '../media.js';
import path from 'node:path';
import type { ToolDef } from './types.js';
import { GPU_LTX, mockRun, parseCommon, seedOf, mockFailOf } from './shared.js';
import { RESOLUTIONS } from '../media.js';
import { DATA_DIR } from '../config.js';
import { probe } from '../media.js';
import { parseCrossView } from './reshootCrossView.js';
import { CROSSVIEW_PROVIDER, CROSSVIEW_RESOLUTIONS, CROSSVIEW_AZ, CROSSVIEW_EL, CROSSVIEW_DIST, CROSSVIEW_SECONDS } from '../shared/crossview.js';
/** Extra video refs and model-made audio exist only on the Seedance route. */
/** 3 clips, ≤15.1 s total: the verified Seedance 2 reference limits in tools/h3/videoCaps.ts (9 was suggested; not verified). */
export const RESHOOT_MAX_VIDEO_REFS = 3; const RESHOOT_MAX_VIDEO_REF_SEC = 15.1;
const SEEDANCE_ONLY = ['router-seedance'];

const stages: [string, string][] = [['uploading', 'Uploading'], ['depth', 'Estimating depth'], ['camera', 'Planning camera moves'], ['rendering', 'Rendering angles'], ['muxing', 'Muxing audio']];
export const MAX_ANGLES = 4;
/** dp30 (d): batch angles. angleCount N > 1 renders N separate full-clip angles (one output each): the angles you give first, then evenly spaced
 *  orbit positions around the subject. Price = N × the one-angle price; local / mock demo routes stay 0 credits. */
export const RESHOOT_ANGLE_COUNTS = [1, 4, 8, 12] as const;
export const angleCountOf = (v: unknown): number | null => { if (v == null || v === '') return 1; const n = Number(v); return (RESHOOT_ANGLE_COUNTS as readonly number[]).includes(n) ? n : null; };
export const ANGLE_COUNT_ERROR = `angleCount must be one of ${RESHOOT_ANGLE_COUNTS.join(', ')}.`;
/** N orbit positions evenly around the subject, never the straight-on front (N=4 → yaw −135, −45, 45, 135). */
export const batchOrbit = (n: number) => Array.from({ length: n }, (_, i) => Math.round(-180 + (360 * (i + 0.5)) / n));
export interface Angle { start: number; end: number; angle: string; /** custom orbit position (degrees) when sent as yaw/tilt */ yaw?: number; tilt?: number; /** nearest preset that drives the camera LoRA / pose when `angle` is a phrase */ preset?: string | null }

/**
 * DP ask #1 (drag-to-orbit): every angle preset carries its camera position. yaw = degrees around the subject (0 = front, negative = the
 * subject's left, positive = right, ±180 = behind); tilt = degrees up/down (positive = camera above looking down, negative = below looking up).
 * zoom = framing factor (1 = the source framing); move = a camera move rather than a fixed position; pad = a point on the orbit pad
 * (custom yaw/tilt snap to these within RESHOOT_SNAP_DEG).
 */
export interface AnglePreset { label: string; yaw: number; tilt: number; zoom: number; move: 'push-in' | 'orbit' | null; pad: boolean }
export const RESHOOT_ANGLES: AnglePreset[] = [
  { label: 'left side', yaw: -90, tilt: 0, zoom: 1, move: null, pad: true },
  { label: 'right side', yaw: 90, tilt: 0, zoom: 1, move: null, pad: true },
  { label: 'low angle', yaw: 0, tilt: -30, zoom: 1, move: null, pad: true },
  { label: 'high angle', yaw: 0, tilt: 45, zoom: 1, move: null, pad: true },
  { label: 'close-up', yaw: 0, tilt: 0, zoom: 2, move: null, pad: false },
  { label: 'over the shoulder', yaw: 150, tilt: 10, zoom: 1.3, move: null, pad: false },
  { label: 'slow push in', yaw: 0, tilt: 0, zoom: 1.5, move: 'push-in', pad: false },
  { label: 'orbit left', yaw: -45, tilt: 0, zoom: 1, move: 'orbit', pad: false },
];
export const RESHOOT_YAW = { min: -180, max: 180 } as const; export const RESHOOT_TILT = { min: -60, max: 60 } as const; export const RESHOOT_SNAP_DEG = 20;
const wrap = (d: number) => { const x = ((d + 180) % 360 + 360) % 360 - 180; return x === -180 && d > 0 ? 180 : x; };
/** Plain camera phrase for a custom position, e.g. "camera 45° to the subject's right, at eye level". */
export function yawTiltPhrase(yaw: number, tilt: number) {
  const a = Math.abs(yaw); const h = a < 15 ? 'from the front' : a >= 165 ? 'from behind the subject' : `${Math.round(a)}° to the subject's ${yaw < 0 ? 'left' : 'right'}`;
  const v = tilt >= 10 ? `${Math.round(tilt)}° above, looking down` : tilt <= -10 ? `${Math.round(-tilt)}° below, looking up` : 'at eye level';
  return `camera ${h}, ${v}`;
}
/** Custom yaw/tilt → the nearest pad preset (snapped when within RESHOOT_SNAP_DEG: angle = that preset) or a prompt phrase that keeps the nearest
 *  preset's camera LoRA / pose for the local engines (preset null when the position is the front, eye level: static camera + phrase). */
export function resolveYawTilt(yaw: number, tilt: number) {
  let best: AnglePreset | null = null; let bd = Infinity;
  for (const p of RESHOOT_ANGLES) if (p.pad) { const d = Math.hypot(wrap(yaw - p.yaw), tilt - p.tilt); if (d < bd) { bd = d; best = p; } }
  if (best && bd <= RESHOOT_SNAP_DEG) return { angle: best.label, preset: best.label, yaw, tilt, snapped: true };
  const front = Math.abs(yaw) < 15 && Math.abs(tilt) < 10;
  return { angle: yawTiltPhrase(yaw, tilt), preset: front ? null : best?.label ?? null, yaw, tilt, snapped: false };
}
/** Image input (a still as the source instead of a video), per provider. LTX-2 re-shoot follows the source video's motion (pose guide). */
export const RESHOOT_IMAGE_INPUT: Record<string, boolean> = { 'comfy-open': false, 'comfy-funcamera': true, 'cloud-reshoot': false, [CROSSVIEW_PROVIDER]: false, 'router-seedance': true, 'router-veo': true };
export const RESHOOT_IMAGE_REASON: Record<string, string> = { 'comfy-open': 'LTX-2 re-shoot follows the motion of a source video, so it needs a video.', 'cloud-reshoot': 'LTX-2 re-shoot follows the motion of a source video, so it needs a video.', [CROSSVIEW_PROVIDER]: 'H3 CrossView re-views a filmed take from a new camera, so it needs a video.' };
export const reshootImageProviders = (ids: string[]) => ids.filter((id) => RESHOOT_IMAGE_INPUT[id]);
export const RESHOOT_STILL_SECONDS = { min: 2, max: 10, default: 5 } as const;
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
/** Validates one custom position. Returns an issue or the resolved angle. */
function customAngle(yawIn: unknown, tiltIn: unknown, field: string) {
  const yaw = num(yawIn) ?? 0; const tilt = num(tiltIn) ?? 0;
  if (!Number.isFinite(yaw) || yaw < RESHOOT_YAW.min || yaw > RESHOOT_YAW.max) return { issue: { code: 'out_of_range', field: `${field}.yaw`, message: `yaw must be a number from ${RESHOOT_YAW.min} to ${RESHOOT_YAW.max} degrees.` } };
  if (!Number.isFinite(tilt) || tilt < RESHOOT_TILT.min || tilt > RESHOOT_TILT.max) return { issue: { code: 'out_of_range', field: `${field}.tilt`, message: `tilt must be a number from ${RESHOOT_TILT.min} to ${RESHOOT_TILT.max} degrees.` } };
  return { resolved: resolveYawTilt(yaw, tilt) };
}

/**
 * Re-shoot / Multiple Angles (CLEANROOM-SPEC P0-4 + Builder Q&A #3/#4).
 * Up to 4 angles, each = time range + angle preset → one multi-angle cut.
 * Optional "render each angle as full clip" adds one full-length output per angle (for the switcher).
 * Audio: original kept by default; an uploaded `audio` file replaces the track.
 */
export const reshootTool: ToolDef = {
  id: 'reshoot', name: 'Re-shoot / Angles', category: 'Re-shoot', ui: 'reshoot', route: '/tools/reshoot',
  description: 'Film the same moment from up to four new angles. Works best on a steady, wide clip.',
  inputs: [
    { name: 'video', kind: 'file', required: true, accept: 'video/mp4,video/quicktime,video/webm' }, // or sourceImage (see below)
    { name: 'sourceImage', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'Source still (instead of a video)' }, // routes in capabilities.imageInputByProvider
    { name: 'seconds', kind: 'number' }, // still source only: clip length (RESHOOT_STILL_SECONDS)
    { name: 'yaw', kind: 'number' }, { name: 'tilt', kind: 'number' }, // custom orbit position for the whole clip (angles[] items take yaw/tilt too)
    { name: 'angles', kind: 'list', max: MAX_ANGLES }, // optional when `prompt` is set (prompt-only path: one angle for the whole clip)
    { name: 'videoRefs', kind: 'files', accept: 'video/mp4,video/quicktime,video/webm', max: RESHOOT_MAX_VIDEO_REFS }, // router-seedance only
    { name: 'generateAudio', kind: 'select', options: ['0', '1'], default: '0' }, // router-seedance only
    { name: 'fullClip', kind: 'select', options: ['0', '1'], default: '0' },
    { name: 'angleCount', kind: 'select', options: RESHOOT_ANGLE_COUNTS.map(String), default: '1', label: 'Angles to render (batch)' }, // dp30 (d)
    { name: 'audio', kind: 'file', accept: 'audio/*' },
    { name: 'prompt', kind: 'text' },
    { name: 'refs', kind: 'files', accept: 'image/*', max: LIMITS.maxRefs }, // 30, even groups of ≤8 like the swap tools [audit 04-06 P2]
    { name: 'resolution', kind: 'select', options: [...RESOLUTIONS], default: '720p', byProvider: { [CROSSVIEW_PROVIDER]: [...CROSSVIEW_RESOLUTIONS] } } as any,
    { name: 'azimuth', kind: 'number' }, { name: 'elevation', kind: 'number' }, { name: 'distance', kind: 'number' }, // H3 CrossView only: the camera as numbers (degrees, 1 = the take's distance)
    { name: 'seed', kind: 'number' },
  ],
  presets: RESHOOT_ANGLES.map((a) => ({ id: a.label.replace(/ /g, '-'), label: a.label, prompt: a.label, yaw: a.yaw, tilt: a.tilt, zoom: a.zoom, move: a.move, pad: a.pad })),
  workflows: ['reshoot-api.json', 'reshoot-funcamera-api.json'],
  model: 'LTX-2 19B pose IC-LoRA + camera-control LoRA per angle (fallback: Wan 2.2 Fun Camera 14B)',
  gpuSecPerSec: GPU_LTX,
  stages,
  providers: ['comfy-open', 'router-seedance', 'router-veo', 'comfy-funcamera', 'cloud-reshoot', CROSSVIEW_PROVIDER /* requires your Comfy deployment */], // Cloud-first quality order; choose the first runnable route. cloud-reshoot remains a compatibility alias.
  async parseInput(fields, files) {
    const prov = fields.provider || 'comfy-open';
    const still = !files.video?.length && !!files.sourceImage?.length; // DP ask #1: a still image as the source
    if (files.video?.length && files.sourceImage?.length) return { error: 'Send either a video or a source image, not both.', issues: [{ code: 'invalid', field: 'sourceImage', message: 'Send either a video or a source image, not both.' }] };
    if (still && !RESHOOT_IMAGE_INPUT[prov]) { const msg = `${RESHOOT_IMAGE_REASON[prov] ?? 'This model needs a source video.'} Pick a model that takes a still image, or upload a video.`;
      return { error: msg, code: 'image_input_unsupported', issues: [{ code: 'image_input_unsupported', field: 'sourceImage', message: msg, providers: reshootImageProviders(reshootTool.providers) }] } as any; }
    if (prov === CROSSVIEW_PROVIDER && !still) return parseCrossView(fields, files, await parseCommon({ ...fields, resolution: '480p' }, files, { refsRequired: false, maxRefs: LIMITS.maxRefs }), RESHOOT_ANGLES); // H3 runner Step 3
    let c: any;
    if (still) {
      const img = files.sourceImage[0]; const pi = await probe(path.join(DATA_DIR, img));
      if (!pi || !pi.width) return { error: "Couldn't read the source image.", issues: [{ code: 'unreadable', field: 'sourceImage', message: "Couldn't read the source image." }] };
      const secs = num(fields.seconds ?? fields.duration) ?? RESHOOT_STILL_SECONDS.default;
      if (!Number.isFinite(secs) || secs < RESHOOT_STILL_SECONDS.min || secs > RESHOOT_STILL_SECONDS.max) return { error: `seconds must be ${RESHOOT_STILL_SECONDS.min}–${RESHOOT_STILL_SECONDS.max} for a still source.`, issues: [{ code: 'out_of_range', field: 'seconds', message: `seconds must be ${RESHOOT_STILL_SECONDS.min}–${RESHOOT_STILL_SECONDS.max} for a still source.` }] };
      // parseCommon needs a video (duration, min length), so the shared fields are built here for a still source
      const resolution = fields.draft && /^(1|true|on)$/i.test(fields.draft) ? '480p' : (fields.resolution || '720p');
      if (!(RESOLUTIONS as readonly string[]).includes(resolution)) return { error: `Resolution must be one of ${RESOLUTIONS.join(', ')}.`, issues: [{ code: 'invalid', field: 'resolution', message: `Resolution must be one of ${RESOLUTIONS.join(', ')}.` }] };
      const refs = files.refs ?? [];
      c = { videoPath: '', videoUrl: null, imageSourcePath: path.join(DATA_DIR, img), imageSourceUrl: `/files/${img}`, duration: secs, width: pi.width, height: pi.height, hasAudio: false,
        refPaths: refs.map((r) => path.join(DATA_DIR, r)), refUrls: refs.map((r) => `/files/${r}`), imagePath: path.join(DATA_DIR, img), refBatches: [refs.map((r) => path.join(DATA_DIR, r))], refGroupLabels: ['All'], pinned: [],
        prompt: fields.prompt ?? '', preset: fields.preset || '', resolution, seed: seedOf(fields.seed), warnings: [], draft: /^(1|true|on)$/i.test(fields.draft || ''), keepAudio: false, mentions: [], simulate: mockFailOf(fields), simulateGroup: 0 };
      if (c.prompt.length > LIMITS.maxPrompt) return { error: `Prompt is too long — maximum ${LIMITS.maxPrompt} characters.` };
    } else {
      c = await parseCommon(fields, files, { refsRequired: false, maxRefs: LIMITS.maxRefs });
      if ('error' in c) { if (!files.video?.length) return { ...c, issues: [{ code: 'required', field: 'video', message: 'A source video (or a source image, on models that take one) is required.' }], error: 'A source video (or a source image, on models that take one) is required.' }; return c; }
    }
    let raw: unknown[] = [];
    try { raw = JSON.parse(fields.angles || '[]'); } catch { return { error: 'angles must be a JSON array of {start,end,angle} or {start,end,yaw,tilt}.' }; }
    if (!Array.isArray(raw)) return { error: 'angles must be a JSON array of {start,end,angle} or {start,end,yaw,tilt}.' };
    const dur = c.duration;
    const angles: Angle[] = [];
    for (const [k, a] of raw.entries()) {
      // A plain string = that angle for the whole clip. {yaw, tilt} (numbers, degrees) = a custom orbit position.
      const o: any = typeof a === 'string' ? { start: 0, end: dur, angle: a } : a ?? {};
      const hasPos = o.yaw != null || o.tilt != null;
      let angle = String(o?.angle ?? '').trim(); let extra: Partial<Angle> = {};
      if (hasPos) { const r = customAngle(o.yaw, o.tilt, `angles[${k}]`); if ('issue' in r) return { error: r.issue!.message, issues: [r.issue] } as any; angle = r.resolved!.angle; extra = { yaw: r.resolved!.yaw, tilt: r.resolved!.tilt, preset: r.resolved!.preset }; }
      const start = o.start == null ? 0 : Number(o.start); const end = o.end == null ? dur : Number(o.end);
      if (!angle) return { error: 'Each angle needs an angle preset, a description, or yaw/tilt.' };
      if (!(start >= 0 && end > start && end <= dur + 0.05)) return { error: `Angle "${angle}": time range must be within 0–${dur.toFixed(1)} s and end after start.` };
      angles.push({ start, end: Math.min(end, dur), angle, ...extra });
    }
    if (!angles.length && (fields.yaw != null && fields.yaw !== '' || fields.tilt != null && fields.tilt !== '')) { // top-level yaw/tilt: one custom angle for the whole clip
      const r = customAngle(fields.yaw, fields.tilt, 'angles[0]'); if ('issue' in r) return { error: r.issue!.message, issues: [{ ...r.issue!, field: r.issue!.field.replace('angles[0].', '') }] } as any;
      angles.push({ start: 0, end: dur, angle: r.resolved!.angle, yaw: r.resolved!.yaw, tilt: r.resolved!.tilt, preset: r.resolved!.preset });
    }
    const angleCount = angleCountOf(fields.angleCount);
    if (angleCount == null) return { error: ANGLE_COUNT_ERROR, issues: [{ code: 'invalid', field: 'angleCount', message: ANGLE_COUNT_ERROR, allowed: [...RESHOOT_ANGLE_COUNTS] }] } as any;
    if (angleCount > 1) { // batch: N full-clip angles, one output each (no time ranges, no overlap rule, no 4-angle cap)
      if (angles.length > angleCount) return { error: `You gave ${angles.length} angles for a batch of ${angleCount}. Pick a bigger batch or fewer angles.`, issues: [{ code: 'too_many', field: 'angles', message: `Up to ${angleCount} angles for this batch.` }] } as any;
      const batch: Angle[] = angles.map((a) => ({ ...a, start: 0, end: dur }));
      for (const yaw of batchOrbit(angleCount)) { if (batch.length >= angleCount) break; const r = resolveYawTilt(yaw, 0); batch.push({ start: 0, end: dur, angle: r.angle, yaw, tilt: 0, preset: r.preset }); }
      const audio0 = files.audio?.[0];
      return { ...c, angles: batch, angleCount, batchAngles: true, fullClip: false, slot: null, mode: 'reshoot', target: '', sourceKind: still ? 'image' : 'video', audioPath: audio0 ? path.join(DATA_DIR, audio0) : '', audioReplaced: !!audio0,
        promptOnly: false, videoRefPaths: [], videoRefUrls: [], refVideoSeconds: 0, generateAudio: false, audio: false };
    }
    const promptOnly = !angles.length && !!c.prompt.trim();
    if (promptOnly) angles.push({ start: 0, end: dur, angle: c.prompt.trim().slice(0, 200) }); // angles described in text only → one angle job
    if (!angles.length) return { error: 'Add at least one angle (time range + angle, e.g. 0–3 s low angle), or describe the angles in the prompt.', issues: [{ code: 'required', field: 'angles', message: 'Add an angle or describe the angles in the prompt.' }] };
    if (angles.length > MAX_ANGLES) return { error: `Up to ${MAX_ANGLES} angles per run.` };
    const sorted = [...angles].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end - 0.05) return { error: 'Angle time ranges must not overlap.' };
    const fullClip = /^(1|true|on)$/i.test(fields.fullClip || '');
    const slot = fields.slot != null && fields.slot !== '' ? Number(fields.slot) : null; // re-roll: index of the output to replace
    const audio = files.audio?.[0];
    const vrefs = files.videoRefs ?? [];
    const genAudio = /^(1|true|on)$/i.test(fields.generateAudio || '');
    if (vrefs.length && !SEEDANCE_ONLY.includes(prov)) return { error: 'Video references work only on the Seedance model.', issues: [{ code: 'unsupported', field: 'videoRefs', message: 'Video references work only on the Seedance model.', providers: SEEDANCE_ONLY }] };
    if (vrefs.length > RESHOOT_MAX_VIDEO_REFS) return { error: `Up to ${RESHOOT_MAX_VIDEO_REFS} video references.`, issues: [{ code: 'too_many', field: 'videoRefs', message: `Up to ${RESHOOT_MAX_VIDEO_REFS} video references.` }] };
    if (genAudio && !SEEDANCE_ONLY.includes(prov)) return { error: "This model doesn't generate audio. Pick Seedance or turn generateAudio off.", issues: [{ code: 'audio_unsupported', field: 'generateAudio', message: "This model doesn't generate audio.", providers: SEEDANCE_ONLY }] };
    if (genAudio && audio) return { error: 'Use either a replacement audio file or generateAudio, not both.', issues: [{ code: 'invalid', field: 'generateAudio', message: 'Use either audio or generateAudio, not both.' }] };
    let refVideoSeconds = 0;
    for (const [i, v] of vrefs.entries()) { const pv = await probe(path.join(DATA_DIR, v)); if (!pv) return { error: `Video reference ${i + 1}: couldn't read the file (damaged or empty).`, issues: [{ code: 'unreadable', field: `videoRefs[${i}]`, message: 'Unsupported format.' }] }; refVideoSeconds += pv.duration; }
    if (refVideoSeconds > RESHOOT_MAX_VIDEO_REF_SEC) return { error: `Video references can add up to ${RESHOOT_MAX_VIDEO_REF_SEC} s in total.`, issues: [{ code: 'too_long', field: 'videoRefs', message: `Video references can add up to ${RESHOOT_MAX_VIDEO_REF_SEC} s in total.` }] };
    return { ...c, angles, angleCount: 1, fullClip, slot, mode: 'reshoot', target: '', sourceKind: still ? 'image' : 'video', audioPath: audio ? path.join(DATA_DIR, audio) : '', audioReplaced: !!audio,
      promptOnly, videoRefPaths: vrefs.map((v) => path.join(DATA_DIR, v)), videoRefUrls: vrefs.map((v) => `/files/${v}`), refVideoSeconds: Math.round(refVideoSeconds * 100) / 100, generateAudio: genAudio, audio: genAudio };
  },
  run: (job) => {
    const a: Angle[] = job.input.angles;
    const fmt = (x: Angle) => `${x.start}–${x.end}s ${x.angle}`;
    const labels = job.input.batchAngles ? a.map((x, i) => `Angle ${i + 1}: ${x.angle}`) // dp30 (d): one output per batch angle
      : job.input.slot != null ? [a.map(fmt).join(' · ')] : ['Multi-angle cut', ...(job.input.fullClip ? a.map((x) => x.angle) : [])];
    return mockRun(job, stages, labels, 6000 + 1500 * labels.length);
  },
};
/** /api/tools → capabilities (DP ask #1): orbit pad space + which routes take a still image. */
(reshootTool as any).capabilities = {
  angleSpace: { yaw: { ...RESHOOT_YAW, unit: 'deg', zero: 'front', negative: "subject's left", positive: "subject's right" }, tilt: { ...RESHOOT_TILT, unit: 'deg', positive: 'camera above, looking down', negative: 'camera below, looking up' }, snapDeg: RESHOOT_SNAP_DEG },
  imageInputByProvider: RESHOOT_IMAGE_INPUT, imageInputProviders: reshootImageProviders(reshootTool.providers), imageInputReasonByProvider: RESHOOT_IMAGE_REASON, stillSeconds: RESHOOT_STILL_SECONDS,
  angleCounts: [...RESHOOT_ANGLE_COUNTS], angleCountDefault: 1, zoomSupported: false, zoomNote: "No Re-shoot model takes a zoom or camera-distance number (LTX-2 and Seedance/Veo are steered by the angle text; Wan Fun Camera only has fixed Zoom In / Zoom Out moves), so there is no zoom control. Use the close-up or slow push in presets.", // dp30 (h)
  crossview: { provider: CROSSVIEW_PROVIDER, azimuth: CROSSVIEW_AZ, elevation: CROSSVIEW_EL, distance: CROSSVIEW_DIST, seconds: CROSSVIEW_SECONDS, resolutions: CROSSVIEW_RESOLUTIONS }, // H3 runner Step 3
   angleCountNote: 'Batch: renders that many full-clip angles, one output each; price = angles × the one-angle price.',
};
