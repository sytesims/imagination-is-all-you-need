/**
 * Add a workflow (2026-11-01): the one sheet for bringing a ComfyUI workflow into the app. Opened from Your workflows, the Workflows page's
 * "Bring your own" card and the "+ Add your own" row of every tab's workflow picker (openAddWorkflow). Two steps:
 *  1. Drop a file (or paste JSON) → POST /api/workflows/import reads it and guesses which node is what (server workflowImport.ts).
 *  2. A short form, prefilled with the guess → POST /api/workflows saves it; it loads at once, then this opens it in its tab.
 * Nothing runs here and no code is ever saved: a workflow folder is three JSON files.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Notice } from './Notice';
import { useToast } from './Toast';
import { refreshToolsAndWait } from './useTools';
import { navigate } from '../platform/router';
import { videoWorkflowHref } from '../../../server/src/shared/videoWorkflows';
import type { PluginTab } from '../../../server/src/shared/pluginPlacement';
import './addWorkflow.css';

type Choice = { ref: string; node: string; field?: string; label: string; classType: string; kind?: 'image' | 'video' };
type Extra = { key: string; label: string; node: string; field: string; kind: 'number' | 'text'; value: number | string; on: boolean };
type Role = 'input' | 'prompt' | 'seed' | 'output';
type Guess = { input: 'image' | 'video' | 'none'; output: 'image' | 'video'; tab: PluginTab; category: string; name: string; description: string;
  choices: Record<Role, Choice[]>; pick: Partial<Record<Role, string>>; extras: Extra[]; nodeTypes: string[] };
type Tab = { id: PluginTab; label: string; categories: { id: string; label: string }[] };
type Preview = { format: 'api' | 'ui'; convertedWith: 'comfyui' | 'built-in' | null; workflow: Record<string, any>; guess: Guess; missingNodes: string[] | null; tabs: Tab[] };
export type AddWorkflowOpts = { /** the tab it was opened from: preselected when the workflow fits it */ tab?: PluginTab; /** after saving (default: open it in its tab) */ onSaved?: (r: { id: string; tab: PluginTab; href: string }) => void };

const MAX = 2 * 1024 * 1024;
/** Where a workflow you added opens: Video ones in the Video tab with it picked, the others on their own page in their tab. */
export const addedHref = (id: string, tab: PluginTab) => (tab === 'video' ? videoWorkflowHref(id) : `/tools/${id}`);

/** One host in App, so any picker or page can open the sheet. */
let push: ((o: AddWorkflowOpts | null) => void) | null = null;
export const openAddWorkflow = (o: AddWorkflowOpts = {}) => push?.(o);
export function AddWorkflowHost() {
  const [o, setO] = useState<AddWorkflowOpts | null>(null);
  useEffect(() => { push = setO; return () => { push = null; }; }, []);
  return o ? <AddWorkflowSheet {...o} onClose={() => setO(null)} /> : null;
}

const KIND_WORD = { image: 'Photo', video: 'Clip' } as const;

