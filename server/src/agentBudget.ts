/**
 * Agent budgets (hero feature "MCP agent ad", 2026-10-21; docs/MCP.md "Make a 20-second ad with a $2 budget").
 *
 * An agent budget is a small server-side record {id, name, budgetUsd, budgetCredits}. A client (the MCP server, or any REST caller) sends its id
 * in the `X-OHF-Agent-Budget` header on quotes and submits. It reuses the spend log (billing.ts), not a parallel ledger:
 *  - spent = the agent's spend-log rows counted with countedUsd() (the same rule as the provider spending limits: actual cost when reported,
 *    else the estimate; $0 for local runs, sample runs, never-started and not-charged failed runs) plus submits still being admitted;
 *  - credits (team mode): the credits charged on its rows ($0 for local, demo and failed runs, which the team ledger refunds).
 * Submit (index.ts createJob): a run that would go over is refused with 400 errorType 'limit', code 'agent_budget', BEFORE the job is enqueued,
 * so nothing reaches a provider. Quotes (GET /api/tools/:id/price, /api/models/quote) carry `agentBudget` and, over budget, runnable:false.
 * Local / Local runs cost $0 and always fit. An unknown or closed budget id fails closed (400), so a typo can never mean "no limit".
 *
 * Why a header and not the MCP session: the MCP HTTP transport is stateless (a fresh server per request, no session id) and stdio is one
 * process per client, so the MCP server keeps "its" budget id and sends it on every API call. The same header works for REST callers.
 *
 * Also here: POST /api/compose (stitch clips + a music bed with ffmpeg, a local $0 step) and GET /api/agent/budgets/:id/receipt.
 * Stored in kv 'agent.budgets' (so export/import carries it).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getKv, setKv } from './db.js';
import { DATA_DIR } from './config.js';
import { jobs, persistJob, type Job } from './jobs.js';
import { billingMode } from './billingMode.js';
import { agentSpendRows, countedUsd, billingInfo, recordSpend, settleSpend, usd as fmt, type SpendRow } from './billing.js';
import { getTool } from './tools/registry.js';
import { jobModelFields } from './routing/modelRegistry.js';
import { runFfmpeg, mediaDuration, videoSize, hasAudio } from './ffmpeg.js';
import { LOCAL_LABEL } from './shared/modelIds.js';
import { pngSize } from './shareExport.js';
import { composeRender, cleanTmp, type ComposeCard } from './compose.js';
import { TRANSITIONS, REFRAME_FITS, CARD_STYLES, CARD_SEC, CARD_TEXT_MAX, END_CARD_TEXT, TRANSITION_SEC, DEFAULT_MIX, isSplitJoint, type JointType, type StitchTransition, type ReframeFit, type CardStyle, type CardMode } from './shared/stitchTimeline.js';

export const AGENT_HEADER = 'x-ohf-agent-budget';
export interface AgentRefusal { at: number; toolId: string; model: string | null; neededUsd: number; remainingUsd: number | null; neededCredits: number; remainingCredits: number | null; message: string }
export interface AgentBudget { id: string; name: string; budgetUsd: number | null; budgetCredits: number | null; createdAt: number; closedAt: number | null; client: string | null; refusals: AgentRefusal[] }
const KV = 'agent.budgets';
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const load = (): Record<string, AgentBudget> => getKv<Record<string, AgentBudget>>(KV, {}) ?? {};
const saveAll = (m: Record<string, AgentBudget>) => setKv(KV, m);
export const getBudget = (id: string): AgentBudget | undefined => load()[id];
const update = (id: string, fn: (b: AgentBudget) => void) => { const m = load(); const b = m[id]; if (!b) return; fn(b); saveAll(m); };

/** Submits that passed the check but have no spend row yet (the few awaits between the check and recordSpend): counted so two parallel submits can't both fit. */
const pending = new Map<string, { budgetId: string; usd: number; credits: number; at: number }>();
const creditsOf = (r: SpendRow) => (r.demo || r.billedTo === 'local' || ['failed', 'blocked', 'canceled'].includes(r.status) ? 0 : Number(r.credits) || 0);
/** excludeJobId: a job moving to its next route (allowFallback): its own row is about to move there, so it isn't counted twice. */
export function spentOf(b: AgentBudget, excludeJobId?: string) {
  const rowsAll = agentSpendRows(b.id); const ids = new Set(rowsAll.map((r) => r.jobId)); const list = excludeJobId ? rowsAll.filter((r) => r.jobId !== excludeJobId) : rowsAll;
  for (const [k, p] of pending) if (ids.has(k) || Date.now() - p.at > 120_000) pending.delete(k);
  const extra = [...pending.entries()].filter(([k, p]) => p.budgetId === b.id && k !== excludeJobId).map(([, p]) => p);
  return { list, usd: r4(list.reduce((s, r) => s + countedUsd(r), 0) + extra.reduce((s, p) => s + p.usd, 0)), credits: list.reduce((s, r) => s + creditsOf(r), 0) + extra.reduce((s, p) => s + p.credits, 0) };
}
export function budgetView(b: AgentBudget) {
  const s = spentOf(b);
  return { id: b.id, name: b.name, budgetUsd: b.budgetUsd, budgetCredits: b.budgetCredits, spentUsd: s.usd, remainingUsd: b.budgetUsd == null ? null : r4(Math.max(0, b.budgetUsd - s.usd)),
    spentCredits: s.credits, remainingCredits: b.budgetCredits == null ? null : Math.max(0, b.budgetCredits - s.credits), runs: s.list.length, refusals: b.refusals.length,
    createdAt: new Date(b.createdAt).toISOString(), closed: !!b.closedAt, billingMode: billingMode() };
}
/** The small line for a result (ResultView "Made by agent <name> · Budget $2.00 · Spent $1.84"). */
export function jobAgentView(j: Job) {
  if (!j.agent?.id) return null; const b = getBudget(j.agent.id); if (!b) return { id: j.agent.id, name: j.agent.name, budgetUsd: null, spentUsd: null };
  const v = budgetView(b); return { id: b.id, name: b.name, budgetUsd: v.budgetUsd, spentUsd: v.spentUsd, budgetCredits: v.budgetCredits, spentCredits: v.spentCredits };
}

