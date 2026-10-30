/**
 * The canvas side of the agent bridge (server/src/canvasAgent.ts): one EventSource per board. The page receives ops from the MCP
 * client, applies them through agentApi.ts (createCard, setCard, connect, submit) and posts the real ids back, so an MCP call can
 * return a card id or a proposal. The same stream carries the panel feed, proposals and the agent's presence.
 *
 * Nothing here submits a run except the `run_proposal` op, which the server sends only after the user presses Go in the panel. The
 * submit is agentApi.submit, with the proposal's agent budget header set for the duration, so set_budget limits still apply.
 *
 * The agent you can watch (2026-10-27): every op moves the agent's hand first (agentHand.ts: a named orange cursor glides there,
 * says what it does, then the card fades in, its prompt types itself in and its arrows draw). Notes, named frames, move_into and
 * point_at make the board read as a plan. Under reduced motion (or in a hidden tab) everything lands at once, with a plain outline.
 */
import { Box, createShapeId, toRichText, type Editor, type TLShapeId } from 'tldraw';
import { createCard, setCard, connect, describeCard, quoteCard, submit, listFlows } from './agentApi';
import { submitInOrder } from './nodeRun';
import { handOf, fx, workArea, boundsOf, animOK } from './agentHand';
import { freeSpot } from './placement';
import { CARD_W, CARD_H } from './cardModel';
import { arrowsInto, linkShapes, withInputs, GEN_TYPE, RESULT_T } from './graph';
import { flowById, flowInfo, type GenFlow } from '../shared/genFlows';
import { modelsOf, engineForModel } from '../shared/models';
import { catalogNow } from './catalog';
import { compactQuote } from './genRun';
import { setAgentBudgetHeader, getJob } from '../api';
import { ownAccountsNow } from '../shared/billing';
import { resultMedia } from '../shared/resultMedia';
import { portInfoOf, outKindOfShape } from './ports';
import { canFeed, takesLine, PORT_WORDS } from './nodeLogic';
import { NEXT_STEPS } from './quickActionsModel';
import { addResultCard } from './resultCardUtil';
import { validateBatch, batchLayout, batchLine, type BatchItem } from '../../../server/src/shared/canvasBatch';
import { buildBatch } from './batchBuild';
import { withReviews, type TakeReview } from '../../../server/src/shared/takeReview';

export interface AgentOp {
  kind: 'say' | 'add_card' | 'update_card' | 'connect' | 'remove_card' | 'propose_run' | 'summary' | 'run_proposal' | 'free_area' | 'add_note' | 'add_frame' | 'move_into' | 'point_at' | 'next_steps' | 'place_result' | 'batch' | 'review_versions' | 'add_from_job';
  text?: string; workflow?: string; prompt?: string; name?: string; model?: string; ids?: string[]; frame_id?: string; around?: string[]; color?: string; settings?: Record<string, string>; inputs_from?: string[];
  at?: { x: number; y: number }; card_id?: string; from_id?: string; to_id?: string; card_ids?: string[]; note?: string;
  proposal_id?: string; budget_id?: string | null; out?: number; w?: number; h?: number; version?: number; job_id?: string; url?: string; title?: string; items?: BatchItem[]; cards?: { card_id: string; reviews: { version: number; verdict: 'fits' | 'check'; reason?: string }[]; recommend?: number | null }[]; by?: string;
}
export interface FeedEntry { seq: number; id: string; at: number; type: 'message' | 'activity' | 'decision' | 'proposal'; text: string; from?: 'agent' | 'user'; cardId?: string; fromId?: string; toId?: string; proposalId?: string; decision?: 'go' | 'cancel'; meta?: any;
  /** your message reached your agent (read), or a channel pushed it into its session (sent) */ readAt?: number; readVia?: 'wait' | 'inbox' | 'channel'; pushedAt?: number }
