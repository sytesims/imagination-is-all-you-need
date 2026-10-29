import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
/** Text inserted at the caret of a prompt box (one shared helper for the prompt's quick chips: Audio's "genre: " starters and [Verse] tags).
 *  `ownLine` puts the text on a line of its own: a line break before it unless the caret is at a line start, and the caret ends on the line
 *  below the tag (a new empty line, or the start of the next line when one follows). Otherwise a ", " joins it to text before it.
 *  Pure, so tests can run it. */
export function insertAt(value: string, start: number, end: number, text: string, ownLine = false): { value: string; caret: number } {
  const s = Math.max(0, Math.min(start, value.length)), e = Math.max(s, Math.min(end, value.length));
  const before = value.slice(0, s), after = value.slice(e);
  let ins = text;
  if (ownLine) {
    if (before && !before.endsWith('\n')) ins = '\n' + ins;
    if (after.startsWith('\n')) return { value: before + ins + after, caret: before.length + ins.length + 1 };
    ins += '\n';
  } else if (before.trim() && !/\s$/.test(before)) ins = (/[,;]$/.test(before) ? ' ' : ', ') + ins;
  return { value: before + ins + after, caret: before.length + ins.length };
}

/** Returns insert(text, ownLine?): writes through `setValue` (a controlled textarea), then focuses the box with the caret after the text.
 *  Uses the caret the box last had (a chip click moves focus away; the textarea keeps its selection), or the end when the box was never
 *  focused. The caret is placed after React renders the new value (a layout effect), so the re-render never resets it. */
export function useInsertAtCursor(ref: RefObject<HTMLTextAreaElement | null>, value: string, setValue: (s: string) => void) {
  const pending = useRef<number | null>(null); const used = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const f = () => { used.current = el; }; el.addEventListener('focus', f); if (document.activeElement === el) f(); return () => el.removeEventListener('focus', f); });
  useLayoutEffect(() => {
    const el = ref.current; const c = pending.current; if (!el || c == null) return; pending.current = null;
    el.focus(); el.setSelectionRange(c, c);
  });
  return (text: string, ownLine = false) => {
    const el = ref.current; const known = !!el && used.current === el && el.value === value;
    const r = insertAt(value, known ? el!.selectionStart : value.length, known ? el!.selectionEnd : value.length, text, ownLine);
    pending.current = r.caret; setValue(r.value);
    if (r.value === value && el) { pending.current = null; el.focus(); el.setSelectionRange(r.caret, r.caret); }
  };
}
