/**
 * One Video page, step 2 (2026-10-25): a picked video workflow in the Video page's own bottom bar, the way Create Image runs its workflows.
 * Same layout as Create Video (ui/video/VideoStudio.tsx): the Video page's one feed above (ui/video/VideoPage, never remounted by a switch), the dock below with the workflow chip, the inputs as
 * labelled slots (the shared media picker), the prompt (when the workflow takes one), the options as chips with popovers, the model,
 * Run on and Generate with the price (quote = charge). What the bar shows comes from the recipe (server/src/shared/videoBar.ts); the job
 * runs on the workflow's own tool with the fields its old screen posted, so prices, the API and saved jobs are unchanged.
 */
import { ACCEPT, IMAGE_ACCEPT, fileFits, kindOfFile, wrongTypeText } from '../../../../server/src/shared/mediaAccept';
import { SlotPreview, prepUpload } from '../../shared/SlotPreview';
import { hasFreeLocal } from '../../shared/KeyNeeded';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { JobState, ToolInfo } from '../../api';
import { createJob, issuesOf } from '../../api';
import type { VideoWorkflow } from '../../../../server/src/shared/videoWorkflows';
import { typesOf, type VideoBar, type VBarControl, type VBarSlot, type VBarOption } from '../../../../server/src/shared/videoBar';
import { preflightProblems, type PreflightProblem, type PreflightFix } from '../../../../server/src/shared/preflight';
import { VideoWorkflowChip } from './VideoWorkflows';
import VideoFeed from './VideoFeed';
import { useHostedVideoFeed } from './videoFeedSlot';
import { useJobs } from '../../shared/useJobs';
import { useToast } from '../../shared/Toast';
import { useDraftField } from '../../shared/batch1';
import { restorableProvider } from '../../shared/lifecycle';
import { useToolQuote } from '../../shared/useToolQuote';
import { quoteParams, usePrefill } from '../../shared/usePrefill';
import { useClipSource } from '../../shared/clipEstimate';
import { useToolQuery, cloneForm } from '../../shared/useToolQuery';
import { DockGenerate } from '../../shared/DockGenerate';
import { PreflightPop } from '../next/PhotoPrep';
import { ModelMenu, type MenuItem } from '../../shared/ModelMenu';
import { MakerTile } from '../../shared/MakerTile';
import { SettingsChip, SoundSection } from './SoundSetting';
import { BarPopover, PopSection, PopList, PopRow, Segmented, PopNote, AspectShape, aspectWH } from '../../shared/BarPop';
import { LookPicker, type LookItem } from '../../shared/LookPicker';
import { openPickerFor, withNativePicker } from '../../shared/MediaPicker';
import { tip } from '../../shared/Tooltip';
import { useDockHeight, useChipFit } from '../../shared/dockFit';
import { fitPri } from '../../shared/chipFit';
import { foldedRow, FoldedRows, type RowOverflowRow } from '../../shared/RowMore';
import { usePromptGrow } from '../../shared/usePromptGrow';
import { useToolModels, modelOfEngine, shownName, setupPlacesOf, engineForModelParam, modelParam, useModelParamSync, useRouting } from '../../shared/models';
import { doSetupPlace } from '../../shared/SetupCard';
import { pinQ } from '../routing/Routes';
import { RunOnChip } from '../routing/RunOn';
import { navigate } from '../../platform/router';
import { readVideo } from '../../shared/UploadVideo';
import { CloseIcon, PlusIcon, ClockIcon, ResolutionIcon, AspectIcon, QualityIcon, ExtendIcon, HdrIcon, FpsIcon, DepthIcon, CutoutIcon, UpscaleIcon, PaletteIcon, TransitionIcon, OrbitIcon, CameraMovesIcon, PhotoFxIcon, MoreIcon, VideoIcon, ImageIcon, AudioIcon, ObjectSwapIcon, LayersIcon, UserIcon, SparkleIcon, SelectIcon, ReshootIcon, type IconProps } from '../Icons';
import SameSeed from '../../shared/SameSeed';
import { AppTiles, appFieldsOf } from '../../tools/app/AppFields';
import type { BarCtx, BarExtra, BarLive, SlotFile, UseBarExtra } from './barExtras/types';
import { useExtendExtra } from './barExtras/ExtendExtra';
import { useObjectSwapExtra } from './barExtras/ObjectSwapExtra';
import { useReshootExtra } from './barExtras/ReshootExtra';
import { useVideoFit } from './barExtras/VideoFit';
import { useMotionControlExtra } from './barExtras/MotionControlExtra';
import { useTalkingExtra } from './barExtras/TalkingExtra';
import '../next/workflowBar.css';
import '../next/createBar.css';
import './videoPanel.css';
import './videoDock.css';
import './videoWorkflowBar.css';
import { VideoThumb } from '../../shared/VideoThumb';
import { MentionLayer } from '../../shared/MentionChips';
import { renumberMentions } from '../../../../server/src/shared/mentions';
import { SlotLabel } from '../../shared/SlotLabel';
import { EnhanceChip, EnhancePop, showEnhanced } from '../next/Enhance';

const ICONS: Record<string, (p: IconProps) => ReactNode> = { clock: ClockIcon, resolution: ResolutionIcon, aspect: AspectIcon, quality: QualityIcon, extend: ExtendIcon, hdr: HdrIcon, fps: FpsIcon, depth: DepthIcon,
  cutout: CutoutIcon, upscale: UpscaleIcon, palette: PaletteIcon, transition: TransitionIcon, orbit: OrbitIcon, camera: CameraMovesIcon, fx: PhotoFxIcon, swap: ObjectSwapIcon, layers: LayersIcon, person: UserIcon, spark: SparkleIcon, select: SelectIcon, reshoot: ReshootIcon };
/** The extra step of the workflows a recipe can't say alone (ui/video/barExtras/): one chip + popover in this bar. */
const EXTRAS: Record<string, UseBarExtra> = { extend: useExtendExtra, 'object-swap': useObjectSwapExtra, reshoot: useReshootExtra, 'motion-control': useMotionControlExtra, 'lip-sync': useTalkingExtra };
const useNoExtra: UseBarExtra = () => ({});
const GIcon = ({ name, size = 14 }: { name: string; size?: number }) => { const I = ICONS[name] ?? QualityIcon; return <I size={size} />; };
const acceptOf = (s: VBarSlot) => s.altImage ? `${ACCEPT[s.kind]},${IMAGE_ACCEPT}` : ACCEPT[s.kind]; /* one list per kind: shared/mediaAccept */
const isPhoto = (f: File) => /^image\//.test(f.type);
const KIND_ICON = { video: VideoIcon, image: ImageIcon, audio: AudioIcon };
const fmtSec = (s?: number) => s == null || !isFinite(s) ? '' : s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const pretty = (v: string) => v === 'auto' ? 'Auto' : v;

/** Read what the slot needs to know about a file (clip seconds for the price, photo size for the checks). */
async function metaOf(kind0: VBarSlot['kind'], file: File): Promise<SlotFile> {
  const url = URL.createObjectURL(file); const kind = kind0 !== 'image' && isPhoto(file) ? 'image' : kind0; /* a photo in a slot that also takes one (Re-shoot) */
  if (kind !== kind0) { const wh = await new Promise<{ w?: number; h?: number }>(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({}); i.src = url; }); return { file, url, photo: true, ...wh }; }
  try {
    if (kind === 'video') { const m = await readVideo(file); return { file, url, sec: m.duration, w: m.w, h: m.h }; }
    if (kind === 'audio') { const sec = await new Promise<number | undefined>(res => { const a = document.createElement('audio'); a.preload = 'metadata'; a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(undefined); a.src = url; }); return { file, url, sec }; }
    const wh = await new Promise<{ w?: number; h?: number }>(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({}); i.src = url; }); return { file, url, ...wh };
  } catch { return { file, url }; }
}

/** The last clip, photo and sound in the bar (this visit only), so the next workflow starts with them. */
const CARRY: Record<VBarSlot['kind'], SlotFile | null> = { video: null, image: null, audio: null };

