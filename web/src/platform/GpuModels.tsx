import { Notice } from '../shared/Notice';
import { Link } from './router';
import { useEffect, useMemo, useState } from 'react';
import { FitTag } from '../shared/FitNote';
import { DlProgress } from '../shared/DlProgress';
import { gbText, localFitOf } from '../shared/fit';
import { repoDoc } from '../shared/brand';
import { listTools } from '../api';
import { countLocalModels, localCountsText, localReadyText, machineLabel, usableText, gbOf, type ToolsLike } from '../../../server/src/shared/thisComputer';
import { ComfyConnect, useComfyConnect, GET_COMFYUI_URL } from '../shared/ComfyConnect';
import { NodePacks } from './NodePacks';
import { getHardware, getLiveHardware, type LiveHardware, refreshHardware, setManualHardware, clearManualHardware, publishHardware, getComfy, setComfy, clearComfy, startDownload, dryRunDownload, listDownloads, getDownload, cancelDownload, dlDone, dlTotal,
  type Hardware, type ComfyAddr, type Download, type DlChoice, choiceText } from '../shared/hardware';

/** Settings → Local models (#gpu; was the Self-host page's Local setup until 2026-10-23): what this computer has, the ComfyUI address,
 *  and the model files. Install steps and the speed table live in the repo docs on GitHub. Downloads only start on a click. */
const num = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
/** ComfyUI reports "cuda:0 NVIDIA GeForce RTX 4090 : cudaMallocAsync": show the card's name, and a rounded size. */
const card = (s: string) => s.replace(/^\w+:\d+\s+/, '').replace(/\s+:\s+\S+$/, ''); const gb = (v: number) => `${v >= 2 ? Math.round(v) : v} GB`;
const INSTALL_DOC = repoDoc('docs/INSTALL.md');
const HW_DOC = repoDoc('docs/LOCAL-MODELS-AND-HARDWARE.md', 'will-it-run-on-my-machine');
type Health = { backend?: string; comfy?: { ready?: boolean; reachable?: boolean; version?: string }; gpu?: { name?: string; memoryTotal?: string } | null; models?: { missing?: unknown[]; total?: number } } | null;

export default function GpuModels() {
  const [hw, setHw] = useState<Hardware | null | undefined>(undefined); const [comfy, setC] = useState<ComfyAddr | null>(null);
  const [h, setH] = useState<Health | undefined>(undefined); const [n, setN] = useState(0);
  useEffect(() => { getHardware().then(r => setHw(r.ok ? r.data : null)); getComfy().then(r => setC(r.ok ? r.data : null)); }, []);
  useEffect(() => { let live = true; fetch('/api/health/self-host', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null).then(x => { if (live) setH(x); }); return () => { live = false; }; }, [n]);
  const put = (x: Hardware | null) => { setHw(x); publishHardware(x); };
  return <section className="set-sec st-gpu" id="gpu" aria-labelledby="set-gpu-h" data-testid="settings-gpu">
    <h2 id="set-gpu-h">Your computer</h2>
    <p className="helper">Run open models free and in private, right here.</p>
    <MachineCheck hw={hw} h={h} onHw={put} onRecheck={() => setN(x => x + 1)} />
    <h3 className="st-sub" id="comfy-address">ComfyUI address</h3>
    <ComfyCard addr={comfy} onAddr={setC} onTested={() => { setN(x => x + 1); return refreshHardware().then(r => { if (r.ok) put(r.data); }); }} />
    <h3 className="st-sub" id="nodes">ComfyUI add-ons</h3>
    <NodePacks />
    <h3 className="st-sub" id="model-files">Model files</h3>
    <ModelFiles />
    <p className="helper st-gpu-docs">Install steps and speed per GPU: <a href={INSTALL_DOC} target="_blank" rel="noopener noreferrer" data-testid="gpu-doc-install">Install guide ↗</a> · <a href={HW_DOC} target="_blank" rel="noopener noreferrer" data-testid="gpu-doc-hw">Will it run? ↗</a></p>
  </section>;
}

