import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { JobState } from '../api';
import { useToast } from './Toast';
import { cancelQueued, isCancellable } from './QueueCancel';
import { YourGpuIcon, ComfyPlaceIcon, ApiPlugIcon, CloseIcon } from '../ui/Icons';
import Mascot from '../ui/Mascot';
import { progressOfJob, progressLabel, etaText, stageFill, stepIndex, STEPS, previewBlur, placeOf, useQueueActivity, activityItem, dropFromActivity, overallFill, startsText, type ProgressInfo, type PlaceKind } from './queueActivity';
import { typedPromptOf } from '../../../server/src/shared/typedPrompt';
import './gentile.css';

/**
 * TRANSPARENCY-PLAN 4i: the premium generating tile, shared by every place a running or queued job shows as a tile (Create Image and the
 * image features, the video history grid, Assets). Live preview (blurred → sharp as it renders) or a soft shimmer, the place + price chip,
 * a quiet ✕, a 3-segment stepper with ONE label, time left only when known, and the model + prompt faded at the bottom.
 */
export const PlaceGlyph = ({ kind, size = 13 }: { kind: PlaceKind; size?: number }) => kind === 'gpu' ? <YourGpuIcon size={size} /> : kind === 'comfy' ? <ComfyPlaceIcon size={size} /> : <ApiPlugIcon size={size} />;

/** Can this job be canceled from a tile? Queued jobs always (until they start), running ones when the server says so. */
export const canCancelJob = (j: any) => j?.status !== 'canceled' && (isCancellable(j) || ((j?.status === 'running' || j?.status === 'queued') && j?.cancellable === true));

/** A quiet round ✕. `inButton`: the tile sits inside a <button>/<a>, so this is a span[role=button] (no nested buttons). */
export function CancelX({ label, onCancel, inButton = false, className = '', testId }: { label: string; onCancel: () => void; inButton?: boolean; className?: string; testId?: string }) {
  const go = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); onCancel(); };
  const props = { className: `gt-x ${className}`, 'aria-label': label, 'data-tip': label, 'data-testid': testId, onClick: go };
  return inButton ? <span role="button" tabIndex={0} {...props} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') go(e); }}><CloseIcon size={12} strokeWidth={2} /></span>
    : <button type="button" {...props}><CloseIcon size={12} strokeWidth={2} /></button>;
}

/** The latest live frame, cross-faded when a new one arrives (previewAt changes). */
function LivePreview({ url, blur }: { url: string; blur: number }) {
  const [layers, setLayers] = useState<{ a: string | null; b: string | null; top: 'a' | 'b' }>({ a: null, b: null, top: 'a' });
  useEffect(() => { let live = true; const im = new Image(); im.decoding = 'async';
    im.onload = () => { if (!live) return; setLayers(l => (l.top === 'a' ? (l.a === url ? l : { ...l, b: url, top: 'b' }) : (l.b === url ? l : { ...l, a: url, top: 'a' }))); };
    im.src = url; return () => { live = false; }; }, [url]);
  return <span className="gt-prev" style={{ ['--gt-blur' as any]: `${blur}px` }} aria-hidden>
    {layers.a && <img src={layers.a} alt="" className={layers.top === 'a' ? 'on' : ''} />}
    {layers.b && <img src={layers.b} alt="" className={layers.top === 'b' ? 'on' : ''} />}
  </span>;
}

/** Loading → Generating → Finishing. Done segments full, the active one fills with real progress (or a gentle sweep when unknown). */
export function Stepper({ p, className = '' }: { p: ProgressInfo; className?: string }) {
  const at = stepIndex(p.stage); const f = stageFill(p);
  return <span className={`gt-steps ${className}`} aria-hidden>{STEPS.map(([k], i) => {
    const done = at > i || (at === i && p.stage === 'done'); const cur = at === i && !done;
    return <i key={k} className={done ? 'done' : cur ? (f == null ? 'cur ind' : 'cur') : ''}><b style={cur && f != null ? { width: `${Math.max(4, f * 100)}%` } : undefined} /></i>; })}</span>;
}

