// E2E (own mock servers :8890 base, :8891 COMMERCIAL=1, :8892 OPEN_WEIGHTS_ONLY=1, :8893 both; temp data dirs):
// default models never switch on a licence setting. COMMERCIAL changes nothing; open-weights-only only removes hosted
// providers (kind ≠ open-weights: partner nodes, direct APIs), and a hosted default falls to the first runnable entry of the SAME order (B6 quality order). Run: npx tsx test/defaults-invariant.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const boot = (port: number, extra: Record<string, string>) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), `dinv${port}-`)), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMMERCIAL: '', OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '', ...extra }, stdio: 'ignore', detached: true });
const CFG: [number, Record<string, string>][] = [[testPort(8890), {}], [testPort(8891), { OPENHIGGSFIELD_COMMERCIAL: '1' }], [testPort(8892), { OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '1' }], [testPort(8893), { OPENHIGGSFIELD_COMMERCIAL: '1', OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '1' }]];
const S = CFG.map(([p, e]) => boot(p, e));
const get = async (port: number, u: string) => (await fetch(`http://localhost:${port}${u}`)).json() as Promise<any>;
type Snap = Record<string, { def: string | null; pref: string | null; order: string[]; kinds: Record<string, string>; modelDefault: string[]; routes: Record<string, string | null> }>;
async function snap(port: number): Promise<Snap> {
  const out: Snap = {}; const tools = await get(port, '/api/tools') as any[];
  for (const t of tools) {
    const order = (t.providers ?? []).filter((p: any) => !p.twinOf).map((p: any) => p.id ?? p); const kinds = Object.fromEntries((t.providers ?? []).map((p: any) => [p.id ?? p, (p.openWeights ?? p.kind === 'open-weights') ? 'open-weights' : p.kind ?? ''])); // Comfy Cloud open-weight workflows count as open weights
    const ms = (await get(port, `/api/models?toolId=${t.id}`)).groups?.flatMap((g: any) => g.models) ?? [];
    const rs = (await get(port, `/api/routes?toolId=${t.id}`)).routes ?? [];
    out[t.id] = { def: t.defaultProvider ?? null, pref: t.preferredProvider ?? null, order, kinds, modelDefault: ms.filter((m: any) => m.isDefault).map((m: any) => m.id), routes: Object.fromEntries(rs.map((r: any) => [r.modelId, r.defaultRoute ?? null])) };
  }
  return out;
}
try {
  for (const [p] of CFG) for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${p}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  const [base, com, ow, both] = await Promise.all(CFG.map(([p]) => snap(p)));
  assert.ok(Object.keys(base).length > 20, 'tools listed');
  assert.deepEqual(com, base, 'OPENHIGGSFIELD_COMMERCIAL=1 changes no default, order or route');
  assert.deepEqual(both, ow, 'COMMERCIAL changes nothing in open-weights-only mode either');
  assert.equal(base['create-image'].def, 'api-flux3-image'); assert.equal(base['create-image'].pref, 'api-nano-banana'); assert.deepEqual(base['create-image'].modelDefault, ['api-flux3-image']); // B6: Nano Banana 2 is the quality pick; per-workflow defaults (2026-10-23): Create Image's hosted default is Nano Banana 2.1
  assert.equal(ow['create-image'].def, 'comfy-qwen21', "open-weights-only: Create Image's local default, Qwen Image 2.1"); assert.deepEqual(ow['create-image'].modelDefault, ['comfy-qwen21']);
  let fell = 0;
  for (const [id, b] of Object.entries(base)) {
    const o = ow[id]; if (!o) { assert.ok(b.order.every((p) => b.kinds[p] !== 'open-weights'), `${id} only hidden when all its providers are hosted`); continue; }
    assert.deepEqual(o.order, b.order.filter((p) => b.kinds[p] === 'open-weights'), `${id}: OW keeps the same order minus hosted`);
    if (b.def && b.kinds[b.def] === 'open-weights') assert.ok(o.def && o.order.includes(o.def), `${id}: OW default ${o.def} is an open-weights entry of the same order`); // B6: the default is the first entry that runs, and hosted routes of an open model are gone in OW mode
    else if (b.def) { fell++; const rest = b.order.filter((p) => b.kinds[p] === 'open-weights'); assert.equal(o.pref, rest[0] ?? null, `${id}: quality pick = first open-weights entry`); if (!rest.length) { assert.equal(o.def, null, `${id}: nothing open-weights left → no default`); continue; } assert.ok(o.def && rest.includes(o.def), `${id}: hosted default ${b.def} → an entry of the same order (${o.def})`); assert.equal(o.modelDefault.length, 1); assert.equal(o.modelDefault[0], o.def, `${id}: isDefault follows defaultProvider`); }
    for (const [m, r] of Object.entries(b.routes)) if (r?.startsWith('local:')) assert.equal(o.routes[m], r, `${id}/${m}: local default route unchanged`);
  }
  console.log(`ok defaults identical with COMMERCIAL toggled (${Object.keys(base).length} tools: defaultProvider, provider order, isDefault, defaultRoute)`);
  console.log(`ok open-weights-only: same order minus hosted providers, non-hosted defaults unchanged, ${fell} hosted defaults fall to a runnable entry of the same order; Create Image: Nano Banana 2.1, Qwen Image 2.1 when open-weights-only`);
  console.log('ALL OK defaults-invariant');
} finally { for (const s of S) try { process.kill(-s.pid!); } catch { /* */ } }
