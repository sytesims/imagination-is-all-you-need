/**
 * Image to vector (SVG) (2026-11-03): the model cards. Ids, styles and rules: shared/imageVector.ts. The app: tools/apps.ts (app-image-vector).
 *  - VTracer · your computer (free): our own code calls VTracer through @neplex/vectorizer (vectorTrace.ts). No ComfyUI, no graph, the same on every
 *    backend (like Finish). The job's "View workflow" says there is no ComfyUI graph.
 *  - Ideogram Vector 1 · Comfy Cloud: the IdeogramVectorImageToSVGApi partner node (comfy/ideogramVectorCloud.ts), real whenever the Comfy key is set;
 *    without one the route says so (Set up), and the mock backend's sample traces on this computer and is labelled a sample.
 */
import path from 'node:path';
import { registerProvider } from '../providers.js';
import { registerLicenseComponents } from '../licenses.js';
import { registerModelInfo } from '../models.js';
import { MODEL_CATALOG } from '../shared/modelCatalog.js';
import { CLOUD_WORKFLOWS } from '../comfy/cloudWorkflows.js';
import { CLOUD_RUNNER_ROUTES } from '../routing/runnable.js';
import { NATIVE_DIRECT } from '../routing/directRoutes.js';
import { DATA_DIR } from '../config.js';
import { IDEOGRAM_VECTOR_ROUTE, ideogramVectorCloudPlan } from '../comfy/ideogramVectorCloud.js';
import { VECTOR_LOCAL, VECTOR_IDEOGRAM, VECTOR_NODE, VECTOR_NODE_DOC, VECTOR_TEMPLATE, VECTOR_TEMPLATE_URL, VTRACER_URL, VECTORIZER_URL, VECTOR_NOTES, vectorStyleLabel } from '../shared/imageVector.js';
import type { Job } from '../jobs.js';

const D = '2026-11-03';
const canceled = (job: Job) => (job.status as string) === 'canceled';
/** Trace the job's picture on this computer and keep the SVG as the job's result. `sample` = a stand-in for a cloud model (mock / no key): said plainly. */
export async function runLocalTrace(job: Job, sample = false) {
  const i: any = job.input; job.status = 'running'; job.stage = 'rendering' as any; job.progress = 10;
  const ac = new AbortController(); const watch = setInterval(() => { if (canceled(job)) ac.abort(); }, 150);
  try {
    const { tracePicture, writeSvg, TraceError } = await import('../vectorTrace.js');
    let r; try { r = await tracePicture(String(i.imagePath), i.style, ac.signal); }
    catch (e: any) { if (canceled(job)) return; job.status = 'failed'; job.errorType = (e instanceof TraceError ? 'invalid_input' : 'temporary') as any;
      job.error = e instanceof TraceError ? `${e.message} Nothing was charged.` : /binding|cannot find module|not supported/i.test(String(e?.message)) ? 'VTracer could not start on this computer. Nothing was charged.' : 'The picture could not be traced. Nothing was charged; try another picture or style.'; return; }
    if (canceled(job)) return;
    const name = `${job.id}-out0.svg`; await writeSvg(path.join(DATA_DIR, name), r.svg);
    const notes = [...r.notes, ...(sample ? [`Sample: Ideogram Vector wasn’t called (no Comfy key or a test server); this SVG was traced on your computer with VTracer.`] : [])];
    job.warnings = [...(job.warnings ?? []), ...notes];
    i.vectorInfo = { traced: r.traced, source: r.source, scaled: r.scaled, photo: r.photo, paths: r.paths, style: vectorStyleLabel(i.style) };
    job.outputs = [{ label: sample ? 'Sample vector (SVG)' : 'Vector (SVG)', url: `/files/${name}`, width: r.source.width, height: r.source.height } as any]; job.resultUrl = `/files/${name}`;
    job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
  } finally { clearInterval(watch); }
}

const stages: [string, string][] = [['rendering', 'Tracing your picture'], ['saving', 'Saving the SVG']];
registerProvider({ id: VECTOR_LOCAL, name: 'VTracer', kind: 'open-weights', via: 'This computer: VTracer (visioncortex, MIT) through @neplex/vectorizer (MIT); no ComfyUI, no provider', workflows: [],
  licenseParts: ['mit'], docUrl: VTRACER_URL, stages, run: (job: Job) => runLocalTrace(job) } as any);
