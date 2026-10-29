/**
 * Rig as a character (2026-10-27): the sheet that turns one of your 3D models into a character that walks, runs and dances. Free, in your
 * browser (rigCharacter.ts: Mesh2Motion's human skeleton, skin weights and CC0 moves). Three steps, then save:
 *  1 · Pick a body type: a person (the other body types are listed as coming soon). A model that already has bones and moves says so
 *      and can use its own moves.
 *  2 · Check the bones: the fitted joints over a see-through model; drag a joint (or select it and use the arrow keys) to nudge it, the
 *      other side follows when Mirror is on; turn the model if it doesn't face you; Undo and Reset. The fit says plainly what it couldn't find.
 *  3 · Pick moves: idle and walk always, plus jog, run, jump, dance, sit; picking one plays it on your character (reduced motion: a still
 *      and a Play button).
 *  Save keeps a new rigged GLB as a 3D result linked to the model (POST /api/3d/rig), with the time it took.
 * Used by the 3D viewer (Viewer3D's Rig tile, so the 3D page and Assets) and by Direct a Shot's Your 3D models (ModelEdit).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AnimationClip } from 'three';
import { RIG_MOVES, DEFAULT_RIG_MOVES, RIG_CLIP, M2M_COMMIT, NOT_A_PERSON, cleanMoves, type RigMoveId, type RigMeta } from '../../../../server/src/shared/previzRig';
import { JOINTS, type Joints, type FitReport } from './humanRig';
import { RigError, readModel, autoFit, skinAll, loadMoves, bakeClips, buildCharacter, exportGlb, saveCharacter, ownRoles, type RigModel } from './rigCharacter';
import { RigStage, jointLabel, type StageView } from './rigStage';
import { prefersReducedMotion } from '../HoverClip';
import { directShotHref } from '../workflowLinks';
import { goClick } from '../goToWorkflow';
import './rigSheet.css';

export interface RigSheetProps { src: string; name: string; /** the 3D job it came from (the new result links back to it) */ jobId?: string | null; /** the file's front, in radians (a placed model's turn) */ front?: number;
  onClose: () => void; /** saved: the new result (id, its GLB) */ onSaved?: (r: { id: string; url: string; name: string }) => void;
  /** Direct a Shot: put the saved character in the shot as the actor ("Use it in this shot") */ onUse?: (r: { id: string; url: string; name: string }) => void;
  /** a model that already has moves: play them as the actor */ onUseOwn?: () => void }
type Step = 'body' | 'bones' | 'skin' | 'moves' | 'saving' | 'done';
const BODIES = [{ id: 'human', label: 'Person', line: 'Two legs, two arms, a head', ok: true }, { id: 'four', label: 'Four legs', line: 'Dogs, foxes, horses', ok: false },
  { id: 'bird', label: 'Bird', line: 'Wings and two legs', ok: false }, { id: 'snake', label: 'Snake', line: 'A long body, no legs', ok: false }] as const;
const STEPS: [Step[], string][] = [[['body'], 'Body type'], [['bones', 'skin'], 'Bones'], [['moves', 'saving', 'done'], 'Moves']];
const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;

