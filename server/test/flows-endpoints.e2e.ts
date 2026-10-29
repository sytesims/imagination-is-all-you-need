// E2E (own mock server, port 8827): the "endpoint TBD" flow rows — presets list, plan choose stub, share revoke, MCP tool list, project rename/delete,
// plus queue admission (429 errorType 'concurrency', code queue_full). Run: npx tsx test/flows-endpoints.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = testPort(8827), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MAX_QUEUED: '2' }, stdio: 'ignore', detached: true });
const req = async (m: string, u: string, body?: unknown) => { const r = await fetch(B + u, { method: m, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const job = async (prompt = 'a red fox') => { const fd = new FormData(); for (const [k, v] of Object.entries({ types: '["generate"]', prompt, provider: 'comfy-zimage-turbo', rights: '1' })) fd.append(k, v); const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  await req('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: true } }); // local mock runs (no keys)
  // presets
  const all = await req('GET', '/api/presets'); assert.equal(all.status, 200); assert.ok(all.body.total > 0 && all.body.items.every((p: any) => p.toolId && p.id));
  const tools = (await req('GET', '/api/tools')).body as any[]; assert.equal(all.body.total, tools.reduce((n, t) => n + (t.presets?.length ?? 0), 0));
  const one = tools.find((t) => t.presets?.length); const p1 = await req('GET', `/api/presets?toolId=${one.id}`); assert.equal(p1.body.total, one.presets.length); assert.ok(p1.body.items.every((p: any) => p.toolId === one.id));
  assert.equal((await req('GET', '/api/presets?toolId=nope')).status, 404); console.log(`ok GET /api/presets: ${all.body.total} presets across ${Object.keys(all.body.byTool).length} tools; ?toolId; unknown → 404`);
  // plan choose stub
  const bal0 = (await req('GET', '/api/ledger')).body.balance; const plans = (await req('GET', '/api/pricing')).body.plans;
  assert.deepEqual(plans, [], '(G) no plans'); // no plans since (G): every id is unknown → 404, nothing charged
  const ch = await req('POST', '/api/plans/starter/choose'); assert.equal(ch.status, 404); assert.equal(ch.body.errorType, 'validation');
  assert.equal((await req('GET', '/api/ledger')).body.balance, bal0); assert.equal((await req('POST', '/api/plans/gold/choose')).status, 404); console.log('ok POST /api/plans/:id/choose: no plans since (G) → 404, balance unchanged');
  // MCP tools
  const mt = await req('GET', '/api/mcp/tools'); const declared = (fs.readFileSync(path.resolve(import.meta.dirname, '../../mcp/src/server.ts'), 'utf8').match(/registerTool\(/g) ?? []).length;
  assert.equal(mt.body.total, declared); assert.ok(mt.body.items.some((t: any) => t.name === 'generate_video' && t.title && t.description));
  assert.ok(mt.body.items.some((t: any) => t.name === 'get_job' && /tryOn/.test(t.description) && !t.description.includes('${')), 'template-literal descriptions are listed with their shared text filled in'); console.log(`ok GET /api/mcp/tools: ${mt.body.total} tools = registerTool calls`);
  { const core = mt.body.items.filter((t: any) => t.default).map((t: any) => t.name); assert.deepEqual(mt.body.defaultToolsets, ['core']); assert.ok(core.includes('run') && core.includes('quote') && !core.includes('generate_video'), core.join(','));
    assert.equal(mt.body.items.find((t: any) => t.name === 'canvas_add_card')?.toolset, 'canvas'); console.log(`ok GET /api/mcp/tools: toolsets listed, ${core.length} on by default (core)`); }
  // projects
  const pr = (await req('POST', '/api/projects', { name: 'Draft' })).body; const rn = await req('PATCH', `/api/projects/${pr.id}`, { name: 'Final cut' }); assert.equal(rn.status, 200); assert.equal(rn.body.name, 'Final cut');
  assert.ok((await req('GET', '/api/projects')).body.some((p: any) => p.id === pr.id && p.name === 'Final cut'));
  assert.equal((await req('PATCH', `/api/projects/${pr.id}`, { name: '  ' })).body.issues[0].field, 'name'); assert.equal((await req('PATCH', `/api/projects/${pr.id}`, { name: 'x'.repeat(81) })).status, 400); assert.equal((await req('PATCH', '/api/projects/nope', { name: 'a' })).status, 404);
  assert.equal((await req('DELETE', `/api/projects/${pr.id}`)).status, 200); assert.ok(!(await req('GET', '/api/projects')).body.some((p: any) => p.id === pr.id)); assert.equal((await req('DELETE', `/api/projects/${pr.id}`)).status, 404);
  console.log('ok PATCH /api/projects/:id (rename, 400/404) and DELETE /api/projects/:id (404 when gone)');
  // share revoke
  const j = await job(); assert.equal(j.status, 200); for (let i = 0; i < 120; i++) { if ((await req('GET', `/api/jobs/${j.body.id}`)).body.status === 'done') break; await new Promise((r) => setTimeout(r, 500)); }
  const sh = await req('POST', `/api/jobs/${j.body.id}/share`); assert.equal(sh.status, 200); const tok = sh.body.token; assert.equal((await req('GET', `/api/share/${tok}`)).status, 200);
  assert.equal((await req('DELETE', `/api/jobs/${j.body.id}/share`)).status, 200); assert.equal((await req('GET', `/api/share/${tok}`)).status, 404); console.log('ok DELETE /api/jobs/:id/share revokes: link → 404');
  // queue admission: MAX_QUEUED=2 → 429 errorType concurrency, code queue_full, never charged
  const b1 = (await req('GET', '/api/ledger')).body.balance; const rs = []; for (let i = 0; i < 12; i++) rs.push(await job(`fox ${i}`));
  const full = rs.find((r) => r.status === 429); assert.ok(full, 'expected a 429'); assert.equal(full!.body.errorType, 'concurrency'); assert.equal(full!.body.code, 'queue_full'); assert.equal(full!.body.limit, 2);
  console.log(`ok queue cap: ${rs.filter((r) => r.status === 429).length}/12 → 429 {errorType:'concurrency', code:'queue_full'}; balance before ${b1}`);
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
process.exit(0);
