import { existsSync, renameSync } from 'node:fs';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { applyStagedImport } from './backup.js';

/**
 * SQLite persistence (better-sqlite3, synchronous) at `$OPENHIGGSFIELD_DATA_DIR/openhiggsfield.db` (a legacy `openjutsu.db` is renamed on first start).
 * Rows are JSON documents keyed by id so the API shapes stay exactly as before.
 */
mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = path.join(DATA_DIR, 'openhiggsfield.db');
/** One-time migration from the pre-rename filename (openjutsu.db + its -wal/-shm sidecars). */
const LEGACY_DB = path.join(DATA_DIR, 'openjutsu.db');
if (!existsSync(DB_PATH) && existsSync(LEGACY_DB)) {
  for (const suf of ['', '-wal', '-shm']) if (existsSync(LEGACY_DB + suf)) renameSync(LEGACY_DB + suf, DB_PATH + suf);
  console.info('[openhiggsfield] migrated data/openjutsu.db → openhiggsfield.db');
}
/** BH4 #8: a backup staged by POST /api/import is applied here, before the DB opens (see backup.ts applyStagedImport). */
applyStagedImport(DB_PATH);
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
const TABLES = ['jobs', 'ledger', 'job_meta', 'projects', 'elements', 'kv', 'uploads', 'eta_samples', 'spend', 'eta_steps', 'user_looks', 'canvas_boards', 'films'] as const; // films: the Film tab's projects (filmProjects.ts) // canvas_boards: /canvas boards, tldraw snapshot JSON (canvasBoards.ts) // user_looks: looks saved from a result (workflowLooks.ts) // eta_steps: per-step local ETA learning (stepEta.ts) // spend: per-job spend log (billing.ts) // eta_samples: HW-SHAPES B5 learned timings (etaLearn.ts)
export type Table = (typeof TABLES)[number];
for (const t of TABLES) db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);

const stmts = Object.fromEntries(TABLES.map((t) => [t, {
  put: db.prepare(`INSERT INTO ${t} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`),
  del: db.prepare(`DELETE FROM ${t} WHERE id = ?`),
  all: db.prepare(`SELECT id, data FROM ${t}`),
  get: db.prepare(`SELECT data FROM ${t} WHERE id = ?`),
}])) as Record<Table, { put: Database.Statement; del: Database.Statement; all: Database.Statement; get: Database.Statement }>;

/** Writes per table since start (library indexes rebuild when the tables they read have changed: libraryDb.ts). */
export const tableRev = Object.fromEntries(TABLES.map((t) => [t, 0])) as Record<Table, number>;
export const put = (t: Table, id: string | number, v: unknown) => { tableRev[t]++; return stmts[t].put.run(String(id), JSON.stringify(v)); };
export const del = (t: Table, id: string | number) => { tableRev[t]++; return stmts[t].del.run(String(id)); };
export const all = <T>(t: Table): T[] => (stmts[t].all.all() as { data: string }[]).map((r) => JSON.parse(r.data));
export const getKv = <T>(k: string, d: T): T => { const r = stmts.kv.get.get(k) as { data: string } | undefined; return r ? JSON.parse(r.data) : d; };
export const setKv = (k: string, v: unknown) => put('kv', k, v);
export const tx = <T>(fn: () => T) => db.transaction(fn)();
