/**
 * The poster card (2026-11-06, Canvas release 1, Option C with T1 soft scrims; React Flow engine only, tldraw keeps today's cards).
 * The picture IS the card. On it, over two light scrims that sit only where text does:
 *   top: the auto title (double-click renames) and the workflow line, the status ring on the right;
 *   bottom: the take dots (Claude's review as a small dot above a take dot) on the left, the price chip on the right.
 * Hover lifts the take dots into a filmstrip (a review badge on each thumbnail; hover a badge for the reason) and shows the port labels.
 * Selecting the card opens the side inspector (CardPanel's inspector variant): the board stays pictures.
 * States: draft (the prompt as the poster, inputs as chips, dashed when missing, model, price, Go), queued, running (% + ring + thin bar),
 * failed (why, whether money moved, fix buttons), outdated (only when a card carries the data: meta.outdatedWhy), audio (waveform),
 * 3D (its turntable poster). Runs, picks and prices go through the same code as every other card (nodeRun.submit, genRun, GenPrice).
 */
import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useBoardApi, useValue, takePeekAtom, type BoardApi, type BoardNode, type NodeId } from '../boardApi';
import type { JobState } from '../../api';
import { gridSrc } from '../../shared/thumbs';
import { GenPrice } from '../../shared/GenPrice';
import { shownCredits } from '../../shared/quote';
import { isDemoQuote } from '../../../../server/src/shared/flowPrice';
import { useToolQuote } from '../../shared/useToolQuote';
import { useFailView, FailActions } from '../../shared/FailureState';
import { useExclusivePlayback } from '../../shared/audioPlayer';
import { useToast } from '../../shared/Toast';
import { tip } from '../../shared/Tooltip';
import { progressOfJob, overallFill, etaText } from '../../shared/queueActivity';
import { timesQuote } from '../../../../server/src/shared/swatchBatch';
import { badgeText } from '../../../../server/src/shared/takeReview';
import { useCatalog } from '../catalog';
import { GEN_TYPE, RESULT_TYPE, nodeDefOf } from '../nodeTypes';
import { batchOf, type GenCardProps, type Take } from '../cardModel';
import { cardState, modelNameOf, missingOf } from '../cardState';
import { promptSourcesInto } from '../graph';
import { liveJobs, retryCard } from '../genRun';
import { submit } from '../agentApi';
import { dropKindAtom } from './portDrop';
import { lockOfQuote, PriceChangedError } from '../priceLock';
import { askConfirm } from '../../shared/Dialog';
import { chooseForSlot } from '../CardInputs';
import { CardName } from '../CardName';
import { RUN_EVT, open3d } from '../canvasEvents';
import { portDragAtom } from '../nodeFrameModel';
import { usePortDrag } from '../NodeFrame';
import { perfOff } from '../CameraMotion';
import { placeWord, failHeadline, autoTitle } from '../cardLook';
import { titleOf } from '../cardTitle';
import { PORT_WORDS, type PortKind } from '../nodeLogic';
import { posterMedia, noteRatio, toneOf, type Tone } from './poster';
import { posterPorts, POSTER_PORT_GAP, type PosterPort } from './posterPorts';
import { outKindOfShape } from '../ports';
import './poster.css';

const KIND_NAME: Record<string, string> = { image: 'Picture', video: 'Clip', audio: 'Sound', text: 'Text', '3d': '3D model' };
const stubJob = (p: GenCardProps, status = 'queued'): JobState => ({ id: p.jobId, toolId: '', status, stage: status, progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: status === 'failed' ? p.error || 'The run failed.' : null, warnings: [], parentId: null, input: { prompt: p.prompt } } as any);
const ord = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? `${n}th` : `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`);

