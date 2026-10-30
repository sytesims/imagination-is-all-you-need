import { attachVoiceControls } from '../voice/voiceControls.js';
/**
 * MiniMax H3 additions (approved 2026-10-17): providers, licences (Models & Licences page only), the Extend tool,
 * and input parsing for Generate Video (Start + end frame, Fast/Quality) and Voice (Talking photo). Cloud-first routing applies: every local
 * route here is 0 credits and runs only with useLocal on or a local pin (routing/select.ts); hosted routes are in tools/h3/cloud.ts.
 */
import { ltxDfrAdjustNote, ltxDfrRuns, ltxDfrSmooth, ltxDfrFrames, LTX_DFR_FPS, LTX_DFR_SMOOTH_FIELD } from '../../shared/ltxDfr.js';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { registerProvider } from '../../providers.js';
import { registerLicense, registerWorkflowLicense } from '../../licenses.js';
import { DATA_DIR } from '../../config.js';
import type { ToolDef } from '../types.js';
import { h3VideoTool, voiceStudioTool } from '../media.js';
import { cameraMovePrompt, cameraMoveId, moveFirst } from '../apps.js';
import { restyleTool } from '../videoSwap.js';
import { mockRun, parseCommon } from '../shared.js';
import { H3_EXTEND_SECONDS, H3_QUALITY } from './catalog.js';
import { H3X_SECONDS, H3X_SECONDS_LIST, H3X_PAGE_SECONDS } from '../../shared/h3ExtendCloud.js';
import { h3Frames } from './rules.js';
import { H3KF_MODE, H3KF_MIN_FRAMES, H3KF_MAX_FRAMES, keyframeTimesIssue, parseKeyframeTimes, spreadTimes } from '../../comfy/h3KeyframesCloud.js';
import { WAN22_5B_STEPS, wanFrames } from '../../comfy/wan22.js';
import { LTX25_VIDEO, LTX25_FPS, LTX25_LOOP_WORDS, ltxVideoFrames } from '../../comfy/ltx25Video.js';
import { LTX25_LIPSYNC, lipsyncPrompt } from '../../comfy/ltx25Lipsync.js';
import { IT_PROVIDER } from '../../comfy/infiniteTalkCloud.js';
import { infiniteTalkParse } from '../voice/infiniteTalk.js';
import { LTX25_EXTEND, LTX25_EXTEND_SECONDS, LTX25_EXTEND_RESOLUTIONS, LTX25_EXTEND_RES_LABELS, LTX25_EXTEND_GUIDES, LTX25_EXTEND_DEFAULT_SECONDS, extendPlan, continuePlan, contextVideoArgs, contextAudioArgs, LTX25_EXTEND_METHODS, extendPrompt, conformExtendSourceArgs, guideArgs, countFrames, sampleGenArgs, joinExtension } from '../../comfy/ltx25Extend.js';
import { runFfmpeg } from '../../ffmpeg.js';
import { probe } from '../../media.js';
import { prepareLipAudio, LIP_MAX_SECONDS } from '../../audio/lipDriver.js';
import { VIDEO_ASPECTS, BITRATES, VIDEO_LIMITS, limitsFor, resolveResolution, resolutionMap, RES_LIKE, videoCapsBlock, postEncode, videoPresetById, defaultSecondsFor, resolveDuration, durationErrorBody, noteSnap, snapResolution } from './videoCaps.js';
import { addAdjustNote, nearestAspect, snapNote } from '../../shared/snap.js';
export { H3_LORAS, H3_CAMERA_MOVES, H3_INTENSITY } from './catalog.js';

registerLicense({ id: 'h3-camera-motion-civitai', name: 'camera_motion_h3 (Civitai licence, verified 2026-10-17): commercial use allowed incl. selling outputs, selling the model and running it on paid generation services (Image, Rent, RentCivit, Sell, SellMerge); no credit required; derivatives and relicensing allowed. Base MiniMax H3 Community Licence terms still apply.', osi: false, url: 'https://civitai.com/models/2914784/cameramotionh3' });
registerLicense({ id: 'alissonerdx-unspecified', name: 'Alissonerdx H3 Style Transfer / VFX Edit LoRAs: repo licence "other (mixed-asset-licenses)"; no licence is stated for these two files (the no-SaaS BFS licence covers only the Character Swap LoRAs). Treated as local only until the author states terms.', osi: false, url: 'https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI/blob/main/LICENSES.md' });
for (const f of ['h3-t2v-fast-api.json', 'h3-flf-api.json', 'h3-flf-fast-api.json', 'h3-lipsync-api.json', 'h3-extend-api.json']) registerWorkflowLicense(f, ['minimax-community', 'apache-2.0']);
registerWorkflowLicense('h3-camera-motion-api.json', ['minimax-community', 'h3-camera-motion-civitai']);
registerWorkflowLicense('h3-style-transfer-api.json', ['minimax-community', 'alissonerdx-unspecified', 'apache-2.0']);
registerWorkflowLicense('h3-vfx-edit-api.json', ['minimax-community', 'alissonerdx-unspecified', 'apache-2.0']);

const local = (id: string, name: string, workflows: string[], docUrl: string, licenseParts: string[]) =>
  registerProvider({ id, name, kind: 'open-weights', via: `local ComfyUI, workflows/${workflows.join(' + ')} (mock unless OPENHIGGSFIELD_BACKEND=comfy)`, workflows, docUrl, licenseParts, nodes: ['MiniMaxH3ImageToVideo', 'MiniMaxH3ReferenceToVideo', 'MiniMaxH3AddGuide', 'LoraLoaderModelOnly'] });
const H3_EXTEND_RES: string[] = ['768p', '480p'];
const DOC = 'https://docs.comfy.org/tutorials/video/minimax/minimax-h3';
local('comfy-h3-lipsync', 'MiniMax H3 Talking Photo', ['h3-lipsync-api.json'], DOC, ['minimax-community', 'apache-2.0']);
local('comfy-h3-extend', 'MiniMax H3 Extend', ['h3-extend-api.json'], DOC, ['minimax-community']);
local('comfy-h3-camera', 'MiniMax H3 Camera Motion', ['h3-camera-motion-api.json'], 'https://civitai.com/models/2914784/cameramotionh3', ['minimax-community', 'h3-camera-motion-civitai']);
local('comfy-h3-restyle', 'MiniMax H3 Style Transfer', ['h3-style-transfer-api.json'], 'https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI', ['minimax-community', 'alissonerdx-unspecified']);
local('comfy-h3-vfx', 'MiniMax H3 VFX Edit', ['h3-vfx-edit-api.json'], 'https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI', ['minimax-community', 'alissonerdx-unspecified']);

