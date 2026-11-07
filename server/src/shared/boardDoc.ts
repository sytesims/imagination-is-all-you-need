/**
 * The board document, version 2 (2026-11-06, Canvas move to React Flow, phase 2): a small, library-neutral shape for a saved Canvas board.
 *
 *   { format: 'iiayn-board', version: 2, nodes: BoardDocNode[], links: BoardDocLink[] }
 *
 * Our ids (`shape:…`), node type strings and props are kept as they are, so the agent ops, the BoardNode summary and canvasBatch keep
 * working on either format. Pure functions, no React, no tldraw, no DOM (server, web and tests share this file):
 *  - fromTldraw(snapshot): a version-1 board (the tldraw document snapshot `{ store, schema }`) → BoardDoc. A link (one arrow and its two
 *    bindings) becomes one BoardDocLink; tldraw note/text → `ohf-sticky` (plain text), frame → `ohf-frame`, image/video → `ohf-upload`,
 *    bookmark → `ohf-link`; such nodes say what they were in `meta.from`. Pen strokes, geo shapes, arrows with a loose end and pictures
 *    with no file are dropped and counted in `dropped` (by tldraw type), so the page can say what couldn't be kept.
 *  - boardDocOf(saved): either format → BoardDoc (the one path every server reader goes through); isBoardDoc / boardDocError check v2.
 *  - docToFlow / flowToDoc: BoardDoc ⇄ the nodes and edges a node-graph renderer (React Flow) draws; plain objects, no library import.
 *  - absoluteBoxes: page boxes of every node.
 */

export const BOARD_FORMAT = 'iiayn-board';
export const STICKY_TYPE = 'ohf-sticky';
export const FRAME_TYPE = 'ohf-frame';
export const LINK_CARD_TYPE = 'ohf-link';
export const UPLOAD_NODE_TYPE = 'ohf-upload';

export interface BoardDocNode {
  id: string; type: string;
  /** top-left; relative to the parent frame when parentId is set (as in tldraw) */
  x: number; y: number; w: number; h: number;
  /** draw order among all nodes (0 = furthest back); a frame's children draw right after it */
  z: number;
  parentId?: string;
  props: Record<string, unknown>;
  /** name, by ('agent'), from (the tldraw type a converted node was: note, text, frame, image, video, bookmark) … */
  meta: Record<string, unknown>;
}
/** `from`'s output feeds `to`. `order`: draw order of the old arrow (tldraw fractional index; compare as plain strings). `snap`: the magnet made it. */
export interface BoardDocLink { id: string; from: string; to: string; order: string; snap?: true }
export interface BoardDoc {
  format: typeof BOARD_FORMAT; version: 2;
  nodes: BoardDocNode[]; links: BoardDocLink[];
  /** set by fromTldraw: what the conversion could not keep, by tldraw shape type (loose arrows count as 'arrow'). Not needed in a saved doc. */
  dropped?: Record<string, number>;
}

/** Plain text of a tldraw rich-text (Tiptap) document: paragraphs on their own lines. */
export function richTextPlain(rt: any): string {
  if (!rt || typeof rt !== 'object') return ''; if (typeof rt.text === 'string') return rt.text;
  return (Array.isArray(rt.content) ? rt.content.map(richTextPlain).join(rt.type === 'doc' ? '\n' : '') : '').trim();
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const isOhf = (t: unknown) => typeof t === 'string' && t.startsWith('ohf-');
const byStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0); /* tldraw indexes sort by code unit, not by locale */
/** tldraw's note is 200 × 200 page px at scale 1, taller by growY. */
const NOTE = 200;

/** The tldraw store inside a version-1 board (`{ store, schema }`, or `{ document: { store } }`), else null. */
export function tldrawStore(snapshot: unknown): Record<string, any> | null {
  const s = (snapshot as any)?.store ?? (snapshot as any)?.document?.store;
  return s && typeof s === 'object' && !Array.isArray(s) ? s : null;
}

