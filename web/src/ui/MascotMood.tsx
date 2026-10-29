/**
 * The orange bean in a mood (our own drawings): one small scene per failure reason, used by shared/FailureState. Same head and ears as
 * ui/Mascot.tsx, drawn at 1.125× in a 64-unit canvas so there is room for a prop (wallet, key, cable, cloud…). Orange bean, soft-grey
 * props, one warm accent. Each scene has one gentle loop (breathing plus a small prop motion); all of it stops with prefers-reduced-motion.
 */
import { useId } from 'react';
import { ORANGE, RIM, INK, BLUSH, EARS, HEAD } from './Mascot';
import type { FailMood } from '../shared/failureReasons';
import './mascotMood.css';

const GREY = 'var(--mm-grey, #8E8E96)'; const FILL = 'var(--mm-fill, #34343B)'; const ACC = 'var(--mm-accent, #FFB357)';

/** Eyes and mouth in the bean's own 32-unit grid. */
type Eyes = 'open' | 'down' | 'up' | 'happy' | 'sleepy' | 'unsure';
const eye = (cx: number, cy: number, dx = 0, dy = 0, ry = 2.9) => <g key={cx}><ellipse cx={cx} cy={cy} rx="2.4" ry={ry} fill={INK} /><circle cx={cx + 0.9 + dx} cy={cy - 1.2 + dy} r=".85" fill="#fff" /><circle cx={cx - 0.6 + dx} cy={cy + 1.3 + dy} r=".45" fill="#fff" /></g>;
function Face({ eyes, mouth }: { eyes: Eyes; mouth: 'smile' | 'flat' | 'o' | 'wobble' | 'small' }) {
  const ink = { fill: 'none', stroke: INK, strokeWidth: 1.7, strokeLinecap: 'round' as const };
  return <g>
    <ellipse cx="8.4" cy="20" rx="2" ry="1.2" fill={BLUSH} opacity=".8" /><ellipse cx="23.6" cy="20" rx="2" ry="1.2" fill={BLUSH} opacity=".8" />
    {eyes === 'open' && [eye(11.6, 15.6), eye(20.4, 15.6)]}
    {eyes === 'down' && [eye(11.6, 16.4, -0.3, 0.9, 2.5), eye(20.4, 16.4, -0.3, 0.9, 2.5)]}
    {eyes === 'up' && [eye(11.8, 15.2, 0.4, -0.3), eye(20.6, 15.2, 0.4, -0.3)]}
    {eyes === 'happy' && <><path d="M9.4 16.4q2.2-2.4 4.4 0" {...ink} /><path d="M18.2 16.4q2.2-2.4 4.4 0" {...ink} /></>}
    {eyes === 'sleepy' && <><path d="M9.5 15.6q2.1 1.9 4.2 0" {...ink} /><path d="M18.3 15.6q2.1 1.9 4.2 0" {...ink} /></>}
    {eyes === 'unsure' && <>{eye(11.6, 15.8)}{eye(20.4, 15.4, 0, 0, 2.5)}<path d="M18.4 10.9q2.2-1.5 4.3.1" {...ink} strokeWidth={1.3} /></>}
    {mouth === 'smile' && <path d="M14.4 20.4q1.6 1.5 3.2 0" {...ink} strokeWidth={1.4} />}
    {mouth === 'small' && <path d="M14.9 20.6q1.1.9 2.2 0" {...ink} strokeWidth={1.3} />}
    {mouth === 'flat' && <path d="M14.8 21h2.4" {...ink} strokeWidth={1.3} />}
    {mouth === 'o' && <ellipse cx="16" cy="21.1" rx=".95" ry="1.1" fill={INK} />}
    {mouth === 'wobble' && <path d="M14.2 21.2q.9-.8 1.8 0t1.8 0" {...ink} strokeWidth={1.2} />}
  </g>;
}
/** An arm (darker rim under a lighter stroke) ending in a round hand, in page units. */
const Arm = ({ d, hx, hy, className }: { d: string; hx: number; hy: number; className?: string }) => <g className={className}>
  <path d={d} fill="none" stroke={RIM} strokeWidth="3.6" strokeLinecap="round" /><path d={d} fill="none" stroke={ORANGE} strokeWidth="2.2" strokeLinecap="round" />
  <circle cx={hx} cy={hy} r="2.4" fill={ORANGE} stroke={RIM} strokeWidth=".9" /></g>;

