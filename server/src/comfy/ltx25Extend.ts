/**
 * LTX-2.5 Extend (provider comfy-ltx25-extend, tool h3-extend "Extend", 2026-10-26): continue any clip from its last frames, free on this computer.
 *
 * How it works (one pass of the SAME graph as Generate Video's image to video: workflows/ltx25-ti2v-api.json, official template video_ltx2_5_i2v):
 *  1 parseInput conforms the source with ffmpeg (24 fps, its own size rounded to even, its sound kept as AAC, a silent track when it has none) and
 *    counts its frames exactly (N). It writes the guide: the source's last G frames (default 9) as a short clip, or the exact last frame as a PNG (G = 1).
 *  2 The graph: the guide goes where the start frame goes (ImageScale → LTXVPreprocess → LTXVImgToVideoInplace on both stages). With G = 9 the
 *    in-place node encodes the 9 frames into the first 2 latent frames (core LTXVImgToVideoInplace encodes a whole batch: comfy_extras/nodes_lt.py),
 *    so the model sees the motion of the last 0.375 s, not one still. Total frames = G + 24 × seconds, which stays on LTX's 8n + 1 grid
 *    (9 + 48 = 57 for +2 s). Core LoadVideo → GetVideoComponents read the guide clip. Colour match: core ColorTransfer (reinhard_lab, target_frame =
 *    the generated copy of the source's last frame, reference = the source's last frame) takes the colour shift back on every generated frame.
 *  3 The join (runNative post `extend`, ffmpeg): the generated copy of the guide frames is dropped (so the source's last frame is never shown twice),
 *    the last X (default 4) source frames crossfade into the generated copies of those same frames (a true overlap, so the length does not change),
 *    and the sound continues: the source's sound UNTOUCHED to the cut, then the new clip's LTX sound from the cut, loudness-matched to the source's
 *    last 2 s (one gain, peak-safe), with a 20 ms de-click after the cut (the source's mirrored last 20 ms fade into the new sound).
 *    Result = N + 24 × seconds frames at 24 fps, sound exactly as long as the picture, at the source's size (the extension is scaled to it).
 * Chaining ("keep going"): extend the result again; each pass adds 2–5 s, up to 60 s in total.
 * Why 9 guide frames (G): one still lets the model restart the motion (a visible "hitch" at the cut); 9 frames carry speed and direction. 17 is
 * accepted (more motion memory, a little slower). G = 1 (exact last frame) is the fallback and the only choice for a source under 9 frames.
 * Stage strengths stay the template's (0.7 on the half-size stage, 1.0 on the full-size stage).
 * Pure helpers (sizes, frames, graph patch, ffmpeg argument lists) are tested without ComfyUI; joinExtension runs ffmpeg.
 */
import { spawn } from 'node:child_process';
import { runFfmpeg, countFrames } from '../ffmpeg.js';
import { frameIndexArgs } from '../videoFrame.js';

export const LTX25_EXTEND = 'comfy-ltx25-extend';
export const LTX25_EXTEND_WORKFLOW = 'ltx25-ti2v-api.json';
export const LTX25_EXTEND_FPS = 24;
export const LTX25_EXTEND_SECONDS = [2, 3, 4, 5] as const;
export const LTX25_EXTEND_DEFAULT_SECONDS = 2;
/** 448p (Draft) and 576p (Sharper) run on this computer or on Comfy Cloud; 720p (2026-10-27) is Comfy Cloud only, so a 1280×720 clip keeps its size. */
export const LTX25_EXTEND_RESOLUTIONS = ['448p', '576p', '720p'] as const;
export const LTX25_EXTEND_LOCAL_RESOLUTIONS = ['448p', '576p'] as const;
export const LTX25_EXTEND_RES_LABELS: Record<string, string> = { '448p': 'Draft', '576p': 'Sharper', '720p': '720p' };
/** Guide frames from the end of the source: 1 = the exact last frame; 9 (default) or 17 = the last frames, so motion carries over. */
export const LTX25_EXTEND_GUIDES = [1, 9, 17] as const;
export const LTX25_EXTEND_DEFAULT_GUIDES = 9;
/** Picture crossfade (frames) over the overlap; at most the guide length and 6. */
export const LTX25_EXTEND_DEFAULT_XFADE = 4; export const LTX25_EXTEND_MAX_XFADE = 6;
/** Sound de-click at the cut (seconds), AFTER the cut (joinArgs): the source plays untouched to the edit, then its mirrored last few ms fade into the
 *  new sound. 0.1 s until 2026-10-27; the model's copy of the overlap is not the source's sound, so a long blend only smeared two sounds together. */
