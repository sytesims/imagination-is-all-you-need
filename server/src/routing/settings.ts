/**
 * Provider key status for Settings. NEVER returns key values.
 * POST stores a key in <repo>/.env.local (the file scripts/install.sh sources) and in process.env, but ONLY when the server is
 * bound to a loopback address (HOST=127.0.0.1 / ::1 / localhost). The dev server binds 0.0.0.0, so POST answers 403 there.
 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { keyConfigured } from './keys.js';
import { getKv, setKv } from '../db.js';
import { env } from '../env.js';
import { invalidateTools } from '../toolsCache.js';
import { openWeightsOnly } from '../providers.js';
import { aKey } from '../shared/modelIds.js';
import { FAL_ENV, REPLICATE_ENV, COMFY_ENV } from './routes.js';
export interface ProviderSetting { id: string; name: string; envKey: string; envAliases: string[]; configured: boolean; mockedKey?: boolean; docsUrl: string; keysUrl: string;
  /** Runs open weights: local ComfyUI (always) and Comfy (Comfy Cloud runs our open graphs; its partner/API nodes are not open weights). Everything else is a hosted API. */
  openWeights: boolean; openWeightsNote: string | null;
  /** Item 5: picker/Settings section, same labels as /api/routes: 'Local' (your ComfyUI) or 'API' (every keyed provider, Comfy API included). */
  providerGroup: 'Local' | 'API';
  /** Open-weights-only mode: why this provider is off (else null). The provider stays listed so Settings can show it disabled with this reason. */
  disabledReason: string | null;
  /** dp30 (e): when the key in use was saved here (ISO), else null (a key from the server's env file / environment, a mock key, or none). */ keySetAt: string | null;
  /** dp30 (e): '••••' + the key's last 4 characters (keys of 12+ characters; shorter keys show '••••' only); null when no real key is set. Never more. */ keyHint: string | null;
  /** dp30 (e): where the key in use came from: 'saved' (POST /api/settings/providers) | 'env' (server environment / .env file, no timestamp) | 'mock' (mockKeys only) | null (none). */ keySource: 'saved' | 'env' | 'mock' | null;
  /** The environment variable the key in use is read from (a name, never a value); null when there is no real key. Lets the UI say "still set as FAL_KEY". */ keyEnvVar: string | null;
  /** 'ok' = the key matches the provider's well-known format; 'unexpected' = it doesn't (saved before the check, or set in the env file); 'unchecked' = this provider has no stable format to check, so the key is only tried on the first run. null when there is no real key. */ keyFormat: 'ok' | 'unexpected' | 'unchecked' | null }
