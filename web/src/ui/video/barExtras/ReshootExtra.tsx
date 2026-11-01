/**
 * Re-shoot in the Video bar (2026-10-25, step 3). The recipe (server/src/shared/videoBar.ts) gives the take (a clip, or a photo on models that
 * take one), references, Seedance's move clips, a soundtrack, the prompt, batch, full clips, length (photo), resolution and Seedance's sound.
 * This adds the angles: an "Angles" chip whose popover is the old screen's own angle pad (tools/reshoot/OrbitPad: drag, snap to a named angle,
 * Rotation and Tilt), the other named angles as chips, and each picked angle's time range (ui/next/AngleTimeline). Up to 4 angles make one
 * multi-angle cut; the form, the quote and the re-roll of one angle are the old screen's.
 * H3 runner Step 3: on "New angle · H3 CrossView · cloud" the popover is the CrossView camera instead (tools/reshoot/CrossViewPad: azimuth, elevation,
 * distance, green / yellow / red zones): one camera for the whole take, no time ranges, batch or full clips; refs and a replacement soundtrack hidden.
 */
import { useEffect, useRef, useState } from 'react';
import type { BarExtra, BarLive, UseBarExtra } from './types';
import { OrbitPad, nearestPreset, yawTiltWords, fmtDeg, type PadPreset, type Space } from '../../../tools/reshoot/OrbitPad';
import AngleTimeline from '../../next/AngleTimeline';
import { BarPopover, PopSection, PopNote } from '../../../shared/BarPop';
import { tip } from '../../../shared/Tooltip';
import { CloseIcon, ReshootIcon } from '../../Icons';
import { LIMITS } from '../../../../../server/src/shared/mediaAccept';
import { CrossViewPad, CROSSVIEW_DEFAULT_CAM, isCrossView, camWords, zoneLabel, type CrossViewCam } from '../../../tools/reshoot/CrossViewPad';
import { crossviewZone } from '../../../../../server/src/shared/crossview';

interface Angle { start: number; end: number; angle: string; yaw?: number; tilt?: number }
const r1 = (n: number) => Math.round(n * 10) / 10;
const COLORS = ['#ff8a3d', '#4fb3ff', '#b98cff', '#3bd16f']; /* AngleTimeline's segment colours */

