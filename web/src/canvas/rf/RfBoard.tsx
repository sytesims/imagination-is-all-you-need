/**
 * One board drawn by React Flow (2026-11-06, Canvas move phase 3; behind the switch in rf/engine.ts, tldraw stays the default).
 *
 * The board's state is our store (store.ts) and the board is reached through BoardApi (boardApiRf.ts), so the card views, ports, runs, the
 * agent bridge and the panels work as on tldraw. React Flow only draws it: our card views in custom nodes, our link edge, frames as parent
 * nodes, sticky notes, our background and toolbar, zoom 5 %–400 %, its small attribution visible (free tier).
 *
 * Like Board.tsx: opens the saved board (version 1 through the converter, version 2 as is), autosaves the board document v2 (debounced, on
 * tab hide, on leave and on page close; a stale rev stops saving and says so), keeps the camera per board in this browser (the same
 * {x, y, z} key as today, so both engines open at the same place), follows running cards again, and opens 3D results.
 * Keys here: G new card, Enter runs the selected card, Delete / Backspace removes the selection (its links go too), ⌘Z / ⇧⌘Z undo / redo,
 * V / H select / hand, Esc clears the selection. Copy / paste, the context menu, file drops and the magnet come in the next phase.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ReactFlow, ReactFlowProvider, MiniMap, SelectionMode, type Edge, type EdgeChange, type Node, type NodeChange, type ReactFlowInstance, type Viewport } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { useStore } from 'zustand';
import { useToast } from '../../shared/Toast';
import { getJob, cancelJob } from '../../api';
import { askConfirm } from '../../shared/Dialog';
import { wheelZoomFactor, zoomAround } from './zoom';
import { posterOf3d } from '../../shared/model3d';
import { OPEN_3D_EVENT, open3d, runCard } from '../canvasEvents';
import { BoardProvider, ToolHookContext, ViewTuneContext, useValue, type BoardApi, type ToolButtonState } from '../boardApi';
import { LeftToolbar, EmptyHint } from '../CanvasUi';
import { AssetsDrawer } from '../AssetsDrawer';
import { FollowAgent } from '../FollowAgent';
import { NextStepMenu } from '../NextStepMenu';
import { CameraMotion } from '../CameraMotion';
import { BoardBackground } from '../BoardBackground';
import { bindHand } from '../agentHand';
import { lastFlowNow, setBoardCtx, exposeForDev, createCard } from '../agentApi';
import { reattachRunning, watchJob, batchIdsOf, liveJobs } from '../genRun';
import { GEN_TYPE, RESULT_TYPE } from '../nodeTypes';
import { CARD_H } from '../cardModel';
import { OVERVIEW_ZOOM } from '../cardLook';
import { saveBoard, saveBoardOnExit, BoardError, type Board as SavedBoard } from '../boardsApi';
import type { SaveState } from '../Board';
import { boardDocOf } from '../../../../server/src/shared/boardDoc';
import { docToStore, storeToDoc, sizeOf, noteProps, PAGE, type SNode } from './docMap';
import { BoardStore, type BoardState } from './store';
import { makeRfBoard, clampSize, MIN_ZOOM, MAX_ZOOM, type RfPort } from './boardApiRf';
import { NODE_TYPES, EDGE_TYPES, NO_DRAG, RouteCtx, StoreCtx, OptCtx, AgentPresence, useRoutes, rfTypeOf, isBack, adHeight } from './views';
import { rfOptions } from './engine';
import { drawSize, ratioAtom } from './poster';
import './rf.css';

const Viewer3D = lazy(() => import('../../shared/Viewer3D').then((m) => ({ default: m.Viewer3D })));
const camKey = (id: string) => `ohf-canvas-camera:${id}`;
const readCam = (id: string) => { try { const v = JSON.parse(localStorage.getItem(camKey(id)) ?? 'null'); return v && isFinite(v.x) && isFinite(v.y) && v.z > 0 ? v as { x: number; y: number; z: number } : null; } catch { return null; } };
const writeCam = (id: string, c: { x: number; y: number; z: number }) => { try { localStorage.setItem(camKey(id), JSON.stringify({ x: c.x, y: c.y, z: c.z })); } catch { /* private window */ } };
/** past this many nodes the zoom-scaled details (link width, far-out text size) settle when the camera stops, as on tldraw */
const LIVE_ZOOM_MAX = 40;
const BACK = 1_000_000;
const EMPTY = {};
/** crisp version thumbnails (a 2x screen, zoomed in) and the hover preview on the card's picture */
const TUNE = { takeThumbPx: 128, takePeek: true };
/** what plays an entrance when it mounts (node.css gc-in / gc-develop) */
const SETTLE = '.gc-stage,.gc-stage img,.gc-stage video,.nf-tk img,.lk-thread';

