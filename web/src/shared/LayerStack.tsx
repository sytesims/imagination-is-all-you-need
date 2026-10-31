/**
 * Image to layers (2026-10-24): one job, several transparent PNG layers (the background plate first, then each element in stacking order).
 * Shared pieces for every place a layered result shows (Create Image's feed and the full-screen viewer in shared/ResultView); written for any
 * multi-output job that stacks, not only this workflow:
 *  - layersPosterOf: the composite (every layer in order, made once by the server: job.layersPosterUrl) for the feed card and the Output thumbnail;
 *  - LayerCount: the "N layers" chip on a feed card;
 *  - useLayerView: the viewer's state (hidden layers, the selected layer), one per job;
 *  - LayerCanvas: the viewer's stage, every visible layer composited over a checkerboard in order, the selected layer's box outlined;
 *  - LayerTile (2026-10-27): one layer as a tile, cropped to its content (its box, else measured once) with ~8% padding, contained, on a LIGHT
 *    transparency checkerboard (as in design tools) so dark text and logos read. The viewer's layer list and Explore's chapter 2 both use it;
 *  - LayerList: the panel list (top first): thumbnail, name, description, show / hide, Download per layer; Show all / Hide all; Download all (.zip)
 *    (the job's clean ZIP) and Download PSD (built in the browser from the clean files: shared/layerPsd.ts).
 * Pixel helpers: shared/layerCompose.ts. The rules (which jobs are layered, the names) are in server/src/shared/imageLayers.ts.
 */
import { WorksWith } from './WorksWith';
import { useEffect, useState } from 'react';
import { isLayerJob, layerCountText } from '../../../server/src/shared/imageLayers';
import { LayerSheetsIcon, DownloadIcon } from '../ui/Icons';
import { tip } from './Tooltip';
import { cleanHref } from './sharePrefs';
import { appFileName } from './brand';
import { alphaBounds, boxPercent, loadRgba, type Box } from './layerCompose';
import './layerStack.css';

export { isLayerJob, layerCountText };
export type Layer = { url: string; label?: string; description?: string; box?: number[] | null };
const IMG = /\.(png|jpe?g|webp)($|\?)/i;
/** The layers of a finished layered job, bottom first (null when it isn't one or has fewer than two images). */
export function layersOf(job: { input?: any; outputs?: Layer[] | null } | null | undefined): Layer[] | null {
  if (!isLayerJob(job)) return null; const ls = (job?.outputs ?? []).filter((o) => o && IMG.test(String(o.url))); return ls.length > 1 ? ls : null;
}
/** The picture a layered job shows as one image (feed card, Output thumbnail): the server's composite, else (no poster field) the top layer. */
export function layersPosterOf(job: { layersPosterUrl?: string | null } | null | undefined, layers: Layer[]): string {
  return (typeof job?.layersPosterUrl === 'string' && job.layersPosterUrl) || layers[layers.length - 1].url;
}
export const layerName = (l: Layer, k: number) => l.label?.trim() || (k === 0 ? 'Background' : `Layer ${k}`);
const fileStem = (jobId: string, l: Layer, k: number) => `${jobId}-${String(k + 1).padStart(2, '0')}-${layerName(l, k).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}`;

export function LayerCount({ n, testId, hint = 'Each layer is a transparent PNG. Open it to show, hide or download them.' }: { n: number; testId?: string; hint?: string }) {
  return <span className="ly-count" data-testid={testId} {...tip(hint)}><LayerSheetsIcon size={13} />{layerCountText(n)}</span>;
}

/** The viewer's layer state for one job: hidden layers (eye buttons) and the selected layer (its box outlined on the stage). Resets on another job. */
export function useLayerView(jobId: string) {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set()); const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => { setHidden(new Set()); setSelected(null); }, [jobId]);
  return { hidden, selected,
    toggle: (k: number) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; }),
    showAll: () => setHidden(new Set()), hideAll: (n: number) => setHidden(new Set(Array.from({ length: n }, (_, k) => k))),
    select: (k: number | null) => setSelected((s) => (s === k ? null : k)) };
}
export type LayerView = ReturnType<typeof useLayerView>;

