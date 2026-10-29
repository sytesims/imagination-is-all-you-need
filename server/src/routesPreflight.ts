/**
 * GET /api/tools/:toolId/preflight (2026-10-23): what stops this run, in the order the Create bar shows it (inputs → model → setup → money),
 * each problem with one fix {kind, label, args}. Same list as the web's Generate popover (shared/preflight.ts preflightProblems).
 * Query = the tool's /price query (provider, types, controls, image=1 / face=1 for filled slots, refs, mask=1, n…) plus photoWidth / photoHeight
 * (the photo in the image slot) and prompt (or hasPrompt=1). The quote is GET /api/tools/:toolId/price itself (injected), so quote = charge.
 */
import type { FastifyInstance } from 'fastify';
import { imageWorkflowsPayload, photoFitOf, type WorkflowRecipe } from './shared/workflows.js';
import { preflightProblems, type PreflightState } from './shared/preflight.js';
import { IMAGE_CAPS } from './shared/imageCaps.js';
import { modelNameOf } from './shared/imageFeatures.js';
import type { ToolDef } from './tools/types.js';

const on = (v: unknown) => v != null && v !== '' && !/^(0|false|off)$/i.test(String(v));
export function registerPreflight(app: FastifyInstance, getTool: (id: string) => ToolDef | undefined) {
  app.get<{ Params: { toolId: string }; Querystring: Record<string, string> }>('/api/tools/:toolId/preflight', async (req, reply) => {
    const t = getTool(req.params.toolId); if (!t) return reply.code(404).send({ error: 'unknown tool' });
    const q = { ...req.query }; if (q.model && !q.provider) q.provider = q.model;
    const recipe = ((imageWorkflowsPayload(getTool as any).workflows as WorkflowRecipe[]).find((r) => r.runner.toolId === t.id && r.surface !== 'rig')) ?? null;
    const typed = (() => { try { const x = JSON.parse(String(q.types ?? '')); return Array.isArray(x) ? String(x[0]) : null; } catch { return q.types ? String(q.types).split(',')[0] : null; } })();
    const mode = recipe ? Object.entries(recipe.modes.whenSlot ?? {}).find(([s]) => on(q[recipe.slots.find((x) => x.name === s)?.sendsAs ?? s]))?.[1] ?? recipe.modes.default : typed ?? (on(q.image) ? 'edit' : 'generate');
    const provider = String(q.provider || (recipe?.models[mode] ?? [])[0] || '');
    const res = await app.inject({ method: 'GET', url: `/api/tools/${encodeURIComponent(t.id)}/price?${new URLSearchParams(Object.entries(q).filter(([k]) => k !== 'prompt' && k !== 'hasPrompt'))}`, headers: { ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}), ...(req.headers['x-agent-budget'] ? { 'x-agent-budget': String(req.headers['x-agent-budget']) } : {}) } });
    let quote: any = null; try { quote = res.json(); } catch { /* not JSON */ }
    const hasPrompt = on(q.hasPrompt) || !!String(q.prompt ?? '').trim();
    const w = Number(q.photoWidth) || null, h = Number(q.photoHeight) || null;
    const st: PreflightState = { quote, modelName: provider ? modelNameOf(provider, mode) : null };
    if (recipe) {
      st.slots = [...recipe.slots].sort((a, b) => a.order - b.order).map((s) => ({ name: s.name, label: s.label, required: s.required, filled: on(q[s.sendsAs]), missing: s.missing,
        ...(s.sendsAs === 'image' ? { width: w, height: h, fitTo: photoFitOf(recipe, mode, provider) } : {}) }));
      st.minSide = recipe.surface === 'mask' || recipe.surface === 'multi-output' ? 128 : null;
      st.mask = recipe.surface === 'mask' ? { needed: true, painted: on(q.mask) } : null;
      const rw = recipe.prompt.requiredWithout; const imgMissing = recipe.slots.some((s) => s.required && !on(q[s.sendsAs]));
      st.prompt = imgMissing ? null : recipe.prompt.mode === 'required' && !hasPrompt ? { missing: recipe.surface === 'mask' ? 'Describe the change' : 'Write a prompt' } : rw && !on(q[rw.slot]) && !hasPrompt ? { missing: rw.missing } : null;
      if (recipe.surface === 'multi-output') { let ids: unknown[] = []; try { ids = JSON.parse(String(q.shots ?? '[]')); } catch { /* */ } if (q.shots != null && Array.isArray(ids) && !ids.length) st.pick = { group: 'angles', missing: 'Pick at least one angle' }; }
    } else if (t.id === 'create-image') {
      const refs = Number(q.refs) || (on(q.image) ? 1 : 0); const cap = IMAGE_CAPS[provider];
      if (cap && refs) st.images = { count: refs, max: cap.supports.maxRefs };
      if (!hasPrompt) st.prompt = { missing: 'Write a prompt' };
      if (on(q.image) && w && h) st.slots = [{ name: 'image', label: 'Photo', required: false, filled: true, width: w, height: h, fitTo: null }];
    }
    const problems = preflightProblems(st);
    return { ok: problems.length === 0, problems, quote };
  });
}
