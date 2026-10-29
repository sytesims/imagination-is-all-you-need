/**
 * Fit to model in the Video bar (2026-10-26): every workflow with a clip. The model's input limits and the fix come from ONE shared module
 * (server/src/shared/videoFit.ts, the same plan the quote, the submit and the run use): a too-small clip is enlarged, a too-long one trimmed, the
 * frame rate converted, all free and local before upload. When the model keeps another shape, two choices with a small preview of the frame:
 * Keep everything (recommended: padded to the model's shape, the padding cropped off the result) or Crop to fill (shows what is cut).
 * The bar shows one line ("Adjusted for Kling: padded to 16:9, full frame kept"); the choice goes into the form and the quote as `fit`.
 */
import type { ReactNode, RefObject } from 'react';
import { BarPopover, PopSection, PopNote } from '../../../shared/BarPop';
import { tip } from '../../../shared/Tooltip';
import { videoFitFor, type VideoFitPlan, type FitMode } from '../../../../../server/src/shared/videoFit';
import type { SlotFile } from './types';

const FitIcon = ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
  <rect x="2.5" y="4" width="11" height="8" rx="1.5" /><path d="M5 2.2v1.6M11 2.2v1.6M5 12.2v1.6M11 12.2v1.6" /></svg>;

/** The frame as the model gets it: Keep everything = the clip inside the model's shape (bars); Crop to fill = the clip with the cut part shaded. */
export function FitPreview({ clip, plan, testId }: { clip: SlotFile; plan: VideoFitPlan; testId?: string }) {
  const pct = (a: number, b: number) => `${(a / b) * 100}%`;
  /** a box that fits 176×96 at the frame's shape (a 9:16 clip stays small, a 2.39:1 one stays inside its column) */
  const box = (w: number, h: number) => { const a = w / h; const W = Math.min(176, 96 * a); return { width: Math.round(W), height: Math.round(W / a) }; };
  if (plan.content) { const F = plan.frame, C = plan.content;
    return <div className="vfit-frame vfit-pad" style={box(F.width, F.height)} data-testid={testId}>
      <video className="vfit-clip" src={`${clip.url}#t=0.5`} muted playsInline preload="metadata" style={{ left: pct(C.x, F.width), top: pct(C.y, F.height), width: pct(C.width, F.width), height: pct(C.height, F.height) }} />
    </div>; }
  const S = plan.source, K = plan.crop;
  return <div className="vfit-frame" style={box(S.width, S.height)} data-testid={testId}>
    <video className="vfit-clip" src={`${clip.url}#t=0.5`} muted playsInline preload="metadata" style={{ inset: 0, width: '100%', height: '100%' }} />
    {K && <><span className="vfit-cut" style={{ left: 0, top: 0, width: pct(K.x, S.width), height: '100%' }} /><span className="vfit-cut" style={{ right: 0, top: 0, width: pct(S.width - K.x - K.width, S.width), height: '100%' }} />
      <span className="vfit-cut" style={{ left: pct(K.x, S.width), top: 0, width: pct(K.width, S.width), height: pct(K.y, S.height) }} /><span className="vfit-cut" style={{ left: pct(K.x, S.width), bottom: 0, width: pct(K.width, S.width), height: pct(S.height - K.y - K.height, S.height) }} />
      <span className="vfit-keep" style={{ left: pct(K.x, S.width), top: pct(K.y, S.height), width: pct(K.width, S.width), height: pct(K.height, S.height) }} /></>}
  </div>;
}

