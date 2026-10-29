import { useRef, type ComponentProps, type ReactNode } from 'react';
import { Popover } from './Popover';
import './barPop.css';
/** The small popovers of the composer bars (Image, Video, Audio, 3D): count, Settings, aspect, size, Run on, Enhance and the like.
 *  One look, the model menu's "Orbit" style (modelMenu.css): the popover surface with blur and a strong hairline, radius 16, uppercase
 *  Inter labels, Space Grotesk values, mono numbers, and orange only as a thin marker on a faint orange fill.
 *  - BarPopover: the shared Popover with this look (class `bp`).
 *  - PopSection: a label row (and an optional value on the right), then its content; sections after the first get a hairline.
 *  - Segmented: a quiet segmented control (radio group) with an optional hint and price under each option.
 *  - PopRow: one row of a list (role option / radio / menuitem), the picked row marked the Orbit way.
 *  - PopSwitch: a label with a short helper and a switch. PopNote: one quiet line. */

export function BarPopover({ className = '', width, autoWidth, ...p }: ComponentProps<typeof Popover> & { /** size to the content (the duration slider) */ autoWidth?: boolean }) {
  return <Popover {...p} width={autoWidth ? undefined : width ?? 288} className={`bp ${className}`.trim()} />;
}

export function PopSection({ label, aside, children, testId, className = '' }: { label?: ReactNode; aside?: ReactNode; children?: ReactNode; testId?: string; className?: string }) {
  return <section className={`bp-sec ${className}`.trim()} data-testid={testId}>
    {(label != null || aside != null) && <div className="bp-head">{label != null && <span className="bp-lbl">{label}</span>}{aside != null && <span className="bp-aside">{aside}</span>}</div>}
    {children}</section>;
}

export const PopNote = ({ children, testId, tone }: { children: ReactNode; testId?: string; tone?: 'warn' }) =>
  <p className={`bp-note${tone ? ` bp-note-${tone}` : ''}`} data-testid={testId}>{children}</p>;

export interface SegOpt<V extends string | number = string> { value: V; label: ReactNode; /** a short helper under the label */ hint?: ReactNode; /** a price or difference, in mono */ aside?: ReactNode; disabled?: boolean; title?: string; icon?: ReactNode; testId?: string }

/** A segmented control: one radio group. Arrows (and Home / End) move and pick, skipping options that are off; Enter picks and calls
 *  onCommit (the caller closes its popover). `cols` wraps it into a grid (14 aspect shapes). */
export function Segmented<V extends string | number>({ label, value, options, onChange, onCommit, testId, cols, className = '' }: {
  label: string; value: V; options: SegOpt<V>[]; onChange: (v: V) => void; onCommit?: (v: V) => void; testId?: string; cols?: number; className?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const live = options.filter(o => !o.disabled);
  const focusOn = (v: V) => requestAnimationFrame(() => row.current?.querySelector<HTMLElement>(`[data-v="${String(v)}"]`)?.focus());
  const keys = (e: React.KeyboardEvent) => {
    const i = live.findIndex(o => o.value === value); let n: number | null = null; const step = cols && (e.key === 'ArrowUp' || e.key === 'ArrowDown') ? cols : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = i < 0 ? 0 : Math.min(live.length - 1, i + step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = i < 0 ? 0 : Math.max(0, i - step);
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = live.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') { const v = (e.target as HTMLElement).closest<HTMLElement>('[data-v]')?.dataset.v; const o = options.find(x => String(x.value) === v);
      if (o && !o.disabled) { e.preventDefault(); e.stopPropagation(); onChange(o.value); if (e.key === 'Enter') onCommit?.(o.value); } return; }
    if (n == null || !live.length) return; e.preventDefault(); e.stopPropagation(); const v = live[n].value; if (v !== value) onChange(v); focusOn(v);
  };
  const rich = options.some(o => o.hint != null || o.aside != null);
  return <div ref={row} className={`bp-seg${rich ? ' bp-seg-rich' : ''}${cols ? ' bp-seg-grid' : ''} ${className}`.trim()} role="radiogroup" aria-label={label} data-testid={testId} onKeyDown={keys}
    style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map(o => { const on = o.value === value; return <button key={String(o.value)} type="button" role="radio" aria-checked={on} data-v={String(o.value)} tabIndex={on || (!live.some(x => x.value === value) && o === live[0]) ? 0 : -1}
      disabled={o.disabled} title={o.title} className={`bp-opt${on ? ' on' : ''}`} data-testid={o.testId} onClick={() => onChange(o.value)}>
      {o.icon && <span className="bp-opt-ic" aria-hidden>{o.icon}</span>}<b className="bp-opt-l">{o.label}</b>{o.hint != null && <small className="bp-opt-h">{o.hint}</small>}{o.aside != null && <em className="bp-opt-a">{o.aside}</em>}</button>; })}
  </div>;
}

