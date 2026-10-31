/**
 * GET /api/tools, built once and shared (perf audit 2026-10-31: every call rebuilt all ~50 tools' routing, ~400 ms of blocked event loop,
 * and /api/presets, POST /api/presets/:id/use and the library rebuilt it again through app.inject).
 *
 * The copy is dropped (so the next read builds a fresh one) when:
 *  - any POST / PUT / PATCH / DELETE to /api/* answers (keys, routing, settings, model installs, plugins, a run using a free gen…):
 *    the same rule as the web app's fetch cache (web/src/shared/fetchCache.ts), so a change shows on the very next read;
 *  - a key is stored or removed, or the routing preferences are saved, in code (routing/settings.ts, routing/prefs.ts);
 *  - the plugins are (re)loaded (plugins.ts);
 *  - it is older than TOOLS_TTL_MS: things that change on their own (ComfyUI coming up or going away, a download finishing, the queue)
 *    show within a few seconds.
 * The ETag is a hash of the body, so a client's If-None-Match gets a 304 while nothing changed.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export const TOOLS_TTL_MS = 5_000;
type Entry = { at: number; list: any[]; json: string; etag: string };
let build: (() => any[]) | null = null;
let entry: Entry | null = null;

/** index.ts hands over the builder (toolsPayload, with the licence links already stripped). */
export const setToolsBuilder = (fn: () => any[]) => { build = fn; entry = null; };
/** Drop the shared copy: the next read builds a fresh one. */
export const invalidateTools = () => { entry = null; };

function current(): Entry {
  if (entry && Date.now() - entry.at < TOOLS_TTL_MS) return entry;
  if (!build) throw new Error('tools registry not ready');
  const list = build(); const json = JSON.stringify(list); // synchronous: no write can land half way
  return (entry = { at: Date.now(), list, json, etag: `"t-${createHash('sha1').update(json).digest('base64url').slice(0, 22)}"` });
}
/** The tools list as GET /api/tools sends it (shared: read it, never change it). */
export const toolsList = (): any[] => current().list;
/** The body and its ETag, for the route. */
export const toolsBody = (): { json: string; etag: string; list: any[] } => current();

/** Any write to the API drops the copy when its answer goes out (onSend: after the handler wrote, before the client can read again). */
export function registerToolsInvalidation(app: FastifyInstance) {
  app.addHook('onSend', async (req, _reply, payload) => { if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' && req.url.startsWith('/api/')) invalidateTools(); return payload; });
}
