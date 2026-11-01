/**
 * The Ad layout card (2026-10-30, preview first 2026-10-31): one picture in (an arrow from an upload or a result), your words, and the
 * brand's logo, colours and fonts laid on top by code, so the words and the logo are always right. The card is mostly the ad: a slim
 * title row, the preview edge to edge (the card's height follows the ad's shape, nodeTypes.adCardHeight) and one bar under it: the
 * size switch (the picked platforms' sizes), Brand, Edit and Export. A double-click on the headline, offer or button edits it in place;
 * elsewhere on the ad it opens the big editor (AdEditor.tsx with AdPanel.tsx's sections: picture, text, style, layout, platforms,
 * export). With more than one headline, 1 2 3 on the preview's corner switches them. "Export" saves every size × every headline as PNGs
 * in one zip, a folder per platform with the post text. Free, in the browser. The maths is adLayout.ts, adPlatforms.ts and adEdit.ts,
 * the drawing adDraw.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, useValue } from 'tldraw';
import { useToast } from '../shared/Toast';
import { askConfirm } from '../shared/Dialog';
import { tip } from '../shared/Tooltip';
import { useBrand } from '../shared/brandStore';
import { ImageIcon } from '../ui/Icons';
import { pickMedia } from '../shared/MediaPicker';
import { libraryUrlOf } from '../shared/libraryFiles';
import { uploadMedia } from '../shared/batch1';
import { NodeFrame } from './NodeFrame';
import { arrowsInto, cardInputs, linkShapes } from './graph';
import { freeSpot } from './placement';
import { GROUP_TYPE, NODE_DEFS, adCardFit, nodeDefOf } from './nodeTypes';
import { createAuxNode, type AdNodeProps } from './auxShapes';
import { AD_LIMITS, adPackFiles, adVariants, asPreset, asStyle, type AdLayout, type AdPreset, type AdStyle, type Box } from './adLayout';
import { AD_PLATFORM_LIST, DEFAULT_PLATFORMS, adExportPlan, adSizesFor, asPlatforms, asShape, type AdPlatform } from './adPlatforms';
import { asEdits, inBox, isEdited, type AdEdit, type AdEdits } from './adEdit';
import type { AdSection } from './AdEditor';
import { AdCardEditor, Brand, EditBtn, ExportBtn, NO_BRAND } from './AdPanel';
import { drawAd, drawSafeZones, exportAdPack, loadAdArt, loadAdPicture, type AdArt } from './adDraw';
import type { BrandKit } from '../../../server/src/shared/brandKit';
import { IMAGE_ACCEPT } from '../../../server/src/shared/mediaAccept';

/** The editor's last open section on each card, for this session. */
const lastSection = new Map<string, AdSection>();
const stop = { onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyUp: (e: React.SyntheticEvent) => e.stopPropagation() };