/** A version-1 board → board document. Anything that isn't one gives an empty board. */
export function fromTldraw(snapshot: unknown): BoardDoc {
  const records = Object.values(tldrawStore(snapshot) ?? {}) as any[];
  const shapes = records.filter((r) => r?.typeName === 'shape' && typeof r.id === 'string');
  const assets = new Map(records.filter((r) => r?.typeName === 'asset').map((r) => [r.id, r]));
  const bindings = records.filter((r) => r?.typeName === 'binding' && r.type === 'arrow');
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const dropped: Record<string, number> = {}; const drop = (t: string) => { dropped[t] = (dropped[t] ?? 0) + 1; };

  /* 1. every shape that becomes a node (links come after: they need both ends kept) */
  const made = new Map<string, Pick<BoardDocNode, 'id' | 'type' | 'w' | 'h' | 'props' | 'meta'>>();
  for (const s of shapes) {
    const p = s.props ?? {}; const meta = { ...(s.meta ?? {}) }; const from = { ...meta, from: String(s.type) };
    if (isOhf(s.type)) { made.set(s.id, { id: s.id, type: s.type, w: num(p.w, 300), h: num(p.h, 230), props: { ...p }, meta }); continue; }
    switch (s.type) {
      case 'note': { const sc = num(p.scale, 1);
        made.set(s.id, { id: s.id, type: STICKY_TYPE, w: NOTE * sc, h: (NOTE + num(p.growY)) * sc, meta: from,
          props: { text: richTextPlain(p.richText), color: String(p.color ?? 'yellow'), size: String(p.size ?? 'm'), scale: sc } }); break; }
      case 'text': { const sc = num(p.scale, 1);
        made.set(s.id, { id: s.id, type: STICKY_TYPE, w: num(p.w, 200) * sc, h: 60 * sc, meta: from,
          props: { text: richTextPlain(p.richText), color: String(p.color ?? 'black'), size: String(p.size ?? 'm'), scale: sc } }); break; }
      case 'frame':
        made.set(s.id, { id: s.id, type: FRAME_TYPE, w: num(p.w, 720), h: num(p.h, 520), meta: from, props: { name: String(p.name ?? ''), color: String(p.color ?? 'black') } }); break;
      case 'image': case 'video': {
        const a: any = assets.get(p.assetId); const src = typeof a?.props?.src === 'string' ? a.props.src : '';
        if (!src) { drop(s.type); break; } /* no file behind it: nothing to show (the old summary skipped it too) */
        const w = num(p.w, 320), h = num(p.h, 300);
        made.set(s.id, { id: s.id, type: UPLOAD_NODE_TYPE, w, h, meta: from,
          props: { w, h, text: '', url: src, poster: s.type === 'image' ? src : '', mediaKind: s.type, label: String(a?.props?.name ?? ''), title: 'Upload' } }); break; }
      case 'bookmark': { const a: any = assets.get(p.assetId);
        made.set(s.id, { id: s.id, type: LINK_CARD_TYPE, w: num(p.w, 300), h: num(p.h, 320), meta: from,
          props: { url: String(p.url || a?.props?.src || ''), title: String(a?.props?.title ?? ''), description: String(a?.props?.description ?? ''), image: String(a?.props?.image ?? ''), favicon: String(a?.props?.favicon ?? '') } }); break; }
      case 'arrow': break; /* links: below */
      default: drop(String(s.type));
    }
  }

  /* 2. parents: a node keeps its frame (relative x, y); under a parent that was dropped it moves to the page (absolute x, y) */
  const absOf = (s: any, seen = 0): { x: number; y: number } => { const par = seen < 64 ? byId.get(s.parentId) : undefined; const pp = par ? absOf(par, seen + 1) : { x: 0, y: 0 }; return { x: pp.x + num(s.x), y: pp.y + num(s.y) }; };
  const keptParent = (s: any): string | undefined => (typeof s?.parentId === 'string' && s.parentId !== s.id && made.has(s.parentId) ? s.parentId : undefined);

  /* 3. draw order: tldraw's index is per parent and a child draws right after (in front of) its parent. A node moved to the page draws
   *    where its dropped parent drew: its sort key is the chain of indexes up to the kept ancestor. */
  const key = (s: any, pid: string | undefined, seen = 0): string => { const par = byId.get(s?.parentId);
    return par && par.id !== pid && !made.has(par.id) && seen < 64 ? `${key(par, pid, seen + 1)}\u0000${s.index ?? ''}` : String(s?.index ?? ''); };
  const kids = new Map<string | undefined, { id: string; k: string }[]>();
  for (const id of made.keys()) { const s = byId.get(id); const pid = keptParent(s); const list = kids.get(pid) ?? []; list.push({ id, k: key(s, pid) }); kids.set(pid, list); }
  const order: string[] = []; const placed = new Set<string>();
  const walk = (pid: string | undefined) => { for (const { id } of (kids.get(pid) ?? []).sort((a, b) => byStr(a.k, b.k) || byStr(a.id, b.id))) { if (placed.has(id)) continue; placed.add(id); order.push(id); walk(id); } };
  walk(undefined);
  /* a frame cycle (never made by tldraw) would leave nodes unplaced: put them on the page */
  for (const id of made.keys()) if (!placed.has(id)) { placed.add(id); order.push(id); }

  const nodes: BoardDocNode[] = order.map((id, z) => {
    const s = byId.get(id); const m = made.get(id)!; let pid = keptParent(s); if (pid && order.indexOf(pid) > z) pid = undefined;
    const pos = pid ? { x: num(s.x), y: num(s.y) } : absOf(s);
    return { id, type: m.type, x: pos.x, y: pos.y, w: m.w, h: m.h, z, ...(pid ? { parentId: pid } : {}), props: m.props, meta: m.meta };
  });

  /* 4. links: an arrow bound at both ends to kept nodes */
  const links: BoardDocLink[] = [];
  for (const s of shapes) {
    if (s.type !== 'arrow') continue;
    const bs = bindings.filter((b) => b.fromId === s.id);
    const from = bs.find((b) => b.props?.terminal === 'start')?.toId, to = bs.find((b) => b.props?.terminal === 'end')?.toId;
    if (!from || !to || from === to || !made.has(from) || !made.has(to)) { drop('arrow'); continue; }
    links.push({ id: s.id, from, to, order: String(s.index ?? ''), ...(s.meta?.snap === true ? { snap: true as const } : {}) });
  }
  links.sort((a, b) => byStr(a.order, b.order) || byStr(a.id, b.id));
  return { format: BOARD_FORMAT, version: 2, nodes, links, dropped };
}

