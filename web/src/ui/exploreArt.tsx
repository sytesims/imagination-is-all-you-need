/**
 * Explore flow art (2026-10-26): our own small diagrams for a flow that has no output of ours to show yet. Each one says what the flow does
 * (grey = what you bring, orange = what the model makes); none of them pretends to be a result. Drawn on a 320 × 150 grid, tokens only.
 */
import type { FlowArt } from '../../../server/src/shared/exploreFlows';

const G = 'rgba(255,255,255,.34)'; const G2 = 'rgba(255,255,255,.14)'; const O = 'var(--accent)';
const Person = ({ x, y, c, s = 1 }: { x: number; y: number; c: string; s?: number }) => <g transform={`translate(${x} ${y}) scale(${s})`}><circle cx="0" cy="-30" r="8" fill={c} /><path d="M-12 12v-22a12 12 0 0 1 24 0v22z" fill={c} /></g>;
const Frame = ({ x, y, w, h, c = G2, r = 8 }: { x: number; y: number; w: number; h: number; c?: string; r?: number }) => <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={c} strokeWidth="1.5" />;
const Arrow = ({ x1, x2, y }: { x1: number; x2: number; y: number }) => <g stroke={O} strokeWidth="2" strokeLinecap="round" fill="none"><path d={`M${x1} ${y}H${x2}`} /><path d={`M${x2 - 6} ${y - 5}l6 5-6 5`} /></g>;
const Bars = ({ x, y, n, c, seed = 1 }: { x: number; y: number; n: number; c: string; seed?: number }) => <g fill={c}>{Array.from({ length: n }, (_, i) => { const h = 8 + ((Math.sin(i * 1.7 + seed) + 1) * 0.5) * 34; return <rect key={i} x={x + i * 7} y={y - h / 2} width="4" height={h} rx="2" />; })}</g>;

