import { Notice } from '../shared/Notice';
import { Link } from './router';
import { useEffect, useMemo, useState } from 'react';
import { FitTag } from '../shared/FitNote';
import { gbText, localFitOf } from '../shared/fit';
import { repoDoc } from '../shared/brand';
import { getHardware, refreshHardware, setManualHardware, clearManualHardware, publishHardware, getComfy, setComfy, clearComfy, testComfy, startDownload, dryRunDownload, listDownloads, getDownload, cancelDownload, dlDone, dlTotal,
  type Hardware, type ComfyAddr, type ComfyTest, type Download, type DlChoice, choiceText } from '../shared/hardware';

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
    <h3 className="st-sub" id="model-files">Model files</h3>
    <ModelFiles />
    <p className="helper st-gpu-docs">Install steps and speed per GPU: <a href={INSTALL_DOC} target="_blank" rel="noopener noreferrer" data-testid="gpu-doc-install">Install guide ↗</a> · <a href={HW_DOC} target="_blank" rel="noopener noreferrer" data-testid="gpu-doc-hw">Will it run? ↗</a></p>
  </section>;
}

/** One card: ComfyUI, GPU, memory, free disk, models on disk, and Re-check (reads the hardware again and the server's health). */
function MachineCheck({ hw, h, onHw, onRecheck }: { hw: Hardware | null | undefined; h: Health | undefined; onHw: (h: Hardware | null) => void; onRecheck: () => void }) {
  const [busy, setBusy] = useState(false); const [wait, setWait] = useState(0); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const recheck = async () => { setBusy(true); setErr(''); onRecheck(); const r = await refreshHardware(); setBusy(false);
    if (r.ok) { onHw(r.data); setWait(Math.min(60, Math.max(0, Number(r.data.refreshAfterSec) || 0))); } else setErr(r.error); };
  const loading = hw === undefined || h === undefined;
  const c = h?.comfy ?? {}; const preview = h?.backend === 'mock';
  const on = c.ready === true || c.reachable === true || hw?.comfy?.reachable === true;
  const state: 'ok' | 'bad' | 'na' = loading ? 'na' : on ? 'ok' : preview && c.reachable !== false ? 'na' : 'bad';
  const title = loading ? 'Checking this computer…' : on ? `ComfyUI connected${c.version ? ` · ${c.version}` : ''}` : preview && c.reachable !== false ? 'Sample mode · free samples' : 'ComfyUI not reachable';
  const src = String(hw?.source ?? 'none'); const tier = String(hw?.tier ?? 'unknown');
  /* B34 (pb/dp30): effectiveVramGB null = unread → 'Not found'; 0 = a real 0 (manual / CPU-only) */
  const vram0 = hw ? (hw.effectiveVramGB !== undefined ? hw.effectiveVramGB : (hw.gpu?.vramTotalGB ?? null)) : null; const vram = vram0 == null || (src === 'none' && vram0 !== 0) ? null : vram0;
  const gpu = hw?.gpu?.name ? `${card(hw.gpu.name)}${vram != null ? ` · ${gb(vram)}` : ''}` : h?.gpu?.name ? `${card(h.gpu.name)}${h.gpu.memoryTotal ? ` · ${h.gpu.memoryTotal}` : ''}` : vram === 0 ? 'None' : vram != null ? gb(vram) : 'Not found';
  const miss = Array.isArray(h?.models?.missing) ? h!.models!.missing!.length : null; const tot = typeof h?.models?.total === 'number' ? h.models.total : null;
  const models = miss != null && tot != null ? `${tot - miss} of ${tot}` : 'Not checked';
  const tierText = hw && tier !== 'unknown' ? hw.tierLabel || '' : '';
  const showForm = !!hw && (src === 'none' || tier === 'unknown');
  return <div className="st-pcard st-mc" data-testid="gpu-check" data-state={state} aria-busy={loading || busy}>
    <div className="st-mc-top">
      <span className={`st-mc-dot ${state}`} aria-hidden />
      <span className="st-mc-t"><b data-testid="gpu-comfy-state" role="status">{title}</b>{tierText && <small className="helper" data-testid="ls-tier-label">{tierText}</small>}</span>
      <button type="button" className="btn btn-sm btn-ghost" data-testid="ready-recheck" disabled={busy || wait > 0} aria-busy={busy} onClick={recheck}>{busy ? 'Checking…' : wait > 0 ? `Re-check in ${wait} s` : 'Re-check'}</button>
    </div>
    {hw === null && <Notice as="p" kind="error" tone="line">Couldn’t read this computer’s hardware.</Notice>}
    <dl className="st-mc-facts" data-testid="gpu-facts">
      <div><dt>GPU</dt><dd data-testid="gpu-fact-gpu">{loading ? '…' : gpu}</dd></div>
      <div><dt>Memory</dt><dd>{loading ? '…' : Number(hw?.ram?.totalGB) > 0 ? `${hw?.ram?.totalGB} GB` : 'Not found'}</dd></div>
      <div><dt>Free disk</dt><dd>{loading ? '…' : hw?.disk?.freeBytes != null ? gbText(hw.disk.freeBytes) : 'Not found'}</dd></div>
      <div><dt>Models on disk</dt><dd data-testid="gpu-fact-models">{loading ? '…' : models}</dd></div>
    </dl>
    {!loading && state === 'bad' && <p className="helper st-mc-hint" data-testid="gpu-not-connected">Start ComfyUI, then test its address below. New to it? <a href={INSTALL_DOC} target="_blank" rel="noopener noreferrer">Install guide ↗</a></p>}
    {err && <Notice as="p" kind="error" tone="line">{err}</Notice>}
    {src === 'manual' && <p className="helper" data-testid="ls-manual">Using what you entered{hw?.manual?.vramGB != null ? `: ${hw.manual.vramGB} GB graphics memory` : ''}{hw?.manual?.ramGB != null ? `, ${hw.manual.ramGB} GB memory` : ''}. <button type="button" className="link-btn" data-testid="ls-clear" onClick={async () => { setErr(''); const r = await clearManualHardware(); if (r.ok) { onHw(r.data); setNote(''); } else setErr(r.error); }}>Clear</button></p>}
    {showForm && <ManualForm onSaved={(x, t) => { onHw(x); setNote(t); }} />}
    {note && <p className="helper" role="status" data-testid="ls-saved-note">{note}</p>}
  </div>;
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

function ComfyCard({ addr, onAddr, onTested }: { addr: ComfyAddr | null; onAddr: (a: ComfyAddr) => void; onTested: () => void }) {
  const [url, setUrl] = useState(''); const [t, setT] = useState<ComfyTest | null>(null); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { setUrl(addr?.url ?? ''); }, [addr?.url]);
  const ro = addr ? !addr.canChange : true; const dirty = (addr?.url ?? '') !== url.trim();
  const test = async () => { setBusy('test'); setErr(''); setT(null); const r = await testComfy(url.trim() || undefined); setBusy(''); if (r.ok) { setT(r.data); if (r.data.reachable) onTested(); } else setErr(r.error); };
  const save = async (v: string | null) => { setBusy('save'); setErr(''); const r = v == null ? await clearComfy() : await setComfy(v); setBusy(''); if (r.ok) onAddr(r.data); else setErr(r.error); };
  return <div className="st-pcard ls-card ls-comfy" data-testid="ls-comfy">
    {/* Enter tests the address (no save) */}
    <form className="ls-comfy-row" onSubmit={e => { e.preventDefault(); if (!busy && (url.trim() || addr?.url)) void test(); }}>
      <input type="url" className="conn-input" aria-labelledby="comfy-address" data-testid="ls-comfy-url" value={url} readOnly={ro} aria-readonly={ro} placeholder={ro ? '' : 'http://127.0.0.1:8188'} onChange={e => setUrl(e.target.value)} />
      <button type="submit" className="btn btn-sm" data-testid="ls-comfy-test" disabled={!!busy || (!url.trim() && !addr?.url)} aria-busy={busy === 'test'}>{busy === 'test' ? 'Testing…' : 'Test'}</button>
      {!ro && <button type="button" className="btn btn-sm btn-ghost" data-testid="ls-comfy-save" disabled={!!busy || !dirty || !url.trim()} onClick={() => save(url.trim())}>Save</button>}
    </form>
    {!ro && addr?.savedUrl && <button type="button" className="link-btn" data-testid="ls-comfy-clear" disabled={!!busy} onClick={() => save(null)}>Use the default</button>}
    {ro && addr && <p className="helper" data-testid="ls-comfy-ro">{addr.url ? 'Set on the server, so it can’t be changed here.' : 'Not set. It can only be set on the server.'}</p>}
    {t && <div className={`ls-test ${t.reachable ? 'ok' : 'bad'}`} role="status" data-testid="ls-comfy-result">
      {t.reachable ? <><b>Connected</b>{[t.version ? `ComfyUI ${t.version}` : '', t.gpu?.name ? `${card(t.gpu.name)}${t.gpu.vramTotalGB != null ? ` · ${gb(t.gpu.vramTotalGB)}` : ''}` : '', t.ggufNode == null ? '' : t.ggufNode ? 'GGUF loader installed' : 'GGUF loader not installed', t.latencyMs != null ? `${t.latencyMs} ms` : ''].filter(Boolean).map(x => <span key={x}>{x}</span>)}</>
        : t.error ? <b data-testid="ls-comfy-err" data-code={t.errorCode ?? undefined}>{t.error /* B31: the server's sentence for its errorCode, word for word */}</b> : <b>Not reachable</b>}
    </div>}
    {err && <Notice as="p" kind="error" tone="line">{err}</Notice>}
  </div>;
}

