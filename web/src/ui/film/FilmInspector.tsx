/**
 * The picked card's inspector: what it starts from (a still, the last frame before it, any image from Assets), the prompt, model and Run on
 * (THE model menu and Run-on chip, with this card's own place), length and quality, the trim (half-second nudges with the frames around the
 * out point), its takes (one starred, older ones tucked away, billed beside quoted) and Generate with its price first (quote = charge).
 * The header reads "Shot 3 · Draft" with one ⋯ menu (move left/right, Split, Hide, Delete); "Add shot after" is a small link under the takes.
 */
import { VIDEO_PAGE } from '../../../../server/src/shared/videoWorkflows';
import { useEffect, useRef, useState } from 'react';
import type { ToolInfo } from '../../api';
import { Link } from '../../platform/router';
import { useToast } from '../../shared/Toast';
import { askConfirm } from '../../shared/Dialog';
import { pickMedia } from '../../shared/MediaPicker';
import { DockGenerate } from '../../shared/DockGenerate';
import { Popover } from '../../shared/Popover';
import { ModelMenu } from '../../shared/ModelMenu';
import { RunOnChip } from '../routing/RunOn';
import { Segmented } from '../../shared/BarPop';
import TrimRange from '../../shared/TrimRange';
import { tip } from '../../shared/Tooltip';
import { requestRequote, useRequoteTick } from '../../shared/quote';
import { modelsOf, modelOfEngine, engineForModel, shownName, useToolModels } from '../../shared/models';
import { withSearch } from '../../shared/workflowLinks';
import { StarIcon, ChevronRightIcon, ChevronDownIcon, TrashIcon, PlusIcon, MinusIcon, CopyIcon, MoreIcon, LastFrameIcon, ImageIcon, VideoIcon } from '../Icons';
import { quoteShot, renderShot, continueFrame, takeFrame, quoteStill, makeStill, jobResult, STILL_TOOL } from './filmApi';
import { GenPrice } from '../../shared/GenPrice';
import { budgetBlock, quoteUsd, activeTake, playable, fullLen, missingOf, isBusy, startUrl, startSourceOf, shotLabels, clampTrim, splitShot, newShot, takesView, secText, usdText, STATUS_WORD, TRIM_STEP, MIN_TRIM_SEC, FILM_VIDEO_TOOL, moveId, worldNotesOf, needsWorld, promptWithWorld, nextShotContext, lastFrameTarget, firstFrameTarget, type NextShotContext } from './filmLogic';
import type { FilmOp, FilmProject, FilmShot, FilmTake } from './types';
import { fileUrl } from './FilmEditor';

const LENGTHS = ['auto', '4', '5', '6', '8', '10', '15'];
/** The film page's R key: generate the picked card again, price first (FilmEditor useFilmKeys sends it with { shotId }). */
export const FILM_AGAIN_EVENT = 'film:generate-again';
const QUALITIES = ['', '480p', '720p', '1080p'];
/** Next-shot ideas stay hidden until the AI agent can write them (the slot and what it reads are kept below). */
const SHOW_IDEAS = false;

/** The card's price as the server would charge it (POST …/quote), re-read when what it renders changes. Off while `on` is false.
 *  A card that can't render yet (400 missing_frame) still gets the price of the model as set. */
