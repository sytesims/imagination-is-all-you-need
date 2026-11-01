import { fileFits, IMAGE_ACCEPT, AUDIO_ACCEPT, VIDEO_ACCEPT } from '../../../../server/src/shared/mediaAccept';
import { registerMedia } from '../../shared/mediaPause';
import { Notice } from '../../shared/Notice';
import { Stepper } from '../../shared/SettingChip';
import { useGenState, GenHint } from '../edge/Edge';
import { nudgeMissing } from '../../shared/genNudge';
import { KeyNeeded } from '../../shared/KeyNeeded';
import { GenPrice } from '../../shared/GenPrice';
import { DemoPrice } from '../../shared/DemoPrice';
import { CostNote } from '../../shared/CostNote';
import { FitNote } from '../../shared/FitNote';
import { SetupGenerate, SetupStatus, setupNeeded } from '../../shared/SetupCard';
import { useDownloadIntent } from '../../shared/hardware';
import { isFit, quoteFitOf } from '../../shared/fit';
import { BarPopover, PopSection, PopList, PopRow } from '../../shared/BarPop';
import { ModelMenu, type MenuItem } from '../../shared/ModelMenu';
import { isOpenWeights } from '../../shared/OpenWeights';
import { RouteNotRunnable } from '../../shared/RouteNotRunnable';
import { useRequoteTick, shownCredits } from '../../shared/quote';
import { readQuote, unpricedReason, demoMessage, demoList, unpricedPrefix, unpricedTitle, demoTagOf } from '../../shared/quote';
import { quoteParams } from '../../shared/usePrefill';
import { SeparationNote } from './SeparationNote';
/** Voice / Audio (page 5): left panel + main area.
 *  Copy, media, models and prices are ours. Controls exist only where the voice tool accepts the parameter;
 *  other controls follow the tool's published input definitions. */
import { JobRowFor } from '../../shared/GenTile';
import { FailIcon, FailTitle } from '../../shared/FailureState';
import { useEffect, useRef, useState } from 'react';
import type { JobState, ToolInfo } from '../../api';
import type { VideoMeta } from '../../shared/UploadVideo';
import { readVideo } from '../../shared/UploadVideo';
import { exampleFor } from '../examples';
import { FieldIssue } from '../IssueList';
import { VoiceControls, useVoiceControls, voiceCtl, CTRL, MODEL_VOICE_KEYS, modelVoicesOf, realSampleOf } from './VoiceControls';
import MetaTagChips, { MetaTag, metaTagsFor } from '../next/MetaTags';
import { DemoText } from '../../shared/DemoText';
import { SamplePlay, sampleKindOf, sampleLabel, type SampleKind } from '../../tools/app/ChangeVoice';
import { missingText, singleMissing } from '../../shared/missing';
import { RunOnField } from '../routing/RunOn';
import { useToolModels, modelOfEngine, shownName } from '../../shared/models';
import { TRANSLATE_DOC } from '../../shared/brand';
import { VideoThumb } from '../../shared/VideoThumb';

