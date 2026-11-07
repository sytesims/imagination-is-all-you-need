/**
 * After a library backup is applied (backup.ts applyStagedImport, at the next start), before anything reads it (security review
 * 2026-11-07, F3 backup path). A backup made elsewhere replaces the whole database, so it could aim stored addresses at another host:
 *  - job.remote statusUrl / responseUrl / cancelUrl / pollUrl (where a provider request is polled, collected or cancelled, with your key):
 *    removed. The request id stays, so the job still shows what it was; a run from the backup can't be picked up or cancelled from here.
 *  - the job webhooks (kv `webhooks`: where job events are sent): removed.
 *  - addresses in saved plugin settings (kv `settings.<plugin>`, e.g. a place's baseUrl): removed, so the plugin's own default is used.
 * (The saved ComfyUI address is already ignored at start unless it is this computer, your network or Comfy's own host: hardware.ts.)
 * The stored-handle host checks (providers/fal.ts falHandleSafe, providers/direct.ts directPollSafe) still apply to every job.
 */
import type Database from 'better-sqlite3';

export const REMOTE_URL_FIELDS = ['statusUrl', 'responseUrl', 'cancelUrl', 'pollUrl'] as const;
const looksLikeUrl = (v: unknown) => typeof v === 'string' && /^\s*[a-z][a-z0-9+.-]*:\/\//i.test(v);

/** Drop the URL fields of a job's stored request. true when something changed. */
export function scrubRemote(job: { remote?: Record<string, unknown> | null } | null | undefined): boolean {
  const h = job?.remote; if (!h || typeof h !== 'object') return false;
  let changed = false;
  for (const f of REMOTE_URL_FIELDS) if (f in h) { delete h[f]; changed = true; }
  return changed;
}
/** Drop every address from one plugin's saved settings. true when something changed. */
export function scrubSettings(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  let changed = false;
  for (const [k, x] of Object.entries(v)) if (looksLikeUrl(x) || /url$/i.test(k)) { delete (v as Record<string, unknown>)[k]; changed = true; }
  return changed;
}

/** Run once on the database a backup just replaced. Returns what it changed (counts only). */
export function scrubImportedLibrary(db: Database.Database) {
  const out = { jobs: 0, webhooks: false, settings: 0 };
  const read = (table: string) => db.prepare(`SELECT id, data FROM ${table}`).all() as { id: string; data: string }[];
  const write = (table: string, id: string, v: unknown) => db.prepare(`UPDATE ${table} SET data = ? WHERE id = ?`).run(JSON.stringify(v), id);
  const parse = (s: string): any => { try { return JSON.parse(s); } catch { return null; } };
  db.transaction(() => {
    for (const r of read('jobs')) { const j = parse(r.data); if (scrubRemote(j)) { write('jobs', r.id, j); out.jobs++; } }
    for (const r of read('kv')) {
      if (r.id === 'webhooks') { db.prepare('DELETE FROM kv WHERE id = ?').run(r.id); out.webhooks = true; continue; }
      if (r.id.startsWith('settings.')) { const v = parse(r.data); if (scrubSettings(v)) { write('kv', r.id, v); out.settings++; } }
    }
  })();
  return out;
}
