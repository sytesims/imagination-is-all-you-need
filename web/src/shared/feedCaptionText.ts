/**
 * The words of a feed tile's caption, as pure functions (no React, no CSS), so FeedCaption.tsx and the tests share them (audit 2026-11-01):
 *  - captionPrice: Sample for a sample run, "Free" only for a run on your computer (or a free generation), Not charged for a refunded failure,
 *    else the run's price. A hosted run with no recorded cost shows no price, never "Free".
 *  - examplePrice: one of the app's built-in examples cost you nothing, but it ran somewhere real: its place and the price that run really cost
 *    (shared/featured.ts costUsd via /api/jobs `example`, the same record Explore's run chips read).
 *  - captionTitle: an example's own title, else the title you gave the result, else your prompt.
 */
import type { JobState } from '../api';
import { compositeCostText, runPrice, usdPrice } from './billing';
import { typedPromptOf } from '../../../server/src/shared/typedPrompt';
import { LOCAL_LABEL, PLACE_LABELS } from '../../../server/src/shared/modelIds';

export function examplePrice(ex: { runOn?: string | null; costUsd?: number | null; costEstimated?: boolean | null }, place: string): string {
  if (ex.runOn === 'local') return `${LOCAL_LABEL} · Free`;
  const usd = Number(ex.costUsd); const p = Number.isFinite(usd) && usd > 0 ? usdPrice(usd, { approx: !!ex.costEstimated }) : '';
  return [place || PLACE_LABELS['comfy-cloud'], p].filter(Boolean).join(' · ');
}

export function captionPrice(j: JobState, own: boolean | null): string {
  const a = j as any; const place = String(a.place?.label ?? a.runOnLabel ?? '');
  const paid = (): string => { const t = runPrice({ own, credits: a.cost, runOn: a.runOn }) ?? ''; return t === 'Free' && !a.free ? '' : t; };
  return compositeCostText(j) ?? (a.demo || a.isSample ? 'Sample' : a.example ? examplePrice(a.example, place) : a.runOn === 'local' ? 'Free'
    : j.status === 'failed' || j.status === 'blocked' ? (a.refunded > 0 || a.refund?.refunded ? 'Not charged' : paid()) : paid());
}

/** '' when there is none, so the caller falls back to the model. The full prompt stays in the viewer; FeedCaption shows it as plain words, one line. */
export function captionTitle(j: JobState): string {
  const a = j as any; const t = String(a.example?.title ?? a.title ?? '').trim();
  return t || typedPromptOf(a.input ?? {}).replace(/\s+/g, ' ').trim();
}
