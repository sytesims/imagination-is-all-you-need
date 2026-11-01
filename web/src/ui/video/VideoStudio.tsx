import { IMAGE_ACCEPT, fileFits, kindOfFile, wrongTypeText, type MediaKind, AUDIO_ACCEPT, VIDEO_ACCEPT } from '../../../../server/src/shared/mediaAccept';
import { Words } from '../../shared/Words';
import { CloseIcon, BrushIcon, AspectIcon, ResolutionIcon } from '../Icons';
import { EnhanceChip, EnhancePop, showEnhanced, type EnhanceResult } from '../next/Enhance';
import { PromptPeek, type PeekForm } from '../next/PromptPeek';
import { BrandChip } from '../../shared/BrandChip';
import { RowMore } from '../../shared/RowMore';
import { SlotPreview, fullText, prepUpload, useSlotReorder, type SlotAction } from '../../shared/SlotPreview';
import { MoreFiles, LeftNote, notAddedText, type TrayFile } from '../../shared/FilesTray';
import { AddTile } from '../../shared/AddTile';
import { thumbsShown } from '../../shared/presetBar';
import { handoffOf } from '../../shared/handoffFiles';
import { PF_SHORT } from '../../shared/DockGenerate';
import { preflightProblems } from '../../../../server/src/shared/preflight';
import { tip } from '../../shared/Tooltip';
import { refChipTip } from '../../../../server/src/shared/promptTips';
import { renumberMentions } from '../../shared/mentions';
import { MentionLayer } from '../../shared/MentionChips';
import { MakerTile } from '../../shared/MakerTile';
import { MotionGlyphIcon } from '../../shared/PresetTile';
import { motionFor } from '../../shared/presetMotion';
import { toolHandoffHref } from '../../shared/workflowLinks';
import { LookPicker, type LookTab } from '../../shared/LookPicker';
import { SetupGenerate, setupNeeded, NoPlaceGenerate } from '../../shared/SetupCard';
import { estimateWords } from '../../shared/CostNote';
import { useGenState, GenHint } from '../edge/Edge';
import { nudgeMissing } from '../../shared/genNudge';
import { ChipGlyph } from '../../shared/SettingChip';
import { SettingsChip, SoundSection } from './SoundSetting';
import './videoPanel.css';
import './videoDock.css';
import { humanWhy } from '../../shared/GenWhy';
import { priceTitle } from '../../shared/GenPrice';
import { useBilling, modeOf, runPrice, placeOfQuote, ownAccountsNow } from '../../shared/billing';
import { RouteNotRunnable } from '../../shared/RouteNotRunnable';
import { GenPrice } from '../../shared/GenPrice';
import { DemoPrice } from '../../shared/DemoPrice';
import { useRequoteTick, shownCredits, runBlock } from '../../shared/quote';
import { readQuote, unpricedReason, demoMessage, unpricedPrefix, unpricedTitle, demoTagOf } from '../../shared/quote';
import { quoteParams } from '../../shared/usePrefill';
import { perSecondAt, optionToken, priceDelta, rateText, localLine, isLocalQuote, useVariantQuotes, shortToken, type Overrides } from '../../shared/optionPrice';
import { OptPrice } from '../../shared/OptPrice';
import { isOpenWeights, providerGroupOf, displayNameOf } from '../../shared/OpenWeights';
import { BarPopover, PopSection, PopList, PopRow, PopSwitch, Segmented, segCols, AspectShape, aspectWH } from '../../shared/BarPop';
import { ModelMenu, type MenuItem } from '../../shared/ModelMenu';
import { SwitchNote, useSwitchNote } from '../../shared/SwitchNote';
import type { RowFit } from '../../shared/quote';
import { refFitOf, runModeOf, skippedText, notUsedBy, notUsedShort, attachParams, type RefsAdded } from '../../../../server/src/shared/refFit';
/** Generate Video (page 4): left panel + main area, our layout.
 *  All copy, media, models and prices are ours; capabilities come from the tool config + /api/models + /api/tools/:id/price. */
import VideoFeed from './VideoFeed';
import { useHostedVideoFeed } from './videoFeedSlot';
import { VIDEO_LANDING_FEED } from '../../../../server/src/shared/videoFeed';
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { JobState, ToolInfo } from '../../api';
import { useToast } from '../../shared/Toast';
import { KeyNeeded, addKeyText, hasFreeLocal } from '../../shared/KeyNeeded';
import { navigate } from '../../platform/router';
import { Link } from '../../platform/router';
import { VideoWorkflowChip, videoWorkflowHref } from './VideoWorkflows';
import '../next/createBar.css'; /* the shared chip-fit steps and group chips (.wf-grp), also when Image wasn't opened first */
import { EXAMPLES, exampleFor } from '../examples';
import { FieldIssue } from '../IssueList';
import { DemoText } from '../../shared/DemoText';
import { missingText, firstWords } from '../../shared/missing';
import { useDockHeight, useChipFit } from '../../shared/dockFit';
import { usePromptGrow } from '../../shared/usePromptGrow';
import { PreflightNotes, type PreflightNote } from '../../shared/PreflightNotes';
import { RunOnChip, runOnText } from '../routing/RunOn';
import { useToolModels, modelOfEngine, useRunOn, shownName } from '../../shared/models';
import { LOCAL_LABEL } from '../../../../server/src/shared/modelIds';
import { closestAspect } from '../../../../server/src/shared/imageSnap';
import { useViralTemplates } from './useViralTemplates';
import { VideoThumb } from '../../shared/VideoThumb';
import { KeyframeLead, KeyframePanel, keyframeTimesOf } from './KeyframeStrip';
import { H3KF_CAPS, H3KF_SECONDS, type KeyframeCaps } from '../../../../server/src/shared/h3Keyframes';
import { Notice } from '../../shared/Notice';

type R = { file: File; url: string };
/** BH5: the Quality row's value must be a level, not the word "Quality" again. */
const qLabel = (l: string) => /^quality$/i.test(l.trim()) ? 'Best' : l;
export interface VideoStudioProps {
  tool: ToolInfo; mode: string; setMode: (m: string) => void; /** the mode switch a photo makes (added → image to video, removed → text to video): keeps the picked model */ autoMode?: (m: string) => void;
  provider: string; setProvider: (p: string) => void;
  suggestPrompt?: string; sameSeed?: import('react').ReactNode;
  image: R | null; onImage: (f: File[]) => void; clearImage: () => void; imgErr?: string;
  frameHandoff?: { phase: 'loading' | 'error'; message?: string } | null; onFrameImageReady?: (url: string) => void; onCancelFrameHandoff?: () => void; onRetryFrameHandoff?: () => void;
  lastFrame: R | null; setLastFrame: (r: R | null) => void;
  prompt: string; setPrompt: (s: string) => void; promptRef: React.RefObject<HTMLTextAreaElement>;
  duration: number; setDuration: (n: number) => void; resolution: string; setResolution: (r: string) => void;
  quality: string; setQuality: (q: string) => void;
  missing: string[]; conflict?: string | null; busy: boolean; issues: any[];
  fv: Record<string, any>; setFv: (k: string, v: any) => void; vrefs: Record<string, R[]>; setVrefs: (k: string, list: R[]) => void;
  onGenerate: () => void; jobs: JobState[]; onSelect: (id: string) => void; selected?: string;
  /** the result viewer's More items for the open clip (Generate more, Re-run same seed, +5s / +10s, Render final) */ viewerActions?: (j: JobState, close: () => void) => React.ReactNode;
  /** One Video page: the tool list, for the workflow chip in the bar. */ tools?: ToolInfo[];
  /** how many of each reference list (refs, refVideos, refAudios) the picked model takes: the submit sends only these (the extras stay on the bar, marked) */ refCaps?: React.MutableRefObject<Record<string, number> | null>;
}
const MODE_ART: Record<string, string> = { t2v: 'soar', i2v: 'heroine', flf: 'city', r2v: 'giant', keyframes: 'dunes' };
/** The Keyframes card's line, from the picked model's frame limits (H3: pinned times; Kling 4.0: spaced evenly). */
const kfCopy = (c: KeyframeCaps) => (c.times ? `Pin ${c.min}–${c.max} frames to moments in one shot.` : `Up to ${c.max} frames through one shot, spaced evenly.`);
const MODE_COPY: Record<string, string> = { t2v: 'Describe it, get a clip with sound.', i2v: 'Bring one still to life.', flf: 'Pick the first and last frame.', r2v: 'Keep a face or object consistent.', keyframes: 'Pin 2–5 frames to moments in one shot.' };
const RK: [string, string][] = [['refs', 'image'], ['refVideos', 'video'], ['refAudios', 'audio']];
/** File-picker types per reference kind; video / audio follow the model's refFormats (videoCaps) when it lists them. */
const REF_MIME: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav' };
const refAccept = (kind: string, fmts?: { video?: string[]; audio?: string[] }) => kind === 'image' ? IMAGE_ACCEPT
  : kind === 'video' ? (fmts?.video ? fmts.video.map(x => `${REF_MIME[x] ?? ''},.${x}`).join(',') : VIDEO_ACCEPT)
  : (fmts?.audio ? fmts.audio.map(x => `${REF_MIME[x] ?? ''},.${x}`).join(',') : AUDIO_ACCEPT);

/** A missing input in Generate's few words (Image says "Write a prompt"; a video's photo is its start frame, or a reference in Reference mode). */
function missShort(m: string, mode: string): string {
  const x = String(m).trim().replace(/\.$/, '');
  if (/^an? (valid )?(image|photo|start frame)$/i.test(x)) return mode === 'r2v' ? 'Add a reference' : 'Add a start frame';
  if (/^an? end (frame|image)$/i.test(x)) return 'Add an end frame';
  if (/^a prompt/i.test(x)) return 'Write a prompt';
  if (/^Shorten the prompt/.test(x)) return x; // prompt grammar: the model's cap, said in full
  if (/^checking your files$/i.test(x)) return 'Checking your files…';
  if (/^usable files/i.test(x)) return 'A file can’t be used';
  if (/^(Add|Pick|Write|Remove|Turn|Set|Choose|Upload) /.test(x)) return x.length > 34 ? firstWords(x) : x;
  return `Add ${x}`;
}

/** Our own small duration / resolution tags for the rows (no long descriptions; the detail is the tooltip). */
const resTag = (h: number) => h >= 1440 ? 'Sharpest' : h >= 1080 ? 'Full HD' : h >= 720 ? 'HD' : 'Preview';

