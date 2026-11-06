// The model menu's ONE status for a model at Your computer, the same in every tab (web/src/shared/menuPrice.ts localStateOf / tooBigOf, 2026-11-03).
// The bug: on All, Qwen Image 2.1 said "Too big for this GPU" (this run's quote: Edit, 2 pictures, 2K), while the Your computer tab said
// "Free" (it read only the listing's place status, which is for the default job). Now both read this run's quote, and a default that is too
// big for this computer isn't recommended.
// Run: npx tsx test/model-menu-row-status.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { localStateOf, tooBigOf, blockOf, TOO_BIG_SHORT } from '../../web/src/shared/menuPrice.ts';
import { localBlocker } from '../../web/src/shared/modelMenuSort.ts';
const ok = (m: string) => console.log('ok ' + m);

const ready = { id: 'local', status: 'ready', action: null, reasonCode: 'local_only' } as any;
const tooBigQ = { ok: true, runnable: false, reasonCode: 'too_heavy', runOn: 'local', reason: 'Qwen Image 2.1 is too heavy for this computer: Needs about 24 GB of graphics memory; your computer has 16 GB.' };
const freeQ = { ok: true, runnable: true, runOn: 'local', credits: 0, reasonCode: 'local_only' };

// 1. The quote for this run says too big: the All tab (blockOf) and the Your computer tab (localStateOf) say the same words.
const all = blockOf(tooBigQ)!; assert.equal(all.short, TOO_BIG_SHORT, 'All tab: Too big for this GPU');
const gpu = localStateOf(ready, tooBigQ); assert.equal(gpu.kind, 'blocked'); assert.equal((gpu as any).short, all.short, 'Your computer tab: the same words, never Free');
assert.equal(tooBigOf(tooBigQ), true);
ok('too big for this run: "Too big for this GPU" on All and on Your computer');

// 2. Fits this run: Free on Your computer, nothing blocked on All.
assert.deepEqual(localStateOf(ready, freeQ), { kind: 'free' }); assert.equal(blockOf(freeQ), null); assert.equal(tooBigOf(freeQ), false);
assert.deepEqual(localStateOf(ready, null), { kind: 'free' }, 'no quote yet: the place status (ready) says Free');
ok('fits: Free');

// 3. The place itself isn't ready: its own blocker wins (Download, Turn on, too big for any job), whatever the quote says.
const dl = localStateOf({ id: 'local', status: 'not-installed', action: { kind: 'download', text: 'Download', missingBytes: 17e9 }, reasonCode: 'weights_missing' } as any, tooBigQ);
assert.equal(dl.kind, 'blocker'); assert.match((dl as any).word, /^Download 17/);
const heavy = localStateOf({ id: 'local', status: 'not-installed', action: null, reasonCode: 'too_heavy' } as any, null);
assert.equal((heavy as any).word, localBlocker({ status: 'not-installed', action: null, reasonCode: 'too_heavy' } as any)!.word); assert.equal((heavy as any).word, TOO_BIG_SHORT);
ok('a place that needs setting up: its blocker');

// 4. A quote for another place (the cloud) never blocks the local row, and a cloud quote is never "too big for this computer".
assert.deepEqual(localStateOf(ready, { ...tooBigQ, runOn: 'comfy-cloud' }), { kind: 'free' });
assert.equal(tooBigOf({ ok: true, runnable: true, runOn: 'comfy-cloud', credits: 6 }), false, 'a default that runs in the cloud stays recommended');
assert.equal(tooBigOf({ ok: true, runnable: false, runOn: 'local', reason: 'Qwen Image 2.1 can’t run this job. It needs a photo.' }), false, 'other blocks are not "too big"');
ok('another place, other reasons: not too big');
