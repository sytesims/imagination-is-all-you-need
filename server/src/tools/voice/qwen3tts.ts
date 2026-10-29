/**
 * Qwen3 TTS 1.7B (open weights, local, free; 2026-10-27). Replaces the paid direct Alibaba Model Studio entry (direct-qwen3-tts, retired:
 * shared/lifecycle.ts RETIRED_MODELS), so there is ONE "Qwen3 TTS" card and it runs on your own ComfyUI.
 *  - Model: Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice (Apache-2.0, https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice): 9 preset voices,
 *    10 languages, an optional natural-language style instruction ("instruct"). Only the CustomVoice checkpoint is wired: no cloning (Base) and
 *    no voice design (VoiceDesign), and the 1.7B size only.
 *  - Node: FB_Qwen3TTSCustomVoice from flybirdxx/ComfyUI-Qwen-TTS @374c2e0 (Apache-2.0); schema read from GET /object_info on 2026-10-27.
 *  - Graph: workflows/voice-qwen3tts-api.json (ours, scripts/build-voice-workflows.py): node 1 = the TTS node, node 2 = SaveAudio.
 * Isomorphic data + one pure patch function (comfy/plans.ts calls it), so tests can check the mapping without a server.
 */
export const QWEN3_TTS = 'comfy-qwen3tts';
export const QWEN3_TTS_WORKFLOW = 'voice-qwen3tts-api.json';
export const QWEN3_TTS_NODE = 'FB_Qwen3TTSCustomVoice';

/** The 9 preset voices: value = the node's speaker option, hint = the voice's native language (model card table), sampleUrl = a real clip of
 *  that voice made with this model on our own machine (2026-10-27; web/public/examples/voice/qwen3-tts/<id>.mp3, mono 64 kbps): the picker's ▶. */
const sample = (id: string) => `/examples/voice/qwen3-tts/${id}.mp3`;
export const QWEN3_TTS_SPEAKERS: { id: string; label: string; hint: string; sampleUrl: string }[] = [
  { id: 'Ryan', label: 'Ryan', hint: 'English' }, { id: 'Aiden', label: 'Aiden', hint: 'English' },
  { id: 'Vivian', label: 'Vivian', hint: 'Chinese' }, { id: 'Serena', label: 'Serena', hint: 'Chinese' }, { id: 'Uncle_fu', label: 'Uncle Fu', hint: 'Chinese' },
  { id: 'Dylan', label: 'Dylan', hint: 'Chinese (Beijing)' }, { id: 'Eric', label: 'Eric', hint: 'Chinese (Sichuan)' },
  { id: 'Ono_anna', label: 'Ono Anna', hint: 'Japanese' }, { id: 'Sohee', label: 'Sohee', hint: 'Korean' },
].map((v) => ({ ...v, sampleUrl: sample(v.id) }));
export const QWEN3_TTS_DEFAULT_SPEAKER = 'Ryan';
/** Spoken language: Auto (the model reads it from the script) + the 10 it speaks. value = our language code, node = the node's option. */
export const QWEN3_TTS_LANGUAGES: { value: string; label: string; node: string }[] = [
  { value: 'auto', label: 'Auto', node: 'Auto' }, { value: 'en', label: 'English', node: 'English' }, { value: 'zh', label: 'Chinese', node: 'Chinese' },
  { value: 'ja', label: 'Japanese', node: 'Japanese' }, { value: 'ko', label: 'Korean', node: 'Korean' }, { value: 'fr', label: 'French', node: 'French' },
  { value: 'de', label: 'German', node: 'German' }, { value: 'es', label: 'Spanish', node: 'Spanish' }, { value: 'pt', label: 'Portuguese', node: 'Portuguese' },
  { value: 'ru', label: 'Russian', node: 'Russian' }, { value: 'it', label: 'Italian', node: 'Italian' },
];
/** Longest script we send in one pass: the node stops at max_new_tokens (4096 at most, 12 tokens per second of speech ≈ 5 min); about 2,000
 *  characters is roughly 2 min of speech, which already takes ~20 min on an M1 Max (≈10 s per second of speech, measured 2026-10-27). */
export const QWEN3_TTS_MAX_CHARS = 2000;

const langNode = (code?: string | null) => QWEN3_TTS_LANGUAGES.find((l) => l.value === code)?.node ?? 'Auto';

/* Garbled takes (2026-10-27): with a long Style ("Deep, low, hushed nature documentary narrator. Calm, slow and full of quiet wonder, with long
 * pauses.", 116 characters) or "..." in the script, 5 of 6 local takes came out as babble; a short Style (~85 characters, Aiden) was clean.
 * The model card's CustomVoice examples use one short tone line ("Very happy.", 用特别愤怒的语气说) and the checkpoint's own sampling defaults
 * (generation_config.json: temperature 0.9, top_k 50, top_p 1.0, repetition_penalty 1.05, which the workflow keeps); it gives no length limit.
 * Asking for pauses / ellipses asks the 12 Hz codec model for long silent stretches, after which it loses its place in the text and babbles.
 * So what we send is reshaped (the user's own words, trimmed), and the script's ellipses become commas / full stops. */
