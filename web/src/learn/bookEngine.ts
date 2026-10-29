/**
 * The pop-up book's 3D view (2026-10-24): one WebGL renderer for the whole book (the app's one-live-viewer rule; EcomBook claims the slot).
 * Our own three.js code, loaded on first use (three is its own chunk).
 *  - An open book on a soft desk: cover boards, page stacks, two printed pages (canvas textures from pageArt.ts) with a gentle curl at the spine.
 *  - The cover opens on a hinge at the spine; pages turn as a bending sheet (a closed-form curl, front and back printed).
 *  - Each right page carries a pop-up figure (diagrams.ts) whose pieces hinge up from their printed footprints when the page opens.
 *  - Hotspot buttons are HTML (EcomBook); the engine moves them to their anchors every frame and hides them while a page turns.
 *  - Guided tour: per-shot camera poses around the figure with eased moves and a slow drift; reduced motion cuts instead.
 * dispose() frees every geometry, material and texture and releases the WebGL context.
 */
import type { Chapter, ShotView, TourShot } from './ecomChapters';
import type { ArtSlot } from './ecomArt';
import { makeKit } from './inkKit';
import { buildDiagram, PAGE_D, PAGE_W, type Built } from './diagrams';
import { artImage, drawCover, drawFigure, drawLesson, loadBookFonts } from './pageArt';

export interface BookEngine {
  /** -1 = closed. Turns (or opens) to spread i; resolves when the pop-up has risen. */
  go(i: number): Promise<void>;
  readonly spread: number; readonly busy: boolean;
  setHotspotEls(els: Map<string, HTMLElement>): void;
  /** ease the camera to a hotspot (null = back to the page) */ focus(id: string | null): void;
  tour(shots: TourShot[], onShot: (i: number, shot: TourShot) => void, onEnd: () => void): void;
  stopTour(): void;
  dispose(): void;
}
export interface EngineOpts { chapters: Chapter[]; reduced: boolean; /** 1 = normal; >1 slows every animation (?motion=slow, for screen recordings) */ slow?: number; onSwipe?: (dir: 1 | -1) => void; onLost?: (lost: boolean) => void; onFrame?: () => void }

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const back = (t: number) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const PAGE_Y = 0.062; const SPINE_Y = 0.06;