/** Why this isn't a valid version-2 board document, or null when it is. */
export function boardDocError(v: unknown): string | null {
  const d = v as any;
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.format !== BOARD_FORMAT || d.version !== 2) return `not a board document (format "${BOARD_FORMAT}", version 2)`;
  if (!Array.isArray(d.nodes) || !Array.isArray(d.links)) return 'a board document needs nodes and links lists';
  const ids = new Set<string>(); const fin = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  for (const [i, n] of d.nodes.entries()) {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !n.id.startsWith('shape:')) return `nodes[${i}] needs an id starting with "shape:"`;
    if (ids.has(n.id)) return `nodes[${i}]: the id ${n.id.slice(0, 80)} is used twice`; ids.add(n.id);
    if (typeof n.type !== 'string' || !n.type) return `nodes[${i}] needs a type`;
    if (![n.x, n.y, n.w, n.h, n.z].every(fin)) return `nodes[${i}] needs numbers x, y, w, h and z`;
    if (!n.props || typeof n.props !== 'object' || Array.isArray(n.props)) return `nodes[${i}] needs props`;
    if (n.meta != null && (typeof n.meta !== 'object' || Array.isArray(n.meta))) return `nodes[${i}]: meta must be an object`;
    if (n.parentId != null && typeof n.parentId !== 'string') return `nodes[${i}]: parentId must be a node id`;
  }
  for (const [i, n] of d.nodes.entries()) if (n.parentId != null && (!ids.has(n.parentId) || n.parentId === n.id)) return `nodes[${i}]: its parent ${String(n.parentId).slice(0, 80)} is not on the board`;
  for (const [i, l] of d.links.entries()) {
    if (!l || typeof l !== 'object' || typeof l.id !== 'string' || !l.id.startsWith('shape:')) return `links[${i}] needs an id starting with "shape:"`;
    if (ids.has(l.id)) return `links[${i}]: the id ${l.id.slice(0, 80)} is used twice`; ids.add(l.id);
    if (typeof l.from !== 'string' || typeof l.to !== 'string') return `links[${i}] needs from and to node ids`;
    if (l.order != null && typeof l.order !== 'string') return `links[${i}]: order must be a string`;
  }
  return null;
}
export const isBoardDoc = (v: unknown): v is BoardDoc => boardDocError(v) === null;
/** Looks like a version-2 board (format and version set), valid or not. */
export const isV2 = (v: unknown): boolean => (v as any)?.format === BOARD_FORMAT && (v as any)?.version === 2;

