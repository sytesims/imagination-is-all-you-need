/**
 * Jobs with several results (2026-10-25): the shared pieces every multi-result job uses, whatever the workflow (rules and per-workflow
 * presentation: shared/multiResultRules.ts).
 *  - CountBadge: "9 angles" on a feed card;
 *  - ResultMosaic: the feed card's media, up to four results with "+N" (or the page's single image when the presentation is a hero);
 *  - ResultStrip: the viewer's filmstrip under the image: thumbnails with names, the selected one ringed in orange, "3 / 9", number keys,
 *    and the toolbar (Download this, Download all, Grid, Use as input) outside the picture;
 *  - ResultGrid: the viewer's contact sheet (click one to open it) with "Save grid as one image" (a PNG made in the browser).
 * Styles: shared/multiResult.css.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { gridSrc } from './thumbs';
import { appFileName } from './brand';
import { tip } from './Tooltip';
import { GridIcon, ImageStackIcon } from '../ui/Icons';
import { badgeText, countText, digitPick, gridCols, itemLabel, mosaicOf, sheetCell, sheetLayout, type Presentation, type ResultItem } from './multiResultRules';
import './multiResult.css';

const thumbOf = (it: ResultItem, w: number): string | null => !it.url ? null : it.kind === 'video' ? (it.poster && it.poster !== it.url ? gridSrc(it.poster, w) : `/api/media/thumb?url=${encodeURIComponent(it.url)}`) : gridSrc(it.url, w);
const arOf = (items: ResultItem[], fallback = 1) => { const it = items.find((x) => x.w && x.h); return it ? it.w! / it.h! : fallback; };
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const Spinner = () => <i className="mr-spin" aria-hidden />;

export function CountBadge({ items, pres, testId }: { items: ResultItem[]; pres: Presentation; testId?: string }) {
  const t = badgeText(items, pres); const failed = items.some((x) => x.state === 'failed');
  return <span className={`mr-badge${failed ? ' has-fail' : ''}`} data-testid={testId} aria-label={t}>{pres.kind === 'layers' ? <ImageStackIcon size={12} /> : <GridIcon size={12} />}{t}</span>;
}

/** The card's mosaic (2 side by side, 3 as one large + two, 4+ as 2×2 with "+N"). `width` is the card's CSS width, for thumbnail sizes. */
export function ResultMosaic({ items, pres, width, testId }: { items: ResultItem[]; pres: Presentation; width: number; testId?: string }) {
  const m = mosaicOf(items.length); const tiles = items.slice(0, m.show); const cw = Math.round(width / (m.layout === 'm1' ? 1 : 2));
  return <span className={`mr-mosaic ${m.layout} fit-${pres.fit}`} data-testid={testId}>
    {tiles.map((it, k) => { const src = thumbOf(it, cw);
      return <span key={it.url ?? `${it.label}-${k}`} className={`mr-cell st-${it.state}${pres.alpha ? ' alpha-bg' : ''}`}>
        {src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} /> : it.state === 'running' ? <Spinner /> : <span className="mr-cell-fail">Didn’t render</span>}
        {k === m.show - 1 && m.more > 0 && <b className="mr-more" aria-hidden>+{m.more}</b>}
      </span>; })}
  </span>;
}

