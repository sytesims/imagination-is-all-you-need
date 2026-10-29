/** The Orbit mark, animated once on open (brand guide §6): the three arcs sweep in around the core one after another (~1.2 s), the core
 *  lights up with one soft pulse, then the whole mark turns very slowly. Geometry and colours are brand/logo-mark.svg's (48-unit grid,
 *  r 15.5, stroke 5.5, core r 6); nothing is recoloured or filtered. CSS only; prefers-reduced-motion shows the static mark. */
import './orbitIntro.css';

export function OrbitIntro({ size = 56, className = '' }: { size?: number; className?: string }) {
  return <svg className={`orbit-intro ${className}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden data-testid="orbit-intro">
    <g fill="none" stroke="#FF7A1A" strokeWidth="5.5" strokeLinecap="round">
      <path className="oi-arc" pathLength={1} d="M32.89 11.3A15.5 15.5 0 0 1 38.05 30.55" />
      <path className="oi-arc" pathLength={1} d="M30.55 38.05A15.5 15.5 0 0 1 11.3 32.89" />
      <path className="oi-arc" pathLength={1} d="M8.56 22.65A15.5 15.5 0 0 1 22.65 8.56" />
    </g>
    <circle className="oi-pulse" cx="24" cy="24" r="6" fill="#F7F7F8" />
    <circle className="oi-core" cx="24" cy="24" r="6" fill="#F7F7F8" />
  </svg>;
}
