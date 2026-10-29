/**
 * BH4 #3 (G7/G10 backlog): one-off report of files in DATA_DIR that nothing references.
 * DRY RUN by default: opens the DB read-only and touches nothing.
 * `--apply --yes` is REVERSIBLE: it MOVES the selected files into a quarantine folder (default <repo>/quarantine/orphans, or ORPHAN_QUARANTINE /
 * --quarantine; keeps each file's path relative to DATA_DIR) and appends {path, rel, size, category} rows to <quarantine>/manifest.json. Nothing is deleted.
 * `--restore` moves every quarantined file listed in the manifest back to its original path (skips any path that exists again).
 * --cats picks the categories --apply moves: input,pre (default), output, thumb. Review-only files are never moved.
 * Usage: npx tsx scripts/orphan-uploads.ts [--data <DATA_DIR>] [--min-age-min 30] [--samples 8] [--json] [--apply --yes [--cats input,pre] | --restore] [--quarantine <dir>]
 * A file is referenced when any row of jobs, job_meta, elements, projects, uploads or kv mentions it (a data-dir-relative path field, an absolute data path or /files/<name>).
 * Files newer than --min-age-min (default 30) are skipped: the jobs table can lag a live server by a few hundred ms and uploads may be in flight.
 * Thumbnails (thumbs/files-<name>.jpg|png) are orphans when their source file is gone or unreferenced. posters/ and voice-previews/ are app caches: not touched.
 */
import Database from 'better-sqlite3';
import { readdirSync, statSync, existsSync, renameSync, copyFileSync, unlinkSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRefs } from '../src/mediaPaths.ts';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(arg('--data') ?? process.env.OPENHIGGSFIELD_DATA_DIR ?? path.join(HERE, '../data'));
const MIN_AGE = Number(arg('--min-age-min', '30')) * 60_000; const SAMPLES = Number(arg('--samples', '8'));
const APPLY = process.argv.includes('--apply') && process.argv.includes('--yes');
const ROOT = DATA + path.sep;
const QDIR = path.resolve(arg('--quarantine') ?? process.env.ORPHAN_QUARANTINE ?? path.join(HERE, '../../quarantine/orphans')); const MANIFEST = path.join(QDIR, 'manifest.json');
type QEntry = { path: string; rel: string; size: number; category: string; movedAt: string; restoredAt?: string | null };
const readManifest = (): { dataDir: string; entries: QEntry[] } => existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { dataDir: DATA, entries: [] };
const move = (from: string, to: string) => { mkdirSync(path.dirname(to), { recursive: true }); try { renameSync(from, to); } catch (e: any) { if (e.code !== 'EXDEV') throw e; copyFileSync(from, to); unlinkSync(from); } };
if (process.argv.includes('--restore')) { // put every quarantined file back where it was
  const m = readManifest(); let n = 0, bytes = 0, skipped = 0, missing = 0;
  for (const e of m.entries) { if (e.restoredAt) continue; const q = path.join(QDIR, e.rel); if (!existsSync(q)) { missing++; continue; }
    const dest = path.join(DATA, e.rel); // restore into --data (the data dir may have moved since, e.g. the openjutsu → openhiggsfield folder rename)
    if (existsSync(dest)) { skipped++; continue; } move(q, dest); e.restoredAt = new Date().toISOString(); n++; bytes += e.size; }
  writeFileSync(MANIFEST, JSON.stringify(m, null, 1)); console.log(`RESTORE from ${QDIR}: moved back ${n} files / ${(bytes / 1048576).toFixed(1)} MB; skipped ${skipped} (original path exists again), ${missing} not in quarantine`); process.exit(0);
}
const CATS = new Set((arg('--cats', 'input,pre') ?? '').split(',').map((x) => x.trim()));
const catKey = (c: string) => c.startsWith('precheck') ? 'pre' : c.startsWith('input') ? 'input' : c.startsWith('output') ? 'output' : c.startsWith('thumbnail') ? 'thumb' : 'review';
const DBF = ['openhiggsfield.db', 'openjutsu.db'].map((f) => path.join(DATA, f)).find(existsSync);
if (!DBF) { console.error(`no database in ${DATA}`); process.exit(2); }

const refs = new Set<string>();
const walk = (v: unknown): void => { collectRefs(v, DATA, refs); }; // relative path fields (BUG-HUNT-8), absolute data paths, /files/ URLs
const db = new Database(DBF, { readonly: true, fileMustExist: true });
const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name).filter((t) => ['jobs', 'job_meta', 'elements', 'projects', 'uploads', 'kv'].includes(t));
for (const t of tables) for (const r of db.prepare(`SELECT data FROM ${t}`).iterate() as Iterable<{ data: string }>) { try { walk(JSON.parse(r.data)); } catch { /* skip */ } }
const jobIds = new Set((db.prepare('SELECT id FROM jobs').all() as { id: string }[]).map((r) => r.id)); db.close();

