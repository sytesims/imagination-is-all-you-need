/** C2: shown after Recreate. Off (default) = a new seed, a new take with the same settings; on = the original seed. */
export default function SameSeed({ seed, on, onChange }: { seed: number; on: boolean; onChange: (v: boolean) => void }) {
  return <label className={`same-seed ${on ? 'on' : ''}`} data-testid="same-seed" title={on ? `Reusing the original seed ${seed}` : 'A new seed is picked for this run'}>
    <input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} />
    <span className="ss-knob" aria-hidden /> Same seed{on ? ` · ${seed}` : ''}
  </label>;
}
