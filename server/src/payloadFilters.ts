/**
 * Performance (MODEL-PICKER-REVIEW task 11): smaller responses for the web app, same full responses for everyone else.
 *
 *  - GET /api/tools?toolId=a,b      only those tools (still an array).
 *  - GET /api/tools?fields=id,name  each tool keeps only these keys (`id` is always kept).
 *  - GET /api/models?fields=id,hint each model card keeps only these keys (`id` always; groups keep toolId/toolName).
 *    Without the parameters both answer exactly as before (MCP and other API clients read the full payloads).
 *  - Response compression (brotli, else gzip) for text-like bodies over 1 KB when the client accepts it. No dependency: node:zlib.
 *
 * Both hooks are registered last (index.ts, right before listen), so they see the final payload after every other hook.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const list = (v: unknown): string[] | null => {
  if (typeof v !== 'string' || !v.trim()) return null;
  const a = v.split(',').map((s) => s.trim()).filter(Boolean);
  return a.length ? a : null;
};
const pick = (o: any, keys: string[]) => {
  if (!o || typeof o !== 'object') return o;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in o) out[k] = o[k];
  return out;
};

export function registerPayloadFilters(app: FastifyInstance) {
  app.addHook('preSerialization', async (req: FastifyRequest, _reply: FastifyReply, payload: any) => {
    const p = req.url.split('?')[0];
    if (p !== '/api/tools' && p !== '/api/models') return payload;
    const q = (req.query ?? {}) as Record<string, unknown>;
    const fields = list(q.fields);
    if (p === '/api/tools' && Array.isArray(payload)) {
      const ids = list(q.toolId);
      let out = ids ? payload.filter((t: any) => ids.includes(t?.id)) : payload;
      if (fields) { const keys = [...new Set(['id', ...fields])]; out = out.map((t: any) => pick(t, keys)); }
      return out;
    }
    if (p === '/api/models' && fields && payload && typeof payload === 'object' && Array.isArray(payload.groups)) {
      const keys = [...new Set(['id', ...fields])];
      return { ...payload, groups: payload.groups.map((g: any) => ({ ...g, models: Array.isArray(g.models) ? g.models.map((m: any) => pick(m, keys)) : g.models })),
        selected: payload.selected ? pick(payload.selected, keys) : payload.selected };
    }
    return payload;
  });
}

const brotli = promisify(zlib.brotliCompress); const gzip = promisify(zlib.gzip);
const TEXTY = /^(application\/(json|javascript|xml|manifest\+json)|text\/|image\/svg\+xml)/i;
const MIN = 1024;
/** `br` / `gzip` the client accepts (q=0 means no), else null. */
export const accepts = (accept: string | undefined, name: string) => !!accept && accept.split(',').some((part) => {
  const [n, ...params] = part.trim().split(';'); if (n.trim().toLowerCase() !== name) return false;
  const q = params.map((s) => s.trim()).find((s) => s.startsWith('q=')); return !q || Number(q.slice(2)) > 0; });
export function pickEncoding(accept: string | undefined): 'br' | 'gzip' | null {
  return accepts(accept, 'br') ? 'br' : accepts(accept, 'gzip') ? 'gzip' : null;
}

export function registerCompression(app: FastifyInstance) {
  app.addHook('onSend', async (req, reply, payload: any) => {
    if (req.method === 'HEAD' || reply.statusCode < 200 || reply.statusCode === 204 || reply.statusCode === 304 || reply.getHeader('content-encoding')) return payload;
    const type = String(reply.getHeader('content-type') ?? '');
    if (!TEXTY.test(type)) return payload;
    const enc = pickEncoding(req.headers['accept-encoding'] as string | undefined);
    const vary = String(reply.getHeader('vary') ?? '');
    if (!/accept-encoding/i.test(vary)) reply.header('vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding');
    if (!enc) return payload;
    if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
      const buf = typeof payload === 'string' ? Buffer.from(payload) : payload;
      if (buf.length < MIN) return payload;
      const out = enc === 'br' ? await brotli(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }) : await gzip(buf, { level: 6 });
      reply.header('content-encoding', enc); reply.removeHeader('content-length');
      return out;
    }
    // streams (the built web app's JS/CSS/HTML when the API serves web/dist): gzip on the fly. Range replies are left alone.
    if (payload && typeof payload.pipe === 'function' && reply.statusCode === 200 && !req.headers.range && accepts(req.headers['accept-encoding'] as string | undefined, 'gzip')) {
      const len = Number(reply.getHeader('content-length') ?? NaN);
      if (Number.isFinite(len) && len < MIN) return payload;
      reply.header('content-encoding', 'gzip'); reply.removeHeader('content-length');
      return payload.pipe(zlib.createGzip({ level: 6 }));
    }
    return payload;
  });
}
