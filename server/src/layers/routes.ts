/**
 * Layers' own routes (the layers plugin's route group: off = they answer 404 like an unknown route):
 *  - GET /api/layers/:id: the split's layers.json (names, colours, order, links), what the viewer reads;
 *  - POST /api/layers/:id/export: makes the export (once) and answers its link {url, bytes, name};
 *  - GET /api/layers/:id/export.zip: the export for editors (exportZip.ts), made on the first request and kept.
 * Nothing here runs a model or sends anything off this computer.
 */
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { createReadStream, statSync } from 'node:fs';
import { jobs } from '../jobs.js';
import { appFileName } from '../shared/fileNames.js';
import { LAYERS_TOOL } from './constants.js';
import { readManifest, buildExport } from './exportZip.js';

const notFound = (reply: any, error = 'No layers for this job') => reply.code(404).send({ error, errorType: 'not_found' });
const layersJob = (id: string) => { const j = jobs.get(id); return j && j.toolId === LAYERS_TOOL && j.status === 'done' ? j : null; };

export function registerLayersRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/layers/:id', async (req, reply) => {
    if (!layersJob(req.params.id)) return notFound(reply);
    const m = await readManifest(req.params.id); return m ?? notFound(reply);
  });
  /** Make the export (or reuse it) and say where it is: the viewer then downloads it as a plain file link. */
  app.post<{ Params: { id: string } }>('/api/layers/:id/export', async (req, reply) => {
    const j = layersJob(req.params.id); if (!j) return notFound(reply);
    try { const z = await buildExport(j.id); return { url: `/files/${path.basename(z)}`, bytes: statSync(z).size, name: appFileName(`${j.id}-layers`, 'zip') }; }
    catch (e) { return reply.code(410).send({ error: e instanceof Error ? e.message : 'The export could not be made', errorType: 'gone' }); }
  });
  app.get<{ Params: { id: string } }>('/api/layers/:id/export.zip', async (req, reply) => {
    const j = layersJob(req.params.id); if (!j) return notFound(reply);
    try {
      const z = await buildExport(j.id);
      return reply.type('application/zip').header('Content-Length', statSync(z).size).header('Content-Disposition', `attachment; filename="${appFileName(`${j.id}-layers`, 'zip')}"`).send(createReadStream(z));
    } catch (e) {
      return reply.code(410).send({ error: e instanceof Error ? e.message : 'The export could not be made', errorType: 'gone' });
    }
  });
}
