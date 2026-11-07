/**
 * ctx.http (plan §3.2, risks R2 and R4): the one Fastify server, wrapped so plugins can't break what must come first or last.
 *
 *  - hook(name, fn, { stage }): stages run in a fixed order, whatever order plugins load in: 'security' (local-only Host/Origin checks) →
 *    'normal' (everything else, including hooks legacy code adds with app.addHook) → 'final' (payload filters, compression).
 *    How: one dispatcher per hook name for the security + normal stages is added when the server is created (so it is first), and one
 *    for the final stage is added by seal(), right before listen (so it is last). Hooks added straight to `app` land between them.
 *  - route(opts): Fastify can't add routes after listen nor remove them. A plugin registers its routes at boot; when the plugin is turned off
 *    (disposed) its routes stay but answer exactly like an unknown route (404 not_found, the server's not-found handler) until it is on again.
 *    Every route, also those legacy code adds with app.get(…), is recorded with the plugin that added it (routesBy(), --dump-config).
 *  - group(register): a route group written as registerX(app) (the feature plugins): every route it adds, also inside app.register sub-scopes, is
 *    recorded with the plugin and goes off with it; a hook it adds with app.addHook keeps its place in Fastify's order but does nothing while
 *    the plugin is off.
 *  - static(opts): @fastify/static under a prefix.
 *  - listen() / close(): the legacy plugin listens at the end of its apply and closes the server when it is disposed.
 */
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest, type RouteOptions } from 'fastify';
import { Service, type Context } from 'cordis';

export type HookStage = 'security' | 'normal' | 'final';
export const STAGES: readonly HookStage[] = ['security', 'normal', 'final'];
/** Hooks with a (request, reply) signature that Fastify skips once a reply was sent. */
const GATED = new Set(['onRequest', 'preValidation', 'preHandler', 'onTimeout']);
/** Hooks that pass a payload along (the value a hook returns replaces it; undefined keeps it). */
const PAYLOAD = new Set(['preParsing', 'preSerialization', 'onSend']);
export const HOOK_NAMES = ['onRequest', 'preParsing', 'preValidation', 'preHandler', 'preSerialization', 'onSend', 'onResponse', 'onError', 'onTimeout'] as const;
export type HookName = (typeof HOOK_NAMES)[number];
export type HookFn = (req: FastifyRequest, reply: FastifyReply, extra?: any) => unknown;

export interface RouteEntry { method: string; url: string; owner: string; active: boolean; /** stays on when its plugin is off (it answers "off" itself) */ keepOn?: boolean }
interface HookEntry { fn: HookFn; owner: string }

/** Run one hook (async, or callback style with done as the last argument) and resolve with what it returned. */
function call(fn: HookFn, req: FastifyRequest, reply: FastifyReply, arg: unknown, withArg: boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const done = (err?: Error | null, v?: unknown) => (err ? reject(err) : resolve(v));
    try {
      const r: any = withArg ? (fn as any)(req, reply, arg, done) : (fn as any)(req, reply, done);
      if (r && typeof r.then === 'function') r.then(resolve, reject);
    } catch (e) { reject(e); }
  });
}

export class Http {
  readonly app: FastifyInstance;
  readonly routes: RouteEntry[] = [];
  /** Who adds routes and hooks with plain app.* calls right now (the legacy plugin sets 'legacy' while it loads). */
  owner = 'kernel';
  private hooks = new Map<string, Record<HookStage, HookEntry[]>>();
  /** set by seal(): no route or hook can be added after */
  sealed = false;
  listening = false;

