import { AUDIO_ACCEPT, VIDEO_ACCEPT, fileFits } from '../../../../server/src/shared/mediaAccept';
import { prepUpload, useFilePreview } from '../../shared/SlotPreview';
/**
 * Shared Audio page: /audio?workflow=<id>. The feed fills the page; the Create bar is
 * docked at the bottom with Image's dock classes (ic ic2 > ic-dock > ic-frame > ic-panel > ic-main > ic-prow / ic-chiprow, ic-chip, ic-gen), the
 * same as Video. Row 1: the workflow's files (voice samples n/max, a clip, a song) then the prompt area (shared/PromptTabs: Style | Lyrics where
 * the model sings, with Instrumental where it can make one; "Script" for a voiceover; the bare prompt otherwise).
 * Row 2: workflow chip, +, model, length, takes, voice, language, Enhance (music and sound effects only, never a script), Settings (only what the
 * model takes), Run on and the peek. Generate is the shared DockGenerate (Image's and Video's: 120×80, the run's price token, dimmed with the first problem in a few words).
 * Every workflow runs on its own tool and mode (AppTool's state, quote rules and submit: the job contract is unchanged).
 */
import { RowMore } from '../../shared/RowMore';
import { registerMedia } from '../../shared/mediaPause';
import { SwitchNote, useSwitchNote } from '../../shared/SwitchNote';
import { metaTagsFor, insertTag, type MetaTag } from '../next/MetaTags';
import { useEffect, useRef, useState } from 'react';
import type { JobState, ToolInfo } from '../../api';
import type { VideoMeta } from '../../shared/UploadVideo';
import { readVideo } from '../../shared/UploadVideo';
import { planAudioIntake, type AudioPick } from './audioIntake';
import { LeftNote, notAddedText } from '../../shared/FilesTray';
import { firstWords } from '../../shared/missing';
import { TRANSLATE_DOC } from '../../shared/brand';
import { useDockHeight, useChipFit } from '../../shared/dockFit';
import { fitPri } from '../../shared/chipFit';
import { usePromptGrow } from '../../shared/usePromptGrow';
import { PreflightNotes, type PreflightNote } from '../../shared/PreflightNotes';
import { CloseIcon, SparkleIcon, MicIcon, TranslateIcon, MusicIcon, PlayIcon, AudioIcon, VideoIcon } from '../Icons';
import { PromptTabs, PromptField, PromptHelpers, PromptSwitch, type PromptTab, type HelperChip } from '../../shared/PromptTabs';
import { useInsertAtCursor } from '../../shared/useInsertAtCursor';
import { lyricsPlan, autoLength, lengthFor, recreateAudio, tooShortFor, lengthText, SECTION_TAG_HL } from '../../shared/lyricsLength';
import { EnhanceButton, enhanceToastTitle, type EnhanceResult } from '../next/Enhance';
import { PromptPeek, type PeekForm } from '../next/PromptPeek';
import { BrandChip } from '../../shared/BrandChip';
import { PF_SHORT, DockGenerate } from '../../shared/DockGenerate';
import type { PreflightProblem } from '../../../../server/src/shared/preflight';
import { preflightProblems, localOnlyGate, LOCAL_SETUP_TEXT } from '../../../../server/src/shared/preflight';
import { tip } from '../../shared/Tooltip';
import { MakerTile } from '../../shared/MakerTile';
import { setupNeeded, NoPlaceGenerate } from '../../shared/SetupCard';
import { useGenState, GenHint } from '../edge/Edge';
import { nudgeMissing } from '../../shared/genNudge';
import { ChipGlyph } from '../../shared/SettingChip';
import { priceTitle } from '../../shared/GenPrice';
import { useBilling } from '../../shared/billing';
import { RouteNotRunnable } from '../../shared/RouteNotRunnable';
import { useRequoteTick, shownCredits, runBlock, readQuote, unpricedReason, unpricedPrefix } from '../../shared/quote';
import { quoteParams } from '../../shared/usePrefill';
import { isOpenWeights, providerGroupOf, displayNameOf } from '../../shared/OpenWeights';
import { BarPopover, PopSection, PopList, PopRow, PopSwitch, PopAction, Segmented } from '../../shared/BarPop';
import { countWord } from '../../shared/barPopText';
import { ModelMenu, type MenuItem } from '../../shared/ModelMenu';
import { claimPlayback } from '../../shared/audioPlayer';
import { useToast } from '../../shared/Toast';
import { KeyNeeded, addKeyText, hasFreeLocal } from '../../shared/KeyNeeded';
import { FieldIssue } from '../IssueList';
import { RunOnChip, runOnText } from '../routing/RunOn';
import { useToolModels, modelOfEngine, useRunOn, shownName, type ToolModel } from '../../shared/models';
import { HOSTED_BY_ID } from '../../../../server/src/shared/hostedPrices';
import { etaRangeOf, rangeText } from '../../shared/eta';
import { VoiceControls, useVoiceControls, voiceCtl, CTRL, MODEL_VOICE_KEYS, modelVoicesOf, realSampleOf } from './VoiceControls';
import { takesVoicePick, voiceChoicesFor, shownVoiceFor } from '../../shared/voicePick';
import { AudioWorkflowChip, takeCarriedPrompt, useAudioRecipes, type AudioRecipe } from './AudioWorkflows';
import '../video/videoDock.css';
import '../next/workflowBar.css'; /* .wf-slot: the drop tile, as Image's and Video's */
import '../next/feed/feed.css'; /* .fd-empty: the feed's one quiet line */
import './audioPage.css';

export const SAVE_KEY = 'oj.audio.settings.v1';
const LYRICS_KEY = 'ohf:audio:lyrics';
const INST_KEY = 'ohf:audio:instrumental'; const AUTO_KEY = 'ohf:audio:lenAuto';
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
/* the Style tab's starters and the Lyrics tab's section tags (they insert at the caret: shared/useInsertAtCursor) */
const STARTERS = [['genre', 'Genre'], ['mood', 'Mood'], ['instruments', 'Instruments'], ['voice', 'Voice']] as const;
const SECTIONS = ['Verse', 'Chorus', 'Bridge', 'Outro'] as const;
const LinesIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M5 7h14M5 12h14M5 17h9" /></svg>;

export interface AudioPageProps {
  tool: ToolInfo; tools?: ToolInfo[]; wf: AudioRecipe;
  provider: string; setProvider: (p: string) => void;
  prompt: string; setPrompt: (s: string) => void; promptRef: React.RefObject<HTMLTextAreaElement>;
  duration: number; setDuration: (n: number) => void;
  fieldVals: Record<string, any>; setFieldVals: (f: (v: Record<string, any>) => Record<string, any>) => void; fieldDefaults: Record<string, any>;
  /** Target languages the picked model voices (per-provider list, nativeName labels) and why it changed. */ langOpts?: { value: string; label?: string }[]; langNote?: string;
  video: VideoMeta | null; setVideo: (v: VideoMeta | null) => void;
  clip: { file: File; sec?: number } | null; setClip: (c: { file: File; sec?: number } | null) => void;
  song: File | null; setSong: (f: File | null) => void;
  samples: File[]; setSamples: (f: File[]) => void;
  busy: boolean; issues: any[]; /** AppTool's file precheck ("checking your files", "usable files (…)") */ checks: string[];
  onGenerate: (extra: Record<string, string>) => void; jobs: JobState[];
  /** Recreate / "Make this": the job's lyrics and length (key: a new one per prefill). Lyrics live on this page, so AppTool hands them over. */
  recreate?: { key: string; lyrics: string; duration: number | null } | null;
}

/** "$0.08/1k chars", "$0.0009/s", "$0.15/run" from the quote's perUnit (the charge's own row). */
export function rateText(pu: any): string {
  if (!pu || typeof pu.usd !== 'number' || !(pu.usd > 0)) return '';
  const u: Record<string, string> = { second: 's', minute: 'min', '1k_chars': '1k chars', '1k_bytes': '1k bytes', run: 'run' };
  const usd = pu.usd >= 0.01 ? pu.usd.toFixed(2) : String(Number(pu.usd.toPrecision(2)));
  return `$${usd}/${u[pu.unit] ?? pu.unit}`;
}
/** "~20 s", "~3 min" from the quote's eta (lowSec–highSec) or a local run's learned range. */
export function etaText(q: any): string {
  const e = q?.eta; if (e && Number(e.highSec) > 0) { const mid = (Number(e.lowSec) + Number(e.highSec)) / 2; return `~${rangeText(mid, mid)}`; }
  const r = etaRangeOf(q); if (r && r.low != null && r.high != null && (r.source === 'learned' || r.source === 'scaled' || r.source === 'reported')) { const mid = (r.low + r.high) / 2; return `~${rangeText(mid, mid)}`; }
  return '';
}
/** A model's published per-unit rate for the model menu (shared/hostedPrices.ts, the table the quote and the charge use): "$0.11/1k chars",
 *  "≈ $0.0026/s". None for a local-only model (its row says Free) or a price nobody has measured yet (Comfy Cloud GPU time). */