export function RigSheet({ src, name, jobId = null, front = 0, onClose, onSaved, onUse, onUseOwn }: RigSheetProps) {
  /* no claim on the one-live-viewer slot (model3d.tsx): Direct a Shot gives way to that slot, and the sheet opens from inside it */
  const canvas = useRef<HTMLCanvasElement>(null); const stage = useRef<RigStage | null>(null); const box = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('body'); const [model, setModel] = useState<RigModel | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>('Reading your model…');
  const [turn, setTurn] = useState(() => ((Math.round((front || 0) / (Math.PI / 2)) % 4) + 4) % 4);
  const [joints, setJoints] = useState<Joints | null>(null); const [report, setReport] = useState<FitReport | null>(null); const auto = useRef<Joints | null>(null); const undo = useRef<Joints[]>([]);
  const [view, setView] = useState<StageView>('front'); const [mirror, setMirror] = useState(true); const [hover, setHover] = useState<string | null>(null); const [sel, setSel] = useState<string | null>(null); const [nudged, setNudged] = useState(0);
  const [progress, setProgress] = useState(0); const [picked, setPicked] = useState<RigMoveId[]>(DEFAULT_RIG_MOVES); const [preview, setPreview] = useState<RigMoveId>('walk'); const [playing, setPlaying] = useState(!prefersReducedMotion());
  const built = useRef<{ clips: AnimationClip[]; char: ReturnType<typeof buildCharacter> } | null>(null); const ms = useRef({ fit: 0, skin: 0, bake: 0 }); const [saved, setSaved] = useState<{ id: string; url: string } | null>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  /* the stage lives as long as the sheet */
  useEffect(() => { if (!canvas.current) return; let s: RigStage; try { s = new RigStage(canvas.current); } catch { setErr('Your browser couldn’t start 3D here (WebGL is off). Nothing changed.'); return; }
    stage.current = s; s.onHover = setHover; const ro = new ResizeObserver(() => s.resize()); ro.observe(canvas.current); return () => { ro.disconnect(); s.dispose(); stage.current = null; }; }, []);
  /* read the model (again when it is turned) */
  useEffect(() => { let live = true; setBusy('Reading your model…'); setErr(null);
    readModel(src, turn).then((m) => { if (!live) return; setModel(m); setBusy(null); stage.current?.showModel(m, step !== 'body');
      /* fitted at once (a few ms): a model that isn't shaped like a person never gets the human skeleton */
      const f = timedFit(m); if (step === 'bones') { if (f.report.person) stage.current?.setJoints(f.joints, true); else { setStep('body'); stage.current?.showModel(m, false); } } })
      .catch((e) => { if (live) { setBusy(null); setErr(e instanceof RigError ? e.message : 'That model could not be read. Nothing changed.'); } });
    return () => { live = false; }; }, [src, turn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const s = stage.current; if (!s) return; s.mirror = mirror; }, [mirror]);
  useEffect(() => { stage.current?.setView(view); }, [view]);
  useEffect(() => { if (step === 'bones') stage.current?.highlight(sel); }, [sel, step]);
  useEffect(() => { requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()); }, [step]);

  const timedFit = (m: RigModel) => { const t0 = performance.now(); const f = autoFit(m); ms.current.fit = Math.round(performance.now() - t0); auto.current = f.joints; undo.current = []; setJoints(f.joints); setReport(f.report); setNudged(0); return f; };
  const blocked = !!model && !!report && !report.person;
  const toBones = () => { if (!model || !report?.person || !auto.current) return; setStep('bones'); stage.current?.showModel(model, true); setJoints(auto.current); undo.current = []; setNudged(0); stage.current?.setJoints(auto.current, true); };
  /* keep the drag's "before" in step with the latest joints (the stage's handlers close over the first render) */
  useEffect(() => { const s = stage.current; if (!s || step !== 'bones') return; let before: Joints | null = null;
    s.onChange = (j) => { if (!before) before = joints; setJoints(j); }; s.onDragEnd = () => { if (before) { undo.current.push(before); before = null; setNudged((n) => n + 1); } }; }, [joints, step]);
  const setAll = (j: Joints) => { setJoints(j); stage.current?.setJoints(j, true); };
  const doUndo = () => { const j = undo.current.pop(); if (j) { setAll(j); setNudged((n) => Math.max(0, n - 1)); } };
  const doReset = () => { if (auto.current) { if (joints) undo.current.push(joints); setAll(auto.current); setNudged(0); } };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (step === 'bones' && sel && /^Arrow/.test(e.key) && (e.target as HTMLElement).tagName !== 'INPUT') { e.preventDefault(); const d = e.shiftKey ? 0.03 : 0.008; if (joints) undo.current.push(joints);
      stage.current?.nudge(sel, e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0); setNudged((n) => n + 1); }
    if (step === 'bones' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
  };
  /* skin it: weights in the worker, then the moves baked and the character shown */
  const skinIt = async () => { if (!model || !joints || !report?.person) return; setStep('skin'); setProgress(0); setErr(null);
    try { const t0 = performance.now(); const skins = await skinAll(model, joints, report.pose !== 'T', (p) => setProgress(p)); ms.current.skin = Math.round(performance.now() - t0);
      const all = await loadMoves(); const char = buildCharacter(model, joints, skins); const clips = bakeClips(all, RIG_MOVES.map((m) => m.id), char.joints.pelvis[1]);
      built.current = { clips, char }; stage.current?.showCharacter(char.scene, clips); setStep('moves'); showMove('walk', playing); }
    catch (e) { setStep('bones'); setErr(e instanceof RigError ? e.message : 'The skin could not be painted on this model. Nothing changed. Try again.'); } };
  const clipFor = (id: RigMoveId) => { const mv = RIG_MOVES.find((m) => m.id === id)!; const role = mv.from[mv.from.length > 1 ? 1 : 0][1]; return built.current?.clips.find((c) => c.name === RIG_CLIP[role]) ?? null; };
  const showMove = (id: RigMoveId, play: boolean) => { setPreview(id); stage.current?.play(clipFor(id), play ? null : 0.35); };
  const toggleMove = (id: RigMoveId) => { const mv = RIG_MOVES.find((m) => m.id === id)!; if (!mv.always) setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); showMove(id, playing); };
  const save = async () => { const b = built.current; if (!b || !model || !report) return; setStep('saving'); setErr(null);
    try { const t0 = performance.now(); const moves = cleanMoves(picked); const keep = new Set(RIG_MOVES.filter((m) => moves.includes(m.id)).flatMap((m) => m.from.map(([, r]) => RIG_CLIP[r])));
      const clips = b.clips.filter((c) => keep.has(c.name)); stage.current?.play(clipFor('idle'), 0.2); const poster = await stage.current?.snapshot() ?? null;
      const glb = await exportGlb(b.char.scene, clips); ms.current.bake = Math.round(performance.now() - t0);
      const meta: RigMeta = { skeleton: 'human', moves, clips: clips.map((c) => c.name), bones: b.char.bones.length, meshes: model.parts.length, vertices: model.vertices, ms: ms.current,
        fit: { score: report.score, legs: report.legs, arms: report.arms, nudged }, src, srcJob: jobId, name, engine: { name: 'Mesh2Motion', commit: M2M_COMMIT } };
      const r = await saveCharacter(glb, meta, poster); setSaved(r); setStep('done'); onSaved?.({ ...r, name }); showMove(preview, playing); }
    catch (e) { setStep('moves'); setErr(e instanceof RigError ? e.message : 'The character could not be saved. Nothing changed. Try again.'); } };
  const total = ms.current.fit + ms.current.skin + ms.current.bake;
  const own = model?.own && model.own.clips.length ? model.own : null; const ownMoves = own ? Object.keys(ownRoles(own.clips)).length : 0;
  const stepNo = STEPS.findIndex(([s]) => s.includes(step));
  const label = sel ?? hover;

  return createPortal(<div className="dlg-scrim rig-scrim" onMouseDown={(e) => e.target === e.currentTarget && step !== 'skin' && step !== 'saving' && onClose()} onKeyDown={onKey}>
    <div ref={box} className="dlg rig" role="dialog" aria-modal="true" aria-labelledby="rig-t" data-testid="rig-sheet">
      <header className="rig-head">
        <div><h2 id="rig-t" className="dlg-t">Rig as a character</h2><p className="rig-sub">{name}: give it bones and moves, then direct it.</p></div>
        <ol className="rig-steps" aria-label="Steps">{STEPS.map(([, l], i) => <li key={l} className={i === stepNo ? 'on' : i < stepNo ? 'done' : ''} aria-current={i === stepNo ? 'step' : undefined}><b>{i + 1}</b>{l}</li>)}</ol>
        <button type="button" className="rig-x" onClick={onClose} aria-label="Close" data-testid="rig-close" disabled={step === 'saving'}>×</button>
      </header>
      <div className="rig-body">
        <div className="rig-stage" data-step={step}>
          <canvas ref={canvas} className="rig-canvas" data-testid="rig-canvas" aria-label={step === 'bones' ? 'The model with its bones. Drag a joint to move it; drag empty space to turn the view.' : 'Your character'} />
          {busy && <div className="rig-over" role="status"><i className="rig-spin" aria-hidden />{busy}</div>}
          {step === 'skin' && <div className="rig-over" role="status" data-testid="rig-skinning"><span>Painting the skin…</span><span className="rig-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span><small>{Math.round(progress * 100)}%</small></div>}
          {step === 'saving' && <div className="rig-over" role="status"><i className="rig-spin" aria-hidden />Saving your character…</div>}
          {step === 'bones' && label && <span className="rig-tag" aria-live="polite">{jointLabel(label)}</span>}
          {step === 'bones' && <div className="rig-tools" role="toolbar" aria-label="View">
            <div className="rig-seg" role="radiogroup" aria-label="View">{(['front', 'side'] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)} data-testid={`rig-view-${v}`}>{v === 'front' ? 'Front' : 'Side'}</button>)}</div>
            <button type="button" className="rig-tb" onClick={() => setTurn((t) => (t + 1) % 4)} data-testid="rig-turn" title="Turn the model a quarter turn if it doesn’t face you">Turn model</button>
            <label className="rig-tb rig-check"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} data-testid="rig-mirror" />Mirror</label>
            <button type="button" className="rig-tb" onClick={doUndo} disabled={!undo.current.length} data-testid="rig-undo">Undo</button>
            <button type="button" className="rig-tb" onClick={doReset} disabled={!nudged} data-testid="rig-reset">Reset</button></div>}
          {(step === 'moves' || step === 'done') && reduced && <button type="button" className="rig-play" onClick={() => { const p = !playing; setPlaying(p); showMove(preview, p); }} data-testid="rig-play">{playing ? 'Pause' : 'Play'}</button>}
        </div>
        <div className="rig-panel">
          {err && <p className="rig-err" role="alert" data-testid="rig-error">{err}</p>}
          {step === 'body' && <>
            <h3 className="rig-h">Pick a body type</h3>
            <div className="rig-bodies" role="radiogroup" aria-label="Body type">{BODIES.map((b) => { const can = b.ok && !blocked; return <button key={b.id} type="button" role="radio" aria-checked={can} disabled={!can} className={`rig-body-c${can ? ' on' : ''}`} data-testid={`rig-body-${b.id}`} data-autofocus={can ? '' : undefined}>
              <b>{b.label}</b><small>{b.line}</small>{!b.ok && <em>Coming soon</em>}</button>; })}</div>
            {blocked && <p className="rig-block" role="status" data-testid="rig-not-person">{NOT_A_PERSON}</p>}
            {own && <div className="rig-note" data-testid="rig-own"><b>It already has bones{ownMoves ? ` and ${own.clips.length} move${own.clips.length === 1 ? '' : 's'}` : ''}.</b>
              <span>{ownMoves ? `${own.clips.slice(0, 4).join(', ')}${own.clips.length > 4 ? ' and more' : ''}. It can play them in Direct a Shot as it is, or get new bones here.` : 'Rigging it again gives it a new skeleton and moves.'}</span>
              {onUseOwn && ownMoves > 0 && <button type="button" className="btn btn-sm" onClick={() => { onUseOwn(); onClose(); }} data-testid="rig-use-own">Use its own moves</button>}</div>}
            {!blocked && <p className="rig-line">A standing character works best: feet on the ground, arms out to the sides or down a little.</p>}
            <div className="rig-acts">{(err && !model) || blocked ? <button type="button" className="btn btn-sm" onClick={onClose} data-testid="rig-pick-another" data-autofocus="">Pick another model</button>
              : <button type="button" className="btn btn-sm btn-primary" disabled={!model || !!busy} onClick={toBones} data-testid="rig-fit">{own ? 'Rig it again' : 'Fit the bones'}</button>}</div>
          </>}
          {(step === 'bones' || step === 'skin') && <>
            <h3 className="rig-h">Check the bones</h3>
            {report && (report.problems.length ? <ul className="rig-warn" data-testid="rig-fit-problems">{report.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              : <p className="rig-ok" data-testid="rig-fit-ok">The bones fit. Drag any joint that sits outside the body.</p>)}
            <label className="rig-joint"><span>Joint</span><select value={sel ?? ''} onChange={(e) => setSel(e.target.value || null)} data-testid="rig-joint" disabled={step === 'skin'}>
              <option value="">Pick one to move with the arrow keys</option>{JOINTS.map((j) => <option key={j} value={j}>{jointLabel(j)}</option>)}</select></label>
            <p className="rig-line">Drag a joint in the view. Shift + arrows moves it further. {nudged ? `${nudged} nudge${nudged === 1 ? '' : 's'}.` : ''}</p>
            <div className="rig-acts"><button type="button" className="btn btn-sm btn-ghost" onClick={() => { setStep('body'); stage.current?.showModel(model, false); }} disabled={step === 'skin'}>Back</button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void skinIt()} disabled={step === 'skin' || !joints} data-testid="rig-skin" data-autofocus="">{step === 'skin' ? 'Skinning…' : 'Skin it'}</button></div>
          </>}
          {(step === 'moves' || step === 'saving' || step === 'done') && <>
            <h3 className="rig-h">{step === 'done' ? 'Your character is ready' : 'Pick moves'}</h3>
            <div className="rig-moves" role="group" aria-label="Moves">{RIG_MOVES.map((m) => { const on = picked.includes(m.id) || !!m.always;
              return <button key={m.id} type="button" aria-pressed={on} className={`rig-move${on ? ' on' : ''}${preview === m.id ? ' cur' : ''}`} disabled={step !== 'moves'} onClick={() => toggleMove(m.id)} onMouseEnter={() => step === 'moves' && showMove(m.id, playing)}
                data-testid={`rig-move-${m.id}`} title={m.always ? `${m.hint}. Always included.` : m.hint}><i aria-hidden>{on ? '✓' : '+'}</i>{m.label}</button>; })}</div>
            <p className="rig-chip" data-testid="rig-chip">Mesh2Motion · your computer · Free{total ? ` · rigged in ${secs(total)}` : ''}</p>
            {step === 'done' && saved ? <div className="rig-acts rig-done" data-testid="rig-done">
              {onUse ? <button type="button" className="btn btn-sm btn-primary" data-autofocus="" onClick={() => { onUse({ ...saved, name }); onClose(); }} data-testid="rig-use">Use it in this shot</button>
                : <a className="btn btn-sm btn-primary" data-autofocus="" href={directShotHref(saved.id)} onClick={(e) => { goClick(directShotHref(saved.id))(e); if (e.defaultPrevented) onClose(); }} data-testid="rig-direct">Direct it</a>}
              <a className="btn btn-sm" href={`/jobs/${saved.id}`} onClick={(e) => { goClick(`/jobs/${saved.id}`)(e); if (e.defaultPrevented) onClose(); }} data-testid="rig-open">Open it</a>
              <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Close</button></div>
              : <div className="rig-acts"><button type="button" className="btn btn-sm btn-ghost" onClick={() => { setStep('bones'); stage.current?.showModel(model, true); if (joints) stage.current?.setJoints(joints, true); }} disabled={step === 'saving'}>Back to the bones</button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => void save()} disabled={step === 'saving'} data-testid="rig-save" data-autofocus="">{step === 'saving' ? 'Saving…' : 'Save character'}</button></div>}
            {step === 'done' && <p className="rig-line">Saved to your 3D models, next to {name}.</p>}
          </>}
        </div>
      </div>
    </div></div>, document.body);
}
export default RigSheet;
