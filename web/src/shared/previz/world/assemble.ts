/**
 * Open city (2026-10-26): assembles a WorldSpec (server/src/shared/world) into a three.js set for the Direct a Shot engine.
 * The kit pieces come from one meshopt-compressed GLB (web/public/models/open-city, made by scripts/assets/build-open-city.mjs).
 * Built once per page and kept (switching day / golden hour / night only relights it):
 *  - street tiles and buildings are merged per 100 m cell and material (a handful of draws per cell); street furniture and plants are
 *    merged into a separate "detail" layer per cell that is hidden beyond a shorter distance;
 *  - trees and parked cars are InstancedMeshes per 200 m chunk and piece; the ambient traffic is one InstancedMesh per car model, posed
 *    from t alone (CityWorld.carsAt), so a recording is deterministic;
 *  - level of detail and culling every frame: cells past the fog are hidden, details and trees go earlier, only nearby cells cast shadows,
 *    and the sun's shadow box follows the camera; the distances come from the graphics quality (previz/quality.ts).
 *  - terrain (hills, beach), sea, pond, pier and a gradient sky are our own geometry.
 * Night: windows glow (texels of the kits' window colours on walls, lit or dark per window from a hash), street lights get bulbs, light
 * pools on the ground and the nearest few real point lights, cars get head and tail lights.
 * City life (2026-10-27): the traffic lights' lamps change colour from t (CityWorld.signalAt: one head over the north–south lane is the kit's
 * own, a small east–west head on the pole is ours), the cars stop at red (CityWorld.carsAt), and people walk the pavements (world/crowd.ts),
 * with a Crowd: Off / Some / Busy setting next to the quality switch on the map.
 * Graphics quality (2026-10-27, previz/quality.ts): Low is the look above (matte Lambert kit, the gradient dome). From Medium every kit
 * material has a standard twin (world/cityLook.ts: building tints, glass that mirrors the sky, worn asphalt, paving), the day and golden-hour
 * sky is the Sky shader with a matching environment map, and the haze comes in closer; High adds AO and bloom (engine post), so the lamps,
 * signals, bulbs, car lights and lit windows are drawn brighter than white for the bloom to pick up. Clay and Depth always draw as Low.
 */
import { openCityWorld, type CityWorld } from '../../../../../server/src/shared/world/openCity';
import { terrainHeight, noise2 } from '../../../../../server/src/shared/world/terrain';
import { PIER, carScale } from '../../../../../server/src/shared/world/cityGen';
import { KIT } from '../../../../../server/src/shared/world/kitCatalog';
import type { PlanShot } from '../../../../../server/src/shared/previzTemplates';
import type { RenderCtx } from '../engine';
import { CITY_LOOKS, CITY_GROUND, gradeKit, isTaxi, livery, LIVERY_GRADE } from '../theme';
import { QUALITY } from '../quality';
import { surface, terrainSurface, createCitySky, type SurfaceKind } from './cityLook';
import { createCrowd, type CrowdLevel } from './crowd';

type T3 = typeof import('three');
export type CityLight = 'day' | 'golden' | 'night';
export const OPEN_CITY_URL = '/models/open-city/open-city.glb';
const CELL = 100, CHUNK = 200;

interface Look { skyTop: number; horizon: number; fog: [number, number]; sun: [number, number, number]; sunColor: number; sunI: number; hemiSky: number; hemiGround: number; hemiI: number; fill: number; fillI: number; water: number; /** the sky's reflection on the water */ sheen: number; night: boolean; exposure: number }
/** the three lights, from the brand theme (previz/theme.ts: warm neutral sky and fog, a warm sun, a cool fill) */
export const LOOKS: Record<CityLight, Look> = CITY_LOOKS;

// ---- crowd (a per-browser convenience, like quality) ----
export type { CrowdLevel };
let crowd: CrowdLevel = (() => { try { const v = localStorage.getItem('ohf:city-crowd'); return v === 'off' || v === 'busy' ? v : 'some'; } catch { return 'some'; } })();
const cSubs = new Set<(c: CrowdLevel) => void>();
export const cityCrowd = () => crowd;
export function setCityCrowd(c: CrowdLevel) { crowd = c; try { localStorage.setItem('ohf:city-crowd', c); } catch { /* private window */ } cSubs.forEach((f) => f(c)); }
export function onCityCrowd(f: (c: CrowdLevel) => void) { cSubs.add(f); return () => { cSubs.delete(f); }; }

