/**
 * The one failed-run look (feed tile, result viewer, job page, tool stages): the bean in a mood, a friendly title, one short line that
 * always says what happened to the money, and the fix as a button. Never red: soft orange accent and greys on a quiet striped ground.
 * The reason comes from shared/failureReasons.ts; every button runs an action that already exists (retry, recreate, Run on, Settings…).
 *  - variant "tile": mascot + title only (it sits inside the tile's own button); put <FailActions max={1}/> next to it for the one fix.
 *  - variant "full": mascot, title, line, actions and a Details toggle with the server's full message.
 */
import { useState } from 'react';
import type { JobState } from '../api';
import { retryJob, newIdemKey, collectJob } from '../api';
import { useToast } from './Toast';
import { navigate } from '../platform/router';
import { useBilling, modeOf } from './billing';
import { techOf } from './InlineError';
import { recreateHref } from './workflowLinks';
import { goToWorkflow } from './goToWorkflow';
import MascotMood from '../ui/MascotMood';
import { failView, keyOwnerOf, ACTION_LABEL, type FailAction, type FailView } from './failureReasons';
import './failureState.css';
import { TRANSLATE_DOC } from './brand';

const COMFY_CREDITS = 'https://platform.comfy.org/';
const routeOf = (j: any) => String(j?.route ?? (Array.isArray(j?.routeAttempts) ? j.routeAttempts.at(-1)?.routeId : '') ?? '');
const billingIdOf = (route: string) => /^local:/.test(route) ? 'local' : /^fal:/.test(route) ? 'fal' : /^replicate:/.test(route) ? 'replicate' : /bfl/.test(route) ? 'bfl' : /minimax/.test(route) ? 'minimax' : /dashscope|qwen-api/.test(route) ? 'dashscope' : 'comfy';
/** #11: list items carry runOn but no route; map it to the same billing id so the list item and the full job agree. */
const billingIdOfJob = (j: any) => { const r = routeOf(j); if (r) return billingIdOf(r); const o = String(j?.runOn ?? ''); return !o || o === 'comfy-cloud' ? 'comfy' : o; };

/** The view for a job, with the billing mode and the provider's stated failure rule. Billing not loaded yet → ownAccounts null (no charge sentence until known). */
export function useFailView(job: JobState): FailView {
  const b = useBilling(); const p = b?.providers?.find(x => x.id === billingIdOfJob(job)); const mode = modeOf(b, null);
  return failView(job as any, { ownAccounts: mode == null ? null : mode !== 'team', providerRule: p?.failureRule ?? null, providerName: p?.name ?? null });
}

export interface FailActionsProps { job: JobState; view?: FailView; /** at most this many buttons */ max?: number; /** leave these out (the place already shows them) */ skip?: FailAction[];
  /** replaces the plain server retry (tool pages resubmit their own form) */ onRetry?: () => void; /** after an action that leaves this view (new run started, page opened) */ onLeave?: (newJobId?: string) => void;
  onDetails?: () => void; compact?: boolean; className?: string; /** put this action first when the reason offers it */ prefer?: FailAction }
