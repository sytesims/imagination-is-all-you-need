import { Notice } from './Notice';
import { useEffect, useState } from 'react';
import { askConfirm } from './Dialog';
/** B15: Create Image's Saved tab on the saved-styles API (list by toolId, save {name, prompt, settings}, delete).
 *  A saved style is a few prompt words plus the preset it was made with; applying it picks that preset and adds the words to the prompt. */
export type UserStyle = { id: string; name: string; prompt: string; settings?: Record<string, any> | null; toolId?: string; createdAt?: string };
export function SavedStyles({ toolId, prompt, style, styleLabel, onApply }: { toolId: string; prompt: string; style: string; styleLabel?: string; onApply: (s: UserStyle) => void }) {
  const [items, setItems] = useState<UserStyle[] | null>(null); const [max, setMax] = useState(200); const [err, setErr] = useState('');
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [words, setWords] = useState(''); const [formErr, setFormErr] = useState<{ field: string; message: string } | null>(null); const [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/user-styles?${new URLSearchParams({ toolId })}`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(d => { setItems(Array.isArray(d?.items) ? d.items : []); if (Number(d?.max) > 0) setMax(Number(d.max)); setErr(''); }).catch(() => { setItems(i => i ?? []); setErr('Your looks didn’t load. Try again in a moment.'); });
  useEffect(() => { load(); }, [toolId]);
  const startSave = () => { setWords(prompt.trim().slice(0, 1000)); setName(styleLabel && !items?.some(x => x.name.toLowerCase() === styleLabel.toLowerCase()) ? styleLabel : ''); setFormErr(null); setOpen(true); };
  const save = async () => { const n = name.trim(), w = words.trim(); if (!n) return setFormErr({ field: 'name', message: 'Give the look a name.' }); if (!w) return setFormErr({ field: 'prompt', message: 'Add the words that make this look.' });
    setBusy(true); setFormErr(null);
    try { const r = await fetch('/api/user-styles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n, prompt: w, toolId, ...(style ? { settings: { style } } : {}) }) }); const b = await r.json().catch(() => ({}));
      if (r.status === 409) setFormErr({ field: 'name', message: `You already have a look called “${n}”. Pick another name.` });
      else if (!r.ok) { const i = Array.isArray(b?.issues) ? b.issues[0] : null; setFormErr({ field: String(i?.field ?? ''), message: String(i?.message ?? b?.error ?? 'That look couldn’t be saved.') }); }
      else { setItems(xs => [b as UserStyle, ...(xs ?? [])]); setOpen(false); }
    } catch { setFormErr({ field: '', message: 'That look couldn’t be saved. Check your connection and try again.' }); } finally { setBusy(false); } };
  const del = async (s: UserStyle) => { if (!await askConfirm({ title: `Delete “${s.name}”?`, body: 'This removes the look. Images you made with it stay in Assets.', confirm: 'Delete', danger: true })) return;
    const r = await fetch(`/api/user-styles/${encodeURIComponent(s.id)}`, { method: 'DELETE' }).catch(() => null); if (r && (r.ok || r.status === 404)) setItems(xs => (xs ?? []).filter(x => x.id !== s.id)); else setErr('That look couldn’t be deleted. Try again.'); };
  const full = (items?.length ?? 0) >= max;
  return <div className="us-wrap" data-testid="ic-saved-styles">
    {open ? <div className="us-form" data-testid="us-form">
      <label className="us-f"><span>Name</span><input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="e.g. Warm film" aria-invalid={formErr?.field === 'name' || undefined} data-testid="us-name" autoFocus /></label>
      <label className="us-f"><span>Look words <small>{words.length}/1000</small></span><textarea rows={2} value={words} maxLength={1000} onChange={e => setWords(e.target.value)} placeholder="e.g. soft window light, 35mm film grain, muted colours" aria-invalid={formErr?.field === 'prompt' || formErr?.field === 'promptFragment' || undefined} data-testid="us-words" /></label>
      {style && <p className="helper">Also keeps the {styleLabel ?? 'current'} look.</p>}
      {formErr && <Notice as="p" kind="error" tone="line" className="us-err" testId="us-error">{formErr.message}</Notice>}
      <div className="us-acts"><button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save} data-testid="us-save">{busy ? 'Saving…' : 'Save look'}</button></div>
    </div> : <button type="button" className="us-new" onClick={startSave} disabled={full} title={full ? `You can keep up to ${max} looks. Delete one to save another.` : undefined} data-testid="us-new"><span aria-hidden>+</span>Save as a look</button>}
    {err && <Notice as="p" kind="error" tone="line" className="us-err">{err}</Notice>}
    {items == null ? <div className="us-list" aria-label="Loading your looks"><span className="shimmer us-skel" /><span className="shimmer us-skel" /></div>
      : !items.length ? (!open && <p className="ic-st-empty" data-testid="ic-style-saved-empty"><b>No looks of your own yet</b>Save the words and look you like, then reuse them in one tap.</p>)
      : <ul className="us-list">{items.map(s => <li key={s.id} className="us-item" data-testid={`us-item-${s.id}`}>
          <button type="button" className="us-apply" onClick={() => onApply(s)} title={`Use “${s.name}”`}><b>{s.name}</b><small>{s.prompt}</small></button>
          <button type="button" className="us-del" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => del(s)} data-testid={`us-del-${s.id}`}>×</button></li>)}</ul>}
  </div>;
}