export default function VideoStudio(p: VideoStudioProps) {
  const toast = useToast();
  const cfg: any = p.tool.app; const presets = p.tool.presets ?? [];
  /* The shared Popover (portal, .apop surface): the model menu opens beside the panel, the small ones above their chip; Escape, outside click and focus return come with it */
  const [popOpen, setPopOpen] = useState(''); const pop = { open: popOpen, setOpen: setPopOpen }; const closePop = () => setPopOpen('');
  const aR = { look: useRef<HTMLButtonElement>(null), enh: useRef<HTMLButtonElement>(null), add: useRef<HTMLButtonElement>(null), model: useRef<HTMLButtonElement>(null), dur: useRef<HTMLButtonElement>(null), asp: useRef<HTMLButtonElement>(null), res: useRef<HTMLButtonElement>(null), q: useRef<HTMLButtonElement>(null), br: useRef<HTMLButtonElement>(null), kf: useRef<HTMLButtonElement>(null) };
  /* One Video page (2026-10-23): no History / How it works sub-tabs (How it works is in the workflow picker, each row's ⓘ); Elements removed (user, 2026-10-23). */
  const [models, setModels] = useState<any[]>([]);
  useEffect(() => { fetch(`/api/models?toolId=${encodeURIComponent(p.tool.id)}`).then(r => r.ok ? r.json() : null).then(d => setModels(d?.groups?.find((g: any) => g.toolId === p.tool.id)?.models ?? [])).catch(() => 0); }, [p.tool.id]);
  const modeOk = (prov: string, m: string) => !cfg.providerModes?.[prov] || cfg.providerModes[prov].includes(m);
  const provs = p.tool.providers; const cur = provs.find(x => x.id === p.provider) ?? provs[0]; const curM = models.find(m => m.id === cur?.id);
  const preset = presets.find(x => x.id === p.mode) ?? presets[0];
  // price + runnable (quote = charge)
  const limOf = (id: string) => cfg.videoLimits?.[id] ?? models.find(m => m.id === id)?.videoLimits ?? null; const lim: any = limOf(p.provider);
  const resList: string[] = lim?.resolutions ?? cfg.resolutionsByProvider?.[p.provider] ?? cfg.resolutions ?? []; // per-model tiers (videoCaps)
  useEffect(() => { if (resList.length && !resList.includes(p.resolution)) p.setResolution(cfg.defaultResolutionByProvider?.[p.provider] ?? models.find(m => m.id === p.provider)?.defaultResolution ?? resList[0]); }, [p.provider, resList.join()]);
  /* Resolution as the user sees it: a model can name its tiers (videoCaps resolutionLabels: Kling v3 720p / 1080p = Standard / Pro mode); the value sent stays the tier. */
  const resLbl = (r: string) => lim?.resolutionLabels?.[r] ?? r;
  /* Sound starts at each model's own default (videoCaps audio.default: Veo off, Kling / Seedance on) when the page opens and on every model switch,
   * so the toggle and the quote agree (the tool's generic field default is '1'). A switch that sets sound itself (re-run of a past job) keeps it. 2026-10-25 */
  const aud0: any = lim?.audio ?? null; const audPrev = useRef<{ prov: string | null; audio: unknown }>({ prov: null, audio: undefined });
  useEffect(() => { if (!aud0) return; const was = audPrev.current; audPrev.current = { prov: p.provider, audio: p.fv.audio }; if (was.prov === p.provider) return;
    if (was.prov !== null && was.audio !== p.fv.audio) return; const want = aud0.supported === false ? '0' : aud0.default === false ? '0' : '1'; if (aud0.toggle !== false && String(p.fv.audio ?? '') !== want) p.setFv('audio', want); }, [p.provider, aud0?.default, aud0?.supported]);
  useEffect(() => { audPrev.current = { ...audPrev.current, audio: p.fv.audio }; }, [p.fv.audio]);
  const resH = (r: string) => lim?.resolutionHints?.[r] ? 1e4 /* a named best-quality recipe (LTX-2.5 DFR) sits on top */ : /k$/i.test(r) ? Number(r.replace(/\D/g, '')) * 1080 : Number(r.replace(/\D/g, '')) || 0;
  const resSorted = [...resList].sort((a, b) => resH(b) - resH(a));
  const refKinds: string[] = lim?.refKinds ?? ['image']; const refMax: Record<string, number> = lim?.refMax ?? { image: 1 }; const refFmts: { video?: string[]; audio?: string[] } | undefined = lim?.refFormats;
  // reference clip lengths (Seedance bills them; caps.refVideoSeconds)
  const rvs: any = lim?.refVideoSeconds ?? null; const [rvDur, setRvDur] = useState<Record<string, number>>({});
  useEffect(() => { (p.vrefs.refVideos ?? []).forEach(r => { if (rvDur[r.url] !== undefined) return; const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => setRvDur(d => ({ ...d, [r.url]: v.duration })); v.src = r.url; }); }, [p.vrefs.refVideos]);
  const rvList = (p.vrefs.refVideos ?? []).slice(0, refKinds.includes('video') ? refMax.video ?? 0 : 0).map(r => rvDur[r.url]); const rvTotal = Math.round(rvList.reduce((a: number, b) => a + (b ?? 0), 0) * 10) / 10;
  const rvShort = rvs ? rvList.some(d => d !== undefined && d < rvs.minEach) : false; const rvOver = rvs ? rvTotal > rvs.maxTotal : false;
  const rvLong = rvs?.maxEach ? rvList.some(d => d !== undefined && d > rvs.maxEach) : false;
  // reference audio lengths (caps.refAudioSeconds: per clip and in total, read in the browser like the clips above; the server checks the same on submit)
  const ras: any = lim?.refAudioSeconds ?? null; const [raDur, setRaDur] = useState<Record<string, number>>({});
  useEffect(() => { (p.vrefs.refAudios ?? []).forEach(r => { if (raDur[r.url] !== undefined) return; const a = document.createElement('audio'); a.preload = 'metadata'; a.onloadedmetadata = () => setRaDur(d => ({ ...d, [r.url]: a.duration })); a.src = r.url; }); }, [p.vrefs.refAudios]);
  const raList = (p.vrefs.refAudios ?? []).slice(0, refKinds.includes('audio') ? refMax.audio ?? 0 : 0).map(r => raDur[r.url]); const raTotal = Math.round(raList.reduce((a: number, b) => a + (b ?? 0), 0) * 10) / 10;
  const raShort = ras ? raList.some(d => d !== undefined && d < ras.minEach) : false; const raLong = ras?.maxEach ? raList.some(d => d !== undefined && d > ras.maxEach) : false; const raOver = ras ? raTotal > ras.maxTotal : false;
  const qLocal = true; // quality is sent for every model again (backend: resolution wins; quality only counts as speed or as a resolution-like value)

  const [q, setQ] = useState<any>(null); const qFor = useRef<Record<string, string> | null>(null); /* the params the quote in `q` was asked with (the popups price only a quote for these settings) */
  /* Keyframes (2026-10-27): frames (vrefs.keyframes) as many as the model takes (its videoLimits keyframes: MiniMax H3 2–5 at their times in
   * fv.keyframeTimes, JSON seconds; Kling 4.0 up to 10 spaced evenly, no times; KeyframeStrip.tsx). The quote counts them (keyframes=<n>). */
  const kfMode = p.mode === 'keyframes'; const kfCaps: KeyframeCaps = lim?.keyframes ?? H3KF_CAPS; const kfFrames = p.vrefs.keyframes ?? []; const kfTimes = keyframeTimesOf(p.fv.keyframeTimes, kfFrames.length, p.duration);
  const setKf = (f: R[], t: number[]) => { p.setVrefs('keyframes', f); p.setFv('keyframeTimes', f.length && kfCaps.times ? JSON.stringify(t) : ''); };
  useEffect(() => { if (!kfMode) return; const want = kfFrames.length && kfCaps.times ? JSON.stringify(kfTimes) : ''; if (String(p.fv.keyframeTimes ?? '') !== want) p.setFv('keyframeTimes', want); }, [kfMode, kfCaps.times, JSON.stringify(kfTimes)]);
  useEffect(() => { if (kfMode && kfCaps.times && p.duration < H3KF_SECONDS[0]) p.setDuration(H3KF_SECONDS[0]); }, [kfMode, kfCaps.times, p.duration]); /* H3 Keyframes makes 5–15 s */
  const kfIn = useRef<HTMLInputElement>(null); const [kfErr, setKfErr] = useState('');
  const addKf = (fs: File[]) => { const imgs = fs.filter(f => fileFits('image', f)); const room = kfCaps.max - kfFrames.length;
    const err = imgs.length < fs.length ? 'Frames are pictures: PNG, JPG or WebP.' : imgs.length > room ? `${modelName || 'This model'} takes up to ${kfCaps.max} frames: ${imgs.length - Math.max(0, room)} not added.` : '';
    setKfErr(err); if (err) toast(err, 'info'); /* said at once (the note list only opens from Generate) */
    const add = imgs.slice(0, Math.max(0, room)).map(f => ({ file: f, url: URL.createObjectURL(f) })); if (!add.length) return; const next = [...kfFrames, ...add];
    setKf(next, keyframeTimesOf('', next.length, p.duration)); };
  const nRefImg = kfMode ? kfFrames.length /* frame N = <Picture N> = @imageN */ : (p.image ? 1 : 0) + (p.vrefs.refs?.length ?? 0); // r2v: the photo and every image reference go to the model (job refPaths)
  /* The quote's params, shared by Generate's quote and the popups' option prices (one source, so they price the same run). */
  const qpOk = !((durListOf(cur, lim, cfg, p.resolution).length && !durListOf(cur, lim, cfg, p.resolution).includes(p.duration)) || (resList.length && !resList.includes(p.resolution)));
  const qpObj: Record<string, string> = { ...quoteParams(), provider: p.provider, duration: String(p.duration), resolution: p.resolution, types: p.mode, ...(qLocal ? { quality: p.quality } : {}), aspect: String(p.fv.aspect ?? 'auto'), ...(rvTotal > 0 ? { refVideoSeconds: String(rvTotal) } : {}), ...(p.mode === 'r2v' && nRefImg > 0 ? { refs: String(Math.min(nRefImg, refMax.image ?? 0)) } : {}) /* reference images the job sends (photo + refs): per-reference prices, e.g. MiniMax H3 beyond 5 */,
    ...(kfMode ? { keyframes: String(kfFrames.length) } : attachParams({ start: !!p.image, image: p.vrefs.refs?.length ?? 0, video: p.vrefs.refVideos?.length ?? 0, audio: p.vrefs.refAudios?.length ?? 0 })), /* each clip's seconds, when all are read (the route's length checks; the picker trims them per row) */
    ...((p.vrefs.refVideos ?? []).length && (p.vrefs.refVideos ?? []).every(r => rvDur[r.url] > 0) ? { refVideoSecondsEach: (p.vrefs.refVideos ?? []).map(r => Math.round(rvDur[r.url] * 100) / 100).join(',') } : {}),
    ...((p.vrefs.refAudios ?? []).length && (p.vrefs.refAudios ?? []).every(r => raDur[r.url] > 0) ? { refAudioSecondsEach: (p.vrefs.refAudios ?? []).map(r => Math.round(raDur[r.url] * 100) / 100).join(',') } : {}),
    /* what's on the bar (shared/refFit.ts): the start frame (upload or hand-off) as image=1, so a quote never says "Needs a start image" with one attached; the picker fits each row from the counts */ audio: String(p.fv.audio ?? (aud0?.default === false ? '0' : '1')), bitrate: String(p.fv.bitrate ?? 'standard'), ...(p.fv.loop === '1' ? { loop: '1' } : {}), ...(lim?.stageToggle && p.resolution === lim.stageToggle.resolution && p.fv[lim.stageToggle.field] ? { [lim.stageToggle.field]: String(p.fv[lim.stageToggle.field]) } : {}) /* LTX-2.5 DFR: the 48 fps pass is priced */ };
  const rqTick = useRequoteTick(); useEffect(() => { /* No quote until the inputs are valid for this model (the default 15 s is clamped first). */ if (!qpOk) return; const u = new URLSearchParams(qpObj); const ac = new AbortController(); const asked = { ...qpObj };
    fetch(`/api/tools/${p.tool.id}/price?${u}`, { signal: ac.signal }).then(readQuote).then(d => { qFor.current = asked; setQ(d); }).catch(() => 0); return () => ac.abort(); }, [rqTick, p.provider, p.duration, p.resolution, p.mode, p.quality, p.fv.aspect, p.fv.audio, p.fv.bitrate, p.fv.loop, lim?.stageToggle ? p.fv[lim.stageToggle.field] : '', rvTotal, nRefImg, !!p.image, JSON.stringify(rvDur), JSON.stringify(raDur), p.vrefs.refVideos?.length ?? 0, p.vrefs.refAudios?.length ?? 0, p.vrefs.refs?.length ?? 0, String(durListOf(cur, lim, cfg, p.resolution)), resList.join()]);
  const unpricedWhy = unpricedReason(q); const unpriced = !!unpricedWhy; const credits: number | null = shownCredits(q); /* B18: chargeable:false is never a charge */
  const free = credits === 0 && q?.routeKind === 'local'; const gate = !!q && q.needsKey === true && q.runnable === false;
  /* B19: any other runnable:false quote blocks Generate in the server's words; an input block (blockedReason) keeps its real price, shown muted. */
  const blockWhy = !gate && !unpriced && q?.runnable === false ? String(runBlock(q) ?? '') : '';
  const gq = useGenState(); const qFull = gq.full; // D1: a full queue blocks Generate and says why
  const why = p.missing.length ? humanWhy(missingText(p.missing)) : ''; const isDemo = !unpriced && !blockWhy && credits != null && q?.demo === true; const isFree = !unpriced && !blockWhy && credits != null && free;
  /* "via <route> · <price>" under the model name, live from the quote (same line the other tool pages show). */
  const viaTxt = viaFromQuote(q, curM ?? cur); const viaS = viaShort(q, curM ?? cur); const bill = useBilling();
  useToolModels(p.tool.id); const tm = modelOfEngine(p.tool.id, cur?.id); const ro = runOnText(tm, useRunOn(p.tool.id, tm?.key).runOn, q);
  /* 400 invalid_duration (same on quote and submit): the server's sentence by the length picker; on submit also 'Nothing was charged'. */
  const subDur = (p.issues ?? []).find((i: any) => i?.code === 'invalid_duration');
  const durErr = subDur ? `${String(subDur.message ?? '').replace(/\s+$/, '')} Nothing was charged.` : q?.code === 'invalid_duration' ? String(q.error ?? q.issues?.[0]?.message ?? '') : '';
  const old = q && typeof q.listCredits === 'number' && credits != null && q.listCredits > credits ? q.listCredits : null; // only when our API gives one
  const durs: number[] = durListOf(cur, lim, cfg, p.resolution); const di = Math.max(0, durs.indexOf(p.duration));
  const aspects: string[] = lim?.aspects ?? cfg.aspects ?? ['auto']; const aud: any = lim?.audio ?? null; const bitrates: { value: string; label: string }[] = (cfg.bitrates ?? []).filter((b: any) => !lim?.bitrate || lim.bitrate.includes(b.value));
  /* the media picker's limits line for References: "Up to 9 images · Up to 3 videos, 2–15 s each" */
  const refLimits = refKinds.map(k => { const n = refMax[k] ?? 0; const sec = k === 'video' && rvs ? `, ${rvs.minEach}–${rvs.maxEach ?? rvs.maxTotal} s each` : k === 'audio' && ras ? `, ${ras.minEach}–${ras.maxEach ?? ras.maxTotal} s each` : '';
    return n ? `Up to ${n} ${k === 'audio' ? 'sound' : k}${n > 1 ? 's' : ''}${sec}` : ''; }).filter(Boolean).join(' · ');
  /* no audio-only job (Seedance 2.0, MiniMax H3): reference audio needs a reference image or video next to it */
  const audioAlone = !!lim?.audioNeedsVisualRef && p.mode === 'r2v' && (p.vrefs.refAudios?.length ?? 0) > 0 && !(p.vrefs.refVideos?.length ?? 0) && nRefImg === 0;
  /* Upload slots (2026-10-29, shared/SlotPreview): the model's real caps per kind; in Reference mode the start picture is picture 1 */
  const startIsRef = p.mode === 'r2v' && !!p.image;
  const refCaps = Object.fromEntries(refKinds.map(k => [k, refMax[k] ?? 0])) as Partial<Record<MediaKind, number>>;
  const capOf = (k: string) => { const kind = RK.find(x => x[0] === k)?.[1] ?? ''; return !refKinds.includes(kind) ? 0 : Math.max(0, (refMax[kind] ?? 0) - (kind === 'image' && startIsRef ? 1 : 0)); };
  /* Reference-aware picker (2026-10-31, shared/refFit.ts): what each model would use of what's on the bar; the menu's rows, Auto and the
   * bar's "Not used" marks all read it. */
  const added: RefsAdded = { start: !!p.image && !kfMode, image: p.vrefs.refs?.length ?? 0, video: p.vrefs.refVideos?.length ?? 0, audio: p.vrefs.refAudios?.length ?? 0 };
  const anyAdded = !kfMode && added.image + added.video + added.audio > 0; /* references on the bar (a start frame alone: every model takes it) */
  const capsOfEngine = (id: string) => { const L: any = limOf(id); return { modes: cfg.providerModes?.[id] ?? null, refKinds: L?.refKinds ?? ['image'], refMax: L?.refMax ?? { image: 1 } }; };
  const curFit = anyAdded ? refFitOf(capsOfEngine(p.provider), added, p.mode, { keepMode: true }) : null;
  const startOff = !!curFit && added.start && !curFit.startUsed;
  const refFitFor = anyAdded ? (id: string) => refFitOf(capsOfEngine(id), added, p.mode) : null;
  /** how many of a bar list the picked model uses (its limit, and, with references, Reference mode: shared/refFit.ts) */
  const capNow = (k: string) => curFit ? Math.min(capOf(k), (curFit.caps as Record<string, number>)[k] ?? 0) : capOf(k);
  const refUsed: Partial<Record<MediaKind, number>> = { image: (startIsRef ? 1 : 0) + (p.vrefs.refs?.length ?? 0), video: p.vrefs.refVideos?.length ?? 0, audio: p.vrefs.refAudios?.length ?? 0 };
  const overN = RK.reduce((n, [k]) => n + Math.max(0, (p.vrefs[k]?.length ?? 0) - capNow(k)), 0);
  if (p.refCaps) p.refCaps.current = Object.fromEntries(RK.map(([k]) => [k, capNow(k)]));
  const dropExtras = () => RK.forEach(([k]) => { if ((p.vrefs[k]?.length ?? 0) > capNow(k)) p.setVrefs(k, (p.vrefs[k] ?? []).slice(0, capNow(k))); });
  // keep values inside the picked model's limits
  useEffect(() => { if (durs.length && !durs.includes(p.duration)) { const to = durs.reduce((a, b) => Math.abs(b - p.duration) < Math.abs(a - p.duration) ? b : a); p.setDuration(to);
    if (lim?.durationsByResolution?.[p.resolution]) toast(`${curM?.name ?? cur?.name ?? 'This model'} makes ${resLbl(p.resolution)} clips at ${durs.join(' or ')} s only: length set to ${to} s`, 'info'); } }, [p.provider, durs.join()]); // per-model lengths: snap to the nearest allowed (and say so when the resolution limits it)
  useEffect(() => { if (!lim) return; if (durs.length && !durs.includes(p.duration)) p.setDuration(durs.reduce((a, b) => Math.abs(b - p.duration) < Math.abs(a - p.duration) ? b : a));
    if (aud && aud.supported !== false && !aud.toggle && p.fv.audio === '0') p.setFv('audio', '1');
    /* references over the new model's limit stay on the bar, marked "Not sent" (refCaps trims the submit); the pre-flight list offers to remove them */ }, [p.provider, JSON.stringify(lim)]);
  /* the aspect inside the model's list (a model switch, or one handed over by Explore / Recreate / ?aspect=): the nearest shape it makes, with a note */
  useEffect(() => { if (!lim) return; const a = String(p.fv.aspect ?? 'auto'); if (aspects.includes(a)) return; const wh = aspectWH(a);
    const to = (wh ? closestAspect(aspects, wh[0] / wh[1]) : null) ?? aspects[0]; p.setFv('aspect', to);
    if (wh) toast(`${(tm ? shownName(tm) : null) ?? displayNameOf(cur, curM) ?? cur?.name ?? 'This model'} doesn’t make ${a} clips: aspect set to ${to === 'auto' ? 'Auto' : to}`, 'info'); }, [p.provider, p.fv.aspect, aspects.join(), !!lim]); // eslint-disable-line react-hooks/exhaustive-deps
  const metaOf = (m: any) => { const prov = provs.find(x => x.id === m.id); const L: any = limOf(m.id); const modes = cfg.providerModes?.[m.id] ?? presets.map(x => x.id); if (!L) return [`${modes.length} modes`, providerGroupOf(prov, m)].filter(Boolean) as string[];
    const rk = (L.refKinds ?? []).filter((k: string) => k !== 'image'); return [L.maxResolution, `${L.minSeconds}s-${L.maxSeconds}s`, L.aspects?.length > 1 ? `${L.aspects.length} aspects` : null, L.audio?.supported ? (L.audio.toggle ? 'Sound on/off' : 'Sound') : null, rk.length ? `${rk.join(' + ')} refs` : null, providerGroupOf(prov, m), L.verified === false ? 'Unverified limits' : null].filter(Boolean) as string[]; };
  const [lookTab, setLookTab] = useState('camera');
  const [camPresets, setCamPresets] = useState<any[]>([]); useEffect(() => { fetch('/api/presets?toolId=camera').then(r => r.ok ? r.json() : null).then(d => setCamPresets(d?.items ?? [])).catch(() => 0); }, []);
  /* Live option prices in the popups (2026-10-25, shared/optionPrice.ts): each option shows what Generate will show once it is picked.
   * Per-second routes: seconds × the quote's rate on the client (server rounding); everything else: one batched variants request. */
  const own = ((m) => (m == null ? null : m === 'own-accounts'))(modeOf(bill, q));
  const sansDur = (o: Record<string, string> | null) => (o ? JSON.stringify(Object.entries(o).filter(([k]) => k !== 'duration').sort()) : '');
  const qBase = !!q && !!qFor.current && sansDur(qFor.current) === sansDur(qpObj); /* the quote is for these settings (any length) */
  const qDur = Number(qFor.current?.duration) || p.duration; const qFresh = qBase && qDur === p.duration;
  const qLocalRun = qBase && isLocalQuote(q);
  const priced = qBase && qpOk && !unpriced && !blockWhy && q.demo !== true && !qLocalRun && typeof q.credits === 'number' && q.credits > 0;
  const psQ = priced ? perSecondAt(q, qDur, qDur) : null; /* non-null: this route's price is rate × seconds, exactly */
  const nearest = (l: number[], v: number) => (l.length ? l.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)) : v);
  const hasRefs = rvTotal > 0 || (p.mode === 'r2v' && nRefImg > 0);
  const variants: Record<string, Overrides> = {};
  if (priced) {
    if (aud?.supported && aud.toggle) variants.audio = { audio: p.fv.audio === '0' ? '1' : '0', duration: String(p.duration) };
    if (hasRefs) variants.norefs = { refVideoSeconds: null, refs: null, duration: String(p.duration) };
    if (pop.open === 'dur' && !psQ) for (const d of durs) variants[`d${d}`] = { duration: String(d) };
    if (pop.open === 'res' || pop.open === 'set') for (const r of resList) variants[`r${r}`] = { resolution: r, duration: String(nearest(durListOf(cur, lim, cfg, r), p.duration)) };
  }
  const vq = useVariantQuotes(p.tool.id, priced ? Object.fromEntries(Object.entries(qpObj).filter(([k]) => k !== 'duration')) : null, variants);
  const durPrice = (d: number): string | null | undefined => { // undefined = loading; a local run is free at every length (the rate line says so once)
    if (!priced) return null;
    if (d === qDur) return optionToken(q, own); if (psQ) return optionToken(perSecondAt(q, qDur, d), own);
    const v = vq.get(`d${d}`); return v === undefined ? undefined : optionToken(v, own); };
  const resPrice = (r: string): string | null | undefined => {
    if (!priced) return null; if (r === p.resolution && qFresh) return optionToken(q, own);
    const v = vq.get(`r${r}`); return v === undefined ? undefined : optionToken(v, own); };
  const sndOther = vq.get('audio'); const sndDelta = qFresh && sndOther ? (p.fv.audio === '0' ? priceDelta(q, sndOther, own) : priceDelta(sndOther, q, own)) : null; /* what sound adds (on − off) */
  /* Sound sits in Settings (SoundSetting.tsx, 2026-10-27): a switch when the model lets you choose, else the model's own note; the Settings button wears a speaker badge while it's on */
  const sndCan = !!(aud?.supported && aud.toggle); const sndShown = sndCan || !!cfg.audio; const sndOn = sndCan ? p.fv.audio !== '0' : !!aud?.supported;
  const sndHint = sndDelta ? `Adds ${sndDelta.replace(/^\+/, '')} on this model` : aud?.priceAffects ? 'Changes the price on this model' : 'Same price either way';
  const refOther = vq.get('norefs'); const refDelta = ((d) => (d?.startsWith('+') ? d : null))(qFresh && refOther ? priceDelta(refOther, q, own) : null); /* what the billed references add */
  const keyNote = qBase && q.needsKey === true ? ' · once a key is added' : '';
  const durRate: string | null = !qBase || !qpOk ? null : qLocalRun ? localLine(q) : psQ ? `${rateText(q, own)}${keyNote}` : priced ? `${rvTotal > 0 ? (q?.upTo && q.upToNote ? `Up to: ${q.upToNote}` /* a range (Kling 4.0): the quote is its top */ : 'Reference clips are billed too') : 'Priced per clip'}${keyNote}` : q.demo === true && q.perSecond ? `Sample now · with a key, ${rateText({ ...q, demo: false }, own)}` /* the button says 'Sample': no option prices, the real rate as a note */ : null;

  /* Look → Camera: a Camera Moves preset on THIS run (job field cameraMove; the server puts its phrase first in the prompt). Same model, same price. */
  const camOn = String(p.fv.cameraMove ?? ''); const cam = camPresets.find(x => x.id === camOn || x.aliases?.includes(camOn)); /* old ids (aliases) from Recreate still show their move */
  const [camNew, setCamNew] = useState<Set<string>>(new Set()); useEffect(() => { fetch('/api/camera/categories').then(r => r.ok ? r.json() : null).then(d => setCamNew(new Set((d?.new ?? []).map((x: any) => x.id)))).catch(() => 0); }, []);
  const [vps, setVps] = useState<any[]>([]); useEffect(() => { fetch('/api/video-presets').then(r => r.ok ? r.json() : null).then(d => setVps(d?.items ?? [])).catch(() => 0); }, []);
  const vp = vps.find(x => x.id === p.fv.videoPreset || x.aliases?.includes(p.fv.videoPreset)); /* a removed look's old id (Recreate) shows the kept look */
  /* Viral templates (useViralTemplates, 2026-10-26): Look → Viral, the fill-in row above the prompt, ?template= from an Explore card */
  const viral = useViralTemplates({ prompt: p.prompt, setPrompt: p.setPrompt, promptRef: p.promptRef, provider: p.provider, setProvider: p.setProvider, engines: provs.map(x => x.id), limOf, setFv: p.setFv, setDuration: p.setDuration, toast, closePop, engineName: id => models.find(m => m.id === id)?.name ?? provs.find(x => x.id === id)?.name ?? 'LTX-2.5 22B' });
  const refIn = useRef<HTMLInputElement>(null); const [refErr, setRefErr] = useState(''); const [left, setLeft] = useState(''); /* "N not added" under the prompt line (shared LeftNote) */ useEffect(() => setLeft(''), [p.provider]);
  const addRefs = async (fs: File[]) => { setRefErr(''); setLeft(''); const acc: Record<string, R[]> = {}; const left: string[] = []; const msgs: string[] = [];
    for (const f0 of fs) { const kind = kindOfFile(f0, refKinds as MediaKind[]); const k = RK.find(x => x[1] === kind)?.[0];
      if (!kind || !k) { msgs.push(wrongTypeText(f0.name, refKinds as MediaKind[])); continue; }
      const okFmt = kind === 'image' ? undefined : (refFmts as any)?.[kind] as string[] | undefined; const ext = (f0.name.split('.').pop() ?? '').toLowerCase();
      if (okFmt && !okFmt.includes(ext)) { msgs.push(`${f0.name}: this model takes ${kind === 'audio' ? 'sound' : kind} references as ${okFmt.map(x => x.toUpperCase()).join(' or ')}.`); continue; }
      const cur = acc[k] ?? [...(p.vrefs[k] ?? [])]; if (cur.length >= capOf(k)) { left.push(kind); continue; }
      const pr = await prepUpload(f0, kind); if ('error' in pr) { msgs.push(pr.error); continue; } if (pr.note) toast(pr.note, 'info');
      cur.push({ file: pr.file, url: URL.createObjectURL(pr.file) }); acc[k] = cur; }
    Object.entries(acc).forEach(([k, l]) => p.setVrefs(k, l));
    setLeft(notAddedText(left.length, fullText(Object.fromEntries(Object.entries(refCaps).filter(([kk]) => left.includes(kk))), modelName || 'This model'))); setRefErr(msgs.join(' ')); };
  const fileIn = useRef<HTMLInputElement>(null); const lastIn = useRef<HTMLInputElement>(null);
  const takeStart = async (f: File) => { p.onCancelFrameHandoff?.(); if (!fileFits('image', f)) { setRefErr(wrongTypeText(f.name, ['image'])); return; } const pr = await prepUpload(f, 'image'); if ('error' in pr) { setRefErr(pr.error); return; } if (pr.note) toast(pr.note, 'info'); setRefErr(''); p.onImage([pr.file]); };
  const takeEnd = async (f: File) => { if (!fileFits('image', f)) { setRefErr(wrongTypeText(f.name, ['image'])); return; } const pr = await prepUpload(f, 'image'); if ('error' in pr) { setRefErr(pr.error); return; } if (pr.note) toast(pr.note, 'info'); setRefErr(''); p.setLastFrame({ file: pr.file, url: URL.createObjectURL(pr.file) }); };
  const repl = useRef<{ k: string; i: number } | null>(null);
  const replaceRef = async (k: string, i: number, f: File) => { const kind = RK.find(x => x[0] === k)![1] as MediaKind; if (!kindOfFile(f, [kind])) { setRefErr(wrongTypeText(f.name, [kind])); return; }
    const pr = await prepUpload(f, kind); if ('error' in pr) { setRefErr(pr.error); return; } setRefErr(''); p.setVrefs(k, (p.vrefs[k] ?? []).map((r, j) => j === i ? { file: pr.file, url: URL.createObjectURL(pr.file) } : r)); };
  const removeRef = (k: string, i: number) => { const kind = RK.find(x => x[0] === k)![1]; p.setVrefs(k, (p.vrefs[k] ?? []).filter((_, j) => j !== i));
    /* prompt grammar: later @image / @video mentions move down, the removed one shows as @image? (as on Create Image) */ if (kind !== 'audio') p.setPrompt(renumberMentions(p.prompt, kind as 'image' | 'video', kind === 'image' ? (p.image ? 1 : 0) + i + 1 : i + 1)); };
  const moveRef = (k: string) => (from: number, to: number) => { const l = [...(p.vrefs[k] ?? [])]; const [x] = l.splice(from, 1); l.splice(to, 0, x); p.setVrefs(k, l); };
  const dragImg = useSlotReorder(moveRef('refs'));
  /* drop a file anywhere on the bar: a picture is the start frame while there is none (Keyframes: a frame), the rest are references */
  const [dropOn, setDropOn] = useState(false);
  const dropFiles = async (fs: File[]) => { if (kfMode) { addKf(fs); return; }
    const imgs = fs.filter(f => fileFits('image', f)); let rest = fs.filter(f => !imgs.includes(f));
    if (imgs.length && !p.image) { await takeStart(imgs[0]); rest = [...imgs.slice(1), ...rest]; } else rest = [...imgs, ...rest];
    if (!rest.length) return; const canRef = RK.some(([k]) => capOf(k) > 0) && (refKinds.length > 1 || (refMax.image ?? 0) > 1);
    if (canRef) await addRefs(rest); else setRefErr(rest.some(f => fileFits('image', f)) ? `${modelName || 'This model'} takes one picture here. Click it to replace it.` : wrongTypeText(rest[0].name, ['image'])); };
  const [pv, setPv] = useState(''); const pvAt = useRef<HTMLElement | null>(null);
  const openPv = (key: string) => (e: React.MouseEvent<HTMLElement>) => { pvAt.current = e.currentTarget; setPv(v => v === key ? '' : key); };
  const needLast = (cfg.lastFrameModes ?? []).includes(p.mode);
  /* Loop (2026-10-26): a model whose caps say loop (LTX-2.5 22B local), with a start frame and no end frame. The clip ends on its first frame
   * and the repeated frame is cut, so it plays seamlessly on repeat. Off (or not offered) = not sent; a switch that no longer applies turns off. */
  const canLoop = !!lim?.loop && p.mode === 'i2v' && !!p.image; const loopOn = canLoop && p.fv.loop === '1';
  useEffect(() => { if (!canLoop && p.fv.loop) p.setFv('loop', ''); }, [canLoop]);
  /* ?loop=1 (Explore's Loop card, the Video menu's Loop row): Loop turns on once the start frame is in */
  const [askLoop, setAskLoop] = useState(new URLSearchParams(location.search).get('loop') === '1');
  useEffect(() => { const path = location.pathname; const apply = () => { if (location.pathname === path && !new URLSearchParams(location.search).get('workflow') && new URLSearchParams(location.search).get('loop') === '1') setAskLoop(true); };
    addEventListener('popstate', apply); return () => removeEventListener('popstate', apply); }, []);
  useEffect(() => { if (canLoop && askLoop) { setAskLoop(false); if (p.fv.loop !== '1') p.setFv('loop', '1'); } }, [canLoop, askLoop]);
  /* A recipe's optional stage (videoCaps stageToggle, 2026-10-29: LTX-2.5 DFR's Smooth motion, 48 fps): shown only at its quality and mode, on unless turned off. */
  const stg: { field: string; label: string; hint: string; resolution: string; modes: string[]; default: boolean } | null = lim?.stageToggle ?? null;
  const canStage = !!stg && p.resolution === stg.resolution && stg.modes.includes(p.mode) && !loopOn; const stageOn = canStage && (p.fv[stg!.field] == null || p.fv[stg!.field] === '' ? stg!.default : p.fv[stg!.field] === '1');
  const qOpts: { value: string; label: string }[] = lim?.quality === false ? [] : cfg.quality ?? []; // a model with fixed steps (videoCaps qualityOff: LTX-2.5 22B local) shows no Fast / Best toggle
  const [drop, setDrop] = useState(false);
  /* the mode follows the start frame on models that do both: a photo makes it image to video; no photo (removed, or a saved image-to-video
   * mode after a reload, when the photo isn't kept) goes back to text to video instead of blocking Generate on "Add a start frame" */
  /* (picking Image to video by hand with no photo yet keeps it: then Generate asks for the start frame) */
  const hadImage = useRef<boolean | null>(null);
  const autoMode = p.autoMode ?? p.setMode;
  useEffect(() => { if (p.image && p.mode === 't2v' && modeOk(p.provider, 'i2v')) autoMode('i2v');
    else if (!p.image && hadImage.current !== false && p.mode === 'i2v' && modeOk(p.provider, 't2v')) autoMode('t2v');
    hadImage.current = !!p.image; }, [!!p.image]);
  /* the first reference on the bar: Reference mode when this model makes it (references are used there only; shared/refFit.ts) */
  useEffect(() => { if (anyAdded && p.mode !== 'r2v' && modeOk(p.provider, 'r2v')) autoMode('r2v'); }, [anyAdded]);
  const menuItems: MenuItem[] = provs.map(x => { const m = models.find(y => y.id === x.id); const name = displayNameOf(m, x) ?? m?.name ?? x.name; const ok = modeOk(x.id, p.mode);
    return { id: x.id, name, family: m?.family ?? (x as any).family ?? undefined, badge: (m?.badges ?? []).includes('new') ? 'New' : undefined, open: x.kind === 'open-weights' || isOpenWeights(x, m),
      tip: [...metaOf(m ?? x), ok ? '' : `Doesn’t do ${preset?.label?.toLowerCase()}; picking it switches the mode`].filter(Boolean).join(' · '), p: { ...m, ...x, routes: (x as any).routes ?? m?.routes } }; });

  /* The bottom dock is Image's (ic-dock classes, one look). Every note that used to sit under it is now on a chip, in Generate (its second
   *  line, its tooltip) or in the "Before you generate" popover. */
  const dock = useRef<HTMLDivElement>(null); const genRef = useRef<HTMLButtonElement>(null); const [pfOpen, setPfOpen] = useState(false);
  useDockHeight(dock, '.vs'); /* shared/dockFit.ts (Image, Video and Audio) */
  usePromptGrow(p.promptRef, p.prompt); /* shared: the prompt grows 2 → 8 lines, the bar upward, as on Image */
  /* The chip row fits in Image's steps (ImageCanvas fit, 2026-10-23), never clipping a chip: 1. the group words go (Look, Sound),
   * 2. the model name truncates, 3. Enhance, Resolution and Aspect fold into Settings (last first, each given back when it fits),
   * 4. last resort: the workflow and Look chips keep only their icons (names in the tooltip). The workflow chip stays first. */
  const chipsEl = useRef<HTMLDivElement>(null); const folded = useChipFit(chipsEl); const fo = (k: string) => folded.includes(k); /* shared/dockFit.ts */
  const modelName = (tm ? shownName(tm) : null) ?? displayNameOf(cur, curM) ?? cur?.name ?? ''; const aspLabel = p.fv.aspect === 'auto' || !p.fv.aspect ? 'Auto' : String(p.fv.aspect);
  /* 2026-10-27, a model switch adapts the settings (the menu row's shared/settingsFit.ts answer, priced at exactly these): length, resolution,
   * aspect and sound move to the nearest the model makes, and one calm note says what moved. Recreate and Workflows keep their exact settings. */
  const sw = useSwitchNote();
  const applyFit = (fit: RowFit | null | undefined) => { const v = fit?.values; sw.show(fit?.note); if (!v) return;
    if (v.duration && Number(v.duration) > 0) p.setDuration(Number(v.duration)); if (v.resolution) p.setResolution(v.resolution);
    if (v.aspect) p.setFv('aspect', v.aspect); if (v.audio === '0' || v.audio === '1') p.setFv('audio', v.audio); };
  const sndNote = aud && !aud.supported ? `${modelName} makes silent clips` : aud?.supported ? `${modelName} always makes sound with the picture` : 'Sound depends on the model';
  const addOpts: { id: string; label: string; testId: string; go: () => void }[] = [];
  if (kfMode) { if (kfFrames.length < kfCaps.max) addOpts.push({ id: 'frames', label: 'Add frames', testId: 'vs-kf-add-menu', go: () => kfIn.current?.click() }); }
  else if (!p.image) addOpts.push({ id: 'start', label: p.mode === 'r2v' ? 'Upload a reference' : 'Start frame', testId: 'vs-start-add', go: () => fileIn.current?.click() });
  if (!kfMode && (refKinds.length > 1 || (refMax.image ?? 0) > 1) && RK.some(([k, kind]) => refKinds.includes(kind) && (p.vrefs[k]?.length ?? 0) < (refMax[kind] ?? 0))) addOpts.push({ id: 'refs', label: `References (${refKinds.join(', ')})`, testId: 'vs-ref-add', go: () => refIn.current?.click() });
  if (!kfMode && needLast && !p.lastFrame) addOpts.push({ id: 'end', label: 'End frame', testId: 'vs-end-add', go: () => lastIn.current?.click() });
  const setupGen = setupNeeded(tm, q, cur?.id) && !p.missing.length && !p.conflict && !rvShort && !rvOver && !rvLong && !raShort && !raLong && !raOver && !audioAlone && !durErr; /* inputs first, like Image (setup only when nothing else is wrong) */
  const noPlace = !setupGen && !q && !!cur && 'defaultRoute' in (cur as any) && (cur as any).defaultRoute == null; /* Image's "Set up a place to run first" */
  const issueOf = (f: string) => (p.issues ?? []).find((i: any) => i?.field === f);
  type Note = PreflightNote;
  const notes: Note[] = [];
  /* bar match (2026-10-23): what's missing is the list's first rows, as in Image's pre-flight (a click on Generate opens it) */
  p.missing.forEach((m, i) => notes.push({ key: `miss-${i}`, stage: 'Inputs', hard: true, node: <span data-testid="vs-missing">{missShort(m, p.mode)}</span> }));
  if (p.imgErr) notes.push({ key: 'imgErr', stage: 'Inputs', node: p.imgErr });
  if (refErr) notes.push({ key: 'refErr', stage: 'Inputs', node: <span data-testid="vs-ref-err">{refErr}</span> });
  if (overN > 0) notes.push({ key: 'refOver', stage: 'Inputs', node: <span data-testid="vs-ref-over">{overN} {overN === 1 ? 'reference isn’t' : 'references aren’t'} sent: {fullText(refCaps, modelName || 'this model')}. <button type="button" className="lk-btn" data-testid="vs-ref-over-remove" onClick={dropExtras}>Remove {overN === 1 ? 'it' : 'them'}</button></span> });
  if (kfMode && kfErr) notes.push({ key: 'kfErr', stage: 'Inputs', node: <span data-testid="vs-kf-err">{kfErr}</span> });
  for (const f of ['image', 'refs', 'refVideos', 'refAudios', 'keyframes', 'keyframeTimes', 'prompt', 'resolution']) if (issueOf(f)) notes.push({ key: `f-${f}`, stage: 'Inputs', node: <FieldIssue issues={p.issues} field={f} /> });
  if (p.conflict) notes.push({ key: 'conflict', stage: 'Inputs', hard: true, node: <span data-testid="vs-conflict" role="alert">{p.conflict}</span> });
  if (rvShort) notes.push({ key: 'rvShort', stage: 'Inputs', hard: true, node: <span data-testid="vs-refvideo-short">Each reference clip must be at least {rvs.minEach}s.</span> });
  if (rvOver) notes.push({ key: 'rvOver', stage: 'Inputs', hard: true, node: <span data-testid="vs-refvideo-over">Reference clips add up to {rvTotal.toFixed(1)}s; the limit is {rvs.maxTotal}s.</span> });
  if (rvLong) notes.push({ key: 'rvLong', stage: 'Inputs', hard: true, node: <span data-testid="vs-refvideo-long">Each reference clip can be at most {rvs.maxEach}s.</span> });
  if (raShort) notes.push({ key: 'raShort', stage: 'Inputs', hard: true, node: <span data-testid="vs-refaudio-short">Each reference audio clip must be at least {ras.minEach}s.</span> });
  if (raLong) notes.push({ key: 'raLong', stage: 'Inputs', hard: true, node: <span data-testid="vs-refaudio-long">Each reference audio clip can be at most {ras.maxEach}s.</span> });
  if (raOver) notes.push({ key: 'raOver', stage: 'Inputs', hard: true, node: <span data-testid="vs-refaudio-over">Reference audio adds up to {raTotal.toFixed(1)}s; the limit is {ras.maxTotal}s.</span> });
  if (audioAlone) notes.push({ key: 'audioAlone', stage: 'Inputs', hard: true, node: <span data-testid="vs-refaudio-alone">This model takes reference audio only next to a reference image or clip. Add one, or remove the audio.</span> });
  if (durErr) notes.push({ key: 'durErr', stage: 'Inputs', node: <span data-testid="vs-duration-error">{durErr}</span> });
  if (q?.issues?.[0] && q.issues[0].code !== 'invalid_duration') notes.push({ key: 'qIssue', stage: 'Inputs', node: <span data-testid="vs-quote-issue">{q.issues[0].message}</span> });
  if (gate) notes.push({ key: 'gate', stage: 'Setup', hard: true, node: <KeyNeeded q={q} className="vs-key" toolId={p.tool.id} /> });
  if (unpriced && !gate) notes.push({ key: 'unpriced', stage: 'Model', hard: true, node: <span data-testid="vs-price-block" role="status">{unpricedPrefix(q)}{unpricedWhy}</span> });
  if (blockWhy) notes.push({ key: 'blockWhy', stage: 'Model', hard: true, node: <span data-testid="vs-blocked" role="status">{blockWhy}</span> });
  if (!gate && (gq.full || gq.almostFull)) notes.push({ key: 'queue', stage: 'Setup', hard: gq.full, node: <GenHint /> });
  const routeIssue = (p.issues ?? []).some((i: any) => i?.code === 'route_not_runnable' || i?.code === 'idempotency_conflict');
  if (routeIssue) notes.push({ key: 'route', stage: 'Setup', node: <RouteNotRunnable issues={p.issues} /> });
  const blocking = notes.some(n => n.hard);
  /* only an input is missing (a prompt, a photo): Generate shows the price like Image's and 3D's; the missing step is the tooltip, a click nudges it (audit P3) */
  const priceFirst = !qFull && p.missing.length > 0 && !p.conflict && !notes.some(n => n.hard && !n.key.startsWith('miss-')) && !unpriced && !blockWhy && credits != null;
  /* a note that arrives from the last run or an add (not a standing state) opens the list once; a click on Generate opens it too */
  const eventKey = [p.imgErr, refErr, ...['image', 'refs', 'refVideos', 'refAudios', 'prompt', 'resolution'].map(f => issueOf(f)?.message), subDur?.message, routeIssue ? 'route' : ''].filter(Boolean).join('|');
  useEffect(() => { if (eventKey) setPfOpen(true); }, [eventKey]);
  useEffect(() => { if (pfOpen && !notes.length) setPfOpen(false); });
  const est = estimateWords(q);
  const genTitle = qFull ? gq.block : p.conflict ? p.conflict : blockWhy ? blockWhy : gate ? 'Needs a provider key' : durErr ? durErr : why ? why : unpricedWhy ? `${unpricedPrefix(q)}${unpricedWhy}` : [priceTitle(q, bill, { demo: isDemo, free: isFree, credits: !unpriced && !blockWhy ? credits : null }), est?.long].filter(Boolean).join(' ') || undefined;
  /* Generate's second line (Image's behaviour): the price · time when it can run, else the first problem in a few words, in Image's pre-flight
   * order (inputs → model → setup → money) and wording (PF_SHORT). The full sentences stay in the title and the "Before you generate" list. */
  const pf0 = preflightProblems({ freeLocal: hasFreeLocal(p.tool.id), quote: q, modelName: modelName })[0];
  const genWord = qFull ? 'Queue full' : p.missing.length ? missShort(p.missing[0], p.mode) : p.conflict ? 'Remove the start frame' : rvShort ? 'Reference clip too short' : rvOver ? 'Reference clips too long' : durErr ? 'Pick another length'
    : gate ? (q?.setup?.action === 'add_key' && q.setup.actionText ? String(q.setup.actionText) /* the quote's own step: "Add a BytePlus key" */
      : (q?.keyOwner || q?.noProvider?.keyOwner) ? addKeyText(q) /* KeyNeeded's words: "Add a BytePlus key" */
      : q?.noProvider?.providers?.[0]?.name ? `Add a ${String(q.noProvider.providers[0].name).replace(/\s*\(.*\)\s*$/, '')} key` /* "Add a BytePlus ModelArk key" */
      : pf0?.code === 'needs_key' && /^Needs an? .+ key$/.test(pf0.message) && !/provider key/.test(pf0.message) ? pf0.message.replace(/^Needs an? /, 'Add a ')
      : (q?.setup?.runOnLabel ?? q?.runOnLabel) ? `Add a ${q.setup?.runOnLabel ?? q.runOnLabel} key` : PF_SHORT.needs_key(pf0!))
    : unpriced ? PF_SHORT.price_unavailable(pf0!) : blockWhy ? (pf0 && PF_SHORT[pf0.code] ? PF_SHORT[pf0.code](pf0) : firstWords(blockWhy)) : blocking ? 'See what to fix' : '';

  /* Enhance: Create Video keeps it in its fields (enhance=1 on the run, off unless turned on); the peek below shows the words it adds */
  const enhOn = p.fv.enhance === '1' || p.fv.enhance === true as any; const setEnh = (b: boolean) => p.setFv('enhance', b ? '1' : '');
  const showEnh = (r: EnhanceResult) => showEnhanced(r, p.setPrompt, toast);
  /* "See the exact prompt": the fields AppTool's submit sends for this bar (types, prompt, resolution, duration, provider, every field value), the files as counts */
  const peekForm: PeekForm = { toolId: p.tool.id, fields: { types: JSON.stringify([p.mode]), prompt: p.prompt, resolution: p.resolution, duration: String(p.duration), ...(p.provider ? { provider: p.provider } : {}),
      ...Object.fromEntries(Object.entries(p.fv).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)])) },
    files: { ...(p.image ? { image: 1 } : {}), ...(needLast && p.lastFrame ? { lastFrame: 1 } : {}), ...Object.fromEntries(RK.map(([k]) => [k, p.vrefs[k]?.length ?? 0]).filter(([, n]) => Number(n) > 0)) }, photo: null };

  /* Look's tabs. Camera: a move applies to this run (no workflow switch; picking workflows is the first chip). Every model here reads the prompt,
   * so every model follows the move; a model marked cameraPrompt:false in its limits gets the note and an explicit way to Camera Moves instead. */
  const camFollows = lim?.cameraPrompt !== false; const camList = camPresets.filter(x => x.id !== 'free' && !/^(ltx|h3)-/.test(x.id)); /* model-specific LoRA moves (LTX, H3) stay in Camera Moves; Look is model-agnostic */
  const pickLook = (fn: () => void) => { fn(); closePop(); };
  const lookTabs: LookTab[] = [
    { id: 'camera', label: 'Camera', searchLabel: 'Search moves', note: camFollows ? undefined : <><span>{modelName} can’t follow camera moves from the prompt.</span><button type="button" className="lk-btn" data-testid="vs-look-use-camera" onClick={() => { closePop(); navigate(toolHandoffHref({ id: 'camera' }, camOn ? `preset=${encodeURIComponent(camOn)}` : '')); }}>Use Camera Moves instead</button></>,
      footer: camList.length ? <Link to={`${videoWorkflowHref('camera-moves')}&pick=move`} data-testid="vs-look-all" title="Opens Camera Moves with its move picker">See all {camPresets.length} in Camera Moves</Link> : undefined,
      items: camList.length ? [{ id: 'none', label: 'No move', sub: 'The model frames it', testId: 'vs-cam-none', selected: !camOn, image: exampleFor('general').poster, title: 'No camera move: the model frames the shot', pinned: true, keywords: 'none free general', onPick: () => pickLook(() => p.setFv('cameraMove', '')) },
        ...camList.map(x => ({ id: x.id, label: x.label, sub: x.category, detail: x.description ?? null, keywords: `${x.description ?? ''} ${x.prompt ?? ''}`, testId: `vs-cam-${x.id}`, selected: cam?.id === x.id, title: `${x.label}: ${x.description ?? x.prompt ?? ''} Same model and price.`.trim(),
          video: x.previewUrl || x.previewWebm ? { mp4: x.previewUrl, webm: x.previewWebm } : null, image: x.posterUrl && !x.posterPlaceholder ? x.posterUrl : null, motion: { id: x.id, category: x.category },
          badge: (camNew.has(x.id) || x.category === 'new') ? <em className="vs-new vs-tile-new">New</em> : null, onPick: () => pickLook(() => { if (camFollows) p.setFv('cameraMove', x.id); }) }))] : [] },
    { id: 'style', label: 'Style', searchLabel: 'Search styles', items: (() => { const st = vps.filter(x => x.kind === 'style'); return st.length ? [{ id: 'none', label: 'No style', sub: 'As you wrote it', testId: 'vs-vp-none', selected: !p.fv.videoPreset, image: exampleFor('general').poster, pinned: true, keywords: 'none general', onPick: () => pickLook(() => { p.setFv('videoPreset', ''); p.setFv('intensity', ''); }) },
        ...st.map(x => ({ id: x.id, label: x.label, sub: x.description ?? null, detail: x.description ?? null, note: x.posterNote ?? null, testId: `vs-vp-${x.id}`, selected: vp?.id === x.id, image: x.posterUrl, keywords: `${x.prompt} ${x.description ?? ''}`, onPick: () => pickLook(() => { p.setFv('videoPreset', x.id); p.setFv('intensity', x.intensities?.[0] ?? ''); }) }))] : []; })() },
    viral.lookTab,
    /* modes this model makes; one mode only → no tab */
    { id: 'mode', label: 'Mode', searchLabel: 'Search modes', items: (() => { const ms = presets.filter(x => modeOk(p.provider, x.id)); return ms.length > 1 ? ms.map(x => { const e = exampleFor(MODE_ART[x.id] ?? x.id);
        return { id: x.id, label: x.label, sub: (x.id === 'keyframes' ? kfCopy(kfCaps) : MODE_COPY[x.id]) ?? '', testId: `h3-mode-${x.id}`, selected: p.mode === x.id, video: { mp4: e.src, poster: e.poster }, onPick: () => pickLook(() => p.setMode(x.id)) }; }) : []; })() },
  ];

  /* the lead's thumbnails (start frame, references, end frame): a few on the bar, the rest behind "+N" (shared FilesTray, as on Image) */
  const leadThumbs: { f: TrayFile; el: React.ReactElement }[] = kfMode ? [] : [
    ...(p.image ? [{ f: { key: 'start', group: 'start', idx: 0, kind: 'image' as MediaKind, url: p.image.url, name: p.image.file.name, label: p.mode === 'r2v' ? 'Picture 1 · @image1' : 'Start frame', off: startOff }, el: <span key="start" className={`ic-th${startOff ? ' slot-over' : ''}`} data-testid="vs-start-thumb" data-unused={startOff ? '1' : undefined} {...tip(pv ? null : `${p.mode === 'r2v' ? refChipTip(tm?.key, 'image', 1) : 'Start frame'}${startOff ? ` · ${notUsedBy(modelName)}` : ''}${handoffOf(p.image.file) ? ' · from your image' : ''} · click to see it`)}><button type="button" className="ic-th-hit" aria-haspopup="dialog" aria-expanded={pv === 'start'} aria-label={`${p.mode === 'r2v' ? 'Picture 1' : 'Start frame'}${handoffOf(p.image.file) ? ', from your image' : ''}. Open it`} onClick={openPv('start')}><img src={p.image.url} alt="Start frame" onLoad={() => p.onFrameImageReady?.(p.image!.url)} />{startOff ? <em className="slot-badge" aria-hidden>Not used</em> : handoffOf(p.image.file) && <em className="slot-badge from" aria-hidden>From image</em>}</button><button type="button" className="ic-x" aria-label="Remove start frame" onClick={p.clearImage}><CloseIcon size={12} /></button></span> }] : []),
    ...RK.flatMap(([k, kind]) => (p.vrefs[k] ?? []).map((r, i) => { const off = i >= capNow(k); const n = kind === 'image' ? (startIsRef ? 1 : 0) + i + 1 : i + 1;
              return { f: { key: k + i + r.url, group: k, idx: i, kind: kind as MediaKind, url: kind === 'audio' ? undefined : r.url, name: r.file.name, label: `${kind === 'image' ? `Picture ${n} · @image${n}` : kind === 'video' ? `Clip ${n} · @video${n}` : `Sound ${n}`}`, off }, el: <span key={k + i + r.url} className={`ic-th vs-ref-${kind}${off ? ' slot-over' : ''}${kind === 'video' && rvs && rvDur[r.url] !== undefined && rvDur[r.url] < rvs.minEach ? ' bad' : ''}`} data-testid={`vs-ref-thumb-${k}-${i}`} data-unused={off ? '1' : undefined} {...(kind === 'image' && (p.vrefs.refs?.length ?? 0) > 1 ? dragImg(i) : {})}
                {...tip(pv ? null : `${r.file.name} · ${refChipTip(tm?.key, kind as 'image' | 'video' | 'audio', n)}${off ? ` · ${notUsedBy(modelName)}` : ''}${kind === 'image' && (p.vrefs.refs?.length ?? 0) > 1 ? ' · drag to reorder' : ''}`)}>
                <button type="button" className="ic-th-hit" aria-haspopup="dialog" aria-expanded={pv === `${k}:${i}`} aria-label={`${kind === 'image' ? `Picture ${n}` : kind === 'video' ? `Clip ${n}` : `Sound ${n}`}: ${r.file.name}${off ? `. ${notUsedBy(modelName)}` : ''}. Open it`} onClick={openPv(`${k}:${i}`)}>
                  {kind === 'image' ? <img src={r.url} alt="" /> : kind === 'video' ? <><VideoThumb src={r.url} /><em className="ic-att-n">{rvDur[r.url] !== undefined ? `${rvDur[r.url].toFixed(1)}s` : '…'}</em></> : <span aria-hidden>♪</span>}
                  {off ? <em className="slot-badge" aria-hidden>Not used</em> : handoffOf(r.file) ? <em className="slot-badge from" aria-hidden>From image</em> : null}</button>
                <button type="button" className="ic-x" aria-label={`Remove ${r.file.name}`} onClick={() => removeRef(k, i)}><CloseIcon size={12} /></button></span> }; })),
    ...(needLast && p.lastFrame ? [{ f: { key: 'end', group: 'end', idx: 0, kind: 'image' as MediaKind, url: p.lastFrame.url, name: p.lastFrame.file.name, label: 'End frame' }, el: <span key="end" className="ic-th vs-end" data-testid="vs-end-thumb" {...tip(pv ? null : 'End frame · click to see it')}><button type="button" className="ic-th-hit" aria-haspopup="dialog" aria-expanded={pv === 'end'} aria-label="End frame. Open it" onClick={openPv('end')}><img src={p.lastFrame.url} alt="End frame" /></button><button type="button" className="ic-x" aria-label="Remove end frame" onClick={() => p.setLastFrame(null)}><CloseIcon size={12} /></button></span> }] : []),
  ];
  const leadShown = thumbsShown(leadThumbs.length);
  /* One Video feed (2026-10-26): on the Video page the feed is the page's own (ui/video/VideoPage), so switching workflows never remounts it; this bar only hands it its runs and actions */
  const hosted = useHostedVideoFeed({ jobs: p.jobs, onSelect: p.onSelect, viewerActions: p.viewerActions });
  return <div className={hosted ? 'vs-bar' : 'vs vs-dk'} data-testid={hosted ? 'vs-bar' : 'video-studio'} data-workflow="create">
    {!hosted && <section className="vs-main" aria-label="Generate video">
      <VideoFeed jobs={p.jobs} onSelect={p.onSelect} workflowId={VIDEO_LANDING_FEED} /* the Video tab's landing lists every video (user, 2026-10-26) */ viewerActions={p.viewerActions} tools={p.tools} />
    </section>}
    <div className="ic ic2 vs-icd"><div className={`ic-dock vs-dock${dropOn ? ' slot-drop-on' : ''}`} data-testid="vs-dock" ref={dock} onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); if (!dropOn) setDropOn(true); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn(false); }} onDrop={e => { setDropOn(false); const fs = Array.from(e.dataTransfer.files); if (!fs.length) return; e.preventDefault(); void dropFiles(fs); }}>
      <div className="ic-frame"><div className="ic-panel">
      <div className="ic-main">
        {p.frameHandoff && <Notice kind={p.frameHandoff.phase === 'error' ? 'error' : 'info'} testId="vs-frame-handoff" aria-busy={p.frameHandoff.phase === 'loading'} title={p.frameHandoff.phase === 'error' ? 'Couldn’t load the last frame' : 'Extracting last frame…'} onClose={p.frameHandoff.phase === 'error' ? p.onCancelFrameHandoff : undefined}
          action={p.frameHandoff.phase === 'error' ? { label: 'Try again', onClick: p.onRetryFrameHandoff } : { label: 'Cancel', onClick: p.onCancelFrameHandoff }}>
          {p.frameHandoff.phase === 'error' ? p.frameHandoff.message : 'Full-resolution clips can take a little longer. You can keep writing your prompt.'}
        </Notice>}
        {viral.strip}
        <div className="ic-prow" data-testid="vs-prow">
          <div className="ic-lead" data-testid="vs-dlead">
            {kfMode ? <KeyframeLead frames={kfFrames} times={kfTimes} seconds={p.duration} caps={kfCaps} onChange={setKf} onAdd={() => kfIn.current?.click()} onOpen={() => pop.setOpen('kf')} /> : <>
            {leadThumbs.slice(0, leadShown.show).map(t => t.el)}
            <MoreFiles hidden={leadShown.more} items={leadThumbs.map(t => t.f)} watch={dock} testId="vs-more" summary={curFit && !curFit.all ? notUsedShort(curFit) : undefined} offText="Not used" action={overN > 0 ? { label: `Remove the ${overN} not used`, onClick: dropExtras } : null}
              onRemove={f => f.group === 'start' ? p.clearImage() : f.group === 'end' ? p.setLastFrame(null) : removeRef(f.group, f.idx)} onMove={(g, a, b) => moveRef(g)(a, b)} />
            {/* the dashed "+" for references (shared/AddTile): the model's real limit in its tooltip, a badge only near it; no counter text on the bar */}
            {leadThumbs.length > 0 && (refCaps.image ?? 0) > 1 && <AddTile used={refUsed.image ?? 0} max={refCaps.image ?? 0} testId="vs-add-tile" onAdd={() => refIn.current?.click()} />}
            {curFit && !curFit.all && <span className="vs-slot-wrap has-skip"><span className="vs-ref-skip" data-testid="vs-ref-skip" {...tip(`${modelName} won’t use ${skippedText(curFit)}. Pick another model, or remove ${curFit.haveN - curFit.usedN === 1 ? 'it' : 'them'}.`)}>{notUsedShort(curFit)}</span></span>}
            </>}
          </div>
          <label className="sr-only" htmlFor="app-prompt">Prompt</label>
          <textarea data-enter-submits="" ref={p.promptRef} id="app-prompt" className="ic-prompt prompt-field" rows={2} aria-label="Prompt" placeholder={loopOn ? 'Describe motion that comes back to the start, e.g. the flame flickers and settles' : p.suggestPrompt ? 'Describe the motion you imagine' : 'Describe the shot you imagine'} value={p.prompt} onChange={e => p.setPrompt(e.target.value)} />
          <MentionLayer taRef={p.promptRef} value={p.prompt} counts={{ image: nRefImg, video: p.vrefs.refVideos?.length ?? 0, audio: p.vrefs.refAudios?.length ?? 0 }} />
          {/* Turn to video: the picture's own prompt, one click away inside the empty box (it was a chip that squeezed the model name off the row) */}
          {p.suggestPrompt && !p.prompt.trim() && <button type="button" className="ic-prompt-sugg" data-testid="use-image-prompt" {...tip(p.suggestPrompt)} onClick={() => { p.setPrompt(p.suggestPrompt!); requestAnimationFrame(() => p.promptRef.current?.focus()); }}>Use the picture’s prompt</button>}
        </div>
        <SwitchNote note={sw.note} testId="vs-switch-note" />
        <LeftNote text={left} onClose={() => setLeft('')} testId="vs-not-added" />
        <div className="ic-chiprow"><div ref={chipsEl} className="ic-chips">
          <input ref={fileIn} type="file" hidden accept={IMAGE_ACCEPT} data-picker-title={p.mode === 'r2v' ? 'Choose a reference' : 'Choose a start frame'} data-picker-limits="One image · PNG, JPG or WebP · or a frame from one of your videos" data-picker-frames="" data-testid="vs-start-input" onChange={e => { const fs = Array.from(e.target.files ?? []); e.currentTarget.value = ''; if (fs[0]) void takeStart(fs[0]); }} />
          <input ref={refIn} type="file" hidden multiple data-picker-title="Choose references" data-picker-limits={refLimits} data-testid="vs-ref-input" accept={RK.filter(([, kind]) => refKinds.includes(kind)).map(([, kind]) => refAccept(kind, refFmts)).join(',')} onChange={e => { const fs = Array.from(e.target.files ?? []); e.currentTarget.value = ''; const r = repl.current; repl.current = null; if (r && fs[0]) void replaceRef(r.k, r.i, fs[0]); else void addRefs(fs); }} />
          <input ref={lastIn} type="file" hidden accept={IMAGE_ACCEPT} data-picker-title="Choose an end frame" data-picker-limits="One image · PNG, JPG or WebP · or a frame from one of your videos" data-picker-frames="" data-testid="h3-last-frame-input" onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) void takeEnd(f); }} />
          <input ref={kfIn} type="file" hidden multiple accept={IMAGE_ACCEPT} data-picker-max={Math.max(0, kfCaps.max - kfFrames.length)} data-picker-title="Choose frames" data-picker-limits={`${kfCaps.min} to ${kfCaps.max} pictures · PNG, JPG or WebP · in clip order, or frames from your videos`} data-picker-frames="" data-testid="vs-kf-input" onChange={e => { const fs = Array.from(e.target.files ?? []); e.currentTarget.value = ''; if (fs.length) addKf(fs); }} />
          <span className="ic-fixed" data-testid="vs-chips-fixed">
            <VideoWorkflowChip tools={p.tools} dock watch={dock} />{/* bar match (2026-10-23): first chip of the chip row, like Image's "Create ⌃"; the prompt starts at the left */}
              <button ref={aR.add} type="button" className="ic-chip ic-sq" data-testid="vs-add" aria-label="Add a photo" aria-haspopup="menu" aria-expanded={pop.open === 'add'} disabled={!addOpts.length} {...tip(addOpts.length ? 'Add a start frame or references' : kfMode ? `Up to ${kfCaps.max} frames` : RK.some(([k]) => capOf(k) > 0) ? fullText(refCaps, modelName || 'This model') : 'Everything this mode takes is added')} onClick={() => { if (addOpts.length === 1) addOpts[0].go(); else pop.setOpen(pop.open === 'add' ? '' : 'add'); }}><svg className="ic-pi" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
            <button ref={aR.model} type="button" className={`ic-chip ic-model ${pop.open === 'model' ? 'on' : ''}`} data-testid="vs-model" aria-haspopup="listbox" aria-expanded={pop.open === 'model'} {...tip(pop.open === 'model' ? null : (viaTxt ? `${modelName} · ${viaTxt}` : modelName))} onClick={() => pop.setOpen(pop.open === 'model' ? '' : 'model')}><MakerTile className="ic-dot" medium="video" maker={tm?.maker} makerName={tm?.makerName} fallback={(cur as any)?.family || cur?.name} /><span className="ic-mname"><Words text={modelName} /></span><svg className="ic-caret" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          </span>
          {/* Look: a compact popover above the chip (shared LookPicker): Camera (a move on this run), Style, Mode. The chip names what's picked:
            * "Camera · Slow pull", "Look · Noir", both joined; the ✕ clears the camera move and the style. Nothing here leaves the page. */}
          {(() => { const picks = [cam?.label, vp?.label].filter(Boolean) as string[]; const word = cam && !vp ? 'Camera' : 'Look'; const val = picks.join(' + ');
            return <button ref={aR.look} type="button" className={`ic-chip wf-grp vs-look${cam || vp ? " has-x" : ""}${pop.open === "look" ? " on" : ""}`} data-testid="vs-preset-change" aria-haspopup="dialog" aria-expanded={pop.open === 'look'} aria-label={`${word}${val ? `: ${val}` : ''}. Mode: ${preset?.label ?? 'General'}. Change camera move, style or mode`} {...tip(pop.open === 'look' ? null : `${val ? `${val} · ` : ''}Mode: ${preset?.label ?? 'General'}. Camera move, style or mode`)} onClick={() => pop.setOpen(pop.open === 'look' ? '' : 'look')}>{cam ? <span className="vs-look-glyph" aria-hidden><MotionGlyphIcon glyph={motionFor(cam.id, cam.category).glyph} size={14} /></span> : <BrushIcon size={14} />}{val ? <><span className="wf-grp-l">{word}</span><b data-testid="vs-look-value">{val}</b></> : <b>Look</b>}</button>; })()}
          {kfMode && <button ref={aR.kf} type="button" className={`ic-chip wf-grp vs-kf-chip${pop.open === 'kf' ? ' on' : ''}`} data-testid="vs-kf-chip" aria-haspopup="dialog" aria-expanded={pop.open === 'kf'} aria-label={`Frames: ${kfFrames.length} of ${kfCaps.max}. Change ${kfCaps.times ? 'times or order' : 'the order'}`} {...tip(pop.open === 'kf' ? null : kfCaps.times ? 'Frames: times and order' : 'Frames: order (spaced evenly)')} onClick={() => pop.setOpen(pop.open === 'kf' ? '' : 'kf')}><ChipGlyph icon="layers" /><span className="wf-grp-l">Frames</span><b>{kfFrames.length}/{kfCaps.max}</b></button>}
          {(cam || vp) && <button type="button" className="ic-chip ic-sq vs-look-x" data-testid="vs-look-clear" aria-label={`Remove ${[cam ? 'camera move' : '', vp ? 'style' : ''].filter(Boolean).join(' and ')}`} {...tip(`Remove ${[cam?.label, vp?.label].filter(Boolean).join(' and ')}`)} onClick={() => { p.setFv('cameraMove', ''); p.setFv('videoPreset', ''); p.setFv('intensity', ''); requestAnimationFrame(() => aR.look.current?.focus()); }}><CloseIcon size={12} /></button>}
          {vp?.intensities && <span className="ic-chip ic-static vs-int vs-int-d" role="radiogroup" aria-label="Intensity" data-testid="vs-intensity">{vp.intensities.map((v: string) => <button key={v} type="button" role="radio" aria-checked={p.fv.intensity === v} className={p.fv.intensity === v ? 'on' : ''} onClick={() => p.setFv('intensity', v)}>{v}</button>)}</span>}
          <ModelMenu open={pop.open === 'model'} anchor={aR.model} watch={dock} gap={4} placement="top" onClose={closePop} items={menuItems} value={p.provider} testId="vs-model-list" rowTestId={id => `vs-model-${id}`}
            onPick={(id, fit) => { p.setProvider(id); const to = anyAdded ? runModeOf(capsOfEngine(id), p.mode, added) : !modeOk(id, p.mode) ? cfg.providerModes[id][0] : p.mode; if (to !== p.mode) p.setMode(to); applyFit(fit); }}
            refFit={refFitFor} toolId={p.tool.id} quote={q}
            onNeed={n => { if (n.action === 'add-image' || n.action === 'add-end-frame') window.setTimeout(() => (p.image && n.action === 'add-end-frame' ? lastIn : fileIn).current?.click(), 0); }} />
          {durs.length > 1 ? <button ref={aR.dur} type="button" className={`ic-chip${pop.open === 'dur' ? ' on' : ''}${durErr ? ' vs-bad' : ''}`} data-testid="vs-duration" aria-haspopup="listbox" aria-expanded={pop.open === 'dur'} aria-invalid={durErr ? true : undefined} {...tip(pop.open === 'dur' ? null : durErr || (lim?.verified === false ? 'Length · not verified on this model yet' : 'Length'))} onClick={() => pop.setOpen(pop.open === 'dur' ? '' : 'dur')}><ChipGlyph icon="clock" />{p.duration} s</button>
            : <span className={`ic-chip ic-static${durErr ? ' vs-bad' : ''}`} data-testid="vs-duration" {...tip(durErr || (lim?.verified === false ? 'The only length offered; not yet verified on this model' : lim?.durationsByResolution?.[p.resolution] ? `The only length this model makes at ${resLbl(p.resolution)}` : 'The only length this model makes'))}><ChipGlyph icon="clock" />{p.duration} s</span>}
          {aspects.length > 1 ? <button ref={aR.asp} type="button" data-fold="asp" className={`ic-chip${pop.open === 'asp' ? ' on' : ''}`} data-testid="vs-aspect" aria-haspopup="listbox" aria-expanded={pop.open === 'asp'} {...tip(pop.open === 'asp' ? null : 'Aspect ratio')} onClick={() => pop.setOpen(pop.open === 'asp' ? '' : 'asp')}><AspectIcon size={16} />{aspLabel}</button>
            : <span className="ic-chip ic-static" data-fold="asp" data-testid="vs-aspect" {...tip('This model picks the aspect itself')}><AspectIcon size={16} />{aspLabel}</span>}
          {resList.length > 1 ? <button ref={aR.res} type="button" data-fold="res" className={`ic-chip${pop.open === 'res' ? ' on' : ''}`} data-testid="vs-resolution" aria-haspopup="listbox" aria-expanded={pop.open === 'res'} {...tip(pop.open === 'res' ? null : 'Resolution')} onClick={() => pop.setOpen(pop.open === 'res' ? '' : 'res')}><ResolutionIcon size={16} />{resLbl(p.resolution)}</button>
            : <span className="ic-chip ic-static" data-fold="res" data-testid="vs-resolution" {...tip('The only resolution this model offers')}><ResolutionIcon size={16} />{resLbl(p.resolution)}</span>}
          {canLoop && <button type="button" role="switch" aria-checked={loopOn} className={`ic-chip vs-loop-t${loopOn ? ' on' : ''}`} data-testid="vs-loop-toggle" {...tip(loopOn ? 'Loop on: the clip ends on its first frame, so it repeats with no jump. Describe motion that comes back' : 'Loop: end on the first frame, so the clip repeats with no jump')} onClick={() => p.setFv('loop', loopOn ? '' : '1')}><ChipGlyph icon="loop" /><span className="vs-t">Loop</span></button>}
          {canStage && <button type="button" role="switch" aria-checked={stageOn} className={`ic-chip vs-loop-t${stageOn ? ' on' : ''}`} data-testid="vs-stage-toggle" {...tip(`${stg!.label}: ${stageOn ? 'on' : 'off'}. ${stg!.hint}`)} onClick={() => p.setFv(stg!.field, stageOn ? '0' : '1')}><ChipGlyph icon="quality" /><span className="vs-t">{stg!.label}</span></button>}
          {ras && (p.vrefs.refAudios?.length ?? 0) > 0 && <span className={`ic-chip ic-static vs-rv${raOver || raShort || raLong ? ' vs-bad' : ''}`} data-testid="vs-refaudio-total" {...tip(`Reference audio: ${raTotal.toFixed(1)}s of ${ras.maxTotal}s`)}>Audio {raTotal.toFixed(1)} / {ras.maxTotal} s</span>}
          {rvs && (p.vrefs.refVideos?.length ?? 0) > 0 && <span className={`ic-chip ic-static vs-rv${rvOver || rvShort ? ' vs-bad' : ''}`} data-testid="vs-refvideo-total" {...tip(`Reference clips: ${rvTotal.toFixed(1)}s of ${rvs.maxTotal}s${rvs.billed ? ' · billed as input' : ''}${refDelta ? ` · adds ${refDelta.replace(/^\+/, '')}` : ''}`)}>Clips {rvTotal.toFixed(1)} / {rvs.maxTotal} s{refDelta && <small className="opt-delta" data-testid="vs-ref-price">{refDelta}</small>}</span>}
          {refDelta && !(rvs && (p.vrefs.refVideos?.length ?? 0) > 0) && <span className="ic-chip ic-static vs-rv" data-testid="vs-ref-price" {...tip(`Your references add ${refDelta.replace(/^\+/, '')} to this run`)}>Refs<small className="opt-delta">{refDelta}</small></span>}
          {p.sameSeed && <span className="ic-seed" data-testid="vs-seed">{p.sameSeed}</span>}
          {/* Enhance (Image's sparkle): a click turns it on/off for the run (field enhance=1, the server adds the words); right-click opens the panel (Rewrite my prompt now) */}
          <EnhanceChip ref={aR.enh} data-fold="enh" testId="vs-enhance" can={!!cfg.enhance} on={enhOn} open={pop.open === 'enh'} onToggle={setEnh} onPanel={o => pop.setOpen(o ? 'enh' : '')} />
          {(qOpts.length > 1 || bitrates.length > 1 || folded.length > 0 || sndShown) && <SettingsChip ref={aR.q} testId="vs-settings" open={pop.open === 'set'} soundOn={sndOn} ariaLabel={`Settings: ${[sndShown ? `sound ${sndOn ? 'on' : 'off'}` : '', qOpts.length > 1 ? 'quality and bitrate' : bitrates.length > 1 ? 'bitrate' : '', fo('asp') ? `aspect ${aspLabel}` : '', fo('res') ? `resolution ${resLbl(p.resolution)}` : '', fo('enh') ? `Enhance ${enhOn ? 'on' : 'off'}` : ''].filter(Boolean).join(', ')}`} tip={tip(pop.open === 'set' ? null : sndShown ? `Settings · Sound ${sndOn ? 'on' : 'off'}` : 'Settings')} onClick={() => pop.setOpen(pop.open === 'set' ? '' : 'set')} />}
          <RowMore watch={dock} testId="vs-row-over" />{/* Brand and the eye fold in here on a short row (shared/RowMore) */}
        </div>
          {tm && <RunOnChip compact toolId={p.tool.id} model={tm} engine={cur?.id} quote={q} testId="vs-run-on" watch={dock} />}
          <BrandChip toolId={p.tool.id} mode={p.mode} watch={dock} />{/* Brand Kit: "Brand: <name>" */}
          <PromptPeek form={peekForm} place={ro.sub ? `${ro.main} (${ro.sub})` : ro.main} photos={[]} watch={dock} />
        </div>
      </div>
      {noPlace ? <NoPlaceGenerate testId="vs-generate" priceTestId="vs-price" />
        : setupGen ? <SetupGenerate toolId={p.tool.id} model={tm} engine={cur?.id} quote={q} className="ic-gen gen-btn gen-dock btn btn-primary" testId="vs-generate" priceTestId="vs-price" />
        : <button ref={genRef} type="button" className={`ic-gen gen-btn gen-dock btn btn-primary vs-dgen${!p.busy && (p.missing.length > 0 || blocking) ? ' gen-wait' : ''}`} data-testid="vs-generate" data-problems={notes.length || undefined} disabled={p.busy || qFull || !!p.frameHandoff} aria-busy={p.busy || undefined} aria-disabled={p.missing.length > 0 || blocking || !!p.frameHandoff || undefined} data-why={why || undefined} aria-describedby={why ? 'vs-why' : undefined}
          aria-haspopup={blocking ? 'dialog' : undefined} aria-expanded={blocking ? pfOpen : undefined} title={pfOpen ? undefined : genTitle}
          onClick={e => { if (blocking) { setPfOpen(o => !o); return; } if (p.missing.length) { nudgeMissing(e.currentTarget); return; } setPfOpen(false); p.onGenerate(); }}><span className="gen-l">{p.busy ? <i className="as-spin" aria-hidden /> : null}Generate</span>
          {genWord && !(priceFirst) ? <span className="gen-price gen-missing" data-testid="vs-price">{genWord}</span> : <GenPrice compact testId="vs-price" q={q} demo={isDemo} free={isFree} credits={!unpriced && !blockWhy ? credits : null} />}</button>}
      </div></div>
      {p.missing.length > 0 && !gate && <p className="sr-only" id="vs-why">{why}</p>}
      {(() => { const [k, si] = pv.split(':'); const i = Number(si); const isRef = !!si; const it = pv === 'start' ? p.image : pv === 'end' ? p.lastFrame : isRef ? p.vrefs[k]?.[i] ?? null : null;
        const kind: MediaKind = isRef ? (RK.find(x => x[0] === k)?.[1] as MediaKind) : 'image'; const off = isRef && i >= capNow(k);
        const flf = modeOk(p.provider, 'flf') && (cfg.lastFrameModes ?? []).includes('flf'); const i2v = modeOk(p.provider, 'i2v');
        const acts: SlotAction[] = [];
        if (it && kind === 'image' && pv !== 'start' && i2v && !kfMode) acts.push({ label: 'Use as start frame', testId: 'vs-pv-as-start', onClick: () => { const was = p.image; if (pv === 'end') p.setLastFrame(was); else if (was) p.setVrefs(k, (p.vrefs[k] ?? []).map((r, j) => j === i ? was : r)); else p.setVrefs(k, (p.vrefs[k] ?? []).filter((_, j) => j !== i)); p.onImage([it.file]); if (p.mode !== 'i2v' && p.mode !== 'flf') autoMode('i2v'); } });
        if (it && kind === 'image' && pv !== 'end' && flf && !kfMode) acts.push({ label: 'Use as end frame', testId: 'vs-pv-as-end', onClick: () => { const was = p.lastFrame; p.setLastFrame(it); if (pv === 'start') { if (was) p.onImage([was.file]); else p.clearImage(); } else p.setVrefs(k, (p.vrefs[k] ?? []).filter((_, j) => j !== i)); if (p.mode !== 'flf') p.setMode('flf'); } });
        const from = it && handoffOf(it.file) ? 'From your image: the picture you turned into a video. Remove it to start from another.' : null;
        return <SlotPreview open={!!pv && !!it} anchor={pvAt} onClose={() => setPv('')} item={it} kind={kind} watch={dock} testId="vs-pv" aspect={String(p.fv.aspect ?? 'auto')}
          title={pv === 'start' ? (p.mode === 'r2v' ? 'Picture 1 · @image1' : 'Start frame') : pv === 'end' ? 'End frame' : kind === 'image' ? `Picture ${(startIsRef ? 1 : 0) + i + 1} · @image${(startIsRef ? 1 : 0) + i + 1}` : kind === 'video' ? `Clip ${i + 1} · @video${i + 1}` : `Sound ${i + 1}`}
          warn={off ? `${notUsedBy(modelName)}.` : null} notes={[from]} actions={acts}
          onReplace={() => { if (pv === 'start') fileIn.current?.click(); else if (pv === 'end') lastIn.current?.click(); else { repl.current = { k, i }; refIn.current?.click(); } }}
          onRemove={() => { if (pv === 'start') p.clearImage(); else if (pv === 'end') p.setLastFrame(null); else removeRef(k, i); }} />; })()}
      <PreflightNotes open={pfOpen} notes={notes} anchor={genRef} dock={dock} onClose={() => setPfOpen(false)} testId="vs-notes" />
      <EnhancePop open={pop.open === 'enh'} anchor={aR.enh} avoid={dock} watch={dock} onClose={closePop} testId="vs-pop-enh" panelTestId="vs-enhance-panel" toggleTestId="vs-enhance-toggle" can={!!cfg.enhance} on={enhOn} onChange={setEnh} prompt={p.prompt} kind="video" model={tm?.key} onApply={showEnh} />
      <BarPopover open={pop.open === 'kf'} anchor={aR.kf} avoid={dock} watch={dock} placement="top" gap={8} onClose={closePop} label="Frames" role="dialog" testId="vs-kf-menu" width={380}><div className="bp-wrap">
        <KeyframePanel frames={kfFrames} times={kfTimes} seconds={p.duration} caps={kfCaps} onChange={setKf} onAdd={() => kfIn.current?.click()} onOpen={() => 0} /></div></BarPopover>
      <LookPicker open={pop.open === 'look'} anchor={aR.look} avoid={dock} watch={dock} onClose={closePop} tabs={lookTabs} tab={lookTab} onTab={setLookTab} label="Look" testId="vs-look" />
      <BarPopover open={pop.open === 'add'} anchor={aR.add} avoid={dock} watch={dock} placement="top" gap={8} onClose={closePop} label="Add to your video" role="menu" testId="vs-add-menu" width={240}><PopSection label="Add"><PopList label="Add" role="group">{addOpts.map(o => <PopRow key={o.id} role="menuitem" testId={o.testId} label={o.label} onClick={() => { closePop(); o.go(); }} />)}</PopList></PopSection></BarPopover>
      <BarPopover open={pop.open === 'dur'} anchor={aR.dur} avoid={dock} watch={dock} onClose={closePop} label="Duration" testId="vs-duration-menu" className="vs-apop vs-apop-dur" autoWidth><DurationSlider values={durs} value={p.duration} onChange={p.setDuration} onDone={closePop} price={durPrice} rate={durRate} /></BarPopover>
      <BarPopover open={pop.open === 'asp'} anchor={aR.asp} avoid={dock} watch={dock} onClose={closePop} label="Aspect ratio" role="listbox" testId="vs-aspect-menu" width={200}><PopSection label="Aspect ratio"><PopList label="Aspect ratio">{aspects.map(a => { const on = String(p.fv.aspect ?? 'auto') === a; return <PopRow key={a} selected={on} testId={`vs-aspect-${a.replace(':', 'x')}`} icon={<VsShape a={a} />} label={a === 'auto' ? 'Auto' : a} onClick={() => { p.setFv('aspect', a); closePop(); }} />; })}</PopList></PopSection></BarPopover>
      <BarPopover open={pop.open === 'res'} anchor={aR.res} avoid={dock} watch={dock} onClose={closePop} label="Resolution" role="listbox" testId="vs-resolution-menu" width={240}><PopSection label="Resolution"><PopList label="Resolution">{resSorted.map((r: string) => { const on = r === p.resolution; const isDef = (cfg.defaultResolutionByProvider?.[p.provider]) === r; return <PopRow key={r} selected={on} testId={`vs-res-${r}`} label={resLbl(r)} hint={lim?.resolutionHints?.[r] ?? `${resLbl(r) !== r ? `${r} · ` : ''}${resTag(resH(r))}${isDef ? ' · default' : ''}`} aside={<OptPrice text={resPrice(r)} testId={`vs-res-price-${r}`} />} onClick={() => { p.setResolution(r); closePop(); }} />; })}</PopList></PopSection></BarPopover>
      <BarPopover open={pop.open === 'set'} anchor={aR.q} avoid={dock} watch={dock} onClose={closePop} label="Settings" role="dialog" testId="vs-settings-menu" width={300}><div className="bp-wrap">
        {sndShown && <SoundSection aside={sndCan ? <>{sndOn ? 'On' : 'Off'}{sndDelta && <small className="opt-delta" data-testid="vs-audio-price">{sndDelta}</small>}</> : aud?.supported ? 'On' : aud ? 'Off' : undefined} note={sndNote}
          switches={sndCan ? [{ key: 'audio', label: 'Sound', on: sndOn, hint: sndHint, testId: 'vs-audio-toggle', onChange: v => p.setFv('audio', v ? '1' : '0') }] : []} />}
        {fo('asp') && aspects.length > 1 && <PopSection label="Aspect ratio" aside={String(p.fv.aspect ?? 'auto') === 'auto' ? 'Auto' : String(p.fv.aspect)}><Segmented label="Aspect ratio" cols={segCols(aspects.length)} value={String(p.fv.aspect ?? 'auto')} onChange={a => p.setFv('aspect', a)} onCommit={closePop}
          options={aspects.map(a => ({ value: a, label: a === 'auto' ? 'Auto' : a, icon: <VsShape a={a} />, testId: `vs-set-aspect-${a.replace(':', 'x')}` }))} /></PopSection>}
        {fo('res') && resList.length > 1 && <PopSection label="Resolution" aside={resLbl(p.resolution)}><Segmented label="Resolution" value={p.resolution} onChange={p.setResolution} onCommit={closePop}
          options={resSorted.map(r => { const pr = resPrice(r); return { value: r, label: resLbl(r), hint: lim?.resolutionHints?.[r] ?? (resLbl(r) !== r ? r : resTag(resH(r))), aside: pr !== null ? <OptPrice text={pr} testId={`vs-set-res-price-${r}`} /> : undefined, testId: `vs-set-res-${r}` }; })} /></PopSection>}
        {fo('enh') && cfg.enhance && <PopSection label="Prompt enhancer"><PopSwitch rowTestId="vs-set-enhance" label="Enhance when I generate" hint="Adds detail as it runs; your text stays as you wrote it" on={enhOn} onChange={setEnh} /></PopSection>}
        {qOpts.length > 1 && <PopSection label="Quality" aside={qLabel(qOpts.find(o => o.value === p.quality)?.label ?? '')}><Segmented label="Quality" value={p.quality} onChange={p.setQuality} onCommit={closePop}
          options={[...qOpts].sort((a) => a.value === 'quality' ? -1 : 1).map(o => ({ value: o.value, label: qLabel(o.label), hint: o.value === 'fast' ? 'Quicker preview' : 'Best detail', title: o.value === 'fast' ? 'Fewer steps, quicker preview. Your computer only.' : 'Full steps, best detail.', testId: `h3-quality-${o.value}` }))} /></PopSection>}
        {bitrates.length > 1 && <PopSection label="Bitrate" aside={lim?.bitratePriceAffects === false ? 'Same price' : undefined}><Segmented label="Bitrate" value={String(p.fv.bitrate ?? 'standard')} onChange={v => p.setFv('bitrate', v)} onCommit={closePop}
          options={bitrates.map(o => ({ value: o.value, label: o.label, hint: o.value === 'high' ? 'Cleaner motion' : 'Smaller file', title: `${o.value === 'high' ? 'Bigger file, cleaner motion.' : 'Smaller file, fine for previews.'}${lim?.bitratePriceAffects === false ? ' Same price.' : ''}`, testId: `vs-bitrate-${o.value}` }))} /></PopSection>}
      </div></BarPopover>
    </div></div>
  </div>;
}

