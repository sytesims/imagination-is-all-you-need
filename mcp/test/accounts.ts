// server_status accounts (setup step 6): /api/accounts answers {accounts:[…]}; the old Array.isArray check made accounts always null.
// Run: npx tsx test/accounts.ts
import assert from 'node:assert/strict';
import { accountsOf } from '../src/accounts.js';
const live = { accounts: [{ provider: 'comfy', name: 'Comfy Cloud', connected: true, balance: 18.4, balanceUsd: 18.4, billingUrl: 'x', note: null }, { provider: 'fal', name: 'fal', connected: false, balanceUsd: null, mock: true }], cacheSeconds: 60, mockBackend: false };
assert.deepEqual(accountsOf(live), [{ provider: 'comfy', name: 'Comfy Cloud', connected: true, balanceUsd: 18.4 }, { provider: 'fal', name: 'fal', connected: false, sample: true }]);
assert.deepEqual(accountsOf(live.accounts), accountsOf(live), 'an array (older servers) still works');
assert.equal(accountsOf(null), null); assert.equal(accountsOf({ error: 'x' }), null); assert.deepEqual(accountsOf({ accounts: [] }), []);
assert.ok(!JSON.stringify(accountsOf(live)).includes('billingUrl'), 'only names, connection and balance');
console.log('ok accounts: {accounts:[…]} read (was always null), arrays still work, nothing extra passed on');