/** The fix buttons, wired to existing actions. */
export function FailActions({ job, view, max = 3, skip = [], onRetry, onLeave, onDetails, compact, className = '', prefer }: FailActionsProps) {
  const toast = useToast(); const own = useFailView(job); const v = view ?? own; const [busy, setBusy] = useState(''); const j: any = job;
  const ok = v.actions.filter(a => !skip.includes(a) && (a !== 'details' || !!onDetails));
  const acts = (prefer && ok.includes(prefer) ? [prefer, ...ok.filter(a => a !== prefer)] : ok).slice(0, max);
  if (!acts.length) return null;
  const go = (to: string) => goToWorkflow(to, onLeave ? () => onLeave() : null); /* shared/goToWorkflow: a viewer in the URL is left by the push, not closed first */
  const recreate = recreateHref(job)!;
  const run = async (a: FailAction) => {
    if (busy) return;
    switch (a) {
      case 'retry': if (onRetry) { onRetry(); return; } setBusy(a); try { const id = await retryJob(job.id); toast('Trying again with the same settings'); window.dispatchEvent(new Event('ohf:jobs-changed')); onLeave?.(id); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); } return;
      case 'collect': setBusy(a); try { await collectJob(job.id); toast('Fetching the result again'); window.dispatchEvent(new Event('ohf:jobs-changed')); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); } return;
      case 'runLocal': setBusy(a); try { const id = await retryJob(job.id, newIdemKey(), 'local', false); toast('Running locally'); window.dispatchEvent(new Event('ohf:jobs-changed')); onLeave?.(id); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); } return;
      case 'recreate': case 'changePhoto': case 'otherModel': case 'download': return go(recreate);
      case 'addKey': return go(`/settings#${keyOwnerOf(routeOf(j)).anchor}`);
      case 'startComfy': return go('/settings#gpu');
      case 'turnOnGpu': return go('/settings#conn-local');
      case 'spendLimits': return go('/spend');
      case 'setupCloud': { const r = routeOf(j); const id = /charswap/.test(r) ? 'charswap' : /layout/.test(r) ? 'layout' : /h3-fast/.test(r) ? 'h3fast' : /h3-pika/.test(r) ? 'pika' : /crossview|deploy/.test(r) ? 'crossview' : '';
        return go(`/settings#${id ? `cloud-setup-${id}` : 'cloud-setup'}`); }
      case 'setupTranslate': window.open(TRANSLATE_DOC, '_blank', 'noopener,noreferrer'); return;
      case 'details': onDetails?.(); return;
      default: return;
    }
  };
  return <div className={`fs-acts${compact ? ' fs-acts-compact' : ''} ${className}`.trim()} role="group" aria-label="Ways to fix it">
    {acts.map((a, i) => a === 'addCredits'
      ? <a key={a} className={`fs-btn${i === 0 ? ' fs-btn-main' : ''}`} href={COMFY_CREDITS} target="_blank" rel="noreferrer" data-testid={`fs-act-${a}`} title="Opens comfy.org in a new tab" onClick={e => e.stopPropagation()}>{ACTION_LABEL[a]}<span aria-hidden className="fs-ext">↗</span></a>
      : <button key={a} type="button" className={`fs-btn${i === 0 ? ' fs-btn-main' : ''}`} data-testid={`fs-act-${a}`} disabled={!!busy} aria-busy={busy === a || undefined}
        onClick={e => { e.stopPropagation(); e.preventDefault(); void run(a); }}>{busy === a ? 'Starting…' : ACTION_LABEL[a]}</button>)}
  </div>;
}

export interface FailureStateProps { job: JobState; variant?: 'tile' | 'full'; skip?: FailAction[]; onRetry?: () => void; onLeave?: (newJobId?: string) => void; className?: string; testId?: string;
  /** extra text under the line (e.g. a credits note) */ note?: React.ReactNode }
export default function FailureState({ job, variant = 'full', skip, onRetry, onLeave, className = '', testId, note }: FailureStateProps) {
  const v = useFailView(job); const [open, setOpen] = useState(false);
  const tech = [v.detail, techOf(job)].filter(Boolean).join('\n');
  if (variant === 'tile') return <span className={`fs fs-tile ${className}`.trim()} data-testid={testId} data-reason={v.key} data-mood={v.mood}>
    <MascotMood mood={v.mood} size={52} className="fs-mood" title={null} /><b className="fs-title">{v.title}</b>{v.charge && <small className="fs-charge">{v.charge}</small>}</span>;
  return <div className={`fs fs-full ${className}`.trim()} role="status" data-testid={testId ?? 'fail-state'} data-reason={v.key} data-mood={v.mood}>
    <MascotMood mood={v.mood} size={88} className="fs-mood" />
    <b className="fs-title" data-testid="fs-title">{v.title}</b>
    <p className="fs-line" data-testid="fs-line">{v.charge && <><span className="fs-charge" data-testid="fs-charge">{v.charge}</span> </>}{v.line}</p>
    {note}
    <FailActions job={job} view={v} skip={skip} onRetry={onRetry} onLeave={onLeave} onDetails={tech ? () => setOpen(o => !o) : undefined} />
    {tech && !v.actions.includes('details') && <button type="button" className="fs-more" aria-expanded={open} data-testid="fs-details" onClick={() => setOpen(o => !o)}>{open ? 'Hide details' : 'Details'}</button>}
    {tech && open && <pre className="fs-tech" data-testid="fs-tech">{tech}</pre>}
  </div>;
}

/** Small pieces for lists and thumbnails (Assets, audio history, video grid): the bean in this job's mood, and its friendly title. */
export function FailIcon({ job, size = 28, className = '' }: { job: JobState; size?: number; className?: string }) {
  const v = useFailView(job); return <span className={`fs-mini ${className}`.trim()} data-mood={v.mood} aria-hidden><MascotMood mood={v.mood} size={size} title={null} /></span>;
}
export function FailTitle({ job }: { job: JobState }) { return <>{useFailView(job).title}</>; }
