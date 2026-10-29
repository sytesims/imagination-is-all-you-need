/**
 * The board as a graph: what feeds a generate card (arrows bound into it, plus files added in the bar) and who came from whom (lineage).
 *  - An arrow whose END is bound to a generate card and whose START is bound to a result card, a picture / clip on the board or a finished
 *    generate card is an input of that card (tldraw arrow bindings).
 *  - Lineage: an arrow between two cards, and the parent ids a card stores (the inputs it ran from, the card a result was pulled out of).
 * No React; the card, the bar and the hover highlight read it inside tldraw's reactive useValue.
 */
import { createShapeId, type Editor, type TLShape, type TLShapeId, type TLArrowBinding } from 'tldraw';

import { GEN_TYPE, RESULT_TYPE, UPLOAD_TYPE, PROMPT_TYPE, NOTE_TYPE, isNodeType } from './nodeTypes';
import type { BoardInput } from './cardModel';
export { GEN_TYPE, type BoardInput };
export const RESULT_T = RESULT_TYPE;

const isFiles = (u: unknown): u is string => typeof u === 'string' && /^\/(files|samples|examples)\//.test(u);
/** What a shape offers as an input (null: nothing usable, e.g. a sticky note or a 3D model). */
export function inputOfShape(editor: Editor, s: TLShape | undefined): Omit<BoardInput, 'key'> | null {
  if (!s) return null; const p: any = s.props;
  if (s.type === RESULT_T) { if (p.kind === '3d' || !p.url) return null; return { kind: p.kind, url: p.url, poster: p.poster || (p.kind === 'image' ? p.url : ''), jobId: p.jobId ?? '', shapeId: s.id, label: p.model || p.title || 'Result' }; }
  if (s.type === GEN_TYPE) { /* the ACTIVE version (the version strip's pick) flows on, also while a newer run is going */ const t = p.takes?.[Math.min(p.take ?? 0, (p.takes?.length ?? 1) - 1)]; if (!t || t.kind === '3d') return null; return { kind: t.kind, url: t.url, poster: t.poster || (t.kind === 'image' ? t.url : ''), jobId: t.jobId ?? p.jobId ?? '', shapeId: s.id, label: p.model || 'Result' }; }
  if (s.type === UPLOAD_TYPE) { const k = p.mediaKind; if ((k !== 'image' && k !== 'video' && k !== 'audio') || !isFiles(p.url)) return null; return { kind: k, url: p.url, poster: p.poster || (k === 'image' ? p.url : ''), jobId: '', shapeId: s.id, label: p.label || 'Upload' }; }
  if (s.type === 'image' || s.type === 'video') { const a: any = p.assetId ? editor.getAsset(p.assetId) : null; const src = a?.props?.src; if (!isFiles(src)) return null;
    return { kind: s.type === 'image' ? 'image' : 'video', url: src, poster: s.type === 'image' ? src : `/api/media/thumb?url=${encodeURIComponent(src)}`, jobId: '', shapeId: s.id, label: s.type === 'image' ? 'Picture' : 'Clip' }; }
  return null;
}

/** Arrows bound into a card (end terminal), oldest first, with the shape bound at their start. */
/** These nodes and the nodes wired into them (one step back): what the camera frames when the agent adds, changes or prices cards, so a card's
 *  source clip stays in view next to it (2026-10-28: at the proposal step half the source card was off-screen). */
export function withInputs(editor: Editor, ids: string[]): TLShapeId[] {
  const out = new Set<TLShapeId>(); for (const id of ids) { const s = editor.getShape(id as TLShapeId); if (!s) continue; out.add(s.id); for (const a of arrowsInto(editor, s.id)) if (a.fromId && editor.getShape(a.fromId)) out.add(a.fromId); }
  return [...out];
}
export function arrowsInto(editor: Editor, cardId: TLShapeId): { arrowId: TLShapeId; fromId: TLShapeId | null }[] {
  const ends = editor.getBindingsToShape<TLArrowBinding>(cardId, 'arrow').filter(b => b.props.terminal === 'end');
  return ends.map(b => { const start = editor.getBindingsFromShape<TLArrowBinding>(b.fromId, 'arrow').find(x => x.props.terminal === 'start'); return { arrowId: b.fromId, fromId: start?.toId ?? null }; })
    .sort((a, b) => { const sa = editor.getShape(a.arrowId), sb = editor.getShape(b.arrowId); return (sa?.index ?? '') < (sb?.index ?? '') ? -1 : 1; });
}

/** Every input of a generate card: arrow inputs (in the order they were drawn), then files added in the bar. */
export function cardInputs(editor: Editor, card: TLShape): BoardInput[] {
  const out: BoardInput[] = []; const seen = new Set<string>();
  for (const a of arrowsInto(editor, card.id)) { if (!a.fromId || a.fromId === card.id || seen.has(a.fromId)) continue; const i = inputOfShape(editor, editor.getShape(a.fromId)); if (!i) continue; seen.add(a.fromId); out.push({ ...i, key: a.fromId, arrowId: a.arrowId }); }
  for (const m of ((card.props as any).inputs ?? []) as BoardInput[]) if (m?.url && !seen.has(m.key)) { seen.add(m.key); out.push(m); }
  return out;
}

