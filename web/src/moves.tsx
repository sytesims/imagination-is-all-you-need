/**
 * Moves (2026-10-26, /moves.html): a preview page for our hand-made parkour clips on the actor's mannequin (shared/previz/parkour.ts).
 * Pick a move (click it or press its key), scrub, slow it down, play it in place or with its root motion, and show a strobe of the whole
 * move. The obstacle each clip was keyed against is drawn too. Dev page like kit.html: not linked from the app.
 * Test hook: window.__moves = { play(id), pause(), seek(seconds), state() }.
 */
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import './tokens.css';
import { PARKOUR_CLIPS, type ParkourClip } from './shared/previz/parkourClips';
import { loadParkour, loadClipFile, createParkourPlayer, type ParkourPlayer, type ParkourSet } from './shared/previz/parkour';
import { MANNEQUIN_URL } from './shared/previz/actor';

type T3 = typeof import('three');
const SPEEDS = [0.25, 0.5, 1] as const;
const keyName = (code: string) => code.replace(/^Digit|^Key/, '');
const needsText = (c: ParkourClip) => {
  const n = c.needs as { obstacle?: string | null; height?: [number, number]; side?: string; clear?: number };
  if (!n.obstacle) return `open ground, ${n.clear ?? 3} m clear`;
  return [n.obstacle, n.side ? `on the ${n.side}` : '', n.height ? `${n.height[0]}–${n.height[1] > 50 ? '∞' : n.height[1]} m` : ''].filter(Boolean).join(' · ');
};

interface Stage { add(s: ParkourSet): void; set(id: string): void; frame(t: number, inPlace: boolean): void; strobe(on: boolean, inPlace: boolean): void; view(v: 'side' | 'behind' | 'front'): void; dispose(): void }

async function makeStage(canvas: HTMLCanvasElement): Promise<Stage | null> {
  const T: T3 = await import('three');
  const [{ GLTFLoader }, { MeshoptDecoder }, { clone }, { OrbitControls }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'), import('three/examples/jsm/utils/SkeletonUtils.js'), import('three/examples/jsm/controls/OrbitControls.js')]);
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const [g, set] = await Promise.all([loader.loadAsync(MANNEQUIN_URL), loadParkour()]);
  if (!set) return null;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene(); scene.background = new T.Color(0x16171a); scene.fog = new T.Fog(0x16171a, 18, 45);
  scene.add(new T.HemisphereLight(0xf4f1ea, 0x3a3833, 1.1));
  const sun = new T.DirectionalLight(0xfff4e6, 2.2); sun.position.set(-5, 9, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 }); scene.add(sun); scene.add(sun.target);
  const ground = new T.Mesh(new T.PlaneGeometry(80, 80), new T.MeshLambertMaterial({ color: 0x2a2c31 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grid = new T.GridHelper(80, 80, 0x4a4d55, 0x34363c); grid.position.y = 0.002; scene.add(grid);
  const body = new T.MeshLambertMaterial({ color: 0xff7a1a }); const joints = new T.MeshLambertMaterial({ color: 0x3a3d46 });
  const ghostMat = new T.MeshLambertMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.22, depthWrite: false });
  const dress = (m: any, ghost = false) => m.traverse((o: any) => { if (!o.isMesh) return; o.castShadow = !ghost; o.receiveShadow = !ghost; o.frustumCulled = false;
    o.material = ghost ? ghostMat : /joint/i.test(o.material?.name ?? '') ? joints : body; });
  const model = clone(g.scene); dress(model); scene.add(model);
  const ghostModels = Array.from({ length: 9 }, () => { const m = clone(g.scene); dress(m, true); m.visible = false; scene.add(m); return m; });
  /* one bundle of players per clip file (ours, plus any file loaded on the page) */
  const packs: { set: ParkourSet; play: ParkourPlayer; playIn: ParkourPlayer; ghosts: { keep: ParkourPlayer; inPlace: ParkourPlayer }[] }[] = [];
  const add = (s: ParkourSet) => packs.push({ set: s, play: createParkourPlayer(T, model, s), playIn: createParkourPlayer(T, model, s, { rootMotion: 'extract' }),
    ghosts: ghostModels.map((m) => ({ keep: createParkourPlayer(T, m, s), inPlace: createParkourPlayer(T, m, s, { rootMotion: 'extract' }) })) });
  add(set);
  const packOf = (x: string) => packs.find((p) => p.set.info[x]) ?? packs[0];
  const stopAll = () => { for (const p of packs) { p.play.stop(); p.playIn.stop(); } };
  const props = new T.Group(); scene.add(props); const stone = new T.MeshLambertMaterial({ color: 0x8b8f96 });
  const camera = new T.PerspectiveCamera(40, 1, 0.05, 200);
  const orbit = new OrbitControls(camera, canvas); orbit.enableDamping = true; orbit.dampingFactor = 0.12; orbit.maxPolarAngle = Math.PI * 0.49; orbit.minDistance = 1.5; orbit.maxDistance = 25;
  let id = PARKOUR_CLIPS[0].id; let mid = { f: 1.5, u: 1 };
  const view = (v: 'side' | 'behind' | 'front') => { const c = packOf(id).set.info[id]; const span = Math.max(4, c.move[0] + 1.5);
    const d = span * 1.35 + 2; orbit.target.set(c.move[2] / 2, mid.u, mid.f);
    if (v === 'side') camera.position.set(-d, 1.6 + c.move[1] / 2, mid.f - d * 0.12);
    else if (v === 'behind') camera.position.set(-d * 0.35, 2.4 + c.move[1] / 2, mid.f - d);
    else camera.position.set(-d * 0.45, 1.8 + c.move[1] / 2, mid.f + d); orbit.update(); };
  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  let raf = 0; const loop = () => { orbit.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); }; loop();
  let strobeOn = false;
  const stage: Stage = {
    add,
    set(next) { id = next; const c = packOf(id).set.info[id]; if (!c) return;
      for (const o of [...props.children]) { props.remove(o); o.geometry.dispose(); }
      for (const b of c.props) { const m = new T.Mesh(new T.BoxGeometry(b.l[1] - b.l[0], b.u[1] - b.u[0], b.f[1] - b.f[0]), stone);
        m.position.set((b.l[0] + b.l[1]) / 2, (b.u[0] + b.u[1]) / 2, (b.f[0] + b.f[1]) / 2); m.castShadow = true; m.receiveShadow = true; props.add(m); }
      mid = { f: c.move[0] / 2, u: 0.9 + c.move[1] / 2 }; sun.target.position.set(0, 0, mid.f); sun.position.set(-5, 9, mid.f + 4);
      view('side'); if (strobeOn) stage.strobe(true, false); },
    frame(t, inPlace) { stopAll(); const p = packOf(id); (inPlace ? p.playIn : p.play).pose(id, t); },
    strobe(on, inPlace) { strobeOn = on; const p = packOf(id); const c = p.set.info[id];
      ghostModels.forEach((m, i) => { m.visible = on && !!c; if (!on || !c) return; const t = (c.seconds * (i + 0.5)) / ghostModels.length;
        for (const q of packs) { q.ghosts[i].keep.stop(); q.ghosts[i].inPlace.stop(); } (inPlace ? p.ghosts[i].inPlace : p.ghosts[i].keep).pose(id, t); }); },
    view,
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); orbit.dispose(); for (const p of packs) { p.play.dispose(); p.playIn.dispose(); } renderer.dispose(); },
  };
  return stage;
}

