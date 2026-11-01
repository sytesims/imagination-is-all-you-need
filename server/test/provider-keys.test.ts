// One provider key list (shared/providerKeys.ts): Settings' cards, the doctor and filming mode all agree on which variables hold keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROVIDER_ACCOUNTS, PROVIDER_KEY_VARS } from '../src/shared/providerKeys.js';
import { ACCOUNT_ENV } from '../src/doctor/doctor.js';
import { FAL_ENV, REPLICATE_ENV, COMFY_ENV } from '../src/routing/routes.js';

assert.equal(ACCOUNT_ENV, PROVIDER_ACCOUNTS, 'the doctor reads the shared list');
assert.match(fs.readFileSync(new URL('../src/env.ts', import.meta.url), 'utf8'), /import \{ PROVIDER_KEY_VARS \} from '\.\/shared\/providerKeys\.js'/, 'filming mode reads the shared list');
// every Settings card (routing/settings.ts P; read as text: importing it opens the database) is in the list, with the same variables
const src = fs.readFileSync(new URL('../src/routing/settings.ts', import.meta.url), 'utf8');
const consts: Record<string, string> = { FAL_ENV, REPLICATE_ENV, COMFY_ENV };
const cards = [...src.matchAll(/\{ id: '([a-z]+)', name: '[^']*',[^\n]*?envKey: ('[A-Z_]+'|[A-Z_]+), envAliases: \[([^\]]*)\]/g)]
  .map(([, id, key, aliases]) => ({ id, vars: [key.startsWith("'") ? key.slice(1, -1) : consts[key], ...[...aliases.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])] }));
assert.ok(cards.length >= 12, `found the Settings cards (${cards.length})`);
for (const c of cards) {
  if (c.id === 'local') continue; // an address, not a key
  const a = PROVIDER_ACCOUNTS.find((x) => x.id === c.id);
  assert.ok(a, `Settings card ${c.id} is in shared/providerKeys.ts`);
  assert.deepEqual([...a!.vars].sort(), [...c.vars].sort(), `${c.id}: the same variables`);
}
for (const v of ['OPENHIGGSFIELD_LUMA_API_KEY', 'OPENJUTSU_LUMA_API_KEY', 'CIVITAI_TOKEN', 'OPENHIGGSFIELD_HF_TOKEN', 'HF_TOKEN', 'COMFY_RUNNER_TOKEN', 'FAL_KEY', 'COMFY_API_KEY'])
  assert.ok(PROVIDER_KEY_VARS.includes(v), `filming mode ignores ${v} from the shell`);
assert.equal(new Set(PROVIDER_KEY_VARS).size, PROVIDER_KEY_VARS.length, 'no duplicates');
console.log(`ok provider keys: ${PROVIDER_ACCOUNTS.length} accounts, ${PROVIDER_KEY_VARS.length} variables; Settings, doctor and filming mode agree`);
