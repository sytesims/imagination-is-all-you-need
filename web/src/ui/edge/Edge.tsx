import { Notice } from '../../shared/Notice';
import { useEffect, useRef, useState } from 'react';
import { ownAccountsNow, ledgerUsd } from '../../shared/billing';
import { mayShowOnce, markShown, ONCE_OPTIN } from '../../shared/quietMode';
import { createPortal } from 'react-dom';
import { NeedsKeyHost } from '../routing/Routes';
import { useConnectivity } from '../../shared/connectivity';
import { useSubmitting } from '../../shared/submitGuard';
import { useActiveJobs, getNotifyOnDone, setNotifyOnDone } from '../../shared/activeJobs';
import { createJob, restartListeners, SERVER_RESTARTING } from '../../api';
import { startedElsewhere } from '../../shared/activeJobs';
import { Link, navigate } from '../../platform/router';
import { useToast } from '../../shared/Toast';
import { getConfig } from '../../api';
import { Popover } from '../../shared/Popover';
import { cancelQueued } from '../../shared/QueueCancel';
import { JobRow } from '../../shared/GenTile';
import { useQueueActivity, dropFromActivity, etaText, overallFill, placeOf, laneOfItem, type ActivityItem, type Lane } from '../../shared/queueActivity';
/** Edge UI. Logic lives in shared/connectivity, submitGuard, activeJobs (Platform Builder). */

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const QUEUE_LIMIT = 20; export const QUEUE_WARN = 18;

/** D1: the server's real limits (GET /api/config: concurrency = jobs that run at once, maxQueued = jobs that can wait). Read once; the defaults match the server's. */
/** lanes (2026-10-25): the server's two run lanes, local runs at once and cloud runs at once (GET /api/config lanes.{local,cloud}.limit). */
type Limits = { concurrency: number; maxQueued: number; lanes?: { local: number; cloud: number } };
let limits: Limits = { concurrency: 2, maxQueued: QUEUE_LIMIT }; let limitsLoad: Promise<void> | null = null; const limitSubs = new Set<() => void>();
export function useQueueLimits(): Limits {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump(n => n + 1); limitSubs.add(f);
    limitsLoad ??= getConfig().then(c => { const cc = Number((c as any)?.concurrency), mq = Number((c as any)?.maxQueued); if (cc > 0 || mq >= 0) { const ll = Number((c as any)?.lanes?.local?.limit), cl = Number((c as any)?.lanes?.cloud?.limit); limits = { concurrency: cc > 0 ? cc : limits.concurrency, maxQueued: Number.isFinite(mq) && mq >= 0 ? mq : limits.maxQueued, ...(ll > 0 && cl > 0 ? { lanes: { local: ll, cloud: cl } } : {}) }; limitSubs.forEach(g => g()); } }).catch(() => { limitsLoad = null; });
    return () => { limitSubs.delete(f); }; }, []);
  return limits;
}
/** PB-01: one sentence for the queue rule, shared by Pricing and Settings → Connections. */
export const concurrencyLine = (l: Limits) => `${l.lanes ? `${l.lanes.local === 1 ? 'One run goes' : `Up to ${l.lanes.local} runs go`} at a time on this computer and up to ${l.lanes.cloud} at once in the cloud, so local and cloud runs never wait for each other` : `${l.concurrency === 1 ? 'One run goes' : `Up to ${l.concurrency} runs go`} at a time`}${l.maxQueued > 0 ? `, and up to ${l.maxQueued} more can wait in the queue` : ''}.`;
const isRunningJob = (s: string) => s === 'running' || s === 'processing' || s === 'generating';
/** Live counts across every tool (the queue is shared): running now, waiting, and whether the queue is full. */
export function useQueueState() {
  const { jobs } = useActiveJobs(); const l = useQueueLimits();
  const queued = jobs.filter(j => j.status === 'queued').length; const running = jobs.filter(j => isRunningJob(String(j.status))).length;
  return { running, queued, ...l, full: l.maxQueued > 0 && queued >= l.maxQueued, almostFull: l.maxQueued > 0 && queued >= Math.max(1, l.maxQueued - 2) };
}
/**
 * TRANSPARENCY-PLAN 4i, plain words since 2026-10-25 (two run lanes): the queue activity pill where jobs are listed (Create Image gallery
 * header, video / audio / 3D history). "1 running", "1 running · 2 waiting" (or "2 waiting" alone), amber "Queue full · 20 waiting" when no
 * more can wait, and a small ring + time left when exactly one job runs and its ETA is known. No slot markers: the lanes' sizes live in the
 * tooltip and the popover, where they explain something. Hidden when nothing runs or waits. Click/Enter opens the list, grouped by
 * "On your computer" / "In the cloud", each waiting job with its reason.
 */
