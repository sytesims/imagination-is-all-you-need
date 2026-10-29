/** Submit errors travel to toasts as plain strings (`toast(e.message, 'error')` in each tool). This keeps what the string can't carry,
 *  keyed by the message for a short while: whether it is a calm notice (nothing failed, e.g. the price changed) and the server's
 *  technical detail, shown only behind “Technical details”. */
type Meta = { calm?: boolean; detail?: string; inline?: boolean; at: number }; // inline: the screen already shows it as an InlineError, so no toast
const META = new Map<string, Meta>();
export function noteError(message: string, m: { calm?: boolean; detail?: string | null; inline?: boolean }) {
  if (!message) return; const now = Date.now(); META.forEach((v, k) => { if (now - v.at > 60_000) META.delete(k); });
  META.set(message, { calm: !!m.calm, inline: !!m.inline, detail: m.detail && String(m.detail).trim() ? String(m.detail) : undefined, at: now });
}
export const errorMeta = (message: string): Meta | undefined => { const m = META.get(message); return m && Date.now() - m.at <= 60_000 ? m : undefined; };
