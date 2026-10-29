import { useState, type RefObject } from 'react';
import { refToken } from '../../../../server/src/shared/promptGrammar';

/** QA #10: the @ picker in Create Image's prompt. Typing "@" (at a word start) lists the attached photos as @image1, @image2… with a thumbnail;
 *  ↑↓ move, Enter or Tab inserts, Esc closes, a click inserts. Our Enter-to-generate listener (shared/enterSubmit) skips a key a handler used. */
export type AtPhoto = { url: string };
export const atQuery = (text: string, caret: number): string | null => { const m = text.slice(0, caret).match(/(?:^|[\s(["'])@(\w*)$/); return m ? m[1] : null; };
export const atOptions = (photos: AtPhoto[], q: string) => photos.map((ph, i) => ({ tag: `image${i + 1}`, n: i + 1, url: ph.url }))
  .filter(o => { const ql = q.toLowerCase(); return o.tag.startsWith(ql) || `img${o.n}`.startsWith(ql); });

/** modelKey: the picked model, so each row says what the model will read (prompt grammar: <<<image_1>>>, Image 1, <ref_image_0>…). */
export function useAtPicker(ta: RefObject<HTMLTextAreaElement>, value: string, setValue: (s: string) => void, photos: AtPhoto[], modelKey?: () => string | null | undefined) {
  const [q, setQ] = useState<string | null>(null); const [hi, setHi] = useState(0);
  const opts = q != null ? atOptions(photos, q) : []; const open = opts.length > 0;
  const sync = (text: string, caret: number) => { const nq = photos.length ? atQuery(text, caret) : null; setQ(nq); if (nq !== q) setHi(0); };
  const insert = (tag: string) => { const el = ta.current; if (!el) return; const c = el.selectionStart ?? value.length;
    const before = value.slice(0, c).replace(/@\w*$/, `@${tag} `); const after = value.slice(c).replace(/^ /, '');
    setValue(before + after); setQ(null); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); }); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length); }
    else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); insert(opts[Math.min(hi, opts.length - 1)].tag); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQ(null); } };
  const menu = open ? <div className="ic-at" role="listbox" aria-label="Mention a photo" data-testid="ic-at-picker">
    <span className="ic-at-h">Mention a photo</span>
    {opts.map((o, i) => <button key={o.tag} type="button" role="option" aria-selected={i === hi} tabIndex={-1} className={`ic-at-o${i === hi ? ' on' : ''}`} data-testid={`ic-at-${o.tag}`}
      onMouseDown={e => { e.preventDefault(); insert(o.tag); }} onMouseEnter={() => setHi(i)}><img src={o.url} alt="" /><b>@{o.tag}</b><small>Photo {o.n}{(() => { const t = modelKey ? refToken(modelKey() ?? '', 'image', o.n) : null; return t && t.toLowerCase() !== `image ${o.n}` ? <> · sent as <code>{t}</code></> : null; })()}</small></button>)}
    <small className="ic-at-k" aria-hidden>↑↓ · Enter · Esc</small></div> : null;
  return { sync, onKeyDown, close: () => setQ(null), menu, open };
}
