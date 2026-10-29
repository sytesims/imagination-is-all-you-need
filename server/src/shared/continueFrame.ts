/**
 * "Continue from last frame" (2026-10-26): a video result's last frame goes into Video → Generate's start-image slot (videoFrame.ts on the server).
 * Shared by the server (GET /api/jobs/:id/prefill?t=last&cont=1) and the web (the result viewer, Generate's hand-off).
 */
/** Free local first: the model a continue suggests when the picked one can't take a start image. */
export const CONTINUE_MODEL = 'comfy-ltx25-video';
/** A timed beat paragraph ("0–7s: …", "[Shot 2] …", "At 00:04.000, …"): what happened in the source clip, dropped from a continue. */
const BEAT = /^(\d+(\.\d+)?\s*[–—-]\s*\d+(\.\d+)?\s*s(ec(onds?)?)?\b|\[shot\s*\d+\]|at\s+\d{1,2}:\d{2})/i;
/** The empty beat a continue leaves to write ("0–15s: "); the web puts the caret right after it. */
export const continueBeat = (sec?: unknown) => `0–${Number(sec) > 0 ? Number(sec) : 15}s: `;
/**
 * The source prompt as a "continue" prompt ('' stays ''). A timed prompt (style, cast, beats, closing; the video-pacing skill's shape) keeps the
 * style, cast and closing lines word for word, so the cast stays the same, and swaps the source's beats for one empty beat to write (2026-10-27:
 * repeating the beats made the next clip act the same scene again). The style line's "15 seconds" follows `sec`. An untimed prompt becomes
 * "Continue the shot: …" (an already-continued prompt is not stacked).
 */
export function continuePrompt(src: unknown, sec?: unknown): string {
  const p = String(src ?? '').replace(/\r\n?/g, '\n').trim().replace(/^continue (the shot|from the last frame)[:.]\s*/i, '');
  if (!p) return '';
  const paras = p.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const beats = paras.map((x, i) => (BEAT.test(x) ? i : -1)).filter((i) => i >= 0);
  if (!beats.length) return `Continue the shot: ${p}`;
  const s = Number(sec) > 0 ? Number(sec) : null;
  const head = paras.slice(0, beats[0]).map((x, i) => (i === 0 && s ? x.replace(/\b\d+(\.\d+)?\s*(seconds|secs?)\b/i, `${s} seconds`) : x));
  return [...head, continueBeat(sec), ...paras.slice(beats[beats.length - 1] + 1)].join('\n\n');
}
/**
 * Which model runs the continue: the current one when it takes a start image (i2v), else CONTINUE_MODEL when offered, else the first that does.
 * `modes` = the tool's providerModes; a model absent from it runs every mode.
 */
export function continueModel(current: string | null | undefined, providers: string[], modes?: Record<string, string[]> | null): string | null {
  const i2v = (id: string) => providers.includes(id) && (!modes || !modes[id] || modes[id].includes('i2v'));
  if (current && i2v(current)) return current;
  if (i2v(CONTINUE_MODEL)) return CONTINUE_MODEL;
  return providers.find(i2v) ?? null;
}
