/** B21 B12: WAI radio pattern for every role=radiogroup in the app. Arrow keys move to the next or previous enabled radio
 *  and select it (click), wrapping at the ends. One listener, installed once. */
let on = false;
export function installRadioKeys() {
  if (on || typeof document === 'undefined') return; on = true;
  document.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!d || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const cur = (e.target as HTMLElement | null)?.closest?.('[role=radio]') as HTMLElement | null; const g = cur?.closest('[role=radiogroup]'); if (!cur || !g) return;
    const xs = [...g.querySelectorAll<HTMLElement>('[role=radio]')].filter(x => !(x as HTMLButtonElement).disabled && !x.hasAttribute('data-arrow-skip') && x.closest('[role=radiogroup]') === g); const i = xs.indexOf(cur); if (i < 0 || xs.length < 2) return;
    e.preventDefault(); const nx = xs[(i + d + xs.length) % xs.length]; nx.click(); nx.focus();
  });
}
