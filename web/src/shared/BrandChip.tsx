/**
 * The Brand chip (2026-10-27; reworked 2026-11-01) in the Image, Video and Audio bars and on Ad Pack. On, the server adds the active brand's
 * words after your prompt (shared/brandKit brandPhrase; the panel shows the exact text). Brand apps word the kit themselves (BRAND_APPS): Ad Pack
 * also adds its logo; Product Shot, Phone Photo and UGC Ad put its colours and mood on their scene (BRAND_SCENE + brandSceneWords, shown in the panel).
 * The chip shows the active kit's logo (or its colour dots when it has none) and its name. Its panel says in one line what Brand does here, then lists every kit as a
 * small card (logo, name, colour dots), "None" first, the picked one ticked, and "New brand kit…" / "Manage brands". Arrow keys move between cards.
 * On Ad Pack the chip is always there (never folds into "…", even off or with no kit yet); elsewhere an active Brand never folds and an
 * unused one is among the first to fold. Hidden for tools that don't take brand words (a picked workflow, a voiceover).
 * The model and the price never change.
 */
import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Popover } from './Popover';
import { rowAnchor } from './RowMore';
import { fitPri } from './chipFit';
import { tip } from './Tooltip';
import { Link } from '../platform/router';
import { activeKit, setActiveKit, setBrandOn, useBrand } from './brandStore';
import { BRAND_LOGO_APPS, BRAND_OWN_WORDS, BRAND_SCENE, brandMediaFor, brandPhrase, brandSceneWords, logoFor, type BrandKit, type BrandMediaKind } from '../../../server/src/shared/brandKit';
import './brandChip.css';

/** A few dots of the kit's colours (the chip's icon). */
export function KitDots({ colors, size = 10 }: { colors: { hex: string }[]; size?: number }) {
  const cs = colors.slice(0, 4);
  return <span className="bk-dots" aria-hidden style={{ ['--d' as any]: `${size}px` }}>{cs.length ? cs.map((c, i) => <i key={i} style={{ background: c.hex }} />) : <i className="bk-dot-empty" />}</span>;
}

/** The kit's mark: its square icon, else its logo for dark backgrounds, on a dark tile (the app is dark), or its initial on its first colour when it has no logo yet. */
export function KitMark({ kit, size = 32 }: { kit: Pick<BrandKit, 'name' | 'colors' | 'logo'> & { logos?: BrandKit['logos'] }; size?: number }) {
  const logo = kit.logos?.icon ?? logoFor(kit, 'light'); const bg = logo ? undefined : kit.colors[0]?.hex;
  return <span className={`bk-mark${logo ? '' : ' bk-mark-none'}`} aria-hidden style={{ ['--m' as any]: `${size}px`, ...(bg ? { ['--mb' as any]: bg } : {}) }}>
    {logo ? <img src={logo.url} alt="" draggable={false} /> : <b>{(kit.name.trim()[0] ?? '?').toUpperCase()}</b>}</span>;
}

/** What Brand does on this bar, in one line. */
const WHAT: Record<'own' | BrandMediaKind, string> = {
  own: 'Adds your logo in the corner and uses your colours and fonts.',
  image: 'Adds your colours and mood to your prompt.',
  video: 'Adds your colours and mood to your prompt.',
  audio: 'Adds your mood words to your prompt.',
};

/** Up / down (and left / right) move between the cards; Home / End jump to the ends. */
function moveFocus(e: KeyboardEvent<HTMLDivElement>) {
  const xs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')]; const i = xs.indexOf(document.activeElement as HTMLButtonElement);
  const to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? xs.length - 1 : null;
  if (to == null || !xs.length) return; e.preventDefault(); xs[(to + xs.length) % xs.length].focus();
}

