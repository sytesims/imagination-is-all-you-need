import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { accountsOf } from './accounts.js';
import { z } from 'zod';
import { gateTools, loadPermissions } from './permissions.js';
import { filterToolsets, enabledToolsets } from './toolsets.js';
import { registerResources } from './resources.js';
import { registerPrompts, instructionsFor, LISTEN_PHRASE } from './prompts.js';
import { annotateTools } from './meta.js';
import { WEB, abs, webLink, get, post, patch, del, submit, waitFor, uploadMedia, currentBudgetId, setBudgetId, budgetLocked, withBudget, sharedBudgetEnabled, ApiError, type Fields } from './api.js';
import { issueQuote, checkQuote, requestHash } from './quotes.js';
import { loadTools, findTool, knownToolIds, catalogSource, fieldSchema, isFileInput, modelCard, limitsOf, runOnPlaces, loadWorkflows, loadSearchWords, COMMON_JOB_FIELDS } from './catalog.js';
import { buildIndex, search, toolModes, type Entry } from './search.js';
import { parseRecipe, recipeToRun } from './recipe.js';

const text = (o: unknown) => ({ content: [{ type: 'text' as const, text: typeof o === 'string' ? o : JSON.stringify(o, null, 2) }] });
/** Errors for agents: the plain message; a budget or spending-limit refusal also carries the numbers and what to do next. */
const fail = (e: unknown) => {
  const b: any = e instanceof ApiError ? e.body : null;
  if (b && typeof b === 'object' && b.errorType === 'limit') return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ refused: true, code: b.code, reason: b.error, charged: false,
    ...(b.code === 'agent_budget' ? { budgetUsd: b.budgetUsd, spentUsd: b.spentUsd, remainingUsd: b.remainingUsd, neededUsd: b.neededUsd, budgetCredits: b.budgetCredits, remainingCredits: b.remainingCredits, neededCredits: b.neededCredits,
      next: 'Nothing was run or charged. Use a cheaper model or run_on ("local" is free), fewer or shorter clips, or finish with what you have (stitch_video, then get_receipt).' } : {}),
    }, null, 2) }] };
  return { isError: true, content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }] };
};
const r2 = (n: number) => Math.round(n * 100) / 100;
/** What to do about a failed / blocked job, by its error type or code (short; the server's message says what happened). */
const nextFor = (j: any): string => {
  const code = String(j.reasonCode ?? j.errorType ?? '');
  if (/agent_budget/.test(code)) return 'Over the agent budget: pick a cheaper model or run_on ("local" is free), or ask the user for a bigger budget.';
  if (/validation|invalid_input|input_invalid/.test(code)) return 'Fix the inputs named in the error and submit again.';
  if (/key_missing|key_invalid|needs_key/.test(code)) return 'The place has no working key: ask the user to add one in Settings, or pick another run_on.';
  if ((j.tryOn ?? []).length) return 'Nothing moves on its own. Submit again with run_on set to one of tryOn (prices listed), or retry the same place later.';
  if (/temporary|timeout|provider_outage|queue_full/.test(code)) return 'Temporary: try the same call again in a minute, or another run_on.';
  return 'Check the error, then submit again (another model or run_on if it repeats).';
};
/**
 * The job view for agents (get_job, wait_for_job, job_status, generate_* replies): the whole truth in a compact shape. sample says plainly
 * when nothing real was generated (and why); model is the real model (name + key); place is where it ran; estimate / actual are the cost.
 */
export const view = (j: any) => {
  const sp = j.spend ?? null; const failed = j.status === 'failed' || j.status === 'blocked';
  const isSample = typeof j.isSample === 'boolean' ? j.isSample : !!j.demo;
  const wf = j.feature?.workflow ?? null;
  return {
    id: j.id, status: j.status, stage: j.stage ?? null, progress: j.percent ?? j.progress ?? null, ...(j.status === 'queued' ? { queuePos: j.queuePos ?? null } : {}), ...(j.eta != null && !TERMINAL.has(j.status) ? { eta: j.eta } : {}),
    ...(j.progressInfo && !TERMINAL.has(j.status) ? { progressInfo: progressView(j.progressInfo) } : {}),
    feature: j.feature?.label ?? null, toolId: j.toolId,
    model: { name: j.modelName ?? j.model ?? null, id: j.modelKey ?? null },
    place: { runOn: j.place?.runOn ?? j.runOn ?? null, label: j.place?.label ?? j.runOnLabel ?? null },
    run_on: j.runOn ?? null, // legacy: same as place.runOn
    sample: isSample, ...(isSample ? { sampleReason: j.sampleReason ?? j.demoNotice?.message ?? j.demoMessage ?? 'This is a sample: nothing was generated and nothing was billed.' } : {}),
    estimate: sp ? { usd: sp.estUsd, billedTo: sp.billedToName ?? sp.billedTo, estimated: !!sp.estimated, ...(sp.estUnits != null ? { [sp.unitLabel === 'Comfy credits' ? 'comfyCredits' : 'providerCredits']: sp.estUnits } : {}) } : null,
    actual: sp?.actualUsd != null ? { usd: sp.actualUsd, source: sp.actualSource ?? null } : null,
    ...(sp?.costText ? { costText: sp.costText, costDetail: sp.costDetail ?? null } : {}), // "Cost $0.75 (quoted $0.76)" / "Cost ≈ $0.76 (estimate)": the app's after-run words
    ...(sp && !isSample && sp.actualUsd == null && j.status === 'done' && sp.billedTo !== 'local' ? { actualNote: 'The provider has not reported a per-run cost; the estimate counts.' } : {}),
    cost: j.cost ?? 0, ...(j.refunded ? { refunded: j.refunded } : {}), seed: j.seed ?? j.input?.seed ?? null, partial: !!j.partial,
    outputs: (j.outputs ?? []).map((o: any) => ({ label: o.label, url: webLink(o.url) })), result_url: webLink(j.outputs?.[0]?.url ?? j.resultUrl ?? null),
    ...(j.diagnostics?.length ? { diagnostics: j.diagnostics.map((d: any) => ({ ...d, url: webLink(d.url) })) } : {}),
    error: j.error ? { message: j.error, code: j.reasonCode ?? j.errorType ?? null, type: j.errorType ?? null, ...(failed ? { next: nextFor(j) } : {}) } : null,
    ...(failed ? { tryOn: (j.tryOn ?? []).map((o: any) => ({ run_on: o.runOn, label: o.runOnLabel, usd: r2((o.demo ? o.listCredits ?? 0 : o.credits ?? 0) / 100), credits: o.credits ?? 0, ...(o.demo ? { sample: true, note: 'no key: would run as a sample' } : {}) })) } : {}),
    ...(wf ? { workflow: { name: wf.name ?? null, source: wf.source ?? null, author: wf.author ?? null, licence: wf.licence ?? wf.license ?? null, url: wf.url ?? null } } : {}),
    ...(j.attribution?.text ? { credit: j.attribution.text } : {}),
    warnings: j.warnings ?? [], ...(j.agent ? { agent: j.agent } : {}), page: `${WEB}/jobs/${j.id}`,
  };
};
const TERMINAL = new Set(['done', 'failed', 'canceled', 'blocked']);
/** Shared progress (server progress.ts), compact for agents while a job is active: stage, step/steps, percent, etaSeconds, queuePosition, source + one line
 *  ("generating · step 3 of 4 · ~12 s left"). The preview image is for the app, so it is left out. */
export const progressView = (p: any) => {
  const out: Record<string, unknown> = { stage: p.stage, source: p.source };
  for (const k of ['step', 'steps', 'percent', 'etaSeconds', 'queuePosition']) if (typeof p[k] === 'number') out[k] = p[k];
  const parts: string[] = [p.stage]; if (p.stage === 'queued' && p.queuePosition) parts.push(`#${p.queuePosition} in line`);
  if (p.step != null && p.steps) parts.push(`step ${p.step} of ${p.steps}`); else if (p.percent != null) parts.push(`${p.percent}%`);
  if (p.etaSeconds) parts.push(`~${p.etaSeconds} s left`); out.line = parts.join(' · '); return out;
};
/** get_job / wait_for_job / job_status: one view; when a wait times out, say so and what to do next. */
async function jobResult(id: string, wait: boolean, timeout_sec: number) {
  const j = wait ? await waitFor(id, timeout_sec) : await get(`/api/jobs/${encodeURIComponent(id)}`);
  const v: any = view(j);
  if (wait && !TERMINAL.has(j.status)) v.next = `Still ${j.status} after ${timeout_sec}s; the job keeps running on the server. Call get_job with id "${j.id}" (or wait_for_job again) to check it. Nothing was canceled.`;
  return { ...text(v), isError: j.status === 'failed' || j.status === 'blocked' };
}

/** One price quote (quote_cost, plan_budget): credits (1 = $0.01), USD, where it is billed, and the agent budget fit when a budget is set. */
async function quoteOne(tool_id: string, params: Record<string, string | number | boolean> = {}) {
  const qs = new URLSearchParams(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)])).toString();
  const image = tool_id === 'create-image' && (params?.model != null || params?.imageResolution != null || params?.n != null);
  const q = image ? await get(`/api/models/quote?${qs}`) : await get(`/api/tools/${encodeURIComponent(tool_id)}/price${qs ? `?${qs}` : ''}`);
  const cfg = await get('/api/config').catch(() => null);
  const credits = Number(q.credits ?? 0);
  const basis: string | null = q.basis ?? null;
  const local = basis === 'open-weights' || q.cost?.billedTo === 'local';
  // prices in dollars (2026-10-26): the same words the app shows. priceUsd = the dollars to show; priceLabel = "≈ $0.76" / "Free · this computer";
  // priceDetail = the provider's own units, plan and price date ("160 Comfy credits · on your Creator plan · price checked 2026-10-26"). credits stays the internal unit (1 = $0.01).
  const priceUsd = local ? 0 : typeof q.cost?.estUsd === 'number' && q.cost.estUsd > 0 ? q.cost.estUsd : Math.round(credits) / 100;
  const priceLabel: string = typeof q.cost?.usdText === 'string' && q.cost.usdText ? q.cost.usdText : local ? 'Free · this computer' : priceUsd > 0 ? `≈ $${priceUsd.toFixed(2)}` : 'Free';
  return { toolId: tool_id, endpoint: image ? '/api/models/quote' : `/api/tools/${tool_id}/price`, priceUsd, priceLabel, priceDetail: q.cost?.detail ?? null, credits, usd: Math.round(credits) / 100, costUsd: q.cost?.estUsd ?? null,
    free: !!q.free || credits === 0, local, localFree: !!cfg?.localFree, basis, billedTo: q.cost?.billedToName ?? null, runnable: q.runnable !== false, blockedReason: q.runnable === false ? q.blockedReason ?? null : null,
    estimated: typeof q.estimated === 'boolean' ? q.estimated : !(basis === 'hosted' || basis === 'open-weights'),
    modelKey: q.modelKey ?? null, runOn: q.runOn ?? null, route: q.route ?? null, draftCredits: q.draftCredits ?? null, breakdown: (q.breakdown ?? []).map((b: any) => b.label), ...(q.resolutionMapped ? { resolution: q.resolutionMapped.to, resolutionMapped: q.resolutionMapped } : {}),
    ...(q.agentBudget ? { agentBudget: q.agentBudget } : {}), raw: q };
}
const money = (n: number | null | undefined) => (n == null ? '-' : `$${n.toFixed(2)}`);
/** The receipt as a short plain-text table (what agents show the user). */
export function receiptText(r: any) {
  const lines = [`Receipt: agent "${r.budget.name}", budget ${money(r.budget.budgetUsd)}`, ''];
  for (const [i, it] of (r.items ?? []).entries()) lines.push(`${String(i + 1).padStart(2)}. ${String(it.toolName).padEnd(16)} ${String(it.model ?? '').replace(/\s*\(.*\)$/, '').slice(0, 20).padEnd(20)} ${String(it.ranOn).padEnd(17)} est ${money(it.demo ? 0 : it.estUsd).padStart(6)}  actual ${(it.actualUsd != null ? money(it.actualUsd) : it.billedTo === 'nobody (free)' ? 'free' : 'n/r').padStart(6)}  ${it.status}${it.demo ? ' (sample, nothing billed)' : ''}`);
  for (const x of r.refusals ?? []) lines.push(`  x  refused ${x.toolId} (${x.model ?? '?'}): needed ${money(x.neededUsd)}, ${money(x.remainingUsd)} left. Nothing sent.`);
  lines.push('', '(n/r = the provider does not report a per-run cost, so the estimate counts.)', `Spent ${money(r.totals.spentUsd)} of ${money(r.totals.budgetUsd)} (${money(r.totals.remainingUsd)} left). Estimated ${money(r.totals.estimatedUsd)}; actual ${r.totals.actualUsd == null ? 'not reported' : `${money(r.totals.actualUsd)} on ${r.totals.actualRuns} run(s)`}.`);
  return lines.join('\n');
}

const common = {
  model: z.string().optional().describe('Model key from list_models (e.g. minimax-h3, ltx-2-19b, nano-banana-2); an old provider id is accepted too. Default = the user\'s own default for this tool (★ Make default in the app), else its recommended cloud default (list_tools: defaultProvider)'),
  run_on: z.string().optional().describe('Where it runs and who bills it: local (runs on this computer), comfy-cloud (Comfy: Comfy Cloud or Comfy Router), fal, replicate, bfl, minimax, ltx, openai, google, byteplus, dashscope or luma. Aliases gpu / comfy accepted. Omit it for the pre-selected place (saved choice, else the first ready place: Comfy, then another API, then Local; nothing ready = nothing pre-selected, the quote lists setupOptions and a job is refused with nothing charged); the legacy value auto means the same. An explicit place stays pinned unless allowFallback is requested. Auto may try another ready place at the same or lower price only after an attempt known not to have charged; a dearer place needs a decision. Never downloads files on its own'),
  provider: z.string().optional().describe('Deprecated: old provider/engine id (e.g. comfy-h3, api-minimax-h3). Use model + run_on'),
  resolution: z.enum(['480p', '720p', '768p', '1080p']).optional().describe('Output tier; MiniMax H3 models take 768p or 480p (720p is mapped to 768p, with a note)'),
  seed: z.number().int().min(0).max(2147483647).optional().describe('Omit for a random seed (returned)'),
  draft: z.boolean().optional().describe('480p draft at ~30% price'),
  use_free: z.boolean().optional().describe('Spend a free gen (≤720p, slower lane)'),
  wait: z.boolean().default(true).describe('Wait for the result (default) or return the job id immediately'),
  timeout_sec: z.number().int().min(1).max(1800).default(180),
};
/** MiniMax H3 resolutions (server videoCaps: 768p default, 480p). Omit for the default. */
export const H3_RESOLUTIONS = ['768p', '720p', '480p'] as const;
const H3_RESOLUTION = z.enum(H3_RESOLUTIONS).optional().describe('MiniMax H3 (incl. cloud-h3-wf): 768p (default) or 480p. 720p is accepted and mapped to 768p (quoted and charged as 768p; the job warnings and quote resolutionMapped say so). Omit to use the default.');
type Common = { model?: string; run_on?: string; provider?: string; resolution?: string; seed?: number; draft?: boolean; use_free?: boolean; wait: boolean; timeout_sec: number };
const media = z.string().describe('Local file path, http(s) URL, or a server path such as /samples/sample-pattern.mp4');

async function run(toolId: string, c: Common, fields: Fields, files: Record<string, string[] | undefined>, extra: Record<string, unknown> = {}) {
  try {
    const s = await submit(toolId, { model: c.model, runOn: c.run_on, provider: c.provider, resolution: c.resolution, seed: c.seed, draft: c.draft, useFree: c.use_free, ...fields }, files);
    const j = c.wait ? await waitFor(s.id, c.timeout_sec) : await get(`/api/jobs/${encodeURIComponent(s.id)}`);
    const v: any = view(j);
    // Never silent: a requested place that can't run for real (no key, sample mode) became a sample. Say it first.
    const notice = v.sample ? `${c.run_on ? `You asked for run_on "${c.run_on}", but this ran as a sample. ` : 'This ran as a sample. '}${v.sampleReason} Tell the user this is a placeholder, not a real result.` : null;
    if (!c.wait) return text({ ...(notice ? { notice } : {}), submitted: { id: s.id, status: j.status }, job: v, ...extra, next: `call wait_for_job (or get_job) with id ${s.id}` });
    const out: any = { ...(notice ? { notice } : {}), ...v, ...extra };
    if (!TERMINAL.has(j.status)) out.next = `Still ${j.status} after ${c.timeout_sec}s; the job keeps running on the server. Call get_job with id "${j.id}" (or wait_for_job) to check it. Do not submit again: that would start a second run.`;
    return { ...text(out), isError: j.status === 'failed' || j.status === 'blocked' };
  } catch (e) { return fail(e); }
}

