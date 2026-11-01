/**
 * The shared "in progress" screen's pure rules (RunStage.tsx): which steps a run goes through and where it is, the friendly time line,
 * where it runs, what it costs and whether Cancel really works (with the one money sentence that fits). No React, no fetch: tested in
 * server/test/run-stage-logic.test.ts.
 *
 * Steps are built from the server's shared progress (`progressInfo`, server/src/progress.ts) plus the local run's own fields:
 *   local ComfyUI   (Downloading the model) → Loading the model → Rendering (one step per sampler pass: `steps.sampler` of `steps.samplers`)
 *                   → Decoding → Saving. `finishing` is Decoding until the job's stage says it is muxing / downloading / encoding (Saving).
 *   hosted places   Sending to <place> → Generating → Downloading the result (status only; percent when the place reports one).
 */
import { ledgerUsd } from './billing';
import { placeOf as sharedPlaceOf } from '../../../server/src/shared/modelIds';
export type Medium = 'image' | 'video' | 'audio' | '3d';
export type RunStage = 'queued' | 'loading' | 'generating' | 'finishing' | 'done' | 'failed' | 'canceled';
export interface RunStep { key: string; label: string }
export interface RunSteps { steps: RunStep[]; /** index of the current step: -1 still waiting in a queue, steps.length when every step is done */ cur: number; /** 0..1 inside the current step, null when unknown */ fill: number | null; local: boolean }

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const progressOf = (j: any): { stage: RunStage; step?: number; steps?: number; percent?: number; etaSeconds?: number; source?: string; previewUrl?: string; previewAt?: number; queuePosition?: number; queueReason?: string } => {
  const p = j?.progressInfo; const st = String(j?.status ?? '');
  if (st === 'canceled' || j?.state === 'canceled') return { stage: 'canceled' };
  if (p?.stage) return p;
  if (st === 'done') return { stage: 'done' }; if (st === 'failed' || st === 'blocked') return { stage: 'failed' };
  if (st === 'queued') return { stage: 'queued', queuePosition: n(j.queuePos) || undefined };
  const s = String(j?.stage ?? ''); if (/downloading_model|loading_model/.test(s)) return { stage: 'loading' };
  if (/^(downloading|muxing|encoding)$/.test(s)) return { stage: 'finishing' };
  return { stage: 'generating', ...(n(j?.percent ?? j?.progress) > 0 ? { percent: n(j?.percent ?? j?.progress) } : {}) };
};
export const runProgressOf = progressOf;

/** Where it runs: 'local' | 'comfy-cloud' | 'comfy-router' | 'fal' | … ('' when unknown). */
export function runOnOf(j: any): string {
  const r = String(j?.route ?? ''); const ro = String(j?.place?.runOn ?? j?.runOn ?? '');
  if (ro) return ro; if (/^local:/.test(r)) return 'local'; const k = r.split(':')[0]; return k && r.includes(':') ? k : '';
}
export const isLocalRun = (j: any) => runOnOf(j) === 'local' || j?.progressInfo?.source === 'local-comfy' || j?.spend?.billedTo === 'local';

/** What the run makes: the job's own outKind, the tool's medium, else guessed from the tool id. */
export function mediumOf(j: any, toolMedia?: string | null): Medium {
  const k = String(j?.input?.outKind ?? toolMedia ?? '');
  if (k === 'image' || k === 'video' || k === 'audio' || k === '3d') return k;
  const t = String(j?.toolId ?? '');
  if (/audio|soundtrack|voice|music|sfx|tts|cover/.test(t)) return 'audio';
  if (/3d|mesh|trellis/.test(t)) return '3d';
  if (/image|app-|photo|upscale-image|image-upscale/.test(t) && !/video/.test(t)) return 'image';
  return 'video';
}