/** "This computer" (2026-10-31, hardware plan §3.5): the machine by its own name, what models can use, memory and disk right now (bars, re-read every
 *  5 s while the card is on screen), ComfyUI, PyTorch and the GGUF loader, and how many local models run here (shared/thisComputer.ts, the same
 *  count as Connections). Re-check reads the hardware again; the manual form shows when it can't be read. */
function MachineCheck({ hw, h, onHw, onRecheck }: { hw: Hardware | null | undefined; h: Health | undefined; onHw: (h: Hardware | null) => void; onRecheck: () => void }) {
  const [busy, setBusy] = useState(false); const [wait, setWait] = useState(0); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [tools, setTools] = useState<ToolsLike | null>(null); const live = useLive(); const ref = live.ref;
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { listTools().then(t => setTools(t as any)).catch(() => setTools([])); }, []);
  const recheck = async () => { setBusy(true); setErr(''); onRecheck(); const r = await refreshHardware(); setBusy(false);
    if (r.ok) { onHw(r.data); setWait(Math.min(60, Math.max(0, Number(r.data.refreshAfterSec) || 0))); } else setErr(r.error); };
  const loading = hw === undefined || h === undefined;
  const c = h?.comfy ?? {}; const preview = h?.backend === 'mock'; const lv = live.data;
  const on = lv?.comfy.reachable != null ? lv.comfy.reachable : c.ready === true || c.reachable === true || hw?.comfy?.reachable === true;
  const state: 'ok' | 'bad' | 'na' = loading ? 'na' : on ? 'ok' : preview && c.reachable !== false ? 'na' : 'bad';
  const version = lv?.comfy.version ?? hw?.comfy?.version ?? c.version ?? null; const torch = lv?.comfy.pytorch ?? hw?.comfy?.pytorch ?? null;
  const comfyText = loading ? '…' : on ? `Running${version ? ` · ${version}` : ''}` : preview && c.reachable !== false ? 'Sample mode' : 'Not running';
  const src = String(hw?.source ?? 'none'); const tier = String(hw?.tier ?? 'unknown'); const seen = !!hw && tier !== 'unknown';
  const name = machineLabel(hw?.profile) || (hw?.gpu?.name ? card(hw.gpu.name) : '');
  const title = loading ? 'Checking this computer…' : seen && name ? name : 'This computer';
  const usable = usableText(hw?.profile);
  const gguf = hw?.comfy?.ggufNode == null ? 'Not checked' : hw.comfy.ggufNode ? 'Installed' : 'Not installed';
  const ram = lv ? { total: lv.ram.totalBytes, free: lv.ram.freeBytes } : hw?.ram?.totalBytes ? { total: hw.ram.totalBytes, free: hw.ram.freeBytes ?? null } : null;
  const disk = lv?.disk ?? hw?.disk ?? null; const diskDir = disk?.path ?? hw?.comfy?.modelsDir ?? null;
  const counts = tools ? countLocalModels(tools) : null; const showForm = !!hw && (src === 'none' || tier === 'unknown');
  return <div className="st-pcard st-mc tc" ref={ref} data-testid="gpu-check" data-state={state} aria-busy={loading || busy}>
    <div className="st-mc-top">
      <span className="tc-ic" aria-hidden><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="5" y="5" width="10" height="10" rx="2" /><path d="M8 2.5v2.5M12 2.5v2.5M8 15v2.5M12 15v2.5M2.5 8h2.5M2.5 12h2.5M15 8h2.5M15 12h2.5" /></svg></span>
      <span className="st-mc-t"><small className="tc-eyebrow">This computer</small><b data-testid="gpu-fact-gpu">{title}</b>{seen && hw?.tierLabel && <small className="helper" data-testid="ls-tier-label">{hw.tierLabel}</small>}</span>
      <button type="button" className="btn btn-sm btn-ghost" data-testid="ready-recheck" disabled={busy || wait > 0} aria-busy={busy} onClick={recheck}>{busy ? 'Checking…' : wait > 0 ? `Re-check in ${wait} s` : 'Re-check'}</button>
    </div>
    {hw === null && <Notice as="p" kind="error" tone="line">Couldn’t read this computer’s hardware.</Notice>}
    {(seen || ram || disk?.totalBytes) && <div className="tc-bars">
      {ram && ram.free != null && ram.total > 0 && <Meter label="Memory now" used={ram.total - ram.free} total={ram.total} testId="tc-ram"
        sub={usable ? usable.replace(/^about/, 'About') : null} />}
      {!ram && usable && <small className="helper" data-testid="tc-usable">{usable.replace(/^about/, 'About')}</small>}
      {lv?.vram && <Meter label="Graphics memory now" used={lv.vram.totalBytes - lv.vram.freeBytes} total={lv.vram.totalBytes} testId="tc-vram" sub={null} />}
      {disk?.freeBytes != null && disk.totalBytes ? <Meter label="Disk for models" used={disk.totalBytes - disk.freeBytes} total={disk.totalBytes} testId="tc-disk" sub={diskDir ? `In ${diskDir}` : null} /> : null}
    </div>}
    <dl className="st-mc-facts" data-testid="gpu-facts">
      <div><dt>ComfyUI</dt><dd data-testid="gpu-comfy-state" role="status"><span className={`st-mc-dot ${state}`} aria-hidden />{comfyText}</dd></div>
      <div><dt>PyTorch</dt><dd data-testid="tc-torch">{loading ? '…' : torch ?? (on ? 'Not reported' : '—')}</dd></div>
      <div><dt>GGUF loader</dt><dd data-testid="tc-gguf">{loading ? '…' : gguf}</dd></div>
    </dl>
    {counts && counts.total > 0 && seen && <p className="tc-runs" data-testid="tc-counts"><b>{localCountsText(counts)}</b>{localReadyText(counts) && <span className="helper"> ({localReadyText(counts)})</span>}</p>}
    {!loading && state === 'bad' && <p className="helper st-mc-hint" data-testid="gpu-not-connected">Open ComfyUI and the app finds it on its own. New to it? <a href={GET_COMFYUI_URL} target="_blank" rel="noopener noreferrer">Get ComfyUI Desktop ↗</a></p>}
    {err && <Notice as="p" kind="error" tone="line">{err}</Notice>}
    {src === 'manual' && <p className="helper" data-testid="ls-manual">Using what you entered{hw?.manual?.vramGB != null ? `: ${hw.manual.vramGB} GB graphics memory` : ''}{hw?.manual?.ramGB != null ? `, ${hw.manual.ramGB} GB memory` : ''}. <button type="button" className="link-btn" data-testid="ls-clear" onClick={async () => { setErr(''); const r = await clearManualHardware(); if (r.ok) { onHw(r.data); setNote(''); } else setErr(r.error); }}>Clear</button></p>}
    {showForm && <ManualForm onSaved={(x, t) => { onHw(x); setNote(t); }} />}
    {note && <p className="helper" role="status" data-testid="ls-saved-note">{note}</p>}
  </div>;
}

