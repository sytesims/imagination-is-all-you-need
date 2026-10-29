import { useEffect, useState } from 'react';
import type { JobState } from '../api';
import { notePoll, isNetworkFail, onReconnect } from './connectivity';
import { pollWithBackoff, jobSig } from './backoff';
import { clientId } from './clientId';
import { typedPromptOf } from '../../../server/src/shared/typedPrompt';

/**
 * Server-driven active-job list. One shared poller for all subscribers:
 *  GET /api/jobs?state=active (fallback: filter queued/running client-side if the server ignores `state`).
 *  A job that leaves the list is fetched once (GET /api/jobs/:id) to learn its final state → done notification.
 * The last good list is kept on failure (never emptied). Focus and reconnect poll at once.
 */
export const isActiveJob = (j: Pick<JobState, 'status'>) => j.status === 'queued' || j.status === 'running' || (j.status as string) === 'processing' || (j.status as string) === 'generating';
const TERMINAL = new Set(['done', 'failed', 'blocked', 'canceled']);
let active = new Map<string, JobState>(); let finished: JobState[] = []; const doneIds = new Set<string>();
const subs = new Set<() => void>(); let stop: (() => void) | null = null; let ticking: Promise<string> | null = null;
const emit = () => subs.forEach((f) => f());

async function fetchActive(): Promise<JobState[] | null> {
  let r: Response | null = null;
  try { r = await fetch('/api/jobs?state=active&limit=100'); } catch { r = null; }
  if (isNetworkFail(r) || !r!.ok) { notePoll(!isNetworkFail(r)); return null; }
  notePoll(true);
  const list = (await r!.json().catch(() => null)) as JobState[] | null;
  return Array.isArray(list) ? list.filter(isActiveJob) : null;
}
async function tick(): Promise<string> {
  const list = await fetchActive(); if (!list) return [...active.values()].map(jobSig).join(','); // keep last state
  const next = new Map(list.map((j) => [j.id, j]));
  const gone = [...active.keys()].filter((id) => !next.has(id));
  for (const id of gone) {
    try { const r = await fetch(`/api/jobs/${id}`); if (r.ok) { const j = (await r.json()) as JobState; if (TERMINAL.has(j.status)) { if (!doneIds.has(id)) { doneIds.add(id); finished.push(j); onFinished(j); } } else next.set(id, j); } } catch { next.set(id, active.get(id)!); }
  }
  for (const id of [...canceling]) { if (next.has(id) && isActiveJob(next.get(id)!)) next.delete(id); else if (!list.some((j) => j.id === id)) canceling.delete(id); } // PB-04: a cancel in flight stays off the list
  active = next; emit();
  return list.map(jobSig).join(',');
}
export function refreshActiveJobs(): Promise<string> { return (ticking ??= tick().finally(() => { ticking = null; })); }
function start() {
  if (stop) return;
  void refreshActiveJobs();
  const poll = pollWithBackoff(() => refreshActiveJobs());
  const focus = () => { void refreshActiveJobs(); clearBadge(); };
  addEventListener('focus', focus); const vis = () => { if (!document.hidden) focus(); }; document.addEventListener('visibilitychange', vis);
  const off = onReconnect(() => { void refreshActiveJobs(); });
  stop = () => { poll(); removeEventListener('focus', focus); document.removeEventListener('visibilitychange', vis); off(); stop = null; };
}
export const activeJobsSnapshot = () => [...active.values()];

/** PB-04: a queued job the user just canceled leaves the active list at once (optimistic); the next poll reconciles.
 *  While the cancel is in flight a poll that still lists it as queued doesn't bring it back. */
const canceling = new Set<string>();
export const isCanceling = (id: string) => canceling.has(id);
export function markCanceling(id: string) { canceling.add(id); if (active.delete(id)) emit(); }
/** The cancel was refused: put the job back (the next poll brings its real state). */
export function unmarkCanceling(id: string, j?: JobState) { canceling.delete(id); if (j && isActiveJob(j) && !active.has(id)) { active.set(id, j); emit(); } void refreshActiveJobs(); }
/** Jobs that finished since load (server-observed), newest last. */
export const finishedJobsSnapshot = () => finished.slice();

