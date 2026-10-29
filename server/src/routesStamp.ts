/**
 * "Add logo and text" (2026-10-28, shared/logoStamp.ts): the stamped copy of a result. The browser draws the logo, the text and the plate as one
 * transparent PNG at the result's exact size (and, for a video, an end card PNG); this route composites it with ffmpeg, nothing redrawn:
 *  - image: overlay at 0,0 → PNG (a JPEG result stays JPEG, quality 2). Pixels outside the stamp are the original's.
 *  - video: the same overlay for the whole clip, the sound kept (shareExport.brandVideo: H.264 + AAC), plus the end card when it's on.
 * Free: no model, no provider, no price. The original is never modified; the copy lives in <DATA_DIR>/stamps/<jobId>-<hash>.<ext>
 * (served at /files/stamps/…), cached by the hash of the inputs, and goes with the job when it is trashed or purged.
 *  POST /api/jobs/:id/stamp  multipart: out (output index, default 0), settings (JSON, StampSettings), overlay (PNG), endcard (PNG, video + endCard)
 *    → { ok, url, kind, cached, bytes, width, height, duration? }
 */
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { jobs } from './jobs.js';
import * as lib from './library.js';
import { ownerOf, LOCAL_OWNER } from './owner.js';
import { hasAlphaFmt, mediaDuration, pixFmt, runFfmpeg, videoSize } from './ffmpeg.js';
import { dataFileOf, VIDEO_RE } from './cleanMedia.js';
import { brandVideo, pngSize } from './shareExport.js';
import { normStamp } from './shared/logoStamp.js';

export const STAMP_DIR = () => path.join(DATA_DIR, 'stamps');
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const fail = (status: number, error: string, field?: string) => Object.assign(new Error(error), { status, field });

/** The ffmpeg args that put a full-size transparent PNG over an image, exactly (exported for tests). */
export function stampImageArgs(src: string, ov: string, out: string, alpha: boolean): string[] {
  const jpg = /\.jpe?g$/i.test(out);
  return ['-y', '-v', 'error', '-i', src, '-i', ov, '-filter_complex', `[0:v]format=${alpha ? 'rgba' : 'rgb24'}[b];[b][1:v]overlay=0:0:format=rgb:alpha=straight[o]`, '-map', '[o]', '-frames:v', '1',
    ...(jpg ? ['-q:v', '2', '-pix_fmt', 'yuvj444p'] : ['-pix_fmt', alpha ? 'rgba' : 'rgb24']), '-map_metadata', '-1', '-fflags', '+bitexact', out];
}
const running = new Map<string, Promise<string>>();
/** Stamp an image file: the overlay must be a PNG of the image's size. Cached by the hash of both. */
export async function stampImage(jobId: string, src: string, overlay: Buffer, dir = STAMP_DIR()): Promise<{ file: string; cached: boolean }> {
  const st = statSync(src); const size = await videoSize(src); // ffprobe reads still images too
  if (!size) throw fail(422, 'Could not read this image.');
  const ov = pngSize(overlay); if (!ov || ov.width !== size.width || ov.height !== size.height) throw fail(400, `The overlay must be a PNG of ${size.width}×${size.height}.`, 'overlay');
  const ext = /\.jpe?g$/i.test(src) ? 'jpg' : 'png';
  const hash = createHash('sha1').update(`img|${src}|${st.size}|${st.mtimeMs}|`).update(overlay).digest('hex').slice(0, 12);
  const out = path.join(dir, `${jobId}-${hash}.${ext}`); if (existsSync(out)) return { file: out, cached: true };
  const busy = running.get(out); if (busy) return { file: await busy, cached: true };
  const job = (async () => {
    mkdirSync(dir, { recursive: true }); const tmp = path.join(dir, `.${jobId}-${hash}`); const ovp = `${tmp}-ov.png`, part = `${tmp}.part.${ext}`;
    writeFileSync(ovp, overlay);
    try {
      const alpha = ext === 'png' && hasAlphaFmt(await pixFmt(src));
      if (await runFfmpeg(stampImageArgs(src, ovp, part, alpha)) !== 0) throw fail(500, 'ffmpeg could not add the logo.');
      renameSync(part, out); return out;
    } finally { for (const f of [ovp, part]) rmSync(f, { force: true }); }
  })().finally(() => running.delete(out));
  running.set(out, job); return { file: await job, cached: false };
}
/** Remove every stamped copy of a job (trash / purge). */
export function dropStamps(jobId: string) { const dir = STAMP_DIR(); if (!existsSync(dir)) return; for (const f of readdirSync(dir)) if (f.startsWith(`${jobId}-`)) rmSync(path.join(dir, f), { force: true }); }
lib.trashHooks.push(dropStamps);

