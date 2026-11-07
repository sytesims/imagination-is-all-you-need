/**
 * Ctrl / ⌘ + wheel zoom on the React Flow board (2026-11-06, Canvas release 1). React Flow's own wheel zoom jumped a whole step per mouse
 * notch; ours follows one smooth curve for a mouse wheel and a trackpad pinch (the browser sends a pinch as a wheel with ctrlKey):
 *   factor = exp(-deltaY × 0.0015), deltaY in pixels (deltaMode lines × 16, pages × the board's height), clamped per event,
 * and the point under the pointer stays where it is. Pure: RfBoard.tsx reads the event and sets the camera.
 */

/** How strongly one pixel of wheel travel zooms. */
export const ZOOM_SPEED = 0.0015;
/** The most one event may zoom in or out (a fast mouse flick, or a page-sized delta). */
export const ZOOM_STEP_MAX = 1.6;
const LINE_PX = 16;

/** A wheel delta in pixels, whatever unit the browser used (0 = pixels, 1 = lines, 2 = pages). */
export function wheelPixels(deltaY: number, deltaMode: number, pageHeight = 800): number {
  if (!Number.isFinite(deltaY)) return 0;
  return deltaMode === 1 ? deltaY * LINE_PX : deltaMode === 2 ? deltaY * pageHeight : deltaY;
}
/** The zoom factor for one wheel event: exp(-px × speed), kept within 1 / ZOOM_STEP_MAX … ZOOM_STEP_MAX. */
export function wheelZoomFactor(deltaY: number, deltaMode: number, pageHeight = 800): number {
  const f = Math.exp(-wheelPixels(deltaY, deltaMode, pageHeight) * ZOOM_SPEED);
  return Math.max(1 / ZOOM_STEP_MAX, Math.min(ZOOM_STEP_MAX, f));
}
/** The camera after zooming by `factor` around a screen point (tldraw's camera: screen = (page + camera) × z), the zoom kept in [min, max]. */
export function zoomAround(cam: { x: number; y: number; z: number }, at: { x: number; y: number }, factor: number, min: number, max: number) {
  const z = Math.max(min, Math.min(max, cam.z * factor)); if (z === cam.z) return cam;
  /* the page point under the pointer before = after */
  const px = at.x / cam.z - cam.x, py = at.y / cam.z - cam.y;
  return { x: at.x / z - px, y: at.y / z - py, z };
}
