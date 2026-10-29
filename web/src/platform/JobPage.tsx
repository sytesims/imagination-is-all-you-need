import { recreateHref } from '../shared/workflowLinks';
import { goClick } from '../shared/goToWorkflow';
import { isSample, sampleLabel } from '../shared/sample';
import { FallbackPrompt } from '../ui/routing/Routes';
import { pollWithBackoff, jobSig } from '../shared/backoff';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getAssetOrder, getOrderSource, takeOpener } from '../shared/assetOrder';
import { getJob, JobState, ToolInfo, STATE_LABELS, ERROR_LABELS } from '../api';
import ResultView from '../shared/ResultView';
import { ViewerShell, authorOf, ViewerPrompt, ViewerDetails, FailedViewer, whenText } from '../shared/ResultViewer';
import { AngleEcho } from '../tools/reshoot/OrbitPad';
import { RunStage, RunPanel, runPromptOf } from '../shared/RunStage';
import { mediumOf } from '../shared/runStageLogic';
import { MakeRealViewer } from '../shared/MakeItRealViewer';
import { Link, navigate } from './router';
import { useToast } from '../shared/Toast';
import { heldBack, nothingHeld } from '../shared/creditsBack';
import { ownAccountsNow, ledgerUsd } from '../shared/billing';

/** /jobs/:id: the full-screen result viewer (shared/ResultViewer) over Assets, or over Community (?shot=). ← → / swipe step through
 *  the list it sits on (that list's current section and filters, in its order) and replace the history entry; Esc, ✕ or the backdrop
 *  close it back to that list, with focus on the tile. Running, queued, canceled and missing results get the same shell. */
