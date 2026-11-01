// Entries that can never run in a place are not listed there (2026-11-02 unwired audit), and stay where they do run:
//  - plain Seedance 2.0 on Object / Person Swap, Motion Transfer and Re-shoot (Seedance 2.5 Edit covers swaps); still on Restyle, Director, Generate Video
//  - Veo 3.1 on Re-shoot (it takes no source video); still on Generate Video
//  - MiniMax Speech 2.8 HD on Voice Studio; still on Audio (Voice)
// Also: the Character Swap LoRA setup line no longer promises Motion Transfer (H3 Character Swap runs on Object / Person Swap only).
// Run: npx tsx test/unwired-hidden.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'unwiredhid-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const { getTool } = await import('../src/tools/registry.ts'); const { CLOUD_SETUP } = await import('../src/comfy/cloudSetup.ts');
const ids = (id: string) => { const t = getTool(id); assert.ok(t, id); return t!.providers as string[]; };
try {
  for (const id of ['object-swap', 'motion-transfer', 'reshoot']) assert.ok(!ids(id).includes('router-seedance'), `${id}: no plain Seedance 2.0`);
  assert.ok(ids('object-swap').includes('router-seedance-25-edit') && ids('motion-transfer').includes('router-seedance-25-edit'), 'Seedance 2.5 Edit stays on the swaps');
  assert.ok(!ids('reshoot').includes('router-veo'), 'Re-shoot: no Veo');
  assert.ok(!ids('voice').includes('direct-minimax-speech'), 'Voice Studio: no MiniMax Speech');
  for (const id of ['restyle', 'cinema', 'h3-video']) assert.ok(ids(id).includes('router-seedance'), `${id} keeps Seedance 2.0`);
  assert.ok(ids('h3-video').includes('router-veo'), 'Generate Video keeps Veo');
  assert.ok(ids('audio').includes('direct-minimax-speech'), 'Audio keeps MiniMax Speech');
  console.log('ok hidden only where they can never run: Seedance 2.0 (swaps, Re-shoot), Veo (Re-shoot), MiniMax Speech (Voice Studio)');
  const cs = CLOUD_SETUP.find((x) => x.id === 'charswap')!;
  assert.doesNotMatch(cs.unlocks, /Motion/i); assert.match(cs.unlocks, /Object \/ Person Swap/);
  assert.ok(!ids('motion-transfer').includes('comfy-h3-charswap'), 'H3 Character Swap is not on Motion Transfer');
  console.log('ok Character Swap LoRA unlocks H3 Character Swap on Object / Person Swap only');
  console.log('ALL OK unwired-hidden');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
