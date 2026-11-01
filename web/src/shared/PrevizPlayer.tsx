/**
 * The Direct a Shot player (2026-10-24; tool id plan-a-shot), shared: the planned shot drawn live (our presets: shared/previz/engine.ts, three.js loaded on first use;
 * or an imported scene in a sandboxed frame: shared/previz/importScene.ts), with play / pause, a scrub timeline (one step = one frame), the
 * Simple / Clay / Depth views with a one-line hint, and the camera path drawn from above. The three steps sit on top:
 * "Stage" → "Mockup" (free) → "Render" (shared/MakeItReal.tsx, once a mockup exists). A result is a Take: a Mockup and its Render.
 * The page records through the handle (source()): every frame is drawn on purpose at the recording size (shared/previz/capture.ts), from the
 * shot the recording started with (engine.renderAt), so nothing the page changes meanwhile can reach the video.
 * Playback: plays to the end, holds the last frame a moment, then starts again with a short fade (no hard jump at the loop seam).
 * Fly the camera (2026-10-24): a game-style camera (previz/fly.ts) that records takes against the shot's clock into shot.cameraPath; the takes row,
 * the clean-up and the draggable map are in previz/FlyUi.tsx. A chosen take drives cameraAt, so the preview and the recording use it alike.
 * Game mode (2026-10-26): F (or the button) goes full screen with the mouse locked like a game, a minimal HUD (speed, REC + timer, mini-map, fading
 * key hints), R records and stops without leaving and each take says "Take N saved"; Esc releases the mouse, then leaves. Controllers work too
 * (previz/fly.ts). V switches to Play the actor: you walk the person third-person (shared/previzActor.ts), the camera follows, 1–6 act, and the
 * take keeps the person's path and beats (they go into the Render prompt).
 * Perform, then shoot (2026-10-26): a take you played is a performance. "Shoot this performance" (P, or the button on the performance) replays it
 * on its own clock while you fly the camera (Space restarts, T slow motion, L keeps the camera on the person); each recording becomes an angle of
 * that performance (shootTake in shared/previzActor.ts), which replays the person exactly, so every angle renders with the same beats.
 * Drive mode (2026-10-27, open city): your car stands beside you; C (or Y on a controller) gets in, arcade handling and a chase camera drive it
 * (shared/previzVehicle.ts), C / B gets out. A take keeps the car on the person's track (ride: the car, when you were at the wheel, where it
 * was parked), so it replays the drive and the Render prompt says it ("gets into a taxi and drives it along the main avenue").
 * Sound (2026-10-27, previz/sound.ts): a procedural city bed, footsteps, the car's engine and passing traffic while you fly or play; muted from the HUD.
 * World clock (2026-10-27): while you fly, walk or drive the city keeps living (traffic, lights, people) on a live clock that starts at the
 * frame you were on; 3, 2, 1 puts it back on the shot's own clock (t = 0) and a recording runs on that alone, so it renders the same every time.
 * Drive game (2026-10-27, previz/driveGame.ts + DriveHud.tsx, live only): red lights, near misses, a clean streak, a style meter, an orange
 * "park here" bay and the horn (H), with soft cues; hidden or quieted from its card. Its events (onDriveEvent) are the hooks for quests.
 * It holds one WebGL context through the one-live-viewer rule (shared/model3d.tsx), above the poster renderer and below the open 3D viewer.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BarPopover, PopList, PopRow } from './BarPop';
import { useSceneThumbs } from './previz/thumbs';
import { useLiveViewer } from './model3d';
import { tip } from './Tooltip';
import { DocsIcon, AlertIcon, UploadIcon, PrevizIcon } from '../ui/Icons';
import { previzTemplate, poseAt, flySpeedFor, takeTimeAt, resampleKeys, normalizeTake, chosenTake, PREVIZ_PASSES, PREVIZ_MOVES, TAKE_MAX, TAKE_MAX_SECONDS, previzPlayStep as playStep, previzTime as fmtTime, type CameraKey, type CameraPose, type CameraTake, type PlanShot, type PrevizPass } from '../../../server/src/shared/previzTemplates';
import { mockupSummary } from './previz/shotSummary';
import { chooseFinishedTake } from './previz/finishTake';
import type { PrevizEngine } from './previz/engine';
import { withBridge, linkScene, type SceneLink, type SceneStatus } from './previz/importScene';
import type { FrameSource, CaptureProgress } from './previz/capture';
import { missingThumbShots, saveSceneThumbs, THUMB_W, THUMB_H } from './previz/thumbs';
import { startFly, type FlyHandle, type FlyMode, type FlyKey, type CarLive } from './previz/fly';
import { driveAllowed, carSpot, rideOf, RIDES, RIDE_DEFAULT, kmh } from '../../../server/src/shared/previzVehicle';
import { startPrevizSound, previzSoundOn, carsWithVelocity, seaNearness, PREVIZ_SOUND_KEY, type PrevizSound, type PrevizCue } from './previz/sound';
import { createDriveGame, type DriveGame, type DriveEventType } from './previz/driveGame';
import { DriveHud, DRIVE_WORDS, driveGameOn, setDriveGameOn, driveCuesOn, setDriveCuesOn, type DriveHudState } from './previz/DriveHud';
import { openCityWorld } from '../../../server/src/shared/world/openCity';
import type { DrivePhysics } from './previz/drivePhysics';
import { actorAllowed, actorStart, actorAt, type ActorRide, type RidePose, livePose as actorLivePose, resampleActor, moveBeats, mergeBeats, isPerformance, nextAngle, nextPerformanceName, perfStep, performanceAt, shootTake, SHOOT_RATES, type ActorAction, type ActorBeat, type ActorKey, type ActorLive } from '../../../server/src/shared/previzActor';
import { FlyHud, TakeStrip, EditTake, PathMap, AngleCompare, FlyIcon, ActorIcon, CameraIcon, type EditShot, type FlyPhase, type ShootHud } from './previz/FlyUi';
import { CameraPanel, FrameGuides, loadGuides, saveGuides, anyGuide, NO_GUIDES, type CameraTab, type Guides } from './previz/CameraKit';
import { CityMap, type MapMark } from './previz/world/CityMap';
import { PropsDrawer, saveThumbs, MINE_TAB } from './previz/PropsDrawer';
import { choiceById, describeChoice, uploadModel, type ModelChoice } from './previz/myModels';
import { MODELS_MAX, startHeight, starOf, type PlacedModel } from '../../../server/src/shared/previzModels';
import type { ModelStatus } from './previz/userModels';
import { rebakeTake } from '../../../server/src/shared/previzCamera';
import { useBuildMode, BuildHints, BuildToolbar, labelOfSel } from './previz/BuildMode';
import { PROPS_MAX, groundAt, type PlacedProp } from '../../../server/src/shared/previzTemplates';
import { isCityTemplate, districtSpawn } from '../../../server/src/shared/world/openCity';
import './previzPlayer.css';

export interface PrevizHandle { source(): FrameSource | null; useTake(): boolean }
export type ReadyTake = { id: string; name: string; performance: boolean };
/** The three steps (2026-10-26, the single floating bar): the page's dock shows only what the step needs. */
export type PlanStep = 'stage' | 'mockup' | 'render';
export const PLAN_STEPS: { id: PlanStep; label: string }[] = [{ id: 'stage', label: 'Stage' }, { id: 'mockup', label: 'Mockup' }, { id: 'render', label: 'Render' }];
export interface ImportedScene { name: string; html: string }
interface Props {
  shot: PlanShot; view: PrevizPass;
  imported: ImportedScene | null; onImportStatus?: (s: SceneStatus) => void;
  onTakeReady?: (take: ReadyTake | null) => void;
  /** The dock must not export an old selected camera while an unsaved live take is being flown. */ onRecordBlock?: (reason: string) => void;
  /** recording now: the overlay shows it and the player stops its own playback */ recording: CaptureProgress | null; saving?: boolean;
  onCopyPrompt: () => void; onCancel?: () => void;
  /** shown in the imported scene's error card (choose another file) */ errorActions?: ReactNode;
  /** change the shot from the player (flown takes, map drags); without it there is no flying (an imported scene owns its camera) */ onEditShot?: EditShot;
  /** step 3, Render: opens the sheet over the newest recording (null = nothing recorded yet); hint = the honest cost and time */ makeReal?: { onOpen: (anchor: HTMLElement) => void; label: string; hint?: string; /** a Render of this mockup is on its way: the button shows it and opens it */ running?: { text: string; pct: number; onOpen: () => void } | null } | null;
  /** where you are in the flow: a mockup of this shot is recorded / a real version of it exists */ progress?: { recorded: boolean; real: boolean };
  /** the scene chip (top left of the stage) opens the page's scene picker */ onPickScene?: (anchor: HTMLElement) => void;
  /** the step you are on; the steps pill (top of the stage) switches it */ step: PlanStep; onStep: (s: PlanStep) => void;
  /** the page dock's slots: the player puts its step parts there (Stage: Fly it / Play the actor; Mockup: the takes and the timeline) */ slots?: { main: HTMLElement | null; chips: HTMLElement | null };
  /** the page's own buttons, top right of the stage (the ⋯ menu) */ topRight?: ReactNode;
  /** Use in Direct a Shot (the 3D tab): a 3D job id (or an example key) to place once the view is ready; onUsedModel clears it */ useModel?: string | null; onUsedModel?: () => void;
}
const HINTS_KEY = 'ohf:fly-hints-seen';
const COUNT_MS = 3000; /* 3, 2, 1 before a take starts */
/* play / pause in the icon set's style (24 grid, 1.5 stroke); kept here so the main bundle doesn't carry them */
const PlayIcon = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 5.5v13l10.5-6.5z" /></svg>;
const PauseIcon = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8.5 5.5v13" /><path d="M15.5 5.5v13" /></svg>;
const StepCheck = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const SEAM_MS = 180; /* the fade back in at the loop seam */
/** the drive game's events that make a sound (the horn always does; the rest only while the game is shown and its sounds are on) */
const DRIVE_CUE: Partial<Record<DriveEventType, PrevizCue>> = { 'green-go': 'green', 'ran-red': 'oops', 'near-miss': 'near-miss', parked: 'parked', streak: 'streak', bump: 'bump' };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const VIEW_HINT: Record<PrevizPass, string> = {
  beauty: 'Simple: the plain look of your preview, with soft light and shadows',
  clay: 'Clay: everything in one grey, so you judge shapes and motion only',
  depth: 'Depth: white is near the camera, black is far. Video models use this as a guide',
};

