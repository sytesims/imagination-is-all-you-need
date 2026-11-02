/**
 * Explore v3 (2026-10-26, from the approved mockups). The page's showcase sections, top to bottom:
 *  - XpHero: full-bleed, one clip looping with sound on (the LTX-2.5 Pro painter, EXPLORE_HERO; shared ShowcaseFilm, bleed variant),
 *    its title and line, and a film credit block under the line (MADE WITH · LENGTH · RAN ON: the real model and music, length, place and price),
 *    then one orange "Make your own →". No quick links (2026-10-28). Nothing generates here.
 *  - XpStill: "From one still", one LTX-2.5 Pro image-to-video take (Comfy Cloud) from one still: a wide frame opens on the still and the shared
 *    HeroReel (reveal variant) sweeps an orange line across into the clip with sound (drag it to compare); one credits line, Recreate (Video,
 *    image to video, the still attached) and the prompt one click away.
 *  - XpKoi: "Make your own cartoon." (letterbox presentation): a MiniMax H3 take extended by H3 Extend (Comfy Cloud) into one 20 s take, shown
 *    wide (shared ShowcaseFilm, letterbox variant) between bars that carry the timecode, the models and a progress line notched at the join; then
 *    "[frame] 10 s + [frame] 10 s = one 20 s take", the two runs' prices, Recreate (Extend with the first 10 s and the prompt) and Start your scene (Video with MiniMax H3).
 *  - XpSwap: chapter 1, "Same dance. Two new casts." Three in a row, all in step (shared useSyncClips): the original, H3 Character Swap (her, one
 *    photo) and Kling 3.0 Omni Edit (both, two photos); under each its label and run line (model, place, price, the photos, Recreate); both upscaled.
 *  - XpLayers: chapter 2, "One picture. Every layer." An Image to layers run (Seedream 5.0 Flash, Comfy Router): copy and steps (shared ChapterText),
 *    the run's animation on a loop (shared HoverClip, on screen only; reduced motion: its poster) with the shared SoundToggle (the sound director;
 *    turning it on from its button restarts the clip so the sound lines up with each layer), then the input → its 13 layers (shared
 *    LayerTile: each cropped to its content on a light checkerboard). Recreate opens Image to layers with the poster loaded.
 *  - XpSheets: "One character. Every angle." Four GPT Image 2.5 Flare character sheets (Comfy Router, real prices): the whole sheet, never cropped,
 *    in the koi's letterbox frame; a highlight steps across the sheet's real panels (Whole sheet first), a cast switch, Recreate (Create Image
 *    with the prompt and model) and Pause. Mossbun also spins in 3D (Tripo 3.1, the shared Model3D: front first, slow auto-rotate, drag to orbit).
 *  - XpLooks: "One idea. Every look." One FLUX.2 [klein] 4B prompt in twelve looks: a big 16:9 frame and twelve tiles that swap it (hover, focus, tap).
 *  - XpYourTurn: "Now it's your turn." The page's last section, full width: a prompt box ("Make it" opens Create Image with the words) over a
 *    dimmed, tilted, drifting wall of things made here (still under reduced motion), the other tabs and the wall's models.
 *  - XpBoard: the user-selected Canvas product-shots recording, with on-screen looping playback.
 *  - XpDance: SyteSim, the Audio tab's dancer (shared AudioCover / AudioVizLayer / useAudioViz), dancing to a beat made in the browser.
 *  - XpFilm: "Mockup to film" (replaces the Worlds tiles): the shared HeroReel (reveal with a before clip, holdSweep): the mockup, the line sweeps
 *    it into the painted first frame, then the film and the mockup play in step (the first shot, looping) with the line parked; the three
 *    passes in a bar under it (click one to show it), Recreate this shot and Open Direct a Shot. Sound: the shared SoundToggle.
 *  - XpVfx: "VFX with LTX-2.5": Footage Effects tiles (official Lightricks IC-LoRAs on the open LTX-2.5 22B, free and local), each naming the model,
 *    the LoRA and its maker, with "Try it" into Video › Footage Effects with that effect picked. A tile with a shipped before / after plays the
 *    shared HeroReel wipe; one without says "Example coming" over a drawn before | after card (never a stand-in clip). Layout to Render reuses the
 *    Mockup to film clip (shared HoverClip; posters first, reduced motion: its poster), its model and real price from the featured entry.
 *  (XpScript, "Write the scene. Watch it play.", left the page on 2026-10-28: the K-drama beat is now a film in IIAYN FILMS, ExploreFilms.tsx.)
 * Data: server/src/shared/exploreShowcase.ts. Posters first, clips on screen / on hover only, reduced motion: stills (the hero: a play button).
 * Sound (2026-10-28): one page-wide choice (on by default, remembered) run by the shared sound director (shared/soundDirector.ts): the clip with
 * sound most in view plays with it, crossfading as you scroll; every clip with an audio track gets the shared SoundToggle (a page-wide mute);
 * silent clips get none.
 */
import { IMAGE_PAGE } from '../../../../server/src/shared/pages';
import { VIDEO_PAGE } from '../../../../server/src/shared/videoWorkflows';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../../platform/router';
import { goToWorkflow } from '../../shared/goToWorkflow';
import { ShowcaseFilm } from '../../shared/ShowcaseFilm';
import { HeroReel, type ReelPhase } from '../../shared/HeroReel';
import { Model3D } from '../../shared/model3d';
import { SoundToggle } from '../../shared/SoundToggle';
import { useSyncClips } from '../../shared/SyncClips';
import { HoverClip, prefersReducedMotion } from '../../shared/HoverClip';
import { useDirectedSound } from '../../shared/soundDirector';
import { LayerTile } from '../../shared/LayerStack';
import { AudioCover, AudioVizLayer, useAudioViz } from '../../shared/AudioViz';
import { Waveform } from '../../shared/Waveform';
import { primeAudio } from '../../shared/audioGraph';
import { detectStyle } from '../../shared/beanStyle';
import { featuredByKey, featuredRecreateHref, placeOfRoute, FEATURED_BIG_POSTER, OUR_COMPUTER, type FeaturedItem } from '../../../../server/src/shared/featured';
import { EXPLORE_HERO, EXPLORE_STILL, EXPLORE_KOI, EXPLORE_SWAP, EXPLORE_LAYERS, EXPLORE_BOARD, EXPLORE_LOOKS, EXPLORE_YOUR_TURN, yourTurnHref, EXPLORE_MOODS, EXPLORE_DANCE, EXPLORE_SHEETS, EXPLORE_FILM, EXPLORE_VFX, vfxTile, EXPLORE_HEADLINE, type VfxTile, type ReelShot } from '../../../../server/src/shared/exploreShowcase';
import { CloseIcon, ResetIcon, SoundIcon } from '../Icons';
import { renderBeat } from './beatSynth';
import '../../shared/audioCard.css';
import { RunChip } from '../../shared/RunChip';
import { chipOfFeatured, chipOfRun, chipUsd, type RunChipData } from '../../../../server/src/shared/runChip';
import { LOCAL_LABEL } from '../../../../server/src/shared/modelIds';
import './exploreShowcase.css';

