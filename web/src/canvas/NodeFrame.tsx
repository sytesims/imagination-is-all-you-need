/**
 * ONE frame for every board node (generate, result, prompt, upload, note, compare, group).
 *
 *  - header: a small tinted medium tile, the node name and a quiet status pill (brighter on hover / selection);
 *  - body: whatever the node draws (media, text, compare, or nothing for a group);
 *  - footer: the model and the price / actions;
 *  - typed ports (2026-10-27): a small dot per input kind on the left edge and one output dot on the right, coloured by what travels
 *    (picture, clip, sound, text; tokens.css --media-*). Dragging from an output draws a ghost line in that colour, lights the cards
 *    that take that kind and dims the others; a drop on a legal card draws the existing tldraw arrow binding (graph.linkShapes), so
 *    cardInputs keeps working exactly as before. A drop on a card that can't take it says what that card takes; a drop on empty
 *    board opens "What next?" (NextStepMenu) with the sensible workflows for that medium.
 *  - one look at every zoom (2026-10-30: the zoomed-out pill is gone; links ended at card edges the pill no longer filled). Far out the
 *    board drops shadows and loops (CameraMotion.tsx), and cards well off screen are empty shells.
 *
 * The frame is presentational: each shape util owns its props and resize rules; the shared registry (nodeTypes.ts) owns which ports
 * exist, nodeLogic.ts owns the typing rules and ports.ts reads them from the live board.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, useValue, type TLShapeId } from 'tldraw';
import { portDragAtom, nextStepAtom, listenPortDrag } from './nodeFrameModel';
import { tip } from '../shared/Tooltip';
import { useToast } from '../shared/Toast';
import { linkShapes } from './graph';
import { nodeDefOf, type NodeTint } from './nodeTypes';
import { legalTargets, pickTypedTarget, takesLine, PORT_WORDS, type PortInfo, type PortKind } from './nodeLogic';
import { boardPorts, portInfoOf } from './ports';
import { catalogNow } from './catalog';
import { perfOff } from './CameraMotion';

export interface NodeFrameProps {
  shapeId: TLShapeId; type: string; tint?: NodeTint;
  icon: ReactNode; title: ReactNode; titleHint?: string;
  status?: ReactNode; actions?: ReactNode;
  children?: ReactNode; footer?: ReactNode;
  className?: string; bodyClass?: string;
  variant?: 'node' | 'group';
  testId?: string;
  rootAttrs?: Record<string, string | undefined>;
  /** the card's short label (its name for screen readers) */
  label?: string;
  /** the big title under the type line (a result's name, an upload's file, an ad's headline) */
  heading?: ReactNode;
}

const KIND_NAME: Record<PortKind, string> = { image: 'Picture', video: 'Clip', audio: 'Sound', text: 'Text' };
/** The node's ports as a stable string (so a card re-renders only when its ports change): "out|kind:room,kind:room". */
const portKey = (p: PortInfo | null) => (p ? `${p.out ?? ''}|${p.ins.map((i) => `${i.kind}:${i.room}`).join(',')}` : '|');
const nameOfNode = (editor: ReturnType<typeof useEditor>, id: string) => { const s = editor.getShape(id as TLShapeId); const n = (s?.meta as any)?.name; return (typeof n === 'string' && n.trim()) || nodeDefOf(s?.type)?.label || 'This card'; };

