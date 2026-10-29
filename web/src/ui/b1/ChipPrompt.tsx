import { Notice } from '../../shared/Notice';
import { Fragment, useRef } from 'react';
/** #5 Prompt with inline @ chips. Tokens not in `valid` render red (stale reference). Uses a mirror layer behind a transparent textarea. */
export default function ChipPrompt({ id, value, onChange, valid, placeholder, rows = 3, maxLength }: { id: string; value: string; onChange: (s: string) => void; valid: string[]; placeholder?: string; rows?: number; maxLength?: number }) {
  const mirror = useRef<HTMLDivElement>(null);
  const parts = value.split(/(@[\w-]+(?: \d+)?)/g);
  const isTok = (p: string) => /^@[\w-]+/.test(p);
  const bad = parts.filter(isTok).filter(p => !valid.some(v => v.toLowerCase() === p.slice(1).toLowerCase()));
  return (
    <div className={`chip-prompt ${bad.length ? 'has-bad' : ''}`}>
      <div className="cp-mirror" ref={mirror} aria-hidden="true">{parts.map((p, i) => <Fragment key={i}>{isTok(p) ? <mark className={bad.includes(p) ? 'bad' : ''}>{p}</mark> : p}</Fragment>)}{'\n'}</div>
      <textarea id={id} rows={rows} maxLength={maxLength} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} onScroll={e => { if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop; }} />
      {bad.length > 0 && <Notice as="p" kind="warn" tone="line" className="cp-warn">{bad.join(', ')} no longer attached: re-add the media or remove the mention.</Notice>}
    </div>
  );
}
