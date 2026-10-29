import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { jobs } from './jobs.js';
import { getTool } from './tools/registry.js';
import { storyLabelOf } from './cinema/storyLabel.js';
import { idemKeyOf } from './idempotency.js';
import { AGENT_HEADER } from './agentBudget.js';

/** Edit in place + lineage.
 *  POST /api/jobs/:id/edit {tool, params, output?} → runs `tool` with this job's output as its video/image input (no download or re-upload);
 *  goes through the normal job pipeline (validation, pricing, queue, idempotency) with fromJob=<id>; the new job's parentId = :id.
 *  GET /api/jobs/:id/lineage → ancestors (root first) + this job + direct children. */
const node = (j: any) => ({ id: j.id, toolId: j.toolId, toolName: storyLabelOf(j) ?? getTool(j.toolId)?.name ?? j.toolId, status: j.status, parentId: j.parentId ?? null,
  resultUrl: j.resultUrl ?? null, prompt: j.input?.prompt ?? null, createdAt: j.createdAt ?? null });
export function registerEdit(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Body: { tool?: string; params?: Record<string, unknown>; output?: number } }>('/api/jobs/:id/edit', async (req, reply) => {
    const src = jobs.get(req.params.id); if (!src) return reply.code(404).send({ error: 'No such job.' });
    const tool = getTool(String(req.body?.tool ?? '')); if (!tool) return reply.code(400).send({ error: `Unknown tool "${req.body?.tool}".`, errorType: 'validation' });
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.body?.params ?? {})) if (v != null) fields[k] = typeof v === 'string' ? v : JSON.stringify(v);
    fields.fromJob = src.id; fields.output = String(req.body?.output ?? 0);
    const b = `----ohf${randomUUID()}`;
    const payload = Object.entries(fields).map(([k, v]) => `--${b}\r\nContent-Disposition: form-data; name="${k.replace(/"/g, '')}"\r\n\r\n${v}\r\n`).join('') + `--${b}--\r\n`;
    // The key (header or clientJobId alias) is checked on this route (preHandler, see idempotency.ts); the inner submit gets a derived key so the two never collide.
    const key = idemKeyOf(req); const idem = key ? `edit:${req.params.id}:${key}` : '';
    // The agent budget header goes through too, so the edit is checked (and tagged) by the same guard as a submit (spendGuard + admitAgentRun).
    const ab = req.headers[AGENT_HEADER]; const agent = (Array.isArray(ab) ? ab[0] : ab)?.trim();
    const r = await app.inject({ method: 'POST', url: `/api/tools/${tool.id}/jobs`, payload, headers: { 'content-type': `multipart/form-data; boundary=${b}`, ...(idem ? { 'idempotency-key': String(idem) } : {}), ...(agent ? { [AGENT_HEADER]: agent } : {}) } });
    const body = r.json(); return reply.code(r.statusCode).send(r.statusCode === 200 ? { ...body, parentId: src.id, editOf: src.id } : body);
  });
  app.get<{ Params: { id: string } }>('/api/jobs/:id/lineage', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j) return reply.code(404).send({ error: 'No such job.' });
    const chain: any[] = []; const seen = new Set<string>(); let cur: any = j;
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.unshift(node(cur)); cur = cur.parentId ? jobs.get(cur.parentId) : undefined; }
    const children = [...jobs.values()].filter((x: any) => x.parentId === j.id).map(node);
    return { id: j.id, rootId: chain[0].id, depth: chain.length - 1, chain, children };
  });
}