/** The status ring, top right: draft (empty), queued (dashed, place in line), running (progress), done (check), failed (!), outdated (↻). */
export function StatusRing({ state, pct, place }: { state: 'draft' | 'queued' | 'running' | 'done' | 'failed' | 'outdated'; pct?: number | null; place?: number | null }) {
  const label = state === 'draft' ? 'Draft: not run yet' : state === 'queued' ? `Queued${place ? `, ${ord(place)} in line` : ''}` : state === 'running' ? `Running${pct != null ? `, ${pct}%` : ''}` : state === 'done' ? 'Done' : state === 'failed' ? 'Didn’t work' : 'Outdated: an input changed';
  const r = 13, c = 2 * Math.PI * r;
  return <span className={`pc-ring pc-ring-${state}`} role="img" aria-label={label} {...tip(label)} data-testid="pc-ring" data-state={state}>
    <svg viewBox="0 0 32 32" aria-hidden>
      <circle className="pc-ring-bg" cx="16" cy="16" r={r} />
      {state === 'running' && <circle className="pc-ring-fg" cx="16" cy="16" r={r} strokeDasharray={`${(c * Math.max(4, pct ?? 8)) / 100} ${c}`} transform="rotate(-90 16 16)" />}
      {state === 'done' && <path className="pc-ring-ic" d="M10.5 16.5l3.6 3.4 7.4-7.8" />}
      {state === 'outdated' && <path className="pc-ring-ic" d="M21.5 13.2a6.2 6.2 0 1 0 .6 5.2M21.8 9.6v3.8h-3.8" />}
    </svg>
    {state === 'running' && <b>{pct ?? ''}</b>}{state === 'queued' && <b>{place ? ord(place) : '…'}</b>}{state === 'failed' && <b>!</b>}
  </span>;
}

/** The price chip ("$0.03", "$0.03 × 4", "Free" in green on this computer); `null` quote shows nothing. */
export function PriceChip({ q, calls = 1, text }: { q: any; calls?: number; text?: string | null }) {
  if (!q && !text) return null; const key = !!q && q.needsKey === true && q.runnable === false; const cr = q ? shownCredits(q) : null;
  /* a sample (free sample mode, the try site) says "Sample", like the Group's header and the dock (flowPrice.isDemoQuote): never "Free" */
  const demo = !key && isDemoQuote(q); const free = !key && !demo && (cr === 0 || placeWord(q) === 'Your computer');
  return <span className={`pc-chip pc-price${free ? ' free' : ''}`} data-testid="pc-price">{text && !q ? text : <GenPrice q={q} demo={demo} free={free} credits={key || free ? null : cr} calls={calls} text={key ? 'Needs a key' : free ? 'Free' : null} />}</span>;
}

/** Take dots: the active one a wide orange pill; Claude's review a tiny green / amber dot above its take. */
function TakeDots({ takes, take }: { takes: Take[]; take: number }) {
  const n = takes.length; if (n < 2 && !takes[0]?.review) return null; const shown = n > 6 ? 5 : n;
  return <span className="pc-dots" aria-label={`Version ${take + 1} of ${n}`} data-testid="pc-dots">
    {takes.slice(0, shown).map((t, k) => <i key={k} className={`${k === take ? 'on' : ''}${t.review ? ` rv-${t.review.verdict}` : ''}`} />)}
    {n > shown && <small>+{n - shown}</small>}
  </span>;
}
/** The filmstrip a hovered card lifts its dots into: thumbnails (click to pick the one that goes on), Claude's ✓ / ! badge on each, the
 *  reason on the badge's tooltip; "+N" past four. Hovering a thumbnail shows it on the card. */