/** React Flow's nodes from the store: parents before their children, frames and groups behind, the selection marked. Each node object is
 *  kept while its store node and flags don't change, so React Flow only re-measures what moved. */
function useFlowNodes(store: BoardStore): Node[] {
  const nodes = useStore(store.zs, (s: BoardState) => s.nodes), order = useStore(store.zs, (s: BoardState) => s.order), selection = useStore(store.zs, (s: BoardState) => s.selection);
  const cache = useRef(new Map<string, { src: SNode; sel: boolean; z: number; rf: Node; ratios?: unknown }>());
  /* a poster takes its picture's shape once it loads (poster.ts): the node's size follows */
  const ratios = useValue('rf poster ratios', () => ratioAtom.get(), []);
  return useMemo(() => {
    const sel = new Set(selection); const out: Node[] = []; const done = new Set<string>(); const next = new Map<string, { src: SNode; sel: boolean; z: number; rf: Node; ratios?: unknown }>();
    const emit = (id: string, depth = 0) => {
      if (done.has(id) || depth > 64) return; const n = nodes[id]; if (!n) return;
      if (n.parentId !== PAGE && nodes[n.parentId] && !done.has(n.parentId)) emit(n.parentId, depth + 1);
      done.add(id); const i = order.indexOf(id); const z = isBack(n.type) ? i - BACK : i; const s = sel.has(id);
      const was = cache.current.get(id); let rf = was && was.src === n && was.sel === s && was.z === z && was.ratios === ratios ? was.rf : null;
      if (!rf) { const { w, h } = drawSize(n, sizeOf(n), ratios); const parent = n.parentId !== PAGE && nodes[n.parentId] ? n.parentId : undefined;
        rf = { id, type: rfTypeOf(n.type), position: { x: n.x, y: n.y }, width: w, height: h, zIndex: z, selected: s, data: EMPTY, ...(parent ? { parentId: parent } : {}),
          ...(n.type === 'frame' ? { style: { pointerEvents: 'none' } } : {}) } as Node; }
      next.set(id, { src: n, sel: s, z, rf, ratios }); out.push(rf);
    };
    for (const id of order) emit(id);
    cache.current = next; return out;
  }, [nodes, order, selection, ratios]);
}
function useFlowEdges(store: BoardStore): Edge[] {
  const links = useStore(store.zs, (s: BoardState) => s.links), nodes = useStore(store.zs, (s: BoardState) => s.nodes), selection = useStore(store.zs, (s: BoardState) => s.selection);
  return useMemo(() => { const sel = new Set(selection);
    return Object.values(links).filter((l) => nodes[l.from] && nodes[l.to] && l.from !== l.to).map((l) => ({ id: l.id, source: l.from, target: l.to, type: 'link', selected: sel.has(l.id), zIndex: 0 }) as Edge); }, [links, nodes, selection]);
}

/** Keys for this phase (the full set, with the shortcuts sheet, is the next phase). */
function useBoardKeys(board: BoardApi, store: BoardStore) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return; const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (t?.closest?.('[role=dialog],.apop,.cv-agent-slot')) return;
      const mod = e.metaKey || e.ctrlKey; const key = e.key.toLowerCase(); const sel = board.selection();
      const done = () => { e.preventDefault(); e.stopPropagation(); };
      if (mod && key === 'z') { done(); if (e.shiftKey) board.redo(); else board.undo(); return; }
      if (mod && key === 'y') { done(); board.redo(); return; }
      if (mod || e.altKey) return;
      if (key === 'g' && !e.shiftKey) { done(); createCard(board, { flow: lastFlowNow() }); return; }
      if (key === 'v') { board.setTool('select'); return; }
      if (key === 'h') { board.setTool('hand'); return; }
      if (key === 'escape') { if (sel.length) { done(); board.select([]); } return; }
      if ((key === 'delete' || key === 'backspace') && sel.length) { done(); const nodes = sel.filter((id) => board.getNode(id)), links = sel.filter((id) => board.getLink(id));
        board.mark('delete'); board.batch(() => { board.removeLinks(links); board.removeNodes(nodes); }); return; }
      if (key === 'enter' && !e.shiftKey && sel.length === 1 && board.getNode(sel[0])?.type === GEN_TYPE) {
        const focusCard = t?.closest?.('[data-shape-id]')?.getAttribute('data-shape-id'); if (focusCard && focusCard !== sel[0]) return; if (t && /^(BUTTON|A)$/.test(t.tagName)) return;
        done(); runCard(sel[0]); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [board, store]);
}

