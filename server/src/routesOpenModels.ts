/**
 * "Open models only" (Open Weights Only prize): GET|PUT /api/settings/open-models. When on, partner nodes and closed / hosted APIs are hidden
 * from every listing (/api/tools, models[].runsOn, /api/pricing, MCP, which reads those) and refused on quote (here) and submit
 * (index.ts open_weights_only, routing/select.ts route_not_runnable). Our open workflows still run locally and on Comfy Cloud.
 * OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY=1 (and filming mode) lock it on. Saved in kv 'openModelsOnly'. Registered from index.ts.
 */
import type { FastifyInstance } from 'fastify';
import { getKv, setKv } from './db.js';
import { getTool, listTools } from './tools/registry.js';
import { toolProviders, getProvider, allowed } from './providers.js';
import { findRoute, tierOf } from './routing/routes.js';
import { findToolModel } from './routing/modelRegistry.js';
import { OPEN_WEIGHTS_ONLY_ENV, openWeightsOnly, setUserOpenWeightsOnly } from './licenses.js';

const OPEN_KEY = 'openModelsOnly';
let openSaved: boolean = false;
export const openModelsSummary = () => {
  const ts = listTools(); const avail = ts.filter((t) => toolProviders(t).length > 0);
  return { tools: ts.length, toolsAvailable: avail.length, toolsUnavailable: ts.filter((t) => !toolProviders(t).length).map((t) => ({ id: t.id, name: t.name })) };
};

/** Why a quote/submit request names something closed (null = fine): a hosted provider id, a model whose every engine is hosted, a hosted run-on, or a closed route. */
export function closedRequest(toolId: string | null, q: Record<string, any>): string | null {
  const id = String(q.provider || q.model || ''); const route = String(q.route || ''); const runOn = String(q.runOn || '');
  if (route) { const r = findRoute(route); if (r && r.kind !== 'local' && tierOf(r) !== 0) return `${r.label ?? route} is a hosted API or partner node.`; }
  if (runOn && !['auto', 'local', 'comfy-cloud'].includes(runOn)) return `${runOn} is a hosted API.`;
  if (!id) return null; const p = getProvider(id);
  if (p) return allowed(p) ? null : `${p.name} is a hosted API.`;
  const tools = toolId ? [getTool(toolId)].filter(Boolean) : listTools();
  for (const t of tools) { const m = findToolModel(t!, id); if (m && !m.parts.some((pt) => { const e = getProvider(pt.engine); return e && allowed(e); })) return `${m.def.name} is a closed model.`; }
  return null;
}

export function registerOpenModels(app: FastifyInstance) {
  // ---------------- C. Open models only ----------------
  openSaved = getKv<boolean>(OPEN_KEY, false) === true; setUserOpenWeightsOnly(() => openSaved);
  const openView = () => ({ on: openWeightsOnly(), locked: OPEN_WEIGHTS_ONLY_ENV, saved: openSaved, ...openModelsSummary(),
    note: OPEN_WEIGHTS_ONLY_ENV ? 'Set by the server (OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY), so it stays on.' : null });
  app.get('/api/settings/open-models', async () => openView());
  /** With open models only on, a closed model, partner node or hosted API is never quoted (the submit refuses it too: index.ts open_weights_only,
   *  routing/select.ts route_not_runnable). Checked before the price handlers run. */
  app.addHook('preHandler', async (req, reply) => {
    if (!openWeightsOnly() || req.method !== 'GET') return; const url = req.url.split('?')[0];
    const pm = url.match(/^\/api\/tools\/([^/]+)\/price$/); if (!pm && url !== '/api/models/quote') return;
    const q = (req.query ?? {}) as Record<string, string>; const why = closedRequest(pm ? decodeURIComponent(pm[1]) : q.toolId ?? null, q);
    if (why) return reply.code(400).send({ error: `${why} Open models only is on, so it isn’t quoted or run. Pick an open model, or turn it off in Settings → Connections. Nothing was charged.`, errorType: 'validation', code: 'open_weights_only', valid: false, credits: null });
  });
  app.put<{ Body: { on?: unknown } }>('/api/settings/open-models', async (req, reply) => {
    const on = req.body?.on; if (typeof on !== 'boolean') return reply.code(400).send({ error: 'on must be true or false', errorType: 'validation', issues: [{ code: 'invalid', field: 'on', message: 'on must be true or false' }] });
    if (!on && OPEN_WEIGHTS_ONLY_ENV) return reply.code(409).send({ error: 'Open models only is set by the server (OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY), so it can’t be turned off here.', errorType: 'validation', code: 'open_models_locked' });
    openSaved = on; setKv(OPEN_KEY, on); return openView();
  });
}
