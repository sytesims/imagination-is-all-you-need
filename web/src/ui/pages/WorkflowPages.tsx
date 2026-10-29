import { Notice } from '../../shared/Notice';
import { useEffect, useRef, useState } from 'react';
import { Link, navigate } from '../../platform/router';
import { tip } from '../../shared/Tooltip';
import { useOwnAccounts } from '../../shared/billing';
import { durationText } from '../../shared/jobTiming';
import { askConfirm, askText } from '../../shared/Dialog';
import { useToast } from '../../shared/Toast';
import SplitPreview from '../../shared/SplitPreview';
import SaveLookDialog from '../../shared/SaveLookDialog';
import { ToolIconFor, OfficialBadgeIcon, CommunityIcon, SparkleIcon } from '../Icons';
import { loadWorkflow, loadLook, onLooksChanged, quoteText, paidText, lookUseHref, renameLook, deleteLook, type WorkflowDetail, type LookDetail, type LookTile, type HubExample, type HubSingle } from '../../shared/looks';
import { SHOWCASE_FOR, showcaseById } from '../../../../server/src/shared/showcase';
import { SafeImg, WfMedia } from './WorkflowMedia';
import NotFound from '../../platform/NotFound';
import './workflowHub.css';
/**
 * Workflows redesign (2026-10-23), the two pages under a card:
 *  - /workflows/:id: the hero example, what it does, Start creating (Create with this workflow picked), How it works (the ComfyUI graph each model
 *    runs, its source and licence, our file to download), what you give, the models it's best on with real prices, then its looks.
 *  - /workflows/:id/looks/:lookId: one look's prompt (editable before Use) and one card per model it really ran on (newest output, price paid,
 *    run time; the look's own model says "Made for this one"), plus up to 2 compatible models not run yet with their quote. "Test" only opens
 *    the Create bar with that model and the look filled in: nothing runs until you press Generate. A run started from the look shows up here.
 */
const SRC: Record<string, { label: string; Ic: typeof OfficialBadgeIcon }> = { official: { label: 'Official Comfy template', Ic: OfficialBadgeIcon }, community: { label: 'Community workflow', Ic: CommunityIcon }, ours: { label: 'Our own graph', Ic: SparkleIcon } };
const dateText = (ms: number | null) => ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
/** Refetch while the page is open and visible (a run started from a look appears without a reload). */
function usePoll(ms: number, f: () => void) { const ref = useRef(f); ref.current = f;
  useEffect(() => { const id = setInterval(() => { if (document.visibilityState === 'visible') ref.current(); }, ms); const v = () => { if (document.visibilityState === 'visible') ref.current(); };
    addEventListener('focus', v); return () => { clearInterval(id); removeEventListener('focus', v); }; }, [ms]); }

