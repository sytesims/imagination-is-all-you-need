// A quote starts ONE run (audit 2026-11-01 #6). Pure unit test of src/quotes.ts, no server. Run: npx tsx test/quotes.ts
import assert from 'node:assert/strict';
import { issueQuote, useQuote, checkQuote, fmtUsd as mcpUsd } from '../src/quotes.js';
import { fmtUsd as appUsd } from '../../server/src/shared/runCost.js';
const ok = (m: string) => console.log('ok ' + m);
const { quote_id } = issueQuote({ toolId: 'h3-video', hash: 'h1', credits: 88, usd: 0.88, routeId: 'fal:x' });
const a = useQuote(quote_id, 'h3-video', 'h1'); assert.ok(a.ok); a.done('job1');
const b = useQuote(quote_id, 'h3-video', 'h1'); assert.equal(b.ok, false); assert.match((b as any).reason, /already used to start job job1.*Get a new quote/);
ok('a used quote_id is refused with "already used … get a new quote"');
// two calls at the same moment: the second sees it taken before the first submit returns
const q2 = issueQuote({ toolId: 't', hash: 'h', credits: 5, usd: 0.05, routeId: null }).quote_id;
const c1 = useQuote(q2, 't', 'h'); const c2 = useQuote(q2, 't', 'h'); assert.ok(c1.ok); assert.equal(c2.ok, false); assert.match((c2 as any).reason, /already used/);
ok('taken before the submit: two calls at once cannot both use one quote');
// a submit the app refused (nothing started) gives the quote back
if (c1.ok) c1.release(); assert.ok(useQuote(q2, 't', 'h').ok); ok('released after a refused submit → usable again');
// the same client_request_id again is a replay of the first run (the app answers the first job), never a second run
const q3 = issueQuote({ toolId: 't', hash: 'h', credits: 5, usd: 0.05, routeId: null }).quote_id;
const d1 = useQuote(q3, 't', 'h', 'cr-1'); assert.ok(d1.ok); if (d1.ok) d1.done('job3');
assert.ok(useQuote(q3, 't', 'h', 'cr-1').ok, 'same client_request_id → replay allowed'); assert.equal(useQuote(q3, 't', 'h', 'cr-2').ok, false); assert.equal(useQuote(q3, 't', 'h').ok, false);
assert.equal(useQuote(q3, 't', 'other', 'cr-1').ok, false, 'replay must be the same request');
ok('same client_request_id = replay of the first job; another id or none = refused');
assert.equal(checkQuote(undefined, 't', 'h').ok, false); ok('no quote_id → refused');
// the connector's $ labels follow the app's rule (server/src/shared/runCost.ts fmtUsd): 3 decimals under $0.10, else 2
for (const v of [0, 0.0001, 0.004, 0.03, 0.045, 0.0999, 0.1, 0.42, 1, 5, 12.4, 1234.5, -0.03, -2.5, null, undefined, NaN]) assert.equal(mcpUsd(v), appUsd(v), `fmtUsd(${v})`);
assert.equal(mcpUsd(0.03), '$0.030'); assert.equal(mcpUsd(5), '$5.00'); ok('fmtUsd agrees with the app (3 decimals under $0.10)');
