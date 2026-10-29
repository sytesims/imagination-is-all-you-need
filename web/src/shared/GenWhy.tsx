import { useEffect, useRef, useState } from 'react';
import { Popover } from './Popover';
import { AlertIcon } from '../ui/Icons';
/** Why Generate can't run yet, in the shared Popover. One host for every tool (mounted once in App): a click on a Generate button in its
 *  needs-input state (aria-disabled, class gen-wait) dispatches `oj:gen-why` (nudgeMissing does it), and keyboard focus on one opens it too.
 *  The text is the button's data-why (set from the tool's own missing list), else its title. It closes on Esc, outside click, or as soon as
 *  the button can run. */
export const GEN_WHY_EVT = 'oj:gen-why';
const WAIT = '.gen-btn[aria-disabled=true],.gen-btn.gen-wait,.vs-gen[aria-disabled=true]';
const whyOf = (el: HTMLElement): string => {
  const t = (el.dataset.why || el.getAttribute('title') || '').trim();
  return t ? humanWhy(t) : 'Add what this tool needs to continue.';
};
/** 'Missing: a valid video, a reference image' → 'Add a video and a reference image.' Sentences ('Add a start image.') pass through. */
export function humanWhy(t: string): string {
  const m = t.match(/^Missing:\s*(.+?)(?:\s·\s(.*))?$/i); if (!m) return t;
  const nouns = m[1].split(/,\s*/).map(x => x.replace(/\bvalid\s+/i, '').trim()).filter(Boolean);
  const list = nouns.length <= 1 ? nouns.join('') : `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`;
  return `Add ${list}.${m[2] ? ` ${m[2]}` : ''}`;
}
export function GenWhyHost() {
  const anchor = useRef<HTMLElement | null>(null); const [text, setText] = useState(''); const [open, setOpen] = useState(false);
  const show = (el: HTMLElement) => { anchor.current = el; setText(whyOf(el)); setOpen(true); };
  useEffect(() => {
    const ev = (e: Event) => { const el = (e as CustomEvent<HTMLElement | null>).detail; if (el && el.matches(WAIT)) show(el); };
    const focus = (e: FocusEvent) => { const t = e.target as HTMLElement | null; if (!t?.matches?.(WAIT)) return; try { if (!t.matches(':focus-visible')) return; } catch { /* older engines */ } show(t); };
    addEventListener(GEN_WHY_EVT, ev); document.addEventListener('focusin', focus);
    return () => { removeEventListener(GEN_WHY_EVT, ev); document.removeEventListener('focusin', focus); };
  }, []);
  /* the button became ready (or left the page): close; the reason can also change while open */
  useEffect(() => { if (!open) return; const id = setInterval(() => { const a = anchor.current; if (!a || !a.isConnected || !a.matches(WAIT)) { setOpen(false); return; } const t = whyOf(a); setText(x => x === t ? x : t); }, 300); return () => clearInterval(id); }, [open]);
  return <Popover open={open} anchor={anchor} onClose={() => setOpen(false)} label="Before you generate" role="dialog" placement="top" align="center" focusFirst={false} className="gen-why" testId="gen-why">
    <p className="gen-why-t" role="status"><AlertIcon size={16} /><span>{text}</span></p>
  </Popover>;
}
