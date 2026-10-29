import { PopSection, PopSwitch, Segmented } from './BarPop';
import { optField, TEXT_OPTION_MAX, type ModelOptions, type ModelOption, type OptionValue } from '../../../server/src/shared/imageOptions';

/** A model's own options (server/src/shared/imageOptions.ts: Luma's Look, Recraft's controls…) as one small group in a bar's Settings
 *  popover, drawn with the shared bar controls (BarPop). Any composer bar can use it: pass the model's `options` from its caps, the
 *  picked values and a setter. Values left unset mean "the model's own default" and are not sent. */
export type OptionValues = Record<string, OptionValue | undefined>;

/** The form fields for the picked values (opt_<key>): only what differs from the model's default. */
export function optionFields(spec: ModelOptions | null | undefined, v: OptionValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of spec?.options ?? []) { const x = v[o.key]; if (x == null || x === o.default || (Array.isArray(x) && !x.length) || !shown(spec!, o, v) || (typeof x === 'string' && !x.trim())) continue;
    out[optField(o.key)] = Array.isArray(x) ? x.join(',') : typeof x === 'boolean' ? (x ? '1' : '0') : String(x); }
  return out;
}

/** An option with `when` shows (and is sent) only while that switch is on (FIBO's Structured fields). */
const shown = (spec: ModelOptions, o: ModelOption, v: OptionValues) => { if (!o.when) return true; const w = spec.options.find(x => x.key === o.when); return (v[o.when] ?? w?.default) === true; };

const Swatch = ({ value, onPick, label, testId }: { value: string | null; onPick: (v: string) => void; label: string; testId?: string }) =>
  <label className={`mo-sw${value ? '' : ' mo-sw-none'}`} title={label} style={value ? { background: value } : undefined}>
    <input type="color" value={(value ?? '#808080').toLowerCase()} /* empty: mid grey, so picking orange or black still counts as a change */ aria-label={label} data-testid={testId} onChange={e => onPick(e.target.value.toUpperCase())} /></label>;

function Option({ o, v, set, testId, solo }: { o: ModelOption; v: OptionValue | undefined; set: (x: OptionValue | undefined) => void; testId: string; /** the group's only option: the section title names it */ solo?: boolean }) {
  const t = `${testId}-${o.key}`;
  if (o.kind === 'switch') return <PopSwitch rowTestId={t} label={o.label} hint={o.hint} on={(v ?? o.default) === true} onChange={x => set(x)} />;
  if (o.kind === 'choice') { const cur = String(v ?? o.default ?? o.choices?.[0]?.value ?? '');
    return <div className="mo-opt">{!solo && <span className="mo-l">{o.label}</span>}
      <Segmented label={o.label} testId={t} value={cur} onChange={x => set(x)} options={(o.choices ?? []).map(c => ({ value: c.value, label: c.label, hint: c.hint, testId: `${t}-${c.value}` }))} /></div>; }
  if (o.kind === 'level') { const cur = v == null ? 'auto' : String(v); const lv = Array.from({ length: (o.max ?? 5) - (o.min ?? 0) + 1 }, (_, k) => String((o.min ?? 0) + k));
    return <div className="mo-opt"><span className="mo-l">{o.label}</span>
      <Segmented label={o.label} testId={t} className="mo-tight" value={cur} onChange={x => set(x === 'auto' ? undefined : Number(x))} options={[{ value: 'auto', label: 'Auto', testId: `${t}-auto` }, ...lv.map(x => ({ value: x, label: x, testId: `${t}-${x}` }))]} />
      {o.hint && <small className="mo-h">{o.hint}</small>}</div>; }
  if (o.kind === 'text') return <label className="mo-opt mo-text" data-testid={t}><span className="mo-l">{o.label}</span>
    <input type="text" className="mo-in" value={typeof v === 'string' ? v : ''} placeholder={o.placeholder} maxLength={o.max ?? TEXT_OPTION_MAX} aria-label={o.label} data-testid={`${t}-input`}
      onChange={e => set(e.target.value ? e.target.value : undefined)} /></label>;
  if (o.kind === 'color') { const cur = typeof v === 'string' ? v : null;
    return <div className="mo-row" data-testid={t}><span className="bp-row-t"><b>{o.label}</b><small>{cur ?? o.hint ?? 'The model decides'}</small></span>
      <Swatch value={cur} label={`Pick the ${o.label.toLowerCase()}`} testId={`${t}-pick`} onPick={x => set(x)} />
      {cur && <button type="button" className="mo-clear" data-testid={`${t}-clear`} aria-label={`Clear the ${o.label.toLowerCase()}`} onClick={() => set(undefined)}>Clear</button>}</div>; }
  const list = Array.isArray(v) ? v : []; const max = o.max ?? 3; // colors
  return <div className="mo-row" data-testid={t}><span className="bp-row-t"><b>{o.label}</b><small>{list.length ? `${list.length} of ${max}` : o.hint ?? 'The model decides'}</small></span>
    <span className="mo-sws">{list.map((c, k) => <span key={k} className="mo-sw-wrap"><Swatch value={c} label={`Colour ${k + 1}`} testId={`${t}-${k}`} onPick={x => set(list.map((y, j) => j === k ? x : y))} />
      <button type="button" className="mo-x" aria-label={`Remove colour ${k + 1}`} data-testid={`${t}-${k}-remove`} onClick={() => set(list.filter((_, j) => j !== k))}>×</button></span>)}
      {list.length < max && <Swatch value={null} label="Add a colour" testId={`${t}-add`} onPick={x => set([...list, x])} />}</span></div>;
}

/** The group: a section titled by the model's list ("Style") with "Same price" on the right, then its options. */
export function ModelOptionsGroup({ spec, values, onChange, testId = 'mo' }: { spec: ModelOptions; values: OptionValues; onChange: (key: string, v: OptionValue | undefined) => void; testId?: string }) {
  return <PopSection label={spec.label} aside={<span className="mo-same">Same price</span>} testId={testId} className="mo">
    {spec.options.filter(o => shown(spec, o, values)).map(o => <Option key={o.key} o={o} v={values[o.key]} set={x => onChange(o.key, x)} testId={testId} solo={spec.options.length === 1} />)}
  </PopSection>;
}
