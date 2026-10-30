/**
 * Swap Two People (tool id two-person-swap, 2026-10-27): Video › Edit › Swap Two People. One clip with two people + one photo per person
 * (person 1 → photo 1, person 2 → photo 2) → the same clip with both people recast; motion, framing and sound kept.
 * Model: MiniMax H3 + the Character Swap LoRA (Akatz) on Comfy Cloud, our own two-pass recipe (comfy/h3TwoPersonSwapCloud.ts). Who is who:
 * a click on each person on the first frame, else person 1 = the person on the left and person 2 = the one on the right.
 * Opened on the Video page (?workflow=two-person-swap; recipe in shared/videoBar.ts, the Who is who chip in web ui/video/barExtras/TwoPersonSwapExtra).
 * Price: hostedPrices.ts cloud-h3-two-swap (an estimate, priceUnmeasured). Without a Comfy key (or on the mock backend) the job is a sample.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
import { applySwapTrim } from './videoSwap.js';
import { swapRangeSeconds } from '../shared/cloudSwap.js';
import { CHARSWAP_LORA_URL } from '../comfy/h3CharSwapCloud.js';
import { TWO_SWAP_PROVIDER, TWO_SWAP_ROUTE, TWO_SWAP_GRAPH, TWO_SWAP_NAME, TWO_SWAP_REQUIRES, TWO_SWAP_SECONDS, TWO_SWAP_TIERS, twoSwapIssue, twoSwapSeconds,
  twoSwapCloudPlan, twoSwapPreflight, type CastPick } from '../comfy/h3TwoPersonSwapCloud.js';

export const TWO_PERSON_SWAP_TOOL = 'two-person-swap';
const D = '2026-10-27';
const STAGES: [string, string][] = [['uploading', 'Uploading'], ['submitted', 'Submitted to Comfy Cloud'], ['rendering', 'Recasting person 1, then person 2'], ['downloading', 'Downloading result']];
const IMG = 'image/png,image/jpeg,image/webp';

registerWorkflowLicense(TWO_SWAP_GRAPH, ['minimax-community-akatz-charswap', 'sam-license']);
registerProvider({ id: TWO_SWAP_PROVIDER, name: `${TWO_SWAP_NAME} · two people · Comfy Cloud`, kind: 'hosted', license: 'minimax-community-akatz-charswap', licenseUrl: CHARSWAP_LORA_URL, docUrl: CHARSWAP_LORA_URL,
  via: `Comfy Cloud workflow job (API v2): our own two-pass graph workflows/${TWO_SWAP_GRAPH}, core nodes only (MiniMax H3 Ref2VA + the Character Swap LoRA imported into your Comfy Cloud library, SAM 3.1 masks); price not measured yet: an estimate`,
  stages: STAGES, workflows: [TWO_SWAP_GRAPH], nodes: TWO_SWAP_REQUIRES.nodes } as any);
CLOUD_WORKFLOWS[TWO_SWAP_ROUTE] = { routeId: TWO_SWAP_ROUTE, provider: TWO_SWAP_PROVIDER, standalone: true, target: 'cloud', label: 'Swap Two People · H3 Character Swap · Comfy Cloud',
  graphs: [TWO_SWAP_GRAPH], requires: TWO_SWAP_REQUIRES, plan: twoSwapCloudPlan, preflight: twoSwapPreflight };
CLOUD_RUNNER_ROUTES.add(TWO_SWAP_ROUTE);
/** Billed seconds: the frames it renders (H3's 17k+5 grid at 24 fps), at the tier picked. */
NATIVE_DIRECT[TWO_SWAP_PROVIDER] = { label: 'Comfy Cloud', sourceUrl: CHARSWAP_LORA_URL, checkedAt: D, typicalLatencySec: 420, latencyEstimated: true, latencySource: 'estimated', output: 'video', unavailableFor: twoSwapIssue,
  priceInput: (i: Record<string, any>) => ({ ...i, duration: twoSwapSeconds(i), resolution: i.resolution === '480p' ? '480p' : '768p' }),
  caps: { resolutions: [...TWO_SWAP_TIERS], minSeconds: TWO_SWAP_SECONDS.min, maxSeconds: TWO_SWAP_SECONDS.max, fps: 24, keepsAudio: true } } as any;
