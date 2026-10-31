/**
 * Running a generate card through the app's own jobs API (POST /api/tools/:id/jobs, then GET /api/jobs/:id), and nothing else:
 *  - submitCard: sends the card's form (cardModel.runForm: fields from the shared flow spec, files fetched from the board's /files/ URLs,
 *    the model + its Run on pin, the board's project, the board id for its spend chip, the first input's job as parent). Only an explicit
 *    run calls it (the card's Generate, Enter on a selected card, Retry, Recreate, or the agent API's submit): a quick
 *    action or ⌘D only makes a draft.
 *  - watchJob: follows a job (live progress stays outside the board, in liveJobs; only the outcome is written to the card), so a reload
 *    reattaches every card that was running (reattachRunning) and it still finishes there.
 */
import { atom, type Editor, type TLShapeId } from 'tldraw';
import { createJob, getJob, retryJob, type JobState } from '../api';
import { pinQ } from '../ui/routing/Routes';
import { mediaToFile } from '../shared/urlFile';
import type { FlowSpec } from '../shared/genFlows';
import { GEN_TYPE, compactQuote, runForm, takesOf, addVersions, madeFromOf, withFrom, batchOf, type BoardInput, type MadeFrom, type Take } from './cardModel';
import { runBatch, setState } from '../../../server/src/shared/swatchBatch';
import { cardInputs } from './graph';
export { compactQuote, takesOf, addVersions, MAX_VERSIONS, type Take } from './cardModel';
/** job id → the inputs it was sent with (its versions keep them as "Made from"). A reload falls back to the card's inputs at the end. */
const usedBy = new Map<string, MadeFrom[]>();
const KIND_SLOT: Record<string, string> = { image: 'Picture', video: 'Clip', audio: 'Sound' };
const fromOfCard = (editor: Editor, c: any): MadeFrom[] => usedBy.get(c.props.jobId) ?? cardInputs(editor, c).map(i => ({ slot: KIND_SLOT[i.kind] ?? 'Input', kind: i.kind, label: i.label, poster: i.poster, url: i.url, ...(i.shapeId ? { shapeId: i.shapeId } : {}) }));

/** The live job of each running card (progress, stage, ETA for the shared GenTile). Not saved with the board. */
export const liveJobs = atom<Record<string, JobState>>('ohf-gen-live', {});
const putLive = (j: JobState) => liveJobs.update(m => ({ ...m, [j.id]: j }));
export const SPEND_EVT = 'ohf-canvas-spend';
const TERMINAL = new Set(['done', 'failed', 'blocked', 'canceled']);

/** A card's set of runs (Material Swap: one per swatch), kept in its meta; [] for a plain run. */
export const batchIdsOf = (s: { meta?: any } | undefined): string[] => (Array.isArray(s?.meta?.batch) ? s!.meta.batch.filter((x: unknown) => typeof x === 'string' && x) : []);
const cardsOfJob = (editor: Editor, jobId: string) => editor.getCurrentPageShapes().filter(s => s.type === GEN_TYPE && ((s.props as any).jobId === jobId || batchIdsOf(s).includes(jobId)));
/** Write a job's outcome to every card that ran it (not undoable: it's the result, not an edit). */
function settle(editor: Editor, j: JobState) {
  if (editor.isDisposed) return; const cards = cardsOfJob(editor, j.id); if (!cards.length) return;
  const sets = cards.filter(c => batchIdsOf(c).length > 1); if (sets.length) settleSet(editor, sets, j); if (sets.length === cards.length) return;
  const done = j.status === 'done'; const takes = done ? takesOf(j) : [];
  /* versions stay on the card: a new run's outputs join the strip and the first of them becomes the active version */
  editor.run(() => editor.updateShapes(cards.filter(c => batchIdsOf(c).length <= 1).map(c => ({ id: c.id, type: GEN_TYPE, props: done && takes.length ? { status: 'done', ...addVersions((c.props as any).takes ?? [], withFrom(takes, fromOfCard(editor, c))), error: '', ratio: 0 } : { status: 'failed', error: String(j.error || (done ? 'The run finished without a result.' : j.status === 'canceled' ? 'Canceled.' : 'The run failed.')).slice(0, 400) } } as any))), { history: 'ignore' });
  if (done) usedBy.delete(j.id); dispatchEvent(new Event(SPEND_EVT));
}

