/**
 * H3 runner Step 1 (Oct 26): "Your Comfy deployment", the user's own Comfy API deployment (a Build on platform.comfy.org, served at
 * https://<deployment>.run.comfy.app) or any other host that speaks Comfy API v2 (a Runpod pod or own GPU box running comfy-api-proxy).
 * Same v2 jobs/assets API as Comfy Cloud, so comfy/cloudV2.ts runs unchanged; only the base URL and the token differ per route.
 *
 * Env var NAMES (values are read only to build requests; never logged, printed, returned or put in an error):
 *  - COMFY_DEPLOY_URL                       the Comfy API deployment URL; auth = COMFY_API_KEY (the same key as Comfy Cloud, per docs.comfy.org/api-reference/v2)
 *  - COMFY_RUNNER_URL + COMFY_RUNNER_TOKEN  optional generic v2 host (comfy-api-proxy); the token is optional (the proxy's auth is off by default)
 * COMFY_DEPLOY_URL wins when both are set.
 *
 * Free probe (probeDeploy): GET /api/v2/health (comfy-api-proxy), else GET /api/v2/jobs?limit=1 (a Comfy API deployment lists its stored jobs from
 * the platform; Comfy Cloud answers 501 there): reachability + key check, no job, no GPU. With nodes=true it also reads GET /api/object_info
 * (where the host exposes it) and checks every node class and model file the deployment workflows need (cloudWorkflows.ts `requires`).
 * Pattern credit: Comfy-Org/comfy-reshoot (MIT): COMFY_API_KEY + COMFY_BASE_URL = the deployment URL, called through @comfyorg/sdk.
 */
import { CLOUD_WORKFLOWS, isStandalone } from './cloudWorkflows.js';
import { lastProbeState, setLastProbeState } from './deployProbeState.js';

export const DEPLOY_ENV = { url: 'COMFY_DEPLOY_URL', key: 'COMFY_API_KEY', runnerUrl: 'COMFY_RUNNER_URL', runnerToken: 'COMFY_RUNNER_TOKEN' } as const;
export type DeployVia = 'comfy-deploy' | 'runner';
/** Route label (Run on detail, route lists, Settings). */
export const DEPLOY_LABEL = 'Your Comfy deployment';
const v = (k: string) => process.env[k]?.trim() || '';
const okUrl = (u: string) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; } };

/** Where deployment routes send jobs, or null when nothing usable is set. Server-internal: the token never leaves this process. */
export function deployTarget(): { via: DeployVia; base: string; token: string } | null {
  const d = v(DEPLOY_ENV.url); if (d && okUrl(d) && v(DEPLOY_ENV.key)) return { via: 'comfy-deploy', base: d.replace(/\/+$/, ''), token: v(DEPLOY_ENV.key) };
  const r = v(DEPLOY_ENV.runnerUrl); if (!d && r && okUrl(r)) return { via: 'runner', base: r.replace(/\/+$/, ''), token: v(DEPLOY_ENV.runnerToken) };
  return null;
}
/** What is set, in plain words (names only, no values). */
export function deployState(): { configured: boolean; via: DeployVia | null; reasonCode: string | null; reason: string | null } {
  const d = v(DEPLOY_ENV.url); const r = v(DEPLOY_ENV.runnerUrl);
  if (d && !okUrl(d)) return { configured: false, via: 'comfy-deploy', reasonCode: 'deploy_url_invalid', reason: `${DEPLOY_ENV.url} isn't a web address (it should look like https://<name>.run.comfy.app)` };
  if (d && !v(DEPLOY_ENV.key)) return { configured: false, via: 'comfy-deploy', reasonCode: 'key_missing', reason: `Your deployment needs your Comfy API key (${DEPLOY_ENV.key}) too` };
  if (!d && r && !okUrl(r)) return { configured: false, via: 'runner', reasonCode: 'deploy_url_invalid', reason: `${DEPLOY_ENV.runnerUrl} isn't a web address` };
  const t = deployTarget(); if (t) return { configured: true, via: t.via, reasonCode: null, reason: null };
  return { configured: false, via: null, reasonCode: 'deploy_missing', reason: `Not set up: add your deployment URL as ${DEPLOY_ENV.url} in your env file` };
}
/** Plain sentence for a deployment route that can't run (route reason / job error). */
export const DEPLOY_MISSING_REASON = "Your Comfy deployment isn't set up yet. Add its URL in your env file (see Settings → Connections)";

/** Extra planned deployment recipes. Character Swap runs on shared Comfy Cloud; only registered deployment workflows belong in the deployment probe. */
export const DEPLOY_RECIPES: { id: string; label: string; nodes: string[]; models: { loader: string; field: string; file: string }[] }[] = [];