/** Any saved board (version 1 tldraw snapshot or version 2 document) as a board document; null / unknown → empty board. */
export function boardDocOf(saved: unknown): BoardDoc {
  if (isV2(saved)) { const d = saved as BoardDoc; return { format: BOARD_FORMAT, version: 2, nodes: Array.isArray(d.nodes) ? d.nodes : [], links: Array.isArray(d.links) ? d.links : [] }; }
  return fromTldraw(saved);
}

/** Items on a saved board: nodes + links, plus (on a version-1 board) what the move would drop, so the count stays the tldraw shape count. */
export function boardItemCount(saved: unknown): number {
  const d = boardDocOf(saved);
  return d.nodes.length + d.links.length + Object.values(d.dropped ?? {}).reduce((a, b) => a + b, 0);
}

/** Page (absolute) boxes of every node, for link routing and fitting the view. */
export function absoluteBoxes(doc: BoardDoc): { id: string; type: string; x: number; y: number; w: number; h: number; parentId?: string }[] {
  const by = new Map(doc.nodes.map((n) => [n.id, n]));
  const abs = (n: BoardDocNode, seen = 0): { x: number; y: number } => { const p = n.parentId && seen < 64 ? by.get(n.parentId) : undefined; const pp = p ? abs(p, seen + 1) : { x: 0, y: 0 }; return { x: pp.x + n.x, y: pp.y + n.y }; };
  return doc.nodes.map((n) => ({ id: n.id, type: n.type, ...abs(n), w: n.w, h: n.h, ...(n.parentId ? { parentId: n.parentId } : {}) }));
}

/** What a node-graph renderer needs (structurally a React Flow Node / Edge; no import of the library here). */
export interface FlowNode {
  id: string; type: string; position: { x: number; y: number }; width: number; height: number;
  parentId?: string; zIndex: number; data: { type: string; props: Record<string, unknown>; meta: Record<string, unknown> };
}
export interface FlowEdge { id: string; source: string; target: string; type: 'link'; data: { snap: boolean; order: string } }

/** Frames and group boxes sit behind the cards: their zIndex is shifted down by this much. */
const BACK = 1_000_000;
const isBack = (type: string) => type === FRAME_TYPE || type === 'ohf-group';

/** Board document → renderer nodes and edges. Parents come before their children (React Flow requires it); frames draw behind. */
export function docToFlow(doc: BoardDoc): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes = [...doc.nodes].sort((a, b) => a.z - b.z).map((n): FlowNode => ({
    id: n.id, type: n.type, position: { x: n.x, y: n.y }, width: n.w, height: n.h,
    zIndex: isBack(n.type) ? n.z - BACK : n.z,
    ...(n.parentId ? { parentId: n.parentId } : {}), data: { type: n.type, props: n.props, meta: n.meta ?? {} },
  }));
  const edges = doc.links.map((l): FlowEdge => ({ id: l.id, source: l.from, target: l.to, type: 'link', data: { snap: !!l.snap, order: l.order } }));
  return { nodes, edges };
}

/** Renderer nodes and edges → board document (the inverse of docToFlow). A node's size is width/height, else what the renderer measured,
 *  else props.w/h; draw order comes from zIndex (ties keep the list order) and is renumbered 0…n-1, parents always before their children. */
