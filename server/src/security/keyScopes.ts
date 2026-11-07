/**
 * Where each provider's key may go (keyedFetch's allow-lists). Official hosts only, from each provider's docs; a base URL you configure
 * (an env override such as OPENHIGGSFIELD_BFL_BASE_URL) is added by the caller, and Doctor warns when it isn't official (security/baseUrls.ts).
 */
import type { HostRule, KeyScope } from './keyedFetch.js';

export const KEY_HOSTS = {
  /** queue.fal.run (submit, status_url, response_url, cancel_url), rest.fal.ai (uploads), api.fal.ai (billing). */
  fal: ['.fal.run', '.fal.ai'],
  /** api.bfl.ai, and the regional hosts its polling_url names (api.us1.bfl.ai, api.eu1.bfl.ai…). */
  bfl: ['.bfl.ai'],
  /** api.minimax.io, api.minimaxi.com (China). */
  minimax: ['.minimax.io', '.minimaxi.com'],
  ltx: ['.ltx.io', '.ltx.video'],
  openai: ['api.openai.com'],
  google: ['generativelanguage.googleapis.com'],
  /** ark.<region>.bytepluses.com */
  byteplus: ['.bytepluses.com'],
  /** api.comfy.org (Router, storage), cloud.comfy.org (Cloud, billing), deployments on *.run.comfy.app. */
  comfy: ['.comfy.org', '.run.comfy.app'],
} as const satisfies Record<string, readonly HostRule[]>;

/** A scope from a fixed list plus whatever extra hosts (configured bases) are current. */
export const scopeOf = (provider: string, hosts: readonly HostRule[], extra: () => readonly HostRule[] = () => []): KeyScope =>
  ({ provider, hosts: () => [...hosts, ...extra()] });

export const FAL_SCOPE = scopeOf('fal', KEY_HOSTS.fal);
export const BFL_SCOPE = scopeOf('Black Forest Labs', KEY_HOSTS.bfl);
export const COMFY_SCOPE = scopeOf('Comfy', KEY_HOSTS.comfy);
