/**
 * How connections look on the board (2026-10-27; the rules are links.ts, tested):
 *  - neighbours (a card feeding the card right beside it) show a notch in the media colour, half-moon tabs on the facing edges, no wire;
 *  - other links are light threads (about 15%), right angles with rounded corners along lanes that never cross a card;
 *  - hovering or selecting a card brightens its whole chain, and a short pulse of light runs along the links it touches;
 *  - when a run hands its result on, a pulse travels the link once; while a card runs from its inputs, a few specks of stardust drift
 *    along the link into it (never when idle);
 *  - magnetic snap (Magnet): drop a card within 60 px of a compatible card's side and it clicks in beside it and links (a gold ring
 *    pulses once); pull a snapped card away and the link lets go;
 *  - Tidy: the linked cards into rows (one history step, a CSS glide).
 * Under reduced motion: no pulse, dust or easing; links sit at a calm fixed opacity and snaps are instant.
 *
 * ONE svg in tldraw's OnTheCanvas layer (already moved by the camera): it re-renders when shapes, links, hover or selection change,
 * never per frame. Pulses and dust are CSS / SVG animations. The tldraw arrows behind the links stay (they are the data) but are hidden.
 */
import { useEffect, useRef, useState } from 'react';
import { atom, useEditor, useValue, type Editor, type TLArrowBinding, type TLShapeId } from 'tldraw';
import { isNodeType, GROUP_TYPE } from './nodeTypes';
import { lineageOf, linkShapes } from './graph';
import { outKindOfShape, portInfoOf } from './ports';
import { canFeed } from './nodeLogic';
import { catalogNow } from './catalog';
import { isNeighbour, notchAt, routeThread, threadPath, snapTarget, pulledApart, linkLook, type LBox, type Link } from './links';
import { tidyBoard } from './tidy';
import { reducedMotion } from './agentHand';

const boxOf = (editor: Editor, id: string): LBox | null => { const b = editor.getShapePageBounds(id as TLShapeId); return b ? { id, x: b.x, y: b.y, w: b.w, h: b.h } : null; };
/** Cards on the page (no groups) and the arrows that link two of them (start → end bindings). */
export function readLinks(editor: Editor): { boxes: LBox[]; links: (Link & { arrow: string })[] } {
  const shapes = editor.getCurrentPageShapes(); const boxes = shapes.filter((s) => isNodeType(s.type) && s.type !== GROUP_TYPE).map((s) => boxOf(editor, s.id)).filter(Boolean) as LBox[];
  const ids = new Set(boxes.map((b) => b.id)); const links: (Link & { arrow: string })[] = [];
  for (const s of shapes) { if (s.type !== 'arrow') continue; const bs = editor.getBindingsFromShape<TLArrowBinding>(s.id, 'arrow');
    const st = bs.find((b) => b.props.terminal === 'start')?.toId, en = bs.find((b) => b.props.terminal === 'end')?.toId;
    if (st && en && st !== en && ids.has(st) && ids.has(en)) links.push({ id: s.id, arrow: s.id, from: st, to: en, kind: outKindOfShape(editor.getShape(st)), snap: (s.meta as any)?.snap === true }); }
  return { boxes, links };
}

/** tldraw's getShapeVisibility: an arrow that links two cards is data only (the layer draws the notch or thread), so it is hidden,
 *  not hit, not selected; a free arrow someone drew stays. */
export function linkArrowVisibility(shape: { type: string; id: string }, editor: Editor): 'hidden' | 'inherit' {
  if (shape.type !== 'arrow') return 'inherit'; const bs = editor.getBindingsFromShape<TLArrowBinding>(shape.id as TLShapeId, 'arrow'); if (bs.length < 2) return 'inherit';
  return bs.every((b) => { const t = editor.getShape(b.toId); return t && isNodeType(t.type) && t.type !== GROUP_TYPE; }) ? 'hidden' : 'inherit';
}

// ---------------------------------------------------------------- fx: short CSS rules (a gold ring on snap, the Tidy glide)
let styleEl: HTMLStyleElement | null = null; const rules = new Map<string, string>();
const flush = () => { if (!styleEl || !styleEl.isConnected) { styleEl = document.createElement('style'); styleEl.id = 'ohf-link-fx'; document.head.appendChild(styleEl); } styleEl.textContent = [...rules.values()].join('\n'); };
const rule = (k: string, css: string | null, ms?: number) => { if (css == null) rules.delete(k); else rules.set(k, css); flush(); if (css && ms) window.setTimeout(() => { if (rules.get(k) === css) rule(k, null); }, ms); };
const sel = (id: string) => `.tl-shape[data-shape-id="${id.replace(/"/g, '')}"]`;
/** The cards glide to where they are going (one CSS transition on their transform; nothing under reduced motion). */
export function glide(ids: string[], ms = 420) { if (reducedMotion()) return; rule('glide', `${ids.map(sel).join(',')}{transition:transform ${ms}ms cubic-bezier(.2,.8,.2,1)}`, ms + 120); }
const goldRing = (id: string) => { if (reducedMotion()) return; rule(`gold:${id}`, `${sel(id)} > *{animation:ohf-gold 900ms ease-out both}`, 1000); };

