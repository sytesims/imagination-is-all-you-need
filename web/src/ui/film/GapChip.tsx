/**
 * The gap between two cards: one chip with the join and its price ("Cut · Free"). It opens a popover with A's last frame beside B's first,
 * a quick "Frames match?" read (colour and brightness, no model), then the joins grouped:
 *  - Free (Stitch, on this computer): Cut, J-cut, L-cut, Crossfade, Fade through black, each with a one-line tip from the editing grammar;
 *  - AI (priced before anything runs): Continue (a next card from A's last frame), Bridge (first and last frame, LTX-2.5 4 s), Extend A
 *    (opens Extend with A's clip; its price shows there before it runs).
 * A join into or out of a bridge stays a plain cut (the bridge lands on the exact frames). Also used by the "B" shortcut (open prop).
 */
import { useEffect, useRef, useState } from 'react';
import type { ToolInfo } from '../../api';
import { Link } from '../../platform/router';
import { Popover } from '../../shared/Popover';
import { Segmented } from '../../shared/BarPop';
import { GenPrice } from '../../shared/GenPrice';
import { tip } from '../../shared/Tooltip';
import { toolHandoffHref } from '../../shared/workflowLinks';
import type { useToast } from '../../shared/Toast';
import { LastFrameIcon, TransitionIcon, ExtendIcon, PlusIcon, ImageIcon } from '../Icons';
import { takeFrame, continueFrame, addBridge, gapQuote } from './filmApi';
import { activeTake, playable, startUrl, newShot, seamOf, seamLocked, bridgeCutOps, transitionOf, joinKindOf, FREE_JOINS, XFADE_SECS, SPLIT_SECS, BRIDGE_SEAM_TIP, frameStatsOf, frameMatch, MATCH_WORD, type FrameStats, type JoinKind } from './filmLogic';
import { BRIDGE_DEFAULTS, type FilmOp, type FilmProject, type FilmShot } from './types';

type Toast = ReturnType<typeof useToast>;
export interface JoinCtx { film: FilmProject; commit: (o: FilmOp[]) => Promise<unknown>; adopt: (d: any) => void; setSel: (id: string) => void; toast: Toast }

/** A new card's settings like the card before it (a bridge's own model isn't carried on). */
export const likeShot = (s: FilmShot | null) => s?.kind === 'bridge' ? {} : { modelKey: s?.modelKey ?? null, runOn: s?.runOn ?? null, resolution: s?.resolution ?? '', durationSec: s?.durationSec ?? null };
/** Continue: a new card right after `after`, then the server starts it on that clip's exact last frame (and writes a continue prompt). */
export async function continueAfter(c: JoinCtx, after: FilmShot): Promise<void> {
  const i = c.film.shots.findIndex(x => x.id === after.id); const s = newShot(likeShot(after));
  try { await c.commit([{ op: 'upsert_shot', shot: s, index: i + 1 }]); c.setSel(s.id); c.adopt(await continueFrame(c.film.id, s.id)); }
  catch (e: any) { c.toast(`Couldn’t take the last frame. ${e?.message ?? ''}`.trim(), 'error'); }
}
/** Bridge: a first-and-last-frame card between `after` and the next card, joined with plain cuts. */
export async function bridgeAfter(c: JoinCtx, after: FilmShot): Promise<void> {
  try { const d = await addBridge(c.film.id, after.id); c.adopt(d); c.setSel(d.shotId); const ops = d.film ? bridgeCutOps(d.film) : []; if (ops.length) await c.commit(ops); }
  catch (e: any) { c.toast(`Couldn’t add a bridge. ${e?.message ?? ''}`.trim(), 'error'); }
}
/** Why Continue / Bridge can't run yet (null = ready). */
export function joinBlock(f: FilmProject, after: FilmShot): { cont: string | null; bridge: string | null } {
  const next = f.shots[f.shots.findIndex(x => x.id === after.id) + 1] ?? null; const noClip = playable(activeTake(after)) ? null : 'Needs a finished clip on this card first';
  return { cont: noClip, bridge: noClip ?? (!next ? 'Add the next card first' : !startUrl(next) ? 'The next card needs a start still first' : null) };
}

/** The image's stats on a small canvas (same-origin library files); null when it can't be read. */
function useFrameStats(url: string | null): FrameStats | null {
  const [st, setSt] = useState<FrameStats | null>(null);
  useEffect(() => { setSt(null); if (!url) return; let live = true; const img = new Image();
    img.onload = () => { try { const c = document.createElement('canvas'); c.width = 48; c.height = 27; const x = c.getContext('2d', { willReadFrequently: true }); if (!x) return;
      x.drawImage(img, 0, 0, c.width, c.height); if (live) setSt(frameStatsOf(x.getImageData(0, 0, c.width, c.height).data)); } catch { /* a tainted or broken image: no read */ } };
    img.src = url; return () => { live = false; }; }, [url]);
  return st;
}
/** A's last frame (its take in the film) and B's first (its take's first frame, else its start still). */
function useGapFrames(a: FilmShot, b: FilmShot, on: boolean): { last: string | null; first: string | null; reading: boolean } {
  const ta = activeTake(a); const tb = activeTake(b); const ja = playable(ta) ? ta.jobId : null; const jb = playable(tb) ? tb.jobId : null; const bStill = startUrl(b);
  const [last, setLast] = useState<string | null>(null); const [first, setFirst] = useState<string | null>(jb ? null : bStill); const [reading, setReading] = useState(false);
  useEffect(() => { if (!on) return; let live = true; setReading(true);
    const pa = ja ? takeFrame(ja, 'last') : Promise.resolve(null); const pb = jb ? takeFrame(jb, 'first').then(u => u ?? bStill) : Promise.resolve(bStill);
    void Promise.all([pa, pb]).then(([l, f]) => { if (!live) return; setLast(l); setFirst(f); setReading(false); }); return () => { live = false; }; }, [on, ja, jb, bStill]);
  return { last, first, reading };
}

