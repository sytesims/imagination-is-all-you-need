import { useState } from 'react';
import { tip } from '../../shared/Tooltip';
import { SparkleIcon } from '../Icons';
/** (e) Prompt enhance: POST /api/prompt/enhance {prompt, kind, style?} → {original, prompt, added[], source}. Highlights what was added and offers Undo. */
export type EnhanceResult = { original: string; prompt: string; added: string[]; source?: string; /** prompt grammar: the model it was shaped for, and why nothing was added (over its cap) */ forModel?: string; note?: string };
/** The toast line after an enhance (one wording for every bar): what was added and for which model, or why nothing was (the model's cap). */
export const enhanceToastTitle = (r: EnhanceResult) => (r.note ? r.note : `Prompt rewritten${r.forModel ? ` for ${r.forModel}` : ''}: ${r.added.length} detail${r.added.length === 1 ? '' : 's'} added`);
export function EnhanceButton({ prompt, kind, style, model, onApply }: { prompt: string; kind: string; style?: string; /** the picked model's key: its structure, syntax and length cap shape the rewrite */ model?: string | null; onApply: (r: EnhanceResult) => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function go() {
    setBusy(true); setErr('');
    try { const r = await fetch('/api/prompt/enhance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, kind, ...(model ? { model } : {}), ...(style && style !== 'none' ? { style } : {}) }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); onApply(j); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return <button type="button" className="btn btn-sm enhance-btn" disabled={!prompt.trim() || busy} onClick={go} {...tip(err || 'Add detail to your prompt')}><SparkleIcon size={14} className="enh-ic" />{busy ? 'Enhancing…' : err ? 'Retry enhance' : 'Enhance'}</button>;
}
export function EnhanceDiff({ r, onUndo, onDismiss }: { r: EnhanceResult; onUndo: () => void; onDismiss: () => void }) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = r.added.length ? r.prompt.split(new RegExp(`(${r.added.map(esc).join('|')})`, 'gi')) : [r.prompt];
  const isAdded = (p: string) => r.added.some(a => a.toLowerCase() === p.toLowerCase());
  return <div className="enh-diff" role="status"><p>{parts.map((p, i) => isAdded(p) ? <mark key={i} className="enh-add">{p}</mark> : <span key={i}>{p}</span>)}</p>
    <div className="row enh-acts"><span className="helper" data-testid="enh-note">{r.note ? r.note : <>Added {r.added.length} detail{r.added.length === 1 ? '' : 's'}{r.forModel ? ` for ${r.forModel}` : ''}{r.source ? ` · ${r.source}` : ''}</>}</span><button type="button" className="btn btn-sm enh-undo" onClick={onUndo}>Undo</button><button type="button" className="btn btn-sm" onClick={onDismiss}>Keep</button></div></div>;
}
