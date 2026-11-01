import { SlotPreview, fullText, prepUpload, useSlotReorder } from '../../shared/SlotPreview';
import { MoreFiles, LeftNote, notAddedText, type TrayFile } from '../../shared/FilesTray';
import { swatchesOf, nextSwatchKey, withoutSwatch, tooManySwatches, timesQuote, batchLabel, runBatch, batchToast, newSetId } from '../../../../server/src/shared/swatchBatch';
import { cloneForm } from '../../shared/useToolQuery';
import { AddTile } from '../../shared/AddTile';
import { IMAGE_ACCEPT, fileFits, wrongTypeText } from '../../../../server/src/shared/mediaAccept';
import { GenPrice } from '../../shared/GenPrice';
import { hasFreeLocal } from '../../shared/KeyNeeded';
import { useOwnAccounts, optionPrice, placeOfQuote, fmtUsd } from '../../shared/billing';
import { etaLine, etaRangeOf } from '../../shared/eta';
import { DemoPrice, demoRealCredits } from '../../shared/DemoPrice';
import { fallbackNoteOf, withQuoteDefaults, type Defaults } from '../../shared/defaults';
import { notWiredLabel, shownCredits } from '../../shared/quote';
import { SavedStyles } from '../../shared/SavedStyles';
import { useComfyVersion, olderThan, minComfyOf, minComfyBlock, comfyNote } from '../../shared/comfyVersion';
import { useRequoteTick, quoteGet } from '../../shared/quote';
import { quoteParams } from '../../shared/usePrefill';
import { promptBucket, promptBytesOf, gptImageSize, routerImageSize, flux2Size, HOSTED_BY_ID, priceOf } from '../../shared/price';
import { EnhanceButton, enhanceToastTitle, type EnhanceResult } from './Enhance';
import { MakerTile } from '../../shared/MakerTile';
import './imageCanvas.css';
import ResultView from '../../shared/ResultView';
import { layersOf, layersPosterOf } from '../../shared/LayerStack';
import { ResultMosaic, CountBadge } from '../../shared/MultiResult';
import { presentationOf, resultItemsOf, cardModeOf, badgeText, type ResultItem } from '../../shared/multiResultRules';
import { FailedViewer } from '../../shared/ResultViewer';
import { useGenState, QueueLine } from '../edge/Edge';
import { useRouting } from '../routing/Routes';
import { RunOnChip, runOnText } from '../routing/RunOn';
import { PromptPeek, type PeekForm } from './PromptPeek';
import { BrandChip } from '../../shared/BrandChip';
import { addBrandField } from '../../shared/brandStore';
import { BRAND_OWN_WORDS } from '../../../../server/src/shared/brandKit';
import { rowOverflowRows, foldedRow, FoldedRows, type RowOverflowRow } from '../../shared/RowMore';
import { fitPri } from '../../shared/chipFit';
import { ModelMenu, CHECK as check } from '../../shared/ModelMenu';
import { useToolModels, modelOfEngine, useRunOn, runOnOfRoute, shownName, modelParamFor, engineForModelParam } from '../../shared/models';
import { useEffect, useRef, useState } from 'react';
import type { JobState, ProviderInfo, ToolInfo } from '../../api';
import { useModels } from '../../shared/batch1';
import { gridSrc } from '../../shared/thumbs';
import { EXAMPLES } from '../examples';
/* Create's edit mask uses MaskSheet (below), like Brush Edit */
import GenTile from '../../shared/GenTile';
import { DemoText } from '../../shared/DemoText';
import { USE_PROVIDER_EVT, useMemoryShort } from '../../shared/FitNote';
import { gbOf } from '../../../../server/src/shared/thisComputer';
import { SetupGenerate, setupNeeded, NoPlaceGenerate, DownloadIntentRow, intentSize } from '../../shared/SetupCard';
import { useDownloadIntent } from '../../shared/hardware';
import { missingText } from '../../shared/missing';
import { Popover } from '../../shared/Popover';
import { BarPopover, PopSection, PopNote, Segmented, segCols, AspectShape, PopRow, PopList, PopSwitch, PopAction, groupAspects } from '../../shared/BarPop';
import { countWord, batchNote, priceDelta } from '../../shared/barPopText';
import { usePromptGrow } from '../../shared/usePromptGrow';
import { useDismiss } from '../../shared/useDismiss';
import { nudgeMissing } from '../../shared/genNudge';
import { featureById, type Rig } from '../../shared/imageFeatures';
import { useAtPicker } from './AtPicker';
import { MentionLayer } from '../../shared/MentionChips';
import { refChipTip } from '../../../../server/src/shared/promptTips';
import { carriedAspect, defaultAspectFor, imageChoices, settingsOnSwitch } from '../../shared/composerDraft';
import { tip } from '../../shared/Tooltip';
import { CloseIcon, ImageIcon } from '../Icons';
import { useDockHeight, useChipFit } from '../../shared/dockFit';
import { WorkflowChip } from '../../shared/WorkflowChip';
import { FeedCaption, jobCaption } from '../../shared/FeedCaption';
import { typedPromptOf } from '../../../../server/src/shared/typedPrompt';
import { wantsPicker, usePickerParam, clearPickerParam } from '../../shared/WorkflowPicker';
import { subjectParts, fillSubject, promptAfterPresetClear, lookParts, thumbsShown, modelDownload, intentLine } from '../../shared/presetBar';
import { generateFor } from '../../shared/enterSubmit';
import { loadImagePresets, type WebImagePreset } from '../../shared/imagePresets';
import { presetPrefill, CREATE_PRESET_FIELDS } from '../../../../server/src/shared/presetLink';
import { AspectIcon, QualityIcon, ResolutionIcon, MoreIcon, SparkleIcon, DownloadIcon, ImageStackIcon } from '../Icons';
import { useLayoutEffect } from 'react';
import { listTools } from '../../api';
import { WfIcon, WorkflowPicker, WorkflowInputs, WorkflowControls, WorkflowCredit, useImageWorkflows, useWorkflowQuote, loadDraft, saveDraft, defaultVals, fitWfVals, READY_WORKFLOW_TOOLS, viaOver, type WfDraft, type WfSlotFile, type WfRecipe } from './WorkflowBar';
import { RIG_WORKFLOW } from '../../shared/workflowLinks';
import MaskSheet, { maskFromFile, photoSig, type WfMask } from './MaskSheet';
import { MaskStrip, AnglesPanel, LayoutPanel, anglesOf, anglesSummary, anglesLabel, pickOneLabel, RigStrip, rigCredit, rigOfVals, valsOfRig, photoToolCheck, useHasAlpha } from './WorkflowSurfaces';
import { loadDraftFile, saveDraftFile } from '../../shared/draftFiles';
import { EDIT_MODELS, editTagOf } from '../../shared/imageFeatures';
import { ImagePicker } from './ImagePicker';
import { deliverFiles } from '../../shared/MediaPicker';
import { placeIncoming, workflowAfterNav } from '../../shared/imageIntake';
import { useToast } from '../../shared/Toast';
import { tagHandoff } from '../../shared/handoffFiles';
import { upTag, upName, UP_FALLBACK, scaleWhy, snapScale, type UpInfo, type Size } from './UpscaleBar';
import UpscaleExamples from '../../tools/imageApps/UpscaleExamples';
import { pinQ } from '../routing/Routes';
import FeedToolbar from './feed/FeedToolbar';
import SelectBar, { unselectable } from './feed/SelectBar';
import CompareModels, { CompareGroupHead, CompareView, SwatchCaption } from './feed/CompareModels';
import { emptyTextFor, imageScope, type FeedScope } from './feed/feedFilter';
import { useLiveJobs, UploadsFeed, useUploads } from './feed/FeedScope';
import { ALL_IMAGE_FEED, IMAGE_FEED_GROUPS, imageWorkflowNameOf } from '../../../../server/src/shared/imageFeed';
import { libraryFile } from '../../shared/libraryFiles';
import { feedSections, withSetPlaces } from './feed/feedLayout';
import { beginSet, useSendingSets } from '../../shared/submitGuard';
import FeedCard, { clampAr, tileMaxH } from './feed/FeedCard';
import { useFeedState, useFeedViewer, FeedGallery } from './feed/ResultFeed';
import './createBar.css';
import { PrepChip, CropPop, PreflightPop } from './PhotoPrep';
import { fitPhoto, cropPhoto, photoSize } from '../../shared/photoPrep';
import { tooSmall, type Box } from '../../../../server/src/shared/photoFit';
import { preflightProblems, shapeName, type PreflightProblem, type PreflightFix } from '../../../../server/src/shared/preflight';
import { sameShape, NEG_PROMPT_MAX } from '../../../../server/src/shared/imageCaps';
import { ModelOptionsGroup, optionFields, type OptionValues } from '../../shared/ModelOptions';
import { setupPlacesOf } from '../../shared/models';
import { doSetupPlace } from '../../shared/SetupCard';
import { navigate } from '../../platform/router';
import { ExampleViewer, type ExampleShown } from '../../shared/ExampleViewer';
import SameSeed from '../../shared/SameSeed';
import { runPrice } from '../../shared/billing';
import { loadLook, paidText } from '../../shared/looks';
import { showcaseById, type ShowcaseItem } from '../../../../server/src/shared/showcase';
/** the hero band: eight of our own shipped results (real generations made in this app), not stock clips */
import { examplePrefill } from '../../../../server/src/shared/exampleLink';
import { typedFromFrames } from '../../../../server/src/shared/typedPrompt';
import { wfDefaultOf, startModel, pickKindOf, PICK_LABEL, savedPick, savePick, featureSwitchTo } from '../../shared/workflowDefaults';
import { LOCAL_LABEL } from '../../../../server/src/shared/modelIds';
import { routeCapsOf, maxRefsOf } from '../../shared/refCaps';
import { DockGenerate, PF_SHORT } from '../../shared/DockGenerate';

/** Create Image as a canvas: centred empty hero or results feed, plus a bottom-docked composer (prompt, +, model, aspect, quality, style, count, Generate). */
export interface ImageCanvasProps { /** Images: the feature page this composer serves ('camera-lens' adds the camera rig); undefined = Create Image. */ featureId?: string; /** An old edit URL: Create Image opened in edit mode. */ editIntent?: boolean; sameSeed?: import('react').ReactNode; issues?: any[]; initial?: Record<string, string> | null;
  tool: ToolInfo; prompt: string; setPrompt: (s: string) => void; promptRef: React.RefObject<HTMLTextAreaElement>;
  providers: ProviderInfo[]; provider: string; setProvider: (p: string) => void; /** B27: the mode's cloud-first defaults (quality order, quality pick, fallback note). */ defaults?: Defaults | null;
  resolution: string; setResolution: (r: string) => void; resolutions: string[];
  image: { url: string } | null; onImage: (f: File[]) => void; clearImage: () => void; refs?: { url: string }[]; removeRef?: (i: number) => void; replacePhoto?: (i: number, f: File) => void; movePhoto?: (from: number, to: number) => void; refLimit?: React.MutableRefObject<number | null>; selected?: string; onSelect?: (id: string) => void; imgErr?: string;
  mask: string | null; setMask: (m: string | null) => void; canMask: boolean;
  style: string; setStyle: (s: string) => void; styles: { id: string; label: string; posterUrl?: string }[];
  price: number | null; ready: boolean; missing: string[]; busy: boolean;
  onGenerate: (extra: Record<string, string>) => void | Promise<unknown>;
  jobs: JobState[]; stage: React.ReactNode; enhance: boolean; setEnhance: (b: boolean) => void;
  /** Unified Create Image: a picked workflow submits to its own tool (app-relight, app-face-swap…) with that tool's form. */ onWorkflowGenerate?: (toolId: string, fd: FormData) => Promise<unknown>;
  /** Every model this tool has (Create Image: the text-only ones stay listed, greyed, while a photo is attached). */ allProviders?: ProviderInfo[];
  /** Hand-offs (usePrefill: Reference, Use in Create…) ask here first: true = a workflow is picked and took the image into a slot (or its chooser). */
  intakeRef?: React.MutableRefObject<((fs: File[]) => boolean) | null>;
}
const ASPECTS: [string, string, number, number][] = [['Auto', 'Server default (1:1)', 1, 1], ['1:1', 'Square', 1, 1], ['16:9', 'Widescreen', 16, 9], ['9:16', 'Vertical / stories', 9, 16], ['4:3', 'Classic', 4, 3], ['3:4', 'Portrait', 3, 4], ['3:2', 'Photo', 3, 2], ['2:3', 'Tall photo', 2, 3],
  ['5:4', 'Print', 5, 4], ['4:5', 'Portrait post', 4, 5], ['21:9', 'Cinematic', 21, 9], /* long shapes (Nano Banana 2 / 2.1, 2026-10-24) */ ['4:1', 'Wide banner', 4, 1], ['1:4', 'Tall banner', 1, 4], ['8:1', 'Panorama strip', 8, 1], ['1:8', 'Skyscraper', 1, 8]];
/** w / h of an aspect for its icon (a listed one, else parsed, else square): never undefined, so an unknown shape can't break the chip. */
const shapeOf = (a: string): [number, number] => { const x = ASPECTS.find(y => y[0] === a); if (x) return [x[2], x[3]]; const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(a); return m ? [Number(m[1]), Number(m[2])] : [1, 1]; };
/** One aspect option: [value, description, w, h]. The model's own list in its order; the description is ours for the common shapes, else
 *  "Wide" / "Tall" with the nearest common shape (Runway's 1360:768 → "Wide · about 16:9"). Used by the aspect popover and the Settings fold. */
type AspectOpt = [string, string, number, number];
const ASPECT_DESC: Record<string, string> = Object.fromEntries(ASPECTS.map(x => [x[0], x[1]]));
const NAMED = ASPECTS.filter(x => x[0] !== 'Auto');
const aspectDesc = (a: string, w: number, h: number): string => { if (ASPECT_DESC[a]) return ASPECT_DESC[a]; const r = w / h; if (Math.abs(Math.log(r)) < 0.02) return 'Square';
  const near = NAMED.reduce((b, x) => (Math.abs(Math.log(x[2] / x[3] / r)) < Math.abs(Math.log(b[2] / b[3] / r)) ? x : b), NAMED[0]); const off = Math.abs(Math.log(near[2] / near[3] / r));
  return `${r > 1 ? 'Wide' : 'Tall'}${off < 0.04 ? ` · about ${near[0]}` : ''}`; };
const aspectOpts = (list: string[]): AspectOpt[] => list.map(a => { if (a === 'Auto') return ASPECTS[0]; const [w, h] = shapeOf(a); return [a, aspectDesc(a, w, h), w, h]; });
const aspectGroups = (opts: AspectOpt[]) => groupAspects(opts, o => o[0] === 'Auto', o => o[2] / o[3]);
const QUALS: [string, string, string][] = [['low', 'Low', 'Fastest and cheapest'], ['med', 'Medium', 'Balanced visuals'], ['high', 'High', 'Best visual fidelity']];
const RDESC: Record<string, string> = { '480p': 'Quick drafts', '720p': 'Sharp for screens', '1080p': 'Full HD, slower locally', '0.75K': 'About 0.6 MP', '1K': '1024 px', '1.5K': 'About 2.4 MP', '2K': '2048 px', '4K': '4096 px' };
type Pop = '' | 'model' | 'aspect' | 'quality' | 'res' | 'more' | 'set' | 'count' | 'rig' | 'wf' | 'enh' | 'over';
type RefTab = 'Uploads' | 'Generations' | 'Liked';
/** The aspect icon: long side 14 px. Long shapes (4:1 and beyond: 1:4, 4:1, 1:8, 8:1) get a 1 px outline and a 2 px floor, so they stay a thin
 *  bar in the same 16 px slot instead of growing, and 8:1 (a solid 2 px line) still reads thinner than 4:1. Other shapes keep their 5 px floor. */
const Shape = AspectShape;
const short = (n?: string) => String(n ?? '');
const isActive = (j: JobState) => j.status === 'queued' || j.status === 'running';
const CANCEL_LINGER_MS = 4000;
/** Generate's two-line space: short words for problems past the inputs (the pre-flight list says them in full). */
export { PF_SHORT } from '../../shared/DockGenerate'; /* moved to shared (Video, Audio, 3D and the Canvas import it from there too) */
/** TRANSPARENCY-PLAN 4i: the in-progress tile is the shared premium tile (live preview or shimmer, place + price, stepper, one label, ✕). */
/* not exported: a non-component export here broke React Fast Refresh and caused an endless hot-reload loop with AppTool (2026-10-26) */
/** The feed holds every image feature's results (Create Image is their home): a small tag names the feature when it isn't plain Create Image ("Edit", "Relight", "Face Swap"). */
function featureTag(j: JobState): string { const f = (j as any).feature; const id = String(f?.id ?? ''); if (!id || id === 'create-image' || !featureById(id)) return ''; return id === 'edit-image' ? 'Edit' : String(f.name ?? featureById(id)!.name); }
/** Camera Angles: the quote of one image of n (own accounts show the place's dollars / Comfy credits from quote.cost, which is the whole run). */
const perImageQuote = (q: any, n: number) => q?.cost && typeof q.cost === 'object' && n > 1
  ? { ...q, cost: { ...q.cost, estUsd: Number(q.cost.estUsd) / n, ...(q.cost.estUnits != null ? { estUnits: Math.round(Number(q.cost.estUnits) / n) } : {}) } } : q;
/** A waiting card for place i of a set that is still being sent (no id yet: it can't be opened, picked or canceled). */
const waitingCard = (first: JobState, i: number): JobState => ({ id: '', toolId: first.toolId, status: 'queued', stage: 'uploading', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, warnings: [], parentId: null, compare: { ...(first as any).compare, i } } as JobState);
function RunTile({ j, cap }: { j: JobState; /** Camera Angles: the angle this tile is making */ cap?: string }) { return <GenTile job={j} tag={cap ?? featureTag(j)} testId={j.status === 'canceled' ? `ic-canceled-${j.id}` : `ic-run-${j.id}`} />; }

export { urlToFile } from '../../shared/urlFile'; /* moved to shared (the Canvas bar sends board images with it too) */
import { urlToFile } from '../../shared/urlFile';
import { useProfile, saveMePhoto } from '../../shared/profile';
import { SwitchNote, useSwitchNote } from '../../shared/SwitchNote';
/** A drag from the feed (or another tab of the app) carries the image's URL, not a file. */
const dropUrl = (dt: DataTransfer): string | null => { const u = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split('\n').map(x => x.trim()).find(x => x && !x.startsWith('#')); if (!u) return null;
  try { const x = new URL(u, location.origin); return x.origin === location.origin && /^\/(files|samples|examples|api\/media\/thumb)/.test(x.pathname) ? x.pathname + x.search : null; } catch { return null; } };
