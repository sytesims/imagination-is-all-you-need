/**
 * The dancing bean's body (our own drawing): the bean's head on a clean bean-shaped torso, two-part arms and legs and soft round feet, as an
 * SVG rig, plus every style pack's look (cap + chain, shades, headphones, headband, bow tie + baton...: beanStyle.ts), shown one at a time by
 * the host's data-pack. Every joint is a <g data-j> that rotates about its own pivot; joints nest (shoulder → elbow, hip → knee,
 * torso → head and arms), so one angle per joint poses the whole body. `dancerSvg` draws it standing at rest; `applyPose` writes a pose
 * straight to the DOM (used by the single animation loop in AudioViz.tsx, no React render per frame). Decorative (aria-hidden).
 *
 * Layout (viewBox 0 0 100 120, the floor at y 116): hips (45|55, 80), knees y 97, ankles y 113; shoulders (41|59, 61), elbows y 74, wrists y 87;
 * the torso turns about (50, 82), the head about the neck (50, 56).
 */
import { beanHeadShell, beanFace, TINTS } from '../../../server/src/shared/beanSvg';
import { REST, clamp01, type Pose, type Face } from './danceLogic';
import type { PackId } from './beanStyle';

export const FLOOR_Y = 116;
const J = { lSh: [41, 61], lEl: [41, 74], rSh: [59, 61], rEl: [59, 74], lHip: [45, 80], lKnee: [45, 97], rHip: [55, 80], rKnee: [55, 97], torso: [50, 82], neck: [50, 56] } as const;
export const JOINTS = ['shadow', 'root', 'torso', 'head', 'lSh', 'lEl', 'rSh', 'rEl', 'lHip', 'lKnee', 'rHip', 'rKnee'] as const;
export type Joint = typeof JOINTS[number];

const n = (v: number) => (Math.abs(v) < 0.005 ? 0 : +v.toFixed(2));
const rot = (a: number, [x, y]: readonly [number, number]) => `rotate(${n(a)} ${x} ${y})`;

/** The transform attribute of every joint for a pose. Left limbs turn clockwise to swing out, right limbs the other way (the pose is mirrored). */
export function poseTransforms(p: Pose): Record<Joint, string> {
  const c = Math.cos((p.spin * Math.PI) / 180);
  const sx = c * (1 + (1 - p.squash) * 0.8), sy = p.squash;
  const sh = Math.max(0.4, Math.min(1.15, 1 + p.y / 32));
  return {
    shadow: `translate(${n(p.x)} 0) translate(50 ${FLOOR_Y + 0.5}) scale(${n(sh)} 1) translate(-50 -${FLOOR_Y + 0.5})`,
    root: `translate(${n(p.x)} ${n(p.y)}) ${rot(p.tilt, [50, FLOOR_Y])} translate(50 ${FLOOR_Y}) scale(${n(sx) || 0.01} ${n(sy)}) translate(-50 -${FLOOR_Y})`,
    torso: rot(p.torso, J.torso),
    head: `${rot(p.head, J.neck)} translate(0 ${n(p.nod)}) translate(50 56) scale(1 ${n(1 - p.nod * 0.03)}) translate(-50 -56)`,
    lSh: rot(p.lSh, J.lSh), lEl: rot(p.lEl, J.lEl), rSh: rot(-p.rSh, J.rSh), rEl: rot(-p.rEl, J.rEl),
    lHip: rot(p.lHip, J.lHip), lKnee: rot(p.lKnee, J.lKnee), rHip: rot(-p.rHip, J.rHip), rKnee: rot(-p.rKnee, J.rKnee),
  };
}
/** How much of the face shows: full from the front, gone while the back is turned in a spin. */
export const faceOpacity = (spin: number) => clamp01(Math.cos((spin * Math.PI) / 180) * 5);

