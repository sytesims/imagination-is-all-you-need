/**
 * ctx.keys (plan §3.2, §3.6, R12; security review 2026-11-07, F5): a plugin reads only the keys it declares (PluginDef.keys, e.g.
 * place-fal: ['OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY']); asking for any other one throws KeyNotDeclared. Values are never logged, printed or
 * returned by any route; settings and --dump-config never contain them.
 *
 * Least privilege, NOT a sandbox: code plugins run inside the server process, where keys sit in process.env, so code that wants to
 * misbehave could still reach them. That is why only our own (official) code plugins run today; plugins made by others are refused
 * (kernel/switchboard.ts) until they can run out of process. ctx.keys keeps honest plugins to what they declared and makes a new key
 * request visible (the permission diff on updates).
 *
 * Only `legacy` (today's server core) may declare '*'. Unrestricted reads for the core live in kernel/coreKeys.ts, which plugins never import.
 */
import { Service, type Context } from 'cordis';
import { readKey, keyValue, keyConfigured, type KeyRef } from './coreKeys.js';

export type { KeyRef, KeyReader } from './coreKeys.js';

export class KeyNotDeclared extends Error {
  constructor(plugin: string, names: string[]) { super(`ctx.keys: plugin "${plugin}" did not declare ${names.join(', ')} (add it to the plugin's keys)`); this.name = 'KeyNotDeclared'; }
}

/** Keys each plugin declared (kernel/index.ts mount() fills it). '*' = every key (legacy only). */
const declared = new Map<string, ReadonlySet<string> | '*'>();
/** The one plugin that may read every key, until its code moves into plugins that declare their own. */
export const ALL_KEYS_PLUGIN = 'legacy';
export const declareKeys = (plugin: string, keys: readonly string[] | '*' | undefined) => {
  if (keys === '*' && plugin !== ALL_KEYS_PLUGIN) throw new Error(`plugin "${plugin}": only the server core may read every key; list the keys it needs`);
  declared.set(plugin, keys === '*' ? '*' : new Set(keys ?? []));
};
export const declaredKeys = (plugin: string): string[] | '*' => { const d = declared.get(plugin); return d === '*' ? '*' : [...(d ?? [])]; };

/** The kernel service: ctx.keys, scoped to the calling plugin's declared keys. */
export class KeysService extends Service {
  constructor(ctx: Context) { super(ctx, 'keys'); }
  private get caller(): string { return (this.ctx as any).fiber?.name ?? 'root'; }
  /** Throws unless the calling plugin declared every name. */
  private check(names: (string | null | undefined)[]) {
    const plugin = this.caller; const d = declared.get(plugin); if (d === '*') return;
    const missing = names.filter((n): n is string => !!n && !d?.has(n)); if (missing.length) throw new KeyNotDeclared(plugin, missing);
  }
  /** The value of a key variable the plugin declared (server-side only: never return or log it). */
  get(name: string): string | undefined { this.check([name]); return readKey(name); }
  /** The route's key (envKey, else an alias). */
  value(r: KeyRef): string | undefined { this.check([r.envKey, ...(r.envAliases ?? [])]); return keyValue(r); }
  /** Is the route's key set (or mocked)? */
  configured(r: KeyRef): boolean { this.check([r.envKey, ...(r.envAliases ?? [])]); return keyConfigured(r.envKey, r.envAliases); }
  /** The keys this plugin may read (names only). */
  declared(): string[] | '*' { return declaredKeys(this.caller); }
}
