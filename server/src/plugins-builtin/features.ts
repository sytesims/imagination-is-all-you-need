/**
 * The feature plugins (plan §3.4, Phase 5): each one is a route group the server used to register inline (registerX(app) in legacy.ts). A
 * feature registers its routes through ctx.http.group, so every route records its plugin (--dump-config, GET /api/openapi.json lists only the
 * routes that are on) and goes off with it.
 *
 * Off (left out of the profile, or disposed): its routes answer exactly like an unknown route (404 {errorType: 'not_found'} under /api/, the
 * same as a path that never existed), and any hook it added does nothing. The other features and the rest of the app keep working. Exceptions,
 * kept as they were promised: workflow-folders (its own plugin) keeps /api/plugins and the workflow import routes answering that folders are
 * off; web-static off makes / and deep links a plain 404 'Not found' (no page).
 *
 * They mount after `legacy` (the server core: security, CORS, uploads, /files/, the job routes) and before the server listens (boot.ts), in the
 * profile's order, so their hooks keep the place they had in Fastify's order.
 */
import type { FastifyInstance } from 'fastify';
import { definePlugin, type PluginDef } from '../kernel/index.js';

type Register = (app: FastifyInstance) => unknown;
const feature = (name: string, register: Register): PluginDef => definePlugin({ name, inject: ['http'], async apply(ctx) { await ctx.http.group(register); } });

export const FEATURE_PLUGINS: Record<string, PluginDef> = {
  /** "Check before you run": GET /api/tools/:id/preflight. */
  preflight: feature('preflight', async (app) => { const { getTool } = await import('../tools/registry.js'); (await import('../routesPreflight.js')).registerPreflight(app, getTool); }),
  /** How each model reads its prompt and inputs (read-only). */
  'prompt-grammar': feature('prompt-grammar', async (app) => (await import('../routesPromptGrammar.js')).registerPromptGrammar(app)),
  /** This computer: /api/hardware, /api/local/comfy, /api/local/downloads, /api/eta/learned (doctor and setup read the same checks). */
  hardware: feature('hardware', async (app) => (await import('../routesHardware.js')).registerHardware(app)),
  /** Your Comfy deployment: /api/comfy-deploy, probe, smoke. */
  'comfy-deploy': feature('comfy-deploy', async (app) => (await import('../routesComfyDeploy.js')).registerComfyDeploy(app)),
  /** Back up and restore: GET /api/export, POST /api/import. */
  backup: feature('backup', async (app) => (await import('../routesBackup.js')).registerBackup(app)),
  /** Brand kits: /api/brand-kits CRUD and exports. */
  'brand-kits': feature('brand-kits', async (app) => (await import('../brandKits.js')).registerBrandKits(app)),
  /** The job lists and queue edges: GET /api/jobs (+ state=active), /api/queue, download.zip, trash purge. */
  edge: feature('edge', async (app) => { const { pub } = await import('../legacy.js'); (await import('../routesEdge.js')).registerEdge(app, pub); }),
  /** The canvas agent bridge (live ops, SSE, proposals, MCP presence). */
  'canvas-agent': feature('canvas-agent', async (app) => (await import('../canvasAgent.js')).registerCanvasAgent(app)),
  /** The built-in demo agent on the canvas (starter chips, play / stop a plan). */
  'canvas-demo': feature('canvas-demo', async (app) => (await import('../canvasAgent.js')).registerCanvasDemo(app)),
  /** The Canvas page's boards: /api/canvas/boards CRUD + snapshot save. */
  canvas: feature('canvas', async (app) => (await import('../canvasBoards.js')).registerCanvasBoards(app)),
  /** The Film tab: /api/films. */
  film: feature('film', async (app) => (await import('../filmProjects.js')).registerFilms(app)),
  /** Explore / discover feeds. */
  discover: feature('discover', async (app) => (await import('../routesDiscover.js')).registerDiscover(app)),
  /** The workflow hub: /api/hub/*. */
  hub: feature('hub', async (app) => (await import('../routesHub.js')).registerHub(app)),
  /** Sharing a result: cards (/s/:token, card.png), Add logo and text (stamp), branded export. The share link itself stays in the core. */
  share: feature('share', async (app) => {
    (await import('../routesShare.js')).registerShare(app); (await import('../routesStamp.js')).registerStamp(app); (await import('../shareExport.js')).registerShareExport(app);
  }),
  /** Captions + SRT / VTT (Whisper on this computer), burn-in. */
  captions: feature('captions', async (app) => (await import('../captions.js')).registerCaptions(app)),
  /** Open models only: GET|PUT /api/settings/open-models, and the quote check that refuses a closed model while it is on. */
  'open-models': feature('open-models', async (app) => (await import('../routesOpenModels.js')).registerOpenModels(app)),
  /** The API description: /api/openapi.json (documented routes + every route that is on) and /api/docs. */
  openapi: feature('openapi', async (app) => {
    const { buildSpec, withDiscovered, DOCS_HTML } = await import('../openapi.js'); const { currentHttp } = await import('../kernel/http.js'); const http = currentHttp();
    app.get('/api/openapi.json', async (req) => withDiscovered(buildSpec(`${req.protocol}://${req.headers.host ?? 'localhost:8787'}`), http.routes.filter((r) => r.active)));
    app.get('/api/docs', async (_req, reply) => reply.type('text/html').send(DOCS_HTML));
  }),
  /** The web build at / and the page for deep links. */
  'web-static': definePlugin({
    name: 'web-static', inject: ['http'],
    async apply(ctx) {
      const W = await import('../webStatic.js'); await ctx.http.group(W.registerWebStatic);
      ctx.effect(() => { W.setSpaFallback(true); return () => W.setSpaFallback(false); }, 'page for deep links');
    },
  }),
};
export const FEATURE_IDS = Object.keys(FEATURE_PLUGINS);
