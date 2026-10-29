import type { Example } from './examples';
import { useNearView } from '../shared/useNearView';
/** Media tile: a looping example clip (muted, autoplay; paused under reduced motion) with optional badge/label overlays. */
export function hueOf(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export default function MediaArt({ seed, ex, webm, label, badge, ratio = '4/5', hue, children }: { seed: string; ex?: Example; webm?: string | null; hue?: number; label?: string; badge?: string; ratio?: string; children?: React.ReactNode }) {
  const [ref, near] = useNearView<HTMLDivElement>(); /* performance: the clip loads and plays when it nears the viewport (poster until then) */
  return (
    <div ref={ref} className={`art ${ex ? 'art-media' : ''}`} style={{ ['--h' as any]: hue ?? hueOf(seed), aspectRatio: ratio }}>
      {ex ? <video src={near ? webm || ex.src : undefined} poster={ex.poster || undefined} muted loop playsInline autoPlay={near && !reduced()} preload="metadata" aria-hidden /> : <><div className="art-orb" /><div className="art-grain" /></>}
      {badge && <span className="badge">{badge}</span>}
      {label && <span className="art-label">{label}</span>}
      {children}
    </div>
  );
}