/** The viewer's filmstrip and toolbar, under the picture (never over it). */
export function ResultStrip({ items, pres, current, onPick, actions, testId = 'mr-strip' }: { items: ResultItem[]; pres: Presentation; /** the shown item's index in `items` */ current: number;
  onPick: (k: number) => void; /** the toolbar's buttons (the viewer's Download this / all, Grid, Use as input) */ actions?: ReactNode; testId?: string }) {
  const row = useRef<HTMLDivElement>(null); const n = items.length; const cur = items[current];
  const pick = useRef(onPick); pick.current = onPick;
  /* number keys pick a result (1–9, 0 = the tenth); typing in a field, a modifier or an open menu leaves them alone */
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.metaKey || e.ctrlKey || e.altKey) return; const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return; if (document.querySelector('.apop, .dlg-scrim, details[open].rv-more')) return;
      const k = digitPick(e.key, n); if (k == null || items[k]?.state !== 'done') return; e.preventDefault(); pick.current(k); };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, [n, items]);
  useEffect(() => { const el = row.current?.children[current] as HTMLElement | undefined; el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: still() ? 'auto' : 'smooth' }); }, [current]);
  /* a row wider than the strip fades at the edge that has more (data-more: start / end / both) */
  const [more, setMore] = useState(''); useEffect(() => { const el = row.current; if (!el) return;
    const upd = () => { const a = el.scrollLeft > 2, b = el.scrollLeft + el.clientWidth < el.scrollWidth - 2; setMore(a && b ? 'both' : a ? 'start' : b ? 'end' : ''); };
    upd(); el.addEventListener('scroll', upd, { passive: true }); const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(upd) : null; ro?.observe(el);
    return () => { el.removeEventListener('scroll', upd); ro?.disconnect(); }; }, [n]);
  const label = cur ? itemLabel(cur, current, pres) : '';
  return <div className={`mr-strip fit-${pres.fit}`} data-testid={testId} role="group" aria-label={`${countText(n, pres)}: pick one`}>
    <div className="mr-strip-h">
      <span className="mr-count" aria-live="polite" data-testid="mr-count"><b>{current + 1}</b><span className="mr-of">/ {n}</span><span className="mr-cur" title={label}>{label}</span></span>
      <span className="mr-hint" aria-hidden><kbd>←</kbd><kbd>→</kbd>{n > 1 && <> or <kbd>1</kbd>–<kbd>{Math.min(n, 9)}</kbd></>}</span>
      {actions && <span className="mr-acts">{actions}</span>}
    </div>
    <div className="mr-thumbs" ref={row} role="tablist" aria-label="Results" data-more={more || undefined}>
      {items.map((it, k) => { const src = thumbOf(it, 128); const nm = itemLabel(it, k, pres); const on = k === current;
        const why = it.state === 'failed' ? `${nm}: didn’t render (not charged). Recreate to try again.` : it.state === 'running' ? `${nm}: still making it` : `${nm}${k < 10 ? ` (${k === 9 ? 0 : k + 1})` : ''}`;
        return <button key={it.url ?? `${nm}-${k}`} type="button" role="tab" aria-selected={on} aria-disabled={it.state !== 'done' || undefined} tabIndex={on ? 0 : -1}
          className={`mr-thumb st-${it.state}${on ? ' on' : ''}`} data-testid={`mr-thumb-${k}`} {...tip(why)} aria-label={why}
          onClick={() => { if (it.state === 'done') onPick(k); }}
          onKeyDown={e => { if (e.key !== 'Home' && e.key !== 'End') return; e.preventDefault(); const t = e.key === 'Home' ? items.findIndex(x => x.state === 'done') : items.map(x => x.state).lastIndexOf('done'); if (t >= 0) onPick(t); }}>
          <span className={`mr-thumb-img${pres.alpha ? ' alpha-bg' : ''}`}>{src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} /> : it.state === 'running' ? <Spinner /> : <span className="mr-x" aria-hidden>!</span>}</span>
          <span className="mr-thumb-l">{it.state === 'failed' ? 'Failed' : nm}</span>
        </button>; })}
    </div>
  </div>;
}

/** Draw the results as one PNG (the contact sheet), names under each when `labels`; resolves with the file name. Same-origin files only. */
export async function saveGridImage(items: ResultItem[], pres: Presentation, labels: boolean, name: string): Promise<string> {
  const ok = items.filter((x) => x.state === 'done' && x.url && x.kind === 'image'); if (!ok.length) throw new Error('Nothing to save yet');
  const imgs = await Promise.all(ok.map((x) => new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => rej(new Error('load')); im.src = x.url!; })));
  const ar = imgs[0].naturalWidth / imgs[0].naturalHeight || 1; const cols = gridCols(ok.length, ar); const rows = Math.ceil(ok.length / cols);
  const cell = sheetCell(ar, cols, rows); const lh = labels ? Math.round(Math.max(36, cell.w * 0.07)) : 0; const gap = Math.round(Math.max(12, cell.w * 0.03)); const pad = gap * 2;
  const L = sheetLayout(ok.length, cols, cell.w, cell.h, gap, pad, lh);
  const cv = document.createElement('canvas'); cv.width = L.w; cv.height = L.h; const g = cv.getContext('2d'); if (!g) throw new Error('canvas');
  g.fillStyle = '#0e0f11'; g.fillRect(0, 0, L.w, L.h);
  imgs.forEach((im, k) => { const { x, y } = L.cells[k]; const iw = im.naturalWidth, ih = im.naturalHeight;
    if (pres.alpha) { const s = 16; for (let yy = 0; yy < cell.h; yy += s) for (let xx = 0; xx < cell.w; xx += s) { g.fillStyle = ((xx + yy) / s) % 2 ? '#2a2c30' : '#3a3d42'; g.fillRect(x + xx, y + yy, Math.min(s, cell.w - xx), Math.min(s, cell.h - yy)); } }
    else { g.fillStyle = '#17181b'; g.fillRect(x, y, cell.w, cell.h); }
    const sc = pres.fit === 'contain' ? Math.min(cell.w / iw, cell.h / ih) : Math.max(cell.w / iw, cell.h / ih); const dw = iw * sc, dh = ih * sc;
    g.save(); g.beginPath(); g.rect(x, y, cell.w, cell.h); g.clip(); g.drawImage(im, x + (cell.w - dw) / 2, y + (cell.h - dh) / 2, dw, dh); g.restore();
    if (labels) { g.fillStyle = '#e9e9ea'; g.font = `600 ${Math.round(lh * 0.5)}px Inter, system-ui, sans-serif`; g.textBaseline = 'middle';
      let t = itemLabel(ok[k], items.indexOf(ok[k]), { ...pres, labels: true }); while (t.length > 1 && g.measureText(t).width > cell.w) t = `${t.slice(0, -2)}…`; g.fillText(t, x, y + cell.h + lh / 2); } });
  const blob: Blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = appFileName(name, 'png'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return a.download;
}

