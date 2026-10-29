/** #13 Mode segmented control at the top of the panel, and a labelled switch (e.g. Prompt). */
export function ModeSeg<T extends string>({ modes, value, onChange }: { modes: [T, string][]; value: T; onChange: (m: T) => void }) {
  return <div className="mode-seg" role="radiogroup">{modes.map(([k, l]) => <button key={k} role="radio" aria-checked={k === value} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return <label className="sw-row"><span>{label}</span><button role="switch" aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><i /></button></label>;
}