// ------------------------------------------------------------------ /workflows/:id
export function WorkflowPage({ id }: { id: string }) {
  const own = useOwnAccounts(); const [d, setD] = useState<WorkflowDetail | null>(null); const [err, setErr] = useState<{ status?: number; msg: string } | null>(null); const [tick, setTick] = useState(0);
  const [how, setHow] = useState(false); const [saving, setSaving] = useState(false); const howRef = useRef<HTMLElement>(null);
  useEffect(() => { let live = true; loadWorkflow(id).then(x => { if (live) { setD(x); setErr(null); } }).catch(e => live && setErr({ status: e?.status, msg: String(e?.message ?? 'Couldn’t load') })); return () => { live = false; }; }, [id, tick]);
  useEffect(() => onLooksChanged(() => setTick(t => t + 1)), []);
  usePoll(20_000, () => setTick(t => t + 1));
  if (err?.status === 404) return <NotFound path={location.pathname} />;
  if (err && !d) return <div className="wfh"><Crumb to="/workflows" label="Workflows" /><Notice kind="error" title="Couldn’t load this workflow." action={<button type="button" className="btn btn-sm" onClick={() => setTick(t => t + 1)}>Retry</button>} /></div>;
  if (!d) return <div className="wfh" aria-busy="true"><Crumb to="/workflows" label="Workflows" /><div className="wfd-hero"><span className="wfd-hero-media wfh-shim" /><span><span className="wfh-shim wfd-shim-t" /></span></div></div>;
  const w = d.workflow; const hw = w.howItWorks; const ex = showcaseExample(w.id) ?? w.example; const src = hw.source ? SRC[hw.source.kind] : null;
  const names = new Map<string, number>(); for (const l of d.looks) names.set(l.name.toLowerCase(), (names.get(l.name.toLowerCase()) ?? 0) + 1);
  const openHow = () => { setHow(true); requestAnimationFrame(() => howRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })); };
  return <div className="wfh wfd" data-testid="workflow-page">
    <Crumb to="/workflows" label="Workflows" />
    <div className="wfd-hero">
      {ex?.kind === 'split' ? <SplitPreview className="wfd-hero-media" testId="wfd-hero-split" before={ex.before} after={ex.after} beforeLabel={ex.beforeLabel} afterLabel={ex.afterLabel} eager />
        : <WfMedia ex={ex} className="wfd-hero-media" eager icon={<ToolIconFor id={w.toolId} size={28} strokeWidth={1.4} />} />}
      <div className="wfd-intro">
        <h1>{w.name}</h1>
        <p className="wfh-sub">{w.tagline}{/[.!?]$/.test(w.tagline) ? '' : '.'}{d.looks.length ? ' Start from a look below, or from a blank prompt.' : ''}</p>
        {ex?.model && <p className="wfd-exnote">Example made with {ex.model}</p>}
        <div className="wfd-acts"><Link to={w.createHref} className="btn wfh-pri" data-testid="wfd-start">Start creating</Link>
          <button type="button" className="btn" aria-expanded={how} aria-controls="wfd-how" data-testid="wfd-how-btn" onClick={() => how ? setHow(false) : openHow()}>How it works</button></div>
        <dl className="wfd-facts">
          <dt>You give</dt><dd data-testid="wfd-needs">{w.needs}{w.photo ? '' : '. A prompt is all it takes.'}</dd>
          <dt>Best on</dt><dd className="wfd-best" data-testid="wfd-best">{d.best.length ? d.best.map(b => { const q = quoteText(b.quote, own);
            return <span key={b.provider} className="wfd-mchip" {...tip(q.reason ?? (q.sample ? 'Sample run on this server: nothing billed' : null))}>{b.name}<span className={`wfd-mchip-p ${q.reason ? 'wfd-why' : ''}`}> · {q.price ?? q.reason}</span></span>; }) : <span className="wfd-muted">No model can run it here yet</span>}</dd>
          {src && <><dt>Workflow</dt><dd>{src.label} · <button type="button" className="link-btn wfd-link" onClick={openHow}>credited</button></dd></>}
        </dl>
      </div>
    </div>
    {how && <section ref={howRef} id="wfd-how" className="wfd-how" aria-label="How it works" data-testid="wfd-how">
      <h2 className="wfh-sec">How it works</h2>
      {hw.source && (hw.source.kind === 'ours' ? <p className="wfd-how-note">{hw.note ? `Our part is the ${hw.note} (our own code in this repo, AGPL-3.0). ` : ''}Each model below runs its own ComfyUI workflow, credited to its source.</p>
        : <p className="wfd-how-note">{SRC[hw.source.kind]?.label ?? 'Source'}: {hw.source.url ? <a href={hw.source.url} target="_blank" rel="noreferrer">{hw.source.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80)}<span aria-hidden> ↗</span></a> : hw.note}{hw.source.author ? ` · ${hw.source.author}` : ''}{hw.source.licence ? ` · ${hw.source.licence}` : ''}.</p>)}
      <ul className="wfd-how-list">{hw.models.map(m => { const s = m.workflow ? SRC[m.workflow.source] : null;
        return <li key={m.provider}><b>{m.name}</b>{m.workflow && s ? <span className="wfd-how-src"><span className={`wfp-badge wfp-${m.workflow.source}`}><s.Ic size={12} />{s.label}</span>
          {m.workflow.url ? <a href={m.workflow.url} target="_blank" rel="noreferrer">{m.workflow.line.replace(/^[^·]+·\s*/, '')}<span aria-hidden> ↗</span></a> : <span>{m.workflow.line.replace(/^[^·]+·\s*/, '')}</span>}
          {m.workflow.author && m.workflow.source !== 'ours' && <span className="wfd-muted"> · {m.workflow.author.replace(/^@/, '')}</span>}<span className="wfd-muted"> · {m.workflow.licence}</span>
          {m.workflow.file && <a className="wfp-dl" href={`/api/workflows/${encodeURIComponent(m.workflow.file)}`} download={m.workflow.file} data-testid="wfd-download">Download (.json)</a>}</span>
          : <span className="wfd-muted"> · No ComfyUI workflow for this model (runs on its own API)</span>}</li>; })}</ul>
    </section>}
    <h2 className="wfh-sec" data-testid="wfd-looks-h">Looks{d.looks.length ? ` · ${d.looks.length}, each with a real example made in this app` : ''}</h2>
    {!d.looks.length && <p className="wfd-invite" data-testid="wfd-no-looks">No looks yet. Save one from any image you made with {w.name}, and it shows here with its example.</p>}
    <div className="wfd-looks" data-testid="wfd-looks">
      {d.looks.map(l => <LookCard key={l.id} l={l} wf={w.id} own={own} dup={(names.get(l.name.toLowerCase()) ?? 0) > 1} />)}
      <button type="button" className="wfd-save" data-testid="wfd-save-tile" onClick={() => setSaving(true)}><b aria-hidden>+</b>Save your own look<small>from any image you made</small></button>
    </div>
    {saving && <SaveLookDialog workflow={{ id: w.id, name: w.name }} onClose={() => setSaving(false)} onSaved={l => navigate(`/workflows/${l.workflow}/looks/${l.id}`)} />}
  </div>;
}
function LookCard({ l, wf, own, dup }: { l: LookTile; wf: string; own: boolean | null; dup: boolean }) {
  const price = paidText(l.cover.paid, own); const model = l.cover.modelName;
  const href = `/workflows/${wf}/looks/${l.id}`; const label = `${l.name}${model ? `, tested on ${model}` : ''}`;
  /* a look made from a photo: the before / after follows the pointer (a slider for the keyboard), so the card is a div and its name the link */
  if (l.cover.inputUrl) return <div className="wfd-look" data-testid={`wfd-look-${l.id}`} onClick={e => { if (!(e.target as HTMLElement).closest('a')) navigate(href); }}>
    <span className="wfd-look-im"><SplitPreview before={l.cover.inputUrl} after={l.cover.url} testId="wfd-look-split" />{l.kind === 'mine' && <span className="wfd-yours">Yours</span>}</span>
    <Link to={href} className="wfd-look-b" aria-label={label}><LookText l={l} dup={dup} model={model} price={price} /></Link></div>;
  return <Link to={href} className="wfd-look" data-testid={`wfd-look-${l.id}`} aria-label={label}>
    <span className="wfd-look-im"><SafeImg src={l.cover.url} />{l.kind === 'mine' && <span className="wfd-yours">Yours</span>}</span>
    <span className="wfd-look-b"><LookText l={l} dup={dup} model={model} price={price} /></span>
  </Link>;
}
const LookText = ({ l, dup, model, price }: { l: LookTile; dup: boolean; model: string | null; price: string | null }) => <>
  <b className="wfd-look-n" title={l.name}>{l.name}</b>
  {dup && l.createdAt ? <span className="wfd-look-d">Saved {dateText(l.createdAt)}</span> : null}
  <span className="wfd-look-t"><span className="wfd-dot" aria-hidden />{model ? `Tested on ${model}` : 'Tested'}{price ? ` · ${price}` : ''}{l.models > 1 ? ` · ${l.models} models` : ''}</span></>;