const OW_NOTE: Record<string, string> = { local: 'Open weights locally.', comfy: 'Partner (API) nodes are hosted models, not open weights. The same key also runs our open-weights graphs on Comfy Cloud, so it stays on in open-weights-only mode.' };
const P: Omit<ProviderSetting, 'configured' | 'openWeights' | 'openWeightsNote' | 'disabledReason' | 'providerGroup' | 'keySetAt' | 'keyHint' | 'keySource' | 'keyEnvVar' | 'keyFormat'>[] = [
  { id: 'local', name: 'Local ComfyUI', envKey: 'COMFY_BASE_URL', envAliases: [], docsUrl: 'https://docs.comfy.org/', keysUrl: '' },
  { id: 'comfy', name: 'Comfy Cloud (one key)', /* BH9 P1-8: was 'Comfy API (partner nodes / Router / Cloud)' */ envKey: COMFY_ENV, envAliases: [], docsUrl: 'https://docs.comfy.org/tutorials/partner-nodes/overview', keysUrl: 'https://platform.comfy.org/profile/api-keys' },
  { id: 'fal', name: 'fal', envKey: FAL_ENV, envAliases: ['FAL_KEY'], docsUrl: 'https://docs.fal.ai/model-apis/model-endpoints/queue', keysUrl: 'https://fal.ai/dashboard/keys' },
  { id: 'replicate', name: 'Replicate', envKey: REPLICATE_ENV, envAliases: ['REPLICATE_API_TOKEN'], docsUrl: 'https://replicate.com/docs/reference/http', keysUrl: 'https://replicate.com/account/api-tokens' },
  { id: 'minimax', name: 'MiniMax (direct API)', envKey: 'OPENHIGGSFIELD_MINIMAX_API_KEY', envAliases: [], docsUrl: 'https://platform.minimax.io/docs/guides/video-generation', keysUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key' },
  { id: 'ltx', name: 'LTX (direct API)', envKey: 'OPENHIGGSFIELD_LTX_API_KEY', envAliases: [], docsUrl: 'https://docs.ltx.io/', keysUrl: 'https://docs.ltx.io/quickstart' /* "Sign in to the Developer Console to create your API key" */ },
  // Official lab APIs, batch 2 (2026-10-23)
  { id: 'openai', name: 'OpenAI (direct API)', envKey: 'OPENHIGGSFIELD_OPENAI_API_KEY', envAliases: [], docsUrl: 'https://developers.openai.com/api/docs/guides/image-generation', keysUrl: 'https://platform.openai.com/api-keys' },
  { id: 'google', name: 'Google Gemini API (direct API)', envKey: 'OPENHIGGSFIELD_GEMINI_API_KEY', envAliases: [], docsUrl: 'https://ai.google.dev/gemini-api/docs/image-generation', keysUrl: 'https://aistudio.google.com/apikey' },
  { id: 'byteplus', name: 'BytePlus ModelArk (direct API)', envKey: 'OPENHIGGSFIELD_ARK_API_KEY', envAliases: [], docsUrl: 'https://docs.byteplus.com/en/docs/ModelArk/', keysUrl: 'https://console.byteplus.com/ark/region:ark+ap-southeast-1/apiKey' },
  { id: 'dashscope', name: 'Alibaba Model Studio (direct API)', envKey: 'OPENHIGGSFIELD_DASHSCOPE_API_KEY', envAliases: [], docsUrl: 'https://www.alibabacloud.com/help/en/model-studio/qwen-tts', keysUrl: '' },
  { id: 'bfl', name: 'Black Forest Labs (direct API)', envKey: 'OPENHIGGSFIELD_BFL_API_KEY', envAliases: [], docsUrl: 'https://docs.bfl.ai/', keysUrl: 'https://api.bfl.ai' /* BFL: sign in at api.bfl.ai (keys and credits) */ },
  /** Model vs Run-on (step 4): Luma Reframe's direct route reads this key, so Connections lists it (it had no card before). */
  { id: 'luma', name: 'Luma AI (direct API)', envKey: 'OPENHIGGSFIELD_LUMA_API_KEY', envAliases: [], docsUrl: 'https://docs.lumalabs.ai/', keysUrl: '' },
  /** Setup step 3 (2026-10-26): a Hugging Face READ token, used only by the model downloader for huggingface.co files (gated models). Not a place
   *  models run, so it never counts as a paid provider (cloudProvidersEnabled, ACCOUNT_ONLY). */
  { id: 'hf', name: 'Hugging Face', envKey: 'OPENHIGGSFIELD_HF_TOKEN', envAliases: ['HF_TOKEN'], docsUrl: 'https://huggingface.co/docs/hub/security-tokens', keysUrl: 'https://huggingface.co/settings/tokens/new?tokenType=read' },
];
/** Accounts that unlock downloads, not a place models run (no routes, no bill). */
export const ACCOUNT_ONLY = new Set(['hf']);
/** configured uses the same key resolution as submit (keyConfigured: real env key, or mockKeys on the mock backend for native hosted keys).
 *  mockedKey: true when only mockKeys makes it configured (no real key in the env). */
// dp30 (e): kv 'providerKeys.saved' = { [providerId]: { setAt, fp } }; fp = first 16 hex of sha256(key), only to tell whether the key in use is the one saved here. No key value is stored.
type SavedKey = { setAt: string; fp: string }; const KEYS_KV = 'providerKeys.saved';
const fpOf = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 16);
export const keyHintOf = (v: string | null | undefined) => (!v ? null : v.length >= 12 ? `••••${v.slice(-4)}` : '••••');
/** Light per-provider key-format checks, only where the format is well known and stable (the Comfy `comfyui-` prefix is what docs/INSTALL.md and the Router client already
 *  assume; OpenAI `sk-`, Gemini `AIza`, Replicate `r8_`, fal `id:secret`). Everything else is accepted on length alone and tried on the first run. */
