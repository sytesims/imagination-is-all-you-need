/* Shots (app-shots): one photo → a set of camera angles of the same subject (up to 9), one image per angle.
 * Angle chips (all nine by default), optional subject line, the shared Generate bar; price = angles × the one-image price (server quote).
 * Results: a 3-column grid with a download and Send to per shot, plus Download all (the jobs ZIP). Server: tools/apps.ts APP_GALLERY shots. */
import { useEffect, useMemo, useState } from 'react';
import Workspace from '../../ui/Workspace';
import GenerateBar from '../../shared/GenerateBar';
import JobProgress from '../../shared/JobProgress';
import FailureCard from '../../shared/FailureCard';
import { FieldIssue } from '../../ui/IssueList';
import { defaultsOf } from '../../shared/defaults';
import { demoMessage, runBlock, shownCredits } from '../../shared/quote';
import { useDraftField } from '../../shared/batch1';
import { usePrefill } from '../../shared/usePrefill';
import { useToolQuery } from '../../shared/useToolQuery';
import { LIMITS } from '../../shared/limits';
import { DownloadIcon } from '../../ui/Icons';
import { cleanHref } from '../../shared/sharePrefs';
import SendTo from '../../platform/SendTo';
import { Link } from '../../platform/router';
import { estimate, jobStages, type JobState, type ToolInfo } from '../../api';
import type { Ref } from '../../shared/References';
import { FeatureLine } from '../../shared/FeatureCredit';
import { useAppQuote, useAppSubmit, PhotoSlot, refOf, newSeed } from './shared';

type Angle = { value: string; label: string; description?: string };
const parseIds = (v: unknown, all: string[]): string[] | null => { try { const x = JSON.parse(String(v)); const ids = (Array.isArray(x) ? x : [x]).map((y: any) => String(y?.id ?? y)); const ok = all.filter(a => ids.includes(a)); return ok.length ? ok : null; } catch { return null; } };

export default function ShotsTool({ tool, tools = [] }: { tool: ToolInfo; tools?: ToolInfo[] }) {
  const q0 = useToolQuery();
  const po: { field: string; label: string; max: number; options: Angle[] } = (tool as any).app?.gallery?.perOutput ?? { field: 'shots', label: 'Angles', max: 9, options: [] };
  const all = useMemo(() => po.options.map(o => o.value), [po.options]); const notes: string[] = (tool as any).app?.gallery?.notes ?? [];
  const [photo, setPhoto] = useState<Ref | null>(null);
  const [picked, setPicked] = useDraftField<string[]>(tool.id, 'shots', all, v => Array.isArray(v) && v.length > 0 && v.every(x => all.includes(String(x))));
  const [prompt, setPrompt] = useDraftField(tool.id, 'prompt', '');
  const [provider, setProvider] = useDraftField(tool.id, 'provider', tool.defaultProvider ?? '', v => typeof v === 'string' && tool.providers.some(p => p.id === v));
  const [seed, setSeed] = useState(() => newSeed()); const [resolution, setResolution] = useState('720p');
  usePrefill({ onImage: r => setPhoto(r), onRefs: rs => { if (rs[0]) setPhoto(rs[0]); },
    onRecreate: r => { if (r.form.prompt != null) setPrompt(String(r.form.prompt)); const ids = parseIds((r.form as any)[po.field], all); if (ids) setPicked(ids); const pv = r.form.provider || r.model; if (pv && tool.providers.some(p => p.id === pv)) setProvider(pv); } });
  const S = useAppSubmit(tool);
  const sel = all.filter(a => picked.includes(a)); // grid order
  const quote = useAppQuote(tool, provider, { image: '1', [po.field]: JSON.stringify(sel), n: String(sel.length || 1) });
  const missing: string[] = []; if (!photo) missing.push('a photo'); if (!sel.length) missing.push('at least one angle');
  useEffect(() => { if (photo) S.setIssues(is => is.filter(i => i.field !== 'image')); }, [photo]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : all.filter(a => [...p, id].includes(a)));
  const generate = () => { if (!photo || !sel.length) return; const fd = new FormData();
    fd.append('image', photo.file, photo.file.name); fd.append(po.field, JSON.stringify(sel)); fd.append('prompt', prompt); fd.append('seed', String(seed));
    if (provider) fd.append('provider', provider); if (q0.mockFail) fd.set('simulate', q0.mockFail); void S.submit(fd); setSeed(s => newSeed(s)); };
  const per = typeof quote?.perShotListCredits === 'number' ? quote.perShotListCredits : null;
  const est = shownCredits(quote) ?? estimate(tool, 1, resolution, 1, { provider, types: ['edit'], count: sel.length || 1 });
  const cur = S.current; const busy = !!S.running;
  return <Workspace tool={tool} panel={<>
    <FeatureLine featureId="camera-angles" providerId={provider} />
    <section className="card ia-photos">
      <h2>Photo</h2>
      <PhotoSlot id="photo" hideLabel label={String((tool.inputs.find(i => i.name === 'image') as any)?.label ?? 'Photo')} hint="Add one photo of your subject" r={photo} onFile={f => setPhoto(refOf(f))} onClear={() => setPhoto(null)} disabled={busy}><FieldIssue issues={S.issues} field="image" /></PhotoSlot>
    </section>
    <section className="card" data-testid="shots-angles">
      <div className="sh-head"><h2>{po.label} <span className="helper">{sel.length} of {all.length}</span></h2>
        <span className="sh-bulk"><button type="button" className="link-btn" onClick={() => setPicked(all)} disabled={sel.length === all.length}>All</button><button type="button" className="link-btn" onClick={() => setPicked([])} disabled={!sel.length}>None</button></span></div>
      <div className="sh-chips" role="group" aria-label={po.label}>{po.options.map(o => { const on = sel.includes(o.value); return <button key={o.value} type="button" role="checkbox" aria-checked={on} className={`chip sh-chip ${on ? 'on' : ''}`} data-testid={`shot-${o.value}`} title={o.description} onClick={() => toggle(o.value)}>
        <ShotGlyph id={o.value} /><span className="sh-l">{o.label}</span></button>; })}</div>
      <p className="helper sh-price" data-testid="shots-price-note">{sel.length ? `${sel.length} image${sel.length > 1 ? 's' : ''}, one per angle${per != null && per > 0 ? ` · ≈ $${(per / 100).toFixed(2)} each` : per === 0 && quote?.routeKind === 'local' ? ' · free, locally' : ''}.` : 'Pick at least one angle.'}</p>
      <FieldIssue issues={S.issues} field={po.field} />
      <label className="field mt-12" htmlFor="sh-prompt">SUBJECT <span className="helper">optional</span></label>
      <textarea data-enter-submits="" id="sh-prompt" rows={2} maxLength={LIMITS.maxPrompt} placeholder="e.g. a ceramic teapot with a bamboo handle" value={prompt} onChange={e => setPrompt(e.target.value)} />
      {notes.length > 0 && <ul className="helper app-notes" data-testid="app-notes">{notes.map(n => <li key={n}>{n}</li>)}</ul>}
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
    {cur && S.active(cur) && <ShotsGrid job={cur} pending={sel} options={po.options} tools={tools} />}
    {cur?.status === 'done' && <ShotsGrid job={cur} options={po.options} tools={tools} onAgain={busy ? undefined : generate} />}
  </>} />;
}

