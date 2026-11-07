/**
 * Which money plugins are on (no imports, so billingMode.ts and billing.ts can read it without import cycles).
 * Without a boot (scripts and tests that import the money modules directly) every built-in money plugin counts as on, as in the desktop profile.
 * Once boot.ts mounts the spend service (managed), only the plugins the profile loaded are on.
 */
export type MoneyFeature = 'spend-cap' | 'agent-budgets' | 'billing-team-mode' | 'hosted-grant';
const on = new Set<MoneyFeature>();
let managed = false;
export const manageMoneyFeatures = () => { managed = true; };
/** A plugin turns its feature on while it is loaded; returns the undo. */
export const featureOn = (f: MoneyFeature) => { on.add(f); return () => { on.delete(f); }; };
export const moneyFeature = (f: MoneyFeature): boolean => !managed || on.has(f);
