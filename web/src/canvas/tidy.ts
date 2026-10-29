/**
 * Tidy (2026-10-27): the board's linked cards laid into clean rows, left to right, so every link becomes a neighbour notch (links.ts
 * tidyLayout). One history step: a single Undo puts the board back. The glide is CSS on the shapes (LinkLayer's fx), so it costs nothing
 * per frame and is instant under reduced motion.
 */
import type { Editor } from 'tldraw';
import { tidyLayout, type LBox, type Link } from './links';

/** Move the cards to their tidy rows in one history step; returns how many moved. */
export function tidyBoard(editor: Editor, cards: (LBox & { type: string })[], links: Link[]): number {
  const pos = tidyLayout(cards, links); const moves = cards.filter((c) => pos[c.id] && (pos[c.id].x !== c.x || pos[c.id].y !== c.y));
  if (!moves.length) return 0;
  editor.markHistoryStoppingPoint('tidy');
  editor.run(() => editor.updateShapes(moves.map((c) => ({ id: c.id, type: c.type, x: pos[c.id].x, y: pos[c.id].y })) as any));
  return moves.length;
}