/** The result set: one tile per angle with Download and Send to; Download all = the jobs ZIP (every output + a settings file). */
function ShotsGrid({ job, pending, options, tools, onAgain }: { job: JobState; pending?: string[]; options: Angle[]; tools: ToolInfo[]; onAgain?: () => void }) {
  const done = job.status === 'done'; const outs = job.outputs ?? [];
  const tiles = done ? outs.map((o, k) => ({ key: `${k}`, label: o.label, url: o.url, k })) : (pending ?? []).map((id, k) => ({ key: id, label: options.find(o => o.value === id)?.label ?? id, url: '', k }));
  return <section className="card sh-result" data-testid="shots-result">
    <div className="result-head"><h2>{done ? 'Your shots' : 'Making your shots'} <span className="helper">{tiles.length}</span></h2>
      {done && <span className="row sh-actions"><a className="btn" href={`/api/jobs/download.zip?ids=${encodeURIComponent(job.id)}`} download data-testid="shots-download-all"><DownloadIcon size={15} /> Download all</a>
        <Link className="btn" to="/assets">Open in Assets</Link>{onAgain && <button type="button" className="btn" onClick={onAgain}>Generate again</button>}</span>}</div>
    <div className="sh-grid">{tiles.map(t => <figure key={t.key} className={`sh-tile ${t.url ? '' : 'ph'}`} data-testid="shot-tile">
      {t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="sh-img"><img src={t.url} alt={t.label} loading="lazy" /></a> : <span className="sh-img sh-ph" aria-hidden><i style={{ width: `${Math.max(4, job.progress ?? 0)}%` }} /></span>}
      <figcaption><span className="sh-cap">{t.label}</span>{t.url && <span className="sh-tools">
        <a className="btn btn-sm sh-dl" href={cleanHref(t.url)} download={`${job.id}-${t.label.replace(/[^\w]+/g, '-').toLowerCase()}.png`} aria-label={`Download ${t.label}`} title="Download"><DownloadIcon size={14} /></a>
        <SendTo job={job} tools={tools} out={t.k} /></span>}</figcaption>
    </figure>)}</div>
  </section>;
}

/** Tiny camera-position glyph per angle (our own drawing: subject dot, camera triangle). */
function ShotGlyph({ id }: { id: string }) {
  const cam: Record<string, [number, number, number]> = { front: [12, 20, 0], 'three-quarter-left': [5, 18, 45], 'three-quarter-right': [19, 18, -45], side: [3, 12, 90], back: [12, 4, 180], low: [12, 21, 0], high: [12, 20, 0], 'close-up': [12, 15, 0], wide: [12, 22, 0], 'over-shoulder': [8, 5, 150], 'full-body': [12, 22, 0] };
  const [x, y, r] = cam[id] ?? [12, 20, 0];
  return <svg className="sh-glyph" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="11" r={id === 'close-up' ? 4.5 : id === 'wide' || id === 'full-body' ? 2 : 3} />{id === 'full-body' && <path d="M12 13v5" />}
    {id === 'low' && <path d="M8 20l4-4 4 4" />}{id === 'high' && <path d="M8 3l4 4 4-4" />}
    {id !== 'low' && id !== 'high' && <path transform={`rotate(${r} ${x} ${y})`} d={`M${x - 2.5} ${y + 1.5}l2.5-3 2.5 3z`} />}
  </svg>;
}
