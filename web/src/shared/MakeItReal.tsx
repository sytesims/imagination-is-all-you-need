/**
 * Render (Direct a Shot step 3; tool id make-it-real, 2026-10-24), shared by the 3D feed card, the player's step bar and the result viewer.
 *  - MakeItRealSheet: the small sheet (the shared BarPopover look) over a Direct a Shot mockup. It reads GET /api/make-it-real/prep (the plan,
 *    the starting prompt, the lengths and sizes this recording allows, the six model files and whether each is ready / still downloading /
 *    missing, the fit for this computer and an honest time range). Nothing runs until Render real video, which submits tool make-it-real on the local
 *    route (free). Rules and sizes: server/src/shared/makeItReal.ts.
 *  - PlanVsReal (Mockup vs Render): the mockup and the render side by side, played in sync (one play / pause and one timeline drive both); "Render only" shows the
 *    result alone with its sound.
 */
import { IMAGE_ACCEPT } from '../../../server/src/shared/mediaAccept';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createJob, getJob } from '../api';
import { BarPopover, PopSection, PopNote, Segmented } from './BarPop';
import { tip } from './Tooltip';
import { useToast } from './Toast';
import { SparkleIcon, UploadIcon, CloseIcon, DownloadIcon } from '../ui/Icons';
import { MAKE_REAL_TOOL, MAKE_REAL_PROVIDER, PROMPT_AVOID, makeRealEtaSeconds, makeRealCloudEtaSeconds, minutesText, firstFramePrompt, stripAvoidWords, FIRST_FRAME_PAINTERS, firstFramePainter, type FirstFramePainter } from '../../../server/src/shared/makeItReal';
import { RENDER_MODELS, renderModelOf, renderBillSeconds, renderEtaText, RENDER_STYLE_LABEL, type RenderStyle } from '../../../server/src/shared/renderModels';
import { ModelMenu, type MenuItem } from './ModelMenu';
import { useToolQuote } from './useToolQuote';
import { GenPrice } from './GenPrice';
/** The free local first-frame painter (shared/makeItReal.ts FIRST_FRAME_PAINTERS): FLUX 3 Klein when the server says it can run here (prep.painter)
 *  or with a "Who is it?" picture (its multi-reference edit: the frame plus the person); else FLUX.2 [klein] 4B. */
const painterOf = (prep: MakeRealPrep | null, who: boolean): FirstFramePainter => (who ? firstFramePainter({ who }) : prep?.painter ?? FIRST_FRAME_PAINTERS['comfy-klein4b']);
type First = { kind: 'file'; file: File; url: string; name: string } | { kind: 'job'; jobId: string; url: string; name: string; sample: boolean };
import './makeItReal.css';
/** A prompt waiting for the next Render sheet (an example's Try this: ThreeDStudio ?realPrompt=). Read once, then cleared. */
export const MIR_PROMPT_KEY = 'ohf:mir:prompt';
const takeWaitingPrompt = () => { try { const v = sessionStorage.getItem(MIR_PROMPT_KEY); if (v) sessionStorage.removeItem(MIR_PROMPT_KEY); return v; } catch { return null; } };
type FileRow = { file: string; role: string; folder: string; bytes: number; haveBytes: number | null; state: 'ready' | 'downloading' | 'missing' | 'unknown' };
export interface MakeRealPrep {
  planJob: { id: string; videoUrl: string; label: string; presetName: string | null; imported: boolean };
  recording: { width: number; height: number; seconds: number };
  plan: { width: number; height: number; stage1: { width: number; height: number }; frames: number; seconds: number; fps: number; aspect: string; size: string };
  prompt: string; /** the mockup has a person you played */ person?: boolean; lengths: { frames: number; seconds: number }[]; sizes: { id: string; label: string; note: string; width: number; height: number }[];
  files: FileRow[]; ready: boolean; modelsDirSet: boolean; missingBytes: number | null;
  fit: { verdict: string; reasonCode: string; reason: string; recommendedVramGB: number | null }; eta: { low: number; high: number; text: string; source: string };
  backend: string; route: string; /** the first-frame painter with no "Who is it?" picture (FLUX 3 Klein when it can run here) */ painter?: FirstFramePainter;
  /** the Render picker (server shared/renderModels.ts): per model, why it can't run yet, the whole-second lengths and the recording it sends */
  outputs?: { label: string | null; url: string }[];
  models?: { id: string; needs: string | null; lengths: number[]; defaultLength: number | null; clip: { url: string; label: string | null; style: RenderStyle | null; matched: boolean; note: string | null } | null }[];
  /** LTX's Comfy Cloud place (server comfy/ltx25LayoutCloud.ts): whole seconds, Draft / Sharper / 720p, and the LoRA the user imports */
  cloud?: { route: string; lengths: number[]; defaultLength: number | null; defaultSize: string; sizes: { id: string; label: string; note: string; tier: string; width: number; height: number }[];
    eta: { low: number; high: number } | null; lora: { file: string; importAs: string; url: string; repo: string; steps: string[] } };
}
/** GET /api/comfy-cloud/ltx25-layout/check: is the Layout to Render LoRA in the user's Comfy Cloud library (free, GET only on Comfy Cloud)? */
type LoraCheck = { state: 'present' | 'missing' | 'unknown' | 'no-key' | 'checking'; loaderPath?: string | null };
/** The picker rows: every Render model, greyed with why when it can't run on this mockup or this server. */
export const renderMenuItems = (prep: MakeRealPrep | null): MenuItem[] => RENDER_MODELS.map((m) => { const mp = prep?.models?.find((x) => x.id === m.id);
  const off = mp?.needs ?? (m.route === 'router' && mp && !mp.lengths.length ? `Needs a mockup of at least ${m.clip.minSec} s` : null);
  return { id: m.id, name: m.name, tag: m.blurb, off, last: !!off }; });