type AdShapeRef = { id: any; type: string; props: AdNodeProps };
type InlinePart = 'headline' | 'offer' | 'button';
const INLINE_PARTS: InlinePart[] = ['button', 'offer', 'headline'];
type InlineEdit = { part: InlinePart; box: Box; was: string };
const MAX: Record<InlinePart, number> = { headline: AD_LIMITS.headline, offer: AD_LIMITS.offer, button: AD_LIMITS.button };
const PART_LABEL: Record<InlinePart, string> = { headline: 'Headline', offer: 'Price or offer', button: 'Button text' };
/** All of the card's state and actions (the card and the editor's sections share them). */
function useAdCard(shape: AdShapeRef) {
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
  const style = useMemo(() => asStyle(p.style), [p.style]); const setStyle = (st: AdStyle) => patch({ style: asStyle(st) as Record<string, unknown> });
  const edits = useMemo(() => asEdits(p.edits), [p.edits]); const edit = edits[size.shape]; const [editing, setOpen] = useState<false | AdSection>(false);
  /* the editor opens where it was last left on this card (for the session); "where it runs" opens Platforms */
  const setEditing = (at: false | AdSection | 'last') => { const s = at === 'last' ? lastSection.get(shape.id) ?? 'picture' : at; if (s) lastSection.set(shape.id, s); setOpen(s); };
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

  /* the card's height follows the ad's shape (when it's shown, and when the size changes): shorter always; taller only when that
   *  covers no other card (the preview then fits inside). A card still at an old default takes today's width (nodeTypes.adCardFit). */
  useEffect(() => {
    const to = adCardFit(p.w, p.h, size.w / size.h); if (!to) return; if (!to.grow) { patch({ w: to.w, h: to.h }); return; }
    const me = editor.getShapePageBounds(shape.id); if (!me) return;
    const grown = { minX: me.minX, maxX: me.minX + to.w, minY: me.minY, maxY: me.minY + to.h };
    const hits = editor.getCurrentPageShapes().some((s) => { if (s.id === shape.id || s.type === GROUP_TYPE || !nodeDefOf(s.type)) return false; const b = editor.getShapePageBounds(s.id);
      return !!b && b.minX < grown.maxX && b.maxX > grown.minX && b.minY < grown.maxY && b.maxY > grown.minY; });
    patch(hits ? { w: Math.min(to.w, p.w) } : { w: to.w, h: to.h });
  }, [size.shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const [art, setArt] = useState<AdArt | null>(null); const [pic, setPic] = useState<HTMLImageElement | null>(null); const [picErr, setPicErr] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { let on = true; loadAdArt(kit).then((a) => on && setArt(a)).catch(() => on && setArt(null)); return () => { on = false; }; }, [kit?.id, kit?.updatedAt, kit?.logo?.url, kit?.fonts.heading, kit?.fonts.body]);
  useEffect(() => { let on = true; setPicErr(false); if (!picUrl) { setPic(null); return; } loadAdPicture(picUrl).then((i) => on && setPic(i)).catch(() => { if (on) { setPic(null); setPicErr(true); } }); return () => { on = false; }; }, [picUrl]);

  /* a state ref, not useRef: the frame unmounts its body when zoomed far out, and the new canvas must be drawn again */
  const [c, setCanvas] = useState<HTMLCanvasElement | null>(null); const { w: W, h: H, safe } = size; const [lay, setLay] = useState<AdLayout | null>(null);
  useEffect(() => {
    if (!c || !art || !pic) return; const k = 0.5; c.width = W * k; c.height = H * k;
    const g = c.getContext('2d'); if (!g) return; g.setTransform(k, 0, 0, k, 0, 0); setLay(drawAd(g, W, H, pic, art, { headline: view.headline, offer: p.offer, button: p.button }, { safe, preset, edit, style }));
    if (showSafe) drawSafeZones(g, W, H, safe);
  }, [c, art, pic, W, H, safe, preset, showSafe, view.headline, p.offer, p.button, edit, style]);

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
  const choose = () => pickMedia({ accept: IMAGE_ACCEPT, title: input ? 'Change the picture' : 'Choose a picture', onFiles: ([f]) => { if (f) void place(f); } });

  const exportPack = async () => {
    if (!art || !pic || busy) return; setBusy(true);
    try { const n = await exportAdPack({ pic, art, headlines, offer: p.offer, button: p.button, platforms: picked, sizes, preset, edits, style }); toast(`Saved ${n} pictures and the post text in one zip`); }
    catch (e) { toast((e as Error).message || 'Couldn’t make the pack.', 'error'); } finally { setBusy(false); }
  };
  const setHeadline = (i: number, v: string) => { const h = [...headlines]; h[i] = v; patch({ headlines: h }); };
  /* remove an extra headline: the ones below move up, and the preview keeps showing the same words */
  const dropHeadline = (i: number) => { const h = headlines.filter((_, j) => j !== i); h.push(''); const n = p.pick === i + 1 ? 0 : p.pick > i + 1 ? p.pick - 1 : p.pick;
    patch({ headlines: h, pick: n }); setMore(shown - 1); };
  /* the pack: a folder per platform, its own sizes × every headline */
  const picked = platforms.length ? platforms : kept; const count = adPackFiles(kit?.name ?? 'ad', picked, headlines).length; const folders = adExportPlan(picked).length;
  /* a double-click on the preview: on the headline, offer or button it edits those words in place (the preview follows as you type;
   *  Enter or a click away keeps them, Esc puts them back); anywhere else it opens the editor. The second press is caught here, before
   *  the board reads it as a double-click on empty board (which starts a text box); the first still selects and drags the card. */
  const lastDown = useRef(0); const [inline, setInline] = useState<InlineEdit | null>(null);
  const hi = Math.max(0, view.n - 1);
  const textOf = (part: InlinePart) => (part === 'headline' ? headlines[hi] : part === 'offer' ? p.offer : p.button) ?? '';
  const setText = (part: InlinePart, v: string) => (part === 'headline' ? setHeadline(hi, v) : patch(part === 'offer' ? { offer: v } : { button: v }));
  const twice = (e: React.PointerEvent) => {
    if (e.button !== 0) return; if (e.timeStamp - lastDown.current >= 400 || !art) { lastDown.current = e.timeStamp; return; }
    e.stopPropagation(); e.preventDefault(); lastDown.current = 0;
    const part = partAt(e); if (part) setInline({ part, box: lay!.boxes[part]!, was: textOf(part) }); else setEditing('last');
  };
  /* the words under the pointer (a text cursor says they can be typed over) */
  const partAt = (e: React.PointerEvent): InlinePart | null => { if (!lay) return null; const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    return INLINE_PARTS.find((q) => lay.boxes[q] && inBox(lay.boxes[q]!, x, y)) ?? null; };
  const hover = (e: React.PointerEvent<HTMLElement>) => { e.currentTarget.style.cursor = partAt(e) ? 'text' : ''; };

  return { editor, p, patch, input, picUrl, kit, brand, platforms, picked, sizes, size, preset, showSafe, style, setStyle, edits, edit, setEdit, editing, setEditing, pickPreset, togglePlatform,
    headlines, shown, more, setMore, variants, view, art, pic, picErr, busy, setCanvas, placing, choose, exportPack, setHeadline, dropHeadline, count, folders, twice, hover, W, H, safe,
    inline, setInline, textOf, setText };
}
export type AdCard = ReturnType<typeof useAdCard>;

/** Words typed over the preview, where they sit on the ad. Enter or a click away keeps them, Esc puts them back. */
function InlineText({ ad }: { ad: AdCard }) {
  const e = ad.inline!; const { W, H } = ad; const done = useRef(false);
  const close = (keep: boolean) => { if (done.current) return; done.current = true; if (!keep) ad.setText(e.part, e.was); ad.setInline(null); };
  /* Esc and Enter are read before the board's own keys (which would blur the box and deselect the card first) */
  useEffect(() => { const key = (ev: KeyboardEvent) => { if (ev.key !== 'Escape' && ev.key !== 'Enter') return; ev.stopPropagation(); ev.preventDefault(); close(ev.key === 'Enter'); };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true); }); // eslint-disable-line react-hooks/exhaustive-deps
  const left = Math.min(e.box.x / W, 0.4) * 100;
  return <input className={`ad-inline ad-inline-${e.part}`} data-card-control data-testid={`ad-inline-${e.part}`} autoFocus value={ad.textOf(e.part)} maxLength={MAX[e.part]}
    placeholder={PART_LABEL[e.part]} aria-label={PART_LABEL[e.part]} onFocus={(ev) => ev.currentTarget.select()}
    style={{ left: `${left}%`, top: `${Math.min(e.box.y / H * 100, 88)}%`, width: `${Math.max(e.box.w / W * 100, 56)}%`, maxWidth: `${96 - left}%` }}
    onChange={(ev) => ad.setText(e.part, ev.target.value)} onBlur={() => close(true)}
    onKeyDown={(ev) => ev.stopPropagation()}
    onKeyUp={(ev) => ev.stopPropagation()} onPointerDown={(ev) => ev.stopPropagation()} onDoubleClick={(ev) => ev.stopPropagation()} />;
}

