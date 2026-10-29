/** Reference mentions (@image1, @Video 1, @audio1…) shown as orange chips: ONE renderer for the composer, the result viewer and the feed cards.
 *  - MentionText: a saved prompt with its mentions as chips (result viewer, feed / canvas cards).
 *  - MentionLayer: drawn over a prompt textarea, so typed, pasted and picked mentions all show as chips. The textarea stays the real field
 *    (caret, selection, undo, IME, the @ picker); only its glyphs go transparent while the layer paints the same text in the same place.
 *    A mention still being typed (caret right after it) shows once it is finished (space, punctuation, caret moved away, blur); a paste shows at once.
 *    A mention with no input behind it (@image3 with two images, "@image?" after a removal) is amber and says why on hover.
 *  Parsing: shared/mentionTokens.ts. Display only, the prompt text is never rewritten (the server's shared/promptRefs.ts does that per model). */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { mentionSegments, hasRefMention, type MentionSeg, type RefCounts } from './mentionTokens';
import './mentionChips.css';

const chip = (g: MentionSeg, key: number, pending = false): ReactNode => g.ref && !pending
  ? <span key={key} className={`mx-chip mx-${g.ref.state} mx-${g.ref.kind}`} data-mx-tip={g.ref.tip} title={g.ref.state === 'missing' || g.ref.state === 'stale' ? g.ref.tip : undefined}>{g.text}</span>
  : g.other ? <span key={key} className="mx-other">{g.text}</span> : <Fragment key={key}>{g.text}</Fragment>;

/** A saved prompt with chips. `counts` (optional) also flags mentions with no input; `others` tints @names and #moves too. */
export function MentionText({ text, counts, others }: { text: string; counts?: RefCounts; others?: boolean }) {
  return <>{mentionSegments(text, counts, { others }).map((g, i) => chip(g, i))}</>;
}

const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform', 'tabSize',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'color', 'textAlign', 'direction'] as const;

/** Put right after the prompt <textarea> (same parent). `counts`: what is attached now, per kind. */
export function MentionLayer({ taRef, value, counts }: { taRef: RefObject<HTMLTextAreaElement>; value: string; counts: RefCounts }) {
  const layer = useRef<HTMLDivElement>(null);
  /** caret position right after a mention being typed (hidden until finished), else null */
  const [pending, setPending] = useState<number | null>(null);
  const on = !!value && hasRefMention(value);
  const sync = () => { const t = taRef.current, h = layer.current; if (!t || !h) return;
    if (!t.offsetParent) { h.style.display = 'none'; return; } h.style.display = '';
    const cs = getComputedStyle(t); for (const k of COPY) (h.style as any)[k] = cs[k];
    h.style.top = `${t.offsetTop + t.clientTop}px`; h.style.left = `${t.offsetLeft + t.clientLeft}px`; h.style.width = `${t.clientWidth}px`; h.style.height = `${t.clientHeight}px`;
    h.scrollTop = t.scrollTop; };
  useLayoutEffect(() => { const t = taRef.current; if (!t) return; t.classList.toggle('mx-ta', on); if (on) sync(); });
  useEffect(() => { const t = taRef.current; if (!t) return () => undefined;
    let typedAt: number | null = null; /* caret right after the last typed character */
    const onInput = (e: Event) => { const typedNow = (e as InputEvent).inputType === 'insertText' && t.selectionStart === t.selectionEnd; typedAt = typedNow ? t.selectionStart : null; setPending(typedAt); };
    const onSel = () => { if (typedAt == null || document.activeElement !== t) return; if (t.selectionStart !== t.selectionEnd || t.selectionStart !== typedAt) { typedAt = null; setPending(null); } };
    const onBlur = () => { typedAt = null; setPending(null); };
    const onScroll = () => { if (layer.current) layer.current.scrollTop = t.scrollTop; };
    /* hover: the layer ignores the mouse, so the field asks which chip is under the pointer */
    const onMove = (e: MouseEvent) => { const h = layer.current; let tipTxt = '';
      if (h) for (const el of Array.from(h.querySelectorAll<HTMLElement>('.mx-missing,.mx-stale'))) for (const r of Array.from(el.getClientRects())) if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) tipTxt = el.dataset.mxTip ?? '';
      if (tipTxt) t.title = tipTxt; else if (t.title) t.removeAttribute('title'); };
    const onKey = (e: KeyboardEvent) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'Enter' || e.key === 'Tab') { typedAt = null; setPending(null); } };
    t.addEventListener('input', onInput); document.addEventListener('selectionchange', onSel); t.addEventListener('blur', onBlur); t.addEventListener('scroll', onScroll); t.addEventListener('mousemove', onMove); t.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => sync()) : null; ro?.observe(t);
    return () => { t.removeEventListener('input', onInput); document.removeEventListener('selectionchange', onSel); t.removeEventListener('blur', onBlur); t.removeEventListener('scroll', onScroll); t.removeEventListener('mousemove', onMove); t.removeEventListener('keydown', onKey); ro?.disconnect(); t.classList.remove('mx-ta'); };
  }, [taRef]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!on) return null;
  return <div ref={layer} className="mx-layer" aria-hidden data-testid="mx-layer">
    {mentionSegments(value, counts).map((g, i) => chip(g, i, pending != null && g.end === pending))}{'\n'}
  </div>;
}
