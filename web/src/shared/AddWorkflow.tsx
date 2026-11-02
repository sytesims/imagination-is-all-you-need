/**
 * Add a workflow (2026-11-01, friendly summary 2026-11-02): the one sheet for bringing a ComfyUI workflow into the app. Opened from Your workflows,
 * the Workflows page's "Bring your own" card and the "+ Add your own" row of every tab's workflow picker (openAddWorkflow). Two steps:
 *  1. Drop a file (or paste JSON) → POST /api/workflows/import reads it, guesses which node is what, says in one plain line what it does and checks
 *     the model files it loads against your ComfyUI up front (server workflowImport.ts, workflowModels.ts graphNeeds).
 *  2. A summary card: name, that line, the tab it lands in, the models, one orange "Add to my workflows". "Customize" (folded) holds the rest in
 *     plain words, node names small and grey underneath. POST /api/workflows saves it; you land in its tab with it picked in the tab's own bar.
 * Two looks for the summary while the user picks one: ?addwf=a (one column) | ?addwf=b (with a preview of the bar it gets). Nothing runs here and no
 * code is ever saved: a workflow folder is three JSON files.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Notice } from './Notice';
import { useToast } from './Toast';
import { refreshToolsAndWait } from './useTools';
import { navigate } from '../platform/router';
import { videoWorkflowHref } from '../../../server/src/shared/videoWorkflows';
import { refreshImageWorkflows } from './imageWorkflowsStore';
import type { PluginTab } from '../../../server/src/shared/pluginPlacement';
import './addWorkflow.css';

type Choice = { ref: string; node: string; field?: string; label: string; classType: string; kind?: 'image' | 'video' };
type Extra = { key: string; label: string; node: string; field: string; kind: 'number' | 'text'; value: number | string; on: boolean };
type Role = 'input' | 'prompt' | 'seed' | 'output';
type Guess = { input: 'image' | 'video' | 'none'; output: 'image' | 'video'; tab: PluginTab; category: string; name: string; description: string;
  choices: Record<Role, Choice[]>; pick: Partial<Record<Role, string>>; extras: Extra[]; nodeTypes: string[] };
type Tab = { id: PluginTab; label: string; categories: { id: string; label: string }[] };
type NeedRow = { file: string; folder: string; state: 'have' | 'missing' | 'unknown'; url: string | null; bytes: number | null; nodeMissing?: boolean };
type Needs = { comfy: 'ok' | 'off' | 'not_set'; modelsDirSet: boolean; files: NeedRow[]; missing: number; unknown: number };
type Preview = { format: 'api' | 'ui'; convertedWith: 'comfyui' | 'built-in' | null; workflow: Record<string, any>; guess: Guess; missingNodes: string[] | null; tabs: Tab[]; needs?: Needs };
export type AddWorkflowOpts = { /** the tab it was opened from: preselected when the workflow fits it */ tab?: PluginTab; /** after saving (default: open it in its tab) */ onSaved?: (r: { id: string; tab: PluginTab; href: string }) => void };

const MAX = 2 * 1024 * 1024;
/** Where a workflow you added opens: its tab with it picked in the tab's own bar (Image: Create Image's bar; Video: the Video page's). */
export const addedHref = (id: string, tab: PluginTab) => (tab === 'video' ? videoWorkflowHref(id) : `/image?workflow=${encodeURIComponent(id)}`);
/** The summary's look while the user picks one (?addwf=a | b). */
const lookOf = (): 'a' | 'b' => (typeof location !== 'undefined' && new URLSearchParams(location.search).get('addwf') === 'b' ? 'b' : 'a');

/** One host in App, so any picker or page can open the sheet. */
let push: ((o: AddWorkflowOpts | null) => void) | null = null;
export const openAddWorkflow = (o: AddWorkflowOpts = {}) => push?.(o);
export function AddWorkflowHost() {
  const [o, setO] = useState<AddWorkflowOpts | null>(null);
  useEffect(() => { push = setO; return () => { push = null; }; }, []);
  return o ? <AddWorkflowSheet {...o} onClose={() => setO(null)} /> : null;
}