/** The line that follows the pointer while dragging from an output (only the source frame draws it). */
function DragGhost({ from }: { from: { x: number; y: number } }) {
  const d = useValue('nf ghost', () => portDragAtom.get(), []);
  if (!d) return null;
  const bad = !!d.overId && !d.targetId;
  return createPortal(<div className={`nf-ghost-wrap nf-k-${d.kind ?? 'text'}${bad ? ' bad' : ''}${d.targetId ? ' ok' : ''}`} aria-hidden>
    <svg className="nf-ghost"><path d={`M ${from.x} ${from.y} C ${from.x + 90} ${from.y}, ${d.x - 90} ${d.y}, ${d.x} ${d.y}`} /><circle cx={d.x} cy={d.y} r={d.targetId ? 6 : 4} /></svg>
    {(bad && d.hint) ? <span className="nf-ghost-hint" style={{ left: d.x + 14, top: d.y + 12 }}>{d.hint}</span>
      : !d.overId ? <span className="nf-ghost-hint soft" style={{ left: d.x + 14, top: d.y + 12 }}>Let go for what's next</span> : null}
  </div>, document.body);
}

export function NodeFrame({ shapeId, type, tint, icon, title, titleHint, status, actions, children, footer, className = '', bodyClass = '', variant = 'node', testId, rootAttrs, label, heading }: NodeFrameProps) {
  const editor = useEditor(); const toast = useToast();
  const def = nodeDefOf(type);
  const selected = useValue('nf selected', () => editor.getSelectedShapeIds().includes(shapeId), [editor, shapeId]);
  const hovered = useValue('nf hovered', () => editor.getHoveredShapeId() === shapeId, [editor, shapeId]);
  /* this node's role in a drag: the source, a legal target (and the one under the pointer), or dimmed */
  const role = useValue('nf drag role', () => { const d = portDragAtom.get(); if (!d) return ''; if (d.fromId === shapeId) return 'src'; return d.targetId === shapeId ? 'drop' : d.legal.includes(shapeId) ? 'ok' : 'dim'; }, [shapeId]);
  const dragKind = useValue('nf drag kind', () => portDragAtom.get()?.kind ?? null, []);
  const ports = useValue('nf ports', () => { const s = editor.getShape(shapeId); return portKey(s && variant === 'node' ? portInfoOf(editor, s, catalogNow()) : null); }, [editor, shapeId, variant]);
  const [outK, insK] = ports.split('|'); const out = (outK || null) as PortKind | null;
  const ins = (insK ? insK.split(',') : []).map((x) => { const [k, r] = x.split(':'); return { kind: k as PortKind, room: Number(r) }; });
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  /* far off screen (more than a screen away): an empty shell, so its media, timers and controls aren't mounted while you pan a big board.
     It fills back in a screen before it comes into view; selected cards always stay whole. Re-renders only when this flips. */
  const offscreen = useValue('nf offscreen', () => { if (variant !== 'node' || perfOff()) return false; const b = editor.getShapePageBounds(shapeId); if (!b) return false;
    const v = editor.getViewportPageBounds(); const mx = v.w, my = v.h;
    return (b.maxX < v.minX - mx || b.minX > v.maxX + mx || b.maxY < v.minY - my || b.minY > v.maxY + my) && !editor.getSelectedShapeIds().includes(shapeId); }, [editor, shapeId, variant]);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);

  const endDrag = () => { cleanup.current(); cleanup.current = () => {}; portDragAtom.set(null); setStart(null); document.body.classList.remove('nf-port-dragging'); };
  const beginDrag = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!def?.output || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (!out) { toast('This card has nothing to pass on yet.'); return; }
    const at = { x: e.clientX, y: e.clientY }; const all = boardPorts(editor, catalogNow()); const byId = new Map(all.map((p) => [p.id, p]));
    setStart(at); document.body.classList.add('nf-port-dragging');
    portDragAtom.set({ fromId: shapeId, fromType: type, kind: out, x: at.x, y: at.y, targetId: null, overId: null, legal: legalTargets(out, shapeId, all), hint: '' });
    const move = (ev: PointerEvent) => {
      const p = editor.screenToPage({ x: ev.clientX, y: ev.clientY });
      const under = editor.getShapesAtPoint(p, { hitInside: true, margin: 8 }).map((s) => byId.get(s.id)).filter((x): x is PortInfo => !!x);
      const { target, over } = pickTypedTarget(under, out, shapeId);
      const hint = over && !target ? (over.ins.some((i) => i.kind === out) ? `${nameOfNode(editor, over.id)} is full` : takesLine(nameOfNode(editor, over.id), over.ins)) : '';
      portDragAtom.update((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY, targetId: target?.id ?? null, overId: over?.id ?? null, hint } : d));
    };
    const up = (ev: PointerEvent) => {
      const d = portDragAtom.get();
      if (d?.targetId && d.fromId === shapeId) { editor.markHistoryStoppingPoint('connect node'); linkShapes(editor, shapeId, d.targetId as TLShapeId); }
      else if (d?.overId && d.hint) toast(`${d.hint}.`);
      else if (d && !d.overId && ev.type === 'pointerup') { const moved = Math.hypot(ev.clientX - at.x, ev.clientY - at.y) > 24;
        if (moved) nextStepAtom.set({ fromId: shapeId, kind: out, screen: { x: ev.clientX, y: ev.clientY }, page: editor.screenToPage({ x: ev.clientX, y: ev.clientY }) }); }
      endDrag();
    };
    cleanup.current = listenPortDrag(window, { move, up, cancel: endDrag });
  };

  if (offscreen) return <div className={`nf nf-${variant} nf-shell`} data-shape-id={shapeId} data-node-kind={def?.kind ?? 'node'} data-offscreen="1" aria-hidden />;
  /* keyboard: a card is a focus stop (Tab moves between cards); Enter selects it, the same as a click */
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' && !editor.getSelectedShapeIds().includes(shapeId)) { e.preventDefault(); e.stopPropagation(); editor.select(shapeId); } };
  const canDrop = role === 'drop';
  const cls = `nf nf-${variant} nf-${def?.kind ?? 'node'} nf-tint-${tint ?? def?.tint ?? 'text'}${selected ? ' nf-sel' : ''}${hovered ? ' nf-hover' : ''}${canDrop ? ' nf-drop' : ''}${role === 'src' ? ' nf-dragging' : ''}${role ? ` nf-r-${role}` : ''}${className ? ` ${className}` : ''}`;
  /* input dots sit around the middle of the left edge, 20 px apart */
  const n = ins.length; const top = (i: number) => `calc(50% + ${(i - (n - 1) / 2) * 20}px)`;
  return <div className={cls} data-shape-id={shapeId} data-node-kind={def?.kind ?? 'node'} data-node-type={type} data-selected={selected ? '1' : undefined} data-drop={canDrop ? '1' : undefined} data-drag-role={role || undefined} data-testid={testId} {...rootAttrs}
    tabIndex={variant === 'node' ? 0 : undefined} aria-label={variant === 'node' ? (label ?? def?.label) : undefined} onKeyDown={variant === 'node' ? onKey : undefined}>
    <header className="nf-head">
      <span className="nf-tile" aria-hidden>{icon}</span>
      <div className="nf-title" {...(titleHint ? tip(titleHint) : {})}>{title}</div>
      <div className="nf-head-r">{actions && <span className="nf-acts" data-card-control>{actions}</span>}{status && <span className="nf-status-wrap">{status}</span>}</div>
    </header>
    {(children != null || heading != null) && <div className={`nf-body ${bodyClass}`.trim()}>{heading != null && <h3 className="nf-heading" title={typeof heading === 'string' ? heading : undefined}>{heading}</h3>}{children}</div>}
    {footer != null && <footer className="nf-foot">{footer}</footer>}
    {ins.map((p, i) => <span key={p.kind} className={`nf-port nf-in nf-k-${p.kind}${p.room <= 0 ? ' full' : ''}${dragKind === p.kind && role !== 'dim' ? ' want' : ''}`} style={{ top: top(i) }} data-card-control data-kind={p.kind} data-testid={`port-in-${p.kind}`}
      {...tip(p.room > 0 ? `Takes ${PORT_WORDS[p.kind]}` : `${KIND_NAME[p.kind]} input is full`)}><i /></span>)}
    {def?.output && out && <span className={`nf-port nf-out nf-k-${out}`} role="button" tabIndex={-1} data-card-control data-kind={out} data-testid={`port-out-${out}`} aria-label={`${KIND_NAME[out]} out: drag onto another card`}
      {...tip(`Drag to connect this ${KIND_NAME[out].toLowerCase()}, or let go on the board for what's next`)} onPointerDown={beginDrag}><i /></span>}
    {role === 'src' && start && <DragGhost from={start} />}
  </div>;
}
