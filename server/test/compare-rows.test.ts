// Compare models' list (web/src/ui/next/feed/compareRows.ts, 2026-11-03): only models that can run now by default; the rest behind
// "Show N more that need setup"; a picked model always stays in view.
// Run: npx tsx test/compare-rows.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { splitCompareRows, canCompareNow, moreLabel } from '../../web/src/ui/next/feed/compareRows.ts';
const ok = (m: string) => console.log('ok ' + m);
const ids = ['a', 'klein', 'flex', 'k9b', 'grok', 'b'];
const list = { a: {}, klein: { excluded: { code: 'not_runnable', reason: 'Can’t run here right now' } }, flex: { unpriced: true }, k9b: { unpriced: true }, grok: { excluded: { code: 'needs_setup', reason: 'Needs setup first' } }, b: { excluded: null, unpriced: false } };
assert.deepEqual(splitCompareRows(ids, list), { now: ['a', 'b'], more: ['klein', 'flex', 'k9b', 'grok'] });
assert.equal(moreLabel(4, false), 'Show 4 more that need setup'); assert.equal(moreLabel(4, true), 'Hide the ones that need setup');
ok('ready first; 4 that need setup behind the toggle');
assert.deepEqual(splitCompareRows(ids, list, ['grok']).now, ['a', 'grok', 'b'], 'a picked model stays in view');
assert.deepEqual(splitCompareRows(ids, null), { now: ids, more: [] }, 'before the quote answers: every row');
assert.equal(canCompareNow(undefined), true); assert.deepEqual(splitCompareRows([], list), { now: [], more: [] });
ok('picked stays; nothing hidden before the quote; empty list');