export function useShotQuote(filmId: string, s: FilmShot | null, on = true): any {
  const [q, setQ] = useState<any>(null); const tick = useRequoteTick();
  const key = s ? [s.id, s.kind, s.modelKey, s.runOn, s.durationSec, s.resolution, s.types.join(), !!s.prompt.trim(), startUrl(s), s.endFrame?.url].join('|') : '';
  useEffect(() => { if (!s || !on) return; let live = true; const t = setTimeout(() => quoteShot(filmId, s.id).then(d => live && setQ(d)).catch(e => live && setQ(e?.body?.quote ? { ...e.body.quote, missing: e.body.missing } : e?.body ? { priceAvailable: false, credits: null, ...e.body } : null)), 250);
    return () => { live = false; clearTimeout(t); }; }, [filmId, key, on, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return q;
}

type Props = { film: FilmProject; shot: FilmShot; srvShot: FilmShot | null; label: string; tool: ToolInfo | null; commit: (o: FilmOp[]) => Promise<unknown>; adopt: (d: any) => void; onSelect: (id: string) => void };
export default function FilmInspector({ film, shot, srvShot, label, tool, commit, adopt, onSelect }: Props) {
  const toast = useToast(); useToolModels(FILM_VIDEO_TOOL);
  const up = (patch: Partial<FilmShot>) => commit([{ op: 'upsert_shot', shot: { id: shot.id, ...patch } }]);
  const i = film.shots.findIndex(x => x.id === shot.id); const labels = shotLabels(film.shots); const prev = i > 0 ? film.shots[i - 1] : null;
  /* the prompt saves when you stop typing or leave the box */
  const [text, setText] = useState(shot.prompt); const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setText(shot.prompt); }, [shot.prompt]);
  useEffect(() => { if (!dirty.current) return; const t = setTimeout(() => { dirty.current = false; if (text !== shot.prompt) void up({ prompt: text }); }, 700); return () => clearTimeout(t); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const flush = () => { if (dirty.current) { dirty.current = false; if (text !== shot.prompt) return up({ prompt: text }); } return Promise.resolve(); };

  /* model + place: the card keeps its own (the Video page's choice isn't touched) */
  const models = modelsOf(FILM_VIDEO_TOOL); const m = models.find(x => x.key === shot.modelKey) ?? modelOfEngine(FILM_VIDEO_TOOL, tool?.providers[0]?.id);
  const engine = m ? engineForModel(m, null, tool?.providers.map(p => p.id)) : tool?.providers[0]?.id ?? '';
  const mBtn = useRef<HTMLButtonElement>(null); const [mOpen, setMOpen] = useState(false);
  const q = useShotQuote(film.id, srvShot);
  const [busy, setBusy] = useState(false); const gen = useRef<HTMLButtonElement>(null);
  const missing = missingOf(film, { ...shot, prompt: text }); const over = budgetBlock(film, q);
  const render = async () => { if (missing || over || busy) return; if (typeof q?.credits !== 'number') { toast('The price isn’t in yet. Try again in a moment.', 'warn'); return; } setBusy(true);
    try { await flush(); adopt(await renderShot(film.id, shot.id, { quotedCredits: q.credits, quotedRouteId: q.routeId ?? null })); }
    catch (e: any) { if (e?.code === 'route_changed' || e?.code === 'quote_mismatch' || e?.status === 409) { requestRequote(); toast('The price changed. Check the new price, then generate again.', 'warn'); }
      else toast(`That didn’t start. ${e?.message ?? ''}`.trim(), 'error'); }
    finally { setBusy(false); } };

  /* R on the film page: the price first, then the same render as the button */
  const again = useRef<() => void>(() => undefined);
  again.current = async () => {
    if (isBusy(shot) || busy) { toast(`${label} is already generating.`, 'warn'); return; }
    if (missing || over) { toast(`${label}: ${missing ?? over}.`, 'warn'); return; }
    if (typeof q?.credits !== 'number') { toast('The price isn’t in yet. Try again in a moment.', 'warn'); return; }
    const usdQ = quoteUsd(q); const m0 = m ? shownName(m) : 'the default model';
    if (await askConfirm({ title: `Generate ${label.toLowerCase()} ${shot.takes.length ? 'again' : ''}?`.replace(' ?', '?'), body: `${m0}${usdQ != null ? ` · ${usdQ === 0 ? (q?.demo ? 'a free sample' : 'free') : `about ${usdText(usdQ)}`}` : ''}. The new take joins the others. The one in the film stays until you star another.`, confirm: 'Generate' })) void render();
  };
  useEffect(() => { const on = (e: Event) => { if ((e as CustomEvent).detail?.shotId === shot.id) void again.current(); }; window.addEventListener(FILM_AGAIN_EVENT, on); return () => window.removeEventListener(FILM_AGAIN_EVENT, on); }, [shot.id]);

  const pickStill = (which: 'start' | 'end') => pickMedia({ accept: 'image/*', title: which === 'start' ? 'Choose a start still' : 'Choose the end frame', limits: 'An image, or any frame of a clip', onFiles: async fs => { if (!fs[0]) return;
    try { const url = await fileUrl(fs[0]); void up(which === 'start' ? { stillUrl: url, stillJobId: null, startFrom: { kind: 'still', url, jobId: null }, continueFromPrev: false, ...(shot.types.includes('t2v') ? { types: ['i2v'] } : {}) } : { endFrame: { url, jobId: null } }); }
    catch (e: any) { toast(`Couldn’t use that image. ${e?.message ?? ''}`.trim(), 'error'); } } });
  const fromPrev = async () => { try { await flush(); adopt(await continueFrame(film.id, shot.id)); } catch (e: any) { toast(`Couldn’t take the last frame. ${e?.message ?? ''}`.trim(), 'error'); } };
  const textOnly = () => void up({ types: ['t2v'], startFrom: { kind: 'none', url: null, jobId: null }, stillUrl: null, stillJobId: null, continueFromPrev: false });
  const addAfter = (s: FilmShot) => { void commit([{ op: 'upsert_shot', shot: s, index: i + 1 }]); onSelect(s.id); };
  const remove = async () => { if (!await askConfirm({ title: `Delete ${label.toLowerCase()}?`, body: shot.takes.length ? 'The shot leaves the film. Its clips stay in Assets. To keep the shot, hide it instead.' : 'The shot leaves the film.', confirm: 'Delete', danger: true })) return;
    void commit([{ op: 'delete_shot', shotId: shot.id }]); };
  const move = (by: number) => { const ids = film.shots.map(s => s.id); const order = moveId(ids, shot.id, by); if (order !== ids) void commit([{ op: 'reorder_shots', order }]); };
  const world = worldNotesOf(film.script.markdown);
  const t = activeTake(shot); const still = startUrl(shot); const canPrev = !!prev && playable(activeTake(prev));
  const openHref = t?.jobId ? `${VIDEO_PAGE}?recreate=${encodeURIComponent(t.jobId)}` : withSearch(VIDEO_PAGE, new URLSearchParams({ prompt: text, ...(shot.modelKey ? { model: shot.modelKey } : {}) }).toString());
  const len = shot.durationSec == null ? 'auto' : String(shot.durationSec);
  /* the model's own lengths (the quote names them when the set one doesn't fit) */
  const [allowed, setAllowed] = useState<number[] | null>(null); const qa: number[] | null = q?.allowedDurations ?? q?.durations ?? null;
  useEffect(() => { if (qa?.length) setAllowed(qa); }, [qa?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [allowedRes, setAllowedRes] = useState<string[] | null>(null); const qr: string[] | null = Array.isArray(q?.resolutions) ? q.resolutions : null;
  useEffect(() => { if (qr?.length) setAllowedRes(qr); }, [qr?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAllowed(null); setAllowedRes(null); }, [shot.modelKey, shot.runOn]);
  const RES_ORDER = ['480p', '540p', '720p', '768p', '1080p', '1440p', '4k'];
  const qualities = ['', ...(allowedRes ? [...allowedRes].sort((a, b) => RES_ORDER.indexOf(a) - RES_ORDER.indexOf(b)) : QUALITIES.slice(1))];
  const lengths = ['auto', ...(allowed ?? LENGTHS.slice(1).map(Number)).map(String)];
  const why = q && q.priceAvailable === false && typeof q.error === 'string' ? q.error : null;

  return <aside className={`fm-insp bp-host${shot.hidden ? ' fm-is-hidden' : ''}`} aria-label={`${label} settings`} data-testid="film-inspector">
    <div className="fm-insp-h">
      <h2>{label}<span className={`fm-status fm-st-${shot.status}`}>{STATUS_WORD[shot.status]}</span>{shot.hidden && <span className="fm-status">Hidden</span>}</h2>
      <ShotMenu label={label} first={i === 0} last={i === film.shots.length - 1} hidden={!!shot.hidden} onMove={move} onSplit={() => addAfter(splitShot(shot))} onHide={() => void up({ hidden: !shot.hidden })} onDelete={() => void remove()} />
    </div>
    <div className="fm-insp-scroll" tabIndex={0} role="region" aria-label={`${label} controls`}>
    {shot.kind === 'bridge' && <p className="fm-note">A short move from the last frame before it into the next start still. Best when the two frames are close: the same place, a small change of angle. Far apart, give the next shot a new start still instead.</p>}
    <section className="fm-group">
      <h3>{shot.kind === 'bridge' ? 'From and to' : 'Starts from'}</h3>
      <div className="fm-frames">
        <div className="fm-still">
          <span className="fm-still-img" key={still ?? 'none'}>{still ? <img src={still} alt="Start still" onError={e => e.currentTarget.classList.add('media-broken')} /> : <ImageIcon size={20} />}</span>
          <span className="fm-still-t" data-testid="film-start-source">{startSourceOf(film.shots, i, labels)}</span>
          <span className="fm-still-a">
            <button type="button" className="btn btn-sm" onClick={() => pickStill('start')} data-testid="film-pick-still">Choose</button>
            {canPrev && shot.kind !== 'bridge' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => void fromPrev()} data-testid="film-from-prev" {...tip(`Start on the exact last frame of ${labels[i - 1]}`)}><LastFrameIcon size={14} />Last frame of {labels[i - 1]}</button>}
            {!still && <Link to={withSearch('/tools/create-image', new URLSearchParams({ prompt: text }).toString())} className="btn btn-sm btn-ghost">Make one</Link>}
            {!still && shot.kind !== 'bridge' && !shot.types.includes('t2v') && <button type="button" className="fm-link" onClick={textOnly} {...tip('No start still: the model draws everything from the prompt')}>Text only</button>}
          </span>
        </div>
        {shot.kind === 'bridge' && <div className="fm-still">
          <span className="fm-still-img">{shot.endFrame?.url ? <img src={shot.endFrame.url} alt="End frame" /> : <ImageIcon size={20} />}</span>
          <span className="fm-still-t">{shot.endFrame?.url ? `Lands on ${film.shots[i + 1] ? `${labels[i + 1]}’s start still` : 'this still'}` : 'No end frame yet'}</span>
          <span className="fm-still-a"><button type="button" className="btn btn-sm" onClick={() => pickStill('end')}>Choose</button></span>
        </div>}
      </div>
      {shot.kind !== 'bridge' && <MakeStill film={film} shot={shot} prompt={text} up={up} />}
    </section>

    <section className="fm-group">
      <label className="fm-field fm-prompt"><span>{shot.kind === 'bridge' ? 'The move' : <>Prompt<small className="fm-prompt-hint">who · where · what happens · sound</small></>}</span>
        <textarea value={text} rows={4} maxLength={8000} onChange={e => { dirty.current = true; setText(e.target.value); }} onBlur={() => void flush()} data-testid="film-prompt"
          placeholder={shot.kind === 'bridge' ? 'One continuous move from the first frame to the last, no cuts' : 'A woman waits at a snowy bus stop and looks up as the bus arrives. Hold on her face.'} /></label>
      {needsWorld(text, world) && <p className="fm-world-hint" data-testid="film-world-hint"><span><b>World</b> {world}</span>
        <button type="button" className="fm-link" onClick={() => { dirty.current = true; setText(v => promptWithWorld(v, world)); }} data-testid="film-world-add">Add to prompt</button></p>}
    </section>

    <section className="fm-group fm-grid2">
      <div className="fm-field"><span>Model</span>
        <button ref={mBtn} type="button" className="fm-model" aria-haspopup="listbox" aria-expanded={mOpen} onClick={() => setMOpen(o => !o)} data-testid="film-model"><b>{m ? shownName(m) : 'Default'}</b><ChevronDownIcon size={14} /></button>
        {tool && <ModelMenu open={mOpen} anchor={mBtn} onClose={() => setMOpen(false)} toolId={FILM_VIDEO_TOOL} value={engine} quote={q} placement="right" testId="film-model-list"
          items={tool.providers.map(p => ({ id: p.id, name: p.name, p }))} onPick={id => { setMOpen(false); void up({ modelKey: modelOfEngine(FILM_VIDEO_TOOL, id)?.key ?? id }); }} />}
      </div>
      <div className="fm-field"><span>Run on</span>
        {m ? <RunOnChip toolId={FILM_VIDEO_TOOL} model={m} engine={engine} quote={q} testId="film-run-on" own={{ runOn: shot.runOn ?? 'auto', set: v => void up({ runOn: v === 'auto' ? null : v }), rememberedFor: 'this shot' }} /> : <span className="fm-muted">Loading…</span>}
      </div>
    </section>
    <section className="fm-group">
      <h3>Length</h3>
      <Segmented<string> label="Length" value={len} onChange={v => void up({ durationSec: v === 'auto' ? null : Number(v) })} testId="film-length"
        options={[...new Set([...lengths, len])].sort((a, b) => a === 'auto' ? -1 : b === 'auto' ? 1 : Number(a) - Number(b)).map(v => ({ value: v, label: v === 'auto' ? 'Auto' : `${v} s`, title: v === 'auto' ? 'The model’s own length' : undefined }))} />
      <h3>Quality</h3>
      <Segmented<string> label="Quality" value={shot.resolution} onChange={v => void up({ resolution: v })} testId="film-quality"
        options={[...new Set([...qualities, shot.resolution])].map(r => ({ value: r, label: r || 'Auto', hint: r === '480p' ? 'Draft' : undefined }))} />
      {why && <p className="fm-note fm-warn" role="status" data-testid="film-quote-why">{why}</p>}
    </section>

    {playable(t) && <TrimPanel shot={shot} url={t.url} full={fullLen(shot)} commit={commit} />}
    <Takes film={film} shot={shot} commit={commit} onSelect={onSelect} />
    <button type="button" className="fm-link fm-add-after" onClick={() => addAfter(newShot({ modelKey: shot.kind === 'bridge' ? null : shot.modelKey, runOn: shot.kind === 'bridge' ? null : shot.runOn, resolution: shot.kind === 'bridge' ? '' : shot.resolution }))} data-testid="film-add-after"><PlusIcon size={14} />Add shot after</button>
    {SHOW_IDEAS && <NextIdeas ctx={nextShotContext(film, shot, m ? shownName(m) : 'the default model', null)} />}

    </div><div className="fm-gen">
      {tool ? <DockGenerate toolId={FILM_VIDEO_TOOL} engine={engine} quote={q} label={shot.takes.length ? 'Generate again' : 'Generate'} busy={busy || isBusy(shot)} disabled={!!over && !missing} problems={[]} missing={missing ?? (over ? 'Over budget' : null)} pfOpen={false} genRef={gen}
          onClick={() => void render()} variant="card" testId="film-generate" priceTestId="film-price" className="fm-gen-btn" />
        : <button type="button" className="btn btn-primary" disabled>Generate</button>}
      {over && !missing && <p className="fm-note fm-warn" role="status" data-testid="film-over-budget">{over}. Raise the budget in the header, pick a cheaper model or a shorter length.</p>}
      {shot.changed && shot.takes.length > 0 && <p className="fm-note" data-testid="film-changed">Settings changed since the last take. Generate again to see them.</p>}
      <Link to={openHref} className="fm-link fm-open-video" {...tip('Every control of the Video page for this clip')}><VideoIcon size={14} />Open in Video</Link>
    </div>
  </aside>;
}

/** The shot's ⋯ menu: move left / right (Alt + ← →), Split, Hide or show, Delete. */
function ShotMenu({ label, first, last, hidden, onMove, onSplit, onHide, onDelete }: { label: string; first: boolean; last: boolean; hidden: boolean; onMove: (by: number) => void; onSplit: () => void; onHide: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false); const btn = useRef<HTMLButtonElement>(null);
  const item = (testId: string, icon: JSX.Element, text: string, act: () => void, opts: { off?: boolean; keys?: string; danger?: boolean; hint?: string } = {}) =>
    <button type="button" role="menuitem" className={`fm-menu-row fm-menu-line${opts.danger ? ' fm-menu-danger' : ''}`} disabled={opts.off} onClick={() => { setOpen(false); act(); }} data-testid={testId} {...tip(opts.hint ?? null)}>
      {icon}<b>{text}</b>{opts.keys && <kbd>{opts.keys}</kbd>}</button>;
  return <>
    <button ref={btn} type="button" className={`fm-icon-btn fm-more${open ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-label={`${label} actions`} onClick={() => setOpen(o => !o)} data-testid="film-shot-menu" {...tip(open ? null : 'Move, split, hide or delete')}><MoreIcon size={18} /></button>
    <Popover open={open} anchor={btn} onClose={() => setOpen(false)} label={`${label} actions`} role="menu" placement="bottom" align="end" width={220} testId="film-shot-menu-pop">
      <div className="fm-menu" role="none">
        {item('film-move-left', <ChevronRightIcon size={16} className="fm-flip" />, 'Move left', () => onMove(-1), { off: first, keys: 'Alt ←' })}
        {item('film-move-right', <ChevronRightIcon size={16} />, 'Move right', () => onMove(1), { off: last, keys: 'Alt →' })}
        {item('film-split', <CopyIcon size={16} />, 'Split into two', onSplit, { hint: 'A copy right after this shot, same still and model, to rewrite as its own shot' })}
        {item('film-hide', hidden ? <PlusIcon size={16} /> : <MinusIcon size={16} />, hidden ? 'Show in film' : 'Hide from film', onHide, { hint: hidden ? 'Put it back in the film' : 'Leave it out of the film, takes kept' })}
        <hr className="fm-menu-sep" role="separator" />
        {item('film-delete', <TrashIcon size={16} />, 'Delete shot', onDelete, { danger: true })}
      </div>
    </Popover>
  </>;
}

/** In and out in half seconds (the shared trim slider plus nudge buttons), and the frames around the out point so a hold isn't cut too early.
 *  The clip's own length when the take knows it, else read from the file. */
function TrimPanel({ shot, url, full, commit }: { shot: FilmShot; url: string; full: number | null; commit: (o: FilmOp[]) => Promise<unknown> }) {
  const [meta, setMeta] = useState<number | null>(null); const D = full ?? meta;
  if (!D) return <video src={url} preload="metadata" muted hidden onLoadedMetadata={e => setMeta(Math.round(e.currentTarget.duration * 10) / 10 || null)} />;
  const set = (tr: { inSec: number; outSec: number | null }) => void commit([{ op: 'set_trim', shotId: shot.id, inSec: tr.inSec, outSec: tr.outSec }]);
  const inS = shot.trim.inSec; const out = Math.min(D, shot.trim.outSec ?? D);
  const nudge = (which: 'in' | 'out', by: number) => set(which === 'in' ? clampTrim(D, inS + by, shot.trim.outSec) : clampTrim(D, inS, out + by));
  const N = (which: 'in' | 'out') => { const v = which === 'in' ? inS : out; const W = which === 'in' ? 'In' : 'Out';
    return <span className="fm-nudge" role="group" aria-label={which === 'in' ? 'In point' : 'Out point'}>
      <span className="fm-nudge-k">{W}</span>
      <button type="button" className="fm-icon-btn" aria-label={`${W} ${TRIM_STEP} s earlier`} disabled={which === 'in' ? v <= 0 : v <= inS + MIN_TRIM_SEC} onClick={() => nudge(which, -TRIM_STEP)}>−</button>
      <b>{v.toFixed(1)} s</b>
      <button type="button" className="fm-icon-btn" aria-label={`${W} ${TRIM_STEP} s later`} disabled={which === 'in' ? v >= out - MIN_TRIM_SEC : v >= D} onClick={() => nudge(which, TRIM_STEP)}>+</button>
    </span>; };
  const around = [out - 1, out - TRIM_STEP, out, out + TRIM_STEP].filter(x => x >= 0 && x <= D + 0.001);
  const len = Math.round((out - inS) * 10) / 10;
  return <section className="fm-group fm-trim" data-testid="film-trim">
    <h3>Trim<span className="fm-h-aside">{secText(len)} of {secText(D)}</span></h3>
    <TrimRange duration={D} value={{ start: inS, end: out }} onChange={v => set(clampTrim(D, v.start, v.end))} max={D} min={MIN_TRIM_SEC} step={TRIM_STEP} label="In and out" testId="film-trim-range" />
    <div className="fm-nudges">{N('in')}{N('out')}{(inS > 0 || shot.trim.outSec != null) && <button type="button" className="fm-link" onClick={() => set({ inSec: 0, outSec: null })}>Use the whole clip</button>}</div>
    <div className="fm-around" aria-label="Frames around the out point">
      {around.map(x => <figure key={x} className={Math.abs(x - out) < 0.01 ? 'on' : ''}><video src={url} muted playsInline preload="metadata" aria-hidden tabIndex={-1} onLoadedMetadata={e => { const el = e.currentTarget; el.currentTime = Math.max(0, Math.min((el.duration || D) - 0.05, x)); }} /><figcaption>{x.toFixed(1)} s</figcaption></figure>)}
    </div>
  </section>;
}

const TAKE_WORD: Record<string, string> = { queued: 'Queued', running: 'Generating', failed: 'Didn’t finish', canceled: 'Canceled', missing: 'File missing' };
/** What a take cost, in words: billed (what the provider reported, else what counted) beside the quote. */
function takeCost(t: FilmTake): string {
  if (t.sample) return 'Free sample'; if (t.local) return 'Free · your computer';
  const billed = t.actualUsd ?? t.costUsd; const parts = [billed != null ? `${t.actualUsd != null ? 'Billed' : 'Cost'} ${usdText(billed)}` : t.status === 'done' ? 'Cost not known yet' : null, t.quotedUsd != null ? `quoted ${usdText(t.quotedUsd)}` : null];
  return parts.filter(Boolean).join(' · ') || 'Not billed';
}
/** Takes: the starred one leads, the next two beside it, older ones under "N older takes". Each shows what it cost beside what was quoted. */
function Takes({ film, shot, commit, onSelect }: { film: FilmProject; shot: FilmShot; commit: (o: FilmOp[]) => Promise<unknown>; onSelect: (id: string) => void }) {
  const [more, setMore] = useState(false); const { lead, older } = takesView(shot); const a = activeTake(shot);
  if (!shot.takes.length) return null;
  const order = [...shot.takes].sort((x, y) => x.createdAt - y.createdAt);
  const row = (t: FilmTake) => { const on = t === a; const n = order.indexOf(t) + 1; const ok = t.status === 'done';
    return <li key={t.id} className={`fm-take${on ? ' on' : ''}`} data-status={t.status}>
      <span className="fm-take-img">{t.posterUrl ? <img src={t.posterUrl} alt="" loading="lazy" /> : t.status === 'running' || t.status === 'queued' ? <i className="as-spin" aria-hidden /> : <VideoIcon size={16} />}</span>
      <span className="fm-take-t"><b>Take {n}{!ok && <em className={`fm-take-st fm-take-${t.status}`}> · {TAKE_WORD[t.status] ?? t.status}</em>}</b><small {...tip(t.error)}>{t.status === 'failed' && t.error ? t.error : takeCost(t)}</small></span>
      {ok && <TakeFrames film={film} shot={shot} take={t} commit={commit} onSelect={onSelect} />}
      <button type="button" className={`fm-star${on ? ' on' : ''}`} aria-pressed={on} disabled={!ok} aria-label={on ? `Take ${n} is in the film` : `Use take ${n} in the film`} {...tip(on ? 'In the film' : ok ? 'Use this take' : null)}
        onClick={() => !on && ok && void commit([{ op: 'set_active_take', shotId: shot.id, takeId: t.id }])}><StarIcon size={15} /></button>
    </li>; };
  return <section className="fm-group" data-testid="film-takes">
    <h3>Takes<span className="fm-h-aside">{shot.takes.length}</span></h3>
    <ul className="fm-takes">{lead.map(row)}{more && older.map(row)}</ul>
    {older.length > 0 && <button type="button" className="fm-link" onClick={() => setMore(v => !v)} aria-expanded={more}>{more ? 'Hide older takes' : `${older.length} older ${older.length === 1 ? 'take' : 'takes'}`}</button>}
  </section>;
}

/** A take's first and last frame as small chips. One click on the last frame starts the next card on it (a new card when this is the last);
 *  one click on the first frame lands the bridge before this card on it. */
function TakeFrames({ film, shot, take, commit, onSelect }: { film: FilmProject; shot: FilmShot; take: FilmTake; commit: (o: FilmOp[]) => Promise<unknown>; onSelect: (id: string) => void }) {
  const [first, setFirst] = useState<string | null>(null); const [last, setLast] = useState<string | null>(null); const toast = useToast();
  useEffect(() => { let live = true; void takeFrame(take.jobId, 'first').then(u => live && setFirst(u)); void takeFrame(take.jobId, 'last').then(u => live && setLast(u)); return () => { live = false; }; }, [take.jobId]);
  const labels = shotLabels(film.shots); const nx = lastFrameTarget(film, shot); const br = firstFrameTarget(film, shot);
  const nxName = nx.shot ? labels[film.shots.findIndex(x => x.id === nx.shot!.id)] : 'a new shot'; const brName = br ? labels[film.shots.findIndex(x => x.id === br.id)].toLowerCase() : null;
  const useLast = () => { if (!last) return; const start = { kind: 'last_frame' as const, url: last, jobId: take.jobId };
    if (nx.shot) { const n = nx.shot; void commit([{ op: 'upsert_shot', shot: { id: n.id, startFrom: start, continueFromPrev: true, ...(n.kind !== 'bridge' && !n.types.includes('flf') ? { types: ['i2v'] } : {}) } }]); onSelect(n.id); }
    else { const n = newShot({ startFrom: start, continueFromPrev: true, modelKey: shot.kind === 'bridge' ? null : shot.modelKey, runOn: shot.kind === 'bridge' ? null : shot.runOn, resolution: shot.kind === 'bridge' ? '' : shot.resolution });
      void commit([{ op: 'upsert_shot', shot: n, index: film.shots.findIndex(x => x.id === shot.id) + 1 }]); onSelect(n.id); }
    toast(`${nx.shot ? nxName : 'A new shot'} now starts on this last frame.`, 'success'); };
  const useFirst = () => { if (!first || !br) return; void commit([{ op: 'upsert_shot', shot: { id: br.id, endFrame: { url: first, jobId: take.jobId } } }]); toast(`The ${brName} now lands on this first frame.`, 'success'); };
  const chip = (u: string | null, word: string, act: (() => void) | null, why: string) => <button type="button" className="fm-fchip" disabled={!u || !act} onClick={() => act?.()} data-testid={`film-frame-${word.toLowerCase()}`} {...tip(u ? why : 'Reading the frame…')}>
    <span className="fm-fchip-img">{u ? <img src={u} alt="" loading="lazy" /> : <i className="as-spin" aria-hidden />}</span><small>{word}</small></button>;
  return <span className="fm-fchips" role="group" aria-label="First and last frame">
    {chip(first, 'First', br ? useFirst : null, br ? `Land the ${brName} on this first frame` : 'The first frame. Add a bridge before this shot to land on it.')}
    {chip(last, 'Last', useLast, nx.shot ? `Use last frame: ${nxName} starts on it` : 'Use last frame: a new shot after this one starts on it')}
  </span>;
}

/** A start still made right here (Create Image, Generate): the prompt (this card's, editable), the price first, then the still lands on the card. */
function MakeStill({ film, shot, prompt, up }: { film: FilmProject; shot: FilmShot; prompt: string; up: (p: Partial<FilmShot>) => Promise<unknown> }) {
  const [open, setOpen] = useState(false); const [p, setP] = useState(''); const [q, setQ] = useState<any>(null); const [busy, setBusy] = useState(false); const toast = useToast();
  useToolModels(STILL_TOOL); const aspect = shot.aspect ?? film.aspect; const tick = useRequoteTick();
  useEffect(() => { if (!open) return; let live = true; const t = setTimeout(() => quoteStill(p.trim() || 'a still', aspect).then(d => live && setQ(d)).catch(e => live && setQ(e?.body ?? null)), 300); return () => { live = false; clearTimeout(t); }; }, [open, p, aspect, tick]);
  const m = modelOfEngine(STILL_TOOL, typeof q?.routeId === 'string' ? q.routeId.split(':').pop() : null) ?? modelOfEngine(STILL_TOOL, null);
  const go = async () => { if (!p.trim() || typeof q?.credits !== 'number') return; setBusy(true);
    try { const j = await makeStill(p.trim(), aspect, { credits: q.credits, routeId: q.routeId ?? null }); const url = await jobResult(j.id);
      await up({ stillUrl: url, stillJobId: j.id, startFrom: { kind: 'still', url, jobId: j.id }, continueFromPrev: false, ...(shot.types.includes('t2v') ? { types: ['i2v'] } : {}) }); setOpen(false); }
    catch (e: any) { if (e?.code === 'route_changed' || e?.status === 409) { requestRequote(); toast('The price changed. Check the new price, then make it again.', 'warn'); } else toast(`That still didn’t come out. ${e?.message ?? ''}`.trim(), 'error'); }
    finally { setBusy(false); } };
  if (!open) return <button type="button" className="fm-link fm-make-still" onClick={() => { setP(prompt); setOpen(true); }} data-testid="film-make-still"><ImageIcon size={14} />Make a start still here</button>;
  return <div className="fm-makestill" data-testid="film-still-maker">
    <label className="fm-field"><span>Start still · {m ? shownName(m) : 'Image model'}</span>
      <textarea value={p} rows={3} maxLength={4000} onChange={e => setP(e.target.value)} placeholder="The opening frame: who, where, the light" data-testid="film-still-prompt" /></label>
    <div className="fm-makestill-a">
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => void go()} disabled={busy || !p.trim() || typeof q?.credits !== 'number'} data-testid="film-still-go">
        {busy ? <><i className="as-spin" aria-hidden />Making…</> : <>Generate still · <GenPrice q={q} demo={q?.demo === true} credits={typeof q?.credits === 'number' ? q.credits : null} free={q?.credits === 0 && q?.demo !== true} /></>}</button>
    </div>
  </div>;
}

/** Next-shot ideas: the place for 2–3 next-shot prompts and variations of this one, written by the user's connected AI agent in this model's
 *  own style. The agent call comes with the MCP step; the page already gathers what it reads (NextShotContext) and shows it. */
function NextIdeas({ ctx: ctx0 }: { ctx: NextShotContext }) {
  const [last, setLast] = useState<string | null>(null); const jid = ctx0.take?.jobId ?? null;
  useEffect(() => { setLast(null); if (!jid) return; let live = true; void takeFrame(jid, 'last').then(u => live && setLast(u)); return () => { live = false; }; }, [jid]);
  const ctx = { ...ctx0, lastFrameUrl: last };
  const reads = [ctx.take ? 'this take' : null, ctx.prompt.trim() ? 'the prompt' : null, ctx.modelName, ctx.take ? 'its last frame' : null, ctx.worldNotes ? 'world notes' : null, ctx.cast.length ? 'the cast' : null, ctx.nextBeat ? 'the next beat' : null].filter(Boolean) as string[];
  return <section className="fm-group fm-ideas" data-testid="film-next-ideas" data-context={JSON.stringify(ctx)}>
    <h3>Next-shot ideas</h3>
    <p className="fm-note">Your connected AI agent suggests two or three next shots and variations of this prompt, written for {ctx.modelName}, each with a one-line reason.</p>
    <ul className="fm-ideas-reads" aria-label="What it reads">{reads.map(r => <li key={r}>{r}</li>)}</ul>
    <button type="button" className="btn btn-sm btn-ghost" disabled data-testid="film-ideas-ask" {...tip('Comes with the AI agent connection')}>Suggest next shots</button>
  </section>;
}
