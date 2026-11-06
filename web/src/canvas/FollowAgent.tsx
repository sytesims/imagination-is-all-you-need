/**
 * "Follow agent": while it is on, the camera eases (never jumps) to where the agent works: the frame it is filling, or the cards a
 * proposal or a Go is about (agentHand.handAtom and agentFocusAtom). It keeps the board readable: never below 62% zoom and never above
 * 100%. When the area is too big for that, it centres on the agent's cursor at 62% instead of zooming out to a sea of tiny cards. If
 * the area is already in view at a readable zoom, the camera stays still (no seasick nudges).
 * A manual pan or zoom (wheel, pinch, hand drag, space drag) turns it off; the toggle turns it back on and goes to the agent.
 */
import { useEffect } from 'react';
import { rect, rectContains, rectHasPoint, unionRects, useBoardApi, useValue, type BoardApi, type Rect } from './boardApi';
import { tip } from '../shared/Tooltip';
import { agentFocusAtom, followAtom, setFollow } from './agentDockModel';
import { handAtom, reducedMotion } from './agentHand';
import { withInputs } from './graph';
import { OVERVIEW_ZOOM } from './cardLook';

/** The readable floor: card names and prompts stay legible at this zoom (under it cards switch to their far look, cardLook.ts). */
export const FOLLOW_MIN_ZOOM = OVERVIEW_ZOOM + 0.02; /* a hair above: the camera's 0.5999… must not tip the cards into the far look */
const INSET = 72; const TOP_BAR = 64;
/** Whether a page area fits the view at the readable floor. */
export function fitsReadable(board: BoardApi, area: { w: number; h: number }): boolean {
  const vs = board.viewportScreenBounds(); return Math.min((vs.w - INSET * 2) / Math.max(1, area.w), (vs.h - INSET * 2) / Math.max(1, area.h)) >= FOLLOW_MIN_ZOOM;
}
/** What to frame for some cards (an agent batch, a proposal, a Go): the first of `wider` (e.g. the cards with what feeds them) that fits at
 *  a readable zoom, else the cards alone. Null when none are on the board. */
export function readableArea(board: BoardApi, ids: string[], wider: string[][] = [withInputs(board, ids)]): Rect | null {
  const boxOf = (list: string[]) => unionRects(list.map((id) => board.boundsOf(id)).filter(Boolean) as Rect[]);
  for (const list of wider) { const b = boxOf(list); if (b && fitsReadable(board, b)) return b; }
  return boxOf(ids);
}

/** Ease the camera to a page area (or the point inside it the agent is at) at a readable zoom. Returns false when nothing had to move. */
export function frameArea(board: BoardApi, area: Rect, at?: { x: number; y: number } | null, force = false): boolean {
  const vs = board.viewportScreenBounds(); const z = board.zoom(); const vp = board.viewportBounds();
  const fit = Math.min((vs.w - INSET * 2) / Math.max(1, area.w), (vs.h - INSET * 2) / Math.max(1, area.h));
  const anim = { duration: reducedMotion() ? 0 : 680, easing: 'inOutCubic' as const };
  if (fit >= FOLLOW_MIN_ZOOM) {
    const zoom = Math.min(1, fit);
    const inner = rect(vp.x + INSET / z, vp.y + INSET / z, vp.w - (2 * INSET) / z, vp.h - (2 * INSET) / z);
    if (!force && z >= FOLLOW_MIN_ZOOM && z <= 1.001 && rectContains(inner, area) && z >= zoom * 0.8) return false;
    /* the board's top bar floats over the canvas: sit the area a little lower so its frame name stays clear of it */
    board.fitBounds(rect(area.x, area.y - TOP_BAR / zoom / 2, area.w, area.h), { inset: INSET, zoom, ...anim }); return true;
  }
  /* too big to read in one view: follow the cursor (or the area's start) at the readable floor */
  const p = at ?? { x: area.minX + Math.min(area.w, vs.w / FOLLOW_MIN_ZOOM) / 2, y: area.minY + Math.min(area.h, vs.h / FOLLOW_MIN_ZOOM) / 2 };
  const w = vs.w / FOLLOW_MIN_ZOOM, h = vs.h / FOLLOW_MIN_ZOOM;
  /* keep the area's top edge in view when the point is near it (frame headings stay on screen) */
  const y = Math.max(area.minY - INSET / FOLLOW_MIN_ZOOM, Math.min(p.y - h / 2, area.maxY - h + INSET / FOLLOW_MIN_ZOOM));
  const target = rect(p.x - w / 2, area.h + (2 * INSET) / FOLLOW_MIN_ZOOM <= h ? area.midY - h / 2 : y, w, h);
  const inner = rect(vp.x + vp.w * 0.18, vp.y + vp.h * 0.18, vp.w * 0.64, vp.h * 0.64);
  if (!force && Math.abs(z - FOLLOW_MIN_ZOOM) < 0.02 && rectHasPoint(inner, p)) return false;
  board.fitBounds(rect(target.x, target.y - TOP_BAR / FOLLOW_MIN_ZOOM / 2, target.w, target.h), { inset: 0, zoom: FOLLOW_MIN_ZOOM, ...anim }); return true;
}

/** Rendered inside the board: moves the camera, and notices the user taking it back. */
export function FollowAgent() {
  const board = useBoardApi();
  const follow = useValue('follow agent', () => followAtom.get(), []);
  const hand = useValue('agent hand', () => handAtom.get(), []);
  const focus = useValue('agent focus', () => agentFocusAtom.get(), []);
  /* the hand: frame where it works (debounced, so a run of quick steps is one smooth move; frameArea itself stays still when the area is
     already in view at a readable zoom) */
  useEffect(() => {
    if (!follow || !hand.area) return;
    const t = window.setTimeout(() => { const a = hand.area!; frameArea(board, rect(a.x, a.y, a.w, a.h), hand.at); }, 90);
    return () => window.clearTimeout(t);
  }, [board, follow, hand.key]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the dock: a proposal or a Go frames its cards */
  useEffect(() => {
    if (!follow || !focus) return;
    const t = window.setTimeout(() => {
      const area = readableArea(board, focus.ids); if (!area) return; /* the cards and what feeds them, or the cards alone when that is too big to read */
      frameArea(board, area, null);
    }, 60);
    return () => window.clearTimeout(t);
  }, [board, follow, focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    return board.onInput((e) => {
      if (!followAtom.get()) return;
      if (e.kind === 'wheel' || e.kind === 'pinch' || (e.kind === 'pointer_move' && e.panning)) setFollow(false);
    });
  }, [board]);
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
