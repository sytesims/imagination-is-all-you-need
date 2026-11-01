/**
 * Images, radical transparency: "<Feature> · <Model>" and where its workflow came from ("Official Comfy template · …", "Community · <workflow> by <author>",
 * "Ours · <file>"), plus a small "what this supports" card for a feature + model pair. Data: shared/imageFeatures (one source with the server).
 */
import { featureById, modelNameOf, supportsFor, workflowFor, workflowLine, type WorkflowSource } from './imageFeatures';
import { useEffect, useState } from 'react';
import './featureCredit.css';

/** Where a workflow credit links: the template / community page, or our own graph (GET /api/workflows/<file>). */
export const workflowHref = (w: WorkflowSource | null | undefined): string | null => !w ? null : w.url ?? (w.file ? `/api/workflows/${encodeURIComponent(w.file)}` : null);

/** The workflow credit as a link: "Workflow: Official Comfy template · Nano Banana 2: Image Edit". */
export function WorkflowCredit({ workflow, recipe, prefix = 'Workflow: ', className = '' }: { workflow: (WorkflowSource & { recipe?: string | null }) | null | undefined; recipe?: string | null; prefix?: string; className?: string }) {
  if (!workflow) return null; const href = workflowHref(workflow); const line = workflowLine(workflow); const r = recipe ?? workflow.recipe ?? null;
  const tip = [`${workflow.source === 'official' ? 'Official Comfy template' : workflow.source === 'community' ? `Community workflow by ${workflow.author}` : 'Built-in workflow (open source)'}`, `Licence: ${workflow.licence}`, r].filter(Boolean).join(' · ');
  return <span className={`wf-credit wf-src-${workflow.source} ${className}`} data-testid="wf-credit" title={tip}>{prefix}{href
    ? <a href={href} target="_blank" rel="noreferrer noopener" data-testid="wf-credit-link">{line}</a> : <span>{line}</span>}{r && <span className="wf-recipe"> + our recipe</span>}</span>;
}

/** "Relight · Nano Banana 2" and its workflow credit, for a feature page / composer. */
export function FeatureLine({ featureId, providerId, fallbackModel, className = '' }: { featureId: string; providerId?: string | null; fallbackModel?: string | null; className?: string }) {
  const f = featureById(featureId); if (!f) return null;
  const model = (providerId && modelNameOf(providerId, f.mode)) || fallbackModel || null; const w = providerId ? workflowFor(featureId, providerId) : null;
  return <p className={`feat-line ${className}`} data-testid="feature-line"><b data-testid="feature-label">{model ? `${f.name} · ${model}` : f.name}</b>{w && <> <WorkflowCredit workflow={w} /></>}</p>;
}

/** The model picker's version (MODEL-PICKER-REVIEW §5b.4): one summary line ("1:1–16:9 · 1K · up to 4 images · seed") and a Details toggle
 *  that opens the full list in place. */
export function SupportsLine({ featureId, providerId, model }: { featureId: string; providerId: string; /** the name the picker shows */ model?: string | null }) {
  const [open, setOpen] = useState(false); useEffect(() => setOpen(false), [providerId]);
  const s = supportsFor(featureId, providerId); const f = featureById(featureId); if (!s || !f) return null;
  const asp = s.aspects.length ? (s.aspects.length > 2 ? `${s.aspects.slice(0, 2).join(', ')} +${s.aspects.length - 2}` : s.aspects.join(', ')) : 'Aspect of your photo';
  const sum = [asp, s.resolutions.length ? s.resolutions[s.resolutions.length - 1] : null, s.maxImages ? `up to ${s.maxImages} image${s.maxImages > 1 ? 's' : ''}` : 'prompt only', s.mask ? 'mask' : null, s.seed ? 'seed' : null].filter(Boolean).join(' · ');
  const name = model || modelNameOf(providerId, f.mode) || providerId;
  return <div className={`sup-line${open ? ' open' : ''}`} data-testid="supports-card">
    <div className="sup-line-row"><span className="sup-sum" data-testid="supports-summary">{sum}</span>
      <button type="button" className="sup-more" aria-expanded={open} data-testid="supports-details" onClick={() => setOpen(o => !o)}>{open ? 'Hide' : 'Details'}</button></div>
    {open && <div className="sup-full"><span className="sup-h">{f.name} · {name} can use</span><ul>{supportItems(s).map(x => <li key={x}>{x}</li>)}</ul></div>}
  </div>;
}
function supportItems(s: NonNullable<ReturnType<typeof supportsFor>>): string[] {
  return [
    s.aspects.length ? `Aspect: ${s.allowAuto ? 'Auto, ' : ''}${s.aspects.join(', ')}` : 'Aspect: follows your photo',
    s.resolutions.length ? `Resolution: ${s.resolutions.join(', ')}` : null,
    s.qualityTiers.length ? `Quality: ${s.qualityTiers.join(', ')}` : null,
    s.maxImages ? `Images: ${s.minImages && s.minImages === s.maxImages ? s.maxImages : `${s.minImages ? `${s.minImages}–` : 'up to '}${s.maxImages}`}` : 'Images: prompt only',
    s.mask ? 'Mask: yes' : null, `Seed: ${s.seed ? 'yes' : 'no'}`, `Per run: up to ${s.maxCount}`,
  ].filter(Boolean) as string[];
}
