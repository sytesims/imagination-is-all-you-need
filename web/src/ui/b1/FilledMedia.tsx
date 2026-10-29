/** #2 Filled upload box: thumbnails with hover remove (and zoom for images) plus a trailing "+" slot. */
export interface FilledItem { id: string; url: string; kind: 'video' | 'image'; label?: string }
export default function FilledMedia({ items, max, onRemove, onZoom, onAdd, emptyLabel = 'Add media', pinned = [], onPin, onReplace }: { onReplace?: (id: string) => void; pinned?: string[]; onPin?: (id: string) => void; items: FilledItem[]; max: number; onRemove: (id: string) => void; onZoom?: (id: string) => void; onAdd: () => void; emptyLabel?: string }) {
  if (!items.length) return <button className="fm-empty" onClick={onAdd}><b>＋</b><span>{emptyLabel}</span></button>;
  return (
    <div className="fm">
      {items.map(m => <figure key={m.id} className={`fm-tile ${m.kind} ${pinned.includes(m.id) ? 'pinned' : ''}`}>
        {m.kind === 'video' ? <video src={m.url} muted loop playsInline autoPlay /> : <img src={m.url} alt={m.label ?? ''} />}
        {m.label && <figcaption>{m.label}</figcaption>}
        {pinned.includes(m.id) && <span className="fm-pin-flag" title="Used in every group">📌</span>}<div className="fm-acts">{onPin && <button aria-label={pinned.includes(m.id) ? 'Unpin' : 'Pin: use in every group'} aria-pressed={pinned.includes(m.id)} title={pinned.includes(m.id) ? 'Used in every group · click to unpin' : 'Pin: use in every group'} onClick={() => onPin(m.id)}>📌</button>}{m.kind === 'image' && onZoom && <button aria-label="Zoom" onClick={() => onZoom(m.id)}>⤢</button>}{onReplace && <button className="fm-replace" onClick={() => onReplace(m.id)}>Replace video</button>}<button aria-label="Remove" className="fm-rm" onClick={() => onRemove(m.id)}>✕</button></div>
      </figure>)}
      {items.length < max && <button className="fm-add" aria-label="Add more" onClick={onAdd}>＋</button>}
    </div>
  );
}
