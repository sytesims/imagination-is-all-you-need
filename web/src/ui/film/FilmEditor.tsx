/**
 * One film (/film/:id): header (title, shape, length, spend), the picked card's preview above the running order, beside its inspector.
 * The shot row keeps "+" and transition controls (Continue · Bridge · Add shot); sound and finishing sit below it. Edits go to the server as ops on the film's revision
 * (filmApi.applyOps), shown at once and replaced by the server's answer; ops run one at a time so revisions never cross.
 * While a card is queued or generating, the film is re-read every few seconds. Rough cut is the server's quick low-quality join
 * (POST …/preview, not a job); Stitch is the full free one (POST …/stitch → Assets).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ToolInfo } from '../../api';
import { Link, navigate } from '../../platform/router';
import { useToast } from '../../shared/Toast';
import { Popover } from '../../shared/Popover';
import { pickMedia } from '../../shared/MediaPicker';
import { libraryUrlOf } from '../../shared/libraryFiles';
import { uploadMedia } from '../../shared/batch1';
import { VideoThumb } from '../../shared/VideoThumb';
import { GenPrice } from '../../shared/GenPrice';
import AudioCard from '../../shared/AudioCard';
import { MissingMedia } from '../../shared/ResultViewer';
import { tip } from '../../shared/Tooltip';
import { useSetupKind, type SetupKind } from '../../shared/ConnectSheet';
import { modelsOf, modelOfEngine, shownName, RUN_ON_CHIP, useToolModels } from '../../shared/models';
import { audioRoute } from '../../../../server/src/shared/audioWorkflows';
import { PlusIcon, ChevronRightIcon, AlertIcon, PlayIcon, MusicIcon, MicIcon, SoundIcon, StitchIcon, LastFrameIcon, TransitionIcon, CloseIcon } from '../Icons';
import { getFilm, applyOps, stitchFilm, previewFilm, filmOf, listSamples, openSample, deleteFilm, branded } from './filmApi';
import { FilmStart } from './FilmStart';
import { activeTake, latestTake, playable, fullLen, playLen, totalLen, clockOf, secText, usdText, shotLabels, STATUS_WORD, isBusy, isTrimmed, newShot, moveId, applyLocal, stitchNote, startUrl, startSourceOf, inFilm, cutLen, FILM_VIDEO_TOOL, MAX_SHOTS, creditText, creditCard, identCard, isAutoCredit, cutModelKeys, IDENT_TEXT, CARD_MAX, worldNotesOf, withWorldNotes, WORLD_MAX, budgetOf, parseBudget, filmKeyOf, newestDoneTake, SHORTCUTS, missingOf, blockReason, type BudgetView } from './filmLogic';
import { SwitchRow } from '../../shared/SettingChip';
import { FILM_ASPECTS, type FilmAudio, type FilmCard, type FilmOp, type FilmProject, type FilmShot, type AudioKind, type FilmSample } from './types';
import FilmInspector, { FILM_AGAIN_EVENT, useShotQuote } from './FilmInspector';
import { GapChip, continueAfter, joinBlock, likeShot, type JoinCtx } from './GapChip';

const POLL_MS = 3000;

/** The film document with one-at-a-time ops: `film` shows edits at once, `srv` is the server's last answer (quotes read it). */
function useFilmDoc(id: string) {
  const [film, setFilm] = useState<FilmProject | null>(null); const [srv, setSrv] = useState<FilmProject | null>(null); const [err, setErr] = useState<any>(null);
  const srvRef = useRef<FilmProject | null>(null); const queue = useRef<Promise<unknown>>(Promise.resolve()); const pending = useRef(0); const toast = useToast();
  const take = useCallback((f: FilmProject) => { srvRef.current = f; setSrv(f); if (!pending.current) setFilm(f); }, []);
  const reload = useCallback(() => getFilm(id).then(take).catch(e => setErr(e)), [id, take]);
  useEffect(() => { void reload(); }, [reload]);
  const commit = useCallback((ops: FilmOp[]) => {
    setFilm(f => f ? applyLocal(f, ops) : f); pending.current++;
    queue.current = queue.current.then(async () => { const base = srvRef.current; if (!base) return; try { const f = await applyOps(base, ops); pending.current--; take(f); }
      catch (e: any) { pending.current--; toast(`That change didn’t save. ${e?.message ?? ''}`.trim(), 'error'); setFilm(srvRef.current); await reload(); } });
    return queue.current;
  }, [take, reload, toast]);
  /* a server answer that carries the film (render, bridge) */
  const adopt = useCallback((d: any) => { const f = filmOf(d); if (f) take(f); else void reload(); }, [take, reload]);
  const busy = !!film?.shots.some(isBusy);
  useEffect(() => { if (!busy) return; const t = setInterval(() => { if (!pending.current) void reload(); }, POLL_MS); return () => clearInterval(t); }, [busy, reload]);
  return { film, srv, err, reload, commit, adopt };
}

/** A picked library file → its URL (an upload from the computer is stored first). */
export async function fileUrl(f: File): Promise<string> { return libraryUrlOf(f) ?? (await uploadMedia([f]))[0].url; }