const Cam = ({ x, y, r = 0, on = false }: { x: number; y: number; r?: number; on?: boolean }) => <g transform={`translate(${x} ${y}) rotate(${r})`}><rect x="-12" y="-9" width="19" height="16" rx="4" fill={on ? 'rgba(255,122,26,.15)' : 'none'} stroke={on ? O : G} strokeWidth="1.8" /><path d="M7 -4l7-4v13l-7-4" fill="none" stroke={on ? O : G} strokeWidth="1.8" /></g>;
const ARTS: Partial<Record<FlowArt, () => JSX.Element>> = {
  object: () => <><Frame x={40} y={30} w={96} h={90} /><path d="M70 104h36l-6-34H76z" fill={G} /><rect x="80" y="58" width="16" height="10" rx="2" fill={G} /><Arrow x1={150} x2={176} y={75} /><Frame x={186} y={30} w={96} h={90} c="rgba(255,122,26,.45)" />
    <g transform="translate(234 88)"><path d="M-14 16h28l2-30h-32z" fill={O} /><path d="M-8 -14a8 8 0 0 1 16 0" stroke={O} strokeWidth="3" fill="none" /></g></>,
  reshoot: () => <><Person x={160} y={104} c={G} s={0.9} /><Cam x={70} y={96} /><Cam x={112} y={44} r={30} on /><Cam x={208} y={44} r={150} on /><Cam x={252} y={96} r={180} on />
    <g stroke={G2} strokeDasharray="3 4">{[[70, 96], [112, 44], [208, 44], [252, 96]].map(([x, y], i) => <path key={i} d={`M${x} ${y}L160 80`} />)}</g></>,
  move: () => <><rect x="200" y="42" width="70" height="70" rx="6" fill="rgba(255,255,255,.05)" stroke={G2} strokeWidth="1.5" /><circle cx="235" cy="70" r="12" fill={G2} /><path d="M210 104l14-14 10 8 16-18 10 24z" fill={G2} />
    <path d="M48 118H176" stroke={G} strokeWidth="2" /><g fill={G}>{[56, 84, 112, 140, 168].map((x) => <rect key={x} x={x} y="114" width="6" height="8" rx="1" />)}</g><Cam x={70} y={100} /><Cam x={160} y={100} on /><Arrow x1={88} x2={140} y={86} /></>,

  swap: () => <><Frame x={40} y={30} w={96} h={90} /><Person x={88} y={100} c={G} /><path d="M58 52c-6 8-6 16 0 24" stroke={G2} strokeWidth="2" fill="none" /><Arrow x1={150} x2={176} y={75} /><Frame x={186} y={30} w={96} h={90} c="rgba(255,122,26,.45)" /><Person x={234} y={100} c={O} /></>,
  angle: () => <><ellipse cx="160" cy="98" rx="104" ry="30" fill="none" stroke={G2} strokeWidth="1.5" strokeDasharray="4 5" /><Person x={160} y={98} c={G} s={0.9} />
    <g transform="translate(60 92)"><rect x="-14" y="-10" width="22" height="18" rx="4" fill="none" stroke={G} strokeWidth="1.8" /><path d="M8 -4l8-4v14l-8-4" fill="none" stroke={G} strokeWidth="1.8" /></g>
    <g transform="translate(236 56) rotate(-28)"><rect x="-14" y="-10" width="22" height="18" rx="4" fill="rgba(255,122,26,.15)" stroke={O} strokeWidth="1.8" /><path d="M8 -4l8-4v14l-8-4" fill="none" stroke={O} strokeWidth="1.8" /></g>
    <path d="M86 70C120 30 190 26 222 48" stroke={O} strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M216 40l7 9-11 2" stroke={O} strokeWidth="2" fill="none" strokeLinecap="round" /></>,
  stage: () => <><g stroke={G2} strokeWidth="1">{Array.from({ length: 7 }, (_, i) => <path key={`h${i}`} d={`M${40 + i * 4} ${78 + i * 10}H${280 - i * 4}`} />)}{Array.from({ length: 9 }, (_, i) => <path key={`v${i}`} d={`M${60 + i * 25} 78L${30 + i * 32} 138`} />)}</g>
    <rect x="140" y="62" width="34" height="34" rx="3" fill="rgba(255,255,255,.08)" stroke={G} strokeWidth="1.5" /><circle cx="210" cy="86" r="12" fill="rgba(255,255,255,.08)" stroke={G} strokeWidth="1.5" />
    <path d="M58 40C110 18 200 18 262 44" stroke={O} strokeWidth="2" strokeDasharray="5 6" fill="none" strokeLinecap="round" /><circle cx="262" cy="44" r="5" fill={O} /><circle cx="58" cy="40" r="4" fill="none" stroke={O} strokeWidth="2" /></>,
  viral: () => <>{[0, 1, 2].map((i) => <g key={i} transform={`translate(${86 + i * 54} ${22 + (i === 1 ? -4 : 4)})`}><rect width="44" height="78" rx="7" fill={i === 1 ? 'rgba(255,122,26,.12)' : 'rgba(255,255,255,.04)'} stroke={i === 1 ? O : G2} strokeWidth="1.5" /><text x="22" y="46" textAnchor="middle" fill={i === 1 ? O : G} style={{ font: '700 11px var(--font-ui)' }}>{`Shot ${i + 1}`}</text></g>)}
    <Bars x={96} y={128} n={19} c="rgba(255,122,26,.55)" seed={2} /></>,
  music: () => <><Bars x={52} y={76} n={31} c={G} seed={1} /><Bars x={52} y={76} n={12} c={O} seed={1} /><circle cx="52" cy="122" r="0" /></>,
  voice: () => <><g transform="translate(70 52)"><rect x="-10" y="-22" width="20" height="36" rx="10" fill="none" stroke={G} strokeWidth="2" /><path d="M-18 4a18 18 0 0 0 36 0M0 22v12" stroke={G} strokeWidth="2" fill="none" /></g><Bars x={110} y={60} n={24} c={O} seed={4} />
    <g fill={G2}><rect x="110" y="104" width="150" height="6" rx="3" /><rect x="110" y="116" width="110" height="6" rx="3" /></g></>,
  talk: () => <><rect x="62" y="26" width="84" height="100" rx="10" fill="rgba(255,255,255,.04)" stroke={G2} strokeWidth="1.5" /><Person x={104} y={112} c={G} s={1.15} /><path d="M98 88q6 5 12 0" stroke={O} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <path d="M168 42h90a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10h-62l-14 12v-12h-14a10 10 0 0 1-10-10V52a10 10 0 0 1 10-10z" fill="rgba(255,122,26,.12)" stroke={O} strokeWidth="1.5" /><Bars x={180} y={65} n={11} c={O} seed={3} /></>,
  cube: () => <><rect x="44" y="40" width="72" height="72" rx="8" fill="rgba(255,255,255,.05)" stroke={G2} strokeWidth="1.5" /><circle cx="80" cy="70" r="14" fill={G2} /><path d="M54 104l16-16 12 10 18-20 10 26z" fill={G2} />
    <Arrow x1={128} x2={154} y={76} /><g transform="translate(214 76)" fill="none" stroke={O} strokeWidth="1.8" strokeLinejoin="round"><path d="M0 -40 36 -20v40L0 40-36 20v-40z" fill="rgba(255,122,26,.10)" /><path d="M-36 -20 0 0l36-20M0 0v40" /></g></>,
  turntable: () => <><g transform="translate(160 68)" fill="none" stroke={G} strokeWidth="1.8" strokeLinejoin="round"><path d="M0 -36 30 -18v34L0 34-30 16v-34z" fill="rgba(255,255,255,.05)" /><path d="M-30 -18 0 0l30-18M0 0v34" /></g>
    <ellipse cx="160" cy="112" rx="96" ry="18" fill="none" stroke={O} strokeWidth="2" /><path d="M250 104l8 9-12 3" stroke={O} strokeWidth="2" fill="none" strokeLinecap="round" /></>,
  agent: () => <><rect x="40" y="34" width="130" height="34" rx="12" fill="rgba(255,255,255,.06)" stroke={G2} strokeWidth="1.5" /><g fill={G}><rect x="54" y="47" width="70" height="7" rx="3.5" /></g>
    <rect x="96" y="80" width="150" height="40" rx="12" fill="rgba(255,122,26,.10)" stroke={O} strokeWidth="1.5" /><text x="112" y="105" fill={O} style={{ font: '700 12px var(--font-ui)' }}>Quote · $0.00 · Go?</text>
    <circle cx="272" cy="100" r="13" fill={O} /><path d="M266 100l4 4 8-8" stroke="var(--on-accent)" strokeWidth="2.4" fill="none" strokeLinecap="round" /></>,
  canvas: () => <>{[[44, 30, 70, 50], [124, 22, 56, 70], [190, 36, 86, 44], [60, 92, 90, 40], [162, 90, 60, 44], [232, 88, 44, 50]].map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="6" fill={i === 2 ? 'rgba(255,122,26,.16)' : 'rgba(255,255,255,.05)'} stroke={i === 2 ? O : G2} strokeWidth="1.5" />)}</>,
  skills: () => <>{['Direct a shot', 'Quote the run', 'Render, then share'].map((t, i) => <g key={t} transform={`translate(70 ${34 + i * 30})`}><circle cx="0" cy="0" r="9" fill={i === 2 ? O : 'rgba(255,255,255,.08)'} stroke={i === 2 ? O : G2} /><text x="0" y="4" textAnchor="middle" fill={i === 2 ? 'var(--on-accent)' : G} style={{ font: '700 10px var(--font-ui)' }}>{i + 1}</text>
    <text x="20" y="4" fill={i === 2 ? O : G} style={{ font: '600 12px var(--font-ui)' }}>{t}</text></g>)}</>,
  fx: () => <><g transform="translate(160 76)">{[[-58, -26], [52, -30], [-50, 30], [56, 28], [0, -48], [2, 46]].map(([x, y], i) => <rect key={i} x={x - 12} y={y - 9} width="24" height="18" rx="3" fill="rgba(255,122,26,.12)" stroke={O} strokeWidth="1.5" transform={`rotate(${(i * 23) % 40 - 20} ${x} ${y})`} />)}
    <rect x="-18" y="-14" width="36" height="28" rx="4" fill="rgba(255,255,255,.08)" stroke={G} strokeWidth="1.6" /><g stroke={G2} strokeDasharray="3 4">{[[-58, -26], [52, -30], [-50, 30], [56, 28]].map(([x, y], i) => <path key={i} d={`M0 0L${x * 0.7} ${y * 0.7}`} />)}</g></g></>,
  /* Footage Effects · Comfy Cloud (2026-10-27): before (grey) → after (orange), the same two-frame layout as object / swap */
  restore: () => <><Frame x={40} y={30} w={96} h={90} /><path d="M50 108l22-24 16 14 20-26 20 36z" fill={G2} /><g stroke={G} strokeWidth="1.2" strokeLinecap="round">{[[58, 36, 62, 70], [96, 40, 92, 82], [120, 52, 124, 112], [76, 90, 74, 116]].map(([a, b, c, d], i) => <path key={i} d={`M${a} ${b}L${c} ${d}`} />)}</g>
    <g fill={G}>{[[70, 50], [110, 64], [86, 104]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" />)}</g><Arrow x1={150} x2={176} y={75} /><Frame x={186} y={30} w={96} h={90} c="rgba(255,122,26,.45)" />
    <circle cx="256" cy="52" r="9" fill={O} /><path d="M196 108l22-24 16 14 20-26 20 36z" fill="rgba(255,122,26,.35)" stroke={O} strokeWidth="1.5" strokeLinejoin="round" /></>,
  erase: () => <><Frame x={40} y={30} w={96} h={90} /><Person x={70} y={104} c={G2} s={0.8} /><rect x="96" y="70" width="26" height="32" rx="4" fill={G} /><Arrow x1={150} x2={176} y={75} /><Frame x={186} y={30} w={96} h={90} c="rgba(255,122,26,.45)" />
    <Person x={216} y={104} c={G2} s={0.8} /><rect x="242" y="70" width="26" height="32" rx="4" fill="none" stroke={O} strokeWidth="1.5" strokeDasharray="4 4" /><path d="M250 80l10 12M260 80l-10 12" stroke={O} strokeWidth="2" strokeLinecap="round" /></>,
  untext: () => <><Frame x={40} y={30} w={96} h={90} /><path d="M50 92l20-20 14 12 18-22 24 30z" fill={G2} /><g fill={G}><rect x="56" y="98" width="64" height="7" rx="3" /><rect x="66" y="109" width="44" height="7" rx="3" /></g>
    <Arrow x1={150} x2={176} y={75} /><Frame x={186} y={30} w={96} h={90} c="rgba(255,122,26,.45)" /><path d="M196 112l20-20 14 12 18-22 24 40z" fill="rgba(255,122,26,.35)" stroke={O} strokeWidth="1.5" strokeLinejoin="round" /></>,
  outpaint: () => <><rect x="96" y="22" width="128" height="106" rx="8" fill="rgba(255,122,26,.10)" stroke={O} strokeWidth="1.5" strokeDasharray="5 5" /><rect x="132" y="50" width="56" height="50" rx="5" fill="rgba(255,255,255,.08)" stroke={G} strokeWidth="1.6" />
    <g stroke={O} strokeWidth="2" strokeLinecap="round" fill="none">{[[160, 46, 160, 30, 'M155 35l5-5 5 5'], [160, 104, 160, 120, 'M155 115l5 5 5-5'], [128, 75, 104, 75, 'M109 70l-5 5 5 5'], [192, 75, 216, 75, 'M211 70l5 5-5 5']].map(([a, b, c, d, h], i) => <g key={i}><path d={`M${a} ${b}L${c} ${d}`} /><path d={String(h)} /></g>)}</g></>,
  /* Workflows page picks (2026-10-28): each card without an example gets its own drawing, same language (grey = yours, orange = made) */
  tryon: () => <><Frame x={30} y={34} w={70} h={86} /><Person x={65} y={106} c={G} s={0.85} /><path d="M120 50h14l6 8 6-8h14l8 14-10 6v34h-36v-34l-10-6z" fill="none" stroke={G} strokeWidth="1.6" strokeLinejoin="round" />
    <Arrow x1={184} x2={206} y={77} /><Frame x={216} y={34} w={70} h={86} c="rgba(255,122,26,.45)" /><Person x={251} y={106} c={G} s={0.85} /><path d="M236 90h30l3-22-9-5-5 6-5-6-9 5z" fill={O} /></>,
  cover: () => <><Bars x={34} y={76} n={14} c={G} seed={1} /><Arrow x1={140} x2={170} y={76} /><Bars x={182} y={76} n={14} c={O} seed={5} /><g transform="translate(160 118)"><circle cx="-6" cy="6" r="5" fill={O} /><path d="M-1 6V-12l12 -3v16" stroke={O} strokeWidth="2" fill="none" /><circle cx="6" cy="3" r="5" fill={O} /></g></>,
  sfx: () => <><g transform="translate(160 76)"><circle r="12" fill={O} />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d="M20 0H38" stroke={a % 90 ? G : O} strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${a})`} />)}
    {[56, 72].map((r) => <circle key={r} r={r} fill="none" stroke={G2} strokeWidth="1.5" strokeDasharray="3 6" />)}</g></>,
  score: () => <><Frame x={50} y={22} w={220} h={70} /><path d="M66 82l40-34 26 20 30-28 52 42z" fill={G2} /><g fill={G2}>{[60, 98, 136, 174, 212, 250].map((x) => <rect key={x} x={x} y="26" width="10" height="5" rx="1" />)}</g>
    <path d="M58 116c18-14 36 14 54 0s36 14 54 0 36 14 54 0 30 10 46 2" stroke={O} strokeWidth="2.4" fill="none" strokeLinecap="round" /><g transform="translate(254 112)"><circle cx="0" cy="8" r="5" fill={O} /><path d="M5 8V-10" stroke={O} strokeWidth="2" /></g></>,
  foley: () => <><Frame x={40} y={30} w={110} h={90} /><g transform="translate(70 104)"><path d="M0 0c-4-14 2-26 12-26s12 14 6 26z" fill={G} /></g><g transform="translate(108 92)"><path d="M0 0c-4-14 2-26 12-26s12 14 6 26z" fill={G2} /></g>
    <Arrow x1={160} x2={184} y={75} /><Bars x={196} y={75} n={12} c={O} seed={7} /></>,
};
/** The flow's diagram, or null for a flow drawn another way (a cloud model shows its maker's mark). */
/** Has its own diagram (else the page draws the flow's icon). */
export const hasDiagram = (art: FlowArt) => !!ARTS[art];
export function FlowDiagram({ art }: { art: FlowArt }) { const A = ARTS[art]; return A ? <svg className="xp-diagram" viewBox="0 0 320 150" aria-hidden><A /></svg> : null; }