// Restyle: H3 style transfer + VFX as local-only engines (never the default; licence forbids hosted use).
restyleTool.providers = [...restyleTool.providers.filter((p) => !p.startsWith('comfy-h3-')), 'comfy-h3-restyle', 'comfy-h3-vfx'];
restyleTool.workflows = [...new Set([...restyleTool.workflows, 'h3-style-transfer-api.json', 'h3-vfx-edit-api.json'])];

function audioSeconds(file: string): Promise<number> {
  return new Promise((ok) => { const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]); let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('close', () => ok(Number(o.trim()) || 0)); p.on('error', () => ok(0)); });
}
/** Frames per second of a clip's first video stream (0 = unreadable). */
function frameRate(file: string): Promise<number> {
  return new Promise((ok) => { const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', file]); let o = ''; p.stdout.on('data', (d) => (o += d));
    p.on('close', () => { const [a, b] = o.trim().split('/').map(Number); ok(a > 0 ? Math.round((a / (b || 1)) * 1000) / 1000 : 0); }); p.on('error', () => ok(0)); });
}
const bad = (field: string, message: string, code = 'invalid') => ({ error: message, issues: [{ code, field, message }] }) as any;

// Generate Video: Start + end frame (`image` + `lastFrame`), Fast/Quality, frames on the 17n+5 grid.
{ const di: any = h3VideoTool.inputs.find((i: any) => i.name === 'duration'); if (di) di.default = '4'; }
h3VideoTool.inputs.push({ name: 'lastFrame', kind: 'file', accept: 'image/png,image/jpeg,image/webp' },
  { name: 'aspect', kind: 'select', options: [...VIDEO_ASPECTS], default: 'auto' } as any, { name: 'audio', kind: 'select', options: ['1', '0'], default: '1' } as any,
  { name: 'bitrate', kind: 'select', options: BITRATES.map((b) => b.value), default: 'standard' } as any,
  { name: 'refs', kind: 'files', accept: 'image/png,image/jpeg,image/webp', label: 'Reference images' } as any /* r2v reference images (the bar sends them as `refs`) */,
  { name: 'refVideos', kind: 'file', accept: 'video/mp4,video/quicktime,video/webm' } as any, { name: 'refAudios', kind: 'file', accept: 'audio/*' } as any,
  /* Keyframes (2026-10-27): 2–5 stills in clip order + their times in seconds (JSON array, the first 0), MiniMax H3 Keyframes · Comfy Cloud */
  { name: 'keyframes', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'Keyframes' } as any, { name: 'keyframeTimes', kind: 'text' } as any);
