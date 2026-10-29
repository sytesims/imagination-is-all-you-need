/**
 * Keyframes (MiniMax H3 Keyframes · Comfy Cloud, 2026-10-27): the rules the bar, the job parser and the plan share (comfy/h3KeyframesCloud.ts).
 * Isomorphic: no server imports, so the Generate Video bar uses the same times, limits and checks as the server.
 */
export const H3KF_MODE = 'keyframes';
/** 2–5 frames: the template's four, plus one cloned guide block. */
export const H3KF_MIN_FRAMES = 2; export const H3KF_MAX_FRAMES = 5;
/** 5–15 s: H3's trained range (MiniMaxH3ReferenceToVideo length tooltip: "trained range is ~124–362" frames) and the template's "Up to 15s". */
export const H3KF_SECONDS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const H3KF_RESOLUTIONS = ['768p', '480p'] as const;
/** The template's own sizes (its Video Settings note): 0.4 MP = 864 × 480, 0.98 MP = 1344 × 768 ("official 768p"), multiple 32. */
export const H3KF_MP: Record<string, number> = { '480p': 0.4, '768p': 0.98, '720p': 0.98 };
export const H3KF_FPS = 24;
/** The UI's time step and the smallest gap between two frames (seconds). */
export const H3KF_STEP = 0.5;
/** H3's frame count for a length (the template's ComfyMathExpression 131: max(5, round(s × 24)) up to the next 17k + 5). */
export const h3kfLength = (seconds: number) => { const f = Math.max(5, Math.round(seconds * H3KF_FPS)); return f + ((5 - (f % 17)) % 17 + 17) % 17; };
/** A frame's index in the clip: round(s × 24), the template's expression, kept inside the generated length. */
export const h3kfFrameIndex = (t: number, seconds: number) => Math.min(h3kfLength(seconds) - 1, Math.max(0, Math.round(t * H3KF_FPS)));
/** Evenly spread times for n frames over a clip (first at 0, last at the end), on the UI's 0.5 s step. Shared by the bar and the API default. */
export function spreadTimes(n: number, seconds: number): number[] {
  if (n <= 1) return n ? [0] : []; const out = Array.from({ length: n }, (_, k) => Math.round((k * seconds) / (n - 1) / H3KF_STEP) * H3KF_STEP);
  for (let k = 1; k < n; k++) if (out[k] <= out[k - 1]) out[k] = out[k - 1] + H3KF_STEP; return out;
}
/** Why these times don't work (null = fine): first at 0, each later one after the one before and inside the clip, frames at different indices. */
export function keyframeTimesIssue(times: number[], seconds: number): string | null {
  if (!times.length || times.some((t) => !Number.isFinite(t))) return 'Give every frame a time in seconds';
  if (times[0] !== 0) return 'The first frame is the start of the clip (0 s)';
  for (let k = 1; k < times.length; k++) {
    if (times[k] <= times[k - 1]) return `Frame ${k + 1} has to come after frame ${k}`;
    if (times[k] > seconds) return `Frame ${k + 1} is at ${times[k]} s, after the end of the ${seconds} s clip`;
    if (h3kfFrameIndex(times[k], seconds) === h3kfFrameIndex(times[k - 1], seconds)) return `Frames ${k} and ${k + 1} are too close together`; }
  return null;
}
/** Parse the keyframeTimes field (JSON array of seconds, or "0,1.5,3"). */
export function parseKeyframeTimes(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map(Number); if (v == null || v === '') return null; const s = String(v).trim();
  try { const x = JSON.parse(s); if (Array.isArray(x)) return x.map(Number); } catch { /* a comma list */ }
  return s.split(',').map((x) => Number(x.trim()));
}
/** The job's mode, from input.mode or its types (an array, a JSON array string or a plain string: quote and submit say it either way). */
export function jobModeOf(i: Record<string, any> | null | undefined): string {
  if (i?.mode) return String(i.mode); let t: any = i?.types;
  if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = t.split(','); } }
  return Array.isArray(t) && t.length ? String(t[0]).trim() : typeof t === 'string' ? t.trim() : '';
}
