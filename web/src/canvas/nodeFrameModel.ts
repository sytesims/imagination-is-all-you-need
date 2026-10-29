/** The shared node frame's non-visual bits (NodeFrame.tsx draws; this keeps the pointer rule and the one port drag). */
import { atom } from 'tldraw';

/** Pointer events in a node's own controls stay with them (a click doesn't drag the card, typing doesn't reach tldraw).
 *  A node's popovers (the model menu, workflow picker, settings, pre-flight list) render in a portal on <body>, but React still bubbles
 *  their events through the node: anything outside the node's own DOM is one of those menus and must never reach tldraw, or its pointer
 *  capture swallows the click (2026-10-28: the model menu's rows are divs, so picking an image model on a card did nothing). */
export const isNodeControl = (target: EventTarget | null, node: EventTarget | null): boolean => {
  const t = target as HTMLElement | null; const n = node as HTMLElement | null;
  if (!t) return false; if (n && typeof n.contains === 'function' && !n.contains(t)) return true;
  return !!t.closest?.('[data-card-control],button,a,input,textarea,select,[role=slider],[role=option],.ac-wave,.apop');
};
export const keepNodeControls = (e: React.PointerEvent) => { if (isNodeControl(e.target, e.currentTarget)) e.stopPropagation(); };

import type { PortKind } from './nodeLogic';
/** One port drag: what travels (kind), the legal targets (computed once at the start), the legal card under the pointer (targetId), any
 *  card under it (overId) and, over a card that can't take it, the line saying what that card takes. */
export interface PortDrag { fromId: string; fromType: string; kind: PortKind | null; x: number; y: number; targetId: string | null; overId: string | null; legal: string[]; hint: string }
/** One drag at a time, shared by every node so a target can glow while the pointer is over it. */
export const portDragAtom = atom<PortDrag | null>('ohf-port-drag', null);
if ((import.meta as any).env?.DEV) (window as any).__ohfPortDragAtom = portDragAtom;

/** "What next?": a port drag let go on empty board (NextStepMenu reads it; screen point for the menu, page point for the new card). */
export interface NextStep { fromId: string; kind: PortKind; screen: { x: number; y: number }; page: { x: number; y: number } }
export const nextStepAtom = atom<NextStep | null>('ohf-next-step', null);
