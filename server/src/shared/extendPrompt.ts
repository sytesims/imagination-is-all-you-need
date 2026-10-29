/**
 * Extend's direction words (tools/editVideo: direction forward | backward | sequel | camera-pull): one short phrase added to the prompt so every
 * backend (local graph, fal, Router, Comfy Cloud, mock) is told which way to go. Added ONCE: a Recreate (or a re-run of an older job whose stored
 * prompt already ends in a phrase, sometimes twice) never stacks another, and a forward / backward prompt that already asks to continue gets none.
 */
export const EXTEND_DIRECTIONS: Record<string, string> = {
  forward: 'continue the action naturally', backward: 'continue the motion smoothly and naturally',
  sequel: 'what happens next, as the next scene of the story', 'camera-pull': 'continue while the camera pulls back to reveal more',
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Any direction phrase at the very end, with the full stop / space before it. */
const TAIL = new RegExp(`[\\s.,;:]*(?:${Object.values(EXTEND_DIRECTIONS).map(esc).join('|')})[\\s.]*$`, 'i');
/** The prompt without the direction phrases we added (every trailing copy): what the person wrote. */
export function stripExtendDirections(prompt?: string | null): string {
  const p0 = String(prompt ?? '').trim(); let p = p0; for (let prev = ''; p !== prev;) { prev = p; p = p.replace(TAIL, '').trim(); }
  return p !== p0 && /[\p{L}\p{N}]$/u.test(p) ? `${p}.` : p; // the full stop before the phrase was the sentence's own
}
/** A prompt that already asks for a continuation (forward / backward need no extra words then). */
export const asksToContinue = (p: string) => /\b(continu\w*|keep(s|ing)? going|carr(y|ies|ying) on|picks? up where|goes on|resum\w*)\b/i.test(p);
/** The prompt sent for this direction: the person's words plus the direction phrase, once (only the phrase when the prompt is empty). */
export function withExtendDirection(prompt: string | null | undefined, direction: string): string {
  const phrase = EXTEND_DIRECTIONS[direction] ?? EXTEND_DIRECTIONS.forward; const base = stripExtendDirections(prompt);
  if (!base) return phrase;
  if ((direction === 'forward' || direction === 'backward') && asksToContinue(base)) return base;
  return `${base.replace(/[.\s]+$/, '')}. ${phrase}`; // no '..' after a prompt that ends in a full stop
}
