/**
 * Fit to model, the server half (2026-10-26). The rules and maths live in shared/videoFit.ts; this file runs them with ffmpeg:
 *  - planForJob(): at submit, the plan for the job's clip on the chosen model (stored on job.input.videoFit; the quote computes the same plan).
 *  - runWithVideoFit(): around every run (queue.ts), for every route: before the run the clip is fitted locally (free, before any upload) and the
 *    job's videoPath points at the fitted copy (videoUrl keeps the user's clip); after a finished run each video result is cropped back to the
 *    clip's framing when it was padded (in place, same URL; sound copied untouched, so it stays in sync). job.videoFit records what was done.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { DATA_DIR } from './config.js';
import { runFfmpeg, videoSize } from './ffmpeg.js';
import { probe } from './media.js';
import { videoFitFor, restoreRect, videoFitSummary, type VideoFitPlan } from './shared/videoFit.js';
import type { Job } from './jobs.js';

/** ffmpeg -vf for a plan: crop (Crop to fill) → scale → pad (Keep everything, black or a blurred fill) → fps; the frame ends exactly plan.frame. */
export function fitFilter(p: VideoFitPlan): { vf?: string; fc?: string } {
  const { width: W, height: H } = p.frame; const parts: string[] = [];
  if (p.crop) parts.push(`crop=${p.crop.width}:${p.crop.height}:${p.crop.x}:${p.crop.y}`);
  const cw = p.content?.width ?? W, ch = p.content?.height ?? H;
  parts.push(`scale=${cw}:${ch}:flags=lanczos`, 'setsar=1');
  const fps = p.fps ? [`fps=${p.fps}`] : [];
  if (p.content && p.fill === 'blur') { // blurred-edge fill: the clip stretched over the frame, blurred, the sharp clip on top
    return { fc: `[0:v:0]${parts.join(',')},split[a][b];[a]scale=${W}:${H},boxblur=20:2,setsar=1[bg];[bg][b]overlay=${p.content.x}:${p.content.y}${fps.length ? ',' + fps[0] : ''},format=yuv420p[v]` }; }
  if (p.content) parts.push(`pad=${W}:${H}:${p.content.x}:${p.content.y}:black`);
  return { vf: [...parts, ...fps, 'format=yuv420p'].join(',') };
}
/** Write the fitted clip (H.264 / AAC MP4, sound kept). Throws one plain sentence. */
export async function applyFit(src: string, p: VideoFitPlan, dst: string): Promise<void> {
  const f = fitFilter(p); const t = p.trimTo ? ['-t', String(p.trimTo)] : [];
  const args = ['-v', 'error', '-y', '-i', src, ...t, ...(f.fc ? ['-filter_complex', f.fc, '-map', '[v]'] : ['-map', '0:v:0', '-vf', f.vf!]), '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-c:a', 'aac', '-movflags', '+faststart', dst];
  if ((await runFfmpeg(args)) !== 0) throw new Error(`Your clip could not be adjusted for ${p.model}. Nothing was sent.`);
}
/** Crop a padded result back to the clip's framing, in place. Returns false when there was nothing to undo (or the result's shape isn't the frame's). */
export async function restoreFile(file: string, p: VideoFitPlan): Promise<boolean> {
  const s = await videoSize(file); const r = s ? restoreRect(s.width, s.height, p) : null; if (!r || (r.width === s!.width && r.height === s!.height)) return false;
  const tmp = `${file}.fit-restore.mp4`;
  const code = await runFfmpeg(['-v', 'error', '-y', '-i', file, '-map', '0:v:0', '-map', '0:a?', '-vf', `crop=${r.width}:${r.height}:${r.x}:${r.y},setsar=1,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-c:a', 'copy', '-movflags', '+faststart', tmp]);
  if (code !== 0) { await rm(tmp, { force: true }); return false; }
  await rename(tmp, file); return true;
}

/** The plan for a parsed job (submit): source facts from parseCommon (width, height, duration = the clip / swap range, fps, videoFormat) + fit. */
export const planForJob = (toolId: string, providerId: string, input: Record<string, any>): VideoFitPlan | null =>
  input?.videoPath && !input.videoFitApplied ? videoFitFor(toolId, providerId, input) : null;

const fileOfUrl = (u: string | null | undefined) => (u && u.startsWith('/files/') ? path.join(DATA_DIR, decodeURIComponent(u.slice('/files/'.length))) : null);
/** Run a job with its clip fitted first and its results restored after (every route: local, cloud, mock). Jobs without a plan run as before. */
export async function runWithVideoFit(job: Job, run: () => Promise<unknown>): Promise<void> {
  const p = job.input?.videoFit as VideoFitPlan | undefined;
  if (!p || !p.changed || !job.input?.videoPath || job.input.videoFitApplied) { await run(); return; }
  const src = String(job.input.videoPath); const dst = path.join(DATA_DIR, `${job.id}-fit-${p.mode}-${p.frame.width}x${p.frame.height}.mp4`);
  if (!existsSync(dst)) await applyFit(src, p, dst);
  const fitted = await probe(dst);
  job.input.videoFitSourcePath = src; /* *Path: a host path, scrubbed from every API answer (index.ts scrubPaths) */ job.input.videoPath = dst; job.input.videoFitApplied = true; // videoUrl stays the user's clip (viewer, feed, Recreate)
  if (fitted) { job.input.width = fitted.width; job.input.height = fitted.height; if (p.trimTo) job.input.duration = Math.min(Number(job.input.duration) || p.trimTo, p.trimTo); }
  job.videoFit = videoFitSummary(p, null);
  await run();
  if (job.status !== 'done' || !p.restore) return;
  // The runners mark the job done as they save its results, so the crop-back follows at once (a second or two): each file is replaced in place
  // (same URL) and its cached size / poster dropped, so the feed and viewer pick up the restored framing.
  let any = false; const OM = await import('./outputMeta.js');
  for (const o of job.outputs ?? []) { const f = fileOfUrl(o.url); if (!f || !/\.(mp4|mov|webm)$/i.test(f) || !existsSync(f)) continue;
    if (!(await restoreFile(f, p).catch(() => false))) continue; any = true; OM.forgetOutputMeta(o.url);
    await rm(path.join(DATA_DIR, 'posters', `${createHash('sha1').update(o.url).digest('hex').slice(0, 16)}.jpg`), { force: true });
    const s = await videoSize(f); if (s && 'width' in o) Object.assign(o, { width: s.width, height: s.height }); }
  job.videoFit = videoFitSummary(p, any);
}
