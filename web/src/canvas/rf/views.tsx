/**
 * What React Flow draws for each node and link (2026-11-06, Canvas move phase 3). Our own views, never React Flow's default styles:
 *  - cards (generate, result, prompt, upload, note, compare, group, ad layout): today's views (GenCardView, ResultCardView, AuxView) inside a
 *    custom node, reading the board through BoardApi; a resizer inside the kind's limits; two hidden handles so links have ends;
 *  - sticky notes: paper notes in tldraw's colours, double-click to type;
 *  - frames: a parent node (what sits in it moves with it), its name above it;
 *  - link cards (an old board's bookmark);
 *  - links: one custom edge with our routes (links.ts: a notch between neighbours, a thread along free lanes), the hovered or selected
 *    card's whole chain lit;
 *  - the agent's cursor (name, label, outline, laser) in the board's own coordinates.
 */
import { createContext, memo, useContext, useLayoutEffect, useRef } from 'react';
import { Handle, NodeResizer, Position, ViewportPortal, type EdgeProps, type NodeProps } from '@xyflow/react';
import { useBoardApi, useValue, type BoardApi, type NodeId } from '../boardApi';
import { GenCardView } from '../GenCardShape';
import { ResultCardView } from '../ResultCardShape';
import { AuxView } from '../AuxNodes';
import { GEN_TYPE, RESULT_TYPE, GROUP_TYPE, nodeDefOf, adCardHeight } from '../nodeTypes';
import { AD_SHAPES, asShape } from '../adPlatforms';
import { readLinks } from '../LinkLayer';
import { lineageOf } from '../graph';
import { isNeighbour, notchAt, routeThread, threadPath, linkLook, LANE } from '../links';
import { portInfoOf } from '../ports';
import { catalogNow } from '../catalog';
import { isNodeType } from '../nodeTypes';
import { reducedMotion } from '../agentHand';
import { richTextPlain, richTextOf } from '../../../../server/src/shared/boardDoc';
import { sizeOf, NOTE_SIZE } from './docMap';
import type { BoardStore } from './store';

/** The board's store, for the views that need more than BoardApi (sticky editing, the resize gesture). */
export const StoreCtx = createContext<BoardStore | null>(null);
/** Taste options for side-by-side looks (engine.rfOptions); empty = today's look. */
export const OptCtx = createContext<Record<string, string>>({});

/** Everything inside a card that is a control (fields, buttons, menus, ports): a drag there never moves the card. React Flow tests
 *  `.${noDragClassName}` with Element.matches, so a selector list works; it is the same rule as nodeFrameModel.isNodeControl. */
export const NO_DRAG = 'nodrag,[data-card-control],button,a,input,textarea,select,[role=slider],[role=option],.ac-wave,.apop';

/** An ad layout's height for its ad's shape at width w. */
export const adHeight = (w: number, size: string) => { const a = AD_SHAPES[asShape(size)]; return adCardHeight(w, a.w / a.h); };

function Resizer({ id, type, selected }: { id: string; type: string; selected: boolean }) {
  const store = useContext(StoreCtx)!; const opt = useContext(OptCtx);
  const def = nodeDefOf(type); const tool = useValue('rf tool', () => store.viewSig.tool.get(), [store]);
  const min = def ? { minWidth: def.minW, minHeight: def.minH, maxWidth: def.maxW, maxHeight: def.maxH } : { minWidth: 120, minHeight: 80 };
  return <NodeResizer isVisible={selected && tool === 'select'} {...min} handleClassName="cv-rf-handle-dot" lineClassName={opt.handles === 'corners' ? 'cv-rf-line-quiet' : 'cv-rf-line'}
    onResizeStart={() => { store.history.mark('resize'); store.setView({ gesture: 'resize' }); }} onResizeEnd={() => store.setView({ gesture: null })} />;
}
const Ends = () => <><Handle type="target" position={Position.Left} id="in" className="cv-rf-end" isConnectable={false} /><Handle type="source" position={Position.Right} id="out" className="cv-rf-end" isConnectable={false} /></>;
const sameNode = (a: NodeProps, b: NodeProps) => a.id === b.id && a.selected === b.selected && a.width === b.width && a.height === b.height;

