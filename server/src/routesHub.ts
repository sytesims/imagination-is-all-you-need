/** Community hub API: /api/hub/* (browse Civitai-shaped LoRAs + workflows, one-click install). */
import type { FastifyInstance } from 'fastify';
import { catalog, commercialFlags, filterSort, USE_CASES, HUB_SORTS, hubLive, type HubItem } from './hub/catalog.js';
import { install, listInstalled, uninstall, installedIds } from './hub/install.js';

const view = (i: HubItem, inst: Set<string>) => ({ ...i, flags: commercialFlags(i.license), installed: inst.has(i.id) });

export function registerHub(app: FastifyInstance) {
  app.get('/api/hub/items', async (req, reply) => {
    const qs = req.query as Record<string, string | undefined>;
    if (qs.nsfw && qs.nsfw !== 'false') return reply.code(400).send({ error: 'nsfw is always false and cannot be overridden', errorType: 'invalid_input' });
    if (qs.type && !['lora', 'workflow'].includes(qs.type)) return reply.code(400).send({ error: 'type must be lora | workflow', errorType: 'invalid_input' });
    if (qs.useCase && !USE_CASES.some((u) => u.id === qs.useCase)) return reply.code(400).send({ error: `useCase must be one of ${USE_CASES.map((u) => u.id).join(', ')}`, errorType: 'invalid_input' });
    const limit = Math.min(100, Math.max(1, Number(qs.limit) || 50)); const offset = Math.max(0, Number(qs.offset) || 0);
    const c = await catalog(); const r = filterSort(c.items, qs); const inst = installedIds();
    return { items: r.items.slice(offset, offset + limit).map((i) => view(i, inst)), total: r.items.length, limit, offset, sort: r.sort,
      source: c.source, sample: c.source === 'sample', live: hubLive(), liveError: c.liveError, nsfw: false,
      sorts: HUB_SORTS, useCases: USE_CASES.map(({ id, label }) => ({ id, label })), types: ['lora', 'workflow'] };
  });
  app.get('/api/hub/items/:id', async (req, reply) => {
    const { id } = req.params as { id: string }; const c = await catalog();
    const it = c.items.find((i) => i.id === id); if (!it) return reply.code(404).send({ error: 'hub item not found', errorType: 'not_found' });
    return { ...view(it, installedIds()), source: it.source, installAs: it.type === 'lora' ? ['lora'] : ['style', 'tool'] };
  });
  app.post('/api/hub/install', async (req, reply) => {
    const b = (req.body ?? {}) as { id?: string; as?: string };
    if (!b.id) return reply.code(400).send({ error: 'id is required', errorType: 'invalid_input' });
    const c = await catalog(); const it = c.items.find((i) => i.id === b.id);
    if (!it) return reply.code(404).send({ error: 'hub item not found', errorType: 'not_found' });
    if (it.sample) return reply.code(409).send({ error: 'This is a sample catalogue item, an example only, so it can’t be installed. Connect a hub source to install real LoRAs and workflows.', errorType: 'conflict', code: 'sample_item' });
    const r = install(it, b.as);
    if ('error' in r) return reply.code(r.status).send({ error: r.error, errorType: r.status === 409 ? 'conflict' : 'invalid_input' });
    return reply.code(201).send(r);
  });
  app.get('/api/hub/installed', async () => ({ items: listInstalled() }));
  app.delete('/api/hub/installed/:id', async (req, reply) => {
    const r = uninstall((req.params as { id: string }).id);
    return r ? { ok: true, removed: r } : reply.code(404).send({ error: 'not installed', errorType: 'not_found' });
  });
}