// ---- loading the kit ----
/** GLTFLoader cleans node names the way three's PropertyBinding does (no dots): the piece id as a node name */
const nodeName = (id: string) => id.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
interface Part { geo: any; mat: any; key: string }
interface Kit { parts: Map<string, Part[]>; mats: any[]; windowMats: any[] }
/** every attribute as plain floats (meshopt quantizes them; transforms need floats) and the same attribute set everywhere, so any parts merge */
function plain(T: T3, src: any): any {
  const g = new T.BufferGeometry(); const n = src.attributes.position.count;
  const take = (name: string, size: number, fill: number[]) => { const a = src.attributes[name]; const out = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) out[i * size + c] = a ? (c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : a.getZ(i)) : fill[c]; return new T.BufferAttribute(out, size); };
  g.setAttribute('position', take('position', 3, [0, 0, 0])); g.setAttribute('normal', take('normal', 3, [0, 1, 0])); g.setAttribute('uv', take('uv', 2, [0.5, 0.5]));
  const idx = src.index ? Uint32Array.from(src.index.array as ArrayLike<number>) : Uint32Array.from({ length: n }, (_, i) => i); g.setIndex(new T.BufferAttribute(idx, 1)); return g;
}
async function loadKit(T: T3): Promise<Kit> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); const gltf = await loader.loadAsync(OPEN_CITY_URL);
  gltf.scene.updateMatrixWorld(true); const parts = new Map<string, Part[]>(); const matOf = new Map<any, any>(); const mats: any[] = []; const windowMats: any[] = [];
  for (const node of gltf.scene.children) { const list: Part[] = [];
    node.traverse((o: any) => { if (!o.isMesh) return; const src = o.material; let m = matOf.get(src);
      if (!m) { m = new T.MeshLambertMaterial({ color: src.color?.getHex?.() ?? 0xffffff, map: src.map ?? null, side: src.side ?? T.FrontSide });
        if (m.map) m.map.colorSpace = T.SRGBColorSpace; m.userData.atlas = !!src.map; m.userData.kit = String(node.name).slice(0, 2); matOf.set(src, m); mats.push(m); }
      const geo = plain(T, o.geometry); geo.applyMatrix4(o.matrixWorld); list.push({ geo, mat: m, key: String(mats.indexOf(m)) }); });
    parts.set(node.name, list); }
  for (const m of mats) if (m.userData.atlas) windowMats.push(m);
  return { parts, mats, windowMats };
}

// ---- night windows: lit texels of the kits' glass colours on walls ----
const nightU = { uNight: { value: 0 }, uWinGain: { value: 1 } };
/* the glass colours (sRGB) measured from each kit's atlas: KayKit's pale blue-grey panes, Kenney's slate-blue glass */
const GLASS: Record<string, string> = { kk: 'float bmr = s.b - s.r; float glass = step( 0.045, bmr ) * step( bmr, 0.13 ) * step( 0.74, s.r ) * step( s.b, 0.95 );',
  kc: 'float bmr = s.b - s.r; float glass = step( 0.07, bmr ) * step( bmr, 0.2 ) * step( 0.4, s.b ) * step( s.b, 0.66 );' };
function addWindows(m: any) { const rule = GLASS[m.userData.kit === 'kk' ? 'kk' : 'kc'];
  m.onBeforeCompile = (sh: any) => { sh.uniforms.uNight = nightU.uNight; sh.uniforms.uWinGain = nightU.uWinGain;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNor;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 wpw = modelMatrix * vec4( transformed, 1.0 ); vWPos = wpw.xyz; vWNor = normalize( mat3( modelMatrix ) * objectNormal );');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; uniform float uWinGain; varying vec3 vWPos; varying vec3 vWNor;\nfloat cityHash( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if ( uNight > 0.5 && abs( vWNor.y ) < 0.35 && vWPos.y > 1.2 ) {
        vec3 s = pow( max( diffuseColor.rgb, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) ); ${rule}
        vec3 cellId = floor( vec3( vWPos.x / 2.6, vWPos.y / 3.1, vWPos.z / 2.6 ) );
        float on = step( 0.42, cityHash( cellId ) ); vec3 warm = mix( vec3( 1.0, 0.72, 0.38 ), vec3( 1.0, 0.9, 0.7 ), cityHash( cellId + 3.1 ) );
        totalEmissiveRadiance += warm * 0.95 * uWinGain * clamp( glass, 0.0, 1.0 ) * on;
        diffuseColor.rgb *= mix( 1.0, 0.25, glass );
      }`); };
  m.customProgramCacheKey = () => `city-windows-${m.userData.kit}`; m.needsUpdate = true;
}

// ---- water: the sky's reflection by angle (fresnel), the sun's glitter path and small ripples, per look (2026-10-26) ----
/* Plain Phong showed only its own flat colour from street level: grey at golden hour. Now the sea mirrors the look's sky (warm horizon at
   golden hour, pale haze by day, near black with a cool moon path at night), with cheap procedural ripples that fade with distance. */
let waterU: any = null;
function addWater(T: T3, m: any) {
  waterU = { uSkyTop: { value: new T.Color() }, uHorizon: { value: new T.Color() }, uSunDir: { value: new T.Vector3(0, 1, 0) }, uSunCol: { value: new T.Color() }, uGlint: { value: 1 }, uReflect: { value: 0.8 }, uTime: { value: 0 } };
  m.onBeforeCompile = (sh: any) => { Object.assign(sh.uniforms, waterU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWaterW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWaterW; uniform vec3 uSkyTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uGlint; uniform float uReflect; uniform float uTime;')
      .replace('#include <opaque_fragment>', `{
      vec3 V = normalize( vViewPosition ); float dist = length( vViewPosition ); float amp = 0.045 * ( 1.0 - smoothstep( 30.0, 220.0, dist ) );
      vec2 p = vWaterW.xz; float t = uTime;
      vec2 sl = vec2( cos( p.x * 0.9 + p.y * 0.23 + t * 1.3 ) + 0.7 * cos( p.x * 2.3 - p.y * 1.4 + t * 2.1 ) + 0.4 * cos( p.x * 4.1 + p.y * 3.3 - t * 2.9 ), cos( p.y * 0.8 - p.x * 0.31 + t * 1.1 ) + 0.7 * cos( p.y * 2.5 + p.x * 1.1 - t * 1.7 ) + 0.4 * cos( p.y * 3.9 - p.x * 2.7 + t * 2.6 ) );
      vec3 nW = normalize( vec3( -sl.x * amp, 1.0, -sl.y * amp ) ); vec3 N = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
      vec3 R = reflect( -V, N ); vec3 Rw = inverseTransformDirection( R, viewMatrix );
      vec3 sky = mix( uHorizon, uSkyTop, smoothstep( 0.02, 0.3, max( Rw.y, 0.0 ) ) );
      float cosT = clamp( dot( N, V ), 0.0, 1.0 ); float fres = uReflect * ( 0.04 + 0.96 * pow( 1.0 - cosT, 5.0 ) );
      vec3 Sv = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz ); float sd = max( dot( R, Sv ), 0.0 );
      vec3 glint = uSunCol * uGlint * ( pow( sd, 220.0 ) * 3.0 + pow( sd, 24.0 ) * 0.35 ) * ( 0.4 + 0.6 * fres / max( uReflect, 1e-3 ) );
      outgoingLight = mix( outgoingLight, sky, clamp( fres, 0.0, 1.0 ) ) + glint;
    }
    #include <opaque_fragment>`); };
  m.customProgramCacheKey = () => 'city-water';
}
/** One look's water: the sky it mirrors, the sun (or moon) it glints with, how strongly. */
function setWater(T: T3, look: Look) { if (!waterU) return; const lin = (h: number) => new T.Color(h);
  waterU.uSkyTop.value.copy(lin(look.skyTop)); waterU.uHorizon.value.copy(lin(look.horizon)).multiplyScalar(look.night ? 2.2 : 1); /* at night the dark horizon, lifted a little, so the sea still reads */ waterU.uSunDir.value.set(...look.sun).normalize(); waterU.uSunCol.value.copy(lin(look.sunColor)).multiplyScalar(look.night ? 0.35 : 1);
  waterU.uGlint.value = look.night ? 0.6 : 1; waterU.uReflect.value = look.night ? 0.9 : 0.8; }