export default function FilmEditor({ id, tools }: { id: string; tools: ToolInfo[] }) {
  const workspace = useRef<HTMLDivElement>(null);
  /* Measure the real shell: the announcement, offline notice and mobile header can change height. */
  useLayoutEffect(() => {
    const el = workspace.current; if (!el) return;
    const measure = () => el.style.setProperty('--fm-top', `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    measure(); const ro = new ResizeObserver(measure);
    document.querySelectorAll('.app > :not(main)').forEach(x => ro.observe(x));
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  });
  const { film, srv, err, reload, commit, adopt } = useFilmDoc(id); const toast = useToast();
  const [sel, setSel] = useState<string | null>(null); const [rough, setRough] = useState<Rough | null>(null);
  const [gap, setGap] = useState<string | null>(null); const [help, setHelp] = useState(false);
  useFilmKeys({ film, sel, setSel, setGap, setHelp, commit, adopt, toast });
  useToolModels(FILM_VIDEO_TOOL); const setup = useSetupKind();
  const tool = tools.find(t => t.id === FILM_VIDEO_TOOL) ?? null; const dm = modelOfEngine(FILM_VIDEO_TOOL, tool?.providers[0]?.id); const defModel = dm ? shownName(dm) : 'Default model';
  useEffect(() => { if (film && (!sel || !film.shots.some(s => s.id === sel))) setSel(film.shots[0]?.id ?? null); }, [film, sel]);
  if (err) return <div className="fm-page"><p className="fm-empty" role="alert">{err?.status === 404 ? 'This film isn’t here any more.' : 'Couldn’t open this film.'} <Link to="/film" className="fm-link">Back to your films</Link>{err?.status !== 404 && <> · <button type="button" className="fm-link" onClick={() => void reload()}>Try again</button></>}</p></div>;
  if (!film) return <div className="fm-page" aria-busy="true"><div className="fm-skel fm-skel-head" /><div className="fm-skel fm-skel-main" /></div>;
  const shot = film.shots.find(s => s.id === sel) ?? null; const srvShot = srv?.shots.find(s => s.id === sel) ?? null;
  const labels = shotLabels(film.shots);
  const models = cutModelKeys(film).map(k => { const x = k ? modelsOf(FILM_VIDEO_TOOL).find(m => m.key === k) : null; return x ? shownName(x) : k ?? defModel; });
  return <div ref={workspace} className="fm-page fm-editor" data-testid="film-editor">
    <FilmHeader film={film} commit={commit} onHelp={() => setHelp(true)} />
    <div className="fm-stage">
      <div className="fm-center">
      {rough ? <RoughCut r={rough} film={film} labels={labels} onStop={() => setRough(null)} />
        : <Preview shot={shot} label={shot ? labels[film.shots.findIndex(x => x.id === shot.id)] : ''} aspect={film.aspect} />}
      <ShotRow defModel={defModel} setup={setup} film={film} srv={srv} sel={sel} setSel={setSel} commit={commit} adopt={adopt} labels={labels} toast={toast} tools={tools} gap={gap} setGap={setGap} />
      <div className="fm-bottom">
      <details className="fm-sound-panel" name="film-workspace-settings"><summary>Sound <span>Music, voice & sound effects</span></summary><div className="fm-sound-body"><AudioLanes film={film} commit={commit} /></div></details>
      <StitchBar film={film} models={models} commit={commit} adopt={adopt} onRough={setRough} />
      </div>
      </div>
      {shot ? <FilmInspector key={shot.id} film={film} shot={shot} srvShot={srvShot} label={labels[film.shots.findIndex(x => x.id === shot.id)]} tool={tool} commit={commit} adopt={adopt} onSelect={setSel} />
        : <EmptyFilm film={film} onBlank={() => { const s = newShot(); void commit([{ op: 'upsert_shot', shot: s, index: 0 }]); setSel(s.id); }} />}
    </div>
    {help && <ShortcutSheet onClose={() => setHelp(false)} />}
  </div>;
}

const spendTip = (f: FilmProject) => { const s = f.spend; if (!s?.runs) return 'Nothing spent on this film yet.';
  return [`${s.runs} ${s.runs === 1 ? 'run' : 'runs'}: ${usdText(s.countedUsd)} counted`, s.actualRuns ? `${usdText(s.actualUsd)} billed on ${s.actualRuns}` : null, `${usdText(s.quotedUsd)} quoted`, s.sampleRuns ? `${s.sampleRuns} free samples` : null].filter(Boolean).join(' · '); };
function FilmHeader({ film, commit, onHelp }: { film: FilmProject; commit: (o: FilmOp[]) => Promise<unknown>; onHelp: () => void }) {
  const [t, setT] = useState(film.title); useEffect(() => setT(film.title), [film.title]);
  const save = () => { const v = t.trim() || 'Untitled film'; if (v !== film.title) void commit([{ op: 'set_title', title: v }]); else setT(film.title); };
  const n = inFilm(film.shots).length; const hid = film.shots.length - n;
  return <header className="fm-head">
    <Link to="/film" className="fm-back" aria-label="All films"><ChevronRightIcon size={16} /><span>Films</span></Link>
    <input className="fm-title" value={t} title={film.title} onChange={e => setT(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setT(film.title); (e.target as HTMLInputElement).blur(); } }} aria-label="Film title" maxLength={120} data-testid="film-title" />
    <div className="fm-facts" data-testid="film-facts">
      <label className="fm-fact fm-aspect" {...tip('The shape of the film. New takes render at it; Stitch fits every clip to it.')}><span className="sr-only">Shape</span>
        <select value={film.aspect} onChange={e => void commit([{ op: 'set_meta', aspect: e.target.value }])} data-testid="film-aspect">{[...new Set([...FILM_ASPECTS, film.aspect])].map(a => <option key={a} value={a}>{a}</option>)}</select></label>
      <span className="fm-fact">{n} {n === 1 ? 'shot' : 'shots'}{hid ? ` · ${hid} hidden` : ''}</span>
      <span className="fm-fact" {...tip('The planned length of the shots in the film, after trims and crossfades')}>{clockOf(totalLen(film))}</span>
      <BudgetMeter film={film} commit={commit} />
      <WorldNotes film={film} commit={commit} />
      <button type="button" className="fm-fact fm-keys-btn" onClick={onHelp} aria-label="Keyboard shortcuts" data-testid="film-keys" {...tip('Keyboard shortcuts (?)')}>?</button>
    </div>
  </header>;
}

/** World notes: where things are and which way they move ("traffic drives on the right; the shelter is on the right-hand pavement"), kept
 *  with the film and offered under every prompt, so each shot keeps the same geography. */
function WorldNotes({ film, commit }: { film: FilmProject; commit: (o: FilmOp[]) => Promise<unknown> }) {
  const saved = worldNotesOf(film.script.markdown); const [open, setOpen] = useState(false); const [t, setT] = useState(saved); const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) setT(saved); }, [saved, open]);
  const save = () => { if (t.trim() !== saved) void commit([{ op: 'set_meta', script: { markdown: withWorldNotes(film.script.markdown, t) } }]); };
  return <>
    <button ref={btn} type="button" className={`fm-fact fm-world-btn${saved ? ' has' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)} data-testid="film-world" {...tip(saved || 'Where things are and which way they move, for every prompt')}>World notes{saved ? '' : ' +'}</button>
    <Popover open={open} anchor={btn} onClose={() => { save(); setOpen(false); }} label="World notes" placement="bottom" align="end" width={340} testId="film-world-pop">
      <div className="fm-world">
        <label className="fm-field"><span>World notes</span>
          <textarea value={t} rows={4} maxLength={WORLD_MAX} onChange={e => setT(e.target.value)} data-testid="film-world-text"
            placeholder="Traffic drives on the right. The shelter is on the right-hand pavement. The bus leaves to the left." /></label>
        <p className="fm-note">Models place things wherever looks nice. Say where things are once, then add it to each prompt from the shot.</p>
      </div>
    </Popover>
  </>;
}

/** The picked card's active take, played inside its trim (the stitched film uses the same in and out). */
function Preview({ shot, label, aspect }: { shot: FilmShot | null; label: string; aspect: string }) {
  const a = shot ? activeTake(shot) : null; const t = playable(a) ? a : null; const v = useRef<HTMLVideoElement>(null); const [gone, setGone] = useState(false);
  useEffect(() => setGone(false), [t?.url]); const full = shot ? fullLen(shot) : null;
  const inS = shot?.trim.inSec ?? 0; const outS = shot?.trim.outSec ?? null;
  const ar = /^(\d+):(\d+)$/.exec(aspect); const style = ar ? { aspectRatio: `${ar[1]} / ${ar[2]}` } : undefined;
  return <section className="fm-preview" aria-label="Preview">
    <div className="fm-screen" style={style}>
      {!shot ? <span className="fm-screen-ph">Your film plays here</span>
        : gone || a?.status === 'missing' ? <MissingMedia />
        : t?.url ? <span className="fm-vwrap" key={t.url}><video ref={v} src={t.url} poster={t.posterUrl ?? undefined} controls playsInline preload="metadata" data-testid="film-preview-video"
            onLoadedMetadata={e => { if (inS > 0) e.currentTarget.currentTime = inS; }} onError={() => setGone(true)}
            onTimeUpdate={e => { const el = e.currentTarget; if (outS != null && el.currentTime >= outS) { el.pause(); el.currentTime = outS; } }} onPlay={e => { const el = e.currentTarget; if (el.currentTime < inS - 0.05 || (outS != null && el.currentTime >= outS - 0.05)) el.currentTime = inS; }} /></span>
        : startUrl(shot) ? <span className="fm-vwrap" key={startUrl(shot)!}>{/* keyed: a broken still marks its host, so the next card's still gets a fresh one */}<img src={startUrl(shot)!} alt={`${label} start still`} /></span>
        : <span className="fm-screen-ph">{shot.status === 'failed' ? (latestTake(shot)?.error ?? 'This take didn’t finish. Nothing more is charged for it.') : isBusy(shot) ? 'Generating…' : 'No clip yet'}</span>}
      {shot && isBusy(shot) && <span className="fm-screen-busy" role="status"><i className="as-spin" aria-hidden />Generating {label.toLowerCase()}…</span>}
    </div>
    {shot && <p className="fm-preview-cap"><b>{label}</b>{t?.url ? <> · {secText(playLen(shot))}{isTrimmed(shot) && full ? ` of ${secText(full)}` : ''}</> : null}</p>}
  </section>;
}

type RowProps = { defModel: string; setup: SetupKind | null; film: FilmProject; srv: FilmProject | null; sel: string | null; setSel: (id: string) => void; commit: (o: FilmOp[]) => Promise<unknown>; adopt: (d: any) => void; labels: string[]; toast: ReturnType<typeof useToast>; tools: ToolInfo[]; gap: string | null; setGap: (id: string | null) => void };
function ShotRow({ defModel, setup, film, srv, sel, setSel, commit, adopt, labels, toast, tools, gap, setGap }: RowProps) {
  const ids = film.shots.map(s => s.id); const row = useRef<HTMLOListElement>(null);
  const move = (id: string, by: number) => { const order = moveId(ids, id, by); if (order !== ids) void commit([{ op: 'reorder_shots', order }]); };
  const full = film.shots.length >= MAX_SHOTS; const ctx: JoinCtx = { film, commit, adopt, setSel, toast, setup };
  useEffect(() => { row.current?.querySelector<HTMLElement>(`[data-shot="${sel}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [sel]);
  const onKey = (e: React.KeyboardEvent) => { if (!sel) return; const i = ids.indexOf(sel);
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); move(sel, e.key === 'ArrowLeft' ? -1 : 1); return; }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); setSel(ids[i - 1]); row.current?.querySelector<HTMLElement>(`[data-shot="${ids[i - 1]}"] .fm-card-btn`)?.focus(); }
    if (e.key === 'ArrowRight' && i < ids.length - 1) { e.preventDefault(); setSel(ids[i + 1]); row.current?.querySelector<HTMLElement>(`[data-shot="${ids[i + 1]}"] .fm-card-btn`)?.focus(); } };
  return <section className="fm-row-wrap" aria-label="Timeline">
    <div className="fm-sec-h"><h2>Timeline</h2><span className="fm-sec-note">{film.shots.length ? 'Select a shot to edit · ← → to navigate' : 'Add your first shot to begin'}</span></div>
    <ol className="fm-row" ref={row} onKeyDown={onKey} data-testid="film-row">
      {film.shots.map((s, i) => { const next = film.shots[i + 1];
        return <li key={s.id} className="fm-slot" data-shot={s.id}>
          {i === 0 && <Seam ctx={ctx} after={null} full={full} />}
          <ShotCard shot={s} srvShot={srv?.shots.find(x => x.id === s.id) ?? null} filmId={film.id} label={labels[i]} source={startSourceOf(film.shots, i, labels)} on={s.id === sel} onPick={() => setSel(s.id)} defModel={defModel} setup={setup} film={film} />
          {next ? <GapChip ctx={ctx} a={s} b={next} labels={[labels[i], labels[i + 1]]} tools={tools} open={gap === s.id} onOpenChange={v => setGap(v ? s.id : null)} />
            : <Seam ctx={ctx} after={s} full={full} />}
        </li>; })}
      {!film.shots.length && <li className="fm-slot"><button type="button" className="fm-add-tile" onClick={() => { const s = newShot(); void commit([{ op: 'upsert_shot', shot: s, index: 0 }]); setSel(s.id); }} data-testid="film-add-tile"><PlusIcon size={20} /><span>Add a shot</span></button></li>}
    </ol>
  </section>;
}

function ShotCard({ shot, srvShot, filmId, label, source, on, onPick, defModel, setup, film }: { shot: FilmShot; srvShot: FilmShot | null; filmId: string; label: string; source: string; on: boolean; onPick: () => void; defModel: string; setup: SetupKind | null; film: FilmProject }) {
  const a = activeTake(shot); const t = playable(a) ? a : null; const m = modelsOf(FILM_VIDEO_TOOL).find(x => x.key === shot.modelKey); const q = useShotQuote(filmId, srvShot, !shot.takes.length);
  const [gone0, setGone] = useState(false); useEffect(() => setGone(false), [t?.url]); const gone = gone0 || a?.status === 'missing';
  const trimmed = isTrimmed(shot); const len = playLen(shot); const failed = shot.status === 'failed'; const full = fullLen(shot);
  const inPct = full ? (shot.trim.inSec / full) * 100 : 0; const outPct = full ? ((shot.trim.outSec ?? full) / full) * 100 : 100;
  const why = shot.takes.length ? null : blockReason(missingOf(film, shot), q, setup);
  const spent = shot.takes.reduce((n, x) => n + (x.costUsd ?? 0), 0); const lenText = full == null ? 'Auto length' : trimmed ? `${secText(len)} of ${secText(full)}` : secText(full);
  return <article className={`fm-card${on ? ' on' : ''}${shot.kind === 'bridge' ? ' fm-bridge' : ''}${failed ? ' fm-failed' : ''}${shot.hidden ? ' fm-hidden' : ''}`} data-testid={`film-card-${shot.id}`} data-status={shot.status} data-kind={shot.kind}>
    <button type="button" className="fm-card-btn" onClick={onPick} aria-pressed={on} aria-label={`${label}${shot.hidden ? ', hidden' : ''}, ${STATUS_WORD[shot.status]}, ${lenText}`}>
      <span className="fm-thumb" {...tip(source)}>
        {t && !gone ? <VideoThumb src={t.url} poster={t.posterUrl} />
          : startUrl(shot) ? <img src={startUrl(shot)!} alt="" loading="lazy" onError={e => e.currentTarget.classList.add('media-broken')} />
          : <span className="fm-thumb-ph" aria-hidden>{shot.kind === 'bridge' ? <TransitionIcon size={20} /> : <PlusIcon size={18} />}</span>}
        {gone && <span className="fm-thumb-warn"><AlertIcon size={14} />File missing</span>}
        {shot.kind === 'bridge' && shot.endFrame?.url && <img className="fm-thumb-end" src={shot.endFrame.url} alt="" />}
        {shot.hidden && <span className="fm-hid-tag">Hidden</span>}
        {t?.url && startUrl(shot) && <img className="fm-thumb-start" src={startUrl(shot)!} alt="" {...tip(source)} />}
        {trimmed && <span className="fm-trimbar" aria-hidden><i style={{ left: `${inPct}%`, width: `${outPct - inPct}%` }} /></span>}
      </span>
      <span className="fm-card-b">
        <span className="fm-card-top"><b>{label}</b><span className={`fm-status fm-st-${shot.status}`} {...tip(failed ? latestTake(shot)?.error ?? null : null)}>{isBusy(shot) && <i className="as-spin" aria-hidden />}{failed && <AlertIcon size={12} />}{STATUS_WORD[shot.status]}</span></span>
        <span className="fm-card-src">{source}</span>
        <span className="fm-card-p" {...tip(shot.prompt.trim() || 'No prompt yet')}>{shot.prompt.trim() || <em>No prompt yet</em>}</span>
        <span className="fm-card-m"><span className="fm-chip" title={m ? shownName(m) : 'The Video page’s default model'}>{m ? shownName(m) : defModel}</span>{shot.runOn && <span className="fm-chip fm-chip-q">{RUN_ON_CHIP[shot.runOn] ?? shot.runOn}</span>}</span>
        <span className="fm-card-f"><span>{lenText}{shot.resolution ? ` · ${shot.resolution}` : ''}</span>
          <span className="fm-card-price">{shot.takes.length ? <span {...tip('Spent on this shot')}>{shot.takes.every(x => x.sample) ? 'Sample' : usdText(spent)}{shot.takes.length > 1 ? ` · ${shot.takes.length} takes` : ''}</span> : why ? <span className="fm-card-why" data-testid="film-card-why" {...tip(q?.error && why !== q.error ? q.error : null)}>{why}</span> : <GenPrice q={q} demo={q?.demo === true} credits={typeof q?.credits === 'number' ? q.credits : null} free={q?.credits === 0 && q?.demo !== true} />}</span></span>
      </span>
    </button>
  </article>;
}

/** The "+" before the first card (add a shot at the start) and after the last (Continue · Add shot). Between two cards the gap chip
 *  (GapChip.tsx) holds the join, Continue, Bridge, Extend and Add. */
function Seam({ ctx, after, full }: { ctx: JoinCtx; after: FilmShot | null; full: boolean }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const btn = useRef<HTMLButtonElement>(null); const { film, commit } = ctx;
  const i = after ? film.shots.findIndex(x => x.id === after.id) : -1; const last1 = !!after && i === film.shots.length - 1;
  const add = (s: FilmShot) => { const p = commit([{ op: 'upsert_shot', shot: s, index: i + 1 }]); ctx.setSel(s.id); setOpen(false); return p; };
  const cont = async () => { if (!after) return; setBusy(true); try { await continueAfter(ctx, after); setOpen(false); } finally { setBusy(false); } };
  const noClip = after ? joinBlock(film, after).cont : null;
  return <div className={`fm-seam${last1 ? ' fm-seam-end' : ''}${!after ? ' fm-seam-first' : ''}`}>
    <button ref={btn} type="button" className={`fm-seam-btn${open ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open} disabled={full} onClick={() => setOpen(o => !o)}
      aria-label={after ? `Add after ${after.kind === 'bridge' ? 'the bridge' : 'this shot'}` : 'Add a shot at the start'} {...tip(full ? `A film holds up to ${MAX_SHOTS} shots` : after ? 'Continue or add a shot' : 'Add a shot at the start')} data-testid={`film-seam-${after?.id ?? 'start'}`}><PlusIcon size={last1 ? 18 : 14} />{last1 && <span>Add</span>}</button>
    <Popover open={open} anchor={btn} onClose={() => setOpen(false)} label="Add a shot" role="menu" placement="top" align="center" width={300} testId="film-seam-menu">
      <div className="fm-menu" role="none">
        {after && <button type="button" role="menuitem" className="fm-menu-row" disabled={!!noClip || busy} onClick={() => void cont()} data-testid="film-continue">
          <LastFrameIcon size={18} /><span><b>Continue</b><small>{noClip ?? 'The next shot starts on this clip’s last frame'}</small></span></button>}
        <button type="button" role="menuitem" className="fm-menu-row" disabled={busy} onClick={() => void add(newShot(likeShot(after)))} data-testid="film-add-shot">
          <PlusIcon size={18} /><span><b>Add shot</b><small>A new shot with its own start still</small></span></button>
      </div>
    </Popover>
  </div>;
}

const LANES: { kind: AudioKind; label: string; wf: string; icon: JSX.Element; hint: string }[] = [
  { kind: 'music', label: 'Music', wf: 'music', icon: <MusicIcon size={16} />, hint: 'One score under the whole film, dipped under voices' },
  { kind: 'vo', label: 'Voice', wf: 'voiceover', icon: <MicIcon size={16} />, hint: 'Narration or a letter read off screen' },
  { kind: 'sfx', label: 'Sound effects', wf: 'sfx', icon: <SoundIcon size={16} />, hint: 'Rain, a bus pulling away, one remembered sound' },
];
function AudioLanes({ film, commit }: { film: FilmProject; commit: (o: FilmOp[]) => Promise<unknown> }) {
  const toast = useToast();
  const laneOf = (k: AudioKind): FilmAudio => film.audio.find(a => a.kind === k) ?? { id: `aud_${k}`, kind: k, jobId: null, url: null, volume: 1, fadeOutSec: null, loop: false };
  /* set_audio replaces the whole list: this lane changed, the others kept */
  const set = (a: FilmAudio) => void commit([{ op: 'set_audio', tracks: [...film.audio.filter(x => x.kind !== a.kind), a] }]);
  const choose = (a: FilmAudio, label: string) => pickMedia({ accept: 'audio/*', title: `Choose ${label.toLowerCase()}`, limits: 'From your Assets or your computer', onFiles: async fs => { if (!fs[0]) return;
    try { const url = await fileUrl(fs[0]); set({ ...a, url, jobId: null }); } catch (e: any) { toast(`Couldn’t add that sound. ${e?.message ?? ''}`.trim(), 'error'); } } });
  return <section className="fm-audio" aria-label="Sound">
    <div className="fm-sec-h"><h2>Sound</h2><span className="fm-sec-note">Levels are balanced when you stitch</span></div>
    {LANES.map(l => { const a = laneOf(l.kind); return <div key={l.kind} className={`fm-lane${a.url ? ' has' : ''}`} data-testid={`film-lane-${l.kind}`}>
      <span className="fm-lane-l">{l.icon}<b>{l.label}</b></span>
      <div className="fm-lane-body">{a.url ? <AudioCard src={a.url} title={a.jobId ? 'Your result' : (a.url.split('/').pop() ?? 'Your file')} model={a.jobId ? 'From Assets' : 'Your file'} cover={false} kind={l.kind === 'music' ? 'music' : 'voice'} testId={`film-audio-${l.kind}`} />
        : <span className="fm-lane-empty">{l.hint}</span>}</div>
      <div className="fm-lane-act">
        {a.url && <label className="fm-vol" {...tip('Volume')}><span className="sr-only">{l.label} volume</span><input type="range" min={0} max={1.5} step={0.05} value={a.volume} onChange={e => set({ ...a, volume: Number(e.target.value) })} /></label>}
        <button type="button" className="btn btn-sm" onClick={() => choose(a, l.label)}>{a.url ? 'Replace' : 'Choose'}</button>
        {a.url ? <button type="button" className="fm-icon-btn" aria-label={`Remove ${l.label.toLowerCase()}`} onClick={() => set({ ...a, url: null, jobId: null })}><CloseIcon size={14} /></button>
          : <Link to={audioRoute(l.wf as any)} className="btn btn-sm btn-ghost">Make one</Link>}
      </div>
    </div>; })}
  </section>;
}

type Rough = { url: string; durationSec: number | null; shotIds: string[] };
/** The Stitch bar: the IIAYN FILMS ident at the start and the end credit (both on for a new film, editable, each can be turned off), the fade,
 *  Rough cut and Stitch. compose has one opening card, so the ident is the title card. A credit the page wrote follows the cut's real models. */
function StitchBar({ film, models, commit, adopt, onRough }: { film: FilmProject; models: string[]; commit: (o: FilmOp[]) => Promise<unknown>; adopt: (d: any) => void; onRough: (r: Rough) => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false); const [rbusy, setRbusy] = useState(false); const [done, setDone] = useState<string | null>(null);
  const P = film.post; const [title, setTitle] = useState(P.titleCard?.text ?? ''); const [end, setEnd] = useState(P.endCard?.text ?? '');
  useEffect(() => { setTitle(P.titleCard?.text ?? ''); setEnd(P.endCard?.text ?? ''); }, [P.titleCard?.text, P.endCard?.text]);
  const fade = P.videoFade; const { blocked: missing, note } = stitchNote(film);
  const auto = creditText(models); const tried = useRef<string | null>(null);
  /* the page's own credit keeps naming the models in the cut */
  useEffect(() => { const t = P.endCard?.text; if (!P.endCard || !isAutoCredit(t) || t === auto || tried.current === auto) return; tried.current = auto;
    void commit([{ op: 'set_post', post: { endCard: { ...P.endCard, text: auto } } }]); }, [auto, P.endCard]); // eslint-disable-line react-hooks/exhaustive-deps
  const setCard = (k: 'titleCard' | 'endCard', c: FilmCard | null) => void commit([{ op: 'set_post', post: { [k]: c } }]);
  const saveText = (k: 'titleCard' | 'endCard', text: string) => { const c = P[k]; const v = text.trim().slice(0, CARD_MAX);
    if (!c) return; if (!v) { (k === 'titleCard' ? setTitle : setEnd)(c.text ?? ''); return; } if (v !== c.text) setCard(k, { ...c, text: v }); };
  const rough = async () => { setRbusy(true); try { const d = await previewFilm(film.id); adopt(d); onRough({ url: d.url, durationSec: d.durationSec, shotIds: d.shotIds }); }
    catch (e: any) { toast(`Couldn’t make the rough cut. ${e?.message ?? ''}`.trim(), 'error'); } finally { setRbusy(false); } };
  const len = useMemo(() => cutLen(film), [film]);
  const go = async () => { setBusy(true); setDone(null); try { const d = await stitchFilm(film.id); adopt(d); const jid = d?.id ?? d?.jobId ?? null; setDone(jid);
      toast('Stitching your film. It shows up in Assets when it’s ready.', 'success', jid ? { action: { label: 'Open', to: `/jobs/${encodeURIComponent(jid)}` } } : undefined); }
    catch (e: any) { toast(`Stitch didn’t start. ${e?.message ?? ''} Nothing was charged.`.trim(), 'error'); } finally { setBusy(false); } };
  const custom = !!P.endCard && !isAutoCredit(P.endCard.text);
  return <section className="fm-stitch" aria-label="Stitch" data-testid="film-stitch">
    <details className="fm-finish-panel" name="film-workspace-settings"><summary>Finishing <span>Opening title, credits & fade</span></summary><div className="fm-stitch-f">
      <div className={`fm-cardf${P.titleCard ? '' : ' off'}`} data-testid="film-ident">
        <SwitchRow label="Opening title" on={!!P.titleCard} onChange={v => setCard('titleCard', v ? identCard(title.trim() || IDENT_TEXT) : null)} title="Words on black before the first shot" testId="film-ident-on" />
        <input value={P.titleCard ? title : ''} placeholder="Off. The film starts on the first shot." disabled={!P.titleCard} maxLength={CARD_MAX} aria-label="Opening title text" onChange={e => setTitle(e.target.value)} onBlur={() => saveText('titleCard', title)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} data-testid="film-ident-text" />
      </div>
      <div className={`fm-cardf${P.endCard ? '' : ' off'}`} data-testid="film-credit">
        <SwitchRow label="End credit" on={!!P.endCard} onChange={v => setCard('endCard', v ? creditCard(models) : null)} title="Words on black after the last shot, naming the models the film used" testId="film-credit-on" />
        <input value={P.endCard ? end : ''} placeholder="Off. The film ends on the last shot." disabled={!P.endCard} maxLength={CARD_MAX} aria-label="End credit text" onChange={e => setEnd(e.target.value)} onBlur={() => saveText('endCard', end)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} data-testid="film-credit-text" />
        {custom && <button type="button" className="fm-link fm-cardf-reset" onClick={() => setCard('endCard', { ...P.endCard!, text: auto })} {...tip(auto)}>Name the models again</button>}
      </div>
      <label className="fm-check"><input type="checkbox" checked={fade} onChange={e => void commit([{ op: 'set_post', post: { videoFade: e.target.checked } }])} />Fade to black at the end</label>
    </div>
    </details><div className="fm-stitch-go">
      <button type="button" className="btn btn-ghost" onClick={() => void rough()} disabled={rbusy || !!missing} data-testid="film-rough" {...tip(missing ?? 'A quick, low-quality join of the shots in order with their trims, to check order and timing. Not saved to Assets.')}>{rbusy ? <i className="as-spin" aria-hidden /> : <PlayIcon size={14} />}{rbusy ? 'Joining…' : 'Rough cut'}</button>
      <span className="fm-stitch-len" {...tip('The length of the stitched shots, before the opening title and credit')}>{clockOf(len)}{(missing ?? note) && <small>{missing ?? note}</small>}</span>
      <button type="button" className="btn btn-primary fm-stitch-btn" disabled={busy || !!missing} onClick={() => void go()} data-testid="film-stitch-go" {...tip(missing ?? 'Joins the clips on your computer. Nothing is charged.')}>
        {busy ? <i className="as-spin" aria-hidden /> : <StitchIcon size={16} />}<span>Stitch</span><span className="fm-free">Free</span></button>
      {done && <button type="button" className="fm-link" onClick={() => navigate(`/jobs/${encodeURIComponent(done)}`)}>Open the film</button>}
    </div>
  </section>;
}

/** Rough cut: the server's quick low-quality join of the cards in the film (their trims and transitions, no music mix), played here with a
 *  strip that shows which card is on screen. Not a job, not in Assets. */
function RoughCut({ r, film, labels, onStop }: { r: Rough; film: FilmProject; labels: string[]; onStop: () => void }) {
  const [t, setT] = useState(0); const parts = r.shotIds.map(id => { const k = film.shots.findIndex(s => s.id === id); return { id, label: labels[k] ?? 'Shot', len: k >= 0 ? playLen(film.shots[k]) : 0 }; });
  const total = r.durationSec ?? parts.reduce((n, p) => n + p.len, 0); let acc = 0; const on = parts.findIndex(p => { acc += p.len; return t < acc; });
  const ar = /^(\d+):(\d+)$/.exec(film.aspect);
  return <section className="fm-preview fm-rough" aria-label="Rough cut" data-testid="film-rough-player">
    <div className="fm-screen" style={ar ? { aspectRatio: `${ar[1]} / ${ar[2]}` } : undefined}>
      <span className="fm-vwrap" key={r.url}><video src={r.url} autoPlay controls playsInline onTimeUpdate={e => setT(e.currentTarget.currentTime)} /></span>
      <span className="fm-rough-tag">Rough cut{on >= 0 ? ` · ${parts[on].label}` : ''}</span>
    </div>
    <div className="fm-rough-bar">
      <span className="fm-rough-track" aria-hidden>{parts.map((p, i) => <i key={p.id} className={i < on ? 'done' : i === on ? 'on' : ''} style={{ flexGrow: Math.max(0.2, p.len) }} title={p.label} />)}</span>
      <span className="fm-rough-t">{clockOf(t)} / {clockOf(total)}</span>
      <button type="button" className="btn btn-sm btn-ghost" onClick={onStop} data-testid="film-rough-stop">Done</button>
    </div>
    <p className="fm-preview-cap">A quick check of order and timing. Stitch makes the full-quality film with music.</p>
  </section>;
}

/** Spent against the film's budget: a thin bar that turns amber at 80 % and red when it's used up. Click to set or change the budget inline
 *  (empty clears it). Generate waits, with the reason, when a card's price is more than what's left (FilmInspector). */
function BudgetMeter({ film, commit }: { film: FilmProject; commit: (o: FilmOp[]) => Promise<unknown> }) {
  const b: BudgetView = budgetOf(film); const [edit, setEdit] = useState(false); const [t, setT] = useState(''); const [bad, setBad] = useState(false);
  const save = () => { const v = parseBudget(t); if (v === undefined) { setBad(true); return; } if (v !== (film.budgetUsd ?? null)) void commit([{ op: 'set_meta', budgetUsd: v }]); setEdit(false); setBad(false); };
  const pct = Math.min(100, Math.round(b.share * 100));
  const word = b.level === 'over' ? 'Budget used up' : b.level === 'warn' ? `${pct} % of the budget used` : null;
  if (edit) return <span className="fm-fact fm-budget fm-budget-edit" data-testid="film-budget-edit">
    <label><span>Budget</span><span className="fm-budget-in"><i aria-hidden>$</i><input autoFocus inputMode="decimal" value={t} placeholder="No budget" aria-label="Budget for this film in dollars" aria-invalid={bad || undefined}
      onChange={e => { setT(e.target.value); setBad(false); }} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEdit(false); setBad(false); } }} data-testid="film-budget-input" /></span></label>
    {bad && <small className="fm-budget-bad" role="alert">A number, like 5 or 12.50</small>}
  </span>;
  return <button type="button" className={`fm-fact fm-budget fm-budget-${b.level}`} onClick={() => { setT(b.budget != null ? String(b.budget) : ''); setEdit(true); }} data-testid="film-spend" data-level={b.level}
    aria-label={`Spent ${usdText(b.spent)}${b.budget != null ? ` of ${usdText(b.budget)}` : ''}. ${b.budget != null ? 'Change the budget' : 'Set a budget'}`} {...tip(`${spendTip(film)}${b.left != null ? ` · ${usdText(b.left)} left` : ''}`)}>
    <span className="fm-budget-t">Spent <b>{usdText(b.spent)}</b>{b.budget != null && <> of {usdText(b.budget)}</>}</span>
    {b.budget != null ? <span className="fm-budget-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span> : <span className="fm-budget-set">Set budget</span>}
    {word && <span className="fm-budget-word">{word}</span>}
  </button>;
}

/** A film with no cards yet: start blank, or from the built-in sample (a fresh copy opens; this empty film goes, it has nothing in it). */
function EmptyFilm({ film, onBlank }: { film: FilmProject; onBlank: () => void }) {
  const [samples, setSamples] = useState<FilmSample[]>([]); const [busy, setBusy] = useState(false); const toast = useToast();
  useEffect(() => { listSamples().then(setSamples).catch(() => undefined); }, []);
  const sample = async (x: FilmSample) => { setBusy(true);
    try { const f = await branded(await openSample(x.name)); if (!film.shots.length) await deleteFilm(film.id).catch(() => undefined); navigate(`/film/${encodeURIComponent(f.id)}`); }
    catch (e: any) { toast(`Couldn’t open that sample. ${e?.message ?? ''}`.trim(), 'error'); } finally { setBusy(false); } };
  return <aside className="fm-insp fm-insp-empty" data-testid="film-empty-start"><p><b>Start with a shot.</b> Each shot is one clip: a start still, a prompt, then takes until one feels right.</p>
    <FilmStart samples={samples} busy={busy} onSample={x => void sample(x)} onBlank={onBlank} blankLabel="Add a shot" blankNote="A blank shot with its own start still" />
  </aside>;
}

/** The ? sheet: every shortcut on /film/:id (they're off while you type in a box). */
function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); const on = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', on, true); return () => window.removeEventListener('keydown', on, true); }, [onClose]);
  const rows = SHORTCUTS.filter(x => x.key !== 'next');
  return <div className="fm-keys-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="fm-keys" role="dialog" aria-modal="true" aria-labelledby="fm-keys-h" data-testid="film-shortcuts">
      <div className="fm-keys-h"><h2 id="fm-keys-h">Shortcuts</h2><button ref={close} type="button" className="fm-icon-btn" aria-label="Close" onClick={onClose}><CloseIcon size={14} /></button></div>
      <dl>{rows.map(r => <div key={r.key} className="fm-keys-row"><dt>{r.keys.split(' ').map(k => <kbd key={k}>{k}</kbd>)}</dt><dd>{r.what}</dd></div>)}</dl>
      <p className="fm-note">Off while you type in a box. Alt + ← → moves the picked shot.</p>
    </div>
  </div>;
}

/** Keys on /film/:id (filmLogic filmKeyOf): Space, ← →, C, B, R, S, ?. Nothing fires while you type, inside an open menu, or on a slider. */
function useFilmKeys(o: { film: FilmProject | null; sel: string | null; setSel: (id: string) => void; setGap: (id: string | null) => void; setHelp: (v: boolean) => void;
  commit: (ops: FilmOp[]) => Promise<unknown>; adopt: (d: any) => void; toast: ReturnType<typeof useToast> }) {
  const ref = useRef(o); ref.current = o;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return; const k = filmKeyOf(e); if (!k) return; const el = e.target as HTMLElement | null;
      if (el?.closest?.('[role="dialog"],[role="menu"],[role="listbox"],[role="radiogroup"],[role="slider"],[role="tablist"],.pop,.dlg')) return;
      if (el?.tagName === 'VIDEO' || el?.tagName === 'INPUT') return; /* a focused player keeps its own Space; a slider keeps its arrows */
      const { film, sel, setSel, setGap, setHelp, commit, adopt, toast } = ref.current; if (!film) return;
      const i = film.shots.findIndex(s => s.id === sel); const shot = i >= 0 ? film.shots[i] : null; const labels = shotLabels(film.shots);
      const done = () => e.preventDefault();
      if (k === 'help') { done(); setHelp(true); return; }
      if (k === 'play') { const v = document.querySelector<HTMLVideoElement>('.fm-stage .fm-screen video'); if (!v) return; done(); if (v.paused) void v.play().catch(() => undefined); else v.pause(); return; }
      if (k === 'prev' || k === 'next') { const j = i + (k === 'prev' ? -1 : 1); if (i < 0 || j < 0 || j >= film.shots.length) return; done(); setSel(film.shots[j].id); return; }
      if (!shot) return; done();
      if (k === 'continue') { const why = joinBlock(film, shot).cont; if (why) { toast(`${labels[i]}: ${why.toLowerCase()}.`, 'warn'); return; } void continueAfter({ film, commit, adopt, setSel, toast }, shot); return; }
      if (k === 'gap') { if (!film.shots[i + 1]) { toast(`${labels[i]} is the last shot. Add one after it first.`, 'warn'); return; } setGap(shot.id); return; }
      if (k === 'again') { window.dispatchEvent(new CustomEvent(FILM_AGAIN_EVENT, { detail: { shotId: shot.id } })); return; }
      if (k === 'star') { const t = newestDoneTake(shot); if (!t) { toast(shot.takes.some(x => x.status === 'done') ? 'The newest take is already in the film.' : `${labels[i]} has no finished take yet.`, 'warn'); return; }
        void commit([{ op: 'set_active_take', shotId: shot.id, takeId: t.id }]); toast(`Take ${[...shot.takes].sort((a, b) => a.createdAt - b.createdAt).indexOf(t) + 1} is in the film now.`, 'success'); }
    };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, []);
}