const MACHINE = 'computer'; /* copy wave 1: always "your computer", never its brand */
/** Under "On your computer", the lane's own "Waiting for your computer: one local run at a time" repeats the header: the row says "starts next" /
 *  "starts after 2 jobs" instead. Any other reason (a free-gen slot, a busy provider) stays as the server words it. */
const shortReason = (r?: string | null) => (r && !/^Waiting for your /.test(r) && r !== 'Starting now' ? r : undefined);
export function QueueLine({ className = '' }: { className?: string }) {
  const q = useQueueState(); const { jobs: activeJobs } = useActiveJobs(); const [open, setOpen] = useState(false); const btn = useRef<HTMLButtonElement>(null); const toast = useToast();
  const act = useQueueActivity(open || q.running + q.queued > 0);
  const running = act ? act.running : q.running; const waiting = act ? act.waiting : q.queued;
  const concurrency = act?.concurrency ?? q.concurrency; const maxQueued = act?.maxQueued ?? q.maxQueued;
  const full = maxQueued > 0 && waiting >= maxQueued;
  useEffect(() => { if (open && running + waiting === 0) setOpen(false); }, [open, running + waiting === 0]);
  if (running + waiting === 0 && !open) return null;
  const items = act?.items ?? []; const runs = items.filter(i => i.state === 'running');
  const one = running === 1 && runs.length === 1 ? runs[0].progress : null; const oneEta = one ? etaText(one.etaSeconds) : ''; const oneFill = one ? overallFill(one) : null;
  const localLimit = act?.lanes?.local.limit ?? q.lanes?.local; const cloudLimit = act?.lanes?.cloud.limit ?? q.lanes?.cloud;
  const laneNote = (l: Lane) => { const n = l === 'local' ? localLimit : cloudLimit; return n ? (l === 'local' ? `${n} at a time` : `up to ${n} at once`) : ''; };
  const tip = `${localLimit && cloudLimit ? `Your ${MACHINE}: ${localLimit} at a time. Cloud: up to ${cloudLimit} at once` : `Runs ${concurrency} at a time`}${maxQueued > 0 ? `. Up to ${maxQueued} can wait` : ''}. Click to see the jobs.`;
  const said = full ? `Queue full, ${waiting} waiting` : [running ? `${running} running` : '', waiting ? `${waiting} waiting` : ''].filter(Boolean).join(', ');
  const cancel = (it: ActivityItem) => { dropFromActivity(it.id); void cancelQueued({ id: it.id, toolId: it.toolId, status: it.state === 'running' ? 'running' : 'queued', cost: it.price.credits, input: {} } as any, toast); };
  const row = (it: ActivityItem) => { const go = () => { setOpen(false); navigate(`/jobs/${it.id}`); };
    return it.state === 'running'
      ? <JobRow key={it.id} id={it.id} title={it.title} model={it.model} place={placeOf(null, it)} p={it.progress} onOpen={go} onCancel={(it.cancellable ?? (activeJobs.find(j => j.id === it.id) as any)?.cancellable) === true ? () => cancel(it) : null} />
      : <JobRow waiting key={it.id} id={it.id} title={it.title} model={it.model} place={placeOf(null, it)} p={{ ...it.progress, stage: 'queued', queuePosition: it.queuePosition ?? it.progress.queuePosition, queueReason: shortReason(it.queueReason ?? it.progress.queueReason) }} onOpen={go} onCancel={() => cancel(it)} />; };
  const groups = (['local', 'cloud'] as Lane[]).map(l => { const its = items.filter(i => laneOfItem(i) === l); return { l, its, run: its.filter(i => i.state === 'running').length, wait: its.filter(i => i.state === 'waiting').length }; }).filter(g => g.its.length);
  const R = 5.5, C = 2 * Math.PI * R;
  return <>
    <button ref={btn} type="button" className={`qp ${full ? 'qp-full' : ''} ${running === 0 ? 'qp-idle' : ''} ${className}`} data-testid="queue-line" aria-haspopup="dialog" aria-expanded={open} title={tip}
      aria-label={`${said}${oneEta ? `, about ${oneEta.slice(1)} left` : ''}. ${tip}`} onClick={() => setOpen(o => !o)}>
      <span className="qp-dot" aria-hidden />
      {full ? <span>Queue full · {waiting} waiting</span> : <>{running > 0 && <span>{running} running</span>}{waiting > 0 && <span className={running > 0 ? 'qp-wait' : ''}>{running > 0 ? '· ' : ''}{waiting} waiting</span>}</>}
      {!full && oneEta && <>{oneFill != null && <svg className="qp-ring" width="14" height="14" viewBox="0 0 14 14" aria-hidden><circle className="bg" cx="7" cy="7" r={R} /><circle className="fg" cx="7" cy="7" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - oneFill)} /></svg>}<span className="qp-eta">{oneEta}</span></>}
    </button>
    <Popover open={open} anchor={btn} onClose={() => setOpen(false)} label="Queue" placement="bottom" align="end" testId="queue-pop" width={360}>
      <div className="qa">
        {full && <Notice as="p" kind="warn" className="qa-full" title="The queue is full.">Generate works again as soon as one starts, or cancel a waiting job.</Notice>}
        {groups.length ? groups.map(g => <section key={g.l} className="qa-sec" aria-label={g.l === 'local' ? `On your ${MACHINE}` : 'In the cloud'} data-testid={`queue-lane-${g.l}`}>
          <h3 className="qa-h">{g.l === 'local' ? `On your ${MACHINE}` : 'In the cloud'}<small>{[g.run ? `${g.run} running` : '', g.wait ? `${g.wait} waiting` : '', laneNote(g.l)].filter(Boolean).join(' · ')}</small></h3>
          <div className="qa-list">{g.its.map(row)}</div></section>)
          : <p className="qa-empty">{act ? 'Nothing running right now.' : 'Loading…'}</p>}
        {maxQueued > 0 && waiting > 0 && !full && <p className="qa-foot">{waiting} of {maxQueued} places in the queue used</p>}
      </div>
    </Popover>
  </>;
}

