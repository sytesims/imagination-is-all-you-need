/**
 * Server-side translation step for Voice Studio "Translate" (Whisper transcript → target language → TTS).
 * Default backend: local NLLB-200 distilled 600M on CPU (voiceRunner.ts, CC BY-NC 4.0). Option: any LibreTranslate-compatible HTTP API you run yourself (e.g. LibreTranslate, or an NLLB-200 wrapper exposing
 * POST /translate {q, source, target} → {translatedText}). Set OPENHIGGSFIELD_TRANSLATE_URL (and optional OPENHIGGSFIELD_TRANSLATE_KEY).
 * Nothing is sent to a third party by default.
 */
import { env } from './env.js';
import { translateLocal } from './voiceRunner.js';
export const translateUrl = () => env('TRANSLATE_URL') || '';
export async function translateText(text: string, target: string, source = 'en'): Promise<string> {
  const t = text.trim(); if (!t) throw new Error('No speech was found in the clip to translate');
  const url = translateUrl();
  if (!url) { if (source === target) return t; return translateLocal(t, source, target); }
  const r = await fetch(url.replace(/\/$/, '') + '/translate', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: t, source: 'auto', target, format: 'text', ...(env('TRANSLATE_KEY') ? { api_key: env('TRANSLATE_KEY') } : {}) }) });
  if (!r.ok) throw new Error(`translation backend → ${r.status}`);
  const j: any = await r.json(); const out = j.translatedText ?? j.translation ?? j.text;
  if (typeof out !== 'string' || !out.trim()) throw new Error('translation backend returned no text');
  return out;
}
/** Translate a video, line by line: many lines in one call, line breaks kept (NLLB translates each line on its own: voice_runner.py). A backend that
 *  merges lines (some LibreTranslate setups) gets one call per line instead, so every line keeps its own timing. */
export async function translateLines(lines: string[], target: string, source = 'en'): Promise<string[]> {
  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()); if (!clean.length || clean.some((l) => !l)) throw new Error('No speech was found in the clip to translate');
  const out = (await translateText(clean.join('\n'), target, source)).split('\n').map((l) => l.trim()).filter(Boolean);
  if (out.length === clean.length) return out;
  const each: string[] = []; for (const l of clean) each.push((await translateText(l, target, source)).replace(/\s+/g, ' ').trim()); return each;
}
