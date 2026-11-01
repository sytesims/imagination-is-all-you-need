import { forwardRef, useRef, useState, type ButtonHTMLAttributes, type ComponentProps } from 'react';
import { tip } from '../../shared/Tooltip';
import type { useToast } from '../../shared/Toast';
import { BarPopover, PopAction, PopSection, PopSwitch } from '../../shared/BarPop';
import { SparkleIcon } from '../Icons';
/** (e) Prompt enhance: POST /api/prompt/enhance {prompt, kind, style?} → {original, prompt, added[], source}. Highlights what was added and offers Undo. */
export type EnhanceResult = { original: string; prompt: string; added: string[]; source?: string; /** prompt grammar: the model it was shaped for, and why nothing was added (over its cap) */ forModel?: string; note?: string };
/** The toast line after an enhance (one wording for every bar): what was added and for which model, or why nothing was (the model's cap). */
export const enhanceToastTitle = (r: EnhanceResult) => (r.note ? r.note : `Prompt rewritten${r.forModel ? ` for ${r.forModel}` : ''}: ${r.added.length} detail${r.added.length === 1 ? '' : 's'} added`);
/** A rewrite applied to the prompt, with the toast that says what was added and offers Undo (the Video bars). */
export const showEnhanced = (r: EnhanceResult, setPrompt: (s: string) => void, toast: ReturnType<typeof useToast>) => { const was = r.original; setPrompt(r.prompt);
  toast(enhanceToastTitle(r), 'info', { sub: [r.added.slice(0, 4).join(', '), r.source].filter(Boolean).join(' · ') || undefined, ms: 10000, action: { label: 'Undo', onClick: () => setPrompt(was) } }); };
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

/** The Video bars' Enhance chip (Create Video and the workflow bars: Transitions, Camera Moves, UGC Ad), Image's sparkle: a click turns
 * "enhance when I generate" on or off for the run (field enhance, the server adds the words); right-click or a long press opens its panel
 * (EnhancePop). Without the on-run enhancer (`can` false) a click opens the panel (Rewrite my prompt now). */
export const EnhanceChip = forwardRef<HTMLButtonElement, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onToggle'> & { can: boolean; on: boolean; open: boolean; onToggle: (on: boolean) => void; onPanel: (open: boolean) => void; testId: string }>(
  function EnhanceChip({ can, on: on0, open, onToggle, onPanel, testId, className = '', ...rest }, ref) {
    const t = useRef<number>(0); const long = useRef(false); const on = can && on0;
    return <button ref={ref} type="button" {...rest} className={`ic-chip ic-sq ic-enh-one${on ? ' on' : ''}${open ? ' open' : ''} ${className}`.trim()} data-testid={testId} aria-label={can ? 'Enhance prompt' : 'Rewrite my prompt'} aria-pressed={can ? on : undefined} aria-haspopup={can ? undefined : 'dialog'} aria-expanded={can ? undefined : open} {...tip(can ? `Enhance prompt: ${on ? 'On' : 'Off'} · right-click for options` : 'Rewrite my prompt with more detail')}
      onClick={() => { if (long.current) { long.current = false; return; } if (can) onToggle(!on); else onPanel(!open); }}
      onContextMenu={e => { e.preventDefault(); onPanel(!open); }}
      onPointerDown={e => { if (e.pointerType === 'mouse') return; clearTimeout(t.current); t.current = window.setTimeout(() => { long.current = true; onPanel(true); }, 450); }} onPointerUp={() => clearTimeout(t.current)} onPointerLeave={() => clearTimeout(t.current)}><SparkleIcon size={16} /></button>;
  });
/** The Enhance chip's panel: the "Enhance when I generate" switch (when the tool has the on-run enhancer) and Rewrite my prompt now. */
export function EnhancePop({ open, anchor, avoid, watch, onClose, testId, panelTestId, toggleTestId, can, on, onChange, prompt, kind, model, onApply }: Pick<ComponentProps<typeof BarPopover>, 'anchor' | 'avoid' | 'watch'> & {
  open: boolean; onClose: () => void; testId: string; panelTestId: string; toggleTestId: string; can: boolean; on: boolean; onChange: (on: boolean) => void; prompt: string; kind: string; model?: string | null; onApply: (r: EnhanceResult) => void }) {
  return <BarPopover open={open} anchor={anchor} avoid={avoid} watch={watch} placement="top" gap={8} onClose={onClose} label="Prompt enhancer" testId={testId} width={320}><PopSection label="Prompt enhancer" testId={panelTestId}>
    {can && <PopSwitch testId={toggleTestId} label="Enhance when I generate" hint="Adds detail to the prompt as it runs; your text stays as you wrote it" on={on} onChange={onChange} />}
    <PopAction label="Rewrite my prompt now" hint="See the added detail first, then keep or undo it"><EnhanceButton model={model} prompt={prompt} kind={kind} onApply={r => { onApply(r); onClose(); }} /></PopAction>
  </PopSection></BarPopover>;
}
