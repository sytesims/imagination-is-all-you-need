import { FILMING, fallbackOffers, notificationPrompts, env } from './env.js';
import { storyLabelOf } from './cinema/storyLabel.js';
import { allowedFor, displayLabels } from './shared/enumParams.js';
import { engineNameOf } from './engineName.js';
import { progressOf } from './progress.js';
import { getPreview, putPreview } from './comfy/preview.js';
import { featureOfJob, imageFeaturesPayload, IMAGE_FEATURES } from './shared/imageFeatures.js';
import { imageWorkflowsPayload, validateImageWorkflows } from './shared/workflows.js';
import { audioWorkflowsPayload, validateAudioWorkflows } from './shared/audioWorkflows.js';
import { audioDefaultsOf } from './shared/audioDefaults.js';
import { workflowModelCheck } from './workflowCompat.js';
import { imagePresetsPayload, validateImagePresets } from './shared/presets.js';
import { videoAppFeatureOfJob } from './shared/videoAppWorkflows.js';
import { appWorkflowFor, ltxDfrFeatureOfJob } from './shared/appWorkflows.js';
import { RIG_OPTIONS, RIG_DEFAULT, FILM_STYLER_NODE } from './shared/cameraLens.js';
import { publicPaths } from './mediaPaths.js';
import { cloudProvidersEnabled, localFreeNow } from './routing/settings.js'; // first: filming mode (BH9 c) must apply before any config module reads the env
import { catalogFor, cleanName } from './shared/modelCatalog.js';
import { lifecycleFields } from './shared/lifecycle.js';
import { DEMO_MESSAGE } from './routing/select.js';
import { simulatedAtSubmit, jobSpendView } from './billing.js';
import { durationsFor } from './tools/h3/videoCaps.js';
import { durToolOf, appQuoteParams } from './tools/apps.js';
import { jobPoster } from './interimTiles.js';
import { layersPosterUrl, writeLayerPoster } from './layerPoster.js';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { etaFor } from './timing.js';
import { setToolsBuilder, registerToolsInvalidation, registerResponseCache, toolsBody, toolsList } from './toolsCache.js';
import multipart from '@fastify/multipart';
import { listenHost } from './shared/listenHost.js';
import { registerUploadSecurity, mediaResponseHeaders, uploadKind, validateUpload, acceptKind } from './uploadSecurity.js';
import fstatic from '@fastify/static';
import cors from '@fastify/cors';
import { randomUUID, createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobs, Job, flushJobs } from './jobs.js';
import { db } from './db.js';
import { enqueue, cancel, history, stateOf, canCancel, inFlight, MAX_PARALLEL, laneSizes } from './queue.js';
import { getKv, setKv } from './db.js';
import * as I from './idempotency.js';
import { registerJsonErrors } from './jsonErrors.js';
import { RESULT_TTL_DAYS } from './config.js';
import { ledger, canAfford, getBalance, freeGensLeft, FREE_GENS_MAX_RES, grant, LOCAL_FREE, isLocalFree, refundOf, usageTotals } from './ledger.js';
import { registerPrecheck } from './precheck.js';
import { registerPreflight } from './routesPreflight.js';
import { registerPromptPeek } from './routesPromptPeek.js';
import { registerPromptGrammar } from './routesPromptGrammar.js';
import { madeRealOf } from './routesMakeItReal.js';
import { billingMode as billingModeNow } from './billingMode.js';
import { teamMode as teamModeNow } from './billingMode.js';
import { DRAFT_FACTOR as DRAFT_PRICE_FACTOR } from './shared/pricing.js';
import * as lib from './library.js';
import { featuredByKey } from './shared/featured.js';
import { mergeDanceStyle } from './danceStyle.js';
import { resolveElements, type AttachedElement } from './elements/resolve.js';
import { EXAMPLES } from './examples.js';
import { registerBatch1, examplePrefill } from './routesBatch1.js';
import * as MS from './mediaStore.js';
import { registerDiscover, toolExtras } from './routesDiscover.js';
import { withOutputMeta } from './outputMeta.js';
import { jobFallback as jobFallbackOf } from './routing/fallback.js';
import { sampleFor } from './sampleMedia.js';
import { buildSpec, withDiscovered, DOCS_HTML } from './openapi.js';
import { loadPlugins, pluginStatus } from './plugins.js';
import { modelsFor, cardName } from './models.js';
import { PROVIDER_FACTORS, OPTION_FACTORS, PRICE_LADDERS } from './shared/pricing.js';
import { defaultsBlock, defaultProviderFor, defaultFirst, requestMode, SWAP_TYPES, modelFields, withWorkflowDefaults, lyricsFreeDefault, draftOn, draftCapableDefault } from './routing/defaults.js';
import { isTwinAlias, toolKeys, TWIN_ALIASES } from './routing/routes.js';
import { jobModelFields, routePlace } from './routing/modelRegistry.js';
import { findRoute as findRouteDef } from './routing/routes.js';
import { placeOf } from './shared/modelIds.js';
import { jobWorkflow, jobAppPrompts } from './jobSource.js';
import { toolProviders, getProvider, allowed, providerLicense, providerWorkflows, openWeightsOnly, comfyCloudOpen, providerOpenWeights } from './providers.js';
import { LICENSES, workflowLicense, workflowOsi } from './licenses.js';
import { jobAttribution } from './attribution.js';
import { jobAgentView } from './agentBudget.js';
import { OPEN_WEIGHTS_ONLY_ENV } from './licenses.js';
import { buildLicenseReport, stripLicenseLinks } from './licensesReport.js';
import { registerEdge, admit, TRASH_DAYS } from './routesEdge.js';
import { registerBackup } from './routesBackup.js';
import { HOSTED, publicMcpInfo } from './hosted.js';
import { isEnhanced } from './pages.js';
import { isSlow } from './edge.js';
import { jobSpecs } from './routesSpecs.js';
import { groupCount } from './tools/shared.js';
/** K3: presets are never filtered by licence (kept as a hook; always true). */
const presetOk = (_p: { license?: keyof typeof LICENSES }) => true;
import { estimateSeconds, passesFor, priceFor } from './tools/shared.js';
import { listSoon } from './tools/registry.js';
import { getTool, listTools, DEFAULT_TOOL_ID } from './tools/registry.js';
import { config, DATA_DIR, WORKFLOWS_DIR } from './config.js';
import { mcpInfo } from './mcpInfo.js';
import { repoInfo, APP_VERSION } from './repoInfo.js';
import { checkComfyReady } from './comfyClient.js';
import './routing/jobRefs.js'; // prompt grammar: local graphs rewrite @image1 with the runners' model key (comfy/plans.ts setPlanModelKey)

mkdirSync(DATA_DIR, { recursive: true });
const app = Fastify({ logger: { level: 'info' } });
I.registerIdempotency(app); registerJsonErrors(app); // every 5xx carries a JSON body (DP #17) // job-creating endpoints: Idempotency-Key / clientJobId, 24 h, replay = original response, mismatch → 409
await app.register(cors, { exposedHeaders: [I.REPLAY_HEADER] }); // browsers may read Idempotent-Replayed (DP client)
const ROUTES: { method: string; url: string }[] = [];
app.addHook('onRoute', (r) => { for (const m of [r.method].flat()) ROUTES.push({ method: String(m), url: r.url }); });
/** Every JSON 404 carries errorType 'not_found' (unknown tool / job / model / plugin …) unless the handler set a more specific one. */
// Re-check 6 (BH P3): every 4xx from a quote, a submit or a job action carries a machine code (issues[0].code, else one from errorType)
const CODED = /^\/api\/(tools\/[^/]+\/(jobs|price)|models\/quote|jobs\/[^/]+\/(upscale|retry|edit|fallback))(\?|$)/;
const CODE_OF_TYPE: Record<string, string> = { credits: 'insufficient_credits', no_provider: 'no_provider', routing: 'route_not_runnable', validation: 'invalid_input', not_found: 'not_found' };
const codeHook = async (req: any, reply: any, payload: any) => { if (reply.statusCode < 400 || reply.statusCode >= 500 || !CODED.test(req.url) || !payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.error || payload.code) return payload;
  const ic = Array.isArray(payload.issues) ? payload.issues[0]?.code : undefined; return { ...payload, code: ic && ic !== 'invalid' ? ic : CODE_OF_TYPE[payload.errorType] ?? (reply.statusCode === 404 ? 'not_found' : reply.statusCode === 409 ? 'conflict' : 'invalid_input') }; };
app.addHook('preSerialization', codeHook);
// DP #20: the routing quote hook (routing/http.ts) builds some quote 400s after the hook above ran (e.g. a resolution the model can't do); onSend sees the final body
app.addHook('onSend', async (req, reply, payload: any) => { if (typeof payload !== 'string' || reply.statusCode < 400 || reply.statusCode >= 500 || !CODED.test(req.url) || !payload.startsWith('{')) return payload;
  try { const o = JSON.parse(payload); if (!o?.error || o.code) return payload; return JSON.stringify(await codeHook(req, reply, o)); } catch { return payload; } });
