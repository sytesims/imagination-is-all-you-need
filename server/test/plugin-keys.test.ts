// Least-privilege keys for plugins (security review 2026-11-07, F5).
//  - A plugin reads only the keys it declared: an undeclared one gives nothing (KeyNotDeclared), whoever the plugin is.
//  - Only `legacy` (the server core) may declare every key ('*').
//  - kernel/keys.ts exports no unrestricted reader; no file in plugins-builtin/ imports kernel/coreKeys.ts or reads a key from process.env.
// Run: npx tsx test/plugin-keys.test.ts (in process, no network, fake keys only).
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const SRC = path.resolve(import.meta.dirname, '../src');
Object.assign(process.env, { OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_FAL_KEY: 'fake-fal-plugin-keys', OPENHIGGSFIELD_T_OUTSIDE_KEY: 'fake-own-key' });

const { createRoot, mount, definePlugin } = await import('../src/kernel/index.js');
const K = await import('../src/kernel/keys.js');

// ---- an outside-style plugin: only what it declared ----
{ const got: Record<string, unknown> = {};
  const outside = definePlugin({ name: 't-outside', inject: ['keys'], keys: ['OPENHIGGSFIELD_T_OUTSIDE_KEY'], apply(ctx) {
    got.own = ctx.keys.get('OPENHIGGSFIELD_T_OUTSIDE_KEY');
    for (const [k, read] of Object.entries({ get: () => ctx.keys.get('OPENHIGGSFIELD_FAL_KEY'), value: () => ctx.keys.value({ envKey: 'OPENHIGGSFIELD_FAL_KEY', envAliases: ['FAL_KEY'] }),
      configured: () => ctx.keys.configured({ envKey: 'COMFY_API_KEY', envAliases: [] }), alias: () => ctx.keys.value({ envKey: 'OPENHIGGSFIELD_T_OUTSIDE_KEY', envAliases: ['FAL_KEY'] }) })) {
      try { got[k] = read(); } catch (e) { got[k] = e; } }
    got.declared = ctx.keys.declared(); } });
  const none = definePlugin({ name: 't-none', inject: ['keys'], apply(ctx) { try { got.none = ctx.keys.get('OPENHIGGSFIELD_T_OUTSIDE_KEY'); } catch (e) { got.none = e; } } });
  const root = createRoot(); await mount(root, K.KeysService); await mount(root, outside); await mount(root, none);
  assert.equal(got.own, 'fake-own-key', 'its own declared key reads');
  for (const k of ['get', 'value', 'configured', 'alias']) assert.ok(got[k] instanceof K.KeyNotDeclared, `${k}: an undeclared key gives nothing`);
  assert.ok(got.none instanceof K.KeyNotDeclared, 'a plugin that declared nothing reads nothing');
  assert.deepEqual(got.declared, ['OPENHIGGSFIELD_T_OUTSIDE_KEY']);
  ok('ctx.keys: a plugin reads its declared keys only (get, value, configured, an undeclared alias all refused)'); }

// ---- '*' is the core's alone ----
{ assert.throws(() => definePlugin({ name: 't-greedy', keys: '*', apply() {} }), /only the server core may read every key/);
  assert.throws(() => K.declareKeys('place-fal', '*'), /only the server core/);
  assert.doesNotThrow(() => K.declareKeys('legacy', '*'));
  ok("only legacy may declare '*' (every key)"); }

// ---- no back doors ----
{ for (const name of ['readKey', 'keyValue', 'ANY_KEY', 'keyConfigured', 'CORE_KEYS']) assert.equal((K as Record<string, unknown>)[name], undefined, `kernel/keys.ts exports no ${name}`);
  const dir = path.join(SRC, 'plugins-builtin'); const bad: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/kernel\/coreKeys/.test(s)) bad.push(`${f}: imports kernel/coreKeys`);
    if (/\b(readKey|keyValue|ANY_KEY|CORE_KEYS)\b/.test(s)) bad.push(`${f}: names an unrestricted key reader`);
    if (/process\.env(\.\w*(KEY|TOKEN|SECRET)\w*|\[)/.test(s)) bad.push(`${f}: reads process.env directly`);
  }
  assert.deepEqual(bad, [], 'plugins read keys only through ctx.keys');
  ok('plugins-builtin/: no import of kernel/coreKeys, no unrestricted reader, no process.env key read'); }
