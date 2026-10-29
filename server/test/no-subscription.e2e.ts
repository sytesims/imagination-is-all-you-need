// (G) No subscriptions, credits never expire (2026-10-18 cold open "No subscription. No credits to expire.").
// Legacy creditBuckets (source 'subscription', an expiring promo) are migrated in place on boot; /api/pricing + /api/plans carry no plans;
// /api/ledger/grant ignores expiresInDays; no 'expire' entries appear. Run: npx tsx test/no-subscription.e2e.ts (port 8956; temp data dir).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'nosub-'));
const legacy = `
const L = await import('../src/ledger.ts'); const { setKv, getKv } = await import('../src/db.ts');
const b = getKv('creditBuckets', []); b[0].source = 'subscription'; b.push({ id: 'promo-old', source: 'promo', amount: 50, remaining: 50, expiresAt: Date.now() + 1000, createdAt: Date.now() });
setKv('creditBuckets', b); console.log('LEGACY_OK', L.getBalance());`;
const lf = path.join(ROOT, 'test', '.nosub-legacy.mts'); fs.writeFileSync(lf, legacy);
try { const out = execFileSync('npx', ['tsx', lf], { cwd: ROOT, env: { ...process.env, OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock' } }).toString(); if (!/LEGACY_OK/.test(out)) throw new Error("legacy: " + out.slice(-600)); }
finally { fs.rmSync(lf, { force: true }); }
await new Promise((r) => setTimeout(r, 1500)); // the legacy promo's expiresAt is now in the past
const PORT = testPort(8956); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const u = await get('/api/ledger'); const bk = u.buckets as any[];
  assert.ok(bk.length >= 2, JSON.stringify(u).slice(0, 800)); assert.ok(bk.every((b) => b.source !== 'subscription'), JSON.stringify(bk)); assert.equal(bk.find((b) => b.id === 'start').source, 'starter'); assert.ok(bk.every((b) => b.expiresAt === null));
  assert.equal(bk.find((b) => b.id === 'promo-old').remaining, 50, 'the once-expiring promo kept its credits');
  const led = u; assert.ok(!led.entries.some((e: any) => e.kind === 'expire'), 'no expire entries'); ok('boot migration: subscription → starter, expiresAt cleared, nothing expired');
  const g = await (await fetch(`${B}/api/ledger/grant`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: 25, expiresInDays: 0.00001 }) })).json() as any;
  assert.equal(g.bucket.expiresAt, null); await new Promise((r) => setTimeout(r, 1500)); const led2 = await get('/api/ledger'); assert.ok(!led2.entries.some((e: any) => e.kind === 'expire')); assert.equal(led2.balance, led.balance + 25);
  ok('dev grant: expiresInDays ignored, grant never expires');
  const pr = await get('/api/pricing'); assert.deepEqual(pr.plans, []); assert.equal(pr.pricingModel, 'Pay per run at provider cost; local and open-weights runs are free; credits never expire.');
  const pl = await get('/api/plans'); assert.deepEqual(pl.items, []); assert.equal(pl.total, 0); assert.equal(pl.pricingModel, pr.pricingModel); assert.ok(!/\/api\/|choose|POST /.test(pl.notice), `plans notice is plain user copy: ${pl.notice}`); assert.match(pl.notice, /credits never expire\.$/); assert.match(pl.detail, /POST \/api\/plans\/:id\/choose/);
  const txt = JSON.stringify(pr) + JSON.stringify(pl); for (const w of ['/month', 'roll over', 'rollover', 'sample plan']) assert.ok(!txt.toLowerCase().includes(w), `no '${w}'`); assert.ok(!/subscription/i.test(JSON.stringify(pr)), 'no subscription in /api/pricing');
  ok('/api/pricing plans [] + pricingModel; /api/plans items [] (shape kept); no $10/$40 per month or roll-over copy');
  console.log('ALL OK no-subscription');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } }
