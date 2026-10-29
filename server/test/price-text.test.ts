// Dollar-price formatting: the shared formatter (server/src/shared/priceText.ts) and
// the Comfy plan table. Dollars only in what's shown; provider units, plan and price date only in the detail line.
// Run: npx tsx test/price-text.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { usdToken, ledgerUsd, balanceText, costLine, unitsDetail, costDetail, balanceDetail, comfyCreditsFor, COMFY_PLANS, comfyPlanOf, comfyPlanName, onPlanWords, planRateText, isComfyPlanId, LOCAL_FREE } from '../src/shared/priceText.ts';
import { planInReply } from '../src/billing.ts';
const ok = (m: string) => console.log('ok ' + m);

// 1. Tokens, balances, ledger amounts.
assert.equal(usdToken(0.76, { approx: true }), '≈ $0.76'); assert.equal(usdToken(0.76), '$0.76'); assert.equal(usdToken(0.05, { upTo: true }), '≈ up to $0.05');
assert.equal(ledgerUsd(8), '$0.08'); assert.equal(ledgerUsd(1234), '$12.34'); assert.equal(ledgerUsd(null), '—');
assert.equal(balanceText(5.72, 'Comfy'), '$5.72 left on Comfy'); assert.equal(balanceText(5.72), '$5.72 left');
assert.equal(LOCAL_FREE, 'Free · on your computer');
ok('"≈ $0.76", "$12.34" (ledger 1234), "$5.72 left on Comfy", "Free · this computer"');

// 2. After a run: actual when the provider reported it, else the quote marked estimate.
assert.equal(costLine({ actualUsd: 0.75, quotedUsd: 0.76 }), 'Cost $0.75 (quoted $0.76)');
assert.equal(costLine({ actualUsd: 0.76, quotedUsd: 0.76 }), 'Cost $0.76', 'same figure: said once');
assert.equal(costLine({ actualUsd: null, quotedUsd: 0.76 }), 'Cost ≈ $0.76 (estimate)');
assert.equal(costLine({ local: true, quotedUsd: 0 }), 'Free · on your computer');
assert.equal(costLine({ sample: true, quotedUsd: 0.76 }), 'Sample · nothing billed');
assert.equal(costLine({}), null);
ok('"Cost $0.75 (quoted $0.76)", "Cost ≈ $0.76 (estimate)", local and sample words');

// 3. The detail line (hover only).
assert.equal(unitsDetail({ units: 160, unitLabel: 'Comfy credits', plan: 'creator', checkedAt: '2026-10-26' }), '160 Comfy credits · on your Creator plan · price checked 2026-10-26');
assert.equal(unitsDetail({ units: 160, unitLabel: 'Comfy credits', plan: 'payg' }), '160 Comfy credits · pay as you go');
assert.equal(unitsDetail({ units: 42, unitLabel: 'BFL credits', plan: 'creator' }), '42 BFL credits', 'a Comfy plan is never said for another provider');
assert.equal(unitsDetail({}), null);
assert.equal(costDetail({ billedTo: 'local', estUnits: 3, unitLabel: 'x' }), null);
assert.equal(costDetail({ billedTo: 'comfy', estUnits: 17, unitLabel: 'Comfy credits', checkedAt: '2026-10-24' }, 2), '34 Comfy credits · price checked 2026-10-24', 'calls multiply the units');
assert.equal(balanceDetail({ units: 1207.6, unitLabel: 'Comfy credits', plan: 'pro', checked: '5 min ago' }), '1,207 Comfy credits · on your Pro plan · checked 5 min ago');
assert.equal(balanceDetail({ units: 12.4, unitLabel: 'USD' }), null, 'a dollar balance has no units line');
assert.equal(comfyCreditsFor(0.08), 17); assert.equal(comfyCreditsFor(0.01), 3, 'rounded up, never below the bill');
ok('detail: "160 Comfy credits · on your Creator plan · price checked 2026-10-26"');

// 4. Comfy plans: one table, source and date on every row, all about 211 credits per $1.
assert.deepEqual(COMFY_PLANS.map((p) => p.id), ['standard', 'creator', 'pro', 'payg']);
for (const p of COMFY_PLANS) { assert.ok(/^https:\/\//.test(p.sourceUrl) && /^\d{4}-\d{2}-\d{2}$/.test(p.checkedAt), p.id); assert.ok(Math.abs(p.creditsPerUsd - 211) < 2, `${p.id}: ${p.creditsPerUsd} per $1`); }
assert.equal(comfyPlanOf('creator')!.creditsPerMonth, 7400); assert.equal(comfyPlanOf('standard')!.usdPerMonth, 20);
assert.equal(comfyPlanName('creator'), 'Comfy Creator plan'); assert.equal(comfyPlanName('payg'), 'Comfy pay as you go'); assert.equal(comfyPlanName('x'), null);
assert.equal(onPlanWords('pro'), 'on your Pro plan'); assert.equal(isComfyPlanId('pro'), true); assert.equal(isComfyPlanId('team'), false);
assert.equal(planRateText(comfyPlanOf('creator')!), '$35 / month for 7,400 Comfy credits (about 211 per $1)');
ok('plans: Standard $20 / 4,200, Creator $35 / 7,400, Pro $100 / 21,100, pay as you go 211 per $1; each with source and date');

// 5. Plan detection reads only what the balance reply already says (Comfy publishes no plan endpoint); nothing → null (the user picks).
assert.equal(planInReply({ summary: { balance: { amount_micros: 500 } } }), null);
assert.equal(planInReply({ subscription: { tier: 'CREATOR' } }), 'creator');
assert.equal(planInReply({ summary: { plan: { name: 'Pro (yearly)' } } }), 'pro');
assert.equal(planInReply({ plan: 'pay-as-you-go' }), 'payg');
assert.equal(planInReply({ plan: 'production' }), null, 'no partial-word matches');
ok('plan detection: from the reply when named, else null');
console.log('ALL OK price-text');
