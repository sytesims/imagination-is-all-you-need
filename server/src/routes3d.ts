/**
 * 3D page routes (2026-10-23):
 *  - GET  /api/3d-workflows: the 3D workflows (shared/threeD.ts) in the same shape as /api/audio-workflows (categories, default, redirects,
 *    workflows with `defaults` + `active` from shared/threeDDefaults.ts), plus what each model takes (models[]) and the Scenario showcase.
 *  - GET  /api/3d/meta?url=/files/<x>.glb: faces, vertices, textured, PBR, bytes (glbInfo.ts; JSON chunk only).
 *  - POST /api/jobs/:id/3d-poster: the still the viewer rendered once (multipart `image`, PNG/JPEG/WebP ≤ 8 MB), kept as the card's poster.
 *  - POST /api/3d/upload: a GLB of your own for Direct a Shot (multipart `model`, ≤ MODEL_MAX_BYTES, glTF 2.0 binary with at least one mesh),
 *    kept as /files/up-<hash>.glb with its name beside it; GET /api/3d/uploads lists them, newest first (shared/previzModels.ts).
 */
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { writeFile, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { jobs } from './jobs.js';
import { getTool } from './tools/registry.js';
import { glbInfo } from './glbInfo.js';
import { withWorkflowDefaults } from './routing/defaults.js';
import { threeDDefaultsOf } from './shared/threeDDefaults.js';
import { MODEL_MAX_BYTES, cleanWords, MODEL_NAME_MAX } from './shared/previzModels.js';
import { THREE_D_WORKFLOWS, THREE_D_CATEGORIES, THREE_D_DEFAULT_WORKFLOW, THREE_D_REDIRECTS, THREE_D_MODELS, THREE_D_SHOWCASE, SCENARIO_DATASET, BIG_GLB_BYTES, threeDRoute, threeDSupportsMode } from './shared/threeD.js';

export function threeDWorkflowsPayload() {
  return {
    categories: THREE_D_CATEGORIES, default: THREE_D_DEFAULT_WORKFLOW, redirects: THREE_D_REDIRECTS, bigGlbBytes: BIG_GLB_BYTES,
    workflows: THREE_D_WORKFLOWS.map((w) => ({ ...w, modelIds: THREE_D_MODELS.filter(m=>threeDSupportsMode(m.id,w.mode??'')).map(m=>m.id), route: threeDRoute(w.id), runner: { toolId: w.toolId ?? '' }, modes: { default: w.mode ?? '' }, runnable: w.status === 'ready' && !!w.toolId && !!getTool(w.toolId) })),
    models: THREE_D_MODELS, showcase: { dataset: SCENARIO_DATASET, items: THREE_D_SHOWCASE },
  };
}
/** A GLB's problem in plain words, or null: glTF 2.0 binary, the length it says it has, a JSON chunk with at least one mesh. */
export function glbProblem(b: Buffer): string | null {
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) return 'That file isn’t a GLB (binary glTF). Export it as .glb and try again.';
  if (b.readUInt32LE(4) !== 2) return 'Only glTF 2.0 files work. Export it again as glTF 2.0 (.glb).';
  if (b.readUInt32LE(8) !== b.length) return 'That GLB is cut short or damaged. Export it again.';
  const len = b.readUInt32LE(12); if (b.readUInt32LE(16) !== 0x4e4f534a || 20 + len > b.length) return 'That GLB is damaged (no scene description inside).';
  try { const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8')); if (!Array.isArray(j.meshes) || !j.meshes.length) return 'That GLB has no meshes: there is nothing to show. It may hold only a camera, lights or an animation.'; }
  catch { return 'That GLB is damaged (its scene description can’t be read).'; }
  return null;
}
const fileOf = (url: string) => { const m = /^\/files\/([^/?#]+\.glb)$/i.exec(url); return m ? path.join(DATA_DIR, decodeURIComponent(m[1])) : null; };

export function registerThreeD(app: FastifyInstance) {
  app.get('/api/3d-workflows', async (req, reply) => {
    const body = JSON.stringify(withWorkflowDefaults(threeDWorkflowsPayload() as any, getTool, threeDDefaultsOf)); const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`;
    reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=600').header('etag', etag);
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(body);
  });
  app.get<{ Querystring: { url?: string } }>('/api/3d/meta', async (req, reply) => {
    const f = fileOf(String(req.query.url ?? '')); if (!f) return reply.code(400).send({ error: 'url must be a /files/<name>.glb result.', errorType: 'validation' });
    const info = await glbInfo(f); if (!info.bytes) return reply.code(404).send({ error: 'No such 3D file.', errorType: 'not_found' });
    return { ...info, big: info.bytes > BIG_GLB_BYTES };
  });
  app.post('/api/3d/upload', async (req, reply) => {
    let buf: Buffer | null = null; let name = ''; let tooBig = false;
    try { for await (const part of req.parts()) {
      if (part.type !== 'file') continue; const chunks: Buffer[] = []; let n = 0;
      for await (const c of part.file) { n += (c as Buffer).length; if (n > MODEL_MAX_BYTES) { tooBig = true; continue; } chunks.push(c as Buffer); }
      if (part.fieldname === 'model' && !buf) { buf = Buffer.concat(chunks); name = part.filename ?? ''; if ((part.file as any).truncated) tooBig = true; } } }
    catch { return reply.code(400).send({ error: 'The upload could not be read. Try again.', errorType: 'validation' }); }
    const mb = Math.round(MODEL_MAX_BYTES / 1048576);
    if (tooBig) return reply.code(413).send({ error: `That GLB is larger than ${mb} MB. Make a lighter copy (fewer faces, smaller textures) and try again.`, errorType: 'validation', code: 'too_large' });
    if (!buf?.length) return reply.code(400).send({ error: 'Send one .glb file (field model).', errorType: 'validation' });
    const bad = glbProblem(buf); if (bad) return reply.code(400).send({ error: bad, errorType: 'validation', code: 'bad_glb' });
    const id = createHash('sha1').update(buf).digest('hex').slice(0, 16); const file = `up-${id}.glb`;
    const label = cleanWords(name.replace(/\.glb$/i, '').replace(/[-_]+/g, ' '), MODEL_NAME_MAX) || 'Your model';
    await writeFile(path.join(DATA_DIR, file), buf); await writeFile(path.join(DATA_DIR, `up-${id}.json`), JSON.stringify({ name: label, bytes: buf.length, at: Date.now() }));
    return { ok: true, url: `/files/${file}`, name: label, bytes: buf.length };
  });
  app.get('/api/3d/uploads', async () => {
    const names = (await readdir(DATA_DIR).catch(() => [] as string[])).filter((f) => /^up-[0-9a-f]{16}\.glb$/.test(f));
    const rows = await Promise.all(names.map(async (f) => { const meta = await readFile(path.join(DATA_DIR, f.replace(/\.glb$/, '.json')), 'utf8').then((x) => JSON.parse(x)).catch(() => null);
      const st = await stat(path.join(DATA_DIR, f)).catch(() => null); if (!st) return null;
      return { url: `/files/${f}`, name: cleanWords(meta?.name, MODEL_NAME_MAX) || 'Your model', bytes: st.size, at: Number(meta?.at) || st.mtimeMs }; }));
    return { uploads: rows.filter(Boolean).sort((a, b) => b!.at - a!.at).slice(0, 60) };
  });
  app.post<{ Params: { id: string } }>('/api/jobs/:id/3d-poster', async (req, reply) => {
    const job = jobs.get(req.params.id);
    if (!job || job.status !== 'done' || !/\.glb$/i.test(job.resultUrl ?? '')) return reply.code(404).send({ error: 'No finished 3D result with that id.', errorType: 'not_found' });
    let buf: Buffer | null = null; let ext = '.png'; let posterV: number | null = null;
    for await (const part of req.parts()) {
      /* posterV: the framing the still was made with (web shared/front3d POSTER_V); an older one is made again */
      if (part.type !== 'file') { const n = Number((part as any).value); if (part.fieldname === 'posterV' && Number.isInteger(n) && n > 0 && n < 1000) posterV = n; continue; } const chunks: Buffer[] = []; for await (const c of part.file) chunks.push(c as Buffer);
      if (part.fieldname === 'image' && /^image\/(png|jpeg|webp)$/.test(part.mimetype)) { buf = Buffer.concat(chunks); ext = part.mimetype === 'image/jpeg' ? '.jpg' : part.mimetype === 'image/webp' ? '.webp' : '.png'; }
    }
    if (!buf?.length || buf.length > 8 * 1024 * 1024) return reply.code(400).send({ error: 'Send one PNG, JPEG or WebP image up to 8 MB (field image).', errorType: 'validation' });
    const name = `${job.id}-poster${posterV ? `-v${posterV}` : ''}${ext}`; /* a new name per framing, so no browser keeps showing the old still */ await writeFile(path.join(DATA_DIR, name), buf);
    const url = `/files/${name}`; (job as any).threeD = { ...((job as any).threeD ?? {}), posterUrl: url, ...(posterV != null ? { posterV } : {}) };
    if (job.outputs[0]) (job.outputs[0] as any).posterUrl = url;
    return { ok: true, posterUrl: url };
  });
}
