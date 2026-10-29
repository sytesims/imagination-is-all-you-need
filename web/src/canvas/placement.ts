/** Where a new node lands (the middle of the view, or the nearest free place beside it) and how to bring it on screen. */
import type { Editor, TLShapeId, VecLike } from 'tldraw';

export function freeSpot(editor: Editor, w: number, h: number, near?: VecLike): VecLike {
  const vc = near ?? editor.getViewportPageBounds().center; const shapes = editor.getCurrentPageShapes().filter(s => s.type !== 'arrow' && !(near && s.type === 'frame')).map(s => editor.getShapePageBounds(s.id)).filter(Boolean) as { minX: number; minY: number; maxX: number; maxY: number }[];
  const hits = (x: number, y: number) => shapes.some(b => x - w / 2 - 24 < b.maxX && x + w / 2 + 24 > b.minX && y - h / 2 - 24 < b.maxY && y + h / 2 + 24 > b.minY);
  for (let r = 0; r < 12; r++) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const x = vc.x + dx * r * (w / 2 + 40), y = vc.y + dy * r * (h / 2 + 40); if (!hits(x, y)) return { x, y }; }
  return vc;
}
/** Bring a shape into view when it landed off screen. */
export function reveal(editor: Editor, id: TLShapeId) {
  const b = editor.getShapePageBounds(id); const vb = editor.getViewportPageBounds(); if (!b || vb.contains(b)) return;
  const all = editor.getSelectionPageBounds(); editor.centerOnPoint((all ?? b).center, { animation: { duration: 260 } });
}
