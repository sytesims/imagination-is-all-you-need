/**
 * ctx.places: the places a job can run on (plan §3.3). A place plugin registers one PlaceRunner per route kind; routing/run.ts sends every
 * attempt on that kind to its runner, and routing/routes.ts hides the routes of a kind whose plugin is off (its quotes say it isn't set up).
 *
 * Phase 2: every route kind is a place (plugins-builtin/place-*.ts): your ComfyUI (local), Comfy Cloud, Comfy Router, fal, Replicate and the labs'
 * own APIs (direct). Free samples and the mock backend's sample runs are a place too (place-sample, kind 'sample'): with it off, nothing runs as
 * a sample (demoAuto / freeSamples are off, so quotes say what is missing instead).
 *
 * Prices, the spend guard, ledger charges and refunds stay in routing/run.ts, ledger.ts and spendGuard.ts: a runner only sends, polls
 * and hands back the result, so turning a place on or off never changes how money is handled. A cost a runner reports (PlaceOutput.cost)
 * is kept on the attempt as information only; it never changes a charge.
 */
import type { Job, RemoteHandle } from '../jobs.js';
import type { RouteAttempt, RouteDef, RouteKind } from '../routing/types.js';
import type { ToolDef } from '../tools/types.js';
import { Service, type Context } from '../kernel/index.js';
import { keyConfigured, keyValue, type KeyRef } from '../kernel/keys.js';

/** A place: a route kind, or 'sample' (free samples and mock-backend sample runs). */
export type PlaceKind = RouteKind | 'sample';
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
  /** Our own id for this request, made (and stored on the attempt) BEFORE anything is sent, so a crash between the provider accepting it and
   *  onSubmit still leaves a trace. A place that takes an idempotency key or a client task id sends it; the others may ignore it. */
  requestId: string;
  /** A request from before a restart / Retry download: poll it, never submit again. */
  resume: RemoteHandle | null;
  /** Which URL in the provider's result is the output (fal answers differ per endpoint); a runner may ignore it. */
  pick?: (result: any) => string | undefined;
}
/** One output file of a request: a link, or the bytes inline (base64 / hex) for places that answer with the file itself. */
export type OutputKind = 'image' | 'video' | 'audio' | '3d' | 'file';
export interface PlaceFile { kind: OutputKind; url?: string; b64?: string; hex?: string; mime?: string }
/** What the provider says a run cost (provider), or our own figure from its published price and the run's units (estimate). Information only. */
export interface PlaceCost { usd: number; source: 'provider' | 'estimate' }
export interface PlaceOutput {
  /** The output run.ts saves (today's single result). */
  url: string | undefined;
  /** Every output of the request, with its kind (an image batch, a video plus its audio, a GLB plus textures). Optional; url stays the one saved. */
  outputs?: PlaceFile[];
  /** What the run cost, when the place reports it (kept on the attempt as information; never changes a charge). */
  cost?: PlaceCost;
  /** Ask the provider for the result again (a fresh signed link) before another download try. */
  refresh: () => Promise<string | undefined>;
  /** The Authorization header for downloading url (only on the provider's own hosts). */
  auth?: (url: string) => string | undefined;
}
/** How a place takes input media (mediaHandoff.ts forms, plus the styles of places to come). */
export type InputStyle = 'url' | 'data-uri' | 'base64' | 'multipart' | 'presigned' | 'content-hash' | 'file-map';
export type MediaKind = 'image' | 'video' | 'audio';
/** A failed attempt in plain classes (research §3 item 9). Derived from what the runners already put on the job (reasonCode, errorType,
 *  busy flags); passed to failedNotCharged as extra information. It never decides a refund on its own. */
