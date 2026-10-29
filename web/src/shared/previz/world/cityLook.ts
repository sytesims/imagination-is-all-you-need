/**
 * The open city's Medium-and-up look (2026-10-27; previz/quality.ts). Low keeps the matte Lambert kit and the gradient dome (assemble.ts);
 * from Medium every kit material gets a standard (PBR) twin made here, and the day and golden-hour skies come from three's Sky shader:
 *  - surface(): per building a seeded tint (from its 10 m tile, so it is the same in every frame and every recording), windows that turn
 *    to glass (low roughness, a little metal: they mirror the sky through the environment map), worn asphalt (oil stains, lighter wheel
 *    tracks) and paving slabs with joints on the pavements, all made in the shader from world position. No textures are downloaded.
 *  - the sky: Sky (Preetham, with its own soft clouds, fixed in time) aimed at the look's sun, pulled towards the theme's sky and warm
 *    horizon so it stays in the palette and the fog meets it without a seam; at night the gradient dome stays (the shader's night is a flat black).
 *  - the environment: the theme's sky (top, horizon, a warm ground, a soft sun) baked once per look into a PMREM map (scene.environment)
 *    for reflections and soft fill light.
 * Pure in t: nothing here reads a clock.
 */
type T3 = typeof import('three');

const NOISE = `
float cqHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float cqNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cqHash( i ), cqHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( cqHash( i + vec2( 0.0, 1.0 ) ), cqHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y ); }
float cqFbm( vec2 p ) { return 0.55 * cqNoise( p ) + 0.3 * cqNoise( p * 2.07 + 3.1 ) + 0.15 * cqNoise( p * 4.31 + 7.7 ); }`;
/* the kits' glass colours (sRGB), as in assemble.ts's night windows */
const GLASS: Record<string, string> = { kk: 'float bmr = s.b - s.r; sGlass = step( 0.045, bmr ) * step( bmr, 0.13 ) * step( 0.74, s.r ) * step( s.b, 0.95 );',
  kc: 'float bmr = s.b - s.r; sGlass = step( 0.07, bmr ) * step( bmr, 0.2 ) * step( 0.4, s.b ) * step( s.b, 0.66 );' };

