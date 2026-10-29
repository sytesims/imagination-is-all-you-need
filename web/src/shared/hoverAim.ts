/** The hover-intent aim test (shared/hoverIntent.ts), kept free of React so the server test runner can load it. */
export interface Pt { x: number; y: number }
export interface Box { left: number; top: number; right: number; bottom: number }

/** Is `p` inside the triangle from `apex` (where the pointer left the row) to the card's near edge (the edge facing the apex), with a
 *  few px of slack? A point already over the card counts too. Tested in server/test/hover-intent.test.ts. */
export function inAimTriangle(p: Pt, apex: Pt, card: Box, slack = 4): boolean {
  if (p.x >= card.left && p.x <= card.right && p.y >= card.top && p.y <= card.bottom) return true;
  const ex = apex.x <= card.left ? card.left : apex.x >= card.right ? card.right : null; if (ex == null) return false; // the apex is above / below the card: no corridor
  const a = { x: apex.x + (ex > apex.x ? -slack : slack), y: apex.y }, b = { x: ex, y: card.top - slack }, c = { x: ex, y: card.bottom + slack };
  const s = (p1: Pt, p2: Pt, p3: Pt) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

