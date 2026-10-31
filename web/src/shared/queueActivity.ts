import { useEffect, useState } from 'react';
import type { JobState } from '../api';
import { compositeCostText, runPrice, ownAccountsNow } from './billing';
import { runOnLabel, runOnOfRoute } from './models';

/**
 * TRANSPARENCY-PLAN 4i: one shared progress story for the generating tile and the queue activity pill.
 * The server sends `progressInfo` on every job and on every GET /api/queue/activity item (server/src/progress.ts); this file turns it into
 * the one label, the 3-segment stepper and the place/price chip, and keeps one poll of /api/queue/activity for every pill and tile on the page.
 */
export type ProgressStage = 'queued' | 'loading' | 'generating' | 'finishing' | 'done' | 'failed' | 'canceled';
export interface ProgressInfo { stage: ProgressStage; step?: number; steps?: number; percent?: number; etaSeconds?: number; queuePosition?: number; /** why it waits (server queue lanes, a busy provider) */ queueReason?: string; previewUrl?: string; previewAt?: number; source?: string }
export interface ActivityPrice { free: boolean; usd: number | null; credits: number; estimated: boolean; sample: boolean }
export interface ActivityItem { id: string; toolId: string; state: 'running' | 'waiting'; title: string; model: string | null; place: { runOn: string | null; label: string }; price: ActivityPrice; progress: ProgressInfo; queuePosition: number | null; createdAt: number; startedAt: number | null; /** a cancel will succeed now (server-exact) */ cancellable?: boolean; /** the run lane it runs or waits in (server queue.ts laneOf) */ lane?: Lane | null; /** why it waits, plain words */ queueReason?: string | null }
export type Lane = 'local' | 'cloud';
export interface LaneView { running: number; waiting: number; limit: number }
export interface Activity { running: number; waiting: number; concurrency: number; maxQueued: number; at: number; items: ActivityItem[]; /** the two run lanes (2026-10-25) */ lanes?: Record<Lane, LaneView> }
/** Which lane an item is in: the server says; older servers: by where it runs. */
export const laneOfItem = (it: Pick<ActivityItem, 'lane' | 'place'>): Lane => it.lane ?? (it.place?.runOn === 'local' ? 'local' : 'cloud');

/* ------------------------------------------------------------------ progress words */
/** A job's shared progress: the server's progressInfo, or one derived from the older fields (older servers, optimistic patches). */
export function progressOfJob(j: JobState | any): ProgressInfo {
  const st = String(j?.status ?? '');
  if (st === 'canceled' || j?.state === 'canceled') return { stage: 'canceled' }; // the optimistic Canceled patch wins over a stale progressInfo
  const p: ProgressInfo | undefined = j?.progressInfo;
  if (p && p.stage) return p;
  if (st === 'done') return { stage: 'done', percent: 100 };
  if (st === 'failed' || st === 'blocked') return { stage: 'failed' };
  if (st === 'queued') return { stage: 'queued', ...(Number(j.queuePos) > 0 ? { queuePosition: Number(j.queuePos) } : {}), ...(j.queueReason ? { queueReason: String(j.queueReason) } : {}) };
  const s = String(j?.stage ?? '');
  if (/downloading_model|loading_model/.test(s)) return { stage: 'loading' };
  if (/^(downloading|muxing|encoding)$/.test(s)) return { stage: 'finishing' };
  const pct = Number(j?.percent ?? j?.progress); return { stage: 'generating', ...(pct > 0 ? { percent: pct } : {}) };
}
export const isLiveStage = (s: ProgressStage) => s === 'loading' || s === 'generating' || s === 'finishing';
/** "starts next" / "starts after 2 jobs" for a waiting job at position n (1 = next to start). */
export const startsText = (n?: number | null) => (!n || n <= 1 ? 'starts next' : `starts after ${n - 1} job${n - 1 > 1 ? 's' : ''}`);
/** The ONE label: "Loading the model", "Generating · step 3 of 4", "Finishing", "Queued · #2 · starts after 1 job". */
export function progressLabel(p: ProgressInfo): string {
  switch (p.stage) {
    case 'queued': return p.queuePosition ? `Queued · #${p.queuePosition} · ${p.queueReason ?? startsText(p.queuePosition)}` : p.queueReason ? `Queued · ${p.queueReason}` : 'Queued'; // queueReason (2026-10-25): which lane it waits for, or a busy provider
    case 'loading': return 'Loading the model';
    case 'generating': return p.steps && p.step != null ? `Generating · step ${Math.max(1, p.step)} of ${p.steps}` : 'Generating';
    case 'finishing': return 'Finishing';
    case 'done': return 'Done';
    case 'failed': return 'Failed';
    case 'canceled': return 'Canceled';
  }
}
/** "~18 s" / "~3 min"; '' when there is no ETA (never a guess). */
export const etaText = (s?: number | null) => (s == null || !(s > 0) ? '' : s < 90 ? `~${Math.max(1, Math.round(s))} s` : `~${Math.round(s / 60)} min`);
/** 0..1 for the active segment, or null when the stage can't say how far along it is (an indeterminate fill). */
export function stageFill(p: ProgressInfo): number | null {
  if (p.stage === 'generating') { if (p.steps && p.step != null) return Math.max(0, Math.min(1, p.step / p.steps)); if (p.percent != null && p.percent > 0) return Math.max(0, Math.min(1, p.percent / 100)); return null; }
  return null;
}
export const STEPS: [ProgressStage, string][] = [['loading', 'Loading'], ['generating', 'Generating'], ['finishing', 'Finishing']];
/** Index of the active segment: -1 queued, 0 loading, 1 generating, 2 finishing, 3 all done. */
export const stepIndex = (s: ProgressStage) => (s === 'loading' ? 0 : s === 'generating' ? 1 : s === 'finishing' ? 2 : s === 'done' ? 3 : -1);
/** Overall 0..1 for the small ring / thin bar: each segment is a third. null when nothing is known yet. */
export function overallFill(p: ProgressInfo): number | null {
  const i = stepIndex(p.stage); if (i < 0) return null; if (i >= 3) return 1;
  const f = stageFill(p); return (i + (f ?? 0)) / 3;
}
/** How sharp the live preview is: 18px blur at the start → 2px near the end. */
export const previewBlur = (p: ProgressInfo) => { const f = p.steps && p.step != null ? p.step / p.steps : (p.percent ?? 0) / 100; return Math.round((18 - 16 * Math.max(0, Math.min(1, f))) * 10) / 10; };

