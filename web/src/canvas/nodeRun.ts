/** Quoting and submitting a generate node, shared by the card's own Generate, the agent API and a group's Run all. */
import type { BoardApi, NodeId } from './boardApi';
import { readQuoteBody } from '../shared/quote';
import { quoteParams } from '../shared/usePrefill';
import { pinQ } from '../ui/routing/Routes';
import { catalogNow } from './catalog';
import { cardState, makerOf, missingOf, modelNameOf } from './cardState';
import { GEN_TYPE } from './nodeTypes';
import { promptInto, waitingInputsOf } from './graph';
import { runInOrder, type OrderedRun, type RunDeps, type Upstream } from './nodeLogic';
import { submitCard } from './genRun';
import { batchOf } from './cardModel';
import { timesQuote } from '../../../server/src/shared/swatchBatch';
import { boardCtx } from './boardCtx';

/** The effective prompt: a Prompt / Note node wired in wins over the card's own text. */
export function effectivePrompt(board: BoardApi, id: NodeId, own: string): string { return promptInto(board, id) || own; }

/** A fresh quote for the card as it is now (the same GET /price the run is checked against: quote = charge). */
export async function quoteNode(board: BoardApi, id: NodeId, o: { pending?: boolean } = {}): Promise<any> {
  const s = board.getNode(id); if (!s) return null; const st = cardState(board, s, catalogNow(), o); if (!st.spec) return null; const sp = st.spec;
  const u = new URLSearchParams({ ...quoteParams(), ...(sp.provider ? { provider: sp.provider, ...pinQ(sp.provider) } : {}), ...sp.quote });
  /* GPT Image bills prompt text (an app's recipe around it too): the quote counts the card's words as the run will send them (quote = charge) */
  const words = sp.promptMode === 'hidden' ? '' : effectivePrompt(board, id, String((s.props as any).prompt ?? '')).trim(); if (words) u.set('promptBytes', String(new TextEncoder().encode(words).length));
  const n = batchOf(sp.slots, st.bySlot)?.inputs.length ?? 1; /* Material Swap: one run per swatch, so n × the price */
  return fetch(`/api/tools/${sp.tool.id}/price?${u}`).then(readQuoteBody).then(q => timesQuote(q, n)).catch(() => null);
}

/** Run the card: a fresh quote first, then the jobs API. Throws a plain message when something is missing or the server refuses. */
export async function submitNode(board: BoardApi, id: NodeId): Promise<string> {
  const s = board.getNode(id); if (!s || s.type !== GEN_TYPE) throw new Error('That card isn’t on the board any more.'); const p: any = s.props;
  if (p.status === 'running') throw new Error('It’s already running.');
  const st = cardState(board, s, catalogNow()); if (!st.spec) throw new Error('Still loading the workflows. Try again in a moment.');
  const wait = waitingInputsOf(board, id)[0];
  if (wait) throw new Error(`Waits for ${wait.name}: generate it first (or remove its arrow), so this run gets its input.`);
  const prompt = effectivePrompt(board, id, p.prompt);
  const miss = missingOf(st.spec, st.bySlot, prompt); if (miss) throw new Error(miss);
  const q = await quoteNode(board, id); if (q && q.runnable === false) throw new Error(String((q.blockedCode === 'spend_cap' ? q.blockedReason : null) ?? q.reasonText ?? q.reason ?? q.error ?? q.blockedReason ?? 'This model can’t run here right now.'));
  const ctx = boardCtx();
  return submitCard(board, id, { spec: st.spec, bySlot: st.bySlot, inputs: st.inputs, prompt, projectId: ctx.projectId, boardId: ctx.boardId, quote: q, modelName: modelNameOf(st.spec), maker: makerOf(st.spec) });
}

/** The cards a card still waits on, with their state (for runOrder). */
const waitsOf = (board: BoardApi) => (id: string): Upstream[] => waitingInputsOf(board, id as NodeId).map(w => ({ id: w.id, name: w.name, status: String((board.getNode(w.id)?.props as any)?.status ?? '') }));
/** A card in a run that didn't start says so on itself (2026-11-02): the server's words (or why it waited) as a failed card, so a Go that
 *  started only some cards never leaves one silently back as a draft. A card that is running (another click started it) is left alone. */
export function markNotStarted(board: BoardApi, id: string, error: string) {
  const s = board.getNode(id as NodeId); if (!s || s.type !== GEN_TYPE || (s.props as any).status === 'running') return;
  board.batch(() => board.patchNode(s.id, { props: { status: 'failed', jobId: '', error: String(error || 'This card didn’t start.').slice(0, 400) } } as any), { history: 'ignore' });
}
export type { OrderedRun } from './nodeLogic';
/** Run several cards in graph order on this board (nodeLogic.runInOrder): Go on a proposal, a group's Run all. */
export const submitInOrder = (board: BoardApi, ids: string[], o: Pick<RunDeps, 'stop' | 'onLater' | 'timeoutMs'> = {}): Promise<OrderedRun> =>
  runInOrder(ids, { ...o, waits: waitsOf(board), submit: id => submitNode(board, id as NodeId), exists: id => !!board.getNode(id as NodeId), notStarted: (id, e) => markNotStarted(board, id, e) });
