/**
 * The generate node's view ('ohf-gen'; the shape util is genCardUtil.tsx, variations are variation.ts): one run, set up and started on the node itself. It uses the shared NodeFrame, so it has the
 * same header / media / footer / ports as every other node:
 *  - header: the medium tile, the workflow name (a switcher on a draft) and the run's state;
 *  - body: the prompt (or the text a Prompt / Note node feeds in), inputs, and the workflow's settings chips (only while selected);
 *  - footer: the full model name (the ModelMenu on a draft) and the shared DockGenerate as a slim orange pill with the price inside;
 *    a disabled Generate is a quiet outline pill, never a muddy block;
 *  - ports: an arrow in from any result / upload / finished node, and a drag from the right edge onto another node.
 * Running shows the shared GenTile; done shows the shared ResultCard inside the same frame (several takes get a strip), with
 * Variation and Recreate; failed shows the shared failure wording and Retry. Everything it keeps lives in the board snapshot
 * (cardModel.GenCardProps): never media data.
 */
import { useEffect, useRef, useState } from 'react';
import { useEditor, useValue } from 'tldraw';
import type { JobState } from '../api';
import { getJob } from '../api';
import { ResultCard } from '../shared/ResultCard';
import { gridSrc } from '../shared/thumbs';
import GenTile from '../shared/GenTile';
import { useFailView } from '../shared/FailureState';
import { GenPrice } from '../shared/GenPrice';
import { MakerTile } from '../shared/MakerTile';
import { ModelMenu } from '../shared/ModelMenu';
import { WorkflowPicker } from '../shared/WorkflowPicker';
import { DockGenerate } from '../shared/DockGenerate';
import { shownCredits } from '../shared/quote';
import { useToolQuote } from '../shared/useToolQuote';
import { useDownloadIntent } from '../shared/hardware';
import { intentSize, doSetupPlace } from '../shared/SetupCard';
import { modelOfEngine, setupPlacesOf } from '../shared/models';
import { jobCaption } from '../shared/FeedCaption';
import { useToast } from '../shared/Toast';
import { tip } from '../shared/Tooltip';
import { navigate } from '../platform/router';
import { WfIcon, WorkflowControls } from '../ui/next/WorkflowBar';
import { PreflightPop } from '../ui/next/PhotoPrep';
import { ImageIcon, VideoIcon, AudioIcon, CubeIcon, SoundIcon } from '../ui/Icons';
import { preflightProblems, type PreflightFix } from '../../../server/src/shared/preflight';
import { MEDIA, availableFlows, flowById, flowInfo, tooManyNote, type GenMedium } from '../shared/genFlows';
import { useCatalog, catalogNow } from './catalog';
import { GEN_TYPE, type GenCardProps } from './cardModel';
import type { GenCardShape } from './genCardUtil';
import { variationOf } from './variation';
import { RUN_EVT, OPEN_GROUP_EVT, open3d } from './canvasEvents';
import { cardState, makerOf, missingOf, modelNameOf } from './cardState';
import { lineageRole, linkShapes, promptSourcesInto, waitingInputsOf } from './graph';
import { liveJobs, retryCard } from './genRun';
import { setCard, submit, reveal } from './agentApi';
import { addResultCard, probeSize } from './resultCardUtil';
import { QuickActions } from './QuickActions';
import { NodeFrame } from './NodeFrame';
import { CardName } from './CardName';
import { CardInputs, chooseForSlot } from './CardInputs';
import { useClipInfo } from '../shared/clipInfo';
import { clipIssue, clipRuleFor } from '../../../server/src/shared/clipLimits';
import * as Ic from './icons';
import { placeWord, cardLabel, emptyLine } from './cardLook';
import { badgeText } from '../../../server/src/shared/takeReview';
import { progressOfJob, progressLabel, overallFill, etaText } from '../shared/queueActivity';


