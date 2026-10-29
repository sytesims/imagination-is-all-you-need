/**
 * POST /api/media/frame (2026-10-26): a frame of a video result or upload as a PNG in the media library (videoFrame.ts).
 * Body (JSON): { jobId, out? } (a result's output, default 0) or { url } (/files/…, /samples/…, /showcase/…), and at = first | last | <seconds>.
 * → 200 { item: { id, url, name, type: 'image', width, height, frameOf }, frame: { at, index?, frames?, t? } }. The item is listed in the picker's
 * Uploads (any image slot can take it) and keeps its source (frameOf). 400 validation (bad at, not a video), 404 unknown job / file.
 */
import type { FastifyInstance } from 'fastify';
import { jobs } from './jobs.js';
import * as lib from './library.js';
import { getTool } from './tools/registry.js';
import { all } from './db.js';
import type { UploadRow } from './mediaLibrary.js';
import { parseFrameAt, mediaFileOf, isVideoFile, saveFrameAsset } from './videoFrame.js';

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, errorType: 'validation', code, issues: [{ code, field, message }] });

/** The source video of a frame request: a job's output or a served URL. */
export function frameSource(b: { jobId?: unknown; out?: unknown; url?: unknown }): { file: string; url: string; jobId: string | null; out: number | null; name: string; projectIds: string[] } | { status: number; body: any } {
  if (b.jobId != null && b.jobId !== '') {
    const j = jobs.get(String(b.jobId)); if (!j || lib.metaOf(j.id).deletedAt) return { status: 404, body: { error: 'No result with that id.', errorType: 'not_found' } };
    const out = b.out == null || b.out === '' ? 0 : Number(b.out);
    if (!Number.isInteger(out) || out < 0) return { status: 400, body: bad('out', 'out must be an output index (0, 1, …).', 'out_of_range') };
    const o = j.status === 'done' ? j.outputs?.[out] ?? (out === 0 && j.resultUrl ? { url: j.resultUrl } : null) : null;
    if (!o) return { status: 400, body: bad('out', j.status === 'done' ? `This result has no output ${out}.` : 'This result isn’t finished yet.', 'out_of_range') };
    const file = mediaFileOf(o.url);
    if (!file || !isVideoFile(file)) return { status: 400, body: bad('jobId', file ? 'That result isn’t a video.' : 'That video isn’t on this computer yet.', 'not_video') };
    const pr = String(j.input?.prompt ?? '').trim(); const name = pr ? pr.slice(0, 60) : getTool(j.toolId)?.name ?? j.toolId;
    const pid = lib.metaOf(j.id).projectId;
    return { file, url: o.url, jobId: j.id, out, name, projectIds: pid ? [pid] : [] };
  }
  const url = typeof b.url === 'string' ? b.url : ''; const file = mediaFileOf(url);
  if (!url) return { status: 400, body: bad('url', 'Send jobId (a video result) or url (a video file).', 'required') };
  if (!file) return { status: 400, body: bad('url', 'url must be a file of this app (/files/…, /samples/…).', 'invalid') };
  if (!isVideoFile(file)) return { status: 400, body: bad('url', 'That file isn’t a video.', 'not_video') };
  const clean = url.split(/[?#]/)[0]; const row = all<UploadRow>('uploads').find((u) => u.url === clean); // an upload keeps its own name and projects
  return { file, url: clean, jobId: null, out: null, name: row?.name ?? '', projectIds: row?.projectIds ?? [] };
}

export function registerFrame(app: FastifyInstance) {
  app.post<{ Body: { jobId?: unknown; out?: unknown; url?: unknown; at?: unknown } | undefined }>('/api/media/frame', async (req, reply) => {
    const b = req.body ?? {}; const at = parseFrameAt(b.at ?? 'last');
    if ('error' in at) return reply.code(400).send(bad('at', at.error));
    const src = frameSource(b); if ('status' in src) return reply.code(src.status).send(src.body);
    const r = await saveFrameAsset(src.file, at, { url: src.url, jobId: src.jobId, out: src.out, name: src.name, projectIds: src.projectIds });
    if (!r.ok) return reply.code(r.code === 'missing' ? 404 : 400).send(bad('at', r.error, r.code));
    return { item: r.item, frame: { at: at.kind, index: r.frame.index ?? null, frames: r.frame.frames ?? null, t: r.frame.t ?? null } };
  });
}