const h3Parse = h3VideoTool.parseInput.bind(h3VideoTool);
h3VideoTool.parseInput = async (fields, files) => {
  let mapped: ReturnType<typeof resolutionMap> = null; let resSnap: string | null = null;
  if ((fields.duration == null || fields.duration === '') && fields.seconds != null && fields.seconds !== '') fields = { ...fields, duration: String(fields.seconds) }; // `seconds` alias (the quote takes either): no source clip on H3, so it is the clip length
  { const L0 = limitsFor(fields.provider || h3VideoTool.providers[0]);
    if (L0) { mapped = resolutionMap(L0, fields.resolution, fields.quality); const sr = snapResolution(L0, fields.resolution, fields.quality); if (sr) { resSnap = sr.note; fields = { ...fields, resolution: sr.to }; } /* D5: nearest tier, with a note */ const rr = resolveResolution(L0, fields.resolution, fields.quality); if (rr === null) return bad('resolution', `Resolution must be one of ${L0.resolutions.join(', ')} for this model.`, 'unsupported'); fields = { ...fields, resolution: rr ?? L0.resolutions[0], }; if (fields.quality && RES_LIKE.test(fields.quality)) { const { quality: _q, ...rest } = fields; fields = rest; } }
    // no length asked: the model's default, within its per-resolution lengths (Veo 3.1 1080p → 8 s; 2026-10-25)
    if ((fields.duration == null || fields.duration === '') && L0) { const at = L0.durationsByResolution?.[fields.resolution]; fields = { ...fields, duration: String(at ? (at.includes(defaultSecondsFor(L0)) ? defaultSecondsFor(L0) : at[0]) : defaultSecondsFor(L0)) }; }
  } // per-model defaults (Kling starts at 3 s; resolution = model's first tier)
  const r: any = await h3Parse(fields, files); if ('error' in r) return r;
  /* Look → Camera (job field cameraMove): a Camera Moves preset on this run, same model and price. Its phrase goes first in the prompt,
   * the Camera Moves rule (apps.ts moveFirst); Free camera ('free') adds nothing. An id that isn't a move: 400, nothing charged. */
  if (fields.cameraMove) { const mv = cameraMovePrompt(fields.cameraMove);
    if (mv == null) return bad('cameraMove', 'That camera move isn’t on the list. Pick one from Look → Camera.', 'unknown_move');
    if (mv) { r.finalPrompt = moveFirst(mv, r.finalPrompt ?? r.prompt); if (r.enhancedPrompt) r.enhancedPrompt = moveFirst(mv, r.enhancedPrompt); r.cameraMove = cameraMoveId(String(fields.cameraMove).trim()); r.cameraMovePrompt = mv; } }
  if (mapped) { r.warnings = [...(r.warnings ?? []), mapped.message]; r.resolutionMapped = mapped; }
  if (resSnap) addAdjustNote(r, resSnap);
  if (r.mode === 'flf') {
    const last = files.lastFrame?.[0]; if (!last) return bad('lastFrame', 'Start + end frame needs an end frame (field lastFrame, PNG/JPG).', 'required');
    if (!/\.(png|jpe?g)$/i.test(last)) return bad('lastFrame', 'End frame: use PNG or JPG.', 'format');
    Object.assign(r, { lastFramePath: path.join(DATA_DIR, last), lastFrameUrl: `/files/${last}`, refUrls: [...(r.refUrls ?? []), `/files/${last}`] });
  }
  /* Keyframes (2026-10-27, comfy/h3KeyframesCloud.ts): 2–5 frames (field keyframes, in clip order) with their times (keyframeTimes, seconds, the first 0;
   * none sent = evenly spread). Frame 1 is <Picture 1> and the start; the others are pinned at their times. Checked here, so nothing is sent or charged. */
  if (r.mode === H3KF_MODE) {
    const kf = files.keyframes ?? [];
    if (kf.length < H3KF_MIN_FRAMES) return bad('keyframes', `Keyframes needs ${H3KF_MIN_FRAMES} to ${H3KF_MAX_FRAMES} frames (field keyframes, PNG or JPG); you added ${kf.length}.`, 'required');
    if (kf.length > H3KF_MAX_FRAMES) return bad('keyframes', `Keyframes takes up to ${H3KF_MAX_FRAMES} frames; you added ${kf.length}.`, 'unsupported');
    if (kf.some((f) => !/\.(png|jpe?g)$/i.test(f))) return bad('keyframes', 'Keyframes: use PNG or JPG pictures.', 'format');
    if (files.refVideos?.length || files.refAudios?.length || files.lastFrame?.length) return bad('keyframes', 'Keyframes takes pictures only: remove the reference clips, sound or end frame.', 'unsupported');
    const secs = Number(r.duration) || 5; const times = parseKeyframeTimes(fields.keyframeTimes) ?? spreadTimes(kf.length, secs);
    if (times.length !== kf.length) return bad('keyframeTimes', `Give each of the ${kf.length} frames a time (keyframeTimes, seconds); you gave ${times.length}.`);
    const tw = keyframeTimesIssue(times, secs); if (tw) return bad('keyframeTimes', `${tw}.`);
    const paths = kf.map((f) => path.join(DATA_DIR, f)); const urls = kf.map((f) => `/files/${f}`);
    Object.assign(r, { keyframePaths: paths, keyframeUrls: urls, keyframeTimes: times, imagePath: paths[0], imageUrl: urls[0], refPaths: paths, refUrls: urls,
      warnings: (r.warnings ?? []).filter((w: string) => !/image was ignored/i.test(w)) });
  }
  const q = r.quality === 'fast' ? 'fast' : 'quality';
  const prov = fields.provider || h3VideoTool.providers[0]; const L = limitsFor(prov);
  if (L) {
    { const rd = resolveDuration(h3VideoTool.id, prov, r.duration, fields.resolution ?? r.resolution); if (rd && 'error' in rd) return { ...durationErrorBody(rd) } as any; // ONE duration rule (quote = submit)
      if (rd?.snapped) { r.duration = rd.seconds; noteSnap(r, rd); } } // D5: an off-list length is made at the nearest one, with a note
    let aspect = fields.aspect || 'auto'; if (!(VIDEO_ASPECTS as readonly string[]).includes(aspect) && !L.aspects.includes(aspect) /* a model's own extra shape (FLUX 3 Max 2:1) */) return bad('aspect', `Aspect must be one of ${L.aspects.join(', ')} for this model.`, 'unsupported');
    if (!L.aspects.includes(aspect)) { const to = nearestAspect(L.aspects, aspect) ?? (L.aspects.includes('auto') ? 'auto' : L.aspects[0]); // D5: the closest shape this model makes, with a note
      addAdjustNote(r, to === 'auto' ? `Made in the shape of your picture, the only shape this model offers here (you picked ${aspect}).` : snapNote('shape', aspect, to)); aspect = to; }
    // a silent model (Wan 2.2 5B: no sound track) is always audio off; an Audio on/off field sent for it is ignored, never an error
    const audio = !L.audio.supported ? false : fields.audio == null || fields.audio === '' ? L.audio.default : /^(1|true|on|yes)$/i.test(fields.audio); if (!audio && !L.audio.toggle && L.audio.supported) return bad('audio', 'This model always renders sound.', 'unsupported');
    const bitrate = fields.bitrate || 'standard'; if (!L.bitrate.includes(bitrate)) return bad('bitrate', `Bitrate must be ${L.bitrate.join(' or ')}.`);
    const vids = files.refVideos ?? []; const auds = files.refAudios ?? [];
    if ((vids.length || auds.length) && r.mode !== 'r2v') return bad('refVideos', 'Video and audio references are for Reference to video.', 'unsupported');
    for (const [kind, n] of [['image', r.mode === 'r2v' ? (r.refPaths ?? []).length : 0], ['video', vids.length], ['audio', auds.length]] as const) if (n > ((L.refKinds as any)[kind] ?? 0)) return bad(kind === 'image' ? 'refs' : kind === 'video' ? 'refVideos' : 'refAudios', `At most ${(L.refKinds as any)[kind] ?? 0} ${kind} reference(s) for this model.`, 'unsupported');
    // Per-model reference limits (videoCaps: formats, clip lengths, frame rate, no audio-only job), checked here so nothing is sent or charged.
    const fmtOk = (f: string, exts: string[]) => exts.includes(path.extname(f).slice(1).toLowerCase()); const FMT = L.refFormats; const up = (xs: string[]) => xs.map((x) => x.toUpperCase()).join(' or ');
    if (vids.some((v) => !fmtOk(v, FMT?.video ?? ['mp4', 'mov', 'webm']))) return bad('refVideos', `Video references: ${up(FMT?.video ?? ['mp4', 'mov', 'webm'])} for this model.`, 'format');
    if (FMT?.audio && auds.some((a) => !fmtOk(a, FMT.audio!))) return bad('refAudios', `Audio references: ${up(FMT.audio)} for this model.`, 'format');
    if (L.audioNeedsVisualRef && auds.length && !vids.length && !(r.refPaths ?? []).length) return bad('refAudios', 'This model takes reference audio only next to a reference image or video. Add one, or remove the audio.', 'required');
    let refVideoSeconds = 0; // ffprobe each clip: token-billed providers (Seedance) price (input s + output s), quote = charge
    if (vids.length) { const secs = await Promise.all(vids.map((v) => audioSeconds(path.join(DATA_DIR, v)))); refVideoSeconds = Math.round(secs.reduce((a, b) => a + b, 0) * 100) / 100; r.refVideoSecondsEach = secs.map((x) => Math.round(x * 100) / 100);
      const RV = L.refVideoSeconds; if (secs.some((x) => !(x > 0))) return bad('refVideos', 'Could not read a reference video\'s length.', 'unreadable');
      if (RV && secs.some((x) => x < RV.minEach)) return bad('refVideos', `Each reference video must be at least ${RV.minEach} s.`, 'too_short');
      if (RV?.maxEach && secs.some((x) => x > RV.maxEach!)) return bad('refVideos', `Each reference video can be at most ${RV.maxEach} s.`, 'too_long');
      if (RV && refVideoSeconds > RV.maxTotal) return bad('refVideos', `Reference videos total ${refVideoSeconds} s; this model allows ${RV.maxTotal} s in total.`, 'too_long');
      if (RV?.fps) { const fps = await Promise.all(vids.map((v) => frameRate(path.join(DATA_DIR, v)))); r.refVideoFps = fps;
        if (fps.some((x) => x > 0 && (x < RV.fps![0] - 0.01 || x > RV.fps![1] + 0.01))) return bad('refVideos', `Reference videos must run at ${RV.fps[0]}–${RV.fps[1]} frames per second for this model.`, 'unsupported'); } }
    r.refVideoSeconds = refVideoSeconds;
    if (auds.length) { const secs = await Promise.all(auds.map((a) => audioSeconds(path.join(DATA_DIR, a)))); r.refAudioSecondsEach = secs.map((x) => Math.round(x * 100) / 100); const RA = L.refAudioSeconds;
      if (secs.some((x) => !(x > 0))) return bad('refAudios', 'Could not read a reference audio clip\'s length.', 'unreadable');
      const tot = Math.round(secs.reduce((a, b) => a + b, 0) * 100) / 100; r.refAudioSeconds = tot;
      if (RA && secs.some((x) => x < RA.minEach)) return bad('refAudios', `Each reference audio clip must be at least ${RA.minEach} s.`, 'too_short');
      if (RA?.maxEach && secs.some((x) => x > RA.maxEach!)) return bad('refAudios', `Each reference audio clip can be at most ${RA.maxEach} s.`, 'too_long');
      if (RA && tot > RA.maxTotal) return bad('refAudios', `Reference audio totals ${tot} s; this model allows ${RA.maxTotal} s in total.`, 'too_long'); }
    if (fields.videoPreset) { const vp: any = videoPresetById(fields.videoPreset); if (!vp) return bad('videoPreset', `Unknown video preset ${fields.videoPreset} (GET /api/video-presets).`);
      const pr = vp.kind === 'camera' && fields.intensity === 'aggressive' ? vp.prompt.replace('slow, smooth', 'fast, aggressive') : vp.prompt; r.finalPrompt = [r.finalPrompt ?? r.prompt, pr].filter(Boolean).join('. '); r.videoPreset = vp.id; }
    Object.assign(r, { aspect, audio, audioOff: L.audio.off, bitrate, refVideoPaths: vids.map((v) => path.join(DATA_DIR, v)), refVideoUrls: vids.map((v) => `/files/${v}`), refAudioPaths: auds.map((a) => path.join(DATA_DIR, a)), refAudioUrls: auds.map((a) => `/files/${a}`) });
  }
  /* Loop (2026-10-26, field loop=1): a model whose caps say loop (LTX-2.5 22B local) with a start frame only; the clip ends on its first frame
   * and the repeated frame is cut (comfy/ltx25Video.ts). Off / not sent = nothing changes. */
  const loop = /^(1|true|on|yes)$/i.test(String(fields.loop ?? ''));
  if (loop) { if (!L?.loop) return bad('loop', 'Loop runs on LTX-2.5 22B (local). Pick it, or turn Loop off.', 'unsupported');
    if (r.mode !== 'i2v') return bad('loop', r.mode === 'flf' ? 'Loop starts and ends on your start frame: remove the end frame, or turn Loop off.' : 'Loop needs a start frame: add a photo, or turn Loop off.', r.mode === 'flf' ? 'unsupported' : 'required');
    const withLoop = (t: string) => (String(t ?? '').trim() ? `${String(t).trim().replace(/[.!?]*$/, '.')} ${LTX25_LOOP_WORDS}` : LTX25_LOOP_WORDS);
    r.loop = true; r.finalPrompt = withLoop(r.finalPrompt ?? r.prompt); if (r.enhancedPrompt) r.enhancedPrompt = withLoop(r.enhancedPrompt); }
  if (prov === LTX25_VIDEO) { // DFR (shared/ltxDfr.ts): image to video only; asked elsewhere it runs at 720p with a note (never refused)
    const dn = ltxDfrAdjustNote({ ...r, loop }); if (dn) { r.resolution = '720p'; r.adjustNote = dn; }
    if (ltxDfrRuns({ ...r, loop })) { const smooth = ltxDfrSmooth(fields); const frames = ltxDfrFrames(Number(r.duration) || 5);
      return { ...r, quality: q, [LTX_DFR_SMOOTH_FIELD]: smooth, steps: smooth ? 15 : 11 /* 8 + 3 (+ 4) fixed DFR steps */, frames: smooth ? (frames - 1) * 2 + 1 : frames, fps: smooth ? LTX_DFR_FPS * 2 : LTX_DFR_FPS, audio: r.audio ?? true }; }
    const frames = ltxVideoFrames(Number(r.duration) || 3); return { ...r, quality: q, steps: 11 /* 8 + 3 distilled sigmas, fixed */, frames: loop ? frames - 1 : frames, fps: LTX25_FPS, audio: r.audio ?? true }; } // its own sound; never keepAudio:false (runNative would strip it)
  if (prov === 'comfy-wan22-5b') return { ...r, quality: q, steps: WAN22_5B_STEPS[q], frames: wanFrames(Number(r.duration) || 2), fps: 24, audio: false }; // Wan grid 4n+1 at 24 fps
  return { ...r, quality: q, steps: H3_QUALITY[q].steps, frames: h3Frames(Number(r.duration) || 6), audio: r.audio ?? true };
};
(h3VideoTool as any).app = { ...(h3VideoTool as any).app, resolutionsByProvider: Object.fromEntries(Object.entries(VIDEO_LIMITS).map(([k, v]) => [k, v.resolutions])), defaultResolutionByProvider: Object.fromEntries(Object.entries(VIDEO_LIMITS).map(([k, v]) => [k, v.resolutions[0]])), videoLimits: Object.fromEntries(Object.entries(VIDEO_LIMITS).map(([k, v]) => [k, videoCapsBlock(v)])), /* slow local models (startShort: Wan 2.2 5B) open at their short default when picked; the others keep the length in use */ defaultDurationByProvider: Object.fromEntries(Object.entries(VIDEO_LIMITS).filter(([, v]) => v.startShort).map(([k, v]) => [k, defaultSecondsFor(v)])), aspects: [...VIDEO_ASPECTS], bitrates: BITRATES.map(({ value, label }) => ({ value, label })), audio: true, audioBadge: 'Audio on', lastFrameModes: ['flf'], quality: Object.entries(H3_QUALITY).map(([value, v]) => ({ value, label: v.label, steps: v.steps })) };

// Voice → Talking photo: `image` (portrait) + `speech` (2–15 s audio; voiceAudio accepted too). Output = video with the speech as soundtrack.
// LTX-2.5 lip sync (2026-10-26, comfy-ltx25-lipsync): the photo is optional (text only works), the length follows the speech (≤ 4.7 s locally), Draft / Sharper.
voiceStudioTool.inputs.push({ name: 'image', kind: 'file', accept: 'image/png,image/jpeg,image/webp', requiredByProvider: { 'comfy-h3-lipsync': true, [LTX25_LIPSYNC]: false, [IT_PROVIDER]: true /* InfiniteTalk · Comfy Cloud (2026-10-27) */ } } as any, { name: 'speech', kind: 'file', accept: 'audio/*' });
{ const ri: any = voiceStudioTool.inputs.find((i: any) => i.name === 'resolution'); if (ri) { ri.byProvider = { ...(ri.byProvider ?? {}), [LTX25_LIPSYNC]: ['448p', '576p'] }; ri.choices = [...(ri.choices ?? []), { value: '448p', label: 'Draft' }, { value: '576p', label: 'Sharper' }]; } }
(voiceStudioTool as any).app = { ...(voiceStudioTool as any).app, resolutionsByProvider: { ...((voiceStudioTool as any).app?.resolutionsByProvider ?? {}), [LTX25_LIPSYNC]: ['448p', '576p'] } }; // the quote / submit allowlist (shared/enumParams.ts)
voiceStudioTool.inputs.push({ name: 'aspect', kind: 'select', options: ['auto', '16:9', '9:16', '1:1'], byProvider: { [IT_PROVIDER]: ['auto', '16:9', '9:16', '1:1'] }, description: 'Lip Sync on InfiniteTalk: the video\'s shape (auto = the photo\'s). No default: other models keep their own.' } as any);
/* Talking Video (2026-10-27, shared/talkingVideo.ts): split=1 lets InfiniteTalk take speech up to 5 minutes in parts; script = the words the app voices first */
voiceStudioTool.inputs.push({ name: 'split', kind: 'select', options: ['0', '1'], byProvider: { [IT_PROVIDER]: ['0', '1'] }, description: 'Lip Sync on InfiniteTalk: 1 = speech over 60 s (up to 5 minutes) runs in parts of up to 55 s cut at pauses, joined with soft cuts.' } as any,
  { name: 'script', kind: 'text', maxLength: 2000, description: 'Lip Sync on InfiniteTalk: the words to say. The app voices them first (voice tool, Voiceover) and sends that audio as speech.' } as any);