/** One run of a card's set ended: its versions join the strip (each with the swatch it used); the card stays running until every run has
 *  ended, then shows its versions, or says how many didn't finish (Retry runs just those). */
function settleSet(editor: Editor, cards: any[], j: JobState) {
  const live = liveJobs.get(); const takes = j.status === 'done' ? takesOf(j) : [];
  editor.run(() => editor.updateShapes(cards.map(c => { const ids = batchIdsOf(c); const st = setState(ids.map(id => (id === j.id ? j.status : live[id]?.status)));
    const firstFailed = ids.find(id => (id === j.id ? j : live[id])?.status && ['failed', 'blocked', 'canceled'].includes(String((id === j.id ? j : live[id])!.status)));
    const v = takes.length ? addVersions((c.props as any).takes ?? [], withFrom(takes, usedBy.get(j.id))) : null;
    const end = !st.done ? { status: 'running' } : st.failed ? { status: 'failed', jobId: firstFailed ?? (c.props as any).jobId, error: `${st.failed} of ${ids.length} swatches didn’t finish. Retry runs just ${st.failed === 1 ? 'that one' : 'those'}.` } : { status: 'done', error: '' };
    return { id: c.id, type: GEN_TYPE, props: { ...(v ?? {}), ...end, ratio: 0 } }; }) as any), { history: 'ignore' });
  if (j.status === 'done') usedBy.delete(j.id); dispatchEvent(new Event(SPEND_EVT));
}

const watching = new Map<string, Set<Editor>>();
/** Follow a job until it ends (1 s, slowing to 4 s; keeps going through a dropped connection). */
export function watchJob(editor: Editor, jobId: string) {
  if (!jobId) return; const eds = watching.get(jobId); if (eds) { eds.add(editor); return; } const set = new Set([editor]); watching.set(jobId, set);
  let delay = 1000;
  const tick = async () => {
    const live = [...set].filter(e => !e.isDisposed); if (!live.length) { watching.delete(jobId); return; }
    try { const j = await getJob(jobId); putLive(j); if (TERMINAL.has(j.status) && !(j as any).lateWatch) { watching.delete(jobId); live.forEach(e => settle(e, j)); return; } }
    catch (e) { if ((e as Error).message === 'Job not found') { watching.delete(jobId); live.forEach(ed => settle(ed, { id: jobId, status: 'failed', error: 'This run is no longer available.' } as any)); return; } }
    delay = Math.min(4000, delay * 1.15); setTimeout(() => void tick(), delay);
  };
  void tick();
}
/** After a board opens: cards that were running follow their job again; failed cards fetch it once (the failure wording reads it). */
export function reattachRunning(editor: Editor) {
  for (const s of editor.getCurrentPageShapes()) { if (s.type !== GEN_TYPE) continue; const p: any = s.props;
    if (p.status === 'running' && p.jobId) { watchJob(editor, p.jobId); for (const id of batchIdsOf(s)) watchJob(editor, id); }
    else if (p.status === 'failed' && p.jobId && !liveJobs.get()[p.jobId]) void getJob(p.jobId).then(putLive).catch(() => undefined); }
}

export interface RunCtx { spec: FlowSpec; bySlot: Record<string, BoardInput[]>; inputs: BoardInput[]; prompt: string; projectId: string | null; boardId: string; quote: any; modelName: string; maker: string }
/** Submit a card's run. Throws the jobs API's error (its message is in the user's words); the card is untouched then. */
export async function submitCard(editor: Editor, cardId: TLShapeId, c: RunCtx): Promise<string> {
  const { spec } = c; const b = batchOf(spec.slots, c.bySlot); if (b) return submitSet(editor, cardId, c, b); const form = runForm(spec, c.bySlot, c.inputs, c.prompt, { projectId: c.projectId, boardId: c.boardId, route: spec.provider ? pinQ(spec.provider).route ?? null : null });
  const fd = new FormData(); for (const [k, v] of Object.entries(form.fields)) fd.append(k, v);
  for (const f of form.files) { const file = await mediaToFile(f.input.url, f.input.kind, f.name); fd.append(f.field, file, file.name); }
  const r = await createJob(spec.tool.id, fd, { showsIssues: true });
  usedBy.set(r.id, madeFromOf(spec.slots, c.bySlot));
  startRun(editor, cardId, r.id, c);
  return r.id;
}
/** Material Swap with several swatches: one run per swatch through the same jobs API, one set (shared/swatchBatch.ts). The same seed for
 *  every swatch (same object, same scene). One that the server refuses isn't charged; the others still run. */
