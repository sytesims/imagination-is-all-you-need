/**
 * ctx.keys (plan §3.2, §3.6, R12): provider keys, read only through here. Keys live in the process environment (the env file the API loads
 * at start, plus keys saved in Settings, which storeKey/removeKey write through setKey/unsetKey). Values are never logged, printed or returned
 * by any route; settings and --dump-config never contain them.
 *
 * A plugin gets only the keys it declares (PluginDef.keys, e.g. place-fal: ['OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY']); asking ctx.keys for any
 * other one throws KeyNotDeclared. The `legacy` plugin (today's server) declares '*' and the module functions below (keyValue, keyConfigured,
 * readKey) stay unrestricted for code that has no ctx yet: they move behind ctx.keys as that code becomes plugins.
 */
import { Service, type Context } from 'cordis';
import type { RouteDef } from '../routing/types.js';
import { mockKeys, NOT_MOCKED } from '../routing/keys.js';

export type KeyRef = Pick<RouteDef, 'envKey' | 'envAliases'>;

/** The value of one key variable (trimmed; blank = unset). */
export const readKey = (name: string): string | undefined => process.env[name]?.trim() || undefined;
/** The first set variable among names (a name, never a value). */
export const keyVarInUse = (names: string[]): string | null => names.find((k) => !!readKey(k)) ?? null;
/** Save or remove a key for this process (Settings → Connections; the env file is written by routing/settings.ts). */
export const setKey = (name: string, value: string) => { process.env[name] = value; };
export const unsetKey = (name: string) => { delete process.env[name]; };

/** A route's key: its envKey, else its first alias that is set. */
export const keyValue = (r: KeyRef): string | undefined => (r.envKey ? [r.envKey, ...(r.envAliases ?? [])].map(readKey).find(Boolean) : undefined);
/** Is the key set (or mocked: OPENHIGGSFIELD_MOCK_KEYS on the mock backend, routing/keys.ts)? A route without a key always is. */
export const keyConfigured = (envKey: string | null | undefined, aliases: string[] = []): boolean =>
  !envKey || (mockKeys() && !NOT_MOCKED.has(envKey)) || [envKey, ...aliases].some((k) => !!readKey(k));

/** How code reads a route's key: ctx.keys inside a plugin (its declared keys only), ANY_KEY where routing code runs without booting
 *  (scripts and tests: services/places.ts BUILT_IN). */
export interface KeyReader { configured(r: KeyRef): boolean; value(r: KeyRef): string | undefined; get(name: string): string | undefined }
export const ANY_KEY: KeyReader = { configured: (r) => keyConfigured(r.envKey, r.envAliases), value: keyValue, get: readKey };

export class KeyNotDeclared extends Error {
  constructor(plugin: string, names: string[]) { super(`ctx.keys: plugin "${plugin}" did not declare ${names.join(', ')} (add it to the plugin's keys)`); this.name = 'KeyNotDeclared'; }
}

/** Keys each plugin declared (kernel/index.ts mount() fills it). '*' = every key (legacy only). */
const declared = new Map<string, ReadonlySet<string> | '*'>();
export const declareKeys = (plugin: string, keys: readonly string[] | '*' | undefined) => { declared.set(plugin, keys === '*' ? '*' : new Set(keys ?? [])); };
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
