/**
 * Fly the camera (2026-10-24), the player's parts: the on-screen hints and record controls while flying (FlyHud), the row under the player
 * that lists your takes and cleans the chosen one up (TakesBar), and the top-down map you can drag (PathMap). All of them read and write the
 * one PlanShot (cameraPath, place) through onEditShot; the maths lives in server/src/shared/previzTemplates.ts.
 * Perform, then shoot (2026-10-26): the takes row groups each performance with its camera angles ("Performance 1 · Angle 2"), offers "Shoot this
 * performance" and Compare (AngleCompare: every angle at the same moment, side by side); the HUD gets the replay bar while you shoot.
 * Drive mode (2026-10-27): the HUD shows "C Get in" by the car, a speedometer and the car keys at the wheel, and a car picker while parked.
 * With a controller connected every hint shows the controller's buttons instead of keys (Xbox-style A / B / X / Y, LT / RT, sticks).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PopSection, Segmented } from '../BarPop';
import type { FlyMode } from './fly';
import { RIDES, rideOf } from '../../../../server/src/shared/previzVehicle';
import { ACTOR_ACTIONS, actorAllowed, actionPromptFor, actorAt, cleanNote, isPerformance, performanceGroups, NOTE_MAX, type ActorAction, type ActorBeat } from '../../../../server/src/shared/previzActor';
import { tip } from '../Tooltip';
import type { MapMark } from './world/CityMap';
import { askConfirm } from '../Dialog';
import { recipeOf } from '../../../../server/src/shared/previzCamera';
import { cameraAt, cameraPath as samplePath, rawTakePath, aimAt, aimOffset, camOffset, chosenTake, takeLength, takeShotSeconds, fitTakeSpeed, previzTime as fmtTime, previzTemplate, PREVIZ_MOVES, PREVIZ_SPEEDS,
  TAKE_MAX, TAKE_SPEED_MIN, TAKE_SPEED_MAX, TAKE_SMOOTH_DEFAULT, takeTimeAt, type CameraPose, type CameraTake, type PlanShot, type Vec3 } from '../../../../server/src/shared/previzTemplates';

export type EditShot = (f: (s: PlanShot) => PlanShot) => void;
/* a game pad, in the icon set's style (24 grid, 1.5 stroke) */
export const FlyIcon = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M7.5 7h9a4.5 4.5 0 0 1 4.4 5.5l-.9 4a2.3 2.3 0 0 1-4 .9L14.3 15.5H9.7L8 17.4a2.3 2.3 0 0 1-4-.9l-.9-4A4.5 4.5 0 0 1 7.5 7z" /><path d="M8 10v3M6.5 11.5h3" /><circle cx="15.5" cy="10.5" r=".6" fill="currentColor" /><circle cx="17" cy="12.5" r=".6" fill="currentColor" /></svg>;
const Key = ({ k, wide }: { k: string; wide?: boolean }) => <kbd className={`pv-key${wide ? ' pv-key-w' : ''}`}>{k}</kbd>;
/** a controller button, drawn like the pad: A B X Y as coloured rounds, LT RT LB RB as shoulder pills, LS RS sticks, the d-pad as an arrow */
const Btn = ({ b }: { b: string }) => <kbd className={`pv-pad pv-pad-${/^[ABXY]$/.test(b) ? b.toLowerCase() : /^[LR][TB]$/.test(b) ? 'sh' : /^[LR]S$/.test(b) ? 'st' : 'dp'}`} data-pad={b}>{b}</kbd>;
type HintRow = [ReactNode, string];

export type FlyPhase = 'free' | 'count' | 'rec';
/** Shooting a performance: its name, the number the next angle gets, the replay clock (take seconds between lo and hi), slow motion, look-at, paused */
export interface ShootHud { name: string; angle: number; u: number; lo: number; hi: number; rate: number; aim: boolean; paused: boolean }
export interface ShootCtl { restart(): void; pause(): void; seek(u: number): void; slow(): void; aim(): void }
interface HudProps { phase: FlyPhase; count: number; recT: number; dur: number; speed: number; hints: boolean; onHints: (open: boolean) => void; onRecord: () => void; onExit: () => void; full: boolean; note: string | null; narrow?: boolean;
  takeReady?: boolean; onUseTake?: () => void;
  /** game mode: Camera or Actor, whether this scene has room for a person, full screen, the mouse locked, a controller, the last saved take, the last acting beat */
  mode: FlyMode; canAct: boolean; onMode: (m: FlyMode) => void; flow: boolean; onFlow: () => void; locked: boolean; pad: string | null;
  saved: { n: number; len: number; at: number; label?: string; sub?: string } | null; activeAt: number; beat: { kind: ActorAction; at: number } | null; running: boolean;
  /** Perform, then shoot: shooting now (null = not), whether there is a performance to shoot, P / the button, the replay controls */
  shoot?: ShootHud | null; canShoot?: boolean; onShoot?: () => void; shootCtl?: ShootCtl;
  /** Drive mode: the car (null = no driving here), get in / out, pick another car (only while parked); sound mute */
  drive?: { inside: boolean; kmh: number; near: boolean; kit: string } | null; onRide?: () => void; onCarKit?: (k: string) => void; muted?: boolean; onMute?: () => void }
const CAMERA_KEYS: [ReactNode, string][] = [[<><Key k="W" /><Key k="A" /><Key k="S" /><Key k="D" /></>, 'Move'], [<><Key k="Q" /><Key k="E" /></>, 'Down / up'], [<span className="pv-key-drag">Mouse</span>, 'Look around'],
  [<Key k="Shift" wide />, 'Slow, precise'], [<span className="pv-key-drag">Scroll</span>, 'Flying speed'], [<><Key k="Z" /><Key k="X" /></>, 'Zoom in / out']];
const PAD_CAMERA: HintRow[] = [[<Btn b="LS" />, 'Move'], [<><Btn b="LT" /><Btn b="RT" /></>, 'Down / up'], [<Btn b="RS" />, 'Look around'], [<><Btn b="LB" /><Btn b="RB" /></>, 'Flying speed'], [<><Btn b="↑" /><Btn b="↓" /></>, 'Zoom in / out']];
const PAD_ACTOR: HintRow[] = [[<Btn b="LS" />, 'Walk'], [<Btn b="RB" />, 'Run (hold) · LS click toggles'], [<Btn b="RS" />, 'Turn the camera'], [<><Btn b="LT" /><Btn b="RT" /></>, 'Camera nearer / further'], [<><Btn b="X" /><Btn b="Y" /><Btn b="↑" /></>, 'Act: wave, jump, dance…']];
const CAR_KEYS: HintRow[] = [[<Key k="W" />, 'Gas'], [<Key k="S" />, 'Brake, then reverse'], [<><Key k="A" /><Key k="D" /></>, 'Steer'], [<Key k="Space" wide />, 'Handbrake'], [<Key k="H" />, 'Horn'], [<span className="pv-key-drag">Mouse</span>, 'Look around (it swings back)'], [<Key k="C" />, 'Get out']];
const PAD_CAR: HintRow[] = [[<Btn b="RT" />, 'Gas'], [<Btn b="LT" />, 'Brake, then reverse'], [<Btn b="LS" />, 'Steer'], [<><Btn b="RB" /><Btn b="X" /></>, 'Handbrake'], [<Btn b="LS" />, 'Horn (click)'], [<Btn b="RS" />, 'Look around (it swings back)'], [<><Btn b="Y" /><Btn b="B" /></>, 'Get out']];
const ACTOR_KEYS: [ReactNode, string][] = [[<><Key k="W" /><Key k="A" /><Key k="S" /><Key k="D" /></>, 'Walk'], [<Key k="Shift" wide />, 'Run (hold) · 2 toggles'], [<span className="pv-key-drag">Mouse</span>, 'Turn the camera'],
  [<span className="pv-key-drag">Scroll</span>, 'Camera nearer / further'], [<><Key k="1" /><Key k="…" /><Key k="6" /></>, 'Act: wave, dance, sit…']];
