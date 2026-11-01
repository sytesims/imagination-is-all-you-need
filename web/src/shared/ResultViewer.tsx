import { recreateHref } from './workflowLinks';
import { goClick } from './goToWorkflow';
import { tip } from './Tooltip';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { retryJob, restoreJob, purgeJob, fmtBytes, listTools, ERROR_LABELS, STATE_LABELS, type JobState } from '../api';
import { askConfirm } from './Dialog';
import { navigate } from '../platform/router';
import { useToast, useCopied, Copied } from './Toast';
import { copySupport } from '../ui/support';
import { CloseIcon, ReplaceIcon, AlertIcon, TrashIcon, MusicIcon, OfficialBadgeIcon, CommunityIcon, SparkleIcon, LogoMark, CompareIcon, placeIconFor } from '../ui/Icons';
import { compositeCostText, fmtUsd, ownAccountsNow, priceToken, priceDetail, ledgerUsd, jobCostLine, jobCostAmount } from './billing';
import { heldBack } from './creditsBack';
import { TryOnButtons } from './TryOn';
import { ranOnOf, useToolModels, placeLabelOf, placeOfAny } from './models';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
import { isDemoJob } from './quote';
import { workflowHref } from './FeatureCredit';
import type { WorkflowSource } from './imageFeatures';
import { jobTiming, durationText } from './jobTiming';
import FailureState from './FailureState';
import { Waveform, useWaveform } from './Waveform';
import { PlayGlyph as CardPlay, PauseGlyph as CardPause, durLabel } from './AudioCard';
import { AudioCover, AudioVizLayer, useAudioViz } from './AudioViz';
import type { SavedStyle } from './listenStyle';
import { primeAudio } from './audioGraph';
import type { AudioKind } from './audioVizLogic';
import { useExclusivePlayback } from './audioPlayer';
import { PeekIcon } from '../ui/next/PromptPeek';
import { useProfile, nameOf, UserAvatar } from './profile';
import './resultViewer.css';
import { MentionText } from './MentionChips';
import { seamJumpTo } from './continuation';
import { cueAt, type Cue } from './Captions';
import { useMediaFailure } from './useMediaFailure';
import type { MediaFailure } from './mediaFailure';

/** The full-screen result viewer (Create Image, Assets and the /jobs/:id route, Community shots): a blurred copy of the result fills the screen, the image sits uncropped
 *  left of a ~400 px side panel (header, Info / Edit tabs, a scrolling body, actions pinned at the bottom). Phones (≤700 px)
 *  get the image on top and the panel as a bottom sheet. The shell owns the dialog behaviour: a portal over the whole page
 *  (header included), the rest of the app inert, a focus trap, Esc (innermost layer first), ←/→ and swipe to step. */