const Arrow = () => <span className="xv-arrow" aria-hidden>→</span>;
const FreeDot = ({ children = 'Free on your computer' }: { children?: React.ReactNode }) => <span className="xv-free"><i aria-hidden />{children}</span>;

/* ============================================================== hero ============================================================== */
/** The hero's run line, all from the data (EXPLORE_HERO + its featured entry): the model, where it ran and the whole price, with the music made
 *  here (its model from `after`, "Music · YuE2 · Free") as a step: "+1 step" opens video → music. No length: that lives in the player. */
export function heroChip(s: ReelShot, f: FeaturedItem): RunChipData {
  const music = (s.after ?? []).map((x) => /^Music · ([^·]+)/.exec(x)?.[1]?.trim()).find(Boolean);
  return chipOfFeatured(f, { model: s.model, role: 'Video', also: music ? [{ jobId: '', model: music, place: OUR_COMPUTER, costUsd: 0, role: 'Music' }] : [] });
}
/** The hero's credit (2026-11-01: the shared run chip, was the MADE WITH · LENGTH · RAN ON block), then its one action, an orange "Make your own →". */
function HeroCredit({ s, f, rec }: { s: ReelShot; f: FeaturedItem; rec: string | null }) {
  return <div className="xph-credit" data-testid="xp-hero-caption">
    <RunChip onMedia c={heroChip(s, f)} testId="xp-hero-chip" />
    {rec && <Link to={rec} className="xph-rec" data-testid="xp-hero-recreate">Make your own <Arrow /></Link>}
  </div>;
}
export function XpHero() {
  const s = EXPLORE_HERO; const f = featuredByKey(s.key);
  if (!f) return null;
  const rec = featuredRecreateHref(f.key) ?? f.recreateHref ?? null;
  return <section className="xph" data-testid="xp-hero" aria-label={`${s.name}, made with ${s.model}`}>
    {/* the clip's file lives in one place: the featured entry's `out` (shared/featured.ts) */}
    <ShowcaseFilm className="sfilm-bleed" testId="xp-hero-film" label={`${s.name}, made with ${s.model}`} take={f.key} onTake={() => 0} priority
      takes={[{ key: f.key, url: f.out.url, poster: FEATURED_BIG_POSTER[f.key] ?? s.poster, label: s.name, sound: f.out.sound }]} />
    <div className="xph-in">
      <div className="xph-copy">
        <h1 className="xph-h" data-testid="xp-headline">{EXPLORE_HEADLINE}</h1>
        <p className="xph-p"><b className="xph-clip">{/[.?!]$/.test(s.title) ? s.title : `${s.title}.`}</b> {s.line}</p>
        <HeroCredit s={s} f={f} rec={rec} />
      </div>
    </div>
  </section>;
}

/* ============================================================== a prompt as it ran (shared) ============================================================== */
/* (the prompt reader left From one still on 2026-11-02: Recreate this shot opens the full prompt) */
/* ============================================================== From one still (LTX-2.5 Pro image to video) ============================================================== */
/* From one still, with depth (the user's pick, 2026-11-02): the copy on the left; on the right the still as a tilted card behind the moving reel
   (the shared HeroReel: reveal, drag, replay, sound, reduced motion), the still drifting a little on scroll where the browser can. Under the copy,
   the run (model · where · price) with its specs in a quiet line, then Recreate this shot (it opens the full prompt) and a small Replay. */
export function XpStill() {
  const W = EXPLORE_STILL; const t = W.take; const f = featuredByKey(t.key);
  const [replay, setReplay] = useState(0);
  if (!f?.before) return null;
  const still = f.before; const rec = featuredRecreateHref(f.key) ?? VIDEO_PAGE; const ran = Number(f.input.duration) || Math.round(f.out.sec ?? 0);
  const specs = [t.trimmedTo ? `${ran} s run, trimmed to ${Math.floor(t.trimmedTo)} s` : `${ran} s`, String(f.input.resolution ?? ''), f.out.sound ? 'with sound' : ''].filter(Boolean).join(' · ');
  return <section className="xv-sec xpo" id="xp-still" data-testid="xp-still" aria-labelledby="xp-h-still">
    <div className="xpo-depth">
      <div className="xpo-copy">
        <span className="xv-eb">{W.eyebrow}</span><h2 id="xp-h-still" className="xpo-h" data-testid="xp-still-title">{W.title}</h2>
        <p className="xpo-line" data-testid="xp-still-line">{W.line}</p>
        <p className="xpo-run" data-testid="xp-still-credits">
          <RunChip c={chipOfFeatured(f)} testId="xp-still-chip" />
          {/* the still's own run, when it has one (featured `from`) */}
          {f.from?.map((r) => <RunChip key={r.jobId} c={chipOfRun(r, W.stillLabel.toLowerCase())} testId="xp-still-source" />)}
          <small className="xpo-specs" data-testid="xp-still-length">{specs}</small>
        </p>
        <span className="xpo-acts">
          <button type="button" className="xpo-replay" onClick={() => setReplay((n) => n + 1)} data-testid="xp-still-replay" aria-label="Replay the reveal" title="Replay the reveal"><ResetIcon size={16} /><span>Replay</span></button>
          <Link to={rec} className="xv-btn" data-testid="xp-still-recreate">Recreate this shot<Arrow /></Link>
        </span>
      </div>
      <div className="xpo-stack">
        <figure className="xpo-back" aria-hidden><img src={still.url} alt="" loading="lazy" decoding="async" draggable={false} /><figcaption>{W.stillLabel}</figcaption></figure>
        <HeroReel className="hreel-framed xpo-film xpo-front" testId="xp-still-wipe" reveal replay={replay} position={t.pos} sound={f.out.sound === true} restartOnSound label={`${f.title}, made with ${f.model}`}
          before={{ url: still.url, poster: still.url, label: W.stillLabel }} after={{ url: f.out.url, poster: FEATURED_BIG_POSTER[f.key] ?? f.out.poster, label: W.clipLabel }} />
      </div>
    </div>
  </section>;
}

/* ============================================================== Keep the shot going (MiniMax H3, then H3 Extend) ============================================================== */
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/** Shows off Extend: one take made of a 10 s MiniMax H3 start and a 10 s H3 Extend, in a letterbox whose foot is the timeline: the progress line,
 *  a seam at each join, and each segment labelled under it (Start · MiniMax H3 → +10 s · H3 Extend → the end card added in the edit, quiet:
 *  not a model). Under it the run line: H3 Extend · Comfy Cloud · $1.32 total, "+1 step" opens start → extend. Extend a clip opens Video › Extend. */
