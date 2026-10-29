/**
 * Stitch preview: the timeline played in the browser, close to the export and cheap to run. Two <video> layers take turns (segment k plays
 * on layer k % 2), so a crossfade is the later layer fading in and a dip is a black layer rising and falling between them; cards on black,
 * cards over the picture and the end fade use the same timing as the export (shared/stitchTimeline planTimeline). The frame is the export's
 * shape with the same fit (contain / cover at the crop point / a blurred copy drawn behind). Sound: the music and voice play beside the clips
 * with the sliders' levels, and the bed dips while the voice talks. The export also levels every track and lands on −14 LUFS, which the
 * preview doesn't (PopNote says so). Nothing is rendered or uploaded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cardFade, duckDb, dbToGain } from '../../../../server/src/shared/stitchTimeline';
import { clampTrim, cardOn, clock, type StitchDraft, type TimelinePlan } from './stitchLogic';
import { drawCard } from './stitchCards';
import { PlayGlyph, PauseGlyph } from '../../shared/AudioCard';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** A fade-in / fade-out window: 0 outside [a, b], ramping over f at each end. */
const windowAlpha = (t: number, a: number, b: number, f: number) => (t < a || t > b ? 0 : Math.min(1, f > 0 ? (t - a) / f : 1, f > 0 ? (b - t) / f : 1));

