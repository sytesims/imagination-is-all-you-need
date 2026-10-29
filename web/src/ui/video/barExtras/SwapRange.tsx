/**
 * Swap range in the Video bar (2026-10-25): the part of the clip a video-to-video workflow uses, as one "Range" chip whose popover holds the shared
 * Trim (shared/TrimRange.tsx) with the model's maximum shown. Used by Object Swap and Motion Control; any workflow with a clip can add it.
 * The range goes into the form as trimStart / trimEnd (the server cuts it before anything else: tools/videoSwap.ts applySwapTrim) and into the
 * quote as `seconds`, so the price is the range's. Cloud swaps (shared/cloudSwap.ts) also say how the range runs (passes of ≤ 10 s on Kling).
 */
import { useState } from 'react';
import type { BarExtra, BarLive } from './types';
import TrimRange, { type Trim } from '../../../shared/TrimRange';
import { BarPopover, PopSection, PopNote } from '../../../shared/BarPop';
import { tip } from '../../../shared/Tooltip';
import { ClockIcon } from '../../Icons';
import { LIMITS } from '../../../shared/limits';
import { cloudSwapOf, clampTrim, passNote, swapRangeSeconds, MOTION_GENERATION_NOTE, MOTION_AUDIO_NOTE, SEEDANCE_TASK_NOTE } from '../../../../../server/src/shared/cloudSwap';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

/** The range pieces of a bar extra (merge them into the workflow's own extra). */
export function useSwapRange(opts: { /** the workflow's own maximum (Swap Two People: 15 s) */ max?: number; motion?: boolean } = {}): Pick<BarExtra, 'form' | 'quote' | 'chips' | 'pops'> & { rangeOf: (c: BarLive) => Trim | null } {
  const [want, setWant] = useState<{ clip: string; t: Trim } | null>(null);
  const clipOf = (c: BarLive) => c.files.video?.[0] ?? null;
  const maxOf = (c: BarLive) => opts.max ?? cloudSwapOf(c.prov)?.maxTotalSec ?? LIMITS.maxSec;
  /** The range now: what you picked on this clip, fitted to the model's maximum; else from the start, as long as the model allows. */
  const rangeOf = (c: BarLive): Trim | null => { const f = clipOf(c); if (!f?.sec) return null; const w = want && want.clip === f.url ? want.t : {};
    return clampTrim(f.sec, w, maxOf(c), LIMITS.minSec); };
  return {
    rangeOf,
    form: (c): Record<string, string> => { const r = rangeOf(c); return r ? { trimStart: String(r.start), trimEnd: String(r.end) } : {}; },
    quote: (c): Record<string, string | null> => { const r = rangeOf(c); return r ? { seconds: String(swapRangeSeconds(r)) } : {}; } /* same rule as the submit (tools/videoSwap.ts) */,
    chips: c => { const r = rangeOf(c); if (!r) return null; const on = c.pop === 'g:range'; const f = clipOf(c)!; const cut = r.start > 0 || r.end < Math.floor((f.sec ?? 0) + 0.05);
      const sum = `${r.end - r.start} s`; const over = Math.floor((f.sec ?? 0) + 0.05) > maxOf(c);
      return <button key="range" ref={c.chipRef('range')} type="button" className={`ic-chip wf-grp wf-fold${on ? ' on' : ''}${over && !cut ? ' vbar-need' : ''}`} aria-haspopup="dialog" aria-expanded={on} data-testid="vbar-group-range"
        aria-label={`Range: ${fmt(r.start)} to ${fmt(r.end)}, ${sum}`} {...tip(on ? null : `Range: ${fmt(r.start)}–${fmt(r.end)} (max ${maxOf(c)} s)`)} onClick={() => c.setPop(on ? '' : 'g:range')}>
        <ClockIcon size={14} /><span className="wf-grp-l">Range</span><b>{cut ? `${fmt(r.start)}–${fmt(r.end)}` : sum}</b></button>; },
    pops: c => { const r = rangeOf(c); const f = clipOf(c); if (!r || !f) return null; const cs = cloudSwapOf(c.prov);
      return <BarPopover key="range" open={c.pop === 'g:range'} anchor={c.anchorOf('range')} avoid={c.dock} watch={c.dock} placement="top" gap={8} onClose={() => c.setPop('')} label="Range" testId="vbar-pop-range" width={380}>
        <PopSection label="Part of the clip to use" testId="vbar-range">
          <TrimRange duration={f.sec ?? 0} value={r} onChange={t => setWant({ clip: f.url, t })} max={maxOf(c)} min={LIMITS.minSec} disabled={c.busy} label={opts.motion ? 'Motion reference range' : 'Swap range'} note={cs && !opts.motion ? passNote(cs, r.end - r.start) : null} />
        </PopSection>
        <PopNote testId="vbar-range-price">The price follows the range: {r.end - r.start} s.</PopNote>
        {cs && opts.motion && <><PopNote testId="vbar-motion-generation">{MOTION_GENERATION_NOTE}</PopNote><PopNote>{MOTION_AUDIO_NOTE}</PopNote></>}
        {c.prov === 'router-seedance-25-edit' && <><PopNote>{opts.motion ? 'Output framing: adaptive (model-selected), not locked to the source.' : 'Edits the source scene: replacement and preservation are instructions, not a verified guarantee. Sound on keeps the original soundtrack; off is silent.'}</PopNote><PopNote>{SEEDANCE_TASK_NOTE}</PopNote></>}
      </BarPopover>; },
  };
}