const FACE: Record<FailMood, [Eyes, 'smile' | 'flat' | 'o' | 'wobble' | 'small']> = {
  noCredits: ['down', 'o'], timeout: ['sleepy', 'o'], badInput: ['unsure', 'wobble'], offline: ['open', 'flat'], needsKey: ['open', 'smile'],
  needsDownload: ['up', 'small'], providerDown: ['up', 'o'], cancelled: ['happy', 'smile'], generic: ['open', 'small'],
};
const LABEL: Record<FailMood, string> = {
  noCredits: 'SyteSim holds an empty wallet', timeout: 'SyteSim dozes off', badInput: 'SyteSim tilts its head, puzzled', offline: 'SyteSim holds an unplugged cable',
  needsKey: 'SyteSim holds up a little key', needsDownload: 'SyteSim waits for a download', providerDown: 'SyteSim looks up at a rain cloud', cancelled: 'SyteSim waves calmly', generic: 'SyteSim shrugs',
};

/** Props behind the bean (drawn first) and in front of it (drawn after). Page units, 64-grid. */
function Behind({ mood }: { mood: FailMood }) {
  if (mood === 'offline') return <path d="M47 47c-4 10-20 11-28 6" fill="none" stroke={GREY} strokeWidth="2" strokeLinecap="round" />;
  return null;
}
function Front({ mood }: { mood: FailMood }) {
  switch (mood) {
    case 'generic': return <g className="mm-shrug"><Arm d="M18.6 41q-5.6-.4-7.6-6" hx={11} hy={34.6} /><Arm d="M45.4 41q5.6-.4 7.6-6" hx={53} hy={34.6} /></g>;
    case 'noCredits': return <>
      <circle className="mm-coin" cx="32" cy="41" r="3.2" fill="none" stroke={GREY} strokeWidth="1.3" strokeDasharray="2 1.6" />
      <g className="mm-wallet">
        <rect x="23" y="47" width="18" height="11" rx="2.4" fill={FILL} stroke={GREY} strokeWidth="1.4" />
        <path d="M23.6 50.2h16.8" stroke={GREY} strokeWidth="1.1" opacity=".7" /><rect x="35" y="51.8" width="5.4" height="3.6" rx="1.2" fill="none" stroke={GREY} strokeWidth="1.1" />
        <circle cx="23.6" cy="52.4" r="2.4" fill={ORANGE} stroke={RIM} strokeWidth=".9" /><circle cx="40.4" cy="52.4" r="2.4" fill={ORANGE} stroke={RIM} strokeWidth=".9" />
      </g></>;
    case 'timeout': return <g fill="none" stroke={GREY} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path className="mm-z mm-z1" d="M46 23h5l-5 5.4h5" /><path className="mm-z mm-z2" d="M52.5 13.5h3.6l-3.6 3.9h3.6" stroke={ACC} /><path className="mm-z mm-z3" d="M57.5 6h2.6l-2.6 2.8h2.6" /></g>;
    case 'badInput': return <g className="mm-q" fill="none" stroke={ACC} strokeLinecap="round"><path d="M47.6 12.6a4.4 4.4 0 1 1 6 4.1c-1.3.6-1.7 1.3-1.7 2.9" strokeWidth="2.4" /><circle cx="51.9" cy="24.2" r="1.5" fill={ACC} stroke="none" /></g>;
    case 'offline': return <g className="mm-plug">
      <Arm d="M45.4 41q3 1.6 4.8 4.6" hx={50.4} hy={45.8} />
      <rect x="47.6" y="39.4" width="8" height="7.4" rx="1.8" fill={FILL} stroke={GREY} strokeWidth="1.4" />
      <path d="M55.6 41.6h3.4M55.6 44.6h3.4" stroke={GREY} strokeWidth="1.6" strokeLinecap="round" />
      <path className="mm-spark" d="M61 38.6l1.4-1.4M61.6 43.1h1.8M61 47.6l1.4 1.4" stroke={ACC} strokeWidth="1.2" strokeLinecap="round" /></g>;
    case 'needsKey': return <><g className="mm-key" fill="none" stroke={ACC} strokeLinecap="round">
      <circle cx="51" cy="26" r="3.8" strokeWidth="2.2" /><circle cx="51" cy="26" r="1.1" fill={ACC} stroke="none" opacity=".5" />
      <path d="M51 29.8v12M51 36.4h3.2M51 39.6h2.4" strokeWidth="2.2" /></g>
      <Arm d="M45.4 41.4q2.6.4 5.2.6" hx={51} hy={42.2} /><path className="mm-glint" d="M57.5 19.5v3M56 21h3" stroke={ACC} strokeWidth="1.1" strokeLinecap="round" /></>;
    case 'needsDownload': return <>
      <g className="mm-arrow" fill="none" stroke={ACC} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M51.5 6.5v11" /><path d="M47.2 13.4l4.3 4.3 4.3-4.3" /></g>
      <path d="M46 22.5h11" stroke={GREY} strokeWidth="1.8" strokeLinecap="round" />
      <g><path d="M24 48.4h16v8.8a1.8 1.8 0 0 1-1.8 1.8H25.8a1.8 1.8 0 0 1-1.8-1.8z" fill={FILL} stroke={GREY} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M23 48.4l3-3.4h12l3 3.4z" fill={FILL} stroke={GREY} strokeWidth="1.4" strokeLinejoin="round" /><path d="M30 52.2h4" stroke={GREY} strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="24.2" cy="53.4" r="2.4" fill={ORANGE} stroke={RIM} strokeWidth=".9" /><circle cx="39.8" cy="53.4" r="2.4" fill={ORANGE} stroke={RIM} strokeWidth=".9" /></g></>;
    case 'providerDown': return <>
      <g className="mm-cloud"><path d="M42.6 17.6h14.2a4.2 4.2 0 0 0 .4-8.4 6 6 0 0 0-11.4-1.4 4.6 4.6 0 0 0-3.2 9.8z" fill={FILL} stroke={GREY} strokeWidth="1.5" strokeLinejoin="round" /></g>
      <g stroke={ACC} strokeWidth="1.5" strokeLinecap="round" opacity=".9"><path className="mm-drop mm-d1" d="M45.5 21.5l-.8 2.4" /><path className="mm-drop mm-d2" d="M50.5 21.5l-.8 2.4" /><path className="mm-drop mm-d3" d="M55.5 21.5l-.8 2.4" /></g></>;
    case 'cancelled': return <><Arm d="M18.6 42q-3 2.4-2.2 6" hx={16.6} hy={48.4} /><Arm className="mm-wave" d="M45.4 40q5-2.6 7.4-9.4" hx={53} hy={30} /></>;
    default: return null;
  }
}

