/**
 * Every server error carries a JSON body (DP #17: the client retries only on network errors, 502/503 and EMPTY-body 500s, so a real 500 must say what failed).
 *  - setErrorHandler: thrown 5xx → {error:'server_error', errorType:'server', code:'server_error', status, message} (details only in the log); thrown 4xx keep Fastify's default JSON.
 *  - onSend: any 5xx that would go out with an empty or non-JSON body is replaced by the JSON error body (content-type application/json).
 */
import type { FastifyInstance } from 'fastify';
import { STATUS_CODES } from 'node:http';

export const SERVER_ERROR_MESSAGE = 'Something went wrong on the server. Try again.';
export const serverErrorBody = (status = 500) => ({ error: 'server_error', errorType: 'server', code: 'server_error', status, message: SERVER_ERROR_MESSAGE });

export function registerJsonErrors(app: FastifyInstance) {
  app.setErrorHandler((err: any, req, reply) => {
    const status = Number(err?.statusCode) >= 400 && Number(err?.statusCode) < 600 ? Number(err.statusCode) : 500;
    if (status >= 500) { req.log.error({ err }, 'request failed'); return reply.code(status).type('application/json').send(serverErrorBody(status)); }
    // 4xx: Fastify's default shape, unchanged ({statusCode, code?, error: <status text>, message}).
    return reply.code(status).type('application/json').send({ statusCode: status, ...(err?.code ? { code: String(err.code) } : {}), error: STATUS_CODES[status] ?? 'Bad Request', message: String(err?.message || 'Bad request') });
  });
  app.addHook('onSend', async (_req, reply, payload) => {
    if (reply.statusCode < 500) return payload;
    let ok = false;
    if (typeof payload === 'string' && payload.trim()) { try { const v = JSON.parse(payload); ok = !!v && typeof v === 'object'; } catch { ok = false; } }
    else if (Buffer.isBuffer(payload) && payload.length) { try { const v = JSON.parse(payload.toString('utf8')); ok = !!v && typeof v === 'object'; } catch { ok = false; } }
    else if (payload && typeof payload === 'object' && typeof (payload as any).pipe === 'function') ok = true; // a stream: leave it (never used for errors)
    if (ok) return payload;
    reply.header('content-type', 'application/json; charset=utf-8'); reply.removeHeader('content-length');
    return JSON.stringify(serverErrorBody(reply.statusCode));
  });
}
