import { forwardRef, type ReactNode } from 'react';
import { ClockIcon, AspectIcon, ResolutionIcon, QualityIcon, BitrateIcon, SoundIcon, SoundOffIcon, LayersIcon, LoopIcon, ChevronRightIcon, MinusIcon, PlusIcon } from '../ui/Icons';
/** One settings chip for every side panel (Create Video, Motion Control, the swap tools): one border, radius, height and padding,
 *  a 16px SVG icon, and the shared hover / pressed / focus / selected states (tokens.css). `static` = a fact the model fixes:
 *  same shape, no hover and no pointer. `row` = the full-width row form (label left, value right, chevron when it opens a menu). */
export type ChipIcon = 'clock' | 'aspect' | 'resolution' | 'quality' | 'bitrate' | 'sound' | 'sound-off' | 'layers' | 'loop';
const ICON: Record<ChipIcon, (p: { size?: number }) => JSX.Element> = { clock: ClockIcon, aspect: AspectIcon, resolution: ResolutionIcon, quality: QualityIcon, bitrate: BitrateIcon, sound: SoundIcon, 'sound-off': SoundOffIcon, layers: LayersIcon, loop: LoopIcon };
export const ChipGlyph = ({ icon }: { icon?: ChipIcon }) => { if (!icon) return null; const C = ICON[icon]; return <span className="sc-ic" aria-hidden><C size={16} /></span>; };

type Base = { icon?: ChipIcon; label: ReactNode; value?: ReactNode; title?: string; testId?: string; className?: string; ariaLabel?: string };
export const SettingChip = forwardRef<HTMLButtonElement, Base & { static?: boolean; open?: boolean; row?: boolean; menu?: boolean; onClick?: () => void }>(
  function SettingChip({ icon, label, value, title, testId, className = '', ariaLabel, static: isStatic, open, row, menu = true, onClick }, ref) {
    const cls = `sc ${row ? 'sc-row vs-qrow' : 'vs-sq'}${isStatic ? ' sc-static vs-static' : ''}${open ? ' on' : ''}${className ? ' ' + className : ''}`;
    const body = <><ChipGlyph icon={icon} /><span className="sc-l">{label}</span>{value != null && <b className="sc-v">{value}</b>}{row && !isStatic && menu && <span className="sc-chev" aria-hidden><ChevronRightIcon size={16} /></span>}</>;
    if (isStatic) return <span className={cls} data-testid={testId} title={title} aria-label={ariaLabel}>{body}</span>;
    return <button ref={ref} type="button" className={cls} data-testid={testId} title={title} aria-label={ariaLabel} aria-haspopup={menu ? 'listbox' : undefined} aria-expanded={menu ? !!open : undefined} onClick={onClick}>{body}</button>;
  });

/** A switch row (e.g. Keep audio): label left, a real 36×20 toggle right. */
export function SwitchRow({ icon, label, on, onChange, title, testId }: { icon?: ChipIcon; label: ReactNode; on: boolean; onChange: (v: boolean) => void; title?: string; testId?: string }) {
  return <button type="button" role="switch" aria-checked={on} className={`sc sc-row vs-qrow sc-switch-row${on ? ' is-on' : ''}`} data-testid={testId} title={title} onClick={() => onChange(!on)}>
    <ChipGlyph icon={icon} /><span className="sc-l">{label}</span><i className="sc-switch" aria-hidden /></button>;
}

/** Stepper: 'Versions  − 1 +'. The max is in the tooltip, not in the value; − is off at the minimum and + at the maximum. */
export function Stepper({ icon, label, value, min = 1, max, onChange, title, testId, className = '', unit = 'version' }: { icon?: ChipIcon; label: ReactNode; value: number; min?: number; max: number; onChange: (v: number) => void; title?: string; testId?: string; className?: string; unit?: string }) {
  const tip = title ?? `Up to ${max} ${unit}s`;
  return <div className={`sc sc-row vs-qrow sc-static stepper ${className}`} data-testid={testId} title={tip} role="group" aria-label={typeof label === 'string' ? label : undefined}>
    <ChipGlyph icon={icon} /><span className="sc-l">{label}</span>
    <span className="stp swap-step"><button type="button" className="stp-b" aria-label={`Fewer ${unit}s`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}><MinusIcon size={16} /></button>
      <output className="stp-v" aria-live="polite" aria-label={`${value} of up to ${max}`}>{value}</output>
      <button type="button" className="stp-b" aria-label={`More ${unit}s`} title={value >= max ? `${max} is the most` : undefined} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><PlusIcon size={16} /></button></span></div>;
}
