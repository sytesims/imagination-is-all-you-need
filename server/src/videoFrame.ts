/**
 * A frame of a video as a still (2026-10-26, "use a video's frame as the start image"). One helper for every place that needs it:
 *  - POST /api/media/frame (routesFrame.ts): the result viewer's "Continue from last frame" / "Use this frame" / "Save frame as image" and
 *    the media picker's "Pick a frame" (first, last or any time) in every image slot;
 *  - GET /api/jobs/:id/prefill?t=last|first|<sec> (routesPrefill.ts): the hand-off into Video → Generate with the frame in the start slot;
 *  - LTX-2.5 Extend's exact-last-frame guide (comfy/ltx25Extend.ts guideArgs, G = 1) uses frameIndexArgs.
 * Exact: "last" counts the frames (ffprobe -count_frames, decodes the stream) and takes frame N-1, never a seek near the end that can land a
 * frame early. "at" takes the first frame shown at or after that time (accurate seek); past the last frame it is the last frame.
 * Full resolution (no scaling; a rotated phone clip comes out upright), PNG, no metadata (-map_metadata -1, bitexact: no encoder tag), so the
 * same frame is the same bytes and the asset store keeps it once.
 */
import path from 'node:path';
import { existsSync, statSync, readFileSync, renameSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { runFfmpeg, countFrames, mediaDuration, videoSize } from './ffmpeg.js';
import { DATA_DIR, SAMPLES_DIR, WEB_PUBLIC_DIR } from './config.js';

export type FrameAt = { kind: 'first' } | { kind: 'last' } | { kind: 'time'; t: number };
/** 'first' | 'last' | seconds (number or numeric string, ≥ 0). Anything else → error. */
export function parseFrameAt(v: unknown): FrameAt | { error: string } {
  if (v == null || v === '') return { error: 'at must be first, last or a time in seconds.' };
  const s = String(v).trim().toLowerCase();
  if (s === 'first' || s === 'start') return { kind: 'first' };
  if (s === 'last' || s === 'end') return { kind: 'last' };
  const t = Number(s); if (!Number.isFinite(t) || t < 0) return { error: 'at must be first, last or a time in seconds (0 or more).' };
  return t === 0 ? { kind: 'first' } : { kind: 'time', t };
}
/** A short key for file names: first | last | <ms> */
export const frameKey = (at: FrameAt) => (at.kind === 'time' ? String(Math.round(at.t * 1000)) : at.kind);
/** The shared output flags: one frame, PNG, no metadata, bitexact. */
const OUT = (out: string) => ['-map_metadata', '-1', '-map_chapters', '-1', '-an', '-sn', '-dn', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-frames:v', '1', '-update', '1', out];
/** ffmpeg args: frame number `index` (0-based) of `src`. */
export const frameIndexArgs = (src: string, out: string, index: number): string[] =>
  ['-y', '-v', 'error', '-i', src, '-map', '0:v:0', '-vf', `trim=start_frame=${Math.max(0, Math.floor(index))},setpts=PTS-STARTPTS`, ...OUT(out)];
/** ffmpeg args: the first frame at or after `t` seconds (accurate seek). */
export const frameTimeArgs = (src: string, out: string, t: number): string[] =>
  ['-y', '-v', 'error', '-ss', String(Math.round(t * 1e6) / 1e6), '-i', src, '-map', '0:v:0', ...OUT(out)];

export interface FrameResult { ok: true; at: FrameAt; /** frames in the clip (known for last) */ frames?: number; /** 0-based frame taken (first / last) */ index?: number; t?: number; width?: number; height?: number }
/** Write the chosen frame of `src` to `out` (a .png path). */
export async function extractFrame(src: string, out: string, at: FrameAt): Promise<FrameResult | { ok: false; error: string; code: string }> {
  if (!existsSync(src)) return { ok: false, error: 'That video is no longer on disk.', code: 'missing' };
  const tmp = `${out}.${randomUUID().slice(0, 6)}.png`;
  const done = async (r: Omit<FrameResult, 'ok' | 'width' | 'height'>): Promise<FrameResult | { ok: false; error: string; code: string }> => {
    if (!existsSync(tmp) || statSync(tmp).size === 0) { await unlink(tmp).catch(() => undefined); return { ok: false, error: 'Couldn’t read a frame from that video.', code: 'frame_failed' }; }
    renameSync(tmp, out); const sz = await videoSize(out); return { ok: true, ...r, ...(sz ?? {}) };
  };
  if (at.kind === 'first') { await runFfmpeg(frameIndexArgs(src, tmp, 0)); return done({ at, index: 0, t: 0 }); }
  if (at.kind === 'time') {
    const dur = await mediaDuration(src);
    if (dur && at.t < dur) { await runFfmpeg(frameTimeArgs(src, tmp, at.t)); if (existsSync(tmp) && statSync(tmp).size > 0) return done({ at, t: at.t }); }
    // at or past the end (or a seek that found nothing): the last frame
  }
  const N = await countFrames(src); if (!N) return { ok: false, error: 'That video has no frames to read.', code: 'no_frames' };
  await runFfmpeg(frameIndexArgs(src, tmp, N - 1)); return done({ at, frames: N, index: N - 1 });
}

/** A media URL this server serves → its file (/files/, /samples/, /showcase/), null for anything else (no remote URLs, no `..`). */
export function mediaFileOf(url: unknown): string | null {
  const u = String(url ?? '').split(/[?#]/)[0]; if (!u || u.includes('..') || u.includes('\0')) return null;
  let rel: string;
  try { rel = decodeURIComponent(u); } catch { return null; }
  const pick = (base: string, sub: string) => { const f = path.resolve(base, sub); return f.startsWith(path.resolve(base) + path.sep) ? f : null; };
  if (rel.startsWith('/files/')) return pick(DATA_DIR, rel.slice(7));
  if (rel.startsWith('/samples/')) return pick(SAMPLES_DIR, rel.slice(9));
  if (rel.startsWith('/showcase/') || rel.startsWith('/examples/starter/')) return pick(WEB_PUBLIC_DIR, rel.slice(1)); // featured inputs (shared/featured.ts; the starter pack's own folder)
  return null;
}
export const isVideoFile = (f: string) => /\.(mp4|mov|webm|m4v)$/i.test(f);

/** Where a saved frame came from (kept on its media row). */
export interface FrameOf { url: string; jobId?: string | null; out?: number | null; at: 'first' | 'last' | 'time'; t?: number | null; index?: number | null; frames?: number | null }
/**
 * Extract a frame into the asset store and list it in the media library (the picker's Uploads, any image slot):
 * content-addressed `upl-<sha256:16>.png` like every upload, so the same frame twice is one file. Returns the row plus its size.
 */
export async function saveFrameAsset(src: string, at: FrameAt, from: Omit<FrameOf, 'at' | 't' | 'index' | 'frames'> & { name?: string; projectIds?: string[] }) {
  const tmp = path.join(DATA_DIR, `frm-tmp-${randomUUID().slice(0, 8)}.png`);
  const r = await extractFrame(src, tmp, at); if (!r.ok) return r;
  const buf = readFileSync(tmp); const hash = createHash('sha256').update(buf).digest('hex'); const id = `upl-${hash.slice(0, 16)}`; const name = `${id}.png`; const file = path.join(DATA_DIR, name);
  if (existsSync(file)) await unlink(tmp).catch(() => undefined); else renameSync(tmp, file);
  const { recordUpload } = await import('./mediaLibrary.js'); const { rememberHash } = await import('./mediaStore.js'); const { all } = await import('./db.js');
  const prev = all<any>('uploads').find((u) => u.id === id);
  const kind = at.kind === 'time' && r.t == null ? 'last' : at.kind; // a time at or past the end took the last frame
  const frameOf: FrameOf = { url: from.url, jobId: from.jobId ?? null, out: from.out ?? null, at: kind, t: r.t ?? null, index: r.index ?? null, frames: r.frames ?? null };
  const label = kind === 'last' ? 'Last frame' : kind === 'first' ? 'First frame' : `Frame at ${Math.round((r.t ?? 0) * 100) / 100} s`;
  const row = { id, url: `/files/${name}`, name: (from.name ? `${label} · ${from.name}` : label).slice(0, 120), type: 'image' as const, createdAt: Date.now(),
    projectIds: [...new Set([...(prev?.projectIds ?? []), ...(from.projectIds ?? [])])], frameOf };
  recordUpload(row); rememberHash(name, hash, buf.length);
  const job = await recordFrameJob(row, label);
  return { ok: true as const, item: { ...row, width: r.width ?? null, height: r.height ?? null, jobId: job.id }, frame: r };
}

/**
 * The saved frame in Assets (2026-10-26): a finished local job (toolId video-frame, like Stitch's compose jobs) whose output is the PNG, made
 * from the source video's job (parentId, the viewer's "Made from") and in the source's project. Trash, restore, purge, favourites and projects
 * are the jobs' own; the same frame saved twice is one job (a trashed one comes back). Purging it drops the upload row too (routesEdge purge).
 */
export async function recordFrameJob(row: { id: string; url: string; name: string; projectIds?: string[]; frameOf?: FrameOf }, label: string) {
  const { jobs, persistJob } = await import('./jobs.js'); const lib = await import('./library.js'); const { FRAME_TOOL } = await import('./pages.js');
  const mine = [...jobs.values()].filter((j) => j.toolId === FRAME_TOOL && (j.input as any)?.frameUploadId === row.id);
  const live = mine.find((j) => !lib.metaOf(j.id).deletedAt); if (live) return live;
  if (mine[0]) { lib.restore(mine[0].id); return mine[0]; }
  const id = randomUUID().slice(0, 8); const now = Date.now(); const f = row.frameOf;
  const job: any = { id, toolId: FRAME_TOOL, provider: 'local-ffmpeg', status: 'done', stage: 'done', progress: 100, queuePos: 0, eta: 0, resultUrl: row.url, outputs: [{ label, url: row.url }],
    error: null, errorType: null, warnings: [], parentId: f?.jobId ?? null, createdAt: now, startedAt: now, finishedAt: now, updatedAt: now, cost: 0, refunded: 0,
    input: { prompt: row.name, videoUrl: f?.url ?? null, frameUploadId: row.id, frameOf: f ?? null }, modelName: 'ffmpeg (local)', runOn: 'local' };
  jobs.set(id, job); persistJob(job);
  const pid = row.projectIds?.find((x) => !!lib.getProject(x)); if (pid) lib.setProject(id, pid);
  return job;
}
