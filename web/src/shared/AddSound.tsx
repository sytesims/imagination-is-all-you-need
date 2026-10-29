import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createJob, newIdemKey } from '../api';
import { navigate } from '../platform/router';
import { etaRangeOf, etaOnDevice, deviceWhere } from './eta';
import { soundPlan, mixQuestion, blockedReason, ADD_SOUND_PROVIDER, ADD_SOUND_MODEL, ADD_SOUND_ROUTE } from './addSoundLogic';

/** One-click "Add sound" on a video result: MMAudio (local, free) listens to the clip's action and makes music + sound effects timed to it,
 *  muxed back onto the same video as a new take linked to this one. POST /api/tools/soundtrack/jobs {fromJob, output, types:["v2s"],
 *  provider:"comfy-mmaudio", prompt?, mix}. The full Add soundtrack tool (music models, sound effects by prompt) stays one link away. */
export function AddSoundDialog({ jobId, output = 0, durationSec, hasAudio, onClose, onStarted }: { jobId: string; output?: number; durationSec?: number | null;
  /** the clip's own sound (output metadata): false → no Replace / Mix question */ hasAudio?: boolean | null; onClose: () => void;
  /** after the job starts (default: open it, /jobs/:id) */ onStarted?: (id: string) => void }) {
  const [prompt, setPrompt] = useState(''); const [mix, setMix] = useState<'replace' | 'blend'>('replace');
  const [q, setQ] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const plan = soundPlan(durationSec); const mq = mixQuestion(hasAudio);
  useEffect(() => { let live = true; const p = new URLSearchParams({ mode: 'v2s', types: '["v2s"]', provider: ADD_SOUND_PROVIDER, route: ADD_SOUND_ROUTE, ...(plan.seconds ? { duration: String(Math.round(plan.seconds)) } : {}) });
    fetch(`/api/tools/soundtrack/price?${p}`).then(r => r.ok ? r.json() : null).then(d => live && setQ(d ?? { failed: true })).catch(() => live && setQ({ failed: true })); return () => { live = false; }; }, [plan.seconds]);
  useEffect(() => { box.current?.querySelector('input')?.focus(); const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const free = q && !q.failed && (q.free || q.credits === 0);
  const price = !q ? 'Checking price…' : q.failed ? 'Price unavailable' : free ? 'Free · runs on your ComfyUI' : q.priceLine ?? `${q.credits} credits`;
  const eta = q && !q.failed ? etaOnDevice(etaRangeOf(q), deviceWhere()) : '';
  const blocked = blockedReason(q);
  const missGB = !blocked && Number(q?.requirements?.missingBytes) > 0 ? Number(q.requirements.downloadGB) : 0;
  async function go() {
    setBusy(true); setErr('');
    const fd = new FormData(); fd.set('fromJob', jobId); fd.set('output', String(output)); fd.set('types', '["v2s"]'); fd.set('provider', ADD_SOUND_PROVIDER); fd.set('route', ADD_SOUND_ROUTE); fd.set('mix', mq.ask ? mix : 'replace');
    if (prompt.trim()) fd.set('prompt', prompt.trim());
    try { const r = await createJob('soundtrack', fd, { idemKey: newIdemKey() }); onClose(); if (onStarted) onStarted(r.id); else navigate(`/jobs/${r.id}`); }
    catch (e) { setErr((e as Error).message || 'Couldn’t start. Nothing was charged.'); } finally { setBusy(false); }
  }
  return createPortal(<div className="dlg-scrim asd-scrim" data-testid="asd-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div ref={box} className="dlg asd-box" role="dialog" aria-modal="true" aria-labelledby="asd-title" data-testid="add-sound">
      <h3 id="asd-title">Add sound</h3>
      <p className="asd-sub">Music and sound effects timed to what happens in the clip, on the same video. Model: <b>{ADD_SOUND_MODEL}</b>.</p>
      <label className="asd-lbl" htmlFor="asd-prompt">Describe the sound <small>optional</small></label>
      <input id="asd-prompt" className="asd-in" data-testid="asd-prompt" maxLength={300} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !busy && !blocked) go(); }}
        placeholder="Auto: from the clip. Or e.g. rain and distant thunder" />
      {mq.note && <p className="asd-q" data-testid={mq.ask ? 'asd-has-sound' : 'asd-silent'}>{mq.note}</p>}
      {mq.ask && <div className="asd-seg" role="radiogroup" aria-label="The clip's own sound">
        <button type="button" role="radio" aria-checked={mix === 'replace'} className={mix === 'replace' ? 'on' : ''} data-testid="asd-mix-replace" onClick={() => setMix('replace')}>Replace sound</button>
        <button type="button" role="radio" aria-checked={mix === 'blend'} className={mix === 'blend' ? 'on' : ''} data-testid="asd-mix-blend" onClick={() => setMix('blend')}>Mix with original</button>
      </div>}
      <ul className="asd-facts" data-testid="asd-facts">
        <li data-testid="asd-price"><b className={free ? 'asd-free' : ''}>{price}</b></li>
        {eta && <li data-testid="asd-eta">{eta}</li>}
        {plan.note && <li data-testid="asd-parts">{plan.note}</li>}
        {missGB > 0 && <li data-testid="asd-download">Needs the MMAudio files on your ComfyUI (about {missGB.toFixed(1)} GB) if they aren’t there yet</li>}
        {blocked && <li className="asd-warn" data-testid="asd-blocked">{blocked}</li>}
      </ul>
      {err && <p className="inline-err" role="alert" data-testid="asd-err">{err}</p>}
      <div className="asd-acts">
        <a className="asd-more" href={`/tools/soundtrack?from=${encodeURIComponent(jobId)}&out=${output}`} onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onClose(); navigate(`/tools/soundtrack?from=${encodeURIComponent(jobId)}&out=${output}`); }} data-testid="asd-full">More options</a>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-sm btn-primary" data-testid="asd-go" disabled={busy || !!blocked} onClick={go}>{busy ? 'Starting…' : 'Add sound'}</button>
      </div>
    </div></div>, document.body);
}