export default function StitchPreview({ d, plan, frame, open, maxW = 388, maxH = 300 }: { d: StitchDraft; plan: TimelinePlan; frame: { w: number; h: number }; open: boolean; maxW?: number; maxH?: number }) {
  const fw = Math.round(Math.min(maxW, maxH * frame.w / frame.h)); const fh = Math.round(fw * frame.h / frame.w);
  const vids = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)]; const music = useRef<HTMLAudioElement>(null); const voice = useRef<HTMLAudioElement>(null);
  const black = useRef<HTMLDivElement>(null); const bg = useRef<HTMLCanvasElement>(null); const cardEls = { title: useRef<HTMLImageElement>(null), end: useRef<HTMLImageElement>(null) };
  const [t, setT] = useState(0); const [playing, setPlaying] = useState(false); const tRef = useRef(0); const playRef = useRef(false); const last = useRef(0);
  const clips = useMemo(() => d.clips.filter(c => !c.missing), [d.clips]);
  const total = plan.total;
  /* the cards drawn exactly as the export draws them, at the preview's size */
  const dpr = typeof devicePixelRatio === 'number' ? Math.min(2, devicePixelRatio) : 1;
  const cardUrl = useMemo(() => ({ title: cardOn(d.title) ? drawCard(d.title.text, d.title.style, Math.round(fw * dpr), Math.round(fh * dpr)).toDataURL() : '', end: cardOn(d.end) ? drawCard(d.end.text, d.end.style, Math.round(fw * dpr), Math.round(fh * dpr)).toDataURL() : '' }),
    [d.title, d.end, fw, fh, dpr]);
  const vol = useMemo(() => { const s = 1 / Math.max(1, d.mix.clip, d.mix.music, d.mix.voice); return { clip: d.keepAudio ? d.mix.clip * s : 0, music: d.mix.music * s, voice: d.mix.voice * s }; }, [d.mix, d.keepAudio]);
  const duck = d.voice && d.mix.duck ? dbToGain(-duckDb(d.mix.duckAmount)) : 1;

  /** Put every layer where time t wants it. */
  const apply = useCallback((t: number, seek: boolean) => {
    const segs = plan.segments; const T = plan.overlap;
    const active = segs.map((s, k) => ({ s, k })).filter(({ s }) => t >= s.start && t < s.start + s.dur + (s === segs[segs.length - 1] ? 0.001 : 0));
    const endF = d.fade && total > 1 ? clamp01((t - (total - 1)) / 1) : 0;
    let blackA = endF; const later = active.length > 1 ? active[active.length - 1] : null; const p = later && T > 0 ? clamp01((t - later.s.start) / T) : 1;
    if (later && d.transition === 'dip') blackA = Math.max(blackA, 1 - Math.abs(2 * p - 1));
    const voiceOn = !!d.voice && t < (d.voice.dur ?? 0); const bed = voiceOn ? duck : 1; const fadeV = 1 - endF;
    for (const slot of [0, 1]) {
      const el = vids[slot].current; if (!el) continue; const a = active.find(x => x.k % 2 === slot);
      const next = a ?? segs.map((s, k) => ({ s, k })).find(x => x.k % 2 === slot && x.s.start > t); /* idle layer: load the next segment it will play */
      const c = next && next.s.kind === 'clip' ? clips[next.s.clip!] : null;
      if (c) { const src = c.url; if (el.getAttribute('src') !== src) { el.setAttribute('src', src); el.load(); }
        const tr = clampTrim(c.trim, c.dur); const want = (tr?.start ?? 0) + Math.max(0, t - next!.s.start);
        if (seek || Math.abs(el.currentTime - want) > 0.3 || !a) { try { el.currentTime = want; } catch { /* not loaded */ } } }
      const showing = !!a && a.s.kind === 'clip';
      let op = showing ? 1 : 0; if (showing && later && a!.k === later.k && d.transition === 'crossfade') op = p;
      if (showing && later && d.transition === 'dip') op = (a!.k === later.k) === (p >= 0.5) ? 1 : 0;
      el.style.opacity = String(op); el.style.zIndex = later && a?.k === later.k ? '2' : '1';
      el.muted = !d.keepAudio; el.volume = clamp01(vol.clip * bed * fadeV * (showing ? (later && d.transition !== 'cut' ? (a!.k === later.k ? p : 1 - p) : 1) : 0));
      if (showing && playRef.current) { if (el.paused) void el.play().catch(() => undefined); } else if (!el.paused) el.pause();
    }
    if (black.current) black.current.style.opacity = String(blackA);
    /* cards: on black while their segment plays, over the picture in their window */
    for (const k of ['title', 'end'] as const) { const img = cardEls[k].current; if (!img) continue; const seg = segs.find(s => s.kind === k);
      const win = seg ? [seg.start, seg.start + seg.dur] : k === 'title' ? plan.overTitle : plan.overEnd;
      img.style.opacity = String(win ? windowAlpha(t, win[0], win[1], cardFade(win[1] - win[0])) : 0); }
    for (const [ref, on, gain, len, loop] of [[music, !!d.music, vol.music * bed, d.music?.dur ?? 0, d.musicLoop], [voice, !!d.voice, vol.voice, d.voice?.dur ?? 0, false]] as const) {
      const el = ref.current; if (!el || !on) continue; const at = loop && len > 0 ? t % len : t; const live = len <= 0 || loop || t < len;
      el.volume = clamp01(gain * fadeV);
      if (live && (seek || Math.abs(el.currentTime - at) > 0.3)) { try { el.currentTime = at; } catch { /* */ } }
      if (live && playRef.current) { if (el.paused) void el.play().catch(() => undefined); } else if (!el.paused) el.pause();
    }
    /* blur fill: the top layer, blurred, behind both */
    const cv = bg.current; if (cv && d.fit === 'blur') { const top = vids.map(v => v.current).filter((v): v is HTMLVideoElement => !!v && Number(v.style.opacity) > 0.5 && v.videoWidth > 0).sort((x, y) => Number(y.style.zIndex) - Number(x.style.zIndex))[0];
      const ctx = cv.getContext('2d'); if (ctx && top) { const s = Math.max(cv.width / top.videoWidth, cv.height / top.videoHeight); const w = top.videoWidth * s, h = top.videoHeight * s; ctx.filter = 'blur(8px) brightness(0.9)'; ctx.drawImage(top, (cv.width - w) / 2, (cv.height - h) / 2, w, h); } }
  }, [plan, d, clips, vol, duck, total]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the clock: real time while playing, stopped at the end */
  useEffect(() => { if (!playing) return; let raf = 0; last.current = performance.now();
    const tick = (now: number) => { const nt = Math.min(total, tRef.current + (now - last.current) / 1000); last.current = now; tRef.current = nt; apply(nt, false); setT(nt);
      if (nt >= total) { playRef.current = false; setPlaying(false); apply(nt, false); return; } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [playing, total, apply]);
  useEffect(() => { if (!playing) apply(tRef.current, true); }, [apply, playing]);
  useEffect(() => { if (!open) { playRef.current = false; setPlaying(false); for (const el of [...vids.map(v => v.current), music.current, voice.current]) el?.pause(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tRef.current > total) { tRef.current = total; setT(total); } }, [total]);
  const toggle = () => { if (playing) { playRef.current = false; setPlaying(false); apply(tRef.current, false); return; } if (tRef.current >= total - 0.05) tRef.current = 0; playRef.current = true; apply(tRef.current, true); setPlaying(true); };
  const scrub = (v: number) => { tRef.current = v; setT(v); apply(v, true); };
  const objFit = d.fit === 'fit' ? 'contain' : d.fit === 'fill' ? 'cover' : 'contain';
  const pos = d.fit === 'fill' ? `${Math.round(d.crop.x * 100)}% ${Math.round(d.crop.y * 100)}%` : '50% 50%';

  return <div className="stp" data-testid="st-preview">
    <div className="stp-frame" style={{ width: fw, height: fh }}>
      {d.fit === 'blur' && <canvas ref={bg} className="stp-bg" width={Math.max(2, Math.round(fw / 3))} height={Math.max(2, Math.round(fh / 3))} aria-hidden />}
      {vids.map((r, i) => <video key={i} ref={r} className="stp-v" muted playsInline preload="auto" style={{ objectFit: objFit, objectPosition: pos, opacity: 0 }} data-testid={`st-preview-v${i}`} />)}
      <div ref={black} className="stp-black" aria-hidden />
      {cardUrl.title && <img ref={cardEls.title} className="stp-card" src={cardUrl.title} alt="" aria-hidden style={{ opacity: 0 }} data-testid="st-preview-title" />}
      {cardUrl.end && <img ref={cardEls.end} className="stp-card" src={cardUrl.end} alt="" aria-hidden style={{ opacity: 0 }} data-testid="st-preview-end" />}
      {d.music && <audio ref={music} src={d.music.url} preload="auto" />}{d.voice && <audio ref={voice} src={d.voice.url} preload="auto" />}
    </div>
    <div className="stp-bar">
      <button type="button" className="st-play stp-play" onClick={toggle} aria-label={playing ? 'Pause the preview' : 'Play the preview'} data-testid="st-preview-play">{playing ? <PauseGlyph s={14} /> : <PlayGlyph s={14} />}</button>
      <input className="vbar-range stp-scrub" type="range" min={0} max={Math.max(0.1, total)} step={0.05} value={Math.min(t, total)} aria-label="Preview time" aria-valuetext={`${clock(t)} of ${clock(total)}`} onChange={e => scrub(Number(e.target.value))} data-testid="st-preview-scrub" />
      <span className="stp-time" aria-hidden>{clock(t)} / {clock(total)}</span>
    </div>
  </div>;
}