  constructor(app: FastifyInstance = Fastify({ logger: { level: 'info' } })) {
    this.app = app;
    for (const name of HOOK_NAMES) this.hooks.set(name, { security: [], normal: [], final: [] });
    for (const name of HOOK_NAMES) this.app.addHook(name as any, this.dispatcher(name, ['security', 'normal']) as any);
    // Record every route with its plugin, and give each one an on/off switch (a route of a plugin that is off answers like an unknown route).
    this.app.addHook('onRoute', (r: RouteOptions) => {
      const owner = ((r.config as any)?.owner as string | undefined) ?? this.owner;
      const methods = [r.method].flat().map(String);
      const entries = methods.map((method) => { const e = { method, url: r.url, owner, active: true }; this.routes.push(e); return e; });
      const gate = (_req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => { if (entries[0].active) return done(); reply.callNotFound(); };
      r.onRequest = [gate, ...[r.onRequest ?? []].flat()] as any;
    });
  }

  /** One Fastify hook that runs the given stages' lists in order (the same rules as Fastify's own runner: request hooks stop once a reply
   *  was sent, payload hooks pass the payload along). */
  private dispatcher(name: HookName, stages: HookStage[]) {
    const lists = this.hooks.get(name)!; const gated = GATED.has(name); const payload = PAYLOAD.has(name); const withArg = payload || name === 'onError';
    const run = async (req: FastifyRequest, reply: FastifyReply, arg?: unknown) => {
      let value = arg;
      for (const stage of stages) for (const h of [...lists[stage]]) {
        if ((gated || name === 'preParsing') && reply.sent) return payload ? value : reply;
        const r = await call(h.fn, req, reply, value, withArg);
        if (payload && r !== undefined) value = r;
      }
      return payload ? value : undefined;
    };
    // Fastify checks an async hook's arity: (request, reply) or, for payload hooks and onError, (request, reply, payload | error)
    return withArg ? (req: FastifyRequest, reply: FastifyReply, arg: unknown) => run(req, reply, arg) : (req: FastifyRequest, reply: FastifyReply) => run(req, reply);
  }

  /** Add a hook in a stage. Returns a function that removes it again. */
  hook(name: HookName, fn: HookFn, o: { stage?: HookStage; owner?: string } = {}): () => void {
    const stage = o.stage ?? 'normal';
    if (!STAGES.includes(stage)) throw new Error(`ctx.http.hook: unknown stage "${stage}" (${STAGES.join(', ')})`);
    if (!this.hooks.has(name)) throw new Error(`ctx.http.hook: unknown hook "${name}" (${HOOK_NAMES.join(', ')})`);
    if (this.listening && stage === 'final' && !this.sealed) throw new Error('ctx.http.hook: too late');
    const list = this.hooks.get(name)![stage]; const e = { fn, owner: o.owner ?? this.owner }; list.push(e);
    return () => { const i = list.indexOf(e); if (i >= 0) list.splice(i, 1); };
  }

  /** Hooks per stage (for --dump-config and tests): [{ name, stage, owner }]. */
  hookList(): { name: string; stage: HookStage; owner: string }[] {
    return [...this.hooks].flatMap(([name, s]) => STAGES.flatMap((stage) => s[stage].map((h) => ({ name, stage, owner: h.owner }))));
  }

  /** Add a route (at boot only: Fastify can't add one after listen). */
  route(opts: RouteOptions, owner = this.owner): RouteEntry[] {
    if (this.listening || this.sealed) throw new Error(`ctx.http.route ${opts.method} ${opts.url}: routes are added at boot, before the server listens (plan R2)`);
    const before = this.routes.length;
    this.app.route({ ...opts, config: { ...(opts.config as object), owner } });
    return this.routes.slice(before);
  }

  /** Run a registerX(app) route group as `owner`: its routes (sub-scopes included) are recorded as the owner's; its hooks run only while
   *  isOn() says so. Returns the routes it added. */
  async group(register: (app: FastifyInstance) => unknown, owner: string, isOn: () => boolean): Promise<RouteEntry[]> {
    if (this.listening || this.sealed) throw new Error(`ctx.http.group (${owner}): routes are added at boot, before the server listens (plan R2)`);
    const real = this.app; const before = this.routes.length;
    const gated = (name: string, fn: HookFn) => (PAYLOAD.has(name) || name === 'onError'
      ? (req: FastifyRequest, reply: FastifyReply, arg: unknown) => (isOn() ? call(fn, req, reply, arg, true) : Promise.resolve(PAYLOAD.has(name) ? arg : undefined))
      : (req: FastifyRequest, reply: FastifyReply) => (isOn() ? call(fn, req, reply, undefined, false) : Promise.resolve(undefined)));
    const app: FastifyInstance = new Proxy(real, { get: (t, k) => {
      if (k === 'addHook') return (name: string, fn: HookFn) => { if (name === 'onRoute' || name === 'onRegister' || name === 'onReady' || name === 'onClose' || name === 'onListen') t.addHook(name as any, fn as any); else t.addHook(name as any, gated(name, fn) as any); return app; };
      const v = Reflect.get(t, k, t); return typeof v === 'function' ? v.bind(t) : v;
    } });
    const prev = this.owner; this.owner = owner;
    try { await register(app); await real.after(); } finally { this.owner = prev; }
    return this.routes.slice(before);
  }

  /** Serve a folder under a prefix (@fastify/static). Only the first static mount may decorate reply.sendFile. */
  private statics = 0;
  async static(opts: { root: string; prefix: string; [k: string]: unknown }, owner = this.owner): Promise<void> {
    const fstatic = (await import('@fastify/static')).default; const prev = this.owner; this.owner = owner;
    try { await this.app.register(fstatic, { decorateReply: this.statics++ === 0, ...opts } as any); } finally { this.owner = prev; }
  }

  /** The routes each plugin added: { owner: ['GET /api/x', …] }. */
  routesBy(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const r of this.routes) (out[r.owner] ??= []).push(`${r.method} ${r.url}${r.active ? '' : ' (off)'}`);
    return out;
  }
  /** Turn one plugin's routes on or off (off = 404 not_found, like an unknown route; a keepOn route stays). */
  setActive(owner: string, on: boolean) { for (const r of this.routes) if (r.owner === owner && !(r.keepOn && !on)) r.active = on; }

