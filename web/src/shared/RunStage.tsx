import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { JobState } from '../api';
import { cancelJob } from '../api';
import { useToast } from './Toast';
import { cancelQueued } from './QueueCancel';
import { dropFromActivity, previewBlur, progressLabel, startsText } from './queueActivity';
import { useBilling, ownAccountsNow } from './billing';
import { deviceWhere } from './eta';
import { jobInputs } from './jobInputs';
import { modelOfEngine } from './models';
import { MakerTile } from './MakerTile';
import { presentationOf, resultItems, badgeText } from './multiResultRules';
import { dancerSvg, dancerNodes, applyPose, type DancerNodes } from './beanDancer';
import { REST, blendPose, pose, ease, type Pose, type Face } from './danceLogic';
import { typedPromptOf } from '../../../server/src/shared/typedPrompt';
import { runStepsOf, runProgressOf, runTimeOf, runTimeLine, runMoneyOf, placeLine, settingChips, aspectOf, makeRealInputs, mediumOf, shortDuration, isLocalRun, type Medium, type RunSteps as Steps } from './runStageLogic';
import './runStage.css';

/**
 * The ONE "in progress" screen, shared by every tab and tool (Image, Video, Audio, 3D, Render, workflows): the result viewer's running /
 * queued state (platform/JobPage.tsx) and the inline progress on tool pages (shared/JobProgress.tsx) use these pieces.
 *   RunStage    the centered stage: live preview (or a soft placeholder in the result's shape), SyteSim keeping you company, the step tracker,
 *               the friendly time line, honest cost + Cancel, and the inputs as a compact strip.
 *   RunPanel    the viewer's right panel while it runs: model + maker, where it runs, cost, settings, inputs.
 *   RunSteps / RunTimeLine / RunMoneyRow   the pieces, for compact places.
 * Rules (steps, time words, cost and cancel sentences) live in runStageLogic.ts.
 */

const useNow = (ms: number, on = true) => { const [now, setNow] = useState(() => Date.now()); useEffect(() => { if (!on) return; const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms, on]); return now; };
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const where = () => deviceWhere();

/** When each step was first seen (client clock), kept per job in sessionStorage so a reload mid-run keeps the per-step times it already knew. */
function useStepStarts(id: string, s: Steps, t0: number): Record<number, number> {
  const key = `ohf:runsteps:${id}:${s.steps.map(x => x.key).join(',')}`;
  const [m, setM] = useState<Record<number, number>>(() => { try { return JSON.parse(sessionStorage.getItem(key) || '{}'); } catch { return {}; } });
  useEffect(() => {
    if (s.cur < 0 || s.cur >= s.steps.length || m[s.cur]) return;
    const next = { ...m, [s.cur]: s.cur === 0 && t0 ? t0 : Date.now() }; setM(next); try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
  }, [s.cur, key]);
  return m;
}

const Check = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

/** The step tracker: done ✓, the current one pulsing (with its own fill when known), upcoming dimmed; per-step time. */
export function RunSteps({ job, medium, compact = false }: { job: JobState; medium?: Medium; compact?: boolean }) {
  const j: any = job; const md = medium ?? mediumOf(j); const pl = placeLine(j).replace(/^On /, '');
  const s = runStepsOf(j, { medium: md, placeLabel: pl });
  const live = j.status === 'running'; const now = useNow(1000, live);
  const starts = useStepStarts(job.id, s, Number(j.renderStartedAt) || Number(j.startedAt) || 0);
  return <ol className={`rs-steps${compact ? ' rs-steps-compact' : ''}`} data-testid="rs-steps" aria-label="Steps">
    {s.steps.map((st, i) => {
      const state = i < s.cur ? 'done' : i === s.cur ? 'cur' : 'next';
      const a = starts[i]; const b = starts[i + 1];
      const t = state === 'done' && a && b ? shortDuration(b - a) : state === 'cur' && a ? shortDuration(now - a) : '';
      return <li key={st.key} className={`rs-step rs-${state}`} data-testid={`rs-step-${st.key}`} data-state={state} aria-current={state === 'cur' ? 'step' : undefined}>
        <span className="rs-dot" aria-hidden>{state === 'done' ? <Check /> : null}</span>
        <span className="rs-step-txt"><span className="rs-step-l">{st.label}</span>
          {state === 'cur' && s.fill != null && <span className="rs-step-bar" aria-hidden><i style={{ width: `${Math.max(4, s.fill * 100)}%` }} /></span>}</span>
        {t && <span className="rs-step-t">{t}</span>}
        <span className="sr-only">{state === 'done' ? ' (done)' : state === 'cur' ? ' (now)' : ''}</span>
      </li>; })}
  </ol>;
}