export function AddWorkflowSheet({ tab: fromTab, onSaved, onClose }: AddWorkflowOpts & { onClose: () => void }) {
  const toast = useToast(); const box = useRef<HTMLDivElement>(null); const back = useRef<HTMLElement | null>(null); const fileIn = useRef<HTMLInputElement>(null);
  const [pv, setPv] = useState<Preview | null>(null); const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState<'' | 'read' | 'save'>(''); const [err, setErr] = useState<{ error: string; help?: string | null; errors?: string[]; field?: string | null } | null>(null);
  const [over, setOver] = useState(false); const [paste, setPaste] = useState(false); const [text, setText] = useState('');
  // the form
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [tab, setTab] = useState<PluginTab>('image'); const [cat, setCat] = useState('');
  const [pick, setPick] = useState<Partial<Record<Role, string>>>({}); const [extras, setExtras] = useState<string[]>([]);
  const [lic, setLic] = useState('Your own'); const [src, setSrc] = useState('');

  useEffect(() => { back.current = document.activeElement as HTMLElement; requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()); return () => { back.current?.focus?.(); }; }, []);
  useEffect(() => { requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()); }, [!!pv]);

  const read = async (raw: string, fname: string) => {
    setErr(null); if (raw.length > MAX) { setErr({ error: 'That file is too big (over 2 MB). A ComfyUI workflow is usually much smaller.' }); return; }
    if (!raw.trim()) { setErr({ error: 'Nothing to read. Paste the workflow’s JSON, or add its file.' }); return; }
    setBusy('read');
    try { const r = await fetch('/api/workflows/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow: raw, fileName: fname }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { setErr({ error: j.error ?? `Couldn’t read it (HTTP ${r.status}).`, help: j.help }); return; }
      const p = j as Preview; const g = p.guess; setPv(p); setFileName(fname);
      const t = fromTab && (fromTab === g.tab || (fromTab !== 'video' && g.output === 'image') || (fromTab === 'video' && g.output === 'video')) ? fromTab : g.tab;
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
      const j = await r.json().catch(() => ({})); if (!r.ok) { setErr({ error: j.error ?? `Couldn’t add it (HTTP ${r.status}).`, errors: j.errors, field: j.field }); return; }
      await refreshToolsAndWait(); const href = addedHref(j.id, j.tab); onClose();
      toast(`Added “${name.trim()}”`, 'info', { sub: `It’s in the ${tabInfo?.label ?? 'its'} tab now, next to the built-in workflows.` });
      if (onSaved) onSaved({ id: j.id, tab: j.tab, href }); else navigate(href); }
    catch { setErr({ error: 'Can’t reach the app’s server. Try again.' }); } finally { setBusy(''); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === 'Tab') { const f = [...(box.current?.querySelectorAll<HTMLElement>('input:not([type=file]),select,textarea,button:not([disabled])') ?? [])]; if (!f.length) return; const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
  };
  const g = pv?.guess; const inputKind = g?.choices.input.find(c => c.ref === pick.input)?.kind ?? 'none';
  const what = useMemo(() => !g ? '' : `${inputKind === 'none' ? 'Prompt' : KIND_WORD[inputKind]} → ${g.output === 'video' ? 'Video' : 'Image'}`, [g, inputKind]);
  const sel = (role: Role, label: string, none: string | null, hint?: string) => { const list = g?.choices[role] ?? [];
    return <label className="adw-f"><span>{label}{hint && <small>{hint}</small>}</span>
      <select value={pick[role] ?? ''} onChange={e => setPick(p => ({ ...p, [role]: e.target.value }))} data-testid={`adw-${role}`} disabled={!list.length && !none}>
        {none != null && <option value="">{none}</option>}
        {list.map(c => <option key={c.ref} value={c.ref}>{role === 'input' && c.kind ? `${KIND_WORD[c.kind]}: ` : ''}{c.label}{c.field && role !== 'input' && !['text', 'seed'].includes(c.field) ? ` · ${c.field}` : ''}</option>)}
        {!list.length && none == null && <option value="">None found</option>}
      </select></label>; };

  return createPortal(<div className="dlg-scrim adw-scrim" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()} onKeyDown={onKey}>
    <div ref={box} className={`dlg adw${pv ? ' adw-form' : ''}`} role="dialog" aria-modal="true" aria-labelledby="adw-t" data-testid="add-workflow">
      <header className="adw-h"><h2 id="adw-t" className="dlg-t">Add a workflow</h2>
        <button type="button" className="adw-x" aria-label="Close" onClick={onClose} disabled={!!busy}>×</button></header>
      {!pv ? <>
        <p className="dlg-b">Bring a ComfyUI workflow. It shows up in its tab, next to the built-in ones, and runs on your own ComfyUI.</p>
        <div className={`adw-drop${over ? ' over' : ''}${busy ? ' busy' : ''}`} data-testid="adw-drop"
          onDragEnter={e => { e.preventDefault(); setOver(true); }} onDragOver={e => e.preventDefault()} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); void takeFile(e.dataTransfer.files?.[0]); }}>
          <button type="button" className="adw-drop-hit" data-autofocus onClick={() => fileIn.current?.click()} disabled={!!busy}>
            <span className="adw-drop-ic" aria-hidden><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3" /></svg></span>
            <b>{busy === 'read' ? 'Reading…' : 'Drop a workflow file here'}</b>
            <small>or click to choose one · .json, up to 2 MB</small>
          </button>
          <input ref={fileIn} type="file" accept=".json,application/json" hidden data-native-picker data-testid="adw-file" onChange={e => { void takeFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {!paste ? <button type="button" className="adw-link" onClick={() => setPaste(true)} data-testid="adw-paste-open">Paste JSON instead</button>
          : <div className="adw-paste"><textarea value={text} onChange={e => setText(e.target.value)} placeholder='{ "3": { "class_type": "KSampler", "inputs": { … } } }' rows={5} data-testid="adw-paste" spellCheck={false} />
            <div className="adw-paste-a"><button type="button" className="btn btn-sm" disabled={!text.trim() || !!busy} onClick={() => void read(text, '')} data-testid="adw-paste-read">Read it</button></div></div>}
        {err && <div className="adw-err" role="alert" data-testid="adw-error"><Notice as="p" kind="error" tone="line">{err.error}</Notice>
          {err.help && <ol className="adw-help" data-testid="adw-help"><li>Open the workflow in ComfyUI.</li><li>Use <b>Workflow › Export (API)</b>.</li><li>Add the file it saves here.</li></ol>}</div>}
        <ul className="adw-fine"><li>Use the API format: in ComfyUI, <b>Workflow › Export (API)</b>. A regular saved workflow works too when its nodes are known.</li>
          <li>It runs on your own ComfyUI: its custom nodes and models must be installed there. Not on Comfy Cloud yet.</li>
          <li>Only the workflow is saved. No code ever runs from it.</li></ul>
      </> : <form className="adw-body" onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="adw-src"><span className="adw-src-f" title={fileName || 'Pasted JSON'}>{fileName || 'Pasted JSON'}</span><span className="adw-chip">{what}</span>
          <span className="adw-chip adw-chip-n">{Object.keys(pv.workflow).length} nodes</span>
          <button type="button" className="adw-link" onClick={() => { setPv(null); setErr(null); }} disabled={!!busy}>Use another file</button></div>
        {pv.format === 'ui' && <Notice as="p" kind="info" tone="line" className="adw-note">Converted from the saved format{pv.convertedWith === 'comfyui' ? ' with your ComfyUI' : ''}. Check the nodes below.</Notice>}
        {!!pv.missingNodes?.length && <Notice as="p" kind="warn" tone="line" className="adw-note" testId="adw-missing">Your ComfyUI doesn’t have {pv.missingNodes.slice(0, 3).join(', ')}{pv.missingNodes.length > 3 ? ` and ${pv.missingNodes.length - 3} more` : ''}. Install them there before you run it.</Notice>}
        <div className="adw-grid">
          <label className="adw-f adw-wide"><span>Name</span><input data-autofocus value={name} maxLength={60} onChange={e => setName(e.target.value)} data-testid="adw-name" aria-invalid={err?.field === 'name' || undefined} /></label>
          <label className="adw-f adw-wide"><span>One line about it</span><input value={desc} maxLength={300} onChange={e => setDesc(e.target.value)} data-testid="adw-desc" /></label>
          <div className="adw-f adw-wide"><span>Tab</span><div className="adw-seg" role="radiogroup" aria-label="Tab">{pv.tabs.map(t => <button key={t.id} type="button" role="radio" aria-checked={tab === t.id} className={tab === t.id ? 'on' : ''} data-testid={`adw-tab-${t.id}`}
            onClick={() => { setTab(t.id); if (!t.categories.some(c => c.id === cat)) setCat(t.id === g!.tab ? g!.category : t.categories[0]?.id ?? ''); }}>{t.label}</button>)}</div></div>
          <label className="adw-f"><span>Group</span><select value={cat} onChange={e => setCat(e.target.value)} data-testid="adw-category">{(tabInfo?.categories ?? []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          {sel('output', 'Result', null, g!.output === 'video' ? 'saves a video' : 'saves an image')}
          {sel('input', 'Photo or clip', 'Nothing: prompt only')}
          {sel('prompt', 'Prompt', 'No prompt box')}
          {sel('seed', 'Seed', 'Keep the workflow’s seed')}
        </div>
        {g!.extras.length > 0 && <fieldset className="adw-extras"><legend>Settings to show</legend>{g!.extras.map(x => <label key={x.key} className="adw-check">
          <input type="checkbox" checked={extras.includes(x.key)} onChange={e => setExtras(s => e.target.checked ? [...s, x.key] : s.filter(k => k !== x.key))} data-testid={`adw-extra-${x.key}`} />
          <span>{x.label}<small>{String(x.value).slice(0, 24) || 'empty'}</small></span></label>)}</fieldset>}
        <div className="adw-grid adw-lic">
          <label className="adw-f"><span>Licence</span><input value={lic} maxLength={80} onChange={e => setLic(e.target.value)} data-testid="adw-license" /></label>
          <label className="adw-f"><span>Source link <small>optional</small></span><input value={src} type="url" inputMode="url" placeholder="https://…" maxLength={500} onChange={e => setSrc(e.target.value)} data-testid="adw-source" aria-invalid={err?.field === 'source' || undefined} /></label>
        </div>
        <p className="adw-honest">Runs on your own ComfyUI, with its custom nodes and models installed there. Anywhere else you get a sample. Not on Comfy Cloud yet.</p>
        {err && <div className="adw-err" role="alert" data-testid="adw-error"><Notice as="p" kind="error" tone="line">{err.error}</Notice>{!!err.errors?.length && <ul className="adw-errs">{err.errors.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>}
        <div className="dlg-a"><button type="button" className="btn btn-sm btn-ghost" onClick={onClose} disabled={!!busy}>Cancel</button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={!name.trim() || !pick.output || !cat || !!busy} data-testid="adw-save">{busy === 'save' ? 'Adding…' : 'Add workflow'}</button></div>
      </form>}
    </div></div>, document.body);
}
