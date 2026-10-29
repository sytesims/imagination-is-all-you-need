/**
 * Drive mode, the game layer's HUD (2026-10-27, step 1; the rules are in previz/driveGame.ts). A small card above the speedometer while you
 * drive: the style meter (a thin orange bar), the clean streak, where the next "park here" bay is (an arrow and the distance), and the last
 * thing that happened ("Near miss", "Green. Go", "Ran a red"…) for a moment. Two small buttons: the game's sounds on / off, and hide (the
 * card folds into a pill, the bay leaves the street and the cues go quiet; the horn and the engine stay). Both are remembered in this browser.
 */
import type { DriveEventType } from './driveGame';
import { tip } from '../Tooltip';

export const DRIVE_GAME_KEY = 'ohf:drive-game'; export const DRIVE_CUES_KEY = 'ohf:drive-cues';
const read = (k: string) => { try { return localStorage.getItem(k) !== '0'; } catch { return true; } };
const write = (k: string, on: boolean) => { try { localStorage.setItem(k, on ? '1' : '0'); } catch { /* private window */ } };
export const driveGameOn = () => read(DRIVE_GAME_KEY); export const setDriveGameOn = (on: boolean) => write(DRIVE_GAME_KEY, on);
export const driveCuesOn = () => read(DRIVE_CUES_KEY); export const setDriveCuesOn = (on: boolean) => write(DRIVE_CUES_KEY, on);

export interface DriveHudState { style: number; streak: number; best: number; /** metres to the bay, null = none */ bay: number | null; /** the bay's direction from where the camera looks (radians, 0 = straight ahead, positive = right) */ bayDir: number;
  /** the last event worth a word */ last: { type: DriveEventType; at: number; extra?: string } | null }
/** what an event says in the HUD (null: nothing to say), and whether it's good news */
export const DRIVE_WORDS: Partial<Record<DriveEventType, [string, 'good' | 'bad' | 'calm']>> = {
  'stopped-at-red': ['Stopped at red', 'calm'], 'green-go': ['Green. Go', 'good'], 'ran-red': ['Ran a red', 'bad'], 'near-miss': ['Near miss', 'good'], bump: ['Bump', 'bad'],
  parked: ['Parked', 'good'], streak: ['Clean streak', 'good'], bay: ['New bay', 'calm'],
};
const fmt = (s: number) => { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };

export function DriveHud({ s, on, cues, onToggle, onCues }: { s: DriveHudState; on: boolean; cues: boolean; onToggle: () => void; onCues: () => void }) {
  if (!on) return <button type="button" className="pv-game-pill" onClick={onToggle} data-nofly="" data-testid="pv-game-show" {...tip('Show the driving game: style, streak, park bays')}><StyleIcon />Style</button>;
  const w = DRIVE_WORDS[s.last?.type ?? 'enter']; const fresh = s.last && w && Date.now() - s.last.at < 1800;
  return <div className="pv-game" data-testid="pv-game" data-nofly="">
    <div className="pv-game-top">
      <span className="pv-game-k">Style</span>
      <span className="pv-game-meter" role="meter" aria-label="Style" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.style * 100)} data-testid="pv-game-style"><i style={{ width: `${Math.round(s.style * 100)}%` }} /></span>
      <button type="button" className={`pv-game-btn${cues ? '' : ' off'}`} onClick={onCues} aria-pressed={cues} aria-label={cues ? 'Game sounds on' : 'Game sounds off'} data-testid="pv-game-cues" {...tip(cues ? 'Game sounds on: chimes for green and parking, a cue on a near miss. Click to quiet them' : 'Game sounds off. Click for chimes and cues')}><BellIcon off={!cues} /></button>
      <button type="button" className="pv-game-btn" onClick={onToggle} aria-label="Hide the driving game" data-testid="pv-game-hide" {...tip('Hide the driving game (the bay and the cues too)')}><HideIcon /></button>
    </div>
    <div className="pv-game-row"><span className="pv-game-k">Clean</span><b data-testid="pv-game-streak">{fmt(s.streak)}</b>{s.best >= 10 && <small>best {fmt(s.best)}</small>}</div>
    {s.bay != null && <div className="pv-game-row pv-game-bay" data-testid="pv-game-bay"><span className="pv-game-arrow" style={{ transform: `rotate(${s.bayDir}rad)` }} aria-hidden><ArrowIcon /></span>Park here<b>{s.bay < 1000 ? `${Math.round(s.bay)} m` : `${(s.bay / 1000).toFixed(1)} km`}</b></div>}
    {fresh && <div key={s.last!.at} className={`pv-game-say pv-game-${w![1]}`} role="status" data-testid="pv-game-say">{w![0]}{s.last!.extra ? <small>{s.last!.extra}</small> : null}</div>}
  </div>;
}
const StyleIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 18h3V12H4zM10.5 18h3V8h-3zM17 18h3V4h-3z" /></svg>;
const HideIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 12h12" /></svg>;
const ArrowIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 3 19 19 12 15.5 5 19z" /></svg>;
const BellIcon = ({ off }: { off: boolean }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" />{off && <path d="M4 4l16 16" />}</svg>;
