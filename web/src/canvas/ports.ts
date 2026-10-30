/**
 * Typed ports on the board (2026-10-27): what each node puts out and takes in, read from the live board (the rules are plain functions in
 * nodeLogic.ts, so the server test checks them without a browser). NodeFrame draws a small coloured dot per kind on the card edges; a drag
 * from an output lights the cards that take that kind and dims the rest; the agent bridge refuses the same illegal connections.
 *
 * A connection carries media: the arrow binds the two nodes and the downstream card's input is the upstream's ACTIVE version (graph.inputOfShape
 * reads the take the version strip picked), so changing the pick changes what flows on. A draft upstream card feeds once it has a version.
 */
import type { Editor, TLShape, TLShapeId } from 'tldraw';
import type { GenCatalog } from '../shared/genFlows';
import { arrowsInto } from './graph';
import { cardState } from './cardState';
import { NODE_DEFS, nodeDefOf } from './nodeTypes';
import { asPortKind, genIns, outKindOf, type PortInfo, type PortKind } from './nodeLogic';

/** What a node puts out right now. */
export const outKindOfShape = (s: TLShape | undefined | null): PortKind | null => (s ? outKindOf(s.type, s.props) : null);

/** Inputs already wired into a node, counted by kind (arrows by their source's kind, plus files added on a card). */
function usedKinds(editor: Editor, id: TLShapeId): Partial<Record<PortKind, number>> {
  const used: Partial<Record<PortKind, number>> = {};
  for (const a of arrowsInto(editor, id)) { const k = a.fromId ? outKindOfShape(editor.getShape(a.fromId)) : null; if (k) used[k] = (used[k] ?? 0) + 1; }
  for (const i of ((editor.getShape(id)?.props as any)?.inputs ?? []) as { kind?: string }[]) { const k = asPortKind(i?.kind); if (k) used[k] = (used[k] ?? 0) + 1; }
  return used;
}

/** A node's ports: its output kind and its inputs with room left. */
export function portInfoOf(editor: Editor, s: TLShape, cat: GenCatalog | null): PortInfo {
  const def = nodeDefOf(s.type); const base: PortInfo = { id: s.id, type: s.type, out: outKindOfShape(s), ins: [] };
  if (!def?.input) return base;
  if (def.kind === 'gen') { const st = cardState(editor, s, cat); if (!st.spec) return { ...base, ins: [{ kind: 'image', room: 1 }, { kind: 'text', room: 99 }] };
    return { ...base, ins: genIns(st.spec.slots, usedKinds(editor, s.id), st.spec.promptMode === 'hidden') }; }
  if (def.kind === 'compare') { const left = Math.max(0, NODE_DEFS.compare.inputMax - arrowsInto(editor, s.id).length); return { ...base, ins: [{ kind: 'image', room: left }, { kind: 'video', room: left }] }; }
  if (def.kind === 'ad') return { ...base, ins: [{ kind: 'image', room: Math.max(0, NODE_DEFS.ad.inputMax - arrowsInto(editor, s.id).length) }] };
  return base;
}

/** Every node on the page as ports (the drag computes legal targets once, at its start). */
export function boardPorts(editor: Editor, cat: GenCatalog | null): PortInfo[] {
  return editor.getCurrentPageShapes().filter((s) => nodeDefOf(s.type)).map((s) => portInfoOf(editor, s, cat));
}