export const useReshootExtra: UseBarExtra = ({ tool, toast }) => {
  const caps: any = (tool as any).capabilities ?? (tool as any).app?.capabilities ?? {};
  const max = (tool.inputs.find(i => i.name === 'angles') as any)?.max ?? 4;
  const presets = tool.presets ?? [];
  const space: Space = { yaw: { min: Number(caps.angleSpace?.yaw?.min ?? -180), max: Number(caps.angleSpace?.yaw?.max ?? 180) }, tilt: { min: Number(caps.angleSpace?.tilt?.min ?? -60), max: Number(caps.angleSpace?.tilt?.max ?? 60) }, snapDeg: Number(caps.angleSpace?.snapDeg ?? 20) };
  const padPresets: PadPreset[] = presets.filter((p: any) => typeof p.yaw === 'number' && typeof p.tilt === 'number').map((p: any) => ({ id: p.id, label: p.label, prompt: p.prompt, yaw: p.yaw, tilt: p.tilt, pad: p.pad !== false }));
  const hasPad = padPresets.some(p => p.pad);
  const imgProviders: string[] = Array.isArray(caps.imageInputProviders) ? caps.imageInputProviders : Object.entries(caps.imageInputByProvider ?? {}).filter(([, v]) => v).map(([k]) => k);
  const [angles, setAngles] = useState<Angle[]>([]); const [pos, setPos] = useState({ yaw: 0, tilt: 0 }); const [cam, setCam] = useState<CrossViewCam>(CROSSVIEW_DEFAULT_CAM);
  const rawDur = (c: BarLive) => c.files.video?.[0]?.sec ?? 0; const cvDur = (c: BarLive) => { const d = rawDur(c); return d ? Math.min(15, Math.max(5, d)) : 0; };
  const autoSw = useRef<{ from: string; to: string } | null>(null);
  const deepPreset = useRef(new URLSearchParams(location.search).get('preset') ?? '');

  const photoOf = (c: BarLive) => !!c.files.video?.[0]?.photo;
  const durOf = (c: BarLive) => photoOf(c) ? Number(c.valOf('seconds')) || 5 : Math.min(c.files.video?.[0]?.sec ?? 0, LIMITS.maxSec);
  const seedance = (c: BarLive) => /seedance/i.test(c.prov);
  const imgOk = (c: BarLive) => !photoOf(c) || !caps.imageInputByProvider || caps.imageInputByProvider[c.prov] === true;
  const vrefSec = (c: BarLive) => (c.files.videoRefs ?? []).reduce((t, v) => t + (v.sec ?? 0), 0);
  /** spread the angles evenly over the clip (adding one re-splits; the ranges stay editable) */
  const split = (items: Omit<Angle, 'start' | 'end'>[], dur: number): Angle[] => { const n = items.length; const seg = dur / Math.max(1, n); return items.map((a, i) => ({ ...a, start: r1(i * seg), end: i === n - 1 ? r1(dur) : r1((i + 1) * seg) })); };
  const strip = (a: Angle[]) => a.map(({ start: _s, end: _e, ...x }) => x);
  const lastDur = useRef(0);
  const addAngle = (c: BarLive, name: string, at?: { yaw: number; tilt: number }) => { if (angles.length >= max) { toast(`Up to ${max} angles per run.`, 'warn'); return; }
    setAngles(split([...strip(angles), { angle: name, ...(at ? { yaw: at.yaw, tilt: at.tilt } : {}) }], durOf(c) || 0)); };
  const rangeErr = (dur: number) => angles.map((a, i) => !a.angle.trim() ? 'needs an angle' : !(a.end > a.start && a.start >= 0 && a.end <= dur + 0.05) ? `keep it within 0–${r1(dur)} s` : i > 0 && a.start < angles[i - 1].end - 0.05 ? 'overlaps the one before' : '');
  const upd = (i: number, p: Partial<Angle>) => setAngles(as => as.map((a, j) => j === i ? { ...a, ...p } : a));
  const nameOf = (a: Angle) => { const p = padPresets.find(x => x.yaw === a.yaw && x.tilt === a.tilt && (x.prompt ?? x.label) === a.angle); return p?.label ?? a.angle; };

  /* a new take (or a new photo length): the same angles, spread over the new length; ?preset=<angle> starts with that angle once a take is in */
  const syncDur = (c: BarLive) => { const d = durOf(c); if (!d || d === lastDur.current) return; lastDur.current = d;
    if (angles.length) setAngles(split(strip(angles), d));
    else if (deepPreset.current) { const p = presets.find(x => x.id === deepPreset.current); deepPreset.current = ''; if (p) setAngles([{ start: 0, end: r1(d), angle: p.prompt }]); } };
  const liveRef = useRef<BarLive | null>(null);
  useEffect(() => { if (liveRef.current) syncDur(liveRef.current); });

  const ex: BarExtra = {
    slotShown: (s, c) => isCrossView(c.prov) ? !['audio', 'refs'].includes(s.name) : s.name === 'audio' ? !(seedance(c) && c.valOf('generateAudio') === '1') : true,
    controlShown: (k, c) => !(isCrossView(c.prov) && ['angleCount', 'fullClip'].includes(k.field)),
    onSlot: (s, f, c) => { if (s.name !== 'video') return; const can = (id: string) => !caps.imageInputByProvider || caps.imageInputByProvider[id] === true;
      if (f.photo) { if (!imgProviders.length) { toast('Re-shoot needs a clip here: no model takes a photo yet.', 'warn'); return; }
        const to = imgProviders.find(id => c.providers.some(p => p.id === id)); if (!can(c.prov) && to) { autoSw.current = { from: c.prov, to }; c.setProvider(to); toast(`Switched to ${c.providers.find(p => p.id === to)?.name ?? to}: ${c.providers.find(p => p.id === c.prov)?.name ?? c.prov} needs a clip.`); } }
      else { const a = autoSw.current; autoSw.current = null; if (a && c.prov === a.to) c.setProvider(a.from); } },
    needs: c => { liveRef.current = c; const out: { missing: string; group?: string; slot?: string; model?: boolean }[] = []; const dur = durOf(c);
      if (isCrossView(c.prov)) { if (photoOf(c) && !imgOk(c)) out.push({ missing: 'H3 CrossView needs a clip, not a photo', model: true }); if (c.files.video?.length && rawDur(c) < 4) out.push({ missing: 'H3 CrossView needs a take of at least 4 s (padded to 5 s)', slot: 'video' }); return out; }
      if (photoOf(c) && !imgOk(c)) out.push({ missing: caps.imageInputReasonByProvider?.[c.prov] ? String(caps.imageInputReasonByProvider[c.prov]).replace(/\.$/, '') : 'This model needs a clip, not a photo', model: true });
      if (!angles.length && !c.prompt.trim()) out.push({ missing: 'Pick an angle, or describe one', group: 'angles' });
      if (c.files.video?.length && rangeErr(dur).some(Boolean)) out.push({ missing: 'Fix the angles’ time ranges', group: 'angles' });
      if (seedance(c) && vrefSec(c) > 15.1) out.push({ missing: 'Move clips add up to more than 15 s', slot: 'videoRefs' });
      return out; },
    form: (c): Record<string, string> => isCrossView(c.prov) ? { azimuth: String(cam.azimuth), elevation: String(cam.elevation), distance: String(cam.distance), angles: JSON.stringify([{ start: 0, end: Math.round(cvDur(c) * 10) / 10, yaw: cam.azimuth, tilt: cam.elevation }]), angleCount: '1', fullClip: '0' } : ({ angles: JSON.stringify(angles.map(a => typeof a.yaw === 'number' ? { start: a.start, end: a.end, yaw: a.yaw, tilt: a.tilt ?? 0 } : { start: a.start, end: a.end, angle: a.angle })) }),
    /* the old screen's quote: seconds (whole), passes = angles × (2 with full clips), a photo source, Seedance's move clips and sound, the batch */
    quote: c => { if (isCrossView(c.prov)) return { seconds: String(Math.round(cvDur(c) || 8)), passes: '1', angleCount: '1', sourceImage: null, refVideoSeconds: null, audio: c.valOf('generateAudio') === '1' ? '1' : null, angles: null, fullClip: null, generateAudio: null, width: null, height: null, sourceResolution: null };
      const photo = photoOf(c); const vs = vrefSec(c); return { seconds: String(photo ? Number(c.valOf('seconds')) || 5 : Math.round(durOf(c) || 8)), passes: String(Math.max(1, angles.length * (c.valOf('fullClip') === '1' ? 2 : 1))),
      sourceImage: photo ? '1' : null, refVideoSeconds: seedance(c) && vs ? String(r1(vs)) : null, audio: seedance(c) && c.valOf('generateAudio') === '1' ? '1' : null, angleCount: c.valOf('angleCount') || '1',
      angles: null, fullClip: null, generateAudio: null, width: null, height: null, sourceResolution: null }; },
    label: c => isCrossView(c.prov) ? 'Generate new angle' : !angles.length && c.prompt.trim() ? 'Generate new angle' : angles.length ? `Generate ${angles.length} angle${angles.length > 1 ? 's' : ''}` : undefined,
    onRecreate: f => { if (f.azimuth != null && f.azimuth !== '') setCam({ azimuth: Number(f.azimuth) || 0, elevation: Number(f.elevation) || 0, distance: Number(f.distance) || 1 }); try { const a = JSON.parse(f.angles ?? '[]'); if (Array.isArray(a) && a.length) setAngles(a.map((x: any) => ({ start: Number(x.start) || 0, end: Number(x.end) || 0, angle: String(x.angle ?? (typeof x.yaw === 'number' ? yawTiltWords(x.yaw, x.tilt ?? 0) : '')), ...(typeof x.yaw === 'number' ? { yaw: x.yaw, tilt: x.tilt ?? 0 } : {}) }))); } catch { /* no angles */ } },
    chips: c => { liveRef.current = c; const on = c.pop === 'g:angles';
      if (isCrossView(c.prov)) { const z = crossviewZone(cam.azimuth, cam.elevation); const sum = `${camWords(cam)} · ${zoneLabel[z]}`;
        return <button key="angles" ref={c.chipRef('angles')} type="button" className={`ic-chip wf-grp wf-fold${on ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={on} data-testid="vbar-group-angles" data-zone={z}
          aria-label={`New camera angle: ${sum}`} {...tip(on ? null : `New camera angle: ${sum}`)} onClick={() => c.setPop(on ? '' : 'g:angles')}><ReshootIcon size={14} /><span className="wf-grp-l">Angle</span><b>{camWords(cam)}</b><i className={`cv-dot ${z}`} aria-hidden /></button>; } const need = !angles.length && !c.prompt.trim(); const sum = angles.length ? angles.map(nameOf).join(' · ') : 'Pick angles';
      return <button key="angles" ref={c.chipRef('angles')} type="button" className={`ic-chip wf-grp wf-fold${on ? ' on' : ''}${need ? ' vbar-need' : ''}`} aria-haspopup="dialog" aria-expanded={on} data-testid="vbar-group-angles"
        aria-label={`Angles: ${sum}`} {...tip(on ? null : `Angles: ${sum}`)} onClick={() => c.setPop(on ? '' : 'g:angles')}><ReshootIcon size={14} /><span className="wf-grp-l">Angles</span><b>{sum}</b>{angles.length > 0 && <small className="vbar-count">{angles.length}/{max}</small>}</button>; },
    pops: c => { if (isCrossView(c.prov)) return <BarPopover key="angles" open={c.pop === 'g:angles'} anchor={c.anchorOf('angles')} avoid={c.dock} watch={c.dock} placement="top" gap={8} onClose={() => c.setPop('')} label="New camera angle" testId="vbar-pop-angles" width={400} className="vbar-angles-pop">
        <PopSection label="Camera" aside="One angle, whole take" testId="vbar-angles-cv"><CrossViewPad cam={cam} onChange={setCam} clipSec={rawDur(c)} /></PopSection></BarPopover>;
      const dur = durOf(c); const full = angles.length >= max; const errs = rangeErr(dur); const has = !!c.files.video?.length;
      const rest = presets.filter((p: any) => !padPresets.some(x => x.id === p.id && x.pad));
      const addPos = () => { const sn = nearestPreset(pos.yaw, pos.tilt, padPresets.filter(p => p.pad), space.snapDeg); addAngle(c, sn ? (sn.prompt ?? sn.label) : `camera ${yawTiltWords(pos.yaw, pos.tilt)}`, pos); };
      return <BarPopover key="angles" open={c.pop === 'g:angles'} anchor={c.anchorOf('angles')} avoid={c.dock} watch={c.dock} placement="top" gap={8} onClose={() => c.setPop('')} label="Angles" testId="vbar-pop-angles" width={400} className="vbar-angles-pop">
        <PopSection label="New camera angle" aside={`${angles.length}/${max}`} testId="vbar-angles-pad">
          {hasPad ? <><OrbitPad yaw={pos.yaw} tilt={pos.tilt} presets={padPresets} space={space} disabled={full} onChange={(y, t) => setPos({ yaw: y, tilt: t })} onPick={p => addAngle(c, p.prompt ?? p.label, { yaw: p.yaw, tilt: p.tilt })} />
            <div className="rs-nums" data-testid="rs-nums">{([['yaw', 'Rotation', space.yaw], ['tilt', 'Tilt', space.tilt]] as const).map(([k, l, r]) => <label key={k} className="rs-num"><span>{l}</span>
              <input type="range" className="rs-range" min={r.min} max={r.max} step={5} value={Math.round(pos[k])} disabled={full} aria-label={`${l} slider`} aria-valuetext={`${Math.round(pos[k])}°`} data-testid={`rs-range-${k}`} onChange={e => { const v = Number(e.target.value); setPos(q => ({ ...q, [k]: v })); }} />
              <input type="number" inputMode="numeric" min={r.min} max={r.max} step={1} value={Math.round(pos[k])} disabled={full} aria-label={`${l} in degrees`} data-testid={`rs-num-${k}`} onChange={e => { const v = Number(e.target.value); if (!Number.isFinite(v)) return; setPos(q => ({ ...q, [k]: Math.max(r.min, Math.min(r.max, v)) })); }} /><small aria-hidden>°</small></label>)}</div>
            <div className="vbar-angle-acts"><button type="button" className="vbar-add" data-testid="rs-add-pos" disabled={full} onClick={addPos}>{full ? `Up to ${max} angles` : '+ Add this angle'}</button>
              <button type="button" className="vbar-link" onClick={() => setPos({ yaw: 0, tilt: 0 })} disabled={pos.yaw === 0 && pos.tilt === 0}>Reset to front</button></div></> : null}
          {(hasPad ? rest : presets).length > 0 && <div className="vbar-quick" role="group" aria-label="More angles">{(hasPad ? rest : presets).map((p: any) => <button key={p.id} type="button" className="vbar-qchip" disabled={full} data-testid={`rs-preset-${p.id}`}
            onClick={() => addAngle(c, p.prompt, typeof p.yaw === 'number' && !p.move && (p.zoom ?? 1) === 1 ? { yaw: p.yaw, tilt: p.tilt ?? 0 } : undefined)}>+ {p.label}</button>)}</div>}
        </PopSection>
        <PopSection label="Your angles" aside={dur ? `${r1(dur)} s ${photoOf(c) ? 'shot' : 'clip'}` : undefined} testId="vbar-angles-list">
          {!angles.length ? <PopNote>No angles yet. Pick one above, or describe the angles in the prompt for one new angle over the whole {photoOf(c) ? 'shot' : 'clip'}.</PopNote> : <>
            {has && <AngleTimeline duration={dur || 0} angles={angles} onChange={upd} />}
            <ol className="vbar-angles">{angles.map((a, i) => <li key={i} className="vbar-angle" data-testid={`rs-angle-${i}`}>
              <i className="vbar-dot" style={{ background: COLORS[i % COLORS.length] }} aria-hidden /><span className="vbar-angle-n" title={a.angle}>{nameOf(a)}{typeof a.yaw === 'number' && <small> ↻ {fmtDeg(a.yaw)} · ↕ {fmtDeg(a.tilt ?? 0)}</small>}</span>
              <input type="number" min={0} step={0.1} value={a.start} aria-label={`Angle ${i + 1} start (s)`} onChange={e => upd(i, { start: Number(e.target.value) })} /><span aria-hidden>–</span>
              <input type="number" min={0} step={0.1} value={a.end} aria-label={`Angle ${i + 1} end (s)`} onChange={e => upd(i, { end: Number(e.target.value) })} />
              <button type="button" className="vbar-x" aria-label={`Remove angle ${i + 1}`} onClick={() => setAngles(split(strip(angles.filter((_, j) => j !== i)), dur || 0))}><CloseIcon size={10} strokeWidth={2.2} /></button>
              {errs[i] && <span className="vbar-angle-err" role="alert">Angle {i + 1}: {errs[i]}</span>}</li>)}</ol>
            {!has && <PopNote>Add your take: the ranges follow its length.</PopNote>}</>}
        </PopSection>
      </BarPopover>; },
    /* re-roll one output of a run made here: the cut (all ranges) or one angle's full clip, a new seed, linked to the run */
    viewerActions: (j, close, c, rerun, formOf) => { const fd0 = formOf(j.id); if (isCrossView(c.prov)) return null; const outs = (j as any).outputs as { label: string }[] | undefined; if (!fd0 || !outs || outs.length < 1) return null;
      let list: Angle[] = []; try { list = JSON.parse(String(fd0.get('angles') ?? '[]')); } catch { list = []; } if (!list.length) return null;
      const end = Math.max(...list.map(a => Number(a.end) || 0));
      return <>{outs.map((o, k) => <button key={k} type="button" className="am-item" role="menuitem" data-testid={`vv-reroll-${k}`} onClick={() => { close(); const f = new FormData(); fd0.forEach((v, key) => f.append(key, v));
        const l = k === 0 ? list : list[k - 1] ? [{ ...list[k - 1], start: 0, end: r1(end) }] : list; f.set('angles', JSON.stringify(l)); f.set('parentId', j.id); f.set('slot', String(k)); f.set('fullClip', '0'); f.set('seed', String(Math.floor(Math.random() * 1e6))); rerun(f); }}>
        Re-roll {o.label || (k === 0 ? 'the cut' : `angle ${k}`)}<small>New seed</small></button>)}</>; },
  };
  return ex;
};
