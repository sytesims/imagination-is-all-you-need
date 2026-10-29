/** Variations of a generate card (⌘D and the card's Variation button): a new draft, never a run. */
import type { Editor, TLShapeId } from 'tldraw';
import { GEN_TYPE } from './cardModel';
import type { GenCardShape } from './genCardUtil';
import { cardInputs, promptSourcesInto } from './graph';
import { createCard, reveal } from './agentApi';

/** A variation: the same workflow, model, settings, prompt and inputs as a new draft card beside it (the same arrows in). Doesn't run. */
export function variationOf(editor: Editor, id: TLShapeId): TLShapeId | null {
  const s = editor.getShape(id) as GenCardShape | undefined; if (!s || s.type !== GEN_TYPE) return null; const b = editor.getShapePageBounds(id); if (!b) return null;
  const from = [...new Set([...cardInputs(editor, s).filter(i => i.shapeId).map(i => i.shapeId as TLShapeId), ...promptSourcesInto(editor, id).map(x => x.id)])];
  editor.markHistoryStoppingPoint('variation');
  const nid = createCard(editor, { flow: s.props.flow, provider: s.props.provider, prompt: s.props.prompt, vals: { ...s.props.vals }, at: { x: b.maxX + 48 + b.w / 2, y: b.minY + 124 }, parents: [...s.props.parents, s.id], from, select: true });
  editor.run(() => editor.updateShape({ id: nid, type: GEN_TYPE, props: { inputs: s.props.inputs, pins: s.props.pins } } as any), { history: 'ignore' }); reveal(editor, nid);
  return nid;
}
