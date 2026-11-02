import { useEffect, useState } from 'react';
import { Notice } from '../shared/Notice';

/** Settings → Your computer → ComfyUI add-ons (#nodes; "Install node" lands here): which add-ons (custom node packs) the app's workflows
 *  use, which ones your ComfyUI is missing, and how to add one with ComfyUI Manager, or by hand. Read only (GET /api/local/nodes). */
type Pack = { name: string; repo: string | null; dir: string | null; license: string | null; optional: boolean; note: string | null; classes: string[]; installed: boolean | null; missing: string[] };
type Nodes = { known: boolean; platform?: string; comfyUrl: string | null; packs: Pack[] };
/** The steps follow the computer the app (and so ComfyUI) runs on. */
const onWindows = (platform?: string) => platform ? platform === 'win32' : typeof navigator !== 'undefined' && /win/i.test(navigator.platform || navigator.userAgent);

export function NodePacks() {
  const [d, setD] = useState<Nodes | null | undefined>(undefined); const [busy, setBusy] = useState(false); const [all, setAll] = useState(false);
  const read = (fresh = false) => { setBusy(true); return fetch(`/api/local/nodes${fresh ? '?refresh=1' : ''}`).then(r => (r.ok ? r.json() : null)).catch(() => null).then(x => { setD(x); setBusy(false); }); };
  useEffect(() => { void read().then(() => { if (location.hash === '#nodes') requestAnimationFrame(() => document.getElementById('nodes')?.scrollIntoView({ block: 'start' })); }); }, []); /* "Install node" lands here */
  if (d === undefined) return <div className="st-pcard ls-card ls-nodes" aria-busy="true"><span className="helper">Checking add-ons…</span></div>;
  if (d === null) return <div className="st-pcard ls-card ls-nodes"><Notice as="p" kind="error" tone="line">Couldn’t read the add-on list.</Notice></div>;
  const missing = d.packs.filter(p => p.installed === false); const have = d.packs.filter(p => p.installed === true);
  const shown = !d.known ? (all ? d.packs : []) : missing;
  const again = <button type="button" className="btn btn-sm btn-ghost" disabled={busy} aria-busy={busy} onClick={() => void read(true)} data-testid="ls-nodes-check">{busy ? 'Checking…' : 'Check again'}</button>;
  return <div className="st-pcard ls-card ls-nodes" data-testid="ls-nodes">
    <p className="helper">Some models need an add-on in ComfyUI (a “custom node”). ComfyUI Manager adds them in a few clicks.</p>
    {!d.known ? <p className="helper" data-testid="ls-nodes-unknown">Open ComfyUI to see which add-ons it already has. {again}</p>
      : missing.length ? <p className="helper" data-testid="ls-nodes-missing"><b>{missing.length === 1 ? '1 add-on is missing' : `${missing.length} add-ons are missing`}</b> from your ComfyUI. {again}</p>
      : <p className="helper" data-testid="ls-nodes-ok">Your ComfyUI has every add-on the app uses. {again}</p>}
    {!d.known && <button type="button" className="link-btn" aria-expanded={all} onClick={() => setAll(a => !a)} data-testid="ls-nodes-all">{all ? 'Hide the list' : `See all ${d.packs.length} add-ons`}</button>}
    {shown.length > 0 && <ul className="ls-packs">{shown.map(p => <PackRow key={p.name} p={p} comfyUrl={d.comfyUrl} win={onWindows(d.platform)} />)}</ul>}
    {d.known && have.length > 0 && <small className="helper" data-testid="ls-nodes-have">Installed: {have.map(p => p.name).join(', ')}.</small>}
  </div>;
}

function PackRow({ p, comfyUrl, win }: { p: Pack; comfyUrl: string | null; win: boolean }) {
  const dir = p.dir ?? p.name;
  return <li className="ls-pack" data-testid={`ls-pack-${p.name}`} data-installed={p.installed == null ? undefined : String(p.installed)}>
    <span className="ls-pack-t"><b>{p.name}</b>{p.optional && <small className="helper"> optional</small>}
      {p.repo && <a href={p.repo} target="_blank" rel="noopener noreferrer" className="link-btn" data-testid="ls-pack-src">Source ↗</a>}{p.license && <small className="helper"> · {p.license}</small>}</span>
    {p.missing.length > 0 && <small className="helper">Missing nodes: {p.missing.slice(0, 4).join(', ')}{p.missing.length > 4 ? ` +${p.missing.length - 4}` : ''}</small>}
    <ol className="ls-pack-steps" data-testid="ls-pack-steps">
      <li>Open ComfyUI{comfyUrl && <> (<a href={comfyUrl} target="_blank" rel="noopener noreferrer">in the browser ↗</a>)</>}.</li>
      <li>Click <b>Manager</b>, then <b>Custom Nodes Manager</b>.</li>
      <li>Search for <b>{p.name}</b> and press <b>Install</b>.</li>
      <li>Restart ComfyUI when it asks, then press Check again here.</li>
    </ol>
    {p.note && <small className="helper">{p.note}</small>}
    <details className="ls-pack-manual"><summary>Not in Manager’s list? Add it by hand</summary>
      <ol className="ls-pack-steps">
        <li>Open your ComfyUI folder, then its <code>custom_nodes</code> folder.</li>
        <li>{win ? 'In that folder, open a terminal (right-click → Open in Terminal) and run:' : 'Open a terminal in that folder and run:'} <code>git clone {p.repo ?? '<source link>'}</code></li>
        <li>If the add-on has a <code>requirements.txt</code>, install it with ComfyUI’s own Python: {win
          ? <>ComfyUI Desktop: its built-in terminal, <code>pip install -r custom_nodes\{dir}\requirements.txt</code>. Portable: from the portable folder, <code>python_embeded\python.exe -m pip install -r ComfyUI\custom_nodes\{dir}\requirements.txt</code></>
          : <>ComfyUI Desktop: its built-in terminal, <code>pip install -r custom_nodes/{dir}/requirements.txt</code>. Your own install: from the ComfyUI folder, <code>venv/bin/python -m pip install -r custom_nodes/{dir}/requirements.txt</code> (ComfyUI’s own Python, not the system one)</>}</li>
        <li>Restart ComfyUI.</li>
      </ol></details>
  </li>;
}