  /** Add the final-stage dispatchers (last of all hooks). listen() and ready() do it; no hooks or routes can be added after. */
  seal() {
    if (this.sealed) return; this.sealed = true;
    for (const name of HOOK_NAMES) this.app.addHook(name as any, this.dispatcher(name, ['final']) as any);
  }
  async ready() { this.seal(); await this.app.ready(); }
  async listen(o: { port: number; host: string }) { this.seal(); await this.app.listen(o); this.listening = true; }
  async close() { await this.app.close(); this.listening = false; }
}

/** A plugin that adds routes was turned on while the server listens, and it had none from boot: it applies after a restart. */
export class NeedsRestart extends Error {
  constructor(readonly plugin: string) { super(`${plugin}: its routes can only be added when the app starts (applies after a restart)`); this.name = 'NeedsRestart'; }
}

/** The process's server: boot.ts makes it through HttpService; code without a ctx (legacy.ts) reads it here. Made on first use outside boot
 *  (tests that import legacy.ts on their own). */
let current: Http | null = null;
export const currentHttp = (): Http => (current ??= new Http());
export const setCurrentHttp = (h: Http | null) => { current = h; };

/** The kernel service: ctx.http. Routes and hooks a plugin adds are owned by it, and go off when it is disposed. */
export class HttpService extends Service {
  readonly server: Http;
  constructor(ctx: Context) { super(ctx, 'http'); this.server = new Http(); setCurrentHttp(this.server); }
  private get caller(): string { return (this.ctx as any).fiber?.name ?? 'kernel'; }
  /** Whether each group owner's hooks run (a plugin turned off and on again reuses the same hooks). */
  private on = new Map<string, boolean>();
  /** A plugin turned on again while the server listens (Plugins page): Fastify can't add routes now, but the ones it added at boot are still
   *  there (off). Reuse them; a plugin that never added them must wait for a restart (NeedsRestart). Before listen: null (add as usual). */
  private again(owner: string, match: (r: RouteEntry) => boolean): RouteEntry[] | null {
    if (!this.server.listening && !this.server.sealed) return null;
    const prev = this.server.routes.filter((r) => r.owner === owner && match(r));
    if (!prev.length) throw new NeedsRestart(owner);
    return prev;
  }
  get app() { return this.server.app; }
  route(opts: RouteOptions) {
    const owner = this.caller; const entries = this.again(owner, (r) => [opts.method].flat().map(String).includes(r.method) && r.url === opts.url) ?? this.server.route(opts, owner);
    this.ctx.effect(() => { for (const e of entries) e.active = true; return () => { for (const e of entries) e.active = false; }; }, `route ${opts.method} ${opts.url}`);
    return entries;
  }
  hook(name: HookName, fn: HookFn, o: { stage?: HookStage } = {}) {
    const owner = this.caller; return this.ctx.effect(() => this.server.hook(name, fn, { ...o, owner }), `hook ${name} (${o.stage ?? 'normal'})`);
  }
  /** A feature's route group (registerX(app)): see Http.group. Its routes and hooks go off when the plugin is disposed; with keepOn its routes
   *  stay on (they answer that the feature is off themselves: workflow-folders, as promised in #191). */
  async group(register: (app: FastifyInstance) => unknown, o: { keepOn?: boolean } = {}) {
    const owner = this.caller; const on = () => this.on.get(owner) !== false;
    const entries = this.again(owner, () => true) ?? await this.server.group(register, owner, on);
    if (o.keepOn) for (const e of entries) e.keepOn = true;
    this.ctx.effect(() => { this.on.set(owner, true); for (const e of entries) e.active = true; return () => { this.on.set(owner, false); if (!o.keepOn) for (const e of entries) e.active = false; }; }, `routes of ${owner} (${entries.length})`);
    return entries;
  }
  static(opts: { root: string; prefix: string; [k: string]: unknown }) { return this.server.static(opts, this.caller); }
  routesBy() { return this.server.routesBy(); }
}
