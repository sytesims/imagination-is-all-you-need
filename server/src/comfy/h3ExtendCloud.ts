/**
 * H3 Extend · Comfy Cloud (2026-10-27): seamless long takes with open MiniMax H3 on shared Comfy Cloud, the Comfy Cloud twin of the local H3 Extend
 * graph (workflows/h3-extend-api.json, planned by tools/h3/plan.ts patchH3Extend). One job = one segment; a longer take is the same Extend run
 * again on the result (segment N + 1 is built from segment N's joined output).
 *
 * How one segment works:
 *  1 prepare (free, ffmpeg on this computer, before anything is uploaded): the clip is conformed (24 fps, its size, its sound or a silent track) and
 *    counted exactly (N frames); its last C = 22 frames (H3_EXTEND_OVERLAP_FRAMES, H3's 17k + 5 clip length) with their sound are cut as the CONTEXT
 *    clip, scaled to the render size.
 *  2 the graph (workflows/cloud/h3-extend-api.json, the local graph with Cloud files): MiniMaxH3AddGuide anchors the context picture AND sound at
 *    frame 0 (the official way to continue both streams: docs.comfy.org MiniMax H3 native, "Anchoring guides at any frame"), so motion, voice and
 *    scene carry on; the model renders C + 24 × seconds frames (on the 17k + 5 grid). Cloud changes, as H3 Character Swap · Comfy Cloud: video VAE
 *    fp16 (the int8 VAE is not in Cloud's loader list), sigma shift 12 / 3 → comfy kitchen attention → fl2v turbo 8-step LoRA (the user's imported
 *    768p build when the free check finds it), 8 steps er_sde / normal. Single pass only (no second stage or upscale inside the chain: a pixel
 *    shift at every join); upscale the finished take afterwards with Upscale.
 *    With a character photo (uploaded, or carried over from the clip's own job) the conditioning node becomes MiniMaxH3ReferenceToVideo on the
 *    Ref2VA weights with the photo as <Picture 1> (the I2V node takes no reference image); same outputs, same guide.
 *  3 the join (comfy/ltx25Extend.ts joinExtension, shared with every Extend): the model's copies of the context frames are dropped, the last X
 *    source frames crossfade into them, the source's sound is untouched up to the cut, then H3's new sound, loudness-matched, with a 20 ms de-click.
 *    The new part is cut to exactly 24 × seconds frames, so the take is exactly source + seconds long.
 * Price: an estimate per RENDERED second (context + new frames on the grid), from the asked fields only (quote = charge).
 */
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { WORKFLOWS_DIR, DATA_DIR } from '../config.js';
import type { Plan } from './plans.js';
import { charswapSize, TURBO_SHARED, type CharSwapTier } from './h3CharSwapCloud.js';
import { conformExtendSourceArgs, countFrames, LTX25_EXTEND_FPS, LTX25_EXTEND_AUDIO_XFADE, type ExtendPlan } from './ltx25Extend.js';
import { patchH3Extend } from '../tools/h3/plan.js';
import { H3_EXTEND_OVERLAP_FRAMES } from '../tools/h3/catalog.js';

export const H3X_CLOUD_PROVIDER = 'cloud-h3-extend';
export const H3X_CLOUD_ROUTE = `comfy-cloud:${H3X_CLOUD_PROVIDER}`;
export const H3X_CLOUD_GRAPH = 'cloud/h3-extend-api.json';
export const H3X_CLOUD_LABEL = 'H3 Extend · Comfy Cloud';
const FPS = LTX25_EXTEND_FPS;
export const H3X_MAX_FRAMES = 362;
export { H3X_SECONDS, H3X_SECONDS_LIST, H3X_DEFAULT_SECONDS, H3X_MAX_TOTAL, H3X_PROMPT_PREFIX, H3X_TIPS, H3X_PAGE_SECONDS } from '../shared/h3ExtendCloud.js';
import { H3X_SECONDS, H3X_DEFAULT_SECONDS, H3X_MAX_TOTAL, H3X_PROMPT_PREFIX } from '../shared/h3ExtendCloud.js';
/** Picture crossfade over the context (frames): the guide is conditioning, not frozen, so the model's copy of it is close but not exact. */
export const H3X_XFADE = 8;
/** H3's 17k + 5 frame grid, rounded up. */
export const h3Grid = (frames: number) => { const f = Math.max(5, Math.round(frames)); return f + ((((5 - (f % 17)) % 17) + 17) % 17); };
export const h3xTier = (i: { resolution?: unknown; draft?: unknown }): CharSwapTier => (i.draft === true || String(i.resolution) === '480p' ? '480p' : '768p');
const num = (v: unknown) => (v == null || v === '' ? NaN : Number(v));

