/**
 * The React Flow board's state (2026-11-06, Canvas move phase 3): one small zustand store, the only source of truth for the board when the
 * React Flow engine draws it. BoardApi over React Flow (boardApiRf.ts) reads and writes it; the <ReactFlow> view (RfBoard.tsx) is fed
 * from it; autosave turns it into the saved document (docMap.storeToDoc).
 *
 *  - document: nodes by id, their draw order (back to front, a frame before what sits in it) and links;
 *  - view: selection, hover, tool, the gesture under way, the camera (tldraw's {x, y, z}: screen = (page + camera) × z) and the agent's cursor.
 *
 * Writes go through tx(): changes inside one tx land as ONE store update (one React Flow render), and each node / link write is handed to
 * the history (history.ts) with the tx's mode. A tx inside an 'ignore' tx is ignored too (a job's write is never undone).
 *
 * The card views read the board with useValue (the reactive signals the views already use): every getter also reads a signal here, so a
 * view re-renders when what it read changed. Per node there is one signal, so dragging one card doesn't re-run every card's reads.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { atom, type Atom } from '../boardApi';
import { History, withFields, type Apply, type Entity } from './history';
import { PAGE, type SNode, type SLink } from './docMap';
import type { AgentPresence } from '../boardApi';

export type Tool = 'select' | 'hand';
export interface Camera { x: number; y: number; z: number }
export interface BoardState {
  nodes: Record<string, SNode>; order: string[]; links: Record<string, SLink>;
  selection: string[]; hovered: string | null; tool: Tool; gesture: 'drag' | 'resize' | null; camera: Camera;
  /** the sticky note being typed in */
  editing: string | null;
  presence: AgentPresence | null;
}
export type Mode = 'record' | 'ignore' | 'apply';

export class BoardStore {
  readonly zs: StoreApi<BoardState>;
  readonly history = new History();
  /** bumps on every document change (nodes, order, links) */
  readonly docSig: Atom<number>;
  readonly viewSig: { selection: Atom<string[]>; hovered: Atom<string | null>; tool: Atom<Tool>; gesture: Atom<BoardState['gesture']>; camera: Atom<Camera>; editing: Atom<string | null>; presence: Atom<AgentPresence | null> };
  private nodeSigs = new Map<string, Atom<SNode | null>>();
  private draft: BoardState | null = null; private copied = { nodes: false, order: false, links: false };
  private modes: Mode[] = [];
  private disposed = false;

  constructor(init: { nodes: SNode[]; links: SLink[]; camera?: Camera }) {
    const nodes: Record<string, SNode> = {}; for (const n of init.nodes) nodes[n.id] = n;
    const links: Record<string, SLink> = {}; for (const l of init.links) links[l.id] = l;
    this.zs = createStore<BoardState>(() => ({ nodes, order: init.nodes.map((n) => n.id), links, selection: [], hovered: null, tool: 'select', gesture: null,
      camera: init.camera ?? { x: 0, y: 0, z: 1 }, editing: null, presence: null }));
    const s = this.zs.getState();
    this.docSig = atom('rf doc', 0);
    this.viewSig = { selection: atom('rf selection', s.selection), hovered: atom('rf hovered', s.hovered), tool: atom('rf tool', s.tool), gesture: atom('rf gesture', s.gesture),
      camera: atom('rf camera', s.camera), editing: atom('rf editing', s.editing), presence: atom('rf presence', s.presence) };
    /* the signals follow the store (zustand calls this synchronously on every update) */
    this.zs.subscribe((n, p) => {
      if (n.nodes !== p.nodes || n.order !== p.order || n.links !== p.links) {
        if (n.nodes !== p.nodes) for (const [id, sig] of this.nodeSigs) if (n.nodes[id] !== p.nodes[id]) sig.set(n.nodes[id] ?? null);
        this.docSig.set(this.docSig.get() + 1);
      }
      for (const k of Object.keys(this.viewSig) as (keyof BoardStore['viewSig'])[]) if (n[k] !== p[k]) (this.viewSig[k] as Atom<any>).set(n[k]);
    });
  }

  /** the state now (inside a tx: with its changes so far) */
  get s(): BoardState { return this.draft ?? this.zs.getState(); }
  get isDisposed() { return this.disposed; }
  dispose() { this.disposed = true; }
  /** the node's signal (read inside useValue to re-render when that node changes) */
  nodeSig(id: string): Atom<SNode | null> { let a = this.nodeSigs.get(id); if (!a) { a = atom(`rf node ${id}`, this.s.nodes[id] ?? null); this.nodeSigs.set(id, a); } return a; }

