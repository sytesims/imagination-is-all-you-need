/**
 * Idempotency for every job-creating endpoint (agreed with DP, Oct 18): POST /api/tools/:toolId/jobs, POST /api/jobs, POST /api/jobs/:id/retry,
 * POST /api/jobs/:id/upscale, POST /api/jobs/:id/retry?failedOnly=1 (retry failed groups), POST /api/jobs/:id/edit, POST /api/jobs/:id/fallback (continue on another route).
 *  - Key: header Idempotency-Key; aliases: header Client-Job-Id / X-Client-Job-Id, field (multipart or JSON) or query clientJobId, field idempotencyKey.
 *  - Window: 24 hours from the first successful request.
 *  - Same key + same request (endpoint, params and body, uploads included) → the ORIGINAL response (status + body) with idempotentReplay:true;
 *    and the response header Idempotent-Replayed: true; no new job, no second hold or charge. Concurrent duplicates wait for the first one.
 *  - Same key + a different request → 409 {error:'idempotency_conflict', code:'idempotency_conflict', message}; nothing is created or charged.
 *  - Only a successful (2xx) creation is remembered: a 400/402 can be fixed and re-sent with the same key.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getKv, setKv } from './db.js';

export const IDEMPOTENCY_WINDOW_MS = 24 * 3600_000;
export const REPLAY_HEADER = 'Idempotent-Replayed';
export interface IdemEntry { fieldsHash: string; jobId?: string; ts: number; status?: number; response?: Record<string, any> }
const store = new Map<string, IdemEntry>(Object.entries(getKv<Record<string, IdemEntry>>('idempotency', {})));
const inflight = new Map<string, Promise<void>>();
export const idemGet = (k: string) => { const v = store.get(k); return v && Date.now() - v.ts < IDEMPOTENCY_WINDOW_MS ? v : undefined; };
export function idemPut(k: string, v: IdemEntry) {
  store.set(k, v); for (const [kk, vv] of store) if (Date.now() - vv.ts >= IDEMPOTENCY_WINDOW_MS) store.delete(kk);
  setKv('idempotency', Object.fromEntries(store));
}
/** The request's idempotency key (header first, then the clientJobId / idempotencyKey aliases), max 200 chars; '' when none. */
export function idemKeyOf(req: FastifyRequest, fields: Record<string, any> = {}): string {
  const h = req.headers; const q = (req.query ?? {}) as Record<string, any>; const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
  const v = h['idempotency-key'] || h['client-job-id'] || h['x-client-job-id'] || fields.clientJobId || fields.idempotencyKey || b.clientJobId || b.idempotencyKey || q.clientJobId || q.idempotencyKey || '';
  return String(Array.isArray(v) ? v[0] : v).trim().slice(0, 200);
}
/** Exact 409 body agreed with DP (#17). */
export const CONFLICT_MESSAGE = 'This request was already sent with different details. Start a new one.';
export const conflictBody = () => ({ error: 'idempotency_conflict', code: 'idempotency_conflict', message: CONFLICT_MESSAGE });
/** Wait for an in-flight request with this key, then hold the key until this reply finishes (no double job when two arrive together). */
export async function idemLock(key: string, reply: FastifyReply) {
  // Loop, not one wait: when the holder fails (a 4xx is never stored), every waiter wakes on the same promise; only the first takes the
  // lock, the others see it held again and keep waiting (audit 2026-11-01 P3 #12: two retries went through and overwrote the lock).
  while (inflight.has(key)) { await inflight.get(key); if (idemGet(key)) return; }
  if (idemGet(key)) return; let done!: () => void; const p = new Promise<void>((r) => { done = r; }); inflight.set(key, p);
  const fin = () => { if (inflight.get(key) === p) inflight.delete(key); done(); }; reply.raw.once('finish', fin); reply.raw.once('close', fin);
}
/** Remember this request so onSend stores its 2xx response under the key. */
export const idemTrack = (req: FastifyRequest, key: string, fieldsHash: string) => { (req as any).idem = { key, fieldsHash }; };
/** Replay of a stored entry: the original body + idempotentReplay:true (legacy entries without a stored body → null, the caller rebuilds it). */
export const replayOf = (e: IdemEntry) => (e.response ? { status: e.status ?? 200, body: { ...e.response, idempotentReplay: true } } : null);

export const JSON_JOB_ROUTES = new Set(['/api/jobs/:id/retry', '/api/jobs/:id/upscale', '/api/jobs/:id/fallback', '/api/jobs/:id/edit']);
export function registerIdempotency(app: FastifyInstance) {
  // JSON / bodyless job routes: checked before the handler (the multipart create path checks inside createJob, where the upload bytes are hashed).
  app.addHook('preHandler', async (req, reply) => {
    const route = (req as any).routeOptions?.url ?? (req as any).routerPath; if (req.method !== 'POST' || !JSON_JOB_ROUTES.has(route)) return;
    const key = idemKeyOf(req); if (!key) return;
    const { clientJobId: _c, idempotencyKey: _i, ...body } = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>; const { clientJobId: _qc, idempotencyKey: _qi, ...query } = (req.query ?? {}) as Record<string, any>;
    const fieldsHash = createHash('sha256').update(JSON.stringify([route, req.params, body, query])).digest('hex');
    await idemLock(key, reply); const hit = idemGet(key);
    if (hit) { if (hit.fieldsHash !== fieldsHash) return reply.code(409).send(conflictBody()); const r = replayOf(hit); if (r) return reply.code(r.status).send(r.body); }
    idemTrack(req, key, fieldsHash);
  });
  // Every replay (keyed or the retry button's own dedupe) also says so in a header: Idempotent-Replayed: true (exposed via CORS, see index.ts).
  app.addHook('onSend', async (_req, reply, payload) => {
    if (typeof payload === 'string' && payload.includes('"idempotentReplay":true')) { try { if (JSON.parse(payload)?.idempotentReplay === true) reply.header(REPLAY_HEADER, 'true'); } catch { /* not JSON */ } }
    return payload;
  });
  app.addHook('onSend', async (req, reply, payload) => {
    const t = (req as any).idem as { key: string; fieldsHash: string } | undefined; if (!t || reply.statusCode < 200 || reply.statusCode >= 300 || typeof payload !== 'string') return payload;
    try { const body = JSON.parse(payload); if (body && typeof body === 'object' && !body.idempotentReplay && body.id) idemPut(t.key, { fieldsHash: t.fieldsHash, jobId: String(body.id), ts: idemGet(t.key)?.ts ?? Date.now(), status: reply.statusCode, response: body }); } catch { /* not JSON: not a job response */ }
    return payload;
  });
}
