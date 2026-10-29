/**
 * Create Image: the settings a model starts on when you pick it (the bar's model-switch rule), as pure functions so the bar
 * (web/src/ui/next/ImageCanvas.tsx) and the model menu's row prices (routing/quotesBatch.ts) can't drift: a row's price is the
 * quote at exactly these settings, which is what Generate shows right after picking that model. Isomorphic, no imports.
 */

/** QA #9: the listed aspect ("16:9", "3:4"…) closest to a photo's real shape (width / height), compared on a log scale so 2:1 and 1:2 are
 *  equally far from 1:1. "Auto" and anything that isn't "w:h" are skipped; null when nothing fits. */
export function closestAspect(aspects: string[], ratio: number | null | undefined): string | null {
  if (!ratio || !isFinite(ratio) || ratio <= 0) return null; let best: string | null = null; let bd = Infinity;
  for (const a of aspects) { const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(a); if (!m) continue; const d = Math.abs(Math.log(Number(m[1]) / Number(m[2]) / ratio)); if (d < bd - 1e-9) { bd = d; best = a; } }
  return best;
}

/** QA #9: the aspect an edit (or a plain run) starts on. With a photo attached: Auto ("Match photo") where the model's edit graph takes it,
 *  else the listed aspect closest to the photo; with no photo, Auto where offered, else the model's default. */
export function defaultAspectFor(o: { aspects: string[]; photoRatio: number | null; editing: boolean; editAllowsAuto: boolean; defaultAspect?: string | null }): string {
  const { aspects } = o; const fixed = aspects.filter(a => a !== 'Auto');
  if (o.editing) { if (o.editAllowsAuto && aspects.includes('Auto')) return 'Auto'; return closestAspect(fixed, o.photoRatio) ?? (o.defaultAspect && fixed.includes(o.defaultAspect) ? o.defaultAspect : fixed[0] ?? 'Auto'); }
  if (aspects.includes('Auto')) return 'Auto'; return o.defaultAspect && fixed.includes(o.defaultAspect) ? o.defaultAspect : fixed[0] ?? 'Auto';
}

/** The parts of a model's image caps (shared/imageCaps.ts ImageCaps, as GET /api/tools sends them) the bar reads. */
export interface SnapCaps {
  aspects?: string[]; allowAuto?: boolean; defaultAspect?: string | null; qualityTiers?: string[]; defaultTier?: string | null;
  /** The model's own tier words (Krea 3 thinking modes): another model's tier pick isn't carried over. tierNeedsRes: tiers offered at some sizes only. */
  tierNames?: Record<string, unknown> | null; tierNeedsRes?: Record<string, string[] | undefined> | null;
  resolutions?: string[]; defaultResolution?: string | null; maxBatch?: number;
  edit?: { aspects: string[]; allowAuto: boolean; resolutions: string[]; note?: string } | null;
}
/** Fallback aspect list for a model with no caps (the bar's ASPECTS minus Auto). */
const ALL = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];
/** The shapes the route that runs the job takes, when it takes fewer than the model (route caps, GET /api/tools routes[].caps): aspects [] = only
 *  Auto / Match photo; allowAuto false = no Auto there; modes = the modes this narrowing applies to (an edit-only route narrows edits only). */
export interface RouteShapes { aspects?: string[] | null; allowAuto?: boolean; aspectModes?: string[] | null }
/** What the bar offers for a model: its edit caps when a photo is attached without a mask, the aspect / quality / resolution choices
 *  (route resolutions first, narrowed to the edit's; the model's shapes narrowed to the route's) and the most images per run. */
export function imageChoices(caps: SnapCaps | null | undefined, o: { editing: boolean; routeResolutions?: string[] | null; routeShapes?: RouteShapes | null }) {
  const c = caps ?? {}; const ed = o.editing && c.edit ? c.edit : null;
  const own: string[] = ed ? [...(ed.allowAuto ? ['Auto'] : []), ...ed.aspects] : [...(c.allowAuto !== false ? ['Auto'] : []), ...(c.aspects ?? ALL)];
  const rs = o.routeShapes; const narrows = !!rs && Array.isArray(rs.aspects) && (!rs.aspectModes?.length || rs.aspectModes.includes(o.editing ? 'edit' : 'generate'));
  const aspects: string[] = narrows ? own.filter(a => (a === 'Auto' ? rs!.allowAuto !== false : rs!.aspects!.includes(a))) : own;
  const tiers: string[] = c.qualityTiers ?? [];
  const resList: string[] = ((o.routeResolutions ?? c.resolutions ?? []) as string[]).filter(r => !ed || ed.resolutions.includes(r));
  return { ed, aspects, tiers, resList, maxN: Number(c.maxBatch ?? 4) || 1 };
}
/** 2026-10-25: a picked shape the new model doesn't list by name is carried over by shape: the same shape under the model's own name
 *  (Runway's pixel ratios: 16:9 → 1920:1080, 1:1 → 1024:1024, and back), else, on a model with no Auto and no photo, the nearest of its
 *  shapes (21:9 → 2112:912), so a switch keeps the picture's shape instead of jumping to the default. null = no picked shape to carry. */
