/**
 * Add a workflow (workflowImport.ts): local-only JSON routes, like the rest of the app (no uploads: the page reads the file and sends its JSON).
 *  POST   /api/workflows/import  { workflow, fileName? } → { format, convertedWith?, workflow (API format), guess, missingNodes, tabs }  (nothing is saved)
 *  POST   /api/workflows         { workflow, name, description, tab, category, input, prompt, seed, output, extras[], license, source } → 201 { id, toolId, tab }
 *  DELETE /api/workflows/:id     a workflow you added: out of the app and its folder deleted (shipped ones: 403)
 * On / off stays POST /api/plugins/:id { enabled }.
 */
import type { FastifyInstance } from 'fastify';
import { HOSTED } from './hosted.js';
import { getKv, setKv } from './db.js';
import { comfyNodes, localObjectInfo } from './comfyNodes.js';
import { builtInObjectInfo, guessMapping, MAX_WORKFLOW_BYTES, readWorkflow, removeWorkflow, saveWorkflow, type SaveBody } from './workflowImport.js';
import { PLUGIN_CATEGORIES, PLUGIN_TABS, TAB_LABEL } from './shared/pluginPlacement.js';
import { WORKFLOW_CATEGORIES } from './shared/workflows.js';
import { VIDEO_WORKFLOW_CATEGORIES } from './shared/videoWorkflows.js';
import { AUDIO_WORKFLOW_CATEGORIES } from './shared/audioWorkflows.js';
import { THREE_D_CATEGORIES } from './shared/threeD.js';

const LABELS: Record<string, { id: string; label: string }[]> = { image: WORKFLOW_CATEGORIES, video: VIDEO_WORKFLOW_CATEGORIES, audio: AUDIO_WORKFLOW_CATEGORIES, '3d': THREE_D_CATEGORIES };
const TABS = PLUGIN_TABS.map((t) => ({ id: t, label: TAB_LABEL[t], categories: PLUGIN_CATEGORIES[t].map((c) => ({ id: c, label: LABELS[t].find((x) => x.id === c)?.label ?? c })) }));
const LIMIT = MAX_WORKFLOW_BYTES + 256 * 1024; // the workflow plus the form
const hostedNo = { error: 'Adding workflows works in the app on your own computer.', errorType: 'forbidden' };
/** The node list for a saved-format file: your running ComfyUI first, else the one that ships with the app. Only fetched when needed. */
const infoFor = async (wf: unknown) => {
  const ui = typeof wf === 'string' ? /"nodes"\s*:\s*\[/.test(wf) && /"links"\s*:/.test(wf) : !!wf && typeof wf === 'object' && Array.isArray((wf as any).nodes);
  if (!ui) return null; const live = await localObjectInfo(); if (live) return { info: live, from: 'comfyui' as const };
  const b = builtInObjectInfo(); return b ? { info: b, from: 'built-in' as const } : null;
};

export function registerWorkflowImport(app: FastifyInstance) {
  app.post<{ Body: { workflow?: unknown; fileName?: string } }>('/api/workflows/import', { bodyLimit: LIMIT }, async (req, reply) => {
    if (HOSTED) return reply.code(403).send(hostedNo);
    const wf = req.body?.workflow; if (wf == null) return reply.code(400).send({ error: 'Add a ComfyUI workflow file.', errorType: 'validation' });
    const r = readWorkflow(wf, await infoFor(wf));
    if ('error' in r) return reply.code(400).send({ error: r.error, help: r.help ?? null, errorType: 'validation' });
    const have = comfyNodes(); const types = [...new Set(Object.values(r.graph).map((n) => n.class_type))];
    return { format: r.format, convertedWith: r.convertedWith ?? null, workflow: r.graph, guess: guessMapping(r.graph, String(req.body?.fileName ?? '')),
      missingNodes: have ? types.filter((t) => !have.has(t)) : null, tabs: TABS };
  });
  app.post<{ Body: SaveBody }>('/api/workflows', { bodyLimit: LIMIT }, async (req, reply) => {
    if (HOSTED) return reply.code(403).send(hostedNo);
    if (!req.body || typeof req.body !== 'object') return reply.code(400).send({ error: 'Send the form as JSON.', errorType: 'validation' });
    const r = await saveWorkflow(req.body, await infoFor(req.body.workflow));
    if (!r.ok) return reply.code(400).send({ error: r.error, field: r.field ?? null, errors: r.errors ?? [], errorType: 'validation' });
    return reply.code(201).send({ id: r.id, toolId: r.id, tab: r.tab });
  });
  app.delete<{ Params: { id: string } }>('/api/workflows/:id', async (req, reply) => {
    if (HOSTED) return reply.code(403).send(hostedNo);
    const r = removeWorkflow(String(req.params.id)); if (!r.ok) return reply.code(r.code).send({ error: r.error, errorType: r.code === 404 ? 'not_found' : 'forbidden' });
    setKv('plugins_disabled', getKv<string[]>('plugins_disabled', []).filter((x) => x !== req.params.id));
    return { id: req.params.id, removed: true };
  });
}
