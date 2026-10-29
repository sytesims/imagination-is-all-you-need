/**
 * One copy per file (media picker, 2026-10-25). Every file a user hands the app (POST /api/media, a job's upload slots) is hashed (SHA-256).
 *  - POST /api/media names uploads by content (upl-<hash16>.<ext>): the same file uploaded twice is one Uploads entry.
 *  - Job inputs keep their per-job names (<job id>-<field><n>.<ext>, so purge, reuse and cleanup work as before), but a file whose bytes are
 *    already on disk becomes a hard link to that copy: the bytes are stored once. If links are not possible (another disk), nothing changes.
 *  - Library references: a slot can name a file the app already has (`@file:<field>` = /files/<name>, sent by the picker for a picked upload
 *    or generation). It must be a known upload, or an input / output of a job that is not in Trash; it is linked in under the job's own name.
 *  - The Uploads listing folds files with the same content (same inode, or same size + hash for copies made before this) into one entry.
 * The hash index (table media_hash) only speeds up linking; it never keeps a file alive (media GC ignores it).
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, linkSync, copyFileSync, renameSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { db, all } from './db.js';
import { jobs } from './jobs.js';
import * as lib from './library.js';

db.exec('CREATE TABLE IF NOT EXISTS media_hash (hash TEXT PRIMARY KEY, rel TEXT NOT NULL, size INTEGER NOT NULL)');
const qGet = db.prepare('SELECT rel, size FROM media_hash WHERE hash = ?');
const qPut = db.prepare('INSERT INTO media_hash (hash, rel, size) VALUES (?, ?, ?) ON CONFLICT(hash) DO UPDATE SET rel = excluded.rel, size = excluded.size');

const safeRel = (r: string) => !!r && !r.startsWith('/') && !r.split(/[\\/]/).includes('..') && !/^[a-z][a-z0-9+.-]*:/i.test(r) && !r.endsWith('.db');
export const absOfRel = (rel: string) => path.join(DATA_DIR, rel);

export function hashFile(abs: string): Promise<string> {
  return new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(abs).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej); });
}
/** Hard link src → dst (replacing dst atomically); a plain copy when links fail (another disk). */
export function linkOrCopy(srcAbs: string, dstAbs: string) {
  const tmp = `${dstAbs}.lnk-${process.pid}`;
  try { rmSync(tmp, { force: true }); linkSync(srcAbs, tmp); renameSync(tmp, dstAbs); return 'link' as const; }
  catch { rmSync(tmp, { force: true }); copyFileSync(srcAbs, dstAbs); return 'copy' as const; }
}
/** After a file is written under DATA_DIR: if the same bytes are already stored, make `rel` a hard link to them. Never throws. */
export function dedupe(rel: string, hash: string): 'linked' | 'first' | 'skipped' {
  try {
    const abs = absOfRel(rel); const st = statSync(abs);
    const row = qGet.get(hash) as { rel: string; size: number } | undefined;
    if (row && row.rel !== rel && safeRel(row.rel)) {
      const canon = absOfRel(row.rel);
      if (existsSync(canon)) { const cs = statSync(canon);
        if (cs.size === st.size && cs.size === row.size) { if (cs.ino === st.ino && cs.dev === st.dev) return 'linked'; const tmp = `${abs}.lnk-${process.pid}`;
          try { rmSync(tmp, { force: true }); linkSync(canon, tmp); renameSync(tmp, abs); return 'linked'; } catch { rmSync(tmp, { force: true }); return 'skipped'; } } }
    }
    qPut.run(hash, rel, st.size); return 'first';
  } catch { return 'skipped'; }
}
export const rememberHash = (rel: string, hash: string, size: number) => { try { qPut.run(hash, rel, size); } catch { /* index only */ } };
export const lookupHash = (hash: string): string | null => { const row = qGet.get(hash) as { rel: string } | undefined; return row && safeRel(row.rel) && existsSync(absOfRel(row.rel)) ? row.rel : null; };

/** Files of the media library the user may reuse by reference: their uploads, and inputs / outputs of jobs not in Trash. */
export function libraryRel(url: string): string | null {
  const m = /^\/files\/([^?#]+)$/.exec(url ?? ''); if (!m) return null;
  let rel: string; try { rel = decodeURIComponent(m[1]); } catch { return null; }
  if (!safeRel(rel) || !existsSync(absOfRel(rel)) || !statSync(absOfRel(rel)).isFile()) return null;
  const want = `/files/${rel}`; const abs = absOfRel(rel);
  if (all<{ url: string }>('uploads').some((u) => u.url === want) || lib.listElements().some((e) => e.url === want)) return rel;
  const mentions = (v: unknown): boolean => {
    if (typeof v === 'string') return v === want || v === abs || v === rel;
    if (Array.isArray(v)) return v.some(mentions);
    if (v && typeof v === 'object') return Object.values(v).some(mentions);
    return false;
  };
  for (const j of jobs.values()) {
    if (lib.metaOf(j.id).deletedAt) continue;
    if ((j.outputs ?? []).some((o) => o.url === want) || mentions(j.input)) return rel;
  }
  return null;
}

/** Fold key for the Uploads listing: same inode → same key; else size + content hash (cached by size + mtime). */
const hashCache = new Map<string, { k: string; h: string }>();
export async function foldKeys(rels: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>(); const bySize = new Map<number, string[]>(); const ino = new Map<string, string>();
  for (const rel of rels) {
    try { const st = statSync(absOfRel(rel)); const ik = `${st.dev}:${st.ino}`;
      if (ino.has(ik)) { out.set(rel, ino.get(ik)!); continue; } ino.set(ik, `i:${ik}`); out.set(rel, `i:${ik}`);
      (bySize.get(st.size) ?? bySize.set(st.size, []).get(st.size)!).push(rel);
    } catch { out.set(rel, `x:${rel}`); }
  }
  for (const [, group] of bySize) {
    if (group.length < 2) continue; const seen = new Map<string, string>();
    for (const rel of group) {
      try { const st = statSync(absOfRel(rel)); const ck = `${st.size}:${st.mtimeMs}`; let c = hashCache.get(rel);
        if (!c || c.k !== ck) { c = { k: ck, h: await hashFile(absOfRel(rel)) }; hashCache.set(rel, c); }
        const first = seen.get(c.h); const mine = out.get(rel)!;
        if (first) { for (const [r, k] of out) if (k === mine) out.set(r, first); } else seen.set(c.h, mine);
      } catch { /* keep inode key */ }
    }
  }
  return out;
}
