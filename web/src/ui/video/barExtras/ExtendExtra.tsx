/** Extend in the Video bar (2026-10-27): on H3 Extend (its preferred place is H3 Extend · Comfy Cloud, one segment per run, chained by extending the
 *  result) a "Take" chip shows the length the clip will have after this segment, with the calm tips for seamless joins in its popover. A clip
 *  brought in while the prompt is empty pre-fills the next-segment words. The price is on the Extend button (the quote of the picked place). */
import { useEffect, useState } from 'react';
import type { UseBarExtra } from './types';
import { BarPopover, PopSection, PopNote } from '../../../shared/BarPop';
import { tip } from '../../../shared/Tooltip';
import { ExtendIcon } from '../../Icons';
import { H3X_ENGINE, H3X_ROUTE_ID, H3X_PROMPT_PREFIX, H3X_TIPS, H3X_MAX_TOTAL, H3X_CONTEXT_FRAMES } from '../../../../../server/src/shared/h3ExtendCloud';

const secs = (s: number) => `${Math.round(s * 10) / 10} s`;

type PlaceState = { available: boolean; reason: string; credits: number | null } | null;
/** H3 Extend · Comfy Cloud's own state for this length and size (GET /api/routes, the same rule the run uses): ready, or why not (no key, price not
 *  measured yet, a length it can't make), so the popover says it plainly instead of a failing button. */
function useCloudPlace(seconds: string, resolution: string): PlaceState {
  const [st, setSt] = useState<PlaceState>(null);
  useEffect(() => { const ac = new AbortController();
    const q = new URLSearchParams({ toolId: 'h3-extend', modelId: H3X_ENGINE, extendSeconds: seconds, resolution, mode: 'extend' });
    fetch(`/api/routes?${q}`, { signal: ac.signal }).then(r => r.ok ? r.json() : null).then(d => { const r = (d?.routes ?? []).flatMap((m: any) => m.routes ?? []).find((x: any) => x.routeId === H3X_ROUTE_ID);
      setSt(r ? { available: !!r.available, reason: String(r.reason ?? ''), credits: typeof r.credits === 'number' ? r.credits : null } : null); }).catch(() => undefined);
    return () => ac.abort(); }, [seconds, resolution]);
  return st;
}

export const useExtendExtra: UseBarExtra = (c0) => { const place = useCloudPlace(c0.vals.extendSeconds ?? '5', c0.vals.resolution ?? '768p'); return {
  chipsAfter: 'length',
  /* a clip lands while the prompt is empty: start the next segment's words (you type what happens next after the colon) */
  onSlot: (s, _f, c) => { if (s.name === 'video' && c.prov === H3X_ENGINE && !c.prompt.trim()) c.setPrompt(H3X_PROMPT_PREFIX); },
  chips: c => { if (c.prov !== H3X_ENGINE) return null; const src = c.files.video?.[0]?.sec; const add = Number(c.valOf('extendSeconds')) || 0; const on = c.pop === 'g:take';
    const total = src ? src + add : null; const over = total != null && total > H3X_MAX_TOTAL + 0.5;
    return <button key="take" ref={c.chipRef('take')} type="button" className={`ic-chip wf-grp wf-fold${on ? ' on' : ''}${over ? ' vbar-need' : ''}`} aria-haspopup="dialog" aria-expanded={on} data-testid="vbar-group-take"
      aria-label={total != null ? `Take: ${secs(src!)} + ${add} s = ${secs(total)}` : 'Take: tips for a clean join'} {...tip(on ? null : total != null ? `After this segment the take is ${secs(total)}` : 'Tips for a seamless extend')} onClick={() => c.setPop(on ? '' : 'g:take')}>
      <ExtendIcon size={14} /><span className="wf-grp-l">Take</span><b>{total != null ? `= ${secs(total)}` : 'Tips'}</b></button>; },
  pops: c => { if (c.prov !== H3X_ENGINE) return null; const src = c.files.video?.[0]?.sec; const add = Number(c.valOf('extendSeconds')) || 0;
    return <BarPopover key="take" open={c.pop === 'g:take'} anchor={c.anchorOf('take')} avoid={c.dock} watch={c.dock} placement="top" gap={8} onClose={() => c.setPop('')} label="Take" testId="vbar-pop-take" width={340}>
      <PopSection label="This segment" testId="vbar-take-length">
        <p className="vbar-take-sum">{src ? <>{secs(src)} + {add} s = <b>{secs(src + add)}</b></> : <>Add a clip to see the take's length.</>}</p>
      </PopSection>
      <PopSection label="For a clean join" testId="vbar-take-tips">
        <ul className="vbar-take-tips">{H3X_TIPS.map(t => <li key={t}>{t}</li>)}</ul>
      </PopSection>
      {place && <PopSection label="H3 Extend · Comfy Cloud" testId="vbar-take-place">
        <p className={`vbar-take-place${place.available ? '' : ' off'}`}>{place.available ? <>Ready{place.credits != null ? <> · ≈ ${(place.credits / 100).toFixed(2)} for this segment</> : null}</> : <>Can’t run this yet. {place.reason.replace(/\.$/, '')}.</>}</p>
      </PopSection>}
      <PopNote testId="vbar-take-note">The model sees and hears the last {H3X_CONTEXT_FRAMES} frames of your clip and keeps going. Extend the result again for a longer take (up to {H3X_MAX_TOTAL} s).</PopNote>
    </BarPopover>; },
}; };
