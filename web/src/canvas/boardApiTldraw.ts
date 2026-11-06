/**
 * BoardApi over tldraw (2026-11-06): today's engine behind the board seam (boardApi.ts). Nothing here changes what a person sees: every
 * method is the tldraw call the canvas made before. Links are tldraw arrows with both ends bound (their bindings are the data; the arrows
 * themselves are hidden and LinkLayer draws them). Also the few things only tldraw needs: hiding link arrows, removing a card's links
 * with it, and the reactive atom / useValue the views read the board with.
 */
import { useContext } from 'react';
import { atom, useValue, useQuickReactor, useMaybeEditor, useTools, useIsToolSelected, createShapeId, EASINGS, InstancePresenceRecordType,
  type Atom, type Editor, type TLArrowBinding, type TLEventInfo, type TLInstancePresence, type TLShapeId } from 'tldraw';
import { BoardContext, type AgentPresence, type BoardApi, type BoardInputEvent, type BoardLink, type BoardNode, type CameraMove, type Rect } from './boardApi';
import { isNodeType, GROUP_TYPE } from './nodeTypes';
import { linkArrowsWith } from './links';

export { atom, useValue, type Atom };
/** Run on every change of what it reads, without a React render (the background's parallax). */
export const useReactor = useQuickReactor;

const sid = (id: string) => id as TLShapeId;
const anim = (o?: CameraMove) => (o && o.duration != null ? { animation: { duration: o.duration, ...(o.easing === 'inOutCubic' ? { easing: EASINGS.easeInOutCubic } : {}) } } : undefined);
const asNode = (s: unknown) => (s ?? null) as BoardNode | null;

/** An arrow as a link: where its start and end are bound. */
function linkOf(editor: Editor, arrowId: TLShapeId, meta?: unknown): BoardLink {
  const bs = editor.getBindingsFromShape<TLArrowBinding>(arrowId, 'arrow');
  return { id: arrowId, from: bs.find((b) => b.props.terminal === 'start')?.toId ?? null, to: bs.find((b) => b.props.terminal === 'end')?.toId ?? null, meta: (meta ?? editor.getShape(arrowId)?.meta ?? {}) as Record<string, any> };
}

const PRESENCE_ID = InstancePresenceRecordType.createId('ohf-agent');
const AGENT_USER = 'user:ohf-agent';
/** Our presence words → tldraw's collaborator record fields. */
function presenceFields(p: Partial<AgentPresence>): Partial<TLInstancePresence> {
  const out: any = {};
  if (p.name !== undefined) out.userName = p.name;
  if (p.color !== undefined) out.color = p.color;
  if (p.cursor !== undefined && p.cursor) out.cursor = { x: p.cursor.x, y: p.cursor.y, type: 'default', rotation: 0 };
  if (p.label !== undefined) out.chatMessage = p.label;
  if (p.selected !== undefined) out.selectedShapeIds = p.selected;
  if (p.laser !== undefined) out.scribbles = p.laser ? [{ id: p.laser.id, points: p.laser.points, size: 6, color: 'laser', opacity: 0.8, state: 'active', delay: 0, shrink: 0, taper: false }] : [];
  return out;
}

