/** Shared voice delivery controls (Voice Studio + the Audio tool's voice mode). Driven by tool.app.voiceControls / voiceCaps / voiceControlModes. */
import { useEffect, useRef, useState } from 'react';
import { BarPopover, PopSection, PopList, PopRow } from '../../shared/BarPop';
import type { ToolInfo } from '../../api';
import { FieldIssue } from '../IssueList';

export const CTRL = ['expression', 'mood', 'speed', 'pitch', 'volume', 'outputFormat', 'sampleRate'] as const;
/** A model's own voice choices (2026-10-27, Qwen3 TTS): preset voice, spoken language, Style (voiceDetails). Kept only for a model whose voiceCaps has them. */
export const MODEL_VOICE_KEYS = ['speaker', 'speechLanguage', 'voiceDetails'] as const;
export type ModelVoice = { id: string; label: string; hint?: string; /** a real clip of this voice (Qwen3 TTS: examples/voice/qwen3-tts) */ sampleUrl?: string };
/** A library voice's ▶ (GET /api/voices): only a REAL recording of the voice (sampleKind 'real'). A stand-in tone or a mock preview gets no button. */
export const realSampleOf = (v: { sampleUrl?: string | null; sampleKind?: string | null; sampleIsStandIn?: boolean } | null | undefined): string | undefined =>
  v?.sampleUrl && v.sampleKind === 'real' && v.sampleIsStandIn !== true ? v.sampleUrl : undefined;
/** The voice list the Voice picker shows for this model: its own preset voices (caps.voices → field `speaker`), else null (our voice library, field `voice`). */
export function modelVoicesOf(caps: any): { field: 'speaker'; voices: ModelVoice[]; def: string } | null {
  const v: ModelVoice[] | undefined = caps?.voices; return Array.isArray(v) && v.length ? { field: 'speaker', voices: v, def: String(caps.defaultVoice ?? v[0].id) } : null;
}
const OPUS_RATES = [8000, 16000, 24000, 48000];
const RATE_HINT: Record<number, string> = { 8000: 'low / phone quality', 16000: 'basic / voice calls', 24000: 'default, fine for voice', 32000: 'near-CD', 44100: 'CD quality', 48000: 'video / studio' };
type FV = Record<string, any>; type SetFV = (f: (v: FV) => FV) => void;

export function voiceCtl(tool: ToolInfo, provider: string, mode: string, fv: FV) {
  const cfg: any = tool.app ?? {}; const vcDef: any = cfg.voiceControls ?? {}; const caps: any = cfg.voiceCaps?.[provider] ?? null; const ctrlMode = (cfg.voiceControlModes ?? []).includes(mode);
  const via = (k: string) => caps?.controls?.[k]?.via ?? 'unsupported'; const ok = (k: string) => ctrlMode && !!caps && via(k) !== 'unsupported';
  const fmts: string[] = caps?.outputFormats ?? vcDef.outputFormat?.options ?? []; const fmt = String(fv.outputFormat ?? vcDef.outputFormat?.default ?? 'mp3');
  const rates: number[] = (caps?.sampleRates ?? vcDef.sampleRate?.options ?? []).filter((r: number) => fmt !== 'opus' || OPUS_RATES.includes(r));
  const defs = () => Object.fromEntries(CTRL.map(k => [k, vcDef[k]?.default]).filter(([, v]) => v !== undefined));
  return { cfg, vcDef, caps, ctrlMode, via, ok, fmts, fmt, rates, defs };
}