export const PrevizPlayer = forwardRef<PrevizHandle, Props>(function PrevizPlayer({ shot, view, imported, onImportStatus, onTakeReady, onRecordBlock, recording, saving, onCopyPrompt, onCancel, errorActions, onEditShot, makeReal, progress, onPickScene, step, onStep, slots, topRight, useModel, onUsedModel }, ref) {
  const [t, setT] = useState(0); const [playing, setPlaying] = useState(false); const dur = shot.seconds; const [seam, setSeam] = useState(false); const [played, setPlayed] = useState(false);
  const stage = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement | null>(null); const holder = useRef<HTMLDivElement>(null); const frame = useRef<HTMLIFrameElement>(null);
  const engine = useRef<PrevizEngine | null>(null); const [engineState, setEngineState] = useState<'loading' | 'ready' | 'error'>('loading'); const [glLost, setGlLost] = useState(false);
  const granted = useLiveViewer('plan-a-shot', !imported, 1.5);
  const [scene, setScene] = useState<SceneStatus>({ state: 'loading' }); const link = useRef<SceneLink | null>(null);
  const [capSize, setCapSize] = useState<{ w: number; h: number } | null>(null); const [box, setBox] = useState({ w: 0, h: 0 });
  const busy = !!recording || !!saving;
  const latest = useRef({ shot, view, t, busy }); latest.current = { shot, view, t, busy };
  const liveSize = (e: PrevizEngine) => { const r = stage.current?.getBoundingClientRect(); if (r && r.width > 1 && r.height > 1) e.setSize(r.width, r.height, Math.min(2, devicePixelRatio || 1)); };

  // ---- the built-in engine (lazy three.js) ----
  /* a fresh <canvas> per engine: a canvas whose WebGL context was released can't make a new one */
  useEffect(() => { const host = holder.current; if (imported || !granted || !host) return; let on = true; setEngineState('loading'); setGlLost(false);
    const cv = document.createElement('canvas'); cv.className = 'pv-canvas'; cv.dataset.testid = 'pv-canvas'; host.appendChild(cv); canvas.current = cv;
    void import('./previz/engine').then((m) => m.createPrevizEngine(cv, { onContextLost: (l) => { if (on) setGlLost(l); }, onModelStatus: (st) => { if (on) onModelStatus.current(st); } })).then((e) => { if (!on) { e.dispose(); return; } engine.current = e; const L = latest.current;
      liveSize(e); e.setPass(L.view); e.setShot(L.shot); e.seek(L.t); setEngineState('ready');
      /* dev builds only: draw the shot at any t (frames for a GIF, like explore's __x3dCity): __previz.seek(t) */ if ((import.meta as any).env?.DEV) (window as any).__previz = { canvas: cv, seek: (t: number) => { if (e.alive) e.seek(t); } }; })
      .catch(() => { if (on) setEngineState('error'); });
    return () => { on = false; engine.current?.dispose(); engine.current = null; cv.remove(); if (canvas.current === cv) canvas.current = null; }; }, [imported, granted]);
  /* while recording, the recorder owns the engine (renderAt); the live shot and view come back when it ends */
  useEffect(() => { if (!busy) engine.current?.setShot(shot); }, [shot, busy]);
  useEffect(() => { if (!busy) { engine.current?.setPass(view); void link.current?.setPass(view).catch(() => 0); } }, [view, busy]);
  useEffect(() => { setT((x) => Math.min(x, dur)); }, [dur]);
  /* a new preset or scene starts at the beginning */
  useEffect(() => { setT(0); setPlayed(false); }, [shot.template, imported]);
  // seek: the engine draws at once; an imported scene gets only the newest time (no queue while it is busy drawing)
  const seeking = useRef(false); const want = useRef<number | null>(null);
  const seekScene = (x: number) => { if (!link.current) return; want.current = x; if (seeking.current) return; seeking.current = true;
    const go = () => { const v = want.current; want.current = null; if (v == null || !link.current) { seeking.current = false; return; } void link.current.seek(v).catch(() => 0).then(go); }; go(); };
  useEffect(() => { if (busy) return; if (engine.current) engine.current.seek(t); else seekScene(t); }, [t, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  // size: the stage keeps the shot's aspect (CSS); the drawing follows it
  useEffect(() => { const el = stage.current; if (!el) return; const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setBox({ w: r.width, h: r.height }); if (!latest.current.busy && engine.current) liveSize(engine.current); });
    ro.observe(el); return () => ro.disconnect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // playback (wall clock for the preview only; the picture is still a function of t)
  const tNow = useRef(t); tNow.current = t;
  useEffect(() => { if (!playing || busy) return; let raf = 0; let last: number | null = null; let hold = tNow.current >= dur ? 0.0001 : 0; let fade = 0;
    const step = (now: number) => { const dt = last == null ? 0 : (now - last) / 1000; last = now; const s = playStep(tNow.current, hold, dt, dur); hold = s.hold;
      if (s.wrapped) { setSeam(true); clearTimeout(fade); fade = window.setTimeout(() => setSeam(false), SEAM_MS); }
      if (s.t !== tNow.current) { tNow.current = s.t; setT(s.t); } raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => { cancelAnimationFrame(raf); clearTimeout(fade); setSeam(false); }; }, [playing, busy, dur]);
  useEffect(() => { if (busy) setPlaying(false); }, [busy]);
  /* recording a video, another preset or scene, or leaving the page ends flying */
  useEffect(() => { if (busy && flyRef.current) leaveFly(); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (flyRef.current) leaveFly(); }, [shot.template, imported, granted]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { exitFlow(); flyRef.current?.stop(); snd.current?.stop(); snd.current = null; physicsGen.current++; physics.current?.dispose(); physics.current = null; clearTimeout(noteTimer.current); clearTimeout(savedTimer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* while recording, the canvas flips between views and sizes every frame: show a calm still of the last live frame on top instead */
  const [still, setStill] = useState<string | null>(null);
  useEffect(() => { if (!busy) setStill(null); }, [busy]);
  const toggle = () => { setPlaying((p) => !p); setPlayed(true); };
  /* the view's one-line hint: shown for a moment when the view changes, then out of the way (the switch keeps it as a tooltip) */
  const [hintOn, setHintOn] = useState(true);
  useEffect(() => { setHintOn(true); const id = window.setTimeout(() => setHintOn(false), 3200); return () => clearTimeout(id); }, [view]);

  // ---- Fly the camera: a game-style camera (shared/previz/fly.ts), takes recorded against the shot's clock ----
  const [fly, setFly] = useState<{ phase: FlyPhase; count: number } | null>(null); const flyRef = useRef<FlyHandle | null>(null);
  const phase = useRef<{ phase: FlyPhase; at: number }>({ phase: 'free', at: 0 }); const recKeys = useRef<CameraKey[]>([]);
  const [flySpeed, setFlySpeed] = useState(1); const [recT, setRecT] = useState(0); const [livePose, setLivePose] = useState<CameraPose | null>(null);
  const [hints, setHints] = useState(() => { try { return !localStorage.getItem(HINTS_KEY); } catch { return true; } });
  const [flyNote, setFlyNote] = useState<string | null>(null); const noteTimer = useRef(0);
  // game mode: Camera ↔ Actor, full screen with the mouse locked, a controller, the "Take N saved" toast, the person's path and beats while recording
  const [flyMode, setFlyMode] = useState<FlyMode>('camera'); const actorUsed = useRef(false); const recActor = useRef<ActorKey[]>([]); const recBeats = useRef<ActorBeat[]>([]);
  const [flow, setFlow] = useState(false); const flowRef = useRef(false); const frameEl = useRef<HTMLDivElement>(null); const [locked, setLocked] = useState(false);
  const [pad, setPad] = useState<string | null>(null); const [saved, setSaved] = useState<{ n: number; len: number; at: number; label?: string; sub?: string } | null>(null); const savedTimer = useRef(0);
  const [finishedTakeId, setFinishedTakeId] = useState<string | null>(null);
  const finishReady = !busy && fly?.phase === 'free' ? shot.cameraPath?.takes.find((take) => take.id === finishedTakeId) ?? null : null;
  useEffect(() => { onTakeReady?.(finishReady ? { id: finishReady.id, name: finishReady.name, performance: isPerformance(finishReady) } : null); }, [finishReady, onTakeReady]);
  useEffect(() => () => onTakeReady?.(null), [onTakeReady]);
  const [beatNow, setBeatNow] = useState<{ kind: ActorAction; at: number } | null>(null); const [running, setRunning] = useState(false);
  /* Drive mode: the HUD's view of the car, and what a take records of it (the car, when you were at the wheel, where it stood at the start) */
  const [drive, setDrive] = useState<{ inside: boolean; kmh: number; near: boolean; kit: string } | null>(null);
  const recRide = useRef<{ car: string; park: [number, number, number, number]; spans: [number, number][]; open: number | null } | null>(null);
  /* sound (previz/sound.ts): one per fly session, muted from the HUD (remembered in this browser) */
  /* the live drive's physics (Rapier, loaded when a fly session starts in the open city; null: loading, failed, or not here) */
  const physics = useRef<DrivePhysics | null>(null); const physicsGen = useRef(0);
  const snd = useRef<PrevizSound | null>(null); const [muted, setMuted] = useState(() => !previzSoundOn());
  /* the world clock (live only) and the scene time the last frame drew (the drive physics' traffic reads it) */
  const worldT = useRef(0); const sceneNow = useRef(0);
  /* the drive game (null: not driving here); its HUD, shown / hidden and its sounds (both remembered in this browser) */
  const game = useRef<DriveGame | null>(null); const [gameUi, setGameUi] = useState<DriveHudState | null>(null); const lastSay = useRef<DriveHudState['last']>(null);
  const [gameOn, setGameOn] = useState(driveGameOn); const [cuesOn, setCuesOn] = useState(driveCuesOn); const gameRef = useRef({ on: gameOn, cues: cuesOn }); gameRef.current = { on: gameOn, cues: cuesOn };
  const toggleGame = () => { const n = !gameOn; setGameOn(n); setDriveGameOn(n); gameRef.current.on = n; if (!n) engine.current?.setBay(null); stage.current?.focus({ preventScroll: true }); };
  const toggleCues = () => { const n = !cuesOn; setCuesOn(n); setDriveCuesOn(n); gameRef.current.cues = n; stage.current?.focus({ preventScroll: true }); };
  const toggleMute = () => { const m = !muted; setMuted(m); snd.current?.setMuted(m); try { localStorage.setItem(PREVIZ_SOUND_KEY, m ? '0' : '1'); } catch { /* private window */ } };
  const say = (m: string | null, ms = 4200) => { setFlyNote(m); clearTimeout(noteTimer.current); if (m) noteTimer.current = window.setTimeout(() => setFlyNote(null), ms); };
  const showHints = (open: boolean) => { setHints(open); if (!open) try { localStorage.setItem(HINTS_KEY, '1'); } catch { /* private window */ } };
  // ---- Perform, then shoot: the performance replays on its own clock (u, take seconds) while you fly; recordings become its angles ----
  const shootRef = useRef<{ perf: CameraTake; u: number; hold: number; rate: number; aim: boolean; paused: boolean; last: number | null } | null>(null);
  const [shootUi, setShootUi] = useState<ShootHud | null>(null); const lastPerf = useRef<string | null>(null);
  const syncShoot = () => { const sh = shootRef.current; if (!sh) { setShootUi(null); return; } const takes = latest.current.shot.cameraPath?.takes ?? [];
    setShootUi({ name: sh.perf.name, angle: nextAngle(takes, sh.perf.id), u: sh.u, lo: sh.perf.trimStart, hi: sh.perf.trimEnd, rate: sh.rate, aim: sh.aim, paused: sh.paused }); };
  const stopRec = useCallback(() => {
    const keys = recKeys.current; recKeys.current = []; const ak = recActor.current; recActor.current = []; const ab = recBeats.current; recBeats.current = []; const rr = recRide.current; recRide.current = null;
    phase.current = { phase: 'free', at: 0 }; setFly({ phase: 'free', count: 0 }); setRecT(0);
    const len = keys.length ? keys[keys.length - 1].t - keys[0].t : 0; const sh = shootRef.current;
    if (len < 0.3) { say(sh ? 'That angle was too short to keep. Press R and let the performance play a moment longer.' : 'That take was too short to keep. Press R and fly for a moment longer.'); if (sh) { sh.u = sh.perf.trimStart; sh.hold = 0; syncShoot(); } return; }
    const old0 = latest.current.shot.cameraPath?.takes ?? []; let n = old0.length + 1; while (old0.some((k) => k.id === `take-${n}`)) n++;
    if (sh) {
      /* an angle of the performance: the camera on the performance's clock, the person replayed exactly (shootTake) */
      const angle = nextAngle(old0, sh.perf.id); const perf = sh.perf; const rate = sh.rate;
      onEditShot?.((s) => { const old = s.cameraPath?.takes ?? []; if (old.length >= TAKE_MAX) return s; let m = old.length + 1; while (old.some((k) => k.id === `take-${m}`)) m++;
        const take = normalizeTake(shootTake(perf, keys, { id: `take-${m}`, angle: nextAngle(old, perf.id), rate }), m - 1); if (!take) return s;
        return { ...s, cameraPath: { takes: [...old, take], chosen: take.id } }; });
      sh.u = perf.trimStart; sh.hold = 0; sh.paused = false; setTimeout(syncShoot, 0);
      setFinishedTakeId(`take-${n}`);
      say(null); setSaved({ n, len, at: Date.now(), label: `${perf.name} · Angle ${angle} saved`, sub: `${len.toFixed(1)} s · R shoots another angle` }); clearTimeout(savedTimer.current); savedTimer.current = window.setTimeout(() => setSaved(null), 2600);
      return;
    }
    /* the person you played comes with the take: their path at TAKE_HZ and the beats (walk / run / stand read from the speeds, plus the acting keys) */
    const ar = ak.length > 1 ? resampleActor(ak) : null; const a0 = ak[0]?.t ?? 0; const aEnd = ak.length ? ak[ak.length - 1].t : 0;
    /* the drives (take seconds from the first key); the speeds at the wheel are the car's, so they don't make walk / run beats */
    const ride: ActorRide | undefined = rr && ar ? { car: rr.car, park: rr.park, spans: [...rr.spans, ...(rr.open != null ? [[rr.open, aEnd] as [number, number]] : [])].map(([x, y]) => [Math.max(0, x - a0), Math.max(0, y - a0)] as [number, number]) } : undefined;
    const inRide = (t: number) => !!ride?.spans.some(([x, y]) => t >= x && t <= y);
    const actor = ar ? { keys: ar, beats: mergeBeats(moveBeats(ride ? ar.map((k) => (inRide(k.t) ? { ...k, v: 0 } : k)) : ar), ab.map((b) => ({ ...b, t: Math.max(0, b.t - a0) }))), ...(ride ? { ride } : {}) } : undefined;
    const perfName = actor ? nextPerformanceName(old0) : null;
    onEditShot?.((s) => { const old = s.cameraPath?.takes ?? []; if (old.length >= TAKE_MAX) return s; let n = old.length + 1; while (old.some((k) => k.id === `take-${n}`)) n++;
      const take = normalizeTake({ id: `take-${n}`, name: actor ? nextPerformanceName(old) : `Take ${n}`, keys: resampleKeys(keys), ...(actor ? { actor } : {}) }, n - 1); if (!take) return s;
      return { ...s, cameraPath: { takes: [...old, take], chosen: take.id } }; });
    if (actor) lastPerf.current = `take-${n}`;
    setFinishedTakeId(`take-${n}`);
    say(null); setSaved({ n, len, at: Date.now(), ...(perfName ? { label: `${perfName} saved`, sub: `${len.toFixed(1)} s · P shoots it from new angles` } : {}) }); clearTimeout(savedTimer.current); savedTimer.current = window.setTimeout(() => setSaved(null), 2600);
  }, [onEditShot]); // eslint-disable-line react-hooks/exhaustive-deps
  /** start shooting a performance (by id; none = the one you just played, the chosen one, or the newest) in the running fly session */
  const startShoot = (id?: string | null) => { const takes = latest.current.shot.cameraPath?.takes ?? []; const ch = chosenTake(latest.current.shot);
    const perf = takes.find((k) => k.id === id && isPerformance(k)) ?? takes.find((k) => k.id === lastPerf.current && isPerformance(k)) ?? (ch && isPerformance(ch) ? ch : null) ?? [...takes].reverse().find(isPerformance) ?? null;
    if (!perf) { say(actorAllowed(latest.current.shot.template) ? 'Record a performance first: V plays the actor, R records. Then P shoots it.' : 'This scene has no person to perform. Pick Street walk, Home walkthrough or Product hero.'); return; }
    const h = flyRef.current; if (h && h.mode() !== 'camera') { h.setMode('camera'); setFlyMode('camera'); }
    if (phase.current.phase !== 'free') { phase.current = { phase: 'free', at: 0 }; setFly({ phase: 'free', count: 0 }); recKeys.current = []; recActor.current = []; recBeats.current = []; }
    lastPerf.current = perf.id; shootRef.current = { perf, u: perf.trimStart, hold: 0, rate: 1, aim: shootRef.current?.aim ?? false, paused: false, last: null }; syncShoot();
    say(`Shooting ${perf.name}: it replays while you fly. R records an angle.`, 3200); stage.current?.focus({ preventScroll: true }); };
  const stopShoot = () => { if (!shootRef.current) return; if (phase.current.phase !== 'free') { phase.current = { phase: 'free', at: 0 }; setFly({ phase: 'free', count: 0 }); recKeys.current = []; } shootRef.current = null; setShootUi(null); };
  const shootCtl = { restart: () => { const sh = shootRef.current; if (!sh || phase.current.phase !== 'free') return; sh.u = sh.perf.trimStart; sh.hold = 0; sh.paused = false; syncShoot(); },
    pause: () => { const sh = shootRef.current; if (!sh || phase.current.phase !== 'free') return; sh.paused = !sh.paused; syncShoot(); },
    seek: (u: number) => { const sh = shootRef.current; if (!sh || phase.current.phase !== 'free') return; sh.u = Math.max(sh.perf.trimStart, Math.min(sh.perf.trimEnd, u)); sh.hold = 0; sh.paused = true; syncShoot(); },
    slow: () => { const sh = shootRef.current; if (!sh || phase.current.phase === 'rec') return; const i = SHOOT_RATES.indexOf(sh.rate as 1); sh.rate = SHOOT_RATES[(i + 1) % SHOOT_RATES.length]; syncShoot();
      say(sh.rate < 1 ? `Slow motion ${sh.rate}×: the angle still plays back at real speed.` : 'Real speed', 2400); },
    aim: () => { const sh = shootRef.current; if (!sh) return; sh.aim = !sh.aim; syncShoot(); say(sh.aim ? 'Look at the person: on. A / D orbit, Q / E crane, W / S dolly.' : 'Look at the person: off', 2400); } };
  const leaveFly = useCallback(() => { exitFlow(); flyRef.current?.stop(); flyRef.current = null; shootRef.current = null; setShootUi(null); phase.current = { phase: 'free', at: 0 }; recKeys.current = []; recActor.current = []; recBeats.current = [];
    setFly(null); setFinishedTakeId(null); setLivePose(null); setLiveActor(null); say(null); actorUsed.current = false; setFlyMode('camera'); setBeatNow(null); setRunning(false); setDrive(null); recRide.current = null; game.current = null; setGameUi(null);
    snd.current?.stop(); snd.current = null; physicsGen.current++; physics.current?.dispose(); physics.current = null;
    const e = engine.current; if (e?.alive) { e.setBay(null); e.setActor(null); e.setFreeCamera(null); e.seek(tNow.current); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const useTake = (): boolean => {
    const id = finishReady?.id;
    if (!id || !flyRef.current || !chooseFinishedTake(latest.current.shot, id, phase.current.phase)) return false;
    onEditShot?.((s) => chooseFinishedTake(s, id, 'free') ?? s);
    leaveFly(); setT(0); tNow.current = 0; onStep('mockup'); return true;
  };
  /* full screen: the frame fills the screen, the mouse is locked on the next click (or right away from a key press), Esc is kept for the page where
     the browser allows it (Keyboard Lock), so the first Esc only frees the mouse. Without full screen the frame still covers the window. */
  const enterFlow = () => { const f = frameEl.current; if (!f || flowRef.current) return; flowRef.current = true; setFlow(true); flyRef.current?.setLockOnClick(true);
    try { const r = f.requestFullscreen?.({ navigationUI: 'hide' }); r?.then(() => (navigator as any).keyboard?.lock?.(['Escape'])?.catch?.(() => 0)).catch(() => 0); } catch { /* the overlay still covers the window */ }
    try { const st = stage.current as any; const r = st?.requestPointerLock?.({ unadjustedMovement: true }); r?.catch?.(() => st?.requestPointerLock?.()?.catch?.(() => 0)); } catch { /* lock on the next click */ }
    stage.current?.focus({ preventScroll: true }); };
  function exitFlow() { if (!flowRef.current) return; flowRef.current = false; setFlow(false); setLocked(false); flyRef.current?.setLockOnClick(false); try { (navigator as any).keyboard?.unlock?.(); } catch { /* fine */ }
    if (document.pointerLockElement) document.exitPointerLock?.(); if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => 0); }
  /* the browser left full screen by itself (its own Esc, a tab switch): leave flow mode, keep flying */
  useEffect(() => { const on = () => { if (!document.fullscreenElement && flowRef.current) exitFlow(); }; document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const switchMode = (m?: FlyMode) => { const h = flyRef.current; if (!h || !h.actor()) return; const next = m ?? (h.mode() === 'actor' ? 'camera' : 'actor'); if (next === 'actor' && shootRef.current) { if (phase.current.phase === 'rec') return; stopShoot(); } if (next === h.mode()) return;
    if (next === 'actor') actorUsed.current = true; h.setMode(next); setFlyMode(next); stage.current?.focus({ preventScroll: true }); };
  const onFlyKey = useRef<(k: FlyKey) => void>(() => 0);
  const recordToggle = () => { const p = phase.current.phase;
    if (p === 'rec') { stopRec(); return; }
    if (p === 'count') { phase.current = { phase: 'free', at: 0 }; setFly({ phase: 'free', count: 0 }); return; }
    if ((shot.cameraPath?.takes.length ?? 0) >= TAKE_MAX) { say(`${TAKE_MAX} takes is the most. Delete one under the player first.`); return; }
    const sh = shootRef.current; if (sh) { sh.u = sh.perf.trimStart; sh.hold = 0; sh.paused = false; syncShoot(); }
    setFinishedTakeId(null); say(null); setT(0); tNow.current = 0; engine.current?.seek(0); phase.current = { phase: 'count', at: performance.now() }; setFly({ phase: 'count', count: 3 }); };
  onFlyKey.current = (k) => { if (k === 'record') recordToggle(); else if (k === 'mode') switchMode();
    else if (k === 'shoot') { if (shootRef.current) { if (phase.current.phase === 'free') stopShoot(); } else startShoot(); }
    else if (k === 'restart') shootCtl.restart(); else if (k === 'slow') shootCtl.slow(); else if (k === 'aim') shootCtl.aim(); else if (k === 'flow') { if (flowRef.current) exitFlow(); else enterFlow(); }
    else if (phase.current.phase === 'rec') stopRec(); else if (phase.current.phase === 'count') { phase.current = { phase: 'free', at: 0 }; setFly({ phase: 'free', count: 0 }); } else if (flowRef.current) exitFlow(); else leaveFly(); };

  /* the scene picker's thumbnails: once the engine is ready and idle, draw each preset that has none yet, small, in one task (nothing flashes on
     screen: the live shot is drawn again before the browser paints), and keep them in this browser (shared/previz/thumbs.ts) */
  useEffect(() => { if (engineState !== 'ready' || imported || busy || fly || glLost) return; if (!missingThumbShots().length) return;
    const id = window.setTimeout(() => { const e = engine.current, c = canvas.current; if (!e?.alive || !c || latest.current.busy || flyRef.current) return;
      const rows: { id: string; url: string }[] = [];
      try { e.setSize(THUMB_W, THUMB_H, 1); for (const m of missingThumbShots()) { e.renderAt(m.shot, m.t, 'beauty'); rows.push({ id: m.id, url: c.toDataURL('image/jpeg', 0.82) }); } }
      catch { /* no thumbnails this time: the cards keep their colour tiles */ }
      finally { if (e.alive) { liveSize(e); const L = latest.current; e.setShot(L.shot); e.setPass(L.view); e.seek(L.t); } }
      if (rows.length) saveSceneThumbs(rows); }, 1200);
    return () => clearTimeout(id); }, [engineState, imported, busy, !!fly, glLost]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- an imported scene ----
  const srcDoc = useMemo(() => (imported ? withBridge(imported.html) : ''), [imported]);
  useEffect(() => { if (!imported || !frame.current) return; const f = frame.current; let l: SceneLink | null = null;
    const start = () => { l?.dispose(); l = linkScene(f, (s) => { setScene(s); onImportStatus?.(s); if (s.state === 'ready') { link.current = l; void l!.setPass(latest.current.view).catch(() => 0); seekScene(latest.current.t); } }); };
    start(); f.addEventListener('load', start, { once: true });
    return () => { link.current = null; l?.dispose(); f.removeEventListener('load', start); }; }, [srcDoc]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    useTake,
    source(): FrameSource | null {
      if (!imported && engine.current?.alive) { const e = engine.current; const c = canvas.current!;
        return { begin: async (w, h) => { await e.ready(); try { setStill(c.toDataURL('image/jpeg', 0.85)); } catch { /* no still */ } e.setSize(w, h, 1); }, frame: async (tt, pass, s) => { e.renderAt(s, tt, pass); return c; },
          end: () => { if (!e.alive) return; liveSize(e); const L = latest.current; e.setShot(L.shot); e.setPass(L.view); e.seek(L.t); } };
      }
      if (imported && link.current && scene.state === 'ready') { const l = link.current;
        return { begin: async (w, h) => { setCapSize({ w, h }); await new Promise((r) => setTimeout(r, 350)); }, frame: (tt, pass) => l.frame(tt, pass),
          end: async () => { setCapSize(null); await l.setPass(latest.current.view).catch(() => 0); await l.seek(latest.current.t).catch(() => 0); } };
      }
      return null;
    },
  }), [imported, scene.state, finishReady, onEditShot, onStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const tpl = previzTemplate(shot.template)!; const fps = shot.fps; const allowed = scene.state === 'ready' ? scene.check.passes : PREVIZ_PASSES.map((p) => p.id);
  const ready = imported ? scene.state === 'ready' : engineState === 'ready' && granted && !glLost;
  const pct = recording ? Math.round((100 * recording.done) / Math.max(1, recording.total)) : 0;
  /* while you build (the Add props drawer is open) the build mode owns the keys (previz/BuildMode.tsx): nothing here moves the camera */
  const keys = (e: React.KeyboardEvent) => { if (busy || !ready || fly || propsOn) return;
    if (e.code === 'KeyF' && !e.metaKey && !e.ctrlKey && canFly) { e.preventDefault(); enterFly({ flow: true }); return; } if (e.code === 'KeyV' && !e.metaKey && !e.ctrlKey && canFly && actorAllowed(shot.template)) { e.preventDefault(); enterFly({ mode: 'actor' }); return; } if (e.code === 'KeyG' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); toggleGuides(); return; } if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); setT((x) => Math.max(0, Math.min(dur, Math.round(x * fps + (e.key === 'ArrowRight' ? 1 : -1)) / fps))); } };
  const shownTitle = imported ? imported.name : tpl.name;
  const capScale = capSize ? Math.min(box.w / capSize.w, box.h / capSize.h) : 1;
  const [aw, ah] = shot.aspect.split(':').map(Number); const move = PREVIZ_MOVES.find((m) => m.id === shot.move);
  /* the big Play: the obvious first action, shown while paused at the start or the end */
  const bigPlay = ready && !busy && !playing && !fly && (t <= 0.0001 || t >= dur - 0.0001);
  const recorded = !!progress?.recorded; const real = !!progress?.real;
  const canFly = !imported && !!onEditShot && ready && !busy;
  const [liveActor, setLiveActor] = useState<[number, number, number] | null>(null);
  const enterFly = (o: { flow?: boolean; mode?: FlyMode; shoot?: string; at?: { pose: CameraPose; actor: { pos: [number, number, number]; heading: number } } } = {}) => {
    const e = engine.current; const el = stage.current; if (!canFly || !e || !el || flyRef.current) return; setPlaying(false); setFlySpeed(flySpeedFor(shot.template));
    const start = o.at?.pose ?? poseAt(shot, tNow.current); let lastUi = 0; phase.current = { phase: 'free', at: 0 }; setFly({ phase: 'free', count: 0 }); setLivePose(start); el.focus({ preventScroll: true });
    /* the person starts where the chosen take left them at this moment, or where the preset's walk starts */
    const tk = chosenTake(shot); const from = tk?.actor ? actorAt(tk.actor, takeTimeAt(tk, tNow.current)) : null; const st = o.at ? o.at.actor : from ? { pos: from.pos, heading: from.heading } : actorStart(shot);
    const actor: ActorLive | null = actorAllowed(shot.template) ? { pos: st.pos, heading: st.heading, v: 0, d: 0, vel: [0, 0], beat: null } : null;
    const mode: FlyMode = o.mode === 'actor' && actor ? 'actor' : 'camera'; actorUsed.current = mode === 'actor' || !!from; setFlyMode(mode); setPad(null);
    /* Drive mode: the car stands where the chosen take left it at this moment, or beside the person */
    const kit0 = from?.car?.k ?? RIDE_DEFAULT; const sp0 = !o.at && from?.car ? { pos: from.car.pos, heading: from.car.heading } : actor ? carSpot(shot.template, actor.pos, actor.heading, rideOf(kit0)) : null;
    const car0: CarLive | null = actor && driveAllowed(shot.template) && sp0 ? { k: kit0, s: { pos: sp0.pos, heading: sp0.heading, speed: 0, steer: 0, d: 0 }, inside: false } : null;
    setDrive(car0 ? { inside: false, kmh: 0, near: false, kit: car0.k } : null);
    /* the city lives on from the frame you were on; the drive game listens for the cues and the HUD's words */
    worldT.current = tNow.current; sceneNow.current = tNow.current; lastSay.current = null; setGameUi(null); game.current = car0 ? createDriveGame(openCityWorld()) : null;
    game.current?.on('*', (ev) => { if (ev.type === 'horn') { snd.current?.cue('horn'); return; } const g = gameRef.current; if (!g.on) return;
      const cue = DRIVE_CUE[ev.type]; if (cue && g.cues) snd.current?.cue(cue);
      if (DRIVE_WORDS[ev.type] && ev.type !== 'bay') lastSay.current = { type: ev.type, at: Date.now(), extra: ev.type === 'streak' ? mmss(ev.streak ?? 0) : ev.type === 'near-miss' && ev.gap != null ? `${ev.gap.toFixed(1)} m` : undefined }; });
    /* the physics world loads in the background (WebAssembly); until then, or if it can't, the arcade model drives */
    if (car0) { const gen = ++physicsGen.current; void import('./previz/drivePhysics').then((m) => m.createDrivePhysics(shot.template, shot.props ?? [], shot.models ?? [])).then((p) => { if (gen !== physicsGen.current) { p.dispose(); return; } physics.current = p; })
      .catch((err) => { console.warn('Direct a Shot: drive physics unavailable, using the arcade model', err); }); }
    /* sound: started from this click (browsers let audio start on a user gesture) */
    snd.current?.stop(); try { snd.current = startPrevizSound(); snd.current.setMuted(muted); } catch { snd.current = null; }
    const city = isCityTemplate(shot.template); const night = shot.template === 'open-city-night'; let sndUi = { sea: 0, cars: [] as ReturnType<typeof carsWithVelocity>, at: -1 }; let lastNow: number | null = null;
    flyRef.current = startFly(el, { start, template: shot.template, speed: flySpeedFor(shot.template), mode, actor, car: car0, physics: () => physics.current, sceneTime: () => sceneNow.current,
      onHorn: (now) => { const c = flyRef.current?.car(); game.current?.horn(now / 1000, sceneNow.current, c ? { k: c.k, pos: c.s.pos, heading: c.s.heading, speed: c.s.speed, inside: c.inside } : null); }, onNote: (m) => say(m, 2400), onSpeed: setFlySpeed, onKey: (k) => onFlyKey.current(k),
      onRide: (inside, now, c) => { actorUsed.current = true; setRunning(false); const ph = phase.current; const rr = recRide.current;
        if (ph.phase === 'rec' && rr) { const tt = (now - ph.at) / 1000; const ks = recActor.current; const lk = ks[ks.length - 1];
          /* the moment before the door: the last pose held to here, so the take never blends the person into the car */
          if (lk && tt - lk.t > 2e-4) ks.push({ ...lk, t: tt - 1e-4 }); const at = tt - 5e-5;
          if (inside) rr.open = at; else if (rr.open != null) { rr.spans.push([rr.open, at]); rr.open = null; } }
        setDrive({ inside, kmh: 0, near: !inside, kit: c.k }); say(inside ? `In the ${rideOf(c.k).label.toLowerCase()}. W drives, S brakes and reverses, A / D steer, Space handbrake, C gets out.` : null, 3600); },
      onPad: (n) => { setPad(n); if (n) say(`Controller connected: ${n}. Left stick moves, right stick looks, A records.${car0 ? ' Y gets in the car, RT drives.' : ''}`, 4200); },
      aim: () => { const sh = shootRef.current; if (!sh?.aim) return null; const p = performanceAt(sh.perf, sh.u); return p ? [p.pos[0], p.pos[1] + 1.15, p.pos[2]] : null; },
      onLock: (l) => setLocked(l), onActive: () => { const n = Date.now(); if (n - activeRef.current > 400) { activeRef.current = n; setActiveAt(n); } },
      onAction: (a, now, on) => { if (a === 'run') { setRunning(!!on); } else setBeatNow({ kind: a, at: Date.now() }); actorUsed.current = true;
        const ph = phase.current; if (ph.phase === 'rec' && a !== 'run') recBeats.current.push({ t: (now - ph.at) / 1000, kind: a }); /* walk / run / stand come from the speeds */ },
      onFrame: ({ pose, actor: a, car: c, near, mode: m, fade }, now) => { const ph = phase.current; const ui = now - lastUi > 66; if (ui) { lastUi = now; setLivePose(pose); }
        const fdt = lastNow == null ? 0 : Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
        if (ui && c) setDrive((d) => { const n = { inside: c.inside, kmh: kmh(c.s.speed), near, kit: c.k }; return d && d.inside === n.inside && d.kmh === n.kmh && d.near === n.near && d.kit === n.kit ? d : n; });
        const carPose: RidePose | null = c ? { k: c.k, pos: c.s.pos, heading: c.s.heading, v: Math.abs(c.s.speed), d: c.s.d, steer: c.s.steer, inside: c.inside, acc: c.acc ?? 0 } : null;
        /* sound: the engine follows your car's speed; the traffic and the sea are read on the UI ticks (the engine's traffic runs on the scene clock) */
        const sound = (sceneT: number) => { const S = snd.current; if (!S) return; if (city && (ui || sndUi.at < 0)) { const w = openCityWorld(); sndUi = { sea: seaNearness(pose.pos[2], w.spec.terrain.shoreZ), cars: carsWithVelocity(w.carsAt(sceneT), w.carsAt(sceneT + 0.1), 0.1), at: sceneT }; }
          const driving = m === 'actor' && !!c?.inside; const onFoot = m === 'actor' && !!a && !driving;
          try { S.update({ mode: driving ? 'drive' : m, onFoot, inCar: driving, v: driving ? Math.abs(c!.s.speed) : onFoot ? a!.v : 0, d: a?.d ?? 0, camPos: pose.pos, yaw: pose.yaw, night, sea: sndUi.sea, nearCars: sndUi.cars, ambience: city ? 'city' : 'indoor' }, fdt); } catch { /* sound is a nicety */ } };
        const sh = shootRef.current;
        if (sh) { /* shooting a performance: it replays on its own clock; the camera keys are stamped with that clock (slow motion is re-timed for free) */
          const dt = sh.last == null ? 0 : (now - sh.last) / 1000; sh.last = now; const lo = sh.perf.trimStart, hi = sh.perf.trimEnd;
          if (ph.phase === 'count') { sh.u = lo; sh.hold = 0; const left = Math.ceil((COUNT_MS - (now - ph.at)) / 1000);
            if (left <= 0) { phase.current = { phase: 'rec', at: now }; recKeys.current = []; setFly({ phase: 'rec', count: 0 }); } else if (ui) setFly((f) => (f && f.count !== left ? { phase: 'count', count: left } : f)); }
          else if (ph.phase === 'rec') { const c = perfStep(sh, dt, sh.rate, lo, hi, false); sh.u = c.u; sh.hold = 0; recKeys.current.push({ t: sh.u, pos: pose.pos, yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov });
            if (ui) setRecT((sh.u - lo) / Math.max(0.01, sh.perf.speed)); if (c.ended) { stopRec(); } }
          else if (!sh.paused) { const c = perfStep(sh, dt, sh.rate, lo, hi, true); sh.u = c.u; sh.hold = c.hold; }
          const ap = performanceAt(sh.perf, sh.u); const st = Math.max(0, Math.min(dur, (sh.u - lo) / Math.max(0.01, sh.perf.speed))); tNow.current = st;
          sceneNow.current = st; worldT.current = st; e.setLive(pose, ap, st); sound(st); if (ui) { setLiveActor(ap ? ap.pos : null); setT(st); setShootUi((x) => (x ? { ...x, u: sh.u, paused: sh.paused } : x)); }
          return; }
        const showA = actorUsed.current && a; let sceneT = tNow.current;
        /* free: the world clock runs on; 3, 2, 1 shows the shot's first frame; recording runs on the take's own clock (and the world goes on from there) */
        if (ph.phase === 'free' && city) { worldT.current += fdt; sceneT = worldT.current; } /* the small sets keep their frame, as before */
        if (ph.phase === 'count') { const left = Math.ceil((COUNT_MS - (now - ph.at)) / 1000); if (left <= 0) { phase.current = { phase: 'rec', at: now }; recKeys.current = []; recActor.current = []; recBeats.current = []; setFly({ phase: 'rec', count: 0 });
          recRide.current = c ? { car: c.k, park: [c.s.pos[0], c.s.pos[1], c.s.pos[2], c.s.heading], spans: [], open: c.inside ? 0 : null } : null; } else if (ui) setFly((f) => (f && f.count !== left ? { phase: 'count', count: left } : f)); }
        else if (ph.phase === 'rec') { const tt = (now - ph.at) / 1000; recKeys.current.push({ t: tt, pos: pose.pos, yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov }); const stt = Math.min(dur, tt); tNow.current = stt; sceneT = stt; worldT.current = stt;
          if (showA) recActor.current.push({ t: tt, pos: a.pos, heading: a.heading, v: a.v, d: a.d });
          if (ui) { setRecT(tt); setT(stt); } if (tt >= TAKE_MAX_SECONDS) stopRec(); }
        sceneNow.current = sceneT;
        /* the drive game: one step a frame (traffic only at the wheel), the bay in the view, the HUD on the UI ticks */
        const G = game.current; if (G && c) { const g = gameRef.current; const wheel = c.inside && m === 'actor';
          G.step({ now: now / 1000, dt: fdt, sceneT, car: { k: c.k, pos: c.s.pos, heading: c.s.heading, speed: c.s.speed, inside: wheel }, traffic: wheel ? openCityWorld().carsAt(sceneT) : null, bays: g.on });
          const st = G.state; e.setBay(g.on && wheel ? st.bay : null);
          if (ui) { let dir = 0; if (st.bay) { const fh = Math.atan2(-Math.sin(pose.yaw), -Math.cos(pose.yaw)); const bh = Math.atan2(st.bay.x - pose.pos[0], st.bay.z - pose.pos[2]); dir = -Math.atan2(Math.sin(bh - fh), Math.cos(bh - fh)); }
            const n: DriveHudState | null = wheel ? { style: Math.round(st.style * 50) / 50, streak: Math.floor(st.streak), best: Math.floor(st.best), bay: st.bayDist == null ? null : Math.round(st.bayDist), bayDir: Math.round(dir * 20) / 20, last: lastSay.current } : null;
            setGameUi((p) => (p && n && p.style === n.style && p.streak === n.streak && p.best === n.best && p.bay === n.bay && p.bayDir === n.bayDir && p.last === n.last ? p : n)); } }
        e.setLive(pose, showA ? { ...actorLivePose(a, now / 1000, sceneT), car: carPose, ...(fade < 1 ? { fade } : {}) } : null, sceneT); sound(sceneT); if (ui) setLiveActor(showA ? a.pos : null); } });
    if (o.flow) enterFlow();
    if (o.shoot) startShoot(o.shoot);
  };
  const [activeAt, setActiveAt] = useState(0); const activeRef = useRef(0);
  /* Add props (previz/PropsDrawer.tsx + previz/BuildMode.tsx): pick a piece or one of your models, a ghost shows where it goes, click to place;
     select, drag, turn and size what is placed; undo / redo. They are part of the shot. */
  const [propsOpen, setPropsOpen] = useState(false); const [selProp, setSelProp] = useState<number | null>(null);
  const shotProps = shot.props ?? []; const propsOn = propsOpen && !imported && !busy && !fly && !!onEditShot && ready && step === 'stage';
  /* building is part of Stage: another step closes the drawer (it was left open over the Mockup step) */
  useEffect(() => { if (step !== 'stage' && propsOpen) closeProps(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPropsOpen(false); setSelProp(null); setSelModel(null); }, [shot.template, imported]);
  useEffect(() => { if (selProp != null && selProp >= shotProps.length) setSelProp(null); }, [shotProps.length, selProp]);
  useEffect(() => { engine.current?.selectProp(propsOn ? selProp : null); }, [propsOn, selProp, engineState]); // eslint-disable-line react-hooks/exhaustive-deps
  /* building holds the shot still: no playback under you (the camera would move while you place) */
  useEffect(() => { if (propsOn) setPlaying(false); }, [propsOn]);
  const editProps = (f: (list: PlacedProp[]) => PlacedProp[]) => onEditShot?.((s) => { const list = f(s.props ?? []); const { props: _old, ...rest } = s; void _old; return list.length ? { ...rest, props: list } : rest; });
  /* Your 3D models (previz/myModels.ts, server shared/previzModels.ts): placed like props, one can play the actor */
  const shotModels = shot.models ?? []; const [selModel, setSelModel] = useState<number | null>(null); const [modelBusy, setModelBusy] = useState<string | null>(null);
  const [modelNote, setModelNote] = useState<string | null>(null); const [modelFailed, setModelFailed] = useState<Record<string, string>>({}); const [drawerTab, setDrawerTab] = useState<string | undefined>(undefined);
  const [loadingModels, setLoadingModels] = useState<string[]>([]);
  const recordBlock = fly ? finishReady ? 'Use this take to continue' : fly.phase === 'rec' ? 'Stop to keep the take first' : 'Leave live mode first' : !ready ? 'Scene not ready yet' : shotModels.some((m) => modelFailed[m.src]) ? 'Remove or replace failed props' : shotModels.some((m) => loadingModels.includes(m.src)) ? 'Loading your props…' : '';
  useEffect(() => { onRecordBlock?.(recordBlock); }, [recordBlock, onRecordBlock]);
  const onModelStatus = useRef<(st: ModelStatus) => void>(() => undefined);
  onModelStatus.current = (st) => { setLoadingModels((xs) => st.state === 'loading' ? xs.includes(st.src) ? xs : [...xs, st.src] : xs.filter((x) => x !== st.src)); setModelFailed((f) => { if (st.state === 'error') return f[st.src] === st.message ? f : { ...f, [st.src]: st.message ?? 'That model could not be loaded.' }; if (!(st.src in f)) return f; const n = { ...f }; delete n[st.src]; return n; }); };
  useEffect(() => { if (selModel != null && selModel >= shotModels.length) setSelModel(null); }, [shotModels.length, selModel]);
  useEffect(() => { engine.current?.selectModel(propsOn ? selModel : null); }, [propsOn, selModel, engineState]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickSel = (k: 'prop' | 'model', i: number | null) => { if (k === 'prop') { setSelProp(i); if (i != null) setSelModel(null); } else { setSelModel(i); if (i != null) setSelProp(null); } };
  /* the actor model frames the Shot Recipes: when it moves, turns, changes size or becomes (or stops being) the actor, recipe takes bake again */
  const starKey = (s: PlanShot) => { const m = starOf(s); return m ? `${m.x},${m.z},${m.r},${m.h},${m.fw}` : ''; };
  const withModels = (s: PlanShot, list: PlacedModel[]): PlanShot => { const { models: _old, ...rest } = s; void _old; const next: PlanShot = list.length ? { ...rest, models: list } : rest;
    const cp = next.cameraPath; if (!cp || starKey(next) === starKey(s) || !cp.takes.some((k) => k.recipe)) return next;
    return { ...next, cameraPath: { ...cp, takes: cp.takes.map((k) => (k.recipe ? rebakeTake(next, k, k.recipe) ?? k : k)) } }; };
  /** write props and models in one edit (the build mode and undo) */
  const applyPlace = (f: (s: { props: PlacedProp[]; models: PlacedModel[] }) => { props: PlacedProp[]; models: PlacedModel[] }) => onEditShot?.((s) => { const n = f({ props: s.props ?? [], models: s.models ?? [] });
    const { props: _p, ...rest } = s; void _p; return withModels(n.props.length ? { ...rest, props: n.props } : rest, n.models); });
  /** one of your models, ready to place: loaded and checked, its words for the Render, a real-world start height (null: it can't be used; the note says why) */
  const prepModel = async (c: ModelChoice) => { const e = engine.current; if (!e) return null; setModelBusy(c.key); setModelNote(null);
    try { const [{ fw }, desc] = await Promise.all([e.probeModel(c.src), describeChoice(c)]); if (!e.alive) return null; return { fw, desc, h: startHeight(fw, latest.current.shot.template) }; }
    catch (err) { setModelNote((err as Error).message || 'That model could not be loaded.'); return null; } finally { setModelBusy(null); } };
  const modelOf = (c: ModelChoice, p: { fw: number; desc: string; h: number }, x: number, z: number, r: number, list: PlacedModel[]): PlacedModel => { let n = list.length + 1; while (list.some((m) => m.id === `m${n}`)) n++;
    return { id: `m${n}`, src: c.src, ...(c.job ? { job: c.job } : {}), name: c.name, desc: p.desc, x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000, r, h: p.h, front: c.front, fw: p.fw }; };
  const closeProps = () => { setPropsOpen(false); setSelProp(null); setSelModel(null); setModelNote(null); setDrawerTab(undefined); };
  const build = useBuildMode({ on: propsOn, engine, canvas, stage, getShot: () => latest.current.shot, sel: { prop: selProp, model: selModel }, select: pickSel, apply: applyPlace, prepModel, modelOf,
    coverRight: box.w > 560 ? 304 : 0, onNote: setModelNote, limits: { props: PROPS_MAX, models: MODELS_MAX }, onClose: closeProps });
  /* the drawer's own edits (its sliders, the actor, the words) are undo steps too; quick slider moves are one step */
  const changeProp = (i: number, p: Partial<PlacedProp>) => { build.remember(`drawer:prop:${i}:${Object.keys(p).join()}`); editProps((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x))); };
  const changeModel = (i: number, p: Partial<PlacedModel>) => { build.remember(`drawer:model:${i}:${Object.keys(p).join()}`);
    onEditShot?.((s) => withModels(s, (s.models ?? []).map((x, j) => (j === i ? { ...x, ...p } : p.actor && x.actor ? { ...x, actor: undefined } : x)).map((x) => (x.actor === undefined ? (({ actor: _a, ...rest }) => rest)(x) as PlacedModel : x)))); };
  const removeModel = (i: number) => { const m = shotModels[i]; const usedByTake = !!m?.actor && (shot.cameraPath?.takes ?? []).some((k) => !!k.actor);
    build.remember(); onEditShot?.((s) => withModels(s, (s.models ?? []).filter((_, j) => j !== i))); setSelModel(null); setModelNote(usedByTake ? `${m.name} was the actor in your takes. The mannequin plays them again now.` : null); };
  const removeProp = (i: number) => { build.remember(); editProps((l) => l.filter((_, j) => j !== i)); setSelProp(null); };
  /** place one of your models straight away where the view looks (Use in Direct a Shot, an upload) */
  const addModel = async (c: ModelChoice) => { if (!(await build.pick({ kind: 'model', c }))) return false; return build.placeNow(); };
  const uploadMine = async (f: File) => { setModelBusy('upload'); setModelNote(null); let c: ModelChoice | null = null;
    try { c = await uploadModel(f); } catch (err) { setModelNote((err as Error).message); } finally { setModelBusy(null); } if (c) await addModel(c); };
  /* Use in Direct a Shot (the 3D tab's action): once the view is ready, place that model and open Your models on it */
  const usedFor = useRef<string | null>(null);
  useEffect(() => { if (!useModel) usedFor.current = null; }, [useModel]);
  useEffect(() => { if (!useModel || !ready || imported || busy || usedFor.current === useModel) return; usedFor.current = useModel; setPropsOpen(true); setDrawerTab(MINE_TAB);
    void choiceById(useModel).then(async (c) => { if (!c) { setModelNote('That 3D model isn’t finished or is no longer here.'); return; }
      /* the drawer (and the build mode) open on the next render: wait a frame so the ghost has its view */
      await new Promise((r) => requestAnimationFrame(() => r(0)));
      if (!(latest.current.shot.models ?? []).some((m) => m.src === c.src)) await addModel(c); else { setSelModel((latest.current.shot.models ?? []).findIndex((m) => m.src === c.src)); setSelProp(null); } })
      .finally(() => onUsedModel?.()); }, [useModel, ready, imported, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const needThumbs = (ids: string[]) => { const e = engine.current; if (!e?.alive) return; void e.snapPieces(ids, 160, 160, () => { if (!e.alive) return; liveSize(e); const L = latest.current; e.setShot(L.shot); e.setPass(L.view); e.seek(L.t); }).then(saveThumbs).catch(() => undefined); };
  /* the maps show what you placed, the selected one and the ghost (so the map and the view always agree) */
  const ghostAt = build.placing ? build.placing.spot ?? build.placing.drop : null;
  const mapMarks = useMemo<MapMark[] | undefined>(() => { if (fly) return undefined; const out: MapMark[] = [...shotProps.map((p, i) => ({ x: p.x, z: p.z, on: propsOn && selProp === i })), ...shotModels.map((m, i) => ({ x: m.x, z: m.z, on: propsOn && selModel === i }))];
    if (propsOn && ghostAt) out.push({ x: ghostAt.x, z: ghostAt.z, ghost: true, ok: ghostAt.ok }); return out.length ? out : undefined; }, [shotProps, shotModels, propsOn, selProp, selModel, ghostAt?.x, ghostAt?.z, ghostAt?.ok, !!fly]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Compare angles: every angle of a performance drawn at the same moment, small, side by side (the engine draws each one in turn, like the scene
     thumbnails: nothing flashes, the live view is drawn again before the browser paints) */
  const [compareId, setCompareId] = useState<string | null>(null);
  const compareOn = compareId && (shot.cameraPath?.takes ?? []).some((k) => k.id === compareId && isPerformance(k)) && ready && !busy && !fly ? compareId : null;
  const snapAngles = useCallback((jobs: { shot: PlanShot; canvas: HTMLCanvasElement }[], tt: number) => {
    const e = engine.current, c = canvas.current; if (!e?.alive || !c || latest.current.busy || flyRef.current || !jobs.length) return;
    const W = jobs[0].canvas.width, H = jobs[0].canvas.height;
    try { e.setSize(W, H, 1); for (const j of jobs) { e.renderAt(j.shot, tt, latest.current.view); j.canvas.getContext('2d')?.drawImage(c, 0, 0, j.canvas.width, j.canvas.height); } }
    catch { /* the tiles keep their last picture */ }
    finally { if (e.alive) { liveSize(e); const L = latest.current; e.setShot(L.shot); e.setPass(L.view); e.seek(L.t); } }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* the open city: jump to a district's spawn point (flying already: just move; otherwise start flying there) */
  const teleport = (id: string) => { const sp = districtSpawn(id); const pose: CameraPose = { pos: sp.cam, yaw: sp.yaw, pitch: sp.pitch, fov: flyRef.current?.pose().fov ?? poseAt(shot, tNow.current).fov };
    const actor = { pos: sp.actor, heading: sp.heading }; if (flyRef.current) { flyRef.current.teleport(pose, actor); game.current?.reset(); setLivePose(pose); return; } enterFly({ at: { pose, actor } }); };

  /* the chosen take's acting beats on the timeline (shot seconds, after trim and speed) */
  const beatMarks = useMemo(() => { const k = chosenTake(shot); if (!k?.actor) return [] as { t: number; at: number; kind: string; label: string; note?: string }[];
    return k.actor.beats.filter((b) => b.kind !== 'walk' && b.kind !== 'stand' && b.t >= k.trimStart && b.t <= k.trimEnd).map((b) => ({ t: b.t, at: (b.t - k.trimStart) / k.speed, kind: b.kind, label: b.kind[0].toUpperCase() + b.kind.slice(1), note: b.note })).filter((b) => b.at <= shot.seconds); }, [shot]);
  const editable = !imported && !!onEditShot;
  const flown = chosenTake(shot); const takesN = shot.cameraPath?.takes.length ?? 0; const canAct = actorAllowed(shot.template);
  /* the dock's popovers (Edit take, New take) open above the dock and keep clear of it */
  const dockRef = useRef<HTMLElement | null>(null); dockRef.current = (slots?.chips?.closest('.ic-dock') as HTMLElement | null) ?? null;
  const editBtn = useRef<HTMLButtonElement>(null); const newBtn = useRef<HTMLButtonElement>(null); const sceneBtn = useRef<HTMLButtonElement>(null); const camBtn = useRef<HTMLButtonElement>(null);
  const [pop, setPop] = useState<'' | 'edit' | 'new' | 'recipes'>(''); useEffect(() => { if (fly || busy) setPop(''); }, [!!fly, busy]); useEffect(() => { setPop(''); }, [step]);
  /* Shot recipes: a recipe you pick plays from the top at once, so quick switching shows each move */
  const onRecipe = () => { setT(0); tNow.current = 0; setPlayed(true); setPlaying(true); };
  const [camTab, setCamTab] = useState<CameraTab>('recipes');
  /* Guides (thirds, centre, safe, 2.39): drawn over the stage only, remembered in this browser; G turns them off and back on */
  const [guides, setGuidesState] = useState<Guides>(loadGuides); const lastGuides = useRef<Guides | null>(null);
  const setGuides = (g: Guides) => { setGuidesState(g); saveGuides(g); };
  const toggleGuides = () => { if (anyGuide(guides)) { lastGuides.current = guides; setGuides(NO_GUIDES); } else setGuides(lastGuides.current && anyGuide(lastGuides.current) ? lastGuides.current : { ...NO_GUIDES, thirds: true }); };
  const thumb = useSceneThumbs(); const sceneThumb = imported ? null : thumb(shot.template);
  const stepDone = (id: PlanStep) => (id === 'stage' ? recorded || step !== 'stage' : id === 'mockup' ? recorded : real);
  const stepTip: Record<PlanStep, string> = { stage: 'Stage: pick the scene, the camera move and the colour. Fly the camera (F) or play the actor (V).',
    mockup: 'Mockup: pick a take, trim it, then record a free mockup. Your browser draws every frame.',
    render: makeReal ? `Render: LTX-2.5 (or a cloud model) turns your mockup of ${makeReal.label} into real video, keeping the motion and framing.` : 'Render: record a mockup first (free). Then turn it into real video.' };
  const camChip = editable && !imported ? <button ref={camBtn} type="button" className={`ic-chip pv-cam-btn${pop === 'recipes' ? ' on' : ''}`} onClick={() => setPop(pop === 'recipes' ? '' : 'recipes')} disabled={busy || !ready || !!fly} aria-haspopup="dialog" aria-expanded={pop === 'recipes'} data-testid="pv-recipes-btn"
    {...tip('Recipes & lens: one-click camera moves that become takes, the lens and shot size, camera feel and framing guides (G)')}><CameraIcon size={15} />Recipes &amp; lens</button> : null;
  const flyBtns = <>
    <button type="button" className="ic-chip pv-fly-btn" onClick={() => enterFly()} disabled={!canFly || !!fly} data-testid="pv-fly" {...tip('Fly the camera yourself with the keyboard, mouse or a game controller, and keep the move as a take. Keys: F flies full screen, R records')}><FlyIcon size={15} />{takesN ? 'Fly a take' : 'Fly it'}</button>
    {canAct && <button type="button" className="ic-chip pv-fly-btn" onClick={() => enterFly({ mode: 'actor' })} disabled={!canFly || !!fly} data-testid="pv-play-actor" {...tip('Walk the person yourself, third-person like a game (V): the camera follows, 1–6 act, R records. Then P shoots the performance from new angles.')}><ActorIcon size={15} />{(shot.cameraPath?.takes ?? []).some(isPerformance) ? 'Perform again' : 'Play the actor'}</button>}</>;
  const transport = <span className="pv-tr" data-testid="pv-bar">
    <button type="button" className={`pv-play${playing ? '' : ' pv-play-idle'}`} onClick={toggle} disabled={busy || !ready || !!fly} aria-label={playing ? 'Pause' : 'Play'} data-testid="pv-play" {...tip(playing ? 'Pause (Space)' : 'Play (Space)')}>{playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}</button>
    <span className="pv-time" data-testid="pv-time"><b>{fmtTime(t)}</b> / {fmtTime(dur)}</span>
    <span className="pv-scrub"><input type="range" min={0} max={dur} step={1 / fps} value={Math.max(0, Math.min(dur, t))} disabled={busy || !ready || !!fly} aria-label="Scrub through the shot" data-testid="pv-scrub" aria-valuetext={`${fmtTime(t)} of ${fmtTime(dur)}`}
      onChange={(e) => { setPlaying(false); setPlayed(true); setT(Number(e.target.value)); }} style={{ ['--pv-k' as any]: `${(100 * Math.max(0, Math.min(dur, t))) / dur}%` }} {...tip('Drag to move through the shot. Arrow keys step one frame.')} />
      {beatMarks.length > 0 && <span className="pv-beats" data-testid="pv-beat-marks">{beatMarks.map((b) => <i key={`${b.kind}-${b.t}`} className={`pv-beat-m pv-beat-${b.kind}`} style={{ left: `${(100 * b.at) / dur}%` }} {...tip(`${fmtTime(b.at)} · ${b.label}${b.note ? `: ${b.note}` : ''}`)} />)}</span>}</span></span>;
  const dockMain = step === 'mockup' && editable ? <div className="pv-mockup-choice"><TakeStrip shot={shot} onEditShot={onEditShot!} disabled={busy || !ready || !!fly} ready={ready && !busy && !fly} snap={snapAngles} onNew={() => setPop(pop === 'new' ? '' : 'new')} newOpen={pop === 'new'} newRef={newBtn} />
    <div className="pv-shot-summary" data-testid="pv-shot-summary"><span><b>Mockup · {shot.seconds} s</b> · {mockupSummary(shot)}</span>
      {flown && isPerformance(flown) && <button type="button" className="fd-link" disabled={busy || !ready || !!fly} onClick={() => enterFly({ shoot: flown.id })} data-testid="pv-shoot-selected">Shoot this performance</button>}</div></div> : null;
  const dockChips = step === 'stage' ? (editable ? <>{flyBtns}{camChip}</> : null)
    : step === 'mockup' ? <>{transport}{camChip}{editable && <button ref={editBtn} type="button" className={`ic-chip pv-edit-btn${pop === 'edit' ? ' on' : ''}`} onClick={() => setPop(pop === 'edit' ? '' : 'edit')} disabled={busy || !ready || !!fly} aria-haspopup="dialog" aria-expanded={pop === 'edit'} data-testid="pv-edit-take"
        {...tip(flown ? `Edit ${flown.name}: Steady-cam, trim, speed${flown.actor ? ', beats and their notes' : ''}` : 'Edit the preset move: which move and how fast')}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>Edit take</button>}</> : null;
  /* the stage fills the window between the page top and the dock: its top edge, measured (the announcement bar can come and go) */
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => { const el = root.current; if (!el) return; const controls = el.querySelector('.pv-stage-controls'); const set = () => { const top = el.getBoundingClientRect().top + window.scrollY; el.style.setProperty('--pv-top', `${Math.max(0, Math.round(top))}px`); el.style.setProperty('--pv-controls-h', `${Math.ceil(controls?.getBoundingClientRect().height ?? 0) + (controls ? 10 : 0)}px`); };
    set(); const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null; ro?.observe(document.body); if (controls) ro?.observe(controls); addEventListener('resize', set); return () => { ro?.disconnect(); removeEventListener('resize', set); }; }, [!!fly]);
  return <section ref={root} className={`pv pv-step-${step}`} aria-label="Direct a Shot" data-testid="pv-player" data-step={step}>
    <div ref={frameEl} className={`pv-frame${flow ? ' pv-flow' : ''}`} data-testid="pv-frame">
      {!fly && <div className="pv-stage-controls" data-testid="pv-stage-controls">
        {/* top left: the scene (opens the picker), Add props while staging */}
        {!fly && <div className="pv-tl" data-nofly="">
          {onPickScene && <button ref={sceneBtn} type="button" className="pv-glass pv-scene" onClick={(e) => onPickScene(e.currentTarget)} disabled={busy} data-testid="pv-change-scene" {...tip(imported ? 'Your imported scene. Pick a preset or another file' : `${tpl.tagline}. Change the scene`)}>
            <span className="pv-scene-th" aria-hidden>{imported ? <UploadIcon size={13} /> : sceneThumb ? <img src={sceneThumb} alt="" /> : <PrevizIcon size={14} />}</span><b data-testid="pv-title">{shownTitle}</b>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
          {!imported && !busy && ready && onEditShot && step === 'stage' && <button type="button" className={`pv-props-btn${propsOpen ? ' on' : ''}`} data-nofly="" aria-expanded={propsOpen} data-testid="pv-props-btn" onClick={() => { if (propsOpen) closeProps(); else setPropsOpen(true); }} {...tip(propsOpen ? 'Close Add props' : 'Drop furniture, street pieces, trees and more into the scene')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg>Add props{shotProps.length + shotModels.length > 0 && <small>{shotProps.length + shotModels.length}</small>}</button>}</div>}
        {/* top centre: the three steps, each one a button */}
        {!fly && <ol className="pv-steps pv-glass" aria-label="Steps" data-testid="pv-steps" data-nofly="">{PLAN_STEPS.map((x, i) => { const on = step === x.id; const done = !on && stepDone(x.id);
          return <li key={x.id} className={`${on ? 'on' : done ? 'done' : ''}`}>{i > 0 && <span className={`pv-steps-line${PLAN_STEPS.findIndex((y) => y.id === step) >= i ? ' on' : ''}`} aria-hidden />}
            <button type="button" aria-current={on ? 'step' : undefined} onClick={() => onStep(x.id)} disabled={busy} data-testid={`pv-step-${x.id}`} {...tip(stepTip[x.id])}><b>{done ? <StepCheck /> : i + 1}</b><span>{x.label}</span>{x.id === 'mockup' && <em className="pv-free">Free</em>}</button></li>; })}</ol>}
        {/* top right: full screen like a game, then the page's ⋯ menu */}
        {!fly && <div className="pv-tr-btns" data-nofly="">{canFly && !imported && <button type="button" className="pv-glass pv-sq" onClick={() => enterFly({ flow: true })} aria-label="Fly full screen" data-testid="pv-fly-full" {...tip('Fly full screen, the mouse locked like a game (F)')}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg></button>}{topRight}
          {hintOn && !busy && ready && <span key={view} className="pv-hint" data-testid="pv-view-hint">{VIEW_HINT[view]}</span>}</div>}
      </div>}
      <div ref={stage} className={`pv-stage${busy ? ' pv-busy' : ''}${fly ? ' pv-flying' : ''}${fly?.phase === 'rec' ? ' pv-flying-rec' : ''}${fly && flyMode === 'actor' ? ' pv-acting' : ''}${isCityTemplate(shot.template) ? ' pv-city' : ''}${propsOn ? ' pv-props-on' : ''}${build.drag?.moving ? ' pv-dragging' : ''}${build.placing ? ' pv-placing' : ''}${propsOn && !build.placing && build.hover ? ' pv-hovering' : ''}`} {...build.handlers} style={{ ['--pv-ar' as any]: `${aw / ah}` }} tabIndex={0} onKeyDown={keys} data-testid="pv-stage" data-aspect={shot.aspect} aria-label={`${shownTitle}, ${fmtTime(t)} of ${fmtTime(dur)}. Space plays, arrows step one frame.`}>
        {imported ? <iframe ref={frame} className="pv-iframe" title={`Imported scene: ${imported.name}`} sandbox="allow-scripts" srcDoc={srcDoc} data-testid="pv-iframe"
            style={capSize ? { width: capSize.w, height: capSize.h, transform: `scale(${capScale})`, transformOrigin: '0 0' } : undefined} />
          : <div ref={holder} className="pv-holder" />}
        {busy && still && <img className="pv-still" src={still} alt="" aria-hidden data-testid="pv-still" />}
        <div className={`pv-seam${seam ? ' on' : ''}`} aria-hidden />
        {!busy && ready && <FrameGuides guides={guides} aspect={shot.aspect} />}
        {!imported && !granted && <div className="pv-note" role="status">Paused while another 3D view is open</div>}
        {!imported && granted && engineState === 'loading' && <div className="pv-note" role="status"><i className="as-spin" aria-hidden />Setting up the scene…</div>}
        {!imported && engineState === 'error' && <div className="pv-note pv-note-err" role="alert"><AlertIcon size={16} />3D drawing isn’t available in this browser.</div>}
        {!imported && glLost && <div className="pv-note" role="status" data-testid="pv-gl-lost"><i className="as-spin" aria-hidden />The graphics card paused this view. It comes back on its own…</div>}
        {imported && scene.state === 'loading' && <div className="pv-note" role="status" data-testid="pv-scene-loading"><i className="as-spin" aria-hidden />Opening your scene…</div>}
        {imported && scene.state === 'error' && <div className="pv-err" role="alert" data-testid="pv-scene-error">
          <span className="pv-err-ic"><AlertIcon size={18} /></span><b>This scene can’t be used yet</b>
          <ul>{scene.problems.map((p) => <li key={p}>{p}</li>)}{scene.errors.slice(0, 2).map((p) => <li key={p} className="pv-err-js">{p}</li>)}</ul>
          <p>Send these lines back to the agent that wrote it, or start again from the build prompt.</p>
          <span className="pv-err-acts">{errorActions}<button type="button" className="pv-btn" onClick={onCopyPrompt}><DocsIcon size={14} />Copy build prompt</button></span></div>}
        {!imported && !busy && ready && isCityTemplate(shot.template) && <CityMap shot={shot} live={fly ? livePose : null} liveActor={fly ? liveActor : null} onTeleport={teleport} marks={mapMarks} />}
        {!imported && !busy && ready && !isCityTemplate(shot.template) && <PathMap shot={shot} t={t} live={fly ? livePose : null} liveActor={fly ? liveActor : null} onEditShot={onEditShot} marks={mapMarks} />}
        {fly && frameEl.current && createPortal(<FlyHud phase={fly.phase} count={fly.count} recT={recT} dur={shootUi ? (shootUi.hi - shootUi.lo) / Math.max(0.01, shootRef.current?.perf.speed ?? 1) : dur} speed={flySpeed}
          shoot={shootUi} canShoot={!!(shot.cameraPath?.takes ?? []).some(isPerformance)} onShoot={() => onFlyKey.current('shoot')} shootCtl={shootCtl} hints={hints} onHints={showHints} onRecord={recordToggle} onExit={() => onFlyKey.current('exit')} takeReady={!!finishReady} onUseTake={() => useTake()} full={(shot.cameraPath?.takes.length ?? 0) >= TAKE_MAX} note={flyNote}
          mode={flyMode} canAct={actorAllowed(shot.template)} onMode={switchMode} flow={flow} onFlow={() => onFlyKey.current('flow')} locked={locked} pad={pad} saved={saved} activeAt={activeAt} beat={beatNow} running={running}
          drive={drive} onRide={() => { flyRef.current?.toggleRide(); stage.current?.focus({ preventScroll: true }); }} muted={muted} onMute={toggleMute}
          onCarKit={(k) => { if (phase.current.phase !== 'free') return; if (flyRef.current?.setCarKit(k)) setDrive((d) => (d ? { ...d, kit: k } : d)); stage.current?.focus({ preventScroll: true }); }} />, frameEl.current)}
        {fly && gameUi && flyMode === 'actor' && <DriveHud s={gameUi} on={gameOn} cues={cuesOn} onToggle={toggleGame} onCues={toggleCues} />}
        {propsOn && frameEl.current && createPortal(<PropsDrawer template={shot.template} props={shotProps} selected={selProp} onSelect={(i) => pickSel('prop', i)} onPick={(id, from) => void build.pick({ kind: 'prop', k: id }, from)} picking={build.placingKey} onChange={changeProp} onRemove={removeProp} onClose={closeProps} onNeedThumbs={needThumbs} startTab={drawerTab}
          selectionTools={<BuildToolbar b={build} label={labelOfSel(shot, build.sel) ?? 'Selected'} full={build.sel?.kind === 'model' ? shotModels.length >= MODELS_MAX : shotProps.length >= PROPS_MAX} />}
          undo={{ can: build.canUndo, canRedo: build.canRedo, undo: build.undo, redo: build.redo }}
          mine={{ models: shotModels, selected: selModel, onSelect: (i) => pickSel('model', i), onPick: (c) => void addModel(c), onChange: changeModel, onRemove: removeModel, onUpload: (f) => void uploadMine(f), busy: modelBusy, note: modelNote, failed: modelFailed }} />, frameEl.current)}
        {propsOn && <BuildHints b={build} name={labelOfSel(shot, build.sel)} />}
        {bigPlay && !propsOn && step !== 'mockup' && <button type="button" className="pv-bigplay" onClick={() => { if (t >= dur - 0.0001) setT(0); toggle(); }} data-testid="pv-bigplay" aria-label="Play the shot">
          <span className="pv-bigplay-ic"><PlayIcon size={22} /></span><span className="pv-bigplay-t"><b>{played || t > 0 ? 'Play again' : 'Play the shot'}</b>{!imported && flown ? <small>{flown.name}: the move you flew · {dur} s</small> : !imported && move && <small>{move.label}: {move.hint.toLowerCase()} · {dur} s</small>}</span></button>}
        {busy && frameEl.current && createPortal(<div className="pv-rec" role="status" aria-live="polite" data-testid="pv-rec">
          <span className="pv-rec-dot" aria-hidden /><b>{saving ? 'Saving the video…' : `Recording ${pct}%`}</b>
          {recording && !saving && <small>{PREVIZ_PASSES.find((p) => p.id === recording.pass)?.label} style · frame {recording.frame} of {recording.frames}</small>}
          {saving && <small>Turning the frames into an MP4 on this computer</small>}
          <span className="pv-rec-bar"><i style={{ width: `${saving ? 100 : pct}%` }} className={saving ? 'pv-rec-saving' : ''} /></span>
          {!saving && onCancel && <button type="button" className="pv-btn pv-btn-ghost" onClick={onCancel} data-testid="pv-rec-cancel">Stop</button>}</div>, frameEl.current)}
        {editable && compareOn && <AngleCompare shot={shot} perfId={compareOn} t={t} playing={playing} snap={snapAngles} onPick={(id) => onEditShot!((s) => (s.cameraPath ? { ...s, cameraPath: { ...s.cameraPath, chosen: id } } : s))} onClose={() => setCompareId(null)} />}
      </div>
    </div>
    {slots?.main && dockMain && createPortal(dockMain, slots.main)}
    {slots?.chips && dockChips && createPortal(dockChips, slots.chips)}
    {editable && <BarPopover open={pop === 'edit'} anchor={editBtn} avoid={dockRef} watch={dockRef} onClose={() => setPop('')} label="Edit take" role="dialog" testId="pv-edit-pop" width={360} gap={6} closeButton focusFirst={false}>
      <EditTake shot={shot} onEditShot={onEditShot!} disabled={busy || !!fly} comparing={compareId} onCompare={(id) => { setCompareId((c) => (c === id ? null : id)); setPop(''); }}
        onShoot={(id) => { setPop(''); enterFly({ shoot: id }); }} onDone={() => setPop('')} /></BarPopover>}
    {editable && <BarPopover open={pop === 'recipes'} anchor={camBtn} avoid={dockRef} watch={dockRef} onClose={() => setPop('')} label="Recipes & lens" role="dialog" testId="pv-recipes-pop" width={460} gap={6} closeButton focusFirst={false}>
      <CameraPanel shot={shot} onEditShot={onEditShot!} disabled={busy || !!fly} onApplied={onRecipe} guides={guides} onGuides={setGuides} tab={camTab} onTab={setCamTab} /></BarPopover>}
    {editable && <BarPopover open={pop === 'new'} anchor={newBtn} avoid={dockRef} watch={dockRef} onClose={() => setPop('')} label="New take" role="menu" testId="pv-new-pop" width={280} gap={6}>
      <div className="bp-wrap"><PopList label="New take" role="menu">
        <PopRow role="menuitem" icon={<FlyIcon size={16} />} label="Fly the camera" hint="Keyboard, mouse or a controller · R records" aside={<kbd className="pv-kbd">F</kbd>} onClick={() => { setPop(''); enterFly(); }} testId="pv-new-fly" />
        {canAct && <PopRow role="menuitem" icon={<ActorIcon size={16} />} label="Play the actor" hint="Walk the person, 1–6 act · R records" aside={<kbd className="pv-kbd">V</kbd>} onClick={() => { setPop(''); enterFly({ mode: 'actor' }); }} testId="pv-new-act" />}
        <PopRow role="menuitem" icon={<CameraIcon size={16} />} label="Shot recipe" hint="A one-click camera move: hero, drone, whip…" onClick={() => { setCamTab('recipes'); setPop('recipes'); }} testId="pv-new-recipe" />
        <PopRow role="menuitem" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>} label="Fly full screen" hint="The mouse locked like a game · Esc leaves" onClick={() => { setPop(''); enterFly({ flow: true }); }} testId="pv-new-full" />
      </PopList></div></BarPopover>}
  </section>;
});