/** #7 One app-level connection banner (shared/OfflineBanner; it also covers server restarts). */
export { OfflineBanner } from '../../shared/OfflineBanner';

/** Shared Generate state: offline, submitting, queue almost full. */
export function useGenState(toolId?: string) {
  const c = useConnectivity(); const sub = useSubmitting(toolId); const q = useQueueState();
  /* D1: a full queue blocks Generate and says why (the server would answer queue_full). */
  const block = c.offline ? 'Reconnect to generate' : q.full ? `The queue is full: ${q.queued} of ${q.maxQueued} waiting. Generate again when one starts, or cancel a queued job.` : '';
  return { offline: c.offline, submitting: sub, queued: q.queued, maxQueued: q.maxQueued, full: q.full, almostFull: q.almostFull, block, label: sub ? 'Starting…' : null };
}
/** Small line under Generate: "Queue almost full". */
export function GenHint({ toolId }: { toolId?: string }) {
  const g = useGenState(toolId);
  if (g.full) return <p className="helper gen-hint gh-queue gh-full" role="status" data-testid="gen-queue-full">Queue full ({g.queued} of {g.maxQueued} waiting). Generate works again as soon as one starts. <Link to="/assets">View queue</Link></p>;
  if (g.almostFull) return <p className="helper gen-hint gh-queue" role="status">Queue almost full ({g.queued} of {g.maxQueued} waiting). <Link to="/assets">View queue</Link></p>;
  return null;
}