function Filmstrip({ board, id, takes, take }: { board: BoardApi; id: NodeId; takes: Take[]; take: number }) {
  const n = takes.length; const max = n > 4 ? 3 : 4; const shown = takes.slice(0, max);
  const pick = (k: number) => board.batch(() => board.patchNode(id, { props: { take: k, ratio: 0 } } as any), { history: 'ignore' });
  const peek = (k: number | null) => takePeekAtom.set(k == null ? null : { id, k });
  useEffect(() => () => { if (takePeekAtom.get()?.id === id) takePeekAtom.set(null); }, [id]);
  return <div className="pc-strip" data-card-control role="listbox" aria-label="Versions: the ringed one goes on" data-testid="pc-strip" onPointerLeave={() => peek(null)}>
    {shown.map((t, k) => <button key={`${t.url}-${k}`} type="button" role="option" aria-selected={k === take} className={`pc-tk${k === take ? ' on' : ''}`} data-testid={`pc-take-${k + 1}`}
      onPointerEnter={() => peek(k)} onClick={() => pick(k)} {...tip(k === take ? `Version ${k + 1}: goes to the next card` : `Use version ${k + 1}`)}>
      {t.poster ? <img src={gridSrc(t.poster, 96)} alt="" draggable={false} loading="lazy" /> : <i>{k + 1}</i>}
      {k === take && <em className="pc-pin" aria-hidden>★</em>}
      {t.review && <b className={`pc-rv ${t.review.verdict}`} data-testid={`pc-review-${k + 1}`} aria-label={badgeText(t.review)} {...tip(badgeText(t.review))}>{t.review.verdict === 'fits' ? '✓' : '!'}</b>}
    </button>)}
    {n > max && <button type="button" className="pc-tk pc-more" onClick={() => board.select([id])} {...tip(`All ${n} versions are in the panel`)}>+{n - max}</button>}
  </div>;
}

/** A sound's poster: a waveform (drawn from its address, the same every time) and a play button. */
function Wave({ url, k }: { url: string; k: string }) {
  const bars = useRef<number[]>([]); if (!bars.current.length) { let h = 2166136261; for (const ch of url) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    for (let i = 0; i < 46; i++) { h = Math.imul(h ^ (h >>> 13), 1274126177); const v = ((h >>> 0) % 1000) / 1000; bars.current.push(0.22 + 0.78 * Math.abs(Math.sin(i * 0.55 + v * 2.2)) * (0.55 + v * 0.45)); } }
  const a = useRef<HTMLAudioElement>(null); const [on, setOn] = useState(false); useExclusivePlayback(a);
  return <div className="pc-wave" data-k={k}>
    <span className="pc-bars" aria-hidden>{bars.current.map((v, i) => <i key={i} style={{ height: `${Math.round(v * 100)}%` }} />)}</span>
    <button type="button" className="pc-play" data-card-control aria-label={on ? 'Pause' : 'Play'} onClick={() => { const e = a.current; if (!e) return; if (e.paused) void e.play().catch(() => undefined); else e.pause(); }}>
      {on ? <svg viewBox="0 0 16 16" aria-hidden><path d="M5 3.5h2v9H5zM9 3.5h2v9H9z" /></svg> : <svg viewBox="0 0 16 16" aria-hidden><path d="M5.5 3.5v9l7-4.5z" /></svg>}</button>
    <audio ref={a} src={url} preload="none" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)} />
  </div>;
}

/** The picture (or clip, sound, 3D poster) filling the card. A clip plays muted while hovered (zoomed in only). */
function Media({ n, m, hot, w, onTone }: { n: BoardNode; m: { kind: string; url: string; poster: string; jobId: string }; hot: boolean; w: number; onTone: (t: Tone | null) => void }) {
  const board = useBoardApi(); const near = useValue('pc near', () => board.zoom() > 0.5, [board]);
  const learn = (e: React.SyntheticEvent<HTMLImageElement>) => { const i = e.currentTarget; if (!i.naturalWidth) return; onTone(toneOf(i));
    if (n.type === GEN_TYPE) { if (!(Number((n.props as any).ratio) > 0)) board.batch(() => board.patchNode(n.id, { props: { ratio: Math.round((i.naturalWidth / i.naturalHeight) * 1000) / 1000 } } as any), { history: 'ignore' }); }
    else noteRatio(m.poster || m.url, i.naturalWidth, i.naturalHeight); };
  if (m.kind === 'audio') return <Wave url={m.url} k={n.id} />;
  const src = m.poster || (m.kind === 'image' ? m.url : '');
  return <>
    {src ? <img className="pc-img" src={gridSrc(src, Math.min(1200, Math.round(w * 2)))} alt="" draggable={false} onLoad={learn} data-testid="pc-img" />
      : m.kind === 'video' ? <video className="pc-img" src={m.url} muted playsInline preload="metadata" onLoadedMetadata={(e) => { const v = e.currentTarget; if (n.type !== GEN_TYPE) noteRatio(m.url, v.videoWidth, v.videoHeight); }} /> : <i className="pc-img pc-noimg" />}
    {m.kind === 'video' && hot && near && !perfOff() && <video className="pc-img pc-live" src={m.url} muted loop autoPlay playsInline aria-hidden />}
    {m.kind === '3d' && <button type="button" className="pc-chip pc-3d" data-card-control onClick={() => m.jobId && open3d(m.jobId)} disabled={!m.jobId}>↻ Turn in 3D</button>}
  </>;
}