/** Keeps fieldVals to the controls this model takes (defaults filled, unsupported removed; no outputFormat for video output). */
export function useVoiceControls(tool: ToolInfo, provider: string, mode: string, fv: FV, setFv: SetFV, videoOut = false, enabled = true) {
  const c = voiceCtl(tool, provider, mode, fv); const { caps, fmts, fmt, ok, defs } = c;
  useEffect(() => { if (!enabled) return; setFv(v => { const n2: Record<string, any> = { ...v }; const d = defs(); for (const k of CTRL) { if (ok(k) && !(k === 'outputFormat' && (videoOut || !fmts.length))) { if ((n2[k] === undefined || n2[k] === '') && !(k === 'sampleRate' && videoOut)) n2[k] = d[k]; } else delete n2[k]; }
    /* the model's own voice, language and Style: default in when it has them, out when it doesn't (another model would refuse them) */
    const mv = c.ctrlMode ? modelVoicesOf(caps) : null; const langs: any[] = c.ctrlMode && Array.isArray(caps?.languages) ? caps.languages : [];
    if (mv) { if (!mv.voices.some(x => x.id === n2.speaker)) n2.speaker = mv.def; } else delete n2.speaker;
    if (langs.length) { if (!langs.some(l => l.value === n2.speechLanguage)) n2.speechLanguage = String(caps.defaultLanguage ?? langs[0].value); } else delete n2.speechLanguage;
    if (!ok('voiceDetails')) delete n2.voiceDetails;
    if (videoOut) delete n2.sampleRate; // 'Original' until the user picks a rate
    if (n2.outputFormat && !fmts.includes(String(n2.outputFormat))) n2.outputFormat = fmts[0]; const rs = (caps?.sampleRates ?? []).filter((r: number) => n2.outputFormat !== 'opus' || OPUS_RATES.includes(r)); if (n2.sampleRate && rs.length && !rs.includes(Number(n2.sampleRate))) n2.sampleRate = rs.includes(24000) ? 24000 : rs[0]; return n2; }); }, [provider, mode, fmt, !!caps, videoOut, enabled]);
  return c;
}

