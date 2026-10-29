/** Render time vs queue wait for a finished job (one source of truth for web + server; web re-exports it from shared/jobTiming.ts).
 *  - renderStartedAt (jobs.ts): when ComfyUI (local or Comfy Cloud) actually began executing the job, out of every queue.
 *    Render time = finishedAt - renderStartedAt; queue wait = renderStartedAt - createdAt (our own queue + ComfyUI's queue).
 *  - No renderStartedAt (hosted APIs that don't expose the split, mock runs, jobs made before the field existed): render time is
 *    today's total (finishedAt - startedAt, the dispatcher pick-up) and there is no queue wait.
 *  queueMs is only reported when it is meaningful (> QUEUE_SHOWN_MS), so a 300 ms hop is never shown as "waited in queue". */
export const QUEUE_SHOWN_MS = 5000;
export interface JobTimingInput { createdAt?: number | null; startedAt?: number | null; renderStartedAt?: number | null; finishedAt?: number | null }
export interface JobTiming { renderMs: number | null; queueMs: number | null; split: boolean }
export function jobTiming(j: JobTimingInput | null | undefined): JobTiming {
  const n = (v: unknown) => { const x = Number(v ?? 0); return x > 0 && isFinite(x) ? x : 0; };
  const created = n(j?.createdAt), started = n(j?.startedAt), render = n(j?.renderStartedAt), done = n(j?.finishedAt);
  if (render && done > render) {
    const q = created && render > created ? render - created : 0;
    return { renderMs: done - render, queueMs: q > QUEUE_SHOWN_MS ? q : null, split: true };
  }
  return { renderMs: started && done > started ? done - started : null, queueMs: null, split: false };
}
/** "8.4 s", "42 s", "3 min 5 s", "1 h 4 min". '' for no value. */
export function durationText(ms: number | null | undefined): string {
  if (!(Number(ms) > 0)) return ''; const s = Number(ms) / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const t = Math.round(s); if (t < 3600) return `${Math.floor(t / 60)} min${t % 60 ? ` ${t % 60} s` : ''}`;
  const m = Math.round(t / 60); return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
