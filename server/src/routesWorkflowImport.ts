/**
 * Add a workflow (workflowImport.ts): local-only JSON routes, like the rest of the app (no uploads: the page reads the file and sends its JSON).
 *  POST   /api/workflows/import  { workflow, fileName? } → { format, convertedWith?, workflow (API format), guess, missingNodes, tabs }  (nothing is saved)
 *  POST   /api/workflows         { workflow, name, description, tab, category, input, prompt, seed, output, extras[], license, source } → 201 { id, toolId, tab }
 *  GET    /api/workflows/source-licence?url=  a pasted source link (GitHub or Hugging Face repo) → { licence | null, source } from that site's public API
 *  DELETE /api/workflows/:id     a workflow you added: out of the app and its folder deleted (shipped ones: 403)
 *  GET    /api/workflows/:id/models  the model files it loads: { comfy, modelsDirSet, files[{ file, folder, state: have|missing|unknown, url, bytes, pageUrl, linkFrom }], missing, downloadId }
 *  PUT    /api/workflows/:id/models  { folder, file, url } a Hugging Face / Civitai link for a file the app's model list doesn't know (saved in its folder)
 *  Download: POST /api/local/downloads { downloadId: 'workflow:<id>' } (routesHardware.ts), progress GET /api/local/downloads/:id.
 * On / off stays POST /api/plugins/:id { enabled }.
 */
import type { FastifyInstance } from 'fastify';
import { HOSTED } from './hosted.js';
import { getKv, setKv } from './db.js';
import { comfyNodes, localObjectInfo } from './comfyNodes.js';
import { builtInObjectInfo, guessMapping, MAX_WORKFLOW_BYTES, readWorkflow, removeWorkflow, saveWorkflow, type SaveBody } from './workflowImport.js';
import { getTool } from './tools/registry.js';
import { graphNeeds, saveModelLink, workflowNeeds } from './workflowModels.js';
import { comfyLoaderOptions } from './comfyNodes.js';
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
    /* the model files it loads, checked up front against your ComfyUI and models folder ("3 of 4 models ready · 1 to download (0.1 GB)") */
    const needs = graphNeeds('new', r.graph as any, await comfyLoaderOptions());
    return { format: r.format, convertedWith: r.convertedWith ?? null, workflow: r.graph, guess: guessMapping(r.graph, String(req.body?.fileName ?? '')),
      missingNodes: have ? types.filter((t) => !have.has(t)) : null, tabs: TABS, needs };
  });
  /* Add a workflow's Customize: paste where it came from and the licence fills itself in (GitHub's or Hugging Face's own public metadata, read once). */
  app.get<{ Querystring: { url?: string } }>('/api/workflows/source-licence', async (req, reply) => {
    if (HOSTED) return reply.code(403).send(hostedNo);
    const r = await sourceLicence(String(req.query?.url ?? '')); return r ?? { licence: null, source: null };
  });
  app.post<{ Body: SaveBody }>('/api/workflows', { bodyLimit: LIMIT }, async (req, reply) => {
    if (HOSTED) return reply.code(403).send(hostedNo);
    if (!req.body || typeof req.body !== 'object') return reply.code(400).send({ error: 'Send the form as JSON.', errorType: 'validation' });
    const r = await saveWorkflow(req.body, await infoFor(req.body.workflow));
    if (!r.ok) return reply.code(400).send({ error: r.error, field: r.field ?? null, errors: r.errors ?? [], errorType: 'validation' });
    return reply.code(201).send({ id: r.id, toolId: r.id, tab: r.tab });
  });
  const added = (id: string) => { const t = getTool(String(id)) as any; return t?.plugin?.user ? t : null; };
  app.get<{ Params: { id: string } }>('/api/workflows/:id/models', async (req, reply) => {
    const t = added(req.params.id); if (!t) return reply.code(404).send({ error: 'No workflow you added has that name.', errorType: 'not_found' });
    return workflowNeeds(t);
  });
  app.put<{ Params: { id: string }; Body: { folder?: string; file?: string; url?: string } }>('/api/workflows/:id/models', async (req, reply) => {
    if (HOSTED) return reply.code(403).send(hostedNo);
    const t = added(req.params.id); if (!t) return reply.code(404).send({ error: 'No workflow you added has that name.', errorType: 'not_found' });
    const b = req.body ?? {}; const r = saveModelLink(t, String(b.folder ?? ''), String(b.file ?? ''), String(b.url ?? ''));
    if (!r.ok) return reply.code(r.code).send({ error: r.error, field: 'url', errorType: r.code === 404 ? 'not_found' : r.code === 403 ? 'forbidden' : 'validation' });
    return workflowNeeds(t);
  });
  app.delete<{ Params: { id: string } }>('/api/workflows/:id', async (req, reply) => {
    if (HOSTED) return reply.code(403).send(hostedNo);
    const r = removeWorkflow(String(req.params.id)); if (!r.ok) return reply.code(r.code).send({ error: r.error, errorType: r.code === 404 ? 'not_found' : 'forbidden' });
    setKv('plugins_disabled', getKv<string[]>('plugins_disabled', []).filter((x) => x !== req.params.id));
    return { id: req.params.id, removed: true };
  });
}

/** A GitHub or Hugging Face repo link → its licence (SPDX id, or the model card's licence tag). Only those two hosts; 4 s; null when unknown. */
const LIC_CACHE = new Map<string, { licence: string | null; source: string }>();
export async function sourceLicence(raw: string, get: typeof fetch = fetch): Promise<{ licence: string | null; source: string } | null> {
  let u: URL; try { u = new URL(raw.trim()); } catch { return null; } if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, ''); const [a, b] = u.pathname.split('/').filter(Boolean);
  if (!a || !b || !/^[\w.-]{1,100}$/.test(a) || !/^[\w.-]{1,100}$/.test(b)) return null;
  const key = `${host}/${a}/${b}`; const hit = LIC_CACHE.get(key); if (hit) return hit;
  const api = host === 'github.com' ? `https://api.github.com/repos/${a}/${b.replace(/\.git$/, '')}` : host === 'huggingface.co' ? `https://huggingface.co/api/models/${a}/${b}` : null; if (!api) return null;
  try { const r = await get(api, { signal: AbortSignal.timeout(4000), headers: { accept: 'application/json' } }); if (!r.ok) return null; const j: any = await r.json();
    const lic = host === 'github.com' ? (j?.license?.spdx_id && j.license.spdx_id !== 'NOASSERTION' ? j.license.spdx_id : j?.license?.name ?? null)
      : (j?.cardData?.license ?? (j?.tags ?? []).find((t: string) => t.startsWith('license:'))?.slice(8) ?? null);
    const out = { licence: typeof lic === 'string' && lic ? lic.slice(0, 80) : null, source: host === 'github.com' ? 'GitHub' : 'Hugging Face' }; LIC_CACHE.set(key, out); return out; }
  catch { return null; }
}
