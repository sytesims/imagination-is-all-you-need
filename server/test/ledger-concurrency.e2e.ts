// BH3 L11/L12: GET /api/ledger must never 500 while jobs are submitted and a SECOND process writes the same DB
// (what happens during a tsx watch restart overlap). Finding: the server side holds (better-sqlite3's default 5 s lock wait already
// covers the overlap; this test passes with and without an explicit busy_timeout). The L11 500 came from the Vite dev proxy
// answering 500 while :8787 restarted under tsx watch (ECONNREFUSED; no 500 in api-8787.log) → web lane (web/vite.config.ts).
// Run: npx tsx test/ledger-concurrency.e2e.ts (port 8958; temp data dir).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerc-')); const PORT = testPort(8958); const B = `http://localhost:${PORT}`;
const env = { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '' };
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env, stdio: ['ignore', fs.openSync(path.join(D, 'srv.log'), 'a'), fs.openSync(path.join(D, 'srv.log'), 'a')], detached: true });
// sidecar: a second process holding write transactions on the same DB file
const side = path.join(ROOT, 'test', '.ledgerc-side.mts');
fs.writeFileSync(side, `const { db } = await import('../src/db.ts'); const end = Date.now() + 12000; let n = 0;
while (Date.now() < end) { db.transaction(() => { db.prepare("INSERT OR REPLACE INTO kv (id, data) VALUES ('ledgerc-side', ?)").run(JSON.stringify({ n: n++ })); const t = Date.now() + 40; while (Date.now() < t) { /* hold the write lock */ } }).immediate(); await new Promise((r) => setTimeout(r, 5)); }
console.log('SIDE_DONE', n);`);
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const sc = spawn('npx', ['tsx', side], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] }); let sideOut = ''; sc.stdout.on('data', (d) => (sideOut += d));
  await new Promise((r) => setTimeout(r, 2500)); // sidecar running
  const statuses: number[] = []; const bad: string[] = [];
  const getL = async () => { const r = await fetch(`${B}/api/ledger`); statuses.push(r.status); if (r.status !== 200) bad.push(`ledger ${r.status} ${(await r.text()).slice(0, 200)}`); else await r.json(); };
  const submit = async (i: number) => { const fd = new FormData(); fd.append('prompt', `lighthouse ${i}`); fd.append('route', 'auto');
    const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); if (r.status >= 500) bad.push(`submit ${r.status} ${(await r.text()).slice(0, 200)}`); };
  for (let round = 0; round < 4; round++) await Promise.all([...Array.from({ length: 25 }, getL), ...Array.from({ length: 5 }, (_, i) => submit(round * 5 + i)), ...Array.from({ length: 5 }, async () => { const r = await fetch(`${B}/api/usage`); if (r.status !== 200) bad.push(`usage ${r.status}`); })]);
  await new Promise<void>((r) => sc.on('exit', () => r())); assert.match(sideOut, /SIDE_DONE \d+/);
  assert.deepEqual(bad, [], bad.join('\n')); assert.equal(statuses.length, 100); assert.ok(statuses.every((s) => s === 200));
  ok(`100 concurrent GET /api/ledger + 20 submits + 20 /api/usage while a second process held write locks (${sideOut.trim()}): no 500`);
  const l = await (await fetch(`${B}/api/usage`)).json() as any; assert.ok(l.reconciles !== false, JSON.stringify(l.totals)); ok('ledger still reconciles');
  console.log('ALL OK ledger-concurrency');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(side, { force: true }); }
