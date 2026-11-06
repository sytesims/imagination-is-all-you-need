/**
 * The board as a graph: what feeds a generate card (arrows bound into it, plus files added in the bar) and who came from whom (lineage).
 *  - An arrow whose END is bound to a generate card and whose START is bound to a result card, a picture / clip on the board or a finished
 *    generate card is an input of that card (the board's links).
 *  - Lineage: an arrow between two cards, and the parent ids a card stores (the inputs it ran from, the card a result was pulled out of).
 * No React; the card, the bar and the hover highlight read it inside the board's reactive useValue.
 */
import type { BoardApi, BoardNode, LinkId, NodeId } from './boardApi';

import { GEN_TYPE, RESULT_TYPE, UPLOAD_TYPE, PROMPT_TYPE, NOTE_TYPE, isNodeType } from './nodeTypes';
import type { BoardInput } from './cardModel';
export { GEN_TYPE, type BoardInput };
export const RESULT_T = RESULT_TYPE;

const isFiles = (u: unknown): u is string => typeof u === 'string' && /^\/(files|samples|examples)\//.test(u);
/** What a shape offers as an input (null: nothing usable, e.g. a sticky note or a 3D model). */
export function inputOfShape(board: BoardApi, s: BoardNode | null | undefined): Omit<BoardInput, 'key'> | null {
  if (!s) return null; const p: any = s.props;
  if (s.type === RESULT_T) { if (p.kind === '3d' || !p.url) return null; return { kind: p.kind, url: p.url, poster: p.poster || (p.kind === 'image' ? p.url : ''), jobId: p.jobId ?? '', shapeId: s.id, label: p.model || p.title || 'Result' }; }
  if (s.type === GEN_TYPE) { /* the ACTIVE version (the version strip's pick) flows on, also while a newer run is going */ const t = p.takes?.[Math.min(p.take ?? 0, (p.takes?.length ?? 1) - 1)]; if (!t || t.kind === '3d') return null; return { kind: t.kind, url: t.url, poster: t.poster || (t.kind === 'image' ? t.url : ''), jobId: t.jobId ?? p.jobId ?? '', shapeId: s.id, label: p.model || 'Result' }; }
  if (s.type === UPLOAD_TYPE) { const k = p.mediaKind; if ((k !== 'image' && k !== 'video' && k !== 'audio') || !isFiles(p.url)) return null; return { kind: k, url: p.url, poster: p.poster || (k === 'image' ? p.url : ''), jobId: '', shapeId: s.id, label: p.label || 'Upload' }; }
  if (s.type === 'image' || s.type === 'video') { const a: any = p.assetId ? board.asset(p.assetId) : null; const src = a?.props?.src; if (!isFiles(src)) return null;
    return { kind: s.type === 'image' ? 'image' : 'video', url: src, poster: s.type === 'image' ? src : `/api/media/thumb?url=${encodeURIComponent(src)}`, jobId: '', shapeId: s.id, label: s.type === 'image' ? 'Picture' : 'Clip' }; }
  return null;
}

/** Arrows bound into a card (end terminal), oldest first, with the shape bound at their start. */
/** These nodes and the nodes wired into them (one step back): what the camera frames when the agent adds, changes or prices cards, so a card's
 *  source clip stays in view next to it (2026-10-28: at the proposal step half the source card was off-screen). */
export function withInputs(board: BoardApi, ids: string[]): NodeId[] {
  const out = new Set<NodeId>(); for (const id of ids) { const s = board.getNode(id as NodeId); if (!s) continue; out.add(s.id); for (const a of arrowsInto(board, s.id)) if (a.fromId && board.getNode(a.fromId)) out.add(a.fromId); }
  return [...out];
}
export function arrowsInto(board: BoardApi, cardId: NodeId): { arrowId: LinkId; fromId: NodeId | null }[] {
  return board.linksInto(cardId).map(l => ({ arrowId: l.id, fromId: l.from }));
}

/** What a generate card upstream WILL pass on once it has run (a draft or running card with no result yet): an empty stand-in of its
 *  medium, so a proposal can see that the arrow fills the slot ("Waits for …") instead of calling the input missing. Null for 3D / unknown. */
function pendingInputOf(board: BoardApi, s: BoardNode | null | undefined): Omit<BoardInput, 'key'> | null {
  if (!s || s.type !== GEN_TYPE || inputOfShape(board, s)) return null; const p: any = s.props; const k = p.medium;
  if (k !== 'image' && k !== 'video' && k !== 'audio') return null;
  return { kind: k, url: '', poster: '', jobId: '', shapeId: s.id, label: p.model || 'Result' };
}
/** Every input of a generate card: arrow inputs (in the order they were drawn), then files added in the bar. `pending`: also count the
 *  cards upstream that haven't run yet (empty stand-ins), as they will be filled when a run in graph order reaches this card. */
