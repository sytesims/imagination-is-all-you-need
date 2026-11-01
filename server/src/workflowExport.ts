/**
 * "Every result is a workflow" (PRIZE-STRATEGY §5.2 #2): GET /api/jobs/:id/workflow exports the ComfyUI API-format graph a job ran.
 *
 * Where the graph comes from, best first:
 *  - submitted: the runner (comfy/runNative.ts, local ComfyUI and Comfy Cloud workflow routes) writes every pass it sends to
 *    <DATA_DIR>/workflow-graphs/<jobId>.json at submit (recordSubmittedPass). Exported byte for byte: uploaded inputs carry the names
 *    ComfyUI gave them (still in its input/ folder on a local run).
 *  - rebuilt: older jobs and mock runs. The same plan builder the runner calls (buildPlan / buildCloudPlan) is run again on the stored
 *    job input. It is deterministic (prompt, seed, sizes, LoRAs come from the input), so the graph equals what the runner submits;
 *    uploaded files appear under their own file names (test/workflow-export.e2e.ts checks rebuilt == submitted).
 *  - equivalent: the job ran on a hosted API (fal, Replicate, BFL…) but the model also has our open workflow. Offered with exact:false
 *    and a plain note: this is how to run the same model yourself, not what ran.
 *  - partner: a Comfy Cloud partner-node job (e.g. MiniMax H3 through ComfyCloudMiniMaxH3*Node). The graph with the partner node,
 *    from its workflows/ file (node-map fills prompt / seed / image) or, without a file, from the node's definition in the tracked
 *    object_info snapshot (prompt and seed are yours, other settings are the node's defaults). exact:false.
 * Comfy Router and other hosted APIs without a workflow: available:false, "This ran on <provider>, not a ComfyUI workflow".
 *
 * Format: ComfyUI API format only. ComfyUI's editor opens API-format files directly ("Yes, but without layout",
 * https://docs.comfy.org/development/api-development/workflow-api-format) and lays the nodes out itself. The repo has a UI → API converter
 * (scripts/ui2api.py) but none for API → UI, so no editor-format file is offered.
 */
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DATA_DIR, WORKFLOWS_DIR, config } from './config.js';
import type { Job } from './jobs.js';
import { getProvider } from './providers.js';
import { jobModelFields } from './routing/modelRegistry.js';
import { RUN_ON_LABELS, type RunOn } from './shared/modelIds.js';
import { isApiNode } from './apiNodes.js';

export const GRAPHS_DIR = path.join(DATA_DIR, 'workflow-graphs');
const graphFile = (jobId: string) => path.join(GRAPHS_DIR, `${jobId.replace(/[^\w-]/g, '')}.json`);

interface StoredPass { index: number; label: string; workflow: string; graph: Record<string, any> }
interface Stored { v: 1; jobId: string; toolId: string; provider: string; route: string | null; target: 'local' | 'comfy-cloud'; submittedAt: number; passes: StoredPass[] }

/** Called by the runner for every pass, right before it is sent (after uploads and the GGUF drop-in). Never throws. */
export function recordSubmittedPass(job: Pick<Job, 'id' | 'toolId' | 'provider' | 'route'>, index: number, pass: { label: string; workflow: string }, graph: Record<string, any>, target: 'local' | 'comfy-cloud') {
  try {
    mkdirSync(GRAPHS_DIR, { recursive: true }); const f = graphFile(job.id);
    let s: Stored | null = null; try { s = JSON.parse(readFileSync(f, 'utf8')); } catch { /* first pass */ }
    if (!s || s.route !== (job.route ?? null) || index === 0) s = { v: 1, jobId: job.id, toolId: job.toolId, provider: job.provider, route: job.route ?? null, target, submittedAt: Date.now(), passes: [] };
    s.passes = [...s.passes.filter((p) => p.index !== index), { index, label: pass.label, workflow: pass.workflow, graph: JSON.parse(JSON.stringify(graph)) }].sort((a, b) => a.index - b.index);
    writeFileSync(f, JSON.stringify(s));
  } catch (e) { console.warn(`[openhiggsfield] could not store the submitted graph for ${job.id}: ${(e as Error).message}`); }
}
export const storedGraphs = (jobId: string): Stored | null => { try { return JSON.parse(readFileSync(graphFile(jobId), 'utf8')); } catch { return null; } };