/** Our cards, inside the wrappers tldraw gave them (so node.css and the agent's effects keyed on .tl-shape[data-shape-id] still apply). */
export const CardNode = memo(function CardNode({ id, selected }: NodeProps) {
  const board = useBoardApi(); const n = useValue('rf card', () => board.getNode(id), [board, id]);
  if (!n) return null;
  const view = n.type === GEN_TYPE ? <GenCardView shape={n as any} /> : n.type === RESULT_TYPE ? <ResultCardView shape={n as any} /> : <AuxView shape={n as any} />;
  return <>
    <Resizer id={id} type={n.type} selected={!!selected} />
    <div className="tl-shape cv-rf-shape" data-shape-id={id} data-shape-type={n.type}>
      <div className="tl-html-container" style={{ pointerEvents: n.type === GROUP_TYPE ? 'none' : 'all' }}>{view}</div>
    </div>
    <Ends />
  </>;
}, sameNode);

/** the note's padding top + bottom (rf.css .cv-sticky) */
const STICKY_PAD = 36;
const NOTE_FONT: Record<string, number> = { s: 18, m: 22, l: 26, xl: 32 };
/** A sticky note: today's paper look (D3 options: `card` in our card frame, `minimal` a quiet text card). Double-click to type. */
export const StickyNode = memo(function StickyNode({ id, selected }: NodeProps) {
  const board = useBoardApi(); const store = useContext(StoreCtx)!; const opt = useContext(OptCtx);
  const n = useValue('rf sticky', () => board.getNode(id), [board, id]); const editing = useValue('rf editing', () => store.viewSig.editing.get() === id, [store, id]);
  const inner = useRef<HTMLElement | null>(null);
  const p = (n?.props ?? {}) as Record<string, any>; const text = richTextPlain(p.richText); const scale = Number(p.scale) > 0 ? Number(p.scale) : 1;
  /* the note grows with its text, like tldraw's (growY) */
  useLayoutEffect(() => { const el = inner.current; if (!el || !n) return; const need = Math.max(0, Math.ceil(el.scrollHeight) + STICKY_PAD - NOTE_SIZE);
    if (Math.abs(need - (Number(p.growY) || 0)) > 1) board.batch(() => board.patchNode(id, { props: { growY: need } }), { history: 'ignore' }); });
  if (!n) return null;
  const { w, h } = sizeOf(n as any);
  const set = (t: string) => store.tx(() => board.patchNode(id, { props: { richText: richTextOf(t) } }));
  const look = opt.sticky === 'card' ? ' as-card' : opt.sticky === 'minimal' ? ' as-minimal' : '';
  return <div className="tl-shape cv-rf-shape" data-shape-id={id} data-shape-type="note">
    <div className={`cv-sticky c-${p.color ?? 'yellow'}${selected ? ' sel' : ''}${look}`} style={{ width: w / scale, minHeight: h / scale, transform: `scale(${scale})`, fontSize: NOTE_FONT[p.size] ?? 22 }}
      onDoubleClick={() => { store.history.mark('edit note'); store.setView({ editing: id }); }} data-testid="rf-sticky">
      {editing ? <textarea ref={(el) => { inner.current = el; }} className="cv-sticky-edit nodrag nowheel" autoFocus defaultValue={text} data-testid="rf-sticky-edit"
          onFocus={(e) => { const t = e.currentTarget; t.setSelectionRange(t.value.length, t.value.length); }} onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') (e.currentTarget as HTMLTextAreaElement).blur(); }} onBlur={() => store.setView({ editing: null })} />
        : <div ref={(el) => { inner.current = el; }} className="cv-sticky-t">{text || <span className="cv-sticky-ph">Double-click to write</span>}</div>}
    </div>
  </div>;
}, sameNode);

/** A frame: what sits in it moves with it; its name sits above it (double-click to rename). */
export const FrameNode = memo(function FrameNode({ id, selected }: NodeProps) {
  const board = useBoardApi(); const n = useValue('rf frame', () => board.getNode(id), [board, id]);
  if (!n) return null; const p = n.props as Record<string, any>;
  const rename = () => { const name = prompt('Frame name', String(p.name ?? '')); if (name != null) { board.mark('rename frame'); board.patchNode(id, { props: { name: name.slice(0, 80) } }); } };
  return <>
    <Resizer id={id} type="frame" selected={!!selected} />
    <div className={`cv-frame${selected ? ' sel' : ''}`} data-shape-id={id} data-testid="rf-frame">
      <span className="cv-frame-name" onDoubleClick={rename}>{String(p.name || 'Frame')}</span>
    </div>
  </>;
}, sameNode);

