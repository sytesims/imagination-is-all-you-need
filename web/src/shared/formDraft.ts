/** Which part of a saved composer draft comes back on load (shared/batch1.ts useFormDraft), pure so server/test/form-draft.test.ts can read it.
 *  (2026-11-03: the Image composer kept an old prompt that had already been generated, days later.) The prompt comes back only while it is
 *  unsent and fresh: a prompt already sent with Generate (`submitted` holds that exact text) or a draft older than DRAFT_TTL_MS starts the
 *  box empty. The other settings (mode, model, sizes) are preferences and always come back. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export interface SavedDraft<S> { v?: number; savedAt?: number; state?: S; /** the prompt last sent with Generate */ submitted?: string | null }
export function restorableState<S extends Record<string, any>>(saved: SavedDraft<S> | null | undefined, now = Date.now()): S | null {
  const st = saved?.state; if (!st || typeof st !== 'object') return null;
  const p = typeof st.prompt === 'string' ? st.prompt : '';
  const stale = typeof saved!.savedAt === 'number' && now - saved!.savedAt > DRAFT_TTL_MS;
  const sent = !!p.trim() && typeof saved!.submitted === 'string' && saved!.submitted === p;
  if (!p || (!stale && !sent)) return st;
  const { prompt: _p, ...rest } = st; return rest as S;
}