const draggable = (dt: DataTransfer) => dt.types.includes('Files') || dt.types.includes('text/uri-list');
/** The model chip's download ring: real progress (an arc) or an indeterminate spinner; the label is the chip's tooltip and its spoken text. */
function DlRing({ pct, label }: { pct: number | null; label: string }) {
  return <span className={`ic-dl${pct == null ? ' ind' : ''}`} data-testid="ic-model-dl" data-pct={pct ?? undefined} role="img" aria-label={label}>
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle className="ic-dl-t" cx="8" cy="8" r="6" /><circle className="ic-dl-a" cx="8" cy="8" r="6" pathLength={100} strokeDasharray={`${pct == null ? 28 : Math.max(4, pct)} 100`} transform="rotate(-90 8 8)" /></svg></span>;
}
export default function ImageCanvas(p: ImageCanvasProps) {
  /* The prompt box grows with the prompt (up to its CSS max-height: 20dvh), then scrolls, so the whole prompt is visible. */
  /* ---- Unified Create Image (step 2): the picked workflow (?workflow=relight), its draft per workflow id, its runner tool and quote ---- */
  const wfList = useImageWorkflows(); const [wfId, setWfIdRaw] = useState(() => new URLSearchParams(location.search).get('workflow') ?? '');
  const wfPicked = wfList.find(r => r.id === wfId && r.status === 'ready') ?? null; const wfChipRef = useRef<HTMLButtonElement>(null);
  /* a bump moves focus to the next step (see the focusTick effect below) */ const [focusTick, setFocusTick] = useState(0); const subjRef = useRef<HTMLInputElement>(null);
  /* Camera & Lens (surface 'rig', 2026-10-23) is plain Create (prompt, photos, aspect, model) plus the Camera group: it never takes the slot path below */
  const rigWf = wfPicked?.surface === 'rig' ? wfPicked : null; const recipe = rigWf ? null : wfPicked;
  /** Workflows the bar can Recreate into: every ready tool's workflow, plus Camera & Lens (a Create Image job with a camera rig). */
  const RECREATABLE = [...Object.values(READY_WORKFLOW_TOOLS), RIG_WORKFLOW];
  const [wfFiles, setWfFiles] = useState<Record<string, Record<string, WfSlotFile | null>>>({}); const [wfDrafts, setWfDrafts] = useState<Record<string, WfDraft>>({});
  const [runTools, setRunTools] = useState<ToolInfo[] | null>(null); const [wfBusy, setWfBusy] = useState(false); const [wfErr, setWfErr] = useState('');
  useEffect(() => { if (wfId && !runTools) listTools().then(setRunTools).catch(() => undefined); }, [wfId, !!runTools]);
  const runTool = recipe ? runTools?.find(t => t.id === recipe.runner.toolId) ?? null : null;
  const files = recipe ? wfFiles[recipe.id] ?? {} : {};
  /* a filled slot can switch the mode (Character Sheet, Product Shot: a photo → edit), and with it the models */
  const wfMode = recipe ? Object.entries(recipe.modes.whenSlot ?? {}).find(([k]) => files[k])?.[1] ?? recipe.modes.default : ''; const wfModels: string[] = recipe?.models[wfMode] ?? [];
  const wfProviders: ProviderInfo[] = runTool ? wfModels.map(id => runTool.providers.find(x => x.id === id)).filter(Boolean) as ProviderInfo[] : [];
  const draft: WfDraft | null = recipe ? wfDrafts[recipe.id] ?? loadDraft(recipe.id) ?? { prompt: '', provider: '', vals: defaultVals(recipe) } : null;
  const setDraft = (f: (d: WfDraft) => WfDraft) => { if (!recipe) return; const r = recipe; setWfDrafts(m => { const nd = f(m[r.id] ?? loadDraft(r.id) ?? { prompt: '', provider: '', vals: defaultVals(r) }); saveDraft(r.id, nd); return { ...m, [r.id]: nd }; }); };
  /* 2026-10-25 (the doubled Character Sheet prompt): opening a workflow never leaves its composed recipe text in the subject box. A draft saved
   * with it (an example's full prompt, before the fix) goes back to your own words, once per open (typing is never rewritten). */
  useEffect(() => { if (!recipe || !draft || !recipe.prompt.frames?.length) return; const w = typedFromFrames(draft.prompt, recipe.prompt.frames); if (w !== draft.prompt) setDraft(d => ({ ...d, prompt: w })); }, [recipe?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* per-workflow defaults (shared/workflowDefaults.ts): the saved pick > the workflow's default for this setup when it runs > the first that runs */
  const wfDef = recipe ? wfDefaultOf(runTool, recipe.id) : null;
  /* ?workflow=<id>&model=<key> (the Workflows page's "Open in Image", 2026-10-28): that workflow opens on the model its card names, once, as a
   * link's pick (not "Your pick"). Read at mount: syncUrl drops ?model= from a workflow's address. A model the workflow doesn't offer is ignored. */
  const linkModel = useRef<{ wf: string; key: string } | null>((() => { const q = new URLSearchParams(location.search); const w = q.get('workflow'); const k = q.get('model'); return w && k && w !== RIG_WORKFLOW ? { wf: w, key: k } : null; })());
  useEffect(() => { const lm = linkModel.current; if (!lm || !recipe || !runTool) return; linkModel.current = null; if (recipe.id !== lm.wf) return;
    const eng = engineForModelParam(runTool, lm.key); if (eng && wfModels.includes(eng)) setDraft(d => ({ ...d, provider: eng, pickedBy: undefined })); }, [recipe?.id, !!runTool]); // eslint-disable-line react-hooks/exhaustive-deps
  const wfProvider = recipe ? startModel(draft?.provider, wfModels, wfDef, (runTool as any)?.defaultsByMode?.[wfMode]?.defaultProvider ?? runTool?.defaultProvider) : '';
  const wfKind = recipe ? pickKindOf(wfProvider, wfDef, draft?.pickedBy === 'user' && draft.provider === wfProvider) : null;
  const wfIntent = useDownloadIntent(wfProvider || null);
  const toast = useToast(); const [photoPreview, setPhotoPreview] = useState<number | null>(null); const photoAnchor = useRef<HTMLElement | null>(null); const replaceIndex = useRef<number | null>(null); const [flash, setFlash] = useState<{ wf: string; slot: string; k: number } | null>(null);
  /* the tool's models that can't run this workflow as locked (server: same check as the quote): greyed at the bottom of the menu with the reason */
  const wfOff = recipe && runTool ? (recipe.unavailable?.[wfMode] ?? []).map(o => ({ ...o, p: runTool.providers.find(x => x.id === o.id) })).filter(o => !!o.p) as { id: string; reason: string; p: ProviderInfo }[] : [];
  const wfOffLabel = recipe ? `Can’t run ${recipe.name}${wfMode !== recipe.modes.default ? ' with a photo · remove it to use these' : ''}` : '';
  /* a draft, link or preset that picked one of those: the bar runs the first compatible model instead (the draft keeps the pick, so it comes back when it fits again) and says why, once */
  const offSaid = useRef('');
  useEffect(() => { if (!recipe || !draft?.provider || !wfProvider || draft.provider === wfProvider) return; const o = wfOff.find(x => x.id === draft.provider); if (!o) return;
    const k = `${recipe.id}|${wfMode}|${o.id}`; if (offSaid.current === k) return; offSaid.current = k;
    const nm = (id: string) => recipe.modelInfo?.[id]?.name ?? runTool?.providers.find(x => x.id === id)?.name ?? id;
    toast(`Switched to ${nm(wfProvider)}`, 'info', { sub: `${nm(o.id)} can’t run ${recipe.name}: ${o.reason}.` }); }, [recipe?.id, wfMode, draft?.provider, wfProvider, wfOff.length]); // eslint-disable-line react-hooks/exhaustive-deps
  /* "Use as …": an image arrived (Reference, a drop on the bar, a paste) and more than one slot could take it; the bar asks, inside the strip */
  const [choose, setChoose] = useState<{ file: File; url: string; slots: string[] } | null>(null);
  const slotLabel = (r: WfRecipe, slot: string) => { const [b, k] = slot.split('#'); const l = r.slots.find(s => s.name === b)?.label ?? 'Photo'; return k ? `${l} ${k}` : l; };
  /** Material Swap's swatches (shared/swatchBatch.ts): a several-file slot keeps its files as material, material#2 … material#6 */
  const manyOf = (r: WfRecipe | null, slot: string) => { const s = r?.slots.find(x => x.name === slot.split('#')[0]); return s?.many ? s : null; };
  /** Put a photo in a slot (null clears it). `say`: a brief toast ("Added as Face") for images that came from somewhere else. */
  const setSlot = (slot: string, f: File | null, say?: boolean) => { if (!recipe) return; const r = recipe; setWfErr(''); setChoose(null);
    if (f && !fileFits('image', f)) { toast(wrongTypeText(f.name, ['image']), 'warn'); return; }
    const ms = manyOf(r, slot); if (!f && ms) { setWfFiles(m => ({ ...m, [r.id]: withoutSwatch(m[r.id] ?? {}, ms.name, slot, ms.many) })); setFlash(x => x?.wf === r.id && x.slot === slot ? null : x); return; } /* the swatches after it move up */
    const had = !!(wfFiles[r.id] ?? {})[slot]; setWfFiles(m => ({ ...m, [r.id]: { ...(m[r.id] ?? {}), [slot]: f ? { file: f, url: URL.createObjectURL(f) } : null } }));
    setPreps(m => { const k = `${r.id}|${slot}`; if (!(k in m)) return m; const n = { ...m }; delete n[k]; return n; }); /* a new photo: its own shape again */
    if (!f) setFlash(x => x?.wf === r.id && x.slot === slot ? null : x); if (f) { setFlash({ wf: r.id, slot, k: Date.now() }); if (say) toast(`${had ? 'Replaced' : 'Added as'} ${slotLabel(r, slot)}`); } };
  /** One more swatch: the next empty place, or the "up to 6" note when they're all taken (nothing is replaced). */
  const addSwatch = (slot: string, f: File, say?: boolean) => { if (!recipe) return; const ms = manyOf(recipe, slot); if (!ms) { setSlot(slot, f, say); return; }
    const k = nextSwatchKey(wfFilesRef.current[recipe.id] ?? {}, ms.name, ms.many); if (!k) { toast(tooManySwatches(ms.many! + 1), 'warn'); return; }
    wfFilesRef.current = { ...wfFilesRef.current, [recipe.id]: { ...(wfFilesRef.current[recipe.id] ?? {}), [k]: { file: f, url: '' } } }; /* several in one go: each finds the next place */ setSlot(k, f, say); };
  const wfSlots = recipe ? [...recipe.slots].sort((a, b) => a.order - b.order) : [];
  const nSw = (() => { const ms = wfSlots.find(s => s.many); return ms ? swatchesOf(files, ms.name, ms.many).length : 0; })(); /* Material Swap: swatches = runs */
  /* the first photo's pixel size (Upscale: the factor rules, the quote and the readout use it) */
  const [wfSize, setWfSize] = useState<{ url: string; s: Size } | null>(null); const s0url = wfSlots[0] ? files[wfSlots[0].name]?.url ?? null : null;
  useEffect(() => { if (!s0url) return; let live = true; const i = new Image(); i.onload = () => { if (live) setWfSize({ url: s0url, s: { width: i.naturalWidth, height: i.naturalHeight } }); }; i.src = s0url; return () => { live = false; }; }, [s0url]);
  const wfSrc: Size | null = s0url && wfSize?.url === s0url ? wfSize.s : null;
  /* ---- Input prep (2026-10-23): a model that keeps the photo's shape, on a workflow that needs another (Character Sheet 4:3): fit or crop the photo first.
   * The prepared photo is what the slot holds (quote, upload, mask all use it); the photo as picked stays in `preps` (Undo, and it goes along as imageOriginal). */
  type PrepRec = { kind: 'fit' | 'crop'; aspect: string; box?: Box; orig: WfSlotFile };
  const [preps, setPreps] = useState<Record<string, PrepRec>>({}); const [prepBusy, setPrepBusy] = useState(false); const [cropOpen, setCropOpen] = useState(false); const prepChipRef = useRef<HTMLSpanElement>(null);
  const imgSlot = wfSlots.find(s => s.sendsAs === 'image') ?? null; const imgFile = imgSlot ? files[imgSlot.name] ?? null : null;
  const [imgDim, setImgDim] = useState<{ url: string; s: Size } | null>(null);
  useEffect(() => { if (!imgFile) return; let live = true; photoSize(imgFile.file).then(s => { if (live) setImgDim({ url: imgFile.url, s }); }).catch(() => undefined); return () => { live = false; }; }, [imgFile?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  const imgSize: Size | null = imgFile && imgDim?.url === imgFile.url ? imgDim.s : null;
  const prepKey = recipe && imgSlot ? `${recipe.id}|${imgSlot.name}` : ''; const prepNow = prepKey ? preps[prepKey] ?? null : null;
  const origSize = useRef<Record<string, Size>>({}); /* the picked photo's size (the crop box works on it) */
  const wfFit: string | null = recipe ? recipe.prep?.[wfMode]?.[wfProvider]?.fit ?? null : null;
  const shapeOff = !!wfFit && !!imgSize && !sameShape(`${imgSize.width}:${imgSize.height}`, wfFit);
  const applyPrep = async (kind: 'fit' | 'crop', box?: Box) => { if (!recipe || !imgSlot || !wfFit || prepBusy) return; const r = recipe, slot = imgSlot.name, aspect = wfFit;
    const orig = prepNow?.orig ?? files[slot]; if (!orig) return; setPrepBusy(true);
    try { const f = kind === 'fit' ? await fitPhoto(orig.file, aspect) : await cropPhoto(orig.file, aspect, box!); const sz = await photoSize(f);
      if (tooSmall(sz.width, sz.height)) { toast(`That ${kind === 'fit' ? 'photo' : 'crop'} is too small: it needs 128 px on the short side`, 'warn'); return; }
      const url = URL.createObjectURL(f); setImgDim({ url, s: sz }); setWfFiles(m => ({ ...m, [r.id]: { ...(m[r.id] ?? {}), [slot]: { file: f, url } } }));
      setPreps(m => ({ ...m, [`${r.id}|${slot}`]: { kind, aspect, box, orig } }));
    } catch { toast('Couldn’t prepare that photo. Try another one.', 'error'); } finally { setPrepBusy(false); } };
  const undoPrep = () => { if (!recipe || !imgSlot || !prepNow) return; const r = recipe, slot = imgSlot.name, o = prepNow.orig;
    setWfFiles(m => ({ ...m, [r.id]: { ...(m[r.id] ?? {}), [slot]: o } })); setPreps(m => { const n = { ...m }; delete n[`${r.id}|${slot}`]; return n; }); };
  const openCrop = () => { const o = prepNow?.orig ?? imgFile; if (!o) return; if (!origSize.current[o.url]) photoSize(o.file).then(s => { origSize.current[o.url] = s; setCropOpen(true); }).catch(() => toast('Couldn’t open that photo. Try another one.', 'error')); else setCropOpen(true); };
  const cropOrig = prepNow?.orig ?? imgFile;
  /* Upscale: the server's factor table (tool.app.imageUpscale), the picked factor, and why it can't run (8192 px cap, the model's factors) */
  const upInfo: UpInfo | null = recipe?.id === 'upscale' ? ((runTool as any)?.app?.imageUpscale ?? UP_FALLBACK) : null;
  const upScale = Number(draft?.vals.scale ?? recipe?.controls.find(c => c.field === 'scale')?.default ?? 4) || 4;
  const upWhy = upInfo ? scaleWhy(upInfo, wfProviders, wfProvider, upScale, wfSrc) : null;
  useEffect(() => { if (!upInfo || !wfProvider || !wfProviders.length) return; const k = snapScale(upInfo, wfProviders, wfProvider, upScale, wfSrc); if (k !== upScale) setDraft(d => ({ ...d, vals: { ...d.vals, scale: String(k) } })); }, [!!upInfo, wfProvider, wfProviders.length, wfSrc?.width, wfSrc?.height]); // eslint-disable-line react-hooks/exhaustive-deps
  const [upEx, setUpEx] = useState(false);
  const wfSlotMissing = wfSlots.find(s => s.required && !files[s.name]) ?? null;
  /* ---- Brush Edit (surface 'mask'): the painted mask for the photo in its slot; a new photo clears it (said once); kept in this browser for a refresh ---- */
  const isMask = recipe?.surface === 'mask'; const [wfMask, setWfMask] = useState<WfMask | null>(null); const [maskOpen, setMaskOpen] = useState(false);
  /* Erase Object (2026-10-23) uses the same sheet: the mask belongs to the mask workflow that is picked (a photo carried between the two keeps it) */
  const mId = isMask && recipe ? recipe.id : 'brush-edit'; const bImg = (wfFiles[mId] ?? {}).image ?? null; const maskReady = useRef(false); const wfFilesRef = useRef(wfFiles); wfFilesRef.current = wfFiles;
  useEffect(() => { if (!wfMask) return; if (!bImg || photoSig(bImg.file) !== wfMask.forPhoto) { if (bImg) toast('Mask cleared: paint the area on the new photo', 'warn'); setWfMask(null); setMaskOpen(false); } }, [bImg?.url, wfMask?.forPhoto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!isMask || maskReady.current) return; if (wfRecreate.current?.id === mId) { maskReady.current = true; return; } /* a Recreate brings its own photo and mask */ let live = true; (async () => {
    /* the saved Brush Edit photo wins over Create's photo carried in on load (that one only fills an empty slot); a photo you put there yourself stays */
    const fromCreate = (u?: string) => !!u && carried.current.has(`${mId}|${u}`); const now = () => wfFilesRef.current[mId]?.image ?? null;
    let photo = bImg && !fromCreate(bImg.url) ? bImg.file : null; let restored = false;
    if (!photo) { const f = await loadDraftFile(`wf:${mId}:image`); const cur = now();
      if (f && live && fileFits('image', f) && (!cur || fromCreate(cur.url))) { photo = f; restored = true; const url = URL.createObjectURL(f);
        setWfFiles(m => { const c = m[mId]?.image; return c && !fromCreate(c.url) ? m : { ...m, [mId]: { ...(m[mId] ?? {}), image: { file: f, url } } }; }); }
      else photo = cur?.file ?? null; }
    const mf = await loadDraftFile(`wf:${mId}:mask`); let forP = ''; try { forP = localStorage.getItem('ohf:wf-mask-for') ?? ''; } catch { /* private window */ }
    if (live && mf && photo && forP === photoSig(photo)) { const m = await maskFromFile(photo, mf); if (live && m) setWfMask(m); }
    else if (live && mf && restored) toast('Your saved mask was cleared: paint the area again', 'warn');
    if (live) maskReady.current = true; })(); return () => { live = false; }; }, [isMask]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!maskReady.current) return; void saveDraftFile(`wf:${mId}:image`, bImg?.file ?? null); void saveDraftFile(`wf:${mId}:mask`, wfMask?.file ?? null);
    try { if (wfMask) localStorage.setItem('ohf:wf-mask-for', wfMask.forPhoto); else localStorage.removeItem('ohf:wf-mask-for'); } catch { /* private window */ } }, [bImg?.url, wfMask?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  /* ---- Camera Angles (surface 'multi-output'): the picked angles (blank = all nine, as the server reads it) ---- */
  const isMulti = recipe?.surface === 'multi-output'; const angleIds = isMulti && recipe ? anglesOf(recipe, draft?.vals.shots) : [];
  /* the picker's group (Camera Angles 'angles', Ad Pack 'styles') and what Generate waits for when nothing is picked */
  const multiG = recipe?.groups.find(g => g.summary.includes('shots'))?.id ?? 'angles'; const pickOne = isMulti && recipe ? pickOneLabel(recipe) : '';
  const [openGroup, setOpenGroup] = useState<{ g: string; k: number } | null>(null);
  /* what Generate waits for: a required photo, else a prompt the recipe needs without its photo (Character Sheet), else a factor that can run */
  const rw = recipe?.prompt.requiredWithout; const wfPromptMissing = !wfSlotMissing && rw && !files[rw.slot] && !(draft?.prompt ?? '').trim() ? rw.missing : null;
  /* Brush Edit / Camera Angles run as edits: the server wants 128 px on the short side (400 low_res), so the bar says it before a run */
  const wfTooSmall = (isMask || isMulti) && !wfSlotMissing && !!wfSrc && Math.min(wfSrc.width, wfSrc.height) < 128;
  const wfMaskMissing = isMask && !wfSlotMissing && !wfTooSmall && !wfMask; const wfPromptReq = !wfSlotMissing && !wfTooSmall && !wfMaskMissing && recipe?.prompt.mode === 'required' && !(draft?.prompt ?? '').trim();
  /* photo tools (Remove Background, Expand, Erase Object, Virtual Try-On): a photo past 8192 px, Expand's shape, Erase's whole-photo mask (shared/imagePhotoTools.ts) */
  const ptCheck = recipe && !wfSlotMissing ? photoToolCheck(recipe, wfSrc, draft?.vals ?? {}, wfMask) : null; const ptAlpha = useHasAlpha(files.image?.url, recipe?.id === 'remove-bg');
  const wfMissing: { missing: string; slot?: string; mask?: boolean; group?: string; prompt?: boolean; fit?: boolean } | null = wfSlotMissing ? { missing: wfSlotMissing.missing, slot: wfSlotMissing.name }
    : ptCheck ? { missing: ptCheck.missing, slot: ptCheck.slot, mask: ptCheck.mask, group: ptCheck.group } : wfTooSmall ? { missing: 'Photo too small (128 px min)', slot: wfSlots[0]?.name } : shapeOff ? { missing: `Fit photo to ${wfFit}`, fit: true } : wfMaskMissing ? { missing: recipe?.id === 'erase' ? 'Paint what to erase' : 'Paint the area first', mask: true } : wfPromptReq ? { missing: isMask ? 'Describe the change' : 'Write a prompt', prompt: true }
    : isMulti && !angleIds.length ? { missing: pickOne, group: multiG } : wfPromptMissing ? { missing: wfPromptMissing } : upWhy ? { missing: `×${upScale} can’t run` } : null;
  /* priced as the job you'll send: required photos counted as there, optional ones when added (quote = charge) */
  const wfSent = wfSlots.filter(s => s.required || files[s.name]);
  const wfVals: Record<string, string> = recipe && draft ? fitWfVals(recipe, wfProvider, wfMode, draft.vals) : {}; /* a shape the model doesn't offer → its own default (QA #1) */
  const wfCtl: Record<string, string> = recipe && draft ? Object.fromEntries(recipe.controls.map(c => [c.field, wfVals[c.field] ?? (c.optional ? '' : String(c.default ?? ''))]).filter(([, v]) => v !== '')) : {};
  const wfQCtl = recipe ? Object.fromEntries(Object.entries(wfCtl).filter(([k]) => recipe.controls.find(c => c.field === k)?.kind !== 'text')) : wfCtl; // typed words (Material Swap, Ad Pack) never change the price: no re-quote per keystroke
  const wfQ: Record<string, string> = { ...(upInfo ? { scale: String(upScale), ...(wfSrc ? { width: String(wfSrc.width), height: String(wfSrc.height) } : {}) } : { types: wfMode, ...wfQCtl }), ...Object.fromEntries(wfSent.map(s => [s.sendsAs, '1'])), ...(wfSent.some(s => s.sendsAs === 'image') ? { image: '1' } : {}), ...(wfSent.length > 1 ? { refs: String(wfSent.length) } : {}), ...(isMask ? { mask: '1' } : {}), ...(isMulti ? { shots: JSON.stringify(angleIds) } : {}),
    ...(!upInfo && imgSize && imgSlot && wfSent.includes(imgSlot) ? { photoWidth: String(imgSize.width), photoHeight: String(imgSize.height) } : {}) /* the photo's real shape: a fitted photo quotes on a model that keeps its shape */ };
  const wq = useWorkflowQuote(recipe && runTool ? recipe.runner.toolId : null, wfProvider, wfQ);
  /* ---- Pre-flight (2026-10-23): every reason this run can't start, inputs → model → setup → money (shared/preflight.ts; GET /api/tools/:id/preflight
   * returns the same list). Generate shows the first missing step; a click opens the list with one fix each. */
  const [pfOpen, setPfOpen] = useState(false); const genRef = useRef<HTMLButtonElement>(null);
  const wfPf: PreflightProblem[] = (() => { if (!recipe || !draft) return []; const pr = (draft.prompt ?? '').trim();
    const promptNeed = recipe.prompt.mode === 'required' && !pr && !wfSlotMissing ? (isMask ? 'Describe the change' : 'Write a prompt') : wfPromptMissing;
    const list = preflightProblems({ freeLocal: hasFreeLocal(runTool?.id), slots: wfSlots.map(s => ({ name: s.name, label: s.label, required: s.required, filled: !!files[s.name], missing: s.missing,
        ...(s === imgSlot && imgSize ? { width: imgSize.width, height: imgSize.height, fitTo: wfFit } : {}) })),
      minSide: isMask || isMulti ? 128 : null, mask: isMask && files.image ? { needed: true, painted: !!wfMask } : null, prompt: promptNeed ? { missing: promptNeed } : null,
      pick: isMulti && !angleIds.length ? { group: multiG, missing: pickOne } : null,
      quote: wq ? (wfIntent && wq.setup?.action === 'download' ? { ...wq, runnable: true, setup: null, setupOptions: null } : wq) : null, /* a download you already said yes to runs */
      modelName: recipe.modelInfo?.[wfProvider]?.name ?? null });
    /* a workflow's own input rule (photo tools: a photo past 8192 px, Expand's shape, a whole-photo mask) and any step the bar waits for that the list
     * doesn't name yet: one inputs problem with the same fix Generate used to take */
    const inN = list.filter(x => x.stage === 'inputs').length; const wm = ptCheck ?? (wfMissing && !inN && !wfMissing.fit ? wfMissing : null);
    if (wm) list.splice(inN, 0, { code: 'input_problem', stage: 'inputs', message: ('why' in wm && wm.why ? String(wm.why) : wm.missing).replace(/\.$/, ''),
      fix: wm.slot ? { kind: 'choose-photo', label: 'Choose…', args: { slot: wm.slot } } : wm.mask ? { kind: 'paint-mask', label: 'Paint mask' } : wm.group ? { kind: 'open-group', label: 'Change', args: { group: wm.group } } : { kind: 'focus-prompt', label: 'Write it' } });
    if (upWhy && !list.some(x => x.code === 'model_cant_run')) list.splice(list.findIndex(x => x.stage !== 'inputs') < 0 ? list.length : list.findIndex(x => x.stage !== 'inputs'), 0, { code: 'model_cant_run', stage: 'model', message: `×${upScale} can’t run: ${String(upWhy).replace(/\.$/, '')}`, fix: { kind: 'pick-model', label: 'Pick model…' } });
    return list; })();
  useEffect(() => { if (pfOpen && !(recipe ? wfPf : createPfRef.current).length) { setPfOpen(false); requestAnimationFrame(() => genRef.current?.focus()); } }); // eslint-disable-line react-hooks/exhaustive-deps
  const createPfRef = useRef<PreflightProblem[]>([]);
  /** One fix from the pre-flight list. Fixes that open another surface (picker, crop box, mask, model menu, a page) close the list. */
  const runFix = async (f: PreflightFix) => { const a = f.args ?? {}; const tid = recipe?.runner.toolId ?? p.tool.id; const eng = recipe ? wfProvider : cur?.id;
    const q = recipe ? wq : qj; const m = modelOfEngine(tid, eng);
    const place = () => { const ps = setupPlacesOf(m, q); return ps.find(x => x.runOn === a.runOn) ?? ps[0]; };
    switch (f.kind) {
      case 'choose-photo': setPfOpen(false); if (recipe && a.slot) openSlotPicker(String(a.slot)); else { setPop(''); setRefTab('Uploads'); } return;
      case 'fit-photo': await applyPrep('fit'); return;
      case 'crop-photo': setPfOpen(false); openCrop(); return;
      case 'use-first': { const k = Number(a.n) || 0; for (let i = (p.refs?.length ?? 0) - 1; i >= Math.max(0, k - 1); i--) p.removeRef?.(i); return; }
      case 'pick-model': setPfOpen(false); setPop('model'); return;
      case 'paint-mask': setPfOpen(false); if (recipe) setMaskOpen(true); else void openCreateMask(); return;
      case 'focus-prompt': setPfOpen(false); requestAnimationFrame(() => (subjRef.current ?? p.promptRef.current)?.focus()); return;
      case 'open-group': setPfOpen(false); setOpenGroup({ g: String(a.group), k: Date.now() }); return;
      case 'add-key': case 'download': case 'turn-on': case 'install-node': case 'set-up': { const pl = place(); if (!pl) return; try { await doSetupPlace(tid, m, eng, pl); } catch (er) { toast((er as Error).message || 'That didn’t work. Try again.', 'error'); } if (f.kind !== 'download') setPfOpen(false); return; }
    } };
  /* Camera Angles: what one image costs (the quote's perShotCredits; quote = charge = angles × this) */
  const wqCr: number | null = wq ? shownCredits(wq) : null; const perShot: number | null = typeof wq?.perShotCredits === 'number' ? wq.perShotCredits : wqCr != null && angleIds.length ? wqCr / angleIds.length : null;
  const angleEach = isMulti && angleIds.length && wq && perShot != null && perShot > 0 && !(wq.needsKey === true && wq.runnable === false) ? <span className="wf-each-p"><GenPrice q={perImageQuote(wq, angleIds.length)} credits={perShot} /> each</span> : null;
  useToolModels(recipe?.runner.toolId ?? p.tool.id);
  const firstSlot = (r: WfRecipe | null | undefined) => r ? [...r.slots].sort((a, b) => a.order - b.order)[0] ?? null : null;
  const wfIdRef = useRef(wfId); wfIdRef.current = wfId; const carried = useRef(new Set<string>());
  /* ?model= names Create's own model: a picked workflow runs its own, so the param goes while one is picked and comes back with Create (QA #18) */
  const syncUrl = (id: string) => { const u = new URL(location.href); if (id) { u.searchParams.set('workflow', id); if (id !== RIG_WORKFLOW) u.searchParams.delete('model'); } else { u.searchParams.delete('workflow'); if (p.provider) u.searchParams.set('model', modelParamFor(p.tool.id, p.provider)); } if (u.href !== location.href) history.replaceState(history.state, '', u.pathname + u.search + u.hash); };
  /** Switch workflow. Nothing is dropped: Create's photo (else the last workflow's first photo) fills the new workflow's first slot when it is empty;
   *  back in Create, the workflow's first photo becomes Create's photo when Create has none. Each workflow keeps its own photos for the visit. */
  const setWf = (id: string, o: { carryBack?: boolean; /** a preset is being opened: no "preset removed" toast */ silent?: boolean; /** a picked workflow: focus its first empty required slot */ focus?: boolean } = {}) => { const prev = recipe;
    /* a preset belongs to one workflow: switching away clears it (and its untouched text), with Undo */
    if (!o.silent && presetOn && presetOn.p.workflow !== (id || 'create-image')) leavePreset(id);
    if (o.focus) setFocusTick(t => t + 1);
    wfIdRef.current = id; setWfIdRaw(id); setChoose(null); setPickFor(null); syncUrl(id);
    const r = wfList.find(x => x.id === id); const s0 = firstSlot(r); const p0 = firstSlot(prev); const prevFile = prev && p0 && prev.id !== id ? (wfFiles[prev.id] ?? {})[p0.name] ?? null : null;
    const mine: File | undefined = (p.image as any)?.file; const carry: WfSlotFile | null = p.image && mine ? { file: mine, url: p.image.url } : prevFile;
    if (r && s0 && carry && !(wfFiles[r.id] ?? {})[s0.name]) { carried.current.add(`${r.id}|${carry.url}`); setWfFiles(m => ({ ...m, [r.id]: { ...(m[r.id] ?? {}), [s0.name]: carry } })); }
    if (!id && prevFile && !p.image && o.carryBack !== false) p.onImage([prevFile.file]); };
  /* Create's photo can also arrive after the workflow is picked (the page opened with ?workflow=…, the saved draft photo comes back): same rule, once per photo */
  useEffect(() => { if (!recipe || !p.image) return; const f: File | undefined = (p.image as any).file; const s0 = firstSlot(recipe); const key = `${recipe.id}|${p.image.url}`;
    if (!f || !s0 || carried.current.has(key) || (wfFiles[recipe.id] ?? {})[s0.name]) return; carried.current.add(key); const url = p.image.url; setWfFiles(m => ({ ...m, [recipe.id]: { ...(m[recipe.id] ?? {}), [s0.name]: { file: f, url } } })); }, [recipe?.id, p.image?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  /** An image with no named slot (Reference from the viewer, a hand-off, a drop on the bar, a paste): the only empty slot, else ask. */
  const takeIncoming = (fs: File[]) => { const r = recipe; const f = fs.find(x => /^image\//.test(x.type)); if (!r || !f) return; const cur = wfFiles[r.id] ?? {};
    const pl = placeIncoming(r.slots, n => { const ms = manyOf(r, n); return ms ? !nextSwatchKey(cur, n, ms.many) : !!cur[n]; }); if (pl.kind === 'slot') (pl.replaced ? setSlot : addSwatch)(pl.slot, f, true); else if (pl.kind === 'ask') setChoose({ file: f, url: URL.createObjectURL(f), slots: pl.slots }); };
  /* Images that arrive while the picked workflow's recipe is still loading wait here (the ordering bug: they used to land in Create's hidden photo) */
  const pending = useRef<File[]>([]);
  const wfActive = () => !!wfIdRef.current && wfIdRef.current !== RIG_WORKFLOW && (!wfList.length || wfList.some(x => x.id === wfIdRef.current && x.status === 'ready' && x.surface !== 'rig'));
  const intake = (fs: File[]): boolean => { if (!wfActive()) return false; if (!recipe || recipe.id !== wfIdRef.current) { pending.current.push(...fs); return true; } takeIncoming(fs); return true; };
  if (p.intakeRef) p.intakeRef.current = intake;
  useEffect(() => () => { if (p.intakeRef) p.intakeRef.current = null; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pending.current.length) return; const fs = pending.current; if (recipe && recipe.id === wfIdRef.current) { pending.current = []; takeIncoming(fs); } else if (wfList.length && !wfActive()) { pending.current = []; p.onImage(fs); } }, [recipe?.id, wfList.length]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Recreate on a Relight / Face Swap result: /image?workflow=relight&recreate=<job>. Runs before the page's own prefill (child layout effect),
   * so Create's own prompt and photo stay as they were; the workflow gets the job's photos, prompt, model and settings. */
  const wfRecreate = useRef<{ id: string; job: string } | null>(null); const [rcTick, setRcTick] = useState(0);
  useLayoutEffect(() => { const u = new URL(location.href); const w = u.searchParams.get('workflow'); const rc = u.searchParams.get('recreate');
    if (!w || !rc || !RECREATABLE.includes(w)) return; if (w !== RIG_WORKFLOW) { u.searchParams.delete('recreate'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } wfRecreate.current = { id: w, job: rc }; }, []);
  useEffect(() => { const rc = wfRecreate.current; if (!rc) return; const r = wfList.find(x => x.id === rc.id); if (!r) return; wfRecreate.current = null;
    if (r.surface === 'rig') { fetch(`/api/jobs/${encodeURIComponent(rc.job)}`).then(x => x.ok ? x.json() : null).then(j => { const c = j?.input?.camera; if (c && typeof c === 'object') setRig(() => rigOfVals({ cameraBody: c.body, lens: c.lens, focal: String(c.focal ?? ''), aperture: String(c.aperture ?? ''), film: c.film ?? '', lighting: c.lighting ?? '', era: c.era ?? '' })); }).catch(() => undefined); return; }
    (async () => { try { const pr = await fetch(`/api/jobs/${encodeURIComponent(rc.job)}/prefill?action=recreate`).then(x => x.ok ? x.json() : null); if (!pr?.form) return;
      const form: Record<string, string> = pr.form; const vals: Record<string, string> = { ...defaultVals(r) }; for (const c of r.controls) if (form[c.field] != null && form[c.field] !== '') vals[c.field] = String(form[c.field]);
      if (r.id === 'upscale' && !(form.scale ?? '')) { const k = String(form.types ?? '').match(/x(\d+)/)?.[1]; if (k) vals.scale = k; } if (vals.scale) vals.scale = vals.scale.replace(/^x/, '');
      const nd: WfDraft = { prompt: String(form.prompt ?? ''), provider: String(form.provider ?? pr.model ?? ''), vals }; setWfDrafts(m => ({ ...m, [r.id]: nd })); saveDraft(r.id, nd);
      const got: Record<string, WfSlotFile | null> = {}; for (const s of r.slots) { const url = (pr.files?.[s.sendsAs] ?? [])[0]; if (!url) continue; const b = await (await fetch(url)).blob(); const f = new File([b], url.split('/').pop() || `${s.name}.png`, { type: b.type || 'image/png' }); got[s.name] = { file: f, url: URL.createObjectURL(f) }; }
      setWfFiles(m => ({ ...m, [r.id]: got })); /* replaces the workflow's photos (never adds) */
      const gone: string[] = Array.isArray(pr.missingFiles) ? pr.missingFiles : []; if (gone.length) toast(`${gone.length === 1 ? 'One input of that run is' : `${gone.length} inputs of that run are`} no longer on disk (${gone.slice(0, 3).join(', ')}). Add ${gone.length === 1 ? 'it' : 'them'} again before you generate.`, 'warn');
      if (r.surface === 'mask') { const mu = (pr.files?.mask ?? [])[0]; const ph = got.image?.file; let m: WfMask | null = null;
        if (mu && ph) { const b = await (await fetch(mu)).blob(); m = await maskFromFile(ph, new File([b], 'mask.png', { type: 'image/png' })); }
        setWfMask(m); if (!m && ph) toast('The mask wasn’t saved with that run: paint the area again', 'warn'); }
    } catch { /* the workflow stays picked; add the photos again */ } })(); }, [wfList.length, rcTick]);
  /* A navigation to this page while it is open (the viewer's Reference / Edit with a prompt / Recreate, Send to). Registered before usePrefill's own
   * listener (child effects run first), so the workflow is settled before the hand-off arrives: a Reference keeps the workflow (and its ?workflow=),
   * any other hand-off goes back to plain Create, a workflow Recreate (?workflow=relight&recreate=) picks that workflow and fills it. */
  const onNav = useRef<() => void>(() => undefined);
  onNav.current = () => { const want = workflowAfterNav(location.search, wfIdRef.current); const u = new URL(location.href); const rc = u.searchParams.get('recreate');
    if (want && rc && RECREATABLE.includes(want)) { if (want !== RIG_WORKFLOW) { u.searchParams.delete('recreate'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } wfRecreate.current = { id: want, job: rc }; setRcTick(t => t + 1); }
    const pid = u.searchParams.get('preset'); const want2 = pid && !u.searchParams.has('workflow') ? '' : want; /* a plain Create preset leaves any workflow */
    if (pid) { if (presetHere && presetHere.p.id !== pid) clearPreset(false); /* a new preset replaces the open one (its untouched text and settings go) */ wantPreset.current = pid; setPresetTick(t => t + 1); }
    if (want2 !== wfIdRef.current) setWf(want2, { carryBack: false, silent: !!pid }); else syncUrl(want2);
    const ex = u.searchParams.get('showcase'); if (ex) { exParam.current = ex; setExTick(t => t + 1); } /* an example opened while this page is open */
    readLinkVals(); };
  useEffect(() => { const path0 = location.pathname; const f = () => { if (location.pathname === path0) onNav.current(); }; addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  /* Person Swap's "Me" photo (2026-11-01, the local profile's mePhotoUrl): "Use my photo" next to the empty Person slot, "Save as my photo" in the
   * filled slot's preview. Kept on the server (not this browser), so Canvas and MCP see the same photo. Nothing saved = the slot stays empty as before. */
  const me = useProfile(); const meUrl = me?.mePhotoUrl ?? null;
  const useMe = async () => { if (!meUrl) return; try { setSlot('person', await urlToFile(meUrl, 'my-photo'), true); } catch { toast('Couldn’t load your saved photo. Add it again.', 'error'); } };
  const saveMe = async () => { const f = files.person?.file; if (!f) return; try { await saveMePhoto(f); toast('Saved as your photo'); } catch (e) { toast((e as Error).message, 'error'); } };
  const slotExtras = recipe?.id === 'person-swap' ? {
    image: { notes: ['A phone screenshot? Crop off the status bar first. With several people, say who in Touch-ups (e.g. the woman on the left).'] },
    person: { empty: meUrl ? { label: 'Use my photo', testId: 'wf-use-me', tip: 'Put your saved photo here', onClick: () => { void useMe(); } } : null,
      notes: ['Sunglasses on this photo hide the face, so it won’t carry over.'], actions: [{ label: meUrl ? 'Replace my photo' : 'Save as my photo', testId: 'wf-save-me', onClick: () => { void saveMe(); } }] } } : undefined;
  /* A link can pick a workflow's choice: /image?workflow=person-swap&outfit=keep opens Person Swap on "Keep the photo's outfit" and, when a Me
   * photo is saved, puts it in the empty Person slot. The param goes once applied (a refresh keeps your own pick). */
  const linkVals = useRef<{ wf: string; vals: Record<string, string> } | null>(null); const mePending = useRef(false); const [linkTick, setLinkTick] = useState(0);
  function readLinkVals() { const u = new URL(location.href); const o = u.searchParams.get('outfit'); if (!o || u.searchParams.get('workflow') !== 'person-swap') return;
    linkVals.current = { wf: 'person-swap', vals: { outfit: o } }; u.searchParams.delete('outfit'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); setLinkTick(t => t + 1); }
  useLayoutEffect(() => { readLinkVals(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const l = linkVals.current; if (!l || !recipe || recipe.id !== l.wf) return; linkVals.current = null;
    const ok = Object.fromEntries(Object.entries(l.vals).filter(([k, v]) => recipe.controls.find(c => c.field === k)?.options?.some(o => o.value === v)));
    if (Object.keys(ok).length) setDraft(d => ({ ...d, vals: { ...d.vals, ...ok } })); if (ok.outfit === 'keep') mePending.current = true; }, [recipe?.id, linkTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!mePending.current || recipe?.id !== 'person-swap' || !me) return; mePending.current = false; if (meUrl && !files.person) void useMe(); }, [recipe?.id, me, linkTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const wfGenerate = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!recipe || !draft) return; if (wfPf.length) { setPfOpen(o => !o); return; } /* pre-flight: every problem with its fix, on the button */
    if (!p.onWorkflowGenerate || wfBusy) return; const fd = new FormData();
    for (const s of wfSlots) { if (s.many) continue; const f = files[s.name]; if (f) fd.append(s.sendsAs, f.file, f.file.name); }
    if (prepNow && imgSlot && files[imgSlot.name]) { fd.append('imagePrep', JSON.stringify({ kind: prepNow.kind, aspect: prepNow.aspect })); fd.append('imageOriginal', prepNow.orig.file, prepNow.orig.file.name); } /* the viewer shows the photo as picked, badged */
    if (recipe.prompt.mode !== 'hidden') { fd.append('prompt', draft.prompt); fd.append('seed', exSeedField().seed ?? String(Math.floor(Math.random() * 1e6))); /* an example's seed when Same seed is on */ } if (wfProvider) { fd.append('provider', wfProvider); const pq = pinQ(wfProvider); if (pq.route) fd.append('route', pq.route); }
    for (const c of recipe.controls) { if (isMulti && c.field === 'shots') continue; const v = wfVals[c.field] ?? (c.optional ? '' : String(c.default ?? '')); if (v !== '' && v != null) fd.append(c.field, v); }
    if (isMask && wfMask) fd.append('mask', wfMask.file, 'mask.png'); if (isMulti) fd.append('shots', JSON.stringify(angleIds));
    addBrandField(recipe.runner.toolId, fd); /* Ad Pack: Brand's kit (colours, type and logo); no other workflow takes it */
    if (presetHere) fd.append('lookId', presetHere.p.id); /* the run was started from a look: its page on Workflows shows the result */
    /* Material Swap: one run per swatch through the same submit (each its own quote, history, cancel, Retry), shown as one set (shared/swatchBatch.ts) */
    const ms = wfSlots.find(s => s.many); const sw = ms ? swatchesOf(files, ms.name, ms.many) : []; const tid = recipe.runner.toolId; const go = p.onWorkflowGenerate;
    if (sw.length <= 1) { if (ms && sw[0]) fd.append(ms.sendsAs, sw[0].file, sw[0].file.name); setWfBusy(true); setWfErr(''); try { await go(tid, fd); } catch (er: any) { setWfErr(String(er?.message ?? 'That didn’t start.')); } finally { setWfBusy(false); } return; }
    setWfBusy(true); setWfErr(''); const setId = newSetId(); const sent = beginSet(setId); /* the feed shows all the swatches' places at once */
    try { const r = await runBatch(sw, async (x, set) => { const f2 = cloneForm(fd); f2.append(ms!.sendsAs, x.file, x.file.name); for (const [k, v] of Object.entries(set)) f2.append(k, v);
        const id = await go(tid, f2); if (!id) throw new Error('It didn’t start.'); return String(id); }, { setId });
      const t = batchToast(r, sw.length); toast(t.text, t.tone); if (!r.started) setWfErr(r.failed[0]?.error ?? 'That didn’t start.'); }
    finally { sent(); setWfBusy(false); } };
  /** Camera & Lens: the rig lives in its workflow draft (localStorage), so it survives switching workflows and a refresh, and presets / Recreate fill it. */
  function setRig(f: (r: Rig) => Rig) { setWfDrafts(m => { const d0 = m[RIG_WORKFLOW] ?? loadDraft(RIG_WORKFLOW) ?? { prompt: '', provider: '', vals: {} }; const nd: WfDraft = { ...d0, vals: { ...d0.vals, ...valsOfRig(f(rigOfVals(d0.vals))) } }; saveDraft(RIG_WORKFLOW, nd); return { ...m, [RIG_WORKFLOW]: nd }; }); }
  const promptNow = recipe && draft ? draft.prompt : p.prompt; const setPromptNow = (v: string) => { if (recipe) setDraft(d => ({ ...d, prompt: v })); else p.setPrompt(v); };
  usePromptGrow(p.promptRef, promptNow); /* 2 → 8 lines with its text, then it scrolls; the bar grows upward (shared, as on Video and Audio) */
  const swNote = useSwitchNote(); /* the bar's note after a model switch moved a setting (shared/settingsFit.ts, the menu row's fit) */
  const [pop, setPop] = useState<Pop>(() => (wantsPicker() ? 'wf' : '')); usePickerParam(o => { if (o) setPop('wf'); }); /* ?picker=1: the header's "See all" */ const [stTab, setStTab] = useState<'presets' | 'saved'>('presets'); const [stQ, setStQ] = useState(''); const [aspect, setAspect] = useState('Auto'); const [refTab, setRefTab] = useState<RefTab | null>(null); const [n, setN] = useState(1); const nNow = useRef(1); nNow.current = n; const [masking, setMasking] = useState(false); const [cMask, setCMask] = useState<{ preview: string; cover: number; forUrl: string } | null>(null); const [cMaskPhoto, setCMaskPhoto] = useState<File | null>(null); const dlIntent = useDownloadIntent(p.provider);
  const gs = useGenState(); const file = useRef<HTMLInputElement>(null); const dock = useRef<HTMLDivElement>(null);
  /* ONE chip row that never wraps (desktop): when the chips don't fit, the low-priority ones fold into the Settings button, lowest first
   * (enhance, resolution, quality, aspect = reverse DOM order; the count chip never folds). Workflow, +, model and Run on always stay. Phones fold them all (CSS)
   * and the row scrolls sideways. Re-fits on resize and on any chip change (React re-renders reset className, so class edits are watched). */
  const chipsRef = useRef<HTMLDivElement>(null);
  /** which Create settings are folded off the bar ('aspect' | 'quality' | 'res' | 'enh'; the count chip never folds): the shared chip fit
   *  (shared/dockFit useChipFit, also Video's, Audio's and 3D's), with a workflow's chips (.wf-fold) as the second tier that folds into ⋯ */
  const folded = useChipFit(chipsRef, { over: '.wf-fold', observe: true });
  /* the ⋯ overflow menu: the chips folded into it, read from the row when it opens (each row clicks its chip, whose popover then opens on ⋯) */
  const overRef = useRef<HTMLButtonElement>(null); const [overRows, setOverRows] = useState<RowOverflowRow[]>([]);
  const openOver = () => { if (pop === 'over') { setPop(''); return; } const c = chipsRef.current; if (!c) return;
    setOverRows([...c.querySelectorAll<HTMLElement>('.wf-fold.ic-folded')].map(el => foldedRow(el, el.matches('button') ? el : el.querySelector<HTMLElement>('button, input, a'))).filter((r): r is RowOverflowRow => !!r).concat(rowOverflowRows(c)) /* Brand and the eye, folded off a short row */);
    setPop('over'); };
  const reg = useModels(p.tool.id); const regOf = (id: string) => reg.models.find(m => m.providerId === id || m.id === id) as any;
  /* R1: popovers are the shared anchored Popover (portal); it owns Escape, outside-click and focus return */
  const aR = { model: useRef<HTMLButtonElement>(null), aspect: useRef<HTMLButtonElement>(null), quality: useRef<HTMLButtonElement>(null), res: useRef<HTMLButtonElement>(null), more: useRef<HTMLButtonElement>(null), count: useRef<HTMLButtonElement>(null), card: useRef<HTMLButtonElement>(null), set: useRef<HTMLButtonElement>(null) }; const [moreFrom, setMoreFrom] = useState<'chip' | 'card'>('chip'); const closePop = () => setPop('');
  const moreAt = viaOver(aR.more, overRef); /* Style folded into ⋯: its panel opens from there */
  /* the References panel (ImagePicker) sits above the dock (like the reference): Esc, a click outside it or its trigger again closes it */
  useDismiss(!!refTab, () => setRefTab(null));
  useEffect(() => { if (!refTab) return; const down = (e: PointerEvent) => { const t = e.target as Element | null; if (t?.closest?.('.ic-ref, [data-ref-trigger], .apop')) return; setRefTab(null); }; document.addEventListener('pointerdown', down, true); return () => document.removeEventListener('pointerdown', down, true); }, [!!refTab]);
  /* the shared picker (ImagePicker) fills a workflow slot when pickFor names one; else Create's own photos */
  const [pickFor, setPickFor] = useState<string | null>(null); useEffect(() => { if (!refTab) setPickFor(null); }, [refTab]);
  const openSlotPicker = (slot: string) => { setPop(''); if (refTab && pickFor === slot) { setRefTab(null); return; } setPickFor(slot); setRefTab('Uploads'); };
  useEffect(() => { if (!refTab) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setRefTab(null); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [refTab]);
  const cur = p.providers.find(x => x.id === p.provider) ?? p.providers[0];
  const pv = (x: ProviderInfo) => x as any;
  const comfyV = useComfyVersion();
  const minVOf = (x: ProviderInfo) => minComfyOf(x, regOf(x.id));
  /* The selected model's ComfyUI requirement, once on the page: the server's requirementNote first (blocking wording when the local ComfyUI is too old). */
  const minNote = (x: ProviderInfo): string => { const m = minVOf(x); const rn = String((regOf(x.id) as any)?.requirementNote ?? (x as any).requirementNote ?? '').trim(); if (!m && !rn) return ''; return (m && verBlock(x)) || rn || comfyNote(m!, pv(x).description); }; const verBlock = (x: ProviderInfo) => { const m = minVOf(x); return m && comfyV && olderThan(comfyV, m) ? minComfyBlock(m, comfyV) : ''; };
  /* Model vs Run-on: where this model runs on this tool (Auto or an account); the route it means is that account's route on the model */
  useToolModels(p.tool.id); const tmCur = modelOfEngine(p.tool.id, cur?.id); const curName = (tmCur ? shownName(tmCur) : null) ?? cur?.name; /* the catalogue name with version */ const pickRO = useRunOn(p.tool.id, tmCur?.key);
  /* QA #10: "@" in Create's prompt lists the attached photos (@image1 = photo 1…) */
  const at = useAtPicker(p.promptRef, p.prompt, p.setPrompt, !recipe && p.image ? [p.image, ...(p.refs ?? [])] : [], () => tmCur?.key); /* after tmCur: the open menu reads it while rendering */
  /* the prompt peek names where the run goes: the picked workflow's tool and model, else Create's */ const pkTid = recipe ? recipe.runner.toolId : p.tool.id; const pkModel = modelOfEngine(pkTid, recipe ? wfProvider : cur?.id); const pkRO = useRunOn(pkTid, pkModel?.key);
  const pickedRouteTop: string = pickRO.runOn === 'auto' ? 'auto' : (((cur as any)?.routes ?? []) as any[]).find(r => (r.runOn ?? runOnOfRoute(r.routeId, r.kind)) === pickRO.runOn)?.routeId ?? 'auto';
  useEffect(() => { const f = (e: Event) => { const id = (e as CustomEvent<{ providerId?: string }>).detail?.providerId; if (id && p.providers.some(x => x.id === id)) p.setProvider(id); }; addEventListener(USE_PROVIDER_EVT, f); return () => removeEventListener(USE_PROVIDER_EVT, f); }, [p.providers, p.setProvider]); /* Batch 28: 'Use cloud instead' from a route chip */
  const cm: any = regOf(cur?.id ?? '') ?? {}; const caps: any = cm.capabilities ?? {}; const sup: any = caps.supports ?? {}; const unv: string[] = caps.unverified ?? [];
  /* Edit Image (a photo attached, no mask): what the model's edit graph really honours (imageCaps `edit`): Auto = the photo's shape; some models only follow the photo */
  const routeCaps: any = routeCapsOf(cur, pickedRouteTop); /* shared/refCaps.ts (also the Canvas bar's) */
  const ed = imageChoices(caps, { editing: !!p.image && !p.mask }).ed as { aspects: string[]; allowAuto: boolean; resolutions: string[]; note: string } | null; const followsPhoto = !!ed && !ed.aspects.length;
  /* the model's shapes, narrowed to the route that runs it when that route takes fewer (Grok edits on fal, FLUX.2 on Replicate: server route caps) */
  const aspects: string[] = imageChoices(caps, { editing: !!p.image && !p.mask, routeShapes: routeCaps }).aspects;
  const tiers: string[] = caps.qualityTiers ?? [];
  const resList: string[] = imageChoices(caps, { editing: !!p.image && !p.mask, routeResolutions: routeCaps.resolutions }).resList; /* shared with the model menu's row prices (shared/imageSnap.ts) */
  const maxRefs = maxRefsOf(sup, routeCaps); if (p.refLimit) p.refLimit.current = maxRefs; const refN = (p.image ? 1 : 0) + (p.refs?.length ?? 0); const addRefs = async (fs: File[]) => { const room = maxRefs - refN; setLeft(''); if (!maxRefs) { setDropErr('This model doesn’t take reference images. Pick an edit model to use one.'); return; } setDropErr(''); { const n = fs.filter(f => fileFits('image', f)).length - Math.max(0, room); if (n > 0) setLeft(notAddedText(n, fullText({ image: maxRefs }, curName || 'This model'))); } if (room <= 0) return; const bad = fs.filter(f => !fileFits('image', f)); if (bad.length && bad.length === fs.length) { setDropErr(wrongTypeText(bad[0].name, ['image'])); return; } const ready: File[] = []; for (const f of fs.filter(f => fileFits('image', f)).slice(0, room)) { const pr = await prepUpload(f, 'image'); if ('error' in pr) { setDropErr(pr.error); continue; } if (pr.note) toast(pr.note); ready.push(pr.file); } if (ready.length) p.onImage(ready); }; const maxN = Number(caps.maxBatch ?? 4) || 1;
  const showEnh = (r: EnhanceResult) => { const was = r.original; p.setPrompt(r.prompt); toast(enhanceToastTitle(r), 'info', { sub: [r.added.slice(0, 4).join(', '), r.source].filter(Boolean).join(' · ') || undefined, ms: 10000, action: { label: 'Undo', onClick: () => p.setPrompt(was) } }); };
  const [dropErr, setDropErr] = useState(''); const [left, setLeft] = useState(''); /* "N not added" under the prompt line */ useEffect(() => setLeft(''), [p.provider]); const [badImg, setBadImg] = useState<Record<string, boolean>>({});
  useEffect(() => { if (!dropErr) return; toast(dropErr, 'warn'); setDropErr(''); }, [dropErr]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (p.imgErr) toast(p.imgErr, 'warn'); }, [p.imgErr]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (wfErr) toast(wfErr, 'error'); }, [wfErr]); // eslint-disable-line react-hooks/exhaustive-deps
  /* a pinned submit that couldn't run (409 route_not_runnable) or was sent twice with other settings (idempotency_conflict): nothing ran */
  const issueKey = (p.issues ?? []).map((i: any) => `${i?.code}:${i?.message ?? ''}`).join('|');
  useEffect(() => { const c = (p.issues ?? []).find((x: any) => x?.code === 'idempotency_conflict'); const i = (p.issues ?? []).find((x: any) => x?.code === 'route_not_runnable');
    if (c) toast('That run wasn’t sent', 'error', { sub: String(c.message ?? 'That run was already sent with different settings. Try again.') });
    else if (i) toast('This route isn’t available', 'error', { sub: String(i.message ?? 'Pick another place in Run on.') }); }, [issueKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dims, setDims] = useState<Record<string, string>>({}); const [drag, setDrag] = useState(false); const meta = (url: string, file?: File) => [dims[url], file ? (file.size > 1e6 ? `${(file.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`) : ''].filter(Boolean).join(' · '); const onLoadDims = (url: string) => (e: React.SyntheticEvent<HTMLImageElement>) => { const i = e.currentTarget; setDims(d => d[url] ? d : { ...d, [url]: `${i.naturalWidth}×${i.naturalHeight}` }); };
  const [qual2, setQual2] = useState(''); const [imgRes, setImgRes] = useState(''); const [quote, setQuote] = useState<number | null>(null); const [qNp, setQNp] = useState<any>(null); const [qj, setQj] = useState<any>(null); const pickedRoute = pickedRouteTop; const rtg = useRouting();
  /* C2 Recreate: apply the job's aspect / quality / image resolution / count once per recreate. */
  const applyInit = (v: Record<string, string>) => { if (v.aspect) setAspect(v.aspect === 'auto' ? 'Auto' : v.aspect); if (v.quality) setQual2(v.quality); if (v.imageResolution) setImgRes(v.imageResolution); if (v.n && Number(v.n) > 0) setN(Number(v.n)); };
  const pendingInit = useRef<Record<string, string> | null>(null);
  /* QA #9: the attached photo's real shape (width / height): an edit starts on Auto ("Match photo") where the model takes it, else on the closest listed aspect */
  const [photoAr, setPhotoAr] = useState<{ url: string; r: number } | null>(null); const imgUrl = p.image?.url ?? '';
  useEffect(() => { if (!imgUrl) return; let live = true; const i = new Image(); i.onload = () => { if (live && i.naturalWidth && i.naturalHeight) setPhotoAr({ url: imgUrl, r: i.naturalWidth / i.naturalHeight }); }; i.src = imgUrl; return () => { live = false; }; }, [imgUrl]);
  const photoRatio = photoAr && photoAr.url === imgUrl ? photoAr.r : null; const editing = !!p.image && !p.mask;
  const aspectNow = () => defaultAspectFor({ aspects, photoRatio, editing, editAllowsAuto: !!ed?.allowAuto, defaultAspect: caps.defaultAspect });
  const initAt = useRef(0); /* a Recreate's own aspect wins over the photo default for a moment */
  useEffect(() => { const v = p.initial; if (!v) return; pendingInit.current = v; initAt.current = Date.now(); if (v.aspect) setAspect(v.aspect === 'auto' ? 'Auto' : v.aspect); if (v.quality) setQual2(v.quality); if (v.imageResolution) setImgRes(v.imageResolution); if (v.n && Number(v.n) > 0) setN(Number(v.n)); }, [p.initial?._k]);
  useEffect(() => { if (!cm.id) return; const sw = settingsOnSwitch(caps, { editing, routeResolutions: routeCaps.resolutions, routeShapes: routeCaps, photoRatio, n, cur: { aspect, quality: qual2, imageResolution: imgRes } }); /* the model menu prices each row at these (shared/imageSnap.ts) */ setAspect(sw.aspect); setQual2(sw.quality); setImgRes(sw.imageResolution); setN(x => Math.min(x, sw.maxN)); const pi = pendingInit.current; if (pi && Date.now() - Number(pi._k || 0) < 3000) applyInit(pi); pendingInit.current = null; }, [cm.id, resList.join()]);
  /* the "X needs a key, so Y is the default" note: gone once you pick a model yourself or remove the photo; removing the photo also resets the edit's picks */
  const [fbOff, setFbOff] = useState(false); const hadImg = useRef(!!p.image);
  useEffect(() => { const had = hadImg.current; hadImg.current = !!p.image; if (had === !!p.image) return; setFbOff(had);
    if (had && cm.id) { setAspect(aspectNow()); setImgRes(resList.includes(caps.defaultResolution) ? caps.defaultResolution : resList[0] ?? ''); } }, [!!p.image]);
  /* a photo attached (or its shape known, or the mask toggled): start the edit on Match photo / the closest aspect; and never keep an aspect this model doesn't list */
  useEffect(() => { if (!cm.id || !editing || Date.now() - initAt.current < 3000) return; setAspect(aspectNow()); }, [editing, photoRatio, cm.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cm.id && aspects.length && !aspects.includes(aspect)) setAspect(carriedAspect(aspects, aspect, editing) /* same shape under the model's own name (16:9 → Runway 1920:1080), as on a switch */ ?? aspectNow()); }, [aspects.join(), aspect]); // eslint-disable-line react-hooks/exhaustive-deps
  /* ?preset=<id> (header Image menu, 2026-10-23): open an image preset. Its workflow is already picked by ?workflow=; once the presets (and that
   * recipe) are in, the preset's settings fill the workflow's controls (plain Create: aspect + style) and its prompt template goes in the prompt with
   * the subject hint selected, so typing replaces it (shared/presetLink presetPrefill: the same mapping the server tests check). The param then
   * leaves the URL (a reload doesn't re-apply over your edits); a "Preset: <name> ✕" chip shows until you clear it or switch workflow. */
  const wantPreset = useRef<string | null>((() => { const q = new URLSearchParams(location.search); const ex = q.get('showcase');
    return q.get('preset') ?? (ex && !showcaseById(ex) ? ex : null); /* a look's example opened again (reload): its preset fills the bar again */ })()); const [presetTick, setPresetTick] = useState(0);
  /** the open preset: its prompt as applied, its settings, the sample subject's range; `subject` = what you typed in the subject field; `full` = you opened the full prompt */
  type PresetOn = { p: WebImagePreset; prompt: string; vals: Record<string, string>; sel: [number, number] | null; k: number; subject: string; full: boolean };
  const [presetOn, setPresetOn] = useState<PresetOn | null>(null);
  useEffect(() => { const id = wantPreset.current; if (!id) return; let live = true;
    loadImagePresets().then(ps => { if (!live || wantPreset.current !== id) return; const pr = ps.find(x => x.id === id);
      const drop = () => { wantPreset.current = null; const u = new URL(location.href); if (['preset', 'lookModel', 'lookPrompt'].some(k => u.searchParams.has(k))) { for (const k of ['preset', 'lookModel', 'lookPrompt']) u.searchParams.delete(k); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } };
      if (!pr) { drop(); return; }
      /* a look's page (Workflows, 2026-10-23): "Use" / "Test" also pick the model (lookModel) and may bring the prompt as edited there (lookPrompt) */
      const q0 = new URLSearchParams(location.search); const lookModel = q0.get('lookModel') ?? ''; const lookPrompt = q0.get('lookPrompt');
      const own = <T extends { prompt: string; select: [number, number] | null }>(pf: T): T => lookPrompt != null && lookPrompt.trim() ? { ...pf, prompt: lookPrompt.trim(), select: null } : pf;
      if (pr.workflow === 'create-image') { const pf = own(presetPrefill(pr, CREATE_PRESET_FIELDS)); p.setPrompt(pf.prompt); if (lookModel && p.providers.some(x => x.id === lookModel)) p.setProvider(lookModel);
        if (pf.vals.style && p.styles.some(s => s.id === pf.vals.style)) p.setStyle(pf.vals.style);
        if (pf.vals.aspect) { pendingInit.current = { aspect: pf.vals.aspect, _k: String(Date.now()) }; initAt.current = Date.now(); setAspect(pf.vals.aspect); }
        setPresetOn({ p: pr, prompt: pf.prompt, vals: pf.vals, sel: pf.select, k: Date.now(), subject: '', full: false }); drop(); return; }
      const r = wfList.find(x => x.id === pr.workflow && x.status === 'ready'); if (!r) { if (wfList.length) drop(); return; } /* recipes still loading: runs again when they arrive */
      const pf = own(presetPrefill(pr, r.controls.map(c => c.field))); const prev = wfDrafts[r.id] ?? loadDraft(r.id);
      const nd: WfDraft = { prompt: pf.prompt, provider: lookModel && Object.values(r.models).some(ms => ms.includes(lookModel)) ? lookModel : prev?.provider ?? '', vals: { ...defaultVals(r), ...pf.vals } }; setWfDrafts(m => ({ ...m, [r.id]: nd })); saveDraft(r.id, nd); if (r.surface === 'rig') p.setPrompt(pf.prompt);
      if (wfIdRef.current !== r.id) setWf(r.id, { silent: true }); setPresetOn({ p: pr, prompt: pf.prompt, vals: pf.vals, sel: pf.select, k: Date.now(), subject: '', full: false }); drop(); });
    return () => { live = false; }; }, [presetTick, wfList.length, p.styles.length]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the subject hint is selected (else the caret goes to the end) once the prompt shows the preset's text */
  /* After picking a workflow or opening a preset, focus goes to the next step: the first empty required photo slot (it pulses), else the
   * preset's subject field, else the prompt (caret at the end). */
  useEffect(() => { if (presetOn) setFocusTick(t => t + 1); }, [presetOn?.k]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!focusTick) return; const t = requestAnimationFrame(() => {
    const slot = dock.current?.querySelector<HTMLElement>('[data-next="1"] .wf-slot-hit'); if (slot) { slot.focus({ preventScroll: true }); return; }
    if (subjRef.current) { subjRef.current.focus({ preventScroll: true }); return; }
    const el = p.promptRef.current; if (!el || !presetOn || el.value !== presetOn.prompt) return; el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length); });
    return () => cancelAnimationFrame(t); }, [focusTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const presetHere = presetOn && presetOn.p.workflow === (recipe?.id ?? rigWf?.id ?? 'create-image') ? presetOn : null;
  /* "Neon night · 16:9": what a plain-Create preset set that the chip row may have folded away (in the preset tile's tooltip) */
  const presetLook = presetHere && !recipe && presetHere.p.workflow === 'create-image' ? lookParts(presetHere.vals, { style: p.style, styleLabel: p.styles.find(x => x.id === p.style)?.label, aspect }) : [];
  /** ✕ on the chip: the preset's settings go back to the defaults, and its prompt goes too while you haven't edited it. */
  const clearPreset = (focus = true) => { const po = presetHere; setPresetOn(null); if (!po) return; const sp = subjectParts(po.prompt, po.sel, po.p.promptTemplate); const after = (cur: string) => promptAfterPresetClear(cur, sp, po.subject, po.prompt);
    if (rigWf) { p.setPrompt(after(p.prompt)); setRig(() => rigOfVals(defaultVals(rigWf))); }
    else if (recipe) { const dv = defaultVals(recipe); setDraft(d => ({ ...d, prompt: after(d.prompt), vals: Object.fromEntries(Object.entries({ ...d.vals }).flatMap(([k, v]) => k in po.vals ? (k in dv ? [[k, dv[k]]] : []) : [[k, v]])) })); }
    else { p.setPrompt(after(p.prompt)); if (po.vals.style && p.style === po.vals.style) p.setStyle(''); if (po.vals.aspect && aspect === po.vals.aspect) setAspect(aspectNow()); }
    if (focus) requestAnimationFrame(() => p.promptRef.current?.focus()); };
  /** Switching workflow with a preset on: the preset (and its untouched text) goes, and a toast offers Undo (back to that workflow, with the preset and text as they were). */
  function leavePreset(to: string) { const po = presetHere; if (!po) { setPresetOn(null); return; }
    const snap = { po, wf: wfIdRef.current, prompt: p.prompt, style: p.style, aspect, draft: recipe && draft ? { id: recipe.id, d: draft } : null, rig: rigWf ? { ...((wfDrafts[RIG_WORKFLOW] ?? loadDraft(RIG_WORKFLOW))?.vals ?? {}) } : null };
    clearPreset(false); const toName = to ? wfList.find(x => x.id === to)?.name ?? 'that workflow' : 'Create';
    toast(`Look “${po.p.name}” removed`, 'info', { sub: `It belongs to ${recipe?.name ?? rigWf?.name ?? 'Create'}, not ${toName}.`, ms: 8000, action: { label: 'Undo', onClick: () => {
      setWf(snap.wf, { silent: true, carryBack: false });
      if (snap.draft) { const { id, d } = snap.draft; setWfDrafts(m => ({ ...m, [id]: d })); saveDraft(id, d); }
      else { p.setPrompt(snap.prompt); p.setStyle(snap.style); setAspect(snap.aspect); if (snap.rig) { const v = snap.rig; setRig(() => rigOfVals(v)); } }
      setPresetOn({ ...snap.po, k: Date.now() }); } } }); }
  /* the preset as a tile, first in the context row in every mode: thumbnail, "Preset", its name, ✕ */
  const presetChip = presetHere ? <span className="ic-pre" data-testid="ic-preset-chip" data-preset={presetHere.p.id} {...tip(`Look: ${presetHere.p.name}${presetLook.length ? ` · ${presetLook.join(' · ')}` : ''}`)}>{presetHere.p.thumbnail ? <img src={presetHere.p.thumbnail} alt="" /> : <i className="ic-pre-ph" aria-hidden />}<span className="ic-pre-t"><small>Look</small><b>{presetHere.p.name}</b></span>
    <button type="button" className="ic-preset-x" aria-label={`Clear look ${presetHere.p.name}`} data-testid="ic-preset-clear" {...tip('Clear look')} onClick={() => clearPreset()}><CloseIcon size={10} strokeWidth={2.2} /></button></span> : null;
  /* ---- ?showcase=<id> (Workflows, 2026-10-23): a shipped example (server/src/shared/showcase.ts) or a look's cover opens in the result viewer as if you
   * had just made it, and the bar is filled with its workflow, model, prompt and settings (shared exampleLink examplePrefill, tested in
   * server/test/example-links.test.ts). Nothing runs, downloads or attaches by itself: the workflow's photo slots stay empty for your own photo.
   * The param stays while the viewer is open (a reload shows the same thing); closing it leaves the bar filled. A look's example also opens its
   * preset (?preset=, the same id), which fills the bar; the cover's model is then picked. An unknown id just leaves the workflow picked. */
  const ownEx = useOwnAccounts(); const exReq = useRef(0); const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const exParam = useRef<string | null>(new URLSearchParams(location.search).get('showcase')); const [exTick, setExTick] = useState(0);
  const [exShown, setExShown] = useState<ExampleShown | null>(null);
  /** what "Use these settings" fills again */ const exSrc = useRef<{ kind: 'showcase'; s: ShowcaseItem } | { kind: 'look'; id: string; wf: string; provider: string | null } | null>(null);
  /** plain Create: the example's chips, snapped once its model is the one picked (after the model-switch rule above) */ const exCreate = useRef<{ provider: string; cur: { aspect?: string; quality?: string; imageResolution?: string; n: number }; at: number } | null>(null); const [exSnap, setExSnap] = useState(0);
  /** a look: its cover's model, picked once the preset has filled the bar */ const exLook = useRef<{ id: string; wf: string; provider: string } | null>(null);
  /** the recorded seed: on = this run reuses it (Same seed), off = a new one */ const [exSeed, setExSeed] = useState<{ seed: number; on: boolean; wf: string } | null>(null);
  const dropExampleParam = () => { const u = new URL(location.href); if (!u.searchParams.has('showcase')) return; u.searchParams.delete('showcase'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); };
  const wfNameOf = (id: string) => id === 'create-image' ? 'Create Image' : wfList.find(x => x.id === id)?.name ?? id;
  const shownOf = (s: ShowcaseItem): ExampleShown => ({ key: s.id, name: s.name, image: s.image, width: s.width, height: s.height, before: s.before ? { image: s.before.image, label: s.before.label, afterLabel: s.before.afterLabel } : null,
    workflow: s.workflow, workflowName: wfNameOf(s.workflow), provider: s.provider, model: s.model, prompt: s.prompt, settings: s.settings, price: runPrice({ own: ownEx, runOn: s.runOn }) ?? s.price, runMs: s.runMs });
  /** Fill the bar from a shipped example (false: its workflow's recipe isn't loaded yet). */
  const fillFromShowcase = (s: ShowcaseItem): boolean => {
    if (s.workflow === 'create-image') {
      if (wfIdRef.current) setWf('', { carryBack: false, silent: true });
      p.setPrompt(s.prompt); if (p.providers.some(x => x.id === s.provider)) p.setProvider(s.provider);
      else toast(`${s.model} isn’t offered here`, 'warn', { sub: 'The prompt and settings are in the bar; pick another model to make your own.' });
      const st = s.settings; exCreate.current = { provider: s.provider, cur: { aspect: st.aspect != null ? String(st.aspect) : undefined, quality: st.quality != null ? String(st.quality) : undefined, imageResolution: st.imageResolution != null ? String(st.imageResolution) : undefined, n: Number(st.n ?? 1) || 1 }, at: Date.now() }; setExSnap(t => t + 1);
    } else {
      const r = wfList.find(x => x.id === s.workflow && x.status === 'ready'); if (!r) return false;
      const f = examplePrefill(s, { controls: r.controls as any }); const nd: WfDraft = { prompt: f.prompt, provider: f.provider, vals: { ...defaultVals(r), ...f.vals } };
      setWfDrafts(m => ({ ...m, [r.id]: nd })); saveDraft(r.id, nd); if (wfIdRef.current !== r.id) setWf(r.id, { silent: true, carryBack: false });
    }
    setPresetOn(null); const seed = examplePrefill(s).seed; setExSeed(seed != null ? { seed, on: true, wf: s.workflow === 'create-image' ? '' : s.workflow } : null);
    return true; };
  useEffect(() => { const id = exParam.current; if (!id) return; const s = showcaseById(id);
    if (s) { if (s.workflow !== 'create-image' && !wfList.length) return; /* recipes still loading: runs again when they arrive */
      exParam.current = null; if (!fillFromShowcase(s)) { dropExampleParam(); return; } exSrc.current = { kind: 'showcase', s }; setExShown(shownOf(s)); return; }
    exParam.current = null; const wf = new URLSearchParams(location.search).get('workflow') || 'create-image'; const my = ++exReq.current; const live = () => exReq.current === my && mounted.current; /* a re-run of this effect (the recipes arriving) must not drop the reply */
    loadLook(wf, id).then(d => { if (!live()) return; const c = d.results.find(r => !!d.look.provider && r.provider === d.look.provider)?.latest ?? d.results[0]?.latest; if (!c) { dropExampleParam(); return; }
      exSrc.current = { kind: 'look', id, wf, provider: c.provider }; if (c.provider) { exLook.current = { id, wf, provider: c.provider }; setExSnap(t => t + 1); }
      setExSeed(null); setExShown({ key: `look-${id}`, name: d.look.name, image: c.url, width: null, height: null, before: c.inputUrl ? { image: c.inputUrl, label: 'Photo', afterLabel: 'Result' } : null, workflow: wf, workflowName: d.workflow.name ?? wfNameOf(wf),
        provider: c.provider, model: c.modelName, prompt: d.look.prompt, settings: d.look.settings, price: paidText(c.paid, ownEx), runMs: c.renderMs, look: d.look.name }); })
      .catch(() => { if (live()) dropExampleParam(); /* not an example: the workflow stays picked, nothing else */ }); }, [exTick, wfList.length]); // eslint-disable-line react-hooks/exhaustive-deps
  /* plain Create: once the example's model is picked, its chips snap to what that model offers (the model menu's rule, shared/imageSnap.ts) */
  useEffect(() => { const e = exCreate.current; if (!e || recipe) return; if (Date.now() - e.at > 15000) { exCreate.current = null; return; } if (!cm.id || (cur?.id !== e.provider && p.providers.some(x => x.id === e.provider))) return;
    exCreate.current = null; const sw = settingsOnSwitch(caps, { editing, routeResolutions: routeCaps.resolutions, routeShapes: routeCaps, photoRatio, n: e.cur.n, cur: e.cur });
    initAt.current = Date.now(); setAspect(sw.aspect); setQual2(sw.quality); setImgRes(sw.imageResolution); setN(sw.n); }, [cm.id, resList.join(), exSnap]); // eslint-disable-line react-hooks/exhaustive-deps
  /* a look: its preset filled the bar; now the model that made the cover */
  useEffect(() => { const l = exLook.current; if (!l || presetOn?.p.id !== l.id) return; exLook.current = null;
    if (l.wf === 'create-image') { if (p.providers.some(x => x.id === l.provider)) p.setProvider(l.provider); }
    else if (recipe?.id === l.wf && Object.values(recipe.models).some(ms => ms.includes(l.provider))) setDraft(d => ({ ...d, provider: l.provider, pickedBy: undefined })); }, [presetOn?.k, exSnap, recipe?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the seed belongs to the example's workflow: it shows as "Same seed" there (on: this run reuses it) */
  const exSeedHere = exSeed && exSeed.wf === (recipe?.id ?? '') ? exSeed : null;
  const seedEl = p.sameSeed ?? (exSeedHere ? <SameSeed seed={exSeedHere.seed} on={exSeedHere.on} onChange={v => setExSeed(x => x && { ...x, on: v })} /> : null);
  const exSeedField = (): Record<string, string> => exSeedHere?.on && !p.sameSeed ? { seed: String(exSeedHere.seed) } : {};
  /** Close: the bar stays filled and focus goes to the next step (a photo slot, the subject field or the prompt, else Generate). */
  const closeExample = () => { setExShown(null); dropExampleParam(); requestAnimationFrame(() => { const slot = dock.current?.querySelector<HTMLElement>('[data-next="1"] .wf-slot-hit') ?? dock.current?.querySelector<HTMLElement>('.wf-slot-hit');
    const pr = p.promptRef.current; (slot ?? subjRef.current ?? (pr && pr.style.display !== 'none' ? pr : null) ?? genRef.current)?.focus({ preventScroll: true }); }); };
  const useExample = () => { const src = exSrc.current; if (src?.kind === 'showcase') fillFromShowcase(src.s);
    else if (src?.kind === 'look') { if (presetHere?.p.id !== src.id) { wantPreset.current = src.id; setPresetTick(t => t + 1); } if (src.provider) { exLook.current = { id: src.id, wf: src.wf, provider: src.provider }; setExSnap(t => t + 1); } }
    closeExample(); toast('Settings in the bar', 'info', { sub: 'Nothing runs until you press Generate.' }); };
  /* "Use this photo": the example's input photo goes in the workflow's first slot (a plain Create example has none) */
  const exUsePhoto = exShown?.before && recipe && recipe.id === exShown.workflow && firstSlot(recipe) ? async () => { const b = exShown.before!; const s0 = firstSlot(recipe)!;
    try { const f = await urlToFile(b.image, `example-${exShown.key}`); setSlot(s0.name, f, true); closeExample(); } catch { toast('Couldn’t load that photo. Add your own instead.', 'error'); } } : null;
  /* the subject field: the preset's sample is its placeholder (sent when it's left empty); the rest of the template is one muted line */
  const sParts = presetHere && !presetHere.full ? subjectParts(presetHere.prompt, presetHere.sel, presetHere.p.promptTemplate) : null;
  /* shown while the prompt is still the template (an Enhance rewrite or a hand-off puts the plain prompt box back) */
  const subjOn = !!sParts && !!presetHere && recipe?.prompt.mode !== 'hidden' && promptNow === fillSubject(sParts, presetHere.subject);
  /* Auto on an edit whose model keeps the photo's shape reads "Match photo" */
  const arLabel = (a: string) => a === 'Auto' && ed?.allowAuto ? 'Match photo' : a;
  const cell = (tier: string, res: string) => { const pm = cm.priceMatrix; if (!pm) return 0; const row = pm[tier || 'default'] ?? pm.default; return row ? row[res] : 0; };
  const canRef = sup.refs !== false && maxRefs > 0; const showAspect = aspects.length > 0; const showQual = tiers.length > 0; const showRes = resList.length > 0;
  /* a model with its own tier words (Krea 3: Fast / Think more / Think most, imageCaps tierNames) shows those; the rest say Low / Medium / High */
  const tNames: Record<string, { label: string; hint: string }> = caps.tierNames ?? {}; const qWord = tNames && Object.keys(tNames).length ? 'Thinking' : 'Quality';
  const TDESC: Record<string, string> = { low: 'Fastest, cheapest', med: 'Balanced', medium: 'Balanced', high: 'Most detail', ...Object.fromEntries(Object.entries(tNames).map(([k, v]) => [k, v.hint])) };
  const qName = (k: string) => tNames[k]?.label ?? (QUALS.find(x => x[0] === k)?.[1]) ?? k;
  /* a tier that runs only at some sizes (Krea 3 Think most: 2K) stays pickable and moves the size with it, so it's never a dead end */
  const tierMove = (k: string): string | null => { const need: string[] | undefined = caps.tierNeedsRes?.[k]; const to = need?.find(r => resList.includes(r));
    return need && !need.includes(imgRes) && to && cell(k, to) != null ? to : null; };
  const pickTier = (k: string) => { const to = tierMove(k); setQual2(k); if (to) setImgRes(to); };
  const resOffWhy = () => caps.tierNeedsRes?.[qual2] ? `${qName(qual2)} needs ${caps.tierNeedsRes[qual2].join(' / ')}` : 'Not available';
  /* Images: which feature this run is ("Edit Image · Nano Banana 2" once an image is attached; Brush Edit with a mask) and the Camera & Lens rig */
  const camLens = p.featureId === 'camera-lens' || !!rigWf; const rigRecipe = rigWf ?? (camLens ? wfList.find(r => r.id === RIG_WORKFLOW) ?? null : null); const fid = camLens ? 'camera-lens' : p.mask ? 'brush-edit' : p.image || p.editIntent ? 'edit-image' : 'create-image';
  /* plain Create Image's per-feature default and the user's own pick (switching Create / Edit / Camera & Lens moves off the last one's default, never off a pick or a link's model) */
  const cDef = recipe ? null : wfDefaultOf(p.tool, fid); const cKind = recipe ? null : pickKindOf(p.provider, cDef, savedPick(fid) === p.provider);
  const lastFid = useRef(camLens ? 'create-image' : fid);
  useEffect(() => { if (recipe) return; const prev = lastFid.current; if (prev === fid || !cDef) return; lastFid.current = fid; const ids = p.providers.map(x => x.id);
    const want = startModel(savedPick(fid), ids, cDef); const was = wfDefaultOf(p.tool, prev);
    const to = featureSwitchTo(p.provider, savedPick(prev), ids, was, want); if (to) p.setProvider(to); }, [fid, !!cDef, !!recipe]); // eslint-disable-line react-hooks/exhaustive-deps
  const rig: Rig = rigOfVals((wfDrafts[RIG_WORKFLOW] ?? loadDraft(RIG_WORKFLOW))?.vals ?? {}); const enhRef = useRef<HTMLButtonElement>(null); const enhT = useRef<number | undefined>(undefined); const enhLong = useRef(false);
  const rigFields = (): Record<string, string> => camLens ? { cameraBody: rig.body, lens: rig.lens, focal: String(rig.focal), aperture: rig.aperture, ...(rig.film ? { film: rig.film } : {}), ...(rig.lighting ? { lighting: rig.lighting } : {}), ...(rig.era ? { era: rig.era } : {}) } : {};
  /* model extras (server/src/shared/imageCaps.ts extras: Qwen Image 3.0, Wan 2.5): a negative prompt and the model's own prompt rewrite, in Settings; sent only to models that take them */
  const extras: { negativePrompt?: boolean; promptRewrite?: boolean; promptRewriteDefault?: boolean } | null = !recipe && caps.extras ? caps.extras : null;
  /* the model's own options (server/src/shared/imageOptions.ts: Luma's Look, Recraft's Style controls), drawn by the shared ModelOptionsGroup */
  const mOpts = !recipe && caps.options ? caps.options : null; const [optVals, setOptVals] = useState<OptionValues>({});
  const [negPrompt, setNegPrompt] = useState(''); const [rewrite, setRewrite] = useState(!!extras?.promptRewriteDefault);
  /* a model that rewrites by default (FLUX.2) starts with the switch on; the others start off. Options start on the model's defaults. */
  useEffect(() => { setRewrite(!!caps.extras?.promptRewriteDefault); setOptVals({}); }, [cm.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const extraFields = (): Record<string, string> => ({ ...(extras?.negativePrompt && negPrompt.trim() ? { negativePrompt: negPrompt.trim().slice(0, NEG_PROMPT_MAX) } : {}),
    ...(extras?.promptRewrite && (rewrite || extras.promptRewriteDefault) ? { promptRewrite: rewrite ? '1' : '0' } : {}), ...optionFields(mOpts, optVals) });
  const params = () => ({ ...rigFields(), ...(showAspect ? { aspect: aspect === 'Auto' ? 'auto' : aspect } : {}), ...(showQual && qual2 ? { quality: qual2 } : {}), ...(showRes && imgRes ? { imageResolution: imgRes } : {}), n: String(n), ...extraFields() });
  /* prompt length for token-billed models (GPT Image bills prompt text): sent in steps of 500 bytes, so typing requotes only when a step is crossed */
  const promptStep = promptBucket(promptBytesOf(promptNow));
  /* GPT Image sends one exact size per shape and resolution (server/src/shared/gptImageSizes.ts): the menu names it ("1344×2016 px") instead of the long side */
  const exactSize = (r: string) => { const h = HOSTED_BY_ID[cm.id]; const s = h?.tokenImage ? gptImageSize(aspect, r) : h?.mpImage && aspect !== 'Auto' && String(qj?.route ?? '').startsWith('comfy-router:') ? (({ width, height }) => `${width}x${height}`)(flux2Size(aspect, r)) /* FLUX.2: server/src/shared/hostedAspects.ts */ : routerImageSize(cm.id, aspect, r); /* Seedream 5.0, Qwen Image 3.0, Wan 2.5: server/src/shared/routerImageSizes.ts */
    return s ? `${s.replace(/[x*]/, '×')} px` : null; };
  const qN = useRef(1); /* the count the last quote priced (the count popover scales it to the picked count at once) */
  const rqTick = useRequoteTick(); useEffect(() => { if (!cm.id) return; const t = setTimeout(() => { const q = new URLSearchParams({ ...quoteParams(), model: cm.id, ...params(), promptBytes: String(promptStep), refs: String(p.mask ? (p.image ? 1 : 0) : Math.min(refN, maxRefs)), mode: p.image ? (p.mask ? 'inpaint' : 'edit') : 'generate', ...(pickRO.runOn !== 'auto' ? { toolId: p.tool.id, runOn: pickRO.runOn } : {}) }); /* the same run-on the submit sends (shared/models.ts) */ quoteGet('/api/models/quote?' + q).then(j => { qN.current = Number(q.get('n')) || 1; setQj(j); setQNp(j?.noProvider ?? null); setQuote(shownCredits(j)); }).catch(() => { setQj(null); setQuote(null); }); }, 250); return () => clearTimeout(t); }, [rqTick, cm.id, aspect, qual2, imgRes, n, promptStep, !!p.image, refN, !!p.mask, pickedRoute, pickRO.runOn, rtg?.global?.useLocal, JSON.stringify(rtg?.perModel ?? null), JSON.stringify(rtg?.perTool?.[p.tool.id] ?? null)]);
  /* paste an image (screenshot, copied photo) anywhere on the page: it attaches like a dropped file; a text paste goes where it always did */
  /* a paste goes to the slot whose picker is open, else the focused slot, else the usual placement; a drop on the bar uses the placement */
  const pasteToSlot = (fs: File[]) => { const t = pickFor ?? (document.activeElement as Element | null)?.closest?.('[data-wf-slot]')?.getAttribute('data-wf-slot') ?? null; const f = fs.find(x => /^image\//.test(x.type)); if (t && f) setSlot(t, f, true); else takeIncoming(fs); };
  const addRefsRef = useRef<(fs: File[]) => void | Promise<void>>(addRefs); addRefsRef.current = recipe ? pasteToSlot : addRefs;
  useEffect(() => { const f = (e: ClipboardEvent) => { const fs = [...(e.clipboardData?.files ?? [])].filter(x => /^image\//.test(x.type)); if (!fs.length) return; e.preventDefault(); addRefsRef.current(fs.map((x, k) => x.name && x.name !== 'image.png' ? x : new File([x], `pasted-${Date.now()}${k ? `-${k}` : ''}.${x.type === 'image/jpeg' ? 'jpg' : 'png'}`, { type: x.type }))); }; document.addEventListener('paste', f); return () => document.removeEventListener('paste', f); }, []);
  /** A picked tile (Uploads, Generations, Favourites): into the slot the picker is for, else Create's photos. */
  /* the shared picker hands a library photo as a File tagged with its URL (shared/libraryFiles.ts): sent by reference, no re-upload */
  const usePicked = (f: File) => { if (pickFor && recipe) setSlot(pickFor, f, true); else addRefs([f]); setRefTab(null); };
  const useUrl = async (url: string, name?: string) => { try { const f = await urlToFile(url, name); if (pickFor && recipe) setSlot(pickFor, f, true); else addRefs([f]); setRefTab(null); } catch { toast('Couldn’t load that image. Try another one.', 'error'); } };
  /** Reference from the viewer: a picked workflow takes it into a slot (or asks which); plain Create attaches it as a photo. Always says so. */
  const refFromViewer = async (url: string, job: JobState, out: number) => { try { const f = await urlToFile(url, `${job.id}-${out}`); if (intake([f])) return;
    if (maxRefs - refN <= 0) { addRefs([f]); toast(maxRefs ? `This model takes up to ${maxRefs} image${maxRefs > 1 ? 's' : ''}. Remove one first.` : 'This model doesn’t take reference images. Pick an edit model to use one.', 'warn'); return; }
    tagHandoff(f, { fromJob: job.id, output: String(out) }); addRefs([f]); toast(refN ? `Added as image ${refN + 1}` : 'Added as a reference'); } catch { toast('Couldn’t bring in that result. Upload it instead.', 'error'); } };
  const dropOnBar = async (dt: DataTransfer) => { const fs = [...dt.files]; if (!fs.length) { const u = dropUrl(dt); if (!u) return; try { fs.push(await urlToFile(u)); } catch { return; } } (recipe ? takeIncoming : addRefs)(fs); };
  const isImg = (u?: string | null) => !!u && !/\.(mp4|webm|mov|wav|mp3)$/i.test(u);
  /* Item 2/6: the grid is the one place a job shows (newest first, this tool's history from the server). Canceled runs are left out; failed ones sit under Show: Failed (feedFilter FEED_STATUS), except a run that failed during this visit. */
  /* PB-04: a run canceled here stays a few seconds as a "Canceled" tile, so the click has a visible answer, then leaves */
  const [, setLinger] = useState(0); const lingering = (j: JobState) => j.status === 'canceled' && Date.now() - Number((j as any).canceledLocally ?? 0) < CANCEL_LINGER_MS;
  /* the toolbar: project (scopes the feed; new results go there), filter / search / sort / grid size, Select mode, Compare models */
  /* The Image tab's feed (2026-10-26): one feed always (user: "one feed always, the workflow only changes the bar"). It lists All images, every job
   * whose output is an image from any tool, tab, Canvas board or MCP call (server shared/imageFeed.ts), running first, narrowed only by Filter
   * (Type, From, Show). Picking a workflow never filters or resets it. Live jobs come from anywhere (FeedScope useLiveJobs: the shared active-jobs poller). */
  const live = useLiveJobs(p.jobs);
  const fs = useFeedState(live, { scope: SCOPE }); const { pj, filt, setFilt, feed, selecting, setSelecting, sel, setSel, allBusy, stopSelect, togglePick, selectAll } = fs;
  /* Filter › From › Uploads: your own images from the media library (files you uploaded or gave a run, saved frames), not jobs */
  const upOn = filt.source === 'uploads'; const up = useUploads('image', pj.pid, filt, upOn);
  /** Upload → Use in… → Reference: a picked workflow takes it into a slot; plain Create attaches it (sent by reference, no re-upload). */
  const refFromUpload = async (url: string) => { try { const f = await libraryFile(url, 'image'); if (intake([f])) return; addRefs([f]); toast(refN ? `Added as image ${refN + 1}` : 'Added as a reference'); } catch { toast('Couldn’t load that image. Try another one.', 'error'); } };
  const [cmpOpen, setCmpOpen] = useState(false); const cmpRef = useRef<HTMLButtonElement>(null); const [sideBy, setSideBy] = useState<string | null>(null); const ownB = useOwnAccounts();
  const sendingSet = useSendingSets();
  /* compared runs sit together (in the order picked), so the viewer steps through them */
  const grouped = (() => { const all = feed.jobs.filter(j => j.status !== 'canceled' || lingering(j)); const out: JobState[] = []; const done = new Set<string>();
    /* a retried run in a set: its Retry takes its place (the server puts the retry in the same set) */ const retried = new Set(all.filter(j => (j as any).compare && (j as any).input?.retryOf).map(j => String((j as any).input.retryOf))); const list = all.filter(j => !retried.has(j.id));
    for (const j of list) { const g = (j as any).compare?.id as string | undefined; if (!g) { out.push(j); continue; } if (done.has(g)) continue; done.add(g);
      const members = list.filter(x => (x as any).compare?.id === g);
      /* a set still being sent: all its places from the first frame (waiting cards), so the row never grows or jumps */
      out.push(...(sendingSet(g) ? withSetPlaces(members as any[], i => waitingCard(members[0], i)) : members.sort((a, b) => Number((a as any).compare?.i ?? 0) - Number((b as any).compare?.i ?? 0)))); }
    return out; })();
  const shown = grouped; const nLinger = shown.filter(j => j.status === 'canceled').length;
  useEffect(() => { if (!nLinger) return; const t = setTimeout(() => setLinger(n => n + 1), CANCEL_LINGER_MS); return () => clearTimeout(t); }, [nLinger, p.jobs]);
  /* Several results (2026-10-25, shared/MultiResult): one card per run, whatever the workflow (Camera Angles, a Create Image batch, Image to layers,
   * Character Sheet): a mosaic of up to four (or the composite / the sheet alone, per the workflow's presentation) with a "9 angles" badge.
   * An angle the server didn't return is a muted "Didn't render" cell (only what the server charged stays charged); the viewer's filmstrip has them all. */
  type FeedTile = { j: JobState; url: string | null; k: number; of: number; /** every result when there are several */ multi?: ResultItem[] };
  const tileOf = (j: JobState): FeedTile[] => { const items = resultItemsOf(j as any).filter(x => !x.url || isImg(x.url));
    const lay = j.status === 'done' ? layersOf(j as any) : null; if (lay) return [{ j, url: layersPosterOf(j as any, lay), k: 0, of: 1, multi: items }]; // Image to layers: the composite (the server's poster: every layer in order)
    if (items.length > 1) return [{ j, url: items.find(x => x.state === 'done')?.url ?? null, k: 0, of: 1, multi: items }];
    return [{ j, url: j.status === 'done' ? items[0]?.url ?? j.resultUrl ?? null : null, k: 0, of: 1 }]; };
  const stCur = p.styles.find(x => x.id === p.style); const stPoster = (x: { id: string; posterUrl?: string }) => x.posterUrl ?? EXAMPLES[((p.styles.indexOf(x as any) + 1) * 7) % EXAMPLES.length].poster;
  /** The run was started from a look (preset): its id goes with it, so the look's page on Workflows gathers the result (never sent to the quote). */
  const lookField = (): Record<string, string> => presetHere ? { lookId: presetHere.p.id } : {};
  const go = () => { setPop(''); p.onGenerate({ ...params(), ...lookField(), ...exSeedField() }); };
  const unpriced = !!qj && qj.credits == null && (qj.priceAvailable === false || (qj.issues ?? []).some((i: any) => i.code === 'price_unavailable')); const total = qj ? quote : (p.price != null ? p.price * n : null);
  /* QA #7: a resolution's price in the Generate button's words. The matrix is list credits per image; scaled to the quote so the picked
   * resolution reads exactly like the button (same count, same place), the others in proportion. */
  const ownBill = useOwnAccounts(qj);
  const resPrice = (r: string): string | null => { const c = cell(qual2, r); if (!c) return null; const at = cell(qual2, imgRes);
    /* GPT Image on Comfy Router: the shared token quote for this shape, prompt and photos at that size (the same priceOf the server charges), not a proportion */
    if ((HOSTED_BY_ID[cm.id]?.tokenImage || HOSTED_BY_ID[cm.id]?.mpImage /* FLUX.2: the started megapixels of this shape's size */) && String(qj?.route ?? '').startsWith('comfy-router:') && aspect !== 'Auto') return optionPrice(qj, ownBill, priceOf({ toolId: p.tool.id, rates: {}, quality: '720p', provider: cm.id, tier: qual2 || 'med', imageRes: r, aspect, promptBytes: promptStep, refImages: p.mask ? (p.image ? 1 : 0) : Math.min(refN, maxRefs), count: n }).credits);
    return optionPrice(qj, ownBill, total != null && total > 0 && at ? Math.round((c * total) / at) : c * n); };
  /* the small bar popovers (shared/BarPop.tsx): the count's total and the difference each quality / resolution makes, from the same quote */
  const qLocal: boolean | null = qj ? qj.local === true || placeOfQuote(qj) === 'local' : null;
  const scaledAt = (c: number) => { const at = cell(qual2, imgRes); return total != null && total > 0 && at ? (c * total) / at : c * n; };
  const deltaOf = (c: number | null | undefined): string | null => { const at = cell(qual2, imgRes); if (!c || !at) return null; return priceDelta({ diffCredits: scaledAt(c) - scaledAt(at), own: ownBill, local: qLocal === true }); };
  const cntPrice: string | null = !qj ? null : qj.demo === true ? 'Sample' : unpriced ? 'Price unavailable' : optionPrice(qj, ownBill, total != null ? Math.round((total * n) / (qN.current || n)) : null);
  const cntNote = batchNote({ n, local: !qj || (qLocal && p.image) ? null : qLocal }); /* local batching is for text-to-image graphs only (comfy/plans.ts) */
  const demoReal = qj?.demo === true ? demoRealCredits(qj) : null; /* a sample run: what a real one would cost (list price), scaled to the picked count */
  const cntDemo = qj?.demo === true ? `Sample output, nothing billed${demoReal ? `. A real run ≈ ${fmtUsd((demoReal * n) / (qN.current || n) / 100)}` : ''}` : null;
  /* nothing ready (or the chosen place needs setup) → Generate becomes the next setup step (SetupGenerate: its popover lists every place) */
  const needSetup = setupNeeded(modelOfEngine(p.tool.id, cur?.id), qj, cur?.id, dlIntent); const noPlace = needSetup || (!qj && !!cur && 'defaultRoute' in (cur as any) && (cur as any).defaultRoute == null);
  const keyGate = !!qj && qj.needsKey === true && qj.runnable === false && !needSetup; const pinBlock: string = qj?.pinnedUnavailable === true && qj?.runnable === false ? String(qj.reason ?? qj.unavailableReason ?? qj.error ?? qj.message ?? 'This model is pinned to a local route that isn’t available right now.') : ''; const unpricedBlock: string = unpriced && qj?.runnable === false && !needSetup ? String(qj?.error ?? 'No verified price for this model at this setting, so it can’t run (the quote must equal the charge). Pick another quality or model.') : '';
  /* plain Create's pre-flight (same list and order as a workflow's) */
  const createPf: PreflightProblem[] = recipe ? [] : (() => { const other = p.missing.filter(x => !/prompt/i.test(x));
    const list = preflightProblems({ freeLocal: hasFreeLocal(p.tool.id), prompt: !p.prompt.trim() ? { missing: p.image ? 'Describe the change' : 'Write a prompt' } : null, images: null,
      quote: qj && !(dlIntent && qj.setup?.action === 'download') ? qj : null, modelName: curName ?? null });
    if (other.length && p.prompt.trim()) list.unshift({ code: 'photo_missing', stage: 'inputs', message: missingText(other).replace(/\.$/, ''), fix: { kind: 'choose-photo', label: 'Choose…', args: { slot: '' } } });
    if (pinBlock && !needSetup && !list.some(x => x.code === 'model_cant_run')) { const k = list.findIndex(x => x.stage !== 'inputs'); list.splice(k < 0 ? list.length : k, 0, { code: 'model_cant_run', stage: 'model', message: pinBlock.replace(/\.$/, ''), fix: { kind: 'pick-model', label: 'Pick model…' } }); }
    return list; })(); createPfRef.current = createPf;
  /* a local run's time: learned on this computer → in the price ("Free · Local · ≈ 3–4 min"); before the first run → a line under the composer */
  const etaR = qj?.local === true && !keyGate ? etaRangeOf(qj) : null; const etaL = etaLine(etaR);
  const etaTok = etaL && (etaL.kind === 'learned' || etaL.kind === 'scaled') ? etaL.short.replace(/ · Local$| incl\. model load$/, '') : null;
  const etaFirst = !!etaR && (etaR.calibrating === true || etaR.source === 'first_run');
  const priceLbl = unpriced ? (qj?.notWired ? (qj.notWiredLabel ?? notWiredLabel(qj)) : 'Price unavailable') : total == null ? '' : total === 0 ? (qj?.local === true ? 'Free · local' : 'Free') : total.toLocaleString();
  const [ars, setArs] = useState<Record<string, number>>({}); const rootEl = useRef<HTMLDivElement>(null);
  /* A finished (or failed) result opens in the full-screen viewer (shared/ResultViewer): the result card's data and actions laid out as image + side panel. */
  const viewable = shown.filter(j => !isActive(j)); const { viewId, setViewId, viewOut, viewJob, open, close: closeView, nav: viewNav } = useFeedViewer(viewable, p.onSelect, undefined, !feed.loading);
  /* Item 1: the grid's bottom padding follows the dock's real height (shared/dockFit, the same hook as Video and Audio), so the floating
   * composer never covers a tile at any width, also while its prompt grows the bar upward; a hidden pane (no layout) is never measured. */
  useDockHeight(dock, '.ic.ic2');
  /* Select mode: running tiles can't be picked (they say why); the pick keeps across filters and pages */
  const sel2 = sel;
  /** Use as references: the selected images go to the bar (a picked workflow's slots first, via the same intake as a hand-off). */
  const useAsRefs = async (ids: string[]) => { const fs: File[] = []; for (const id of ids.slice(0, 16)) { const u = sel.get(id)?.url ?? shown.find(j => j.id === id)?.resultUrl; if (!u) continue; try { const f = await urlToFile(u, id); tagHandoff(f, { fromJob: id, output: '0' }); fs.push(f); } catch { /* skip that one */ } }
    if (!fs.length) { toast('Couldn’t load those images. Try again.', 'error'); return; }
    if (recipe) { for (const f of fs) intake([f]); toast(fs.length > 1 ? `Sent ${fs.length} images to ${recipe.name}` : `Sent to ${recipe.name}`); }
    else { const room = maxRefs - refN; addRefs(fs); if (room > 0) toast(fs.length > room ? `Added ${room} of ${fs.length}: this model takes up to ${maxRefs}` : `Added ${fs.length} reference${fs.length > 1 ? 's' : ''}`); }
    stopSelect(); };
  type Tl = ReturnType<typeof tileOf>[number];
  const feedItems = feedSections(shown as (JobState & { compare?: { id?: string } | null })[], tileOf); // a singles row before a compare group gets its own filler (no stretched banner tiles)
  const renderTile = ({ j, url, k, of, multi }: Tl) => { const inp: any = (j as any).input ?? {}; const m = /^(\d+):(\d+)$/.exec(String(inp.aspect ?? inp.aspectRatio ?? '')); const ow: any = url ? ((j as any).outputs ?? []).find((o: any) => o?.url === url) : null; /* the output's own size (server outputs[].width/height) until the image has loaded: no reflow when it lands */ const arHint = (ow?.width > 0 && ow?.height > 0 ? ow.width / ow.height : 0) || (m ? Number(m[1]) / Number(m[2]) : 1); const ar = (url && ars[url]) || arHint; const act = isActive(j) || j.status === 'canceled' /* 4i: the canceled tile is the generating tile, greyed */; const sel = viewId === j.id; const picked = selecting && sel2.has(j.id); const noPick = selecting ? unselectable(j) : null; const cmp = (j as any).compare as { id: string } | undefined; const cmpCap = cmp && k === 0 && !act ? jobCaption(j, ownB) : null;
            const pres = multi ? presentationOf(j as any) : null; const mode = pres ? cardModeOf(pres, ar, multi!.length) : null; const feat = imageWorkflowNameOf(j as any) ?? featureTag(j) /* which workflow made it */; const prompt = typedPromptOf(inp); const cap1 = !multi && !cmpCap && !act && j.status === 'done' ? jobCaption(j, ownB) : null;
            const firstOut = multi?.find(x => x.state === 'done')?.out ?? 0; const nDone = multi ? multi.filter(x => x.state === 'done').length : 0;
            const img = url ? <img className={inp.transparent ? 'alpha-bg' : undefined /* Remove Background: checkerboard behind the cut-out */} src={gridSrc(url, tileMaxH() * clampAr(arHint))} alt="" loading="lazy" decoding="async" onLoad={e => { const im = e.currentTarget; if (im.naturalWidth && im.naturalHeight && !ars[url]) setArs(r => ({ ...r, [url]: im.naturalWidth / im.naturalHeight })); }} /> : null;
            return <FeedCard key={cmp ? `${cmp.id}:${(cmp as any).i}-${k}` : `${j.id}-${k}` /* a set's card keeps its place while its waiting card becomes the job */} job={j} k={k} of={of} ar={ar} active={act} run={<RunTile j={j} cap={multi && pres ? [feat, badgeText(multi, pres)].filter(Boolean).join(' · ') /* "Camera Angles · 3 of 9 angles" in the running tile's top row */ : (cmp as any)?.kind === 'swatch' ? `Swatch ${Number((cmp as any).i) + 1}` : undefined} />} on={sel} selecting={selecting} picked={picked} noPick={noPick}
              className={multi ? `mr-card mr-${pres!.kind}` : ''} testId={`ic-tile-${j.id}`} tag={multi ? null : feat} onOpen={e => open(j.id, multi ? firstOut : k, e.currentTarget)} onTogglePick={() => togglePick(j)}
              media={multi && mode === 'mosaic' && j.status === 'done' ? <ResultMosaic items={multi} pres={pres!} width={tileMaxH() * clampAr(ar)} testId={`mr-mosaic-${j.id}`} /> : img}
              badges={multi && pres && !act ? <CountBadge items={multi} pres={pres} testId={pres.kind === 'layers' ? `ly-count-${j.id}` : `mr-count-${j.id}`} /> : null}
              caption={cmp && (cmp as any).kind === 'swatch' && k === 0 && !act ? <SwatchCaption job={j} /> : cmpCap ? <FeedCaption title={cmpCap.model} parts={[cmpCap.place, cmpCap.price, cmpCap.time]} testId={`cmp-cap-${j.id}`} />
                : multi && !act ? <span className="ic-tile-meta mr-meta" data-testid={`mr-meta-${j.id}`}><b>{feat || 'Create Image'}</b>{prompt && <span>{prompt}</span>}</span>
                : cap1 ? <FeedCaption className="ic-cap" title={prompt || cap1.model || feat || 'Image'} parts={[prompt ? cap1.model : null, cap1.price]} testId={`ic-cap-${j.id}`} /> /* the workflow (chip) and the real model, like the Video tab */ : undefined}>
              {multi && !act && j.status === 'done' && nDone > 1 && <a className="mr-dl" href={`/api/jobs/download.zip?ids=${encodeURIComponent(j.id)}`} download data-testid={`ic-dl-all-${j.id}`} aria-label={`Download all ${nDone} (ZIP)`} {...tip(`Download all ${nDone} (ZIP)`)} onClick={e => e.stopPropagation()}><DownloadIcon size={14} /></a>}
            </FeedCard>; };
  const compareOff: string | null = recipe ? 'Compare models works in plain Create: workflows run their own models. Pick None under Workflow to compare.' : p.mask ? 'Brush Edit runs one model at a time. Remove the mask to compare models.' : p.providers.length < 2 ? 'Only one model offers this here' : null;
  const sideJobs = sideBy ? shown.filter(j => (j as any).compare?.id === sideBy) : [];
  /* Moved off the dock (2026-10-23 toolbar): the first-run time note rides on Generate's tooltip; "<model> is selected because…" on the model chip's */
  const etaNote = !recipe && !noPlace && (etaFirst || (etaTok && qj?.fitNote)) ? [qj?.fitNote, etaFirst ? 'The time shows after your first run' : etaL?.text].filter(Boolean).join(' · ') : '';
  const mem = useMemoryShort(qj); // a heavy local run with memory short right now (shared/FitNote.tsx): said on Generate, never blocked
  const fbNote = recipe ? (wfDef && !wfDef.runs && wfProvider === wfDef.start ? wfDef.note : null) /* the workflow's default can't run here: why, and what runs */ : fbOff ? null : fallbackNoteOf(withQuoteDefaults(p.defaults ?? null, qj)?.defaultFallback ?? null, p.provider); /* B28a: the model quote's fallback first */
  /* Create's edit mask opens in MaskSheet (needs the photo as a File: an attached photo has one, a restored one is fetched) */
  const openCreateMask = async () => { if (!p.image) return; let f: File | undefined = (p.image as any).file; if (!f) { try { f = await urlToFile(p.image.url); } catch { toast('Couldn’t open that photo for painting. Add it again.', 'error'); return; } }
    setCMaskPhoto(f); setPop(''); setMasking(true); };
  const cMaskNow = cMask && p.image && cMask.forUrl === p.image.url ? cMask : null;
  const atList = (k: number) => Array.from({ length: k }, (_, i) => `@image${i + 1}`).join(k > 2 ? ', ' : ' and ').replace(/, (@image\d+)$/, ' and $1');
  /* the old context row's hint lives in the prompt's placeholder now (and the @ list in the photos' labels) */
  const promptPh = recipe ? recipe.prompt.placeholder : p.mask ? 'Describe the change in the painted area' : refN > 1 ? `Describe the change · type @ to mention ${atList(Math.min(refN, 3))}${refN > 3 ? '…' : ''}` : p.image || p.editIntent ? 'Describe the change you want' : 'Describe the scene you imagine';

  /* the model chip's download ring: a queued or running run of this model fetching its files (real % when the job reports bytes) */
  const dlNow = modelDownload(p.jobs as any[], recipe ? wfProvider : cur?.id); const dlLabel = dlNow ? `Downloading files${dlNow.pct != null ? ` · ${dlNow.pct}%` : ''}` : '';
  /* a download you chose (setup popover / pre-flight): Generate's second line says it; the undo is in the model menu */
  const dlSize = recipe ? null : intentSize(qj, dlIntent, cur?.id); const wfDlSize = recipe ? intentSize(wq, wfIntent, wfProvider) : null;
  const curMinNote = !recipe && cur ? minNote(cur) : '';
  /** the model chip's full name: the chip may truncate it, the tooltip never does */
  const mChipName = (() => { const tid = recipe ? recipe.runner.toolId : p.tool.id; const eid = recipe ? wfProvider : cur?.id; const mm = modelOfEngine(tid, eid); const pv: any = recipe ? wfProviders.find(x => x.id === wfProvider) : cur;
    return short(recipe ? (mm ? shownName(mm) : null) ?? recipe.modelInfo?.[wfProvider]?.name ?? pv?.name : curName); })();
  /* ---- "See the exact prompt": the same form the run sends (wfGenerate for a workflow, go → AppTool's submit for Create), photos as counts.
   * The server builds the prompt with the job's own code (POST /api/tools/:id/prompt-peek). ---- */
  const cMode = p.image ? (p.mask && p.canMask ? 'inpaint' : 'edit') : p.editIntent ? 'edit' : 'generate';
  const peekForm: PeekForm | null = recipe ? (draft ? { toolId: recipe.runner.toolId,
      fields: { ...(recipe.prompt.mode !== 'hidden' ? { prompt: draft.prompt, ...exSeedField() } : {}), ...(wfProvider ? { provider: wfProvider } : {}),
        ...Object.fromEntries(recipe.controls.filter(c => !(isMulti && c.field === 'shots')).map(c => [c.field, wfVals[c.field] ?? (c.optional ? '' : String(c.default ?? ''))]).filter(([, v]) => v !== '' && v != null)),
        ...(isMulti ? { shots: JSON.stringify(angleIds) } : {}) },
      files: { ...wfSlots.filter(s => files[s.name]).reduce<Record<string, number>>((m, s) => ({ ...m, [s.sendsAs]: (m[s.sendsAs] ?? 0) + 1 }), {}), ...(isMask && wfMask ? { mask: 1 } : {}) },
      photo: imgSize ?? wfSrc } : null)
    : { toolId: p.tool.id, fields: { types: JSON.stringify([cMode]), prompt: p.prompt, ...(p.provider ? { provider: p.provider } : {}), ...(p.tool.app?.enhance ? { enhance: p.enhance ? '1' : '0' } : {}), ...(p.style ? { style: p.style } : {}), ...params(), ...exSeedField() },
      files: { ...(p.image ? { image: 1 } : {}), ...(p.image && cMode !== 'inpaint' && p.refs?.length ? { refs: p.refs.length } : {}), ...(p.image && cMode === 'inpaint' ? { mask: 1 } : {}) }, photo: null };
  const peekPhotos: string[] = recipe ? wfSlots.filter(s => files[s.name]).map(s => s.label) : p.image ? [p.image, ...(p.refs ?? [])].map((_, i, a) => a.length > 1 ? `Photo ${i + 1}` : 'Photo') : [];
  const peekPlace = pkModel ? (() => { const t = runOnText(pkModel, pkRO.runOn, recipe ? wq : qj); return t.sub ? `${t.main} (${t.sub})` : t.main; })() : '';
  const modelTip = [dlNow ? `${dlLabel}. Runs queue and start once it’s done` : '', fbNote ?? '', curMinNote].filter(Boolean).join(' · ');
  const demoNote = !recipe && qj?.demo === true && typeof qj?.demoMessage === 'string' ? qj.demoMessage : '';
  const presetSet = (k: 'aspect' | 'style') => presetHere && !recipe && presetHere.vals[k] && (k === 'aspect' ? aspect : p.style) === presetHere.vals[k] ? '1' : undefined;
  /* ---- the start of the prompt line (Create bar clean-up 2026-10-23): what goes into this run besides the words ----
   * Create: the attached photos as 44px thumbnails (the first three, then "+N" past four), the mask; a workflow: its labelled
   * slots, the mask, the Fit/Crop chip, "Use as …"; the preset tile first in every mode. Click a photo: the image picker. Delete / Backspace
   * on a focused photo, or its ✕, removes it. A photo that won't load shows a placeholder. */
  const photos = p.image ? [p.image, ...(p.refs ?? [])] : []; const ts = thumbsShown(photos.length);
  const focusLead = (k: number) => requestAnimationFrame(() => { const hs = [...(dock.current?.querySelectorAll<HTMLElement>('.ic-th-hit') ?? [])]; (hs[Math.min(k, hs.length - 1)] ?? p.promptRef.current)?.focus({ preventScroll: true }); });
  const removePhoto = (k: number, focus = false) => { if (k === 0) { p.clearImage(); p.setMask(null); setMasking(false); } else p.removeRef?.(k - 1); if (focus) focusLead(k); };
  const dragPhoto = useSlotReorder((from, to) => p.movePhoto?.(from, to));
  const thumb = (ph: { url: string }, k: number) => { const file: File | undefined = (ph as any).file; const label = `Image ${k + 1}`; const info = meta(ph.url, file);
    return <span key={ph.url} {...(photos.length > 1 && p.movePhoto ? dragPhoto(k) : {})} className={`ic-th${p.mask && k > 0 ? ' off' : ''}${k >= maxRefs ? ' slot-over' : ''}`} data-unused={k >= maxRefs ? '1' : undefined} data-testid={k === 0 ? 'ic-attach-meta' : `ic-ref-extra-${k - 1}`}>
      <button type="button" className={`ic-th-hit${badImg[ph.url] ? ' bad' : ''}`} data-ref-trigger aria-haspopup="dialog" aria-label={`${label}${info ? ` · ${info}` : ''}${p.mask && k > 0 ? ' · not sent with the mask' : ''}. Open preview; Delete removes it`}
        {...tip(p.mask && k > 0 ? `${label} · not sent with inpaint` : `${label}${info ? ` · ${info}` : ''}${refN > 1 ? ` · ${refChipTip(tmCur?.key, 'image', k + 1).replace(/^Photo \d+ · /, '')}` : ''}`)} onClick={e => { photoAnchor.current = e.currentTarget; setPhotoPreview(k); }}
        onKeyDown={e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePhoto(k, true); } }}>
        {badImg[ph.url] ? <ImageIcon size={16} /> : <img src={ph.url} alt="" className="ref" onLoad={onLoadDims(ph.url)} onError={() => setBadImg(m => ({ ...m, [ph.url]: true }))} />}
        {refN > 1 && <b className="ic-att-n" data-testid={`ic-att-n-${k + 1}`}>{k + 1}</b>}</button>
      <button type="button" className="ic-x" aria-label={k === 0 ? 'Remove image' : `Remove image ${k + 1}`} onClick={() => removePhoto(k, true)}><CloseIcon size={10} strokeWidth={2.2} /></button></span>; };
  const lead = <div className="ic-lead" data-testid="ic-lead" data-mode={recipe ? 'workflow' : rigRecipe ? 'rig' : 'create'} role="group" aria-label={recipe ? `${recipe.name} inputs` : 'Photos and references'}>
    {recipe && draft ? <WorkflowInputs recipe={recipe} files={files} setFile={(slot, f) => setSlot(slot, f)} addFile={(slot, f) => addSwatch(slot, f)} onPick={openSlotPicker} picking={refTab ? pickFor : null} onUrl={(slot, u) => { urlToFile(u).then(f => setSlot(slot, f, true)).catch(() => undefined); }} flash={flash?.wf === recipe.id ? flash : null}
        choose={choose ? { url: choose.url, slots: choose.slots.map(n => ({ name: n, label: slotLabel(recipe, n), full: !!files[n] })) } : null} onChoose={n => choose && addSwatch(n, choose.file, true)} onChooseCancel={() => setChoose(null)} disabled={wfBusy} lead={presetChip} extras={slotExtras}
        surface={<>{isMask ? <MaskStrip mask={wfMask} hasPhoto={!!files.image} need={!!wfMissing?.mask} onPaint={() => setMaskOpen(true)} onClear={() => setWfMask(null)} disabled={wfBusy} erase={recipe.id === 'erase'} /> : null}
          {wfFit && imgSize && (shapeOff || prepNow) ? <PrepChip chipRef={prepChipRef} prep={shapeOff ? null : prepNow} aspect={wfFit} shape={shapeName(imgSize.width, imgSize.height)} busy={prepBusy || wfBusy} onFit={() => void applyPrep('fit')} onCrop={openCrop} onUndo={undoPrep} />
            : prepNow ? <PrepChip chipRef={prepChipRef} prep={prepNow} aspect={prepNow.aspect} shape="" busy={prepBusy || wfBusy} onFit={() => void applyPrep('fit')} onCrop={openCrop} onUndo={undoPrep} /> : null}</>} />
    : <>{presetChip}
      {photos.length > 0 && <div className="ic-attach ic-attach-in" data-testid="ic-attach">{photos.slice(0, ts.show).map(thumb)}
        <MoreFiles hidden={ts.more} watch={dock} testId="ic-thumbs-more" summary={refN > maxRefs ? `${refN - maxRefs} not used` : undefined} action={refN > maxRefs && maxRefs > 0 ? { label: `Remove the ${refN - maxRefs} not used`, onClick: () => { for (let i = photos.length - 1; i >= maxRefs; i--) removePhoto(i); } } : null} onRemove={f => removePhoto(f.idx)} onMove={photos.length > 1 && p.movePhoto ? (_g, a, b) => p.movePhoto!(a, b) : undefined}
          items={photos.map((ph, k): TrayFile => ({ key: ph.url, group: 'photos', idx: k, kind: 'image', url: ph.url, name: (ph as any).file?.name ?? `Image ${k + 1}`, label: refN > 1 ? `Picture ${k + 1} · @image${k + 1}` : 'Picture', off: k >= maxRefs || (!!p.mask && k > 0) }))} />
        {/* the dashed "+": the model's real limit in its tooltip, a badge only near it, disabled at it (shared/AddTile; no counter text on the bar) */}
        {maxRefs > 0 && <AddTile used={refN} max={maxRefs} testId="ic-add-tile" onAdd={() => { replaceIndex.current = null; setPop(''); setRefTab('Uploads'); }} />}
        {p.canMask && sup.draw !== false /* only models with a mask route (Brush Edit) */ && <>
          {p.mask && cMaskNow && <button type="button" className="ic-mask-t" data-testid="ic-mask-thumb" aria-label={`Mask: ${Math.max(1, Math.round(cMaskNow.cover * 100))}% of the photo. Edit mask`} {...tip(`Mask · ${Math.max(1, Math.round(cMaskNow.cover * 100))}% of the photo. Click to edit`)} onClick={openCreateMask}><img src={cMaskNow.preview} alt="" /></button>}
          <button type="button" className={`ic-chip ic-mask-b ${masking || p.mask ? 'on' : ''}`} data-testid="ic-mask-chip" aria-haspopup="dialog" {...tip(p.mask ? 'Brush Edit: only the painted area changes. Click to edit the mask' : 'Paint an area: only it changes')} onClick={openCreateMask}>{p.mask ? 'Mask ✓' : 'Mask'}</button></>}</div>}
      </>}
    {!recipe && photos.length > 0 && <>{refN > maxRefs && maxRefs > 0 && !ts.more /* with "+N" it sits in the tray */ && <button type="button" className="lk-btn" data-testid="ic-remove-extra-photos" onClick={() => { for (let i = photos.length - 1; i >= maxRefs; i--) removePhoto(i); }}>Remove extras</button>}</>}
    {photoPreview != null && (() => { const ph = photos[photoPreview] as {url:string;file?:File} | undefined; return ph?.file ? <SlotPreview open anchor={photoAnchor} onClose={() => setPhotoPreview(null)} item={{file:ph.file,url:ph.url}} kind="image" title={`Picture ${photoPreview + 1}`} watch={dock} testId="ic-photo-preview" warn={photoPreview >= maxRefs ? `Not sent: this model takes up to ${maxRefs} pictures.` : null} onRemove={() => removePhoto(photoPreview)} onReplace={p.replacePhoto ? () => { replaceIndex.current = photoPreview; file.current?.click(); } : undefined} /> : null; })()}
  </div>;
  /* Settings popover: only the Create controls folded off the bar (the fit above says which), each once. Enhance here is the same
   * "enhance when I generate" switch as the sparkle chip; "Rewrite my prompt now" stays in the sparkle's own small panel. */
  const fo = (k: string) => folded.includes(k);
  const enhCan = !!p.tool.app?.enhance;
  const arOpts = aspectOpts(aspects); const arGroups = aspectGroups(arOpts); /* the model's own list, in its order (Auto first); long lists grouped Square · Wide | Tall */
  const setBody = <>
    {fo('aspect') && followsPhoto && <PopSection label="Size"><PopNote testId="ic-set-follows">Follows your photo{resList.length === 1 ? ` · ${imgRes || resList[0]}` : ''}</PopNote></PopSection>}
    {fo('aspect') && !followsPhoto && showAspect && (aspects.length > 1
      ? <PopSection label="Aspect ratio" aside={arLabel(aspect)}><Segmented label="Aspect ratio" testId="ic-set-aspect" cols={segCols(arOpts.length)} value={aspect} onChange={setAspect} onCommit={() => setPop('')}
          options={arOpts.map(([a, , w, h]) => ({ value: a, label: arLabel(a), title: arLabel(a), icon: a === 'Auto' ? <AspectIcon size={16} className="ic-auto" /> : <Shape w={w} h={h} /> }))} /></PopSection>
      : <PopSection label="Aspect ratio" aside={arLabel(aspect)}><PopNote testId="ic-set-aspect">The only one this model offers</PopNote></PopSection>)}
    {fo('quality') && showQual && (tiers.length > 1
      ? <PopSection label={qWord} aside={qName(qual2)}><Segmented label={qWord} testId="ic-set-quality" value={qual2} onChange={pickTier} onCommit={() => setPop('')}
          options={tiers.map(k => { const mv = tierMove(k); const off = cell(k, imgRes) === null && !mv; return { value: k, label: qName(k), disabled: off, title: off ? 'Not available at this resolution' : undefined, hint: off ? 'Not at this size' : mv ? `Switches to ${mv}` : TDESC[k], aside: off || k === qual2 ? undefined : deltaOf(cell(k, mv ?? imgRes)) ?? undefined, testId: `ic-set-quality-${k}` }; })} /></PopSection>
      : <PopSection label={qWord} aside={qName(qual2)}><PopNote testId="ic-set-quality">The only one this model offers</PopNote></PopSection>)}
    {fo('res') && showRes && (resList.length > 1
      ? <PopSection label="Resolution" aside={imgRes}><Segmented label="Resolution" testId="ic-set-res" value={imgRes} onChange={setImgRes} onCommit={() => setPop('')}
          options={resList.map(r => { const off = cell(qual2, r) === null; return { value: r, label: r, disabled: off, hint: off ? resOffWhy() : RDESC[r], aside: off || r === imgRes ? undefined : deltaOf(cell(qual2, r)) ?? undefined, testId: `ic-set-res-${r}` }; })} /></PopSection>
      : <PopSection label="Resolution" aside={imgRes}><PopNote testId="ic-set-res">The only one this model offers</PopNote></PopSection>)}
    {fo('enh') && <PopSection label="Prompt enhancer">{enhCan ? <PopSwitch rowTestId="ic-set-enhance" label="Enhance when I generate" hint="Adds detail as it runs; your text stays as you wrote it" on={p.enhance} onChange={p.setEnhance} />
      : <PopRow role="menuitem" testId="ic-set-rewrite" label="Rewrite my prompt…" hint="See the added detail first, then keep or undo it" onClick={() => setPop('enh')} />}</PopSection>}
    {extras && <PopSection label="Model options" testId="ic-set-extras">
      {extras.negativePrompt && <label className="ic-neg" data-testid="ic-set-neg"><span className="ic-neg-l">Leave out</span>
        <textarea rows={2} maxLength={NEG_PROMPT_MAX} placeholder="Things you don’t want in the image (e.g. text, blur, extra fingers)" value={negPrompt} onChange={e => setNegPrompt(e.target.value)} aria-label="Negative prompt: things to leave out" /></label>}
      {extras.promptRewrite && <PopSwitch rowTestId="ic-set-model-rewrite" label="Let the model rewrite my prompt" hint={extras.promptRewriteDefault
        ? (rewrite ? `${curName ?? 'The model'} adds detail to your prompt before drawing (its default)` : `Off: ${curName ?? 'the model'} gets your prompt exactly as written`)
        : `Off: ${curName ?? 'the model'} gets your prompt exactly as written`} on={rewrite} onChange={setRewrite} />}
    </PopSection>}
    {mOpts && <ModelOptionsGroup spec={mOpts} values={optVals} onChange={(k, v) => setOptVals(o => ({ ...o, [k]: v }))} testId="ic-set-opts" />}
  </>;
  /** the sparkle's small panel opens from the sparkle, or from Settings / the ⋯ menu when the sparkle is folded away */
  const enhAt = { get current() { for (const r of [enhRef, aR.set, overRef]) { const e = r.current; if (e && e.getClientRects().length) return e; } return enhRef.current; } } as React.RefObject<HTMLElement | null>;
  return <div className="ic ic2" ref={rootEl}>
    <div className="ic-stage">
      <div className="ic-work ic-work2" data-testid="ic-work">
        <FeedGallery title="Image" st={fs} count={upOn ? up.items.length : shown.length} emptyText={emptyTextFor(filt, pj.pid, SCOPE)} override={upOn ? <UploadsFeed up={up} media="image" size={filt.size} idPre="ic" onReference={u => void refFromUpload(u)} /> : undefined} toolbar={selecting ? <SelectBar sel={sel2} setSel={setSel} total={feed.total} onExit={stopSelect} selectAll={selectAll} allLoading={allBusy} projects={pj.list} currentProject={pj.pid} patch={feed.patch} unpatch={feed.unpatch} refresh={feed.refresh}
              useAsRefs={useAsRefs} refsTarget={recipe ? recipe.name : 'Create'} onTrashed={ids => { if (viewId && ids.includes(viewId)) setViewId(null); }} />
            : <FeedToolbar f={filt} setF={setFilt} groups={IMAGE_FEED_GROUPS} noun="images" total={upOn ? up.total : feed.total} failed={upOn ? null : feed.failed} loading={upOn ? up.loading : feed.loading} pj={pj} selecting={selecting} onSelect={() => selecting ? stopSelect() : setSelecting(true)}
              compareOff={compareOff} onCompare={() => setCmpOpen(o => !o)} compareRef={cmpRef} live={<QueueLine className="ic-gal-live" />} />}>
          {feedItems.map(it => it.group
            ? <div key={`g-${it.group}`} className="cmp-g" data-testid={`cmp-group-${it.group}`}><CompareGroupHead jobs={it.jobs} onSide={() => setSideBy(it.group!)} /><div className="cmp-g-row">{it.tiles.map(renderTile)}<i className="ic-jfill" aria-hidden /></div></div>
            : [...it.tiles.map(renderTile), it.fill && <i key={`f-${it.jobs[0].id}`} className="ic-jfill" aria-hidden />])}</FeedGallery>
        {viewJob && (viewJob.status === 'done' && (viewJob.resultUrl || (viewJob as any).outputs?.length)
          ? <ResultView variant="viewer" job={viewJob} out={viewId === viewJob.id ? viewOut : 0} beforeUrl={viewJob.resultUrl ?? ''} title="Your result" onClose={closeView} {...viewNav}
            onReference={(url, out) => refFromViewer(url, viewJob, out)} referenceTip={recipe ? `Use it in ${recipe.name}` : 'Add it to your prompt as a reference image'} />
          : <FailedViewer job={viewJob} model={(viewJob as any).modelName ?? (viewJob as any).model} onClose={closeView} {...viewNav} />)}
      </div>
    </div>
    <div className={`ic-dock${drag ? ' ic-drag' : ''}`} ref={dock} data-testid="ic-dock" data-has-route-err={(p.issues ?? []).some((i: any) => i?.code === 'route_not_runnable') ? '1' : undefined} onDragOver={e => { if (draggable(e.dataTransfer)) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)} onDrop={e => { if (!draggable(e.dataTransfer)) return; e.preventDefault(); setDrag(false); void dropOnBar(e.dataTransfer); }}>
      {/* Create's edit mask: the same full sheet as Brush Edit (fits the viewport, zoom / pan; full screen on a phone). It hands back what
        * create-image inpaint takes: a black/white PNG data URL at the photo's size (white = repaint); reopening edits the same mask. */}
      {masking && p.image && cMaskPhoto && <MaskSheet photo={p.image.url} photoFile={cMaskPhoto} initial={p.mask} onCancel={() => setMasking(false)}
        onDone={m => { setMasking(false); if (!m) { p.setMask(null); setCMask(null); toast('Nothing painted, so there is no mask yet'); return; }
          const r = new FileReader(); r.onload = () => { p.setMask(String(r.result)); setCMask({ preview: m.preview, cover: m.cover, forUrl: p.image?.url ?? '' }); }; r.readAsDataURL(m.file); }} />}
      {/* desktop: the reference's two-layer shape (a 4px outer frame around a 12px inner panel: left column, cards, Generate);
       * phones: both wrappers are display:contents, so the phone composer lays out exactly as before.
       * Create bar clean-up (2026-10-23): two rows, the same height in every mode; only a longer prompt grows it upward (2 → 8 lines). The prompt line starts with the photos (thumbnails,
       * a workflow's labelled slots, the mask, the Fit/Crop chip, the preset tile); the chip row holds the settings and a workflow's groups.
       * No notes around the bar: each state sits on the thing it's about (the model chip, Generate, the pre-flight list, the run's card). */}
      <div className="ic-frame"><div className="ic-panel">
      <div className="ic-main">
        {maskOpen && isMask && files.image && <MaskSheet photo={files.image.url} photoFile={files.image.file} initial={wfMask?.url ?? null} onCancel={() => setMaskOpen(false)} {...(recipe.id === 'erase' ? { title: 'Paint what to erase', sub: 'Cover the object and its shadow, a little past the edges. It disappears and the background is filled in.' } : {})}
          onDone={m => { setMaskOpen(false); setWfMask(m); if (!m) toast('Nothing painted, so there is no mask yet'); }} />}
        {upEx && <UpscaleExamples model={wfProvider} modelName={upName(wfProviders.find(p => p.id === wfProvider))} onClose={() => setUpEx(false)} onTry={f => { setSlot('image', f, true); if ((upInfo?.factorsByProvider[wfProvider] ?? []).includes(4)) setDraft(d => ({ ...d, vals: { ...d.vals, scale: '4' } })); }} />}
        <div className="ic-prow" data-testid="ic-prow">
        {lead}
        {recipe?.prompt.mode === 'hidden' && <p className="ic-noprompt" data-testid="ic-noprompt">No prompt needed: {recipe.name} works from your photo and its settings.</p>}
        {subjOn && sParts && presetHere && (() => { const det = sParts.details != null; const ph = det ? 'Add details (optional)' : sParts.hint;
          const field = <input ref={subjRef} type="text" className={`ic-subj${det ? ' ic-subj-det' : ''}`} data-testid="ic-subject" aria-label={det ? 'Your details, added to the look’s prompt (optional)' : `Subject (empty uses “${sParts.hint}”)`} value={presetHere.subject} placeholder={ph} size={Math.max(10, Math.min(36, (presetHere.subject || ph).length + 2))}
            onChange={e => { const v = e.target.value; setPresetOn(o => o && { ...o, subject: v }); setPromptNow(fillSubject(sParts, v)); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !e.repeat) { e.preventDefault(); const b = generateFor(e.currentTarget); if (b && !b.disabled) b.click(); } }} />;
          return <div className="ic-subj-row" data-testid="ic-subject-row" data-kind={det ? 'details' : 'subject'}>
          {det ? <><span className="ic-subj-rest" {...tip(sParts.before)}>{sParts.before}</span>{field}</> : <>
          {sParts.before.trim() && <span className="ic-subj-rest ic-subj-pre">{sParts.before.trim()}</span>}
          {field}
          <span className="ic-subj-rest" {...tip(sParts.after.trim() || null)}>{sParts.after.trim()}</span></>}
          <button type="button" className="ic-subj-edit" data-testid="ic-subject-edit" onClick={() => { setPresetOn(o => o && { ...o, full: true }); requestAnimationFrame(() => { const el = p.promptRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }); }}>edit full prompt</button></div>; })()}
        <textarea data-enter-submits="" ref={p.promptRef} id="app-prompt" className="ic-prompt prompt-field" rows={2} style={recipe?.prompt.mode === 'hidden' || subjOn ? { display: 'none' } : undefined} aria-hidden={recipe?.prompt.mode === 'hidden' || subjOn || undefined} aria-label="Prompt" placeholder={promptPh} value={promptNow} onChange={e => { setPromptNow(e.target.value); if (!recipe) at.sync(e.target.value, e.target.selectionStart); }} onKeyDown={at.onKeyDown} onBlur={() => setTimeout(at.close, 120)} aria-autocomplete={recipe ? undefined : 'list'} aria-expanded={recipe ? undefined : at.open} /* Enter generates, Shift+Enter adds a line: shared/enterSubmit (an open @ picker uses Enter first) */ />{at.menu}
        <MentionLayer taRef={p.promptRef} value={promptNow} counts={{ image: p.image ? 1 + (p.refs?.length ?? 0) : 0, video: 0, audio: 0 }} /></div>
        <SwitchNote note={swNote.note} testId="ic-switch-note" />
        <LeftNote text={left} onClose={() => setLeft('')} testId="ic-not-added" />
        <div className="ic-chiprow"><div ref={chipsRef} className="ic-chips" data-extras={extras || mOpts ? '1' : undefined}>
          <span className="ic-fixed" data-testid="ic-chips-fixed">{/* the reference keeps [+] and the model outside the scroll track (sticky on desktop; phones: display:contents) */}
          {(() => { const r = recipe ?? rigWf; /* the shared chip (shared/WorkflowChip.tsx), also Video's, Audio's and 3D's */
            return <WorkflowChip name={r?.name ?? 'Create'} icon={<WfIcon name={r?.icon ?? 'create'} />} title={r ? `${r.name}: ${r.tagline}. Change workflow` : 'Workflows: relight, swap a face and more'} picked={!!r} backTo="Create"
              open={pop === 'wf'} chipRef={wfChipRef} onOpen={() => setPop(pop === 'wf' ? '' : 'wf')} onClear={() => { setWf(''); setPop(''); }} />; })()}
          {!recipe && canRef && <span className="ic-pair">
          {canRef && <button type="button" className="ic-chip ic-sq" aria-label="References" {...tip(p.mask ? 'Brush Edit sends the first photo only' : refN ? `${refN} of ${maxRefs} photo${maxRefs > 1 ? 's' : ''}` : 'Add a photo to edit it')} data-ref-trigger aria-expanded={refTab === 'Uploads'} data-testid="ic-ref-count" data-n={refN} onClick={() => { replaceIndex.current = null; setPop(''); setRefTab(refTab === 'Uploads' ? null : 'Uploads'); }}><svg className="ic-pi" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>}
          </span>}
          <input ref={file} type="file" accept={IMAGE_ACCEPT} multiple={maxRefs > 1 && !pickFor && replaceIndex.current == null} hidden data-testid="ic-file" onChange={e => { const f = e.target.files; if (f?.length) { const ri = replaceIndex.current; replaceIndex.current = null; if (ri != null && p.replacePhoto) { if (fileFits('image', f[0])) p.replacePhoto(ri, f[0]); else toast(wrongTypeText(f[0].name, ['image']), 'error'); } else if (pickFor && recipe) setSlot(pickFor, f[0], true); else void addRefs([...f]); setRefTab(null); } e.currentTarget.value = ''; }} />
          <button ref={aR.model} type="button" className={`ic-chip ic-model ${pop === 'model' ? 'on' : ''}`} aria-haspopup="listbox" aria-expanded={pop === 'model'} data-testid="ic-model-chip" data-fallback-note={fbNote || undefined} data-downloading={dlNow ? (dlNow.pct ?? 'busy') : undefined} {...tip(pop === 'model' ? null : [mChipName + ((recipe ? wfKind : cKind) ? ` · ${PICK_LABEL[(recipe ? wfKind : cKind)!]}` : ''), modelTip].filter(Boolean).join(' · ') || null)} onClick={() => setPop(pop === 'model' ? '' : 'model')}>{(() => { const tid = recipe ? recipe.runner.toolId : p.tool.id; const eid = recipe ? wfProvider : cur?.id; const mm = modelOfEngine(tid, eid); const pv: any = recipe ? wfProviders.find(x => x.id === wfProvider) : cur;
            return <><MakerTile className="ic-dot" medium="image" maker={mm?.maker ?? (pv as any)?.maker} makerName={mm?.makerName ?? (pv as any)?.makerName} fallback={pv?.family || pv?.name} /><span className="ic-mname">{short(recipe ? (mm ? shownName(mm) : null) ?? recipe.modelInfo?.[wfProvider]?.name ?? pv?.name : curName)}</span>{(() => { const k = recipe ? wfKind : cKind; return k ? <span className="ic-mpick" data-testid="ic-model-pick" data-kind={k}>{` · ${PICK_LABEL[k]}`}</span> : null; })()}</>; })()}{dlNow && <DlRing pct={dlNow.pct} label={dlLabel} />}<svg className="ic-caret" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          </span>
          {recipe && draft && <WorkflowControls recipe={recipe} files={files} vals={wfVals} setVal={(k, v) => setDraft(d => ({ ...d, vals: { ...d.vals, [k]: v } }))} provider={wfProvider} watch={dock} mode={wfMode} upscale={upInfo ? { info: upInfo, models: wfProviders, src: wfSrc, onExamples: () => setUpEx(true) } : null}
            overRef={overRef} panels={isMulti ? { [multiG]: <AnglesPanel r={recipe} ids={angleIds} set={ids => setDraft(d => ({ ...d, vals: { ...d.vals, shots: JSON.stringify(ids) } }))} each={angleEach} /> }
              : recipe.groups.some(g => g.id === 'layout') ? { layout: <LayoutPanel r={recipe} value={wfVals.layout ?? ''} set={v => setDraft(d => ({ ...d, vals: { ...d.vals, layout: v } }))} /> } : undefined}
            summaries={isMulti ? { [multiG]: anglesSummary(recipe, angleIds) } : undefined} openGroup={openGroup}
            after={isMulti && angleIds.length && angleEach ? <span className="ic-chip ic-static wf-each" data-testid="wf-angles-each">{angleEach}</span> : recipe.id === 'remove-bg' && ptAlpha ? <span className="ic-chip ic-static wf-pt-note" data-testid="wf-pt-note" {...tip('This photo already has a transparent background; running it again may trim the edges more.')}>Already transparent</span> : null} />}
          {rigRecipe && <RigStrip recipe={rigRecipe} rig={rig} setRig={setRig} watch={dock} overRef={overRef} />}
          {seedEl && <span className="ic-seed wf-fold" {...fitPri('low')} data-testid="ic-seed">{seedEl}</span>}
          {recipe ? null : followsPhoto ? <span className="ic-chip ic-static ic-fold ic-follows" data-fold="aspect" data-testid="ic-follows-photo" {...tip(`${ed!.note}. Edits keep your photo's shape.`)}><AspectIcon size={16} className="ic-auto" />Follows your photo{resList.length === 1 ? ` · ${imgRes || resList[0]}` : ''}</span>
          : showAspect && aspects.length === 1 ? <span className="ic-chip ic-static ic-fold" data-fold="aspect" data-testid="ic-aspect-static" {...tip('The only aspect ratio this model offers')}>{aspect === 'Auto' ? <AspectIcon size={16} className="ic-auto" /> : <Shape w={shapeOf(aspect)[0]} h={shapeOf(aspect)[1]} />}{arLabel(aspect)}</span> : showAspect && <button ref={aR.aspect} data-fold="aspect" data-preset={presetSet('aspect')} aria-expanded={pop === 'aspect'} type="button" className={`ic-chip ic-fold ${pop === 'aspect' ? 'on' : ''}`} aria-haspopup="listbox" {...tip(ed?.allowAuto && aspect === 'Auto' ? 'Match photo: the result keeps your photo’s shape' : null)} onClick={() => setPop(pop === 'aspect' ? '' : 'aspect')}>{aspect === 'Auto' ? <AspectIcon size={16} className="ic-auto" /> : <Shape w={shapeOf(aspect)[0]} h={shapeOf(aspect)[1]} />}{arLabel(aspect)}</button>}
          {!recipe && (showQual && tiers.length === 1 ? <span className="ic-chip ic-static ic-fold" data-fold="quality" data-testid="ic-quality-static" {...tip('The only quality tier this model offers')}><QualityIcon size={16} />{qName(qual2)}</span> : showQual && <button ref={aR.quality} data-fold="quality" aria-expanded={pop === 'quality'} type="button" className={`ic-chip ic-fold ${pop === 'quality' ? 'on' : ''}`} aria-haspopup="listbox" onClick={() => setPop(pop === 'quality' ? '' : 'quality')}><QualityIcon size={16} />{qName(qual2)}</button>)}
          {!recipe && showRes && !(followsPhoto && resList.length === 1) && (resList.length === 1 ? <span className="ic-chip ic-static ic-fold" data-fold="res" data-testid="ic-res-static" {...tip(unv.includes('resolutions') ? 'The only resolution offered; not yet checked on this model' : 'The only resolution this model offers')}><ResolutionIcon size={16} />{imgRes}</span> : <button ref={aR.res} data-fold="res" aria-expanded={pop === 'res'} type="button" className={`ic-chip ic-fold ${pop === 'res' ? 'on' : ''}`} aria-haspopup="listbox" {...tip(unv.includes('resolutions') ? 'Resolutions not yet checked on this model' : null)} onClick={() => setPop(pop === 'res' ? '' : 'res')}><ResolutionIcon size={16} />{imgRes}</button>)}
          {!recipe && maxN > 1 && <button ref={aR.count} type="button" className={`ic-chip ic-cnt ${pop === 'count' ? 'on' : ''}`} aria-haspopup="dialog" aria-expanded={pop === 'count'} aria-label={`Images per run: ${n} of ${maxN}`} {...tip(pop === 'count' ? null : `Images per run: ${n} of ${maxN}`)} data-testid="ic-count" data-n={n} onClick={() => setPop(pop === 'count' ? '' : 'count')}><ImageStackIcon size={16} /><b>{n}×</b></button>}
          {/* Style picker removed (user, 2026-10-23): styles overlapped presets/looks; the style param still works for old jobs, Recreate and the API */}
          {!recipe && (() => { const can = !!p.tool.app?.enhance; const on = can && p.enhance; /* icon-only sparkle toggle: a click turns Enhance on/off; right-click or a long press opens the small panel (switch + Rewrite my prompt now). Without the on-run enhancer the click opens that panel. */
            return <button ref={enhRef} type="button" className={`ic-chip ic-sq ic-enh-one${on ? ' on' : ''}${pop === 'enh' ? ' open' : ''}`} data-testid="ic-enhance" data-fold="enh" aria-label={can ? 'Enhance prompt' : 'Rewrite my prompt'} aria-pressed={can ? on : undefined} aria-haspopup={can ? undefined : 'dialog'} aria-expanded={can ? undefined : pop === 'enh'} {...tip(can ? `Enhance prompt: ${on ? 'On' : 'Off'} · right-click for options` : 'Rewrite my prompt with more detail')}
              onClick={() => { if (enhLong.current) { enhLong.current = false; return; } if (can) p.setEnhance(!p.enhance); else setPop(pop === 'enh' ? '' : 'enh'); }}
              onContextMenu={e => { e.preventDefault(); setPop(pop === 'enh' ? '' : 'enh'); }}
              onPointerDown={e => { if (e.pointerType === 'mouse') return; clearTimeout(enhT.current); enhT.current = window.setTimeout(() => { enhLong.current = true; setPop('enh'); }, 450); }} onPointerUp={() => clearTimeout(enhT.current)} onPointerLeave={() => clearTimeout(enhT.current)}><SparkleIcon size={16} /></button>; })()}
          {/* Item 3: on a phone the settings fold behind one button (as the reference does), so no chip is ever cut off */}
          {!recipe && (showAspect || showQual || showRes || !!p.tool.app?.enhance || !!extras || !!mOpts) && <button ref={aR.set} type="button" className={`ic-chip ic-sq ic-set ${pop === 'set' ? 'on' : ''}`} aria-haspopup="dialog" aria-expanded={pop === 'set'} aria-label={`Settings: ${[fo('aspect') && showAspect ? arLabel(aspect) : '', fo('quality') && showQual ? qName(qual2) : '', fo('res') && showRes ? imgRes : '', fo('enh') ? (enhCan ? `Enhance ${p.enhance ? 'on' : 'off'}` : 'Rewrite my prompt') : '', extras ? 'model options' : '', mOpts ? mOpts.label.toLowerCase() : ''].filter(Boolean).join(', ')}`} {...tip(pop === 'set' ? null : 'Settings')} data-testid="ic-settings" data-dot={Object.keys(optionFields(mOpts, optVals)).length ? '1' : undefined} onClick={() => setPop(pop === 'set' ? '' : 'set')}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3 4h6M12 4h1M3 12h1M7 12h6M3 8h3M9 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="10.5" cy="4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4"/><circle cx="5.5" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4"/><circle cx="7.5" cy="8" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>{fo('count') && n > 1 && <small className="ic-set-n">{n}</small>}</button>}
          {/* the ⋯ menu: whatever still doesn't fit (shown only while something is folded into it) */}
          <button ref={overRef} type="button" className={`ic-chip ic-sq ic-over${pop === 'over' ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={pop === 'over'} aria-label="More settings" {...tip(pop === 'over' ? null : 'More settings')} data-testid="ic-over" onClick={openOver}><MoreIcon size={16} /></button>
        </div>
          {/* the place: outside the scrolling chips, next to Generate, one short word that never truncates (a needed step is its dot) */}
          {recipe ? (() => { const m = modelOfEngine(recipe.runner.toolId, wfProvider); return m ? <RunOnChip compact toolId={recipe.runner.toolId} model={m} engine={wfProvider} quote={wq} watch={dock} /> : null; })() : tmCur && <RunOnChip compact toolId={p.tool.id} model={tmCur} engine={cur?.id} quote={qj} watch={dock} />}
          {!recipe ? <BrandChip toolId={p.tool.id} watch={dock} /> : BRAND_OWN_WORDS.has(recipe.runner.toolId) ? <BrandChip toolId={recipe.runner.toolId} watch={dock} /> : null /* Brand Kit: "Brand: <name>" (Create Image; Ad Pack, which words the brand and adds its logo itself; other workflows compose their own prompt) */}
          <PromptPeek form={peekForm} place={peekPlace} photos={peekPhotos} watch={dock} />
        </div>
      </div>
      {recipe ? <DockGenerate toolId={recipe.runner.toolId} engine={wfProvider} quote={nSw > 1 ? timesQuote(wq, nSw) : wq /* Material Swap: the price of every swatch's run */} label={isMulti ? anglesLabel(angleIds.length, recipe) : batchLabel(recipe.generateLabel, nSw)} busy={wfBusy} disabled={!runTool} problems={wfPf} missing={wfMissing?.missing ?? null}
          pfOpen={pfOpen} genRef={genRef} onClick={wfGenerate} intent={wfIntent} dlSize={wfDlSize} workflowId={recipe.id} /> /* shared/DockGenerate.tsx (also the Canvas bar's) */
      : needSetup && !createPf.some(x => x.stage === 'inputs' || x.stage === 'model') ? <SetupGenerate toolId={p.tool.id} model={modelOfEngine(p.tool.id, cur?.id)} engine={cur?.id} quote={qj} className="ic-gen gen-btn gen-dock btn btn-primary" testId="ic-generate" priceTestId="ic-price" />
      : noPlace ? <NoPlaceGenerate testId="ic-generate" priceTestId="ic-price" />
      : <button ref={genRef} type="button" className={`ic-gen gen-btn gen-dock btn btn-primary${!p.ready || createPf.length ? ' gen-wait' : ''}`} data-testid="ic-generate" data-problems={createPf.length || undefined} disabled={p.busy || !!gs.block || gs.submitting} aria-disabled={!p.ready || createPf.length > 0 || undefined}
          aria-haspopup={createPf.length ? 'dialog' : undefined} aria-expanded={createPf.length ? pfOpen : undefined} onClick={e => { if (createPf.length) { setPfOpen(o => !o); return; } if (!p.ready) { if (!p.prompt.trim()) nudgeMissing(e.currentTarget, p.promptRef.current); else { setDropErr(missingText(p.missing)); nudgeMissing(e.currentTarget); } return; } go(); }} data-mem={mem ? 'short' : undefined} title={keyGate ? 'Needs a provider key' : gs.block || (p.missing.length ? missingText(p.missing) : '') || [mem ? `${mem.text} Or pick Comfy Cloud in the run menu.` : '', demoNote, etaNote].filter(Boolean).join(' · ') || undefined} data-eta-note={etaNote || undefined}><span className="gen-l">{p.busy || gs.submitting ? <i className="as-spin" aria-hidden /> : null}{fid === 'edit-image' && p.image ? 'Edit' : 'Generate'}</span><GenPrice compact testId="ic-price" q={qj} demo={!keyGate && !unpriced && qj?.demo === true} text={gs.block ? (gs.offline ? 'Offline' : 'Queue full') : dlSize && !keyGate ? intentLine(dlSize) : !keyGate && unpriced ? priceLbl : mem ? `Free · only ${gbOf(mem.freeGB * 2 ** 30)} free now` : !keyGate && total === 0 && etaTok ? `Free · ${etaTok.replace(/^≈ /, '~')}` /* the dock's Generate is narrow: the time replaces 'Local' (the line below names the place) */ : null} free={!keyGate && total === 0} credits={keyGate ? null : total} title={unpriced ? (qj?.error ?? 'No verified price for this setting') : !keyGate && total === 0 && qj?.local === true ? `Free · on your computer${etaL ? ` · ${etaL.text}. ${etaL.title}` : ''}` : undefined} /></button>}
      </div></div>
      {recipe ? <ModelMenu open={pop === 'model'} anchor={aR.model} watch={dock} gap={4} onClose={closePop} placement="top" testId="ic-pop-model" toolId={recipe.runner.toolId} value={wfProvider} quote={wq}
        items={[...wfProviders.map(x => ({ id: x.id, name: x.name, p: x, tag: recipe.prep?.[wfMode]?.[x.id]?.note /* honest: this model runs on your photo fitted to the shape */
            ?? (upInfo ? upTag(upInfo, x.id) : undefined) /* Upscale: its factors (the shared menu, 2026-10-26; the old look-alike list is gone) */ ?? (recipe.modelInfo?.[x.id]?.workflow?.source === 'official' ? 'Official template' : undefined) })),
          ...wfOff.filter(o => !wfModels.includes(o.id)).map(o => ({ id: o.id, name: o.p.name, p: o.p, off: o.reason, last: true }))]} lastLabel={wfOffLabel} onPick={(id, fit) => { setDraft(d => ({ ...d, provider: id, pickedBy: 'user' })); setPop(''); swNote.show(fit?.note); }}
        defaultId={wfDef?.id} defaultWhy={wfDef?.why} defaultReason={wfDef && !wfDef.runs ? wfDef.reason : wfDef?.id && !wfModels.includes(wfDef.id) ? wfOff.find(o => o.id === wfDef.id)?.reason ?? null : null}
        onReset={wfDef?.start && wfProvider !== startModel(null, wfModels, wfDef) ? () => setDraft(d => ({ ...d, provider: '', pickedBy: undefined })) : null}
        supports={<><DownloadIntentRow engine={wfProvider} quote={wq} /><WorkflowCredit recipe={recipe} provider={wfProvider} mode={wfMode} scale={draft?.vals.scale} upscale={upInfo ? { info: upInfo, models: wfProviders, src: wfSrc, onExamples: () => setUpEx(true) } : null} /></>} />
      : <ModelMenu open={pop === 'model'} anchor={aR.model} watch={dock} gap={4} onClose={closePop} placement="top" testId="ic-pop-model" toolId={p.tool.id} value={p.provider} quote={qj}
        items={[...p.providers.map(x => ({ id: x.id, name: x.name, p: x, off: verBlock(x) || null, tag: editTagOf(x.id).label })),
          ...(p.image && !p.mask && p.allProviders ? p.allProviders.filter(x => !p.providers.some(y => y.id === x.id) && featureById('create-image')!.providers.includes(x.id) && !EDIT_MODELS.includes(x.id)).map(x => ({ id: x.id, name: x.name, p: x, off: 'Text only: remove the photo to use it', last: true, tag: 'Text only' })) : [])]}
        onPick={(id, fit) => { savePick(fid, id); p.setProvider(id); setPop(''); setFbOff(true); swNote.show(fit?.note); }}
        defaultId={cDef?.id} defaultWhy={cDef?.why} defaultReason={cDef && !cDef.runs ? cDef.reason : null}
        onReset={cDef?.start && p.provider !== cDef.start && p.providers.some(x => x.id === cDef.start) ? () => { savePick(fid, null); p.setProvider(cDef.start!); } : null}
        supports={<><DownloadIntentRow engine={cur?.id} quote={qj} />{rigRecipe && <p className="wf-credit wf-credit-menu" data-testid="wf-credit"><span className="wf-credit-h">Workflow</span>{rigCredit(rigRecipe)}</p>}</>} />}
      <PreflightPop open={pfOpen && (recipe ? wfPf : createPf).length > 0} anchor={genRef} watch={dock} problems={recipe ? wfPf : createPf} onClose={() => setPfOpen(false)} run={f => { void runFix(f); }} />
      {recipe && cropOrig && wfFit && <CropPop open={cropOpen} anchor={prepChipRef} watch={dock} url={cropOrig.url} size={origSize.current[cropOrig.url] ?? null} aspect={wfFit} initial={prepNow?.kind === 'crop' ? prepNow.box ?? null : null}
        onCancel={() => setCropOpen(false)} onDone={b => { setCropOpen(false); void applyPrep('crop', b); }} />}
      <WorkflowPicker open={pop === 'wf'} anchor={wfChipRef} watch={dock} list={wfList} current={recipe?.id ?? ''} onPick={id => setWf(id, { focus: true })} onClose={() => { closePop(); clearPickerParam(); }} />
      <BarPopover open={pop === 'enh'} anchor={enhAt} watch={dock} gap={4} onClose={closePop} label="Prompt enhancer" testId="ic-pop-enh" width={320}><PopSection label="Prompt enhancer" testId="ic-enhance-panel">
        {p.tool.app?.enhance && <PopSwitch testId="ic-enhance-toggle" label="Enhance when I generate" hint="Adds detail to the prompt as it runs; your text stays as you wrote it" on={p.enhance} onChange={p.setEnhance} />}
        <PopAction label="Rewrite my prompt now" hint="See the added detail first, then keep or undo it"><EnhanceButton model={tmCur?.key} prompt={p.prompt} kind="image" style={p.style} onApply={r => { showEnh(r); setPop(''); }} /></PopAction>
      </PopSection></BarPopover>
      <BarPopover open={pop === 'over'} anchor={overRef} watch={dock} gap={4} onClose={closePop} label="More settings" role={!recipe && folded.length ? 'dialog' : 'menu'} testId="ic-pop-over" width={!recipe && folded.length ? 320 : 240}><div className="bp-wrap" data-testid="ic-over-panel">
        {!recipe && folded.length > 0 && setBody}
        <PopSection label="More settings"><PopList label="More settings" role="group"><FoldedRows rows={overRows} testId="ic-over" onPick={t => { setPop(''); requestAnimationFrame(() => t.click()); }} /></PopList></PopSection>
      </div></BarPopover>
      <BarPopover open={pop === 'set'} anchor={aR.set} watch={dock} gap={4} onClose={closePop} label="Settings" testId="ic-pop-settings" width={320}><div className="bp-wrap" data-testid="ic-settings-panel">{setBody}</div></BarPopover>
      <BarPopover open={pop === 'aspect'} anchor={aR.aspect} watch={dock} gap={4} onClose={closePop} label="Aspect ratio" role="listbox" testId="ic-pop-aspect" width={arGroups ? 320 : 220}>
        {(() => { const row = ([a, desc, w, h]: AspectOpt, compact: boolean) => <PopRow key={a} selected={aspect === a} testId={`ic-aspect-${a.replace(':', 'x')}`} icon={a === 'Auto' ? <AspectIcon size={16} /> : <Shape w={w} h={h} />} label={arLabel(a)} hint={a === 'Auto' ? (ed?.allowAuto ? undefined : caps.nativeAuto ? 'The model picks' : undefined) : compact ? (/about/.test(desc) && /\d{3}/.test(a) ? desc.replace(/^(Wide|Tall) · /, '') : undefined) /* the columns already say wide / tall; pixel ratios (Runway 1360:768) get "about 16:9" */ : desc} onClick={() => { setAspect(a); setPop(''); }} />;
          if (!arGroups) return <PopSection label="Aspect ratio"><PopList label="Aspect ratio">{arOpts.map(o => row(o, false))}</PopList></PopSection>;
          /* a long list (Grok 13 + Auto, Ideogram 21, FLUX 3 15 + Auto): Auto and the squares on top, then wide shapes beside their tall twins, nearest to square first */
          return <PopSection label="Aspect ratio" aside={`${arOpts.filter(o => o[0] !== 'Auto').length} shapes`} testId="ic-aspect-grouped">
            {arGroups.top.length > 0 && <PopList label="Auto and square" cols={arGroups.top.length > 1 ? 2 : 1}>{arGroups.top.map(o => row(o, true))}</PopList>}
            <div className="bp-ar-cols" aria-hidden><span>Wide</span><span>Tall</span></div>
            <PopList label="Wide and tall shapes" cols={2}>{arGroups.pairs.flatMap(([wd, tl], k) => [wd ? row(wd, true) : <i key={`w${k}`} className="bp-ar-gap" aria-hidden />, tl ? row(tl, true) : <i key={`t${k}`} className="bp-ar-gap" aria-hidden />])}</PopList>
          </PopSection>; })()}</BarPopover>
      <BarPopover open={pop === 'quality'} anchor={aR.quality} watch={dock} gap={4} onClose={closePop} label={qWord} role="listbox" testId="ic-pop-quality" width={300}><PopSection label={qWord}><PopList label={qWord}>
        {tiers.map(k => { const mv = tierMove(k); const off = cell(k, imgRes) === null && !mv; return <PopRow key={k} selected={qual2 === k} disabled={off} testId={`ic-quality-${k}`} label={qName(k)} hint={off ? 'Not available at this resolution' : mv ? `${TDESC[k] ?? qName(k)} · switches to ${mv}` : TDESC[k] ?? ''} aside={off || k === qual2 ? undefined : deltaOf(cell(k, mv ?? imgRes)) ?? undefined} onClick={() => { pickTier(k); setPop(''); }} />; })}</PopList></PopSection></BarPopover>
      <BarPopover open={pop === 'count'} anchor={aR.count} watch={dock} gap={4} onClose={closePop} label="Images per run" testId="ic-pop-count" width={280}><PopSection label="Images per run" testId="ic-count-panel">
        <Segmented label="Images per run" value={n} onChange={v => { nNow.current = v; setN(v); }} onCommit={() => setPop('')} options={Array.from({ length: maxN }, (_, k) => k + 1).map(v => ({ value: v, label: v, testId: `ic-count-${v}` }))} />
        <p className="bp-total" data-testid="ic-count-total" aria-live="polite"><span>{countWord(n)}</span>{cntPrice && <b className={/\d/.test(cntPrice) ? 'bp-mono' : 'bp-word'}>{cntPrice}</b>}</p>
        {cntDemo && <PopNote testId="ic-count-demo">{cntDemo}</PopNote>}
        {cntNote && <PopNote testId="ic-count-note">{cntNote}</PopNote>}
      </PopSection></BarPopover>
      <BarPopover open={pop === 'res'} anchor={aR.res} watch={dock} gap={4} onClose={closePop} label="Resolution" role="listbox" testId="ic-pop-res" width={300}><PopSection label="Resolution"><PopList label="Resolution">
        {resList.map(r => { const c = cell(qual2, r); const off = c === null; return <PopRow key={r} selected={imgRes === r} disabled={off} testId={`ic-res-${r}`} label={r} hint={off ? resOffWhy() : exactSize(r) ?? RDESC[r]} aside={off ? undefined : r === imgRes ? resPrice(r) ?? undefined : deltaOf(c) ?? resPrice(r) ?? undefined} onClick={() => { setImgRes(r); setPop(''); }} />; })}</PopList></PopSection></BarPopover>
      <Popover open={pop === 'more'} anchor={moreFrom === 'card' ? aR.card : moreAt} avoid={dock} over={dock} onClose={closePop} label="Looks"><div className="ic-pop-style ic-pop-wide" data-testid="ic-style-panel"><div className="ic-st-top"><div className="ic-st-tabs" role="tablist">{([['presets', 'Ready-made'], ['saved', 'Yours']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={stTab === k} className={stTab === k ? 'on' : ''} data-testid={`ic-style-tab-${k}`} onClick={() => setStTab(k)}>{l}</button>)}</div><div className="ic-st-prev" data-testid="ic-style-preview"><span style={{ backgroundImage: stCur ? `url(${stPoster(stCur)})` : undefined }} /><b>{stCur?.label ?? 'No look'}</b><small>{stCur ? 'Applied to your next generation' : 'Pick a look to preview it here'}</small></div><label className="ic-st-q"><svg width="13" height="13" viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><input type="search" placeholder="Search looks" aria-label="Search looks" value={stQ} onChange={e => { setStQ(e.target.value); setStTab('presets'); }} data-testid="ic-style-q" /></label></div>
        {stTab === 'saved' ? <SavedStyles toolId={p.tool.id} prompt={p.prompt} style={p.style} styleLabel={stCur?.label} onApply={us => { const st = String(us.settings?.style ?? ''); if (st && p.styles.some(x => x.id === st)) p.setStyle(st); const w = us.prompt.trim(); if (w && !p.prompt.toLowerCase().includes(w.toLowerCase())) p.setPrompt(p.prompt.trim() ? `${p.prompt.trim().replace(/[,.]?$/, ',')} ${w}` : w); p.promptRef.current?.focus(); }} /> : (() => { const ql = stQ.trim().toLowerCase(); const list = p.styles.filter(s => !ql || s.label.toLowerCase().includes(ql)); return <div className="ic-st-grid">{!ql && <button type="button" className={`ic-st ic-st-none ${p.style === '' ? 'on' : ''}`} data-testid="ic-style-none" aria-pressed={p.style === ''} onClick={() => p.setStyle('')}><span aria-hidden><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M6.5 17.5l11-11" stroke="currentColor" strokeWidth="1.5"/></svg></span>None</button>}{list.map(s => <button key={s.id} type="button" className={`ic-st ${p.style === s.id ? 'on' : ''}`} data-testid={`ic-style-${s.id}`} aria-pressed={p.style === s.id} onClick={() => p.setStyle(s.id)}><span style={{ backgroundImage: `url(${stPoster(s)})` }} />{s.label}</button>)}{ql && !list.length && <p className="ic-st-empty">No styles match “{stQ}”.</p>}</div>; })()}
        {p.tool.app?.enhance && <label className="ic-enh" {...tip('Rewrite the prompt with more detail before rendering')}><input type="checkbox" role="switch" checked={p.enhance} onChange={e => p.setEnhance(e.target.checked)} /><span className="nx-sw" />Enhance prompt</label>}</div></Popover>
      {!recipe && <CompareModels open={cmpOpen && !compareOff} onClose={() => setCmpOpen(false)} anchor={cmpRef} toolId={p.tool.id} providers={p.providers} current={p.provider}
        want={{ aspect: showAspect ? (aspect === 'Auto' ? 'auto' : aspect) : undefined, quality: showQual ? qual2 : undefined, imageResolution: showRes ? imgRes : undefined, n, refs: refN, mode: p.image ? 'edit' : 'generate' }}
        base={params()} prompt={p.prompt} ready={p.ready && !!p.prompt.trim()} notReady={p.prompt.trim() ? missingText(p.missing) || 'Not ready yet' : 'Write a prompt in the bar first'} run={async extra => p.onGenerate({ ...extra, ...lookField() })} />}
      {sideBy && sideJobs.length > 0 && <CompareView jobs={sideJobs} onClose={() => setSideBy(null)} onOpen={id => { setSideBy(null); open(id); }} />}
      {refTab && <ImagePicker tab={refTab} setTab={setRefTab} onClose={() => setRefTab(null)} target={pickFor && recipe ? slotLabel(recipe, pickFor) : null}
        limits={pickFor && recipe ? undefined : maxRefs > 0 ? `Up to ${maxRefs} picture${maxRefs > 1 ? 's' : ''} · PNG, JPG or WebP` : undefined}
        onFile={f => usePicked(f)} onFiles={fs => deliverFiles(file.current, fs)} onUpload={() => file.current?.click()} />}
      {exShown && <ExampleViewer ex={exShown} onClose={closeExample} onUse={useExample} onUsePhoto={exUsePhoto} />}
      <select id="provider" className="sr-only-vis" value={p.provider} onChange={e => p.setProvider(e.target.value)} aria-label="Model">{p.providers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
    </div>
  </div>;
}

/** Every image; Filter › Type narrows it to one of server/src/shared/imageFeed.ts IMAGE_FEED_GROUPS (feedFilter scopeFor). One stable object (useFeed keys on it). */
const SCOPE: FeedScope = imageScope(ALL_IMAGE_FEED);