export const LTX25_EXTEND_AUDIO_XFADE = 0.02;
/** Loudness match of the new sound (2026-10-27, the painter-clip report: the new seconds came out 4–8 dB louder than the source's quiet end).
 *  The new seconds get one gain so their RMS equals the source's last MATCH_SECONDS (the whole source when that tail is near silence), within
 *  GAIN_RANGE, and never above the PEAK_CEILING (no clipping, no limiter, so nothing is delayed). A silent source or silent new sound: no change. */
export const LTX25_EXTEND_MATCH_SECONDS = 2;
export const LTX25_EXTEND_GAIN_RANGE = [-30, 12] as const;
export const LTX25_EXTEND_PEAK_CEILING = -1;
export const LTX25_EXTEND_SILENT_DB = -60;
/** Longest result a chain may reach. */
export const LTX25_EXTEND_MAX_TOTAL = 60;
export const LTX25_EXTEND_DEFAULT_PROMPT = 'The shot continues from this exact moment: the same action keeps going with the same camera movement, lighting and sound.';
/** Pixel budget per tier: Draft = 768×448, Sharper = 1024×576 (the sizes of Generate Video on LTX-2.5), 720p = 1280×720 (renders 1280×704 on the 64 grid). */
const BUDGET: Record<string, number> = { '448p': 768 * 448, '576p': 1024 * 576, '720p': 1280 * 720 };
const OUT_ID = '75';

export interface ExtendSource { width: number; height: number; frames: number }
export interface ExtendPlan {
  /** 'guide' (default): the last 1 / 9 / 17 frames guide a fresh clip (this computer, or Comfy Cloud on request).
   *  'continue' (2026-10-27, Comfy Cloud's default): the last ~5 s of picture AND sound are encoded and kept frozen, only the new seconds are made
   *  (continuePlan; guideFrames = the context frames). */
  method?: 'guide' | 'continue';
  seconds: number; resolution: string; fps: number; guideFrames: number; crossfade: number; audioXfade: number;
  source: { width: number; height: number; frames: number; seconds: number };
  /** what the model renders: stage 2 size (64 grid, so stage 1 at half size is on LTX's 32 grid), stage 1, total frames (G + 24 × seconds) */
  gen: { width: number; height: number; stage1: { width: number; height: number }; frames: number };
  /** the joined result */ out: { width: number; height: number; frames: number; seconds: number; added: number };
}
const snap64 = (x: number) => Math.max(256, Math.round(x / 64) * 64);
const even = (x: number) => Math.max(2, Math.floor(x / 2) * 2);
/** The render size for a source: its own shape at the tier's pixel budget (never above the source), each side on the 64 grid. */
export function extendGenSize(src: { width: number; height: number }, resolution: string) {
  const budget = BUDGET[resolution] ?? BUDGET['448p']; const px = src.width * src.height;
  const k = Math.min(1, Math.sqrt(budget / px));
  const width = snap64(src.width * k), height = snap64(src.height * k);
  return { width, height, stage1: { width: width / 2, height: height / 2 } };
}
/** Frames the model renders for +seconds with G guide frames, and the frames that are new. */
export const extendFrames = (seconds: number, guides: number) => ({ total: guides + LTX25_EXTEND_FPS * seconds, added: LTX25_EXTEND_FPS * seconds });
/** The whole plan, or an error line for the user. */
export function extendPlan(src: ExtendSource, ask: { seconds?: unknown; resolution?: unknown; guideFrames?: unknown; crossfade?: unknown } = {}): ExtendPlan | { error: string; field: string } {
  const seconds = ask.seconds == null || ask.seconds === '' ? LTX25_EXTEND_DEFAULT_SECONDS : Number(ask.seconds);
  if (!(LTX25_EXTEND_SECONDS as readonly number[]).includes(seconds)) return { error: `Extend by ${LTX25_EXTEND_SECONDS.join(', ')} seconds on LTX-2.5.`, field: 'extendSeconds' };
  const resolution = ask.resolution == null || ask.resolution === '' ? '448p' : String(ask.resolution);
  if (!(LTX25_EXTEND_RESOLUTIONS as readonly string[]).includes(resolution)) return { error: 'Resolution must be 448p (Draft), 576p (Sharper) or 720p (Comfy Cloud) on LTX-2.5.', field: 'resolution' };
  let G = ask.guideFrames == null || ask.guideFrames === '' ? LTX25_EXTEND_DEFAULT_GUIDES : Number(ask.guideFrames);
  if (!(LTX25_EXTEND_GUIDES as readonly number[]).includes(G)) return { error: `guideFrames must be ${LTX25_EXTEND_GUIDES.join(', ')}.`, field: 'guideFrames' };
  if (!(src.frames >= 1)) return { error: 'That clip has no frames to continue from.', field: 'video' };
  while (G > src.frames) G = G === 17 ? 9 : 1; // a very short source: fewer guide frames
  const xIn = ask.crossfade == null || ask.crossfade === '' ? LTX25_EXTEND_DEFAULT_XFADE : Number(ask.crossfade);
  if (!Number.isInteger(xIn) || xIn < 0 || xIn > LTX25_EXTEND_MAX_XFADE) return { error: `crossfade must be 0–${LTX25_EXTEND_MAX_XFADE} frames.`, field: 'crossfade' };
  const crossfade = Math.min(xIn, G > 1 ? G : 0, src.frames - 1 < 0 ? 0 : src.frames - 1); // the overlap is the guide; a single frame has nothing to fade over
  const audioXfade = Math.min(LTX25_EXTEND_AUDIO_XFADE, G / LTX25_EXTEND_FPS);
  const gs = extendGenSize(src, resolution); const fr = extendFrames(seconds, G);
  const out = { width: even(src.width), height: even(src.height), frames: src.frames + fr.added, seconds: (src.frames + fr.added) / LTX25_EXTEND_FPS, added: seconds };
  if (out.seconds > LTX25_EXTEND_MAX_TOTAL + 1e-6) return { error: `The extended clip would be ${out.seconds.toFixed(1)} s; Extend goes up to ${LTX25_EXTEND_MAX_TOTAL} s in total.`, field: 'video' };
  return { method: 'guide', seconds, resolution, fps: LTX25_EXTEND_FPS, guideFrames: G, crossfade, audioXfade, source: { width: src.width, height: src.height, frames: src.frames, seconds: src.frames / LTX25_EXTEND_FPS },
    gen: { ...gs, frames: fr.total }, out };
}
/** The prompt: the user's "what happens next", else continue the same action, camera and sound. */
export const extendPrompt = (user?: string) => { const t = String(user ?? '').trim().replace(/\s+/g, ' ').slice(0, 2000); return t || LTX25_EXTEND_DEFAULT_PROMPT; };