/** Why this place can't take the job (null = fine). Shared by the route, the quote and the plan. */
export function h3xCloudIssue(i: Record<string, any>): string | null {
  const m = String(i.mode ?? (Array.isArray(i.types) ? i.types[0] : '') ?? '');
  if (m && m !== 'extend') return `${H3X_CLOUD_LABEL} only extends clips`;
  if (i.direction === 'backward' || i.reverseOutput) return `${H3X_CLOUD_LABEL} continues forward from the end of the clip`;
  const s = num(i.extendSeconds);
  if (Number.isFinite(s) && !(Number.isInteger(s) && s >= H3X_SECONDS.min && s <= H3X_SECONDS.max)) return `${H3X_CLOUD_LABEL} adds ${H3X_SECONDS.min}–${H3X_SECONDS.max} s per segment (H3's trained range with the ${H3_EXTEND_OVERLAP_FRAMES}-frame context)`;
  const src = num(i.sourceSeconds); if (Number.isFinite(src) && src > 0 && src < H3_EXTEND_OVERLAP_FRAMES / FPS) return `${H3X_CLOUD_LABEL} needs a clip of at least 1 s (it continues from the last ${H3_EXTEND_OVERLAP_FRAMES} frames)`;
  if (Number.isFinite(src) && src > 0 && Number.isFinite(s) && src + s > H3X_MAX_TOTAL + 0.5) return `The take would be ${Math.round((src + s) * 10) / 10} s; ${H3X_CLOUD_LABEL} goes up to ${H3X_MAX_TOTAL} s in total`;
  return null;
}
/** Seconds this segment adds (as asked; default 5). */
export const h3xSeconds = (i: Record<string, any>) => { const s = num(i.extendSeconds); return Number.isInteger(s) && s >= H3X_SECONDS.min && s <= H3X_SECONDS.max ? s : H3X_DEFAULT_SECONDS; };
/** Frames the model renders (context + new, on the grid) and their seconds: what Comfy Cloud bills (GPU time follows the rendered frames). Read from
 *  the ASKED fields only, so the quote before the upload and the charge after it agree. */
export const h3xRenderFrames = (i: Record<string, any>) => h3Grid(H3_EXTEND_OVERLAP_FRAMES + FPS * h3xSeconds(i));
export const h3xRenderSeconds = (i: Record<string, any>) => Math.round((h3xRenderFrames(i) / FPS) * 100) / 100;

/** The segment plan (the ExtendPlan shape, so the shared join reads it), or an error line. */
export function h3xPlan(src: { width: number; height: number; frames: number }, ask: { seconds?: unknown; resolution?: unknown } = {}): ExtendPlan | { error: string; field: string } {
  const s = ask.seconds == null || ask.seconds === '' ? H3X_DEFAULT_SECONDS : Number(ask.seconds);
  if (!(Number.isInteger(s) && s >= H3X_SECONDS.min && s <= H3X_SECONDS.max)) return { error: `Extend by ${H3X_SECONDS.min}–${H3X_SECONDS.max} seconds on ${H3X_CLOUD_LABEL}.`, field: 'extendSeconds' };
  const C = H3_EXTEND_OVERLAP_FRAMES; if (!(src.frames >= C)) return { error: `${H3X_CLOUD_LABEL} needs at least ${C} frames (about 1 s) of video; this clip has ${src.frames || 0}.`, field: 'video' };
  const tier = h3xTier({ resolution: ask.resolution }); const { width, height } = charswapSize(src.width, src.height, tier);
  const even = (x: number) => Math.max(2, Math.floor(x / 2) * 2); const added = FPS * s; const out = { width: even(src.width), height: even(src.height), frames: src.frames + added, seconds: (src.frames + added) / FPS, added: s };
  if (out.seconds > H3X_MAX_TOTAL + 1e-6) return { error: `The take would be ${out.seconds.toFixed(1)} s; ${H3X_CLOUD_LABEL} goes up to ${H3X_MAX_TOTAL} s in total.`, field: 'video' };
  return { method: 'guide', seconds: s, resolution: tier, fps: FPS, guideFrames: C, crossfade: Math.min(H3X_XFADE, C), audioXfade: LTX25_EXTEND_AUDIO_XFADE,
    source: { width: src.width, height: src.height, frames: src.frames, seconds: src.frames / FPS },
    gen: { width, height, stage1: { width, height }, frames: C + added /* the join keeps exactly this many frames of the render (h3Grid rounds up) */ }, out };
}
/** The prompt: the user's words for this segment (the page pre-fills later segments with H3X_PROMPT_PREFIX), plus the photo's role when there is one. */
export function h3xPrompt(user: string | undefined, character: boolean) {
  const t = String(user ?? '').trim().replace(/\s+/g, ' ').slice(0, 3000) || `${H3X_PROMPT_PREFIX}the scene keeps going naturally, same subject, setting, lighting and sound.`;
  return character && !/<Picture 1>/.test(t) ? `${t} The person looks exactly like <Picture 1>: same face, hair and clothes.` : t;
}

