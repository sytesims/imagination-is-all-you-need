import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AvatarScene } from './avatarAudioSceneEngine';
import './avatarAudioScene.css';

/** Optional visual layer. ShowcaseFilm still owns every playback/sound decision. */
export function AvatarAudioScene({ portrait, speech, children }: {
  portrait: string; speech: string; children: (manual: boolean) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<AvatarScene | null>(null);
  const [mode, setMode] = useState<'pending' | 'scene' | 'fallback'>('pending');
  useEffect(() => {
    const el = root.current; if (!el) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    let disposed = false, loading = false, visible = false, stopped = false;
    let near: IntersectionObserver | undefined, view: IntersectionObserver | undefined;
    const fallback = () => {
      if (disposed) return;
      stopped = true;
      engine.current?.dispose(); engine.current = null;
      if (!disposed) setMode('fallback');
    };
    const load = () => {
      if (loading || disposed) return; loading = true;
      // Importing this module (and Three) happens only near the section, never at page load.
      void import('./avatarAudioSceneEngine').then(({ createAvatarScene }) => {
        if (disposed || stopped || motion.matches) return;
        try {
          engine.current = createAvatarScene(el, portrait, speech, fallback, () => { if (!disposed && !stopped) setMode('scene'); });
          engine.current.setVisible(visible);
        } catch { fallback(); }
      }).catch(fallback);
    };
    const lowPower = nav.connection?.saveData || (nav.deviceMemory != null && nav.deviceMemory <= 4)
      || (nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2);
    if (lowPower || motion.matches || typeof IntersectionObserver === 'undefined') fallback();
    else {
      near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near?.disconnect(); load(); } }, { rootMargin: '180px' });
      view = new IntersectionObserver(([e]) => { visible = e.isIntersecting; engine.current?.setVisible(visible); });
      near.observe(el); view.observe(el);
    }
    // Switching to reduced motion tears down GL/audio immediately. Returning keeps the safe native fallback.
    const change = () => { if (motion.matches) { near?.disconnect(); fallback(); } };
    motion.addEventListener('change', change);
    return () => {
      disposed = true; near?.disconnect(); view?.disconnect(); motion.removeEventListener('change', change);
      engine.current?.dispose(); engine.current = null;
    };
  }, [portrait, speech]);
  return <div ref={root} className={`aas aas-${mode}`} data-testid="avatar-audio-scene" data-scene={mode}
    onClickCapture={e => {
      const button = (e.target as Element).closest('button');
      // Native keyboard activation produces a trusted click too. No context creation on mount/hover.
      if (e.nativeEvent.isTrusted && button?.dataset.testid?.match(/-(play|replay|sound)$/)) engine.current?.gesture();
    }}>
    <span className="aas-card-shadow" aria-hidden />
    <svg className="aas-connection" aria-hidden><path className="aas-wire" /><path className="aas-energy" /><path className="aas-arrival" /></svg>
    <div className="aas-voice" aria-label="Voice clip input">
      <span className="aas-voice-label">Voice clip</span>
      <svg viewBox="0 0 120 24" aria-hidden><path className="aas-voice-wave" d="M0 12H120" /></svg>
      <span className="aas-voice-caption">Speech input</span>
    </div>
    <button type="button" className="aas-demo" data-testid="avatar-scene-play" onClick={() => {
      // Synchronous delegation inside this trusted activation: no second transport/media source.
      root.current?.querySelector<HTMLButtonElement>('[data-testid="xp-presenter-film-play"]')?.click();
    }}><span aria-hidden>▶</span> Play demo</button>
    <div key={mode === 'fallback' ? 'native' : 'enhanced'} className="aas-player">{children(mode !== 'fallback')}</div>
  </div>;
}
