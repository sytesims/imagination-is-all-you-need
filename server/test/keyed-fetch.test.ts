// keyedFetch (security review 2026-11-07, F3 provider path, F4): a request carrying a provider key goes only to that provider's hosts.
//  - https only on an allowed host; plain http only to this computer; look-alike hosts refused before anything is sent.
//  - Redirects by hand: the key stays on same-origin hops; a hop to another origin goes with no key (and never gets it back); at most 4 hops.
//  - fal: a status / result / cancel URL from a reply or a stored handle on another host is refused (nothing sent); falHandleSafe says so.
//  - The labs: a poll URL off the lab's hosts is refused; the configured base (an override) is allowed, https or this computer only.
// Two fake hosts on loopback (different ports = different origins). Run: npx tsx test/keyed-fetch.test.ts. No network, fake keys only.
import assert from 'node:assert/strict'; import http from 'node:http'; import type { AddressInfo } from 'node:net';
const ok = (m: string) => console.log('ok ' + m);
Object.assign(process.env, { OPENHIGGSFIELD_BACKEND: 'mock' });
delete process.env.OPENHIGGSFIELD_BFL_BASE_URL;
const { keyedFetch, keyUrlAllowed, KeyHostRefused } = await import('../src/security/keyedFetch.js');
const { KEY_HOSTS, scopeOf, FAL_SCOPE } = await import('../src/security/keyScopes.js');

type Seen = { host: string; path: string; key: string | undefined; auth: string | undefined; method: string };
const seen: Seen[] = [];
const serve = (routes: (path: string, self: string) => { status: number; location?: string }) => new Promise<{ url: string; close: () => void }>((done) => {
  const s = http.createServer((req, res) => {
    const self = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    seen.push({ host: self, path: req.url ?? '', key: req.headers['x-key'] as string | undefined, auth: req.headers.authorization, method: req.method ?? '' });
    const r = routes(req.url ?? '', self); res.writeHead(r.status, r.location ? { location: r.location } : { 'content-type': 'application/json' }); res.end(r.location ? '' : '{"ok":true}');
  });
  s.listen(0, '127.0.0.1', () => done({ url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, close: () => s.close() }));
});
const other = await serve(() => ({ status: 200 }));
let selfLoop = 0;
const main = await serve((p, self) => p === '/same' ? { status: 302, location: `${self}/final` } : p === '/away' ? { status: 302, location: `${other.url}/stolen` }  : p.startsWith('/loop') ? { status: 302, location: `${self}/loop?${++selfLoop}` } : { status: 200 });
const scope = scopeOf('Test lab', KEY_HOSTS.bfl);
const H = { 'x-key': 'fake-lab-key', Authorization: 'Bearer fake-lab-key', accept: 'application/json' };
const last = () => seen[seen.length - 1];

