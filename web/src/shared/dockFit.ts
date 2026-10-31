/**
 * The Create bar's dock helpers, shared by all four pages (Image, Video, Audio, 3D):
 *  - useDockHeight: the dock's measured height as --ic-dock-h on the page root, so the feed's bottom padding never hides anything behind the dock
 *    (the bar grows upward with its prompt: shared/usePromptGrow; a feed read to its end stays at its end).
 *  - useChipFit: the chip row never clips a chip, by the shared fold rules (shared/chipFit.ts: priority, shrink before hide, stable widths).
 *    Pages only declare priorities: fitPri('keep' | 'high' | 'low') on a control, data-rank within a priority, data-fit-main="first" on a
 *    workflow's control strip (its first control is the main one and never folds). Steps, each only while the row is still too wide, with
 *    the model measured at its fixed width (data-fit-measure, --fit-model-min), so a model switch never changes what folds:
 *    1. group words drop (data-short), 2. long labels truncate (data-trunc: a group's summary, the Brand name), 3. controls fold by priority
 *    (data-fold chips into Settings: data-folded; a workflow's chips (opts.over) into ⋯: data-over; the row extras beside the chips, Brand
 *    and the eye ([data-row-fold]), into ⋯: data-row-over; shared/RowMore), then whatever fits again comes back, 4. the model's minimum
 *    gets smaller (data-squeeze), 5. last resort
 *    data-folded=all + data-tight (names truncate, chips go icon-only). Then the model takes whatever room is left, up to its full name.
 *    Every fit starts from nothing folded. Returns the folded data-fold keys for the Settings fold.
 */
import { useLayoutEffect, useState, type RefObject } from 'react';
import { dockHeightNext } from './presetBar';
import { FOLD_BUTTON_W, priOf, runFit, type FitItem } from './chipFit';

