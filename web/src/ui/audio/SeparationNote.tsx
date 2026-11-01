import { useEffect, useState } from 'react';
import { dryRunDownload, startDownload } from '../../shared/hardware';
/** Keep the background (Translate a video, Change Voice): says whether the music stays under the new voice and, when not, the two parts it needs:
 *  the separation pack in ComfyUI (part of the app's node install; linked at its pinned source) and the model file, whose download the button
 *  starts (size on the button: pressing it is the yes). Nothing installs or downloads by itself.
 *  Server: GET /api/local/separation (comfy/separation.ts). */
type Sep = { ready: boolean; nodes: 'installed' | 'missing' | 'unknown'; model: 'present' | 'missing' | 'unknown'; bytes: number; downloadId: string; pack: { name: string; repo: string; source?: string } };
export function SeparationNote() {
  const [s, setS] = useState<Sep | null>(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; fetch('/api/local/separation').then(r => (r.ok ? r.json() : null)).then(d => { if (live && d) setS(d); }).catch(() => {}); return () => { live = false; }; }, []);
  if (!s) return null;
  if (s.ready) return <p className="as-note as-sep" role="note" data-testid="as-sep-note" data-ready="true">Background music kept: the voice is replaced, the music and sounds stay.</p>;
  const mb = Math.round(s.bytes / 1e6);
  const get = async () => {
    setBusy(true); setMsg('');
    const d = await dryRunDownload(s.downloadId, null, true);
    if (!d.ok) setMsg(d.error);
    else if (d.data.code === 'nothing_to_download') setMsg('The model file is already on this computer.');
    else if (!d.data.canDownload) setMsg(d.data.error ?? 'It can’t be downloaded here yet.');
    else { const r = await startDownload(s.downloadId); setMsg(r.ok ? 'Downloading the separation model. It works on your next run.' : r.error); }
    setBusy(false);
  };
  return <div className="as-note as-sep" role="note" data-testid="as-sep-note" data-ready="false">
    <span>Background music not kept. To keep it, add two things once:</span>
    <ol className="as-sep-steps">
      <li data-testid="as-sep-pack" data-done={String(s.nodes === 'installed')}>Separation pack for ComfyUI: {s.nodes === 'installed' ? <b>installed ✓</b>
        : <><a href={s.pack.source ?? s.pack.repo} target="_blank" rel="noopener noreferrer">install the separation pack ↗</a> (it comes with the app’s node install), then restart ComfyUI.{s.nodes === 'unknown' ? ' Not checked yet: ComfyUI isn’t connected.' : ''}</>}</li>
      <li data-testid="as-sep-model" data-done={String(s.model === 'present')}>Separation model: {s.model === 'present' ? <b>on this computer ✓</b>
        : <button type="button" className="as-sep-get" data-testid="as-sep-get" disabled={busy} onClick={get}>Get it ({mb} MB)</button>}</li>
    </ol>
    {msg && <span className="as-sep-msg" role="status">{msg}</span>}
  </div>;
}
