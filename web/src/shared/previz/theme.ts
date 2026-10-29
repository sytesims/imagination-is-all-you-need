/**
 * Direct a Shot look (2026-10-26): one brand theme for every scene and kit, so the mockups look like the app (charcoal, off-white, warm greys,
 * the orange brand) instead of a toy set. Every preset, the open city, the mannequin and the kit pieces read their colours and light from here.
 *  - PAL: the palette. The subject (mannequin, bottle, train, sofa) is the only saturated thing in a scene; the set stays warm neutral so the
 *    subject reads clearly for the render models. Orange appears elsewhere only as small accents (a lamp, a cushion, a sign).
 *  - LIGHTS: warm key + cool fill + a soft sky, per mood (studio, golden hour, daylight, interior, diorama, city day / golden / night).
 *  - mat(): a matte standard material; shade(): a darker or lighter version of a colour (the mannequin's joints and shoes).
 *  - gradeKit(): the kits come with their own bright atlas colours; this pulls them into the palette in the shader (desaturate + warm), and
 *    can recolour one key colour of a piece to the subject colour (the sofa's fabric, the train's paint, the bottle's band).
 * Clay and Depth keep their own flat materials: they are guides, not looks.
 */
type T3 = typeof import('three');

export const BRAND = { orange: 0xff7a1a, orangeDeep: 0xd9600c, orangeSoft: 0xffb27a, charcoal: 0x131517, offWhite: 0xf7f7f8 } as const;
/** the set's colours: warm neutrals from off-white to charcoal, with muted sage and wood for nature and furniture */
export const PAL = {
  offWhite: 0xf7f7f8, paper: 0xefebe5, stone: 0xdcd6cd, sand: 0xcfc6b8, warmGrey: 0xb3aca2, mid: 0x8f8981, slate: 0x625e59, asphalt: 0x3d3e40, graphite: 0x2a2b2e, charcoal: 0x1b1d20,
  wood: 0xb08c68, woodDark: 0x7c6550, sage: 0x9aa088, sageDark: 0x737a64, glass: 0xc8d0d4, water: 0x71878f,
  accent: BRAND.orange, accentSoft: BRAND.orangeSoft, accentDeep: BRAND.orangeDeep,
} as const;

export interface LightLook {
  /** background gradient (top of the frame → horizon); the fog takes the horizon colour */ sky: [number, number];
  fog: [number, number];
  /** key (the sun or the big soft box): direction towards the light, colour, intensity */ keyDir: [number, number, number]; key: number; keyI: number;
  /** cool fill from the other side */ fill: number; fillI: number;
  hemiSky: number; hemiGround: number; hemiI: number; exposure: number;
}
export const LIGHTS = {
  /** product studio: a big warm soft box upper left, cool fill, pale warm-grey sweep */
  studio: { sky: [0xe9e5df, 0xd8d2c9], fog: [10, 34], keyDir: [-0.55, 0.85, 0.5], key: 0xffeedd, keyI: 2.4, fill: 0xd6e2ff, fillI: 0.55, hemiSky: 0xf6f1ea, hemiGround: 0x8a847b, hemiI: 0.85, exposure: 1.0 },
  /** golden hour outdoors: a low warm sun, a cool blue-grey sky above a warm horizon */
  golden: { sky: [0x9aa6b4, 0xf0d2b2], fog: [18, 70], keyDir: [0.75, 0.42, 0.5], key: 0xffc996, keyI: 2.7, fill: 0xbfd0ff, fillI: 0.5, hemiSky: 0xf4e3cf, hemiGround: 0x5e554c, hemiI: 0.95, exposure: 1.02 },
  /** soft daylight outdoors (the establishing shot keeps a higher sun so the hills read) */
  daylight: { sky: [0xa9b6c2, 0xece4d8], fog: [24, 95], keyDir: [0.5, 0.7, 0.45], key: 0xfff0dc, keyI: 2.3, fill: 0xcfdcff, fillI: 0.45, hemiSky: 0xf2ece3, hemiGround: 0x5f5952, hemiI: 1.0, exposure: 1.0 },
  /** late afternoon over open country: warm but higher sun, so the hills keep their green-grey */
  hills: { sky: [0x9fb0bf, 0xeedfcc], fog: [22, 90], keyDir: [0.6, 0.55, 0.45], key: 0xffdcb8, keyI: 2.4, fill: 0xc8d6ff, fillI: 0.5, hemiSky: 0xeef0ec, hemiGround: 0x5e5a52, hemiI: 1.0, exposure: 1.0 },
  /** a home in late-afternoon light: warm sun through the windows, soft cool bounce */
  interior: { sky: [0xdcd6cd, 0xefe9e1], fog: [12, 32], keyDir: [0.6, 0.75, 0.3], key: 0xffe6c8, keyI: 2.2, fill: 0xd9e3ff, fillI: 0.6, hemiSky: 0xfaf4ec, hemiGround: 0x9a8f82, hemiI: 1.15, exposure: 1.02 },
  /** the diorama: a model on a charcoal stage under a warm spot, a cool rim from behind */
  diorama: { sky: [0x1b1d20, 0x2a2b2e], fog: [18, 44], keyDir: [0.45, 0.85, 0.35], key: 0xffe2c2, keyI: 2.6, fill: 0xb9caff, fillI: 0.55, hemiSky: 0xe9e2d8, hemiGround: 0x2a2b2e, hemiI: 0.7, exposure: 1.02 },
} satisfies Record<string, LightLook>;
export type LightId = keyof typeof LIGHTS;

