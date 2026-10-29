/**
 * The tab feeds' shared scope pieces (2026-10-26), one copy for the Image tab (ui/next/ImageCanvas) and the Video tab (ui/video/VideoFeed):
 * - useLiveJobs: the page's own runs plus every queued / running job on the server (another workflow, tab, Canvas, MCP) and the ones that
 *   finished since load (shared/activeJobs), merged one per id (feedFilter mergeLiveJobs);
 * - UploadsFeed: Filter › From › Uploads, your own files from the media library (GET /api/media?tab=uploads, the picker's Uploads: files you uploaded,
 *   inputs you gave runs, saved frames), each marked as an upload (no model, no price), opening in the viewer with "Use in…".
 */
import { useEffect, useMemo, useState } from 'react';
import type { JobState } from '../../../api';
import { useActiveJobs } from '../../../shared/activeJobs';
import { jobSig } from '../../../shared/backoff';
import { tip } from '../../../shared/Tooltip';
import { fetchMedia, type MediaItem } from '../../../shared/batch1';
import { gridSrc } from '../../../shared/thumbs';
import { ViewerShell, ViewerDetails, ViewerVideo, whenText, RefGlyph, VideoGlyph } from '../../../shared/ResultViewer';
import { ViewerImage } from '../../../shared/ViewerImage';
import { DownloadIcon, UpscaleIcon, FrameGrabIcon } from '../../Icons';
import { Link, navigate } from '../../../platform/router';
import { uploadUses, uploadTag, type UploadUse } from './uploadLinks';
export { uploadUses, uploadTag } from './uploadLinks';
import { mergeLiveJobs, type FeedFilter } from './feedFilter';
import '../../../shared/exampleViewer.css'; /* .exv-chip, .exv-note: the viewer's "not a generation" chip and note */
import './feed.css';
import { FeedVideo } from './FeedCard';
import { clampAr, tileMaxH } from './feedMedia';