export type PlaceErrorClass = 'busy' | 'rate_limited' | 'out_of_credit' | 'moderation' | 'bad_input' | 'provider_down' | 'unknown';
/** Everything run.ts hands a runner that runs a whole attempt itself (PlaceRunner.attempt). */
export interface AttemptKit {
  timeoutMs: number;
  /** The place's key for this route (undefined: none set). */
  key: string | undefined;
  /** Our own id, made and stored on the attempt (clientRequestId) before anything is sent: `${job.id}-a${n}-o${k}` for output k (Comfy Router's
   *  idempotency key), `${job.id}-a${n}` for the whole attempt (no k: Comfy Cloud's idempotency prefix). */
  requestId(k?: number): string;
  isCanceled(): boolean;
  /** This attempt's stored request when this run is a pick-up after a restart / Retry download (only polled, nothing new is sent), else null. */
  resuming: RemoteHandle | null;
  /** The request k of this attempt from before a restart (only polled), or null. */
  resumeAt(k: number): RemoteHandle | null;
  /** Remember request k of n as job.remote at once (written to disk), so a restart can poll it again. */
  remember(ref: RemoteRef, k: number, n: number): void;
  /** The label of output k of n (Shots angles, Image k, the job's output label). */
  label(k: number, n: number): string;
  /** How many images the job asked for. */
  count: number;
  /** Save one output (a link, or inline bytes) to the data dir right away; returns its /files path. */
  save(o: Omit<PlaceFile, 'kind'> & { kind?: OutputKind }, k: number, where?: string): Promise<string>;
  /** The place's name in the Run on words (for messages). */
  where: string;
}
/** What routing/routeRequest.ts hands PlaceRunner.build: the job, request k's prompt and seed, and the tool's routedExtras. */
export interface BuildArgs { job: { input: Record<string, any> }; prompt: string; seed: number | undefined; extras: { imageUrls?: string[]; imageSize?: { width: number; height: number }; aspect?: string } }
export interface PlaceRunner {
  kind: PlaceKind;
  /** Plain name in job text ('fal', 'Replicate', 'Comfy Cloud'). */
  label: string;
  /** The job.remote kind this place stores for a submitted request (fal, replicate, direct, router, cloud). */
  remote?: RemoteHandle['kind'];
  /** Does this runner run the route? Default: every route of its kind. place-direct runs the routes with a lab connection (route.direct);
   *  the other 'direct' routes run through their tool's own code (providers.ts) with the key it names, as before. */
  handles?(route: RouteDef): boolean;
  /** Its key is set (or mocked on the mock backend). */
  ready(route: RouteDef): boolean;
  /** The route's key, read through this place's declared keys (never logged or returned by a route). */
  key(route: KeyRef): string | undefined;
  /** A run now would be real (key set, live backend; local: always). Otherwise run.ts makes a sample (place-sample). */
  live(route: RouteDef): boolean;
  /** One request (queue places: fal, Replicate): submit (or resume), poll until done, return where the output is. Throws on failure, timeout or cancel. */
  run?(req: PlaceRequest, hooks: PlaceHooks): Promise<PlaceOutput>;
  /** The whole attempt (your ComfyUI, Comfy Cloud, Comfy Router, the labs): builds, sends, polls and saves the outputs on the job itself. */
  attempt?(job: Job, tool: ToolDef, route: RouteDef, attempt: RouteAttempt, kit: AttemptKit): Promise<void>;
  /** A sample run for a place that isn't live (mock backend, no key): 'stages' = a drawn sample with this place's own stage names (fal,
   *  Replicate); default = the model's own sample (providers.ts). Only place-sample runs them. */
  samples?: 'stages';
  /** The failure text when a request came back without an output (queue places). */
  noOutput?: string;
  /** On the mock backend this place still needs a real key (OPENHIGGSFIELD_MOCK_KEYS doesn't fake it): fal, Replicate. */
  keyedOnMock?: boolean;
  /** Can this stored request be polled again after a restart? */
  resume?(h: RemoteHandle): boolean;
  /** Cancel a stored request at the provider: true accepted, false not confirmed, null no way to cancel it (or no key). Never throws. */
  cancel?(h: RemoteHandle, route: KeyRef & { routeId: string }, f: typeof fetch): Promise<boolean | null>;
  /** Extra "this failed attempt surely cost nothing" rule (routing/run.ts failedAttemptNotCharged); billing.ts failure rules still apply. */
  failedNotCharged?(job: Job, route: Pick<RouteDef, 'kind' | 'routeId'>, cls: PlaceErrorClass): boolean;
  /** The request body of an image route that has no route.request of its own (fal / Replicate image models): routing/routeRequest.ts calls it with
   *  the prompt already in the model's reference syntax (refInputFor) and the per-output seed. */
  build?(route: RouteDef, a: BuildArgs): Promise<Record<string, unknown>>;
  /** How it takes input media, per kind (mediaHandoff.ts HANDOFF_POLICY for the places that have one). */
  inputs?: Partial<Record<MediaKind, InputStyle[]>>;
  /** Put one input file where the place can read it; returns the reference to send (a link, an asset id). */
  upload?(file: string, kind: MediaKind): Promise<string>;
  /** The account's balance at the provider, when it has an API for it. None of today's places reads one (Comfy shows it at platform.comfy.org). */
  balance?(): Promise<{ usd: number } | null>;
  /** Sample runs (place-sample only): a free sample on the real backend (select.ts freeSamples) … */
  freeSample?(job: Job, tool: ToolDef): Promise<void>;
  /** … and a sample in place of a hosted place that isn't live (mock backend, no key). */
  sample?(job: Job, tool: ToolDef, route: RouteDef, place: PlaceRunner): Promise<void>;
}

