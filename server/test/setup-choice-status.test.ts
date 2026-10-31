/** First-run setup badges (web/src/shared/runChoices.ts choiceStatus): a card says Connected only when it works now, a saved choice that
 *  doesn't work says so, and a choice that isn't set up shows nothing. Run: npx tsx test/setup-choice-status.test.ts */
import assert from 'node:assert/strict';
import { choiceStatus, STATUS_TAG, type SetupFacts } from '../../web/src/shared/runChoices.js';

const base: SetupFacts = { choices: [], keys: [], useLocal: false, setup: 'none', comfyReach: null, keyChecks: null };
const st = (id: 'gpu' | 'comfy' | 'direct', f: Partial<SetupFacts>) => choiceStatus(id, { ...base, ...f });

// nothing set up: no badge anywhere, even after the checks answer
for (const id of ['gpu', 'comfy', 'direct'] as const) assert.equal(st(id, { comfyReach: false, keyChecks: {} }), null, id);

// your computer: saved (answer or the Local switch) → checking, then the live ComfyUI check decides
assert.equal(st('gpu', { choices: ['gpu'] }), 'checking');
assert.equal(st('gpu', { choices: ['gpu'], comfyReach: false }), 'unreachable');
assert.equal(st('gpu', { useLocal: true, comfyReach: true }), 'connected');
// the server thinks ComfyUI is there but it wasn't chosen: Connected only once it really answers, else nothing
assert.equal(st('gpu', { setup: 'local', comfyReach: true }), 'connected');
assert.equal(st('gpu', { setup: 'local', comfyReach: false }), null);
assert.equal(st('gpu', { setup: 'local' }), null);

// Comfy Cloud: a key that the account read accepts; a refused key; no answer; picked but no key saved
assert.equal(st('comfy', { keys: ['comfy'] }), 'checking');
assert.equal(st('comfy', { keys: ['comfy'], keyChecks: { comfy: 'ok' } }), 'connected');
assert.equal(st('comfy', { keys: ['comfy'], keyChecks: { comfy: 'rejected' } }), 'rejected');
assert.equal(st('comfy', { keys: ['comfy'], keyChecks: { comfy: 'offline' } }), 'unreachable');
assert.equal(st('comfy', { choices: ['comfy'], keyChecks: {} }), 'missing');

// your own keys: one working key is enough; a key the app can't check counts; all refused → rejected
assert.equal(st('direct', { keys: ['fal', 'bfl'], keyChecks: { fal: 'rejected', bfl: 'ok' } }), 'connected');
assert.equal(st('direct', { keys: ['ltx'], keyChecks: {} }), 'connected');
assert.equal(st('direct', { keys: ['fal'], keyChecks: { fal: 'rejected' } }), 'rejected');
assert.equal(st('direct', { keys: ['fal'], keyChecks: { fal: 'offline' } }), 'unreachable');
assert.equal(st('direct', { keys: ['comfy'], choices: ['direct'], keyChecks: {} }), 'missing'); // a Comfy key isn't one of these
assert.equal(STATUS_TAG.connected, 'Connected');
console.log('setup-choice-status: ok');
