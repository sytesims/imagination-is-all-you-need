/** Saved Elements → Photo FX slots. Run: npx tsx test/elements-photofx.test.ts [baseUrl]  (without one it starts its own mock server) */
import { testPort } from './_ports.js'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
let base = process.argv[2];
if (!base) { // no base URL: start our own server (port 9272, temp data dir, mock backend, mock keys, no network) and stop it on exit
  const { spawn } = await import('node:child_process'); const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const PORT = testPort(9272); base = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'elphotofx-'));
  const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '20', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true }); p.unref(); // never keeps the test alive
  process.on('exit', () => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* */ } });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
}
const png = readFileSync(new URL('../samples/sample-keyframe.png', import.meta.url));
const blob = () => new Blob([png], { type: 'image/png' });
const mk = async (name: string, kind: string) => { const fd = new FormData(); fd.append('image', blob(), 'x.png'); fd.append('name', name); fd.append('kind', kind);
  return (await (await fetch(`${base}/api/elements`, { method: 'POST', body: fd })).json()) as any; };
const post = async (prompt: string, uploads: string[] = []) => { const fd = new FormData(); fd.append('image', blob(), 'k.png'); fd.append('preset', 'float'); fd.append('types', 'float'); fd.append('rights', '1'); fd.append('prompt', prompt);
  for (const u of uploads) fd.append(u, blob(), `${u}.png`);
  const r = await fetch(`${base}/api/tools/photo-fx/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
// /api/ledger always has the balance (/api/usage hides it as null until there is paid activity on a fresh DB)
const bal = async () => ((await (await fetch(`${base}/api/ledger`)).json()) as any).balance as number;
const t = 'P' + Date.now().toString(36);
const els = [await mk(`${t} hero`, 'character'), await mk(`${t} villain`, 'character'), await mk(`${t} loft`, 'location'),
  ...(await Promise.all([1, 2, 3, 4].map((i) => mk(`${t} item${i}`, i === 4 ? 'other' : 'product'))))];
try {
  let j = await post(`@${t}_hero in @${t}_loft holding @${t}_item1 and @${t}_item4`);
  assert.equal(j.status, 200, JSON.stringify(j.body));
  const job = await (await fetch(`${base}/api/jobs/${j.body.id}`)).json() as any;
  assert.deepEqual(job.elements.map((e: any) => [e.name.split(' ')[1], e.slot, e.slotIndex]), [['hero', 'character', 1], ['loft', 'location', 1], ['item1', 'products', 1], ['item4', 'products', 2]]);
  assert.equal(job.input.slotRefs.length, 4);
  j = await post(`@${t}_hero waves`, ['character']);  // explicit upload wins
  assert.equal(j.status, 200, JSON.stringify(j.body));
  const j2 = await (await fetch(`${base}/api/jobs/${j.body.id}`)).json() as any;
  assert.equal(j2.elements[0].skipped, 'upload'); assert.equal(j2.input.slotRefs.filter((s: any) => s.slot === 'character').length, 1);
  const b0 = await bal();
  j = await post(`@${t}_hero and @${t}_villain`); assert.equal(j.status, 400); assert.match(j.body.error, /Too many character elements/);
  j = await post(`@${t}_item1 @${t}_item2 @${t}_item3 @${t}_item4`); assert.equal(j.status, 400); assert.match(j.body.error, /Too many products/);
  j = await post(`@${t}_item1 @${t}_item2`, ['products', 'products']); assert.equal(j.status, 400); // 2 uploads leave 1 slot
  j = await post(`@ghost dances`); assert.equal(j.status, 400); assert.match(j.body.error, /Unknown element @ghost/);
  assert.equal(await bal(), b0, 'no charge on 400');
  console.log('photo-fx elements ok');
} finally { for (const e of els) await fetch(`${base}/api/elements/${e.id}`, { method: 'DELETE' }); }