type G = Record<string, any>;
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
/** Patch workflows/ltx25-ti2v-api.json for one extend pass. `guide` = the guide file ({__file} placeholder): a PNG (G = 1) or a short clip (G > 1). */
export function patchLtx25Extend(g: G, a: { prompt: string; seed: number; plan: ExtendPlan; guide: unknown }): { graph: G; output: string; expect: Record<string, any> } {
  const p = a.plan; const Gn = p.guideFrames;
  g['364'].inputs.text = a.prompt; g['365'].inputs.frame_rate = LTX25_EXTEND_FPS;
  Object.assign(g['356'].inputs, { width: p.gen.stage1.width, height: p.gen.stage1.height, length: p.gen.frames, batch_size: 1 });
  Object.assign(g['366'].inputs, { frames_number: p.gen.frames, frame_rate: LTX25_EXTEND_FPS });
  g['339'].inputs.noise_seed = a.seed; g['370'].inputs.fps = LTX25_EXTEND_FPS;
  Object.assign(g['351'].inputs, { width: p.gen.width, height: p.gen.height });
  if (Gn === 1) g['395'].inputs.image = a.guide;
  else { // the last frames as a clip: core LoadVideo → GetVideoComponents feed the same ImageScale the start frame used
    delete g['395'];
    g['960'] = { class_type: 'LoadVideo', inputs: { file: a.guide }, _meta: { title: `Extend: the source's last ${Gn} frames` } };
    g['961'] = { class_type: 'GetVideoComponents', inputs: { video: ['960', 0] }, _meta: { title: 'Extend: guide frames' } };
    g['351'].inputs.image = ['961', 0];
  }
  // colour match to the source's last frame (frame G-1 of the guide is that frame; the generated copy of it is frame G-1 of the output)
  g['962'] = { class_type: 'ImageFromBatch', inputs: { image: ['351', 0], batch_index: Gn - 1, length: 1 }, _meta: { title: "Extend: the source's last frame" } };
  g['963'] = { class_type: 'ColorTransfer', inputs: { image_target: ['374', 0], image_ref: ['962', 0], method: 'reinhard_lab', source_stats: 'target_frame', 'source_stats.target_index': Gn - 1, strength: 1 }, _meta: { title: 'Extend: colour match to the source' } };
  g['370'].inputs.images = ['963', 0];
  for (const [id, n] of Object.entries<any>(g)) for (const [k, v] of Object.entries<any>(n.inputs)) if (isLink(v) && !g[v[0]]) throw new Error(`ltx25-extend graph: ${id}.${k} links to missing node ${v[0]}`);
  return { graph: g, output: OUT_ID, expect: { mode: 'extend', seed: a.seed, prompt: a.prompt, seconds: p.seconds, frames: p.gen.frames, framesAdded: p.out.frames - p.source.frames, guideFrames: Gn, fps: LTX25_EXTEND_FPS,
    width: p.gen.width, height: p.gen.height, stage1: p.gen.stage1, out: p.out, crossfade: p.crossfade, audioXfade: p.audioXfade, colorMatch: 'ColorTransfer reinhard_lab', audio: true } };
}

