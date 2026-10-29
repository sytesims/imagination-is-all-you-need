/**
 * Prompt Edit (tool id prompt-edit, 2026-10-27): Edit Video › Prompt Edit. Your clip + one sentence ("make it night", "remove the cup",
 * "change her coat to red") → the same clip with that change, motion and framing kept.
 * Model: Bernini-R (ByteDance, open weights, Apache-2.0) on Comfy Cloud, from the official Comfy template video_bernini_r_video_editing
 * (graph, limits and prep: comfy/berniniCloud.ts). The model's own limits: the first 5 s of the clip, 480p, 16 fps; the clip's sound kept.
 * Opened on the Video page (?workflow=prompt-edit; recipe in shared/videoBar.ts). Price: hostedPrices.ts cloud-bernini-r (an estimate, priceUnmeasured).
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

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, code, issues: [{ code, field, message }] }) as any;

export const promptEditTool: ToolDef = {
  id: PROMPT_EDIT_TOOL, name: 'Prompt Edit', category: 'Edit Video', status: 'new', route: `/tools/${PROMPT_EDIT_TOOL}`, ui: 'app',
  description: `Say what to change and get the same clip back with it changed: make it night, remove the cup, turn her coat red. The motion and framing stay. Clips up to ${BERNINI_MAX_SECONDS} s; a longer clip uses its first ${BERNINI_MAX_SECONDS} s.`,
  inputs: [{ name: 'video', kind: 'file', required: true, accept: 'video/mp4,video/quicktime,video/webm', label: 'Your clip' },
    { name: 'prompt', kind: 'text', required: true, label: 'What to change' } as any,
    { name: 'types', kind: 'list', required: false, max: 1, options: ['edit'] },
    { name: 'resolution', kind: 'select', options: [BERNINI_RESOLUTION], default: BERNINI_RESOLUTION },
    { name: 'keepAudio', kind: 'select', options: ['1', '0'], default: '1' },
    { name: 'seed', kind: 'number' }],
  app: { kind: 'video', input: 'video', maxSeconds: BERNINI_MAX_SECONDS, minSeconds: BERNINI_MIN_SECONDS, resolutions: [BERNINI_RESOLUTION] },
  workflows: [BERNINI_GRAPH_FILE], model: `${BERNINI_NAME} (Wan 2.2) on Comfy Cloud`, gpuSecPerSec: { [BERNINI_RESOLUTION]: 25 }, providers: [BERNINI_PROVIDER], stages: STAGES,
  routeInput: () => ({ types: ['edit'], resolution: BERNINI_RESOLUTION }),
  async parseInput(fields, files) {
    const vf = files.video?.[0]; if (!vf) return bad('video', 'Add a clip to edit.', 'required');
    if (/\.(png|jpe?g|webp|gif)$/i.test(vf)) return bad('video', 'Prompt Edit takes a video clip, not a photo.', 'format');
    const prompt = String(fields.prompt ?? '').trim();
    if (!prompt) return bad('prompt', 'Say what to change, e.g. make it night.', 'prompt_required');
    if (prompt.length > BERNINI_MAX_CHARS) return bad('prompt', `Keep it under ${BERNINI_MAX_CHARS} characters (yours is ${prompt.length}).`, 'too_long');
    const src = path.join(DATA_DIR, vf); const p = await probe(src);
    if (!p) return bad('video', 'That clip could not be read. Re-export it as MP4 (H.264) and try again.', 'unreadable');
    if (!(p.duration >= BERNINI_MIN_SECONDS)) return bad('video', `That clip is too short (${p.duration.toFixed(1)} s). Use one of at least ${BERNINI_MIN_SECONDS} s.`, 'too_short');
    if (Math.min(p.width, p.height) < 64) return bad('video', `That clip is too small (${p.width}×${p.height}).`, 'too_small');
    const keepAudio = !/^(0|false|off|no)$/i.test(fields.keepAudio ?? '');
    const warnings: string[] = [];
    if (p.duration > BERNINI_MAX_SECONDS + 0.1) warnings.push(`Your clip is ${p.duration.toFixed(1)} s. ${BERNINI_NAME} edits up to ${BERNINI_MAX_SECONDS} s, so you get its first ${BERNINI_MAX_SECONDS} s back.`);
    const seed = fields.seed != null && fields.seed !== '' && Number.isFinite(Number(fields.seed)) ? Math.abs(Math.floor(Number(fields.seed))) : Math.floor(Math.random() * 2 ** 31);
    return { types: ['edit'], mode: 'prompt-edit', outKind: 'video', prompt, finalPrompt: prompt, duration: Math.round(Math.min(p.duration, BERNINI_MAX_SECONDS) * 100) / 100, resolution: BERNINI_RESOLUTION,
      videoPath: src, videoUrl: `/files/${vf}`, compareUrl: `/files/${vf}`, hasAudio: p.hasAudio, keepAudio, width: p.width, height: p.height, seed,
      sourceSeconds: p.duration, trimmed: p.duration > BERNINI_MAX_SECONDS + 0.1, outputLabel: 'Edited', warnings };
  },
  /** Only reached without the Cloud runner (no Comfy key, or the mock backend): a sample, nothing sent. */
  async run(job) {
    if (config.backend === 'mock' || !(job as any).routing) return mockRun(job, STAGES, ['Edited'], 4000);
    job.status = 'failed'; job.errorType = 'validation' as any; job.error = `${BERNINI_NAME} runs on Comfy Cloud. Add your Comfy key in Settings, then try again. Nothing was charged.`;
  },
};