/** The input and output dots. Labels show on hover, when selected, or while a link is being dragged (poster.css). */
function Ports({ id, type, ports, out, linkedOut, dragKind }: { id: NodeId; type: string; ports: PosterPort[]; out: PortKind | null; linkedOut: boolean; dragKind: string | null }) {
  const { beginDrag, ghost } = usePortDrag(id, type, out); const src = useValue('pc drag src', () => portDragAtom.get()?.fromId === id, [id]);
  const def = nodeDefOf(type); const n = ports.length;
  /* a file or an Assets item dragged over the board: the ports that can take it glow, the others go quiet (release 1) */
  const fileKinds = useValue('pc drop kinds', () => dropKindAtom.get()?.kinds ?? [], []);
  return <>
    {ports.map((p, i) => <span key={p.key} className={`pc-port pc-in k-${p.kind}${p.filled ? ' filled' : ''}${dragKind === p.kind || fileKinds.includes(p.kind as any) ? ' want' : ''}${fileKinds.length && !fileKinds.includes(p.kind as any) ? ' quiet' : ''}`} style={{ top: `calc(50% + ${(i - (n - 1) / 2) * POSTER_PORT_GAP}px)` }}
      data-card-control data-kind={p.kind} data-slot={p.key === 'prompt' ? undefined : p.key} data-label={p.label} data-testid={`port-in-${p.kind}`} {...tip(p.filled ? `${p.label}: wired in` : `${p.label}: takes ${PORT_WORDS[p.kind]}${p.optional ? ' (optional)' : ''}`)}>
      <i /><span className="pc-pl">{p.label}{p.optional && <em> optional</em>}</span></span>)}
    {def?.output && out && <span className={`pc-port pc-out k-${out}${linkedOut ? ' filled' : ''}`} role="button" tabIndex={-1} data-card-control data-kind={out} data-testid={`port-out-${out}`}
      aria-label={`${KIND_NAME[out]} out: drag onto another card`} onPointerDown={beginDrag}><i /><span className="pc-pl">{KIND_NAME[out]}</span></span>}
    {src && ghost}
  </>;
}