/** A used / free bar: "Memory now · 51 GB used · 13 GB free". */
function Meter({ label, used, total, sub, testId }: { label: string; used: number; total: number; sub: string | null; testId: string }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0; const low = total > 0 && (total - used) / total < 0.1;
  return <div className="tc-meter" data-testid={testId} data-low={low || undefined}>
    <div className="tc-meter-h"><span>{label}</span><span className="tc-meter-n"><b>{gbOf(total - used)} free</b> of {gbOf(total)}</span></div>
    <div className="tc-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={`${gbOf(used)} used, ${gbOf(total - used)} free`}><i style={{ width: `${pct}%` }} /></div>
    {sub && <small className="helper">{sub}</small>}
  </div>;
}

/** GET /api/hardware/live every 5 s while the card is on screen and the tab is visible. */
function useLive() {
  const [data, setData] = useState<LiveHardware | null>(null); const [el, setEl] = useState<HTMLDivElement | null>(null); const [seen, setSeen] = useState(true);
  useEffect(() => { if (!el || typeof IntersectionObserver === 'undefined') return; const o = new IntersectionObserver(([e]) => setSeen(!!e?.isIntersecting)); o.observe(el); return () => o.disconnect(); }, [el]);
  useEffect(() => { if (!seen) return; let alive = true; let t: ReturnType<typeof setTimeout>;
    const tick = () => { if (document.visibilityState === 'hidden') { t = setTimeout(tick, 5000); return; } getLiveHardware().then(r => { if (alive && r.ok) setData(r.data); }).finally(() => { if (alive) t = setTimeout(tick, 5000); }); };
    tick(); return () => { alive = false; clearTimeout(t); }; }, [seen]);
  return { data, ref: setEl };
}