/** what a standard twin is for: kit buildings and tiles (atlas: glass, tints, ground detail), props, cars (glossier paint), trees */
export type SurfaceKind = 'kit' | 'prop' | 'car' | 'tree';
/** Add the city's surface detail to a standard material (chains whatever onBeforeCompile it has: night windows, the palette grade). */
export function surface(T: T3, m: any, kind: SurfaceKind) {
  const kit = m.userData.kit === 'kk' ? 'kk' : 'kc'; const atlas = !!m.userData.atlas && kind !== 'tree';
  m.roughness = kind === 'car' ? 0.42 : kind === 'tree' ? 0.92 : 0.82; m.metalness = kind === 'car' ? 0.18 : 0;
  const prev = m.onBeforeCompile; const prevKey = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh: any, r: any) => { prev?.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCqW; varying vec3 vCqN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 cw = vec4( transformed, 1.0 );\n#ifdef USE_INSTANCING\ncw = instanceMatrix * cw;\n#endif\nvCqW = ( modelMatrix * cw ).xyz; vCqN = normalize( mat3( modelMatrix ) * objectNormal ); }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vCqW; varying vec3 vCqN;${NOISE}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      float sGlass = 0.0; vec3 s = pow( max( diffuseColor.rgb, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) ); float sLum = dot( s, vec3( 0.2126, 0.7152, 0.0722 ) );
      ${atlas ? GLASS[kit] : ''}
      sGlass *= step( abs( vCqN.y ), 0.35 );`)
      .replace('#include <lights_physical_fragment>', `{
      vec3 Nw = normalize( vCqN );
      ${kind === 'kit' ? `
      /* a seeded tint per building (its 10 m tile): warmer or cooler, lighter or darker, never loud */
      if ( abs( Nw.y ) < 0.5 && vCqW.y > 0.4 ) { vec2 cell = floor( vCqW.xz / 10.0 ); float h1 = cqHash( cell ), h2 = cqHash( cell + 17.3 );
        diffuseColor.rgb *= mix( vec3( 0.93, 0.96, 1.03 ), vec3( 1.07, 1.01, 0.92 ), h1 ) * ( 0.9 + 0.18 * h2 );
        /* a little grime towards the ground and streaks down the walls */
        float grime = ( 1.0 - smoothstep( 0.3, 2.6, vCqW.y ) ) * 0.16 + cqFbm( vec2( ( vCqW.x + vCqW.z ) * 1.3, vCqW.y * 0.22 ) ) * 0.08;
        diffuseColor.rgb *= 1.0 - grime * ( 1.0 - sGlass ); }
      /* the ground: worn asphalt and paving slabs */
      if ( Nw.y > 0.9 && vCqW.y < 0.6 ) { vec2 p = vCqW.xz;
        if ( sLum < 0.36 ) { float stain = smoothstep( 0.55, 0.85, cqFbm( p * 0.45 ) ); float patchy = cqFbm( p * 0.08 + 11.0 );
          diffuseColor.rgb *= ( 0.86 + 0.22 * patchy ) * ( 1.0 - 0.28 * stain ) * ( 0.94 + 0.12 * cqNoise( p * 9.0 ) ); roughnessFactor = mix( roughnessFactor, 0.55, stain ); }
        else if ( vCqW.y > 0.08 ) { vec2 g = p / vec2( 1.0, 0.75 ); vec2 f = abs( fract( g ) - 0.5 ); float joint = 1.0 - smoothstep( 0.46, 0.49, max( f.x, f.y ) );
          diffuseColor.rgb *= ( 0.9 + 0.1 * cqHash( floor( g ) ) ) * mix( 0.8, 1.0, joint ) * ( 0.95 + 0.08 * cqNoise( p * 3.0 ) ); } }` : ''}
      ${kind === 'tree' ? 'diffuseColor.rgb *= 0.9 + 0.2 * cqHash( floor( vCqW.xz / 3.0 ) );' : ''}
      /* glass: smooth and a little metallic, so it mirrors the sky (the environment map); darker in itself */
      roughnessFactor = mix( roughnessFactor, 0.06, sGlass ); metalnessFactor = mix( metalnessFactor, 0.7, sGlass ); diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.55, 0.62, 0.7 ), sGlass );
    }
    #include <lights_physical_fragment>`); };
  m.customProgramCacheKey = () => `city-surface-${kind}-${atlas ? kit : 'plain'}|${prevKey ? prevKey() : ''}`; m.needsUpdate = true; return m;
}

/** The terrain's Medium look: the same vertex colours, mottled grass and sand, a matte standard material */
export function terrainSurface(T: T3, base: any) {
  const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: base.polygonOffsetFactor, polygonOffsetUnits: base.polygonOffsetUnits });
  m.onBeforeCompile = (sh: any) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCqW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCqW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vCqW;${NOISE}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.86 + 0.24 * cqFbm( vCqW.xz * 0.11 ) + 0.06 * cqNoise( vCqW.xz * 1.7 );'); };
  m.customProgramCacheKey = () => 'city-terrain'; return m;
}

/** the look a sky is set from (assemble.ts CITY_LOOKS) */
export interface SkyLook { sun: [number, number, number]; horizon: number; skyTop: number; night: boolean; sunColor: number; hemiGround: number; ground?: number }
/** per light: the Sky shader's air (thicker and warmer at golden hour), how bright, how much of the theme's horizon it takes */
const AIR = { day: { turbidity: 4.5, rayleigh: 1.1, mie: 0.004, g: 0.82, gain: 0.55, horizon: 0.55, top: 0.3, cloud: 0.35, env: 0.8 }, golden: { turbidity: 7, rayleigh: 2.2, mie: 0.006, g: 0.86, gain: 0.5, horizon: 0.6, top: 0.5, cloud: 0.3, env: 0.8 }, night: { turbidity: 2, rayleigh: 1, mie: 0.003, g: 0.8, gain: 0, horizon: 0, top: 0, cloud: 0, env: 0.3 } };
export type SkyLight = keyof typeof AIR;
export interface CitySky { mesh: any; /** null at night (the dome stays) */ set(light: SkyLight, look: SkyLook): void; env(light: SkyLight, look: SkyLook & { ground: number }): any; envIntensity(light: SkyLight): number; ready: Promise<void>; dispose(): void }