/** One poster card (generate, result, or upload with a file). */
export const PosterCard = memo(function PosterCard({ id, selected, w }: { id: NodeId; selected: boolean; w: number }) {
  const board = useBoardApi(); const cat = useCatalog(); const toast = useToast();
  const n = useValue('pc node', () => board.getNode(id), [board, id]);
  const dragKind = useValue('pc drag kind', () => portDragAtom.get()?.kind ?? null, []);
  const role = useValue('pc drag role', () => { const d = portDragAtom.get(); if (!d) return ''; if (d.fromId === id) return 'src'; return d.targetId === id ? 'drop' : d.legal.includes(id) ? 'ok' : 'dim'; }, [id]);
  const peekK = useValue('pc peek', () => { const v = takePeekAtom.get(); return v && v.id === id ? v.k : -1; }, [id]);
  const head = useValue('pc title', () => { const s = board.getNode(id); return s ? titleOf(board, s) : { title: '', flowName: '' }; }, [board, id, cat]);
  const st = useValue('pc state', () => { const s = board.getNode(id); return s && s.type === GEN_TYPE ? cardState(board, s, cat) : null; }, [board, id, cat, n?.props]);
  const ports = useValue('pc ports', () => { const s = board.getNode(id); return s ? posterPorts(board, s, cat) : []; }, [board, id, cat]);
  const linkedOut = useValue('pc out linked', () => board.linksFrom(id).length > 0, [board, id]);
  const linkedText = useValue('pc linked prompt', () => promptSourcesInto(board, id).map((x) => x.text).join('\n\n'), [board, id]);
  const p: any = n?.props ?? {}; const gen = n?.type === GEN_TYPE;
  const job = useValue('pc job', () => (gen && p.jobId ? liveJobs.get()[p.jobId] : undefined), [gen, p.jobId]);
  const spec = st?.spec ?? null; const draft = gen && p.status === 'draft';
  const q1 = useToolQuote(spec && draft ? spec.tool.id : null, spec?.provider ?? '', spec?.quote ?? {});
  const nSw = spec ? batchOf(spec.slots, st?.bySlot ?? {})?.inputs.length ?? 1 : 1; const qDraft = nSw > 1 ? timesQuote(q1, nSw) : q1;
  const [busy, setBusy] = useState(false); const [hot, setHot] = useState(false); const hotT = useRef(0); const [tone, setTone] = useState<Tone | null>(null);
  /* the same run as everywhere: a fresh quote, then the jobs API (nodeRun.submit); what's missing comes back in its words */
  /* release 1, price lock: Go holds the run to the price this card shows; a rise of 10% or more, or another model or place, asks first */
  const shownQuote = gen ? (p.status === 'draft' ? qDraft : p.quote) : null;
  const go = async () => { if (busy || !gen || p.status === 'running') return; setBusy(true);
    try { await submit(board, id, { lock: lockOfQuote(shownQuote) }); }
    catch (e: any) {
      if (e instanceof PriceChangedError) { const fresh = lockOfQuote(e.fresh);
        const yes = fresh && await askConfirm({ title: e.reason === 'route' ? 'The model or place changed' : 'The price went up', body: [`${e.message}.`, 'Nothing was charged.'], confirm: `Run it for $${(fresh.usd ?? 0).toFixed(2)}`, cancel: 'Not now' });
        if (yes) { try { await submit(board, id, { lock: fresh }); } catch (e2: any) { toast(e2?.message ?? 'That didn’t start.', 'error'); } } return; }
      toast(e?.issues?.[0]?.message ?? e?.message ?? 'That didn’t start.', 'error'); board.select([id]); }
    finally { setBusy(false); } };
  const goRef = useRef(go); goRef.current = go;
  useEffect(() => { if (!gen) return; const f = (e: Event) => { if ((e as CustomEvent).detail?.cardId === id) void goRef.current(); }; addEventListener(RUN_EVT, f); return () => removeEventListener(RUN_EVT, f); }, [gen, id]);
  /* far off screen: an empty shell (as NodeFrame does), so a 300-card board only mounts what is near the view */
  const offscreen = useValue('pc offscreen', () => { if (perfOff()) return false; const b = board.boundsOf(id); if (!b) return false; const v = board.viewportBounds();
    return (b.maxX < v.minX - v.w || b.minX > v.maxX + v.w || b.maxY < v.minY - v.h || b.minY > v.maxY + v.h) && !board.selection().includes(id); }, [board, id]);
  if (!n) return null;
  if (offscreen) return <div className="pc pc-shell" data-shape-id={id} aria-hidden />;

  const out = outKindOfShape(n) as PortKind | null; const medium = gen ? p.medium : n.type === RESULT_TYPE ? p.kind : p.mediaKind || 'image';
  const m = posterMedia(n, peekK); const running = gen && p.status === 'running';
  const pr = running ? progressOfJob(job ?? stubJob(p)) : null; const queued = running && (job?.status === 'queued' || pr?.stage === 'queued');
  const fill = pr ? overallFill(pr) : null; const pct = fill != null ? Math.max(1, Math.round(fill * 100)) : null;
  const outdated = typeof (n.meta as any)?.outdatedWhy === 'string' && (n.meta as any).outdatedWhy.trim() ? String((n.meta as any).outdatedWhy).trim() : '';
  const state = !gen ? 'done' : draft ? 'draft' : queued ? 'queued' : running ? 'running' : p.status === 'failed' ? 'failed' : outdated ? 'outdated' : 'done';
  const takes: Take[] = gen ? p.takes ?? [] : []; const take = Math.max(0, Math.min(p.take ?? 0, takes.length - 1));
  const model = gen ? (draft ? modelNameOf(spec) || p.model : p.model || modelNameOf(spec)) : n.type === RESULT_TYPE ? p.model : '';
  const sub = gen ? [head.flowName, draft ? model : takes.length > 1 ? `${takes.length} takes` : model].filter(Boolean).join(' · ')
    : n.type === RESULT_TYPE ? [head.flowName, p.model].filter(Boolean).join(' · ') : `Upload · ${String(p.label || 'file')}`;
  const quote = gen ? (draft ? qDraft : p.quote) : null; const calls = gen && !draft && Number(p.quote?.runs) > 1 ? Number(p.quote.runs) : 1;
  const priceText = n.type === RESULT_TYPE ? String(p.price || '') || null : null;
  const picture = !!m && state !== 'draft';
  const hotNow = hot || selected; const lab = hotNow || role === 'src'; /* while a link is dragged only the ports that can take it show (poster.css) */
  const enter = () => { window.clearTimeout(hotT.current); setHot(true); }; const leave = () => { window.clearTimeout(hotT.current); hotT.current = window.setTimeout(() => setHot(false), 150); };
  const cls = `pc pc-${state} pc-m-${medium}${selected ? ' sel' : ''}${hotNow ? ' hot' : ''}${lab ? ' labels' : ''}${picture ? ' has-pic' : ''}${role ? ` r-${role}` : ''}`;
  const shot = String((n.meta as any)?.name ?? '').trim();

  let body: ReactNode = null;
  if (state === 'draft') {
    const prompt = linkedText || p.prompt; const missing = missingOf(spec, st?.bySlot ?? {}, prompt);
    const chips = (spec?.slots ?? []).map((s) => { const got = st?.bySlot[s.name] ?? [];
      return got.length ? <span key={s.name} className="pc-ich" {...tip(`${s.label}: ${got.map((i) => i.label).join(', ')}`)}>{got[0].poster ? <img src={gridSrc(got[0].poster, 48)} alt="" /> : <i className={`k-${got[0].kind}`} />}{got.length > 1 ? `${s.label} ×${got.length}` : s.label}</span>
        : <button key={s.name} type="button" className={`pc-ich need${s.required ? ' req' : ''}`} data-card-control onClick={() => spec && chooseForSlot(board, id, s, toast, 0)} {...tip(s.hint || s.missing)}>+ {s.label}</button>; });
    body = <>
      <div className="pc-draftbg" aria-hidden />
      <div className="pc-dq" data-testid="pc-prompt">{prompt.trim() ? <p>{prompt}</p> : spec?.promptMode === 'hidden' ? <p className="pc-dq-soft">{spec.flow.tagline ?? 'Works from its inputs.'}</p> : <p className="pc-dq-soft">Write a prompt in the panel…</p>}</div>
      <div className="pc-draftfoot">
        {chips.length > 0 && <div className="pc-chips">{chips}</div>}
        <div className="pc-gorow"><span className="pc-model" {...tip(model)}>{model || 'Model'}</span><PriceChip q={quote} calls={1} />
          <button type="button" className="pc-go" data-card-control data-testid="pc-go" disabled={busy || !spec} onClick={() => void go()} {...tip(missing ? `${missing} first` : 'Run it (Enter)')}><svg viewBox="0 0 12 12" aria-hidden><path d="M3 2v8l7-4z" /></svg>{busy ? 'Starting' : 'Go'}</button></div>
      </div></>;
  } else {
    const backdrop = m ? m.poster || (m.kind === 'image' ? m.url : '') : (st?.inputs.find((i) => i.poster)?.poster ?? '');
    body = <>
      <div className="pc-pic">{m && state !== 'running' && state !== 'queued' ? <Media n={n} m={m} hot={hot} w={w} onTone={setTone} /> : backdrop ? <i className="pc-blur" style={{ backgroundImage: `url("${gridSrc(backdrop, 320)}")` } as CSSProperties} /> : <i className="pc-blank" />}</div>
      {(state === 'running' || state === 'queued') && <div className="pc-mid" role="status" data-testid="pc-running">
        {queued ? <><b className="pc-big pc-big-s">Queued</b><small>{pr?.queuePosition ? `${ord(pr.queuePosition)} in line` : 'Waiting to start'}</small></>
          : <><b className="pc-big">{pct != null ? `${pct}%` : 'Starting'}</b><small>{etaText(pr?.etaSeconds) ? `about ${etaText(pr?.etaSeconds).replace('~', '')} left` : 'Working on it'}</small></>}</div>}
      {state === 'failed' && <Failed n={n} job={job ?? stubJob(p, 'failed')} />}
      {running && !queued && <span className={`pc-bar${fill == null ? ' ind' : ''}`} aria-hidden><i style={fill == null ? undefined : { width: `${Math.max(3, pct ?? 3)}%` }} /></span>}
      {outdated && <span className="pc-tag warn" data-testid="pc-outdated">↻ {outdated}</span>}
    </>;
  }

  return <div className={cls} data-shape-id={id} data-testid="poster-card" data-status={state} data-node-type={n.type} data-medium={medium} data-tone-top={picture && state !== 'failed' ? tone?.top : undefined} data-tone-bottom={picture ? tone?.bottom : undefined} onPointerEnter={enter} onPointerLeave={leave}>
    <div className="pc-clip">
      {body}
      {picture && <><i className="pc-scr-t" aria-hidden />{(takes.length > 1 || !!quote || !!priceText) && <i className="pc-scr-b" aria-hidden />}</>}
    </div>
    <header className="pc-head">
      <div className="pc-t"><CardName id={id} name={shot} shown={head.title} className="pc-name" testId="pc-title" /><small title={sub}>{sub}</small></div>
      {(gen || n.type === RESULT_TYPE) && <StatusRing state={state as any} pct={pct} place={pr?.queuePosition ?? null} />}
    </header>
    {state !== 'draft' && <footer className="pc-foot">
      <span className="pc-fl">{gen && takes.length > 0 && (hotNow && takes.length > 1 ? <Filmstrip board={board} id={id} takes={takes} take={take} /> : <TakeDots takes={takes} take={take} />)}</span>
      <span className="pc-fr">{state === 'outdated' ? <button type="button" className="pc-go" data-card-control onClick={() => void go()}><span aria-hidden>↻</span> Rerun<PriceChip q={quote} /></button>
        : (state !== 'failed' || !hotNow) && <PriceChip q={quote} calls={calls} text={priceText} />}</span>
    </footer>}
    <Ports id={id} type={n.type} ports={ports} out={out} linkedOut={linkedOut} dragKind={dragKind} />
  </div>;
});