// ---- Done notifications + tab badge (#6) ----
export const NOTIFY_KEY = 'ohf:notifyOnDone';
export const getNotifyOnDone = () => { try { return localStorage.getItem(NOTIFY_KEY) === '1'; } catch { return false; } };
/** Turn on: asks for permission (only now, after the user opted in). Returns the resulting permission. */
export async function setNotifyOnDone(on: boolean): Promise<NotificationPermission | 'unsupported'> {
  try { localStorage.setItem(NOTIFY_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  if (!on) return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
}
/** Tool names for notification text (registered by useTools once /api/tools loads). */
const toolNames = new Map<string, string>();
export const registerToolNames = (tools: { id: string; name: string }[]) => tools.forEach((t) => toolNames.set(t.id, t.name));
/** "Create Image · a red fox in the snow…" (tool name + prompt excerpt, ≤ 60 chars). */
export function notifyBody(j: JobState) {
  const prompt = typedPromptOf((j as any).input).replace(/\s+/g, ' ').trim(); // workflow jobs: your words (2026-10-25)
  const ex = prompt.length > 60 ? `${prompt.slice(0, 57)}…` : prompt;
  return [toolNames.get(j.toolId) ?? j.toolId, ex].filter(Boolean).join(' · ');
}
/** Started on another device/browser: the job's originClientId differs from this browser's id. */
export const startedElsewhere = (j: Pick<JobState, 'originClientId'>) => !!j.originClientId && j.originClientId !== clientId();
let badge = 0;
const BADGE = /^\(\d+\) /;
export const badgeCount = () => badge;
export function clearBadge() { if (!badge) return; badge = 0; document.title = document.title.replace(BADGE, ''); emit(); }
function onFinished(j: JobState) {
  if (typeof document === 'undefined' || !document.hidden) return;
  badge++; document.title = `(${badge}) ${document.title.replace(BADGE, '')}`;
  if (getNotifyOnDone() && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(j.status === 'done' ? 'Generation finished' : `Generation ${j.status}`, { body: notifyBody(j), tag: `ohf-job-${j.id}` }); } catch { /* ignore */ }
  }
}

/** Track a job id submitted from this tab so its finish is noticed even before the next list poll. */
export function followJob(j: JobState) { if (j.id && isActiveJob(j) && !active.has(j.id) && !doneIds.has(j.id)) { active.set(j.id, j); emit(); } }

/**
 * useActiveJobs(toolId?) → { jobs, finished, badge, refresh }.
 * jobs = server's queued/running jobs (optionally for one tool), live; mounting starts the shared poller.
 */
export function useActiveJobs(toolId?: string) {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); start(); return () => { subs.delete(f); if (!subs.size) stop?.(); }; }, []);
  const jobs = activeJobsSnapshot().filter((j) => !toolId || j.toolId === toolId);
  /** [EDGE #9] server flags slow:true once elapsed > 2× ETA: hint only (e.g. "taking longer than usual"). */
  const slowIds = jobs.filter((j) => j.slow).map((j) => j.id);
  const elsewhereIds = jobs.filter(startedElsewhere).map((j) => j.id);
  return { jobs, slowIds, elsewhereIds, startedElsewhere, isSlow: (id: string) => slowIds.includes(id), finished: finishedJobsSnapshot().filter((j) => !toolId || j.toolId === toolId), badge, refresh: refreshActiveJobs };
}

/** Test hook (dev builds only): Puppeteer reads the shared list. */
if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) (window as any).__ohfActiveJobs = () => ({ active: activeJobsSnapshot().map((j) => ({ id: j.id, status: j.status, slow: !!j.slow })), finished: finishedJobsSnapshot().map((j) => j.id), badge });