export function XpKoi() {
  const K = EXPLORE_KOI; const f = featuredByKey(K.key); const fill = useRef<HTMLElement>(null); const [failed, setFailed] = useState(false); const [at, setAt] = useState(0);
  if (!f?.before) return null;
  /* total: Explore's file as it plays (the take, then the end card added after, EXPLORE_KOI.ending); take: the generated take alone (the featured `out`), what the sum and the run line describe */
  const rec = featuredRecreateHref(f.key) ?? K.cta.href; const take = f.out.sec ?? 20; const total = K.ending.sec; const first = f.before.sec ?? 10; const added = Math.round(take - first);
  const ending = Math.round(total - take); const start = f.from?.[0];
  const label = `${K.title} ${f.title}, made with ${start?.model ?? 'MiniMax H3'} and ${f.model}`;
  /* The progress line follows the clip every frame, without a re-render; the lit segment label changes only at a seam. */
  const onTick = (p: number) => { if (fill.current) fill.current.style.transform = `scaleX(${p.toFixed(4)})`; const t = p * total; const n = t < first ? 0 : t < take ? 1 : 2; setAt((v) => (v === n ? v : n)); };
  const segs = [{ w: first, k: 'start', top: `${K.segments.start} · ${Math.round(first)} s`, sub: start?.model ?? 'MiniMax H3' }, { w: take - first, k: 'extend', top: `${K.segments.extend} · +${added} s`, sub: f.model },
    ...(ending > 0 ? [{ w: total - take, k: 'end', top: K.ending.label, sub: '' }] : [])];
  return <section className="xv-sec xpk" id="xp-koi" data-testid="xp-koi" aria-labelledby="xp-h-koi">
    <span className="xv-eb">{K.eyebrow}</span>
    <h2 id="xp-h-koi" className="xpk-h">{K.title}</h2>
    <div className={`xpk-frame${failed ? ' is-failed' : ''}`} data-testid="xp-koi-frame">
      {/* the clip's file lives in one place: the featured entry's `out` (shared/featured.ts) */}
      <ShowcaseFilm className="sfilm-letterbox" testId="xp-koi-film" label={label} take={f.key} onTake={() => 0} restartOnSound onTick={onTick} onFail={() => setFailed(true)}
        takes={[{ key: f.key, url: K.ending.url, poster: FEATURED_BIG_POSTER[f.key] ?? f.out.poster, label: f.title, sound: f.out.sound }]} />
      {/* the timeline: one line, a seam at each join, each segment named under it */}
      <div className="xpk-time" data-testid="xp-koi-track">
        <span className="xpk-line" aria-hidden><i ref={fill} /><em style={{ left: `${(first / total) * 100}%` }} title={`${clock(first)}, the join`} data-testid="xp-koi-join" />
          {ending > 0 && <u style={{ left: `${(take / total) * 100}%` }} title={`${clock(take)}, the end card`} data-testid="xp-koi-ending" />}</span>
        <ol className="xpk-segs" aria-label="How the take was made">{segs.map((x, k) => <li key={x.k} className={`xpk-seg is-${x.k}${at === k ? ' on' : ''}`} style={{ flexGrow: x.w }} data-testid={`xp-koi-seg-${x.k}`}>
          <b>{x.top}</b>{x.sub && <span>{x.sub}</span>}</li>)}</ol>
      </div>
    </div>
    <p className="xpk-eq" data-testid="xp-koi-eq">
      <span className="xpk-f"><img src={f.before.poster} alt="The first 10 seconds: the boy holds the lantern" loading="lazy" decoding="async" draggable={false} />{Math.round(first)} s</span><span aria-hidden>+</span>
      <span className="xpk-f"><img src={K.newFrame} alt="The new 10 seconds: the koi swims up to the moon" loading="lazy" decoding="async" draggable={false} />{added} s</span><span className="xpk-is" aria-hidden>=</span>
      <span className="xpk-f">one {Math.round(take)} s take</span>
    </p>
    <span className="xpk-meta"><RunChip testId="xp-koi-run" c={chipOfFeatured(f, { role: `Extend, +${added} s`, also: f.from ?? [] })} /></span>
    <span className="xpk-ctas"><Link to={K.cta.href} className="xv-btn" data-testid="xp-koi-cta">{K.cta.label}<Arrow /></Link><Link to={rec} className="xv-quiet" data-testid="xp-koi-recreate">Recreate this take</Link></span>
  </section>;
}

/* ============================================================== a chapter's copy column (shared by every chapter) ============================================================== */
interface ChapterStep { n: number; name: string; line: React.ReactNode }
/** The chapter's left column: eyebrow, a stacked headline (capitals via CSS), its line, numbered steps (the last one highlighted: the run itself),
 *  then the CTA and Recreate. Sticky beside the media on a wide screen. */
export function ChapterText({ id, eyebrow, title, line, steps, cta, rec, recLabel }: { id: string; eyebrow?: string; title: string[]; line: string; steps: ChapterStep[];
  cta: { label: string; href: string }; rec: string; recLabel: string }) {
  return <div className="xps-text">
    {eyebrow && <span className="xv-eb">{eyebrow}</span>}
    <h2 id={`xp-h-${id}`} className="xps-h">{title.map((l) => <span key={l}>{l}</span>)}</h2>
    <p className="xps-p">{line}</p>
    <ol className="xps-steps">{steps.map((x, k) => <li key={x.n} className={k === steps.length - 1 ? 'on' : ''} data-testid={`xp-${id}-step-${x.n}`}><b>{x.n}</b><span><strong>{x.name}</strong>{typeof x.line === 'string' ? <small>{x.line}</small> : x.line}</span></li>)}</ol>
    <span className="xps-ctas"><Link to={cta.href} className="xv-btn" data-testid={`xp-${id}-cta`}>{cta.label}<Arrow /></Link><Link to={rec} className="xv-quiet" data-testid={`xp-${id}-recreate`}>{recLabel}</Link></span>
  </div>;
}

/* ============================================================== Chapter 1: swap a character ============================================================== */
/** the two runs with their featured entries (model, place, price, files) */
function swapRuns() {
  return EXPLORE_SWAP.runs.map((r) => { const f = featuredByKey(r.key); if (!f) return null; const play = f.sharp ?? f.out;
    return { r, f, url: play.url, poster: FEATURED_BIG_POSTER[f.key] ?? f.out.poster.replace(/-480\.webp$/, '.webp'), rec: featuredRecreateHref(f.key) ?? '/', photos: (f.input.refUrls as string[] | undefined) ?? [],
      chip: chipOfFeatured(f) }; }).filter((x): x is NonNullable<typeof x> => !!x);
}
type SwapRunView = ReturnType<typeof swapRuns>[number];
/** both results ship as their Topaz upscale: one line that says so, with the upscale's model, place and price */
const SwapUpscaled = ({ runs }: { runs: SwapRunView[] }) => { const h = runs.map((x) => x.f.sharp); const s = h[0]; if (!s) return null;
  const both = runs.length > 1 && h.every((x) => x && x.model === s.model && x.costUsd === s.costUsd);
  return <p className="xps-upscaled on" data-testid="xp-swap-upscaled"><i aria-hidden />{both ? 'Both upscaled' : 'Upscaled'}<span>·</span>{s.model}<span>·</span>{s.place}<span>·</span><b>+${s.costUsd.toFixed(2)}{both ? ' each' : ''}</b></p>; };