const voiceParse = voiceStudioTool.parseInput.bind(voiceStudioTool);
voiceStudioTool.parseInput = async (fields, files) => {
  let types: string[] = []; try { types = JSON.parse(fields.types || '[]'); } catch { types = (fields.types || '').split(','); }
  if (String(types[0] ?? '').trim() !== 'lipsync') return voiceParse(fields, files);
  const img = files.image?.[0]; const sp = files.speech?.[0] ?? files.voiceAudio?.[0];
  if ((fields.provider || '') === LTX25_LIPSYNC) return ltxLipsyncParse(fields, img, sp);
  if ((fields.provider || '') === IT_PROVIDER) return infiniteTalkParse(fields, img, sp); // InfiniteTalk (Wan 2.1) · Comfy Cloud: up to 60 s (tools/voice/infiniteTalk.ts)
  if (!img) return bad('image', 'Talking photo needs a portrait (field image, PNG/JPG).', 'required');
  if (!/\.(png|jpe?g)$/i.test(img)) return bad('image', 'Portrait: use PNG or JPG.', 'format');
  if (!sp) return bad('speech', 'Talking photo needs the speech audio (field speech, 2–15 s).', 'required');
  const secs = await audioSeconds(path.join(DATA_DIR, sp));
  if (secs && secs < 2) return bad('speech', 'Speech is too short: at least 2 seconds.', 'too_short');
  const duration = Math.min(15, Math.max(2, Math.round(secs || 5)));
  const provider = fields.provider || 'comfy-h3-lipsync'; const prompt = (fields.prompt || '').slice(0, 2000);
  if (provider !== 'comfy-h3-lipsync') return bad('provider', `Talking photo runs on MiniMax H3 (comfy-h3-lipsync or its cloud routes) or LTX-2.5 (${LTX25_LIPSYNC}, local).`);
  return attachVoiceControls({ types: ['lipsync'], mode: 'lipsync', outKind: 'av-video', prompt, finalPrompt: `Image 1 speaks the words of Audio 1 with natural lip sync.${prompt ? ` ${prompt}` : ''}`, resolution: fields.resolution === '480p' ? '480p' : '768p', aspect: fields.aspect ?? '9:16',
    duration, outputDuration: duration, frames: h3Frames(duration), trimmedSpeech: secs > 15, ...(secs ? { speechSeconds: Math.round(secs * 100) / 100 } : {}) /* the Router route refuses speech over 15 s (it can't trim) */, seed: Number.isInteger(Number(fields.seed)) && fields.seed ? Number(fields.seed) : undefined,
    imagePath: path.join(DATA_DIR, img), imageUrl: `/files/${img}`, refPaths: [path.join(DATA_DIR, img)], refUrls: [`/files/${img}`], speechPath: path.join(DATA_DIR, sp), speechUrl: `/files/${sp}`,
    warnings: secs > 15 ? ['Speech longer than 15 s: only the first 15 s are used.'] : [], draft: false, n: 1, target: '' }, fields, provider) /* volume / sampleRate post on the video's audio; speed+pitch 400 (sync) */;
};
/** Talking photo on LTX-2.5 (local, free): photo optional, speech required, prompt optional; the speech is prepared here (audio/lipDriver.ts:
 *  the processed driver + the clean soundtrack, same timing) so the plan only points the graph at two files. Field lipFix=0 turns the
 *  QuokkaiLab driver off (plain speech conditions the model) for an A/B. */
async function ltxLipsyncParse(fields: Record<string, string>, img: string | undefined, sp: string | undefined) {
  if (img && !/\.(png|jpe?g|webp)$/i.test(img)) return bad('image', 'Photo: use PNG, JPG or WEBP.', 'format');
  if (!sp) return bad('speech', `Talking photo needs the speech audio (field speech, up to about ${LIP_MAX_SECONDS} s on LTX-2.5).`, 'required');
  const resolution = fields.resolution || '448p'; if (!['448p', '576p'].includes(resolution)) return bad('resolution', 'Resolution must be 448p (Draft) or 576p (Sharper) on LTX-2.5.', 'unsupported');
  const aspect = fields.aspect || 'auto'; if (!['auto', '16:9', '9:16', '1:1'].includes(aspect)) return bad('aspect', 'Aspect must be auto, 16:9, 9:16 or 1:1 on LTX-2.5.', 'unsupported');
  const fix = !/^(0|false|off|no)$/i.test(String(fields.lipFix ?? '')); const prompt = (fields.prompt || '').slice(0, 2000);
  let la: Awaited<ReturnType<typeof prepareLipAudio>>;
  try { la = await prepareLipAudio(path.join(DATA_DIR, sp), DATA_DIR, { fix }); }
  catch (e: any) { return /No speech/.test(String(e?.message)) ? bad('speech', 'No speech found: the clip is silent or very quiet (nothing above −40 dBFS).', 'no_speech') : bad('speech', 'Could not read the speech audio. Use WAV, MP3 or M4A.', 'unreadable'); }
  const t = la.timing; const rel = (p: string) => path.relative(DATA_DIR, p);
  return attachVoiceControls({ types: ['lipsync'], mode: 'lipsync', outKind: 'av-video', prompt, finalPrompt: lipsyncPrompt(prompt), resolution, aspect,
    duration: Math.round(t.seconds * 100) / 100, outputDuration: Math.round(t.seconds * 100) / 100, frames: t.frames, fps: LTX25_FPS, steps: 11, trimmedSpeech: !!t.cappedFrom, lipFix: fix,
    lip: { frames: t.frames, seconds: t.seconds, audioSeconds: t.audioSeconds, speechSeconds: t.speechSeconds, speechStart: t.before, trimmedLeading: t.trimmedLeading, trimmedTrailing: t.trimmedTrailing, ...(t.cappedFrom ? { cappedFrom: t.cappedFrom } : {}) },
    seed: Number.isInteger(Number(fields.seed)) && fields.seed ? Number(fields.seed) : undefined,
    ...(img ? { imagePath: path.join(DATA_DIR, img), imageUrl: `/files/${img}`, refPaths: [path.join(DATA_DIR, img)], refUrls: [`/files/${img}`] } : { refPaths: [], refUrls: [] }),
    speechPath: path.join(DATA_DIR, sp), speechUrl: `/files/${sp}`, lipDriverPath: la.driverPath, lipDriverUrl: `/files/${rel(la.driverPath)}`, lipCleanPath: la.cleanPath, lipCleanUrl: `/files/${rel(la.cleanPath)}`,
    warnings: la.warnings, draft: false, n: 1, target: '' }, fields, LTX25_LIPSYNC);
}
const voiceRun = voiceStudioTool.run.bind(voiceStudioTool);
voiceStudioTool.run = (job) => (job.input.mode === 'lipsync' ? mockRun(job, [['uploading', 'Uploading'], ['encoding', 'Reading portrait + speech'], ['rendering', 'Rendering talking video'], ['muxing', 'Muxing speech']], ['Talking photo'], 6000) : voiceRun(job));

