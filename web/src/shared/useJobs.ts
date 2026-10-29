import { pollWithBackoff, jobSig } from './backoff';
import { mayShowOnce, markShown, ONCE_DONE_TOAST } from './quietMode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { featureById } from './imageFeatures';
import { getJobs, listJobsPage, JobState, ERROR_LABELS } from '../api';
import { useToast } from './Toast';
import { mergeById } from './jobMerge';
import { useActiveJobs, followJob, isCanceling } from './activeJobs';
import { JOB_CANCEL_EVT, canceledPatch, uncanceledPatch, type JobCancelDetail } from './QueueCancel';
import { heldBack, nothingHeld, stripCreditSentences } from './creditsBack';
import { ledgerUsd } from './billing';
/** Storage key prefix. Pre-rename `oj:*` keys are moved to `ohf:*` once per page load. */
/** One toast per failed job across every mounted useJobs, with one refund sentence. */
const FAIL_TOASTED = new Set<string>();
export function failToast(j: { error?: string | null; errorType?: string | null; refunded?: number }): string {
  const back = heldBack(j); const msg = stripCreditSentences(j.error ?? '') || (ERROR_LABELS[j.errorType ?? ''] ?? 'Generation failed');
  return `${msg.replace(/\.$/, '')}.${back > 0 ? ` ${ledgerUsd(back)} back to your balance.` : nothingHeld(j) ? ' Nothing was charged.' : ''}`;
}
export const KEY_PREFIX = 'ohf:';
function migrateLegacyKeys() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const old = Array.from({ length: store.length }, (_, i) => store.key(i)!).filter((k) => k?.startsWith('oj:'));
      for (const k of old) { const nk = KEY_PREFIX + k.slice(3); if (store.getItem(nk) == null) store.setItem(nk, store.getItem(k)!); store.removeItem(k); }
    } catch { /* storage unavailable */ }
  }
}
if (typeof window !== 'undefined') migrateLegacyKeys();
const isActive = (j: JobState) => j.status === 'queued' || j.status === 'running';
/** How often a failed run that may still finish late (lateWatch) is re-checked. */
export const LATE_POLL_MS = 15_000;

/**
 * Track a set of jobs (versions) with 1s polling; persists ids per tool for resume.
 * All updates are functional merges by id: a refresh never drops a job it didn't fetch.
 */
