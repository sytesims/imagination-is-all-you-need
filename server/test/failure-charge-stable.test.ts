// QA #11: a failed tile's money sentence must not flip after the first render. The feed first shows the job from the list
// (GET /api/jobs?…: runOn, no route / routeAttempts / spend) and later from GET /api/jobs/:id (route, routeAttempts, spend), and the
// billing store may load after the first render. The sentence for the same job must be the same in every data state, and never a guess:
// while the billing mode is unknown it is empty (nothing shown), never a different sentence.
// Run: npx tsx test/failure-charge-stable.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { failView } from '../../web/src/shared/failureReasons.ts';
const ok = (m: string) => console.log('ok ' + m);
const OWN = { ownAccounts: true, providerRule: 'may-charge' as const, providerName: 'Comfy' };
const LOADING = { ownAccounts: null, providerRule: null, providerName: null };

const base = { status: 'failed', errorType: 'temporary', error: 'Comfy Router failed: Something went wrong (temporary). Try again.', cost: 5, free: false, demo: false, refunded: 0, creditsBack: null, refund: { refunded: false, amount: 0, freeGenReturned: false } };
// 1. A real hosted run (not a sample): list item and full job both say Comfy may still bill.
const realList = { ...base, runOn: 'comfy-cloud', isSample: false };
const realFull = { ...realList, route: 'comfy-router:api-nano-banana-21', routeAttempts: [{ routeId: 'comfy-router:api-nano-banana-21', refunded: 0 }], spend: { simulated: false } };
const a = failView(realList as any, OWN).charge, b = failView(realFull as any, OWN).charge;
assert.equal(a, 'Comfy may still bill your account.'); assert.equal(a, b, 'list item and full job agree');
ok('real hosted failure: "Comfy may still bill your account." from the list item and from the full job');
// 2. A sample run (mock backend / demo route): nothing was billed, in both states, even with the provider's may-charge rule.
const sampleList = { ...base, runOn: 'comfy-cloud', isSample: true };
const sampleFull = { ...sampleList, route: 'comfy-router:api-nano-banana-21', routeAttempts: [{ routeId: 'comfy-router:api-nano-banana-21', refunded: 0 }], spend: { simulated: true } };
assert.equal(failView(sampleList as any, OWN).charge, 'Nothing was charged.'); assert.equal(failView(sampleFull as any, OWN).charge, 'Nothing was charged.');
assert.equal(failView({ ...sampleFull, isSample: undefined } as any, OWN).charge, 'Nothing was charged.', 'spend.simulated alone is enough');
ok('sample failure: "Nothing was charged." from the list item and from the full job');
// 3. Billing not loaded yet: no sentence (never a guess that changes later); once loaded, the true one.
assert.equal(failView(realList as any, LOADING).charge, ''); assert.equal(failView(realFull as any, LOADING).charge, '');
ok('billing still loading: the hosted run shows no charge sentence instead of a guess');
// Things that never depend on billing stay decided from the first render.
assert.equal(failView({ ...realList, runOn: 'local' } as any, LOADING).charge, 'Nothing was charged.');
assert.equal(failView(sampleList as any, LOADING).charge, 'Nothing was charged.');
ok('local and sample runs are decided without billing data');
// QA #7: credits back is an app-balance (✦) sentence, team mode only. Loading → nothing (never a ✦ that flips); own accounts → the provider's rule.
assert.equal(failView({ ...realList, creditsBack: { credits: 12 } } as any, LOADING).charge, '');
assert.equal(failView({ ...realList, creditsBack: { credits: 12 } } as any, OWN).charge, 'Comfy may still bill your account.');
assert.equal(failView({ ...realList, creditsBack: { credits: 12 } } as any, { ownAccounts: false, providerRule: null, providerName: null }).charge, '$0.12 went back to your balance.');
ok('back to balance: "$0.12 went back to your balance." in team mode only; own accounts never shows it');
// 4. No ctx (older callers, tests): unchanged behaviour.
assert.equal(failView(realFull as any).charge, 'Nothing was charged.');
ok('no ctx: unchanged');