export interface ProposalItem { cardId: string; title: string; workflow: string; model: string | null; status: string; usd: number | null; credits: number | null; quote: any; problem: string | null }
export interface Proposal { id: string; boardId: string; cardIds: string[]; note: string | null; items: ProposalItem[]; totalUsd: number; totalCredits: number; budget: any; overBudget: boolean; overByUsd: number | null; reason: string | null; runCardIds?: string[]; skipped?: { cardId: string; title: string; problem: string }[]; status: 'pending' | 'running' | 'approved' | 'cancelled' | 'failed'; createdAt: number; decidedAt: number | null; jobIds: string[]; error: string | null }
export interface PickAsk { id: string; boardId: string; cardIds: string[]; text: string; chosen: string | null; status: 'waiting' | 'picked' | 'cancelled'; createdAt: number }
export interface BridgeHandlers {
  onConnection?: (open: boolean) => void;
  onHello?: (data: any) => void;
  onPresence?: (p: any) => void;
  onFeed?: (e: FeedEntry) => void;
  onProposal?: (p: Proposal) => void;
  onProposalUpdate?: (p: Proposal) => void;
  /** the built-in demo agent started or stopped on this board */
  onDemo?: (d: { running: boolean; runId: string | null; title: string | null }) => void;
  /** "Pick the one you like" started, was answered or closed */
  onPick?: (p: PickAsk) => void;
  /** your connected agent picked up a message ("Claude is planning…") */
  onAgentStatus?: (s: { state: string; name: string; at: number }) => void;
  /** a board was made, renamed or deleted (by you elsewhere or by your agent): refresh the board list */
  onBoards?: (d: { at: number; by: 'agent' | 'you' }) => void;
  /** your agent made or switched to a board and wants it shown */
  onOpenBoard?: (d: { boardId: string; name: string; by: string; at: number }) => void;
  onError?: (e: Error) => void;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The card/board price in the same compact words the panel and the server use. */
export function priceView(q: any) {
  if (!q || typeof q !== 'object') return null;
  const cost = q.cost && typeof q.cost === 'object' ? q.cost : null;
  const usd = q.runnable === false && q.demo !== true ? null /* can't run here: no price, never '$0.00' (the quote's credits are null; cost.estUsd is 0) */ : typeof cost?.estUsd === 'number' ? cost.estUsd : typeof q.credits === 'number' ? q.credits / 100 : null;
  const local = q.localRun === true || cost?.billedTo === 'local';
  const demo = q.demo === true;
  return { usd: usd == null ? null : r4(usd), credits: typeof q.credits === 'number' ? q.credits : null,
    label: demo ? 'Sample' : local ? 'Free' : usd != null ? `≈ $${usd.toFixed(2)}` : null, demo, local, runnable: q.runnable !== false };
}

/** The workflow an MCP op names: an id from canvas_list_workflows or the workflow's shown name. */
function resolveFlow(workflow: string): GenFlow {
  const cat = catalogNow(); const flows = cat ? listFlows() : []; const want = workflow.trim().toLowerCase();
  const hit = flows.find((f) => f.id.toLowerCase() === want || f.name.toLowerCase() === want);
  const f = hit ? flowById(hit.id) : flowById(workflow);
  if (!f) throw new Error(`Unknown workflow "${workflow}". Use canvas_list_workflows for the ids.`);
  if (cat && flows.length && !flows.some((x) => x.id === f.id)) throw new Error(`The "${workflow}" workflow is not on this server. Use canvas_list_workflows.`);
  return f;
}
/** A model key, model name or provider id → the provider id a card stores. */
function resolveProvider(toolId: string, model: string): string {
  const cat = catalogNow(); const tool = cat?.tools.find((t) => t.id === toolId); const ms = modelsOf(toolId); const want = model.trim().toLowerCase();
  const m = ms.find((x) => x.key.toLowerCase() === want) || ms.find((x) => x.engines.some((e) => e.toLowerCase() === want))
    || ms.find((x) => x.name.toLowerCase() === want) || ms.find((x) => (x.displayName ?? '').toLowerCase() === want);
  if (m) return engineForModel(m);
  if (tool?.providers.some((p) => p.id === model)) return model;
  throw new Error(`Unknown model "${model}" for this workflow. Omit model for the default, or use a model key from canvas_list_workflows.`);
}
function toolIdOf(flow: GenFlow): string { const cat = catalogNow(); return cat ? flowInfo(flow, cat).toolId : flow.toolId; }

/** A card's short name (the shot name the agent gave it), else null. */
export const nameOf = (editor: Editor, id: TLShapeId): string | null => { const n = (editor.getShape(id)?.meta as any)?.name; return typeof n === 'string' && n.trim() ? n.trim() : null; };
/** Plain text of a note's rich text (tiptap JSON). */
export function plainText(rt: any): string { if (!rt || typeof rt !== 'object') return ''; if (typeof rt.text === 'string') return rt.text; return (Array.isArray(rt.content) ? rt.content.map(plainText).join(rt.type === 'doc' ? '\n' : '') : '').trim(); }
const frameAt = (editor: Editor, pt: { x: number; y: number }) => editor.getCurrentPageShapes().filter((s) => s.type === 'frame').map((s) => editor.getShapePageBounds(s.id)!).find((b) => b && b.containsPoint(pt)) ?? null;
const plainBox = (b: Box) => ({ x: b.x, y: b.y, w: b.w, h: b.h });
/** The camera's area for these nodes: them and what feeds them (graph.withInputs), plus `extra` (a card about to appear). FollowAgent eases there
 *  (animated unless reduced motion) and stays still when it is already in view. */
function areaOf(editor: Editor, ids: string[], extra?: { x: number; y: number; w: number; h: number } | null) {
  const b = boundsOf(editor, withInputs(editor, ids)); const e = extra ? new Box(extra.x, extra.y, extra.w, extra.h) : null;
  const all = b && e ? Box.Common([b, e]) : b ?? e; return all ? plainBox(all) : null;
}

function titleOf(editor: Editor, id: TLShapeId): string {
  const s = editor.getShape(id); if (!s) return 'Card'; const p = s.props as any;
  if (s.type === GEN_TYPE) return String(nameOf(editor, id) || p.prompt || flowById(p.flow)?.name || 'Card').slice(0, 48);
  if (s.type === 'note') return plainText(p.richText).slice(0, 48) || 'Note';
  if (s.type === 'frame') return String(p.name || 'Frame').slice(0, 48);
  if (s.type === RESULT_T) return String(p.title || p.model || 'Result').slice(0, 48);
  if (s.type === 'image' || s.type === 'video') { const a: any = p.assetId ? editor.getAsset(p.assetId) : null; return String(a?.props?.name || (s.type === 'image' ? 'Picture' : 'Clip')).slice(0, 48); }
  return 'Card';
}
function cardNode(editor: Editor, id: TLShapeId, quote?: any) {
  const d = describeCard(editor, id); const s = editor.getShape(id); if (!d || !s) return null; const p = s.props as any;
  return { id, type: 'card' as const, kind: p.medium ?? null, workflow: p.flow ?? null, workflowName: flowById(p.flow)?.name ?? p.flow ?? null, model: d.model || p.provider || null, prompt: p.prompt ?? '',
    name: nameOf(editor, id), title: String(nameOf(editor, id) || p.prompt || d.flow || 'Card').slice(0, 100), frame: frameOfShape(editor, id), status: p.status ?? null, inputs: (arrowsInto(editor, id).map((a) => a.fromId).filter(Boolean) as string[]),
    results: (p.takes ?? []).filter((t: any) => t?.url).map((t: any) => ({ url: t.url, kind: t.kind ?? null, poster: t.poster ?? null })),
    price: priceView(quote ?? p.quote), jobId: p.jobId || null, missing: d.missing,
    /* the version strip: which version flows to the next card (1-based) */ version: (p.takes ?? []).length ? Math.min(p.take ?? 0, p.takes.length - 1) + 1 : null, versions: (p.takes ?? []).length };
}

const frameOfShape = (editor: Editor, id: TLShapeId) => { const s = editor.getShape(id); const parent = s ? editor.getShape(s.parentId as TLShapeId) : null; return parent?.type === 'frame' ? parent.id : null; };
/** The agent writes a card's prompt as you watch (instant under reduced motion). */
async function typePrompt(editor: Editor, id: TLShapeId, text: string) {
  if (!text || !animOK()) { if (text) setCard(editor, id, { prompt: text }); return; }
  fx.writing(id, true);
  try {
    const steps = Math.min(24, Math.max(6, Math.ceil(text.length / 9))); const per = Math.min(1000, 280 + text.length * 5) / steps;
    for (let i = 1; i <= steps; i++) { if (!editor.getShape(id)) return; setCard(editor, id, { prompt: text.slice(0, Math.round((text.length * i) / steps)) }); await sleep(per); }
    setCard(editor, id, { prompt: text });
  } finally { fx.writing(id, false); }
}

async function withQuote(editor: Editor, id: TLShapeId) {
  const q = await quoteCard(editor, id).catch(() => null);
  return { card: cardNode(editor, id, q), quote: compactQuote(q), q };
}

async function addCard(editor: Editor, op: AgentOp) {
  if (!op.workflow) throw new Error('Name a workflow (see canvas_list_workflows).');
  if (!catalogNow()) { for (let i = 0; i < 25 && !catalogNow(); i++) await sleep(100); }
  const flow = resolveFlow(op.workflow); const toolId = toolIdOf(flow);
  const provider = op.model ? resolveProvider(toolId, op.model) : undefined;
  const from = (op.inputs_from ?? []).map((id) => { const s = editor.getShape(id as TLShapeId); if (!s) throw new Error(`No node with id "${id}" on this board.`); return s.id; });
  const name = op.name?.trim() || ''; const at = op.at ?? freeSpot(editor, CARD_W, CARD_H); const hand = handOf(editor);
  /* the hand goes there first; the camera frames the frame being filled (or the card) */
  const fr = frameAt(editor, at); workArea(areaOf(editor, from, fr ? plainBox(fr) : { x: at.x - CARD_W / 2, y: at.y - CARD_H / 2, w: CARD_W, h: CARD_H })); /* and the cards wired into it */
  await hand.glideTo({ x: at.x - CARD_W / 2 + 28, y: at.y - CARD_H / 2 + 26 }, `Adding ${name || flow.name}`);
  const typed = animOK() && !!op.prompt;
  const id = createCard(editor, { flow: flow.id, prompt: typed ? '' : op.prompt, ...(provider ? { provider } : {}), ...(op.settings ? { vals: op.settings } : {}), ...(from.length ? { from } : {}), at, select: false });
  try { checkFeeds(editor, from, id, true); } catch (e) { editor.deleteShapes([id, ...arrowsInto(editor, id).map((a) => a.arrowId)]); throw e; }
  if (name) editor.run(() => editor.updateShape({ id, type: GEN_TYPE, meta: { ...(editor.getShape(id)?.meta ?? {}), name } } as any), { history: 'ignore' });
  fx.enter(id); for (const a of arrowsInto(editor, id)) fx.drawArrow(a.arrowId);
  if (typed) await typePrompt(editor, id, op.prompt!);
  hand.touch([id]);
  return withQuote(editor, id);
}

async function updateCard(editor: Editor, op: AgentOp) {
  if (!op.card_id) throw new Error('Name a card id.');
  const id = op.card_id as TLShapeId; const s = editor.getShape(id); if (!s || s.type !== GEN_TYPE) throw new Error('No generate card with that id on this board.');
  if (!catalogNow()) { for (let i = 0; i < 25 && !catalogNow(); i++) await sleep(100); }
  const flow = op.workflow ? resolveFlow(op.workflow) : null;
  const d = describeCard(editor, id); const curFlow = d ? flowById(d.flow) : null;
  const toolId = flow ? toolIdOf(flow) : curFlow ? toolIdOf(curFlow) : '';
  const provider = op.model ? resolveProvider(toolId, op.model) : undefined;
  const b = editor.getShapePageBounds(id); const hand = handOf(editor);
  if (b) { workArea(areaOf(editor, [id, ...(op.inputs_from ?? [])])); await hand.glideTo({ x: b.minX + 28, y: b.minY + 24 }, `Changing ${titleOf(editor, id)}`); }
  /* settings merge into the card's own (a new workflow starts from its defaults): canvas_update_card { settings: { resolution } } keeps the length it had */
  const keep = flow && flow.id !== d?.flow ? {} : ((s.props as any).vals ?? {});
  setCard(editor, id, { ...(flow ? { flow: flow.id } : {}), ...(provider ? { provider } : {}), ...(op.settings ? { vals: { ...keep, ...op.settings } } : {}) });
  if (op.prompt !== undefined) { if (animOK() && op.prompt) await typePrompt(editor, id, op.prompt); else setCard(editor, id, { prompt: op.prompt }); }
  if (op.version != null) { const n = ((editor.getShape(id)?.props as any)?.takes ?? []).length; if (op.version < 1 || op.version > n) throw new Error(n ? `Pick a version from 1 to ${n}.` : 'This card has no versions yet.');
    editor.run(() => editor.updateShape({ id, type: GEN_TYPE, props: { take: op.version! - 1, ratio: 0 } } as any), { history: 'ignore' }); }
  hand.touch([id]);
  if (op.inputs_from) {
    const info = portInfoOf(editor, editor.getShape(id)!, catalogNow());
    for (const f of op.inputs_from) { const k = outKindOfShape(editor.getShape(f as TLShapeId)); if (k && !info.ins.some((i) => i.kind === k)) throw new Error(`${takesLine(titleOf(editor, id), info.ins)}, and “${titleOf(editor, f as TLShapeId)}” makes ${PORT_WORDS[k]}.`); }
    const old = arrowsInto(editor, id).map((a) => a.arrowId); if (old.length) editor.deleteShapes(old);
    for (const fromId of op.inputs_from) { const from = editor.getShape(fromId as TLShapeId); if (!from) throw new Error(`No node with id "${fromId}" on this board.`); linkShapes(editor, from.id, id); }
  }
  return withQuote(editor, id);
}

/** A quote that came back as an error (a 400 like "Duration 10 s isn't available…") or not at all: it has no price, so it can't count as a run. */
export const unpriced = (q: any) => !q || (typeof q === 'object' && !!q.error && typeof q.credits !== 'number' && !q.cost && q.demo !== true);
async function propose(editor: Editor, op: AgentOp) {
  const ids = op.card_ids ?? []; if (!ids.length) throw new Error('Name at least one card id.');
  const items: ProposalItem[] = []; let totalUsd = 0; let totalCredits = 0;
  for (const cardId of ids) {
    const id = cardId as TLShapeId; const s = editor.getShape(id); if (!s || s.type !== GEN_TYPE) throw new Error(`No generate card with id "${cardId}" on this board.`);
    const d = describeCard(editor, id); if (!d) throw new Error(`Card "${cardId}" is still loading.`);
    let qErr = ''; const q = await quoteCard(editor, id).catch((e) => { qErr = String((e as Error)?.message ?? ''); return null; }); const pv = priceView(q);
    const usd = pv?.usd ?? null; const credits = pv?.credits ?? null;
    const problem = d.missing ?? (q?.runnable === false ? String(q.reasonText ?? q.blockedReason ?? q.reason ?? 'This card cannot run right now.') : unpriced(q) ? `No price for these settings${q?.error || qErr ? `: ${String(q?.error || qErr).replace(/\.$/, '')}` : ''}` : null);
    items.push({ cardId, title: String(nameOf(editor, id) || d.prompt || d.flow || 'Card').slice(0, 140), workflow: d.flow, model: d.model || null, status: d.status, usd, credits, quote: compactQuote(q), problem });
  }
  /* a skipped card can't feed a card in the same batch: that one waits too (repeat until nothing changes, for chains) */
  for (let changed = true; changed;) { changed = false;
    for (const it of items) { if (it.problem) continue;
      const src = arrowsInto(editor, it.cardId as TLShapeId).map((a) => items.find((x) => x.cardId === a.fromId && x.problem)).find(Boolean);
      if (src) { it.problem = `Waits on “${src.title.slice(0, 40)}”, which can’t run here`; changed = true; } } }
  for (const it of items) if (!it.problem) { totalUsd += it.usd ?? 0; totalCredits += it.credits ?? 0; } // only what Go starts (the server skips the rest)
  return { items, totalUsd: r4(totalUsd), totalCredits };
}

async function summarize(editor: Editor) {
  const nodes: any[] = [];
  for (const s of editor.getCurrentPageShapes()) {
    const p = s.props as any;
    if (s.type === GEN_TYPE) {
      const q = await quoteCard(editor, s.id).catch(() => null); const n = cardNode(editor, s.id, q); if (n) nodes.push(n);
    } else if (s.type === RESULT_T) {
      nodes.push({ id: s.id, type: 'result', kind: p.kind ?? null, title: p.title ?? null, model: p.model ?? null, results: p.url ? [{ url: p.url, kind: p.kind ?? null, poster: p.poster ?? null }] : [], jobId: p.jobId || null });
    } else if (s.type === 'image' || s.type === 'video') {
      const asset: any = p.assetId ? editor.getAsset(p.assetId) : null; const url = asset?.props?.src; if (!url) continue;
      nodes.push({ id: s.id, type: s.type === 'image' ? 'picture' : 'clip', kind: s.type, title: asset?.props?.name ?? s.type, results: [{ url, kind: s.type }] });
    } else if (s.type === 'note' || s.type === 'text') {
      /* the person's own ideas too: an agent reads the stickies and text on the board */
      const t = plainText(p.richText); if (t) nodes.push({ id: s.id, type: 'note', kind: s.type, title: t.slice(0, 600), by: (s.meta as any)?.by === 'agent' ? 'agent' : 'you', frame: frameOfShape(editor, s.id) });
    } else if (s.type === 'frame') {
      nodes.push({ id: s.id, type: 'frame', kind: 'frame', title: String(p.name || 'Frame'), children: editor.getSortedChildIdsForParent(s.id) });
    } else if (s.type === 'bookmark') {
      const a: any = p.assetId ? editor.getAsset(p.assetId) : null; nodes.push({ id: s.id, type: 'link', kind: 'bookmark', title: a?.props?.title || p.url || 'Link', url: p.url ?? a?.props?.src ?? null });
    }
  }
  return { nodes };
}

async function runProposal(editor: Editor, op: AgentOp) {
  const ids = op.card_ids ?? []; const jobIds: string[] = []; const failed: { cardId: string; error: string }[] = []; let firstError: Error | null = null;
  setAgentBudgetHeader(op.budget_id ?? null);
  try {
    /* one card the server refuses doesn't stop the others; a budget stop does (nothing after it may spend). Graph order (2026-10-28): a card
     * fed by another card in this proposal starts when that one is done, so it gets its input (it used to start at once, without it). */
    const r = await submitInOrder(editor, ids, { stop: e => /budget/i.test(e.message),
      onLater: (id, x) => { if (x.error) handOf(editor).say(`${titleOf(editor, id as TLShapeId)} didn’t start: ${x.error}`); } });
    jobIds.push(...r.jobIds); failed.push(...r.failed); if (r.failed.length) firstError = new Error(r.failed[0].error);
  } finally { setAgentBudgetHeader(null); }
  if (firstError && !jobIds.length) { (firstError as any).jobIds = jobIds; throw firstError; }
  return { jobIds, failed };
}

/** Where a plan of w × h (page px) can go: below everything on the board, or centred in the view on an empty board. Top-left corner. */
function freeArea(editor: Editor, w: number, h: number) {
  const b = editor.getCurrentPageBounds();
  if (!b || !editor.getCurrentPageShapeIds().size) { const c = editor.getViewportPageBounds().center; return { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2) }; }
  return { x: Math.round(b.minX), y: Math.round(b.maxY + 220) };
}

