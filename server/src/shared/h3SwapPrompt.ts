/**
 * H3's single-person replacement contract. Pure: shared by Cloud submission, the local H3 route and the prompt preview.
 * The wording is Comfy's Openjutsu app's swapPrompt (lib/swap.ts, github.com/Comfy-Org/comfy-openjutsu @ 70ec62d, MIT, Copyright (c) 2026 Comfy Org;
 * licenses/comfy-openjutsu-LICENSE-MIT.md), verbatim except our {who} slot when the user named someone ("the selected person" otherwise).
 */
export const H3_ANCHOR_SENTENCE = 'Start from the first frame in <Picture 2>.';
export function h3SwapPrompt(target?: string, o: { anchor?: boolean } = {}) {
  const who = target?.trim() || 'the selected person';
  return [`Replace ${who} in <Video 1> with the character in <Picture 1>.`, 'Preserve the source performance, scene and audio timing.', o.anchor ? H3_ANCHOR_SENTENCE : ''].filter(Boolean).join(' ');
}
/** Our earlier contract (until 2026-11-02). Only recognised, never written: a saved prompt that starts with it is recomposed onto the current one, so
 *  Recreate of an old job never stacks two contracts. */
export const LEGACY_CORES: ((target?: string) => string)[] = [
  (target) => `Replace ${target?.trim() || 'the main person'} in <Video 1> with the character in <Picture 1>. Keep the character's face, hair, clothing and style from <Picture 1>. Follow the source pose, gaze, expression, movement and timing. Keep the camera, scene and everyone else unchanged.`,
];

/** Input must already use H3 reference grammar. Never mutate the saved typed prompt. anchor = a first frame goes in as <Picture 2>.
 * Only our exact, target-matching contracts (current, with or without the anchor sentence, or legacy) are recognised as precomposed: guessing from
 * keywords could lose a user's directions or target. A recognised prompt keeps its direction and gets today's contract. */
export function composeH3SwapPrompt(input: { target?: string; prompt?: string; anchor?: boolean }): string {
  const core = h3SwapPrompt(input.target, { anchor: input.anchor }); let own = input.prompt?.trim() || '';
  const known = [h3SwapPrompt(input.target, { anchor: true }), h3SwapPrompt(input.target), ...LEGACY_CORES.map((f) => f(input.target))];
  const hit = known.find((k) => own === k || own.startsWith(`${k}\n`) || own.startsWith(`${k} `));
  if (hit) own = own.slice(hit.length).trim().replace(/^Additional direction:\s*/i, '');
  return (own ? `${core} ${own}` : core).slice(0, 4000);
}