export interface MascotMoodProps { mood: FailMood; size?: number; className?: string; /** spoken label; default describes the scene */ title?: string | null }
export default function MascotMood({ mood, size = 56, className = '', title }: MascotMoodProps) {
  const id = useId().replace(/:/g, ''); const g = `ohf-mm-${id}`; const [eyes, mouth] = FACE[mood] ?? FACE.generic; const label = title === null ? null : title ?? LABEL[mood];
  const tilt = mood === 'badInput' ? 'rotate(-11 32 38)' : mood === 'timeout' ? 'rotate(7 32 38)' : undefined;
  return <svg width={size} height={size} viewBox="0 0 64 64" className={`ohf-mood mm-${mood}${className ? ` ${className}` : ''}`} data-testid={`mood-${mood}`} data-mood={mood}
    role={label ? 'img' : undefined} aria-hidden={label ? undefined : true} aria-label={label ?? undefined}>
    <defs><radialGradient id={g} gradientUnits="userSpaceOnUse" cx="12" cy="9" r="22"><stop offset="0" stopColor="#FF9A4D" /><stop offset=".5" stopColor={ORANGE} /><stop offset="1" stopColor="#F0660A" /></radialGradient></defs>
    <ellipse cx="32" cy="58.6" rx="12" ry="1.8" fill="#000" opacity=".22" className="mm-shadow" />
    <Behind mood={mood} />
    <g transform={tilt}><g className="mm-body"><g transform="translate(14 20) scale(1.125)">
      <g stroke={RIM} strokeLinejoin="round" fill={RIM}><path d={EARS} strokeWidth="2.2" /><path d={HEAD} strokeWidth="1.2" /></g>
      <path d={EARS} fill={`url(#${g})`} stroke={`url(#${g})`} strokeWidth="1" strokeLinejoin="round" /><path d={HEAD} fill={`url(#${g})`} />
      <path d="M8.7 5.3 8 3.1l2.8 1.3z M23.3 5.3 24 3.1l-2.8 1.3z" fill={BLUSH} opacity=".7" />
      <Face eyes={eyes} mouth={mouth} />
    </g></g></g>
    <Front mood={mood} />
  </svg>;
}
export const MOODS: FailMood[] = ['noCredits', 'timeout', 'badInput', 'offline', 'needsKey', 'needsDownload', 'providerDown', 'cancelled', 'generic'];