/** The plan for this clip on this model (the same function the server runs), for the chosen mode; null = no limits row or no clip size yet. */
export const fitPlanOf = (toolId: string, prov: string, clip: SlotFile | null | undefined, seconds: number | null, mode: FitMode): VideoFitPlan | null =>
  clip?.w && clip?.h ? videoFitFor(toolId, prov, { width: clip.w, height: clip.h, duration: seconds, fit: mode, videoFormat: (clip.file?.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase() || null }) : null;

/** The bar's Fit chip, its one-line note and its popover. */
export function useVideoFit(o: { toolId: string; prov: string; clip: SlotFile | null | undefined; seconds: number | null; mode: FitMode; setMode: (m: FitMode) => void; pop: string; setPop: (p: string) => void;
  anchorOf: (gid: string) => { readonly current: HTMLButtonElement | null }; chipRef: (gid: string) => (el: HTMLButtonElement | null) => void; dock: RefObject<HTMLDivElement>; busy: boolean }) {
  const plan = fitPlanOf(o.toolId, o.prov, o.clip, o.seconds, o.mode);
  const pad = plan?.aspect.choice ? fitPlanOf(o.toolId, o.prov, o.clip, o.seconds, 'pad') : null; const crop = plan?.aspect.choice ? fitPlanOf(o.toolId, o.prov, o.clip, o.seconds, 'crop') : null;
  const shown = !!plan && (plan.changed || !!plan.blocked);
  const on = o.pop === 'g:fit';
  const chip: ReactNode = shown ? <button key="fit" ref={o.chipRef('fit')} type="button" className={`ic-chip wf-grp wf-fold${on ? ' on' : ''}${plan!.blocked ? ' vbar-need' : ''}`} aria-haspopup="dialog" aria-expanded={on} data-testid="vbar-group-fit"
    aria-label={plan!.note ?? plan!.blocked ?? 'Fit to model'} {...tip(on ? null : plan!.note ?? plan!.blocked)} onClick={() => o.setPop(on ? '' : 'g:fit')}>
    <FitIcon /><span className="wf-grp-l">Fit</span><b>{plan!.blocked ? 'Can’t fit' : plan!.aspect.choice ? (o.mode === 'crop' ? 'Crop' : 'Full frame') : 'Auto'}</b></button> : null;
  const note: ReactNode = shown ? <button type="button" className={`vbar-fitnote${plan!.blocked ? ' bad' : ''}`} data-testid="vbar-fit-note" aria-haspopup="dialog" aria-expanded={on} onClick={() => o.setPop(on ? '' : 'g:fit')}
    {...tip(on ? null : plan!.aspect.choice ? 'Keep everything or crop to fill' : 'What was adjusted')}><FitIcon size={12} /><span>{plan!.note ?? plan!.blocked}</span>{plan!.aspect.choice && <b className="vbar-fitnote-a">Change</b>}</button> : null;
  const choice = (m: FitMode, p: VideoFitPlan, title: string, line: string) => <button type="button" role="radio" aria-checked={o.mode === m} className={`vfit-opt${o.mode === m ? ' on' : ''}`} disabled={o.busy} data-testid={`vbar-fit-${m}`} onClick={() => o.setMode(m)}>
    <FitPreview clip={o.clip!} plan={p} testId={`vbar-fit-preview-${m}`} /><span className="vfit-t">{title}</span><span className="vfit-l">{line}</span></button>;
  const popover: ReactNode = shown && o.clip ? <BarPopover key="fit" open={on} anchor={o.anchorOf('fit')} avoid={o.dock} watch={o.dock} placement="top" gap={8} onClose={() => o.setPop('')} label="Fit to model" testId="vbar-pop-fit" width={420}>
    <PopSection label={`Fit to ${plan!.model}`} testId="vbar-fit">
      {plan!.problems.length > 0 && <p className="vfit-why" data-testid="vbar-fit-why">{plan!.problems.join(' ')}</p>}
      {pad && crop && <div className="vfit-opts" role="radiogroup" aria-label="How to fit the frame">
        {choice('pad', pad, 'Keep everything (recommended)', `Padded to ${pad.aspect.target} for ${plan!.model}; the bars are cropped off the result, so it keeps your framing.`)}
        {choice('crop', crop, 'Crop to fill', `Cut to ${crop.aspect.target}: the shaded part is not sent and won’t be in the result.`)}</div>}
    </PopSection>
    <PopNote testId="vbar-fit-free">{plan!.blocked ? plan!.blocked : `${plan!.note}. Done on this computer before upload, free.`}</PopNote>
  </BarPopover> : null;
  return { plan, chip, note, popover };
}