/** "About 5 min left · started 9:26 PM", or "First run on this computer: timing it". */
export function RunTimeLine({ job, className = '' }: { job: JobState; className?: string }) {
  const live = job.status === 'running'; const now = useNow(5000, live);
  const t = runTimeOf(job, now); const line = runTimeLine(t);
  return line ? <p className={`rs-time ${className}`} data-testid="rs-time">{line}</p> : null;
}

/** Cost chip + the one money sentence + Cancel (only when it truly works). Multi-group runs keep "Cancel remaining groups". */
export function RunMoneyRow({ job, onUpdate }: { job: JobState; onUpdate?: () => void }) {
  const j: any = job; const toast = useToast(); const billing = useBilling(); const own = billing ? billing.mode !== 'team' : ownAccountsNow();
  const rule = billing?.providers?.find(p => p.id === j.spend?.billedTo)?.failureRule ?? null;
  const m = runMoneyOf(j, { own, failureRule: rule, where: where() });
  const [busy, setBusy] = useState(false);
  const groups = j.status === 'running' && (j.input?.refBatches?.length ?? 0) > 1;
  const cancel = async () => { setBusy(true); dropFromActivity(job.id); await cancelQueued(job, toast); setBusy(false); onUpdate?.(); };
  const cancelRest = async () => { try { await cancelJob(job.id); toast(`Stopping after the current group. Finished groups are kept${(Number(j.cost) || 0) > 0 && !own ? '; what the rest held goes back to your balance' : ''}.`); } catch (e: any) { toast(e.message, 'error'); } onUpdate?.(); };
  return <div className="rs-money" data-testid="rs-money">
    <div className="rs-money-top">
      {m.price && <span className={`rs-price${m.free ? ' free' : ''}${m.sample ? ' sample' : ''}`} data-testid="rs-price">{m.price}</span>}
      {groups ? <button type="button" className="rs-cancel" disabled={!!j.cancelRemaining} onClick={cancelRest} data-testid="rs-cancel-rest">{j.cancelRemaining ? 'Stopping after this group…' : 'Cancel remaining groups'}</button>
        : m.canCancel && <button type="button" className="rs-cancel" disabled={busy} onClick={cancel} data-testid="rs-cancel">{busy ? 'Canceling…' : job.status === 'queued' ? 'Cancel' : 'Stop'}</button>}
    </div>
    {m.note && <p className="rs-money-note" data-testid="rs-money-note">{m.note}</p>}
  </div>;
}

