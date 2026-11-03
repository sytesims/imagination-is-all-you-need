/**
 * One preset tile for every preset grid (Video's camera moves, modes, workflows and styles; usable by Image's presets later).
 * Media priority: the preset's own preview clip → its own image → a camera move drawn as an icon card (MoveCard: the move's
 * glyph over a simple drawn scene that the move animates with CSS, recipe from shared/presetMotion.ts) → a plain dark tile.
 * Never a shared stock photo: every tile shows its own preset (shared/presetMedia.ts picks the media from the preset).
 * The caption is the only text: label in Space Grotesk, the small line (category or note) under it, never printed twice.
 * Clips and moves play while the tile is on screen (IntersectionObserver) or hovered; in a compact picker grid on hover / focus only, and
 * at rest each move shows its glyph large. Clips load metadata only, the smaller mp4 first. Under prefers-reduced-motion they stay still.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MOTION_WORDS, motionFor, type MotionGlyph, type MotionRecipe } from './presetMotion';
import './presetTile.css';

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

/** The drawn scene a move card moves: horizon, floor grid, a moon and a figure, in brand colours (no photo). */
const Scene = () => <svg className="pt-scene" viewBox="0 0 160 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
  <circle cx="112" cy="70" r="16" fill="rgba(255,122,26,.18)" />
  <path d="M0 108 Q40 92 80 102 T160 98 V200 H0Z" fill="rgba(255,255,255,.035)" />
  <g stroke="rgba(255,255,255,.12)" strokeWidth=".8" fill="none"><path d="M0 112H160M0 126H160M0 146H160M0 174H160" />
    <path d="M80 112 80 200M80 112 40 200M80 112 0 190M80 112 120 200M80 112 160 190M80 112 0 140M80 112 160 140" /></g>
  <g fill="rgba(247,247,248,.2)"><circle cx="58" cy="104" r="7" /><path d="M47 140c0-14 5-25 11-25s11 11 11 25z" /></g>
</svg>;

/** A camera move as an icon card: the drawn scene moved with CSS transforms (no photo, no generation) and the move's glyph, large, on top.
 *  `live` runs the move; otherwise it rests on its first frame. */
export function MotionPreview({ recipe, live }: { recipe: MotionRecipe; live: boolean }) {
  const vertigo = recipe.move === 'vertigo-in' || recipe.move === 'vertigo-out';
  return <span className={`pt-mo pt-mv-${recipe.move}`} data-live={live ? '1' : undefined} data-move={recipe.move} aria-hidden>
    <span className="pt-mo-l" style={recipe.origin ? { transformOrigin: recipe.origin } : undefined}>
      <Scene />
      {vertigo && <span className="pt-mo-in"><Scene /></span>}
    </span>
    {recipe.move === 'still' || recipe.move === 'timelapse' ? <span className="pt-grain" /> : null}
    <span className="pt-mo-g"><MotionGlyphIcon glyph={recipe.glyph} size={26} /></span>
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
  /** 'compact': the small tile of a picker popover (shared/LookPicker): smaller caption; same media and play rule */
  size?: 'default' | 'compact';
}

export function PresetTile({ label, sub, selected, onClick, testId, title, className = '', video, image, motion, media: own, badge, size = 'default' }: PresetTileProps) {
  const ref = useRef<HTMLButtonElement>(null); const vid = useRef<HTMLVideoElement>(null);
  const onScreen = useOnScreen(ref); const [hover, setHover] = useState(false);
  const hasVideo = !!(video && (video.mp4 || video.webm));
  const recipe = motion ? motionFor(motion.id, motion.category) : null;
  /* compact (a picker's grid) plays on hover / focus only, like the Workflows cards (the media budget lets 3 clips play at once anyway) */
  const compact = size === 'compact'; const live = compact ? hover && !reduced() : (onScreen && !reduced()) || hover;
  const showVideo = hasVideo;
  useEffect(() => { const v = vid.current; if (!v) return; if (live) v.play().catch(() => 0); else v.pause(); }, [live, showVideo]);
  /* one file, the smaller mp4 first (camera clips: mp4 ≈ half the webm); no poster → its own first frame (a media fragment) */
  const src = showVideo ? `${video!.mp4 || video!.webm}${video!.poster ? '' : '#t=0.05'}` : undefined;
  /* a play() sent while the clip is still loading can be dropped, so it starts again once data is there */
  const media = own != null ? own : showVideo
    ? <video ref={vid} src={src} muted loop playsInline preload="metadata" poster={video!.poster ?? undefined} onLoadedData={e => { if (live) e.currentTarget.play().catch(() => 0); }} aria-hidden />
    : image ? <img src={image} alt="" loading="lazy" decoding="async" />
    : recipe ? <MotionPreview recipe={recipe} live={live} />
    : <span className="pt-blank" aria-hidden />;
  return <button ref={ref} type="button" data-testid={testId} className={`pt${compact ? ' pt-sm' : ''} ${className} ${selected ? 'on' : ''}`.trim()} aria-pressed={selected ?? undefined}
    title={title} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}
    data-live={live ? '' : undefined}
    data-media={own != null ? 'own' : showVideo ? 'video' : image ? 'image' : recipe ? 'motion' : 'blank'}>
    <span className="pt-media">{media}</span>
    {badge}
    {selected && compact && <span className="pt-check" aria-hidden><svg width="10" height="10" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
    {recipe && compact && showVideo && own == null && <span className="pt-mo-g pt-mo-g-over" aria-hidden><MotionGlyphIcon glyph={recipe.glyph} size={26} /></span> /* at rest the move's glyph names it; it fades as the clip plays */}
    {recipe && <span className="pt-glyph" data-glyph={recipe.glyph} title={`The camera ${MOTION_WORDS[recipe.glyph]}`}><MotionGlyphIcon glyph={recipe.glyph} size={compact ? 11 : 14} /></span>}
    <span className="pt-c"><b>{label}</b>{sub ? <small>{sub}</small> : null}</span>
  </button>;
}