const gb = (b: number) => `${(b / 1e9).toFixed(b >= 10e9 ? 0 : 1)} GB`;
const fileLine = (f: FileRow) => f.state === 'ready' ? 'Ready' : f.state === 'downloading' ? `Downloading · ${gb(f.haveBytes ?? 0)} of ${gb(f.bytes)}` : f.state === 'missing' ? `Missing · ${gb(f.bytes)}` : `${gb(f.bytes)} · not checked`;
/* ---- the Render pipeline (2026-10-26): ONE click. For LTX with no first frame it first paints one (free, local), then submits the Render.
 * It lives outside the sheet, so closing the sheet never stops it; the sheet shows its progress while open, a toast says when it moves on. ---- */
export type RenderPipe = { planJobId: string; stage: 'painting' | 'submitting'; pct: number; model: string; /** the first-frame painter's model name */ painter?: string };
const pipes = new Map<string, RenderPipe>(); const pipeBus = new Set<() => void>();
const setPipe = (id: string, p: RenderPipe | null) => { if (p) pipes.set(id, p); else pipes.delete(id); pipeBus.forEach((f) => f()); };
export function useRenderPipe(planJobId: string | null): RenderPipe | null {
  const [, tick] = useState(0); useEffect(() => { const f = () => tick((x) => x + 1); pipeBus.add(f); return () => { pipeBus.delete(f); }; }, []);
  return planJobId ? pipes.get(planJobId) ?? null : null;
}
/** Paint the first frame for free on this computer: the mockup's frame 0 + the still prompt (stillPrompt: no camera moves, motion, timing or sound) →
 *  a Create Image edit job on the painter (painterOf: FLUX 3 Klein when it can run here or with the "Who is it?" picture, else FLUX.2 [klein] 4B). Resolves with the finished image job. */
async function paintFirstFrame(planJobId: string, prompt: string, who: File | null, P: FirstFramePainter, onPct: (pct: number, jobId: string) => void, alive: () => boolean): Promise<{ jobId: string; url: string; demo: boolean } | null> {
  const r0 = await fetch(`/api/make-it-real/frame0?planJob=${encodeURIComponent(planJobId)}`); if (!r0.ok) throw new Error('Couldn’t read the mockup’s first frame.');
  const f0 = new File([await r0.blob()], `plan-${planJobId}-frame0.png`, { type: 'image/png' });
  const fd = new FormData(); fd.append('provider', P.provider); fd.append('route', P.route); fd.append('types', 'edit'); fd.append('image', f0); if (who) fd.append('refs', who);
  fd.append('prompt', firstFramePrompt(prompt, { who: !!who })); fd.append('parentId', planJobId);
  const r = await createJob(P.tool, fd); const id = String(r.id); onPct(0, id);
  for (;;) { await new Promise((ok) => setTimeout(ok, 1200)); if (!alive()) return null; const j = await getJob(id);
    if (j.status === 'done') { const url = j.outputs?.[0]?.url ?? j.resultUrl; if (!url) throw new Error('The painter returned no picture.'); return { jobId: id, url, demo: !!(j as any).demo }; }
    if (j.status === 'failed' || j.status === 'blocked' || j.status === 'canceled') throw new Error(j.error || 'Painting the first frame didn’t work. Try again, or add your own picture.');
    onPct(j.progress ?? 0, id); }
}

