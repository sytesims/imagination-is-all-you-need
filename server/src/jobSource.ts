/**
 * A result's Source block (2026-10-29): which workflow ran, and the prompts the app wrote for it. One helper for the job view, so every
 * result says what really ran (Swap Two People showed only "Created" and "No prompt", though it ran our two-pass graph with one prompt per person).
 *  - workflow: the credited workflow of (tool, model) (shared/appWorkflows.ts appWorkflowFor: official Comfy template, community, ours), else
 *    unknown graphs have no invented attribution.
 *  - appPrompts: prompts a workflow writes itself (a plan pass's expect.prompts), stored on the job when the plan is built (notePlanPrompts).
 */
import { appWorkflowFor, ltxDfrFeatureOfJob } from './shared/appWorkflows.js';
import { routerModelOfRoute } from './routing/routerModels.js';

type JobLike = { toolId: string; provider?: string | null; route?: string | null; input?: Record<string, any> | null };
type PlanLike = { passes: { label?: string; workflow?: string; expect?: { prompts?: unknown } | null }[] };

/** Keep the prompts the plan's builder wrote (one per pass or per person) on the job, so details can show them. */
export function notePlanPrompts(job: { input: Record<string, any> }, plan: PlanLike) {
  const ps = plan.passes.flatMap((p) => (Array.isArray(p.expect?.prompts) ? (p.expect!.prompts as unknown[]) : [])).filter((s): s is string => typeof s === 'string' && !!s.trim());
  if (ps.length) job.input.appPrompts = ps;
  // The cloud runner builds on a cloned job; retain its actual graph names on the real job too.
  job.input.comfyPlan = { ...job.input.comfyPlan, passes: plan.passes.map(p => ({ label: p.label, workflow: p.workflow })) };
}
export interface JobSourceWorkflow { name: string; source: 'official' | 'community' | 'ours'; url: string | null; file: string | null; licence: string | null; author: string }
export function jobWorkflow(j: JobLike): JobSourceWorkflow | null {
  const routeEngine = String(j.route ?? '').split(':').slice(1).join(':');
  const router = routerModelOfRoute(String(j.route ?? ''));
  if (router) return { name: `${router.id} request on Comfy Router`, source: 'ours', author: 'Imagination Is All You Need', url: router.doc, file: null, licence: 'Hosted model terms; request code: AGPL-3.0 (this repo)' };
  const dfr = ltxDfrFeatureOfJob(j);
  const mode = String(j.input?.mode ?? j.input?.types?.[0] ?? '');
  const image = !!(j.input?.imagePath || j.input?.imageUrl || j.input?.startImagePath || j.input?.startImageUrl) || mode === 'i2v';
  if (j.toolId === 'h3-video' && (routeEngine === 'cloud-h3-wf' || (j.provider === 'comfy-h3' && String(j.route ?? '').startsWith('local:')))) {
    const modeId = mode === 'r2v' ? 'r2v' : image ? 'i2v' : 't2v';
    const id = `video_minimax_h3_${modeId}`;
    const file = j.input?.comfyPlan?.passes?.[0]?.workflow ?? `${String(j.route).startsWith('comfy-cloud:') ? 'cloud/' : ''}h3-${modeId}-api.json`;
    return { name: `MiniMax H3: ${modeId === 'r2v' ? 'Reference' : image ? 'Image' : 'Text'} to Video`, source: 'official', author: 'Comfy Org', url: `https://github.com/Comfy-Org/workflow_templates/blob/main/templates/${id}.json`, file, licence: 'MIT (Comfy-Org/workflow_templates)' };
  }
  const w = dfr?.workflow ?? [routeEngine, j.provider].filter(Boolean).map((p) => { try { return appWorkflowFor(j.toolId, String(p)); } catch { return null; } }).find(Boolean) ?? null;
  if (w) return { name: w.name, source: w.source, author: w.author, url: w.url ?? null, file: j.input?.comfyPlan?.passes?.[0]?.workflow ?? w.file ?? null, licence: w.licence ?? null };
  // A filename proves which graph ran, not who wrote it or its licence.
  return null;
}
export const jobAppPrompts = (j: JobLike): string[] => (Array.isArray(j.input?.appPrompts) ? (j.input!.appPrompts as unknown[]).filter((s): s is string => typeof s === 'string') : []);