// ---------- picture-and-sound continuation (2026-10-27, Comfy Cloud's default) ----------
/**
 * How LTX Desktop extends LTX-2.5 (github.com/Lightricks/ltx-desktop backend/services/features/video/extend.py, retake_pipeline/window.py,
 * extend_stitch.py): it encodes a context window of the source (about 5 s, video AND audio), keeps it, denoises only the new frames, then stitches
 * with a picture fade of up to 16 frames and a hard sound cut at the edit. Ours, in core nodes (workflows/cloud/ltx25-continue-api.json):
 *  - picture: the last C frames (C = 121 = 5.04 s, or the whole source on the 8n + 1 grid when shorter) go through LTXVImgToVideoInplace at
 *    strength 1.0 on both stages: they are VAE-encoded into the first (C - 1) / 8 + 1 latent frames with noise mask 0 (comfy_extras/nodes_lt.py),
 *    so the model sees them as fixed and makes only the latent frames after them. C is 8n + 1, so the context ends exactly on a latent boundary;
 *  - sound: the same C / 24 s of the source's sound (a WAV, so the timing is exact) → LTXVAudioVAEEncode → LTXVFreezeLatent (noise mask 0), then
 *    LTXVConcatAVLatent swaps it into the AV latent; it pads the shorter context with zeros and leaves the pad unmasked (fit_audio), so the
 *    new seconds of sound are generated while the model hears the source's sound;
 *  - the stage 1 sampler keeps the noise masks on its output; the x2 upscale drops the video one, so stage 2 freezes the context picture again
 *    (the same in-place node at full size) and carries the audio latent with its mask;
 *  - the join (joinExtension, unchanged): the model's copies of the context frames are dropped, the last X (≤ 16) source frames fade into the
 *    model's copies of the same frames (VAE colour / sharpness hidden), and the sound is cut at the edit (a 20 ms crossfade so the cut never clicks).
 * Unlike LTX Desktop's 0.5 s soft mask into the source, the context here is frozen whole (core LTXVImgToVideoInplace sets one value per frame);
 * the 16-frame fade covers the seam instead.
 */
export const LTX25_CONTINUE_CONTEXT = 121;
/** Shortest source the continuation takes (frames, about 1 s); a shorter clip falls back to the guide method. */
export const LTX25_CONTINUE_MIN_SOURCE = 25;
export const LTX25_CONTINUE_DEFAULT_XFADE = 16; export const LTX25_CONTINUE_MAX_XFADE = 16;
/** The sound is cut at the edit; this short crossfade only removes the click of a hard cut. */
export const LTX25_CONTINUE_AUDIO_XFADE = 0.02;
/** LTX Desktop's limit for context + new frames. */
export const LTX25_CONTINUE_MAX_FRAMES = 505;
/** LTX-2.x audio VAE: 16 kHz mel, hop 160, latent downsample 4 → 25 audio latents per second (comfy/ldm/lightricks/vae/audio_vae.py latents_per_second). */
export const LTX25_AUDIO_LATENTS_PER_SECOND = 25;
export const LTX25_EXTEND_METHODS = ['continue', 'guide'] as const;
export type ExtendMethod = (typeof LTX25_EXTEND_METHODS)[number];
/** Context frames for a source of N frames: the last 121, or all of a shorter source, snapped DOWN to 8n + 1. */
export const continueContextFrames = (N: number) => { const n = Math.min(LTX25_CONTINUE_CONTEXT, Math.floor(N)); return n < 9 ? 1 : Math.floor((n - 1) / 8) * 8 + 1; };
/** The continuation plan (the same shape as extendPlan, so the join and the price read it the same way), or an error line. */
export function continuePlan(src: ExtendSource, ask: { seconds?: unknown; resolution?: unknown; crossfade?: unknown } = {}): ExtendPlan | { error: string; field: string } {
  const base = extendPlan(src, { seconds: ask.seconds, resolution: ask.resolution, guideFrames: 1, crossfade: 0 }); if ('error' in base) return base;
  if (src.frames < LTX25_CONTINUE_MIN_SOURCE) return { error: `Picture-and-sound continuation needs at least ${LTX25_CONTINUE_MIN_SOURCE} frames (about 1 s) of video; this clip has ${src.frames}. Use the last-frames method.`, field: 'video' };
  const C = continueContextFrames(src.frames);
  const xIn = ask.crossfade == null || ask.crossfade === '' ? LTX25_CONTINUE_DEFAULT_XFADE : Number(ask.crossfade);
  if (!Number.isInteger(xIn) || xIn < 0 || xIn > LTX25_CONTINUE_MAX_XFADE) return { error: `crossfade must be 0–${LTX25_CONTINUE_MAX_XFADE} frames.`, field: 'crossfade' };
  const fr = extendFrames(base.seconds, C); if (fr.total > LTX25_CONTINUE_MAX_FRAMES) return { error: `Context plus new frames is ${fr.total}; the most is ${LTX25_CONTINUE_MAX_FRAMES}.`, field: 'extendSeconds' };
  return { ...base, method: 'continue', guideFrames: C, crossfade: Math.min(xIn, C - 1), audioXfade: LTX25_CONTINUE_AUDIO_XFADE, gen: { ...base.gen, frames: fr.total } };
}
/** What the continuation keeps and makes, in latent frames and seconds (for the plan's expect and the tests). The edit is where the source ends. */
export function continueMask(p: ExtendPlan) {
  const C = p.guideFrames, T = p.gen.frames;
  return { contextFrames: C, newFrames: T - C, contextSeconds: C / LTX25_EXTEND_FPS, totalSeconds: T / LTX25_EXTEND_FPS,
    videoLatents: (T - 1) / 8 + 1, frozenVideoLatents: (C - 1) / 8 + 1,
    audioLatents: Math.round((T / LTX25_EXTEND_FPS) * LTX25_AUDIO_LATENTS_PER_SECOND), frozenAudioLatents: Math.round((C / LTX25_EXTEND_FPS) * LTX25_AUDIO_LATENTS_PER_SECOND),
    editAt: p.source.frames / LTX25_EXTEND_FPS, pictureFade: p.crossfade, soundCut: p.audioXfade };
}
/** Patch workflows/cloud/ltx25-continue-api.json for one continuation. `video` / `audio` = the context clip (picture) and WAV (sound) placeholders. */
export function patchLtx25Continue(g: G, a: { prompt: string; seed: number; plan: ExtendPlan; video: unknown; audio: unknown }): { graph: G; output: string; expect: Record<string, any> } {
  const p = a.plan; const C = p.guideFrames; if (p.method !== 'continue') throw new Error('ltx25-continue: not a continuation plan');
  if ((C - 1) % 8 || (p.gen.frames - 1) % 8) throw new Error(`ltx25-continue: frames off the 8n + 1 grid (context ${C}, total ${p.gen.frames})`);
  g['364'].inputs.text = a.prompt; g['365'].inputs.frame_rate = LTX25_EXTEND_FPS;
  Object.assign(g['356'].inputs, { width: p.gen.stage1.width, height: p.gen.stage1.height, length: p.gen.frames, batch_size: 1 });
  Object.assign(g['366'].inputs, { frames_number: p.gen.frames, frame_rate: LTX25_EXTEND_FPS });
  g['339'].inputs.noise_seed = a.seed; g['338'].inputs.noise_seed = a.seed; g['370'].inputs.fps = LTX25_EXTEND_FPS;
  Object.assign(g['351'].inputs, { width: p.gen.width, height: p.gen.height });
  g['960'].inputs.file = a.video; g['964'].inputs.audio = a.audio;
  g['962'].inputs.batch_index = C - 1; g['963'].inputs['source_stats.target_index'] = C - 1;
  for (const [id, n] of Object.entries<any>(g)) for (const [k, v] of Object.entries<any>(n.inputs)) if (isLink(v) && !g[v[0]]) throw new Error(`ltx25-continue graph: ${id}.${k} links to missing node ${v[0]}`);
  return { graph: g, output: OUT_ID, expect: { mode: 'continue', seed: a.seed, prompt: a.prompt, seconds: p.seconds, frames: p.gen.frames, framesAdded: p.out.frames - p.source.frames, contextFrames: C, fps: LTX25_EXTEND_FPS,
    width: p.gen.width, height: p.gen.height, stage1: p.gen.stage1, out: p.out, crossfade: p.crossfade, audioXfade: p.audioXfade, mask: continueMask(p), colorMatch: 'ColorTransfer reinhard_lab', audio: true } };
}

// ---------- sound made once, on stage 1 (Comfy Cloud Extend, 2026-10-27) ----------
/**
 * Evidence (the painter clip, jobs 310d6c8b guide / 9979c0ca continuation on Comfy Cloud): the new sound carries a strong comb of lines at exact
 * 1 kHz multiples (11–17 dB above its surroundings; every other LTX output in the library, Cloud text-to-video included, is under 6 dB), and in the
 * continuation the model's copy of the frozen 5 s context does NOT match the source's sound (envelope correlation 0.34 vs 0.84 for a plain audio-VAE
 * round trip of the same WAV), so the context sound was re-noised somewhere instead of kept. Stage 2 re-noises the whole AV latent at sigma 0.85
 * and makes the sound again in 3 steps; if the audio noise mask does not survive into stage 2, that is exactly where the context is lost.
 * So on Extend: the sound is made once, on stage 1 (all 8 distilled steps, the context frozen), and stage 2 gets it frozen (core LTXVFreezeLatent:
 * noise mask 0, so stage 2 only sharpens the picture and still hears the sound through cross-attention). Stage 1's sound is damped at steps 3
 * and 6 by KJNodes' LTX2AudioLatentNormalizingSampling (its default factors are made for these 8 distilled sigmas; it leaves frozen audio alone).
 * Unverified until one paid run confirms it; the join's loudness match (joinArgs) works either way.
 */
