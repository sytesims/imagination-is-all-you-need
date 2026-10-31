/**
 * Upload slots, the shared parts (2026-10-29), used by every Create bar's thumbnails (Create Video first; .ic-th in shared createBar.css):
 *  - <SlotPreview>: click a thumbnail → a larger preview with its name, size and notes, and Replace / Remove (+ "Use as start frame / end
 *    frame" where the model takes one). One popover, anchored to the thumbnail.
 *  - <SlotCount>: "1 of 9 pictures · 0 of 3 clips", from the selected model's real caps (the bar passes them; one source of truth);
 *    over the limit it says what is used, as the model menu does: "Uses 1 of your 9 pictures".
 *  - fullText(): the reason the + is dimmed ("This model takes up to 9 pictures").
 *  - prepUpload(): the size check every upload goes through: a picture bigger than the largest size any model renders is scaled down
 *    (with a note), a clip or sound over the upload cap is refused with the limit.
 *  - shapeNote(): a picture whose shape differs from the clip's ("3:4 picture, 16:9 clip: fitted").
 * Reordering is the bar's own (drag a thumbnail onto another: useSlotReorder).
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Popover } from './Popover';
import { aspectWH } from './BarPop';
import { PREP_MAX_SIDE } from '../../../server/src/shared/photoFit';
import type { MediaKind } from '../../../server/src/shared/mediaAccept';
import './slotPreview.css';

export type SlotFileLike = { file: File; url: string };
const NOUN: Record<MediaKind, [string, string]> = { image: ['picture', 'pictures'], video: ['clip', 'clips'], audio: ['sound', 'sounds'] };
export const nounOf = (k: MediaKind, n: number) => NOUN[k][n === 1 ? 0 : 1];
/** "This model takes up to 9 pictures" / "… up to 9 pictures and 3 clips" */
export function fullText(caps: Partial<Record<MediaKind, number>>, who = 'This model'): string {
  const parts = (Object.entries(caps) as [MediaKind, number][]).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${nounOf(k, n)}`);
  return parts.length ? `${who} takes up to ${parts.join(' and ')}` : `${who} takes no references`;
}

/** One kind on the count: "3 of 9 pictures", or over the limit "Uses 1 of your 9 pictures" (the model menu's words, shared/refFit partText). */
export const slotText = (k: MediaKind, used: number, cap: number) => used > cap ? `Uses ${cap} of your ${used} ${nounOf(k, used)}` : `${used} of ${cap} ${nounOf(k, cap)}`;
/** "1 of 9 pictures · 0 of 3 clips": one item per kind the model takes; over the limit turns it orange. */
export function SlotCount({ used, caps, testId = 'slot-count' }: { used: Partial<Record<MediaKind, number>>; caps: Partial<Record<MediaKind, number>>; testId?: string }) {
  const all = (Object.keys(caps) as MediaKind[]).filter(k => (caps[k] ?? 0) > 0 && ((caps[k] ?? 0) > 1 || (used[k] ?? 0) > 0));
  /* on the bar: the kinds in use (pictures always); every kind in the tooltip */
  const kinds = all.filter((k, i) => (used[k] ?? 0) > 0 || k === 'image' || (i === 0 && !all.includes('image'))); if (!kinds.length) return null;
  const full = all.map(k => slotText(k, used[k] ?? 0, caps[k] ?? 0)).join(' · ');
  const over = kinds.some(k => (used[k] ?? 0) > (caps[k] ?? 0)); const isFull = kinds.every(k => (used[k] ?? 0) >= (caps[k] ?? 0));
  return <span className={`slot-count${over ? ' over' : isFull ? ' full' : ''}`} data-testid={testId} role="status" aria-live="polite" title={full}>
    {kinds.map((k, i) => <span key={k}>{i > 0 && <i aria-hidden> · </i>}{slotText(k, used[k] ?? 0, caps[k] ?? 0)}</span>)}</span>;
}

export const UPLOAD_MAX_MB = 200; // the server's upload cap (index.ts MAX_UPLOAD_MB)
const IMG_MAX_MB = 30;
/** Size check on the way in. Pictures above PREP_MAX_SIDE px or IMG_MAX_MB are scaled down in the browser (JPEG, or PNG when it has
 *  transparency) with a note; clips and sounds over the upload cap are refused with the limit. */
export async function prepUpload(f: File, kind: MediaKind): Promise<{ file: File; note?: string } | { error: string }> {
  if (kind !== 'image') return f.size > UPLOAD_MAX_MB * 1e6 ? { error: `${f.name} is ${(f.size / 1e6).toFixed(0)} MB. Files can be up to ${UPLOAD_MAX_MB} MB.` } : { file: f };
  let bmp: ImageBitmap; try { bmp = await createImageBitmap(f); } catch { return { error: `${f.name} couldn’t be opened as a picture.` }; }
  const long = Math.max(bmp.width, bmp.height); if (long <= PREP_MAX_SIDE && f.size <= IMG_MAX_MB * 1e6) { bmp.close?.(); return { file: f }; }
  const k = Math.min(1, PREP_MAX_SIDE / long); const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const type = f.type === 'image/png' || f.type === 'image/webp' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>(res => c.toBlob(res, type, 0.92)); if (!blob) return { error: `${f.name} is too big to use (over ${PREP_MAX_SIDE} px).` };
  const name = f.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
  return { file: new File([blob], name, { type }), note: `${f.name} was ${long} px on its long side: scaled down to ${Math.max(w, h)} px.` };
}

/** A picture whose shape is far from the clip's aspect: the note the preview shows (the run fits it; the server's adjust note says the same). */
export function shapeNote(w: number, h: number, aspect: string | undefined): string | null {
  if (!w || !h || !aspect || aspect === 'auto') return null; const wh = aspectWH(aspect); if (!wh) return null;
  const a = w / h, b = wh[0] / wh[1]; if (Math.abs(Math.log(a / b)) < 0.06) return null;
  return `This picture is ${a > 1.02 ? 'wide' : a < 0.98 ? 'tall' : 'square'} and the clip is ${aspect}: it will be fitted to ${aspect}.`;
}

/** Drag a thumbnail onto another to reorder (the order sets @image1, @image2…). Returns props for each thumbnail. */
export function useSlotReorder(onMove: (from: number, to: number) => void) {
  const from = useRef<number | null>(null); const [over, setOver] = useState<number | null>(null);
  return (i: number) => ({ draggable: true, 'data-drop-over': over === i ? '1' : undefined,
    onDragStart: (e: React.DragEvent) => { from.current = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-slot', String(i)); },
    onDragOver: (e: React.DragEvent) => { if (from.current == null) return; e.preventDefault(); e.stopPropagation(); setOver(i); },
    onDragLeave: () => setOver(o => (o === i ? null : o)),
    onDrop: (e: React.DragEvent) => { if (from.current == null) return; e.preventDefault(); e.stopPropagation(); const f = from.current; from.current = null; setOver(null); if (f !== i) onMove(f, i); },
    onDragEnd: () => { from.current = null; setOver(null); } });
}

export type SlotAction = { label: string; testId: string; onClick: () => void; primary?: boolean };
/** The larger preview of one uploaded file. */
export function SlotPreview({ open, anchor, onClose, item, kind, title, notes = [], warn, onReplace, onRemove, actions = [], aspect, watch, testId = 'slot-preview' }: {
  open: boolean; anchor: RefObject<HTMLElement | null>; onClose: () => void; item: SlotFileLike | null; kind: MediaKind; /** "Start frame", "Picture 2 · @image2" */ title: string;
  notes?: ReactNode[]; /** "Won't be sent: this model takes up to 9 pictures" */ warn?: string | null; onReplace?: () => void; onRemove?: () => void; actions?: SlotAction[];
  /** the clip's aspect, for the shape note */ aspect?: string; watch?: RefObject<HTMLElement | null>; testId?: string }) {
  const [dims, setDims] = useState<[number, number] | null>(null); const [sec, setSec] = useState<number | null>(null);
  useEffect(() => { setDims(null); setSec(null); }, [item?.url]);
  if (!item) return null;
  const size = item.file.size > 1e6 ? `${(item.file.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(item.file.size / 1024))} KB`;
  const facts = [dims ? `${dims[0]}×${dims[1]}` : null, sec != null ? `${sec.toFixed(1)} s` : null, size].filter(Boolean).join(' · ');
  const shape = kind === 'image' && dims ? shapeNote(dims[0], dims[1], aspect) : null;
  return <Popover open={open} anchor={anchor} avoid={watch} watch={watch} gap={8} onClose={onClose} label={title} testId={testId} className="slot-pv-pop" width={320}>
    <div className="slot-pv">
      <div className="slot-pv-media">
        {kind === 'image' ? <img src={item.url} alt={title} onLoad={e => setDims([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
          : kind === 'video' ? <video src={item.url} controls muted playsInline preload="metadata" onLoadedMetadata={e => { setSec(e.currentTarget.duration); setDims([e.currentTarget.videoWidth, e.currentTarget.videoHeight]); }} />
          : <audio src={item.url} controls preload="metadata" onLoadedMetadata={e => setSec(e.currentTarget.duration)} />}
      </div>
      <div className="slot-pv-head"><b>{title}</b><small title={item.file.name}>{item.file.name}</small><small data-testid={`${testId}-facts`}>{facts}</small></div>
      {warn && <p className="slot-pv-note warn" data-testid={`${testId}-warn`}>{warn}</p>}
      {[shape, ...notes].filter(Boolean).map((n, i) => <p key={i} className="slot-pv-note">{n}</p>)}
      <div className="slot-pv-acts">
        {actions.map(a => <button key={a.testId} type="button" className={`slot-pv-btn${a.primary ? ' primary' : ''}`} data-testid={a.testId} onClick={() => { onClose(); a.onClick(); }}>{a.label}</button>)}
        {onReplace && <button type="button" className="slot-pv-btn" data-testid={`${testId}-replace`} onClick={() => { onClose(); onReplace(); }}>Replace</button>}
        {onRemove && <button type="button" className="slot-pv-btn danger" data-testid={`${testId}-remove`} onClick={() => { onClose(); onRemove(); }}>Remove</button>}
      </div>
    </div>
  </Popover>;
}

/** Opens the shared preview from an audio/file thumbnail; temporary URLs live only while its preview is open. */
export function useFilePreview(watch?: RefObject<HTMLElement | null>) {
  const anchor = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<{ file: File; url: string; ownUrl: boolean; kind: MediaKind; title: string; replace?: () => void; remove?: () => void } | null>(null);
  useEffect(() => () => { if (view?.ownUrl) URL.revokeObjectURL(view.url); }, [view]);
  const show = (at: HTMLElement, file: File, kind: MediaKind, title: string, replace?: () => void, remove?: () => void, url?: string) => {
    anchor.current = at; setView({ file, kind, title, replace, remove, url: url ?? URL.createObjectURL(file), ownUrl: !url });
  };
  return { show, preview: view ? <SlotPreview open anchor={anchor} watch={watch} onClose={() => setView(null)} item={view} kind={view.kind} title={view.title} onReplace={view.replace} onRemove={view.remove} testId="file-slot-preview" /> : null };
}