export function cardInputs(board: BoardApi, card: BoardNode, o: { pending?: boolean } = {}): BoardInput[] {
  const out: BoardInput[] = []; const seen = new Set<string>();
  for (const a of arrowsInto(board, card.id)) { if (!a.fromId || a.fromId === card.id || seen.has(a.fromId)) continue; const from = board.getNode(a.fromId);
    const i = inputOfShape(board, from) ?? (o.pending ? pendingInputOf(board, from) : null); if (!i) continue; seen.add(a.fromId); out.push({ ...i, key: a.fromId, arrowId: a.arrowId }); }
  for (const m of ((card.props as any).inputs ?? []) as BoardInput[]) if (m?.url && !seen.has(m.key)) { seen.add(m.key); out.push(m); }
  return out;
}

/** Wire one node's output into another (the input / lineage link). Returns the link id. */
export function linkShapes(board: BoardApi, fromId: NodeId, toId: NodeId): LinkId | null { return board.addLink(fromId, toId); }

/** The text a Prompt (or Note) node feeds into a generate card through its arrows, in arrow order. */
export function promptSourcesInto(board: BoardApi, cardId: NodeId): { id: NodeId; type: string; text: string }[] {
  const out: { id: NodeId; type: string; text: string }[] = [];
  for (const a of arrowsInto(board, cardId)) {
    if (!a.fromId) continue; const s = board.getNode(a.fromId); if (!s || (s.type !== PROMPT_TYPE && s.type !== NOTE_TYPE)) continue;
    const text = String((s.props as any).text ?? '').trim(); if (text) out.push({ id: s.id, type: s.type, text });
  }
  return out;
}
/** The effective prompt of a generate card: its Prompt / Note inputs (joined), else the card's own text. */
export function promptInto(board: BoardApi, cardId: NodeId): string { return promptSourcesInto(board, cardId).map(s => s.text).join('\n\n'); }

/** Lineage edges: card → card arrows (both ends bound) and stored parent ids. */
function edges(board: BoardApi): [string, string][] {
  const out: [string, string][] = [];
  for (const l of board.links()) if (l.from && l.to && l.from !== l.to) out.push([l.from, l.to]);
  for (const s of board.nodes()) for (const p of ((s.props as any).parents ?? []) as string[]) if (p && p !== s.id) out.push([p, s.id]);
  return out;
}
/** For the hovered card: its ancestors and descendants (whole chains), or null when the hovered shape has no links. */
export function lineageOf(board: BoardApi, id: string): { anc: Set<string>; desc: Set<string> } | null {
  const e = edges(board); if (!e.some(([a, b]) => a === id || b === id)) return null;
  const walk = (start: string, dir: 0 | 1) => { const seen = new Set<string>(); const st = [start]; while (st.length) { const x = st.pop()!; for (const ed of e) if (ed[dir ? 0 : 1] === x && !seen.has(ed[dir])) { seen.add(ed[dir]); st.push(ed[dir]); } } seen.delete(start); return seen; };
  return { anc: walk(id, 0), desc: walk(id, 1) };
}
/** This shape's role while another card is hovered: 'self' | 'anc' | 'desc' | null (only cards light up). */
export function lineageRole(board: BoardApi, id: string): 'self' | 'anc' | 'desc' | null {
  const h = board.hovered(); if (!h) return null; const hs = board.getNode(h); if (!hs || !isNodeType(hs.type)) return null;
  const l = lineageOf(board, h); if (!l) return null; if (h === id) return 'self'; return l.anc.has(id) ? 'anc' : l.desc.has(id) ? 'desc' : null;
}

/** Arrows into a card whose source has nothing to pass on yet (a draft or running card upstream): the card shows "Waits for …". */
export function waitingInputsOf(board: BoardApi, cardId: NodeId): { id: NodeId; name: string; kind: string }[] {
  const out: { id: NodeId; name: string; kind: string }[] = [];
  for (const a of arrowsInto(board, cardId)) {
    if (!a.fromId) continue; const s = board.getNode(a.fromId); if (!s || s.type !== GEN_TYPE || inputOfShape(board, s)) continue;
    const n = (s.meta as any)?.name; out.push({ id: s.id, name: (typeof n === 'string' && n.trim()) || 'the card before', kind: String((s.props as any).medium ?? 'image') });
  }
  return out;
}
