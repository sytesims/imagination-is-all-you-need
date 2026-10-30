/** Director composer inputs: aspect / audio / count. Run: npx tsx test/cinema-composer.test.ts [baseUrl]  (without one it starts its own mock server) */
import { testPort } from './_ports.js'; import assert from 'node:assert/strict';
let base = process.argv[2];
if (!base) { // no base URL: start our own server (port 9271, temp data dir, mock backend, mock keys, no network) and stop it on exit
  const { spawn } = await import('node:child_process'); const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const PORT = testPort(9271); base = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cinecomp-'));
  const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '20', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_BILLING_MODE: 'team' /* the charge / refund checks below are the team ledger (own-accounts, the default since 2026-10-21, never charges the app balance) */ }, stdio: 'ignore', detached: true }); p.unref(); // never keeps the test alive
  process.on('exit', () => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* */ } });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
}
const post = async (f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  const r = await fetch(`${base}/api/tools/cinema/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const job = async (id: string) => (await (await fetch(`${base}/api/jobs/${id}`)).json()) as any;
// /api/ledger always has the balance (/api/usage hides it as null until there is paid activity on a fresh DB)
const bal = async () => ((await (await fetch(`${base}/api/ledger`)).json()) as any).balance as number;
const price = async (q: string) => (await (await fetch(`${base}/api/tools/cinema/price?${q}`)).json()) as any;
const wait = async (id: string) => { for (let i = 0; i < 240; i++) { const j = await job(id); if (['done', 'failed', 'cancelled', 'blocked', 'needs_decision'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 500)); } throw new Error('timeout'); };

const tools = await (await fetch(`${base}/api/tools`)).json() as any[];
const caps = tools.find((t) => t.id === 'cinema').app.capabilities;
assert.equal(caps.defaultAspect, '16:9'); assert.equal(caps.maxCount, 4);
assert.ok(caps.aspectsByProvider['comfy-open'].includes('9:16')); assert.equal(caps.audioByProvider['comfy-funcamera'], false);
assert.equal(caps.audioByProvider['router-veo'], true); for (const k of Object.keys(caps.aspectsByProvider)) { assert.equal(caps.verified[k], true, k); assert.match(caps.sources[k], /^https:\/\//); }

// defaults
let r = await post({ prompt: 'a man walks' }); assert.equal(r.status, 200, JSON.stringify(r.body));
let j = await job(r.body.id); assert.equal(j.input.aspect, '16:9'); assert.equal(j.input.audio, true); assert.equal(j.input.count, 1);
// validation (no charge)
const b0 = await bal();
for (const [f, re] of [[{ aspect: '7:5' }, /Aspect 7:5/], [{ aspect: '1:1', provider: 'router-veo' }, /Aspect 1:1/], [{ aspect: '4:3', provider: 'router-kling' }, /Aspect 4:3/], [{ audio: '1', provider: 'comfy-funcamera' }, /doesn't generate audio/],
  [{ count: '0' }, /Count must be 1–4/], [{ count: '5' }, /Count must be 1–4/], [{ count: '1.5' }, /Count must be 1–4/], [{ count: '2', auto: '1' }, /Auto already/]] as const) {
  r = await post({ prompt: 'a man walks', ...f }); assert.equal(r.status, 400, JSON.stringify(f)); assert.match(r.body.error, re);
}
assert.equal(await bal(), b0, 'no charge on 400');
r = await post({ prompt: 'a man walks', audio: '0', provider: 'comfy-funcamera' }); assert.equal(r.status, 200, JSON.stringify(r.body));
// count: local → 0 credits, 3 outputs
r = await post({ prompt: 'a man walks', count: '3', aspect: '9:16', provider: 'comfy-open' }); // B6: the Cinema default is Seedance 2.0 now; local Wan stays free
assert.equal(r.status, 200); assert.equal(r.body.cost, 0);
j = await wait(r.body.id); assert.equal(j.outputs.length, 3);
// hosted: price route ×count, shown = charged, refund on failure
const p1 = await price('provider=router-veo&duration=6&resolution=720p'), p2 = await price('provider=router-veo&duration=6&resolution=720p&count=2');
assert.equal(p2.credits, p1.credits * 2, 'per-output pricing');
if (p1.credits > 0) {
  const before = await bal();
  r = await post({ prompt: 'a man walks', provider: 'router-veo', count: '2', duration: '6', resolution: '720p', simulate: 'temporary' });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.cost, p2.credits, 'shown price = charge ' + JSON.stringify(r.body));
  j = await wait(r.body.id); assert.equal(j.status, 'failed'); assert.equal(j.refund?.refunded, true); assert.equal(j.refund?.amount, p2.credits);
  assert.equal(await bal(), before, 'refunded');
} else console.log('note: router-veo has no hosted price here; skipped charge test');
// Veo audio: with-audio rate (84.4 vs 42.2 Comfy credits/s) on the price route and on the job
const pa = await price('provider=router-veo&duration=6&resolution=720p&audio=1&count=2');
assert.equal(pa.credits, Math.round(84.4 / 211 * 6 * 100) * 2); assert.equal(p2.credits, Math.round(42.2 / 211 * 6 * 100) * 2);
r = await post({ prompt: 'a man walks', provider: 'router-veo', audio: '1', count: '2', duration: '6', resolution: '720p' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.cost, pa.credits, 'audio shown = charged');
r = await post({ prompt: 'a man walks', provider: 'router-veo', duration: '6', resolution: '720p' }); j = await job(r.body.id); assert.equal(j.input.audio, false, 'Veo default audio off');
// ONE duration rule (quote = submit): allowed lengths per model, exposed on /api/tools, /api/routes; a length the model doesn't offer snaps to the nearest one with a note on BOTH (D5, 2026-10-28)
assert.deepEqual(caps.durationsByProvider['router-veo'], [4, 6, 8]); assert.deepEqual(caps.durationsByProvider['comfy-open'], [5, 10, 15, 20, 30]);
assert.equal(caps.defaultDurationByProvider['router-veo'], 4); assert.equal(caps.defaultDurationByProvider['comfy-open'], 5);
{ const tp = tools.find((t) => t.id === 'cinema').providers; assert.deepEqual(tp.find((p: any) => p.id === 'router-veo').durations, [4, 6, 8]); assert.deepEqual(tp.find((p: any) => p.id === 'router-kling').durations, Array.from({ length: 13 }, (_, k) => k + 3)); }
{ const rv = await (await fetch(`${base}/api/routes?toolId=cinema&modelId=router-veo`)).json() as any; const m = rv.routes.find((x: any) => x.modelId === 'router-veo'); assert.deepEqual(m.durations, [4, 6, 8]); assert.ok(m.routes.length > 0); for (const o of m.routes) assert.deepEqual(o.durations, [4, 6, 8], o.routeId); }
for (const [prov, d, to] of [['router-veo', '5', 6], ['router-veo', '10', 8], ['comfy-open', '7', 5]] as const) {
  const pq = await fetch(`${base}/api/tools/cinema/price?provider=${prov}&duration=${d}&resolution=720p`); const pb = await pq.json() as any;
  assert.equal(pq.status, 200, `${prov} ${d}s quote ` + JSON.stringify(pb).slice(0, 300)); assert.ok((pb.adjustNotes ?? []).some((n: string) => n.includes(`Made at ${to} s, the closest length`)), JSON.stringify(pb.adjustNotes));
  const sj = await post({ prompt: 'a man walks', provider: prov, duration: d, resolution: '720p' });
  assert.equal(sj.status, 200, `${prov} ${d}s submit ` + JSON.stringify(sj.body)); assert.equal(sj.body.cost, pb.credits, 'snapped quote = charge');
  assert.ok((sj.body.warnings ?? []).some((n: string) => n.includes(`Made at ${to} s`)), JSON.stringify(sj.body.warnings)); assert.equal((await job(sj.body.id)).input.duration, to, `${prov} ${d}s made at ${to}s`);
}
// the job's length = the quoted length; no duration → the same default on quote and submit
for (const [prov, d] of [['router-veo', '8'], ['router-kling', '7'], ['comfy-open', '10'], ['router-veo', '']] as const) {
  const q = await price(`provider=${prov}&resolution=720p&count=1${d ? `&duration=${d}` : ''}`);
  r = await post({ prompt: 'a man walks', provider: prov, resolution: '720p', ...(d ? { duration: d } : {}) }); assert.equal(r.status, 200, JSON.stringify(r.body));
  j = await job(r.body.id); assert.equal(j.input.duration, d ? Number(d) : caps.defaultDurationByProvider[prov], `${prov} job length`); assert.equal(r.body.cost, q.credits, `${prov} ${d || 'default'}s quote = charge`);
}
console.log('cinema composer ok');
