/**
 * BH4 #8 (G11): whole-library export and import.
 * Export = one .tar.gz: manifest.json + openhiggsfield.db (a consistent SQLite online-backup snapshot) + media (DATA_DIR files and folders,
 * without regenerable caches: thumbs/, posters/, precheck temps). Import stages an archive and applies it at the next start, before the
 * DB opens: the current DB moves to DATA_DIR/backups/pre-import-<time>/, the archive's DB replaces it, its media are added (same names
 * overwritten, nothing else deleted). Uses the system tar (GNU tar), never /tmp: temp dirs live under DATA_DIR.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

export const EXPORT_FORMAT = 'openhiggsfield-export';
export const EXPORT_VERSION = 1;
export const STAGE_DIR = path.join(DATA_DIR, '.import-staged');
export const EXPORT_TMP = path.join(DATA_DIR, '.export-tmp');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
/** Windows: the tar that comes with Windows (System32, bsdtar). A GNU tar earlier on PATH (Git for Windows' usr\bin) reads "C:\…" as a remote host. */
const SYS_TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : '';
export const TAR = SYS_TAR && existsSync(SYS_TAR) ? SYS_TAR : 'tar';
/** Not exported: DB files (the snapshot replaces them), caches that are rebuilt on demand, temps and our own work dirs. */
const SKIP_DIRS = new Set(['thumbs', 'posters', '.export-tmp', '.import-staged', '.import-upload', 'backups']);
export const isMediaEntry = (name: string, dir: boolean) => dir ? !SKIP_DIRS.has(name) && !name.startsWith('.') : !/\.db(-wal|-shm|-journal)?$/.test(name) && !/^pre-[0-9a-f]{8}\./.test(name) && !name.startsWith('.');
export function mediaEntries() {
  const out: { name: string; dir: boolean; bytes: number }[] = [];
  for (const name of readdirSync(DATA_DIR)) { const st = statSync(path.join(DATA_DIR, name)); const dir = st.isDirectory(); if ((st.isFile() || dir) && isMediaEntry(name, dir)) out.push({ name, dir, bytes: dir ? 0 : st.size }); }
  return out;
}
/** BUG-HUNT-8: export only media a row references. Directories are expanded to their files; a file no row of jobs, job_meta, elements,
 *  projects, uploads or kv mentions is an orphan and goes to the manifest's excluded[] instead (files younger than RECENT_MS are kept:
 *  an upload can land a moment before its row). */
export const RECENT_MS = 10 * 60_000;
export function exportSelection(refs: Set<string>, now = Date.now()) {
  const files: { rel: string; bytes: number }[] = []; const orphans: { path: string; bytes: number; reason: 'orphan' }[] = [];
  // rel uses / on every system: refs come from /files/ URLs (a/b) and stored paths (a\b on Windows), and tar takes / everywhere
  const want = new Set([...refs].map((r) => r.replace(/\\/g, '/')));
  const visit = (rel: string) => { const p = path.join(DATA_DIR, rel); const st = statSync(p);
    if (st.isDirectory()) { for (const n of readdirSync(p)) if (!n.startsWith('.')) visit(`${rel}/${n}`); return; }
    if (!st.isFile()) return; if (want.has(rel) || now - st.mtimeMs < RECENT_MS) files.push({ rel, bytes: st.size }); else orphans.push({ path: rel, bytes: st.size, reason: 'orphan' }); };
  for (const m of mediaEntries()) visit(m.name);
  return { files, orphans };
}
/** Applied at boot (db.ts) before the DB opens. Returns what happened, or null when nothing is staged. */
export function applyStagedImport(dbPath: string) {
  const ready = path.join(STAGE_DIR, 'READY'); if (!existsSync(ready)) return null;
  try {
    const stagedDb = path.join(STAGE_DIR, 'openhiggsfield.db'); if (!existsSync(stagedDb)) throw new Error('staged import has no openhiggsfield.db');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const keep = path.join(BACKUPS_DIR, `pre-import-${stamp}`); mkdirSync(keep, { recursive: true });
    for (const suf of ['', '-wal', '-shm']) if (existsSync(dbPath + suf)) renameSync(dbPath + suf, path.join(keep, path.basename(dbPath) + suf));
    renameSync(stagedDb, dbPath);
    let media = 0; for (const name of readdirSync(STAGE_DIR)) { if (['READY', 'manifest.json'].includes(name)) continue; const src = path.join(STAGE_DIR, name); const st = statSync(src);
      if (!isMediaEntry(name, st.isDirectory())) continue; cpSync(src, path.join(DATA_DIR, name), { recursive: true, force: true }); media++; }
    const manifest = existsSync(path.join(STAGE_DIR, 'manifest.json')) ? JSON.parse(readFileSync(path.join(STAGE_DIR, 'manifest.json'), 'utf8')) : null;
    writeFileSync(path.join(keep, 'IMPORT-LOG.json'), JSON.stringify({ appliedAt: new Date().toISOString(), previousDbKeptHere: true, mediaEntries: media, manifest }, null, 2));
    rmSync(STAGE_DIR, { recursive: true, force: true });
    console.info(`[openhiggsfield] import applied: database replaced (previous one kept in ${path.relative(DATA_DIR, keep)}), ${media} media entries added`);
    return { applied: true, keptIn: keep, media };
  } catch (e: any) { console.error('[openhiggsfield] staged import NOT applied:', e?.message); try { renameSync(ready, path.join(STAGE_DIR, 'FAILED')); } catch { /* */ } return { applied: false, error: String(e?.message) }; }
}
