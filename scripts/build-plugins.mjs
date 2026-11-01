// Compiles plugins/*/handler.ts → handler.mjs (ESM) so plugin handlers also load under `npm start` (node dist).
// Type-only imports are erased; the handler must not import runtime code from server/src (use the ctx it is given).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.env.OPENHIGGSFIELD_PLUGINS_DIR || 'plugins');
if (!fs.existsSync(root)) process.exit(0);
for (const d of fs.readdirSync(root)) {
  const ts = path.join(root, d, 'handler.ts');
  if (!fs.existsSync(ts)) continue;
  await build({ entryPoints: [ts], outfile: path.join(root, d, 'handler.mjs'), format: 'esm', platform: 'node', bundle: false, target: 'node22', logLevel: 'warning',
    banner: { js: '// GENERATED from handler.ts by scripts/build-plugins.mjs. Edit handler.ts.' } });
  console.log(`plugin handler compiled: ${d}/handler.mjs`);
}
