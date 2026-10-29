/**
 * Result overlay backend: B1 save an element from a job output / video frame (helper used by
 * POST /api/elements in index.ts), B2 add an image to an element, B4 prev/next neighbours, B5 output metadata warm-up, and the
 * Community seed (spec B6). B3 prefill and B7 owner live in routesPrefill.ts / owner.ts (another worker).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { copyFile } from 'node:fs/promises';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { jobs } from './jobs.js';
import * as lib from './library.js';
import { runFfmpeg } from './ffmpeg.js';
import { filterJobList, type JobListQuery } from './routesEdge.js';
import { kindOfUrl, localFileOf, probeOutput, renderPoster, warmOutputs } from './outputMeta.js';
import { seedCommunity } from './communitySeed.js';
import { seedFeatured } from './featuredSeed.js';

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, errorType: 'validation', code, issues: [{ code, field, message }] });
export interface FromOutput { url: string; source: { jobId: string; output: number; t: number | null }; frame: 'image' | 'frame' | 'poster'; note?: string }

/**
 * B1/B2: the image an element gets from output `output` of job `jobId`. Image output → a copy of that image. Video output →
 * the frame at `t` seconds (default 0, clamped to the clip) grabbed with ffmpeg; if ffmpeg is missing or fails, the output's
 * poster is used and `note` says so. Audio outputs, unknown jobs/outputs and bad `t` → {status, body} validation errors.
 */
export async function imageFromOutput(jobId: string, outputRaw: unknown, tRaw: unknown): Promise<FromOutput | { status: number; body: any }> {
  const j = jobs.get(jobId); if (!j || lib.metaOf(j.id).deletedAt) return { status: 404, body: { ...bad('fromJob', `Result ${jobId} not found.`, 'not_found'), errorType: 'not_found' } };
  const output = outputRaw == null || outputRaw === '' ? 0 : Number(outputRaw);
  if (!Number.isInteger(output) || output < 0) return { status: 400, body: bad('output', 'output must be a whole number ≥ 0 (the index in the result\'s outputs).') };
  if (j.status !== 'done') return { status: 409, body: bad('fromJob', 'Only finished results can be saved as an element.', 'not_done') };
  const o = j.outputs[output] ?? (output === 0 && j.resultUrl ? { label: 'Result', url: j.resultUrl } : null);
  if (!o) return { status: 400, body: bad('output', `This result has ${j.outputs.length} output${j.outputs.length === 1 ? '' : 's'}; there is no output ${output}.`, 'out_of_range') };
  const kind = kindOfUrl(o.url); const file = localFileOf(o.url);
  if (kind === 'audio' || !kind) return { status: 400, body: bad('output', 'Only image and video outputs can become an element.', 'unsupported_media') };
  let t: number | null = null;
  if (tRaw != null && tRaw !== '') { t = Number(tRaw); if (!Number.isFinite(t) || t < 0) return { status: 400, body: bad('t', 't must be a number of seconds ≥ 0.') }; }
  const source = { jobId: j.id, output, t: kind === 'video' ? (t ?? 0) : null };
  if (kind === 'image') {
    if (!file) return { url: o.url, source, frame: 'image' };
    const name = `el-${randomUUID().slice(0, 8)}${path.extname(file) || '.png'}`; await copyFile(file, path.join(DATA_DIR, name));
    return { url: `/files/${name}`, source, frame: 'image', ...(t != null ? { note: 't is ignored for image outputs.' } : {}) };
  }
  const meta = await probeOutput(o.url); const poster = meta.posterUrl && localFileOf(meta.posterUrl) ? meta.posterUrl : null; const dur = meta.durationSec ?? 0; const at = Math.max(0, Math.min(t ?? 0, dur > 0.1 ? dur - 0.05 : 0)); source.t = Math.round(at * 1000) / 1000;
  if (file) {
    const name = `el-${randomUUID().slice(0, 8)}.jpg`; const dst = path.join(DATA_DIR, name);
    const code = await runFfmpeg(['-y', '-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-q:v', '2', dst]);
    if (code === 0 && existsSync(dst)) return { url: `/files/${name}`, source, frame: 'frame', ...(t != null && at !== t ? { note: `t was clamped to ${source.t} s (clip length ${dur} s).` } : {}) };
    if (poster) return { url: poster, source: { ...source, t: null }, frame: 'poster', note: code === 127 ? 'ffmpeg is not installed, so the video poster was saved instead of the frame.' : 'Could not read that frame, so the video poster was saved instead.' };
  } else if (poster) return { url: poster, source: { ...source, t: null }, frame: 'poster', note: 'The video is not stored locally, so its poster was saved instead of the frame.' };
  return { status: 400, body: bad('t', 'Could not read a frame from this video, and it has no poster.', 'frame_failed') };
}