export type ExportSource = 'submitted' | 'rebuilt' | 'equivalent' | 'partner';
export interface MediaNote { pass: number; node: string; field: string; file: string; what: string; /** ffmpeg command that makes this file from your upload (prepared inputs only) */ how?: string }
export interface WorkflowExport {
  jobId: string; toolId: string; available: boolean; exact: boolean; source: ExportSource | null;
  ranOn: { id: string | null; label: string | null; kind: string | null };
  /** One plain sentence for the header of the export panel. */ headline: string;
  /** Short extra notes (sample run, partner node, multi-pass…). */ notes: string[];
  reason?: string;
  passes: { index: number; label: string; workflow: string; nodes: number; partnerNodes: string[]; url: string }[];
  media: MediaNote[]; runtime: { pass: number; node: string; field: string; what: string }[];
  formats: { api: true; ui: false; uiNote: string };
  comfy: { url: string | null; opensApiFormat: true; howTo: string[]; docs: string };
}
const UI_NOTE = 'API format only. ComfyUI’s editor opens it as is and arranges the nodes for you; there is no separate editor (layout) file.';
const HOW_TO = ['Open ComfyUI.', 'Drag the .json file onto the canvas, or use Workflow → Open (File → Load in older versions).', 'Put the input files listed here into ComfyUI’s input folder, then press Run.'];
const DOCS = 'https://docs.comfy.org/development/api-development/workflow-api-format';

const isFile = (v: any): v is { __file: string } => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.__file === 'string';
/** Replace { __file } placeholders with the file's own name and list them. */
function withFileNames(g: Record<string, any>, pass: number, describe: (abs: string) => string, media: MediaNote[], how?: (abs: string) => string | null) {
  const out: Record<string, any> = {};
  for (const [id, n] of Object.entries<any>(g)) {
    const inputs: Record<string, any> = {};
    for (const [k, v] of Object.entries<any>(n?.inputs ?? {})) {
      if (isFile(v)) { const file = path.basename(v.__file); inputs[k] = file; media.push({ pass, node: id, field: k, file, what: describe(v.__file), ...(how?.(v.__file) ? { how: how(v.__file)! } : {}) }); }
      else inputs[k] = v;
    }
    out[id] = { ...n, inputs };
  }
  return out;
}
const RUNTIME_WHAT: Record<string, string> = { speech: 'Filled in at run time: the clip’s speech, transcribed and translated by the server', textFromPass: 'Filled in at run time: text written by the previous pass', fileFromPass: 'Filled in at run time: the voice, separated from the background by the first pass', speechLines: 'Filled in at run time: the clip’s speech, transcribed line by line and translated by the server; one copy of this node per line' };
const PREP_WHAT = (p: any): string => p.kind === 'fps' ? `Your clip, converted with ffmpeg to ${p.fps} fps at ${p.width}×${p.height}${p.seconds ? `, ${Math.round(p.seconds * 10) / 10} s` : ''}${p.start ? ` from ${Math.round(p.start * 10) / 10} s` : ''}${p.frames ? `, held on its last frame to exactly ${p.frames} frames` : ''}`
  : p.kind === 'frame' ? `A frame from your clip (${p.at === 'last' ? 'last frame' : `at ${p.at} s`}), saved as an image` : p.kind === 'frameFromPass' ? `The last frame of pass ${p.pass + 1}` : 'Prepared from your input';