export function flowToDoc(nodes: (FlowNode & { measured?: { width?: number; height?: number } })[], edges: FlowEdge[]): BoardDoc {
  const ranked = nodes.map((n, i) => ({ n, i, z: isBack(n.data?.type ?? n.type) ? n.zIndex + BACK : n.zIndex }))
    .sort((a, b) => a.z - b.z || a.i - b.i);
  const ids = new Set(nodes.map((n) => n.id)); const done = new Set<string>(); const out: BoardDocNode[] = [];
  const kidsOf = new Map<string | undefined, typeof ranked>();
  for (const r of ranked) { const pid = r.n.parentId && ids.has(r.n.parentId) ? r.n.parentId : undefined; const l = kidsOf.get(pid) ?? []; l.push(r); kidsOf.set(pid, l); }
  const walk = (pid: string | undefined) => { for (const { n } of kidsOf.get(pid) ?? []) { if (done.has(n.id)) continue; done.add(n.id);
    const props = n.data?.props ?? {};
    out.push({ id: n.id, type: n.data?.type ?? n.type, x: n.position.x, y: n.position.y,
      w: num(n.width, num(n.measured?.width, num(props.w, 0))), h: num(n.height, num(n.measured?.height, num(props.h, 0))), z: out.length,
      ...(n.parentId && ids.has(n.parentId) ? { parentId: n.parentId } : {}), props, meta: n.data?.meta ?? {} });
    walk(n.id); } };
  walk(undefined);
  for (const r of ranked) if (!done.has(r.n.id)) { done.add(r.n.id); const n = r.n; const props = n.data?.props ?? {};
    out.push({ id: n.id, type: n.data?.type ?? n.type, x: n.position.x, y: n.position.y, w: num(n.width, num(props.w, 0)), h: num(n.height, num(props.h, 0)), z: out.length, props, meta: n.data?.meta ?? {} }); }
  const links = edges.map((e): BoardDocLink => ({ id: e.id, from: e.source, to: e.target, order: String(e.data?.order ?? ''), ...(e.data?.snap ? { snap: true as const } : {}) }));
  return { format: BOARD_FORMAT, version: 2, nodes: out, links };
}

// ---------------------------------------------------------------- back to tldraw (while both engines run behind the switch)

