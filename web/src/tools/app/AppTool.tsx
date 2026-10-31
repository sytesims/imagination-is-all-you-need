import { toolPage } from '../../../../server/src/shared/pages';
import { goClick } from '../../shared/goToWorkflow';
import { IMAGE_ACCEPT, fileFits, wrongTypeText } from '../../../../server/src/shared/mediaAccept';
import { hasPicture } from '../../../../server/src/shared/refFit';
import { Notice } from '../../shared/Notice';
import { continuesInput, withExtendModel } from '../../shared/continuation';
import { promptLimitIssue } from '../../../../server/src/shared/promptRefs';
import { engineModelKey } from '../../../../server/src/shared/modelIds';
import { continuePrompt, continueModel, continueBeat } from '../../../../server/src/shared/continueFrame';
import { engineForModelParam, modelParam, useModelLink, useModelParamSync, getRunOn, setRoute as saveRunRoute } from '../../shared/models';
import { restorableProvider } from '../../shared/lifecycle';
import { ownAccountsNow } from '../../shared/billing';
import { useDraftFile, useDraftFileList } from '../../shared/draftFiles';
import { defaultsOf, pickDefault } from '../../shared/defaults';
import { useClipSource, setClipSeconds, EstimateHint } from '../../shared/clipEstimate';
import { readQuoteBody, useRequoteTick, unpricedReason, demoMessage, normalizeQuote, shownCredits, sizeLine, ignoresRes } from '../../shared/quote';
import MoodPicker from '../../shared/MoodPicker';
import { isSubmitting, useSubmitting } from '../../shared/submitGuard';
import { Link, navigate } from '../../platform/router';
import { exampleAt } from '../../ui/examples';
import { FieldIssue, FIX_FIELD_EVT } from '../../ui/IssueList';
import Workspace from '../../ui/Workspace';
import { useEffect, useRef, useState } from 'react';
import { SwitchDetails } from '../../shared/StickyDetails';
import { issuesOf, withQuoteIssues, SubmitIssue, createJob, estimate, estimateDraft, jobStages, JobState, ToolInfo, precheck } from '../../api';
import { useFormDraft, useMentions, pricesByQuality } from '../../shared/batch1';
import { removeImageMention, mentionsAfterRestore } from '../../shared/mentions';
import UploadVideo, { VideoMeta } from '../../shared/UploadVideo';
import Dropzone from '../../shared/Dropzone';
import type { Ref } from '../../shared/References';
import GenerateBar from '../../shared/GenerateBar';
import JobProgress from '../../shared/JobProgress';
import ResultView, { ResultPlaceholder } from '../../shared/ResultView';
import AppFields, { appFieldsOf, appFieldDefaults } from './AppFields';
import VersionGrid from '../../shared/VersionGrid';
import { useJobs } from '../../shared/useJobs';
import { useToast } from '../../shared/Toast';
import SameSeed from '../../shared/SameSeed';
import { usePrefill, quoteParams } from '../../shared/usePrefill';
import { LIMITS } from '../../shared/limits';
import FailureCard from '../../shared/FailureCard';
import { useToolQuery, cloneForm } from '../../shared/useToolQuery';
import MaskPaint from '../../ui/next/MaskPaint';
import ImageCanvas from '../../ui/next/ImageCanvas';
import { FeatureLine } from '../../shared/FeatureCredit';
import { featureById, EDIT_MODELS, MASK_MODELS, minPhotoPixelsFor } from '../../shared/imageFeatures';
import VideoStudio from '../../ui/video/VideoStudio';
import { VideoWorkflowChip, VIDEO_PAGE } from '../../ui/video/VideoWorkflows';
import { StandInArt, hasArt } from '../../shared/StandInArt';
import { announcePicked } from './FxGallery';
import ScenePair from './ScenePair';
import { VoiceCards, RecordClip, AudioClipInput, sampleKindOf } from './ChangeVoice';
/** B27: Change Voice takes a video or an audio clip. */
const CV_NEED = 'Add a video or an audio clip.';
import AudioStudio from '../../ui/audio/AudioStudio';
import AudioPage from '../../ui/audio/AudioPage';
import { addBrandField } from '../../shared/brandStore';
import { audioPageWorkflow } from '../../ui/audio/AudioWorkflows';
import { AUDIO_DEFAULT_WORKFLOW } from '../../../../server/src/shared/audioWorkflows';
import { VoiceControls, useVoiceControls, CTRL as VOICE_CTRL, MODEL_VOICE_KEYS } from '../../ui/audio/VoiceControls';
import MetaTagChips, { MetaTag, metaTagsFor } from '../../ui/next/MetaTags';
import { StylePresets, AudioModeTabs, AudioMode } from '../../ui/next/Gen';
import { EnhanceButton, EnhanceDiff, EnhanceResult } from '../../ui/next/Enhance';
import { useRoute, pinQ } from '../../ui/routing/Routes';
import { TRANSLATE_DOC } from '../../shared/brand';


/**
 * Generic small-app screen (server tools/apps.ts makeApp). Upload → pick type(s) → Generate.
 * Everything (types, mix, durations, enhance, steps, resolutions) comes from tool.app + tool.presets.
 */
