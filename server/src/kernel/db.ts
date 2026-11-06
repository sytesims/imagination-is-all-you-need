/**
 * ctx.db (plan §3.2): the app's one SQLite database (db.ts: better-sqlite3 in <data>/openhiggsfield.db) and its kv table.
 *
 * A plugin owns its tables: their names start with the plugin id (dashes become underscores), e.g. place-fal → place_fal_requests.
 * table('requests') gives that name, ensureTable() creates it as an (id, data JSON) table like the app's own, and kv is the plugin's own corner
 * of the kv table (keys `<plugin>.<key>`). The app's own tables (jobs, ledger, kv, …) are not reachable from here; `legacy` keeps using db.ts.
 */
import { Service, type Context } from 'cordis';
import type Database from 'better-sqlite3';
import { db, getKv, setKv } from '../db.js';

export const tablePrefix = (plugin: string) => `${plugin.replace(/-/g, '_')}_`;
const SAFE = /^[a-z][a-z0-9_]*$/;
/** `<plugin>_<name>`, checked to be a plain SQL identifier. */
export function tableName(plugin: string, name: string): string {
  const t = `${tablePrefix(plugin)}${name}`;
  if (!SAFE.test(t) || !SAFE.test(name)) throw new Error(`ctx.db: bad table name "${name}" for plugin ${plugin} (lower case letters, digits and _ only)`);
  return t;
}

export class DbService extends Service {
  constructor(ctx: Context) { super(ctx, 'db'); }
  private get caller(): string { return (this.ctx as any).fiber?.name ?? 'kernel'; }
  /** The table name this plugin owns: table('requests') → '<plugin>_requests'. */
  table(name: string): string { return tableName(this.caller, name); }
  /** Create '<plugin>_<name>' (id TEXT PRIMARY KEY, data TEXT) if missing, and return its name. */
  ensureTable(name: string): string { const t = this.table(name); db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`); return t; }
  /** A statement on this plugin's tables only (every table the SQL names must start with its prefix). */
  prepare(sql: string): Database.Statement {
    const prefix = tablePrefix(this.caller);
    const named = [...sql.matchAll(/\b(?:from|into|update|join|table(?:\s+if\s+(?:not\s+)?exists)?)\s+["`]?([a-z_][\w]*)/gi)].map((m) => m[1].toLowerCase());
    const foreign = named.filter((t) => !t.startsWith(prefix));
    if (!named.length || foreign.length) throw new Error(`ctx.db: plugin ${this.caller} may only use its own tables (${prefix}*)${foreign.length ? `, not ${foreign.join(', ')}` : ''}`);
    return db.prepare(sql);
  }
  /** The plugin's kv entries: get('x') reads kv '<plugin>.x'. */
  get kv() { const p = this.caller; return { get: <T>(k: string, d: T): T => getKv<T>(`${p}.${k}`, d), set: (k: string, v: unknown) => { setKv(`${p}.${k}`, v); } }; }
}