/** tldraw's colour names (a note or frame with any other colour falls back). */
const TL_COLORS = new Set(['black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue', 'yellow', 'orange', 'green', 'light-green', 'light-red', 'red', 'white']);
const TL_SIZES = new Set(['s', 'm', 'l', 'xl']);
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** The i-th of an increasing run of valid fractional index keys (tldraw's `index`): a0…az (62), then b00…bzz (3844), then c000… */
export function indexKey(i: number): string {
  for (let len = 1, head = 'a'.charCodeAt(0), base = 0; len < 8; len++, head++) {
    const room = 62 ** len; if (i < base + room) { let n = i - base, s = ''; for (let k = 0; k < len; k++) { s = DIGITS[n % 62] + s; n = Math.floor(n / 62); } return String.fromCharCode(head) + s; }
    base += room;
  }
  throw new Error('too many shapes');
}
/** A plain text as tldraw rich text (one paragraph per line). */
export const richTextOf = (text: string) => ({ type: 'doc', content: String(text ?? '').split('\n').map((t) => (t ? { type: 'paragraph', content: [{ type: 'text', text: t }] } : { type: 'paragraph' })) });
const hashOf = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

/**
 * Board document → a tldraw document snapshot `{ store, schema }`, so a board saved by the React Flow engine still opens in today's
 * tldraw Canvas while both run behind the switch (the inverse of fromTldraw for everything it keeps):
 *  - our node types (`ohf-…`) keep their props; `ohf-sticky` → note (its text as rich text, growY from its height), `ohf-frame` → frame,
 *    `ohf-link` → bookmark plus its asset; frame children keep their frame (relative x, y);
 *  - each link → one hidden arrow from the right of `from` to the left of `to`, bound at both ends (as BoardApi.addLink draws it);
 *  - indexes are fresh valid keys in draw order (per parent); links draw in front, in their order.
 * `schema`: the running tldraw store's schema (store.schema.serialize()), so loading needs no migration. Pure: no tldraw import.
 */
export function docToTldraw(doc: BoardDoc, schema: unknown = {}): { store: Record<string, any>; schema: unknown } {
  const store: Record<string, any> = {
    'document:document': { gridSize: 10, name: '', meta: {}, id: 'document:document', typeName: 'document' },
    'page:page': { meta: {}, id: 'page:page', name: 'Page 1', index: 'a1', typeName: 'page' },
  };
  const ids = new Set(doc.nodes.map((n) => n.id));
  const kids = new Map<string, number>(); const nextIndex = (pid: string) => { const i = kids.get(pid) ?? 0; kids.set(pid, i + 1); return indexKey(i); };
  const boxes = new Map(absoluteBoxes(doc).map((b) => [b.id, b]));
  for (const n of [...doc.nodes].sort((a, b) => a.z - b.z)) {
    const pid = n.parentId && ids.has(n.parentId) && n.parentId !== n.id ? n.parentId : 'page:page';
    const { from: _from, ...meta } = (n.meta ?? {}) as Record<string, unknown>; const p = (n.props ?? {}) as Record<string, any>;
    const base = { x: n.x, y: n.y, rotation: 0, isLocked: false, opacity: 1, id: n.id, parentId: pid, index: nextIndex(pid), typeName: 'shape' };
    if (n.type === STICKY_TYPE) {
      const scale = num(p.scale, 1) > 0 ? num(p.scale, 1) : 1;
      store[n.id] = { ...base, meta, type: 'note', props: { color: TL_COLORS.has(p.color) ? p.color : 'yellow', richText: richTextOf(String(p.text ?? '')), size: TL_SIZES.has(p.size) ? p.size : 'm',
        font: 'sans', align: 'start', verticalAlign: 'start', labelColor: 'black', growY: Math.max(0, Math.round(n.h / scale - NOTE)), fontSizeAdjustment: 1, url: '', scale, textLastEditedBy: null } };
    } else if (n.type === FRAME_TYPE) {
      store[n.id] = { ...base, meta, type: 'frame', props: { w: n.w, h: n.h, name: String(p.name ?? ''), color: TL_COLORS.has(p.color) ? p.color : 'black' } };
    } else if (n.type === LINK_CARD_TYPE) {
      const url = String(p.url ?? ''); const assetId = `asset:${hashOf(url || n.id)}`;
      store[assetId] = { id: assetId, typeName: 'asset', type: 'bookmark', meta: {}, props: { src: url, title: String(p.title ?? ''), description: String(p.description ?? ''), image: String(p.image ?? ''), favicon: String(p.favicon ?? '') } };
      store[n.id] = { ...base, meta, type: 'bookmark', props: { w: n.w, h: n.h, assetId, url } };
    } else {
      store[n.id] = { ...base, meta: n.meta ?? {}, type: n.type, props: { ...p, ...('w' in p || isOhf(n.type) ? { w: n.w, h: n.h } : {}) } };
    }
  }
  const empty = { type: 'doc', content: [{ type: 'paragraph' }] };
  for (const l of [...doc.links].sort((a, b) => byStr(a.order ?? '', b.order ?? '') || byStr(a.id, b.id))) {
    const f = boxes.get(l.from), t = boxes.get(l.to); if (!f || !t || l.from === l.to) continue;
    const sx = f.x + f.w, sy = f.y + f.h / 2, ex = t.x, ey = t.y + t.h / 2; const span = Math.max(40, ex - sx);
    store[l.id] = { x: sx, y: sy, rotation: 0, isLocked: false, opacity: 1, meta: l.snap ? { snap: true } : {}, id: l.id, type: 'arrow', parentId: 'page:page', index: nextIndex('page:page'), typeName: 'shape',
      props: { kind: 'arc', elbowMidPoint: 0.5, dash: 'draw', size: 's', fill: 'none', color: 'grey', labelColor: 'black', bend: Math.min(48, span * 0.14), start: { x: 0, y: 0 }, end: { x: ex - sx, y: ey - sy },
        arrowheadStart: 'none', arrowheadEnd: 'arrow', richText: empty, labelPosition: 0.5, font: 'sans', scale: 1 } };
    const key = l.id.slice('shape:'.length);
    for (const terminal of ['start', 'end'] as const) {
      const id = `binding:${key}_${terminal === 'start' ? 's' : 'e'}`;
      store[id] = { meta: {}, id, type: 'arrow', fromId: l.id, toId: terminal === 'start' ? l.from : l.to, typeName: 'binding',
        props: { isPrecise: false, isExact: false, normalizedAnchor: { x: terminal === 'start' ? 1 : 0, y: 0.5 }, snap: 'none', terminal } };
    }
  }
  return { store, schema };
}
