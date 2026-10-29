/**
 * "Try on <place> (≈ $x)" (Run on, 2026-10-22): a failed run never moves to another place on its own. The server lists the model's other
 * places that are ready now on the failed job (job.tryOn, one per place, with this job's price). One click re-runs the job there ONCE, pinned
 * for that job only (POST /api/jobs/:id/retry {runOn}); the saved choice for this tool + model is not touched (S-02). The optional
 * "Make <place> my default for <model>" box (unchecked by default) sends remember:true, and only then is the place saved as that choice.
 * Used on the Create Image failed tile and in the failed-result viewer.
 */
import { useState } from 'react';
import { retryJob, newIdemKey } from '../api';
import { useToast } from './Toast';
import { useBilling, modeOf } from './billing';
import { listPrice, loadRouting, runOnLabel } from './models';
import { requestRequote } from './quote';

export interface TryOnOffer { runOn: string; runOnLabel?: string; routeId: string; credits: number; listCredits?: number | null; demo?: boolean }
export const tryOnOf = (job: any): TryOnOffer[] => (job?.status === 'failed' && Array.isArray(job?.tryOn) ? job.tryOn : []);
/** The button words: "Try on fal (≈ $0.08)", "Try locally (Free)", "Try on Comfy (Sample)". */
export function tryOnText(o: TryOnOffer, own: boolean | null): string {
  const name = o.runOnLabel || runOnLabel(o.runOn); const price = o.demo ? 'Sample' : listPrice(o.credits, o.runOn, own);
  return `Try on ${name}${price ? ` (${price})` : ''}`;
}
export function TryOnButtons({ job, compact, onStarted, max = 2 }: { job: any; compact?: boolean; onStarted?: (newId: string) => void; max?: number }) {
  const toast = useToast(); const bill = useBilling(); const own = modeOf(bill, null) !== 'team'; const [busy, setBusy] = useState(''); const [keep, setKeep] = useState<Record<string, boolean>>({});
  const offers = tryOnOf(job).slice(0, max); if (!offers.length) return null;
  const canKeep = !!(job.modelKey && job.toolId); const modelName = job.model || job.modelKey || 'this model';
  const go = async (o: TryOnOffer) => { if (busy) return; setBusy(o.runOn); const remember = canKeep && !!keep[o.runOn];
    try {
      const id = await retryJob(job.id, newIdemKey(), o.runOn, remember); const name = o.runOnLabel || runOnLabel(o.runOn);
      if (remember) { await loadRouting(true); requestRequote(); } // the saved choice changed on the server: the chips and quotes follow
      toast(remember ? `Running on ${name}; it's now your default for ${modelName}` : `Running on ${name}`); window.dispatchEvent(new Event('ohf:jobs-changed')); onStarted?.(id);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); } };
  return <div className={`try-on${compact ? ' try-on-compact' : ''}`} data-testid={`try-on-${job.id}`} role="group" aria-label="Run it somewhere else">
    {offers.map(o => <div key={o.runOn} className="try-on-row">
      <button type="button" className={compact ? 'btn btn-sm' : 'rvx-second try-on-btn'} data-testid={`try-on-${o.runOn}`} disabled={!!busy} onClick={e => { e.stopPropagation(); void go(o); }}>{busy === o.runOn ? 'Starting…' : tryOnText(o, own)}</button>
      {canKeep && <label className="try-on-keep" data-testid={`try-on-keep-${o.runOn}`} onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={!!keep[o.runOn]} disabled={!!busy} onChange={e => setKeep(k => ({ ...k, [o.runOn]: e.target.checked }))} />
        <span>Make {o.runOnLabel || runOnLabel(o.runOn)} my default for {modelName}</span>
      </label>}
    </div>)}
  </div>;
}