/** Reads `image` (multipart file) or fields/JSON {fromJob, output, t, ...}. */
async function readBody(req: FastifyRequest): Promise<{ fields: Record<string, string>; url: string } | { status: number; body: any }> {
  const fields: Record<string, string> = {}; let url = '';
  if (req.isMultipart()) {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const ext = path.extname(part.filename || '') || '.png';
        if (!/\.(png|jpe?g|webp)$/i.test(ext)) { part.file.resume(); return { status: 400, body: bad('image', 'Elements must be PNG, JPG or WEBP.') }; }
        const name = `el-${randomUUID().slice(0, 8)}${ext}`; await pipeline(part.file, createWriteStream(path.join(DATA_DIR, name))); url = `/files/${name}`;
      } else fields[part.fieldname] = String(part.value);
    }
  } else for (const [k, v] of Object.entries((req.body as Record<string, unknown>) ?? {})) if (v != null) fields[k] = String(v);
  return { fields, url };
}
const send = (reply: FastifyReply, r: { status: number; body: any }) => reply.code(r.status).send(r.body);

export function registerOverlay(app: FastifyInstance) {
  /** B2: add an image to an existing element: multipart `image`, or {fromJob, output?, t?} (same rules as POST /api/elements). */
  app.post<{ Params: { id: string } }>('/api/elements/:id/images', async (req, reply) => {
    if (!lib.getElement(req.params.id)) return reply.code(404).send({ error: `element ${req.params.id} not found`, errorType: 'not_found' });
    const b = await readBody(req); if ('status' in b) return send(reply, b);
    let url = b.url; let extra: Partial<FromOutput> = {};
    if (!url && b.fields.fromJob) { const r = await imageFromOutput(b.fields.fromJob, b.fields.output, b.fields.t); if ('status' in r) return send(reply, r); url = r.url; extra = r; }
    if (!url) return reply.code(400).send(bad('image', 'Send an image file, or fromJob (+ output, t).', 'required'));
    const el = lib.addElementImage(req.params.id, url, extra.source ?? null);
    if (!el) return reply.code(404).send({ error: `element ${req.params.id} not found`, errorType: 'not_found' });
    if ('error' in el) return reply.code(409).send({ ...bad('image', el.error, 'element_full') });
    return { ...el, added: { url, frame: extra.frame ?? 'image', source: extra.source ?? null, ...(extra.note ? { note: extra.note } : {}) } };
  });

  /** B4: prev/next around a job in GET /api/jobs order with the same filters. Both spellings. */
  const neighbours = async (req: FastifyRequest<{ Params: { id: string }; Querystring: JobListQuery }>, reply: FastifyReply) => {
    const j = jobs.get(req.params.id); if (!j) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
    const r = filterJobList(req.query ?? {});
    if ('error' in r) return reply.code(400).send({ error: r.error.message, errorType: 'validation', issues: [{ code: 'invalid', field: r.error.field, message: r.error.message }] });
    const i = r.all.findIndex((x: any) => x.id === j.id); const total = r.all.length;
    if (i < 0) return { jobId: j.id, inList: false, prev: null, next: null, position: null, total };
    return { jobId: j.id, inList: true, prev: r.all[i - 1]?.id ?? null, next: r.all[i + 1]?.id ?? null, position: i + 1, total };
  };
  app.get('/api/jobs/:id/neighbours', neighbours); app.get('/api/jobs/:id/neighbors', neighbours);

  /** B5: a single result always carries full output metadata (lists may show nulls until the background probe finishes). */
  app.addHook('preHandler', async (req) => {
    if (req.method !== 'GET') return; const url = (req as any).routeOptions?.url;
    if (url === '/api/jobs/:id') { const j = jobs.get((req.params as any).id); if (j?.status === 'done') await warmOutputs(j.outputs); }
    else if (url === '/api/share/:token') { const id = lib.jobByToken((req.params as any).token); const j = id ? jobs.get(id) : undefined; if (j) await warmOutputs(j.outputs); }
  });

  /** B5 poster for a video output without a sibling .jpg: first frame, rendered on first request and cached. */
  app.get<{ Querystring: { url?: string } }>('/api/media/poster', async (req, reply) => {
    const f = await renderPoster(String(req.query.url ?? '')); if (!f) return reply.code(404).send({ error: 'No poster for that URL (local video outputs only).', errorType: 'not_found' });
    return reply.header('cache-control', 'public, max-age=86400').type('image/jpeg').send(createReadStream(f));
  });

  /** Deep links: /jobs/:id is served by the SPA fallback (index.ts not-found handler → web/dist/index.html).
   *  /share/:token is an alias of the public share page /s/:token. */
  app.get<{ Params: { token: string } }>('/share/:token', async (req, reply) => reply.redirect(`/s/${encodeURIComponent(req.params.token)}`, 302));

  const s = seedCommunity(); if (s.added.length) app.log.info({ added: s.added.length }, 'community seed');
  const fz = seedFeatured(); if (fz.added.length || fz.moved.length) app.log.info({ added: fz.added.length, moved: fz.moved.length }, 'examples seed');
}