const priceOf = (q: any) => q == null ? null : q.priceAvailable === false && q.credits == null ? <span className="fm-gap-na" {...tip(q.error ?? null)}>Can’t run as set</span>
  : <GenPrice q={q} demo={q?.demo === true} credits={typeof q?.credits === 'number' ? q.credits : null} free={q?.credits === 0 && q?.demo !== true} />;

export function GapChip({ ctx, a, b, labels, tools, open: openProp, onOpenChange }: { ctx: JoinCtx; a: FilmShot; b: FilmShot; labels: [string, string]; tools: ToolInfo[]; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const { film, commit } = ctx; const [open0, setOpen0] = useState(false); const open = openProp ?? open0; const setOpen = (v: boolean) => { setOpen0(v); onOpenChange?.(v); };
  const btn = useRef<HTMLButtonElement>(null); const [busy, setBusy] = useState<'cont' | 'bridge' | null>(null);
  const tr = seamOf(a, film); const kind = joinKindOf(tr); const locked = seamLocked(film, a); const blocked = locked && kind !== 'cut';
  const name = FREE_JOINS.find(j => j.kind === kind)?.name ?? 'Cut';
  const set = (t: FilmShot['transitionOut']) => void commit([{ op: 'upsert_shot', shot: { id: a.id, transitionOut: t } }]);
  const pick = (k: JoinKind) => set(transitionOf(k === 'fade' ? 'fade' : k, tr));
  /* the frames and their match, read when it opens */
  const fr = useGapFrames(a, b, open); const sa = useFrameStats(open ? fr.last : null); const sb = useFrameStats(open ? fr.first : null); const m = sa && sb ? frameMatch(sa, sb) : null;
  /* AI joins: their prices before anything runs (the gap quote is the same quote a card shows) */
  const [qc, setQc] = useState<any>(null); const [qb, setQb] = useState<any>(null);
  const jb = joinBlock(film, a); const nextIsBridge = b.kind === 'bridge'; const aIsBridge = a.kind === 'bridge';
  useEffect(() => { if (!open) return; let live = true; const err = (e: any) => e?.body ? { priceAvailable: false, credits: null, ...e.body } : null;
    void gapQuote(film.id, a.id, 'continue').then(d => live && setQc(d)).catch(e => live && setQc(err(e)));
    if (!nextIsBridge && !aIsBridge) void gapQuote(film.id, a.id, 'bridge').then(d => live && setQb(d)).catch(e => live && setQb(err(e)));
    return () => { live = false; }; }, [open, film.id, a.id, a.modelKey, a.runOn, a.durationSec, a.resolution, nextIsBridge, aIsBridge]);
  const ext = tools.find(t => t.id === 'h3-extend'); const ta = activeTake(a); const extHref = ext && playable(ta) ? toolHandoffHref(ext, `fromJob=${encodeURIComponent(ta.jobId)}&out=0`) : null;
  const run = async (w: 'cont' | 'bridge') => { setBusy(w); try { await (w === 'cont' ? continueAfter(ctx, a) : bridgeAfter(ctx, a)); setOpen(false); } finally { setBusy(null); } };
  const secs = kind === 'crossfade' ? XFADE_SECS : kind === 'jcut' || kind === 'lcut' ? SPLIT_SECS : null;

  return <div className="fm-seam fm-gap">
    <button ref={btn} type="button" className={`fm-gap-chip fm-gap-${kind}${open ? ' on' : ''}${blocked ? ' fix' : ''}${locked ? ' locked' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}
      aria-label={`Join ${labels[0]} to ${labels[1]}: ${name}${tr.type !== 'cut' && tr.sec ? ` ${tr.sec} s` : ''}, free`} data-testid={`film-gap-${a.id}`} data-kind={kind}
      {...tip(open ? null : blocked ? 'A blend here blurs the bridge’s exact frames. Open to make it a cut.' : `${name}: how ${labels[0].toLowerCase()} goes into ${labels[1].toLowerCase()}`)}>
      <span className="fm-gap-k">{kind === 'jcut' ? 'J' : kind === 'lcut' ? 'L' : name.split(' ')[0]}{(kind === 'crossfade' || kind === 'jcut' || kind === 'lcut') && <small>{tr.sec} s</small>}</span>
      <span className="fm-gap-p">{blocked ? 'Fix' : 'Free'}</span>
    </button>
    <Popover open={open} anchor={btn} onClose={() => setOpen(false)} label={`Join ${labels[0]} to ${labels[1]}`} placement="bottom" align="center" width={600} testId="film-gap-pop">
      <div className="fm-gap-pop bp-host" data-testid="film-gap-body">
        <div className="fm-gap-frames" aria-label="Last frame and first frame">
          {([[fr.last, `${labels[0]} · last frame`], [fr.first, `${labels[1]} · first frame`]] as const).map(([u, cap], k) => <figure key={k} className="fm-gap-f">
            <span className="fm-gap-img">{u ? <img src={u} alt={cap} /> : fr.reading ? <i className="as-spin" aria-hidden /> : <ImageIcon size={18} />}</span>
            <figcaption>{cap}</figcaption></figure>)}
        </div>
        <p className={`fm-match fm-match-${m?.level ?? 'none'}`} role="status" data-testid="film-gap-match" data-level={m?.level ?? ''} data-distance={m?.distance ?? ''}>
          <i aria-hidden /><b>Frames match?</b><span>{m ? <><em>{MATCH_WORD[m.level]}:</em> {m.line.slice(m.line.indexOf(':') + 2)}</> : fr.reading ? 'Reading the frames…' : !fr.last ? `${labels[0]} has no finished clip yet.` : !fr.first ? `${labels[1]} has no start still yet.` : 'Couldn’t read the frames.'}</span>
        </p>

        <div className="fm-gap-cols">
        <div className="fm-gap-grp" role="radiogroup" aria-label="Free joins">
          <h4>Free<small>Stitch joins these on your computer</small></h4>
          {locked && <p className="fm-note" data-testid="film-gap-locked">{BRIDGE_SEAM_TIP}</p>}
          {FREE_JOINS.map(j => { const on = kind === j.kind; const off = locked && j.kind !== 'cut';
            return <button key={j.kind} type="button" role="radio" aria-checked={on} disabled={off} className={`fm-join${on ? ' on' : ''}`} onClick={() => !on && pick(j.kind)} data-testid={`film-join-${j.kind}`}>
              <i className="fm-join-dot" aria-hidden /><span><b>{j.name}</b><small>{j.tip}</small></span><em>Free</em></button>; })}
          {secs && !locked && <Segmented<number> label={kind === 'crossfade' ? 'Blend length' : kind === 'jcut' ? 'Sound leads by' : 'Sound runs on by'} value={tr.sec} testId="film-join-sec"
            onChange={v => set({ type: tr.type, sec: v })} options={(secs as readonly number[]).map(n => ({ value: n, label: `${n} s` }))} />}
        </div>

        <div className="fm-gap-grp" aria-label="AI joins">
          <h4>AI<small>Price first. Nothing runs until you generate the new card</small></h4>
          <button type="button" className="fm-join fm-join-ai" disabled={!!jb.cont || !!busy} onClick={() => void run('cont')} data-testid="film-gap-continue">
            <LastFrameIcon size={16} /><span><b>Continue</b><small>{jb.cont ?? `A new card after ${labels[0].toLowerCase()} that starts on its last frame`}</small></span><em>{busy === 'cont' ? <i className="as-spin" aria-hidden /> : priceOf(qc)}</em></button>
          {!nextIsBridge && !aIsBridge && <button type="button" className="fm-join fm-join-ai" disabled={!!jb.bridge || !!busy} onClick={() => void run('bridge')} data-testid="film-gap-bridge">
            <TransitionIcon size={16} /><span><b>Bridge</b><small>{jb.bridge ?? `One ${BRIDGE_DEFAULTS.durationSec} s move from this last frame into the next start still · LTX-2.5`}{m?.level === 'far' && !jb.bridge ? <><br /><span className="fm-join-warn">The frames are far apart, so it may morph.</span></> : null}</small></span>
            <em>{busy === 'bridge' ? <i className="as-spin" aria-hidden /> : priceOf(qb)}</em></button>}
          {ext && (extHref ? <Link to={extHref} className="fm-join fm-join-ai" data-testid="film-gap-extend" onClick={() => setOpen(false)}>
              <ExtendIcon size={16} /><span><b>Extend {labels[0].toLowerCase()}</b><small>Keep this shot going. Opens Extend with its clip, price first</small></span><em className="fm-join-go">Open</em></Link>
            : <button type="button" className="fm-join fm-join-ai" disabled data-testid="film-gap-extend"><ExtendIcon size={16} /><span><b>Extend {labels[0].toLowerCase()}</b><small>Needs a finished clip on this card first</small></span><em /></button>)}
        </div>
        </div>
        <div className="fm-gap-foot">
          <button type="button" className="fm-link" onClick={() => { const s = newShot(likeShot(a)); void commit([{ op: 'upsert_shot', shot: s, index: film.shots.findIndex(x => x.id === a.id) + 1 }]); ctx.setSel(s.id); setOpen(false); }} data-testid="film-gap-add"><PlusIcon size={14} />Add a shot here</button>
        </div>
      </div>
    </Popover>
  </div>;
}
