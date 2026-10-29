/**
 * A prompt template's fill-in fields, shown above a composer bar's prompt while the template is on (Video: viral templates, 2026-10-26;
 * data: server/src/shared/viralTemplates.ts). One small row: the template's name, one field per slot (orange, so the parts to change stand
 * out), the tip, and ✕ to leave the template (the prompt stays). Typing in a field swaps that slot's text in the prompt; focusing a field
 * selects that text in the prompt so you can see where it goes. If you rewrote that part of the prompt yourself, the field says so.
 * Shared on purpose: Image or Audio can use the same row for their own templates later.
 */
import { useState, type RefObject } from 'react';
import { replaceSlot, type ViralTemplate } from '../../../server/src/shared/viralTemplates';
import { CloseIcon } from '../ui/Icons';
import './templateSlots.css';

export interface TemplateState { id: string; values: Record<string, string> }

/** Select `text` in the prompt field (the first time it appears) without moving the focus there. */
export function selectInPrompt(el: HTMLTextAreaElement | null | undefined, text: string, focus = false) {
  if (!el || !text) return; const at = el.value.indexOf(text); if (at < 0) return;
  if (focus) el.focus(); el.setSelectionRange(at, at + text.length);
}

export function TemplateSlots({ t, state, prompt, setPrompt, setState, promptRef, onClose, testId = 'tpl-slots' }: {
  t: ViralTemplate; state: TemplateState; prompt: string; setPrompt: (s: string) => void; setState: (s: TemplateState) => void;
  promptRef?: RefObject<HTMLTextAreaElement | null>; onClose: () => void; testId?: string;
}) {
  const [lost, setLost] = useState<Record<string, boolean>>({});
  const valueOf = (k: string) => state.values[k] ?? t.slots.find(s => s.key === k)!.value;
  const change = (k: string, v: string) => {
    const old = valueOf(k); const r = replaceSlot(prompt, old, v);
    /* an empty field keeps its place in the prompt by its old text, so we only swap non-empty values */
    if (!v.trim()) { setState({ ...state, values: { ...state.values, [k]: v } }); return; }
    if (r.ok) { setPrompt(r.prompt); setLost(l => ({ ...l, [k]: false })); } else setLost(l => ({ ...l, [k]: true }));
    setState({ ...state, values: { ...state.values, [k]: v } });
  };
  return <div className="tpl" data-testid={testId} data-template={t.id} role="group" aria-label={`${t.name} template`}>
    <span className="tpl-name" title={t.line}><i aria-hidden>✦</i>{t.name}</span>
    {t.slots.map(s => { const v = valueOf(s.key); const ph = s.ideas?.length ? `e.g. ${s.ideas.join(', ')}` : s.label;
      return <label key={s.key} className={`tpl-slot${lost[s.key] ? ' lost' : ''}`} data-testid={`tpl-slot-${s.key}`} title={lost[s.key] ? 'You changed this part of the prompt, so edit it there' : ph}>
        <span className="tpl-k">{s.label}</span>
        <input value={v} placeholder={ph} size={Math.max(6, Math.min(28, v.length + 1))} aria-label={`${t.name}: ${s.label}`}
          onFocus={() => selectInPrompt(promptRef?.current, v)} onChange={e => change(s.key, e.target.value)} />
      </label>; })}
    <span className="tpl-tip" data-testid="tpl-tip">{t.tip}</span>
    <button type="button" className="tpl-x" aria-label={`Leave the ${t.name} template (your prompt stays)`} title="Leave the template (your prompt stays)" data-testid="tpl-close" onClick={onClose}><CloseIcon size={12} /></button>
  </div>;
}

/** A template's tile art for preset grids: our own, a warm light leak and a simple mark per template (a data: SVG, nothing to load). */
export function templateCover(id: string): string {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const x = 25 + (h % 50); const y = 25 + ((h >> 8) % 40);
  const mark: Record<string, string> = {
    'fruit-drama': '<circle cx="66" cy="52" r="14" fill="#FFB347"/><circle cx="96" cy="54" r="12" fill="#FF7A1A"/><path d="M66 38c2-6 7-8 11-7" stroke="#7bc96f" stroke-width="3" fill="none"/><circle cx="62" cy="50" r="2" fill="#121315"/><circle cx="70" cy="50" r="2" fill="#121315"/><circle cx="92" cy="52" r="2" fill="#121315"/><circle cx="100" cy="52" r="2" fill="#121315"/>',
    'glass-asmr': '<path d="M60 64l20-30 20 30z" fill="#fff" fill-opacity=".18" stroke="#fff" stroke-opacity=".6"/><path d="M80 34v30M70 49h20" stroke="#fff" stroke-opacity=".35"/><path d="M104 28l-30 40" stroke="#FF7A1A" stroke-width="3" stroke-linecap="round"/>',
    'miniature-world': '<rect x="48" y="58" width="64" height="10" rx="2" fill="#c98a4b"/><rect x="62" y="44" width="4" height="14" fill="#FF7A1A"/><circle cx="64" cy="41" r="3" fill="#FF7A1A"/><rect x="86" y="46" width="4" height="12" fill="#FFB347"/><circle cx="88" cy="43" r="3" fill="#FFB347"/><path d="M72 58l6-18 6 18" stroke="#fff" stroke-opacity=".4" fill="none"/>',
    'cctv-found-footage': '<rect x="56" y="38" width="40" height="20" rx="3" fill="#2a2c30" stroke="#fff" stroke-opacity=".4"/><circle cx="90" cy="48" r="5" fill="#121315" stroke="#FF7A1A"/><path d="M70 58v10h-10" stroke="#fff" stroke-opacity=".4" fill="none"/><circle cx="62" cy="43" r="2" fill="#ff3b30"/>',
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><defs><radialGradient id="g" cx="${x}%" cy="${y}%" r="80%"><stop offset="0" stop-color="#FF7A1A" stop-opacity=".55"/><stop offset=".45" stop-color="#7a3a12" stop-opacity=".35"/><stop offset="1" stop-color="#121315" stop-opacity="0"/></radialGradient></defs><rect width="160" height="100" fill="#121315"/><rect width="160" height="100" fill="url(#g)"/>${mark[id] ?? ''}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