  /** Several writes as one store update; `mode` 'ignore' is never undone, 'apply' is undo / redo putting things back. */
  tx<T>(fn: () => T, mode: Mode = 'record'): T {
    const outer = !this.draft; if (outer) { this.draft = { ...this.zs.getState() }; this.copied = { nodes: false, order: false, links: false }; }
    this.modes.push(mode);
    try { return fn(); }
    finally { this.modes.pop(); if (outer) { const d = this.draft!; this.draft = null; this.zs.setState(d, true); } }
  }
  private get mode(): Mode { return this.modes.includes('apply') ? 'apply' : this.modes.includes('ignore') ? 'ignore' : 'record'; }
  private d(): BoardState { if (!this.draft) throw new Error('write outside tx'); return this.draft; }
  private nodesW() { const d = this.d(); if (!this.copied.nodes) { d.nodes = { ...d.nodes }; this.copied.nodes = true; } return d.nodes; }
  private orderW() { const d = this.d(); if (!this.copied.order) { d.order = [...d.order]; this.copied.order = true; } return d.order; }
  private linksW() { const d = this.d(); if (!this.copied.links) { d.links = { ...d.links }; this.copied.links = true; } return d.links; }

  /** Put (or with null remove) one node. A new node goes in front; `at` puts it at that place in the draw order instead. */
  putNode(id: string, next: SNode | null, at?: number) {
    this.tx(() => {
      const before = this.s.nodes[id] ?? null; if (before === next) return;
      const nodes = this.nodesW();
      if (next) { nodes[id] = next; if (!before) { const o = this.orderW(); if (at != null && at >= 0 && at <= o.length) o.splice(at, 0, id); else o.push(id); } }
      else if (before) { delete nodes[id]; const o = this.orderW(); const i = o.indexOf(id); if (i >= 0) o.splice(i, 1); }
      if (this.mode !== 'apply') this.history.write('n', before as Entity | null, next as Entity | null, this.mode === 'record');
    });
  }
  putLink(id: string, next: SLink | null) {
    this.tx(() => {
      const before = this.s.links[id] ?? null; if (before === next) return;
      const links = this.linksW(); if (next) links[id] = next; else delete links[id];
      if (this.mode !== 'apply') this.history.write('l', before as Entity | null, next as Entity | null, this.mode === 'record');
    });
  }
  /** Move nodes to a new place in the draw order ('back' or 'front'), keeping a frame before what sits in it. */
  reorder(ids: string[], where: 'back' | 'front') {
    this.tx(() => { const set = new Set(ids.filter((id) => this.s.nodes[id])); if (!set.size) return; const o = this.orderW(); const moved = o.filter((id) => set.has(id)); const rest = o.filter((id) => !set.has(id));
      o.splice(0, o.length, ...(where === 'back' ? [...moved, ...rest] : [...rest, ...moved])); });
  }
  /** Set view state (never in history). */
  setView(p: Partial<Pick<BoardState, 'selection' | 'hovered' | 'tool' | 'gesture' | 'camera' | 'editing' | 'presence'>>) {
    if (this.draft) { Object.assign(this.draft, p); return; }
    const s = this.zs.getState(); if (Object.entries(p).every(([k, v]) => (s as any)[k] === v)) return; this.zs.setState(p);
  }

  /** Apply what the history gives back (undo, redo, bail), without recording it. Nodes come back before their links. */
  apply(list: Apply[]) {
    this.tx(() => {
      for (const a of list) {
        if (a.kind === 'n') {
          if (a.whole !== undefined) { if (a.whole) { const back = a.whole as unknown as SNode; this.putNode(a.id, back, this.slotFor(back)); } else this.putNode(a.id, null); }
          else if (a.fields) { const cur = this.s.nodes[a.id]; if (cur) this.putNode(a.id, withFields(cur as unknown as Entity, a.fields) as unknown as SNode); }
        } else {
          if (a.whole !== undefined) { const l = a.whole as unknown as SLink | null; if (!l || (this.s.nodes[l.from] && this.s.nodes[l.to])) this.putLink(a.id, l); }
          else if (a.fields) { const cur = this.s.links[a.id]; if (cur) this.putLink(a.id, withFields(cur as unknown as Entity, a.fields) as unknown as SLink); }
        }
      }
      /* a link whose node went: it goes too */
      for (const l of Object.values(this.s.links)) if (!this.s.nodes[l.from] || !this.s.nodes[l.to]) this.putLink(l.id, null);
      const sel = this.s.selection.filter((id) => this.s.nodes[id] || this.s.links[id]); if (sel.length !== this.s.selection.length) this.setView({ selection: sel });
    }, 'apply');
  }
  /** where a node put back goes in the draw order: right after its parent when it has one, else in front */
  private slotFor(n: SNode): number | undefined { if (n.parentId === PAGE) return undefined; const i = this.s.order.indexOf(n.parentId); return i >= 0 ? i + 1 : undefined; }
}