// Extend (+5 s / +10 s): new tool, opened from the result view's Extend buttons.
export const h3ExtendTool: ToolDef = {
  id: 'h3-extend', name: 'Extend', category: 'Video', ui: 'app', route: '/tools/h3-extend', status: 'new',
  description: 'Keep a clip going from its last frame, sound and all. Add a few seconds at a time, free on your computer or in the cloud.',
  inputs: [{ name: 'video', kind: 'file', required: true, accept: 'video/mp4,video/quicktime,video/webm' }, { name: 'prompt', kind: 'text' },
    { name: 'extendSeconds', kind: 'select', options: H3_EXTEND_SECONDS.map(String), default: '5', byProvider: { [LTX25_EXTEND]: LTX25_EXTEND_SECONDS.map(String), 'comfy-h3-extend': H3X_PAGE_SECONDS.map(String) /* H3 Extend · Comfy Cloud takes 2–14 s; the other H3 places +5 / +8 / +10 (each place says what it takes) */ } } as any,
    { name: 'resolution', kind: 'select', options: [...H3_EXTEND_RES], default: '768p', byProvider: { [LTX25_EXTEND]: [...LTX25_EXTEND_RESOLUTIONS] }, choices: LTX25_EXTEND_RESOLUTIONS.map((r) => ({ value: r, label: LTX25_EXTEND_RES_LABELS[r] })) } as any,
    /* LTX-2.5 only (API): how many of the source's last frames guide the continuation (1 = the exact last frame) and the crossfade over them */
    { name: 'guideFrames', kind: 'select', options: LTX25_EXTEND_GUIDES.map(String), default: '9' } as any, { name: 'crossfade', kind: 'number', default: '4' } as any,
    /* LTX-2.5 on Comfy Cloud (2026-10-27): 'continue' (default there) keeps the last ~5 s of picture and sound and makes only the new seconds; 'guide' = the last-frames method (this computer's only one) */
    { name: 'extendMethod', kind: 'select', options: [...LTX25_EXTEND_METHODS] } as any,
    /* H3 Extend · Comfy Cloud (2026-10-27): an optional character photo passed to every segment as <Picture 1> (carried over from the clip's own job
       when it had one; characterOff=1 drops it) */
    { name: 'character', kind: 'file', accept: 'image/png,image/jpeg,image/webp' } as any,
    { name: 'seed', kind: 'number' }],
  presets: [], workflows: ['h3-extend-api.json'], model: 'MiniMax H3 FL2VA (continuation)',
  gpuSecPerSec: { '480p': 30, '768p': 30 }, stages: [['uploading', 'Uploading'], ['encoding', 'Reading the clip ending'], ['rendering', 'Rendering continuation + audio'], ['muxing', 'Encoding']],
  providers: [LTX25_EXTEND /* LTX-2.5 22B: free local, from the last frames, joined (2026-10-26) */, 'comfy-h3-extend'],
  app: { input: 'video', extendSeconds: [...H3_EXTEND_SECONDS], extendSecondsByProvider: { [LTX25_EXTEND]: [...LTX25_EXTEND_SECONDS], 'comfy-h3-extend': [...H3X_PAGE_SECONDS] }, audio: true, audioBadge: 'Audio on', resolutions: [...H3_EXTEND_RES],
    resolutionsByProvider: { [LTX25_EXTEND]: [...LTX25_EXTEND_RESOLUTIONS], 'comfy-h3-extend': [...H3_EXTEND_RES] }, defaultResolutionByProvider: { [LTX25_EXTEND]: '448p', 'comfy-h3-extend': '768p' /* the parse's default below; the quote and the Edit Video menu read these (quote = charge) */ },
    videoLimits: { [LTX25_EXTEND]: { resolutionLabels: { ...LTX25_EXTEND_RES_LABELS } } },
    /* which model takes which extra setting (2026-10-28: the Canvas Extend card shows and sends them per model): the method, guide frames and
       crossfade are LTX-2.5's; LTX-2.5 extends forward only (its parse refuses backward) */
    inputsOnlyFor: { extendMethod: [LTX25_EXTEND], guideFrames: [LTX25_EXTEND], crossfade: [LTX25_EXTEND] }, directionsByProvider: { [LTX25_EXTEND]: ['forward', 'sequel', 'camera-pull'] } },
  async parseInput(fields, files) {
    if ((fields.provider || '') === LTX25_EXTEND) return ltxExtendParse(fields, files);
    // +5 / +8 / +10 on every H3 place; H3 Extend · Comfy Cloud also takes 2–14 s (each route refuses the lengths it can't make: unavailableFor)
    const add = Number(fields.extendSeconds || 5); if (!(H3_EXTEND_SECONDS as readonly number[]).includes(add) && !(H3X_SECONDS_LIST as readonly number[]).includes(add)) return bad('extendSeconds', `Extend by ${H3X_SECONDS.min}–${H3X_SECONDS.max} seconds.`);
    // Prompt optional (Design Planner). fal minimax/h3-max/extend-video marks `prompt` required (API tab, 2026-10-17), so an empty prompt sends a neutral default.
    const userPrompt = (fields.prompt || '').trim(); const prompt = userPrompt || H3_EXTEND_DEFAULT_PROMPT;
    // H3 renders 768p or 480p (app.resolutions). parseCommon only knows 480p/720p/1080p, so it gets 480p and we keep our own value.
    if (fields.resolution && !H3_EXTEND_RES.includes(fields.resolution)) return bad('resolution', `Resolution must be one of ${H3_EXTEND_RES.join(', ')}.`);
    const res = fields.resolution === '480p' ? '480p' : '768p';
    const c: any = await parseCommon({ ...fields, prompt, resolution: '480p' }, files, { refsRequired: false, maxRefs: 0, minSec: 1 /* via last frame takes any clip; the local graph and fal need 4 s (their routes say so: cloud.ts h3ClassicExtendIssue) */ }); if ('error' in c) return c;
    if (c.duration > 60) return bad('video', 'Extend takes clips up to 60 s.', 'too_long');
    const character = await h3xCharacterFor(fields, files); if (character && 'error' in character) return character.error;
    return { ...c, ...(character ? character : {}), mode: 'extend', types: ['extend'], prompt, finalPrompt: prompt, promptDefaulted: !userPrompt, extendSeconds: add, duration: add, outputDuration: add, sourceSeconds: c.duration, frames: h3Frames(add), resolution: res, outKind: 'av-video', target: '' };
  },
  run: (job) => (job.provider === LTX25_EXTEND ? ltxExtendSampleRun(job) : mockRun(job, h3ExtendTool.stages, [`+${job.input.extendSeconds}s`], 5000)),
  /** P0 (BUG-HUNT-7): what parseInput always sets, for the shared route resolver (routing/select.ts resolveRoute): mode extend (the fal
   *  extend-video route serves only that mode), duration = extendSeconds (default 5), resolution 768p or 480p. Quote and submit now agree. */
  routeInput: (i: Record<string, any>) => (i.ltxExtend || /^(448|576|720)p$/.test(String(i.resolution ?? '')) || ((LTX25_EXTEND_SECONDS as readonly number[]).includes(Number(i.extendSeconds)) && !/^(768|480)p$/.test(String(i.resolution ?? '')) && i.provider !== 'comfy-h3-extend') /* an H3 job (768p / 480p) keeps its own lengths: H3 Extend · Comfy Cloud adds 2–14 s */
    ? { mode: 'extend', types: ['extend'], duration: Number(i.extendSeconds) || LTX25_EXTEND_DEFAULT_SECONDS, resolution: /^(448|576|720)p$/.test(String(i.resolution ?? '')) ? i.resolution : '448p', ...(i.extendMethod ? { extendMethod: i.extendMethod } : {}) } // LTX-2.5 lengths / tiers
    : { mode: 'extend', types: ['extend'], duration: (H3_EXTEND_SECONDS as readonly number[]).includes(Number(i.extendSeconds)) || (H3X_SECONDS_LIST as readonly number[]).includes(Number(i.extendSeconds)) ? Number(i.extendSeconds) : 5, resolution: i.resolution === '480p' ? '480p' : '768p' }),
} as ToolDef;

