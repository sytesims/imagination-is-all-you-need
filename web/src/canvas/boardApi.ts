/**
 * BoardApi: the one seam between the Canvas and the library that draws the board (2026-11-06). Every file in web/src/canvas reads and
 * changes the board through this, in our own words: nodes (cards, notes, frames…), links (an output wired into an input), the selection,
 * the camera, history and a few events. Only Board.tsx, the shape utils, theme.ts and the engine behind this (boardApiTldraw.ts today)
 * know which library draws it, so the board can move to another one by writing a new implementation, not by touching every caller.
 *
 * Ids stay the saved ones (`shape:…`), node types and props stay ours. Rules every implementation keeps:
 *  - links are not nodes: nodes() / getNode() never return a link; links() / getLink() do;
 *  - batch(fn, { history: 'ignore' }) is never undone: a finished job's result is written that way, so an Undo never removes it;
 *  - mark(label) starts one undo step; everything until the next mark undoes together.
 * The reactive pieces (atom, useValue, useReactor) and useBoardApi come from the engine too: a value read inside useValue re-renders the
 * component when the board (or an atom) changes.
 */
import { createContext } from 'react';
export { atom, useValue, useReactor, useBoardApi, useToolButton, type Atom } from './boardApiTldraw';

export type NodeId = string;
export type LinkId = string;
export interface Point { x: number; y: number }
/** A box on the board (page px). Read only. */
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number; readonly midX: number; readonly midY: number; readonly center: Point }

/** One node: a card, note, frame, picture… `parentId` is the frame it sits in, else the board (see parentOf). */
export interface BoardNode<P = any> { readonly id: NodeId; readonly type: string; readonly x: number; readonly y: number; readonly rotation: number; readonly parentId: string; readonly index: string; readonly props: P; readonly meta: Record<string, any> }
export interface NewNode { type: string; x: number; y: number; props?: Record<string, any>; meta?: Record<string, any> }
export interface NodePatch { x?: number; y?: number; props?: Record<string, any>; meta?: Record<string, any> }
/** A link: `from` feeds `to` (null when an end is loose, e.g. an arrow someone drew). */
export interface BoardLink { readonly id: LinkId; readonly from: NodeId | null; readonly to: NodeId | null; readonly meta: Record<string, any> }

/** The agent's cursor on the board (never saved): its name, colour, where it is, its label, what it outlines and its laser loop. */
export interface AgentPresence { name: string; color: string; cursor: Point | null; label: string; selected: NodeId[]; laser: { id: string; points: { x: number; y: number; z: number }[] } | null }
/** A pointer, wheel or pinch on the board; `panning`: the person is dragging the board itself. */
export interface BoardInputEvent { kind: 'wheel' | 'pinch' | 'pointer_down' | 'pointer_move' | 'pointer_up' | 'other'; panning: boolean }
export interface CameraMove { duration?: number; easing?: 'inOutCubic' }
export type HistoryMode = 'record' | 'ignore';

export interface BoardApi {
  /** the board closed (switched, unmounted): nothing should touch it any more */
  readonly disposed: boolean;

  // ---- nodes
  getNode<P = any>(id: NodeId): BoardNode<P> | null;
  /** a node or a link with this id is on the board */
  has(id: string): boolean;
  /** every node on the board (no links); `sorted`: back to front */
  nodes(o?: { sorted?: boolean }): BoardNode[];
  /** nothing at all on the board (no node, no link) */
  isEmpty(): boolean;
  boundsOf(id: string): Rect | null;
  /** everything on the board together; null when empty */
  contentBounds(): Rect | null;
  /** the nodes under a board point (inside them, or within `margin` of their edge), top first */
  nodesAt(p: Point, o?: { margin?: number }): BoardNode[];
  /** the frame a node sits in; null on the board itself */
  parentOf(id: NodeId): NodeId | null;
  /** a frame's nodes, back to front */
  childrenOf(id: NodeId): NodeId[];
  /** a new node; returns its id (`shape:…`) */
  addNode(n: NewNode): NodeId;
  patchNode(id: NodeId, patch: NodePatch): void;
  patchNodes(list: (NodePatch & { id: NodeId })[]): void;
  /** nodes go, and their links with them */
  removeNodes(ids: NodeId[]): void;
  /** move nodes into a frame (null: back onto the board), keeping where they are on screen */
  setParent(ids: NodeId[], parentId: NodeId | null): void;
  /** behind everything else */
  toBack(ids: NodeId[]): void;
  /** a picture / clip / link node's stored file (the engine's asset), or null */
  asset(id: string): { type: string; props: Record<string, any> } | null;