app.addHook('preSerialization', async (_req, reply, payload: any) => { if (reply.statusCode === 404 && payload && typeof payload === 'object' && !Array.isArray(payload) && payload.error && !payload.errorType) return { ...payload, errorType: 'not_found' }; return payload; });
app.get('/api/openapi.json', async (req) => withDiscovered(buildSpec(`${req.protocol}://${req.headers.host ?? 'localhost:8787'}`), ROUTES));
app.get('/api/docs', async (_req, reply) => reply.type('text/html').send(DOCS_HTML));
const MAX_UPLOAD_MB = 200;
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 40 } });
registerUploadSecurity(app);
(await import('./cleanMedia.js')).registerCleanFiles(app); // GET /files/<name>?clean=1: metadata-free copy (share step 1)
await app.register(fstatic, { root: DATA_DIR, prefix: '/files/', setHeaders: mediaResponseHeaders });
await app.register(fstatic, { root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../samples'), prefix: '/samples/', decorateReply: false });

/** Prod (npm start): serve the web build so deep links (/api-docs, /tools/…, unknown → NotFound) load directly. */
const WEB_DIST = (() => { const d = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist'); return existsSync(path.join(d, 'index.html')) ? d : null; })();
if (WEB_DIST) await app.register(fstatic, { root: WEB_DIST, prefix: '/', decorateReply: false, wildcard: false });
const publicInput = (i: Record<string, any>) => // BH10 P2 #20: no host path ever: *Path(s)/path dropped, refBatches as /files/ URLs
  scrubPaths(i) as Record<string, any>;
/** A string that names a file inside the data dir (e.g. a job saved before a field was renamed to *Path: videoFitSource, 2026-10-26). */
const isHostPath = (v: unknown) => typeof v === 'string' && (v === DATA_DIR || v.startsWith(DATA_DIR + path.sep));
const scrubPaths = (o: any): any => (Array.isArray(o) ? o.filter((x) => !isHostPath(x)).map(scrubPaths) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).filter(([k, v]) => !isHostPath(v) && (k === 'cameraPath' /* Direct a Shot keyframes, never a host path */ || (!/Path$|Paths$/.test(k) && k !== 'path'))).map(([k, v]) => (k === 'refBatches' ? [k, publicPaths(v, DATA_DIR)] : [k, scrubPaths(v)]))) : o);

const isVideoUrl = (u?: string | null) => !!u && /\.(mp4|webm|mov)$/i.test(u);
const upscalable = (j: Job) => j.status === 'done' && j.toolId !== 'upscale' && isVideoUrl(j.outputs[0]?.url ?? j.resultUrl) && j.input.resolution !== '1080p' && !!getTool('upscale');
const seen = new Map<string, { sig: string; at: number }>();
const touched = (j: Job) => { const sig = `${j.status}|${j.progress}|${j.queuePos}|${j.stage}`; const c = seen.get(j.id);
  if (!c) { const at = j.updatedAt ?? j.finishedAt ?? j.startedAt ?? j.createdAt; seen.set(j.id, { sig, at }); return at; }
  if (c.sig !== sig) { c.sig = sig; c.at = Math.max(Date.now(), j.updatedAt ?? 0); } return c.at; };
/** Where a job ran, in the one set of place words (shared/modelIds.ts placeOf): 'Your computer', 'Comfy Cloud', 'Comfy Router', 'Comfy deployment',
 *  'fal'… with its billing (free, GPU time, set price). Was 'Comfy Cloud · Comfy Cloud' for Cloud workflows (setups-routing 2026-10-29). */
const placeOfJob = (j: Job) => { const mf = jobModelFields(j); const r = String(j.route ?? ''); const rd = r ? findRouteDef(r) : undefined;
  const p = rd ? routePlace(rd) : placeOf({ route: r || null, runOn: mf.runOn });
  return { runOn: mf.runOn, label: p?.label ?? mf.runOnLabel ?? null, ...(p ? { id: p.id, billing: p.billing, short: p.short, note: p.note } : {}) }; };
/** Agent audit gap 3: is this result a sample (nothing was generated, nothing billed), and why, in one sentence an agent can repeat.
 *  A keyless cloud place run as a preview (routing.demo), a mock run (tools/shared.ts mockRun), or any run on the mock backend. */
const sampleTruth = (j: Job): { isSample: boolean; sampleReason: string | null } => {
  if (j.actualCost) return { isSample: false, sampleReason: null };
  if ((j as any).featuredExample) return { isSample: false, sampleReason: null }; // the app's own real renders (shared/featured.ts, the Examples project), on any server
  if (j.toolId === 'compose' && j.provider === 'local-ffmpeg') return { isSample: false, sampleReason: null }; // Stitch: ffmpeg really joined the files, even on the mock backend
  const { runOn, label } = placeOfJob(j);
  if (j.routing?.demo) return { isSample: true, sampleReason: runOn === 'local' || !label
    ? 'This is a sample: the server is in sample mode, so nothing was generated and nothing was billed.'
    : `No ${label} key is set, so this is a sample: nothing was generated or sent to ${label}, and nothing was billed. Add a ${label} key for a real run, or pick a ready run_on.` };
  if (j.simulated || simulatedAtSubmit()) return { isSample: true, sampleReason: config.backend === 'mock'
    ? 'The server runs in sample mode (mock backend), so this is a sample: nothing was generated and nothing was billed. Set OPENHIGGSFIELD_BACKEND=comfy (or add provider keys) for real results.'
    : `${label ?? 'This place'} has no live runner on this server yet, so this is a sample: nothing was generated and nothing was billed.` };
  return { isSample: false, sampleReason: null };
};
/** L9: the model line follows the route that ran: fal / Replicate routes name the hosted model (Remove BG on fal = 'Bria Video Background Removal (fal)', not 'BiRefNet (local)'). */
const pub = (j: Job) => ({
  id: j.id,
  /** Pages 16-18: upscale/enhance/edit tool or derived (parentId) job; a retry / Try on re-run is not (S-04: see rerun). */
  enhanced: isEnhanced(j as any),
  /** S-04: 'retry' | 'try-on' | 'failed-groups' when this job re-runs its parent (POST /api/jobs/:id/retry), else null. */
  rerun: j.rerun ?? (j.input?.retryGroups ? 'failed-groups' : j.input?.retryOf ? 'retry' : null),
  elements: (j.input as any)?.elements ?? [],
  toolId: j.toolId,
  provider: j.provider,
  /** Model display name for the Result view. */
  model: engineNameOf(j), // BH10 P1-4: the engine that ran (hosted route model, Camera LTX moves, OpenSoul base + LoRAs, an app's base model), never 'Open weights' / 'Auto' / 'OpenSoul' // BH9 P1-4: modelName = what actually ran (LTX camera presets → LTX-2 19B); cardName = INFO/catalog name, never 'Open weights'
  /** BH11/12: display labels for the result overlay (null when the job has no quality / aspect). */
  ...displayLabels(getTool(j.toolId), j.input as any),
  /** Run on (2026-10-22): a failed run's other ready places, for "Try on <place> (≈ $x)" (POST /api/jobs/:id/retry {runOn}); [] otherwise. */
  tryOn: j.status === 'failed' ? j.tryOn ?? [] : [],
  ...jobModelFields(j), // step 2: modelKey (stable model id), runOn (account it ran on: local | comfy-cloud | fal | …) + runOnLabel; derived for jobs saved before v2
  /** Round 1 (S2): 'Story · 3 shots' (or its title) on a story, 'Shot 2' on one of its shots; null otherwise. */
  storyLabel: storyLabelOf(j),
  /** Images (transparency, 2026-10-22): the feature it ran as with the real model and the workflow it is credited with: {id, name, model, label: 'Relight · Nano Banana 2', workflow: {source, name, url, author, licence, file?, recipe}} | null. */
  feature: featureOfJob(j as any, engineNameOf(j)) ?? videoAppFeatureOfJob(j) ?? ltxDfrFeatureOfJob(j as any) ?? (j.toolId === 'video-frame' ? { id: 'video-frame', name: 'Video frame', model: null, label: 'Video frame', workflow: null } : null), /* a saved frame (videoFrame.ts recordFrameJob) */ // + Camera Moves / Photo FX / Orbit Shot on Comfy Router: 'Camera Moves · Seedance 2.0' + workflow credit
  modelName: engineNameOf(j), // L9: a fal/Replicate run names that host's model; else the tool-specific name (Object Swap comfy-open = 'Wan 2.2 Animate 14B')
  /** Licence credit line for this result (MiniMax H3: §IV.2 requires the name 'MiniMax H3' prominently; the 'Powered by MiniMax H3' line is encouraged, §III.3(a)): {text, lines, required, level, requiredText, display:'prominent', licenseId, licenseName, clause, sourceUrl} | null. */
  attribution: jobAttribution(j),
  /** Agent budgets: {id, name, budgetUsd, spentUsd, budgetCredits, spentCredits} when an MCP agent made this job (X-OHF-Agent-Budget), else null. */
  agent: jobAgentView(j),
  /** Model-fallback notice (routing/fallback.ts): null, or {requestedModel, usedModel, requestedRoute, usedRoute, fallbackReason:{code,message}, costDiffers, requestedCredits, usedCredits, creditDelta}. */
  fallback: jobFallbackOf(j),
  /** Demo contract: true when this ran as a demo preview (mock run, sample output, FREE: cost 0, no ledger debit). demoMessage = the line to show; demoNotice = {code:'demo_preview', routeId, message} | null. */
  demo: !!j.routing?.demo,
  demoMessage: j.routing?.demo ? DEMO_MESSAGE : null,
  demoNotice: j.routing?.demo ?? null,
  /** isSample: nothing real was generated (keyless preview, mock run or mock backend); sampleReason = the sentence to tell the user. place = {runOn, label: 'Comfy · Comfy Router'}. */
  ...sampleTruth(j),
  place: placeOfJob(j),
  /** Source block of the result details (jobSource.ts): the workflow that ran (name, official / community / ours, link) and the prompts the app wrote for it. */
  runSource: { workflow: jobWorkflow(j), appPrompts: jobAppPrompts(j) },
  diagnostics: j.diagnostics ?? [],
  /** Blender open-movie sample (CC BY 3.0) shown as this result → visible label 'Sample · CC-BY Blender Foundation'; else null. Full credit: sample. */
  sampleLabel: sampleFor(j.resultUrl ?? j.outputs?.[0]?.url)?.label ?? null,
  sample: sampleFor(j.resultUrl ?? j.outputs?.[0]?.url),
  status: j.status,
  stage: j.stage,
  progress: j.progress,
  queuePos: j.queuePos,
  /** 2026-10-25 run lanes (queue.ts): 'local' | 'cloud' (the lane it waits / runs in), and why a waiting job waits, in plain words ('Waiting for your Mac: one local run at a time'). */
  runLane: j.runLane ?? null,
  queueReason: j.status === 'queued' || j.status === 'running' ? j.queueReason ?? null : null,
  eta: j.eta,
  /** Step-ETA (local runs): {seconds, low, high, source learned | scaled | reported | first_run, samples, includesLoad cold | warm | null, calibrating, loadSec, secondsPerStep, steps, postSec, key} | null. */
  etaRange: j.etaRange ?? null,
  /** true when this local run is timing this workflow on this computer for the first time (no estimate shown). */
  calibrating: !!j.calibrating,
  resultUrl: j.resultUrl,
  /** 3D results (routes3d.ts): {posterUrl (the still the viewer saved), turntableUrl, turntableJob}; null for every other job. */
  threeD: (j as any).threeD ?? null,
  /** Direct a Shot recordings: the Render runs made from it [{id, status, progress, resultUrl, createdAt, simulated}] (routesMakeItReal.ts); null for other jobs. */
  madeReal: madeRealOf(j),
  /** Image to layers: every layer composited in order (made once when the job finished; older jobs: a lazy route that makes it on first view); null for other jobs. */
  layersPosterUrl: layersPosterUrl(j),
  /** B5: each output {label, url} + {kind, width, height, durationSec, posterUrl} (outputMeta.ts; nulls until probed). */
  outputs: withOutputMeta(j.outputs),
  error: j.error,
  errorType: j.errorType ?? null,
  reasonCode: j.reasonCode ?? null, cloudJobId: j.cloudJobId ?? null, routerRequestId: (j as any).routerRequest?.id ?? null, // Comfy Router queued request id (routing/routerRun.ts)
  providerError: (j as any).providerError ?? null, // what Comfy / the provider said when a Router run failed, sanitised (routing/routerRun.ts)
  state: stateOf(j),
  cancellable: canCancel(j),
  cost: j.cost ?? 0,
  refunded: j.refunded ?? 0,
  /** Refund outcome (failed/blocked/canceled): { refunded: boolean, amount, freeGenReturned }; null while running/done. */
  refund: j.refund ?? null,
  creditsBack: j.creditsBack ?? null, // routing: {credits, attempts} when every route attempt failed (credits back to your balance)
  /** Percent complete 0–100 (Comfy progress events, simulated in mock); queuePos while queued. */
  percent: j.status === 'done' ? 100 : j.status === 'running' && j.progressKind === 'indeterminate' ? null : j.progress,
  /** Item 5: 'steps' = percent comes from real sampler steps; 'indeterminate' = no step data yet (show elapsed time, no percent); null = simulated / provider-reported. */
  progressKind: j.progressKind ?? null,
  /** Live sampler steps from ComfyUI: {value, max, sampler, samplers} (null when unknown). */
  steps: j.status === 'running' ? j.steps ?? null : null,
  /** Shared progress for every runner (progress.ts; TRANSPARENCY-PLAN 4i): {stage queued|loading|generating|finishing|done|failed|canceled, step?, steps?, percent? (only when
   *  really known), etaSeconds? (step-ETA), queuePosition?, previewUrl?, previewAt? (live ComfyUI preview frame), source local-comfy|comfy-cloud|comfy-router|fal|replicate|bfl|mock}.
   *  One label source: stage + step/steps. `progress` stays the 0–100 number for compatibility. */
  progressInfo: progressOf(j),
  draft: !!j.input.draft,
  /** 'draft' | 'final' (rendered from a draft) | null — lets Assets label or collapse draft/final pairs. */
  badge: j.input.draft ? 'draft' : j.input.fromDraft ? 'final' : null,
  finalId: j.input.draft ? ([...jobs.values()].find((x) => x.input.fromDraft === j.id)?.id ?? null) : null,
  free: !!j.input.free,
  lane: j.lane ?? (j.input.free ? 'free' : 'paid'),
  partial: !!j.partial,
  seed: j.input.seed ?? null,
  ...lib.metaOf(j.id),
  /** Featured (2026-10-26): starred with "Feature this" (POST /api/jobs/:id/feature), or one of the app's own featured generations. */
  featured: !!lib.metaOf(j.id).featured,
  /** One of the app's examples (shared/featured.ts, seeded once into the Examples project, $0 for you): the real model, place and original price
   *  (runOn, costUsd) for its details, and the feed's "Example" tag. null on your own results. */
  example: (() => { const k = (j as any).featuredExample; const f = typeof k === 'string' ? featuredByKey(k) : null; return f ? { key: f.key, flow: f.flow, title: f.title, model: f.model, width: f.out.width, height: f.out.height, poster: f.out.poster, recreateHref: f.recreateHref ?? null, before: f.before ?? null, end: f.end ?? null, runOn: f.runOn, costUsd: f.runOn === 'local' ? 0 : f.costUsd ?? null } : null; })(),
  /** Same semantics as /api/community items: false for Imagination Is All You Need / Blender sample media (seeded rows), true for anything a model made. */
  aiGenerated: lib.metaOf(j.id).aiGenerated ?? true,
  /** Visible credit line for sample media ('Sample · Imagination Is All You Need', 'Sample · CC-BY Blender Foundation'); null for generated results. */
  sampleCredit: lib.metaOf(j.id).sampleCredit ?? null,
  /** Assets tile: interim AI poster still (seeded demo jobs, once DP's /examples/assets/<id>.jpg exists) + its caption; null = use the output's own poster. */
  ...jobPoster(j.id),
  warnings: j.warnings,
  /** Late-result rescue (comfy/lateRescue.ts): true while a failed local run's prompt may still finish on ComfyUI (the client keeps polling it);
   *  finishedLateAt = when a late result was collected (the job is done, "Finished late"). */
  lateWatch: j.status === 'failed' && !!j.lateWatch && j.lateWatch.until > Date.now(),
  finishedLateAt: j.finishedLateAt ?? null,
  parentId: j.parentId ?? null,
  input: publicInput(j.input),
  /** Page 17: private (default) | unlisted (share link) | public (published). POST /api/jobs/:id/visibility. */
  visibility: lib.metaOf(j.id).published ? 'public' : lib.metaOf(j.id).shareToken ? 'unlisted' : 'private',
  /** Page 19 specs panel: {resolution, durationSec, aspect, prompt, seed, toolName} (null when the tool has no such setting). */
  specs: jobSpecs(j),
  createdAt: j.createdAt,
  finishedAt: j.finishedAt ?? null,
  /** Last change of status/progress/queuePos/stage (ms), restart requeue, slow hint, group outcomes. */
  updatedAt: touched(j),
  requeuedAt: j.requeuedAt ?? null,
  requeued: !!j.requeuedAt,
  originClientId: j.originClientId ?? null,
  startedAt: j.startedAt ?? null,
  /** When ComfyUI began executing it (out of every queue); null on hosted APIs and older jobs. Render time = finishedAt - renderStartedAt. */
  renderStartedAt: j.renderStartedAt ?? null,
  slow: isSlow(j),
  groups: groupCount(j.input),
  failedGroups: j.failedGroups ?? [],
  canceledGroups: j.canceledGroups ?? 0,
  /** Result actions: 'upscale' → POST /api/jobs/:id/upscale (SeedVR2, same seed, parentId = this job). */
  actions: upscalable(j) ? ['upscale'] : [],
  upscaleOf: j.input.upscaleOf ?? null,
  /** HW-SHAPES B4: first-use download / model load detail, stage times, ETA split, and the local fit at submit (null on cloud jobs). */
  stageDetail: j.stageDetail ?? null,
  stageTimes: j.stageTimes ?? null,
  etaBreakdown: j.etaBreakdown ?? null,
  fit: j.fit ?? null,
  /** A free local run: what the cheapest hosted route would have cost for the same model and settings at submit (USD) and that route {routeId, runOn, label, credits}; null when no hosted route exists. */
  savedUsd: j.savedUsd ?? null, savedVs: j.savedVs ?? null, videoFit: j.videoFit ?? null /* Fit to model: what was done to the clip (viewer details) */,
  /** A local run: the machine it ran on ('M3 Max'), when known. */
  machine: j.machine ?? null,
  /** The provider-reported cost (USD) when there is one, else null. */
  actualUsd: j.actualCost && Number.isFinite(j.actualCost.usd) ? j.actualCost.usd : null,
});

await loadPlugins();
/** Plugin load report: loaded + skipped (with validation errors). */
app.get('/api/plugins', async () => { const { isToolHidden } = await import('./tools/registry.js'); const { readFileSync: rf, existsSync: ex } = await import('node:fs');
  return pluginStatus().map(({ dir, ...s }) => { let m: any = {}; try { m = JSON.parse(rf(path.join(dir, 'plugin.json'), 'utf8')); } catch { /* invalid manifest: fields stay null */ }
    const t = s.toolId ? getTool(s.toolId) : undefined; const icon = m.icon ?? m.iconUrl ?? m.previewUrl ?? (t as any)?.app?.posterUrl ?? (ex(path.join(dir, 'icon.png')) ? `/plugins/${s.id}/icon.png` : null);
    // Name, description and version are always present (null when absent); icon and homepageUrl are optional.
    return { ...s, name: m.name ?? s.id, description: m.description ?? null, version: m.version ?? null, icon: icon ?? null, homepageUrl: m.homepageUrl ?? m.homepage ?? m.repository?.url ?? m.repository ?? null,
      enabled: !(s.toolId && isToolHidden(s.toolId)), dir: path.relative(process.cwd(), dir) }; }); });

/** Client config: 'No credits, local' mode hides prices + the ledger when localFree. */
app.get('/api/config', async () => ({ backend: config.backend, /** BH9 (c): filming mode (npm run filming -- on|off|status). notificationPrompts:false → don't ask for notifications. */ filming: { on: FILMING.on, since: FILMING.since, notificationPrompts: notificationPrompts(), fallbackOffers: fallbackOffers() }, notificationPrompts: notificationPrompts(), fallbackOffers: fallbackOffers(), /** BH9 (e): true only when every enabled route is local (no cloud/API key on); cloudEnabled = provider ids with paid routes on. */ localFree: localFreeNow(), cloudEnabled: cloudProvidersEnabled(), openWeightsOnly: openWeightsOnly(), /** Open models only: locked by OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY / filming mode (the setting can't turn it off). */ openWeightsLocked: OPEN_WEIGHTS_ONLY_ENV, draftQuality: '480p', draftFactor: DRAFT_PRICE_FACTOR, keepAudioDefault: true, upscaleTool: getTool('upscale') ? 'upscale' : null, mcp: publicMcpInfo(mcpInfo()), ...repoInfo(), hosted: HOSTED, trashDays: TRASH_DAYS, /** real-cost decision 2026-10-21: 'own-accounts' (default) | 'team' (billingMode.ts) */ billingMode: billingModeNow() }));
registerPrecheck(app);
registerPreflight(app, getTool);
registerPromptPeek(app, getTool); registerPromptGrammar(app); // prompt grammar (read-only): how each model reads its prompt and inputs // "See the exact prompt": the job's composed prompt for a form, nothing runs
/** Image features (transparency, 2026-10-22): each feature with its plain name, URL, the models that really work for it, what each pair supports and its workflow source. */
app.get('/api/image-features', async () => ({ features: imageFeaturesPayload(), camera: { options: RIG_OPTIONS, default: RIG_DEFAULT, fields: ['cameraBody', 'lens', 'focal', 'aperture', 'film', 'lighting', 'era'], communityNode: FILM_STYLER_NODE } }));
/** Unified Create Image (step 1): the image workflow recipes the bar's picker and strip are built from (shared/workflows.ts). Same body for
 *  everyone until the tool registry changes, so it is cache-friendly: ETag + a short max-age; If-None-Match answers 304. */
{ const wfErrs = validateImageWorkflows(getTool as any); if (wfErrs.length) console.error(`[image-workflows] ${wfErrs.length} recipe problem(s):\n  ${wfErrs.join('\n  ')}`); }
app.get('/api/image-workflows', async (req, reply) => {
  const body = JSON.stringify(withWorkflowDefaults(imageWorkflowsPayload(getTool as any, workflowModelCheck(getTool)), getTool)); const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`;
  reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=600').header('etag', etag);
  if (req.headers['if-none-match'] === etag) return reply.code(304).send();
  return reply.type('application/json; charset=utf-8').send(body);
});
/** One Audio page (2026-10-23): the Audio workflows (Music, Sound effects, Voiceover, Change voice, Translate, Music / Sound for a video, Cover a song)
 *  in the same shape as /api/image-workflows (shared/audioWorkflows.ts), each run by its existing tool + mode. Same caching. */
{ const errs = validateAudioWorkflows(getTool as any); if (errs.length) console.error(`[audio-workflows] ${errs.length} recipe problem(s):\n  ${errs.join('\n  ')}`); }
app.get('/api/audio-workflows', async (req, reply) => {
  const body = JSON.stringify(withWorkflowDefaults(audioWorkflowsPayload(getTool as any), getTool, audioDefaultsOf)); const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`;
  reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=600').header('etag', etag);
  if (req.headers['if-none-match'] === etag) return reply.code(304).send();
  return reply.type('application/json; charset=utf-8').send(body);
});
/** Image presets (2026-10-22): saved recipes for one workflow each (shared/presets.ts). Checked once at boot against the live tools: a preset with an
 *  unknown workflow, field or value is logged and left out. Same caching as /api/image-workflows. */
const PRESETS_OK = (() => { const r = validateImagePresets(getTool as any); if (r.errors.length) console.error(`[image-presets] ${r.errors.length} preset problem(s), left out:\n  ${r.errors.join('\n  ')}`); return r.ok; })();
/** Recipes with the quote check, for the Workflows pages (cached briefly: the check quotes every model). */
let RECIPES: { at: number; list: any[] } | null = null;
const recipesNow = () => { if (!RECIPES || Date.now() - RECIPES.at > 30_000) RECIPES = { at: Date.now(), list: imageWorkflowsPayload(getTool as any, workflowModelCheck(getTool)).workflows }; return RECIPES.list; };
const WL = await import('./workflowLooks.js');
app.get('/api/image-presets', async (req, reply) => {
  /* + the looks you saved from a result (workflowLooks.ts), so ?preset=<id> opens them too; they change at any time, so no max-age (the ETag still answers 304) */
  const pl = imagePresetsPayload(getTool as any, PRESETS_OK); const body = JSON.stringify({ ...pl, presets: [...WL.userLooksAsPresets(getTool as any, recipesNow), ...pl.presets] }); const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`;
  reply.header('cache-control', 'no-cache').header('etag', etag);
  if (req.headers['if-none-match'] === etag) return reply.code(304).send();
  return reply.type('application/json; charset=utf-8').send(body);
});
/** Workflows pages (2026-10-23): looks per image workflow, saved looks (table user_looks), per-model results with real prices. */
{ const Prefill = await import('./routesPrefill.js'); WL.registerWorkflowLooks(app, { getTool: getTool as any, presets: () => PRESETS_OK, recipes: recipesNow }, (t, j) => Prefill.formFromInput(t, j, { sameSeed: false }).form); }
/** One of our ComfyUI graphs from workflows/ (the "Ours" workflow credit links here): a *.json name there or in cloud/, deploy/ or cloud-featured/; no other paths. */
app.get<{ Params: { file: string } }>('/api/workflows/:file', async (req, reply) => {
  /* a plain name, or one of our sub-folders (cloud/, deploy/, cloud-featured/: the credits name cloud/h3-two-person-swap-api.json etc.); never a path out */
  const f = req.params.file; if (!/^(?:(?:cloud|deploy|cloud-featured)\/)?[\w-][\w.-]*\.json$/.test(f)) return reply.code(400).send({ error: 'Not a workflow file name.' });
  const p = path.join(WORKFLOWS_DIR, f); if (!p.startsWith(WORKFLOWS_DIR + path.sep) || !existsSync(p)) return reply.code(404).send({ error: 'No such workflow.' });
  return JSON.parse(await (await import('node:fs/promises')).readFile(p, 'utf8'));
});
app.get('/api/health', async () => {
  const comfy = config.backend === 'comfy' ? checkComfyReady({ probeLocal: true }) : { ok: false as const, reason: 'backend=mock' };
  return {
    ok: true,
    /** the app's version (root package.json), shown in Settings → Profile */
    version: APP_VERSION,
    backend: config.backend,
    openWeightsOnly: openWeightsOnly(),
    comfyReady: comfy.ok,
    comfyReason: comfy.ok ? null : comfy.reason,
    baseUrl: config.comfyBaseUrl || null,
    tools: listTools().map((t) => t.id),
    /** [R44] results kept this many days (0 = forever); the UI can show the note. */
    resultTtlDays: RESULT_TTL_DAYS,
    queue: laneSizes(),
  };
});

const isVideoTool = (t: any) => !!t.gpuSecPerSec?.['480p'] && !/upscale/.test(t.id) && (toolExtras(t) as any).media === 'video';
/** P2 (BUG-HUNT-8 #6): 409 route_changed copy: plain, says nothing was charged. */
const ROUTE_CHANGED_MSG = 'The price went up. Nothing was charged.';
/* built once and shared until something changes (toolsCache.ts; the builder is set with the routing below); the plain list goes out as
 * cached JSON with an ETag (304 when unchanged), ?toolId= / ?fields= still go through the payload filters */
registerToolsInvalidation(app); registerResponseCache(app, ['/api/models']); // before compression (registered last): the plain JSON is kept
app.get('/api/tools', async (req, reply) => { try { if (process.env.OHF_TEST_FAIL_TOOLS === '1') throw new Error('forced failure (OHF_TEST_FAIL_TOOLS=1)');
  const b = toolsBody(); if (Object.keys((req.query ?? {}) as object).length) return b.list;
  reply.header('etag', b.etag).header('cache-control', 'no-cache');
  if (String(req.headers['if-none-match'] ?? '').split(',').some((t) => t.trim().replace(/^W\//, '') === b.etag)) return reply.code(304).send();
  return reply.type('application/json; charset=utf-8').send(b.json); } catch (e: any) {
  req_log(e); return reply.code(503).header('Retry-After', '3').send({ error: 'Could not load the tool registry. Retrying in 3 s.', errorType: 'temporary', retryable: true, retryAfterMs: 3000, detail: String(e?.message ?? e).slice(0, 300) });
} });
/** Display names never carry a backend suffix (" · mock"); the backend lives in providers[].backend. */
const displayName = (n: string) => n.replace(/\s*[·•]\s*mock\b/gi, '').replace(/\s*\(mock(?: only)?\)/gi, '').trim();
const providerBackend = (p: { kind: string; via?: string }) => ({ mode: config.backend === 'comfy' && p.kind !== 'hosted' && !/mock only/.test(p.via ?? '') ? 'comfy' : 'mock', live: config.backend === 'comfy' && p.kind !== 'hosted' && !/mock only/.test(p.via ?? '') });
/** Camera Moves: synthesized muted loop per move (scripts/gen-example-media.py → server/samples/camera/). */
const CAMERA_PREVIEW_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../samples/camera');
const movePreview = (toolId: string, presetId: string) => toolId === 'camera' && existsSync(path.join(CAMERA_PREVIEW_DIR, `${presetId}.mp4`))
  ? { previewUrl: `/samples/camera/${presetId}.mp4`, previewWebm: `/samples/camera/${presetId}.webm`, previewGif: `/samples/camera/${presetId}.gif` } : null;
function req_log(e: unknown) { app.log.error({ err: e }, 'GET /api/tools failed'); }
/** A tool's presets as GET /api/tools and /api/presets list them: the visible ones, with their preview clips and licence. */
const visiblePresets = (t: ReturnType<typeof listTools>[number]) => t.presets?.filter((p) => presetOk(p)).map((p) => ({ ...p, previewUrl: p.previewUrl ?? movePreview(t.id, p.id)?.previewUrl ?? null, ...(movePreview(t.id, p.id) ?? {}), ...(p.license ? { license: LICENSES[p.license] } : {}) }));
/** B6: the per-model status DP shows on every model row (runnable, demo, needsKey, keyOwner, wired, reasonCode, reason, qualityRank). */
function toolsPayload() { return (
  listTools().map((t) => {
    const ps = toolProviders(t); const DEF = defaultsBlock(t); // B6: preferred / default / fallback + per-model status (routing/defaults.ts)
    const { id, name, description, category, status, previewUrl, route, ui, inputs, presets, workflows, model, gpuSecPerSec, stages, app: appCfg, freeGens } = t;
    const hidden = new Set((presets ?? []).filter((p) => !presetOk(p)).map((p) => p.id));
    const wfs = workflows; void workflowOsi; // K3: every workflow listed whatever its licence
    return { id, name, ...(status ? { status } : {}), ...(t.listed === false ? { listed: false } : {}), ...((f) => (f ? { featureId: f.id } : {}))(IMAGE_FEATURES.find((f) => f.inMenu && f.toolId === t.id && f.route === t.route)), ...toolExtras(t), allowed: allowedFor(t) /* DP #20.3: effective enum allowlists (shared/enumParams.ts) */, ...((t as any).imageOptional ? { imageOptional: true } : {}) /* Camera Moves: some route runs without the start image */, ...((t as any).capabilities ? { capabilities: (t as any).capabilities } : {}) /* Re-shoot: angleSpace + imageInputByProvider */, category, group: category /* legacy alias */, previewUrl: previewUrl ?? null, description, route, ui,
      inputs: inputs.map((i: any) => (Array.isArray(i.options) ? { ...i, options: i.options.filter((o: string) => !hidden.has(o)) } : i)),
      presets: visiblePresets(t),
      app: appCfg ?? null, freeGens: freeGens ? { left: freeGensLeft(), maxRes: FREE_GENS_MAX_RES } : null, workflows: wfs,
      workflowVariants: wfs.map((file) => ({ file, license: workflowLicense(file) })), model, gpuSecPerSec, stages, backend: config.backend,
      ...(() => { const { modelStatus: _ms, ...D } = DEF; return D; })(), twinAliases: Object.fromEntries(ps.filter((p) => isTwinAlias(p.id, toolKeys(t))).map((p) => [p.id, TWIN_ALIASES[p.id]])),
      providers: ps.map((p) => ({ id: p.id, ...(isTwinAlias(p.id, toolKeys(t)) ? { twinOf: TWIN_ALIASES[p.id], qualityRank: null } : modelFields(DEF.modelStatus[p.id])), ...(t.id === 'object-swap' ? { swapTypes: SWAP_TYPES[p.id] ?? ['person'] } : {}), ...((d) => (d ? { durations: d } : {}))(durationsFor(durToolOf(t) ?? t.id, p.id)), ...lifecycleFields(p.id), ...((w) => (w ? { workflow: w } : {}))(appWorkflowFor(t.id, p.id)) /* workflow credit: Router video apps, image apps, and the recorded app graphs (shared/appWorkflows.ts; Workflows page) */, name: cardName(t.id, p.id) ?? cleanName(displayName(p.name)), /* N5: same card name as /api/models (never 'Open weights') */ family: catalogFor(t.id, p.id)?.family ?? null, featured: !!catalogFor(t.id, p.id)?.featured, description: catalogFor(t.id, p.id)?.description ?? null, kind: p.kind, openWeights: providerOpenWeights(p), via: p.via, backend: providerBackend(p), stages: p.stages ?? stages, license: providerLicense(t, p), workflows: providerWorkflows(t, p), docUrl: p.docUrl ?? null, apiKeyEnv: p.apiKeyEnv ?? null, nodes: p.nodes ?? [], minComfyVersion: p.minComfyVersion ?? null, modes: (t.app as any)?.providerModes?.[p.id] ?? null, priceFactor: t.pricing?.providerFactors?.[p.id] ?? PROVIDER_FACTORS[p.id] ?? 1 })), pricing: { optionFactors: t.pricing?.optionFactors ?? OPTION_FACTORS[t.id] ?? {} }, plugin: t.plugin ? { id: t.plugin.id, version: t.plugin.version ?? null, license: t.plugin.license, handler: t.plugin.handler } : null, draft: (t as any).draft ?? (isVideoTool(t) ? { quality: '480p', factor: PRICE_LADDERS[t.id] ? 1 : DRAFT_PRICE_FACTOR } : null), priceLadder: PRICE_LADDERS[t.id] ?? null, localFree: localFreeNow(), ...etaFor(t), ...(t.id === 'camera' ? { etaByPresetGroup: { 'LTX camera': { anchor: 'LTX2', ...etaFor(t, { presetGroup: 'LTX camera' }) } }, etaByProvider: { 'cloud-ltx-camera': { anchor: 'LTX2', ...etaFor(t, { providerId: 'cloud-ltx-camera' }) } } } : {}) };
  })
); }

/** Validated multipart parts have canonical extensions; library picks are probed again before linking. */
function uploadTypeOk(field: string, ext: string, mime: string, accept?: string) {
  const e = ext.toLowerCase();
  const kind = acceptKind(accept) ?? uploadKind(field);
  if (field === 'streams') return e === '.mjpeg'; // Direct a Shot's existing frame recording contract
  return kind === 'video' ? /^\.(mp4|mov|webm|m4v)$/.test(e) : kind === 'audio' ? /^\.(mp3|wav|m4a|aac|ogg|flac)$/.test(e) : kind === 'image' && /^\.(png|jpe?g|webp)$/.test(e);
}

/** S-01: the one spend guard (submit, retry, Try on, upscale, allowFallback moves) lives in spendGuard.ts. */
const spendGuard: typeof import('./spendGuard.js').spendGuard = async (reply, o) => (await import('./spendGuard.js')).spendGuard(reply, o);

async function createJob(toolId: string, req: FastifyRequest, reply: FastifyReply) {
  const tool = getTool(toolId);
  if (!tool) return reply.code(404).send({ error: `unknown tool ${toolId}` });
  if (tool.id === 'photos-reel') return reply.code(400).send({ error: 'Use the Photos → Reel workflow (app-photos-to-reel).' });
  const id = randomUUID().slice(0, 8); (req as any).uploadJobId = id; // BH4 #2: safeCreateJob removes this request's files unless the job is created
  const fields: Record<string, string> = {};
  const files: Record<string, string[]> = {};
  const hash = createHash('sha256'); hash.update(toolId);
  let n = 0; const libraryPicks: string[] = [];
  try {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const ext = path.extname(part.filename || '') || (part.fieldname === 'video' ? '.mp4' : '.png');
        if (!uploadTypeOk(part.fieldname, path.extname(part.filename || ''), part.mimetype, tool.inputs.find(i => i.name === part.fieldname)?.accept)) { part.file.resume(); const imgHint = (tool.app as any)?.input === 'video' && part.fieldname === 'video' && /^image\//.test(part.mimetype || '') && /upscale/.test(tool.id) && getTool('image-upscale');
          if (imgHint) { const msg = `${tool.name} takes a video. For a still image, use Upscale in the Image menu.`; return reply.code(400).send({ error: msg, errorType: 'validation', issues: [{ code: 'format', field: 'video', message: msg }], hint: { toolId: 'image-upscale', route: getTool('image-upscale')!.route } }); }
          return reply.code(400).send({ error: `Unsupported file type for ${part.fieldname}: ${path.extname(part.filename || '') || part.mimetype}.`, errorType: 'validation', issues: [{ code: 'format', field: part.fieldname, message: `Unsupported file type ${path.extname(part.filename || '') || part.mimetype}.` }] }); }
        const name = `${id}-${part.fieldname}${n++}${ext}`; const own = createHash('sha256');
        part.file.on('data', (c: Buffer) => { hash.update(c); own.update(c); });
        await pipeline(part.file, createWriteStream(path.join(DATA_DIR, name)));
        // [R12] @fastify/multipart truncates at fileSize instead of failing: turn that into a clean 400.
        if ((part.file as any).truncated) return reply.code(400).send({ error: `File too large (max ${MAX_UPLOAD_MB} MB).`, errorType: 'validation', issues: [{ code: 'file_too_large', field: part.fieldname, message: `File too large (max ${MAX_UPLOAD_MB} MB).` }] });
        MS.dedupe(name, own.digest('hex')); // one copy per file: same bytes already stored → this name becomes a hard link to them
        (files[part.fieldname] ??= []).push(name);
      } else if (part.fieldname.startsWith('@file:')) {
        /* Media picker: a slot filled from the library (an upload or a generation) names the file instead of re-uploading it. Only the
           user's own uploads and inputs / outputs of jobs not in Trash (mediaStore.libraryRel); linked in under this job's own name. */
        const field = part.fieldname.slice(6); const url = String(part.value ?? '');
        const rel = /^[A-Za-z][\w]{0,40}$/.test(field) ? MS.libraryRel(url) : null;
        if (!rel) return reply.code(400).send({ error: 'That file is no longer in your library. Pick it again or upload it.', errorType: 'validation', code: 'library_file', issues: [{ code: 'library_file', field, message: 'That file is no longer in your library.' }] });
        const ext = path.extname(rel).toLowerCase();
        const input = tool.inputs.find(i => ['file', 'files'].includes(i.kind) && i.name === field); const kind = acceptKind(input?.accept);
        if (!input || !kind || !uploadTypeOk(field, ext, '', input.accept)) return reply.code(400).send({ error: `Unsupported file type for ${field}: ${ext}.`, errorType: 'validation', issues: [{ code: 'format', field, message: `Unsupported file type ${ext}.` }] });
        try { await validateUpload(MS.absOfRel(rel), `library${ext}`, '', field, kind); } catch { return reply.code(400).send({ error: 'That library file is not supported media.', errorType: 'validation' }); }
        const name = `${id}-${field}${n++}${ext}`; MS.linkOrCopy(MS.absOfRel(rel), path.join(DATA_DIR, name)); hash.update(`\0@${field}=${url}`);
        (files[field] ??= []).push(name); libraryPicks.push(name);
      } else { fields[part.fieldname] = String(part.value); if (part.fieldname !== 'clientJobId' && part.fieldname !== 'idempotencyKey') hash.update(`\0${part.fieldname}=${fields[part.fieldname]}`); } // the key itself is not part of the request it names
    }
  } catch (e: any) {
    if (e?.code === 'FST_REQ_FILE_TOO_LARGE' || e?.statusCode === 413) return reply.code(400).send({ error: `File too large (max ${MAX_UPLOAD_MB} MB).`, errorType: 'validation' });
    throw e;
  }
  /* WebP pictures become PNG once, here, so every route and model gets PNG / JPEG (imageNormalize.ts; the slots accept WebP: shared/mediaAccept.ts) */
  { const moved = await (await import('./imageNormalize.js')).normalizeImageFiles(DATA_DIR, files); libraryPicks.forEach((n, i) => { libraryPicks[i] = moved.get(n) ?? n; }); }
  /** DEMO-QA: job submits now run the same image checks as POST /api/media (mediaCheck.ts): unreadable / low_res (<128px short side) / all-black → 400, nothing charged. */
  for (const [field, names] of Object.entries(files)) for (const [k, name] of names.entries()) {
    if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
    if (field === 'mask') continue; // black/white masks are valid raster media, not photographs
    const { checkImage } = await import('./mediaCheck.js'); const chk = await checkImage(path.join(DATA_DIR, name), names.length > 1 ? `${field}[${k}]` : field);
    const blk = chk.issues.find((i) => i.severity === 'block');
    if (blk) return reply.code(400).send({ error: blk.message, errorType: 'validation', code: blk.code, issues: chk.issues.filter((i) => i.severity === 'block').map(({ code, field: f, message }) => ({ code, field: f, message })), refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } });
  }
  /** [R23] Idempotency (server/src/idempotency.ts, 24 h): Idempotency-Key header (aliases Client-Job-Id header, clientJobId / idempotencyKey field or query).
   *  Same key + same request (tool, fields, upload bytes) → the original response (idempotentReplay:true), no second job, hold or charge; a different request → 409. */
  const idemKey = I.idemKeyOf(req, fields);
  const fieldsHash = hash.digest('hex');
  if (idemKey) {
    await I.idemLock(idemKey, reply);
    const hit = I.idemGet(idemKey);
    if (hit) {
      if (hit.fieldsHash !== fieldsHash) return reply.code(409).send(I.conflictBody());
      const r = I.replayOf(hit); if (r) return reply.code(r.status).send(r.body);
      const j = hit.jobId ? jobs.get(hit.jobId) : undefined; // entry stored before responses were kept: rebuild the job response
      if (j) return reply.code(200).send({ id: j.id, toolId: j.toolId, provider: j.provider, warnings: j.warnings, cost: j.cost ?? 0, free: !!j.input.free, freeGensLeft: freeGensLeft(), balance: getBalance(), seed: j.input.seed, idempotentReplay: true });
    }
    I.idemTrack(req, idemKey, fieldsHash);
  }
  if (tool.id === 'app-photos-to-reel') {
    const result = await (await import('./photosToReel.js')).startReel(app, req, reply, id, fields, files);
    if (jobs.has(id) && idemKey) I.idemPut(idemKey, { fieldsHash, jobId: id, ts: Date.now() });
    return result;
  }
  /** Step 2 (MODEL-ROUTE-SPEC): model (a model key, or an old engine id) + runOn → the engine / route fields below, by the SAME
   *  resolveModelRequest the quote's preHandler uses (routing/http.ts), before the app locks apply (as on the quote). */
  const runOnField = fields.runOn ?? fields.run_on;
  const MR = tool.id === 'motion-transfer' || (fields.model || (runOnField != null && runOnField !== '')) && !(!runOnField && getProvider(fields.model)) ? (await import('./routing/partPick.js')).preferRunnablePart(tool, (await import('./routing/modelRegistry.js')).resolveModelRequest(tool, { model: fields.model, runOn: runOnField, provider: fields.provider, route: fields.route, types: fields.mode ? [fields.mode] : fields.types, mode: fields.mode }), fields) : null; // Motion also checks legacy provider / route-only requests against its scoped availability guard.
  if (MR && !MR.ok) { const { ok: _o, status, ...body } = MR; return reply.code(status).send({ ...body, issues: [{ code: body.code, field: body.field, message: body.error }], charged: false, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); }
  if (!MR && fields.model && !fields.provider && getProvider(fields.model)) fields.provider = fields.model; // an old engine id alone (model= alias of provider=), as the quote reads it
  if (MR?.ok) { if (MR.provider) { fields.provider = MR.provider; fields.model = MR.provider; } if (MR.route) fields.route = MR.route; if (MR.types && !fields.types && !fields.mode) fields.types = MR.types; }
  const routeReq = (extraReq: Record<string, any> = {}) => ({ route: fields.route, allowFallback: fields.allowFallback, ...(MR?.ok ? { runOn: MR.runOn && MR.runOn !== 'auto' ? MR.runOn : undefined, allowRoutes: MR.allowRoutes, modelKey: MR.modelKey } : {}), ...extraReq });
  /** Apps gallery: a locked provider always wins over the client's choice. */
  const lockedProvider = (tool.app as any)?.gallery?.locked?.provider as string | undefined;
  if (lockedProvider) fields.provider = lockedProvider;
  /** Reuse inputs (Recreate without re-upload): fromJob=<id> + reuseInputs=<field,field|all> re-attaches that job's own INPUT files
   *  (routesPrefill.reuseInputFiles: only files recorded on that job, copied under the new id). The output hand-off below then runs
   *  only when `output` is also sent. parentId = the source job. */
  const reuseSpec = fields.fromJob && fields.reuseInputs != null && fields.reuseInputs !== '' ? fields.reuseInputs : null;
  if (reuseSpec) {
    const src = jobs.get(fields.fromJob);
    if (!src || lib.metaOf(src.id).deletedAt) return reply.code(400).send({ error: 'fromJob must be an existing job (not in Trash).', errorType: 'validation', issues: [{ code: 'not_found', field: 'fromJob', message: `Job ${fields.fromJob} not found.` }] });
    const r = await (await import('./routesPrefill.js')).reuseInputFiles(tool, src, reuseSpec, id, files); if ('status' in r) return reply.code(r.status).send(r.body);
    fields.parentId = src.id;
  }
  /** Edit in place: fromJob=<id> feeds that job's output (output=<index>) in as the video/image input, no re-upload. */
  if (fields.fromJob && (!reuseSpec || (fields.output != null && fields.output !== ''))) {
    const src = jobs.get(fields.fromJob);
    const o = src?.outputs?.[Number(fields.output) || 0];
    if (!src || src.status !== 'done' || lib.metaOf(src.id).deletedAt || !o?.url) return reply.code(400).send({ error: 'fromJob must be a finished job with an output.', errorType: 'validation' });
    const isVid = /\.(mp4|mov|webm|m4v)$/i.test(o.url);
    if (!isVid && !/\.(png|jpe?g|webp)$/i.test(o.url)) return reply.code(400).send({ error: 'fromJob output hand-off supports images and videos only. Upload audio or use its dedicated tool.', errorType: 'validation' });
    const field = isVid ? 'video' : fields.as === 'ref' && tool.inputs.some((i) => i.name === 'refs') ? 'refs' : (tool.inputs.some((i) => i.name === 'image') ? 'image' : 'refs'); // as=ref: the image goes in as a reference
    if (!tool.inputs.some((i) => i.name === field)) return reply.code(400).send({ error: `${tool.name} can't take a${isVid ? ' video' : 'n image'} as input.`, errorType: 'validation' });
    const copied: Record<string, string[]> = {};
    const input = field === 'refs' ? { refUrls: [o.url] } : { [`${field}Url`]: o.url };
    const r = await (await import('./routesPrefill.js')).reuseInputFiles(tool, { ...src, input } as Job, field, `${id}-output`, copied);
    if ('status' in r) return reply.code(r.status).send(r.body);
    files[field] = [...copied[field], ...(files[field] ?? [])]; fields.parentId = src.id;
  }
  if (reuseSpec || fields.fromJob) await (await import('./imageNormalize.js')).normalizeImageFiles(DATA_DIR, files);
  /** Saved Elements: `@name` in the prompt attaches that element's image as a ref (tools with a `refs` input). Unknown @names → 400, nothing charged. */
  let attachedElements: AttachedElement[] = [];
  { const refsIn = tool.inputs.find((i) => i.name === 'refs' && i.kind === 'files');
    if (refsIn && fields.prompt) {
      const libEls = lib.listElements(); const r = resolveElements(fields.prompt, libEls);
      /* Elements left the app UI (2026-10-23): with no saved elements an @word is plain prompt text, not an error the UI can't fix. Saved (API) elements keep the old check. */
      if (r.unknown.length && tool.id !== 'cinema' && libEls.length) { const msg = `Unknown element ${r.unknown[0]}. Add it in Cast & props`; return reply.code(400).send({ error: msg, errorType: 'validation', issues: r.unknown.map((u) => ({ code: 'unknown_element', field: 'prompt', message: `Unknown element ${u}. Add it in Cast & props` })), refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); }
      const add = r.attached.filter((e) => e.url.startsWith('/files/') && existsSync(path.join(DATA_DIR, e.url.slice('/files/'.length))));
      const max = refsIn.max ?? Infinity; const have = files.refs?.length ?? 0;
      if (have + add.length > max) { const msg = `Too many references: ${have} uploaded + ${add.length} element${add.length === 1 ? '' : 's'} is over the ${max} limit.`; return reply.code(400).send({ error: msg, errorType: 'validation', issues: [{ code: 'too_many', field: 'refs', message: msg }], refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); }
      if (add.length) { files.refs = [...(files.refs ?? []), ...add.map((e) => e.url.slice('/files/'.length))]; attachedElements = add.map((e, k) => ({ ...e, refIndex: have + k + 1 }) as any); }
    } }
  /** Saved Elements → named ref slots (Photo FX): character→character, location→location, product/other(prop)→products. An upload in a slot wins; too many elements for a slot → 400, nothing charged. */
  { const slots = ((tool.app as any)?.refSlots ?? []) as { name: string; max?: number }[];
    if (slots.length && fields.prompt && !tool.inputs.some((i) => i.name === 'refs')) {
      const nc = { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' };
      const libEls = lib.listElements(); const r = resolveElements(fields.prompt, libEls);
      if (r.unknown.length && libEls.length /* as above: no saved elements → @words are plain text */) return reply.code(400).send({ error: `Unknown element ${r.unknown[0]}. Add it in Cast & props`, errorType: 'validation', issues: r.unknown.map((u) => ({ code: 'unknown_element', field: 'prompt', message: `Unknown element ${u}. Add it in Cast & props` })), refund: nc });
      const slotOf = (k?: string) => k === 'character' ? 'character' : k === 'location' ? 'location' : 'products';
      const by: Record<string, AttachedElement[]> = {};
      for (const e of r.attached) if (e.url.startsWith('/files/') && existsSync(path.join(DATA_DIR, e.url.slice('/files/'.length)))) (by[slotOf(e.kind)] ??= []).push(e);
      const out: any[] = [];
      for (const [slot, list] of Object.entries(by)) {
        const def = slots.find((x) => x.name === slot); const max = def?.max ?? 1; const have = files[slot]?.length ?? 0;
        if (!def) continue;
        if (have >= max) { out.push(...list.map((e) => ({ ...e, slot, skipped: 'upload' }))); continue; } // explicit upload wins
        if (have + list.length > max) { const msg = `Too many ${slot} elements: ${list.length} for ${max - have} free ${slot} slot${max - have === 1 ? '' : 's'}.`; return reply.code(400).send({ error: msg, errorType: 'validation', issues: [{ code: 'too_many', field: slot, message: msg }], refund: nc }); }
        files[slot] = [...(files[slot] ?? []), ...list.map((e) => e.url.slice('/files/'.length))];
        out.push(...list.map((e, k) => ({ ...e, slot, slotIndex: have + k + 1 })));
      }
      attachedElements = out;
    } }
  // Apps with a file-driven mode switch (Product Shot edit, UGC Ad r2v): no provider sent → the engine that mode picks, exactly as the quote does
  if (!fields.provider && (tool.app as any)?.gallery?.providersByMode) { const qp = appQuoteParams(tool, { ...fields, ...Object.fromEntries(Object.entries(files).filter(([, v]) => v?.length).map(([k]) => [k, '1'])) }); if (qp.provider) fields.provider = qp.provider; }
  // B6: no model asked → the tool's default (saved pin, else the first model in quality order that runs now, else the cloud default): same as the quote.
  // usable = default first, then the rest in quality order, so the auto-pick helpers below (Camera text moves, Re-shoot stills, route=) start from it.
  const reqMode = requestMode(tool, fields); const defIds = fields.provider ? null : defaultFirst(tool, reqMode);
  const usable = defIds ? defIds.map((id) => getProvider(id)!).filter(Boolean) : toolProviders(tool);
  // Camera Moves with no start image: Auto picks a route that runs the move from text (LTX / Kling / Veo / Seedance), never an image-only one; none enabled → 400 (nothing charged)
  { const bad = (await import('./shared/enumParams.js')).enumParamError(tool, fields); if (bad) return reply.code(400).send({ ...bad, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); } // Oct 19 #7: same allowlist as the quote
  { const AP = await import('./tools/apps.js'); const lang = AP.translateJob(tool, fields); // Oct 18 #6: translate language per route (quote does the same)
    if (lang) { const tr = AP.translateRoute(lang, fields.provider || null, usable.map((p) => p.id)); if ('error' in tr) return reply.code(400).send({ ...tr, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); if (tr.provider) fields.provider = tr.provider; } }
  if (tool.id === 'camera' && !fields.provider) { const AP = await import('./tools/apps.js'); const pp = AP.cameraPresetProvider(AP.parseTypesField(fields.types).map(AP.cameraMoveId), usable.map((p) => p.id)); if (pp) fields.provider = pp; } // Oct 18 #4: an H3 move in Auto runs on H3 Camera Motion (the quote picks the same)
  if (tool.id === 'camera' && !fields.provider && !files.image?.length && !files.refs?.length) { const AP = await import('./tools/apps.js'); const ty = AP.parseTypesField(fields.types).map(AP.cameraMoveId);
    if (ty.length && AP.cameraImageRequired(usable[0]?.id ?? '', ty)) { const alt = AP.cameraTextProviders(ty, usable.map((p) => p.id)); if (alt[0]) fields.provider = alt[0];
      else return reply.code(400).send({ ...AP.cameraImageRequiredBody(ty, null, usable.map((p) => p.id)), refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); } }
  // Re-shoot with a still source and no model chosen: Auto picks the first enabled model that takes a still (quote does the same); none → 400, nothing charged
  if (tool.id === 'reshoot' && !fields.provider && files.sourceImage?.length && !files.video?.length) { const RS = await import('./tools/reshoot.js'); const ok = RS.reshootImageProviders(usable.map((p) => p.id));
    if (ok[0]) fields.provider = ok[0]; else { const msg = 'None of the enabled Re-shoot models takes a still image. Upload a video instead.'; return reply.code(400).send({ error: msg, errorType: 'validation', code: 'image_input_unsupported', issues: [{ code: 'image_input_unsupported', field: 'sourceImage', message: msg, providers: [] }], refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); } }
  if (!fields.provider && fields.route && fields.route !== 'auto') { const { routesFor } = await import('./routing/routes.js'); // route= alone: the model that owns that route (the quote does the same)
    if (!routesFor(usable[0]?.id ?? '', tool).some((r) => r.routeId === fields.route)) { const own = usable.find((p) => routesFor(p.id, tool).some((r) => r.routeId === fields.route)); if (own) fields.provider = own.id; } }
  if (!fields.provider && defIds?.length) { const alt = lyricsFreeDefault(tool, reqMode, fields, defIds[0]); if (alt) fields.provider = alt; } // music with no lyrics: not YuE2 (it sings lyrics only)
  if (!fields.provider && defIds?.length && draftOn(fields)) { const alt = draftCapableDefault(tool, reqMode, defIds[0]); if (alt) fields.provider = alt; } // draft on: Auto skips models with no draft mode (the quote does the same)
  const providerId = fields.provider || usable[0]?.id;
  if (!fields.provider && providerId) fields.provider = providerId; // B6: the parser sees the same default model the router prices (quote = charge)
  // Camera: no move sent → the model's first move (same as the quote's cameraDefaultMove), so quote route = submit route
  if (tool.id === 'camera' && providerId && (fields.types == null || String(fields.types).trim() === '' || String(fields.types).trim() === '[]')) {
    const AP = await import('./tools/apps.js'); const dm = AP.cameraDefaultMove(providerId); if (dm) fields.types = JSON.stringify([dm]);
  }
  const prov = providerId ? getProvider(providerId) : undefined;
  if (!prov || !tool.providers.includes(prov.id)) return reply.code(400).send({ error: `provider ${providerId} is not supported by ${tool.id}` });
  if (!allowed(prov)) return reply.code(400).send({ error: `${prov.name ?? prov.id} is a hosted API, and open models only is on. Pick an open model, or turn it off in Settings → Connections. Nothing was charged.`, errorType: 'validation', code: 'open_weights_only', detail: `provider ${prov.id} is hosted; open models only is on` });
  // Required media before admit / parseInput: app required groups + Camera image-required providers → 400, no job created.
  // (Re-shoot etc. keep their own codes from parseInput: e.g. image_input_unsupported when a still is sent to a video-only model.)
  { const nc = { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' };
    const G = (tool.app as any)?.gallery; const reqList: (string | string[])[] = G?.required ?? [];
    for (const r of reqList) { const any = Array.isArray(r) ? r : [r]; if (any.some((n) => files[n]?.length)) continue;
      const labelOf = (n: string) => (G?.labels?.[n] ?? tool.inputs.find((i) => i.name === n)?.label ?? n).toString().replace(/ \(optional\)$/, '').toLowerCase();
      const art = (l: string) => (/^(a|an|the|your|some|one)\s/i.test(l) ? l : /^[aeiou]/i.test(l) ? `an ${l}` : `a ${l}`);
      const phrase = (n: string) => ({ video: 'a video', audio: 'an audio clip', image: 'an image', refs: 'a reference image' } as Record<string, string>)[n] ?? (/^(a|an|the|your|some|one)\s/i.test(labelOf(n)) ? labelOf(n) : /^[aeiou]/i.test(labelOf(n)) ? `an ${labelOf(n)}` : `a ${labelOf(n)}`);
      const msg = any.length === 1 ? `Add ${G?.labels?.[any[0]] ? art(labelOf(any[0])) : phrase(any[0])}.` /* BH P3: a/an on the single-input branch too ('Add an image.') */ : `Add ${any.slice(0, -1).map(phrase).join(', ')} or ${phrase(any[any.length - 1])}.`;
      return reply.code(400).send({ error: msg, errorType: 'validation', code: 'required', issues: [{ code: 'required', field: any[0], message: msg }], refund: nc }); }
    if (tool.id === 'camera' && !files.image?.length && !files.refs?.length && providerId) {
      const AP = await import('./tools/apps.js'); const ty = AP.parseTypesField(fields.types).map(AP.cameraMoveId);
      if (ty.length && AP.cameraImageRequired(providerId, ty)) {
        return reply.code(400).send({ ...AP.cameraImageRequiredBody(ty, providerId, usable.map((p) => p.id)), refund: nc });
      }
    }
  }
  // K3: presets are never rejected because of their weights' licence (open-weights-only only drops hosted providers).
  { const no = admit(reply); if (no) return no; }
  if (fields.fromDraft) { // final render of a draft: same seed (and same setup sent by the client)
    const d = jobs.get(fields.fromDraft);
    if (!d || !d.input.draft) return reply.code(400).send({ error: 'fromDraft must be a draft job id', errorType: 'validation' });
    fields.seed = String(d.input.seed); fields.draft = '0'; fields.parentId ||= d.parentId || d.id;
  }
  /* Brand Kit (2026-10-27): brandKit=<id> adds the kit's words after the typed prompt (brandKits.applyBrandToFields, the same helper as the prompt peek); model and price don't change */
  const brand = (await import('./brandKits.js')).applyBrandToFields(tool.id, fields);
  if (brand && 'error' in brand) return reply.code(400).send({ error: brand.error, errorType: 'validation', code: brand.issue.code, issues: [brand.issue], refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } });
  const input = await tool.parseInput(fields, files);
  if (!('error' in input) || typeof (input as any).error !== 'string') (input as any).elements = attachedElements;
  if ('error' in input && typeof input.error === 'string') {
    const issues = (input as any).issues ?? [{ code: 'invalid', field: '', message: input.error }];
    // DP #27: forward field / allowed / provider from parseInput (e.g. unsupported_aspect) so submit matches the quote shape
    const shape = (input as any);
    return reply.code(400).send({ refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' }, error: input.error, errorType: 'validation', issues, ...((input as any).mentionIssues ? { mentionIssues: (input as any).mentionIssues } : {}), ...((input as any).hint ? { hint: (input as any).hint } : {}), ...(Array.isArray((input as any).textProviders) ? { textProviders: (input as any).textProviders } : {}) /* Camera Moves image_required */, ...((input as any).code === 'invalid_duration' ? { durations: (input as any).durations, allowedDurations: (input as any).durations, minSeconds: (input as any).minSeconds, maxSeconds: (input as any).maxSeconds } : {}), ...(shape.field != null ? { field: shape.field } : {}), ...(shape.allowed != null ? { allowed: shape.allowed } : {}), ...(shape.provider != null ? { provider: shape.provider } : {}), code: (input as any).code ?? (issues.length === 1 && issues[0].code !== 'invalid' ? issues[0].code : 'invalid_input') }); // re-check 6: every rejection carries a code
  }
  const inp = input as Record<string, any>;
  { // Fit to model (shared/videoFit.ts + videoFit.ts): the plan for this clip on this model; the run fits the clip first (free, local) and crops a padded
    // result back. A clip the fix can't mend is refused here with the quote's own words; a trim bills the trimmed length (quote = charge).
    const VF = await import('./videoFit.js'); const { fitModeOf } = await import('./shared/videoFit.js'); if (inp.videoPath) inp.fit = fitModeOf(fields.fit);
    const plan = VF.planForJob(tool.id, prov.id, inp);
    if (plan?.blocked) return reply.code(400).send({ error: plan.blocked, errorType: 'validation', code: 'video_fit', issues: [{ code: 'video_fit', field: 'video', message: plan.blocked }], videoFit: (await import('./shared/videoFit.js')).videoFitQuote(plan), refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } });
    if (plan) { inp.videoFit = plan; if (plan.trimTo && Number(inp.duration) > plan.trimTo) inp.duration = plan.trimTo; } }
  if (libraryPicks.length) inp.libraryPicks = libraryPicks; // media picker: files taken from the library (not new uploads in the Uploads tab)
  const totalGroups = groupCount(inp);
  const maxGroups = Math.floor(Number(fields.maxGroups ?? (req.query as any)?.maxGroups) || 0);
  if (maxGroups > 0 && maxGroups < totalGroups) { // run only the first k groups (pinned refs stay in every group)
    inp.refBatches = inp.refBatches.slice(0, maxGroups); inp.refGroupLabels = inp.refGroupLabels?.slice(0, maxGroups); inp.maxGroups = maxGroups;
    if (maxGroups === 1) { inp.refPaths = inp.refBatches[0]; inp.imagePath = inp.refPaths[0] ?? ''; }
    inp.warnings = [...(inp.warnings ?? []), `Running ${maxGroups} of ${totalGroups} reference groups (maxGroups).`];
  }
  const VC0 = await import('./tools/h3/videoCaps.js'); if (!VC0.hasToolDurations(durToolOf(tool) ?? tool.id)) { const VC = VC0; const rs = VC.resolveSeconds(prov.id, fields.seconds); // same resolver as the price quote (quote = charge); Director validates its own duration/seconds in parseInput with the same rule
    if (rs && 'error' in rs) return reply.code(400).send({ ...VC.durationErrorBody(rs, 'seconds'), refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } });
    if (rs) { if (inp.duration > 0 && rs.seconds > inp.duration + 0.05) { (await import('./shared/snap.js')).addAdjustNote(inp, `Made at ${inp.duration} s, the length of your clip (you picked ${rs.seconds} s).`); rs.seconds = inp.duration; delete rs.snapped; } // D5: longer than the source clip → the clip's own length, with a note
      if (inp.duration > 0 && rs.seconds < inp.duration) inp.trimSec = rs.seconds; inp.duration = rs.seconds; VC.noteSnap(inp, rs); } }
  const extra = passesFor(inp); // Re-shoot angles × full clip, × ref groups [R4]
  if (fields.fromDraft) inp.fromDraft = fields.fromDraft;
  const wantFree = /^(1|true|on)$/i.test(fields.useFree || '');
  if (wantFree) {
    if (!tool.freeGens) return reply.code(400).send({ error: `Free gens are not available for ${tool.name}.`, errorType: 'validation' });
    if (freeGensLeft() <= 0) return reply.code(402).send({ error: 'No free gens left.', errorType: 'credits' });
    if (inp.resolution === '1080p') return reply.code(400).send({ error: `Free gens run at up to ${FREE_GENS_MAX_RES}.`, errorType: 'validation' });
    inp.free = true;
  }
  if (typeof fields.variantId === 'string' && fields.variantId.trim()) inp.variantId = fields.variantId.trim().slice(0, 80); // Q7: a lighter GGUF version (local routes)
  if (typeof fields.filmId === 'string' && /^film_[\w]{1,40}$/.test(fields.filmId)) { inp.filmId = fields.filmId; if (/^[\w-]{1,64}$/.test(fields.filmShotId ?? '')) inp.filmShotId = fields.filmShotId; } // Film: the film and shot a render came from (filmProjects.ts)
  if (typeof fields.boardId === 'string' && /^brd_[\w]{1,40}$/.test(fields.boardId)) inp.boardId = fields.boardId; // Canvas: the board the run was started from (its spend chip sums these: canvasBoards.ts boardSpend)
  if (config.backend === 'mock' && inp.boardId) { const ref = (await import('./shared/demoMedia.js')).demoRefFor(inp.boardId, fields.prompt); if (ref) inp.demoRef = ref; } // the Canvas demo's card: the sample server plays its real run (shared/demoMedia.ts)
  if (brand && !('error' in brand)) inp.brand = brand; // the kit on the job: Recreate turns Brand back on with it (routesPrefill.formFromInput)
  if (typeof fields.lookId === 'string' && /^[\w-]{1,64}$/.test(fields.lookId)) inp.lookId = fields.lookId; // Workflows pages: the run was started from a look (the look's page gathers its results)
  if (/^(1|true|on|yes)$/i.test(fields.downloadWeights || '')) inp.downloadWeights = true; // Q4: the user clicked 'Download and run' (never automatic)
  const est = estimateSeconds(tool, inp, extra, prov.id);
  { const pq = priceFor(tool, inp, extra, prov.id); if (pq.basis === 'unavailable') return reply.code(400).send({ error: `${prov.name}: no verified price yet, so hosted runs are disabled. Pick another model.`, errorType: 'validation', issues: [{ code: 'price_unavailable', field: 'provider', message: `${prov.name}: no verified price yet.` }], refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); }
  const cost = wantFree || isLocalFree(prov.kind) ? 0 : est;
  // Multi-provider routing (routing/*): request `route` > saved per-model choice > global default. Free runs keep the legacy path.
  const routed = wantFree ? null : (await import('./routing/select.js')).resolveRoute(tool, prov.id, inp, extra, routeReq());
  if (routed && 'error' in routed) { const { status: rs, ...rb } = routed; const SEL = await import('./routing/select.js');
    const nc = rb.errorType === 'no_provider' && SEL.needsConnection() ? { code: SEL.NO_CONNECTION.code, title: SEL.NO_CONNECTION.title, error: SEL.NO_CONNECTION.message, setupKind: 'none' as const } : {}; // option a: no key, no ComfyUI → the connect sheet
    return reply.code(rs).send({ ...rb, ...nc, charged: false, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); } // no_provider: {needsKey, providers, localAvailable}
  if (routed && routed.first.kind === 'local') { const HWR = await import('./hardware/requirements.js'); const g = HWR.weightsGate(tool, prov.id, inp); // Q4 / DP 3: missing weights never fail mid-run
    if (g) return reply.code(409).send({ error: `${g.message} Nothing was charged.`, errorType: 'routing', code: g.code, reasonCode: g.code, missingBytes: g.missingBytes, missingFiles: g.missingFiles, diskFreeBytes: g.diskFreeBytes, downloadable: g.downloadable, downloadEndpoint: g.downloadEndpoint, downloadId: g.downloadId, alternative: await (async () => { try { return (await import('./routing/fitView.js')).fitAlternative(tool, inp); } catch { return null; } })(), charged: false, calm: true, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); }
  if (routed && config.backend === 'mock' && fields.simulateRouteFail) routed.routing.failRoutes = String(fields.simulateRouteFail).split(',').map((x: string) => x.trim()).filter(Boolean);
  const routedCost = routed ? routed.routing.prices[routed.first.routeId] ?? 0 : null;
  // Quote/submit contract (DP, 2026-10-18; user decision 2026-10-28): optional quotedRouteId / quotedCredits from the quote the user saw. Only a
  // DEARER run asks again: now costs more than the quote → 409 route_changed with the fresh quote (same object GET /price returns); nothing is
  // charged. The same or a lower price just runs (on whichever place the server picked). A different place with no quoted price asks, to be safe.
  { const qr = fields.quotedRouteId?.trim(); const qc0 = fields.quotedCredits != null && fields.quotedCredits !== '' ? Number(fields.quotedCredits) : null; const qc = qc0 != null && Number.isFinite(qc0) ? qc0 : null;
    const nowRoute = routed ? routed.first.routeId : null; const nowCost = routedCost ?? cost;
    if ((await import('./shared/priceChange.js')).priceAskAgain({ quotedRoute: qr || null, quotedCredits: qc, route: nowRoute, credits: nowCost })) {
      const qs = new URLSearchParams(); for (const [k, v] of Object.entries(fields)) if (typeof v === 'string' && v.length <= 4000 && !['quotedRouteId', 'quotedCredits', 'webhookUrl', 'rights'].includes(k)) qs.set(k, v);
      for (const f of Object.keys(files)) if (files[f]?.length && !qs.has(f)) qs.set(f, '1'); // uploads → markers (same as POST /price)
      if (Number(inp.refVideoSeconds) > 0) qs.set('refVideoSeconds', String(inp.refVideoSeconds)); qs.set('provider', prov.id);
      const fresh = await app.inject({ method: 'GET', url: `/api/tools/${tool.id}/price?${qs}` }); let quote: any = null; try { quote = fresh.json(); } catch { /* */ }
      return reply.code(409).send({ error: 'route_changed', code: 'route_changed', message: ROUTE_CHANGED_MSG, userMessage: ROUTE_CHANGED_MSG, detail: 'Review the new price and press Generate again.', charged: false, calm: true, quote, quotedCredits: qc, credits: nowCost, dearer: true,
        refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); // P2 (BUG-HUNT-8 #6): says nothing was charged; calm = not an error
    } }
  // Own-accounts mode (billing.ts): a run that would go over a daily / monthly spending cap for its provider is refused before anything is sent. Local runs are never limited.
  const sg = await spendGuard(reply, { kind: routed ? routed.first.kind : isLocalFree(prov.kind) ? 'local' : 'direct', routeId: routed?.first.routeId ?? null, credits: routedCost ?? cost, demo: !!routed?.routing.demo, free: wantFree });
  if ('sent' in sg) return sg.sent; const runCost = sg.runCost;
  if (!wantFree && !canAfford(routedCost ?? cost)) {
    const needed = routedCost ?? cost; const balance = getBalance(); const n = groupCount(inp);
    const body: Record<string, any> = { error: `Not enough credits: needs ${needed}, balance ${balance}.`, errorType: 'credits', code: 'credits', needed, balance, totalGroups: n, affordableGroups: 0, partialCost: 0, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } };
    if (n > 1) { // the largest k groups we can afford (same pricing path as the full submit)
      for (let k = n - 1; k >= 1; k--) {
        const ik = { ...inp, refBatches: inp.refBatches.slice(0, k), refGroupLabels: inp.refGroupLabels?.slice(0, k) };
        const ek = passesFor(ik); const estK = estimateSeconds(tool, ik, ek, prov.id);
        let ck = isLocalFree(prov.kind) ? 0 : estK;
        if (routed) { const rk = (await import('./routing/select.js')).resolveRoute(tool, prov.id, ik, ek, routeReq()); if (rk && !('error' in rk)) ck = rk.routing.prices[rk.first.routeId] ?? ck; }
        if (ck <= balance) { body.affordableGroups = k; body.partialCost = ck; body.error += ` You can afford ${k} of ${n} groups (${ck} credits): resubmit with maxGroups=${k}.`; break; }
      }
    }
    return reply.code(402).send(body);
  }
  if (fields.webhookUrl) { const we = (await import('./routesGaps.js')).webhookUrlError(fields.webhookUrl); if (we) return reply.code(400).send({ error: we, errorType: 'validation', issues: [{ code: 'invalid', field: 'webhookUrl', message: we }], refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); }
  if (config.backend === 'mock' && /^(1|true)$/i.test(fields.simulateSlow || '')) inp.etaOverride = 1; // mock: declare a 1 s ETA so the run is 'slow'
  const FB = await import('./routing/fallback.js'); // model-fallback notice: requestedModel = what the user originally asked for (e.g. Recreate of a model hidden here)
  const mf = fields.requestedModel ? FB.modelFallbackFor(tool, prov.id, fields.requestedModel, await FB.requestedCreditsFor(tool, String(fields.requestedModel), inp, extra)) : null;
  if (mf) inp.modelFallback = mf;
  const fallback = FB.planNotice(routed ? routed.routing : undefined, prov.id, routed ? routed.first.routeId : null, routedCost ?? cost, mf);
  // Agent budgets (agentBudget.ts): a run started with X-OHF-Agent-Budget that would go over that budget is refused here, before the job is enqueued (nothing reaches a provider). Local / free runs cost $0.
  const AB = await import('./agentBudget.js'); const ag = AB.admitAgentRun(req, reply, { jobId: id, toolId: tool.id, model: MR?.modelKey ?? prov.id, estUsd: wantFree ? 0 : runCost.estUsd, credits: wantFree || runCost.demo ? 0 : routedCost ?? cost });
  if (!('agent' in ag)) return ag;
  const job = enqueue(tool.id, inp, est, id, fields.parentId || null, prov.id, routedCost ?? cost, wantFree);
  if (ag.agent) job.agent = ag.agent;
  if (inp.videoFit?.changed) job.videoFit = (await import('./shared/videoFit.js')).videoFitSummary(inp.videoFit, null); // Fit to model: shown in the viewer's details from the start
  // Create Image toolbar: the picked project gets the new result (an unknown id is ignored: the run still starts); a Compare models run names its group
  if (fields.projectId && lib.getProject(fields.projectId)) lib.setProject(job.id, fields.projectId);
  { const cg = /^[\w-]{4,40}$/.test(fields.compareGroup || '') ? fields.compareGroup : ''; const cn = Math.min(4, Math.max(2, Number(fields.compareOf) || 0)); const ci = Number(fields.compareIndex);
    if (cg && cn >= 2 && Number.isInteger(ci) && ci >= 0 && ci < cn) lib.setCompare(job.id, { id: cg, n: cn, i: ci }); }
  if (fields.webhookUrl) (await import('./routesGaps.js')).registerWebhook(job.id, fields.webhookUrl);
  { const cid = String(req.headers['x-client-id'] ?? '').replace(/[^\w.-]/g, '').slice(0, 64); job.originClientId = cid || null; (job as any).originIp = req.ip; }
  if (routed) { job.routing = routed.routing; job.route = routed.first.routeId; job.routeAttempts = []; }
  if (routed) { const notes = (await import('./routing/select.js')).adjustNotesById(tool, routed.first.routeId, inp).filter((n) => !(job.warnings ?? []).includes(n)); if (notes.length) job.warnings = [...(job.warnings ?? []), ...notes]; } // 2026-10-28: adjusted instead of refused (length rounded, speech trimmed, prompt cut): the job says so
  { const MF = (await import('./routing/modelRegistry.js')).jobModelFields({ toolId: tool.id, provider: prov.id, route: job.route ?? null, input: inp, modelKey: routed?.routing.modelKey ?? MR?.modelKey ?? undefined, runOn: routed?.routing.runOn ?? undefined }); job.modelKey = MF.modelKey ?? undefined; job.runOn = MF.runOn ?? null; } // step 2: model + run-on stored on the job
  if (routed?.first.kind === 'local' && !wantFree) { const sv = (await import('./billing.js')).localSavingsOf(routed.options); if (sv) { job.savedUsd = sv.savedUsd; job.savedVs = sv.vs; } // savings: cheapest hosted quote, same model + settings
    try { job.machine = (await import('./hardware.js')).machineName(); } catch { /* hardware unknown */ } }
  sg.spendRow(job); // spend log (both modes): the estimate now, settled when the job ends
  if (routed?.first.fit) { const FV = await import('./routing/fitView.js'); let fx: any = {}; try { const f = FV.withAlternative(tool, prov.id, inp, routed.first.fit as any); fx = { alternative: f.alternative, alternativeReason: f.alternativeReason, missingBytes: (f as any).missingBytes ?? null, missingBytesSource: (f as any).missingBytesSource ?? null, downloadId: (f as any).downloadId ?? null }; } catch { fx = { alternative: null, alternativeReason: null }; } // HW2: job.fit carries the same alternative as the quote
    job.fit = { verdict: routed.first.fit.verdict, reasonCode: routed.first.fit.reasonCode, reason: routed.first.fit.reason, tier: routed.first.fit.tier, enforced: routed.first.fit.enforced, etaSeconds: routed.first.fit.etaSeconds ?? null, eta: routed.first.fit.eta ?? null, etaRange: (routed.first.fit as any).etaRange ?? null, ...fx, ...(routed.routing.fitWarning ? { warning: routed.routing.fitWarning.message } : {}) };
    if (routed.routing.fitWarning) job.warnings = [...(job.warnings ?? []), routed.routing.fitWarning.message]; // Q2: the loud warning rides on the job too
    const er = (routed.first.fit as any).etaRange as import('./stepEta.js').EtaRange | undefined; // step-ETA: this computer's range; calibrating = the first timed run of this workflow here
    if (er) { job.etaRange = er; job.calibrating = er.calibrating; }
    if ((er?.source === 'learned' || er?.source === 'scaled') && er.seconds) { job.eta = er.seconds; job.etaInitial = er.seconds; }
    else if (routed.first.fit.eta?.source === 'learned' && routed.first.fit.etaSeconds) { job.eta = routed.first.fit.etaSeconds; job.etaInitial = routed.first.fit.etaSeconds; } } // B5: learned ETA on this hardware
  if (idemKey) I.idemPut(idemKey, { fieldsHash, jobId: job.id, ts: Date.now() }); // the response body is added in onSend (idempotency.ts)
  return { id, toolId: tool.id, provider: prov.id, ...(inp.videoFit ? { videoFit: (await import('./shared/videoFit.js')).videoFitQuote(inp.videoFit) } : {}), ...(routed ? { route: routed.first.routeId, routing: { mode: routed.routing.mode, allowFallback: routed.routing.allowFallback, order: routed.routing.order } } : {}), ...(await import('./routing/modelRegistry.js')).jobModelFields(job), warnings: job.warnings, cost: routedCost ?? cost, billingMode: billingModeNow(), estimate: wantFree ? null : runCost, free: wantFree, freeGensLeft: freeGensLeft(), balance: getBalance(), seed: inp.seed, fallback, demo: !!routed?.routing.demo, demoMessage: routed?.routing.demo ? DEMO_MESSAGE : null, ...(job.fit ? { fit: job.fit } : {}), ...(routed?.routing.fitWarning ? { fitWarning: routed.routing.fitWarning.message } : {}) };
}

/** [P0] A thrown error in job creation must never take the process down: answer 500, nothing charged. */
/** BH4 #2 (G7): every file a submit writes is named `<new job id>-<field><n>.<ext>` (uploads, reuse copies). When the request ends without
 *  creating that job (type/size/content validation 400, truncated upload, Idempotency-Key replay or 422, unknown @element, a thrown error)
 *  those files are removed at once, so rejected submits leave nothing on disk. */
function dropRequestUploads(req: FastifyRequest) {
  const id = (req as any).uploadJobId as string | undefined; if (!id || !/^[0-9a-f]{8}$/.test(id) || jobs.has(id)) return 0;
  let n = 0; for (const f of readdirSync(DATA_DIR)) if (f.startsWith(`${id}-`)) { try { rmSync(path.join(DATA_DIR, f), { force: true }); n++; } catch { /* gone */ } }
  if (n) app.log.info({ jobId: id, files: n }, 'removed uploads of a rejected submit'); return n;
}
const safeCreateJob = async (toolId: string, req: FastifyRequest, reply: FastifyReply) => {
  try { return await createJob(toolId, req, reply); } catch (e: any) {
    req.log.error({ err: e }, 'createJob failed');
    if (reply.sent) return reply;
    const code = Number(e?.statusCode) >= 400 && Number(e?.statusCode) < 500 ? Number(e.statusCode) : 500;
    return reply.code(code).send({ error: code === 500 ? 'Something went wrong creating this job. Nothing was charged.' : String(e?.message || 'Bad request'), errorType: code === 500 ? 'server' : 'validation', refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } });
  } finally { dropRequestUploads(req); }
};
app.post<{ Params: { toolId: string } }>('/api/tools/:toolId/jobs', (req, reply) => safeCreateJob(req.params.toolId, req, reply));
// Back-compat: original contract → default tool.
app.post('/api/jobs', (req, reply) => safeCreateJob(DEFAULT_TOOL_ID, req, reply));

/** History for one tool (alias of GET /api/jobs?toolId=<id>, same query: state, status, limit, since). Unknown tool → 404. */
app.get<{ Params: { toolId: string }; Querystring: Record<string, string> }>('/api/tools/:toolId/jobs', async (req, reply) => {
  if (!getTool(req.params.toolId)) return reply.code(404).send({ error: `unknown tool ${req.params.toolId}`, errorType: 'validation' });
  const { tool: _t, ...rest } = req.query; const qs = new URLSearchParams({ ...rest, toolId: req.params.toolId });
  const r = await app.inject({ method: 'GET', url: `/api/jobs?${qs}` }); return reply.code(r.statusCode).send(r.json());
});
(await import('./routesSpecs.js')).registerSpecs(app); // Oct 17 page refreshes 16/17/19/28 + looks + effects
(await import('./routesPages.js')).registerPages(app); // pages 16-18: /api/assets/counts, /api/jobs/:id/locate, /api/projects/public, POST /api/projects/:id/visibility
(await import('./routesHardware.js')).registerHardware(app); (await import('./routing/prefs.js')).applyEnvPrefsAtStartup(); (await import('./hardware.js')).warmHardware(); // HW-SHAPES: /api/hardware, /api/local/comfy, /api/local/downloads, /api/eta/learned
(await import('./routesComfyDeploy.js')).registerComfyDeploy(app); // H3 runner Step 1: GET /api/comfy-deploy, /api/comfy-deploy/probe, POST /api/comfy-deploy/smoke
(await import('./routesGaps.js')).registerGaps(app); // report, publish, self-host health, endpoints table, hand-off, usage series, profile, route-prompt, model page, webhooks
registerBackup(app); // BH4 #8: GET /api/export, POST /api/import
(await import('./userStyles.js')).registerUserStyles(app); (await import('./brandKits.js')).registerBrandKits(app); // Brand Kit (2026-10-27): /api/brand-kits CRUD + exports, kv in the DB → in export/import // DP ask #5: saved user styles (Create Image 'Saved' tab), kv in the DB → in export/import
registerEdge(app, pub); // GET /api/jobs (+ state=active), /api/queue, download.zip, trash purge
app.get<{ Params: { id: string } }>('/api/jobs/:id/layers-poster.png', async (req, reply) => { // Image to layers: the composite poster, made on first view for older jobs
  const j = jobs.get(req.params.id); if (!j || !layersPosterUrl(j)) return reply.code(404).send({ error: 'No finished layered result with that id.', errorType: 'not_found' });
  const url = layersPosterUrl(j)!.startsWith('/files/') ? layersPosterUrl(j)! : await writeLayerPoster(j); if (!url) return reply.code(404).send({ error: 'The layers could not be combined.', errorType: 'not_found' });
  return reply.header('cache-control', 'no-store').redirect(url);
});
(await import('./canvasAgent.js')).registerCanvasAgent(app); // Canvas agent bridge (2026-10-24): live ops, SSE, proposals (before canvasBoards so its MCP-presence hook sees them too)
(await import('./canvasBoards.js')).registerCanvasBoards(app); // Canvas page (2026-10-24): /api/canvas/boards CRUD + snapshot save
(await import('./filmProjects.js')).registerFilms(app); // Film tab (2026-10-27): /api/films CRUD + ops (rev), shot quote / render / continue-frame, bridge, stitch, preview
(await import('./routesMakeItReal.js')).registerMakeItReal(app); // Render (Direct a Shot step 3): GET /api/make-it-real/prep
(await import('./routesLtxLoras.js')).registerLtxLoras(app); // LTX-2.5 LoRAs (shared/ltxLoras.ts): GET /api/ltx-loras with each file's state
(await import('./routes3d.js')).registerThreeD(app); // 3D page (2026-10-23): /api/3d-workflows, /api/3d/meta, POST /api/jobs/:id/3d-poster
(await import('./routes3dRig.js')).registerRig(app); // Rig as a character (2026-10-27): POST /api/3d/rig keeps a character rigged in the browser as a 3D result ($0)
(await import('./routesFeed.js')).registerFeed(app, pub); // Create Image toolbar: POST /api/jobs/bulk (Select mode), POST /api/compare/quote (Compare models)

app.get('/api/ledger', async () => { const l = ledger(); return { ...l, entries: l.entries.map(enrichEntry) }; });
app.get('/api/roadmap', async () => listSoon());
/** Recreate-from-example setups; preset/types are checked against the live registry. */
app.get<{ Querystring: { toolId?: string } }>('/api/examples', async (req) => (await Promise.all(EXAMPLES.filter((e) => !req.query.toolId || e.toolId === req.query.toolId).map(async (e) => {
  const t = getTool(e.toolId); if (!t) return null;
  const ids = new Set((t.presets ?? []).map((p) => p.id));
  const preset = e.preset && ids.has(e.preset) ? e.preset : (e.preset ? t.presets?.[0]?.id : undefined);
  const types = e.types?.filter((x) => ids.has(x));
  const prefill = await examplePrefill(e);
  return { ...e, preset, types: e.types ? (types?.length ? types : [t.presets?.[0]?.id].filter(Boolean)) : undefined, route: `${t.route}?example=${e.id}`, toolName: t.name, previewUrl: e.previewUrl ?? null, prefill, price: prefill?.price ?? null };
}))).filter(Boolean));
registerBatch1(app);
(await import('./libraryDb.js')).registerLibrary(app, { tools: async () => { try { return toolsList(); } catch { return []; } } }); // workflows + references databases: /api/library/* (search, tags)
{ const R = await import('./routing/http.js'); R.registerRouting(app); setToolsBuilder(() => stripLicenseLinks(R.enrichTools(toolsPayload())), () => stripLicenseLinks(listTools().map((t) => ({ id: t.id, name: t.name, presets: visiblePresets(t) })))); } // multi-provider routing: settings, /api/me/routing, /api/routes, fallback
(await import('./billing.js')).registerBilling(app); (await import('./agentBudget.js')).registerAgentBudgets(app); // agent budgets (after billing's cost hook): /api/agent/budgets, receipts, POST /api/compose // real costs: /api/settings/billing, /api/spend, /api/spend/summary, /api/accounts; cost on every quote (after the routing hook)
registerDiscover(app);
(await import('./routesHub.js')).registerHub(app);
(await import('./cinema/routes.js')).registerCinema(app); // /api/cinema/* kept for compatibility (Director has no page since 2026-10-23); also /api/apps, /api/voices, /api/prompt/enhance
(await import('./cinema/story.js')).registerStory(app); // Director → Story: H3 multi-shot chained by last frame, stitched (cinema/story.ts)
(await import('./routesEdit.js')).registerEdit(app);
(await import('./routesEditVideo.js')).registerEditVideo(app); // Edit Video menu + routes/prices
(await import('./routesOverlay.js')).registerOverlay(app); // result overlay: B1/B2 elements from outputs, B4 neighbours, B5 output metadata, Community seed
(await import('./routesMaskPreview.js')).registerMaskPreview(app); // Object Swap mask preview (free; mock ellipse, local SAM 3.1 when ComfyUI has SAM3_Detect)
(await import('./routesFrame.js')).registerFrame(app); // POST /api/media/frame: a video's first / last / any frame as a library image (videoFrame.ts)
(await import('./routesPrefill.js')).registerPrefill(app); // B3 GET /api/jobs/:id/prefill + B7 job owner/isOwner

// ---- Library: favourites, projects, trash, elements ----
const need = (j: Job | undefined, reply: FastifyReply) => (j ? j : (reply.code(404).send({ error: 'not found' }), null));
/** Feature this (2026-10-26): star one of your results so it shows on an empty tab and under the feed's Featured chip. {on} (default: toggle). */
app.post<{ Params: { id: string }; Body: { on?: boolean } }>('/api/jobs/:id/feature', async (req, reply) => { const j = need(jobs.get(req.params.id), reply); if (!j) return;
  if (j.status !== 'done' || !(j.outputs?.length || j.resultUrl)) return reply.code(400).send({ error: 'Only a finished result can be featured.', errorType: 'validation' });
  if ((j as any).seed) return reply.code(400).send({ error: 'Only your own results can be featured.', errorType: 'validation' });
  lib.setFeatured(j.id, req.body?.on ?? !lib.isFeatured(j.id)); return pub(j); });
app.post<{ Params: { id: string }; Body: { on?: boolean } }>('/api/jobs/:id/favourite', async (req, reply) => { const j = need(jobs.get(req.params.id), reply); if (!j) return; lib.setFavourite(j.id, req.body?.on ?? !lib.metaOf(j.id).favourite); return pub(j); });
/** Audio results: the dance style heard in the browser and/or picked from the chip, kept on the job meta (danceStyle.ts). Returns {danceStyle}. */
app.post<{ Params: { id: string }; Body: any }>('/api/jobs/:id/dance-style', async (req, reply) => { const j = need(jobs.get(req.params.id), reply); if (!j) return;
  const next = mergeDanceStyle(lib.metaOf(j.id).danceStyle, req.body); if (typeof next === 'string') return reply.code(400).send({ error: next, errorType: 'validation' });
  return { danceStyle: lib.setDanceStyle(j.id, next).danceStyle }; });
app.post<{ Params: { id: string }; Body: { projectId?: string | null } }>('/api/jobs/:id/project', async (req, reply) => {
  const j = need(jobs.get(req.params.id), reply); if (!j) return;
  const pid = req.body?.projectId ?? null; if (pid && !lib.getProject(pid)) return reply.code(404).send({ error: 'project not found' });
  lib.setProject(j.id, pid); return pub(j);
});
app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => { const j = need(jobs.get(req.params.id), reply); if (!j) return; lib.trash(j.id); return pub(j); });
app.post<{ Params: { id: string } }>('/api/jobs/:id/restore', async (req, reply) => { const j = need(jobs.get(req.params.id), reply); if (!j) return; lib.restore(j.id); return pub(j); });
// count = live (not trashed) items; coverUrl = the newest finished image (the Project picker's cover; null → the initial tile)
app.get('/api/projects', async () => { const n = new Map<string, number>(); const cover = new Map<string, { at: number; url: string }>(); const IMG = /\.(png|jpe?g|webp|gif)(\?|$)/i;
  for (const j of jobs.values()) { const m = lib.metaOf(j.id); if (!m.projectId || m.deletedAt) continue; n.set(m.projectId, (n.get(m.projectId) ?? 0) + 1);
    if (j.status !== 'done') continue; const url = j.outputs?.find((o) => IMG.test(o.url))?.url; const c = cover.get(m.projectId); if (url && (!c || j.createdAt > c.at)) cover.set(m.projectId, { at: j.createdAt, url }); }
  return lib.listProjects().map((p) => ({ ...p, parentId: p.parentId ?? null, count: n.get(p.id) ?? 0, coverUrl: cover.get(p.id)?.url ?? null })); });
app.post<{ Body: { name?: string; parentId?: string | null } }>('/api/projects', async (req, reply) => { const p = lib.createProject(req.body?.name ?? ''); if (req.body?.parentId) { const m = lib.moveProject(p.id, req.body.parentId); if ('error' in m) { lib.deleteProject(p.id); return reply.code(400).send({ error: m.error, errorType: 'validation', issues: [{ code: 'invalid', field: 'parentId', message: m.error }] }); } return m; } return { ...p, parentId: null }; });
app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => { if (!lib.getProject(req.params.id)) return reply.code(404).send({ error: 'project not found', errorType: 'validation' }); lib.deleteProject(req.params.id); return { ok: true, id: req.params.id }; }); // its items move to "no project", nothing is deleted
app.patch<{ Params: { id: string }; Body: { name?: unknown; parentId?: unknown } }>('/api/projects/:id', async (req, reply) => {
  if (!lib.getProject(req.params.id)) return reply.code(404).send({ error: 'project not found', errorType: 'validation' });
  if (req.body && 'parentId' in req.body) { const pid = req.body.parentId; if (pid !== null && typeof pid !== 'string') return reply.code(400).send({ error: 'parentId must be a project id or null', errorType: 'validation', issues: [{ code: 'invalid', field: 'parentId', message: 'parentId must be a project id or null.' }] });
    const m = lib.moveProject(req.params.id, pid as string | null); if ('error' in m) return reply.code(400).send({ error: m.error, errorType: 'validation', issues: [{ code: 'invalid', field: 'parentId', message: m.error }] });
    if (req.body.name === undefined) return m; }
  const name = req.body?.name; if (typeof name !== 'string' || !name.trim()) return reply.code(400).send({ error: 'name is required', errorType: 'validation', issues: [{ code: 'required', field: 'name', message: 'Give the project a name (1–80 characters).' }] });
  if (name.trim().length > 80) return reply.code(400).send({ error: 'name is too long', errorType: 'validation', issues: [{ code: 'too_long', field: 'name', message: 'At most 80 characters.' }] });
  return lib.renameProject(req.params.id, name);
});
app.get('/api/elements', async () => lib.listElements().map(lib.pubElement));
/** Preview for the prompt box: which saved Elements a prompt attaches, and which @names are unknown. */
app.get<{ Querystring: { prompt?: string } }>('/api/elements/resolve', async (req) => { const r = resolveElements(String(req.query.prompt ?? ''), lib.listElements()); return { attached: r.attached, mentions: r.mentions, unknown: r.unknown, ok: !r.unknown.length }; });
/** Save a reusable reference: multipart `image` + `name` + `kind`; or `fromJob` + `ref` (index into that job's input refs); or (B1)
 *  `fromJob` + `output=<i>` (that output of the result) + `t=<sec>` (a frame of a video output). Multipart fields or JSON. */
app.post('/api/elements', async (req, reply) => {
  const fields: Record<string, string> = {}; let url = ''; let from: import('./routesOverlay.js').FromOutput | null = null;
  if (req.isMultipart()) {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const ext = path.extname(part.filename || '') || '.png';
        if (!/\.(png|jpe?g|webp)$/i.test(ext)) { part.file.resume(); return reply.code(400).send({ error: 'Elements must be PNG, JPG or WEBP.', errorType: 'validation' }); }
        const name = `el-${randomUUID().slice(0, 8)}${ext}`; await pipeline(part.file, createWriteStream(path.join(DATA_DIR, name))); url = `/files/${name}`;
      } else fields[part.fieldname] = String(part.value);
    }
  } else for (const [k, v] of Object.entries((req.body as Record<string, unknown>) ?? {})) if (v != null) fields[k] = String(v);
  if (!url && fields.fromJob && (fields.output != null || fields.t != null)) {
    const r = await (await import('./routesOverlay.js')).imageFromOutput(fields.fromJob, fields.output, fields.t); if ('status' in r) return reply.code(r.status).send(r.body); from = r; url = r.url;
  }
  if (!url && fields.fromJob) { const j = jobs.get(fields.fromJob); url = j?.input.refUrls?.[Number(fields.ref || 0)] ?? j?.input.imageUrl ?? ''; }
  if (!url) return reply.code(400).send({ error: 'An image (or fromJob + ref, or fromJob + output) is required.', errorType: 'validation' });
  const kind = (lib.ELEMENT_KINDS as readonly string[]).includes(fields.kind) ? (fields.kind as lib.Element['kind']) : 'other';
  // aiGenerated: a frame/still from a generated result (unless that job is sample media); an upload or a job's input reference is not
  const el = lib.pubElement(lib.addElement({ name: (fields.name || 'Untitled element').slice(0, 60), kind, url, fromJobId: fields.fromJob || null, images: [url], sources: [from?.source ?? null], aiGenerated: !!from && lib.metaOf(fields.fromJob).aiGenerated !== false }));
  return from ? { ...el, frame: from.frame, ...(from.note ? { note: from.note } : {}) } : el;
});
/** DP #22: deleting an element also removes the image files it owns (the el-* copies made by Save as element / Add image), only when nothing
 *  else (a job, another element, a project, an upload) still references them. A job's own output or an upload it pointed at stays. */
app.delete<{ Params: { id: string } }>('/api/elements/:id', async (req) => {
  const el = lib.getElement(req.params.id); const G = await import('./mediaGc.js');
  const owned = el ? [...G.fileRefs(el)].filter((f) => /^el-[\w-]+\.(png|jpe?g|webp)$/i.test(f)) : [];
  const ok = lib.deleteElement(req.params.id); const r = ok && owned.length ? G.removeUnreferenced(owned, G.liveRefs()) : { files: 0, bytes: 0, kept: 0 };
  return { ok, removedFiles: r.files, keptFiles: r.kept };
});

/** Assets = finished jobs with outputs, shared across tools (CLEANROOM platform-navigation: Assets library). */
/** section: all (default) | favourites | trash | unfiled | project:<id>. Trash = soft-deleted (restorable). */
/** include=ended also lists canceled/failed/blocked jobs; every non-done item carries state + refund {refunded, amount}. */
const ENDED = new Set(['canceled', 'failed', 'blocked']);
app.get<{ Querystring: { toolId?: string; limit?: string; section?: string; include?: string; job?: string; focus?: string } }>('/api/assets', async (req, reply) => {
  const sec = req.query.section || 'all';
  if (sec === 'trash') reply.header('x-trash-days', String(TRASH_DAYS)); // trashed items are purged after this many days (0 = never)
  const ended = req.query.include === 'ended';
  /** ?job=<id>: focus=filter (default) → only that job and its direct children (retries, finals, upscales); focus=highlight → the normal list with `highlighted: true` on it
   *  (always included even past ?limit). Unknown or trashed id → 404. X-Focus-Index header = its position in the returned list. */
  if (req.query.job) { const fj = jobs.get(req.query.job); if (!fj || (lib.metaOf(fj.id).deletedAt && sec !== 'trash')) return reply.code(404).send({ error: `job ${req.query.job} not found`, errorType: 'not_found' });
    const shape = (j: Job) => ({ ...(j.status === 'done' ? pub(j) : { ...pub(j), state: j.status, refund: refundOf(j.id) }), highlighted: j.id === fj.id });
    if (req.query.focus !== 'highlight') { const xs = [fj, ...[...jobs.values()].filter((x) => x.parentId === fj.id && !lib.metaOf(x.id).deletedAt).sort((a, b) => b.createdAt - a.createdAt)]; reply.header('x-focus-index', '0'); return xs.map(shape); }
    const lim = Number(req.query.limit) || 100; const all = history(req.query.toolId).filter((j) => { const m = lib.metaOf(j.id); return sec === 'trash' ? !!m.deletedAt : !m.deletedAt && ((j.status === 'done' && j.outputs.length) || (ended && ENDED.has(j.status))); });
    let page = all.slice(0, lim); if (!page.some((j) => j.id === fj.id)) page = [...page, fj]; reply.header('x-focus-index', String(page.findIndex((j) => j.id === fj.id))); return page.map(shape); }
  return history(req.query.toolId).filter((j) => {
    const m = lib.metaOf(j.id);
    if (sec === 'trash') return !!m.deletedAt;
    if (m.deletedAt) return false;
    if (!(j.status === 'done' && j.outputs.length) && !(ended && ENDED.has(j.status))) return false;
    if (sec === 'favourites') return m.favourite;
    if (sec === 'unfiled') return !m.projectId;
    if (sec.startsWith('project:')) return m.projectId === sec.slice(8);
    return true;
  }).slice(0, Number(req.query.limit) || 100).map((j) => (j.status === 'done' ? pub(j) : { ...pub(j), state: j.status, refund: refundOf(j.id) }));
});

app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
  const j = jobs.get(req.params.id);
  if (j && (j.status === 'queued' || j.status === 'running')) reply.header('Retry-After', j.status === 'queued' ? '5' : '2'); // [R21] polling hint
  // spend (one job only, it reads the spend log): {billedTo, billedToName, estUsd, estUnits?, unitLabel?, estimated, actualUsd, actualSource, countedUsd, simulated, demo} | null
  return j ? { ...pub(j), spend: jobSpendView(j.id) } : reply.code(404).send({ error: 'not found' });
});

/** Live preview (TRANSPARENCY-PLAN 4i): the latest sampler preview frame of a running job on a native ComfyUI (JPEG / PNG, no-store). 404 when there is none:
 *  hosted and sample runs, before the first frame, after the job ends (frames are dropped then), or with previews off (OPENHIGGSFIELD_COMFY_PREVIEW_METHOD=none). */
app.get<{ Params: { id: string } }>('/api/jobs/:id/preview', async (req, reply) => {
  const j = jobs.get(req.params.id); const f = j && !lib.metaOf(j.id).deletedAt ? getPreview(j.id) : null;
  if (!f) return reply.code(404).header('cache-control', 'no-store').send({ error: 'No live preview for this job.', errorType: 'not_found', code: 'no_preview' });
  return reply.header('cache-control', 'no-store').header('x-preview-at', String(f.at)).type(f.mime).send(f.data);
});
/** Queue activity pill (TRANSPARENCY-PLAN 4i, D1): running and waiting jobs, compact, for one poll every 1–2 s. Only active jobs are built (one pass over the
 *  job map, one spend-row read per active job). items: running first (oldest start first), then waiting in queue order. */
app.get('/api/queue/activity', async () => {
  const act = [...jobs.values()].filter((j) => (j.status === 'running' || j.status === 'queued') && !(j as any).seed && !lib.metaOf(j.id).deletedAt)
    .sort((a, b) => (a.status === b.status ? (a.status === 'running' ? (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt) : (a.queuePos || 1e9) - (b.queuePos || 1e9) || a.createdAt - b.createdAt) : a.status === 'running' ? -1 : 1));
  const items = act.map((j) => {
    const prompt = String(j.input?.prompt ?? '').replace(/\s+/g, ' ').trim(); const sp = jobSpendView(j.id); const place = placeOfJob(j); const free = sp ? sp.billedTo === 'local' : place.runOn === 'local';
    return { id: j.id, toolId: j.toolId, state: j.status === 'running' ? 'running' : 'waiting', title: prompt ? (prompt.length > 60 ? `${prompt.slice(0, 59).trimEnd()}…` : prompt) : getTool(j.toolId)?.name ?? j.toolId,
      model: engineNameOf(j) || null, place, price: { free, usd: free ? 0 : sp?.estUsd ?? null, credits: j.cost ?? 0, estimated: !free, sample: sampleTruth(j).isSample },
      progress: progressOf(j), cancellable: canCancel(j), queuePosition: j.status === 'queued' && j.queuePos > 0 ? j.queuePos : null, lane: j.runLane ?? null, queueReason: j.queueReason ?? null, createdAt: j.createdAt, startedAt: j.startedAt ?? null };
  });
  const running = items.filter((x) => x.state === 'running').length;
  const Q = await import('./queue.js'); const L = Q.laneSizes();
  return { running, waiting: items.length - running, concurrency: Q.CONCURRENCY, lanes: { local: L.local, cloud: L.cloud }, maxQueued: (await import('./edge.js')).MAX_QUEUED, items, at: Date.now() };
});

/** DP ask #2: the 'already processing' 409 mentions credits back only when the job was actually charged (cost > 0); a free run gets its
 *  free run back; free / local / demo jobs get plain wording. */
const processingCancelText = (j: { cost?: number; input?: Record<string, any> }) => {
  const base = 'This job is already processing and can no longer be canceled. It will finish on its own';
  return (j.cost ?? 0) > 0 && teamModeNow() ? `${base}; if it fails, its credits go back to your balance.` : j.input?.free ? `${base}; if it fails, the free gen comes back.` : `${base}.`;
};
app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (req, reply) => {
  const j = jobs.get(req.params.id);
  if (!j) return reply.code(404).send({ error: 'not found' });
  if (j.toolId === 'app-photos-to-reel') { const ok = await (await import('./photosToReel.js')).cancelReel(app, j); return ok ? pub(j) : reply.code(409).send({ error: 'This reel has already finished.' }); }
  const { cancelRun, CANCEL_IN_PROCESSING } = await import('./queue.js');
  const r = await cancelRun(j); // local ComfyUI: cancellable at every stage (our queue, ComfyUI's queue, running); hosted: only before dispatch
  if (r.result === 'done') return reply.code(409).send({ error: 'It finished before it could be canceled, so the result is kept.', errorType: 'not_cancellable', code: 'already_done', jobId: j.id, status: j.status, state: stateOf(j), progress: j.progress });
  if (r.result === 'refused') return reply.code(409).send({ error: j.status === 'running' && (j.input.refBatches?.length ?? 0) <= 1 ? processingCancelText(j) : 'Already generating; it can no longer be canceled.', errorType: 'not_cancellable', code: 'cannot_cancel_processing', cancelInProcessing: CANCEL_IN_PROCESSING, charged: (j.cost ?? 0) > 0, jobId: j.id, status: j.status, state: stateOf(j), progress: j.progress }); // error body, not the job (GAP-MATRIX)
  return { ...pub(j), ...(r.comfy ? { comfyCancel: r.comfy } : {}) };
});

// ---- Retry ----
/** Retry: a new job with the same inputs, quoted and charged again (failed or provider-blocked jobs; the original stays refunded once). ?failedOnly=1 re-runs only failed ref groups.
 *  S-01: every re-run (Try again, Try on <place>, failed groups) goes through the submit's guard: quote → spending cap (400 spend_limit) → agent budget → Spend row.
 *  S-02: Try on (runOn) pins THIS job only; remember:true (body or query) also saves that place as the tool + model's choice (Settings › Routing). */
app.post<{ Params: { id: string }; Querystring: { failedOnly?: string; runOn?: string; remember?: string } }>('/api/jobs/:id/retry', async (req, reply) => {
  const j = jobs.get(req.params.id); if (!j) return reply.code(404).send({ error: 'not found' });
  if (j.toolId === 'app-photos-to-reel') {
    const partialRetry = j.status === 'done' && /^(1|true)$/.test(req.query.failedOnly ?? '') && !!j.partial && (j.input.failedPhotos?.length ?? 0) > 0;
    if (j.status !== 'failed' && j.status !== 'blocked' && !partialRetry) return reply.code(409).send({ error: 'Only failed reels or failed photos can be retried.' });
    const previous = [...jobs.values()].find(x => x.parentId === j.id && x.input.retryOf === j.id && !['failed','blocked','canceled'].includes(x.status));
    if (previous) return { id: previous.id, toolId: previous.toolId, idempotentReplay: true };
    const id = randomUUID().slice(0, 8);
    return (await import('./photosToReel.js')).startReel(app, req, reply, id, { ...j.input.fields, simulateGroup: '0', quotedCredits: '', fromJob: j.id, reuseInputs: 'photos' }, {}, j);
  }
  // Run on (2026-10-22): "Try on <place>": runOn (body or query) re-runs the job there, pinned to that place (no fallback). Without it, the same route as before.
  const retryRunOn = String((req.body as any)?.runOn ?? (req.body as any)?.run_on ?? req.query.runOn ?? '').trim();
  if (retryRunOn) { const { normRunOn } = await import('./shared/modelIds.js'); if (!normRunOn(retryRunOn)) return reply.code(400).send({ error: 'runOn must be a place id (local, comfy-cloud, fal, replicate, bfl…). Nothing was charged.', errorType: 'validation', code: 'invalid_run_on', issues: [{ code: 'invalid_run_on', field: 'runOn', message: 'unknown place' }], charged: false }); }
  const remember = /^(1|true|on|yes)$/i.test(String((req.body as any)?.remember ?? req.query.remember ?? ''));
  /** Shared tail of both retries: the same route as before (or the Try on place) → spend guard → credits → agent budget → enqueue → routing + model fields → Spend row. */
  const rerunJob = async (tool: NonNullable<ReturnType<typeof getTool>>, inp: Record<string, any>, free: boolean, kind: NonNullable<Job['rerun']>) => {
    const extra = passesFor(inp); const prov = getProvider(j.provider);
    const est = estimateSeconds(tool, inp, extra, j.provider); let cost = free || isLocalFree(prov?.kind) ? 0 : est;
    const routed = !free && retryRunOn ? (await import('./routing/select.js')).resolveRoute(tool, j.provider, inp, extra, { runOn: retryRunOn, allowRoutes: j.routing?.allowRoutes ?? null, modelKey: j.routing?.modelKey ?? null })
      : !free && j.route ? (await import('./routing/select.js')).resolveRoute(tool, j.provider, inp, extra, { route: j.route, allowFallback: j.routing?.allowFallback }) : null;
    if (routed && 'error' in routed) { const { status: rs, ...rb } = routed; return { sent: reply.code(rs).send({ ...rb, charged: false, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }) }; }
    if (routed) cost = routed.routing.prices[routed.first.routeId] ?? 0;
    const sg = await spendGuard(reply, { kind: routed ? routed.first.kind : isLocalFree(prov?.kind) ? 'local' : 'direct', routeId: routed?.first.routeId ?? null, credits: cost, demo: !!routed?.routing.demo, free });
    if ('sent' in sg) return { sent: sg.sent };
    if (!free && !canAfford(cost)) return { sent: reply.code(402).send({ error: `Not enough credits: needs ${cost}, balance ${getBalance()}.`, errorType: 'credits', code: 'credits', needed: cost, balance: getBalance(), refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }) };
    const id = randomUUID().slice(0, 8);
    const ag = (await import('./agentBudget.js')).admitAgentRun(req, reply, { jobId: id, toolId: tool.id, model: j.modelKey ?? j.provider, estUsd: free ? 0 : sg.runCost.estUsd, credits: free || sg.runCost.demo ? 0 : cost });
    if (!('agent' in ag)) return { sent: ag };
    const nj = enqueue(tool.id, inp, est, id, j.id, j.provider, cost, free); nj.rerun = kind;
    if (ag.agent) nj.agent = ag.agent;
    { const cid = String(req.headers['x-client-id'] ?? '').replace(/[^\w.-]/g, '').slice(0, 64); nj.originClientId = cid || null; }
    if (routed) { nj.routing = routed.routing; nj.route = routed.first.routeId; nj.routeAttempts = []; }
    { const MF = (await import('./routing/modelRegistry.js')).jobModelFields({ toolId: tool.id, provider: nj.provider, route: nj.route ?? null, input: inp, modelKey: routed?.routing.modelKey ?? j.modelKey ?? undefined, runOn: routed?.routing.runOn ?? undefined }); nj.modelKey = MF.modelKey ?? undefined; nj.runOn = MF.runOn ?? null; }
    sg.spendRow(nj); // spend log: the estimate now, settled when the job ends (same as a submit)
    return { nj, routed, cost, estimate: free ? null : sg.runCost };
  };
  if (/^(1|true)$/i.test(req.query.failedOnly || '')) { // re-run only the failed groups as a child job
    const failed = j.failedGroups ?? []; const batches: string[][] = j.input.refBatches ?? [];
    if (!failed.length || batches.length < 2) return reply.code(409).send({ error: 'This job has no failed groups to retry.', errorType: 'validation' });
    const tool = getTool(j.toolId); if (!tool) return reply.code(404).send({ error: 'tool gone' });
    { const no = admit(reply); if (no) return no; }
    const inp: Record<string, any> = { ...j.input, refBatches: failed.map((k) => batches[k - 1]), refGroupLabels: failed.map((k) => j.input.refGroupLabels?.[k - 1] ?? `Group ${k}`), ...(j.input.batchSeeds ? { batchSeeds: failed.map((k) => j.input.batchSeeds[k - 1]) } : {}), simulate: '', simulateGroup: 0, warnings: [], free: false, retryGroups: failed };
    if (failed.length === 1) { inp.refPaths = batches[failed[0] - 1]; inp.imagePath = inp.refPaths[0] ?? ''; } // single group runs directly
    const r = await rerunJob(tool, inp, false, 'failed-groups'); if ('sent' in r) return r.sent;
    return { id: r.nj.id, toolId: r.nj.toolId, provider: r.nj.provider, cost: r.cost, estimate: r.estimate, retryOf: j.id, rerun: r.nj.rerun, groups: failed, seed: inp.seed, balance: getBalance() };
  }
  { // Plain retry (FLOWS 'Retry after failure'; DEMO-QA 33/34): failed OR provider-blocked (nsfw/ip) → same inputs, new job, own quote + charge, usual refund rules.
    if (j.status !== 'failed' && j.status !== 'blocked') return reply.code(409).send({ error: `Only failed or blocked jobs can be retried (this one is ${stateOf(j)}).`, errorType: 'validation', code: 'not_failed', state: stateOf(j), status: j.status });
    const prev = [...jobs.values()].find((x) => x.parentId === j.id && x.input?.retryOf === j.id && x.status !== 'failed' && x.status !== 'blocked' && x.status !== 'canceled');
    if (prev) return { id: prev.id, toolId: prev.toolId, provider: prev.provider, cost: prev.cost, free: !!prev.input.free, retryOf: j.id, rerun: prev.rerun ?? 'retry', idempotentReplay: true, seed: prev.input.seed, balance: getBalance() }; // double-click: one retry per failure
    const tool = getTool(j.toolId); if (!tool) return reply.code(404).send({ error: 'tool gone' });
    { const no = admit(reply); if (no) return no; }
    const inp: Record<string, any> = { ...j.input, simulate: '', simulateGroup: 0, warnings: [], retryOf: j.id };
    const free = !!inp.free && freeGensLeft() > 0; if (!free) inp.free = false;
    const r = await rerunJob(tool, inp, free, retryRunOn ? 'try-on' : 'retry'); if ('sent' in r) return r.sent;
    const { nj, routed, cost } = r;
    // S-02: Try on runs once on that place (pinned on this job only). Only remember:true saves it as the choice for this tool + model, through the
    // same PUT /api/me/routing the Settings page uses (its validation and the routing write log).
    let remembered = false;
    const keepOn = retryRunOn ? (await import('./shared/modelIds.js')).normRunOn(retryRunOn) : null;
    if (remember && keepOn && keepOn !== 'auto' && nj.modelKey) { const { getPrefs } = await import('./routing/prefs.js'); const pt = structuredClone(getPrefs().perTool ?? {}); (pt[tool.id] ??= {})[nj.modelKey] = { runOn: keepOn };
      const w = await app.inject({ method: 'PUT', url: '/api/me/routing', payload: { perTool: pt }, headers: { 'content-type': 'application/json', 'x-openhiggsfield-source': 'try-on remember' } }); remembered = w.statusCode === 200; }
    const mf2 = (await import('./routing/modelRegistry.js')).jobModelFields(nj as any);
    return { id: nj.id, toolId: nj.toolId, provider: nj.provider, ...(routed ? { route: routed.first.routeId, routing: { mode: routed.routing.mode, allowFallback: routed.routing.allowFallback, order: routed.routing.order } } : {}), modelKey: mf2.modelKey, runOn: mf2.runOn, runOnLabel: mf2.runOnLabel, cost, estimate: r.estimate, free, retryOf: j.id, parentId: j.id, rerun: nj.rerun, remembered, seed: inp.seed, balance: getBalance(), warnings: nj.warnings };
  }
});
/** [R41] Copyable support details. */
app.get<{ Params: { id: string } }>('/api/jobs/:id/support', async (req, reply) => {
  const j = jobs.get(req.params.id); if (!j) return reply.code(404).send({ error: 'not found' });
  const d = { id: j.id, toolId: j.toolId, provider: j.provider, backend: config.backend, createdAt: new Date(j.createdAt).toISOString(), finishedAt: j.finishedAt ? new Date(j.finishedAt).toISOString() : null,
    state: stateOf(j), errorType: j.errorType ?? null, error: j.error, seed: j.input.seed ?? null, requestIds: j.requestIds ?? (config.backend === 'mock' ? [`mock-${j.id}`] : []) };
  return { ...d, text: Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') || '-' : v ?? '-'}`).join('\n') };
});
/** [R29] Usage: ledger entries with tool name + model, plus totals per tool. */
function enrichEntry(e: any) { return enrich(e); }
/** Routing records later attempts under `${jobId}#aN`: group them with their job (jobId = base, attempt = N, ledgerKey = raw). */
const splitAttempt = (e: any) => { const m = typeof e.jobId === 'string' ? /^(.*)#a(\d+)$/.exec(e.jobId) : null; return m ? { ...e, jobId: m[1], attempt: Number(m[2]), ledgerKey: e.jobId } : e; };
const enrich = (e0: any) => { const e = splitAttempt(e0); const t = e.toolId ? getTool(e.toolId) : undefined; const j = e.jobId ? jobs.get(e.jobId) : undefined;
  const prov = j ? getProvider(j.provider) : undefined;
  return { ...e, toolName: t?.name ?? null, model: prov && prov.id !== 'comfy-open' ? prov.name : t?.model ?? null }; };
/** Usage + credit history. Query: kind=charge|refund|grant|expire (comma list), toolId, limit (≤200, default 50), offset | cursor (entry id; returns older).
 * hidden=true (entries []) only when localFree (no cloud/API provider enabled) and there is no paid history. */
app.get<{ Querystring: { limit?: string; offset?: string; cursor?: string; kind?: string; toolId?: string } }>('/api/usage', async (req) => {
  const l = ledger(); const all = l.entries.map(enrich).filter((e: any) => e.amount !== 0); // zero-cost open-weights rows hidden
  const byTool: Record<string, { toolName: string | null; charged: number; refunded: number; runs: number }> = {};
  for (const e of all) { if (!e.toolId) continue; const b = (byTool[e.toolId] ??= { toolName: e.toolName, charged: 0, refunded: 0, runs: 0 });
    if (e.kind === 'charge') { b.charged += -e.amount; if (!e.attempt) b.runs++; } else if (e.kind === 'refund') b.refunded += e.amount; }
  const totals = usageTotals(); // granted − charged + refunded − expired = balance by construction; `reconciles`, `discrepancies`, bucket check
  const kinds = req.query.kind ? new Set(req.query.kind.split(',')) : null;
  let rows = all.filter((e) => (!kinds || kinds.has(e.kind)) && (!req.query.toolId || e.toolId === req.query.toolId));
  const cursor = Number(req.query.cursor); if (cursor > 0) rows = rows.filter((e) => e.id < cursor);
  const total = rows.length; const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50)); const offset = cursor > 0 ? 0 : Math.max(0, Number(req.query.offset) || 0);
  const page = rows.slice(offset, offset + limit).map((e) => ({ ...e, jobStatus: e.jobId ? jobs.get(e.jobId)?.status ?? null : null }));
  const more = offset + limit < total;
  // BH9 (e): localFree only when every enabled route is local (no cloud/API key configured). With Comfy Cloud (or any key) on, the balance
  // is always reported (hidden:false) so Usage shows the Balance block. cloudBalance = the Comfy Cloud account's own balance: not fetched (no
  // documented cheap endpoint on API v2), so null + a note.
  const cloudEnabled = cloudProvidersEnabled(); const localFree = cloudEnabled.length === 0;
  const cloud = { cloudEnabled, balanceSource: 'credits ledger (1 credit = $0.01)', cloudBalance: null, cloudBalanceNote: cloudEnabled.includes('comfy') ? 'Your Comfy Cloud account balance is shown at platform.comfy.org; the app does not read it.' : null };
  if (localFree && !all.some((e: any) => e.kind === 'charge' || e.kind === 'refund' || (e.kind === 'grant' && !/^starting/i.test(e.note ?? '')))) return { localFree: true, hidden: true, balance: null, ...cloud, unit: l.unit, freeGens: l.freeGens, buckets: [], byTool: {}, totals: null, entries: [], total: 0, offset: 0, limit, nextOffset: null, nextCursor: null };
  return { localFree, hidden: false, balance: l.balance, ...cloud, unit: l.unit, freeGens: l.freeGens, buckets: (l.buckets as any[]).map((b) => ({ ...b, expiresAt: b.expiresAt ?? null, expiresAtIso: b.expiresAt ? new Date(b.expiresAt).toISOString() : null, expired: !!b.expiresAt && b.expiresAt <= Date.now() })), overdraft: (l as any).overdraft ?? 0, byTool, totals, reconciles: totals.reconciles, entries: page, total, offset, limit, nextOffset: more ? offset + limit : null, nextCursor: more ? page.at(-1)?.id ?? null : null };
});
/** Draft → one-click upscale: runs the Upscale tool (SeedVR2) on a finished video result, keeping the seed; parentId = this job.
 * Body/query: output? (index, default 0), mode? precise|creative|smooth60 (default precise). */
app.post<{ Params: { id: string }; Body: { output?: number; mode?: string } | undefined; Querystring: { output?: string; mode?: string } }>('/api/jobs/:id/upscale', async (req, reply) => {
  const j = jobs.get(req.params.id); if (!j) return reply.code(404).send({ error: 'not found' });
  const up = getTool('upscale'); if (!up) return reply.code(501).send({ error: 'Upscale tool is not available.', errorType: 'validation' });
  if (!upscalable(j)) return reply.code(409).send({ error: j.status !== 'done' ? 'Only finished results can be upscaled.' : 'This result cannot be upscaled (not a video, already 1080p, or an upscale).', errorType: 'validation' });
  const idx = Number(req.body?.output ?? req.query.output ?? 0) || 0; const out = j.outputs[idx] ?? (idx === 0 && j.resultUrl ? { url: j.resultUrl } : null);
  if (!out || !isVideoUrl(out.url) || !out.url.startsWith('/files/')) return reply.code(400).send({ error: 'output index out of range', errorType: 'validation' });
  { const no = admit(reply); if (no) return no; }
  const mo: Record<string, any> = { mode: String(req.body?.mode ?? req.query.mode ?? 'precise') };
  { const bad = (await import('./shared/enumParams.js')).enumParamError(up, mo); if (bad) return reply.code(400).send({ ...bad, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }); } // BH P3 #6: allowlisted mode, never echoed
  const mode = String(mo.mode); // re-check 6: normalised (PRECISE → precise)
  const fields: Record<string, string> = { rights: '1', types: JSON.stringify([mode]), resolution: '1080p', seed: String(j.input.seed ?? ''), prompt: '' };
  const input = await up.parseInput(fields, { video: [decodeURIComponent(out.url.slice('/files/'.length))] });
  if ('error' in input && typeof input.error === 'string') return reply.code(400).send({ error: input.error, errorType: 'validation', code: (input as any).code ?? 'invalid_input', issues: (input as any).issues ?? [] }); // re-check 6: every rejection carries a code
  const inp = input as Record<string, any>; inp.upscaleOf = j.id; inp.upscaleOutput = idx;
  const prov = getProvider(up.providers[0]); const provId = prov?.id ?? 'comfy-open';
  const est = estimateSeconds(up, inp, 1, provId); const cost = isLocalFree(prov?.kind) ? 0 : est;
  // S-01: the submit's spend guard (spending cap → 400 spend_limit, agent budget, Spend row). The upscale engines today are local (SeedVR2, $0) and
  // FLUX 3 Upscaler is coming soon, so this never blocks yet; a hosted upscale route is covered the day it lands.
  const sg = await spendGuard(reply, { kind: isLocalFree(prov?.kind) ? 'local' : 'direct', routeId: null, credits: cost, demo: false, free: false }); if ('sent' in sg) return sg.sent;
  if (!canAfford(cost)) return reply.code(402).send({ error: `Not enough credits: needs ${cost}, balance ${getBalance()}.`, errorType: 'credits' });
  const upId = randomUUID().slice(0, 8);
  const ag = (await import('./agentBudget.js')).admitAgentRun(req, reply, { jobId: upId, toolId: up.id, model: provId, estUsd: sg.runCost.estUsd, credits: cost }); if (!('agent' in ag)) return ag;
  const nj = enqueue(up.id, inp, est, upId, j.id, provId, cost, false); if (ag.agent) nj.agent = ag.agent;
  sg.spendRow(nj); // spend log, same as a submit
  // BH13 (Oct 19): Upscale on a draft names its route like the Upscale quote: a keyless default route says plainly it's a sample run (0 credits charged).
  const dm = config.backend === 'mock' && cost === 0 ? (await import('./routing/http.js')).demoFieldsFor(up, defaultProviderFor(up) ?? provId, inp) : {};
  return { id: nj.id, toolId: nj.toolId, provider: nj.provider, parentId: j.id, upscaleOf: j.id, seed: inp.seed, mode, cost, balance: getBalance(), warnings: nj.warnings, ...dm };
});
/** Mock-only dev hook: set the balance exactly (to test the 402 "you can afford k of n groups" path). 404 when the backend isn't mock. */
app.post<{ Body: { credits?: number } }>('/api/dev/balance', async (req, reply) => {
  if (config.backend !== 'mock') return reply.code(404).send({ error: `No API route POST /api/dev/balance`, errorType: 'not_found', path: '/api/dev/balance' });
  const c = Number(req.body?.credits); if (!Number.isFinite(c) || c < 0 || c > 1e9) return reply.code(400).send({ error: 'credits must be a number ≥ 0', errorType: 'validation', issues: [{ code: 'invalid', field: 'credits', message: 'credits must be a number ≥ 0' }] });
  const { setBalanceDev } = await import('./ledger.js'); return { balance: setBalanceDev(c), mockOnly: true };
});
/** Mock dev: one-time bucket repair (2026-10-17). Body {key?, reason?}; idempotent per key; balance unchanged; recorded in /api/usage totals.discrepancies. */
app.post<{ Body: { key?: string; reason?: string } | undefined }>('/api/dev/repair-buckets', async (req, reply) => {
  if (config.backend !== 'mock') return reply.code(404).send({ error: 'No API route POST /api/dev/repair-buckets', errorType: 'not_found', path: '/api/dev/repair-buckets' });
  const { repairBucketGap, usageTotals: ut } = await import('./ledger.js');
  const key = String(req.body?.key ?? '2026-10-17-dual-process').slice(0, 80); const reason = String(req.body?.reason ?? 'one-time bucket repair (dual-process overlap, Oct 17 2026)').slice(0, 200);
  const r = repairBucketGap(key, reason); return { ...r, buckets: ut().buckets, mockOnly: true };
});
/** Mock dev: job duration for every mock run (re-queue tests keep jobs running). {ms: number | null}; null = back to env OPENHIGGSFIELD_MOCK_DELAY_MS / tool defaults. 404 unless mock. */
app.get('/api/dev/mock-delay', async (_req, reply) => { if (config.backend !== 'mock') return reply.code(404).send({ error: 'No API route GET /api/dev/mock-delay', errorType: 'not_found', path: '/api/dev/mock-delay' });
  const { mockDelayMs } = await import('./tools/shared.js'); return { ms: mockDelayMs(), env: process.env.OPENHIGGSFIELD_MOCK_DELAY_MS ?? null, mockOnly: true }; });
/** Mock only (404 otherwise): inject a live preview frame for a job {b64 (JPEG or PNG bytes, base64), mime?} (tests and UI work without a GPU). Same store and limits as real frames. */
app.post<{ Params: { id: string }; Body: { b64?: string; mime?: string } }>('/api/dev/jobs/:id/preview', async (req, reply) => {
  if (config.backend !== 'mock') return reply.code(404).send({ error: 'No API route POST /api/dev/jobs/:id/preview', errorType: 'not_found', path: '/api/dev/jobs/:id/preview' });
  const j = jobs.get(req.params.id); if (!j) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
  const data = Buffer.from(String(req.body?.b64 ?? ''), 'base64'); const mime = data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'image/png' : data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg' : null;
  if (!mime) return reply.code(400).send({ error: 'b64 must be JPEG or PNG bytes', errorType: 'validation', issues: [{ code: 'invalid', field: 'b64', message: 'b64 must be JPEG or PNG bytes' }] });
  const kept = putPreview(j.id, { mime, data }, Date.now()); if (kept) j.updatedAt = Date.now();
  return { kept, bytes: data.length, mime, mockOnly: true };
});
app.post<{ Body: { ms?: number | null } }>('/api/dev/mock-delay', async (req, reply) => {
  if (config.backend !== 'mock') return reply.code(404).send({ error: 'No API route POST /api/dev/mock-delay', errorType: 'not_found', path: '/api/dev/mock-delay' });
  const { setMockDelayMs, MOCK_DELAY_MAX_MS } = await import('./tools/shared.js'); const raw = req.body?.ms;
  if (raw === null) return { ms: setMockDelayMs(null), reset: true, mockOnly: true };
  const ms = Number(raw); if (!Number.isFinite(ms) || ms < 0 || ms > MOCK_DELAY_MAX_MS) return reply.code(400).send({ error: `ms must be 0–${MOCK_DELAY_MAX_MS} (or null to reset)`, errorType: 'validation', issues: [{ code: 'invalid', field: 'ms', message: `ms must be 0–${MOCK_DELAY_MAX_MS} (or null to reset)` }] });
  return { ms: setMockDelayMs(ms), appliesTo: 'jobs that start after this call', mockOnly: true };
});
/** Mock dev/tests: add credits. Body { amount, source?: starter|topup|promo }. Grants never expire (expiresInDays is ignored). */
app.post<{ Body: { amount?: number; source?: 'starter' | 'topup' | 'promo' } }>('/api/ledger/grant', async (req, reply) => {
  if (config.backend !== 'mock' && !/^(1|true)$/i.test(process.env.OPENHIGGSFIELD_DEV_GRANT ?? '')) return reply.code(403).send({ error: 'Dev only: credits can be granted on the mock backend (or with OPENHIGGSFIELD_DEV_GRANT=1).', errorType: 'forbidden', code: 'dev_only' });
  const a = Math.round(Number(req.body?.amount)); if (!(a > 0)) return reply.code(400).send({ error: 'amount must be > 0', errorType: 'validation' });
  const ALLOWED_GRANT = ['starter', 'topup', 'promo'] as const;
  const src = req.body?.source as string | undefined;
  // Missing source → topup. A present value must be starter|topup|promo (refund buckets only come from credits back).
  if (src != null && src !== '' && !(ALLOWED_GRANT as readonly string[]).includes(src)) {
    return reply.code(400).send({ error: 'source must be starter, topup or promo (refund buckets only come from credits back).', errorType: 'validation', code: 'invalid_source', field: 'source', allowed: [...ALLOWED_GRANT] });
  }
  const b = grant(a, src === 'starter' || src === 'promo' ? src : 'topup');
  return { bucket: b, balance: getBalance() };
});
/** [R45] Share links: private by default. */
app.post<{ Params: { id: string } }>('/api/jobs/:id/share', async (req, reply) => {
  const j = jobs.get(req.params.id); if (!j) return reply.code(404).send({ error: 'not found' });
  if (j.status !== 'done') return reply.code(409).send({ error: 'Only finished results can be shared.', errorType: 'validation' });
  const m = lib.shareJob(j.id); return { token: m.shareToken, url: `/s/${m.shareToken}` };
});
app.delete<{ Params: { id: string } }>('/api/jobs/:id/share', async (req, reply) => { const j = jobs.get(req.params.id); if (!j) return reply.code(404).send({ error: 'not found' }); lib.unshareJob(j.id); (await import('./shareCard.js')).dropCards(j.id); return { ok: true }; });
const sharedView = (j: Job) => ({ id: j.id, toolId: j.toolId, toolName: getTool(j.toolId)?.name ?? j.toolId, outputs: withOutputMeta(j.outputs), resultUrl: j.resultUrl, createdAt: j.createdAt, attribution: jobAttribution(j), model: engineNameOf(j), runOnLabel: jobModelFields(j).runOnLabel, cardUrl: `/s/${lib.metaOf(j.id).shareToken}/card.png` });
app.get<{ Params: { token: string } }>('/api/share/:token', async (req, reply) => { const id = lib.jobByToken(req.params.token); const j = id ? jobs.get(id) : undefined; return j && !lib.metaOf(j.id).deletedAt ? sharedView(j) : reply.code(404).send({ error: 'This link was revoked or never existed.' }); });
(await import('./routesWorkflow.js')).registerWorkflowExport(app); // Get workflow: GET /api/jobs/:id/workflow (ComfyUI API graph of any result)
(await import('./routesShare.js')).registerShare(app); // share cards: /s/:token (Open Graph / X meta), /s/:token/card.png, PUT /api/jobs/:id/share/card
(await import('./routesStamp.js')).registerStamp(app); // Add logo and text: POST /api/jobs/:id/stamp (the stamped copy of an image or video result, free)
(await import('./shareExport.js')).registerShareExport(app); // share step 3: POST /api/jobs/:id/share/export (branded video: badge/strip overlay + end card)
(await import('./captions.js')).registerCaptions(app); // captions + SRT: /api/jobs/:id/captions (Whisper on this computer), .srt / .vtt, burn-in into a new job
(await import('./routesOpenModels.js')).registerOpenModels(app); // Open models only: GET|PUT /api/settings/open-models
/** [R44] Retention: with RESULT_TTL_DAYS > 0, finished jobs older than that are moved to Trash (hourly sweep). */
if (RESULT_TTL_DAYS > 0) {
  const sweepRetention = () => { const cut = Date.now() - RESULT_TTL_DAYS * 86400_000; for (const j of jobs.values()) if (j.finishedAt && j.finishedAt < cut && !lib.metaOf(j.id).deletedAt) lib.trash(j.id); };
  sweepRetention(); setInterval(sweepRetention, 3600_000).unref();
}

{
  const ready = config.backend === 'comfy' ? checkComfyReady() : null;
  console.info(
    `[openhiggsfield] starting backend=${config.backend} openWeightsOnly=${openWeightsOnly()}${FILMING.on ? ' FILMING MODE (scratch data dir; npm run filming -- off to leave)' : ''}` +
      (ready ? (ready.ok ? ' comfy=ready' : ` comfy=not-ready (${ready.detail})`) : ''),
  );
}

process.on('unhandledRejection', (e) => app.log.error({ err: e }, 'unhandledRejection (kept alive)'));
process.on('uncaughtException', (e) => app.log.error({ err: e }, 'uncaughtException (kept alive)'));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => { try { flushJobs(); db.close(); } finally { process.exit(0); } });
app.get('/api/me', async () => ({ id: 'local', localFree: localFreeNow() }));
// ---- 404 JSON for unknown /api/* (audit batch 1 P0 #1). ----
// BH4 #6 (G13): a missing media/file URL (/files/, /samples/, or any path ending in a file extension such as .png/.mp4/.js) is a real 404,
// never the SPA's index.html with 200 (broken <img>/<video> then fire onerror, and caches never store HTML as an image).
const FILE_URL_RE = /^\/(files|samples)\/|\.(png|jpe?g|webp|gif|avif|svg|ico|mp4|webm|mov|m4v|mkv|mp3|wav|ogg|m4a|flac|json|zip|pdf|txt|js|mjs|css|map|woff2?|ttf|glb|gltf|safetensors)$/i;
app.setNotFoundHandler((req, reply) => { const p = req.url.split('?')[0];
  if (p.startsWith('/api/')) return reply.code(404).send({ error: `No API route ${req.method} ${p}`, errorType: 'not_found', path: p });
  if (FILE_URL_RE.test(p)) return reply.code(404).header('cache-control', 'no-store').send({ error: 'File not found.', errorType: 'not_found', path: p });
  return WEB_DIST ? reply.type('text/html').sendFile('index.html', WEB_DIST) : reply.code(404).type('text/plain').send('Not found'); });
// ---- Models & Licences: links only here; stripped from /api/tools + /api/models. ----
app.get('/api/licenses', async () => { const r: any = buildLicenseReport(); const { creditOfLicenseRow } = await import('./attribution.js'); return { ...r, rows: r.rows.map((x: any) => ({ ...x, ...creditOfLicenseRow(x) })) }; });
app.addHook('preSerialization', async (req, _reply, payload) => (/^\/api\/(tools|models)(\/|\?|$)/.test(req.url) ? stripLicenseLinks(payload) : payload));
// Performance (task 11): ?toolId= / ?fields= on /api/tools and /api/models, then brotli/gzip. Registered last so both see the final payload.
{ const pf = await import('./payloadFilters.js'); pf.registerPayloadFilters(app); pf.registerCompression(app); }
/** Network exposure requires an explicit HOST opt-in in development and production. */
export const LISTEN_HOST = listenHost(process.env);
process.env.HOST = LISTEN_HOST; // the "runs on this computer" checks (saving keys, ComfyUI address) read process.env.HOST: keep it the address we really listen on
await app.listen({ port: Number(process.env.PORT) || 8787, host: LISTEN_HOST });
