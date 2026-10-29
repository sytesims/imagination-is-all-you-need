/**
 * Swap Two People in the Video bar (2026-10-27; tools/twoPersonSwap.ts on the server). The recipe (server/src/shared/videoBar.ts) gives the clip,
 * the Person 1 / Person 2 photo slots, Quality and Sound. This adds what a recipe can't say:
 *  - "Who is who": the first frame of the range, click person 1 and person 2 on it (numbered markers), and optional words for each. Without
 *    clicks, person 1 is the one on the left and person 2 the one on the right.
 *  - Range: the shared swap range (./SwapRange) with this workflow's 15 s maximum, priced by the range.
 *  - A gentle note when both slots hold the same photo (allowed: twins, a double act).
 */
import { useRef, useState } from 'react';
import type { BarExtra, BarLive, UseBarExtra } from './types';
import { useSwapRange } from './SwapRange';
import { BarPopover, PopSection, PopNote, Segmented } from '../../../shared/BarPop';
import { tip } from '../../../shared/Tooltip';
import { UserIcon, AlertIcon } from '../../Icons';

/** The server's limit (comfy/h3TwoPersonSwapCloud.ts TWO_SWAP_SECONDS). */
export const TWO_SWAP_MAX_SEC = 15;
type P = { x: number; y: number };
const sideWord = (p: P) => (p.x < 0.4 ? 'left' : p.x > 0.6 ? 'right' : 'middle');
const same = (a?: File, b?: File) => !!a && !!b && a.size === b.size && a.name === b.name && a.lastModified === b.lastModified;

