/**
 * The Ad layout card's "Edit & style" side panel (2026-10-31) and the small controls the card and the panel share. A slim icon rail
 * (Picture · Text · Style · Layout · Platforms · Export) and the open section's controls beside it: Picture (change it, zoom it; drag it
 * in the preview to move it), Text (every headline, offer, button text and how the words look), Style (brand, the logo's plate and
 * colour, the button's shape and colour), Layout, Platforms (where it runs, safe zones, whose zones to show) and Export. Clicking a part
 * of the ad opens its section; the card remembers the last one (AdNode). State and actions are the card's (useAdCard).
 */
import { useEffect, useRef, useState } from 'react';
import { RangeSlider } from '../shared/RangeSlider';
import { tip } from '../shared/Tooltip';
import { KitDots } from '../shared/BrandChip';
import { BarPopover, PopNote, PopRow, PopSection } from '../shared/BarPop';
import { navigate } from '../platform/router';
import { ChevronDownIcon, CloseIcon, DownloadIcon, ImageIcon, LayoutIcon, PaletteIcon, PencilIcon, PhoneAdIcon, PlusIcon, TextIcon } from '../ui/Icons';
import { AD_LIMITS, AD_PRESETS, type AdPreset } from './adLayout';
import { AD_PLATFORMS, AD_PLATFORM_LIST } from './adPlatforms';
import { isEdited, PIC_ZOOM } from './adEdit';
import { AdEditor, PartStyle, SafeSwitch, type AdPanelCtx, type AdSection } from './AdEditor';
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
function PresetThumb({ id, big }: { id: AdPreset; big?: boolean }) {
  const bars = (y: number, c = false) => <><rect x={c ? 4 : 3} y={y} width="12" height="2" rx="1" /><rect x={c ? 6 : 3} y={y + 3} width="8" height="1.5" rx=".75" /><rect x={c ? 7 : 3} y={y + 6} width="6" height="2.5" rx="1.25" className="ad-pt-btn" /></>;
  return <svg className="ad-pt" viewBox="0 0 20 24" width={big ? 60 : 16} height={big ? 72 : 19} aria-hidden>
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
    {...tip(ad.pic ? 'Picture, words, logo, layout and where it runs, with a big preview (or double-click the preview)' : 'Choose a picture first')} onClick={() => ad.setEditing('last')}><PencilIcon size={13} />Edit & style</button>;
}

/* ------------------------------------------------------------------ the editor's side panel */

const SECTIONS: { id: AdSection; label: string; Icon: (q: { size?: number }) => JSX.Element; hint: string }[] = [
  { id: 'picture', label: 'Picture', Icon: ImageIcon, hint: 'Drag the picture in the preview to move it. Zoom with the slider or your trackpad.' },
  { id: 'text', label: 'Text', Icon: TextIcon, hint: 'Each headline makes its own set of pictures.' },
  { id: 'style', label: 'Style', Icon: PaletteIcon, hint: 'The same on every size.' },
  { id: 'layout', label: 'Layout', Icon: LayoutIcon, hint: 'Where the words sit on the picture.' },
  { id: 'platforms', label: 'Platforms', Icon: PhoneAdIcon, hint: 'The platforms decide the sizes.' },
  { id: 'export', label: 'Export', Icon: DownloadIcon, hint: 'Every size for every platform, ready to post.' }];
const SECTION_OF: Record<AdPanelCtx['hit']['part'], AdSection> = { picture: 'picture', headline: 'text', offer: 'text', logo: 'style', button: 'style' };