export function carriedAspect(aspects: string[], cur: string | undefined, editing: boolean): string | null {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(cur ?? ''); if (!m) return null; const r = Number(m[1]) / Number(m[2]); const near = closestAspect(aspects, r);
  if (near) { const n = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(near)!; if (Math.abs(Number(n[1]) / Number(n[2]) / r - 1) <= 0.01) return near; }
  return !editing && !aspects.includes('Auto') ? near : null;
}
/** The settings the bar switches to when this model is picked: the start aspect (Auto / Match photo where offered, else the default or the
 *  aspect closest to the photo), the model's default quality tier and resolution, and the image count capped at its batch size. */
export function settingsOnSwitch(caps: SnapCaps | null | undefined, o: { editing: boolean; routeResolutions?: string[] | null; routeShapes?: RouteShapes | null; photoRatio?: number | null; n: number;
  /** The user's current picks: each is kept when the new model supports it; only unsupported ones change (user, 2026-10-23). */ cur?: { aspect?: string; quality?: string; imageResolution?: string } }) {
  const ch = imageChoices(caps, o); const c = caps ?? {}; const cur = o.cur ?? {};
  const imageResolution = cur.imageResolution && ch.resList.includes(cur.imageResolution) ? cur.imageResolution : c.defaultResolution && ch.resList.includes(c.defaultResolution) ? c.defaultResolution : ch.resList[0] ?? '';
  const fits = (t: string) => { const need = c.tierNeedsRes?.[t]; return !need || need.includes(imageResolution); };
  return {
    ...ch,
    aspect: cur.aspect && ch.aspects.includes(cur.aspect) ? cur.aspect : carriedAspect(ch.aspects, cur.aspect, o.editing) ?? defaultAspectFor({ aspects: ch.aspects, photoRatio: o.photoRatio ?? null, editing: o.editing, editAllowsAuto: !!ch.ed?.allowAuto, defaultAspect: c.defaultAspect }),
    quality: cur.quality && ch.tiers.includes(cur.quality) && !c.tierNames && fits(cur.quality) ? cur.quality : c.defaultTier ?? ch.tiers[0] ?? '',
    imageResolution,
    n: Math.min(Math.max(1, Number(o.n) || 1), ch.maxN),
  };
}
/** The quote params the bar sends after switching to this model (aspect / quality / imageResolution only where the bar shows that chip),
 *  over the page's current params (refs, mode, prompt… stay). Pure: used by the model menu's batch quote. */
export function paramsOnSwitch(caps: SnapCaps | null | undefined, cur: Record<string, string>, o: { routeResolutions?: string[] | null; routeShapes?: RouteShapes | null; photoRatio?: number | null } = {}): Record<string, string> {
  const editing = cur.mode === 'edit'; const s = settingsOnSwitch(caps, { editing, routeResolutions: o.routeResolutions, routeShapes: o.routeShapes, photoRatio: o.photoRatio, n: Number(cur.n ?? cur.count ?? 1),
    cur: { aspect: cur.aspect === 'auto' ? 'Auto' : cur.aspect, quality: cur.quality, imageResolution: cur.imageResolution } });
  const out: Record<string, string> = { ...cur }; delete out.aspect; delete out.quality; delete out.imageResolution; delete out.count;
  if (s.aspects.length) out.aspect = s.aspect === 'Auto' ? 'auto' : s.aspect;
  if (s.tiers.length && s.quality) out.quality = s.quality;
  if (s.resList.length && s.imageResolution) out.imageResolution = s.imageResolution;
  out.n = String(s.n);
  return out;
}
/** A long aspect list (more than 8 shapes) laid out for the aspect popovers: Auto and squares on top, then a Wide | Tall pair of columns, each
 *  nearest to square first, a wide shape beside its tall twin (16:9 | 9:16); a shape with no twin gets an empty cell opposite. null = short list. */
export function groupAspects<T>(opts: T[], isAuto: (o: T) => boolean, ratio: (o: T) => number): { top: T[]; pairs: [T | null, T | null][] } | null {
  if (opts.length <= 8) return null; const sq = (o: T) => isAuto(o) || Math.abs(Math.log(ratio(o))) < 0.02;
  const top = opts.filter(sq); const wide = opts.filter(o => !sq(o) && ratio(o) > 1).sort((a, b) => ratio(a) - ratio(b)); const tall = opts.filter(o => !sq(o) && ratio(o) < 1).sort((a, b) => ratio(b) - ratio(a));
  // twins: the closest wide / tall mirror pairs first (Runway's 1440:1080 pairs with 1080:1440, not with the near-identical 1168:880)
  const err = (w: T, t: T) => Math.abs(Math.log(ratio(t) * ratio(w))); const twinOf = new Map<T, T>(); const used = new Set<T>();
  for (const [w, t] of wide.flatMap(w => tall.map(t => [w, t] as [T, T])).filter(([w, t]) => err(w, t) < 0.02).sort((x, y) => err(...x) - err(...y)))
    if (!twinOf.has(w) && !used.has(t)) { twinOf.set(w, t); used.add(t); }
  const pairs: [T | null, T | null][] = wide.map(w => [w, twinOf.get(w) ?? null]);
  for (const t of tall) if (!used.has(t)) { const k = pairs.findIndex(([w, x]) => !x && !!w && ratio(w) >= 1 / ratio(t)); if (k >= 0) pairs[k][1] = t; else pairs.push([null, t]); }
  return { top, pairs };
}
