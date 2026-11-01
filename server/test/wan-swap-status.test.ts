// Wan 2.2 Animate on Video Swap / Motion Transfer (2026-10-31): one status everywhere. The model row said "Download 26.6 GB" while the providers row said
// "Turn it on in Settings": a model that runs only on your computer runs with Use local off too (routing/select.ts autoOrder), so its real step is its
// files. Now the providers row (routing/defaults.ts modelStatus), the plan's refusal (select.ts noProvider) and the setup card / model row (placeAction)
// all name the download. No network, no ComfyUI: an empty models folder with the weights check on.
// Run: npx tsx test/wan-swap-status.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'wanstatus-')); fs.mkdirSync(path.join(D, 'models'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'),
  OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_ENFORCE_WEIGHTS: '1', OPENHIGGSFIELD_COMFY_MODELS_DIR: path.join(D, 'models'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_DISK_FREE_GB: '1000' /* plenty of room, so a nearly full runner disk can't turn weights_missing into not_enough_disk */ });
for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const Dd = await import('../src/routing/defaults.ts'); const S = await import('../src/routing/select.ts'); const { getTool } = await import('../src/tools/registry.ts'); const { getPrefs } = await import('../src/routing/prefs.ts');
try {
  assert.equal(getPrefs().global.useLocal, false, 'Use local is off (the live app state that showed "Turn it on")');
  for (const id of ['object-swap', 'motion-transfer']) { const t = getTool(id)!;
    assert.ok(S.localOnlyModel('comfy-open', t, {}), `${id}: Wan 2.2 Animate runs only on your computer`);
    const gate = S.localSetupGate(t, 'comfy-open', {}); assert.equal(gate?.code, 'weights_missing');
    const st = Dd.defaultsBlock(t).modelStatus['comfy-open'];
    assert.notEqual(st.reasonCode, 'local_off'); assert.doesNotMatch(String(st.reason), /turn (it )?on/i, `${id}: ${st.reason}`);
    assert.match(String(st.reason), /needs its files first: Download \d+(\.\d)? GB/, `${id}: the providers row names the download`);
    const opts = S.routesIn('comfy-open', t).map((r) => S.option(t, r, {})); const target = S.setupTarget(t, 'comfy-open', {}, opts);
    assert.equal(target?.action, 'download', 'the setup card and model row: Download'); assert.equal(target?.missingBytes, gate!.missingBytes, 'same size');
    assert.ok(String(st.reason).includes(S.gbText(gate!.missingBytes)), 'same size in words'); }
  console.log('ok Wan 2.2 Animate: providers row, refusal and model row all say "Download N GB" (never "Turn it on") while its files are missing');
  console.log('ALL OK wan-swap-status');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