function Moves() {
  const canvas = useRef<HTMLCanvasElement>(null); const stage = useRef<Stage | null>(null);
  const [ready, setReady] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [id, setId] = useState(PARKOUR_CLIPS[0].id); const [t, setT] = useState(0); const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(1); const [loop, setLoop] = useState(true); const [inPlace, setInPlace] = useState(false); const [strobe, setStrobe] = useState(false);
  const [extra, setExtra] = useState<ParkourClip[]>([]); const [fileNote, setFileNote] = useState('');
  const all = [...PARKOUR_CLIPS, ...extra]; const clip = all.find((c) => c.id === id) ?? PARKOUR_CLIPS[0];
  const allRef = useRef(all); allRef.current = all;
  const openFile = async (f: File | undefined) => { if (!f || !stage.current) return; const url = URL.createObjectURL(f);
    const s = await loadClipFile(url); URL.revokeObjectURL(url);
    if (!s) { setFileNote(`No clips found in ${f.name}.`); return; }
    const seen = new Map<string, number>(allRef.current.map((x) => [x.label, 1]));
    const fresh = Object.values(s.info).filter((c) => !allRef.current.some((x) => x.id === c.id)).map((c) => { const n = (seen.get(c.label) ?? 0) + 1; seen.set(c.label, n); return n > 1 ? { ...c, label: `${c.label} (${n})` } : c; });
    stage.current.add(s); setExtra((x) => [...x, ...fresh]); setFileNote(`${fresh.length} clip${fresh.length === 1 ? '' : 's'} from ${f.name}`);
    if (fresh[0]) { setId(fresh[0].id); setT(0); setPlaying(true); } };
  const st = useRef({ t, playing, speed, loop, id }); st.current = { t, playing, speed, loop, id };
  useEffect(() => { let alive = true; makeStage(canvas.current!).then((s) => { if (!alive) { s?.dispose(); return; } stage.current = s; setReady(s ? 'ok' : 'failed'); s?.set(PARKOUR_CLIPS[0].id); }).catch(() => setReady('failed'));
    return () => { alive = false; stage.current?.dispose(); }; }, []);
  useEffect(() => { stage.current?.set(id); setT(0); }, [id, ready]);
  useEffect(() => { stage.current?.frame(t, inPlace); }, [t, inPlace, id, ready]);
  useEffect(() => { stage.current?.strobe(strobe, inPlace); }, [strobe, inPlace, id, ready]);
  useEffect(() => { let raf = 0; let last = performance.now();
    const tick = (now: number) => { const dt = (now - last) / 1000; last = now; const s = st.current; const c = allRef.current.find((x) => x.id === s.id) ?? PARKOUR_CLIPS[0];
      if (s.playing) { let nt = s.t + dt * s.speed; const hold = 0.5; /* a short rest at the end before looping */
        if (nt > c.seconds + hold) { if (s.loop) nt = 0; else { nt = c.seconds; setPlaying(false); } } setT(nt); }
      raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, []);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.metaKey || e.ctrlKey || e.altKey) return;
      const c = PARKOUR_CLIPS.find((x) => x.key === e.code); if (c) { e.preventDefault(); setId(c.id); setT(0); setPlaying(true); return; }
      if (e.code === 'Space') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.code === 'ArrowRight') { e.preventDefault(); setPlaying(false); setT((x) => Math.min(clip.seconds, x + 1 / clip.fps)); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); setPlaying(false); setT((x) => Math.max(0, x - 1 / clip.fps)); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [clip]);
  useEffect(() => { (window as any).__moves = { play: (x: string) => { setId(x); setT(0); setPlaying(true); }, pause: () => setPlaying(false), seek: (s: number) => { setPlaying(false); setT(s); },
    state: () => ({ ...st.current, ready }) }; }, [ready]);
  const frame = Math.min(clip.frames, Math.round(Math.min(t, clip.seconds) * clip.fps));
  const marks = Object.entries(clip.contacts).flatMap(([k, v]) => (Array.isArray(v) ? v.map((f, i) => [`${k} ${i + 1}`, f] as const) : [[k, v] as const]));
  return <div className="mv">
    <style>{CSS}</style>
    <aside className="mv-side">
      <h1>Moves</h1>
      <p className="mv-sub">Hand-made parkour on the actor. Press a move's key or click it.</p>
      <ul className="mv-list">{all.map((c) => <li key={c.id}>
        <button className={'mv-item' + (c.id === id ? ' on' : '')} onClick={() => { setId(c.id); setT(0); setPlaying(true); }} aria-pressed={c.id === id}>
          <kbd>{c.key ? keyName(c.key) : '·'}</kbd><span className="mv-name">{c.label}</span><span className="mv-dur">{c.seconds.toFixed(1)} s</span>
          <span className="mv-needs">{c.key ? needsText(c) : 'loaded file · no obstacle'}</span>
        </button></li>)}</ul>
      <label className="mv-file">Load a clip file (.glb)…<input type="file" accept=".glb,model/gltf-binary" onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {fileNote && <p className="mv-note" role="status">{fileNote}</p>}
      <p className="mv-note">Any clip on the mannequin's skeleton works, e.g. a text-to-motion clip retargeted with the research script.</p>
    </aside>
    <main className="mv-main">
      <canvas ref={canvas} className="mv-canvas" />
      {ready !== 'ok' && <div className="mv-state">{ready === 'loading' ? 'Loading the mannequin…' : 'Could not load the moves (web/public/models/mannequin/parkour.glb).'}</div>}
      <div className="mv-hud"><b>{clip.label}</b><span>moves {clip.move[0].toFixed(1)} m forward{clip.move[1] ? `, ${clip.move[1].toFixed(1)} m up` : ''}{clip.move[2] ? `, ${Math.abs(clip.move[2]).toFixed(1)} m ${clip.move[2] > 0 ? 'left' : 'right'}` : ''}</span></div>
      <div className="mv-bar">
        <button className="mv-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</button>
        <div className="mv-scrub">
          <input type="range" min={0} max={clip.frames} step={1} value={frame} aria-label="Frame" onChange={(e) => { setPlaying(false); setT(Number(e.target.value) / clip.fps); }} />
          <div className="mv-marks">{marks.map(([k, f]) => <span key={k} style={{ left: `${(f / clip.frames) * 100}%` }} title={`${k}: frame ${f}`} />)}</div>
        </div>
        <span className="mv-frame">{String(frame).padStart(2, '0')} / {clip.frames}</span>
        <div className="mv-seg" role="group" aria-label="Speed">{SPEEDS.map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s === 1 ? '1×' : `${s}×`}</button>)}</div>
        <div className="mv-seg" role="group" aria-label="Options">
          <button className={loop ? 'on' : ''} onClick={() => setLoop((x) => !x)}>Loop</button>
          <button className={inPlace ? 'on' : ''} onClick={() => setInPlace((x) => !x)} title="Play without the root motion">In place</button>
          <button className={strobe ? 'on' : ''} onClick={() => setStrobe((x) => !x)} title="Show the whole move at once">Strobe</button>
        </div>
        <div className="mv-seg" role="group" aria-label="Camera">{(['side', 'behind', 'front'] as const).map((v) => <button key={v} onClick={() => stage.current?.view(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>
      </div>
    </main>
  </div>;
}

const CSS = `
html,body,#root{height:100%;margin:0;background:var(--bg);color:var(--text);font-family:var(--font-ui);font-size:var(--fs-sm)}
.mv{display:grid;grid-template-columns:280px 1fr;height:100%}
.mv-side{border-right:1px solid var(--hairline);padding:18px 14px;overflow:auto;background:var(--surface)}
.mv-side h1{font-family:var(--font-display);font-size:var(--fs-xl);margin:0 0 4px;letter-spacing:var(--tracking-display)}
.mv-sub{color:var(--text-2);margin:0 0 14px;line-height:1.4}
.mv-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.mv-item{all:unset;box-sizing:border-box;width:100%;display:grid;grid-template-columns:auto 1fr auto;gap:2px 10px;align-items:center;padding:9px 10px;border-radius:var(--r-md);cursor:pointer;border:1px solid transparent}
.mv-item:hover{background:var(--surface-hover)}
.mv-item.on{background:var(--surface-3);border-color:var(--hairline-strong)}
.mv-item:focus-visible{box-shadow:var(--focus)}
.mv-item kbd{grid-row:span 2;font-family:var(--font-mono);font-size:var(--fs-xs);min-width:22px;height:22px;display:grid;place-items:center;border-radius:var(--r-xs);border:1px solid var(--hairline-strong);color:var(--text-2)}
.mv-item.on kbd{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.mv-name{font-weight:var(--fw-strong)}
.mv-dur{color:var(--text-3);font-variant-numeric:tabular-nums}
.mv-needs{grid-column:2 / span 2;color:var(--text-2);font-size:var(--fs-xs)}
.mv-file{position:relative;display:block;margin-top:14px;padding:9px 10px;border-radius:var(--r-md);border:1px dashed var(--hairline-strong);color:var(--text-2);cursor:pointer;text-align:center}
.mv-file:hover{color:var(--text);border-color:var(--text-3)}
.mv-file:focus-within{box-shadow:var(--focus)}
.mv-file input{position:absolute;opacity:0;width:1px;height:1px}
.mv-note{color:var(--text-3);font-size:var(--fs-xs);margin:8px 2px 0;line-height:1.4}
.mv-main{position:relative;min-width:0;min-height:0}
.mv-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.mv-state{position:absolute;inset:0;display:grid;place-items:center;color:var(--text-2)}
.mv-hud{position:absolute;left:16px;top:14px;display:flex;flex-direction:column;gap:2px;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.mv-hud b{font-family:var(--font-display);font-size:var(--fs-lg)}
.mv-hud span{color:var(--text-2)}
.mv-bar{position:absolute;left:12px;right:12px;bottom:12px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r-lg);background:rgba(17,17,17,.88);border:1px solid var(--hairline);backdrop-filter:blur(8px)}
.mv-btn,.mv-seg button{all:unset;cursor:pointer;padding:6px 10px;border-radius:var(--r-sm);color:var(--text);font-weight:var(--fw-ui)}
.mv-btn{background:var(--accent);color:var(--on-accent);font-weight:var(--fw-strong);min-width:48px;text-align:center}
.mv-btn:focus-visible,.mv-seg button:focus-visible{box-shadow:var(--focus)}
.mv-seg{display:flex;gap:2px;padding:2px;border-radius:var(--r-md);background:var(--surface-2);border:1px solid var(--hairline)}
.mv-seg button{padding:5px 9px;color:var(--text-2)}
.mv-seg button:hover{color:var(--text)}
.mv-seg button.on{background:var(--surface-hover);color:var(--text)}
.mv-scrub{position:relative;flex:1 1 200px;min-width:160px}
.mv-scrub input{width:100%;accent-color:var(--accent)}
.mv-marks{position:absolute;left:8px;right:8px;top:-4px;height:4px;pointer-events:none}
.mv-marks span{position:absolute;width:2px;height:6px;background:var(--text-2);transform:translateX(-1px);border-radius:1px}
.mv-frame{font-family:var(--font-mono);font-size:var(--fs-xs);color:var(--text-2);font-variant-numeric:tabular-nums;min-width:58px}
@media (max-width:760px){.mv{grid-template-columns:1fr;grid-template-rows:auto 1fr}.mv-side{border-right:0;border-bottom:1px solid var(--hairline);max-height:38vh}.mv-main{min-height:60vh}}
`;

createRoot(document.getElementById('root')!).render(<Moves />);
