// I2 (Oct 18): user-facing server copy names no env vars, file paths or /api paths; the technical part moves to reasonDetail / detail / storeKeysDetail.
// Own mock servers :8966 (normal) and :8967 (open-weights only). Run: npx tsx test/i2-copy.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'i2copy-'));
const boot = (port: number, extra: Record<string, string> = {}) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'd-')),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '150', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '0', ...extra }, stdio: ['ignore', fs.openSync(path.join(D, `srv-${port}.log`), 'a'), fs.openSync(path.join(D, `srv-${port}.log`), 'a')], detached: true });
const stop = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const api = (port: number) => { const B = `http://localhost:${port}`;
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const post = async (u: string, f: Record<string, string>, files: [string, string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
    for (const [k, p, t] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: t }), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
  const ready = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`server ${port} did not start`); };
  return { B, get, post, until, ready }; };
const ok = (m: string) => console.log('ok ' + m);
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const REF = path.join(import.meta.dirname, 'fixtures/ref-512.png');
const MP4 = path.join(D, 'clip.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=6', '-t', '6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const TECH = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b|\.env|\/api\/|127\.0\.0\.1|HOST=/;
const n = boot(testPort(8966)), o = boot(testPort(8967), { OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '1' }); const N = api(testPort(8966)), O = api(testPort(8967));
try {
  await N.ready(); await O.ready();
  const r = await N.get('/api/routes'); const routes = (r.routes as any[]).flatMap((m: any) => m.routes ?? []); assert.ok(routes.length > 10, `routes ${routes.length}`);
  const bad = routes.filter((x: any) => (x.reason && TECH.test(x.reason)) || (x.status && TECH.test(x.status))); assert.deepEqual(bad.map((x: any) => `${x.routeId}: ${x.reason}`), []);
  const km = routes.filter((x: any) => x.reasonCode === 'key_missing'); assert.ok(km.length > 0, 'some keyless routes'); for (const x of km) { assert.match(x.reason, x.demo ? /^You’ll get a free sample\. Real runs need a .+ key in Settings → Connections$/ : /^Add a .+ key in Settings to run this route\.$/); /* Oct 19 #6: demo routes read as a free preview */ assert.match(x.reasonDetail, /_(KEY|TOKEN|URL)\b.* not set$/); }
  ok(`/api/routes: ${routes.length} routes, no env var/path in reason or status; ${km.length} key_missing routes carry reasonCode + reasonDetail (e.g. "${km[0].reason}" / "${km[0].reasonDetail}")`);
  const sp = await N.get('/api/settings/providers'); assert.ok(!TECH.test(sp.storeKeysNote), sp.storeKeysNote); assert.match(sp.storeKeysDetail, /\.env\.local/);
  const pr = await fetch(`${N.B}/api/settings/providers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'fal', key: 'x' }) }); const pb = await pr.json() as any;
  if (pr.status === 403) { assert.ok(!TECH.test(pb.error), pb.error); assert.match(pb.detail, /HOST=127\.0\.0\.1/); }
  ok(`/api/settings/providers storeKeysNote is plain ("${sp.storeKeysNote}"), storeKeysDetail keeps the technical note; POST ${pr.status}${pr.status === 403 ? ' error plain + detail' : ''}`);
  const h = await O.post('/api/tools/h3-video/jobs', { provider: 'cloud-h3', prompt: 'x', types: '["t2v"]', rights: '1' }); assert.ok(h.status >= 400 && h.status < 500, `${h.status}`); assert.ok(!TECH.test(h.body.error), h.body.error); assert.match(h.body.error, /Nothing was charged/);
  ok(`open-weights-only hosted submit ${h.status}: "${h.body.error}"`);
  // K2: demo notices never say 'mock'; a local Extend route says what it does
  { const msgs: string[] = []; const walk = (v: any, k = ''): void => { if (typeof v === 'string') { if (/^(message|demoMessage|status|reason)$/.test(k)) msgs.push(v); } else if (Array.isArray(v)) v.forEach((x) => walk(x, k)); else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) walk(x, kk); };
    for (const u of ['/api/tools', '/api/routes', '/api/routes?toolId=h3-extend']) walk(await N.get(u));
    const mock = msgs.filter((m) => /mock/i.test(m)); assert.deepEqual([...new Set(mock)], [], 'no "mock" in user-facing messages');
    const ext = (await N.get('/api/routes?toolId=h3-extend')); const local = JSON.stringify(ext).match(/Extends your clip locally with open weights\. Free\./); const anyLocalDemo = JSON.stringify(ext).includes('demo_preview');
    ok(`K2: ${msgs.length} user-facing messages, none says "mock"; h3-extend local copy ${local ? 'present' : anyLocalDemo ? 'n/a (cloud demo)' : 'n/a (no demo)'}`); }
  console.log('ALL OK i2-copy');
} finally { stop(n); stop(o); }