export async function createBookEngine(canvas: HTMLCanvasElement, o: EngineOpts): Promise<BookEngine> {
  const T: any = await import('three');
  await loadBookFonts();
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const maxAniso = renderer.capabilities.getMaxAnisotropy?.() ?? 4;
  const scene = new T.Scene(); scene.background = new T.Color('#141210');
  const camera = new T.PerspectiveCamera(30, 1, 0.02, 50);
  const kit = makeKit(T, { reduced: o.reduced });
  const owned: any[] = []; // extra materials / textures made here

  // ---------- desk ----------
  const deskMat = new T.ShaderMaterial({ uniforms: {}, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){ vec2 p = vUv - 0.5; float r = length(p * vec2(1.0, 1.25)); vec3 c = mix(vec3(0.20, 0.165, 0.13), vec3(0.06, 0.05, 0.045), smoothstep(0.02, 0.42, r));
        float grain = sin(vUv.y * 900.0 + sin(vUv.x * 18.0) * 6.0 + sin(vUv.x * 61.0) * 1.5) * 0.5 + 0.5; c *= 0.94 + grain * 0.06; c += (h(floor(vUv * 1400.0)) - 0.5) * 0.012;
        gl_FragColor = vec4(pow(max(c, vec3(0.0)), vec3(2.2)), 1.0); /* drawn in sRGB terms; the output pass converts linear to sRGB */
        #include <colorspace_fragment>
      }` }); owned.push(deskMat);
  const desk = new T.Mesh(new T.PlaneGeometry(14, 14), deskMat); desk.rotation.x = -Math.PI / 2; desk.position.y = -0.001; scene.add(desk);
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!; const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(0.6, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new T.CanvasTexture(c); owned.push(t); return t; })();
  const shadowMat = new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }); owned.push(shadowMat);
  const shadow = new T.Mesh(new T.PlaneGeometry(1, 1), shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.0005; scene.add(shadow);

  // ---------- the book ----------
  const book = new T.Group(); scene.add(book);
  const W = PAGE_W, D = PAGE_D;
  const rightBase = kit.box(W + 0.07, 0.03, D + 0.1, 'cover'); rightBase.position.x = (W + 0.07) / 2; book.add(rightBase);
  const rightStack = kit.box(W - 0.03, 0.024, D, 'edge'); rightStack.position.set(0.03 + (W - 0.03) / 2, 0.03, 0); book.add(rightStack);
  /** a page plane, open-state world coordinates, x from the spine (0) outwards by `sign`; dips a little at the spine */
  const pageGeo = (sign: 1 | -1) => { const g = new T.PlaneGeometry(W, D, 48, 1); g.rotateX(-Math.PI / 2); g.translate(sign * W / 2, 0, 0); const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const x = Math.abs(p.getX(i)); p.setY(i, -0.014 * Math.exp(-x / 0.03) + 0.004 * Math.sin(Math.min(1, x) * Math.PI) ); } p.needsUpdate = true; return g; };
  const pageMat = () => { const m = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); owned.push(m); return m; };
  const rightPage = new T.Mesh(pageGeo(1), pageMat()); rightPage.position.y = PAGE_Y; book.add(rightPage);
  // the front cover side (cover board + left stack + left page) on a hinge at the spine: closed = folded over the right side
  const hinge = new T.Group(); hinge.position.set(0, SPINE_Y, 0); book.add(hinge); const inner = new T.Group(); inner.rotation.z = Math.PI; hinge.add(inner);
  const leftBase = kit.box(W + 0.07, 0.03, D + 0.1, 'cover'); leftBase.position.set(-(W + 0.07) / 2, -SPINE_Y, 0); inner.add(leftBase);
  const leftStack = kit.box(W - 0.03, 0.024, D, 'edge'); leftStack.position.set(-(0.03 + (W - 0.03) / 2), 0.03 - SPINE_Y, 0); inner.add(leftStack);
  const leftPage = new T.Mesh(pageGeo(-1), pageMat()); leftPage.position.y = PAGE_Y - SPINE_Y; inner.add(leftPage);
  const coverTex = (() => { const c = document.createElement('canvas'); drawCover(c, o.chapters.length ? 'AI for e-commerce' : '', 'From one product photo to a full launch'); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = maxAniso; owned.push(t); return t; })();
  const coverMat = new T.MeshBasicMaterial({ map: coverTex, toneMapped: false }); owned.push(coverMat);
  /* the cover is the open-state underside of the left board: facing down, turned so it reads upright once the hinge folds it over (closed) */
  const coverFace = new T.Mesh(new T.PlaneGeometry(W + 0.07, D + 0.1), coverMat); coverFace.rotation.set(-Math.PI / 2, Math.PI, 0); coverFace.position.set(-(W + 0.07) / 2, -SPINE_Y - 0.0015, 0); inner.add(coverFace);
  // the turning sheet: front (right page being turned) and back (the next left page) share one position buffer
  const NX = 36; const sheetBase = new T.PlaneGeometry(W, D, NX, 1); sheetBase.rotateX(-Math.PI / 2); sheetBase.translate(W / 2, 0, 0);
  const pos0 = Float32Array.from(sheetBase.getAttribute('position').array); const sheetPos = new T.BufferAttribute(new Float32Array(pos0), 3);
  const cols = new T.BufferAttribute(new Float32Array(sheetPos.count * 3).fill(1), 3);
  const frontGeo = new T.BufferGeometry(); frontGeo.setAttribute('position', sheetPos); frontGeo.setAttribute('uv', sheetBase.getAttribute('uv')); frontGeo.setAttribute('color', cols); frontGeo.setIndex(sheetBase.getIndex());
  const backUv = sheetBase.getAttribute('uv').clone(); for (let i = 0; i < backUv.count; i++) backUv.setX(i, 1 - backUv.getX(i));
  const backGeo = new T.BufferGeometry(); backGeo.setAttribute('position', sheetPos); backGeo.setAttribute('uv', backUv); backGeo.setAttribute('color', cols); backGeo.setIndex(sheetBase.getIndex());
  const frontMat = new T.MeshBasicMaterial({ side: T.FrontSide, vertexColors: true, toneMapped: false }); const backMat = new T.MeshBasicMaterial({ side: T.BackSide, vertexColors: true, toneMapped: false }); owned.push(frontMat, backMat);
  const sheet = new T.Group(); sheet.add(new T.Mesh(frontGeo, frontMat), new T.Mesh(backGeo, backMat)); sheet.position.y = PAGE_Y + 0.002; sheet.visible = false; book.add(sheet); sheetBase.dispose();
  const bendSheet = (th: number) => { const k = 1.15 * Math.sin(th); const a = sheetPos.array as Float32Array; const c = cols.array as Float32Array;
    for (let i = 0; i < sheetPos.count; i++) { const u = pos0[i * 3]; let x: number, y: number; if (Math.abs(k) < 1e-4) { x = u * Math.cos(th); y = u * Math.sin(th); } else { x = (Math.sin(th) - Math.sin(th - k * u)) / k; y = (Math.cos(th - k * u) - Math.cos(th)) / k; }
      a[i * 3] = x; a[i * 3 + 1] = y; const slope = th - k * u; const shade = 1 - 0.22 * Math.abs(Math.sin(slope)) * (Math.cos(slope) > 0 ? 1 : 0.7); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = shade; }
    sheetPos.needsUpdate = true; cols.needsUpdate = true; frontGeo.computeBoundingSphere(); };

  // ---------- spreads: page textures + pop-up ----------
  type Spread = { left: any; right: any; built: Built };
  const spreads = new Map<number, Spread>();
  const tex = (draw: (c: HTMLCanvasElement) => void) => { const c = document.createElement('canvas'); draw(c); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = maxAniso; return t; };
  async function spreadAt(i: number): Promise<Spread> {
    const have = spreads.get(i); if (have) return have; const ch = o.chapters[i];
    const imgs: Partial<Record<ArtSlot, HTMLImageElement | null>> = {}; const slots = Array.from(new Set<ArtSlot>([...ch.art, 'ch1-reference', 'ch5-poster', 'ch7-cover', 'ch8-a', 'ch8-b']));
    await Promise.all(slots.map(async (s) => { imgs[s] = await artImage(s); }));
    const built = buildDiagram(kit, ch, imgs); built.root.position.set(W / 2, PAGE_Y, 0); built.root.visible = false; book.add(built.root); setReveal(built, 0);
    const s: Spread = { left: tex((c) => drawLesson(c, ch, ch.art.map((a) => imgs[a] ?? null), o.chapters.length)), right: tex((c) => drawFigure(c, ch, built.feet)), built };
    spreads.set(i, s); prune(i); return s;
  }
  /** keep page textures only near the current spread (GPU memory); figures stay (they are small) */
  function prune(keep: number) { for (const [k, s] of spreads) if (Math.abs(k - keep) > 1 && k !== cur && s.left) { s.left.dispose(); s.right.dispose(); disposeTree(s.built.root); book.remove(s.built.root); spreads.delete(k); } }
  function setReveal(b: Built, r: number) { for (const p of b.parts) { const q = clamp01((r - p.d) / 0.5); const e = o.reduced ? (q > 0 ? 1 : 0) : q < 1 ? back(q) : 1; p.pivot.rotation.x = -(1 - Math.min(1, e)) * Math.PI / 2; p.pivot.scale.y = Math.max(0.03, Math.min(1.06, 0.03 + 0.97 * e)); }
    for (const s of b.shows) s.value = clamp01((r - 0.6) / 0.4); for (const e of b.ends) e.visible = r > 0.97; (b as any)._r = r; }

  // ---------- camera ----------
  const tgt = new T.Vector3(0.53, 0.05, 0.02); const camPos = new T.Vector3(); const look = new T.Vector3(); let aspect = 1;
  const DIR = new T.Vector3(0, 1, 0.52).normalize();
  const fitDist = (w: number, h: number) => { const v = Math.tan((camera.fov * Math.PI) / 360); return Math.max(h / 2 / v, w / 2 / (v * aspect)) * 1.02; };
  const basePose = (closed: boolean) => { const t = closed ? new T.Vector3(0.53, 0.03, 0.04) : new T.Vector3(0, 0.02, 0.04); const d = closed ? fitDist(1.3, 2.05) : fitDist(2.12, 1.44); return { pos: t.clone().addScaledVector(DIR, d), tgt: t }; };
  let move: { fp: any; ft: any; tp: any; tt: any; t0: number; dur: number } | null = null; let pose = basePose(true); camPos.copy(pose.pos); look.copy(pose.tgt);
  const moveTo = (p: { pos: any; tgt: any }, dur = 1.1) => { pose = p; if (o.reduced || dur <= 0) { camPos.copy(p.pos); look.copy(p.tgt); move = null; return; } move = { fp: camPos.clone(), ft: look.clone(), tp: p.pos.clone(), tt: p.tgt.clone(), t0: now(), dur: dur * (o.slow ?? 1) }; };
  const anchorPos = (id?: string) => { const b = spreads.get(cur)?.built; const a = id ? b?.anchors[id] : null; const v = new T.Vector3(); if (a) a.getWorldPosition(v); else v.set(W / 2, 0.12, -0.02); return v; };
  const shotPose = (view: ShotView | 'focus', at?: string) => { const p = anchorPos(at); const off: Record<ShotView | 'focus', number[]> = { overview: [0, 1.3, 1.25], close: [0.05, 0.55, 0.66], side: [0.66, 0.36, 0.42], low: [-0.16, 0.06, 0.8], top: [0, 1.0, 0.12], focus: [0.06, 1.05, 0.62] };
    const t = view === 'overview' ? new T.Vector3(W / 2, 0.1, -0.02) : view === 'low' ? p.clone().add(new T.Vector3(0, 0.03, 0)) : p; const k = view === 'overview' ? Math.max(1, 1.5 / aspect) : 1; const ov = off[view];
    return { pos: t.clone().add(new T.Vector3(ov[0], ov[1] * k, ov[2] * k)), tgt: t }; };

  // ---------- state ----------
  let cur = -1; let busy = false; let disposed = false; let lost = false; let hsEls = new Map<string, HTMLElement>();
  const anims: { t0: number; dur: number; f: (k: number) => void; done: () => void }[] = [];
  const now = () => performance.now() / 1000;
  const run = (dur: number, f: (k: number) => void) => new Promise<void>((done) => { if (o.reduced || dur <= 0) { f(1); done(); return; } anims.push({ t0: now(), dur: dur * (o.slow ?? 1), f, done }); });
  const showOnly = (i: number) => { for (const [k, s] of spreads) s.built.root.visible = k === i; };
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  let tourState: { shots: TourShot[]; i: number; t0: number; onShot: (i: number, s: TourShot) => void; onEnd: () => void } | null = null;
  let focusId: string | null = null;

  async function go(i: number): Promise<void> {
    if (disposed || busy || i === cur || i < -1 || i >= o.chapters.length) return; busy = true; stopTour(true);
    try {
      if (cur === -1 && i >= 0) { // open the cover
        const s = await spreadAt(i); leftPage.material.map = s.left; rightPage.material.map = s.right; leftPage.material.needsUpdate = rightPage.material.needsUpdate = true; showOnly(i); setReveal(s.built, 0);
        moveTo(basePose(false), 1.5); await run(1.4, (k) => { hinge.rotation.z = ease(k) * Math.PI; }); hinge.rotation.z = Math.PI; cur = i;
        await run(1.3, (k) => setReveal(s.built, k)); setReveal(s.built, 1);
      } else if (i === -1) { // close
        const s = spreads.get(cur); if (s) await run(0.35, (k) => setReveal(s.built, 1 - k));
        moveTo(basePose(true), 1.4); await run(1.3, (k) => { hinge.rotation.z = (1 - ease(k)) * Math.PI; }); hinge.rotation.z = 0; showOnly(-2); cur = -1;
      } else { // turn the page
        const fwd = i > cur; const a = spreads.get(cur)!; const b = await spreadAt(i);
        await run(0.32, (k) => setReveal(a.built, 1 - k)); setReveal(a.built, 0);
        frontMat.map = fwd ? a.right : b.right; backMat.map = fwd ? b.left : a.left; frontMat.needsUpdate = backMat.needsUpdate = true;
        if (fwd) { rightPage.material.map = b.right; showOnly(i); setReveal(b.built, 0); } else { leftPage.material.map = b.left; }
        rightPage.material.needsUpdate = leftPage.material.needsUpdate = true;
        sheet.visible = !o.reduced; bendSheet(fwd ? 0 : Math.PI);
        await run(0.95, (k) => bendSheet(fwd ? ease(k) * Math.PI : (1 - ease(k)) * Math.PI)); sheet.visible = false;
        if (fwd) { leftPage.material.map = b.left; } else { rightPage.material.map = b.right; showOnly(i); setReveal(b.built, 0); }
        leftPage.material.needsUpdate = rightPage.material.needsUpdate = true; cur = i; prune(i);
        await run(1.2, (k) => setReveal(b.built, k)); setReveal(b.built, 1);
      }
    } finally { busy = false; if (focusId) focus(focusId); }
    // warm the next spread so the next turn starts at once
    if (cur >= 0 && cur + 1 < o.chapters.length) setTimeout(() => { if (!disposed && !busy) void spreadAt(cur + 1); }, 400);
  }
  function focus(id: string | null) { focusId = id; if (tourState || busy) return; moveTo(id && cur >= 0 ? shotPose('focus', id) : basePose(cur === -1), 0.9); }
  function tour(shots: TourShot[], onShot: (i: number, s: TourShot) => void, onEnd: () => void) { if (cur < 0 || busy || !shots.length) return; focusId = null; tourState = { shots, i: -1, t0: 0, onShot, onEnd }; nextShot(); }
  function nextShot() { const s = tourState; if (!s) return; s.i++; if (s.i >= s.shots.length) { const end = s.onEnd; tourState = null; moveTo(basePose(false), 1.2); end(); return; }
    const sh = s.shots[s.i]; s.t0 = now(); moveTo(shotPose(sh.view, sh.at), Math.min(1.5, sh.seconds * 0.45)); s.onShot(s.i, sh); }
  function stopTour(silent = false) { const s = tourState; if (!s) return; tourState = null; if (!silent) { moveTo(basePose(cur === -1), 0.9); s.onEnd(); } }

  // ---------- size, input, loop ----------
  const resize = () => { const r = canvas.parentElement!.getBoundingClientRect(); const w = Math.max(1, r.width), h = Math.max(1, r.height); renderer.setSize(w, h, false); aspect = w / h; camera.aspect = aspect; camera.updateProjectionMatrix();
    kit.res.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); kit.px.value = 4.2 * renderer.getPixelRatio(); if (!move && !tourState && !focusId) { const p = basePose(cur === -1); camPos.copy(p.pos); look.copy(p.tgt); pose = p; } };
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement!); resize();
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => { if (!down) return; const dx = e.clientX - down.x; const dy = e.clientY - down.y; down = null; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) o.onSwipe?.(dx < 0 ? 1 : -1); };
  const onMove = (e: PointerEvent) => { if (o.reduced) return; const r = canvas.getBoundingClientRect(); parallax.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; parallax.ty = ((e.clientY - r.top) / r.height - 0.5) * 2; };
  canvas.addEventListener('pointerdown', onDown); addEventListener('pointerup', onUp); canvas.addEventListener('pointermove', onMove);
  const onLost = (e: Event) => { e.preventDefault(); lost = true; o.onLost?.(true); }; const onRestored = () => { lost = false; o.onLost?.(false); };
  canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRestored);

  const v = new T.Vector3(); let raf = 0; const t0 = now();
  const frame = () => {
    raf = requestAnimationFrame(frame); if (lost || disposed) return; const t = now();
    for (let k = anims.length - 1; k >= 0; k--) { const a = anims[k]; const p = clamp01((t - a.t0) / a.dur); a.f(p); if (p >= 1) { anims.splice(k, 1); a.done(); } }
    if (move) { const p = clamp01((t - move.t0) / move.dur); const e = ease(p); camPos.lerpVectors(move.fp, move.tp, e); look.lerpVectors(move.ft, move.tt, e); if (p >= 1) move = null; }
    if (tourState) { const sh = tourState.shots[tourState.i]; if (t - tourState.t0 > sh.seconds) nextShot(); }
    parallax.x += (parallax.tx - parallax.x) * 0.05; parallax.y += (parallax.ty - parallax.y) * 0.05;
    const drift = tourState && !o.reduced ? (t - tourState.t0) * 0.012 : 0;
    camera.position.copy(camPos); camera.position.x += parallax.x * 0.035 + drift; camera.position.y += parallax.y * 0.02; camera.lookAt(look);
    kit.time.value = o.reduced ? 0 : t - t0; const s = spreads.get(cur); s?.built.update?.(t - t0);
    shadow.scale.set(cur === -1 && hinge.rotation.z < 0.01 ? 1.5 : 2.75, 1, 1.85); shadow.position.x = cur === -1 && hinge.rotation.z < 0.01 ? 0.53 : 0;
    // hotspots follow their anchors; hidden while turning or before the figure has risen
    const show = !!s && !busy && cur >= 0 && ((s.built as any)._r ?? 0) > 0.9;
    const cr = canvas.getBoundingClientRect();
    for (const [id, el] of hsEls) { const a = show ? s!.built.anchors[id] : null; if (!a) { if (el.dataset.on !== '0') el.dataset.on = '0'; continue; }
      a.getWorldPosition(v); v.project(camera); const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; const r = cr;
      const sx = ((v.x + 1) / 2) * r.width; el.style.transform = `translate(${sx}px, ${((1 - v.y) / 2) * r.height}px)`; const on = vis ? '1' : '0'; if (el.dataset.on !== on) el.dataset.on = on;
      const side = sx > r.width - 320 ? 'l' : 'r'; if (el.dataset.side !== side) el.dataset.side = side; }
    renderer.render(scene, camera); o.onFrame?.();
  };
  // the book starts closed with chapter 1 under the cover
  const first = await spreadAt(0); rightPage.material.map = first.right; leftPage.material.map = first.left; rightPage.material.needsUpdate = leftPage.material.needsUpdate = true; showOnly(-2);
  raf = requestAnimationFrame(frame);

  function disposeTree(root: any) { root.traverse((n: any) => { n.geometry?.dispose?.(); }); }
  return {
    go, get spread() { return cur; }, get busy() { return busy; },
    setHotspotEls(els) { hsEls = els; }, focus, tour, stopTour: () => stopTour(false),
    dispose() { if (disposed) return; disposed = true; cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener('pointerdown', onDown); removeEventListener('pointerup', onUp); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
      for (const s of spreads.values()) { s.left?.dispose(); s.right?.dispose(); } spreads.clear(); disposeTree(scene); owned.forEach((x) => x.dispose()); kit.dispose(); frontGeo.dispose(); backGeo.dispose();
      renderer.renderLists?.dispose?.(); renderer.dispose(); renderer.forceContextLoss?.(); },
  };
}