const HUES: [string, string][] = [['#FF7A1A', '#7A5CFF'], ['#FF9F45', '#3E7BFA'], ['#F2643C', '#2BB3C0'], ['#FFB357', '#8E6BFF']];
const hueOf = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return HUES[h % HUES.length]; };

export interface GenTileProps { job: JobState; /** the image feature's short tag ("Edit", "Relight"): sits in the top row, before the place chip */ tag?: string;
  /** In place of the faint mascot while there is no live preview (Audio: SyteSim warming up, AudioViz's BeanPerformer). */ art?: ReactNode;
  /** A short friendly line under the progress label while it runs ("SyteSim is warming up"). */ note?: string; /** the tile sits inside a <button> or <a> */ inButton?: boolean; testId?: string; className?: string; onCanceled?: () => void }
export default function GenTile({ job, inButton = false, testId, className = '', onCanceled, tag, art, note }: GenTileProps) {
  const toast = useToast(); const j: any = job; const p = progressOfJob(job);
  const live = j.status === 'running' || j.status === 'queued';
  const act = useQueueActivity(live); const item = activityItem(act, job.id);
  const pl = placeOf(j, item);
  const queued = p.stage === 'queued'; const canceled = p.stage === 'canceled';
  const photos: string[] = j.toolId === 'app-photos-to-reel' && Array.isArray(j.input?.photoUrls) ? j.input.photoUrls : [];
  const sourcePhoto = photos[Math.max(0, Math.min(photos.length - 1, Number(j.input?.currentPhoto) || 0))] ?? null;
  const preview = !canceled ? (!queued ? p.previewUrl : null) ?? sourcePhoto : null;
  const label = live && photos.length && /^(Photo \d+ of \d+|Stitching|Adding music|Choose where to continue this step)$/.test(String(j.stage)) ? String(j.stage) : progressLabel(p); const eta = !queued && !canceled ? etaText(p.etaSeconds) : '';
  const model: string = item?.model ?? j.modelName ?? j.model ?? '';
  const prompt: string = String((j.input ? typedPromptOf(j.input) : null) ?? item?.title ?? '').replace(/\s+/g, ' ').trim(); /* workflow jobs: your words (2026-10-25) */
  const [a, b] = hueOf(String(model || job.toolId || job.id));
  const cancel = () => { dropFromActivity(job.id); void cancelQueued(job, toast).then(ok => { if (ok) onCanceled?.(); }); };
  const chip = [pl.label, pl.price].filter(Boolean).join(' · ');
  return <div className={`gt gt-${p.stage}${preview ? ' gt-has-prev' : ''} ${className}`} data-testid={testId} data-stage={p.stage}
    style={{ ['--gt-a' as any]: a, ['--gt-b' as any]: b }} role="group" aria-label={`${label}${prompt ? `: ${prompt}` : ''}`}>
    <span className="gt-bg" aria-hidden><span className="gt-shim" /></span>
    {preview ? <LivePreview url={preview} blur={sourcePhoto && preview === sourcePhoto ? 0 : previewBlur(p)} /> : !canceled && (art ? <span className="gt-art" aria-hidden>{art}</span> : <span className="gt-mascot" aria-hidden><Mascot size={28} wink={!queued} /></span>)}
    <span className="gt-fade" aria-hidden />
    <div className="gt-top">
      {tag && <span className="gt-tag" data-testid="gt-tag">{tag}</span>}
      {chip && <span className={`gt-chip gt-chip-${pl.kind}`} data-testid="gt-chip" title={pl.sample ? 'Sample run: nothing is generated or charged' : undefined}><PlaceGlyph kind={pl.kind} /><span>{chip}</span></span>}
      {canCancelJob(job) && <CancelX inButton={inButton} label={queued ? 'Cancel queued job' : 'Cancel this job'} onCancel={cancel} testId={`gt-cancel-${job.id}`} />}
    </div>
    <div className="gt-bot">
      {!canceled && <Stepper p={p} />}
      <div className="gt-line"><b className="gt-label" data-testid="gt-label" aria-live="polite">{label}</b>{eta && <span className="gt-eta" data-testid="gt-eta" title="Time left, from the step timing">{eta}</span>}</div>
      {note && !canceled && <p className="gt-note" data-testid="gt-note">{note}</p>}
      {(model || prompt) && <p className="gt-sub">{model && <span className="gt-model">{model}</span>}{model && prompt && <span aria-hidden> · </span>}{prompt && <span className="gt-prompt">{prompt}</span>}</p>}
    </div>
  </div>;
}