  // ---- links
  getLink(id: LinkId): BoardLink | null;
  links(): BoardLink[];
  /** links ending at a node, oldest first */
  linksInto(id: NodeId): BoardLink[];
  /** links starting at a node */
  linksFrom(id: NodeId): BoardLink[];
  /** wire `from`'s output into `to`; null when either end isn't on the board */
  addLink(from: NodeId, to: NodeId, o?: { meta?: Record<string, any> }): LinkId | null;
  removeLinks(ids: LinkId[]): void;

  // ---- selection and pointer
  /** selected ids (nodes, and a link someone drew) */
  selection(): string[];
  /** select exactly these ([] selects nothing) */
  select(ids: string[]): void;
  hovered(): string | null;
  selectionBounds(): Rect | null;
  /** what the person is doing with the selection right now */
  gesture(): 'drag' | 'resize' | null;

  // ---- camera
  camera(): { x: number; y: number; z: number };
  setCamera(c: { x: number; y: number; z: number }, o?: CameraMove): void;
  zoom(): number;
  fitBounds(r: { x: number; y: number; w: number; h: number }, o?: CameraMove & { inset?: number; zoom?: number }): void;
  centerOn(p: Point, o?: CameraMove): void;
  zoomToSelection(o?: CameraMove): void;
  zoomToFit(o?: CameraMove): void;
  zoomIn(o?: CameraMove): void;
  zoomOut(o?: CameraMove): void;
  resetZoom(o?: CameraMove): void;
  screenToBoard(p: Point): Point;
  boardToViewport(p: Point): Point;
  /** the part of the board on screen (page px) */
  viewportBounds(): Rect;
  /** the board's box on screen (screen px) */
  viewportScreenBounds(): Rect;
  /** the board's DOM element */
  container(): HTMLElement;

  // ---- tools
  tool(): string;
  setTool(id: string): void;

  // ---- history
  /** start a new undo step; returns its mark */
  mark(label: string): string;
  /** undo back to a mark and drop what came after (an all-or-nothing batch that failed) */
  bailToMark(mark: string): void;
  /** several changes as one; `history: 'ignore'` is never undone (job results) */
  batch(fn: () => void, o?: { history?: HistoryMode }): void;
  undo(): void;
  redo(): void;

  // ---- events (each returns its cleanup)
  /** `board`: nodes or links changed; `view`: camera, selection or hover changed */
  onChange(cb: () => void, scope: 'board' | 'view'): () => void;
  onInput(cb: (e: BoardInputEvent) => void): () => void;

  /** the agent's cursor (only the hand, agentHand.ts, writes it) */
  presence: { has(): boolean; put(p: Partial<AgentPresence>, create?: boolean): void; remove(): void };
}

/** The board for components outside the engine's own tree (the card panel beside it). Inside it, useBoardApi finds it on its own. */
export const BoardContext = createContext<BoardApi | null>(null);
export const BoardProvider = BoardContext.Provider;

// ---------------------------------------------------------------- plain helpers (no engine)
export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h, minX: x, minY: y, maxX: x + w, maxY: y + h, midX: x + w / 2, midY: y + h / 2, center: { x: x + w / 2, y: y + h / 2 } };
}
/** One box around them all; null for none. */
export function unionRects(rs: readonly Rect[]): Rect | null {
  if (!rs.length) return null; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rs) { minX = Math.min(minX, r.minX); minY = Math.min(minY, r.minY); maxX = Math.max(maxX, r.maxX); maxY = Math.max(maxY, r.maxY); }
  return rect(minX, minY, maxX - minX, maxY - minY);
}
/** `inner` lies strictly inside `outer` (touching an edge doesn't count). */
export const rectContains = (outer: Rect, inner: Rect) => outer.minX < inner.minX && outer.minY < inner.minY && outer.maxY > inner.maxY && outer.maxX > inner.maxX;
export const rectHasPoint = (r: Rect, p: Point) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
/** A note's text as rich text (one paragraph per line; an empty line stays an empty paragraph). */
export function richText(text: string) {
  return { type: 'doc', content: text.split('\n').map((t) => (t ? { type: 'paragraph', content: [{ type: 'text', text: t }] } : { type: 'paragraph' })) };
}
