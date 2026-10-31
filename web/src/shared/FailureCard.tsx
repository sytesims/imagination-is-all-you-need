import { toolPage } from '../../../server/src/shared/videoWorkflows';
import { retryJob, forgetSubmitDedupe } from '../api';
import type { JobState } from '../api';
import { useToast, useCopied, Copied } from './Toast';
import { copySupport } from '../ui/support';
import { navigate } from '../platform/router';
import { isCreditsNote, shownNote } from './creditsBack';
import FailureState, { useFailView } from './FailureState';
/** Failed/blocked state on a tool page: the shared FailureState (the bean, the reason, what happened to the money, the fix), then Retry
 *  (same inputs, same seed), Change settings and Copy support info when the reason's own buttons don't already offer them. */
const TIPS: Record<string, string[]> = { declined: ['Rephrase the prompt.', 'Try a different reference image.', 'Try another model.'] };
export default function FailureCard({ job, onRetry }: { job: JobState; onRetry?: () => void }) {
  const toast = useToast(); const [copied, flash] = useCopied(); const v = useFailView(job);
  // Plain Retry: resubmits the same job server-side. On a tool page the new card shows up in Generations; elsewhere open the new job.
  const retry = onRetry ?? (async () => { try { const id = await retryJob(job.id); toast('Retrying with the same settings'); window.dispatchEvent(new Event('ohf:jobs-changed')); if (id && !location.pathname.startsWith('/tools/')) navigate(`/jobs/${id}`); } catch (e) { toast((e as Error).message, 'error'); } });
  const doRetry = () => { forgetSubmitDedupe(); retry(); };
  if (job.status !== 'failed' && job.status !== 'blocked') return null;
  const t = job.errorType ?? 'temporary'; const setup = v.key === 'translate';
  const details = () => copySupport(job.id, [`job: ${job.id}`, `tool: ${job.toolId}`, `model: ${job.provider ?? '-'}`, `time: ${job.createdAt ? new Date(job.createdAt).toISOString() : '-'}`, `error: ${t}`, `reason: ${v.key}`, `message: ${job.error ?? ''}`, `browser: ${navigator.userAgent}`].join('\n')).then(() => flash(), () => toast('Couldn’t copy the support info', 'error'));
  const notes = (job.warnings ?? []).filter(isCreditsNote);
  const tips = TIPS[v.key];
  return (
    <section className={`failure fs-card failure-${job.status}`} role="alert" data-error-type={t} data-reason={v.key}>
      <FailureState job={job} onRetry={doRetry} note={<>
        {notes.map(w => <p key={w} className="fs-note" data-testid="credits-note">{shownNote(w)}</p>)}
        {tips && <ul className="fs-tips">{tips.map(x => <li key={x}>{x}</li>)}</ul>}</>} />
      <div className="fs-sub" role="group" aria-label="More options">
        {!setup && !v.actions.includes('retry') && <button type="button" className="fs-link" data-testid="fc-retry" onClick={doRetry}>Retry</button>}
        {!setup && !v.actions.some(a => a === 'recreate' || a === 'changePhoto') && <a className="fs-link" data-testid="fc-recreate" href={`${toolPage(encodeURIComponent(job.toolId))}?recreate=${encodeURIComponent(job.id)}`} onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(`${toolPage(job.toolId)}?recreate=${job.id}`); }} title="Open the tool with the same settings and a new seed">Change settings</a>}
        <button type="button" className="fs-link" data-testid="fc-copy-support" onClick={details}>{copied ? <Copied /> : 'Copy support info'}</button>
      </div>
    </section>
  );
}
