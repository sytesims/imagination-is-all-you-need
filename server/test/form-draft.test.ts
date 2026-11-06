// The composer draft (web/src/shared/formDraft.ts, 2026-11-03): a prompt already sent with Generate, or older than a day, doesn't come back
// on load; an unsent fresh prompt and the settings do.
// Run: npx tsx test/form-draft.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { restorableState, DRAFT_TTL_MS } from '../../web/src/shared/formDraft.ts';
const ok = (m: string) => console.log('ok ' + m);
const now = 1_800_000_000_000; const st = { picked: ['edit'], prompt: 'a tiny shop', provider: 'api-gpt-image' };
assert.deepEqual(restorableState({ v: 1, savedAt: now - 60_000, state: st }, now), st, 'unsent and fresh: back as it was');
assert.deepEqual(restorableState({ v: 1, savedAt: now - 60_000, state: st, submitted: 'a tiny shop' }, now), { picked: ['edit'], provider: 'api-gpt-image' }, 'already sent: the prompt is dropped, the settings stay');
assert.deepEqual(restorableState({ v: 1, savedAt: now - 60_000, state: st, submitted: 'a tiny sho' }, now), st, 'edited after sending: kept');
assert.deepEqual(restorableState({ v: 1, savedAt: now - DRAFT_TTL_MS - 1, state: st }, now), { picked: ['edit'], provider: 'api-gpt-image' }, 'older than a day: the prompt is dropped');
assert.deepEqual(restorableState({ v: 1, state: st }, now), st, 'no date (an old draft): kept');
assert.equal(restorableState(null, now), null); assert.equal(restorableState({ v: 1 }, now), null);
assert.deepEqual(restorableState({ v: 1, savedAt: now, state: { prompt: '', n: 2 }, submitted: '' }, now), { prompt: '', n: 2 });
ok('sent or stale prompts are dropped; fresh unsent ones and settings come back');
