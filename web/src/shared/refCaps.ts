/**
 * How many input images a model takes on the place it will run (shared by Create Image's bar and the Canvas bar, 2026-10-24; moved out of
 * ui/next/ImageCanvas.tsx so both read the same rule). The route's own cap wins (Comfy Router: Nano Banana takes 4 there), else the
 * model's registry capability (capabilities.supports.maxRefs). No blanket cap: GPT Image 2 takes 16, Nano Banana Pro / 2.1 take 14 (2026-10-31;
 * it was capped at 10 for every model).
 */
/** The caps of the route a run will use: the picked route (not 'auto'), else the model's default route, else its local route, else the first. */
export function routeCapsOf(provider: any, pickedRoute?: string | null): any {
  const rs: any[] = provider?.routes ?? []; const pinned = !!pickedRoute && pickedRoute !== 'auto'; const want = pinned ? pickedRoute : provider?.defaultRoute;
  const caps = (rs.find(r => r.routeId === want) ?? rs.find(r => r.kind === 'local') ?? rs[0])?.caps ?? {};
  /* 2026-10-25: on Auto, a route that takes no image (Comfy Router's Grok Imagine Image 2.0: prompt only) doesn't hide photos when another route with its key
     set edits (Grok's fal edit route): the bar offers that route's images and the run with a photo goes there. Router only (no such key): no photos. */
  if (!pinned && caps.maxRefs === 0) { const edit = Math.max(0, ...rs.filter(r => r.configured && typeof r.caps?.maxRefs === 'number').map(r => r.caps.maxRefs)); if (edit > 0) return { ...caps, maxRefs: edit }; }
  return caps;
}
/** The most images this model takes in one run (refs + the photo). `supports` = registry capabilities.supports. */
export function maxRefsOf(supports: any, routeCaps: any): number {
  const r: number | null = typeof routeCaps?.maxRefs === 'number' ? routeCaps.maxRefs : null;
  return Math.max(0, Math.floor(r ?? Number(supports?.maxRefs ?? 1)) || 0);
}