/** An aspect's outline in a 16 px slot, long side 14 px. Long shapes (4:1 and beyond) get a 1 px outline and a 2 px floor so they stay a thin
 *  bar; other shapes keep a 5 px floor. Used in the bars' aspect chips and in every aspect popover (Image, Video). */
export const AspectShape = ({ w, h }: { w: number; h: number }) => { const k = 14 / Math.max(w, h); const long = Math.max(w, h) / Math.min(w, h) >= 4; const min = long ? 2 : 5;
  return <span className="ic-shape" style={{ width: Math.max(min, w * k), height: Math.max(min, h * k), ...(long ? { borderWidth: 1 } : {}) }} aria-hidden />; };
/** "16:9" → [16, 9]; "auto" / "Auto" → null (callers show the aspect icon). */
export const aspectWH = (a: string): [number, number] | null => { const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(a); return m ? [Number(m[1]), Number(m[2])] : null; };

/** Long aspect lists: the shared grouping (server/src/shared/imageSnap.ts, pure, so the tests check it). */
export { groupAspects } from './composerDraft';

/** Columns for a grid of n options with no lonely last row: 5 → 5, 6 → 3, 8 → 4, 10 → 5, 14 → 5 (5 · 5 · 4). */
export const segCols = (n: number) => n <= 5 ? Math.max(1, n) : n === 6 ? 3 : n <= 8 ? 4 : 5;

/** One list row. role 'option' in a listbox popover, 'radio' in a radio group, 'menuitem' in a menu. */
export function PopRow({ selected, onClick, icon, label, hint, aside, role = 'option', disabled, testId, title, className = '' }: {
  selected?: boolean; onClick?: () => void; icon?: ReactNode; label: ReactNode; hint?: ReactNode; aside?: ReactNode; role?: 'option' | 'radio' | 'menuitem'; disabled?: boolean; testId?: string; title?: string; className?: string;
}) {
  const state = role === 'option' ? { 'aria-selected': !!selected } : role === 'radio' ? { 'aria-checked': !!selected } : {};
  return <button type="button" role={role} {...state} disabled={disabled} title={title} data-testid={testId} className={`bp-row${selected ? ' on' : ''} ${className}`.trim()} onClick={onClick}>
    {icon != null && <span className="bp-row-ic" aria-hidden>{icon}</span>}
    <span className="bp-row-t"><b>{label}</b>{hint != null && <small>{hint}</small>}</span>
    {aside != null && <em className="bp-row-a">{aside}</em>}</button>;
}

/** A list of rows; `cols` = 2 lays a long list (14 shapes) out in two columns. */
export const PopList = ({ children, label, role = 'listbox', cols, testId }: { children: ReactNode; label: string; role?: 'listbox' | 'radiogroup' | 'menu' | 'group'; cols?: number; testId?: string }) =>
  <div className={`bp-list${cols && cols > 1 ? ' bp-list-grid' : ''}`} role={role === 'listbox' ? undefined : role} aria-label={role === 'listbox' ? undefined : label} data-testid={testId} style={cols && cols > 1 ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>{children}</div>;

export function PopSwitch({ label, hint, on, onChange, testId, rowTestId }: { label: ReactNode; hint?: ReactNode; on: boolean; onChange: (v: boolean) => void; testId?: string; rowTestId?: string }) {
  return <label className="bp-switch" data-testid={rowTestId}><span className="bp-row-t"><b>{label}</b>{hint != null && <small>{hint}</small>}</span>
    <input type="checkbox" role="switch" checked={on} data-testid={testId} aria-label={typeof label === 'string' ? label : undefined} onChange={e => onChange(e.target.checked)} /><i className="bp-sw" aria-hidden /></label>;
}

/** A row with an action on the right (Rewrite my prompt now [Enhance]). */
export const PopAction = ({ label, hint, children, testId }: { label: ReactNode; hint?: ReactNode; children: ReactNode; testId?: string }) =>
  <div className="bp-action" data-testid={testId}><span className="bp-row-t"><b>{label}</b>{hint != null && <small>{hint}</small>}</span>{children}</div>;