/** While flying: what is happening (flying / acting / 3-2-1 / REC + timer), Camera ↔ Actor, the action keys (Actor), Record / Stop / Leave,
 *  the key hints (a card the first time, then a line that fades once you move), "Take N saved", and in full screen a hint while the mouse is free. */
export function FlyHud({ phase, count, recT, dur, speed, hints, onHints, onRecord, onExit, takeReady, onUseTake, full, note, mode, canAct, onMode, flow, onFlow, locked, pad, saved, activeAt, beat, running, shoot, canShoot, onShoot, shootCtl, drive, onRide, onCarKit, muted, onMute }: HudProps) {
  const past = phase === 'rec' && recT > dur + 0.05 && !shoot; const pct = Math.min(100, (100 * recT) / Math.max(0.1, dur)); const acting = mode === 'actor';
  const idle = useIdle(activeAt, 3500); const beatOn = beat && Date.now() - beat.at < 1400 ? beat.kind : null;
  const P = !!pad; const driving = acting && !!drive?.inside; const car = drive ? rideOf(drive.kit) : null;
  /* the hints show the controller's buttons while one is connected */
  const K = (key: ReactNode, btn: ReactNode) => (P ? btn : key);
  const list = driving ? (P ? PAD_CAR : CAR_KEYS) : acting ? [...(P ? PAD_ACTOR : ACTOR_KEYS), ...(drive ? [[K(<Key k="C" />, <Btn b="Y" />), 'Get in the car (or bring it here)'] as HintRow] : [])]
    : shoot ? [...(P ? PAD_CAMERA : CAMERA_KEYS).slice(0, 3), ...SHOOT_KEYS] : P ? PAD_CAMERA : CAMERA_KEYS;
  return <>
    <div className="pv-fly-aim" aria-hidden />
    {hints && !flow ? <div className="pv-fly-keys" role="note" data-testid="pv-fly-keys" data-nofly="">
      <b>{driving ? `Drive the ${car!.label.toLowerCase()}` : acting ? 'Play the actor' : shoot ? 'Shoot the performance' : 'Fly like a game'}{P && <small className="pv-fly-keys-pad" data-testid="pv-keys-pad"><FlyIcon size={12} />Controller</small>}</b>
      <ul data-testid="pv-fly-keys-list" data-input={P ? 'pad' : 'keys'}>
        {list.map(([k, l]) => <li key={l}><span>{k}</span>{l}</li>)}
        <li><span>{K(<Key k="R" />, <Btn b="A" />)}</span>Record / stop</li>
        {canAct && <li><span>{K(<Key k="V" />, <Btn b="View" />)}</span>Camera ↔ Actor</li>}
        {(canShoot || shoot) && !acting && <li><span>{K(<Key k="P" />, <Btn b="Y" />)}</span>{shoot ? 'Stop shooting' : 'Shoot a performance'}</li>}
        <li><span>{K(<Key k="F" />, <Btn b="Menu" />)}</span>Full screen</li>
        {!(P && driving) && <li><span>{K(<Key k="Esc" wide />, <Btn b="B" />)}</span>Leave</li>}
      </ul>
      <p className="pv-fly-keys-p">{driving ? 'Arcade handling: steering softens at speed, the handbrake swings the tail. The take keeps the drive; the Render prompt says it.' : acting ? `The camera follows behind. Act with ${P ? 'X, Y and the d-pad' : '1–6'} while you record: the beats go into the Render prompt.${drive ? ` Walk up to the car and press ${P ? 'Y' : 'C'} to drive.` : ' Then P shoots it from new angles.'}` : shoot ? 'The performance replays while you fly. Each recording is a new angle of it, with the same beats.' : P ? 'Left stick keeps your height, like walking. The triggers change it.' : 'W keeps your height, like walking. Use Q and E to change it. A game controller works too.'}</p>
      <button type="button" className="pv-btn pv-btn-sm" onClick={() => onHints(false)} data-testid="pv-fly-keys-ok">Got it</button>
    </div> : !flow && <button type="button" className="pv-fly-keys-chip" onClick={() => onHints(true)} data-testid="pv-fly-keys-chip" {...tip('Show the keys')}><Key k="?" />Keys</button>}
    <div className={`pv-fly-status${phase === 'rec' ? ' rec' : ''}`} role="status" aria-live="polite" data-testid="pv-fly-status">
      {phase === 'rec' ? <><span className="pv-rec-dot" aria-hidden /><b className="pv-rec-k">REC</b><span className="pv-fly-time" data-testid="pv-rec-time">{fmtTime(recT)} / {fmtTime(dur)}</span></>
        : phase === 'count' ? <><b>Get ready</b><span className="pv-fly-time">{shoot ? `action in ${count}` : `the shot starts in ${count}`}</span></>
        : shoot ? <><CameraIcon size={14} /><b>Shooting</b><span className="pv-fly-time" data-testid="pv-shoot-name">{shoot.name} · Angle {shoot.angle}</span></>
        : driving ? <><CarIcon size={14} /><b>Driving</b><span className="pv-fly-time" data-testid="pv-drive-kmh">{drive!.kmh} km/h</span></>
        : acting ? <><ActorIcon size={14} /><b>Acting</b><span className="pv-fly-time">{running ? 'Running' : 'Walking'}</span></>
        : <><FlyIcon size={14} /><b>Flying</b><span className="pv-fly-time" {...tip('Scroll to change the flying speed. Hold Shift for slow, precise moves.')} data-testid="pv-fly-speed">{speed.toFixed(1)} m/s</span></>}
      {pad && <span className="pv-pad-dot" {...tip(`${pad} connected`)} data-testid="pv-pad"><FlyIcon size={12} /></span>}
      {phase === 'rec' && <span className="pv-fly-prog" aria-hidden><i style={{ width: `${pct}%` }} /></span>}
    </div>
    {canAct && <div className="pv-mode" role="radiogroup" aria-label="What you control" data-testid="pv-mode" data-nofly="">
      <button type="button" role="radio" aria-checked={!acting} className={!acting ? 'on' : ''} onClick={() => onMode('camera')} data-testid="pv-mode-camera" {...tip('Fly the camera (V)')}><FlyIcon size={13} />Camera</button>
      <button type="button" role="radio" aria-checked={acting} className={acting ? 'on' : ''} onClick={() => onMode('actor')} data-testid="pv-mode-actor" {...tip('Play the person, third-person: the camera follows (V)')}><ActorIcon size={13} />Actor</button></div>}
    {acting && !driving && <div className="pv-acts" data-testid="pv-acts" data-nofly="">{ACTOR_ACTIONS.map((a) => <span key={a.id} className={`pv-act${beatOn === a.id || (a.id === 'run' && running) ? ' on' : ''}`} data-testid={`pv-act-${a.id}`} {...tip(`${a.label} (${a.key}${a.pad ? ` · controller ${a.pad}` : ''})`)}>{P && a.pad ? <Btn b={a.pad} /> : <Key k={a.key} />}{a.label}</span>)}</div>}
    {driving && <div className="pv-speedo" data-testid="pv-speedo" aria-hidden><b>{drive!.kmh}</b><small>km/h</small><span className="pv-speedo-bar"><i style={{ width: `${Math.min(100, (100 * drive!.kmh) / (car!.top * 3.6))}%` }} /></span></div>}
    {acting && drive && (driving || drive.near) && phase !== 'count' && <button type="button" className={`pv-ride${driving ? ' in' : ''}`} onClick={onRide} data-nofly="" data-testid={driving ? 'pv-get-out' : 'pv-get-in'} {...tip(driving ? 'Get out (C)' : `Get in the ${car!.label.toLowerCase()} (C)`)}>
      {driving ? K(<Key k="C" />, <Btn b="B" />) : K(<Key k="C" />, <Btn b="Y" />)}{driving ? 'Get out' : `Get in the ${car!.label.toLowerCase()}`}</button>}
    {acting && drive && !driving && !drive.near && phase === 'free' && onCarKit && <div className="pv-cars" role="group" aria-label="Your car" data-testid="pv-cars" data-nofly="">
      <span className="pv-cars-l"><CarIcon size={13} />{K(<Key k="C" />, <Btn b="Y" />)}</span>
      <select value={drive.kit} onChange={(e) => onCarKit(e.target.value)} aria-label="Your car" data-testid="pv-car-pick" {...tip('Your car. C brings it beside you and gets in')}>{RIDES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>}
    {onMute && <button type="button" className={`pv-mute${muted ? ' off' : ''}`} onClick={onMute} aria-pressed={!muted} aria-label={muted ? 'Sound off' : 'Sound on'} data-nofly="" data-testid="pv-mute" {...tip(muted ? 'Sound is off. Click for the city, steps and engine' : 'Sound on: city, steps, engine. Click to mute')}><SoundIcon off={!!muted} /></button>}
    {phase === 'count' && <div className="pv-fly-count" aria-hidden key={count}>{count}</div>}
    {(past || note) && <div className="pv-fly-note" role="status" data-testid="pv-fly-note">{past ? 'Past the end of the shot. Keep going or stop: you can trim it later.' : note}</div>}
    {saved && !takeReady && <div className="pv-saved" role="status" key={saved.at} data-testid="pv-saved"><StepTick /><b>{saved.label ?? `Take ${saved.n} saved`}</b><small>{saved.sub ?? `${saved.len.toFixed(1)} s · keep going, R records the next`}</small></div>}
    {shoot && shootCtl && <ShootBar shoot={shoot} ctl={shootCtl} rec={phase !== 'free'} />}
    {flow && !locked && !note && !past && <div className="pv-unlocked" data-testid="pv-unlocked" aria-hidden>Click to look around · <Key k="Esc" wide /> to leave full screen</div>}
    {flow && <div className={`pv-hintline${idle ? '' : ' faded'}`} data-testid="pv-hintline" aria-hidden>
      {driving ? (P ? <><span><Btn b="RT" />gas</span><span><Btn b="LT" />brake</span><span><Btn b="LS" />steer</span><span><Btn b="B" />get out</span></> : <><span><Key k="W" />gas</span><span><Key k="S" />brake</span><span><Key k="A" /><Key k="D" />steer</span><span><Key k="Space" wide />handbrake</span><span><Key k="C" />get out</span></>)
        : acting ? (P ? <><span><Btn b="LS" />walk</span><span><Btn b="RB" />run</span><span><Btn b="X" /><Btn b="Y" />act</span>{drive && <span><Btn b="Y" />car (by it)</span>}</> : <><span><Key k="W" /><Key k="A" /><Key k="S" /><Key k="D" />walk</span><span><Key k="Shift" wide />run</span><span><Key k="1" />–<Key k="6" />act</span>{drive && <span><Key k="C" />car</span>}</>)
        : shoot ? <><span><Key k="Space" wide />restart</span><span><Key k="T" />slow motion</span><span><Key k="L" />look at</span><span><Key k="P" />stop shooting</span></>
        : <><span><Key k="W" /><Key k="A" /><Key k="S" /><Key k="D" />move</span><span><Key k="Q" /><Key k="E" />down / up</span><span>scroll speed</span></>}
      <span>{K(<Key k="R" />, <Btn b="A" />)}{shoot ? 'record angle' : 'record'}</span>{canAct && !shoot && <span>{K(<Key k="V" />, <Btn b="View" />)}{acting ? 'camera' : 'actor'}</span>}{canShoot && !shoot && <span>{K(<Key k="P" />, <Btn b="Y" />)}shoot it</span>}<span><Key k="Esc" wide />{locked ? 'free the mouse' : 'leave'}</span></div>}
    <div className="pv-fly-acts" data-nofly="">
      {phase === 'free' && flow && takeReady && onUseTake && <button type="button" className="pv-fly-rec" onClick={onUseTake} data-testid="pv-use-take-full">Use take → Mockup</button>}
      {phase === 'free' ? <button type="button" className={`pv-fly-rec${takeReady ? ' pv-fly-again' : ''}`} onClick={onRecord} disabled={full} data-testid="pv-fly-record" {...tip(full ? `${TAKE_MAX} takes is the most. Delete one under the player first.` : shoot ? `After 3, 2, 1 ${shoot.name} plays from the top while you fly; it stops at its end. (R)` : 'Starts after 3, 2, 1. Keeps your movement as an editable take, not a video. (R)')}><span className="pv-fly-rec-ic" aria-hidden />{shoot ? `Record angle ${shoot.angle}` : acting ? 'Record performance' : 'Record camera take'}</button>
        : <button type="button" className="pv-fly-rec on" onClick={onRecord} data-testid="pv-fly-stop" {...tip(phase === 'count' ? 'Cancel (R)' : 'Stop and keep this take (R)')}><span className="pv-fly-stop-ic" aria-hidden />{phase === 'count' ? 'Cancel' : 'Stop'}</button>}
      {phase === 'free' && (shoot || canShoot) && onShoot && <button type="button" className={`pv-btn pv-btn-glass pv-shoot-btn${shoot ? ' on' : ''}`} onClick={onShoot} data-testid="pv-fly-shoot" {...tip(shoot ? 'Stop shooting: back to flying freely (P)' : 'Replay your performance and shoot it with the camera, angle after angle (P)')}><CameraIcon size={14} />{shoot ? 'Done shooting' : 'Shoot it'}</button>}
      {phase !== 'rec' && !flow && <button type="button" className="pv-btn pv-btn-glass pv-fly-full" onClick={onFlow} data-testid="pv-fly-flow" aria-label="Full screen" {...tip('Full screen, the mouse locked like a game (F)')}><FullIcon /></button>}
      {phase !== 'rec' && <button type="button" className="pv-btn pv-btn-glass" onClick={onExit} data-testid="pv-fly-exit" {...tip(phase === 'count' ? 'Cancel the take (Esc)' : flow ? 'Leave full screen (Esc)' : 'Back to the planned shot (Esc)')}>{phase === 'count' ? 'Cancel (Esc)' : flow ? 'Exit full screen' : 'Leave (Esc)'}</button>}
    </div>
  </>;
}
/** true while the last activity is older than ms (the hint line shows when you stop, fades while you play) */
function useIdle(activeAt: number, ms: number) { const [, force] = useState(0);
  useEffect(() => { if (!activeAt) return; const id = window.setTimeout(() => force((x) => x + 1), ms + 30); return () => clearTimeout(id); }, [activeAt, ms]);
  return !activeAt || Date.now() - activeAt > ms; }
const SHOOT_KEYS: [ReactNode, string][] = [[<Key k="Space" wide />, 'Restart the performance'], [<Key k="T" />, 'Slow motion (½×)'], [<Key k="L" />, 'Look at the person: A / D orbit, Q / E crane']];
/* a film camera, in the icon set's style (24 grid, 1.5 stroke) */
export const CameraIcon = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <rect x="3" y="8" width="12" height="10" rx="2" /><path d="m15 11.5 5.5-3v9l-5.5-3" /><circle cx="6.5" cy="5" r="2" /><circle cx="11.5" cy="5" r="2" /></svg>;
/** While shooting a performance: restart, play / pause, the replay scrubber (take time), slow motion and look-at. Locked while a take counts in or records. */
function ShootBar({ shoot, ctl, rec }: { shoot: ShootHud; ctl: ShootCtl; rec: boolean }) {
  const len = Math.max(0.01, shoot.hi - shoot.lo); const pct = Math.max(0, Math.min(100, (100 * (shoot.u - shoot.lo)) / len));
  return <div className={`pv-shoot${rec ? ' rec' : ''}`} data-testid="pv-shoot-bar" data-nofly="">
    <button type="button" className="pv-shoot-b" onClick={ctl.restart} disabled={rec} aria-label="Restart the performance" data-testid="pv-shoot-restart" {...tip('Restart the performance (Space)')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4v4.5h4.5" /></svg></button>
    <button type="button" className="pv-shoot-b" onClick={ctl.pause} disabled={rec} aria-label={shoot.paused ? 'Play the performance' : 'Pause the performance'} data-testid="pv-shoot-pause" {...tip(shoot.paused ? 'Play the performance' : 'Pause it to line up a frame')}>
      {shoot.paused ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13l10.5-6.5z" /></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M8.5 5.5v13M15.5 5.5v13" /></svg>}</button>
    <span className="pv-shoot-scrub"><input type="range" min={shoot.lo} max={shoot.hi} step={0.01} value={shoot.u} disabled={rec} aria-label="Move through the performance" data-testid="pv-shoot-scrub" style={{ ['--pv-k' as any]: `${pct}%` }} onChange={(e) => ctl.seek(Number(e.target.value))} /></span>
    <span className="pv-shoot-t" data-testid="pv-shoot-time">{fmtTime(shoot.u - shoot.lo)} / {fmtTime(len)}</span>
    <button type="button" className={`pv-shoot-chip${shoot.rate < 1 ? ' on' : ''}`} onClick={ctl.slow} disabled={rec} aria-pressed={shoot.rate < 1} data-testid="pv-shoot-slow" {...tip('Slow motion while you shoot: the performance plays at half speed, the angle still plays back at real speed (T)')}>{shoot.rate < 1 ? '½×' : '1×'}</button>
    <button type="button" className={`pv-shoot-chip${shoot.aim ? ' on' : ''}`} onClick={ctl.aim} aria-pressed={shoot.aim} data-testid="pv-shoot-aim" {...tip('Keep the camera turned to the person: A / D orbit, Q / E crane, W / S dolly (L)')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>Look at</button>
  </div>;
}
/* a car, in the icon set's style (24 grid, 1.5 stroke) */
export const CarIcon = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M4 15.5V12l2-4.5A2 2 0 0 1 7.8 6.3h8.4A2 2 0 0 1 18 7.5l2 4.5v3.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M4.5 12h15" /><circle cx="7.5" cy="16.5" r="1.8" /><circle cx="16.5" cy="16.5" r="1.8" /></svg>;
/* a speaker, on or crossed out */
const SoundIcon = ({ off }: { off: boolean }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />{off ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" /></>}</svg>;
const FullIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>;
const StepTick = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
/* a person, in the icon set's style (24 grid, 1.5 stroke) */
export const ActorIcon = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <circle cx="12" cy="5" r="2.2" /><path d="M8 21l2.2-6.5L9 10.5l3-1.5 3 1.5-1.2 4L16 21" /><path d="M9 10.5 6.5 13M15 10.5l2.5 2.5" /></svg>;

/** The take a card stands for: the preset move (null) or one of your takes. */
export type TakeRef = CameraTake | null;
const takeKind = (k: CameraTake) => (k.shoot ? 'angle' : k.actor ? 'perf' : 'flown') as 'angle' | 'perf' | 'flown';
const takeLabel = (k: CameraTake) => (k.shoot ? (k.recipe ? (recipeOf(k.recipe.id)?.label ?? k.name) : `Angle ${k.shoot.angle}`) : k.name);
/** what makes a take's picture change (thumbnails and Compare redraw when it does): the clean-up, a recipe's lens / size, the keys */
const takeSig = (k: CameraTake) => [k.id, k.smooth, k.trimStart, k.trimEnd, k.speed, k.keys.length, k.keys[0]?.pos.join(':'), k.recipe ? `${k.recipe.id}:${k.recipe.lens}:${k.recipe.size}` : ''].join(',');
/** Mockup step (2026-10-26, the single floating bar): every camera source as a card with a small picture drawn from the shot itself (snap, the
 *  player's engine, like Compare), its kind and length. Click a card to use it; the chosen one is ringed in orange. "New take" opens Fly / Act. */
export function TakeStrip({ shot, onEditShot, disabled, snap, ready, onNew, newOpen, newRef }: { shot: PlanShot; onEditShot: EditShot; disabled: boolean; ready: boolean;
  snap: (jobs: { shot: PlanShot; canvas: HTMLCanvasElement }[], t: number) => void; onNew: () => void; newOpen: boolean; newRef: RefObject<HTMLButtonElement> }) {
  const takes = shot.cameraPath?.takes ?? []; const take = chosenTake(shot); const move = PREVIZ_MOVES.find((m) => m.id === shot.move);
  const groups = performanceGroups(takes); const order: CameraTake[] = []; const seen = new Set<string>();
  /* a performance sits right before its angles; flown takes in the order you made them */
  for (const k of takes) { if (seen.has(k.id)) continue; const g = groups.find((x) => x.perf.id === k.id || x.angles.some((a) => a.id === k.id));
    if (g) { for (const x of [g.perf, ...g.angles]) if (!seen.has(x.id)) { seen.add(x.id); order.push(x); } } else { seen.add(k.id); order.push(k); } }
  const choose = (id: string | null) => onEditShot((s) => (s.cameraPath ? { ...s, cameraPath: { ...s.cameraPath, chosen: id } } : s));
  const cvs = useRef(new Map<string, HTMLCanvasElement>()); const [aw, ah] = shot.aspect.split(':').map(Number); const H = 44, W = Math.round((H * aw) / ah);
  const key = [shot.template, shot.seed, shot.colour, shot.move, shot.speed, shot.aspect, shot.seconds, JSON.stringify(shot.place ?? null), JSON.stringify(shot.props ?? null), shot.lens ?? '', shot.size ?? '', JSON.stringify(shot.shake ?? null), ...takes.map(takeSig)].join('|');
  /* drawn twice: once at once, once more when a big scene (the open city) has finished loading its pieces */
  useEffect(() => { if (!ready) return; const go = () => { const jobs = [{ id: '__preset', k: null as CameraTake | null }, ...order.map((k) => ({ id: k.id, k }))]
      .map((j) => ({ shot: { ...shot, cameraPath: shot.cameraPath ? { takes, chosen: j.k ? j.k.id : null } : undefined } as PlanShot, canvas: cvs.current.get(j.id)! })).filter((j) => j.canvas);
    snap(jobs, shot.seconds * 0.25); }; const a = window.setTimeout(go, 260), b = window.setTimeout(go, 2600); return () => { clearTimeout(a); clearTimeout(b); }; }, [key, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const canvas = (id: string) => <canvas width={W * 2} height={H * 2} style={{ width: W, height: H }} ref={(el) => { if (el) cvs.current.set(id, el); else cvs.current.delete(id); }} aria-hidden />;
  const card = (id: string | null, k: CameraTake | null, icon: ReactNode, label: string, len: string, hint: string) => {
    const on = (k?.id ?? null) === (take?.id ?? null);
    return <button key={id ?? 'preset'} type="button" role="radio" aria-checked={on} className={`pv-tk${on ? ' on' : ''}${k?.shoot ? ' pv-tk-angle' : ''}`} onClick={() => choose(id)} disabled={disabled}
      data-testid={id ? `pv-take-${id}` : 'pv-take-preset'} aria-label={`${label}, ${len}`} {...tip(hint)}>
      <span className="pv-tk-th" style={{ width: W }}>{canvas(id ?? '__preset')}<i className="pv-tk-ic" aria-hidden>{icon}</i><em className="pv-tk-len">{len}</em></span>
      <span className="pv-tk-n">{label}</span></button>; };
  return <div className="pv-strip" role="radiogroup" aria-label="Takes: which camera the mockup uses" data-testid="pv-takes">
    {card(null, null, <CameraIcon size={11} />, `${move?.label ?? 'Preset'} move`, `${shot.seconds} s`, `The preset ${move?.label.toLowerCase() ?? ''} move. Edit take changes the move and its speed.`)}
    {order.map((k) => { const kind = takeKind(k);
      return card(k.id, k, kind === 'perf' ? <ActorIcon size={11} /> : kind === 'angle' || k.recipe ? <CameraIcon size={11} /> : <FlyIcon size={11} />, takeLabel(k), `${(kind === 'flown' && !k.actor ? takeLength(k) : takeShotSeconds(k)).toFixed(1)} s`,
        kind === 'perf' ? `${k.name}: a performance you played (the person and the follow camera). Edit take shoots it from new angles.` : k.recipe ? `${k.name}: a shot recipe${k.shoot ? ' filming the performance' : ''}. Camera › Lens & size changes its lens and framing.` : kind === 'angle' ? `${k.name}: a camera you flew while the performance replayed${k.shoot!.rate < 1 ? ` (shot at ${k.shoot!.rate}×)` : ''}` : `${k.name}: a camera move you flew${k.actor ? ', with the person' : ''}`); })}
    <button ref={newRef} type="button" className={`pv-tk pv-tk-new${newOpen ? ' on' : ''}`} onClick={onNew} disabled={disabled || takes.length >= TAKE_MAX} aria-haspopup="menu" aria-expanded={newOpen} data-testid="pv-take-new"
      {...tip(takes.length >= TAKE_MAX ? `${TAKE_MAX} takes is the most. Delete one first.` : 'Fly a new camera take or play the actor')}><span className="pv-tk-th" style={{ width: H }}><PlusIcon /></span><span className="pv-tk-n">New</span></button>
    {!takes.length && <span className="pv-strip-hint" data-testid="pv-takes-empty">No takes of your own yet. <b>New</b> flies the camera or plays the actor; the preset move works too.</span>}
  </div>;
}
const PlusIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>;

/** Edit take (a popover from the Mockup bar): the chosen take's clean-up (Steady-cam, smoothing, trim, speed, fit to shot), a performance's beats with
 *  their "how?" notes and the Render prompt they make, Shoot this performance, Compare angles and Delete. On the preset move: the move and its speed. */
export function EditTake({ shot, onEditShot, disabled, onShoot, onCompare, comparing, onDone }: { shot: PlanShot; onEditShot: EditShot; disabled: boolean;
  onShoot: (perfId: string) => void; onCompare?: (perfId: string) => void; comparing?: string | null; onDone: () => void }) {
  const cp = shot.cameraPath; const takes = cp?.takes ?? []; const take = chosenTake(shot); const full = takes.length >= TAKE_MAX;
  const setTake = (patch: Partial<CameraTake>) => onEditShot((s) => !s.cameraPath ? s : { ...s, cameraPath: { ...s.cameraPath, takes: s.cameraPath.takes.map((x) => (x.id === s.cameraPath!.chosen ? { ...x, ...patch } : x)) } });
  const del = async (k: CameraTake) => {
    const angles = isPerformance(k) ? takes.filter((x) => x.shoot?.of === k.id).length : 0;
    if (!(await askConfirm({ title: `Delete ${k.name}?`, body: [k.id === cp?.chosen ? 'The camera goes back to the preset move.' : '', angles ? `Its ${angles === 1 ? 'angle stays' : `${angles} angles stay`}: ${angles === 1 ? 'it keeps' : 'they keep'} the person.` : '', 'You can’t undo this.'].filter(Boolean).join(' '), confirm: 'Delete take', cancel: 'Keep', danger: true }))) return;
    onEditShot((s) => { const left = (s.cameraPath?.takes ?? []).filter((x) => x.id !== k.id); const { cameraPath: _old, ...rest } = s; void _old;
      return left.length ? { ...rest, cameraPath: { takes: left, chosen: s.cameraPath?.chosen === k.id ? null : s.cameraPath?.chosen ?? null } } : rest; });
    onDone(); };
  if (!take) return <div className="pv-edit" data-testid="pv-edit">
    <div className="pv-edit-h"><b>Preset move</b><small>The camera move the scene comes with</small></div>
    <PopSection label="Camera move"><Segmented label="Camera move" value={shot.move} cols={2} testId="pv-edit-move" onChange={(v) => onEditShot((s) => ({ ...s, move: v }))} options={PREVIZ_MOVES.map((m) => ({ value: m.id, label: m.label, hint: m.hint, testId: `pv-edit-move-${m.id}` }))} /></PopSection>
    <PopSection label="Speed"><Segmented label="Speed" value={shot.speed} testId="pv-edit-speed" onChange={(v) => onEditShot((s) => ({ ...s, speed: v }))} options={PREVIZ_SPEEDS.map((x) => ({ value: x.id, label: x.label, testId: `pv-edit-speed-${x.id}` }))} /></PopSection>
  </div>;
  const perf = isPerformance(take) ? take : take.shoot ? takes.find((k) => k.id === take.shoot!.of) ?? null : null; const angles = perf ? takes.filter((x) => x.shoot?.of === perf.id).length : 0;
  const sub = take.shoot ? `${perf?.name ?? 'Performance'} · Angle ${take.shoot.angle}` : isPerformance(take) ? 'A performance you played' : take.actor ? 'A take with the person' : 'A camera move you flew';
  return <div className="pv-edit" data-testid="pv-edit">
    <div className="pv-edit-h"><b title={take.name} data-testid="pv-edit-name">{take.name}</b><small>{sub} · {takeShotSeconds(take).toFixed(1)} s</small></div>
    <CleanUp take={take} seconds={shot.seconds} set={setTake} disabled={disabled} />
    {take.actor && <Beats shot={shot} take={take} set={setTake} disabled={disabled} />}
    <div className="pv-edit-acts">
      {perf && <button type="button" className="pv-btn" onClick={() => onShoot(perf.id)} disabled={disabled || full} data-testid={`pv-shoot-${perf.id}`} {...tip(full ? `${TAKE_MAX} takes is the most. Delete one first.` : `Replay ${perf.name} and fly the camera around it: each recording is a new angle (P)`)}><CameraIcon size={14} />{angles ? 'Shoot another angle' : 'Shoot this performance'}<Key k="P" /></button>}
      {perf && angles > 0 && onCompare && <button type="button" className={`pv-btn${comparing === perf.id ? ' on' : ''}`} onClick={() => onCompare(perf.id)} aria-pressed={comparing === perf.id} data-testid={`pv-compare-${perf.id}`} {...tip('See every angle at the same moment, side by side')}><CompareIcon />Compare</button>}
      <button type="button" className="pv-btn pv-btn-ghost pv-btn-danger" onClick={() => void del(take)} disabled={disabled} data-testid={`pv-take-del-${take.id}`}>Delete</button></div>
  </div>;
}
const CompareIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="8" height="14" rx="1.5" /><rect x="13" y="5" width="8" height="14" rx="1.5" /></svg>;

/** Compare angles: the performance and each of its angles drawn at the same moment of the shot (follows play and scrub), side by side. Click one to
 *  use it. snap draws every tile in one go through the player's engine. */
export function AngleCompare({ shot, perfId, t, playing, snap, onPick, onClose }: { shot: PlanShot; perfId: string; t: number; playing: boolean;
  snap: (jobs: { shot: PlanShot; canvas: HTMLCanvasElement }[], t: number) => void; onPick: (id: string) => void; onClose: () => void }) {
  const takes = shot.cameraPath?.takes ?? []; const g = performanceGroups(takes).find((x) => x.perf.id === perfId); const list = g ? [g.perf, ...g.angles] : [];
  const cvs = useRef(new Map<string, HTMLCanvasElement>()); const [aw, ah] = shot.aspect.split(':').map(Number); const W = 320, H = Math.round((320 * ah) / aw / 2) * 2;
  const lastAt = useRef(0); const pend = useRef(0); const chosen = shot.cameraPath?.chosen;
  const key = [...list.map(takeSig), JSON.stringify(shot.shake ?? null)].join('|');
  useEffect(() => { const run = () => { lastAt.current = performance.now(); const jobs = list.map((k) => ({ shot: { ...shot, cameraPath: { takes, chosen: k.id } } as PlanShot, canvas: cvs.current.get(k.id)! })).filter((j) => j.canvas); snap(jobs, t); };
    const wait = playing ? 140 - (performance.now() - lastAt.current) : 30; clearTimeout(pend.current); pend.current = window.setTimeout(run, Math.max(0, wait));
    return () => clearTimeout(pend.current); }, [t, key, shot.template, shot.seed, shot.colour, shot.aspect, shot.seconds, playing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!g) return null;
  return <div className="pv-compare" data-testid="pv-compare" role="group" aria-label={`${g.perf.name}: angles side by side`}>
    <div className="pv-compare-h"><b>{g.perf.name}</b><span>{list.length} views at {fmtTime(t)} · click one to use it</span>
      <button type="button" className="pv-take-x pv-compare-x" onClick={onClose} aria-label="Close the comparison" data-testid="pv-compare-close"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button></div>
    <div className="pv-compare-grid" style={{ ['--pv-ar' as any]: `${aw / ah}` }}>
      {list.map((k) => <button key={k.id} type="button" className={`pv-compare-tile${k.id === chosen ? ' on' : ''}`} onClick={() => onPick(k.id)} aria-pressed={k.id === chosen} data-testid={`pv-compare-${k.id}`}>
        <canvas width={W} height={H} ref={(el) => { if (el) cvs.current.set(k.id, el); else cvs.current.delete(k.id); }} />
        <span className="pv-compare-l">{k.shoot ? <><CameraIcon size={12} />Angle {k.shoot.angle}{k.shoot.rate < 1 && <em>½×</em>}</> : <><ActorIcon size={12} />Follow cam</>}</span></button>)}
    </div>
  </div>;
}

function CleanUp({ take, seconds, set, disabled }: { take: CameraTake; seconds: number; set: (p: Partial<CameraTake>) => void; disabled: boolean }) {
  const len = takeLength(take); const uses = takeShotSeconds(take); const step = 0.05;
  const smoothWord = take.smooth === 0 ? 'Raw' : take.smooth < 0.25 ? 'Light' : take.smooth < 0.6 ? 'Gentle' : 'Strong';
  const fit = Math.abs(uses - seconds) < 0.05 ? 'Fills the shot exactly' : uses < seconds ? `Moves for ${uses.toFixed(1)} s, then holds still` : `Only the first ${(seconds * take.speed).toFixed(1)} s of the take are used`;
  const lo = (100 * take.trimStart) / len, hi = (100 * take.trimEnd) / len;
  const steady = take.smooth > 0;
  return <div className="pv-clean" data-testid="pv-clean">
    <button type="button" role="switch" aria-checked={steady} className={`pv-steady${steady ? ' on' : ''}`} disabled={disabled} data-testid="pv-steady" onClick={() => set({ smooth: steady ? 0 : TAKE_SMOOTH_DEFAULT })}
      {...tip(steady ? 'Steady-cam is on: the shake of your hand is smoothed out. Turn it off for a handheld feel.' : 'Steady-cam is off: exactly what you flew, shake and all.')}><i aria-hidden />Steady-cam</button>
    <label className="pv-clean-f" {...tip('How much Steady-cam smooths. 0 keeps exactly what you flew (handheld feel).')}><span>Smoothing <b data-testid="pv-smooth-v">{smoothWord}</b></span>
      <input type="range" min={0} max={1} step={0.05} value={take.smooth} disabled={disabled} aria-label="Smoothing" data-testid="pv-smooth" style={{ ['--pv-k' as any]: `${take.smooth * 100}%` }} onChange={(e) => set({ smooth: Number(e.target.value) })} /></label>
    <span className="pv-clean-f pv-trim" {...tip('Cut the start and the end of the take: drag the two handles')}><span>Trim <b data-testid="pv-trim-v">{take.trimStart.toFixed(1)}–{take.trimEnd.toFixed(1)} s</b></span>
      <span className="pv-trim-track" style={{ ['--lo' as any]: `${lo}%`, ['--hi' as any]: `${hi}%` }}>
        <input type="range" min={0} max={len} step={step} value={take.trimStart} disabled={disabled} aria-label="Trim start" data-testid="pv-trim-start" onChange={(e) => set({ trimStart: Math.min(Number(e.target.value), take.trimEnd - 0.2) })} />
        <input type="range" min={0} max={len} step={step} value={take.trimEnd} disabled={disabled} aria-label="Trim end" data-testid="pv-trim-end" onChange={(e) => set({ trimEnd: Math.max(Number(e.target.value), take.trimStart + 0.2) })} /></span></span>
    <label className="pv-clean-f" {...tip('Plays your take faster or slower. 1× = as you flew it.')}><span>Speed <b data-testid="pv-speed-v">{take.speed.toFixed(2).replace(/0$/, '')}×</b></span>
      <input type="range" min={Math.log(TAKE_SPEED_MIN)} max={Math.log(TAKE_SPEED_MAX)} step={0.01} value={Math.log(take.speed)} disabled={disabled} aria-label="Speed" data-testid="pv-speed" style={{ ['--pv-k' as any]: `${(100 * (Math.log(take.speed) - Math.log(TAKE_SPEED_MIN))) / (Math.log(TAKE_SPEED_MAX) - Math.log(TAKE_SPEED_MIN))}%` }}
        onChange={(e) => { const v = Math.exp(Number(e.target.value)); set({ speed: Math.abs(v - 1) < 0.04 ? 1 : Math.round(v * 100) / 100 }); }} /></label>
    <span className="pv-clean-fit"><small data-testid="pv-fit-note">{fit}</small>
      <button type="button" className="pv-btn pv-btn-sm" disabled={disabled || Math.abs(uses - seconds) < 0.05} onClick={() => set({ speed: fitTakeSpeed(take, seconds) })} data-testid="pv-fit" {...tip(`Sets the speed so the trimmed take lasts exactly ${seconds} s, the length of the shot`)}>Fit to shot</button></span>
  </div>;
}

/** A played take's beats, in shot seconds: each one with an optional note ("nervously", "laughs"), and the line they make in the Render prompt. */
function Beats({ shot, take, set, disabled }: { shot: PlanShot; take: CameraTake; set: (p: Partial<CameraTake>) => void; disabled: boolean }) {
  const tr = take.actor!; const line = actionPromptFor(shot);
  const rows = tr.beats.map((b, i) => ({ b, i, at: (b.t - take.trimStart) / take.speed })).filter((r) => r.b.t <= take.trimEnd && r.at < shot.seconds && (r.b.t >= take.trimStart || !['wave', 'dance', 'sit', 'jump', 'point'].includes(r.b.kind)));
  const label = (b: ActorBeat) => b.kind === 'stand' ? 'Stands' : b.kind === 'walk' ? 'Walks' : b.kind === 'run' ? 'Runs' : ACTOR_ACTIONS.find((a) => a.id === b.kind)?.label ?? b.kind;
  const note = (i: number, v: string) => set({ actor: { ...tr, beats: tr.beats.map((x, j) => (j === i ? { ...x, note: cleanNote(v) || undefined } : x)).map((x) => (x.note ? x : (({ note: _n, ...r }) => r)(x))) } });
  return <div className="pv-beats-row" data-testid="pv-beats">
    <span className="pv-takes-l" {...tip('What the person does in this take. Add how they feel: it goes into the Render prompt')}>Beats</span>
    <span className="pv-beat-list">{rows.map(({ b, i, at }) => <label key={`${b.kind}-${b.t}`} className={`pv-beat pv-beat-${b.kind}`} data-testid={`pv-beat-${i}`}>
      <span className="pv-beat-t">{fmtTime(Math.max(0, at))}</span><b>{label(b)}</b>
      <input type="text" value={b.note ?? ''} placeholder="how?" maxLength={NOTE_MAX} disabled={disabled} aria-label={`Note for ${label(b)} at ${fmtTime(Math.max(0, at))}`} onChange={(e) => note(i, e.target.value)} data-testid={`pv-beat-note-${i}`} /></label>)}</span>
    {line && <p className="pv-beat-line" data-testid="pv-beat-line"><span>Render prompt</span>{line}</p>}
  </div>;
}

/** The camera path from above. The whole move faint, the part already travelled in orange, the camera (orange dot) and where it looks, and
 *  the subject (white circle). Drag the dots to place them: the orange dot moves the preset move's camera, the white circle the subject.
 *  With a take chosen it draws the take (and, faintly, the take as flown before smoothing). */
export function PathMap({ shot, t, live, liveActor, onEditShot, marks }: { shot: PlanShot; t: number; live: CameraPose | null; liveActor?: Vec3 | null; onEditShot?: EditShot; marks?: MapMark[] }) {
  const take = chosenTake(shot);
  /* the person's path in a played take (shot time 0 → the end), drawn in white beside the camera's */
  const walk = useMemo(() => (take?.actor ? Array.from({ length: 41 }, (_, i) => actorAt(take.actor!, takeTimeAt(take, (shot.seconds * i) / 40)).pos) : []), [shot, take]);
  const path = useMemo(() => samplePath(shot, 60), [shot]); const raw = useMemo(() => (take && take.smooth > 0 ? rawTakePath(shot, 60) : []), [shot, take]);
  const c = cameraAt(shot, t); const camPos: Vec3 = live ? live.pos : c.pos; const sub = aimAt(shot, t);
  const lookTo: Vec3 = live ? [live.pos[0] - Math.sin(live.yaw), 0, live.pos[2] - Math.cos(live.yaw)] : c.look;
  const fitNow = useMemo(() => { const pts = [...path, ...raw, ...walk, ...Array.from({ length: 13 }, (_, i) => cameraAt(shot, (shot.seconds * i) / 12).look).filter(() => !take), aimAt(shot, 0), aimAt(shot, shot.seconds)];
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]); return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]; }, [shot, path, raw, take, walk]);
  const held = useRef<{ kind: 'cam' | 'aim'; frame: number[]; s: number; x: number; y: number; start: [number, number] } | null>(null); const [dragging, setDragging] = useState<'cam' | 'aim' | null>(null);
  const frame = held.current?.frame ?? fitNow; /* the map holds still while you drag (no rescale under your finger) */
  const lv = live ? (() => { const xs = [frame[0], frame[1], live.pos[0], ...(liveActor ? [liveActor[0]] : [])], zs = [frame[2], frame[3], live.pos[2], ...(liveActor ? [liveActor[2]] : [])]; return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]; })() : frame;
  const [x0, x1, z0, z1] = lv; const W = 140, H = 94, pad = 14;
  const s = held.current?.s ?? Math.min((W - 2 * pad) / Math.max(1, x1 - x0), (H - 6 - 2 * pad) / Math.max(1, z1 - z0));
  const ox = (W - (x1 - x0) * s) / 2, oz = 8 + (H - 8 - (z1 - z0) * s) / 2; const P = (p: number[]) => [ox + (p[0] - x0) * s, oz + (p[2] - z0) * s];
  const line = (pts: Vec3[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${P(p)[0].toFixed(1)} ${P(p)[1].toFixed(1)}`).join('');
  const d = line(path); const [cx, cz] = P(camPos); const [lx, lz] = P(lookTo); const [sx, sz] = liveActor ? P(liveActor) : P(sub);
  const dx = lx - cx, dz = lz - cz; const len = Math.hypot(dx, dz) || 1; const ax = cx + (dx / len) * 12, az = cz + (dz / len) * 12;
  const k = Math.max(0, Math.min(1, t / shot.seconds)); const canDrag = !!onEditShot && !live; const camDrag = canDrag && !take; const placed = !!shot.place;
  const tpl = previzTemplate(shot.template);
  const down = (kind: 'cam' | 'aim') => (e: React.PointerEvent) => { if (!(kind === 'cam' ? camDrag : canDrag)) return; e.preventDefault(); e.stopPropagation(); try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* a pointer that already ended */ }
    const cur = kind === 'cam' ? camOffset(shot) : aimOffset(shot); held.current = { kind, frame: [x0, x1, z0, z1], s, x: e.clientX, y: e.clientY, start: cur }; setDragging(kind); };
  const move = (e: React.PointerEvent) => { const h = held.current; if (!h || !onEditShot) return; const r = (e.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect() ?? (e.currentTarget as SVGElement).getBoundingClientRect();
    const scale = (r.width / W) * h.s; const wx = h.start[0] + (e.clientX - h.x) / scale, wz = h.start[1] + (e.clientY - h.y) / scale;
    onEditShot((sh) => { const place = { cam: sh.place?.cam ?? [0, 0], aim: sh.place?.aim ?? [0, 0], [h.kind]: [wx, wz] } as NonNullable<PlanShot['place']>;
      const cand = { ...sh, place }; const clamped = h.kind === 'cam' ? camOffset(cand) : aimOffset(cand); return { ...sh, place: { ...place, [h.kind]: clamped } }; }); };
  const up = () => { held.current = null; setDragging(null); };
  const reset = () => onEditShot?.((sh) => { const { place: _p, ...rest } = sh; void _p; return rest; });
  const subjectWord = take?.actor ? 'the person' : shot.template === 'walk-by' ? 'the person' : shot.template === 'product-hero' ? 'the bottle' : 'what the camera aims at';
  const help = live ? 'Seen from above: where you are flying' : `Seen from above. Drag the white circle to move ${subjectWord}${camDrag ? ', the orange dot to move the camera' : ''}.${take ? ' Your take sets the camera path.' : ''}`;
  return <div className={`pv-map-wrap${dragging ? ' dragging' : ''}`} data-nofly="">
    <svg className="pv-map" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The camera path, seen from above" data-testid="pv-map" {...tip(dragging ? null : help)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {raw.length > 0 && <path d={line(raw)} className="pv-map-raw" data-testid="pv-map-raw" />}
      {walk.length > 0 && <path d={line(walk)} className="pv-map-walk" data-testid="pv-map-walk" />}
      <path d={d} className="pv-map-path" />{!live && <path d={d} className="pv-map-done" pathLength={1} style={{ strokeDasharray: `${k} 1` }} />}
      <g className={`pv-map-dot${canDrag ? ' can' : ''}${dragging === 'aim' ? ' on' : ''}`} onPointerDown={down('aim')} data-testid="pv-map-aim"><circle cx={sx} cy={sz} r={11} className="pv-map-hit" /><circle cx={sx} cy={sz} r={3.6} className="pv-map-sub" /></g>
      {marks?.map((m, i) => { const [mx, mz] = P([m.x, 0, m.z]); return mx < -4 || mx > W + 4 || mz < -4 || mz > H + 4 ? null : <circle key={i} cx={mx} cy={mz} r={m.on || m.ghost ? 3.2 : 2.3} className={`pv-map-prop${m.on ? ' on' : ''}${m.ghost ? (m.ok === false ? ' ghost bad' : ' ghost') : ''}`} data-testid={m.ghost ? 'pv-map-ghost' : 'pv-map-prop'} />; })}
      <line x1={cx} y1={cz} x2={ax} y2={az} className="pv-map-look" />
      <g className={`pv-map-dot${camDrag ? ' can' : ''}${dragging === 'cam' ? ' on' : ''}`} onPointerDown={down('cam')} data-testid="pv-map-cam"><circle cx={cx} cy={cz} r={11} className="pv-map-hit" /><circle cx={cx} cy={cz} r={4} className="pv-map-cam" /></g>
      <text x={8} y={13} className="pv-map-t">{live ? 'You are here' : take ? 'Your take' : 'From above'}</text></svg>
    {placed && canDrag && <button type="button" className="pv-map-reset" onClick={reset} data-testid="pv-map-reset" {...tip(`Put the camera and ${subjectWord} back where ${tpl?.name ?? 'the preset'} has them`)}>Reset</button>}
  </div>;
}
