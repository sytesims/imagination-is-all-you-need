/** Stable per-browser id (localStorage `ohf:clientId`), sent as X-Client-Id on job create. */
let mem = '';
export function clientId(): string {
  if (mem) return mem;
  try { mem = localStorage.getItem('ohf:clientId') || ''; if (!mem) { mem = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`); localStorage.setItem('ohf:clientId', mem); } }
  catch { mem ||= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
  return mem;
}