/** Tidy the board: linked cards into rows, one history step (Undo puts it back), one glide. Returns how many moved. */
export function tidyNow(editor: Editor): number {
  const { boxes, links } = readLinks(editor); const top = boxes.filter((b) => { const s = editor.getShape(b.id as TLShapeId); return s && !String(s.parentId).startsWith('shape:'); });
  const cards = top.map((b) => ({ ...b, type: editor.getShape(b.id as TLShapeId)!.type })); /* page bounds = position for top-level shapes */
  glide(cards.map((c) => c.id)); return tidyBoard(editor, cards, links);
}

// ---------------------------------------------------------------- magnetic snap
export const magnetAtom = atom<{ drag: string; target: string; from: string; to: string; x: number; y: number } | null>('ohf-magnet', null);
function canFeedIds(editor: Editor, from: string, to: string) { const f = editor.getShape(from as TLShapeId), t = editor.getShape(to as TLShapeId); if (!f || !t) return false; return canFeed(outKindOfShape(f), from, portInfoOf(editor, t, catalogNow())); }
/** While a card is dragged: is it within reach of a compatible card's side? (sets magnetAtom; the layer draws the gold marker) */
export function magnetCheck(editor: Editor, id: string) {
  const me = boxOf(editor, id); if (!me) { magnetAtom.set(null); return; } const others = readLinks(editor).boxes.filter((b) => b.id !== id);
  const t = snapTarget(me, others, (f, to) => canFeedIds(editor, f, to)); const cur = magnetAtom.get();
  if (!t) { if (cur) magnetAtom.set(null); return; }
  if (!cur || cur.target !== t.id || cur.from !== t.from || cur.x !== t.x || cur.y !== t.y) magnetAtom.set({ drag: id, target: t.id, from: t.from, to: t.to, x: t.x, y: t.y });
}
/** The card was let go: click into place and link (gold ring), or, pulled away from a snapped neighbour, let the link go. */
export function magnetDrop(editor: Editor, id: string): 'snapped' | 'unlinked' | null {
  const m = magnetAtom.get(); magnetAtom.set(null); const shape = editor.getShape(id as TLShapeId); if (!shape) return null;
  if (m && m.drag === id) {
    const have = readLinks(editor).links.find((l) => l.from === m.from && l.to === m.to);
    editor.markHistoryStoppingPoint('snap'); glide([id], 180);
    editor.run(() => { editor.updateShape({ id: id as TLShapeId, type: shape.type, x: m.x, y: m.y } as any);
      if (!have) { const a = linkShapes(editor, m.from as TLShapeId, m.to as TLShapeId); if (a) editor.updateShape({ id: a, type: 'arrow', meta: { snap: true } } as any); } });
    goldRing(id); return 'snapped';
  }
  const { boxes, links } = readLinks(editor); const by = new Map(boxes.map((b) => [b.id, b]));
  const gone = links.filter((l) => l.snap && (l.from === id || l.to === id) && pulledApart(by.get(l.from)!, by.get(l.to)!));
  if (!gone.length) return null;
  editor.markHistoryStoppingPoint('unlink'); editor.deleteShapes(gone.map((l) => l.arrow as TLShapeId)); for (const l of gone) stretchAtom.set({ ...l, at: Date.now() });
  return 'unlinked';
}
function Magnet() {
  const editor = useEditor();
  useEffect(() => {
    let dragging: string | null = null;
    const watch = () => {
      if (!editor.isIn('select.translating')) return; const only = editor.getOnlySelectedShape();
      if (!only || !isNodeType(only.type) || only.type === GROUP_TYPE || String(only.parentId).startsWith('shape:')) { if (magnetAtom.get()) magnetAtom.set(null); return; }
      dragging = only.id; magnetCheck(editor, only.id);
    };
    const offStore = editor.store.listen(watch, { scope: 'document' });
    const onEvent = (info: any) => { if (info?.name === 'pointer_up' && dragging) { const id = dragging; dragging = null; window.setTimeout(() => magnetDrop(editor, id), 0); } };
    editor.on('event', onEvent);
    if ((import.meta as any).env?.DEV) (window as any).__ohfMagnet = { check: (id: string) => magnetCheck(editor, id), drop: (id: string) => magnetDrop(editor, id), tidy: () => tidyNow(editor) };
    return () => { offStore(); editor.off('event', onEvent); };
  }, [editor]);
  return null;
}
/** The last link let go (a short stretch-and-release line). */
const stretchAtom = atom<(Link & { at: number }) | null>('ohf-stretch', null);

