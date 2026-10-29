import assert from 'node:assert/strict';
import { createServer as httpServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listenHost } from '../src/shared/listenHost.js';
import { testPort } from './_ports.js';
import { createServer, preview, loadConfigFromFile } from 'vite';

for (const NODE_ENV of ['development', 'production']) {
  for (const HOST of [undefined, '', '   ']) assert.equal(listenHost({ NODE_ENV, HOST }), '127.0.0.1');
  assert.equal(listenHost({ NODE_ENV, OPENHIGGSFIELD_HOST: '0.0.0.0' }), '0.0.0.0');
  assert.equal(listenHost({ NODE_ENV, HOST: '::1', OPENHIGGSFIELD_HOST: '0.0.0.0' }), '::1');
  assert.equal(listenHost({ NODE_ENV, HOST: '', OPENHIGGSFIELD_HOST: '0.0.0.0' }), '127.0.0.1');
  assert.equal(listenHost({ NODE_ENV, WEB_HOST: '0.0.0.0' }, true), '0.0.0.0');
  assert.equal(listenHost({ NODE_ENV, WEB_HOST: ' ', HOST: '0.0.0.0' }, true), '127.0.0.1');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiPort = testPort(8875), webPort = testPort(5285);
const api = httpServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, backend: 'mock' })); });
await new Promise<void>(r => api.listen(apiPort, '127.0.0.1', r));
const dir = mkdtempSync(path.join(os.tmpdir(), 'loopback-web-')); writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Isolated preview</title>');
const vars = ['HOST', 'WEB_HOST', 'OPENHIGGSFIELD_HOST', 'OPENJUTSU_HOST', 'OPENHIGGSFIELD_API_PROXY', 'PORT', 'WEB_PORT'];
const saved = Object.fromEntries(vars.map(k => [k, process.env[k]]));
for (const k of vars) delete process.env[k]; process.env.PORT = String(apiPort); process.env.WEB_PORT = String(webPort);
let dev: Awaited<ReturnType<typeof createServer>> | undefined; let built: Awaited<ReturnType<typeof preview>> | undefined;
try {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path.join(root, 'web/vite.config.ts')); assert.ok(loaded);
  assert.equal(loaded.config.server?.host, '127.0.0.1'); assert.equal(loaded.config.preview?.host, '127.0.0.1');
  dev = await createServer({ ...loaded.config, configFile: false, cacheDir: path.join(dir, 'vite-cache'), root: path.join(root, 'web'), server: { ...loaded.config.server, hmr: false } }); await dev.listen();
  assert.equal((dev.httpServer!.address() as any).address, '127.0.0.1');
  for (const host of ['127.0.0.1', 'localhost']) { const res = await fetch(`http://${host}:${webPort}/api/health`); assert.equal(res.status, 200); assert.equal((await res.json() as any).backend, 'mock'); }
  await dev.close(); dev = undefined;
  built = await preview({ ...loaded.config, configFile: false, root: path.join(root, 'web'), build: { outDir: dir } });
  assert.equal((built.httpServer.address() as any).address, '127.0.0.1');
  for (const host of ['127.0.0.1', 'localhost']) { assert.equal((await fetch(`http://${host}:${webPort}/`)).status, 200); assert.equal((await (await fetch(`http://${host}:${webPort}/api/health`)).json() as any).backend, 'mock'); }
  console.log(`loopback-defaults: dev/prod/blank/explicit precedence passed; Vite dev+preview listeners=127.0.0.1:${webPort}; localhost+127 proxy to mock API:${apiPort}=200 (Node HTTP, not Safari)`);
} finally {
  await dev?.close(); if (built) await new Promise<void>(r => built!.httpServer.close(() => r()));
  await new Promise<void>(r => api.close(() => r())); rmSync(dir, { recursive: true, force: true });
  for (const k of vars) saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k];
}