/** A link card (an old board's bookmark): its picture, title and address. */
export const LinkCardNode = memo(function LinkCardNode({ id, selected }: NodeProps) {
  const board = useBoardApi(); const n = useValue('rf link card', () => board.getNode(id), [board, id]); if (!n) return null; const p = n.props as Record<string, any>;
  let host = String(p.url ?? ''); try { host = new URL(host).hostname.replace(/^www\./, ''); } catch { /* keep it */ }
  return <><div className={`cv-linkcard${selected ? ' sel' : ''}`} data-shape-id={id}>
    {p.image ? <img src={p.image} alt="" draggable={false} /> : <i className="cv-linkcard-ph" />}
    <b>{p.title || host || 'Link'}</b>{p.description && <p>{p.description}</p>}<a className="nodrag" href={p.url} target="_blank" rel="noreferrer">{host}</a>
  </div><Ends /></>;
}, sameNode);

/** Anything this engine can't draw yet stays on the board, said plainly. */
export const UnknownNode = memo(function UnknownNode({ id }: NodeProps) {
  const board = useBoardApi(); const t = useValue('rf unknown', () => board.getNode(id)?.type ?? '', [board, id]);
  return <div className="cv-rf-unknown" data-shape-id={id}>This {t || 'item'} isn't shown here yet</div>;
}, sameNode);

export const NODE_TYPES = { card: CardNode, sticky: StickyNode, frame: FrameNode, linkcard: LinkCardNode, unknown: UnknownNode };
export const rfTypeOf = (type: string) => (isNodeType(type) ? 'card' : type === 'note' ? 'sticky' : type === 'frame' ? 'frame' : type === 'ohf-link' ? 'linkcard' : 'unknown');
/** frames and groups draw behind everything */
export const isBack = (type: string) => type === 'frame' || type === GROUP_TYPE;

// ---------------------------------------------------------------- links
export interface Route { from: string; to: string; kind: string; d: string; neighbour: boolean; notch: { x1: number; x2: number; y: number } | null; running: boolean; style: JoinStyle }
export const RouteCtx = createContext<{ routes: Map<string, Route>; lit: Set<string> }>({ routes: new Map(), lit: new Set() });
/** How links join cards (taste call, `?rfopt=joins:…`): 'ports' (default here) runs port to port, into the input of the kind it carries;
 *  'notch' is today's board (a notch with half-moon tabs between neighbours, threads into the middle of the edge); 'curve' is one soft
 *  curve port to port, everywhere. */
export type JoinStyle = 'ports' | 'notch' | 'curve';
const PORT_GAP = 20; /* NodeFrame: input dots sit 20 px apart around the middle of the left edge */

/** Every link's route, once per board change (isNeighbour and routeThread need every card's box), and the lit chain. */
export function useRoutes(board: BoardApi, style: JoinStyle) {
  const routes = useValue('rf routes', () => {
    const { boxes, links } = readLinks(board); const by = new Map(boxes.map((b) => [b.id, b])); const m = new Map<string, Route>(); const cat = catalogNow();
    /* the y of the input dot this link lands on (its kind's dot; the middle when the card shows none) */
    const inY = (t: { y: number; h: number }, toId: string, kind: string | null | undefined) => {
      const n = board.getNode(toId as NodeId); const ins = n ? portInfoOf(board, n, cat).ins : []; const i = ins.findIndex((x) => x.kind === kind);
      return Math.round(t.y + t.h / 2 + (i >= 0 ? (i - (ins.length - 1) / 2) * PORT_GAP : 0)); };
    for (const l of links) { const f = by.get(l.from)!, t = by.get(l.to)!; const running = (board.getNode(l.to as NodeId)?.props as any)?.status === 'running'; const kind = l.kind ?? 'text';
      const base = { from: l.from, to: l.to, kind, running, style };
      const sx = f.x + f.w, sy = Math.round(f.y + f.h / 2), ex = t.x, ey = style === 'notch' ? Math.round(t.y + t.h / 2) : inY(t, l.to, l.kind);
      const near = isNeighbour(f, t, boxes);
      if (style === 'curve' || (style === 'ports' && near)) { const dx = Math.max(24, Math.abs(ex - sx) / 2);
        m.set(l.id, { ...base, d: `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`, neighbour: near, notch: null }); continue; }
      if (near) { const n = notchAt(f, t); m.set(l.id, { ...base, d: `M ${n.x1} ${n.y} L ${n.x2} ${n.y}`, neighbour: true, notch: n }); continue; }
      const pts = routeThread(f, t, boxes);
      if (style === 'ports' && pts.length >= 2) { const last = pts.length - 1;
        if (pts.length >= 3 && pts[last - 1].y === pts[last].y && pts[last - 2].x === pts[last - 1].x) { pts[last - 1] = { ...pts[last - 1], y: ey }; pts[last] = { ...pts[last], y: ey }; }
        else if (pts[last].y !== ey) { const jx = pts[last].x - LANE; pts.splice(last, 1, { x: jx, y: pts[last].y }, { x: jx, y: ey }, { x: pts[last].x, y: ey }); } }
      m.set(l.id, { ...base, d: threadPath(pts), neighbour: false, notch: null }); }
    return m;
  }, [board, style]);
  const litKey = useValue('rf lit', () => { const sel = board.selection(); const h = board.hovered() ?? (sel.length === 1 ? sel[0] : null); if (!h || !isNodeType(board.getNode(h)?.type)) return '';
    const l = lineageOf(board, h); return l ? [h, ...l.anc, ...l.desc].sort().join(',') : h; }, [board]);
  return { routes, lit: new Set(litKey ? litKey.split(',') : []) };
}

