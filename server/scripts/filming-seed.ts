/**
 * Child of `npm run filming -- on`: seeds the demo history (scripts/demo-seed-lib.ts) into the filming scratch data dir so Assets isn't empty
 * on camera. Runs with the filming state file already ON (env.ts then forces DATA_DIR = the scratch dir) and the mock backend (no GPU, no keys).
 * Refuses unless DATA_DIR is exactly FILMING_SEED_DIR, differs from FILMING_REAL_DIR, and holds no database yet.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
process.env.OPENHIGGSFIELD_CONCURRENCY = '8';
const want = path.resolve(process.env.FILMING_SEED_DIR ?? ''); const real = path.resolve(process.env.FILMING_REAL_DIR ?? '');
const { DATA_DIR } = await import('../src/config.js'); const d = path.resolve(DATA_DIR);
if (!process.env.FILMING_SEED_DIR || d !== want || d === real || existsSync(path.join(d, 'openhiggsfield.db'))) {
  console.error(`filming seed: refusing (data dir ${d}, expected scratch ${want}, real ${real})`); process.exit(3); }
const { seedDemo } = await import('./demo-seed-lib.js');
const r = await seedDemo(() => {});
const { jobPoster } = await import('../src/interimTiles.js');
const withStill = r.jobs.filter((j) => jobPoster(j.id).posterUrl).length;
(await import('../src/db.js')).db.close();
console.log(`seeded ${r.jobs.length} demo jobs into ${d} (${withStill} with an AI poster still, ${r.jobs.length - withStill} on sample media)`);
process.exit(0);
