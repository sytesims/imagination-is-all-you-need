/**
 * Object Swap in the Video bar (2026-10-25, step 3). The recipe (server/src/shared/videoBar.ts) gives the clip, the new-look photos, the prompt,
 * Person / Object, the preset, resolution, versions and sound. This adds the one step it can't say: WHAT to replace, as a "Replace" chip whose
 * popover holds the old screen's own controls (tools/videoSwap/SwapType ObjectMask: name it, click it on a frame, or a mask clip, with the free
 * mask preview; for a person: who, quick picks, or a click on the frame). The form is the old screen's, field for field.
 */
import { useEffect, useState } from 'react';
import type { BarExtra, BarLive, UseBarExtra } from './types';
import { ObjectMask, swapTypeModels, swapUnwired, growWired, initialSwapType, isLucy, isH3Ref, maskPromptTooLong, type MaskGrow, type MaskMode, type Pt, type SwapType } from '../../../tools/videoSwap/SwapType';
import PointPicker from '../../../shared/PointPicker';
import type { VideoMeta } from '../../../shared/UploadVideo';
import { BarPopover, PopSection, PopNote } from '../../../shared/BarPop';
import { tip } from '../../../shared/Tooltip';
import { SelectIcon } from '../../Icons';
import { LIMITS } from '../../../shared/limits';
import { useSwapRange } from './SwapRange';
import { cloudSwapOf, WHO_HINT, CHARACTER_HINT } from '../../../../../server/src/shared/cloudSwap';

const QUICK = ['main person', 'person on the left', 'person on the right'];
const fmtPt = (p: Pt) => `${Math.round(p.x * 100)}%, ${Math.round(p.y * 100)}% · ${p.t.toFixed(1)} s`;