type R = { file: File; url: string };
export interface AudioStudioProps {
  tool: ToolInfo; mode: string; setMode: (m: string) => void; provider: string; setProvider: (p: string) => void;
  prompt: string; setPrompt: (s: string) => void; promptRef: React.RefObject<HTMLTextAreaElement>;
  fieldVals: Record<string, any>; setFieldVals: (f: (v: Record<string, any>) => Record<string, any>) => void; fieldDefaults: Record<string, any>;
  video: VideoMeta | null; setVideo: (v: VideoMeta | null) => void; /** B27: Change the voice on an audio clip instead of a video (audio comes back) */ clip?: File | null; setClip?: (f: File | null) => void; samples: File[]; setSamples: (f: File[]) => void;
  portrait: R | null; setPortrait: (r: R | null) => void; speech: File | null; setSpeech: (f: File | null) => void;
  busy: boolean; issues: any[]; /** B18: why the target language changed (the new model doesn't voice the old one). */ langNote?: string; /** B18: target languages the picked model voices (per-provider list, nativeName labels). */ langOpts?: { value: string; label?: string }[];
  onGenerate: () => void; jobs: JobState[]; stage: React.ReactNode; onSelect: (id: string) => void; selected?: string;
  /** One Video page: Lip Sync runs here as a Video workflow; the Video workflow chip replaces the voice-mode tabs (Audio pages unchanged). */ workflowChip?: React.ReactNode;
}
const TABS: [string, string][] = [['voiceover', 'Text to Speech'], ['change-voice', 'Voice Change'], ['translate', 'Translate'], ['lipsync', 'Lip Sync']];
const HERO: Record<string, [string, string]> = {
  voiceover: ['Give your words a voice', 'Type a script, pick a voice, hear it in seconds. Free on your computer, or use your own keys.'],
  'change-voice': ['Give your clip a different voice', 'Upload a clip; the timing and lip movement stay, only the speaker changes.'],
  translate: ['Say it in another language', 'Transcribe, translate and re-voice a clip, with the timing kept close to the original.'],
  lipsync: ['Make a photo talk', 'One portrait plus a speech clip becomes a lip-synced video.'],
};
const CARDS: Record<string, [string, string, string][]> = {
  voiceover: [['Pick or clone a voice', 'Six built-in voices, or upload a short sample to clone.', 'heroine'], ['Write it, then generate', 'Type the script, set takes, and get up to four versions.', 'city']],
  'change-voice': [['Upload a clip', 'Any video with clear speech, 4–30 seconds.', 'giant'], ['Pick the new voice', 'The new voice follows the original performance.', 'soar']],
  translate: [['Upload a clip', 'A video with one main speaker works best.', 'dunes'], ['Pick the language', 'Choose a language the model can voice; the original audio is replaced or ducked.', 'burrow']],
  lipsync: [['Add a portrait', 'A clear, front-facing photo.', 'heroine'], ['Add speech audio', 'WAV, MP3 or M4A, 2–15 seconds.', 'flutter']],
};
const SAVE_KEY = 'oj.audio.settings.v1';

