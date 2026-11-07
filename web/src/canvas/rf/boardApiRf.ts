/**
 * BoardApi over React Flow (2026-11-06, Canvas move phase 3): the same seam as boardApiTldraw.ts, over our own store (store.ts). Every file
 * that speaks BoardApi (graph, ports, runs, the agent bridge, batchBuild, tidy, the panels, the card views…) works on this engine unchanged.
 *
 * Rules kept from boardApi.ts: links are not nodes; batch(fn, { history: 'ignore' }) is never undone; mark(label) starts one undo step.
 * Nodes keep BoardApi's words (a sticky is a 'note' with rich text, a frame a 'frame'); docMap.ts turns them into the saved document.
 * The camera speaks tldraw's {x, y, z} (screen = (page + camera) × z); React Flow's viewport is {x: x·z, y: y·z, zoom: z}.
 */
import type { ReactFlowInstance } from '@xyflow/react';
import { rect, unionRects, rectHasPoint, type BoardApi, type BoardInputEvent, type BoardLink, type BoardNode, type CameraMove, type NodeId, type Rect } from '../boardApi';
import { PAGE, sizeOf, noteProps, keyAfter, type SNode, type SLink } from './docMap';
import type { BoardStore, Camera } from './store';
import { draftProps } from '../cardModel';
import { NODE_DEFS, nodeDefOf, GEN_TYPE, RESULT_TYPE, AD_TYPE } from '../nodeTypes';
import { auxProps, adProps } from '../auxModel';
import { drawSize, ratioAtom } from './poster';

export const MIN_ZOOM = 0.05, MAX_ZOOM = 4;
/** today's zoom steps (tldraw's), inside our 5 %–400 % */
const STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4];
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
/** a new id in the board's form (`shape:` + 21 random characters, as tldraw made them) */
export function newShapeId(): string { const b = new Uint8Array(21); crypto.getRandomValues(b); let s = ''; for (const x of b) s += ID_CHARS[x & 63]; return `shape:${s}`; }

/** A new node's full props: its kind's defaults with what the caller gave on top (so the saved board always has every field). */
export function defaultPropsOf(type: string): Record<string, any> {
  if (type === GEN_TYPE) return draftProps() as any;
  if (type === RESULT_TYPE) return { w: 360, h: 460, kind: 'image', jobId: '', url: '', poster: '', title: '', model: '', place: '', price: '', time: '' };
  if (type === AD_TYPE) return adProps() as any;
  const def = nodeDefOf(type); if (def) return auxProps(def.kind) as any;
  if (type === 'note') return noteProps();
  if (type === 'frame') return { w: 160, h: 90, name: '', color: 'black' };
  return {};
}

/** How the board reaches React Flow (set once it is up) and its DOM element. */
export interface RfPort { rf: ReactFlowInstance | null; el: HTMLElement | null; inputs: Set<(e: BoardInputEvent) => void> }

/** What the board hands back to the page around undo / redo (RfBoard wires them; tests can too). */
export interface RfHooks {
  /** an Undo would remove cards that are running right now: true = cancel their runs and remove them */
  confirmRemoveRunning?: (ids: string[]) => Promise<boolean>;
  /** cancel the run on this card (after the person said yes) */
  cancelRun?: (id: string) => void;
  /** undo / redo put these cards back whole (a running one follows its job again) */
  onRestore?: (ids: string[]) => void;
}

