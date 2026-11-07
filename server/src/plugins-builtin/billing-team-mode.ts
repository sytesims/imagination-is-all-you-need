/**
 * billing-team-mode: team mode (billingMode.ts): an operator pays the providers and gives users credit balances; the ledger charges each run
 * and gives the credits back when it fails (ledger.ts, unchanged). It hooks the money guard (ctx.spend, stage 'balance'): in team mode a paid
 * run the balance can't cover is refused (402 credits) before anything is queued or charged. In own-accounts mode (the default) the check
 * always admits, as before.
 * Leave it out of the profile and the app is always in own-accounts mode: PUT /api/settings/billing refuses 'team', nothing is charged to an
 * app balance, and this check is gone; the guard itself stays.
 */
import { definePlugin } from '../kernel/index.js';
import type { Admitter } from '../services/spend.js';
import { canAfford, getBalance } from '../ledger.js';

/** spend/admit, stage 'balance': the run's credits fit the balance (team mode only; a free run always goes). */
export const balanceCheck: Admitter = { id: 'billing-team-mode', stage: 'balance', admit(run) {
  if (run.free || canAfford(run.credits)) return;
  const needed = run.credits; const balance = getBalance(); const message = `Not enough credits: needs ${needed}, balance ${balance}.`;
  return { status: 402, code: 'credits', message, needed, balance,
    body: { error: message, errorType: 'credits', code: 'credits', needed, balance, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } } };
} };

export default definePlugin({
  name: 'billing-team-mode', inject: ['spend'],
  apply(ctx) { ctx.spend.feature('billing-team-mode'); ctx.spend.use(balanceCheck); },
});