/** canvas_add_from_job (2026-10-28): an existing generation as a result card, through the Assets drawer's own code (resultMedia + addResultCard),
 *  so the agent can wire it into a new card (Extend, Upscale…). `out` picks one output of a multi-output job. */
async function addFromJob(editor: Editor, op: AgentOp) {
  if (!op.job_id) throw new Error('Name a job id.');
  const job = await getJob(op.job_id); const outs = (job.outputs ?? []).filter((o) => o?.url); const n = op.out ?? 0;
  if (n > 0 && !outs[n]) throw new Error(`That generation has ${outs.length} output${outs.length === 1 ? '' : 's'}.`);
  const picked = n > 0 ? { ...job, resultUrl: outs[n]!.url, outputs: [outs[n]!, ...outs.filter((_, i) => i !== n)] } : job;
  const m = resultMedia(picked, ownAccountsNow()); if (!m) throw new Error('That generation has nothing the board can show (not finished, or a file type the board does not place).');
  const hand = handOf(editor); const spot = op.at ?? freeSpot(editor, 384, 320);
  workArea({ x: spot.x - 200, y: spot.y - 180, w: 400, h: 360 }); await hand.glideTo({ x: spot.x - 160, y: spot.y - 140 }, `Placing ${m.kind === 'video' ? 'a clip' : m.kind === 'audio' ? 'a sound' : m.kind === '3d' ? 'a 3D model' : 'a picture'}`);
  const id = await addResultCard(editor, job.id, m, op.at, { free: !op.at });
  fx.enter(id); hand.touch([id]); const b = editor.getShapePageBounds(id); if (b) workArea(plainBox(b));
  const p = editor.getShape(id)?.props as any;
  return { id, node: { id, type: 'result', kind: p?.kind ?? m.kind, title: p?.title ?? m.title, model: p?.model ?? null, results: [{ url: m.url, kind: m.kind, poster: m.poster || null }], jobId: job.id } };
}