export function MakeItRealSheet({ planJobId, anchor, open, onClose, onStarted, avoid, placement = 'top', align }: { planJobId: string | null; anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; /** where the sheet lines up with its anchor */ align?: 'start' | 'center' | 'end';
  /** the new job id, once submitted */ onStarted?: (jobId: string) => void; avoid?: RefObject<HTMLElement | null>; placement?: 'top' | 'bottom' | 'right' }) {
  const toast = useToast();
  const [prep, setPrep] = useState<MakeRealPrep | null>(null); const [err, setErr] = useState('');
  const [prompt, setPrompt] = useState(''); const [frames, setFrames] = useState(65); const [size, setSize] = useState('quick');
  /* the model (shared/renderModels.ts): local LTX is the default; cloud rows have their own lengths (whole seconds) and qualities */
  const [model, setModel] = useState<string>(MAKE_REAL_PROVIDER); const [len, setLen] = useState<number | null>(null); const [qual, setQual] = useState(''); const [menu, setMenu] = useState(false); const modelBtn = useRef<HTMLButtonElement>(null);
  const rm = renderModelOf(model) ?? RENDER_MODELS[0]; const cloud = rm.route === 'router'; const mp = prep?.models?.find((x) => x.id === model) ?? null;
  /* LTX's place: this computer (free) or Comfy Cloud (paid, with the user's imported LoRA); its own lengths (whole seconds) and sizes (Draft / Sharper / 720p) */
  const [place, setPlace] = useState<'local' | 'cloud'>('local'); const pc = prep?.cloud ?? null; const onCloud = !cloud && place === 'cloud' && !!pc;
  const [clen, setClen] = useState<number | null>(null); const [csize, setCsize] = useState('hd'); const [lora, setLora] = useState<LoraCheck | null>(null);
  /* first: the LTX first frame (painted on Render, or a preview painted now, or your own picture); pic: a cloud model's optional picture; who: "Who is it?" */
  const [first, setFirst] = useState<First | null>(null); const [pic, setPic] = useState<{ file: File; url: string; name: string } | null>(null); const [who, setWho] = useState<{ file: File; url: string; name: string } | null>(null);
  const whoIn = useRef<HTMLInputElement>(null); const fileIn = useRef<HTMLInputElement>(null); const picIn = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ pct: number } | null>(null); const previewRun = useRef(0); const [sending, setSending] = useState(false);
  const pipe = useRenderPipe(planJobId); const busy = sending || !!pipe;
  const load = (fr?: number, sz?: string) => { if (!planJobId) return; const q = new URLSearchParams({ planJob: planJobId, ...(fr ? { frames: String(fr) } : {}), ...(sz ? { size: sz } : {}) });
    return fetch(`/api/make-it-real/prep?${q}`).then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || 'Couldn’t read this mockup.'); return b as MakeRealPrep; }); };
  /* a new mockup: start clean. Re-opening the same mockup keeps what you set (prompt, pictures, model), so a closed sheet never loses your work */
  const loadedFor = useRef<string | null>(null);
  useEffect(() => { if (!open || !planJobId) return; if (loadedFor.current === planJobId && prep) return; let on = true; setErr(''); setPrep(null);
    void load()?.then((p) => { if (!on) return; loadedFor.current = planJobId; setPrep(p); setPrompt(takeWaitingPrompt() ?? p.prompt); setFrames(p.plan.frames); setSize(p.plan.size); setModel(MAKE_REAL_PROVIDER); setPlace('local'); setClen(p.cloud?.defaultLength ?? null); setCsize(p.cloud?.defaultSize ?? 'hd'); setLora(null); setFirst(null); setPic(null); setWho(null); setPreview(null); previewRun.current++; })
      .catch((e) => on && setErr((e as Error).message));
    return () => { on = false; }; }, [open, planJobId]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the files can finish downloading while the sheet is open: look again every 5 s until they are all ready */
  useEffect(() => { if (!open || !prep || prep.ready || cloud || onCloud) return; const t = setInterval(() => { void load(frames, size)?.then((p) => setPrep((o) => (o ? { ...o, files: p.files, ready: p.ready, missingBytes: p.missingBytes } : p))).catch(() => 0); }, 5000); return () => clearInterval(t); }, [open, prep?.ready, frames, size, cloud, onCloud]); // eslint-disable-line react-hooks/exhaustive-deps
  /* a new model: its default length (the whole mockup, as long as it allows) and quality */
  useEffect(() => { setLen(mp?.defaultLength ?? null); setQual(rm.defaultQuality); }, [model, prep?.planJob.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const csRow = pc?.sizes.find((x) => x.id === csize) ?? pc?.sizes[pc.sizes.length - 1];
  const q = useToolQuote((cloud && prep && len) || (onCloud && clen) ? MAKE_REAL_TOOL : null, model, onCloud
    ? { seconds: String(clen ?? ''), resolution: csRow?.tier ?? '720p', route: pc!.route, types: 'make-it-real' } : { seconds: String(len ?? ''), ...(qual ? { resolution: qual } : {}), types: 'make-it-real' });
  /* the free LoRA check, once per sheet opening on the Cloud place (no key: the steps still show) */
  useEffect(() => { if (!open || !onCloud || lora) return; let on = true; setLora({ state: 'checking' });
    fetch('/api/comfy-cloud/ltx25-layout/check').then(async (r) => { const b = await r.json().catch(() => ({})); if (!on) return; setLora(r.status === 409 && b.code === 'key_missing' ? { state: 'no-key' } : r.ok ? { state: b.state ?? 'unknown', loaderPath: b.loaderPath ?? null } : { state: 'unknown' }); })
      .catch(() => on && setLora({ state: 'unknown' })); return () => { on = false; }; }, [open, onCloud]); // eslint-disable-line react-hooks/exhaustive-deps
  const cEta = onCloud && csRow && clen ? makeRealCloudEtaSeconds({ width: csRow.width, height: csRow.height, frames: clen * 24 + 1 }) : null;
  const bill = cloud && len ? renderBillSeconds(model, len) : null;
  const sizeRow = prep?.sizes.find((s) => s.id === size) ?? prep?.sizes[0];
  const eta = useMemo(() => (prep ? (prep.eta.source === 'learned' && frames === prep.plan.frames && size === prep.plan.size ? prep.eta : { ...makeRealEtaSeconds({ width: sizeRow?.width ?? 1024, height: sizeRow?.height ?? 576, frames }), source: 'estimate' }) : null), [prep, frames, size, sizeRow]);
  const known = !!prep && prep.files.every((f) => f.state !== 'unknown');
  const notReady = !!prep && prep.files.some((f) => f.state === 'missing' || f.state === 'downloading');
  const downloading = !!prep && prep.files.some((f) => f.state === 'downloading');
  const tooHeavy = prep?.fit.verdict === 'too_heavy';
  const avoidHit = PROMPT_AVOID.exec(prompt)?.[0];
  const needsPaint = !cloud && !first;
  const why = !prep ? 'Loading…' : !stripAvoidWords(prompt) ? 'Describe the finished shot' : cloud ? (mp?.needs ? 'Needs the upload helper' : !len ? 'Mockup too short' : q?.needsKey ? 'Add a Comfy key' : q && q.runnable === false && !q.demo ? 'Can’t run here' : !q ? 'Pricing…' : '')
    : onCloud ? (!clen ? 'Mockup too short' : lora?.state === 'missing' ? 'Import the LoRA first' : q?.needsKey ? 'Add a Comfy key' : q && q.runnable === false && !q.demo ? 'Can’t run here' : !q ? 'Pricing…' : '')
    : notReady ? (downloading ? 'Waiting for downloads' : 'Model files needed') : '';
  const imageOk = (f: File | null | undefined) => { if (!f) return false; if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { toast('Use a PNG, JPG or WebP picture.', 'error'); return false; } return true; };
  const asPic = (f: File) => ({ file: f, url: URL.createObjectURL(f), name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 28) || 'your picture' });
  /* Paint now: an optional preview of the first frame before rendering (the same painter Render uses) */
  const paintPreview = async () => {
    if (!prep || preview || busy) return; const run = ++previewRun.current; setPreview({ pct: 0 });
    try { const got = await paintFirstFrame(prep.planJob.id, prompt || prep.prompt, who?.file ?? null, painterOf(prep, !!who), (pct) => run === previewRun.current && setPreview({ pct }), () => run === previewRun.current);
      if (got && run === previewRun.current) setFirst({ kind: 'job', jobId: got.jobId, url: got.url, name: who ? `Painted with ${who.name}` : 'Painted on your computer', sample: prep.backend === 'mock' || got.demo });
    } catch (e) { if (run === previewRun.current) toast((e as Error).message, 'error'); } finally { if (run === previewRun.current) setPreview(null); } };
  /* Render: one click. LTX without a first frame paints one first (free, local), then submits. Runs outside the sheet (closing it doesn't stop it). */
  const generate = async () => {
    if (!prep || why || busy) return; const plan = prep.planJob.id; const m = rm; const text = prompt.trim(); const fr = frames, sz = size, ln = len, ql = qual, route = q?.route; const viaCloud = onCloud ? { route: pc!.route, len: clen, size: csize } : null;
    const firstNow = first; const whoFile = who?.file ?? null; const picFile = pic?.file ?? null; const routeLocal = prep.route; let painted: { jobId: string } | null = null;
    setSending(true);
    try {
      if (m.route === 'local' && !firstNow) { const P = painterOf(prep, !!whoFile); setPipe(plan, { planJobId: plan, stage: 'painting', pct: 0, model: m.id, painter: P.name });
        const got = await paintFirstFrame(plan, text || prep.prompt, whoFile, P, (pct) => setPipe(plan, { planJobId: plan, stage: 'painting', pct, model: m.id, painter: P.name }), () => pipes.has(plan));
        if (!got) return; painted = got; if (loadedFor.current === plan) setFirst({ kind: 'job', jobId: got.jobId, url: got.url, name: whoFile ? 'Painted with your person' : 'Painted on your computer', sample: prep.backend === 'mock' || got.demo }); }
      setPipe(plan, { planJobId: plan, stage: 'submitting', pct: 100, model: m.id, ...(painted ? { painter: painterOf(prep, !!whoFile).name } : {}) });
      const fd = new FormData(); fd.append('planJob', plan); fd.append('parentId', plan); fd.append('provider', m.id); fd.append('prompt', text);
      if (m.route === 'router') { fd.append('length', String(ln)); if (ql) fd.append('resolution', ql); if (route) fd.append('route', String(route)); if (picFile && m.firstFrame !== 'none') fd.append('firstFrame', picFile); }
      else { if (viaCloud) { fd.append('route', viaCloud.route); fd.append('length', String(viaCloud.len)); fd.append('size', viaCloud.size); } else { fd.append('route', routeLocal); fd.append('frames', String(fr)); fd.append('size', sz); }
        if (painted) { fd.append('firstFrameJob', painted.jobId); fd.append('firstFrameOut', '0'); } else if (firstNow?.kind === 'file') fd.append('firstFrame', firstNow.file); else if (firstNow?.kind === 'job') { fd.append('firstFrameJob', firstNow.jobId); fd.append('firstFrameOut', '0'); } }
      const r = await createJob(MAKE_REAL_TOOL, fd); r.warnings?.forEach((w: string) => toast(w, 'warn'));
      toast(`Rendering on ${m.name}${viaCloud ? ' · Comfy Cloud' : ''} · ${m.route === 'router' ? renderEtaText(m) : viaCloud && cEta ? minutesText(cEta) : eta ? minutesText(eta) : 'a few minutes'}. Your take shows in your feed.`, 'info');
      onClose(); onStarted?.(String(r.id));
    } catch (e) { toast((e as Error).message, 'error'); } finally { setPipe(plan, null); setSending(false); } };
  const stopPipe = () => { if (planJobId) setPipe(planJobId, null); };
  const ar = prep ? `${prep.recording.width} / ${prep.recording.height}` : '16 / 9';
  const PIC = { accept: IMAGE_ACCEPT };
  const whoRow = (label: string, hint: string) => <div className="mir-who" data-testid="mir-who">
    <input ref={whoIn} type="file" {...PIC} hidden data-testid="mir-who-input" data-picker-title="Who is it?" data-picker-limits="One picture of the person · PNG, JPG or WEBP" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (imageOk(f)) { setWho(asPic(f!)); if (first?.kind === 'job') setFirst(null); /* repaint with the person */ } }} />
    {who ? <><img src={who.url} alt="Who is it" /><span><b>{label}: {who.name}</b><small>{hint}</small></span>
        <button type="button" className="mir-x" onClick={() => setWho(null)} aria-label="Remove the person picture" data-testid="mir-who-x" {...tip('Remove')}><CloseIcon size={14} /></button></>
      : <><button type="button" className="mir-who-ph" onClick={() => whoIn.current?.click()} aria-label="Add a picture of the person" data-testid="mir-who-ph"><UploadIcon size={14} /></button><span><b>{label}</b><small>{hint}</small></span>
        <button type="button" className="mir-btn" onClick={() => whoIn.current?.click()} data-testid="mir-who-add">Add a picture</button></>}</div>;
  return <BarPopover open={open} anchor={anchor} avoid={avoid} placement={placement} align={align} onClose={onClose} label="Render" role="dialog" testId="mir-sheet" width={440}>
    <div className="bp-wrap mir">
      <header className="mir-head"><span className="mir-ic" aria-hidden><SparkleIcon size={16} /></span><span className="mir-ht"><b>Render</b><small>Turns your mockup into real video. The camera move and where things stand stay as you staged them.</small>
          <button ref={modelBtn} type="button" className={`mir-model mir-model-btn${menu ? ' on' : ''}`} aria-haspopup="listbox" aria-expanded={menu} data-testid="mir-model" onClick={() => setMenu((o) => !o)} disabled={busy}
            {...(menu ? {} : tip(cloud ? `The model that runs: ${rm.name} (${rm.maker}) on Comfy Cloud. Change it here.` : `The model that runs: Lightricks’ LTX-2.5 22B with the Layout to Render LoRA, ${onCloud ? 'on Comfy Cloud' : 'in your ComfyUI'}. Change it here.`))}>
            <span className="mir-model-k">Model</span><span>{rm.name}</span><svg width="10" height="10" viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button></span>
        <button type="button" className="mir-x mir-close" onClick={onClose} aria-label="Close" data-testid="mir-close"><CloseIcon size={14} /></button></header>
      {err ? <PopNote tone="warn" testId="mir-err">{err}</PopNote> : !prep ? <div className="mir-load shimmer" aria-busy="true" data-testid="mir-loading" /> : <>
        <div className="mir-plan"><video src={(cloud && mp?.clip?.url) || prep.planJob.videoUrl} poster={`/api/media/thumb?url=${encodeURIComponent((cloud && mp?.clip?.url) || prep.planJob.videoUrl)}`} muted loop playsInline autoPlay preload="auto" style={{ aspectRatio: ar }} aria-label="Your mockup" />
          <span><b>{prep.planJob.presetName ? `Mockup · ${prep.planJob.presetName}` : 'Your mockup'}</b><small>{cloud && mp?.clip?.label ? mp.clip.label : prep.planJob.label} · {prep.recording.seconds} s · {prep.recording.width}×{prep.recording.height}</small>
            {cloud && <small className={`mir-style${mp?.clip && !mp.clip.matched ? ' mir-style-off' : ''}`} data-testid="mir-style" {...tip(rm.styleWhy)}>Best with {RENDER_STYLE_LABEL[rm.style]}{mp?.clip ? (mp.clip.matched ? ' · sending it' : ` · sending ${mp.clip.style ? RENDER_STYLE_LABEL[mp.clip.style] : 'the first view'}`) : ''}</small>}</span></div>
        {cloud && mp?.clip?.note && <PopNote testId="mir-style-note">{mp.clip.note}</PopNote>}
        {cloud && mp?.needs && <PopNote tone="warn" testId="mir-needs">{mp.needs}. Pick another model for now.</PopNote>}
        {!cloud && !onCloud && (notReady || (!known && prep.backend !== 'mock')) && <PopSection testId="mir-files" className="mir-files-sec">
          <details className="mir-fold" open={downloading || undefined}>
            <summary data-testid="mir-files-sum"><i aria-hidden className={`mir-dot mir-dot-${downloading ? 'downloading' : prep.files.some((f) => f.state === 'missing') ? 'missing' : 'unknown'}`} />
              <span><b>{downloading && !prep.files.some((f) => f.state === 'missing') ? 'Model files still downloading' : prep.files.some((f) => f.state === 'missing') ? 'Model files needed' : 'Model files not checked yet'}</b>
                <small>{prep.files.length} files{notReady ? ` · ${gb(prep.files.reduce((a, f) => a + (f.state === 'ready' || f.state === 'unknown' ? 0 : Math.max(0, f.bytes - (f.haveBytes ?? 0))), 0))} to go` : ` · ${gb(prep.files.reduce((a, f) => a + f.bytes, 0))}`}</small></span>
              <svg className="mir-chev" width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
            <ul className="mir-files">{prep.files.map((f) => <li key={f.file} className={`mir-f mir-f-${f.state}`} data-testid={`mir-file-${f.state}`}>
              <i aria-hidden className="mir-dot" /><span title={`${f.folder}/${f.file}`}><b>{f.role}</b></span><em>{fileLine(f)}</em>
              {f.state === 'downloading' && <span className="mir-bar" aria-hidden><i style={{ width: `${Math.min(100, (100 * (f.haveBytes ?? 0)) / f.bytes)}%` }} /></span>}</li>)}</ul>
            <PopNote>{!known ? 'Set your ComfyUI models folder in Settings so the app can check these files.' : downloading ? 'Render unlocks by itself when every file is complete. This list checks again every few seconds.' : 'Put them in your ComfyUI models folder (the Layout to Render LoRA needs you to accept Lightricks’ licence on Hugging Face first). Render unlocks when every file is ready.'}</PopNote>
          </details>
        </PopSection>}
        <PopSection label={<><i className="mir-step" aria-hidden>1</i>Describe the finished shot</>} aside={prompt !== prep.prompt && prep.prompt ? <button type="button" className="mir-link" onClick={() => setPrompt(prep.prompt)} data-testid="mir-prompt-reset">Use the suggested prompt</button> : undefined}>
          <label className="mir-field"><textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={1500} data-testid="mir-prompt" aria-label="Prompt: the finished shot" placeholder="Who, where, the light: e.g. a woman in a red coat on a rainy Paris street at dusk" />
            <small>Filled in from the scene. One or two sentences about the look; the camera and the motion come from your mockup.</small></label>
          {avoidHit && <PopNote tone="warn" testId="mir-avoid">“{avoidHit}” is left out when it runs: words like clay or 3D make the model copy the rough shapes. <button type="button" className="mir-link" onClick={() => setPrompt(stripAvoidWords(prompt))} data-testid="mir-avoid-fix">Remove now</button></PopNote>}
        </PopSection>
        {!cloud ? <PopSection label={<><i className="mir-step" aria-hidden>2</i>Look <span className="mir-opt-in">optional</span></>} testId="mir-first">
          {prep.person && whoRow('Who is it?', who ? 'The person in your shot takes this look' : 'A picture of the person you played: they take this look')}
          <input ref={fileIn} type="file" {...PIC} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (imageOk(f)) { previewRun.current++; setPreview(null); setFirst({ kind: 'file', file: f!, url: URL.createObjectURL(f!), name: f!.name }); } }} data-testid="mir-first-input" data-picker-title="Choose a first frame" data-picker-limits="One image · PNG, JPG or WEBP · or a frame from one of your videos" data-picker-frames="" />
          <div className={`mir-first${preview || (pipe?.stage === 'painting') ? ' mir-painting' : ''}`} data-testid={first ? 'mir-first-set' : 'mir-first-auto'} role={preview ? 'status' : undefined}>
            {first ? <img src={first.url} alt="First frame" /> : <span className={`mir-first-ph${preview || pipe?.stage === 'painting' ? ' shimmer' : ''}`} aria-hidden><SparkleIcon size={14} /></span>}
            <span><b>{preview || pipe?.stage === 'painting' ? `Painting the first frame… ${(preview?.pct ?? pipe?.pct) ? `${preview?.pct ?? pipe?.pct}%` : ''}` : first ? (first.kind === 'file' ? 'Your first frame' : first.name) : 'First frame · painted when you render'}</b>
              <small>{first?.kind === 'job' && first.sample ? <em className="mir-sample" {...tip('Sample mode: no model ran')}>Sample</em> : null}{first ? 'The video follows its colours and light' : `Your mockup’s first frame in the finished look · ${painterOf(prep, !!who).name}, free`}</small></span>
            <span className="mir-first-act">
              {!first && !preview && <button type="button" className="mir-btn" onClick={() => void paintPreview()} disabled={busy} data-testid="mir-first-paint" {...tip('Paint it now to see it before rendering (free, on your computer)')}>Preview</button>}
              {first?.kind === 'job' && <button type="button" className="mir-x" onClick={() => { setFirst(null); void paintPreview(); }} disabled={busy} data-testid="mir-first-again" aria-label="Repaint" {...tip('Repaint')}><SparkleIcon size={14} /></button>}
              {!preview && <button type="button" className="mir-btn" onClick={() => fileIn.current?.click()} disabled={busy} data-testid="mir-first-add" {...tip('Use your own picture as the first frame')}><UploadIcon size={14} />{first ? 'Replace' : 'My own'}</button>}
              {(first || preview) && <button type="button" className="mir-x" onClick={() => { previewRun.current++; setPreview(null); setFirst(null); }} disabled={busy} aria-label={preview ? 'Stop painting' : 'Remove the first frame'} data-testid="mir-first-x" {...tip(preview ? 'Stop (it paints again when you render)' : 'Remove (it paints a new one when you render)')}><CloseIcon size={14} /></button>}</span></div>
        </PopSection>
        : rm.firstFrame === 'none' ? <PopNote testId="mir-first-none">{rm.firstFrameHint}</PopNote>
        : <PopSection label={<><i className="mir-step" aria-hidden>2</i>{rm.firstFrameAs === 'first' ? 'First frame' : 'Reference picture'} <span className="mir-opt-in">optional</span></>} testId="mir-first">
          <input ref={picIn} type="file" {...PIC} hidden data-testid="mir-pic-input" data-picker-title={rm.firstFrameAs === 'first' ? 'Choose a first frame' : 'Choose a reference picture'} data-picker-limits="One image · PNG, JPG or WEBP" data-picker-frames="" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (imageOk(f)) setPic(asPic(f!)); }} />
          <div className="mir-first" data-testid={pic ? 'mir-pic-set' : 'mir-pic-empty'}>
            {pic ? <img src={pic.url} alt="Your picture" /> : <button type="button" className="mir-first-ph" onClick={() => picIn.current?.click()} aria-label="Add a picture"><UploadIcon size={14} /></button>}
            <span><b>{pic ? pic.name : rm.firstFrameAs === 'first' ? 'No first frame' : 'No reference'}</b><small>{rm.firstFrameHint}</small></span>
            <span className="mir-first-act">{pic ? <button type="button" className="mir-x" onClick={() => setPic(null)} aria-label="Remove the picture" data-testid="mir-pic-x" {...tip('Remove')}><CloseIcon size={14} /></button>
              : <button type="button" className="mir-btn" onClick={() => picIn.current?.click()} data-testid="mir-pic-add"><UploadIcon size={14} />Add</button>}</span></div>
        </PopSection>}
        {cloud ? <PopSection label={<><i className="mir-step" aria-hidden>3</i>Length and quality</>} testId="mir-cloud-len" aside={len ? <span className="bp-mono" data-testid="mir-dims" {...tip(`24 fps, the first ${len} s of your ${prep.recording.seconds} s mockup${bill !== len ? `; ${rm.name} bills it as ${bill} s` : ''}`)}>{len} s{bill !== len ? ` · billed ${bill} s` : ''}{qual && qual !== 'source' ? ` · ${qual}` : ''}</span> : undefined}>
          {mp && mp.lengths.length ? <div className="mir-draft"><Segmented label="Length" value={len ?? mp.lengths[mp.lengths.length - 1]} testId="mir-length" onChange={(v) => setLen(v)} options={mp.lengths.map((l) => ({ value: l, label: `${l} s`, title: `${l} s at 24 fps${renderBillSeconds(model, l) !== l ? `, billed as ${renderBillSeconds(model, l)} s` : ''}`, testId: `mir-len-${l}` }))} />
            {rm.qualities.length > 1 && <Segmented label="Quality" value={qual} testId="mir-quality" onChange={(v) => setQual(v)} options={rm.qualities.map((x) => ({ value: x.id, label: x.label, hint: x.hint, testId: `mir-q-${x.id}` }))} />}
            {rm.qualities.length === 1 && <small className="mir-qnote" data-testid="mir-quality-one">{rm.qualities[0].hint}</small>}</div>
            : <PopNote tone="warn" testId="mir-too-short">{rm.name} needs a mockup of at least {rm.clip.minSec} s; this one is {prep.recording.seconds} s.</PopNote>}
        </PopSection>
        : <PopSection label={<><i className="mir-step" aria-hidden>3</i>Where, length and quality</>} aside={onCloud ? (csRow && clen ? <span className="bp-mono" data-testid="mir-dims" {...tip(`24 fps, the first ${clen} s of your mockup.${csRow.tier === '720p' ? ' Rendered at 1280×704 and scaled to your mockup’s size.' : ''}`)}>{csRow.tier === '720p' && csRow.width > csRow.height ? '1280×720' : csRow.tier === '720p' && csRow.width < csRow.height ? '720×1280' : `${csRow.width}×${csRow.height}`} · {clen * 24 + 1} frames</span> : undefined)
            : sizeRow ? <span className="bp-mono" data-testid="mir-dims" {...tip(`24 fps, trimmed from your ${prep.recording.seconds} s mockup.`)}>{sizeRow.width}×{sizeRow.height} · {frames} frames</span> : undefined}>
          <div className="mir-draft">{pc && <Segmented label="Runs on" value={place} testId="mir-place" className="mir-wide" onChange={(v) => setPlace(v)} options={[{ value: 'local' as const, label: 'Your computer', hint: 'Free · slower', testId: 'mir-place-local', title: 'Your computer: free, a few minutes, Draft or Sharper' },
              { value: 'cloud' as const, label: 'Comfy Cloud', hint: 'Fast · up to 720p, 10 s', testId: 'mir-place-cloud', title: 'Comfy Cloud: the same model, faster, up to 720p and 10 s' }]} />}
          {onCloud ? <>{pc!.lengths.length ? <Segmented label="Length" value={clen ?? pc!.lengths[pc!.lengths.length - 1]} testId="mir-length" className="mir-wide" onChange={(v) => setClen(v)} options={pc!.lengths.map((l) => ({ value: l, label: `${l} s`, title: `${l * 24 + 1} frames at 24 fps`, testId: `mir-clen-${l}` }))} />
              : <PopNote tone="warn" testId="mir-too-short">Comfy Cloud needs a mockup of at least 2 s; this one is {prep.recording.seconds} s.</PopNote>}
            <Segmented label="Size" value={csize} testId="mir-size" className="mir-wide" onChange={(v) => setCsize(v)} options={pc!.sizes.map((s) => ({ value: s.id, label: s.label, hint: s.tier === '720p' ? 'Sharpest' : `${s.width}×${s.height}`, title: s.note, testId: `mir-csize-${s.id}` }))} /></>
          : <><Segmented label="Length" value={frames} testId="mir-length" onChange={(v) => setFrames(v)} options={prep.lengths.map((l) => ({ value: l.frames, label: `${l.seconds} s`, title: `${l.frames} frames at 24 fps`, testId: `mir-len-${l.frames}` }))} />
          <Segmented label="Size" value={size} testId="mir-size" onChange={(v) => setSize(v)} options={prep.sizes.map((s) => ({ value: s.id, label: s.label, hint: `${s.width}×${s.height}`, title: s.note, testId: `mir-size-${s.id}` }))} /></>}</div>
        </PopSection>}
        {onCloud && lora && lora.state !== 'present' && <PopNote tone={lora.state === 'missing' ? 'warn' : undefined} testId={`mir-lora-${lora.state}`}>
          <b>{lora.state === 'checking' ? 'Checking your Comfy Cloud setup…' : 'One-time setup on Comfy Cloud (2 min)'}</b>
          {lora.state !== 'checking' && <details className="mir-howto"><summary>How to set up</summary><ol className="mir-steps" data-testid="mir-lora-steps">
            <li>Accept the licence on <a href={pc!.lora.repo} target="_blank" rel="noreferrer">Lightricks’ Hugging Face page</a> (the repo is gated; approval is instant).</li>
            <li>In Comfy Cloud → Settings → Secrets, add a Hugging Face read token.</li>
            <li>Model Library → Import → paste <a href={pc!.lora.url} target="_blank" rel="noreferrer" className="bp-mono" data-testid="mir-lora-link">{pc!.lora.url.replace('https://', '')}</a>, type LoRA.</li>
            <li>It shows up as <code>{pc!.lora.importAs}</code>.{lora.state === 'no-key' ? ' Add your Comfy Cloud key in Settings → Connections so the app can check it.' : ''}</li></ol></details>}</PopNote>}
        {onCloud && lora?.state === 'present' && <PopNote testId="mir-lora-present">Comfy Cloud is set up for this.</PopNote>}
        {!cloud && tooHeavy && <PopNote tone="warn" testId="mir-heavy">{prep.fit.reason}</PopNote>}
        {(cloud || onCloud) && q && q.runnable === false && !q.demo && q.priceLine && <PopNote tone="warn" testId="mir-route-note">{String(q.priceLine)}</PopNote>}
        <footer className="mir-foot mir-foot-one">
          <span className="mir-cost" data-testid="mir-cost">{cloud ? <span><b className="mir-cost-m">{rm.name}</b> · Comfy Cloud · {renderEtaText(rm)}<small> (estimate)</small></span>
            : onCloud ? <span {...tip('An estimate: Comfy Cloud bills by the second.')}><b className="mir-cost-m">{rm.name}</b> · Comfy Cloud{typeof q?.exactUsd === 'number' ? <> · <b data-testid="mir-cloud-usd">≈ ${(Math.ceil(q.exactUsd * 100 - 1e-9) / 100).toFixed(2)}</b>{typeof q?.listCredits === 'number' ? ` (${q.listCredits} credits)` : ''}</> : ''} · {needsPaint ? 'paints the first frame here, then renders · ' : ''}{cEta ? minutesText(cEta) : '…'}<small> (estimate)</small></span>
            : <span {...(eta?.source !== 'learned' ? tip('First run downloads about 44 GB once. After that, timings are your own.') : {})}><b>Free</b> · on your computer · {needsPaint ? 'paints the first frame, then renders · ' : ''}{eta ? minutesText(eta) : '…'}{eta?.source !== 'learned' ? <small> (estimate)</small> : null}</span>}</span>
          {pipe ? <div className="mir-pipe" role="status" data-testid="mir-pipe"><ol>
              <li className={pipe.stage === 'painting' ? 'on' : 'done'}><i aria-hidden />{pipe.stage === 'painting' ? `${pipe.painter ? `${pipe.painter} paints` : 'Painting'} the first frame${pipe.pct ? ` · ${pipe.pct}%` : '…'}` : pipe.painter ? `First frame painted · ${pipe.painter}` : 'First frame painted'}</li>
              <li className={pipe.stage === 'submitting' ? 'on' : ''}><i aria-hidden />Starting the render</li></ol>
              {pipe.stage === 'painting' && <button type="button" className="mir-link" onClick={stopPipe} data-testid="mir-pipe-stop">Stop</button>}</div>
          : <button type="button" className="btn btn-primary mir-gen gen-btn" disabled={!!why || busy} aria-disabled={!!why || busy} data-testid="mir-generate" onClick={() => void generate()} {...(why ? tip(why) : {})}>
            <span className="gen-l">{busy ? <i className="as-spin" aria-hidden /> : <SparkleIcon size={14} />}{why && why !== 'Loading…' && why !== 'Pricing…' ? why : 'Render'}</span>
            {!why && (cloud || onCloud ? <GenPrice q={q} demo={!!q?.demo} credits={typeof q?.credits === 'number' ? q.credits : null} testId="mir-price" /> : <GenPrice free testId="mir-price" />)}</button>}
          {(cloud || onCloud ? q?.demo : prep.backend === 'mock') && <small className="mir-eta-note" data-testid="mir-mock">Sample mode: nothing runs or is billed; you get a colour-graded copy of your mockup, labelled Sample.</small>}
        </footer>
      </>}
    </div>
    <ModelMenu open={menu} anchor={modelBtn} onClose={() => setMenu(false)} items={renderMenuItems(prep)} value={model} testId="mir-model-list" rowTestId={(id) => `mir-model-${id}`}
      onPick={(id) => { if (renderMenuItems(prep).find((x) => x.id === id)?.off) return; setModel(id); setMenu(false); }} toolId={MAKE_REAL_TOOL} quote={cloud ? q : null} placement="bottom" lastLabel="Can’t run on this mockup yet" defaultId={MAKE_REAL_PROVIDER} defaultWhy="free, on your computer" />
  </BarPopover>;
}
/** Mockup vs Render: the mockup and the render side by side, in sync. The render is the master (it carries the sound); the mockup follows it. */
export function PlanVsReal({ planUrl, realUrl, ar, sample, testId = 'plan-vs-real' }: { planUrl: string; realUrl: string; ar?: string; sample?: boolean; testId?: string }) {
  const real = useRef<HTMLVideoElement>(null), plan = useRef<HTMLVideoElement>(null);
  const [view, setView] = useState<'both' | 'real'>('both'); const [playing, setPlaying] = useState(false); const [t, setT] = useState(0); const [dur, setDur] = useState(0); const [muted, setMuted] = useState(true);
  useEffect(() => { const m = real.current; if (!m) return; let raf = 0;
    const follow = () => { const s = plan.current; if (s && s.duration && Math.abs(s.currentTime - Math.min(m.currentTime, s.duration - 0.02)) > 0.06) s.currentTime = Math.min(m.currentTime, s.duration - 0.02); setT(m.currentTime); raf = requestAnimationFrame(follow); };
    const on = () => { setPlaying(!m.paused); const s = plan.current; if (s) { if (m.paused) s.pause(); else s.play().catch(() => 0); } };
    m.addEventListener('play', on); m.addEventListener('pause', on); raf = requestAnimationFrame(follow);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; m.muted = muted; if (!reduced) m.play().catch(() => 0);
    return () => { cancelAnimationFrame(raf); m.removeEventListener('play', on); m.removeEventListener('pause', on); }; }, [realUrl, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const arn = (() => { const [w, h] = String(ar ?? '16 / 9').split('/').map(Number); return w > 0 && h > 0 ? (w / h).toFixed(4) : '1.7778'; })();
  const toggle = () => { const m = real.current; if (!m) return; if (m.paused) { m.play().catch(() => 0); } else m.pause(); };
  const seek = (v: number) => { const m = real.current; if (m) m.currentTime = v; const s = plan.current; if (s) s.currentTime = Math.min(v, (s.duration || v) - 0.02); setT(v); };
  return <div className={`pvr pvr-${view}`} data-testid={testId} style={{ ['--pvr-ar' as any]: ar ?? '16 / 9', ['--pvr-arn' as any]: arn }}>
    <div className="pvr-stage">
      {view === 'both' && <figure className="pvr-cell"><span className="pvr-box"><video ref={plan} src={planUrl} muted loop playsInline preload="auto" aria-label="The mockup" /><figcaption>Mockup</figcaption></span></figure>}
      <figure className="pvr-cell"><span className="pvr-box"><video ref={real} src={realUrl} loop playsInline preload="auto" onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)} aria-label="The render" onClick={toggle} /><figcaption>Render{sample ? <em>Sample</em> : null}</figcaption></span></figure>
    </div>
    <div className="pvr-bar">
      <button type="button" className="pvr-play" onClick={toggle} aria-label={playing ? 'Pause both' : 'Play both'} data-testid="pvr-play">{playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6.5" y="5" width="3.6" height="14" rx="1" /><rect x="13.9" y="5" width="3.6" height="14" rx="1" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13l10.5-6.5z" /></svg>}</button>
      <input type="range" min={0} max={dur || 1} step={1 / 24} value={Math.min(t, dur || 1)} onChange={(e) => seek(Number(e.target.value))} aria-label="Move through both clips" data-testid="pvr-scrub" className="pvr-scrub" style={{ ['--pv-k' as any]: `${dur ? (100 * t) / dur : 0}%` }} />
      <button type="button" className={`pvr-snd${muted ? '' : ' on'}`} aria-pressed={!muted} onClick={() => { const m = real.current; if (m) m.muted = !muted; setMuted(!muted); }} data-testid="pvr-sound" {...tip('LTX-2.5 makes sound with the picture')}>{muted ? 'Sound off' : 'Sound on'}</button>
      <div className="pvr-views" role="radiogroup" aria-label="View">
        <button type="button" role="radio" aria-checked={view === 'both'} className={view === 'both' ? 'on' : ''} onClick={() => setView('both')} data-testid="pvr-both">Mockup vs Render</button>
        <button type="button" role="radio" aria-checked={view === 'real'} className={view === 'real' ? 'on' : ''} onClick={() => setView('real')} data-testid="pvr-real">Render only</button></div>
    </div>
  </div>;
}