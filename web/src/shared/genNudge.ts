/** R1: Generate stays bright while an input is missing (as HF does). A click then points at what's missing instead of doing nothing:
 *  it focuses the first empty prompt/text field (or the upload box) near the button and briefly flashes the missing hint. */
export function nudgeMissing(btn: HTMLElement | null, focusEl?: HTMLElement | null) {
  if (!btn) return;
  window.dispatchEvent(new CustomEvent('oj:gen-why', { detail: btn })); /* the reason, in the shared Popover (GenWhyHost) */
  const root: ParentNode = btn.closest('.ic-dock, .tool-panel, .vs-panel, .vs-side, aside, form, main') ?? document;
  const empty = [...root.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>('textarea, input[type=text]')].find(e => !e.disabled && !e.value.trim() && e.offsetParent !== null);
  const up = root.querySelector<HTMLElement>('[data-testid*=upload]:not([disabled]), .dropzone, .upload-box');
  const t = focusEl ?? empty ?? up;
  if (t) { t.focus({ preventScroll: true }); t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); t.classList.remove('gen-nudge'); void t.offsetWidth; t.classList.add('gen-nudge'); setTimeout(() => t.classList.remove('gen-nudge'), 900); }
  root.querySelectorAll<HTMLElement>('[data-testid=gen-missing], .gen-missing, .ic-miss, .vs-miss').forEach(h => { h.classList.remove('gm-flash'); void h.offsetWidth; h.classList.add('gm-flash'); setTimeout(() => h.classList.remove('gm-flash'), 900); });
}