/** Draw an arrow from one shape to another and bind both ends (the input / lineage link). Returns the arrow id.
 *  One quiet look everywhere: thin, grey, a gentle arc; tldraw's selection / hover turns it orange. */
export function linkShapes(editor: Editor, fromId: TLShapeId, toId: TLShapeId): TLShapeId | null {
  const a = editor.getShapePageBounds(fromId), b = editor.getShapePageBounds(toId); if (!a || !b) return null;
  const id = createShapeId(); const sx = a.maxX, sy = a.midY, ex = b.minX, ey = b.midY; const span = Math.max(40, ex - sx);
  editor.createShape({ id, type: 'arrow', x: sx, y: sy, props: { start: { x: 0, y: 0 }, end: { x: ex - sx, y: ey - sy }, kind: 'arc', bend: Math.min(48, span * 0.14), arrowheadStart: 'none', arrowheadEnd: 'arrow', color: 'grey', size: 's' } as any });
  const bind = (terminal: 'start' | 'end', target: TLShapeId) => ({ type: 'arrow' as const, fromId: id, toId: target, props: { terminal, normalizedAnchor: { x: terminal === 'start' ? 1 : 0, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } });
  editor.createBindings([bind('start', fromId), bind('end', toId)] as any);
  return id;
}

/** The text a Prompt (or Note) node feeds into a generate card through its arrows, in arrow order. */
export function promptSourcesInto(editor: Editor, cardId: TLShapeId): { id: TLShapeId; type: string; text: string }[] {
  const out: { id: TLShapeId; type: string; text: string }[] = [];
  for (const a of arrowsInto(editor, cardId)) {
    if (!a.fromId) continue; const s = editor.getShape(a.fromId); if (!s || (s.type !== PROMPT_TYPE && s.type !== NOTE_TYPE)) continue;
    const text = String((s.props as any).text ?? '').trim(); if (text) out.push({ id: s.id, type: s.type, text });
  }
  return out;
}
/** The effective prompt of a generate card: its Prompt / Note inputs (joined), else the card's own text. */
export function promptInto(editor: Editor, cardId: TLShapeId): string { return promptSourcesInto(editor, cardId).map(s => s.text).join('\n\n'); }

/** Lineage edges: card → card arrows (both ends bound) and stored parent ids. */
function edges(editor: Editor): [string, string][] {
  const out: [string, string][] = [];
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type === 'arrow') { const bs = editor.getBindingsFromShape<TLArrowBinding>(s.id, 'arrow'); const st = bs.find(b => b.props.terminal === 'start'), en = bs.find(b => b.props.terminal === 'end'); if (st && en && st.toId !== en.toId) out.push([st.toId, en.toId]); continue; }
    for (const p of ((s.props as any).parents ?? []) as string[]) if (p && p !== s.id) out.push([p, s.id]);
  }
  return out;
}
/** For the hovered card: its ancestors and descendants (whole chains), or null when the hovered shape has no links. */
export function lineageOf(editor: Editor, id: string): { anc: Set<string>; desc: Set<string> } | null {
  const e = edges(editor); if (!e.some(([a, b]) => a === id || b === id)) return null;
  const walk = (start: string, dir: 0 | 1) => { const seen = new Set<string>(); const st = [start]; while (st.length) { const x = st.pop()!; for (const ed of e) if (ed[dir ? 0 : 1] === x && !seen.has(ed[dir])) { seen.add(ed[dir]); st.push(ed[dir]); } } seen.delete(start); return seen; };
  return { anc: walk(id, 0), desc: walk(id, 1) };
}
/** This shape's role while another card is hovered: 'self' | 'anc' | 'desc' | null (only cards light up). */
export function lineageRole(editor: Editor, id: string): 'self' | 'anc' | 'desc' | null {
  const h = editor.getHoveredShapeId(); if (!h) return null; const hs = editor.getShape(h); if (!hs || !isNodeType(hs.type)) return null;
  const l = lineageOf(editor, h); if (!l) return null; if (h === id) return 'self'; return l.anc.has(id) ? 'anc' : l.desc.has(id) ? 'desc' : null;
}

/** Arrows into a card whose source has nothing to pass on yet (a draft or running card upstream): the card shows "Waits for …". */
export function waitingInputsOf(editor: Editor, cardId: TLShapeId): { id: TLShapeId; name: string; kind: string }[] {
  const out: { id: TLShapeId; name: string; kind: string }[] = [];
  for (const a of arrowsInto(editor, cardId)) {
    if (!a.fromId) continue; const s = editor.getShape(a.fromId); if (!s || s.type !== GEN_TYPE || inputOfShape(editor, s)) continue;
    const n = (s.meta as any)?.name; out.push({ id: s.id, name: (typeof n === 'string' && n.trim()) || 'the card before', kind: String((s.props as any).medium ?? 'image') });
  }
  return out;
}
