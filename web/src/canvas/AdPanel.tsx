/**
 * The Ad layout card's "Edit & style" side panel (2026-10-31) and the small controls the card and the panel share. Six numbered
 * sections, in the order people think, one open at a time (the closed ones say what they hold in a few words): 1 Picture (change it,
 * zoom it; drag it in the preview to move it), 2 Words (every headline, offer, button text and how the words look), 3 Logo & button
 * (brand, the logo's plate and colour, the button's shape and colour), 4 Layout, 5 Where it runs (platforms, safe zones, whose zones
 * to show) and 6 Export. Clicking a part of the ad in the editor opens its section. State and actions are the card's (useAdCard).
 */
import { useEffect, useRef, useState } from 'react';
import { tip } from '../shared/Tooltip';
import { KitDots } from '../shared/BrandChip';
import { BarPopover, PopNote, PopRow, PopSection } from '../shared/BarPop';
import { navigate } from '../platform/router';
import { ChevronDownIcon, CloseIcon, PencilIcon, PlusIcon } from '../ui/Icons';
import { AD_LIMITS, AD_PRESETS, type AdPreset } from './adLayout';
import { AD_PLATFORMS, AD_PLATFORM_LIST, hasSafe } from './adPlatforms';
import { isEdited, PIC_ZOOM } from './adEdit';
import { AdEditor, PartStyle, type AdPanelCtx, type AdSection } from './AdEditor';
import type { AdCard } from './AdNode';
import type { BrandKit } from '../../../server/src/shared/brandKit';

export const NO_BRAND = 'none';

/** "Instagram & Facebook +2" */
export function platformSummary(ad: AdCard) {
  const list = ad.platforms; if (!list.length) return 'Pick where it runs';
  return `${AD_PLATFORMS[list[0]].label}${list.length > 1 ? ` +${list.length - 1}` : ''}`;
}

/* ------------------------------------------------------------------ shared controls */

/** Every headline, with "+ Add another headline" and remove. */
function HeadlineList({ ad }: { ad: AdCard }) {
  const { headlines, shown, more } = ad;
  return <>
    {headlines.slice(0, shown).map((h, i) => <div key={i} className="ad-hl">
      <input className="ad-in ad-in-head" data-testid={`ade-headline-${i + 1}`} value={h} maxLength={AD_LIMITS.headline} placeholder={i === 0 ? 'Headline' : `Headline ${i + 1}`} autoFocus={i > 0 && i === more - 1 && !h}
        aria-label={`Headline ${i + 1}`} onChange={(e) => ad.setHeadline(i, e.target.value)} onFocus={() => h.trim() && ad.patch({ pick: i + 1 })} />
      {i > 0 && <button type="button" className="ad-hl-x" data-testid={`ade-headline-${i + 1}-remove`} aria-label={`Remove headline ${i + 1}`} {...tip('Remove')} onClick={() => ad.dropHeadline(i)}><CloseIcon size={12} /></button>}
    </div>)}
    {shown < AD_LIMITS.headlines && <button type="button" className="ad-add" data-testid="ade-headline-add" onClick={() => ad.setMore(shown + 1)}><PlusIcon size={12} />Add another headline</button>}
  </>;
}

/** Price or offer, and the button's words. */
export function OfferButton({ ad, ids = 'ad' }: { ad: AdCard; ids?: string }) {
  return <div className="ad-pair">
    <input className="ad-in" data-testid={`${ids}-offer`} value={ad.p.offer} maxLength={AD_LIMITS.offer} placeholder="Price or offer" aria-label="Price or offer" onChange={(e) => ad.patch({ offer: e.target.value })} />
    <input className="ad-in" data-testid={`${ids}-button`} value={ad.p.button} maxLength={AD_LIMITS.button} placeholder="Button" aria-label="Button text" onChange={(e) => ad.patch({ button: e.target.value })} />
  </div>;
}

/** "Brand: <name> ▾": the brand's logo, colours and fonts on the ad. The app's own bar popover (the board switcher's), with "No brand"
 *  and "Add a brand…" (Assets › Brands). */
