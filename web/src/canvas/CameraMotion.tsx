/**
 * Smooth camera on big boards (2026-10-30; replaces the 10-27 "lighter cards while moving", whose shadows and glows popping off and
 * back on at every move read as flicker). Cards keep their one look at every zoom; the board's container wears two classes:
 *  - `cv-far` under FAR_ZOOM: cards drop their soft drop shadow, backdrop blur and looping animations. At that size none of them
 *    shows, and every zoom step no longer repaints dozens of large blurred shadows.
 *  - `cv-tiny` under TINY_ZOOM: cards and what is in them draw square corners (rounded ones are 4 px or less by then); drawing
 *    every card and picture with rounded corners halved the frame rate on a full board.
 * Set from a store listener when the zoom crosses a line: no React state, nothing re-renders per frame. The styles are in node.css.
 */
import { useEffect } from 'react';
import { useEditor } from 'tldraw';
import { FAR_ZOOM, TINY_ZOOM } from './cardLook';

/** Dev and measuring only: <html class="cv-perf-off"> turns the speed-ups off, so before / after can be measured in the same build. */
export const perfOff = () => typeof document !== 'undefined' && document.documentElement.classList.contains('cv-perf-off');
export function CameraMotion() {
  const editor = useEditor();
  useEffect(() => {
    const root = editor.getContainer();
    /* write a class only when it flips (a no-op toggle still counts as a DOM change on every camera step) */
    const set = (cls: string, on: boolean) => { if (root.classList.contains(cls) !== on) root.classList.toggle(cls, on); };
    const sync = () => { const z = perfOff() ? 1 : editor.getZoomLevel(); set('cv-far', z < FAR_ZOOM); set('cv-tiny', z < TINY_ZOOM); };
    sync(); const off = editor.store.listen(sync, { scope: 'session' });
    return () => { off(); root.classList.remove('cv-far', 'cv-tiny'); };
  }, [editor]);
  return null;
}
