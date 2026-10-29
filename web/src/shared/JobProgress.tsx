import { jobSubline } from '../ui/edge/Edge';
import { FallbackPrompt } from '../ui/routing/Routes';
import type { JobState } from '../api';
import { jobPct, STATE_LABELS } from '../api';
import { minutesOf } from './fit';
import { RunSteps, RunTimeLine, RunMoneyRow } from './RunStage';
/** Inline progress on a tool page: the same step tracker, time line and cost + cancel row as the shared in-progress screen (RunStage.tsx).
 *  `stages` is kept for callers; the steps now come from the job's own progress (runStageLogic.ts runStepsOf). */
export default function JobProgress({ job, onUpdate }: { job: JobState; stages?: [string, string][]; onUpdate: () => void }) {
  const pct = jobPct(job);
  const state = job.state ?? (job.status === 'running' ? 'generating' : job.status);
  if (job.status === ('needs_decision' as any)) return <FallbackPrompt job={job} onDone={onUpdate} />;
  return <div className="progress" aria-live="polite">
    {job.free && <span className="nb nb-free jp-free" title="Free: shared queue, may take longer">Free · shared queue, may take longer</span>}
    <p className="helper" data-state={state}>{STATE_LABELS[state] ?? state}{job.status === 'queued' && job.queuePos > 0 ? ` · #${job.queuePos} in queue` : ''}{(job as any).queueReason && job.status === 'queued' ? ` · ${(job as any).queueReason}` : ''}</p>
    <RunSteps job={job} compact />
    {job.status === 'running' && <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div style={{ width: `${pct}%` }} /></div>}
    <ModelStageDetail job={job} />
    {jobSubline(job) && <p className="job-subline" role="status">{jobSubline(job)}</p>}
    <RunTimeLine job={job} className="jp-time" />
    <RunMoneyRow job={job} onUpdate={onUpdate} />
  </div>;
}

const gbN = (b: number) => { const g = b / 1e9; return g >= 10 ? String(Math.round(g)) : (Math.round(g * 10) / 10).toFixed(1); };
const secText = (s: number) => (s < 90 ? `${Math.max(1, Math.round(s))} s` : `${minutesOf(s)} min`);
/** B30: the model stage of a local job, if it is in one (stageDetail first, then job.stage). */
export const modelStageOf = (job: JobState): 'downloading_model' | 'loading_model' | null => { const j: any = job; const s = j.stageDetail?.stage ?? job.stage; return s === 'downloading_model' || s === 'loading_model' ? s : null; };
/** B30: one short line for a tile: 'Downloading the model · 31%' / 'Loading the model'. */
export function modelStageLine(job: JobState): string | null {
  const s = modelStageOf(job); if (!s) return null; const d: any = (job as any).stageDetail ?? {};
  if (s === 'loading_model') return 'Loading the model';
  const tot = Number(d.bytesTotal) || 0; const done = Number(d.bytesDone) || 0; return `Downloading the model${tot > 0 ? ` · ${Math.min(100, Math.floor((done / tot) * 100))}%` : ''}`;
}
export function ModelStageDetail({ job }: { job: JobState }) {
  const j: any = job; const d = j.stageDetail; const eb = j.etaBreakdown;
  if (!d && !eb) return null;
  if (d && (d.stage === 'downloading_model' || d.stage === 'loading_model')) {
    const tot = Number(d.bytesTotal) || 0; const done = Number(d.bytesDone) || 0; const pc = tot > 0 ? Math.min(100, Math.floor((done / tot) * 100)) : null;
    const files: any[] = Array.isArray(d.files) ? d.files : [];
    return <div className="jp-model" data-testid={`jp-${d.stage}`} role="status">
      <p className="helper jp-model-head"><b>{d.message || (d.stage === 'downloading_model' ? 'Downloading the model' : 'Loading the model')}</b></p>
      {d.stage === 'downloading_model' && <p className="helper jp-model-bytes" data-testid="jp-dl-bytes">{tot > 0 ? `${gbN(done)} of ${gbN(tot)} GB` : 'Starting…'}{pc != null ? ` · ${pc}%` : ''}{d.etaSeconds != null && d.etaSeconds > 0 ? ` · about ${secText(d.etaSeconds)} left` : ''}{d.rateSource === 'estimate' && d.etaSeconds ? ' (estimate)' : ''}</p>}
      {d.stage === 'downloading_model' && pc != null && <div className="bar jp-model-bar" role="progressbar" aria-label="Model download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pc}><div style={{ width: `${pc}%` }} /></div>}
      {d.stage === 'downloading_model' && files.length > 0 && <ul className="jp-files" data-testid="jp-dl-files">{files.map(f => { const ft = Number(f.bytesTotal) || 0; const fd = Number(f.bytesDone) || 0; return <li key={f.file}><span className="jp-file-name">{f.file}</span><span className="helper">{ft > 0 ? `${gbN(fd)} / ${gbN(ft)} GB` : ''}{ft > 0 && fd >= ft ? ' ✓' : ''}</span></li>; })}</ul>}
      {d.stage === 'loading_model' && d.etaSeconds != null && d.etaSeconds > 0 && <p className="helper">About {secText(d.etaSeconds)}</p>}
    </div>;
  }
  if (eb && ((eb.downloadSec ?? 0) > 0 || (eb.loadSec ?? 0) > 0)) return <p className="helper jp-breakdown" data-testid="jp-breakdown">{[eb.downloadSec > 0 ? `Download ${secText(eb.downloadSec)}` : '', eb.loadSec > 0 ? `Load ${secText(eb.loadSec)}` : '', eb.renderSec > 0 ? `Render ${secText(eb.renderSec)}` : ''].filter(Boolean).join(' · ')}</p>;
  return null;
}