/** The workflow's showcase pick (the same strong example as on /workflows), as the hero. */
function showcaseExample(id: string): HubExample | HubSingle | null {
  const s = SHOWCASE_FOR[id] ? showcaseById(SHOWCASE_FOR[id]) : undefined; if (!s) return null;
  if (s.before) { const c = s.before.crop; return { kind: 'split', before: c ? c.before : s.before.image, after: c ? c.after : s.image, beforeLabel: s.before.label, afterLabel: s.before.afterLabel, model: s.model }; }
  return { kind: 'single', url: s.image, model: s.model };
}
const Crumb = ({ to, label }: { to: string; label: string }) => <nav className="wfd-crumb" aria-label="Breadcrumb"><Link to={to} data-testid="wfd-crumb">← {label}</Link></nav>;

// ------------------------------------------------------------------ /workflows/:id/looks/:lookId
const SHOWN = 3;
export function LookPage({ id, lookId }: { id: string; lookId: string }) {
  const own = useOwnAccounts(); const toast = useToast();
  const [d, setD] = useState<LookDetail | null>(null); const [err, setErr] = useState<{ status?: number; msg: string } | null>(null); const [tick, setTick] = useState(0);
  const [prompt, setPrompt] = useState<string | null>(null); const [all, setAll] = useState(false); const [wfName, setWfName] = useState<string>('');
  useEffect(() => { let live = true; loadLook(id, lookId).then(x => { if (!live) return; setD(x); setErr(null); setPrompt(p => p ?? x.look.prompt); }).catch(e => live && setErr({ status: e?.status, msg: String(e?.message ?? 'Couldn’t load') })); return () => { live = false; }; }, [id, lookId, tick]);
  useEffect(() => { let live = true; loadWorkflow(id).then(x => live && setWfName(x.workflow.name)).catch(() => undefined); return () => { live = false; }; }, [id]);
  useEffect(() => onLooksChanged(() => setTick(t => t + 1)), []);
  usePoll(10_000, () => setTick(t => t + 1)); /* a run started from this look appears when it finishes */
  const back = { to: `/workflows/${id}`, label: wfName || 'Workflow' };
  if (err?.status === 404) return <div className="wfh"><Crumb {...back} /><Notice kind="info" testId="look-gone" title="This look isn’t here.">It was deleted, or none of its examples is left. <Link to={back.to}>Back to {back.label}</Link></Notice></div>;
  if (err && !d) return <div className="wfh"><Crumb {...back} /><Notice kind="error" title="Couldn’t load this look." action={<button type="button" className="btn btn-sm" onClick={() => setTick(t => t + 1)}>Retry</button>} /></div>;
  if (!d) return <div className="wfh" aria-busy="true"><Crumb {...back} /><span className="wfh-shim wfd-shim-t" /></div>;
  const l = d.look; const p = prompt ?? l.prompt; const hidden = d.workflow.promptMode === 'hidden';
  const use = (model: string | null) => lookUseHref(d.workflow.id, l.id, { model, prompt: hidden ? null : p, original: l.prompt });
  const results = all ? d.results : d.results.slice(0, SHOWN);
  const settings = Object.entries(l.settings).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
  const rename = async () => { const n = await askText({ title: 'Rename look', label: 'Name', initial: l.name, confirm: 'Rename', maxLength: 80 }); if (!n || n === l.name) return;
    try { await renameLook(l.id, n); toast(`Renamed to “${n}”`); } catch (e: any) { toast(String(e?.message ?? 'Couldn’t rename'), 'error'); } };
  const remove = async () => { if (!(await askConfirm({ title: `Delete “${l.name}”?`, body: 'The look goes. Its example image stays in your library.', confirm: 'Delete', danger: true }))) return;
    try { await deleteLook(l.id); toast(`Deleted “${l.name}”`); navigate(back.to); } catch (e: any) { toast(String(e?.message ?? 'Couldn’t delete'), 'error'); } };
  return <div className="wfh wfl" data-testid="look-page">
    <Crumb {...back} />
    <div className="wfl-head"><div className="wfl-title"><h1 title={l.name}>{l.name}</h1>
      <p className="wfh-sub">{l.description ? `${l.description} ` : ''}{l.kind === 'mine' ? `Your ${wfName || ''} look, saved ${dateText(l.createdAt)}.` : `A ${wfName || ''} look.`} The same look on each model it ran on, so you can pick before you spend.</p></div>
      {l.kind === 'mine' && <div className="wfl-own"><button type="button" className="btn btn-sm" data-testid="look-rename" onClick={rename}>Rename</button><button type="button" className="btn btn-sm btn-ghost" data-testid="look-delete" onClick={remove}>Delete</button></div>}</div>
    <div className="wfl-prompt">
      <div className="wfl-prompt-h"><label htmlFor="wfl-p">Prompt</label>{!hidden && <span>{p !== l.prompt ? <button type="button" className="link-btn" onClick={() => setPrompt(l.prompt)}>Reset</button> : 'Edit it before using'}</span>}</div>
      {hidden ? <p className="wfl-noprompt" data-testid="look-no-prompt">This workflow takes no prompt: the look is its settings.</p>
        : <textarea id="wfl-p" className="wfl-ta" data-testid="look-prompt" value={p} rows={3} maxLength={10_000} placeholder="No prompt saved with this look. Add one, or use it as it is." onChange={e => setPrompt(e.target.value)} />}
      <div className="wfl-prompt-f">{settings.length > 0 && <span className="wfl-set" title={settings.join(' · ')}>{settings.join(' · ')}</span>}
        <Link to={use(l.provider)} className="btn wfh-pri" data-testid="look-use">Use this look</Link></div>
    </div>
    <h2 className="wfh-sec" data-testid="look-tested-h">{d.results.length === 1 ? 'Tested on 1 model' : `Tested on ${d.results.length} models`}</h2>
    <div className="wfl-cmp" data-testid="look-models">
      {results.map(r => { const price = paidText(r.latest.paid, own); const t = durationText(r.latest.renderMs);
        return <article key={r.provider ?? r.modelName ?? '?'} className={`wfl-mc ${r.made ? 'wfl-made' : ''}`} data-testid={`look-model-${r.provider ?? 'unknown'}`}>
          {r.latest.inputUrl ? <span className="wfl-im"><SplitPreview before={r.latest.inputUrl} after={r.latest.url} testId="look-split" /></span>
            : r.latest.jobId ? <Link to={`/jobs/${r.latest.jobId}`} className="wfl-im" aria-label={`Open the ${r.modelName ?? ''} result`}><SafeImg src={r.latest.url} /></Link> : <span className="wfl-im"><SafeImg src={r.latest.url} /></span>}
          <div className="wfl-b"><b className="wfl-name">{r.modelName ?? 'Unknown model'}</b>
            <span className="wfl-meta">{[price, t, r.runs > 1 ? `${r.runs} runs` : null].filter(Boolean).join(' · ') || 'Example in this app'}</span>
            <span className={`wfl-verdict ${r.made ? 'ok' : ''}`}>{r.made ? 'Made for this one' : 'Tested'}{r.latest.inputUrl && r.latest.jobId ? <> · <Link to={`/jobs/${r.latest.jobId}`} className="wfd-link">Open the result</Link></> : null}</span>
            {r.compatible && r.provider ? <Link to={use(r.provider)} className={`btn ${r.made ? 'wfh-pri' : ''} wfl-btn`} data-testid={`look-use-${r.provider}`}>{r.made ? 'Use this look' : 'Use with this model'}</Link>
              : <span className="wfl-btn wfl-off">{r.provider ? 'Not offered for this workflow now' : 'Model not named on this example'}</span>}
          </div></article>; })}
    </div>
    {d.results.length > SHOWN && <button type="button" className="btn btn-sm wfl-all" data-testid="look-show-all" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${d.results.length}`}</button>}
    {d.untested.length > 0 && <><h2 className="wfh-sec">Not tested yet</h2>
    <div className="wfl-cmp" data-testid="look-untested">
      {d.untested.map(u => { const q = quoteText(u.quote, own);
        return <article key={u.provider} className="wfl-mc wfl-untested" data-testid={`look-untested-${u.provider}`}>
          <div className="wfl-im wfl-q"><span aria-hidden>?</span>Not tested on this model yet</div>
          <div className="wfl-b"><b className="wfl-name">{u.modelName}</b>
            <span className={`wfl-meta ${q.reason ? 'wfd-why' : ''}`}>{q.price ? `${q.price}${q.sample ? '' : ' per run'}` : q.reason}</span>
            <span className="wfl-verdict">{u.made ? 'Made for this one · no example on it here yet' : 'Try it, and the result is added here'}</span>
            <Link to={use(u.provider)} className="btn wfl-btn" data-testid={`look-test-${u.provider}`} {...tip('Opens Create with this model and the look filled in. Nothing runs until you press Generate.')}>
              {q.price && !q.sample ? /^Free/.test(q.price) ? 'Test free, locally' : `Test for ${/^[≈$]/.test(q.price) ? '' : '≈ '}${q.price}` : 'Open in Create'}</Link>
          </div></article>; })}
    </div></>}
  </div>;
}
