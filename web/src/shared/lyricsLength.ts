/** Lyrics helpers for the Audio prompt (pure, no DOM: server/test/audio-lyrics.test.ts runs them).
 *
 *  Auto length (2026-10-24): a song long enough to sing the lyrics, from one simple rule:
 *    about 5 s per sung line + 5 s per section tag ([Verse], [Chorus]…, the gap or fill between sections) + 10 s of intro and outro,
 *    then the shortest length the model really allows that is at least that long (the longest one when none is; the quote and the job
 *    use that same length, so quote = charge).
 *  With no sung line there is nothing to fit, so Auto takes the allowed length closest to 30 s (a short track).
 *  A fixed length is "too short" when it is under three quarters of the estimate: a gentle hint, never a block. */
export const SEC_PER_LINE = 5, SEC_PER_SECTION = 5, SEC_INTRO_OUTRO = 10;
export const SECTION_RE = /^\s*\[[^\]\n]{1,40}\]\s*$/;
/** Section tags on a line of their own, for the editor's highlight layer. */
export const SECTION_TAG_HL = /^[ \t]*\[[^\]\n]{1,40}\][ \t]*$/gm;

export interface LyricsStats { lines: number; sections: number }
/** Sung lines (non-empty lines that aren't a section tag) and section tags. */
export function lyricsStats(text: string): LyricsStats {
  let lines = 0, sections = 0;
  for (const l of String(text ?? '').split(/\r?\n/)) { if (!l.trim()) continue; if (SECTION_RE.test(l)) sections++; else lines++; }
  return { lines, sections };
}
/** Seconds the lyrics need (null with no sung line). */
export function lyricsSeconds(s: LyricsStats): number | null {
  return s.lines > 0 ? SEC_INTRO_OUTRO + SEC_PER_LINE * s.lines + SEC_PER_SECTION * s.sections : null;
}
/** The Auto length among the model's allowed lengths. */
export function autoLength(text: string, allowed: number[]): { seconds: number; need: number | null; lines: number; cut: boolean } {
  const xs = [...new Set(allowed.filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => a - b); const st = lyricsStats(text); const need = lyricsSeconds(st);
  if (!xs.length) return { seconds: need ?? 30, need, lines: st.lines, cut: false };
  if (need == null) return { seconds: xs.reduce((a, b) => Math.abs(b - 30) < Math.abs(a - 30) ? b : a), need, lines: st.lines, cut: false };
  const fit = xs.find(n => n >= need); return { seconds: fit ?? xs[xs.length - 1], need, lines: st.lines, cut: fit == null };
}
/** The lyrics' role for a workflow's recipe (shared/audioWorkflows.ts `lyrics`) and a model: whether the Lyrics tab shows (the model reads
 *  lyrics), whether they're required (YuE2, Cover), whether Instrumental is offered and on, whether lyrics are sent, and what's missing
 *  ("Add lyrics" when required and no line is sung: a tag alone isn't a line). */
export interface LyricsRecipe { mode: 'required' | 'optional' | 'hidden'; requiredFor?: string[]; models?: string[]; instrumental?: string[] }
export function lyricsPlan(r: LyricsRecipe, provider: string, text: string, instrumentalPref: boolean) {
  const models = r.models ?? []; const st = lyricsStats(text);
  const on = r.mode !== 'hidden' && (r.mode === 'required' || !models.length || models.includes(provider));
  const required = on && (r.mode === 'required' || (r.requiredFor ?? []).includes(provider));
  const instAvail = on && !required && (r.instrumental ?? []).includes(provider); const instrumental = instAvail && instrumentalPref;
  const used = on && !instrumental;
  return { on, required, instAvail, instrumental, used, sends: used && !!String(text ?? '').trim(), lines: st.lines, sections: st.sections, missing: required && st.lines === 0 };
}
/** A fixed length clearly too short for the lyrics. */
export const tooShortFor = (seconds: number, need: number | null) => need != null && seconds < need * 0.75;
/** "45 s", "1:10" */
export function lengthText(sec: number): string { const s = Math.round(sec); return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
