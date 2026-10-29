/**
 * The Create bar's dock helpers, shared by all four pages (Image, Video, Audio, 3D):
 *  - useDockHeight: the dock's measured height as --ic-dock-h on the page root, so the feed's bottom padding never hides anything behind the dock
 *    (the bar grows upward with its prompt: shared/usePromptGrow; a feed read to its end stays at its end).
 *  - useChipFit: the chip row never clips a chip. Steps: 1. group words drop (data-short), 1b. the row extras beside the chips (Brand, then
 *    the eye: [data-row-fold], lowest data-rank first) fold into "···" (data-row-over; shared/RowMore), so the model keeps its name, 2. the model name truncates (data-trunc),
 *    3. chips marked data-fold fold into Settings (lowest data-rank first; DOM order breaks ties, last first), each given back when it fits,
 *    4. a second tier (opts.over, Image's workflow chips) folds into the ⋯ menu (data-over), 5. last resort data-folded=all + data-tight
 *    (names truncate, chips go icon-only). Returns the folded data-fold keys for the Settings fold.
 */
import { useLayoutEffect, useState, type RefObject } from 'react';
import { dockHeightNext } from './presetBar';

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
    const fit = () => { for (const a of ['data-short', 'data-trunc', 'data-tight', 'data-folded', 'data-over', 'data-row-over']) c.removeAttribute(a);
      const extras = [...(c.parentElement?.querySelectorAll<HTMLElement>(':scope > [data-row-fold]') ?? [])].sort((a, b) => Number(a.dataset.rank ?? 0) - Number(b.dataset.rank ?? 0));
      extras.forEach(e => e.classList.remove('ic-folded'));
      /* the last in this list folds first: by data-rank (higher stays longer), then DOM order */
      const all = [...c.querySelectorAll<HTMLElement>('[data-fold]')].map((e, i) => [e, i] as const).sort((a, b) => Number(b[0].dataset.rank ?? 0) - Number(a[0].dataset.rank ?? 0) || a[1] - b[1]).map(x => x[0]);
      const tier2 = opts.over ? [...c.querySelectorAll<HTMLElement>(opts.over)].filter(e => !all.includes(e)) : [];
      [...all, ...tier2].forEach(e => e.classList.remove('ic-folded'));
      if (innerWidth > 700) { const over = () => c.scrollWidth > c.clientWidth + 1;
        if (over()) c.setAttribute('data-short', '1');
        for (const e of extras) { if (!over()) break; e.classList.add('ic-folded'); c.setAttribute('data-row-over', '1'); }
        if (over()) c.setAttribute('data-trunc', '1');
        for (let i = all.length - 1; i >= 0 && over(); i--) { all[i].classList.add('ic-folded'); c.setAttribute('data-folded', '1'); }
        /* then give back what fits, highest priority first (folding a small chip may only swap it for Settings, so a wider one may be the one to go) */
        for (const e of all) if (e.classList.contains('ic-folded')) { e.classList.remove('ic-folded'); if (!all.some(x => x.classList.contains('ic-folded'))) c.removeAttribute('data-folded');
          if (over()) { e.classList.add('ic-folded'); c.setAttribute('data-folded', '1'); } }
        if (over() && tier2.length) { c.setAttribute('data-over', '1'); for (let i = tier2.length - 1; i >= 0 && over(); i--) tier2[i].classList.add('ic-folded'); }
        if (over()) { c.setAttribute('data-folded', 'all'); c.setAttribute('data-tight', '1'); } }
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
