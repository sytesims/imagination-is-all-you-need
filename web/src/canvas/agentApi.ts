/**
 * The board's "agent API": the one way code (the card's own buttons today, an AI agent panel later) makes, edits, prices and runs
 * nodes. Everything goes through the shared flow spec (shared/genFlows.ts) and the jobs API (genRun.submitCard), so an agent gets exactly
 * the same rules as a person: real model limits, quote = charge, the board's project, nothing runs without an explicit submit().
 *
 * createNode(kind, …) makes any node kind (gen, prompt, upload, note, compare, group); connect(from, to) wires an output into an input
 * with the existing tldraw arrow binding. The generate functions are unchanged for existing callers.
 *
 * Future agent panel (not built): mount it in CanvasPage's `.cv-agent-slot` (right edge, `data-slot="agent-panel"`, width from the CSS
 * variable --cv-agent-w on .cv-root, 0 today; the Assets button and drawer already sit left of it). It gets the editor from
 * useCanvasEditor() and calls the functions below. In dev builds they are on window.__ohfCanvasAgent for checks.
 */
import type { Editor, TLShapeId, VecLike } from 'tldraw';
import { availableFlows, flowById, type GenMedium } from '../shared/genFlows';
import { catalogNow } from './catalog';
import { cardState, makerOf, missingOf, modelNameOf } from './cardState';
import { GEN_TYPE, draftProps, type GenCardProps } from './cardModel';
import { linkShapes, promptInto } from './graph';
import { quoteNode, submitNode } from './nodeRun';
import { createShapeId } from 'tldraw';
import { freeSpot, reveal } from './placement';
import { createAuxNode, type AuxCreateOpts } from './auxShapes';
import type { NodeKind } from './nodeTypes';
import { setBoardCtx, boardCtx, useCanvasEditor } from './boardCtx';
export { setBoardCtx, boardCtx, useCanvasEditor, reveal };

/** The workflow a new card starts on: the last one made on this board (G uses it). */
let lastFlow = 'create';
export const lastFlowNow = () => lastFlow;

/** The workflows a card can run on this server (id, medium, name, line, what it takes). */
export const listFlows = () => availableFlows(catalogNow()).map(f => ({ id: f.id, medium: f.medium, name: f.name, tagline: f.tagline, needs: f.needs }));

/** A new draft card (selected; centred on `at`, default the middle of the view). `from`: shapes to wire in as inputs with arrows. */
export function createCard(editor: Editor, o: { flow?: string; medium?: GenMedium; at?: VecLike; prompt?: string; provider?: string; vals?: Record<string, string>; parents?: string[]; from?: TLShapeId[]; select?: boolean } = {}): TLShapeId {
  const id = createShapeId(); const props = draftProps(o); lastFlow = props.flow; const c = o.at ?? freeSpot(editor, props.w, props.h);
  editor.markHistoryStoppingPoint('new generate card');
  editor.run(() => { editor.createShape({ id, type: GEN_TYPE, x: c.x - props.w / 2, y: c.y - props.h / 2, props } as any); for (const src of o.from ?? []) linkShapes(editor, src, id); });
  if (o.select !== false) editor.select(id);
  return id;
}

/** Any node kind: generate uses the card above; prompt / upload / note / compare / group use the shared node frame. */
export function createNode(editor: Editor, kind: NodeKind, o: AuxCreateOpts & { flow?: string; medium?: GenMedium; prompt?: string; provider?: string; vals?: Record<string, string>; parents?: string[]; from?: TLShapeId[] } = {}): TLShapeId {
  if (kind === 'gen') return createCard(editor, o);
  if (kind === 'result') throw new Error('Result nodes come from a finished run.');
  return createAuxNode(editor, kind, o);
}

/** Change a card (prompt, workflow, model, settings, pins). A new workflow resets the model and settings to that workflow's own. */
export function setCard(editor: Editor, id: TLShapeId, patch: Partial<Pick<GenCardProps, 'prompt' | 'flow' | 'provider' | 'vals' | 'pins' | 'inputs'>>) {
  const s = editor.getShape(id); if (!s || s.type !== GEN_TYPE) return; const f = patch.flow ? flowById(patch.flow) : null;
  const props: Partial<GenCardProps> = { ...patch, ...(f ? { medium: f.medium, provider: patch.provider ?? f.provider ?? '', vals: patch.vals ?? {}, ratio: 0 } : {}) };
  editor.run(() => editor.updateShape({ id, type: GEN_TYPE, props } as any), { history: 'ignore' });
}
/** Wire a node's output into another node's input: an arrow, exactly as a person would draw it. */
export function connect(editor: Editor, fromId: TLShapeId, toId: TLShapeId): TLShapeId | null { editor.markHistoryStoppingPoint('connect input'); return linkShapes(editor, fromId, toId); }
/** What a card is and needs: its workflow, model, settings, inputs by slot, the first missing step, and its status. */
export function describeCard(editor: Editor, id: TLShapeId) {
  const s = editor.getShape(id); if (!s || s.type !== GEN_TYPE) return null; const st = cardState(editor, s, catalogNow()); const p = s.props as GenCardProps;
  return { id, flow: p.flow, status: p.status, prompt: promptInto(editor, id) || p.prompt, model: modelNameOf(st.spec), provider: st.spec?.provider ?? p.provider, vals: st.spec?.vals ?? p.vals, providers: st.spec?.providers.map(x => x.id) ?? [],
    slots: st.spec?.slots.map(x => ({ name: x.name, label: x.label, accept: x.accept, required: x.required, max: x.max, filled: st.bySlot[x.name]?.length ?? 0 })) ?? [], unused: st.extra.length,
    missing: missingOf(st.spec, st.bySlot, promptInto(editor, id) || p.prompt), jobId: p.jobId || null, takes: p.takes.length };
}
/** A fresh quote for the card as it is now (the same GET /price the run is checked against: quote = charge). */
export const quoteCard = quoteNode;
/** Run the card: a fresh quote first, then the jobs API. Throws a plain message when something is missing or the server refuses. */
export const submit = submitNode;
/** Expose for dev checks (never in a production build). */
export function exposeForDev(editor: Editor) {
  if (!(import.meta as any).env?.DEV) return;
  (window as any).__ohfCanvasAgent = { listFlows, describeCard: (id: string) => describeCard(editor, id as TLShapeId), createCard: (o: any) => createCard(editor, o), createNode: (kind: NodeKind, o: any) => createNode(editor, kind, o), setCard: (id: string, p: any) => setCard(editor, id as TLShapeId, p), connect: (a: string, b: string) => connect(editor, a as TLShapeId, b as TLShapeId), quoteCard: (id: string) => quoteCard(editor, id as TLShapeId), submit: (id: string) => submit(editor, id as TLShapeId) };
}
