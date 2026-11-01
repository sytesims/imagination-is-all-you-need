import { useEffect, useState } from 'react';
import { dryRunDownload, startDownload } from '../../shared/hardware';
/** Keep the background (Translate a video, Change Voice): says whether the music stays under the new voice, and offers the separation model's
 *  download (size on the button: pressing it is the yes). The node pack can't be installed from here: the note says where to get it.
 *  Server: GET /api/local/separation (comfy/separation.ts). */
type Sep = { ready: boolean; nodes: 'installed' | 'missing' | 'unknown'; model: 'present' | 'missing' | 'unknown'; bytes: number; downloadId: string; pack: { name: string; repo: string } };
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
  return <p className="as-note as-sep" role="note" data-testid="as-sep-note" data-ready="false">
    Background music not kept: add the separation model.{' '}
    {s.model !== 'present' && <button type="button" className="as-sep-get" data-testid="as-sep-get" disabled={busy} onClick={get}>Get it ({mb} MB)</button>}
    {s.nodes === 'missing' && <> It also needs the <a href={s.pack.repo} target="_blank" rel="noopener noreferrer">MelBandRoFormer node pack ↗</a> in ComfyUI.</>}
    {msg && <span className="as-sep-msg" role="status"> {msg}</span>}
  </p>;
}
