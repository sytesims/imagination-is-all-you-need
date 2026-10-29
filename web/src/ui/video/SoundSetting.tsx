import { forwardRef, type ReactNode } from 'react';
import { PopSection, PopSwitch, PopNote } from '../../shared/BarPop';
import { SoundIcon } from '../Icons';
import './soundSetting.css';
/** Sound lives in the Video bars' Settings popover (2026-10-27: the bar was crowded). One source for both bars (Create Video in
 *  VideoStudio, the other workflows in VideoWorkflowBar):
 *  - SettingsChip: the sliders button; a small speaker badge on its corner while sound is on, so the state shows without opening it.
 *  - SoundSection: "Sound" with an On / Off switch (and what sound adds to the price), or the model's own note when it can't be changed. */

const Sliders = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3 4h6M12 4h1M3 12h1M7 12h6M3 8h3M9 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="10.5" cy="4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="5.5" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="7.5" cy="8" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;

export const SettingsChip = forwardRef<HTMLButtonElement, { open: boolean; onClick: () => void; ariaLabel: string; /** true: the speaker badge */ soundOn?: boolean; tip?: Record<string, unknown>; testId?: string; className?: string }>(
  function SettingsChip({ open, onClick, ariaLabel, soundOn, tip, testId, className = '' }, ref) {
    return <button ref={ref} type="button" className={`ic-chip ic-sq vs-sq snd-set${open ? ' on' : ''}${className ? ` ${className}` : ''}`} data-testid={testId} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel} {...tip} onClick={onClick}>
      <Sliders />{soundOn && <span className="snd-badge" data-testid="vs-sound-badge" aria-hidden><SoundIcon size={10} /></span>}</button>;
  });

/** One sound switch: label, "On" / "Off" on the right, a short line under it (what it adds to the price). */
export type SoundSwitch = { key: string; label: string; on: boolean; onChange: (v: boolean) => void; hint?: ReactNode; testId?: string };

export function SoundSection({ switches, note, aside, testId = 'vs-set-sound' }: { switches: SoundSwitch[]; /** shown when there is no switch (the model fixes it) */ note?: ReactNode; aside?: ReactNode; testId?: string }) {
  const one = switches.length === 1 ? switches[0] : null;
  return <PopSection label="Sound" aside={aside ?? (one ? (one.on ? 'On' : 'Off') : undefined)} testId={testId}>
    {switches.map(s => <PopSwitch key={s.key} testId={s.testId} label={s.label} hint={s.hint} on={s.on} onChange={s.onChange} />)}
    {!switches.length && note && <PopNote testId={`${testId}-note`}>{note}</PopNote>}
  </PopSection>;
}