/* ------------------------------------------------------------------ SyteSim */
/** A calm loop: breathe and look around, tap a foot, a slow stretch. A tiny happy hop when `done`. Still when reduced motion is on. */
const CYCLE = 9; // seconds
function idlePose(t: number): { p: Pose; face: Face } {
  const c = t % CYCLE; const br = Math.sin(t * 2.2) * 0.012;
  const base = pose({ squash: 1 + br, head: Math.sin(t * 0.7) * 6, torso: Math.sin(t * 0.7 + 1) * 1.5 });
  if (c < 3.5) return { p: base, face: 'smile' };
  if (c < 6.5) { const k = Math.max(0, Math.sin((c - 3.5) * Math.PI * 3)); const w = Math.min(1, (c - 3.5) * 4, (6.5 - c) * 4); // tap, tap, tap
    return { p: { ...base, rHip: 4 + 9 * k * w, rKnee: -4 - 16 * k * w, nod: k * w * 0.8, head: base.head * 0.4 }, face: 'smile' }; }
  const s = ease(Math.min(1, (c - 6.5) / 1.1)) * ease(Math.min(1, (CYCLE - c) / 1.1)); // stretch up and back
  return { p: blendPose(base, pose({ lSh: 160, lEl: 25, rSh: 160, rEl: 25, y: -1.5, squash: 1.05, head: 0 }), s), face: s > 0.5 ? 'dreamy' : 'smile' };
}
function hopPose(t: number): { p: Pose; face: Face } { // 0..1 over ~0.7 s
  const u = Math.min(1, t); const up = Math.sin(u * Math.PI); const crouch = u < 0.15 ? Math.sin((u / 0.15) * Math.PI) : 0;
  return { p: pose({ y: -14 * up, squash: 1 - crouch * 0.12 + up * 0.04, lSh: 40 + 110 * up, rSh: 40 + 110 * up, lKnee: -4 - 20 * up, rKnee: -4 - 20 * up }), face: 'happy' };
}
export function RunBean({ state }: { state: 'waiting' | 'working' | 'done' }) {
  const uid = `rsb${useId().replace(/[^\w-]/g, '')}`; const html = useMemo(() => dancerSvg(uid), [uid]); const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current; if (!el) return; const d: DancerNodes = dancerNodes(el);
    if (reducedMotion()) { applyPose(d, REST, state === 'done' ? 'happy' : state === 'waiting' ? 'sleepy' : 'smile'); return; }
    let raf = 0; let last = 0; const t0 = performance.now();
    const tick = (ts: number) => { raf = requestAnimationFrame(tick); if (ts - last < 33) return; last = ts; const t = (ts - t0) / 1000; // ~30 fps is plenty for a calm loop
      const f = state === 'done' ? hopPose(t / 0.7) : state === 'waiting' ? { p: pose({ squash: 1 + Math.sin(t * 1.4) * 0.015, head: Math.sin(t * 0.5) * 4 }), face: 'sleepy' as Face } : idlePose(t);
      applyPose(d, f.p, f.face); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [state]);
  return <div ref={host} className="rs-bean" data-state={state} data-face="smile" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ------------------------------------------------------------------ preview */
/** Keeps the last few live frames the server sent (it keeps only the newest), as blob URLs so older ones stay viewable. */
function useFrames(url: string | null | undefined, max = 8): string[] {
  const [frames, setFrames] = useState<string[]>([]); const all = useRef<string[]>([]);
  useEffect(() => { if (!url) return; let live = true;
    fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.blob() : null)).then(b => { if (!live || !b || !b.type.startsWith('image/')) return; const u = URL.createObjectURL(b);
      const next = [...all.current, u]; while (next.length > max) URL.revokeObjectURL(next.shift()!); all.current = next; setFrames(next); }).catch(() => undefined);
    return () => { live = false; }; }, [url]);
  useEffect(() => () => { all.current.forEach(u => URL.revokeObjectURL(u)); }, []);
  return frames;
}
function FramePlayer({ frames, video, blur }: { frames: string[]; video: boolean; blur: number }) {
  const [i, setI] = useState(0); const n = frames.length;
  useEffect(() => { if (!video || n < 2 || reducedMotion()) { setI(n - 1); return; } const t = setInterval(() => setI(k => (k + 1) % n), 220); return () => clearInterval(t); }, [n, video]);
  const src = frames[Math.max(0, Math.min(n - 1, i))];
  return <img className="rs-frame-img" src={src} alt="" style={{ ['--rs-blur' as any]: `${blur}px` }} data-testid="rs-preview" />;
}
function Waveform({ fill }: { fill: number | null }) {
  const bars = useMemo(() => Array.from({ length: 48 }, (_, k) => 0.25 + 0.75 * Math.abs(Math.sin(k * 1.7) * Math.cos(k * 0.45))), []);
  const lit = fill == null ? -1 : Math.round(fill * bars.length);
  return <div className={`rs-wave${!fill ? ' ind' : ''}`} data-testid="rs-wave" aria-hidden>{bars.map((h, k) => <i key={k} className={k < lit ? 'on' : ''} style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${(k % 12) * 90}ms` }} />)}</div>;
}

/** The stage's picture area: live frames (local ComfyUI), a building waveform (audio), or a soft placeholder in the result's shape. */
function RunFrame({ job, medium, steps, latest }: { job: JobState; medium: Medium; steps: Steps; /** the newest finished result of a multi-output run */ latest?: string | null }) {
  const j: any = job; const p = runProgressOf(j); const frames = useFrames(p.stage !== 'queued' ? p.previewUrl : null);
  const ar = aspectOf(j, medium); const overall = steps.cur < 0 ? null : (steps.cur + (steps.fill ?? 0)) / steps.steps.length;
  const pct = typeof j.percent === 'number' && j.percent > 0 && p.stage !== 'queued' ? Math.round(j.percent) : null;
  return <div className={`rs-frame rs-frame-${medium}${frames.length ? ' has-prev' : ''}`} style={{ ['--rs-ar' as any]: medium === 'audio' ? 'auto' : String(ar) }} data-testid="rs-frame">
    {medium === 'audio' ? <Waveform fill={overall} />
      : frames.length ? <FramePlayer frames={frames} video={medium === 'video'} blur={medium === 'image' ? previewBlur(p as any) : 0} />
      : latest ? <img className="rs-frame-img" src={latest} alt="" data-testid="rs-latest" />
      : <span className="rs-placeholder" aria-hidden><span className="rs-glow" /><span className="rs-sheen" /></span>}
    {frames.length > 0 && <span className="rs-live" data-testid="rs-live">Live preview</span>}
    {pct != null && <span className="rs-pct" data-testid="rs-pct">{pct}%</span>}
  </div>;
}

/* ------------------------------------------------------------------ inputs */
export type RunInput = { url: string; kind: 'image' | 'video' | 'audio'; label: string };
export function runInputsOf(job: JobState): RunInput[] {
  const mr = makeRealInputs(job); const seen = new Set(mr.map(x => x.url));
  return [...mr, ...jobInputs(job).filter(x => !seen.has(x.url)).map(x => ({ url: x.url, kind: x.kind, label: x.slot }))];
}
const thumbOf = (x: RunInput) => (x.kind === 'video' ? `/api/media/thumb?url=${encodeURIComponent(x.url)}` : x.url);
export function RunInputs({ items, big = false }: { items: RunInput[]; big?: boolean }) {
  if (!items.length) return null;
  return <ul className={`rs-inputs${big ? ' big' : ''}`} data-testid="rs-inputs">{items.map(x => <li key={x.url + x.label} title={x.label}>
    {x.kind === 'audio' ? <span className="rs-in-audio" aria-hidden>♪</span> : <img src={thumbOf(x)} alt="" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />}
    {x.kind === 'video' && <span className="rs-in-play" aria-hidden>▶</span>}<small>{x.label}</small></li>)}</ul>;
}

/** Model name + maker mark. */
export function RunModel({ job, medium }: { job: JobState; medium: Medium }) {
  const j: any = job; const name: string = j.modelName ?? j.model ?? ''; if (!name) return null;
  const mk = modelOfEngine(job.toolId, j.provider, j.modelKey);
  return <span className="rs-model" data-testid="rs-model"><MakerTile maker={mk?.maker} makerName={mk?.makerName} fallback={name} medium={medium} className="rs-maker" title={false} /><span>{name}</span></span>;
}

/* ------------------------------------------------------------------ the stage */
export function RunStage({ job, toolName, medium: md, onUpdate, finished = false }: { job: JobState; toolName?: string; medium?: Medium; onUpdate?: () => void; /** the run just finished: SyteSim hops, then the result appears */ finished?: boolean }) {
  const j: any = job; const medium = md ?? mediumOf(j); const p = runProgressOf(j); const queued = p.stage === 'queued' && j.status === 'queued';
  const pl = placeLine(j).replace(/^On /, ''); const steps = runStepsOf(j, { medium, placeLabel: pl });
  const head = finished ? 'Ready' : queued ? `Waiting${p.queuePosition ? ` · #${p.queuePosition} in line` : ''}`
    : p.stage === 'queued' ? `Waiting at ${pl || 'the provider'}${p.queuePosition ? ` · #${p.queuePosition}` : ''}` : progressLabel(p as any);
  const why = queued ? (p.queueReason ?? j.queueReason ?? (p.queuePosition ? startsText(p.queuePosition) : '')) : '';
  const items = resultItems(j); const pres = presentationOf(j); const multi = items.length > 1;
  const inputs = runInputsOf(job); const chips = settingChips(j);
  return <div className={`rs rs-${medium}${finished ? ' rs-finished' : ''}`} data-testid="run-stage" data-stage={finished ? 'done' : p.stage} aria-live="polite">
    <div className="rs-main">
      <div className="rs-pic">
        <RunFrame job={job} medium={medium} steps={steps} latest={[...items].reverse().find(x => x.state === 'done' && x.url && x.kind === 'image')?.url ?? null} />
        {multi && <div className="rs-multi" data-testid="rs-multi"><span className="rs-multi-n">{badgeText(items, pres)}</span>
          <ul>{items.map((it, k) => <li key={k} className={it.state}>{it.url ? <img src={it.kind === 'video' ? `/api/media/thumb?url=${encodeURIComponent(it.url)}` : it.url} alt={it.label || `Result ${k + 1}`} /> : <span className="rs-multi-wait" aria-hidden />}{it.label && <small>{it.label}</small>}</li>)}</ul></div>}
      </div>
      <aside className="rs-side">
        <div className="rs-who">
          <RunBean state={finished ? 'done' : queued ? 'waiting' : 'working'} />
          <div className="rs-who-txt">
            {toolName && <span className="rs-eyebrow">{toolName}</span>}
            <b className="rs-head" data-testid="rs-head">{head}</b>
            {why && <span className="rs-why" data-testid="rs-why">{why}</span>}
            {!queued && !finished && <RunTimeLine job={job} />}
          </div>
        </div>
        <RunSteps job={job} medium={medium} />
        {!finished && <RunMoneyRow job={job} onUpdate={onUpdate} />}
        {!finished && <p className="rs-leave" data-testid="rs-leave">You can leave this page. You’ll get a note when it’s ready.</p>}
      </aside>
    </div>
    <div className="rs-strip" data-testid="rs-strip">
      <RunInputs items={inputs} />
      <div className="rs-chips"><RunModel job={job} medium={medium} />{pl && <span className="rs-chip" data-testid="rs-place">{placeLine(j, where())}</span>}{chips.map(c => <span key={c} className="rs-chip">{c}</span>)}</div>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ the panel */
const Row = ({ k, children }: { k: string; children: ReactNode }) => <div className="rs-row"><dt>{k}</dt><dd>{children}</dd></div>;
/** The viewer's right panel while a job runs or waits: the prompt is shown by the caller (ViewerPrompt); this adds the run's facts. */
export function RunPanel({ job, toolName }: { job: JobState; toolName?: string }) {
  const j: any = job; const medium = mediumOf(j); const billing = useBilling(); const own = billing ? billing.mode !== 'team' : ownAccountsNow();
  const m = runMoneyOf(j, { own, failureRule: billing?.providers?.find(x => x.id === j.spend?.billedTo)?.failureRule ?? null, where: where() });
  const chips = settingChips(j); const inputs = runInputsOf(job); const machine = isLocalRun(j) && typeof j.machine === 'string' && j.machine ? /^(mps|metal|cuda(:\d+)?|cpu)$/i.test(j.machine) || /^(apple\s*)?m\d/i.test(j.machine) ? 'Your computer’s graphics' : j.machine : '';
  return <section className="rs-panel" aria-label="This run" data-testid="rs-panel">
    <dl className="rs-rows">
      {toolName && <Row k="Tool">{toolName}</Row>}
      {(j.modelName ?? j.model) && <Row k="Model"><RunModel job={job} medium={medium} /></Row>}
      <Row k="Runs">{placeLine(j, where())}{machine && <span className="rs-dim"> · {machine}</span>}</Row>
      {m.price && <Row k="Cost">{m.price}</Row>}
      {chips.length > 0 && <Row k="Settings"><span className="rs-chips">{chips.map(c => <span key={c} className="rs-chip">{c}</span>)}</span></Row>}
    </dl>
    {inputs.length > 0 && <div className="rs-panel-in"><span className="rs-lbl">Inputs</span><RunInputs items={inputs} big /></div>}
  </section>;
}
export const runPromptOf = (job: JobState) => { const inp: any = job.input ?? {}; const typed = typedPromptOf(inp).trim(); const full = String(inp.finalPrompt ?? inp.prompt ?? '').trim(); return { typed: typed || full, full: full && full !== typed ? full : null }; };