export function BrandChip({ toolId, mode, watch }: { toolId: string; mode?: string | null; watch?: RefObject<HTMLElement | null> }) {
  const s = useBrand(); const [open, setOpen] = useState(false); const [err, setErr] = useState(''); const btn = useRef<HTMLButtonElement>(null);
  const media = brandMediaFor(toolId, mode ?? null); const kit = activeKit(s);
  const own = BRAND_LOGO_APPS.has(toolId); /* Ad Pack words the kit itself and adds its logo */ const scene = BRAND_OWN_WORDS.has(toolId) ? BRAND_SCENE[toolId] ?? '' : ''; /* Product Shot, Phone Photo, UGC Ad: the kit's words on these things in their own scene */
  if (!media || !s.loaded || (!kit && !own)) return null;
  const on = !!kit && s.on[media];
  const phrase = !kit || own ? '' : scene ? brandSceneWords(kit, scene) : brandPhrase(kit, media);
  const noLogo = own && on && kit && !logoFor(kit, 'main');
  const pick = (id: string | null) => { setErr(''); if (!id) { setBrandOn(media, false); return; } if (id !== kit?.id) setActiveKit(id).catch(e => setErr(String(e.message))); setBrandOn(media, true); };
  const hint = on ? (own ? `${kit!.name}: ${WHAT.own}` : phrase ? `Adds: ${phrase}` : `${kit!.name} has nothing to add yet`) : own ? WHAT.own : 'Use one of your brands';
  return <>
    <button ref={btn} type="button" className={`ic-chip bk-chip${on ? ' on' : ''}${on && !own && !phrase ? ' bk-chip-empty' : ''}`} data-testid="bk-chip" data-row-fold="brand"
      {...fitPri(on || own ? 'keep' : 'low')} data-fit-state={on ? 'On' : 'Off'} aria-haspopup="dialog" aria-expanded={open}
      aria-label={on ? `Brand: ${kit!.name}` : 'Brand: none'} {...tip(open ? null : hint)} onClick={() => setOpen(o => !o)}>
      {on && logoFor(kit!, 'main') ? <KitMark kit={kit!} size={20} /> : <KitDots colors={on ? kit!.colors : []} />}
      <span className="bk-chip-l">{on ? kit!.name : 'Brand'}</span></button>
    <Popover open={open} anchor={rowAnchor(btn)} avoid={watch} watch={watch} gap={8} align="start" onClose={() => setOpen(false)} label="Brand" testId="bk-pop" className="bk-pop">
      <div className="bk-pop-in">
        <div className="bk-pop-top"><b className="bk-pop-t">Brand</b><p className="bk-pop-what" data-testid="bk-what">{own ? WHAT.own : scene ? `Uses your colours and mood for the ${scene}.` : WHAT[media]}</p></div>
        <div className="bk-kits" role="radiogroup" aria-label="Brand" onKeyDown={moveFocus}>
          <button type="button" role="radio" aria-checked={!on} tabIndex={on ? -1 : 0} className="bk-kit" data-testid="bk-off" onClick={() => pick(null)}>
            <span className="bk-mark bk-mark-off" aria-hidden style={{ ['--m' as any]: '32px' }} /><span className="bk-kit-t"><span className="bk-kit-n">None</span><small>{own ? 'No logo, the style\'s own colours' : scene ? 'The scene as picked' : 'Your prompt as typed'}</small></span>
            <span className="bk-tick" aria-hidden>{!on && <TickIcon />}</span></button>
          {s.kits.map(k => { const sel = on && k.id === kit!.id; return <button key={k.id} type="button" role="radio" aria-checked={sel} tabIndex={sel ? 0 : -1} className="bk-kit" data-testid={`bk-kit-${k.id}`} onClick={() => pick(k.id)}>
            <KitMark kit={k} /><span className="bk-kit-t"><span className="bk-kit-n">{k.name}</span><KitDots colors={k.colors} size={10} /></span>
            <span className="bk-tick" aria-hidden>{sel && <TickIcon />}</span></button>; })}
        </div>
        {noLogo && <p className="bk-note" data-testid="bk-no-logo">{kit!.name} has no logo yet, so only its colours and fonts are used.</p>}
        {on && !own && <><div className="bk-pop-h">{scene ? 'Added to the scene' : 'Added to your prompt'}</div>
          <p className={`bk-phrase${phrase ? '' : ' bk-phrase-none'}`} data-testid="bk-phrase">{phrase || `${kit!.name} has no colours or mood yet, so nothing is added.`}</p></>}
        {err && <p className="bk-err" role="alert">{err}</p>}
        <div className="bk-pop-foot">
          <Link to="/assets/brands?new=1" className="bk-edit bk-new" data-testid="bk-new-brand" onClick={() => setOpen(false)}><PlusIcon />New brand kit…</Link>
          <Link to="/assets/brands" className="bk-edit" data-testid="bk-manage" onClick={() => setOpen(false)}>Manage brands</Link>
        </div>
        <small className="bk-pop-note">Same model, same price.</small>
      </div>
    </Popover></>;
}

const TickIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const PlusIcon = () => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
