// Agent path fixes (audit 2026-11-07), pure unit tests, no server. Run: npx tsx test/agent-path.ts
//  #1 spend block is price-aware for run / retry and its refusal names the setting and the safe option (never allow / ALLOW=*);
//  #2 a quote that can't run is never "Free", blockedReason always says why; samples say sample + listPriceUsd;
//  #4 every validation issue (a single one too) keeps its field, allowed ids and a next step.
import assert from 'node:assert/strict';
import { loadPermissions, permFor, permOrigin, spendBlockIsPriceAware, spendBlockedReason, SAFE_SPEND_HINT } from '../src/permissions.js';
import { quoteView } from '../src/quoteView.js';
import { issuesOf } from '../src/issues.js';
const ok = (m: string) => console.log('ok ' + m);

// ---- #1 permissions ----
{
  const cfg = loadPermissions({ OPENHIGGSFIELD_MCP_SPEND: 'block' } as any);
  assert.equal(permFor(cfg, 'run'), 'block'); assert.ok(spendBlockIsPriceAware(cfg, 'run')); assert.ok(spendBlockIsPriceAware(cfg, 'retry'));
  assert.ok(!spendBlockIsPriceAware(cfg, 'generate_video'), 'legacy spend tools stay fully blocked');
  assert.equal(permOrigin(cfg, 'run'), 'OPENHIGGSFIELD_MCP_SPEND=block');
  const msg = spendBlockedReason(cfg, 'run', 'this $0.48 run');
  assert.match(msg, /OPENHIGGSFIELD_MCP_SPEND=block/); assert.match(msg, /\$0\.48/); assert.match(msg, /OPENHIGGSFIELD_MCP_SPEND=ask/); assert.match(msg, /OPENHIGGSFIELD_AGENT_BUDGET_USD/);
  assert.match(msg, /run_on "local"/); assert.doesNotMatch(msg, /=allow|ALLOW=/); assert.doesNotMatch(SAFE_SPEND_HINT, /=allow|ALLOW=/);
  ok('spend block: run / retry price-aware; refusal names the env, the price, ask + pinned budget, never allow');
  const per = loadPermissions({ OPENHIGGSFIELD_MCP_SPEND: 'ask', OPENHIGGSFIELD_MCP_BLOCK: 'run' } as any);
  assert.ok(!spendBlockIsPriceAware(per, 'run'), 'a per-tool block blocks every call'); assert.equal(permOrigin(per, 'run'), 'OPENHIGGSFIELD_MCP_BLOCK=run');
  const star = loadPermissions({ OPENHIGGSFIELD_MCP_BLOCK: '*' } as any); assert.ok(spendBlockIsPriceAware(star, 'run')); assert.equal(permOrigin(star, 'run'), 'OPENHIGGSFIELD_MCP_BLOCK=*');
  assert.equal(permOrigin(loadPermissions({} as any), 'run'), 'the built-in defaults (spend: ask)');
  ok('per-tool block stays a full block; origins name BLOCK=run, BLOCK=*, defaults');
}

