/**
 * quote/compute, the route step (plan §3.5): a route's add-ons. A route names its add-ons by id (RouteDef.addOns); the add-on itself (its extra
 * credits for this job, and its own line in the quote breakdown) is registered here by the plugin that owns it (ctx.pricing.addOn):
 *  - charswap-anchor (plugin place-comfy-cloud): H3 Character Swap's first frame, GPT Image 2.5 on Comfy Router (comfy/h3CharSwapAnchor.ts);
 *  - soul-cloud-upscale (plugin studio-image): OpenSoul's cloud upscale on fal (tools/soul/cloud.ts).
 * The route price (routing/select.ts routeCredits) adds the credits, so the quote and the charge stay the same number; the quote answer
 * (routing/http.ts) shows the line. An add-on whose plugin is off adds nothing.
 * No imports, so the routing and the modules that define an add-on can read it without import cycles. Without a boot (scripts and tests that
 * price routes directly) every built-in add-on is on, as in the desktop profile.
 */
export interface RouteAddOn {
  id: string;
  /** Extra credits for this job (0 = not used for this job). */
  credits(input: Record<string, any>): number;
  /** Its own line in the quote breakdown (null = none for this job). */
  line?(input: Record<string, any>): string | null;
}
const on = new Map<string, RouteAddOn>();
const builtIn = new Map<string, RouteAddOn>();
let managed = false;
/** boot.ts mounted ctx.pricing: only add-ons the profile's plugins registered count. */
export const manageAddOns = () => { managed = true; };
/** The module that defines an add-on offers it for unbooted code. */
export const builtInAddOn = (a: RouteAddOn) => { builtIn.set(a.id, a); };
/** A plugin registers an add-on while it is loaded; returns the undo. */
export const addOnOn = (a: RouteAddOn) => { on.set(a.id, a); return () => { if (on.get(a.id) === a) on.delete(a.id); }; };
const find = (id: string) => on.get(id) ?? (managed ? undefined : builtIn.get(id));
/** The route's add-ons that are on. */
export const addOnsOf = (r: { addOns?: readonly string[] } | null | undefined): RouteAddOn[] => (r?.addOns ?? []).map(find).filter((a): a is RouteAddOn => !!a);
/** Extra credits the route's add-ons put on this job (the same number on the quote and the charge). */
export const addOnCredits = (r: { addOns?: readonly string[] } | null | undefined, input: Record<string, any>) => addOnsOf(r).reduce((s, a) => s + (a.credits(input) || 0), 0);
/** The add-ons' breakdown line for this job (the first one that has a line), or null. */
export const addOnLine = (r: { addOns?: readonly string[] } | null | undefined, input: Record<string, any>): string | null => { for (const a of addOnsOf(r)) { const l = a.line?.(input); if (l) return l; } return null; };
