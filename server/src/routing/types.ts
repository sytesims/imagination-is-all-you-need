/** Multi-provider routing types (approved feature, 2026-10-16). */
export type RouteKind = 'local' | 'comfy-router' | 'comfy-cloud' | 'fal' | 'replicate' | 'direct';
export interface RouteDef {
  /** `<kind>:<id>` e.g. local:comfy-qwen-image, fal:fal-ai/qwen-image, replicate:qwen/qwen-image. */
  routeId: string;
  kind: RouteKind;
  /** Model this route serves (= provider id in providers.ts, = ModelCard.id). */
  modelId: string;
  /** HTTP endpoint (direct, router) or model slug (fal / Replicate) or workflow (local). */
  endpoint: string;
  /** Key into HOSTED_BY_ID (shared/hostedPrices.ts, or routing/routePrices.ts for fal/Replicate). null = local, always free. */
  priceRef: string | null;
  /** Where the route itself is documented (model page / API docs). */
  sourceUrl: string;
  checkedAt: string;
  /** Typical wall-clock seconds for one run; latencyEstimated=true when not from a published figure. */
  typicalLatencySec: number;
  latencyEstimated: boolean;
  latencySource?: string;
  /** Env var holding the key; null = no key (local). */
  envKey: string | null;
  /** Alternative env names accepted (e.g. the vendor's own FAL_KEY). */
  envAliases?: string[];
  /** Job types this route can serve (create-image `types`); undefined = everything the model does. */
  modes?: string[];
  /** Picked by the job's mode alone (Keyframes · Comfy Cloud): never offered as a Run-on choice (modelRegistry choicesOf). */
  notAChoice?: boolean;
  label: string;
  /** What this route can do for its tool (UI capability chips), e.g. OpenSoul { character, looks, colour, upscale }. Optional, additive. */
  caps?: Record<string, unknown>;
  /** Extra credits on top of the route price for this job (e.g. OpenSoul cloud upscale via fal-ai/esrgan). */
  extraCredits?: (input: Record<string, any>) => number;
  /** The job as the route bills it, when that differs from what was asked (H3 Talking Photo on Router: the clip is at least 5 s). Quote and charge both use it. */
  priceInput?: (input: Record<string, any>) => Record<string, any>;
  /** A short note when this route adjusts the job instead of refusing it (a length rounded, speech trimmed): shown on the quote and the job. */
  adjustNote?: (input: Record<string, any>) => string | null;
  /** A Comfy Cloud twin that stays out of Auto and local-only checks while its price is unmeasured (routing/select.ts twinHeld). */
  heldUntilMeasured?: boolean;
  /** Coming soon (mock placeholder): the route is listed but never runs or charges; the value is the reason shown. */
  comingSoon?: string;
  /** Official lab API routes (BFL, MiniMax, LTX, …): how this route talks to the lab (providers/direct.ts DirectSpec: build + submit/poll or one
   *  sync call). Sent by routing/run.ts through directRun when a key is set and the backend is live. */
  direct?: import('../providers/direct.js').DirectSpec;
  /** Who runs and bills this route (Run on chip, Settings card). Read by runOnOfRoute; the env-key regex is only the fallback. */
  vendor?: import('../shared/modelIds.js').RunOn;
  /** Job-specific reason this route can't run it (null = fine), e.g. cloud upscale without a fal key. */
  unavailableFor?: (input: Record<string, any>) => string | null;
  /** Video routes (MiniMax H3): one request per job, output = video.url (fal) / output URL (Replicate). */
  output?: 'image' | 'video' | '3d';
  /** Builds the provider request body for this job (H3 routes; image routes use falImageInput/replicateImageInput). */
  request?: (job: { id: string; input: Record<string, any> }) => Promise<Record<string, unknown>>;
  /** Image routes with `request`: one request per output image (Create Image n, Shots angles), each with its own prompt and seed + k. */
  eachImage?: boolean;
  /** Reference images this route's request really sends for a job (priced by the route's HostedPrice.refImages; quote = charge). Router routes count theirs in routerModels.ts. */
  refsPriced?: (input: Record<string, any>) => number;
  /** B6 (Oct 19): a Comfy Cloud workflow twin listed as a route of its open model (comfy-h3 → comfy-cloud:cloud-h3-wf). twinProvider = the
   *  hidden alias provider id (its own card is no longer listed; provider=<twinProvider> still works). tools = the tools it serves (tool id or app base). */
  twinProvider?: string;
  /** Twins and tool-scoped extra routes: the tools (tool id or app base) this route is listed on. Unset = every tool of the model. */
  tools?: string[];
  /** Tool-scoped extra route that stands in for the native route on its tools (the native one is left out there). */
  replacesNative?: boolean;
  /** A Router-mapped model listed on a tool whose jobs its Router body doesn't map (routing/routerModels.ts tools): not wired there. */
  routerOff?: boolean;
  /** A Comfy partner-node graph this route runs itself on Comfy Cloud (3D: Tripo, tools/threeD.ts), real whenever its key is set. */
  cloudRun?: (job: import('../jobs.js').Job, r: RouteDef, attempt: RouteAttempt) => Promise<void>;
  /** A local route that runs on this computer without ComfyUI (ffmpeg only): ComfyUI being unreachable doesn't block it. */
  noComfy?: boolean;
}
export interface RouteOption {
  /** Key for the shared priceOf({ provider: priceRef }) the web runs locally (null = local, 0 credits). */
  priceRef?: string | null;
  routeId: string; kind: RouteKind; label: string; endpoint: string;
  /** Direct routes: the lab that runs and bills it (RouteDef.vendor). */
  vendor?: import('../shared/modelIds.js').RunOn;
  /** Mock/demo mode only: no key is set, so this route runs as a labelled mock preview (nothing is sent to the provider). */
  demo?: boolean;
  /** I2: machine-readable reason ('key_missing'); `reason` is plain UI copy, `reasonDetail` keeps the technical detail (e.g. the env var). */
  reasonCode?: 'key_missing' | 'not_wired' | 'input_blocked' | 'too_heavy' | 'route_not_enabled'; reasonDetail?: string;
  /** HW-SHAPES B3: local routes only: this computer's fit verdict (fits | slow | too_heavy | unknown), reason, tier, ETA; warning when pinned anyway (Q2). */
  fit?: Record<string, any> & { verdict: string; reasonCode: string; reason: string; enforced: boolean; warning?: string };
  /** Demo previews: the route's real price, shown for reference (credits is 0: a demo preview is free). */
  listCredits?: number | null;
  /** Credits for this job / for a default run (models list). null = price unavailable. */
  credits: number | null;
  estimatedPrice: boolean; priceSourceUrl: string | null; priceCheckedAt: string | null;
  typicalLatencySec: number; latencyEstimated: boolean;
  envKey: string | null; configured: boolean; available: boolean; reason?: string;
  sourceUrl: string;
  caps?: Record<string, unknown>;
  /** B6: 0 = Comfy Cloud workflow (open weights), 1 = Comfy Cloud · partner API (partner / API nodes), 2 = direct API (fal, Replicate, BFL, vendor), 3 = local. */
  tier?: 0 | 1 | 2 | 3; tierLabel?: 'Comfy Cloud' | 'Comfy Router' | 'API' | 'Local';
  /** B6: a live executor exists for this route (a key alone makes it run). false = only the mock executor (partner nodes until I1/I2). */
  wired?: boolean;
  twinOf?: string; twinProvider?: string;
}
export interface RouteAttempt {
  n: number; routeId: string; status: 'running' | 'done' | 'failed' | 'timeout';
  startedAt: number; endedAt?: number; error?: string | null;
  charged: number; refunded: number; requestId?: string | null;
  /** D4: this failed attempt surely cost nothing (routing/run.ts failedAttemptNotCharged): never reached the provider, refused before running, or free by the provider's rule. */
  notCharged?: boolean;
}
export interface JobRouting {
  modelId: string;
  mode: 'auto' | 'pinned';
  allowFallback: boolean;
  /** Routes in try order (first = charged at submit). */
  order: string[];
  /** Credits per route for THIS job (charge = shown). */
  prices: Record<string, number>;
  /** Set when the plan moved off what was asked (routing/fallback.ts): saved pin no longer serves the model → Auto. */
  planFallback?: { code: 'pin_invalid'; message: string; requestedRoute: string };
  /** Mock/demo mode: Auto resolved to a keyless route that runs as a labelled mock preview. */
  demo?: { code: 'demo_preview'; message: string; routeId: string };
  /** Q2: the job runs a pinned route that is too heavy for this computer (it still runs; this is the loud warning). */
  fitWarning?: { code: 'too_heavy'; routeId: string; message: string };
  /** Test/QA only (mock backend): routes forced to fail. */
  failRoutes?: string[];
  /** Model registry (step 2): the model and run-on asked for, and the engine routes that belong to that model (fallbacks stay inside them). */
  modelKey?: string | null; runOn?: string | null; allowRoutes?: string[] | null;
}
export interface RoutingPrefs {
  /** useLocal ('Use local ComfyUI', default false): cloud first; local only when on (Auto then includes local at 0) or when pinned. */
  global: { mode: 'auto' | string; allowFallback: boolean; useLocal: boolean; /** mock backend only (tests) */ mockKeys?: boolean;
    /** Settings → Routing → Show other providers (2026-10-27): fal / Replicate / lab API places the Comfy place already covers are hidden unless on (routing/hiddenPlaces.ts). */ showOtherProviders?: boolean };
  perModel: Record<string, { route: 'auto' | string; allowFallback?: boolean }>;
  /** v2 (MODEL-ROUTE-SPEC step 2): saved choices per tool and model. Absent on rows written before v2. */
  v?: 2;
  /** perTool[toolId][modelKey] = where that model runs on that tool. Explicit entries only; old perModel pins still apply (see routing/prefs.ts pinFor). */
  perTool?: Record<string, Record<string, ToolPin>>;
  /** The user's own default model per tool (★ Make default in the model menu; GET/PUT /api/me/defaults): favourites[toolId] = provider id.
   *  It wins over the cloud default (shared/cloudDefaults.ts) wherever the tool lists it; Reset to recommended deletes the entry. */
  favourites?: Record<string, string>;
}
/** One saved choice for (tool, model): runOn ('auto' or an account), optionally a specific route of that account, and the fallback flag. */
export interface ToolPin { runOn?: import('../shared/modelIds.js').RunOn | 'auto'; route?: string; allowFallback?: boolean }