const noSelect = () => undefined;
export default function VideoWorkflowBar({ wf, bar, tool, tools }: { wf: VideoWorkflow; bar: VideoBar; tool: ToolInfo; tools: ToolInfo[] }) {
  const toast = useToast(); const [preview, setPreview] = useState<{ slot: VBarSlot; index: number } | null>(null); const previewAnchor = useRef<HTMLElement | null>(null); const q0 = useToolQuery(); const clipSrc = useClipSource();
  const cfg: any = tool.app ?? {}; const inp = (n: string): any => (tool.inputs ?? []).find(i => i.name === n);
  const dKey = `${tool.id}:vbar:${wf.id}`;
  const [vals, setVals] = useDraftField<Record<string, string>>(dKey, 'vals', {}, v => !!v && typeof v === 'object');
  const [prompt, setPrompt] = useDraftField(dKey, 'prompt', '');
  const setVal = (k: string, v: string) => setVals(s => ({ ...s, [k]: v }));
  /* the workflow's extra step, if it has one (the bar is keyed by workflow, so this is the same hook for the whole visit) */
  const [useExtra] = useState<UseBarExtra>(() => EXTRAS[wf.id] ?? useNoExtra);
  const ctx0: BarCtx = { tool, wf, bar, vals, setVal, toast };
  const extra: BarExtra = useExtra(ctx0);
  /* models: the voice tool runs several jobs, only its lip-sync models here (app.providerModes); an extra may narrow them (Object Swap: the swap type's models) */
  const baseProviders = useMemo(() => tool.providers.filter(p => !bar.mode || !cfg.providerModes?.[p.id] || cfg.providerModes[p.id].includes(bar.mode)), [tool.id, bar.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const providers = extra.providers ? extra.providers(baseProviders) : baseProviders;
  const firstProv = extra.firstProvider?.(providers) ?? providers.find(p => p.id === tool.defaultProvider)?.id ?? providers[0]?.id ?? '';
  const [provider, setProvider] = useDraftField(dKey, 'provider', firstProv, v => restorableProvider({ providers }, v));
  /* ?model= from the header's model rows (Wan 2.1 VACE → Restyle): open with that model picked, then the URL follows the menu */
  useEffect(() => { const m = engineForModelParam(tool, modelParam()); if (m && providers.some(p => p.id === m)) setProvider(m); }, [wf.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const prov = providers.some(p => p.id === provider) ? provider : firstProv;
  useModelParamSync(tool, prov, !!modelParam());
  /* Recreate's place: the job ran pinned to a route (H3 Extend · Comfy Cloud, a Router place…), so the quote and the run use that route again, while the
     same engine and card stay picked; picking another model or saving another place (the routing prefs change) drops it */
  const [rcRoute, setRcRoute] = useState<{ engine: string; modelKey: string | null; route: string } | null>(null);
  const routingNow = useRouting(); const routingWas = useRef(routingNow);
  useEffect(() => { if (routingWas.current && routingWas.current !== routingNow) setRcRoute(null); routingWas.current = routingNow; }, [routingNow]);
  const rcRouteOn = rcRoute && rcRoute.engine === prov && (!rcRoute.modelKey || modelOfEngine(tool.id, prov)?.key === rcRoute.modelKey) ? rcRoute.route : null;
  /* switching workflows keeps your clip / photo / sound: each kind goes into the new workflow's first slot of that kind (a hand-off link wins) */
  const [files, setFiles] = useState<Record<string, SlotFile[]>>(() => { if (/[?&](fromJob|from|recreate)=/.test(location.search)) return {}; const o: Record<string, SlotFile[]> = {};
    for (const k of ['video', 'image', 'audio'] as const) { const f = CARRY[k]; const sl = bar.slots.find(x => x.kind === k && x.required !== false); if (f && sl) o[sl.name] = [f]; } return o; }); /* never into an optional extra (Restyle's style images) */
  useEffect(() => { for (const k of ['video', 'image', 'audio'] as const) { const sl = bar.slots.find(x => x.kind === k && x.required !== false); const f = sl ? files[sl.name]?.[0] : undefined; if (sl) CARRY[k] = f?.photo ? null : f ?? null; } }, [files]); // eslint-disable-line react-hooks/exhaustive-deps
  const { jobs, add, setJobs, refresh } = useJobs(tool.id);
  const [busy, setBusy] = useState(false); const [pop, setPop] = useState(''); const [pfOpen, setPfOpen] = useState(false);
  /* Same seed (the shared switch of Create Video and Image, shared/SameSeed): after a Recreate or a run here; on = the next run reuses that seed */
  const [lastSeed, setLastSeed] = useState<number | null>(null); const [seedOn, setSeedOn] = useState(false);
  const dock = useRef<HTMLDivElement>(null); const genRef = useRef<HTMLButtonElement>(null); const promptRef = useRef<HTMLTextAreaElement>(null); const prowRef = useRef<HTMLDivElement>(null);
  const gRefs = useRef<Record<string, HTMLButtonElement | null>>({}); const anchors = useRef<Record<string, { readonly current: HTMLButtonElement | null }>>({});
  /** a stable anchor per group chip (the popovers re-place against it) */
  const anchorOf = (gid: string) => (anchors.current[gid] ??= { get current() { const e = gRefs.current[gid] ?? null; return e?.classList.contains('ic-folded') ? overRef.current : e; } });
  /* ONE chip row that never wraps (shared chip fit, as Image's): group words drop first, then chips fold into the ⋯ menu */
  const chipsRef = useRef<HTMLDivElement>(null); const overRef = useRef<HTMLButtonElement>(null); useChipFit(chipsRef, { over: '.wf-fold', observe: true });
  const [overRows, setOverRows] = useState<RowOverflowRow[]>([]);
  const openOver = () => { if (pop === 'over') { setPop(''); return; } const c = chipsRef.current; if (!c) return;
    setOverRows([...c.querySelectorAll<HTMLElement>('.wf-fold.ic-folded')].map(el => foldedRow(el)).filter((r): r is RowOverflowRow => !!r)); setPop('over'); };
  const modelRef = useRef<HTMLButtonElement>(null); const slotIn = useRef<Record<string, HTMLInputElement | null>>({});
  useDockHeight(dock, '.vs'); usePromptGrow(promptRef, prompt);
  useToolModels(tool.id); const tm = modelOfEngine(tool.id, prov);
  const provInfo: any = tool.providers.find(p => p.id === prov);
  const pickedFx: any = (() => { const g = bar.controls.find(c => c.kind === 'gallery' && c.from === 'presets'); const v = g ? vals[g.field] : ''; return v ? (tool.presets ?? []).find((p: any) => p.id === v && Array.isArray(p.providers) && p.providers.includes(prov)) : null; })();
  /* the real model: a LoRA effect names its LoRA too (LTX-2.5 22B + XPLDV LoRA) */
  const modelName = pickedFx?.modelName ?? (tm ? shownName(tm) : null) ?? provInfo?.displayName ?? provInfo?.name ?? prov;

  /* ---- options: what this tool and model take ---- */
  const tileOpts = (field: string) => appFieldsOf(tool).find(f => f.name === field)?.options ?? [];
  const optionsOf = (c: VBarControl): VBarOption[] => {
    const ti = inp(c.field); const allowed: string[] | null = (() => {
      if (c.from === 'durations') { const d = cfg.durationsByProvider?.[prov] ?? cfg.videoLimits?.[prov]?.durations /* the model's own lengths (UGC Ad, Transitions: Veo 4 / 6 / 8, LTX 6–20); the tool's list is every model's union */ ?? cfg.durations ?? inp('duration')?.options; return Array.isArray(d) ? d.map(String) : null; }
      if (c.from === 'resolutions') { const r = cfg.resolutionsByProvider?.[prov] ?? inp('resolution')?.byProvider?.[prov] /* a model's own sizes on the input (Re-shoot: H3 CrossView 480p / 768p) */ ?? (cfg.resolutions?.length ? cfg.resolutions : inp('resolution')?.options); return Array.isArray(r) ? r.map(String) : null; }
      if (c.from === 'presets') return (tool.presets ?? []).filter((p: any) => !Array.isArray(p.providers) || !p.providers.length || p.providers.includes(prov)).map(p => p.id);
      if (c.kind === 'tiles') return tileOpts(c.field).map(o => o.value);
      const o = ti?.byProvider?.[prov] ?? ti?.options; if (!Array.isArray(o) || !o.length) return null;
      /* a length the tool takes but this model doesn't (videoCaps durations: LTX-2.5 22B local 2–5 s in Transitions) is never offered (2026-10-26) */
      const vl: number[] | undefined = c.field === 'duration' ? cfg.videoLimits?.[prov]?.durations : undefined; return (vl?.length ? o.filter((x: any) => vl.includes(Number(x))) : o).map(String); })();
    if (c.options) return allowed ? c.options.filter(o => allowed.includes(o.value)) : c.options;
    if (c.from === 'presets') return (tool.presets ?? []).filter(p => allowed!.includes(p.id)).map((p: any) => ({ value: p.id, label: p.label, hint: p.category ?? p.group }));
    const named = new Map<string, string>([...((ti?.choices ?? []) as any[]).map(x => [String(x.value), String(x.label)] as [string, string]),
      ...(((cfg.gallery?.fields ?? []) as any[]).find(f => f.name === c.field)?.options ?? []).map((x: any) => [String(x.value), String(x.label)] as [string, string]),
      ...(c.field === 'resolution' ? Object.entries<string>(cfg.videoLimits?.[prov]?.resolutionLabels ?? {}) : [])]); /* a model's own tier names (LTX-2.5 22B: Draft / Sharper) */
    return (allowed ?? []).map(v => ({ value: v, label: `${c.prefix ?? ''}${named.get(v) ?? pretty(v)}${c.suffix && /^\d/.test(v) ? c.suffix : ''}` }));
  };
  /** What the extra sees now (its functions run while the bar renders). */
  const live = (): BarLive => ({ ...ctx0, prov, setProvider, providers, files, prompt, setPrompt, busy, pop, setPop, anchorOf, chipRef: gid => el => { gRefs.current[gid] = el; }, dock,
    valOf: f => { const c = bar.controls.find(x => x.field === f); return c ? valOf(c) : vals[f] ?? ''; }, slotShown: s => slotShown(s) });
  const photoIn = (slot: string) => !!files[slot]?.[0]?.photo;
  const slotShown = (s: VBarSlot): boolean => (!s.providers || s.providers.includes(prov)) && (extra.slotShown?.(s, live()) ?? true);
  /* the gallery pick (effect, move, look): some controls and the prompt follow it (Footage Effects: Extend the frame's shape, Remove an object's line) */
  const galleryPick = (() => { const g = bar.controls.find(c => c.kind === 'gallery'); return g ? vals[g.field] ?? '' : ''; })();
  const promptCfg = bar.prompt.byPreset?.[galleryPick] ?? bar.prompt;
  const shown = bar.controls.filter(c => (!c.providers || c.providers.includes(prov)) && (!c.whenPhoto || photoIn(c.whenPhoto)) && (!c.whenPreset || c.whenPreset.includes(galleryPick)) && (extra.controlShown?.(c, live()) ?? true));
  /** The value a control sends now: the pick if this model takes it, else the recipe's default, the tool's default, the first option. */
  const valOf = (c: VBarControl): string => {
    if (c.kind === 'toggle') return vals[c.field] ?? c.default ?? '1';
    if (c.kind === 'tiles') { const os = tileOpts(c.field); const w = vals[c.field]; if (w && os.some(o => o.value === w)) return w; const d = c.default ?? inp(c.field)?.default; return d != null && os.some(o => o.value === String(d)) ? String(d) : os[0]?.value ?? ''; }
    if (c.kind === 'slider') return vals[c.field] ?? c.default ?? String(c.min ?? 0);
    const os = optionsOf(c); const ok = (v?: string | null) => v != null && v !== '' && os.some(o => o.value === v);
    const want = vals[c.field]; if (ok(want)) return want!;
    if (c.kind === 'gallery') return ok(c.default) ? c.default! : ''; /* a gallery pick (style, move, effect) is yours to make */
    const td = c.field === 'duration' ? cfg.defaultDurationByProvider?.[prov] ?? inp('duration')?.default : c.field === 'resolution' ? cfg.defaultResolutionByProvider?.[prov] ?? inp('resolution')?.default : inp(c.field)?.default;
    return ok(c.default) ? c.default! : ok(td != null ? String(td) : null) ? String(td) : os[0]?.value ?? '';
  };
  const labelOf = (c: VBarControl, v: string) => c.kind === 'slider' ? (c.percent ? `${Math.round(Number(v) * 100)}%` : v) : c.kind === 'tiles' ? tileOpts(c.field).find(o => o.value === v)?.label ?? pretty(v) : optionsOf(c).find(o => o.value === v)?.label ?? pretty(v);

  /* ---- deep links: ?preset=<id> picks the gallery item (Camera Moves, Photo FX, Restyle), ?pick=<group> opens that option, ?ext= sets Extend's length ---- */
  const pendingPreset = useRef(q0.preset);
  useEffect(() => { const sp = new URLSearchParams(location.search); const g = shown.find(c => c.kind === 'gallery'); let dirty = false;
    const pre = pendingPreset.current || sp.get('preset'); if (g && pre && optionsOf(g).some(o => o.value === pre)) { setVal(g.field, pre); pendingPreset.current = ''; dirty = true; }
    const ext = sp.get('ext'); if (ext && bar.controls.some(c => c.field === 'extendSeconds')) { setVal('extendSeconds', ext); dirty = true; }
    const pick = sp.get('pick'); if (pick && bar.groups.some(x => x.id === pick)) setTimeout(() => setPop(`g:${pick}`), 300);
    if (dirty || pick) { ['preset', 'pick', 'ext'].forEach(k => sp.delete(k)); history.replaceState(history.state, '', `${location.pathname}?${sp}`); } }, [wf.id, prov]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- slots ---- */
  const reqOf = (s: VBarSlot) => { const x = extra.slotRequired?.(s, live()); if (x != null) return x; return s.required === 'by-model' ? (inp(s.name)?.requiredByProvider?.[prov] ?? inp(s.name)?.required ?? true) !== false : s.required; };
  const maxOf = (s: VBarSlot) => extra.slotMax?.(s, live()) ?? s.multiple;
  /** How many of a slot's files this model takes: the rest stay in the slot, marked "Not used", and are never sent or priced. */
  const usedOf = (s: VBarSlot) => Math.max(1, maxOf(s) ?? 1);
  const sentOf = (s: VBarSlot) => (files[s.name] ?? []).slice(0, usedOf(s));
  /** a click on a filled thumbnail changes THAT file (index); the "+" tile adds */
  const replaceAt = useRef<{ slot: string; i: number } | null>(null);
  /** the slots as of now (a Recreate empties them in onReset before the next render: the room check must see that) */
  const filesRef = useRef(files); filesRef.current = files;
  const takeFiles = async (s: VBarSlot, fs: File[], at?: number) => { const kinds = s.altImage ? [s.kind, 'image' as const] : [s.kind];
    const want: File[] = [];
    for (const f of fs) { const kind = kinds.find(k => fileFits(k, f)); if (!kind) { toast(wrongTypeText(f.name, kinds), 'warn'); continue; } const ready = await prepUpload(f, kind); if ('error' in ready) { toast(ready.error, 'error'); continue; } if (ready.note) toast(ready.note); want.push(ready.file); }
    if (!want.length) return;
    const mx = usedOf(s); const have = filesRef.current[s.name] ?? [];
    /* change one (a thumbnail clicked, or a one-file slot), else add up to the model's most; the extra ones a lower-max model leaves stay put */
    const one = at != null || mx <= 1; const room = one ? 1 : Math.max(0, mx - have.length);
    if (!one && want.length > room) toast(room ? `Added ${room} of ${want.length}: ${modelName} takes up to ${mx} ${s.kind === 'image' ? 'images' : 'files'} here.` : `${modelName} takes up to ${mx} here. Remove one first.`, 'warn');
    const metas = await Promise.all(want.slice(0, room).map(f => metaOf(s.kind, f))); if (!metas.length) return;
    setFiles(m => { const cur = m[s.name] ?? []; if (one) { const k = Math.min(at ?? 0, cur.length); const n = [...cur]; n.splice(k, 1, metas[0]); return { ...m, [s.name]: n }; }
      return { ...m, [s.name]: [...cur, ...metas] }; }); extra.onSlot?.(s, metas[0], live()); };
  /** images before this slot's first (in shown slots): Image N = @imageN across the bar */
  const imgBase = (s: VBarSlot) => { let n = 0; for (const x of shownSlots) { if (x === s || x.name === s.name) break; if (x.kind === 'image') n += sentOf(x).length; } return n; };
  const clearSlot = (s: VBarSlot, i?: number) => { const n = files[s.name]?.length ?? 0;
    /* removing a sent image moves later @image mentions down (@image3 → @image2), as Create Image does; its own become @image? */
    if (s.kind === 'image' && promptCfg.mode !== 'hidden') { const from = i ?? 0; const to = i == null ? Math.min(n, usedOf(s)) : from + 1; let p = prompt; for (let k = Math.min(to, usedOf(s)) - 1; k >= from; k--) p = renumberMentions(p, 'image', imgBase(s) + k + 1); if (p !== prompt) setPrompt(p); }
    setFiles(m => ({ ...m, [s.name]: i == null ? [] : (m[s.name] ?? []).filter((_, j) => j !== i) })); };
  /** reorder a slot's files (arrows or drag): Image 1, Image 2… follow the new order */
  const moveFile = (s: VBarSlot, from: number, to: number) => setFiles(m => { const l = [...(m[s.name] ?? [])]; if (to < 0 || to >= l.length || from === to) return m; const [x] = l.splice(from, 1); l.splice(to, 0, x); return { ...m, [s.name]: l }; });
  const dragFrom = useRef<{ slot: string; i: number } | null>(null);
  const openSlot = (name: string, at?: number) => { replaceAt.current = at == null ? null : { slot: name, i: at }; const el = slotIn.current[name]; if (!el) return;
    /* replacing one file: one pick, even when the slot is full (data-picker-max is read as the picker opens) */
    const was = el.getAttribute('data-picker-max'); if (at != null) el.setAttribute('data-picker-max', '1'); openPickerFor(el); if (at != null) { if (was == null) el.removeAttribute('data-picker-max'); else el.setAttribute('data-picker-max', was); } };
  /* a result handed over (Extend, Upscale, Turn to video…), Recreate, or a library file: into the matching slot */
  const firstOf = (k: VBarSlot['kind']) => bar.slots.find(s => s.kind === k);
  /** A Recreate's (or example's) files: the slot gets exactly these, in this order (never added to what it held; the model's "Not used" rule still marks extras). */
  const putFiles = async (s: VBarSlot, fs: File[]) => { const metas = await Promise.all(fs.map(f => metaOf(s.kind, f))); if (!metas.length) return; setFiles(m => ({ ...m, [s.name]: metas })); extra.onSlot?.(s, metas[0], live()); };
  usePrefill({ scope: wf.id, onReset: () => { filesRef.current = {}; setFiles({}); setRcRoute(null); extra.onReset?.(); },
    onVideo: v => { const s = firstOf('video'); if (!s) return; const f: SlotFile = { file: v.file, url: v.url, sec: v.duration, w: v.w, h: v.h }; setFiles(m => ({ ...m, [s.name]: [f] })); extra.onSlot?.(s, f, live()); },
    onImage: r => { const s = firstOf('image'); if (s) void takeFiles(s, [r.file]); },
    onAudio: r => { const s = firstOf('audio'); if (s) void takeFiles(s, [r.file]); },
    /* a hand-off (one result, ?fromJob / Use in…) adds to the slot; a Recreate's full set replaces it */
    onRefs: (rs, o) => { if (o?.handoff) { const s = bar.slots.find(x => x.name === 'refs') ?? firstOf('image'); if (s) void takeFiles(s, rs.map(r => r.file)); return; }
      const s = bar.slots.find(x => x.name === 'refs'); if (s) void putFiles(s, rs.map(r => r.file)); },
    onFiles: (slot, rs) => { if (extra.onFiles?.(slot, rs.map(r => r.file))) return; const alt = bar.slots.find(x => x.altImage === slot); if (alt) { void putFiles(alt, rs.map(r => r.file)); return; }
      const s = bar.slots.find(x => x.name === slot); if (s && slot !== 'video' && slot !== 'image') void putFiles(s, rs.map(r => r.file)); },
    onRecreate: r => { const f = r.form ?? {}; extra.onRecreate?.(f); if (r.seed) { setLastSeed(r.seed); setSeedOn(false); } let ty: any = f.types; try { ty = JSON.parse(ty); } catch { ty = ty ? [ty] : []; } const t0 = Array.isArray(ty) ? String(ty[0] ?? '') : '';
      setVals(v => { const n = { ...v }; for (const c of bar.controls) { const w = f[c.field] ?? (c.send === 'types' || c.send === 'field+types' ? t0 : undefined); if (w != null && w !== '') n[c.field] = String(w); } if (f.fit === 'crop' || f.fit === 'pad') n.fit = f.fit; if (bar.enhance != null && f.enhance != null) n.enhance = f.enhance === '1' ? '1' : '0'; return n; });
      if (f.prompt != null && promptCfg.mode !== 'hidden') setPrompt(String(f.prompt)); const m = r.providerAvailable ? (r.model ?? f.provider) : f.provider; if (m && providers.some(p => p.id === m)) setProvider(m);
      setRcRoute(m && f.route && r.providerAvailable && providers.some(p => p.id === m) ? { engine: m, modelKey: r.modelKey ?? null, route: String(f.route) } : null); } });

  /* Enhance (Transitions, Camera Moves, UGC Ad): the shared sparkle chip, starting as the recipe says; off sends enhance=0, the prompt as written */
  const enhCan = bar.enhance != null && promptCfg.mode !== 'hidden'; const enhOn = (vals.enhance ?? bar.enhance) === '1';
  /* ---- what is sent: the fixed values, every shown control, the prompt, the files ---- */
  const formVals = (): Record<string, string> => { const o: Record<string, string> = { ...(bar.fixed ?? {}), ...(enhCan ? { enhance: enhOn ? '1' : '0' } : {}) };
    for (const c of shown) { const v = valOf(c); const t = typesOf(c, v); if (t) o.types = t; if (c.kind === 'toggle' && c.omitOff && v === '0') continue; if (c.send !== 'types' && v !== '') o[c.field] = v; }
    for (const [slot, ty] of Object.entries(bar.typesWhenFile ?? {})) { const s = bar.slots.find(x => x.name === slot); if (s && files[slot]?.length && slotShown(s)) { o.types = ty; break; } } /* UGC Ad: a product or presenter photo runs as reference video */
    if (bar.slots.some(s => s.kind === 'video' && slotShown(s) && files[s.name]?.length && !files[s.name][0].photo)) o.fit = vals.fit === 'crop' ? 'crop' : 'pad'; /* Fit to model (barExtras/VideoFit.tsx): Keep everything (pad) or Crop to fill */
    Object.assign(o, extra.form?.(live()) ?? {}); for (const k of extra.omit?.(live()) ?? []) delete o[k];
    return o; };
  const fv = formVals();
  const clip = bar.slots.filter(s => s.kind === 'video').map(s => files[s.name]?.[0]).find(x => x?.sec != null && x.sec > 0); const clipSec = clip?.sec;
  /* the quote prices this exact run: the clip's real seconds and size once it's loaded (else the example / sample it came from, or the server's own estimate) */
  const qParams: Record<string, string> = { ...Object.fromEntries(Object.entries(fv).filter(([k]) => k !== 'prompt')), ...(rcRouteOn ? { route: rcRouteOn } : {}),
    ...(clip ? { seconds: String(Math.round(clipSec! * 100) / 100), ...(clip.w && clip.h ? { width: String(clip.w), height: String(clip.h), sourceResolution: `${Math.min(clip.w, clip.h)}p` } : {}) }
      : quoteParams().seconds ? {} : clipSrc.exId ? { example: clipSrc.exId } : clipSrc.sampleUrl ? { sample: clipSrc.sampleUrl } : {}) };
  /* the photos this run carries (image=1, lastFrame=1 …), as the submit sends them: apps switch mode on them (UGC Ad: a product photo = references; Transitions: start + end frame), so the quote prices that same job */
  for (const s of bar.slots) { const fl = files[s.name] ?? []; if (s.kind === 'video' || !fl.length || !slotShown(s)) continue; qParams[fl[0].photo && s.altImage ? s.altImage : s.name] = '1'; }
  { const sp = files.speech?.[0]; if (sp?.sec != null && sp.sec > 0 && bar.slots.some(s => s.name === 'speech' && slotShown(s))) qParams.speechSeconds = String(Math.round(sp.sec * 100) / 100); } /* Lip Sync: the speech length sets the clip length and price, and hosted H3 takes 2–15 s (the quote says so before the run) */
  { const ext = clip?.file?.name.match(/\.([a-z0-9]+)$/i)?.[1]; if (clip && ext) qParams.videoFormat = ext.toLowerCase(); } /* Fit to model: the container (Topaz takes MP4) */
  for (const [k, v] of Object.entries(extra.quote?.(live()) ?? {})) { if (v == null) delete qParams[k]; else qParams[k] = v; }
  const q0q = useToolQuote(tool.id, prov, qParams); const q = extra.wrapQuote ? extra.wrapQuote(q0q, live()) : q0q;
  const vfit = useVideoFit({ toolId: tool.id, prov, clip, seconds: Number(qParams.seconds) || null, mode: vals.fit === 'crop' ? 'crop' : 'pad', setMode: m => setVal('fit', m), pop, setPop, anchorOf, chipRef: gid => el => { gRefs.current[gid] = el; }, dock, busy });

  /* ---- pre-flight: every reason it can't run yet, in order; Generate shows the first ---- */
  const gallery = shown.find(c => c.kind === 'gallery');
  const problems: PreflightProblem[] = (() => { const ps = preflightProblems({ freeLocal: hasFreeLocal(tool.id),
    slots: bar.slots.filter(slotShown).map(s => ({ ...s, ...(extra.slotInfo?.(s, live()) ?? {}) })).map(s => ({ name: s.name, label: s.label, required: reqOf(s), filled: !!files[s.name]?.length, missing: s.missing })),
    prompt: promptCfg.mode === 'required' && !prompt.trim() ? { missing: 'Write a prompt' } : null,
    pick: gallery && !gallery.optional && !valOf(gallery) ? { group: gallery.group, missing: `Pick ${gallery.field === 'preset' ? 'a style' : gallery.field === 'move' ? 'a camera move' : gallery.field === 'look' ? 'a look' : 'an effect'}` } : null,
    quote: q, modelName });
    /* the extra's own steps (Object Swap: what to replace; Re-shoot: an angle), right after the inputs */
    const more: PreflightProblem[] = (extra.needs?.(live()) ?? []).map((n): PreflightProblem => { const fix: PreflightFix = n.model ? { kind: 'pick-model', label: 'Pick model…' } : n.slot ? { kind: 'choose-photo', label: 'Choose…', args: { slot: n.slot } } : { kind: 'open-group', label: 'Open', args: { group: n.group ?? '' } };
      return { code: n.model ? 'model_cant_run' : n.slot ? 'photo_missing' : 'pick_missing', stage: n.model ? 'model' : 'inputs', message: n.missing, fix }; });
    const at = ps.filter(p => p.stage === 'inputs').length; return [...ps.slice(0, at), ...more, ...ps.slice(at)]; })();
  useEffect(() => { if (pfOpen && !problems.length) setPfOpen(false); }); // eslint-disable-line react-hooks/exhaustive-deps
  const runFix = async (f: PreflightFix) => { const a: any = f.args ?? {};
    switch (f.kind) {
      case 'choose-photo': setPfOpen(false); if (a.slot) openSlot(String(a.slot)); return;
      case 'focus-prompt': setPfOpen(false); requestAnimationFrame(() => promptRef.current?.focus()); return;
      case 'open-group': setPfOpen(false); setPop(`g:${a.group}`); return;
      case 'pick-model': setPfOpen(false); setPop('model'); return;
      case 'add-key': case 'download': case 'turn-on': case 'install-node': case 'set-up': { const pl = setupPlacesOf(tm, q).find((x: any) => x.runOn === a.runOn) ?? setupPlacesOf(tm, q)[0]; if (!pl) return;
        try { await doSetupPlace(tool.id, tm, prov, pl); } catch (er) { toast((er as Error).message || 'That didn’t work. Try again.', 'error'); } if (f.kind !== 'download') setPfOpen(false); return; }
      default: setPfOpen(false);
    } };

  const fdById = useRef(new Map<string, FormData>());
  const submit = async (fd: FormData) => { const ph: JobState = { id: '', toolId: tool.id, status: 'queued', stage: 'uploading', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, warnings: [], parentId: null, input: {} };
    add(ph); setBusy(true);
    try { const r = await createJob(tool.id, fd, { showsIssues: true }); fdById.current.set(r.id, cloneForm(fd)); r.warnings?.forEach(w => toast(w, 'warn'));
      setJobs(js => js.some(j => j.id === r.id) ? js.filter(j => j !== ph) : js.map(j => j === ph ? { ...ph, id: r.id, provider: r.provider } : j)); setTimeout(refresh, 50); }
    catch (e: any) { setJobs(js => js.filter(j => j !== ph)); const is = issuesOf(e); toast(is[0]?.message || e?.message || 'That didn’t start. Nothing was charged.', 'error'); }
    finally { setBusy(false); } };
  const generate = () => { if (problems.length) { setPfOpen(o => !o); return; } if (busy) return; const fd = new FormData();
    for (const s of bar.slots) if (slotShown(s)) for (const f of sentOf(s)) fd.append(f.photo && s.altImage ? s.altImage : s.name, f.file, f.file.name);
    for (const [k, f] of extra.files?.(live()) ?? []) fd.append(k, f, f.name);
    for (const [k, v] of Object.entries(fv)) fd.append(k, v);
    if (promptCfg.mode !== 'hidden') fd.set('prompt', prompt);
    const seed = seedOn && lastSeed != null ? lastSeed : Math.floor(Math.random() * 1e6); fd.append('seed', String(seed)); if (!seedOn) setLastSeed(seed);
    if (prov) { fd.append('provider', prov); const pq = pinQ(prov); const rt = rcRouteOn ?? (pq as any).route; if (rt) fd.append('route', rt); }
    if (q0.mockFail) fd.set('simulate', q0.mockFail);
    if (!extra.beforeSubmit) { void submit(fd); return; }
    setBusy(true); void extra.beforeSubmit(fd, live()).then(f => { setBusy(false); if (f) void submit(f); }, () => setBusy(false)); };

  /* ---- the bar ---- */
  const menuItems: MenuItem[] = providers.map(p => ({ id: p.id, name: (p as any).displayName ?? p.name, p }));
  const groupChips = bar.groups.map(g => { const cs = shown.filter(c => c.group === g.id && c.kind !== 'toggle'); if (!cs.length) return null;
    const single = cs.length === 1 && cs[0].kind === 'choice' && optionsOf(cs[0]).length <= 1;
    const sum = cs.map(c => { const v = valOf(c); return v === '' ? (c.kind === 'choice' && c.options?.some(o => o.value === '') ? labelOf(c, v) /* an empty pick with its own name (Finish: One look only) */ : '') : c.kind === 'gallery' ? labelOf(c, v) : labelOf(c, v); }).filter(Boolean).join(' · ') || (gallery?.group === g.id ? (gallery.optional ? 'None' : `Pick ${g.label.toLowerCase()}`) : '');
    const icon = g.id === 'shape' && aspectWH(valOf(cs[0])) ? (() => { const wh = aspectWH(valOf(cs[0]))!; return <AspectShape w={wh[0]} h={wh[1]} />; })() : <GIcon name={g.icon} />;
    if (single) return <span key={g.id} className="ic-chip ic-static wf-fold" aria-label={`${g.label}: ${sum}`} data-testid={`vbar-group-${g.id}`} {...tip(`${g.label}: the only option this model has`)}>{icon}<b>{sum}</b></span>;
    const missing = gallery?.group === g.id && !gallery.optional && !valOf(gallery);
    return <button key={g.id} ref={el => { gRefs.current[g.id] = el; }} type="button" className={`ic-chip wf-grp wf-fold${pop === `g:${g.id}` ? ' on' : ''}${missing ? ' vbar-need' : ''}`} aria-haspopup="dialog" aria-expanded={pop === `g:${g.id}`}
      data-testid={`vbar-group-${g.id}`} aria-label={`${g.label}: ${sum}`} {...tip(pop === `g:${g.id}` ? null : `${g.label}: ${sum}`)} onClick={() => setPop(pop === `g:${g.id}` ? '' : `g:${g.id}`)}>
      {icon}<span className="wf-grp-l">{g.label}</span><b>{sum}</b></button>; });
  /* Sound toggles (Extend's sound, Keep the clip's sound, Re-shoot's new sound) sit in Settings, as on Create Video (SoundSetting.tsx, 2026-10-27);
   * the Settings button wears a speaker badge while one is on. It sits beside ⋯ and never folds (a 32 px square), so the sound state stays in sight. */
  const sndCtl = shown.filter(c => c.kind === 'toggle'); const sndAny = sndCtl.some(c => valOf(c) !== '0');
  const sndSum = sndCtl.map(c => `${c.label} ${valOf(c) !== '0' ? 'on' : 'off'}`).join(', ');
  const toggles = sndCtl.length ? <SettingsChip ref={el => { gRefs.current.snd = el; }} testId="vbar-settings" open={pop === 'g:snd'} soundOn={sndAny} ariaLabel={`Settings: ${sndSum}`} tip={tip(pop === 'g:snd' ? null : `Settings · ${sndSum}`)} onClick={() => setPop(pop === 'g:snd' ? '' : 'g:snd')} /> : null;
  const soundPop = sndCtl.length ? <BarPopover open={pop === 'g:snd'} anchor={anchorOf('snd')} avoid={dock} watch={dock} placement="top" gap={8} onClose={() => setPop('')} label="Settings" role="dialog" testId="vbar-pop-settings" width={300}><div className="bp-wrap">
    <SoundSection testId="vbar-set-sound" switches={sndCtl.map(c => { const on = valOf(c) !== '0'; return { key: c.field, label: c.label, on, testId: `vbar-toggle-${c.field}`, hint: c.onLabel || c.offLabel ? (on ? c.onLabel : c.offLabel) : undefined, onChange: (v: boolean) => setVal(c.field, v ? '1' : '0') }; })} /></div></BarPopover> : null;
  /* a tiles option (UGC Ad's presenters): the same tiles as the app screen (tools/app/AppFields AppTiles), in a popover */
  const tilesPanel = (c: VBarControl) => { const g = bar.groups.find(x => x.id === c.group)!; const v = valOf(c); const own = c.field === 'presenter' && bar.slots.some(s => s.name === 'presenterImage');
    return <BarPopover key={`t-${c.field}`} open={pop === `g:${c.group}`} anchor={anchorOf(c.group)} avoid={dock} watch={dock} placement="top" gap={8} onClose={() => setPop('')} label={g.label} testId={`vbar-pop-${c.group}`} width={440} className="vbar-tiles-pop">
      <PopSection label={c.label} testId={`vbar-ctl-${c.field}`}><AppTiles className="vbar-tiles" field={c.field} label={c.label} options={tileOpts(c.field)} value={v} onPick={x => { setVal(c.field, x); setPop(''); }} /></PopSection>
      {own && <PopNote testId="vbar-tiles-own">{files.presenterImage?.length ? 'Your presenter photo leads the shot; the tile still sets the place.' : 'Or use your own presenter: add their photo in the Face slot.'}</PopNote>}
    </BarPopover>; };

  const groupPanel = (gid: string) => { const cs = shown.filter(c => c.group === gid && c.kind !== 'toggle' && c.kind !== 'gallery' && c.kind !== 'tiles'); const g = bar.groups.find(x => x.id === gid)!;
    return <BarPopover key={gid} open={pop === `g:${gid}`} anchor={anchorOf(gid)} avoid={dock} watch={dock} placement="top" gap={8} onClose={() => setPop('')} label={g.label} testId={`vbar-pop-${gid}`} width={cs.some(c => optionsOf(c).length > 5 || optionsOf(c).some(o => o.hint)) ? 320 : 288}>
      {cs.map(c => { const v = valOf(c); const os = optionsOf(c);
        if (c.kind === 'slider') return <PopSection key={c.field} label={c.label} aside={labelOf(c, v)} testId={`vbar-ctl-${c.field}`}><input className="vbar-range" type="range" min={c.min} max={c.max} step={c.step} value={Number(v)} aria-label={c.label} aria-valuetext={labelOf(c, v)} onChange={e => setVal(c.field, e.target.value)} /></PopSection>;
        const ofm: { ext?: string; codec?: string; alpha?: boolean } | undefined = cfg.outputFormats?.[v]; /* Remove BG: Transparent → WebM with alpha */
        const note = ofm?.ext ? <PopNote testId={`vbar-out-${c.field}`}>Output: {ofm.ext.toUpperCase()}{ofm.codec ? ` (${ofm.codec.toUpperCase()})` : ''}{ofm.alpha ? ' with transparency' : ''}</PopNote> : null;
        if (os.length <= 5 && !os.some(o => o.hint) && os.reduce((n, o) => n + o.label.length, 0) <= 24 && !c.field.startsWith('aspect')) return <PopSection key={c.field} label={c.label} testId={`vbar-ctl-${c.field}`}><Segmented label={c.label} value={v} options={os.map(o => ({ value: o.value, label: o.label, testId: `vbar-opt-${c.field}-${o.value}` }))} onChange={x => setVal(c.field, x)} onCommit={() => cs.length === 1 && setPop('')} />{note}</PopSection>;
        return <PopSection key={c.field} label={c.label} testId={`vbar-ctl-${c.field}`}><PopList label={c.label} role="radiogroup" cols={os.length > 8 ? 2 : undefined}>{os.map(o => { const wh = c.field === 'aspect' ? aspectWH(o.value) : null;
          return <PopRow key={o.value} role="radio" selected={o.value === v} testId={`vbar-opt-${c.field}-${o.value}`} icon={c.field === 'aspect' ? (wh ? <AspectShape w={wh[0]} h={wh[1]} /> : <AspectIcon size={16} />) : undefined} label={o.label} hint={o.hint} onClick={() => { setVal(c.field, o.value); if (cs.length === 1 && !cfg.outputFormats) setPop(''); }} />; })}</PopList>{note}</PopSection>; })}
    </BarPopover>; };
  /** A preset that runs on other models only (Photo FX Exploded view → LTX-2.5 22B + its LoRA; H3 camera moves): still listed, named by its model, and picking it switches to that model. */
  const ownModelOf = (p: any): string | null => Array.isArray(p.providers) && p.providers.length && !p.providers.includes(prov) ? p.providers.find((x: string) => providers.some(m => m.id === x)) ?? null : null;
  const galleryItems = (c: VBarControl): LookItem[] => [...(c.optional ? [{ id: '', label: `No ${c.label.toLowerCase()}`, sub: 'Your prompt and photos only', pinned: true, testId: 'vbar-look-none', selected: !valOf(c), title: `No ${c.label.toLowerCase()}`, image: null, video: null, onPick: () => { setVal(c.field, ''); setPop(''); } } as LookItem] : []),
    ...(tool.presets ?? []).filter(p => optionsOf(c).some(o => o.value === p.id) || ownModelOf(p)).map((p: any) => ({ id: p.id, label: p.label, sub: ownModelOf(p) ? p.modelName ?? p.category ?? p.group : p.category ?? p.group, keywords: `${p.description ?? ''} ${p.prompt ?? ''} ${p.modelName ?? ''}`, testId: `vbar-look-${p.id}`,
    selected: valOf(c) === p.id, title: p.description ?? p.label, /* never the raw prompt (copy rule) */ image: p.posterUrl || p.swatchUrl || null, video: p.previewUrl || p.previewWebm ? { mp4: p.previewUrl, webm: p.previewWebm, poster: p.posterUrl ?? null } : null,
    onPick: () => { const own = ownModelOf(p); if (own) setProvider(own); setVal(c.field, p.id); setPop(''); } }))];

  const shownSlots = bar.slots.filter(slotShown).map(s => { const x = extra.slotInfo?.(s, live()); return x ? { ...s, ...x } : s; }); /* the extra may rename a slot for this model */
  const MV = { l: 'M10 3 5 8l5 5', r: 'm6 3 5 5-5 5' };
  const mvIcon = (d: string) => <svg width="8" height="8" viewBox="0 0 16 16" aria-hidden><path d={d} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  /** a multi-file slot's row (stack + "+N") anchors its popover, so either toggles it (one stable anchor per slot) */
  const stackEls = useRef<Record<string, HTMLElement | null>>({}); const stackAnchors = useRef<Record<string, { readonly current: HTMLElement | null }>>({});
  const stackAnchor = (name: string) => (stackAnchors.current[name] ??= { get current() { return stackEls.current[name] ?? null; } });
  /** One file of a slot: inline (a one-file slot) or in a multi-file slot's popover grid (numbered, reorder by arrows / drag / Alt+arrows, remove, click to change). */
  const fileTile = (s: VBarSlot, f: SlotFile, j: number, o: { multi: boolean; numbered: boolean; base: number; used: number; count: number }) => {
    const off = j >= o.used; const name = o.numbered ? `Image ${o.base + j + 1}` : s.label; const why = `Not used by ${modelName} (max ${o.used})`; const canMove = o.multi && o.count > 1;
    return <span key={f.url} className={`wf-slot full vbar-slot vbar-${f.photo ? 'image' : s.kind}${off ? ' vbar-off' : ''}`} data-testid={`vbar-slot-${s.name}`} data-filled="1" data-index={o.multi ? j : undefined} data-unused={off ? '1' : undefined}
      onDragStart={canMove ? e => { dragFrom.current = { slot: s.name, i: j }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-vbar-file', `${s.name}:${j}`); } : undefined}
      onDragEnd={() => { dragFrom.current = null; }}
      onDragOver={canMove ? e => { if (dragFrom.current?.slot === s.name) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; } } : undefined}
      onDrop={canMove ? e => { const d = dragFrom.current; if (d?.slot !== s.name) return; e.preventDefault(); e.stopPropagation(); dragFrom.current = null; moveFile(s, d.i, j); } : undefined}>
      <button type="button" className="wf-slot-hit" draggable={canMove || undefined} aria-label={`${o.numbered ? `${name} (${s.label})` : s.label}: ${f.file.name}${f.sec ? `, ${fmtSec(f.sec)}` : ''}${off ? `. ${why}` : ''}. Open preview, Delete removes it${canMove ? ', Alt+arrows move it' : ''}`}
        {...tip(`${o.numbered ? `${name} · ` : ''}${s.label} · ${f.file.name}${f.sec ? ` · ${fmtSec(f.sec)}` : ''}${f.w ? ` · ${f.w}×${f.h}` : ''}${off ? `. ${why}` : ''}. Click to preview${canMove ? ', drag to reorder' : ''}`)}
        onClick={e => { previewAnchor.current = e.currentTarget; setPreview({ slot: s, index: j }); }} aria-haspopup="dialog" onKeyDown={e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearSlot(s, o.count > 1 ? j : undefined); }
          else if (canMove && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); moveFile(s, j, j + (e.key === 'ArrowLeft' ? -1 : 1)); } }}>
        {s.kind === 'image' || f.photo ? <img src={f.url} alt="" draggable={false} /> : s.kind === 'video' ? <VideoThumb src={f.url} /> : <span className="vbar-snd" aria-hidden><AudioIcon size={14} /></span>}
        <b>{off ? 'Not used' : s.kind === 'image' ? name : f.photo ? 'Photo' : fmtSec(f.sec) || s.label}</b></button>
      {canMove && <span className="vbar-move">
        <button type="button" className="vbar-mv" disabled={j === 0} aria-label={`Move ${name} earlier`} data-testid={`vbar-slot-${s.name}-left-${j}`} {...tip('Move earlier')} onClick={() => moveFile(s, j, j - 1)}>{mvIcon(MV.l)}</button>
        <button type="button" className="vbar-mv" disabled={j === o.count - 1} aria-label={`Move ${name} later`} data-testid={`vbar-slot-${s.name}-right-${j}`} {...tip('Move later')} onClick={() => moveFile(s, j, j + 1)}>{mvIcon(MV.r)}</button></span>}
      <button type="button" className="wf-slot-x" aria-label={`Remove ${o.numbered ? name.toLowerCase() : s.label.toLowerCase()}`} data-testid={`vbar-slot-${s.name}-clear`} onClick={() => clearSlot(s, o.count > 1 ? j : undefined)}><CloseIcon size={10} strokeWidth={2.2} /></button></span>; };
  /** The empty / add tile of a slot (click: the shared media picker; drop: files in). */
  const addTile = (s: VBarSlot, o: { fs: SlotFile[]; req: boolean; firstEmpty: boolean; numbered: boolean; base: number; small?: boolean }) => { const K = KIND_ICON[s.kind];
    return <span className={`wf-slot ${o.req ? 'req' : 'opt'}${o.firstEmpty ? ' wf-slot-next' : ''} vbar-slot vbar-${s.kind}${o.small ? ' vbar-add-sm' : ''}`} data-testid={`vbar-slot-${s.name}`} data-next={o.firstEmpty ? '1' : undefined}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); } }} onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); void takeFiles(s, Array.from(e.dataTransfer.files)); }}>
      <button type="button" className="wf-slot-hit" data-ref-trigger aria-haspopup="dialog" aria-label={`Add ${o.numbered && o.fs.length ? `image ${o.base + o.fs.length + 1}` : s.label.toLowerCase()}${o.req ? '' : ' (optional)'}`} {...tip(`${(s.hint ?? '').replace(/\.\s*$/, '')}. Pick from your library, upload or drop`)} onClick={() => openSlot(s.name)}>{o.fs.length ? <PlusIcon size={14} /> : <K size={14} />}{!o.small && <SlotLabel text={o.fs.length ? 'Add' : s.label} />}</button>
      {!o.small && <button type="button" className="wf-slot-up" aria-label={`Upload ${s.label.toLowerCase()} from this computer`} data-testid={`vbar-slot-${s.name}-upload`} {...tip('Upload from this computer')} onClick={() => { replaceAt.current = null; withNativePicker(() => slotIn.current[s.name]?.click()); }}>
        <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden><path d="M8 11V3M4.5 6.5 8 3l3.5 3.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}</span>; };
  /** Popovers of the multi-file slots: every file as a labelled grid (Image 1…N), reorder, remove, add; what the model leaves unused is said once. */
  const slotPops: ReactNode[] = [];
  const STACK = 3; /* thumbnails shown in the bar; the rest is "+N" */
  const slotEls = shownSlots.map((s, i) => { const fs = files[s.name] ?? []; const req = reqOf(s); const firstEmpty = shownSlots.find(x => reqOf(x) && !files[x.name]?.length) === s; const mx = maxOf(s);
    const used = usedOf(s); const multi = (!!mx && mx > 1) || fs.length > 1; const numbered = multi && s.kind === 'image'; const base = numbered ? imgBase(s) : 0;
    const canAdd = !fs.length || (!!mx && mx > 1 && fs.length < mx); const o = { multi, numbered, base, used, count: fs.length };
    const input = <input ref={el => { slotIn.current[s.name] = el; }} type="file" hidden accept={acceptOf(s)} multiple={!!mx && mx > 1} data-picker-max={mx && mx > 1 ? Math.max(0, mx - fs.length) : undefined} data-picker-title={s.missing ? `Choose ${s.missing.replace(/^Add /, '')}` : `Choose ${s.label.toLowerCase()}`} data-picker-limits={s.hint} data-picker-frames={s.kind === 'image' ? '' : undefined}
      data-testid={`vbar-slot-${s.name}-input`} onChange={e => { const l = Array.from(e.target.files ?? []); e.currentTarget.value = ''; const r = replaceAt.current?.slot === s.name ? replaceAt.current.i : undefined; replaceAt.current = null; if (l.length) void takeFiles(s, l, r); }} />;
    const arrow = i > 0 && wf.id === 'transitions' && <span className="wf-arrow" aria-hidden>→</span>;
    if (!multi || !fs.length) return <span key={s.name} className={`wf-slot-w vbar-slot-w${multi ? ' vbar-multi vbar-stacked' : ''}`} data-testid={multi ? `vbar-slot-${s.name}-row` : undefined}>{arrow}{input}
      {fs.map((f, j) => fileTile(s, f, j, o))}{canAdd && addTile(s, { fs, req, firstEmpty, numbered, base })}</span>;
    /* several files: a small stack of the first 3 (fixed width, whatever the count) + "+N" or "+"; the grid opens in a popover */
    const pk = `files:${s.name}`; const open = pop === pk; const toggle = () => setPop(open ? '' : pk); const unused = Math.max(0, fs.length - used);
    const what = `${s.label}: ${fs.length} ${s.kind === 'image' ? `image${fs.length > 1 ? 's' : ''}` : `file${fs.length > 1 ? 's' : ''}`}${unused ? `, ${unused} not used by ${modelName} (max ${used})` : ''}`;
    slotPops.push(<BarPopover key={pk} open={open} anchor={stackAnchor(s.name)} avoid={dock} watch={dock} placement="top" gap={8} onClose={() => setPop('')} label={s.label} testId={`vbar-pop-${s.name}`} width={344} className="vbar-files-pop">
      <PopSection label={s.label} aside={mx && mx > 1 ? `${Math.min(fs.length, used)} of ${used} used` : undefined} testId={`vbar-files-${s.name}`}>
        <div className="vbar-files-grid" data-testid={`vbar-files-grid-${s.name}`}>{fs.map((f, j) => fileTile(s, f, j, o))}{canAdd && addTile(s, { fs, req, firstEmpty: false, numbered, base })}</div>
        {unused > 0 ? <PopNote testId={`vbar-files-unused-${s.name}`}>{unused === 1 ? `${numbered ? `Image ${base + used + 1}` : 'The last one'} isn’t` : `${numbered ? `Images ${base + used + 1}–${base + fs.length}` : `The last ${unused}`} aren’t`} used: {modelName} takes up to {used}. They stay here for another model.</PopNote>
          : numbered ? <PopNote>Drag or use the arrows to change the order. Image 1 is @image1 in the prompt.</PopNote> : null}
      </PopSection></BarPopover>);
    const more = fs.length - STACK;
    return <span key={s.name} ref={el => { stackEls.current[s.name] = el; }} className="wf-slot-w vbar-slot-w vbar-multi vbar-stacked" data-testid={`vbar-slot-${s.name}-row`}>{arrow}{input}
      <button type="button" className={`vbar-stack n${Math.min(fs.length, STACK)}${open ? ' on' : ''}`} data-testid={`vbar-slot-${s.name}-stack`} aria-haspopup="dialog" aria-expanded={open} aria-label={`${what}. Open to see, reorder or remove`} {...tip(open ? null : `${what}. Click to see, reorder or remove`)} onClick={toggle}
        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); } }} onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); void takeFiles(s, Array.from(e.dataTransfer.files)); }}>
        {fs.slice(0, STACK).map((f, j) => <span key={f.url} className={`vbar-stack-t${j >= used ? ' vbar-off' : ''}`} style={{ zIndex: STACK - j }} aria-hidden>
          {s.kind === 'image' || f.photo ? <img src={f.url} alt="" draggable={false} /> : s.kind === 'video' ? <VideoThumb src={f.url} /> : <span className="vbar-snd"><AudioIcon size={12} /></span>}</span>)}
        <b className="vbar-stack-n" aria-hidden>{fs.length}</b></button>
      {more > 0 ? <button type="button" className={`vbar-more${unused ? ' warn' : ''}`} data-testid={`vbar-slot-${s.name}-more`} aria-haspopup="dialog" aria-expanded={open} aria-label={`${more} more. ${what}`} {...tip(`${what}. Click to see them all`)} onClick={toggle}>+{more}</button>
        : canAdd ? addTile(s, { fs, req, firstEmpty, numbered, base, small: true }) : <span className="vbar-more-gap" aria-hidden />}
    </span>; });
  /* a file dropped anywhere on the bar goes to the first empty slot that takes it */
  const dropOnBar = (e: React.DragEvent) => { const fs = Array.from(e.dataTransfer.files); if (!fs.length) return; e.preventDefault();
    // Reserve a slot for each file before the asynchronous metadata reads, so two photos fill Person 1 and Person 2.
    const batches = new Map<VBarSlot, File[]>();
    const used = new Map(shownSlots.map(s => [s.name, files[s.name]?.length ?? 0]));
    for (const f of fs) { const kind = kindOfFile(f); const s = kind && shownSlots.find(s => (s.kind === kind || (kind === 'image' && !!s.altImage)) && (used.get(s.name) ?? 0) < usedOf(s));
      if (!s) { toast(kind ? `No empty slot takes ${f.name}. Click an existing file to replace it.` : wrongTypeText(f.name, [...new Set(shownSlots.map(s => s.kind))]), 'warn'); continue; }
      used.set(s.name, (used.get(s.name) ?? 0) + 1); batches.set(s, [...(batches.get(s) ?? []), f]);
    }
    for (const [s, batch] of batches) void takeFiles(s, batch);
  };

  /* the viewer's More menu for a clip made here this visit: the same setup again (new seed or the same one), plus the extra's own (Re-shoot: re-roll one angle) */
  const viewerActions = (j: JobState, close: () => void) => { const fd0 = fdById.current.get(j.id); const act = (f: () => void) => () => { close(); f(); };
    return <>{fd0 && <><button type="button" className="am-item" role="menuitem" data-testid="vv-more" onClick={act(() => { const f = cloneForm(fd0); f.set('seed', String(Math.floor(Math.random() * 1e6))); void submit(f); })}>Generate more<small>Same setup, new seed</small></button>
      <button type="button" className="am-item" role="menuitem" data-testid="vv-same-seed" onClick={act(() => void submit(cloneForm(fd0)))}>Re-run same seed<small>Seed {String(fd0.get('seed') ?? '')}</small></button></>}
      {extra.viewerActions?.(j, close, live(), f => void submit(f), id => fdById.current.get(id))}</>; };
  /* One Video feed (2026-10-26): the feed is the Video page's own (ui/video/VideoPage) and stays mounted when the workflow changes; this bar hands it its runs and actions */
  const hosted = useHostedVideoFeed({ jobs, onSelect: noSelect, viewerActions });
  return <div className={hosted ? 'vs-bar vbar' : 'vs vs-dk vbar'} data-testid={hosted ? 'vs-bar' : 'video-studio'} data-workflow={wf.id}>
    {!hosted && <section className="vs-main" aria-label={wf.name}>
      <VideoFeed jobs={jobs} onSelect={noSelect} tools={tools} workflowId={wf.id} viewerActions={viewerActions} />
    </section>}
    <div className="ic ic2 vs-icd"><div className="ic-dock vs-dock" data-testid="vs-dock" ref={dock} onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); }} onDrop={dropOnBar}>
      <div className="ic-frame"><div className="ic-panel">
        <div className="ic-main">
          {vfit.note}
          <div ref={prowRef} className={`ic-prow${promptCfg.mode === 'hidden' ? ' vbar-noprompt' : ''}`} data-testid="vs-prow">
            <div className="ic-lead wf-strip wf-inputs vbar-slots" data-testid="vbar-slots" data-workflow={wf.id}><div className="wf-slots">{slotEls}</div></div>
            {promptCfg.mode !== 'hidden' ? <><label className="sr-only" htmlFor="app-prompt">Prompt</label>
              <textarea data-enter-submits="" ref={promptRef} id="app-prompt" className="ic-prompt prompt-field" rows={2} aria-label="Prompt" placeholder={promptCfg.placeholder} value={prompt} onChange={e => setPrompt(e.target.value)} data-testid="vbar-prompt" />
              <MentionLayer taRef={promptRef} value={prompt} counts={Object.fromEntries((['image', 'video', 'audio'] as const).map(k => [k, shownSlots.filter(s => s.kind === k).reduce((n, s) => n + sentOf(s).length, 0)]))} /></>
              : <p className="vbar-what" data-testid="vbar-what">{wf.tagline}. {(() => { const need = bar.slots.filter(x => reqOf(x) && !files[x.name]?.length); const w = need.map(x => /\d$/.test(x.label) ? x.label.toLowerCase() : `the ${x.label.toLowerCase()}`) /* "person 1", not "the person 1" */; return need.length ? `Add ${w.length > 2 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : w.join(' and ')}.` : 'Check the price on the button, then generate.'; })()}</p>}
          </div>
          <div className="ic-chiprow"><div ref={chipsRef} className="ic-chips">
            <span className="ic-fixed" data-testid="vs-chips-fixed">
              <VideoWorkflowChip tools={tools} dock watch={dock} />
              <button ref={modelRef} type="button" className={`ic-chip ic-model ${pop === 'model' ? 'on' : ''}`} data-testid="vs-model" aria-haspopup="listbox" aria-expanded={pop === 'model'} {...tip(pop === 'model' ? null : modelName)} onClick={() => setPop(pop === 'model' ? '' : 'model')}>
                <MakerTile className="ic-dot" medium="video" maker={tm?.maker} makerName={tm?.makerName} fallback={provInfo?.family || provInfo?.name} /><span className="ic-mname">{modelName}</span>
                <svg className="ic-caret" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            </span>
            <span className="wf-strip wf-ctl" data-testid="vbar-controls" data-workflow={wf.id} data-fit-main="first" /* its first control is the workflow's main one: never folds (shared/chipFit) */>{(() => { const ec = extra.chips?.(live()); const at = extra.chipsAfter ? bar.groups.findIndex(g => g.id === extra.chipsAfter) + 1 : 0; return <>{groupChips.slice(0, at)}{ec}{vfit.chip}{groupChips.slice(at)}</>; })()}
              {lastSeed != null && <span className="ic-seed wf-fold" {...fitPri('low')} data-testid="vs-seed" aria-label={seedOn ? `Same seed ${lastSeed}` : 'Same seed: off'}><SameSeed seed={lastSeed} on={seedOn} onChange={setSeedOn} /></span>}</span>
            {enhCan && <EnhanceChip ref={el => { gRefs.current.enh = el; }} testId="vbar-enhance" can on={enhOn} open={pop === 'enh'} onToggle={v => setVal('enhance', v ? '1' : '0')} onPanel={o => setPop(o ? 'enh' : '')} />}
            {toggles}
            <button ref={overRef} type="button" className={`ic-chip ic-sq ic-over${pop === 'over' ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={pop === 'over'} aria-label="More settings" {...tip(pop === 'over' ? null : 'More settings')} data-testid="vbar-over" onClick={openOver}><MoreIcon size={16} /></button>
          </div>
            {tm && <RunOnChip compact toolId={tool.id} model={tm} engine={prov} quote={q} testId="vs-run-on" watch={dock} />}
          </div>
        </div>
        <DockGenerate toolId={tool.id} engine={prov} quote={q} label={extra.label?.(live()) ?? bar.generateLabel} busy={busy} problems={problems} pfOpen={pfOpen} genRef={genRef} onClick={generate} testId="vs-generate" priceTestId="vs-price" workflowId={wf.id} />
      </div></div>
      <ModelMenu open={pop === 'model'} anchor={modelRef} avoid={dock} watch={dock} onClose={() => setPop('')} items={menuItems} value={prov} testId="vs-model-list" rowTestId={id => `vs-model-${id}`} onPick={id => { setProvider(id); setPop(''); }} toolId={tool.id} quote={q} placement="top" />
      {bar.groups.filter(g => shown.some(c => c.group === g.id && c.kind !== 'toggle' && c.kind !== 'gallery' && c.kind !== 'tiles')).map(g => groupPanel(g.id))}
      {shown.filter(c => c.kind === 'tiles').map(tilesPanel)}
      {slotPops}
      {preview && <SlotPreview open={!!files[preview.slot.name]?.[preview.index]} anchor={previewAnchor} onClose={() => setPreview(null)} item={files[preview.slot.name]?.[preview.index] ?? null} kind={files[preview.slot.name]?.[preview.index]?.photo ? 'image' : preview.slot.kind} title={preview.slot.label} watch={dock} testId="vbar-slot-preview"
        warn={preview.index >= usedOf(preview.slot) ? `Not sent: this model takes up to ${usedOf(preview.slot)} files here.` : null}
        onReplace={() => openSlot(preview.slot.name, preview.index)} onRemove={() => clearSlot(preview.slot, preview.index)} />}
      {soundPop}
      {enhCan && <EnhancePop open={pop === 'enh'} anchor={anchorOf('enh')} avoid={dock} watch={dock} onClose={() => setPop('')} testId="vbar-pop-enh" panelTestId="vbar-enhance-panel" toggleTestId="vbar-enhance-toggle" can on={enhOn} onChange={v => setVal('enhance', v ? '1' : '0')}
        prompt={prompt} kind="video" model={tm?.key} onApply={r => showEnhanced(r, setPrompt, toast)} />}
      {extra.pops?.(live())}
      {vfit.popover}
      {gallery && <LookPicker open={pop === `g:${gallery.group}`} anchor={anchorOf(gallery.group)} avoid={dock} watch={dock} onClose={() => setPop('')} label={gallery.label} testId="vbar-look"
        tabs={[{ id: gallery.field, label: gallery.label, searchLabel: `Search ${gallery.field === 'preset' ? 'styles' : gallery.field === 'move' ? 'moves' : gallery.field === 'look' ? 'looks' : 'effects'}`, items: galleryItems(gallery) }]} tab={gallery.field} onTab={() => undefined} />}
      <BarPopover open={pop === 'over'} anchor={overRef} watch={dock} gap={4} onClose={() => setPop('')} label="More settings" role="menu" testId="vbar-pop-over" width={240}>
        <PopSection label="More settings"><PopList label="More settings" role="group"><FoldedRows rows={overRows} testId="vbar-over" onPick={t => { setPop(''); requestAnimationFrame(() => t.click()); }} /></PopList></PopSection></BarPopover>
      <PreflightPop open={pfOpen && problems.length > 0} anchor={genRef} watch={dock} problems={problems} onClose={() => setPfOpen(false)} run={f => { void runFix(f); }} />
    </div></div>
  </div>;
}
