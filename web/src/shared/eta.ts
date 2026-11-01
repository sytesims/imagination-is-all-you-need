import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
/** Step-ETA (server stepEta.ts): a local run's time range, learned on this computer only. The quote / price and the job carry `etaRange`;
 *  these helpers turn it into the short line the price strip, the Generate area and the running card show. No made-up numbers: a first run
 *  says it is being timed; a published figure for similar hardware is labelled as such. */
export type EtaSource = 'learned' | 'scaled' | 'reported' | 'first_run';
export type EtaRange = { seconds: number | null; low: number | null; high: number | null; source: EtaSource | string; samples?: number; includesLoad?: 'cold' | 'warm' | null; calibrating?: boolean;
  loadSec?: number | null; secondsPerStep?: number | null; steps?: number | null; postSec?: number | null };

export const isEtaRange = (x: any): x is EtaRange => !!x && typeof x === 'object' && typeof x.source === 'string';
/** The range of a quote (top level, else its fit) or a job. */
export const etaRangeOf = (q: any): EtaRange | null => (isEtaRange(q?.etaRange) ? q.etaRange : isEtaRange(q?.fit?.etaRange) ? q.fit.etaRange : null);

/** "40–70 s", "3–4 min", "about 3 min" (one number when both ends round the same). */
export function rangeText(low: number, high: number): string {
  if (high < 90) { const a = Math.max(1, Math.round(low)), b = Math.max(a, Math.round(high)); return a === b ? `${a} s` : `${a}–${b} s`; }
  const a = Math.max(1, Math.floor(low / 60)), b = Math.max(a, Math.ceil(high / 60)); return a === b ? `${a} min` : `${a}–${b} min`;
}
const runs = (n?: number) => (n === 1 ? '1 run' : `${n ?? 0} runs`);
export type EtaLine = { kind: EtaSource; text: string; short: string; title: string };
/** The line for a quote: learned / scaled → "≈ 3–4 min · Local" (or "… incl. model load" when the model isn't loaded yet);
 *  reported → "Reported for similar hardware: about 5–9 min"; first_run → "First run on this computer: …". null when there is no range. */
export function etaLine(r: EtaRange | null | undefined): EtaLine | null {
  if (!isEtaRange(r)) return null;
  if ((r.source === 'learned' || r.source === 'scaled') && r.low != null && r.high != null) {
    const t = `≈ ${rangeText(r.low, r.high)}`; const tail = r.includesLoad === 'cold' ? ' incl. model load' : ` · ${LOCAL_LABEL}`;
    const title = `Timed from ${runs(r.samples)} on this computer${r.source === 'scaled' ? ' at other settings, scaled to these (wider range)' : ''}.${r.includesLoad === 'cold' ? ' Includes loading the model, which isn’t loaded yet.' : r.includesLoad === 'warm' ? ' The model is already loaded.' : ''}`;
    return { kind: r.source, text: t + tail, short: t + tail, title };
  }
  if (r.source === 'reported' && r.low != null && r.high != null) return { kind: 'reported', text: `Reported for similar hardware: about ${rangeText(r.low, r.high)}`, short: `Similar hardware: about ${rangeText(r.low, r.high)}`,
    title: 'A published figure for this class of graphics card, not timed on this computer. This run is timed, so the next runs show your own estimate.' };
  if (r.source === 'first_run') return { kind: 'first_run', text: 'The first run is timed, so later runs show an estimate.', short: 'First run: timing it', title: 'No run of this model with these files has been timed on this computer yet.' };
  return null;
}
/** Generate's time line for a local run: "≈ 6 min on your computer" (learned / scaled / reported ranges), "First run: timing it", or '' (no range).
 *  `where` names the computer ("on your computer"). */
export function etaOnDevice(r: EtaRange | null | undefined, where: string): string {
  if (!isEtaRange(r)) return '';
  if ((r.source === 'learned' || r.source === 'scaled' || r.source === 'reported') && r.low != null && r.high != null) return `≈ ${rangeText(r.low, r.high)} ${where}`;
  return r.source === 'first_run' || r.calibrating ? 'First run: timing it' : '';
}
/** Always "on your computer" (copy wave 1: one name for the computer, never its brand). */
export const deviceWhere = (): string => 'on your computer';
/** The running card before the first sampler step: the learned range minus the time already spent ("≈ 2–3 min left incl. model load"). */
export function etaLeftLine(r: EtaRange | null | undefined, elapsedSec: number): string | null {
  if (!isEtaRange(r)) return null;
  if (r.calibrating || r.source === 'first_run') return 'First run: timing it';
  if ((r.source !== 'learned' && r.source !== 'scaled') || r.low == null || r.high == null) return null;
  const lo = Math.max(1, r.low - elapsedSec), hi = Math.max(lo, r.high - elapsedSec); if (r.high - elapsedSec <= 0) return null;
  return `≈ ${rangeText(lo, hi)} left${r.includesLoad === 'cold' ? ' incl. model load' : ''}`;
}
