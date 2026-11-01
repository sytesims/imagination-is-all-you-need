/**
 * The caption under a result in a feed grid: the model on top, "place · price · time" (or the page's own parts) below, over a dark fade at the
 * card's bottom. One component and one style (shared/feedCaption.css) for Image (a Compare models group) and 3D (every card); jobCaption gives
 * the parts from a job, the same words everywhere (Compare's side-by-side view uses it too).
 */
import type { JobState } from '../api';
import { compositeCostText, runPrice, usdPrice } from './billing';
import { typedPromptOf } from '../../../server/src/shared/typedPrompt';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
import './feedCaption.css';

export type JobCaption = { model: string; place: string; price: string; time: string };
/** One of the app's built-in examples (server /api/jobs `example`): it cost you nothing, but it ran somewhere real. Its caption names that place and
 *  the price the run really cost (shared/featured.ts costUsd, the same record Explore's run chips read), never "Free" unless it ran on a computer. */
export function examplePrice(ex: { runOn?: string | null; costUsd?: number | null; costEstimated?: boolean | null }, place: string): string {
  if (ex.runOn === 'local') return `${LOCAL_LABEL} · Free`;
  const usd = Number(ex.costUsd); const p = Number.isFinite(usd) && usd > 0 ? usdPrice(usd, { approx: !!ex.costEstimated }) : '';
  return [place || 'Comfy Cloud', p].filter(Boolean).join(' · ');
}
/** model · place · price · time for a job: Sample for a sample run, Free only for a run on your computer (or a free generation), Not charged for a
 *  refunded failure, else the run's price. A hosted run with no recorded cost shows no price, never "Free" (audit 2026-11-01 P1). */
export function jobCaption(j: JobState, own: boolean | null): JobCaption {
  const a = j as any; const model = String(a.modelName ?? a.model ?? j.provider ?? ''); const place = String(a.place?.label ?? a.runOnLabel ?? '');
  const paid = (): string => { const t = runPrice({ own, credits: a.cost, runOn: a.runOn }) ?? ''; return t === 'Free' && !a.free ? '' : t; };
  const price = compositeCostText(j) ?? (a.demo || a.isSample ? 'Sample' : a.example ? examplePrice(a.example, place) : a.runOn === 'local' ? 'Free' : j.status === 'failed' || j.status === 'blocked' ? (a.refunded > 0 || a.refund?.refunded ? 'Not charged' : paid()) : paid());
  const s0 = Number(a.startedAt ?? a.createdAt ?? 0), s1 = Number(a.finishedAt ?? 0); const sec = s0 && s1 > s0 ? Math.round((s1 - s0) / 1000) : null;
  return { model, place, price, time: sec == null ? '' : sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s` };
}

/** A tile's caption title (audit 2026-11-01): an example's own title, else the title you gave the result, else your prompt (FeedCaption shows it as
 *  plain words, cut to one line). '' when there is none, so the caller falls back to the model. The full prompt stays in the viewer. */
export function captionTitle(j: JobState): string {
  const a = j as any; const t = String(a.example?.title ?? a.title ?? '').trim();
  return t || typedPromptOf(a.input ?? {}).replace(/\s+/g, ' ').trim();
}

/** The caption itself. `parts` are joined with " · " (empty ones dropped); a long model name ends in "…" (full name in the title). */
export function FeedCaption({ title, parts, testId, className = '' }: { title: string; parts: (string | null | undefined | false)[]; testId?: string; className?: string }) {
  const line = parts.filter(Boolean).join(' · ');
  return <span className={`feed-cap${className ? ` ${className}` : ''}`} data-testid={testId}><b title={title}>{title}</b>{line && <span>{line}</span>}</span>;
}
