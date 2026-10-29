/**
 * Direct a Shot's post for High and Ultra quality (previz/quality.ts, 2026-10-27): the scene drawn once into an HDR buffer (half float, MSAA,
 * with a depth texture), then ambient occlusion (three's GTAOPass, normals rebuilt from that depth so the scene is never drawn twice), bloom
 * on what is brighter than the look's threshold (lamps, signals, lit windows; UnrealBloomPass) and the tone map + sRGB (OutputPass) to the
 * canvas. Every step is a pure function of the frame (GTAO's noise is a fixed magic square, no temporal accumulation), so a recording that
 * seeks t gets the same pixels every time. The three.js addons load on first use (ready() waits for them).
 */
type T3 = typeof import('three');
export interface PostLook { /** linear HDR luminance above which things glow */ threshold: number; strength: number; radius: number; /** how dark the AO gets (0–1) */ ao: number }
export interface Post { readonly ready: Promise<void>; readonly loaded: boolean; setSize(w: number, h: number): void;
  /** draw scene → AO → bloom → canvas; false when the addons are not loaded yet (the caller draws directly) */ render(scene: any, camera: any, o: { ao: number; bloom: boolean; msaa: number; look: PostLook }): boolean; dispose(): void }

export function createPost(T: T3, renderer: any): Post {
  let mods: { GTAOPass: any; UnrealBloomPass: any; OutputPass: any } | null = null; let gone = false;
  const ready = Promise.all([import('three/examples/jsm/postprocessing/GTAOPass.js'), import('three/examples/jsm/postprocessing/UnrealBloomPass.js'), import('three/examples/jsm/postprocessing/OutputPass.js')])
    .then(([a, b, c]) => { if (!gone) mods = { GTAOPass: a.GTAOPass, UnrealBloomPass: b.UnrealBloomPass, OutputPass: c.OutputPass }; }).catch((e) => { console.warn('Direct a Shot: the High quality effects could not load', e); });
  let w = 2, h = 2; let rt: any = null, rtB: any = null, gtao: any = null, gtaoScale = 0, bloom: any = null, out: any = null; let samples = -1;
  const target = (ms: number) => { const depthTexture = new T.DepthTexture(w, h); depthTexture.type = T.UnsignedIntType;
    return new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, samples: ms, depthTexture, depthBuffer: true }); };
  const ensure = (o: { ao: number; msaa: number }, scene: any, camera: any) => { const M = mods!;
    if (!rt || samples !== o.msaa) { rt?.dispose(); rt = target(o.msaa); samples = o.msaa; gtao?.setGBuffer(rt.depthTexture, undefined); }
    if (!rtB) rtB = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType });
    if (o.ao > 0 && !gtao) { gtao = new M.GTAOPass(scene, camera, w, h); gtao.setGBuffer(rt.depthTexture, undefined); /* normals from depth: no second scene draw */
      gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 0.8, scale: 1.2, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 }); gtaoScale = 0;
      /* AO fades out with distance (70–180 m): far away its few samples only make a dotted pattern on hills and trees */
      gtao.gtaoMaterial.fragmentShader = gtao.gtaoMaterial.fragmentShader.replace('gl_FragColor = FRAGMENT_OUTPUT;', 'ao = mix( ao, 1.0, smoothstep( 70.0, 180.0, -viewPos.z ) ); gl_FragColor = FRAGMENT_OUTPUT;'); gtao.gtaoMaterial.needsUpdate = true; }
    if (gtao && gtaoScale !== o.ao) { gtaoScale = o.ao; gtao.setSize(Math.max(2, Math.round(w * o.ao)), Math.max(2, Math.round(h * o.ao))); }
    if (!bloom) { bloom = new M.UnrealBloomPass(new T.Vector2(w, h), 0.4, 0.5, 2); }
    if (!out) { out = new M.OutputPass(); out.renderToScreen = true; } };
  return {
    ready, get loaded() { return !!mods; },
    setSize(nw, nh) { w = Math.max(2, Math.round(nw)); h = Math.max(2, Math.round(nh)); rt?.setSize(w, h); rtB?.setSize(w, h); bloom?.setSize(w, h); if (gtao) { gtaoScale = 0; } },
    render(scene, camera, o) {
      if (!mods || gone) return false; ensure(o, scene, camera);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera); /* HDR, linear: three tone-maps only on the way to the canvas */
      let src = rt;
      if (o.ao > 0) { gtao.scene = scene; gtao.camera = camera; gtao.blendIntensity = o.look.ao; gtao.render(renderer, rtB, rt); src = rtB; }
      if (o.bloom) { bloom.threshold = o.look.threshold; bloom.strength = o.look.strength; bloom.radius = o.look.radius; bloom.render(renderer, null, src, 0, false); }
      out.render(renderer, null, src); renderer.setRenderTarget(null); return true; },
    dispose() { gone = true; rt?.dispose(); rtB?.dispose(); gtao?.dispose?.(); bloom?.dispose?.(); out?.dispose?.(); },
  };
}
