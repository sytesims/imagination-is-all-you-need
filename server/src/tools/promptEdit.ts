/**
 * Prompt Edit (tool id prompt-edit, 2026-10-27): Edit Video › Prompt Edit. Your clip + one sentence ("make it night", "remove the cup",
 * "change her coat to red") → the same clip with that change, motion and framing kept.
 * Models, each with its own limits (EDIT_MODELS: the parser, the route check and the bar's options read them):
 *  - Bernini-R (ByteDance, open weights, Apache-2.0) on Comfy Cloud, from the official Comfy template video_bernini_r_video_editing (graph, limits
 *    and prep: comfy/berniniCloud.ts): the first 5 s of the clip, 480p, 16 fps; the clip's sound kept. Price: hostedPrices.ts cloud-bernini-r
 *    (an estimate, priceUnmeasured). The default, unchanged.
 *  - Kling 4.0 (2026-10-31) through its Comfy partner node Kling4EditVideoNode on Comfy Cloud (comfy/kling4Cloud.ts k4Edit*): 3–30 s (Fit to model
 *    trims a longer clip to its first 30 s and fixes size / fps for free), 720p or 1080p, the clip's shape and length kept. Price: the node's badge,
 *    hostedPrices.ts cloud-kling4-edit ($0.26884 / $0.40326 per second of the clip). "Keep the clip's sound" off keeps Kling's own sound.
 * Opened on the Video page (?workflow=prompt-edit; recipe in shared/videoBar.ts).
 * Without a Comfy key (or on the mock backend) the job is a sample: nothing is sent.
 */
import path from 'node:path';
import type { ToolDef } from './types.js';
import { DATA_DIR, config } from '../config.js';
import { probe } from '../media.js';
import { registerProvider } from '../providers.js';
import { registerWorkflowLicense } from '../licenses.js';
import { registerModelInfo } from '../models.js';
import { MODEL_CATALOG } from '../shared/modelCatalog.js';
import { CLOUD_WORKFLOWS } from '../comfy/cloudWorkflows.js';
import { CLOUD_RUNNER_ROUTES } from '../routing/runnable.js';
import { NATIVE_DIRECT } from '../routing/directRoutes.js';
import { mockRun } from './shared.js';
import { K4_NAME, K4_PR, K4_RESOLUTIONS, K4_MAX_CHARS, K4_EDIT_PROVIDER, K4_EDIT_ROUTE, K4_EDIT_NODE, K4_EDIT_SECONDS, k4EditIssue, k4EditPlan } from '../comfy/kling4Cloud.js';
import { BERNINI_PROVIDER, BERNINI_ROUTE, BERNINI_NAME, BERNINI_DOC, BERNINI_TEMPLATE, BERNINI_TEMPLATE_URL, BERNINI_LICENSE_URL, BERNINI_GRAPH_FILE, BERNINI_REQUIRES,
  BERNINI_MAX_SECONDS, BERNINI_MIN_SECONDS, BERNINI_MAX_CHARS, BERNINI_RESOLUTION, BERNINI_FPS, berniniIssue, berniniSeconds, berniniCloudPlan, prepareBerniniCloud } from '../comfy/berniniCloud.js';

export const PROMPT_EDIT_TOOL = 'prompt-edit';
const D = '2026-10-27';
const STAGES: [string, string][] = [['uploading', 'Uploading'], ['submitted', 'Submitted to Comfy Cloud'], ['rendering', 'Comfy Cloud rendering'], ['downloading', 'Downloading result']];

registerWorkflowLicense(BERNINI_GRAPH_FILE, ['apache-2.0']);
registerProvider({ id: BERNINI_PROVIDER, name: `${BERNINI_NAME} · Comfy Cloud`, kind: 'hosted', license: 'apache-2.0', licenseUrl: BERNINI_LICENSE_URL, docUrl: BERNINI_DOC,
  via: `Comfy Cloud workflow job (API v2): the official template ${BERNINI_TEMPLATE} flattened to core nodes (comfy/berniniCloud.ts, workflows/${BERNINI_GRAPH_FILE}); price not measured yet: an estimate`,
  stages: STAGES, workflows: [BERNINI_GRAPH_FILE], nodes: BERNINI_REQUIRES.nodes } as any);