export function VoiceControls({ tool, provider, mode, fv, setFv, issues, videoOut = false }: { tool: ToolInfo; provider: string; mode: string; fv: FV; setFv: SetFV; issues: any[]; videoOut?: boolean }) {
  const { vcDef, caps, ctrlMode, via, ok, fmts, fmt, rates } = voiceCtl(tool, provider, mode, fv); const [vOpen, setVOpen] = useState(''); const btns = useRef<Record<string, HTMLButtonElement | null>>({}); const anc = (k: string) => ({ current: btns.current[k] ?? null }); const close = () => setVOpen(''); /* the shared Popover: Escape, outside click, focus back */
  return <>
            {ctrlMode && !caps && <p className="as-note">This model has no adjustable delivery settings.</p>}
            {ctrlMode && caps && <>
              {Array.isArray(caps.languages) && caps.languages.length > 0 && (() => { const ls: { value: string; label: string }[] = caps.languages; const lv = String(fv.speechLanguage ?? caps.defaultLanguage ?? ls[0].value); const ll = ls.find(l => l.value === lv)?.label ?? lv;
                return <div className="as-selwrap"><button ref={el => { btns.current.slang = el; }} type="button" className={`as-row ${vOpen === 'slang' ? 'on' : ''}`} aria-haspopup="listbox" data-testid="as-speech-language" aria-expanded={vOpen === 'slang'} title="The language the script is read in" onClick={() => setVOpen(vOpen === 'slang' ? '' : 'slang')}><span>Language</span><b>{ll}</b><i aria-hidden>›</i></button>
                  <BarPopover open={vOpen === 'slang'} anchor={anc('slang')} onClose={close} label="Language" role="listbox" testId="as-speech-language-menu" width={240}><PopSection label="Language"><PopList label="Language">{ls.map(o => <PopRow key={o.value} selected={o.value === lv} testId={`as-speech-language-${o.value}`} label={o.label} hint={o.value === 'auto' ? 'From the script' : undefined} onClick={() => { setFv(x => ({ ...x, speechLanguage: o.value })); close(); }} />)}</PopList></PopSection></BarPopover></div>; })()}
              <FieldIssue issues={issues} field="speechLanguage" />
              {ok('voiceDetails') && (() => { const max = Number(vcDef.voiceDetails?.maxLength ?? 500); const t = String(fv.voiceDetails ?? ''); const lbl = String(caps.detailsLabel ?? 'Voice details');
                return <div className="as-vd" data-testid="as-style-wrap"><label htmlFor="as-style">{lbl} <span className="as-opt">Optional</span></label>
                  <textarea id="as-style" data-testid="as-style" maxLength={max} rows={2} placeholder={String(caps.detailsPlaceholder ?? 'e.g. warm, low voice, slow and calm')} value={t} onChange={e => { const x = e.target.value; setFv(v => { const n2 = { ...v }; if (x) n2.voiceDetails = x; else delete n2.voiceDetails; return n2; }); }} />
                  <span className="as-count">{t.length}/{max}</span></div>; })()}
              <FieldIssue issues={issues} field="voiceDetails" />
              <div className={`as-xs ${ok('expression') ? '' : 'off'}`} title={ok('expression') ? undefined : 'This model has no expression control'}>
                <span className="as-xs-l">Expression intensity</span>{(() => { const c = vcDef.expression ?? { min: 0, max: 10, step: 1 }; const v = Number(fv.expression ?? c.default ?? 5); const f = (v - c.min) / (c.max - c.min) * 100;
                  return <><span className="as-xs-fill" style={{ width: `${f}%` }} />{Array.from({ length: 5 }, (_, i) => <i key={i} className="as-xs-tick" style={{ left: `${(i + 1) * 16.6}%` }} />)}<span className="as-xs-thumb" style={{ left: `calc(${f}% - 2px)` }} />
                  <input type="range" min={c.min} max={c.max} step={c.step} value={v} disabled={!ok('expression')} aria-label="Expression intensity" data-testid="as-expression" onChange={e => setFv(x => ({ ...x, expression: Number(e.target.value) }))} /><b className="as-xs-v">{v}</b></>; })()}</div>
              <FieldIssue issues={issues} field="expression" />
              <div className={`as-mood ${ok('mood') ? '' : 'off'}`} title={ok('mood') ? undefined : 'This model has no mood control'}>
                <span className="as-mood-l">Mood</span>{(() => { const c = vcDef.mood ?? { min: -1, max: 1, step: 0.1 }; const v = Number(fv.mood ?? c.default ?? 0); const f = (v - c.min) / (c.max - c.min) * 100;
                  return <div className="as-mood-t" style={{ ['--f' as any]: `${f}%` }}><span className="as-mood-thumb" style={{ left: `calc(${f}% - 11px)` }} />
                    <input type="range" min={c.min} max={c.max} step={c.step} value={v} disabled={!ok('mood')} aria-label="Mood" aria-valuetext={v < -0.33 ? 'Angry' : v > 0.33 ? 'Happy' : 'Neutral'} data-testid="as-mood" onChange={e => setFv(x => ({ ...x, mood: Number(e.target.value) }))} /></div>; })()}
                <div className="as-mood-k"><span>Angry</span><span>Neutral</span><span>Happy</span></div></div>
              <FieldIssue issues={issues} field="mood" />
              <div className="as-tiles">{(['speed', 'pitch', 'volume'] as const).map(k => { const c = vcDef[k] ?? {}; const v = Number(fv[k] ?? c.default); const lbl = k === 'speed' ? `${v.toFixed(Math.round(v * 100) % 10 ? 2 : 1)}x` : k === 'pitch' ? `${v > 0 ? '+' : ''}${v}` : `${v}%`;
                return <div key={k} className="as-tile-w"><button ref={el => { btns.current[k] = el; }} type="button" className={`as-tile ${vOpen === k ? 'on' : ''}`} data-testid={`as-${k}`} disabled={!ok(k)} title={ok(k) ? (via(k) === 'post' ? 'Applied after generation' : undefined) : `This model has no ${k} control`} aria-expanded={vOpen === k} onClick={() => setVOpen(vOpen === k ? '' : k)}><span>{k[0].toUpperCase() + k.slice(1)}</span><b>{ok(k) ? lbl : '—'}</b><i aria-hidden>›</i></button>
                  <BarPopover open={vOpen === k} anchor={anc(k)} onClose={close} label={k[0].toUpperCase() + k.slice(1)} testId={`as-${k}-menu`} width={260}><PopSection label={k[0].toUpperCase() + k.slice(1)} aside={<span className="bp-mono">{lbl}</span>} className="as-tile-pop2"><input type="range" min={c.min} max={c.max} step={c.step} value={v} aria-label={k} onChange={e => setFv(x => ({ ...x, [k]: Number(e.target.value) }))} />
                    <div className="as-tp-k"><span>{c.min}{c.unit === '%' ? '%' : k === 'speed' ? 'x' : ''}</span><button type="button" onClick={() => setFv(x => ({ ...x, [k]: c.default }))}>Default</button><span>{c.max}{c.unit === '%' ? '%' : k === 'speed' ? 'x' : ''}</span></div></PopSection></BarPopover></div>; })}</div>
              {(['speed', 'pitch', 'volume'] as const).map(k => <FieldIssue key={k} issues={issues} field={k} />)}
              {!videoOut && fmts.length > 0 && <div className="as-selwrap"><button ref={el => { btns.current.fmt = el; }} type="button" className={`as-row ${vOpen === 'fmt' ? 'on' : ''}`} aria-haspopup="listbox" data-testid="as-format" disabled={!ok('outputFormat')} aria-expanded={vOpen === 'fmt'} onClick={() => setVOpen(vOpen === 'fmt' ? '' : 'fmt')}><span>Output format</span><b>{fmt.toUpperCase()}</b><i aria-hidden>›</i></button>
                <BarPopover open={vOpen === 'fmt'} anchor={anc('fmt')} onClose={close} label="Output format" role="listbox" testId="as-format-menu" width={220}><PopSection label="Output format"><PopList label="Output format">{fmts.map(o => <PopRow key={o} selected={o === fmt} testId={`as-format-${o}`} title={o === 'mp3' ? 'Smallest, plays everywhere' : o === 'wav' ? 'Uncompressed, for editing' : 'Saved as .ogg · 8/16/24/48 kHz'} label={o.toUpperCase()} hint={o === 'mp3' ? 'Smallest' : o === 'wav' ? 'For editing' : '.ogg'} onClick={() => { setFv(x => ({ ...x, outputFormat: o })); close(); }} />)}</PopList></PopSection></BarPopover></div>}
              <FieldIssue issues={issues} field="outputFormat" />
              <div className="as-selwrap"><button ref={el => { btns.current.rate = el; }} type="button" className={`as-row ${vOpen === 'rate' ? 'on' : ''}`} aria-haspopup="listbox" data-testid="as-rate" disabled={!ok('sampleRate')} aria-expanded={vOpen === 'rate'} onClick={() => setVOpen(vOpen === 'rate' ? '' : 'rate')}><span>Sample rate</span><b>{fv.sampleRate === undefined && videoOut ? 'Original' : `${Number(fv.sampleRate ?? 24000) / 1000} kHz`}</b><i aria-hidden>›</i></button>
                <BarPopover open={vOpen === 'rate'} anchor={anc('rate')} onClose={close} label="Sample rate" role="listbox" testId="as-rate-menu" width={220}><PopSection label="Sample rate"><PopList label="Sample rate">{videoOut && <PopRow selected={fv.sampleRate === undefined} testId="as-rate-original" title="Keep the video’s own rate" label="Original" onClick={() => { setFv(x => { const n2 = { ...x }; delete n2.sampleRate; return n2; }); close(); }} />}{rates.map(r => <PopRow key={r} selected={Number(fv.sampleRate) === r} testId={`as-rate-${r}`} title={RATE_HINT[r] ?? undefined} label={`${r / 1000} kHz`} onClick={() => { setFv(x => ({ ...x, sampleRate: r })); close(); }} />)}</PopList></PopSection></BarPopover></div>
              <FieldIssue issues={issues} field="sampleRate" />
              
            </>}
            {videoOut && ctrlMode && caps && <p className="as-note" data-testid="as-format-video">The result is a video, so the audio is muxed into it; output format doesn’t apply.</p>}
  </>;
}