export function makeRfBoard(store: BoardStore, port: RfPort, hooks: RfHooks = {}): BoardApi {
  const S = () => store.s;
  /** put back what the history gave, then tell the page which cards came back whole */
  const applyStep = (u: { apply: import('./history').Apply[] } | null) => { if (!u) return; store.apply(u.apply);
    const back = u.apply.filter((a) => a.kind === 'n' && a.whole).map((a) => a.id).filter((id) => S().nodes[id]); if (back.length) hooks.onRestore?.(back); };
  const running = (id: string) => { const p = S().nodes[id]?.props as any; return p?.status === 'running' && !!p?.jobId; };
  /** read a node through its signal, so useValue re-renders on its change */
  const node = (id: string): SNode | null => { if (!id) return null; store.nodeSig(id).get(); return S().nodes[id] ?? null; };
  const doc = () => store.docSig.get();
  const absOf = (n: SNode, seen = 0): { x: number; y: number } => { const p = n.parentId !== PAGE ? node(n.parentId) : null; if (!p || seen > 64) return { x: n.x, y: n.y }; const pp = absOf(p, seen + 1); return { x: pp.x + n.x, y: pp.y + n.y }; };
  const boxOf = (n: SNode): Rect => { const a = absOf(n); const { w, h } = drawSize(n, sizeOf(n), ratioAtom.get()); return rect(a.x, a.y, w, h); };
  const linkOf = (l: SLink): BoardLink => ({ id: l.id, from: l.from, to: l.to, meta: l.meta });
  const ordered = () => { doc(); const s = S(); return s.order.map((id) => s.nodes[id]).filter(Boolean); };
  const sortedLinks = () => { doc(); return Object.values(S().links).sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0)); };
  const cam = (): Camera => store.viewSig.camera.get();
  const size = () => { const el = port.el; return { w: el?.clientWidth || 1, h: el?.clientHeight || 1 }; };
  const setCam = (c: Camera, o?: CameraMove) => {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.z)); const v = { x: c.x * z, y: c.y * z, zoom: z };
    if (port.rf) void port.rf.setViewport(v, o?.duration ? { duration: o.duration } : undefined);
    if (!o?.duration || !port.rf) store.setView({ camera: { x: c.x, y: c.y, z } });
  };
  /** the camera that puts page point p at the middle of the view at zoom z */
  const centerCam = (p: { x: number; y: number }, z: number): Camera => { const { w, h } = size(); return { x: w / 2 / z - p.x, y: h / 2 / z - p.y, z }; };
  const viewCenter = () => { const c = cam(); const { w, h } = size(); return { x: w / 2 / c.z - c.x, y: h / 2 / c.z - c.y }; };
  const zoomTo = (z: number, o?: CameraMove) => setCam(centerCam(viewCenter(), Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))), o);
  const fit = (r: { x: number; y: number; w: number; h: number }, o?: CameraMove & { inset?: number; zoom?: number }) => {
    const { w, h } = size(); const inset = o?.inset ?? Math.min(256, w * 0.28);
    let z = Math.min((w - inset) / Math.max(1, r.w), (h - inset) / Math.max(1, r.h)); if (o?.zoom != null) z = Math.min(o.zoom, z);
    z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)); setCam(centerCam({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, z), o);
  };
  const contentBounds = () => unionRects(ordered().map(boxOf));
  /** a node and every node inside it (frames) */
  const withKids = (ids: string[]) => { const s = S(); const out = new Set<string>(); const add = (id: string) => { if (out.has(id) || !s.nodes[id]) return; out.add(id); for (const k of s.order) if (s.nodes[k].parentId === id) add(k); }; ids.forEach(add); return [...out]; };

  const b: BoardApi = {
    get disposed() { return store.isDisposed; },
    getNode: (id) => { const n = node(id); return (n as unknown as BoardNode) ?? null; },
    has: (id) => { doc(); return !!(S().nodes[id] || S().links[id]); },
    nodes: () => ordered() as unknown as BoardNode[],
    isEmpty: () => { doc(); return !S().order.length && !Object.keys(S().links).length; },
    boundsOf: (id) => { const n = node(id); if (n) return boxOf(n); doc(); const l = S().links[id]; if (!l) return null; const f = S().nodes[l.from], t = S().nodes[l.to]; return f && t ? unionRects([boxOf(f), boxOf(t)]) : null; },
    contentBounds,
    nodesAt: (p, o) => { const m = o?.margin ?? 0; return ordered().filter((n) => { const r = boxOf(n); return p.x >= r.minX - m && p.x <= r.maxX + m && p.y >= r.minY - m && p.y <= r.maxY + m; }).reverse() as unknown as BoardNode[]; },
    parentOf: (id) => { const n = node(id); return n && n.parentId !== PAGE ? n.parentId : null; },
    childrenOf: (id) => ordered().filter((n) => n.parentId === id).map((n) => n.id),
    addNode: (n) => {
      const id = newShapeId(); const props = { ...defaultPropsOf(n.type), ...(n.props ?? {}) };
      store.putNode(id, { id, type: n.type, x: n.x, y: n.y, rotation: 0, parentId: PAGE, index: '', props, meta: { ...(n.meta ?? {}) } }); return id;
    },
    patchNode: (id, patch) => { store.tx(() => { const n = S().nodes[id]; if (!n) return;
      store.putNode(id, { ...n, ...(patch.x != null ? { x: patch.x } : {}), ...(patch.y != null ? { y: patch.y } : {}), ...(patch.props ? { props: { ...n.props, ...patch.props } } : {}), ...(patch.meta ? { meta: { ...n.meta, ...patch.meta } } : {}) }); }); },
    patchNodes: (list) => { store.tx(() => { for (const p of list) b.patchNode(p.id, p); }); },
    removeNodes: (ids) => { if (!ids.length) return; store.tx(() => { const all = withKids(ids); const gone = new Set(all);
      for (const l of Object.values(S().links)) if (gone.has(l.from) || gone.has(l.to)) store.putLink(l.id, null);
      for (const id of [...all].reverse()) store.putNode(id, null);
      store.setView({ selection: S().selection.filter((x) => !gone.has(x)), ...(S().hovered && gone.has(S().hovered!) ? { hovered: null } : {}) }); }); },
    setParent: (ids, parentId) => { store.tx(() => {
      const target = parentId ? S().nodes[parentId] : null; const pAbs = target ? absOf(target) : { x: 0, y: 0 };
      for (const id of ids) { const n = S().nodes[id]; if (!n || id === parentId) continue; const a = absOf(n);
        /* never inside itself or one of its own children */ let up = target; let loop = false; for (let k = 0; up && k < 64; k++) { if (up.id === id) { loop = true; break; } up = up.parentId !== PAGE ? S().nodes[up.parentId] : null; } if (loop) continue;
        store.putNode(id, { ...n, parentId: target ? target.id : PAGE, x: a.x - pAbs.x, y: a.y - pAbs.y }); }
      /* in front of the new parent: move them (and their own children) to the front */
      store.reorder(withKids(ids), 'front'); }); },
    toBack: (ids) => { store.reorder(withKids(ids), 'back'); },
    asset: () => null,

    getLink: (id) => { doc(); const l = S().links[id]; return l ? linkOf(l) : null; },
    links: () => sortedLinks().map(linkOf),
    linksInto: (id) => sortedLinks().filter((l) => l.to === id).map(linkOf),
    linksFrom: (id) => sortedLinks().filter((l) => l.from === id).map(linkOf),
    addLink: (from, to, o) => { if (!S().nodes[from] || !S().nodes[to] || from === to) return null; const id = newShapeId();
      const max = Object.values(S().links).reduce((m, l) => (l.order > m ? l.order : m), '');
      store.putLink(id, { id, from, to, order: keyAfter(max), meta: { ...(o?.meta ?? {}) } }); return id; },
    removeLinks: (ids) => { if (!ids.length) return; store.tx(() => { for (const id of ids) store.putLink(id, null); store.setView({ selection: S().selection.filter((x) => !ids.includes(x)) }); }); },

    selection: () => store.viewSig.selection.get(),
    select: (ids) => { const s = S(); store.setView({ selection: ids.filter((id) => s.nodes[id] || s.links[id]) }); },
    hovered: () => store.viewSig.hovered.get(),
    selectionBounds: () => unionRects(store.viewSig.selection.get().map((id) => b.boundsOf(id)).filter(Boolean) as Rect[]),
    gesture: () => store.viewSig.gesture.get(),

    camera: () => cam(),
    setCamera: (c, o) => setCam(c, o),
    zoom: () => cam().z,
    fitBounds: (r, o) => fit(r, o),
    centerOn: (p, o) => setCam(centerCam(p, cam().z), o),
    zoomToSelection: (o) => { const r = b.selectionBounds(); if (r) fit(r, { ...o, zoom: Math.max(1, cam().z) }); },
    zoomToFit: (o) => { const r = contentBounds(); if (r) fit(r, { ...o, zoom: 1 }); },
    zoomIn: (o) => { const z = cam().z; zoomTo(STEPS.find((s) => s > z + 1e-6) ?? MAX_ZOOM, o); },
    zoomOut: (o) => { const z = cam().z; zoomTo([...STEPS].reverse().find((s) => s < z - 1e-6) ?? MIN_ZOOM, o); },
    resetZoom: (o) => zoomTo(1, o),
    screenToBoard: (p) => { const c = cam(); const r = port.el?.getBoundingClientRect(); return { x: (p.x - (r?.left ?? 0)) / c.z - c.x, y: (p.y - (r?.top ?? 0)) / c.z - c.y }; },
    boardToViewport: (p) => { const c = cam(); return { x: (p.x + c.x) * c.z, y: (p.y + c.y) * c.z }; },
    viewportBounds: () => { const c = cam(); const { w, h } = size(); return rect(-c.x, -c.y, w / c.z, h / c.z); },
    viewportScreenBounds: () => { const r = port.el?.getBoundingClientRect(); return rect(r?.left ?? 0, r?.top ?? 0, r?.width ?? 1, r?.height ?? 1); },
    container: () => port.el ?? document.body,

    tool: () => store.viewSig.tool.get(),
    setTool: (id) => { if (id === 'select' || id === 'hand') store.setView({ tool: id }); },

    mark: (label) => store.history.mark(label),
    bailToMark: (m) => { store.apply(store.history.bailTo(m)); },
    batch: (fn, o) => { store.tx(fn, o?.history === 'ignore' ? 'ignore' : 'record'); },
    /* Undo during a run (release 1): undoing the step that made a card that is running asks first ("Cancel the run and remove?"); a card a
       finished run wrote to stays (history.ts keeps it), and job-owned fields are never part of a step */
    undo: () => { const live = store.history.undoRemoves().filter(running);
      if (live.length && hooks.confirmRemoveRunning) { void hooks.confirmRemoveRunning(live).then((yes) => { if (!yes || !live.every((id) => store.history.undoRemoves().includes(id))) return; /* the board moved on while asking */ for (const id of live) hooks.cancelRun?.(id); applyStep(store.history.undo({ remove: live })); }); return; }
      applyStep(store.history.undo()); },
    redo: () => applyStep(store.history.redo()),

    onChange: (cb, scope) => store.zs.subscribe((n, p) => {
      if (scope === 'board' ? n.nodes !== p.nodes || n.order !== p.order || n.links !== p.links : n.camera !== p.camera || n.selection !== p.selection || n.hovered !== p.hovered) cb();
    }),
    onInput: (cb) => { port.inputs.add(cb); return () => { port.inputs.delete(cb); }; },

    presence: {
      has: () => !!store.viewSig.presence.get() && !store.isDisposed,
      put: (p, create = true) => { if (store.isDisposed) return; const cur = S().presence; if (!cur && !create) return;
        store.setView({ presence: { name: 'Agent', color: '#FF7A1A', cursor: null, label: '', selected: [], laser: null, ...(cur ?? {}), ...p } }); },
      remove: () => { if (S().presence) store.setView({ presence: null }); },
    },
  };
  return b;
}

/** A resize kept inside the kind's limits (nodeTypes); an ad layout's height follows its ad's shape. */
export function clampSize(type: string, props: Record<string, any>, w: number, h: number, adHeight?: (w: number, size: string) => number): { w: number; h: number } {
  const def = nodeDefOf(type); if (!def) return { w: Math.max(120, w), h: Math.max(80, h) };
  const cw = Math.max(def.minW, Math.min(def.maxW, w));
  if (type === AD_TYPE && adHeight) return { w: cw, h: adHeight(cw, String(props.size ?? '4x5')) };
  return { w: cw, h: Math.max(def.minH, Math.min(def.maxH, h)) };
}
export { NODE_DEFS, rectHasPoint };