const PASS2 = ['Rendering · draft pass', 'Rendering · detail pass'];
/** The steps of a run and where it is now. */
export function runStepsOf(j: any, opts: { medium?: Medium; placeLabel?: string } = {}): RunSteps {
  const p = progressOf(j); const medium = opts.medium ?? mediumOf(j); const local = isLocalRun(j);
  const what = medium === 'video' ? 'video' : medium === 'audio' ? 'audio' : medium === '3d' ? 'model' : 'image';
  if (local) {
    const st = String(j?.stageDetail?.stage ?? j?.stage ?? ''); const times = j?.stageTimes ?? {};
    const dl = st === 'downloading_model' || !!times.downloading_model || n(j?.etaBreakdown?.downloadSec) > 0;
    const passes = Math.max(1, Math.min(6, n(j?.steps?.samplers) || 1));
    const steps: RunStep[] = [...(dl ? [{ key: 'download', label: 'Downloading the model' }] : []), { key: 'load', label: 'Loading the model' }];
    for (let i = 1; i <= passes; i++) steps.push({ key: `pass${i}`, label: passes === 1 ? 'Rendering' : passes === 2 ? PASS2[i - 1] : `Rendering · pass ${i} of ${passes}` });
    steps.push({ key: 'decode', label: medium === 'audio' ? 'Decoding the sound' : medium === 'video' ? 'Decoding the frames' : 'Decoding the image' }, { key: 'save', label: `Saving the ${what}` });
    const at = (k: string) => steps.findIndex(s => s.key === k);
    let cur = -1; let fill: number | null = null;
    if (p.stage === 'loading') { cur = dl && st === 'downloading_model' ? at('download') : at('load');
      if (st === 'downloading_model') { const tot = n(j?.stageDetail?.bytesTotal); fill = tot > 0 ? Math.min(1, n(j?.stageDetail?.bytesDone) / tot) : null; } }
    else if (p.stage === 'generating') { const s = Math.max(1, Math.min(passes, n(j?.steps?.sampler) || 1)); cur = at(`pass${s}`);
      const step = p.step ?? n(j?.steps?.value); const max = p.steps ?? n(j?.steps?.max); fill = max > 0 ? Math.max(0, Math.min(1, step / max)) : p.percent ? Math.min(1, p.percent / 100) : null; }
    else if (p.stage === 'finishing') cur = /^(muxing|downloading|encoding)$/.test(String(j?.stage ?? '')) ? at('save') : at('decode');
    else if (p.stage === 'done') cur = steps.length;
    return { steps, cur, fill, local };
  }
  const place = opts.placeLabel || 'the provider';
  const steps: RunStep[] = [{ key: 'send', label: `Sending to ${place}` }, { key: 'make', label: medium === 'video' ? 'Making the video' : medium === 'audio' ? 'Making the audio' : medium === '3d' ? 'Building the model' : 'Making the image' }, { key: 'fetch', label: `Bringing the ${what} back` }];
  const waitingHere = j?.status === 'queued'; // still in this app's queue: nothing sent yet
  const cur = p.stage === 'queued' ? (waitingHere ? -1 : 0) : p.stage === 'loading' ? 0 : p.stage === 'generating' ? 1 : p.stage === 'finishing' ? 2 : p.stage === 'done' ? 3 : -1;
  const fill = p.stage === 'generating' && n(p.percent) > 0 ? Math.min(1, n(p.percent) / 100) : null;
  return { steps, cur, fill, local };
}