function ManualForm({ onSaved }: { onSaved: (h: Hardware, note: string) => void }) {
  const [v, setV] = useState(''); const [r, setR] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => { e.preventDefault(); const vg = num(v); if (vg == null) { setErr('Enter your graphics memory in GB.'); return; }
    setBusy(true); setErr(''); const x = await setManualHardware(vg, num(r)); setBusy(false); if (x.ok) onSaved(x.data, String(x.data.note ?? '')); else setErr(x.error); };
  return <form className="ls-manual-form" data-testid="ls-manual-form" onSubmit={save}>
    <p className="helper">Can’t read the hardware. Enter it to see what runs.</p>
    <label>Graphics memory (GB)<input className="conn-input" inputMode="decimal" data-testid="ls-vram" value={v} onChange={e => setV(e.target.value)} placeholder="8" /></label>
    <label>Memory (GB)<input className="conn-input" inputMode="decimal" data-testid="ls-ram" value={r} onChange={e => setR(e.target.value)} placeholder="16" /></label>
    <button className="btn btn-sm" disabled={busy} data-testid="ls-save">{busy ? 'Saving…' : 'Save'}</button>
    {err && <Notice as="p" kind="error" tone="line">{err}</Notice>}
  </form>;
}

/** The ComfyUI address: the shared form (shared/ComfyConnect: looks on its own, and again every few seconds while it isn't found). A new address
 *  it finds or you type is saved with "Use this ComfyUI"; a saved one that answers needs nothing. */
function ComfyCard({ addr, onAddr, onTested }: { addr: ComfyAddr | null; onAddr: (a: ComfyAddr) => void; onTested: () => void }) {
  const cc = useComfyConnect(); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const ro = addr ? !addr.canChange : false;
  useEffect(() => { if (cc.look.state === 'found') onTested(); }, [cc.look.state, cc.look.url]);
  const save = async (v: string | null) => { setBusy('save'); setErr(''); const r = v == null ? await clearComfy() : await setComfy(v); setBusy('');
    if (r.ok) { onAddr(r.data); if (v == null) void cc.find(); else cc.set(l => ({ ...l, save: false })); } else setErr(r.error); };
  return <div className="st-pcard ls-card ls-comfy" data-testid="ls-comfy">
    <ComfyConnect c={cc} onUse={l => save(l.url ?? null)} useLabel="Use this ComfyUI" useOnlyIfNew useBusy={busy === 'save'} canChange={!ro} />
    {!ro && addr?.savedUrl && <button type="button" className="link-btn" data-testid="ls-comfy-clear" disabled={!!busy} onClick={() => save(null)}>Forget the saved address</button>}
    {ro && addr && <p className="helper" data-testid="ls-comfy-ro">{addr.url ? 'Set on the server, so it can’t be changed here.' : 'Not set. It can only be set on the server.'}</p>}
    {err && <Notice as="p" kind="error" tone="line">{err}</Notice>}
  </div>;
}

/** Where model files go (GET /api/local/models-dir): the folder ComfyUI itself reads, learned from it, with Open and Copy. When the app can't
 *  learn it, no download is offered: it says where the files go inside ComfyUI's own folder instead. */
