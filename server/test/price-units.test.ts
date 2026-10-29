// Price units (Image QA #7, 2026-10-23): ONE price text for a run everywhere (web/src/shared/billing.ts runPrice / priceToken / optionPrice).
// Prices in dollars only (2026-10-26): own accounts '≈ $0.08' on every place (Comfy's own credits are the hover's detail line, never in
// the token), 'Free · on your computer' locally, 'Sample' for a sample run; team mode '$0.08' (the ledger amount, exact). Never ✦, never "credits".
// The resolution / quality menus (optionPrice), the place rows (listPrice) and the Generate button (priceToken) agree for the same run.
// Run: npx tsx test/price-units.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { priceToken, runPrice, optionPrice, placeOfQuote, usdPrice, costShort, costTitle, jobCostText, comfyCr, type Cost } from '../../web/src/shared/billing.ts';
import { listPrice } from '../../web/src/shared/models.ts';
import { priceText } from '../../web/src/shared/queueActivity.ts';
import { chargeOf, REASONS } from '../../web/src/shared/failureReasons.ts';
import { shownNote } from '../../web/src/shared/creditsBack.ts';
import { COMFY_CREDITS_PER_USD } from '../src/shared/hostedPrices.ts';
const ok = (m: string) => console.log('ok ' + m);

/** The cost object the server puts on a quote (server/src/billing.ts costOf): estUsd = credits / 100, Comfy units at 211 per USD. */
const cost = (billedTo: string, credits: number, name = billedTo): Cost => ({ billedTo, billedToName: name, estUsd: credits / 100, ...(billedTo === 'comfy' ? { estUnits: Math.ceil(Math.round((credits / 100) * COMFY_CREDITS_PER_USD * 100) / 100) /* server billing.ts comfyUnits: rounded UP (2026-10-24) */, unitLabel: 'Comfy credits' } : {}),
  failureRule: 'may-charge', failureNote: '', estimated: true, demo: false, realRunUsd: billedTo === 'local' ? 0 : credits / 100, actualReported: false });
const comfyQ = { credits: 8, runOn: 'comfy-cloud', routeKind: 'comfy-router', cost: cost('comfy', 8, 'Comfy') };
const falQ = { credits: 42, runOn: 'fal', routeKind: 'fal', cost: cost('fal', 42, 'fal') };
const directQ = { credits: 42, routeId: 'direct:bfl-flux-2-pro', routeKind: 'direct', cost: cost('bfl', 42, 'Black Forest Labs') };
const localQ = { credits: 0, runOn: 'local', routeKind: 'local', cost: cost('local', 0, 'Local') };

// 1. Own accounts: the Generate button's token.
assert.equal(comfyCr(0.08, COMFY_CREDITS_PER_USD), 17); assert.equal(comfyCr(0.01, COMFY_CREDITS_PER_USD), 3, '2.11 → 3: rounded up, never below the bill'); assert.equal(comfyCr(17 / COMFY_CREDITS_PER_USD, COMFY_CREDITS_PER_USD), 17, 'a whole figure stays whole');
assert.equal(priceToken({ q: comfyQ, own: true, credits: 8 }), '≈ $0.08');
assert.equal(priceToken({ q: falQ, own: true, credits: 42 }), '≈ $0.42');
assert.equal(priceToken({ q: directQ, own: true, credits: 42 }), '≈ $0.42', 'a direct lab API (BFL credits are not shown on the button)');
assert.equal(priceToken({ q: localQ, own: true, credits: 0 }), 'Free · on your computer');
assert.equal(priceToken({ q: comfyQ, own: true, demo: true, credits: 0 }), 'Sample');
ok('own accounts: "≈ $0.08" on Comfy, fal and a direct API, "Free · this computer" locally, "Sample" for a sample');

// 2. Team mode: the ledger amount in dollars (exact, no ≈), everywhere.
assert.equal(priceToken({ q: comfyQ, own: false, credits: 8 }), '$0.08');
assert.equal(runPrice({ own: false, credits: 8, runOn: 'comfy-cloud' }), '$0.08');
assert.equal(listPrice(8, 'fal', false), '$0.08');
assert.equal(optionPrice({ ...comfyQ, billingMode: 'team' }, false, 8), '$0.08');
assert.equal(priceText({ free: false, usd: 0.08, credits: 8, estimated: true, sample: false } as any, false, 'comfy-cloud'), '$0.08');
assert.equal(runPrice({ own: false, credits: 1234, runOn: 'fal' }), '$12.34');
ok('team mode: "$0.08" on the button, the place rows, the menus and the queue');

