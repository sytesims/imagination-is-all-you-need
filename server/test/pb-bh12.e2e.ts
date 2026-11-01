// pb/bh12 (Bug Hunter on 885ae64): (2) /api/pricing example prices = the quote for the same quantity on every hosted row (Reframe was null / 0 vs a
// 200-credit quote); (3) 'this computer' wording on a saved-but-unused manual hardware value; (4) Re-shoot demo quote carries perAngleListCredits.
// One throwaway mock server on :8935 (never :8787/:8788), no keys, temp data dir removed; no paid calls, no downloads.
import { testPort } from './_ports.js'; import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const TSX = path.resolve(ROOT, '../node_modules/.bin/tsx');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_HW_MOCK: '' };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'pbbh12-')); let proc: ChildProcess | null = null;
const B = `http://localhost:${testPort(8935)}`; const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const send = async (method: string, u: string, body?: any) => { const r = await fetch(B + u, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: (await r.json()) as any }; };
const results: { name: string; pass: boolean }[] = [];
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, pass: true }); console.log(`PASS ${name}`); } catch (e: any) { results.push({ name, pass: false }); console.log(`FAIL ${name}: ${String(e?.message ?? e).slice(0, 800)}`); } }
try {
  proc = spawn(TSX, ['src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(testPort(8935)), HOST: '127.0.0.1', OPENHIGGSFIELD_DATA_DIR: T, OPENHIGGSFIELD_ENV_FILE: path.join(T, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_HW_MOCK: 'mid16' } });
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }

  await check('(2) pricing exampleCredits == quote credits for the example quantity on every hosted row where both exist (Reframe included)', async () => {
    const P = await get('/api/pricing'); let compared = 0; const bad: string[] = [];
    for (const t of P.tools) for (const p of t.providers ?? []) { if (p.kind === 'open-weights') continue;
      const res = /(\d+p|\w+) *$/.exec(p.exampleLabel ?? '')?.[1] ?? '720p'; const q = await get(`/api/tools/${t.toolId}/price?provider=${p.id}&duration=${p.exampleQuantity}&resolution=${res}`);
      const qc = q.demo || q.needsKey ? q.listCredits ?? q.credits : q.credits ?? q.listCredits; if (qc == null || p.exampleCredits == null) continue; compared++;
      if (qc !== p.exampleCredits) bad.push(`${t.toolId}/${p.id}: pricing ${p.exampleCredits} vs quote ${qc}`);
      if (p.per10s720p !== p.exampleCredits) bad.push(`${t.toolId}/${p.id}: per10s720p ${p.per10s720p} vs exampleCredits ${p.exampleCredits}`); }
    assert.deepEqual(bad, []); assert.ok(compared >= 20, `compared ${compared}`);
    const rf = P.tools.find((t: any) => t.toolId === 'reframe'); for (const id of ['auto-reframe', 'direct-luma-reframe']) { const p = rf.providers.find((x: any) => x.id === id); assert.ok(p, id);
      const q = await get(`/api/tools/reframe/price?provider=${id}&duration=10&resolution=720p`); assert.ok(p.exampleCredits > 0, JSON.stringify(p)); assert.equal(p.exampleCredits, q.demo ? q.listCredits : q.credits); assert.equal(p.per10s720p, p.exampleCredits); }
    for (const r of P.freeGens.rows) if (r.exampleCredits != null) { const t = P.tools.find((x: any) => x.toolId === r.toolId); const res = /at (\S+)$/.exec(r.exampleLabel)?.[1];
      const q = await get(`/api/tools/${r.toolId}/price?provider=${r.providerId}&duration=${r.exampleQuantity}&resolution=${res}`); const qc = q.demo || q.needsKey ? q.listCredits ?? q.credits : q.credits ?? q.listCredits; if (qc != null) assert.equal(r.exampleCredits, qc, `${r.toolId} free gens row`); void t; }
  });

  await check("(3) a saved manual value that isn't used says 'this computer', not 'Your hardware'", async () => {
    const m = await send('PUT', '/api/hardware', { vramGB: 12 }); assert.equal(m.status, 200, JSON.stringify(m.j)); assert.equal(m.j.manualInUse, false, 'mid16 mock is read automatically');
    assert.equal(m.j.note, "Saved. This computer's hardware was read automatically, so the values you entered are kept but not used."); assert.ok(!/your hardware/i.test(m.j.note));
    await send('DELETE', '/api/hardware/override');
  });

  await check('(4) Re-shoot batch quote on a free-demo route: perAngleCredits 0 + perAngleListCredits = the real per-angle list price', async () => {
    const q1 = await get('/api/tools/reshoot/price?provider=cloud-reshoot&duration=4&resolution=720p'); const q8 = await get('/api/tools/reshoot/price?provider=cloud-reshoot&duration=4&resolution=720p&angleCount=8');
    assert.equal(q8.demo, true, JSON.stringify(q8).slice(0, 300)); assert.equal(q8.perAngleCredits, 0); assert.equal(q8.perAngleListCredits, q1.listCredits); assert.equal(q8.listCredits, 8 * q1.listCredits);
    assert.equal(q1.perAngleListCredits, q1.listCredits); assert.equal(q1.angleCount, 1);
    const lq = await get('/api/tools/reshoot/price?provider=comfy-open&duration=4&angleCount=4'); assert.equal(lq.credits, 0); assert.ok('perAngleListCredits' in lq);
  });
} finally { if (proc) try { process.kill(-proc.pid!, 'SIGTERM'); } catch { /* gone */ } await new Promise((r) => setTimeout(r, 500)); fs.rmSync(T, { recursive: true, force: true }); }
const failed = results.filter((r) => !r.pass); console.log(`\npb-bh12: ${results.length - failed.length}/${results.length} checks passed`); if (failed.length) process.exit(1);
