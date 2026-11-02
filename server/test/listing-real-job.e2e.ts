// The Image page's recipes: the /api/tools listing judges each model on the job the bar really quotes (2026-11-01).
// For every recipe × model the bar offers (GET /api/image-workflows), the place the bar's quote picks (GET /api/tools/<runner>/price with the
// recipe's photos / refs / mask) must be the listing's pre-selected place (models[].preselect) AND one of its listed rows (models[].runsOn),
// so the Run-on menu ticks exactly the place the chip names (PR #66). Checked in sample mode (no keys) and with mock keys, with Use local off.
// Also: Your computer never "covers" (hides) another place while it is switched off.
// Run: npx tsx test/listing-real-job.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { workflowQuoteQueries } from '../src/shared/workflows.js';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_USE_LOCAL: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const PORT = testPort(9690); /* home ports stay in 8700-9699: 9701 + a worker's offset fell in the next worker's block, whose port sweep killed this server mid-test (CI, 2026-11-02) */ const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'lrj-')),
  OPENHIGGSFIELD_ENV_FILE: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lrje-')), 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const put = async (b: unknown) => { const r = await fetch(B + '/api/me/routing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); assert.ok(r.ok, `PUT routing ${r.status}`); };
try {
  for (let i = 0; ; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } if (i > 160) throw new Error('server did not start'); await new Promise((r) => setTimeout(r, 500)); }
  const check = async (label: string) => {
    const tools = new Map(((await get('/api/tools')) as any[]).map((t) => [t.id, t])); const { workflows } = await get('/api/image-workflows'); let n = 0; const bad: string[] = [];
    for (const r of workflows as any[]) { const tool = tools.get(r.runner.toolId); if (!tool?.models || r.runner.toolId === 'create-image') continue;
      for (const [mode, ps] of Object.entries<string[]>(r.models)) for (const p of ps) {
        const m = (tool.models as any[]).find((x) => x.primaryEngine === p); if (!m) continue; // picking a model runs its primary engine (web engineForModel)
        for (const q of workflowQuoteQueries(r, mode, p)) { const quote = await get(`/api/tools/${r.runner.toolId}/price?${new URLSearchParams({ provider: p, ...q })}`); if (!quote.runOn) continue; n++;
          const rows = (m.runsOn as any[]).map((x) => x.id); const who = `${label} ${r.id} × ${m.key} (${mode})`;
          if (!rows.includes(quote.runOn)) bad.push(`${who}: the quote runs on ${quote.runOn}, the menu lists ${rows.join(', ')}`);
          else if (mode === r.modes.default && quote.runnable !== false && m.preselect?.runOn !== quote.runOn) // a photo-switched mode (Character Sheet edit) is another job: the menu ticks the quote's listed place bad.push(`${who}: the quote runs on ${quote.runOn}, the listing pre-selects ${m.preselect?.runOn ?? 'nothing'}`);
          // a local place that is switched off covers nothing (it can't run the job)
          for (const h of m.hiddenRunsOn ?? []) { const c = (m.runsOn as any[]).find((x) => x.id === h.coveredBy); if (c && c.id === 'local' && c.status === 'off') bad.push(`${who}: ${h.id} hidden behind ${c.id} (${c.status})`); } } } }
    assert.deepEqual(bad, [], bad.join('\n')); assert.ok(n > 40, `only ${n} recipe × model pairs checked`); console.log(`ok ${label}: ${n} recipe × model quotes name a listed, pre-selected place`); };
  await put({ global: { useLocal: false, mockKeys: false } }); await check('sample mode');
  { const t = ((await get('/api/tools')) as any[]).find((x) => x.id === 'app-inpaint'); const k = (t.models as any[]).find((x) => x.key === 'flux-3-klein');
    if (k) { const loc = (k.runsOn as any[]).find((x) => x.id === 'local'); assert.ok(!loc || loc.status !== 'ready', `Brush Edit × FLUX 3 Klein: Your computer is ${loc?.status} with Use local off`); console.log(`ok Brush Edit × FLUX 3 Klein: Your computer is ${loc?.status ?? 'not listed'}, pre-selected ${k.preselect?.runOn}`); } }
  await put({ global: { useLocal: false, mockKeys: true } }); await check('mock keys');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } }
