/**
 * A demo beat for Explore's dancer showcase (2026-10-26): a few bars drawn in the browser with an OfflineAudioContext (drums from noise and
 * sine sweeps, a bass, chords), returned as a WAV blob URL so a plain <audio> element can play it and the Audio tab's own analyser
 * (useAudioViz) can hear it. Nothing is downloaded and nothing leaves the page. Our own sounds; one feel per mood.
 */
export type Feel = 'boom' | 'four' | 'rock' | 'lofi' | 'ballad';
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
/* A minor: Am F C G, as chord tones (MIDI) and bass roots */
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];
const ROOTS = [45, 41, 48, 43];

export async function renderBeat(o: { bpm: number; feel: Feel; bars?: number }): Promise<{ url: string; peaks: number[]; duration: number }> {
  const sr = 44100; const step = 60 / o.bpm / 4; const bars = o.bars ?? 4; const dur = bars * 16 * step;
  const ctx = new OfflineAudioContext(1, Math.ceil((dur + 0.05) * sr), sr);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(ctx.destination);
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = o.feel === 'lofi' ? 3200 : 16000; tone.connect(comp);
  const bus = ctx.createGain(); bus.gain.value = 0.8; bus.connect(tone);
  const noise = ctx.createBuffer(1, sr, sr); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const env = (g: GainNode, t: number, a: number, peak: number, d: number) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const kick = (t: number, v = 1) => { const s = ctx.createOscillator(); const g = ctx.createGain(); s.frequency.setValueAtTime(140, t); s.frequency.exponentialRampToValueAtTime(42, t + 0.14); env(g, t, 0.004, 0.95 * v, 0.34); s.connect(g).connect(bus); s.start(t); s.stop(t + 0.42); };
  const hiss = (t: number, hp: number, peak: number, d: number) => { const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = ctx.createGain(); env(g, t, 0.002, peak, d); s.connect(f).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05); };
  const snare = (t: number, v = 1) => { hiss(t, 1400, 0.42 * v, 0.17); const s = ctx.createOscillator(); s.type = 'triangle'; s.frequency.value = 190; const g = ctx.createGain(); env(g, t, 0.002, 0.28 * v, 0.09); s.connect(g).connect(bus); s.start(t); s.stop(t + 0.15); };
  const hat = (t: number, v = 1, open = false) => hiss(t, 7500, 0.16 * v, open ? 0.22 : 0.04);
  const note = (t: number, n: number, len: number, type: OscillatorType, peak: number, cut = 2400, attack = 0.01) => {
    const s = ctx.createOscillator(); s.type = type; s.frequency.value = midi(n); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.setValueAtTime(peak, t + Math.max(attack, len * 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(bus); s.start(t); s.stop(t + len + 0.02);
  };
  const crunch = (t: number, n: number, len: number) => { /* a power chord through a soft clipper */
    const ws = ctx.createWaveShaper(); const c = new Float32Array(1024); for (let i = 0; i < c.length; i++) { const x = (i / 512) - 1; c[i] = Math.tanh(x * 6); } ws.curve = c;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; const g = ctx.createGain(); env(g, t, 0.005, 0.11, len); ws.connect(f).connect(g).connect(bus);
    for (const k of [0, 7, 12]) { const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.value = midi(n + k); s.connect(ws); s.start(t); s.stop(t + len + 0.05); }
  };
  for (let b = 0; b < bars; b++) {
    const t0 = b * 16 * step; const ch = CHORDS[b % 4]; const root = ROOTS[b % 4]; const at = (i: number, swing = 0) => t0 + i * step + (i % 2 ? swing * step : 0);
    for (let i = 0; i < 16; i++) {
      if (o.feel === 'boom') {
        if ([0, 7, 10].includes(i)) kick(at(i), i ? 0.8 : 1); if (i === 4 || i === 12) snare(at(i)); if (i % 2 === 0) hat(at(i, 0.2), i % 4 ? 0.6 : 0.9);
        if ([0, 7, 10].includes(i)) note(at(i), root - 12, step * 2.6, 'sine', 0.5, 500);
      } else if (o.feel === 'four') {
        if (i % 4 === 0) kick(at(i)); if (i === 4 || i === 12) snare(at(i), 0.9); if (i % 4 === 2) { hat(at(i), 1, true); note(at(i), root - 12, step * 1.6, 'sawtooth', 0.22, 700); note(at(i), ch[0] + 12, step * 1.2, 'sawtooth', 0.07, 3200); note(at(i), ch[2] + 12, step * 1.2, 'sawtooth', 0.06, 3200); }
        if (i % 2 === 1) hat(at(i), 0.45);
      } else if (o.feel === 'rock') {
        if ([0, 8, 10].includes(i)) kick(at(i)); if (i === 4 || i === 12) snare(at(i), 1.1); if (i % 2 === 0) { hat(at(i), 0.7); crunch(at(i), root - 12, step * 1.8); } if (i % 2 === 0) note(at(i), root - 24, step * 1.8, 'square', 0.16, 400);
      } else if (o.feel === 'lofi') {
        if (i === 0 || i === 10) kick(at(i), 0.75); if (i === 4 || i === 12) snare(at(i), 0.55); if (i % 2 === 0) hat(at(i, 0.28), 0.4);
        if (i === 0) for (const n of ch) note(at(i), n, 16 * step * 0.96, 'sine', 0.06, 1800, 0.03); if (i === 0 || i === 10) note(at(i), root - 12, step * 4, 'sine', 0.42, 400);
        if (i % 4 === 0) hiss(at(i) + step * Math.random(), 3000, 0.03, 0.01); /* vinyl crackle */
      } else {
        if (i === 0 || i === 8) kick(at(i), 0.45); if (i === 12) snare(at(i), 0.3); const arp = [ch[0], ch[1], ch[2], ch[3] + 0, ch[2], ch[1], ch[0] + 12, ch[1]];
        if (i % 2 === 0) note(at(i), arp[(i / 2) % 8] + 12, step * 3, 'triangle', 0.09, 2600, 0.008); if (i === 0) { for (const n of ch) note(at(i), n, 16 * step, 'sine', 0.05, 1200, 0.3); note(at(i), root - 12, 16 * step * 0.9, 'sine', 0.35, 300, 0.05); }
      }
    }
  }
  const buf = await ctx.startRendering(); const data = buf.getChannelData(0);
  const N = 96; const peaks = Array.from({ length: N }, (_, k) => { let m = 0; const a = Math.floor((k / N) * data.length), z = Math.floor(((k + 1) / N) * data.length); for (let i = a; i < z; i += 32) m = Math.max(m, Math.abs(data[i])); return m; });
  const top = Math.max(...peaks, 1e-3);
  return { url: URL.createObjectURL(wav(data, sr)), peaks: peaks.map((p) => Math.min(1, p / top)), duration: buf.duration };
}

/** 16-bit PCM WAV, mono. */
function wav(d: Float32Array, sr: number): Blob {
  const b = new ArrayBuffer(44 + d.length * 2); const v = new DataView(b); const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + d.length * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 0x7fff, true);
  return new Blob([b], { type: 'audio/wav' });
}
