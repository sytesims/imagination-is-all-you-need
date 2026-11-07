/**
 * The Plugins page's routes (kernel-owned, always on; kernel/switchboard.ts does the work):
 *   GET  /api/plugins                       every plugin: name, group, description, state + plain reason, switch, needs, key, restart note
 *   POST /api/plugins/:id {on, confirm?}     turn one on or off (409 {code:'confirm', alsoOff|alsoOn} names what else changes; resend with confirm)
 *   POST /api/plugins/:id/install            install an installable one (kie.ai, RunPod): it is in the app already, nothing is downloaded
 *   PUT  /api/settings/safe-mode {on}        safe mode: plugins that aren't ours are paused
 *   GET  /api/ui                             the plugins running now (the web hides what belongs to the others)
 * The spend guard can never be turned off: 400 with a plain sentence.
 */
import type { FastifyReply } from 'fastify';
import type { Http } from './kernel/http.js';
import { listPlugins, setPlugin, setSafeMode, activePlugins, PluginRefused } from './kernel/switchboard.js';
import { catalogEntry } from './shared/pluginCatalog.js';

const refuse = (reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.code(status).send({ error: message, userMessage: message, errorType: code, code, ...extra });

async function change(reply: FastifyReply, run: () => Promise<unknown>) {
  try { return await run(); } catch (e) {
    if (e instanceof PluginRefused) return refuse(reply, e.status, String(e.body.code ?? 'refused'), e.message, e.body);
    throw e;
  }
}

export function registerPluginRoutes(http: Http) {
  http.route({ method: 'GET', url: '/api/plugins', handler: async () => listPlugins() }, 'kernel');
  http.route({ method: 'GET', url: '/api/ui', handler: async () => activePlugins() }, 'kernel');
  http.route({ method: 'POST', url: '/api/plugins/:id', handler: async (req, reply) => {
    const { id } = req.params as { id: string }; const b = (req.body ?? {}) as { on?: unknown; confirm?: unknown };
    if (typeof b.on !== 'boolean') return refuse(reply, 400, 'bad_request', 'Say on: true or on: false.');
    return change(reply, async () => ({ ...(await setPlugin(id, b.on as boolean, { confirm: b.confirm === true })), plugin: (await listPlugins()).plugins.find((p) => p.id === id) }));
  } }, 'kernel');
  http.route({ method: 'POST', url: '/api/plugins/:id/install', handler: async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!catalogEntry(id)?.installable) return refuse(reply, 400, 'not_installable', 'This plugin is already part of the app: use its switch.');
    return change(reply, async () => ({ ...(await setPlugin(id, true, { confirm: true })), plugin: (await listPlugins()).plugins.find((p) => p.id === id) }));
  } }, 'kernel');
  http.route({ method: 'PUT', url: '/api/settings/safe-mode', handler: async (req, reply) => {
    const b = (req.body ?? {}) as { on?: unknown };
    if (typeof b.on !== 'boolean') return refuse(reply, 400, 'bad_request', 'Say on: true or on: false.');
    return setSafeMode(b.on);
  } }, 'kernel');
}