// ---------------------------------------------------------------- the board as a plan: notes, frames, move into, point
const NOTE_COLORS = new Set(['orange', 'yellow', 'violet', 'light-violet', 'blue', 'light-blue', 'green', 'light-green', 'red', 'light-red', 'grey', 'black', 'white']);
const NOTE_SCALE = 1.3; /* 260 px: readable beside a 340 px card at the zooms Follow uses */
async function addNote(editor: Editor, op: AgentOp) {
  const text = String(op.text ?? '').trim(); if (!text) throw new Error('A note needs some text.');
  const frame = op.frame_id ? editor.getShape(op.frame_id as TLShapeId) : null; if (op.frame_id && frame?.type !== 'frame') throw new Error(`No frame with id "${op.frame_id}" on this board.`);
  const size = 200 * NOTE_SCALE; const at = op.at ?? freeSpot(editor, size, size); const hand = handOf(editor);
  /* in a frame, the camera frames the whole frame (the beat sheet reads as one row), else the note */
  const fb = frame ? editor.getShapePageBounds(frame.id) : null; workArea(fb ? plainBox(fb) : { x: at.x - size / 2 - 60, y: at.y - size / 2 - 60, w: size + 120, h: size + 120 });
  await hand.glideTo({ x: at.x - size / 2 + 24, y: at.y - size / 2 + 20 }, 'Writing a note');
  const id = createShapeId(); const color = op.color && NOTE_COLORS.has(op.color) ? op.color : 'orange'; const typed = animOK();
  editor.run(() => editor.createShape({ id, type: 'note', x: at.x - size / 2, y: at.y - size / 2, meta: { by: 'agent' }, props: { color, richText: toRichText(typed ? '' : text), scale: NOTE_SCALE, size: 'm', font: 'sans', align: 'start', verticalAlign: 'start' } } as any));
  if (frame) editor.reparentShapes([id], frame.id);
  fx.enter(id);
  if (typed) { const steps = Math.min(20, Math.max(5, Math.ceil(text.length / 6))); for (let i = 1; i <= steps; i++) { if (!editor.getShape(id)) break; editor.run(() => editor.updateShape({ id, type: 'note', props: { richText: toRichText(text.slice(0, Math.round((text.length * i) / steps))) } } as any), { history: 'ignore' }); await sleep(36); } }
  hand.touch([id]);
  return { id, text };
}
async function addFrame(editor: Editor, op: AgentOp) {
  const name = String(op.name ?? '').trim().slice(0, 80) || 'Frame'; const around = (op.around ?? []).filter((x) => editor.getShape(x as TLShapeId)) as TLShapeId[];
  if (op.around?.length && !around.length) throw new Error('None of those nodes are on this board.');
  const fit = around.length ? boundsOf(editor, around) : null;
  const box = fit ? { x: fit.x - 40, y: fit.y - 40, w: fit.w + 80, h: fit.h + 80 }
    : (() => { const w = Math.max(120, Number(op.w) || 820), h = Math.max(120, Number(op.h) || 520); const c = op.at ? null : freeSpot(editor, w, h); return { x: op.at ? op.at.x : c!.x - w / 2, y: op.at ? op.at.y : c!.y - h / 2, w, h }; })();
  const hand = handOf(editor); workArea(box);
  await hand.glideTo({ x: box.x + 16, y: box.y - 6 }, `Making a frame: ${name}`);
  const id = createShapeId(); const typed = animOK();
  editor.run(() => { editor.createShape({ id, type: 'frame', x: box.x, y: box.y, meta: { by: 'agent' }, props: { w: box.w, h: box.h, name: typed ? '' : name } } as any); editor.sendToBack([id]); });
  fx.enter(id);
  if (typed) for (let i = 1; i <= name.length; i += 2) { if (!editor.getShape(id)) break; editor.run(() => editor.updateShape({ id, type: 'frame', props: { name: name.slice(0, i + 1) } } as any), { history: 'ignore' }); await sleep(28); }
  if (typed) editor.run(() => editor.updateShape({ id, type: 'frame', props: { name } } as any), { history: 'ignore' });
  if (around.length) editor.reparentShapes(around, id);
  hand.touch([id]);
  return { id, name, x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) };
}
async function moveInto(editor: Editor, op: AgentOp) {
  const frame = editor.getShape(op.frame_id as TLShapeId); if (!frame || frame.type !== 'frame') throw new Error(`No frame with id "${op.frame_id}" on this board.`);
  const ids = (op.ids ?? []).filter((x) => x !== frame.id && editor.getShape(x as TLShapeId)) as TLShapeId[]; if (!ids.length) throw new Error('None of those nodes are on this board.');
  const fb = editor.getShapePageBounds(frame.id)!; const name = String((frame.props as any).name || 'the frame'); const hand = handOf(editor);
  workArea(plainBox(fb)); await hand.glideTo({ x: fb.minX + 24, y: fb.minY + 8 }, `Putting ${ids.length === 1 ? 'it' : `${ids.length} cards`} in ${name}`);
  editor.reparentShapes(ids, frame.id);
  hand.touch([frame.id]);
  return { moved: ids.length, frameId: frame.id, frameName: name };
}
async function pointAt(editor: Editor, op: AgentOp) {
  const b = op.ids?.length ? boundsOf(editor, op.ids) : op.at ? new Box(op.at.x - 40, op.at.y - 40, 80, 80) : null;
  if (!b) throw new Error(op.ids?.length ? 'None of those nodes are on this board.' : 'Name ids or a point (at).');
  workArea(plainBox(b)); await handOf(editor).point(b, op.text?.slice(0, 120));
  if (op.ids?.length) handOf(editor).touch(op.ids);
  return { pointed: true };
}

