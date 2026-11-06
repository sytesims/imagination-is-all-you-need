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

export { Context, Service };

/** Services the kernel provides on ctx (typed here, so plugins see them without importing Cordis). */
declare module 'cordis' {
  interface Context {
    places: PlacesService;
  }
}

/** A built-in or third-party plugin. `inject` names the services its apply needs (e.g. ['places']). */
export interface PluginDef<C = void> {
  name: string;
  inject?: string[];
  apply(ctx: Context, config: C): void | Promise<void>;
}
export const definePlugin = <C = void>(p: PluginDef<C>): PluginDef<C> => p;

/** A fresh plugin tree (boot.ts makes one per process). */
export const createRoot = (): Context => new Context();

/** Mount a plugin and wait until it is applied (throws what its apply threw). */
export async function mount<C>(ctx: Context, p: PluginDef<C> | (new (ctx: Context) => Service<any>), config?: C): Promise<void> {
  await (ctx.plugin as (p: unknown, c?: unknown) => PromiseLike<unknown>)(p, config);
}