/** The Sky mesh and the baked environment maps (one per light, made on first use and kept for the page). */
export function createCitySky(T: T3, renderer: any): CitySky {
  let SkyC: any = null; let mesh: any = null; const envs = new Map<string, any>(); const hz = new T.Color();
  const ready = import('three/examples/jsm/objects/Sky.js').then(({ Sky }) => { SkyC = Sky; }).catch((e) => { console.warn('Open city: the sky could not load', e); });
  const make = () => { const s = new SkyC(); s.scale.setScalar(2400); s.frustumCulled = false; s.renderOrder = -11; s.userData.noCast = true; s.material.depthWrite = false;
    s.material.uniforms.uSkyGain = { value: 0.5 }; s.material.uniforms.uHorizon = { value: new T.Color() }; s.material.uniforms.uHorizonMix = { value: 0.5 }; s.material.uniforms.uTop = { value: new T.Color() }; s.material.uniforms.uTopMix = { value: 0.3 };
    s.material.fragmentShader = s.material.fragmentShader.replace('uniform float time;', 'uniform float time; uniform float uSkyGain; uniform vec3 uHorizon; uniform float uHorizonMix; uniform vec3 uTop; uniform float uTopMix;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'texColor *= uSkyGain; texColor = mix( texColor, uTop * ( 0.6 + 0.4 * max( direction.y, 0.0 ) ), uTopMix ); float cqHz = 1.0 - smoothstep( 0.0, 0.2, max( direction.y, 0.0 ) ); texColor = mix( texColor, uHorizon, cqHz * uHorizonMix ); gl_FragColor = vec4( texColor, 1.0 );');
    s.material.needsUpdate = true; return s; };
  const aim = (s: any, light: SkyLight, look: SkyLook) => { const a = AIR[light]; const u = s.material.uniforms; u.turbidity.value = a.turbidity; u.rayleigh.value = a.rayleigh; u.mieCoefficient.value = a.mie; u.mieDirectionalG.value = a.g;
    u.sunPosition.value.set(...look.sun).normalize(); u.uSkyGain.value = a.gain; u.uHorizon.value.copy(hz.set(look.horizon)); u.uHorizonMix.value = a.horizon; u.uTop.value.set(look.skyTop); u.uTopMix.value = a.top; u.cloudCoverage.value = a.cloud; u.cloudDensity.value = 0.35; u.time.value = 0; };
  return {
    get mesh() { if (!mesh && SkyC) mesh = make(); return mesh; }, ready,
    set(light, look) { if (!SkyC || light === 'night') return; if (!mesh) mesh = make(); aim(mesh, light, look); },
    envIntensity: (light) => AIR[light].env,
    env(light, look) { const k = light; let e = envs.get(k); if (e) return e;
      /* the environment is the theme's own sky (top → horizon → a warm ground) with a soft sun, not the Sky shader: its raw radiance is far
         brighter and bluer than the brand palette, and reflections should stay warm and calm */
      const sc = new T.Scene(); const g = new T.SphereGeometry(50, 48, 24); const p = g.attributes.position; const col = new Float32Array(p.count * 3); const c = new T.Color();
      const top = new T.Color(look.skyTop), hor = new T.Color(look.horizon), gnd = new T.Color(look.ground);
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 50; if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.6)); else c.copy(hor).lerp(gnd, Math.min(1, -y * 5)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new T.BufferAttribute(col, 3)); const dome = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })); sc.add(dome);
      const sun = new T.Mesh(new T.SphereGeometry(look.night ? 2 : 5, 16, 8), new T.MeshBasicMaterial({ color: new T.Color(look.sunColor).multiplyScalar(look.night ? 1.5 : 6) })); sun.position.set(...look.sun).normalize().multiplyScalar(40); sc.add(sun);
      const pm = new T.PMREMGenerator(renderer); e = pm.fromScene(sc, 0.02, 0.1, 200).texture; pm.dispose(); g.dispose(); dome.material.dispose(); sun.geometry.dispose(); sun.material.dispose();
      envs.set(k, e); return e; },
    dispose() { for (const e of envs.values()) e.dispose(); envs.clear(); mesh?.geometry.dispose(); mesh?.material.dispose(); mesh = null; },
  };
}