/* ------------------------------------------------------------------ time */
/** "Almost done", "About 1 min left", "About 5 min left", "About 1 h 20 min left". '' for no estimate. Never raw seconds. */
export function timeLeftText(sec: number | null | undefined): string {
  const s = Number(sec); if (!(s > 0) || !Number.isFinite(s)) return '';
  if (s < 45) return 'Almost done';
  const m = Math.max(1, Math.round(s / 60)); if (m < 60) return `About ${m} min left`;
  const h = Math.floor(m / 60), r = m % 60; return `About ${h} h${r ? ` ${r} min` : ''} left`;
}
/** "9:26 PM" in the viewer's own clock. */
export const clockText = (ts: number | null | undefined, locale?: string) => (Number(ts) > 0 ? new Date(Number(ts)).toLocaleTimeString(locale ?? [], { hour: 'numeric', minute: '2-digit' }) : '');
/** "12 s", "4 min", "1 h 5 min": a step's or the run's elapsed time, short. */
export function shortDuration(ms: number | null | undefined): string {
  const s = Math.round(Number(ms) / 1000); if (!(s > 0)) return '';
  if (s < 60) return `${s} s`; const m = Math.round(s / 60); if (m < 60) return `${m} min`; return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
export interface RunTime { left: string; started: string; note: string; slow: boolean }
/** The friendly time line: time left (or "first run on this computer: timing it"), when it started, and whether it's running late. */
export function runTimeOf(j: any, now = Date.now(), locale?: string): RunTime {
  const p = progressOf(j); const started = clockText(n(j?.renderStartedAt) || n(j?.startedAt) || n(j?.createdAt), locale);
  if (p.stage === 'queued') return { left: '', started: '', note: '', slow: false };
  const eta = n(p.etaSeconds) || n(j?.eta); const range = j?.etaRange ?? j?.fit?.etaRange;
  const t0 = n(j?.renderStartedAt) || n(j?.startedAt); const elapsed = t0 ? (now - t0) / 1000 : 0;
  const slow = !!range && n(range.high) > 0 && elapsed > n(range.high) * 1.1 && p.stage !== 'finishing';
  if (p.stage === 'finishing') return { left: 'Almost done', started, note: '', slow: false };
  if (eta > 0 && !j?.calibrating) return { left: timeLeftText(eta), started, note: slow ? 'Taking longer than usual' : '', slow };
  if (isLocalRun(j) && (j?.calibrating || range?.calibrating || range?.source === 'first_run' || !range)) return { left: '', started, note: 'First run on this computer: timing it', slow: false };
  return { left: '', started, note: slow ? 'Taking longer than usual' : '', slow };
}
/** "About 5 min left · started 9:26 PM" (the parts that are known). */
export const runTimeLine = (t: RunTime) => [t.left || t.note, t.started ? `started ${t.started}` : ''].filter(Boolean).join(' · ');

/* ------------------------------------------------------------------ place, cost, cancel */
/** A hosted run's place name in the app's one set of words (server/src/shared/modelIds.ts placeOf): the server's own place first, so a run on your
 *  own deployment reads "Your Comfy deployment" (not "Comfy Cloud"); else from its route and run-on. '' when unknown. */
const hostedPlace = (j: any): string => String(j?.place?.label ?? '').split(' · ')[0]
  || sharedPlaceOf({ routeId: j?.route ?? j?.routeId ?? null, runOn: runOnOf(j) || null, comfyVariant: j?.comfyVariant ?? null })?.label || '';
/** "On your computer" for a local run, "On Comfy Cloud", "On Comfy deployment", "On fal"… */
export function placeLine(j: any, where = 'on your computer'): string {
  if (isLocalRun(j)) return where.charAt(0).toUpperCase() + where.slice(1);
  const name = hostedPlace(j).replace(/^Your /, 'your ');
  return name ? `On ${name}` : '';
}
export const placeName = (j: any) => (isLocalRun(j) ? 'your computer' : hostedPlace(j).replace(/^Your /, 'your ') || 'the provider');

export type FailureRule = 'not-charged' | 'may-charge' | 'unknown';
export interface MoneyCtx { /** own-accounts billing (no app balance) */ own: boolean; /** the billing provider's rule for failed / canceled runs */ failureRule?: FailureRule | null; /** "where" for local runs */ where?: string }
export interface RunMoney { price: string; free: boolean; sample: boolean; canCancel: boolean; /** the one sentence about money and stopping */ note: string }
const usd = (v: number) => (v < 0.1 ? `$${v.toFixed(3).replace(/0$/, '')}` : `$${v.toFixed(2)}`);
/** What this run costs and what stopping it does. Cancel only when the server says a cancel will succeed (`cancellable`; older servers: still queued). */
export function runMoneyOf(j: any, ctx: MoneyCtx): RunMoney {
  const local = isLocalRun(j); const where = ctx.where ?? 'on your computer'; const st = String(j?.status ?? '');
  const live = st === 'queued' || st === 'running';
  const canCancel = live && (typeof j?.cancellable === 'boolean' ? j.cancellable : st === 'queued' && !(n(j?.progress) > 0));
  const sample = !!(j?.isSample || j?.demo || j?.spend?.simulated || j?.spend?.demo);
  const credits = n(j?.cost); const est = n(j?.spend?.estUsd) || (credits > 0 ? credits / 100 : 0);
  const free = local || !!j?.free && !(credits > 0) || (!sample && est === 0 && credits === 0 && !!j?.spend);
  const place = placeName(j);
  const price = local ? `Free · ${where}` : sample ? 'Sample · nothing is charged' : j?.free ? 'Free' : !ctx.own && credits > 0 ? `${ledgerUsd(credits)} · ${place}` : est > 0 ? `≈ ${usd(est)} · ${place}` : free ? 'Free' : '';
  let note = '';
  if (local) note = canCancel ? `Runs ${where}, so stopping costs nothing.` : st === 'running' ? 'This step can’t be stopped. It’s free, so nothing is charged.' : '';
  else if (sample) note = canCancel ? 'Stop any time.' : '';
  else if (j?.free) note = canCancel ? 'Cancel and your free generation comes back.' : '';
  else if (canCancel && st === 'running' && ctx.own) {
    // a hosted run already at its provider (fal, Replicate, Comfy Router, Comfy Cloud): cancel asks the provider to stop it; its own rule says what is billed
    note = `Cancel asks ${place} to stop it.${ctx.failureRule === 'not-charged' ? ` ${place} doesn’t charge for runs that don’t finish.` : ctx.failureRule === 'may-charge' ? ` ${place} may still bill the time it ran.` : ''}`;
  } else if (canCancel) {
    // before it is sent, a hosted cancel charges nothing
    note = ctx.own ? `Not sent to ${place} yet: cancel and nothing is charged.` : credits > 0 ? `Cancel and the ${ledgerUsd(credits)} goes back to your balance.` : 'Cancel and nothing is charged.';
  } else if (live) {
    const ifFails = ctx.own ? (ctx.failureRule === 'not-charged' ? ` If it fails, ${place} doesn’t charge.` : ctx.failureRule === 'may-charge' ? ` If it fails, ${place} may still charge.` : '') : credits > 0 ? ' If it fails, it goes back to your balance.' : '';
    note = st === 'running' ? `Already with ${place}, so it can’t be stopped now.${ifFails}` : ifFails.trim();
  }
  return { price, free, sample, canCancel, note };
}

/* ------------------------------------------------------------------ settings + aspect */
/** The settings chips: size, length, seed, aspect (what was asked for). */
export function settingChips(j: any): string[] {
  const i = j?.input ?? {}; const out: string[] = [];
  const w = n(i.width), h = n(i.height);
  if (i.resolution) out.push(String(i.resolution)); else if (w > 0 && h > 0) out.push(`${w}×${h}`);
  const ar = i.aspect ?? j?.aspectLabel; if (ar) out.push(String(ar));
  const d = n(i.duration ?? i.durationSec); if (d > 0 && mediumOf(j) !== 'image') out.push(`${d} s`);
  if (n(i.fps) > 0 && mediumOf(j) === 'video') out.push(`${n(i.fps)} fps`);
  const cnt = n(i.n ?? i.count); if (cnt > 1) out.push(`${cnt} images`);
  const seed = i.seed ?? j?.seed; if (seed != null && seed !== '') out.push(`Seed ${seed}`);
  return out;
}
/** Width / height of the result to keep the preview's shape: the asked size, else the aspect ("16:9"), else the medium's usual. */
export function aspectOf(j: any, medium: Medium): number {
  const i = j?.input ?? {}; const w = n(i.width), h = n(i.height); if (w > 0 && h > 0) return w / h;
  const m = /^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/.exec(String(i.aspect ?? j?.aspectLabel ?? '')); if (m && n(m[2]) > 0) return n(m[1]) / n(m[2]);
  return medium === 'video' ? 16 / 9 : 1;
}
/** Render's own inputs (the Mockup clip and the first frame), shown before the usual photo / clip inputs. */
export function makeRealInputs(j: any): { url: string; kind: 'image' | 'video'; label: string }[] {
  const m = j?.input?.makeReal; if (!m) return []; const out: { url: string; kind: 'image' | 'video'; label: string }[] = [];
  const isFile = (u: unknown): u is string => typeof u === 'string' && /^\/(files|samples)\//.test(u);
  if (isFile(m.planUrl)) out.push({ url: m.planUrl, kind: /\.(mp4|webm|mov)($|\?)/i.test(m.planUrl) ? 'video' : 'image', label: 'Mockup' });
  if (isFile(m.firstFrameUrl)) out.push({ url: m.firstFrameUrl, kind: 'image', label: 'First frame' });
  return out;
}
