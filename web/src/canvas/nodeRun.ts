/** Quoting and submitting a generate node, shared by the card's own Generate, the agent API and a group's Run all. */
import type { Editor, TLShapeId } from 'tldraw';
import { readQuoteBody } from '../shared/quote';
import { quoteParams } from '../shared/usePrefill';
import { pinQ } from '../ui/routing/Routes';
import { catalogNow } from './catalog';
import { cardState, makerOf, missingOf, modelNameOf } from './cardState';
import { GEN_TYPE } from './nodeTypes';
import { promptInto, waitingInputsOf } from './graph';
import { runOrder, type Upstream } from './nodeLogic';
import { submitCard } from './genRun';
import { boardCtx } from './boardCtx';

/** The effective prompt: a Prompt / Note node wired in wins over the card's own text. */
export function effectivePrompt(editor: Editor, id: TLShapeId, own: string): string { return promptInto(editor, id) || own; }

/** A fresh quote for the card as it is now (the same GET /price the run is checked against: quote = charge). */
export async function quoteNode(editor: Editor, id: TLShapeId): Promise<any> {
  const s = editor.getShape(id); if (!s) return null; const st = cardState(editor, s, catalogNow()); if (!st.spec) return null; const sp = st.spec;
  const u = new URLSearchParams({ ...quoteParams(), ...(sp.provider ? { provider: sp.provider, ...pinQ(sp.provider) } : {}), ...sp.quote });
  return fetch(`/api/tools/${sp.tool.id}/price?${u}`).then(readQuoteBody).catch(() => null);
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
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export interface OrderedRun { jobIds: string[]; failed: { cardId: string; error: string }[]; /** start by themselves once the cards before them are done */ later: string[] }
/** Run several cards (Go on a proposal, a group's Run all) in graph order (2026-10-28): cards with nothing to wait for start now; a card fed
 *  by another card in the same run starts when that card has its result, so a clip gets its first frame instead of running without it.
 *  `stop` ends the immediate loop on an error nothing after may ignore (a budget). `onLater` hears how each waiting card went. */
export async function submitInOrder(editor: Editor, ids: string[], o: { stop?: (e: Error) => boolean; onLater?: (id: string, r: { jobId?: string; error?: string }) => void; timeoutMs?: number } = {}): Promise<OrderedRun> {
  const w = waitsOf(editor); const plan = runOrder(ids, w); const out: OrderedRun = { jobIds: [], failed: [], later: [] };
  for (const b of plan.blocked) out.failed.push({ cardId: b.id, error: `Waits for ${b.name}, which isn’t running. Generate it first.` });
  for (const id of plan.now) { try { out.jobIds.push(await submitNode(editor, id as TLShapeId)); } catch (e) { out.failed.push({ cardId: id, error: (e as Error).message }); if (o.stop?.(e as Error)) return out; } }
  out.later = plan.later;
  for (const id of plan.later) void (async () => { const end = Date.now() + (o.timeoutMs ?? 3_600_000);
    while (Date.now() < end) { const up = w(id); if (!editor.getShape(id as TLShapeId)) return;
      if (!up.length) { try { o.onLater?.(id, { jobId: await submitNode(editor, id as TLShapeId) }); } catch (e) { o.onLater?.(id, { error: (e as Error).message }); } return; }
      const dead = up.find(u => u.status !== 'running' && u.status !== 'draft'); /* failed (a done card is an input, so it's no longer listed) */
      if (dead || up.every(u => u.status === 'draft' && !ids.includes(u.id))) { o.onLater?.(id, { error: `${dead?.name ?? up[0].name} didn’t finish, so this card didn’t run.` }); return; }
      await sleep(1500); }
    o.onLater?.(id, { error: 'Waited too long for the card before it.' }); })();
  return out;
}
