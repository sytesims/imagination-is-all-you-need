/**
 * ctx.places: the places a job can run on (plan §3.3). A place plugin registers one PlaceRunner per route kind; routing/run.ts sends a live
 * attempt on that kind to runner.run, and routing/routes.ts hides the routes of a kind whose plugin is off (its quotes say it isn't set up).
 *
 * Phase 0: only fal and Replicate are places (PLUGGABLE_KINDS, plugins-builtin/place-fal.ts and place-replicate.ts). Every other kind
 * (local, Comfy Cloud, Comfy Router, the labs' own APIs) still runs in routing/run.ts as before.
 *
 * Prices, the spend guard, ledger charges and refunds stay in routing/run.ts, ledger.ts and spendGuard.ts: a runner only sends, polls
 * and hands back the result, so turning a place on or off never changes how money is handled.
 */
import type { Job, RemoteHandle } from '../jobs.js';
import type { RouteDef, RouteKind } from '../routing/types.js';
import { Service, type Context } from '../kernel/index.js';
import { falPlace } from '../plugins-builtin/place-fal.js';
import { replicatePlace } from '../plugins-builtin/place-replicate.js';

/** What a runner remembers about a submitted request (run.ts stores it as job.remote, so a restart can poll it again). */
export type RemoteRef = Omit<RemoteHandle, 'routeId' | 'attempt' | 'output' | 'outputs' | 'at'>;
export interface PlaceHooks {
  timeoutMs: number;
  isCanceled: () => boolean;
  /** The provider accepted the request (called once, before polling). */
  onSubmit: (ref: RemoteRef) => void;
  /** Progress: still queued at the provider, or rendering (queuePos when the provider says it). */
  onStatus: (stage: 'submitted' | 'rendering', queuePos?: number | null) => void;
  /** The provider is busy; it will be retried after ms. */
  onBusy: (ms: number) => void;
}
export interface PlaceRequest {
  route: RouteDef;
  body: Record<string, unknown>;
  key: string;
  /** A request from before a restart / Retry download: poll it, never submit again. */
  resume: RemoteHandle | null;
  /** Which URL in the provider's result is the output (fal answers differ per endpoint); a runner may ignore it. */
  pick?: (result: any) => string | undefined;
}
export interface PlaceOutput {
  url: string | undefined;
  /** Ask the provider for the result again (a fresh signed link) before another download try. */
  refresh: () => Promise<string | undefined>;
  /** The Authorization header for downloading url (only on the provider's own hosts). */
  auth?: (url: string) => string | undefined;
}
export interface PlaceRunner {
  kind: RouteKind;
  /** Plain name in job text ('fal', 'Replicate'). */
  label: string;
  /** Its key is set. */
  ready(route: RouteDef): boolean;
  /** A run now would send a real request (key set, live backend). Otherwise run.ts makes a mock result. */
  live(route: RouteDef): boolean;
  /** One request: submit (or resume), poll until done, return where the output is. Throws on failure, timeout or cancel. */
  run(req: PlaceRequest, hooks: PlaceHooks): Promise<PlaceOutput>;
  /** Can this stored request be polled again after a restart? */
  resume?(h: RemoteHandle): boolean;
  /** Cancel a stored request at the provider: true accepted, false not confirmed, null no way to cancel it. Never throws. */
  cancel?(h: RemoteHandle, key: string, f: typeof fetch): Promise<boolean | null>;
  /** Extra "this failed attempt surely cost nothing" rule (routing/run.ts failedAttemptNotCharged); billing.ts failure rules still apply. */
  failedNotCharged?(job: Job, route: Pick<RouteDef, 'kind' | 'routeId'>): boolean;
}

/** Route kinds that run through a place plugin. A kind listed here with no plugin loaded is off: its routes are hidden. */
export const PLUGGABLE_KINDS: ReadonlySet<string> = new Set<RouteKind>(['fal', 'replicate']);
const BUILT_IN: PlaceRunner[] = [falPlace, replicatePlace];

/** The registry behind ctx.places. One per process, so routing code that has no ctx (routing/run.ts, routes.ts) reads the same one. */
export class Places {
  private runners = new Map<string, PlaceRunner>();
  /** true once boot.ts mounted the places service: from then on only plugins add places. Before that (scripts and tests that import
   *  routing modules without booting) the built-in places are on, as in the desktop profile. */
  managed = false;
  register(p: PlaceRunner): () => void {
    if (!PLUGGABLE_KINDS.has(p.kind)) throw new Error(`places: "${p.kind}" isn't a place kind yet (${[...PLUGGABLE_KINDS].join(', ')})`);
    if (this.runners.has(p.kind)) throw new Error(`places: "${p.kind}" is already registered`);
    this.runners.set(p.kind, p); return () => { if (this.runners.get(p.kind) === p) this.runners.delete(p.kind); };
  }
  get(kind: string | null | undefined): PlaceRunner | undefined {
    if (!kind || !PLUGGABLE_KINDS.has(kind)) return undefined;
    return this.managed ? this.runners.get(kind) : this.runners.get(kind) ?? BUILT_IN.find((p) => p.kind === kind);
  }
  /** A place kind whose plugin is off in this profile. */
  off(kind: string | null | undefined): boolean { return !!kind && PLUGGABLE_KINDS.has(kind) && !this.get(kind); }
  list(): PlaceRunner[] { return [...PLUGGABLE_KINDS].map((k) => this.get(k)).filter((p): p is PlaceRunner => !!p); }
}
export const places = new Places();

/** The kernel service: ctx.places.register(runner) from a place plugin; the place goes away when that plugin is disposed. */
export class PlacesService extends Service {
  constructor(ctx: Context) { super(ctx, 'places'); places.managed = true; }
  register(p: PlaceRunner) { return this.ctx.effect(() => places.register(p), `place ${p.kind}`); }
  get(kind: string) { return places.get(kind); }
  off(kind: string) { return places.off(kind); }
  list() { return places.list(); }
}