// Our final encode (bitrate, audio off) on every Generate Video result: local/router runs (tool.run) and fal/Replicate runs (routedPost).
const h3VideoRun = h3VideoTool.run.bind(h3VideoTool);
h3VideoTool.run = async (job) => { await h3VideoRun(job); if (job.status === 'done') await postEncode(job as any); };
(h3VideoTool as any).routedPost = async (job: any) => { if (job.status === 'done' || job.outputs?.length) await postEncode(job); };

/** Extend on LTX-2.5 (local, free; comfy/ltx25Extend.ts): conform the source (24 fps, its size, its sound), count its frames, write the guide
 *  (its last frames), plan the pass. The conformed copy is the job's source (videoPath) and the before / after compare's "before". Any length up to
 *  the 60 s total (an LTX clip is 2–5 s), so the H3 4–30 s source rule doesn't apply here (ownLimits). Backward isn't offered (forward only). */
async function ltxExtendParse(fields: Record<string, string>, files: Record<string, string[]>) {
  const vf = files.video?.[0]; if (!vf) return bad('video', 'Add the clip to extend.', 'required');
  if (/\.(png|jpe?g|webp|gif)$/i.test(vf)) return bad('video', 'Extend takes a video clip, not a photo.', 'format');
  if (fields.direction === 'backward') return bad('direction', 'LTX-2.5 extends forward from the last frame. Pick Forward, Sequel or Camera pull.', 'unsupported');
  const src = path.join(DATA_DIR, vf); const p = await probe(src);
  if (!p || !(p.width > 0)) return bad('video', 'That clip could not be read. Re-export it as MP4 (H.264) and try again.', 'unreadable');
  if (Math.min(p.width, p.height) < 128) return bad('video', `That clip is too small (${p.width}×${p.height}); use one at least 128 px on its short side.`, 'too_small');
  if (p.duration > 60) return bad('video', 'Extend takes clips up to 60 s.', 'too_long');
  // the cheap checks first (nothing written for a bad field)
  const pre = extendPlan({ width: p.width, height: p.height, frames: 999 }, { seconds: fields.extendSeconds, resolution: fields.resolution, guideFrames: fields.guideFrames, crossfade: fields.extendMethod === 'continue' ? undefined : fields.crossfade });
  if ('error' in pre) return bad(pre.field, pre.error, pre.field === 'extendSeconds' ? 'invalid_duration' : 'invalid');
  const id = `ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; const name = `${id}-source.mp4`; const conformed = path.join(DATA_DIR, name);
  if ((await runFfmpeg(conformExtendSourceArgs(src, conformed, { width: p.width, height: p.height, hasAudio: p.hasAudio, seconds: p.duration }))) !== 0) return bad('video', 'That clip could not be prepared for the model. Try another clip.', 'format');
  const N = await countFrames(conformed); if (!N) return bad('video', 'That clip has no frames to continue from.', 'unreadable');
  const plan = extendPlan({ width: p.width, height: p.height, frames: N }, { seconds: fields.extendSeconds, resolution: fields.resolution, guideFrames: fields.guideFrames, crossfade: fields.extendMethod === 'continue' ? undefined : fields.crossfade });
  if ('error' in plan) return bad(plan.field, plan.error, plan.field === 'video' ? 'too_long' : 'invalid');
  const gName = `${id}-guide.${plan.guideFrames === 1 ? 'png' : 'mp4'}`; const guidePath = path.join(DATA_DIR, gName);
  if ((await runFfmpeg(guideArgs(conformed, guidePath, N, plan.guideFrames))) !== 0) return bad('video', 'Could not read the last frames of that clip. Try another clip.', 'format');
  // Picture-and-sound continuation (Comfy Cloud's default, 2026-10-27): the last ~5 s of the conformed clip as a picture clip + a WAV of its sound. Cheap
  // (ffmpeg, no model); written for every LTX job so the Comfy Cloud place can use it. The local place keeps the last-frames guide.
  const method = fields.extendMethod == null || fields.extendMethod === '' ? undefined : String(fields.extendMethod);
  if (method && !(LTX25_EXTEND_METHODS as readonly string[]).includes(method)) return bad('extendMethod', `extendMethod must be ${LTX25_EXTEND_METHODS.join(' or ')}.`, 'invalid');
  const cp = continuePlan({ width: p.width, height: p.height, frames: N }, { seconds: fields.extendSeconds, resolution: fields.resolution, crossfade: method === 'continue' ? fields.crossfade : undefined });
  let context: { contextPath: string; contextUrl: string; contextAudioPath: string; continuePlan: any } | { continueError: string } = { continueError: 'error' in cp ? cp.error : '' };
  if (!('error' in cp)) {
    const cv = `${id}-context.mp4`, ca = `${id}-context.wav`;
    if ((await runFfmpeg(contextVideoArgs(conformed, path.join(DATA_DIR, cv), N, cp.guideFrames))) !== 0 || (await runFfmpeg(contextAudioArgs(conformed, path.join(DATA_DIR, ca), N, cp.guideFrames))) !== 0)
      context = { continueError: 'Could not read the last seconds of that clip for the continuation.' };
    else context = { contextPath: path.join(DATA_DIR, cv), contextUrl: `/files/${cv}`, contextAudioPath: path.join(DATA_DIR, ca), continuePlan: cp };
  } else if (method === 'continue') return bad(cp.field === 'crossfade' ? 'crossfade' : 'extendMethod', cp.error, 'invalid');
  const user = String(fields.prompt ?? '').trim(); const prompt = extendPrompt(user);
  const seedIn = Number(fields.seed); const seed = fields.seed != null && fields.seed !== '' && Number.isInteger(seedIn) && seedIn >= 0 ? seedIn : undefined;
  const warnings: string[] = [];
  if (Number(fields.guideFrames || 9) > plan.guideFrames) warnings.push(`That clip is only ${N} frames, so ${plan.guideFrames === 1 ? 'its last frame guides' : `its last ${plan.guideFrames} frames guide`} the continuation.`);
  if (plan.gen.width < plan.out.width) warnings.push(`Rendered at ${plan.gen.width}×${plan.gen.height} (${LTX25_EXTEND_RES_LABELS[plan.resolution]}) and scaled to your clip's ${plan.out.width}×${plan.out.height}.`);
  return { mode: 'extend', types: ['extend'], outKind: 'av-video', prompt, finalPrompt: prompt, promptDefaulted: !user, extendSeconds: plan.seconds, duration: plan.seconds, outputDuration: plan.out.seconds,
    sourceSeconds: Math.round(p.duration * 100) / 100, frames: plan.gen.frames, fps: plan.fps, resolution: plan.resolution, width: plan.out.width, height: plan.out.height, seed, steps: 11,
    videoPath: conformed, videoUrl: `/files/${name}`, compareUrl: `/files/${name}`, originalVideoUrl: `/files/${vf}`, sourceHadAudio: p.hasAudio, hasAudio: true, ownLimits: true,
    ...(method ? { extendMethod: method } : {}), ...(fields.guideFrames ? { guideFrames: Number(fields.guideFrames) } : {}) /* as asked (the Cloud price reads it) */, ltxExtend: { plan, guidePath, guideUrl: `/files/${gName}`, modelName: 'LTX-2.5 22B', ...context }, refPaths: [], refUrls: [], warnings, draft: false, n: 1, target: '' } as any;
}
/** Mock backend: a clearly labelled sample (the last frames held with a slow push-in, silent) joined onto the clip with the REAL join, so the page,
 *  the before / after and the sound continuity can be tried without the model. Never presented as a model result. */
