/**
 * Media hygiene (BUG-HUNT-4 G6/G10): which files under DATA_DIR are still referenced, and removing a purged job's files.
 * A file is "live" when any remaining job (in memory: the jobs table may lag the 400 ms flush), element, project, upload,
 * job meta or kv value mentions it, as an absolute DATA_DIR path or a /files/<name> URL. Purge removes a job's inputs,
 * outputs and their cached thumbnails only when nothing else references them (inputs can be shared, e.g. reshoot / reuse).
 */
import { existsSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { db } from './db.js';
import { jobs } from './jobs.js';

const ROOT = DATA_DIR.endsWith(path.sep) ? DATA_DIR : DATA_DIR + path.sep;
/** DATA_DIR-relative file names a value mentions (absolute DATA_DIR paths and /files/ URLs; never '..'). */
export function fileRefs(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === 'string') {
    let rel: string | null = null;
    if (v.startsWith(ROOT)) rel = v.slice(ROOT.length); else { const m = /^\/files\/([^?#]+)/.exec(v); if (m) rel = decodeURIComponent(m[1]); }
    if (rel && !rel.split(/[\\/]/).includes('..') && rel !== '' && !rel.endsWith('.db')) out.add(rel);
  } else if (Array.isArray(v)) for (const x of v) fileRefs(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) fileRefs(x, out);
  return out;
}
/** Every file referenced by something other than the jobs in `except`. */
export function liveRefs(except: Set<string> = new Set()): Set<string> {
  const out = new Set<string>();
  for (const [id, j] of jobs) if (!except.has(id)) fileRefs(j, out);
  for (const t of ['elements', 'projects', 'uploads', 'job_meta', 'kv', 'canvas_boards', 'films']) { /* canvas_boards: pictures and results placed on a board; films: stills, frames and previews a film uses */
    for (const r of db.prepare(`SELECT id, data FROM ${t}`).all() as { id: string; data: string }[]) {
      if (t === 'job_meta' && except.has(r.id)) continue;
      if (t === 'kv' && r.id === 'outputMeta.v2') continue; /* a size / poster cache keyed by URL (outputMeta.ts), not a use: it must not keep a purged result's file */
      try { fileRefs(JSON.parse(r.data), out); } catch { /* not JSON */ }
    }
  }
  return out;
}
/** Cached thumbnails (mediaLibrary.thumbFor) of a DATA_DIR file. */
export const thumbsOf = (rel: string) => ['jpg', 'png'].map((x) => path.join('thumbs', `files-${rel.replace(/\//g, '_')}.${x}`));
/** Remove the given files (and their thumbs) unless still live. → {files, bytes, kept}. */
export function removeUnreferenced(rels: Iterable<string>, live: Set<string>) {
  let files = 0, bytes = 0, kept = 0;
  for (const rel of rels) {
    if (live.has(rel)) { kept++; continue; }
    for (const r of [rel, ...thumbsOf(rel)]) {
      const p = path.join(DATA_DIR, r); if (!p.startsWith(ROOT) || !existsSync(p)) continue;
      try { const s = statSync(p); if (!s.isFile()) continue; bytes += s.size; rmSync(p, { force: true }); files++; } catch { /* gone */ }
    }
  }
  return { files, bytes, kept };
}