function BrandPick({ kits, kit, none, onPick, popClass }: { kits: BrandKit[]; kit: BrandKit | null; none: boolean; onPick: (id: string) => void; popClass?: string }) {
  const btn = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false); const pick = (id: string) => { setOpen(false); onPick(id); };
  const cur = none ? null : kit;
  return <>
    <button ref={btn} type="button" className="ad-brand" data-testid="ad-brand" aria-haspopup="menu" aria-expanded={open} aria-label={`Brand: ${cur?.name ?? 'No brand'}`} onClick={() => setOpen((o) => !o)}>
      <span className="ad-brand-l">Brand</span><KitDots colors={cur?.colors ?? []} /><span className="ad-brand-n">{cur?.name ?? 'No brand'}</span><ChevronDownIcon size={14} /></button>
    <BarPopover open={open} anchor={btn} onClose={() => setOpen(false)} label="Brand" placement="bottom" width={240} className={popClass} testId="ad-brand-pop">
      <PopSection label="Brand">
        <div role="radiogroup" aria-label="Brand">
          {kits.map((k) => <PopRow key={k.id} role="radio" selected={k.id === cur?.id} icon={<KitDots colors={k.colors} size={12} />} label={k.name} onClick={() => pick(k.id)} testId={`ad-brand-${k.id}`} />)}
          <PopRow role="radio" selected={!cur} icon={<KitDots colors={[]} size={12} />} label="No brand" onClick={() => pick(NO_BRAND)} testId="ad-brand-none" />
        </div>
      </PopSection>
      <PopSection>
        <PopRow role="menuitem" icon={<PlusIcon size={16} />} label="Add a brand…" onClick={() => { setOpen(false); navigate('/assets/brands?new=1'); }} testId="ad-brand-add" />
      </PopSection>
    </BarPopover>
  </>;
}
export function Brand({ ad, popClass }: { ad: AdCard; popClass?: string }) {
  return <BrandPick kits={ad.brand.kits} kit={ad.kit} none={ad.p.brandId === NO_BRAND} onPick={(id) => ad.patch({ brandId: id })} popClass={popClass} />;
}

/** A tiny drawing of each layout: the picture, the words as bars, the button as a dot. */
function PresetThumb({ id }: { id: AdPreset }) {
  const bars = (y: number, c = false) => <><rect x={c ? 4 : 3} y={y} width="12" height="2" rx="1" /><rect x={c ? 6 : 3} y={y + 3} width="8" height="1.5" rx=".75" /><rect x={c ? 7 : 3} y={y + 6} width="6" height="2.5" rx="1.25" className="ad-pt-btn" /></>;
  return <svg className="ad-pt" viewBox="0 0 20 24" width="16" height="19" aria-hidden>
    <rect width="20" height="24" rx="2.5" className="ad-pt-pic" />
    {id === 'split' && <rect y="12" width="20" height="12" className="ad-pt-panel" />}
    {id === 'bottom' ? bars(13.5) : id === 'top' ? bars(2.5) : id === 'center' ? bars(8, true) : bars(13.5)}
  </svg>;
}

const exportTip = (ad: AdCard) => ad.pic ? `Saves ${ad.count} pictures in one zip: a folder for each platform (${ad.folders}) with its sizes, ${ad.variants.length === 1 ? 'your headline' : `${ad.variants.length} headlines`} and text to paste` : 'Choose a picture first';
export function ExportBtn({ ad }: { ad: AdCard }) {
  return <button type="button" className="ad-export" data-card-control data-testid="ad-export" disabled={!ad.pic || !ad.art || ad.busy} onClick={() => void ad.exportPack()} {...tip(exportTip(ad))}>{ad.busy ? 'Saving…' : 'Export pack'}</button>;
}
export function EditBtn({ ad }: { ad: AdCard }) {
  return <button type="button" className="ad-editbtn" data-testid="ad-edit" disabled={!ad.pic || !ad.art}
    {...tip(ad.pic ? 'Picture, words, logo, layout and where it runs, with a big preview (or double-click the preview)' : 'Choose a picture first')} onClick={() => ad.setEditing('picture')}><PencilIcon size={13} />Edit & style</button>;
}

