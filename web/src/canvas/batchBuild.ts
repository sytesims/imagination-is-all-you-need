/**
 * Making a whole agent batch on the board in ONE history step (the rules and the layout are server/src/shared/canvasBatch.ts; the agent
 * bridge resolves workflows, models and typed connections and hands them in as `deps`, so this file has no catalog, no React and no
 * network, and the server test drives it with a stub editor).
 *
 * All or nothing: one history mark, every shape created inside it, the typed connection checks after; any error bails back to the mark,
 * so nothing is half-made, and a single Undo removes the whole batch. Nothing runs: cards are drafts.
 */
import { createShapeId, toRichText, type Editor, type TLShapeId } from 'tldraw';
import type { BatchItem } from '../../../server/src/shared/canvasBatch';
import { GEN_TYPE, draftProps } from './cardModel';
import { linkShapes } from './graph';

export const BATCH_NOTE_SCALE = 1.3; /* 260 px notes, the same as one made by add_note */
export interface BatchDeps {
  /** the workflow an item names, as a draft card's flow id (throws a plain message when unknown) */ flowOf: (workflow: string) => string;
  /** the provider id for a model the item names (throws when unknown); undefined = the workflow's own default */ providerOf: (flowId: string, model?: string) => string | undefined;
  /** typed connection check after creation: throws when `from` can't feed `to` */ check: (from: TLShapeId[], to: TLShapeId) => void;
  /** where an item without a laid-out spot goes (centre) */ spot: (w: number, h: number) => { x: number; y: number };
}
export interface BatchMade { refs: Record<string, string>; cards: string[]; notes: string[]; frames: string[]; arrows: string[]; order: string[] }

export function buildBatch(editor: Editor, items: BatchItem[], pos: { at: Record<number, { x: number; y: number }>; frames: Record<number, { x: number; y: number; w: number; h: number }> }, deps: BatchDeps): BatchMade {
  const made: BatchMade = { refs: {}, cards: [], notes: [], frames: [], arrows: [], order: [] };
  const idOf = (n: string) => (made.refs[n] ?? n) as TLShapeId; const byIndex: (TLShapeId | null)[] = items.map(() => null);
  /* resolve every workflow and model first: nothing is made when one is wrong */
  const flows = items.map((it) => (it.kind === 'add_card' ? deps.flowOf(String(it.workflow)) : ''));
  const providers = items.map((it, i) => (it.kind === 'add_card' ? deps.providerOf(flows[i], it.model) : undefined));
  const mark = editor.markHistoryStoppingPoint('agent batch');
  try {
    editor.run(() => {
      /* frames first (they sit behind their cards), then cards and notes, then the wiring */
      items.forEach((it, i) => {
        if (it.kind !== 'add_frame') return; const id = createShapeId(); const b = pos.frames[i] ?? (it.at ? { x: it.at.x, y: it.at.y, w: it.w ?? 820, h: it.h ?? 520 } : { ...deps.spot(it.w ?? 820, it.h ?? 520), w: it.w ?? 820, h: it.h ?? 520 });
        editor.createShape({ id, type: 'frame', x: b.x, y: b.y, meta: { by: 'agent' }, props: { w: b.w, h: b.h, name: String(it.name ?? 'Frame').slice(0, 80) } } as any); editor.sendToBack([id]);
        byIndex[i] = id; if (it.ref) made.refs[it.ref] = id; made.frames.push(id); made.order.push(id);
      });
      items.forEach((it, i) => {
        if (it.kind === 'add_card') {
          const id = createShapeId(); const props = draftProps({ flow: flows[i], prompt: it.prompt ?? '', ...(providers[i] ? { provider: providers[i] } : {}), ...(it.settings ? { vals: it.settings } : {}) });
          const c = it.at ?? pos.at[i] ?? deps.spot(props.w, props.h);
          editor.createShape({ id, type: GEN_TYPE, x: c.x - props.w / 2, y: c.y - props.h / 2, props, meta: { by: 'agent', ...(it.name?.trim() ? { name: it.name.trim().slice(0, 80) } : {}) } } as any);
          byIndex[i] = id; if (it.ref) made.refs[it.ref] = id; made.cards.push(id); made.order.push(id);
        } else if (it.kind === 'add_note') {
          const id = createShapeId(); const size = 200 * BATCH_NOTE_SCALE; const c = it.at ?? pos.at[i] ?? deps.spot(size, size);
          editor.createShape({ id, type: 'note', x: c.x - size / 2, y: c.y - size / 2, meta: { by: 'agent' }, props: { color: it.color ?? 'yellow', richText: toRichText(String(it.text ?? '')), scale: BATCH_NOTE_SCALE, size: 'm', font: 'sans', align: 'start', verticalAlign: 'start' } } as any);
          byIndex[i] = id; if (it.ref) made.refs[it.ref] = id; made.notes.push(id); made.order.push(id);
        }
      });
      items.forEach((it, i) => {
        const self = byIndex[i];
        if ((it.kind === 'add_card' || it.kind === 'add_note') && it.frame && self) { const f = editor.getShape(idOf(it.frame)); if (f?.type !== 'frame') throw new Error(`Item ${i + 1}: “${it.frame}” is not a frame on this board.`); editor.reparentShapes([self], f.id); }
        if (it.kind === 'add_card' && self) for (const src of it.inputs_from ?? []) { if (!editor.getShape(idOf(src))) throw new Error(`Item ${i + 1}: there is no node “${src}” on this board.`); const a = linkShapes(editor, idOf(src), self); if (a) made.arrows.push(a); }
        if (it.kind === 'connect') { const a = idOf(it.from_id!), b = idOf(it.to_id!); if (!editor.getShape(a) || !editor.getShape(b)) throw new Error(`Item ${i + 1}: both ends must be on this board.`); const arr = linkShapes(editor, a, b); if (!arr) throw new Error(`Item ${i + 1}: that arrow couldn't be drawn.`); made.arrows.push(arr); }
        if (it.kind === 'move_into') { const f = editor.getShape(idOf(it.frame_id!)); if (f?.type !== 'frame') throw new Error(`Item ${i + 1}: “${it.frame_id}” is not a frame on this board.`); const ids = (it.ids ?? []).map(idOf).filter((x) => editor.getShape(x)); editor.reparentShapes(ids, f.id); }
      });
    });
    /* typed connections, once every card exists (a picture into a music card is refused, and nothing stays) */
    items.forEach((it, i) => {
      if (it.kind === 'add_card' && byIndex[i] && it.inputs_from?.length) deps.check(it.inputs_from.map(idOf), byIndex[i]!);
      if (it.kind === 'connect') deps.check([idOf(it.from_id!)], idOf(it.to_id!));
    });
  } catch (e) { editor.bailToMark(mark); throw e; }
  return made;
}