const MAX_PNG = 60 * 1024 * 1024;
export function registerStamp(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>('/api/jobs/:id/stamp', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
    if (ownerOf(j) !== LOCAL_OWNER) return reply.code(403).send({ error: 'Only the owner can add a logo to this.', errorType: 'forbidden' });
    if (j.status !== 'done') return reply.code(409).send({ error: 'Only finished results can get a logo.', errorType: 'validation', code: 'not_done' });
    const fields: Record<string, string> = {}; const files: Record<string, Buffer> = {};
    try { for await (const part of (req as any).parts()) { if (part.type === 'file') { const b: Buffer = await part.toBuffer(); if (b.length > MAX_PNG) return reply.code(413).send({ error: 'PNG too large.', errorType: 'validation' }); files[part.fieldname] = b; } else fields[part.fieldname] = String(part.value ?? ''); } }
    catch { return reply.code(400).send({ error: 'Send multipart form data: overlay (PNG) and, for a video end card, endcard (PNG).', errorType: 'validation' }); }
    const outs = j.outputs.length ? j.outputs : j.resultUrl ? [{ label: 'Result', url: j.resultUrl }] : [];
    const ix = fields.out == null || fields.out === '' ? 0 : Number(fields.out);
    const o = Number.isInteger(ix) && ix >= 0 ? outs[ix] : undefined;
    if (!o) return reply.code(400).send({ error: 'out must be the index of one of this result\'s outputs.', errorType: 'validation', issues: [{ code: 'out_of_range', field: 'out', message: 'output index' }] });
    const clean = o.url.split('?')[0]; const src = dataFileOf(clean); const isVideo = VIDEO_RE.test(clean), isImage = IMAGE_RE.test(clean);
    if (!src || (!isVideo && !isImage)) return reply.code(409).send({ error: 'Only image and video results on this computer can get a logo.', errorType: 'validation', code: 'unsupported_media' });
    let settings; try { settings = normStamp(JSON.parse(fields.settings || '{}')); } catch { return reply.code(400).send({ error: 'settings must be JSON.', errorType: 'validation' }); }
    if (!files.overlay || !pngSize(files.overlay)) return reply.code(400).send({ error: 'overlay must be a PNG at the result\'s size.', errorType: 'validation', issues: [{ code: 'invalid', field: 'overlay', message: 'PNG' }] });
    const wantEnd = isVideo && settings.endCard;
    if (wantEnd && (!files.endcard || !pngSize(files.endcard))) return reply.code(400).send({ error: 'endcard must be a PNG when the end card is on.', errorType: 'validation', issues: [{ code: 'invalid', field: 'endcard', message: 'PNG' }] });
    const endColor = /^#[0-9a-f]{6}$/i.test(fields.endColor ?? '') ? `0x${fields.endColor!.slice(1)}` : undefined;
    try {
      const r = isVideo ? await brandVideo(j.id, src, { overlay: files.overlay, endCard: wantEnd ? files.endcard : null, key: JSON.stringify({ stamp: settings, out: ix }), dir: STAMP_DIR(), endColor })
        : await stampImage(j.id, src, files.overlay);
      const size = await videoSize(r.file);
      return { ok: true, url: `/files/stamps/${path.basename(r.file)}`, kind: isVideo ? 'video' : 'image', cached: r.cached, bytes: statSync(r.file).size, width: size?.width ?? null, height: size?.height ?? null,
        ...(isVideo ? { duration: await mediaDuration(r.file) } : {}) };
    } catch (e: any) { return reply.code(e?.status ?? 500).send({ error: e?.message ?? 'Couldn’t add the logo.', errorType: e?.status === 400 ? 'validation' : 'internal', ...(e?.field ? { issues: [{ code: 'invalid', field: e.field, message: e.message }] } : {}) }); }
  });
}