async function ltxExtendSampleRun(job: any) {
  const x = job.input.ltxExtend; const plan = x?.plan;
  await mockRun(job, h3ExtendTool.stages, [plan ? `+${plan.seconds} s (${plan.out.seconds.toFixed(1)} s total, sample)` : `+${job.input.extendSeconds} s (sample)`], 5000);
  if (job.status !== 'done' || !job.outputs?.[0] || !plan) return;
  const outFile = path.join(DATA_DIR, job.outputs[0].url.slice('/files/'.length)).replace(/\.[a-z0-9]+$/i, '.mp4'); const gen = path.join(DATA_DIR, `${job.id}-extend-sample-gen.mp4`);
  try {
    if ((await runFfmpeg(sampleGenArgs(job.input.videoPath, gen, plan))) !== 0) throw new Error('sample clip');
    await joinExtension(job.input.videoPath, gen, outFile, plan, { audio: job.input.audio !== false });
    job.outputs[0] = { ...job.outputs[0], url: `/files/${path.basename(outFile)}`, width: plan.out.width, height: plan.out.height }; job.resultUrl = job.outputs[0].url;
  } catch { job.status = 'failed'; job.errorType = 'temporary'; job.error = 'The sample could not be made. Nothing was charged.'; }
}

/** H3 Extend · Comfy Cloud: the character photo for this segment. An uploaded `character` image wins; else the photo of the job the clip came from
 *  (parentId: an earlier H3 Extend segment's characterPath, or the identity photo of an H3 job: Character Swap's character, Generate Video's
 *  references), so a chain keeps the same face without re-adding it. characterOff=1 runs without one. Other places ignore it. */
async function h3xCharacterFor(fields: Record<string, string>, files: Record<string, string[]>): Promise<{ characterPath: string; characterUrl: string; characterFrom: string } | { error: any } | null> {
  const up = files.character?.[0];
  if (up) { if (!/\.(png|jpe?g|webp)$/i.test(up)) return { error: bad('character', 'The character photo must be a PNG, JPEG or WebP image.', 'format') };
    return { characterPath: path.join(DATA_DIR, up), characterUrl: `/files/${up}`, characterFrom: 'upload' }; }
  if (/^(1|true|on|yes)$/i.test(fields.characterOff ?? '') || !fields.parentId) return null;
  try {
    const { jobs } = await import('../../jobs.js'); const { existsSync } = await import('node:fs'); const p: any = jobs.get(fields.parentId); const i = p?.input ?? {};
    const own = typeof i.characterPath === 'string' ? i.characterPath : null;
    const h3 = /h3/.test(String(p?.provider ?? '')) && ['object-swap', 'motion-transfer', 'h3-video'].includes(String(p?.toolId)) && (p?.toolId !== 'h3-video' || i.mode === 'r2v') ? i.refPaths?.[0] ?? null : null;
    const f = own ?? h3; if (!f || !existsSync(f)) return null;
    return { characterPath: f, characterUrl: typeof i.characterUrl === 'string' && own ? i.characterUrl : `/files/${path.basename(f)}`, characterFrom: p.id };
  } catch { return null; }
}

/** Neutral continuation used when Extend gets no prompt (fal requires one). */
export const H3_EXTEND_DEFAULT_PROMPT = 'The scene continues naturally from the last moment, same subject, setting, lighting and camera style.';