/** An aspect's outline (shared with Image), the aspect icon for Auto. */
const VsShape = ({ a }: { a: string }) => { const wh = aspectWH(a); return wh ? <AspectShape w={wh[0]} h={wh[1]} /> : <AspectIcon size={16} />; };
const KIND_WHERE: Record<string, string> = { local: LOCAL_LABEL, 'comfy-cloud': 'Comfy Cloud', 'comfy-router': 'Comfy Cloud', fal: 'fal', replicate: 'Replicate' };
/** Route name for the via line: "MiniMax H3 via fal" → "fal", "Local ComfyUI · MiniMax H3" → "Local ComfyUI". */
/** A11 (PARITY-A C-5): the clip length as one slider, like the reference's duration popover: a 36 px track with the value inside and
 *  a 4 px white bar for the thumb. It steps through the lengths this model allows (they can skip, e.g. 5 and 10 s). Arrow keys, Home / End
 *  and dragging all work (a real range input sits over the track); the price follows as it moves; Enter or a click outside closes it. */
/*  Prices (2026-10-25): the rate under the title ('$0.08 per second', 'Free · on your Mac · about 4 min'), the price for the length next
 *  to the value ('5 s · ≈ $0.42'), and faint prices at the first, middle and last length. price(v): token, null (not priced), undefined (loading). */
