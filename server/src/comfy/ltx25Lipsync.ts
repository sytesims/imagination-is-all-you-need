/**
 * LTX-2.5 lip sync (Voice → Talking photo, provider comfy-ltx25-lipsync, 2026-10-26): a photo (or text only) + a speech clip → a talking clip
 * whose soundtrack is your speech. Free and local, on the same Mac files as Generate Video's LTX-2.5 22B route (no download).
 *
 * Graph: workflows/ltx25-a2v-api.json, the core audio-to-video path of Lightricks' LTX-2.5_A2V_Two_Stage_Distilled.json
 * (github.com/Lightricks/ComfyUI-LTXVideo, example_workflows/2.5) built on our ltx25-ti2v graph (official template video_ltx2_5_i2v, node ids
 * kept, see comfy/ltx25Video.ts): the speech is trimmed (TrimAudioDuration), encoded (LTXVAudioVAEEncode) and frozen with a zero noise mask
 * (SolidMask 0 → SetLatentNoiseMask) in BOTH stages, so the model only draws the picture to the sound; the audio is never decoded back.
 * As in Lightricks' graph, the soundtrack is the input audio itself (CreateVideo audio = Load Audio). Lightricks' optional Gemma API prompt
 * enhancer (its only non-core node) is left out; we use CLIPTextEncode like the template.
 *
 * The speech is prepared by our server first (audio/lipDriver.ts, the QuokkaiLab recipe): node 400 loads the processed driver that
 * conditions the model, node 410 the clean speech with the same timing, muxed as the soundtrack. Length follows the speech
 * (8k + 1 frames at 24 fps, ≤ 113 frames = 4.71 s on this Mac for now). Sizes: Draft / Sharper as Generate Video (448p / 576p); a photo's shape
 * picks 16:9 / 9:16 / 1:1, text only is 9:16 portrait (Quokka's recommended framing).
 * Pure: tests check it without ComfyUI.
 */
import { imageDimsOfFile } from '../imageDims.js';
import { ltx25Size, LTX25_FPS } from './ltx25Video.js';

export const LTX25_LIPSYNC = 'comfy-ltx25-lipsync';
export const LTX25_A2V_WORKFLOW = 'ltx25-a2v-api.json';
/** Visual-only words the model gets (Quokka: no quoted dialogue in the prompt, which avoids subtitles). */
export const LIPSYNC_BASE_PROMPT = 'The person speaks naturally to the camera, with clear lip and jaw movements in sync with the voice. The head stays mostly still. Static camera.';
export const lipsyncPrompt = (user?: string) => { const u = String(user ?? '').replace(/["“”]/g, '').trim(); return u ? `${u.replace(/[.!?]*$/, '.')} ${LIPSYNC_BASE_PROMPT}` : LIPSYNC_BASE_PROMPT; };
type G = Record<string, any>;
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';

export function patchLtx25Lipsync(g: G, i: Record<string, any>, seed: number): { graph: G; output: string; expect: Record<string, any> } {
  const lip = i.lip ?? {}; const frames = Number(lip.frames); const audioSeconds = Number(lip.audioSeconds);
  if (!i.lipDriverPath || !i.lipCleanPath || !(frames > 0) || (frames - 1) % 8 !== 0) throw new Error('ltx25-lipsync: the speech was not prepared (driver, soundtrack and an 8k + 1 frame count)');
  const first: string | undefined = i.imagePath ?? undefined;
  const dims = first ? (i.imageSize ?? imageDimsOfFile(first)) : null;
  const size = ltx25Size(i.resolution, i.aspect && i.aspect !== 'auto' ? i.aspect : first ? 'auto' : '9:16', dims);
  const prompt = String(i.finalPrompt ?? lipsyncPrompt(i.prompt));
  g['364'].inputs.text = prompt; g['365'].inputs.frame_rate = LTX25_FPS;
  Object.assign(g['356'].inputs, { width: size.stage1.width, height: size.stage1.height, length: frames, batch_size: 1 });
  g['400'].inputs.audio = { __file: i.lipDriverPath }; g['401'].inputs.duration = audioSeconds;
  g['410'].inputs.audio = { __file: i.lipCleanPath };
  g['339'].inputs.noise_seed = seed; g['370'].inputs.fps = LTX25_FPS;
  if (first) { g['395'].inputs.image = { __file: first }; Object.assign(g['351'].inputs, { width: size.width, height: size.height }); }
  else { // text only: the template's "Switch to Text to Video" (as comfy/ltx25Video.ts)
    g['377'].inputs.video_latent = ['356', 0]; g['340'].inputs.video_latent = ['348', 0];
    for (const id of ['395', '351', '350', '357', '349']) delete g[id];
  }
  for (const [id, n] of Object.entries<any>(g)) for (const [k, v] of Object.entries<any>(n.inputs)) if (isLink(v) && !g[v[0]]) throw new Error(`ltx25-lipsync graph: ${id}.${k} links to missing node ${v[0]}`);
  return { graph: g, output: '75', expect: { mode: first ? 'i2v' : 't2v', seed, prompt, frames, seconds: frames / LTX25_FPS, audioSeconds, fps: LTX25_FPS, width: size.width, height: size.height, stage1: size.stage1, aspect: size.aspect, size: size.size,
    fix: i.lipFix !== false, audioFrozen: true, soundtrack: 'input speech' } };
}