type ModelsDir = { source: 'env' | 'comfyui' | null; dir: string | null; writable: boolean; why: string | null; putIn: string; separator: string; canOpen: boolean };
function ModelsFolder({ onState }: { onState: (d: ModelsDir | null) => void }) {
  const [d, setD] = useState<ModelsDir | null | undefined>(undefined); const [msg, setMsg] = useState('');
  useEffect(() => { let live = true; const read = () => fetch('/api/local/models-dir').then(r => (r.ok ? r.json() : null)).catch(() => null).then((x: ModelsDir | null) => { if (live) { setD(x); onState(x); } });
    void read(); const t = setInterval(() => { if (document.visibilityState !== 'hidden') void read(); }, 10000); return () => { live = false; clearInterval(t); }; }, []);
  if (d === undefined) return null;
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setMsg('Copied.'); } catch { setMsg('Couldn’t copy. Select the path and copy it yourself.'); } };
  const open = async () => { const r = await fetch('/api/local/models-dir/open', { method: 'POST' }).then(x => x.json()).catch(() => null); setMsg(r?.opened ? 'Opened in a new window.' : r?.sample ? 'Sample mode: no window opens.' : String(r?.error ?? 'Couldn’t open the folder.')); };
  if (d?.dir && d.writable) return <div className="ls-dir" data-testid="ls-models-dir" data-source={d.source ?? undefined}>
    <span className="helper">Model files go to</span> <code className="ls-dir-path" data-testid="ls-models-dir-path">{d.dir}</code>
    <span className="ls-dir-acts">{d.canOpen && <button type="button" className="link-btn" onClick={() => void open()} data-testid="ls-models-dir-open">Open folder</button>}
      <button type="button" className="link-btn" onClick={() => void copy(d.dir!)} data-testid="ls-models-dir-copy">Copy path</button></span>
    <small className="helper">{d.source === 'env' ? 'Set in the app’s settings file.' : 'The folder your ComfyUI reads, so it finds new files at once.'}</small>
    {msg && <small className="helper" role="status">{msg}</small>}</div>;
  const where = d?.dir ? `${d.dir}${d.separator}checkpoints` : d?.putIn ?? 'ComfyUI/models/checkpoints';
  return <div className="ls-dir ls-dir-unknown" data-testid="ls-models-dir-unknown" data-why={d?.why ?? undefined}>
    <p className="helper"><b>{d?.why === 'remote' ? 'ComfyUI runs on another computer, so model files go there.' : d?.why === 'not_writable' ? 'The app can’t write to ComfyUI’s models folder.' : d?.why === 'env_missing' ? 'The models folder in the app’s settings file doesn’t exist.' : 'The app couldn’t find ComfyUI’s models folder.'}</b>  You can still add model files yourself:
      put each one in your ComfyUI folder under <code data-testid="ls-models-put-in">{where}</code> (text encoders and other kinds go in their own folder next to it), then restart ComfyUI.</p>
    <span className="ls-dir-acts"><button type="button" className="link-btn" onClick={() => void copy(where)} data-testid="ls-models-dir-copy">Copy path</button>
      {d?.canOpen && d.dir && <button type="button" className="link-btn" onClick={() => void open()} data-testid="ls-models-dir-open">Open folder</button>}</span>
    {msg && <small className="helper" role="status">{msg}</small>}</div>;
}