/** a result's run line, under its media (the Explore rule): model · where it ran · price, then the photos it started from ("from 2 photos") and Recreate */
const SwapRunLine = ({ run }: { run: SwapRunView }) => { const n = run.photos.length; return <div className="xsw-run">
  <RunChip c={run.chip} testId={`xp-swap-chip-${run.r.key}`} />
  <span className="xsw-act"><span className="xsw-from"><span className="xsd-faces" role="img" aria-label={`${run.r.photos}: who they become`}>{run.photos.map((u) => <img key={u} src={u} alt="" loading="lazy" decoding="async" draggable={false} />)}</span>
    <small>from {n} photo{n === 1 ? '' : 's'}</small></span>
    <Link to={run.rec} className="xsw-rec" data-testid={`xp-swap-recreate-${run.r.key}`}>Recreate<Arrow /></Link></span></div>; };

/** Chapter 1, "Same dance. Two new casts." (2026-11-02, the user's pick A): three in a row, all in step (shared useSyncClips: the original leads and
 *  carries the sound): Original | she changes (H3 Character Swap) | they both change (Kling 3.0 Omni Edit). Nothing sits on the clips: a short label
 *  and the run line under each, the one sound button (shared SoundToggle) under the original. Reduced motion: the three frames at 5 s, so they match. */
export function XpSwap() {
  const S = EXPLORE_SWAP; const runs = swapRuns(); const g = useSyncClips(3); if (runs.length < 2) return null;
  const media = (i: number, url: string, poster: string, alt: string) => g.still ? <img className="xsw-media" src={poster} alt={alt} draggable={false} /> : <video {...g.clip(i)} className="xsw-media" src={url} poster={poster} aria-label={alt} />;
  return <section className="xv-sec xsdc xsw" id="xp-swap" data-testid="xp-swap" aria-labelledby="xp-h-swap">
    <header className="xsdc-head">
      <h2 id="xp-h-swap" className="xps-h xsdc-h">{S.title.map((l) => <span key={l}>{l}</span>)}</h2>
      <p className="xps-p xsdc-p">{S.line}</p>
    </header>
    <div ref={g.root} className="xsw-trio" data-testid="xp-swap-trio">
      <figure className="xsw-cell is-orig" data-testid="xp-swap-original">
        <div className="xsw-frame">{media(0, S.original.url, S.original.poster5, 'The original dance: two dancers')}</div>
        <figcaption className="xsw-cap"><span className="xsw-name"><b>{S.original.label}</b><small>{S.original.sub}</small></span>
          {!g.still && <span className="xsw-snd"><SoundToggle on={g.sound.lit} waiting={g.sound.waiting} label={g.sound.hint} onToggle={g.toggleSound} testId="xp-swap-sound" /></span>}</figcaption>
      </figure>
      {runs.map((x, k) => <figure key={x.r.key} className="xsw-cell" data-testid={`xp-swap-run-${x.r.key}`}>
        <div className="xsw-frame">{media(k + 1, x.url, x.r.poster5 ?? x.poster, `${x.r.who}: the same dance, ${x.f.model}`)}</div>
        <figcaption className="xsw-cap"><span className="xsw-name"><b>{x.r.who}</b></span><SwapRunLine run={x} /></figcaption>
      </figure>)}
    </div>
    <div className="xsdc-foot"><SwapUpscaled runs={runs} /><span className="xps-ctas">{runs.map((x, k) => <Link key={x.r.key} to={x.r.cta.href} className={k ? 'xv-quiet' : 'xv-btn'} data-testid={`xp-swap-cta-${x.r.key}`}>{x.r.cta.label}{!k && <Arrow />}</Link>)}</span></div>
  </section>;
}

/* ============================================================== Chapter 2: image to layers ============================================================== */
export function XpLayers() {
  const S = EXPLORE_LAYERS; const f = featuredByKey(S.key); const ls = f?.layers;
  const [failed, setFailed] = useState(false); const [still] = useState(prefersReducedMotion); const [restart, setRestart] = useState(0); const box = useRef<HTMLDivElement>(null);
  /* the shared sound director owns the animation's sound (HoverClip `directed`) */
  const snd = useDirectedSound({ root: box, media: () => box.current?.querySelector('video') ?? null, sound: S.film.sound === true && !still && !failed });
  /* sound on from its button: from 0, so each layer's sound lands on its layer */
  const onSound = () => { if (snd.toggle()) setRestart((n) => n + 1); };
  if (!f?.before || !ls?.length) return null;
  const rec = featuredRecreateHref(f.key) ?? S.cta.href; const size: [number, number] = [f.out.width, f.out.height];
  const steps = [...S.steps, { n: 3, name: `${ls.length} layers`, line: <RunChip c={chipOfFeatured(f, { model: S.model })} testId="xp-layers-chip" /> }];
  return <section className="xv-sec xps xpy" id="xp-layers" data-testid="xp-layers" aria-labelledby="xp-h-layers">
    <ChapterText id="layers" title={S.title} line={S.line} steps={steps} cta={S.cta} rec={rec} recLabel="Recreate this one" />
    <div ref={box} className="xps-media xpy-media">
      {/* the animation carries its own label (top left): only the sound toggle sits over it (bottom right) */}
      <Link to={rec} className="xpy-film" data-testid="xp-layers-film" aria-label={`${S.film.label}. Recreate this one`}><HoverClip src={S.film.url} poster={S.film.poster} mode="view" label={S.film.label} directed restart={restart} onFail={() => setFailed(true)} /></Link>
      {S.film.sound === true && !still && !failed && <SoundToggle on={snd.lit} waiting={snd.waiting} label={snd.hint} onToggle={onSound} testId="xp-layers-sound" />}
    </div>
    <div className="xpy-strip" data-testid="xp-layers-strip">
      <Link to={rec} className="xpy-in" data-testid="xp-layers-input" aria-label="The input poster. Recreate this one"><img src={f.before.poster} alt="The input: a pet-food poster" loading="lazy" decoding="async" draggable={false} /><span className="xv-tag">{S.input}</span></Link>
      <span className="xpy-arrow" aria-hidden>→</span>
      <ol className="xpy-layers" aria-label={`The ${ls.length} layers`}>{S.order.map((k) => ls[k] && <li key={k} className="xpy-layer" data-testid={`xp-layers-tile-${k}`}>
        <LayerTile layer={ls[k]} size={size} alt={ls[k].label} /><span className="xpy-lbl" title={ls[k].label}>{ls[k].label}</span></li>)}</ol>
    </div>
  </section>;
}