// ---- the set ----
interface Cell { x0: number; z0: number; base: any[]; detail: any[]; trees: any[] }
interface CityAssets { root: any; cells: Cell[]; world: CityWorld; terrainMat: any; waterMat: any; sky: any; setSky(top: number, horizon: number): void; cars: { update(t: number): void; lights: any[] }; signals: { update(t: number): void; lamps: any };
  night: any; lampHeads: [number, number, number][]; mats: any[];
  /** Medium and up: the standard twins (mesh.userData.lo / hi hold both), the terrain's twin, the glow materials and their base colours */ terrainHi: any; glow: { mat: any; base: number }[] }
let pending: Promise<CityAssets> | null = null;
/** Load the kit and build the city once per page (null-safe to call again; the second call gets the same set). */
export function loadCity(T: T3): Promise<CityAssets> { pending ??= timed(T).catch((e) => { pending = null; throw e; }); return pending; }

/** how long the last build took (ms), for the fps report in the demo script */
export const cityStats = { buildMs: 0, draws: 0 };
async function timed(T: T3) { const t0 = performance.now(); const a = await buildAssets(T); cityStats.buildMs = Math.round(performance.now() - t0); (globalThis as any).__openCity = cityStats; return a; }
async function buildAssets(T: T3): Promise<CityAssets> {
  const [{ mergeGeometries }, kit] = await Promise.all([import('three/examples/jsm/utils/BufferGeometryUtils.js'), loadKit(T)]);
  const world = openCityWorld(); const spec = world.spec; const root = new T.Group(); root.name = 'open-city';
  for (const m of kit.windowMats) addWindows(m);
  for (const m of kit.mats) gradeKit(T, m); /* the kits' bright atlas colours pulled into the brand palette (after the window glow, which reads them) */
  const detailMat = new Map<any, any>(); const dm = (m: any) => { let d = detailMat.get(m); if (!d) { d = m.clone(); d.onBeforeCompile = () => undefined; gradeKit(T, d); d.userData.base = m; detailMat.set(m, d); } return d; }; /* props: no window glow */
  /* the standard (PBR) twin of a kit material, made from the kit's own colour and atlas: the same night windows and palette grade, plus cityLook's surface detail */
  const twins = new Map<string, any>();
  const twin = (lo: any, kind: SurfaceKind, amount = 1) => { const base = lo.userData.base ?? lo; const key = `${kit.mats.indexOf(base)}|${kind}|${amount}`; let hi = twins.get(key); if (hi) return hi;
    hi = new T.MeshStandardMaterial({ color: base.color.getHex(), map: base.map ?? null, side: base.side }); hi.userData = { ...base.userData };
    if (kind === 'kit' && base.userData.atlas) addWindows(hi); gradeKit(T, hi, { amount }); surface(T, hi, kind); twins.set(key, hi); return hi; };
  const pair = (mesh: any, kind: SurfaceKind, amount = 1) => { mesh.userData.lo = mesh.material; mesh.userData.hi = twin(mesh.material, kind, amount); };
  const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), pos = new T.Vector3(), scl = new T.Vector3();
  const matrixOf = (x: number, y: number, z: number, rot: number, s: number) => m4.compose(pos.set(x, y, z), q.setFromAxisAngle(up, rot), scl.set(s, s, s));
  const cellKey = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; const chunkKey = (x: number, z: number) => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
  const merged = new Map<string, { cell: string; layer: 'base' | 'detail'; mat: any; geos: any[] }>();
  const inst = new Map<string, { chunk: string; k: string; part: Part; mats: any[] }>();
  for (const p of spec.pieces) { const k = KIT[p.k]; const parts = kit.parts.get(nodeName(p.k)); if (!k || !parts) continue; const mtx = matrixOf(p.x, p.y, p.z, (p.r * Math.PI) / 2, p.s ?? 1);
    if (k.kind === 'tree' || k.kind === 'car') { const ch = chunkKey(p.x, p.z); parts.forEach((part, i) => { const key = `${ch}|${p.k}|${i}`; let b = inst.get(key); if (!b) inst.set(key, (b = { chunk: ch, k: p.k, part, mats: [] })); b.mats.push(mtx.clone()); }); continue; }
    const layer = k.kind === 'tile' || k.kind === 'building' ? 'base' : 'detail'; const cell = cellKey(p.x, p.z);
    for (const part of parts) { const mat = layer === 'detail' ? dm(part.mat) : part.mat; const key = `${cell}|${layer}|${part.key}`; let b = merged.get(key); if (!b) merged.set(key, (b = { cell, layer, mat, geos: [] }));
      b.geos.push(part.geo.clone().applyMatrix4(mtx)); } }
  const cells = new Map<string, Cell>(); const cellOf = (key: string) => { let c = cells.get(key); if (!c) { const [i, j] = key.split(',').map(Number); cells.set(key, (c = { x0: i * CELL, z0: j * CELL, base: [], detail: [], trees: [] })); } return c; };
  for (const b of merged.values()) { const geo = mergeGeometries(b.geos, false); for (const g of b.geos) g.dispose(); if (!geo) continue; geo.computeBoundingSphere();
    const mesh = new T.Mesh(geo, b.mat); mesh.receiveShadow = true; mesh.castShadow = true; mesh.matrixAutoUpdate = false; root.add(mesh); pair(mesh, b.layer === 'base' ? 'kit' : 'prop');
    const c = cellOf(b.cell); (b.layer === 'base' ? c.base : c.detail).push(mesh); }
  for (const b of inst.values()) { const im = new T.InstancedMesh(b.part.geo, b.part.mat, b.mats.length); b.mats.forEach((m: any, i: number) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; im.matrixAutoUpdate = false; root.add(im); pair(im, KIT[b.k]?.kind === 'car' ? 'car' : 'tree');
    /* a chunk spans four cells: its meshes follow the chunk's corner cell for the distance checks */
    const [i, j] = b.chunk.split(',').map(Number); const c = cellOf(`${i * 2},${j * 2}`); c.trees.push(im); im.userData.chunk = [i * CHUNK, j * CHUNK]; }

  // terrain: hills, beach and the grass under the city (its colours from height, slope and the shore)
  const tr = spec.terrain; const SIZE = 1500, SEG = 250; const tg = new T.PlaneGeometry(SIZE, SIZE, SEG, SEG); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position; const cols = new Float32Array(tp.count * 3); const c3 = new T.Color(); const G = CITY_GROUND; const grass = new T.Color(G.grass), dry = new T.Color(G.dry), sand = new T.Color(G.sand), wet = new T.Color(G.wet), rock = new T.Color(G.rock), deep = new T.Color(G.deep);
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i); const y = terrainHeight(tr, x, z); tp.setY(i, y); const n = noise2(x / 23, z / 23, 11);
    c3.copy(grass).lerp(dry, n * 0.6); if (z > tr.flat[3] + 1) c3.copy(y < tr.water + 0.1 ? (y < tr.water - 0.8 ? deep : wet) : sand); if (y > 22) c3.lerp(rock, Math.min(1, (y - 22) / 18) * (0.4 + n * 0.5));
    cols[i * 3] = c3.r; cols[i * 3 + 1] = c3.g; cols[i * 3 + 2] = c3.b; }
  tg.setAttribute('color', new T.BufferAttribute(cols, 3)); tg.computeVertexNormals();
  const terrainMat = new T.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
  const terrainHi = terrainSurface(T, terrainMat); const terrain = new T.Mesh(tg, terrainMat); terrain.userData.lo = terrainMat; terrain.userData.hi = terrainHi; terrain.receiveShadow = true; terrain.userData.noCast = true; terrain.matrixAutoUpdate = false; root.add(terrain);
  const waterMat = new T.MeshPhongMaterial({ color: 0x3f86ad, shininess: 80, specular: 0x6f8ea0 }); addWater(T, waterMat);
  const sea = new T.Mesh(new T.PlaneGeometry(6000, 6000), waterMat); sea.rotation.x = -Math.PI / 2; sea.position.y = tr.water; sea.updateMatrix(); sea.matrixAutoUpdate = false; sea.receiveShadow = false; /* a low sun would streak a huge flat plane with shadow acne */ root.add(sea);
  for (const [px, pz, pr] of spec.ponds) { const pond = new T.Mesh(new T.CircleGeometry(pr, 48), waterMat); pond.rotation.x = -Math.PI / 2; pond.position.set(px, -0.02, pz); pond.updateMatrix(); pond.matrixAutoUpdate = false; root.add(pond); }
  // the pier: planks, beams, posts and railings (our own boxes, merged)
  { const wood: any[] = []; const bx = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => { const g = new T.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); wood.push(plain(T, g)); g.dispose(); };
    const W = PIER.x1 - PIER.x0, mx = (PIER.x0 + PIER.x1) / 2; const rampLen = PIER.ramp - PIER.z0; const ang = Math.atan2(PIER.deck - 0.15, rampLen);
    bx(W, 0.12, Math.hypot(rampLen, PIER.deck - 0.15), mx, (0.15 + PIER.deck) / 2 - 0.06, (PIER.z0 + PIER.ramp) / 2, -ang);
    for (let z = PIER.ramp; z < PIER.z1; z += 0.9) bx(W, 0.1, 0.8, mx, PIER.deck - 0.05, z + 0.45);
    for (const x of [PIER.x0 + 0.15, PIER.x1 - 0.15]) { bx(0.25, 0.3, PIER.z1 - PIER.ramp, x, PIER.deck - 0.25, (PIER.ramp + PIER.z1) / 2);
      for (let z = PIER.ramp; z <= PIER.z1; z += 4) { bx(0.35, PIER.deck + 3.2, 0.35, x, (PIER.deck - 3.2) / 2, z); bx(0.12, 1.0, 0.12, x, PIER.deck + 0.5, z); }
      bx(0.12, 0.1, PIER.z1 - PIER.ramp, x, PIER.deck + 1.0, (PIER.ramp + PIER.z1) / 2); }
    bx(W, 0.1, 0.12, mx, PIER.deck + 1.0, PIER.z1);
    const pier = new T.Mesh(mergeGeometries(wood, false), new T.MeshLambertMaterial({ color: CITY_GROUND.pier })); pier.userData.lo = pier.material; pier.userData.hi = new T.MeshStandardMaterial({ color: CITY_GROUND.pier, roughness: 0.88, metalness: 0 }); pier.castShadow = true; pier.receiveShadow = true; pier.matrixAutoUpdate = false; root.add(pier); for (const g of wood) g.dispose();
    const c = cellOf(cellKey(mx, (PIER.z0 + PIER.z1) / 2)); c.base.push(pier); }
  // the sky: a gradient dome (beauty only; fog off)
  const skyG = new T.SphereGeometry(1800, 32, 16); const skyC = new Float32Array(skyG.attributes.position.count * 3); skyG.setAttribute('color', new T.BufferAttribute(skyC, 3));
  const sky = new T.Mesh(skyG, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.noCast = true; root.add(sky);
  const top = new T.Color(), hor = new T.Color();
  const setSky = (t0: number, h0: number) => { top.set(t0); hor.set(h0); const sp = skyG.attributes.position; for (let i = 0; i < sp.count; i++) { const k = Math.max(0, sp.getY(i) / 1800); const e = Math.pow(k, 0.55); c3.copy(hor).lerp(top, e); skyC[i * 3] = c3.r; skyC[i * 3 + 1] = c3.g; skyC[i * 3 + 2] = c3.b; } skyG.attributes.color.needsUpdate = true; };

  // ambient traffic: one InstancedMesh per car model part, posed by update(t)
  const t0 = world.carsAt(0); const byKind = new Map<string, number>(); for (const c of t0) byKind.set(c.k, (byKind.get(c.k) ?? 0) + 1);
  const carMeshes: { k: string; im: any }[] = []; for (const [k, n] of byKind) for (const part of kit.parts.get(nodeName(k)) ?? []) { const im = new T.InstancedMesh(part.geo, isTaxi(k) ? livery(T, part.mat) : part.mat, n); im.userData.lo = im.material; im.userData.hi = twin(part.mat, 'car', isTaxi(k) ? LIVERY_GRADE : 1); im.instanceMatrix.setUsage(T.DynamicDrawUsage); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.matrixAutoUpdate = false; root.add(im); carMeshes.push({ k, im }); }
  const lightG = new T.BoxGeometry(0.34, 0.16, 0.06); const head = new T.InstancedMesh(lightG, new T.MeshBasicMaterial({ color: 0xfff3d6, fog: false }), t0.length * 2); const tail = new T.InstancedMesh(lightG, new T.MeshBasicMaterial({ color: 0xff2a1e }), t0.length * 2);
  for (const im of [head, tail]) { im.instanceMatrix.setUsage(T.DynamicDrawUsage); im.frustumCulled = false; im.matrixAutoUpdate = false; im.userData.noCast = true; im.visible = false; root.add(im); }
  const v = new T.Vector3();
  const cars = { lights: [head, tail], update(t: number) { const list = world.carsAt(t); const seen = new Map<string, number>(); let li = 0;
    for (const c of list) { const i = seen.get(c.k) ?? 0; seen.set(c.k, i + 1); const sc = carScale(c.k); const mtx = matrixOf(c.x, c.y, c.z, c.heading, sc);
      for (const cm of carMeshes) if (cm.k === c.k) cm.im.setMatrixAt(i, mtx);
      const kitC = KIT[c.k]; const half = ((kitC?.d ?? 4) / 2) * sc; const hy = 0.75 * sc; const fx = Math.sin(c.heading), fz = Math.cos(c.heading), rx = Math.cos(c.heading), rz = -Math.sin(c.heading);
      for (const side of [-0.62 * sc, 0.62 * sc]) { head.setMatrixAt(li, matrixOf(c.x + fx * half + rx * side, hy, c.z + fz * half + rz * side, c.heading, 1)); tail.setMatrixAt(li, matrixOf(c.x - fx * half + rx * side, hy, c.z - fz * half + rz * side, c.heading, 1)); li++; } }
    for (const cm of carMeshes) cm.im.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true; tail.instanceMatrix.needsUpdate = true; void v; } };

  // traffic lights: three lamps on the kit's head over the north–south lane (it faces +z, at the arm's end), and our own small head on the
  // pole facing +x for east–west traffic; lit from CityWorld.signalAt(j, t)
  const LAMP = { red: [0xff2a1e, 0x3a1210], amber: [0xffb21e, 0x3a2a10], green: [0x2bff7a, 0x0f3a22] } as const;
  const nJ = world.junctions.length; const lampG = new T.CircleGeometry(0.11, 12); const lampMat = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lamps = new T.InstancedMesh(lampG, lampMat, nJ * 6); lamps.userData.noCast = true; lamps.matrixAutoUpdate = false;
  const housing = new T.InstancedMesh(new T.BoxGeometry(0.3, 0.98, 0.34), new T.MeshLambertMaterial({ color: 0x23262b }), nJ); housing.matrixAutoUpdate = false;
  const ORDER = ['red', 'amber', 'green'] as const; const col3 = new T.Color();
  world.junctions.forEach((J, j) => { const [px, pz] = J.pole;
    ORDER.forEach((_, k) => { lamps.setMatrixAt(j * 6 + k, matrixOf(px - 3.3, 0.15 + 4.62 - k * 0.31, pz + 0.47, 0, 1)); /* the kit's head, facing +z */
      lamps.setMatrixAt(j * 6 + 3 + k, matrixOf(px + 0.43, 0.15 + 3.3 - k * 0.3, pz, Math.PI / 2, 1)); }); /* ours, facing +x */
    housing.setMatrixAt(j, matrixOf(px + 0.27, 0.15 + 3.0, pz, 0, 1)); });
  for (const im of [lamps, housing]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); root.add(im); }
  const lampKey: string[] = [];
  const signals = { lamps, update(t: number) { let dirty = false;
    for (let j = 0; j < nJ; j++) { const s = world.signalAt(j, t); const key = s.ns + s.ew; if (lampKey[j] === key) continue; lampKey[j] = key; dirty = true;
      ORDER.forEach((c, k) => { lamps.setColorAt(j * 6 + k, col3.setHex(LAMP[c][s.ns === c ? 0 : 1])); lamps.setColorAt(j * 6 + 3 + k, col3.setHex(LAMP[c][s.ew === c ? 0 : 1])); }); }
    if (dirty && lamps.instanceColor) lamps.instanceColor.needsUpdate = true; } };
  signals.update(0);

  // night: lamp bulbs, light pools on the ground, and a few real lights that follow the camera
  const lampHeads: [number, number, number][] = []; for (const p of spec.pieces) if (p.k === 'kk.streetlight') { const [ox, oz] = [Math.cos((p.r * Math.PI) / 2) * -1.05, -Math.sin((p.r * Math.PI) / 2) * -1.05]; lampHeads.push([p.x + ox, p.y + 4.55, p.z + oz]); }
  const night = new T.Group(); night.visible = false; root.add(night);
  const bulbs = new T.InstancedMesh(new T.SphereGeometry(0.28, 10, 8), new T.MeshBasicMaterial({ color: 0xffd9a0, fog: false }), lampHeads.length);
  const poolTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g2 = cv.getContext('2d')!; const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,214,150,0.85)'); gr.addColorStop(0.45, 'rgba(255,190,120,0.35)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64); return new T.CanvasTexture(cv); })();
  const poolG = new T.PlaneGeometry(13, 13); poolG.rotateX(-Math.PI / 2);
  const pools = new T.InstancedMesh(poolG, new T.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), lampHeads.length);
  lampHeads.forEach(([x, y, z], i) => { bulbs.setMatrixAt(i, matrixOf(x, y, z, 0, 1)); pools.setMatrixAt(i, matrixOf(x, world.groundAt(x, z) + 0.04, z, 0, 1)); });
  for (const im of [bulbs, pools]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.userData.noCast = true; im.matrixAutoUpdate = false; night.add(im); }
  const points = Array.from({ length: 6 }, () => { const l = new T.PointLight(0xffc98a, 18, 18, 2); night.add(l); return l; });
  night.userData.points = points;
  const glow = [{ mat: lampMat, base: 0xffffff }, { mat: bulbs.material, base: 0xffd9a0 }, { mat: head.material, base: 0xfff3d6 }, { mat: tail.material, base: 0xff2a1e }];
  return { root, cells: [...cells.values()], world, terrainMat, waterMat, sky, setSky, cars, signals, night, lampHeads, mats: kit.mats, terrainHi, glow };
}