export interface BudgetBlock { code: 'agent_budget'; message: string; budgetId: string; agentName: string; budgetUsd: number | null; spentUsd: number; remainingUsd: number | null; neededUsd: number; budgetCredits: number | null; spentCredits: number; remainingCredits: number | null; neededCredits: number }
/** Would a run of estUsd (and credits, team mode) go over this budget? Free runs ($0, local) never do. */
export function budgetBlockFor(b: AgentBudget, estUsd: number, credits: number, excludeJobId?: string): BudgetBlock | null {
  const s = spentOf(b, excludeJobId); const leftUsd = b.budgetUsd == null ? null : r4(Math.max(0, b.budgetUsd - s.usd)); const leftCr = b.budgetCredits == null ? null : Math.max(0, b.budgetCredits - s.credits);
  const overUsd = b.budgetUsd != null && estUsd > 0 && s.usd + estUsd > b.budgetUsd + 1e-9;
  const overCr = b.budgetCredits != null && credits > 0 && s.credits + credits > b.budgetCredits;
  if (!overUsd && !overCr) return null;
  const message = overUsd
    ? `Over the agent budget for "${b.name}": ${fmt(s.usd)} of ${fmt(b.budgetUsd!)} spent (${fmt(leftUsd!)} left), and this run needs about ${fmt(estUsd)}. Nothing was sent to a provider. Pick a cheaper model or run_on (local is free), or ask the user for a bigger budget.`
    : `Over the agent budget for "${b.name}": ${s.credits} of ${b.budgetCredits} credits used (${leftCr} left), and this run needs ${credits}. Nothing was sent to a provider.`;
  return { code: 'agent_budget', message, budgetId: b.id, agentName: b.name, budgetUsd: b.budgetUsd, spentUsd: s.usd, remainingUsd: leftUsd, neededUsd: r4(estUsd), budgetCredits: b.budgetCredits, spentCredits: s.credits, remainingCredits: leftCr, neededCredits: credits };
}
const NC = { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' };
/** The budget named by the request header. undefined = no header (no agent budget); {error} = unknown or closed (fail closed). */
export function budgetOfRequest(req: FastifyRequest): AgentBudget | { error: string; status: number } | undefined {
  const raw = req.headers[AGENT_HEADER]; const id = (Array.isArray(raw) ? raw[0] : raw)?.trim(); if (!id) return undefined;
  return budgetById(id);
}
/** A budget by id; {error} = unknown or closed (fail closed). */
export function budgetById(id: string): AgentBudget | { error: string; status: number } {
  const b = getBudget(id); if (!b) return { status: 400, error: `Unknown agent budget "${id.slice(0, 40)}". Create one with POST /api/agent/budgets (MCP: set_budget). Nothing was charged.` };
  if (b.closedAt) return { status: 400, error: `The agent budget "${b.name}" is closed. Create a new one to keep going. Nothing was charged.` };
  return b;
}
/** createJob (index.ts), right before enqueue: refuse a run over the agent budget, or hold its amount until its spend row exists. Returns the reply when refused. */
export function admitAgentRun(req: FastifyRequest, reply: FastifyReply, run: { jobId: string; toolId: string; model: string | null; estUsd: number; credits: number }): FastifyReply | { agent: { id: string; name: string } | null } {
  const a = admitBudget(budgetOfRequest(req), run); return 'refused' in a ? reply.code(a.refused.status).send(a.refused.body) : a;
}
/** The check behind admitAgentRun, without a reply (also used before an allowFallback move to the next route, spendGuard.ts guardNextRoute):
 *  refused → {status, body} (the same 400 a submit gets); else the budget's {id, name} (null without one), its amount held until the spend row exists. */
/** hold:false = check only, nothing held (a story's TOTAL, POST /api/stories and /retry: each shot is then admitted and held on its own submit). */
export function admitBudget(b: AgentBudget | { error: string; status: number } | undefined, run: { jobId: string; toolId: string; model: string | null; estUsd: number; credits: number; excludeJobId?: string; hold?: boolean }):
  { refused: { status: number; message: string; body: Record<string, any> } } | { agent: { id: string; name: string } | null } {
  if (!b) return { agent: null };
  if ('error' in b) return { refused: { status: b.status, message: b.error, body: { error: b.error, errorType: 'limit', code: 'agent_budget_unknown', issues: [{ code: 'agent_budget_unknown', field: AGENT_HEADER, message: b.error }], charged: false, refund: NC } } };
  const blk = budgetBlockFor(b, run.estUsd, run.credits, run.excludeJobId);
  if (blk) {
    update(b.id, (x) => { x.refusals = [...x.refusals, { at: Date.now(), toolId: run.toolId, model: run.model, neededUsd: blk.neededUsd, remainingUsd: blk.remainingUsd, neededCredits: blk.neededCredits, remainingCredits: blk.remainingCredits, message: blk.message }].slice(-50); });
    return { refused: { status: 400, message: blk.message, body: { error: blk.message, errorType: 'limit', ...blk, issues: [{ code: 'agent_budget', field: AGENT_HEADER, message: blk.message }], charged: false, refund: NC } } };
  }
  if (run.hold !== false) pending.set(run.jobId, { budgetId: b.id, usd: run.estUsd > 0 ? run.estUsd : 0, credits: run.credits > 0 ? run.credits : 0, at: Date.now() });
  return { agent: { id: b.id, name: b.name } };
}

const isVideo = (u: string) => /\.(mp4|mov|webm|mkv)$/i.test(u);
const isAudio = (u: string) => /\.(m4a|mp3|wav|aac|ogg|flac)$/i.test(u);
/** A job id or a /files/… URL → the file on disk (+ the job, when one). */
function mediaRef(ref: string, want: 'video' | 'audio'): { file: string; url: string; job: Job | null } | { error: string } {
  const s = String(ref ?? '').trim(); if (!s) return { error: 'empty reference' };
  const m = s.match(/\/files\/([^/?#]+)/);
  if (m) { const name = decodeURIComponent(m[1]); const file = path.join(DATA_DIR, path.basename(name)); return existsSync(file) ? { file, url: `/files/${path.basename(name)}`, job: null } : { error: `${s}: file not found` }; }
  const j = jobs.get(s); if (!j) return { error: `${s}: not a job id or /files/ URL` };
  if (j.status !== 'done') return { error: `job ${s} is ${j.status}, not done` };
  const outs = (j.outputs ?? []).map((o) => o.url).filter((u) => u?.startsWith('/files/'));
  const pick = want === 'video' ? outs.find(isVideo) : outs.find(isAudio) ?? outs.find(isVideo);
  if (!pick) return { error: `job ${s} has no ${want} output` };
  return { file: path.join(DATA_DIR, path.basename(pick)), url: pick, job: j };
}

/** Receipt: what this agent made, where each run ran, estimate vs actual, total vs budget. */
export function receiptOf(b: AgentBudget) {
  const v = budgetView(b);
  const items = agentSpendRows(b.id).sort((x, y) => x.createdAt - y.createdAt).map((r) => {
    const j = jobs.get(r.jobId); const mf = jobModelFields({ toolId: r.toolId, provider: r.model, route: r.route, input: j?.input, modelKey: r.modelKey ?? j?.modelKey ?? undefined, runOn: r.runOn ?? undefined });
    return { jobId: r.jobId, toolId: r.toolId, toolName: getTool(r.toolId)?.name ?? (r.toolId === 'compose' ? 'Stitch (ffmpeg)' : r.toolId), prompt: (j?.input?.prompt as string | undefined)?.slice(0, 120) ?? null,
      model: r.modelName ?? mf.modelKey ?? r.model, modelKey: mf.modelKey, runOn: mf.runOn, ranOn: r.billedTo === 'local' ? LOCAL_LABEL : mf.runOnLabel ?? billingInfo(r.billedTo).name,
      billedTo: r.billedTo === 'local' ? 'nobody (free)' : billingInfo(r.billedTo).name, status: r.status, demo: r.demo,
      estUsd: r.estUsd, actualUsd: r.actualUsd, countedUsd: countedUsd(r), credits: creditsOf(r),
      outputs: (j?.outputs ?? []).map((o) => ({ label: o.label, url: o.url })), createdAt: new Date(r.createdAt).toISOString() };
  });
  const est = r4(items.reduce((s, i) => s + (i.demo ? 0 : i.estUsd), 0)); const act = items.filter((i) => i.actualUsd != null);
  return { budget: v, items, refusals: b.refusals.map((x) => ({ ...x, at: new Date(x.at).toISOString() })),
    totals: { runs: items.length, estimatedUsd: est, actualUsd: act.length ? r4(act.reduce((s, i) => s + (i.actualUsd ?? 0), 0)) : null, actualRuns: act.length, spentUsd: v.spentUsd, budgetUsd: v.budgetUsd, remainingUsd: v.remainingUsd, spentCredits: v.spentCredits, budgetCredits: v.budgetCredits },
    note: 'spentUsd counts the actual cost when the provider reports one, else the estimate (the same rule as the spending limits). Local runs, sample runs and failed runs on providers that don’t charge failures count $0.' };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export interface ClipTrim { in?: number; out?: number }
/** POST /api/compose trims: [{in?, out?} | null, …] (seconds; at most one per clip; null or {} = the whole clip). Only the shape is checked
 *  here; lengths are clamped later against each clip (clampTrim). */
export function parseTrims(raw: unknown, clipCount: number): { list: (ClipTrim | null)[] } | { error: string; field: string } {
  if (raw == null || raw === '') return { list: [] };
  if (!Array.isArray(raw) || raw.length > clipCount) return { field: 'trims', error: 'trims is a list of {in, out} in seconds, at most one per clip, in clip order (null keeps a clip whole).' };
  const list: (ClipTrim | null)[] = [];
  for (const [i, t] of raw.entries()) {
    if (t == null) { list.push(null); continue; }
    if (typeof t !== 'object' || Array.isArray(t)) return { field: `trims[${i}]`, error: `trims[${i}] must be {in, out} in seconds, or null.` };
    const num = (v: unknown) => v == null || v === '' ? undefined : Number(v); const a = num((t as any).in); const z = num((t as any).out);
    if ((a !== undefined && !(Number.isFinite(a) && a >= 0)) || (z !== undefined && !(Number.isFinite(z) && z > 0))) return { field: `trims[${i}]`, error: `trims[${i}]: in and out are seconds (in ≥ 0, out > 0).` };
    if (a !== undefined && z !== undefined && z - a < 0.1) return { field: `trims[${i}]`, error: `trims[${i}]: out must be at least 0.1 s after in.` };
    list.push(a === undefined && z === undefined ? null : { in: a, out: z });
  }
  return { list };
}
/** A trim against a clip of `dur` seconds: in and out clamped inside the clip (at least 0.1 s kept); null when it keeps the whole clip. */
export function clampTrim(t: ClipTrim | null | undefined, dur: number): { in: number; out: number } | null {
  if (!t || !(dur > 0)) return null;
  const a = r2(Math.min(Math.max(0, t.in ?? 0), Math.max(0, dur - 0.1))); const z = r2(Math.max(a + 0.1, Math.min(t.out ?? dur, dur)));
  return a <= 0.01 && z >= dur - 0.01 ? null : { in: a, out: Math.min(z, r2(dur)) };
}

const bad = (reply: FastifyReply, field: string, message: string, code = 'invalid') => reply.code(400).send({ error: message, errorType: 'validation', code, issues: [{ code, field, message }] });
export function registerAgentBudgets(app: FastifyInstance) {
  app.post<{ Body: { name?: unknown; budgetUsd?: unknown; budgetCredits?: unknown; client?: unknown } }>('/api/agent/budgets', async (req, reply) => {
    const b = req.body ?? {}; const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name || name.length > 60) return bad(reply, 'name', 'name is required (the agent’s name, 1–60 characters).', 'required');
    const num = (v: unknown, field: string, max: number) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? n : { field }; };
    const u = num(b.budgetUsd, 'budgetUsd', 100_000); const c = num(b.budgetCredits, 'budgetCredits', 10_000_000);
    if (u && typeof u === 'object') return bad(reply, 'budgetUsd', 'budgetUsd must be a number of USD between 0 and 100,000.');
    if (c && typeof c === 'object') return bad(reply, 'budgetCredits', 'budgetCredits must be a whole number of credits between 0 and 10,000,000.');
    if (u == null && c == null) return bad(reply, 'budgetUsd', 'Give budgetUsd (own-accounts mode) and/or budgetCredits (team mode).', 'required');
    const rec: AgentBudget = { id: `ab_${randomUUID().replace(/-/g, '').slice(0, 12)}`, name, budgetUsd: u == null ? null : Math.round((u as number) * 100) / 100, budgetCredits: c == null ? null : Math.round(c as number),
      createdAt: Date.now(), closedAt: null, client: typeof b.client === 'string' ? b.client.slice(0, 60) : null, refusals: [] };
    const m = load(); m[rec.id] = rec; saveAll(m);
    return reply.code(201).send({ ...budgetView(rec), header: AGENT_HEADER });
  });
  app.get('/api/agent/budgets', async () => ({ items: Object.values(load()).sort((a, b) => b.createdAt - a.createdAt).map(budgetView) }));
  app.get<{ Params: { id: string } }>('/api/agent/budgets/:id', async (req, reply) => { const b = getBudget(req.params.id); return b ? budgetView(b) : reply.code(404).send({ error: 'agent budget not found', errorType: 'not_found' }); });
  app.get<{ Params: { id: string } }>('/api/agent/budgets/:id/receipt', async (req, reply) => { const b = getBudget(req.params.id); return b ? receiptOf(b) : reply.code(404).send({ error: 'agent budget not found', errorType: 'not_found' }); });
  app.post<{ Params: { id: string } }>('/api/agent/budgets/:id/close', async (req, reply) => { const b = getBudget(req.params.id); if (!b) return reply.code(404).send({ error: 'agent budget not found', errorType: 'not_found' });
    update(b.id, (x) => { x.closedAt ??= Date.now(); }); return budgetView(getBudget(b.id)!); });

  // Quotes: agentBudget {id, name, budgetUsd, spentUsd, remainingUsd, thisRunUsd, fits} and, over budget, runnable:false (registered after billing's cost hook).
  app.addHook('preSerialization', async (req, _reply, payload: any) => {
    const url = req.url.split('?')[0];
    if (req.method !== 'GET' || !(url === '/api/models/quote' || /^\/api\/tools\/[^/]+\/price$/.test(url)) || !payload || typeof payload !== 'object' || Array.isArray(payload) || !('credits' in payload)) return payload;
    const b = budgetOfRequest(req); if (!b) return payload;
    if ('error' in b) return { ...payload, agentBudget: { error: b.error }, runnable: false, chargeable: false, blockedReason: b.error, blockedCode: 'agent_budget_unknown', reasonCode: 'agent_budget_unknown' };
    const estUsd = Number(payload.cost?.estUsd) || 0; const credits = payload.demo === true ? 0 : Number(payload.credits) || 0;
    const blk = payload.runnable !== false ? budgetBlockFor(b, estUsd, credits) : null; const v = budgetView(b);
    const out: any = { ...payload, agentBudget: { id: v.id, name: v.name, budgetUsd: v.budgetUsd, spentUsd: v.spentUsd, remainingUsd: v.remainingUsd, budgetCredits: v.budgetCredits, remainingCredits: v.remainingCredits, thisRunUsd: estUsd, thisRunCredits: credits, fits: !blk } };
    if (blk) Object.assign(out, { runnable: false, chargeable: false, agentBudgetBlock: blk, blockedReason: blk.message, blockedCode: 'agent_budget', reasonCode: 'agent_budget' });
    return out;
  });

  /** Stitch clips (+ an optional music bed and a voice track) into one video with ffmpeg on this computer: free, recorded in the spend log at $0,
   *  and a job in Assets. layout "side-by-side" puts two clips next to each other (a before/after); aspect centre-crops the result (free cutdowns).
   *  trims (Stitch timeline, 2026-10-27): an optional {in, out} per clip (seconds, null = the whole clip), cut in each clip's own ffmpeg input and
   *  clamped to the clip; videoFade: the picture (and every sound) fades to black over fadeOutSec at the end, not only the music.
   *  Stitch editor (2026-10-27, compose.ts does the work): transition cut | crossfade | dip (+ transitionSec); fit fit | fill | blur with
   *  cropX / cropY (reframe to aspect from the first clip's short side; without fit the older centre crop stays); clipVolume / musicVolume /
   *  voiceVolume (gains on levelled tracks, 0–2), duck + duckAmount (the bed dips under the voice), duckClips (Film: the music also dips under the clips' own sound when keepClipAudio), normalize (−14 LUFS, default on), musicLoop;
   *  titleCard / endCard {text, style, mode black | over, sec} (a PNG part of the same name wins over the text); captions [{start, end, y}] with
   *  PNG parts cue0…cueN. JSON, or multipart with the JSON in a `body` field plus the PNG parts. */
  app.post('/api/compose', async (req, reply) => {
    const id = randomUUID().slice(0, 8); const tmp = path.join(DATA_DIR, `.${id}-stitch`);
    let body: Record<string, any> = (req.body ?? {}) as Record<string, any>; const pngs: Record<string, string> = {};
    if ((req as any).isMultipart?.()) {
      body = {}; mkdirSync(tmp, { recursive: true });
      try { for await (const part of (req as any).parts()) {
        if (part.type === 'file') { const b: Buffer = await part.toBuffer(); if (!/^(titleCard|endCard|cue\d{1,3})$/.test(part.fieldname)) continue;
          if (b.length > 8 * 1024 * 1024 || !pngSize(b)) { cleanTmp(tmp); return bad(reply, part.fieldname, `${part.fieldname} must be a PNG under 8 MB.`, 'validation'); }
          const f = path.join(tmp, `${part.fieldname}.png`); writeFileSync(f, b); pngs[part.fieldname] = f; }
        else if (part.fieldname === 'body') body = JSON.parse(String(part.value ?? '{}')); } }
      catch { cleanTmp(tmp); return bad(reply, 'body', 'Send JSON, or multipart with the JSON in a "body" field and PNG parts (titleCard, endCard, cue0…).', 'validation'); }
    }
    const fail = (field: string, msg: string, code = 'validation') => { cleanTmp(tmp); return bad(reply, field, msg, code); };
    const clipsIn = Array.isArray(body.clips) ? body.clips.map(String) : [];
    if (clipsIn.length < 1 || clipsIn.length > 20) return fail('clips', 'clips must list 1–20 video job ids or /files/ URLs, in order.', 'required');
    const layout = body.layout == null || body.layout === '' ? 'sequence' : String(body.layout);
    if (layout !== 'sequence' && layout !== 'side-by-side') return fail('layout', 'layout is "sequence" (default) or "side-by-side".');
    if (layout === 'side-by-side' && clipsIn.length !== 2) return fail('clips', 'side-by-side takes exactly 2 clips (left, right), e.g. the original and the result.');
    const aspectIn = body.aspect == null || body.aspect === '' ? null : String(body.aspect); const am = aspectIn ? /^(\d{1,2}):(\d{1,2})$/.exec(aspectIn) : null;
    if (aspectIn && (!am || !Number(am[1]) || !Number(am[2]))) return fail('aspect', 'aspect is like "9:16", "1:1", "4:5" or "16:9" (the result is centre-cropped to it).');
    const trims = parseTrims(body.trims, clipsIn.length); if ('error' in trims) return fail(trims.field, trims.error);
    const ed = parseEditor(body); if ('error' in ed) return fail(ed.field, ed.error);
    const seams = parseSeams(body.seams, clipsIn.length); if ('error' in seams) return fail(seams.field, seams.error);
    const b = budgetOfRequest(req); if (b && 'error' in b) { cleanTmp(tmp); return reply.code(b.status).send({ error: b.error, errorType: 'limit', code: 'agent_budget_unknown', charged: false, refund: NC }); }
    const clips = []; for (const [i, c] of clipsIn.entries()) { const r = mediaRef(c, 'video'); if ('error' in r) return fail(`clips[${i}]`, r.error, 'not_found'); clips.push(r); }
    const audio = body.audio != null && body.audio !== '' ? mediaRef(String(body.audio), 'audio') : null; if (audio && 'error' in audio) return fail('audio', audio.error, 'not_found');
    const voice = body.voice != null && body.voice !== '' ? mediaRef(String(body.voice), 'audio') : null; if (voice && 'error' in voice) return fail('voice', voice.error, 'not_found');
    const sizes = await Promise.all(clips.map((c) => videoSize(c.file))); if (!sizes[0]) return fail('clips[0]', 'Could not read the first clip (is ffmpeg installed?).', 'unreadable');
    const bad1 = sizes.findIndex((s) => !s); if (bad1 > 0) return fail(`clips[${bad1}]`, `Could not read clip ${bad1 + 1}: it has no picture.`, 'unreadable');
    const full = await Promise.all(clips.map((c) => mediaDuration(c.file)));
    /* trims: each clip's {in, out} clamped to its length (a trim past the end stops at the end) */
    const cuts = full.map((d, i) => clampTrim(trims.list[i], d));
    const clamped = trims.list.some((t, i) => t && full[i] > 0 && ((t.out ?? 0) > full[i] + 0.05 || (t.in ?? 0) > full[i]));
    const fade = Math.min(Math.max(0, Number(body.fadeOutSec ?? 1) || 0), 5);
    const videoFade = (body.videoFade === true || body.videoFade === 1 || body.videoFade === '1' || body.videoFade === 'true') && fade > 0;
    const keepClip = body.keepClipAudio === true || body.keepClipAudio === 1 || body.keepClipAudio === '1' || body.keepClipAudio === 'true';
    const clipHas = await Promise.all(clips.map((c) => hasAudio(c.file))); const anyClip = keepClip && clipHas.some(Boolean);
    const audioOk = !!audio && !('error' in audio) && await hasAudio(audio.file); const voiceOk = !!voice && !('error' in voice) && await hasAudio(voice.file);
    const others = voiceOk || anyClip;
    const musicVol = ed.musicVolume ?? (ed.normalize ? (others ? DEFAULT_MIX.music : 1) : (others ? 0.25 : 1));
    /* cards: an uploaded PNG, or the text drawn here (cardText.ts) */
    const cards: Record<'title' | 'end', ComposeCard | null> = { title: null, end: null };
    for (const k of ['title', 'end'] as const) { const c = ed[k]; if (!c) continue; const png = pngs[`${k}Card`] ?? null; if (png || c.text) cards[k] = { mode: c.mode, sec: c.sec, png, text: c.text, style: c.style }; }
    const capMeta = Array.isArray(body.captions) ? body.captions.slice(0, 400) : [];
    const captions = capMeta.map((c: any, i: number) => ({ png: pngs[`cue${i}`], start: Number(c?.start), end: Number(c?.end), y: Number(c?.y) })).filter((c: any) => c.png && c.end > c.start && c.start >= 0 && Number.isFinite(c.y));
    const outName = `${id}-ad.mp4`; const out = path.join(DATA_DIR, outName);
    const r = await composeRender({ clips: clips.map((c, i) => ({ file: c.file, full: full[i], cut: cuts[i], w: sizes[i]!.width, h: sizes[i]!.height, audio: clipHas[i] })), layout: layout as 'sequence' | 'side-by-side',
      aspect: am ? aspectIn : null, fit: ed.fit, crop: ed.crop, transition: ed.transition, transitionSec: ed.transitionSec, seams: seams.list.length ? seams.list : null, title: cards.title, end: cards.end, captions,
      music: audioOk ? { file: (audio as any).file, loop: ed.musicLoop } : null, voice: voiceOk ? (voice as any).file : null, keepClip,
      mix: { clip: ed.clipVolume ?? 1, music: musicVol, voice: ed.voiceVolume ?? 1, duck: ed.duck, duckAmount: ed.duckAmount, duckClips: ed.duckClips && anyClip, normalize: ed.normalize },
      fade, videoFade, out, tmp });
    cleanTmp(tmp);
    if (!r.ok || !existsSync(out)) { rmSync(out, { force: true }); return reply.code(500).send({ error: `ffmpeg could not stitch the clips (exit ${r.code}). Nothing was charged.`, errorType: 'server', refund: NC }); }
    const total = r.total; const W = r.W, H = r.H;
    const now = Date.now(); const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : `Stitched ${clips.length} clip${clips.length === 1 ? '' : 's'}`;
    const voiceLen = voiceOk ? await mediaDuration((voice as any).file) : 0; const musicLen = audioOk ? await mediaDuration((audio as any).file) : 0;
    const warnings = [...(audio && !audioOk ? ['The music file has no audio track, so it was left out.'] : []), ...(keepClip && !anyClip ? ['None of the clips has sound, so only the music / voice is heard.'] : []), ...(voice && !voiceOk ? ['The voice file has no audio track, so it was left out.'] : []), ...(clamped ? ['A trim ran past the end of its clip, so it stops where the clip ends.'] : []),
      ...(voiceLen > total + 0.3 ? [`The voice is ${r2(voiceLen)} s and the video ${r2(total)} s, so the voice is cut at the end.`] : []), ...(audioOk && !ed.musicLoop && musicLen > 0 && musicLen < total - 0.3 ? ['The music is shorter than the video, so the end is quiet. Turn on Loop to fill it.'] : []),
      ...r.warnings];
    const trimsOut = cuts.some(Boolean) ? cuts : null;
    const cardIn = (k: 'title' | 'end') => ed[k] && cards[k] && !r.warnings.some((w) => w.includes(`${k === 'title' ? 'title' : 'end'} card`)) ? { text: ed[k]!.text ?? null, style: ed[k]!.style, mode: ed[k]!.mode, sec: ed[k]!.sec } : null;
    const seamsOut = seams.list.length ? r.plan.segments.filter((sg) => sg.kind === 'clip').slice(1).map((sg) => { const k = r.plan.segments.indexOf(sg); return { type: r.plan.joints[k], sec: r.plan.overlaps[k] }; }) : null;
    const editor = { transition: ed.transition, transitionSec: r.plan.overlap || null, seams: seamsOut, fit: ed.fit, crop: ed.fit === 'fill' ? ed.crop : null, mix: { clip: ed.clipVolume ?? 1, music: r2(musicVol), voice: ed.voiceVolume ?? 1, duck: ed.duck, duckAmount: ed.duckAmount, duckClips: ed.duck && ed.duckClips && anyClip && !!audioOk, normalize: ed.normalize, musicLoop: ed.musicLoop },
      titleCard: cardIn('title'), endCard: cardIn('end'), captions: captions.length };
    const job: Job = { id, toolId: 'compose', provider: 'local-ffmpeg', status: 'done', stage: 'done', progress: 100, queuePos: 0, eta: 0, resultUrl: `/files/${outName}`, outputs: [{ label: 'Stitched video', url: `/files/${outName}` }],
      error: null, errorType: null, warnings, parentId: clips.find((c) => c.job)?.job?.id ?? null, createdAt: now, startedAt: now, finishedAt: Date.now(), updatedAt: Date.now(), cost: 0, refunded: 0,
      input: { prompt: title, clipUrls: clips.map((c) => c.url), clipJobIds: clips.map((c) => c.job?.id ?? null), audioUrl: audio && !('error' in audio) ? audio.url : null, audioJobId: audio && !('error' in audio) ? audio.job?.id ?? null : null, voiceUrl: voice && !('error' in voice) ? voice.url : null, voiceJobId: voice && !('error' in voice) ? voice.job?.id ?? null : null, layout, aspect: am ? aspectIn : null, duration: total, width: W, height: H,
        trims: trimsOut, keepClipAudio: keepClip, fadeOutSec: fade, videoFade: videoFade && total > fade, ...editor },
      modelName: 'ffmpeg (local)', runOn: 'local', agent: b && !('error' in b) ? { id: b.id, name: b.name } : null };
    jobs.set(id, job); persistJob(job); recordSpend(job, 0); settleSpend(job);
    return { id, toolId: 'compose', status: 'done', outputs: job.outputs, resultUrl: job.resultUrl, durationSec: total, width: W, height: H, clips: clips.length, music: !!audioOk, voice: !!voiceOk, clipAudio: anyClip, layout, aspect: am ? aspectIn : null, trims: trimsOut, videoFade: videoFade && total > fade,
      ...editor, overlapSec: r.plan.overlap, ducked: r.ducked, loudness: { ...r.loudness, levels: r.levels }, warnings, cost: 0, estimate: { billedTo: 'local', estUsd: 0 }, agent: job.agent };
  });
}

/** seams (Film, 2026-10-27): one transition per joint between clips, [{type: cut | crossfade | dip | fade (= dip) | jcut | lcut, sec?} | null, …]
 *  (seams[i] joins clip i and i+1; null = the film-wide transition). A crossfade fades picture and sound together (xfade + acrossfade); a J / L
 *  cut is a picture cut with the sound leading (J) or trailing (L) by sec (shared/stitchTimeline Seam). Exported for tests. */
export function parseSeams(raw: unknown, clipCount: number): { list: ({ type: JointType; sec?: number } | null)[] } | { error: string; field: string } {
  if (raw == null || raw === '') return { list: [] };
  if (!Array.isArray(raw) || raw.length > Math.max(0, clipCount - 1)) return { field: 'seams', error: 'seams is a list of {type, sec} between clips (at most one fewer than the clips), null keeps the film-wide transition.' };
  const list: ({ type: JointType; sec?: number } | null)[] = [];
  for (const [i, x] of raw.entries()) {
    if (x == null) { list.push(null); continue; }
    const t = String((x as any)?.type ?? ''); const type = (t === 'fade' ? 'dip' : t === 'j-cut' ? 'jcut' : t === 'l-cut' ? 'lcut' : t) as JointType;
    if (!TRANSITIONS.includes(type as StitchTransition) && !isSplitJoint(type)) return { field: `seams[${i}].type`, error: `seams[${i}].type is "cut", "crossfade", "fade" (through black), "jcut" (the next clip's sound leads) or "lcut" (this clip's sound runs on).` };
    const sec = (x as any).sec == null || (x as any).sec === '' ? undefined : Number((x as any).sec);
    if (sec !== undefined && !(Number.isFinite(sec) && sec >= 0 && sec <= TRANSITION_SEC.max)) return { field: `seams[${i}].sec`, error: `seams[${i}].sec is 0–${TRANSITION_SEC.max} seconds.` };
    list.push({ type, ...(sec !== undefined ? { sec } : {}) });
  }
  return { list };
}

/** The Stitch editor's fields on POST /api/compose (all optional; anything left out keeps the older behaviour, except normalize and duck,
 *  which are on by default). Exported for tests. */
export interface CardIn { text: string | null; style: CardStyle; mode: CardMode; sec: number }
export function parseEditor(body: Record<string, any>): { error: string; field: string } | {
  transition: StitchTransition; transitionSec: number; fit: ReframeFit | null; crop: { x: number; y: number }; clipVolume: number | null; musicVolume: number | null; voiceVolume: number | null;
  duck: boolean; duckAmount: number; duckClips: boolean; normalize: boolean; musicLoop: boolean; title: CardIn | null; end: CardIn | null } {
  const bool = (v: unknown, d: boolean) => (v == null || v === '' ? d : v === true || v === 1 || v === '1' || v === 'true');
  const num = (v: unknown, lo: number, hi: number, field: string): number | null | { error: string; field: string } => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : { field, error: `${field} must be a number from ${lo} to ${hi}.` }; };
  const transition = (body.transition == null || body.transition === '' ? 'cut' : String(body.transition)) as StitchTransition;
  if (!TRANSITIONS.includes(transition)) return { field: 'transition', error: 'transition is "cut" (default), "crossfade" or "dip" (to black).' };
  const tSec = num(body.transitionSec, 0.1, 5, 'transitionSec'); if (tSec && typeof tSec === 'object') return tSec;
  const fit = body.fit == null || body.fit === '' ? null : String(body.fit) as ReframeFit; if (fit && !REFRAME_FITS.includes(fit)) return { field: 'fit', error: 'fit is "fit" (whole picture, bars), "fill" (crop to the frame) or "blur" (whole picture on a blurred fill).' };
  const cx = num(body.cropX, 0, 1, 'cropX'), cy = num(body.cropY, 0, 1, 'cropY'); for (const c of [cx, cy]) if (c && typeof c === 'object') return c;
  const vols: Record<string, number | null> = {};
  for (const k of ['clipVolume', 'musicVolume', 'voiceVolume']) { const v = num(body[k], 0, 2, k); if (v && typeof v === 'object') return v; vols[k] = v as number | null; }
  const da = num(body.duckAmount, 0, 1, 'duckAmount'); if (da && typeof da === 'object') return da;
  const card = (k: 'titleCard' | 'endCard'): CardIn | null | { error: string; field: string } => { const c = body[k]; if (c == null || c === false || c === '') return null;
    if (typeof c !== 'object' || Array.isArray(c)) return { field: k, error: `${k} is {text, style, mode, sec}.` };
    const text = typeof c.text === 'string' && c.text.trim() ? c.text.replace(/\s+/g, ' ').trim().slice(0, CARD_TEXT_MAX) : (k === 'endCard' && c.text == null ? END_CARD_TEXT : null);
    const style = (c.style ?? 'clean') as CardStyle; if (!CARD_STYLES.includes(style)) return { field: `${k}.style`, error: `${k}.style is one of ${CARD_STYLES.join(', ')}.` };
    const mode = (c.mode ?? 'black') as CardMode; if (mode !== 'black' && mode !== 'over') return { field: `${k}.mode`, error: `${k}.mode is "black" (its own card) or "over" (over the ${k === 'titleCard' ? 'first' : 'last'} clip).` };
    const sec = c.sec == null ? (k === 'titleCard' ? CARD_SEC.title : CARD_SEC.end) : Number(c.sec); if (!(Number.isFinite(sec) && sec >= CARD_SEC.min && sec <= CARD_SEC.max)) return { field: `${k}.sec`, error: `${k}.sec is ${CARD_SEC.min}–${CARD_SEC.max} seconds.` };
    return { text, style, mode, sec }; };
  const title = card('titleCard'); if (title && 'error' in title) return title; const end = card('endCard'); if (end && 'error' in end) return end;
  return { transition, transitionSec: (tSec as number | null) ?? TRANSITION_SEC.default, fit, crop: { x: (cx as number | null) ?? 0.5, y: (cy as number | null) ?? 0.5 },
    clipVolume: vols.clipVolume, musicVolume: vols.musicVolume, voiceVolume: vols.voiceVolume, duck: bool(body.duck, true), duckAmount: (da as number | null) ?? DEFAULT_MIX.duckAmount, duckClips: bool(body.duckClips, false),
    normalize: bool(body.normalize, true), musicLoop: bool(body.musicLoop, false), title: title as CardIn | null, end: end as CardIn | null };
}
