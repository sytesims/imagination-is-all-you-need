/**
 * Provider costs and billing-account information, distinct from optional team-mode balances.
 *
 *  - Where each run is billed and its estimated USD cost (`cost` on every quote), with the provider's rule for failed runs.
 *  - Spend log: one row per job (table `spend`), written at submit with the estimate and settled when the job ends (actual cost when the
 *    provider reports one, e.g. BFL's `cost`). GET /api/spend, GET /api/spend/summary.
 *  - No spending limits (removed 2026-10-28, user decision: spend is controlled by how much the user tops up; inflated estimates added up
 *    against the caps and blocked runs wrongly). GET/PUT /api/settings/billing keeps the mode and the Comfy plan (writes only from this computer).
 *  - Connected accounts: read-only balance from providers whose official API offers one (fal, BFL, Comfy Cloud). GET /api/accounts, cached 5 min.
 *    Keys never leave the server except in the request to that provider's own API; billing / top-up endpoints are never called.
 * Team mode (billingMode.ts) keeps the credit ledger exactly as before; the spend log is written in both modes.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { all, put, getKv } from './db.js';
import { config } from './config.js';
import { env } from './env.js';
import { jobs, type Job } from './jobs.js';
import { billingSettings, billingMode, saveBillingSettings, modeLocked, comfyPlanSetting, type BillingMode, type ComfyPlanSetting } from './billingMode.js';
import { providerForEnvKey, realKeyFor, providerName, isLoopback, providerSettings } from './routing/settings.js';
import { findRoute } from './routing/routes.js';
import { jobModelFields, catalogueNameOf } from './routing/modelRegistry.js';
import { engineNameOf } from './engineName.js';
import { COMFY_CREDITS_PER_USD, HOSTED_BY_ID } from './shared/hostedPrices.js';
import { COMFY_PLANS, isComfyPlanId, comfyPlanName, usdToken, costDetail, costLine, unitsDetail, LOCAL_FREE, type ComfyPlanId } from './shared/priceText.js';
import { r4, comfyUnits, exactWithinCent, providerUnits } from './shared/runCost.js';
import { RUN_ON_LABELS, runOnOfRoute, LOCAL_LABEL } from './shared/modelIds.js';
import { metaOf } from './library.js';
import { periodStart, isSpendPeriod, buckets, quoteAccuracy, overQuoteByTool, shareByTool, type SpendPeriod } from './shared/spendInsights.js';
import { policyRefusalCharge } from './shared/policyBilling.js';

export type FailureRule = 'not-charged' | 'may-charge' | 'unknown';
export type BilledTo = 'local' | 'comfy' | string;
/** Per provider: what its official docs say (checked against each provider's docs). */
export interface ProviderBilling {
  id: string; name: string; failureRule: FailureRule; failureNote: string; failureSource: string | null;
  /** 'per-job': the job result carries the real cost; 'usage-only': only aggregate usage/invoices; 'none'. */
  actualCost: 'per-job' | 'usage-only' | 'none'; actualNote: string;
  /** 'api': a read-only balance endpoint exists (and we read it); 'none'. */
  balance: 'api' | 'none'; balanceNote: string;
  /** Read-only / scoped keys: what the docs say. */
  scopedKeys: string;
  /** The provider's own billing page (a plain external link; never automated). */
  billingUrl: string | null; docsUrl: string | null;
}
export const PROVIDER_BILLING: ProviderBilling[] = [
  { id: 'local', name: LOCAL_LABEL, failureRule: 'not-charged', failureNote: 'Runs on your own computer: nothing is billed.', failureSource: null, actualCost: 'none', actualNote: 'Free.', balance: 'none', balanceNote: 'Nothing to bill.', scopedKeys: 'No key.', billingUrl: null, docsUrl: null },
  { id: 'comfy', name: 'Comfy Cloud', failureRule: 'may-charge', failureNote: 'Comfy Cloud bills a run while it runs, so a failed run can still cost money.', failureSource: 'https://support.comfy.org/articles/1116676382-unexpected-credit-usage-charges',
    actualCost: 'usage-only', actualNote: 'Comfy Router runs carry their cost when Comfy reports it (X-Comfy-Credits-Used, recorded as the actual cost); otherwise Comfy reports billed usage per model over time, not per job.', balance: 'api', balanceNote: 'Read from the Comfy Cloud usage report (credit balance).', scopedKeys: 'Not documented: Comfy keys are full account keys.',
    billingUrl: 'https://docs.comfy.org/support/subscription/managing', docsUrl: 'https://docs.comfy.org/openapi-cloud.yaml' },
  { id: 'fal', name: 'fal', failureRule: 'may-charge', failureNote: 'fal never charges for server errors (HTTP 5xx), but an invalid-input error can be charged if GPU time was used.', failureSource: 'https://fal.ai/docs/documentation/model-apis/faq',
    actualCost: 'usage-only', actualNote: 'fal reports usage and cost per endpoint over time, not per request.', balance: 'api', balanceNote: 'Read from fal’s account billing endpoint (needs a key with billing read access).', scopedKeys: 'Yes: READONLY and BILLING key presets.',
    billingUrl: 'https://fal.ai/dashboard/billing', docsUrl: 'https://fal.ai/docs/platform-apis/v1/account/billing' },
  { id: 'replicate', name: 'Replicate', failureRule: 'not-charged', failureNote: 'Replicate says: if a run fails, you are not charged (public models).', failureSource: 'https://replicate.com/docs/topics/billing',
    actualCost: 'none', actualNote: 'Predictions report run time, not cost.', balance: 'none', balanceNote: 'Replicate has no balance or usage API.', scopedKeys: 'Not documented.',
    billingUrl: 'https://replicate.com/account/billing', docsUrl: 'https://replicate.com/docs/reference/http' },
  { id: 'bfl', name: 'Black Forest Labs', failureRule: 'not-charged', failureNote: 'BFL says only finished generations (status Ready) use credits; moderated requests are free.', failureSource: 'https://help.bfl.ai/articles/4212278032-my-prompt-is-getting-moderated',
    actualCost: 'per-job', actualNote: 'Each request returns its cost in BFL credits (1 credit = $0.01).', balance: 'api', balanceNote: 'Read from BFL’s credits endpoint.', scopedKeys: 'Not documented.',
    billingUrl: 'https://docs.bfl.ai/quick_start/pricing', docsUrl: 'https://docs.bfl.ai/api-reference/get-the-users-credits' },
  { id: 'minimax', name: 'MiniMax', failureRule: 'unknown', failureNote: 'MiniMax doesn’t publish whether failed requests are billed.', failureSource: null,
    actualCost: 'per-job', actualNote: 'Each finished job reports its usage (video seconds, speech characters); the cost is that usage × the published rate.', balance: 'none', balanceNote: 'MiniMax shows the balance in its web console only.', scopedKeys: 'Not documented.',
    billingUrl: 'https://platform.minimax.io/', docsUrl: 'https://platform.minimax.io/docs/faq/about-account' },
  { id: 'ltx', name: 'LTX', failureRule: 'unknown', failureNote: 'LTX bills per second of generated video; it doesn’t publish whether failed jobs are billed.', failureSource: 'https://docs.ltx.io/pricing',
    actualCost: 'none', actualNote: 'Jobs report no cost; the quote (seconds × the published rate) is recorded.', balance: 'none', balanceNote: 'LTX shows the balance in its Developer Console only.', scopedKeys: 'Not documented.',
    billingUrl: 'https://docs.ltx.io/pricing', docsUrl: 'https://docs.ltx.io/' },
  // Official lab APIs, batch 2 (2026-10-23)
  { id: 'openai', name: 'OpenAI', failureRule: 'unknown', failureNote: 'OpenAI bills image tokens per request; it doesn’t publish whether refused or failed image requests are billed.', failureSource: null,
    actualCost: 'per-job', actualNote: 'Each image response reports its token usage (text in, image in, image out); the cost is those tokens × the published rates.', balance: 'none', balanceNote: 'OpenAI shows usage and credits in its platform dashboard only.', scopedKeys: 'Project keys with restricted permissions.',
    billingUrl: 'https://platform.openai.com/settings/organization/billing/overview', docsUrl: 'https://developers.openai.com/api/docs/guides/image-generation' },
  { id: 'google', name: 'Google Gemini API', failureRule: 'unknown', failureNote: 'Google bills tokens per request; it doesn’t publish whether blocked image requests are billed.', failureSource: null,
    actualCost: 'per-job', actualNote: 'Each response reports its token usage; the cost is the output image tokens × the published rate.', balance: 'none', balanceNote: 'Google shows spend in AI Studio / Cloud Billing only.', scopedKeys: 'API keys can be restricted to the Gemini API in Google Cloud.',
    billingUrl: 'https://ai.google.dev/gemini-api/docs/pricing', docsUrl: 'https://ai.google.dev/gemini-api/docs/image-generation' },
  { id: 'byteplus', name: 'BytePlus ModelArk', failureRule: 'unknown', failureNote: 'BytePlus bills video by tokens used; it doesn’t publish whether failed tasks are billed.', failureSource: null,
    actualCost: 'per-job', actualNote: 'Each finished video task reports usage.completion_tokens; the cost is those tokens × the published rate. Images bill per image.', balance: 'none', balanceNote: 'BytePlus shows the balance in its console only.', scopedKeys: 'Keys are per region and project.',
    billingUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1544106', docsUrl: 'https://docs.byteplus.com/en/docs/ModelArk/' },
  { id: 'dashscope', name: 'Alibaba Model Studio', failureRule: 'unknown', failureNote: 'Alibaba says failed image requests are free; for speech it doesn’t say.', failureSource: 'https://help.aliyun.com/en/model-studio/image-faq',
    actualCost: 'none', actualNote: 'Not reported per request.', balance: 'none', balanceNote: 'Alibaba shows the balance in its billing console only.', scopedKeys: 'Not documented.',
    billingUrl: 'https://help.aliyun.com/en/model-studio/bill-query-and-cost-management', docsUrl: 'https://help.aliyun.com/en/model-studio/bill-query-and-cost-management' },
];
const PB = Object.fromEntries(PROVIDER_BILLING.map((p) => [p.id, p])) as Record<string, ProviderBilling>;
export const billingInfo = (id: string): ProviderBilling => PB[id] ?? { ...PB.minimax, id, name: providerName(id), failureNote: 'This provider doesn’t publish whether failed requests are billed.', billingUrl: null, docsUrl: null, balanceNote: 'Not available.' };
export const failureRuleOf = (billedTo: BilledTo): FailureRule => billingInfo(billedTo).failureRule;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Who bills a route: 'local' (free), 'comfy' (Comfy partner nodes and Comfy Cloud), else the provider whose key the route uses. */
export function billedToOf(kind: string | null | undefined, routeId?: string | null): BilledTo {
  if (!kind || kind === 'local') return 'local';
  if (kind === 'comfy-router' || kind === 'comfy-cloud') return 'comfy';
  if (kind === 'fal' || kind === 'replicate') return kind;
  const r = routeId ? findRoute(routeId) : undefined; return providerForEnvKey(r?.envKey) ?? (routeId?.startsWith('direct:bfl') ? 'bfl' : 'direct');
}
export interface CostEstimate { billedTo: BilledTo; billedToName: string; estUsd: number; estUnits?: number; unitLabel?: string; failureRule: FailureRule; failureNote: string; estimated: boolean;
  /** Sample run (mock run, nothing sent): estUsd is 0 and realRunUsd is what the run costs once a key is added. */ demo: boolean; realRunUsd: number | null; actualReported: boolean;
  /** Prices in dollars (2026-10-26): the date the list price was checked (the route's price row), the user's Comfy plan on a Comfy run
   *  (Settings → Your plans; detail line only), and the price in words: usdText "≈ $0.76" / "Free · this computer", detail "160 Comfy credits · on your Creator plan · price checked 2026-10-26". */
  checkedAt?: string | null; sourceUrl?: string | null; plan?: ComfyPlanId | null; usdText?: string; detail?: string | null;
  /** D1 (2026-10-28): the model has no published price here, so this is an estimate ("About $X (estimate)"); the real cost is recorded after the run. */
  unconfirmed?: boolean }
/** Units in the provider's own currency where it has one (Comfy credits at 211 per USD; BFL credits at 100 per USD). */
/** Comfy credits for a USD figure, rounded UP (2026-10-24, was Math.round of the cent-rounded price: Seedream Pro layers 2K showed 13 for 13.58).
 *  Rounded to 2 decimals first (Comfy shows credits to 2 decimals; the rows keep USD to 5 decimals, so 17 credits must not show as 18). */
export { comfyUnits }; // shared/runCost.ts: one rounding for the quote and the bar's option prices
const unitsOf = (billedTo: BilledTo, usd: number) => providerUnits(billedTo, usd); // shared/runCost.ts (the bar's option prices use the same)
/** ✦ credits (1 credit = $0.01, the existing quote field) → the cost object. */
export function costOf(o: { kind: string | null | undefined; routeId?: string | null; credits: number | null; demo?: boolean; listCredits?: number | null; estimated?: boolean; exactUsd?: number | null; unconfirmed?: boolean }): CostEstimate {
  const billedTo = billedToOf(o.kind, o.routeId); const info = billingInfo(billedTo);
  const real = billedTo === 'local' ? 0 : o.demo ? (o.listCredits ?? null) : o.credits;
  const realUsd = real == null ? null : r4(real / 100); const estUsd = o.demo || billedTo === 'local' ? 0 : realUsd ?? 0;
  // exactUsd (the unrounded price) when it belongs to these credits (it rounds up to them); else the cent-rounded figure, which is never below it
  const exact = exactWithinCent(o.exactUsd, realUsd); // within the cent the credits round up from
  const units = billedTo !== 'local' ? unitsOf(billedTo, exact ?? (o.demo ? realUsd ?? 0 : estUsd)) : {};
  const route = o.routeId ? findRoute(o.routeId) : undefined; const hp = route?.priceRef ? HOSTED_BY_ID[route.priceRef] : undefined;
  const checkedAt = billedTo === 'local' ? null : hp?.checkedAt ?? (route as any)?.checkedAt ?? null; const sourceUrl = billedTo === 'local' ? null : hp?.sourceUrl ?? (route as any)?.sourceUrl ?? null;
  const plan = billedTo === 'comfy' ? effectiveComfyPlan() : null; const estimated = billedTo !== 'local' && (o.estimated ?? true);
  const shownUsd = o.demo ? realUsd ?? 0 : estUsd;
  const usdText = billedTo === 'local' ? LOCAL_FREE : shownUsd > 0 ? usdToken(shownUsd, { approx: estimated }) : 'Free';
  const cost: CostEstimate = { billedTo, billedToName: info.name, estUsd, ...units, failureRule: info.failureRule, failureNote: info.failureNote, estimated, demo: !!o.demo && billedTo !== 'local', realRunUsd: billedTo === 'local' ? 0 : realUsd, actualReported: info.actualCost === 'per-job',
    checkedAt, sourceUrl, plan, usdText, ...(billedTo !== 'local' && (o.unconfirmed || (hp && hp.usd == null && typeof hp.estimateUsd === 'number')) ? { unconfirmed: true } : {}) };
  cost.detail = costDetail(cost); return cost;
}

// ---------- savings (a free local run vs the cheapest hosted route for the same model and settings) ----------
/** What a local run saved: the cheapest hosted route the submit's own quote priced for this model and these settings (same resolver, same
 *  credits: routing/select.ts option()). Only routes that could really take the job count: ready ones, or ones that only need the user's key.
 *  Coming soon, not wired, input-blocked, open-weights-only or unpriced routes don't. null when no hosted route exists (nothing is claimed). */
export interface LocalSavings { savedUsd: number; vs: { routeId: string; runOn: string; label: string; credits: number } }
export function localSavingsOf(options: { routeId: string; kind: string; envKey?: string | null; credits: number | null; available: boolean; reasonCode?: string }[] | null | undefined): LocalSavings | null {
  const hosted = (options ?? []).filter((o) => o.kind !== 'local' && typeof o.credits === 'number' && o.credits > 0 && (o.available || o.reasonCode === 'key_missing'));
  if (!hosted.length) return null;
  const best = hosted.reduce((a, b) => (b.credits! < a.credits! ? b : a));
  const runOn = runOnOfRoute(best); return { savedUsd: r4(best.credits! / 100), vs: { routeId: best.routeId, runOn, label: RUN_ON_LABELS[runOn] ?? runOn, credits: best.credits! } };
}

// ---------- spend log ----------
/** Step 2: modelKey / runOn / runOnLabel for a spend row: stored, else from its job (camera moves decide the model), else from tool + provider + route. */
function spendModelFields(r: { jobId: string; toolId: string; model: string; route: string | null; modelKey?: string | null; runOn?: string | null }) {
  const j = jobs.get(r.jobId); const f = jobModelFields({ toolId: r.toolId, provider: r.model, route: r.route, input: j?.input, modelKey: r.modelKey ?? j?.modelKey ?? undefined, runOn: r.runOn ?? undefined });
  return { modelKey: f.modelKey, runOn: f.runOn, runOnLabel: f.runOnLabel };
}
export interface SpendRow { id: string; jobId: string; createdAt: number; finishedAt: number | null; toolId: string; model: string; modelName: string | null; route: string | null; routeKind: string | null;
  billedTo: BilledTo; estUsd: number; estUnits: number | null; unitLabel: string | null; actualUsd: number | null; actualSource: string | null; status: string; started: boolean; neverSent?: boolean;
  failureRule: FailureRule; demo: boolean; mode: BillingMode; credits: number;
  /** Step 2: stable model key + the account it ran on (absent on rows written before v2: derived on read, see spendModelFields). */
  modelKey?: string | null; runOn?: string | null;
  /** Agent budgets (agentBudget.ts): the MCP agent session that started this run (X-OHF-Agent-Budget header), else absent. */
  agentId?: string | null; agentName?: string | null;
  /** Sample / mock run (mock backend, a hosted route that only has a mock executor, tools/shared.ts mockRun): nothing reached a provider, so it counts $0. */
  simulated?: boolean;
  /** A free local run: what the cheapest hosted route would have cost for the same model and settings (localSavingsOf, at submit). Absent when none exists. */
  savedUsd?: number | null; savedVs?: LocalSavings['vs'] | null }
/** Tests only: OPENHIGGSFIELD_COUNT_SIMULATED_SPEND=1 counts mock runs like real ones, so spend totals can be exercised on the mock backend. Never set in a real install. */
const countSimulated = () => /^(1|true|on|yes)$/i.test(env('COUNT_SIMULATED_SPEND') ?? '');
/** Will this run reach a real provider? On the mock backend nothing does unless OPENHIGGSFIELD_ROUTING_LIVE is on (routing/run.ts live()). */
export const simulatedAtSubmit = () => config.backend === 'mock' && !/^(1|true)$/i.test(env('ROUTING_LIVE') ?? '');
const rows = () => all<SpendRow>('spend');
/** PB-08: the model's display name ("Nano Banana 2") from the moment the row is written, so unfinished and canceled runs never show the raw provider id. */
const displayName = (j: Job | undefined | null): string | null => { if (!j) return null; if (j.modelName) return j.modelName; try { return engineNameOf(j) || null; } catch { return null; } };
/** Agent budgets: rows of one agent budget, with live status (what counts uses countedUsd, exactly like the Spend totals). */
export const agentSpendRows = (agentId: string): SpendRow[] => rows().filter((r) => r.agentId === agentId).map(live);
const save = (r: SpendRow) => put('spend', r.id, r);
const getRow = (id: string) => rows().find((r) => r.id === id);
/** At submit (index.ts, after routing): the estimate. */
export function recordSpend(job: Job, credits: number, opts: { demo?: boolean; route?: string } = {}) {
  try {
    const route = opts.route ?? job.route; // opts.route: an allowFallback move to the next route (spendGuard.ts guardNextRoute), before job.route changes
    const kind = route ? findRoute(route)?.kind ?? route.split(':')[0] : (credits > 0 ? 'direct' : 'local');
    const c = costOf({ kind, routeId: route ?? null, credits, demo: opts.demo });
    save({ id: job.id, jobId: job.id, createdAt: job.createdAt, finishedAt: null, toolId: job.toolId, model: job.provider, modelName: displayName(job), route: route ?? null, routeKind: kind, modelKey: job.modelKey ?? null, runOn: job.runOn ?? null,
      billedTo: c.billedTo, estUsd: c.estUsd, estUnits: c.estUnits ?? null, unitLabel: c.unitLabel ?? null, actualUsd: null, actualSource: null, status: job.status, started: false,
      failureRule: c.failureRule, demo: c.demo, mode: billingMode(), credits: c.demo ? 0 : credits, agentId: job.agent?.id ?? null, agentName: job.agent?.name ?? null,
      simulated: c.billedTo !== 'local' && (simulatedAtSubmit() || !!job.simulated),
      ...(c.billedTo === 'local' && job.savedUsd != null && job.savedUsd > 0 ? { savedUsd: job.savedUsd, savedVs: job.savedVs ?? null } : {}) });
  } catch (e) { console.error('[billing] recordSpend failed:', (e as Error).message); }
}
/** When the job ends (queue.ts settle): final route (a fallback may have moved it), status, and the actual cost when the provider reported one. */
export function settleSpend(job: Job) {
  try {
    const r = getRow(job.id); if (!r) return;
    if (job.route && job.route !== r.route) { const kind = findRoute(job.route)?.kind ?? job.route.split(':')[0]; const credits = job.routing?.prices?.[job.route] ?? r.credits;
      const c = costOf({ kind, routeId: job.route, credits, demo: r.demo }); Object.assign(r, { route: job.route, routeKind: kind, billedTo: c.billedTo, estUsd: c.estUsd, estUnits: c.estUnits ?? null, unitLabel: c.unitLabel ?? null, failureRule: c.failureRule }); }
    r.status = job.status; r.finishedAt = job.finishedAt ?? Date.now(); r.started = !!job.startedAt; r.modelName = job.modelName ?? r.modelName ?? displayName(job);
    if (job.simulated && !job.actualCost) r.simulated = true; // the result came from a mock run (no provider was called): $0
    // A submit-time figure (BFL's AsyncResponse.cost) counts only when the run finished; a settled figure always counts.
    if (job.actualCost && Number.isFinite(job.actualCost.usd) && (job.status === 'done' || /settled/.test(job.actualCost.source))) { r.actualUsd = r4(job.actualCost.usd); r.actualSource = job.actualCost.source; }
    save(r);
  } catch (e) { console.error('[billing] settleSpend failed:', (e as Error).message); }
}
const FAILED_STATUS = new Set(['failed', 'blocked', 'canceled']);
/** Failure reasons the provider gives before any work is queued (Router estimate / submit checks): nothing can have been used. */
export const PRE_DISPATCH = new Set(['cloud_credits', 'cloud_plan', 'route_not_enabled', 'key_invalid', 'input_invalid', 'price_changed', 'model_unavailable', 'upload_failed']);
/** Status from the live job when the row hasn't settled yet (needs_decision, running). */
const live = (r: SpendRow): SpendRow => { const j = jobs.get(r.jobId);
  // Rows written before `simulated` existed: a run that never got a provider request id (prompt id, request id, Comfy Cloud job id) or a reported cost
  // never reached a provider (a mock / sample run), so it is not spend. That is what made an all-local, all-free day show "Spend today $0.08".
  const legacySim = r.simulated === undefined && !!j && (j.status === 'done' || j.status === 'failed' || j.status === 'blocked' || j.status === 'canceled') && !(j.requestIds?.length || j.cloudJobId || j.actualCost);
  // A run that ended without ever reaching the provider (no request / prompt / Router id and no reported cost), e.g. a Router call refused at the
  // estimate for lack of credits, used nothing, so it counts $0 whatever the provider's failed-run rule says.
  // a gate refusal (Router not switched on for this model, the plan) happens before any run even when a request id came back: never spend
  const gate = ['route_not_enabled', 'cloud_plan'].includes(String((j as any)?.reasonCode ?? '')) && !j?.actualCost;
  // the runner's chargeNote 'not_charged' (routerRun.ts: a Router 422 before the call, or a content refusal on a model whose catalog says refusals aren't billed)
  // with no reported cost: nothing was charged, so nothing counts (2026-10-31: two Seedance 2.5 refusals each counted their 239-credit estimate)
  // (older jobs carry no chargeNote: the same catalog rule is read from the refusal itself)
  const notCharged = !!j && (j.status === 'failed' || j.status === 'blocked') && !j.actualCost
    && ((j as any).chargeNote === 'not_charged' || ((j as any).reasonCode === 'content_blocked' && policyRefusalCharge(j as any) === 'no'));
  const neverSent = notCharged || (!!j && (j.status === 'failed' || j.status === 'blocked' || j.status === 'canceled') && PRE_DISPATCH.has(String((j as any).reasonCode ?? '')) && (gate || !(j.requestIds?.length || j.cloudJobId || (j as any).routerRequestId || j.comfyPrompt || j.actualCost)));
  if (!r.modelName && j) r = { ...r, modelName: displayName(j) }; // PB-08: rows written before the name was stored
  if (r.modelName) r = { ...r, modelName: catalogueNameOf(r.toolId, r.model, r.modelName, j?.input ?? null) }; // older rows stored "Seedance": the catalogue name with version
  if (r.finishedAt) return legacySim ? { ...r, simulated: true } : neverSent ? { ...r, neverSent: true } : r;
  return j ? { ...r, modelName: j.modelName ?? r.modelName, status: j.status, started: r.started || !!j.startedAt, simulated: r.simulated || legacySim || (!!j.simulated && !j.actualCost), ...(neverSent ? { neverSent: true } : {}) } : r; };
/** A Comfy Cloud workflow route whose price row says it is billed by GPU time (hostedPrices note), e.g. comfy-cloud:cloud-h3-wf. */
const gpuBilled = (route?: string | null) => { const pid = route?.split(':')[1]; return !!pid && /billed by GPU time/i.test(HOSTED_BY_ID[pid]?.note ?? ''); };
/** The job view's cost line (GET /api/jobs/:id `spend`, MCP get_job): the estimate at submit (USD, + Comfy / BFL credits), the actual cost when the
 *  provider reported one, and what counts in the Spend totals. null when the job has no spend row (free lane, seeded or very old jobs). */
export function jobSpendView(jobId: string) {
  const raw = getRow(jobId); if (!raw) return null; const r = live(raw);
  return { billedTo: r.billedTo, billedToName: r.billedTo === 'local' ? 'nobody (Local, free)' : billingInfo(r.billedTo).name, estUsd: r.estUsd,
    ...(r.estUnits != null && r.unitLabel && !r.demo ? { estUnits: r.estUnits, unitLabel: r.unitLabel } : {}), estimated: r.billedTo !== 'local',
    actualUsd: r.actualUsd, actualSource: r.actualSource, countedUsd: countedUsd(r), simulated: !!r.simulated, demo: !!r.demo,
    /** Prices in dollars (2026-10-26): the after-run line, "Cost $0.75 (quoted $0.76)" (actual reported) or "Cost ≈ $0.76 (estimate)"; costDetail: the provider's units. */
    costText: costLine({ actualUsd: r.actualUsd, quotedUsd: r.estUsd, local: r.billedTo === 'local', sample: !!r.demo || !!r.simulated, gpuTime: gpuBilled(jobs.get(r.jobId)?.route) }),
    costDetail: r.billedTo === 'local' || r.demo ? null : unitsDetail({ units: r.estUnits, unitLabel: r.unitLabel, plan: r.billedTo === 'comfy' ? effectiveComfyPlan() : null }),
    /** routerRun.ts chargeNote: the model rejected the input after it was sent; whether Comfy bills that is not documented, so the estimate is unconfirmed. */
    ...((jobs.get(jobId) as any)?.chargeNote === 'unconfirmed' && r.actualUsd == null ? { estimateUnconfirmed: true } : {}) };
}
/** What counts in the Spend totals (and agent budgets): the actual cost when known; else the estimate, except runs that never started, demo runs, and failed runs on providers that don't charge failures. */
export function countedUsd(r: SpendRow): number {
  if (r.demo || r.billedTo === 'local') return 0;
  if (r.actualUsd != null) return r.actualUsd; // a provider reported a real cost
  if (r.simulated && !countSimulated()) return 0; // mock / sample runs are never real spend
  if (r.neverSent) return 0; // ended before reaching the provider, or a failure the provider doesn't bill: nothing was used
  if (r.status === 'canceled' && !r.started) return 0;
  if ((r.status === 'failed' || r.status === 'blocked' || r.status === 'canceled') && r.failureRule === 'not-charged') return 0;
  return r.estUsd;
}
/** Profile page: what running locally saved, all time (same rule as the summary's savedUsd: finished, real local runs that stored a hosted alternative). */
export function savedAllTime(): { savedUsd: number; savedRuns: number } {
  const saved = rows().map(live).filter((r) => r.billedTo === 'local' && r.status === 'done' && !r.simulated && !r.demo && (r.savedUsd ?? 0) > 0);
  return { savedUsd: r4(saved.reduce((a, r) => a + (r.savedUsd ?? 0), 0)), savedRuns: saved.length };
}
export const startOf = (period: 'day' | 'month', now = new Date()) => (period === 'day' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(now.getFullYear(), now.getMonth(), 1)).getTime();
export const spentUsd = (provider: string, period: 'day' | 'month', now = new Date(), excludeJobId?: string) => { const from = startOf(period, now); return r4(rows().filter((r) => r.billedTo === provider && r.createdAt >= from && r.jobId !== excludeJobId).map(live).reduce((s, r) => s + countedUsd(r), 0)); };

/** A run's picture for the Spend gallery, the runs table and the canvas spend chip: its first output (url) and the still a video or 3D
 *  result already has (poster; '' when none: the page asks /api/media/thumb). null when the job is gone or deleted from the library. */
export function jobThumb(j: Job | undefined | null): { url: string; poster: string } | null {
  if (!j || metaOf(j.id).deletedAt) return null;
  const out: any = (j.outputs ?? []).find((o: any) => o?.url) ?? null; const url = String(out?.url ?? j.resultUrl ?? '');
  const poster = String(out?.posterUrl ?? (j as any).threeD?.posterUrl ?? '');
  return url ? { url, poster } : null;
}
/** Spend page (Gallery): one period's totals, sparkline, KPIs and the runs to show as tiles. Read-only. */
export function spendOverview(period: SpendPeriod, now = new Date()) {
  const all0 = rows(); const earliest = all0.reduce((m, r) => Math.min(m, r.createdAt), Infinity);
  const from = periodStart(period, now, Number.isFinite(earliest) ? earliest : null); const to = now.getTime();
  const list = all0.filter((r) => r.createdAt >= from).map(live).map((r) => ({ r, usd: countedUsd(r) }));
  const paid = list.filter((x) => x.usd > 0); const free = list.filter((x) => x.r.billedTo === 'local' && !x.r.demo);
  const samples = list.filter((x) => x.usd === 0 && x.r.billedTo !== 'local' && (x.r.demo || x.r.simulated));
  const spent = r4(paid.reduce((s, x) => s + x.usd, 0));
  const series = buckets(list.map((x) => ({ createdAt: x.r.createdAt, usd: x.usd })), from, to);
  const real = list.filter((x) => !x.r.demo && x.r.billedTo !== 'local' && (!x.r.simulated || countSimulated()));
  const acc = quoteAccuracy(real.map((x) => ({ estUsd: x.r.estUsd, actualUsd: x.r.actualUsd })));
  const over = overQuoteByTool(real.map((x) => ({ ...x, toolId: x.r.toolId, estUsd: x.r.estUsd, actualUsd: x.r.actualUsd }))).slice(0, 3);
  const failed = paid.filter((x) => x.r.status === 'failed' || x.r.status === 'blocked' || x.r.status === 'canceled');
  const tile = (x: { r: SpendRow; usd: number }) => { const j = jobs.get(x.r.jobId); const th = jobThumb(j); const inp: any = j?.input ?? {}; const sec = Number(inp.duration ?? inp.seconds);
    return { jobId: x.r.jobId, toolId: x.r.toolId, model: x.r.model, route: x.r.route, modelName: x.r.modelName, createdAt: x.r.createdAt, status: x.r.status, billedTo: x.r.billedTo,
      usd: x.usd, estUsd: x.r.estUsd, actualUsd: x.r.actualUsd, local: x.r.billedTo === 'local', sample: x.usd === 0 && x.r.billedTo !== 'local' && (!!x.r.demo || !!x.r.simulated),
      url: th?.url ?? '', poster: th?.poster ?? '', seconds: inp.duration != null || inp.seconds != null ? (Number.isFinite(sec) ? sec : null) : null,
      resolution: typeof inp.resolution === 'string' ? inp.resolution : null, types: Array.isArray(inp.types) ? inp.types.join(',') : null }; };
  const byUsd = [...paid].sort((a, b) => b.usd - a.usd || b.r.createdAt - a.r.createdAt);
  const recentFree = list.filter((x) => x.usd === 0 && x.r.status === 'done').sort((a, b) => b.r.createdAt - a.r.createdAt);
  const tools = shareByTool(paid.map((x) => ({ toolId: x.r.toolId, usd: x.usd })));
  // the costliest run of the top tool (the tip line asks the server for a shorter clip's real price)
  const topRun = tools[0] ? byUsd.find((x) => x.r.toolId === tools[0].toolId) : null;
  const saved = list.filter((x) => x.r.billedTo === 'local' && x.r.status === 'done' && !x.r.simulated && !x.r.demo && (x.r.savedUsd ?? 0) > 0);
  // the hero's honest split: what providers reported (charged) vs estimates (no reported cost, incl. failed runs counted at their estimate)
  const charged = r4(paid.reduce((s, x) => s + (x.r.actualUsd != null ? x.usd : 0), 0));
  const overQuotes = over.map((g) => ({ jobId: g.row.r.jobId, toolId: g.toolId, ratio: Math.round(g.ratio * 10) / 10, count: g.count, gapUsd: g.gapUsd, estUsd: g.row.r.estUsd, actualUsd: g.row.r.actualUsd as number, run: tile(g.row) }));
  return { period, from: new Date(from).toISOString(), to: new Date(to).toISOString(), billingMode: billingMode(),
    totals: { spentUsd: spent, runs: list.length, everRuns: all0.length, paidRuns: paid.length, freeRuns: free.length, sampleRuns: samples.length, savedUsd: r4(saved.reduce((s, x) => s + (x.r.savedUsd ?? 0), 0)),
      chargedUsd: charged, estimatedUsd: r4(Math.max(0, spent - charged)) },
    series, biggest: byUsd[0] ? tile(byUsd[0]) : null, accuracy: acc,
    overQuote: overQuotes[0] ? (({ run, ...o }) => o)(overQuotes[0]) : null, overQuotes, // overQuote: the biggest one (older clients)
    failedCharged: failed.length ? { runs: failed.length, usd: r4(failed.reduce((s, x) => s + x.usd, 0)), providers: [...new Set(failed.map((x) => billingInfo(x.r.billedTo).name))] } : null,
    tools: tools.slice(0, 8), topRun: topRun ? tile(topRun) : null,
    paidTiles: byUsd.slice(0, 60).map(tile), paidMore: Math.max(0, byUsd.length - 60), freeTiles: recentFree.slice(0, 60).map(tile), freeMore: Math.max(0, recentFree.length - 60) };
}

// ---------- money words ----------
const plainUsd = (n: number) => `$${n < 1 && n > 0 ? n.toFixed(n < 0.1 ? 3 : 2).replace(/0$/, '') : n.toFixed(2)}`;
export const usd = plainUsd;

// ---------- connected accounts ----------
export interface AccountView { provider: string; name: string; connected: boolean; balance?: number | null; balanceUnit?: string | null; balanceUsd?: number | null; monthSpendUsd?: number | null; plan?: ComfyPlanId | null;
  fetchedAt: string | null; source: 'provider' | 'unavailable'; note: string; /** did the provider take the key just now (absent: no balance read for this provider, so the app can't tell) */ keyCheck?: 'ok' | 'rejected' | 'offline'; billingUrl: string | null; failureRule: FailureRule; failureNote: string; actualCost: ProviderBilling['actualCost'];
  mock?: { sample: true; balance: number; balanceUnit: string; balanceUsd: number; note: string } }
const CACHE_MS = 5 * 60_000; const cache = new Map<string, { at: number; v: AccountView }>();
type Reader = (key: string) => Promise<{ balance: number; balanceUnit: string; balanceUsd: number; monthSpendUsd?: number | null; plan?: ComfyPlanId | null }>;
/** Your plans (2026-10-26): Comfy publishes no plan / subscription endpoint (docs.comfy.org, local copy read 2026-10-26: the only billing GET is
 *  /api/billing/usage/timeseries). So the plan is read from that same reply only if it ever names one (a tier / plan field); no extra call is
 *  made. Otherwise the user picks it in Settings. */
export function planInReply(j: any): ComfyPlanId | null {
  const cands = [j?.summary?.plan, j?.summary?.subscription?.tier, j?.summary?.tier, j?.subscription?.tier, j?.subscription?.plan, j?.plan, j?.tier]
    .map((v) => (v && typeof v === 'object' ? v.name ?? v.id ?? v.tier : v)).filter((v) => typeof v === 'string') as string[];
  for (const c of cands) { const t = c.toLowerCase(); if (/pay.?as.?you.?go|payg/.test(t)) return 'payg'; for (const p of ['standard', 'creator', 'pro'] as const) if (new RegExp(`\\b${p}\\b`).test(t)) return p; }
  return null;
}
/** The Comfy plan read from the account (the cached balance read), else null. */
const detectedComfyPlan = (): ComfyPlanId | null => cache.get('comfy')?.v.plan ?? null;
/** The plan used in price details: what the user picked, else what the account says, else null (nothing said about a plan). */
export const effectiveComfyPlan = (): ComfyPlanId | null => comfyPlanSetting() ?? detectedComfyPlan();
export function plansView() {
  const picked = comfyPlanSetting(); const detected = detectedComfyPlan(); const id = picked ?? detected;
  return { comfy: { plan: id, name: comfyPlanName(id), picked, detected, source: picked ? 'picked' : detected ? 'detected' : null,
    detectNote: 'Comfy’s API doesn’t report the plan, so pick yours. It only changes the detail line: every Comfy plan and top-up works out to about 211 Comfy credits per $1.',
    options: COMFY_PLANS } };
}
const get = async (url: string, headers: Record<string, string>) => { const r = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) { const e: any = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; } return r.json() as Promise<any>; };
/** Read-only endpoints only. Never billing writes, never top-ups. */
const READERS: Record<string, Reader> = {
  // GET https://api.fal.ai/v1/account/billing?expand=credits → credits.current_balance, credits.currency (scope billing:usage:read)
  fal: async (key) => { const j = await get('https://api.fal.ai/v1/account/billing?expand=credits', { authorization: `Key ${key}` }); const b = Number(j?.credits?.current_balance); if (!Number.isFinite(b)) throw new Error('no balance in reply');
    const cur = String(j?.credits?.currency ?? 'USD').toUpperCase(); return { balance: b, balanceUnit: cur, balanceUsd: cur === 'USD' ? b : NaN }; },
  // GET https://api.bfl.ai/v1/credits (x-key) → { credits } (1 credit = $0.01)
  bfl: async (key) => { const j = await get('https://api.bfl.ai/v1/credits', { 'x-key': key }); const c = Number(j?.credits); if (!Number.isFinite(c)) throw new Error('no credits in reply'); return { balance: c, balanceUnit: 'BFL credits', balanceUsd: c / 100 }; },
  // GET https://cloud.comfy.org/api/billing/usage/timeseries (X-API-Key) → summary.balance.amount_micros (cents, despite the name), summary.spend_micros (millionths of USD)
  comfy: async (key) => { const from = new Date(startOf('month')).toISOString(); const j = await get(`https://cloud.comfy.org/api/billing/usage/timeseries?granularity=month&starting_on=${encodeURIComponent(from)}`, { 'x-api-key': key });
    const cents = Number(j?.summary?.balance?.amount_micros); if (!Number.isFinite(cents)) throw new Error('no balance in reply'); const spend = Number(j?.summary?.spend_micros);
    return { balance: Math.round((cents / 100) * COMFY_CREDITS_PER_USD), balanceUnit: 'Comfy credits', balanceUsd: cents / 100, monthSpendUsd: Number.isFinite(spend) ? spend / 1e6 : null, plan: planInReply(j) }; },
};
const MOCK_SAMPLE: Record<string, number> = { fal: 12.4, bfl: 8.75, comfy: 21.1 };
async function account(id: string, refresh: boolean): Promise<AccountView> {
  const info = billingInfo(id); const key = realKeyFor(id); const conf = providerSettings().find((p) => p.id === id);
  const base = { provider: id, name: info.name, billingUrl: info.billingUrl, failureRule: info.failureRule, failureNote: info.failureNote, actualCost: info.actualCost };
  const sample = () => (config.backend === 'mock' && MOCK_SAMPLE[id] != null ? { mock: { sample: true as const, balance: id === 'comfy' ? Math.round(MOCK_SAMPLE[id] * COMFY_CREDITS_PER_USD) : id === 'bfl' ? Math.round(MOCK_SAMPLE[id] * 100) : MOCK_SAMPLE[id],
    balanceUnit: id === 'comfy' ? 'Comfy credits' : id === 'bfl' ? 'BFL credits' : 'USD', balanceUsd: MOCK_SAMPLE[id], note: 'Sample figure (mock mode, no key): shows how a connected balance looks. Not your account.' } } : {});
  if (!key) return { ...base, connected: false, fetchedAt: null, source: 'unavailable', note: conf?.mockedKey ? 'Mock key only (test mode): no real account to read.' : 'No key added.', ...sample() };
  if (!READERS[id]) return { ...base, connected: true, fetchedAt: null, source: 'unavailable', note: info.balanceNote };
  const hit = cache.get(id); if (hit && !refresh && Date.now() - hit.at < CACHE_MS) return hit.v;
  let v: AccountView;
  try { const b = await READERS[id](key); v = { ...base, connected: true, balance: b.balance, balanceUnit: b.balanceUnit, balanceUsd: Number.isFinite(b.balanceUsd) ? r2(b.balanceUsd) : null, monthSpendUsd: b.monthSpendUsd ?? null, ...(b.plan ? { plan: b.plan } : {}), fetchedAt: new Date().toISOString(), source: 'provider', note: info.balanceNote, keyCheck: 'ok' }; }
  catch (e: any) { // never echo the key or the request; status only
    const why = e?.status === 401 && id === 'comfy' ? 'Comfy Cloud didn’t accept this key (401). Check that you pasted the whole key, or make a new one at platform.comfy.org.' : e?.status === 401 || e?.status === 403 ? `${info.name} refused the read (${e.status}): this key can’t read the balance.${id === 'fal' ? ' A fal key with billing read access (READONLY or BILLING preset) can.' : ''}` : `Couldn’t read the balance just now (${e?.status ? `HTTP ${e.status}` : 'network'}).`;
    /* 401 (or 403 from Comfy) = the key was refused; another provider's 403 only means this key can't read the balance */
    const keyCheck = e?.status === 401 || (e?.status === 403 && id === 'comfy') ? 'rejected' as const : e?.status === 403 ? 'ok' as const : 'offline' as const;
    v = { ...base, connected: true, fetchedAt: new Date().toISOString(), source: 'unavailable', note: why, keyCheck }; }
  cache.set(id, { at: Date.now(), v }); return v;
}
export const accounts = (refresh = false) => Promise.all(PROVIDER_BILLING.filter((p) => p.id !== 'local').map((p) => account(p.id, refresh)));

