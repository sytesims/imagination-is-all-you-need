// Three is already a runtime dependency; this experiment adds no packages.
import * as THREE from 'three';
// The app's deliberately minimal Three declarations omit VideoTexture.
const { VideoTexture } = THREE as typeof THREE & { VideoTexture: new (video: HTMLVideoElement) => any };

export interface AvatarScene { setVisible(value: boolean): void; gesture(): void; dispose(): void }

/** Silent analyser of the supplied voice, clocked against the ONE existing native video.
 * Never wrap that video in MediaElementSource: disconnecting one would silence the fallback.
 * A zero-gain destination makes this buffer inaudible, regardless of the shared mute choice.
 */
export function createAvatarScene(host: HTMLElement, portrait: string, speech: string, fail: () => void, ready: () => void): AvatarScene {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement as HTMLCanvasElement;
  canvas.className = 'aas-canvas'; canvas.setAttribute('aria-hidden', 'true'); host.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 30); camera.position.z = 5.15;
  const card = new THREE.Group(); scene.add(card);
  const rounded = (size: number, radius: number) => {
    const edge: number[][] = [];
    for (let corner = 0; corner < 4; corner++) {
      const x = (corner === 0 || corner === 3 ? 1 : -1) * (size / 2 - radius);
      const y = (corner < 2 ? 1 : -1) * (size / 2 - radius);
      for (let step = 0; step <= 10; step++) {
        const angle = (corner * 90 + step * 9) * Math.PI / 180;
        edge.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
      }
    }
    const geometry = new THREE.BufferGeometry(), vertices = [0, 0, 0], uv = [.5, .5], indices: number[] = [];
    edge.forEach(([x, y], i) => { vertices.push(x, y, 0); uv.push(x / size + .5, y / size + .5); indices.push(0, i + 1, (i + 1) % edge.length + 1); });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
    return { geometry, edge };
  };
  const { geometry } = rounded(2.85, .14);
  const { geometry: rimGeometry, edge } = rounded(2.868, .149);
  const rimMaterial = new THREE.MeshBasicMaterial({ color: 0x303237, side: THREE.DoubleSide });
  const rim = new THREE.Mesh(rimGeometry, rimMaterial); card.add(rim);
  const sideGeometry = new THREE.BufferGeometry(), sideVertices: number[] = [], sideIndices: number[] = [];
  edge.forEach(([x, y], i) => {
    sideVertices.push(x, y, .014, x, y, -.014);
    const a = i * 2, b = ((i + 1) % edge.length) * 2; sideIndices.push(a, b, a + 1, a + 1, b, b + 1);
  });
  sideGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sideVertices, 3)); sideGeometry.setIndex(sideIndices);
  const side = new THREE.Mesh(sideGeometry, rimMaterial); card.add(side);
  const frontMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide });
  const front = new THREE.Mesh(geometry, frontMaterial); front.position.z = .016;
  card.add(front); card.position.x = -.12;
  // SVG shares the stage's pixel space, so the wire remains attached to the labelled DOM input.
  // Grey is the idle connection. Only measured speech samples produce orange displacement.
  const wire = host.querySelector<SVGPathElement>('.aas-wire')!;
  const energy = host.querySelector<SVGPathElement>('.aas-energy')!;
  const arrival = host.querySelector<SVGPathElement>('.aas-arrival')!;
  const voiceWave = host.querySelector<SVGPathElement>('.aas-voice-wave')!;
  const connection = host.querySelector<SVGSVGElement>('.aas-connection')!;
  const voiceObject = host.querySelector<HTMLElement>('.aas-voice')!;
  const demoButton = host.querySelector<HTMLButtonElement>('.aas-demo')!;
  let restoreKeyboardFocus = false;
  let stageWidth = host.clientWidth, extraWidth = 0, bleed = 0;
  const verticalBleed = 32;
  const attachment = new THREE.Vector3();
  let dead = false, visible = false, raf = 0, last = 0, lastClock = 0, started = false, introDone = false;
  let pointerX = 0, pointerY = 0;
  let video: HTMLVideoElement | null = null, videoTexture: any = null, portraitTexture: any = null;
  let context: AudioContext | null = null, analyser: AnalyserNode | null = null, gain: GainNode | null = null;
  let buffer: AudioBuffer | null = null, source: AudioBufferSourceNode | null = null, decoding = false;
  let sourceTime = 0, sourceOffset = 0, sourceRate = 1;
  const wave = new Uint8Array(256); wave.fill(128);
  const abort = new AbortController();
  const stopSource = () => { if (source) { try { source.stop(); } catch { /* already ended */ } source.disconnect(); source = null; } };
  const sync = (force = false) => {
    if (!context || !buffer || !analyser || !video || video.paused || video.seeking || !visible || document.hidden || context.state !== 'running') { stopSource(); return; }
    const offset = video.currentTime % buffer.duration;
    const predicted = (sourceOffset + (context.currentTime - sourceTime) * sourceRate) % buffer.duration;
    if (!force && source && Math.abs(offset - predicted) < .12) return;
    stopSource(); source = context.createBufferSource(); source.buffer = buffer;
    source.loop = true; source.playbackRate.value = video.playbackRate; source.connect(analyser);
    sourceOffset = offset; sourceTime = context.currentTime; sourceRate = video.playbackRate; source.start(0, offset);
  };
  const revealVideo = () => {
    if (videoTexture && video && video.readyState >= 2 && frontMaterial.map !== videoTexture) {
      // A single surface changes texture; no layered faces or backwards-facing video.
      frontMaterial.map = videoTexture; frontMaterial.needsUpdate = true;
    }
  };
  const play = () => { started = true; revealVideo(); sync(true); };
  const pause = () => stopSource();
  const seek = () => sync(true);
  const events = ['play', 'playing', 'pause', 'seeking', 'seeked', 'ratechange', 'timeupdate'] as const;
  const event = (e: Event) => {
    if (e.type === 'playing') play();
    else if (e.type === 'play') sync(true);
    else if (e.type === 'pause' || e.type === 'seeking') pause();
    else if (e.type === 'timeupdate') sync(); else seek();
  };
  const bind = () => {
    const next = host.querySelector('video'); if (next === video) return;
    if (video) events.forEach(name => video!.removeEventListener(name, event));
    stopSource(); videoTexture?.dispose(); videoTexture = null; video = next;
    if (video) {
      videoTexture = new VideoTexture(video); videoTexture.colorSpace = THREE.SRGBColorSpace;
      events.forEach(name => video!.addEventListener(name, event));
      if (!video.paused) play();
    }
  };
  const mutation = new MutationObserver(bind); mutation.observe(host, { childList: true, subtree: true }); bind();
  const loader = new THREE.TextureLoader();
  loader.load(portrait, (texture: any) => {
    if (dead) { texture.dispose(); return; }
    portraitTexture = texture; texture.colorSpace = THREE.SRGBColorSpace;
    frontMaterial.map = texture; frontMaterial.needsUpdate = true; ready();
  }, undefined, () => { if (!dead) fail(); });
  const resize = () => {
    const width = host.clientWidth; stageWidth = width;
    // Use otherwise-empty desktop space, without shifting the square card away from its chapter.
    const extra = innerWidth > 1200 ? Math.min(236, Math.max(0, innerWidth - host.getBoundingClientRect().right - 24)) : 0; extraWidth = extra;
    bleed = Math.min(24, Math.max(0, host.getBoundingClientRect().left - 8));
    const height = width + verticalBleed * 2;
    renderer.setSize(width + extra + bleed, height, false); canvas.style.width = `${width + extra + bleed}px`; canvas.style.height = `${height}px`; canvas.style.left = `${-bleed}px`;
    canvas.style.top = `calc(var(--aas-card-top) - ${verticalBleed}px)`;
    camera.fov = 2 * Math.atan(Math.tan(34 * Math.PI / 360) * height / width) * 180 / Math.PI;
    camera.aspect = (width + extra + bleed) / height; camera.updateProjectionMatrix();
    const worldHeight = 2 * Math.tan(34 * Math.PI / 360) * camera.position.z;
    card.position.x = (width * .48 + bleed - (width + extra + bleed) / 2) * worldHeight / width;
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  window.addEventListener('resize', resize);
  const pointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const rect = host.getBoundingClientRect(); pointerX = ((e.clientX - rect.left) / rect.width - .5) * .07;
    pointerY = ((e.clientY - rect.top) / rect.width - .5) * .05;
  };
  const leave = () => { pointerX = pointerY = 0; };
  host.addEventListener('pointermove', pointer); host.addEventListener('pointerleave', leave);
  const lost = (e: Event) => { e.preventDefault(); if (!dead) fail(); };
  canvas.addEventListener('webglcontextlost', lost);
  const frame = (now: number) => {
    raf = 0; if (dead || !visible || document.hidden) return;
    raf = requestAnimationFrame(frame); if (now - last < 1000 / 30) return;
    last = now;
    // The first 180 ms of the existing media clock settle a tiny yaw. No spin, growth,
    // crossfade ghosts or delayed speech. Once settled, loops/replays never turn again.
    const progress = introDone ? 1 : started && video ? Math.min(1, video.currentTime / .18) : 0;
    if (progress >= 1) introDone = true;
    const settle = 1 - (1 - progress) ** 3;
    card.rotation.y = -.13 * (1 - settle) + pointerX;
    card.rotation.z = -.018 * (1 - settle); card.rotation.x = .018 * (1 - settle) + pointerY;
    if (started) revealVideo();
    const phase = started ? (introDone ? 'video' : 'reveal') : 'portrait';
    if (host.dataset.scenePhase !== phase) host.dataset.scenePhase = phase;
    if (analyser && source) analyser.getByteTimeDomainData(wave); else wave.fill(128);
    let sumSquares = 0; for (const value of wave) sumSquares += ((value - 128) / 128) ** 2;
    const rms = Math.sqrt(sumSquares / wave.length);
    renderer.render(scene, camera);
    const bounds = host.getBoundingClientRect(), input = voiceObject.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(host).getPropertyValue('--aas-card-top')) || 0;
    const width = stageWidth, mobile = !extraWidth;
    connection.setAttribute('width', String(width + extraWidth)); connection.setAttribute('height', String(width + inset));
    const ax = mobile ? input.right - bounds.left - 24 : input.left - bounds.left;
    const ay = mobile ? input.bottom - bounds.top : input.top - bounds.top + input.height / 2;
    attachment.set(1.425, mobile ? .90 : -.4, 0).applyMatrix4(card.matrixWorld).project(camera);
    const bx = (attachment.x + 1) * (width + extraWidth + bleed) / 2 - bleed;
    const by = inset + (1 - attachment.y) * (width + verticalBleed * 2) / 2 - verticalBleed;
    const cx = mobile ? ax : ax - 48, cy = mobile ? ay + 18 : ay;
    const dx = mobile ? bx + 24 : bx + 60, dy = mobile ? by - 28 : by;
    wire.setAttribute('d', `M${ax},${ay} C${cx},${cy} ${dx},${dy} ${bx},${by}`);
    let signal = '', miniature = '';
    for (let i = 0; i < 64; i++) {
      const t = i / 63, s = 1 - t, amplitude = (wave[Math.floor(t * 255)] - 128) / 128;
      const x = s*s*s*ax + 3*s*s*t*cx + 3*s*t*t*dx + t*t*t*bx;
      const y = s*s*s*ay + 3*s*s*t*cy + 3*s*t*t*dy + t*t*t*by;
      signal += `${i ? 'L' : 'M'}${x.toFixed(2)},${(y + amplitude * 10 * Math.sin(t * Math.PI)).toFixed(2)}`;
      miniature += `${i ? 'L' : 'M'}${(t * 120).toFixed(2)},${(12 + Math.max(-10, Math.min(10, amplitude * 22))).toFixed(2)}`;
    }
    energy.setAttribute('d', signal); voiceWave.setAttribute('d', miniature);
    const active = !!source && rms > .003;
    energy.style.opacity = active ? String(Math.min(.8, .2 + rms * 2)) : '0';
    arrival.setAttribute('d', wire.getAttribute('d')!);
    arrival.style.strokeDasharray = '18 220'; arrival.style.strokeDashoffset = String(-((video?.currentTime || 0) * 140) % 238);
    arrival.style.opacity = active ? String(Math.min(.6, rms * 2)) : '0';
    if (now - lastClock > 200) {
      host.dataset.voiceRms = rms.toFixed(4); host.dataset.voiceActive = String(active); lastClock = now;
      if (restoreKeyboardFocus && host.dataset.scenePhase === 'video') {
        if (document.activeElement === document.body || document.activeElement === demoButton) host.querySelector<HTMLButtonElement>('[data-testid="xp-presenter-film-play"]')?.focus({ preventScroll: true });
        restoreKeyboardFocus = false;
      }
    }
  };
  const schedule = () => {
    if (visible && !document.hidden && !dead) { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } sync(); }
    else { cancelAnimationFrame(raf); raf = 0; stopSource(); }
  };
  document.addEventListener('visibilitychange', schedule);
  return {
    setVisible(value) { visible = value; host.dataset.sceneVisible = String(value); schedule(); },
    gesture() {
      if (dead) return;
      restoreKeyboardFocus ||= document.activeElement === demoButton && demoButton.matches(':focus-visible');
      try {
        if (!context) {
          context = new AudioContext(); analyser = context.createAnalyser(); analyser.fftSize = 256;
          gain = context.createGain(); gain.gain.value = 0; analyser.connect(gain); gain.connect(context.destination);
        }
        // This call is synchronous within a trusted native button click, never a play event.
        void context.resume().then(() => { if (!dead) sync(true); }).catch(() => { host.dataset.voiceAnalysis = 'unavailable'; });
        if (!buffer && !decoding) {
          decoding = true; const audio = context;
          void fetch(speech, { signal: abort.signal }).then(r => { if (!r.ok) throw new Error('voice unavailable'); return r.arrayBuffer(); })
            .then(bytes => audio.decodeAudioData(bytes)).then(decoded => { if (!dead) { buffer = decoded; host.dataset.voiceAnalysis = 'live'; sync(true); } })
            .catch(() => { if (!dead) host.dataset.voiceAnalysis = 'unavailable'; });
        }
      } catch { host.dataset.voiceAnalysis = 'unavailable'; }
    },
    dispose() {
      if (dead) return; dead = true; abort.abort(); cancelAnimationFrame(raf);
      mutation.disconnect(); observer.disconnect(); document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('resize', resize);
      host.removeEventListener('pointermove', pointer); host.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('webglcontextlost', lost);
      if (video) events.forEach(name => video!.removeEventListener(name, event));
      stopSource(); analyser?.disconnect(); gain?.disconnect(); if (context) void context.close().catch(() => 0);
      videoTexture?.dispose(); portraitTexture?.dispose(); geometry.dispose(); rimGeometry.dispose(); sideGeometry.dispose();
      frontMaterial.dispose(); rimMaterial.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      delete host.dataset.voiceRms; delete host.dataset.voiceAnalysis; delete host.dataset.scenePhase; delete host.dataset.sceneVisible; delete host.dataset.voiceActive;
    },
  };
}