/** Typed connections (2026-10-27): the agent can only wire what a person could. `wired`: the arrows are already drawn (add_card), so
 *  the room left must not be below zero; otherwise each source needs room. Throws the same words the board shows on an illegal drop. */
function checkFeeds(editor: Editor, from: TLShapeId[], to: TLShapeId, wired = false) {
  const t = editor.getShape(to); if (!t || !from.length) return; const info = portInfoOf(editor, t, catalogNow()); const name = nameOf(editor, to) || flowById((t.props as any).flow)?.name || 'That card';
  for (const f of from) { const k = outKindOfShape(editor.getShape(f)); const fname = titleOf(editor, f);
    if (!k) throw new Error(`“${fname}” has nothing to pass on (a 3D model or a group doesn't feed other cards).`);
    const slot = info.ins.find((i) => i.kind === k);
    if (!slot) throw new Error(`${takesLine(name, info.ins)}, and “${fname}” makes ${PORT_WORDS[k]}. Pick another workflow (canvas_next_steps lists the ones that fit).`);
    if (wired ? slot.room < 0 : !canFeed(k, f, info)) throw new Error(`${name} can't take another ${PORT_WORDS[k].replace(/^an? /, '')}: its inputs are full.`); }
}
/** The sensible next workflows for what a node makes (the board's "What next?" list), so an agent chains the same way a person does. */
function nextSteps(editor: Editor, op: AgentOp) {
  const id = (op.card_id ?? '') as TLShapeId; const s = editor.getShape(id); if (!s) throw new Error(`No node with id "${op.card_id}" on this board.`);
  const kind = outKindOfShape(s); const have = new Set(listFlows().map((f) => f.id));
  return { card_id: id, kind, steps: kind ? NEXT_STEPS[kind].filter((a) => have.has(a.flow)).map((a) => ({ workflow: a.flow, label: a.label })) : [] };
}

