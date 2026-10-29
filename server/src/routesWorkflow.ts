/**
 * "Every result is a workflow": GET /api/jobs/:id/workflow (export info) and ?format=api[&pass=N] (the ComfyUI API-format graph as a download;
 * &download=0 for inline). Built in workflowExport.ts. Only the result's owner, or anyone for a result published with its prompt. Registered from index.ts.
 */
import type { FastifyInstance } from 'fastify';
import { appFileName } from './shared/fileNames.js';
import { jobs } from './jobs.js';
import * as lib from './library.js';
import { buildWorkflowExport } from './workflowExport.js';
import { ownerOf, LOCAL_OWNER } from './owner.js';

export function registerWorkflowExport(app: FastifyInstance) {
  // ---------------- A. Get workflow ----------------
  app.get<{ Params: { id: string }; Querystring: { format?: string; pass?: string; download?: string } }>('/api/jobs/:id/workflow', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
    const pubPrompt = (lib.metaOf(j.id) as any).published?.showPrompt === true;
    if (ownerOf(j) !== LOCAL_OWNER && !pubPrompt) return reply.code(403).send({ error: 'Only the person who made this result can export its workflow.', errorType: 'forbidden', code: 'not_owner' });
    const ex = await buildWorkflowExport(j); const { graphs, ...info } = ex; const fmt = req.query.format;
    if (!fmt) return info;
    if (fmt === 'ui') return reply.code(404).send({ error: info.formats.uiNote, errorType: 'not_found', code: 'ui_format_unavailable' });
    if (fmt !== 'api') return reply.code(400).send({ error: "format must be 'api'", errorType: 'validation', issues: [{ code: 'invalid', field: 'format', message: "format must be 'api'" }] });
    if (!info.available) return reply.code(409).send({ error: info.reason, errorType: 'validation', code: 'no_workflow' });
    const k = req.query.pass == null ? 0 : Number(req.query.pass); if (!Number.isInteger(k) || k < 0 || k >= graphs.length) return reply.code(400).send({ error: `pass must be 0–${graphs.length - 1}`, errorType: 'validation', issues: [{ code: 'invalid', field: 'pass', message: `pass must be 0–${graphs.length - 1}` }] });
    const name = appFileName(`${j.toolId}-${j.id}${graphs.length > 1 ? `-run${k + 1}` : ''}-api`, 'json');
    reply.header('x-workflow-source', info.source ?? '').header('x-workflow-exact', String(info.exact));
    if (req.query.download !== '0') reply.header('content-disposition', `attachment; filename="${name}"`);
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(graphs[k], null, 2));
  });
}
