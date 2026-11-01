import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { UploadIcon } from '../Icons';
import { IMAGE_ACCEPT, VIDEO_ACCEPT } from '../../../../server/src/shared/mediaAccept';
export interface MediaItem { id: string; url: string; poster?: string; kind: 'video' | 'image'; name?: string; ts?: number; liked?: boolean }
export type PickerTab = 'uploads' | 'presets' | 'generations' | 'liked';
/** #1 Media picker modal. Pure presentation: caller supplies the item lists (Platform: media API). */
export default function MediaPicker({ open, kind, sources, onPick, onUpload, onClose, initialTab = 'uploads', counts, onQuery, hasMore, onMore, loading, error }: {
  counts?: Partial<Record<PickerTab, number>> | null; onQuery?: (q: { tab: PickerTab; range: 'recent' | 'all'; sort: 'new' | 'old' | 'name' }) => void; hasMore?: boolean; onMore?: () => void; loading?: boolean; error?: string;
  open: boolean; kind: 'video' | 'image'; sources: Partial<Record<PickerTab, MediaItem[]>>; initialTab?: PickerTab;
  onPick: (m: MediaItem) => void; onUpload: (files: File[]) => void; onClose: () => void }) {
  const [tab, setTab] = useState<PickerTab>(initialTab); const [range, setRange] = useState<'recent' | 'all'>('recent'); const [sort, setSort] = useState<'new' | 'old' | 'name'>('new');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) onQuery?.({ tab, range, sort }); }, [open, tab, range, sort]); // eslint-disable-line
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [open, onClose]);
  const items = useMemo(() => {
    let xs = (sources[tab] ?? []).filter(m => m.kind === kind);
    if (range === 'recent' && !onQuery) xs = xs.slice(0, 24);
    if (onQuery) return xs; // server-sorted (GET /api/media?sort=new|old|name)
    return [...xs].sort((a, b) => sort === 'name' ? (a.name ?? '').localeCompare(b.name ?? '') : ((b.ts ?? 0) - (a.ts ?? 0)) * (sort === 'new' ? 1 : -1));
  }, [sources, tab, kind, range, sort]);
  if (!open) return null;
  const tabs: [PickerTab, string][] = [['uploads', 'Uploads'], ['presets', 'Looks'], ['generations', 'My generations'], ['liked', 'Favourites']];
  return createPortal(
    <div className="mp-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="mp" role="dialog" aria-modal="true" aria-label={`Choose a ${kind}`}>
        <header className="mp-head">
          <div className="mp-tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<span>{counts?.[k] ?? (sources[k] ?? []).filter(m => m.kind === kind).length}</span></button>)}</div>
          <button className="mp-x" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="mp-bar">
          <div className="seg seg-chips"><button className={range === 'recent' ? 'on' : ''} onClick={() => setRange('recent')}>Recent</button><button className={range === 'all' ? 'on' : ''} onClick={() => setRange('all')}>All</button></div>
          <select value={sort} onChange={e => setSort(e.target.value as 'new' | 'old' | 'name')} aria-label="Sort" data-testid="mp-sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name A–Z</option></select>
        </div>
        <div className="mp-grid">
          {tab === 'uploads' && <button className="mp-upload" onClick={() => file.current?.click()}><b><UploadIcon size={22} /></b><span>Upload {kind}</span><small>{kind === 'video' ? 'MP4 · MOV · WEBM' : 'PNG · JPG · WEBP'}</small></button>}
          {items.map(m => <button key={m.id} className="mp-item" onClick={() => onPick(m)} title={m.name}>
            {m.kind === 'video' ? <video src={m.url} poster={m.poster} muted playsInline preload="metadata" onMouseEnter={e => e.currentTarget.play().catch(() => 0)} onMouseLeave={e => e.currentTarget.pause()} /> : <img src={m.url} alt={m.name ?? ''} />}
            {m.liked && <span className="mp-like">♥</span>}{m.name && <span className="mp-name">{m.name}</span>}</button>)}
          {!items.length && tab !== 'uploads' && !loading && <p className="mp-empty">{error || 'Nothing here yet.'}</p>}
          {loading && !items.length && Array.from({ length: 6 }, (_, i) => <span key={i} className="mp-item mp-skel" />)}
          {hasMore && <button className="btn mp-more" disabled={loading} onClick={onMore}>{loading ? 'Loading…' : 'Load more'}</button>}
        </div>
        <input ref={file} type="file" hidden multiple={kind === 'image'} accept={kind === 'video' ? VIDEO_ACCEPT : IMAGE_ACCEPT} onChange={e => { onUpload([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
    </div>, document.body
  );
}
