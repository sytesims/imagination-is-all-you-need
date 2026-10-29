// No server, browser, provider or large file needed. Browser playback regressions
// additionally exercise these helpers through ViewerVideo (see the review notes).
import assert from 'node:assert/strict';
import { checkMediaFailure, mediaFailureOf } from '../../web/src/shared/mediaFailure.ts';

assert.equal(mediaFailureOf(undefined), null);
assert.equal(mediaFailureOf(1), null, 'aborted load is not a missing file');
assert.equal(mediaFailureOf(2), 'network');
assert.equal(mediaFailureOf(3), 'decode');
assert.equal(mediaFailureOf(4), 'unsupported');
const original = globalThis.fetch;
try {
  for (const status of [200, 206, 403, 404, 410, 416, 500]) {
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, '/files/result.mp4');
      assert.equal(init?.method, 'HEAD');
      assert.equal(init?.cache, 'no-store');
      assert.ok(init?.signal);
      return new Response(null, { status });
    }) as typeof fetch;
    assert.equal(await checkMediaFailure('/files/result.mp4', 'decode', new AbortController().signal),
      status === 404 || status === 410 ? 'missing' : 'decode', `HTTP ${status}`);
  }
  globalThis.fetch = (async () => { throw new TypeError('offline'); }) as typeof fetch;
  assert.equal(await checkMediaFailure('/files/result.mp4', 'network', new AbortController().signal), 'network');
} finally { globalThis.fetch = original; }
console.log('ok media errors distinguish abort/network/decode/unsupported; only HTTP 404/410 means missing; HEAD-only probe');
