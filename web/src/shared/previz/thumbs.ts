/**
 * Scene thumbnails for the scene picker (shared/SceneGrid.tsx), 2026-10-25. Our presets are drawn in the browser, so their thumbnails are too:
 * the live Direct a Shot engine draws each preset once at a small size (PrevizPlayer's snapshot, one task, so nothing flashes on screen) and the
 * JPEGs are kept in this browser (localStorage, a convenience: without it the cards show their colour tile). Later scene kinds (3D sets,
 * characters) bring their own thumbnail URL and never come through here.
 */
import { useEffect, useState } from 'react';
import { PREVIZ_TEMPLATES, defaultPlanShot, type PlanShot, type PrevizTemplateId } from '../../../../server/src/shared/previzTemplates';

/** bump when the engine's look changes, so old thumbnails are drawn again */
const VERSION = 'v2'; /* v2 (2026-10-26): the brand look and the kit pieces */
const KEY = (id: string) => `ohf:scene-thumb:${VERSION}:${id}`;
export const THUMB_W = 384, THUMB_H = 216;
const mem = new Map<string, string>(); const subs = new Set<() => void>();

/** presets with a shipped picture (the open city is too big to draw just for a thumbnail) */
const STATIC: Record<string, string> = { 'open-city': '/models/open-city/thumb-day.jpg', 'open-city-golden': '/models/open-city/thumb-golden.jpg', 'open-city-night': '/models/open-city/thumb-night.jpg' };
export function sceneThumb(id: string): string | null {
  if (STATIC[id]) return STATIC[id];
  if (mem.has(id)) return mem.get(id)!;
  try { const v = localStorage.getItem(KEY(id)); if (v) { mem.set(id, v); return v; } } catch { /* private window */ }
  return null;
}
export function saveSceneThumbs(rows: { id: string; url: string }[]) {
  for (const r of rows) { mem.set(r.id, r.url); try { localStorage.setItem(KEY(r.id), r.url); } catch { /* full or private: kept for this visit */ } }
  subs.forEach((f) => f());
}
/** the presets that still need a thumbnail, as the shot to draw (16:9, the preset's own defaults, a moment a little before the middle) */
export function missingThumbShots(): { id: PrevizTemplateId; shot: PlanShot; t: number }[] {
  return PREVIZ_TEMPLATES.filter((t) => !sceneThumb(t.id)).map((t) => { const shot = { ...defaultPlanShot(t.id), aspect: '16:9' as const }; return { id: t.id, shot, t: Math.round(shot.seconds * 0.42 * 24) / 24 }; });
}
/** re-renders when a thumbnail lands */
export function useSceneThumbs(): (id: string) => string | null {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return sceneThumb;
}