/* B31: the server's sentence for a missing models folder (dry run code no_models_dir), shown until the live one arrives. */
const NO_DIR = 'No ComfyUI models folder is set, so there is nowhere to put the files.';
type Row = { id: string; providerId: string; name: string; bytes: number; src: string | null; fit: ReturnType<typeof localFitOf>; tools: string[] };
/** A server restart stops a running download and marks it failed; its .part file stays, so the next start resumes it. */
const interrupted = (x?: Download) => !!x && x.status === 'failed' && (/interrupt|resume/i.test(String(x.error ?? '')) || dlDone(x) > 0);
/** B31 (pb/hw2): one row per download the server names (requirements.downloadId), so the shared open-weights card shows as its model families. */
function ModelFiles() {
  const [d, setD] = useState<any>(undefined); const [dls, setDls] = useState<Record<string, Download>>({}); const [errs, setErrs] = useState<Record<string, { code?: string; text: string }>>({}); const [all, setAll] = useState(false);
  const [dirSet, setDirSet] = useState<boolean | null>(null); const [dirWhy, setDirWhy] = useState(NO_DIR); const [busy, setBusy] = useState(''); const [choices, setChoices] = useState<Record<string, DlChoice[]>>({});
  useEffect(() => { fetch('/api/models').then(r => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
    listDownloads().then(r => { if (!r.ok) return; setDirSet(r.data.modelsDirSet ?? !!r.data.modelsDir); const m: Record<string, Download> = {}; for (const x of r.data.downloads ?? []) { const k = x.downloadId ?? x.providerId; if (k) m[k] = x; } setDls(m); }); }, []);
  const rows = useMemo(() => { const u = new Map<string, Row>();
    for (const g of d?.groups ?? []) for (const m of g.models ?? []) { const req = m.requirements; if (!req || m.mockOnly || !(Number(req.downloadBytes) > 0)) continue;
      const id = String(req.downloadId ?? m.providerId); if (id === 'comfy-open') continue; // the bare shared card is ambiguous; its families have their own ids
      const x = u.get(id) ?? { id, providerId: String(m.providerId), name: String(m.displayName ?? m.name), bytes: Number(req.missingBytes ?? req.downloadBytes) || 0, src: req.missingBytesSource ?? null, fit: localFitOf(m), tools: [] as string[] };
      if (g.toolName && !x.tools.includes(g.toolName)) x.tools.push(g.toolName); u.set(id, x); }
    return [...u.values()].sort((a, b) => a.bytes - b.bytes); }, [d]);
  /* No folder: the server's own sentence from one dry run (nothing is fetched). */
  useEffect(() => { if (dirSet !== false || !rows.length) return; dryRunDownload(rows[0].id).then(r => { if (r.ok && r.data.code === 'no_models_dir' && r.data.error) setDirWhy(r.data.error); }); }, [dirSet, rows.length]);
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
    {noDir && <p className="helper" id="ls-no-dir" data-testid="ls-no-dir">{dirWhy}</p>}
    {nLive > 0 && <p className="helper" role="status" data-testid="ls-live">{nLive === 1 ? '1 download running' : `${nLive} downloads running`}. It keeps going if you leave this page.</p>}
    <ul className="ls-mlist">{shown.map(r => { const x = dls[r.id]; const tot = dlTotal(x) || r.bytes; const done = dlDone(x); const pc = tot ? Math.min(100, Math.floor((done / tot) * 100)) : 0; const ch = choices[r.id]; const er = errs[r.id]; const intr = interrupted(x);
      return <li key={r.id} data-testid={`ls-model-${r.providerId}`} data-download-id={r.id}><span className="ls-mname"><b>{r.name}</b><small>{r.tools.slice(0, 3).join(' · ')}</small></span>
        <span className="ls-msize" data-testid="ls-msize" data-src={r.src ?? undefined}>{r.src === 'checked' && r.bytes === 0 ? 'On this computer' : <>{gbText(r.bytes)}{r.src === 'assumed_all' ? <small className="ls-msrc">full size</small> : r.src === 'checked' ? <small className="ls-msrc">missing</small> : null}</>}</span><FitTag fit={r.fit?.verdict === 'unknown' ? null : r.fit} className="ls-fit" />
        <span className="ls-mact">{active(x) ? <><span className="ls-prog" data-testid="ls-progress"><span className="bar" role="progressbar" aria-label={`${r.name} download`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pc}><span style={{ width: `${pc}%` }} /></span><small>{pc}%{x?.etaSeconds ? ` · about ${Math.max(1, Math.round(x.etaSeconds / 60))} min left` : ''}</small></span>
            <button type="button" className="btn btn-sm" data-testid="ls-cancel" aria-label={`Cancel ${r.name} download`} onClick={() => cancel(r.id, x!)}>Cancel</button></>
          : x?.status === 'done' ? <span className="ls-done" data-testid="ls-done">Downloaded ✓</span>
          : <button type="button" className="btn btn-sm" data-testid={intr ? 'ls-resume' : 'ls-download'} disabled={noDir || dirWait || busy === r.id} aria-busy={busy === r.id} aria-label={`${intr ? 'Resume' : 'Download'} ${r.name}`} aria-describedby={noDir ? 'ls-no-dir' : undefined} title={noDir ? dirWhy : undefined} onClick={() => start(r.id, r.id)}>{busy === r.id ? 'Checking…' : intr ? 'Resume' : x?.status === 'failed' || x?.status === 'canceled' ? 'Download again' : 'Download'}</button>}</span>
        {ch && ch.length > 0 && <div className="ls-choices" role="group" aria-label={`Pick what to download for ${r.name}`} data-testid="ls-choices">{ch.map(c => <button key={c.downloadId} type="button" className="btn btn-sm" data-testid="ls-choice" disabled={!!busy} onClick={() => start(r.id, c.downloadId)}>{choiceText(c, ch)}{typeof c.bytesTotal === 'number' && c.bytesTotal > 0 ? ` · ${gbText(c.bytesTotal)}` : ''}</button>)}</div>}
        {intr ? <small className="helper" data-testid="ls-interrupted">Stopped by a restart{pc > 0 ? ` at ${pc}%` : ''}. Resume picks up where it left off.</small>
          : x?.status === 'failed' && x.error && <Notice as="p" kind="error" tone="line" className="inline-err" testId={x.errorCode === 'hf_gated' ? 'ls-gated' : undefined}>{x.errorCode === 'hf_gated' && x.helpUrl
            ? <>Accept the licence on <a href={x.helpUrl} target="_blank" rel="noreferrer">the model page ↗</a>, then <Link to="/settings#conn-hf">connect Hugging Face</Link>.</> : x.error}</Notice>}
        {x?.status === 'canceled' && <small className="helper">Canceled.</small>}
        {er?.text && <Notice as="p" kind="error" tone="line" className="inline-err" testId="ls-dl-err" data-code={er.code}>{er.text}</Notice>}</li>; })}</ul>
    {rows.length > 12 && <button type="button" className="link-btn" data-testid="ls-show-all" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
  </div>;
}
