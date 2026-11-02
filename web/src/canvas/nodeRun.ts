/** Quoting and submitting a generate node, shared by the card's own Generate, the agent API and a group's Run all. */
import type { Editor, TLShapeId } from 'tldraw';
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
export function effectivePrompt(editor: Editor, id: TLShapeId, own: string): string { return promptInto(editor, id) || own; }

/** A fresh quote for the card as it is now (the same GET /price the run is checked against: quote = charge). */
export async function quoteNode(editor: Editor, id: TLShapeId, o: { pending?: boolean } = {}): Promise<any> {
  const s = editor.getShape(id); if (!s) return null; const st = cardState(editor, s, catalogNow(), o); if (!st.spec) return null; const sp = st.spec;
  const u = new URLSearchParams({ ...quoteParams(), ...(sp.provider ? { provider: sp.provider, ...pinQ(sp.provider) } : {}), ...sp.quote });
  const n = batchOf(sp.slots, st.bySlot)?.inputs.length ?? 1; /* Material Swap: one run per swatch, so n × the price */
  return fetch(`/api/tools/${sp.tool.id}/price?${u}`).then(readQuoteBody).then(q => timesQuote(q, n)).catch(() => null);
}

/** Run the card: a fresh quote first, then the jobs API. Throws a plain message when something is missing or the server refuses. */
export async function submitNode(editor: Editor, id: TLShapeId): Promise<string> {
  const s = editor.getShape(id); if (!s || s.type !== GEN_TYPE) throw new Error('That card isn’t on the board any more.'); const p: any = s.props;
  if (p.status === 'running') throw new Error('It’s already running.');
  const st = cardState(editor, s, catalogNow()); if (!st.spec) throw new Error('Still loading the workflows. Try again in a moment.');
  const wait = waitingInputsOf(editor, id)[0];
  if (wait) throw new Error(`Waits for ${wait.name}: generate it first (or remove its arrow), so this run gets its input.`);
  const prompt = effectivePrompt(editor, id, p.prompt);
  const miss = missingOf(st.spec, st.bySlot, prompt); if (miss) throw new Error(miss);
  const q = await quoteNode(editor, id); if (q && q.runnable === false) throw new Error(String(q.reasonText ?? q.reason ?? q.error ?? 'This model can’t run here right now.'));
  const ctx = boardCtx();
  return submitCard(editor, id, { spec: st.spec, bySlot: st.bySlot, inputs: st.inputs, prompt, projectId: ctx.projectId, boardId: ctx.boardId, quote: q, modelName: modelNameOf(st.spec), maker: makerOf(st.spec) });
}

/** The cards a card still waits on, with their state (for runOrder). */
const waitsOf = (editor: Editor) => (id: string): Upstream[] => waitingInputsOf(editor, id as TLShapeId).map(w => ({ id: w.id, name: w.name, status: String((editor.getShape(w.id)?.props as any)?.status ?? '') }));
/** A card in a run that didn't start says so on itself (2026-11-02): the server's words (or why it waited) as a failed card, so a Go that
 *  started only some cards never leaves one silently back as a draft. A card that is running (another click started it) is left alone. */
export function markNotStarted(editor: Editor, id: string, error: string) {
  const s = editor.getShape(id as TLShapeId); if (!s || s.type !== GEN_TYPE || (s.props as any).status === 'running') return;
  editor.run(() => editor.updateShape({ id: s.id, type: GEN_TYPE, props: { status: 'failed', jobId: '', error: String(error || 'This card didn’t start.').slice(0, 400) } } as any), { history: 'ignore' });
}
export type { OrderedRun } from './nodeLogic';
/** Run several cards in graph order on this board (nodeLogic.runInOrder): Go on a proposal, a group's Run all. */
export const submitInOrder = (editor: Editor, ids: string[], o: Pick<RunDeps, 'stop' | 'onLater' | 'timeoutMs'> = {}): Promise<OrderedRun> =>
  runInOrder(ids, { ...o, waits: waitsOf(editor), submit: id => submitNode(editor, id as TLShapeId), exists: id => !!editor.getShape(id as TLShapeId), notStarted: (id, e) => markNotStarted(editor, id, e) });