/** Failed: why, whether money moved, and the fixes (the shared FailActions), plus Edit (the panel). */
function Failed({ n, job }: { n: BoardNode; job: JobState }) {
  const board = useBoardApi(); const toast = useToast(); const v = useFailView(job); const p: any = n.props;
  /* the reason is the heading; the shared wording only when the run left none (user, 6 Nov) */
  const why = failHeadline(p.error);
  return <div className="pc-mid pc-failwrap"><div className="pc-fail" data-testid="pc-failed" data-card-control>
    <b data-testid="pc-fail-head"><span aria-hidden>!</span> {why ? why.head : v.title}</b>
    {(why ? why.rest : v.line) && <p>{why ? why.rest : v.line}</p>}
    {v.charge && <p className="pc-charge" data-testid="pc-fail-charge">{v.charge}</p>}
    <div className="pc-fixes">
      {p.jobId ? <FailActions job={job} view={v} max={1} compact skip={['details' as any]} onRetry={() => void retryCard(board, n.id).then(() => toast('Trying again with the same settings')).catch((e) => toast((e as Error).message, 'error'))} />
        : <button type="button" className="pc-go" onClick={() => void submit(board, n.id).catch((e) => toast((e as Error).message, 'error'))}>Try again</button>}
      <button type="button" className="pc-ghost" onClick={() => board.select([n.id])}>Edit</button>
    </div>
  </div></div>;
}

