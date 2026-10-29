/**
 * BUG-HUNT-8 P1: job rows store media paths RELATIVE to the data dir ("demo01-video0.mp4", "voice-previews/x.wav"), never a host path.
 * The live job map keeps them absolute under the CURRENT data dir (toAbsDeep at load), so every reader (Comfy submit/resume, fal request
 * builders, retry, remux, thumbnails) resolves through the data dir; toRelDeep runs on every write (jobs.ts). Pure functions: the data
 * dir is a parameter, so scripts (orphan-uploads, migrations) use them without loading the server config.
 *  - Path fields: keys `path`, `refBatches`, `*Path`, `*Paths` (strings, arrays, nested arrays).
 *  - A stored absolute path counts as ours when it starts with the data dir, any prefix ending in /server/data/ (the old openjutsu and the
 *    openhiggsfield checkouts, other machines) or /data/ (Docker volume). Anything else (an outside file) is left untouched.
 *  - Free text (error messages) only has those prefixes stripped, so no host layout is stored.
 */
import path from 'node:path';

/** Keys whose strings are media paths. Direct a Shot's cameraPath (camera keyframes) only shares the ending. */
export const PATH_KEY = /^(path|refBatches)$|^(?!cameraPath$).*Paths?$/;
const FOREIGN = /^(?:\/.*?\/server\/data|\/data)\/(.+)$/;
const safeRel = (r: string) => !!r && !r.startsWith('/') && !r.split(/[\\/]/).includes('..') && !/^[a-z][a-z0-9+.-]*:/i.test(r);

/** Absolute data path → relative ("" when not ours, so callers keep the value). */
export function relOf(v: string, dataDir: string): string | null {
  const root = path.resolve(dataDir) + path.sep;
  if (v.startsWith(root)) { const r = v.slice(root.length); return safeRel(r) ? r : null; }
  const m = FOREIGN.exec(v); return m && safeRel(m[1]) ? m[1] : null;
}
/** One stored value → absolute under dataDir (relative or foreign data-dir path), else unchanged. */
export function absOf(v: string, dataDir: string): string {
  if (!v) return v; if (!v.startsWith('/')) return safeRel(v) ? path.join(dataDir, v) : v;
  const r = relOf(v, dataDir); return r != null ? path.join(dataDir, r) : v;
}
const stripText = (s: string, dataDir: string) => s.split(path.resolve(dataDir) + path.sep).join('').replace(/(?:\/[^\s'"`]*?\/server\/data)\//g, '');

function mapDeep(o: any, f: (s: string) => string, text: ((s: string) => string) | null, inPath = false): any {
  if (typeof o === 'string') return inPath ? f(o) : text ? text(o) : o;
  if (Array.isArray(o)) { let ch = false; const a = o.map((x) => { const y = mapDeep(x, f, text, inPath); if (y !== x) ch = true; return y; }); return ch ? a : o; }
  if (o && typeof o === 'object') { let ch = false; const r: any = {};
    for (const [k, v] of Object.entries(o)) { const y = mapDeep(v, f, text, inPath || PATH_KEY.test(k)); if (y !== v) ch = true; r[k] = y; }
    return ch ? r : o; }
  return o;
}
/** For storage: path fields relative, host data-dir prefixes stripped from free text. Returns the same object when nothing changes. */
export const toRelDeep = <T>(o: T, dataDir: string): T => mapDeep(o, (s) => relOf(s, dataDir) ?? s, (s) => (s.includes('/') ? stripText(s, dataDir) : s));
/** For the live map: path fields absolute under the current data dir. */
export const toAbsDeep = <T>(o: T, dataDir: string): T => mapDeep(o, (s) => absOf(s, dataDir), null);
/** Every media file (relative to dataDir) a stored row mentions: path fields (relative or absolute) and /files/<name> URLs. */
export function collectRefs(o: unknown, dataDir: string, out = new Set<string>(), inPath = false): Set<string> {
  if (typeof o === 'string') {
    const m = /^\/files\/([^?#]+)/.exec(o); if (m) { const r = decodeURIComponent(m[1]); if (safeRel(r)) out.add(r); return out; }
    if (o.startsWith('/')) { const r = relOf(o, dataDir); if (r) out.add(r); } else if (inPath && safeRel(o)) out.add(o);
  } else if (Array.isArray(o)) o.forEach((x) => collectRefs(x, dataDir, out, inPath));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k.startsWith('/files/')) collectRefs(k, dataDir, out); collectRefs(v, dataDir, out, inPath || PATH_KEY.test(k)); } // kv outputMeta keys are /files/ URLs
  return out;
}
/** One-time boot migration (idempotent): rewrite stored absolute media paths to relative. Returns the rows to write and counts
 *  (values = path-field strings rewritten; prefixes = the host prefixes they had). */
export function migrateRows<T extends { id: string }>(rows: T[], dataDir: string) {
  const changed: T[] = []; let values = 0; const prefixes: Record<string, number> = {};
  for (const r of rows) {
    const rel = mapDeep(r, (s) => { const x = relOf(s, dataDir); if (x == null) return s; values++; const pre = s.slice(0, s.length - x.length); prefixes[pre] = (prefixes[pre] ?? 0) + 1; return x; },
      (s) => (s.includes('/') ? stripText(s, dataDir) : s));
    if (rel !== r) changed.push(rel); }
  return { changed, rows: changed.length, values, prefixes };
}

/** BH10 P2: the migration log names where a path came from without storing a host layout: the current data dir → '<data dir>/',
 *  another checkout's server/data → '<other checkout>/server/data/', a Docker volume → '<docker volume>/data/'. Already-labelled keys stay. */
export function prefixLabel(pre: string, dataDir: string): string {
  if (pre.startsWith('<')) return pre;
  if (path.resolve(pre) === path.resolve(dataDir)) return '<data dir>/';
  if (/\/server\/data\/?$/.test(pre)) return '<other checkout>/server/data/';
  if (/^\/data\/?$/.test(pre)) return '<docker volume>/data/';
  return '<other location>/';
}
export const labelPrefixes = (p: Record<string, number> | undefined, dataDir: string) => {
  const o: Record<string, number> = {}; for (const [k, v] of Object.entries(p ?? {})) { const l = prefixLabel(k, dataDir); o[l] = (o[l] ?? 0) + v; } return o; };
/** Public job input: path fields as /files/ URLs (refBatches) or dropped (*Path, *Paths, path), never a host path. */
export function publicPaths(v: any, dataDir: string): any {
  if (typeof v === 'string') { if (!v.startsWith('/')) return safeRel(v) ? `/files/${v}` : null; if (v.startsWith('/files/')) return v; const r = relOf(v, dataDir); return r != null ? `/files/${r}` : null; }
  if (Array.isArray(v)) return v.map((x) => publicPaths(x, dataDir)).filter((x) => x != null);
  return null;
}