/** The toolbar's tools on this engine: Select and Hand; Sticky note drops a note in the middle of the view. tldraw's drawing tools (text,
 *  arrow, frame, pen) are not on this engine (decision pending). */
function useRfTool(store: BoardStore, board: BoardApi) {
  return useCallback((id: string): ToolButtonState => {
    const tool = useValue('rf tool button', () => store.viewSig.tool.get(), [store]); // eslint-disable-line react-hooks/rules-of-hooks
    if (id === 'select' || id === 'hand') return { available: true, on: tool === id, pick: () => board.setTool(id) };
    if (id === 'note') return { available: true, on: false, pick: () => { const c = board.viewportBounds().center; board.mark('new sticky note'); const nid = board.addNode({ type: 'note', x: c.x - 100, y: c.y - 100, props: noteProps() }); board.select([nid]); store.history.mark('edit note'); store.setView({ editing: nid }); } };
    return { available: false, on: false, pick: () => {} };
  }, [store, board]);
}

function Flow({ saved, store, board, port, drawerOpen, setDrawerOpen, onProject }: { saved: SavedBoard; store: BoardStore; board: BoardApi; port: RfPort; drawerOpen: boolean; setDrawerOpen: (v: boolean) => void; onProject: (id: string | null) => void }) {
  const opt = useMemo(rfOptions, []);
  const nodes = useFlowNodes(store); const edges = useFlowEdges(store);
  const tool = useStore(store.zs, (s) => s.tool);
  const routeVal = useRoutes(board, opt.links === 'curve' || opt.joins === 'curve' ? 'curve' : opt.joins === 'notch' ? 'notch' : 'ports');
  const initial = useMemo(() => { const c = readCam(saved.id); return c ? { x: c.x * c.z, y: c.y * c.z, zoom: c.z } : undefined; }, [saved.id]);
  const panning = useRef(false); const camTimer = useRef(0);
  useBoardKeys(board, store);
  const toolHook = useRfTool(store, board);

  const zoomVars = (z: number) => { const el = port.el; if (!el) return; el.style.setProperty('--tl-zoom', String(z)); el.style.setProperty('--tl-scale', String(1 / z)); if (z < OVERVIEW_ZOOM) el.dataset.far = '1'; else delete el.dataset.far; if (z < 0.35) el.dataset.mood = '1'; else delete el.dataset.mood; };
  /* React Flow reports a wheel pan's first step only to onMoveStart and its last to onMoveEnd: the camera follows all three */
  const onMove = (_: unknown, v: Viewport) => { store.setView({ camera: { x: v.x / v.zoom, y: v.y / v.zoom, z: v.zoom } }); if (store.s.order.length <= LIVE_ZOOM_MAX) zoomVars(v.zoom);
    window.clearTimeout(camTimer.current); camTimer.current = window.setTimeout(() => writeCam(saved.id, board.camera()), 400); };
  const onMoveStart = (e: unknown, v: Viewport) => { panning.current = !!e; onMove(e, v); };
  const onMoveEnd = (e: unknown, v: Viewport) => { panning.current = false; onMove(e, v); zoomVars(v.zoom); };
  const onInit = (rf: ReactFlowInstance) => { port.rf = rf; const v = rf.getViewport(); store.setView({ camera: { x: v.x / v.zoom, y: v.y / v.zoom, z: v.zoom } }); zoomVars(v.zoom);
    if (!initial && !board.isEmpty()) board.zoomToFit(); };

  /* pointer and wheel, for BoardApi.onInput (the follow-agent toggle stops on a manual pan) */
  useEffect(() => { const el = port.el; if (!el) return;
    const send = (kind: 'wheel' | 'pointer_down' | 'pointer_move' | 'pointer_up') => () => { for (const cb of port.inputs) cb({ kind, panning: panning.current }); };
    const all: [string, () => void][] = [['wheel', send('wheel')], ['pointerdown', send('pointer_down')], ['pointermove', send('pointer_move')], ['pointerup', send('pointer_up')]];
    for (const [t, f] of all) el.addEventListener(t, f, { capture: true, passive: true });
    return () => { for (const [t, f] of all) el.removeEventListener(t, f, { capture: true } as any); }; }, [port]);

  /* Ctrl / ⌘ + wheel (and a trackpad pinch, which the browser sends as ctrl + wheel) zooms on our own curve (zoom.ts), around the pointer */
  useEffect(() => { const el = port.el; if (!el) return;
    const wheel = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey)) return; if ((e.target as HTMLElement | null)?.closest?.('.nowheel')) return;
      e.preventDefault(); e.stopPropagation(); const r = el.getBoundingClientRect();
      const next = zoomAround(board.camera(), { x: e.clientX - r.left, y: e.clientY - r.top }, wheelZoomFactor(e.deltaY, e.deltaMode, r.height), MIN_ZOOM, MAX_ZOOM);
      board.setCamera(next); onMoveEnd(null, { x: next.x * next.z, y: next.y * next.z, zoom: next.z }); };
    el.addEventListener('wheel', wheel, { capture: true, passive: false }); return () => el.removeEventListener('wheel', wheel, { capture: true } as any); }, [port, board]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    store.tx(() => {
      let sel: Set<string> | null = null;
      for (const c of changes) {
        if (c.type === 'position' && c.position) { const n = store.s.nodes[c.id]; if (n && (n.x !== c.position.x || n.y !== c.position.y)) store.putNode(c.id, { ...n, x: c.position.x, y: c.position.y }); }
        else if (c.type === 'dimensions' && c.resizing !== undefined && c.dimensions) { const n = store.s.nodes[c.id]; if (!n || n.type === 'note') continue;
          const s = n.type === 'frame' ? { w: Math.max(120, c.dimensions.width), h: Math.max(80, c.dimensions.height) } : clampSize(n.type, n.props, c.dimensions.width, c.dimensions.height, adHeight);
          if (s.w !== n.props.w || s.h !== n.props.h) store.putNode(c.id, { ...n, props: { ...n.props, w: s.w, h: s.h } }); }
        else if (c.type === 'select') { sel ??= new Set(store.s.selection); if (c.selected) sel.add(c.id); else sel.delete(c.id); }
      }
      if (sel) store.setView({ selection: [...sel] });
    });
  }, [store]);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    let sel: Set<string> | null = null;
    for (const c of changes) if (c.type === 'select') { sel ??= new Set(store.s.selection); if (c.selected) sel.add(c.id); else sel.delete(c.id); }
    if (sel) store.setView({ selection: [...sel] });
  }, [store]);
  const dragStart = () => { board.mark('move'); store.setView({ gesture: 'drag' }); };
  const dragStop = () => store.setView({ gesture: null });

  const hand = tool === 'hand';
  return <OptCtx.Provider value={opt}><ToolHookContext.Provider value={toolHook}><RouteCtx.Provider value={routeVal}>
    <BoardBackground />
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} defaultViewport={initial} zIndexMode="manual" colorMode="dark" style={{ background: 'transparent' }}
      panOnScroll panOnScrollSpeed={1} zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false} preventScrolling
      panOnDrag={hand ? true : [1, 2]} selectionOnDrag={!hand} selectionMode={SelectionMode.Partial} selectionKeyCode={null} multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
      nodesDraggable={!hand} elementsSelectable={!hand} nodesConnectable={false} edgesReconnectable={false} edgesFocusable={!hand} nodesFocusable={false} deleteKeyCode={null}
      noDragClassName={NO_DRAG} noWheelClassName="nowheel" nodeDragThreshold={0} autoPanOnNodeDrag elevateNodesOnSelect={false} disableKeyboardA11y
      onlyRenderVisibleElements={opt.visible === '1'} attributionPosition="bottom-left" proOptions={{ hideAttribution: false }}
      onInit={onInit} onMove={onMove} onMoveStart={onMoveStart} onMoveEnd={onMoveEnd}
      onNodeDragStart={dragStart} onNodeDragStop={dragStop} onSelectionDragStart={dragStart} onSelectionDragStop={dragStop}
      onNodeMouseEnter={(_, n) => store.setView({ hovered: n.id })} onNodeMouseLeave={() => store.setView({ hovered: null })}
      onNodeDoubleClick={(_, n) => { const s = store.s.nodes[n.id]; if (s?.type === RESULT_TYPE && s.props.kind === '3d' && s.props.jobId) open3d(String(s.props.jobId)); }}>
      <AgentPresence />
      {opt.minimap === '1' && <MiniMap pannable zoomable className="cv-rf-minimap" maskColor="rgba(15,17,19,.7)" nodeColor="rgba(255,255,255,.18)" bgColor="#14151A" />}
    </ReactFlow>
    <LeftToolbar />
    <EmptyHint onOpenAssets={() => setDrawerOpen(true)} />
    <FollowAgent />
    <NextStepMenu />
    <CameraMotion />
    <AssetsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} projectId={saved.projectId ?? null} onProject={onProject} />
  </RouteCtx.Provider></ToolHookContext.Provider></OptCtx.Provider>;
}

