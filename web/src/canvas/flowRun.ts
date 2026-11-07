/**
 * Asking to run several cards at once (Canvas release 2, step 1): a Group's "Run the flow" and a drop's "Replace and rerun" both go through
 * the one proposal path of release 1. The server prices every card (price lock, board budget, decision 9 for steps with no price) and the
 * dock shows the proposal card; nothing runs until Go there.
 */
import { boardCtx } from './boardCtx';

/** The dock opens when a proposal it must show is made from the board (CanvasPage listens). */
export const OPEN_DOCK_EVT = 'ohf-canvas-open-dock';
export const openDock = () => dispatchEvent(new Event(OPEN_DOCK_EVT));

export type ProposeResult = { ok: true; proposal: any } | { ok: false; error: string };
/** POST a proposal for these cards on the open board (the server takes up to 40). */
export async function proposeCards(ids: string[], note: string, boardId = boardCtx().boardId): Promise<ProposeResult> {
  const url = `/api/canvas/boards/${encodeURIComponent(boardId)}/agent/proposals`;
  const body = JSON.stringify({ card_ids: ids.slice(0, 40), note: note.slice(0, 400) });
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).catch(() => null);
  const b = r ? await r.json().catch(() => null) : null;
  if (!r?.ok || !b?.proposal) return { ok: false, error: String(b?.error ?? 'That couldn’t be priced. Try again in a moment.') };
  return { ok: true, proposal: b.proposal };
}