/* ---- plain words ---- */
const gb = (b: number) => { const g = b / 1e9; return g >= 1 ? `${g >= 10 ? Math.round(g) : Math.round(g * 10) / 10} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`; };
/** "3 of 4 models ready · 1 to download (2.1 GB)", in one line, plus how it reads at a glance. */
export function modelsLine(n: Needs | undefined): { text: string; tone: 'ok' | 'get' | 'unknown' | 'none'; sub: string | null } {
  if (!n || !n.files.length) return { text: 'No model files to get', tone: 'none', sub: null };
  const total = n.files.length; const have = n.files.filter(f => f.state === 'have').length; const miss = n.files.filter(f => f.state === 'missing');
  const word = (k: number) => `${k} model${k === 1 ? '' : 's'}`;
  if (have + miss.length === 0) return { text: `${word(total)} · checked when your ComfyUI is on`, tone: 'unknown', sub: n.comfy === 'not_set' ? 'Connect ComfyUI in Settings to check them now.' : 'Start ComfyUI to check them now.' };
  if (!miss.length) return { text: total === 1 ? 'Its model is ready' : `All ${total} models ready`, tone: 'ok', sub: null };
  const bytes = miss.reduce((a, f) => a + (f.bytes ?? 0), 0); const noLink = miss.filter(f => !f.url).length; const unknownSize = miss.filter(f => f.url && f.bytes == null).length;
  const size = bytes ? ` (${gb(bytes)}${unknownSize ? ' +' : ''})` : '';
  return { text: `${have} of ${total} ready · ${miss.length} to download${size}`, tone: 'get', sub: noLink ? `${noLink === 1 ? 'One needs' : `${noLink} need`} a download link: add it after, on its Needs list.` : 'You can download them after adding, or with the first run.' };
}
const TAB_ICON: Record<PluginTab, ReactNode> = {
  image: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>,
  video: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m22 8-6 4 6 4z" /></svg>,
  audio: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  '3d': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="m3 7 9 5 9-5M12 12v10" /></svg>,
};
const Spark = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="3.2" /></svg>;
const Check = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5 9-10" /></svg>;
const Down = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v12M6 11l6 6 6-6M5 20h14" /></svg>;

