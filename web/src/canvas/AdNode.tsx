/**
 * The Ad layout card (2026-10-30): one picture in (an arrow from an upload or a result), your words typed on the card, and the brand's
 * logo, colours and fonts laid on top by code, so the words and the logo are always right. "Where will it run?" picks the platforms,
 * whose sizes become the size tabs (adPlatforms.ts); the preview shades each platform's safe zones, and the layout keeps out of them.
 * Four layouts (text bottom / top, centred, split). "Choose a picture" opens the app's media picker and puts the pick on the board as
 * an upload card, wired in. "Edit ad" (or a double-click on the preview) opens the big editor (AdEditor.tsx): move and resize the parts
 * and frame the picture, per size. "Export pack" saves every size × every headline as PNGs in one zip. Free, in the browser. The maths
 * is adLayout.ts and adEdit.ts, the drawing adDraw.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, useValue } from 'tldraw';
import { useToast } from '../shared/Toast';
import { askConfirm } from '../shared/Dialog';
import { tip } from '../shared/Tooltip';
import { useBrand } from '../shared/brandStore';
import { KitDots } from '../shared/BrandChip';
import { BarPopover, PopRow, PopSection } from '../shared/BarPop';
import { navigate } from '../platform/router';
import { ChevronDownIcon, CloseIcon, ImageIcon, PencilIcon, PlusIcon } from '../ui/Icons';
import { pickMedia } from '../shared/MediaPicker';
import { libraryUrlOf } from '../shared/libraryFiles';
import { uploadMedia } from '../shared/batch1';
import { NodeFrame } from './NodeFrame';
import { arrowsInto, cardInputs, linkShapes } from './graph';
import { freeSpot } from './placement';
import { NODE_DEFS } from './nodeTypes';
import { createAuxNode, type AdNodeProps } from './auxShapes';
import { AD_LIMITS, AD_PRESETS, adVariants, asPreset, type AdPreset } from './adLayout';
import { AD_PLATFORMS, AD_PLATFORM_LIST, DEFAULT_PLATFORMS, adSizesFor, asPlatforms, asShape, hasSafe, type AdPlatform } from './adPlatforms';
import { asEdits, isEdited, type AdEdit, type AdEdits } from './adEdit';
import { AdEditor } from './AdEditor';
import { drawAd, drawSafeZones, exportAdPack, loadAdArt, loadAdPicture, type AdArt } from './adDraw';
import type { BrandKit } from '../../../server/src/shared/brandKit';

const NO_BRAND = 'none';
const stop = { onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyUp: (e: React.SyntheticEvent) => e.stopPropagation() };

export function AdView({ shape, Icon }: { shape: { id: any; type: string; props: AdNodeProps }; Icon: (q: { size?: number }) => JSX.Element }) {
  const editor = useEditor(); const toast = useToast(); const brand = useBrand(); const p = shape.props;
  const patch = (props: Partial<AdNodeProps>) => editor.run(() => editor.updateShape({ id: shape.id, type: shape.type, props } as any), { history: 'ignore' });
  const input = useValue('ad input', () => cardInputs(editor, editor.getShape(shape.id)!).find((i) => i.kind === 'image') ?? null, [editor, shape.id]);
  const picUrl = input ? input.url || input.poster : '';
  const kit: BrandKit | null = p.brandId === NO_BRAND ? null : brand.kits.find((k) => k.id === p.brandId) ?? brand.kits.find((k) => k.id === brand.activeId) ?? brand.kits[0] ?? null;
  /* where it runs → the size tabs; with no platform picked, the last picked ones' sizes stay (and a hint says why) */
  const platforms = asPlatforms(p.platforms); const [kept, setKept] = useState<AdPlatform[]>(platforms.length ? platforms : DEFAULT_PLATFORMS);
  useEffect(() => { if (platforms.length) setKept(platforms); }, [platforms.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const sizes = adSizesFor(platforms.length ? platforms : kept); const size = sizes.find((s) => s.shape === asShape(p.size)) ?? sizes[0];
  const preset = asPreset(p.layout); const showSafe = p.safeZones !== false;
  /* "Edit ad": each size's own edits; a size with none keeps the automatic layout */
  const edits = useMemo(() => asEdits(p.edits), [p.edits]); const edit = edits[size.shape]; const [editing, setEditing] = useState(false);
  const setEdit = (shape: string, e: AdEdit | null) => { const next: AdEdits = { ...edits }; const one: AdEdit = { ...e };
    if (!one.at || !Object.keys(one.at).length) delete one.at; if (!one.hide?.length) delete one.hide;
    if (e && isEdited(one)) next[shape] = one; else delete next[shape]; patch({ edits: next as Record<string, unknown> }); };
  /* a layout preset puts this size back to automatic (asking first when it was edited by hand) */
  const pickPreset = async (id: AdPreset) => {
    if (isEdited(edit) && !(await askConfirm({ title: 'Use this layout?', body: `Your changes to the ${size.label} size go back to the automatic layout.`, confirm: 'Use layout' }))) return;
    const next: AdEdits = { ...edits }; delete next[size.shape]; patch({ layout: id, edits: next as Record<string, unknown> }); };
  const togglePlatform = (x: AdPlatform) => patch({ platforms: AD_PLATFORM_LIST.filter((q) => (q === x ? !platforms.includes(q) : platforms.includes(q))) });
  const headlines = [0, 1, 2].map((i) => p.headlines?.[i] ?? '');
  /* one headline field, more on "+ Add another headline"; filled ones always show (so they're back after a reload) */
  const filled = headlines.reduce((n, h, i) => (h.trim() ? i + 1 : n), 0); const [more, setMore] = useState(1); const shown = Math.max(1, more, filled);
  const variants = adVariants(headlines); const view = variants.find((v) => v.n === p.pick) ?? variants[0];

  const [art, setArt] = useState<AdArt | null>(null); const [pic, setPic] = useState<HTMLImageElement | null>(null); const [picErr, setPicErr] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { let on = true; loadAdArt(kit).then((a) => on && setArt(a)).catch(() => on && setArt(null)); return () => { on = false; }; }, [kit?.id, kit?.updatedAt, kit?.logo?.url, kit?.fonts.heading, kit?.fonts.body]);
  useEffect(() => { let on = true; setPicErr(false); if (!picUrl) { setPic(null); return; } loadAdPicture(picUrl).then((i) => on && setPic(i)).catch(() => { if (on) { setPic(null); setPicErr(true); } }); return () => { on = false; }; }, [picUrl]);

  /* a state ref, not useRef: the frame unmounts its body when zoomed far out, and the new canvas must be drawn again */
  const [c, setCanvas] = useState<HTMLCanvasElement | null>(null); const { w: W, h: H, safe } = size;
  useEffect(() => {
    if (!c || !art || !pic) return; const k = 0.5; c.width = W * k; c.height = H * k;
    const g = c.getContext('2d'); if (!g) return; g.setTransform(k, 0, 0, k, 0, 0); drawAd(g, W, H, pic, art, { headline: view.headline, offer: p.offer, button: p.button }, { safe, preset, edit });
    if (showSafe) drawSafeZones(g, W, H, safe);
  }, [c, art, pic, W, H, safe, preset, showSafe, view.headline, p.offer, p.button, edit]);

  /* "Choose a picture": the app's media picker; the pick goes on the board as an upload card left of this one, wired in (replacing the old arrow) */
  const [placing, setPlacing] = useState(false);
  const place = async (f: File) => {
    setPlacing(true);
    try {
      const url = libraryUrlOf(f) ?? (await uploadMedia([f]))[0]?.url; if (!url) throw new Error('Upload failed');
      const me = editor.getShapePageBounds(shape.id); const d = NODE_DEFS.upload;
      const at = freeSpot(editor, d.defaultW, d.defaultH, me ? { x: me.minX - 80 - d.defaultW / 2, y: me.midY } : undefined);
      const up = createAuxNode(editor, 'upload', { at, media: { url, poster: url, mediaKind: 'image', label: f.name }, select: false });
      editor.run(() => { editor.deleteShapes(arrowsInto(editor, shape.id).map((a) => a.arrowId)); linkShapes(editor, up, shape.id); });
    } catch (e) { toast((e as Error).message || 'Couldn’t add that picture.', 'error'); } finally { setPlacing(false); }
  };
  const choose = () => pickMedia({ accept: 'image/*', title: input ? 'Change the picture' : 'Choose a picture', onFiles: ([f]) => { if (f) void place(f); } });

  const exportPack = async () => {
    if (!art || !pic || busy) return; setBusy(true);
    try { const n = await exportAdPack(pic, art, headlines, p.offer, p.button, sizes, preset, edits); toast(`Saved ${n} pictures in one zip`); }
    catch (e) { toast((e as Error).message || 'Couldn’t make the pack.', 'error'); } finally { setBusy(false); }
  };
  const setHeadline = (i: number, v: string) => { const h = [...headlines]; h[i] = v; patch({ headlines: h }); };
  /* remove an extra headline: the ones below move up, and the preview keeps showing the same words */
  const dropHeadline = (i: number) => { const h = headlines.filter((_, j) => j !== i); h.push(''); const n = p.pick === i + 1 ? 0 : p.pick > i + 1 ? p.pick - 1 : p.pick;
    patch({ headlines: h, pick: n }); setMore(shown - 1); };
  const count = variants.length * sizes.length;
  /* a double-click on the preview opens "Edit ad": the second press is caught here, before the board reads it as a double-click on
   *  empty board (which starts a text box); the first still selects and drags the card */
  const lastDown = useRef(0);
  const twice = (e: React.PointerEvent) => { if (e.button !== 0) return; if (e.timeStamp - lastDown.current < 400 && art) { e.stopPropagation(); e.preventDefault(); lastDown.current = 0; setEditing(true); } else lastDown.current = e.timeStamp; };

  return <NodeFrame shapeId={shape.id} type={shape.type} icon={<Icon />} title="Ad layout"
    label="Ad layout"
    footer={<><span className="nf-model"><b>Free · made in your browser</b></span>
      <button type="button" className="ad-export" data-card-control data-testid="ad-export" disabled={!pic || !art || busy} onClick={() => void exportPack()}
        {...tip(pic ? `Saves ${count} pictures (${variants.length} headline${variants.length === 1 ? '' : 's'} × ${sizes.length} size${sizes.length === 1 ? '' : 's'}) in one zip` : 'Connect a picture first')}>{busy ? 'Saving…' : 'Export pack'}</button></>}>
    <div className="ad-body">
      <div className="ad-where" data-card-control {...stop}>
        <span className="ad-label" id={`ad-where-${shape.id}`}>Where will it run?</span>
        <div className="ad-chips" role="group" aria-labelledby={`ad-where-${shape.id}`}>{AD_PLATFORM_LIST.map((x) => <button key={x} type="button" className={`ad-chip${platforms.includes(x) ? ' on' : ''}`} aria-pressed={platforms.includes(x)} data-testid={`ad-platform-${x}`} onClick={() => togglePlatform(x)}>{AD_PLATFORMS[x].label}</button>)}</div>
        {!platforms.length && <p className="ad-hint" data-testid="ad-platform-hint">Pick where it will run to get the right sizes. Keeping the last ones for now.</p>}
      </div>
      <div className="ad-seg" data-card-control {...stop} role="tablist" aria-label="Size">{sizes.map((s) => <button key={s.shape} type="button" role="tab" aria-selected={s === size} className={`${s === size ? 'on' : ''}${isEdited(edits[s.shape]) ? ' ed' : ''}`} data-testid={`ad-size-${s.shape}`} {...tip(`${s.w} × ${s.h} · ${s.where}${isEdited(edits[s.shape]) ? ' · your own layout' : ''}`)} onClick={() => patch({ size: s.shape })}>{s.label}</button>)}</div>
      <div className="ad-stage">
        {pic ? <canvas ref={setCanvas} className="ad-canvas" onPointerDown={twice} style={{ aspectRatio: `${W} / ${H}`, width: `min(100cqw, ${(W / H).toFixed(4)} * 100cqh)` }} aria-label={`Ad preview, ${size.label}`} /> :
          <div className="ad-ghost" style={{ aspectRatio: `${W} / ${H}`, width: `min(100cqw, ${(W / H).toFixed(4)} * 100cqh)` }} data-testid="ad-empty">
            <i className="ad-g-logo" /><span className="ad-g-msg"><b>{picErr ? 'That picture couldn’t be read' : 'Connect a picture'}</b>
              <small>{picErr ? 'Try another upload or result.' : 'Use a picture with no text; your headline, price and logo go on top. Or drag from a picture’s dot onto this card.'}</small>
              <button type="button" className="ad-choose" data-card-control {...stop} data-testid="ad-choose" disabled={placing} onClick={choose}><ImageIcon size={14} />{placing ? 'Adding…' : picErr ? 'Choose another picture' : 'Choose a picture'}</button></span>
            <span className="ad-g-text" aria-hidden><i className="ad-g-h" /><i className="ad-g-h ad-g-h2" /><i className="ad-g-offer" /><i className="ad-g-btn" /></span></div>}
      </div>
      <div className="ad-stagebar" data-card-control {...stop}>
        <label className={`ad-safe${hasSafe(safe) ? '' : ' none'}`} {...tip(hasSafe(safe) ? 'Shades what each app covers with its own buttons and captions. Only in this preview, never in the pictures you save.' : 'Nothing covers this size')}>
          <input type="checkbox" checked={showSafe} data-testid="ad-safe" onChange={(e) => patch({ safeZones: e.target.checked })} /><i aria-hidden />Show safe zones</label>
        {pic && <span className="ad-stage-acts">
          <button type="button" className="ad-change" data-testid="ad-change" disabled={placing} onClick={choose}>{placing ? 'Adding…' : 'Change picture'}</button>
          <button type="button" className="ad-change ad-edit" data-testid="ad-edit" disabled={!art} {...tip('Move the logo, words and button, and frame the picture (or double-click the preview)')} onClick={() => setEditing(true)}><PencilIcon size={12} />Edit ad</button></span>}
      </div>
      <div className="ad-layouts" data-card-control {...stop} role="radiogroup" aria-label="Layout">{AD_PRESETS.map((x) => <button key={x.id} type="button" role="radio" aria-checked={x.id === preset} className={x.id === preset ? 'on' : ''} data-testid={`ad-layout-${x.id}`} onClick={() => void pickPreset(x.id)}><PresetThumb id={x.id} />{x.label}</button>)}</div>
      {variants.length > 1 && <div className="ad-picks" data-card-control {...stop} role="tablist" aria-label="Headline">{variants.map((v) => <button key={v.n} type="button" role="tab" aria-selected={v.n === view.n} className={v.n === view.n ? 'on' : ''} onClick={() => patch({ pick: v.n })}>Headline {v.n}</button>)}</div>}
      <div className="ad-fields" data-card-control {...stop}>
        {headlines.slice(0, shown).map((h, i) => <div key={i} className="ad-hl">
          <input className="ad-in ad-in-head" data-testid={`ad-headline-${i + 1}`} value={h} maxLength={AD_LIMITS.headline} placeholder={i === 0 ? 'Headline' : `Headline ${i + 1}`} autoFocus={i > 0 && i === more - 1 && !h}
            aria-label={`Headline ${i + 1}`} onChange={(e) => setHeadline(i, e.target.value)} onFocus={() => h.trim() && patch({ pick: i + 1 })} />
          {i > 0 && <button type="button" className="ad-hl-x" data-testid={`ad-headline-${i + 1}-remove`} aria-label={`Remove headline ${i + 1}`} {...tip('Remove')} onClick={() => dropHeadline(i)}><CloseIcon size={12} /></button>}
        </div>)}
        {shown < AD_LIMITS.headlines && <button type="button" className="ad-add" data-testid="ad-headline-add" onClick={() => setMore(shown + 1)}><PlusIcon size={12} />Add another headline</button>}
        <div className="ad-pair">
          <input className="ad-in" data-testid="ad-offer" value={p.offer} maxLength={AD_LIMITS.offer} placeholder="Price or offer" aria-label="Price or offer" onChange={(e) => patch({ offer: e.target.value })} />
          <input className="ad-in" data-testid="ad-button" value={p.button} maxLength={AD_LIMITS.button} placeholder="Button" aria-label="Button text" onChange={(e) => patch({ button: e.target.value })} />
        </div>
        <BrandPick kits={brand.kits} kit={kit} none={p.brandId === NO_BRAND} onPick={(id) => patch({ brandId: id })} />
      </div>
      {art && art.missing.length > 0 && <p className="ad-note" data-testid="ad-font-note">This browser doesn’t have {art.missing.map((m) => `“${m}”`).join(' or ')}, so the ad uses Manrope.</p>}
      {editing && pic && art && <AdEditor sizes={sizes} size={size} onSize={(s) => patch({ size: s.shape })} pic={pic} art={art} text={{ headline: view.headline, offer: p.offer, button: p.button }} preset={preset}
        edit={edit} onEdit={(e) => setEdit(size.shape, e)} showSafe={showSafe} onSafe={(on) => patch({ safeZones: on })} platforms={platforms.length ? platforms : kept} editedSizes={sizes.filter((s) => isEdited(edits[s.shape])).map((s) => s.shape)} onClose={() => setEditing(false)} />}
    </div>
  </NodeFrame>;
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

/** "Brand: <name> ▾": the brand's logo, colours and fonts on the ad. The app's own bar popover (the board switcher's), with "No brand"
 *  and "Add a brand…" (Assets › Brands). */
function BrandPick({ kits, kit, none, onPick }: { kits: BrandKit[]; kit: BrandKit | null; none: boolean; onPick: (id: string) => void }) {
  const btn = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false); const pick = (id: string) => { setOpen(false); onPick(id); };
  const cur = none ? null : kit;
  return <>
    <button ref={btn} type="button" className="ad-brand" data-testid="ad-brand" aria-haspopup="menu" aria-expanded={open} aria-label={`Brand: ${cur?.name ?? 'No brand'}`} onClick={() => setOpen((o) => !o)}>
      <span className="ad-brand-l">Brand</span><KitDots colors={cur?.colors ?? []} /><span className="ad-brand-n">{cur?.name ?? 'No brand'}</span><ChevronDownIcon size={14} /></button>
    <BarPopover open={open} anchor={btn} onClose={() => setOpen(false)} label="Brand" placement="bottom" width={240} testId="ad-brand-pop">
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