/* ------------------------------------------------------------------ place + price */
export type PlaceKind = 'gpu' | 'comfy' | 'api';
export const placeKind = (runOn?: string | null): PlaceKind => (runOn === 'local' ? 'gpu' : runOn === 'comfy-cloud' || runOn === 'comfy-router' ? 'comfy' : 'api');
/** "Free", "≈ $0.08" (any place; team mode "$0.08"), "Sample" (nothing runs for real): billing.ts runPrice,
 *  the Generate button's words (QA #7). */
export function priceText(pr: ActivityPrice | null | undefined, own = ownAccountsNow(), runOn: string | null = null): string {
  if (!pr) return '';
  if (pr.free) return 'Free';
  const place = runOn === 'local' ? null : runOn;
  if (own && pr.usd != null && pr.usd > 0) return runPrice({ own, usd: pr.usd, runOn: place }) ?? '';
  if (pr.credits > 0) return runPrice({ own, credits: pr.credits, runOn: place }) ?? '';
  return pr.sample ? 'Sample' : '';
}
/** Place + price for a job: the activity item when there is one (it carries the spend estimate), else the job's own fields. */
export function placeOf(j: any, item?: ActivityItem | null): { kind: PlaceKind; label: string; price: string; sample: boolean } {
  const runOn: string | null = item?.place?.runOn ?? j?.place?.runOn ?? j?.runOn ?? runOnOfRoute(j?.route ?? null);
  const label = runOnLabel(runOn) || String(item?.place?.label ?? j?.place?.label ?? '').split(' · ')[0] || '';
  const pr: ActivityPrice | null = item?.price ?? (j ? { free: runOn === 'local' || (!(Number(j.cost) > 0) && !!j.free), usd: null, credits: Number(j.cost) || 0, estimated: true, sample: !!j.isSample } : null);
  return { kind: placeKind(runOn), label, price: compositeCostText(j ?? { toolId: item?.toolId, simulated: item?.price.sample }) ?? priceText(pr, ownAccountsNow(), runOn), sample: !!pr?.sample };
}

/* ------------------------------------------------------------------ one shared poll of /api/queue/activity */
const EMPTY: Activity = { running: 0, waiting: 0, concurrency: 2, maxQueued: 20, at: 0, items: [] };
let cur: Activity | null = null; let timer: ReturnType<typeof setTimeout> | null = null; let inflight = false;
const subs = new Set<() => void>(); const wants = new Map<symbol, boolean>();
const POLL_MS = 1500; const HIDDEN_MS = 5000;
const busy = (a: Activity | null) => !!a && a.running + a.waiting > 0;
const wanted = () => [...wants.values()].some(Boolean) || busy(cur);
/** Nothing a tile or the pill shows changed (only the snapshot's time): no re-render of every subscriber. */
export const sameActivity = (a: Activity, b: Activity) => JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 });
async function tick() {
  timer = null; if (inflight) return; inflight = true;
  try { const r = await fetch('/api/queue/activity', { cache: 'no-store' }); if (r.ok) { const next: Activity = await r.json(); const same = !!cur && sameActivity(cur, next); cur = next; if (!same) subs.forEach(f => f()); } } catch { /* offline: keep the last snapshot */ }
  finally { inflight = false; schedule(); }
}
function schedule() { if (timer || inflight || !subs.size || !wanted()) return; timer = setTimeout(tick, typeof document !== 'undefined' && document.hidden ? HIDDEN_MS : POLL_MS); }
/** Fetch now (a job started or was canceled), then keep polling while something runs or waits. */
export function kickActivity() { if (timer) { clearTimeout(timer); timer = null; } if (subs.size) void tick(); }
if (typeof window !== 'undefined') { addEventListener('ohf:jobs-changed', () => kickActivity()); addEventListener('focus', () => { if (wanted()) kickActivity(); }); }
/** Drop a job from the snapshot at once (optimistic cancel); the next poll reconciles. */
export function dropFromActivity(id: string) {
  if (!cur) return; const items = cur.items.filter(i => i.id !== id); if (items.length === cur.items.length) return;
  const running = items.filter(i => i.state === 'running').length; cur = { ...cur, items, running, waiting: items.length - running }; subs.forEach(f => f());
}
/**
 * The live activity snapshot. `want`: this caller needs fresh data (something it shows runs or waits, or its popover is open). Polling runs
 * every ~1.5 s while anyone wants it or the last snapshot still has jobs, and stops when idle.
 */
export function useQueueActivity(want: boolean): Activity | null {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump(n => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  useEffect(() => { const k = Symbol('activity'); wants.set(k, want); if (want && !timer && !inflight) { if (!cur || !busy(cur)) void tick(); else schedule(); } return () => { wants.delete(k); }; }, [want]);
  return cur;
}
export const activityItem = (a: Activity | null, id?: string | null) => (a && id ? a.items.find(i => i.id === id) ?? null : null);
export const emptyActivity = EMPTY;