CLOUD_WORKFLOWS[BERNINI_ROUTE] = { routeId: BERNINI_ROUTE, provider: BERNINI_PROVIDER, standalone: true, target: 'cloud', label: `${BERNINI_NAME} · Comfy Cloud`,
  graphs: [BERNINI_GRAPH_FILE], requires: BERNINI_REQUIRES, plan: berniniCloudPlan, prepare: prepareBerniniCloud };
CLOUD_RUNNER_ROUTES.add(BERNINI_ROUTE);
/** Billed seconds: the frames it renders (the clip's first 5 s at 16 fps), not the clip's own length. */
NATIVE_DIRECT[BERNINI_PROVIDER] = { label: 'Comfy Cloud', sourceUrl: BERNINI_DOC, checkedAt: D, typicalLatencySec: 240, latencyEstimated: true, latencySource: 'estimated', output: 'video', unavailableFor: berniniIssue,
  priceInput: (i: Record<string, any>) => ({ ...i, duration: berniniSeconds(i), resolution: BERNINI_RESOLUTION }),
  caps: { resolutions: [BERNINI_RESOLUTION], minSeconds: BERNINI_MIN_SECONDS, maxSeconds: BERNINI_MAX_SECONDS, fps: BERNINI_FPS, keepsAudio: true, longerClips: 'first 5 s' } } as any;
registerModelInfo(BERNINI_PROVIDER, { name: BERNINI_NAME, speed: 'balanced', quality: 'good', hint: `Change a clip with one sentence; motion and framing stay · up to ${BERNINI_MAX_SECONDS} s, 480p`, badges: [] } as any);
MODEL_CATALOG[BERNINI_PROVIDER] = { name: BERNINI_NAME, family: 'Wan', description: `ByteDance’s Bernini-R open weights (Apache-2.0) on Comfy Cloud: say what to change and it edits your clip, keeping the motion, framing and sound. Up to ${BERNINI_MAX_SECONDS} s at 480p; a longer clip uses its first ${BERNINI_MAX_SECONDS} s.`,
  tech: `Official Comfy template ${BERNINI_TEMPLATE} (${BERNINI_TEMPLATE_URL}); Wan 2.2 high / low noise fp8 + lightx2v turbo LoRA, 6 steps, 16 fps.` } as any;

// Kling 4.0 Edit (2026-10-31): the Edit Video partner node, a second model of Prompt Edit (comfy/kling4Cloud.ts).
registerProvider({ id: K4_EDIT_PROVIDER, name: `${K4_NAME} Edit · Comfy Cloud`, kind: 'hosted', license: 'proprietary', licenseUrl: 'https://kling.ai/document-api', docUrl: K4_PR,
  via: `Comfy partner node ${K4_EDIT_NODE} (model "kling-4.0") on Comfy Cloud, Comfy key in extra_data: LoadVideo → ${K4_EDIT_NODE} → SaveVideo (comfy/kling4Cloud.ts); sample output without a key`,
  stages: STAGES, nodes: [K4_EDIT_NODE] } as any);
CLOUD_WORKFLOWS[K4_EDIT_ROUTE] = { routeId: K4_EDIT_ROUTE, provider: K4_EDIT_PROVIDER, standalone: true, target: 'cloud', label: `${K4_NAME} Edit · Comfy Cloud (partner node)`,
  graphs: [], requires: { nodes: ['LoadVideo', K4_EDIT_NODE, 'SaveVideo'], models: [] }, plan: k4EditPlan, partnerAuth: true };
CLOUD_RUNNER_ROUTES.add(K4_EDIT_ROUTE);
NATIVE_DIRECT[K4_EDIT_PROVIDER] = { label: 'Comfy Cloud', endpoint: `POST https://cloud.comfy.org/api/v2/jobs (graph: LoadVideo → ${K4_EDIT_NODE} → SaveVideo)`, sourceUrl: K4_PR, checkedAt: '2026-10-31',
  typicalLatencySec: 300, latencyEstimated: true, latencySource: 'estimated', output: 'video', unavailableFor: k4EditIssue,
  caps: { resolutions: [...K4_RESOLUTIONS], minSeconds: K4_EDIT_SECONDS.min, maxSeconds: K4_EDIT_SECONDS.max, keepsLength: true, keepsShape: true, partnerNode: K4_EDIT_NODE } } as any;