registerModelInfo(TWO_SWAP_PROVIDER, { name: TWO_SWAP_NAME, speed: 'slow', quality: 'good', hint: `Recasts both people, one at a time, so faces never mix · ${TWO_SWAP_SECONDS.min}–${TWO_SWAP_SECONDS.max} s, 480p or 768p`, badges: [] } as any);
MODEL_CATALOG[TWO_SWAP_PROVIDER] = { name: TWO_SWAP_NAME, family: 'MiniMax', description: `MiniMax H3 Character Swap (by Akatz) on Comfy Cloud, run once per person in a single job: person 1 first, then person 2, each with their own photo. Motion, framing and sound stay. ${TWO_SWAP_SECONDS.min}–${TWO_SWAP_SECONDS.max} s at 480p or 768p.`,
  tech: 'MiniMax H3 Ref2VA int8 + H3 Character Swap LoRA v1.5 + 8-step turbo LoRA, SAM 3.1 person masks; two chained passes in one Comfy Cloud job (our own graph).' } as any;

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, code, issues: [{ code, field, message }] }) as any;
/** "x,y" (0–1) → a click on the first frame; empty = none. */
const pointOf = (s?: string): { x: number; y: number } | null | 'bad' => {
  if (!s || !s.trim()) return null; const [x, y] = s.split(',').map(Number);
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : 'bad';
};
const sha = async (p: string) => createHash('sha1').update(await readFile(p)).digest('hex');