export default function AudioStudio(p: AudioStudioProps) {
  const cfg: any = p.tool.app; const fields: any[] = cfg.fields ?? [];
  const fOpts = (n: string) => (n === 'language' && p.langOpts ? p.langOpts.map(o => ({ value: o.value, label: o.label ?? o.value })) : (fields.find(f => f.name === n)?.options ?? [])) as { value: string; label: string }[];
  const nOpts: number[] = ((p.tool as any).inputs?.find((i: any) => i.name === 'n')?.options ?? ['1']).map(Number);
  const nMax = Math.max(...nOpts); const n = Number(p.fieldVals.n ?? 1);
  const [models, setModels] = useState<any[]>([]);
  useEffect(() => { fetch(`/api/models?toolId=${encodeURIComponent(p.tool.id)}`).then(r => r.ok ? r.json() : null).then(d => setModels(d?.groups?.find((g: any) => g.toolId === p.tool.id)?.models ?? [])).catch(() => 0); }, [p.tool.id]);
  const inMode = (id: string) => !cfg.providerModes?.[id] || cfg.providerModes[id].includes(p.mode);
  const provs = p.tool.providers.filter(x => inMode(x.id)); const cur = provs.find(x => x.id === p.provider) ?? provs[0];
  const mOf = (id: string) => models.find(m => m.id === id);
  const cvClip = p.mode === 'change-voice' && !!p.setClip; const videoOut = (p.mode === 'change-voice' && !p.clip) || p.mode === 'translate' || p.mode === 'lipsync' || (p.mode === 'voiceover' && !!p.video);
  const { vcDef, caps, ctrlMode, ok, defs } = voiceCtl(p.tool, p.provider, p.mode, p.fieldVals);
  const maxS: number = p.mode === 'voiceover' ? (caps?.maxVoiceSamples ?? vcDef.voiceAudio?.maxFiles ?? 1) : 0;
  // send only controls the picked model takes; fill defaults for the rest
  useVoiceControls(p.tool, p.provider, p.mode, p.fieldVals, p.setFieldVals, videoOut);
  useEffect(() => { if (p.samples.length > maxS) p.setSamples(p.samples.slice(0, maxS)); }, [maxS]);
  // quote (= charge); scales with batch size
  const [q, setQ] = useState<any>(null);
  useToolModels(p.tool.id); const tm = modelOfEngine(p.tool.id, cur?.id); const dlIntent = useDownloadIntent(p.provider);
  const chars = p.prompt.length;
  const rqTick = useRequoteTick(); useEffect(() => { const u = new URLSearchParams({ ...quoteParams(), provider: p.provider, types: p.mode, n: String(n), chars: String(chars) }); const ac = new AbortController();
    const t = setTimeout(() => fetch(`/api/tools/${p.tool.id}/price?${u}`, { signal: ac.signal }).then(readQuote).then(setQ).catch(() => 0), 350); return () => { clearTimeout(t); ac.abort(); }; }, [rqTick, p.provider, p.mode, n, chars]);
  /* B19 (item 5): a quote 400 invalid_language / unsupported_language sits at the language field, not as 'Price unavailable'. Generate stays off. */
  const qLang: any = /^(invalid|unsupported)_language$/.test(String(q?.code ?? '')) ? ((Array.isArray(q?.issues) ? q.issues : []).find((i: any) => i?.field === 'language') ?? { code: q.code, field: 'language', message: String(q.error ?? '') }) : null;
  const langIss: any[] = qLang && !p.issues.some((i: any) => i?.field === 'language') ? [...p.issues, qLang] : p.issues;
  const unpricedWhy = unpricedReason(q); const unpriced = !!unpricedWhy; const gq = useGenState(); const qFull = gq.full; /* D1: a full queue blocks Generate */ const credits: number | null = shownCredits(q); /* B18: chargeable:false is never a charge */
  const free = credits === 0 && q?.routeKind === 'local'; const gate = !!q && q.needsKey === true && q.runnable === false; const needSetup = setupNeeded(tm, q, cur?.id, dlIntent); /* Generate becomes the setup step */
  const [tab, setTab] = useState<'history' | 'how'>(p.jobs.length ? 'history' : 'how'); useEffect(() => { if (p.jobs.length) setTab('history'); }, [p.jobs.length]);
  /* The shared slim model menu (ModelMenu) beside the panel; Escape, outside click and focus back to the Model button come with the Popover */
  const [mOpen, setMOpen] = useState(false); const mBtn = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLElement>(null);
  const menuItems: MenuItem[] = provs.map(x => { const m = mOf(x.id); const name = m?.name ?? x.name; return { id: x.id, name, family: m?.family ?? (x as any).family ?? undefined, badge: (m?.badges ?? []).includes('new') ? 'New' : undefined, open: x.kind === 'open-weights' || isOpenWeights(x, m), p: { ...m, ...x, routes: (x as any).routes ?? m?.routes } }; });
  const [adv, setAdv] = useState(false); const [vOpen, setVOpen] = useState('');
  const [save, setSave] = useState(() => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } });
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); if (s?.fields) p.setFieldVals(v => ({ ...v, ...s.fields })); } catch { /* none */ } }, []);
  useEffect(() => { try { if (save) localStorage.setItem(SAVE_KEY, JSON.stringify({ fields: Object.fromEntries(['voice', 'language', 'mix', 'n', ...CTRL, ...MODEL_VOICE_KEYS].filter(k => p.fieldVals[k] !== undefined).map(k => [k, p.fieldVals[k]])) })); else localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ } }, [save, JSON.stringify(p.fieldVals)]);
  const reset = () => p.setFieldVals(v => ({ ...(videoOut ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'sampleRate')) : v), ...Object.fromEntries(Object.entries(defs()).filter(([k]) => ok(k) && !(videoOut && (k === 'sampleRate' || k === 'outputFormat')))), voice: p.fieldDefaults.voice, language: p.fieldDefaults.language, mix: p.fieldDefaults.mix }));
  const upIn = useRef<HTMLInputElement>(null); const spIn = useRef<HTMLInputElement>(null); const [upErr, setUpErr] = useState(''); const [drop, setDrop] = useState(false);
  const takeFiles = async (fs: File[]) => { setUpErr(''); const f = fs[0]; if (!f) return; if (f.size > 200 * 1024 * 1024) { setUpErr(`${f.name} is too large. Files can be up to 200 MB.`); return; }
    if (p.mode === 'lipsync') { if (fileFits('image', f)) p.setPortrait({ file: f, url: URL.createObjectURL(f) }); else if (fileFits('audio', f)) p.setSpeech(f); else setUpErr('Use a PNG, JPG or WebP portrait, or an MP3, WAV, M4A, AAC, OGG or FLAC sound.'); return; }
    if (p.mode === 'voiceover' && fileFits('audio', f) && maxS === 0) { setUpErr('This model uses its own voices, so it can’t clone a sample.'); return; }
    if (p.mode === 'voiceover' && fileFits('audio', f)) { const add = fs.filter(x => fileFits('audio', x)); const next = [...p.samples, ...add].slice(0, maxS); if (p.samples.length + add.length > maxS) setUpErr(`Up to ${maxS} voice samples.`); p.setSamples(next); p.setFieldVals(v => ({ ...v, voice: 'clone' })); return; }
    if (cvClip && fileFits('audio', f)) { p.setVideo(null); p.setClip!(f); return; }
    if (fileFits('video', f)) { p.setClip?.(null); try { const m = await readVideo(f); p.setVideo({ ...m, trimmed: m.duration > 30 }); } catch { setUpErr('Couldn’t read that video.'); } return; }
    setUpErr(p.mode === 'voiceover' ? 'Use an audio sample (to clone a voice) or a video (to voice over).' : cvClip ? 'Use a video or an audio clip with speech.' : 'Use a video with speech.'); };
  const hasUp = !!(p.video || p.samples.length || p.portrait || p.speech || (cvClip && p.clip));
  const missing = [p.mode === 'voiceover' && !p.prompt.trim() && 'a script', p.mode !== 'lipsync' && !(cfg.videoOptionalModes ?? []).includes(p.mode) && !p.video && !(cvClip && p.clip) && (cvClip ? 'a video or an audio clip' : 'a video'), p.mode === 'lipsync' && !p.portrait && 'a portrait', p.mode === 'lipsync' && !p.speech && 'speech audio'].filter(Boolean) as string[];
  const mt = metaTagsFor(cfg, p.provider); const metaTags: MetaTag[] = mt.tags; /* per model: Drama 3, ElevenLabs v3, MiniMax Speech */
  const [h1, sub] = HERO[p.mode] ?? HERO.voiceover;
  const showVoice = p.mode !== 'lipsync'; const showLang = p.mode === 'translate'; const showMix = (p.mode === 'change-voice' || p.mode === 'translate') || (p.mode === 'voiceover' && !!p.video);
  const [apiVoices, setApiVoices] = useState<{ id: string; label: string; previewUrl?: string; sampleUrl?: string | null; sampleKind?: string; sampleIsStandIn?: boolean }[] | null>(null);
  useEffect(() => { fetch('/api/voices').then(r => r.ok ? r.json() : null).then(d => { if (d?.voices?.length) setApiVoices(d.voices); }).catch(() => {}); }, []);
  const playing = useRef<HTMLAudioElement | null>(null);
  const preview = (url?: string) => { if (!url) return; playing.current?.pause(); const a = new Audio(url); registerMedia(a); playing.current = a; a.play().catch(() => {}); };
  const mv = ctrlMode ? modelVoicesOf(caps) : null; /* Qwen3 TTS: its own 9 voices (field speaker), each with its native language */
  const optsFor = (name: string): { value: string; label: string; previewUrl?: string; kind?: SampleKind }[] => name === 'speaker' ? (mv?.voices ?? []).map(v => ({ value: v.id, label: v.hint ? `${v.label} · ${v.hint}` : v.label, previewUrl: v.sampleUrl })) : name === 'voice' && apiVoices ? [...apiVoices.map(v => ({ value: v.id, label: v.label, previewUrl: realSampleOf(v), kind: sampleKindOf(v) }) /* ▶ only for a real recording of the voice (2026-10-27): a stand-in tone gets no button */), ...fOpts('voice').filter(o => o.value === 'clone')] : fOpts(name) as { value: string; label: string; previewUrl?: string }[];
  const sel = (name: string, label: string, testid: string) => { const opts = optsFor(name).filter(o => !(name === 'voice' && o.value === 'clone' && maxS === 0)); const v = String(p.fieldVals[name] ?? (name === 'speaker' ? mv?.def ?? '' : ''));
    return <PopSelect key={name} label={label} testid={testid} open={vOpen === name} setOpen={o => setVOpen(o ? name : '')} value={v} current={opts.find(o => o.value === v)?.label ?? v}
      opts={opts.map(o => ({ value: o.value, label: o.label, extra: o.previewUrl ? <span role="button" tabIndex={0} className="as-vplay" data-testid={`voice-preview-${o.value}`} aria-label={(o as any).kind === 'standin' ? `${o.label}: ${sampleLabel('standin')}` : `Preview ${o.label}`} title={(o as any).kind === 'standin' ? sampleLabel('standin') : undefined} data-kind={(o as any).kind ?? undefined} onClick={e => { e.stopPropagation(); preview(o.previewUrl); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); preview(o.previewUrl); } }}>▶</span> : null }))}
      onPick={val => p.setFieldVals(f => ({ ...f, [name]: val }))} />; };

  return <div className="as" data-testid="audio-studio">
    <aside ref={panel} className="as-panel" aria-label="Voice settings">
      {p.workflowChip ?? <nav className="as-tabs" role="tablist" aria-label="Voice tools">{TABS.filter(([id]) => (p.tool.presets ?? []).some(x => x.id === id)).map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={p.mode === id} className={p.mode === id ? 'on' : ''} data-testid={`as-tab-${id}`} onClick={() => { p.setMode(id); setMOpen(false); }}>{l}</button>)}</nav>}
      <div className="as-form">
        <div className={`as-upload ${drop ? 'drop' : ''}`} data-testid="as-upload" onDragOver={e => { e.preventDefault(); setDrop(true); }} onDragLeave={() => setDrop(false)} onDrop={e => { e.preventDefault(); setDrop(false); takeFiles([...e.dataTransfer.files]); }}>
          {!hasUp ? <button type="button" className="as-up-hit" onClick={() => upIn.current?.click()}>{p.mode === 'voiceover' && <span className="as-opt">Optional</span>}
            <span className="as-up-ics" aria-hidden>{(p.mode === 'voiceover' ? ['♪', '▶'] : p.mode === 'lipsync' ? ['☺', '♪'] : ['▶']).map(c => <i key={c}>{c}</i>)}</span>
            <b>{p.mode === 'voiceover' ? 'Add voice samples or a video' : p.mode === 'lipsync' ? 'Upload a portrait and speech' : 'Upload a video'}</b>
            <small>{p.mode === 'voiceover' ? maxS ? `Up to ${maxS} voice sample${maxS > 1 ? 's' : ''} to clone, or a video to voice over` : 'A video to voice over · this model uses its own voices' : p.mode === 'lipsync' ? 'PNG/JPG photo · WAV, MP3 or M4A 2–15 s' : cvClip ? 'MP4 or MOV with speech · 4–30 s, or WAV, MP3 or M4A (you get audio back)' : 'MP4 or MOV with speech · 4–30 s'}</small></button>
            : <div className="as-up-list">
              {p.video && <div className="as-file"><VideoThumb src={p.video.url} /><span>{p.video.file.name}<small>{Math.round(p.video.duration)} s{p.video.trimmed ? ' · first 30 s used' : ''}</small></span><button type="button" aria-label="Remove video" onClick={() => p.setVideo(null)}>✕</button></div>}
              {cvClip && p.clip && <div className="as-file" data-testid="as-clip"><i aria-hidden>♪</i><span>{p.clip.name}<small>Audio clip · audio comes back</small></span><button type="button" aria-label="Remove audio clip" onClick={() => p.setClip!(null)}>✕</button></div>}
              {p.samples.length > 0 && <div className="as-samples" data-testid="as-samples"><div className="as-samples-h"><span>Voice samples to clone</span><b data-testid="as-sample-count">{p.samples.length}/{maxS}</b></div>
                <div className="as-sthumbs">{p.samples.map((f, i) => <div key={i + f.name} className="as-sthumb" data-testid={`as-sample-${i}`} title={f.name}><i aria-hidden>♪</i><span>{f.name}</span><button type="button" aria-label={`Remove ${f.name}`} data-testid={`as-sample-remove-${i}`} onClick={() => { const next = p.samples.filter((_, j) => j !== i); p.setSamples(next); if (!next.length && p.fieldVals.voice === 'clone') p.setFieldVals(v => ({ ...v, voice: p.fieldDefaults.voice })); }}>✕</button></div>)}</div>
                </div>}
              {p.portrait && <div className="as-file"><img src={p.portrait.url} alt="" /><span>{p.portrait.file.name}<small>Portrait</small></span><button type="button" aria-label="Remove portrait" onClick={() => p.setPortrait(null)}>✕</button></div>}
              {p.speech && <div className="as-file"><i aria-hidden>♪</i><span>{p.speech.name}<small>Speech</small></span><button type="button" aria-label="Remove speech" onClick={() => p.setSpeech(null)}>✕</button></div>}
              {((p.mode === 'voiceover' && (!p.video || p.samples.length < maxS)) || (p.mode === 'lipsync' && !(p.portrait && p.speech))) && <button type="button" className="as-add" onClick={() => upIn.current?.click()}>+ Add {p.mode === 'lipsync' ? (p.portrait ? 'speech audio' : 'a portrait') : p.samples.length ? (p.samples.length < maxS ? 'another voice sample' : 'a video') : p.video ? 'a voice sample' : 'a sample or video'}</button>}
            </div>}
          <input ref={upIn} type="file" hidden multiple={p.mode === 'voiceover'} data-picker-title={p.mode === 'voiceover' ? (maxS ? 'Choose a video or voice samples' : 'Choose a video') : p.mode === 'lipsync' ? 'Choose a portrait or the speech' : 'Choose a clip'} data-picker-limits={p.mode === 'voiceover' && maxS ? `One video · up to ${maxS} voice sample${maxS > 1 ? 's' : ''}` : undefined} data-testid="as-upload-input" accept={p.mode === 'voiceover' ? (maxS ? `${AUDIO_ACCEPT},${VIDEO_ACCEPT}` : VIDEO_ACCEPT) : p.mode === 'lipsync' ? `${IMAGE_ACCEPT},${AUDIO_ACCEPT}` : cvClip ? `${VIDEO_ACCEPT},${AUDIO_ACCEPT}` : VIDEO_ACCEPT} onChange={e => { const f = e.target.files; if (f?.length) takeFiles([...f]); e.currentTarget.value = ''; }} />
          <input ref={spIn} type="file" hidden accept={AUDIO_ACCEPT} data-picker-title="Choose the speech" data-picker-limits="One sound · MP3, WAV or M4A" data-testid="lipsync-speech-input" onChange={e => { const f = e.target.files?.[0]; if (f) p.setSpeech(f); e.currentTarget.value = ''; }} />
        </div>
        {p.mode === 'translate' && <p className="as-note as-tr" role="note" data-testid="as-translate-note">Translate runs on your computer: Whisper writes down the speech line by line, NLLB translates it, and Chatterbox or F5-TTS says it in the new voice, each line at its original moment. Add the separation model to keep the background music. <a href={TRANSLATE_DOC} target="_blank" rel="noopener noreferrer">How it works ↗</a></p>}
        {(p.mode === 'translate' || p.mode === 'change-voice') && <SeparationNote />}
        {upErr && <Notice as="p" kind="error" tone="line" className="as-err">{upErr}</Notice>}<FieldIssue issues={p.issues} field="video" /><FieldIssue issues={p.issues} field="voiceAudio" />{showLang && <FieldIssue issues={langIss} field="language" />}{showLang && p.langNote && <p className="helper lang-note" role="status" data-testid="lang-note">{p.langNote}</p>}
        <div className="as-script"><label htmlFor="app-prompt">{p.mode === 'voiceover' ? 'Script' : 'Notes'}{p.mode !== 'voiceover' && <span className="as-opt">Optional</span>}</label>
          <textarea data-enter-submits="" ref={p.promptRef} id="app-prompt" data-testid="as-script" maxLength={p.mode === 'voiceover' && Number(caps?.maxChars) > 0 ? Number(caps.maxChars) : 5000} placeholder={p.mode === 'voiceover' ? 'Write exactly what the voice will read out loud.' : 'Anything to keep in mind, e.g. keep the pauses.'} value={p.prompt} onChange={e => p.setPrompt(e.target.value)} />
          {metaTags.length > 0 && <MetaTagChips style={mt.style} tags={metaTags} target={() => p.promptRef.current} value={p.prompt} onChange={p.setPrompt} provider={p.provider} />}
          <span className="as-count">{p.prompt.length}/{p.mode === 'voiceover' && Number(caps?.maxChars) > 0 ? Number(caps.maxChars) : 5000}</span><FieldIssue issues={p.issues} field="prompt" /></div>
        <button ref={mBtn} type="button" className="as-model" data-testid="as-model" aria-haspopup="listbox" aria-expanded={mOpen} onClick={() => setMOpen(o => !o)}><span className="as-cap">Model</span><b>{(tm ? shownName(tm) : null) ?? (cur && mOf(cur.id)?.name) ?? cur?.name ?? 'No model for this mode'}</b><i aria-hidden>›</i></button>
        <div className="as-runon"><RunOnField toolId={p.tool.id} model={tm} engine={cur?.id} quote={q} testId="as-run-on" avoid={panel} /></div>
        <Stepper icon="layers" label="Versions" unit="version" value={n} max={nMax} onChange={v => p.setFieldVals(fv => ({ ...fv, n: String(v) }))} testId="as-batch" className="as-batch" title={`Up to ${nMax} versions`} />
        {ctrlMode && caps?.controls?.voiceDetails?.via !== 'native' && <div className="as-vd off" title="This model takes no voice description"><label htmlFor="as-vd">Voice details <span className="as-opt">Not available yet</span></label>
          <textarea id="as-vd" data-testid="as-voice-details" disabled maxLength={vcDef.voiceDetails?.maxLength ?? 500} placeholder="e.g. warm, low voice, slow and calm" value="" readOnly /><span className="as-count">0/{vcDef.voiceDetails?.maxLength ?? 500}</span></div>}
        {<section className={`as-adv ${adv ? 'open' : ''}`}>
          <button type="button" className="as-adv-h" data-testid="as-advanced" aria-expanded={adv} onClick={() => setAdv(!adv)}><span aria-hidden>⚙</span>Advanced settings<i aria-hidden>⌄</i></button>
          {adv && <div className="as-adv-b" data-testid="as-advanced-body">
            <div className="as-adv-top"><span title={caps?.note}>{(cur && mOf(cur.id)?.name) ?? cur?.name ?? 'Voice'} settings</span><button type="button" className="as-reset" data-testid="as-reset" onClick={reset}>↺ Reset</button></div>
            {showVoice && sel(mv ? 'speaker' : 'voice', 'Voice', 'as-voice')}{showVoice && !mv && (() => { const vid = String(p.fieldVals.voice ?? '') || String(((p.tool.inputs ?? []) as any[]).find(i => i.name === 'voice')?.default ?? ''); const sv = apiVoices?.find(x => x.id === vid) ?? null; return sv?.sampleUrl ? <div className="as-sample" data-testid="as-voice-sample"><SamplePlay key={sv.id} url={sv.sampleUrl} kind={sampleKindOf(sv)} /></div> : null; })()}
            {showLang && sel('language', 'Target language', 'as-language')}
            {showMix && sel('mix', 'Original audio', 'as-mix')}
            <VoiceControls tool={p.tool} provider={p.provider} mode={p.mode} fv={p.fieldVals} setFv={p.setFieldVals} issues={p.issues} videoOut={videoOut} />
            <label className="as-row as-save"><span>Save settings</span><input type="checkbox" role="switch" data-testid="as-save" checked={save} onChange={e => setSave(e.target.checked)} /></label>
          </div>}
        </section>}
      </div>
      <RouteNotRunnable issues={p.issues} /><div className="as-gen-wrap">
        {needSetup ? <SetupGenerate toolId={p.tool.id} model={tm} engine={cur?.id} quote={q} className="vs-gen gen-btn as-gen" testId="as-generate" />
          : gate ? <button type="button" className="vs-gen gen-btn as-gen" data-testid="as-generate" disabled title="Needs a provider key"><span className="gen-l">Generate</span><GenPrice /></button>
          : <button type="button" className={`vs-gen gen-btn as-gen${!p.busy && !unpriced && missing.length ? ' gen-wait' : ''}`} data-testid="as-generate" disabled={p.busy || unpriced || qFull} aria-disabled={missing.length > 0 || undefined} title={qFull ? gq.block : missing.length ? (missing.every(m => /^Add /.test(m)) ? missing.join(' ') : missingText(missing)) : unpricedWhy ? `${unpricedPrefix(q)}${unpricedWhy}` : undefined} onClick={e => { if (missing.length) { nudgeMissing(e.currentTarget); return; } p.onGenerate(); }}><span className="gen-l">{p.busy ? <i className="as-spin" aria-hidden /> : null}Generate</span>
            <GenPrice testId="as-price" q={q} demo={!unpriced && credits != null && q?.demo === true} free={!unpriced && credits != null && free} credits={!unpriced ? credits : null} /></button>}
        <SetupStatus model={tm} engine={cur?.id} quote={q} className="as-setup-status" />{gate && !needSetup && <KeyNeeded q={q} className="vs-key" toolId={p.tool.id} />}{!gate && <GenHint />}{isFit(q?.fit) && <FitNote fit={quoteFitOf(q)} onUseCloud={id => { if (provs.some(x => x.id === id)) p.setProvider(id); }} className="as-fit" />}{missing.length > 0 && !gate && <p className="sr-only" data-testid="as-missing">{missing.every(m => /^Add /.test(m)) ? missing.join(' ') : singleMissing(missing) ?? `Missing: ${missing.filter(m => !/^Add /.test(m)).join(', ')}${missing.some(m => /^Add /.test(m)) ? ` · ${missing.filter(m => /^Add /.test(m)).join(' ')}` : ''}`}</p>}{unpriced && !gate && !(qLang && showLang) && <p className="vs-miss gen-block" role="status" data-testid="as-price-block">{unpricedPrefix(q)}{unpricedWhy}</p>}{!gate && <CostNote q={q} className="vs-demo" />}
      </div>
    </aside>

    <section className="as-main" aria-label="Voice results">
      <div className="vs-mtabs" role="tablist"><button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History{p.jobs.length ? <em>{p.jobs.length}</em> : null}</button><button type="button" role="tab" aria-selected={tab === 'how'} className={tab === 'how' ? 'on' : ''} onClick={() => setTab('how')}>How it works</button></div>
      {tab === 'how' || !p.jobs.length ? <div className="as-empty" data-testid="as-empty">
        <h1>{h1}</h1><p>{sub}</p>
        <div className="as-cards">{(CARDS[p.mode] ?? CARDS.voiceover).map(([t, d, art]) => { const e = exampleFor(art); return <div key={t} className="as-card"><h3>{t}</h3><p>{d}</p><div className="as-card-m"><video src={e.src} poster={e.poster} muted loop autoPlay playsInline aria-hidden /></div></div>; })}</div>
      </div>
        : <div className="as-hist" data-testid="as-history"><div className="vs-hist-stage">{p.stage}</div>
          <div className="as-hlist">{p.jobs.slice(0, 40).map(j => <button key={j.id} type="button" className={`as-hrow st-${j.status} ${p.selected === j.id ? 'on' : ''}`} onClick={() => p.onSelect(j.id)}>{j.status === 'queued' || j.status === 'running' ? <JobRowFor job={j} /> : <><span className="as-hic" aria-hidden>{j.status === 'done' ? '♪' : j.status === 'failed' ? <FailIcon job={j} size={30} /> : j.status === 'canceled' ? '⦸' : <i className="as-spin" />}</span><span className="as-htxt"><b>{(j as any).input?.prompt || TABS.find(t => t[0] === ((j as any).input?.types?.[0]))?.[1] || 'Voice'}</b><small>{j.status === 'done' ? 'Ready' : j.status === 'failed' ? <FailTitle job={j} /> : j.status === 'canceled' ? 'Canceled' : 'Rendering'}</small></span></>}</button>)}</div></div>}
    </section>

    <ModelMenu open={mOpen} anchor={mBtn} avoid={panel} onClose={() => setMOpen(false)} items={menuItems} value={p.provider} onPick={id => p.setProvider(id)} testId="as-model-list" rowTestId={id => `as-model-${id}`} toolId={p.tool.id} quote={q} />
  </div>;
}

/** A small option popover (voice, language, original audio): the shared Popover surface, one row per option, the picked one in orange. */
function PopSelect({ label, testid, open, setOpen, value, current, opts, onPick }: { label: string; testid: string; open: boolean; setOpen: (o: boolean) => void; value: string; current: string; opts: { value: string; label: string; extra?: React.ReactNode }[]; onPick: (v: string) => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  if (opts.length === 1) return <div className="as-selwrap"><span className="as-row as-static" data-testid={testid} title={`The only ${label.toLowerCase()} this model offers`}><span>{label}</span><b>{current}</b></span></div>;
  return <div className="as-selwrap"><button ref={btn} type="button" className={`as-row ${open ? 'on' : ''}`} data-testid={testid} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}><span>{label}</span><b>{current}</b><i aria-hidden>›</i></button>
    <BarPopover open={open} anchor={btn} onClose={() => setOpen(false)} label={label} role="listbox" testId={`${testid}-menu`} width={260}><PopSection label={label}><PopList label={label}>{opts.map(o => <PopRow key={o.value} selected={o.value === value} icon={o.extra} label={o.label} onClick={() => { onPick(o.value); setOpen(false); }} />)}</PopList></PopSection></BarPopover></div>;
}