const FORMATS: Record<string, { test: (v: string) => boolean; hint: string }> = {
  comfy: { test: (v) => v.startsWith('comfyui-'), hint: 'Comfy Cloud keys start with "comfyui-".' },
  openai: { test: (v) => v.startsWith('sk-'), hint: 'OpenAI keys start with "sk-".' },
  google: { test: (v) => v.startsWith('AIza'), hint: 'Google Gemini API keys start with "AIza".' },
  replicate: { test: (v) => v.startsWith('r8_'), hint: 'Replicate tokens start with "r8_".' },
  fal: { test: (v) => /^[^:]+:[^:]+$/.test(v), hint: 'fal keys look like "id:secret" (two parts with a colon between them).' },
  hf: { test: (v) => v.startsWith('hf_'), hint: 'Hugging Face tokens start with "hf_".' },
};
export const keyFormatOf = (id: string, v: string | null | undefined): 'ok' | 'unexpected' | 'unchecked' | null => !v ? null : !FORMATS[id] ? 'unchecked' : FORMATS[id].test(v) ? 'ok' : 'unexpected';
/** Why a pasted key is refused, in plain words (the length rule, the spaces rule and the format rule are separate), or null when it is fine. */
export function keyProblem(id: string, raw: string): string | null {
  const v = raw.trim(); const name = P.find((x) => x.id === id)?.name ?? id;
  if (v.length < 8) return `That is too short to be a key (${v.length} character${v.length === 1 ? '' : 's'}; keys have at least 8). Paste the whole key.`;
  if (v.length > 512) return 'That is too long to be a key (the limit is 512 characters). Paste only the key.';
  if (/\s/.test(v)) return 'A key has no spaces or line breaks. Paste just the key itself.';
  if (!/^[\x21-\x7e]+$/.test(v)) return 'A key uses only plain letters, numbers and symbols. Check that you copied the key and nothing else.';
  const f = FORMATS[id]; if (f && !f.test(v)) return `That doesn't look like ${aKey(name.replace(/\s*\(.*\)\s*$/, ''))}. ${f.hint}`;
  return null;
}
const envVarInUse = (p: { envKey: string; envAliases: string[] }) => [p.envKey, ...p.envAliases].find((k) => !!process.env[k]?.trim()) ?? null;
function keyMeta(p: { id: string; envKey: string; envAliases: string[] }, configured: boolean) {
  if (p.id === 'local') return { keySetAt: null, keyHint: null, keySource: null, keyEnvVar: null, keyFormat: null }; // an address, not a key
  const ev = envVarInUse(p); const v = ev ? process.env[ev]!.trim() : null;
  if (!v) return { keySetAt: null, keyHint: null, keySource: configured ? 'mock' as const : null, keyEnvVar: null, keyFormat: null };
  const sv = (getKv<Record<string, SavedKey>>(KEYS_KV, {}) ?? {})[p.id]; const saved = !!sv && sv.fp === fpOf(v);
  return { keySetAt: saved ? sv.setAt : null, keyHint: keyHintOf(v), keySource: saved ? 'saved' as const : 'env' as const, keyEnvVar: ev, keyFormat: keyFormatOf(p.id, v) };
}
export const providerSettings = (): ProviderSetting[] => P.map((p) => { const real = !!p.envKey && [p.envKey, ...p.envAliases].some((k) => !!process.env[k]?.trim()); const conf = !!p.envKey && keyConfigured(p.envKey, p.envAliases);
  // Item 5: only local ComfyUI is badged open weights; 'Comfy API (partner nodes …)' is an API provider. Its key still runs open Comfy Cloud
  // graphs (cloud-*-wf, providerGroup 'Comfy Cloud' per route), so open-weights-only mode keeps it enabled.
  const ow = p.id === 'local'; const owOnlyOk = ow || p.id === 'comfy' || ACCOUNT_ONLY.has(p.id);
  return { ...p, configured: conf, mockedKey: conf && !real, openWeights: ow, openWeightsNote: OW_NOTE[p.id] ?? null, providerGroup: ow ? 'Local' as const : 'API' as const,
    disabledReason: openWeightsOnly() && !owOnlyOk ? 'open-weights-only mode: hosted APIs are off' : null, ...keyMeta(p, conf) }; });
/** BH9 (e): providers whose (paid) routes are enabled: a key is configured (real, or mockKeys on the mock backend) and the provider isn't
 *  switched off (open-weights-only). Empty → every enabled route is local / open weights → 'No credits, local' (localFree) is true. */