// ---- #2 quote view ----
{
  // live H3 on Comfy Cloud (not_wired): credits null, list 64, cost.usdText "Free" (old server) → never Free
  const nw = quoteView({ credits: null, listCredits: 64, runnable: false, basis: 'hosted', cost: { billedTo: 'comfy', estUsd: 0, usdText: 'Free', estimated: true }, unavailableReason: 'Comfy Cloud isn’t ready yet. Pick another model.', priceLine: 'x', reason: 'not ready in this app yet' });
  assert.equal(nw.free, false); assert.equal(nw.runnable, false); assert.doesNotMatch(nw.priceLabel, /Free/); assert.match(nw.priceLabel, /Not available · list price \$0\.64 \(not a quote\)/);
  assert.equal(nw.blockedReason, 'Comfy Cloud isn’t ready yet. Pick another model.'); assert.equal(nw.listPriceUsd, 0.64); assert.equal(nw.chargeUsd, null);
  assert.equal(quoteView({ runnable: false, priceLine: 'Needs a fal key.' }).blockedReason, 'Needs a fal key.');
  assert.equal(quoteView({ runnable: false, reason: 'r' }).blockedReason, 'r');
  assert.equal(quoteView({ runnable: false, blockedReason: 'b', unavailableReason: 'u' }).blockedReason, 'b');
  assert.ok(quoteView({ runnable: false }).blockedReason, 'always a reason');
  assert.equal(quoteView({ runnable: false, credits: 0, cost: { usdText: 'Not available' } }).priceLabel, 'Not available');
  ok('not runnable: free:false, "Not available" (+ list price, not a quote), blockedReason falls back to unavailableReason / priceLine / reason');
  // needs a key: the real price stays (the price once the key is added), still not free
  const nk = quoteView({ credits: 64, runnable: false, needsKey: true, basis: 'hosted', cost: { estUsd: 0.64, usdText: '≈ $0.64', estimated: true }, priceLine: 'Needs a Comfy key. Price once it\'s added: ≈ $0.64.' });
  assert.equal(nk.free, false); assert.equal(nk.priceLabel, '≈ $0.64 once it can run'); assert.match(nk.blockedReason!, /Needs a Comfy key/);
  ok('needs a key: priced, "once it can run", not free');
  // sample: free, sample:true, listPriceUsd
  const sm = quoteView({ credits: 0, demo: true, listCredits: 168, runnable: true, basis: 'hosted', cost: { estUsd: 0, usdText: '≈ $1.68', estimated: true } });
  assert.equal(sm.sample, true); assert.equal(sm.free, true); assert.equal(sm.listPriceUsd, 1.68); assert.equal(sm.chargeUsd, 0); assert.equal(sm.priceUsd, 0); assert.match(sm.priceLabel, /^Free sample · a real run lists at \$1\.68$/);
  ok('sample: sample:true, free, chargeUsd 0, listPriceUsd, label says sample');
  // paid + local + estimated
  const pd = quoteView({ credits: 48, runnable: true, basis: 'hosted', cost: { estUsd: 0.48, usdText: '≈ $0.48', estimated: true } });
  assert.equal(pd.free, false); assert.equal(pd.chargeUsd, 0.48); assert.equal(pd.estimated, true); assert.equal(pd.sample, false); assert.equal(pd.listPriceUsd, null);
  assert.equal(quoteView({ credits: 48, runnable: true, basis: 'hosted', cost: { estUsd: 0.48, estimated: false } }).estimated, false, 'estimated follows cost.estimated');
  const lc = quoteView({ credits: 0, runnable: true, basis: 'open-weights', cost: { billedTo: 'local', usdText: 'Free · this computer', estimated: false } });
  assert.equal(lc.free, true); assert.equal(lc.local, true); assert.equal(lc.priceLabel, 'Free · this computer'); assert.equal(lc.chargeUsd, 0);
  ok('paid: chargeUsd = price, estimated from cost.estimated; local: free');
}

// ---- #4 issues ----
{
  const tool = { inputs: [{ name: 'types', kind: 'list', options: ['generate', 'edit', 'inpaint'], required: true }, { name: 'prompt', kind: 'text' }] };
  const one = issuesOf({ error: 'Pick a mode: Generate, Edit image, Inpaint (mask).', issues: [{ code: 'type_required', field: 'types', message: 'Pick a mode: Generate, Edit image, Inpaint (mask).' }] }, tool);
  assert.equal(one.length, 1); assert.equal(one[0].field, 'types'); assert.deepEqual(one[0].allowed, ['generate', 'edit', 'inpaint']);
  assert.match(one[0].next, /^set fields\.types to \["generate"\] \(allowed: generate, edit, inpaint\)/);
  const b = issuesOf({ field: 'types', allowed: ['t2v', 'i2v'], issues: [{ code: 'invalid_type', field: 'types', message: 'That type isn\'t on the list.' }] });
  assert.deepEqual(b[0].allowed, ['t2v', 'i2v']); assert.match(b[0].next, /\["t2v"\]/);
  const miss = issuesOf({ issues: [{ code: 'required', field: 'image', message: 'Image to video needs an image.' }] });
  assert.match(miss[0].next, /^add fields\.image/);
  assert.deepEqual(issuesOf({ error: 'x' }), []); assert.deepEqual(issuesOf(null), []);
  ok('a single issue keeps field + allowed ids (from the issue, the body or the tool) + next');
}
console.log('ALL OK agent-path');
