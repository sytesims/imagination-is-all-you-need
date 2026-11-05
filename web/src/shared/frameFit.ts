/** Where the picture sits inside a box drawn with object-fit: contain (a 9:16 clip in a wide box has black bars at the sides), as fractions of the box.
 *  A click is stored against the picture, not the box, so x / y mean the same spot on the frame the server cuts (and the dot is drawn back the same way). */
export function contentRect(boxW: number, boxH: number, vw: number, vh: number): { l: number; t: number; w: number; h: number } {
  if (!(boxW > 0 && boxH > 0 && vw > 0 && vh > 0)) return { l: 0, t: 0, w: 1, h: 1 };
  const s = Math.min(boxW / vw, boxH / vh); const w = (vw * s) / boxW, h = (vh * s) / boxH;
  return { l: (1 - w) / 2, t: (1 - h) / 2, w, h };
}