/** The viewer's Grid: every result as a contact sheet that fits the stage (3×3 for nine, 2×2 for four…); click one to open it. */
export function ResultGrid({ items, pres, current, onPick, name, onError, onSaved }: { items: ResultItem[]; pres: Presentation; current: number; onPick: (k: number) => void; /** file name stem for the saved PNG */ name: string;
  onError?: (msg: string) => void; onSaved?: (file: string) => void }) {
  const ar = arOf(items, 16 / 9); const cols = gridCols(items.length, ar); const rows = Math.ceil(items.length / cols);
  const [labels, setLabels] = useState(pres.labels); const [busy, setBusy] = useState(false);
  const canSave = pres.saveGrid && items.some((x) => x.state === 'done' && x.kind === 'image');
  const save = async () => { if (busy) return; setBusy(true); try { onSaved?.(await saveGridImage(items, pres, labels, name)); } catch { onError?.('Couldn’t make the grid image. Try Download all instead.'); } finally { setBusy(false); } };
  const first = useRef<HTMLButtonElement>(null); useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  return <div className="mr-gridwrap" data-testid="mr-grid" style={{ ['--cols' as any]: cols, ['--rows' as any]: rows, ['--ar' as any]: ar }}>
    <div className="mr-grid-h">
      <span className="mr-grid-t"><b>{countText(items.length, pres)}</b><span>Pick one to open it</span></span>
      {canSave && <span className="mr-grid-save">
        <label className="mr-switch" {...tip('Names under each picture, here and in the saved image')}><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)} data-testid="mr-grid-labels" /><i aria-hidden />Names</label>
        <button type="button" className="mr-btn mr-btn-accent" onClick={save} disabled={busy} aria-busy={busy} data-testid="mr-grid-save" {...tip('One PNG with every result in this grid')}>{busy ? 'Making image…' : 'Save grid as one image'}</button></span>}
    </div>
    <div className={`mr-grid fit-${pres.fit}`} role="list">
      {items.map((it, k) => { const src = thumbOf(it, 480); const nm = itemLabel(it, k, pres);
        return <div role="listitem" key={it.url ?? `${nm}-${k}`} className="mr-gcell-w"><button ref={k === current ? first : undefined} type="button" className={`mr-gcell st-${it.state}${k === current ? ' on' : ''}`} disabled={it.state !== 'done'} onClick={() => onPick(k)} data-testid={`mr-grid-${k}`} aria-label={it.state === 'done' ? `Open ${nm}` : `${nm}: ${it.state === 'failed' ? 'didn’t render' : 'still making it'}`}>
          <span className={`mr-gimg${pres.alpha ? ' alpha-bg' : ''}`}>{src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} /> : it.state === 'running' ? <Spinner /> : <span className="mr-cell-fail">Didn’t render</span>}</span>
          {(labels || it.state !== 'done') /* 2026-10-25: the Names switch shows what the saved image will have */ && <span className="mr-gl">{it.state === 'failed' ? `${nm} · failed` : nm}</span>}
        </button></div>; })}
    </div>
  </div>;
}