export function useDockHeight(dock: RefObject<HTMLElement | null>, rootSelector: string) {
  useLayoutEffect(() => { const d = dock.current; const r = d?.closest(rootSelector) as HTMLElement | null; if (!d || !r) return; let cur = 0;
    const set = () => { const n = dockHeightNext(cur, d.getClientRects().length ? Math.ceil(d.getBoundingClientRect().height) : 0); if (n === cur) return;
      /* the prompt grows the bar upward: a feed read to its end stays at its end (the padding grows by the same amount); shrinking needs
       * nothing, the page's own scroll clamp keeps the last row just above the bar */
      const se = document.scrollingElement; const atEnd = !!se && cur > 0 && n > cur && se.scrollHeight > se.clientHeight + 1 && se.scrollHeight - (se.scrollTop + se.clientHeight) <= 2;
      const grow = n - cur; cur = n; r.style.setProperty('--ic-dock-h', `${n}px`); if (atEnd) se!.scrollTop += grow; };
    set(); const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null; ro?.observe(d); addEventListener('resize', set);
    return () => { ro?.disconnect(); removeEventListener('resize', set); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

export type ChipFitOptions = {
  /** a second fold tier (Image: a workflow's chips, '.wf-fold'), folded into the ⋯ menu after every [data-fold] chip; sets data-over */
  over?: string;
  /** fit on mount and then on DOM changes (MutationObserver) instead of after every render: for a bar whose chips re-render on their own (Image) */
  observe?: boolean;
};

export function useChipFit(chips: RefObject<HTMLElement | null>, opts: ChipFitOptions = {}): string[] {
  const [folded, setFolded] = useState<string[]>([]);
  useLayoutEffect(() => { const c = chips.current; if (!c) return; let mo: MutationObserver | null = null; let ro: ResizeObserver | null = null;
    const fit = () => { for (const a of ['data-short', 'data-trunc', 'data-squeeze', 'data-tight', 'data-folded', 'data-over', 'data-row-over']) c.removeAttribute(a);
      const row = c.parentElement; const extras = [...(row?.querySelectorAll<HTMLElement>(':scope > [data-row-fold]') ?? [])];
      const setChips = [...c.querySelectorAll<HTMLElement>('[data-fold]')]; const tier2 = opts.over ? [...c.querySelectorAll<HTMLElement>(opts.over)].filter(e => !setChips.includes(e)) : [];
      const els = [...setChips, ...tier2, ...extras]; els.forEach(e => e.classList.remove('ic-folded'));
      if (innerWidth > 700) { const over = () => c.scrollWidth > c.clientWidth + 1; c.setAttribute('data-fit-measure', '1');
        if (over()) c.setAttribute('data-short', '1');
        if (over()) c.setAttribute('data-trunc', '1');
        if (over()) { const all = [...(row ?? c).querySelectorAll('*')];
          /* each control's kind: Settings (data-fold), the workflow's ⋯ tier, or a row extra (⋯ too) */
          type It = FitItem & { el: HTMLElement; kind: 'set' | 'over' | 'row' };
          const main = (e: HTMLElement) => { const m = e.closest<HTMLElement>('[data-fit-main="first"]'); return !!m && [...m.children].find(x => els.includes(x as HTMLElement)) === e; };
          const items: It[] = els.map(e => ({ el: e, kind: setChips.includes(e) ? 'set' : tier2.includes(e) ? 'over' : 'row', pri: main(e) ? 'keep' : priOf(e.dataset.fit), rank: Number(e.dataset.rank ?? 0), index: all.indexOf(e),
            width: e.getBoundingClientRect().width, dest: setChips.includes(e) ? 'set' : 'over' }));
          const mark = () => { const on = (k: It['kind']) => items.some(i => i.kind === k && i.el.classList.contains('ic-folded'));
            for (const [k, a] of [['set', 'data-folded'], ['over', 'data-over'], ['row', 'data-row-over']] as const) if (on(k)) c.setAttribute(a, '1'); else c.removeAttribute(a); };
          /* a fold button shows once something is in it (Settings may already show for its own options) */
          const shown = (sel: string) => [...(row ?? c).querySelectorAll<HTMLElement>(sel)].some(b => b.getClientRects().length > 0 && b.getBoundingClientRect().width >= FOLD_BUTTON_W - 1);
          runFit(items, { over, fold: (i, f) => { i.el.classList.toggle('ic-folded', f); mark(); }, destShown: i => shown(i.dest === 'set' ? '.ic-set, .vs-sq' : '.ic-over') }); }
        /* still too wide with nothing left that may fold: the model's name gets shorter (a smaller fixed minimum), then the last resort */
        if (over()) c.setAttribute('data-squeeze', '1');
        if (over()) { c.setAttribute('data-folded', 'all'); c.setAttribute('data-tight', '1'); }
        /* the room left beside the model at its minimum: it may grow by that much (up to its full name) */
        const m = c.querySelector<HTMLElement>('.ic-model'); if (m) { const end = Math.max(0, ...[...c.querySelectorAll<HTMLElement>(':scope > *, :scope :is(.ic-chip, .wf-chip, .ic-seed, .wf-after)')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect().right));
          c.style.setProperty('--fit-model-room', `${Math.max(0, Math.floor(m.getBoundingClientRect().width + c.getBoundingClientRect().right - end - 1))}px`); }
        c.removeAttribute('data-fit-measure'); }
      /* the Settings fold: the chips folded off the bar (phones: every .ic-fold chip, which CSS hides there) */
      const keys = [...c.querySelectorAll<HTMLElement>('[data-fold]')].filter(e => innerWidth > 700 ? e.classList.contains('ic-folded') : e.classList.contains('ic-fold')).map(e => e.dataset.fold!).sort();
      setFolded(f => f.join() === keys.join() ? f : keys);
      /* a preset's change hidden in a folded chip puts a dot on Settings */
      const set = c.querySelector<HTMLElement>('.ic-set'); if (set) { if (c.querySelector('.ic-folded[data-preset]') || (innerWidth <= 700 && c.querySelector('.ic-fold[data-preset]'))) set.setAttribute('data-dot', '1'); else set.removeAttribute('data-dot'); }
      mo?.takeRecords(); /* our own class edits must not re-trigger a fit */
      /* every chip's own size too (a model name, a price or a font arriving changes a chip while the row keeps its width) */
      c.querySelectorAll<HTMLElement>(':scope > *, .ic-fixed > *').forEach(e => ro?.observe(e)); };
    ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null; ro?.observe(c);
    if (opts.observe && typeof MutationObserver !== 'undefined') { mo = new MutationObserver(fit); mo.observe(c, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-preset'] }); }
    fit(); let live = true; void document.fonts?.ready.then(() => { if (live) fit(); }); return () => { live = false; ro?.disconnect(); mo?.disconnect(); };
  }, opts.observe ? [] : undefined); // eslint-disable-line react-hooks/exhaustive-deps
  return folded;
}
