// Default models for Generate Video (h3-video), 2026-10-23 (shared/videoDefaults.ts + routing/defaults.ts). Mirrors test/image-defaults.test.ts.
// Covers: the ids are providers h3-video offers; the resolution order (saved route pin > the default for the active setup when it runs > the first
// that runs); local (LTX-2.5 22B) vs hosted (LTX-2.5 Pro) by Use local; the sample server opening on the local pick; and the API
// (GET /api/tools h3-video editorialDefault / defaultProvider).
// Run: npx tsx test/video-defaults.test.ts   (own mock server :9198, temp data dir, no keys, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { pickEditorial, type DefaultModelState } from '../src/shared/imageDefaults.ts';
import { VIDEO_DEFAULTS } from '../src/shared/videoDefaults.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9198); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'viddef-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_ARK_API_KEY: '' };
const ok = (m: string) => console.log('ok ' + m);
const V = VIDEO_DEFAULTS['h3-video'];
const st = (o: Record<string, Partial<DefaultModelState>>) => (id: string) => (o[id] ? { runnable: false, demo: false, routeKind: null, reasonCode: null, reason: null, ...o[id] } as DefaultModelState : undefined);

// ---- 1. pure: the table and the resolver ----
// Explore rework (2026-10-26): LTX-2.5 22B local first (free, with sound; Apple Silicon too), else the lowest-priced cloud model with sound
assert.equal(V.local, 'comfy-ltx25-video', 'local default: LTX-2.5 22B on your computer');
assert.equal(V.localApple, 'comfy-ltx25-video', 'Mac default: LTX-2.5 22B too');
assert.equal(V.hosted, 'router-ltx-25-pro', 'hosted default: LTX-2.5 Pro on the Comfy key');
assert.equal(V.hostedFallback, undefined, 'no lab-key fallback chain any more');
assert.equal(V.sampleLocal, undefined, 'cloud first (2026-10-27): the sample server no longer opens on the local pick');
for (const id of [V.local, V.hosted].filter(Boolean) as string[]) assert.match(id, /^[a-z0-9-]+$/, `${id} is a provider id`);
assert.ok(V.why.local && V.why.hosted, 'a why line for each setup');
ok('table: local comfy-ltx25-video, hosted router-ltx-25-pro, why lines');

const both = st({ 'comfy-ltx25-video': { runnable: true, routeKind: 'local' }, 'router-ltx-25-pro': { runnable: true, routeKind: 'comfy-router' } });
const pk = (s: (id: string) => DefaultModelState | undefined, useLocal: boolean) => pickEditorial(V, s, useLocal);
assert.deepEqual([pk(both, true).id, pk(both, true).setup], ['comfy-ltx25-video', 'local'], 'both run, Use local on → LTX-2.5 local');
assert.deepEqual([pk(both, false).id, pk(both, false).setup], ['router-ltx-25-pro', 'hosted'], 'both run, Use local off → LTX-2.5 Pro');
const noKey = st({ 'comfy-ltx25-video': { runnable: true, routeKind: 'local' }, 'router-ltx-25-pro': { reasonCode: 'key_missing', reason: 'Add a Comfy key' } });
assert.equal(pk(noKey, true).id, 'comfy-ltx25-video', 'no Comfy key, Use local on → LTX-2.5'); const nk = pk(noKey, false); assert.equal(nk.id, 'router-ltx-25-pro'); assert.equal(nk.runs, false); assert.equal(nk.reason, 'Add a Comfy key');
ok('order: Use local picks the setup; a hosted default that can’t run is named with its reason');

// ---- 2. the API on a keyless mock server ----
const env = (useLocal: string) => ({ ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: useLocal, OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: env('0'), stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; srv.stderr!.on('data', (b) => { stderr += String(b); });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const put = async (body: any) => { const r = await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); assert.ok(r.ok, `PUT routing ${r.status}`); };
const h3Now = async () => ((await get('/api/tools')) as any[]).find((t) => t.id === 'h3-video');
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); }
  let T = await h3Now();
  for (const id of [V.local, V.hosted].filter(Boolean) as string[]) assert.ok(T.qualityOrder.includes(id), `${id} is a provider h3-video offers`);
  ok('ids: every default is an h3-video provider');
  assert.ok(T.editorialDefault, 'API exposes editorialDefault on h3-video'); assert.equal(T.editorialDefault.feature, 'h3-video');
  assert.equal(T.editorialDefault.setup, 'hosted', 'keyless sample server: the cloud default (cloud first, 2026-10-27)');
  assert.equal(T.defaultProvider, 'router-ltx-25-pro', 'the Video tab opens on LTX-2.5 Pro'); assert.equal(T.editorialDefault.id, T.defaultProvider); assert.equal(T.defaultSource, 'cloud');
  ok(`API sample server: default ${T.defaultProvider}`);
  await put({ global: { mode: 'auto', allowFallback: false, useLocal: true } }); T = await h3Now();
  assert.equal(T.editorialDefault.setup, 'local', 'Use local on: local setup'); assert.equal(T.defaultProvider, V.local, 'Use local on: LTX-2.5 22B');
  ok('API local setup: comfy-ltx25-video');
  // a saved route pin beats the default
  const m = (T.models as any[]).find((x) => (x.engines ?? []).includes('router-seedance')); assert.ok(m, 'Seedance 2.0 listed on Generate Video');
  const place = (m.runsOn as any[]).find((r) => r.id !== 'local')?.id; assert.ok(place, 'Seedance 2.0 has a hosted place');
  await put({ perTool: { 'h3-video': { [m.key]: { runOn: place } } } }); T = await h3Now();
  assert.equal(T.defaultProvider, 'router-seedance', 'saved pin wins over the default'); assert.equal(T.editorialDefault.source, 'pin');
  await put({ perTool: {} }); T = await h3Now(); assert.equal(T.defaultProvider, V.local, 'pin cleared: the default again');
  ok('order: saved pin > default for the setup');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); if (process.exitCode) console.error(stderr.slice(-2000)); }
console.log('video-defaults: all checks passed');