/** The agent's look at each version: a badge per version and the one it recommends. It never changes which version is active: you choose. */
function applyReviews(editor: Editor, op: AgentOp) {
  const by = (op.by === 'sample' || op.by === 'checks' ? op.by : 'agent') as TakeReview['by']; let updated = 0;
  editor.run(() => { for (const c of op.cards ?? []) {
    const s = editor.getShape(c.card_id as TLShapeId); if (!s || s.type !== GEN_TYPE) throw new Error(`No generate card with id "${c.card_id}" on this board.`);
    const takes = withReviews((s.props as any).takes ?? [], c.reviews, c.recommend, by); /* the active version (take) is never touched: you choose */
    editor.updateShape({ id: s.id, type: GEN_TYPE, props: { takes } } as any); updated++;
  } }, { history: 'ignore' });
  return { updated };
}

/** Many things at once (canvas_batch): validated against the board, laid out as one group, made in ONE history step (a single Undo
 *  removes it all; one bad item and nothing is made), then shown as one wave with one camera move. Cards are drafts: nothing runs. */
async function applyBatch(editor: Editor, op: AgentOp) {
  const items = op.items ?? []; if (!catalogNow()) { for (let i = 0; i < 25 && !catalogNow(); i++) await sleep(100); }
  const bad = validateBatch(items, (id) => !!editor.getShape(id as TLShapeId)); if (bad) throw new Error(bad);
  const needsLayout = items.some((it) => (it.kind === 'add_card' || it.kind === 'add_note' || it.kind === 'add_frame') && !it.at);
  const first = batchLayout(items, { x: 0, y: 0 }); const origin = needsLayout ? freeArea(editor, Math.max(1, first.size.w), Math.max(1, first.size.h)) : { x: 0, y: 0 };
  const pos = needsLayout ? batchLayout(items, origin) : { at: {}, frames: {} };
  const made = buildBatch(editor, items, pos, {
    flowOf: (w) => resolveFlow(w).id,
    providerOf: (flowId, model) => { const f = flowById(flowId); return model && f ? resolveProvider(toolIdOf(f), model) : undefined; },
    check: (from, to) => checkFeeds(editor, from, to, true),
    spot: (w, h) => freeSpot(editor, w, h),
  });
  /* one camera move for the whole group, the hand at its start, then the wave */
  const box = boundsOf(editor, made.order);
  if (box) { workArea(areaOf(editor, made.order)); void handOf(editor).glideTo({ x: box.minX + 28, y: box.minY + 20 }, `Adding ${made.cards.length + made.notes.length || made.frames.length} at once`); }
  fx.wave(made.order.filter((id) => !made.frames.includes(id)), made.arrows);
  window.setTimeout(() => handOf(editor).touch(made.cards.slice(0, 12)), Math.min(2400, made.order.length * 45 + 300));
  return { refs: made.refs, cards: made.cards.map((id) => cardNode(editor, id as TLShapeId)).filter(Boolean), notes: made.notes, frames: made.frames, arrows: made.arrows,
    line: batchLine({ cards: made.cards.length, notes: made.notes.length, frames: made.frames.length }) };
}

