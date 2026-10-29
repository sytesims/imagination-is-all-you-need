import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** In-app dialogs instead of window.prompt / window.confirm.
 *  askText({...}) resolves to the trimmed text or null; askConfirm({...}) resolves to true/false.
 *  One <DialogHost/> is mounted in App. Esc cancels, Enter confirms, focus returns to where it was. */
type TextReq = { kind: 'text'; title: string; label?: string; placeholder?: string; initial?: string; confirm?: string; maxLength?: number };
type ConfirmReq = { kind: 'confirm'; title: string; body?: string | string[]; confirm?: string; cancel?: string; danger?: boolean;
  /** A side action that runs without closing the dialog (e.g. “Export first”). */ extra?: { label: string; onClick: () => void; testid?: string } };
type Req = (TextReq | ConfirmReq) & { resolve: (v: any) => void };
let push: ((r: Req) => void) | null = null;
const ask = <T,>(r: Omit<TextReq, 'kind'> & { kind: 'text' } | Omit<ConfirmReq, 'kind'> & { kind: 'confirm' }, fallback: () => T) =>
  new Promise<T>(resolve => { if (!push) { resolve(fallback()); return; } push({ ...(r as any), resolve }); });
export const askText = (o: Omit<TextReq, 'kind'>) => ask<string | null>({ kind: 'text', ...o }, () => null);
export const askConfirm = (o: Omit<ConfirmReq, 'kind'>) => ask<boolean>({ kind: 'confirm', ...o }, () => false);

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null); const [val, setVal] = useState(''); const [closing, setClosing] = useState(false);
  const back = useRef<HTMLElement | null>(null); const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { push = r => { back.current = document.activeElement as HTMLElement; setVal(r.kind === 'text' ? r.initial ?? '' : ''); setClosing(false); setReq(r); }; return () => { push = null; }; }, []);
  useEffect(() => { if (!req) return; requestAnimationFrame(() => { if (input.current) { input.current.focus(); input.current.select(); /* a rename starts with the old name selected, so typing replaces it */ return; } box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }); }, [req]);
  if (!req) return null;
  const done = (v: any) => { const r = req; setClosing(true); setTimeout(() => { setReq(null); setClosing(false); r.resolve(v); back.current?.focus?.(); }, 140); };
  const ok = () => { if (req.kind === 'text') { const t = val.trim(); if (!t) return; done(t); } else done(true); };
  const cancel = () => done(req.kind === 'text' ? null : false);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    else if (e.key === 'Tab') { const f = [...(box.current?.querySelectorAll<HTMLElement>('input,button') ?? [])].filter(x => !(x as HTMLButtonElement).disabled); if (!f.length) return; const i = f.indexOf(document.activeElement as HTMLElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
  };
  return createPortal(<div className={`dlg-scrim${closing ? ' out' : ''}`} onMouseDown={e => e.target === e.currentTarget && cancel()} onKeyDown={onKey}>
    <div ref={box} className="dlg" role={req.kind === 'confirm' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="dlg-t" data-testid="dialog">
      <h2 id="dlg-t" className="dlg-t">{req.title}</h2>
      {req.kind === 'confirm' && req.body && (Array.isArray(req.body) ? req.body : [req.body]).map((b, i) => <p key={i} className="dlg-b">{b}</p>)}
      {req.kind === 'text' && <form onSubmit={e => { e.preventDefault(); ok(); }}><label className="dlg-l">{req.label ?? 'Name'}<input ref={input} data-testid="dialog-input" value={val} maxLength={req.maxLength ?? 80} placeholder={req.placeholder} onChange={e => setVal(e.target.value)} /></label></form>}
      <div className="dlg-a">
        {req.kind === 'confirm' && req.extra && <button type="button" className="btn btn-sm btn-ghost dlg-extra" data-testid={req.extra.testid ?? 'dialog-extra'} onClick={req.extra.onClick}>{req.extra.label}</button>}
        <button type="button" className="btn btn-sm btn-ghost" data-testid="dialog-cancel" onClick={cancel} data-autofocus={req.kind === 'confirm' && req.danger ? '' : undefined}>{req.kind === 'confirm' ? req.cancel ?? 'Cancel' : 'Cancel'}</button>
        <button type="button" className={`btn btn-sm ${req.kind === 'confirm' && req.danger ? 'danger' : 'btn-primary'}`} data-testid="dialog-ok" disabled={req.kind === 'text' && !val.trim()} onClick={ok} data-autofocus={req.kind === 'confirm' && !req.danger ? '' : undefined}>{req.confirm ?? (req.kind === 'text' ? 'Create' : 'OK')}</button>
      </div>
    </div></div>, document.body);
}