export default function RfBoard({ board: saved, onSaveState, onSaved, drawerOpen, setDrawerOpen, onProject, onBoard }: {
  board: SavedBoard; onBoard?: (b: BoardApi | null) => void; onProject: (id: string | null) => void; onSaveState: (s: SaveState) => void; onSaved: (r: { rev: number; updatedAt: number; shapes: number }) => void; drawerOpen: boolean; setDrawerOpen: (v: boolean) => void;
}) {
  const toast = useToast(); const [view3d, setView3d] = useState<any | null>(null);
  const loaded = useMemo(() => { const doc = boardDocOf(saved.snapshot); const dropped = Object.values(doc.dropped ?? {}).reduce((a, b) => a + b, 0); return { ...docToStore(doc), dropped }; }, [saved.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [store] = useState(() => new BoardStore({ nodes: loaded.nodes, links: loaded.links, camera: readCam(saved.id) ?? undefined }));
  const [port] = useState<RfPort>(() => ({ rf: null, el: null, inputs: new Set() }));
  const api = useMemo(() => makeRfBoard(store, port, {
    confirmRemoveRunning: (ids) => askConfirm({ title: ids.length > 1 ? `Cancel ${ids.length} runs and remove the cards?` : 'Cancel the run and remove?',
      body: ['Undo would take away a card that is still running. Its run is cancelled first; anything it already made stays in Assets.'], confirm: ids.length > 1 ? 'Cancel and remove them' : 'Cancel and remove', danger: true }),
    cancelRun: (id) => { const n = store.s.nodes[id]; const jobs = [String((n?.props as any)?.jobId ?? ''), ...batchIdsOf(n as any)].filter(Boolean); for (const j of new Set(jobs)) void cancelJob(j).catch(() => undefined); },
    /* a card put back whole while its run is going (or ended meanwhile) follows its job again, so it never stays "running" */
    onRestore: (ids) => { for (const id of ids) { const n = store.s.nodes[id]; const p = n?.props as any; if (n?.type !== GEN_TYPE || p?.status !== 'running') continue;
      if (p.jobId) watchJob(apiRef.current!, p.jobId); for (const j of batchIdsOf(n as any)) watchJob(apiRef.current!, j); } },
  }), [store, port]);
  const apiRef = useRef<BoardApi | null>(null); apiRef.current = api;
  const look = useMemo(() => { const o = rfOptions(); return { takes: o.takes ?? 'ring', text: o.text ?? 'clean', joins: o.links === 'curve' ? 'curve' : o.joins ?? 'ports', handles: o.handles ?? 'all' }; }, []);

  useEffect(() => { const f = (e: Event) => { const id = (e as CustomEvent).detail?.jobId; if (!id) return;
    void Promise.all([getJob(id), import('../../shared/Viewer3D')]).then(([j, m]) => setView3d(m.jobItem3d(j))).catch(() => toast('This 3D result is no longer available.', 'error')); };
    addEventListener(OPEN_3D_EVENT, f); return () => removeEventListener(OPEN_3D_EVENT, f); }, [toast]);
  const close3d = () => { const jobId = view3d?.jobId; setView3d(null); if (!jobId) return;
    setTimeout(() => { void getJob(jobId).then((j) => { const poster = posterOf3d(j); if (!poster) return;
      const cards = api.nodes().filter((s) => s.type === RESULT_TYPE && (s.props as any).jobId === jobId && !(s.props as any).poster);
      if (cards.length) api.batch(() => api.patchNodes(cards.map((c) => ({ id: c.id, props: { poster } }))), { history: 'ignore' }); }).catch(() => undefined); }, 1200); };

  useEffect(() => {
    const id = saved.id; let rev = saved.rev; let dirty = false, saving = false, stopped = false; let timer = 0;
    onBoard?.(api); setBoardCtx({ boardId: id, projectId: saved.projectId ?? null, board: api }); exposeForDev(api);
    if ((import.meta as any).env?.DEV) (window as any).__ohfRfBoard = { board: api, store, liveJobs };
    reattachRunning(api);
    /* cards saved at the old 330 px height grow to today's card: once, never an undo step */
    const short = api.nodes().filter((s) => s.type === GEN_TYPE && (s.props as any).h <= 330 && (s.props as any).h >= 300);
    if (short.length) api.batch(() => api.patchNodes(short.map((s) => ({ id: s.id, props: { h: CARD_H } }))), { history: 'ignore' });
    store.history.clear();
    /* the board opens settled: cards already on it don't play their entrance (a fade from 0 that a tab without frames, a screenshot or
       a slow machine caught half way, showing every result dark); cards and results added later still animate */
    const booted = window.setTimeout(() => { const el = port.el; if (!el) return;
      for (const x of el.querySelectorAll(SETTLE)) x.classList.add('cv-settled'); delete el.dataset.booting; }, 1200);
    const docNow = () => { const s = store.s; return storeToDoc(s.order, s.nodes, Object.values(s.links)); };
    const save = async () => {
      if (!dirty || saving || stopped) return; dirty = false; saving = true; onSaveState('saving');
      try { const r = await saveBoard(id, docNow(), rev); rev = r.rev; onSaved(r); if (!dirty) onSaveState('saved'); }
      catch (e) { if (e instanceof BoardError && e.code === 'rev_conflict') { stopped = true; onSaveState('conflict'); toast('This board changed in another tab. Reload to get the latest; changes here are not saved.', 'warn', { ms: 8000 }); }
        else if (e instanceof BoardError && e.status === 404) { stopped = true; }
        else { dirty = true; onSaveState('error'); timer = window.setTimeout(save, 4000); } }
      finally { saving = false; if (dirty && !stopped) schedule(); }
    };
    const schedule = () => { clearTimeout(timer); timer = window.setTimeout(save, 800); };
    const unDoc = api.onChange(() => { dirty = true; onSaveState('saving'); schedule(); }, 'board');
    const onHide = () => { if (document.visibilityState === 'hidden') { writeCam(id, api.camera()); void save(); } };
    const onExit = () => { writeCam(id, api.camera()); if (dirty && !stopped && saveBoardOnExit(id, docNow(), rev)) dirty = false; };
    document.addEventListener('visibilitychange', onHide); addEventListener('pagehide', onExit);
    const unHand = bindHand(api);
    return () => { clearTimeout(booted); unHand(); unDoc(); clearTimeout(timer); document.removeEventListener('visibilitychange', onHide); removeEventListener('pagehide', onExit);
      writeCam(id, api.camera()); if (dirty && !stopped) { const d = docNow(); void saveBoard(id, d, rev).then(onSaved).catch(() => saveBoardOnExit(id, d, rev)); }
      store.dispose(); onBoard?.(null); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="cv-board" data-testid="cv-board" data-engine="rf">
    <div ref={(el) => { port.el = el; }} className="cv-rf" data-booting="1" data-takes={look.takes} data-text={look.text} data-joins={look.joins} data-handles={look.handles} data-testid="cv-rf" style={{ position: 'absolute', inset: 0 } as CSSProperties}>
      <BoardProvider value={api}><StoreCtx.Provider value={store}><ViewTuneContext.Provider value={TUNE}><ReactFlowProvider>
        <Flow saved={saved} store={store} board={api} port={port} drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} onProject={onProject} />
      </ReactFlowProvider></ViewTuneContext.Provider></StoreCtx.Provider></BoardProvider>
      {loaded.dropped > 0 && <p className="cv-rf-dropped" data-testid="rf-dropped">{loaded.dropped} drawing{loaded.dropped === 1 ? '' : 's'} from the old board can't be shown here (they stay in the saved copy).</p>}
    </div>
    {view3d && <Suspense fallback={null}><Viewer3D item={view3d} onClose={close3d} /></Suspense>}
  </div>;
}