export function unitRateOf(m: Pick<ToolModel, 'engines' | 'runsOn'>, engines?: string[]): string | null {
  for (const e of m.engines) { if (engines && !engines.includes(e)) continue; const h: any = HOSTED_BY_ID[e]; if (!h || h.priceUnmeasured || !(Number(h.usd) > 0)) continue;
    const r = rateText({ usd: h.usd, unit: h.unit }); if (!r) continue; const local = m.runsOn.some(x => x.id === 'local');
    return `${local ? 'cloud ' : ''}${h.estimated ? '≈ ' : ''}${r}`; }
  return null;
}
const durOf = (f: File): Promise<number | undefined> => new Promise(res => { const a = document.createElement('audio'); a.preload = 'metadata'; const u = URL.createObjectURL(f); a.onloadedmetadata = () => { res(Number.isFinite(a.duration) ? a.duration : undefined); URL.revokeObjectURL(u); }; a.onerror = () => { res(undefined); URL.revokeObjectURL(u); }; a.src = u; });

export default function AudioPage(p: AudioPageProps) {
  const toast = useToast(); const { wf } = p; const recipes = useAudioRecipes(); const live = recipes[wf.id];
  const cfg: any = p.tool.app ?? {}; const mode = wf.mode;
  const [pop, setPopRaw] = useState(''); const setPop = (k: string) => setPopRaw(o => o === k ? '' : k); const closePop = () => setPopRaw('');
  const aR = { add: useRef<HTMLButtonElement>(null), model: useRef<HTMLButtonElement>(null), dur: useRef<HTMLButtonElement>(null), n: useRef<HTMLButtonElement>(null), voice: useRef<HTMLButtonElement>(null), lang: useRef<HTMLButtonElement>(null), enh: useRef<HTMLButtonElement>(null), set: useRef<HTMLButtonElement>(null) };
  const [models, setModels] = useState<any[]>([]);
  useEffect(() => { fetch(`/api/models?toolId=${encodeURIComponent(p.tool.id)}`).then(r => r.ok ? r.json() : null).then(d => setModels(d?.groups?.find((g: any) => g.toolId === p.tool.id)?.models ?? [])).catch(() => 0); }, [p.tool.id]);
  const inMode = (id: string) => !cfg.providerModes?.[id] || cfg.providerModes[id].includes(mode);
  const provs = p.tool.providers.filter(x => inMode(x.id)); const cur = provs.find(x => x.id === p.provider) ?? provs[0]; const curM = models.find(m => m.id === cur?.id);
  useToolModels(p.tool.id); const tm = modelOfEngine(p.tool.id, cur?.id); const ro = runOnText(tm, useRunOn(p.tool.id, tm?.key).runOn, null);
  const modelName = (tm ? shownName(tm) : null) ?? live?.modelInfo?.[cur?.id ?? '']?.name ?? displayNameOf(cur, curM) ?? cur?.name ?? '';

  /* carry the prompt from the last workflow when it fits (a description stays a description; a script stays a script) */
  useEffect(() => { const t = takeCarriedPrompt(wf); if (t && !p.prompt.trim()) p.setPrompt(t); }, [wf.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- files ---- */
  const isVoice = p.tool.id === 'voice';
  const { vcDef, caps, ctrlMode } = voiceCtl(p.tool, p.provider, mode, p.fieldVals);
  const slotOf = (n: string) => wf.slots.find(s => s.name === n);
  const maxS: number = slotOf('voiceAudio') ? (caps ? Number(caps.maxVoiceSamples ?? vcDef.voiceAudio?.maxFiles ?? 1) : Number(vcDef.voiceAudio?.maxFiles ?? 3)) : 0;
  const videoOut = (mode === 'change-voice' && !p.clip) || mode === 'translate' || (mode === 'voiceover' && !!p.video) || p.tool.id === 'soundtrack';
  useVoiceControls(p.tool, p.provider, mode, p.fieldVals, p.setFieldVals, videoOut, isVoice);
  useEffect(() => { if (p.samples.length > maxS) { p.setSamples(p.samples.slice(0, maxS)); if (!maxS && p.fieldVals.voice === 'clone') p.setFieldVals(v => ({ ...v, voice: p.fieldDefaults.voice })); } }, [maxS]); // eslint-disable-line react-hooks/exhaustive-deps
  /* a saved "clone" voice with no sample in this visit goes back to the default voice (the samples are files: they don't survive a reload) */
  useEffect(() => { if (p.fieldVals.voice === 'clone' && !p.samples.length) p.setFieldVals(v => ({ ...v, voice: p.fieldDefaults.voice })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [upErr, setUpErr] = useState(''); const fileIn = useRef<HTMLInputElement>(null); const [songSec, setSongSec] = useState<number | undefined>();
  useEffect(() => { let on = true; if (p.song) durOf(p.song).then(d => on && setSongSec(d)); else setSongSec(undefined); return () => { on = false; }; }, [p.song]);
  /* where each file goes: the "+" row you picked (Voice sample → the samples), else the clip first, then the samples (audioIntake.ts) */
  const pickFor = useRef<AudioPick | null>(null);
  const [left, setLeft] = useState(''); /* "N not added" under the prompt line (shared LeftNote) */
  const takeFiles = async (fs: File[]) => { setUpErr(''); setLeft(''); const want = pickFor.current; pickFor.current = null; if (!fs.length) return;
    const ri = replacingSample.current; replacingSample.current = null;
    const plan = planAudioIntake(fs.map(f => fileFits('audio', f) ? 'audio' : fileFits('video', f) ? 'video' : 'other'), { want, slots: { video: !!slotOf('video'), audio: !!slotOf('audio'), voice: !!slotOf('voiceAudio') },
      cover: wf.id === 'cover', clipIsAudio: !!wf.oneOf?.includes('audio'), hasClip: !!p.clip, hasVideo: !!p.video, samples: p.samples.length, maxSamples: maxS, replacing: ri != null });
    let samples = [...p.samples]; let over = 0; let wrong = 0; const msgs: string[] = [];
    for (let i = 0; i < fs.length; i++) { const f = fs[i]; const d = plan[i];
      if (d === 'over') { over++; continue; } if (d === 'wrong') { wrong++; continue; }
      const ready = await prepUpload(f, d === 'video' ? 'video' : 'audio'); if ('error' in ready) { msgs.push(ready.error); continue; }
      if (d === 'video') { p.setClip(null); try { const m = await readVideo(f); p.setVideo({ ...m, trimmed: m.duration > 30 }); } catch { msgs.push('Couldn’t read that video.'); } continue; }
      if (d === 'song') { p.setSong(f); continue; }
      if (d === 'clip') { const was = p.clip?.file.name; p.setVideo(null); p.setClip({ file: f, sec: await durOf(f) }); if (was && was !== f.name) toast(`Replaced ${was} with ${f.name}`, 'info'); continue; }
      samples = ri != null && samples[ri] ? samples.map((x, j) => j === ri ? f : x) : [...samples, f]; p.setSamples(samples); p.setFieldVals(v => ({ ...v, voice: 'clone' })); }
    setLeft(notAddedText(over, `${modelName || 'This model'} takes up to ${maxS} voice sample${maxS > 1 ? 's' : ''}`));
    if (wrong) msgs.push(slotOf('voiceAudio') && !maxS && !slotOf('audio') ? 'This model uses its own voices, so it can’t clone a sample.' : `${wf.name} takes ${wf.slots.map(s => s.label.toLowerCase()).join(', ') || 'no files'}.`);
    setUpErr(msgs.join(' ')); };
  const accept = [slotOf('video') ? VIDEO_ACCEPT : '', slotOf('audio') || (slotOf('voiceAudio') && maxS) ? AUDIO_ACCEPT : ''].filter(Boolean).join(',');
  type Add = { id: string; label: string; testId: string };
  const addOpts: Add[] = [];
  if (slotOf('video') && !p.video && !p.clip) addOpts.push({ id: 'video', label: slotOf('video')!.label, testId: 'ap-add-video' });
  if (slotOf('audio') && wf.id === 'cover' && !p.song) addOpts.push({ id: 'song', label: 'Song file', testId: 'ap-add-song' });
  if (slotOf('audio') && wf.id !== 'cover' && !p.clip && !p.video) addOpts.push({ id: 'clip', label: 'Audio file', testId: 'ap-add-audio' });
  if (slotOf('voiceAudio') && maxS > 0 && p.samples.length < maxS) addOpts.push({ id: 'sample', label: `Voice sample (${p.samples.length}/${maxS})`, testId: 'ap-add-sample' });
  const openPicker = (o?: Add) => { const el = fileIn.current; if (!el) return; el.accept = !o ? accept : o.id === 'video' ? VIDEO_ACCEPT : AUDIO_ACCEPT; el.multiple = o?.id === 'sample'; pickFor.current = (o?.id as AudioPick | undefined) ?? null;
    /* the media picker's title and limits for this slot (shared/MediaPicker.tsx reads data-picker-*) */
    const t = !o ? null : o.id === 'video' ? ['Choose a video', wf.id === 'cover' ? 'MP4, MOV or WEBM' : 'The clip to score · MP4, MOV or WEBM'] : o.id === 'song' ? ['Choose a song to cover', 'MP3, WAV or M4A'] : o.id === 'sample' ? ['Choose a voice sample', `Up to ${maxS} sample${maxS > 1 ? 's' : ''} · clear speech, a few seconds or more`] : ['Choose a sound', 'MP3, WAV or M4A'];
    if (t) { el.dataset.pickerTitle = t[0]; el.dataset.pickerLimits = t[1]; } else { delete el.dataset.pickerTitle; delete el.dataset.pickerLimits; }
    el.click(); };

  /* ---- the drop target (2026-10-27): what this workflow still needs to run (Change voice: a clip or an audio file; Translate and Music for a video:
   *      a clip; Cover: the song) as Image's / Video's slot tile in the lead. The whole dock takes a drop too. ---- */
  type Need = { id: string; label: string; hint: string; accept: string; /** the picker's slot (none: video or audio) */ add?: Add };
  const needs: Need[] = []; const oneOfOpen = !!wf.oneOf?.length && !wf.oneOf.some(n => n === 'video' ? !!p.video : n === 'audio' ? !!p.clip : false);
  if (oneOfOpen) needs.push({ id: 'clip', label: 'Clip or audio', hint: 'A video or an audio file with speech · MP4, MOV, WEBM, MP3, WAV', accept: 'video/mp4,video/quicktime,video/webm,audio/*' });
  else for (const sl of wf.slots) if (sl.required && !(sl.name === 'video' ? p.video : sl.name === 'audio' ? (wf.id === 'cover' ? p.song : p.clip) : p.samples.length)) {
    const a = addOpts.find(o => (sl.name === 'video' && o.id === 'video') || (sl.name === 'audio' && (o.id === 'song' || o.id === 'clip')));
    if (a) needs.push({ id: sl.name, label: sl.label, hint: sl.name === 'video' ? `${sl.hint} · MP4, MOV or WEBM` : `${sl.hint}`, accept: sl.name === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'audio/*', add: a }); }
  const [drag, setDrag] = useState(false); const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  /* ---- lyrics (music, cover, music for a video): kept per tool in this browser; sent as the job field `lyrics` ---- */
  /* Lyrics shows only where the model reads them (recipe lyrics.models; Sonilo and Seed Audio take none); Instrumental only on the models whose
   * recipe says they can make one (lyrics.instrumental, sources in shared/audioWorkflows.ts): on, the Lyrics tab greys out and no lyrics are sent. */
  const pid = cur?.id ?? p.provider;
  const [lyrics, setLyricsRaw] = useState(() => lsGet(`${LYRICS_KEY}:${p.tool.id}`) ?? '');
  const setLyrics = (s: string) => { setLyricsRaw(s); lsSet(`${LYRICS_KEY}:${p.tool.id}`, s || null); };
  const [instPref, setInstPref] = useState(() => lsGet(`${INST_KEY}:${p.tool.id}`) === '1');
  const setInstrumental = (on: boolean) => { setInstPref(on); lsSet(`${INST_KEY}:${p.tool.id}`, on ? '1' : null); };
  const lp = lyricsPlan(wf.lyrics, pid, lyrics, instPref); const { on: lyrOn, required: lyrNeeded, instAvail, instrumental, used: lyrUsed, sends: sendLyrics } = lp;
  const [tabPick, setTab] = useState<'style' | 'lyrics'>('style'); const tab = lyrUsed ? tabPick : 'style';

  /* ---- voices (with ▶ previews), languages ---- */
  const [apiVoices, setApiVoices] = useState<{ id: string; label: string; previewUrl?: string; sampleUrl?: string | null; sampleKind?: string; sampleIsStandIn?: boolean }[] | null>(null);
  useEffect(() => { if (!isVoice) return; fetch('/api/voices').then(r => r.ok ? r.json() : null).then(d => { if (d?.voices?.length) setApiVoices(d.voices); }).catch(() => {}); }, [isVoice]);
  const fOpts = (n: string): { value: string; label: string }[] => (n === 'language' && p.langOpts ? p.langOpts.map(o => ({ value: o.value, label: o.label ?? o.value })) : ((cfg.fields ?? []).find((f: any) => f.name === n)?.options ?? []).map((o: any) => ({ value: String(o.value), label: String(o.label ?? o.value) })));
  /* a model with its own preset voices (Qwen3 TTS: caps.voices) lists those instead of our library; the pick goes in field `speaker`, each with its native language as the hint */
  const mv = isVoice && ctrlMode ? modelVoicesOf(caps) : null; const vKey = mv ? 'speaker' : 'voice';
  /* ▶ only for a REAL clip of the voice (Qwen3 TTS's 9 voices; a library voice whose sample is a recording): a stand-in tone gets no button */
  /* what the model really offers (shared/voicePick.ts): Seed Audio takes no voice (no Voice control); the voice changer has one built-in voice + your sample */
  const vCaps = cfg.voiceCaps?.[pid] ?? caps;
  const voiceOpts: { value: string; label: string; previewUrl?: string; hint?: string }[] = (mv ? mv.voices.map(v => ({ value: v.id, label: v.label, hint: v.hint, previewUrl: v.sampleUrl })) : voiceChoicesFor(vCaps, apiVoices ? [...apiVoices.map(v => ({ value: v.id, label: v.label, previewUrl: realSampleOf(v) })), ...fOpts('voice').filter(o => o.value === 'clone')] : fOpts('voice')))
    .filter((o, i, all) => !(o.value === 'clone' && maxS === 0) && all.findIndex(x => x.value === o.value) === i).map(o => o.value === 'clone' ? { ...o, label: p.samples.length ? `Your sample${p.samples.length > 1 ? 's' : ''} (${p.samples.length})` : 'Clone from a sample' } : o);
  const vHasPlay = voiceOpts.some(o => o.previewUrl); // keeps the names in one column when only some voices have a clip
  const voiceOn = wf.controls.some(c => c.field === 'voice') && takesVoicePick(vCaps); const langOn = wf.controls.some(c => c.field === 'language'); const mixOn = wf.controls.some(c => c.field === 'mix') && (mode !== 'voiceover' || !!p.video);
  const voiceV = mv ? String(p.fieldVals.speaker ?? mv.def) : shownVoiceFor(vCaps, String(p.fieldVals.voice ?? p.fieldDefaults.voice ?? '')); const voiceL = voiceOpts.find(o => o.value === voiceV)?.label ?? voiceV;
  const langs = fOpts('language'); const langV = String(p.fieldVals.language ?? ''); const langL = langs.find(o => o.value === langV)?.label ?? langV;
  /* the ▶ plays one clip at a time (■ stops it); a clip that can't load loses its button for this visit */
  const playing = useRef<HTMLAudioElement | null>(null); const [vPlay, setVPlay] = useState(''); const [vBad, setVBad] = useState<string[]>([]);
  const stopPreview = () => { playing.current?.pause(); playing.current = null; setVPlay(''); };
  const preview = (id: string, url?: string) => { if (!url) return; const was = vPlay; stopPreview(); if (was === id) return;
    const a = new Audio(url); registerMedia(a); playing.current = a; claimPlayback(a); setVPlay(id); const done = () => setVPlay(v => (v === id ? '' : v));
    a.onended = done; a.onpause = done; a.onerror = () => { done(); setVBad(b => b.includes(id) ? b : [...b, id]); };
    a.play().catch((e: any) => { done(); if (e?.name === 'NotSupportedError') setVBad(b => b.includes(id) ? b : [...b, id]); }); };
  useEffect(() => () => { playing.current?.pause(); }, []);
  useEffect(() => { if (pop !== 'voice') stopPreview(); }, [pop]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- saved voice settings (oj.audio.settings.v1, same key as before) ---- */
  const [save, setSave] = useState(() => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } });
  useEffect(() => { if (!isVoice) return; try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); if (s?.fields) p.setFieldVals(v => ({ ...v, ...s.fields })); } catch { /* none */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!isVoice) return; try { if (save) localStorage.setItem(SAVE_KEY, JSON.stringify({ fields: Object.fromEntries(['voice', 'language', 'mix', 'n', ...CTRL, ...MODEL_VOICE_KEYS].filter(k => p.fieldVals[k] !== undefined && !(k === 'voice' && p.fieldVals[k] === 'clone')).map(k => [k, p.fieldVals[k]])) })); else localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ } }, [save, JSON.stringify(p.fieldVals)]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- length (music / sound effects: the model's lengths, snapped) and takes ---- */
  const durs: number[] = (((tm as any)?.durations ?? (cur as any)?.durations ?? (cfg.durationsByProvider?.[p.provider]) ?? cfg.durations ?? []) as number[]).map(Number).filter(n => Number.isInteger(n) && n > 0);
  const lenOn = wf.controls.some(c => c.field === 'duration') && durs.length > 0;
  const swNote = useSwitchNote(); /* the bar's note after a model switch moved the length (shared/settingsFit.ts, the menu row's fit) */
  /* Auto length (shared/lyricsLength.ts): where the model sings the lyrics, the length that fits them among the model's real lengths. It is
   * written into the length AppTool sends, so the quote, the peek and the job all use it (quote = charge). A picked length turns Auto off. */
  const autoAvail = lenOn && lyrUsed; const [autoPref, setAutoPrefRaw] = useState(() => lsGet(`${AUTO_KEY}:${p.tool.id}`) !== '0');
  const setAutoPref = (on: boolean) => { setAutoPrefRaw(on); lsSet(`${AUTO_KEY}:${p.tool.id}`, on ? null : '0'); };
  const lenAuto = autoAvail && autoPref; const al = autoLength(lyrics, durs);
  /* Recreate (audit B3): the job's lyrics, Instrumental and length come back. Lyrics live here (per tool, in this browser), so AppTool hands them
   * over. Auto stays on only when it would pick the job's own length; with a length set here the length effect below skips this pass (it sees the old values). */
  const rcHold = useRef(false);
  useEffect(() => { const rc = p.recreate; if (!rc) return;
    const x = recreateAudio(wf.lyrics, pid, rc, durs, { lyrics, instrumental: instPref, lengthControl: lenOn });
    if (x.lyrics != null) setLyrics(x.lyrics); if (x.instrumental != null) setInstrumental(x.instrumental); if (x.auto != null) setAutoPref(x.auto);
    if (x.duration != null) { rcHold.current = true; p.setDuration(x.duration); } }, [p.recreate?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the one length rule (audit B1; shared/lyricsLength.ts lengthFor): Auto's length, else the picked one snapped to the model's list. One effect, so a
   * model switch can't leave a hidden length (it read "Auto · 6:00" while Auto meant 30 s); it also runs when anything else moves the length. */
  useEffect(() => { if (rcHold.current || !lenOn) return;
    const next = lengthFor(durs, p.duration, lenAuto ? al.seconds : null); if (next != null && next !== p.duration) p.setDuration(next); }, [p.provider, durs.join(), lenOn, lenAuto, al.seconds, p.duration]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { rcHold.current = false; }); /* the hold lasts one pass only */
  const lenShort = autoAvail && !lenAuto && tooShortFor(p.duration, al.need);
  /* a model that takes the length as a cap (YuE2, MiniMax Music 3: max_duration) can end the song sooner: one note under the list says so;
   * with Auto on, the chip reads "Auto · 1:00" */
  const upTo = ((cfg.lengthUpTo ?? []) as string[]).includes(cur?.id ?? '');
  const autoHint = al.need != null ? `Fits your ${al.lines} line${al.lines === 1 ? '' : 's'}: ${lengthText(al.seconds)}${al.cut ? ' (the longest here)' : ''}` : `Fits your lyrics (${lengthText(al.seconds)} for now)`;
  const lenHint = !autoAvail || al.need == null ? '' : lenAuto ? (al.cut ? `Auto length: ${lengthText(al.seconds)} is the longest here; the lyrics need about ${lengthText(al.need)}`
      : `Auto length: ${lengthText(al.seconds)} fits ${al.lines} line${al.lines === 1 ? '' : 's'}`)
    : lenShort ? `${lengthText(p.duration)} is short for ${al.lines} lines (about ${lengthText(al.need)}). Auto would pick ${lengthText(al.seconds)}` : '';
  const nOpts: number[] = ((p.tool.inputs ?? []).find(i => i.name === 'n')?.options ?? []).map(Number).filter(Boolean); const nMax = nOpts.length ? Math.max(...nOpts) : 1;
  const takesOn = wf.controls.some(c => c.field === 'n') && nMax > 1; const n = Math.min(nMax, Math.max(1, Number(p.fieldVals.n ?? 1)));

  /* ---- the quote (= charge): per-unit rows priced on what is sent (1k_chars: chars; Fish's 1k_bytes: the real text) ---- */
  const [q, setQ] = useState<any>(null);
  const script = mode === 'voiceover' ? p.prompt : '';
  const srcSec = p.video?.duration ?? p.clip?.sec ?? (wf.id === 'cover' ? songSec : undefined);
  const rqTick = useRequoteTick();
  useEffect(() => { if (!p.provider) return; if (lenOn && !durs.includes(p.duration)) return;
    const u = new URLSearchParams({ ...quoteParams(), provider: p.provider, types: mode, ...(takesOn ? { n: String(n) } : {}), ...(script ? { chars: String(script.length), text: script } : {}), ...(lenOn ? { duration: String(p.duration) } : {}), ...(srcSec ? { seconds: String(Math.round(srcSec * 100) / 100) } : {}) });
    const ac = new AbortController(); const t = setTimeout(() => fetch(`/api/tools/${p.tool.id}/price?${u}`, { signal: ac.signal }).then(readQuote).then(setQ).catch(() => 0), 300); return () => { clearTimeout(t); ac.abort(); };
  }, [rqTick, p.provider, mode, n, script, p.duration, srcSec, lenOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const unpricedWhy = unpricedReason(q); const unpriced = !!unpricedWhy; const credits: number | null = shownCredits(q);
  const free = credits === 0 && q?.routeKind === 'local'; const gate = !!q && q.needsKey === true && q.runnable === false;
  /* a free local model (YuE2) with nowhere to run: the server's noProvider says needsKey, but no key can help; say the real step */
  const localGate = gate && localOnlyGate(q);
  const blockWhy = !gate && !unpriced && q?.runnable === false ? String(runBlock(q) ?? '') : '';
  const gq = useGenState(); const qFull = gq.full; const bill = useBilling();
  const isDemo = !unpriced && !blockWhy && credits != null && q?.demo === true; const isFree = !unpriced && !blockWhy && credits != null && free;
  const qLang: any = /^(invalid|unsupported)_language$/.test(String(q?.code ?? '')) ? ((Array.isArray(q?.issues) ? q.issues : []).find((i: any) => i?.field === 'language') ?? { code: q.code, field: 'language', message: String(q.error ?? '') }) : null;

  /* ---- what's missing (Image's short words), then the notes ("Before you generate") ---- */
  const missing: string[] = [];
  const lyrNeedWhy = wf.lyrics.mode === 'required' ? `${wf.name} sings your new words over the melody, so it needs at least one line` : `${modelName || 'This model'} sings your lyrics, so it needs at least one line`;
  const filled = (s: string) => s === 'video' ? !!p.video : s === 'audio' ? (wf.id === 'cover' ? !!p.song : !!p.clip) : s === 'voiceAudio' ? p.samples.length > 0 : false;
  if (wf.oneOf?.length && !wf.oneOf.some(filled)) missing.push(slotOf(wf.oneOf[0])?.missing ?? 'Add a clip');
  for (const s of wf.slots) if (s.required && !filled(s.name)) missing.push(s.missing);
  if (wf.prompt.mode === 'required' && !p.prompt.trim()) missing.push(mode === 'voiceover' ? 'Write the script' : 'Write a prompt');
  if (lp.missing) missing.push('Add lyrics');
  if (voiceOn && voiceV === 'clone' && !p.samples.length) missing.push('Add a voice sample');
  const maxChars = mode === 'voiceover' && Number(caps?.maxChars) > 0 ? Number(caps.maxChars) : 0; /* a model that reads a shorter script in one go (Qwen3 TTS: 2,000) */
  if (maxChars && p.prompt.trim().length > maxChars) missing.push(`Shorten the script to ${maxChars.toLocaleString('en-US')} characters`);
  missing.push(...p.checks.map(c => /^checking/.test(c) ? 'Checking your files…' : 'A file can’t be used'));
  const setupGen = setupNeeded(tm, q, cur?.id) && !missing.length;
  const noPlace = !setupGen && !q && !!cur && 'defaultRoute' in (cur as any) && (cur as any).defaultRoute == null;
  type Note = PreflightNote;
  const notes: Note[] = [];
  const nChecks = p.checks.length; const checkLine = (c: string) => { const t = c.replace(/^usable files \((.*)\)$/, '$1'); return t[0].toUpperCase() + t.slice(1); };
  missing.forEach((m, i) => notes.push({ key: `miss-${i}`, stage: 'Inputs', hard: true, node: <span data-testid="ap-missing">{i >= missing.length - nChecks ? checkLine(p.checks[i - (missing.length - nChecks)]) : m}{m === 'Add lyrics' ? `: ${lyrNeedWhy}` : ''}</span> }));
  if (upErr) notes.push({ key: 'upErr', stage: 'Inputs', node: upErr });
  for (const f of ['video', 'audio', 'voiceAudio', 'prompt', 'lyrics', 'duration']) if ((p.issues ?? []).some((i: any) => i?.field === f)) notes.push({ key: `f-${f}`, stage: 'Inputs', node: <FieldIssue issues={p.issues} field={f} /> });
  if (langOn && (qLang || p.issues.some((i: any) => i?.field === 'language'))) notes.push({ key: 'lang', stage: 'Inputs', hard: !!qLang, node: <FieldIssue issues={qLang ? [...p.issues, qLang] : p.issues} field="language" /> });
  if (langOn && p.langNote) notes.push({ key: 'langNote', stage: 'Inputs', node: <span data-testid="lang-note">{p.langNote}</span> });
  if (wf.id === 'translate') notes.push({ key: 'tr', stage: 'Setup', node: <span data-testid="ap-translate-note"><b>Needs a translation server.</b> Translate runs on your own speech-translation server. Without one the job stops with a clear message and nothing is charged. <a href={TRANSLATE_DOC} target="_blank" rel="noopener noreferrer">Set one up ↗</a></span> });
  if (gate) notes.push({ key: 'gate', stage: 'Setup', hard: true, node: <KeyNeeded q={q} className="vs-key" toolId={p.tool.id} /> });
  if (unpriced && !gate && !qLang) notes.push({ key: 'unpriced', stage: 'Model', hard: true, node: <span data-testid="ap-price-block" role="status">{unpricedPrefix(q)}{unpricedWhy}</span> });
  if (blockWhy) notes.push({ key: 'blockWhy', stage: 'Model', hard: true, node: <span data-testid="ap-blocked" role="status">{blockWhy}</span> });
  if (!gate && (gq.full || gq.almostFull)) notes.push({ key: 'queue', stage: 'Setup', hard: gq.full, node: <GenHint /> });
  const routeIssue = (p.issues ?? []).some((i: any) => i?.code === 'route_not_runnable' || i?.code === 'idempotency_conflict');
  if (routeIssue) notes.push({ key: 'route', stage: 'Setup', node: <RouteNotRunnable issues={p.issues} /> });
  const blocking = notes.some(x => x.hard);
  const [pfOpen, setPfOpen] = useState(false); const genRef = useRef<HTMLButtonElement>(null);
  const eventKey = [upErr, ...['video', 'audio', 'voiceAudio', 'prompt', 'lyrics'].map(f => (p.issues ?? []).find((i: any) => i?.field === f)?.message), routeIssue ? 'route' : ''].filter(Boolean).join('|');
  useEffect(() => { if (eventKey) setPfOpen(true); }, [eventKey]);
  useEffect(() => { if (pfOpen && !notes.length) setPfOpen(false); });
  const pf0 = preflightProblems({ freeLocal: hasFreeLocal(p.tool.id), quote: q, modelName })[0];
  const genWord0 = qFull ? 'Queue full' : missing.length ? missing[0].replace(/ or an? [\w ]+$/, '') /* "Add a clip or an audio file" → "Add a clip" (the list says both) */ : qLang ? 'Pick another language'
    : localGate ? LOCAL_SETUP_TEXT : gate ? (q?.setup?.action === 'add_key' && q.setup.actionText ? String(q.setup.actionText) : (q?.keyOwner || q?.noProvider?.keyOwner) ? addKeyText(q) : pf0 ? PF_SHORT.needs_key(pf0) : 'Add a key first')
    : unpriced ? (pf0 ? PF_SHORT.price_unavailable(pf0) : 'Price unavailable') : blockWhy ? (pf0 && PF_SHORT[pf0.code] ? PF_SHORT[pf0.code](pf0) : firstWords(blockWhy)) : blocking ? 'See what to fix' : '';
  const eta = !genWord0 ? etaText(q) : ''; /* the tooltip's "Takes about …" */
  const genTitle = qFull ? gq.block : blockWhy ? blockWhy : localGate ? 'Runs free on your computer once ComfyUI is set up' : gate ? 'Needs a provider key' : missing.length ? missing.join(' · ') : unpricedWhy ? `${unpricedPrefix(q)}${unpricedWhy}`
    : [priceTitle(q, bill, { demo: isDemo, free: isFree, credits: !unpriced && !blockWhy ? credits : null }), q?.perUnit ? `${rateText(q.perUnit)} (${q.perUnitNote ?? q.perUnit.unitLabel}; this run: ${q.upTo ? 'up to ' : ''}${q.perUnit.quantityLabel}).` : '', q?.upTo && q.upToNote ? String(q.upToNote) : '', eta ? `Takes about ${eta.slice(1)}.` : '', wf.id === 'translate' ? 'Needs your own speech-translation server.' : ''].filter(Boolean).join(' ') || undefined;
  /* what DockGenerate reads: the inputs still missing, then the one block (a key, ComfyUI, no price, a refused route) in the setup stage so a
   * place that needs setting up still becomes the shared setup step; its words are genWord0 (the lead), the list says them in full */
  const dgProblems: PreflightProblem[] = [...missing.map(m => ({ code: 'input_problem', stage: 'inputs' as const, message: m, fix: { kind: 'focus-prompt' as const, label: m } })),
    ...(blocking && !missing.length ? [{ code: gate ? (localGate ? 'needs_setup' : 'needs_key') : 'model_cant_run', stage: 'setup' as const, message: genTitle ?? genWord0, fix: { kind: 'set-up' as const, label: genWord0 || 'See what to fix' } }] : [])];
  const generate = (e: React.MouseEvent<HTMLButtonElement>) => { if (blocking) { setPfOpen(o => !o); return; } if (missing.length) { nudgeMissing(e.currentTarget); return; } setPfOpen(false);
    /* the length goes only where the chip shows (audit B2: a model with no length, Seed Audio, got a hidden 600 s); the same p.duration the quote used */
    p.onGenerate({ ...(sendLyrics ? { lyrics } : {}), ...(lenOn ? { duration: String(p.duration) } : {}) }); };

  /* ---- Enhance (music and sound effects only; a voiceover script is read word for word and never rewritten) ---- */
  const enhOn = wf.id === 'music' || wf.id === 'sfx';
  const showEnh = (r: EnhanceResult) => { const was = r.original; p.setPrompt(r.prompt); toast(enhanceToastTitle(r), 'info', { sub: [r.added.slice(0, 4).join(', '), r.source].filter(Boolean).join(' · ') || undefined, ms: 10000, action: { label: 'Undo', onClick: () => p.setPrompt(was) } }); };

  /* ---- the model menu (the workflow's Default marked) ---- */
  const def = live?.defaults?.active ?? null;
  const metaOf = (m: any) => [providerGroupOf(provs.find(x => x.id === m?.id), m), live?.modelInfo?.[m?.id]?.workflow?.line].filter(Boolean) as string[];
  const menuItems: MenuItem[] = provs.map(x => { const m = models.find(y => y.id === x.id); const name = live?.modelInfo?.[x.id]?.name ?? displayNameOf(m, x) ?? m?.name ?? x.name;
    return { id: x.id, name, family: m?.family ?? (x as any).family ?? undefined, badge: (m?.badges ?? []).includes('new') ? 'New' : undefined, open: x.kind === 'open-weights' || isOpenWeights(x, m), tip: metaOf(m ?? x).join(' · '), p: { ...m, ...x, routes: (x as any).routes ?? m?.routes } }; });

  /* ---- the dock: height for the page padding, and the chip row's fit steps (Image's: words drop → the model name truncates → Enhance, Takes and
   *      Language fold into Settings, each given back when it fits → icon-only last) ---- */
  const dock = useRef<HTMLDivElement>(null);
  const filePreview = useFilePreview(dock); const replacingSample = useRef<number | null>(null);
  useDockHeight(dock, '.ap');
  /* shared with Image and Video: the prompt and the lyrics box grow 2 → 8 lines with their text, the bar upward */
  /* each tab's field re-fits the moment it shows (its text is the hook's trigger only while its tab is open; a hidden field isn't measured) */
  const lyrRef = useRef<HTMLTextAreaElement>(null); usePromptGrow(p.promptRef, tab === 'style' ? p.prompt : '\u0000'); usePromptGrow(lyrRef, tab === 'lyrics' ? lyrics : '\u0000');
  const insStyle = useInsertAtCursor(p.promptRef, p.prompt, p.setPrompt); const insLyr = useInsertAtCursor(lyrRef, lyrics, setLyrics);

  /* ---- the prompt area (shared/PromptTabs): Style | Lyrics where the model sings; "Script" for a voiceover; the bare prompt otherwise ---- */
  const musicLike = wf.lyrics.mode !== 'hidden'; const isScript = mode === 'voiceover';
  const ptTabs: PromptTab[] = musicLike ? [{ id: 'style', label: 'Style', icon: <MusicIcon size={14} /> }, ...(lyrOn ? [{ id: 'lyrics', label: 'Lyrics', icon: <LinesIcon />, disabled: instrumental,
      tip: instrumental ? 'Instrumental is on, so no lyrics are sent' : undefined,
      pill: instrumental ? null : lp.lines > 0 ? { text: `✓ ${lp.lines} line${lp.lines === 1 ? '' : 's'}`, tone: 'ok' as const } : lyrNeeded ? { text: 'needed', tone: 'need' as const } : null }] : [])]
    : isScript ? [{ id: 'style', label: 'Script' }] : [];
  /* prompt grammar step 2 (2026-10-26): a script's own voice tags as chips (Drama 3 [sighs], ElevenLabs v3 [whispers], MiniMax (laughs) and <#0.8#>), per model (server tools/voiceTags.ts) */
  const vt = isScript ? metaTagsFor(cfg, p.provider) : { tags: [] as MetaTag[] };
  const tagChips: HelperChip[] = [...vt.tags.filter(t => t.category === 'point').slice(0, 4), ...vt.tags.filter(t => t.category === 'style' || t.category === 'scoped').slice(0, 2), ...vt.tags.filter(t => t.category === 'pause').slice(0, 2)].map(t => ({ key: t.tag, label: <b>{t.tag.trim().replace('…', '')}</b>, ariaLabel: `Add ${t.label}`, testId: `ap-vtag-${t.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, tip: vt.style?.help ?? t.label, onPick: () => insertTag(p.promptRef.current, p.prompt, t.tag, p.setPrompt) }));
  const styleChips: HelperChip[] = musicLike ? STARTERS.filter(([k]) => !(k === 'voice' && instrumental)).map(([k, l]) => ({ key: k, label: l, testId: `ap-start-${k}`, tip: `Add “${k}: ” to the style`, onPick: () => insStyle(`${k}: `) })) : [];
  const lyrChips: HelperChip[] = SECTIONS.map(t => ({ key: t, label: <>+ <b>[{t}]</b></>, ariaLabel: `Add a [${t}] tag`, testId: `ap-tag-${t.toLowerCase()}`, onPick: () => insLyr(`[${t}]`, true) }));
  const lyrMissing = lp.missing;
  const helpHint = tab === 'lyrics' ? (lyrMissing ? lyrNeedWhy : lenHint) : isScript ? (p.prompt.length ? `${p.prompt.length.toLocaleString()}/${(maxChars || 5000).toLocaleString('en-US')}${maxChars && p.prompt.trim().length > maxChars ? ` · ${modelName || 'This model'} reads up to ${maxChars.toLocaleString('en-US')} at a time` : ''}` : '') : lenShort ? lenHint : ''; /* the how-to is the field's placeholder, never a line beside the chips */
  const helpWarn = tab === 'lyrics' ? lyrMissing || lenShort || al.cut && lenAuto : (lenShort && !isScript) || (isScript && !!maxChars && p.prompt.trim().length > maxChars);
  const chipsEl = useRef<HTMLDivElement>(null); const folded = useChipFit(chipsEl); const fo = (k: string) => folded.includes(k);

  /* ---- Settings: format, sample rate, the voice controls this model takes, the original audio, Save settings, and whatever folded ---- */
  const voiceSet = isVoice && ctrlMode && !!caps; const setOn = voiceSet || mixOn || folded.length > 0;
  const setFv = (k: string, v: any) => p.setFieldVals(f => { const x = { ...f }; if (v === '' || v == null) delete x[k]; else x[k] = v; return x; });

  /* ---- "See the exact prompt": the fields the submit sends (types, prompt, provider, duration, lyrics, every field value), files as counts ---- */
  const peekForm: PeekForm = { toolId: p.tool.id, fields: { types: JSON.stringify([mode]), prompt: p.prompt, ...(p.provider ? { provider: p.provider } : {}), ...(cfg.durations ? { duration: String(p.duration) } : {}), ...(sendLyrics ? { lyrics } : {}),
      ...Object.fromEntries(Object.entries(p.fieldVals).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)])) },
    files: { ...(p.video ? { video: 1 } : {}), ...(p.clip || (wf.id === 'cover' && p.song) ? { audio: 1 } : {}), ...(voiceOn && p.samples.length && voiceV === 'clone' ? { voiceAudio: p.samples.length } : {}) }, photo: null };

  return <div className="ap" data-testid="audio-page" data-workflow={wf.id}>
    {filePreview.preview}
    <section className="ap-main" aria-label="Your audio">
      <AudioFeed jobs={p.jobs} />
    </section>
    <div className="ic ic2 vs-icd"><div className={`ic-dock ap-dock${drag ? ' ic-drag' : ''}`} data-testid="ap-dock" data-drag={drag ? '1' : undefined} ref={dock}
      onDragEnter={e => { if (!hasFiles(e)) return; dragDepth.current++; setDrag(true); }} onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDrag(false); }}
      onDragOver={e => { if (hasFiles(e)) e.preventDefault(); }} onDrop={e => { dragDepth.current = 0; setDrag(false); const fs = Array.from(e.dataTransfer.files); if (!fs.length) return; e.preventDefault(); pickFor.current = null; void takeFiles(fs); }}>
      <div className="ic-frame"><div className="ic-panel">
      <div className="ic-main">
        <div className="ic-prow" data-testid="ap-prow">
          <div className="ic-lead" data-testid="ap-lead">
            {needs.map(nd => { const K = nd.id === 'audio' ? AudioIcon : VideoIcon; return <span key={nd.id} className="wf-slot-w ap-need"><span className={`wf-slot req wf-slot-next${drag ? ' over' : ''}`} data-testid={`ap-drop-${nd.id}`}>
              <button type="button" className="wf-slot-hit" aria-label={`Add ${nd.label.toLowerCase()}`} {...tip(`${nd.hint}. Pick, or drop it on the bar`)} onClick={() => openPicker(nd.add)}><K size={16} /><SlotLabel text={nd.label} /></button></span></span>; })}
            {p.video && <span className="ic-th ap-th" {...tip(`${p.video.file.name} · ${Math.round(p.video.duration)} s${p.video.trimmed ? ' · first 30 s used' : ''}`)} data-testid="ap-clip"><button type="button" className="ic-th-hit" aria-label="Preview video input" onClick={e => filePreview.show(e.currentTarget, p.video!.file, 'video', 'Video input', () => openPicker({id:'video',label:'',testId:''}), () => p.setVideo(null), p.video!.url)}><video src={p.video.url} muted /><em className="ic-att-n">{Math.round(p.video.duration)}s</em></button><button type="button" className="ic-x" aria-label="Remove clip" onClick={() => p.setVideo(null)}><CloseIcon size={12} /></button></span>}
            {p.clip && <span className="ic-th ap-th ap-aud" {...tip(`${p.clip.file.name} · audio comes back`)} data-testid="ap-audio-clip"><button type="button" className="ic-th-hit" aria-label="Preview audio input" onClick={e => filePreview.show(e.currentTarget, p.clip!.file, 'audio', 'Audio input', () => openPicker({id:'clip',label:'',testId:''}), () => p.setClip(null))}><span aria-hidden>♪</span>{p.clip.sec ? <em className="ic-att-n">{Math.round(p.clip.sec)}s</em> : null}</button><button type="button" className="ic-x" aria-label="Remove audio file" onClick={() => p.setClip(null)}><CloseIcon size={12} /></button></span>}
            {wf.id === 'cover' && p.song && <span className="ic-th ap-th ap-aud" {...tip(`Song: ${p.song.name}`)} data-testid="ap-song"><button type="button" className="ic-th-hit" aria-label="Preview song input" onClick={e => filePreview.show(e.currentTarget, p.song!, 'audio', 'Song input', () => openPicker({id:'song',label:'',testId:''}), () => p.setSong(null))}><span aria-hidden>♫</span>{songSec ? <em className="ic-att-n">{Math.round(songSec)}s</em> : null}</button><button type="button" className="ic-x" aria-label="Remove song" onClick={() => p.setSong(null)}><CloseIcon size={12} /></button></span>}
            {p.samples.map((f, i) => <span key={i + f.name} className="ic-th ap-th ap-aud ap-sample" {...tip(`Voice sample ${i + 1}: ${f.name}`)} data-testid={`ap-sample-${i}`}><button type="button" className="ic-th-hit" aria-label={`Preview voice sample ${i + 1}`} onClick={e => filePreview.show(e.currentTarget, f, 'audio', `Voice sample ${i + 1}`, () => { replacingSample.current = i; openPicker({id:'sample',label:'',testId:''}); }, () => p.setSamples(p.samples.filter((_,j) => j !== i)))}><MicIcon size={14} />{i === 0 && <em className="ic-att-n" data-testid="ap-sample-count">{p.samples.length}/{maxS}</em>}</button><button type="button" className="ic-x" aria-label={`Remove ${f.name}`} onClick={() => { const next = p.samples.filter((_, j) => j !== i); p.setSamples(next); if (!next.length && p.fieldVals.voice === 'clone') p.setFieldVals(v => ({ ...v, voice: p.fieldDefaults.voice })); }}><CloseIcon size={12} /></button></span>)}
          </div>
          {wf.prompt.mode === 'hidden' ? <p className="ic-noprompt" data-testid="ap-noprompt">No prompt needed: {wf.name} works from your {wf.oneOf?.length ? 'clip or audio file' : 'clip'}{voiceOn ? ' and the voice you pick' : ''}{langOn ? ' and language' : ''}.</p>
            : <PromptTabs tabs={ptTabs} active={tab} onTab={id => setTab(id as 'style' | 'lyrics')} testId="ap-pt" idBase="ap-pt"
                aside={instAvail ? <PromptSwitch label="Instrumental" on={instrumental} onChange={setInstrumental} testId="ap-instrumental" tip={instrumental ? 'No vocals: lyrics are kept but not sent' : `${modelName || 'This model'} can make a track with no vocals`} /> : null}>
              <PromptField ref={p.promptRef} hidden={tab !== 'style'} data-enter-submits="" id="app-prompt" data-testid="ap-prompt" boxTestId="ap-prompt-box" rows={2} aria-label={isScript ? 'Script' : musicLike ? 'Style' : 'Prompt'}
                maxLength={isScript ? 5000 : 10000} placeholder={wf.prompt.placeholder} value={p.prompt} onChange={e => p.setPrompt(e.target.value)} />
              {lyrOn && <PromptField ref={lyrRef} hidden={tab !== 'lyrics'} data-enter-submits="mod" id="ap-lyrics" data-testid="ap-lyrics" boxTestId="ap-lyrics-box" rows={2} aria-label="Lyrics" maxLength={5000}
                placeholder={wf.lyrics.placeholder} value={lyrics} onChange={e => setLyrics(e.target.value)} highlight={SECTION_TAG_HL} />}
              <PromptHelpers chips={tab === 'lyrics' ? lyrChips : isScript ? tagChips : styleChips} hint={helpHint || null} tone={helpWarn ? 'warn' : null} testId="ap-help" />
            </PromptTabs>}
        </div>
        <SwitchNote note={swNote.note} testId="ap-switch-note" />
        <LeftNote text={left} onClose={() => setLeft('')} testId="ap-not-added" />
        <div className="ic-chiprow"><div ref={chipsEl} className="ic-chips">
          <input ref={fileIn} type="file" hidden data-testid="ap-file-input" accept={accept} onChange={e => { const fs = Array.from(e.target.files ?? []); e.currentTarget.value = ''; void takeFiles(fs); }} />
          <span className="ic-fixed" data-testid="ap-chips-fixed">
            <AudioWorkflowChip tools={p.tools ?? []} watch={dock} prompt={p.prompt} />
            {/* + only when there is something to add (2026-10-27: no greyed-out + on Music / Sound effects, or once every slot is filled) */}
            {addOpts.length > 0 && <button ref={aR.add} type="button" className="ic-chip ic-sq" data-testid="ap-add" aria-label={`Add ${addOpts.map(o => o.label.toLowerCase()).join(' or ')}`} aria-haspopup="menu" aria-expanded={pop === 'add'} {...tip(`Add ${addOpts.map(o => o.label.toLowerCase()).join(' or ')}`)} onClick={() => { if (addOpts.length === 1) openPicker(addOpts[0]); else setPop('add'); }}><svg className="ic-pi" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>}
            <button ref={aR.model} type="button" className={`ic-chip ic-model ${pop === 'model' ? 'on' : ''}`} data-testid="ap-model" aria-haspopup="listbox" aria-expanded={pop === 'model'} {...tip(pop === 'model' ? null : [modelName, live?.modelInfo?.[cur?.id ?? '']?.workflow?.line].filter(Boolean).join(' · '))} onClick={() => setPop('model')}><MakerTile className="ic-dot" medium="audio" maker={tm?.maker} makerName={tm?.makerName} fallback={(cur as any)?.family || cur?.name} /><span className="ic-mname">{modelName || 'No model'}</span><svg className="ic-caret" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          </span>
          <ModelMenu open={pop === 'model'} anchor={aR.model} watch={dock} gap={4} placement="top" onClose={closePop} items={menuItems} value={p.provider} testId="ap-model-list" rowTestId={id => `ap-model-${id}`} onPick={(id, fit) => { p.setProvider(id); closePop(); const d = Number(fit?.values.duration); if (lenOn && d > 0 && !lenAuto) p.setDuration(d); swNote.show(lenAuto ? null : fit?.note); }} toolId={p.tool.id} quote={q}
            defaultId={def?.id ?? undefined} defaultWhy={def?.why ?? undefined} defaultReason={def && !def.runs ? def.reason : null} rateOf={m => unitRateOf(m, provs.map(x => x.id))} />
          {lenOn && (durs.length > 1 ? <button ref={aR.dur} type="button" className={`ic-chip ap-len${pop === 'dur' ? ' on' : ''}${lenShort ? ' ap-len-warn' : ''}`} data-testid="ap-length" data-auto={lenAuto ? '1' : undefined} aria-haspopup="listbox" aria-expanded={pop === 'dur'}
              aria-label={`Length: ${lenAuto ? 'Auto, ' : ''}${lengthText(p.duration)}. Change`} {...tip(pop === 'dur' ? null : lenHint || (lenAuto ? `Length: Auto. ${autoHint}` : upTo ? `Length: up to ${lengthText(p.duration)}; ${modelName || 'the model'} can end the song sooner` : 'Length'))} onClick={() => setPop('dur')}><ChipGlyph icon="clock" />{lenAuto ? <><span className="ap-auto-w">Auto</span><span className="gp-dot"> · </span>{lengthText(p.duration)}</> : lengthText(p.duration)}</button>
            : <span className="ic-chip ic-static" data-testid="ap-length" {...tip('The only length this model makes')}><ChipGlyph icon="clock" />{lengthText(p.duration)}</span>)}
          {!lenOn && srcSec ? <span className="ic-chip ic-static" data-testid="ap-length" {...tip(wf.id === 'cover' ? 'The cover is as long as your song' : 'The result follows your clip’s length')}><ChipGlyph icon="clock" />{Math.round(Math.min(srcSec, wf.id === 'cover' ? srcSec : 30))} s</span> : null}
          {takesOn && <button ref={aR.n} type="button" data-fold="n" data-rank="2" className={`ic-chip ic-cnt ${pop === 'n' ? 'on' : ''}`} aria-haspopup="dialog" aria-expanded={pop === 'n'} aria-label={`Takes: ${n} of ${nMax}`} {...tip(pop === 'n' ? null : `Takes: ${n} of ${nMax}, each a separate result`)} data-testid="ap-takes" data-n={n} onClick={() => setPop('n')}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><rect x="1.75" y="4.75" width="9.5" height="9.5" rx="2" /><path d="M4.75 2.25h7a2.5 2.5 0 0 1 2.5 2.5v7" /></svg><b>{n}×</b></button>}
          {voiceOn && (voiceOpts.length > 1 ? <button ref={aR.voice} type="button" {...(langOn ? { 'data-fold': 'voice', 'data-rank': '3' } : {})} className={`ic-chip wf-grp ap-voice${pop === 'voice' ? ' on' : ''}`} data-testid="ap-voice" aria-haspopup="listbox" aria-expanded={pop === 'voice'} aria-label={`Voice: ${voiceL}. Change`} {...tip(pop === 'voice' ? null : `Voice: ${voiceL}`)} onClick={() => setPop('voice')}><MicIcon size={14} /><span className="wf-grp-l">Voice</span><b>{voiceL}</b></button>
            : <span className="ic-chip ic-static ap-voice" data-testid="ap-voice" {...tip('The only voice this model offers')}><MicIcon size={14} /><b>{voiceL}</b></span>)}
          {langOn && <button ref={aR.lang} type="button" data-fold="lang" {...fitPri('keep') /* Translate's main control */} className={`ic-chip wf-grp ap-lang${pop === 'lang' ? ' on' : ''}${qLang ? ' vs-bad' : ''}`} data-testid="ap-language" aria-haspopup="listbox" aria-expanded={pop === 'lang'} aria-label={`Language: ${langL}. Change`} {...tip(pop === 'lang' ? null : `Target language: ${langL}`)} onClick={() => setPop('lang')}><TranslateIcon size={14} /><span className="wf-grp-l">Language</span><b>{langL}</b></button>}
          {enhOn && <button ref={aR.enh} type="button" data-fold="enh" data-rank="1" className={`ic-chip ic-sq ic-enh-one${pop === 'enh' ? ' open' : ''}`} data-testid="ap-enhance" aria-label="Rewrite my prompt" aria-haspopup="dialog" aria-expanded={pop === 'enh'} {...tip(pop === 'enh' ? null : 'Enhance: rewrite my prompt with more detail')} onClick={() => setPop('enh')}><SparkleIcon size={16} /></button>}
          {setOn && <button ref={aR.set} type="button" className={`ic-chip ic-sq vs-sq${pop === 'set' ? ' on' : ''}`} data-testid="ap-settings" aria-haspopup="dialog" aria-expanded={pop === 'set'} aria-label="Settings" {...tip(pop === 'set' ? null : 'Settings')} onClick={() => setPop('set')}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3 4h6M12 4h1M3 12h1M7 12h6M3 8h3M9 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="10.5" cy="4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="5.5" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="7.5" cy="8" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg></button>}
          <RowMore watch={dock} testId="ap-row-over" />
        </div>
          {tm && <RunOnChip compact toolId={p.tool.id} model={tm} engine={cur?.id} quote={q} testId="ap-run-on" watch={dock} />}
          <BrandChip toolId={p.tool.id} mode={mode} watch={dock} />{/* Brand Kit: the mood words only, music only (a voiceover's script is read as typed) */}
          <PromptPeek form={peekForm} place={ro.sub ? `${ro.main} (${ro.sub})` : ro.main} photos={[]} watch={dock} />
        </div>
      </div>
      {noPlace ? <NoPlaceGenerate testId="ap-generate" priceTestId="ap-price" />
        : <DockGenerate toolId={p.tool.id} engine={cur?.id ?? ''} quote={q} label="Generate" busy={p.busy} disabled={qFull} problems={dgProblems} missing={genWord0 || null} pfOpen={pfOpen} genRef={genRef} onClick={generate}
            testId="ap-generate" priceTestId="ap-price" workflowId={wf.id} className={gate || blockWhy || unpriced ? 'gen-off' : ''} /* shared/DockGenerate.tsx: Image's and Video's button, size, price token and states */ />}
      </div></div>
      <PreflightNotes open={pfOpen} notes={notes} anchor={genRef} dock={dock} onClose={() => setPfOpen(false)} testId="ap-notes" />
      <BarPopover open={pop === 'add' && addOpts.length > 0} anchor={aR.add} avoid={dock} watch={dock} placement="top" gap={8} onClose={closePop} label="Add to your audio" role="menu" testId="ap-add-menu" width={260}><PopSection label="Add"><PopList label="Add" role="group">{addOpts.map(o => <PopRow key={o.id} role="menuitem" testId={o.testId} label={o.label} hint={(o.id === 'sample' ? slotOf('voiceAudio') : o.id === 'video' ? slotOf('video') : slotOf('audio'))?.hint} onClick={() => { closePop(); openPicker(o); }} />)}</PopList></PopSection></BarPopover>
      <BarPopover open={pop === 'dur'} anchor={aR.dur} avoid={dock} watch={dock} placement="top" gap={8} onClose={closePop} label="Length" role="listbox" testId="ap-length-menu" width={240}><PopSection label="Length" aside={modelName || undefined}><PopList label="Length">{autoAvail && <PopRow selected={lenAuto} testId="ap-len-auto" label="Auto" hint={autoHint} onClick={() => { setAutoPref(true); closePop(); }} />}
        <div className="ap-len-list">{durs.map(d => <PopRow key={d} selected={!lenAuto && d === p.duration} testId={`ap-len-${d}`} label={lengthText(d)} hint={autoAvail && tooShortFor(d, al.need) ? 'Short for your lyrics' : undefined} onClick={() => { setAutoPref(false); p.setDuration(d); closePop(); }} />)}</div></PopList>
        {upTo ? <p className="ap-len-note" data-testid="ap-len-note">{modelName || 'This model'} ends the song when it’s done, so it can come out shorter.</p> : null}</PopSection></BarPopover>
      <BarPopover open={pop === 'n'} anchor={aR.n} avoid={dock} watch={dock} placement="top" gap={8} onClose={closePop} label="Takes" testId="ap-takes-menu" width={260}><PopSection label="Takes" aside={countWord(n, 'take')}><Segmented label="Takes" value={n} onChange={v => setFv('n', String(v))} onCommit={closePop} options={Array.from({ length: nMax }, (_, k) => k + 1).map(v => ({ value: v, label: v, testId: `ap-takes-${v}` }))} /></PopSection></BarPopover>
      <BarPopover open={pop === 'voice'} anchor={aR.voice} avoid={dock} watch={dock} placement="top" gap={8} onClose={closePop} label="Voice" role="listbox" testId="ap-voice-menu" width={260}><PopSection label="Voice" aside={mv ? `${modelName}’s own voices` : undefined}><PopList label="Voice">{voiceOpts.map(o => { const on = o.value === voiceV; const url = o.previewUrl && !vBad.includes(o.value) ? o.previewUrl : undefined; const pl = vPlay === o.value; return <div key={o.value} className="ap-vrow">
        {url ? <button type="button" className={`ap-vplay${pl ? ' on' : ''}`} data-testid={`voice-preview-${o.value}`} aria-pressed={pl} aria-label={pl ? `Stop ${o.label}` : `Preview ${o.label}`} {...tip(pl ? 'Stop' : `Hear ${o.label}`)} onClick={() => preview(o.value, url)}>{pl ? <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><rect x="1.5" y="1.5" width="7" height="7" rx="1.2" fill="currentColor" /></svg> : <PlayIcon size={12} />}</button>
          : vHasPlay ? <span className="ap-vplay ap-vplay-none" aria-hidden /> : null}
        <PopRow selected={on} testId={`ap-voice-${o.value}`} label={o.label} hint={o.value === 'clone' ? `${maxS} sample${maxS > 1 ? 's' : ''} max` : o.hint} onClick={() => { if (o.value === 'clone' && !p.samples.length) { closePop(); openPicker({ id: 'sample', label: '', testId: '' }); return; } setFv(vKey, o.value); closePop(); }} /></div>; })}</PopList></PopSection></BarPopover>
      <BarPopover open={pop === 'lang'} anchor={aR.lang} avoid={dock} watch={dock} placement="top" gap={8} onClose={closePop} label="Target language" role="listbox" testId="ap-language-menu" width={260}><PopSection label="Target language" aside={modelName}><PopList label="Target language">{langs.map(o => <PopRow key={o.value} selected={o.value === langV} testId={`ap-lang-${o.value}`} label={o.label} onClick={() => { setFv('language', o.value); closePop(); }} />)}</PopList></PopSection></BarPopover>
      <BarPopover open={pop === 'enh'} anchor={aR.enh} avoid={dock} watch={dock} placement="top" gap={8} onClose={closePop} label="Prompt enhancer" testId="ap-pop-enh" width={320}><PopSection label="Prompt enhancer" testId="ap-enhance-panel">
        <PopAction label="Rewrite my prompt now" hint="See the added detail first, then keep or undo it"><EnhanceButton model={tm?.key} prompt={p.prompt} kind="audio" onApply={r => { showEnh(r); closePop(); }} /></PopAction>
      </PopSection></BarPopover>
      <BarPopover open={pop === 'set'} anchor={aR.set} avoid={dock} watch={dock} placement="top" gap={8} onClose={closePop} label="Settings" role="dialog" width={380} testId="ap-settings-menu" className="ap-set"><div className="bp-wrap ap-set-pop" data-testid="ap-settings-panel">
        {fo('enh') && enhOn && <PopSection label="Prompt enhancer"><PopAction label="Rewrite my prompt now" hint="Enhance: adds detail you can undo"><EnhanceButton model={tm?.key} prompt={p.prompt} kind="audio" onApply={r => { showEnh(r); closePop(); }} /></PopAction></PopSection>}
        {fo('n') && takesOn && <PopSection label="Takes" aside={countWord(n, 'take')}><Segmented label="Takes" value={n} onChange={v => setFv('n', String(v))} options={Array.from({ length: nMax }, (_, k) => k + 1).map(v => ({ value: v, label: v }))} /></PopSection>}
        {fo('lang') && langOn && <PopSection label="Target language"><PopList label="Target language" role="radiogroup"><div className="ap-set-list">{langs.map(o => <PopRow key={o.value} role="radio" selected={o.value === langV} label={o.label} onClick={() => setFv('language', o.value)} />)}</div></PopList></PopSection>}
        {fo('voice') && voiceOn && <PopSection label="Voice"><PopList label="Voice" role="radiogroup"><div className="ap-set-list">{voiceOpts.filter(o => o.value !== 'clone' || p.samples.length).map(o => <PopRow key={o.value} role="radio" selected={o.value === voiceV} label={o.label} hint={o.hint} onClick={() => setFv(vKey, o.value)} />)}</div></PopList></PopSection>}
        {mixOn && <PopSection label="Original audio"><Segmented label="Original audio" value={String(p.fieldVals.mix ?? p.fieldDefaults.mix ?? 'replace')} onChange={v => setFv('mix', v)} options={fOpts('mix').map(o => ({ value: o.value, label: o.label, testId: `ap-mix-${o.value}` }))} /></PopSection>}
        {voiceSet && <PopSection label={`${modelName} settings`} className="ap-vc" testId="ap-voice-controls"><div className="as-adv-b at-voice ap-vc-b"><VoiceControls tool={p.tool} provider={p.provider} mode={mode} fv={p.fieldVals} setFv={p.setFieldVals} issues={p.issues} videoOut={videoOut} /></div></PopSection>}
        {isVoice && <PopSection><PopSwitch testId="as-save" label="Save settings" hint="Keep the voice and these settings next time" on={save} onChange={setSave} /></PopSection>}
      </div></BarPopover>
    </div></div>
  </div>;
}

// ---------------- the feed ----------------
/* The feed is ui/audio/AudioFeed.tsx (2026-10-27): the shared result feed (useFeedState / FeedGallery / FeedCard / FeedToolbar / the shared viewer)
 * with the shared AudioCard as each finished card's body. Opening a sound shows it over this page (?view=<id>), never /jobs/<id>. */
import AudioFeed from './AudioFeed';
import { SlotLabel } from '../../shared/SlotLabel';
