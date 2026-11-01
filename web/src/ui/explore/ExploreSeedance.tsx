/**
 * Lighthouse premiere: the maintainer's own Seedance 2.0 run on Comfy Router, finished here for free. Its 2.39:1 picture fills the section;
 * the approved title sits over the initial poster and clears when the film actually plays. On a narrow screen the title sits above the film.
 * ShowcaseFilm's opt-in manual transport keeps seek/play/pause/replay/sound/fullscreen below subtitles and uses the page's sound director.
 * The film mounts only near the screen, always starts from a poster (reduced motion included), and keeps it if playback fails.
 * The real credits and Recreate remain the shared FilmCredit block and featured entry; no invented media metadata.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from '../../platform/router';
import { ShowcaseFilm } from '../../shared/ShowcaseFilm';
import { featuredByKey, featuredRecreateHref, type FeaturedItem } from '../../../../server/src/shared/featured';
import { EXPLORE_SEEDANCE } from '../../../../server/src/shared/exploreShowcase';
import { FilmCredit, type CreditCol } from './FilmCredit';
import { PlayIcon } from '../Icons';
import { turnSoundOn } from '../../shared/soundDirector';
import './exploreSeedance.css';

const Arrow = () => <span className="xv-arrow" aria-hidden>→</span>;

/** true once the box comes within a screen of the viewport (the player mounts then; a poster before) */
function useNear<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null); const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || near) return; if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '600px 0px' });
    io.observe(el); return () => io.disconnect();
  }, [near]);
  return [ref, near];
}

function Strip({ f }: { f: FeaturedItem }) {
  const S = EXPLORE_SEEDANCE.strip; const [box, near] = useNear<HTMLDivElement>(); const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false); const [ended, setEnded] = useState(false); const [seek, setSeek] = useState<{ t: number; n: number }>();
  const rec = featuredRecreateHref(f.key); const poster = S.cut.poster;
  const label = `${S.title} ${f.title}, made with ${f.model}`;
  const cols: CreditCol[] = [['Picture', [f.model, S.cut.picturePlace]], ...S.cut.credits];
  const watch = () => { turnSoundOn(); setSeek(s => ({ t: 0, n: (s?.n ?? 0) + 1 })); };
  return <div className={`xpsd-screen${started ? ' has-started' : ''}`}>
    <div ref={box} className={`xpsd-bleed${failed ? ' is-failed' : ''}`} data-testid="xp-seedance-strip">
      {near ? <ShowcaseFilm className="xpsd-film" testId="xp-seedance-film" label={label} take={f.key} onTake={() => 0} manual controls once seek={seek}
        onStart={() => setStarted(true)} onEnded={() => { setEnded(true); setStarted(false); }} onFail={() => { setFailed(true); setStarted(false); }}
        takes={[{ key: f.key, url: S.cut.url, poster, label: f.title, sound: true, sec: S.cut.sec }]} />
        : <img className="xpsd-poster" src={poster} alt="" loading="lazy" decoding="async" />}
      <header className="xpsd-head">
        <span className="xpsd-eyebrow">Made with Imagination · {Math.round(S.cut.sec)} sec</span>
        <h2 id="xp-h-seedance" className="xpsd-h" data-testid="xp-seedance-title">{S.title}</h2><p className="xpsd-p">{S.line}</p>
        {!started && !failed && <button type="button" className="xpsd-watch" onClick={watch} data-testid="xp-seedance-watch"><span><PlayIcon size={18} /></span>{ended ? 'Watch again' : 'Watch from the beginning'}</button>}
        {failed && <p className="xpsd-error" role="status">The film could not load. You can still recreate it or make your own.</p>}
      </header>
    </div>
    <div className="xpsd-under">
      <FilmCredit cols={cols} className="xpsd-cred" testId="xp-seedance-credit" />
      <div className="xpsd-footer"><span className="xpsd-note">Your imagination. Every frame.</span><span className="xpsd-acts">{rec && <Link to={rec} className="xv-quiet" data-testid="xp-seedance-recreate">Recreate</Link>}
        <Link to={EXPLORE_SEEDANCE.make.href} className="xv-btn" data-testid="xp-seedance-make">{EXPLORE_SEEDANCE.make.label}<Arrow /></Link></span></div>
    </div>
  </div>;
}

export function XpSeedance() {
  const f = featuredByKey(EXPLORE_SEEDANCE.strip.key);
  if (!f) return null;
  return <section className="xv-sec xpsd" id="xp-seedance" data-testid="xp-seedance" aria-labelledby="xp-h-seedance"><Strip f={f} /></section>;
}
