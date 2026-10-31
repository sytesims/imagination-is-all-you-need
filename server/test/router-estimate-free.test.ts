// Comfy Router estimate `source: free` (2026-10-31): the rate card prices the request at zero, so it reads as $0 / 0 credits, never as unknown.
// docs.comfy.org/development/comfy-router/reference (RouterCostEstimate: exact | estimated | free | unknown; "only a free quote reads 0").
// Run: npx tsx test/router-estimate-free.test.ts   (in-process, no network, no keys)
import assert from 'node:assert/strict';
const { parseEstimate, estimateHigh } = await import('../src/comfyRouter.ts');

const free = parseEstimate({ source: 'free', currency: 'USD', amount: '0', amount_cents: 0, credits: 0, pricing_as_of: '2026-10-01' });
assert.deepEqual(free, { source: 'free', usd: 0, minUsd: null, maxUsd: null, credits: 0, pricingAsOf: '2026-10-01' }, 'free = $0, a known price');
assert.equal('reason' in free, false, 'free has no unknown reason');
// a free body that leaves out the figures is still $0 (the source alone says so)
assert.deepEqual(parseEstimate({ source: 'free' }), { source: 'free', usd: 0, minUsd: null, maxUsd: null, credits: 0 });
// the other sources are unchanged
assert.equal(parseEstimate({ source: 'exact', amount: '0.04', credits: 8.44 }).usd, 0.04);
assert.equal(parseEstimate({ source: 'estimated', min_amount: '0.01', max_amount: '0.05' }).maxUsd, 0.05);
const u = parseEstimate({ source: 'unknown', reason: 'not_quotable' }); assert.equal(u.source, 'unknown'); assert.equal(u.usd, null); assert.equal(u.reason, 'not_quotable');
assert.equal(parseEstimate({ source: 'something-new', amount: '0' }).source, 'unknown', 'any other source reads as unknown');
assert.equal(parseEstimate(null).source, 'unknown');
// the runner's price check reads the same field: a free estimate gives a known high end of $0 (routing/routerRun.ts `hi`)
assert.equal(estimateHigh(free), 0, 'free: high end $0'); assert.equal(estimateHigh(u), null); assert.equal(estimateHigh(null), null);
assert.equal(estimateHigh(parseEstimate({ source: 'estimated', min_amount: '0.01', max_amount: '0.05' })), 0.05); assert.equal(estimateHigh(parseEstimate({ source: 'exact', amount: '0.04' })), 0.04);
console.log('ok router-estimate-free: free → $0 (0 credits), not unknown; exact / estimated / unknown unchanged');