/** Apply one op from the server through the same agentApi a person uses. Throws a plain message when it cannot. */
export async function applyOp(editor: Editor, op: AgentOp): Promise<any> {
  switch (op.kind) {
    case 'say': return { ok: true };
    case 'add_card': return addCard(editor, op);
    case 'update_card': return updateCard(editor, op);
    case 'connect': {
      if (!op.from_id || !op.to_id) throw new Error('Name a from id and a to id.');
      const from = editor.getShape(op.from_id as TLShapeId), to = editor.getShape(op.to_id as TLShapeId);
      if (!from) throw new Error(`No node with id "${op.from_id}" on this board.`); if (!to) throw new Error(`No node with id "${op.to_id}" on this board.`);
      if (from.id === to.id) throw new Error('A card cannot feed itself.');
      checkFeeds(editor, [from.id], to.id);
      const tb = editor.getShapePageBounds(to.id); if (tb) await handOf(editor).glideTo({ x: tb.minX + 6, y: tb.midY }, `Connecting ${titleOf(editor, from.id)}`);
      const arrowId = linkShapes(editor, from.id, to.id); if (!arrowId) throw new Error('Could not draw that arrow.');
      fx.drawArrow(arrowId); handOf(editor).touch([to.id]);
      return { arrowId, fromId: from.id, toId: to.id, fromTitle: titleOf(editor, from.id), toTitle: titleOf(editor, to.id) };
    }
    case 'remove_card': {
      if (!op.card_id) throw new Error('Name a card id.'); const id = op.card_id as TLShapeId; if (!editor.getShape(id)) throw new Error('No node with that id on this board.');
      const b = editor.getShapePageBounds(id); if (b) await handOf(editor).glideTo({ x: b.minX + 28, y: b.minY + 24 }, `Removing ${titleOf(editor, id)}`);
      const title = titleOf(editor, id); editor.deleteShapes([id]); return { removed: op.card_id, title };
    }
    case 'propose_run': {
      const b = areaOf(editor, op.card_ids ?? []); if (b) { workArea(b); handOf(editor).say(`Pricing ${(op.card_ids ?? []).length === 1 ? 'this card' : `${(op.card_ids ?? []).length} cards`}`); handOf(editor).touch(op.card_ids ?? []); }
      return propose(editor, op);
    }
    case 'summary': return summarize(editor);
    case 'run_proposal': { handOf(editor).say('Starting the runs'); handOf(editor).touch(op.card_ids ?? []); return runProposal(editor, op); }
    case 'free_area': return freeArea(editor, Number(op.w) || 400, Number(op.h) || 400);
    case 'add_note': return addNote(editor, op);
    case 'add_frame': return addFrame(editor, op);
    case 'move_into': return moveInto(editor, op);
    case 'point_at': return pointAt(editor, op);
    case 'next_steps': return nextSteps(editor, op);
    case 'batch': return applyBatch(editor, op);
    case 'review_versions': return applyReviews(editor, op);
    case 'add_from_job': return addFromJob(editor, op);
    case 'place_result': { /* the short film's stitched cut (server: runShortFilm after POST /api/compose) */
      if (!op.job_id || !op.url) throw new Error('Name a job and its file.');
      const id = await addResultCard(editor, op.job_id, { kind: 'video', url: op.url, poster: `/api/media/thumb?url=${encodeURIComponent(op.url)}`, title: op.title || 'Your film', caption: { model: 'Stitch (ffmpeg)', place: 'Your computer', price: 'Free', time: '' } } as any, op.at);
      editor.run(() => editor.updateShape({ id, type: 'ohf-result', meta: { film: true } } as any), { history: 'ignore' }); /* the final film: ringed in gold in the zoomed-out sky */
      fx.enter(id); handOf(editor).touch([id]); return { id }; }
    default: throw new Error(`Unknown op "${(op as any).kind}".`);
  }
}