/** opts.channel (2026-10-28): stdio "channel mode" (index.ts --channel): declares Claude Code's claude/channel capability, so the canvas messages
 *  channel.ts pushes arrive in the session; it always turns the canvas tools on (canvas_say is how Claude answers). */
export function createServer(opts: { http?: boolean; channel?: boolean } = {}) {
  const perms = loadPermissions(); const sets = enabledToolsets(process.env, perms.toolsets, opts.http === true); if (opts.channel) sets.add('canvas');
  const s = new McpServer({ name: 'openhiggsfield', title: 'Imagination Is All You Need', version: '0.1.0' }, {
    instructions: instructionsFor({ canvas: sets.has('canvas'), channel: opts.channel }), ...(opts.channel ? { capabilities: { experimental: { 'claude/channel': {} } } } : {}) }) /* name = the server id clients key on (unchanged); title = the display name */;
  gateTools(s, perms); const legacy = filterToolsets(s, sets); annotateTools(s);

  s.registerTool('list_tools', { title: 'List tools', description: 'Every tool in the studio, read live from the app (so new tools show up here on their own): id, name, media (image, video, audio, 3d), category, what it does, its inputs (required ones marked *), presets, models and the app page. Pass the id to describe_tool for the full field schema, models, limits and prices, then quote_cost and run_tool. q filters by words in the id, name or description.', inputSchema: { media: z.enum(['image', 'video', 'audio', '3d']).optional(), q: z.string().optional().describe('Words to match, e.g. "swap", "loop", "upscale"') } },
    async ({ media: m, q }) => { try { const ts = await loadTools(); const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      return text(ts.filter((t: any) => (!m || t.media === m) && words.every((w) => `${t.id} ${t.name} ${t.description ?? ''} ${t.category ?? ''}`.toLowerCase().includes(w))).map((t: any) => ({ id: t.id, name: t.name, media: t.media, category: t.category ?? t.group ?? null, badge: t.badge, description: t.description,
        inputs: t.inputs?.map((i: any) => (i.required ? `${i.name}*` : i.name)), presets: t.presets?.slice(0, 40).map((p: any) => p.id), models: (t.models ?? []).map((x: any) => x.key), providers: t.providers?.map((p: any) => p.id), defaultProvider: t.defaultProvider, ...(t.favouriteProvider ? { favouriteProvider: t.favouriteProvider } : {}), ...(t.recommendedProvider ? { recommendedProvider: t.recommendedProvider } : {}), page: t.route ? webLink(t.route) : null }))); } catch (e) { return fail(e); } });

  s.registerTool('list_models', { title: 'List models', description: 'Model cards for a tool (one per old provider id `id`, still accepted): `model` (stable key to pass as model), name, licence, and the `run_on` options of that model (where it runs: local GPU, comfy-cloud, fal, replicate…) with status (ready / sample / needs-key / off / not-installed / coming-soon) and price in credits (1 credit = $0.01). `engines` / `id` are the old provider ids (still accepted).', inputSchema: { tool_id: z.string().describe('e.g. create-image, object-swap'), q: z.string().optional() } },
    async ({ tool_id, q }) => { try { const ms = await get(`/api/models?toolId=${encodeURIComponent(tool_id)}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      const list: any[] = Array.isArray(ms) ? ms : ms.groups ? ms.groups.flatMap((g: any) => g.models) : ms.models ?? [];
      const tool = ((await get('/api/tools').catch(() => [])) as any[]).find((t) => t.id === tool_id);
      const models = (tool?.models ?? []).filter((m: any) => !q || `${m.key} ${m.name} ${m.family}`.toLowerCase().includes(q.toLowerCase()))
        .map((m: any) => ({ model: m.key, name: m.displayName ?? m.name, bestFor: m.bestFor ?? null, openWeights: m.openWeights, license: m.license?.name ?? null, state: m.state, fromCredits: m.fromPrice, lifecycle: m.lifecycle, default: m.isDefault,
          run_on: (m.runsOn ?? []).map((r: any) => ({ id: r.id, label: r.label, status: r.status, credits: r.credits,
            // 2026-10-27: a place with several ways to run this model lists each (pass its route to quote / run to pick it; the choice is not remembered from MCP)
            ...(Array.isArray(r.choices) && r.choices.length > 1 ? { routes: r.choices.map((c: any) => ({ route: c.routeId, name: c.name, status: c.status, credits: c.credits, why: c.why || null, limits: c.limits })) } : {}) })), engines: m.engines }));
      // Same array of cards as before (one per old provider id, so existing agents keep working), each now naming its model and that model's run_on options.
      const byKey = new Map(models.map((x: any) => [x.model, x]));
      return text(list.map((m: any) => { const mm: any = byKey.get(m.modelKey); return { id: m.id, model: m.modelKey ?? null, modelName: mm?.name ?? null, name: m.name, kind: m.kind, license: m.license?.name, licenseUrl: m.license?.url, speed: m.speed, quality: m.quality, priceFactor: m.priceFactor, default: m.default,
        run_on: mm?.run_on ?? [], fromCredits: mm?.fromCredits ?? null, limits: limitsOf(m.capabilities ?? m.videoLimits) }; })); } catch (e) { return fail(e); } });

  s.registerTool('generate_image', { title: 'Create image', description: 'Create Image: text to image, or Edit Image (mode "edit" with image). Optional Camera & Lens rig (camera_body, lens, focal, aperture, film, lighting, era; lists on GET /api/image-features → camera) adds a camera sentence to the prompt on any model. The result names its feature and real model ("Edit Image · Nano Banana 2") and the ComfyUI workflow it is credited with (GET /api/image-features lists each feature, its models, what each supports and its workflow source).', inputSchema: {
    prompt: z.string(), mode: z.enum(['generate', 'edit']).default('generate'), image: media.optional(),
    camera_body: z.string().optional().describe('Camera & Lens: e.g. digital-s35, film-35mm, disposable (see /api/image-features → camera-lens)'), lens: z.string().optional().describe('e.g. modern-prime, classic-anamorphic'),
    focal: z.number().int().optional().describe('Focal length in mm: 8, 14, 24, 35, 50, 85, 135 or 200'), aperture: z.enum(['0.95', '1.4', '2', '2.8', '4', '5.6', '8', '11', '16']).optional(),
    film: z.string().optional().describe('Film stock id, e.g. portra-400, vision3-500t, tri-x-400'), lighting: z.string().optional().describe('e.g. golden-hour, rembrandt, neon'), era: z.string().optional().describe('e.g. 1970s, 1990s, today'), ...common } },
    async (a) => run('create-image', a, { prompt: a.prompt, types: JSON.stringify([a.mode]), cameraBody: a.camera_body, lens: a.lens, focal: a.focal, aperture: a.aperture, film: a.film, lighting: a.lighting, era: a.era }, { image: a.image ? [a.image] : undefined }));

  s.registerTool('generate_soul', { title: 'Photo with a look (Z-Image-Turbo + look LoRAs, legacy)', description: 'Legacy look recipe on Z-Image-Turbo with community look LoRAs: realistic photo with one of 22 looks (preset), optional character consistency from 1–3 reference photos, colour match (reference image or HEX palette, strength 0.3–0.7), aspect, batch 1 or 4, optional upscale. Price first with quote_cost tool_id "soul" (local = 0 credits).', inputSchema: {
    prompt: z.string(), preset: z.string().optional().describe('Look id from list_tools → soul presets, e.g. polaroid, flash-editorial, retro-bw'), enhance: z.boolean().optional(),
    refs: z.array(media).max(3).optional().describe('Character reference photos'), engine: z.enum(['auto', 'pulid', 'infiniteyou', 'aceplus', 'qwen-edit']).optional(),
    ref_kind: z.enum(['face', 'subject']).optional(), likeness: z.enum(['balanced', 'max']).optional(),
    colour_ref: media.optional(), colour_hex: z.array(z.string().regex(/^#?[0-9a-fA-F]{6}$/)).min(1).max(5).optional(), colour_strength: z.number().min(0.3).max(0.7).optional(), colour_method: z.enum(['reinhard_lab', 'mkl_lab', 'histogram']).optional(),
    aspect: z.enum(['1:1', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9']).optional(), n: z.union([z.literal(1), z.literal(4)]).optional(), upscale: z.enum(['off', 'x2', 'x4']).optional(),
    route: z.string().optional().describe('Hosted route, e.g. fal:fal-ai/z-image/turbo/lora (provider cost); omit for local'), ...common } },
    async (a) => run('soul', a, { prompt: a.prompt, preset: a.preset, enhance: a.enhance ? '1' : undefined, engine: a.engine, refKind: a.ref_kind, likeness: a.likeness,
      colourHex: a.colour_hex?.join(','), colourStrength: a.colour_strength, colourMethod: a.colour_method, aspect: a.aspect, n: a.n, upscale: a.upscale, route: a.route },
      { refs: a.refs, colourRef: a.colour_ref ? [a.colour_ref] : undefined }));

  s.registerTool('generate_video', { title: 'Generate video', description: 'Generate Video (MiniMax H3 or other providers): text-to-video, image-to-video or reference-to-video, with audio.', inputSchema: {
    prompt: z.string(), mode: z.enum(['t2v', 'i2v', 'r2v']).default('t2v'), image: media.optional(), duration: z.number().optional(), ...common,
    resolution: H3_RESOLUTION } },
    async (a) => run('h3-video', a, { prompt: a.prompt, types: JSON.stringify([a.mode]), duration: a.duration }, { image: a.image ? [a.image] : undefined }));

  // Story tools kept for compatibility: Director (and its Story board) was removed from the web app on 2026-10-23; /api/stories still runs them.
  s.registerTool('create_story', { title: 'Create story (multi-shot)', description: 'Multi-shot story on MiniMax H3 (kept for compatibility; no page in the web app): 2–12 connected shots with sound, each shot starting from the previous shot’s last frame (set continue:false to cut), the same cast in every shot, then ONE stitched film (short crossfades). Quotes first (total = sum of the shot quotes × takes); budget_usd is enforced by the server on the total before anything runs. This session\'s agent budget (set_budget) is also checked on the total before any shot runs, and every shot counts toward it (get_budget, get_receipt). If shot k fails, finished shots are kept: call retry_story.', inputSchema: {
    shots: z.array(z.object({ prompt: z.string().describe('What happens in this shot. @name tags a saved element'), duration: z.number().int().optional().describe('Seconds (see /api/stories/options durations; default 5)'),
      cameras: z.array(z.string()).max(4).optional().describe('Camera move ids in order, e.g. ["dolly-in","orbit"] (GET /api/cinema/moves)'), continue: z.boolean().optional().describe('Start from the previous shot’s last frame (default true)') })).min(2).max(12),
    title: z.string().optional(), cast: z.array(z.string()).max(4).optional().describe('Saved elements by @name or id: passed to every shot'), cast_images: z.array(media).max(4).optional().describe('Cast images (uploaded for you)'),
    model: z.string().optional().describe('Default minimax-h3'), run_on: common.run_on, aspect: z.enum(['16:9', '9:16', '1:1']).optional(), resolution: H3_RESOLUTION, audio: z.boolean().optional().describe('Sound on (default)'),
    style: z.string().optional().describe('Look applied to every shot'), crossfade: z.number().min(0).max(0.5).optional(), takes: z.number().int().min(1).max(4).optional(),
    budget_usd: z.number().min(0).optional().describe('Refuse the story if its estimated total is over this (USD, server-enforced). An extra cap on this one story, on top of the session budget'), wait: common.wait, timeout_sec: z.number().int().min(1).max(3600).default(900) } },
    async (a) => {
      try {
        const castUrls: string[] = []; for (const c of a.cast_images ?? []) { const u: any = await uploadMedia(c); castUrls.push(u.url ?? u.items?.[0]?.url); }
        const spec = { title: a.title, shots: a.shots, cast: a.cast, castUrls, model: a.model, runOn: a.run_on, aspect: a.aspect, resolution: a.resolution, audio: a.audio, style: a.style, crossfade: a.crossfade, takes: a.takes, maxUsd: a.budget_usd };
        const q = await post('/api/stories/quote', spec);
        if (!q.ok) return fail(new Error(`${q.error} Nothing was charged.`.replace(/(Nothing was charged\.)\s*Nothing was charged\./, '$1')));
        const c = await post('/api/stories', { ...spec, quotedCredits: q.total.credits });
        const brief = (st: any) => ({ id: st.id, status: st.status, stage: st.stage, error: st.error, failedAt: st.failedAt, film: webLink(st.resultUrl), seconds: st.stitch?.seconds ?? null, credit: st.attribution?.text ?? null,
          shots: st.shots.map((x: any) => ({ index: x.index, mode: x.mode, status: x.status, job: x.jobId, url: webLink(x.resultUrl), error: x.error })), page: `${WEB}/jobs/${st.id}` /* the story's own job page (Director's page was removed) */ });
        const cost = { credits: q.total.credits, estUsd: q.total.estUsd, realRunUsd: q.total.realRunUsd, demo: q.total.demo, byAccount: q.byAccount };
        if (!a.wait) return text({ submitted: c.ids, cost, next: 'call story_status with the id' });
        const end = Date.now() + a.timeout_sec * 1000; const out: any[] = [];
        for (const id of c.ids as string[]) { let st: any; do { st = await get(`/api/stories/${id}`); if (st.status !== 'running') break; await new Promise((r) => setTimeout(r, 2000)); } while (Date.now() < end); out.push(brief(st)); }
        return { ...text({ stories: out, cost }), isError: out.some((x) => x.status === 'failed') };
      } catch (e) { return fail(e); }
    });
  s.registerTool('story_status', { title: 'Story status', description: 'Status of a story from create_story: per-shot status and outputs, the stitched film.', inputSchema: { id: z.string() } },
    async ({ id }) => { try { return text(await get(`/api/stories/${encodeURIComponent(id)}`)); } catch (e) { return fail(e); } });
  s.registerTool('retry_story', { title: 'Retry story', description: 'Resume a failed story from shot `from` (default the failed one); finished shots are kept. Optionally replace the prompt of the re-run shots. Re-quoted first; spending limits and this session\'s agent budget apply.', inputSchema: {
    id: z.string(), from: z.number().int().min(1).optional(), to: z.number().int().min(1).optional().describe('Last shot to re-run (default: to the end)'), prompts: z.record(z.string()).optional().describe('{"2":"new prompt for shot 2"}') } },
    async (a) => { try { return text(await post(`/api/stories/${encodeURIComponent(a.id)}/retry`, { from: a.from, to: a.to, shots: Object.entries(a.prompts ?? {}).map(([k, v]) => ({ index: Number(k), prompt: v })) })); } catch (e) { return fail(e); } });

  s.registerTool('generate_audio', { title: 'Generate audio', description: 'Audio: music, sound effects or voice. Pass video to add a soundtrack to a clip instead.', inputSchema: {
    prompt: z.string(), mode: z.enum(['music', 'sfx', 'voice']).default('music'), duration: z.number().optional(), video: media.optional().describe('Optional: add the audio to this video (Add soundtrack)'),
    mix: z.enum(['replace', 'blend']).optional(), ...common } },
    async (a) => a.video
      ? run('soundtrack', a, { prompt: a.prompt, types: JSON.stringify([a.mode === 'voice' ? 'music' : a.mode]), mix: a.mix }, { video: [a.video] })
      : run('audio', a, { prompt: a.prompt, types: JSON.stringify([a.mode]), duration: a.duration }, {}));

  const swap = { video: media, refs: z.array(media).max(30).describe('Reference images; >8 are split into even groups, one output each'), prompt: z.string().optional(), preset: z.string().optional(),
    pinned: z.array(z.number().int().min(0)).optional().describe('0-based ref indexes to include in every group'), ...common };
  s.registerTool('upload_media', { title: 'Upload media', description: 'Upload a local file or URL (PNG, JPG, WEBP, MP4, MOV, WEBM, WAV, MP3, M4A) to the media library. Returns a /files/… URL you can pass as a media input to any tool.', inputSchema: { file: media } },
    async (a) => { try { return text(await uploadMedia(a.file)); } catch (e) { return fail(e); } });
  s.registerTool('object_swap', { title: 'Object / Person Swap', description: 'Replace an object or person in a clip. Available models, input limits and route status come from describe object-swap; preservation depends on the model.', inputSchema: { ...swap, target: z.string().optional().describe('Who/what to replace') } },
    async (a) => run('object-swap', a, { prompt: a.prompt, preset: a.preset, target: a.target, pinned: a.pinned ? JSON.stringify(a.pinned) : undefined }, { video: [a.video], refs: a.refs }));
  s.registerTool('motion_transfer', { title: 'Motion Transfer', description: 'Generate a new performance guided by a driving video and references, not an exact source-scene edit. Seedance uses automatic task classification and adaptive framing; exact timing/camera are not guaranteed. H3 Character Swap is unavailable here: use Object / Person Swap for replacement.', inputSchema: swap },
    async (a) => run('motion-transfer', a, { prompt: a.prompt, preset: a.preset, pinned: a.pinned ? JSON.stringify(a.pinned) : undefined }, { video: [a.video], refs: a.refs }));
  s.registerTool('restyle', { title: 'Restyle', description: 'Redraw a whole clip in a style (preset required unless custom_style). Up to 30 character refs (groups of ≤8).', inputSchema: {
    video: media, preset: z.string().optional().describe('Style id, e.g. watercolor, anime-cel (list_tools → restyle presets)'), custom_style: z.boolean().optional(), prompt: z.string().optional(),
    refs: z.array(media).max(30).optional(), ...common } },
    async (a) => run('restyle', a, { prompt: a.prompt, preset: a.preset, customStyle: a.custom_style }, { video: [a.video], refs: a.refs }));

  s.registerTool('quote_cost', { title: 'Quote cost', description: 'Price a run before starting it: priceUsd and priceLabel (the dollars to show the user, e.g. "≈ $0.76"; priceDetail has the provider\'s own units), credits (internal unit, 1 = $0.01), USD, whether it is free or runs locally at no cost, and whether the price is an estimate. Spends nothing. Create Image uses the model quote (model, quality, imageResolution, n, aspect, refs, mode); other tools use resolution, duration, model, runOn, passes, types. model = a model key from list_models (old provider ids still work); runOn = local | comfy-cloud | fal | replicate | … (omit it, or the legacy auto, for the pre-selected place); the reply names modelKey, runOn, runOnLabel and route.', inputSchema: {
    tool_id: z.string().describe('Tool id from list_tools, e.g. object-swap, h3-video, create-image'),
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}).describe('Query params, e.g. {"resolution":"768p","duration":10,"model":"minimax-h3","runOn":"fal"} or for create-image {"model":"nano-banana-2","n":2}. A video input: width, height (the clip pixels), seconds and fit (pad = keep everything, the default; crop; off): the quote videoFit says how the clip is adjusted for the model, free, before upload (send the same fit when you run it)') } },
    async ({ tool_id, params }) => { try { return text(await quoteOne(tool_id, params)); } catch (e) { return fail(e); } });

  s.registerTool('preflight', { title: 'Pre-flight check', description: 'Before a run: every problem that would stop it, ordered inputs → model → setup → money, each with one fix {kind, label, args} (the same list the Create bar shows on Generate). Codes: photo_missing, photo_too_small, photo_shape (fix fit-photo / crop-photo {slot, aspect}: fit or crop the photo to that aspect, upload it, then run), too_many_images (use-first {n}), mask_missing, prompt_missing, pick_missing, model_cant_run, price_unavailable, needs_key, needs_download, needs_gpu, needs_node, needs_setup, over_limit. ok:true = it can run. Also returns the quote (same as quote_cost). Spends nothing.', inputSchema: {
    tool_id: z.string().describe('Tool id, e.g. app-character-sheet, app-face-swap, create-image'),
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}).describe('The quote params plus image=1 / face=1 for photos you will send, photoWidth / photoHeight (the main photo), hasPrompt=1, mask=1, e.g. {"provider":"comfy-flux3-klein","image":1,"photoWidth":1080,"photoHeight":1920}') } },
    async ({ tool_id, params }) => { try { const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString(); return text(await get(`/api/tools/${encodeURIComponent(tool_id)}/preflight${qs ? `?${qs}` : ''}`)); } catch (e) { return fail(e); } });

  // ---- Agent budgets + the ad workflow (server/src/agentBudget.ts; docs/MCP.md "Make a 20-second ad with a $2 budget") ----
  s.registerTool('set_budget', { title: 'Set budget', description: 'Start a spending budget for this agent session. The Imagination Is All You Need server enforces it: every later quote and run from this connection is checked, and a run that would go over is refused BEFORE anything is sent to a provider (nothing is charged). Call this first whenever the user gives you a budget ("under $2"). Local / your-GPU runs cost $0 and always fit. Typical flow: set_budget, plan_budget, generate_* (with model + run_on), stitch_video, get_receipt. budget_usd is real money on the user\'s own provider accounts; budget_credits is for team mode (1 credit = $0.01). Replaces this session\'s previous budget, unless the user pinned one when starting the server.', inputSchema: {
    name: z.string().min(1).max(60).describe('Your agent name, shown to the user in Spend and on results as "Agent: <name>", e.g. "Claude"'),
    budget_usd: z.number().min(0).max(100000).optional().describe('Budget in US dollars, e.g. 2 for $2.00'),
    budget_credits: z.number().int().min(0).optional().describe('Team mode only: budget in credits') } },
    async ({ name, budget_usd, budget_credits }) => {
      try {
        if (budgetLocked()) { const id = await currentBudgetId(); const v = id ? await get(`/api/agent/budgets/${id}`) : null; return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ refused: true, reason: 'The user set this session\'s budget when starting the MCP server, so it can\'t be changed from here. Work within it (get_budget shows what is left).', budget: v }, null, 2) }] }; }
        if (budget_usd == null && budget_credits == null) return fail(new Error('Give budget_usd (e.g. 2) or budget_credits.'));
        const b = await post('/api/agent/budgets', { name, budgetUsd: budget_usd, budgetCredits: budget_credits, client: 'openhiggsfield-mcp' }); setBudgetId(b.id);
        return text({ ...b, note: 'Budget active for this session. Quotes now show agentBudget.fits; runs over the budget are refused with nothing charged.' });
      } catch (e) { return fail(e); }
    });
  s.registerTool('get_budget', { title: 'Get budget', description: 'The current agent budget: budgetUsd, spentUsd, remainingUsd (credits in team mode), runs and refusals so far. Spent counts the provider\'s actual cost when it reports one, else the estimate; local runs are $0. Returns budget:null when none is set.', inputSchema: { budget_id: z.string().optional().describe('Another budget id; default = this session\'s') } },
    async ({ budget_id }) => { try { const id = budget_id ?? await currentBudgetId(); return text(id ? await get(`/api/agent/budgets/${encodeURIComponent(id)}`) : { budget: null, note: 'No budget set. Call budget {action:"set"} (legacy: set_budget), or pass budget_id.' }); } catch (e) { return fail(e); } });
  s.registerTool('plan_budget', { title: 'Plan budget', description: 'Price a whole plan before running anything: one quote per step (same params as quote_cost) with its USD cost, where it is billed, the running total, and whether the plan fits the remaining budget. Spends nothing. Use it to choose models and run_on so the total fits ("local" = $0 on the user\'s GPU). Example steps: [{"label":"product shot","tool_id":"create-image","params":{"model":"comfy-qwen21"}}, {"label":"clip 1","tool_id":"h3-video","params":{"model":"minimax-h3","runOn":"comfy-cloud","duration":6,"types":"[\\"i2v\\"]","image":1}}, {"label":"music","tool_id":"audio","params":{"types":"[\\"music\\"]","duration":20}}]. Stitching (stitch_video) is local and free, so it needs no step.', inputSchema: {
    steps: z.array(z.object({ label: z.string().optional(), tool_id: z.string(), params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}) })).min(1).max(30) } },
    async ({ steps }) => {
      try {
        const id = await currentBudgetId(); const b = id ? await get(`/api/agent/budgets/${id}`) : null; let total = 0; const out: any[] = [];
        for (const [i, st] of steps.entries()) {
          try { const q = await quoteOne(st.tool_id, st.params); const usd = q.costUsd ?? q.usd; total = Math.round((total + (q.runnable ? usd : 0)) * 10000) / 10000;
            out.push({ step: i + 1, label: st.label ?? st.tool_id, tool_id: st.tool_id, usd, credits: q.credits, local: q.local, billedTo: q.local ? 'nobody (Local, free)' : q.billedTo, modelKey: q.modelKey, runOn: q.runOn, runnable: q.runnable, blockedReason: q.runnable ? null : q.blockedReason, cumulativeUsd: total,
              fitsBudget: b?.remainingUsd == null ? null : total <= b.remainingUsd + 1e-9 }); }
          catch (e) { out.push({ step: i + 1, label: st.label ?? st.tool_id, tool_id: st.tool_id, error: e instanceof Error ? e.message : String(e) }); }
        }
        return text({ steps: out, totalUsd: total, budget: b ? { budgetUsd: b.budgetUsd, spentUsd: b.spentUsd, remainingUsd: b.remainingUsd } : null,
          fits: b?.remainingUsd == null ? null : total <= b.remainingUsd + 1e-9, overByUsd: b?.remainingUsd == null ? null : Math.max(0, Math.round((total - b.remainingUsd) * 10000) / 10000),
          note: 'Estimates (list price x units). Each run is checked again when it is submitted.' });
      } catch (e) { return fail(e); }
    });
  const JOB_DESC = 'Returns: status, progress, progressInfo while active ({stage queued|loading|generating|finishing, step/steps, percent, etaSeconds, queuePosition, source, line}), feature ("Relight · Nano Banana 2"), model {name, id}, place {runOn, label e.g. "Comfy · Comfy Router"}, sample (true = a placeholder: nothing was generated or billed; sampleReason says why, tell the user), estimate {usd, billedTo, comfyCredits?}, actual {usd} when the provider reported it, outputs + result_url, error {message, code, next} and, on failure, tryOn (other ready places with prices: submit again with that run_on). Also workflow (source credit) and credit (licence line) when present.';
  s.registerTool('get_job', { title: 'Get job', description: `A job's state now, or with wait:true once it finishes (done, failed, canceled or blocked) or timeout_sec passes. Use the id from a generate_* call. ${JOB_DESC} On a wait timeout the job keeps running: call get_job again later.`, inputSchema: {
    id: z.string(), wait: z.boolean().default(false).describe('Wait until it finishes (polls with backoff)'), timeout_sec: z.number().int().min(1).max(1800).default(300).describe('Only with wait:true') } },
    async ({ id, wait, timeout_sec }) => { try { return await jobResult(id, wait, timeout_sec); } catch (e) { return fail(e); } });
  s.registerTool('wait_for_job', { title: 'Wait for job', description: `Wait until a job finishes (done, failed, canceled or blocked) or the timeout passes; same as get_job with wait:true. Use after generate_* with wait:false, e.g. to run several clips in parallel. ${JOB_DESC} On timeout the reply has next: the job keeps running, call get_job with the id later.`, inputSchema: { id: z.string(), timeout_sec: z.number().int().min(1).max(1800).default(300) } },
    async ({ id, timeout_sec }) => { try { return await jobResult(id, true, timeout_sec); } catch (e) { return fail(e); } });
  const card = z.object({ text: z.string().max(120).optional().describe('The words. End card default: "Imagination is all you need."'), style: z.enum(['clean', 'bold', 'quiet', 'lower']).optional().describe('clean (default), bold (big capitals, orange line), quiet (small spaced capitals), lower (a lower third with an orange bar)'),
    mode: z.enum(['black', 'over']).optional().describe('black (default): its own card on black, adds its length; over: laid over the first (title) or last (end card) clip'), sec: z.number().min(1).max(6).optional().describe('How long it shows, default 2.5 s') });
  s.registerTool('stitch_video', { title: 'Stitch video', description: 'Join video clips in order into one video, a small editor on the user\'s computer (ffmpeg, free, $0, listed on the receipt). Sound: a music bed (trimmed to the video, faded at the end, music_loop to fill), a voice track from 0 s and keep_clip_audio for the clips\' own sound; every track is levelled, music and clip sound dip under the voice (duck, on by default) and the film lands on -14 LUFS (normalize, on by default), so a quiet voice still sits on top; music_volume / voice_volume / clip_volume are gains on the levelled tracks (1 = balanced). transition: cut (default), crossfade or dip (to black), each joint shortening the film by transition_sec. title_card / end_card: text cards on black or over the first / last clip, with fades (end_card {} = "Imagination is all you need."). aspect + fit reframes ("9:16", "1:1", "16:9"; fit = whole picture with bars, fill = crop at crop_x / crop_y, blur = whole picture on a blurred fill; without fit the result is centre-cropped). fade_video fades picture and sound to black at the end. layout "side-by-side" shows 2 clips next to each other (a before/after). clips = video job ids (or /files/ URLs); music / voice = audio job ids (or /files/ URLs). trims cuts each clip to an in/out range (seconds, clamped). The result is a new job in the user\'s Assets; the reply has durationSec, loudness and warnings.', inputSchema: {
    clips: z.array(z.string()).min(1).max(20).describe('Video job ids (or /files/ URLs), in play order'), music: z.string().optional().describe('Audio job id or /files/ URL for the music bed'),
    voice: z.string().optional().describe('Audio job id or /files/ URL for a voiceover / dialogue track, laid from the start over the music'),
    music_volume: z.number().min(0).max(2).optional().describe('Music gain on the levelled track, 0–2 (default 0.6 with a voice or clip sound, else 1)'),
    voice_volume: z.number().min(0).max(2).optional().describe('Voice gain, 0–2 (default 1)'), clip_volume: z.number().min(0).max(2).optional().describe('Clip sound gain, 0–2 (default 1; needs keep_clip_audio)'),
    duck: z.boolean().optional().describe('Music and clip sound dip under the voice. Default true'), duck_amount: z.number().min(0).max(1).optional().describe('How far they dip, 0–1 (default 0.6, about 11 dB)'),
    normalize: z.boolean().optional().describe('Level every track and set the film to -14 LUFS (streaming loudness). Default true'), music_loop: z.boolean().optional().describe('Loop music that is shorter than the video. Default false'),
    keep_clip_audio: z.boolean().optional().describe('Keep each clip\'s own sound (dialogue, ad audio), joined in order under the music and voice. Default false: only music / voice'),
    transition: z.enum(['cut', 'crossfade', 'dip']).optional().describe('Between clips: cut (default), crossfade, or dip to black'), transition_sec: z.number().min(0.1).max(5).optional().describe('Transition length, default 0.5 s (capped at 45% of the shortest clip)'),
    title_card: card.optional().describe('A title at the start, e.g. {"text": "Terracotta mug", "style": "bold", "mode": "over"}'), end_card: card.optional().describe('An end card, e.g. {} for "Imagination is all you need." on black'),
    layout: z.enum(['sequence', 'side-by-side']).optional().describe('sequence (default) joins clips one after another; side-by-side puts exactly 2 clips next to each other'),
    aspect: z.string().regex(/^\d{1,2}:\d{1,2}$/).optional().describe('Output shape, e.g. "9:16", "1:1", "16:9"'), fit: z.enum(['fit', 'fill', 'blur']).optional().describe('With aspect: fit (bars), fill (crop), blur (blurred fill). Without it the result is centre-cropped'),
    crop_x: z.number().min(0).max(1).optional().describe('fill: where the frame sits across the clip, 0 = left, 0.5 = centre (default), 1 = right'), crop_y: z.number().min(0).max(1).optional().describe('fill: 0 = top, 0.5 = centre, 1 = bottom'),
    title: z.string().max(200).optional().describe('Title shown in Assets, e.g. "Mug ad, 18 s"'), fade_out_sec: z.number().min(0).max(5).optional().describe('Music fade-out at the end, default 1 s'),
    fade_video: z.boolean().optional().describe('Also fade the picture and every sound to black over fade_out_sec at the end. Default false: only the music fades'),
    trims: z.array(z.object({ in: z.number().min(0).optional(), out: z.number().positive().optional() }).nullable()).max(20).optional().describe('Per clip, in clip order: the part to keep in seconds, e.g. [{in: 0.5, out: 3}, null, {out: 2}] (null = the whole clip). Clamped to each clip\'s length') } },
    async ({ clips, music, voice, music_volume, voice_volume, clip_volume, duck, duck_amount, normalize, music_loop, keep_clip_audio, transition, transition_sec, title_card, end_card, layout, aspect, fit, crop_x, crop_y, title, fade_out_sec, fade_video, trims }) => {
      try { const r = await post('/api/compose', { clips, audio: music, voice, musicVolume: music_volume, voiceVolume: voice_volume, clipVolume: clip_volume, duck, duckAmount: duck_amount, normalize, musicLoop: music_loop, keepClipAudio: keep_clip_audio,
        transition, transitionSec: transition_sec, titleCard: title_card, endCard: end_card, layout, aspect, fit, cropX: crop_x, cropY: crop_y, title, fadeOutSec: fade_out_sec, videoFade: fade_video, trims });
      return text({ ...r, outputs: (r.outputs ?? []).map((o: any) => ({ label: o.label, url: webLink(o.url) })), result_url: webLink(r.resultUrl), page: `${WEB}/jobs/${r.id}` }); } catch (e) { return fail(e); } });
  s.registerTool('get_receipt', { title: 'Get receipt', description: 'Itemised receipt for this agent session: every run (tool, model, where it ran, estimated vs actual cost, status, result URLs), refused runs, and the total spent vs the budget. Show the first text block to the user at the end.', inputSchema: { budget_id: z.string().optional().describe('Default = this session\'s budget') } },
    async ({ budget_id }) => {
      try {
        const id = budget_id ?? await currentBudgetId(); if (!id) return fail(new Error('No budget is set in this session, so there is no receipt. Call set_budget first.'));
        const r = await get(`/api/agent/budgets/${encodeURIComponent(id)}/receipt`);
        const items = r.items.map((i: any) => ({ ...i, outputs: i.outputs.map((o: any) => ({ label: o.label, url: webLink(o.url) })), page: `${WEB}/jobs/${i.jobId}` }));
        return { content: [{ type: 'text' as const, text: receiptText(r) }, { type: 'text' as const, text: JSON.stringify({ ...r, items }, null, 2) }] };
      } catch (e) { return fail(e); }
    });

  s.registerTool('job_status', { title: 'Job status (deprecated)', description: 'Deprecated alias of get_job (same arguments, same reply). Use get_job.', inputSchema: { id: z.string(), wait: z.boolean().default(false), timeout_sec: z.number().int().min(1).max(1800).default(120) } },
    async ({ id, wait, timeout_sec }) => { try { return await jobResult(id, wait, timeout_sec); } catch (e) { return fail(e); } });

  s.registerTool('get_asset', { title: 'Get asset', description: 'A finished result: output URLs, seed, and support details. include_image=true inlines a PNG/JPG output.', inputSchema: { id: z.string(), include_image: z.boolean().default(false) } },
    async ({ id, include_image }) => {
      try {
        const j = await get(`/api/jobs/${id}`); const sup = await get(`/api/jobs/${id}/support`).catch(() => null);
        const out: any[] = [{ type: 'text', text: JSON.stringify({ ...view(j), prompt: j.input?.prompt ?? null, preset: j.input?.preset ?? null, support: sup?.text ?? null }, null, 2) }];
        const img = (j.outputs ?? []).find((o: any) => /\.(png|jpe?g|webp)$/i.test(o.url));
        if (include_image && img) { const r = await fetch(abs(img.url)!); const b = Buffer.from(await r.arrayBuffer()); if (b.length < 4_000_000) out.push({ type: 'image', data: b.toString('base64'), mimeType: r.headers.get('content-type') || 'image/png' }); }
        for (const o of j.outputs ?? []) out.push({ type: 'resource_link', uri: webLink(o.url)!, name: o.label, mimeType: /\.png$/i.test(o.url) ? 'image/png' : /\.m4a$/i.test(o.url) ? 'audio/mp4' : /\.gif$/i.test(o.url) ? 'image/gif' : 'video/mp4' });
        return { content: out };
      } catch (e) { return fail(e); }
    });
  // ---- core toolset: ten tools driven by the server's own catalogue (catalog.ts). New tools, models and workflows show up in
  //      search_capabilities / describe and run through run with no new MCP tool. Other toolsets: library, admin, canvas, legacy (toolsets.ts). ----
  const quoteBrief = (q: Awaited<ReturnType<typeof quoteOne>>) => ({ priceUsd: q.priceUsd, priceLabel: q.priceLabel, credits: q.credits, usd: q.costUsd ?? q.usd, free: q.free, local: q.local, billedTo: q.local ? 'nobody (Local, free)' : q.billedTo, modelKey: q.modelKey, runOn: q.runOn, route: q.route, estimated: q.estimated, runnable: q.runnable,
    ...(q.blockedReason ? { blockedReason: q.blockedReason } : {}), ...(q.breakdown?.length ? { breakdown: q.breakdown } : {}), ...(q.resolutionMapped ? { resolutionMapped: q.resolutionMapped } : {}), ...(q.agentBudget ? { agentBudget: q.agentBudget } : {}) });
  /** Job fields → price query params (arrays as JSON, actual media counts, and the same explicit option precedence as submit). */
  const priceParams = (fields: Record<string, unknown>, media: Record<string, string[]>, model?: string, run_on?: string, draft?: boolean, videoRef?: string, toolId?: string) => {
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) if (v != null && v !== '') p[k] = Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
    for (const [f, values] of Object.entries(media)) if (values.length) p[f] = String(values.length);
    let types: unknown = fields.types; try { if (typeof types === 'string') types = JSON.parse(types); } catch { /* plain mode */ }
    const mode = String(fields.mode ?? (Array.isArray(types) ? types[0] ?? '' : types ?? ''));
    if (toolId === 'create-image') {
      // Image quotes take the total reference count (main photo + extra refs), not just the extra upload slot.
      p.refs = String((media.image?.length ?? 0) + (media.refs?.length ?? 0));
      if (!p.mode && mode) p.mode = mode;
    }
    if (toolId === 'h3-video' && mode === 'r2v') p.refs = String((media.image?.length ?? 0) + (media.presenterImage?.length ?? 0) + (media.refs?.length ?? 0));
    if (videoRef && /^\/(files|samples)\//.test(videoRef)) p.videoPath = videoRef; // the app prices a per-second video tool from the clip's real length
    if (model) p.model = model; if (run_on) p.runOn = run_on; if (draft !== undefined) p.draft = draft ? '1' : '0'; return p;
  };
  /** Split fields into form values and media (by the tool's own input kinds); note names the tool doesn't list (still sent: e.g. loop, videoPreset). */
  const splitFields = (t: any, fields: Record<string, unknown>, files: Record<string, string[]> = {}) => {
    const inputs = new Map<string, any>((t.inputs ?? []).map((i: any) => [i.name, i])); const form: Record<string, unknown> = {}; const media: Record<string, string[]> = { ...files }; const unlisted: string[] = [];
    for (const [k, v] of Object.entries(fields ?? {})) {
      const i = inputs.get(k);
      if (isFileInput(i)) { media[k] = [...(media[k] ?? []), ...(Array.isArray(v) ? v.map(String) : [String(v)])]; continue; }
      if (!i && !(k in COMMON_JOB_FIELDS)) unlisted.push(k);
      form[k] = v;
    }
    for (const k of Object.keys(files)) if (!inputs.has(k)) unlisted.push(k);
    return { form, media, unlisted };
  };
  const formOf = (form: Record<string, unknown>): Fields => Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Array.isArray(v) || (v && typeof v === 'object') ? JSON.stringify(v) : (v as any)]));
  const words = (q?: string) => (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  /** One card per model key across all tools: real name, maker, open weights, licence, the tools that use it, cheapest price, whether it runs locally. */
  const modelIndex = (ts: any[]) => {
    const byKey = new Map<string, any>();
    for (const t of ts) for (const m of t.models ?? []) {
      const c = byKey.get(m.key) ?? { model: m.key, name: m.displayName ?? m.name, maker: m.makerName ?? null, openWeights: !!m.openWeights, license: m.license?.name ?? null, bestFor: m.bestFor ?? null, tools: [] as string[], fromCredits: null as number | null, local: false };
      c.tools.push(t.id); if (m.fromPrice != null) c.fromCredits = c.fromCredits == null ? m.fromPrice : Math.min(c.fromCredits, m.fromPrice);
      if ((m.runsOn ?? []).some((r: any) => r.id === 'local')) c.local = true; byKey.set(m.key, c);
    }
    return [...byKey.values()];
  };
  /** How to run a workflow with run. */
  const workflowRun = (w: any) => w.run !== undefined ? w.run : w.area === 'video' ? { tool_id: w.toolId, fields: { [w.field ?? 'videoPreset']: w.id, prompt: '…' } }
    : w.area === 'audio' && w.mode ? { tool_id: w.toolId, fields: { types: [w.mode], prompt: '…' } } : w.area === '3d' && w.mode ? { tool_id: w.toolId, fields: { types: [w.mode] } } : { tool_id: w.toolId, fields: {} };
  /** describe for one tool: field schema, presets, models with limits and run_on prices, and the price rules (draft, option factors, ladder). `focus` puts that model first. */
  const describeTool = async (t: any, focus?: string) => {
    const ms = await get(`/api/models?toolId=${encodeURIComponent(t.id)}`).catch(() => null); const list: any[] = !ms ? [] : Array.isArray(ms) ? ms : ms.groups ? ms.groups.flatMap((g: any) => g.models) : ms.models ?? [];
    const capsByKey = new Map<string, any>(); for (const x of list) if (x.modelKey && (x.capabilities || x.videoLimits) && !capsByKey.has(x.modelKey)) capsByKey.set(x.modelKey, x.capabilities ?? x.videoLimits);
    const pg: any = await get('/api/prompt-grammar').catch(() => null); // prompt grammar (read-only): how each model reads @image1… and its prompt cap
    const models = (t.models ?? []).map((x: any) => { const tip = pg?.models?.[x.key]; return { ...modelCard(x, capsByKey.get(x.key)), ...(tip && !tip.noPrompt ? { prompt: { refs: tip.refs, ...(tip.limit ? { limit: tip.limit } : {}), ...(tip.triggers ? { triggers: tip.triggers } : {}) } } : {}) }; }); if (focus) models.sort((a: any, b: any) => Number(b.model === focus) - Number(a.model === focus));
    const factors = t.pricing?.optionFactors && Object.keys(t.pricing.optionFactors).length ? t.pricing.optionFactors : null;
    return { kind: 'tool', id: t.id, name: t.name, media: t.media, category: t.category ?? t.group ?? null, description: t.description, page: t.route ? webLink(t.route) : null,
      fields: fieldSchema(t), commonFields: COMMON_JOB_FIELDS,
      presets: (t.presets ?? []).slice(0, 80).map((p: any) => ({ id: p.id, label: p.label ?? p.name, group: p.group ?? null, ...(p.description ? { description: p.description } : {}) })), presetField: t.presets?.length ? ((t.inputs ?? []).some((i: any) => i.name === 'types') ? 'types' : 'preset') : null,
      defaultModel: (t.models ?? []).find((x: any) => x.isDefault)?.key ?? null, ...(focus ? { model: focus, modelOffered: models.some((x: any) => x.model === focus) } : {}), models, localFree: !!t.localFree, ...(t.draft ? { draft: t.draft } : {}),
      priceRules: { perModelAndPlace: 'models[].run_on[].credits (1 credit = $0.01); quote gives the exact price for your fields', ...(t.draft ? { draft: `draft:true renders ${t.draft.quality} at ×${t.draft.factor} of the price` } : {}), ...(factors ? { optionFactors: factors } : {}), ...(t.priceLadder ? { ladder: t.priceLadder } : {}) },
      next: `quote {tool_id:"${t.id}", fields, model, run_on} → tell the user the price → run {tool_id:"${t.id}", fields, model, run_on, max_usd}. Fields not in the schema are passed through (e.g. loop:1 when a model's limits say loop:true; videoPreset on h3-video).`, catalog: catalogSource() };
  };
  const CORE_DESC_RUN = 'Start a job on ANY studio tool (tool ids come from the app catalogue: Generate Video incl. Loop on LTX-2.5, Transitions/Morph, Object Swap / Motion Transfer / Restyle incl. cloud Kling or Seedance edit, Re-shoot, Camera Moves, the Edit Video tools, Audio, Voice, 3D, Render for Direct a Shot, the image apps…). fields = the job fields from describe (media fields take a local path, URL or /files/… path; lists as arrays). It ALWAYS quotes first and returns the quote with the job; max_usd refuses the run with nothing sent when the quote is over it (pass the price the user approved; 0 = free runs only). If approval is configured for paid runs, a paid quote asks the user with the price; free local runs go straight through. from_job hands a past output in without re-uploading. Waits for the result by default; wait:false returns the id for status.';

  s.registerTool('search_capabilities', { title: 'Search capabilities', description: 'Find what the studio can do, read live from the app: tools (Generate Video, Transitions, Object Swap, Re-shoot, Audio, 3D…), tool modes (footage-fx/vanish, photo-fx/exploded-view, voice/lipsync, voice/voiceover…), workflows and flows (Video Swap, Loop, Morph, Extend, Make it talk, Direct a Shot, New angle, Look → Viral templates, image/audio/3D workflows), each with ready run arguments, models (real names, maker, open weights, licence, which tools use them, cheapest price, whether they run locally for free) and workflows/presets (image, audio, 3D, video presets) matching the query. With no query: an overview (real or sample mode, the run_on places, every tool by media). Next: describe(id). Spends nothing.', inputSchema: {
    query: z.string().optional().describe('Words, e.g. "seamless loop", "video swap", "remove people", "talking photo", "text to speech", "continue video", "viral template", "free video", "upscale"'), media: z.enum(['image', 'video', 'audio', '3d']).optional(), kind: z.enum(['tool', 'mode', 'model', 'workflow']).optional(), limit: z.number().int().min(1).max(100).default(25) } },
    async ({ query, media: m, kind, limit }) => {
      try {
        const ts = await loadTools(); const ws = words(query).filter((w) => !['free', 'local'].includes(w)); const wantFree = /\b(free|local)\b/i.test(query ?? '');
        if (!ws.length && !wantFree && !kind) {
          const [h, places] = await Promise.all([get('/api/health').catch(() => null), runOnPlaces()]);
          const byMedia: Record<string, any[]> = {}; for (const t of ts) if (!m || t.media === m) (byMedia[t.media] ??= []).push({ id: t.id, name: t.name });
          return text({ backend: h?.backend ?? null, real: h ? h.backend !== 'mock' : null, ...(h?.backend === 'mock' ? { note: 'Mock backend: results are samples, nothing is generated or billed.' } : {}), run_on: places.map((p) => ({ id: p.id, label: p.label })), tools: byMedia,
            next: 'search_capabilities {query} to narrow down, describe {id} for exact options, limits and prices.' });
        }
        const [wfAll, extra] = await Promise.all([loadWorkflows(), loadSearchWords()]);
        const index = buildIndex(ts, wfAll, extra, modelIndex(ts));
        const isLocal = (t: any) => (t.models ?? []).some((x: any) => (x.runsOn ?? []).some((r: any) => r.id === 'local'));
        const mediaOk = (e: Entry) => !m || (e.kind === 'model' ? e.ref.tools?.some((id: string) => ts.find((t: any) => t.id === id)?.media === m) : e.media === m);
        const want = (e: Entry) => (!kind || e.kind === kind) && mediaOk(e)
          && (!wantFree || (e.kind === 'model' ? e.ref.local : e.kind === 'tool' ? isLocal(e.ref) : e.kind === 'mode' ? isLocal(e.ref.tool) : true));
        const hits = search(index, ws.join(' ') || (wantFree ? '' : query ?? ''), want); const partial = hits.length > 0 && hits[0].partial;
        const of = (k: Entry['kind']) => hits.filter((h) => h.entry.kind === k).map((h) => h.entry.ref);
        const tools = of('tool').map((t: any) => ({ id: t.id, name: t.name, media: t.media, description: String(t.description ?? '').slice(0, 200), models: (t.models ?? []).length, page: t.route ? webLink(t.route) : null }));
        const modes = of('mode').map(({ tool: t, mode: md }: any) => ({ id: `${t.id}/${md.id}`, name: `${t.name} · ${md.label}`, media: t.media, description: md.description, run: { tool_id: t.id, fields: md.fields } }));
        const models = of('model');
        const wfs = of('workflow').map((w: any) => ({ id: w.id, area: w.area, name: w.name, tagline: w.tagline, toolId: w.toolId, status: w.status, ...(w.kind ? { kind: w.kind } : {}), run: workflowRun(w), ...(w.note ? { note: w.note } : {}) }));
        const top = hits.slice(0, 5).map((h) => { const e = h.entry; const r = e.kind === 'workflow' ? workflowRun(e.ref) : e.kind === 'mode' ? { tool_id: e.ref.tool.id, fields: e.ref.mode.fields } : e.kind === 'tool' ? { tool_id: e.id, fields: {} } : null;
          return { id: e.id, kind: e.kind, name: e.name, ...(r ? { run: r } : {}) }; });
        return text({ query: query ?? '', ...(partial ? { partial: true, note: 'Nothing matched every word; these match most of them.' } : {}), top, tools: tools.slice(0, limit), modes: modes.slice(0, limit), models: models.slice(0, limit), workflows: wfs.slice(0, limit),
          next: 'describe {id} (a tool id, tool mode like footage-fx/vanish, model key or workflow id) for the exact fields, limits and prices; the run arguments go to quote, then run.' });
      } catch (e) { return fail(e); }
    });

  s.registerTool('describe', { title: 'Describe', description: 'Exact options for one id, generated from the app: a workflow / flow / template id (video/loop, video/lip-sync, template/fruit-drama, explore/…) or a tool mode (footage-fx/vanish) gives its ready run arguments plus the full tool description below, with its model first; a tool id gives its job fields as a JSON Schema (types, allowed values, required, which fields take media), presets, modes, the fields every job takes, and its models with real names, open weights, licence, limits (lengths, resolutions, aspects, sound, loop, reference kinds) and every run_on place with status and price in credits (1 credit = $0.01). A model key gives that model across tools. A workflow id gives the workflow, the tool that runs it and the run arguments. Spends nothing. Next: quote, then run.', inputSchema: { id: z.string().describe('Tool id (h3-video, app-transition, object-swap, reshoot, make-it-real, three-d…), model key (ltx-2.5-22b, seedance-2.0…) or workflow id') } },
    async ({ id }) => {
      try {
        const ts = await loadTools(); const t: any = (await loadTools(false, true)).find((x: any) => x.id === id);
        if (t) return text(await describeTool(t));
        const mc = modelIndex(ts).find((x) => x.model === id);
        if (mc) { const promptGrammar = await get(`/api/models/${encodeURIComponent(id)}/prompt-grammar`).catch(() => null); // read-only: reference syntax, limits, syntax, sources
          return text({ kind: 'model', ...mc, ...(promptGrammar ? { promptGrammar } : {}), perTool: ts.filter((x: any) => mc.tools.includes(x.id)).map((x: any) => ({ toolId: x.id, toolName: x.name, ...modelCard((x.models ?? []).find((y: any) => y.key === id)) })), next: 'describe {tool id} for the fields; run with model set to this key.' }); }
        const w = (await loadWorkflows()).find((x) => x.id === id || !!x.aliases?.includes(id)); // a merged look's old id describes the kept look
        if (w) {
          const run = workflowRun(w); const wt: any = ts.find((x: any) => x.id === (run?.tool_id ?? w.toolId));
          if (!wt) return text({ kind: 'workflow', ...w, run, next: w.note ?? (w.toolId ? `describe {id:"${w.toolId}"} for the fields and models of the tool that runs it.` : 'Not a job.') });
          const d = await describeTool(wt, run?.model ?? w.modelKey ?? undefined);
          return text({ kind: 'workflow', id: w.id, name: w.name, area: w.area, tagline: w.tagline, ...(w.kind ? { workflowKind: w.kind } : {}), needs: w.needs ?? null, inputs: w.inputs ?? [], how: w.how ?? [], ...(w.note ? { note: w.note } : {}), page: w.page ? webLink(w.page) : null,
            run, tool: d, next: run ? `quote ${JSON.stringify({ ...run, fields: { ...run.fields, '…': 'your media and prompt' } })} → tell the user the price → run with the same arguments and the quote_id.` : d.next });
        }
        const slash = id.indexOf('/'); const mt: any = slash > 0 ? ts.find((x: any) => x.id === id.slice(0, slash)) : null; const md = mt ? toolModes(mt).find((x) => x.id === id.slice(slash + 1)) : null;
        if (mt && md) { const run = { tool_id: mt.id, fields: md.fields };
          return text({ kind: 'mode', id, name: `${mt.name} · ${md.label}`, description: md.description, group: md.group, run, tool: await describeTool(mt), next: `quote {tool_id:"${mt.id}", fields:${JSON.stringify(md.fields)} + the media/prompt fields} → run with the quote_id.` }); }
        const near = [...ts.map((x: any) => x.id), ...modelIndex(ts).map((x) => x.model)].filter((x) => x.includes(id) || id.includes(x)).slice(0, 8);
        return fail(new Error(`Unknown id "${id}" (not a tool, model or workflow).${near.length ? ` Did you mean: ${near.join(', ')}?` : ''} search_capabilities finds ids.`));
      } catch (e) { return fail(e); }
    });

  const runRequest = {
    tool_id: z.string().describe('Tool id from search_capabilities / describe'),
    fields: z.record(z.any()).default({}).describe('Job fields from describe → fields, e.g. {"prompt":"…","types":["i2v"],"duration":"4","image":"/files/a.png"}'),
    files: z.record(z.array(z.string())).optional().describe('Extra media by field name, e.g. {"refs":["a.png","b.png"]} (fields can carry media too)'),
    model: z.string().optional().describe('Model key from describe (e.g. ltx-2.5-22b, minimax-h3, seedance-2.0); default = the tool default'),
    run_on: z.string().optional().describe('Where it runs and who bills it: local (free, this computer), comfy-cloud, fal, replicate, … (describe lists each model\'s places). An explicit place stays pinned unless fields.allowFallback is requested. Omit for Auto: after a known uncharged failure it may try another ready place costing the same or less; a dearer place waits for a decision'),
    route: z.string().optional().describe('One named way to run at a place, when it has several (list_models → run_on[].routes[].route, e.g. "Comfy Cloud · open workflow"). Omit to let the app pick the one that takes your settings'),
    draft: z.boolean().optional().describe('480p draft at ~30% of the price, where the tool offers it'),
    budget_id: z.string().optional().describe('Budget handle from budget {action:"set"}: the server refuses a run over it. Default = the budget pinned for this MCP process, if any'),
  };
  /** Progress notifications while a tool waits on a job (when the client sent a progressToken). */
  const progressFor = (extra: any) => { const token = extra?._meta?.progressToken; if (token == null || typeof extra?.sendNotification !== 'function') return undefined; let last = '';
    return (j: any) => { const p = j.progressInfo ? progressView(j.progressInfo) : null; const pct = Number(j.percent ?? j.progress ?? 0) || 0; const line = (p?.line as string) ?? `${j.status}${j.stage ? ` · ${j.stage}` : ''}`; const sig = `${pct}|${line}`; if (sig === last) return; last = sig;
      void extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: pct, total: 100, message: line } }).catch(() => {}); }; };
  const pollAfter = (j: any) => Math.max(2, Math.min(30, Math.round(Number(j.eta) > 0 ? Number(j.eta) / 4 : 5)));
  /** One request → its parts, its price params and its hash (the same for quote and run, so a quote_id matches exactly one request). */
  const prepare = async (a: { tool_id: string; fields?: Record<string, unknown>; files?: Record<string, string[]>; model?: string; run_on?: string; route?: string; draft?: boolean }) => {
    const t: any = await findTool(a.tool_id); const { form, media, unlisted } = splitFields(t, a.fields ?? {}, a.files ?? {});
    const params = priceParams(form, media, a.model, a.run_on, a.draft, media.video?.[0], t.id); if (a.route) params.route = a.route;
    return { t, form, media, unlisted, params, hash: requestHash({ toolId: t.id, form, media, model: a.model, run_on: a.run_on, draft: a.draft, ...(a.route ? { route: a.route } : {}) }) };
  };

  s.registerTool('quote', { title: 'Quote', description: 'Price a run before starting it, with the same request as run: priceUsd and priceLabel (the dollars to show the user; priceDetail has the provider\'s own units), credits (internal unit, 1 = $0.01), USD, free or local, where it is billed, whether it can run now (and why not), the agent budget fit, and a quote_id. A paid run needs that quote_id (valid 15 min, for this exact request): tell the user the price first. compare:true prices the same run on every model of the tool (or the models you list), cheapest first, to pick the cheapest model or a free local one (then quote the one you pick). Spends nothing. For a multi-step plan use budget {action:"plan"}.', inputSchema: {
    ...runRequest, compare: z.boolean().default(false), models: z.array(z.string()).max(40).optional().describe('With compare: only these model keys') } },
    async (a) => withBudget(a.budget_id, async () => {
      try {
        const r0 = await prepare(a);
        /* 2026-10-27 (shared/settingsFit.ts): settings you sent are never changed. When this model can't take them, the reply says the nearest
         * settings it makes (the app's model-switch rule, priced by the same batch quote): send those fields to run it. */
        const fitFor = async (): Promise<Record<string, unknown> | null> => { if (!a.model) return null;
          try { const base = priceParams(r0.form, r0.media, undefined, undefined, a.draft, r0.media.video?.[0], r0.t.id);
            const rr: any = await post('/api/models/quotes', { toolId: r0.t.id, params: base, models: [{ model: a.model, runOn: a.run_on ?? null }], range: false }); const v = rr?.quotes?.[a.model];
            if (!v?.fit?.changes?.length) return null;
            return { fitsWith: { fields: v.fit.values, note: v.fit.note, runnable: v.ok !== false && v.runnable !== false, priceLabel: v.cost?.usdText ?? (typeof v.credits === 'number' ? `≈ $${(v.credits / 100).toFixed(2)}` : null) },
              next: `${a.model} doesn't take these settings as sent. ${v.fit.note} Send fitsWith.fields with the same request to quote and run it.` };
          } catch { return null; } };
        if (!a.compare) { let q0: Awaited<ReturnType<typeof quoteOne>>; try { q0 = await quoteOne(r0.t.id, r0.params); } catch (e) { const f = await fitFor(); if (f) return text({ toolId: r0.t.id, runnable: false, error: e instanceof Error ? e.message : String(e), quote_id: null, ...f }); throw e; }
          const q = quoteBrief(q0); const paid = q.runnable && q.usd > 0; const f = q.runnable ? null : await fitFor();
          return text({ toolId: r0.t.id, ...q, ...(f ?? {}), ...(paid ? issueQuote({ toolId: r0.t.id, hash: r0.hash, credits: q.credits, usd: q.usd, routeId: q.route ?? null }) : { quote_id: null, note: q.runnable ? 'Free: run needs no quote_id.' : 'Not runnable as asked: see blockedReason.' }),
            ...(r0.unlisted.length ? { mcpWarnings: [`Not listed inputs of ${r0.t.id}, sent anyway: ${r0.unlisted.join(', ')}.`] } : {}), estimateNote: 'An estimate of what the provider bills you; local runs are free.' }); }
        const p = priceParams(r0.form, r0.media, undefined, undefined, a.draft, r0.media.video?.[0], r0.t.id);
        const r: any = await post('/api/models/quotes', { toolId: r0.t.id, params: p, ...(a.models?.length ? { models: a.models } : {}) });
        const nameOf = new Map<string, string>((r0.t.models ?? []).map((m: any) => [m.key, m.displayName ?? m.name]));
        const rows = Object.entries(r.quotes ?? {}).map(([k, v]: [string, any]) => ({ model: k, name: nameOf.get(k) ?? v.model ?? null, runOn: v.runOn ?? null, place: v.runOnLabel ?? null, priceLabel: v.runOn === 'local' || v.credits === 0 ? (v.runOn === 'local' ? 'Free · this computer' : 'Free') : v.cost?.usdText ?? (v.credits != null ? `≈ $${(v.credits / 100).toFixed(2)}` : null), credits: v.credits ?? null, usd: v.cost?.estUsd ?? (v.credits != null ? v.credits / 100 : null), free: v.credits === 0, runnable: v.runnable !== false, status: v.status ?? null,
          ...(v.reason || v.blockedReason ? { reason: v.blockedReason ?? v.reason } : {}), ...(v.adjusted ? { adjusted: v.adjusted } : {}), ...(v.fit?.note ? { willUse: { fields: v.fit.values, note: v.fit.note } } : {}), ...(v.need ? { needs: v.need.short } : {}), ...(v.priceRange?.places?.length > 1 ? { otherPlaces: v.priceRange.places.map((x: any) => ({ runOn: x.runOn, credits: x.credits })) } : {}) }))
          .sort((x, y) => Number(!x.runnable) - Number(!y.runnable) || (x.usd ?? 1e9) - (y.usd ?? 1e9));
        return text({ toolId: r0.t.id, compare: rows, next: 'Pick a row, then quote {model, run_on} from it to get its quote_id (a free row needs none). A row with willUse is priced at those settings: send willUse.fields with it.' });
      } catch (e) { return fail(e); }
    }));

  s.registerTool('run', { title: 'Run', description: `${CORE_DESC_RUN}`, inputSchema: {
    ...runRequest, tool_id: z.enum(knownToolIds() as [string, ...string[]]).describe('Tool id (generated from the app catalogue; search_capabilities / describe)'),
    quote_id: z.string().optional().describe('From quote, for this exact request. Required when the run costs money'),
    seed: z.number().int().min(0).max(2147483647).optional(),
    from_job: z.string().optional().describe('Past job id whose output goes in as input (server-side hand-off; next_actions lists the tools that take it)'), from_output: z.number().int().min(0).optional().describe('With from_job: which output (default 0)'),
    reuse_inputs: z.string().optional().describe('With from_job: re-attach that job\'s own input files ("image", "refs" or "all") instead of its output'),
    max_usd: z.number().min(0).optional().describe('Refuse (nothing sent, nothing charged) when the price is over this many US dollars. 0 = free runs only'),
    client_request_id: z.string().max(100).optional().describe('Your id for this run: sending the same request again with it returns the first job instead of starting (and paying for) a second one'),
    wait_sec: z.number().int().min(0).max(1800).default(30).describe('Wait up to this long for the result (0 = return the job id at once). Longer jobs come back with poll_after_sec: then call status') } },
    async (a, extra: any) => withBudget(a.budget_id, async () => {
      try {
        const r0 = await prepare(a); const t = r0.t;
        let q: any = null; let quoteError: string | null = null;
        try { q = quoteBrief(await quoteOne(t.id, r0.params)); } catch (e) { quoteError = e instanceof Error ? e.message : String(e); }
        const refuse = (o: Record<string, unknown>) => ({ isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ refused: true, charged: false, ...o }, null, 2) }] });
        if (!q) return refuse({ reason: `Could not price this run (${quoteError}), so it was not started. Nothing was charged.` });
        if (!q.runnable) return refuse({ reason: q.blockedReason ?? 'This request is not runnable. Fix the inputs or setup and quote again.', quote: q });
        if (a.max_usd != null && q.runnable && q.usd > a.max_usd + 1e-9) return refuse({ reason: `The price is $${q.usd.toFixed(2)}, over max_usd $${a.max_usd.toFixed(2)}. Nothing was sent or charged.`, quote: q, next: 'Ask the user to approve this price, or pick a cheaper model / run_on ("local" is free).' });
        const paid = q.runnable && q.usd > 0; let quoted: { credits: number; routeId: string | null } | null = null;
        if (paid) { const c = checkQuote(a.quote_id, t.id, r0.hash); if (!c.ok) return refuse({ reason: `${c.reason} Nothing was sent or charged.`, price: { usd: q.usd, credits: q.credits, billedTo: q.billedTo } }); quoted = c.q;
          if (typeof extra?.approve === 'function') { const no = await extra.approve(`run ${t.name}${q.modelKey ? ` on ${q.modelKey}` : ''}${q.billedTo ? ` (billed to ${q.billedTo})` : ''} for about $${Number(q.usd).toFixed(2)}${q.estimated ? ' (estimate)' : ''}`); if (no) return refuse({ reason: no }); } }
        const sub = await submit(t.id, { ...formOf(r0.form), ...(a.model ? { model: a.model } : {}), ...(a.run_on ? { runOn: a.run_on } : {}), ...(a.route ? { route: a.route } : {}), ...(a.seed !== undefined ? { seed: a.seed } : {}), ...(a.draft !== undefined ? { draft: a.draft } : {}), fromJob: a.from_job, output: a.from_output, reuseInputs: a.reuse_inputs,
          ...(quoted ? { quotedCredits: quoted.credits, ...(quoted.routeId ? { quotedRouteId: quoted.routeId } : {}) } : {}) }, r0.media, a.client_request_id);
        const j = a.wait_sec > 0 ? await waitFor(sub.id, a.wait_sec, undefined, progressFor(extra)) : await get(`/api/jobs/${encodeURIComponent(sub.id)}`);
        const v: any = view(j); const done = TERMINAL.has(j.status);
        const notice = v.sample ? `${a.run_on ? `You asked for run_on "${a.run_on}", but this ran as a sample. ` : 'This ran as a sample. '}${v.sampleReason} Tell the user this is a placeholder, not a real result.` : null;
        return { ...text({ ...(notice ? { notice } : {}), ...v, quote: q, ...(sub.idempotentReplay ? { replay: 'Same client_request_id: this is the job from the first call; nothing new was started.' } : {}),
          ...(r0.unlisted.length ? { mcpWarnings: [`Not listed inputs of ${t.id}, sent anyway: ${r0.unlisted.join(', ')}.`] } : {}),
          ...(done ? {} : { poll_after_sec: pollAfter(j), next: `Still ${j.status}. Call status {id:"${j.id}", wait_sec} in about ${pollAfter(j)} s. Do not call run again: that starts (and pays for) a second job.` }) }), isError: j.status === 'failed' || j.status === 'blocked' };
      } catch (e) {
        const b: any = e instanceof ApiError ? e.body : null;
        if (b?.code === 'route_changed') return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ refused: true, charged: false, reason: 'The price or the place changed since the quote, so the app refused the run. Nothing was charged.', newQuote: b.quote ? { credits: b.quote.credits, usd: (b.quote.credits ?? 0) / 100, runOn: b.quote.runOn, routeId: b.quote.routeId } : null, next: 'Quote again, tell the user the new price, then run with the new quote_id.' }, null, 2) }] };
        return fail(e);
      }
    }));

  s.registerTool('status', { title: 'Job status', description: `A job's state now, or after waiting up to wait_sec for it to finish (done, failed, canceled or blocked); sends progress notifications while waiting when the client asks for them. ${JOB_DESC} Unfinished jobs carry poll_after_sec. On a timeout the job keeps running: call status again later, never run it again.`, inputSchema: {
    id: z.string(), wait_sec: z.number().int().min(0).max(1800).default(0), budget_id: z.string().optional() } },
    async ({ id, wait_sec, budget_id }, extra: any) => withBudget(budget_id, async () => { try { const j = wait_sec > 0 ? await waitFor(id, wait_sec, undefined, progressFor(extra)) : await get(`/api/jobs/${encodeURIComponent(id)}`); const v: any = view(j);
      if (!TERMINAL.has(j.status)) { v.poll_after_sec = pollAfter(j); v.next = `Still ${j.status}; the job keeps running. Call status again in about ${v.poll_after_sec} s.`; }
      return { ...text(v), isError: j.status === 'failed' || j.status === 'blocked' }; } catch (e) { return fail(e); } }));

  s.registerTool('get_outputs', { title: 'Get outputs', description: 'A finished job\'s results as links (web app URL per output, a resource link each, and a curl line to save it), seed, prompt, real model and support details. include_image:true also inlines one PNG/JPG output so you can look at it; otherwise nothing is inlined.', inputSchema: { id: z.string(), include_image: z.boolean().default(false) } },
    async (a, extra) => { const r: any = await legacy.get('get_asset')!({ id: a.id, include_image: !!a.include_image }, extra); if (r.isError) return r;
      try { const o = JSON.parse(r.content[0].text); o.download = (o.outputs ?? []).map((x: any) => `curl -L -o "${String(x.url).split('/').pop()}" "${x.url}"`); r.content[0].text = JSON.stringify(o, null, 2); } catch { /* keep */ } return r; });

  s.registerTool('cancel', { title: 'Cancel job', description: 'Stop a queued or running job. Nothing is billed for a job canceled before it reached a provider; a hosted job already sent may not be cancellable (the reply says so and whether it was charged). A finished job can\'t be canceled.', inputSchema: { id: z.string() } },
    async ({ id }) => { try { return text(view(await post(`/api/jobs/${encodeURIComponent(id)}/cancel`))); } catch (e) { return fail(e); } });

  s.registerTool('upload', { title: 'Upload media', description: 'Add a file to the media library: a local path, an http(s) URL, or base64 (small files, with a filename). Returns its /files/… URL and link to use as a media field in run (run also takes local paths directly).', inputSchema: {
    file: z.string().optional().describe('Local path or http(s) URL'), base64: z.string().max(14_000_000).optional().describe('File content as base64 (≤ 10 MB)'), filename: z.string().max(200).optional().describe('With base64: name with extension, e.g. logo.png') } },
    async ({ file, base64, filename }) => {
      try {
        let src = file; let tmp: string | null = null;
        if (!src && base64) { const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
          const name = path.basename(filename || 'upload.bin').replace(/[^\w.-]/g, '_'); tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-up-')); src = path.join(tmp, name); fs.writeFileSync(src, Buffer.from(base64, 'base64')); }
        if (!src) return fail(new Error('Give file (a path or URL) or base64 + filename.'));
        try { const r: any = await uploadMedia(src); const item = r.items?.[0] ?? r; return text({ ...item, link: webLink(item.url), use: `put "${item.url}" in a media field of run` }); }
        finally { if (tmp) (await import('node:fs')).rmSync(tmp, { recursive: true, force: true }); }
      } catch (e) { return fail(e); }
    });

  const jobRow = (j: any) => ({ id: j.id, status: j.status, toolId: j.toolId, feature: j.feature?.label ?? null, model: j.modelName ?? j.model ?? null, runOn: j.runOnLabel ?? j.runOn ?? null, prompt: typeof j.input?.prompt === 'string' ? j.input.prompt.slice(0, 160) : null,
    sample: typeof j.isSample === 'boolean' ? j.isSample : !!j.demo, cost: j.cost ?? 0, createdAt: j.createdAt ?? null, result_url: webLink(j.outputs?.[0]?.url ?? j.resultUrl ?? null), outputs: (j.outputs ?? []).length, page: `${WEB}/jobs/${j.id}` });
  s.registerTool('history', { title: 'History', description: 'Past and running jobs, newest first (state active = queued + running, oldest first): id, status, tool, feature + real model, where it ran, prompt, sample or real, cost, first output, job page. Filter by tool, status, media or words (q). Spends nothing.', inputSchema: {
    q: z.string().optional().describe('Words in the prompt or tool'), tool_id: z.string().optional(), status: z.string().optional().describe('e.g. done, failed (comma list)'), state: z.enum(['active']).optional(),
    media: z.enum(['image', 'video', 'audio', '3d']).optional(), limit: z.number().int().min(1).max(50).default(20), cursor: z.string().optional() } },
    async (a) => {
      try {
        const qs = new URLSearchParams(); if (a.tool_id) qs.set('toolId', a.tool_id); if (a.status) qs.set('status', a.status); if (a.state) qs.set('state', a.state); if (a.media) qs.set('media', a.media); if (a.q) qs.set('q', a.q); qs.set('limit', String(a.limit ?? 20)); if (a.cursor) qs.set('cursor', a.cursor);
        const r: any = await get(`/api/jobs?${qs}`); const items: any[] = Array.isArray(r) ? r : r.items ?? [];
        return text({ items: items.map(jobRow), nextCursor: Array.isArray(r) ? null : r.nextCursor ?? null });
      } catch (e) { return fail(e); }
    });

  s.registerTool('recipe', { title: 'Recipes', description: 'Recipes: what made a result (tool, workflow, real model, where it ran, settings; never files, URLs or keys). action export {id, with_prompt}: the recipe + a link that opens it in anyone\'s copy of the app (nothing runs until they press Generate). action import {recipe: link, code or JSON, prompt?, keep_seed?, run_on?}: ready run arguments + a price quote (nothing runs; show the price, then call run). action share {id}: turn link sharing on and return the share page and its public recipe.json (ask the user first). action unshare {id}: turn it off.', inputSchema: {
    action: z.enum(['export', 'import', 'share', 'unshare']), id: z.string().optional().describe('Job id (export, share, unshare)'), recipe: z.string().optional().describe('import: recipe link, code or JSON'),
    with_prompt: z.boolean().default(false), prompt: z.string().optional().describe('import: use this prompt'), keep_seed: z.boolean().default(false), run_on: z.string().optional() } },
    async (a) => {
      try {
        if (a.action === 'import') {
          const p = parseRecipe(a.recipe ?? ''); if (!p.ok) return fail(new Error(p.error));
          const args: any = recipeToRun(p.recipe, { keepSeed: a.keep_seed, prompt: a.prompt }); if (a.run_on) args.run_on = a.run_on;
          const t: any = (await loadTools(false, true)).find((x: any) => x.id === args.tool_id);
          if (!t) return text({ recipe: p.recipe, runnable: false, reason: `This app has no tool "${args.tool_id}". search_capabilities finds the closest one.` });
          const { form, media } = splitFields(t, args.fields);
          const q = await quoteOne(t.id, priceParams(form, media, args.model, a.run_on, undefined, undefined, t.id)).then(quoteBrief, (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
          return text({ recipe: p.recipe, run: args, quote: q, ...(p.recipe.prompt || a.prompt ? {} : { note: 'This recipe has no prompt: add one in fields.prompt.' }) });
        }
        if (!a.id) return fail(new Error(`recipe ${a.action} needs id (a job id).`));
        const id = encodeURIComponent(a.id);
        if (a.action === 'export') { const r: any = await get(`/api/jobs/${id}/recipe${a.with_prompt ? '?prompt=1' : ''}`); return text({ recipe: r.recipe, link: webLink(r.path), hasPrompt: !!r.hasPrompt }); }
        if (a.action === 'unshare') { await del(`/api/jobs/${id}/share`); return text({ id: a.id, shared: false, note: 'Link revoked: the share page and card now answer 404.' }); }
        const r: any = await post(`/api/jobs/${id}/share`); return text({ id: a.id, shared: true, token: r.token, page: webLink(r.url), recipe: webLink(`/s/${r.token}/recipe.json`) });
      } catch (e) { return fail(e); }
    });

  s.registerTool('budget', { title: 'Budget and spend', description: 'Money, in one place. action set {name, budget_usd | budget_credits}: start a budget and get its budget_id; pass budget_id to quote and run (the server refuses any run that would go over it BEFORE anything is sent). Call it first when the user names a budget. action get {budget_id}: budget, spent, remaining. action plan {steps:[{label, tool_id, params}], budget_id}: price a whole plan, running total, and whether it fits. action receipt {budget_id}: itemised runs (where each ran, estimate vs actual) vs the budget; show its first block at the end. action spend {period}: totals per provider for today or this month and recent paid runs. Local runs are $0.', inputSchema: {
    action: z.enum(['set', 'get', 'plan', 'receipt', 'spend']), budget_id: z.string().optional().describe('get / plan / receipt: the budget (default: the one pinned for this MCP process, or set in this stdio session)'),
    name: z.string().min(1).max(60).optional().describe('set: your agent name, e.g. "Claude"'), budget_usd: z.number().min(0).max(100000).optional(), budget_credits: z.number().int().min(0).optional(),
    steps: z.array(z.object({ label: z.string().optional(), tool_id: z.string(), params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}) })).min(1).max(30).optional().describe('plan: quote params per step (the same fields as quote)'),
    period: z.enum(['today', 'month']).default('month') } },
    async (a, extra) => {
      if (a.action === 'set') { const r: any = await legacy.get('set_budget')!({ name: a.name ?? 'MCP agent', budget_usd: a.budget_usd, budget_credits: a.budget_credits }, extra); if (r.isError) return r;
        try { const b = JSON.parse(r.content[0].text); return text({ budget_id: b.id, ...b, note: `Pass budget_id "${b.id}" to quote and run${sharedBudgetEnabled() ? ' (this stdio session also uses it by default)' : ' (HTTP mode: every call that should count needs it)'}. Runs over it are refused with nothing charged.` }); } catch { return r; } }
      if (a.action === 'get') return withBudget(a.budget_id, () => legacy.get('get_budget')!({}, extra));
      if (a.action === 'receipt') return withBudget(a.budget_id, () => legacy.get('get_receipt')!({}, extra));
      if (a.action === 'plan') return a.steps?.length ? withBudget(a.budget_id, () => legacy.get('plan_budget')!({ steps: a.steps!.map((s0) => ({ ...s0, params: s0.params ?? {} })) }, extra)) : fail(new Error('budget plan needs steps.'));
      return legacy.get('get_spend')!({ period: a.period ?? 'month', recent: 10 }, extra);
    });

  // ---- library toolset ----
  s.registerTool('retry', { title: 'Retry job', description: 'Re-run a FAILED or BLOCKED job with the same inputs, optionally on another place (run_on from the failed job\'s tryOn, with its price). Priced and checked like a new run: spending limits and the agent budget apply. failed_only re-runs only the failed reference groups.', inputSchema: {
    id: z.string(), run_on: z.string().optional(), failed_only: z.boolean().optional(), budget_id: z.string().optional(), wait_sec: z.number().int().min(0).max(1800).default(30) } },
    async ({ id, run_on, failed_only, budget_id, wait_sec }) => withBudget(budget_id, async () => { try { const r: any = await post(`/api/jobs/${encodeURIComponent(id)}/retry`, { ...(run_on ? { runOn: run_on } : {}), ...(failed_only ? { failedOnly: true } : {}) }); return await jobResult(r.id, (wait_sec ?? 30) > 0, wait_sec || 1); } catch (e) { return fail(e); } }));

  s.registerTool('list_workflows', { title: 'List workflows', description: 'The workflows and presets behind each page, with the tool that runs them: image (Relight, Face Swap, Product Shot…), audio (music, sound effects, voiceover, change voice, translate, soundtrack), 3d (Image to 3D, Turntable, Direct a Shot), video (Generate Video camera/style presets: send the id as videoPreset), edit-video (Extend, Reframe, Upscale, Remove Background, SDR to HDR, FPS Boost, Depth Map, Re-shoot, with limits and prices). Spends nothing.', inputSchema: { area: z.enum(['image', 'audio', '3d', 'video', 'edit-video']) } },
    async ({ area }) => {
      try {
        if (area === 'edit-video') { const r: any = await get('/api/edit-video/tools'); const tools = Array.isArray(r) ? r : r.tools ?? r.items ?? [];
          return text(tools.map((t: any) => ({ toolId: t.id, name: t.name, available: t.available, reason: t.reason ?? null, limits: t.limits ?? null, defaultModel: t.defaultModel ?? null, models: (t.models ?? []).map((m: any) => ({ id: m.id, routes: (m.routes ?? []).map((x: any) => ({ label: x.label, credits: x.credits, available: x.available })) })) }))); }
        return text((await loadWorkflows()).filter((w) => w.area === area).map((w) => ({ ...w, run: workflowRun(w) })));
      } catch (e) { return fail(e); }
    });

  s.registerTool('next_actions', { title: 'What can use this result', description: 'For a finished job: the tools that can take its output next (Turn to video, Add a camera move, Upscale, Restyle, Use as soundtrack…), each as ready run arguments with from_job (no re-upload). Spends nothing.', inputSchema: { id: z.string() } },
    async ({ id }) => { try { const r: any = await get(`/api/jobs/${encodeURIComponent(id)}/next-actions`); return text({ jobId: r.jobId, items: (r.items ?? []).map((x: any) => ({ tool_id: x.tool, label: x.label, slot: x.slot, primary: !!x.primary, run: { tool_id: x.tool, from_job: x.submit?.fromJob ?? id, ...(x.submit?.as ? { fields: { as: x.submit.as } } : {}) } })) }); } catch (e) { return fail(e); } });

  s.registerTool('direct_a_shot_prep', { title: 'Direct a Shot: render check', description: 'Direct a Shot step 3 (Render, tool make-it-real: LTX-2.5 22B on this computer, free). Stage and Mockup happen in the app\'s 3D page (the browser draws the shot); pass that plan-a-shot job id to get the lengths and sizes it allows, the starting prompt, whether the model files are on this computer, whether it can run here and how long it takes. Then run {tool_id:"make-it-real", fields:{planJob, prompt, frames, size}}. Spends nothing.', inputSchema: { plan_job: z.string().describe('A finished plan-a-shot job id (history tool_id plan-a-shot)'), frames: z.string().optional(), size: z.enum(['standard', 'quick']).optional() } },
    async ({ plan_job, frames, size }) => { try { const qs = new URLSearchParams({ planJob: plan_job }); if (frames) qs.set('frames', frames); if (size) qs.set('size', size); return text({ ...(await get(`/api/make-it-real/prep?${qs}`)), stagePage: webLink('/tools/3d?workflow=plan-a-shot') }); } catch (e) { return fail(e); } });

  // ---- admin toolset ----
  s.registerTool('server_status', { title: 'Studio status', description: 'Is the studio real or in sample mode, and where can jobs run? backend (comfy = real, mock = samples only), whether local runs are free and reachable, the run_on places with labels, which provider accounts are connected (never keys), queue lanes, and this session\'s agent budget. Spends nothing.', inputSchema: {} },
    async () => {
      try {
        const [h, c, places, acc] = await Promise.all([get('/api/health'), get('/api/config').catch(() => null), runOnPlaces(), get('/api/accounts').catch(() => null)]);
        const id = await currentBudgetId(); const b = id ? await get(`/api/agent/budgets/${id}`).catch(() => null) : null;
        return text({ backend: h.backend, real: h.backend !== 'mock', ...(h.backend === 'mock' ? { note: 'Mock backend: every result is a sample, nothing is generated or billed.' } : {}), comfyReady: h.comfyReady ?? null, comfyReason: h.comfyReason ?? null, tools: (h.tools ?? []).length,
          local: c ? { free: !!c.localFree, enabled: c.localEnabled ?? null, reachable: c.localReachable ?? null, available: c.localAvailable ?? null, useLocal: c.useLocal ?? null } : null, billingMode: c?.billingMode ?? null, openWeightsOnly: !!c?.openWeightsOnly,
          run_on: places.map((p) => ({ id: p.id, label: p.label })), accounts: accountsOf(acc),
          lanes: c?.lanes ?? null, budget: b ? { name: b.name, budgetUsd: b.budgetUsd, spentUsd: b.spentUsd, remainingUsd: b.remainingUsd } : null, web: WEB });
      } catch (e) { return fail(e); }
    });

  s.registerTool('get_spend', { title: 'Spend', description: 'What has been spent: totals per provider for today or this month (runs, estimated vs actual USD, caps and what is left), the most recent paid runs, and this session\'s agent budget. Local and sample runs count $0. Spends nothing.', inputSchema: { period: z.enum(['today', 'month']).default('month'), recent: z.number().int().min(0).max(50).default(10) } },
    async ({ period, recent }) => {
      try {
        const sum: any = await get(`/api/spend/summary?period=${period ?? 'month'}`); const log: any = recent ? await get(`/api/spend?limit=${recent}`).catch(() => null) : null;
        const id = await currentBudgetId(); const b = id ? await get(`/api/agent/budgets/${id}`).catch(() => null) : null;
        return text({ period: sum.period, billingMode: sum.billingMode, totals: sum.totals, providers: (sum.providers ?? []).map((p: any) => ({ provider: p.name ?? p.provider, runs: p.runs, spentUsd: p.spentUsd, estUsd: p.estUsd, actualUsd: p.actualUsd, capUsd: p.capUsd, leftUsd: p.leftUsd })),
          recent: (log?.items ?? []).map((r: any) => ({ jobId: r.jobId, tool: r.toolId, model: r.modelName ?? r.model, runOn: r.runOnLabel ?? r.runOn, estUsd: r.estUsd, actualUsd: r.actualUsd, countedUsd: r.countedUsd, status: r.status, sample: !!r.demo, agent: r.agentName ?? null, at: r.createdAt })),
          budget: b ? { name: b.name, budgetUsd: b.budgetUsd, spentUsd: b.spentUsd, remainingUsd: b.remainingUsd } : null, note: sum.note ?? null });
      } catch (e) { return fail(e); }
    });

  registerResources(s);
  registerPrompts(s, { canvas: sets.has('canvas') });
  // ---- Canvas agent bridge (server/src/canvasAgent.ts; docs/MCP.md "Drive the canvas") ----
  /** One op through the live bridge: the open canvas page applies it and returns real ids. */
  const canvasOp = async (board_id: string, op: Record<string, unknown>) => {
    const r: any = await post(`/api/canvas/boards/${encodeURIComponent(board_id)}/agent/ops`, { ops: [op] });
    const one = r?.results?.[0];
    if (!one?.ok) throw Object.assign(new Error(one?.error || r?.error || 'The canvas did not apply that.'), { code: one?.code ?? r?.code });
    return one.result;
  };
  const canvasRead = (board_id: string) => get(`/api/canvas/boards/${encodeURIComponent(board_id)}/agent/summary`);
  const canvasBoard = z.string().min(1).describe('Board id from canvas_list_boards (e.g. brd_...)');
  const canvasCard = z.string().min(1).describe('Card (node) id from canvas_open_board');
  const canvasNote = 'Nothing runs or spends here. Only the user pressing Go in the canvas panel starts a run.';

  /* ---- library databases (2026-10-27): recipes (workflows, chains, skills, saved looks, ideas) and your media (server libraryDb.ts) ---- */
  const recipeView = (w: any) => ({ id: w.id, kind: w.kind, status: w.status, name: w.name, description: w.description, job: w.job, tags: w.tags, mediaIn: w.mediaIn, mediaOut: w.mediaOut,
    steps: (w.steps ?? []).map((x: any) => ({ id: x.id, name: x.name, ...(x.say ? { say: x.say } : {}), tool_id: x.toolId ?? null, ...(x.model ? { model: x.model } : {}), canvas_workflow: x.canvas ?? null })),
    models: (w.models ?? []).slice(0, 4).map((m: any) => ({ key: m.key, name: m.name, where: m.where, priceUsd: m.priceUsd })), example: w.examples?.[0] ? { url: webLink(w.examples[0].url), prompt: w.examples[0].prompt, model: w.examples[0].model, costUsd: w.examples[0].costUsd } : null,
    runs: w.runs?.where === 'app' && w.runs.href ? webLink(w.runs.href) : w.runs?.where === 'agent' ? 'your agent (a skill)' : 'not built', source: w.source ? { name: w.source.name, url: w.source.url, licence: w.source.licence } : null });
  s.registerTool('search_workflows', { title: 'Search workflows', description: 'Search the recipes database: every workflow the app runs, the multi-step chains, the agent skills, the user\'s saved looks and researched ideas (status "idea": NOT built, never runnable). Ranked by name, description, tags and media; filter by media (text, image, video, audio, 3d, in or out) and kind (workflow, chain, skill, saved, idea; comma list). Each hit: steps (tool ids in order, with the Canvas card workflow), default and other models with where they run and the price, a real example with its prompt, source and licence. Next: get_workflow_recipe(id). Spends nothing.', inputSchema: {
    query: z.string().optional().describe('Plain words, e.g. "talking portrait", "product ad", "relight"'), media: z.enum(['text', 'image', 'video', 'audio', '3d']).optional(),
    kind: z.string().optional().describe('workflow, chain, skill, saved or idea (comma list); default all'), include_ideas: z.boolean().default(true).describe('false = only what the app can run'), limit: z.number().int().min(1).max(50).default(8) } },
    async (a) => { try { const q = new URLSearchParams({ limit: String(a.limit) }); if (a.query) q.set('q', a.query); if (a.media) q.set('media', a.media); if (a.kind) q.set('kind', a.kind); if (!a.include_ideas) q.set('status', 'ready');
      const r: any = await get(`/api/library/workflows?${q}`);
      return text({ total: r.total, counts: r.counts, items: (r.items ?? []).map((w: any) => ({ ...recipeView(w), score: w.score, ...(w.partial ? { partial: true } : {}) })),
        note: 'Ideas are not built: never try to run them; ask the user instead. For a ready one: get_workflow_recipe for the full steps and the Canvas plan, then describe + quote before run.' }); } catch (e) { return fail(e); } });
  s.registerTool('get_workflow_recipe', { title: 'Get a workflow recipe', description: 'One recipe from search_workflows by id: every step to follow (tool id, model, what to do), the models with where they run and the price, real examples with their prompts, the source and licence, and `canvas`: a ready canvas_batch plan (draft cards wired in order) to put it on a Canvas board. Nothing runs. Spends nothing.', inputSchema: { id: z.string().describe('Id from search_workflows, e.g. w-i-relight, c-presenter, s-ugc-ad') } },
    async ({ id }) => { try { const w: any = await get(`/api/library/workflows/${encodeURIComponent(id)}`);
      return text({ ...recipeView(w), models: w.models, examples: (w.examples ?? []).map((x: any) => ({ ...x, url: webLink(x.url), poster: webLink(x.poster) })), canvas: w.canvas,
        next: w.status === 'idea' ? 'Not built: tell the user and ask whether to build it.' : w.kind === 'skill' ? 'Follow the skill steps (the skill file has the exact calls).' : 'For each step: describe(tool_id), quote, then run with the user\'s OK. Or put it on the Canvas with canvas.args (canvas_batch).' }); } catch (e) { return fail(e); } });
  const refView = (r: any) => ({ id: r.id, kind: r.kind, source: r.source, title: r.title, url: webLink(r.url), path: r.url, thumb: webLink(r.thumbUrl), width: r.width, height: r.height, durationSec: r.durationSec,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null, prompt: r.prompt, model: r.model, workflow: r.workflow, job_id: r.jobId, project: r.project?.name ?? null, tags: r.tags, favourite: r.favourite });
  s.registerTool('search_references', { title: 'Search your media', description: 'Search the references database: every result the user made, their uploads and saved elements (the Examples project\'s results included). Text search over the title, prompt and tags (auto tags from the prompt plus the user\'s own), with filters: kind (image, video, audio, 3d), source (generated, uploaded), model, project (id or none), favourite, tag, since / until (ISO date), paging with cursor. Use `path` (the app URL) as a media field in run, or job_id with from_job. include_image:true inlines small images so you can look at them. Spends nothing.', inputSchema: {
    query: z.string().optional(), kind: z.enum(['image', 'video', 'audio', '3d']).optional(), source: z.enum(['generated', 'uploaded']).optional(), model: z.string().optional(), project: z.string().optional(),
    favourite: z.boolean().optional(), tag: z.string().optional(), since: z.string().optional(), until: z.string().optional(), limit: z.number().int().min(1).max(50).default(12), cursor: z.string().optional(),
    include_image: z.boolean().default(false).describe('Inline up to 4 small images (under 1.5 MB each)') } },
    async (a) => { try { const q = new URLSearchParams({ limit: String(a.limit) });
      for (const [k, v] of Object.entries({ q: a.query, kind: a.kind, source: a.source, model: a.model, project: a.project, tag: a.tag, since: a.since, until: a.until, cursor: a.cursor })) if (v) q.set(k, String(v));
      if (a.favourite) q.set('fav', '1');
      const r: any = await get(`/api/library/references?${q}`); const items = (r.items ?? []).map(refView);
      const out: any[] = [{ type: 'text', text: JSON.stringify({ total: r.total, next_cursor: r.nextCursor, items }, null, 2) }];
      if (a.include_image) for (const it of (r.items ?? []).filter((x: any) => x.kind === 'image').slice(0, 4)) { try { const res = await fetch(abs(it.thumbUrl ?? it.url)!); const b = Buffer.from(await res.arrayBuffer()); if (res.ok && b.length < 1_500_000) out.push({ type: 'image', data: b.toString('base64'), mimeType: res.headers.get('content-type') || 'image/png' }); } catch { /* skipped */ } }
      return { content: out }; } catch (e) { return fail(e); } });
  s.registerTool('get_reference', { title: 'Get one media item', description: 'One item from search_references by id: its app URL (`path`, usable as a media field in run or a canvas card input), thumbnail, size or length, date, prompt, model, workflow, project, tags and source. include_image:true inlines it when it is a small image. Spends nothing.', inputSchema: { id: z.string(), include_image: z.boolean().default(false) } },
    async ({ id, include_image }) => { try { const r: any = await get(`/api/library/references/${encodeURIComponent(id)}`); const out: any[] = [{ type: 'text', text: JSON.stringify(refView(r), null, 2) }];
      if (include_image && r.kind === 'image') { const res = await fetch(abs(r.url)!); const b = Buffer.from(await res.arrayBuffer()); if (res.ok && b.length < 4_000_000) out.push({ type: 'image', data: b.toString('base64'), mimeType: res.headers.get('content-type') || 'image/png' }); }
      return { content: out }; } catch (e) { return fail(e); } });

  s.registerTool('canvas_list_boards', { title: 'List canvas boards', description: 'List the saved canvas boards: id, name, item count, last saved, and whether each is open in the app right now (`open`). The canvas is the free-form board in the app. Make one with canvas_create_board, show one with canvas_switch_board, then canvas_open_board reads its cards.', inputSchema: {} },
    async () => { try { const [r, pr]: any[] = await Promise.all([get('/api/canvas/boards'), get('/api/canvas/agent/presence').catch(() => null)]); const open = new Set<string>(pr?.openBoards ?? []);
      return text({ items: (r.items ?? []).map((b: any) => ({ id: b.id, name: b.name, items: b.shapes, updatedAt: b.updatedAt, projectId: b.projectId ?? null, open: open.has(b.id) })), total: (r.items ?? []).length,
        note: open.size ? 'Boards with open: true are showing in the app; you can change them now. canvas_switch_board shows another one.' : 'No board is open in the app right now. Ask the user to open Canvas, or make one with canvas_create_board.' }); } catch (e) { return fail(e); } });

  /* Boards (2026-10-28): make, rename and show boards with the same routes the board switcher uses (POST / PATCH /api/canvas/boards). */
  const boardName = z.string().max(1000).describe('The board name (up to 80 characters; longer is cut). Empty or left out = the next "Untitled board N".');
  const showBoard = async (board_id: string) => { const r: any = await post('/api/canvas/agent/open', { board_id }); return { shownOn: r.shownOn ?? 0, note: r.note as string }; };
  const sameName = async (name: string, except?: string) => { try { const r: any = await get('/api/canvas/boards'); return (r.items ?? []).filter((b: any) => b.id !== except && String(b.name).toLowerCase() === name.toLowerCase()).map((b: any) => b.id); } catch { return []; } };
  s.registerTool('canvas_create_board', { title: 'Make a new canvas board', description: 'Make a new, empty canvas board and (by default) show it in the app, so you can build on it right away. Returns its id. Names can repeat (the result says when one already exists); leave the name out for "Untitled board N". Nothing runs or spends.', inputSchema: {
    name: boardName.optional(), open: z.boolean().default(true).describe('Show the new board on the open canvas page (default true)') } },
    async (a) => { try { const want = (a.name ?? '').replace(/\s+/g, ' ').trim(); const dup = want ? await sameName(want.slice(0, 80)) : [];
      const b: any = await post('/api/canvas/boards', want ? { name: want } : {}); const shown = a.open ? await showBoard(b.id) : null;
      return text({ board: { id: b.id, name: b.name, items: 0 }, ...(shown ? { shownOn: shown.shownOn } : {}),
        ...(want.length > 80 ? { cut: 'The name was longer than 80 characters and was cut.' } : {}), ...(dup.length ? { sameNameAs: dup, warning: `Another board is already called "${b.name}". Rename one with canvas_rename_board if that is confusing.` } : {}),
        note: shown ? `${shown.note} Use board_id "${b.id}" with canvas_add_card / canvas_batch, and canvas_wait_for_message to listen there.` : `Made. Show it with canvas_switch_board { board_id: "${b.id}" }.` }); } catch (e) { return fail(e); } });
  s.registerTool('canvas_rename_board', { title: 'Rename a canvas board', description: 'Rename a canvas board. The new name shows in the app at once. Nothing runs or spends.', inputSchema: { board_id: canvasBoard, name: z.string().max(1000).describe('The new name (1 to 80 characters; longer is cut)') } },
    async (a) => { try { const want = a.name.replace(/\s+/g, ' ').trim(); if (!want) return fail(new Error('Give the board a name (it cannot be empty).'));
      const dup = await sameName(want.slice(0, 80), a.board_id); const b: any = await patch(`/api/canvas/boards/${encodeURIComponent(a.board_id)}`, { name: want });
      return text({ board: { id: b.id, name: b.name, items: b.shapes }, ...(want.length > 80 ? { cut: 'The name was longer than 80 characters and was cut.' } : {}), ...(dup.length ? { sameNameAs: dup, warning: `Another board is also called "${b.name}".` } : {}) }); } catch (e) { return fail(e); } });
  s.registerTool('canvas_switch_board', { title: 'Show a canvas board', description: 'Show this board on the canvas page open in the app (the user\'s view switches to it), so you can build on it and the user sees it. Use a board id from canvas_list_boards or canvas_create_board. Nothing runs or spends.', inputSchema: { board_id: canvasBoard } },
    async (a) => { try { const r = await showBoard(a.board_id); return text({ board_id: a.board_id, shownOn: r.shownOn, note: r.note }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_open_board', { title: 'Open a canvas board', description: 'Read a board by id: its cards with id, kind (image/video/audio/3d), workflow, model, prompt, status, inputs, result URLs and price, plus the board name. Reads the live board when it is open in the app, otherwise the last saved version. Open the board in the app to let the agent change it. Spends nothing.', inputSchema: { board_id: canvasBoard } },
    async ({ board_id }) => { try { const r: any = await canvasRead(board_id); return text({ ...r, note: r.live ? 'Live board from the open canvas page.' : 'This is the last saved version. Open this board in the app to change it.' }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_read_board', { title: 'Read a canvas board', description: 'The same summary as canvas_open_board: cards (id, kind, workflow, model, prompt, status, inputs, result URLs, price) and the board name. Spends nothing.', inputSchema: { board_id: canvasBoard } },
    async ({ board_id }) => { try { return text(await canvasRead(board_id)); } catch (e) { return fail(e); } });

  /* The models a card with no `model` starts on (the app's server/src/shared/cloudDefaults.ts CANVAS_DEFAULTS; keep these words in step). */
  const CANVAS_DEFAULTS_NOTE = 'With no model a new card starts on a cloud model that runs on the Comfy Cloud key: create → GPT Image 2.5 Flare, video and transition → MiniMax H3, music → Seed Audio, sfx → ElevenLabs Sound Effects, voice → ElevenLabs v3; other workflows on their own cloud default. The user\'s own default model wins. Without a Comfy Cloud key the card says so before Go (canvas_propose_run lists it as a problem).';
  s.registerTool('canvas_list_workflows', { title: 'List canvas workflows', description: 'The workflow ids canvas_add_card accepts (create, video, music, relight, upscale…), each with its medium, name, what it needs and the tool behind it. Spends nothing.', inputSchema: {} },
    async () => { try { const r: any = await get('/api/canvas/agent/workflows'); return text({ items: r.items ?? [] }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_add_card', { title: 'Add a card to the canvas', description: 'Add a DRAFT generate card to a board and return its real card id. It never runs: call canvas_propose_run to price it and ask the user to press Go. `workflow` is an id from canvas_list_workflows (create, video, music, relight…). `model` is a model key or provider id (omit for the workflow default). ' + CANVAS_DEFAULTS_NOTE + ' Name a model only when the user asks for one. `settings` are the workflow settings as strings (e.g. {"aspect":"16:9","duration":"6"}). `inputs_from` wires existing node ids in as inputs with arrows. `at` is an optional board position. The board must be open in the app.', inputSchema: {
    board_id: canvasBoard, workflow: z.string().min(1).describe('Workflow id from canvas_list_workflows, e.g. create, video, music, relight'),
    prompt: z.string().max(4000).optional().describe('The prompt on the card'), name: z.string().max(80).optional().describe('A short name shown on the card, e.g. "Hero close-up"'), model: z.string().optional().describe('Model key (e.g. nano-banana-2, minimax-h3) or provider id; omit for the cloud default (create: GPT Image 2.5 Flare, video: MiniMax H3)'),
    settings: z.record(z.string()).optional().describe('Workflow settings as strings, e.g. {"aspect":"16:9","duration":"6"}'),
    inputs_from: z.array(z.string()).max(30).optional().describe('Existing node ids to wire in as inputs (arrows)'),
    at: z.object({ x: z.number(), y: z.number() }).optional().describe('Board position; omit to place it in the middle of the view') } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'add_card', workflow: a.workflow, ...(a.prompt != null ? { prompt: a.prompt } : {}), ...(a.name ? { name: a.name } : {}), ...(a.model ? { model: a.model } : {}), ...(a.settings ? { settings: a.settings } : {}), ...(a.inputs_from ? { inputs_from: a.inputs_from } : {}), ...(a.at ? { at: a.at } : {}) });
      return text({ card: r.card, note: 'This is a draft card and has not run. ' + canvasNote + ' Use canvas_propose_run with its id.' }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_add_from_job', { title: 'Put an existing generation on the canvas', description: 'Place a finished generation (a picture, clip or sound from history / search_references) on a board as a result card, the same card the Assets drawer adds. Returns its node id: wire it into a new card with canvas_add_card { inputs_from: [id] } (e.g. workflow extend for a clip) or canvas_connect. `out` picks one output of a job that made several (0 = the first). Nothing runs or spends. The board must be open in the app.', inputSchema: {
    board_id: canvasBoard, job_id: z.string().min(1).describe('A finished job id (history, search_references → jobId, get_outputs)'), out: z.number().int().min(0).max(99).optional().describe('Which output of the job (0 = the first)'),
    at: z.object({ x: z.number(), y: z.number() }).optional().describe('Board position (its centre); omit for a free place in view') } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'add_from_job', job_id: a.job_id, ...(a.out != null ? { out: a.out } : {}), ...(a.at ? { at: a.at } : {}) });
      return text({ node: r.node ?? { id: r.id }, note: `On the board. Feed it into a new card with canvas_add_card { inputs_from: ["${r.node?.id ?? r.id}"] }.` }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_update_card', { title: 'Update a canvas card', description: 'Change a card on the board: prompt, workflow, model, settings, the nodes wired into it, or its active version (the one that flows on). `inputs_from` replaces the card input arrows with arrows from those node ids. Returns the updated card. Nothing runs.', inputSchema: {
    board_id: canvasBoard, card_id: canvasCard, workflow: z.string().optional().describe('New workflow id from canvas_list_workflows'), prompt: z.string().max(4000).optional(),
    model: z.string().optional().describe('Model key or provider id'), settings: z.record(z.string()).optional().describe('Workflow settings as strings'),
    inputs_from: z.array(z.string()).max(30).optional().describe('Node ids that should feed this card (replaces its input arrows)'),
    version: z.number().int().min(1).max(99).optional().describe('Pick the active version (1-based): the one that flows to the next card') } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'update_card', card_id: a.card_id, ...(a.workflow != null ? { workflow: a.workflow } : {}), ...(a.prompt != null ? { prompt: a.prompt } : {}), ...(a.model ? { model: a.model } : {}), ...(a.settings ? { settings: a.settings } : {}), ...(a.inputs_from ? { inputs_from: a.inputs_from } : {}), ...(a.version != null ? { version: a.version } : {}) });
      return text({ card: r.card, note: canvasNote }); } catch (e) { return fail(e); } });

  const zBatchItem = z.object({ kind: z.enum(['add_card', 'add_note', 'add_frame', 'connect', 'move_into']), ref: z.string().max(40).optional().describe('A temporary name ("k1") later items use in place of an id'),
    workflow: z.string().optional(), prompt: z.string().max(4000).optional(), name: z.string().max(80).optional(), model: z.string().optional(), settings: z.record(z.string()).optional(),
    inputs_from: z.array(z.string()).max(30).optional().describe('Node ids or refs that feed this card'), text: z.string().max(600).optional().describe('add_note text'),
    color: z.enum(['orange', 'yellow', 'violet', 'light-violet', 'blue', 'light-blue', 'green', 'light-green', 'red', 'light-red', 'grey', 'black', 'white']).optional(),
    frame: z.string().optional().describe('The frame (ref or id) a card or note goes in'), w: z.number().min(80).optional(), h: z.number().min(80).optional(),
    from_id: z.string().optional(), to_id: z.string().optional(), ids: z.array(z.string()).max(60).optional(), frame_id: z.string().optional(), at: z.object({ x: z.number(), y: z.number() }).optional() });
  s.registerTool('canvas_batch', { title: 'Make many canvas items at once', description: 'Bulk create on the board in one go: up to 80 add_card / add_note / add_frame / connect / move_into items. Give items a `ref` ("k1") and use it in later items where an id goes (inputs_from, frame, from_id, to_id, ids, frame_id). It is all or nothing: one bad item refuses the whole batch with the reason and nothing is made. Items without `at` are laid out as one group (each frame a row band, never stacked). The user sees one smooth wave and one dock line, and one Undo removes it all. Cards are DRAFTS: nothing runs; price them all with one canvas_propose_run. An add_card item without `model`: ' + CANVAS_DEFAULTS_NOTE + ' Use single tools when you are walking the user through a step.', inputSchema: {
    board_id: canvasBoard, items: z.array(zBatchItem).min(1).max(80), note: z.string().max(200).optional().describe('A short line for the activity feed') } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'batch', items: a.items, ...(a.note ? { note: a.note } : {}) });
      return text({ refs: r.refs ?? {}, cards: r.cards ?? [], notes: r.notes ?? [], frames: r.frames ?? [], arrows: r.arrows ?? [], line: r.line ?? null, note: 'These are draft cards and have not run. ' + canvasNote + ' Use canvas_propose_run with all the card ids for one quote.' }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_wait_for_message', { title: 'Wait for the user on the canvas', description: `Listen to a board\'s dock (what to do when the user says "${LISTEN_PHRASE}"): waits up to timeout_sec (default 50, max 60) and returns as soon as the user types a message (or presses Go / Cancel). The first call (no since) also returns what they typed before you started. Each message is the user\'s own request; \`selection\` lists the cards they had selected. Answer each with canvas_say. Pass \`since\` = the previous \`next\` so nothing is missed. Returns no messages at the timeout: call it again. Loop: wait, plan (canvas_list_workflows), build (canvas_batch), quote (canvas_propose_run, never run without their Go), review takes (canvas_review), reply (canvas_say), wait again. One agent per board: if another agent is listening you get a "busy" error. Spends nothing.`, inputSchema: {
    board_id: canvasBoard, since: z.number().int().min(0).optional().describe('The `next` from the previous call (omit the first time: only new messages)'), timeout_sec: z.number().int().min(0).max(60).optional().describe('How long to wait (default 50)') } },
    async (a) => { try { const q = new URLSearchParams(); if (a.since != null) q.set('since', String(a.since)); q.set('timeout_sec', String(a.timeout_sec ?? 50));
      const r: any = await get(`/api/canvas/boards/${encodeURIComponent(a.board_id)}/agent/wait?${q}`);
      return text({ ...r, next_call: `canvas_wait_for_message { board_id: "${a.board_id}", since: ${r.next} }` }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_review', { title: 'Review versions on the canvas', description: 'Record your own look at a card\'s versions: for each version a verdict, "fits" or "check" with a short reason (wrong character, wrong setting or mood, the action doesn\'t match the beat, a defect such as extra limbs, garbled text or a watermark), and the version you recommend. Look at each version first (get_asset with include_image, or the card\'s result URLs). The board shows a calm badge per version and a dot on your pick. It never changes the active version: the user chooses. Free: nothing runs.', inputSchema: {
    board_id: canvasBoard, cards: z.array(z.object({ card_id: z.string().min(1), reviews: z.array(z.object({ version: z.number().int().min(1).max(99), verdict: z.enum(['fits', 'check']), reason: z.string().max(160).optional() })).min(1).max(24), recommend: z.number().int().min(1).max(99).nullable().optional() })).min(1).max(30),
    say: z.string().max(1200).optional().describe('Your recommendation in the panel, e.g. "Shot 2: I\'d pick v2: her face matches the sheet and the lamp is lit. You choose."') } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'review_versions', cards: a.cards, ...(a.say ? { say: a.say } : {}) }); return text({ ...r, note: 'Badges are on the board. The active version is still the user\'s choice.' }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_next_steps', { title: 'What next for a canvas card', description: 'The workflows that take what a node makes (a picture: animate, upscale, relight…; a clip: add sound, extend, upscale; text: picture, clip, music, read it aloud), the same "What next?" list the board shows. Use one as canvas_add_card workflow with inputs_from [card_id]. Spends nothing.', inputSchema: { board_id: canvasBoard, card_id: canvasCard } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'next_steps', card_id: a.card_id }); return text({ ...r, note: 'Nothing was added. Add one with canvas_add_card { workflow, inputs_from: [card_id] }.' }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_connect', { title: 'Connect two canvas cards', description: 'Draw an input arrow from one node to another on the board (for example a result or a finished card into a new card). Connections are typed: a picture, a clip, a sound or text can only go into a card that takes it (the error says what the card takes). Returns the arrow id. Nothing runs.', inputSchema: { board_id: canvasBoard, from_id: z.string().min(1).describe('Node id the arrow starts at'), to_id: z.string().min(1).describe('Card id the arrow feeds') } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'connect', from_id: a.from_id, to_id: a.to_id }); return text({ arrowId: r.arrowId ?? null, from_id: a.from_id, to_id: a.to_id, note: canvasNote }); } catch (e) { return fail(e); } });

  /* the board as a plan (2026-10-27): notes, named frames, cards dropped into frames, a pointer, and "pick one". The user watches the agent's cursor do each. */
  const zPoint = z.object({ x: z.number(), y: z.number() });
  s.registerTool('canvas_add_note', { title: 'Add a sticky note to the canvas', description: 'Add a sticky note (an idea, a shot description, a question) to the board. Returns its id. `frame_id` puts it inside a frame. Nothing runs.', inputSchema: {
    board_id: canvasBoard, text: z.string().min(1).max(600).describe('The note text'), at: zPoint.optional().describe('Board position (centre); omit for the middle of the view'),
    color: z.enum(['orange', 'yellow', 'violet', 'light-violet', 'blue', 'light-blue', 'green', 'light-green', 'red', 'light-red', 'grey', 'black', 'white']).optional(), frame_id: z.string().optional().describe('A frame id from canvas_add_frame') } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'add_note', text: a.text, ...(a.at ? { at: a.at } : {}), ...(a.color ? { color: a.color } : {}), ...(a.frame_id ? { frame_id: a.frame_id } : {}) }); return text({ ...r, note: canvasNote }); } catch (e) { return fail(e); } });
  s.registerTool('canvas_add_frame', { title: 'Add a named frame to the canvas', description: 'Add a named frame ("Key frames", "Shot 3 · The discovery") to group cards and notes. Give `around` (node ids) to fit it around them and move them in, or `at` (top-left) with `w` and `h`. Returns its id. Nothing runs.', inputSchema: {
    board_id: canvasBoard, name: z.string().min(1).max(80), around: z.array(z.string()).max(60).optional().describe('Node ids the frame wraps and holds'), at: zPoint.optional().describe('Top-left corner'),
    w: z.number().min(80).optional(), h: z.number().min(80).optional() } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'add_frame', name: a.name, ...(a.around?.length ? { around: a.around } : {}), ...(a.at ? { at: a.at } : {}), ...(a.w ? { w: a.w } : {}), ...(a.h ? { h: a.h } : {}) }); return text({ ...r, note: canvasNote }); } catch (e) { return fail(e); } });
  s.registerTool('canvas_move_into', { title: 'Move canvas cards into a frame', description: 'Move cards or notes into a frame (they keep their place on the board and move with the frame from then on). Nothing runs.', inputSchema: { board_id: canvasBoard, ids: z.array(z.string()).min(1).max(60), frame_id: z.string().min(1) } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'move_into', ids: a.ids, frame_id: a.frame_id }); return text({ ...r, note: canvasNote }); } catch (e) { return fail(e); } });
  s.registerTool('canvas_point_at', { title: 'Point at something on the canvas', description: 'Move your cursor to nodes (or a point) and circle them, with an optional short label, so the user sees what you mean. Nothing changes on the board.', inputSchema: { board_id: canvasBoard, ids: z.array(z.string()).max(30).optional(), at: zPoint.optional(), text: z.string().max(120).optional() } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'point_at', ...(a.ids?.length ? { ids: a.ids } : {}), ...(a.at ? { at: a.at } : {}), ...(a.text ? { text: a.text } : {}) }); return text({ ...r, note: canvasNote }); } catch (e) { return fail(e); } });
  s.registerTool('canvas_ask_pick', { title: 'Ask the user to pick one', description: 'Ask the user to pick one of 2 to 12 cards: they pulse on the board until the user clicks one. Returns a pick id; the choice arrives in canvas_inbox as a user message with meta.pickId and meta.cardId. Nothing runs.', inputSchema: { board_id: canvasBoard, card_ids: z.array(z.string()).min(2).max(12), text: z.string().max(200).optional().describe('What to ask, e.g. "Pick your hero shot"') } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'ask_pick', card_ids: a.card_ids, ...(a.text ? { text: a.text } : {}) }); return text({ pick: r.pick, next: 'Read the choice with canvas_inbox (a user message with meta.pickId).' }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_remove_card', { title: 'Remove a canvas card', description: 'Remove a card (and its arrows) from the board. Nothing is deleted from Assets: finished results stay in the library. Nothing runs.', inputSchema: { board_id: canvasBoard, card_id: canvasCard } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'remove_card', card_id: a.card_id }); return text({ removed: r.removed ?? a.card_id, note: canvasNote }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_propose_run', { title: 'Propose runs on the canvas', description: 'Price every card and show ONE proposal in the canvas panel: each card, its price, the total, the agent budget left, and Go / Cancel. Returns a proposal id. NOTHING SPENDS: the user must press Go in the app. Use set_budget first when the user gave a budget; the proposal shows what is left and Go is disabled when it is over. A card that can\'t run on this server (its model isn\'t wired here, or an input is missing) is listed under skipped with the reason and left out of runCardIds and the total; Go runs the rest. Fix or swap its model with canvas_update_card and propose again to include it. Then poll canvas_proposal_status.', inputSchema: {
    board_id: canvasBoard, card_ids: z.array(z.string().min(1)).min(1).max(30).describe('Card ids to run'), note: z.string().max(2000).optional().describe('A short line for the user, e.g. "Three launch images, under $1"') } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'propose_run', card_ids: a.card_ids, ...(a.note ? { note: a.note } : {}) });
      return text({ proposal: r.proposal, next: 'Ask the user to press Go in the canvas panel. Nothing runs until they do. Poll canvas_proposal_status with this proposal id.' }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_proposal_status', { title: 'Canvas proposal status', description: 'A proposal from canvas_propose_run: pending (waiting for the user), running (they pressed Go), approved (with the job ids that were submitted), cancelled or failed (with the reason). Spends nothing.', inputSchema: { proposal_id: z.string().min(1).describe('Proposal id from canvas_propose_run') } },
    async ({ proposal_id }) => { try { const p: any = await get(`/api/canvas/agent/proposals/${encodeURIComponent(proposal_id)}`); return text({ proposal: p, ...(p.status === 'approved' ? { jobIds: p.jobIds ?? [] } : {}), note: 'Approved means the user pressed Go and the runs were submitted. Use get_job with a job id for progress.' }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_say', { title: 'Say something on the canvas', description: 'Send a message from the agent to the user in the canvas panel. It appears in the activity feed, and the user can reply there; read replies and Go / Cancel decisions with canvas_inbox. Works even when the board is not open (the message waits). Spends nothing.', inputSchema: { board_id: canvasBoard, text: z.string().min(1).max(4000).describe('The message to show the user') } },
    async (a) => { try { const r: any = await canvasOp(a.board_id, { kind: 'say', text: a.text }); return text({ ...r, note: 'Shown in the panel. Read the user reply with canvas_inbox.' }); } catch (e) { return fail(e); } });

  s.registerTool('canvas_inbox', { title: 'Read the canvas inbox', description: 'What the user typed in the canvas panel and their Go / Cancel decisions, oldest first. Pass `since` = the `next` value from the last call to get only new items. Decisions have type "decision" and decision "go" or "cancel" with the proposal id. Spends nothing.', inputSchema: { board_id: canvasBoard, since: z.number().int().min(0).optional().describe('Only items after this sequence number (use the previous next)') } },
    async (a) => { try { const q = new URLSearchParams(); if (a.since != null) q.set('since', String(a.since)); const r: any = await get(`/api/canvas/boards/${encodeURIComponent(a.board_id)}/agent/inbox?${q}`);
      return text({ ...r, note: 'Pass next as since on the next call.' }); } catch (e) { return fail(e); } });

  return s;
}
