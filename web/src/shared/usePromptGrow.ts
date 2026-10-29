import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { promptHeight, PROMPT_MAX, PROMPT_MIN } from './presetBar';
/** The bar's prompt grows with its text (one shared hook for Image, Video, Audio and Audio's lyrics box): two lines when empty or short,
 *  one line more at a time up to `max` px (eight lines; a short window's CSS max-height lowers it, never under four lines), then it
 *  scrolls inside (the slim .prompt-field scrollbar). The bar is fixed to the bottom, so it grows upward; the chip row, the photos and
 *  Generate stay where they are. It re-fits on every text change (typing, paste, Shift+Enter, a reset, a workflow's own draft) and when
 *  the field's width changes or it comes back from display:none (window resize, photos added beside it, the subject row closed). */
export function usePromptGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, max = PROMPT_MAX, min = PROMPT_MIN) {
  const fit = () => {
    const el = ref.current; if (!el || !el.getClientRects().length) return; /* hidden: measured again when it shows */
    const css = parseFloat(getComputedStyle(el).maxHeight); const st = el.scrollTop;
    const prev = el.style.height; el.style.height = 'auto'; const bd = el.offsetHeight - el.clientHeight; const full = el.scrollHeight + bd;
    const { h, scroll } = promptHeight(full, css, min, max); el.style.height = prev; void el.offsetHeight; el.style.height = `${h}px`;
    el.style.overflowY = scroll ? 'auto' : 'hidden';
    /* measuring resets the inner scroll: keep it, and keep the caret in view when typing or pasting at the end */
    el.scrollTop = document.activeElement === el && el.selectionEnd === el.value.length ? el.scrollHeight : st;
  };
  useLayoutEffect(fit, [value, max, min]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the field can mount later (Audio's "no prompt" workflows): watch whichever element the ref holds after each render */
  const watch = useRef<{ el: HTMLTextAreaElement | null; off: () => void }>({ el: null, off: () => {} });
  useEffect(() => {
    const el = ref.current; if (el === watch.current.el) return; watch.current.off();
    let raf = 0; let w = -1; const re = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    /* only a width change (or showing again) re-wraps the text; our own height change must not loop */
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { const nw = el.clientWidth; if (nw !== w) { w = nw; re(); } }) : null;
    if (el) ro?.observe(el); addEventListener('resize', re);
    watch.current = { el, off: () => { cancelAnimationFrame(raf); ro?.disconnect(); removeEventListener('resize', re); } };
  });
  useEffect(() => () => { watch.current.off(); watch.current = { el: null, off: () => {} }; }, []);
}