/** C4: tools that work on one picture show it large after upload. */
const SRC_PREVIEW = ['image-upscale', 'app-inpaint', 'app-relight', 'relight', 'inpaint'];
export default function AppTool({ tool, tools }: { tool: ToolInfo; tools?: ToolInfo[] }) {
  /* One Audio page (2026-10-23): on /audio?workflow=<id> this tool runs that workflow's mode in the Audio bar (ui/audio/AudioPage.tsx) */
  const awf = useRef(audioPageWorkflow(tool.id)).current;
  const cfg = tool.app!; const types = tool.presets ?? []; const toast = useToast();
  /** Row 22: Camera Moves is single-select (one move per shot; the hero card shows the pick). Other tools keep the server's `mix`. */
  const mix = tool.id === 'camera' ? 1 : (cfg.mix ?? 1);
  const [video, setVideo] = useState<VideoMeta | null>(null); const [cvAudio, setCvAudio] = useState<{ file: File; sec?: number } | null>(null); /* B27: Change Voice on an audio clip */
  const [image, setImage] = useState<Ref | null>(null);
  const [voiceSample, setVoiceSample] = useState<File | null>(null); const [voiceExtra, setVoiceExtra] = useState<File[]>([]); const [vrefs, setVrefsAll] = useState<Record<string, Ref[]>>({}); // extra clone samples (sent as repeated voiceAudio; server uses the first today)
  /* H3: last frame (flf), talking-photo portrait + speech, extend seconds */
  const [presImg, setPresImg] = useState<Ref | null>(null); const presIn = useRef<HTMLInputElement>(null); // B15 gap 4: UGC presenterImage (your own presenter photo)
  const [lastFrame, setLastFrame] = useState<Ref | null>(null); const [genAudio, setGenAudio] = useState(true); const [portrait, setPortrait] = useState<Ref | null>(null); const [speech, setSpeech] = useState<File | null>(null);
  const [extSec, setExtSec] = useState<number>(() => { const e = Number(new URLSearchParams(location.search).get('ext')); const xs: number[] = (tool.app as any)?.extendSeconds ?? []; return xs.includes(e) ? e : xs[0] ?? 5; });
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null); const [cat, setCat] = useState('All'); const [fxOpen, setFxOpen] = useState(false);
  /* (e) create-image: style preset, inpaint mask, enhance diff. (f) voice: mode tabs reuse `picked`. */
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const hasStyle = (tool.inputs ?? []).some(i => i.name === 'style'); const [style, setStyle] = useState(''); const [mask, setMask] = useState<string | null>(null); const [enh, setEnh] = useState<EnhanceResult | null>(null);
  const [styles, setStyles] = useState<{ id: string; label: string; prompt?: string }[]>(((tool.app as any)?.styles ?? []) as any[]);
  useEffect(() => { if ((tool.inputs ?? []).some(i => i.name === 'style')) fetch('/api/styles').then(r => r.ok ? r.json() : null).then(j => Array.isArray(j) && j.length && setStyles(j)).catch(() => 0); }, [tool.id]);
  const [imgErr, setImgErr] = useState('');
  const q = useToolQuery(); const fdById = useRef(new Map<string, FormData>());
  /* B15 gap 1/3: gallery app defaults (initial values, not locks) and hideControls (base controls the app doesn't show). */
  const gal0: any = (cfg as any).gallery ?? null; const galDef: Record<string, string> = gal0?.defaults ?? {}; const galHide = new Set<string>(Array.isArray(gal0?.hideControls) ? gal0.hideControls : []);
  const hid = (n: string) => galHide.has(n);
  const galDur = galDef.duration != null && cfg.durations?.includes(Number(galDef.duration)) ? Number(galDef.duration) : null; const galRes = galDef.resolution && cfg.resolutions.includes(galDef.resolution) ? galDef.resolution : null;
  const defaults = { picked: [] as string[], prompt: '', enhance: true, duration: galDur ?? (cfg.durations ? cfg.durations[cfg.durations.length - 1] : 5), steps: cfg.steps?.[0] ?? 0,
    resolution: galRes ?? (cfg.resolutions.includes('720p') ? '720p' : cfg.resolutions[0]), provider: tool.defaultProvider ?? '' };
  /** Generic plugin fields (tool.app.fields): name → value; posted as form fields of the same name. */
  type FieldSpec = { name: string; label?: string; kind: 'select' | 'text' | 'number' | 'boolean'; help?: string; options?: { value: string; label?: string }[]; default?: string | number | boolean; min?: number; max?: number; maxLength?: number; providers?: string[]; gallery?: boolean };
  /* Gallery apps: the app's own input (Change Voice voice = built-in / my voice, Translate languages) replaces the base field's options;
     exposed selects with no base field (Orbit / Transitions aspect) get one; hidden base controls are neither shown nor sent. */
  const galIn = (n: string): any => gal0 ? (tool.inputs ?? []).find(i => i.name === n && !(i as any).appField) : undefined;
  const galOpts = (inp: any, base?: { value: string; label?: string }[]) => { const ch = new Map<string, string>(((inp?.choices ?? []) as any[]).map(c => [String(c.value), c.label]));
    return ((inp?.options ?? []) as any[]).map(v => String(v)).map(v => ({ value: v, label: ch.get(v) ?? base?.find(o => o.value === v)?.label })); };
  const withDef = (f: FieldSpec, inp: any): FieldSpec => { const d = galDef[f.name] ?? inp?.default; return d != null && (f.kind !== 'select' || f.options?.some(o => o.value === String(d))) ? { ...f, default: String(d) } : f; };
  const fieldSpecs: FieldSpec[] = ((cfg.fields ?? []) as FieldSpec[]).filter(f => !hid(f.name)).map(f => { const inp = galIn(f.name); if (!inp) return f;
    const f2: FieldSpec = inp.kind === 'select' && Array.isArray(inp.options) && inp.options.length ? { ...f, options: galOpts(inp, f.options), gallery: true } : f; return withDef(f2, inp); })
    .concat(gal0 ? ((gal0.exposed ?? []) as string[]).filter(n => n === 'aspect' && !hid(n) && !(cfg.fields ?? []).some((f: any) => f.name === n)).map(n => galIn(n)).filter((i: any) => i?.kind === 'select' && Array.isArray(i.options) && i.options.length > 1)
      .map((i: any) => withDef({ name: i.name, label: i.label ?? (i.name === 'aspect' ? 'Aspect' : i.name), kind: 'select', options: galOpts(i), gallery: true }, i)) : []);
  const fieldDefaults = Object.fromEntries(fieldSpecs.map(f => [f.name, f.default ?? (f.kind === 'boolean' ? false : f.kind === 'select' ? f.options?.[0]?.value ?? '' : '')])) as Record<string, string | number | boolean>;
  /* Music and Cover share an engine/tool, not a draft: visiting Cover must not replace Music's saved model. */
  const form = useFormDraft(awf ? `${tool.id}:audio:${awf.id}` : tool.id, { ...defaults, fields: fieldDefaults }); const fs = form.state;
  /* B14 (BH10 PB re-check P1): gallery app fields (orbit type, backdrop, transition, scene…) from app.gallery.fields / inputs[appField]. */
  const gal: any = (cfg as any).gallery ?? null; const appFs = appFieldsOf(tool);
  const [appVals, setAppVals] = useState<Record<string, string>>(() => ({ ...appFieldDefaults(appFs), ...((fs as any).appVals ?? {}) }));
  const promptOn = (!!cfg.prompt || gal?.promptBox === true) && !hid('prompt'); const promptOpt = gal?.promptOptional === true || (tool.inputs ?? []).find((i: any) => i.name === 'prompt')?.required === false; /* server: prompt required:false (Transitions, Orbit Shot, …) */ const autoP: { whenEmpty?: boolean; text?: string } | null = gal?.autoPrompt ?? null; const promptNeeded = !promptOpt && gal?.base === 'cinema' && String(gal?.locked?.auto ?? '') === '0'; // Orbit before 04c277f: Auto locked off, so a prompt was needed
  const [autoOn, setAutoOn] = useState(true); const heldPrompt = useRef(''); const fxHeld = useRef(''); const autoActive = promptOpt && !!autoP?.whenEmpty && autoOn; // B14 follow-up: Auto = send no prompt; the server writes one from autoPrompt.text
  const [fieldVals, setFieldVals] = useState<Record<string, string | number | boolean>>(() => { const v: Record<string, string | number | boolean> = { ...fieldDefaults, ...(fs.fields ?? {}) }; fieldSpecs.forEach(f => { if (f.kind === 'select' && f.options?.length && !f.options.some(o => o.value === String(v[f.name]))) v[f.name] = fieldDefaults[f.name]; }); if (gal0) Object.keys(v).forEach(k => { if (hid(k)) delete v[k]; }); return v; });
  const [picked, setPicked] = useState<string[]>(() => { if (awf) return [awf.mode]; const sp = new URLSearchParams(location.search); const lm = engineForModelParam(tool, sp.get('model')) ?? sp.get('model'); const lmModes: string[] | null = lm ? ((cfg as any).providerModes?.[lm] ?? (tool.providers.find(p => p.id === lm) as any)?.modes ?? null) : null; /* ?model= without ?mode: open a mode that model runs */ const qm = sp.get('mode') ?? (Array.isArray(lmModes) && !lmModes.includes(fs.picked[0]) ? types.find(t => lmModes.includes(t.id))?.id ?? '' : ''); /* ?mode=lipsync etc. (S10) */ const v = (tool.presets ?? []).some(p => p.id === q.preset) ? [q.preset] : qm && types.some(t => t.id === qm) ? [qm] : fs.picked.filter(id => types.some(t => t.id === id)); if (!v.length) { try { const lk = JSON.parse((cfg as any).gallery?.locked?.types ?? '[]'); const ok = (Array.isArray(lk) ? lk : []).filter((id: string) => types.some(t => t.id === id)); if (ok.length) return ok; } catch { /* no lock */ } } return cfg.modes && !v.length && types[0] ? [types[0].id] : v; });
  const [prompt, setPrompt] = useState(fs.prompt); const [enhance, setEnhance] = useState(fs.enhance);
  const [duration, setDuration] = useState(cfg.durations?.includes(fs.duration) ? fs.duration : defaults.duration);
  const [steps, setSteps] = useState(fs.steps);
  const [resolution, setResolution] = useState(cfg.resolutions.includes(fs.resolution) ? fs.resolution : defaults.resolution);
  const [provider, setProvider] = useState(() => { const m = engineForModelParam(tool, modelParam()); /* ?model= (a model key or an old engine id) from the header menus (as DirectorTool) */ return m ? m : restorableProvider(tool, fs.provider) ? fs.provider : defaults.provider; });
  /* The Create Video composer stays mounted for a same-page shortcut (Loop, a model link). Apply its model before URL sync can write the old pick back. */
  useEffect(() => { if (tool.id !== 'h3-video') return; const path = location.pathname;
    const apply = () => { if (location.pathname !== path || new URLSearchParams(location.search).get('workflow')) return; const m = engineForModelParam(tool, modelParam()); if (m) setProvider(m); };
    addEventListener('popstate', apply); return () => removeEventListener('popstate', apply);
  }, [tool.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useModelLink(tool, setProvider); /* ?model= the tool's list doesn't know: GET /api/models/resolve */
  useModelParamSync(tool, provider, tool.id === 'create-image' ? !new URLSearchParams(location.search).get('workflow') /* QA #18: a picked workflow runs its own model: no stray ?model= */ : !!modelParam()); /* ?model= follows the picker (replaceState) */
  /** Per-model resolution tiers (e.g. cloud-h3-wf is 768p/480p only); fall back to the app's full list. */
  const resList: string[] = ((cfg as any).resolutionsByProvider?.[provider] as string[] | undefined)?.length ? (cfg as any).resolutionsByProvider[provider] : cfg.resolutions;
  useEffect(() => { if (!resList.includes(resolution)) setResolution(resList.includes('720p') ? '720p' : resList[0]); }, [provider, resList.join(',')]);
  const submittingNow = useSubmitting(tool.id);
  /** Create Image `n`: price per image × n (server charges the same: tools/shared.ts imageCount). */
  const imgN = Math.min(4, Math.max(1, Number(fieldVals.n) || 1));
  /* B18: camT / camCardProv sit up here: the quote effect and generate() send the move's own model when the current one can't run it. */
  const camT: any = tool.id === 'camera' ? types.find(x => x.id === picked[0]) : undefined;
  const camCardProv: string | undefined = camT && Array.isArray(camT.providers) && camT.providers.length && !camT.providers.includes(provider) && tool.providers.some(x => x.id === camT.providers[0]) ? camT.providers[0] : undefined;
  useEffect(() => { form.set({ picked, prompt, enhance, duration, steps, resolution, provider, fields: fieldVals, appVals } as any); }, [picked, prompt, enhance, duration, steps, resolution, provider, fieldVals, appVals]);
  const keepDur = useRef<number | null>(null); /* a recipe's / example's length, kept through the model snap below */
  const resetForm = () => { prefill.cancelFrameHandoff(); form.clear(); setPicked(defaults.picked); setPrompt(''); setEnhance(true); setDuration(defaults.duration); setSteps(defaults.steps); setResolution(defaults.resolution); setProvider(defaults.provider); setFieldVals(fieldDefaults); setVideo(null); setImage(null); setExtraRefs([]); };
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  /* Create Image: the grid is the history (server), not only this session, of EVERY image feature (Edit, Camera & Lens, Relight, Face Swap,
   * Upscale…): GET /api/jobs?features=*. Video and audio jobs never show. Re-run / same seed / the stage only use this tool's own jobs (ownJobs).
   * Generate Video (the Video tab) is a history too: its past clips from any session or browser (user, 2026-10-24). */
  const { jobs, add, setJobs, refresh, active } = useJobs(tool.id, tool.id === 'create-image' ? { history: true, features: '*' } : tool.id === 'h3-video' ? { history: true } : {});
  const ownJobs = tool.id === 'create-image' ? jobs.filter(j => !j.toolId || j.toolId === tool.id) : jobs;
  const [sel, setSel] = useState(''); const [rlPicked, setRlPicked] = useState(false);
  const last = useRef<{ build: (s: number, extra?: Record<string, string>) => FormData; root: string } | null>(null);
  /* C2: after Recreate, a new seed by default; the Same seed toggle swaps in the original. */
  const [rcSeed, setRcSeed] = useState<number | null>(null); const [sameSeedOn, setSameSeedOn] = useState(false);
  const [icInit, setIcInit] = useState<Record<string, string> | null>(null);
  const toggleSame = (v: boolean) => { setSameSeedOn(v); if (rcSeed != null) setSeed(v ? rcSeed : Math.floor(Math.random() * 1e6)); };
  const sameSeedEl = rcSeed != null ? <SameSeed seed={rcSeed} on={sameSeedOn} onChange={toggleSame} /> : null;
  const applyExample = (ex: import('../../api').Example) => {
    if (ex.types?.length) setPicked(ex.types.slice(0, mix)); if (ex.prompt) setPrompt(ex.prompt);
    const rc = (ex as any).recreate as { seed: number } | undefined; const fromRecipe = !!(ex as any).fromRecipe; // "Make this" (/r): the recipe's own seed, Same seed on
    if (fromRecipe) { imageRef.current = null; setImage(null); setExtraRefs([]); setVideo(null); setLastFrame(null); } // a recipe never has files: start from an empty bar
    if (rc && fromRecipe) { setRcSeed(rc.seed); setSameSeedOn(true); setSeed(rc.seed); }
    else if (rc) { setRcSeed(rc.seed); setSameSeedOn(false); let ns = Math.floor(Math.random() * 1e6); if (ns === rc.seed) ns = (ns + 1) % 1e6; setSeed(ns); }
    const pf = ex.prefill; if (!pf) return;
    if (rc || fromRecipe) { const tg = pf.toggles ?? {}; const fv: Record<string, string | number | boolean> = {}; fieldSpecs.forEach(sp => { if (tg[sp.name] != null) fv[sp.name] = tg[sp.name]; });
      if ((cfg as any).voiceCaps) [...VOICE_CTRL, ...MODEL_VOICE_KEYS].forEach(k => { if (tg[k] != null && tg[k] !== '') fv[k] = tg[k]; }); /* Recreate: the voice controls too (speed…, Qwen3 TTS voice, language, Style) */
      if (Object.keys(fv).length) setFieldVals(f => ({ ...f, ...fv })); const av: Record<string, string> = {}; appFs.forEach(sp => { if (tg[sp.name] != null) av[sp.name] = String(tg[sp.name]); }); if (Object.keys(av).length) setAppVals(v => ({ ...v, ...av }));
      const ic: Record<string, string> = {}; ['aspect', 'quality', 'imageResolution', 'n'].forEach(k => { if (tg[k] != null) ic[k] = String(tg[k]); }); setIcInit({ ...ic, _k: String(Date.now()) }); }
    if (cfg.resolutions.includes(pf.quality)) setResolution(pf.quality); if (pf.provider && tool.providers.some(x => x.id === pf.provider)) setProvider(pf.provider);
    /* the Video bar's aspect and sound live in fieldVals without a field spec: take them from any prefill (Recreate, Explore, ?aspect=); VideoStudio snaps an aspect the model lacks */
    if (tool.id === 'h3-video' && (cfg as any).aspects?.length && !fieldSpecs.some(sp => sp.name === 'aspect')) { const tg = pf.toggles ?? {}; const fv: Record<string, string> = {};
      if (tg.aspect != null && String(tg.aspect)) fv.aspect = String(tg.aspect); if (tg.audio != null && String(tg.audio) !== '') fv.audio = tg.audio === true || String(tg.audio) === '1' || String(tg.audio) === 'true' ? '1' : '0';
      if (Object.keys(fv).length) setFieldVals(f => ({ ...f, ...fv })); }
    if (typeof pf.toggles.enhance === 'boolean') { if (tool.id === 'h3-video') setFieldVals(f => { const n = { ...f }; if (pf.toggles.enhance) n.enhance = '1'; else delete n.enhance; return n; }); else setEnhance(pf.toggles.enhance); }
    if (cfg.durations?.includes(Number(pf.toggles.duration))) { setDuration(Number(pf.toggles.duration)); keepDur.current = Number(pf.toggles.duration); } /* a recipe's / example's length survives the model it also sets */
    if (cfg.steps?.includes(Number(pf.toggles.steps))) setSteps(Number(pf.toggles.steps));
  };
  const [hoPrompt, setHoPrompt] = useState(''); // C1: Turn to video starts with an empty prompt + a 'Use image prompt' chip
  /* BH3 e: Recreate brings back every file slot the server returns, not only the main source. */
  const onFiles = (slot: string, rs: Ref[]) => { const r0 = rs[0]; if (!r0) return;
    if (slot === 'lastFrame') setLastFrame(r0);
    else if (slot === 'image' && tool.id === 'voice') setPortrait(r0);
    else if (slot === 'speech') setSpeech(r0.file);
    else if (slot === 'voiceAudio') { setVoiceSample(r0.file); setVoiceExtra(rs.slice(1).map(r => r.file)); }
    else if (slot === 'mask') { const fr = new FileReader(); fr.onload = () => typeof fr.result === 'string' && setMask(fr.result); fr.readAsDataURL(r0.file); }
    else if (['refVideos', 'refAudios'].includes(slot) || (slot === 'refs' && tool.id !== 'create-image' && cfg.input !== 'video')) setVrefsAll(m => ({ ...m, [slot]: rs }));
    else if (((cfg as any).refSlots ?? []).some((x: any) => x.name === slot)) setSlotFiles(m => ({ ...m, [slot]: rs.map(r => r.file) })); };
  /* Create Image with a workflow picked (Face Swap, Relight…): hand-offs go into the workflow's slots first (ImageCanvas intakeRef), never into Create's hidden photo */
  const intake = useRef<((fs: File[]) => boolean) | null>(null);
  /* Recreate / an example REPLACES the inputs: every file slot empties first, then the job's own files land once (a second Recreate used to keep the first job's photo or end frame) */
  const onReset = () => { imageRef.current = null; setImage(null); setExtraRefs([]); setVideo(null); setLastFrame(null); setPortrait(null); setSpeech(null); setVoiceSample(null); setVoiceExtra([]); setMask(null); setVrefsAll({}); setSlotFiles({}); };
  /* Create Video shares its path with the Video bar's workflows (?workflow=…): a link for a workflow is the bar's, not this page's */
  const scope = tool.id === 'h3-video' ? { scope: null } : awf ? { scope: awf.id as string | null, scopeDefault: AUDIO_DEFAULT_WORKFLOW as string } : {};
  const framePrompt = useRef('');
  /* the Audio page: a Recreate for another audio workflow (Music → Sound effects) is the part that mounts for it, not this one (it used to eat the link) */
  const prefill = usePrefill(cfg.input === 'video' ? { ...scope, onReset, onVideo: setVideo, onFiles, onExample: ex => applyExample(ex) } : { ...scope, onReset, onFrameStart: () => { framePrompt.current = prompt; }, onImage: (r: Ref) => { if (tool.id === 'create-image' && intake.current?.([r.file])) return; imageRef.current = r; setImage(r); }, onFiles, ...(tool.id === 'create-image' ? { onRefs: (fs: { file: File; url: string }[], o?: { handoff?: boolean }) => { if (!fs.length) return; if (intake.current?.(fs.map(f => f.file))) return;
    /* a hand-off adds to the photos already attached; a Recreate replaces them with the job's own */
    if (imageRef.current) setExtraRefs(r => o?.handoff ? [...r, ...fs] : fs); else { imageRef.current = fs[0]; setImage(fs[0]); setExtraRefs(fs.slice(1)); } } } : {}), onExample: ex => applyExample(ex), onHandoff: h => { if (cfg.input === 'image-optional' && cfg.imageModes?.length && !cfg.imageModes.includes(mode) && types.some(t => t.id === cfg.imageModes![0])) setPicked([cfg.imageModes[0]]); if (tool.id === 'h3-video' && h.cont) { /* Continue from last frame: the source's style, cast and closing lines with an empty beat to write (shared/continueFrame.ts), on the
         source clip's model, length, resolution, aspect and Run on place (2026-10-27: it kept the bar's last pick, FLUX 3 Max at 20 s); else the bar's model when it takes a start image, else LTX-2.5 22B */
      const f = h.form; const p = f.prompt || continuePrompt(h.prompt, f.duration); const edited = prompt !== framePrompt.current; if (!edited) { setPrompt(p); setHoPrompt(''); }
      const ids = tool.providers.map(x => x.id); const m = f.provider && ids.includes(f.provider) ? f.provider : continueModel(provider, ids, cfg.providerModes ?? null);
      autoModeSwitch.current = true; if (m && m !== provider) setProvider(m);
      if (m && m === f.provider) {
        const d = Number(f.duration); if (cfg.durations?.includes(d)) { setDuration(d); keepDur.current = d; }
        if (f.resolution && cfg.resolutions.includes(f.resolution)) setResolution(f.resolution);
        if (f.aspect) setFieldVals(v => ({ ...v, aspect: String(f.aspect) }));
        const cr = h.continueRoute; if (cr?.modelKey && cr.runOn && cr.routeId && getRunOn(tool.id, cr.modelKey).route !== cr.routeId) void saveRunRoute(tool.id, cr.modelKey, cr.runOn, cr.routeId).catch(() => undefined);
      }
      const beat = continueBeat(f.duration), at = p.indexOf(beat); /* the caret waits in the empty beat */
      if (!edited && at >= 0) setTimeout(() => { const el = promptRef.current; if (el) { el.focus(); el.setSelectionRange(at + beat.length, at + beat.length); } }, 60);
      return; }
      if (tool.id === 'h3-video' && h.prompt.trim()) { setPrompt(''); setHoPrompt(h.prompt.trim()); } } });

  const [extraRefs, setExtraRefs] = useState<{ file: File; url: string }[]>([]);
  const imageCap = useRef<number | null>(null);
  const vCaps = useRef<Record<string, number> | null>(null); /* Create Video: how many of each reference list the model takes (VideoStudio sets it) */
  const imageRef = useRef(image); imageRef.current = image;
  /* Create Image multi-ref: first photo is `image`, the rest go out as repeated `refs` (ImageCanvas trims to the route's maxRefs). */
  const onImage = (fs: File[], userPick = true) => {
    if (userPick) prefill.cancelFrameHandoff();
    if (tool.id === 'create-image' && fs.length) {
      const ok = fs.filter(f => fileFits('image', f)); setImgErr(ok.length < fs.length ? wrongTypeText(fs.find(f => !ok.includes(f))?.name ?? '', ['image']) : '');
      const rest = imageRef.current ? ok : ok.slice(1); if (rest.length) setExtraRefs(r => [...r, ...rest.map(file => ({ file, url: URL.createObjectURL(file) }))]);
      if (imageRef.current || !ok.length) return; fs = [ok[0]];
    }
    const [f] = fs;
    setImgErr('');
    if (!fileFits('image', f)) { setImgErr(wrongTypeText(f.name, ['image'])); return; }
    const url = URL.createObjectURL(f); const im = new Image();
    im.onload = () => im.naturalWidth * im.naturalHeight < minPhotoPixelsFor(tool.id, LIMITS.minPixels) /* the 854×480 floor is a video start-frame rule: image tools take small photos */
      ? setImgErr(`Image too small: needs ≥ 409,600 px (e.g. 854×480). Yours is ${im.naturalWidth}×${im.naturalHeight}.`)
      : (setImage({ file: f, url }), setImgDims({ w: im.naturalWidth, h: im.naturalHeight }));
    im.onerror = () => setImgErr(wrongTypeText(f.name, ['image'])); im.src = url;
  };
  /* the start frame survives a refresh; Create Image keeps ALL its photos, in order (QA #3: photo 2 used to be lost while "@image2" stayed) */
  const fromRecipe = useRef(/[?&]recipe=/.test(location.search)); // "Make this" (/r): a recipe opens with an empty bar (a recipe never has files), so last visit's photos aren't brought back
  useDraftFile(tool.id === 'create-image' ? undefined : tool.id, 'image', image?.file ?? null, f => { if (!fromRecipe.current && !prefill.frameHandoff) onImage([f], false); });
  useDraftFileList(tool.id === 'create-image' ? tool.id : undefined, 'photos', image ? [image.file, ...extraRefs.map(r => r.file)] : extraRefs.map(r => r.file), fs => {
    /* a photo that can't come back is taken out of the numbering: the others keep their mentions, one to the lost photo stays visible as "@image?" */
    if (fromRecipe.current) return; if (fs.some(f => !f)) setPrompt(p => mentionsAfterRestore(p, fs.map(f => !!f))); const ok = fs.filter((f): f is File => !!f); if (ok.length) onImage(ok); }, 'image');
  useDraftFile(tool.id, 'lastFrame', lastFrame?.file ?? null, f => { if (!fromRecipe.current) setLastFrame({ file: f, url: URL.createObjectURL(f) }); }); // the end frame too (Camera LTX endImage, H3 last frame)

  /** Media tools: one mode picked; only providers that fit it are offered (tool.app.providerModes). */
  const mode = picked[0] ?? '';
  const cvApp = tool.id === 'app-change-voice'; const cvAny = (cvApp || (tool.id === 'voice' && mode === 'change-voice')) && (tool.inputs ?? []).some(i => i.name === 'audio'); /* B27: an audio clip can stand in for the video */
  const isUpscale = /upscale/.test(tool.id); const isAudio = tool.id === 'voice' || tool.id === 'audio' || cfg.kind === 'soundtrack' || /audio|soundtrack/.test(String(cfg.kind ?? '')); const tileTypes = tool.id === 'camera' || tool.id === 'photo-fx'; const fxHero = tileTypes;
  const scaleN = Number((mode.match(/^x(\d+)$/) ?? [])[1] ?? 0); const vScale = Number(fieldVals.scale ?? ((cfg as any).scales ?? [])[0] ?? 0);
  const vw = (video as any)?.w ?? (video as any)?.width, vh = (video as any)?.h ?? (video as any)?.height; const tgtH = Number(String(resolution).replace(/\D/g, '')) || 0;
  const readout = imgDims && scaleN ? `${imgDims.w}×${imgDims.h} → ${imgDims.w * scaleN}×${imgDims.h * scaleN}` : vw && vh && vScale ? `${vw}×${vh} → ${vw * vScale}×${vh * vScale}` : vw && vh && tgtH ? `${vw}×${vh} → ${Math.round(vw * tgtH / vh / 2) * 2}×${tgtH}` : '';
  /* Images: Edit Image lives inside Create Image (like the reference). An old edit URL (/tools/edit-image → ?mode=edit) opens Create Image in edit mode: edit models, waiting for the image. */
  const featId: string | undefined = (tool as any).featureId; const editIntent = useRef(tool.id === 'create-image' && featId !== 'camera-lens' && new URLSearchParams(location.search).get('mode') === 'edit').current;
  useEffect(() => { if (tool.id !== 'create-image') return; const m = image ? (mask && ((cfg as any).maskModes ?? []).includes('inpaint') ? 'inpaint' : 'edit') : editIntent ? 'edit' : 'generate'; if (picked[0] !== m && types.some(t => t.id === m)) setPicked([m]); }, [image, mask]);
  const mt = metaTagsFor(cfg, provider); const metaTags: MetaTag[] = mt.tags; /* per model: Drama 3, ElevenLabs v3, MiniMax Speech */
  const curProv: any = tool.providers.find(p => p.id === provider); const provModes: string[] | null = cfg.modes && !cfg.providerModes && Array.isArray(curProv?.modes) && curProv.modes.length < types.length ? curProv.modes : null;
  /* Images: the picker lists only models that really work for the feature (shared/imageFeatures: Create Image hides FLUX.2 [flex], HY Image 3.5 and Muse; edit and Brush Edit list only routes that send the image / the mask). */
  const featModels: string[] | null = tool.id !== 'create-image' ? null : mode === 'inpaint' ? MASK_MODELS : mode === 'edit' ? EDIT_MODELS : featureById(featId ?? 'create-image')?.providers ?? null;
  const modeProviders = (cfg.providerModes ? tool.providers.filter(p => cfg.providerModes![p.id]?.includes(mode)) : tool.providers).filter(p => !featModels || featModels.includes(p.id));
  useEffect(() => { if (provModes && !provModes.includes(mode)) setPicked([provModes[0]]); }, [provider]);
  /* B27 (A4): each mode has its own default (defaultsByMode); switching mode preselects it. The first render keeps the saved / linked model.
   * A free open-weights model that can do the new mode stays picked: switching mode never swaps a free local run for a paid one (user, 2026-10-24). */
  const modeDefaults = defaultsOf(tool, mode); const modeSeen = useRef(mode); /* a mode the page switched by itself (a photo added / removed on Create Video): the picked model stays when it runs that mode too */ const autoModeSwitch = useRef(false);
  useEffect(() => { const ids = modeProviders.map(p => p.id); const changed = modeSeen.current !== mode; modeSeen.current = mode;
    const auto = changed && autoModeSwitch.current; if (changed) autoModeSwitch.current = false; /* child effects run first: the first-render pass must not use up a switch made in the same commit */
    /* Create Image's mode follows the photo (Create → Edit when one is added): the model you picked stays when it edits too (it flipped to FLUX 3 Image, 2026-10-31) */
    const keepOpen = ids.includes(provider) && (auto || tool.id === 'create-image' || (tool.providers.find(x => x.id === provider) as any)?.kind === 'open-weights');
    if (changed && !keepOpen && (tool as any).defaultsByMode?.[mode] && ids.length) { const d = pickDefault(modeDefaults, ids, provider); if (d && d !== provider) setProvider(d); return; }
    if (ids.length && !ids.includes(provider)) setProvider(pickDefault(modeDefaults, ids)); }, [mode]);
  const audioVoice = tool.id === 'audio' && ((cfg as any).voiceControlModes ?? []).includes(mode);
  useVoiceControls(tool, provider, mode, fieldVals, setFieldVals as any, false, tool.id === 'audio');
  const isLip = tool.id === 'voice' && mode === 'lipsync'; const isExtend = tool.id === 'h3-extend';
  const needsLast = ((cfg as any).lastFrameModes ?? []).includes(mode); const qualityOpts: { value: string; label: string; steps?: number }[] = (cfg as any).quality ?? [];
  const fieldShown = (f: any) => !f.providers || f.providers.includes(provider);
  /* B15 gap 6: Translate languages = app.gallery.languages ({code,label,nativeName}) the picked route can do (languagesByProvider[provider]). */
  /* B18 (PB): the same per-provider list for Voice Studio translate too: app.languagesByProvider (or gallery's), else languages[].providers,
     else the language input's byProvider. nativeName shown when it differs from the English label. */
  const ca: any = cfg as any; const langSrc: any[] = Array.isArray(gal0?.languages) ? gal0.languages : Array.isArray(ca.languages) ? ca.languages : [];
  const galLangs: { code: string; label: string; nativeName?: string; providers?: string[] }[] = langSrc;
  const lbpMap: Record<string, string[]> | null = gal0?.languagesByProvider ?? ca.languagesByProvider ?? null;
  const lbp: string[] | null = Array.isArray(lbpMap?.[provider]) ? lbpMap![provider] : galLangs.some(l => Array.isArray(l.providers)) && galLangs.some(l => l.providers?.includes(provider)) ? galLangs.filter(l => l.providers?.includes(provider)).map(l => l.code) : null;
  const [langNote, setLangNote] = useState('');
  const optsFor = (fd: FieldSpec): { value: string; label?: string }[] => { const os = fd.options ?? []; if (fd.name !== 'language' || (!gal0 && !galLangs.length && !lbp)) return os;
    const ln = new Map(galLangs.map(l => [l.code, l])); return os.filter(o => !lbp || lbp.includes(o.value)).map(o => { const l = ln.get(o.value); return l ? { value: o.value, label: l.nativeName && l.nativeName !== l.label ? `${l.label} · ${l.nativeName}` : l.label } : o; }); };
  useEffect(() => { const fd = fieldSpecs.find(f => f.name === 'language'); if (!fd || !lbp) return; const os = optsFor(fd); const cur = String(fieldVals.language ?? ''); if (!os.length || os.some(o => o.value === cur)) { setLangNote(''); return; }
    const d = String(galDef.language ?? fd.default ?? ''); const next = os.some(o => o.value === d) ? d : os[0].value; setFieldVals(v => ({ ...v, language: next }));
    /* B18: say why the language changed (the new model doesn't voice the old one) */
    const nm = (c: string) => galLangs.find(l => l.code === c)?.label ?? (fd.options ?? []).find(o => o.value === c)?.label ?? c; const pv: any = tool.providers.find(x => x.id === provider);
    if (cur) setLangNote(`${pv?.displayName ?? pv?.name ?? 'This model'} doesn’t voice ${nm(cur)}, so the language is now ${nm(next)}.`); }, [provider, lbp?.join()]);
  useEffect(() => { if (!langNote) return; const t = setTimeout(() => setLangNote(''), 8000); return () => clearTimeout(t); }, [langNote]);
  /* Inputs can carry a server label (gallery apps: "Product image (optional)", "Start image", "End image (optional)"); a labelled input is shown, optional and sent. */
  const inLabel = (n: string): string | undefined => ((tool.inputs ?? []).find(i => i.name === n) as any)?.label;
  const imgLabel = inLabel('image'); const lfLabel = inLabel('lastFrame');
  /* B14 (c): Camera's start image is optional where the server says so: app.capabilities.imageOptional, then imageRequiredByProvider[provider]
     (false = optional; true = required unless every picked move is in imageOptionalPresetsByProvider[provider]). Anything missing = required. */
  const caps: any = (tool as any).app?.capabilities ?? (tool as any).capabilities ?? null;
  const imgOptional = !!caps?.imageOptional && (() => { const req = caps.imageRequiredByProvider?.[provider]; if (req === false) return true;
    const okP = caps.imageOptionalPresetsByProvider?.[provider]; return req === true && Array.isArray(okP) && picked.length > 0 && picked.every(id => okP.includes(id)); })();
  const needsImage = !imgLabel && !imgOptional && (cfg.input === 'image' || (cfg.input === 'image-optional' && !!cfg.imageModes?.includes(mode)));
  const showImage = cfg.input === 'image' || needsImage || tool.id === 'h3-video' || !!imgLabel || imgOptional;
  /* Gallery app mode switch by upload (Transitions: app.gallery.modeWhenFile {lastFrame:'["flf"]'}): adding an end frame makes it a start + end frame shot. */
  const mwf: Record<string, string> | null = (cfg as any).gallery?.modeWhenFile ?? null; const flfOn = !!(mwf?.lastFrame && lastFrame);
  /* B15 gap 4: modeWhenFile for every file (Product Shot image → edit, UGC image / presenterImage → r2v); no file = the app's locked types. */
  const presLabel = inLabel('presenterImage'); const ugcOwn = tool.id === 'app-ugc-ad' && !!presLabel && appFs.some(f => f.name === 'presenter'); const jsonArr = (v: any): string[] | null => { try { const x = JSON.parse(String(v ?? 'null')); return Array.isArray(x) ? x.map(String) : null; } catch { return null; } };
  const hasFile = (k: string) => k === 'image' ? !!image : k === 'lastFrame' ? !!lastFrame : k === 'presenterImage' ? !!presImg : k === 'video' ? !!video : false;
  const lockedTypes = jsonArr(gal0?.locked?.types); const mwfTypes = mwf ? Object.entries(mwf).filter(([k]) => hasFile(k)).map(([, v]) => jsonArr(v)).find(Boolean) ?? null : null;
  useEffect(() => { if (!mwf) return; const want = mwfTypes ?? lockedTypes; if (want && want.length && want.join() !== picked.join()) setPicked(want); }, [mwfTypes?.join(), lockedTypes?.join()]);
  /* Camera LTX presets: optional end image (sent as endImage) and a Generate audio switch (generateAudio, default on). */
  const ltxCam = tool.id === 'camera' && picked.some(x => /^ltx-/.test(x));
  const showLast = (needsLast || !!lfLabel || ltxCam) && !hid('lastFrame'); const requireLast = needsLast && !lfLabel;
  const toggle = (id: string) => cfg.modes ? setPicked([id]) : setPicked(p => p.includes(id) ? p.filter(x => x !== id) : mix > 1 ? (p.length < mix ? [...p, id] : (toast(`Mix up to ${mix}.`, 'error'), p)) : [id]);
  /* Camera library (canvas) ↔ panel picker: the grid asks for a move, the panel reports what's picked. */
  useEffect(() => { if (tool.id === 'photo-fx') announcePicked(picked); }, [picked, tool.id]);
  useEffect(() => { if (!tileTypes) return; const f = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (types.some(t => t.id === id)) setPicked(mix > 1 ? (p => p.includes(id) ? p : [...p, id].slice(-mix)) : [id]); }; addEventListener('oj:pick-type', f); return () => removeEventListener('oj:pick-type', f); }, [tileTypes, types.length, mix]);
  useEffect(() => { if (tileTypes) dispatchEvent(new CustomEvent('oj:types-state', { detail: picked })); }, [tileTypes, picked.join()]);
  useEffect(() => { if (!tileTypes) return; const f = () => dispatchEvent(new CustomEvent('oj:types-state', { detail: picked })); addEventListener('oj:types-ask', f); return () => removeEventListener('oj:types-ask', f); }, [tileTypes, picked.join()]);

  const refPics = tool.id === 'h3-video' ? Math.min(vrefs.refs?.length ?? 0, vCaps.current?.refs ?? Infinity) : 0; /* Reference mode: picture references count as the picture (refFit hasPicture) */
  const missing: string[] = [];
  if (isLip) { if (!portrait) missing.push('a portrait'); if (!speech) missing.push('speech audio'); }
  else if (cfg.input === 'video' ? !video && !(cvAny && cvAudio) : needsImage && !hasPicture(mode, !!image, refPics)) missing.push(cfg.input === 'video' ? (cvApp || cvAny ? CV_NEED : 'a valid video') : 'an image');
  if (requireLast && !lastFrame) missing.push('an end frame');
  /* Keyframes (2026-10-27): 2–5 frames, each at its time (the bar keeps the times valid) */
  if (tool.id === 'h3-video' && mode === 'keyframes') { const n = vrefs.keyframes?.length ?? 0; if (n < 2) missing.push(n ? 'Add one more frame' : 'Add 2 to 5 frames'); }
  if (isExtend && !prompt.trim()) missing.push('what happens next');
  if (cfg.modes && !prompt.trim() && !cfg.promptOptionalModes?.includes(mode) && (tool.inputs ?? []).find((i: any) => i.name === 'prompt')?.required !== false && !(Array.isArray(gal?.required) && gal.required.length > 0 && !gal.required.flat().includes('prompt'))) missing.push('a prompt'); /* B21 B3: apps whose server required list leaves out the prompt (Transitions: image + end image) run without one (checked: a real mock POST with no prompt is accepted) */ /* B21: the server marks the prompt optional on Relight and UGC Ad */
  if (!picked.length && types.length) missing.push(tool.id === 'photo-fx' ? 'an effect' : tool.id === 'camera' ? 'a camera move' : 'a type');
  // L6: Inpaint needs a painted mask (the server refuses without one).
  if ((tool.id === 'app-inpaint' || (tool.id === 'create-image' && mode === 'inpaint')) && !mask) missing.push('a mask (paint over the area to change)');
  // L3: a start frame plus video/audio refs is not a valid H3 combination (refs are Reference-mode only).
  const refAV = (vrefs.refVideos?.length ?? 0) + (vrefs.refAudios?.length ?? 0);
  const conflict = tool.id === 'h3-video' && !!image && refAV > 0 && mode !== 'r2v' ? 'A start frame can’t be combined with video or audio references. Remove the start frame to use them (Reference mode), or remove the references.' : null;
  const mentions = useMentions(prompt, setPrompt, { images: tool.id === 'h3-video' && mode === 'keyframes' ? vrefs.keyframes?.length ?? 0 /* Keyframes: @imageN = frame N */ : tool.id === 'create-image' ? (image ? 1 + extraRefs.length : 0) /* @image1 = the photo, @image2… = the extra references */ : tool.id === 'h3-video' && mode === 'r2v' ? (image ? 1 : 0) + refPics /* Reference mode: the start picture, then the picture references (the server counts image + refs) */ : (needsImage || !!imgLabel || imgOptional) && image ? 1 : 0, videos: cfg.input === 'video' && video ? 1 : tool.id === 'h3-video' && mode === 'r2v' ? Math.min(vrefs.refVideos?.length ?? 0, vCaps.current?.refVideos ?? Infinity) : 0 });
  /** Create Image: removing attached image n (1-based) renumbers later @image mentions and drops the removed one's. */
  const dropMention = (n: number) => setPrompt(p => removeImageMention(p, n));
  /* QA #10: say which mention is broken ("@image2 has no photo (1 attached)…"), not only "valid @ mentions" */
  if (promptOn && !mentions.ok) { const mi = tool.id === 'create-image' ? mentions.issues[0] : undefined;
    missing.push(mi ? `Add a photo for ${mi.mention} (${mi.code === 'stale' ? 'its photo was removed' : 'it has none'}), or delete the mention` : 'valid @ mentions'); }
  /* prompt grammar (2026-10-26): a prompt over the model's cap is refused here with the cap, never cut on the way (shared/promptRefs.ts; the server refuses it too) */
  { const over = promptOn ? promptLimitIssue(engineModelKey(tool.id, provider, (tool.app as any)?.gallery?.base), prompt) : null; if (over) missing.push(`Shorten the prompt: ${over.replace(/\. Shorten it or pick another model$/, '')}`); }
  /* A cinema-based app with Auto locked off needs a scene description (the server rejects an empty prompt). */
  useEffect(() => { if (autoActive && prompt.trim()) setAutoOn(false); }, [prompt]); // a Recreate/example prompt turns Auto off
  if ((promptNeeded || (promptOpt && autoP?.whenEmpty && !autoActive)) && !prompt.trim()) missing.push(promptNeeded ? 'a prompt (describe the scene)' : 'a prompt, or turn Auto on');
  { const reqImg = (Array.isArray(gal?.required) ? gal.required : []).some((r: any) => { const ns = Array.isArray(r) ? r : []; return ns.length > 0 && ns.every((n: string) => n === 'image' || n === 'refs'); }); if (reqImg && !image && !extraRefs.length && !missing.some(m => /image|photo/i.test(m))) missing.unshift('a subject photo'); } // B14: gallery.required [[image, refs]] = one photo needed
  /* QA #4: an app that takes a photo OR a description (gallery.fileOrPrompt, Product Shot) needs one of them; the server refuses neither. */
  { const fop = gal?.fileOrPrompt as { file: string } | null | undefined; if (fop && !hasFile(fop.file) && !prompt.trim()) missing.push('a product photo or a description'); }
  /* B22 T31: your own voice needs at least one sample. */
  if (cvApp && String(fieldVals.voice) === 'clone' && !voiceSample) missing.push('Add a voice sample');
  /* B21 T26: Transitions name the missing scene in full. */
  if (tool.id === 'app-transition') { if (!image) missing.push('a start image'); if (!lastFrame) missing.push('an end image'); } // BH12: nouns, so it reads 'Missing: a start image, an end image'
  /* B15 gap 5: string entries in gallery.required ('image', 'lastFrame', 'video', 'presenterImage') feed Missing, named by the input's label. */
  ((Array.isArray(gal?.required) ? gal.required : []) as any[]).filter(r => typeof r === 'string').forEach((n: string) => { if (hasFile(n) || !['image', 'lastFrame', 'video', 'presenterImage'].includes(n)) return;
    if (n === 'video') { if (cvAny && cvAudio) return; const w = cvApp || cvAny ? CV_NEED : 'a valid video'; if (!missing.includes(w)) missing.push(w); return; }
    if (n === 'image' && missing.some(m => /\b(image|photo|keyframe)\b/i.test(m) && !/end/i.test(m))) return; if (n === 'lastFrame' && missing.some(m => /end (frame|image)/i.test(m))) return;
    const lab = String(inLabel(n) ?? (n === 'lastFrame' ? 'end image' : n === 'image' ? 'image' : 'presenter photo')).replace(/\s*\(optional\)\s*/i, '').trim().toLowerCase(); missing.push(`${/^[aeiou]/.test(lab) ? 'an' : 'a'} ${lab}`); });
  const srcSec = cfg.input === 'video' ? Math.min(video?.duration ?? (cvAny && cvAudio?.sec ? cvAudio.sec : 8), LIMITS.maxSec) : duration;
  /* FLUX 3 Upscaler (BFL): caps from /api/routes; price from GET /api/tools/upscale/price (quote = charge). */
  const [upRoutes, setUpRoutes] = useState<any[]>([]);
  useEffect(() => { if (!isUpscale) return; fetch(`/api/routes?${new URLSearchParams({ ...quoteParams(), toolId: tool.id })}`).then(r => r.ok ? r.json() : null).then(d => setUpRoutes(d?.routes ?? [])).catch(() => undefined); }, [tool.id]);
  const bflRoute: any = isUpscale ? upRoutes.find((m: any) => m.modelId === provider)?.routes?.find((r: any) => r.kind === 'direct' && !r.caps?.comingSoon) : null;
  const bfl: any = bflRoute?.caps?.factor ? bflRoute.caps : null;
  const bflModes: string[] = bfl?.mode ?? [];
  useEffect(() => { if (bfl && bflModes.length && !bflModes.includes(picked[0])) setPicked([bflModes[0]]); }, [provider, bflModes.join()]);
  const scaleList: number[] = ((cfg as any).scalesByProvider?.[provider] ?? bflRoute?.caps?.scales ?? (cfg as any).scales ?? []) as number[];
  const bflScales: number[] = bfl ? scaleList : [];
  useEffect(() => { if (isUpscale && scaleList.length && !scaleList.includes(vScale)) setFieldVals(v => ({ ...v, scale: String(scaleList.includes(2) ? 2 : scaleList[0]) })); }, [provider, scaleList.join()]);
  const bflIssues: string[] = [];
  if (bfl && video) {
    const [mw, mh] = String(bfl.maxSource ?? '').split('x').map(Number); const long = Math.max(video.w, video.h), short = Math.min(video.w, video.h);
    if (bfl.maxSeconds && video.duration > bfl.maxSeconds + 0.05) bflIssues.push(`a clip of ${bfl.maxSeconds}s or less`);
    if (mw && mh && (long > Math.max(mw, mh) || short > Math.min(mw, mh))) bflIssues.push(`a source of ${bfl.maxSource} or smaller`);
    if (bfl.maxMB && video.file.size > bfl.maxMB * 1024 * 1024) bflIssues.push(`a file of ${bfl.maxMB} MB or less`);
  }
  if (bfl && (vScale < bfl.factor.min || vScale > bfl.factor.max)) bflIssues.push(`a factor of ${bfl.factor.min}–${bfl.factor.max}×`);
  missing.push(...bflIssues);
  const bflOut = bfl && video ? (() => { const k = Math.min(vScale || 2, 3840 / Math.max(video.w, video.h)); const ev = (n: number) => Math.max(2, Math.round(n * k / 2) * 2); return { width: ev(video.w), height: ev(video.h) }; })() : null;
  const clipSrc = useClipSource(); const [upQ, setUpQ] = useState<any>(null); /* A quote 400 carries priceAvailable:false / credits:null: keep it and block Generate as 'Price unavailable' instead of showing 0 or a local estimate. */
  const upUnpriced = !!upQ && (upQ.priceAvailable === false || upQ.credits === null); const bflCredits: number | null = upQ && !upUnpriced ? (shownCredits(upQ) ?? 0) : null; const upKeyGate = upQ && upQ.needsKey === true && upQ.runnable === false ? (upQ.noProvider ?? { error: upQ.reason ?? 'Add an API key.' }) : null;
  const { route: pinU } = useRoute(provider ?? ''); useEffect(() => { if (!isUpscale) { setUpQ(null); return; } const q = new URLSearchParams({ ...quoteParams(), provider, ...pinQ(provider), scale: String(vScale || 2), ...(bfl ? { mode: picked[0] ?? 'precise' } : {}), ...(video ? { width: String(video.w), height: String(video.h), sourceResolution: `${Math.min(video.w, video.h)}p`, seconds: String(Math.round(video.duration * 100) / 100) } : {}) }); if (!video) setClipSeconds(q, 0, clipSrc, quoteParams()); /* B15: example= / sample= before the clip loads */
    const ac = new AbortController(); fetch(`/api/tools/${tool.id}/price?${q}`, { signal: ac.signal }).then(r => r.json().catch(() => null).then(normalizeQuote).then(d => r.ok || d?.priceAvailable === false ? d : null)).then(d => setUpQ(d ?? null)).catch(() => undefined); return () => ac.abort(); }, [isUpscale, provider, pinU, vScale, picked[0], video?.w, video?.h, video?.duration]);
  /** Quote = charge for every non-upscale app (Extend, Transitions, UGC Ad, …): the server's /price, not the client estimate. */
  /* Per-model clip lengths (providers[].durations; absent = the tool's own list). Whole seconds only; a model change snaps to the nearest allowed. */
  const durList: number[] = ((cfg as any).durationsByProvider?.[provider] ?? (tool.providers.find(x => x.id === provider) as any)?.durations ?? cfg.durations ?? []).map(Number).filter((n: number) => Number.isInteger(n));
  const lastProv = useRef(provider);
  useEffect(() => { const changed = lastProv.current !== provider; lastProv.current = provider; if (!cfg.durations || !durList.length) return; const kept = keepDur.current; keepDur.current = null; if (kept != null && durList.includes(kept)) { if (kept !== duration) setDuration(kept); return; } const def = Number((cfg as any).defaultDurationByProvider?.[provider]);
    /* Same as Director: a provider change snaps to its default; otherwise only an out-of-list value moves (to the nearest). */
    const next = changed && durList.includes(def) ? def : durList.includes(duration) ? duration : durList.includes(def) ? def : durList.reduce((a, b) => Math.abs(b - duration) < Math.abs(a - duration) ? b : a);
    if (next !== duration) setDuration(next); }, [provider, durList.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Camera: frame shape per model from the aspect input's byProvider list; a model that can't do the current shape falls back to Auto. */
  /* Photo FX too: the server's aspect field lists shapes per engine (byProvider), falling back to its options. */
  const aspIn: any = (tool.inputs ?? []).find(i => i.name === 'aspect'); const perModelAsp = tool.id === 'camera' || tool.id === 'photo-fx';
  const camAspects: string[] = perModelAsp ? (((aspIn?.byProvider?.[provider] as string[] | undefined) ?? (tool.id === 'photo-fx' ? aspIn?.options as string[] | undefined : undefined)) ?? []) : [];
  useEffect(() => { if (!perModelAsp) return; const cur = String(fieldVals.aspect ?? 'auto'); if (cur !== 'auto' && !camAspects.includes(cur)) setFieldVals(v => ({ ...v, aspect: 'auto' })); }, [provider, camAspects.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Camera main-area upload card: it hands files to this panel's keyframe input and shows what the panel holds. */
  const onImageRef = useRef(onImage); onImageRef.current = onImage;
  useEffect(() => { if (tool.id !== 'camera') return; const f = (e: Event) => { const fs = (e as CustomEvent<File[]>).detail; if (fs?.length) onImageRef.current(fs); }; const ask = () => dispatchEvent(new CustomEvent('oj:keyframe-state', { detail: imageRef.current?.url ?? null })); addEventListener('oj:keyframe', f); addEventListener('oj:keyframe-ask', ask); return () => { removeEventListener('oj:keyframe', f); removeEventListener('oj:keyframe-ask', ask); }; }, [tool.id]);
  useEffect(() => { if (tool.id === 'camera') dispatchEvent(new CustomEvent('oj:keyframe-state', { detail: image?.url ?? null })); }, [tool.id, image?.url]);
  const rqTick = useRequoteTick(); const [gq, setGq] = useState<any>(null);
  const { route: pinG } = useRoute(camCardProv ?? provider ?? ''); useEffect(() => { if (isUpscale || awf || tool.id === 'voice' || tool.id === 'h3-video' || tool.id === 'create-image') { setGq(null); return; } if (cfg.durations && durList.length && !durList.includes(duration)) return; /* wait for the snap: no 400 quote */ const q = new URLSearchParams({ ...quoteParams(), provider: camCardProv ?? provider, ...pinQ(camCardProv ?? provider), ...(ignoresRes(tool.id) ? {} : { resolution }), types: picked.join(','), seconds: String(Math.round(srcSec * 100) / 100), ...(cfg.durations ? { duration: String(duration) } : {}), ...(isExtend ? { extendSeconds: String(extSec) } : {}), ...(imgN > 1 ? { n: String(imgN) } : {}), ...(fieldVals.quality != null ? { quality: String(fieldVals.quality) } : {}), ...(image ? { image: '1' } : {}) }); if (cfg.input === 'video' && !video) setClipSeconds(q, 0, clipSrc, quoteParams()); /* B15: no clip yet → example= or the server's own estimate, not a silent 8 s */
    const ac = new AbortController(); const t = setTimeout(() => fetch(`/api/tools/${tool.id}/price?${q}`, { signal: ac.signal }).then(readQuoteBody).then(d => setGq(d ?? null)).catch(() => undefined), 250); return () => { clearTimeout(t); ac.abort(); }; }, [rqTick, isUpscale, provider, camCardProv, pinG, resolution, picked.join(','), srcSec, duration, extSec, imgN, fieldVals.quality, !!image]);
  /* B15 gap 7: Camera 400 image_required (quote or submit): a missing start image, the server's sentence, and the text-capable routes (textProviders) to pick instead. */
  const [subImgReq, setSubImgReq] = useState<{ error: string; textProviders: string[] } | null>(null); useEffect(() => setSubImgReq(null), [image, provider, picked.join()]);
  const imgReq: { error: string; textProviders: string[] } | null = !image ? (gq?.code === 'image_required' || (gq?.missingInput === 'image' && gq?.runnable === false) /* B20: priced input block */ ? { error: String(gq.blockedReason ?? gq.error ?? ''), textProviders: Array.isArray(gq.textProviders) ? gq.textProviders : [] } : subImgReq) : null;
  if (imgReq && !missing.some(m => /\b(image|photo|keyframe)\b/i.test(m))) missing.unshift('a start image');
  const gqUnpriced = !isUpscale && gq?.code !== 'image_required' ? unpricedReason(gq) : null; const gqCredits: number | null = !isUpscale && gq && !gqUnpriced && shownCredits(gq);
  const quoteDemo = demoMessage(isUpscale ? upQ : gq);
  const running = ownJobs.find(active);
  const current = ownJobs.find(j => j.id === sel) ?? ownJobs[0];
  const rootOf = (j?: JobState) => j ? (j.parentId || j.id) : '';
  const setupJobs = ownJobs.filter(j => current && rootOf(j) === rootOf(current));
  useEffect(() => { if (ownJobs[0] && !sel) setSel(ownJobs[0].id); }, [ownJobs[0]?.id, sel]);

  const [subIssues, setIssues] = useState<SubmitIssue[]>([]); const issues = withQuoteIssues(subIssues, gq) /* B28a: unsupported_aspect from the quote too */; const subDur = issues.find(i => i.code === 'invalid_duration'); const durErr = subDur ? `${subDur.message.trim()} Nothing was charged.` : gq?.code === 'invalid_duration' ? String(gq.error ?? gq.issues?.[0]?.message ?? '') : ''; const [slotFiles, setSlotFiles] = useState<Record<string, File[]>>({}); const [tryTool, setTryTool] = useState<string | null>(null);
  /* B27: an issue's 'Use 9:16' offer (unsupported_aspect allowed values) sets that field here and clears the issue */
  useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent<{ field?: string; value?: string }>).detail; if (!d?.field || d.value == null) return; setFieldVals(v => ({ ...v, [d.field!]: String(d.value) })); setIssues(is => is.filter(i => i.field !== d.field)); }; addEventListener(FIX_FIELD_EVT, f); return () => removeEventListener(FIX_FIELD_EVT, f); }, []);
  /* Precheck (audit B1): multipart POST /api/precheck, debounced as inputs change; blocking keeps Generate disabled with the reason. */
  const pcOn = ['create-image', 'h3-video', 'voice', 'soul'].includes(tool.id);
  const [pc, setPc] = useState<{ blocking?: boolean; warnings?: { message: string; severity: string }[] } | null>(null);
  const [pcBusy, setPcBusy] = useState(false);
  useEffect(() => {
    if (!pcOn) return; const fd = new FormData(); fd.append('toolId', tool.id); let n = 0;
    const add = (k: string, f?: File | Blob | null) => { if (f) { fd.append(k, f, (f as File).name ?? k); n++; } };
    if (image) add('image', image.file); if (video) add('video', video.file); if (portrait) add('image', portrait.file);
    Object.values(slotFiles).forEach(fs => fs.forEach(x => add('refs', x)));
    if (voiceSample && String(fieldVals.voice) === 'clone') { add('samples', voiceSample); voiceExtra.forEach(x => add('samples', x)); }
    if (!n) { setPc(null); setPcBusy(false); return; }
    setPcBusy(true); let live = true; const t = setTimeout(() => precheck(fd).then(r => { if (live) { setPc(r as any); setPcBusy(false); } }), 400);
    return () => { live = false; clearTimeout(t); };
  }, [pcOn, image, video, portrait, slotFiles, voiceSample, voiceExtra, fieldVals.voice]);
  if (pcOn && pcBusy) missing.push('checking your files');
  if (pcOn && pc?.blocking) missing.push(`usable files (${(pc.warnings?.find(w => w.severity === 'warn') ?? pc.warnings?.[0])?.message ?? 'a file can’t be used'})`);
  const submit = async (fd: FormData, runTool: string = tool.id /* Create Image: a picked workflow runs on its own tool (app-relight…) */) => {
    const ph: JobState = { id: '', toolId: runTool, status: 'queued', stage: 'uploading', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, warnings: [], parentId: (fd.get('parentId') as string) || null };
    add(ph); setIssues([]); setTryTool(null);
    addBrandField(runTool, fd); /* Brand Kit: brandKit=<id> when Brand is on for this tool (shared/brandStore); the server adds the words */
    try { const r = await createJob(runTool, fd, { showsIssues: true }); fdById.current.set(r.id, cloneForm(fd)); r.warnings?.forEach(w => toast(w, 'warn')); setJobs(js => js.some(j => j.id === r.id) ? js.filter(j => j !== ph) : js.map(j => j === ph ? { ...ph, id: r.id, provider: r.provider, input: { seed: r.seed } } : j)); setSel(r.id); setTimeout(refresh, 50); return r.id; }
    catch (e: any) { setJobs(js => js.filter(j => j !== ph)); setIssues(issuesOf(e)); setTryTool(e?.hint?.toolId ?? null); if (e?.code === 'image_required') setSubImgReq({ error: String(e.message ?? ''), textProviders: Array.isArray(e.textProviders) ? e.textProviders : [] }); if (!issuesOf(e).some((i: any) => i?.code === 'invalid_duration')) toast(e.message || 'Generation failed.', 'error'); return null; }
  };
  const generate = async (draft = false, more: Record<string, string> = {}) => {
    if (prefill.frameHandoff) { toast('Load the last frame, or cancel the handoff before generating.', 'info'); return; }
    if (isSubmitting(tool.id)) return; // [EDGE #6] one job per click (ImageCanvas has its own button)
    const f = { picked, prompt: autoActive ? '' : prompt, autoActive, enhance, duration, steps, resolution, provider: camCardProv ?? provider, video, image, fieldVals, appVals };
    const build = (s: number, parentId = '', extra: Record<string, string> = {}) => {
      const fd = new FormData();
      fd.append('types', JSON.stringify(f.picked)); if (!f.autoActive) fd.append('prompt', f.prompt); if (!ignoresRes(tool.id)) fd.append('resolution', f.resolution); fd.append('seed', String(s));
      if (cfg.enhance && tool.id !== 'h3-video' /* Create Video keeps its ✨ in fieldVals.enhance (off unless turned on), sent below */) fd.append('enhance', f.enhance ? '1' : '0'); if (cfg.durations) fd.append('duration', String(f.duration)); if (cfg.steps) fd.append('steps', String(f.steps));
      if (f.provider) fd.append('provider', f.provider); if (parentId) fd.append('parentId', parentId);
      Object.entries(slotFiles).forEach(([k, fs]) => fs.forEach(x => fd.append(k, x, x.name)));
      Object.entries(f.appVals).forEach(([k, v]) => { if (v !== '' && v != null) fd.append(k, v); });
      Object.entries(f.fieldVals).forEach(([k, v]) => { const sp = fieldSpecs.find(x => x.name === k) as any; if (sp && !fieldShown(sp)) return; if (k === 'keyframeTimes' && f.picked[0] !== 'keyframes') return; fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)); });
      if (isLip) { if (portrait) fd.append('image', portrait.file); if (speech) fd.append('speech', speech, speech.name); }
      if (showLast && lastFrame) fd.append(ltxCam && !needsLast && !lfLabel ? 'endImage' : 'lastFrame', lastFrame.file);
      if (ltxCam) fd.append('generateAudio', genAudio ? 'true' : 'false'); if (presLabel && presImg) fd.append('presenterImage', presImg.file, presImg.file.name);
      if (isExtend) fd.set('extendSeconds', String(extSec));
      if (cfg.input === 'video' && f.video && !isLip) fd.append('video', f.video.file); else if (cvAny && cvAudio) fd.append('audio', cvAudio.file, cvAudio.file.name); if (cfg.input !== 'video' && (needsImage || !!imgLabel || imgOptional) && f.image) fd.append('image', f.image.file); if (tool.id === 'create-image' && f.image && !(mask && f.picked[0] === 'inpaint')) for (const r of extraRefs.slice(0, Math.max(0, (imageCap.current ?? (extraRefs.length + 1)) - 1))) fd.append('refs', r.file);
      if (hasStyle && style) fd.append('style', style);
      if (voiceSample && String(f.fieldVals.voice) === 'clone') { fd.append('voiceAudio', voiceSample, voiceSample.name); voiceExtra.forEach(x => fd.append('voiceAudio', x, x.name)); }
      if (mask && ((cfg as any).maskModes ?? []).includes(f.picked[0])) fd.append('mask', dataUrlToBlob(mask), 'mask.png');
      /* Keyframes (2026-10-27): its frames go as `keyframes` (with keyframeTimes) and nothing else; the other modes never send them */
      if (tool.id === 'h3-video') Object.entries(vrefs).forEach(([k, l]) => { if ((k === 'keyframes') !== (f.picked[0] === 'keyframes')) return; l.slice(0, vCaps.current?.[k] ?? l.length /* a model switch to a lower limit keeps the extras on the bar, marked; they aren't sent */).forEach(r => fd.append(k, r.file, r.file.name)); });
      if (q.mockFail) fd.set('simulate', q.mockFail);
      Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
      return fd;
    };
    const d: Record<string, string> = { ...(draft ? { draft: '1' } : {}), ...more };
    const rid = await submit(build(seed, '', d));
    if (rid) last.current = { build: (s, extra = {}) => build(s, rid, { ...d, ...extra }), root: rid };
    return rid; /* Compare models: which runs started */
  };
  /** After a reload the in-memory builder is gone: rebuild a text-only job from its stored input (same model, prompt,
   *  types, resolution, duration). Jobs that used uploaded files can't be rebuilt here (the browser no longer has them). */
  const fromJob = (j: JobState | undefined, s: number): FormData | null => {
    const inp: any = (j as any)?.input; if (!j?.id || !inp) return null;
    if (Object.entries(inp).some(([k, v]) => /(Path|Paths|Url|Urls)$/.test(k) && (Array.isArray(v) ? v.length : !!v))) return null;
    const fd = new FormData(); fd.append('types', JSON.stringify(inp.types ?? picked)); fd.append('prompt', String(inp.prompt ?? '')); if (!ignoresRes(tool.id)) fd.append('resolution', String(inp.resolution ?? resolution)); fd.append('seed', String(s));
    if (cfg.durations && inp.duration != null) fd.append('duration', String(inp.duration)); if (cfg.steps && inp.steps != null) fd.append('steps', String(inp.steps)); if (cfg.enhance && inp.enhance != null) fd.append('enhance', inp.enhance ? '1' : '0');
    if (j.provider) fd.append('provider', j.provider); fd.append('parentId', j.id); if (hasStyle && inp.style) fd.append('style', String(inp.style));
    return fd;
  };
  const rerun = (s: number) => { if (last.current) return submit(last.current.build(s)); const fd = fromJob(current, s); if (fd) return submit(fd); toast(current ? 'This run used uploaded files that aren’t in this tab any more. Add them again, then Generate.' : 'Generate once first.', current ? 'warn' : 'info'); };
  const more = () => rerun(Math.floor(Math.random() * 1e6));
  const sameSeed = () => rerun(Number(current?.input?.seed ?? seed));
  const finalRes = resolution === '480p' ? (resList.find(r => r !== '480p') ?? '720p') : resolution;
  const renderFinal = () => last.current && current?.draft ? submit(last.current.build(Number(current.input?.seed ?? seed), { draft: '0', fromDraft: current.id, resolution: finalRes })) : toast('Make a draft in this session first.');
  const groups = [...new Set(types.map(t => t.group ?? ''))];
  const isVideoOut = (j?: JobState) => !!j?.resultUrl && /\.(mp4|webm|mov)(\?|$)/i.test(j.resultUrl);
  const extendBtns = (j?: JobState) => isVideoOut(j) && j ? <span className="ext-btns" role="group" aria-label="Extend this clip">{[5, 10].map(n => <button key={n} type="button" className="btn ext-btn" data-testid={`extend-${n}s`} onClick={() => navigate(withExtendModel(`/tools/h3-extend?fromJob=${encodeURIComponent(j.id)}&out=0&ext=${n}`, j))}>+{n}s</button>)}</span> : null;
  /* B18 (PB): the Model card names what the picked move runs, from the preset's modelNameByProvider / modelName (no name parsing).
     A move the current model can't run (an H3-only move on Auto) runs on the move's own model: the card follows it (name, picture, route). */
  const camModel: string | undefined = !camT ? undefined : (String(camT.modelNameByProvider?.[camCardProv ?? provider] ?? camT.modelName ?? '').trim() || undefined);
  const audioBadge = (cfg as any).audio && (cfg as any).audioBadge && !hid('audio') ? <span className="h3-audio-badge" data-testid="h3-audio-badge" title="This model makes sound with the video"><span aria-hidden>🔊</span>{(cfg as any).audioBadge}</span> : null;

  /* B21 (T25): Relight is upload-first. The canvas box takes the photo's shape and keeps it from upload to result. */
  const relight = tool.id === 'app-relight'; const rlAr = imgDims ? `${imgDims.w} / ${imgDims.h}` : '4 / 3';
  /* only a run from this visit (or one picked below) replaces the canvas; an older history job doesn't hide the upload */
  const stageJob = relight && current && !fdById.current.has(current.id) && !rlPicked ? undefined : current;
  const stageEl = ((current) => <>
      {relight && !current && <div className="rl-canvas" data-testid="relight-canvas" style={{ aspectRatio: rlAr }}>{image
        ? <img src={image.url} alt="Your photo" />
        : <label className="rl-drop" data-testid="relight-drop"><input type="file" accept={IMAGE_ACCEPT} onChange={e => { const f = e.target.files?.[0]; if (f) onImage([f]); e.target.value = ''; }} /><b>Add a photo to relight</b><span className="helper">PNG, JPG or WEBP · the subject, pose and framing stay</span></label>}</div>}
      {/* B22 T27: UGC results sit in a 9:16 phone frame; the empty frame is reserved, so the result never moves the page. */}
      {tool.id === 'app-ugc-ad' ? <div className="ugc-stage" data-testid="ugc-stage">{!current && <div className="phone-frame" data-testid="phone-frame"><div className="phone-empty"><b>9:16</b><span>Your vertical ad shows here</span></div></div>}
      {current && <FailureCard job={current} onRetry={fdById.current.has(current.id) ? () => submit(cloneForm(fdById.current.get(current.id)!)) : undefined} />}
      {current && active(current) && <ResultPlaceholder title="Your result is ready" lineage={!!current.parentId} compare={!!(current.input?.videoUrl ?? video?.url) && !continuesInput(current) /* Extend: no before / after */} audioChip={cfg.input === 'video' && cfg.kind !== 'soundtrack' && cfg.kind !== 'image'} width={1080} height={1920} />}
      {current?.status === 'done' && <ResultView reserve key={current.id} job={current} beforeImage={relight ? (current.input?.imageUrl ?? image?.url) : undefined} beforeUrl={current.input?.videoUrl ?? video?.url ?? current.resultUrl!} title="Your result is ready" audio={cfg.input === 'video' && cfg.kind !== 'soundtrack'}
        extraActions={<>{current.draft && <button className="btn btn-primary" onClick={renderFinal}>Render final ({finalRes}, same seed {current.input?.seed})</button>}
          <button className="btn" onClick={more}>Generate more (new seeds)</button><button className="btn" onClick={sameSeed}>Re-run same seed</button>{extendBtns(current)}</>} />}
      </div> : <>
      {current && <FailureCard job={current} onRetry={fdById.current.has(current.id) ? () => submit(cloneForm(fdById.current.get(current.id)!)) : undefined} />}
      {current && active(current) && <ResultPlaceholder title="Your result is ready" lineage={!!current.parentId} compare={!!(current.input?.videoUrl ?? video?.url) && !continuesInput(current) /* Extend: no before / after */} audioChip={cfg.input === 'video' && cfg.kind !== 'soundtrack' && cfg.kind !== 'image'} width={current.input?.width ?? video?.w ?? (relight ? imgDims?.w : undefined)} height={current.input?.height ?? video?.h ?? (relight ? imgDims?.h : undefined)} />}
      {current?.status === 'done' && <ResultView reserve key={current.id} job={current} beforeImage={relight || tool.id === 'image-upscale' /* BH12 T15: before/after on the user's own photo */ ? (current.input?.imageUrl ?? image?.url) : undefined} beforeUrl={current.input?.videoUrl ?? video?.url ?? current.resultUrl!} title="Your result is ready" audio={cfg.input === 'video' && cfg.kind !== 'soundtrack'}
        extraActions={<>{current.draft && <button className="btn btn-primary" onClick={renderFinal}>Render final ({finalRes}, same seed {current.input?.seed})</button>}
          <button className="btn" onClick={more}>Generate more (new seeds)</button><button className="btn" onClick={sameSeed}>Re-run same seed</button>{extendBtns(current)}</>} />}
      </>}
      <VersionGrid jobs={setupJobs} selected={current?.id ?? ''} onSelect={id => { setSel(id); setRlPicked(true); }} onMore={more} />
    </>)(stageJob);
  if (awf) {
    return <AudioPage tool={tool} tools={tools} wf={awf} provider={provider} setProvider={setProvider} prompt={prompt} setPrompt={setPrompt} promptRef={promptRef} duration={duration} setDuration={setDuration}
      fieldVals={fieldVals} setFieldVals={setFieldVals as any} fieldDefaults={fieldDefaults} langOpts={(() => { const lf = fieldSpecs.find(f => f.name === 'language'); return lf ? optsFor(lf) : undefined; })()} langNote={langNote}
      video={video} setVideo={setVideo} clip={cvAny ? cvAudio : null} setClip={setCvAudio} song={slotFiles.audio?.[0] ?? null} setSong={f => setSlotFiles(m => { const n = { ...m }; if (f) n.audio = [f]; else delete n.audio; return n; })}
      samples={voiceSample ? [voiceSample, ...voiceExtra] : []} setSamples={fs => { setVoiceSample(fs[0] ?? null); setVoiceExtra(fs.slice(1)); }}
      busy={submittingNow} issues={issues} checks={missing.filter(m => /^(checking your files|usable files)/.test(m))} onGenerate={extra => generate(false, extra)} jobs={jobs} />;
  }
  if (tool.id === 'voice') {
    return <AudioStudio tool={tool} langOpts={(() => { const lf = fieldSpecs.find(f => f.name === 'language'); return lf ? optsFor(lf) : undefined; })()} langNote={langNote} mode={mode || 'voiceover'} setMode={id => setPicked([id])} provider={provider} setProvider={setProvider} prompt={prompt} setPrompt={setPrompt} promptRef={promptRef}
      fieldVals={fieldVals} setFieldVals={setFieldVals as any} fieldDefaults={fieldDefaults} video={video} setVideo={setVideo} clip={cvAny ? cvAudio?.file ?? null : undefined} setClip={cvAny ? (f => setCvAudio(f ? { file: f } : null)) : undefined} samples={voiceSample ? [voiceSample, ...voiceExtra] : []} setSamples={fs => { setVoiceSample(fs[0] ?? null); setVoiceExtra(fs.slice(1)); }}
      portrait={portrait} setPortrait={setPortrait} speech={speech} setSpeech={setSpeech} busy={submittingNow} issues={issues} workflowChip={location.pathname === VIDEO_PAGE ? <VideoWorkflowChip /> : undefined}
      onGenerate={() => generate(false)} jobs={jobs} stage={stageEl} onSelect={setSel} selected={current?.id} />;
  }
  /* Generate Video (2026-10-24): results are the shared feed (ui/video/VideoFeed); what the old stage offered under a clip sits in the result
   * viewer's More menu. Opening a clip selects it (onSelect → sel), so these act on the clip on screen, like the stage's buttons did. */
  const videoViewerActions = (j: JobState, close: () => void) => { const act = (f: () => unknown) => () => { close(); void f(); };
    return <>
      {j.draft && <button type="button" className="am-item" role="menuitem" data-testid="vv-render-final" onClick={act(renderFinal)}>Render final<small>{finalRes}, same seed {j.input?.seed}</small></button>}
      <button type="button" className="am-item" role="menuitem" data-testid="vv-more" onClick={act(more)}>Generate more<small>New seeds</small></button>
      <button type="button" className="am-item" role="menuitem" data-testid="vv-same-seed" onClick={act(sameSeed)}>Re-run same seed</button>
      {isVideoOut(j) && [5, 10].map(n => <button key={n} type="button" className="am-item" role="menuitem" data-testid={`extend-${n}s`} onClick={goClick(withExtendModel(`/tools/h3-extend?fromJob=${encodeURIComponent(j.id)}&out=0&ext=${n}`, j), close)}>Extend +{n}s</button>)}
    </>; };
  if (tool.id === 'h3-video') {
    return <VideoStudio tool={tool} mode={mode} setMode={id => setPicked([id])} autoMode={id => { if (id !== mode) autoModeSwitch.current = true; setPicked([id]); }} provider={provider} setProvider={setProvider}
      image={image} onImage={onImage} clearImage={() => { prefill.cancelFrameHandoff(); setImage(null); dropMention(1); /* the start photo is image 1: later mentions move down, its own show as @image? (same as removing a reference) */ }} imgErr={imgErr} lastFrame={lastFrame} setLastFrame={setLastFrame}
      frameHandoff={prefill.frameHandoff} onFrameImageReady={prefill.frameImageReady} onCancelFrameHandoff={prefill.cancelFrameHandoff} onRetryFrameHandoff={prefill.retryFrameHandoff}
      sameSeed={sameSeedEl} suggestPrompt={hoPrompt && !prompt ? hoPrompt : ''} prompt={prompt} setPrompt={setPrompt} promptRef={promptRef} duration={duration} setDuration={setDuration} resolution={resolution} setResolution={setResolution}
      quality={String(fieldVals.quality ?? 'quality')} setQuality={v => setFieldVals(f => ({ ...f, quality: v }))}
      missing={missing} conflict={conflict} busy={submittingNow} issues={issues}
      fv={fieldVals} setFv={(k, v) => setFieldVals(f => { const n = { ...f }; if (v === '' || v == null) delete n[k]; else n[k] = v; return n; })} vrefs={vrefs} setVrefs={(k, l) => setVrefsAll(m => ({ ...m, [k]: l }))} refCaps={vCaps}
      onGenerate={() => generate(false)} jobs={jobs} onSelect={setSel} selected={current?.id} viewerActions={videoViewerActions} tools={tools} />;
  }
  if (tool.id === 'create-image') {
    const canMask = ((cfg as any).maskModes ?? []).includes('inpaint');
    return <ImageCanvas featureId={featId} editIntent={editIntent} issues={issues} tool={tool} prompt={prompt} setPrompt={setPrompt} promptRef={promptRef} providers={modeProviders} defaults={modeDefaults} provider={provider} setProvider={setProvider}
      resolution={resolution} setResolution={setResolution} resolutions={resList} image={image} onImage={onImage} clearImage={() => { const [nx, ...rest] = extraRefs; setExtraRefs(rest); if (nx) setImage(nx); else setImage(null); dropMention(1); }} refs={extraRefs} refLimit={imageCap} movePhoto={(from, to) => { if (!image) return; const xs = [image, ...extraRefs]; const [moved] = xs.splice(from, 1); if (!moved) return; xs.splice(to, 0, moved); setImage(xs[0]); setExtraRefs(xs.slice(1)); if (from === 0 || to === 0) setMask(null); }} replacePhoto={(i, f) => { const r = { file: f, url: URL.createObjectURL(f) }; if (i === 0) { setImage(r); setMask(null); } else setExtraRefs(xs => xs.map((x, j) => j === i - 1 ? r : x)); }} removeRef={(i: number) => { setExtraRefs(r => r.filter((_, j) => j !== i)); dropMention(i + 2); }} imgErr={imgErr}
      mask={mask} setMask={setMask} canMask={canMask} style={style} setStyle={setStyle} styles={hasStyle ? styles.filter(x => x.id !== 'none') as any : []}
      price={estimate(tool, srcSec, resolution, 1, { provider, types: picked }) || null} ready={missing.length === 0} missing={missing} busy={submittingNow}
      onGenerate={extra => generate(false, extra)} jobs={jobs} selected={current?.id} onSelect={setSel} stage={stageEl} enhance={enhance} setEnhance={setEnhance} sameSeed={sameSeedEl} initial={icInit} allProviders={tool.providers}
      onWorkflowGenerate={async (tid, fd) => { if (q.mockFail) fd.set('simulate', q.mockFail); await submit(fd, tid); }} intakeRef={intake} />;
  }
  return (
    <Workspace tool={tool} panel={<>
      {(tool as any).featureId && <FeatureLine featureId={(tool as any).featureId} providerId={provider} />}
      {isLip ? <section className="card lip-card"><h2>Talking photo</h2>
          <label className="field">PORTRAIT <span className="helper">PNG or JPG, face clearly visible</span></label>
          {!portrait ? <label className="lip-drop"><input type="file" accept={IMAGE_ACCEPT} data-testid="lipsync-portrait-input" onChange={e => { const f = e.target.files?.[0]; if (f) setPortrait({ file: f, url: URL.createObjectURL(f) }); e.target.value = ''; }} /><span>Add a portrait</span></label>
            : <div className="row"><img className="ref" src={portrait.url} alt="Portrait" /><button className="btn" onClick={() => setPortrait(null)}>Replace</button></div>}
          <FieldIssue issues={issues} field="image" />
          <label className="field mt-12">SPEECH <span className="helper">2–15 s audio · becomes the soundtrack</span></label>
          {speech ? <div className="vs-file"><audio controls src={URL.createObjectURL(speech)} /><span className="vs-name" title={speech.name}>{speech.name}</span><button type="button" className="btn btn-sm" onClick={() => setSpeech(null)}>Remove</button></div>
            : <label className="vs-drop"><input type="file" accept="audio/*" data-testid="lipsync-speech-input" onChange={e => { setSpeech(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} /><span>Add speech audio</span><small>WAV, MP3 or M4A, 2–15 seconds.</small></label>}
          <FieldIssue issues={issues} field="speech" /></section>
      : cfg.input === 'none' || (cfg.input === 'image-optional' && !showImage) ? null : cfg.input === 'video'
        ? <>{!(cvApp && cvAudio) && <UploadVideo title={inLabel('video') ?? 'Video'} video={video} onChange={setVideo} disabled={!!running} dropLabel={cvApp ? 'Add your clip' : undefined} />}{cvApp && !video && !cvAudio && <RecordClip onDone={setVideo} disabled={!!running} />}<FieldIssue issues={issues} field="video" />{cvApp && !video && (tool.inputs ?? []).some(i => i.name === 'audio') && <AudioClipInput file={cvAudio?.file ?? null} onChange={(f, sec) => setCvAudio(f ? { file: f, sec } : null)} disabled={!!running} />}<FieldIssue issues={issues} field="audio" /></>
        : tool.id === 'app-transition' ? <ScenePair start={image} end={lastFrame} onStart={f => onImage([f])} onEnd={f => setLastFrame({ file: f, url: URL.createObjectURL(f) })} clearStart={() => setImage(null)} clearEnd={() => setLastFrame(null)} disabled={!!running} err={imgErr || undefined}
            onSwap={() => { const a = image, b = lastFrame; setLastFrame(a); if (b) onImage([b.file]); else setImage(null); }} startIssue={<FieldIssue issues={issues} field="image" />} endIssue={<FieldIssue issues={issues} field="lastFrame" />} />
        : <section className="card"><h2>{imgLabel ? imgLabel : tool.id === 'app-relight' ? 'Photo to relight' : tool.id === 'image-upscale' ? 'Image to upscale' : tool.id === 'app-inpaint' ? 'Photo to edit' : tool.id === 'app-ugc-ad' ? 'Presenter photo (optional)' : tool.id === 'h3-video' && !needsImage ? <>Start frame <span className="helper">optional</span></> : imgOptional ? <>Start image <span className="helper" data-testid="img-optional">Optional</span></> : 'Start image'}</h2>{tool.id === 'camera' && <p className="helper cam-img-need" data-testid="cam-img-need">{imgOptional ? 'Optional here: leave it empty and the shot starts from your words.' : 'Needed here: the shot starts from this picture.'}</p>}
            {!image ? <Dropzone accept={IMAGE_ACCEPT} label={gal ? 'Upload a photo' : 'Upload an image'} helper={gal ? 'PNG or JPG · at least 854×480 · a sharp, well-lit photo works best' : tool.id === 'image-upscale' ? 'PNG or JPG · up to 200 MB · results stop at 8192 px on the long side' : 'PNG or JPG · min 854×480 · a sharp start image gives a sharper shot'} onFiles={onImage} />
              : <div className={`row ${SRC_PREVIEW.includes(tool.id) ? 'src-preview-row' : ''}`}><img className={SRC_PREVIEW.includes(tool.id) ? 'ref src-preview' : 'ref'} src={image.url} alt={SRC_PREVIEW.includes(tool.id) ? 'Your image' : 'Start image'} data-testid="src-preview" /><button className="btn" onClick={() => setImage(null)} disabled={!!running}>Replace</button></div>}
            {imgErr && <div className="err">{imgErr}</div>}
          {image && !hid('mask') && ((cfg as any).maskModes ?? []).includes(mode) && <div className="mt-12"><label className="field">MASK <span className="helper">paint the area to repaint</span></label><MaskPaint key={image.url} src={image.url} onChange={setMask} /><FieldIssue issues={issues} field="mask" /></div>}
          {imgReq && <div className="helper img-req" role="status" data-testid="image-required"><p>{imgReq.error || 'This move needs a start image.'}</p>{imgReq.textProviders.length > 0 && <p className="row img-req-alt">Or run it without an image on {imgReq.textProviders.map(id => { const pv: any = tool.providers.find(x => x.id === id); return <button key={id} type="button" className="chip" data-testid={`text-provider-${id}`} onClick={() => setProvider(id)}>{pv?.displayName ?? pv?.name ?? id}</button>; })}</p>}</div>}
          {!imgReq && <FieldIssue issues={issues} field="image" />}
          {mwf?.image && <p className="helper lf-mode" data-testid="img-mode" role="status">{image ? (mwfTypes?.includes('edit') ? 'Mode: edit. The scene is built around your photo.' : 'Mode: reference. Your photo leads the shot.') : 'Add a photo to build the shot around it.'}</p>}
          {presLabel && !ugcOwn && <div className="mt-12 lf-slot pres-slot"><label className="field">{presLabel.replace(/\s*\(optional\)\s*/i, '').toUpperCase()}{/\(optional\)/i.test(presLabel) && <span className="helper"> optional</span>}</label>{mwf?.presenterImage && <p className="helper lf-mode" data-testid="pres-mode" role="status">{presImg ? 'Mode: reference. Your presenter photo leads the shot.' : 'Add your own presenter photo instead of a preset scene.'}</p>}
            {!presImg ? <label className="lip-drop"><input type="file" accept={IMAGE_ACCEPT} data-testid="presenter-image-input" onChange={e => { const f = e.target.files?.[0]; if (f) setPresImg({ file: f, url: URL.createObjectURL(f) }); e.target.value = ''; }} /><span>Add a presenter photo</span><small>PNG or JPG, face clearly visible.</small></label>
              : <div className="row"><img className="ref" src={presImg.url} alt="Presenter" /><button className="btn" onClick={() => setPresImg(null)} disabled={!!running}>Remove</button></div>}<FieldIssue issues={issues} field="presenterImage" /></div>}
          {showLast && <div className="mt-12 lf-slot"><label className="field">{lfLabel ? lfLabel.toUpperCase() : 'END FRAME'}{ltxCam && !needsLast && !lfLabel && <span className="helper"> optional</span>}</label>{mwf?.lastFrame && <p className="helper lf-mode" data-testid="lf-mode" role="status">{flfOn ? 'Mode: start + end frame. The clip travels from your start image to this one.' : 'Add an end image to switch to start + end frame.'}</p>}{!lastFrame ? <label className="lip-drop"><input type="file" accept={IMAGE_ACCEPT} data-testid="h3-last-frame-input" onChange={e => { const f = e.target.files?.[0]; if (f) setLastFrame({ file: f, url: URL.createObjectURL(f) }); e.target.value = ''; }} /><span>Add the last frame</span><small>The clip ends on this image.</small></label>
            : <div className="row"><img className="ref" src={lastFrame.url} alt="End frame" /><button className="btn" onClick={() => setLastFrame(null)}>Replace</button></div>}<FieldIssue issues={issues} field="lastFrame" />
            {ltxCam && <label className="lf-audio" data-testid="cam-gen-audio"><input type="checkbox" checked={genAudio} onChange={e => setGenAudio(e.target.checked)} /> Generate audio <small className="helper">LTX-2 19B makes sound with the clip</small></label>}</div>}</section>}
      {/* B22 T27: the presenter grid ends with "Use my own photo" (presenterImage → r2v per the server's modeWhenFile); a preset tile clears it. */}
      <AppFields fields={appFs} values={appVals} onChange={(k, v) => { setAppVals(x => ({ ...x, [k]: v })); if (k === 'presenter' && ugcOwn) setPresImg(null); }}
        extra={ugcOwn ? { presenter: { active: !!presImg, node: <button key="own" type="button" role="radio" aria-checked={!!presImg} data-arrow-skip className={`af-tile af-own ${presImg ? 'on' : ''}`} data-testid="af-presenter-own" disabled={!!running} onClick={() => presIn.current?.click()}>
          <span className="af-media" aria-hidden>{presImg ? <img src={presImg.url} alt="" /> : <i className="af-own-ph"><b>+</b><small>Your photo</small></i>}</span><span className="af-label">{presImg ? 'Your photo · change' : 'Use my own photo'}</span></button> } } : undefined} />
      {ugcOwn && <><input ref={presIn} type="file" accept={IMAGE_ACCEPT} hidden data-testid="presenter-image-input" onChange={e => { const f = e.target.files?.[0]; if (f) setPresImg({ file: f, url: URL.createObjectURL(f) }); e.target.value = ''; }} />
        <p className="helper lf-mode" data-testid="pres-mode" role="status">{presImg ? 'Your presenter photo leads the shot. Pick a preset tile to go back.' : 'Or use your own photo: PNG or JPG, face clearly visible.'}</p><FieldIssue issues={issues} field="presenterImage" /></>}
      {Array.isArray(gal?.notes) && gal.notes.length > 0 && <ul className="helper app-notes" data-testid="app-notes">{gal.notes.map((n: string) => <li key={n}>{n}</li>)}</ul>}
      <section className={`card ${!isLip && (cfg.input === 'video' ? !video : needsImage && !image) ? 'locked' : ''}`}>
        <h2 className="types-h">{audioBadge}{hid('types') ? (tool.id === 'app-character-sheet' ? 'Character' : 'Settings') : isExtend ? 'Extend' : isUpscale ? 'Mode' : cfg.modes ? 'Mode' : tileTypes ? (tool.id === 'photo-fx' ? 'Effect' : 'Camera move') : types.length ? 'Type' : 'Settings'} {mix > 1 && <span className="helper">mix up to {mix} · {picked.length} picked</span>}</h2>
        {Array.isArray(gal0?.lockedChips) && gal0.lockedChips.length > 0 && <div className="app-locked" role="list" aria-label="Set by this app" data-testid="locked-chips">{(gal0.lockedChips as { field: string; value: string; label?: string }[]).map(c => <span key={c.field} role="listitem" className="lchip" data-field={c.field} title={`${c.field === 'aspect' ? 'Aspect ratio' : c.field[0].toUpperCase() + c.field.slice(1)} is set by this app`}><svg viewBox="0 0 12 12" width="10" height="10" aria-hidden><path d="M3.5 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" strokeWidth="1.3" /><rect x="2.2" y="5" width="7.6" height="5.6" rx="1.4" fill="currentColor" /></svg>{c.field === 'aspect' ? 'Aspect ' : ''}{c.label ?? c.value}</span>)}</div>}
        {tool.id === 'voice' && <AudioModeTabs value={(mode || 'voiceover') as AudioMode} onChange={m => toggle(m)} />}
        {tool.id === 'voice' && mode === 'translate' && <p className="helper tr-hint" role="note"><b>Needs a translation server.</b> Translate runs on your own self-hosted speech-translation server. Without one, the job stops with a clear message{gqCredits != null && gqCredits > 0 ? (ownAccountsNow() ? '' : ' and what it held goes back to your balance') : gqCredits === 0 ? ', and nothing is charged on this route' : ''}. <a href={TRANSLATE_DOC} target="_blank" rel="noopener noreferrer">Set one up ↗</a></p>}
        {fxHero && <div className="fx-hero" data-testid="selected-preset">{(() => { const t = types.find(x => x.id === picked[0]); const ex = tool.id === 'photo-fx' ? { src: undefined, poster: undefined } : exampleAt(Math.max(0, types.findIndex(x => x.id === picked[0])), null, 5); /* B21 T6: no shared stills, only the effect's own media */ return <>{tool.id === 'photo-fx' && !t ? <span className="fx-hero-empty" aria-hidden>No effect yet</span> : tool.id === 'photo-fx' && t && !hasArt(t) ? <StandInArt id={t.id} toolId={tool.id} group={t.group} /> : <video key={t?.id ?? 'none'} src={(t as any)?.previewWebm || ((t as any)?.previewUrl && /\.(mp4|webm)$/i.test((t as any).previewUrl) ? (t as any).previewUrl : ex.src)} poster={(t as any)?.posterUrl || ex.poster} muted loop autoPlay={!matchMedia('(prefers-reduced-motion: reduce)').matches} playsInline aria-hidden />}<div className="fx-hero-copy"><span className="eyebrow">{t?.group ?? (tool.id === 'camera' ? 'Camera move' : 'Effect')}</span><b>{t?.label ?? (tool.id === 'camera' ? 'Pick a camera move' : 'Pick an effect')}</b></div><button type="button" className="fx-change" data-testid="preset-change" onClick={() => tool.id === 'camera' ? dispatchEvent(new Event('oj:open-library')) : setFxOpen(o => !o)} aria-expanded={tool.id === 'camera' ? undefined : fxOpen}>{tool.id === 'camera' ? (picked.length ? 'Change' : 'Pick a move') : fxOpen ? 'Done' : picked.length ? 'Change' : 'See all'}</button></>; })()}</div>}
        {tool.id === 'photo-fx' && fxOpen && <MoodPicker title="Pick an effect" sub="Effects change the light, colour and finish of your photo. Pick one or more, then add your image." testPrefix="fx-pick-" items={types.map(t => ({ id: t.id, label: t.label, group: t.group, posterUrl: (t as any).posterUrl, previewWebm: (t as any).previewWebm }))} toolId={tool.id} value={picked} fan={types.map(t => (t as any).posterUrl).filter(Boolean)} onPick={id => { toggle(id); if (mix <= 1) setFxOpen(false); }} onClose={() => setFxOpen(false)} />}
        {/* Camera: one selected-move card; the full grid lives in the canvas Library. */}{tileTypes && !hid('types') && tool.id !== 'camera' && groups.filter(Boolean).length > 1 && (!fxHero || fxOpen || !picked.length) && <div className="pills type-cats" role="tablist">{['All', ...groups.filter(Boolean)].map(g => <button key={g} type="button" role="tab" aria-selected={cat === g} className={`pill ${cat === g ? 'on' : ''}`} onClick={() => setCat(g)}>{g}</button>)}</div>}
        <FieldIssue issues={issues} field="types" />{!hid('types') && <div className={`type-grid ${tool.id === 'voice' ? 'vh-grid' : ''} ${tileTypes ? 'tile-types' : ''} ${isUpscale || (cfg.modes && tool.id !== 'voice') ? 'seg-types' : ''} ${fxHero && !fxOpen && picked.length ? 'fx-collapsed' : ''} ${tool.id === 'camera' ? 'cam-panel-hidden' : ''}`} hidden={tool.id === 'camera' || hid('types') || undefined}>{groups.filter(g => !tileTypes || cat === 'All' || g === cat).map(g => <div key={g} className="preset-group">
          {g && !/^mode$/i.test(g) && !tileTypes && <span className="helper preset-group-label">{g}</span>}
          {types.filter(t => (t.group ?? '') === g).map(t => { const off = (!!provModes && !provModes.includes(t.id)) || (!!bfl && !bflModes.includes(t.id)); const on = picked.includes(t.id); const ex = tileTypes ? exampleAt(types.indexOf(t), null, 5) : null; return <button key={t.id} className={`chip ${on ? 'on' : ''} ${off ? 'disabled' : ''} ${tileTypes ? 'type-tile' : ''}`} aria-pressed={on} disabled={off} data-testid={tool.id === 'h3-video' ? `h3-mode-${t.id}` : `type-${t.id}`} title={off ? `Not available with ${curProv?.name}` : (t as any).providers ? `Runs on ${(t as any).providers.map((id: string) => tool.providers.find(p => p.id === id)?.name ?? id).join(', ')}` : undefined} onClick={() => { toggle(t.id); const tp: string[] | undefined = (t as any).providers; if (tp?.length && !tp.includes(provider)) setProvider(tp[0]); if (fxHero) setFxOpen(false); }}>
            {ex && tool.id === 'photo-fx' && !hasArt(t) ? <span className="tt-media"><StandInArt id={t.id} toolId={tool.id} group={t.group} />{on && <span className="tt-ord">{mix > 1 ? picked.indexOf(t.id) + 1 : '✓'}</span>}</span> : ex && <span className="tt-media"><img src={(t as any).posterUrl || ((t as any).previewUrl && /\.(jpe?g|png|webp)$/i.test((t as any).previewUrl) ? (t as any).previewUrl : ex.poster)} alt="" loading="lazy" onMouseEnter={e => { const g = (t as any).previewGif; if (g && !(t as any).previewWebm) e.currentTarget.src = g; }} /><video src={(t as any).previewWebm || ((t as any).previewUrl && /\.(mp4|webm)$/i.test((t as any).previewUrl) ? (t as any).previewUrl : ex.src)} muted loop playsInline preload="none" onMouseEnter={e => { e.currentTarget.play().catch(() => 0); }} onMouseLeave={e => e.currentTarget.pause()} />{on && <span className="tt-ord">{mix > 1 ? picked.indexOf(t.id) + 1 : '✓'}</span>}</span>}
            {!tileTypes && mix > 1 && on ? `${picked.indexOf(t.id) + 1}. ` : ''}<span className="tt-label">{t.label}</span></button>; })}
        </div>)}</div>}
        {isUpscale && !hid('scale') && scaleList.length > 0 && <><label className="field">SCALE</label><div className="seg scale-seg" role="radiogroup">{scaleList.map(n => { const on = String(fieldVals.scale ?? 2) === String(n); const off = false; return <button key={n} type="button" role="radio" aria-checked={on} data-testid={`upscale-scale-${n}`} disabled={off} title={off ? `FLUX 3 Upscaler supports ${bfl.factor.min}–${bfl.factor.max}×` : undefined} className={on ? 'on' : ''} onClick={() => setFieldVals(v => ({ ...v, scale: String(n) }))}>{n}x</button>; })}</div>{issues.filter(i => i.field === 'scale').map((i: any, k) => <p key={k} className="helper err" role="alert" data-testid="upscale-scale-error">{i.message}{Array.isArray(i.allowed) && !/×/.test(i.message) ? ` Allowed: ${i.allowed.map((x: any) => `${x}×`).join(', ')}.` : ''}</p>)}</>}
        {bfl && bflModes.length > 0 && <><label className="field">MODE</label><div className="seg" role="radiogroup" data-testid="upscale-mode">{bflModes.map(m => { const on = picked[0] === m; return <button key={m} type="button" role="radio" aria-checked={on} data-testid={`upscale-mode-${m}`} className={on ? 'on' : ''} onClick={() => setPicked([m])}>{m[0].toUpperCase() + m.slice(1)}</button>; })}</div>
          <div className="helper" data-testid="upscale-caps">Up to {bfl.maxSeconds}s · {bfl.maxSource} · {bfl.maxMB} MB · {bfl.factor.min}–{bfl.factor.max}×{bfl.keepsAudio ? ' · keeps audio' : ''}{bflOut ? ` · output ${bflOut.width}×${bflOut.height}` : ''}</div></>}
        {isUpscale && !sizeLine(upQ) && readout && <p className="helper up-readout" data-readout>{readout}</p> /* B18/19: the server's sizes (quote-size line) win over our own readout */}
        {tryTool && <Notice as="p" kind="warn" tone="line" className="try-tool">This input fits another tool better. <Link to={toolPage(tryTool)}>Try {tryTool.replace(/-/g, ' ')} →</Link></Notice>}
        {tool.id === 'voice' && <><label className="field">TAKES</label><div className="seg n-seg" role="radiogroup" aria-label="Number of takes">{[1, 2, 3, 4].map(n => { const on = String(fieldVals.n ?? 1) === String(n); return <button key={n} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => setFieldVals(v => ({ ...v, n: String(n) }))}>{n}</button>; })}</div></>}
        {Array.isArray((cfg as any).refSlots) && (cfg as any).refSlots.length > 0 && <><label className="field">REFERENCES <span className="helper">optional</span></label><div className="ref-slots">{((cfg as any).refSlots as { name: string; label: string; max?: number }[]).map(sl => { const fs = slotFiles[sl.name] ?? []; const max = sl.max ?? 1; return <label key={sl.name} className={`ref-slot ${fs.length ? 'has' : ''}`} data-slot={sl.name}>{fs[0] ? <img src={URL.createObjectURL(fs[0])} alt="" /> : <span className="rs-plus" aria-hidden>+</span>}<span className="rs-l">{sl.label}{max > 1 ? ` ${fs.length}/${max}` : ''}</span><input type="file" accept={IMAGE_ACCEPT} multiple={max > 1} hidden onChange={e => { const xs = [...(e.target.files ?? [])]; setSlotFiles(v => ({ ...v, [sl.name]: [...(max > 1 ? fs : []), ...xs].slice(0, max) })); e.target.value = ''; }} />{fs.length > 0 && <button type="button" className="rs-x" aria-label={`Clear ${sl.label}`} onClick={e => { e.preventDefault(); setSlotFiles(v => ({ ...v, [sl.name]: [] })); }}>×</button>}</label>; })}</div></>}
        {tool.id === 'photo-fx' && <>{/* Photo FX aspect: the per-model row below (server list) */}
          <SwitchDetails className="prompt-toggle fx-prompt" testId="fx-twist" autoOpen={!!prompt} label={<span>Add a twist <span className="helper">optional</span></span>} onChange={on => { if (!on) { fxHeld.current = prompt; setPrompt(''); } else if (!prompt && fxHeld.current) setPrompt(fxHeld.current); }}><textarea data-enter-submits="" id="fx-prompt" rows={2} maxLength={LIMITS.maxPrompt} placeholder="e.g. slow motion, warm light" aria-label="Twist" value={prompt} onChange={e => setPrompt(e.target.value)} /></SwitchDetails></>}
        {promptOn && tool.id !== 'photo-fx' /* Photo FX: the 'Add a twist' switch above is its one prompt box */ && (!isUpscale || mode === 'creative' || !types.some(t => t.id === 'creative')) && <><label className="field" htmlFor="app-prompt">{tool.id === 'voice' ? (mode === 'voiceover' ? 'SCRIPT' : 'NOTES') : 'PROMPT'} {(promptOpt || (!promptNeeded && (!cfg.modes || cfg.promptOptionalModes?.includes(mode)))) && <span className="helper">optional</span>}</label>
          {promptOpt && autoP?.whenEmpty && <label className="nx-toggle sw-field app-auto" data-testid="app-auto"><input type="checkbox" role="switch" checked={autoOn} onChange={e => { const on = e.target.checked; if (on) { heldPrompt.current = prompt; setAutoOn(true); setPrompt(''); } else { setAutoOn(false); if (heldPrompt.current) setPrompt(heldPrompt.current); } }} /><span className="nx-sw" /><span>Auto <small className="helper">{autoOn ? 'We write the prompt from your photo' : 'Write your own prompt'}</small></span></label>}
          <textarea data-enter-submits="" ref={promptRef} id="app-prompt" rows={tool.id === 'voice' && mode === 'voiceover' ? 6 : 2} placeholder={tool.id === 'voice' && mode === 'voiceover' ? 'Type the words to be spoken…' : tool.id === 'app-product-shot' ? 'e.g. a glass perfume bottle on a marble counter, soft morning light' : tool.id === 'app-character-sheet' ? 'e.g. a friendly explorer in a green coat, short curly hair' : autoP?.text && promptOpt ? (autoActive ? `Auto: ${autoP.text}` : `e.g. ${autoP.text}`) : undefined} disabled={autoActive} data-auto={autoActive ? '1' : undefined} maxLength={LIMITS.maxPrompt} value={prompt} onChange={e => setPrompt(e.target.value)} />{metaTags.length > 0 && <MetaTagChips style={mt.style} tags={metaTags} target={() => promptRef.current} value={prompt} onChange={setPrompt} provider={provider} />}<FieldIssue issues={issues} field="prompt" /></>}
        {cfg.enhance && !hid('enhance') && <div className="row enh-row mt-8"><label className="row helper"><input type="checkbox" checked={enhance} onChange={e => setEnhance(e.target.checked)} /> Enhance prompt</label>{cfg.prompt && tool.id !== 'voice' && <EnhanceButton prompt={prompt} kind={cfg.input === 'video' ? 'video' : 'image'} style={style} onApply={r => { setEnh(r); setPrompt(r.prompt); }} />}</div>}
        {enh && <EnhanceDiff r={enh} onUndo={() => { setPrompt(enh.original); setEnh(null); }} onDismiss={() => setEnh(null)} />}
        {hasStyle && !hid('style') && styles.length > 0 && <><label className="field">STYLE {style && <button type="button" className="link-btn" onClick={() => setStyle('')}>clear</button>}</label><StylePresets value={style} onChange={setStyle} styles={styles.filter(x => x.id !== 'none').map(x => ({ id: x.id, label: x.label, poster: (x as any).posterUrl ?? (x as any).previewUrl ?? undefined }))} /></>}
        {isExtend && <><label className="field">ADD</label><div className="seg ext-seg" role="radiogroup" aria-label="Extend by">{(((cfg as any).extendSeconds ?? [5, 10]) as number[]).map(n => <button key={n} type="button" role="radio" aria-checked={extSec === n} data-testid={`h3-extend-${n}s`} className={extSec === n ? 'on' : ''} onClick={() => setExtSec(n)}>+{n}s</button>)}</div>
          <label className="field" htmlFor="ext-prompt">WHAT HAPPENS NEXT</label><textarea data-enter-submits="" id="ext-prompt" rows={3} maxLength={LIMITS.maxPrompt} placeholder="e.g. she turns to the camera and smiles" value={prompt} onChange={e => setPrompt(e.target.value)} /><FieldIssue issues={issues} field="prompt" />
          <p className="helper">Returns the new footage only, continuing from the last frames of your clip.</p></>}
        {cfg.durations && durList.length > 1 && !hid('duration') && <><label className="field">DURATION</label>
          {durList.length > 5
            ? <select className="dur-select" aria-label="Duration" data-testid="dur-select" aria-invalid={durErr ? true : undefined} value={duration} onChange={e => setDuration(Number(e.target.value))}>{durList.map(d => <option key={d} value={d}>{d}s</option>)}</select>
            : <div className="seg dur-seg" role="radiogroup" aria-label="Duration">{durList.map(d => <button key={d} type="button" role="radio" aria-checked={duration === d} tabIndex={duration === d ? 0 : -1} className={duration === d ? 'on' : ''} onClick={() => setDuration(d)}>{d}s</button>)}</div>}</>}
        {cfg.durations && durErr && <Notice as="p" kind="error" tone="line" className="dur-err" testId="duration-error">{durErr}</Notice>}
        {camAspects.length > 1 && <><label className="field">ASPECT</label><div className="seg asp-seg" role="radiogroup" aria-label="Aspect ratio" data-testid={tool.id === 'camera' ? 'camera-aspect' : 'fx-aspect'}>{camAspects.map(x => { const on = String(fieldVals.aspect ?? 'auto') === x; return <button key={x} type="button" role="radio" aria-checked={on} data-testid={`${tool.id === 'camera' ? 'camera' : 'fx'}-aspect-${x.replace(':', 'x')}`} className={on ? 'on' : ''} title={x === 'auto' ? 'Follow the start image' : undefined} onClick={() => setFieldVals(v => ({ ...v, aspect: x }))}>{x === 'auto' ? 'Auto' : x}</button>; })}</div></>}
        {fieldSpecs.filter(fieldShown).filter(fd => fd.name === 'quality' && qualityOpts.length || fd.name === 'intensity').map(fd => { const pre = fd.name === 'quality' ? 'h3-quality' : 'camera-intensity'; const opts = fd.name === 'quality' ? [...qualityOpts].sort((a, b) => (a.value === 'fast' ? -1 : 1) - (b.value === 'fast' ? -1 : 1)) : (fd.options ?? []) as any[]; return <div key={fd.name} className="plugin-field"><label className="field">{(fd.label ?? fd.name).toUpperCase()}</label>
          <div className="pills h3-chips" role="radiogroup" aria-label={fd.label ?? fd.name}>{opts.map((o: any) => { const on = String(fieldVals[fd.name] ?? fd.default) === o.value; return <button key={o.value} type="button" role="radio" aria-checked={on} data-testid={`${pre}-${o.value}`} className={`pill ${on ? 'on' : ''}`} onClick={() => setFieldVals(v => ({ ...v, [fd.name]: o.value }))}>{o.label ?? o.value}{o.steps ? <small> · {o.steps} steps</small> : null}</button>; })}</div>
          {fd.name === 'quality' && <p className="helper">Fast runs locally only; cloud routes always use Quality.</p>}<FieldIssue issues={issues} field={fd.name} /></div>; })}
        {audioVoice && !hid('voiceDetails') && <section className="as at-voice" data-testid="audio-voice-controls" style={{ all: 'unset', display: 'grid', gap: 8 }}><label className="field">VOICE SETTINGS</label><div className="as-adv-b" style={{ padding: 0 }}><VoiceControls tool={tool} provider={provider} mode={mode} fv={fieldVals} setFv={setFieldVals as any} issues={issues} /></div></section>}
        {fieldSpecs.filter(fieldShown).filter(fd => !(fd.name === 'quality' && qualityOpts.length || fd.name === 'intensity')).filter(fd => !(isLip && ['voice', 'language', 'mix'].includes(fd.name))).map(fd => cvApp && fd.name === 'voice' ? <VoiceCards key="voice-cards" sampleUrl={(() => { const c: any = (tool.inputs.find(i => i.name === 'voice') as any)?.choices?.find((x: any) => x.value === 'builtin'); return c && !c.needsSample && typeof c.sampleUrl === 'string' ? c.sampleUrl : null; })()} sampleStandIn={(tool.inputs.find(i => i.name === 'voice') as any)?.choices?.some((x: any) => x.value === 'builtin' && (x.sampleKind === 'standin' || x.sampleIsStandIn === true))} sampleKind={sampleKindOf((tool.inputs.find(i => i.name === 'voice') as any)?.choices?.find((x: any) => x.value === 'builtin'))} value={String(fieldVals.voice ?? 'builtin')} onChange={v => setFieldVals(x => ({ ...x, voice: v }))} samples={[voiceSample, ...voiceExtra].filter((f): f is File => !!f)} setSamples={fs => { setVoiceSample(fs[0] ?? null); setVoiceExtra(fs.slice(1)); }} max={Number(((tool.inputs ?? []) as any[]).find((i: any) => i.name === 'voiceAudio')?.maxFiles ?? 3)} disabled={!!running} /> : <div key={fd.name} className="plugin-field">
          <label className="field" htmlFor={`pf-${fd.name}`}>{(fd.label ?? fd.name).toUpperCase()}{fd.help && <span className="helper"> {fd.help}</span>}</label>
          {fd.kind === 'select' && (fd.options ?? []).length === 2 && (fd.options ?? []).every(o => o.value === '0' || o.value === '1') ? <label className="nx-toggle sw-field"><input id={`pf-${fd.name}`} type="checkbox" role="switch" checked={String(fieldVals[fd.name]) === '1'} onChange={e => setFieldVals(v => ({ ...v, [fd.name]: e.target.checked ? '1' : '0' }))} /><span className="nx-sw" /><span>{fd.label ?? fd.name}</span></label>
            : fd.kind === 'select' && fd.gallery && fd.name === 'aspect' && optsFor(fd).length <= 10 /* BH12 T23: Product Shot's 9 shapes use the radios too */ ? <div className="seg asp-seg" role="radiogroup" aria-label={fd.label ?? 'Aspect'} data-testid="app-aspect">{optsFor(fd).map(o => { const on = String(fieldVals[fd.name] ?? fd.default) === o.value; return <button key={o.value} type="button" role="radio" aria-checked={on} data-testid={`app-aspect-${o.value.replace(':', 'x')}`} className={on ? 'on' : ''} title={o.value === 'auto' ? 'Follow the image' : undefined} onClick={() => setFieldVals(v => ({ ...v, [fd.name]: o.value }))}>{o.value === 'auto' ? 'Auto' : o.label ?? o.value}</button>; })}</div>
            : fd.kind === 'select' ? <select id={`pf-${fd.name}`} data-testid={`pf-${fd.name}`} value={String(fieldVals[fd.name] ?? '')} onChange={e => setFieldVals(v => ({ ...v, [fd.name]: e.target.value }))}>{optsFor(fd).map(o => <option key={o.value} value={o.value}>{o.label ?? o.value}</option>)}</select>
            : fd.kind === 'boolean' ? <label className="row helper"><input id={`pf-${fd.name}`} type="checkbox" checked={!!fieldVals[fd.name]} onChange={e => setFieldVals(v => ({ ...v, [fd.name]: e.target.checked }))} /> {fd.label ?? fd.name}</label>
            : fd.kind === 'number' ? <input id={`pf-${fd.name}`} type="number" min={fd.min} max={fd.max} value={Number(fieldVals[fd.name] ?? 0)} onChange={e => setFieldVals(v => ({ ...v, [fd.name]: Number(e.target.value) }))} />
            : <input id={`pf-${fd.name}`} type="text" maxLength={fd.maxLength} value={String(fieldVals[fd.name] ?? '')} onChange={e => setFieldVals(v => ({ ...v, [fd.name]: e.target.value }))} />}
          {fd.name === 'language' && langNote && <p className="helper lang-note" role="status" data-testid="lang-note">{langNote}</p>}{fd.name === 'language' && !issues.some(i => i.field === 'language') && (gq?.code === 'unsupported_language' || gq?.code === 'invalid_language') && <p className="err field-issue" data-testid="lang-unsupported">{String(gq.issues?.[0]?.message ?? gq.error ?? '')}</p>}
          <FieldIssue issues={issues} field={fd.name} />
          {fd.name === 'voice' && String(fieldVals.voice) === 'clone' && <div className="voice-sample">
            <label className="field" htmlFor="voice-sample">VOICE SAMPLE <span className="helper">optional · 5–30 s of clean speech</span></label>
            {voiceSample ? <div className="vs-file"><audio controls src={URL.createObjectURL(voiceSample)} /><span className="vs-name" title={voiceSample.name}>{voiceSample.name}</span><button type="button" className="btn btn-sm" onClick={() => setVoiceSample(null)}>Remove</button></div>
              : <label className="vs-drop"><input id="voice-sample" name="voiceAudio" type="file" accept="audio/*" onChange={e => { setVoiceSample(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} /><span>Add a voice sample</span><small>WAV, MP3 or M4A. Without one, the voice is taken from the clip.</small></label>}
            <FieldIssue issues={issues} field="voiceAudio" />
          </div>}
        </div>)}
        {cfg.steps && <details className="mt-12"><summary>Advanced · steps</summary>
          <div className="seg">{cfg.steps.map(s => <button key={s} className={steps === s ? 'on' : ''} onClick={() => setSteps(s)}>{s}</button>)}</div></details>}
      </section>
      <section className="card">
        <h2>Generate</h2>
        {sameSeedEl}
        <GenerateBar toolId={tool.id} resolution={resolution} setResolution={setResolution} resolutions={resList} media={cfg.input === 'video' ? 'video' : 'image'} audio={cfg.input === 'video' && cfg.kind !== 'soundtrack'} seed={seed} setSeed={setSeed}
          backend={tool.backend} providers={modeProviders} defaults={modeDefaults} provider={provider} setProvider={setProvider}
          keyGate={upKeyGate} demo={quoteDemo} quote={isUpscale ? upQ : gq} priceUnavailable={isUpscale && upUnpriced && !upKeyGate ? String(upQ?.error ?? 'No verified price for this setting, so it can’t run.') : gqUnpriced} estSec={bflCredits ?? gqCredits ?? estimate(tool, srcSec, resolution, 1, { provider, types: picked, count: imgN })} draftSec={estimateDraft(tool, srcSec, 1, { provider, types: picked, count: imgN })}
          prices={{ ...pricesByQuality(tool, resList, { durationSec: srcSec, provider, types: picked, count: imgN }), ...(gqCredits != null ? { [resolution]: gqCredits } : {}) }} issues={issues} onReset={resetForm} mentionIssues={promptOn ? mentions.issues : []} missing={missing} onGenerate={() => generate(false)} onDraft={!isUpscale && !isAudio && (cfg.resolutions.includes('480p') || (tool as any).draft) ? () => generate(true) : undefined} label={undefined /* C4: Generate everywhere */} showDraft={!!(tool as any).draft} hideQuality={isAudio || tool.id === 'image-upscale' || hid('resolution')} modelName={camModel} cardProvider={camCardProv} />{cfg.input === 'video' && !video && <EstimateHint q={isUpscale ? upQ : gq} />}
        {tool.id === 'app-ugc-ad' && !image && !presImg && <p className="helper ugc-hint" data-testid="ugc-photo-hint">Got a photo of the product? Add it for a closer match.</p>}
        {/* B21 T28: always-visible honest note, only while the server says there is no orbit add-on */}{tool.id === 'app-orbit-shot' && Array.isArray(gal?.notes) && gal.notes.some((n: string) => /partial arc/i.test(n)) && <p className="helper gen-honest" data-testid="orbit-honest">The camera may cover a partial arc rather than a full circle.</p>}
        {running && <div className="mt-16"><JobProgress job={running} stages={jobStages(tool, running)} onUpdate={refresh} /></div>}
      </section>
</>} stage={stageEl /* B21: one stage for every AppTool layout */} />
  );
}

function dataUrlToBlob(u: string) { const [h, b] = u.split(','); const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: h.slice(5).split(';')[0] || 'image/png' }); }
