/**
 * Smooth panning on big boards (2026-10-27): while the camera moves, the board wears `cv-moving` and every card draws a lighter version
 * (no shadows, blur, glows or running animations; pictures stay as plain bitmaps, text stays), then swaps back ~160 ms after it stops.
 * One class on the container from a store listener: no React state, nothing re-renders per frame. The styles are in node.css.
 */
import { useEffect } from 'react';
import { useEditor } from 'tldraw';

export const MOVING_IDLE_MS = 160;
/** Dev and measuring only: <html class="cv-perf-off"> turns the speed-ups off, so before / after can be measured in the same build. */
export const perfOff = () => typeof document !== 'undefined' && document.documentElement.classList.contains('cv-perf-off');
export function CameraMotion() {
  const editor = useEditor();
  useEffect(() => {
    const root = editor.getContainer(); let t = 0; let last = editor.getCamera();
    const off = editor.store.listen(() => {
      const c = editor.getCamera(); if (c.x === last.x && c.y === last.y && c.z === last.z) return; last = c;
      if (perfOff()) return; if (!root.classList.contains('cv-moving')) root.classList.add('cv-moving');
      window.clearTimeout(t); t = window.setTimeout(() => root.classList.remove('cv-moving'), MOVING_IDLE_MS);
    }, { scope: 'session' });
    return () => { off(); window.clearTimeout(t); root.classList.remove('cv-moving'); };
  }, [editor]);
  return null;
}
