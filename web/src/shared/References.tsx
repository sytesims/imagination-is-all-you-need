import { IMAGE_ACCEPT, fileFits, wrongTypeText } from '../../../server/src/shared/mediaAccept';
import { useState } from 'react';
import Dropzone from './Dropzone';
import LibraryButton from '../ui/b1/LibraryButton';
import FilledMedia from '../ui/b1/FilledMedia';
import { useRef } from 'react';
import { useToast } from './Toast';
export interface Ref { file: File; url: string }
/** Shared reference-image screen (1..max images). */
export default function References({ title, helper, refs, max, onChange, locked, optional, pinned: pinnedProp, onPin, groupSize = 8, dropLabel }: { dropLabel?: string; pinned?: string[]; onPin?: (url: string) => void; groupSize?: number; title: string; helper?: string; refs: Ref[]; max: number; onChange: (r: Ref[]) => void; locked?: boolean; optional?: boolean }) {
  const toast = useToast(); const more = useRef<HTMLInputElement>(null); const [zoom, setZoom] = useState<string | null>(null);
  const [localPins, setLocalPins] = useState<string[]>([]); const pinned = pinnedProp ?? localPins; const pin = onPin ?? ((u: string) => setLocalPins(p => p.includes(u) ? p.filter(x => x !== u) : [...p, u]));
  const groups = refs.length > groupSize ? Math.ceil((refs.length - pinned.length) / Math.max(1, groupSize - pinned.length)) : 1;
  const [err, setErr] = useState<string | null>(null);
  const add = (files: File[]) => {
    const imgs = files.filter(f => fileFits('image', f));
    setErr(null); if (imgs.length < files.length) { const m = wrongTypeText(files.find(f => !imgs.includes(f))?.name ?? '', ['image']); if (refs.length || imgs.length) toast(m, 'error'); else setErr(m); }
    const room = max - refs.length;
    if (imgs.length > room) toast(`Maximum ${max} reference images.`, 'error');
    onChange([...refs, ...imgs.slice(0, room).map(file => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const acts = <LibraryButton icon kind="image" onFiles={add} />;
  return (
    <section className={`card ${locked ? 'locked' : ''}`}>
      <h2>{title} <span className="ref-count">{refs.length} / {max}</span></h2>
      {refs.length > groupSize && <p className="chip info-chip">Over {groupSize} references: we'll make one video per group of up to {groupSize} ({refs.length} → {groups} videos). Pinned refs are used in every group.</p>}
      {refs.length > 0 && <FilledMedia items={refs.map((r, i) => ({ id: r.url, url: r.url, kind: 'image', label: `@image${i + 1}` }))} max={max} pinned={pinned} onPin={refs.length > 1 ? pin : undefined} onRemove={id => onChange(refs.filter(r => r.url !== id))} onZoom={id => setZoom(id)} onAdd={() => more.current?.click()} />}
      <input ref={more} type="file" hidden multiple accept={IMAGE_ACCEPT} onChange={e => { const f = [...(e.target.files ?? [])]; f.length && add(f); e.target.value = ''; }} />
      {zoom && <div className="mp-scrim" onClick={() => setZoom(null)}><img className="zoom-img" src={zoom} alt="Reference preview" /></div>}
      {refs.length >= max && max > 1 && <p className="helper ref-max" role="status" data-testid="ref-max">Maximum {max} references. Remove one to add another.</p>}
      {refs.length > 0 && refs.length < max && <div className="uz-more">{acts}</div>}
      {refs.length === 0 && <Dropzone accept={IMAGE_ACCEPT} multiple label={dropLabel ?? 'Reference images'} helper={helper ?? 'PNG, JPG, WEBP · clear, well-lit, single subject works best'} onFiles={add} actions={acts} error={err} />}
    </section>
  );
}