/** A Prompt or Note card as a poster (user, 6 Nov): its text is the picture, in big type on a softly tinted ground (a prompt warm orange,
 *  a note soft yellow), the same family as a draft. Double-click the text to edit it in place (selecting it also opens it in the panel). */
export const TextPoster = memo(function TextPoster({ id, selected, kind }: { id: NodeId; selected: boolean; kind: 'prompt' | 'note' }) {
  const board = useBoardApi(); const n = useValue('tp node', () => board.getNode(id), [board, id]);
  const feeds = useValue('tp feeds', () => board.linksFrom(id).length, [board, id]);
  const [edit, setEdit] = useState(false); const [hot, setHot] = useState(false);
  if (!n) return null;
  const text = String((n.props as any).text ?? ''); const shot = String((n.meta as any)?.name ?? '').trim();
  const title = autoTitle({ kind: 'other', name: shot, prompt: text }) === 'Card' ? (kind === 'note' ? 'Note' : 'Prompt') : autoTitle({ kind: 'other', name: shot, prompt: text });
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const sub = [kind === 'note' ? 'Note' : 'Prompt', words ? `${words} word${words === 1 ? '' : 's'}` : '', feeds ? `feeds ${feeds} card${feeds === 1 ? '' : 's'}` : kind === 'note' ? 'can feed a prompt' : ''].filter(Boolean).join(' · ');
  const size = text.length <= 60 ? 'l' : text.length <= 170 ? 'm' : 's';
  const set = (t: string) => board.batch(() => board.patchNode(id, { props: { text: t } } as any), { history: 'ignore' });
  return <div className={`pc pc-text pc-k-${kind}${selected ? ' sel' : ''}${hot || selected ? ' hot labels' : ''}`} data-shape-id={id} data-testid="text-poster" data-kind={kind}
    onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}>
    <div className="pc-clip"><div className="pc-textbg" aria-hidden /></div>
    <header className="pc-head"><div className="pc-t"><CardName id={id} name={shot} shown={title} className="pc-name" testId="tp-title" /><small>{sub}</small></div></header>
    <div className={`pc-dq pc-dq-${size}`} onDoubleClick={(e) => { e.stopPropagation(); setEdit(true); }} data-testid="tp-text">
      {edit ? <textarea className="pc-tedit nodrag nowheel" autoFocus defaultValue={text} data-card-control data-testid="tp-edit" aria-label={kind === 'note' ? 'Note' : 'Prompt'}
          onFocus={(e) => { const t = e.currentTarget; t.setSelectionRange(t.value.length, t.value.length); }} onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') e.currentTarget.blur(); }} onKeyUp={(e) => e.stopPropagation()} onBlur={() => setEdit(false)} />
        : text.trim() ? <p>{text}</p> : <p className="pc-dq-soft">Double-click to write {kind === 'note' ? 'a note' : 'a prompt'}</p>}
    </div>
    <Ports id={id} type={n.type} ports={[]} out={'text'} linkedOut={feeds > 0} dragKind={null} />
  </div>;
});