export const cloudProvidersEnabled = (): string[] => providerSettings().filter((p) => p.id !== 'local' && !ACCOUNT_ONLY.has(p.id) && p.configured && !p.disabledReason).map((p) => p.id);
export const localFreeNow = () => cloudProvidersEnabled().length === 0;
/** Where saved keys live: OPENHIGGSFIELD_ENV_FILE (filming mode: <scratch data>/.env.local), else <repo>/.env.local. */
export const ENV_LOCAL = env('ENV_FILE')?.trim() ? path.resolve(env('ENV_FILE')!.trim()) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env.local');
export const isLoopback = (host: string | undefined | null) => !!host && /^(127\.\d+\.\d+\.\d+|::1|localhost|::ffff:127\.0\.0\.1)$/.test(host);
/** Write/replace one KEY=value line. Value must be a single printable line. */
export function storeKey(id: string, value: string, file = ENV_LOCAL): { ok: true; envKey: string; keyFormat: 'ok' | 'unchecked' } | { error: string } {
  const p = P.find((x) => x.id === id && x.id !== 'local'); if (!p) return { error: `unknown provider ${id}` };
  value = value.trim(); { const bad = keyProblem(id, value); if (bad) return { error: bad }; }
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith(`${p.envKey}=`)) : [];
  while (lines.length && lines.at(-1) === '') lines.pop();
  lines.push(`${p.envKey}=${value}`); fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
  process.env[p.envKey] = value; invalidateTools();
  try { const all = getKv<Record<string, SavedKey>>(KEYS_KV, {}) ?? {}; all[p.id] = { setAt: new Date().toISOString(), fp: fpOf(value) }; setKv(KEYS_KV, all); } catch { /* status only */ }
  return { ok: true, envKey: p.envKey, keyFormat: keyFormatOf(p.id, value) === 'ok' ? 'ok' : 'unchecked' };
}
/** Remove a key saved from the browser (Settings → Connections → Remove): its KEY= line in the same file storeKey writes, the live env value
 *  and the saved-key record. A key that came from the server's own environment or settings file (keySource 'env') is not ours to remove. */
export function removeKey(id: string, file = ENV_LOCAL): { ok: true; envKey: string; stillConfigured: boolean; stillFromEnvVar: string | null } | { error: string; code: 'unknown_provider' | 'not_saved_here' } {
  const p = P.find((x) => x.id === id && x.id !== 'local'); if (!p) return { error: `unknown provider ${id}`, code: 'unknown_provider' };
  const meta = keyMeta(p, true); if (meta.keySource !== 'saved') return { error: 'This key wasn’t added here, so it can’t be removed here. Remove it from the server’s settings file.', code: 'not_saved_here' };
  if (fs.existsSync(file)) { const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith(`${p.envKey}=`)); while (lines.length && lines.at(-1) === '') lines.pop(); fs.writeFileSync(file, lines.length ? lines.join('\n') + '\n' : '', { mode: 0o600 }); }
  delete process.env[p.envKey]; invalidateTools();
  try { const all = getKv<Record<string, SavedKey>>(KEYS_KV, {}) ?? {}; delete all[p.id]; setKv(KEYS_KV, all); } catch { /* status only */ }
  // an alias variable (FAL_KEY, REPLICATE_API_TOKEN) in the server's environment keeps the provider connected: say which one, never its value
  const still = envVarInUse(p);
  return { ok: true, envKey: p.envKey, stillConfigured: !!still, stillFromEnvVar: still };
}
/** billing.ts: which provider account a route's key bills (envKey or alias → provider id), null when unknown. */
export const providerForEnvKey = (envKey: string | null | undefined): string | null => (!envKey ? null : P.find((p) => p.envKey === envKey || p.envAliases.includes(envKey))?.id ?? null);
/** billing.ts (connected accounts): the REAL key for a provider, server-side only (never returned, logged or sent anywhere but that provider's API). Mock keys don't count. */
export const realKeyFor = (id: string): string | null => { const p = P.find((x) => x.id === id && x.id !== 'local'); if (!p) return null; return [p.envKey, ...p.envAliases].map((k) => process.env[k]?.trim()).find((x) => !!x) ?? null; };
export const providerName = (id: string): string => P.find((p) => p.id === id)?.name ?? id;
