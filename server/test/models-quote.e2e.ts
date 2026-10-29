// E2E (own mock server :8896, temp data dir): every model listed by GET /api/models gets a quote from GET /api/models/quote
// (200 with numeric credits, or a clear 4xx with a reason; never 404 unknown model, never 5xx). Run: npx tsx test/models-quote.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8896); const B = `http://localhost:${PORT}`;
const DD = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, 'none.env'), OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nofilm.json'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1' }, stdio: 'ignore', detached: true });
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  const groups = (await (await fetch(`${B}/api/models`)).json() as any).groups as any[];
  const ids = [...new Set(groups.flatMap((g) => g.models.map((m: any) => m.id ?? m.providerId)))] as string[]; assert.ok(ids.length > 20, `models listed: ${ids.length}`);
  const bad: string[] = []; let ok = 0, fourxx = 0;
  for (const id of ids) {
    const r = await fetch(`${B}/api/models/quote?model=${encodeURIComponent(id)}`); const b = await r.json().catch(() => null) as any;
    if (r.status === 200 && typeof b?.credits === 'number') ok++;
    else if (r.status === 200 && b?.priceAvailable === false && b.runnable === false && b.credits === null && typeof b.reason === 'string') fourxx++; // (C) unpriceable → 200 priceAvailable:false
    else if (r.status >= 400 && r.status < 500 && b?.code !== 'unknown_model' && typeof b?.error === 'string' && b.error.length > 5) fourxx++;
    else bad.push(`${id} → ${r.status} ${JSON.stringify(b).slice(0, 160)}`);
  }
  assert.deepEqual(bad, [], `models without a quote:\n${bad.join('\n')}`);
  { const r = await fetch(`${B}/api/models/quote?model=cloud-h3`); const b = await r.json() as any; assert.equal(r.status, 200); assert.equal(b.toolId, 'h3-video'); assert.ok(b.credits > 0, JSON.stringify(b).slice(0, 200)); }
  { // GPT Image 2 per quality (token formula with headroom, hostedPrices.ts gptImageQuote, 2026-10-24): 1024x1024 output tokens 196 / 1756 / 7024 (+8 pad) × 7,600 / 1M
    // + a short prompt (100 + 500 B ÷ 2.5 = 300 tokens) × 2025.6 / 1M = base; Comfy credits = max(base × 1.2, base + 1); app credits = rounded up (211 Comfy credits = $1 = 100 app credits)
    const want = (out: number) => { const base = ((out + 8) * 7600 + 300 * 2025.6) / 1e6; return Math.ceil(Math.max(base * 1.2, base + 1) / 211 * 100); };
    const got: Record<string, number> = {}; for (const q of ['low', 'med', 'high']) { const b = await (await fetch(`${B}/api/models/quote?model=api-gpt-image&quality=${q}&aspect=1:1`)).json() as any; got[q] = b.credits; }
    assert.deepEqual(got, { low: want(196), med: want(1756), high: want(7024) }, `GPT Image 2 quotes ${JSON.stringify(got)}`);
    console.log(`ok GPT Image 2 quote per quality: ${JSON.stringify(got)}`); }
  { const r = await fetch(`${B}/api/models/quote?model=no-such-model`); assert.equal(r.status, 404); assert.equal((await r.json() as any).code, 'unknown_model'); }
  console.log(`ok /api/models/quote for all ${ids.length} listed models: ${ok} quoted, ${fourxx} clear 4xx; cloud-h3 → h3-video quote; unknown → 404 unknown_model`);
  console.log('ALL OK models-quote');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } fs.rmSync(DD, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