export const LTX25_AUDIO_NORMALIZE_FACTORS = '1,1,0.25,1,1,0.25,1,1';
export function extendSoundOnStage1(g: G): G {
  if (!g['388'] || !g['340'] || !g['367'] || !g['384']) throw new Error('ltx25-extend: not a two-stage LTX-2.5 graph');
  g['980'] = { class_type: 'LTX2AudioLatentNormalizingSampling', inputs: { model: ['384', 0], audio_normalization_factors: LTX25_AUDIO_NORMALIZE_FACTORS }, _meta: { title: 'Extend: stage 1 sound normalised at steps 3 and 6 (KJNodes)' } };
  g['388'].inputs.model = ['980', 0];
  g['981'] = { class_type: 'LTXVFreezeLatent', inputs: { latent: ['367', 1] }, _meta: { title: "Extend: stage 1's sound kept as is on stage 2" } };
  g['340'].inputs.audio_latent = ['981', 0];
  return g;
}

// ---------- ffmpeg ----------
const f6 = (x: number) => String(Math.round(x * 1e6) / 1e6);
/** Conform the source: 24 fps, even size, sound kept (AAC 48 kHz stereo) or a silent track when it has none. */
export function conformExtendSourceArgs(src: string, out: string, o: { width: number; height: number; hasAudio: boolean; seconds: number }): string[] {
  const w = even(o.width), h = even(o.height);
  return ['-y', '-v', 'error', '-i', src, ...(o.hasAudio ? [] : ['-f', 'lavfi', '-t', f6(Math.max(0.1, o.seconds)), '-i', 'anullsrc=r=48000:cl=stereo']),
    '-map', '0:v:0', '-map', o.hasAudio ? '0:a:0' : '1:a:0', '-vf', `fps=${LTX25_EXTEND_FPS},scale=${w}:${h}:flags=lanczos,setsar=1,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out];
}
/** The guide: the last G frames of the conformed source (N frames). G = 1 → the exact last frame as a PNG; else a near-lossless short clip. */
export function guideArgs(conformed: string, out: string, N: number, G: number): string[] {
  const start = Math.max(0, N - G);
  return G === 1 ? frameIndexArgs(conformed, out, start) /* the exact last frame: the shared frame grab (videoFrame.ts) */
    : ['-y', '-v', 'error', '-i', conformed, '-vf', `trim=start_frame=${start},setpts=PTS-STARTPTS`, '-frames:v', String(G), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '4', '-g', '1', '-pix_fmt', 'yuv420p', out];
}
/** Continuation context, picture: the last C frames of the conformed source (N frames), visually lossless (crf 10: ~8 MB for 5 s at 720p to upload), no sound (the sound goes as a WAV). */
export const contextVideoArgs = (conformed: string, out: string, N: number, C: number): string[] => guideArgs(conformed, out, N, Math.max(2, C)).map((x, k, a) => (a[k - 1] === '-crf' ? '10' : x));
/** Continuation context, sound: the same C / 24 s of the conformed source's sound as 48 kHz stereo PCM (exact timing; no AAC priming delay). */
export function contextAudioArgs(conformed: string, out: string, N: number, C: number): string[] {
  const start = Math.max(0, N - C) / LTX25_EXTEND_FPS; const dur = Math.min(N, C) / LTX25_EXTEND_FPS;
  return ['-y', '-v', 'error', '-i', conformed, '-vn', '-af', `atrim=start=${f6(start)}:duration=${f6(dur)},asetpts=PTS-STARTPTS,apad,atrim=end=${f6(dur)}`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out];
}
/** The join: source (N frames) + generated clip (T = G + added frames) → N + added frames, sound as long as the picture.
 *  Sound (2026-10-27): the source's samples are passed through untouched up to the cut (N / 24 s; no gain, no fade, no resample at 48 kHz stereo);
 *  (or to where its sound ends, if earlier: sourceAudioSeconds); then the source's last d s are mirrored (so the wave is continuous at the cut, no click) and crossfaded (equal power) into the new sound, which
 *  starts at the model's cut (G / 24 s into its clip) and carries one gain (audioGainDb, the loudness match). `audioCodec` is for the tests (PCM). */
export function joinArgs(a: { source: string; gen: string; out: string; N: number; T: number; G: number; X: number; audioXfade: number; width: number; height: number; audio: boolean; genHasAudio: boolean; crf?: number; audioGainDb?: number; audioCodec?: string; sourceAudioSeconds?: number }): string[] {
  const { N, T, G, X, width: W, height: H } = a; const fps = LTX25_EXTEND_FPS; const total = (N + T - G) / fps;
  // the sound's cut: the picture's (N / 24 s), or earlier when the source's sound stops short of its picture (AAC often ends ~30 ms early); the new
  // sound then starts that much earlier in the model's clip, so there is no hole at the edit
  const gap = Math.min(G / fps, Math.max(0, N / fps - (a.sourceAudioSeconds && a.sourceAudioSeconds > 0 ? a.sourceAudioSeconds : N / fps))); const cut = N / fps - gap; const g0 = G / fps - gap;
  const v = [`[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p,trim=start_frame=${G - X}:end_frame=${T},setpts=PTS-STARTPTS[g]`,
    `[0:v]fps=${fps},scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p,trim=end_frame=${N},setpts=PTS-STARTPTS[s]`,
    X > 0 ? `[s][g]xfade=transition=fade:duration=${f6(X / fps)}:offset=${f6((N - X) / fps)}[v]` : '[s][g]concat=n=2:v=1:a=0[v]'];
  const d = Math.max(0, Math.min(a.audioXfade, cut, (T - G) / fps)); const gain = Number.isFinite(a.audioGainDb) && a.audioGainDb ? `,volume=${(a.audioGainDb as number).toFixed(2)}dB` : '';
  const genA = a.genHasAudio ? '[1:a]aresample=48000,aformat=channel_layouts=stereo,' : `anullsrc=r=48000:cl=stereo,`;
  const au = !a.audio ? [] : d > 0
    ? [`[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=end=${f6(cut)},asetpts=PTS-STARTPTS,asplit=2[s0][s1]`,
      `[s1]atrim=start=${f6(cut - d)},asetpts=PTS-STARTPTS,areverse[sm]`, '[s0][sm]concat=n=2:v=0:a=1[a0]',
      `${genA}apad,atrim=start=${f6(g0)}:end=${f6(T / fps)},asetpts=PTS-STARTPTS${gain}[a1]`,
      `[a0][a1]acrossfade=d=${f6(d)}:c1=qsin:c2=qsin,apad,atrim=end=${f6(total)}[a]`]
    : [`[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=end=${f6(cut)},asetpts=PTS-STARTPTS[a0]`,
      `${genA}apad,atrim=start=${f6(g0)}:end=${f6(T / fps)},asetpts=PTS-STARTPTS${gain}[a1]`, `[a0][a1]concat=n=2:v=0:a=1,apad,atrim=end=${f6(total)}[a]`];
  const ac = a.audioCodec ?? 'aac';
  return ['-y', '-v', 'error', '-i', a.source, '-i', a.gen, '-filter_complex', [...v, ...au].join(';'), '-map', '[v]', ...(a.audio ? ['-map', '[a]', '-c:a', ac, ...(ac === 'aac' ? ['-b:a', '192k'] : [])] : ['-an']),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(a.crf ?? 16), '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', a.out];
}

/** A sound level: RMS and peak in dBFS (-Infinity = silence). */
export interface AudioLevel { rmsDb: number; peakDb: number }
/** The loudness-match gain (dB) for the new sound: source tail RMS (or the whole source's when the tail is near silence) minus the new sound's
 *  RMS, clamped to GAIN_RANGE and lowered so the new peak stays under PEAK_CEILING. 0 when either side is silent or unmeasured. */
export function extendAudioGainDb(m: { tail?: AudioLevel | null; whole?: AudioLevel | null; gen?: AudioLevel | null }): number {
  const live = (l?: AudioLevel | null) => !!l && Number.isFinite(l.rmsDb) && l.rmsDb > LTX25_EXTEND_SILENT_DB;
  const target = live(m.tail) ? m.tail! : live(m.whole) ? m.whole! : null; if (!target || !live(m.gen)) return 0;
  const [lo, hi] = LTX25_EXTEND_GAIN_RANGE; let g = Math.min(hi, Math.max(lo, target.rmsDb - m.gen!.rmsDb));
  if (Number.isFinite(m.gen!.peakDb)) g = Math.min(g, LTX25_EXTEND_PEAK_CEILING - m.gen!.peakDb);
  return Math.round(Math.max(lo, g) * 100) / 100;
}
/** ffmpeg arguments that print the overall RMS and peak (astats) of a file's sound between start and end seconds (end ≤ 0: to the end). */
export const audioLevelArgs = (file: string, start: number, end: number): string[] => ['-hide_banner', '-nostats', '-v', 'info', '-i', file, '-vn', '-map', '0:a:0',
  '-af', `aresample=48000,aformat=channel_layouts=stereo,atrim=start=${f6(Math.max(0, start))}${end > 0 ? `:end=${f6(end)}` : ''},astats=measure_perchannel=none:measure_overall=RMS_level+Peak_level`, '-f', 'null', '-'];
/** Read astats' "Overall" RMS / peak lines (dB; "-inf" = silence). null when there is no reading. */
export function parseAudioLevel(stderr: string): AudioLevel | null {
  const num = (re: RegExp) => { const m = stderr.match(re); if (!m) return null; return /inf/i.test(m[1]) ? -Infinity : Number(m[1]); };
  const rms = num(/RMS level dB:\s*(-?inf|-?[\d.]+)/i), peak = num(/Peak level dB:\s*(-?inf|-?[\d.]+)/i);
  return rms == null || Number.isNaN(rms) ? null : { rmsDb: rms, peakDb: peak ?? -Infinity };
}
const audioLevel = (file: string, start: number, end: number): Promise<AudioLevel | null> => new Promise((ok) => {
  const p = spawn('ffmpeg', audioLevelArgs(file, start, end), { stdio: ['ignore', 'ignore', 'pipe'] }); let e = '';
  p.stderr?.on('data', (d) => { e += d; if (e.length > 20000) e = e.slice(-20000); }); p.on('close', () => ok(parseAudioLevel(e))); p.on('error', () => ok(null)); });
/** Mock backend only: a clearly labelled stand-in for the model's clip (the guide frames, then the last frame held with a slow push-in, silent),
 *  so the real join can be tried without a model. Never presented as a model result. */
export function sampleGenArgs(conformed: string, outFile: string, p: ExtendPlan): string[] {
  const { width: W, height: H, frames: T } = p.gen; const G = p.guideFrames; const N = p.source.frames;
  return ['-y', '-v', 'error', '-i', conformed, '-f', 'lavfi', '-t', f6(T / LTX25_EXTEND_FPS), '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', `[0:v]trim=start_frame=${Math.max(0, N - G)},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,tpad=stop_mode=clone:stop=${T},trim=end_frame=${T},zoompan=z='if(lt(on,${G}),1,1+0.0025*(on-${G - 1}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${LTX25_EXTEND_FPS},format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a:0', '-frames:v', String(T), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', outFile];
}
/** Exact frame count: shared with every frame grab (ffmpeg.ts countFrames). */
export { countFrames };
/** The decoded length of a file's first sound track in seconds (0 = none / unreadable). */
const audioSeconds = (file: string): Promise<number> => new Promise((ok) => { const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', file]); let o = '';
  p.stdout.on('data', (d) => (o += d)); p.on('close', () => ok(Number(o.trim()) || 0)); p.on('error', () => ok(0)); });
const hasAudioStream = (file: string): Promise<boolean> => new Promise((ok) => { const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]); let o = '';
  p.stdout.on('data', (d) => (o += d)); p.on('close', () => ok(o.trim().length > 0)); p.on('error', () => ok(false)); });
/** Join a generated clip onto the conformed source (runNative post `extend`, and the mock sample). Throws on an ffmpeg failure. */
export async function joinExtension(source: string, gen: string, outFile: string, p: ExtendPlan, o: { audio: boolean; crf?: number; matchLoudness?: boolean; audioCodec?: string; /** keep at most this many frames of the generated clip (H3 renders on its 17k + 5 grid, rounded up) */ maxGenFrames?: number }): Promise<{ frames: number; audioGainDb: number }> {
  const N = (await countFrames(source)) || p.source.frames; const T = Math.min((await countFrames(gen)) || p.gen.frames, o.maxGenFrames && o.maxGenFrames > 0 ? o.maxGenFrames : Infinity);
  if (T <= p.guideFrames) throw new Error(`ltx25-extend: the generated clip has ${T} frames (needs more than ${p.guideFrames})`);
  const X = Math.min(p.crossfade, N, p.guideFrames > 1 ? p.guideFrames : 0); const fps = LTX25_EXTEND_FPS; const genHasAudio = await hasAudioStream(gen);
  // loudness match: the source's last 2 s before the cut vs the new seconds of the model's sound (after its cut at G / 24 s)
  let audioGainDb = 0; const sourceAudioSeconds = o.audio ? await audioSeconds(source) : 0;
  if (o.audio && genHasAudio && o.matchLoudness !== false && (await hasAudioStream(source))) {
    const cut = Math.min(N / fps, sourceAudioSeconds || N / fps); const [tail, whole, genLevel] = await Promise.all([audioLevel(source, cut - LTX25_EXTEND_MATCH_SECONDS, cut), audioLevel(source, 0, cut), audioLevel(gen, p.guideFrames / fps, T / fps)]);
    audioGainDb = extendAudioGainDb({ tail, whole, gen: genLevel });
  }
  const code = await runFfmpeg(joinArgs({ source, gen, out: outFile, N, T, G: p.guideFrames, X, audioXfade: p.audioXfade, width: p.out.width, height: p.out.height, audio: o.audio, genHasAudio, crf: o.crf, audioGainDb, audioCodec: o.audioCodec, sourceAudioSeconds }));
  if (code !== 0) throw new Error(`ffmpeg extend join failed (exit ${code})`);
  return { frames: N + T - p.guideFrames, audioGainDb };
}
