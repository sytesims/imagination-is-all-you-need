/**
 * One preset tile for every preset grid (Video's camera moves, modes, workflows and styles; usable by Image's presets later).
 * Media priority: the preset's real preview video → its image → a live camera-move preview (MotionPreview: one of our own
 * showcase stills moved with CSS, recipe from shared/presetMotion.ts) → a plain dark tile. The caption is the only text:
 * label in Space Grotesk, the small line (category or note) under it, never printed twice.
 * Motion and preview videos play only while the tile is on screen (IntersectionObserver); under prefers-reduced-motion
 * they stay still and the corner glyph alone says what the move is.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SHOWCASE_HERO, showcaseById } from '../../../server/src/shared/showcase';
import { MOTION_WORDS, motionFor, type MotionGlyph, type MotionRecipe } from './presetMotion';
import './presetTile.css';

/** The still the camera-move previews move over: "Camel coat from below", a low-angle hero shot from our showcase (SHOWCASE_HERO). */
export const MOTION_STILL: string = showcaseById(SHOWCASE_HERO[2])?.thumb ?? '/showcase/032054ec-640.webp';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True while the element is (nearly) on screen. One shared observer for all tiles. */
const watchers = new Map<Element, (v: boolean) => void>(); let io: IntersectionObserver | null = null;
function useOnScreen(ref: React.RefObject<Element>): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver !== 'function') { setOn(true); return; }
    io ??= new IntersectionObserver(es => es.forEach(e => watchers.get(e.target)?.(e.isIntersecting)), { rootMargin: '80px' });
    watchers.set(el, setOn); io.observe(el);
    return () => { watchers.delete(el); io?.unobserve(el); };
  }, [ref]);
  return on;
}

const ARROW = 'M13 8H3M7 4 3 8l4 4';
const GLYPHS: Record<MotionGlyph, ReactNode> = {
  in: <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />,
  out: <path d="M13.5 2.5 9.5 6.5M9.5 3.5v3h3M2.5 13.5l4-4M6.5 12.5v-3h-3" />,
  left: <path d={ARROW} />,
  right: <path d={ARROW} transform="rotate(180 8 8)" />,
  up: <path d={ARROW} transform="rotate(90 8 8)" />,
  down: <path d={ARROW} transform="rotate(-90 8 8)" />,
  orbit: <><ellipse cx="8" cy="8.5" rx="6" ry="2.6" /><path d="m11.6 4.6 2 1.6-2.4.9" /><circle cx="8" cy="8.5" r="1.3" fill="currentColor" stroke="none" /></>,
  roll: <path d="M13 8a5 5 0 1 1-1.6-3.7M12 1.8v2.8H9.2" />,
  shake: <path d="m1.5 8 2-3 2 6 2.5-6 2.5 6 2-6 2 3" />,
  still: <path d="M5.5 2.5h5v3h-5zM8 5.5V9M8 9l-4 5M8 9l4 5M8 9v5" />,
  vertigo: <><rect x="5.5" y="5.5" width="5" height="5" rx=".6" /><path d="M2.5 5V2.5H5M11 2.5h2.5V5M13.5 11v2.5H11M5 13.5H2.5V11" /></>,
  focus: <><circle cx="8" cy="8" r="5" /><circle cx="8" cy="8" r="1.6" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2" /></>,
};

/** The small corner icon that names a move (arrow, orbit, roll…). */
export function MotionGlyphIcon({ glyph, size = 14 }: { glyph: MotionGlyph; size?: number }) {
  return <svg className="pt-glyph-i" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{GLYPHS[glyph]}</svg>;
}

