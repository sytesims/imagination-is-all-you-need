import assert from 'node:assert/strict';
import { singleFrameRequests, frameDeliveryGuard, frameHandoffFailure } from '../../web/src/shared/frameHandoff.ts';

const requests = singleFrameRequests(); let calls = 0; let release!: (value: string) => void;
const load = () => { calls++; return new Promise<string>(resolve => { release = resolve; }); };
const first = requests.get('job/out0/last', load), second = requests.get('job/out0/last', load);
assert.equal(first, second); await Promise.resolve(); assert.equal(calls, 1, 'repeated Continue shares one pending extraction GET');
release('frame'); assert.equal(await first, 'frame'); await Promise.resolve();
await requests.get('job/out0/last', async () => { calls++; return 'cached frame'; }); assert.equal(calls, 2, 'settled requests are not permanently cached');
let failures = 0; const fail = () => { failures++; return Promise.reject(new Error('network')); };
await assert.rejects(requests.get('bad', fail)); await Promise.resolve(); assert.equal(failures, 1, 'no automatic retries');
await assert.rejects(requests.get('bad', fail)); assert.equal(failures, 2, 'an explicit retry starts one new GET');

const gate = frameDeliveryGuard(); const old = gate.begin(); assert.equal(old(), true);
gate.cancel(); assert.equal(old(), false, 'navigation/cancel/user file selection invalidates late delivery');
const next = gate.begin(); assert.equal(next(), true); assert.equal(old(), false);
const replacement = gate.begin(); assert.equal(next(), false, 'a different handoff supersedes the old one'); assert.equal(replacement(), true);
assert.match(frameHandoffFailure({ status: 404 }), /no longer available/);
assert.match(frameHandoffFailure({ code: 'frame_failed' }), /extract a frame/);
assert.match(frameHandoffFailure({ code: 'decode' }), /browser couldn’t display/);
assert.match(frameHandoffFailure(new TypeError('Failed to fetch')), /connection/);
assert.match(frameHandoffFailure({ status: 500 }), /Try again/);
console.log('frame-handoff-feedback: single flight, explicit retry, cancellation and useful errors: PASS');