const MEDIUM_ICON = { image: ImageIcon, video: VideoIcon, audio: AudioIcon, '3d': CubeIcon } as const;
export function FlowIcon({ flow, medium, size = 16 }: { flow: string; medium: GenMedium; size?: number }) {
  const f = flowById(flow); const info = f ? flowInfo(f, catalogNow()) : null;
  if (f?.id === 'add-sound') return <SoundIcon size={size} />;
  if (medium === 'image' || f?.id === 'video-upscale' || f?.id === 'lip-sync') return <WfIcon name={info?.icon ?? 'create'} size={size} />;
  const M = MEDIUM_ICON[medium] ?? ImageIcon; return <M size={size} />;
}
const stubJob = (p: GenCardProps, status = 'queued'): JobState => ({ id: p.jobId, toolId: '', status, stage: status, progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: status === 'failed' ? p.error || 'The run failed.' : null, warnings: [], parentId: null, input: { prompt: p.prompt } } as any);

function Failed({ shape, job }: { shape: GenCardShape; job: JobState }) {
  const v = useFailView(job);
  return <div className="nf-fail" data-testid="gc-failed">
    <b className="nf-fail-t">{v.title}</b>
    <p className="nf-fail-l" data-testid="gc-fail-reason">{v.line || shape.props.error}</p>
  </div>;
}

/** The version strip: every version this card made stays here as a small thumbnail; the active one (ringed) is what flows to the next
 *  card. Click one, or ← → on the strip, to pick it (the same Pick one the agent asks for). Pull out puts the active one on the board as
 *  its own card; nothing else adds cards. */
function TakeStrip({ shape }: { shape: GenCardShape }) {
  const editor = useEditor(); const toast = useToast(); const p = shape.props; const n = p.takes.length; const i = Math.max(0, Math.min(p.take, n - 1));
  const strip = useRef<HTMLSpanElement>(null);
  /* the newest thumbnail develops too (a smaller version of the card's fade-up) */
  const seen = useRef(n); const [fresh, setFresh] = useState('');
  useEffect(() => { if (n > seen.current && p.takes[n - 1]) { setFresh(p.takes[n - 1].url); const t = window.setTimeout(() => setFresh(''), 1000); seen.current = n; return () => window.clearTimeout(t); } seen.current = n; }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = strip.current?.children[i] as HTMLElement | undefined; el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [i, n]);
  const set = (k: number) => { if (!n) return; const t = ((k % n) + n) % n; editor.run(() => editor.updateShape({ id: shape.id, type: GEN_TYPE, props: { take: t, ratio: 0, ...(p.status === 'failed' ? { status: 'done', error: '' } : {}) } } as any), { history: 'ignore' }); };
  const pull = async () => { const t = p.takes[i]; if (!t) return; let j: JobState | null = liveJobs.get()[t.jobId] ?? null; if (!j) j = await getJob(t.jobId).catch(() => null);
    const cap = j ? jobCaption(j, null) : { model: p.model, place: '', price: '', time: '' };
    const b = editor.getShapePageBounds(shape.id); const prev = editor.getCurrentPageShapes().filter(x => x.type === 'ohf-result' && ((x.props as any).parents ?? []).includes(shape.id)).map(x => editor.getShapePageBounds(x.id)!).filter(Boolean);
    const at = b ? { x: b.maxX + 96 + 180, y: (prev.length ? Math.max(...prev.map(r => r.maxY)) + 32 : b.minY) + 180 } : undefined;
    const shot = String((shape.meta as any)?.name ?? '').trim();
    const id = await addResultCard(editor, t.jobId, { kind: t.kind, url: t.url, poster: t.poster, title: shot ? `${shot} · v${i + 1}` : p.prompt || cap.model || 'Result', caption: cap as any }, at);
    editor.run(() => { editor.updateShape({ id, type: 'ohf-result', props: { parents: [shape.id] } } as any); linkShapes(editor, shape.id, id); }); reveal(editor, id);
    toast(`Version ${i + 1} is on the board`); };
  if (!n) return <div className="gc-versions gc-versions-none" data-testid="gc-takes" />;
  return <div className="nf-takes gc-versions" data-testid="gc-takes" data-card-control>
    <span className="gc-v-n" data-testid="gc-take-n" aria-hidden>{n > 1 ? `${i + 1}/${n}` : 'v1'}</span>
    <span ref={strip} className="gc-v-thumbs" role="listbox" aria-label="Versions: the ringed one goes to the next card" tabIndex={n > 1 ? 0 : -1}
      onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); set(i + (e.key === 'ArrowRight' ? 1 : -1)); } }}>
      {p.takes.map((t, k) => <button key={`${t.url}-${k}`} type="button" role="option" tabIndex={-1} className={`nf-tk${k === i ? ' on' : ''}${fresh === t.url ? ' develop' : ''}`} aria-label={`Version ${k + 1}`} aria-selected={k === i} data-testid={`gc-version-${k + 1}`}
        {...tip(`${k === i ? `Version ${k + 1}: goes to the next card` : `Use version ${k + 1}`}${t.review ? `\n${badgeText(t.review)}${t.review.rec ? '\nThe agent would pick this one' : ''}` : ''}`)} onClick={() => set(k)}>{t.poster ? <img src={gridSrc(t.poster, 28)} alt="" draggable={false} loading="lazy" /> : <i>{k + 1}</i>}
        {t.review && <b className={`gc-v-badge ${t.review.verdict}`} data-testid={`gc-review-${k + 1}`} data-verdict={t.review.verdict} aria-label={badgeText(t.review)}>{t.review.verdict === 'fits' ? '✓' : '!'}</b>}
        {t.review?.rec && <span className="gc-v-rec" data-testid={`gc-rec-${k + 1}`} aria-label="The agent would pick this one" />}</button>)}
    </span>
    <button type="button" className="nf-pull" data-testid="gc-pull" aria-label="Pull out" {...tip('Put this version on the board as its own card')} onClick={() => void pull()}><Ic.PullOutIcon size={14} /></button>
  </div>;
}

