import { useEffect, useState } from 'react';
/** B27: GET /api/posters slots: which preset / style art is still a stand-in (placeholder / needsRealPoster) and whether its loop is real (needsRealLoop).
 *  Fetched once per page load; keyed `${toolId}:${slot}` (slot e.g. 'preset:product', 'style:anime-cel'). */
export type PosterSlot = { toolId: string; slot: string; posterUrl?: string | null; placeholder?: boolean; needsRealPoster?: boolean; standIn?: boolean; loopUrl?: string | null; loopPlaceholder?: boolean; needsRealLoop?: boolean };
let cache: Promise<Record<string, PosterSlot>> | null = null;
const load = () => cache ??= fetch('/api/posters').then(r => r.ok ? r.json() : null).then((d: any) => Object.fromEntries(((d?.slots ?? []) as PosterSlot[]).map(s => [`${s.toolId}:${s.slot}`, s]))).catch(() => { cache = null; return {}; });
export function usePosterSlots(): Record<string, PosterSlot> { const [m, setM] = useState<Record<string, PosterSlot>>({}); useEffect(() => { let live = true; load().then(x => { if (live) setM(x); }); return () => { live = false; }; }, []); return m; }
/** Art that is a stand-in (the server says a real poster or loop is still missing). */
export const isStandIn = (s?: PosterSlot | null): boolean => !!s && (s.placeholder === true || s.needsRealPoster === true || s.standIn === true);
export const PLACEHOLDER_TITLE = 'Stand-in media: this example hasn’t been rendered yet';
/** B28a: a preset's own art fields (loopUrl, loopPlaceholder, needsRealLoop, standIn on /api/tools presets and /api/presets) win;
 *  the /api/posters slot is the fallback when a preset doesn't carry them. `marked` = show the Placeholder marker. */
export function presetArt(p: any, slot?: PosterSlot | null): { loop: string | null; standIn: boolean; needsRealLoop: boolean; marked: boolean } {
  const own = (k: string) => (p && typeof p[k] === 'boolean' ? (p[k] as boolean) : undefined);
  const loop = (typeof p?.loopUrl === 'string' && p.loopUrl) || slot?.loopUrl || p?.previewWebm || p?.previewUrl || null;
  const ownStand = [own('standIn'), own('placeholder'), own('needsRealPoster')].filter(v => v !== undefined);
  const standIn = ownStand.length ? ownStand.some(Boolean) : isStandIn(slot);
  const ownLoop = [own('needsRealLoop'), own('loopPlaceholder')].filter(v => v !== undefined);
  const needsRealLoop = !!loop && (ownLoop.length ? ownLoop.some(Boolean) : slot?.needsRealLoop === true || slot?.loopPlaceholder === true);
  return { loop, standIn, needsRealLoop, marked: standIn || needsRealLoop };
}
