/**
 * Create bar (design audit 2026-10-23): the pure rules behind a stable bar and the preset flow, shared by ImageCanvas and the tests.
 * Dependency-free on purpose (server/test/create-bar.test.ts imports it under tsx).
 */
import { fillPresetPrompt } from '../../../server/src/shared/presetLink';

/** The feed's bottom padding (--ic-dock-h) is the bar's height. The bar's height changes only with its prompt (2 to 8 lines, see
 *  promptHeight), so the padding simply follows the measure. A hidden pane (no layout, 0px) is never taken. */
export function dockHeightNext(cur: number, measured: number): number {
  return measured > 0 ? measured : cur;
}

/** The bar's prompt (Image, Video, Audio and Audio's lyrics box): two 20px lines when empty or short, growing one line at a time with
 *  its text up to eight lines, then it scrolls inside. A short window lowers the cap (the field's CSS max-height), never below four lines (twice the minimum). */
export const PROMPT_LINE = 20, PROMPT_MIN = 2 * PROMPT_LINE, PROMPT_MAX = 8 * PROMPT_LINE;
/** The prompt's height for its content height `full` (px): clamped to [min, cap]; `scroll` when the text is taller than the cap.
 *  `cssMax` is the field's computed max-height (a breakpoint can lower the cap, but not under four lines). */
export function promptHeight(full: number, cssMax = Infinity, min = PROMPT_MIN, max = PROMPT_MAX): { h: number; scroll: boolean } {
  const cap = Math.max(Math.min(min * 2, max), Math.min(max, Number.isFinite(cssMax) && cssMax > 0 ? cssMax : max));
  const h = Math.max(min, Math.min(Math.ceil(full), cap)); return { h, scroll: full > cap + 1 };
}

/** Attached photos inline at the start of the prompt line: up to `room` tiles. More than that shows the first room−1 and a "+N" tile. */
export function thumbsShown(total: number, room = 4): { show: number; more: number } {
  const n = Math.max(0, Math.floor(total)); if (n <= room) return { show: n, more: 0 };
  const show = Math.max(1, room - 1); return { show, more: n - show };
}

/** The model chip's download ring: a queued or running run of this model that is fetching its files first.
 *  pct = real progress when the job reports bytes, else null (an indeterminate ring). null = no ring. */
export function modelDownload(jobs: { status: string; provider?: string | null; stage?: string | null; stageDetail?: any; input?: any }[], providerId: string | null | undefined): { pct: number | null } | null {
  if (!providerId) return null;
  for (const j of jobs) { if (j.provider !== providerId || (j.status !== 'running' && j.status !== 'queued')) continue;
    const st = j.stageDetail?.stage ?? j.stage; const d = j.stageDetail ?? {};
    if (st === 'downloading_model') { const t = Number(d.bytesTotal) || 0; const b = Number(d.bytesDone) || 0; return { pct: t > 0 ? Math.min(100, Math.floor((b / t) * 100)) : null }; }
    if (st !== 'loading_model' && String(j.input?.downloadWeights ?? '') === '1' && j.status === 'queued') return { pct: null }; }
  return null;
}

/** Generate's second line once you chose to download first: "Free · downloads 12 GB first". */
export const intentLine = (size: string): string => `Free · downloads ${size.trim() || 'the files'} first`;

/** A preset's prompt split around its subject: the text before it, the sample subject (the field's placeholder), the text after.
 *  A touch-up preset ("…, deep soft shadows, {prompt}": no sample) keeps its template in `details`: what you type is added to the end. */
export type SubjectParts = { before: string; hint: string; after: string; details?: string };
export function subjectParts(prompt: string, sel: [number, number] | null | undefined, template?: string): SubjectParts | null {
  /* a template that is only the placeholder ("{subject}"): the whole prompt is yours, so the bar keeps its normal prompt box (the sample selected) */
  if (sel && sel[1] > sel[0] && sel[1] <= prompt.length) return !prompt.slice(0, sel[0]).trim() && !prompt.slice(sel[1]).trim() ? null : { before: prompt.slice(0, sel[0]), hint: prompt.slice(sel[0], sel[1]), after: prompt.slice(sel[1]) };
  if (!sel && template && /\{(?:subject|prompt)\}/.test(template) && fillPresetPrompt(template, '') === prompt) return { before: prompt, hint: '', after: '', details: template };
  return null;
}
/** The prompt the run sends: the subject you typed, or the sample when the field is empty (a touch-up: the template with your details, or without). */
export const fillSubject = (s: SubjectParts, subject: string): string => s.details != null ? fillPresetPrompt(s.details, subject) : `${s.before}${subject.trim() || s.hint}${s.after}`;
/** The template still shows as the preset wrote it (only the subject field may differ): the prompt is still "the preset's". */
export const presetPromptUntouched = (prompt: string, s: SubjectParts | null, subject: string, presetPrompt: string): boolean =>
  prompt === presetPrompt || (!!s && prompt === fillSubject(s, subject));
/** The prompt after the preset goes (✕, or switching workflow): an untouched template goes, but what you wrote stays —
 *  the subject you typed becomes the prompt, and a prompt you edited in full is kept as it is. */
export function promptAfterPresetClear(prompt: string, s: SubjectParts | null, subject: string, presetPrompt: string): string {
  if (!presetPromptUntouched(prompt, s, subject, presetPrompt)) return prompt;
  return subject.trim();
}

/** "Look · Neon night · 16:9": what a plain-Create preset changed that the chip row may not show (folded chips). Only parts still in effect. */
export function lookParts(vals: Record<string, string>, now: { style: string; styleLabel?: string; aspect: string }): string[] {
  const out: string[] = [];
  if (vals.style && now.style === vals.style) out.push(now.styleLabel || vals.style);
  if (vals.aspect && now.aspect === vals.aspect) out.push(vals.aspect);
  return out;
}