export const useObjectSwapExtra: UseBarExtra = ({ tool, vals, setVal }) => {
  const [target, setTarget] = useState(''); const [point, setPoint] = useState<Pt | null>(null);
  const [maskMode, setMaskMode] = useState<MaskMode>('text'); const [maskPrompt, setMaskPrompt] = useState(''); const [matte, setMatte] = useState<File | null>(null); const [grow, setGrow] = useState<MaskGrow>('normal');
  const [ffMode, setFfMode] = useState<'auto' | 'upload'>('auto'); const [firstFrame, setFirstFrame] = useState<File | null>(null); /* the first-frame control stays hidden (not wired into the swap submit, as before) */
  /* Person or Object: ?swap= first, else the preset's group (Product → object), else person; the URL follows the pick (deep links, back / forward) */
  useEffect(() => { const u = new URLSearchParams(location.search).get('swap'); if (u === 'person' || u === 'object') { if (u !== vals.swapType) setVal('swapType', u); return; }
    if (!vals.swapType) setVal('swapType', initialSwapType((tool.presets ?? []).find(p => p.id === (new URLSearchParams(location.search).get('preset') ?? vals.preset))?.group)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const type: SwapType = vals.swapType === 'object' ? 'object' : 'person';
  useEffect(() => { const u = new URLSearchParams(location.search); if (u.get('swap') !== type) { u.set('swap', type); history.replaceState(history.state, '', `${location.pathname}?${u}`); } }, [type]);
  const typeModels = (ps: BarLive['providers']) => { const st = swapTypeModels<(typeof ps)[number]>(tool as any, type); const typed = ps.some((p: any) => Array.isArray(p.swapTypes));
    const base = st ? st.filter(m => ps.some(p => p.id === m.id)) : typed ? ps.filter((p: any) => !Array.isArray(p.swapTypes) || p.swapTypes.includes(type)) : ps; return base.filter((p: any) => !swapUnwired(p)); };
  const videoOf = (c: BarLive): VideoMeta | null => { const f = c.files.video?.[0]; return f ? { file: f.file, url: f.url, duration: Math.min(f.sec ?? 0, LIMITS.maxSec), w: f.w ?? 0, h: f.h ?? 0, audio: null, trimmed: false } : null; };
  const isObj = type === 'object';
  const range = useSwapRange(); /* the swap range (shared with Motion Control) */
  /** Cloud person swap (Kling 3.0 Omni Edit, Seedance 2.5 Edit): one character image, "Who to replace" required (no mask: the words pick the person). */
  const cloud = (c: BarLive) => (!isObj ? cloudSwapOf(c.prov) : null);
  const summary = (c: BarLive) => { const lucy = isObj && isLucy(c.prov);
    if (!isObj) return target.trim() || (cloudSwapOf(c.prov) ? 'Who to replace' : point ? 'Picked on the frame' : 'Who to swap');
    if (lucy) return 'Described in the prompt';
    return maskMode === 'text' ? (maskPrompt.trim() || 'Name the object') : maskMode === 'point' ? (point ? 'Clicked on the frame' : 'Click it on a frame') : maskMode === 'upload' ? (matte ? 'Your mask clip' : 'Add a mask clip') : 'Whole shot'; };
  const hasMask = (c: BarLive) => isLucy(c.prov) || (maskMode === 'text' ? !!maskPrompt.trim() && !maskPromptTooLong(maskPrompt) : maskMode === 'point' ? !!point : maskMode === 'upload' ? !!matte : true);
  const ex: BarExtra = {
    providers: typeModels, chipsAfter: 'swap',
    firstProvider: ps => { const d = (tool as any).swapTypes?.[type]?.defaultProvider; return ps.some(p => p.id === d) ? d : undefined; },
    slotRequired: (s, c) => s.name === 'refs' ? !(isObj && isLucy(c.prov)) : undefined,
    slotShown: (s, c) => s.name === 'refs' ? !(isObj && isLucy(c.prov)) : true,
    slotInfo: (s, c) => s.name === 'refs' && cloud(c) ? { label: 'Character', hint: CHARACTER_HINT, missing: 'Add your character image' } : undefined,
    slotMax: (s, c) => s.name === 'refs' ? (cloud(c) ? cloud(c)!.maxImages : isObj ? (isH3Ref(c.prov) ? 9 : 1) : (tool.inputs.find(i => i.name === 'refs') as any)?.max ?? LIMITS.maxRefs) : undefined,
    needs: c => { const out: { missing: string; group?: string; slot?: string }[] = [];
      if (cloud(c) && !target.trim()) out.push({ missing: 'Say who to replace: one person, e.g. “the man on the left in the black hoodie”', group: 'replace' });
      else if (cloud(c) && (c.files.refs?.length ?? 0) > cloud(c)!.maxImages) out.push({ missing: `${cloud(c)!.name} takes one character image: remove the extra`, slot: 'refs' });
      else if (!isObj && !c.prompt.trim() && !c.valOf('preset') && !target.trim() && !point) out.push({ missing: 'Say what changes: a prompt, a preset, or who to swap', group: 'replace' });
      if (isObj && cloudSwapOf(c.prov) && !(maskMode === 'text' && maskPrompt.trim())) out.push({ missing: `Name the object to replace, like “red mug”: ${cloudSwapOf(c.prov)!.name} finds it from your words`, group: 'replace' });
      else if (isObj && maskMode === 'text' && maskPromptTooLong(maskPrompt)) out.push({ missing: 'Keep the object’s name short, like “red mug”', group: 'replace' });
      else if (isObj && !hasMask(c)) out.push({ missing: maskMode === 'upload' ? 'Add the mask clip' : maskMode === 'point' ? 'Click the object on a frame' : 'Name the object to replace', group: 'replace' });
      if (isObj && isLucy(c.prov) && !c.prompt.trim()) out.push({ missing: 'Describe the change in one sentence', group: 'replace' });
      return out; },
    form: c => { const lucy = isObj && isLucy(c.prov); const o: Record<string, string> = { target: isObj ? '' : target };
      const mm: MaskMode = lucy ? 'none' : maskMode;
      if (point && (!isObj || mm === 'point')) o.point = `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.t.toFixed(2)}`;
      if (isObj) { o.maskMode = mm; if (mm !== 'none' && growWired(c.prov)) o.maskGrow = grow; if (mm === 'text' && maskPrompt.trim()) { o.maskPrompt = maskPrompt.trim(); if (!o.target) o.target = maskPrompt.trim(); } }
      if (cloud(c)) delete o.point; /* the hosted edit picks the person from your words */
      return { ...o, ...range.form!(c) }; },
    files: () => isObj && maskMode === 'upload' && matte ? [['matte', matte]] : [],
    /* the old screen's quote: one pass per version and per 8 photos */
    quote: c => ({ passes: String(Math.max(1, Number(c.valOf('count')) || 1) * Math.max(1, Math.ceil((c.files.refs?.length ?? 0) / 8))), ...range.quote!(c) }),
    onRecreate: f => { if (typeof f.target === 'string' && f.swapType !== 'object') setTarget(f.target); if (typeof f.maskPrompt === 'string') setMaskPrompt(f.maskPrompt);
      if (f.maskMode && ['text', 'point', 'upload', 'none'].includes(f.maskMode)) setMaskMode(f.maskMode as MaskMode); if (f.maskGrow && ['tight', 'normal', 'loose', 'box'].includes(f.maskGrow)) setGrow(f.maskGrow as MaskGrow);
      const m = /^([\d.]+),([\d.]+),([\d.]+)$/.exec(String(f.point ?? '')); if (m) setPoint({ x: Number(m[1]), y: Number(m[2]), t: Number(m[3]) }); },
    onReset: () => { setMatte(null); setFirstFrame(null); setPoint(null); },
    onFiles: (slot, fs) => { if (slot === 'matte' && fs[0]) { setMatte(fs[0]); setMaskMode('upload'); return true; } if (slot === 'firstFrame' && fs[0]) { setFirstFrame(fs[0]); setFfMode('upload'); return true; } return false; },
    chips: c => { const need = isObj ? !hasMask(c) : !!cloud(c) && !target.trim(); const sum = summary(c); const on = c.pop === 'g:replace';
      return <button key="replace" ref={c.chipRef('replace')} type="button" className={`ic-chip wf-grp wf-fold${on ? ' on' : ''}${need ? ' vbar-need' : ''}`} aria-haspopup="dialog" aria-expanded={on} data-testid="vbar-group-replace"
        aria-label={`Replace: ${sum}`} {...tip(on ? null : isObj ? `What to replace: ${sum}` : `Who to swap: ${sum}`)} onClick={() => c.setPop(on ? '' : 'g:replace')}>
        <SelectIcon size={14} /><span className="wf-grp-l">Replace</span><b>{sum}</b></button>; },
    /* chips / pops: Replace, then the Range */
    pops: c => { const video = videoOf(c);
      return <BarPopover key="replace" open={c.pop === 'g:replace'} anchor={c.anchorOf('replace')} avoid={c.dock} watch={c.dock} placement="top" gap={8} onClose={() => c.setPop('')} label={isObj ? 'What to replace' : 'Who to swap'} testId="vbar-pop-replace" width={380} className="vbar-replace-pop">
        {!video && <PopNote testId="vbar-replace-noclip">Add your clip first: you pick the object on one of its frames.</PopNote>}
        {isObj ? <PopSection label="What to replace" testId="vbar-replace-object"><ObjectMask swapType="object" video={video} provider={c.prov} maskMode={maskMode} setMaskMode={setMaskMode} maskPrompt={maskPrompt} setMaskPrompt={setMaskPrompt}
            point={point} setPoint={setPoint} matte={matte} setMatte={setMatte} grow={grow} setGrow={setGrow} ffMode={ffMode} setFfMode={setFfMode} firstFrame={firstFrame} setFirstFrame={setFirstFrame} />
            {cloudSwapOf(c.prov) && <PopNote testId="vbar-object-cloud">{cloudSwapOf(c.prov)!.name} finds the object from its name. Clicks and mask clips aren’t used.</PopNote>}</PopSection>
          : cloud(c) ? <PopSection label="Who to replace" testId="vbar-replace-who">
            <input className="vbar-text" type="text" data-testid="vbar-target" aria-label="Who to replace" aria-describedby="vbar-who-hint" maxLength={300} placeholder="e.g. the man on the left in the black hoodie" value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') c.setPop(''); }} />
            <div className="vbar-quick" role="group" aria-label="Quick picks">{QUICK.map(q => <button key={q} type="button" className={`vbar-qchip${target === q ? ' on' : ''}`} aria-pressed={target === q} onClick={() => setTarget(target === q ? '' : q)}>{q}</button>)}</div>
            <PopNote testId="vbar-who-hint"><span id="vbar-who-hint">{WHO_HINT}</span></PopNote></PopSection>
          : <PopSection label="Who to swap" aside="optional" testId="vbar-replace-person">
            <input className="vbar-text" type="text" data-testid="vbar-target" aria-label="Who to swap" placeholder="e.g. the man in the red jacket" value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') c.setPop(''); }} />
            <div className="vbar-quick" role="group" aria-label="Quick picks">{QUICK.map(q => <button key={q} type="button" className={`vbar-qchip${target === q ? ' on' : ''}`} aria-pressed={target === q} onClick={() => setTarget(target === q ? '' : q)}>{q}</button>)}</div>
            {video && <div className="vbar-pp"><PointPicker video={video} point={point} setPoint={setPoint} />{point && <PopNote testId="vbar-point">Picked at {fmtPt(point)}</PopNote>}</div>}
            <PopNote>Or leave it empty and say it in the prompt or with a preset.</PopNote></PopSection>}
      </BarPopover>; },
  };
  const chips0 = ex.chips!, pops0 = ex.pops!; ex.chips = c => <>{chips0(c)}{range.chips!(c)}</>; ex.pops = c => <>{pops0(c)}{range.pops!(c)}</>;
  return ex;
};
