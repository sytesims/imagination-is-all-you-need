/**
 * npm run demo:reset — wipes the data dir (SQLite db + uploads/outputs) and seeds a clean demo history
 * using our own media from server/samples (scripts/demo-seed-lib.ts). Stop the API server first (it holds the db open).
 */
import { existsSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';

process.env.OPENHIGGSFIELD_CONCURRENCY = '8'; // seed jobs render in parallel
const port = Number(process.env.PORT) || 8787;
const up = await fetch(`http://localhost:${port}/api/health`).then(() => true, () => false);
if (up && !process.argv.includes('--force')) { console.error(`API server is running on :${port}. Stop it first (or pass --force).`); process.exit(1); }

const { DATA_DIR } = await import('../src/config.js');
if (existsSync(DATA_DIR)) for (const f of readdirSync(DATA_DIR)) rmSync(path.join(DATA_DIR, f), { recursive: true, force: true });
mkdirSync(DATA_DIR, { recursive: true });
const { seedDemo } = await import('./demo-seed-lib.js');
let r; try { r = await seedDemo(); } catch (e) { console.error((e as Error).message); process.exit(1); }
for (const j of r.jobs) console.log(`${j.id}  ${j.toolId.padEnd(16)} ${j.status.padEnd(7)} ${j.outputs.map((o) => o.url).join(' ')}`);
(await import('../src/db.js')).db.close();
console.log(`Seeded ${r.jobs.length} jobs, 1 project → ${DATA_DIR}`);
process.exit(0);
