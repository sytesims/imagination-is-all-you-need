/** Motion Control in the Video bar (2026-10-25): the shared swap range (./SwapRange) — the part of the motion clip to use, the model's maximum shown,
 *  priced by the range. Cloud models (shared/cloudSwap.ts) name the character slot like Object Swap does.
 *  Several people (2026-10-26): the Character slot takes as many images as the model does (Kling 3.0 Omni Edit 4, Seedance 2.5 Edit 30), labelled
 *  Image 1, Image 2… in order to match the prompt's @image1 / @image2; a model that takes one says so in the hint. */
import type { UseBarExtra } from './types';
import { useSwapRange } from './SwapRange';
import { cloudSwapOf, CHARACTER_HINT, CHARACTERS_HINT } from '../../../../../server/src/shared/cloudSwap';

export const useMotionControlExtra: UseBarExtra = () => {
  const range = useSwapRange({ motion: true });
  const maxOf = (prov: string) => cloudSwapOf(prov)?.maxCharacterImages ?? 1;
  return { form: range.form, quote: range.quote, chips: range.chips, pops: range.pops,
    slotInfo: (s, c) => { if (s.name !== 'refs') return undefined; const n = maxOf(c.prov); const p: any = c.providers.find(x => x.id === c.prov); const name = cloudSwapOf(c.prov)?.name ?? p?.displayName ?? p?.name ?? 'This model';
      return n > 1 ? { hint: `${CHARACTERS_HINT} ${name} takes up to ${n}.` } : { hint: `${CHARACTER_HINT.replace(/\.$/, '')}. ${name} takes one image` }; },
    slotMax: (s, c) => (s.name === 'refs' ? maxOf(c.prov) : undefined) };
};