export function AddWorkflowSheet({ tab: fromTab, onSaved, onClose }: AddWorkflowOpts & { onClose: () => void }) {
  const toast = useToast(); const box = useRef<HTMLDivElement>(null); const back = useRef<HTMLElement | null>(null); const fileIn = useRef<HTMLInputElement>(null);
  const look = useMemo(lookOf, []);
  const [pv, setPv] = useState<Preview | null>(null); const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState<'' | 'read' | 'save'>(''); const [err, setErr] = useState<{ error: string; help?: string | null; errors?: string[]; field?: string | null } | null>(null);
  const [over, setOver] = useState(false); const [paste, setPaste] = useState(false); const [text, setText] = useState('');
  const [custom, setCustom] = useState(false); const [showFiles, setShowFiles] = useState(false);
  // the form
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [tab, setTab] = useState<PluginTab>('image'); const [cat, setCat] = useState('');
  const [pick, setPick] = useState<Partial<Record<Role, string>>>({}); const [extras, setExtras] = useState<string[]>([]);
  const [lic, setLic] = useState('Your own'); const [src, setSrc] = useState(''); const [licFrom, setLicFrom] = useState<string | null>(null); const licTouched = useRef(false);

  useEffect(() => { back.current = document.activeElement as HTMLElement; requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()); return () => { back.current?.focus?.(); }; }, []);
  useEffect(() => { requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()); }, [!!pv]);
  /* a pasted source link fills the licence in (GitHub's or Hugging Face's own metadata), unless you typed one */
  useEffect(() => { const u = src.trim(); if (!/^https:\/\/(www\.)?(github\.com|huggingface\.co)\/[^/]+\/[^/]+/.test(u)) { setLicFrom(null); return; } let live = true;
    const t = setTimeout(() => { fetch(`/api/workflows/source-licence?url=${encodeURIComponent(u)}`).then(r => r.ok ? r.json() : null).then(j => { if (!live || !j?.licence) return; setLicFrom(j.source); if (!licTouched.current) setLic(j.licence); }).catch(() => undefined); }, 350);
    return () => { live = false; clearTimeout(t); }; }, [src]);

  const read = async (raw: string, fname: string) => {
    setErr(null); if (raw.length > MAX) { setErr({ error: 'That file is too big (over 2 MB). A ComfyUI workflow is usually much smaller.' }); return; }
    if (!raw.trim()) { setErr({ error: 'Nothing to read. Paste the workflow’s JSON, or add its file.' }); return; }
    setBusy('read');
    try { const r = await fetch('/api/workflows/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow: raw, fileName: fname }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { setErr({ error: j.error ?? `Couldn’t read it (HTTP ${r.status}).`, help: j.help }); return; }
      const p = j as Preview; const g = p.guess; setPv(p); setFileName(fname); setCustom(false);
      /* the tab it lands in: the one it was opened from when the result fits it (a picture → Image, a video → Video) */
      const t = fromTab && fitsTab(fromTab, g.output) ? fromTab : g.tab;
      setName(g.name); setDesc(g.description); setTab(t); setCat(t === g.tab ? g.category : (p.tabs.find(x => x.id === t)?.categories[0]?.id ?? ''));
      setPick(g.pick); setExtras(g.extras.filter(x => x.on).map(x => x.key)); }
    catch { setErr({ error: 'Can’t reach the app’s server. Try again.' }); } finally { setBusy(''); }
  };
  const takeFile = async (f?: File | null) => { if (!f) return; if (f.size > MAX) { setErr({ error: 'That file is too big (over 2 MB). A ComfyUI workflow is usually much smaller.' }); return; }
    if (!/\.json$/i.test(f.name) && f.type && !/json|text/.test(f.type)) { setErr({ error: 'Add a .json file: a ComfyUI workflow.' }); return; }
    await read(await f.text(), f.name); };

  const tabInfo = pv?.tabs.find(x => x.id === tab);
  const save = async () => {
    if (!pv || busy) return; setErr(null); setBusy('save');
    try { const r = await fetch('/api/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow: pv.workflow, fileName, name, description: desc, tab, category: cat, input: pick.input || null, prompt: pick.prompt || null, seed: pick.seed || null, output: pick.output, extras, license: lic, source: src }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { setErr({ error: j.error ?? `Couldn’t add it (HTTP ${r.status}).`, errors: j.errors, field: j.field }); if (j.field && j.field !== 'name') setCustom(true); return; }
      /* the tab's lists learn about it first (tools → placement, then the Image recipes), so it opens picked, never a blank bar */
      await refreshToolsAndWait(); if (j.tab === 'image') await refreshImageWorkflows();
      const href = addedHref(j.id, j.tab); onClose();
      toast(`Added “${name.trim()}”`, 'info', { sub: `It’s picked in the ${tabInfo?.label ?? 'its'} tab, next to the built-in workflows.` });
      if (onSaved) onSaved({ id: j.id, tab: j.tab, href }); else navigate(href); }
    catch { setErr({ error: 'Can’t reach the app’s server. Try again.' }); } finally { setBusy(''); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === 'Tab') { const f = [...(box.current?.querySelectorAll<HTMLElement>('input:not([type=file]),select,textarea,button:not([disabled]),summary') ?? [])]; if (!f.length) return; const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
  };
  const g = pv?.guess; const inputKind = g?.choices.input.find(c => c.ref === pick.input)?.kind ?? 'none';
  const outWord = g?.output === 'video' ? 'video' : 'picture'; const inWord = inputKind === 'video' ? 'clip' : 'photo';
  const ml = modelsLine(pv?.needs); const okTabs = pv ? pv.tabs.filter(t => fitsTab(t.id, g!.output)) : [];
  const hasPrompt = !!pick.prompt; const shown = g ? g.extras.filter(x => extras.includes(x.key)) : [];

  /** A plain picker for one role: the choice in our words, the node it points at small and grey underneath. */
  const sel = (role: Role, label: string, none: string | null, plain: (c: Choice, i: number, all: Choice[]) => string) => { const list = g?.choices[role] ?? []; const cur = list.find(c => c.ref === pick[role]);
    return <label className="adw-f"><span>{label}</span>
      <select value={pick[role] ?? ''} onChange={e => setPick(p => ({ ...p, [role]: e.target.value }))} data-testid={`adw-${role}`} disabled={!list.length && !none}>
        {none != null && <option value="">{none}</option>}
        {list.map((c, i) => <option key={c.ref} value={c.ref}>{plain(c, i, list)}</option>)}
        {!list.length && none == null && <option value="">None found</option>}
      </select><small className="adw-node" data-testid={`adw-${role}-node`}>{cur ? `${cur.label}${cur.field && !['image', 'text', 'seed', 'file', 'video'].includes(cur.field) ? ` · ${cur.field}` : ''}` : ' '}</small></label>; };
  const nth = (word: string) => (_c: Choice, i: number, all: Choice[]) => (all.length > 1 ? `${word} ${i + 1}` : word);

  const modelsBox = <div className={`adw-models adw-m-${ml.tone}`} data-testid="adw-models">
    <button type="button" className="adw-models-h" aria-expanded={showFiles} onClick={() => setShowFiles(s => !s)} disabled={!pv?.needs?.files.length} data-testid="adw-models-toggle">
      <i className={`adw-dot adw-dot-${ml.tone}`} aria-hidden>{ml.tone === 'ok' ? <Check /> : ml.tone === 'get' ? <Down /> : null}</i>
      <b>{ml.text}</b>{!!pv?.needs?.files.length && <span className="adw-models-more">{showFiles ? 'Hide' : 'See files'}</span>}</button>
    {ml.sub && <small className="adw-models-sub">{ml.sub}</small>}
    {showFiles && <ul className="adw-files" data-testid="adw-files">{pv!.needs!.files.map(f => <li key={`${f.folder}/${f.file}`} className={`adw-file adw-file-${f.state}`}>
      <i aria-hidden>{f.state === 'have' ? <Check /> : f.state === 'missing' ? <Down /> : '·'}</i><span className="adw-file-n" title={f.file}>{f.file}</span>
      <small>{f.state === 'have' ? 'Ready' : f.state === 'missing' ? (f.bytes ? gb(f.bytes) : f.url ? 'Size unknown' : 'Needs a link') : 'Not checked'}</small></li>)}</ul>}
  </div>;
  const nodesNote = !!pv?.missingNodes?.length && <p className="adw-addons" data-testid="adw-missing">Needs {pv.missingNodes.length === 1 ? 'one add-on' : `${pv.missingNodes.length} add-ons`} in your ComfyUI: <b>{pv.missingNodes.slice(0, 3).join(', ')}{pv.missingNodes.length > 3 ? ` and ${pv.missingNodes.length - 3} more` : ''}</b>. Install {pv.missingNodes.length === 1 ? 'it' : 'them'} there before the first run.</p>;
  const tabChip = <span className="adw-tabchip" data-testid="adw-tabchip">{TAB_ICON[tab]}{tabInfo?.label ?? tab} tab</span>;
  const priceChip = <span className="adw-free">Free · on your computer</span>;
  const cta = <button type="submit" className="btn btn-primary adw-cta" data-autofocus disabled={!name.trim() || !pick.output || !cat || !!busy} data-testid="adw-save">{busy === 'save' ? 'Adding…' : 'Add to my workflows'}</button>;
  const nameField = <input className="adw-name" value={name} maxLength={60} onChange={e => setName(e.target.value)} data-testid="adw-name" aria-label="Name" aria-invalid={err?.field === 'name' || undefined} />;
  const descField = <input className="adw-line" value={desc} maxLength={300} onChange={e => setDesc(e.target.value)} data-testid="adw-desc" aria-label="What it does" />;

  const customize = g && <details className="adw-custom" open={custom} onToggle={e => setCustom((e.currentTarget as HTMLDetailsElement).open)} data-testid="adw-customize">
    <summary data-testid="adw-customize-toggle"><span>Customize</span><small>Where things go, settings, source</small></summary>
    <div className="adw-custom-b">
      <div className="adw-grid">
        {okTabs.length > 1 && <div className="adw-f adw-wide"><span>Tab</span><div className="adw-seg" role="radiogroup" aria-label="Tab">{okTabs.map(t => <button key={t.id} type="button" role="radio" aria-checked={tab === t.id} className={tab === t.id ? 'on' : ''} data-testid={`adw-tab-${t.id}`}
          onClick={() => { setTab(t.id); if (!t.categories.some(c => c.id === cat)) setCat(t.id === g.tab ? g.category : t.categories[0]?.id ?? ''); }}>{t.label}</button>)}</div></div>}
        <label className="adw-f"><span>Group in the {tabInfo?.label ?? ''} menu</span><select value={cat} onChange={e => setCat(e.target.value)} data-testid="adw-category">{(tabInfo?.categories ?? []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select><small className="adw-node">&nbsp;</small></label>
        {sel('input', `Where your ${inWord === 'clip' ? 'clip' : 'photo'} goes`, 'Nowhere: words only', (c, i, all) => `${c.kind === 'video' ? 'Clip' : 'Photo'}${all.length > 1 ? ` ${i + 1}` : ''}`)}
        {sel('prompt', 'Where your words go', 'No words box', nth('Words box'))}
        {sel('output', `The ${outWord} to keep`, null, (c, i, all) => `${/^Preview/.test(c.classType) ? 'Preview' : 'Saved'} ${outWord}${all.length > 1 ? ` ${i + 1}` : ''}`)}
        {sel('seed', 'A new result each time', 'Keep its own', nth('Random each run'))}
      </div>
      {g.extras.length > 0 && <fieldset className="adw-extras"><legend>Settings in the bar</legend>{g.extras.map(x => <label key={x.key} className="adw-check">
        <input type="checkbox" checked={extras.includes(x.key)} onChange={e => setExtras(s => e.target.checked ? [...s, x.key] : s.filter(k => k !== x.key))} data-testid={`adw-extra-${x.key}`} />
        <span>{x.label}<small>{String(x.value).slice(0, 24) || 'empty'}</small></span></label>)}</fieldset>}
      <div className="adw-grid adw-lic">
        <label className="adw-f"><span>Where it came from <small>optional</small></span><input value={src} type="url" inputMode="url" placeholder="Paste a GitHub or Hugging Face link" maxLength={500} onChange={e => setSrc(e.target.value)} data-testid="adw-source" aria-invalid={err?.field === 'source' || undefined} /><small className="adw-node">&nbsp;</small></label>
        <label className="adw-f"><span>Licence {licFrom && <small className="adw-auto" data-testid="adw-license-auto">from {licFrom}</small>}</span><input value={lic} maxLength={80} onChange={e => { licTouched.current = true; setLic(e.target.value); }} data-testid="adw-license" /><small className="adw-node">&nbsp;</small></label>
      </div>
    </div>
  </details>;

  /** Option B's left side: the bar this workflow gets in its tab, only the inputs it needs. */
  const barPreview = g && <div className="adw-bar" aria-hidden data-testid="adw-bar-preview">
    <span className="adw-bar-cap">{TAB_ICON[tab]}In the {tabInfo?.label ?? ''} tab</span>
    <div className="adw-bar-box">
      <div className="adw-bar-chip adw-bar-wf"><i><Spark /></i><b>{name.trim() || 'My workflow'}</b></div>
      {inputKind !== 'none' && <div className="adw-bar-slot"><span>+</span><small>{inWord === 'clip' ? 'Clip' : 'Photo'}</small></div>}
      {hasPrompt && <div className="adw-bar-prompt">{inputKind === 'none' ? 'Describe what you want to see' : 'Describe the change (optional)'}</div>}
      <div className="adw-bar-row">
        {shown.length > 0 && <span className="adw-bar-chip">{shown.slice(0, 2).map(x => x.label.replace(/\s*\(.*\)$/, '')).join(' · ')}{shown.length > 2 ? ` +${shown.length - 2}` : ''}</span>}
        <span className="adw-bar-chip adw-bar-model">{pv!.needs?.files[0]?.file.replace(/\.(safetensors|pth|ckpt|gguf|pt|bin)$/i, '').replace(/[_-]+/g, ' ') ?? 'Your ComfyUI'}</span>
        <span className="adw-bar-gen">Generate<small>Free</small></span>
      </div>
    </div>
    <small className="adw-bar-foot">The bar grows only the inputs it needs.</small>
  </div>;

  return createPortal(<div className="dlg-scrim adw-scrim" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()} onKeyDown={onKey}>
    <div ref={box} className={`dlg adw${pv ? ` adw-sum adw-look-${look}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="adw-t" data-testid="add-workflow" data-look={look}>
      <header className="adw-h"><h2 id="adw-t" className="dlg-t">Add a workflow</h2>
        <button type="button" className="adw-x" aria-label="Close" onClick={onClose} disabled={!!busy}>×</button></header>
      {!pv ? <>
        <p className="dlg-b">Bring a ComfyUI workflow you like. It shows up in its tab, next to the built-in ones, and runs free on your own ComfyUI.</p>
        <div className={`adw-drop${over ? ' over' : ''}${busy ? ' busy' : ''}`} data-testid="adw-drop"
          onDragEnter={e => { e.preventDefault(); setOver(true); }} onDragOver={e => e.preventDefault()} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); void takeFile(e.dataTransfer.files?.[0]); }}>
          <button type="button" className="adw-drop-hit" data-autofocus onClick={() => fileIn.current?.click()} disabled={!!busy}>
            <span className="adw-drop-ic" aria-hidden><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3" /></svg></span>
            <b>{busy === 'read' ? 'Reading it…' : 'Drop a workflow file here'}</b>
            <small>or click to choose one · a .json file</small>
          </button>
          <input ref={fileIn} type="file" accept=".json,application/json" hidden data-native-picker data-testid="adw-file" onChange={e => { void takeFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {!paste ? <button type="button" className="adw-link" onClick={() => setPaste(true)} data-testid="adw-paste-open">Paste it instead</button>
          : <div className="adw-paste"><textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste the workflow here" rows={5} data-testid="adw-paste" spellCheck={false} />
            <div className="adw-paste-a"><button type="button" className="btn btn-sm" disabled={!text.trim() || !!busy} onClick={() => void read(text, '')} data-testid="adw-paste-read">Read it</button></div></div>}
        {err && <div className="adw-err" role="alert" data-testid="adw-error"><Notice as="p" kind="error" tone="line">{err.error}</Notice>
          {err.help && <ol className="adw-help" data-testid="adw-help"><li>Open the workflow in ComfyUI.</li><li>Use <b>Workflow › Export (API)</b>.</li><li>Add the file it saves here.</li></ol>}</div>}
        <p className="adw-warm">Works best with <b>Workflow › Export (API)</b> from ComfyUI. Only the workflow is saved, never code.</p>
      </> : <form className={`adw-body adw-body-${look}`} onSubmit={e => { e.preventDefault(); void save(); }}>
        {look === 'b' && barPreview}
        <div className="adw-main">
          <div className="adw-card" data-testid="adw-summary">
            {look === 'a' && <span className="adw-ic" aria-hidden><Spark /></span>}
            {nameField}{descField}
            <div className="adw-chips">{tabChip}{priceChip}</div>
          </div>
          {modelsBox}
          {nodesNote}
          {pv.format === 'ui' && <p className="adw-quiet">Read from ComfyUI’s saved format{pv.convertedWith === 'comfyui' ? ' with your ComfyUI' : ''}. Check Customize if a box looks wrong.</p>}
          {err && <div className="adw-err" role="alert" data-testid="adw-error"><Notice as="p" kind="error" tone="line">{err.error}</Notice>{!!err.errors?.length && <ul className="adw-errs">{err.errors.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>}
          {cta}
          {customize}
          <footer className="adw-foot"><span>Runs free on your own ComfyUI.</span><button type="button" className="adw-link" onClick={() => { setPv(null); setErr(null); }} disabled={!!busy}>Use another file</button></footer>
        </div>
      </form>}
    </div></div>, document.body);
}
/** Where a result of this kind can live: a picture in the Image tab, a video in the Video tab. */
const fitsTab = (t: PluginTab, out: 'image' | 'video') => (out === 'video' ? t === 'video' : t === 'image');