/** The Compare button pulses for the first few result views until it's used once (per browser; storage may be blocked). */
const CMP_KEY = 'ohf:cmp-hint';
const cmpHint = (): boolean => { try { const v = Number(localStorage.getItem(CMP_KEY) ?? 0); if (v < 0 || v >= 3) return false; localStorage.setItem(CMP_KEY, String(v + 1)); return true; } catch { return false; } };
const cmpSeen = () => { try { localStorage.setItem(CMP_KEY, '-1'); } catch { /* storage blocked */ } };
export type ViewerTab = { id: string; label: string };
const icon = (d: ReactNode) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
export const PanelGlyph = () => icon(<><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M15 4.5v15" /></>);
export const ExpandGlyph = () => icon(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
export const PromptGlyph = () => icon(<><path d="M5 4h14v16H5z" /><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></>);
export const VideoGlyph = () => icon(<><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="m16 10.5 5-3v9l-5-3" /></>);
/** Input → Output strip arrow */
export const ArrowGlyph = () => icon(<path d="M5 12h14m-5-5 5 5-5 5" />);
export const RefGlyph = () => icon(<><rect x="3" y="3" width="13" height="13" rx="2.5" /><path d="M8 21h11a2 2 0 0 0 2-2V8" /><path d="m6.5 12.5 3-3 4 4" /></>);
export const RecreateGlyph = () => <ReplaceIcon size={16} />;
export const RestoreGlyph = () => icon(<><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>);
export const DetailsGlyph = () => icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><path d="M12 7.6v.01" /></>);

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
/* PB-13: Hide panel (expand) is per item. Every item and every time the viewer opens starts with the details shown; the old remembered choice is dropped. */
try { localStorage.removeItem('ohf:viewer-panel'); } catch { /* storage off */ }

const APP_SAMPLES = 'Imagination Is All You Need samples';
/** One of the app's examples (the Examples project, server/src/featuredSeed.ts): $0 for you, but its details keep the real model, place and price.
 *  "Made by the app's authors · MiniMax H3 · Comfy Cloud · $0.80". */
type ExampleInfo = { model?: string | null; runOn?: string | null; costUsd?: number | null };
const examplePlace = (ex: ExampleInfo) => (ex.runOn === 'local' ? 'Our computer' : 'Comfy Cloud');
const examplePrice = (ex: ExampleInfo) => (ex.costUsd ? fmtUsd(ex.costUsd) : 'Free');
export const exampleLine = (ex: ExampleInfo) => ['Made by the app’s authors', ex.model, examplePlace(ex), examplePrice(ex)].filter(Boolean).join(' · ');
/** Someone else's item (a sample or a community result): their own name, and our app mark on our shipped samples. Never your picture. */
export const authorOf = (job: unknown, sample = false): { name: string; role: string; mark?: ReactNode } => {
  /* the app's own featured generations (shared/featured.ts): made in this app, shown as an example */
  if ((job as any)?.example) return { name: 'Imagination Is All You Need', role: exampleLine((job as any).example), mark: <LogoMark size={18} color="currentColor" /> };
  const name = String((job as any)?.author ?? (sample ? APP_SAMPLES : 'Community member'));
  return { name, role: 'Author', ...(name === APP_SAMPLES ? { mark: <LogoMark size={18} color="currentColor" /> } : {}) };
};
/** The panel's author line: your picture + display name on your own items (live from the shared profile), else the maker's mark or initial. */
function ViewerWho({ who }: { who: { name: string; role: string; self?: boolean; mark?: ReactNode } }) {
  const prof = useProfile(); const name = who.self ? nameOf(prof) : who.name;
  return <>{who.self ? <UserAvatar profile={prof} size={32} className="rvx-av rvx-av-me" />
      : <span className={`rvx-av${who.mark ? ' rvx-av-mark' : ''}`} aria-hidden data-testid="rvx-av-other">{who.mark ?? (who.name.trim()[0] ?? '?').toUpperCase()}</span>}
    <span className="rvx-who"><b data-testid="rvx-author" title={name}>{name}</b><small>{who.role}</small></span></>;
}
export function ViewerShell({ label, bg, media, who, badge, tabs, tab, setTab, body, footer, onClose, onPrev, onNext, pos, children, testId = 'result-viewer', fullscreen = true, itemKey, headActions }: {
  label: string; bg?: string; media: ReactNode; /** self: your own item (your picture and display name from the shared profile); mark: another maker's icon (else their initial) */ who: { name: string; role: string; self?: boolean; mark?: ReactNode }; badge?: ReactNode; /** icon buttons left of ✕ (Favourite / Like) */ headActions?: ReactNode;
  tabs: ViewerTab[]; tab: string; setTab: (t: string) => void; body: ReactNode; footer: ReactNode;
  onClose: () => void; onPrev?: (() => void) | null; onNext?: (() => void) | null; pos?: string; children?: ReactNode; testId?: string; /** false: no image to show full screen (a failed run) */ fullscreen?: boolean;
  /** Which item is showing (job id + output): a new item brings the details panel back. */ itemKey?: string;
}) {
  const box = useRef<HTMLDivElement>(null); const stage = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState(true);
  useEffect(() => { setPanel(true); }, [itemKey]);
  const togglePanel = () => setPanel(v => !v);
  const nav = useRef({ onPrev, onNext, onClose }); nav.current = { onPrev, onNext, onClose };
  /* Dialog behaviour: the app root goes inert (the viewer is a portal on body), the page stops scrolling, focus starts on ✕. */
  useEffect(() => {
    const root = document.getElementById('root'); const wasInert = !!root?.inert; if (root) root.inert = true;
    const ov = document.body.style.overflow; document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-testid=rvx-close]')?.focus({ preventScroll: true }));
    const key = (e: KeyboardEvent) => {
      const b = box.current; if (!b) return;
      /* A dialog inside the viewer (Share) gets the trap and Esc here; a dialog or popover portalled on body owns its keys. */
      const inner = b.querySelector<HTMLElement>('.mp-scrim');
      if (document.querySelector('.ew-scrim, .nk-scrim, .apop, .dlg-scrim') || (!inner && document.querySelector('.mp-scrim'))) return;
      if (inner && e.key === 'Escape') { e.preventDefault(); inner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); requestAnimationFrame(() => b.querySelector<HTMLElement>('[data-testid=rv-share]')?.focus()); return; }
      const scope = inner ?? b;
      if (e.key === 'Tab') { const f = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.getClientRects().length > 0 && !el.closest('details:not([open]) > :not(summary)')); if (!f.length) return;
        const a = document.activeElement as HTMLElement | null; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey ? (a === first || !scope.contains(a)) : (a === last || !scope.contains(a))) { e.preventDefault(); (e.shiftKey ? last : first).focus(); } return; }
      if (e.key === 'Escape') { e.preventDefault(); const open = [...b.querySelectorAll<HTMLDetailsElement>('details[open]')].pop(); if (open) { open.open = false; open.querySelector<HTMLElement>('summary')?.focus(); return; } nav.current.onClose(); return; }
      const t = e.target as HTMLElement | null; if (t && (/^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(t.tagName) || t.isContentEditable || t.closest?.('.splitp, [role="slider"]'))) return; /* the Compare divider moves with the arrows */ /* a focused player seeks with the arrows */
      if (e.metaKey || e.ctrlKey || e.altKey || b.querySelector('details[open]')) return;
      if (e.key === 'ArrowLeft' && nav.current.onPrev) { e.preventDefault(); nav.current.onPrev(); }
      else if (e.key === 'ArrowRight' && nav.current.onNext) { e.preventDefault(); nav.current.onNext(); }
    };
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); if (root) root.inert = wasInert; document.body.style.overflow = ov; if (document.fullscreenElement) document.exitFullscreen().catch(() => 0); };
  }, []);
  /* Touch: a mostly-horizontal swipe on the image steps (60 px threshold). */
  const sw = useRef<{ x: number; y: number } | null>(null);
  const onTS = (e: React.TouchEvent) => { if ((e.target as HTMLElement).closest('video, audio, input, .rvx-wave, .rvx-zoom.is-zoomed, .splitp')) { sw.current = null; return; } sw.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTE = (e: React.TouchEvent) => { const s = sw.current; sw.current = null; if (!s) return; const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y; if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) (dx < 0 ? onNext : onPrev)?.(); };
  const full = () => { const el = stage.current?.querySelector<HTMLElement>('.rvx-vid, .rvx-img, .rvx-media') ?? stage.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => 0); else el.requestFullscreen?.().catch(() => 0); };
  const tabBtn = (t: ViewerTab) => <button key={t.id} type="button" role="tab" id={`rvx-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="rvx-tabpanel" className={tab === t.id ? 'on' : ''} data-testid={`rvx-tab-${t.id}`} onClick={() => setTab(t.id)}
    onKeyDown={e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); e.stopPropagation(); const i = tabs.findIndex(x => x.id === t.id); const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; setTab(n.id); document.getElementById(`rvx-tab-${n.id}`)?.focus(); }}>{t.label}</button>;
  return createPortal(<div ref={box} className={`rvx${panel ? '' : ' rvx-nopanel'}`} role="dialog" aria-modal="true" aria-label={label} data-testid={testId}>
    <div className="rvx-bg" aria-hidden style={bg ? { backgroundImage: `url("${bg}")` } : undefined} />
    <div ref={stage} className="rvx-stage" onTouchStart={onTS} onTouchEnd={onTE} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      {media}
      {onPrev !== undefined && <button type="button" className="rvx-step rvx-prev" aria-label="Previous result" {...tip('Previous (←)')} disabled={!onPrev} onClick={() => onPrev?.()} data-testid="rvx-prev">‹</button>}
      {onNext !== undefined && <button type="button" className="rvx-step rvx-next" aria-label="Next result" {...tip('Next (→)')} disabled={!onNext} onClick={() => onNext?.()} data-testid="rvx-next">›</button>}
      <div className="rvx-tools">
        {pos && <span className="rvx-pos" aria-live="polite" data-testid="rvx-pos">{pos}</span>}
        <button type="button" className="rvx-tool" aria-label={panel ? 'Hide details panel' : 'Show details panel'} aria-pressed={panel} {...tip(panel ? 'Hide panel' : 'Show panel')} onClick={togglePanel} data-testid="rvx-panel-toggle"><PanelGlyph /></button>
        {fullscreen && <button type="button" className="rvx-tool" aria-label="Full screen" {...tip('Full screen')} onClick={full} data-testid="rvx-fullscreen"><ExpandGlyph /></button>}
      </div>
    </div>
    <aside className="rvx-panel" aria-label="Result details" data-testid="rvx-panel">
      <header className="rvx-head">
        <ViewerWho who={who} />
        {badge}
        {headActions}
        <button type="button" className="rvx-x" aria-label="Close viewer" {...tip('Close (Esc)')} data-testid="rvx-close" onClick={onClose}><CloseIcon size={16} /></button>
      </header>
      {tabs.length > 1 && <div className="rvx-tabs" role="tablist" aria-label="Result panel">{tabs.map(tabBtn)}</div>}
      <div className="rvx-body" id="rvx-tabpanel" role="tabpanel" aria-labelledby={`rvx-tab-${tab}`} tabIndex={-1}>{body}</div>
      <div className="rvx-foot" data-testid="rvx-actions">{footer}</div>
    </aside>
    {children}
  </div>, document.body);
}

/** PROMPT block: label, Copy, the prompt in a lighter box clamped to about six lines with a fade, then See all. */
/** onCopy: resolves false when the copy failed, so the button only says Copied when it worked. */
export function ViewerPrompt({ text, onCopy, extra, full, label = 'Prompt' }: { label?: string; text: string; onCopy: () => Promise<unknown> | void; extra?: ReactNode;
  /** 2026-10-25: a workflow job: `text` is your words, `full` the prompt the workflow composed (behind the eye) */ full?: string | null }) {
  const [copied, flash] = useCopied(); const ref = useRef<HTMLParagraphElement>(null); const [open, setOpen] = useState(false); const [over, setOver] = useState(false); const [showFull, setShowFull] = useState(false);
  const shown = showFull && full ? full : text;
  useEffect(() => { setShowFull(false); }, [text, full]);
  useEffect(() => { setOpen(false); const el = ref.current; if (!el) return; const m = () => setOver(el.scrollHeight > el.clientHeight + 2); requestAnimationFrame(m); }, [shown]);
  return <section className="rvx-sec" aria-label={label}>
    <div className="rvx-sec-h"><span className="rvx-lbl"><PromptGlyph />{showFull ? 'Full prompt' : full && label === 'Prompt' ? 'Your words' : label}</span><span className="rvx-sec-acts">
      {full && <button type="button" className={`rvx-copy rvx-peek${showFull ? ' on' : ''}`} data-testid="rvx-full-prompt" aria-pressed={showFull} {...tip(showFull ? 'Back to your words' : 'See the full prompt the workflow sent')} onClick={() => setShowFull(s => !s)}><PeekIcon /></button>}
      {shown && <button type="button" className="rvx-copy" data-testid="rvx-copy" onClick={() => { void Promise.resolve(showFull && full ? navigator.clipboard?.writeText(full) : onCopy()).then(ok => { if (ok !== false) flash(); }); }}>{copied ? <Copied /> : 'Copy'}</button>}</span></div>
    <div className={`rvx-prompt${open ? ' open' : ''}${over && !open ? ' fade' : ''}`}><p ref={ref} data-testid="rvx-prompt">{shown ? <MentionText text={shown} /> : <span className="rvx-none">{full ? 'None: the workflow wrote the prompt' : `No ${label.toLowerCase()}`}</span>}</p></div>
    {(over || open) && <button type="button" className="rvx-seeall" aria-expanded={open} data-testid="rvx-see-all" onClick={() => setOpen(o => !o)}>{open ? 'Show less' : 'See all'}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg></button>}
    {extra}
  </section>;
}

/** DETAILS block: collapsible two-column table. */
export function ViewerDetails({ rows, extra }: { rows: [string, ReactNode][]; extra?: ReactNode }) {
  const [open, setOpen] = useState(true);
  return <section className="rvx-sec" aria-label="Details">
    <button type="button" className="rvx-sec-h rvx-sec-btn" aria-expanded={open} aria-label={open ? 'Hide details' : 'Show details'} data-testid="rvx-details-toggle" onClick={() => setOpen(o => !o)}><span className="rvx-lbl"><DetailsGlyph />Details</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg></button>
    {open && <dl className="rvx-dl" data-testid="rvx-details">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    {open && extra}
  </section>;
}

export const whenText = (ts: unknown) => { const n = Number(ts); return n > 0 ? new Date(n).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' }) : ''; };

/** A failed (or blocked) result in the same shell: the reason on the stage, the prompt and a few details in the panel, Try again as the primary action. */
export function FailedViewer({ job, onClose, onPrev, onNext, pos, model, onGone }: { job: JobState; onClose: () => void; onPrev?: (() => void) | null; onNext?: (() => void) | null; pos?: string; model?: string; /** Trash: after Restore or Delete forever (default: close) */ onGone?: () => void }) {
  const toast = useToast(); const [copied, flash] = useCopied(); const [busy, setBusy] = useState(false); const x: any = job; const inp: any = job.input ?? {};
  const t = job.errorType ?? 'temporary'; const title = (job.status as string) === 'blocked' ? STATE_LABELS.blocked : ERROR_LABELS[t] ?? 'This run failed';
  const retry = async () => { if (busy) return; setBusy(true); try { await retryJob(job.id); toast('Trying again with the same settings'); window.dispatchEvent(new Event('ohf:jobs-changed')); onClose(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); } };
  const recreate = recreateHref(job)!;
  const rows = ([['Feature', x.feature?.label ?? ''], ['Model', model || x.modelName || x.model || ''], ['Run on', ranOnOf(x) || x.runOnLabel ? <RunOnCell job={x} label={ranOnOf(x) || x.runOnLabel} /> : ''], ['Status', title], ['Created', whenText(x.createdAt)], ['Seed', inp.seed ?? x.seed ?? '']] as [string, ReactNode][]).filter(([, v]) => v !== '' && v != null);
  /* The bean in a mood with the reason and its fix (shared/FailureState); Try again, Change settings and Run on stay in the footer below. */
  const media = <div className="rvx-media rvx-fail-stage" data-testid="rvx-fail"><FailureState job={job} skip={['retry', 'recreate', 'runLocal']} onLeave={() => onClose()} /></div>;
  const trashed = !!(job as any).deletedAt;
  return <ViewerShell label="Failed result" media={media} who={{ name: 'You', role: 'Author', self: true }} badge={trashed ? <TrashChip /> : null} tabs={[{ id: 'info', label: 'Info' }]} tab="info" setTab={() => 0} onClose={onClose} onPrev={onPrev} onNext={onNext} pos={pos} testId="result-viewer-failed" fullscreen={false} itemKey={job.id}
    body={<><ViewerPrompt text={String(inp.prompt ?? '').trim()} onCopy={() => navigator.clipboard?.writeText(String(inp.prompt ?? '')).then(() => { toast('Prompt copied'); }, () => false)} /><ViewerDetails rows={rows} /></>}
    footer={trashed ? <TrashActions job={job} onGone={onGone ?? onClose} /> : <><TryOnButtons job={job} onStarted={() => onClose()} /><button type="button" className="rvx-primary" data-testid="rvx-try-again" disabled={busy} onClick={retry}><RecreateGlyph />{busy ? 'Starting…' : 'Try again'}</button>
      <div className="rvx-row2"><a className="rvx-second" href={recreate} data-testid="rvx-edit-settings" onClick={goClick(recreate, onClose)}>Change settings</a>
        <button type="button" className="rvx-second" data-testid="rvx-copy-support" onClick={() => copySupport(job.id, `job ${job.id} · ${job.toolId} · ${t} · ${job.error ?? ''}`).then(() => flash(), () => toast('Couldn’t copy the support info', 'error'))}>{copied ? <Copied /> : 'Copy support info'}</button></div></>} />;
}

/** Trash: "Delete forever" behind the app's confirm dialog (DELETE /api/trash/:id). True when it went. Assets uses it too. */
export async function purgeForever(id: string, toast: (m: string, kind?: any) => void): Promise<boolean> {
  if (!(await askConfirm({ title: 'Delete forever?', body: 'This removes the result and its files from this computer. You can’t undo this.', confirm: 'Delete forever', cancel: 'Keep', danger: true }))) return false;
  try { const r = await purgeJob(id); const b = r.removed?.bytes ?? 0; const kept = r.removed?.keptShared ?? 0;
    toast(`Deleted${b > 0 ? ` · freed ${fmtBytes(b)}` : ''}${kept > 0 ? `. Kept ${kept} shared file${kept === 1 ? '' : 's'} still used elsewhere.` : ''}`); return true;
  } catch (e) { toast(`Couldn’t delete: ${(e as Error).message}`, 'error'); return false; }
}
export const TrashChip = () => <span className="rvx-badges"><em className="rvx-trash-chip" data-testid="rvx-in-trash">In Trash</em></span>;
/** The pinned actions for a result in Trash: Restore, then Delete forever (instead of the normal actions). */
export function TrashActions({ job, onGone }: { job: JobState; onGone: () => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [job.id]); /* S-03: after Restore / Delete forever the viewer moves to the next item; its buttons start enabled */
  const done = () => { window.dispatchEvent(new Event('ohf:jobs-changed')); onGone(); };
  const restore = async () => { if (busy) return; setBusy(true); try { await restoreJob(job.id); toast('Restored to Assets'); done(); } catch (e) { toast(`Couldn’t restore: ${(e as Error).message}`, 'error'); setBusy(false); } };
  const purge = async () => { if (busy) return; setBusy(true); const ok = await purgeForever(job.id, toast); if (ok) done(); else setBusy(false); };
  return <><button type="button" className="rvx-primary" data-testid="rvx-restore" disabled={busy} onClick={restore}><RestoreGlyph />Restore</button>
    <div className="rvx-row2"><button type="button" className="rvx-second rvx-danger" data-testid="rvx-purge" disabled={busy} onClick={purge}><TrashIcon size={16} />Delete forever</button></div></>;
}

export const durText = (s: number) => !(s > 0) ? '' : s < 60 ? `${s < 10 ? Math.round(s * 10) / 10 : Math.round(s)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} min`;
/** Audio on the stage: a cover (the job's image, else the generated cover shared with the Audio feed), the glow and dancing bean over it
 *  while it plays (its style heard from the sound once the viewer opens; the chip picks another), the waveform (drawn from the file, reacting to
 *  the sound; click, drag or ←/→ to seek) and the Audio card's own player row (play / pause, "0:12 / 0:40"), not the browser's controls (UX audit #16). */
export function ViewerAudio({ src, cover, label, onMeta, seed, prompt, lyrics, kind = 'music', jobId, danceStyle, cues }: { src: string; cover?: string | null; label: string; onMeta?: (durationSec: number) => void; seed?: string; prompt?: string | null; lyrics?: string | null; kind?: AudioKind; jobId?: string | null; danceStyle?: SavedStyle; /** captions shown (shared/Captions): the line being said */ cues?: Cue[] | null }) {
  const box = useRef<HTMLDivElement>(null); const a = useRef<HTMLAudioElement>(null); const [t, setT] = useState(0); const [d, setD] = useState(0); const [bad, setBad] = useState(false); const [playing, setPlaying] = useState(false);
  useEffect(() => { setT(0); setD(0); setBad(false); setPlaying(false); }, [src]);
  useExclusivePlayback(a);
  /* No decode (old browser, odd codec): useWaveform hands back a calm placeholder shape, so the stage never looks broken. */
  const wave = useWaveform(src, { bars: 96 });
  useAudioViz(box, a, playing, { peaks: wave.bars, duration: d, kind });
  const seek = (sec: number) => { const el = a.current; if (!el || !(d > 0)) return; el.currentTime = sec; setT(el.currentTime); };
  const toggle = () => { const el = a.current; if (!el) return; primeAudio(); if (el.paused) el.play().catch(() => setPlaying(false)); else el.pause(); };
  if (bad) return <MissingMedia />;
  /* Pointer / key down anywhere on the stage (the native play button included) is the gesture that lets the shared AudioContext start. */
  return <div ref={box} className={`rvx-media rvx-audio${playing ? ' is-playing' : ''}`} data-testid="rvx-audio" onPointerDownCapture={primeAudio} onKeyDownCapture={primeAudio}>
    <div className="rvx-cover">{cover ? <img src={cover} alt="" aria-hidden /> : <AudioCover seed={seed || src} prompt={prompt} kind={kind} />}<AudioVizLayer kind={kind} playing={playing} prompt={prompt} lyrics={lyrics} jobId={jobId} src={bad ? null : src} saved={danceStyle} listen /></div>
    <Waveform className="rvx-wave" testId="rvx-wave" label={`Seek ${label}`} state={wave.state} bars={wave.bars} time={t} duration={d} onSeek={seek} />
    <div className="rvx-arow" data-testid="rvx-arow">
      <button type="button" className="ac-play ac-play-lg rvx-aplay" data-testid="rvx-aplay" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} {...tip(playing ? 'Pause' : 'Play')}>{playing ? <CardPause s={18} /> : <CardPlay s={18} />}</button>
      <span className="rvx-atime" data-testid="rvx-atime" aria-live="off">{durLabel(false, playing, t, d)}</span>
    </div>
    {cues && <p className="rvx-cc-line" data-testid="rvx-cc-line" aria-live="off">{cueAt(cues, t)?.lines.map((l, i) => <span key={i}>{l}</span>)}</p>}
    <audio ref={a} className="rvx-player" src={src} preload="metadata" aria-label={label} data-testid="rvx-player"
      onLoadedMetadata={e => { const x = e.currentTarget.duration; if (isFinite(x)) { setD(x); onMeta?.(x); } }} onTimeUpdate={e => setT(e.currentTarget.currentTime)} onError={() => setBad(true)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
  </div>;
}
const clock = (s: number) => { const n = Math.max(0, Math.floor(isFinite(s) ? s : 0)); const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), x = String(n % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const SPEEDS = [1, 1.25, 1.5, 2, 0.5];
const vIcon = (d: ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
/** PB-16: video on the stage. Plays and loops with sound (opening the viewer is the click that allows it; if the browser still says no it starts
 *  muted and the Mute button shows it), with our own bar: progress, play/pause, speed, mute + volume, the time (click: elapsed ↔ left) and full screen.
 *  `ar`: width / height when known, so the box scales to fit the stage before the file loads. */
export function ViewerVideo({ src, poster, label, ar, alpha, autoPlay, width, height, onMeta, onError, seam, captions }: { src: string; poster?: string; label: string; ar?: number; alpha?: boolean; autoPlay: boolean; width?: number; height?: number;
  /** shared/Captions: the WebVTT file and whether it shows */ captions?: { vtt: string | null; on: boolean; lang?: string | null } | null;
  onMeta?: (v: HTMLVideoElement) => void; onError?: () => void; /** a continuation (Extend, shared/continuation.ts): where the new part starts, in seconds; a tick on the bar + "New from 0:10" */ seam?: number | null }) {
  const box = useRef<HTMLDivElement>(null); const v = useRef<HTMLVideoElement>(null);
  const failure = useMediaFailure(src);
  const [playing, setPlaying] = useState(false); const [muted, setMuted] = useState(false); const [vol, setVol] = useState(1); const [t, setT] = useState(0); const [d, setD] = useState(0); const [rate, setRate] = useState(1); const [left, setLeft] = useState(false); const [nat, setNat] = useState(0);
  useEffect(() => { const el = v.current; if (!el) return; setT(0); setD(0); setPlaying(false); setNat(0); el.muted = false; el.volume = vol; el.playbackRate = rate;
    setMuted(false); if (!autoPlay) return; let live = true;
    el.play().catch((e: DOMException) => { if (!live || e?.name !== 'NotAllowedError') return; el.muted = true; setMuted(true); el.play().catch(() => 0); });
    return () => { live = false; }; }, [src, failure.attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => { const el = v.current; if (!el) return; if (el.paused) el.play().catch(() => 0); else el.pause(); };
  const mute = () => { const el = v.current; if (!el) return; const m = !el.muted; el.muted = m; if (!m && el.volume === 0) { el.volume = 1; setVol(1); } setMuted(m); };
  const speed = () => { const el = v.current; const n = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length]; if (el) el.playbackRate = n; setRate(n); };
  const full = () => { const el = box.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => 0); else el.requestFullscreen?.().catch(() => 0); };
  const fit = ar ?? nat;
  const ccOn = !!(captions?.vtt && captions.on);
  useEffect(() => { const tt = v.current?.textTracks; const el = v.current?.querySelector('track'); if (!tt) return;
    const lift = () => { for (let i = 0; i < tt.length; i++) for (const c of Array.from(tt[i].cues ?? [])) (c as VTTCue).line = -4; }; /* clear of the player bar */
    const set = () => { for (let i = 0; i < tt.length; i++) tt[i].mode = ccOn ? 'showing' : 'hidden'; lift(); };
    set(); tt.addEventListener?.('addtrack', set); el?.addEventListener('load', lift); return () => { tt.removeEventListener?.('addtrack', set); el?.removeEventListener('load', lift); }; }, [ccOn, captions?.vtt, src, failure.attempt]);
  /* the seam shows once the file's length is known and the new part is at least half a second long */
  const sm = seam && seam > 0 && d >= seam + 0.5 ? seam : 0;
  const jump = () => { const el = v.current; if (!el || !sm) return; el.currentTime = seamJumpTo(sm); setT(el.currentTime); el.play().catch(() => 0); };
  if (failure.reason) return <MediaLoadFailure reason={failure.reason} onRetry={failure.retry} />;
  return <div ref={box} className={`rvx-vid${fit ? ' rvx-fit' : ''}${playing ? ' playing' : ''}`} style={fit ? { ['--ar' as any]: fit } : undefined} data-testid="rvx-vid">
    <video key={`${src}:${failure.attempt}`} ref={v} className={`rvx-video${alpha ? ' alpha-bg' : ''}`} src={src} poster={poster} playsInline loop preload="metadata" aria-label={label} data-testid="rvx-video" width={width} height={height} data-media-keep data-media-error-handled
      onClick={toggle} onPlay={e => { setPlaying(true); setMuted(e.currentTarget.muted); }} onPause={e => { setPlaying(false); setMuted(e.currentTarget.muted); }} onTimeUpdate={e => setT(e.currentTarget.currentTime)} onVolumeChange={e => { setMuted(e.currentTarget.muted); setVol(e.currentTarget.volume); }}
      onLoadedMetadata={e => { failure.clear(); const el = e.currentTarget; if (isFinite(el.duration)) setD(el.duration); if (el.videoWidth && el.videoHeight) setNat(el.videoWidth / el.videoHeight); onMeta?.(el); }} onError={e => { if (failure.onError(e)) onError?.(); }}>
      {captions?.vtt && <track key={captions.vtt} kind="captions" src={captions.vtt} srcLang={captions.lang || 'en'} label="Captions" default={captions.on} />}</video>
    <div className="rvx-vbar" data-testid="rvx-vbar">
      <div className="rvx-seekwrap"><input type="range" className="rvx-seek" min={0} max={d || 0} step="any" value={Math.min(t, d || 0)} aria-label="Seek" aria-valuetext={`${clock(t)} of ${clock(d)}${sm ? `; new part from ${clock(sm)}` : ''}`} style={{ ['--p' as any]: `${d > 0 ? (t / d) * 100 : 0}%` }}
        onChange={e => { const el = v.current; if (el) { el.currentTime = Number(e.target.value); setT(el.currentTime); } }} data-testid="rvx-seek" />
        {sm ? <span className="rvx-seam" style={{ left: `${(sm / d) * 100}%` }} aria-hidden data-testid="rvx-seam" /> : null}</div>
      <div className="rvx-vrow">
        <button type="button" className="rvx-vbtn" aria-label={playing ? 'Pause' : 'Play'} {...tip(playing ? 'Pause' : 'Play')} onClick={toggle} data-testid="rvx-play">{playing ? vIcon(<><path d="M8 5v14" /><path d="M16 5v14" /></>) : vIcon(<path d="M7 4.5v15l12-7.5z" fill="currentColor" />)}</button>
        <button type="button" className="rvx-vbtn rvx-speed" aria-label={`Playback speed ${rate}x`} {...tip('Playback speed')} onClick={speed} data-testid="rvx-speed">{rate}x</button>
        <button type="button" className="rvx-vbtn" aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} {...tip(muted ? 'Unmute' : 'Mute')} onClick={mute} data-testid="rvx-mute">{vIcon(<><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />{muted || vol === 0 ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}</>)}</button>
        <input type="range" className="rvx-vol" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label="Volume" style={{ ['--p' as any]: `${(muted ? 0 : vol) * 100}%` }}
          onChange={e => { const el = v.current; if (!el) return; const x = Number(e.target.value); el.volume = x; el.muted = x === 0; }} data-testid="rvx-volume" />
        <button type="button" className="rvx-vbtn rvx-time" aria-label={left ? 'Time left; show time played' : 'Time played; show time left'} {...tip(left ? 'Show time played' : 'Show time left')} onClick={() => setLeft(x => !x)} data-testid="rvx-time">
          {left ? `-${clock(d - t)}` : clock(t)} / {clock(d)}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="m8 10 4 4 4-4" /></svg></button>
        {sm ? <button type="button" className="rvx-vbtn rvx-seam-btn" aria-label={`Jump to the new part (new from ${clock(sm)})`} {...tip('Jump to the new part')} onClick={jump} data-testid="rvx-seam-jump">
          <span className="rvx-seam-dot" aria-hidden />New from {clock(sm)}{vIcon(<path d="m13 6 6 6-6 6M5 6l6 6-6 6" />)}</button> : null}
        <button type="button" className="rvx-vbtn rvx-vfull" aria-label="Full screen" {...tip('Full screen')} onClick={full} data-testid="rvx-video-full">{vIcon(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />)}</button>
      </div>
    </div>
  </div>;
}
export const MissingMedia = ({ onRetry }: { onRetry?: () => void } = {}) => <div className="rvx-media rvx-fail" role={onRetry ? 'status' : 'img'} aria-label="File missing" data-testid="rvx-missing"><AlertIcon size={28} /><b>This file is no longer on disk.</b><small>It may have been cleaned up. The prompt and settings are still here.</small>{onRetry && <button type="button" className="rvx-second" data-testid="rvx-media-retry" onClick={onRetry}>Reload media</button>}</div>;
function MediaLoadFailure({ reason, onRetry }: { reason: MediaFailure; onRetry: () => void }) {
  if (reason === 'missing') return <MissingMedia onRetry={onRetry} />;
  return <div className="rvx-media rvx-fail" role="status" data-testid="rvx-media-error" data-reason={reason}>
    <AlertIcon size={28} /><b>{reason === 'network' ? 'The media could not be loaded.' : 'This browser could not play this file.'}</b><small>{reason === 'network' ? 'Check your connection and try loading it again.' : 'The file may use an unsupported format or could not be decoded. Try loading it again or download the original.'}</small>
    <button type="button" className="rvx-second" data-testid="rvx-media-retry" onClick={onRetry}>Reload media</button>
  </div>;
}

/* ---- Details cells: where it ran, what it cost (or saved), whose workflow, how long (compact one-liners, never taller than a text row) ---- */
/** The place a job ran: 'local' | 'comfy-cloud' | an API id ('' when unknown). */
export const runOnOfJob = (job: any): string => { const r = String(job?.route ?? ''); return String(job?.runOn ?? '') || (/^local:/.test(r) ? 'local' : /^comfy-(cloud|router):/.test(r) ? 'comfy-cloud' : ''); };
/** Run on: the place icon + label, and "· RTX 4090" for your computer when a graphics card is named (never a computer brand: deviceName). */
export function RunOnCell({ job, label }: { job: any; label: string }) {
  const ro = runOnOfJob(job); const Ic = placeIconFor(ro); const m = ro === 'local' ? deviceName(job?.machine) : '';
  return <span className="rvx-line" data-testid="rvx-run-on"><Ic size={14} className="rvx-line-ic" /><span>{label}{m && <span className="rvx-dim" data-testid="rvx-machine"> · {m}</span>}</span></span>;
}
const WF_BADGE: Record<string, { label: string; Ic: typeof OfficialBadgeIcon; tip: string }> = { official: { label: 'Official', Ic: OfficialBadgeIcon, tip: 'Official Comfy template' }, community: { label: 'Community', Ic: CommunityIcon, tip: 'Community workflow' }, ours: { label: 'Ours', Ic: SparkleIcon, tip: 'Our own workflow (open source)' } };
/** Workflow source badge (Official Comfy template / Community / Ours), shown before the workflow link. */
export function WorkflowBadge({ source }: { source?: string | null }) {
  const b = source ? WF_BADGE[source] : undefined; if (!b) return null;
  return <span className={`rvx-wfb rvx-wfb-${source}`} {...tip(b.tip)} data-testid="rvx-wf-badge"><b.Ic size={12} />{b.label}</span>;
}

/* ---- Details (layout B, 2026-10-22): line-by-line rows (label or main value left, value right), grouped under small muted headings
   (Model, Output, Timing, Source). No divider lines: spacing only. Only rows with a value are shown. ---- */
/** A friendly device name for "Your computer · RTX 4090": the server's short machine name; raw backend ids (mps, cuda, …) and computer brands
 *  (Apple chips: copy wave 1, the app only ever says "your computer") are hidden. */
export const deviceName = (m: unknown): string => { const s = typeof m === 'string' ? m.trim() : ''; return !s || /^(mps|cuda(:\d+)?|cpu|rocm|hip|xpu|metal|directml|vulkan|gpu|none|unknown)$/i.test(s) || /^(apple\b|m\d+\b)/i.test(s) || s.length > 32 ? '' : s; };
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** "16:9" from a size; '' when it isn't a tidy ratio. */
export const ratioOf = (w: number, h: number) => { if (!(w > 0 && h > 0)) return ''; const g = gcd(w, h); const a = w / g, b = h / g; return a <= 32 && b <= 32 ? `${a}:${b}` : ''; };
const NAMED_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21', '5:4', '4:5'];
const ratioNum = (a: string) => { const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(a.trim()); return m && +m[2] > 0 ? +m[1] / +m[2] : 0; };
/** QA #12: the aspect shown next to a size comes from the real pixels. The asked-for label stays when the image matches it (within 3%);
 *  otherwise the nearest named aspect (1280×720 → 16:9), else the exact tidy ratio, else '' (no size: the asked-for label as is). */
export const aspectForSize = (w: number, h: number, asked = ''): string => {
  const a = asked.trim(); if (!(w > 0 && h > 0)) return a; const real = w / h; const near = (x: number) => x > 0 && Math.abs(x - real) / real <= 0.03;
  if (near(ratioNum(a))) return a;
  const named = NAMED_ASPECTS.map(n => [n, Math.abs(ratioNum(n) - real) / real] as const).sort((x, y) => x[1] - y[1])[0];
  return named && named[1] <= 0.03 ? named[0] : ratioOf(w, h) || (/^auto/i.test(a) ? 'Auto' : '');
};
/** QA #12: a model's quality tiers from the registry (GET /api/models?fields=capabilities, once per tool). undefined while loading or unknown. */
const tiersCache = new Map<string, Promise<Map<string, string[] | null>>>();
function useQualityTiers(toolId?: string | null, provider?: string | null): string[] | null | undefined {
  const [v, setV] = useState<string[] | null | undefined>(undefined);
  useEffect(() => { setV(undefined); if (!toolId || !provider) return; let live = true;
    let p = tiersCache.get(toolId);
    if (!p) { p = fetch(`/api/models?toolId=${encodeURIComponent(toolId)}&fields=capabilities`).then(r => (r.ok ? r.json() : null)).then((d: any) => {
      const m = new Map<string, string[] | null>(); for (const g of d?.groups ?? []) for (const x of g?.models ?? []) { const t = x?.capabilities?.qualityTiers; const val = Array.isArray(t) ? t.map(String) : null; m.set(String(x.id), val); if (x.providerId) m.set(String(x.providerId), val); } return m;
    }).catch(() => { tiersCache.delete(toolId); return new Map(); }); tiersCache.set(toolId, p); }
    void p.then(m => { if (live) setV(m.has(provider) ? m.get(provider) : null); }); return () => { live = false; }; }, [toolId, provider]);
  return toolId && provider ? v : null; // nothing to look up: unknown, so the row shows as before
}
/** "Oct 22, 4:48 PM" (the year too when it isn't this year). */
export const shortWhen = (ts: unknown) => { const n = Number(ts); if (!(n > 0)) return ''; const d = new Date(n);
  return d.toLocaleString([], { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}), hour: 'numeric', minute: '2-digit' }); };
/** The model catalogue (bestFor, maker) for this tool. Assets / Community open the viewer without loading /api/tools, so it is loaded once here. */
let toolsLoad: Promise<unknown> | null = null;
function useCatalogue(toolId?: string | null) { const ms = useToolModels(toolId); useEffect(() => { if (toolId && !ms.length && !toolsLoad) toolsLoad = listTools().catch(() => { toolsLoad = null; }); }, [toolId, ms.length]); return ms; }

export interface DetailsInfo {
  kind: 'image' | 'video' | 'audio'; feature?: string; model?: string; maker?: { maker?: string | null; makerName?: string | null } | null;
  /** where it ran in Run-on words ('Local', 'Comfy · Comfy Cloud', 'fal'); '' = unknown */ ranOn: string;
  size?: string; aspect?: string; seed?: string | number | null; durationSec?: number; fps?: number; sampleRate?: number; format?: string;
  preset?: string; quality?: string; madeBy?: string; madeFrom?: ReactNode; workflow?: (WorkflowSource & { recipe?: string | null }) | null;
  /** no real run (sample / demo): no price and no savings */ sample?: boolean;
  /** the server restarted mid-run and collected the result from ComfyUI afterwards (comfy/resume.ts) */ recovered?: boolean;
}
/** The place + price row: "Local · M1 Max" · "Free · saved ~$0.01", or "Comfy" / "fal" · what was charged. Extra rows for actual spend / returned credits. */
function placeRows(job: any, ranOn: string, sample?: boolean): ReactNode[] {
  const ex: ExampleInfo | null = job?.example ?? null;
  if (ex) { const Ic = placeIconFor(ex.runOn === 'local' ? 'local' : 'comfy-cloud'); /* an example: where it really ran and what it cost the app's authors */
    return [<div key="place" className="rvx-row" data-row="place"><span className="rvx-row-l rvx-place" data-testid="rvx-run-on"><Ic size={14} className="rvx-line-ic" /><span className="rvx-place-t">{examplePlace(ex)}</span></span>
      <span className="rvx-row-r" data-testid="rvx-cost-example" {...tip('What this run cost the app’s authors. Examples cost you nothing and never count in Spend.')}>{examplePrice(ex)}<span className="rvx-dim"> · $0 for you</span></span></div>]; }
  const composite = compositeCostText(job);
  if (composite != null) return [<div key="place" className="rvx-row" data-row="place"><span className="rvx-row-l rvx-place" data-testid="rvx-run-on">Workflow steps</span><span className="rvx-row-r" data-testid="rvx-cost-composite">{composite}</span></div>];
  const ro = runOnOfJob(job); const cost = typeof job?.cost === 'number' ? job.cost : null;
  if (ro === 'local' && !(cost && cost > 0)) {
    const dev = deviceName(job?.machine); const saved = Number(job?.savedUsd) > 0 && !job?.isSample && !job?.simulated && !sample ? Number(job.savedUsd) : 0; const vs = String(job?.savedVs?.label ?? '').trim();
    const Ic = placeIconFor('local');
    return [<div key="place" className="rvx-row" data-row="place"><span className="rvx-row-l rvx-place" data-testid="rvx-run-on"><Ic size={14} className="rvx-line-ic" /><span className="rvx-place-t">{LOCAL_LABEL}{dev && <span className="rvx-dim" data-testid="rvx-machine"> · {dev}</span>}</span></span>
      <span className="rvx-row-r" data-testid="rvx-cost-free">Free{saved > 0 && <span className="rvx-saved" data-testid="rvx-saved" {...tip(`The cheapest cloud option for these settings${vs ? ` (${vs})` : ''} was quoted at about ${fmtUsd(saved)} when you pressed Generate.`)}> · saved ~{fmtUsd(saved)}</span>}</span></div>];
  }
  if (!ro && !ranOn) return [];
  const Ic = placeIconFor(ro); const name = placeLabelOf(job) || ranOn.replace(/\s*(\(.*\)|·.*)$/, '').trim() || 'API';
  const own = ownAccountsNow(); const back = heldBack(job);
  const after = own && cost && !sample && !isDemoJob(job) ? jobCostLine(job) : null; const amt = own && cost && !sample && !isDemoJob(job) ? jobCostAmount(job) : null; // after the run: "$0.75 (quoted $0.76)" or "≈ $0.76 (estimate)"
  const price = sample || isDemoJob(job) || cost == null ? null : cost === 0 ? 'Free' : amt ?? priceToken({ own, credits: cost, q: { runOn: ro } });
  /* a sample run: what a real run would cost, never as if it was charged */ const would = !price && job?.isSample && cost && cost > 0 ? `would cost ${priceToken({ own, credits: cost, q: { runOn: ro } })}` : null;
  const actual = typeof job?.actualUsd === 'number' ? job.actualUsd : typeof job?.spend?.actualUsd === 'number' ? job.spend.actualUsd : null;
  const via = ranOn.includes('·') ? ranOn.split('·').slice(1).join('·').trim() : '';
  const out: ReactNode[] = [<div key="place" className="rvx-row" data-row="place"><span className="rvx-row-l rvx-place" data-testid="rvx-run-on" {...tip(via ? `Ran on ${via}` : null)}><Ic size={14} className="rvx-line-ic" /><span className="rvx-place-t">{name}</span></span>
    {would && <span className="rvx-row-r rvx-dim" data-testid="rvx-cost-would">{would}</span>}
    {price && <span className="rvx-row-r" data-testid={cost ? 'rvx-cost-paid' : 'rvx-cost-free'} {...tip(own && cost ? [`Billed to your ${ro === 'comfy-cloud' ? 'Comfy' : name} account${amt && /quoted/.test(amt) ? '' : ' (estimate)'}.`, after?.detail ?? priceDetail(null, { credits: cost, runOn: ro })].filter(Boolean).join(' ') : null)}>{price}</span>}</div>];
  if (actual != null && own && !amt) out.push(<div key="actual" className="rvx-row" data-row="actual"><span className="rvx-row-l rvx-k">Actual</span><span className="rvx-row-r" data-testid="rvx-actual">{fmtUsd(actual)}</span></div>);
  if (back > 0) out.push(<div key="back" className="rvx-row" data-row="returned"><span className="rvx-row-l rvx-k">Returned</span><span className="rvx-row-r" data-testid="rvx-returned">{own ? fmtUsd(back / 100) : ledgerUsd(back)}</span></div>);
  return out;
}
const CopyGlyph = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></svg>;
function SeedValue({ seed }: { seed: string }) {
  const [copied, flash] = useCopied();
  return <span className="rvx-seed"><span className="rvx-mono" data-testid="rvx-seed">{seed}</span><button type="button" className="rvx-seed-copy" aria-label="Copy seed" {...tip(copied ? null : 'Copy seed')} data-testid="rvx-seed-copy"
    onClick={() => navigator.clipboard?.writeText(seed).then(() => flash(), () => 0)}>{copied ? <Copied text="" /> : <CopyGlyph />}</button></span>;
}
const WF_LINK: Record<string, string> = { official: 'Comfy template', community: 'Community workflow', ours: 'Our graph' };
type KV = { k: string; label: string; v: ReactNode; tip?: string };
const kvRow = (r: KV) => <div key={r.k} className="rvx-row" data-row={r.k} {...tip(r.tip)}><span className="rvx-row-l rvx-k">{r.label}</span><span className="rvx-row-r">{r.v}</span></div>;
const group = (id: string, title: string, rows: ReactNode[]) => rows.length ? <div className="rvx-grp" data-testid={`rvx-grp-${id}`} role="group" aria-label={title}><span className="rvx-grp-h" aria-hidden>{title}</span>{rows}</div> : null;
/** DETAILS for a finished result (every medium, every place): Model, Output, Timing and Source rows. */
/** "Cloud/h3-two-person-swap" / "LTX-2.5: Image to Video (also …)" → a short workflow name for the row (up to two lines; the full one is on hover). */
const shortWf = (n: string) => { const s = n.replace(/^cloud\//, '').replace(/\s*\((?:also|[a-z_]+\d?[a-z_0-9]*)\b[^)]*\)\s*$/i, '').trim(); return s.length > 90 ? `${s.slice(0, 89)}…` : s; };
export function ResultDetails({ job, info, extra, onViewWorkflow }: { job: any; info: DetailsInfo; extra?: ReactNode; /** the result menu's View workflow (one dialog) */ onViewWorkflow?: () => void }) {
  const [open, setOpen] = useState(true);
  const models = useCatalogue(job?.toolId);
  const key = String(job?.modelKey ?? ''); const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const cat = (key ? models.find(m => m.key === key) : undefined) ?? models.find(m => !!info.model && [m.displayName, m.name].some(n => n && norm(n) === norm(info.model)));
  const sameModel = !!cat && !!info.model && [cat.displayName, cat.name].some(n => !!n && (norm(info.model).startsWith(norm(n)) || norm(n).startsWith(norm(info.model))));
  const modelName = info.model || (cat ? cat.displayName || cat.name : ''); const bestFor = cat && (sameModel || !info.model) ? String(cat.bestFor ?? '').trim() : '';
  const t = jobTiming(job); const render = durationText(t.renderMs); const queue = durationText(t.queueMs);
  const er = job?.etaRange; const learned = runOnOfJob(job) === 'local' && Number(er?.samples) > 0 && (er?.source === 'learned' || er?.source === 'scaled');
  const renderTip = [t.split ? 'Rendering only; time in the queue isn’t counted' : 'From start to finish', learned ? 'Your computer’s time estimate is learned from runs like this' : ''].filter(Boolean).join('. ');
  const seed = info.seed != null && String(info.seed).trim() !== '' ? String(info.seed) : '';
  const [w, h] = String(info.size ?? '').split('×').map(Number); const aspect0 = String(info.aspect ?? '').trim();
  const aspect = aspectForSize(w, h, aspect0); // QA #12: from the real size, not only the asked-for aspect
  /* QA #12: no Quality row for a model without quality tiers (Nano Banana 2). Image results wait for the registry so the row never flashes. */
  const tiers = useQualityTiers(info.kind === 'image' ? job?.toolId : null, info.kind === 'image' ? job?.provider : null);
  const quality = info.kind === 'image' ? (tiers === undefined || (Array.isArray(tiers) && !tiers.length) ? '' : info.quality) : info.quality;
  const sizeTxt = [info.size, aspect].filter(Boolean).join(' · ');
  const dur = info.durationSec && info.durationSec > 0 ? durText(info.durationSec) : '';
  const seedRow: KV | null = seed ? { k: 'seed', label: 'Seed', v: <SeedValue seed={seed} /> } : null;
  const fmt = [String(info.format ?? '').toUpperCase(), info.sampleRate && info.sampleRate > 0 ? `${(info.sampleRate / 1000).toLocaleString()} kHz` : ''].filter(Boolean).join(' · ');
  const output = (info.kind === 'image' ? [sizeTxt ? { k: 'size', label: 'Size', v: <span data-testid="rvx-size">{sizeTxt}</span> } : null, seedRow]
    : info.kind === 'video' ? [sizeTxt ? { k: 'res', label: 'Resolution', v: <span data-testid="rvx-size">{sizeTxt}</span> } : null, dur ? { k: 'dur', label: 'Duration', v: dur } : null, info.fps && info.fps > 0 ? { k: 'fps', label: 'Frame rate', v: `${Math.round(info.fps * 100) / 100} fps` } : null, seedRow]
    : [dur ? { k: 'dur', label: 'Duration', v: dur } : null, fmt ? { k: 'fmt', label: 'Format', v: fmt } : null, seedRow]).filter(Boolean) as KV[];
  const timing = info.sample ? [] /* a sample never really rendered */ : ([render ? { k: 'render', label: 'Render time', v: <span data-testid="rvx-took">{render}</span>, tip: renderTip } : null,
    queue ? { k: 'queue', label: 'Waited in queue', v: <span data-testid="rvx-queue">{queue}</span> } : null]).filter(Boolean) as KV[];
  /* Source (2026-10-29): which workflow ran (the feature credit, else the server's runSource: jobSource.ts), where it ran in the shared place
     words with how it bills, and the prompts the workflow wrote itself, so a result never hides what really ran. */
  const wf = (job?.runSource?.workflow ?? info.workflow ?? null) as (WorkflowSource & { recipe?: string | null; file?: string | null }) | null; const href = workflowHref(wf ?? null); const created = shortWhen(job?.createdAt);
  const wfLeft = wf ? <span className="rvx-row-l rvx-how-wf"><WorkflowBadge source={wf.source} /><span className="rvx-wf-name" data-testid="rvx-wf-name" {...tip([wf.name, wf.author, wf.licence ? `Licence: ${wf.licence}` : ''].filter(Boolean).join(' · '))}>{shortWf(wf.name)}</span>{wf.recipe && <span className="rvx-dim">+ our recipe</span>}</span> : null;
  const wfRight = onViewWorkflow ? <button type="button" className="link-btn rvx-row-r" data-testid="rvx-view-workflow" onClick={onViewWorkflow}>View workflow</button>
    : href ? <a className="rvx-row-r" href={href} target="_blank" rel="noreferrer noopener" data-testid="wf-credit-link">{WF_LINK[wf!.source] ?? 'Workflow'} ↗</a> : null;
  const pl = job?.example ? null : placeOfAny(job); const appPrompts: string[] = Array.isArray(job?.runSource?.appPrompts) ? job.runSource.appPrompts : [];
  const createdV = created ? <span data-testid="rvx-created" {...tip(whenText(job?.createdAt))}>{created}</span> : null;
  const source: ReactNode[] = [
    wfLeft ? <div key="wf" className="rvx-row" data-row="wf">{wfLeft}{wfRight}</div> : null,
    pl ? kvRow({ k: 'ranon', label: info.sample ? 'Would run on' : 'Ran on', v: <span data-testid="rvx-src-place" {...tip(pl.note)}>{pl.label}<span className="rvx-dim"> · {pl.short}</span></span> }) : null,
    ...appPrompts.map((p, i) => kvRow({ k: `ap${i}`, label: appPrompts.length > 1 ? `Prompt the app wrote (${i + 1})` : 'Prompt the app wrote', v: <span className="rvx-app-prompt" data-testid="rvx-app-prompt" {...tip(p)}>{p.length > 140 ? `${p.slice(0, 139)}…` : p}</span> })),
    ...(Array.isArray(job?.diagnostics) ? job.diagnostics : []).map((d: { node: string; label: string; url: string; note: string }, i: number) => kvRow({ k: `diag${i}`, label: 'Mask diagnostic', v: <a href={d.url} target="_blank" rel="noreferrer noopener" data-testid="rvx-mask-diagnostic" {...tip(d.note)}>{d.label} ↗</a> })),
    createdV ? kvRow({ k: 'created', label: 'Created', v: createdV }) : null,
    ...(([info.preset ? { k: 'preset', label: 'Look', v: info.preset } : null, quality ? { k: 'quality', label: 'Quality', v: quality } : null,
      job?.videoFit?.note ? { k: 'fit', label: 'Fit to model', v: <span data-testid="rvx-fit" {...tip(`Sent ${job.videoFit.sent} (your clip ${job.videoFit.from})${job.videoFit.restore ? job.videoFit.restored ? '; the padding was cropped off the result' : job.videoFit.restored === false ? '; the result kept the model’s own shape' : '' : ''}`)}>{String(job.videoFit.note).replace(/^Adjusted for [^:]+: /, '')}</span> } : null, /* server videoFit.ts: what was done to the clip for this model */
      info.madeBy ? { k: 'by', label: 'Made by', v: info.madeBy } : null, info.madeFrom ? { k: 'from', label: 'Made from', v: info.madeFrom } : null].filter(Boolean) as KV[]).map(kvRow)),
  ].filter(Boolean);
  const modelRows: ReactNode[] = [
    modelName || info.feature ? <div key="model" className="rvx-row" data-row="model"><b className="rvx-row-l rvx-model-name" data-testid="rvx-model" {...tip(bestFor || null)}>{modelName || info.feature}</b>
      {modelName && info.feature && <span className="rvx-row-r rvx-dim" data-testid="rvx-feature">{info.feature}</span>}</div> : null,
    ...placeRows(job, info.ranOn, info.sample),
  ].filter(Boolean);
  return <section className="rvx-sec" aria-label="Details">
    <button type="button" className="rvx-sec-h rvx-sec-btn" aria-expanded={open} aria-label={open ? 'Hide details' : 'Show details'} data-testid="rvx-details-toggle" onClick={() => setOpen(o => !o)}><span className="rvx-lbl"><DetailsGlyph />Details</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg></button>
    {open && <div className="rvx-det" data-testid="rvx-details">
      {group('model', 'Model', modelRows)}
      {group('output', 'Output', output.map(kvRow))}
      {group('timing', 'Timing', timing.map(kvRow))}
      {group('source', 'Source', source)}
      {info.recovered && <p className="rvx-recovered" data-testid="rvx-recovered" {...tip('The app restarted during this run, but your result was saved.')}>Saved after a restart</p>}
    </div>}
    {open && extra}
  </section>;
}

/* ---- Input → Output strip (side panel, Info tab) ---- */
/** One input of a job as the strip shows it: the file, its kind, the caption (a: "Input" / "Input 2"; b: a slot name or a size) and the full label for tooltips. */
export type IoTile = { url: string; kind: 'image' | 'video' | 'audio'; a: string; b: string; label: string; /** Brush Edit's painted area (black/white PNG, white = repaint) */ mask?: string | null; /** input prep: the photo as picked, which the bar fitted / cropped before the run ('Fitted' / 'Cropped') */ badge?: string };
export type IoCompare = { mode: 'none' } | { mode: 'on' | 'off'; toggle: () => void } | { mode: 'blocked'; why: string };
const GONE = 'Input no longer available';
const PlayGlyph = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13l11-6.5z" /></svg>;
const WaveGlyph = () => icon(<path d="M3 12h1.5M6.5 8.5v7M10 5v14M13.5 8v8M17 10v4M20.5 11.5v1" />);
const GoneGlyph = () => icon(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="m3.5 16 5-5 4 4M14 13l2-2 4.5 4.5" /><path d="M3 3l18 18" /></>);
const ioThumb = (t: IoTile) => t.kind === 'image' ? t.url : t.kind === 'video' ? `/api/media/${/^\/(showcase|examples)\//.test(t.url) ? 'poster' : 'thumb'}?url=${encodeURIComponent(t.url)}` : null;
const ioVerb = (t: IoTile) => t.kind === 'image' ? 'view full size' : t.kind === 'video' ? 'play' : 'listen';
function IoThumb({ t, gone, onBad }: { t: IoTile; gone: boolean; onBad: () => void }) {
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  if (gone) return <span className="rvx-io-th rvx-io-gone" aria-hidden><GoneGlyph /></span>;
  const th = failedPoster === t.url ? null : ioThumb(t);
  return <span className="rvx-io-th">{th ? <img src={th} alt="" loading="lazy" draggable={false} onError={() => t.kind === 'video' ? setFailedPoster(t.url) : onBad()} /> : <span className="rvx-io-ph" aria-hidden>{t.kind === 'video' ? <VideoGlyph /> : <WaveGlyph />}</span>}
    {t.mask && <span className="rvx-io-mask" aria-hidden style={{ ['--mask' as any]: `url("${t.mask}")` }} />}
    {t.mask && <em className="rvx-io-badge">Mask</em>}
    {t.badge && <em className="rvx-io-badge rvx-io-prep" data-testid="rvx-io-prep">{t.badge}</em>}
    {t.kind === 'video' && <span className="rvx-io-play" aria-hidden><PlayGlyph /></span>}</span>;
}
const ioCap = (a: string, b: string) => <span className="rvx-io-cap"><b>{a}</b>{b && <small>{b}</small>}</span>;
const IO_GAP = 6, IO_ARROW = 28, IO_MIN = 56;
/**
 * The job's inputs → an arrow (Compare, when the result is the first input changed) → the Output tile (the result on screen now).
 * Always one line: the arrow and Output stay pinned at the end; up to 3 input tiles show (fewer when the panel is narrow; tiles shrink from 72 to 56 px before one drops),
 * the rest sit behind a "+N" tile that opens a grid of every input (←/→/↑/↓, Home/End; Esc or a click outside closes it).
 * A file that fails to load becomes a neutral placeholder ("Input no longer available"), never a broken image.
 */
export function IoStrip({ items, viewing, onView, bad, onBad, cmp, out }: {
  items: IoTile[]; viewing: number | null; onView: (i: number | null) => void; bad: ReadonlySet<number>; onBad: (i: number) => void; cmp: IoCompare;
  out: { thumb: string | null; b: string; on: boolean; onShow: () => void };
}) {
  const box = useRef<HTMLDivElement>(null); const more = useRef<HTMLDetailsElement>(null); const [w, setW] = useState(0); const [open, setOpen] = useState(false); const [said, setSaid] = useState('');
  useLayoutEffect(() => { const el = box.current; if (!el) return; const f = () => setW(el.clientWidth); f(); if (typeof ResizeObserver !== 'function') return; const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect(); }, []);
  /* screen readers hear Compare turn on and off */
  const prevMode = useRef(cmp.mode); useEffect(() => { const p = prevMode.current; prevMode.current = cmp.mode; if (p !== cmp.mode && (cmp.mode === 'on' || cmp.mode === 'off') && (p === 'on' || p === 'off')) setSaid(cmp.mode === 'on' ? 'Compare on' : 'Compare off'); }, [cmp.mode]);
  /* a click outside the "+N" grid closes it */
  useEffect(() => { if (!open) return; const f = (e: PointerEvent) => { const d = more.current; if (d && !d.contains(e.target as Node)) d.open = false; }; document.addEventListener('pointerdown', f, true); return () => document.removeEventListener('pointerdown', f, true); }, [open]);
  const n = items.length; const phone = typeof matchMedia === 'function' && matchMedia('(max-width:700px)').matches; const max = phone ? 64 : 72;
  const fit = (v: number) => { const slots = v + (n > v ? 1 : 0) + 1; return Math.floor((w - IO_ARROW - slots * IO_GAP) / slots); };
  let v = Math.min(n, 3); if (w) while (v > 1 && fit(v) < IO_MIN) v--;
  const size = w ? Math.max(48, Math.min(max, fit(v))) : max;
  const rest = n - v; const hiddenOn = viewing != null && viewing >= v;
  const close = () => { const d = more.current; if (d?.open) { d.open = false; d.querySelector<HTMLElement>('summary')?.focus(); } };
  const tile = (t: IoTile, i: number, inPop = false) => { const gone = bad.has(i); const on = viewing === i; const lbl = `${t.label}: ${gone ? GONE : ioVerb(t)}`;
    return <button key={i} type="button" className={`rvx-in${on ? ' on' : ''}${gone ? ' is-gone' : ''}`} aria-pressed={gone ? undefined : on} aria-disabled={gone || undefined} aria-label={lbl}
      {...tip(gone ? GONE : on ? 'Back to the result' : lbl)} data-testid={inPop ? `rvx-input-all-${i}` : `rvx-input-${i}`}
      onClick={() => { if (gone) return; onView(on ? null : i); if (inPop) close(); }}><IoThumb t={t} gone={gone} onBad={() => onBad(i)} />{ioCap(t.a, t.b)}</button>; };
  const nav = (e: React.KeyboardEvent<HTMLDivElement>) => { const bs = [...e.currentTarget.querySelectorAll<HTMLElement>('.rvx-in')]; const i = bs.indexOf(document.activeElement as HTMLElement); if (i < 0) return;
    const cols = Math.max(1, bs.filter(b => b.offsetTop === bs[0].offsetTop).length);
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowDown' ? i + cols : e.key === 'ArrowUp' ? i - cols : e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : null;
    if (j == null) return; e.preventDefault(); e.stopPropagation(); bs[Math.max(0, Math.min(bs.length - 1, j))].focus(); };
  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => setOpen(e.currentTarget.open);
  /* opened: focus the input on the stage (else the first) and bring the grid into view */
  useEffect(() => { if (!open) return; const pop = more.current?.querySelector<HTMLElement>('.rvx-io-pop'); (pop?.querySelector<HTMLElement>('.rvx-in.on') ?? pop?.querySelector<HTMLElement>('.rvx-in'))?.focus({ preventScroll: true }); pop?.scrollIntoView({ block: 'nearest' }); }, [open]);
  const peek = rest > 0 && !bad.has(v) ? ioThumb(items[v]) : null;
  return <div ref={box} className="rvx-inputs" data-testid="rv-refs" role="group" aria-label="Inputs and output" style={{ ['--t' as any]: `${size}px` }}><span className="rvx-in-h">{n > 1 ? `Inputs · ${n}` : 'Input'}</span>
    <div className="rvx-io" data-testid="rvx-io"><div className="rvx-in-row">{items.slice(0, v).map((t, i) => tile(t, i))}
      {rest > 0 && <details ref={more} className="rvx-io-more" data-testid="rvx-input-more" onToggle={onToggle}>
        <summary className={`rvx-in rvx-plus${hiddenOn || open ? ' on' : ''}`} role="button" aria-expanded={open} aria-label={`Show all ${n} inputs (${rest} more)`} {...tip(`All ${n} inputs`)}>
          <span className="rvx-io-th">{peek && <img src={peek} alt="" loading="lazy" draggable={false} />}<b>+{rest}</b></span>{ioCap('More', '')}</summary>
        {open && <div className="rvx-io-pop" role="group" aria-label={`All ${n} inputs`} onKeyDown={nav} data-testid="rvx-input-grid">{items.map((t, i) => tile(t, i, true))}</div>}
      </details>}</div>
      {cmp.mode === 'none' ? <span className="rvx-io-arrow is-static" aria-hidden><ArrowGlyph /></span>
        : cmp.mode === 'blocked' ? <button type="button" className="rvx-io-arrow is-off" aria-disabled="true" aria-label={`Compare unavailable: ${cmp.why}`} {...tip(`Compare unavailable: ${cmp.why}`)} data-testid="rvx-io-arrow"><ArrowGlyph /></button>
        : /* 2026-10-25: a labelled Compare button with a split-view icon (a bare arrow read as "input → output", nobody found the slider); it pulses the first few times */
          <button type="button" className={`rvx-io-arrow rvx-io-cmp${cmp.mode === 'on' ? ' on' : ''}${cmpHint() ? ' hint' : ''}`} aria-pressed={cmp.mode === 'on'} aria-label="Compare input and output" {...tip(cmp.mode === 'on' ? 'Compare is on: click to turn it off' : 'Compare input and output with a slider')} data-testid="rvx-io-arrow" onClick={() => { cmpSeen(); cmp.toggle(); }}><span className="rvx-io-cmp-i"><CompareIcon size={15} /></span><span className="rvx-io-cmp-l">{cmp.mode === 'on' ? 'Comparing' : 'Compare'}</span></button>}
      <button type="button" className={`rvx-in rvx-out${out.on ? ' on' : ''}`} aria-pressed={out.on} aria-label={`Output${out.b ? ` (${out.b})` : ''}: show the result`} {...tip(`Output${out.b ? ` · ${out.b}` : ''}: show the result`)} data-testid="rvx-output-tile" onClick={out.onShow}>
        <span className="rvx-io-th">{out.thumb ? <img src={out.thumb} alt="" loading="lazy" draggable={false} /> : <span className="rvx-io-ph" aria-hidden><MusicIcon size={20} /></span>}</span>{ioCap('Output', out.b)}</button></div>
    <span className="sr-only" aria-live="polite">{said}</span></div>;
}