const INK = '#2A1A10';
const ln = (d: string, w = 1.6, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Faces only the dancer uses (same 32-unit art as beanFace): eyes closed with a smile, calm (eyes softly closed, a small content smile), a rock
 *  shout, a cool half-lidded look. */
const EXTRA_FACES: Record<'dreamy' | 'calm' | 'shout' | 'cool', string> = {
  dreamy: ln('M9.5 15.4q2.1 2.1 4.2 0') + ln('M18.3 15.4q2.1 2.1 4.2 0') + ln('M14.3 20.2q1.7 1.7 3.4 0', 1.4)
    + `<ellipse cx="8.6" cy="19.8" rx="2.5" ry="1.4" fill="#FF8FB3" opacity=".75"/><ellipse cx="23.4" cy="19.8" rx="2.5" ry="1.4" fill="#FF8FB3" opacity=".75"/>`,
  calm: ln('M9.6 15.9q2 1.3 4 0', 1.5) + ln('M18.4 15.9q2 1.3 4 0', 1.5) + ln('M14.5 20.3q1.5 1.2 3 0', 1.35)
    + `<ellipse cx="8.8" cy="19.6" rx="2.2" ry="1.2" fill="#FFB48A" opacity=".45"/><ellipse cx="23.2" cy="19.6" rx="2.2" ry="1.2" fill="#FFB48A" opacity=".45"/>`,
  shout: ln('M9.4 16.2q2.2-2.6 4.4 0', 1.8) + ln('M18.2 16.2q2.2-2.6 4.4 0', 1.8)
    + `<path d="M13.6 19.6h4.8q0 3.8-2.4 3.8t-2.4-3.8z" fill="${INK}"/><path d="M14.6 22.2q1.4-1.1 2.8 0q-1.4 1-2.8 0z" fill="#FF7A8A"/>`,
  cool: ln('M9.4 15.2h4.4', 1.9) + ln('M18.2 15.2h4.4', 1.9) + `<path d="M9.6 15.6q2.2 2.6 4.2 0z M18.4 15.6q2.2 2.6 4.2 0z" fill="${INK}"/>` + ln('M14.2 20.6q2 1.2 3.8-.8', 1.4),
};
export const FACES: Face[] = ['happy', 'smile', 'surprised', 'sleepy', 'wink', 'dreamy', 'calm', 'shout', 'cool'];
const faceSvg = (f: Face) => (f in EXTRA_FACES ? EXTRA_FACES[f as keyof typeof EXTRA_FACES] : beanFace(f as Exclude<Face, keyof typeof EXTRA_FACES>));

/* ---------------- the style packs' looks (our own drawings), one group per pack, shown by the host's data-pack (CSS) ---------------- */

/** On the head, in the head's 32-unit art (ears at the top, eyes at y 15.6, cheeks at y 20). */
const HEAD_ACC: Partial<Record<PackId, string>> = {
  /* rap: a small snapback between the ears, brim to the side */
  rap: `<path d="M9.6 8.4Q10 1.4 16 1.4t6.4 7z" fill="#24262B" stroke="#121315" stroke-width=".7"/><path d="M21.6 7.6h5.6q1 .9-.2 1.7h-6.2z" fill="#121315"/>`
    + `<path d="M12 6.6q4-1.6 8 0" fill="none" stroke="#FF7A1A" stroke-width="1.1" stroke-linecap="round"/><circle cx="16" cy="1.7" r=".8" fill="#FF7A1A"/>`,
  /* love: rosy cheeks */
  love: `<ellipse cx="8.4" cy="20.2" rx="2.7" ry="1.5" fill="#FF7AA8" opacity=".55"/><ellipse cx="23.6" cy="20.2" rx="2.7" ry="1.5" fill="#FF7AA8" opacity=".55"/>`,
  /* rock: a red headband with a tiny bolt, tails flying */
  rock: `<path d="M3.6 11.4Q16 6.4 28.4 11.4" fill="none" stroke="#C9281A" stroke-width="2.8"/><path d="M27.8 10.8l3.4 1.8M27.8 10.8l3.6-.8" fill="none" stroke="#C9281A" stroke-width="1.5" stroke-linecap="round"/>`
    + `<path d="M16.6 6.9l-1.6 2.3h1.3l-.9 2.2 2.1-2.9h-1.3l.9-1.6z" fill="#FFD23F"/>`,
  /* edm: neon shades */
  edm: `<path d="M6.8 13h7.8v3.4q0 2-2 2h-3.8q-2 0-2-2z M17.4 13h7.8v3.4q0 2-2 2h-3.8q-2 0-2-2z" fill="#1B1030" stroke="#7FE7FF" stroke-width=".8" stroke-linejoin="round"/>`
    + `<path d="M14.6 14h2.8" stroke="#7FE7FF" stroke-width=".9"/><path d="M8 14.4l2.4 2.6 M18.6 14.4l2.4 2.6" stroke="#E36BFF" stroke-width=".9" stroke-linecap="round" opacity=".9"/>`,
  /* lo-fi: headphones */
  lofi: `<path d="M3.8 15.5Q2.6 1.2 16 1.2T28.2 15.5" fill="none" stroke="#3A3D44" stroke-width="2.2" stroke-linecap="round"/>`
    + `<rect x="1" y="12.4" width="4.6" height="8" rx="2.2" fill="#B8A6F5" stroke="#3A3D44" stroke-width="1"/><rect x="26.4" y="12.4" width="4.6" height="8" rx="2.2" fill="#B8A6F5" stroke="#3A3D44" stroke-width="1"/>`,
  /* peaceful: a little two-leaf sprout between the ears */
  peaceful: `<path d="M16 3.6Q16.4 1.2 15.7-1" fill="none" stroke="#4E9C7C" stroke-width=".9" stroke-linecap="round"/>`
    + `<path d="M15.8-.4Q12.6-2.2 11-.1Q13.6 1.6 15.8-.4z" fill="#8FD9B6" stroke="#4E9C7C" stroke-width=".4"/><path d="M15.9-.8Q18.6-3.3 20.8-1.6Q18.7.8 15.9-.8z" fill="#B5EBD2" stroke="#4E9C7C" stroke-width=".4"/>`,
  /* voice: a headset with a little mic */
  voice: `<path d="M3.8 15.5Q2.6 1.2 16 1.2T28.2 15.5" fill="none" stroke="#3A3D44" stroke-width="1.5" stroke-linecap="round"/><rect x="1.4" y="13" width="3.8" height="6.4" rx="1.8" fill="#3A3D44"/>`
    + `<rect x="26.8" y="13" width="3.8" height="6.4" rx="1.8" fill="#3A3D44"/><path d="M3.6 18.6q.8 4.6 8 4.8" fill="none" stroke="#3A3D44" stroke-width="1.1" stroke-linecap="round"/><circle cx="12.4" cy="23.4" r="1.2" fill="#FF7A1A"/>`,
  /* sound effects: safety goggles up on the forehead */
  sfx: `<path d="M3.8 9.6Q16 4.8 28.2 9.6" fill="none" stroke="#3A3D44" stroke-width="1.6"/><circle cx="12.2" cy="7.6" r="2.7" fill="#7FE7FF" fill-opacity=".55" stroke="#3A3D44" stroke-width="1.1"/>`
    + `<circle cx="19.8" cy="7.6" r="2.7" fill="#7FE7FF" fill-opacity=".55" stroke="#3A3D44" stroke-width="1.1"/><circle cx="11.4" cy="6.8" r=".7" fill="#fff"/><circle cx="19" cy="6.8" r=".7" fill="#fff"/>`,
};
/** On the torso, in the rig's own coordinates (neck at (50, 56), the body down to y 85). */
const BODY_ACC: Partial<Record<PackId, string>> = {
  rap: `<path d="M44.2 58.6Q50 69.4 55.8 58.6" fill="none" stroke="#C99A2E" stroke-width="1.9" stroke-linecap="round"/><path d="M44.2 58.6Q50 69.4 55.8 58.6" fill="none" stroke="#FFD36B" stroke-width="1.1" stroke-dasharray="1.2 .7" stroke-linecap="round"/>`
    + `<circle cx="50" cy="65.6" r="2" fill="#FFD36B" stroke="#C99A2E" stroke-width=".7"/>`,
  love: `<path d="M53.4 66.2q0-1.6 1.5-1.6t1.5 1.6q0 1.5-3 3.4q-3-1.9-3-3.4q0-1.6 1.5-1.6t1.5 1.6z" fill="#FF7AA8" stroke="#E0517F" stroke-width=".5"/>`,
  classical: `<path d="M50 58l-4.2-2.6v5.2z M50 58l4.2-2.6v5.2z" fill="${INK}"/><circle cx="50" cy="58" r="1.2" fill="${INK}"/>`,
};

/** One limb segment: a darker rim under a lighter core, round ends, so it reads as a soft tube at any size. */
const seg = (x: number, y0: number, y1: number) => `<path d="M${x} ${y0}V${y1}" stroke="#D95E0B" stroke-width="5.4" stroke-linecap="round"/><path d="M${x} ${y0}V${y1}" stroke="#FF8A33" stroke-width="3.5" stroke-linecap="round"/>`;
const hand = (x: number) => `<circle cx="${x}" cy="88" r="2.7" fill="#FF8A33" stroke="#D95E0B" stroke-width="1.1"/>`;
/** The conductor's baton (classical pack only), held in the right hand. */
const baton = (x: number) => `<g data-acc="classical"><path d="M${x} 87.4V99" stroke="#FFF6EC" stroke-width="1" stroke-linecap="round"/><path d="M${x} 86.6v2.4" stroke="#8A5A3A" stroke-width="1.8" stroke-linecap="round"/></g>`;
const foot = (x: number, turn: number) => `<g transform="rotate(${turn} ${x} 114.4)"><ellipse cx="${x}" cy="114.4" rx="3.7" ry="2.2" fill="#FF8A33" stroke="#D95E0B" stroke-width="1"/><path d="M${x - 2.2} 115.7h4.4" stroke="#FFD0B8" stroke-width=".8" stroke-linecap="round"/></g>`;
/* On the face (fades with it while the back is turned in a spin): cheeks, shades. */
const FRONT: PackId[] = ['love', 'edm'];
const FRONT_ACC = Object.fromEntries(Object.entries(HEAD_ACC).filter(([k]) => FRONT.includes(k as PackId))) as Partial<Record<PackId, string>>;
const TOP_ACC = Object.fromEntries(Object.entries(HEAD_ACC).filter(([k]) => !FRONT.includes(k as PackId))) as Partial<Record<PackId, string>>;
const accs = (table: Partial<Record<PackId, string>>) => Object.entries(table).map(([p, svg]) => `<g data-acc="${p}">${svg}</g>`).join('');

/** The whole dancer standing at rest (or in `p`), as an SVG string. `uid` keeps the gradient ids unique per instance. Every pack's look is in the
 *  drawing; the host's data-pack shows one (audioViz.css), so a pack change never re-draws the rig. */
export function dancerSvg(uid: string, p: Pose = REST): string {
  const id = uid.replace(/[^\w-]/g, ''); const t = TINTS.orange; const tf = poseTransforms(p);
  const g = (j: Joint, inner: string) => `<g data-j="${j}" transform="${tf[j]}">${inner}</g>`;
  const faces = FACES.map(f => `<g data-face-l="${f}">${faceSvg(f)}</g>`).join('');
  const head = g('head', `<g transform="translate(31.6 21.4) scale(1.15)">${beanHeadShell('orange', `${id}h`)}<g data-j-face style="opacity:${faceOpacity(p.spin)}">${faces}${accs(FRONT_ACC)}</g>${accs(TOP_ACC)}</g>`);
  const arm = (side: 'l' | 'r', x: number) => g(`${side}Sh` as Joint, seg(x, 61, 74) + g(`${side}El` as Joint, seg(x, 74, 87) + hand(x) + (side === 'r' ? baton(x) : '')));
  const leg = (side: 'l' | 'r', x: number, turn: number) => g(`${side}Hip` as Joint, seg(x, 80, 97) + g(`${side}Knee` as Joint, seg(x, 97, 112.6) + foot(x + (side === 'l' ? -1 : 1), turn)));
  /* a clean bean torso: rim, soft gradient, a highlight and a faint belly curve */
  const body = `<path d="M50 53c6.6 0 10.6 5.6 10.6 13.6S56.8 85 50 85s-10.6-10.4-10.6-18.4S43.4 53 50 53z" fill="${t.rim}" stroke="${t.rim}" stroke-width="1.2" stroke-linejoin="round"/>`
    + `<path d="M50 53c6.6 0 10.6 5.6 10.6 13.6S56.8 85 50 85s-10.6-10.4-10.6-18.4S43.4 53 50 53z" fill="url(#${id}b)"/>`
    + `<ellipse cx="46" cy="62" rx="3" ry="4.4" fill="#fff" opacity=".16"/><path d="M45.6 78.4q4.4 2.6 8.8 0" fill="none" stroke="${t.rim}" stroke-width=".9" stroke-linecap="round" opacity=".45"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" aria-hidden="true" focusable="false" overflow="visible">`
    + `<defs><radialGradient id="${id}h" gradientUnits="userSpaceOnUse" cx="12" cy="9" r="22"><stop offset="0" stop-color="${t.hi}"/><stop offset=".5" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.lo}"/></radialGradient>`
    + `<radialGradient id="${id}b" gradientUnits="userSpaceOnUse" cx="46" cy="60" r="26"><stop offset="0" stop-color="${t.hi}"/><stop offset=".55" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.lo}"/></radialGradient></defs>`
    + `<g class="bd-breathe">`
    + `<ellipse data-j="shadow" transform="${tf.shadow}" cx="50" cy="${FLOOR_Y + 0.5}" rx="15" ry="2.4" fill="#000" opacity=".38"/>`
    + g('root', leg('l', 45, 12) + leg('r', 55, -12) + g('torso', body + accs(BODY_ACC) + head + arm('l', 41) + arm('r', 59)))
    + `</g></svg>`;
}

export type DancerNodes = { el: HTMLElement; joints: Partial<Record<Joint, SVGGElement>>; face: SVGGElement | null; last: Partial<Record<Joint, string>>; lastFace: string; lastOpacity: string };
/** The joints of a dancer drawn by `dancerSvg` inside `el`. */
export function dancerNodes(el: HTMLElement): DancerNodes {
  const joints: DancerNodes['joints'] = {};
  el.querySelectorAll<SVGGElement>('[data-j]').forEach(g => { joints[g.dataset.j as Joint] = g; });
  return { el, joints, face: el.querySelector<SVGGElement>('[data-j-face]'), last: {}, lastFace: '', lastOpacity: '' };
}
/** Write a pose (and face) to the DOM, touching only what changed. */
export function applyPose(d: DancerNodes, p: Pose, face?: Face) {
  const tf = poseTransforms(p);
  for (const j of JOINTS) { const v = tf[j]; if (d.last[j] !== v) { d.joints[j]?.setAttribute('transform', v); d.last[j] = v; } }
  const o = String(+faceOpacity(p.spin).toFixed(2)); if (d.face && o !== d.lastOpacity) { d.face.style.opacity = o; d.lastOpacity = o; }
  if (face && face !== d.lastFace) { d.el.dataset.face = face; d.lastFace = face; }
}
