/** Where a new node lands (the middle of the view, or the nearest free place beside it) and how to bring it on screen. */
import { rectContains, type BoardApi, type NodeId, type Point } from './boardApi';

export function freeSpot(board: BoardApi, w: number, h: number, near?: Point): Point {
  const vc = near ?? board.viewportBounds().center; const shapes = board.nodes().filter(s => !(near && s.type === 'frame')).map(s => board.boundsOf(s.id)).filter(Boolean) as { minX: number; minY: number; maxX: number; maxY: number }[];
  const hits = (x: number, y: number) => shapes.some(b => x - w / 2 - 24 < b.maxX && x + w / 2 + 24 > b.minX && y - h / 2 - 24 < b.maxY && y + h / 2 + 24 > b.minY);
  for (let r = 0; r < 12; r++) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const x = vc.x + dx * r * (w / 2 + 40), y = vc.y + dy * r * (h / 2 + 40); if (!hits(x, y)) return { x, y }; }
  return vc;
}
/** Bring a node into view when it landed off screen. */
export function reveal(board: BoardApi, id: NodeId) {
  const b = board.boundsOf(id); const vb = board.viewportBounds(); if (!b || rectContains(vb, b)) return;
  const all = board.selectionBounds(); board.centerOn((all ?? b).center, { duration: 260 });
}
