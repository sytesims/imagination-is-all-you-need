/**
 * The orange bean: Imagination Is All You Need's little mascot (our own drawing, filled, 32px grid). A round brand-orange creature with two pointy ears,
 * one big shiny eye and one wink, rosy cheeks and a tiny smile. The ears are drawn under the head and share its outline, so they read as one
 * shape; a thin darker-orange rim keeps the silhouette crisp on light backgrounds and at 16px. `pop` plays a one-time 250 ms scale-in
 * (skipped with prefers-reduced-motion).
 */
import { useId } from 'react';
import './mascot.css';

export interface MascotProps { size?: number; /** true (default): the right eye winks; false: two open eyes. */ wink?: boolean; title?: string; className?: string; /** one-time gentle scale-in on mount */ pop?: boolean }

export const ORANGE = '#FF7A1A'; export const RIM = '#D95E0B'; export const INK = '#2A1A10'; export const BLUSH = '#FFD0B8';
/** Head and both ears as one outline (ears first, their base tucked inside the head). */
export const EARS = 'M8.3 6.5 6.8 1.9l5.6 2.6z M23.7 6.5l1.5-4.6-5.6 2.6z';
export const HEAD = 'M16 3c7.7 0 13 5.6 13 13.2C29 24 23.4 29 16 29S3 24 3 16.2C3 8.6 8.3 3 16 3z';

export default function Mascot({ size = 20, wink = true, title, className = '', pop = false }: MascotProps) {
  const id = useId().replace(/:/g, ''); const g = `ohf-bean-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`ohf-mascot${pop ? ' ohf-mascot-pop' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} data-testid="mascot">
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={g} gradientUnits="userSpaceOnUse" cx="12" cy="9" r="22"><stop offset="0" stopColor="#FF9A4D" /><stop offset=".5" stopColor={ORANGE} /><stop offset="1" stopColor="#F0660A" /></radialGradient>
      </defs>
      {/* rim: the silhouette stroked a little wider than the fill layer below, so a thin darker edge shows all round (no seam where the ears meet the head) */}
      <g stroke={RIM} strokeLinejoin="round" fill={RIM}><path d={EARS} strokeWidth="2.2" /><path d={HEAD} strokeWidth="1.2" /></g>
      {/* fill: ears (round-tipped by their own stroke), then the head over their base; one gradient in page space across both */}
      <path d={EARS} fill={`url(#${g})`} stroke={`url(#${g})`} strokeWidth="1" strokeLinejoin="round" /><path d={HEAD} fill={`url(#${g})`} />
      {/* inner ears */}
      <path d="M8.7 5.3 8 3.1l2.8 1.3z M23.3 5.3 24 3.1l-2.8 1.3z" fill={BLUSH} opacity=".7" />
      {/* cheeks */}
      <ellipse cx="8.4" cy="20" rx="2" ry="1.2" fill={BLUSH} opacity=".8" /><ellipse cx="23.6" cy="20" rx="2" ry="1.2" fill={BLUSH} opacity=".8" />
      {/* open eye, with two highlights */}
      <ellipse cx="11.6" cy="15.6" rx="2.4" ry="2.9" fill={INK} /><circle cx="12.5" cy="14.4" r=".85" fill="#fff" /><circle cx="11" cy="16.9" r=".45" fill="#fff" />
      {wink
        ? <path d="M18.2 16.2q2.2-2.1 4.4 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        : <><ellipse cx="20.4" cy="15.6" rx="2.4" ry="2.9" fill={INK} /><circle cx="21.3" cy="14.4" r=".85" fill="#fff" /><circle cx="19.8" cy="16.9" r=".45" fill="#fff" /></>}
      {/* smile */}
      <path d="M14.4 20.4q1.6 1.5 3.2 0" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
