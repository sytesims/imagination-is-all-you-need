/**
 * "Follow agent": while it is on, the camera eases (never jumps) to where the agent works: the frame it is filling, or the cards a
 * proposal or a Go is about (agentHand.handAtom and agentFocusAtom). It keeps the board readable: never below 55% zoom and never above
 * 100%. When the area is too big for that, it centres on the agent's cursor at 55% instead of zooming out to a sea of tiny cards. If
 * the area is already in view at a readable zoom, the camera stays still (no seasick nudges).
 * A manual pan or zoom (wheel, pinch, hand drag, space drag) turns it off; the toggle turns it back on and goes to the agent.
 */
import { useEffect } from 'react';
import { Box, EASINGS, useEditor, useValue, type Editor, type TLEventInfo } from 'tldraw';
import { tip } from '../shared/Tooltip';
import { agentFocusAtom, followAtom, setFollow } from './agentDockModel';
import { handAtom, reducedMotion } from './agentHand';
import { withInputs } from './graph';

/** The readable floor: card names and prompts stay legible at this zoom. */
export const FOLLOW_MIN_ZOOM = 0.55;
const INSET = 72; const TOP_BAR = 64;

/** Ease the camera to a page area (or the point inside it the agent is at) at a readable zoom. Returns false when nothing had to move. */
export function frameArea(editor: Editor, area: Box, at?: { x: number; y: number } | null, force = false): boolean {
  const vs = editor.getViewportScreenBounds(); const z = editor.getZoomLevel(); const vp = editor.getViewportPageBounds();
  const fit = Math.min((vs.w - INSET * 2) / Math.max(1, area.w), (vs.h - INSET * 2) / Math.max(1, area.h));
  const anim = { animation: { duration: reducedMotion() ? 0 : 680, easing: EASINGS.easeInOutCubic } };
  if (fit >= FOLLOW_MIN_ZOOM) {
    const zoom = Math.min(1, fit);
    const inner = new Box(vp.x + INSET / z, vp.y + INSET / z, vp.w - (2 * INSET) / z, vp.h - (2 * INSET) / z);
    if (!force && z >= FOLLOW_MIN_ZOOM && z <= 1.001 && inner.contains(area) && z >= zoom * 0.8) return false;
    /* the board's top bar floats over the canvas: sit the area a little lower so its frame name stays clear of it */
    editor.zoomToBounds(new Box(area.x, area.y - TOP_BAR / zoom / 2, area.w, area.h), { inset: INSET, targetZoom: zoom, ...anim }); return true;
  }
  /* too big to read in one view: follow the cursor (or the area's start) at the readable floor */
  const p = at ?? { x: area.minX + Math.min(area.w, vs.w / FOLLOW_MIN_ZOOM) / 2, y: area.minY + Math.min(area.h, vs.h / FOLLOW_MIN_ZOOM) / 2 };
  const w = vs.w / FOLLOW_MIN_ZOOM, h = vs.h / FOLLOW_MIN_ZOOM;
  /* keep the area's top edge in view when the point is near it (frame headings stay on screen) */
  const y = Math.max(area.minY - INSET / FOLLOW_MIN_ZOOM, Math.min(p.y - h / 2, area.maxY - h + INSET / FOLLOW_MIN_ZOOM));
  const target = new Box(p.x - w / 2, area.h + (2 * INSET) / FOLLOW_MIN_ZOOM <= h ? area.midY - h / 2 : y, w, h);
  const inner = new Box(vp.x + vp.w * 0.18, vp.y + vp.h * 0.18, vp.w * 0.64, vp.h * 0.64);
  if (!force && Math.abs(z - FOLLOW_MIN_ZOOM) < 0.02 && inner.containsPoint(p)) return false;
  editor.zoomToBounds(new Box(target.x, target.y - TOP_BAR / FOLLOW_MIN_ZOOM / 2, target.w, target.h), { inset: 0, targetZoom: FOLLOW_MIN_ZOOM, ...anim }); return true;
}

/** Rendered inside <Tldraw>: moves the camera, and notices the user taking it back. */
export function FollowAgent() {
  const editor = useEditor();
  const follow = useValue('follow agent', () => followAtom.get(), []);
  const hand = useValue('agent hand', () => handAtom.get(), []);
  const focus = useValue('agent focus', () => agentFocusAtom.get(), []);
  /* the hand: frame where it works (debounced, so a run of quick steps is one smooth move; frameArea itself stays still when the area is
     already in view at a readable zoom) */
  useEffect(() => {
    if (!follow || !hand.area) return;
    const t = window.setTimeout(() => { const a = hand.area!; frameArea(editor, new Box(a.x, a.y, a.w, a.h), hand.at); }, 90);
    return () => window.clearTimeout(t);
  }, [editor, follow, hand.key]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the dock: a proposal or a Go frames its cards */
  useEffect(() => {
    if (!follow || !focus) return;
    const t = window.setTimeout(() => {
      const boxes = withInputs(editor, focus.ids).map((id) => editor.getShapePageBounds(id)).filter(Boolean) as Box[]; if (!boxes.length) return; /* the cards and what feeds them */
      frameArea(editor, Box.Common(boxes), null);
    }, 60);
    return () => window.clearTimeout(t);
  }, [editor, follow, focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onEvent = (info: TLEventInfo) => {
      if (!followAtom.get()) return;
      const panning = !!(editor.inputs as any).isPanning;
      if (info.type === 'wheel' || info.type === 'pinch' || (info.type === 'pointer' && info.name === 'pointer_move' && panning)) setFollow(false);
    };
    editor.on('event', onEvent); return () => { editor.off('event', onEvent); };
  }, [editor]);
  return null;
}

/** The pill on the board's top bar. */
export function FollowToggle({ busy }: { busy: boolean }) {
  const on = useValue('follow agent', () => followAtom.get(), []);
  const flip = () => { const next = !on; setFollow(next); if (next) { const h = handAtom.get(); if (h.area) handAtom.set({ ...h, key: Date.now() }); else { const f = agentFocusAtom.get(); if (f) agentFocusAtom.set({ ...f, key: Date.now() }); } } };
  return <button type="button" role="switch" aria-checked={on} className={`cv-follow${on ? ' on' : ''}${busy ? ' busy' : ''}`} data-testid="cv-follow" onClick={flip}
    {...tip(on ? 'The board follows the agent. Pan or zoom to look around on your own' : 'Follow the agent: the board moves to what it is working on')}>
    <i className="cv-follow-sw" aria-hidden><i /></i><span>Follow<span className="cv-follow-x"> agent</span></span>{busy && <b className="cv-follow-dot" aria-hidden />}
  </button>;
}
