/**
 * H3 Extend · via last frame (2026-10-26, H3 map F3): MiniMax H3 on Comfy Router has no extend endpoint, so this place continues a clip the honest
 * way: the source's EXACT last frame (videoFrame.ts, the shared frame grab) is the first frame of a Router H3 image-to-video run with the user's
 * prompt (+5, +8 or +10 s), then the new clip is joined onto the source with the shared extend join (comfy/ltx25Extend.ts joinExtension: the
 * source conformed to 24 fps with its sound, the generated copy of the last frame dropped so it never shows twice, the source's sound followed by
 * H3's own generated sound, loudness-matched to the source's last 2 s, with a short de-click after the cut). Motion is not carried over (one still guides it), which is why it is labelled "via last frame".
 * The local graph (true continuation) and fal's H3 Max extend-video stay as their own places.
 */
import path from 'node:path';
import { probe } from '../../media.js';
import { runFfmpeg } from '../../ffmpeg.js';
import { extractFrame } from '../../videoFrame.js';
import { conformExtendSourceArgs, joinExtension, countFrames, LTX25_EXTEND_FPS, type ExtendPlan } from '../../comfy/ltx25Extend.js';

/** Lengths this place adds (Router H3 makes 5–15 s clips; the page offers +5 / +8 / +10). */
export const H3_ROUTER_EXTEND_SECONDS = [5, 8, 10] as const;
export const H3_ROUTER_EXTEND_LABEL = 'H3 Extend · via last frame';
type In = Record<string, any>;
/** Why this job can't run on the via-last-frame place (null = fine). Quote, submit and the body share it. */
export function h3RouterExtendIssue(i: In): string | null {
  const m = String(i.mode ?? (Array.isArray(i.types) ? i.types[0] : '') ?? '');
  if (m && m !== 'extend') return `${H3_ROUTER_EXTEND_LABEL} only extends clips`;
  if (i.direction === 'backward' || i.reverseOutput) return `${H3_ROUTER_EXTEND_LABEL} continues forward from the last frame; a backward extend runs on your computer`;
  const s = Number(i.extendSeconds); if (i.extendSeconds != null && i.extendSeconds !== '' && !(H3_ROUTER_EXTEND_SECONDS as readonly number[]).includes(s)) return `${H3_ROUTER_EXTEND_LABEL} adds ${H3_ROUTER_EXTEND_SECONDS.join(', ')} seconds`;
  return null;
}
/** Seconds of new footage (= the Router clip length, what is billed). */
export const h3RouterExtendSeconds = (i: In) => { const s = Number(i.extendSeconds); return (H3_ROUTER_EXTEND_SECONDS as readonly number[]).includes(s) ? s : 5; };
/** The exact last frame of the job's source clip as a PNG next to it (written once per job). */
export async function h3ExtendLastFrame(i: In): Promise<string> {
  const src = String(i.videoPath ?? ''); if (!src) throw new Error(`${H3_ROUTER_EXTEND_LABEL} needs the clip to extend`);
  const out = path.join(path.dirname(src), `${path.basename(src, path.extname(src))}-lastframe.png`);
  const r = await extractFrame(src, out, { kind: 'last' }); if (!r.ok) throw new Error(`${H3_ROUTER_EXTEND_LABEL}: ${r.error}`);
  return out;
}
const even = (x: number) => Math.max(2, Math.floor(x / 2) * 2);
/** Join the Router clip onto the source: conform the source (24 fps, its size, its sound or a silent track), then the shared extend join with the
 *  exact last frame as the one-frame guide (dropped from the new clip) and no picture crossfade. Returns the joined file. */
export async function joinRouterExtension(source: string, gen: string, outFile: string, o: { audio: boolean }): Promise<{ frames: number; seconds: number; width: number; height: number }> {
  const p = await probe(source); if (!p || !(p.width > 0)) throw new Error('the source clip could not be read for the join');
  const W = even(p.width), H = even(p.height); const conformed = outFile.replace(/\.mp4$/i, '') + '-source24.mp4';
  if ((await runFfmpeg(conformExtendSourceArgs(source, conformed, { width: p.width, height: p.height, hasAudio: p.hasAudio, seconds: p.duration }))) !== 0) throw new Error('the source clip could not be prepared for the join');
  const N = await countFrames(conformed); const T = await countFrames(gen); if (!N || !T) throw new Error('the clips could not be counted for the join');
  const plan: ExtendPlan = { seconds: 0, resolution: '768p', fps: LTX25_EXTEND_FPS, guideFrames: 1, crossfade: 0, audioXfade: 1 / LTX25_EXTEND_FPS,
    source: { width: W, height: H, frames: N, seconds: N / LTX25_EXTEND_FPS }, gen: { width: W, height: H, stage1: { width: W / 2, height: H / 2 }, frames: T },
    out: { width: W, height: H, frames: N + T - 1, seconds: (N + T - 1) / LTX25_EXTEND_FPS, added: T - 1 } };
  const r = await joinExtension(conformed, gen, outFile, plan, { audio: o.audio });
  return { frames: r.frames, seconds: Math.round((r.frames / LTX25_EXTEND_FPS) * 100) / 100, width: W, height: H };
}
