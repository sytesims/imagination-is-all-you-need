/**
 * Writes the static OpenAPI spec to <repo>/openapi.json.
 *   npm run openapi                       → curated spec only
 *   npm run openapi -- --from http://localhost:8787  → live spec (curated + every registered route, e.g. hub routes as stubs)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpec } from '../src/openapi.js';
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../openapi.json');
const i = process.argv.indexOf('--from'); const from = i > 0 ? process.argv[i + 1] : process.env.OPENAPI_FROM;
let spec: any = buildSpec();
if (from) { const r = await fetch(`${from.replace(/\/$/, '')}/api/openapi.json`); if (!r.ok) throw new Error(`live spec: ${r.status}`); spec = await r.json(); spec.servers = [{ url: 'http://localhost:8787' }]; }
writeFileSync(out, JSON.stringify(spec, null, 2) + '\n');
console.log(`wrote ${out}: ${Object.keys(spec.paths).length} paths${from ? ` (live from ${from})` : ''}`);