/** Every place kind. A kind listed here with no plugin loaded is off: its routes are hidden. */
export const PLACE_KINDS: readonly PlaceKind[] = ['local', 'comfy-cloud', 'comfy-router', 'fal', 'replicate', 'direct', 'sample'];
export const PLUGGABLE_KINDS: ReadonlySet<string> = new Set<string>(PLACE_KINDS);
/** Queue places (one request per output through runner.run): any route of their kind runs, the route being the model slug (routing/runnable.ts). */
export const QUEUE_PLACES: ReadonlySet<string> = new Set<PlaceKind>(['fal', 'replicate']);
/** The plugin that registers each place (for "the place-… plugin is off" details). */
export const PLACE_PLUGIN: Record<PlaceKind, string> = { local: 'place-comfy-local', 'comfy-cloud': 'place-comfy-cloud', 'comfy-router': 'place-comfy-router', fal: 'place-fal', replicate: 'place-replicate', direct: 'place-direct', sample: 'place-sample' };
/** job.remote kind → place kind. */
const REMOTE_PLACE: Record<RemoteHandle['kind'], PlaceKind> = { fal: 'fal', replicate: 'replicate', direct: 'direct', router: 'comfy-router', cloud: 'comfy-cloud' };
/** The built-in places for code that runs without booting (scripts, tests): services/placesBuiltin.ts fills it when routing/run.ts loads.
 *  Not imported here, so the routing modules that read ctx.places (routes.ts, select.ts) don't pull every runner in at import time. */
const BUILT_IN = new Map<string, PlaceRunner>();
export const setBuiltInPlaces = (list: PlaceRunner[]) => { for (const p of list) BUILT_IN.set(p.kind, p); };

/** The class of a failed attempt, from what the runner left on the job. */
export function errorClassOf(job: Pick<Job, 'reasonCode' | 'errorType'>): PlaceErrorClass {
  const rc = String(job.reasonCode ?? ''); const et = String(job.errorType ?? '');
  if (rc === 'queue_full') return 'busy';
  if (rc === 'rate_limited' || /rate/.test(rc)) return 'rate_limited';
  if (et === 'credits' || /credits|plan$/.test(rc)) return 'out_of_credit';
  if (et === 'nsfw' || rc === 'content_blocked') return 'moderation';
  if (et === 'invalid_input' || et === 'validation' || rc === 'input_invalid') return 'bad_input';
  if (et === 'provider_outage' || /unreachable|outage|gone/.test(rc)) return 'provider_down';
  return 'unknown';
}

/** The registry behind ctx.places. One per process, so routing code that has no ctx (routing/run.ts, routes.ts) reads the same one. */
export class Places {
  private runners = new Map<string, PlaceRunner>();
  /** true once boot.ts mounted the places service: from then on only plugins add places. Before that (scripts and tests that import
   *  routing modules without booting) the built-in places are on, as in the desktop profile. */
  managed = false;
  register(p: PlaceRunner): () => void {
    if (!PLUGGABLE_KINDS.has(p.kind)) throw new Error(`places: "${p.kind}" isn't a place kind (${PLACE_KINDS.join(', ')})`);
    if (this.runners.has(p.kind)) throw new Error(`places: "${p.kind}" is already registered`);
    this.runners.set(p.kind, p); return () => { if (this.runners.get(p.kind) === p) this.runners.delete(p.kind); };
  }
  get(kind: string | null | undefined): PlaceRunner | undefined {
    if (!kind || !PLUGGABLE_KINDS.has(kind)) return undefined;
    return this.managed ? this.runners.get(kind) : this.runners.get(kind) ?? BUILT_IN.get(kind);
  }
  /** The place that stored this job.remote kind. */
  byRemote(kind: RemoteHandle['kind'] | null | undefined): PlaceRunner | undefined { return kind ? this.get(REMOTE_PLACE[kind]) : undefined; }
  /** A place kind whose plugin is off in this profile (without a boot every place is on, as in the desktop profile). */
  off(kind: string | null | undefined): boolean { return this.managed && !!kind && PLUGGABLE_KINDS.has(kind) && !this.get(kind); }
  list(): PlaceRunner[] { return PLACE_KINDS.map((k) => this.get(k)).filter((p): p is PlaceRunner => !!p); }
  /** The runner for this route, when it runs it (a 'direct' route without a lab connection runs through its tool's own code). */
  runnerOf(r: RouteDef): PlaceRunner | undefined { const p = this.get(r.kind); return p && (!p.handles || p.handles(r)) ? p : undefined; }
  /** Is the route's key set (or mocked)? Its place answers; a route no place runs keeps the old check. */
  ready(r: RouteDef): boolean { const p = this.runnerOf(r); return p ? p.ready(r) : keyConfigured(r.envKey, r.envAliases); }
  /** The route's key, through its place's declared keys; a route no place runs (or of a place that is off) reads it as before. */
  keyOf(r: RouteDef): string | undefined { const p = this.runnerOf(r); return p ? p.key(r) : keyValue(r); }
  /** Your Comfy key, read through a Comfy place (Router first, then Cloud): Comfy storage uploads, Router link checks. Both Comfy places off → none.
   *  Without a boot (scripts, tests) it reads the key as before. */
  comfyKey(): string | undefined {
    const ref = { envKey: 'COMFY_API_KEY', envAliases: [] }; if (!this.managed) return keyValue(ref);
    return (this.get('comfy-router') ?? this.get('comfy-cloud'))?.key(ref);
  }
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
