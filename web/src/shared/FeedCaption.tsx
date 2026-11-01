/**
 * The caption under a result in a feed grid: the model on top, "place · price · time" (or the page's own parts) below, over a dark fade at the
 * card's bottom. One component and one style (shared/feedCaption.css) for Image (a Compare models group) and 3D (every card); jobCaption gives
 * the parts from a job, the same words everywhere (Compare's side-by-side view uses it too).
 */
import type { JobState } from '../api';
import { compositeCostText, runPrice } from './billing';
import { plainPrompt } from '../../../server/src/shared/typedPrompt';
import './feedCaption.css';

import { captionPrice } from './feedCaptionText';
export { captionTitle, examplePrice } from './feedCaptionText';
export type JobCaption = { model: string; place: string; price: string; time: string };
/** model · place · price · time for a job (the words: shared/feedCaptionText.ts): "Free" only on your computer; an example names where it ran and its real price. */
export function jobCaption(j: JobState, own: boolean | null): JobCaption {
  const a = j as any; const model = String(a.modelName ?? a.model ?? j.provider ?? ''); const place = String(a.place?.label ?? a.runOnLabel ?? '');
  const price = captionPrice(j, own);
  const s0 = Number(a.startedAt ?? a.createdAt ?? 0), s1 = Number(a.finishedAt ?? 0); const sec = s0 && s1 > s0 ? Math.round((s1 - s0) / 1000) : null;
  return { model, place, price, time: sec == null ? '' : sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s` };
}

/** The caption itself. `parts` are joined with " · " (empty ones dropped); a long model name ends in "…" (full name in the title).
 *  The title reads as plain words: a prompt's @image2 is "picture 2" (plainPrompt); the stored prompt is untouched. */
export function FeedCaption({ title, parts, testId, className = '' }: { title: string; parts: (string | null | undefined | false)[]; testId?: string; className?: string }) {
  const line = parts.filter(Boolean).join(' · '); const t = plainPrompt(title);
  return <span className={`feed-cap${className ? ` ${className}` : ''}`} data-testid={testId}><b title={t}>{t}</b>{line && <span>{line}</span>}</span>;
}
