/**
 * Unrestricted key reads, for the app's core only (security review 2026-11-07, F5). Keys live in the process environment (the env file
 * loaded at start, plus keys saved in Settings). Plugins never import this file: they read the keys they declared through ctx.keys
 * (kernel/keys.ts). test/plugin-keys.test.ts fails when a file in plugins-builtin/ imports it.
 *
 * Who uses it: the kernel (ctx.keys itself, the Plugins page's "is the key set"), Settings → Connections, the balance reads, and the
 * server code that is still the `legacy` plugin (declared '*'), until that code moves into plugins that declare their own keys.
 */
import type { RouteDef } from '../routing/types.js';
import { mockKeys, NOT_MOCKED } from '../routing/keys.js';

export type KeyRef = Pick<RouteDef, 'envKey' | 'envAliases'>;
/** How code reads a route's key: ctx.keys inside a plugin (its declared keys only), CORE_KEYS in the core. */
export interface KeyReader { configured(r: KeyRef): boolean; value(r: KeyRef): string | undefined; get(name: string): string | undefined }

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

/** Every key: for the core's routing code that runs without a plugin (scripts, tests, services/placesBuiltin.ts). */
export const CORE_KEYS: KeyReader = { configured: (r) => keyConfigured(r.envKey, r.envAliases), value: keyValue, get: readKey };