/** the open city's three lights in the same family (assemble.ts adds the sky dome, water and night extras) */
export const CITY_LOOKS = {
  day: { skyTop: 0x8ea3b5, horizon: 0xece5da, fog: [170, 720] as [number, number], sun: [0.42, 0.82, 0.38] as [number, number, number], sunColor: 0xfff0dd, sunI: 2.3, hemiSky: 0xf1ebe2, hemiGround: 0x5f5a52, hemiI: 1.05, fill: 0xcfdcff, fillI: 0.35, water: 0x4f8197, sheen: 0x0c1a22, night: false, exposure: 1.02 },
  golden: { skyTop: 0x5d6884, horizon: 0xf3c296, fog: [150, 680] as [number, number], sun: [-0.84, 0.3, 0.45] as [number, number, number], sunColor: 0xffb47a, sunI: 2.6, hemiSky: 0xf6dcc2, hemiGround: 0x5a4d44, hemiI: 1.25, fill: 0xbfd0ff, fillI: 0.3, water: 0x3d6577, sheen: 0x2e1b10, night: false, exposure: 1.05 },
  night: { skyTop: 0x0c0d10, horizon: 0x24272d, fog: [90, 560] as [number, number], sun: [0.3, 0.85, -0.42] as [number, number, number], sunColor: 0xaebcff, sunI: 0.3, hemiSky: 0x3a3f4a, hemiGround: 0x101114, hemiI: 0.45, fill: 0x8fa2d6, fillI: 0.1, water: 0x18222e, sheen: 0x05080c, night: true, exposure: 1.12 },
};
/** the open city's ground colours (terrain vertex colours) */
export const CITY_GROUND = { grass: 0x9a9f86, dry: 0xb0ac8e, sand: 0xe4d6bd, wet: 0xc5b79c, rock: 0x8f8a82, deep: 0x8a7f6a, pier: 0x9c8264 };

/** a matte material (the mockup look: no shine, soft falloff) */
export function mat(T: T3, color: number | string, o: { rough?: number; side?: any; emissive?: number; emissiveI?: number } = {}) {
  const m = new T.MeshStandardMaterial({ color, roughness: o.rough ?? 0.86, metalness: 0, side: o.side ?? T.FrontSide });
  if (o.emissive != null) { m.emissive.set(o.emissive); m.emissiveIntensity = o.emissiveI ?? 1; }
  return m;
}
/** a colour made darker (k < 1) or lighter (k > 1), in sRGB, as a hex number */
export function shade(hex: number | string, k: number): number {
  const n = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex; const ch = (s: number) => { const c = (n >> s) & 255; return Math.max(0, Math.min(255, Math.round(k < 1 ? c * k : c + (255 - c) * (k - 1)))); };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** a gradient for the background (top → horizon), drawn once per look into a small canvas */
export function skyTexture(T: T3, top: number, horizon: number) {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256; const g = cv.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 256);
  const css = (h: number) => `#${h.toString(16).padStart(6, '0')}`; gr.addColorStop(0, css(top)); gr.addColorStop(0.62, css(horizon)); gr.addColorStop(1, css(horizon));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; return tex;
}