/** Every requirement to check: the registered deployment workflows (cloudWorkflows.ts) + the planned recipes. */
export function deployNeeds() {
  const wfs = Object.values(CLOUD_WORKFLOWS).filter(isStandalone).filter((w) => w.target === 'deploy' /* shared-Cloud standalones are not deployment needs */).map((w) => ({ id: w.provider, label: w.label, nodes: w.requires.nodes, models: w.requires.models }));
  return [...wfs, ...DEPLOY_RECIPES.filter((r) => !wfs.some((w) => w.id === r.id))];
}
/** The choices of a loader widget in object_info (old list form [[...], {...}] and the newer COMBO form ['COMBO', {options:[...]}]). */
export function comboOf(info: any, cls: string, field: string): string[] {
  const spec = info?.[cls]?.input?.required?.[field] ?? info?.[cls]?.input?.optional?.[field];
  if (!Array.isArray(spec)) return [];
  if (Array.isArray(spec[0])) return spec[0].map(String);
  if (spec[0] === 'COMBO' && Array.isArray(spec[1]?.options)) return spec[1].options.map(String);
  return [];
}

export type ProbeResult = {
  configured: boolean; via: DeployVia | null; connected: boolean; checkedAt: number;
  /** ok | not_configured | key_invalid | unreachable | not_a_v2_host | error */ code: string; message: string;
  nodes: { checked: boolean; count: number | null; note: string | null };
  recipes: { id: string; label: string; ready: boolean | null; missingNodes: string[]; missingModels: string[] }[];
  missing: string[];
};
export const lastProbe = () => lastProbeState<ProbeResult>();
const T = 8000;

/** Free check of the configured deployment. f: injected fetch (tests). Never sends the key anywhere but the configured host; never returns it. */
export async function probeDeploy(o: { nodes?: boolean; f?: typeof fetch; timeoutMs?: number } = {}): Promise<ProbeResult> {
  const st = deployState(); const t = deployTarget(); const needs = deployNeeds(); const now = Date.now();
  const base = (code: string, message: string, connected = false): ProbeResult => ({ configured: st.configured, via: st.via, connected, checkedAt: now, code, message,
    nodes: { checked: false, count: null, note: null }, recipes: needs.map((n) => ({ id: n.id, label: n.label, ready: null, missingNodes: [], missingModels: [] })), missing: [] });
  if (!t) return setLastProbeState(base('not_configured', st.reason ?? DEPLOY_MISSING_REASON));
  const f = o.f ?? ((...a: Parameters<typeof fetch>) => fetch(...a)); const to = o.timeoutMs ?? T;
  const get = async (p: string) => f(t.base + p, { method: 'GET', headers: t.token ? { Authorization: `Bearer ${t.token}` } : {}, signal: AbortSignal.timeout(to) });
  let r: Response;
  try { r = await get('/api/v2/health'); if (r.status === 404 || r.status === 405) r = await get('/api/v2/jobs?limit=1'); }
  catch (e) { return setLastProbeState(base('unreachable', (e as Error)?.name === 'TimeoutError' ? `No answer within ${to / 1000} s` : 'Couldn’t reach the deployment address')); }
  if (r.status === 401 || r.status === 403) return setLastProbeState(base('key_invalid', t.via === 'runner' ? 'The runner refused the token (COMFY_RUNNER_TOKEN)' : 'The deployment refused your Comfy API key'));
  if (r.status === 501) return setLastProbeState(base('not_a_v2_host', 'That address answers like shared Comfy Cloud, not a deployment'));
  if (!r.ok) return setLastProbeState(base(r.status === 404 ? 'not_a_v2_host' : 'error', r.status === 404 ? 'That address doesn’t serve the Comfy API v2' : `The deployment answered HTTP ${r.status}`));
  const res = base('ok', 'Connected', true);
  if (o.nodes) {
    let info: any = null;
    try { const ri = await get('/api/object_info'); if (ri.ok) info = await ri.json().catch(() => null); else res.nodes.note = ri.status === 401 || ri.status === 403 ? 'The node list needs other access on this host' : 'This host doesn’t share its node list'; }
    catch { res.nodes.note = 'The node list didn’t answer in time'; }
    if (info && typeof info === 'object' && !Array.isArray(info)) {
      const have = new Set(Object.keys(info)); res.nodes = { checked: true, count: have.size, note: null };
      res.recipes = needs.map((n) => { const mn = n.nodes.filter((c) => !have.has(c)); const mm = n.models.filter((m) => !comboOf(info, m.loader, m.field).includes(m.file)).map((m) => m.file);
        return { id: n.id, label: n.label, ready: !mn.length && !mm.length, missingNodes: mn, missingModels: mm }; });
      res.missing = [...new Set(res.recipes.flatMap((x) => [...x.missingNodes, ...x.missingModels]))];
    } else res.nodes.note ??= 'This host doesn’t share its node list';
  }
  return setLastProbeState(res);
}
