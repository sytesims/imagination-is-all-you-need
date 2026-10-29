/**
 * SoundToggle (2026-10-27, shared): the one sound button for every clip with sound (Explore's hero, the LTX cards, "From one still", the koi
 * take, the swap wipe, Image to layers; any player that uses ShowcaseFilm / HeroReel / HoverClip). A 40 px circle, bottom right inside the
 * media (15 px in): dark glass when off, the brand orange when on. Speaker / speaker-off icon, "Sound on" / "Sound off" for screen readers and
 * a tooltip. `waiting`: the viewer wants sound but the browser refused it before any gesture (it plays muted; a click turns it on).
 * `label`: a small hint pill beside the circle ("Click for sound"): the shared sound director shows it on the clip that would sound while the
 * page waits for its first gesture (shared/soundDirector.ts), and the page drops it as soon as sound is allowed.
 * The parent decides when it shows: only for a clip that really has sound, never under reduced motion or for a clip that failed to load.
 */
import { SoundIcon, SoundOffIcon } from '../ui/Icons';
import { soundToggleText } from './soundToggleState';
import './soundToggle.css';

export function SoundToggle({ on, onToggle, waiting = false, label = false, testId, className = '' }: {
  /** the clip plays with sound */ on: boolean; onToggle: () => void; /** wanted but refused by the browser until a gesture */ waiting?: boolean;
  /** show the small hint pill beside the circle */ label?: boolean; testId?: string; /** the page's own placement tweak */ className?: string;
}) {
  const t = soundToggleText(on, waiting); const lit = t.pressed;
  return <span className={`snd${label ? ' has-label' : ''}${className ? ` ${className}` : ''}`} data-sound={t.state}>
    {label && <span className="snd-label" aria-hidden data-testid={testId ? `${testId}-label` : undefined}>{t.label}</span>}
    <button type="button" className={`snd-toggle${lit ? ' is-on' : ''}${waiting ? ' is-waiting' : ''}`} aria-pressed={lit} aria-label={t.aria} title={t.tip}
      data-testid={testId} data-sound={t.state} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}>
      {lit ? <SoundIcon size={18} /> : <SoundOffIcon size={18} />}
    </button>
  </span>;
}