/* ------------------------------------------------------------------ the editor's sections */

const SECTIONS: { id: AdSection; label: string }[] = [
  { id: 'picture', label: 'Picture' }, { id: 'words', label: 'Words' }, { id: 'logo', label: 'Logo & button' },
  { id: 'layout', label: 'Layout' }, { id: 'where', label: 'Where it runs' }, { id: 'export', label: 'Export' }];
const SECTION_OF: Record<AdPanelCtx['hit']['part'], AdSection> = { picture: 'picture', headline: 'words', offer: 'words', logo: 'logo', button: 'logo' };

/** What a closed section holds, in a few words. */
function summaryOf(ad: AdCard, id: AdSection): string {
  switch (id) {
    case 'picture': return ad.input?.label ?? '';
    case 'words': return ad.variants.length > 1 ? `${ad.variants.length} headlines` : ad.headlines[0] || 'Add a headline';
    case 'logo': return `${ad.p.brandId === NO_BRAND ? 'No brand' : ad.kit?.name ?? 'No brand'} · ${ad.style.buttonShape ?? 'pill'} button`;
    case 'layout': return AD_PRESETS.find((p) => p.id === ad.preset)?.label ?? '';
    case 'where': return platformSummary(ad);
    case 'export': return `${ad.count} pictures`;
  }
}

