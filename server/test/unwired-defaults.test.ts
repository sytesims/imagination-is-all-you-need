// No tool opens on a model that can't run there (2026-11-02 unwired audit). Restyle, Anime Restyle and Director opened on Seedance 2.0, whose Router
// body isn't wired for them. routing/defaults.ts now skips any model that is coming soon or has only cloud routes without a live executor in that
// tool: the default is the first model that can run, else the local one (its setup card explains). Mock keys (which make every keyed route look
// runnable) don't change this. No network, no ComfyUI.
// Run: npx tsx test/unwired-defaults.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'unwireddef-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'),
  OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9' });
for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const Dd = await import('../src/routing/defaults.ts'); const { routesFor } = await import('../src/routing/routes.ts'); const { routeRunnable } = await import('../src/routing/runnable.ts');
const { listTools, getTool } = await import('../src/tools/registry.ts');
const neverRuns = (toolId: string, id: string) => { const rs = routesFor(id, getTool(toolId)!).filter((r) => !r.comingSoon); return !rs.length || rs.every((r) => r.kind !== 'local' && !routeRunnable(r)); };
try {
  // 1. the three pages from the audit open on a model that runs (here: the local one, whose setup card says what it needs)
  for (const [id, want] of [['restyle', 'comfy-open'], ['app-anime-restyle', 'comfy-open'], ['cinema', 'comfy-open']] as const) {
    const t = getTool(id); assert.ok(t, id); assert.ok(neverRuns(id, 'router-seedance'), `${id}: Seedance 2.0 isn't wired here (test premise)`);
    const d = Dd.toolDefaults(t!); assert.equal(d.defaultProvider, want, `${id}: default ${d.defaultProvider}`);
    assert.equal(d.preferredProvider, 'router-seedance', `${id}: still the listed quality pick`);
    assert.match(String(d.defaultFallback?.note), /^Seedance isn’t ready in this app yet/, `${id}: the note says why: ${d.defaultFallback?.note}`);
    for (const m of Dd.toolModes(t!)) assert.ok(!neverRuns(id, String(Dd.toolDefaults(t!, { mode: m }).defaultProvider)), `${id}/${m}`);
  }
  console.log('ok Restyle, Anime Restyle and Director open on Wan 2.1 VACE / LTX-2 (local), not on Seedance 2.0');
  // 2. every tool and mode: the default is never coming soon nor cloud-only without a live executor in that tool
  let n = 0;
  for (const t of listTools()) for (const m of [null, ...Dd.toolModes(t)]) {
    const d = Dd.toolDefaults(t, { mode: m }); if (!d.defaultProvider) continue; n++;
    const s = d.models.find((x) => x.id === d.defaultProvider);
    assert.notEqual(s?.reasonCode, 'coming_soon', `${t.id}/${m}: ${d.defaultProvider} is coming soon`);
    assert.ok(!neverRuns(t.id, d.defaultProvider), `${t.id}/${m}: default ${d.defaultProvider} can never run here`);
  }
  assert.ok(n > 60, `checked ${n} tool/mode defaults`);
  console.log(`ok ${n} tool/mode defaults: none coming soon, none unwired`);
  console.log('ALL OK unwired-defaults');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
