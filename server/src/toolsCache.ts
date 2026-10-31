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
 *
 * Two lighter copies follow the very same rules (dropped together, same TTL), so the Video page never waits on a full rebuild:
 *  - presetsList(): each tool's visible presets only (GET /api/presets, POST /api/presets/:id/use), built without the routing;
 *  - registerResponseCache(): the final JSON body of GET /api/models per URL (all model cards for every tool, ~250 ms to build).
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

/** OPENHIGGSFIELD_TOOLS_CACHE_MS overrides it (the test runner sets 0: tests drop files and read the change back at once). */
export const TOOLS_TTL_MS = Number(process.env.OPENHIGGSFIELD_TOOLS_CACHE_MS ?? 5_000);
type Entry = { at: number; list: any[]; json: string; etag: string };
type PresetTool = { id: string; name: string; presets?: any[] };
let build: (() => any[]) | null = null;
let buildPresets: (() => PresetTool[]) | null = null;
let entry: Entry | null = null;
let presets: { at: number; list: PresetTool[] } | null = null;
const responses = new Map<string, { at: number; body: string }>();
let gen = 0; // bumped on every drop: a response built before a write is never stored after it

/** index.ts hands over the builders (toolsPayload, with the licence links already stripped, and the same tools' presets alone). */
export const setToolsBuilder = (fn: () => any[], presetsFn: () => PresetTool[]) => { build = fn; buildPresets = presetsFn; invalidateTools(); };
/** Drop the shared copies: the next read builds fresh ones. */
export const invalidateTools = () => { entry = null; presets = null; responses.clear(); gen++; };
const fresh = (at: number) => Date.now() - at < TOOLS_TTL_MS;

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
/** Every tool with its visible presets, as GET /api/tools carries them (shared: read it, never change it). A few ms to build, not the whole list. */
export function presetsList(): PresetTool[] {
  if (presets && fresh(presets.at)) return presets.list;
  if (!buildPresets) throw new Error('tools registry not ready');
  return (presets = { at: Date.now(), list: buildPresets() }).list;
}

/** Any write to the API drops the copy when its answer goes out (onSend: after the handler wrote, before the client can read again). */
export function registerToolsInvalidation(app: FastifyInstance) {
  app.addHook('onSend', async (req, _reply, payload) => { if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' && req.url.startsWith('/api/')) invalidateTools(); return payload; });
}

/** GET answers for these paths are kept as their final JSON body, per URL (query included), and dropped with the tools copy. Register it
 *  before the compression hook, so the plain JSON is stored. Only a 200 built since the last drop is kept. */
export function registerResponseCache(app: FastifyInstance, paths: string[]) {
  const mine = (req: { method: string; url: string }) => req.method === 'GET' && paths.includes(req.url.split('?')[0]);
  app.addHook('preHandler', async (req, reply) => {
    if (!mine(req)) return; const hit = responses.get(req.url);
    if (hit && fresh(hit.at)) { (req as any).ohfCached = true; return reply.type('application/json; charset=utf-8').send(hit.body); }
    (req as any).ohfGen = gen;
  });
  app.addHook('onSend', async (req, reply, payload) => {
    if (mine(req) && !(req as any).ohfCached && (req as any).ohfGen === gen && reply.statusCode === 200 && typeof payload === 'string') { if (responses.size >= 200) responses.clear(); responses.set(req.url, { at: Date.now(), body: payload }); }
    return payload;
  });
}
