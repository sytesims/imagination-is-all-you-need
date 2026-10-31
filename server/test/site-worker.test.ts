// The iiayn.app Worker (site/src): /install and /install.ps1 come back as plain text from GitHub (a fake fetch here),
// GitHub failures give a plain-text error (never HTML), the old domain 301s to iiayn.app, everything else goes to the static files.
// Run: npx tsx test/site-worker.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { handle, SCRIPTS } from '../../site/src/routes.js';

const ok = (m: string) => console.log('ok ' + m);
const RAW = 'https://raw.githubusercontent.com/sytesims/imagination-is-all-you-need/main/scripts/';
const assets = { fetch: async (_req: Request) => new Response('<!doctype html><title>site</title>', { headers: { 'content-type': 'text/html; charset=utf-8' } }) };

function fakeGitHub(status = 200) {
  const asked: string[] = [];
  const f = async (url: string) => { asked.push(url); return new Response(status === 200 ? `#!/bin/sh\n# ${url.split('/').pop()}\n` : '<html>oops</html>', { status, headers: { 'content-type': 'text/html' } }); };
  return { f, asked };
}

assert.deepEqual(SCRIPTS, { '/install': 'get.sh', '/install.ps1': 'get.ps1' });

for (const [path, file] of Object.entries(SCRIPTS)) {
  const gh = fakeGitHub();
  const res = await handle(new Request('https://iiayn.app' + path), assets, gh.f as typeof fetch);
  assert.equal(res.status, 200, path);
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8', path);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
  assert.match(res.headers.get('cache-control') ?? '', /max-age=300/, path);
  assert.deepEqual(gh.asked, [RAW + file], path);
  assert.match(await res.text(), new RegExp(`# ${file.replace('.', '\\.')}`), path);
  ok(`${path} serves ${file} as text/plain`);

  const head = await handle(new Request('https://iiayn.app' + path, { method: 'HEAD' }), assets, fakeGitHub().f as typeof fetch);
  assert.equal(head.status, 200); assert.equal(head.headers.get('content-type'), 'text/plain; charset=utf-8'); assert.equal(await head.text(), '');
  ok(`HEAD ${path}`);

  for (const failing of [fakeGitHub(404).f, fakeGitHub(503).f, async () => { throw new Error('network down'); }]) {
    const bad = await handle(new Request('https://iiayn.app' + path), assets, failing as typeof fetch);
    const text = await bad.text();
    assert.equal(bad.status, 502);
    assert.equal(bad.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.ok(!/<html/i.test(text), 'no HTML in the error');
    assert.match(text, /github\.com\/sytesims\/imagination-is-all-you-need\/blob\/main\/scripts\//);
    if (file.endsWith('.sh')) assert.match(text, /\nexit 1\n$/); else assert.match(text, /Write-Error/);
    for (const line of text.trim().split('\n').slice(0, -1)) if (!file.endsWith('.sh') || !line.startsWith('echo')) assert.ok(line.startsWith('#'), `comment line: ${line}`);
  }
  ok(`${path} gives a plain-text error when GitHub fails`);
}

const post = await handle(new Request('https://iiayn.app/install', { method: 'POST' }), assets, fakeGitHub().f as typeof fetch);
assert.equal(post.status, 405); ok('POST /install is refused');

for (const host of ['imaginationisallyouneed.com', 'www.imaginationisallyouneed.com', 'www.iiayn.app']) {
  const r = await handle(new Request(`https://${host}/some/page?x=1`), assets, fakeGitHub().f as typeof fetch);
  assert.equal(r.status, 301); assert.equal(r.headers.get('location'), 'https://iiayn.app/some/page?x=1');
}
ok('old domains 301 to https://iiayn.app with the same path');

const page = await handle(new Request('https://iiayn.app/'), assets, (async () => { throw new Error('GitHub must not be called'); }) as typeof fetch);
assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8'); ok('/ goes to the static files');
