import { cancelJob, type JobState } from '../api';
import { useToast } from './Toast';
import { cancelText, notCancellableText } from './creditsBack';
import { markCanceling, unmarkCanceling } from './activeJobs';
/** Cancel on a queued job card. Only while queued: once a job is processing the server won't stop it, so nothing is shown.
 *  `inline` renders a span[role=button] for cards that are themselves <button>s (no nested buttons). */
/** The server's `cancellable` is exact (a cancel will succeed): Local jobs at every stage (our queue, ComfyUI's queue, running), hosted jobs only
 *  before they are sent. Without it (older servers), Row 28: only while truly waiting (status 'queued' can hide a moving 'processing' state). */
export const isCancellable = (job: any) => !!job?.id && job.status !== 'canceled' && (typeof job.cancellable === 'boolean'
  ? job.cancellable && (job.status === 'queued' || job.status === 'running')
  : job.status === 'queued' && (!job.state || job.state === 'queued') && !(Number(job.progress) > 0) && !(Number(job.percent) > 0));

/** PB-04: `ohf:job-cancel` {id, phase: 'start' | 'done' | 'fail', job} lets every list that shows the job patch it at once. */
export const JOB_CANCEL_EVT = 'ohf:job-cancel';
export type JobCancelDetail = { id: string; phase: 'start' | 'done' | 'fail'; job: JobState };
const inFlight = new Set<string>();
/** The fields a just-canceled job shows until the server confirms (status Canceled, no Cancel button, out of the "in progress" count). */
export const canceledPatch = (j: JobState): JobState => ({ ...j, status: 'canceled', state: 'canceled', cancellable: false, queuePos: 0, canceledLocally: Date.now() } as any);
/** On a refused cancel: the job's own fields from before the click. */
export const uncanceledPatch = (cur: JobState, before: JobState): JobState => ({ ...cur, status: before.status, state: (before as any).state, cancellable: (before as any).cancellable, queuePos: before.queuePos, canceledLocally: undefined } as any);
/**
 * PB-04: cancel a queued job. The tile updates at once (optimistic: Canceled, no Cancel button, the active count drops), the toast follows the
 * server's answer, and the next poll reconciles. A second press while the first is in flight (or after it) does nothing, never an error.
 */
export async function cancelQueued(job: JobState, toast: (msg: string, kind?: 'error') => void): Promise<boolean> {
  const id = job.id; if (!id || inFlight.has(id) || job.status === 'canceled') return false;
  inFlight.add(id); markCanceling(id);
  const send = (phase: JobCancelDetail['phase']) => window.dispatchEvent(new CustomEvent<JobCancelDetail>(JOB_CANCEL_EVT, { detail: { id, phase, job } }));
  send('start');
  try { await cancelJob(id); toast(cancelText(job)); send('done'); window.dispatchEvent(new Event('ohf:jobs-changed')); return true; }
  catch (err) { send('fail'); unmarkCanceling(id, job); toast(notCancellableText(job, err), 'error'); window.dispatchEvent(new Event('ohf:jobs-changed')); return false; }
  finally { inFlight.delete(id); }
}

export default function QueueCancel({ job, inline = false, className = '' }: { job: JobState; inline?: boolean; className?: string }) {
  const toast = useToast();
  if (!isCancellable(job)) return null;
  const go = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); void cancelQueued(job, toast); };
  const props = { className: `q-cancel ${className}`, 'data-testid': `q-cancel-${job.id}`, 'aria-label': 'Cancel queued job', onClick: go };
  return inline ? <span role="button" tabIndex={0} {...props} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && go(e)}>Cancel</span> : <button type="button" {...props}>Cancel</button>;
}
