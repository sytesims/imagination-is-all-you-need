/**
 * Address overrides that a key goes to (security review 2026-11-07, F6). Each one can only be set by you (the env file, the profile,
 * a plugin's saved settings); when it points somewhere other than the provider's own hosts, or over plain http to another computer, the
 * key follows it. keyedFetch already refuses plain http there; this names the overrides so Doctor and Settings → Connections can say so.
 * Pure (no server modules): the doctor runs it with the app stopped.
 */
import { keyUrlAllowed, isLoopbackUrl, type HostRule } from './keyedFetch.js';
import { KEY_HOSTS } from './keyScopes.js';

export interface BaseOverride { name: string; provider: string; hosts: readonly HostRule[] }
/** Env variables (without OPENHIGGSFIELD_ / OPENJUTSU_ where the app adds it) and the hosts that are the provider's own. Empty hosts = your
 *  own server by design (a runner, a translator): only plain http to another computer is flagged. */
export const BASE_OVERRIDES: BaseOverride[] = [
  { name: 'COMFY_CLOUD_URL', provider: 'Comfy', hosts: KEY_HOSTS.comfy },
  { name: 'COMFY_ROUTER_URL', provider: 'Comfy', hosts: KEY_HOSTS.comfy },
  { name: 'COMFY_DEPLOY_URL', provider: 'Comfy', hosts: KEY_HOSTS.comfy },
  { name: 'COMFY_RUNNER_URL', provider: 'ComfyUI runner', hosts: [] },
  { name: 'BFL_BASE_URL', provider: 'Black Forest Labs', hosts: KEY_HOSTS.bfl },
  { name: 'MINIMAX_BASE_URL', provider: 'MiniMax', hosts: KEY_HOSTS.minimax },
  { name: 'LTX_BASE_URL', provider: 'LTX', hosts: KEY_HOSTS.ltx },
  { name: 'OPENAI_BASE_URL', provider: 'OpenAI', hosts: KEY_HOSTS.openai },
  { name: 'GEMINI_BASE_URL', provider: 'Google Gemini', hosts: KEY_HOSTS.google },
  { name: 'ARK_BASE_URL', provider: 'BytePlus ModelArk', hosts: KEY_HOSTS.byteplus },
  { name: 'PLACE_SUNRA_BASE_URL', provider: 'Sunra', hosts: ['.sunra.ai'] },
  { name: 'PLACE_KIE_BASE_URL', provider: 'kie.ai', hosts: ['.kie.ai'] },
  { name: 'PLACE_KIE_UPLOAD_BASE_URL', provider: 'kie.ai', hosts: ['.kie.ai', 'kieai.redpandaai.co'] },
  { name: 'PLACE_RUNPOD_BASE_URL', provider: 'RunPod', hosts: ['.runpod.ai', '.runpod.io'] },
  { name: 'TRANSLATE_URL', provider: 'translation server', hosts: [] },
];

export interface BaseWarning { name: string; provider: string; origin: string; reason: 'not-https' | 'not-official'; text: string }
const originOf = (u: string) => { try { return new URL(u).origin; } catch { return u.slice(0, 80); } };

/** The warning line for one override, or null when it is fine (unset, the provider's own https host, or this computer). */
export function baseWarning(o: BaseOverride, value: string | undefined): BaseWarning | null {
  const u = value?.trim(); if (!u || isLoopbackUrl(u)) return null;
  const origin = originOf(u); const https = /^https:\/\//i.test(u);
  if (!https) return { name: o.name, provider: o.provider, origin, reason: 'not-https', text: `${o.name} sends your ${o.provider} key to ${origin} without https, so it can be read on the way. Use an https address.` };
  if (o.hosts.length && !keyUrlAllowed(u, o.hosts)) return { name: o.name, provider: o.provider, origin, reason: 'not-official', text: `${o.name} sends your ${o.provider} key to ${origin}, which isn’t ${o.provider}’s own address. Remove it unless you trust that server.` };
  return null;
}
/** The variable names one override can be set with (the app reads OPENHIGGSFIELD_<name>, the old OPENJUTSU_<name>, and the deployment ones bare). */
export const namesOf = (name: string) => [`OPENHIGGSFIELD_${name}`, `OPENJUTSU_${name}`, name];
/** Every override that needs a warning. read(name) gives the value for a name (env, env file, plugin settings). */
export const baseWarnings = (read: (name: string) => string | undefined): BaseWarning[] =>
  BASE_OVERRIDES.map((o) => baseWarning(o, read(o.name))).filter((w): w is BaseWarning => !!w);