function makeBoard(editor: Editor): BoardApi {
  const b: BoardApi = {
    get disposed() { return editor.isDisposed; },
    getNode: (id) => { const s = editor.getShape(sid(id)); return s && s.type !== 'arrow' ? asNode(s) : null; },
    has: (id) => !!editor.getShape(sid(id)),
    nodes: (o) => (o?.sorted ? editor.getCurrentPageShapesSorted() : editor.getCurrentPageShapes()).filter((s) => s.type !== 'arrow') as unknown as BoardNode[],
    isEmpty: () => editor.getCurrentPageShapeIds().size === 0,
    boundsOf: (id) => editor.getShapePageBounds(sid(id)) ?? null,
    contentBounds: () => (editor.getCurrentPageShapeIds().size ? editor.getCurrentPageBounds() ?? null : null),
    nodesAt: (p, o) => editor.getShapesAtPoint(p, { hitInside: true, margin: o?.margin ?? 0 }).filter((s) => s.type !== 'arrow') as unknown as BoardNode[],
    parentOf: (id) => { const p = editor.getShape(sid(id))?.parentId; return p && String(p).startsWith('shape:') ? p : null; },
    childrenOf: (id) => editor.getSortedChildIdsForParent(sid(id)),
    addNode: (n) => { const id = createShapeId(); editor.createShape({ id, type: n.type, x: n.x, y: n.y, ...(n.props ? { props: n.props } : {}), ...(n.meta ? { meta: n.meta } : {}) } as any); return id; },
    patchNode: (id, patch) => { const s = editor.getShape(sid(id)); if (s) editor.updateShape({ id: s.id, type: s.type, ...patch } as any); },
    patchNodes: (list) => { editor.updateShapes(list.flatMap((p) => { const s = editor.getShape(sid(p.id)); return s ? [{ ...p, id: s.id, type: s.type }] : []; }) as any); },
    removeNodes: (ids) => { if (ids.length) editor.deleteShapes(ids.map(sid)); },
    setParent: (ids, parentId) => { if (ids.length) editor.reparentShapes(ids.map(sid), parentId ? sid(parentId) : editor.getCurrentPageId()); },
    toBack: (ids) => { editor.sendToBack(ids.map(sid)); },
    asset: (id) => (editor.getAsset(id as any) as any) ?? null,

    getLink: (id) => { const s = editor.getShape(sid(id)); return s?.type === 'arrow' ? linkOf(editor, s.id, s.meta) : null; },
    links: () => editor.getCurrentPageShapes().filter((s) => s.type === 'arrow').map((s) => linkOf(editor, s.id, s.meta)),
    /** arrows bound into a node (end terminal), in the order they were drawn (arrow index) */
    linksInto: (id) => editor.getBindingsToShape<TLArrowBinding>(sid(id), 'arrow').filter((x) => x.props.terminal === 'end').map((x) => linkOf(editor, x.fromId))
      .sort((p, q) => { const sp = editor.getShape(sid(p.id)), sq = editor.getShape(sid(q.id)); return (sp?.index ?? '') < (sq?.index ?? '') ? -1 : 1; }),
    linksFrom: (id) => editor.getBindingsToShape<TLArrowBinding>(sid(id), 'arrow').filter((x) => x.props.terminal === 'start').map((x) => linkOf(editor, x.fromId)),
    /** One quiet look everywhere: thin, grey, a gentle arc, both ends bound (tldraw's selection / hover turns it orange). */
    addLink: (fromId, toId, o) => {
      const a = editor.getShapePageBounds(sid(fromId)), c = editor.getShapePageBounds(sid(toId)); if (!a || !c) return null;
      const id = createShapeId(); const sx = a.maxX, sy = a.midY, ex = c.minX, ey = c.midY; const span = Math.max(40, ex - sx);
      editor.createShape({ id, type: 'arrow', x: sx, y: sy, ...(o?.meta ? { meta: o.meta } : {}), props: { start: { x: 0, y: 0 }, end: { x: ex - sx, y: ey - sy }, kind: 'arc', bend: Math.min(48, span * 0.14), arrowheadStart: 'none', arrowheadEnd: 'arrow', color: 'grey', size: 's' } } as any);
      const bind = (terminal: 'start' | 'end', target: string) => ({ type: 'arrow' as const, fromId: id, toId: target, props: { terminal, normalizedAnchor: { x: terminal === 'start' ? 1 : 0, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } });
      editor.createBindings([bind('start', fromId), bind('end', toId)] as any);
      return id;
    },
    removeLinks: (ids) => { if (ids.length) editor.deleteShapes(ids.map(sid)); },

    selection: () => editor.getSelectedShapeIds(),
    select: (ids) => { if (ids.length) editor.select(...ids.map(sid)); else editor.selectNone(); },
    hovered: () => editor.getHoveredShapeId() ?? null,
    selectionBounds: () => editor.getSelectionPageBounds() ?? null,
    gesture: () => (editor.isIn('select.translating') ? 'drag' : editor.isIn('select.resizing') ? 'resize' : null),

    camera: () => editor.getCamera(),
    setCamera: (c, o) => { editor.setCamera(c, anim(o)); },
    zoom: () => editor.getZoomLevel(),
    fitBounds: (r, o) => { editor.zoomToBounds({ x: r.x, y: r.y, w: r.w, h: r.h } as any, { ...(o?.inset != null ? { inset: o.inset } : {}), ...(o?.zoom != null ? { targetZoom: o.zoom } : {}), ...anim(o) }); },
    centerOn: (p, o) => { editor.centerOnPoint(p, anim(o)); },
    zoomToSelection: (o) => { editor.zoomToSelection(anim(o)); },
    zoomToFit: (o) => { editor.zoomToFit(anim(o)); },
    zoomIn: (o) => { editor.zoomIn(undefined, anim(o)); },
    zoomOut: (o) => { editor.zoomOut(undefined, anim(o)); },
    resetZoom: (o) => { editor.resetZoom(undefined, anim(o)); },
    screenToBoard: (p) => editor.screenToPage(p),
    boardToViewport: (p) => editor.pageToViewport(p),
    viewportBounds: () => editor.getViewportPageBounds() as Rect,
    viewportScreenBounds: () => editor.getViewportScreenBounds() as Rect,
    container: () => editor.getContainer(),

    tool: () => editor.getCurrentToolId(),
    setTool: (id) => { editor.setCurrentTool(id); },

    mark: (label) => editor.markHistoryStoppingPoint(label),
    bailToMark: (m) => { editor.bailToMark(m); },
    batch: (fn, o) => { editor.run(fn, o?.history === 'ignore' ? { history: 'ignore' } : undefined); },
    undo: () => { editor.undo(); },
    redo: () => { editor.redo(); },

    onChange: (cb, scope) => editor.store.listen(cb, { scope: scope === 'board' ? 'document' : 'session' }),
    onInput: (cb) => {
      const f = (info: TLEventInfo) => { const name = (info as any).name as string | undefined;
        const kind: BoardInputEvent['kind'] = info.type === 'wheel' ? 'wheel' : info.type === 'pinch' ? 'pinch' : name === 'pointer_down' || name === 'pointer_move' || name === 'pointer_up' ? name : 'other';
        cb({ kind, panning: !!(editor.inputs as any).isPanning }); };
      editor.on('event', f); return () => { editor.off('event', f); };
    },

    /** a tldraw collaborator presence record written locally: no sync server, never saved with the board */
    presence: {
      has: () => !editor.isDisposed && !!editor.store.get(PRESENCE_ID),
      put: (p, create = true) => {
        if (editor.isDisposed) return; const cur = editor.store.get(PRESENCE_ID) as TLInstancePresence | undefined; if (!cur && !create) return;
        const next = InstancePresenceRecordType.create({ ...(cur ?? {}), id: PRESENCE_ID, userId: AGENT_USER as any, currentPageId: editor.getCurrentPageId(), ...presenceFields(p), lastActivityTimestamp: Date.now() } as any);
        editor.store.mergeRemoteChanges(() => editor.store.put([next]));
      },
      remove: () => { if (!editor.isDisposed && editor.store.get(PRESENCE_ID)) editor.store.mergeRemoteChanges(() => editor.store.remove([PRESENCE_ID])); },
    },
  };
  return b;
}

const boards = new WeakMap<Editor, BoardApi>();
/** The board over one tldraw editor (the same object every time, so it can key maps and effects). */
export function boardOf(editor: Editor): BoardApi { let b = boards.get(editor); if (!b) { b = makeBoard(editor); boards.set(editor, b); } return b; }

/** The board for a component: the one put in BoardContext (beside the board), else the editor around it (cards and the board's own UI). */
export function useBoardApi(): BoardApi {
  const fromCtx = useContext(BoardContext); const editor = useMaybeEditor();
  const b = fromCtx ?? (editor ? boardOf(editor) : null); if (!b) throw new Error('useBoardApi: no board here.'); return b;
}
/** One of the board's tools for a toolbar button (tldraw's own tool list, so its shortcuts and behaviour stay). */
export function useToolButton(id: string): { available: boolean; on: boolean; pick: () => void } {
  const tools = useTools(); const t = tools[id]; const on = useIsToolSelected(t);
  return { available: !!t, on, pick: () => { t?.onSelect('toolbar'); } };
}

/** tldraw's getShapeVisibility: an arrow that links two cards is data only (the layer draws the notch or thread), so it is hidden,
 *  not hit, not selected; a free arrow someone drew stays. */
export function linkArrowVisibility(shape: { type: string; id: string }, editor: Editor): 'hidden' | 'inherit' {
  if (shape.type !== 'arrow') return 'inherit'; const bs = editor.getBindingsFromShape<TLArrowBinding>(shape.id as TLShapeId, 'arrow'); if (bs.length < 2) return 'inherit';
  return bs.every((x) => { const t = editor.getShape(x.toId); return t && isNodeType(t.type) && t.type !== GROUP_TYPE; }) ? 'hidden' : 'inherit';
}

/** Deleting a card deletes its link arrows with it, in the same undo step (B8). It runs on the editor's "deleted-shapes" event, which
 *  fires just before the shapes go, while their bindings still say which arrows are links (a shape before-delete side-effect runs after
 *  tldraw has already unbound them). Returns the cleanup. */
export function registerLinkCleanup(editor: Editor): () => void {
  const onDelete = (ids: TLShapeId[]) => {
    const gone = new Set<TLShapeId>();
    for (const cardId of ids) { const s = editor.getShape(cardId); if (!s || !isNodeType(s.type)) continue;
      const arrowIds = [...new Set(editor.getBindingsToShape<TLArrowBinding>(s.id, 'arrow').map(x => x.fromId))];
      const arrows = arrowIds.map(id => { const bs = editor.getBindingsFromShape<TLArrowBinding>(id, 'arrow');
        return { id: id as string, from: bs.find(x => x.props.terminal === 'start')?.toId ?? null, to: bs.find(x => x.props.terminal === 'end')?.toId ?? null }; });
      for (const id of linkArrowsWith(s.id, arrows)) if (!ids.includes(id as TLShapeId) && editor.getShape(id as TLShapeId)) gone.add(id as TLShapeId); }
    if (gone.size) editor.deleteShapes([...gone]);
  };
  editor.on('deleted-shapes', onDelete); return () => { editor.off('deleted-shapes', onDelete); };
}