// ---------- HTTP ----------
const canWrite = (req: FastifyRequest) => isLoopback(process.env.HOST) || isLoopback(req.ip);
const WRITE_NOTE = 'Billing settings can be changed only from this computer (the server’s own address).';
function summary(period: 'day' | 'month') {
  const from = startOf(period); const list = rows().filter((r) => r.createdAt >= from).map(live);
  const ids = [...new Set(list.map((r) => r.billedTo))];
  const providers = ids.map((p) => { const mine = list.filter((r) => r.billedTo === p); const counted = r4(mine.reduce((s, r) => s + countedUsd(r), 0));
    return { provider: p, name: billingInfo(p).name, runs: mine.length, demoRuns: mine.filter((r) => r.demo).length, simulatedRuns: mine.filter((r) => r.simulated).length, estUsd: r4(mine.filter((r) => !r.demo && (!r.simulated || countSimulated())).reduce((s, r) => s + r.estUsd, 0)),
      actualUsd: mine.some((r) => r.actualUsd != null) ? r4(mine.reduce((s, r) => s + (r.actualUsd ?? 0), 0)) : null, actualRuns: mine.filter((r) => r.actualUsd != null).length, spentUsd: counted,
      failureRule: billingInfo(p).failureRule }; }).sort((a, b) => b.spentUsd - a.spentUsd || b.runs - a.runs);
  const t = providers.reduce((s, p) => ({ runs: s.runs + p.runs, estUsd: s.estUsd + p.estUsd, actualUsd: s.actualUsd + (p.actualUsd ?? 0), spentUsd: s.spentUsd + p.spentUsd }), { runs: 0, estUsd: 0, actualUsd: 0, spentUsd: 0 });
  // Saved by running locally: finished local runs that stored a hosted alternative at submit (failed or canceled runs saved nothing).
  const saved = list.filter((r) => r.billedTo === 'local' && r.status === 'done' && !r.simulated && !r.demo && (r.savedUsd ?? 0) > 0);
  return { period, from: new Date(from).toISOString(), to: new Date().toISOString(), billingMode: billingMode(), providers, totals: { runs: t.runs, estUsd: r4(t.estUsd), actualUsd: r4(t.actualUsd), spentUsd: r4(t.spentUsd), savedUsd: r4(saved.reduce((a, r) => a + (r.savedUsd ?? 0), 0)), savedRuns: saved.length,
      /** runs that really ran (sample and simulated mock runs left out, unless COUNT_SIMULATED_SPEND): the Create Image toolbar's 'Today: N runs' */ realRuns: list.filter((r) => !r.demo && (!r.simulated || countSimulated())).length },
    note: 'spentUsd counts the actual cost when the provider reports one, else the estimate. Runs that never started, sample runs, simulated (mock) runs, local runs and failed runs on providers that don’t charge failures count $0.' };
}
const settingsView = (req?: FastifyRequest) => { const s = billingSettings(); return { mode: s.mode, modeLocked: modeLocked(), canWrite: req ? canWrite(req) : false, writeNote: WRITE_NOTE,
  comfyCreditsPerUsd: COMFY_CREDITS_PER_USD, providers: PROVIDER_BILLING, plans: plansView() }; };