/** The open city as an engine preset: shows the shared set (loading it the first time), lights it for day, golden hour or night, and keeps
 *  the frame rate up with per-frame culling and a camera-following shadow box. Medium and up swap in the standard twins, the Sky shader and
 *  its environment map (per engine: a baked map belongs to one WebGL context). */
export function buildCity(T: T3, g: any, _s: PlanShot, ctx: RenderCtx, light: CityLight) {
  const look = LOOKS[light]; const holder = new T.Group(); g.add(holder); let a: CityAssets | null = null; let gone = false;
  const people = createCrowd(T, openCityWorld()); holder.add(people.root); let lastT = 0; (cityStats as any).crowd = () => people.shown;
  const offCrowd = onCityCrowd(() => ctx.redraw()); /* the setting shows at once, even on a still frame */
  const sky = createCitySky(T, ctx.renderer); let skyOn = false;
  const saved = { near: ctx.camera.near, far: ctx.camera.far, sun: ctx.sun.color.getHex(), sunI: ctx.sun.intensity, hemiS: ctx.hemi.color.getHex(), hemiG: ctx.hemi.groundColor.getHex(), hemiI: ctx.hemi.intensity, fill: ctx.fill.color.getHex(), fillI: ctx.fill.intensity, exp: ctx.renderer.toneMappingExposure, nb: ctx.sun.shadow.normalBias, bias: ctx.sun.shadow.bias };
  const ready = Promise.all([loadCity(T), sky.ready]).then(([x]) => { if (gone) return; a = x; holder.add(x.root); x.setSky(look.skyTop, look.horizon); x.waterMat.color.set(look.water); x.waterMat.emissive.set(look.sheen); setWater(T, look); x.waterMat.specular.set(look.night ? 0x8a7458 /* warm street-light streaks */ : light === 'golden' ? 0xffb070 : 0x6f8ea0);
    x.night.visible = look.night; for (const l of x.cars.lights) l.visible = look.night; nightU.uNight.value = look.night ? 1 : 0; x.cars.update(0);
    sky.set(light, look); if (sky.mesh) { sky.mesh.visible = false; holder.add(sky.mesh); } ctx.redraw(); })
    .catch((e) => { console.warn('Open city: the kit could not be loaded', e); }).then(() => people.ready);
  const sd = new T.Vector3(...look.sun).normalize(); const fwd = new T.Vector3(); const focus = new T.Vector3(); let pbrNow: boolean | null = null; let glowNow = -1;
  /* the bloom and AO per light: by day only the sun's disc and the lamps glow; at night the bulbs, windows and car lights */
  const postLook = look.night ? { threshold: 2.4, strength: 0.4, radius: 0.5, ao: 0.9 } : { threshold: light === 'golden' ? 2.6 : 3.2, strength: 0.32, radius: 0.5, ao: 1 };
  return {
    sky: look.horizon, ground: CITY_GROUND.grass, fog: look.fog, tint: [] as any[], shadow: { center: [0, 0, 0] as [number, number, number], size: 90 }, ready,
    update(t: number) { lastT = t; a?.cars.update(t); a?.signals.update(t); if (waterU) waterU.uTime.value = t; },
    beforeRender(c: RenderCtx) {
      const cam = c.camera; if (cam.near !== 0.15 || cam.far !== 2200) { cam.near = 0.15; cam.far = 2200; cam.updateProjectionMatrix(); }
      c.sun.shadow.normalBias = 0.12; c.sun.shadow.bias = -0.0006; /* a ~95 m shadow box: coarser texels than the small sets need */
      c.sun.color.set(look.sunColor); c.sun.intensity = look.sunI; c.hemi.color.set(look.hemiSky); c.hemi.groundColor.set(look.hemiGround); c.hemi.intensity = look.hemiI; c.fill.color.set(look.fill); c.fill.intensity = look.fillI;
      if (c.pass === 'beauty') c.renderer.toneMappingExposure = look.exposure;
      cityStats.draws = c.renderer.info.render.calls; (cityStats as any).tris = c.renderer.info.render.triangles; /* the last frame's numbers (for the demo script's report) */
      c.scene.environment = null; if (!a) return; const Q = c.preset; const D = Q.dist; const beauty = c.pass === 'beauty';
      /* Medium and up: the standard twins (only switched in the Simple view; Clay and Depth draw their own material over either) */
      if (beauty && pbrNow !== Q.pbr) { pbrNow = Q.pbr; const pick = Q.pbr ? 'hi' : 'lo'; a.root.traverse((o: any) => { const m = o.userData?.[pick]; if (m) o.material = m; }); }
      const glow = beauty && Q.bloom ? 1 : 0; if (glow !== glowNow) { glowNow = glow; for (const gm of a.glow) { gm.mat.color.set(gm.base); if (glow) gm.mat.color.multiplyScalar(look.night ? 3.2 : 5); } nightU.uWinGain.value = glow ? 1.15 : 1; }
      skyOn = beauty && Q.sky && !look.night && !!sky.mesh; if (sky.mesh) sky.mesh.visible = skyOn;
      if (beauty && Q.pbr) { const env = sky.env(light, { ...look, ground: CITY_GROUND.grass }); if (env) { c.scene.environment = env; c.scene.environmentIntensity = sky.envIntensity(light); c.hemi.intensity = look.hemiI * 0.55; } }
      if (c.scene.fog && beauty) { c.scene.fog.near = Math.min(look.fog[0], D.far * 0.3) * (Q.pbr ? 0.5 : 1); c.scene.fog.far = Math.min(look.fog[1], D.far); } /* Medium and up: the haze starts closer, for depth */
      c.post = postLook;
      a.sky.visible = beauty && !skyOn; a.signals.lamps.visible = beauty; /* clay and depth stay plain */ a.night.visible = look.night && beauty; for (const l of a.cars.lights) l.visible = look.night && beauty;
      const px = cam.position.x, pz = cam.position.z;
      cam.getWorldDirection(fwd); const fl = Math.hypot(fwd.x, fwd.z) || 1;
      people.update(lastT, { x: px, z: pz, fx: fwd.x / fl, fz: fwd.z / fl }, cam.position.y > 80 ? 'off' : crowd, Q.crowd); /* posed from t; which ones are drawn follows the camera */
      const hgt = Math.max(0, cam.position.y - 30); /* from high up, see further */
      const far = D.far + hgt * 1.5, det = D.detail + hgt, trees = D.trees + hgt;
      for (const cell of a.cells) { const dx = Math.max(cell.x0 - px, 0, px - (cell.x0 + CELL)), dz = Math.max(cell.z0 - pz, 0, pz - (cell.z0 + CELL)); const d = Math.hypot(dx, dz);
        const sh = d < D.shadow; for (const m of cell.base) { m.visible = d < far; m.castShadow = sh; } for (const m of cell.detail) { m.visible = d < det; m.castShadow = sh; } }
      for (const cell of a.cells) for (const m of cell.trees) { const [x0, z0] = m.userData.chunk; const dx = Math.max(x0 - px, 0, px - (x0 + CHUNK)), dz = Math.max(z0 - pz, 0, pz - (z0 + CHUNK)); const d = Math.hypot(dx, dz); m.visible = d < trees; m.castShadow = d < D.shadow; }
      { /* the sun's shadow box follows what the camera sees */
        cam.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize(); const reach = Math.min(D.box * 0.6, 20 + Math.max(0, cam.position.y) * 0.8);
        focus.set(px + fwd.x * reach, 0, pz + fwd.z * reach); const tex = (D.box * 2) / c.sun.shadow.mapSize.x; focus.x = Math.round(focus.x / tex) * tex; focus.z = Math.round(focus.z / tex) * tex;
        c.sun.target.position.copy(focus); c.sun.position.copy(focus).addScaledVector(sd, 400); const sc = c.sun.shadow.camera;
        if (sc.right !== D.box) { sc.left = -D.box; sc.right = D.box; sc.top = D.box; sc.bottom = -D.box; sc.near = 50; sc.far = 900; sc.updateProjectionMatrix(); }
        c.sun.target.updateMatrixWorld(); c.sun.updateMatrixWorld(); }
      if (look.night) { const pts = a.night.userData.points as any[]; const near = a.lampHeads.map((p, i) => [Math.hypot(p[0] - px, p[2] - pz), i]).sort((u, w) => u[0] - w[0]).slice(0, pts.length);
        near.forEach(([, i], k) => { const p = a!.lampHeads[i]; pts[k].position.set(p[0], p[1] - 0.6, p[2]); }); }
    },
    dispose() { gone = true; offCrowd(); people.dispose(); if (a) { holder.remove(a.root); for (const gm of a.glow) gm.mat.color.set(gm.base); } nightU.uNight.value = 0; nightU.uWinGain.value = 1; sky.mesh?.removeFromParent(); sky.dispose(); const c = ctx; c.scene.environment = null; c.camera.near = saved.near; c.camera.far = saved.far; c.camera.updateProjectionMatrix();
      c.sun.color.setHex(saved.sun); c.sun.intensity = saved.sunI; c.hemi.color.setHex(saved.hemiS); c.hemi.groundColor.setHex(saved.hemiG); c.hemi.intensity = saved.hemiI; c.fill.color.setHex(saved.fill); c.fill.intensity = saved.fillI;
      c.renderer.toneMappingExposure = saved.exp; c.sun.shadow.normalBias = saved.nb; c.sun.shadow.bias = saved.bias; c.renderer.shadowMap.enabled = true; const sc = c.sun.shadow.camera; sc.right = -1; /* the next preset sets its own box */ },
  };
}
export const preloadCity = (T: T3) => { void loadCity(T).catch(() => undefined); };