/** A camera move played over one still with CSS transforms (no generation). `live` runs it; otherwise it rests on its first frame. */
export function MotionPreview({ recipe, image = MOTION_STILL, live }: { recipe: MotionRecipe; image?: string; live: boolean }) {
  const vertigo = recipe.move === 'vertigo-in' || recipe.move === 'vertigo-out';
  return <span className={`pt-mo pt-mv-${recipe.move}`} data-live={live ? '1' : undefined} data-move={recipe.move} aria-hidden>
    <span className="pt-mo-l" style={recipe.origin ? { transformOrigin: recipe.origin } : undefined}>
      <img src={image} alt="" loading="lazy" decoding="async" draggable={false} />
      {vertigo && <span className="pt-mo-in"><img src={image} alt="" loading="lazy" decoding="async" draggable={false} /></span>}
    </span>
    {recipe.move === 'still' || recipe.move === 'timelapse' ? <span className="pt-grain" /> : null}
  </span>;
}

export interface PresetTileProps {
  label: string;
  /** small line under the label (category, note); never repeated inside the media */
  sub?: string | null;
  selected?: boolean;
  onClick: () => void;
  testId?: string;
  /** what clicking really does (native tooltip) */
  title?: string;
  /** extra classes for the grid's sizing (e.g. "vs-ptile vs-vptile") */
  className?: string;
  /** real preview clip (wins over everything) */
  video?: { mp4?: string | null; webm?: string | null; poster?: string | null } | null;
  /** a still (poster / example art) when there is no clip */
  image?: string | null;
  /** a camera move to preview when there is neither (id + category → recipe); shows the corner glyph too */
  motion?: { id: string; category?: string | null } | null;
  /** own media drawn live (Relight's light sketch on the user's photo); wins over everything */
  media?: ReactNode;
  /** corner badge (New…) */
  badge?: ReactNode;
  /** 'compact': the small tile of a picker popover (shared/LookPicker): smaller caption, and the move or clip plays on hover / focus only */
  size?: 'default' | 'compact';
}

export function PresetTile({ label, sub, selected, onClick, testId, title, className = '', video, image, motion, media: own, badge, size = 'default' }: PresetTileProps) {
  const ref = useRef<HTMLButtonElement>(null); const vid = useRef<HTMLVideoElement>(null);
  const onScreen = useOnScreen(ref); const [hover, setHover] = useState(false);
  const hasVideo = !!(video && (video.mp4 || video.webm));
  const recipe = motion ? motionFor(motion.id, motion.category) : null;
  const compact = size === 'compact'; const live = compact ? hover && !reduced() : (onScreen && !reduced()) || hover;
  /* compact: a clip with no poster would sit black until hovered, so the still (or the move over our still) shows until then */
  const showVideo = hasVideo && !(compact && !live && !video!.poster && (image || recipe));
  useEffect(() => { const v = vid.current; if (!v) return; if (live) v.play().catch(() => 0); else v.pause(); }, [live, showVideo]);
  const media = own != null ? own : showVideo
    ? <video ref={vid} muted loop playsInline preload="metadata" poster={video!.poster ?? undefined} aria-hidden>{video!.webm && <source src={video!.webm} type="video/webm" />}{video!.mp4 && <source src={video!.mp4} type="video/mp4" />}</video>
    : image ? <img src={image} alt="" loading="lazy" decoding="async" />
    : recipe ? <MotionPreview recipe={recipe} live={live} />
    : <span className="pt-blank" aria-hidden />;
  return <button ref={ref} type="button" data-testid={testId} className={`pt${compact ? ' pt-sm' : ''} ${className} ${selected ? 'on' : ''}`.trim()} aria-pressed={selected ?? undefined}
    title={title} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}
    data-media={own != null ? 'own' : showVideo ? 'video' : image ? 'image' : recipe ? 'motion' : 'blank'}>
    <span className="pt-media">{media}</span>
    {badge}
    {selected && compact && <span className="pt-check" aria-hidden><svg width="10" height="10" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
    {recipe && <span className="pt-glyph" data-glyph={recipe.glyph} title={`The camera ${MOTION_WORDS[recipe.glyph]}`}><MotionGlyphIcon glyph={recipe.glyph} size={compact ? 11 : 14} /></span>}
    <span className="pt-c"><b>{label}</b>{sub ? <small>{sub}</small> : null}</span>
  </button>;
}