async function probeFps(file: string) { try { const { execFileSync } = await import('node:child_process'); const r = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', file]).toString().trim(); const [a, b] = r.split('/').map(Number); return b ? a / b : a; } catch { return 30; } }

/** Partner-node graph from a provider's workflows/ file + node-map (cloud-h3), or from the node definition (object_info snapshot). */
function partnerGraph(job: Job, providerId: string, media: MediaNote[]): { workflow: string; graph: Record<string, any>; note: string } | null {
  const p = getProvider(providerId) ?? getProvider(job.provider); const i = job.input ?? {}; const t2v = !(i.imagePath || i.refPaths?.length);
  const files = (p?.workflows ?? []).filter((f) => existsSync(path.join(WORKFLOWS_DIR, f)));
  const file = files.find((f) => (t2v ? /t2v|t2i/ : /i2v|edit|i2i/).test(f)) ?? files[0];
  if (file) {
    const g = JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8'));
    const mapFile = path.join(WORKFLOWS_DIR, 'node-maps', `${path.basename(file).replace(/-api\.json$/, '')}.json`);
    const m = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : null;
    const set = (s: any, v: any) => { if (s && g[s.node]) g[s.node].inputs[s.field] = v; };
    const prompt = i.finalPrompt ?? i.prompt; if (prompt) set(m?.inputs?.prompt, prompt);
    if (i.seed != null) set(m?.seed, Math.max(0, Math.floor(Number(i.seed) || 0)));
    const img = i.imagePath ?? i.refPaths?.[0]; if (img && m?.inputs?.image) { set(m.inputs.image, path.basename(img)); media.push({ pass: 0, node: m.inputs.image.node, field: m.inputs.image.field, file: path.basename(img), what: 'Your upload' }); }
    return { workflow: file, graph: g, note: 'Built from the partner node’s workflow file with your prompt and seed. Other settings keep the file’s values, so check them against the result.' };
  }
  const node = p?.nodes?.[0]; if (!node) return null;
  let spec: any = null; try { spec = JSON.parse(readFileSync(path.resolve(WORKFLOWS_DIR, '../readiness/stub/object_info.json'), 'utf8'))[node]; } catch { /* no snapshot */ }
  if (!spec) return null;
  const inputs: Record<string, any> = {}; const g: Record<string, any> = {};
  const fill = (sect: Record<string, any>, prefix: string) => { for (const [name, val] of Object.entries<any>(sect ?? {})) {
    const [ty, o = {}] = val as [any, any]; const k = prefix + name;
    if (ty === 'COMFY_DYNAMICCOMBO_V3') { const first = o.options?.[0]; if (!first) continue; inputs[k] = first.key; fill(first.inputs?.required ?? {}, `${k}.`); continue; }
    if (name === 'prompt' && typeof (i.finalPrompt ?? i.prompt) === 'string') { inputs[k] = i.finalPrompt ?? i.prompt; continue; }
    if (name === 'seed' && i.seed != null) { inputs[k] = Math.max(0, Math.floor(Number(i.seed) || 0)); continue; }
    if (ty === 'COMBO') { const opts: any[] = o.options ?? []; const want = [i.aspect, i.resolution, i.imageResolution].find((x) => opts.includes(x)); inputs[k] = want ?? o.default ?? opts[0]; continue; }
    if (Array.isArray(ty)) { inputs[k] = o.default ?? ty[0]; continue; }
    if (['INT', 'FLOAT', 'STRING', 'BOOLEAN'].includes(ty)) { inputs[k] = o.default ?? (ty === 'STRING' ? '' : ty === 'BOOLEAN' ? false : 0); continue; }
    if (ty === 'IMAGE' && prefix === '' && (i.imagePath || i.refPaths?.[0])) { const f = path.basename(i.imagePath ?? i.refPaths[0]); g['10'] = { class_type: 'LoadImage', inputs: { image: f }, _meta: { title: 'Load Image' } }; inputs[k] = ['10', 0]; media.push({ pass: 0, node: '10', field: 'image', file: f, what: 'Your upload' }); }
  } };
  fill(spec.input?.required ?? {}, '');
  g['1'] = { class_type: node, inputs, _meta: { title: spec.display_name ?? node } };
  const out = (spec.output ?? []).findIndex((x: string) => /^(IMAGE|VIDEO|AUDIO)$/.test(x)); if (out < 0) return null;
  const ty = spec.output[out]; g['9'] = ty === 'IMAGE' ? { class_type: 'SaveImage', inputs: { filename_prefix: 'openhiggsfield', images: ['1', out] }, _meta: { title: 'Save Image' } }
    : ty === 'VIDEO' ? { class_type: 'SaveVideo', inputs: { filename_prefix: 'openhiggsfield', format: 'auto', codec: 'auto', video: ['1', out] }, _meta: { title: 'Save Video' } }
    : { class_type: 'SaveAudio', inputs: { filename_prefix: 'openhiggsfield', audio: ['1', out] }, _meta: { title: 'Save Audio' } };
  return { workflow: `partner node ${node}`, graph: g, note: 'Built from the partner node’s definition: your prompt and seed are filled in, other settings use the node’s defaults.' };
}

const partnerOf = (g: Record<string, any>) => [...new Set(Object.values<any>(g).map((n) => n?.class_type).filter((c): c is string => typeof c === 'string' && isApiNode(c)))];

/** Build the export for a job (graphs included, so the route handler can serve one pass). */
export async function buildWorkflowExport(job: Job): Promise<WorkflowExport & { graphs: Record<string, any>[] }> {
  const mf = jobModelFields(job as any); const route = String(job.route ?? ''); const kind = route ? route.split(':')[0] : null;
  const ranOnLabel = kind === 'comfy-router' ? 'Comfy Router' : mf.runOnLabel ?? (mf.runOn ? RUN_ON_LABELS[mf.runOn as RunOn] : null);
  const comfyUrl = await localComfyUrl();
  const base: WorkflowExport = { jobId: job.id, toolId: job.toolId, available: false, exact: false, source: null, ranOn: { id: mf.runOn, label: ranOnLabel, kind },
    headline: '', notes: [], passes: [], media: [], runtime: [], formats: { api: true, ui: false, uiNote: UI_NOTE }, comfy: { url: comfyUrl, opensApiFormat: true, howTo: HOW_TO, docs: DOCS } };
  const fin = (src: ExportSource, exact: boolean, headline: string, passes: { label: string; workflow: string; graph: Record<string, any> }[], extra: Partial<WorkflowExport> = {}) => {
    const notes = [...(extra.notes ?? [])]; if (passes.length > 1) notes.push(`This result took ${passes.length} ComfyUI runs; the app joined them afterwards. Each run is its own file.`);
    if (config.backend === 'mock' && src !== 'submitted') notes.push(exact ? 'This result is a sample, so nothing ran yet. The workflow is exactly what a real run sends.' : 'This result is a sample, so nothing ran yet.');
    return { ...base, ...extra, notes, available: true, exact, source: src, headline,
      passes: passes.map((p, k) => ({ index: k, label: p.label, workflow: p.workflow, nodes: Object.keys(p.graph).length, partnerNodes: partnerOf(p.graph), url: `/api/jobs/${job.id}/workflow?format=api${passes.length > 1 ? `&pass=${k}` : ''}` })), graphs: passes.map((p) => p.graph) };
  };
  if (job.status !== 'done') return { ...base, reason: 'The workflow is ready once the result is.', headline: 'Not finished yet', graphs: [] };

  // 1. What the runner sent.
  const st = storedGraphs(job.id);
  if (st?.passes.length && (st.route ?? '') === route) {
    const where = st.target === 'local' ? 'your ComfyUI' : 'Comfy Cloud';
    return fin('submitted', true, `The exact workflow ${where} ran, with your settings.`, st.passes,
      { notes: [st.target === 'local' ? 'Your input files keep the names ComfyUI gave them; they are still in ComfyUI’s input folder.' : 'Your input files were uploaded to Comfy Cloud as assets; in your own ComfyUI, load them by hand into the matching Load nodes.'] });
  }
  // H3 swap composition/diagnostics changed after historical runs. Without the submitted graph, rebuilding with today's
  // builder would invent old instructions and mask artifacts. Never present that as the exact historical run.
  if (job.toolId === 'object-swap' && route === 'comfy-cloud:cloud-h3-charswap') {
    return { ...base, reason: 'This H3 swap has no saved submitted graph. Current prompt composition and mask diagnostics differ; the historical graph cannot be reconstructed exactly.', headline: 'Historical workflow unavailable', graphs: [] };
  }
  // A plugin's sample run (plugins.ts): nothing ran; the plugin wrote the workflow a real run on your own ComfyUI would send.
  const sample = path.join(DATA_DIR, `${job.id.replace(/[^\w-]/g, '')}-graph.json`);
  const pluginTool = job.simulated && existsSync(sample) ? (await import('./tools/registry.js')).getTool(job.toolId) : undefined;
  if (pluginTool?.plugin) {
    try { const graph = JSON.parse(readFileSync(sample, 'utf8'));
      return fin('rebuilt', false, 'Sample — nothing ran. This is the workflow a real run on your own ComfyUI would send, with your settings.', [{ label: 'Result', workflow: pluginTool.workflows?.[0] ?? `plugin ${job.toolId}`, graph }],
        { notes: ['Your input files are listed by their own names in the Load nodes. Copy them into ComfyUI’s input folder before you run it.', 'The plugin’s custom nodes and models must be installed in your ComfyUI.'] });
    } catch { /* unreadable: fall through */ }
  }
  // 2. Rebuild with the runner's own plan builder.
  const media: MediaNote[] = []; const runtime: WorkflowExport['runtime'] = [];
  const { hasPlan, buildPlan } = await import('./comfy/plans.js'); const { CLOUD_WORKFLOWS, buildCloudPlan } = await import('./comfy/cloudWorkflows.js');
  const j = { id: job.id, toolId: job.toolId, provider: job.provider, input: structuredClone(job.input ?? {}) };
  const uploads = new Set<string>(Object.entries<any>(job.input ?? {}).filter(([k]) => /Paths?$/.test(k)).flatMap(([, v]) => [v].flat()).filter((v) => typeof v === 'string'));
  const rebuild = async (cloud: boolean): Promise<{ label: string; workflow: string; graph: Record<string, any> }[]> => {
    const srcFps = j.input.videoPath && existsSync(j.input.videoPath) ? await probeFps(j.input.videoPath) : undefined;
    const wf = CLOUD_WORKFLOWS[route];
    const plan = cloud ? buildCloudPlan(wf ? { ...j, provider: wf.provider } : j, { srcFps }) : buildPlan(j as any, { srcFps });
    const variant = !cloud && route.startsWith('local:') && typeof j.input.variantId === 'string' ? (await import('./hardware/requirements.js')).findVariant(j.input.variantId) : null;
    return plan.passes.map((p, k) => {
      const preps = new Map<string, any>(); for (const pr of p.prep ?? []) { if ('out' in pr) preps.set(pr.out, pr); else runtime.push({ pass: k, node: (pr as any).node, field: (pr as any).field, what: RUNTIME_WHAT[pr.kind] ?? 'Filled in at run time' }); }
      const describe = (abs: string) => preps.has(abs) ? PREP_WHAT(preps.get(abs)) : uploads.has(abs) ? 'Your upload' : abs.startsWith(WORKFLOWS_DIR) || !abs.startsWith(DATA_DIR) ? `Bundled with Imagination Is All You Need (${path.relative(path.resolve(WORKFLOWS_DIR, '..'), abs)})` : 'Made by the app from your input';
      const how = (abs: string) => { const pr = preps.get(abs); if (!pr) return null; const b = path.basename;
        if (pr.kind === 'fps') return `ffmpeg -y${pr.start ? ` -ss ${pr.start}` : ''} -i "${b(pr.src)}"${pr.seconds ? ` -t ${pr.seconds}` : ''} -vf "fps=${pr.fps},scale=${pr.width}:${pr.height}:flags=lanczos,setsar=1" -an -c:v libx264 -crf 16 -pix_fmt yuv420p "${b(pr.out)}"`;
        if (pr.kind === 'frame') return `ffmpeg -y ${pr.at === 'last' ? '-sseof -0.1' : `-ss ${pr.at}`} -i "${b(pr.src)}" -frames:v 1${pr.width ? ` -vf scale=${pr.width}:${pr.height}` : ''} "${b(pr.out)}"`;
        return null; };
      const g = withFileNames(p.graph, k, describe, media, how);
      if (variant?.loader === 'gguf' && variant.dropIn) for (const nd of Object.values<any>(g)) if (nd?.class_type === 'UNETLoader' && nd.inputs?.unet_name === variant.replaces) { nd.class_type = 'UnetLoaderGGUF'; nd.inputs = { unet_name: variant.file }; }
      return { label: p.label, workflow: p.workflow, graph: g };
    });
  };
  const fileNote = (n: MediaNote[]) => n.length ? ['Your files are listed by name. Copy them into ComfyUI’s input folder (or pick them in the Load nodes) before you run it.'] : [];
  try {
    if (kind === 'comfy-cloud' && (CLOUD_WORKFLOWS[route] || route === `comfy-cloud:${job.provider}` && CLOUD_WORKFLOWS[`comfy-cloud:${job.provider}`])) {
      const passes = await rebuild(true); return fin('rebuilt', true, 'The workflow Comfy Cloud runs for this result, with your settings.', passes, { media, runtime, notes: fileNote(media) });
    }
    if (kind === 'comfy-cloud' || kind === 'comfy-router') {
      const pg = partnerGraph(job as Job, route.slice(route.indexOf(':') + 1), media); const via = kind === 'comfy-router' ? 'Comfy’s API' : 'Comfy Cloud';
      if (pg) return fin('partner', false, `This ran through ${via} with a partner node (${partnerOf(pg.graph).join(', ') || 'API node'}). Here is the same call as a ComfyUI workflow.`, [{ label: 'Result', workflow: pg.workflow, graph: pg.graph }], { media, notes: [pg.note, 'Partner nodes run on the provider’s servers: in ComfyUI they need a Comfy account with credits.'] });
      return { ...base, reason: kind === 'comfy-router' ? 'This ran on Comfy Router, an API, not a ComfyUI workflow.' : 'This ran on Comfy Cloud through a partner API, and there is no workflow file for it yet.', headline: 'Not a ComfyUI workflow', graphs: [] };
    }
    const local = !kind || kind === 'local';
    if (hasPlan(j as any)) {
      const passes = await rebuild(false);
      if (local) return fin('rebuilt', true, 'The workflow your ComfyUI runs for this result, with your settings.', passes, { media, runtime, notes: fileNote(media) });
      return fin('equivalent', false, `This ran on ${ranOnLabel ?? 'a hosted API'}, not a ComfyUI workflow. Here is the same model as an open ComfyUI workflow, with your settings.`, passes, { media, runtime, notes: ['Outputs can differ from the hosted run: the provider may use other sampler settings.', ...fileNote(media)] });
    }
  } catch (e) {
    return { ...base, reason: `The workflow couldn’t be rebuilt for this result: ${(e as Error).message}`, headline: 'No workflow for this one', graphs: [] };
  }
  if (kind === 'comfy-router') return { ...base, reason: 'This ran on Comfy Router, an API, not a ComfyUI workflow.', headline: 'Not a ComfyUI workflow', graphs: [] };
  return { ...base, reason: `This ran on ${ranOnLabel ?? 'a hosted API'}, not a ComfyUI workflow.`, headline: 'Not a ComfyUI workflow', graphs: [] };
}

/** The local ComfyUI address (Connections → Local), without credentials; null for Comfy Cloud or none. */
async function localComfyUrl(): Promise<string | null> {
  try { const { comfyUrlState, safeUrl } = await import('./hardware.js'); const s = comfyUrlState() as any; if (!s.url || s.cloud) return null; return safeUrl(s.url); } catch { return null; }
}