function Panel({ ad, at, x }: { ad: AdCard; at: AdSection; x: AdPanelCtx }) {
  const [open, setOpen] = useState<AdSection>(at);
  useEffect(() => { if (x.hit.n) setOpen(SECTION_OF[x.hit.part]); }, [x.hit]);
  /* the open section scrolls into view inside the panel (scrollIntoView would also scroll the page behind the sheet) */
  const openEl = useRef<HTMLElement>(null);
  useEffect(() => { const el = openEl.current; const box = el?.parentElement; if (!el || !box) return; const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop += r.top - b.top; else if (r.bottom > b.bottom) box.scrollTop += Math.min(r.bottom - b.bottom, r.top - b.top); }, [open]);
  const art = ad.art!;
  const sec = (id: AdSection, body: React.ReactNode) => { const n = SECTIONS.findIndex((s) => s.id === id); const on = open === id;
    return <section key={id} ref={on ? openEl : undefined} className={`adp-sec${on ? ' on' : ''}`} data-testid={`adp-${id}`}>
      <button type="button" className="adp-h" aria-expanded={on} onClick={() => setOpen(id)}><i>{n + 1}</i>{SECTIONS[n].label}<span className="adp-sum">{on ? '' : summaryOf(ad, id)}</span></button>
      {on && <div className="adp-body">{body}</div>}</section>; };
  return <>
    {sec('picture', <>
      <div className="adp-pic">{ad.picUrl && <img src={ad.picUrl} alt="" />}<span>Drag the picture in the preview to move it.</span>
        <button type="button" className="btn adp-btn" data-testid="ad-change" disabled={ad.placing} onClick={ad.choose}>{ad.placing ? 'Adding…' : 'Change'}</button></div>
      <label className="wfm-size adp-zoom"><span>Zoom</span><input type="range" min={PIC_ZOOM.min} max={PIC_ZOOM.max} step={0.01} value={x.zoom} onChange={(ev) => x.zoomTo(+ev.target.value)} aria-label="Picture zoom" data-testid="ade-zoom" /><b>{Math.round(x.zoom * 100)}%</b></label>
    </>)}
    {sec('words', <>
      <div className="ad-fields adp-fields"><HeadlineList ad={ad} /><OfferButton ad={ad} ids="ade" /></div>
      <PartStyle part="headline" style={ad.style} onStyle={ad.setStyle} art={art} />
    </>)}
    {sec('logo', <>
      <div className="adp-pad"><Brand ad={ad} popClass="ade-pop" /></div>
      <PartStyle part="logo" style={ad.style} onStyle={ad.setStyle} art={art} />
      <h4 className="adp-sub">Button</h4>
      <PartStyle part="button" style={ad.style} onStyle={ad.setStyle} art={art} />
    </>)}
    {sec('layout', <>
      <div className="ad-layouts ad-layouts-2" role="radiogroup" aria-label="Layout">{AD_PRESETS.map((p) => <button key={p.id} type="button" role="radio" aria-checked={p.id === ad.preset} className={p.id === ad.preset ? 'on' : ''} data-testid={`ad-layout-${p.id}`} onClick={() => void ad.pickPreset(p.id)}><PresetThumb id={p.id} />{p.label}</button>)}</div>
      <PopNote>Picking a layout puts this size back to automatic.</PopNote>
    </>)}
    {sec('where', <>
      <div className="ad-chips" role="group" aria-label="Where it runs">{AD_PLATFORM_LIST.map((p) => <button key={p} type="button" className={`ad-chip${ad.platforms.includes(p) ? ' on' : ''}`} aria-pressed={ad.platforms.includes(p)} data-testid={`ad-platform-${p}`} onClick={() => ad.togglePlatform(p)}>{AD_PLATFORMS[p].label}</button>)}</div>
      {!ad.platforms.length && <p className="ad-hint adp-pad" data-testid="ad-platform-hint">Pick where it will run to get the right sizes. Keeping the last ones for now.</p>}
      <div className="adp-pad"><label className={`ad-safe${hasSafe(ad.size.safe) ? '' : ' none'}`} {...tip(hasSafe(ad.size.safe) ? 'Shades what each app covers with its own buttons and captions. Only in the preview, never in the pictures you save.' : 'Nothing covers this size')}>
        <input type="checkbox" checked={ad.showSafe} data-testid="ad-safe" onChange={(e) => ad.patch({ safeZones: e.target.checked })} /><i aria-hidden />Show what each app covers</label></div>
      {ad.showSafe && x.zones.length > 1 && <div className="adp-zones"><span className="ad-label">Show the zones of</span>
        <div className="ad-chips" role="radiogroup" aria-label="Zones for">
          <button type="button" role="radio" aria-checked={x.zone === 'all'} className={`ad-chip${x.zone === 'all' ? ' on' : ''}`} data-testid="ade-zones-all" {...tip('What the parts keep clear of')} onClick={() => x.setZone('all')}>All</button>
          {x.zones.map((z) => <button key={z.p} type="button" role="radio" aria-checked={x.zone === z.p} className={`ad-chip${x.zone === z.p ? ' on' : ''}`} data-testid={`ade-zones-${z.p}`} onClick={() => x.setZone(z.p)}>{z.label}</button>)}</div></div>}
    </>)}
    {sec('export', <>
      <p className="adp-p">{ad.count} pictures in one zip: a folder for each platform with its sizes, {ad.variants.length === 1 ? 'your headline' : `all ${ad.variants.length} headlines`}, and the post text to paste.</p>
      <ul className="adp-folders">{ad.picked.map((p) => <li key={p}><b>{AD_PLATFORMS[p].label}</b><small>{AD_PLATFORMS[p].sizes.map((z) => z.name).join(' · ')}</small></li>)}</ul>
      <div className="adp-pad"><ExportBtn ad={ad} /></div>
    </>)}
  </>;
}

/** The big editor with its sections, opened at a section ("Edit & style", the platforms chip, a double-click on the preview). */
export function AdCardEditor({ ad }: { ad: AdCard }) {
  if (!ad.editing || !ad.pic || !ad.art) return null; const at = ad.editing;
  return <AdEditor sizes={ad.sizes} size={ad.size} onSize={(s) => ad.patch({ size: s.shape })} pic={ad.pic} art={ad.art} text={{ headline: ad.view.headline, offer: ad.p.offer, button: ad.p.button }} preset={ad.preset}
    style={ad.style} edit={ad.edit} onEdit={(e) => ad.setEdit(ad.size.shape, e)} showSafe={ad.showSafe} platforms={ad.picked}
    editedSizes={ad.sizes.filter((s) => isEdited(ad.edits[s.shape])).map((s) => s.shape)} onClose={() => ad.setEditing(false)} panel={(x) => <Panel ad={ad} at={at} x={x} />} />;
}