export const useTwoPersonSwapExtra: UseBarExtra = () => {
  const range = useSwapRange({ max: TWO_SWAP_MAX_SEC });
  /* the clicks belong to one clip: a new clip starts with none */
  const [pts, setPtsAt] = useState<{ url: string; p: [P | null, P | null] }>({ url: '', p: [null, null] }); const [who, setWho] = useState<[string, string]>(['', '']);
  const [placing, setPlacing] = useState<0 | 1>(0);
  /* the frame SAM looks at is almost black (a fade-in): say so, since nobody can be found on it */
  const [dark, setDark] = useState<string | null>(null);
  const checkDark = (v: HTMLVideoElement, key: string) => { try { const cv = document.createElement('canvas'); cv.width = 32; cv.height = 18; const x = cv.getContext('2d'); if (!x || !v.videoWidth) return;
    x.drawImage(v, 0, 0, 32, 18); const d = x.getImageData(0, 0, 32, 18).data; let sum = 0; for (let k = 0; k < d.length; k += 4) sum += d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11;
    setDark(sum / (d.length / 4) < 14 ? key : null); } catch { setDark(null); } };
  const vid = useRef<HTMLVideoElement>(null);
  const clipOf = (c: BarLive) => c.files.video?.[0] ?? null;
  const live = (c: BarLive): [P | null, P | null] => (pts.url && (pts.url === '*' || pts.url === clipOf(c)?.url) ? pts.p : [null, null]);
  const setPts = (url: string, p: [P | null, P | null]) => setPtsAt({ url, p });
  const tooClose = (p: [P | null, P | null]) => !!p[0] && !!p[1] && Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) < 0.03;
  const samePhoto = (c: BarLive) => same(c.files.personA?.[0]?.file, c.files.personB?.[0]?.file);
  const where = (k: 0 | 1, p: [P | null, P | null]) => p[k] ? `picked, ${sideWord(p[k]!)}` : (() => { const o = p[1 - k]; return o ? (o.x < 0.5 ? (k === 0 ? 'right' : 'left') : (k === 0 ? 'left' : 'right')) : k === 0 ? 'left' : 'right'; })();
  const summary = (p: [P | null, P | null]) => p[0] || p[1] ? (p[0] && p[1] ? 'Picked on the frame' : `1 ${where(0, p)} · 2 ${where(1, p)}`) : '1 left · 2 right';
  const ex: BarExtra = {
    needs: c => tooClose(live(c)) ? [{ missing: 'You picked the same spot for both people: pick each person once', group: 'who' }] : [],
    form: c => { const p = live(c); const o: Record<string, string> = { ...range.form!(c) };
      if (p[0]) o.pointA = `${p[0].x.toFixed(4)},${p[0].y.toFixed(4)}`; if (p[1]) o.pointB = `${p[1].x.toFixed(4)},${p[1].y.toFixed(4)}`;
      if (who[0].trim()) o.whoA = who[0].trim(); if (who[1].trim()) o.whoB = who[1].trim(); return o; },
    quote: range.quote,
    onSlot: s => { if (s.name === 'video') setPlacing(0); } /* a new clip starts on person 1 */,
    onReset: () => { setPts('', [null, null]); setWho(['', '']); setPlacing(0); },
    onRecreate: f => { const pt = (s?: string): P | null => { const m = /^([\d.]+),([\d.]+)$/.exec(String(s ?? '')); return m ? { x: Number(m[1]), y: Number(m[2]) } : null; };
      setPtsAt({ url: '*', p: [pt(f.pointA), pt(f.pointB)] }); setWho([String(f.whoA ?? ''), String(f.whoB ?? '')]); },
    chips: c => { const p = live(c); const on = c.pop === 'g:who'; const need = tooClose(p); const sum = summary(p); const twin = samePhoto(c);
      return <>
        <button key="who" ref={c.chipRef('who')} type="button" className={`ic-chip wf-grp wf-fold${on ? ' on' : ''}${need ? ' vbar-need' : ''}`} aria-haspopup="dialog" aria-expanded={on} data-testid="vbar-group-who"
          aria-label={`Who is who: ${sum}`} {...tip(on ? null : `Who is who: ${sum}`)} onClick={() => c.setPop(on ? '' : 'g:who')}>
          <UserIcon size={14} /><span className="wf-grp-l">Who is who</span><b>{sum}</b></button>
        {twin && <button key="twin" type="button" className="ic-chip tps-twin" aria-label="Same photo for both people" data-testid="vbar-two-same-photo" {...tip('Both people have the same photo, so both become the same character. Fine for twins; otherwise drop a different photo in Person 2.')}
          onClick={() => c.setPop('g:who')}><AlertIcon size={14} /><span className="tps-twin-l">Same photo</span></button>}
        {range.chips!(c)}</>; },
    pops: c => { const f = clipOf(c); const p = live(c); const r = range.rangeOf(c); const t0 = r?.start ?? 0;
      const pick = (e: React.MouseEvent<HTMLDivElement>) => { const b = e.currentTarget.getBoundingClientRect(); const q = { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
        setPts(f!.url, placing === 0 ? [q, p[1]] : [p[0], q]); if (placing === 0 && !p[1]) setPlacing(1); };
      return <>
        <BarPopover key="who" open={c.pop === 'g:who'} anchor={c.anchorOf('who')} avoid={c.dock} watch={c.dock} placement="top" gap={8} onClose={() => c.setPop('')} label="Who is who" testId="vbar-pop-who" width={400} className="vbar-replace-pop">
          {!f ? <PopNote testId="vbar-who-noclip">Add your clip first: you pick each person on its first frame.</PopNote> : <PopSection label="Pick each person on the first frame" aside={p[0] || p[1] ? <button type="button" className="link-btn" data-testid="vbar-who-clear" onClick={() => { setPts('', [null, null]); setPlacing(0); }}>Clear</button> : 'optional'} testId="vbar-who-frame">
            <Segmented label="Placing" value={placing} onChange={v => setPlacing(v)} testId="vbar-who-placing"
              options={[{ value: 0, label: 'Person 1', hint: p[0] ? 'Picked' : 'Click them', testId: 'vbar-who-p1' }, { value: 1, label: 'Person 2', hint: p[1] ? 'Picked' : 'Click them', testId: 'vbar-who-p2' }]} />
            <div className="point-picker tps-frame" role="button" tabIndex={-1} aria-label={`Click person ${placing + 1} on the first frame`} data-testid="vbar-who-pick" onClick={pick}>
              <video ref={vid} key={f.url} src={`${f.url}#t=${t0}`} muted playsInline preload="auto" onLoadedMetadata={e => { e.currentTarget.currentTime = t0; }} onSeeked={e => { const v = e.currentTarget; const k = `${f.url}@${t0}`; /* seeked can fire before the new frame is painted (it reads black): check once it is on screen */ const rv = (v as any).requestVideoFrameCallback; if (typeof rv === 'function') rv.call(v, () => checkDark(v, k)); else window.setTimeout(() => checkDark(v, k), 200); }} />
              {p.map((q, k) => q && <span key={k} className={`tps-dot${k === placing ? ' on' : ''}`} style={{ left: `${q.x * 100}%`, top: `${q.y * 100}%` }} aria-hidden>{k + 1}</span>)}
            </div>
            {dark === `${f.url}@${t0}` && <PopNote tone="warn" testId="vbar-who-dark">This frame is almost black, so nobody can be found on it. Move the start of Range to where both people are in view.</PopNote>}
            <PopNote testId="vbar-who-default">{p[0] && p[1] ? 'Both picked. Click the frame again to move the highlighted person.' : p[0] || p[1] ? 'Anyone you don’t pick is found on their side of the frame.' : 'No clicks needed when person 1 is on the left and person 2 is on the right.'}</PopNote>
          </PopSection>}
          <PopSection label="Describe them" aside="optional" testId="vbar-who-words">
            {([0, 1] as const).map(k => <input key={k} className="vbar-text tps-words" type="text" maxLength={120} data-testid={`vbar-who-${k + 1}`} aria-label={`Person ${k + 1} in words`}
              placeholder={k === 0 ? 'Person 1, e.g. the woman in the red dress' : 'Person 2, e.g. the man in the grey jacket'} value={who[k]}
              onChange={e => { const v = e.target.value; setWho(s => (k === 0 ? [v, s[1]] : [s[0], v])); }} onKeyDown={e => { if (e.key === 'Enter') c.setPop(''); }} />)}
          </PopSection>
          {samePhoto(c) && <PopNote tone="warn" testId="vbar-who-twin">Both people have the same photo, so both become the same character.</PopNote>}
          <PopNote testId="vbar-who-tips">Only one person in the shot? Character Swap recasts one. More than two? Pick the two to recast; everyone else stays as filmed.</PopNote>
        </BarPopover>
        {range.pops!(c)}</>; },
  };
  return ex;
};
