/**
 * Favourites (the private heart on your own results): ONE source of truth on this page for every heart (the result viewer's header,
 * Assets' hover heart, ⋯ menu and bulk bar, the feeds' Select bar). Root cause of "the heart is empty when I open it again"
 * (2026-10-26): the viewer's heart kept its own useState, so the feed's cached job (favourite: false) came back on reopen.
 *
 * - `favOf(job)`: what a heart shows: this page's latest choice for that id, else the job's own `favourite` from the server.
 * - `toggleFavourite / saveFavourite`: optimistic (every heart flips at once), saved with POST /api/jobs/:id/favourite {on}, one request
 *   at a time per id (a rapid double click ends on the last click), rolled back to the last saved value if the save fails.
 * - Saved changes tell the feeds to reload (`ohf:jobs-changed`, so Liked / Favourites lists add or drop it) and the other tabs of this app
 *   (BroadcastChannel), which show the new value at once.
 */
import { useSyncExternalStore } from 'react';
import { setFavourite as postFavourite } from '../api';

type Toast = (msg: string, kind?: 'success' | 'info' | 'warn' | 'error') => void;
const shown = new Map<string, boolean>(); /* this page's latest value per id (wins over a cached job object) */
const saved = new Map<string, boolean>(); /* the last value the server confirmed (or the job's own value before the first click) */
const chain = new Map<string, Promise<unknown>>(); const pending = new Map<string, number>();
const subs = new Set<() => void>(); let version = 0;
const emit = () => { version++; subs.forEach(f => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const CH = 'ohf-favourites';
const bc: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CH) : null;
bc?.addEventListener('message', (e: MessageEvent) => { const d = e.data as { ids?: string[]; on?: boolean }; if (!Array.isArray(d?.ids) || typeof d.on !== 'boolean') return;
  for (const id of d.ids) if (!pending.get(id)) { shown.set(id, d.on); saved.set(id, d.on); }
  emit(); if (typeof window !== 'undefined') window.dispatchEvent(new Event('ohf:jobs-changed')); });

/** What the heart shows for this job. */
export const favOf = (job: { id?: string | null; favourite?: boolean | null } | null | undefined): boolean =>
  !!job && (job.id && shown.has(job.id) ? shown.get(job.id)! : !!job.favourite);

/** Re-render when any heart changes (a list that shows hearts or filters by them calls this once). */
export function useFavourites(): number { return useSyncExternalStore(subscribe, () => version, () => version); }

/** Record a change the server already made (bulk Like in a Select bar): every heart shows it, the other tabs too. */
export function noteFavourites(ids: string[], on: boolean) { for (const id of ids) { shown.set(id, on); saved.set(id, on); } emit(); bc?.postMessage({ ids, on }); }

/** Set one result's favourite. Resolves true when saved; on failure every heart goes back and `toast` gets a short error. */
export function saveFavourite(job: { id: string; favourite?: boolean | null }, on: boolean, toast?: Toast, opts: { quiet?: boolean } = {}): Promise<boolean> {
  const id = job.id; if (!saved.has(id)) saved.set(id, favOf(job));
  shown.set(id, on); pending.set(id, (pending.get(id) ?? 0) + 1); emit();
  const run = (chain.get(id) ?? Promise.resolve()).then(async () => {
    try { await postFavourite(id, on); saved.set(id, on); return true; }
    catch (e: any) { if ((pending.get(id) ?? 0) <= 1) { shown.set(id, saved.get(id) ?? false); emit(); toast?.(`Couldn’t update Favourites: ${e?.message || 'try again'}`, 'error'); } return false; }
    finally { const n = (pending.get(id) ?? 1) - 1; if (n > 0) pending.set(id, n); else pending.delete(id); }
  }).then(ok => {
    if (ok && !pending.get(id)) { /* the last click for this id has landed: tell the lists and the other tabs once */
      if (!opts.quiet) toast?.(on ? 'Added to Favourites' : 'Removed from Favourites');
      bc?.postMessage({ ids: [id], on }); if (typeof window !== 'undefined') window.dispatchEvent(new Event('ohf:jobs-changed')); }
    return ok; });
  chain.set(id, run); return run;
}
export const toggleFavourite = (job: { id: string; favourite?: boolean | null }, toast?: Toast) => saveFavourite(job, !favOf(job), toast);

/** One heart's state and toggle (the result viewer). */
export function useFavourite(job: { id: string; favourite?: boolean | null }, toast?: Toast) {
  useFavourites(); const on = favOf(job);
  return { on, toggle: () => void toggleFavourite(job, toast), label: on ? 'Remove from Favourites' : 'Add to Favourites' };
}

/** Tests only: forget every value. */
export function _resetFavourites() { shown.clear(); saved.clear(); chain.clear(); pending.clear(); emit(); }