/** Longest Style we send: the clean takes used ≤ ~90 characters; the official examples are one short sentence. */
export const QWEN3_TTS_INSTRUCT_MAX = 100;
const ELL = /(?:\.\s*){2,}\.?|…+|⋯+/; // "..", "...", ". . .", "…", "⋯"
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const PAUSE_ASK = /\b(pause[sd]?|pausing|silences?|silent gaps?|breaths?|breathing|beats?|dramatic stops?)\b/i;
/** The script as the model reads it: ellipses become a comma (mid-sentence) or a full stop (before a new sentence or at the end), repeated
 *  ! / ? collapse, whitespace is tidied. Words are never changed. */
export function qwen3TtsText(raw: string): string {
  const e = ELL.source;
  let t = String(raw ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
  t = t.replace(new RegExp(`^(?:\\s*(?:${e}))+\\s*`, 'u'), '') // leading "... It began"
    .replace(new RegExp(`\\s*(?:${e})+\\s*$`, 'u'), '.') // trailing "and then..."
    .replace(new RegExp(`\\s*(?:${e})+\\s*(?=["“‘'(]?[\\p{Lu}\\n])`, 'gu'), '. ') // "...Then" / "... Then": a new sentence
    .replace(new RegExp(`(.?)\\s*(?:${e})+\\s*`, 'gu'), (_m, p: string) => (CJK.test(p) ? `${p}，` : `${p}, `)) // "Wait... what" → "Wait, what" (其实……我 → 其实，我)
    .replace(/([!?])[!?]+/g, '$1').replace(/,\s*([,.!?;:])/g, '$1').replace(/([.!?;:])\s*,/g, '$1').replace(/\.{2,}/g, '.').replace(/ +\n/g, '\n').replace(/ {2,}/g, ' ').trim();
  return t || String(raw ?? '').trim();
}
/** The Style as the model reads it: one line, no quotes, no requests for pauses / silences / breaths (dropped clause by clause), ellipses
 *  tidied, then whole sentences (or clauses) up to QWEN3_TTS_INSTRUCT_MAX characters, ending in a full stop. Empty stays empty. */
export function qwen3TtsInstruct(raw?: string | null): string {
  let s = qwen3TtsText(String(raw ?? '').replace(/[\r\n\t]+/g, ' ').replace(/["“”«»]/g, '')).replace(/\s+/g, ' ').trim(); if (!s) return '';
  const sentences = s.split(/(?<=[.!?])\s+/).map((x) => x.replace(/[.!?]+$/, '').split(/\s*[,;]\s*/).map((c) => c.trim()).filter((c) => c && !PAUSE_ASK.test(c)).join(', ')).filter(Boolean);
  let out = '';
  for (const x of sentences) { const next = out ? `${out} ${x}.` : `${x}.`; if (next.length <= QWEN3_TTS_INSTRUCT_MAX) out = next; else break; }
  if (!out && sentences[0]) { // one long sentence: keep whole clauses, else whole words
    const cl = sentences[0].split(', '); let o = ''; for (const c of cl) { const n = o ? `${o}, ${c}` : c; if (n.length + 1 <= QWEN3_TTS_INSTRUCT_MAX) o = n; else break; }
    if (!o) o = sentences[0].slice(0, QWEN3_TTS_INSTRUCT_MAX - 1).replace(/\s+\S*$/, '').replace(/(\s+(and|or|but|also|with|of|the|a|an|to|in|like))+$/i, ''); out = `${o.replace(/[\s,;:]+$/, '')}.`; }
  return out === '.' ? '' : out;
}
/** Characters weighted by how long they take to say: a Chinese / Japanese / Korean character ≈ 2.5 Latin ones (≈4 per second vs ≈10–15). */
const spokenLength = (text: string) => { let n = 0; for (const ch of text) n += CJK.test(ch) ? 2.5 : 1; return n; };
/** max_new_tokens for a script: the codec makes 12.5 tokens per second of speech (Qwen3-TTS-Tokenizer-12Hz); a slow read is ~10 characters a
 *  second (CJK weighted above), +50% headroom for pauses at punctuation, in the node's 512–4096 range (step 256). Never so tight that a slow
 *  read is cut off; a model that runs past the script stops here instead of babbling for minutes. */
export const qwen3TtsMaxTokens = (text: string) => { const sec = Math.max(2, spokenLength(text) / 10); const t = Math.ceil((sec * 12.5 * 1.5) / 256) * 256; return Math.min(4096, Math.max(512, t)); };

export interface Qwen3TtsInput { text: string; seed: number; speaker?: string | null; language?: string | null; instruct?: string | null }
/** Fills workflows/voice-qwen3tts-api.json in place: script (ellipses tidied), voice, language, Style (reshaped, above), seed and a token
 *  budget that fits the script. Sampling stays at the checkpoint's own defaults (the workflow file). */
export function patchQwen3Tts(g: Record<string, any>, i: Qwen3TtsInput) {
  const speaker = QWEN3_TTS_SPEAKERS.some((s) => s.id === i.speaker) ? i.speaker! : QWEN3_TTS_DEFAULT_SPEAKER;
  const instruct = qwen3TtsInstruct(i.instruct); const text = qwen3TtsText(i.text);
  Object.assign(g['1'].inputs, { text, speaker, language: langNode(i.language), seed: i.seed, instruct, max_new_tokens: qwen3TtsMaxTokens(text) });
  return { graph: g, output: '2', expect: { prompt: i.text, seed: i.seed, speaker, language: langNode(i.language), ...(instruct ? { instruct } : {}) } };
}