NATIVE_DIRECT[VECTOR_LOCAL] = { noComfy: true, label: 'Your computer · free' };
registerModelInfo(VECTOR_LOCAL, { name: 'VTracer', speed: 'fast', quality: 'good', hint: 'Free on your computer · best on logos, icons and flat art' } as any);
MODEL_CATALOG[VECTOR_LOCAL] = { name: 'VTracer', family: 'VTracer', description: 'Open-source raster-to-vector tracer by visioncortex: colour shapes become smooth SVG paths, on your computer, free.',
  tech: `VTracer (${VTRACER_URL}, MIT) through @neplex/vectorizer 0.1.0 (${VECTORIZER_URL}, MIT). Our code calls the library directly: no ComfyUI graph.` } as any;

registerProvider({ id: VECTOR_IDEOGRAM, name: 'Ideogram Vector 1 · Comfy Cloud', kind: 'hosted', license: 'proprietary', licenseUrl: 'https://ideogram.ai/legal/api-tos', docUrl: VECTOR_NODE_DOC,
  via: `Comfy partner node ${VECTOR_NODE} (model "ideogram-vector-1") on Comfy Cloud, Comfy key in extra_data; graph from the official template ${VECTOR_TEMPLATE} (comfy/ideogramVectorCloud.ts); sample traced on this computer without a key`,
  stages: [['uploading', 'Uploading'], ['submitted', 'Submitted to Comfy Cloud'], ['rendering', 'Ideogram Vector tracing'], ['downloading', 'Downloading the SVG']], nodes: [VECTOR_NODE],
  run: (job: Job) => runLocalTrace(job, true) } as any);
CLOUD_WORKFLOWS[IDEOGRAM_VECTOR_ROUTE] = { routeId: IDEOGRAM_VECTOR_ROUTE, provider: VECTOR_IDEOGRAM, standalone: true, target: 'cloud', label: 'Ideogram Vector 1 · Comfy Cloud (partner node)',
  graphs: [], requires: { nodes: ['LoadImage', VECTOR_NODE, 'SaveSVGNode'], models: [] }, plan: ideogramVectorCloudPlan, partnerAuth: true } as any;
CLOUD_RUNNER_ROUTES.add(IDEOGRAM_VECTOR_ROUTE);
NATIVE_DIRECT[VECTOR_IDEOGRAM] = { label: 'Comfy Cloud', endpoint: `POST https://cloud.comfy.org/api/v2/jobs (graph: LoadImage → ${VECTOR_NODE} → SaveSVGNode)`, sourceUrl: VECTOR_NODE_DOC, checkedAt: D,
  typicalLatencySec: 40, latencyEstimated: true, latencySource: 'estimated', output: 'image' } as any;
registerModelInfo(VECTOR_IDEOGRAM, { name: 'Ideogram Vector 1', speed: 'balanced', quality: 'best', hint: 'Comfy Cloud · cleaner shapes on busy pictures', badges: ['premium'] } as any);
MODEL_CATALOG[VECTOR_IDEOGRAM] = { name: 'Ideogram Vector 1', family: 'Ideogram', description: 'Ideogram’s vectorizer on Comfy Cloud: traces a picture into an editable SVG, transparency kept. Pictures over 2048 px are scaled down first.',
  tech: `Official Comfy template ${VECTOR_TEMPLATE} (${VECTOR_TEMPLATE_URL}); node ${VECTOR_NODE}, mode default. ${VECTOR_NOTES.ideogramStyle}` } as any;

registerLicenseComponents('app-image-vector', [
  { model: 'VTracer (visioncortex; traces on your computer)', license: 'MIT', commercial: 'yes', url: `${VTRACER_URL}/blob/master/LICENSE`, licenseId: 'mit' },
  { model: '@neplex/vectorizer 0.1.0 (Node binding of VTracer, prebuilt binaries)', license: 'MIT', commercial: 'yes', url: `${VECTORIZER_URL}/blob/main/LICENSE`, licenseId: 'mit' },
  { model: `Official Comfy template ${VECTOR_TEMPLATE} (Comfy-Org/workflow_templates)`, license: 'MIT', commercial: 'yes', url: VECTOR_TEMPLATE_URL, licenseId: 'mit' },
  { model: 'Ideogram Vector 1 (hosted, Comfy partner node)', license: 'Ideogram API terms', commercial: 'provider-terms', url: 'https://ideogram.ai/legal/api-tos' },
]);
