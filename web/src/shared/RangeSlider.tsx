/**
 * A slider in our style (2026-10-31): − and + buttons around a slim track with an orange fill and a small handle, and the value
 * beside it. A native range input underneath (keyboard, screen readers); the look is ours, not the system's.
 */
import { MinusIcon, PlusIcon } from '../ui/Icons';
import { tip } from './Tooltip';
import './rangeSlider.css';

export function RangeSlider({ label, value, min, max, step, nudge, onChange, format = String, testId, className = '' }: {
  label: string; value: number; min: number; max: number; step: number; /** what − and + move by (default: a tenth of the range) */ nudge?: number;
  onChange: (v: number) => void; format?: (v: number) => string; testId?: string; className?: string;
}) {
  const by = nudge ?? (max - min) / 10; const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const pct = max > min ? ((clamp(value) - min) / (max - min)) * 100 : 0;
  return <div className={`rs2 ${className}`.trim()} data-testid={testId}>
    <button type="button" className="rs2-b" aria-label={`Less ${label.toLowerCase()}`} {...tip('Less')} disabled={value <= min} onClick={() => onChange(clamp(value - by))}><MinusIcon size={14} /></button>
    <input type="range" className="rs2-in" min={min} max={max} step={step} value={value} aria-label={label} aria-valuetext={format(value)}
      style={{ '--pct': `${pct}%` } as React.CSSProperties} onChange={(e) => onChange(+e.target.value)} data-testid={testId && `${testId}-range`} />
    <button type="button" className="rs2-b" aria-label={`More ${label.toLowerCase()}`} {...tip('More')} disabled={value >= max} onClick={() => onChange(clamp(value + by))}><PlusIcon size={14} /></button>
    <b className="rs2-v" aria-hidden>{format(value)}</b>
  </div>;
}