try {
  // ---- hosts ----
  for (const u of ['https://api.bfl.ai/v1/x', 'https://api.us1.bfl.ai/v1/get_result', 'https://bfl.ai/x', 'http://127.0.0.1:9/x', 'http://localhost:9/x', 'http://[::1]:9/x']) assert.ok(keyUrlAllowed(u, KEY_HOSTS.bfl), u);
  for (const u of ['http://api.bfl.ai/v1/x', 'https://evilbfl.ai/x', 'https://api.bfl.ai.evil.example/x', 'https://evil.example/?u=api.bfl.ai', 'ftp://api.bfl.ai/x', 'p', '', 'https://user@evil.example@api.bfl.ai.x/']) assert.ok(!keyUrlAllowed(u, KEY_HOSTS.bfl), u);
  let called = 0; const spy = (async () => { called++; return new Response('{}'); }) as typeof fetch;
  await assert.rejects(keyedFetch(scope, 'https://evil.example/x', { headers: H }, { f: spy }), (e: any) => e instanceof KeyHostRefused && e.temporary === false && !/fake-lab-key/.test(e.message) && /evil\.example/.test(e.message));
  await assert.rejects(keyedFetch(scope, 'http://api.bfl.ai/x', { headers: H }, { f: spy }), KeyHostRefused); assert.equal(called, 0, 'nothing sent to a refused host');
  ok('hosts: https on the allow-list, http only on this computer; look-alikes, http and non-URLs refused before anything is sent (message names the origin, never the key)');

  // ---- redirects (real fetch, two loopback origins) ----
  let r = await keyedFetch(scope, `${main.url}/same`, { headers: H }); assert.equal(r.status, 200); assert.equal(last().path, '/final'); assert.equal(last().key, 'fake-lab-key', 'same origin keeps the key');
  r = await keyedFetch(scope, `${main.url}/away`, { headers: H }); assert.equal(r.status, 200); assert.equal(last().host, other.url); assert.equal(last().key, undefined); assert.equal(last().auth, undefined, 'another origin gets no key headers');
  await assert.rejects(keyedFetch(scope, `${main.url}/loop`, { headers: H }), /too many redirects/); assert.ok(selfLoop <= 5, 'at most 4 hops followed');
  ok('redirects: the key stays on same-origin hops only; a hop to another origin carries no key header; at most 4 hops');

  // a hop away and back: the key is not added again
  seen.length = 0;
  const bounceBack = await serve((p) => p === '/start' ? { status: 302, location: `${otherBack.url}/hop` } : { status: 200 });
  const otherBack = await serve(() => ({ status: 302, location: `${bounceBack.url}/end` }));
  await keyedFetch(scope, `${bounceBack.url}/start`, { headers: H });
  assert.deepEqual(seen.map((x) => [x.path, x.key ?? null]), [['/start', 'fake-lab-key'], ['/hop', null], ['/end', null]], 'once the key left, it never comes back');
  bounceBack.close(); otherBack.close();
  ok('redirects: after a hop to another origin, a hop back to the first one still carries no key');

  // ---- fal: URLs from a reply / stored handle ----
  const { falStatus, falResult, falCancel, falHandleSafe, falRun } = await import('../src/providers/fal.js');
  called = 0;
  await assert.rejects(falStatus('https://evil.example/requests/1/status', 'fake-fal-key', spy), KeyHostRefused);
  await assert.rejects(falResult('https://evil.example/requests/1', 'fake-fal-key', spy), KeyHostRefused);
  assert.equal(await falCancel('https://evil.example/requests/1/cancel', 'fake-fal-key', spy), false); assert.equal(called, 0);
  assert.equal(falHandleSafe({ statusUrl: 'https://queue.fal.run/a/requests/1/status', responseUrl: 'https://queue.fal.run/a/requests/1', cancelUrl: 'https://queue.fal.run/a/requests/1/cancel' }), true);
  assert.equal(falHandleSafe({ statusUrl: 'https://queue.fal.run/a/requests/1/status', responseUrl: 'https://evil.example/r', cancelUrl: '' }), false);
  assert.equal(falHandleSafe({ statusUrl: 'http://queue.fal.run/a/requests/1/status' }), false);
  // a submit reply that names another host: the key never goes there
  const reply = (async (u: string, init: any) => { called++; seen.push({ host: new URL(u).origin, path: u, key: init?.headers?.Authorization, auth: undefined, method: init?.method ?? 'GET' });
    return new Response(JSON.stringify(init?.method === 'POST' ? { request_id: 'r1', status_url: 'https://evil.example/s', response_url: 'https://evil.example/r', cancel_url: 'https://evil.example/c' } : {}), { status: 200 }); }) as typeof fetch;
  seen.length = 0; await assert.rejects(falRun('fal-ai/x', {}, 'fake-fal-key', { timeoutMs: 1000, pollMs: 1, f: reply, sleep: async () => {} }), KeyHostRefused);
  assert.deepEqual(seen.map((x) => x.host), ['https://queue.fal.run'], 'only the submit went out (to fal)');
  assert.ok(FAL_SCOPE.hosts().includes('.fal.run'));
  ok('fal: status / result / cancel URLs off fal’s hosts refused (from a reply or a stored handle); nothing is sent there');

  // ---- the labs: poll URLs and configured bases ----
  const D = await import('../src/providers/direct.js');
  assert.equal(D.directPollSafe('bfl', 'https://api.eu1.bfl.ai/v1/get_result?id=1'), true);
  assert.equal(D.directPollSafe('bfl', 'https://evil.example/v1/get_result?id=1'), false);
  assert.equal(D.directPollSafe('minimax', 'https://api.minimax.io/v2/query/video_generation/1'), true);
  assert.equal(D.directPollSafe('minimax', 'https://api.bfl.ai/x'), false, 'another lab’s host is not this lab’s');
  assert.equal(D.directPollSafe(undefined, 'https://api.bfl.ai/x'), false); assert.equal(D.directPollSafe('nope', 'https://api.bfl.ai/x'), false);
  process.env.OPENHIGGSFIELD_BFL_BASE_URL = 'https://bfl-proxy.example.org';
  assert.equal(D.directPollSafe('bfl', 'https://bfl-proxy.example.org/v1/get_result'), true, 'the base you configured is allowed');
  process.env.OPENHIGGSFIELD_BFL_BASE_URL = 'http://bfl-proxy.example.org';
  assert.equal(D.directPollSafe('bfl', 'http://bfl-proxy.example.org/v1/get_result'), false, 'but never over plain http');
  delete process.env.OPENHIGGSFIELD_BFL_BASE_URL;
  const polls = (async (u: string, init: any) => new Response(JSON.stringify(init?.method === 'POST' ? { id: 'b1', polling_url: 'https://evil.example/poll' } : { status: 'Pending' }), { status: 200 })) as typeof fetch;
  const { bflRun } = await import('../src/providers/bfl.js'); const { bflKleinRequest } = await import('../src/hostedRequests.js');
  await assert.rejects(bflRun(bflKleinRequest({ prompt: 'x' }), 'fake-bfl-key', { f: polls, pollMs: 1 }), KeyHostRefused);
  ok('labs: poll URLs only on that lab’s hosts or the https base you configured; a BFL polling_url elsewhere stops the run at once');
} finally { main.close(); other.close(); }
