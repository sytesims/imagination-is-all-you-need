/** "Pick the one you like" on the board, as plain rules (2026-11-06, release 1 fixes; AgentPanel.tsx draws it, the tests read these). */
/** Which card a board selection picks, or null. Only a click made after the ask counts: the selection must have CHANGED since the last
 *  look (a card already selected when the ask came, or a camera move, picks nothing), it must be one card, one of the choices, and a pointer
 *  press on the board must have happened after the ask started. */
export function pickFromSelection(o: { before: readonly string[]; now: readonly string[]; choices: readonly string[]; pressedSinceAsk: boolean }): string | null {
  if (!o.pressedSinceAsk || o.now.length !== 1) return null;
  if (o.before.length === o.now.length && o.before.every((x, i) => x === o.now[i])) return null;
  return o.choices.includes(o.now[0]) ? o.now[0] : null;
}
/** The choices still on the board (a card you deleted drops out of the ask). */
export const livePickChoices = (choices: readonly string[], has: (id: string) => boolean) => choices.filter(has);
/** The edge chip: shown while a pick waits and none of its choices is on screen. */
export function pickOffscreen(choices: { minX: number; minY: number; maxX: number; maxY: number }[], view: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  return choices.length > 0 && choices.every((b) => b.maxX < view.minX || b.minX > view.maxX || b.maxY < view.minY || b.minY > view.maxY);
}
