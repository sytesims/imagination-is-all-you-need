/** The prompt a hosted place sends (2026-11-01): a route's own hostedPrompt (OpenSoul triggers, Edit Video's direction, one Shots angle) first, then the
 *  app's composed prompt (finalPrompt: the Camera & Lens sentence, style, Enhance words, Brush Edit's instruction), then the typed words. The same order
 *  as the Comfy Router bodies (routing/routerModels.ts), so fal, BFL and Replicate places never drop what the Router place sends. */
export const hostedPromptOf = (i: Record<string, any>): string => String(i.hostedPrompt || i.finalPrompt || i.prompt || '');