export function GenCardView({ shape }: { shape: GenCardShape }) {
  const editor = useEditor(); const cat = useCatalog(); const toast = useToast(); const p = shape.props;
  const st = useValue('gen card', () => { const s = editor.getShape(shape.id) as GenCardShape | undefined; return s ? cardState(editor, s, cat) : null; }, [editor, shape.id, cat, p]);
  const role = useValue('lineage', () => lineageRole(editor, shape.id), [editor, shape.id]);
  const selected = useValue('selected', () => editor.getSelectedShapeIds().includes(shape.id), [editor, shape.id]);
  const job = useValue('live job', () => (p.jobId ? liveJobs.get()[p.jobId] : undefined), [p.jobId]);
  const promptNodes = useValue('prompt nodes', () => promptSourcesInto(editor, shape.id), [editor, shape.id, p.w, p.h]);
  const waiting = useValue('waiting inputs', () => waitingInputsOf(editor, shape.id).map(w => w.name).join('\u0000'), [editor, shape.id]);
  const [hover, setHover] = useState(false); const hoverT = useRef(0); const [focus, setFocus] = useState(false);
  const spec = st?.spec ?? null; const draft = p.status === 'draft'; const open = draft && selected;
  const linked = promptNodes.map(x => x.text).join('\n\n'); const prompt = linked || p.prompt;
  const q = useToolQuote(spec && draft ? spec.tool.id : null, spec?.provider ?? '', spec?.quote ?? {});
  const quote = draft ? q : p.quote; const cr: number | null = quote ? shownCredits(quote) : null; const key = !!quote && quote.needsKey === true && quote.runnable === false;
  const model = draft ? modelNameOf(spec) || p.model : p.model || modelNameOf(spec); const maker = (draft ? makerOf(spec) : p.maker) || makerOf(spec);
  const missing = draft ? missingOf(spec, st?.bySlot ?? {}, prompt) : null; const note = spec && st?.extra.length ? tooManyNote(spec, st.extra.length, model) : null;
  const take = p.takes[Math.min(p.take, p.takes.length - 1)];
  /* results develop (2026-10-27): a version that just arrived fades up like a Polaroid; one already on the board when it opens doesn't */
  const seenTakes = useRef(p.takes.length); const [developing, setDeveloping] = useState('');
  useEffect(() => { const n = p.takes.length; if (n > seenTakes.current && p.status === 'done' && take) { setDeveloping(take.url); const t = window.setTimeout(() => setDeveloping(''), 1500); seenTakes.current = n; return () => window.clearTimeout(t); } seenTakes.current = n; }, [p.takes.length, p.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const intent = useDownloadIntent(spec?.provider || null); const dlSize = spec ? intentSize(q, intent, spec.provider) : null;
  /* a clip the run would refuse (too small, too short, too long) is flagged here, in the server's words (B9) */
  const clipRule = spec ? clipRuleFor(spec.tool.id, spec.provider) : null;
  const clips = useClipInfo(clipRule && draft && spec ? spec.slots.filter(s => s.accept === 'video').flatMap(s => (st?.bySlot[s.name] ?? []).map(i => i.url)) : []);
  const clipProblem = (name: string) => { const u = st?.bySlot[name]?.find(i => i.kind === 'video')?.url; return u ? clipIssue(clipRule, clips[u])?.message ?? null : null; };
  const problems = spec && draft ? preflightProblems({ slots: spec.slots.map(s => ({ name: s.name, label: s.label, required: s.required, filled: !!st?.bySlot[s.name]?.length, missing: s.missing, issue: s.accept === 'video' ? clipProblem(s.name) : null })),
    prompt: missing && !spec.slots.some(s => s.required && !st?.bySlot[s.name]?.length) ? { missing } : null, quote: q, modelName: model }) : [];

  /* prompt field fills the node body; keys stay in the field; Enter generates, Shift+Enter is a new line, Esc leaves */
  const ta = useRef<HTMLTextAreaElement>(null);
  /* a finished picture or clip reports its own shape (kept in the snapshot; the media box uses contain so it never distorts) */
  useEffect(() => { if (p.status !== 'done' || !take || p.ratio || take.kind === 'audio') return; let on = true;
    void probeSize(take.kind === 'image' ? 'image' : 'video', take.kind === 'image' ? take.url : take.poster || take.url).then(s => { if (on && s?.w && s.h) editor.run(() => editor.updateShape({ id: shape.id, type: GEN_TYPE, props: { ratio: Math.round((s.w / s.h) * 1000) / 1000 } } as any), { history: 'ignore' }); });
    return () => { on = false; }; }, [p.status, take?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const [pop, setPop] = useState<'' | 'wf' | 'model'>(''); const wfRef = useRef<HTMLButtonElement>(null); const mRef = useRef<HTMLButtonElement>(null); const genRef = useRef<HTMLButtonElement>(null); const box = useRef<HTMLDivElement>(null);
  const [pfOpen, setPfOpen] = useState(false); useEffect(() => { if (pfOpen && !problems.length) setPfOpen(false); });
  const [openGroup, setOpenGroup] = useState<{ g: string; k: number } | null>(null);
  useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent).detail ?? {}; if (d.cardId === shape.id && d.g) { setHover(true); setOpenGroup({ g: d.g, k: Date.now() }); } }; addEventListener(OPEN_GROUP_EVT, f); return () => removeEventListener(OPEN_GROUP_EVT, f); }, [shape.id]);
  const flows = availableFlows(cat).map(f => ({ ...f, category: f.medium }));

  const [busy, setBusy] = useState(false);
  const generate = async () => { if (!spec || busy || p.status === 'running') return; if (problems.length) { setPfOpen(o => !o); return; }
    setBusy(true); setPfOpen(false); try { await submit(editor, shape.id); } catch (e: any) { toast(e?.issues?.[0]?.message ?? e?.message ?? 'That didn’t start.', 'error'); } finally { setBusy(false); } };
  const recreate = async () => { setBusy(true); try { await submit(editor, shape.id); } catch (e: any) { toast(e?.issues?.[0]?.message ?? e?.message ?? 'That didn’t start.', 'error'); } finally { setBusy(false); } };
  const runVariation = () => { const nid = variationOf(editor, shape.id); if (nid) editor.select(nid); };
  const runFix = async (f: PreflightFix) => { if (!spec) return; const a = f.args ?? {}; const m = modelOfEngine(spec.tool.id, spec.provider);
    switch (f.kind) {
      case 'pick-model': setPfOpen(false); setPop('model'); return;
      case 'focus-prompt': setPfOpen(false); requestAnimationFrame(() => ta.current?.focus()); return;
      case 'add-key': case 'download': case 'turn-on': case 'install-node': case 'set-up': { const ps = setupPlacesOf(m, q); const pl = ps.find(x => x.runOn === a.runOn) ?? ps[0]; if (!pl) return;
        try { await doSetupPlace(spec.tool.id, m, spec.provider, pl); } catch (er) { toast((er as Error).message || 'That didn’t work. Try again.', 'error'); } if (f.kind !== 'download') setPfOpen(false); return; }
      case 'choose-photo': { const sl = spec.slots.find(x => x.name === a.slot) ?? spec.slots.find(x => x.required) ?? spec.slots[0]; setPfOpen(false); if (sl) chooseForSlot(editor, shape.id, sl, toast); return; }
      default: setPfOpen(false); toast('Draw an arrow into the node from a result, or use Add to pick a file.');
    } };
  useEffect(() => { const f = (e: Event) => { if ((e as CustomEvent).detail?.cardId === shape.id) void generate(); }; addEventListener(RUN_EVT, f); return () => removeEventListener(RUN_EVT, f); });

  const name = spec?.flow.name ?? flowById(p.flow)?.name ?? 'Generate';
  /* the shot name an agent gave the card ("Hero close-up"): the first thing you read, also zoomed out */
  const shot = typeof (shape.meta as any)?.name === 'string' ? String((shape.meta as any).name).trim() : '';
  const quoting = draft && !!spec && !q;
  const statusWord = draft ? (quoting ? 'Pricing' : 'Draft') : p.status === 'running' ? (job && job.status === 'queued' ? 'Queued' : 'Running') : p.status === 'done' ? (p.takes.length > 1 ? `${p.takes.length} versions` : 'Done') : 'Failed';
  const statusTone = draft ? '' : p.status === 'done' ? ' nf-status-done' : p.status === 'failed' ? ' nf-status-failed' : p.status === 'running' ? ' nf-status-running' : '';
  const enter = () => { clearTimeout(hoverT.current); setHover(true); }; const leave = () => { clearTimeout(hoverT.current); hoverT.current = window.setTimeout(() => setHover(false), 260); };
  const Medium = MEDIUM_ICON[p.medium] ?? ImageIcon;
  const place = placeWord(quote);

  /* model · place · price: one quiet row under the picture, the same on every state (the model is the model menu on a draft) */
  /* a demo sample (shared/demoMedia.ts) names the model that really made it, never the card's own model */
  const made = !draft && p.status === 'done' ? take?.made : undefined;
  const chips = made ? <div className="gc-row" data-testid="gc-chips-row"><span className="gc-row-model" data-testid="gc-made"><b {...tip(made)}>{made}</b></span></div> : <div className="gc-row" data-testid="gc-chips-row">
    {draft && spec ? <button ref={mRef} type="button" className="gc-row-model gc-row-btn" aria-haspopup="listbox" aria-expanded={pop === 'model'} data-testid="gc-model-chip" disabled={spec.providers.length < 2} {...tip(pop === 'model' ? null : `Model: ${model}`)} onClick={() => setPop(pop === 'model' ? '' : 'model')}>
        <MakerTile className="gc-mk" medium={p.medium} maker={maker} fallback={model} /><b>{model || 'Model'}</b>{spec.providers.length > 1 && <Ic.CaretIcon size={11} />}</button>
      : <span className="gc-row-model"><MakerTile className="gc-mk" medium={p.medium} maker={maker} fallback={model} /><b {...tip(model)}>{model || (spec ? 'Model' : 'Loading…')}</b></span>}
    {place && <span className="gc-row-place" data-testid="gc-place">{place}</span>}
    <span className={`gc-row-price${quoting ? ' gc-quoting' : ''}`} data-testid="gc-price">{quoting ? <i className="gc-shimmer" aria-label="Pricing" /> : <GenPrice q={quote} demo={!key && quote?.demo === true} free={!key && cr === 0} credits={key ? null : cr} text={key ? 'Needs a key' : place === 'Your computer' ? 'Free' : null} />}</span>
  </div>;

  /* while it runs there is no action row: the one status line sits where the model row goes, the bar on the picture's bottom edge */
  const running = p.status === 'running';
  const footer = running ? undefined : draft
    ? (spec ? <DockGenerate toolId={spec.tool.id} engine={spec.provider} quote={q} label={spec.generateLabel} busy={busy} problems={problems} missing={missing} pfOpen={pfOpen} genRef={genRef} onClick={() => void generate()}
        intent={intent} dlSize={dlSize} workflowId={spec.flow.id} className="gen-node" variant="node" testId="gc-generate" priceTestId="gc-gen-price" />
      : <button type="button" className="gen-btn gen-node" disabled><span className="gen-l">Generate</span></button>)
    : p.status === 'failed' ? <FailFoot shape={shape} job={job ?? stubJob(p, 'failed')} />
    : <TakeStrip shape={shape} />;

  return <div ref={box} className="gc-box" data-role={role ?? undefined} onPointerEnter={enter} onPointerLeave={leave}>
    <NodeFrame shapeId={shape.id} type={GEN_TYPE} tint={p.medium} icon={<Medium />} testId="gen-card" className={`gc gc-${p.status}`} label={cardLabel(shot, name)}
      rootAttrs={{ 'data-status': p.status, 'data-flow': p.flow, 'data-medium': p.medium, 'data-job': p.jobId || undefined, 'data-role': role ?? undefined }}
      title={<button ref={wfRef} type="button" className={pop === 'wf' ? 'on' : ''} aria-haspopup="listbox" aria-expanded={pop === 'wf'} data-testid="gc-flow" disabled={!draft} {...tip(draft ? `${name}: change workflow` : spec?.flow.tagline ?? null)} onClick={() => setPop(pop === 'wf' ? '' : 'wf')}>
        <b className="gc-name">{name}</b>{draft && <Ic.CaretIcon size={13} />}</button>}
      status={<span className={`nf-status${statusTone}`} data-testid="gc-status">{(p.status === 'running' || quoting) && <i className="nf-dot" aria-hidden />}{statusWord}</span>}
      actions={(p.status === 'done' || p.status === 'failed') ? <>
        <button type="button" className="nf-act" aria-label="Make a variation" data-testid="gc-variation" {...tip('Variation: a copy with the same settings beside it, ready to tweak. Nothing runs until you press Generate (⌘D does the same)')} onClick={() => void runVariation()}><Ic.CopyIcon size={14} /></button>
        <button type="button" className="nf-act" aria-label="Recreate: run it again" data-testid="gc-recreate" disabled={busy} {...tip('Recreate: run it again with the same settings. The new version joins the strip')} onClick={() => void recreate()}><Ic.RetryIcon size={14} /></button></> : undefined}
      footer={footer}>
      <CardName id={shape.id} name={shot} shown={shot || 'Untitled'} empty={!shot} className={`gc-shot nf-heading${shot ? '' : ' nf-heading-empty'}`} testId={shot ? 'gc-shot' : 'gc-shot-empty'} />
      <div className={`nf-media gc-media gc-media-${p.status}`} data-testid="gc-media">
        {draft && <div className="gc-stage gc-draft" key="draft">
          {spec && spec.slots.length > 0 && (open || (st?.inputs.length ?? 0) > 0) && <CardInputs cardId={shape.id} slots={spec.slots} bySlot={st?.bySlot ?? {}} showAdd={selected} />}
          {waiting && <span className="gc-waits" data-testid="gc-waits">{waiting.split('\u0000').map(n => <small key={n}><i aria-hidden />Waits for {n}</small>)}</span>}
          {!(st?.inputs.length) && <span className="gc-empty" data-testid="gc-empty"><Medium size={22} /><small>{emptyLine(p.medium)}</small></span>}
          {note && <p className="nf-note" role="note" data-testid="gc-too-many">{note}</p>}
          {open && spec && <div className="nf-chips gc-settings" data-card-control><WorkflowControls key={spec.flow.id} recipe={spec.recipe} vals={spec.vals} setVal={(k, v) => setCard(editor, shape.id, { vals: { ...p.vals, ...spec.vals, [k]: v } })} provider={spec.provider} watch={box} cover mode={spec.mode}
            files={{ image: st?.bySlot.image?.[0]?.url ? { file: null as any, url: st?.bySlot.image[0].poster || st?.bySlot.image[0].url } : null }} openGroup={openGroup} /></div>}
        </div>}
        {p.status === 'running' && <div className="gc-stage" key="run"><GenTile job={job ?? stubJob(p)} testId="gc-running" /></div>}
        {running && <MediaBar job={job ?? stubJob(p)} />}
        {p.status === 'done' && take && <div className={`gc-stage${developing === take.url ? ' develop' : ''}`} key={`done-${take.url}`} data-developing={developing === take.url ? '1' : undefined}><ResultCard kind={take.kind} url={take.url} poster={take.poster} title={p.prompt || name} model={model} width={p.w} active={selected || hover} onView3d={take.kind === '3d' ? () => open3d(take.jobId) : undefined} testId="gc-result" />
          {(take.kind === 'image' || take.kind === 'video') && <QuickActions editor={editor} sourceId={shape.id} kind={take.kind} url={take.url} show={selected || hover} />}</div>}
        {p.status === 'failed' && <div className="gc-stage" key="fail"><Failed shape={shape} job={job ?? stubJob(p, 'failed')} /></div>}
      </div>
      {running ? <RunLine job={job ?? stubJob(p)} /> : chips}
      {draft && !linked && spec?.promptMode !== 'hidden'
        ? <div className={`gc-prompt${focus ? ' open' : ''}`}>
            <textarea ref={ta} className="nf-text gc-prompt-in" rows={2} data-card-control data-testid="gc-prompt-in" aria-label="Prompt" placeholder={spec?.placeholder ?? 'Describe what you want'} value={p.prompt}
              onPointerDown={e => { e.stopPropagation(); if (!selected) editor.select(shape.id); }} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
              onChange={e => setCard(editor, shape.id, { prompt: e.target.value })}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void generate(); } else if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); } }}
              onKeyUp={e => e.stopPropagation()} onWheel={e => { if (e.currentTarget.scrollHeight > e.currentTarget.clientHeight) e.stopPropagation(); }} /></div>
        : draft && spec?.promptMode === 'hidden' && !linked ? <p className="gc-prompt nf-noprompt" data-testid="gc-noprompt">No prompt needed: {name} works from its {spec.slots.length ? 'input' : 'settings'}.</p>
        : <PromptText text={prompt} linked={!!linked} />}
    </NodeFrame>
    {spec && <ModelMenu open={pop === 'model'} anchor={mRef} watch={box} gap={6} onClose={() => setPop('')} placement="bottom" testId="gc-pop-model" toolId={spec.tool.id} value={spec.provider} quote={q}
      items={spec.providers.map(x => ({ id: x.id, name: spec.recipe.modelInfo?.[x.id]?.name ?? x.name, p: x }))} onPick={id => { setCard(editor, shape.id, { provider: id }); setPop(''); }} />}
    {draft && <WorkflowPicker open={pop === 'wf'} anchor={wfRef} watch={box} list={flows} current={p.flow} categories={[{ id: 'all', label: 'All' }, ...MEDIA]} onChoose={w => setCard(editor, shape.id, { flow: w.id })} onClose={() => setPop('')} placement="bottom"
      label="Workflows" prefix="gcwf" noun="board" icon={w => <FlowIcon flow={w.id} medium={w.medium} />} how={w => <p className="cv-wf-how">{w.tagline}. Takes {w.needs.toLowerCase()}.</p>} foot={`${flows.length} workflows · image, video, audio and 3D`} />}
    {draft && <PreflightPop open={pfOpen && problems.length > 0} anchor={genRef} watch={box} cover problems={problems} onClose={() => setPfOpen(false)} run={f => { void runFix(f); }} />}
  </div>;
}

