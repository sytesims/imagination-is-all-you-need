// Executes a copied setup script with fake dependencies/doctor, never npm install or the real app.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const root = mkdtempSync(path.join(tmpdir(), "setup user's space "));
const server = http.createServer((_req, res) => { res.writeHead(404); res.end(); });
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as import('node:net').AddressInfo).port;
try {
  mkdirSync(path.join(root, 'scripts'));
  for (const name of ['fastify', 'tsx', 'concurrently']) mkdirSync(path.join(root, 'node_modules', name), { recursive: true });
  writeFileSync(path.join(root, 'scripts', 'setup.mjs'), readFileSync(new URL('../../scripts/setup.mjs', import.meta.url)));
  writeFileSync(path.join(root, 'scripts', 'doctor.mjs'), 'console.log(JSON.stringify({ports:[process.env.PORT,process.env.WEB_PORT,process.env.MCP_PORT]}));');
  const settings = path.join(root, 'custom settings.env');
  writeFileSync(settings, `PORT=${port}\nWEB_PORT=5294\nMCP_PORT=8894\n`);
  const run = (overrides: Record<string, string> = {}) => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'setup.mjs'), '--no-start'], {
      cwd: root,
      env: { PATH: process.env.PATH, HOME: root, OPENHIGGSFIELD_ENV_FILE: settings, ...overrides },
      windowsHide: true,
    });
    let text = ''; child.stdout.on('data', b => { text += b; }); child.stderr.on('data', b => { text += b; });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(text) : reject(new Error(`setup exited ${code}: ${text}`)));
  });
  const filePorts = await run();
  assert.ok(filePorts.includes(JSON.stringify({ ports: [String(port), '5294', '8894'] })), 'doctor inherits selected file-based ports, as the dev child must');
  assert.match(filePorts, /http:\/\/localhost:5294\/\?setup=1/);
  const shellPorts = await run({ WEB_PORT: '5295', MCP_PORT: '8895' });
  assert.ok(shellPorts.includes(JSON.stringify({ ports: [String(port), '5295', '8895'] })), 'shell ports override env-file ports');
  assert.match(shellPorts, /http:\/\/localhost:5295\/\?setup=1/);
  console.log('ok copied setup: paths with spaces/apostrophes, file-based ports and shell precedence reach children; no app/install started');
} finally {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  rmSync(root, { recursive: true, force: true }); // only this test's newly created scratch tree
}
