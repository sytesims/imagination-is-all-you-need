/**
 * Talking Video (2026-10-27): the long-speech plan and the script estimate for Lip Sync on InfiniteTalk (Wan 2.1) · Comfy Cloud.
 * Pure (no node:*), shared by the server (tools/voice/infiniteTalk.ts parse, comfy/infiniteTalkCloud.ts plan + price) and the web bar
 * (ui/video/barExtras/TalkingExtra.tsx shows the same plan before anything runs).
 *
 * Long speech (field split=1, up to 5 minutes): one InfiniteTalk job takes up to 60 s, so longer speech is cut into parts of at most 55 s at the
 * pauses nearest an even split (ffmpeg silencedetect, −35 dB, ≥ 0.25 s, on the server). Every part runs as its own job with the same photo, prompt
 * and seed; each part but the last also renders the next 0.24 s (6 frames at 25 fps), and the parts are joined with a 0.24 s video crossfade over
 * the ORIGINAL full speech (no audio crossfade, so the voice is never doubled or cut). The number of parts depends only on the length
 * (≤ 60 s: 1, else ceil(seconds / 50)), so the bar can show the plan and the quote before the upload; only the exact cut points move to the pauses.
 * Without split=1 nothing changes: over 60 s is refused as before.
 */
/** One job's limit (InfiniteTalk · Comfy Cloud, IT_MAX_SECONDS) and the long-speech limit. */
export const TV_SINGLE_MAX = 60;
export const TV_MAX_SECONDS = 300;
/** Parts: at most 55 s, aimed at an even split of about 50 s; a cut moves at most 5 s to reach a pause. */
export const TV_PART_MAX = 55; export const TV_PART_TARGET = 50; export const TV_SNAP = 5; export const TV_PART_MIN = 1;
/** The join: a 6-frame video crossfade at 25 fps. */
export const TV_FPS = 25; export const TV_FADE_FRAMES = 6; export const TV_FADE = TV_FADE_FRAMES / TV_FPS;
/** Pause detection (server, ffmpeg silencedetect). */
export const TV_SILENCE_DB = -35; export const TV_SILENCE_MIN = 0.25;
/** Script box: up to 2,000 characters, read at about 2.5 words a second (the voice tool's own estimate). */
export const TV_SCRIPT_MAX = 2000; export const TV_WORDS_PER_SECOND = 2.5;

export type TalkPart = { start: number; end: number };
const r2 = (n: number) => Math.round(n * 100) / 100;
const up2 = (n: number) => Math.ceil(n * 100 - 1e-6) / 100; const down2 = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

/** How many parts a length needs (≤ 60 s: one job, as before). */
export const talkPartCount = (total: number): number => (!(total > 0) ? 0 : total <= TV_SINGLE_MAX + 0.05 ? 1 : Math.ceil(r2(total) / TV_PART_TARGET));

/** The parts of a speech of `total` seconds, cut at the pause (`silences`: the middle of each pause, in seconds) nearest each even-split mark.
 *  No gaps, no overlaps, every part ≤ 55 s, together exactly [0, total]. With no pause near a mark, the cut lands on the mark itself. */
export function planTalkChunks(silences: number[], total: number): TalkPart[] {
  const T = r2(total); const n = talkPartCount(T); if (!n) return [];
  if (n === 1) return [{ start: 0, end: T }];
  const cuts: number[] = []; let prev = 0;
  for (let k = 1; k < n; k++) {
    const ideal = (k * T) / n;
    const lo = up2(Math.max(prev + TV_PART_MIN, T - TV_PART_MAX * (n - k), ideal - TV_SNAP));
    const hi = down2(Math.min(prev + TV_PART_MAX, T - TV_PART_MIN, ideal + TV_SNAP));
    const near = silences.filter((s) => Number.isFinite(s) && s >= lo && s <= hi).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
    const cut = Math.min(hi, Math.max(lo, r2(near ?? ideal))); cuts.push(cut); prev = cut;
  }
  const edges = [0, ...cuts, T]; return edges.slice(1).map((end, i) => ({ start: edges[i], end }));
}
/** The audio each part's job renders: its own span, plus the crossfade into the next part (the last part ends on the speech). */
export const talkPartSpans = (parts: TalkPart[], total: number): TalkPart[] =>
  parts.map((p, i) => ({ start: p.start, end: i < parts.length - 1 ? Math.min(r2(total), r2(p.end + TV_FADE)) : p.end }));

/** Over the long-speech limit (or a long speech without split): the plain refusal, else null. */
export function talkIssue(total: number, split: boolean): { code: 'too_long'; field: 'speech'; message: string } | null {
  if (!(total > TV_SINGLE_MAX + 0.05)) return null;
  if (!split) return null; // the single-job rule (InfiniteTalk's own 60 s line) answers this case
  if (total > TV_MAX_SECONDS + 0.05) return { code: 'too_long', field: 'speech', message: `Talking video takes speech up to ${TV_MAX_SECONDS / 60} minutes; yours is ${fmtTalkSeconds(total)}. Trim it, or make it in two videos` };
  return null;
}
/** Seconds as people read them: 42 s, 2:05. */
export const fmtTalkSeconds = (s: number): string => (s < 60 ? `${Math.round(s * 10) / 10} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
/** The plan in one line, shown before the run ("3 parts of about 40 s, joined with soft cuts at pauses"). */
export function talkSummary(parts: TalkPart[]): string {
  if (parts.length <= 1) return 'One part';
  const avg = parts.reduce((a, p) => a + p.end - p.start, 0) / parts.length;
  return `${parts.length} parts of about ${Math.round(avg)} s, joined with soft cuts at pauses`;
}
/** Words in a script. */
export const scriptWords = (text: string): number => (String(text ?? '').trim() ? String(text).trim().split(/\s+/).length : 0);
/** About how long a script takes to read (0 for an empty one). */
export const scriptSeconds = (text: string): number => { const w = scriptWords(text); return w ? Math.max(1, Math.round((w / TV_WORDS_PER_SECOND) * 10) / 10) : 0; };
/** truthy form values ("1", "true", "on", "yes"). */
export const isOn = (v: unknown) => v === true || /^(1|true|on|yes)$/i.test(String(v ?? ''));