/** A compact row (the activity popover, the audio history list): thumbnail (live preview or shimmer), title, "model · place · price",
 *  the one label + time left, a thin bar, ✕. `onOpen` makes the main part a button; inside an existing button pass `inButton`. */
export function JobRow({ id, title, model, place, p, onOpen, onCancel, inButton = false, cancelLabel, extra, waiting }: {
  /** in the app's waiting line (shows "#1 · starts next") */ waiting?: boolean; id: string; title: string; model?: string | null; place: { kind: PlaceKind; label: string; price: string }; p: ProgressInfo; onOpen?: () => void; onCancel?: (() => void) | null; inButton?: boolean; cancelLabel?: string; extra?: ReactNode;
}) {
  const queued = p.stage === 'queued'; const [a, b] = hueOf(String(model || id)); const o = overallFill(p);
  const step = waiting ? `#${p.queuePosition ?? 1} · ${p.queueReason ?? startsText(p.queuePosition)}` : progressLabel(p); const eta = queued ? '' : etaText(p.etaSeconds);
  const meta = [model, place.label, place.price].filter(Boolean).join(' · ');
  const main = <>
    <span className={`jr-thumb${queued ? ' q' : ''}`} style={{ ['--gt-a' as any]: a, ['--gt-b' as any]: b }} aria-hidden>{p.previewUrl && !queued ? <img src={p.previewUrl} alt="" /> : <span className="gt-shim" />}<span className="jr-place"><PlaceGlyph kind={place.kind} size={11} /></span></span>
    <span className="jr-txt"><b className="jr-title">{title}</b>{meta && <small className="jr-meta">{meta}</small>}
      <small className="jr-step"><span>{step}</span>{eta && <span className="jr-eta">{eta}</span>}</small>
      {!queued && <span className={`jr-bar${o == null ? ' ind' : ''}`} aria-hidden><i style={o == null ? undefined : { width: `${Math.max(3, o * 100)}%` }} /></span>}{extra}</span></>;
  return <div className={`jr jr-${p.stage}`} data-testid={`jr-${id}`}>
    {onOpen ? <button type="button" className="jr-main" data-apop-item onClick={onOpen} aria-label={`Open ${title}. ${step}${eta ? `, ${eta} left` : ''}`}>{main}</button> : <span className="jr-main">{main}</span>}
    {onCancel && <CancelX inButton={inButton} label={cancelLabel ?? (queued ? 'Cancel queued job' : 'Cancel this job')} onCancel={onCancel} testId={`jr-cancel-${id}`} />}
  </div>;
}

/** The row for a job object (audio history), sharing the popover's look. */
export function JobRowFor({ job, inButton = true, onCanceled }: { job: JobState; inButton?: boolean; onCanceled?: () => void }) {
  const toast = useToast(); const j: any = job; const live = j.status === 'running' || j.status === 'queued'; const waiting = j.status === 'queued';
  const act = useQueueActivity(live); const item = activityItem(act, job.id); const pl = placeOf(j, item); const p = progressOfJob(job);
  const title = String((j.input ? typedPromptOf(j.input) : null) || item?.title || 'Untitled').replace(/\s+/g, ' ').trim() || 'Untitled';
  const ref = useRef(job); ref.current = job;
  return <JobRow waiting={waiting} id={job.id} title={title} model={item?.model ?? j.modelName ?? j.model ?? null} place={pl} p={p} inButton={inButton}
    onCancel={canCancelJob(job) ? () => { dropFromActivity(job.id); void cancelQueued(ref.current, toast).then(ok => { if (ok) onCanceled?.(); }); } : null} />;
}