/** The live jobs a tab feed watches: the page's own, plus active and just-finished jobs from anywhere. */
export function useLiveJobs(jobs: JobState[]): JobState[] {
  const act = useActiveJobs(); const actSig = act.jobs.map(j => `${j.id}:${jobSig(j)}`).join(',') + '/' + act.finished.map(j => `${j.id}:${j.status}`).join(',');
  return useMemo(() => mergeLiveJobs(jobs, act.jobs, act.finished), [jobs, actSig]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ---------------- Uploads ---------------- */
const PAGE = 60;
const USE_ICON: Record<UploadUse['k'], React.ReactNode> = { motion: <VideoGlyph />, extend: <FrameGrabIcon size={18} />, upscale: <UpscaleIcon size={18} />, ref: <RefGlyph />, start: <VideoGlyph /> };
/** The media library's Uploads for one tab, paged; the toolbar's search and sort apply. */
export function useUploads(media: 'image' | 'video', project: string | null, f: Pick<FeedFilter, 'q' | 'sort'>, on: boolean) {
  const [st, setSt] = useState<{ key: string; items: MediaItem[]; total: number; page: number; more: boolean; loading: boolean; error: string }>({ key: '', items: [], total: 0, page: 0, more: false, loading: false, error: '' });
  const key = JSON.stringify([media, project, f.q.trim(), f.sort]);
  const load = async (page: number) => { setSt(s => ({ ...s, key, loading: true, error: '', ...(s.key !== key ? { items: [], total: 0 } : {}) }));
    try { const d = await fetchMedia({ tab: 'uploads', type: media, sort: f.sort === 'old' ? 'old' : 'new', q: f.q.trim(), pageSize: PAGE, page, ...(project ? { project } : {}) });
      setSt(s => s.key !== key && page > 1 ? s : { key, items: page === 1 ? d.items : [...s.items, ...d.items], total: d.total, page, more: d.hasMore, loading: false, error: '' }); }
    catch { setSt(s => ({ ...s, key, loading: false, error: 'Couldn’t load your uploads' })); } };
  useEffect(() => { if (!on) return; const t = setTimeout(() => void load(1), f.q ? 220 : 0); return () => clearTimeout(t); }, [key, on]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...st, fresh: st.key === key, loadMore: () => { if (st.more && !st.loading) void load(st.page + 1); }, refresh: () => void load(1) };
}
export type Uploads = ReturnType<typeof useUploads>;

/** The Uploads chip's grid (same justified rows as the feed) and the viewer. */
export function UploadsFeed({ up, media, size, onReference, idPre }: { up: Uploads; media: 'image' | 'video'; size: FeedFilter['size']; onReference?: (url: string) => void; idPre: string }) {
  const [ars, setArs] = useState<Record<string, number>>({}); const [open, setOpen] = useState<number | null>(null);
  const items = up.fresh ? up.items : [];
  /* a clip's shape from its poster (the server's first-frame still), so the row doesn't reflow once known */
  useEffect(() => { for (const it of items) if (it.type === 'video' && !ars[it.url] && it.thumbUrl) { const im = new Image(); im.onload = () => { if (im.naturalWidth) setArs(r => ({ ...r, [it.url]: im.naturalWidth / im.naturalHeight })); }; im.src = it.thumbUrl; } }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const noun = media === 'video' ? 'clips' : 'images';
  if (!items.length) return <div className="fd-empty" data-testid="fd-empty" role="status">{up.loading || !up.fresh ? <p>Loading…</p> : up.error ? <p>{up.error} <button type="button" className="fd-link" onClick={up.refresh}>Try again</button></p>
    : <p data-testid={`${idPre}-uploads-empty`}>No uploaded {noun} yet. {media === 'video' ? 'Clips you add to a workflow' : 'Photos you add to the bar or a workflow'} show up here.</p>}</div>;
  const cur = open != null ? items[open] ?? null : null;
  return <>
    <div className="ic-feed ic-jfeed up-feed" data-size={size} data-testid={`${idPre}-uploads`}>
      {items.map((it, i) => { const ar = ars[it.url] || (it.type === 'video' ? 16 / 9 : 1); const tag = uploadTag(it);
        return <div key={it.id} className="ic-tile st-done up-tile" style={{ ['--ar' as any]: String(clampAr(ar)) }} data-testid={`${idPre}-up-${i}`} data-url={it.url}>
          <button type="button" className="ic-tile-hit" aria-label={`Open upload: ${it.name}`} onClick={() => setOpen(i)}>
            {it.type === 'video' ? <FeedVideo src={it.url} poster={it.thumbUrl} width={tileMaxH() * clampAr(ar)} />
              : <img src={gridSrc(it.url, tileMaxH() * clampAr(ar))} alt="" loading="lazy" decoding="async" onLoad={e => { const im = e.currentTarget; if (im.naturalWidth && !ars[it.url]) setArs(r => ({ ...r, [it.url]: im.naturalWidth / im.naturalHeight })); }} />}
          </button>
          <span className="ic-tile-feat up-tag" data-testid={`${idPre}-up-tag-${i}`}>{tag}</span>
          <span className="ic-tile-meta up-meta"><span>{it.name}</span></span>
        </div>; })}
      <i className="ic-jfill" aria-hidden />
    </div>
    {up.more && <div className="fd-more"><button type="button" className="btn btn-sm" data-testid="fd-more" disabled={up.loading} onClick={up.loadMore}>{up.loading ? 'Loading…' : `Show more · ${Math.max(0, up.total - items.length).toLocaleString()} left`}</button></div>}
    {cur && <UploadViewer it={cur} onClose={() => setOpen(null)} onReference={onReference} onPrev={open! > 0 ? () => setOpen(open! - 1) : null} onNext={open! < items.length - 1 ? () => setOpen(open! + 1) : null} pos={`${open! + 1} / ${items.length}`} />}
  </>;
}

/** One upload, full screen: the file, what it is (an upload or a saved frame, never a model or a price), and "Use in…". */
export function UploadViewer({ it, onClose, onReference, onPrev, onNext, pos }: { it: MediaItem; onClose: () => void; onReference?: (url: string) => void; onPrev?: (() => void) | null; onNext?: (() => void) | null; pos?: string }) {
  const [nat, setNat] = useState(''); useEffect(() => setNat(''), [it.url]);
  const tag = uploadTag(it); const uses = uploadUses(it, onReference ? (u) => { onClose(); onReference(u); } : null);
  const media = it.type === 'video' ? <ViewerVideo key={it.url} src={it.url} poster={it.thumbUrl} label={it.name} autoPlay={false} onMeta={v => { if (v.videoWidth) setNat(`${v.videoWidth}×${v.videoHeight}`); }} />
    : <ViewerImage key={it.url} className="rvx-img" src={it.url} before={null} alt={it.name} onLoad={e => { const im = e.currentTarget; if (im.naturalWidth) setNat(`${im.naturalWidth}×${im.naturalHeight}`); }} />;
  const rows: [string, React.ReactNode][] = [['File', <span data-testid="up-name">{it.name}</span>], ['Kind', tag === 'Upload' ? (it.type === 'video' ? 'Your clip' : 'Your image') : 'A frame saved from a video'], ['Added', whenText(it.createdAt)],
    ...(nat ? [['Size', nat] as [string, string]] : []), ...((it.uses ?? 0) > 1 ? [['Used', `${it.uses} times`] as [string, string]] : []),
    ...(it.frameOf?.jobId ? [['From', <Link to={`/jobs/${encodeURIComponent(it.frameOf.jobId)}`} data-testid="up-from-clip">the source clip</Link>] as [string, React.ReactNode]] : [])];
  const go = (u: UploadUse) => (e: React.MouseEvent) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); if (u.onClick) { u.onClick(); return; } onClose(); navigate(u.href); };
  const footer = <>
    <p className="up-use-h" id="up-use-h">Use in…</p>
    <div className="rvx-tiles" role="group" aria-labelledby="up-use-h" data-testid="up-use">
      {uses.map(u => <a key={u.k} className="rvx-tile" href={u.href} onClick={go(u)} data-testid={`up-use-${u.k}`} aria-label={u.tip} {...tip(u.tip)}>{USE_ICON[u.k]}<span>{u.label}</span></a>)}
      <a className="rvx-tile" href={it.url} download={it.url.split('/').pop()} data-testid="rv-download" aria-label="Download" {...tip('Download')}><DownloadIcon size={18} /><span>Save</span></a></div>
    <p className="exv-note up-note" data-testid="up-note">{tag === 'Upload' ? 'Your own file, not a generation. Uploads stay in your library: runs that used them still point to them.' : 'A frame you saved from a video. Find it under Filter › Type › Frames.'}</p></>;
  return <ViewerShell testId="result-viewer" label={`Upload: ${it.name}`} bg={it.type === 'image' ? it.url : it.thumbUrl} media={media} itemKey={it.id}
    who={{ name: it.name, role: tag === 'Upload' ? 'Your upload' : 'Saved frame', self: true }} badge={<span className="rvx-badges"><em className="exv-chip up-chip" data-testid="up-chip">{tag}</em></span>}
    tabs={[{ id: 'info', label: 'Info' }]} tab="info" setTab={() => 0} onClose={onClose} onPrev={onPrev} onNext={onNext} pos={pos}
    body={<ViewerDetails rows={rows} />} footer={footer} />;
}