export function LinkEdge({ id, selected }: EdgeProps) {
  const { routes, lit } = useContext(RouteCtx); const r = routes.get(id); if (!r) return null;
  const isLit = !!selected || (lit.has(r.from) && lit.has(r.to)); const look = linkLook({ reduced: reducedMotion(), lit: isLit, flowing: false, running: r.running });
  const join = r.neighbour && !r.notch; /* a short port-to-port join between neighbours */
  return <g className={`lk k-${r.kind} js-${r.style}${isLit ? ' lit' : ''}${selected ? ' sel' : ''}${join ? ' join' : ''}${r.running ? ' run' : ''}`} data-link={id} data-neighbour={r.neighbour ? '1' : undefined} style={{ ['--lk-o' as any]: selected ? 0.9 : look.opacity }}>
    {r.notch ? <g className="lk-notch" data-testid="link-notch">
        <line className="lk-bridge" x1={r.notch.x1} y1={r.notch.y} x2={r.notch.x2} y2={r.notch.y} />
        <path className="lk-tab" d={`M ${r.notch.x1} ${r.notch.y - 11} A 11 11 0 0 1 ${r.notch.x1} ${r.notch.y + 11} Z`} />
        <path className="lk-tab" d={`M ${r.notch.x2} ${r.notch.y - 11} A 11 11 0 0 0 ${r.notch.x2} ${r.notch.y + 11} Z`} />
      </g> : <path className={join ? 'lk-thread lk-join' : 'lk-thread'} data-testid={join ? 'link-join' : 'link-thread'} d={r.d} pathLength={1} />}
    <path className="react-flow__edge-interaction" d={r.d} fill="none" stroke="transparent" strokeWidth={20} />
  </g>;
}
export const EDGE_TYPES = { link: LinkEdge };

// ---------------------------------------------------------------- the agent's cursor
/** The agent's hand (agentHand.ts writes it through BoardApi.presence): a named orange cursor with its label, an outline on what it
 *  touched and its laser loop. Drawn in board coordinates, kept the same size on screen. */
export function AgentPresence() {
  const store = useContext(StoreCtx)!; const board = useBoardApi();
  const p = useValue('rf presence', () => store.viewSig.presence.get(), [store]); const z = useValue('rf zoom', () => store.viewSig.camera.get().z, [store]);
  const boxes = useValue('rf presence boxes', () => (p?.selected ?? []).map((id) => board.boundsOf(id)).filter(Boolean), [board, p]);
  if (!p) return null; const k = 1 / z;
  return <ViewportPortal>
    <div className="cv-rf-agent" aria-hidden>
      {boxes.map((b, i) => <i key={i} className="cv-rf-agent-sel" style={{ left: b!.x - 6 * k, top: b!.y - 6 * k, width: b!.w + 12 * k, height: b!.h + 12 * k, borderWidth: 2 * k, borderRadius: 20 * k }} />)}
      {p.laser && p.laser.points.length > 1 && <svg className="cv-rf-laser"><polyline points={p.laser.points.map((q) => `${q.x},${q.y}`).join(' ')} style={{ strokeWidth: 5 * k }} /></svg>}
      {p.cursor && <div className="cv-rf-cursor" style={{ transform: `translate(${p.cursor.x}px,${p.cursor.y}px) scale(${k})` }} data-testid="rf-agent-cursor">
        <svg width="20" height="20" viewBox="0 0 20 20"><path d="M2 2 L17 9 L10 11 L7 18 Z" fill={p.color} stroke="#14151A" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        <span className="cv-rf-tag"><b>{p.name}</b>{p.label && <em>{p.label}</em>}</span>
      </div>}
    </div>
  </ViewportPortal>;
}
