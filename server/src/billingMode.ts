/**
 * Billing mode (decision 2026-10-21, "real costs, not a fake balance"). Kept tiny (db + env only) so ledger.ts can read it without import cycles.
 *  - 'own-accounts' (default): no money flows through the app. Local runs are free, Comfy Cloud bills the user's Comfy account, API providers
 *    bill the user's own accounts. The credit ledger is not charged or refunded; every job is written to the spend log instead (billing.ts).
 *  - 'team': an operator pays the providers and gives users credit balances. The existing ledger (grant, charge, refund) works exactly as before.
 * Stored in kv 'billing.settings' (PUT /api/settings/billing). OPENHIGGSFIELD_BILLING_MODE=team|own-accounts pins it (the endpoint then refuses to change it).
 */
import { getKv, setKv } from './db.js';
import { env } from './env.js';
export type BillingMode = 'own-accounts' | 'team';
/** The user's Comfy plan (Settings → Connections → Your plans; shared/priceText.ts COMFY_PLANS). null = not picked. Shown in price details only. */
export type ComfyPlanSetting = 'standard' | 'creator' | 'pro' | 'payg' | null;
/** Spending limits were removed (user decision 2026-10-28: users control spend by how much they top up). A `limits` key saved by an older
 *  version stays in the kv row untouched and is never read. */
export interface BillingSettings { mode: BillingMode; comfyPlan: ComfyPlanSetting }
const KV = 'billing.settings';
const envMode = (): BillingMode | null => { const v = (env('BILLING_MODE') ?? '').trim().toLowerCase(); return v === 'team' ? 'team' : v === 'own-accounts' || v === 'own' ? 'own-accounts' : null; };
export const modeLocked = () => envMode() != null;
export function billingSettings(): BillingSettings {
  const s = getKv<Partial<BillingSettings>>(KV, {}) ?? {};
  const plan = s.comfyPlan; return { mode: envMode() ?? (s.mode === 'team' ? 'team' : 'own-accounts'), comfyPlan: plan === 'standard' || plan === 'creator' || plan === 'pro' || plan === 'payg' ? plan : null };
}
export const billingMode = (): BillingMode => billingSettings().mode;
export const teamMode = () => billingMode() === 'team';
export function saveBillingSettings(next: Omit<BillingSettings, 'comfyPlan'> & { comfyPlan?: ComfyPlanSetting }) { const cur = getKv<Partial<BillingSettings>>(KV, {}) ?? {}; setKv(KV, { ...cur, mode: next.mode, ...(next.comfyPlan !== undefined ? { comfyPlan: next.comfyPlan } : {}) }); return billingSettings(); }
export const comfyPlanSetting = (): ComfyPlanSetting => billingSettings().comfyPlan;
