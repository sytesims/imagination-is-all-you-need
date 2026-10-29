/**
 * Does a provider's content-policy refusal cost money? Comfy Router publishes this per model in its catalog as
 * billing.charges_on_policy_rejection = "yes" | "no" | "unknown" (docs.comfy.org/development/comfy-router/billing, "Model billing facts").
 * The catalog needs a key to read, so the models we have checked are listed here; anything else is "unknown" (treat as maybe charged).
 * Shared by the server (the failed run's money sentence) and the web (failure cards), so both say the same thing.
 */
export type PolicyCharge = 'yes' | 'no' | 'unknown';

/** Router models whose catalog entry says charges_on_policy_rejection = "no" (checked 2026-10: the Seedance family on BytePlus). */
const NOT_CHARGED: RegExp[] = [/seedance/i];

/** The Router model a job ran on: its route ("router:router-seedance"), else its provider id for list items that carry no route. */
function routerModelOf(j: { route?: string | null; provider?: string | null; routeAttempts?: { routeId?: string }[] | null } | null | undefined): string | null {
  if (!j) return null;
  const route = String(j.route ?? (Array.isArray(j.routeAttempts) ? j.routeAttempts.at(-1)?.routeId ?? '' : '') ?? '');
  if (route) return route.startsWith('router:') ? route.slice(7) : null;
  const p = String(j.provider ?? ''); return p.startsWith('router-') ? p : null;
}

/** charges_on_policy_rejection for the model this job ran on ("unknown" when it didn't run on Comfy Router or the model isn't checked). */
export function policyRefusalCharge(j: Parameters<typeof routerModelOf>[0]): PolicyCharge {
  const m = routerModelOf(j); if (!m) return 'unknown';
  return NOT_CHARGED.some((re) => re.test(m)) ? 'no' : 'unknown';
}
