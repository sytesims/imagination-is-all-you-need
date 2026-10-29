import { ReactNode } from 'react';
/** #11 Image-tool layout: centered hero + bottom-docked prompt bar with setting chips and Generate. */
export function ImageHero({ art, title, sub }: { art: string[]; title: string; sub: string }) {
  return <div className="ih"><div className="ih-fan">{art.slice(0, 5).map((a, i) => <img key={a} src={a} alt="" style={{ ['--i' as string]: i - 2 } as React.CSSProperties} />)}</div><h1>{title}</h1><p>{sub}</p></div>;
}
export default function PromptDock({ value, onChange, placeholder, chips, generate, onAttach }: { value: string; onChange: (s: string) => void; placeholder?: string; chips: ReactNode; generate: ReactNode; onAttach?: () => void }) {
  return (
    <div className="dock">
      <div className="dock-main">
        <textarea rows={2} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        <div className="dock-chips">{onAttach && <button className="dock-chip icon" aria-label="Attach image" onClick={onAttach}>＋</button>}{chips}</div>
      </div>
      <div className="dock-gen">{generate}</div>
    </div>
  );
}
export function DockChip({ icon, children, onClick, on }: { icon?: string; children: ReactNode; onClick?: () => void; on?: boolean }) {
  return <button className={`dock-chip ${on ? 'on' : ''}`} onClick={onClick}>{icon && <i>{icon}</i>}{children}</button>;
}
export function CountStepper({ value, options = [1, 2, 4], onChange }: { value: number; options?: number[]; onChange: (n: number) => void }) {
  const i = options.indexOf(value);
  return <span className="dock-chip stepper" title={`Up to ${options[options.length - 1]}`}><button aria-label="Fewer" disabled={i <= 0} onClick={() => onChange(options[i - 1])}>−</button><b aria-live="polite">{value}</b><button aria-label="More" disabled={i >= options.length - 1} onClick={() => onChange(options[i + 1])}>+</button></span>;
}