/* ============================================================== One idea. Every look. ============================================================== */
/** One prompt in twelve looks (EXPLORE_LOOKS: FLUX.2 [klein] 4B and Qwen Image 2.1, each credited): the copy on the left, the look in a big 16:9 frame on the right, twelve tiles
 *  under both. Hovering, focusing or tapping a tile shows its look (a crossfade; reduced motion: a cut). */
export function XpLooks() {
  const L = EXPLORE_LOOKS; const [cur, setCur] = useState(L.start); const now = L.looks[cur];
  return <section className="xv-sec xlk" id="xp-looks" data-testid="xp-looks" aria-labelledby="xp-h-looks">
    <div className="xlk-text">
      <span className="xv-eb">{L.eyebrow}</span>
      <h2 id="xp-h-looks" className="xps-h xlk-h">{L.title.map((l) => <span key={l}>{l}</span>)}</h2>
      <p className="xps-p">{L.line}</p>
      <span className="xps-ctas"><Link to={L.cta.href} className="xv-btn" data-testid="xp-looks-cta">{L.cta.label}<Arrow /></Link></span>
    </div>
    <div className="xlk-media"><figure className="xlk-frame" data-testid="xp-looks-frame">
      {L.looks.map((l, k) => <img key={l.id} src={l.url} alt={k === cur ? `${l.name}: a woman in a red coat on a city street, ${L.model}` : ''} aria-hidden={k !== cur || undefined}
        className={k === cur ? 'on' : undefined} loading="lazy" decoding="async" draggable={false} />)}
      <figcaption className="xlk-cap" aria-live="polite" data-testid="xp-looks-name">{now.name}</figcaption>
    </figure>
    {/* the run line under the frame; it changes with the look (FLUX.2 [klein] 4B or Qwen Image 2.1) and glows once when the model does */}
    <div className="xlk-run"><span key={now.model} className="xlk-meta" data-testid="xp-looks-model"><RunChip c={{ model: now.model, place: LOCAL_LABEL, price: 'Free' }} testId="xp-looks-chip" /></span>
      <span className="xlk-count" data-testid="xp-looks-count">{cur + 1} / {L.looks.length}</span></div></div>
    <div className="xlk-tiles" role="group" aria-label="Looks">{L.looks.map((l, k) => <button key={l.id} type="button" className={k === cur ? 'on' : undefined} aria-pressed={k === cur}
      onMouseEnter={() => setCur(k)} onFocus={() => setCur(k)} onClick={() => setCur(k)} data-testid={`xp-looks-tile-${l.id}`}>
      <img src={l.thumb} alt="" loading="lazy" decoding="async" draggable={false} /><span>{l.name}</span></button>)}</div>
  </section>;
}

/* ============================================================== the agent builds the board ============================================================== */
export function XpBoard() {
  const B = EXPLORE_BOARD;
  return <section className="xv-sec xpb-sec" id="xp-board" data-testid="xp-board" aria-labelledby="xp-h-board">
    <header className="xv-head"><div><span className="xv-eb">{EXPLORE_BOARD.eyebrow}</span><h2 id="xp-h-board">{EXPLORE_BOARD.title}</h2><p>{EXPLORE_BOARD.line}</p></div>
      <Link to={EXPLORE_BOARD.cta.href} className="xv-btn" data-testid="xp-board-cta">{EXPLORE_BOARD.cta.label}<Arrow /></Link></header>
    <figure className="xpb-recording" aria-describedby="xp-board-caption xp-board-disclosure">
      {/* Same player as the hero: loops on screen, pauses off screen / in a hidden tab, reduced motion is manual.
           Scoped styles retain the full 8:5 capture, without shading or transport covering the board. */}
      <ShowcaseFilm className="xpb-player" testId="xp-board-film" label="Canvas product-shots workflow recording"
        take="canvas-demo" onTake={() => 0} controls restartOnSound
        takes={[{ key: 'canvas-demo', url: B.recording.url, poster: B.recording.poster, label: B.recording.caption, sec: B.recording.sec, sound: true }]} />
      <figcaption className="xpb-caption">
        <strong id="xp-board-caption">{B.recording.caption}</strong>
        <span>{Math.round(B.recording.sec)} s · Narrated screen recording</span>
      </figcaption>
    </figure>
    <p className="xpb-disclosure" id="xp-board-disclosure">{B.recording.disclosure}</p>
  </section>;
}

/* ============================================================== Audio: SyteSim dances ============================================================== */
type Beat = { url: string; peaks: number[]; duration: number };
export function XpDance() {
  const [mood, setMood] = useState(EXPLORE_MOODS[0].id); const m = EXPLORE_MOODS.find((x) => x.id === mood) ?? EXPLORE_MOODS[0];
  const beats = useRef(new Map<string, Beat>()); const [beat, setBeat] = useState<Beat | null>(null); const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false); const [t, setT] = useState(0); const audio = useRef<HTMLAudioElement>(null); const stage = useRef<HTMLDivElement>(null);
  const style = useMemo(() => detectStyle({ prompt: m.words, kind: 'music' }), [m.words]);
  useAudioViz(stage, audio, playing, { peaks: beat?.peaks ?? [], duration: beat?.duration ?? 0, kind: 'music' });
  useEffect(() => () => { for (const b of beats.current.values()) URL.revokeObjectURL(b.url); }, []);
  const load = async (id: string): Promise<Beat | null> => { const x = EXPLORE_MOODS.find((y) => y.id === id)!; const hit = beats.current.get(id); if (hit) return hit;
    setBusy(true); try { const b = await renderBeat({ bpm: x.bpm, feel: x.feel }); beats.current.set(id, b); return b; } catch { return null; } finally { setBusy(false); } };
  const play = async (id = mood) => { primeAudio(); const b = await load(id); const el = audio.current; if (!b || !el) return; if (beat?.url !== b.url) { setBeat(b); el.src = b.url; } el.currentTime = 0; await el.play().catch(() => setPlaying(false)); };
  const toggle = () => { const el = audio.current; if (playing && el) { el.pause(); return; } void play(); };
  const choose = (id: string) => { setMood(id); if (playing) { audio.current?.pause(); window.setTimeout(() => void play(id), 60); } };
  const bars = beat?.peaks ?? Array.from({ length: 96 }, (_, k) => 0.25 + 0.5 * Math.abs(Math.sin(k * 0.61) * Math.cos(k * 0.17)));
  return <section className="xv-sec xpd" id="xp-dance" data-testid="xp-dance" aria-labelledby="xp-h-dance">
    <div className="xpd-text">
      <span className="xv-eb">{EXPLORE_DANCE.eyebrow}</span>
      <h2 id="xp-h-dance" className="xpd-h">{EXPLORE_DANCE.title.split(/(?<=\.) /).map((l) => <span key={l}>{l}</span>)}</h2>
      <p className="xpd-p">{EXPLORE_DANCE.line}</p>
      <div className="xpd-moods" role="radiogroup" aria-label="Mood">{EXPLORE_MOODS.map((x) => <button key={x.id} type="button" role="radio" aria-checked={x.id === mood} className={`xpd-mood${x.id === mood ? ' on' : ''}`} data-testid={`xp-dance-mood-${x.id}`} onClick={() => choose(x.id)}><i data-pack={detectStyle({ prompt: x.words, kind: 'music' }).pack} aria-hidden />{x.label}</button>)}</div>
      <span className="xps-ctas"><button type="button" className="xv-btn" onClick={toggle} aria-pressed={playing} data-testid="xp-dance-play">{busy ? 'Making the beat…' : playing ? 'Pause' : `Play a ${m.label.toLowerCase()} beat`}<SoundIcon size={16} /></button>
        <Link to={EXPLORE_DANCE.cta.href} className="xv-quiet" data-testid="xp-dance-cta">{EXPLORE_DANCE.cta.label} →</Link></span>
      <p className="xpd-note">{EXPLORE_DANCE.note}</p>
    </div>
    <div ref={stage} className={`ac ac-has-cover xpd-stage${playing ? ' is-playing' : ''}`} data-kind="music">
      <div className="ac-cover xpd-cover" onClick={toggle} role="button" tabIndex={0} aria-label={playing ? 'Pause the beat' : 'Play the beat'} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}>
        <AudioCover seed={`explore-dance-${mood}`} prompt={m.words} kind="music" />
        <AudioVizLayer kind="music" playing={playing} prompt={m.words} chip={false} src={null} />
        <span className="xpd-mode" data-pack={style.pack}><i aria-hidden />{style.label} mode</span>
        {playing && <span className="ac-now" aria-hidden><span className="ac-eq"><i /><i /><i /></span>Playing</span>}
      </div>
      <div className="ac-row"><Waveform className="ac-wave" state={beat ? 'ready' : 'fallback'} bars={bars} time={t} duration={beat?.duration ?? 0} decorative label="The beat" />
        <span className="ac-dur">{beat ? `${Math.floor(t)} / ${Math.round(beat.duration)} s` : '--'}</span></div>
      <div className="ac-body"><span className="ac-title">SyteSim · {m.label}</span><div className="ac-meta"><span className="ac-model">Dances on every track in Audio</span><span className="ac-price"><FreeDot>In your browser</FreeDot></span></div></div>
      <audio ref={audio} loop preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} />
    </div>
  </section>;
}