// 3. The menus, rows and queue agree with the Generate button for the same run (own accounts).
for (const [q, c] of [[comfyQ, 8], [falQ, 42], [directQ, 42]] as const) {
  const btn = priceToken({ q, own: true, credits: c });
  assert.equal(optionPrice(q, true, c), btn, `resolution / quality menu = Generate (${placeOfQuote(q)})`);
  assert.equal(runPrice({ own: true, credits: c, runOn: placeOfQuote(q) }), btn, `runPrice = Generate (${placeOfQuote(q)})`);
  assert.equal(priceToken({ q: { runOn: placeOfQuote(q) }, own: true, credits: c }), btn, 'without a cost object (Recreate, older quotes) the same text');
  assert.equal(priceText({ free: false, usd: c / 100, credits: c, estimated: true, sample: false } as any, true, placeOfQuote(q)), btn, 'queue activity = Generate');
}
assert.equal(listPrice(8, 'comfy-cloud', true), '≈ $0.08'); assert.equal(listPrice(42, 'fal', true), '≈ $0.42');
assert.equal(listPrice(42, 'fal', null), '≈ $0.42', 'billing still loading: dollars');
for (const credits of [1, 3, 8, 12, 18, 64, 120, 253, 1999]) { const q = { credits, runOn: 'comfy-cloud', cost: cost('comfy', credits, 'Comfy') };
  assert.equal(optionPrice(q, true, credits), priceToken({ q, own: true, credits }), `Comfy ${credits} credits`); }
ok('resolution menu, place rows, Recreate and queue read exactly like the Generate button for the same run (Comfy, fal, direct)');

// 4. Places, long forms and job costs.
assert.equal(placeOfQuote({ routeKind: 'comfy-router' }), 'comfy-cloud'); assert.equal(placeOfQuote({ routeId: 'local:comfy-x' }), 'local');
assert.equal(placeOfQuote({ cost: { billedTo: 'comfy' } }), 'comfy-cloud'); assert.equal(placeOfQuote({ runOn: 'replicate' }), 'replicate'); assert.equal(placeOfQuote(null), null);
assert.equal(costShort(comfyQ.cost), '≈ $0.08 on Comfy'); assert.match(costTitle(comfyQ.cost), /about \$0\.08; .*\(17 Comfy credits\)/);
assert.equal(jobCostText(8, 'comfy-cloud'), '≈ $0.08'); assert.equal(jobCostText(42), '≈ $0.42');
assert.equal(runPrice({ own: true, credits: 0, runOn: 'fal' }), 'Free'); assert.equal(runPrice({ own: true, credits: null, runOn: 'fal' }), null);
ok('placeOfQuote, tooltips with "(17 Comfy credits)", job cost text');

// 5. Never ✦ or "credits" in a price (both modes), and the failed-run money line in dollars.
for (const s of [usdPrice(0.08, { approx: true }), runPrice({ own: false, credits: 8 }), runPrice({ own: true, credits: 8, runOn: 'comfy-cloud' }), runPrice({ own: null, credits: 8 }), listPrice(8, 'comfy-cloud', true), jobCostText(8, 'comfy-cloud')])
  assert.ok(!String(s).includes('✦') && !/credit|Comfy cr/i.test(String(s)), s ?? '');
const back = { creditsBack: { credits: 12 }, route: 'comfy-router:x', runOn: 'comfy-cloud' };
assert.equal(chargeOf(back, REASONS.provider_error, { ownAccounts: true, providerRule: 'may-charge', providerName: 'Comfy' }), 'Comfy may still bill your account.');
assert.equal(chargeOf(back, REASONS.provider_error, { ownAccounts: false, providerRule: null, providerName: null }), '$0.12 went back to your balance.', 'team mode: a balance amount, in dollars');
assert.equal(chargeOf(back, REASONS.provider_error, { ownAccounts: null, providerRule: null, providerName: null }), '', 'mode loading: nothing rather than a line that flips');
ok('no ✦ or credits in prices; team mode says "$0.12 went back to your balance."');

// 6. The server's per-route note ("…; ✦5 went back to your balance, trying the next route."): own accounts drop that part, team mode shows it in dollars.
{ const w = 'Comfy Cloud failed (timeout); ✦5 went back to your balance, trying the next route.';
  assert.equal(shownNote(w, true), 'Comfy Cloud failed (timeout); trying the next route.'); assert.equal(shownNote(w, false), 'Comfy Cloud failed (timeout); $0.05 went back to your balance, trying the next route.');
  ok('route notes: no ✦ in own accounts, dollars in team mode'); }
