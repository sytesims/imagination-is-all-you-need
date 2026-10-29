import { newIdemKey } from '../../api';
import { useState } from 'react';
import { useOwnAccounts, runPrice } from '../../shared/billing';
/** (a) Draft 480p toggle for video tools. */
export function DraftToggle({ on, onChange, hint = 'Quick 480p preview. Upscale the one you like.' }: { on: boolean; onChange: (b: boolean) => void; hint?: string }) {
  return <label className={`nx-toggle draft-toggle ${on ? 'on' : ''}`}><input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} /><span className="nx-sw" /><span><b>Draft 480p</b><small>{hint}</small></span></label>;
}
/** (c) Keep original audio on swaps (default ON is the caller's initial state). */
export function KeepAudioToggle({ on, onChange }: { on: boolean; onChange: (b: boolean) => void }) {
  return <label className={`nx-toggle keep-audio ${on ? 'on' : ''}`}><input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} /><span className="nx-sw" /><span><b>Keep original audio</b><small>{on ? 'The clip keeps its own sound.' : 'Output is silent unless you add a soundtrack.'}</small></span></label>;
}
/** (a) Upscale on results: POST /api/jobs/:id/upscale → { id } of the new job. */
export function UpscaleButton({ jobId, from = '480p', to = '1080p', price, onStarted }: { jobId: string; from?: string; to?: string; price?: number; onStarted?: (id: string) => void }) {
  const [st, setSt] = useState<'idle' | 'busy' | 'err'>('idle'); const own = useOwnAccounts();
  async function go() {
    setSt('busy');
    try { const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/upscale`, { method: 'POST', headers: { 'Idempotency-Key': newIdemKey() } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(); setSt('idle'); onStarted?.(j.id); } catch { setSt('err'); }
  }
  return <button className="btn upscale-btn" onClick={go} disabled={st === 'busy'} title={st === 'err' ? 'Upscale failed. Try again.' : `${from} → ${to}`}>
    <span aria-hidden>⤢</span>{st === 'busy' ? 'Starting…' : st === 'err' ? 'Upscale failed · retry' : `Upscale to ${to}`}{price != null && <span className="cost cost-soft">{runPrice({ own, credits: price })}</span>}</button>;
}
/** (b) Pre-run warnings from POST /api/precheck. Dismissible, never blocking. */
export type Warning = { code: string; title: string; message: string; action?: string };
export function PrecheckWarnings({ warnings, onAction }: { warnings: Warning[]; onAction?: (code: string) => void }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const ws = warnings.filter(w => !hidden.includes(w.code));
  if (!ws.length) return null;
  return <div className="precheck" role="status">{ws.map(w => <div key={w.code} className={`pc-warn pc-${w.code}`}>
    <span className="pc-ic" aria-hidden>!</span><div className="pc-body"><b>{w.title}</b><p>{w.message}</p>{w.action && <button className="pc-act" onClick={() => onAction?.(w.code)}>{w.action}</button>}</div>
    <button className="pc-x" aria-label={`Dismiss: ${w.title}`} onClick={() => setHidden(h => [...h, w.code])}>×</button></div>)}</div>;
}
export const MOCK_WARNINGS: Warning[] = [
  { code: 'static', title: 'Not much movement', message: 'The clip barely moves. Swaps work best with some motion; a still-looking result is likely.' },
  { code: 'prop-size', title: 'Reference doesn’t match the size', message: 'The object in @image1 is much larger than the one in the clip. It may look scaled.', action: 'Show me' },
  { code: 'start-frame', title: 'Start frame can be used', message: 'Your first frame is clean, so we can lock identity from it for a steadier swap.', action: 'Use start frame' },
];
/** (e) Prompt enhance + style presets for image tools. */
export function PromptEnhance({ value, onChange, enhance }: { value: string; onChange: (s: string) => void; enhance?: (s: string) => Promise<string> }) {
  const [busy, setBusy] = useState(false);
  return <button className="btn btn-sm enhance-btn" disabled={!value.trim() || busy} onClick={async () => { setBusy(true); try { onChange(enhance ? await enhance(value) : `${value.trim()}, soft natural light, detailed textures, 35mm photo`); } finally { setBusy(false); } }} title="Rewrite the prompt with more detail">✧ {busy ? 'Enhancing…' : 'Enhance'}</button>;
}
export function StylePresets({ styles, value, onChange }: { styles: { id: string; label: string; poster?: string }[]; value: string; onChange: (id: string) => void }) {
  return <div className="style-presets" role="radiogroup" aria-label="Style">{styles.map(s => <button key={s.id} role="radio" aria-checked={value === s.id} className={`sp-tile ${value === s.id ? 'on' : ''}`} onClick={() => onChange(value === s.id ? '' : s.id)}>
    <span className="sp-art" style={s.poster ? { backgroundImage: `url(${s.poster})` } : { ['--h' as any]: [...s.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7) }} /><span>{s.label}</span></button>)}</div>;
}
/** (f) Audio mode tabs. */
export type AudioMode = 'voiceover' | 'change-voice' | 'translate' | 'lipsync';
export function AudioModeTabs({ value, onChange }: { value: AudioMode; onChange: (m: AudioMode) => void }) {
  const M: [AudioMode, string, string][] = [['voiceover', 'Text to speech', ''], ['change-voice', 'Change voice', ''], ['translate', 'Translate', ''], ['lipsync', 'Talking photo', '']];
  return <div className="audio-modes" role="tablist">{M.map(([k, l, d]) => <button key={k} role="tab" data-testid={`voice-mode-${k}`} aria-selected={value === k} className={`am-tab ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}><b>{l}</b>{d && <small>{d}</small>}</button>)}</div>;
}