/* ============================================================== One character. Every angle. ============================================================== */
const two = (n: number) => String(n).padStart(2, '0');
export function XpSheets() {
  const S = EXPLORE_SHEETS; const cast = S.cast.map((c) => ({ c, f: featuredByKey(c.key) })).filter((x): x is { c: (typeof S.cast)[number]; f: FeaturedItem } => !!x.f);
  const root = useRef<HTMLElement>(null); const [cur, setCur] = useState(0); const [step, setStep] = useState(0); const [paused, setPaused] = useState(false);
  const [still] = useState(prefersReducedMotion); const [seen, setSeen] = useState(false); const [spin, setSpin] = useState(false); const [wipe, setWipe] = useState(0);
  /* the highlight steps only while the section is on screen (and not paused, not under reduced motion, not while the 3D model is up) */
  useEffect(() => { const el = root.current; if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.3 }); io.observe(el); return () => io.disconnect(); }, []);
  const now = cast[cur] ?? cast[0]; const n = (now?.c.panels.length ?? 0) + 1;
  useEffect(() => { if (!now || paused || still || spin || !seen) return; const t = window.setTimeout(() => setStep((v) => (v + 1) % n), (step === 0 ? 1.6 : 1) * S.dwell); return () => window.clearTimeout(t); }, [step, cur, paused, still, spin, seen, n, S.dwell, now]);
  if (!now) return null;
  const { c, f } = now; const W = f.out.width, H = f.out.height; const rec = featuredRecreateHref(f.key) ?? IMAGE_PAGE;
  const pick = (k: number) => { setCur(k); setStep(0); setSpin(false); setWipe((w) => w + 1); };
  const panel = step > 0 ? c.panels[step - 1] : null; const name = panel ? panel[0] : 'Whole sheet';
  const box = panel ? { left: `${(panel[1] / W) * 100}%`, top: `${(panel[2] / H) * 100}%`, width: `${(panel[3] / W) * 100}%`, height: `${(panel[4] / H) * 100}%` } : { left: '0%', top: '0%', width: '100%', height: '100%' };
  const low = !!panel && panel[2] / H < 0.08; const td = c.threeD; const on3d = !!td && spin;
  return <section ref={root} className="xv-sec xpk xpc" id="xp-sheets" data-testid="xp-sheets" aria-labelledby="xp-h-sheets">
    <span className="xv-eb">{S.eyebrow}</span>
    <h2 id="xp-h-sheets" className="xpk-h">{S.title}</h2>
    <p className="xpk-p xpc-p">{S.line}</p>
    <div className="xpk-frame xpc-frame" data-testid="xp-sheets-frame">
      <div className="xpk-bar"><span className="xpk-tc" aria-live="polite" data-testid="xp-sheets-panel">{on3d ? <><i /><b>3D</b> · TURN AND ORBIT</> : <><i /><b>PANEL {two(step + 1)} / {two(n)}</b> · {name.toUpperCase()}</>}</span>
        <span className="xpk-models">{on3d ? <>{c.full.toUpperCase()}<i>/</i>{Math.round(td!.faces / 1000)}k faces</> : <>{c.full.toUpperCase()}<i>/</i>{W} × {H}</>}</span></div>
      <div className="xpc-stage" data-testid="xp-sheets-stage">
        {on3d ? <div className="xpc-3d" data-testid="xp-sheets-3d"><Model3D src={td!.url} alt={`${c.full} as a 3D model`} slot="explore-sheets-3d" pri={1} autoRotate={!still} testId="xp-sheets-model" /></div>
          : <div className="xpc-fit"><div key={`${c.key}-${wipe}`} className={`xpc-sheet${still ? '' : ' is-reveal'}`} style={{ ['--ar' as string]: `${W / H}` }}>
            <img src={f.out.url} alt={`${c.full}: the whole character sheet, ${f.model}`} decoding="async" draggable={false} />
            <span className={`xpc-hl${panel ? ' on' : ''}${low ? ' low' : ''}`} style={box} aria-hidden><b>{name}</b></span>
          </div></div>}
      </div>
      {!on3d && <div className="xpk-bar xpc-foot" role="group" aria-label="Panels">{['Whole sheet', ...c.panels.map((p) => p[0])].map((l, k) => <button key={l} type="button" className={`xpc-seg${k === step ? ' on' : ''}${k < step ? ' done' : ''}`}
        style={{ ['--dwell' as string]: `${(k === 0 ? 1.6 : 1) * S.dwell}ms` }} aria-pressed={k === step} onClick={() => { setStep(k); setPaused(true); }} data-testid={`xp-sheets-seg-${k}`}><span><i key={`${cur}-${step}`} /></span>{l}</button>)}</div>}
    </div>
    <div className="xpc-cast" role="tablist" aria-label="Character">{cast.map(({ c: x, f: y }, k) => <button key={x.key} type="button" role="tab" aria-selected={k === cur} className={k === cur ? 'on' : ''} onClick={() => pick(k)}
      title={`${x.style} · $${(y.costUsd ?? 0).toFixed(2)}`} data-testid={`xp-sheets-cast-${x.name.toLowerCase()}`}><img src={x.face} alt="" loading="lazy" decoding="async" />{x.name}<small>{x.style}</small></button>)}</div>
    <span className="xpk-meta"><RunChip c={chipOfFeatured(f, { spec: 'one image, one run' })} testId="xp-sheets-price" />
      {td && <RunChip c={{ ...chipOfRun({ jobId: td.jobId, model: td.model, place: td.place, costUsd: td.usd, est: true }), spec: 'the 3D model' }} testId="xp-sheets-3d-credit" />}</span>
    <span className="xpk-ctas"><Link to={rec} className="xv-btn" data-testid="xp-sheets-recreate">Recreate this sheet<Arrow /></Link>
      {td && <button type="button" className="xv-quiet xpc-q" aria-pressed={spin} onClick={() => setSpin((v) => !v)} data-testid="xp-sheets-spin">{spin ? 'Back to the sheet' : 'Spin him in 3D'}</button>}
      {!still && !on3d && <button type="button" className="xv-quiet xpc-q" aria-pressed={paused} onClick={() => setPaused((v) => !v)} data-testid="xp-sheets-pause">{paused ? 'Play' : 'Pause'}</button>}</span>
  </section>;
}

