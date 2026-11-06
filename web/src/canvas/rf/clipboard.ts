/**
 * Copy, cut, paste and duplicate on the React Flow board (Canvas release 1, our own code, not React Flow Pro). Pure over BoardApi, so the
 * server tests run it on a real board store with no browser.
 *
 *  - Copy takes the selected cards (a frame takes what sits in it) and the links between them, as app JSON: the same text goes on the
 *    system clipboard (so it pastes into another board, another tab, or back here) and stays in this tab's memory (for the context menu's
 *    Paste when the browser won't let a page read the clipboard).
 *  - Paste makes every node again with a new `shape:` id, rewires the links between the pasted ones, and keeps frames around their cards.
 *    It works across boards: nothing in the copy points at the board it came from.
 *  - A card that was running (or queued) when it was copied becomes a draft that keeps its takes: the copy never follows the original's job.
 */
import type { BoardApi, NodeId, Point } from '../boardApi';
import { GEN_TYPE } from '../nodeTypes';

export const CLIP_MARK = 'iiayn-canvas-clip';
export interface ClipNode { id: string; type: string; x: number; y: number; parent: string | null; props: Record<string, any>; meta: Record<string, any> }
export interface ClipLink { from: string; to: string; meta: Record<string, any> }
export interface Clip { [CLIP_MARK]: 1; nodes: ClipNode[]; links: ClipLink[] }

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null));
/** The ids and every node that sits inside them (frames), in draw order. */
function withChildren(board: BoardApi, ids: string[]): string[] {
  const want = new Set<string>(); const add = (id: string) => { if (want.has(id) || !board.getNode(id)) return; want.add(id); for (const k of board.childrenOf(id)) add(k); };
  ids.forEach(add); return board.nodes().map((n) => n.id).filter((id) => want.has(id));
}
/** What a copied node keeps. A running or queued card becomes a draft with its takes; job-only fields go. */
export function clipProps(type: string, props: Record<string, any>, meta: Record<string, any>): { props: Record<string, any>; meta: Record<string, any> } {
  const p = clone(props) ?? {}; const m = clone(meta) ?? {};
  if (type === GEN_TYPE && (p.status === 'running' || p.status === 'queued')) { p.status = 'draft'; p.jobId = ''; p.error = ''; delete m.batch; }
  delete m.outdatedWhy;
  return { props: p, meta: m };
}

/** The selection as a clip (null when nothing copyable is selected). Links only between copied nodes. */
export function copyClip(board: BoardApi, ids: string[] = board.selection()): Clip | null {
  const nodeIds = withChildren(board, ids.filter((id) => board.getNode(id))); if (!nodeIds.length) return null; const set = new Set(nodeIds);
  const nodes: ClipNode[] = nodeIds.map((id) => { const n = board.getNode(id)!; const b = board.boundsOf(id); const parent = board.parentOf(id);
    const { props, meta } = clipProps(n.type, n.props ?? {}, n.meta ?? {});
    return { id, type: n.type, x: b ? b.x : n.x, y: b ? b.y : n.y, parent: parent && set.has(parent) ? parent : null, props, meta }; });
  const links: ClipLink[] = board.links().filter((l) => l.from && l.to && set.has(l.from) && set.has(l.to)).map((l) => ({ from: l.from!, to: l.to!, meta: clone(l.meta) ?? {} }));
  return { [CLIP_MARK]: 1, nodes, links };
}
export const clipText = (c: Clip) => JSON.stringify(c);
/** Our clip from clipboard text (anything else: null). */
export function readClip(text: string | null | undefined): Clip | null {
  if (!text || text.length > 4_000_000 || !text.trimStart().startsWith('{')) return null;
  try { const v = JSON.parse(text); if (v?.[CLIP_MARK] !== 1 || !Array.isArray(v.nodes) || !Array.isArray(v.links)) return null;
    const nodes = (v.nodes as any[]).filter((n) => n && typeof n.id === 'string' && typeof n.type === 'string' && Number.isFinite(n.x) && Number.isFinite(n.y));
    return nodes.length ? { [CLIP_MARK]: 1, nodes: nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, parent: typeof n.parent === 'string' ? n.parent : null, props: n.props && typeof n.props === 'object' ? n.props : {}, meta: n.meta && typeof n.meta === 'object' ? n.meta : {} })),
      links: (v.links as any[]).filter((l) => l && typeof l.from === 'string' && typeof l.to === 'string').map((l) => ({ from: l.from, to: l.to, meta: l.meta && typeof l.meta === 'object' ? l.meta : {} })) } : null; }
  catch { return null; }
}

/** The clip's box (page px). */
export function clipBounds(c: Clip): { x: number; y: number; w: number; h: number } {
  const xs = c.nodes.map((n) => n.x), ys = c.nodes.map((n) => n.y), xe = c.nodes.map((n) => n.x + (Number(n.props?.w) || 300)), ye = c.nodes.map((n) => n.y + (Number(n.props?.h) || 230));
  const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xe) - x, h: Math.max(...ye) - y };
}

/** Paste a clip as one undo step. `at`: where its top-left goes (page px); else `offset` from where it was copied (a duplicate, a second
 *  paste). Returns the new ids (old id → new id) and selects the pasted nodes. */
export function pasteClip(board: BoardApi, c: Clip, o: { at?: Point; offset?: number; label?: string } = {}): Record<string, string> {
  const box = clipBounds(c); const dx = o.at ? o.at.x - box.x : o.offset ?? 40; const dy = o.at ? o.at.y - box.y : o.offset ?? 40;
  const map: Record<string, string> = {};
  board.mark(o.label ?? 'paste');
  board.batch(() => {
    for (const n of c.nodes) { const { props, meta } = clipProps(n.type, n.props, n.meta);
      map[n.id] = board.addNode({ type: n.type, x: Math.round(n.x + dx), y: Math.round(n.y + dy), props, meta }); }
    /* frames keep what sat in them (their children are made in page coordinates first, then moved in, keeping where they are) */
    for (const n of c.nodes) if (n.parent && map[n.parent]) board.setParent([map[n.id] as NodeId], map[n.parent] as NodeId);
    for (const l of c.links) if (map[l.from] && map[l.to]) board.addLink(map[l.from] as NodeId, map[l.to] as NodeId, { meta: l.meta });
  });
  board.select(Object.values(map)); return map;
}

/** This tab's last copy (survives switching boards; the system clipboard is the other way across tabs). */
let lastClip: Clip | null = null; let pasteCount = 0;
export const rememberClip = (c: Clip | null) => { lastClip = c; pasteCount = 0; };
export const memoryClip = () => lastClip;
/** Each Paste of the same copy in place lands a little further down and right, so pastes never stack exactly. */
export const nextPasteOffset = () => 40 * ++pasteCount;

/** Duplicate the selection beside itself (one undo step), without touching the clipboard. */
export function duplicateSelection(board: BoardApi): string[] {
  const c = copyClip(board); if (!c) return []; return Object.values(pasteClip(board, c, { offset: 40, label: 'duplicate' }));
}
