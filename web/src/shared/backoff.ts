/**
 * Polling with backoff: 2 s, ×1.5 per unchanged poll up to 10 s, ±15 % jitter; resets to 2 s whenever the
 * signature returned by `tick` changes. `tick` returns a signature string, or null to stop polling.
 */
export const POLL_MIN_MS = 2000, POLL_MAX_MS = 10_000, POLL_GROWTH = 1.5;
/** `pauseHidden`: no ticks while the tab is hidden; polling resumes (with a tick at once) when it is shown again. */
export function pollWithBackoff(tick: () => Promise<string | null>, opts: { minMs?: number; maxMs?: number; pauseHidden?: boolean } = {}): () => void {
  const min = opts.minMs ?? POLL_MIN_MS, max = opts.maxMs ?? POLL_MAX_MS;
  let delay = min, last: string | null | undefined, stopped = false, t: ReturnType<typeof setTimeout> | undefined; let onVis: (() => void) | null = null;
  const loop = async () => {
    if (stopped) return;
    if (opts.pauseHidden && typeof document !== 'undefined' && document.hidden) { if (!onVis) { onVis = () => { if (document.hidden) return; document.removeEventListener('visibilitychange', onVis!); onVis = null; delay = min; void loop(); }; document.addEventListener('visibilitychange', onVis); } return; }
    let sig: string | null = '';
    try { sig = await tick(); } catch { sig = last ?? ''; }
    if (stopped || sig === null) return;
    delay = sig !== last ? min : Math.min(max, delay * POLL_GROWTH); last = sig;
    t = setTimeout(loop, delay * (0.85 + Math.random() * 0.3));
  };
  t = setTimeout(loop, min);
  return () => { stopped = true; if (t) clearTimeout(t); if (onVis) document.removeEventListener('visibilitychange', onVis); };
}
export const jobSig = (j: { status?: string; stage?: string; progress?: number; queuePos?: number } | null | undefined) => (j ? `${j.status}|${j.stage}|${j.progress}|${j.queuePos}` : '');
