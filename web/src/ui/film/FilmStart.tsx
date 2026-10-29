/**
 * Start a film: the built-in sample ("Goodbye", when its clips are on this computer) or a blank film. Shown on an empty film list and on a
 * film with no cards yet. A sample opens as a fresh copy you can change and stitch; the original stays as it is.
 */
import { PlusIcon, StitchIcon } from '../Icons';
import type { FilmSample } from './types';

export function FilmStart({ samples, busy, onSample, onBlank, blankLabel = 'Blank film', blankNote = 'Add your first shot and build from there' }: {
  samples: FilmSample[]; busy: boolean; onSample: (x: FilmSample) => void; onBlank: () => void; blankLabel?: string; blankNote?: string }) {
  const ready = samples.filter(x => x.available);
  return <div className="fm-start" data-testid="film-start">
    {ready.map(x => <button key={x.name} type="button" className="fm-start-tile fm-start-sample" onClick={() => onSample(x)} disabled={busy} data-testid={`film-start-${x.name}`}>
      <span className="fm-start-ic" aria-hidden><StitchIcon size={20} /></span>
      <span className="fm-start-t"><b>Start from {x.title}</b><span className="fm-start-tag">Sample</span></span>
      <small>{x.shotCount ? `${x.shotCount} shots, ` : ''}a short drama with its takes, joins and sound. Open a copy, change anything, stitch it.</small>
    </button>)}
    <button type="button" className="fm-start-tile" onClick={onBlank} disabled={busy} data-testid="film-start-blank">
      <span className="fm-start-ic" aria-hidden><PlusIcon size={20} /></span>
      <span className="fm-start-t"><b>{blankLabel}</b></span>
      <small>{blankNote}</small>
    </button>
  </div>;
}