type Cat = 'precheck pre-*' | 'input of no job (rejected/truncated/purged)' | 'output of no job' | 'thumbnail of a missing/unreferenced file' | 'review only: unreferenced but its job exists, or not job-named (never removed by --apply)';
const now = Date.now(); const out: Record<string, { files: number; bytes: number; samples: string[] }> = {}; const victims: [string, number, string][] = []; let skippedYoung = 0, keptRefs = 0, scanned = 0;
const all: Record<string, [string, number][]> = {};
const add = (cat: Cat, rel: string, size: number) => { const c = (out[cat] ??= { files: 0, bytes: 0, samples: [] }); c.files++; c.bytes += size; (all[cat] ??= []).push([rel, size]); if (!cat.startsWith('review only') && CATS.has(catKey(cat))) victims.push([rel, size, cat]); };
for (const f of readdirSync(DATA)) {
  const p = path.join(DATA, f); const s = statSync(p); if (!s.isFile() || /\.db(-wal|-shm|-journal)?$/.test(f)) continue; scanned++;
  if (refs.has(f)) { keptRefs++; continue; } if (now - s.mtimeMs < MIN_AGE) { skippedYoung++; continue; }
  const m = /^([0-9a-f]{8})-([a-zA-Z]+)/.exec(f);
  const cat: Cat = f.startsWith('pre-') ? 'precheck pre-*' : m && !jobIds.has(m[1]) ? (/out/i.test(m[2]) || /-g\d+-out/.test(f) ? 'output of no job' : 'input of no job (rejected/truncated/purged)') : 'review only: unreferenced but its job exists, or not job-named (never removed by --apply)';
  add(cat, f, s.size);
}
const TD = path.join(DATA, 'thumbs');
if (existsSync(TD)) for (const f of readdirSync(TD)) {
  const m = /^files-(.+)\.(jpg|png)$/.exec(f); if (!m) continue; const p = path.join(TD, f); const s = statSync(p); scanned++;
  const src = m[1]; if (refs.has(src) && existsSync(path.join(DATA, src))) { keptRefs++; continue; } if (now - s.mtimeMs < MIN_AGE) { skippedYoung++; continue; }
  add('thumbnail of a missing/unreferenced file', path.join('thumbs', f), s.size);
}
for (const [k, xs] of Object.entries(all)) out[k].samples = xs.sort((a, b) => b[1] - a[1]).slice(0, SAMPLES).map(([r, z]) => `${r} (${(z / 1048576).toFixed(1)} MB)`); // largest first
const total = Object.values(out).reduce((a, c) => ({ files: a.files + c.files, bytes: a.bytes + c.bytes }), { files: 0, bytes: 0 });
const report = { mode: APPLY ? 'apply' : 'dry-run', dataDir: DATA, db: path.basename(DBF), scanned, referenced: keptRefs, skippedNewerThanMin: MIN_AGE / 60_000, skippedYoung, orphans: total, removableByApply: victims.length, totalMB: +(total.bytes / 1048576).toFixed(1), byCategory: Object.fromEntries(Object.entries(out).map(([k, c]) => [k, { files: c.files, MB: +(c.bytes / 1048576).toFixed(1), samples: c.samples }])) };
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else { console.log(`${report.mode.toUpperCase()} ${DATA}: scanned ${scanned}, referenced ${keptRefs}, too new ${skippedYoung}, ORPHANS ${total.files} files / ${report.totalMB} MB (${victims.length} in --cats ${[...CATS].join(',')} would be moved to quarantine by --apply; review-only files are never moved)`); for (const [k, c] of Object.entries(report.byCategory)) { console.log(`  ${k}: ${c.files} files, ${c.MB} MB`); for (const s of c.samples) console.log(`    - ${s}`); } }
if (APPLY) { // reversible: move into the quarantine, keep relative paths, manifest first so a crash mid-way still lists what moved
  const m = readManifest(); let n = 0, bytes = 0; mkdirSync(QDIR, { recursive: true });
  for (const [r, size, cat] of victims) { const p = path.join(DATA, r); if (!p.startsWith(ROOT) || !existsSync(p)) continue; const q = path.join(QDIR, r); if (existsSync(q)) continue;
    m.entries.push({ path: p, rel: r, size, category: cat, movedAt: new Date().toISOString(), restoredAt: null }); writeFileSync(MANIFEST, JSON.stringify(m, null, 1)); move(p, q); n++; bytes += size; }
  console.log(`QUARANTINED ${n} files / ${(bytes / 1048576).toFixed(1)} MB (${bytes} bytes) into ${QDIR}; manifest ${MANIFEST}. Undo: npx tsx scripts/orphan-uploads.ts --data ${DATA} --restore --quarantine ${QDIR}`);
}
else console.log('Dry run: nothing moved. To quarantine (reversible, after an explicit OK): --apply --yes [--cats input,pre]; undo with --restore');