export const twoPersonSwapTool: ToolDef = {
  id: TWO_PERSON_SWAP_TOOL, name: 'Swap Two People', listed: false, category: 'Edit Video', route: `/tools/${TWO_PERSON_SWAP_TOOL}`, ui: 'app',
  description: `Recast both people in one clip: a photo for each, and the same take comes back with both swapped. Moves, framing and sound stay. ${TWO_SWAP_SECONDS.min}–${TWO_SWAP_SECONDS.max} s.`,
  inputs: [{ name: 'video', kind: 'file', required: true, accept: 'video/mp4,video/quicktime,video/webm', label: 'Your clip' },
    { name: 'personA', kind: 'file', required: true, accept: IMG, label: 'Person 1 photo' } as any,
    { name: 'personB', kind: 'file', required: true, accept: IMG, label: 'Person 2 photo' } as any,
    { name: 'whoA', kind: 'text', label: 'Person 1 in words (optional)' } as any, { name: 'whoB', kind: 'text', label: 'Person 2 in words (optional)' } as any,
    { name: 'pointA', kind: 'text', label: 'Person 1 on the first frame "x,y" (optional)' } as any, { name: 'pointB', kind: 'text', label: 'Person 2 on the first frame "x,y" (optional)' } as any,
    { name: 'resolution', kind: 'select', options: [...TWO_SWAP_TIERS], default: '768p' },
    { name: 'keepAudio', kind: 'select', options: ['1', '0'], default: '1' },
    { name: 'trimStart', kind: 'number' }, { name: 'trimEnd', kind: 'number' }, { name: 'seed', kind: 'number' }],
  app: { kind: 'video', input: 'video', maxSeconds: TWO_SWAP_SECONDS.max, minSeconds: TWO_SWAP_SECONDS.min, resolutions: [...TWO_SWAP_TIERS] },
  workflows: [TWO_SWAP_GRAPH], model: `${TWO_SWAP_NAME} (MiniMax H3 + Character Swap LoRA) on Comfy Cloud, twice per clip`, gpuSecPerSec: { '480p': 28, '768p': 56 }, providers: [TWO_SWAP_PROVIDER], stages: STAGES,
  async parseInput(fields, files) {
    const vf0 = files.video?.[0]; if (!vf0) return bad('video', 'Add a clip with two people in it.', 'required');
    if (/\.(png|jpe?g|webp|gif)$/i.test(vf0)) return bad('video', 'Swap Two People takes a video clip, not a photo.', 'format');
    const a = files.personA?.[0], b = files.personB?.[0];
    if (!a && !b) return bad('personA', 'Add a photo for each person.', 'required');
    if (!a) return bad('personA', 'Add a photo for person 1.', 'required');
    if (!b) return bad('personB', 'Add a photo for person 2.', 'required');
    for (const [f, k] of [[a, 'personA'], [b, 'personB']] as const) if (!/\.(png|jpe?g|webp)$/i.test(f)) return bad(k, 'Use a PNG, JPEG or WEBP photo.', 'format');
    const t = await applySwapTrim(fields, files); if ('error' in t) return t;
    const vf = files.video![0]; const src = path.join(DATA_DIR, vf); const p = await probe(src);
    if (!p) return bad('video', 'That clip could not be read. Re-export it as MP4 (H.264) and try again.', 'unreadable');
    const duration = t.trim ? swapRangeSeconds(t.trim) : Math.round(p.duration * 100) / 100;
    if (duration > TWO_SWAP_SECONDS.max + 0.05) return bad('video', `Your clip is ${duration.toFixed(1)} s. Pick up to ${TWO_SWAP_SECONDS.max} s with Range.`, 'too_long');
    if (duration < TWO_SWAP_SECONDS.min) return bad('video', `That clip is too short (${duration.toFixed(1)} s). Use one of at least ${TWO_SWAP_SECONDS.min} s.`, 'too_short');
    if (Math.min(p.width, p.height) < 64) return bad('video', `That clip is too small (${p.width}×${p.height}).`, 'too_small');
    const pa = pointOf(fields.pointA), pb = pointOf(fields.pointB);
    if (pa === 'bad') return bad('pointA', 'pointA must be "x,y" with both from 0 to 1.');
    if (pb === 'bad') return bad('pointB', 'pointB must be "x,y" with both from 0 to 1.');
    const whoA = String(fields.whoA ?? '').trim(), whoB = String(fields.whoB ?? '').trim();
    if (whoA.length > 120 || whoB.length > 120) return bad(whoA.length > 120 ? 'whoA' : 'whoB', 'Keep each description under 120 characters, like “the woman in the red dress”.', 'too_long');
    const cast: CastPick[] = [{ point: pa, who: whoA }, { point: pb, who: whoB }];
    const resolution = fields.resolution === '480p' ? '480p' : '768p';
    const input = { cast, duration, width: p.width, height: p.height };
    const issue = twoSwapIssue(input); if (issue) return bad(/same spot/.test(issue) ? 'pointB' : 'video', `${issue}.`);
    const warnings: string[] = [];
    try { if ((await sha(path.join(DATA_DIR, a))) === (await sha(path.join(DATA_DIR, b)))) warnings.push('Both people have the same photo, so both become the same character.'); } catch { /* unreadable photos fail at upload */ }
    const keepAudio = !/^(0|false|off|no)$/i.test(fields.keepAudio ?? '');
    const seed = fields.seed != null && fields.seed !== '' && Number.isFinite(Number(fields.seed)) ? Math.abs(Math.floor(Number(fields.seed))) : Math.floor(Math.random() * 2 ** 31);
    return { ...input, mode: 'two-person-swap', outKind: 'video', resolution, keepAudio, seed, hasAudio: p.hasAudio, prompt: '',
      videoPath: src, videoUrl: `/files/${vf}`, compareUrl: `/files/${vf}`, personAPath: path.join(DATA_DIR, a), personBPath: path.join(DATA_DIR, b),
      refPaths: [path.join(DATA_DIR, a), path.join(DATA_DIR, b)], refUrls: [`/files/${a}`, `/files/${b}`], ...(t.trim ? { trim: t.trim } : {}), outputLabel: 'Both swapped', warnings };
  },
  /** Only reached without the Cloud runner (no Comfy key, or the mock backend): a sample, nothing sent. */
  async run(job) {
    if (config.backend === 'mock' || !(job as any).routing) return mockRun(job, STAGES, ['Both swapped'], 4000);
    job.status = 'failed'; job.errorType = 'validation' as any; job.error = `Swap Two People runs on Comfy Cloud. Add your Comfy key in Settings, then try again. Nothing was charged.`;
  },
};
