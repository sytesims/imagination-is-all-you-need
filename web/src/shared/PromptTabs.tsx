/** The tabbed prompt area (2026-10-24, the approved "music box" mockup): one prompt box with labelled tabs (Audio: Style | Lyrics), a field that
 *  is the Image prompt itself (classes ic-prompt prompt-field, grown 2 → 8 lines by shared/usePromptGrow), quick chips under it and a hint on
 *  the right. Shared by every Audio workflow that takes text; a single tab shows as a plain label (Voiceover's "Script"), none shows no header.
 *  - PromptTabs: the tab row (Tab or ←/→ moves between tabs; a disabled tab stays visible, greyed, with its reason as the tooltip) + the panel.
 *  - PromptField: the textarea, optionally with a highlight layer BEHIND it (section tags in orange); it stays a real textarea for typing,
 *    paste, undo and IME, with Enter = Generate and Shift+Enter = a new line (shared/enterSubmit); the Lyrics field uses data-enter-submits="mod": Enter = new line, Cmd/Ctrl+Enter = Generate.
 *  - PromptHelpers: the chips on their own row (they insert at the caret: shared/useInsertAtCursor), and a hint line only when it matters. */
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { tip } from './Tooltip';
import './promptTabs.css';

export interface PromptTab { id: string; label: string; icon?: ReactNode; pill?: { text: string; tone: 'ok' | 'need' } | null; disabled?: boolean; tip?: string }

export function PromptTabs({ tabs, active, onTab, aside, children, testId = 'pt', idBase = 'pt' }: { tabs: PromptTab[]; active: string; onTab: (id: string) => void;
  /** right side of the tab row (Audio's Instrumental switch) */ aside?: ReactNode; children: ReactNode; testId?: string; idBase?: string }) {
  const list = useRef<HTMLDivElement>(null);
  const move = (dir: 1 | -1) => { const on = tabs.filter(t => !t.disabled); const i = on.findIndex(t => t.id === active); const n = on[(i + dir + on.length) % on.length]; if (n) { onTab(n.id); list.current?.querySelector<HTMLButtonElement>(`[data-tab="${n.id}"]`)?.focus(); } };
  const many = tabs.length > 1;
  return <div className="pt-box" data-testid={testId}>
    {(tabs.length > 0 || aside) && <div className="pt-head">
      {many ? <div ref={list} className="pt-tabs" role="tablist" aria-label="Prompt" onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); move(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); } }}>
        {tabs.map(t => { const on = t.id === active; return <button key={t.id} type="button" role="tab" id={`${idBase}-tab-${t.id}`} data-tab={t.id} data-testid={`${testId}-tab-${t.id}`} aria-selected={on} aria-controls={`${idBase}-panel`}
          aria-disabled={t.disabled || undefined} className={`pt-tab${on ? ' on' : ''}${t.disabled ? ' off' : ''}`} {...(t.tip ? tip(t.tip) : {})} onClick={() => { if (!t.disabled) onTab(t.id); }}>
          {t.icon}<span>{t.label}</span>{t.pill ? <em className={`pt-pill${t.pill.tone === 'need' ? ' need' : ''}`} data-testid={`${testId}-pill-${t.id}`}>{t.pill.text}</em> : null}</button>; })}
      </div> : tabs[0] ? <span className="pt-tab pt-one on" data-testid={`${testId}-label`}>{tabs[0].icon}<span>{tabs[0].label}</span></span> : null}
      {aside ? <span className="pt-aside">{aside}</span> : null}
    </div>}
    <div className="pt-panel" id={`${idBase}-panel`} role={many ? 'tabpanel' : undefined} aria-labelledby={many ? `${idBase}-tab-${active}` : undefined}>{children}</div>
  </div>;
}