function DurationSlider({ values, value, onChange, onDone, price, rate }: { values: number[]; value: number; onChange: (n: number) => void; onDone: () => void; price?: (v: number) => string | null | undefined; rate?: string | null }) {
  const n = values.length; const i = Math.max(0, values.indexOf(value)); const pct = n > 1 ? i / (n - 1) : 1;
  const now = price ? price(value) : null; const nowS = typeof now === 'string' ? shortToken(now) : now;
  const ticks = n > 1 && price ? [...new Set([0, Math.round((n - 1) / 2), n - 1])] : [];
  const tickText = (v: number) => { const t = price!(v); return typeof t === 'string' ? shortToken(t).replace(/^≈ /, '') : t; };
  return <div className="vs-dsl" data-testid="vs-duration-slider">
    <div className="vs-dsl-h"><span>Clip length</span><small>{values[0]}–{values[n - 1]} s</small></div>
    {rate && <div className="vs-dsl-rate" data-testid="vs-duration-rate">{rate}</div>}
    <div className="vs-dsl-track" style={{ '--p': pct } as React.CSSProperties}>
      <span className="vs-dsl-fill" aria-hidden /><span className="vs-dsl-thumb" aria-hidden />
      <b className={`vs-dsl-v${pct > (nowS !== null ? 0.5 : 0.7) ? ' flip' : ''}`} data-testid="vs-duration-value" title={typeof now === 'string' ? now : undefined}>{value} s{nowS !== null && <span className="vs-dsl-vp" data-testid="vs-duration-price"> · {nowS === undefined ? <OptPrice text={undefined} /> : nowS}</span>}</b>
      <input type="range" data-apop-item="" data-testid="vs-duration-range" min={0} max={Math.max(0, n - 1)} step={1} value={i} aria-label="Clip length" aria-valuetext={`${value} seconds${typeof now === 'string' ? `, ${now}` : ''}`}
        onChange={e => { const v = values[Number(e.currentTarget.value)]; if (v != null) onChange(v); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onDone(); } }} />
    </div>
    {ticks.length > 0 && ticks.some(k => tickText(values[k]) !== null) && <div className="vs-dsl-ticks" aria-hidden data-testid="vs-duration-ticks">
      {ticks.map(k => { const t = tickText(values[k]); return <span key={k} className={k === 0 ? 'l' : k === n - 1 ? 'r' : 'm'} style={{ '--p': k / (n - 1) } as React.CSSProperties} data-testid={`vs-duration-tick-${values[k]}`}>{values[k]} s{t !== null && <> · {t === undefined ? <OptPrice text={undefined} /> : t}</>}</span>; })}
    </div>}
  </div>;
}

