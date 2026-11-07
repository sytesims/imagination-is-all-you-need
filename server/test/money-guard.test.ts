// The money path as Cordis services (plan Phase 4: services/spend.ts, pricing.ts; plugins spend-cap, agent-budgets, billing-team-mode).
//  - The guard is the kernel's: a profile that lists it (or spend) is refused; a profile without any money plugin still has ctx.spend,
//    still prices every run and writes its Spend row, and admits it.
//  - spend-cap off removes only its own check, quote line and card: with a $0 limit saved, a paid run still goes; on → 402 spend_cap and
//    the quote says spend_cap; off again → the agent budget check stays.
//  - billing-team-mode off: always own-accounts (a saved 'team' is not used); on → team mode and the balance check.
// Run: npx tsx test/money-guard.test.ts (temp data dir, mock backend, no network, no server).
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'money-guard-'));
Object.assign(process.env, { OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'data'), OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'none.env'),
  OPENHIGGSFIELD_FILMING_FILE: path.join(dir, 'no-filming.json'), OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9', OPENHIGGSFIELD_COUNT_SIMULATED_SPEND: '1',
  OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_HOSTED: '' });

const { boot } = await import('../src/boot.js'); const { parseProfile } = await import('../src/kernel/profile.js'); const { mount, mounted } = await import('../src/kernel/index.js');
await assert.rejects(boot(parseProfile('name: x\nplugins:\n  - spend-guard\n  - legacy\n', 'x.yml'), { legacy: false }), /part of the kernel and always on/);
await assert.rejects(boot(parseProfile('name: x\nplugins:\n  - spend\n  - legacy\n', 'x.yml'), { legacy: false }), /part of the kernel/);
ok('a profile can\'t list the guard: "spend-guard" / "spend" is part of the kernel');

const ctx = await boot(parseProfile('name: bare\nplugins:\n  - legacy\n', 'bare.yml'), { legacy: false });
const { spend } = await import('../src/services/spend.js'); const { pricing } = await import('../src/services/pricing.js');
const { spendGuard, guardNextRoute } = await import('../src/spendGuard.js'); const BL = await import('../src/billing.js'); const SC = await import('../src/spendCap.js');
const BM = await import('../src/billingMode.js'); const { jobs } = await import('../src/jobs.js');
assert.ok((ctx as any).spend && (ctx as any).pricing && (ctx as any).jobs, 'ctx.spend, ctx.pricing, ctx.jobs are mounted by the kernel');
assert.deepEqual(spend.view(), { limit: [], balance: [], budget: [] }); assert.deepEqual(pricing.list().map((s) => s.id), ['cost']);
ok('no money plugin in the profile: the guard is still there, with no checks; the quote keeps its core cost step');

const reply = () => { const r: any = { statusCode: 200, body: null, code(n: number) { r.statusCode = n; return r; }, send(b: unknown) { r.body = b; return r; } }; return r; };
const PAID = { kind: 'comfy-router', routeId: 'comfy-router:api-seedream', credits: 5, demo: false, free: false };
SC.saveSpendCap(0); // a $0 limit stops every paid run, when the cap is on
const mkJob = (id: string) => { const j: any = { id, toolId: 'create-image', provider: 'api-seedream', status: 'queued', createdAt: Date.now(), input: {}, outputs: [], cost: 5 }; jobs.set(id, j); return j; };
{ const r = reply(); const g = await spendGuard(r, PAID); assert.ok('runCost' in g, 'cap plugin off: no limit check'); assert.equal(g.runCost.estUsd, 0.05);
  g.spendRow(mkJob('m1')); const row = BL.jobSpendView('m1'); assert.equal(row?.estUsd, 0.05, 'the Spend row is still written'); }
assert.equal((BL.spendTally() as any).cap, undefined, 'no cap card');
const q = (payload: any, headers: Record<string, string> = {}) => pricing.compute({ method: 'GET', url: '/api/tools/create-image/price', headers } as any, payload);
const quote = () => q({ credits: 5, routeKind: 'comfy-router', routeId: 'comfy-router:api-seedream', runnable: true });
{ const p = quote(); assert.equal(p.cost.estUsd, 0.05); assert.equal(p.spendCap, undefined); assert.equal(p.runnable, true); }
ok('spend-cap off: a paid run goes past a saved $0 limit, the Spend row is written, no card, no quote line');

const capFiber = (ctx as any).plugin((await import('../src/plugins-builtin/spend-cap.js')).default); await capFiber;
await mount(ctx, (await import('../src/plugins-builtin/agent-budgets.js')).default);
assert.deepEqual(spend.view(), { limit: ['spend-cap'], balance: [], budget: ['agent-budgets'] });
{ const r = reply(); const g = await spendGuard(r, PAID); assert.ok('sent' in g); assert.equal(r.statusCode, 402); assert.equal(r.body.code, 'spend_cap'); assert.equal(r.body.charged, false);
  const free = await spendGuard(reply(), { ...PAID, kind: 'local', routeId: 'local:comfy-flux3-klein', credits: 0 }); assert.ok('runCost' in free, 'a free local run still goes');
  const p = quote(); assert.equal(p.blockedCode, 'spend_cap'); assert.equal(p.runnable, false); assert.equal(p.spendCap.monthlyUsd, 0);
  assert.equal((BL.spendTally() as any).cap.monthlyUsd, 0, 'the card is back');
  const j = mkJob('m2'); j.routing = { prices: { 'comfy-router:api-seedream': 5 }, order: [], mode: 'auto' };
  const n = guardNextRoute(j, 'comfy-router:api-seedream'); assert.ok('blocked' in n && n.blocked.code === 'spend_cap', 'the move to the next route asks the same guard'); }
ok('spend-cap on: 402 spend_cap before anything is queued (submit and next route), quote runnable:false, card on; free runs still go');

await capFiber.dispose();
assert.deepEqual(spend.view(), { limit: [], balance: [], budget: ['agent-budgets'] });
{ const g = await spendGuard(reply(), PAID); assert.ok('runCost' in g, 'cap off again: the run goes');
  const a = spend.admit('budget', { credits: 5, free: false, budget: { error: 'Unknown agent budget "x". Nothing was charged.', status: 400 } });
  assert.ok('refused' in a && a.refused.code === 'agent_budget_unknown', 'the agent budget check stays');
  assert.equal(quote().spendCap, undefined); }
ok('spend-cap disposed: only its check, quote line and card are gone; the agent budget check stays');

BM.saveBillingSettings({ mode: 'team' });
assert.equal(BM.billingMode(), 'own-accounts', 'team mode needs its plugin');
{ const { canAfford } = await import('../src/ledger.js'); assert.equal(canAfford(10 ** 9), true); }
const team = (ctx as any).plugin((await import('../src/plugins-builtin/billing-team-mode.js')).default); await team;
assert.equal(BM.billingMode(), 'team');
{ const a = spend.admit('balance', { credits: 10 ** 9, free: false }); assert.ok('refused' in a && a.refused.status === 402 && a.refused.code === 'credits');
  assert.ok('agent' in spend.admit('balance', { credits: 10 ** 9, free: true }), 'a free run is never refused'); }
await team.dispose(); assert.equal(BM.billingMode(), 'own-accounts'); BM.saveBillingSettings({ mode: 'own-accounts' });
ok('billing-team-mode: off = own accounts and no balance check; on = team mode, 402 credits when the balance can\'t cover it');

void mounted; fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