// ---------------------------------------------------------------- the layer
const reducedNow = () => reducedMotion();
export function LinkLayer() {
  const editor = useEditor();
  const model = useValue('links', () => {
    const { boxes, links } = readLinks(editor); if (!links.length) return null;
    const statuses: Record<string, string> = {}; for (const b of boxes) { const s: any = editor.getShape(b.id as TLShapeId); if (s?.props?.status) statuses[b.id] = s.props.status; }
    const by = new Map(boxes.map((b) => [b.id, b]));
    const drawn = links.map((l) => { const f = by.get(l.from)!, t = by.get(l.to)!;
      if (isNeighbour(f, t, boxes)) { const n = notchAt(f, t); return { ...l, neighbour: true as const, d: `M ${n.x1} ${n.y} L ${n.x2} ${n.y}`, notch: n }; }
      return { ...l, neighbour: false as const, d: threadPath(routeThread(f, t, boxes)), notch: null }; });
    return { drawn, statuses, arrows: links.map((l) => l.arrow) };
  }, [editor]);
  /* hover or select a card: its whole chain lights up */
  const litKey = useValue('lit chain', () => { const h = editor.getHoveredShapeId() ?? (editor.getSelectedShapeIds().length === 1 ? editor.getSelectedShapeIds()[0] : null); if (!h || !isNodeType(editor.getShape(h)?.type)) return '';
    const l = lineageOf(editor, h); return l ? [h, ...l.anc, ...l.desc].sort().join(',') : h; }, [editor]);
  const lit = new Set(litKey ? litKey.split(',') : []);
  /* a card that just finished hands its result on: its outgoing links carry one pulse */
  const prev = useRef<Record<string, string>>({}); const [flowing, setFlowing] = useState<Set<string>>(new Set());
  useEffect(() => { if (!model) return; const done = Object.keys(model.statuses).filter((id) => model.statuses[id] === 'done' && prev.current[id] === 'running'); prev.current = model.statuses;
    if (!done.length) return; const ids = model.drawn.filter((l) => done.includes(l.from)).map((l) => l.id); if (!ids.length) return;
    setFlowing((s) => new Set([...s, ...ids])); const t = window.setTimeout(() => setFlowing((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n; }), 2400); return () => window.clearTimeout(t); }, [model]);
  const magnet = useValue('magnet', () => magnetAtom.get(), []);
  const stretch = useValue('stretch', () => stretchAtom.get(), []);
  if (!model && !magnet) return null;
  const reduced = reducedNow();
  return <>
    <svg className={`cv-links${reduced ? ' calm' : ''}`} data-testid="cv-links" aria-hidden>
      {model?.drawn.map((l) => {
        const isLit = lit.has(l.from) && lit.has(l.to); const look = linkLook({ reduced, lit: isLit, flowing: flowing.has(l.id), running: model.statuses[l.to] === 'running' });
        const k = `k-${l.kind ?? 'text'}`;
        return <g key={l.id} className={`lk ${k}${isLit ? ' lit' : ''}`} data-link={l.id} data-neighbour={l.neighbour ? '1' : undefined} style={{ ['--lk-o' as any]: look.opacity }}>
          {l.neighbour ? <g className="lk-notch" data-testid="link-notch">
              <line className="lk-bridge" x1={l.notch!.x1} y1={l.notch!.y} x2={l.notch!.x2} y2={l.notch!.y} />
              <path className="lk-tab" d={`M ${l.notch!.x1} ${l.notch!.y - 11} A 11 11 0 0 1 ${l.notch!.x1} ${l.notch!.y + 11} Z`} />
              <path className="lk-tab" d={`M ${l.notch!.x2} ${l.notch!.y - 11} A 11 11 0 0 0 ${l.notch!.x2} ${l.notch!.y + 11} Z`} />
            </g>
            : <path className="lk-thread" data-testid="link-thread" d={l.d} />}
          {look.pulse && <path className="lk-pulse" d={l.d} pathLength={1} />}
          {look.dust && [0, 1, 2, 3].map((i) => <circle key={i} className="lk-dust" r={2.6 - (i % 2) * 0.8}><animateMotion dur={`${l.neighbour ? 0.9 : 2.2}s`} begin={`${i * (l.neighbour ? 0.22 : 0.55)}s`} repeatCount="indefinite" path={l.d} /></circle>)}
        </g>;
      })}
      {magnet && (() => { const t = editor.getShapePageBounds(magnet.target as TLShapeId); if (!t) return null; const x = magnet.to === magnet.target ? t.x - 50 : t.maxX + 50;
        return <g className="lk-magnet" data-testid="link-magnet"><line x1={x} y1={t.y + 40} x2={x} y2={t.maxY - 40} /><circle cx={x} cy={t.midY} r={10} /></g>; })()}
      {stretch && !reduced && Date.now() - stretch.at < 600 && (() => { const f = editor.getShapePageBounds(stretch.from as TLShapeId), t = editor.getShapePageBounds(stretch.to as TLShapeId); if (!f || !t) return null;
        return <path key={stretch.at} className="lk-stretch" d={`M ${f.maxX} ${f.midY} C ${f.maxX + 120} ${f.midY}, ${t.x - 120} ${t.midY}, ${t.x} ${t.midY}`} pathLength={1} />; })()}
    </svg>
  </>;
}

/** tldraw's OnTheCanvas slot: the links and the magnetic snap. */
export function CanvasOverlays() { return <><LinkLayer /><Magnet /></>; }
