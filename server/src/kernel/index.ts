/**
 * The kernel's one door to Cordis (plan R1). Server code and plugins import Context, Service and definePlugin from here, never from
 * 'cordis' itself, so a Cordis change (it is a release candidate, "API not yet stable") is fixed in this file only.
 *
 * Cordis basics we rely on (cordis 4.0.0-rc.12, pinned exactly in server/package.json):
 *  - a plugin is { name, inject?, apply(ctx, config) }; ctx.plugin(p) returns a fiber you can await (it rejects when apply throws);
 *  - inject lists the services a plugin needs: its apply waits until they exist;
 *  - whatever a plugin registers through ctx.effect (our services do this for it) is undone when the plugin is disposed.
 */
import { Context, Service } from 'cordis';
import type { PlacesService } from '../services/places.js';
import type { HttpService } from './http.js';
import type { SettingsService } from './settings.js';
import type { DbService } from './db.js';
import type { KeysService } from './keys.js';
import { declareKeys } from './keys.js';

export { Context, Service };

/** Services the kernel provides on ctx (typed here, so plugins see them without importing Cordis). */
declare module 'cordis' {
  interface Context {
    places: PlacesService;
    http: HttpService;
    settings: SettingsService;
    db: DbService;
    keys: KeysService;
  }
}

/** A built-in or third-party plugin. `inject` names the services its apply needs (e.g. ['places']). */
export interface PluginDef<C = void> {
  name: string;
  inject?: string[];
  /** The key variables it may read through ctx.keys (names only, e.g. ['OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY']); '*' = all (legacy only). */
  keys?: readonly string[] | '*';
  apply(ctx: Context, config: C): void | Promise<void>;
}
/** Declares the plugin (and its keys: ctx.keys gives it only those). */
export const definePlugin = <C = void>(p: PluginDef<C>): PluginDef<C> => { declareKeys(p.name, p.keys); return p; };

/** A fresh plugin tree (boot.ts makes one per process). */
export const createRoot = (): Context => new Context();

/** What mount() mounted, in order (--dump-config lists them with their state). */
export const mounted: { name: string; fiber: { state: number; dispose(): Promise<void> } }[] = [];
const STATES = ['pending', 'loading', 'active', 'failed', 'disposed'];
export const fiberState = (f: { state: number }) => STATES[f.state] ?? String(f.state);

/** Mount a plugin and wait until it is applied (throws what its apply threw). */
export async function mount<C>(ctx: Context, p: PluginDef<C> | (new (ctx: Context) => Service<any>), config?: C): Promise<void> {
  if (typeof p === 'object') declareKeys(p.name, p.keys);
  const fiber = (ctx.plugin as (p: unknown, c?: unknown) => any)(p, config);
  mounted.push({ name: typeof p === 'object' ? p.name : `${String((p as any).name).replace(/Service$/, '').toLowerCase()} (kernel service)`, fiber }); await fiber;
}