/** The prompt under the picture: two lines, "More" opens the rest over the card (nothing below moves). */
function PromptText({ text, linked }: { text: string; linked: boolean }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLParagraphElement>(null); const [long, setLong] = useState(false);
  useEffect(() => { const el = ref.current; if (el) setLong(el.scrollHeight > el.clientHeight + 4 || open); }, [text, open]);
  if (!text.trim()) return <p className="gc-prompt gc-prompt-none" aria-hidden />;
  return <div className={`gc-prompt gc-prompt-ro${open ? ' open' : ''}`} data-testid="gc-prompt">
    {linked && <small className="gc-linked" data-testid="gc-linked-prompt">From a note</small>}
    <p ref={ref} className="nf-prompt-line">{text}</p>
    {(long || open) && <button type="button" className="gc-more" data-card-control aria-expanded={open} data-testid="gc-prompt-more" onClick={() => setOpen(o => !o)}>{open ? 'Less' : 'More'}</button>}
  </div>;
}

/** The run's one status line ("Loading the model · ~10 min") and the thin bar on the picture's bottom edge. */
function RunLine({ job }: { job: JobState }) {
  const pr = progressOfJob(job); const eta = etaText(pr.etaSeconds);
  return <div className="gc-row gc-row-run" data-testid="gc-run-line" role="status"><i className="nf-dot" aria-hidden /><b>{progressLabel(pr)}</b>{eta && <span className="gc-run-eta">{eta}</span>}</div>;
}
function MediaBar({ job }: { job: JobState }) {
  const fill = overallFill(progressOfJob(job));
  return <span className={`nf-mbar${fill == null ? ' ind' : ''}`} aria-hidden><i style={fill == null ? undefined : { width: `${Math.max(3, Math.round(fill * 100))}%` }} /></span>;
}

/** Failed: one calm line and Retry (the reason sits in the picture box). */
function FailFoot({ shape, job }: { shape: GenCardShape; job: JobState }) {
  const editor = useEditor(); const toast = useToast(); const [busy, setBusy] = useState(false); const v = useFailView(job);
  const back = shape.props.takes.length > 0;
  return <div className="gc-failfoot"><small data-testid="gc-fail-charge">{v.charge}</small>
    {back && <button type="button" className="nf-retry gc-back" data-testid="gc-back-version" {...tip('Show the versions you already have')} onClick={() => editor.run(() => editor.updateShape({ id: shape.id, type: GEN_TYPE, props: { status: 'done', error: '' } } as any), { history: 'ignore' })}>Versions</button>}
    <button type="button" className="nf-retry" data-testid="gc-retry" disabled={busy} onClick={() => { setBusy(true); void retryCard(editor, shape.id).then(() => toast('Trying again with the same settings')).catch(e => toast((e as Error).message, 'error')).finally(() => setBusy(false)); }}><Ic.RetryIcon size={14} />{busy ? 'Starting…' : 'Retry'}</button></div>;
}
