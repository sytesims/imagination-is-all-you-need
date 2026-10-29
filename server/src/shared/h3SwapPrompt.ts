/** H3's single-person replacement contract. Pure: shared by Cloud submission and its prompt preview. */
export function h3SwapPrompt(target?: string) {
  const who = target?.trim() || 'the main person';
  return `Replace ${who} in <Video 1> with the character in <Picture 1>. Keep the character's face, hair, clothing and style from <Picture 1>. Follow the source pose, gaze, expression, movement and timing. Keep the camera, scene and everyone else unchanged.`;
}

/** Input must already use H3 reference grammar. Never mutate the saved typed prompt.
 * Only our exact, target-matching contract is recognized as precomposed: guessing from keywords could lose a user's directions or target. */
export function composeH3SwapPrompt(input: { target?: string; prompt?: string }): string {
  const core = h3SwapPrompt(input.target); const own = input.prompt?.trim() || '';
  if (!own) return core;
  if (own === core || own.startsWith(`${core}\n`) || own.startsWith(`${core} `)) return own.slice(0, 4000);
  return `${core}\n\nAdditional direction: ${own}`.slice(0, 4000);
}