registerModelInfo(K4_EDIT_PROVIDER, { name: K4_NAME, speed: 'balanced', quality: 'best', hint: `Change a clip with one sentence; its length and shape stay · ${K4_EDIT_SECONDS.min}–${K4_EDIT_SECONDS.max} s, 720p or 1080p`, badges: ['premium'] } as any);
MODEL_CATALOG[K4_EDIT_PROVIDER] = { name: K4_NAME, family: 'Kling', description: `Kuaishou Kling 4.0 on Comfy Cloud: say what to change and it edits your clip, keeping its length and shape. ${K4_EDIT_SECONDS.min}–${K4_EDIT_SECONDS.max} s at 720p or 1080p; a longer clip uses its first ${K4_EDIT_SECONDS.max} s.`,
  tech: `Comfy partner node ${K4_EDIT_NODE} (${K4_PR}).` } as any;

/** Each model's limits (the parser and the bar read them; the route checks repeat them for the quote). */
export interface EditModel { name: string; minSec: number; maxSec: number; resolutions: string[]; maxChars: number;
  /** a longer clip: the model's prep keeps its first maxSec s (Bernini-R), else Fit to model trims it before the run (shared/videoFit.ts) */ trimsItself: boolean;
  /** "Keep the clip's sound" off: silent (the graph has no sound of its own), or the model's own sound */ ownSound: boolean }
export const EDIT_MODELS: Record<string, EditModel> = {
  [BERNINI_PROVIDER]: { name: BERNINI_NAME, minSec: BERNINI_MIN_SECONDS, maxSec: BERNINI_MAX_SECONDS, resolutions: [BERNINI_RESOLUTION], maxChars: BERNINI_MAX_CHARS, trimsItself: true, ownSound: false },
  [K4_EDIT_PROVIDER]: { name: K4_NAME, minSec: K4_EDIT_SECONDS.min, maxSec: K4_EDIT_SECONDS.max, resolutions: [...K4_RESOLUTIONS], maxChars: K4_MAX_CHARS, trimsItself: false, ownSound: true },
};

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, code, issues: [{ code, field, message }] }) as any;