/** Global listener for structured submit errors: queue-full toast and the affordable-groups dialog. */
type Pending = { toolId: string; fd: FormData; e: any };
const pendings = new Set<(p: Pending) => void>();
export function emitSubmitError(toolId: string, fd: FormData, e: any) { pendings.forEach(f => f({ toolId, fd, e })); }
if (typeof window !== 'undefined') (globalThis as any).__ohfSubmitError = emitSubmitError;
const OWN_OFFER = ['object-swap', 'motion-transfer', 'restyle', 'video-swap']; // these tools render their own .partial-offer
export function EdgeHost() {
  const toast = useToast();
  const [dlg, setDlg] = useState<Pending | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { const f = (p: Pending) => { const e = p.e; if (e?.code === 'queue_full') { toast('Your queue is full', 'warn', { sub: `${e.queued ?? e.limit ?? QUEUE_LIMIT} jobs are waiting. Cancel one or wait for a slot.`, action: { label: 'View queue', to: '/assets' } }); } else if (e?.status === 402 && (e.totalGroups ?? 0) > 1 && !OWN_OFFER.includes(p.toolId)) { setErr(''); setDlg(p); } }; pendings.add(f); return () => { pendings.delete(f); }; }, []);
  const run = async () => { if (!dlg) return; setBusy(true); setErr(''); const fd = new FormData(); dlg.fd.forEach((v, k) => fd.append(k, v)); fd.set('maxGroups', String(dlg.e.affordableGroups)); try { const r = await createJob(dlg.toolId, fd); setDlg(null); navigate(`/jobs/${r.id}`); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const e = dlg?.e; const k = e?.affordableGroups ?? 0;
  return <><NeedsKeyHost />
    {dlg && createPortal(<div className="mp-scrim" onMouseDown={x => x.target === x.currentTarget && setDlg(null)}><div className="dlg afford-dlg" role="dialog" aria-modal="true" aria-labelledby="afford-t">
      <h3 id="afford-t">Not enough balance for all {e.totalGroups} groups</h3>
      <p>Needs {ledgerUsd(e.needed)}, you have {ledgerUsd(e.balance)}.</p>
      {k > 0 && <p className="helper">Your pinned references are used in every group.</p>}
      {err && <p className="inline-err">{err}</p>}
      <div className="row afford-acts">{k > 0 && <button type="button" className="btn btn-primary" disabled={busy} onClick={run}>{busy ? 'Starting…' : `Run ${k} group${k > 1 ? 's' : ''} (${ledgerUsd(e.partialCost)})`}</button>}<Link to="/pricing" className="btn">Add to balance</Link><button type="button" className="btn btn-ghost" onClick={() => setDlg(null)}>Cancel</button></div>
    </div></div>, document.body)}
    <NotifyOptIn />
  </>;
}

/** One-time opt-in after the first finished job started here (never on page load). Hidden in demo mode or when turned off in Settings. */
function NotifyOptIn() {
  /* R5: only a job started from this browser counts (another tab, client, API or MCP job finishing never pops this over the page). */
  const { finished: all, startedElsewhere } = useActiveJobs(); const finished = all.filter(j => !!(j as any).originClientId && !startedElsewhere(j as any)); const [hide, setHide] = useState(() => !mayShowOnce(ONCE_OPTIN) || getNotifyOnDone());
  useEffect(() => { const f = () => { if (!mayShowOnce(ONCE_OPTIN)) setHide(true); }; window.addEventListener('ohf:quiet-changed', f); return () => window.removeEventListener('ohf:quiet-changed', f); }, []);
  const base = useRef<number | null>(null); if (base.current == null) base.current = finished.length;
  if (hide || finished.length <= base.current || typeof Notification === 'undefined') return null;
  const close = () => { markShown(ONCE_OPTIN); setHide(true); };
  return createPortal(<div className="notify-opt" role="dialog" aria-label="Notifications"><b>Want a notification when jobs finish?</b><p className="helper">Get a ping when a result is ready, even if this tab is in the background.</p>
    <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={async () => { await setNotifyOnDone(true); close(); }}>Turn on</button><button type="button" className="btn btn-ghost btn-sm" data-testid="notify-opt-dismiss" onClick={close}>No thanks</button></div></div>, document.body);
}

/** #1 Resume status above a tool's results. */
export function ResumeStatus({ toolId, checked = false }: { toolId: string; /** PB-19: the list has loaded, so there's nothing left to check (no "Checking…" bar) */ checked?: boolean }) {
  const { jobs } = useActiveJobs(toolId); const c = useConnectivity(); const [first, setFirst] = useState(true);
  useEffect(() => { const t = setTimeout(() => setFirst(false), 1500); return () => clearTimeout(t); }, []);
  if (c.offline && c.reason === 'polls') return <p className="helper resume-st resume-err" role="status">Couldn’t load your running jobs. Retrying…</p>;
  if (first && !checked && !jobs.length) return <div className="resume-st resume-load" aria-busy="true"><span className="shimmer" /><span className="helper">Checking for running jobs…</span></div>;
  return null;
}

/** #2 / #9 status sublines for a job card. */
export function jobSubline(j: any): string | null {
  const other = j.originClientId && startedElsewhere(j) && (j.status === 'queued' || j.status === 'running') ? 'Started on another device. ' : '';
  const line = jobSubline0(j); return other || line ? `${other}${line ?? ''}`.trim() : null;
}
function jobSubline0(j: any): string | null {
  if (j.status === 'queued' && j.requeuedAt) return 'Back in line after a server restart. You weren’t charged twice.';
  if (j.status === 'running' && j.slow) return `Taking longer than usual.${j.lane === 'free' ? ' Free jobs share a slower queue.' : ''}`;
  return null;
}

/** #8 Download all (ZIP), only when there is more than one output. */
export function ZipLink({ job }: { job: any }) {
  const [err, setErr] = useState('');
  if ((job.outputs?.length ?? 0) < 2) return null;
  return <><a className="btn zip-link" href={`/api/jobs/${encodeURIComponent(job.id)}/download.zip`} download onClick={async e => { e.preventDefault(); setErr(''); try { const r = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/download.zip`, { method: 'HEAD' }); if (!r.ok && r.status !== 405) throw 0; location.href = `/api/jobs/${encodeURIComponent(job.id)}/download.zip`; } catch { setErr('Couldn’t build the ZIP. Try again, or download files one by one.'); } }} title="Includes every output and a settings file to recreate it.">Download all (ZIP)<small className="helper">Every output plus a settings file</small></a>{err && <p className="inline-err">{err}</p>}</>;
}

/** Multi-group result status: canceled groups (refunded) + "Retry failed groups" → child job. */
export function GroupStatus({ job }: { job: any }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const failed: number[] = job.failedGroups ?? []; const canceled = job.canceledGroups ?? 0;
  const reel = job.toolId === 'app-photos-to-reel'; const noun = reel ? 'photo' : 'group'; const failedMusic = reel && !!job.input?.failedMusic;
  if (!failed.length && !canceled && !failedMusic) return null;
  return <div className="group-status" data-testid="group-status">
    {canceled > 0 && <p className="helper gs-canceled">{canceled} group{canceled > 1 ? 's' : ''} canceled{(Number(job.cost) || 0) > 0 && !ownAccountsNow() ? ' · the rest went back to your balance' : ''}. Finished groups are kept.</p>}
    {failed.length > 0 && <p className="helper gs-failed">{failed.length} {noun}{failed.length > 1 ? 's' : ''} failed ({noun} {failed.map(i => i + 1).join(', ')}). {reel ? 'Your reel kept the other photos. Retry keeps the finished clips.' : (Number(job.cost) || 0) > 0 ? 'What they held went back to your balance.' : 'Nothing was charged for them.'}</p>}
    {failedMusic && <p className="helper gs-failed">Music failed. Your reel kept the finished video.</p>}
    {(failed.length > 0 || failedMusic) && <button type="button" className="btn btn-primary retry-failed" disabled={busy || (reel && !['done', 'failed'].includes(job.status))} onClick={async () => { setBusy(true); setErr(''); try { const { retryFailedGroups } = await import('../../api'); const r = await retryFailedGroups(job.id); navigate(`/jobs/${r.id}`); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}>{busy ? 'Starting…' : reel && !['done', 'failed'].includes(job.status) ? 'Finishing reel…' : failedMusic ? (failed.length ? 'Retry failed photos and music' : 'Retry the music') : `Retry failed ${noun}s`}</button>}
    {err && <p className="inline-err">{err}</p>}
  </div>;
}

/** server_restarting (503 / dropped connection during a restart): own copy, separate from offline. */
import { RESTART_COPY } from '../../shared/restartCopy';
export { RESTART_COPY };
export const isRestartError = (m?: string | null) => !!m && (m === SERVER_RESTARTING || /restarting/i.test(m));
