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
import { GEN_TYPE, compactQuote, runForm, takesOf, addVersions, type BoardInput } from './cardModel';
export { compactQuote, takesOf, addVersions, MAX_VERSIONS, type Take } from './cardModel';

/** The live job of each running card (progress, stage, ETA for the shared GenTile). Not saved with the board. */
export const liveJobs = atom<Record<string, JobState>>('ohf-gen-live', {});
const putLive = (j: JobState) => liveJobs.update(m => ({ ...m, [j.id]: j }));
export const SPEND_EVT = 'ohf-canvas-spend';
const TERMINAL = new Set(['done', 'failed', 'blocked', 'canceled']);

const cardsOfJob = (editor: Editor, jobId: string) => editor.getCurrentPageShapes().filter(s => s.type === GEN_TYPE && (s.props as any).jobId === jobId);
/** Write a job's outcome to every card that ran it (not undoable: it's the result, not an edit). */
function settle(editor: Editor, j: JobState) {
  if (editor.isDisposed) return; const cards = cardsOfJob(editor, j.id); if (!cards.length) return;
  const done = j.status === 'done'; const takes = done ? takesOf(j) : [];
  /* versions stay on the card: a new run's outputs join the strip and the first of them becomes the active version */
  editor.run(() => editor.updateShapes(cards.map(c => ({ id: c.id, type: GEN_TYPE, props: done && takes.length ? { status: 'done', ...addVersions((c.props as any).takes ?? [], takes), error: '', ratio: 0 } : { status: 'failed', error: String(j.error || (done ? 'The run finished without a result.' : j.status === 'canceled' ? 'Canceled.' : 'The run failed.')).slice(0, 400) } } as any))), { history: 'ignore' });
  dispatchEvent(new Event(SPEND_EVT));
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
    if (p.status === 'running' && p.jobId) watchJob(editor, p.jobId);
    else if (p.status === 'failed' && p.jobId && !liveJobs.get()[p.jobId]) void getJob(p.jobId).then(putLive).catch(() => undefined); }
}

export interface RunCtx { spec: FlowSpec; bySlot: Record<string, BoardInput[]>; inputs: BoardInput[]; prompt: string; projectId: string | null; boardId: string; quote: any; modelName: string; maker: string }
/** Submit a card's run. Throws the jobs API's error (its message is in the user's words); the card is untouched then. */
export async function submitCard(editor: Editor, cardId: TLShapeId, c: RunCtx): Promise<string> {
  const { spec } = c; const form = runForm(spec, c.bySlot, c.inputs, c.prompt, { projectId: c.projectId, boardId: c.boardId, route: spec.provider ? pinQ(spec.provider).route ?? null : null });
  const fd = new FormData(); for (const [k, v] of Object.entries(form.fields)) fd.append(k, v);
  for (const f of form.files) { const file = await mediaToFile(f.input.url, f.input.kind, f.name); fd.append(f.field, file, file.name); }
  const r = await createJob(spec.tool.id, fd, { showsIssues: true });
  startRun(editor, cardId, r.id, c);
  return r.id;
}
function startRun(editor: Editor, cardId: TLShapeId, jobId: string, c: Pick<RunCtx, 'inputs' | 'quote' | 'modelName' | 'maker'> | null) {
  const s = editor.getShape(cardId); if (!s) return; const p: any = s.props;
  editor.run(() => editor.updateShape({ id: cardId, type: GEN_TYPE, props: { status: 'running', jobId, error: '', runs: (p.runs ?? 0) + 1, ratio: 0, /* the versions so far stay (the strip keeps them; the active one keeps flowing on) */
    ...(c ? { parents: [...new Set([...(p.parents ?? []), ...c.inputs.map(i => i.shapeId).filter(Boolean)])], quote: compactQuote(c.quote) ?? p.quote ?? null, model: c.modelName || p.model, maker: c.maker || p.maker } : {}) } } as any), { history: 'ignore' });
  watchJob(editor, jobId); dispatchEvent(new Event(SPEND_EVT));
}
/** Retry a failed run with the same settings (the jobs API's retry, like the failure view's Retry). */
export async function retryCard(editor: Editor, cardId: TLShapeId) {
  const s = editor.getShape(cardId); const jobId = (s?.props as any)?.jobId; if (!jobId) throw new Error('Nothing to retry yet.');
  const id = await retryJob(jobId); startRun(editor, cardId, id, null); return id;
}