const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, H3X_CLOUD_GRAPH), 'utf8')) as Record<string, any>;
export const H3X_REF2VA_UNET = 'minimax_h3_ref2va_pruned_int8_convrot.safetensors';
/** What Comfy Cloud must have (checked against its object_info of 2026-10-26). */
export const H3X_CLOUD_REQUIRES = {
  nodes: [...new Set([...Object.values<any>(load()).map((n) => String(n.class_type)), 'MiniMaxH3ReferenceToVideo', 'LoadImage'])].sort(),
  models: [
    { loader: 'UNETLoader', field: 'unet_name', file: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors' },
    { loader: 'UNETLoader', field: 'unet_name', file: H3X_REF2VA_UNET },
    { loader: 'LoraLoaderModelOnly', field: 'lora_name', file: TURBO_SHARED },
    { loader: 'CLIPLoader', field: 'clip_name', file: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors' },
    { loader: 'VAELoader', field: 'vae_name', file: 'minimax_h3_video_vae_fp16.safetensors' },
    { loader: 'VAELoader', field: 'vae_name', file: 'minimax_h3_audio_vae_fp32.safetensors' },
  ],
};
type J = { id: string; toolId: string; provider: string; input: Record<string, any> };
const seedOf = (s: unknown) => (Number.isInteger(Number(s)) && s !== '' && s != null ? Math.abs(Number(s)) % 2 ** 32 : Math.floor(Math.random() * 2 ** 32));
/** The character photo for this segment: uploaded with the job, or carried over from the clip's own job (parse sets characterPath). */
export const h3xCharacter = (i: Record<string, any>): string | null => (typeof i.characterPath === 'string' && i.characterPath ? i.characterPath : null);

/** The Comfy Cloud plan for one segment. Needs input.h3x (prepare: the conformed clip, its frame count, the context clip). */
export function h3xCloudPlan(j: J): Plan {
  const i = j.input; const bad = h3xCloudIssue(i); if (bad) throw Object.assign(new Error(bad), { reasonCode: 'input_invalid', errorType: 'validation' });
  const x = i.h3x; if (!x?.source || !x?.tail || !(x.frames > 0)) throw new Error(`${H3X_CLOUD_LABEL}: the clip was not prepared`);
  const p = h3xPlan({ width: x.width, height: x.height, frames: x.frames }, { seconds: i.extendSeconds, resolution: i.resolution });
  if ('error' in p) throw Object.assign(new Error(p.error), { reasonCode: 'input_invalid', errorType: 'validation' });
  const character = h3xCharacter(i); const prompt = h3xPrompt(String(i.finalPrompt ?? i.prompt ?? ''), !!character); const seed = seedOf(i.seed);
  const g = load(); const tier = p.resolution as CharSwapTier;
  patchH3Extend(g, { prompt, tail: { __file: x.tail }, seconds: p.seconds }); // the local graph's own patch: context at frame 0, seconds + overlap
  g['9'].inputs.value = p.gen.width; g['10'].inputs.value = p.gen.height; g['5'].inputs.noise_seed = seed;
  const turbo = tier === '768p' && typeof i.h3xTurbo === 'string' && i.h3xTurbo ? i.h3xTurbo : TURBO_SHARED; g['62'].inputs.lora_name = turbo;
  if (character) { // Ref2VA: the same guide and outputs, plus the photo as <Picture 1>
    g['1'].inputs.unet_name = H3X_REF2VA_UNET;
    g['50'] = { class_type: 'LoadImage', inputs: { image: { __file: character } }, _meta: { title: 'Character photo (<Picture 1>)' } };
    const c = g['20'].inputs; g['20'] = { class_type: 'MiniMaxH3ReferenceToVideo', inputs: { clip: c.clip, vae: c.vae, audio_vae: ['4', 0], prompt: c.prompt, width: c.width, height: c.height, length: c.length, ref_image_size: 'match', 'ref_images.ref_image_0': ['50', 0] }, _meta: { title: 'H3 Ref2VA (character photo)' } };
  }
  const rendered = h3Grid(p.gen.frames); const label = `+${p.seconds} s (${p.out.seconds.toFixed(1)} s total)`;
  return { tool: j.toolId, outKind: 'video', muxSourceAudio: false, labels: [label],
    post: { kind: 'extend', plan: p, label, source: x.source, maxGenFrames: p.gen.frames },
    notes: [`${H3X_CLOUD_LABEL}: the last ${p.guideFrames} frames of picture and sound as context, +${p.seconds} s at ${p.gen.width}×${p.gen.height} (${rendered} frames rendered), turbo ${turbo === TURBO_SHARED ? '(shared build)' : '768p build'} 8 steps${character ? ', character photo as <Picture 1> (Ref2VA)' : ''}; joined with a ${p.crossfade}-frame picture fade, the sound cut at the edit`],
    passes: [{ label, workflow: H3X_CLOUD_GRAPH, graph: g, output: '18',
      expect: { mode: 'extend', fps: FPS, width: p.gen.width, height: p.gen.height, seconds: p.seconds, contextFrames: p.guideFrames, frames: rendered, keptFrames: p.gen.frames, tier, seed, prompt, turbo, steps: g['11'].inputs.value, character: !!character, out: p.out } }] };
}

/** ffmpeg: the context clip = the last C frames of the conformed clip (N frames) with the same C / 24 s of its sound, filled to the render size. */
export function h3xTailArgs(conformed: string, out: string, N: number, C: number, W: number, H: number): string[] {
  const start = Math.max(0, N - C); const f6 = (v: number) => String(Math.round(v * 1e6) / 1e6); const dur = Math.min(N, C) / FPS;
  return ['-y', '-v', 'error', '-i', conformed, '-vf', `trim=start_frame=${start},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,format=yuv420p`,
    '-frames:v', String(Math.min(N, C)), '-af', `atrim=start=${f6(start / FPS)},asetpts=PTS-STARTPTS,apad,atrim=end=${f6(dur)}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10', '-g', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', out];
}
/** Free prep before any upload (routing/cloudRun.ts → CloudWorkflowEntry.prepare): conform the clip, count it, cut the context. Writes input.h3x
 *  and the exact input length (sourceSeconds, which the result viewer's seam marker reads). Throws a plain validation error for a clip it can't use. */
export async function prepareH3xCloud(job: { id: string; input: Record<string, any> }) {
  const i = job.input; if (i.h3x?.source && existsSync(i.h3x.source) && existsSync(i.h3x.tail)) return;
  const fail = (m: string) => Object.assign(new Error(m), { reasonCode: 'input_invalid', errorType: 'validation' });
  const src = String(i.videoPath ?? ''); if (!src) throw fail(`${H3X_CLOUD_LABEL} needs the clip to extend`);
  const { probe } = await import('../media.js'); const { runFfmpeg } = await import('../ffmpeg.js');
  const pr = await probe(src); if (!pr || !(pr.width > 0)) throw fail('That clip could not be read. Re-export it as MP4 (H.264) and try again.');
  const conformed = path.join(DATA_DIR, `${job.id}-h3x-source.mp4`);
  if ((await runFfmpeg(conformExtendSourceArgs(src, conformed, { width: pr.width, height: pr.height, hasAudio: pr.hasAudio, seconds: pr.duration }))) !== 0) throw fail('That clip could not be prepared. Try another clip.');
  const N = await countFrames(conformed); const p = h3xPlan({ width: pr.width, height: pr.height, frames: N }, { seconds: i.extendSeconds, resolution: i.resolution });
  if ('error' in p) throw fail(p.error);
  const tail = path.join(DATA_DIR, `${job.id}-h3x-context.mp4`);
  if ((await runFfmpeg(h3xTailArgs(conformed, tail, N, p.guideFrames, p.gen.width, p.gen.height))) !== 0) throw fail('Could not read the last frames of that clip. Try another clip.');
  i.h3x = { source: conformed, frames: N, width: pr.width, height: pr.height, tail, hadAudio: pr.hasAudio };
  i.sourceSeconds = Math.round((N / FPS) * 1000) / 1000; i.outputDuration = Math.round(p.out.seconds * 100) / 100;
}