export const promptEditTool: ToolDef = {
  id: PROMPT_EDIT_TOOL, name: 'Prompt Edit', category: 'Edit Video', status: 'new', route: `/tools/${PROMPT_EDIT_TOOL}`, ui: 'app',
  description: `Say what to change and get the same clip back with it changed: make it night, remove the cup, turn her coat red. The motion and framing stay. ${BERNINI_NAME}: clips up to ${BERNINI_MAX_SECONDS} s at 480p (a longer clip uses its first ${BERNINI_MAX_SECONDS} s); ${K4_NAME}: ${K4_EDIT_SECONDS.min}–${K4_EDIT_SECONDS.max} s at 720p or 1080p.`,
  inputs: [{ name: 'video', kind: 'file', required: true, accept: 'video/mp4,video/quicktime,video/webm', label: 'Your clip' },
    { name: 'prompt', kind: 'text', required: true, label: 'What to change' } as any,
    { name: 'types', kind: 'list', required: false, max: 1, options: ['edit'] },
    { name: 'resolution', kind: 'select', options: [BERNINI_RESOLUTION, ...K4_RESOLUTIONS], default: BERNINI_RESOLUTION, byProvider: Object.fromEntries(Object.entries(EDIT_MODELS).map(([id, m]) => [id, m.resolutions])) } as any,
    { name: 'keepAudio', kind: 'select', options: ['1', '0'], default: '1' },
    { name: 'seed', kind: 'number' }],
  app: { kind: 'video', input: 'video', maxSeconds: BERNINI_MAX_SECONDS, minSeconds: BERNINI_MIN_SECONDS, resolutions: [BERNINI_RESOLUTION],
    resolutionsByProvider: Object.fromEntries(Object.entries(EDIT_MODELS).map(([id, m]) => [id, m.resolutions])),
    /* each model's own default size (Kling 4.0: 720p, not the tool-wide 480p), so the Edit Video menu, the quote and the bar price the same job */
    defaultResolutionByProvider: Object.fromEntries(Object.entries(EDIT_MODELS).map(([id, m]) => [id, m.resolutions[0]])),
    /* each model's clip limits (the bar's slot note; Bernini-R's stay the tool-wide ones above) */ editModels: EDIT_MODELS },
  workflows: [BERNINI_GRAPH_FILE], model: `${BERNINI_NAME} (Wan 2.2) on Comfy Cloud`, gpuSecPerSec: { [BERNINI_RESOLUTION]: 25 }, providers: [BERNINI_PROVIDER, K4_EDIT_PROVIDER], stages: STAGES,
  /* the size asked when a model makes it (each route bills and checks its own: Bernini-R is always 480p, Kling 4.0 720p unless 1080p is asked) */
  routeInput: (i: any) => ({ types: ['edit'], resolution: Object.values(EDIT_MODELS).some((m) => m.resolutions.includes(String(i?.resolution))) ? String(i.resolution) : undefined }),
  async parseInput(fields, files) {
    const prov = EDIT_MODELS[fields.provider] ? fields.provider : BERNINI_PROVIDER; const M = EDIT_MODELS[prov];
    const vf = files.video?.[0]; if (!vf) return bad('video', 'Add a clip to edit.', 'required');
    if (/\.(png|jpe?g|webp|gif)$/i.test(vf)) return bad('video', 'Prompt Edit takes a video clip, not a photo.', 'format');
    const prompt = String(fields.prompt ?? '').trim();
    if (!prompt) return bad('prompt', 'Say what to change, e.g. make it night.', 'prompt_required');
    if (prompt.length > M.maxChars) return bad('prompt', `Keep it under ${M.maxChars.toLocaleString('en-US')} characters (yours is ${prompt.length.toLocaleString('en-US')}).`, 'too_long');
    const asked = String(fields.resolution ?? '').trim(); const resolution = M.resolutions.includes(asked) ? asked : !asked || prov === BERNINI_PROVIDER ? M.resolutions[0] : null;
    if (!resolution) return bad('resolution', `${M.name} edits at ${M.resolutions.join(' or ')}.`, 'unsupported');
    const src = path.join(DATA_DIR, vf); const p = await probe(src);
    if (!p) return bad('video', 'That clip could not be read. Re-export it as MP4 (H.264) and try again.', 'unreadable');
    if (!(p.duration >= M.minSec - 0.01)) return bad('video', `That clip is too short (${p.duration.toFixed(1)} s). ${prov === BERNINI_PROVIDER ? 'Use one' : `${M.name} needs one`} of at least ${M.minSec} s.`, 'too_short');
    if (Math.min(p.width, p.height) < 64) return bad('video', `That clip is too small (${p.width}×${p.height}).`, 'too_small');
    const keepAudio = !/^(0|false|off|no)$/i.test(fields.keepAudio ?? '');
    const warnings: string[] = []; const long = p.duration > M.maxSec + 0.1;
    if (long && M.trimsItself) warnings.push(`Your clip is ${p.duration.toFixed(1)} s. ${M.name} edits up to ${M.maxSec} s, so you get its first ${M.maxSec} s back.`); // else Fit to model trims it, with its own note
    const seed = fields.seed != null && fields.seed !== '' && Number.isFinite(Number(fields.seed)) ? Math.abs(Math.floor(Number(fields.seed))) : Math.floor(Math.random() * 2 ** 31);
    /* Kling 4.0: its own sound when the clip's is off, so keepAudio is not set (the runner would strip the result's sound); clipSound puts the clip's back */
    const sound = M.ownSound ? { clipSound: keepAudio && p.hasAudio } : { keepAudio };
    const ext = path.extname(vf).slice(1).toLowerCase();
    return { types: ['edit'], mode: 'prompt-edit', outKind: 'video', prompt, finalPrompt: prompt, duration: Math.round((M.trimsItself ? Math.min(p.duration, M.maxSec) : p.duration) * 100) / 100 /* Fit to model trims the rest (submit: duration = its trim) */, resolution,
      videoPath: src, videoUrl: `/files/${vf}`, compareUrl: `/files/${vf}`, hasAudio: p.hasAudio, ...sound, width: p.width, height: p.height, ...(p.fps ? { fps: p.fps } : {}), ...(ext ? { videoFormat: ext } : {}), seed,
      sourceSeconds: p.duration, trimmed: long, outputLabel: 'Edited', warnings };
  },
  /** Only reached without the Cloud runner (no Comfy key, or the mock backend): a sample, nothing sent. */
  async run(job) {
    if (config.backend === 'mock' || !(job as any).routing) return mockRun(job, STAGES, ['Edited'], 4000);
    job.status = 'failed'; job.errorType = 'validation' as any; job.error = `${EDIT_MODELS[job.provider]?.name ?? BERNINI_NAME} runs on Comfy Cloud. Add your Comfy key in Settings, then try again. Nothing was charged.`;
  },
};