/** Allowed clip lengths for the picked model: providers[].durations (per model), else its video limits, else the tool's list. Whole seconds only. */
function durListOf(cur: any, lim: any, cfg: any, res?: string): number[] {
  /* a per-resolution rule wins (videoCaps durationsByResolution: Veo 3.1 1080p = 8 s only; 2026-10-25) */
  const l: number[] = (res ? lim?.durationsByResolution?.[res] : null) ?? cur?.durations ?? lim?.duration?.values ?? lim?.durations ?? cfg?.durations ?? []; return l.filter(n => Number.isInteger(n));
}
export function routeWhere(q: any, m: any): string {
  const id = String(q?.routeId ?? q?.route ?? ''); const rt = (m?.routes ?? []).find((r: any) => r.routeId === id);
  const dn = String(rt?.displayName ?? rt?.label ?? '').trim();
  /* The server's own place name from the route label ("This computer · free", "Local ComfyUI · free"), not a hard-coded ComfyUI. */
  const lbl = String(rt?.label ?? '').replace(/\s*·\s*(free|0 credits|demo.*)$/i, '').trim();
  if (/^local:/.test(id) || q?.routeKind === 'local') return lbl && !/\bvia\b/i.test(lbl) ? lbl : LOCAL_LABEL;
  const via = dn.match(/\bvia (.+)$/i); if (via) return via[1].trim();
  return dn || KIND_WHERE[String(q?.routeKind ?? id.split(':')[0])] || '';
}
export function viaFromQuote(q: any, m: any): string {
  if (!q || q.priceAvailable === false) return '';
  const where = routeWhere(q, m); const c = typeof q.credits === 'number' ? q.credits : null;
  const price = q.needsKey === true && q.runnable === false ? 'needs a key' /* list price is not a charge */ : q.demo ? 'sample, nothing billed' : q.localRun || (c === 0 && q.routeKind === 'local') ? 'free' : c === 0 ? 'free' : c != null ? runPrice({ own: q.billingMode ? q.billingMode !== 'team' : ownAccountsNow(), credits: c, runOn: placeOfQuote(q) }) ?? '' : '';
  return [where && `Runs on ${where}`, price].filter(Boolean).join(" · ");
}
/** The model card's short subtitle: where it runs plus one word for the price ('Comfy Cloud · demo'); viaFromQuote is the tooltip. */
export function viaShort(q: any, m: any): string {
  if (!q || q.priceAvailable === false) return '';
  const where = routeWhere(q, m).split(' · ')[0].trim(); const c = typeof q.credits === 'number' ? q.credits : null;
  const price = q.needsKey === true && q.runnable === false ? 'needs a key' : q.demo ? 'sample' : q.localRun || c === 0 ? 'free' : '';
  return [where, price].filter(Boolean).join(' · ');
}

/** A dock chip (Create Video's bottom dock): an icon, a label; a plain fact (no onClick) when the model fixes it. */
const DChip = forwardRef<HTMLButtonElement, { glyph?: React.ReactNode; label: string; testId: string; title?: string; open?: boolean; onClick?: () => void }>(function DChip({ glyph, label, testId, title, open, onClick }, ref) {
  if (!onClick) return <span className="vs-dchip static" data-testid={testId} title={title}>{glyph}<span className="vs-dc-l">{label}</span></span>;
  return <button ref={ref} type="button" className={`vs-dchip${open ? ' on' : ''}`} data-testid={testId} title={title} aria-haspopup="listbox" aria-expanded={!!open} onClick={onClick}>{glyph}<span className="vs-dc-l">{label}</span></button>;
});