/** A layer's box on the picture: the model's own (bounding_box), else measured from its pixels once (cached per URL). */
const measured = new Map<string, Promise<Box | null>>();
function useLayerBox(l: Layer | null): Box | null {
  const own = l && Array.isArray(l.box) && l.box.length === 4 ? (l.box.map(Number) as Box) : null; const [box, setBox] = useState<Box | null>(own);
  useEffect(() => { if (!l) { setBox(null); return; } if (own) { setBox(own); return; } let live = true; setBox(null);
    if (!measured.has(l.url)) measured.set(l.url, loadRgba(l.url).then(alphaBounds).catch(() => null));
    measured.get(l.url)!.then((b) => { if (live) setBox(b); }); return () => { live = false; }; }, [l?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  return box;
}

/** A layer's content box and its canvas size: given (both known, e.g. measured at build time), else measured from its pixels once (cached per URL). */
const fitted = new Map<string, Promise<{ box: Box; w: number; h: number } | null>>();
function useLayerFit(l: Layer, size?: [number, number]): { box: Box; w: number; h: number } | null {
  const own = Array.isArray(l.box) && l.box.length === 4 && size ? { box: l.box.map(Number) as Box, w: size[0], h: size[1] } : null;
  const [fit, setFit] = useState(own);
  useEffect(() => { if (own) { setFit(own); return; } let live = true; setFit(null);
    if (!fitted.has(l.url)) fitted.set(l.url, loadRgba(l.url).then((im) => { const b = alphaBounds(im); return b ? { box: b, w: im.width, h: im.height } : null; }).catch(() => null));
    fitted.get(l.url)!.then((f) => { if (live) setFit(f); }); return () => { live = false; }; }, [l.url, own?.box.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return fit;
}
/** The padded crop (~8% of the content's longer side, at least 2% of the canvas), kept inside the canvas. */
export function layerTileView([l, t, r, b]: Box, w: number, h: number): Box {
  const p = Math.max(0.08 * Math.max(r - l, b - t), 0.02 * Math.max(w, h));
  const x0 = Math.max(0, l - p), y0 = Math.max(0, t - p), x1 = Math.min(w, r + p), y1 = Math.min(h, b + p); return [x0, y0, x1 - x0, y1 - y0];
}
/** One layer as a tile: its content, padded and contained, on a light checkerboard. Until its box is known, the whole layer (contained). `size` is the
 *  canvas in pixels when `layer.box` is known up front (no measuring). */
export function LayerTile({ layer, size, className = '', alt = '', testId }: { layer: Layer; size?: [number, number]; className?: string; alt?: string; testId?: string }) {
  const fit = useLayerFit(layer, size); const v = fit ? layerTileView(fit.box, fit.w, fit.h) : null;
  return <span className={`ly-tile-pic alpha-bg-light ${className}`} data-testid={testId} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
    {v ? <svg viewBox={v.map((n) => Math.round(n * 10) / 10).join(' ')} preserveAspectRatio="xMidYMid meet" aria-hidden><image href={layer.url} width={fit!.w} height={fit!.h} /></svg>
      : <img src={layer.url} alt="" loading="lazy" decoding="async" draggable={false} />}
  </span>;
}

/** Every visible layer stacked in order over a checkerboard, sized like the picture (`ar` = width / height, else the first layer's shape once it loads). */
export function LayerCanvas({ layers, view, ar, label }: { layers: Layer[]; view: Pick<LayerView, 'hidden' | 'selected'>; ar?: number; label: string }) {
  const [nat, setNat] = useState<[number, number] | null>(null); const r = ar && ar > 0 ? ar : nat ? nat[0] / nat[1] : 1; const { hidden, selected } = view;
  const shown = layers.length - hidden.size; const sel = selected != null ? layers[selected] ?? null : null; const box = useLayerBox(sel);
  return <div className="rvx-media rvx-fit ly-canvas alpha-bg" style={{ ['--ar' as any]: r }} role="img" aria-label={`${label}: ${shown} of ${layerCountText(layers.length)} shown`} data-testid="ly-canvas">
    {layers.map((l, k) => <img key={l.url} src={l.url} alt="" draggable={false} className={hidden.has(k) ? 'ly-off' : undefined} data-testid={`ly-canvas-${k}`}
      onLoad={k === 0 ? (e) => { const im = e.currentTarget; if (im.naturalWidth && im.naturalHeight) setNat([im.naturalWidth, im.naturalHeight]); } : undefined} />)}
    {sel && box && nat && <span className="ly-box" style={boxPercent(box, nat[0], nat[1])} data-testid="ly-box" aria-hidden><b>{layerName(sel, selected!)}</b></span>}
    {shown === 0 && <span className="ly-none">All layers hidden</span>}
  </div>;
}

const EyeIcon = ({ off }: { off: boolean }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" />{off && <path d="M4 20 20 4" />}</svg>;

/** Download PSD: the clean layer files (no metadata, the same as the ZIP) → one layered .psd, named layers at their positions, the hidden ones hidden. */
export async function downloadLayersPsd(jobId: string, layers: Layer[], hidden: ReadonlySet<number>) {
  const [{ buildLayeredPsd }, imgs] = await Promise.all([import('./layerPsd'), Promise.all(layers.map((l) => loadRgba(cleanHref(l.url))))]);
  const bytes = buildLayeredPsd(layers.map((l, k) => ({ name: layerName(l, k), image: imgs[k], hidden: hidden.has(k) })), imgs[0].width, imgs[0].height);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/vnd.adobe.photoshop' }));
  const a = document.createElement('a'); a.href = url; a.download = appFileName(jobId, 'psd'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { bytes: bytes.length, name: a.download };
}

/** The panel list: top layer first (as in an editor's layer panel), each with a thumbnail, its name and description, show / hide and Download;
 *  clicking a layer outlines it on the stage. Then Download all (.zip) and Download PSD. */
export function LayerList({ jobId, layers, view, onError }: { jobId: string; layers: Layer[]; view: LayerView; onError?: (msg: string) => void }) {
  const { hidden, selected, toggle, showAll, hideAll, select } = view; const order = layers.map((l, k) => ({ l, k })).reverse(); const [psd, setPsd] = useState<'' | 'busy' | 'done'>('');
  const getPsd = async () => { if (psd === 'busy') return; setPsd('busy');
    try { await downloadLayersPsd(jobId, layers, hidden); setPsd('done'); setTimeout(() => setPsd(''), 2000); } catch { setPsd(''); onError?.('Couldn’t build the PSD. Try Download all (.zip) instead.'); } };
  return <section className="rvx-sec ly-sec" aria-label="Layers" data-testid="ly-list">
    <div className="rvx-sec-h"><span className="rvx-lbl"><LayerSheetsIcon size={16} />Layers <small className="ly-n">{layers.length}</small></span>
      <span className="ly-bulk">{hidden.size > 0 && <button type="button" className="rvx-copy" onClick={showAll} data-testid="ly-show-all">Show all</button>}
        {hidden.size < layers.length && <button type="button" className="rvx-copy" onClick={() => hideAll(layers.length)} data-testid="ly-hide-all">Hide all</button>}</span></div>
    <ul className="ly-rows">
      {order.map(({ l, k }) => { const off = hidden.has(k); const nm = layerName(l, k); const on = selected === k; const pos = k === 0 ? 'Bottom' : k === layers.length - 1 ? 'Top' : `Layer ${k + 1} of ${layers.length}`;
        const sub = l.description?.trim() || pos;
        return <li key={l.url} className={`ly-row${off ? ' off' : ''}${on ? ' on' : ''}`} data-testid={`ly-row-${k}`}>
          <button type="button" className="ly-eye" aria-pressed={!off} aria-label={`${off ? 'Show' : 'Hide'} ${nm}`} {...tip(off ? 'Show layer' : 'Hide layer')} onClick={() => toggle(k)} data-testid={`ly-eye-${k}`}><EyeIcon off={off} /></button>
          <button type="button" className="ly-pick" aria-pressed={on} onClick={() => select(k)} data-testid={`ly-pick-${k}`} {...tip(`${nm}${l.description ? ` · ${l.description}` : ''} · ${pos}. ${on ? 'Click to clear the outline' : 'Click to outline it on the picture'}`)}>
            <LayerTile layer={l} className="ly-thumb" />
            <span className="ly-name"><b>{nm}</b><small>{sub}</small></span></button>
          <a className="ly-dl" href={cleanHref(l.url)} download={appFileName(fileStem(jobId, l, k), 'png')} aria-label={`Download ${nm} (PNG)`} {...tip('Download this layer (PNG)')} data-testid={`ly-dl-${k}`}><DownloadIcon size={15} /></a>
        </li>; })}
    </ul>
    <div className="ly-alls">
      <a className="ly-all" href={`/api/jobs/${encodeURIComponent(jobId)}/download.zip`} download data-testid="ly-dl-all" {...tip('Every layer as a PNG, plus settings.json')}><DownloadIcon size={15} />Download all (.zip)</a>
      <button type="button" className="ly-all" onClick={getPsd} disabled={psd === 'busy'} aria-busy={psd === 'busy'} data-testid="ly-dl-psd" {...tip('One layered Photoshop file: every layer named and in place')}>
        <DownloadIcon size={15} />{psd === 'busy' ? 'Building PSD…' : psd === 'done' ? 'PSD downloaded' : 'Download PSD'}</button>
    </div>
    <WorksWith className="ly-works" testId="ly-works-with">Opens in Photoshop, Photopea and GIMP, with every layer.</WorksWith>
  </section>;
}
