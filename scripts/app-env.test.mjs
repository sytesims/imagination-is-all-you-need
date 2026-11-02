// npm run setup / npm start when an app already answers on this install's port (scripts/app-env.mjs): this checkout's app is "already running";
// another copy (another folder, its own /api/health.checkout) is said plainly, never reported as this install. Run: node --test scripts/app-env.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { checkoutIdOf, REPO } = await import('./app-env.mjs');

/** A fake app on a free port whose /api/health says `health`; the probe runs app-env in a child with PORT set to it (the module reads env at load). */
async function probe(health) {
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(q.url === '/api/health' ? health : {})); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); const port = srv.address().port; const dir = mkdtempSync(path.join(tmpdir(), 'appenv-'));
  try {
    const code = `const m = await import(${JSON.stringify(path.join(HERE, 'app-env.mjs'))}); console.log(JSON.stringify({ on: await m.appOnPort(), up: await m.apiUp(), clash: await m.portClash() }));`;
    /* async: the fake app answers from this process while the child asks */
    const out = await new Promise((ok, no) => execFile(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, PORT: String(port), WEB_PORT: '5199', MCP_PORT: '8799', OPENHIGGSFIELD_ENV_FILE: path.join(dir, '.env.local') } }, (e, so) => (e ? no(e) : ok(so))));
    return JSON.parse(out.trim().split('\n').pop());
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
}

test('this checkout on the port: already running, no clash', async () => {
  const r = await probe({ ok: true, checkout: checkoutIdOf(REPO) }); assert.equal(r.on, 'this'); assert.equal(r.up, true);
});

test('an app from before /api/health.checkout counts as this one (as before)', async () => {
  const r = await probe({ ok: true }); assert.equal(r.on, 'this'); assert.equal(r.up, true);
});

test('another copy on the port: not "already running"; the clash names it and gives this install its own ports', async () => {
  const r = await probe({ ok: true, checkout: '0123456789abcdef' }); assert.equal(r.on, 'other'); assert.equal(r.up, false);
  assert.match(r.clash, /^Another copy of the app is already running at http:\/\/localhost:5199 \(from another folder\)\. This new install isn't running yet/);
  assert.match(r.clash, /WEB_PORT=5202 and MCP_PORT=8802/);
});