/* ============================================================== Mockup to film (Direct a Shot made real) ============================================================== */
export function XpFilm() {
  const F = EXPLORE_FILM; const f = featuredByKey(F.key); const [beat, setBeat] = useState<1 | 2 | 3>(1); const [jump, setJump] = useState<{ to: 'wait' | 'hold' | 'play'; n: number } | undefined>();
  if (!f?.before) return null;
  const rec = featuredRecreateHref(f.key) ?? F.cta.href; const b2 = F.beats[1];
  const onPhase = (p: ReelPhase) => setBeat(p === 'wait' ? 1 : p === 'sweep' || p === 'hold' ? 2 : 3);
  const go = (n: 1 | 2 | 3) => setJump((j) => ({ to: n === 1 ? 'wait' : n === 2 ? 'hold' : 'play', n: (j?.n ?? 0) + 1 }));
  /* the media keeps one role tag (Mockup / First frame / Film); models and prices live in the strip under it */
  const after = beat === 2 ? F.labels.first : F.labels.film; const total = chipUsd(F.beats.reduce((n, x) => n + x.usd, 0), F.beats.some((x) => x.est));
  return <section className="xv-sec xpk xpf" id="xp-film" data-testid="xp-film" aria-labelledby="xp-h-film">
    <span className="xv-eb">{F.eyebrow}</span>
    <h2 id="xp-h-film" className="xpk-h">{F.title}</h2>
    <p className="xpk-p xpf-p">{F.line}</p>
    <div className="xpk-frame xpf-frame" data-testid="xp-film-frame">
      {/* the clips live in the featured entry (shared/featured.ts 'ltx-mockup-film'): the mockup is its `before`, the film its `out` */}
      <HeroReel className="hreel-framed xpo-film xpf-film" testId="xp-film-wipe" reveal holdSweep parkAt={F.parkAt} onPhase={onPhase} jump={jump} sound={f.out.sound === true} restartOnSound
        label={`${f.title}, made with ${b2.model} and ${f.model}`} before={{ url: f.before.url, poster: f.before.url.replace(/\.mp4$/, '.webp'), label: F.labels.mockup }}
        after={{ url: f.out.url, poster: FEATURED_BIG_POSTER[f.key] ?? f.out.poster, label: after }} />
      <div className="xpf-bar" role="group" aria-label="The three passes">{F.beats.map((x) => <button key={x.n} type="button" className={`xpf-beat${beat >= x.n ? ' on' : ''}${beat === x.n ? ' is-now' : ''}`} aria-pressed={beat === x.n}
        onClick={() => go(x.n)} data-testid={`xp-film-beat-${x.n}`} title={x.tip}>
        <span className="xpf-b1"><i aria-hidden />{two(x.n)} · {x.step}</span><span className="xpf-b2">{x.model}</span>
        <span className="xpf-b3"><b data-testid={`xp-film-price-${x.n}`}>{chipUsd(x.usd, x.est)}</b> · {x.place}{x.note ? ` · ${x.note}` : ''}</span></button>)}
        {/* the pipeline's last cell: the whole price, the same "≈" as the step it comes from */}
        <span className="xpf-total" data-testid="xp-film-total"><span className="xpf-b1">Total</span><b>{total}</b><span className="xpf-b3">{F.beats.length} steps</span></span></div>
    </div>
    <span className="xpk-ctas"><Link to={rec} className="xv-btn" data-testid="xp-film-recreate">Recreate this shot<Arrow /></Link><Link to={F.cta.href} className="xv-quiet" data-testid="xp-film-cta">{F.cta.label}</Link></span>
    <p className="xpf-src">{F.credit}</p>
  </section>;
}

