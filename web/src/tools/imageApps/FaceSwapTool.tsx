/* Face Swap (app-face-swap) and Person Swap (app-person-swap, same page, second slot `person`): the face (or whole person) from one photo onto the person in another. Target photo + Face, optional touch-ups,
 * the shared model menu / route / real-cost Generate bar. Runs Create Image's edit mode (server tools/apps.ts APP_GALLERY face-swap). */
import { useEffect, useState } from 'react';
import Workspace from '../../ui/Workspace';
import GenerateBar from '../../shared/GenerateBar';
import JobProgress from '../../shared/JobProgress';
import FailureCard from '../../shared/FailureCard';
import ResultView, { ResultPlaceholder } from '../../shared/ResultView';
import { FieldIssue } from '../../ui/IssueList';
import { defaultsOf } from '../../shared/defaults';
import { demoMessage, runBlock, shownCredits } from '../../shared/quote';
import { useDraftField } from '../../shared/batch1';
import { usePrefill } from '../../shared/usePrefill';
import { useToolQuery } from '../../shared/useToolQuery';
import { LIMITS } from '../../shared/limits';
import { estimate, jobStages, type ToolInfo } from '../../api';
import type { Ref } from '../../shared/References';
import { useAppQuote, useAppSubmit, PhotoSlot, refOf, newSeed } from './shared';
import { FeatureLine } from '../../shared/FeatureCredit';

export default function FaceSwapTool({ tool }: { tool: ToolInfo }) {
  const q0 = useToolQuery(); const gal: any = (tool as any).app?.gallery ?? {};
  const person = tool.id === 'app-person-swap'; const slot2 = person ? 'person' : 'face'; const what = person ? 'person swap' : 'face swap';
  const label = (n: string, d: string) => String((tool.inputs.find(i => i.name === n) as any)?.label ?? d).replace(/\s*\(optional\)\s*$/i, '');
  const [target, setTarget] = useState<Ref | null>(null); const [face, setFace] = useState<Ref | null>(null);
  const [prompt, setPrompt] = useDraftField(tool.id, 'prompt', '');
  const [provider, setProvider] = useDraftField(tool.id, 'provider', tool.defaultProvider ?? '', v => typeof v === 'string' && tool.providers.some(p => p.id === v));
  const [seed, setSeed] = useState(() => newSeed()); const [resolution, setResolution] = useState('720p');
  /* Send to (an image result → this page) fills the target; Recreate restores both photos, the touch-ups and the model. */
  usePrefill({ onImage: r => setTarget(r), onRefs: rs => { if (rs[0]) setFace(rs[0]); },
    onFiles: (slot, fs) => { if (slot === 'refs' && fs[0]) setFace(fs[0]); if (slot === slot2 && fs[0]) setFace(fs[0]); },
    onRecreate: r => { if (r.form.prompt != null) setPrompt(String(r.form.prompt)); const pv = r.form.provider || r.model; if (pv && tool.providers.some(p => p.id === pv)) setProvider(pv); } });
  const S = useAppSubmit(tool);
  const quote = useAppQuote(tool, provider, { image: '1', refs: '2', [slot2]: '1' } /* priced as the job: target + face / person */);
  const missing: string[] = []; if (!target) missing.push(`a ${label('image', 'target photo').toLowerCase()}`); if (!face) missing.push(person ? 'a photo of the person' : 'a face photo');
  useEffect(() => { S.setIssues(is => is.filter(i => !((i.field === 'image' && target) || (i.field === slot2 && face)))); }, [target, face]); // eslint-disable-line react-hooks/exhaustive-deps
  const generate = () => { if (!target || !face) return; const fd = new FormData();
    fd.append('image', target.file, target.file.name); fd.append(slot2, face.file, face.file.name); fd.append('prompt', prompt); fd.append('seed', String(seed));
    if (provider) fd.append('provider', provider); if (q0.mockFail) fd.set('simulate', q0.mockFail); void S.submit(fd); setSeed(s => newSeed(s)); };
  const est = shownCredits(quote) ?? estimate(tool, 1, resolution, 1, { provider, types: ['edit'] });
  const cur = S.current; const busy = !!S.running;
  return <Workspace tool={tool} panel={<>
    <FeatureLine featureId={person ? 'person-swap' : 'face-swap'} providerId={provider} />
    <section className="card ia-photos" data-testid={person ? 'person-swap-photos' : 'face-swap-photos'}>
      <h2>Photos</h2>
      <p className="helper">{person ? 'The person from the second photo replaces the person in the first: face, hair, body and outfit. Pose, framing and the scene stay.' : 'The face from the second photo goes onto the person in the first. Pose, light, hair and background stay.'}</p>
      <div className="sp-row ia-row">
        <PhotoSlot id="target" label={label('image', 'Target photo')} hint="Add the photo to change" r={target} onFile={f => setTarget(refOf(f))} onClear={() => setTarget(null)} disabled={busy}><FieldIssue issues={S.issues} field="image" /></PhotoSlot>
        <span className="sp-arrow" aria-hidden>←</span>
        <PhotoSlot id={slot2} label={label(slot2, person ? 'Person' : 'Face')} hint={person ? 'Add a photo of the person' : 'Add a clear face photo'} r={face} onFile={f => setFace(refOf(f))} onClear={() => setFace(null)} disabled={busy}><FieldIssue issues={S.issues} field={slot2} /></PhotoSlot>
      </div>
      {Array.isArray(gal.notes) && gal.notes.length > 0 && <ul className="helper app-notes" data-testid="app-notes">{gal.notes.map((n: string) => <li key={n}>{n}</li>)}</ul>}
    </section>
    <section className="card">
      <label className="field" htmlFor="fs-prompt">TOUCH-UPS <span className="helper">optional</span></label>
      <textarea data-enter-submits="" id="fs-prompt" rows={2} maxLength={LIMITS.maxPrompt} placeholder="e.g. keep the freckles, slightly warmer skin tone" value={prompt} onChange={e => setPrompt(e.target.value)} />
      <FieldIssue issues={S.issues} field="prompt" />
    </section>
    <section className="card">
      <h2>Generate</h2>
      <GenerateBar toolId={tool.id} media="image" audio={false} hideQuality hideGpu rows quotePending={!quote} quote={quote} demo={demoMessage(quote)} priceUnavailable={runBlock(quote)}
        resolution={resolution} setResolution={setResolution} seed={seed} setSeed={setSeed} backend={tool.backend} providers={tool.providers} defaults={defaultsOf(tool, 'edit')} provider={provider} setProvider={setProvider}
        estSec={quote ? est : 0} issues={S.issues} missing={missing} onGenerate={generate} />
      {S.running && <div className="mt-16"><JobProgress job={S.running} stages={jobStages(tool, S.running)} onUpdate={S.refresh} /></div>}
    </section>
  </>} stage={<>
    {cur && <FailureCard job={cur} onRetry={cur.id ? S.retry(cur.id) : undefined} />}
    {cur && S.active(cur) && <ResultPlaceholder title={`Your ${what}`} compare={false} audioChip={false} />}
    {cur?.status === 'done' && <ResultView reserve key={cur.id} job={cur} beforeImage={cur.input?.imageUrl ?? target?.url} beforeUrl={cur.resultUrl!} title={`Your ${what}`} audio={false}
      extraActions={<button className="btn" onClick={generate} disabled={!target || !face || busy}>Generate again (new seed)</button>} />}
  </>} />;
}