async function submitSet(editor: Editor, cardId: TLShapeId, c: RunCtx, b: { slot: string; inputs: BoardInput[] }): Promise<string> {
  const { spec } = c; const seed = Math.floor(Math.random() * 1e6);
  const r = await runBatch(b.inputs, async (inp, set) => { const bySlot = { ...c.bySlot, [b.slot]: [inp] };
    const form = runForm(spec, bySlot, c.inputs, c.prompt, { projectId: c.projectId, boardId: c.boardId, seed, route: spec.provider ? pinQ(spec.provider).route ?? null : null });
    const fd = new FormData(); for (const [k, v] of Object.entries({ ...form.fields, ...set })) fd.append(k, v);
    for (const f of form.files) { const file = await mediaToFile(f.input.url, f.input.kind, f.name); fd.append(f.field, file, file.name); }
    const res = await createJob(spec.tool.id, fd, { showsIssues: true }); usedBy.set(res.id, madeFromOf(spec.slots, bySlot)); return res.id; });
  const ids = r.jobIds.filter((x): x is string => !!x); if (!ids.length) throw new Error(r.failed[0]?.error ?? 'None of the swatches started.');
  startRun(editor, cardId, ids[0], c, ids);
  return ids[0];
}
function startRun(editor: Editor, cardId: TLShapeId, jobId: string, c: Pick<RunCtx, 'inputs' | 'quote' | 'modelName' | 'maker'> | null, batch: string[] = []) {
  const s = editor.getShape(cardId); if (!s) return; const p: any = s.props;
  editor.run(() => editor.updateShape({ id: cardId, type: GEN_TYPE, meta: { ...(s.meta ?? {}), batch: batch.length > 1 ? batch : null }, props: { status: 'running', jobId, error: '', runs: (p.runs ?? 0) + 1, ratio: 0, /* the versions so far stay (the strip keeps them; the active one keeps flowing on) */
    ...(c ? { parents: [...new Set([...(p.parents ?? []), ...c.inputs.map(i => i.shapeId).filter(Boolean)])], quote: compactQuote(c.quote) ?? p.quote ?? null, model: c.modelName || p.model, maker: c.maker || p.maker } : {}) } } as any), { history: 'ignore' });
  watchJob(editor, jobId); for (const id of batch) watchJob(editor, id); dispatchEvent(new Event(SPEND_EVT));
}
/** Retry a failed run with the same settings (the jobs API's retry, like the failure view's Retry). */
export async function retryCard(editor: Editor, cardId: TLShapeId) {
  const s = editor.getShape(cardId); const jobId = (s?.props as any)?.jobId; if (!jobId) throw new Error('Nothing to retry yet.');
  const set = batchIdsOf(s); if (set.length > 1) { /* a set: only the swatches that didn't finish run again; the rest keep their versions */
    const live = liveJobs.get(); const bad = set.filter(id => ['failed', 'blocked', 'canceled'].includes(String(live[id]?.status ?? (id === jobId ? 'failed' : ''))));
    if (!bad.length) throw new Error('Every swatch finished: nothing to retry.');
    const next = [...set]; for (const id of bad) { const nid = await retryJob(id); const was = usedBy.get(id) ?? (s!.props as any).takes?.find((t: Take) => t.jobId === id)?.from; if (was) usedBy.set(nid, was); next[set.indexOf(id)] = nid; }
    startRun(editor, cardId, next[0], null, next); return next[0]; }
  const id = await retryJob(jobId); const last: Take | undefined = (s!.props as any).takes?.at?.(-1); const was = usedBy.get(jobId) ?? last?.from; if (was) usedBy.set(id, was); startRun(editor, cardId, id, null); return id;
}
