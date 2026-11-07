// The price allowance (user decision 2026-11-07, shared/priceChange.ts): a run whose price rose since the quote goes through when the rise is at
// most 10 % of the quote or 5 credits (5¢, 1 credit = $0.01), whichever is bigger; a bigger rise asks again. Plus the promptDependent flag words.
// Run: npx tsx test/price-allowance.test.ts (no server, no network).
import assert from 'node:assert/strict';
const { priceAskAgain, priceAllowance, PRICE_ALLOWANCE, promptPriceFields, quoteHasPrompt } = await import('../src/shared/priceChange.js');
const ok = (m: string) => console.log('ok ' + m);
const ask = (quotedCredits: number | null, credits: number, more: { quotedRoute?: string; route?: string } = {}) => priceAskAgain({ quotedCredits, credits, ...more });

assert.deepEqual(PRICE_ALLOWANCE, { share: 0.1, minCredits: 5 });
// a big price ($4 = 400 credits): 10 % (40) is bigger than 5¢
assert.equal(priceAllowance(400), 40);
assert.equal(ask(400, 400), false, 'exact');
assert.equal(ask(400, 436), false, '+9 %');
assert.equal(ask(400, 440), false, '+10 % (the edge goes through)');
assert.equal(ask(400, 444), true, '+11 % asks');
assert.equal(ask(400, 480), true, '+20 % asks');
assert.equal(ask(50, 55), false, '+10 % on 50 (float edge)');
ok('big price: up to +10 % runs, more asks');
// a small price (12 credits): 5¢ is bigger than 10 % (1.2)
assert.equal(priceAllowance(12), 5);
assert.equal(ask(12, 16), false, '+4¢');
assert.equal(ask(12, 17), false, '+5¢ (the edge goes through)');
assert.equal(ask(12, 18), true, '+6¢ asks');
assert.equal(ask(12, 14), false, 'the GPT Image 2.5 Flare case: quoted 12 without the prompt, 14 with it');
ok('small price: up to +5¢ runs, more asks');
// lower prices always run, on any place
assert.equal(ask(12, 3), false); assert.equal(ask(400, 0), false);
assert.equal(ask(12, 10, { quotedRoute: 'a', route: 'b' }), false, 'cheaper on another place runs');
assert.equal(ask(12, 15, { quotedRoute: 'a', route: 'b' }), false, 'a small rise on another place runs');
assert.equal(ask(12, 30, { quotedRoute: 'a', route: 'b' }), true, 'a big rise on another place asks');
ok('lower or within the allowance runs on any place');
// quoted free: any paid price asks (a free run never turns paid without the user saying so)
assert.equal(priceAllowance(0), 0);
assert.equal(ask(0, 0), false); assert.equal(ask(0, 1), true); assert.equal(ask(0, 5), true);
ok('quoted free: any charge asks');
// no quoted price: only a different place asks
assert.equal(ask(null, 4, { quotedRoute: 'a', route: 'b' }), true, 'route change, no quote → asks');
assert.equal(ask(null, 4, { quotedRoute: 'a', route: 'a' }), false, 'same route, no quote → runs');
assert.equal(ask(null, 4), false, 'nothing quoted → runs');
assert.equal(priceAskAgain({ quotedCredits: Number.NaN, credits: 4, quotedRoute: 'a', route: 'b' }), true, 'a bad quoted number counts as unknown');
ok('route change without a quote asks');

// promptDependent: only for a prompt-priced model quoted without the prompt
assert.deepEqual(promptPriceFields({ promptPriced: true, hasPrompt: false }), { promptDependent: true, promptNote: 'From this price: a longer prompt adds a little.' });
assert.deepEqual(promptPriceFields({ promptPriced: true, hasPrompt: true }), {});
assert.deepEqual(promptPriceFields({ promptPriced: false, hasPrompt: false }), {});
assert.equal(quoteHasPrompt({ prompt: 'a cat' }), true); assert.equal(quoteHasPrompt({ promptBytes: '0' }), true); assert.equal(quoteHasPrompt({ promptBytes: '1200' }), true);
assert.equal(quoteHasPrompt({ prompt: '' }), false); assert.equal(quoteHasPrompt({}), false); assert.equal(quoteHasPrompt({ promptBytes: 'x' }), false);
ok('promptDependent flag');
console.log('ALL OK price-allowance');
