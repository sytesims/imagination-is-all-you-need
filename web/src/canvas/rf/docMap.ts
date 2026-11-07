/**
 * The saved board document (version 2, server/src/shared/boardDoc.ts) ⇄ the React Flow board's store. Pure.
 *
 * The store keeps nodes in BoardApi's own words, so every caller of the board (the agent bridge, batchBuild, the summary…) works on either
 * engine unchanged: a sticky note is a 'note' with rich text, a frame is a 'frame', our cards keep their `ohf-…` type and props. Only
 * here does that become the saved document's `ohf-sticky` / `ohf-frame` with plain text, and back.
 */
import { BOARD_FORMAT, STICKY_TYPE, FRAME_TYPE, LINK_CARD_TYPE, richTextPlain, richTextOf, type BoardDoc, type BoardDocLink, type BoardDocNode } from '../../../../server/src/shared/boardDoc';

export const PAGE = 'page:page';
/** A node in the store (BoardApi's BoardNode). x, y are relative to the parent frame when it has one. */
export interface SNode { id: string; type: string; x: number; y: number; rotation: 0; parentId: string; index: string; props: Record<string, any>; meta: Record<string, any> }
/** A link in the store: `from` feeds `to`; `order` sorts links (plain string compare). */
export interface SLink { id: string; from: string; to: string; order: string; meta: Record<string, any> }

/** tldraw's note is 200 × 200 at scale 1, taller by growY. */
export const NOTE_SIZE = 200;
/** A node's size on the board (props.w / h; a note from its scale and growY). */
export function sizeOf(n: Pick<SNode, 'type' | 'props'>): { w: number; h: number } {
  const p = n.props ?? {};
  if (n.type === 'note') { const s = Number(p.scale) > 0 ? Number(p.scale) : 1; return { w: NOTE_SIZE * s, h: (NOTE_SIZE + Math.max(0, Number(p.growY) || 0)) * s }; }
  return { w: Number(p.w) > 0 ? Number(p.w) : 300, h: Number(p.h) > 0 ? Number(p.h) : 230 };
}

/** A new note's props, as tldraw makes them. */
export const noteProps = (o: Record<string, any> = {}) => ({ color: 'yellow', richText: richTextOf(''), size: 'm', font: 'sans', align: 'start', verticalAlign: 'start', labelColor: 'black', growY: 0, fontSizeAdjustment: 1, url: '', scale: 1, textLastEditedBy: null, ...o });

/** Saved document → store (nodes back to front, parents before their children, as the document keeps them). */
export function docToStore(doc: BoardDoc): { nodes: SNode[]; links: SLink[] } {
  const ids = new Set(doc.nodes.map((n) => n.id));
  const nodes = [...doc.nodes].sort((a, b) => a.z - b.z).map((n, i): SNode => {
    const parentId = n.parentId && ids.has(n.parentId) && n.parentId !== n.id ? n.parentId : PAGE; const p = n.props ?? {}; const meta = { ...(n.meta ?? {}) };
    const base = { id: n.id, x: n.x, y: n.y, rotation: 0 as const, parentId, index: orderKey(i), meta };
    if (n.type === STICKY_TYPE) { const scale = Number(p.scale) > 0 ? Number(p.scale) : 1;
      return { ...base, type: 'note', props: noteProps({ color: String(p.color ?? 'yellow'), size: String(p.size ?? 'm'), scale, richText: richTextOf(String(p.text ?? '')), growY: Math.max(0, Math.round(n.h / scale - NOTE_SIZE)) }) }; }
    if (n.type === FRAME_TYPE) return { ...base, type: 'frame', props: { w: n.w, h: n.h, name: String(p.name ?? ''), color: String(p.color ?? 'black') } };
    return { ...base, type: n.type, props: { ...p, w: n.w, h: n.h } };
  });
  const links = doc.links.filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to)
    .map((l): SLink => ({ id: l.id, from: l.from, to: l.to, order: String(l.order ?? ''), meta: l.snap ? { snap: true } : {} }));
  return { nodes, links };
}

/** Store → saved document. `order`: the nodes back to front. */
export function storeToDoc(order: readonly string[], nodes: Readonly<Record<string, SNode>>, links: readonly SLink[]): BoardDoc {
  const list = order.map((id) => nodes[id]).filter(Boolean);
  const out: BoardDocNode[] = list.map((n, z) => {
    const { w, h } = sizeOf(n); const parentId = n.parentId !== PAGE && nodes[n.parentId] ? n.parentId : undefined;
    const base = { id: n.id, x: n.x, y: n.y, w, h, z, ...(parentId ? { parentId } : {}), meta: { ...(n.meta ?? {}) } };
    if (n.type === 'note') return { ...base, type: STICKY_TYPE, props: { text: richTextPlain(n.props.richText), color: String(n.props.color ?? 'yellow'), size: String(n.props.size ?? 'm'), scale: Number(n.props.scale) || 1 } };
    if (n.type === 'frame') return { ...base, type: FRAME_TYPE, props: { name: String(n.props.name ?? ''), color: String(n.props.color ?? 'black') } };
    if (n.type === LINK_CARD_TYPE) { const { w: _w, h: _h, ...props } = n.props; return { ...base, type: n.type, props }; } /* its size is the node's */
    return { ...base, type: n.type, props: { ...n.props } };
  });
  const docLinks: BoardDocLink[] = links.filter((l) => nodes[l.from] && nodes[l.to]).map((l) => ({ id: l.id, from: l.from, to: l.to, order: l.order, ...(l.meta?.snap === true ? { snap: true as const } : {}) }));
  return { format: BOARD_FORMAT, version: 2, nodes: out, links: docLinks };
}

const DIG = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** A sortable key for position i (plain string compare keeps the order). */
export const orderKey = (i: number) => `a${i.toString(36).padStart(6, '0')}`;
/** A key that sorts after `max` ('' for none). */
export function keyAfter(max: string): string {
  if (!max) return 'a0';
  const last = max[max.length - 1]; const i = DIG.indexOf(last);
  return i >= 0 && i < DIG.length - 1 ? max.slice(0, -1) + DIG[i + 1] : `${max}1`;
}
