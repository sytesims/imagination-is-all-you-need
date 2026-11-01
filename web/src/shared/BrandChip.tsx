/**
 * "Brand: <name>" (2026-10-27): the chip in the Image, Video and Audio bars. On, the server adds the active brand's words after your prompt
 * (shared/brandKit brandPhrase; the eye beside it shows the exact text). Its menu switches between your brands in one click, or Off, and has
 * "Manage brands…" and "+ New brand" (Assets › Brands). Hidden for tools that don't take brand words (a picked workflow, a voiceover).
 * The model and the price never change. On a short bar an active Brand never folds (its name truncates); off, it is one of the first to fold.
 */
import { useRef, useState, type RefObject } from 'react';
import { Popover } from './Popover';
import { rowAnchor } from './RowMore';
import { fitPri } from './chipFit';
import { tip } from './Tooltip';
import { Link } from '../platform/router';
import { activeKit, setActiveKit, setBrandOn, useBrand } from './brandStore';
import { BRAND_OWN_WORDS, brandMediaFor, brandPhrase, logoFor } from '../../../server/src/shared/brandKit';
import './brandChip.css';

/** A few dots of the kit's colours (the chip's icon). */
export function KitDots({ colors, size = 10 }: { colors: { hex: string }[]; size?: number }) {
  const cs = colors.slice(0, 4);
  return <span className="bk-dots" aria-hidden style={{ ['--d' as any]: `${size}px` }}>{cs.length ? cs.map((c, i) => <i key={i} style={{ background: c.hex }} />) : <i className="bk-dot-empty" />}</span>;
}

export function BrandChip({ toolId, mode, watch }: { toolId: string; mode?: string | null; watch?: RefObject<HTMLElement | null> }) {
  const s = useBrand(); const [open, setOpen] = useState(false); const [err, setErr] = useState(''); const btn = useRef<HTMLButtonElement>(null);
  const media = brandMediaFor(toolId, mode ?? null); const kit = activeKit(s);
  if (!media || !s.loaded || !kit) return null;
  const on = s.on[media]; const own = BRAND_OWN_WORDS.has(toolId); /* Ad Pack words the kit itself and adds its logo */
  const phrase = own ? (logoFor(kit, 'main') ? 'Its colours and type feel in the ad, and its logo in the corner' : 'Its colours and type feel in the ad (no logo yet)') : brandPhrase(kit, media);
  const pick = (id: string | null) => { setErr(''); if (!id) { setBrandOn(media, false); return; } if (id !== kit.id) setActiveKit(id).catch(e => setErr(String(e.message))); setBrandOn(media, true); };
  return <>
    <button ref={btn} type="button" className={`ic-chip bk-chip${on ? ' on' : ''}${on && !phrase ? ' bk-chip-empty' : ''}`} data-testid="bk-chip" data-row-fold="brand" {...fitPri(on ? 'keep' : 'low')} data-fit-state={on ? 'On' : 'Off'} aria-haspopup="menu" aria-expanded={open}
      aria-label={on ? `Brand: ${kit.name}` : 'Brand: off'} {...tip(open ? null : on ? (phrase ? `Adds: ${phrase}` : `${kit.name} has nothing to add yet`) : 'Use one of your brands')} onClick={() => setOpen(o => !o)}>
      {on ? <KitDots colors={kit.colors} /> : <KitDots colors={[]} />}<span className="bk-chip-l">{on ? kit.name : 'Brand'}</span></button>
    <Popover open={open} anchor={rowAnchor(btn)} avoid={watch} watch={watch} gap={8} align="start" onClose={() => setOpen(false)} label="Brand" testId="bk-pop" className="bk-pop">
      <div className="bk-pop-in">
        <div className="bk-pop-h">{own ? 'Brand (colours, type and logo)' : media === 'audio' ? 'Brand (adds its mood words)' : 'Brand (adds its colours and mood)'}</div>
        <div className="bk-kits" role="radiogroup" aria-label="Brand">
          <button type="button" role="radio" aria-checked={!on} className="bk-kit" data-testid="bk-off" onClick={() => pick(null)}><KitDots colors={[]} size={12} /><span className="bk-kit-n">Off</span>{!on && <span className="bk-tick" aria-hidden>✓</span>}</button>
          {s.kits.map(k => { const sel = on && k.id === kit.id; return <button key={k.id} type="button" role="radio" aria-checked={sel} className="bk-kit" data-testid={`bk-kit-${k.id}`} onClick={() => pick(k.id)}>
            <KitDots colors={k.colors} size={12} /><span className="bk-kit-n">{k.name}</span>{sel && <span className="bk-tick" aria-hidden>✓</span>}</button>; })}
        </div>
        {on && <><div className="bk-pop-h">{own ? 'What it adds' : 'Added to your prompt'}</div>
          <p className={`bk-phrase${phrase ? '' : ' bk-phrase-none'}`} data-testid="bk-phrase">{phrase || `${kit.name} has no colours or mood yet, so nothing is added.`}</p></>}
        {err && <p className="bk-err" role="alert">{err}</p>}
        <div className="bk-pop-foot">
          <Link to="/assets/brands" className="bk-edit" data-testid="bk-manage" onClick={() => setOpen(false)}>Manage brands…</Link>
          <Link to="/assets/brands?new=1" className="bk-edit" data-testid="bk-new-brand" onClick={() => setOpen(false)}>+ New brand</Link>
        </div>
        <small className="bk-pop-note">Same model, same price.</small>
      </div>
    </Popover></>;
}