const parseTime = (v: unknown): number | null => { if (v == null || v === '') return null; const n = Number(v); if (Number.isFinite(n)) return n; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };

export function registerBilling(app: FastifyInstance) {
  app.get('/api/settings/billing', async (req) => settingsView(req));
  app.put('/api/settings/billing', async (req, reply) => {
    if (!canWrite(req)) return reply.code(403).send({ error: WRITE_NOTE, errorType: 'forbidden' });
    const b = (req.body ?? {}) as { mode?: string; comfyPlan?: unknown }; const cur = billingSettings(); // an old client's `limits` is ignored (spending limits were removed)
    if (b.comfyPlan !== undefined && b.comfyPlan !== null && !isComfyPlanId(b.comfyPlan)) return reply.code(400).send({ error: "comfyPlan must be 'standard', 'creator', 'pro', 'payg' or null", errorType: 'validation', issues: [{ code: 'invalid', field: 'comfyPlan', message: "Use 'standard', 'creator', 'pro', 'payg' or null." }] });
    if (b.mode != null && b.mode !== 'own-accounts' && b.mode !== 'team') return reply.code(400).send({ error: "mode must be 'own-accounts' or 'team'", errorType: 'validation', issues: [{ code: 'invalid', field: 'mode', message: "Use 'own-accounts' or 'team'." }] });
    if (b.mode != null && b.mode !== cur.mode && modeLocked()) return reply.code(409).send({ error: 'The billing mode is set by OPENHIGGSFIELD_BILLING_MODE on this server, so it can’t be changed here.', errorType: 'validation', code: 'mode_locked' });
    const next = saveBillingSettings({ mode: (b.mode as BillingMode) ?? cur.mode, ...(b.comfyPlan !== undefined ? { comfyPlan: (b.comfyPlan as ComfyPlanSetting) ?? null } : {}) });
    console.log(`[billing-settings] write caller=${req.ip} mode=${next.mode}`);
    return settingsView(req);
  });
  app.get<{ Querystring: Record<string, string | undefined> }>('/api/spend', async (req, reply) => {
    const q = req.query; const from = parseTime(q.from); const to = parseTime(q.to); const lim = Math.min(200, Math.max(1, Number(q.limit) || 50));
    if ((q.from && from == null) || (q.to && to == null)) return reply.code(400).send({ error: 'from / to must be ISO dates or epoch milliseconds', errorType: 'validation' });
    let list = rows().filter((r) => (from == null || r.createdAt >= from) && (to == null || r.createdAt < to) && (!q.provider || r.billedTo === q.provider) && (!q.tool || r.toolId === q.tool)
      && (!q.agent || (q.agent === 'any' ? !!r.agentId : q.agent === 'none' ? !r.agentId : r.agentId === q.agent)))
      .filter((r) => { if (!q.status) return true; const v = live(r); // status=done | failed (failed, blocked or canceled); counted=1: only runs that count money
        return (q.status === 'failed' ? FAILED_STATUS.has(v.status) : v.status === q.status) && (q.counted !== '1' || countedUsd(v) > 0); })
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
    const total = list.length;
    if (q.cursor) { const [t, id] = String(q.cursor).split('~'); const ts = Number(t); list = list.filter((r) => r.createdAt < ts || (r.createdAt === ts && r.id < id)); }
    const page = list.slice(0, lim).map(live).map((r) => { const th = jobThumb(jobs.get(r.jobId)); return { ...r, ...spendModelFields(r), countedUsd: countedUsd(r), billedToName: billingInfo(r.billedTo).name, url: th?.url ?? '', poster: th?.poster ?? '' }; });
    const last = page.at(-1); return { items: page, total, nextCursor: list.length > lim && last ? `${last.createdAt}~${last.id}` : null, billingMode: billingMode() };
  });
  app.get<{ Querystring: { period?: string } }>('/api/spend/summary', async (req, reply) => {
    const p = req.query.period ?? 'day'; if (p !== 'day' && p !== 'month') return reply.code(400).send({ error: "period must be 'day' or 'month'", errorType: 'validation' });
    return summary(p);
  });
  app.get<{ Querystring: { period?: string } }>('/api/spend/overview', async (req, reply) => {
    const p = req.query.period ?? 'month'; if (!isSpendPeriod(p)) return reply.code(400).send({ error: "period must be '7d', 'month' or 'all'", errorType: 'validation' });
    return reply.header('cache-control', 'no-store').send(spendOverview(p));
  });
  app.get<{ Querystring: { refresh?: string } }>('/api/accounts', async (req) => ({ accounts: await accounts(/^(1|true)$/i.test(req.query.refresh ?? '')), cacheSeconds: CACHE_MS / 1000, mockBackend: config.backend === 'mock' }));
  // Every quote (GET /api/tools/:id/price, /api/models/quote; POST /price re-enters as a GET) gets `cost` + `billingMode` (no spending limits since 2026-10-28).
  // Registered after the routing hook, so it sees the final route and credits.
  app.addHook('preSerialization', async (req, reply, payload: any) => {
    const url = req.url.split('?')[0];
    if (req.method !== 'GET' || !(url === '/api/models/quote' || /^\/api\/tools\/[^/]+\/price$/.test(url)) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    if (!('credits' in payload) && !('routeKind' in payload)) return payload;
    try {
      const kind = payload.routeKind ?? (payload.local === true || payload.localRun === true ? 'local' : null);
      const routeId = payload.routeId ?? payload.route ?? null;
      const credits = typeof payload.credits === 'number' ? payload.credits : null;
      if (kind == null && credits == null) return { ...payload, billingMode: billingMode(), cost: null };
      // Every pre-run price is an estimate (list price × the job's units); only the spend log's actualUsd is a provider-reported figure.
      // exactUsd: set by the routing hook from the routed price (routing/http.ts routeExactUsd), so it always belongs to these credits
      const exactUsd = typeof payload.exactUsd === 'number' ? payload.exactUsd : null;
      const cost = costOf({ kind: kind ?? (credits ? 'direct' : 'local'), routeId, credits, demo: payload.demo === true, listCredits: payload.listCredits ?? null, estimated: true, exactUsd, unconfirmed: payload.unconfirmed === true });
      return { ...payload, billingMode: billingMode(), cost };
    } catch { return payload; }
  });
}
