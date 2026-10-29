import { useEffect, useRef, type RefObject } from 'react';
/** B21 (BH11 B4–B7, B13): one rule for every popover, menu and modal. Esc closes the most recently opened one,
 *  and focus goes back to whatever had it when it opened (the trigger), unless focus already moved somewhere real. */
const stack: number[] = []; let seq = 0;
export function useDismiss(open: boolean, close: () => void, triggerRef?: RefObject<HTMLElement | null>) {
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const id = ++seq; stack.push(id); const trigger = triggerRef?.current ?? (document.activeElement as HTMLElement | null);
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape' || stack[stack.length - 1] !== id) return; e.preventDefault(); e.stopPropagation(); closeRef.current(); };
    window.addEventListener('keydown', k, true);
    return () => {
      window.removeEventListener('keydown', k, true); const i = stack.indexOf(id); if (i >= 0) stack.splice(i, 1);
      requestAnimationFrame(() => { const a = document.activeElement as HTMLElement | null; if ((!a || a === document.body || !a.isConnected || (triggerRef && !a.closest('body'))) && trigger && trigger !== document.body && trigger.isConnected) trigger.focus(); });
    };
  }, [open]);
}