export default function JobPage({ id, tools, closeTo = '/assets', closeLabel = 'Back to Assets', hrefOf = (x: string) => `/jobs/${x}`, src = 'assets' }: { id: string; tools: ToolInfo[];
  /** Round 1 (J8): where a cold link closes to, and the URL of a neighbour (Community keeps the viewer on /community?shot=). */ closeTo?: string; closeLabel?: string; hrefOf?: (id: string) => string;
  /** The list underneath (shared/assetOrder source): its order is the stepping order, also on a cold link. */ src?: string }) {
  const [job, setJob] = useState<JobState | null>(null); const [err, setErr] = useState(''); const toast = useToast();
  /* A run that finishes while you watch: SyteSim hops for a beat, then the result replaces the stage (skipped with reduced motion). */
  const was = useRef<string | null>(null); const [hop, setHop] = useState(false);
  useEffect(() => { was.current = null; setHop(false); }, [id]);
  useEffect(() => { const s = job?.id === id ? job.status : null; const before = was.current; was.current = s;
    if ((before === 'running' || before === 'queued') && s === 'done' && !matchMedia('(prefers-reduced-motion: reduce)').matches) { setHop(true); const t = setTimeout(() => setHop(false), 900); return () => clearTimeout(t); } }, [job?.status, job?.id]);
  useEffect(() => {
    let live = true; setErr('');
    const load = () => getJob(id).then(j => { if (live) setJob(j); return j; }).catch(e => { if (live) setErr(e.message); });
    load(); const stop = pollWithBackoff(async () => { const j = await load(); return j && j.status !== 'queued' && j.status !== 'running' ? null : jobSig(j || null); });
    return () => { live = false; stop(); };
  }, [id]);
  // Step through the list underneath (Assets with its section/filters, Community…), as it is now; a result that isn't in it has no ‹ ›.
  const opener = useRef(takeOpener()); const fromSrc = opener.current.src || src;
  const [order, setOrder] = useState<string[]>(() => getOrderSource() === fromSrc ? getAssetOrder() : []);
  useEffect(() => { const f = () => { if (getOrderSource() === fromSrc) setOrder(getAssetOrder()); }; f(); addEventListener('ohf:asset-order', f); return () => removeEventListener('ohf:asset-order', f); }, []);
  const ix = order.indexOf(id); const prevId = ix > 0 ? order[ix - 1] : null; const nextId = ix >= 0 && ix < order.length - 1 ? order[ix + 1] : null;
  const go = (to: string | null) => { if (to) navigate(hrefOf(to), { replace: true }); };
  const idNow = useRef(id); idNow.current = id;
  const close = () => { if ((history.state as any)?.inApp) history.back(); else navigate(closeTo, { replace: true }); };
  // Focus back on the tile of the result on screen when closing (after ‹ ›), else the one that opened it.
  useEffect(() => () => { const tid = idNow.current || opener.current.id; setTimeout(() => { const t = document.querySelector<HTMLElement>(`#asset-${CSS.escape(tid)} a, [data-testid="comm-shot-link-${CSS.escape(tid)}"]`); t?.focus({ preventScroll: false }); }, 80); }, []);
  const nav = ix >= 0 ? { onPrev: prevId ? () => go(prevId) : null, onNext: nextId ? () => go(nextId) : null, pos: `${ix + 1} / ${order.length}` } : {};
  /* Trash: after Restore / Delete forever the next result in the list shows (it leaves the list), else the viewer closes. */
  const gone = () => { const n = nextId ?? prevId; if (n) go(n); else close(); };
  const tool = job ? tools.find(t => t.id === job.toolId) : undefined;
  const who = (j: JobState | null) => j && ((j as any).isOwner === false || isSample(j)) ? authorOf(j, isSample(j)) : { name: 'You', role: 'Author', self: true };
  /* Not-a-result states (loading, missing, queued/running, needs a decision, canceled) in the viewer shell: the state on the stage, prompt and details in the panel. */
  const state = (label: string, stage: ReactNode, footer: ReactNode = null, j: JobState | null = null) => {
    const inp: any = j?.input ?? {};
    const rows = j ? ([['Tool', isSample(j) ? sampleLabel(j) : (j as any).feature?.label ?? tool?.name ?? j.toolId], ['Status', STATE_LABELS[j.state ?? j.status] ?? j.status], ['Created', whenText((j as any).createdAt)], ['Seed', inp.seed ?? '']] as [string, ReactNode][]).filter(([, v]) => v !== '' && v != null) : [];
    return <ViewerShell label={label} testId="result-viewer-state" fullscreen={false} who={who(j)} tabs={[{ id: 'info', label: 'Info' }]} tab="info" setTab={() => 0} onClose={close} {...nav}
      media={<div className="rvx-media rvx-state" data-testid="rvx-state">{stage}</div>}
      body={j ? <><ViewerPrompt text={String(inp.prompt ?? '').trim()} onCopy={() => navigator.clipboard?.writeText(String(inp.prompt ?? '')).then(() => { toast('Prompt copied'); }, () => false)} /><ViewerDetails rows={rows} /></> : null}
      footer={footer ?? <button type="button" className="rvx-second" data-testid="rvx-back" onClick={close}>{closeLabel}</button>} />;
  };
  if (err) return state('Result not found', <div className="rvx-state-msg" data-testid="jo-missing"><b>Result not found</b><p>{/404|not found/i.test(err) ? 'It may have been deleted, or the link is wrong.' : err}</p></div>);
  if (!job) return state('Loading result', <div className="rvx-state-load shimmer" data-testid="jo-loading" aria-busy="true" />, <span />);
  const toolName = isSample(job) ? sampleLabel(job) : (job as any).feature?.label ?? tool?.name ?? job.toolId;
  /* Queued / running (and the finish beat): the shared in-progress screen (shared/RunStage), the run's facts in the panel. */
  if (job.status === 'queued' || job.status === 'running' || (job.status === 'done' && (hop || ((was.current === 'running' || was.current === 'queued') && !matchMedia('(prefers-reduced-motion: reduce)').matches)))) { const pr = runPromptOf(job);
    return <ViewerShell label="Result in progress" testId="result-viewer-state" fullscreen={false} who={who(job)} tabs={[{ id: 'info', label: 'Info' }]} tab="info" setTab={() => 0} onClose={close} {...nav}
      media={<div className="rvx-run" data-testid="rvx-state"><RunStage job={job} toolName={toolName} medium={mediumOf(job, (tool as any)?.media)} finished={job.status === 'done'} onUpdate={() => getJob(id).then(setJob)} /></div>}
      body={<><ViewerPrompt text={pr.typed} full={pr.full} onCopy={() => navigator.clipboard?.writeText(pr.typed).then(() => { toast('Prompt copied'); }, () => false)} /><RunPanel job={job} toolName={toolName} /></>}
      footer={<button type="button" className="rvx-second" data-testid="rvx-back" onClick={close}>{closeLabel}</button>} />; }
  const mrv = job.status === 'done' ? MakeRealViewer(job) : null; /* Render: Mockup vs Render on the stage; a recording gets the Render button */
  if (job.status === 'done') return <ResultView variant="viewer" job={job} tools={tools} onClose={close} onGone={gone} {...nav} stage={mrv?.stage}
    showOriginalTab={job.toolId === 'reshoot'} beforeUrl={job.input?.videoUrl ?? (job.input as any)?.imageSourceUrl ?? job.resultUrl ?? ''}
    title={isSample(job) ? String((job as any).title ?? 'Sample clip') : (job as any).storyLabel ?? (job as any).feature?.label ?? tool?.name ?? job.toolId}
    recreateHref={tool && !isSample(job) && job.toolId !== 'make-it-real' /* made again from its plan (panel) */ ? recreateHref(job, tools) : null}>{job.toolId === 'reshoot' && <AngleEcho input={job.input} />}{mrv?.panel}</ResultView>;
  if (job.status === 'failed' || job.status === 'blocked') return <FailedViewer job={job} model={(job as any).modelName ?? (job as any).model} onClose={close} onGone={gone} {...nav} />;
  const head = <><span className="rvx-state-eyebrow">{isSample(job) ? sampleLabel(job) : (job as any).feature?.label ?? tool?.name ?? job.toolId}</span><b>{STATE_LABELS[job.state ?? job.status] ?? job.status}{job.errorType && (ERROR_LABELS[job.errorType] ?? job.errorType) !== STATE_LABELS[job.state ?? job.status] ? ` · ${ERROR_LABELS[job.errorType] ?? job.errorType}` : ''}</b></>;
  if ((job.status as string) === 'needs_decision') return state('Needs a decision', <>{head}<FallbackPrompt job={job} onDone={() => location.reload()} /></>, null, job);
  return state('Canceled', <>{head}<p data-testid="jo-cancel-charge">This run was canceled. {cancelChargeText(job)}</p></>,
    tool ? <a href={recreateHref(job, tools)!} onClick={goClick(recreateHref(job, tools)!)} className="rvx-primary" data-testid="jo-retry">Retry</a> : null, job);
}

/** BH2 #9: say what really happened to the money held, from the job's own fields (refund {refunded, amount, freeGenReturned}, refunded, cost). */
function cancelChargeText(job: any): string {
  const rf = job?.refund; const back = heldBack(job); const cost = typeof job?.cost === 'number' ? job.cost : null;
  if (rf?.freeGenReturned) return 'Your free generation was returned.';
  if (back > 0) return cost != null && back < cost ? `${ledgerUsd(back)} of ${ledgerUsd(cost)} went back to your balance.` : `${ledgerUsd(back)} went back to your balance.`;
  if (nothingHeld(job) && (job?.cost === 0 || job?.free)) return 'Nothing was charged.';
  if (ownAccountsNow()) return job?.startedAt ? 'Nothing goes back to an app balance: the provider bills your account under its own rule for canceled runs. See Spend.' : 'Nothing was sent to the provider.'; // own-accounts mode (2026-10-21)
  if (cost != null && cost > 0) return rf && rf.refunded === false ? `${ledgerUsd(cost)} was charged and not returned.` : `${ledgerUsd(cost)} was charged; it shows in Usage once it lands.`;
  return 'Check Usage for what this run cost.';
}