// ---- grading the kits' atlas colours into the palette ----
/** how strongly the kits are pulled into the palette (shared by every graded material; 0 = the kit's own colours) */
export const GRADE = { sat: 0.24, warm: [1.04, 1.0, 0.93] as [number, number, number], lift: 0.22, accentKeep: 0.34 };
const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const toLin = (hex: number): [number, number, number] => [lin((hex >> 16) & 255), lin((hex >> 8) & 255), lin(hex & 255)];
/**
 * Pull a kit material into the palette: desaturate towards warm grey (kept: oranges and reds, as accents), and optionally recolour one key
 * colour of the piece (key: the kit's sRGB colour to replace, e.g. the sofa's fabric; all: every colour, shaded by its brightness) to `tint` (set later with setTint). Works on Lambert,
 * Phong and Standard materials and chains any onBeforeCompile already set (the open city's night windows run first).
 */
export function gradeKit(T: T3, m: any, o: { key?: number; tol?: number; tint?: number | string; amount?: number; all?: boolean } = {}) {
  const u = { uSat: { value: GRADE.sat }, uWarm: { value: new T.Vector3(...GRADE.warm) }, uLift: { value: GRADE.lift }, uAcc: { value: GRADE.accentKeep }, uAmt: { value: o.amount ?? 1 },
    uKeyOn: { value: o.all ? 2 : o.key != null ? 1 : 0 }, uKey: { value: new T.Vector3(...toLin(o.all ? 0xbcbcbc : o.key ?? 0xffffff)) }, uTol: { value: o.tol ?? 0.18 }, uTint: { value: new T.Color(o.tint ?? BRAND.orange) } };
  const prev = m.onBeforeCompile; const prevKey = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh: any, r: any) => { prev?.call(m, sh, r); Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSat; uniform vec3 uWarm; uniform float uLift; uniform float uAcc; uniform float uAmt; uniform float uKeyOn; uniform vec3 uKey; uniform float uTol; uniform vec3 uTint;');
    const at = ['#include <lights_lambert_fragment>', '#include <lights_physical_fragment>', '#include <lights_phong_fragment>'].find((s) => sh.fragmentShader.includes(s));
    if (!at) return;
    sh.fragmentShader = sh.fragmentShader.replace(at, `{
      vec3 c = max( diffuseColor.rgb, vec3( 0.0 ) ); float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
      float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) ); float chroma = ( mx - mn ) / max( mx, 1e-4 );
      float warmHue = smoothstep( 0.05, 0.2, c.r - c.b ) * smoothstep( -0.02, 0.06, c.r - c.g * 1.15 );
      float sat = mix( uSat, uAcc, warmHue );
      vec3 g = mix( vec3( l ), c, sat ) * uWarm; g = g * ( 1.0 - uLift ) + uLift * vec3( 0.36 ) * uWarm; /* lifts the darks a little: a soft maquette look */
      if ( uKeyOn > 0.5 ) { vec3 kd = uKey / max( max( uKey.r, max( uKey.g, uKey.b ) ), 1e-4 ); vec3 cd = c / max( mx, 1e-4 );
        float near = 1.0 - smoothstep( uTol, uTol * 1.8, distance( cd, kd ) ); float kl = dot( uKey, vec3( 0.2126, 0.7152, 0.0722 ) );
        float k = uKeyOn > 1.5 ? 1.0 : near * smoothstep( 0.08, 0.2, chroma ); vec3 t = uTint * clamp( l / max( kl, 1e-4 ), 0.35, 1.5 ); g = mix( g, t, k ); }
      diffuseColor.rgb = mix( c, g, uAmt );
    }
    ${at}`); };
  m.customProgramCacheKey = () => `grade-${o.all || o.key != null ? 'key' : 'plain'}|${prevKey ? prevKey() : ''}`;
  m.userData.grade = u; m.needsUpdate = true;
  return { setTint(hex: number | string) { u.uTint.value.set(hex); } };
}
/** Taxis keep their paint (2026-10-27): graded like the rest of the set, a taxi turned beige. isTaxi(kit id) says which cars; livery(m) is a
 *  copy of a graded kit material that keeps most of the kit's own colour (made once per material, shared by every taxi drawn with it). */
export const isTaxi = (k: string) => /taxi/.test(k);
export const LIVERY_GRADE = 0.3;
const liveries = new WeakMap<any, any>();
export function livery(T: T3, m: any): any {
  let n = liveries.get(m); if (n) return n;
  n = m.clone(); n.onBeforeCompile = () => undefined; n.customProgramCacheKey = () => ''; gradeKit(T, n, { amount: LIVERY_GRADE }); liveries.set(m, n); return n;
}
