/**
 * Many files on a Create bar (2026-10-31, many references): the bar shows a few thumbnails and a "+N" tile; "+N" opens this small tray,
 * anchored above it (the shared Popover), listing EVERY attached file (pictures, clips, sounds) with remove, drag to reorder (within its
 * own kind: the order sets @image1, @video1…) and the "Not used" mark. One component for Image, Video and Audio.
 *  - Alt+↑ / Alt+↓ on a row moves it too (keyboard reorder).
 */
import { useRef, useState, type RefObject } from 'react';
import { BarPopover, PopSection } from './BarPop';
import { tip } from './Tooltip';
import { CloseIcon } from '../ui/Icons';
import type { MediaKind } from '../../../server/src/shared/mediaAccept';
import './filesTray.css';

export type TrayFile = {
  /** unique on the bar */ key: string; /** the list it belongs to ('refs', 'refVideos'…); rows move only within it */ group: string; /** its index in that list */ idx: number;
  kind: MediaKind; url?: string; name: string; /** "Picture 2 · @image2", "Start frame" */ label: string; /** not sent to this model */ off?: boolean;
  /** pinned (the start frame): no remove here, no drag */ fixed?: boolean;
};

export function MoreFiles({ items, hidden, onRemove, onMove, watch, summary, offText = 'Not used', testId = 'more-files' }: {
  items: TrayFile[]; /** how many aren't shown as thumbnails (the "+N") */ hidden: number;
  onRemove: (f: TrayFile) => void; onMove?: (group: string, from: number, to: number) => void;
  /** the composer dock: the tray opens above it */ watch?: RefObject<HTMLElement | null>; /** the head's right side ("Uses 9 of your 12") */ summary?: string;
  offText?: string; testId?: string;
}) {
  const at = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false);
  const drag = useRef<TrayFile | null>(null); const [over, setOver] = useState<string | null>(null);
  if (hidden <= 0) return null;
  const hiddenOff = items.slice(items.length - hidden).some(f => f.off);
  const kinds = new Set(items.map(f => f.kind)); const noun = kinds.size > 1 ? 'files' : items[0]?.kind === 'video' ? 'clips' : items[0]?.kind === 'audio' ? 'sounds' : 'pictures';
  const canMove = (a: TrayFile, b: TrayFile) => !!onMove && !a.fixed && !b.fixed && a.group === b.group && a.idx !== b.idx;
  const step = (f: TrayFile, d: -1 | 1) => { const to = items.find(x => x.group === f.group && x.idx === f.idx + d); if (to && canMove(f, to)) onMove!(f.group, f.idx, to.idx); };
  return <>
    <button ref={at} type="button" className={`ic-th-more${hiddenOff ? ' warn' : ''}`} data-ref-trigger data-testid={`${testId}-btn`} aria-haspopup="dialog" aria-expanded={open}
      aria-label={`${hidden} more. See all ${items.length} ${noun}`} {...tip(open ? null : `${items.length} ${noun} in all · click to see them all`)} onClick={() => setOpen(o => !o)}>+{hidden}</button>
    <BarPopover open={open} anchor={at} avoid={watch} watch={watch} placement="top" gap={8} width={320} onClose={() => setOpen(false)} label={`Your ${noun}`} testId={`${testId}-tray`}>
      <PopSection label={`Your ${noun} · ${items.length}`} aside={summary}>
        <ul className="ft-list" role="list">
          {items.map(f => <li key={f.key} className={`ft-row${f.off ? ' off' : ''}${over === f.key ? ' drop' : ''}`} data-testid={`${testId}-row-${f.group}-${f.idx}`} data-unused={f.off ? '1' : undefined}
            draggable={!!onMove && !f.fixed} tabIndex={0} aria-label={`${f.label}: ${f.name}${f.off ? `. ${offText}` : ''}`}
            onDragStart={e => { drag.current = f; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-tray', f.key); }}
            onDragOver={e => { const d = drag.current; if (d && canMove(d, f)) { e.preventDefault(); setOver(f.key); } }} onDragLeave={() => setOver(o => (o === f.key ? null : o))}
            onDrop={e => { const d = drag.current; drag.current = null; setOver(null); if (d && canMove(d, f)) { e.preventDefault(); onMove!(f.group, d.idx, f.idx); } }} onDragEnd={() => { drag.current = null; setOver(null); }}
            onKeyDown={e => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); step(f, e.key === 'ArrowUp' ? -1 : 1); } else if ((e.key === 'Delete' || e.key === 'Backspace') && !f.fixed) { e.preventDefault(); onRemove(f); } }}>
            <span className="ft-th" aria-hidden>{f.kind === 'image' && f.url ? <img src={f.url} alt="" /> : f.kind === 'video' && f.url ? <video src={f.url} muted preload="metadata" /> : <span>♪</span>}</span>
            <span className="ft-t"><b>{f.label}</b><small title={f.name}>{f.name}</small></span>
            {f.off && <em className="ft-off">{offText}</em>}
            {!f.fixed && <button type="button" className="ft-x" aria-label={`Remove ${f.name}`} data-testid={`${testId}-x-${f.group}-${f.idx}`} onClick={() => onRemove(f)}><CloseIcon size={12} /></button>}
          </li>)}
        </ul>
        {onMove && <p className="ft-hint">Drag to reorder: the order sets @image1, @image2…</p>}
      </PopSection>
    </BarPopover>
  </>;
}

/** "3 not added: Nano Banana 2 takes up to 4 pictures", inline under the composer's prompt line (beside the switch note), until dismissed or the next add. */
export function LeftNote({ text, onClose, testId = 'bar-left' }: { text: string; onClose: () => void; testId?: string }) {
  if (!text) return null;
  return <p className="bar-left" role="status" data-testid={testId}><span>{text}</span><button type="button" className="ft-x" aria-label="Dismiss" onClick={onClose}><CloseIcon size={10} /></button></p>;
}
/** The words of LeftNote: "3 not added: Nano Banana 2 takes up to 4 pictures." */
export const notAddedText = (n: number, takes: string) => (n > 0 ? `${n} not added: ${takes.replace(/^This model/, 'this model')}.` : '');
