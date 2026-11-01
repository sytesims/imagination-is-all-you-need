/**
 * Other providers, hidden while Comfy covers them (user, 2026-10-27: "about the other providers like fal, replicate etc, … if there is nothing that
 * they offer that comfy cloud and router can't, then let's just hide them for now").
 *
 * A model's place on fal, Replicate or a lab's own API (BFL, MiniMax, LTX, OpenAI, Google, BytePlus, Alibaba, Luma) is left out of the model menus,
 * Run on and the cards when the same model runs on Comfy (Comfy Cloud or Comfy Router) or on your computer. Hide, never delete:
 *  - routing is untouched: a saved choice, an old job's Recreate and the API still run on that place, and saved keys keep working;
 *  - a place stays shown when it is the ONLY way to get the model, when it does something the Comfy place can't (KEEP below), when the user
 *    chose it for this tool, or when it is the place a run would pick with no choice made (the user's own key, or a sample there), so the
 *    menu and the quote always agree;
 *  - Settings → Routing → Show other providers (global.showOtherProviders) shows every place again.
 * This table is the source of truth for what is hidden and why.
 */
import { getPrefs } from './prefs.js';

/** Direct places (run-on ids) that stay visible for a model because they offer something its Comfy place can't. model key → run-on → why. */
export const KEEP_PLACES: Record<string, Record<string, string>> = {
  'flux-3-video': { bfl: '1440p and 4K, and Draft, run on the BFL API only (Comfy Router makes 720p / 1080p)' },
  'ltx-2.5-pro': { ltx: '1440p, 4K and the 1:1 / 3:2 / 2:3 shapes run on the LTX API only (Comfy makes 720p / 1080p at 16:9 or 9:16)' },
  'ltx-2.5-fast': { ltx: 'Text to video on LTX-2.5 Fast runs on the LTX API only (its Comfy place takes images)' },
  'ideogram-4.5': { fal: 'Brush Edit with a mask runs on fal only (the Router schema takes no mask)' },
  'grok-imagine-image': { fal: 'Photo edits run on fal only (the Router schema takes no image)' },
  'kling-image-o1': { fal: 'Edits with 5–10 photos run on fal only (Comfy Router takes up to 4)' },
  'luma-image': { fal: 'Edits that keep your photo’s shape run on fal only' },
  'luma-uni-1-max': { fal: 'Edits that keep your photo’s shape run on fal only' },
};
export const DIRECT_RUN_ONS = new Set(['fal', 'replicate', 'bfl', 'minimax', 'ltx', 'openai', 'google', 'byteplus', 'dashscope', 'luma', 'direct']);
// a place covers others only when it could run the job: never a coming-soon / unavailable place, nor your computer while Use local is off
// (2026-11-01: an off GPU hid the fal place the quote ran on)
const COVERS = (r: { id: string; status: string }) => (r.id === 'comfy-cloud' || r.id === 'local') && r.status !== 'coming-soon' && r.status !== 'unavailable' && !(r.id === 'local' && r.status === 'off');
export const showOtherProviders = () => getPrefs().global.showOtherProviders === true;

/** The run-on rows a model shows on a tool, and the ones hidden from it (with the place that covers them). */
export function visiblePlaces<T extends { id: string; status: string }>(toolId: string, modelKey: string, runsOn: T[], show = showOtherProviders(), picked: string | null = null): { shown: T[]; hidden: { id: string; coveredBy: string }[] } {
  if (show) return { shown: runsOn, hidden: [] };
  const cover = runsOn.filter(COVERS); if (!cover.length) return { shown: runsOn, hidden: [] };
  const pin = getPrefs().perTool?.[toolId]?.[modelKey]?.runOn;
  const hidden: { id: string; coveredBy: string }[] = [];
  const shown = runsOn.filter((r) => { if (!DIRECT_RUN_ONS.has(r.id)) return true;
    if (KEEP_PLACES[modelKey]?.[r.id] || r.id === pin || r.id === picked) return true; // picked: the place a run would use with no choice (menu = quote)
    hidden.push({ id: r.id, coveredBy: cover[0].id }); return false; });
  return { shown, hidden };
}
