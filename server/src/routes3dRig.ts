/**
 * Rig as a character (2026-10-27): POST /api/3d/rig keeps a character rigged in the browser (web/src/shared/rig: Mesh2Motion's human
 * skeleton, skin weights and CC0 moves) as a normal 3D result. Free: no provider, no AI, nothing charged.
 *  - multipart: model (the rigged GLB, ≤ MODEL_MAX_BYTES, glTF 2.0 binary with a mesh, a skin and at least one animation), meta (JSON,
 *    shared/previzRig.ts RigMeta: moves, clips, timings, the source model), poster (optional PNG still for the card).
 *  - → a finished job (tool three-d, provider local-rig) whose output is /files/<id>-out0.glb, made from the source's 3D job (parentId, the
 *    viewer's "Made from") and in its project, so it shows in the 3D feed, Assets and Direct a Shot's Your 3D models like any 3D result.
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { jobs, persistJob, type Job } from './jobs.js';
import { glbProblem } from './routes3d.js';
import { MODEL_MAX_BYTES } from './shared/previzModels.js';
import { normalizeRigMeta, personShaped, NOT_A_PERSON } from './shared/previzRig.js';
import { THREE_D_TOOL } from './shared/threeD.js';

export const RIG_PROVIDER = 'local-rig';
/** The rigged GLB's own problem in plain words (on top of glbProblem): it needs a skin and moves. */
export function rigProblem(b: Buffer): string | null {
  const bad = glbProblem(b); if (bad) return bad;
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  if (!Array.isArray(j.skins) || !j.skins.length) return 'That GLB has no skeleton, so it isn’t a rigged character.';
  if (!Array.isArray(j.animations) || !j.animations.length) return 'That GLB has no moves.';
  return null;
}

export function registerRig(app: FastifyInstance) {
  app.post('/api/3d/rig', async (req, reply) => {
    let glb: Buffer | null = null; let poster: Buffer | null = null; let metaRaw = ''; let tooBig = false;
    try { for await (const part of req.parts()) {
      if (part.type !== 'file') { if (part.fieldname === 'meta') metaRaw = String((part as any).value ?? ''); continue; }
      const chunks: Buffer[] = []; let n = 0; const cap = part.fieldname === 'poster' ? 8 * 1024 * 1024 : MODEL_MAX_BYTES;
      for await (const c of part.file) { n += (c as Buffer).length; if (n > cap) { tooBig = true; continue; } chunks.push(c as Buffer); }
      if (part.fieldname === 'model' && !glb) glb = Buffer.concat(chunks);
      else if (part.fieldname === 'poster' && !poster && /^image\/png$/.test(part.mimetype)) poster = Buffer.concat(chunks); } }
    catch { return reply.code(400).send({ error: 'The character could not be read. Try again.', errorType: 'validation' }); }
    if (tooBig) return reply.code(413).send({ error: `That character is larger than ${Math.round(MODEL_MAX_BYTES / 1048576)} MB. Rig a lighter copy of the model.`, errorType: 'validation', code: 'too_large' });
    if (!glb?.length) return reply.code(400).send({ error: 'Send the rigged GLB (field model).', errorType: 'validation' });
    let meta = null; try { meta = normalizeRigMeta(JSON.parse(metaRaw || 'null')); } catch { meta = null; }
    if (!meta) return reply.code(400).send({ error: 'Send what the character was made from (field meta).', errorType: 'validation', code: 'bad_meta' });
    if (!personShaped(meta.fit)) return reply.code(400).send({ error: NOT_A_PERSON, errorType: 'validation', code: 'not_a_person' });
    const bad = rigProblem(glb); if (bad) return reply.code(400).send({ error: bad, errorType: 'validation', code: 'bad_glb' });
    const src = meta.srcJob ? jobs.get(meta.srcJob) : undefined;
    const id = randomUUID().slice(0, 8); const now = Date.now(); const name = `${id}-out0.glb`; await writeFile(path.join(DATA_DIR, name), glb);
    let posterUrl: string | null = null; if (poster?.length) { posterUrl = `/files/${id}-poster.png`; await writeFile(path.join(DATA_DIR, `${id}-poster.png`), poster); }
    const url = `/files/${name}`;
    const job: Job = { id, toolId: THREE_D_TOOL, provider: RIG_PROVIDER, status: 'done', stage: 'done', progress: 100, queuePos: 0, eta: 0, resultUrl: url,
      outputs: [{ label: 'Rigged character', url, ...(posterUrl ? { posterUrl } : {}) } as any], error: null, errorType: null, warnings: [], parentId: src?.id ?? null,
      createdAt: now, startedAt: now, finishedAt: now, updatedAt: now, cost: 0, refunded: 0, runOn: 'local',
      input: { outKind: '3d', mode: 'rig', types: ['rig'], prompt: `${meta.name}, rigged as a character`, imageUrl: (src?.input as any)?.imageUrl ?? null, sourceUrl: meta.src, rig: meta } } as any;
    if (posterUrl) (job as any).threeD = { posterUrl };
    jobs.set(id, job); persistJob(job);
    if (src) { const lib = await import('./library.js'); const pid = (lib as any).metaOf?.(src.id)?.projectId; if (pid && (lib as any).getProject?.(pid)) (lib as any).setProject(id, pid); }
    return { ok: true, id, url, bytes: glb.length, posterUrl };
  });
}