/** A job that ran as an image feature (job.feature.id in shared/imageFeatures.ts): Create Image's feed shows all of them. */
const isImageFeatureJob = (j: JobState) => !!featureById(String((j as any).feature?.id ?? ''));
export function useJobs(toolId: string, opts: { history?: boolean; /** with history: list these image features ('*' = all) instead of this tool's jobs */ features?: string } = {}) {
  const key = `${KEY_PREFIX}jobs:${toolId}`;
  const [jobs, setJobs] = useState<JobState[]>([]);
  const jobsRef = useRef(jobs); jobsRef.current = jobs;
  const loaded = useRef(false);
  const toast = useToast();
  const prev = useRef(new Map<string, string>());
  // Notifications (toast + tab-title badge when a job finishes or fails).
  useEffect(() => {
    let changed = 0;
    for (const j of jobs) {
      if (!j.id) continue;
      const before = prev.current.get(j.id);
      if (before && before !== j.status && !isActive(j)) {
        changed++;
        if (j.status === 'done') { if (mayShowOnce(ONCE_DONE_TOAST)) { markShown(ONCE_DONE_TOAST); toast('Generation finished'); } }
        else if ((j.status === 'failed' || j.status === 'blocked') && !FAIL_TOASTED.has(j.id)) { FAIL_TOASTED.add(j.id); toast(failToast(j), 'error'); }
      }
      prev.current.set(j.id, j.status);
    }
    void changed; // tab-title badge + browser notification now come from the server list (shared/activeJobs)
  }, [jobs, toast]);

  const merge = useCallback((fresh: JobState[]) => {
    // PB-04: a poll that left before the cancel landed must not bring the Cancel button back. Unchanged jobs keep their object (no re-render).
    /* a job trashed elsewhere (feed Select → Delete, the viewer, Assets) comes back from ?ids= with deletedAt: it leaves this page's list for good */
    const trashed = new Set(fresh.filter(f => (f as any)?.deletedAt).map(f => f.id));
    setJobs(cur => { const m = mergeById(cur, fresh, (id, f) => isCanceling(id) && isActive(f)); return trashed.size ? m.filter(j => !trashed.has(j.id)) : m; });
  }, []);

  const sessionKey = `${KEY_PREFIX}session:${toolId}`;
  /**
   * Reopening a tool resumes only active (queued/running) jobs. Done results come back only if they were
   * seen in this browser session (sessionStorage: survives reload, not a new tab/visit). Failed and blocked cards
   * follow the same rule so a reload doesn't make them vanish; canceled jobs aren't restored. All stay in Assets.
   */
  useEffect(() => {
    const ids: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    const seen = new Set<string>(JSON.parse(sessionStorage.getItem(sessionKey) || '[]'));
    getJobs(ids).then(js => {
      const got = js.filter(j => !(j as any).deletedAt && (isActive(j) || ((j.status === 'done' || j.status === 'failed' || j.status === 'blocked') && seen.has(j.id))));
      setJobs(cur => [...cur, ...got.filter(g => !cur.some(c => c.id === g.id))]);
      loaded.current = true;
    });
  }, [key]);
  /* history: a tool whose page IS its history (Create Image's grid) loads this tool's past jobs from the server, newest first: done and failed
   * ones from any session or device (canceled runs are left out; they stay in Assets). Merged by id, so live jobs keep their fresher fields. */
  useEffect(() => {
    if (!opts.history) return; let live = true;
    listJobsPage(opts.features ? { features: opts.features, limit: 60 } : { toolId, limit: 60 }).then(({ items }) => { if (!live) return;
      const past = items.filter(j => j.status !== 'canceled');
      setJobs(cur => { const byId = new Map(cur.map(j => [j.id, j])); for (const j of past) if (!byId.has(j.id)) byId.set(j.id, j);
        return [...byId.values()].sort((a, b) => Number((b as any).createdAt ?? 0) - Number((a as any).createdAt ?? 0)); });
    }).catch(() => undefined);
    return () => { live = false; };
  }, [toolId, opts.history, opts.features]);
  useEffect(() => {
    if (!loaded.current) return; // don't overwrite saved ids before the initial load
    const ids = jobs.filter(j => j.id).map(j => j.id).slice(0, 24);
    localStorage.setItem(key, JSON.stringify(ids));
    sessionStorage.setItem(sessionKey, JSON.stringify(ids));
  }, [jobs, key, sessionKey]);

  const refresh = useCallback(async () => {
    const ids = jobsRef.current.filter(j => j.id).map(j => j.id);
    merge(await getJobs(ids));
  }, [merge]);

  // [EDGE #1] Server list wins: rebuild running jobs on mount/focus (any device), override stale local fields.
  /* features: running jobs from every image tool (Relight, Face Swap…) join the feed live, not only this tool's */
  const activeAll = useActiveJobs(opts.features ? undefined : toolId).jobs;
  const server = opts.features ? activeAll.filter(j => j.toolId === toolId || (isImageFeatureJob(j) && (opts.features === '*' || opts.features!.split(',').includes(String((j as any).feature?.id))))) : activeAll;
  const serverSig = server.map(j => `${j.id}|${j.status}|${j.progress}|${(j as any).percent}|${j.queuePos}|${(j as any).updatedAt}`).join(',');
  useEffect(() => {
    if (!server.length) return;
    setJobs(cur => {
      const merged = mergeById(cur, server);
      const missing = server.filter(s => !cur.some(c => c.id === s.id));
      return missing.length ? [...missing, ...merged] : merged;
    });
  }, [serverSig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { jobs.forEach(j => { if (j.id && isActive(j)) followJob(j); }); }, [jobs]);

  const anyActive = jobs.some(isActive);
  useEffect(() => {
    if (!anyActive) return;
    return pollWithBackoff(async () => {
      const ids = jobsRef.current.filter(j => j.id && isActive(j)).map(j => j.id);
      if (!ids.length) return null;
      const fresh = await getJobs(ids); // one request for every running job (GET /api/jobs?ids=), not one each
      merge(fresh);
      return fresh.map(jobSig).join(',');
    }, { maxMs: 4000, pauseHidden: true /* hidden tab: no per-job polls (it refreshes on return; notifications come from shared/activeJobs) */ }); // R24: a long last group (e.g. 97%) must not back the poll off so far that "done" lands late
  }, [anyActive, merge]);
  /* PB-04: Cancel patches the card at once (Canceled, no Cancel button, out of the active count); a refused cancel puts it back. */
  useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent<JobCancelDetail>).detail; if (!d?.id || d.phase === 'done') return;
    setJobs(cur => cur.map(j => j.id !== d.id ? j : d.phase === 'start' ? canceledPatch(j) : uncanceledPatch(j, d.job))); };
    window.addEventListener(JOB_CANCEL_EVT, f); return () => window.removeEventListener(JOB_CANCEL_EVT, f); }, []);
  useEffect(() => { const f = () => refresh(); window.addEventListener('ohf:jobs-changed', f); return () => window.removeEventListener('ohf:jobs-changed', f); }, [refresh]);
  /* Late-result rescue: a failed local run the server still watches (lateWatch) can turn done when ComfyUI finishes it late; poll just those, slowly. */
  const anyLate = jobs.some(j => j.id && j.status === 'failed' && j.lateWatch);
  useEffect(() => {
    if (!anyLate) return;
    const t = setInterval(async () => { if (typeof document !== 'undefined' && document.hidden) return;
      const ids = jobsRef.current.filter(j => j.id && j.status === 'failed' && j.lateWatch).map(j => j.id); if (!ids.length) return;
      merge(await getJobs(ids)); }, LATE_POLL_MS);
    return () => clearInterval(t);
  }, [anyLate, merge]);
  useEffect(() => { if (!anyActive) return; const f = () => { if (document.visibilityState === 'visible') refresh(); }; window.addEventListener('focus', f); document.addEventListener('visibilitychange', f); return () => { window.removeEventListener('focus', f); document.removeEventListener('visibilitychange', f); }; }, [anyActive, refresh]);

  return { jobs, setJobs, add: (j: JobState) => setJobs(js => [j, ...js]), refresh, clear: () => setJobs([]), active: isActive };
}