/** The card: a slim title row, the ad edge to edge (1 2 3 on its corner when there are more headlines), and one bar: size, Brand,
 *  Edit and Export. */
export function AdView({ shape, Icon }: { shape: AdShapeRef; Icon: (q: { size?: number }) => JSX.Element }) {
  const ad = useAdCard(shape); const { size, sizes, edits, W, H, view, variants } = ad;
  const box = { aspectRatio: `${W} / ${H}`, width: `min(100cqw, ${(W / H).toFixed(4)} * 100cqh)` };
  return <NodeFrame shapeId={shape.id} type={shape.type} icon={<Icon />} title="Ad layout" heading={view?.headline || 'Your headline'} label="Ad layout" className="ad-card">
    <div className="ad-body">
      <div className="ad-stage">
        {ad.pic ? <div className="ad-pv" style={box}>
          <canvas ref={ad.setCanvas} className="ad-canvas" onPointerDown={ad.twice} onPointerMove={ad.hover} aria-label={`Ad preview, ${size.label}. Double-click the words to change them, anywhere else to edit the ad.`} />
          {variants.length > 1 && <span className="ad-dots" role="tablist" aria-label="Headline" data-card-control {...stop}>{variants.map((v) => <button key={v.n} type="button" role="tab" aria-selected={v.n === view.n}
            className={v.n === view.n ? 'on' : ''} data-testid={`ad-pick-${v.n}`} {...tip(`Headline ${v.n}: ${v.headline}`)} onClick={() => ad.patch({ pick: v.n })}>{v.n}</button>)}</span>}
          {ad.inline && <InlineText ad={ad} />}
        </div> :
          <div className="ad-ghost" style={box} data-testid="ad-empty">
            <i className="ad-g-logo" />
            <span className="ad-g-msg"><b>{ad.picErr ? 'That picture couldn’t be read' : 'Start with a picture'}</b>
              <small>{ad.picErr ? 'Try another one.' : 'One with no text. Your words and logo go on top.'}</small>
              <button type="button" className="ad-choose" data-card-control {...stop} data-testid="ad-choose" disabled={ad.placing} onClick={ad.choose}><ImageIcon size={16} />{ad.placing ? 'Adding…' : ad.picErr ? 'Choose another picture' : 'Choose a picture'}</button></span>
            <span className="ad-g-text" aria-hidden><i className="ad-g-h" /><i className="ad-g-h ad-g-h2" /><i className="ad-g-offer" /><i className="ad-g-btn" /></span></div>}
      </div>
      <div className="ad-bar" data-card-control {...stop}>
        <div className="ad-seg ad-seg-s" role="tablist" aria-label="Size">{sizes.map((s) => <button key={s.shape} type="button" role="tab" aria-selected={s === size} className={`${s === size ? 'on' : ''}${isEdited(edits[s.shape]) ? ' ed' : ''}`} data-testid={`ad-size-${s.shape}`}
          {...tip(`${s.label} · ${s.w} × ${s.h} · ${s.where}${isEdited(edits[s.shape]) ? ' · your own layout' : ''}`)} onClick={() => ad.patch({ size: s.shape })}>{s.label.replace(' Story', '')}</button>)}</div>
        <Brand ad={ad} compact />
        <EditBtn ad={ad} />
        <ExportBtn ad={ad} icon />
      </div>
      <AdCardEditor ad={ad} />
    </div>
  </NodeFrame>;
}
