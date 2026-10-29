/**
 * H3 runner Step 1 (Oct 26): routes that run on "Your Comfy deployment" (comfy/deploy.ts). Route id `comfy-deploy:<provider>`, kind 'comfy-cloud'
 * (the same Comfy API key and Comfy account bill it, so Run on stays "Comfy"; the detail line and comfyVariant say "Your Comfy deployment").
 * The runner is the shared Comfy Cloud workflow runner (routing/cloudRun.ts) with a per-route base URL; the graph + plan builder is a standalone
 * entry in comfy/cloudWorkflows.ts. Steps 2–3 (H3 Character Swap, H3 CrossView) add their routes with deployRoute() on their models.
 * envKey = COMFY_DEPLOY_URL (alias COMFY_RUNNER_URL): "configured" means a deployment address is set. Values are never read here.
 */
import type { RouteDef } from './types.js';
import { DEPLOY_ENV, DEPLOY_LABEL } from '../comfy/deploy.js';
import { DEPLOY_PRICE_URL } from '../shared/hostedPrices.js';

export const DEPLOY_PREFIX = 'comfy-deploy:';
export const isDeployRouteId = (routeId?: string | null) => !!routeId && routeId.startsWith(DEPLOY_PREFIX);
/** A route of `modelId` that runs the standalone workflow `provider` on the user's deployment. priceRef = provider (its priceUnmeasured row). */
export function deployRoute(modelId: string, provider: string, o: { typicalLatencySec?: number; modes?: string[]; tools?: string[]; caps?: Record<string, unknown>; output?: RouteDef['output'] } = {}): RouteDef {
  return { routeId: `${DEPLOY_PREFIX}${provider}`, kind: 'comfy-cloud', modelId, endpoint: 'POST <your deployment>/api/v2/jobs (Comfy API v2)', priceRef: provider,
    sourceUrl: 'https://docs.comfy.org/development/serverless/overview', checkedAt: '2026-10-26', typicalLatencySec: o.typicalLatencySec ?? 240, latencyEstimated: true,
    latencySource: 'estimated: per-second GPU time on your deployment, plus a cold start when it has scaled to zero', envKey: DEPLOY_ENV.url, envAliases: [DEPLOY_ENV.runnerUrl],
    label: DEPLOY_LABEL, ...(o.modes ? { modes: o.modes } : {}), ...(o.tools ? { tools: o.tools } : {}), ...(o.caps ? { caps: o.caps } : {}), ...(o.output ? { output: o.output } : {}) };
}
/** The deployment test route (not listed on any tool; run with POST /api/comfy-deploy/smoke). */
export const DEPLOY_SMOKE_ROUTE: RouteDef = { ...deployRoute('deploy-smoke', 'deploy-smoke', { typicalLatencySec: 90, output: 'image' }), sourceUrl: DEPLOY_PRICE_URL };
/** Deployment routes that belong to no model's route list (findRoute looks here). */
export const DEPLOY_ROUTES: Record<string, RouteDef> = { [DEPLOY_SMOKE_ROUTE.routeId]: DEPLOY_SMOKE_ROUTE };