/** A section's controls. */
function Section({ ad, id, x }: { ad: AdCard; id: AdSection; x: AdPanelCtx }) {
  const art = ad.art!;
  switch (id) {
    case 'picture': return <>
      <div className="adp-pic">{ad.picUrl && <img src={ad.picUrl} alt="" />}<span>{ad.input?.label || 'Your picture'}</span>
        <button type="button" className="btn adp-btn" data-testid="ad-change" disabled={ad.placing} onClick={ad.choose}>{ad.placing ? 'Adding…' : 'Change'}</button></div>
      <h4 className="adp-sub">Zoom</h4>
      <RangeSlider className="adp-zoom" label="Picture zoom" min={PIC_ZOOM.min} max={PIC_ZOOM.max} step={0.01} nudge={0.1} value={x.zoom} onChange={x.zoomTo} format={(v) => `${Math.round(v * 100)}%`} testId="ade-zoom" />
    </>;
    case 'text': return <>
      <h4 className="adp-sub">Headlines</h4>
      <div className="ad-fields adp-fields"><HeadlineList ad={ad} /></div>
      <h4 className="adp-sub">Offer and button</h4>
      <div className="ad-fields adp-fields"><OfferButton ad={ad} ids="ade" /></div>
      <h4 className="adp-sub">How the words look</h4>
      <PartStyle part="headline" style={ad.style} onStyle={ad.setStyle} art={art} />
    </>;
    case 'style': return <>
      <h4 className="adp-sub">Logo</h4>
      <div className="adp-pad"><Brand ad={ad} popClass="ade-pop" /></div>
      <PartStyle part="logo" style={ad.style} onStyle={ad.setStyle} art={art} />
      <h4 className="adp-sub">Button</h4>
      <PartStyle part="button" style={ad.style} onStyle={ad.setStyle} art={art} />
    </>;
    case 'layout': return <>
      <div className="adp-layouts" role="radiogroup" aria-label="Layout">{AD_PRESETS.map((p) => <button key={p.id} type="button" role="radio" aria-checked={p.id === ad.preset} className={p.id === ad.preset ? 'on' : ''} data-testid={`ad-layout-${p.id}`} onClick={() => void ad.pickPreset(p.id)}><PresetThumb id={p.id} big />{p.label}</button>)}</div>
      <PopNote>Picking a layout puts this size back to automatic.</PopNote>
      <div className="adp-pad adp-row"><span>{isEdited(ad.edit) ? `${ad.size.label} has its own layout.` : `${ad.size.label} uses the automatic layout.`}</span>
        <button type="button" className="btn adp-btn" data-testid="adp-reset" disabled={!isEdited(ad.edit)} {...tip('Back to the automatic layout for this size')} onClick={() => ad.setEdit(ad.size.shape, null)}>Reset layout</button></div>
    </>;
    case 'platforms': return <>
      <div className="ad-chips" role="group" aria-label="Where it runs">{AD_PLATFORM_LIST.map((p) => <button key={p} type="button" className={`ad-chip${ad.platforms.includes(p) ? ' on' : ''}`} aria-pressed={ad.platforms.includes(p)} data-testid={`ad-platform-${p}`} onClick={() => ad.togglePlatform(p)}>{AD_PLATFORMS[p].label}</button>)}</div>
      {!ad.platforms.length && <p className="ad-hint adp-pad" data-testid="ad-platform-hint">Pick where it will run to get the right sizes. Keeping the last ones for now.</p>}
      <h4 className="adp-sub">Safe zones</h4>
      <div className="adp-pad"><SafeSwitch on={ad.showSafe} onChange={(v) => ad.patch({ safeZones: v })} safe={ad.size.safe} label="Show what each app covers" testId="ad-safe" /></div>
      {ad.showSafe && x.zones.length > 1 && <div className="adp-zones"><span className="ad-label">Show the zones of</span>
        <div className="ad-chips" role="radiogroup" aria-label="Zones for">
          <button type="button" role="radio" aria-checked={x.zone === 'all'} className={`ad-chip${x.zone === 'all' ? ' on' : ''}`} data-testid="ade-zones-all" {...tip('What the parts keep clear of')} onClick={() => x.setZone('all')}>All</button>
          {x.zones.map((z) => <button key={z.p} type="button" role="radio" aria-checked={x.zone === z.p} className={`ad-chip${x.zone === z.p ? ' on' : ''}`} data-testid={`ade-zones-${z.p}`} onClick={() => x.setZone(z.p)}>{z.label}</button>)}</div></div>}
    </>;
    case 'export': return <>
      <p className="adp-p">{ad.count} pictures in one zip: a folder for each platform with its sizes, {ad.variants.length === 1 ? 'your headline' : `all ${ad.variants.length} headlines`}, and the post text to paste.</p>
      <ul className="adp-folders">{ad.picked.map((p) => <li key={p}><b>{AD_PLATFORMS[p].label}</b><small>{AD_PLATFORMS[p].sizes.map((z) => z.name).join(' · ')}</small></li>)}</ul>
      <div className="adp-pad"><ExportBtn ad={ad} /></div>
    </>;
  }
}

/** The icon rail and the open section beside it. Clicking a part of the ad opens its section; arrow keys move along the rail (AdEditor). */
function Panel({ ad, x }: { ad: AdCard; x: AdPanelCtx }) {
  const at = ad.editing || 'picture'; const go = (s: AdSection) => s !== at && ad.setEditing(s);
  useEffect(() => { if (x.hit.n) go(SECTION_OF[x.hit.part]); }, [x.hit]); // eslint-disable-line react-hooks/exhaustive-deps
  const body = useRef<HTMLDivElement>(null); useEffect(() => { if (body.current) body.current.scrollTop = 0; }, [at]);
  const cur = SECTIONS.find((s) => s.id === at)!;
  return <div className="adp">
    <div className="adp-rail" role="tablist" aria-orientation="vertical" aria-label="Edit and style">
      {SECTIONS.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" id={`adp-tab-${id}`} aria-selected={id === at} aria-controls="adp-pane" tabIndex={id === at ? 0 : -1}
        className={`adp-tab${id === at ? ' on' : ''}`} data-testid={`adp-tab-${id}`} onClick={() => go(id)}><Icon size={20} /><span>{label}</span></button>)}
    </div>
    <div ref={body} className="adp-pane" id="adp-pane" role="tabpanel" aria-labelledby={`adp-tab-${at}`} data-testid={`adp-${at}`}>
      <header className="adp-head"><h3>{cur.label}</h3><p>{cur.hint}</p></header>
      <Section ad={ad} id={at} x={x} />
    </div>
  </div>;
}

/** The big editor with its sections, opened at a section ("Edit & style", the platforms chip, a double-click on the preview). */
export function AdCardEditor({ ad }: { ad: AdCard }) {
  if (!ad.editing || !ad.pic || !ad.art) return null;
  return <AdEditor sizes={ad.sizes} size={ad.size} onSize={(s) => ad.patch({ size: s.shape })} pic={ad.pic} art={ad.art} text={{ headline: ad.view.headline, offer: ad.p.offer, button: ad.p.button }} preset={ad.preset}
    style={ad.style} onStyle={ad.setStyle} edit={ad.edit} onEdit={(e) => ad.setEdit(ad.size.shape, e)} showSafe={ad.showSafe} onShowSafe={(v) => ad.patch({ safeZones: v })} platforms={ad.picked}
    editedSizes={ad.sizes.filter((s) => isEdited(ad.edits[s.shape])).map((s) => s.shape)} onClose={() => ad.setEditing(false)} panel={(x) => <Panel ad={ad} x={x} />} />;
}
