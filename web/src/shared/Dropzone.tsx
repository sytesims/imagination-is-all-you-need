import { Notice } from './Notice';
import { UploadIcon } from '../ui/Icons';
import { useRef, useState, type ReactNode } from 'react';
/** UploadZone: the one empty-state upload box for every tool (videos, references, start frames, audio, app inputs).
 *  Row layout: a 40px icon tile, a one-line title (with an optional count) over a helper, and a separate actions slot on the right
 *  (e.g. the library button) that never sits over the title. States: hover, focus (ring on the hit area), drag-over, uploading
 *  (progress bar), error (message under the box, red border), disabled. The filled state is the tool's own preview (FilledMedia). */
export function UploadZone({ accept, label, helper, multiple, onFiles, actions, count, error, busy, progress, disabled, testId, icon, inputTestId }: {
  accept: string; label: string; helper?: ReactNode; multiple?: boolean; onFiles: (f: File[]) => void;
  /** library / add buttons, ≥32px (44 on phones) */ actions?: ReactNode; count?: ReactNode; error?: string | null; busy?: boolean | string;
  /** 0..1, or undefined for an indeterminate bar while busy */ progress?: number; disabled?: boolean; testId?: string; icon?: ReactNode; inputTestId?: string;
}) {
  const [over, setOver] = useState(false); const inp = useRef<HTMLInputElement>(null); const depth = useRef(0);
  const pick = () => { if (!disabled && !busy) inp.current?.click(); };
  return (
    <div className={`uz dropzone${over ? ' over' : ''}${error ? ' is-err' : ''}${busy ? ' is-busy' : ''}${disabled ? ' is-off' : ''}`} data-testid={testId}
      onDragEnter={e => { e.preventDefault(); depth.current++; if (!disabled) setOver(true); }}
      onDragOver={e => { e.preventDefault(); }} onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
      onDrop={e => { e.preventDefault(); depth.current = 0; setOver(false); if (disabled) return; const f = [...e.dataTransfer.files]; f.length && onFiles(f); }}>
      <button type="button" className="uz-hit" disabled={disabled} aria-busy={busy ? true : undefined} title={typeof helper === 'string' ? `${label} · ${helper}` : label} onClick={pick}>
        <span className="uz-ic" aria-hidden>{icon ?? <UploadIcon size={20} />}</span>
        <span className="uz-txt"><span className="uz-h"><strong className="uz-t">{label}</strong>{count != null && <span className="uz-n">{count}</span>}</span>
          {helper && <span className="uz-help helper">{busy ? (typeof busy === 'string' ? busy : 'Uploading…') : helper}</span>}</span>
      </button>
      {actions && <div className="uz-acts">{actions}</div>}
      {busy && <span className="uz-bar" aria-hidden><i style={progress != null ? { width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`, animation: 'none' } : undefined} /></span>}
      {/* a click opens the one media picker (shared/MediaPicker.tsx: library or this computer); its title and limits come from this box */}
      <input ref={inp} type="file" accept={accept} multiple={multiple} hidden data-testid={inputTestId} data-picker-title={label} data-picker-limits={typeof helper === 'string' ? helper : undefined} onChange={e => { const f = [...(e.target.files ?? [])]; f.length && onFiles(f); e.target.value = ''; }} />
      {error && <Notice as="p" kind="error" tone="line" className="uz-err">{error}</Notice>}
    </div>
  );
}
/** Older name, same component (every caller of Dropzone gets the shared UploadZone). */
export default function Dropzone(p: Parameters<typeof UploadZone>[0]) { return <UploadZone {...p} />; }