type Row = { id: string; providerId: string; name: string; bytes: number; src: string | null; fit: ReturnType<typeof localFitOf>; tools: string[] };
/** A server restart stops a running download and marks it failed; its .part file stays, so the next start resumes it. */
const interrupted = (x?: Download) => !!x && x.status === 'failed' && (/interrupt|resume/i.test(String(x.error ?? '')) || dlDone(x) > 0);
/** B31 (pb/hw2): one row per download the server names (requirements.downloadId), so the shared open-weights card shows as its model families. */
function ModelFiles() {
  const [d, setD] = useState<any>(undefined); const [dls, setDls] = useState<Record<string, Download>>({}); const [errs, setErrs] = useState<Record<string, { code?: string; text: string }>>({}); const [all, setAll] = useState(false);
  const [dirSet, setDirSet] = useState<boolean | null>(null); const [busy, setBusy] = useState(''); const [choices, setChoices] = useState<Record<string, DlChoice[]>>({});
  useEffect(() => { fetch('/api/models').then(r => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
    listDownloads().then(r => { if (!r.ok) return; setDirSet(r.data.modelsDirSet ?? !!r.data.modelsDir); const m: Record<string, Download> = {}; for (const x of r.data.downloads ?? []) { const k = x.downloadId ?? x.providerId; if (k) m[k] = x; } setDls(m); }); }, []);
  const rows = useMemo(() => { const u = new Map<string, Row>();
    for (const g of d?.groups ?? []) for (const m of g.models ?? []) { const req = m.requirements; if (!req || m.mockOnly || !(Number(req.downloadBytes) > 0)) continue;
      const id = String(req.downloadId ?? m.providerId); if (id === 'comfy-open') continue; // the bare shared card is ambiguous; its families have their own ids
      const x = u.get(id) ?? { id, providerId: String(m.providerId), name: String(m.displayName ?? m.name), bytes: Number(req.missingBytes ?? req.downloadBytes) || 0, src: req.missingBytesSource ?? null, fit: localFitOf(m), tools: [] as string[] };
      if (g.toolName && !x.tools.includes(g.toolName)) x.tools.push(g.toolName); u.set(id, x); }
    return [...u.values()].sort((a, b) => a.bytes - b.bytes); }, [d]);
  const noDir = dirSet === false; const dirWait = dirSet === null; // until the folder state is known, don't offer a download
  const active = (x?: Download) => !!x && (x.status === 'queued' || x.status === 'downloading');
  useEffect(() => { const live = Object.entries(dls).filter(([, x]) => active(x)); if (!live.length) return;
    const t = setTimeout(async () => { const next = { ...dls }; for (const [k, x] of live) { const r = await getDownload(x.id); if (r.ok) next[k] = r.data; } setDls(next); }, 1000); return () => clearTimeout(t); }, [dls]);
  /* Check the plan first (dry run: canDownload / code / the server's sentence), then start the real download with its downloadId. */
  const start = async (row: string, id: string) => { setErrs(e => ({ ...e, [row]: { text: '' } })); setBusy(row);
    const p = await dryRunDownload(id, null, true);
    if (!p.ok) { setBusy(''); if (p.code === 'ambiguous_download' && p.choices?.length) setChoices(c => ({ ...c, [row]: p.choices! })); else setErrs(e => ({ ...e, [row]: { code: p.code, text: p.error } })); return; }
    if (p.data.canDownload === false) { setBusy(''); if (p.data.code === 'no_models_dir') setDirSet(false); setErrs(e => ({ ...e, [row]: { code: p.data.code ?? undefined, text: String(p.data.error ?? '') } })); return; }
    const r = await startDownload(id); setBusy('');
    if (r.ok) { setChoices(c => ({ ...c, [row]: [] })); setDls(m => ({ ...m, [row]: r.data })); } else if (r.code === 'ambiguous_download' && r.choices?.length) setChoices(c => ({ ...c, [row]: r.choices! })); else setErrs(e => ({ ...e, [row]: { code: r.code, text: r.error } })); };
  const cancel = async (k: string, x: Download) => { const r = await cancelDownload(x.id); if (r.ok) setDls(m => ({ ...m, [k]: { ...r.data, status: r.data.status === 'downloading' || r.data.status === 'queued' ? 'canceled' : r.data.status } })); };
  if (d === undefined) return <div className="st-pcard ls-card ls-models" aria-busy="true"><span className="helper">Loading models…</span></div>;
  if (d === null) return <div className="st-pcard ls-card ls-models"><Notice as="p" kind="error" tone="line">Couldn’t load the model list.</Notice></div>;
  if (!rows.length) return <div className="st-pcard ls-card ls-models" data-testid="ls-models"><span className="helper">No local model files to get.</span></div>;
  const shown = all ? rows : rows.slice(0, 12); const nLive = Object.values(dls).filter(active).length;
  return <div className="st-pcard ls-card ls-models" data-testid="ls-models">
    <ModelsFolder onState={x => { if (x) setDirSet(x.writable); }} />
    {nLive > 0 && <p className="helper" role="status" data-testid="ls-live">{nLive === 1 ? '1 download running' : `${nLive} downloads running`}. It keeps going if you leave this page.</p>}
    <ul className="ls-mlist">{shown.map(r => { const x = dls[r.id]; const tot = dlTotal(x) || r.bytes; const done = dlDone(x); const pc = tot ? Math.min(100, Math.floor((done / tot) * 100)) : 0; const ch = choices[r.id]; const er = errs[r.id]; const intr = interrupted(x);
      return <li key={r.id} data-testid={`ls-model-${r.providerId}`} data-download-id={r.id}><span className="ls-mname"><b>{r.name}</b><small>{r.tools.slice(0, 3).join(' · ')}</small></span>
        <span className="ls-msize" data-testid="ls-msize" data-src={r.src ?? undefined}>{r.src === 'checked' && r.bytes === 0 ? 'On this computer' : <>{gbText(r.bytes)}{r.src === 'assumed_all' ? <small className="ls-msrc">full size</small> : r.src === 'checked' ? <small className="ls-msrc">missing</small> : null}</>}</span><FitTag fit={r.fit?.verdict === 'unknown' ? null : r.fit} className="ls-fit" />
        <span className="ls-mact">{active(x) ? <><DlProgress x={x} label={r.name} bytes={r.bytes} />
            <button type="button" className="btn btn-sm" data-testid="ls-cancel" aria-label={`Cancel ${r.name} download`} onClick={() => cancel(r.id, x!)}>Cancel</button></>
          : x?.status === 'done' ? <span className="ls-done" data-testid="ls-done">Downloaded ✓</span>
          : noDir ? null /* no folder to write into: no Download offer (the row above says where files go) */
          : <button type="button" className="btn btn-sm" data-testid={intr ? 'ls-resume' : 'ls-download'} disabled={dirWait || busy === r.id} aria-busy={busy === r.id} aria-label={`${intr ? 'Resume' : 'Download'} ${r.name}`} onClick={() => start(r.id, r.id)}>{busy === r.id ? 'Checking…' : intr ? 'Resume' : x?.status === 'failed' || x?.status === 'canceled' ? 'Download again' : 'Download'}</button>}</span>
        {ch && ch.length > 0 && <div className="ls-choices" role="group" aria-label={`Pick what to download for ${r.name}`} data-testid="ls-choices">{ch.map(c => <button key={c.downloadId} type="button" className="btn btn-sm" data-testid="ls-choice" disabled={!!busy} onClick={() => start(r.id, c.downloadId)}>{choiceText(c, ch)}{typeof c.bytesTotal === 'number' && c.bytesTotal > 0 ? ` · ${gbText(c.bytesTotal)}` : ''}</button>)}</div>}
        {intr ? <small className="helper" data-testid="ls-interrupted">Stopped by a restart{pc > 0 ? ` at ${pc}%` : ''}. Resume picks up where it left off.</small>
          : x?.status === 'failed' && x.error && <Notice as="p" kind="error" tone="line" className="inline-err" testId={x.errorCode === 'hf_gated' ? 'ls-gated' : undefined}>{x.errorCode === 'hf_gated' && x.helpUrl
            ? <>Accept the licence on <a href={x.helpUrl} target="_blank" rel="noreferrer">the model page ↗</a>, then <Link to="/settings#conn-hf">connect Hugging Face</Link>.</> : x.error}</Notice>}
        {x?.status === 'canceled' && <small className="helper">Canceled.</small>}
        {er?.text && <Notice as="p" kind="error" tone="line" className="inline-err" testId="ls-dl-err" data-code={er.code}>{er.text}</Notice>}</li>; })}</ul>
    {rows.length > 12 && <button type="button" className="link-btn" data-testid="ls-show-all" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
  </div>;
}