/* ============================================================== VFX with LTX-2.5 (Footage Effects + Layout to Render) ============================================================== */
/** One Footage Effects tile: the shipped before / after wipe when the effect has one, else a drawn before | after card saying the example is coming. */
function VfxCard({ t }: { t: VfxTile }) {
  const f = t.key ? featuredByKey(t.key) : undefined; const pair = !!f?.before;
  return <article className={`xpx-card${pair ? ' has-media' : ' is-pending'}`} data-testid={`xp-vfx-${t.id}`} data-fx={t.id}>
    <div className="xpx-media">
      {pair ? <HeroReel className="hreel-framed xpx-reel" testId={`xp-vfx-wipe-${t.id}`} sound={f!.out.sound === true} label={`${t.label}, made with ${t.model}`}
          before={{ url: f!.before!.url, poster: f!.before!.poster, label: 'Before' }} after={{ url: f!.out.url, poster: f!.out.poster, label: t.label }} />
        : <Link to={t.href} className="xpx-art" tabIndex={-1} aria-hidden><span className="xpx-half xpx-before"><i>Before</i></span><span className="xpx-half xpx-after"><i>{t.label}</i></span><span className="xpx-line" /></Link>}
      {!pair && <span className="xv-tag" data-testid={`xp-vfx-pending-${t.id}`}>{EXPLORE_VFX.pending}</span>}
    </div>
    <div className="xpx-body">
      <h3 className="xpx-t">{t.label}</h3>
      <p className="xpx-p">{t.tagline}</p>
      <span className="xpx-facts"><a className="xv-pill xv-pill-dark xpx-model" href={t.sourceUrl} target="_blank" rel="noreferrer" title={`${t.lora} on Hugging Face`} data-testid={`xp-vfx-model-${t.id}`}>LTX-2.5 22B · {t.lora} · {t.maker}</a>
        <span className="xv-pill xv-pill-free">{EXPLORE_VFX.place}</span></span>
      <span className="xpx-acts"><Link to={t.href} className="xv-btn xv-btn-sm" data-testid={`xp-vfx-try-${t.id}`}>Try it<Arrow /></Link>
        {pair && <Link to={featuredRecreateHref(t.key!, { preset: t.id }) ?? t.href} className="xv-quiet" data-testid={`xp-vfx-recreate-${t.id}`}>Recreate</Link>}</span>
    </div>
  </article>;
}
export function XpVfx() {
  const V = EXPLORE_VFX; const tiles = V.effects.map(vfxTile).filter((x): x is VfxTile => !!x); const L = V.layout; const f = featuredByKey(L.key);
  if (!tiles.length && !f) return null;
  const rec = f ? featuredRecreateHref(f.key) ?? f.recreateHref ?? V.cta.href : V.cta.href;
  return <section className="xv-sec xpx" id="xp-vfx" data-testid="xp-vfx" aria-labelledby="xp-h-vfx">
    <header className="xv-head"><div><span className="xv-eb">{V.eyebrow}</span><h2 id="xp-h-vfx">{V.title}</h2><p>{V.line}</p></div>
      <Link to={V.cta.href} className="xv-more" data-testid="xp-vfx-cta">{V.cta.label}<Arrow /></Link></header>
    <div className="xpx-grid">
      {f && <article className="xpx-card xpx-layout has-media" data-hover-play data-testid="xp-vfx-layout">
        <div className="xpx-media">
          {/* the Mockup to film clip, shipped once (shared/featured.ts 'ltx-mockup-film'): its mockup in the corner, the film behind */}
          <Link to={rec} className="xpx-play" aria-label={`${L.label}: ${f.title}, ${f.model}. Recreate`} tabIndex={-1}><HoverClip src={f.out.url} poster={FEATURED_BIG_POSTER[f.key] ?? f.out.poster} label={f.title} /></Link>
          {f.before && <span className="xpx-pip" aria-hidden><HoverClip src={f.before.url} poster={f.before.poster} /><i>Mockup</i></span>}
          <span className="xv-tag xv-tag-on">Made with Imagination</span>
        </div>
        <div className="xpx-body">
          <h3 className="xpx-t">{L.label}</h3>
          <p className="xpx-p">{L.tagline}</p>
          <span className="xpx-facts"><a className="xv-pill xv-pill-dark xpx-model" href={L.sourceUrl} target="_blank" rel="noreferrer" title={`${L.lora} on Hugging Face`} data-testid="xp-vfx-model-layout">LTX-2.5 22B · {L.lora} · {L.maker}</a>
            <span className="xv-pill xv-pill-dark" data-testid="xp-vfx-layout-paid">{placeOfRoute(f.route)}{f.costUsd != null ? ` · $${f.costUsd.toFixed(2)}` : ''}</span></span>
          <small className="xpx-note">{L.note}</small>
          <span className="xpx-acts"><Link to={rec} className="xv-btn xv-btn-sm" data-testid="xp-vfx-layout-recreate">Recreate this shot<Arrow /></Link>
            <a href={L.more.href} className="xv-quiet" data-testid="xp-vfx-layout-more" onClick={(e) => { const el = document.getElementById(L.more.href.slice(1)); if (!el) return; e.preventDefault(); el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); }}>{L.more.label}</a></span>
        </div>
      </article>}
      {tiles.map((t) => <VfxCard key={t.id} t={t} />)}
    </div>
    {tiles.some((t) => !t.key || !featuredByKey(t.key)?.before) && <p className="xpx-pending" data-testid="xp-vfx-pending-line"><i aria-hidden />{V.pendingLine}</p>}
    <p className="xpf-src xpx-src">{V.credit}</p>
  </section>;
}

/* ============================================================== Now it's your turn. ============================================================== */
/** The page's last section (EXPLORE_YOUR_TURN), full width: a dimmed, tilted wall of things made here drifting behind (only while on screen;
 *  reduced motion: still), and in the middle a prompt box whose "Make it" opens Create Image with the words in the bar, then the other tabs. */
export function XpYourTurn() {
  const Y = EXPLORE_YOUR_TURN; const root = useRef<HTMLElement>(null); const [on, setOn] = useState(false); const [text, setText] = useState('');
  useEffect(() => { const el = root.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting)); io.observe(el); return () => io.disconnect(); }, []);
  /* the credit names the models, then the 3D city's kits apart from them (they are assets, not models) */
  const all = [...new Set(Y.wall.flat().map((t) => t.model))]; const kits = all.filter((m) => /^3D city · /.test(m)).map((m) => m.replace(/^3D city · /, '')); const models = all.filter((m) => !/^3D city · /.test(m));
  return <section ref={root} className={`xyt${on ? ' on' : ''}`} id="xp-your-turn" data-testid="xp-your-turn" aria-labelledby="xp-h-your-turn">
    <div className="xyt-wall" aria-hidden><div className="xyt-tilt">{Y.wall.map((col, c) => <div key={c} className="xyt-col"><div className="xyt-track">
      {[...col, ...col].map((t, k) => <img key={k} src={t.src} alt="" loading="lazy" decoding="async" draggable={false} className={t.star ? 'is-star' : undefined} />)}</div></div>)}</div></div>
    <div className="xyt-in">
      <span className="xv-eb">{Y.eyebrow}</span>
      <h2 id="xp-h-your-turn" className="xyt-h">{Y.title.map((l) => <span key={l}>{l}</span>)}</h2>
      <p className="xyt-p">{Y.line}</p>
      <form className="xyt-box" onSubmit={(e) => { e.preventDefault(); goToWorkflow(yourTurnHref(text)); }} data-testid="xp-your-turn-form">
        <label className="sr-only-vis" htmlFor="xyt-prompt">Describe what you want to make</label>
        <input id="xyt-prompt" value={text} onChange={(e) => setText(e.target.value)} placeholder={`${Y.placeholder}…`} maxLength={4000} autoComplete="off" spellCheck data-testid="xp-your-turn-input" />
        <button type="submit" className="xv-btn" data-testid="xp-your-turn-make">{Y.make}<Arrow /></button>
      </form>
      <nav className="xyt-tabs" aria-label="Or start in">{Y.tabs.map((t) => <Link key={t.label} to={t.href} data-testid={`xp-your-turn-tab-${t.label.toLowerCase()}`}>{t.label}</Link>)}</nav>
      <small className="xyt-note">{Y.note}</small>
    </div>
    <p className="xyt-credit" data-testid="xp-your-turn-credit">On the wall: {models.join(' · ')}{kits.length > 0 && <span> · 3D city kits by {kits.join(', ')}</span>}</p>
  </section>;
}
