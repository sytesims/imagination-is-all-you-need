/**
 * Prompt enhance (POST /api/prompt/enhance). Rules-based template by default; optional local LLM hook:
 * set OPENHIGGSFIELD_ENHANCE_LLM_URL to an OpenAI-compatible /v1/chat/completions endpoint (e.g. llama.cpp / Ollama on localhost)
 * and OPENHIGGSFIELD_ENHANCE_LLM_MODEL. Any LLM failure falls back to the rules result. No hosted calls by default.
 */
import { env } from '../env.js';
import { promptGrammarOf } from '../shared/promptGrammar.js';
import { enhancerGuide } from '../shared/promptTips.js';
import { promptCap } from '../shared/promptRefs.js';
export type EnhanceKind = 'image' | 'video' | 'audio';
const ADD: Record<Exclude<EnhanceKind, 'image'>, string[]> = {
  video: ['cinematic', 'smooth natural motion', 'consistent subject identity', 'motivated lighting', 'shallow depth of field'],
  audio: ['clean mix', 'well-balanced levels', 'clear dynamics'],
};
/* Image words follow the prompt (QA #5): skin texture only when it is about people, a light only when the prompt names none
 * (light, a time of day or a light source), product detail for products, nothing about skin for landscapes or things. */
const PERSON = /\b(person|people|persons|man|men|woman|women|girl|girls|boy|boys|child|children|kid|kids|baby|toddler|teen|teenager|portrait|portraits|face|faces|headshot|selfie|model|models|character|characters|lady|guy|couple|family|bride|groom|actor|actress|athlete|dancer|human|humans|he|she|him|her|his|grandma|grandpa|mother|father|mom|dad|businessman|businesswoman|influencer|presenter)\b/i;
const LIGHT = /\b(light|lights|lighting|lit|backlit|back-lit|sunlight|sunlit|sunny|sun|sunset|sunrise|golden hour|blue hour|night|nighttime|midnight|neon|dawn|dusk|noon|midday|twilight|evening|moon|moonlight|moonlit|candle|candles|candlelight|candlelit|flash|rim|glow|glowing|spotlight|lamp|lamps|lantern|lanterns|firelight|torch|overcast|shadow|shadows|chiaroscuro|silhouette|silhouetted|starlight|starry|aurora|softbox)\b/i;
const PRODUCT = /\b(product|products|packshot|pack shot|bottle|bottles|perfume|fragrance|cosmetic|cosmetics|lipstick|skincare|serum|jar|packaging|sneaker|sneakers|shoe|shoes|watch|wristwatch|handbag|headphones|earbuds|smartphone|laptop|gadget|mug|jewellery|jewelry|necklace|e-commerce|ecommerce|catalogue)\b/i;
/** The image words for this prompt, each only when the prompt doesn't already cover it. */
function imageWords(text: string): string[] {
  const l = text.toLowerCase(); const out: string[] = [];
  const person = PERSON.test(text); const product = !person && PRODUCT.test(text);
  if (!/\bdetail/.test(l)) out.push(product ? 'crisp product detail' : 'highly detailed');
  if (person && !/\bskin\b/.test(l)) out.push('natural skin texture');
  if (!LIGHT.test(text)) out.push(product ? 'soft even studio light' : 'soft directional light');
  if (!/\b(sharp|focus|blur|blurred|blurry|bokeh)\b/.test(l)) out.push('sharp focus');
  if (!/\bcomposition\b/.test(l)) out.push('balanced composition');
  return out;
}
const SUBJECTLESS = /^\s*(a|an|the)?\s*(photo|picture|image|video|clip)\s*$/i;
/** Default cap of an enhanced prompt (no model given); a model's own cap wins (shared/promptGrammar.ts). */
const DEFAULT_CAP = 2500;
/** The model the prompt is for (prompt grammar step 2): its name and its own cap; null = no model given. */
const forModel = (model?: string | null) => { const e = promptGrammarOf(model); return e ? { key: e.key, name: e.name, cap: promptCap(e.key) } : null; };
export function enhanceRules(prompt: string, kind: EnhanceKind = 'image', style?: string, model?: string | null): { prompt: string; added: string[]; forModel?: string; note?: string } {
  const p = prompt.trim().replace(/\s+/g, ' ').replace(/[.,;]+$/, '');
  const base = SUBJECTLESS.test(p) || !p ? 'a striking subject in a well-composed scene' : p;
  const lower = base.toLowerCase();
  // @mentions and #tags stay as written (words are only appended) and never count as a person or a light: who @image1 is isn't known.
  // The runner turns @image1 into the model's own token (shared/promptRefs.ts), so the enhancer never writes tokens itself.
  const plain = base.replace(/[@#][\w-]+/g, ' ');
  const m = forModel(model); const cap = m?.cap ?? DEFAULT_CAP;
  let added = kind === 'image' ? imageWords(`${plain} ${style ?? ''}`) : ADD[kind].filter((w) => !lower.includes(w.split(' ')[0]));
  const head = [base[0].toUpperCase() + base.slice(1), style].filter(Boolean).join(', ');
  // never past the model's cap and never cut: drop added words from the end until it fits; a prompt already over the cap is left as it is
  while (added.length && [head, ...added].join(', ').length > cap) added = added.slice(0, -1);
  const out = [head, ...added].join(', ');
  const note = head.length > cap ? `${m?.name ?? 'This model'} takes up to ${cap.toLocaleString('en-US')} characters; your prompt is already longer, so nothing was added` : undefined;
  return { prompt: note ? prompt : out, added: note ? [] : added, ...(m ? { forModel: m.name } : {}), ...(note ? { note } : {}) };
}
export async function enhancePrompt(prompt: string, kind: EnhanceKind = 'image', style?: string, model?: string | null) {
  const rules = enhanceRules(prompt, kind, style, model); const m = forModel(model); const cap = m?.cap ?? DEFAULT_CAP; const guide = enhancerGuide(model);
  const url = env('ENHANCE_LLM_URL');
  if (!url) return { ...rules, source: 'rules' as const };
  try {
    const ctl = AbortSignal.timeout(8000);
    const r = await fetch(url, { method: 'POST', signal: ctl, headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      model: env('ENHANCE_LLM_MODEL') || 'local', temperature: 0.4, max_tokens: 300,
      messages: [{ role: 'system', content: `Rewrite the user's ${kind} generation prompt to be vivid and specific. Keep every subject, @mention and #camera tag unchanged (the app turns @image1 into the model's own reference syntax). ${guide ? `${guide} ` : ''}Reply with the prompt only, under ${cap} characters.` }, { role: 'user', content: prompt }] }) });
    const j: any = await r.json(); const text = String(j?.choices?.[0]?.message?.content ?? '').trim();
    if (!r.ok || !text) throw new Error('empty');
    if (text.length > cap) throw new Error('too long'); // never cut: an over-long rewrite falls back to the rules result
    return { prompt: text, added: [], source: 'llm' as const, ...(m ? { forModel: m.name } : {}) };
  } catch { return { ...rules, source: 'rules' as const, llmError: 'Local LLM unavailable; used the rules template.' }; }
}