const post = (boardId: string, body: unknown) => fetch(`/api/canvas/boards/${encodeURIComponent(boardId)}/agent/results`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Listen to the board's SSE stream. Returns a close function. EventSource reconnects on its own. */
export function startAgentBridge(boardId: string, editor: Editor, h: BridgeHandlers = {}) {
  /* bfcache (2026-10-27): an open stream keeps Safari from caching the page on leave; close it on pagehide, open it again on pageshow */
  let es: EventSource | null = null; let tail: Promise<void> = Promise.resolve();
  const connect = () => { if (es) return; es = new EventSource(`/api/canvas/boards/${encodeURIComponent(boardId)}/agent/stream`); wire(es); };
  const disconnect = () => { es?.close(); es = null; };
  const wire = (es: EventSource) => {
  const json = (ev: Event) => { try { return JSON.parse((ev as MessageEvent).data); } catch { return null; } };
  es.addEventListener('hello', (ev) => { h.onConnection?.(true); const d = json(ev); if (d) h.onHello?.(d); });
  es.addEventListener('presence', (ev) => { const d = json(ev); if (d) h.onPresence?.(d); });
  es.addEventListener('feed', (ev) => { const d = json(ev); if (d) h.onFeed?.(d); });
  es.addEventListener('proposal', (ev) => { const d = json(ev); if (d) h.onProposal?.(d); });
  es.addEventListener('proposal_update', (ev) => { const d = json(ev); if (d) h.onProposalUpdate?.(d); });
  es.addEventListener('demo', (ev) => { const d = json(ev); if (d) h.onDemo?.(d); });
  es.addEventListener('pick', (ev) => { const d = json(ev); if (d) h.onPick?.(d); });
  es.addEventListener('agent_status', (ev) => { const d = json(ev); if (d) h.onAgentStatus?.(d); });
  es.addEventListener('boards', (ev) => { const d = json(ev); if (d) h.onBoards?.(d); });
  es.addEventListener('open_board', (ev) => { const d = json(ev); if (d?.boardId) h.onOpenBoard?.(d); });
  /* One op at a time: a proposal's submits must not overlap with another op (or another Go), and ids stay in order. */
  es.addEventListener('op', (ev) => {
    const d = json(ev); if (!d?.id || !d?.op) return;
    tail = tail.then(async () => {
      try { const result = await applyOp(editor, d.op as AgentOp); await post(boardId, { id: d.id, ok: true, result }); }
      catch (e: any) { await post(boardId, { id: d.id, ok: false, error: e?.message || 'The canvas could not apply that.', ...(e?.jobIds ? { result: { jobIds: e.jobIds } } : {}) }).catch(() => undefined); }
    }).catch(() => undefined);
  });
  es.onerror = () => h.onConnection?.(false);
  };
  const onHide = () => disconnect(); const onShow = (e: PageTransitionEvent) => { if (e.persisted) connect(); };
  connect(); addEventListener('pagehide', onHide); addEventListener('pageshow', onShow);
  return () => { removeEventListener('pagehide', onHide); removeEventListener('pageshow', onShow); disconnect(); };
}
