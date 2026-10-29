/** Words for the small bar popovers (shared/BarPop.tsx): the count's total line, the one-call vs separate-runs note, and an option's
 *  price difference from the picked one. Pure, so server/test/create-bar.test.ts checks them. Prices come from the same quote as the
 *  Generate button; nothing here makes up a number. */
import { ledgerUsd } from './billing';

/** "4 images" / "1 image" (or "takes", "clips"). */
export const countWord = (n: number, unit = 'image') => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** The count popover's total: "4 images · ≈ $0.10", "4 images · Free" (local), or just "4 images" while no price is known. */
export function countTotal(n: number, price: string | null | undefined, unit = 'image'): string {
  const p = (price ?? '').trim(); return p ? `${countWord(n, unit)} · ${p}` : countWord(n, unit);
}

/** How a run of n images is made, from what the route really does: a local ComfyUI graph renders them as one batch (comfy/plans.ts sets
 *  batch_size), a hosted route sends one request per image (routing/run.ts), each billed. null when it isn't known or there's only one. */
export function batchNote(o: { n: number; local: boolean | null | undefined }): string | null {
  if (o.n < 2 || o.local == null) return null;
  return o.local ? `Made together in one run on your GPU` : `${o.n} separate requests, each billed as one image`;
}

/** An option's price next to the picked one: '+$0.03', '−$0.01', 'Same price' (both modes, dollars). null for local, samples or no price. */
export function priceDelta(o: { diffCredits: number | null | undefined; own: boolean | null; local?: boolean; demo?: boolean }): string | null {
  const d = o.diffCredits; if (o.local || o.demo || d == null || !Number.isFinite(d)) return null;
  const r = Math.round(d); if (r === 0) return 'Same price'; const sign = r > 0 ? '+' : '−'; const a = Math.abs(r);
  return `${sign}${ledgerUsd(a)}`;
}
