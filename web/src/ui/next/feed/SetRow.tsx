/**
 * A set in a tab feed (2026-11-01: Compare models, Material Swap's swatches; later audio takes or video variations): ONE component that draws it
 * open (its header row and every card, the look #68 settled) or folded into one tile-sized card (a small fanned stack of its pictures, a count
 * badge, its name underneath, and its progress while it runs). The fold chevron sits at the end of the open header; clicking the folded card
 * opens it again. What starts open (feedLayout setOpenByDefault) and the reader's own choice per set (useSetFold, kept in this browser) live
 * beside it. Used by the Image and Video feeds (feedLayout feedSections gives each set's section).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from '../../Icons';
import { gridSrc } from '../../../shared/thumbs';
import { tip } from '../../../shared/Tooltip';
import { parseSetFold, withSetFold, setOpenByDefault, setProgress, setWords, SET_FOLD_KEY, type SetInfo } from './feedLayout';

const read = (): Record<string, boolean> => { try { return parseSetFold(localStorage.getItem(SET_FOLD_KEY)); } catch { return {}; } };
const subs = new Set<(m: Record<string, boolean>) => void>(); let mem: Record<string, boolean> | null = null;
const save = (m: Record<string, boolean>) => { mem = m; try { localStorage.setItem(SET_FOLD_KEY, JSON.stringify(m)); } catch { /* private window: this visit only */ } subs.forEach(f => f(m)); };

/** The reader's open / folded choice per set (shared by every feed on the page and kept in this browser), on top of the default rule. */
export function useSetFold() {
  const [m, setM] = useState<Record<string, boolean>>(() => (mem ??= read()));
  useEffect(() => { subs.add(setM); return () => { subs.delete(setM); }; }, []);
  const isOpen = useCallback((id: string, info: SetInfo) => m[id] ?? setOpenByDefault(info), [m]);
  const setOpen = useCallback((ids: string[], open: boolean) => save(withSetFold(mem ?? m, ids, open)), [m]);
  return { isOpen, setOpen };
}

type SetJob = { id: string; status: string; compare?: { id?: string; n?: number; i?: number; kind?: string } | null; resultUrl?: string | null };
export interface SetRowProps<J extends SetJob> {
  id: string; jobs: J[]; open: boolean; onToggle: (open: boolean) => void;
  /** the open row's header; `fold` is the chevron to put at its end (beside "Side by side") */ head: (fold: ReactNode) => ReactNode;
  /** the open row's cards */ children: ReactNode;
  /** a member's picture for the folded stack (null while it runs or when it failed) */ thumbOf: (j: J) => string | null;
  testId?: string;
}

/** One set: open (header + cards) or folded (one card). Focus follows the toggle: chevron → folded card, folded card → chevron. */
export function SetRow<J extends SetJob>({ id, jobs, open, onToggle, head, children, thumbOf, testId }: SetRowProps<J>) {
  const words = setWords(jobs); const pr = setProgress(jobs); const running = pr.running > 0;
  const rowId = `set-${id}`; const moved = useRef(false); const chev = useRef<HTMLButtonElement>(null); const card = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!moved.current) return; moved.current = false; (open ? chev : card).current?.focus({ preventScroll: true }); }, [open]);
  const toggle = (to: boolean) => { moved.current = true; onToggle(to); };
  if (open) {
    const fold = <button ref={chev} type="button" className="fd-btn fd-sq set-fold" aria-expanded="true" aria-controls={rowId} aria-label={`Fold this set into one card (${words.count})`} data-testid="set-fold" onClick={() => toggle(false)} {...tip('Fold into one card')}><ChevronDownIcon size={15} /></button>;
    return <div className="cmp-g" id={rowId} data-testid={testId ?? `cmp-group-${id}`} data-set={id} data-open="1">{head(fold)}<div className="cmp-g-row">{children}<i className="ic-jfill" aria-hidden /></div></div>;
  }
  /* the stack: the first three pictures there are (finished ones first), the rest as soft placeholders */
  const pics = jobs.map(thumbOf).filter((u): u is string => !!u); const stack: (string | null)[] = [...pics.slice(0, 3)]; while (stack.length < Math.min(3, Math.max(2, words.n))) stack.push(null);
  const status = running ? `${pr.done} of ${pr.total} done` : pr.failed ? `${pr.failed} failed` : pr.done < pr.total ? `${pr.done} of ${pr.total}` : null;
  const what = String((jobs.find(j => j.id) as any)?.input?.prompt ?? '').trim(); /* the set's words (the object, the prompt) under its name */
  const label = `${words.title}, ${words.count}${status ? `, ${status}` : ''}. Open the set`;
  return <div className={`ic-tile set-card${running ? ' is-running' : ''}`} style={{ ['--ar' as any]: '1.25' }} id={rowId} data-testid={testId ?? `cmp-group-${id}`} data-set={id} data-open="0">
    <button ref={card} type="button" className="ic-tile-hit set-card-hit" aria-expanded="false" aria-controls={rowId} aria-label={label} data-testid="set-card" onClick={() => toggle(true)}>
      <span className={`set-fan n${stack.length}`} aria-hidden>{stack.map((u, k) => <span key={k} className={`set-fan-i${u ? '' : ' off'}`} style={{ ['--k' as any]: String(k - (stack.length - 1) / 2) }}>{u ? <img src={gridSrc(u, 240)} alt="" loading="lazy" decoding="async" /> : null}</span>)}</span>
    </button>
    <span className="set-badge" data-testid="set-count" aria-hidden><b>{words.n}</b>{words.count.replace(/^\d+\s*/, '')}</span>
    <span className="set-open" aria-hidden><ChevronDownIcon size={14} /></span>
    <span className="feed-cap set-cap" aria-hidden><b>{words.title}</b>{(status || what) && <span>{status ?? what}</span>}</span>
    {running && <span className="set-bar" aria-hidden><i style={{ width: `${Math.round((pr.done / Math.max(1, pr.total)) * 100)}%` }} /></span>}
  </div>;
}
