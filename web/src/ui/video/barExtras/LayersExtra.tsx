/**
 * Layers in the Video bar (2026-11-07; server/src/layers). The recipe (server/src/shared/videoBar.ts) gives the clip and the three options
 * (Clean edges, Depth, Clean background, all on). This adds what a recipe can't say: "What to split out", up to four names typed as chips
 * (each becomes its own layer, in its own colour), sent as objects=["woman","steam"]. Generate waits until there is at least one name.
 */
import { useState } from 'react';
import type { BarExtra, UseBarExtra } from './types';
import { BarPopover, PopSection, PopNote } from '../../../shared/BarPop';
import { tip } from '../../../shared/Tooltip';
import { LayersIcon, CloseIcon } from '../../Icons';
import { LAYERS_MAX_OBJECTS, LAYER_COLOURS, cleanObjectName, objectNames } from '../../../../../server/src/layers/constants';
import './layersExtra.css';

const IDEAS = ['person', 'woman', 'dog', 'car', 'steam', 'neon sign', 'sky', 'tree'];

export const useLayersExtra: UseBarExtra = () => {
  const [names, setNames] = useState<string[]>([]); const [draft, setDraft] = useState('');
  const add = (s: string) => { const n = cleanObjectName(s); setDraft('');
    if (n) setNames((l) => (l.length >= LAYERS_MAX_OBJECTS || l.some((x) => x.toLowerCase() === n.toLowerCase()) ? l : [...l, n])); };
  const remove = (k: number) => setNames((l) => l.filter((_, i) => i !== k));
  const full = names.length >= LAYERS_MAX_OBJECTS;
  const summary = names.length ? names.join(', ') : 'Add names';
  const ex: BarExtra = {
    needs: () => (names.length ? [] : [{ missing: 'Name what to split out', group: 'objects' }]),
    form: () => ({ objects: JSON.stringify(names) }),
    /* the price follows Clean background (the quote takes it as the mode: server/src/layers/constants.ts layersMode) */
    quote: (c) => ({ types: c.valOf('background') === '0' ? 'split' : 'with-plate' }),
    onReset: () => { setNames([]); setDraft(''); },
    onRecreate: (f) => setNames(objectNames(f.objects ?? f.prompt).slice(0, LAYERS_MAX_OBJECTS)),
    chips: (c) => { const on = c.pop === 'g:objects';
      return <button key="objects" ref={c.chipRef('objects')} type="button" className={`ic-chip wf-grp wf-fold${on ? ' on' : ''}${names.length ? '' : ' vbar-need'}`} aria-haspopup="dialog" aria-expanded={on}
        data-testid="vbar-group-objects" aria-label={`What to split out: ${summary}`} {...tip(on ? null : 'Each name becomes its own layer')} onClick={() => c.setPop(on ? '' : 'g:objects')}>
        <LayersIcon size={14} /><span className="wf-grp-l">Split out</span>
        <b className="lyx-sum">{names.length ? names.map((n, k) => <span key={n} className="lyx-dot-name"><i className="lyx-dot" style={{ background: LAYER_COLOURS[k] }} aria-hidden />{n}</span>) : 'Add names'}</b></button>; },
    pops: (c) => <BarPopover key="objects" open={c.pop === 'g:objects'} anchor={c.anchorOf('objects')} avoid={c.dock} watch={c.dock} placement="top" gap={8} onClose={() => c.setPop('')} label="What to split out" testId="vbar-pop-objects" width={380}>
      <PopSection label="What to split out" aside={`${names.length} of ${LAYERS_MAX_OBJECTS}`} testId="vbar-objects-list">
        {names.length > 0 && <ul className="lyx-chips">{names.map((n, k) => <li key={n} className="lyx-chip" data-testid={`vbar-object-${k}`}>
          <i className="lyx-dot" style={{ background: LAYER_COLOURS[k] }} aria-hidden /><span>{n}</span>
          <button type="button" className="lyx-x" aria-label={`Remove ${n}`} data-testid={`vbar-object-remove-${k}`} onClick={() => remove(k)}><CloseIcon size={12} /></button></li>)}</ul>}
        <input className="vbar-text" type="text" maxLength={40} disabled={full} autoFocus value={draft} data-testid="vbar-object-input" aria-label="Add a name"
          placeholder={full ? `That’s ${LAYERS_MAX_OBJECTS}: remove one to add another` : names.length ? 'Add another, then press Enter' : 'e.g. woman, then press Enter'}
          onChange={(e) => { const v = e.target.value; if (/[,\n]$/.test(v)) add(v.slice(0, -1)); else setDraft(v); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } else if (e.key === 'Backspace' && !draft && names.length) remove(names.length - 1); }}
          onBlur={() => { if (draft.trim()) add(draft); }} />
      </PopSection>
      {!full && <PopSection label="Ideas" testId="vbar-objects-ideas"><div className="vbar-quick">
        {IDEAS.filter((x) => !names.some((n) => n.toLowerCase() === x)).slice(0, 6).map((x) => <button key={x} type="button" className="vbar-qchip" data-testid={`vbar-object-idea-${x.replace(/\s+/g, '-')}`} onClick={() => add(x)}>{x}</button>)}
      </div></PopSection>}
      <PopNote testId="vbar-objects-note">Name things you can see on the first frame. One or two words work best. Everything you don’t name stays in the background.</PopNote>
    </BarPopover>,
  };
  return ex;
};
