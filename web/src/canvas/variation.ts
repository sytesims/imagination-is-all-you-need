/** Variations of a generate card (⌘D and the card's Variation button): a new draft, never a run. */
import type { BoardApi, NodeId } from './boardApi';
import { GEN_TYPE } from './cardModel';
import type { GenCardShape } from './genCardUtil';
import { cardInputs, promptSourcesInto } from './graph';
import { createCard, reveal } from './agentApi';

/** A variation: the same workflow, model, settings, prompt and inputs as a new draft card beside it (the same arrows in). Doesn't run. */
export function variationOf(board: BoardApi, id: NodeId): NodeId | null {
  const s = board.getNode(id) as GenCardShape | undefined; if (!s || s.type !== GEN_TYPE) return null; const b = board.boundsOf(id); if (!b) return null;
  const from = [...new Set([...cardInputs(board, s).filter(i => i.shapeId).map(i => i.shapeId as NodeId), ...promptSourcesInto(board, id).map(x => x.id)])];
  board.mark('variation');
  const nid = createCard(board, { flow: s.props.flow, provider: s.props.provider, prompt: s.props.prompt, vals: { ...s.props.vals }, at: { x: b.maxX + 48 + b.w / 2, y: b.minY + 124 }, parents: [...s.props.parents, s.id], from, select: true });
  board.batch(() => board.patchNode(nid, { props: { inputs: s.props.inputs, pins: s.props.pins } } as any), { history: 'ignore' }); reveal(board, nid);
  return nid;
}
