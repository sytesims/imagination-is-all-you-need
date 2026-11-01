/**
 * The one list of provider accounts and the environment variables that hold their keys (names only, never values). Pure: no side effects, so the
 * doctor (which runs with the app stopped) and env.ts (filming mode, which ignores keys from the launching shell) both read it. The Settings cards
 * (routing/settings.ts) must use the same envKey/envAliases: server/test/provider-keys.test.ts checks they agree.
 */
export interface ProviderAccount { id: string; name: string; vars: string[] }
export const PROVIDER_ACCOUNTS: ProviderAccount[] = [
  { id: 'comfy', name: 'Comfy Cloud', vars: ['COMFY_API_KEY'] },
  { id: 'hf', name: 'Hugging Face', vars: ['OPENHIGGSFIELD_HF_TOKEN', 'HF_TOKEN'] },
  /** Downloads from civitai.com (hardware/downloads.ts); not in Settings, set it in the env file. */
  { id: 'civitai', name: 'Civitai', vars: ['CIVITAI_TOKEN'] },
  { id: 'fal', name: 'fal', vars: ['OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY'] },
  { id: 'replicate', name: 'Replicate', vars: ['OPENHIGGSFIELD_REPLICATE_API_TOKEN', 'REPLICATE_API_TOKEN'] },
  { id: 'openai', name: 'OpenAI', vars: ['OPENHIGGSFIELD_OPENAI_API_KEY'] },
  { id: 'google', name: 'Google Gemini API', vars: ['OPENHIGGSFIELD_GEMINI_API_KEY'] },
  { id: 'bfl', name: 'Black Forest Labs', vars: ['OPENHIGGSFIELD_BFL_API_KEY'] },
  { id: 'minimax', name: 'MiniMax', vars: ['OPENHIGGSFIELD_MINIMAX_API_KEY'] },
  { id: 'ltx', name: 'LTX', vars: ['OPENHIGGSFIELD_LTX_API_KEY'] },
  { id: 'byteplus', name: 'BytePlus ModelArk', vars: ['OPENHIGGSFIELD_ARK_API_KEY'] },
  { id: 'dashscope', name: 'Alibaba Model Studio', vars: ['OPENHIGGSFIELD_DASHSCOPE_API_KEY'] },
  { id: 'luma', name: 'Luma AI', vars: ['OPENHIGGSFIELD_LUMA_API_KEY'] },
];
/** Every variable that holds a key or token: each account's names, the legacy OPENJUTSU_ alias of every OPENHIGGSFIELD_ one, and the token of a
 *  self-hosted Comfy runner (COMFY_RUNNER_TOKEN). */
export const PROVIDER_KEY_VARS: string[] = [...new Set([
  ...PROVIDER_ACCOUNTS.flatMap((a) => a.vars.flatMap((v) => (v.startsWith('OPENHIGGSFIELD_') ? [v, v.replace(/^OPENHIGGSFIELD_/, 'OPENJUTSU_')] : [v]))),
  'COMFY_RUNNER_TOKEN',
])];
