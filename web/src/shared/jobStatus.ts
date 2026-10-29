import { jobPct, STATE_LABELS, type JobState } from '../api';
import { modelStageLine } from './JobProgress';

/**
 * PB-02: one progress label for a job, used by the tool page tiles and Assets alike.
 * Words follow the server's `state` (Queued → Processing → Generating, 04 §3.2); the percent is the server's `percent`
 * (null while the run can't say how far along it is, e.g. before ComfyUI reports its first step).
 */
export const jobStateOf = (j: JobState): string => (j as any).state ?? (j.status === 'running' ? 'generating' : j.status);
const LIVE = new Set(['processing', 'generating']);
/** The percent to show, or null (queued, finished, or not known yet). */
export function jobPctShown(j: JobState): number | null {
  const x: any = j; if (!LIVE.has(jobStateOf(j)) || x.percent === null || x.progressKind === 'indeterminate') return null;
  return jobPct(j);
}
export interface JobStatusParts { state: string; word: string; pct: number | null; queuePos: number | null }
export function jobStatusParts(j: JobState): JobStatusParts {
  const state = jobStateOf(j); const x: any = j;
  const queuePos = state === 'queued' && Number(j.queuePos) > 0 ? Number(j.queuePos) : null;
  const stageLine = LIVE.has(state) ? modelStageLine(j) : null; // a local run's first-use download / model load (carries its own percent)
  if (stageLine) return { state, word: stageLine, pct: null, queuePos };
  if (LIVE.has(state) && x.stage === 'reconnecting') return { state, word: 'Reconnecting to ComfyUI', pct: null, queuePos };
  return { state, word: STATE_LABELS[state] ?? state, pct: jobPctShown(j), queuePos };
}
/** "Queued · #2", "Processing", "Generating · 70%", "Done", "Declined by the provider"… `pct: false` leaves the percent out (the caller shows it on its own). */
export function jobStatusLabel(j: JobState, o: { pct?: boolean } = {}): string {
  const p = jobStatusParts(j);
  const why = p.state === 'queued' ? (j as any).queueReason as string | null | undefined : null; // 2026-10-25: the server's plain reason (local vs cloud lane)
  if (p.queuePos) return `${p.word} · #${p.queuePos}${why ? ` · ${why}` : ''}`;
  return o.pct !== false && p.pct != null ? `${p.word} · ${p.pct}%` : p.word;
}
/** PB-05: the short form for a narrow tile badge ("#2", "70%"); the full label stays on the tile. */
export function jobStatusShort(j: JobState): string {
  const p = jobStatusParts(j);
  return p.queuePos ? `#${p.queuePos}` : p.pct != null ? `${p.pct}%` : p.word;
}
