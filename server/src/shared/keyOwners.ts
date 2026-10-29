/**
 * Who owns a route's key, in user words, and which Settings → Connections card it belongs to. Isomorphic: the server names the owner in
 * quotes and notes (routing/select.ts keyOwner), the web turns that name into the card link ("Add a fal key" -> /settings#conn-fal).
 * Every owner name keyOwnerOf() can return has an anchor below (test/keys-flow.e2e.ts checks it against the server's own provider list).
 */
export const KEY_OWNER_CARD: Record<string, string> = {
  'Comfy Cloud': 'comfy', fal: 'fal', Replicate: 'replicate', 'Black Forest Labs': 'bfl', MiniMax: 'minimax', LTX: 'ltx',
  OpenAI: 'openai', 'Google Gemini API': 'google', BytePlus: 'byteplus', 'Alibaba Cloud Model Studio': 'dashscope', Luma: 'luma', 'Hugging Face': 'hf',
};
/** The user-facing owner of an env key name ('provider' when it is none of ours). */
export const keyOwnerOf = (envKey?: string | null): string => !envKey ? 'provider' : /COMFY/.test(envKey) ? 'Comfy Cloud' : /FAL/.test(envKey) ? 'fal' : /REPLICATE/.test(envKey) ? 'Replicate'
  : /BFL/.test(envKey) ? 'Black Forest Labs' : /MINIMAX/.test(envKey) ? 'MiniMax' : /LTX/.test(envKey) ? 'LTX' : /OPENAI/.test(envKey) ? 'OpenAI' : /GEMINI/.test(envKey) ? 'Google Gemini API'
  : /_ARK_/.test(envKey) ? 'BytePlus' : /DASHSCOPE/.test(envKey) ? 'Alibaba Cloud Model Studio' : /LUMA/.test(envKey) ? 'Luma' : /(^|_)HF_TOKEN$/.test(envKey) ? 'Hugging Face' : 'provider';
/** The Connections card id for an owner name (the generic 'provider' and unknown names open the Comfy Cloud card, the common key). */
export const cardOfOwner = (owner: string | null | undefined): string => KEY_OWNER_CARD[String(owner ?? '')] ?? 'comfy';
