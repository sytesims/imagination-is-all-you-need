import { useState } from 'react';
/** B15 (BH10 #5 / gap 8): clip-priced tools quote on the real clip length. Before a clip is loaded the first quote names the example or
 *  sample the page was opened with (example= / sample=), or sends no seconds at all so the server answers with its own estimate
 *  (estimated, assumedSeconds, estimateMessage), instead of a silent seconds=8 that later jumps. */
export function useClipSource(): { exId: string; sampleUrl: string } {
  const [s] = useState(() => { const u = new URLSearchParams(location.search); const v = u.get('sample') || '';
    return { exId: u.get('example') || '', sampleUrl: /^\/samples\/[\w/.-]+\.(mp4|webm|mov)$/.test(v) ? v : '' }; });
  return s;
}
/** Set the clip-length part of a quote: the loaded clip's seconds, else a hand-off's seconds, else example= / sample=, else nothing. */
export function setClipSeconds(u: URLSearchParams, dur: number | null | undefined, src: { exId: string; sampleUrl: string }, qp: Record<string, string> = {}) {
  u.delete('seconds'); u.delete('example'); u.delete('sample');
  if (dur && dur > 0) u.set('seconds', String(Math.round(dur * 100) / 100)); else if (qp.seconds) u.set('seconds', String(qp.seconds));
  else if (src.exId) u.set('example', src.exId); else if (src.sampleUrl) u.set('sample', src.sampleUrl);
  return u;
}
/** The no-clip estimate names what it assumed (length, source size, scale, output size) so the price isn't a mystery. */
export function EstimateHint({ q }: { q: any }) {
  if (!q?.estimated) return null;
  const sz = q?.assumedSize, out = q?.assumedOutputSize, sc = q?.assumedScale, sec = q?.assumedSeconds;
  const okSz = (x: any) => x && Number(x.width) > 0 && Number(x.height) > 0;
  const art = (n: any) => /^(8|11|18)(\D|$)/.test(String(n)) ? 'an' : 'a';
  const txt = okSz(out) ? `Estimate for ${sec ? `${art(sec)} ${sec} s` : 'a'} ${okSz(sz) ? `${Math.min(sz.width, sz.height)}p ` : ''}clip${sc ? ` at ${sc}×` : ''}, ${out.width}×${out.height} out. The exact price shows once your clip is loaded.`
    : sec ? `Estimate for ${art(sec)} ${sec} s clip. The exact price shows once your clip is loaded.` : String(q?.estimateMessage ?? '');
  if (!txt) return null;
  return <p className="helper ev-est" data-testid="price-estimate">{txt}{okSz(out) && <span hidden data-testid="est-output">{`${out.width}x${out.height}`}</span>}</p>;
}