/** Splits text into plain runs and highlighted matches of `re` (a global, multiline regex). */
function marked(text: string, re: RegExp): ReactNode[] {
  const out: ReactNode[] = []; let last = 0; const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (let m = g.exec(text); m; m = g.exec(text)) { if (!m[0]) { g.lastIndex++; continue; } if (m.index > last) out.push(text.slice(last, m.index)); out.push(<mark key={m.index} className="pt-tag">{m[0]}</mark>); last = m.index + m[0].length; }
  out.push(text.slice(last) + '\n'); /* a trailing newline keeps the layer as tall as the textarea's last line */
  return out;
}
const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;

/** The prompt textarea; with `highlight`, a layer behind it paints the matches (the textarea's own text is transparent there, the caret and
 *  the selection stay the textarea's). The layer copies the field's font, padding, width and scroll on every render, resize and scroll. */
export const PromptField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; highlight?: RegExp; boxTestId?: string }>(
  function PromptField({ highlight, boxTestId, className = '', hidden, ...ta }, ref) {
    const el = useRef<HTMLTextAreaElement>(null); const hl = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => el.current as HTMLTextAreaElement);
    const sync = () => { const t = el.current, h = hl.current; if (!t || !h) return; const cs = getComputedStyle(t);
      for (const k of COPY) (h.style as any)[k] = cs[k];
      h.style.top = `${t.offsetTop + t.clientTop}px`; h.style.left = `${t.offsetLeft + t.clientLeft}px`; h.style.width = `${t.clientWidth}px`; h.style.height = `${t.clientHeight}px`; h.scrollTop = t.scrollTop; };
    useLayoutEffect(sync);
    useLayoutEffect(() => { const t = el.current; if (!t || !highlight || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(sync); ro.observe(t); return () => ro.disconnect(); }, [!!highlight]); // eslint-disable-line react-hooks/exhaustive-deps
    return <div className={`pt-ed${highlight ? ' pt-hl-on' : ''}`} data-testid={boxTestId} hidden={hidden}>
      {highlight ? <div ref={hl} className="pt-hl" aria-hidden>{marked(ta.value, highlight)}</div> : null}
      <textarea ref={el} className={`ic-prompt prompt-field ${className}`} onScroll={highlight ? sync : undefined} {...ta} />
    </div>;
  });

/** A small labelled switch for the tab row's right side (Audio's Instrumental). */
export function PromptSwitch({ label, on, onChange, tip: t, testId }: { label: string; on: boolean; onChange: (on: boolean) => void; tip?: string; testId?: string }) {
  return <button type="button" role="switch" aria-checked={on} className={`pt-sw${on ? ' on' : ''}`} data-testid={testId} {...(t ? tip(t) : {})} onClick={() => onChange(!on)}><span>{label}</span><i aria-hidden /></button>;
}

export interface HelperChip { key: string; label: ReactNode; onPick: () => void; testId?: string; tip?: string; ariaLabel?: string }
/** Quick chips on their own row under the field, then the hint on its own line only when it says something now (a warning, a count): the
 *  "how to write it" words live in the field's placeholder, never beside the chips (tone "warn": amber). The chips never take focus from the
 *  field on a mouse click, so the caret stays where it was. */
export function PromptHelpers({ chips, hint, tone, testId = 'pt-helpers' }: { chips: HelperChip[]; hint?: ReactNode; tone?: 'warn' | null; testId?: string }) {
  if (!chips.length && !hint) return null;
  return <div className="pt-help" data-testid={testId}>
    {chips.length ? <div className="pt-chips" role="group" aria-label="Add to your prompt">{chips.map(c => <button key={c.key} type="button" className="pt-chip" data-testid={c.testId} aria-label={c.ariaLabel} {...(c.tip ? tip(c.tip) : {})} onMouseDown={e => e.preventDefault()} onClick={c.onPick}>{c.label}</button>)}</div> : null}
    {hint ? <span className={`pt-hint${tone === 'warn' ? ' warn' : ''}`} data-testid={`${testId}-hint`} role={tone === 'warn' ? 'status' : undefined}>{hint}</span> : null}
  </div>;
}
