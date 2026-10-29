import { useState } from 'react';
import { DownloadIcon } from './Icons';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
/** Client-side GIF export: ~480px wide, 12fps, first 6s. No server round-trip. */
export default function GifButton({ url, name, jobId }: { url: string; name: string; jobId?: string }) {
  const [p, setP] = useState<number | null>(null); const [href, setHref] = useState<string | null>(null); const [err, setErr] = useState('');
  /** Server route first (full-length clip); client encoder is the fallback. */
  async function server() {
    if (!jobId) return false;
    setErr(''); setHref(null); setP(0.05);
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/output.gif?w=480&fps=12&full=1`);
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('gif')) throw new Error('server');
      const u = URL.createObjectURL(await r.blob()); setHref(u); setP(null);
      const a = document.createElement('a'); a.href = u; a.download = name; a.click(); return true;
    } catch { setP(null); return false; }
  }
  async function start() { if (!(await server())) await make(); }
  async function make() {
    setErr(''); setHref(null); setP(0);
    try {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
      await new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error('Could not load video')); });
      const W = Math.min(480, v.videoWidth), H = Math.round(v.videoHeight * W / v.videoWidth / 2) * 2;
      const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d', { willReadFrequently: true })!;
      const fps = 12, dur = Math.min(v.duration || 4, 6), n = Math.max(1, Math.floor(dur * fps)); const g = GIFEncoder();
      for (let i = 0; i < n; i++) {
        await new Promise<void>(ok => { v.onseeked = () => ok(); v.currentTime = i / fps; });
        ctx.drawImage(v, 0, 0, W, H); const { data } = ctx.getImageData(0, 0, W, H);
        const pal = quantize(data, 256); g.writeFrame(applyPalette(data, pal), W, H, { palette: pal, delay: Math.round(1000 / fps) });
        setP((i + 1) / n); await new Promise(r => setTimeout(r));
      }
      g.finish(); const u = URL.createObjectURL(new Blob([g.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' })); setHref(u); setP(null);
      const a = document.createElement('a'); a.href = u; a.download = name; a.click();
    } catch (e) { setErr((e as Error).message); setP(null); }
  }
  if (p !== null) return <button className="btn gif-btn busy" disabled aria-busy="true"><span className="gif-bar" style={{ width: `${Math.round(p * 100)}%` }} /><span>Making GIF… {Math.round(p * 100)}%</span></button>;
  if (href) return <a className="btn gif-btn done" href={href} download={name}>✓ GIF ready · save again</a>;
  return <button className="btn gif-btn" onClick={start} title={err || (jobId ? '480px · 12fps · full length' : '480px · 12fps · up to 6s')}><DownloadIcon size={14} />{err ? 'GIF failed · retry' : 'Download GIF'}</button>;
}
