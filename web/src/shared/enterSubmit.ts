/** One Enter rule for every prompt composer (PARITY-A C-1, decision 1): Enter or Cmd/Ctrl+Enter = Generate, Shift+Enter = a new line. A box with data-enter-submits="mod" (lyrics) keeps plain Enter as a new line and generates on Cmd/Ctrl+Enter only.
 *  A prompt box opts in with the `data-enter-submits` attribute. Enter presses the composer's own Generate button (the nearest `.gen-btn`), so every
 *  check a click gets applies unchanged: the empty-prompt nudge, the queue-full block and the in-flight lock. Never while an IME is composing (Japanese, Chinese, Korean input),
 *  never on a held-down key repeat, and never when a handler in the box already used the key (an open @ / # autocomplete).
 *  One document listener, installed once; it runs after React's own handlers, so their preventDefault wins. */
const visible = (el: HTMLElement) => el.getClientRects().length > 0;
/** The Generate button of the composer that holds `from`: the closest ancestor that contains a visible one. */
export function generateFor(from: HTMLElement): HTMLButtonElement | null {
  for (let el = from.parentElement; el && el !== document.body; el = el.parentElement) {
    const b = [...el.querySelectorAll<HTMLButtonElement>('button.gen-btn')].find(visible);
    if (b) return b;
  }
  return null;
}

let on = false;
export function installEnterSubmit() {
  if (on || typeof document === 'undefined') return; on = true;
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.altKey) return;
    if (e.isComposing || e.keyCode === 229) return; /* IME: this Enter confirms the composition */
    const ta = e.target as HTMLElement | null;
    if (!(ta instanceof HTMLTextAreaElement) || !ta.hasAttribute('data-enter-submits') || ta.disabled || ta.readOnly) return;
    /* data-enter-submits="mod" (lyrics, scripts): plain Enter is a new line; only Cmd/Ctrl+Enter generates (user, 2026-10-24) */
    if (ta.getAttribute('data-enter-submits') === 'mod' && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault(); /* no newline either way */
    if (e.repeat) return; /* holding Enter submits once */
    const btn = generateFor(ta);
    if (btn && !btn.disabled) btn.click();
  });
}
