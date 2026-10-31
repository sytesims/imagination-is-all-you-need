import { IMAGE_PAGE } from '../../../server/src/shared/pages';
import { VIDEO_PAGE } from '../../../server/src/shared/videoWorkflows';
import { recreateHref as jobRecreateHref, toolHandoffHref, lipSyncHandoffHref, frameHandoffHref } from './workflowLinks';
import { goClick } from './goToWorkflow';
import { saveVideoFrame } from './videoFrame';
import { appFileName } from './brand';
import { Viewer3D, jobItem3d } from './Viewer3D';
import { is3dUrl } from './model3d';
import { sendTo3dHref } from '../../../server/src/shared/threeD';
import { ViewerImage } from './ViewerImage';
import { layersOf, layersPosterOf, layerCountText, LayerCanvas, LayerList, useLayerView } from './LayerStack';
import { modelNameOf } from './imageFeatures';
import { jobInputs, isFileUrl, type JobInput } from './jobInputs';
const inputRefHref = (u: string) => `${IMAGE_PAGE}?refUrl=${encodeURIComponent(u)}`;
/** The job's source photo when the result is that photo changed (upscale, edit, relight, swaps, brush edit): the viewer's Compare. Not for jobs that make a new picture from it (Product Shot, Character Sheet). */
const COMPARE_TOOLS = new Set(['image-upscale', 'app-relight', 'app-face-swap', 'app-person-swap', 'app-inpaint']);
/** Results whose viewer opens on the before/after split (Relight: the change is the light, best judged side by side). */
const COMPARE_FIRST = new Set(['app-relight']);
export const compareSourceOf = (job: JobState): string | null => { const i: any = job.input ?? {}; const u = typeof i.imageUrl === 'string' && /^\/(files|samples)\//.test(i.imageUrl) ? i.imageUrl : null; if (!u) return null;
  const m = String(i.mode ?? (Array.isArray(i.types) ? i.types[0] : '') ?? ''); return COMPARE_TOOLS.has(job.toolId) || (job.toolId === 'create-image' && /^(edit|inpaint)$/.test(m)) ? u : null; };
import { tip } from './Tooltip';
import { askText } from './Dialog';
import { heldBack, isCreditsNote, shownNote } from './creditsBack';
import { plainCopy } from './plainCopy';
import { isDemoJob, shownCredits } from './quote';
import { isSample, sampleLabel } from './sample';
import { HandoffMenu } from '../ui/pages/Backlog';
import { GroupStatus } from '../ui/edge/Edge';
import { RouteAttempts } from '../ui/routing/Routes';
import { cleanModelName, ranOnOf, modelOfEngine, toolLike } from './models';
import { LineageStrip } from '../ui/next/EditWith';
import { AddSoundDialog } from './AddSound';
import { canAddSound } from './addSoundLogic';
import { useEffect, useRef, useState } from 'react';
import { LogoStampLayer, stampAvailable } from './LogoStamp';
import { MenuBody, MenuRow, ToolsPanel, type MItem, type MSection } from './ResultMenu';
import { setStampOn } from './stampStore';
import { loadBrandKits } from './brandStore';
import { useStamp } from './stampStore';
import { makeStamped } from './logoStampDraw';
import { activeKit, useBrand } from './brandStore';
import { compositeCostText, ownAccountsNow, jobCostText, fmtUsd, runPrice, placeOfQuote, ledgerUsd, jobCostAmount } from './billing';
import { fetchModels } from './batch1';
import CompareSlider from './CompareSlider';
import { continuesInput, seamOf, seamClock, seamJumpTo, withExtendModel } from './continuation';
import { ResultStrip, ResultGrid } from './MultiResult';
import { presentationOf, resultItems } from './multiResultRules';
import { GridIcon } from '../ui/Icons';
import ImageCompare from './ImageCompare';
import type { JobState, Project } from '../api';
import { setFeatured, setJobProject, trashJob, listProjects, createProject, listTools } from '../api';
import { navigate } from '../platform/router';
import { useToast, useCopied, Copied } from './Toast';
import { useFavourite } from './favourites';
import GifButton from '../ui/GifButton';
import { copySupport } from '../ui/support';
import { audioKindOfJob } from './audioVizLogic';
import { LinkIcon, CopyIcon, StarIcon, ProjectsIcon, AssetsIcon, TrashIcon, PaletteIcon, BrandIcon, InfoIcon, ComfyPlaceIcon, OpenModelIcon, ToolIcon, DownloadIcon, HeartIcon, MoreIcon, SoundIcon, PencilIcon, BrushIcon, LightIcon, CubeIcon, UpscaleIcon, ExtendIcon, ReshootIcon, TranslateIcon, ChangeVoiceIcon, MusicBedIcon, MusicIcon, UserIcon, LastFrameIcon, FrameGrabIcon, ImageIcon, FinishIcon } from '../ui/Icons';
import type { ToolInfo } from '../api';
import { refTarget, sendUrl } from '../platform/SendTo';
import { WorkflowDialog, useWorkflowInfo } from './WorkflowDialog';
import { LikeButton } from './LikeButton';
import { ShareSheet } from './ShareSheet';
import { cleanHref } from './sharePrefs';
import { openSaveLook } from './SaveLookDialog';
import { canSaveLook } from './looks';
import { ViewerShell, authorOf, ViewerPrompt, ResultDetails, ViewerAudio, ViewerVideo, IoStrip, type IoTile, TrashActions, TrashChip, VideoGlyph, RefGlyph, ArrowGlyph, RecreateGlyph, runOnOfJob, type DetailsInfo } from './ResultViewer';
import { LOCAL_LABEL, LOCAL_FREE } from '../../../server/src/shared/modelIds';
import { typedPromptOf, composedDiffers } from '../../../server/src/shared/typedPrompt';
import { MentionText } from './MentionChips';
import { useCaptions, CaptionsTile } from './Captions';
/** Agent budgets (MCP): "agent Claude · Budget $2.00 · Spent $1.84" for a result an AI agent made; '' otherwise. */
const agentLine = (a?: { name?: string; budgetUsd?: number | null; spentUsd?: number | null; budgetCredits?: number | null; spentCredits?: number | null } | null) => !a?.name ? ''
  : [`agent ${a.name}`, a.budgetUsd != null ? `Budget ${fmtUsd(a.budgetUsd)}` : a.budgetCredits != null ? `Budget ${a.budgetCredits} credits` : '', a.budgetUsd != null && a.spentUsd != null ? `Spent ${fmtUsd(a.spentUsd)}` : a.budgetCredits != null && a.spentCredits != null ? `Spent ${a.spentCredits} credits` : ''].filter(Boolean).join(' · ');
/** Shared result screen. `variant="card"` (inline in tools) or `"viewer"` (the full-screen viewer, shared/ResultViewer:
 *  Create Image tiles, Assets and the /jobs/:id route, Community shots). Card actions: one primary (Recreate on video, Turn to
 *  video on images), then Download + icon row (Favourite, Share, ⋯); everything else lives in the ⋯ menu. */
/** Job panel Route row: a readable name, never the raw route id (UI copy rule 3). Server displayName/label first, then the model's
 *  displayName with where it ran; never the raw id. */
const KIND_NAME: Record<string, string> = { local: LOCAL_LABEL, fal: 'fal', replicate: 'Replicate', 'comfy-cloud': 'Comfy Cloud', 'comfy-router': 'Comfy Cloud', direct: 'Direct API' };
export function friendlyRoute(id: string, rt?: any, model?: any): string {
  const where = KIND_NAME[id.split(':')[0]] ?? '';
  const loc = /^local:/.test(id); const withLocal = (n: string) => loc && !/local|this computer|your computer/i.test(n) ? `${LOCAL_LABEL} · ${n}` : n;
  // A route's own displayName first (e.g. "Local ComfyUI · Wan 2.2 Animate"); for local runs the model's displayName beats the generic route label.
  const own = String(rt?.displayName ?? '').trim(); if (own) return withLocal(own);
  if (loc && typeof model?.displayName === 'string' && model.displayName.trim()) return withLocal(model.displayName.trim());
  const nm = String(rt?.label ?? '').replace(/\s*·\s*(free|0 credits)$/i, '').trim();
  if (nm) return withLocal(nm);
  if (model?.displayName) return where ? `${model.displayName} · ${where}` : String(model.displayName);
  return where || '';
}
export default function ResultView({ beforeImage, job, beforeUrl, title, children, extraActions, moreActions, menuTop, showOriginalTab, audio = true, retentionDays, watermark, variant = 'card', onClose, recreateHref, reserve, tools, onPrev, onNext, pos, out, onGone, onReference, referenceTip, stage, view3d }: { /** a GLB result (shared Viewer3D): the 3D page's options (record the turntable on open, its callback, the big-file limit) */ view3d?: { recordOnOpen?: boolean; onTurntable?: (jobId: string) => void; bigBytes?: number }; /** viewer: replaces the output on the stage (Render: Preview vs Render); an input picked in the strip still shows over it */ stage?: React.ReactNode; tools?: ToolInfo[]; /** viewer: Reference stays on the page that opened the viewer (Create Image fills its photo or a workflow slot) instead of navigating */ onReference?: (url: string, out: number) => void; referenceTip?: string; /** viewer: step to the previous/next result (null = none that way), the "2 / 6" position, and the output to show first. */ onPrev?: (() => void) | null; onNext?: (() => void) | null; pos?: string; out?: number; /** viewer, a result in Trash: after Restore or Delete forever (default: close) */ onGone?: () => void; beforeImage?: string; reserve?: boolean; moreActions?: React.ReactNode; /** viewer: the page's own items at the top of More (Generate Video: Generate more, Re-run same seed, +5s / +10s) */ menuTop?: React.ReactNode; retentionDays?: number | null; watermark?: boolean; audio?: boolean; job: JobState; beforeUrl: string; title: string; children?: React.ReactNode; extraActions?: React.ReactNode; showOriginalTab?: boolean; variant?: 'card' | 'viewer'; onClose?: () => void; recreateHref?: string | null }) {
  const [modelName, setModelName] = useState(''); const sample = isSample(job);
  useEffect(() => { const pid = (job as any).provider; if (!pid || sample) return; let on = true; fetchModels((job as any).toolId).then(d => { const m = d.groups.flatMap(g => g.models).find((x: any) => x.id === pid || x.providerId === pid); if (on && m) setModelName(m.name); }).catch(() => 0); return () => { on = false; }; }, [(job as any).provider, (job as any).toolId]);
  /* L9: name what actually ran. A hosted route (e.g. fal Bria) must not show the local provider's name (BiRefNet). Prefer the route's displayName. */
  const [routeName, setRouteName] = useState(''); const jr = String((job as any).route ?? '');
  const [routeLabel, setRouteLabel] = useState(''); const [routeModel, setRouteModel] = useState(''); const [localWhere, setLocalWhere] = useState('');
  useEffect(() => { setRouteName(''); setRouteLabel(''); setRouteModel(''); setLocalWhere(''); if (!jr || sample) return; let on = true; const loc = /^local:/.test(jr);
    fetch(`/api/routes?${new URLSearchParams({ toolId: (job as any).toolId })}`).then(r => r.ok ? r.json() : null).then(d => { const ms: any[] = d?.routes ?? [];
      const m = ms.find((x: any) => (x.routes ?? []).some((y: any) => y.routeId === jr)); const rt = m?.routes?.find((y: any) => y.routeId === jr);
      const nm = rt?.displayName ?? rt?.label; if (!on) return; if (nm && !loc) setRouteName(String(nm));
      if (typeof m?.displayName === 'string') setRouteModel(m.displayName.trim());
      setRouteLabel(friendlyRoute(jr, rt, m)); if (loc) { const lw = String(rt?.label ?? '').replace(/\s*·\s*(free|0 credits|demo.*)$/i, '').trim(); setLocalWhere(lw); } }).catch(() => 0); return () => { on = false; }; }, [jr, (job as any).toolId]);
  const outs0 = job.outputs.length ? job.outputs : job.resultUrl ? [{ label: 'Result', url: job.resultUrl }] : [];
  const outs = (job.toolId === 'cinema' || job.toolId === 'director') && outs0.length > 1 ? outs0.map((o: any, i: number) => ({ ...o, label: `Take ${i + 1}` })) : outs0;
  const wfInfo = useWorkflowInfo(job.id && !sample && job.status === 'done' ? job.id : null);
  const wfOk = wfInfo.info?.available === true;
  /** the viewer's player ("Use this frame" / "Save frame" read its current time) */ const vidEl = useRef<HTMLVideoElement | null>(null); /** the card's plain player (Extend: "Jump to the new part") */ const cardVid = useRef<HTMLVideoElement | null>(null);
  const [sel, setSel] = useState(out ?? 0); const [tag, setTag] = useState(true); const toast = useToast(); const [copied, flash] = useCopied(); const [share, setShare] = useState(false); const [shareUrl, setShareUrl] = useState<string | null>(null); const brandS = useBrand(); const stampS = useStamp(); const [wf, setWf] = useState<'' | 'get' | 'open'>(''); const [detailsOpen, setDetailsOpen] = useState(true);
  const viewer = variant === 'viewer'; const [vTab, setVTab] = useState('info'); /* an input photo shown full size on the stage (Inputs row); Esc returns to the result */ const [inView, setInView] = useState<number | null>(null); /* the stage's Compare split, shared by the stage's button and the Input → Output arrow */ const [cmp, setCmp] = useState(() => COMPARE_FIRST.has(job.toolId)); /* inputs whose file no longer loads (strip placeholders; Compare off) */ const [badIn, setBadIn] = useState<ReadonlySet<number>>(() => new Set()); const [nat, setNat] = useState(''); const [mDur, setMDur] = useState(0); const [addSound, setAddSound] = useState(false); const [mBad, setMBad] = useState(false);
  /* several results (shared/MultiResult): the contact sheet instead of the picture */ const [grid, setGrid] = useState(false);
  useEffect(() => { if (inView == null) return; const k = (e: KeyboardEvent) => { if (e.key !== 'Escape' || document.querySelector('.apop, .dlg-scrim, .rvx-io-more[open]')) return; e.preventDefault(); e.stopImmediatePropagation(); setInView(null); };
    addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true); }, [inView]); /* Esc on an input photo goes back to the result, not out of the viewer */
  useEffect(() => { setInView(null); setCmp(COMPARE_FIRST.has(job.toolId)); setGrid(false); setBadIn(new Set()); if (variant === 'viewer') { setSel(out ?? 0); setNat(''); setMDur(0); setMBad(false); } }, [job.id, out]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Image to layers: the layers hidden on the viewer's stage (eye buttons in the panel); every layer shows again on another job */
  const lys = variant === 'viewer' ? layersOf(job as any) : null; const lyView = useLayerView(job.id); /* the composite as the Output thumbnail (feed card too: ImageCanvas) */
  const showingOriginal = showOriginalTab && sel === -1;
  const cur0 = showingOriginal ? { label: 'Original', url: beforeUrl } : outs[Math.max(0, sel)] ?? outs[0];
  const cur = cur0 ?? { label: '', url: '' }; /* hooks below run before the empty-result return */
  useEffect(() => { setMBad(false); setNat(''); setMDur(0); vidEl.current = null; }, [cur.url]);
  const kind = /\.(png|jpe?g|webp)($|\?)/i.test(cur.url) ? 'image' : /\.(m4a|wav|mp3)($|\?)/i.test(cur.url) ? 'audio' : 'video';
  /* Remove BG Transparent: WebM with alpha (job.input.alpha or a .webm result); shown over a checkerboard. */
  const alphaOut = kind === 'video' && (!!(job as any).input?.alpha || /\.webm($|\?)/i.test(cur.url));
  const ext = (cur.url.split('?')[0].match(/\.(png|jpe?g|webp|m4a|wav|mp3|mp4|webm|mov)$/i)?.[1]?.toLowerCase()) ?? (kind === 'image' ? 'png' : kind === 'audio' ? 'm4a' : 'mp4'); // keeps .webm (Remove BG transparent)
  const outIx = Math.max(0, outs.indexOf(cur));
  /* Add logo and text (LogoStamp.tsx): an image or video of yours while a brand is on; with it on, Save and Share use the stamped copy (free, original kept) */
  /* Add logo from the menu (dev mockups): shows the stamp layer on this result even when the brand chip is off */
  const [stampForce, setStampForce] = useState(''); 
  const stampKit = activeKit(brandS); const stampKind = kind === 'image' || kind === 'video' ? kind : null;
  const stampOk = viewer && !!stampKind && !!stampKit && !sample && (job as any).isOwner !== false && !(job as any).deletedAt && job.status === 'done' && !showingOriginal && !lys && /^\/files\//.test(cur.url) && (stampAvailable(brandS.on[stampKind], (job as any).input) || stampForce === `${job.id}:${outIx}`);
  const stamping = stampOk && stampS.on;
  const stampedUrl = () => makeStamped({ jobId: job.id, out: outIx, url: cur.url, kind: stampKind!, kit: stampKit!, settings: stampS.settings });
  const openShare = async () => { if (!stamping) { setShareUrl(null); setShare(true); return; }
    try { toast('Adding your logo…'); setShareUrl(await stampedUrl()); setShare(true); } catch (e: any) { toast(e?.message || 'Couldn’t add the logo.', 'error'); } };
  const saveStamped = async (e: React.MouseEvent) => { e.preventDefault();
    try { toast('Adding your logo…'); const u = await stampedUrl(); const a = document.createElement('a'); a.href = u; a.download = appFileName(`${job.id}-${cur.label || 'result'}-logo`, u.split('.').pop() || ext); document.body.appendChild(a); a.click(); a.remove(); toast('Saved with your logo. The original stays as it is.'); }
    catch (err: any) { toast(err?.message || 'Couldn’t add the logo.', 'error'); } };
  type Row = { available?: boolean; url?: string | null; reason?: string | null } | null;
  const [rows, setRows] = useState<Record<string, Row | undefined>>({}); const rows0 = rows; const rowsKey = useRef('');
  const loadRows = () => { const key = `${job.id}:${outIx}`; if (!job.id || sample || rowsKey.current === key) return; rowsKey.current = key; setRows({});
    const acts: [string, string][] = [['translate', 'action=translate'], ['change-voice', 'action=change-voice'], ['relight', 'action=relight'], ['upscale', 'action=upscale'], ['reshoot', 'action=reshoot'], ['finish', 'action=finish']]; /* no Director palette row: Director was removed 2026-10-23 */
    /* BH2 #8: only the hand-offs this media kind offers (the menu shows the same set), so an image never asks for Translate / Change voice. */
    const KINDS: Record<string, string[]> = { translate: ['video'], 'change-voice': ['video'], relight: ['image'], upscale: ['image', 'video'], reshoot: ['video'], finish: ['video'] };
    acts.filter(([k]) => KINDS[k]?.includes(kind) ?? true).forEach(([k, q]) => fetch(`/api/jobs/${encodeURIComponent(job.id)}/prefill?${q}&out=${outIx}`).then(r => r.json().then(b => ({ ok: r.ok, b }))).then(({ ok, b }) => setRows(m => rowsKey.current !== key ? m : ({ ...m, [k]: ok ? { available: b.available !== false, url: b.url ?? null, reason: b.reason ?? null } : { available: false, url: null, reason: b.error ?? null } })))
      .catch(() => setRows(m => rowsKey.current !== key ? m : ({ ...m, [k]: null })))); };
  // Stepping to another job/output: drop the old hand-off rows (late replies are ignored by key) and reload if the ⋯ menu is still open.
  const moreOpen = useRef(false);
  const moreEl = useRef<HTMLDetailsElement>(null);
  const [moreShown, setMoreShown] = useState(false);
  useEffect(() => {
    if (!moreShown) return;
    const outside = (e: PointerEvent) => {
      const menu = moreEl.current;
      if (menu?.open && e.target instanceof Node && !menu.contains(e.target)) menu.open = false;
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [moreShown]);
  useEffect(() => { rowsKey.current = ''; setRows({}); if (moreOpen.current || (variant === 'viewer' && vTab === 'edit')) loadRows(); }, [job.id, outIx]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Recreate price from prefill (quote = charge). */
  const [rcPrice, setRcPrice] = useState<{ credits?: number; runnable?: boolean; needsKey?: boolean } | null>(null);
  useEffect(() => { setRcPrice(null); /* #22: never show the previous job's price while this one loads */ if (!job.id || recreateHref === null || sample) return; let live = true; fetch(`/api/jobs/${encodeURIComponent(job.id)}/prefill?action=recreate`).then(r => r.ok ? r.json() : null).then(b => { if (live) setRcPrice(b?.price ?? null); }).catch(() => 0); return () => { live = false; }; }, [job.id]);
  /* 2026-10-25: a workflow job shows your words; the prompt it composed stays one click away (the eye / "Full prompt") */
  const inp: any = job.input ?? {}; const pr = typedPromptOf(inp).trim(); const appPr: string[] = Array.isArray((job as any).runSource?.appPrompts) ? (job as any).runSource.appPrompts : []; const fullPr = composedDiffers(inp) ? String(inp.prompt).trim() : appPr.length ? appPr.map((p, i) => (appPr.length > 1 ? `${i + 1}. ${p}` : p)).join('\n\n') : null; /* a workflow that writes its own prompts (Swap Two People: one per person, jobSource.ts) shows them behind the eye */ const [fullOn, setFullOn] = useState(false);
  const storyShots: string[] | null = Array.isArray(inp.story?.shots) && inp.story.shots.length ? inp.story.shots.map((x: any) => String(x?.prompt ?? '').trim()) : null;
  /* The model that made it is always credited (licences such as MiniMax H3 require its name on screen), whatever route ran it. */
  const credit = creditOf(job, routeModel || modelName, routeLabel || (jr ? friendlyRoute(jr) : routeName), localWhere);
  /* A local route's name embeds the catalog model ("Local ComfyUI · Wan 2.2 Fun Camera 14B"); name what the server says ran instead. */
  const servedName = String((job as any).modelName ?? '').trim();
  const routeShown = /^local:/.test(jr) && servedName ? `${localWhere || LOCAL_LABEL} · ${servedName}` : routeLabel || (jr ? friendlyRoute(jr) : '');
  const sz = Number((cur as any).width) > 0 && Number((cur as any).height) > 0 ? `${(cur as any).width}×${(cur as any).height}` : '';
  const sets = [['Model', sample ? '' : credit.model], ['Look', (job as any).presetLabel || inp.presetLabel || inp.preset], ['Quality', kind === 'audio' ? '' : (job as any).qualityLabel || inp.quality] /* server's plain label, raw value as fallback */, ['Size', kind === 'audio' ? '' : sz], ['Created', (job as any).createdAt ? new Date((job as any).createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''], ['Seed', inp.seed], ['Resolution', kind === 'audio' || sz ? '' : inp.resolution], ['Duration', kind !== 'image' && inp.duration ? `${inp.duration}s` : ''], ['Aspect', (job as any).aspectLabel || inp.aspect], ['Made by', agentLine((job as any).agent)]].filter(([, v]) => v !== undefined && v !== null && v !== '');
  { if (credit.ranOn) sets.push(['Ran on', credit.ranOn]); const cst = (job as any).cost; if (cst != null && !isDemoJob(job) && !sample) sets.push(['Cost', compositeCostText(job) ?? (cst === 0 ? (credit.ranOn === LOCAL_LABEL ? LOCAL_FREE : 'Free') : ownAccountsNow() ? `${jobCostAmount(job) ?? jobCostText(cst, (job as any).runOn)} · billed to your ${credit.ranOn.replace(/\s*(\(.*\)|·.*)$/, '')} account` : `${ledgerUsd(cst)}${heldBack(job) ? ` (${ledgerUsd(heldBack(job))} returned to balance)` : ''}`)]); }
  const inputs = jobInputs(job); const refThumbs = inputs.map(x => x.url);
  const promptRef = useRef<HTMLParagraphElement>(null); const [clampOn, setClampOn] = useState(true); const [overflow, setOverflow] = useState(false);
  useEffect(() => { setClampOn(true); setFullOn(false); const el = promptRef.current; if (!el) return; requestAnimationFrame(() => setOverflow(el.scrollHeight > el.clientHeight + 2)); }, [pr, job.id]);
  const copyTxt = [pr && `Prompt: ${pr}`, ...sets.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');
  /* PB-14: the menu item itself says Copied (no toast); a private link says so in its grey line. */
  const copyLink = () => { const tok = (job as any).shareToken; const u = tok ? `${location.origin}/s/${tok}` : `${location.origin}/jobs/${job.id}`; navigator.clipboard?.writeText(u).then(() => flash('link')).catch(() => toast('Couldn’t copy the link', 'error')); };
  /* Director was removed (2026-10-23): its old jobs (and stories) still open and play here, with no Recreate (its page now opens Create Video). */
  const retired = job.toolId === 'cinema' || job.toolId === 'director';
  const recreate = sample || recreateHref === null || retired ? null : recreateHref ?? (job as any).example?.recreateHref ?? jobRecreateHref(job, tools);
  const toVideo = kind === 'image' && job.id && !sample ? `${VIDEO_PAGE}?fromJob=${encodeURIComponent(job.id)}&as=image&out=${outIx}` : null;
  const download = <a className="btn rv-dl" data-testid="rv-download" href={cleanHref(cur.url)} download={appFileName(`${job.id}-${cur.label}`, ext)}><DownloadIcon size={15} />{storyShots && !showingOriginal ? 'Download film' : 'Download'}</a>;
  const rcCost = rcPrice ? (rcPrice.needsKey && rcPrice.runnable === false ? 'Needs a key' : (rcPrice as any).demo ? 'Sample' : shownCredits(rcPrice) === 0 ? 'Free' : runPrice({ own: ownAccountsNow(), credits: shownCredits(rcPrice), runOn: placeOfQuote(rcPrice) }) ?? '') : ''; /* QA #7: the Generate button's words */
  const recreateBtn = (primary: boolean) => recreate && <a href={recreate} onClick={goClick(recreate, onClose)} className={`btn ${primary ? 'rv-primary' : 'rv-second'} recreate-btn`} data-action="recreate" data-testid="rv-recreate"><span aria-hidden>↻</span>Recreate{rcCost && <span className="rv-cost" data-testid="rv-recreate-cost">{rcCost}</span>}</a>;
  /* C6: on a public Community shot that isn't yours, the heart is a real local Like (your own results keep the private Favourite). */
  const like = job.id && (job as any).visibility === 'public' && (sample || (job as any).isOwner === false) ? <LikeButton id={job.id} className="rv-ic rv-like" /> : null;
  const fav = like ?? (job.id && !sample ? <FavButton job={job} /> : null);
  const shareBtn = (job as any).isOwner === false ? null : <button type="button" className="btn rv-ic rv-share" data-testid="rv-share" aria-label="Share" {...tip('Share')} onClick={() => void openShare()}><ShareGlyph /></button>;
  /* ⋯ More (shared/ResultMenu.tsx, picked 2026-10-29): file actions only, an icon on every row, sections, no nested menus.
     The tools live in the viewer's Edit tab ("Use it in…"); the card (no Edit tab) lists its tool rows here. Owner-only rows hide when isOwner is false. */
  const owner = (job as any).isOwner !== false;
  const medium = is3dUrl(cur.url) ? '3d' : kind;
  const rmTool = (a: string, label: string, testid: string, icon: React.ReactNode): MItem => { const r = rows[a];
    return r === undefined ? { k: a, label, icon, testid, dis: 'Checking…' } : !r || r.available === false || !r.url ? { k: a, label, icon, testid, dis: r?.reason ?? 'Not available for this result' }
      : { k: a, label, icon, testid, href: r.url, onClick: goClick(r.url!, onClose) }; };
  /* Add logo: always findable on your image and video results; with a brand that has a logo it turns on the stage stamp, else it leads to Assets › Brands */
  const logoBase = viewer && (medium === 'image' || medium === 'video') && !sample && owner && !(job as any).deletedAt && job.status === 'done' && !showingOriginal && !lys && /^\/files\//.test(cur.url);
  const logoItem = (): MItem | null => { if (!logoBase) return null; const k = stampKit;
    if (!k?.logo?.url) { const href = k ? `/assets/brands?brand=${encodeURIComponent(k.id)}` : '/assets/brands';
      return { k: 'logo', label: 'Add logo', icon: <BrandIcon size={16} />, testid: 'rv-add-logo', trail: <span className="rm-go">Set up your brand first ›</span>, hint: k ? `${k.name} has no logo yet. Add one in Assets › Brands.` : 'Make a brand with your logo in Assets › Brands, then put it on any result', href, onClick: goClick(href, onClose) }; }
    return stamping ? { k: 'logo', label: 'Remove logo', icon: <BrandIcon size={16} />, testid: 'rv-add-logo', pressed: true, trail: <span className="rm-check">On</span>, hint: 'Take the logo off. Save and Share go back to the original.', onClick: () => setStampOn(false) }
      : { k: 'logo', label: 'Add logo', icon: <BrandIcon size={16} />, testid: 'rv-add-logo', hint: `Put ${k.name}’s logo on this ${medium}. Drag it to place; Save and Share use a copy.`, onClick: () => { setStampForce(`${job.id}:${outIx}`); setStampOn(true); } }; };
  const menuSections = (overflow: MItem[] = [], menuTop?: React.ReactNode): MSection[] => {
    const done = !!job.id && !sample && job.status === 'done'; const asIs = !showingOriginal;
    const share: MItem[] = [
      logoItem(),
      asIs && medium === 'image' ? { k: 'copyimg', label: copied === 'image' ? 'Copied' : 'Copy image', icon: <CopyIcon size={16} />, testid: 'rv-copy-image', keepOpen: true, onClick: () => { copyImage(cur.url).then(() => flash('image'), () => toast('Couldn’t copy the image. Try Download instead.', 'error')); } } : null,
      { k: 'link', label: copied === 'link' ? 'Link copied' : 'Copy link', icon: <LinkIcon size={16} />, testid: 'rv-copy-link', keepOpen: true, hint: (job as any).shareToken ? 'The public link' : 'Only you can open it. Use Share for a public link.', onClick: copyLink },
      (job.outputs?.length ?? 0) > 1 && job.id ? { k: 'zip', label: 'Download all (ZIP)', icon: <DownloadIcon size={16} />, testid: 'rv-zip', hint: 'Every result in one ZIP, plus a settings file', href: `/api/jobs/${encodeURIComponent(job.id)}/download.zip`, download: true } : null,
      asIs && medium === 'video' && job.id ? { k: 'gif', label: '', icon: null, testid: 'rv-gif', node: <GifButton key={cur.url} jobId={job.id} url={cur.url} name={appFileName(`${job.id}-${cur.label}`, 'gif')} /> } : null,
      asIs && job.id && owner && !sample && medium === 'image' && canSaveLook(job) ? { k: 'look', label: 'Save as look', icon: <PaletteIcon size={16} />, testid: 'rv-save-look', hint: 'Keep this prompt, model and settings as a look you can reuse', onClick: () => openSaveLook({ job, output: outIx }) } : null,
    ].filter(Boolean) as MItem[];
    const editTab = viewer && owner && !sample && (medium === 'image' || medium === 'video') && !(job as any).deletedAt;
    /* the viewer: frame / Make it talk shortcuts that didn't fit the tiles, then "Use it in…" (the Edit tab). The card: its tool rows. */
    let use: MItem[] = editTab ? [...overflow.filter(t => ['useframe', 'saveframe', 'talk'].includes(t.k)),
      { k: 'useit', label: 'Use it in…', icon: <ToolIcon size={16} />, testid: 'rm-use-it', trail: '›', hint: 'Relight, upscale, make a video and more, in the Edit tab', onClick: () => { setVTab('edit'); loadRows(); } }]
      : viewer ? overflow : !asIs ? [] : medium === 'image' ? [rmTool('relight', 'Relight', 'rv-relight', <LightIcon size={16} />), rmTool('upscale', 'Upscale', 'rv-upscale', <UpscaleIcon size={16} />),
        ...(job.id && !sample ? [{ k: 'to3d', label: 'Make it 3D', icon: <CubeIcon size={16} />, testid: 'rv-send-3d', hint: 'Turn this picture into a 3D model', href: sendTo3dHref(job.id, outIx), onClick: goClick(sendTo3dHref(job.id, outIx), onClose) }] : [])]
      : medium === 'video' ? [rmTool('upscale', 'Upscale', 'rv-upscale', <UpscaleIcon size={16} />), rmTool('finish', 'Finish', 'rv-finish', <FinishIcon size={16} />), rmTool('reshoot', 'Re-shoot', 'rv-reshoot', <ReshootIcon size={16} />),
        rmTool('translate', 'Translate', 'rv-translate', <TranslateIcon size={16} />), rmTool('change-voice', 'Change voice', 'rv-change-voice', <ChangeVoiceIcon size={16} />)] : [];
    if (!viewer && asIs && job.id && !sample) use.push({ k: 'sendto', label: '', icon: <ToolIcon size={16} />, testid: 'rv-send-to', node: <HandoffMenu jobId={job.id} /> });
    const organise: MItem[] = [
      done && owner ? { k: 'feat', label: '', icon: null, testid: 'rv-feature', node: <FeatureItem job={job} />, bare: true } : null,
      job.id && owner ? { k: 'move', label: '', icon: <ProjectsIcon size={16} />, testid: 'rv-move-to', node: <MoveToItem job={job} /> } : null,
      viewer && job.id && !/^\/(assets|history|jobs\/)/.test(location.pathname) ? { k: 'assets', label: 'Open in Assets', icon: <AssetsIcon size={16} />, testid: 'rv-open-assets', href: `/assets?job=${encodeURIComponent(job.id)}`, onClick: goClick(`/assets?job=${encodeURIComponent(job.id)}`, onClose) } : null,
    ].filter(Boolean) as MItem[];
    const wfDis = wfOk ? null : wfInfo.info ? 'Only results made by open models, on your computer or on Comfy Cloud, come with a ComfyUI workflow.' : wfInfo.err || 'Checking…';
    const adv: MItem[] = [
      ...(done ? [{ k: 'wf', label: 'View workflow', icon: <OpenModelIcon size={16} />, testid: 'rv-get-workflow', dis: wfDis, hint: 'The ComfyUI graph that made this, with its settings', onClick: () => setWf('get') },
        { k: 'comfy', label: 'Open in ComfyUI', icon: <ComfyPlaceIcon size={16} />, testid: 'rv-open-comfy', dis: wfDis, hint: 'Load this workflow in your ComfyUI', onClick: () => setWf('open') }] : []),
      ...(job.id ? [{ k: 'support', label: copied === 'support' ? 'Copied' : 'Copy support info', icon: <InfoIcon size={16} />, testid: 'rv-support', keepOpen: true, hint: 'Job id, tool and seed, for a bug report', onClick: () => { copySupport(job.id, `job ${job.id} · ${job.toolId} · seed ${job.input?.seed ?? '-'}`).then(() => flash('support'), () => toast('Couldn’t copy the support info', 'error')); } }] : []),
    ];
    const del: MItem[] = job.id && owner ? [{ k: 'trash', label: '', icon: <TrashIcon size={16} />, testid: 'rv-trash', danger: true, node: <TrashItem job={job} onDone={viewer ? onClose : undefined} /> }] : [];
    return ([
      ...(menuTop ? [{ k: 'page', title: 'Run again', items: [], raw: menuTop }] : []),
      { k: 'share', title: 'Share and save', items: share },
      { k: 'use', title: editTab ? undefined : 'Use it in…', items: use, raw: !viewer && moreActions ? moreActions : undefined },
      { k: 'organise', title: 'Organise', items: organise },
      { k: 'advanced', title: 'Advanced', items: adv },
      { k: 'delete', items: del },
    ] as MSection[]).filter(s => s.items.length || s.raw);
  };
  /* `overflow`: viewer tiles that didn't fit the row; `menuTop`: the page's own run-again items; `tile`: the viewer's icon-over-label summary. */
  const moreOf = (tile?: boolean, overflow?: MItem[], menuTop?: React.ReactNode) => <details ref={moreEl} className="rv-more" data-testid="rv-more" onToggle={e => { const d = e.currentTarget; moreOpen.current = d.open; setMoreShown(d.open); const m = d.querySelector('.rv-more-menu') as HTMLElement | null; if (!m) return; m.style.left = m.style.right = m.style.top = m.style.bottom = ''; if (!d.open) { d.querySelectorAll('details[open]').forEach(x => (x as HTMLDetailsElement).open = false); return; } loadRows(); void loadBrandKits(); requestAnimationFrame(() => { const r = m.getBoundingClientRect(); if (r.left < 8) { m.style.right = 'auto'; m.style.left = '0'; } const r2 = m.getBoundingClientRect(); if (r2.right > innerWidth - 8) { m.style.left = `${Math.min(0, innerWidth - 8 - r2.right)}px`; } const r3 = m.getBoundingClientRect(); if (r3.top < 8) { m.style.bottom = 'auto'; m.style.top = 'calc(100% + 6px)'; } }); }}>
    {tile ? <summary className="rvx-tile rv-more-btn" aria-label="More actions" {...tip('More actions')}><MoreIcon size={18} /><span>More</span></summary>
      : <summary className="btn rv-ic rv-more-btn" aria-label="More actions" {...tip('More actions')}>⋯</summary>}
    <div className="rv-more-menu rm" role="menu" data-testid="rm-menu"><MenuBody sections={menuSections(overflow, menuTop)} /></div></details>;
  const more = moreOf();
  /* Samples: no tool hand-offs, so the ⋯ menu only copies the link. */
  const moreMenu = sample ? <button type="button" className="btn rv-ic rv-copy" data-testid="rv-copy-link" aria-label="Copy link" {...tip('Copy link')} onClick={copyLink}>⧉</button> : more;
  const aiBadge = (job as any).aiGenerated ? <span className="ai-badge" data-testid="rv-ai" title="Made by an AI model">AI-generated</span> : null;
  const demo = !sample && isDemoJob(job);
  const sampleChip = demo ? <em className="demo-badge rv-sample-chip" data-testid="rv-sample-chip" title="Sample output, nothing billed.">Sample</em> : null;
  const demoNote = demo ? <div className="rv-demo" data-testid="rv-demo"><p className="helper">Sample output, nothing billed.</p></div> : null;
  const sampleNote = sample ? <div className="rv-sample" data-testid="rv-sample"><em className="comm-badge comm-badge-sample">{sampleLabel(job)}</em>{(job as any).sample?.credit && <p className="helper">{(job as any).sample.credit}{(job as any).sample.license ? <> · {(job as any).sample.licenseUrl ? <a href={(job as any).sample.licenseUrl} target="_blank" rel="noreferrer">{(job as any).sample.license}</a> : (job as any).sample.license}</> : null}{(job as any).sample.sourceUrl ? <> · <a href={(job as any).sample.sourceUrl} target="_blank" rel="noreferrer">Source</a></> : null}</p>}</div> : null; // the AI-generated pill is aiBadge (one per header)
  /* Add sound (one-click soundtrack, MMAudio): on your own finished video results; a soundtrack result can be scored again */
  const canSound = kind === 'video' && !sample && !showingOriginal && canAddSound(job as any, cur.url);
  const soundDlg = addSound && <AddSoundDialog jobId={job.id} output={outIx} durationSec={Number((cur as any).durationSec) > 0 ? Number((cur as any).durationSec) : mDur > 0 ? mDur : Number(inp.outputDuration ?? inp.duration) || null} hasAudio={(cur as any).hasAudio} onClose={() => setAddSound(false)} />;
  const acts = <div className={`rv-acts rv-acts-${kind}`} data-testid="rv-acts">
    {kind === 'image' ? <>{toVideo && <a className="btn rv-primary" data-action="turn-to-video" data-testid="rv-turn-to-video" href={toVideo} onClick={goClick(toVideo, onClose)}><span aria-hidden>▶</span>Turn to video</a>}<div className="rv-row2">{recreateBtn(false)}{download}</div><div className="rv-row3">{fav}{shareBtn}{moreMenu}</div></>
      : kind === 'video' ? <>{recreateBtn(true)}<div className="rv-row">{canSound && <button type="button" className="btn rv-add-sound" data-testid="rv-add-sound" onClick={() => setAddSound(true)} {...tip('Music and sound effects timed to the clip · free on your computer')}><SoundIcon size={15} />Add sound</button>}{download}{fav}{shareBtn}{moreMenu}</div></>
      : <><div className="rv-row">{download}{fav}{shareBtn}{moreMenu}</div></>}
    <GroupStatus job={job} />
  </div>;
  /* Known output size: the video box has its final shape before the file loads, so nothing below it jumps. */
  const ow = Number((cur as any).width ?? (job.input as any)?.width), oh = Number((cur as any).height ?? (job.input as any)?.height); const rqA = String((job.input as any)?.aspect ?? '').match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/); /* no output size yet: the aspect that was asked for */
  const ar = ow > 0 && oh > 0 ? `${ow} / ${oh}` : rqA ? `${rqA[1]} / ${rqA[2]}` : undefined;
  /* Extend and other continuations: never before / after; the seam (where the new part starts) when the input's length is known */
  const cont = continuesInput(job); const seam = seamOf(job, Number((cur as any).durationSec) > 0 ? Number((cur as any).durationSec) : mDur > 0 ? mDur : Number(inp.outputDuration) || 0);
  const media = showingOriginal ? <video className="preview" src={beforeUrl} controls playsInline />
    : kind === 'image' && beforeImage && beforeImage !== cur.url ? <ImageCompare before={beforeImage} after={cur.url} aspect={ar} /> /* B21 (T25) */
    : kind === 'image' ? <img className={`preview result-image${(job as any).input?.transparent ? ' alpha-bg' : ''}`} src={cur.url} alt={cur.label} width={ow > 0 && oh > 0 ? ow : undefined} height={ow > 0 && oh > 0 ? oh : undefined} style={ar ? { aspectRatio: ar, height: 'auto' } : undefined} />
    : kind === 'audio' ? <audio className="preview result-audio" src={cur.url} controls />
    : !beforeUrl || beforeUrl === cur.url || cont /* Extend: the output starts with the input, so no before / after (shared/continuation.ts) */ ? <><video ref={cardVid} className={`preview ${alphaOut ? 'alpha-bg' : ''}`} data-alpha={alphaOut || undefined} src={cur.url} controls playsInline style={ar ? { aspectRatio: ar } : undefined} />
      {seam != null && <button type="button" className="btn btn-sm rv-seam-jump" data-testid="rv-seam-jump" aria-label={`Jump to the new part (new from ${seamClock(seam)})`} onClick={() => { const el = cardVid.current; if (!el) return; el.currentTime = seamJumpTo(seam); el.play().catch(() => 0); }}><span className="rvx-seam-dot" aria-hidden />New from {seamClock(seam)} · Jump to the new part</button>}</>
    : <CompareSlider before={beforeUrl} after={cur.url} watermark={tag} aspect={ar} />;
  const tabs = (outs.length > 1 || showOriginalTab) && <div className="seg mb-12 rv-tabs" role="tablist">
    {showOriginalTab && <button role="tab" className={showingOriginal ? 'on' : ''} onClick={() => setSel(-1)}>Original</button>}
    {outs.map((o, i) => <button role="tab" key={o.url} className={!showingOriginal && sel === i ? 'on' : ''} onClick={() => setSel(i)}>{o.label}</button>)}
  </div>;
  const meta = <section className="rv-meta" aria-label="Prompt and settings">
    <div className="rv-meta-h"><span className="rv-lbl">Prompt</span><button type="button" className="btn btn-sm rv-copy" onClick={() => navigator.clipboard?.writeText(copyTxt).then(() => { flash('prompt'); toast('Prompt and settings copied'); }, () => 0)}>{copied === 'prompt' ? <Copied /> : 'Copy'}</button></div>
    {inputs.some(x => x.kind === 'image') && <div className="rv-refs rv-inputs" data-testid="rv-refs" aria-label="Inputs">{inputs.map((x, i) => x.kind === 'image' && <a key={i} className="rv-in" href={x.url} target="_blank" rel="noreferrer" {...tip(`${x.slot}: open full size`)}><img src={x.url} alt={x.slot} loading="lazy" /><span>{x.slot}</span></a>)}</div>}
    {storyShots ? <ol className={`rv-story-shots${clampOn ? ' clamp' : ''}`} data-testid="rv-story-shots">{(clampOn ? storyShots.slice(0, 2) : storyShots).map((t, i) => <li key={i}><b>Shot {i + 1}</b> {withMentions(t)}</li>)}</ol>
      : <p ref={promptRef} className={`rv-prompt ${clampOn ? 'clamp' : ''}`} data-testid="rv-prompt">{fullOn && fullPr ? fullPr : pr ? withMentions(pr) : <span className="helper">{fullPr ? 'None: the workflow wrote the prompt' : 'No prompt'}</span>}</p>}
    {fullPr && !storyShots && <button type="button" className="rv-seeall" data-testid="rv-full-prompt" aria-pressed={fullOn} onClick={() => setFullOn(o => !o)}>{fullOn ? 'Your words' : 'Full prompt'}</button>}
    {storyShots && storyShots.length > 2 && <button type="button" className="rv-seeall" aria-expanded={!clampOn} onClick={() => setClampOn(c => !c)}>{clampOn ? `See all ${storyShots.length} shots` : 'Show less'}</button>}
    {!storyShots && overflow && <button type="button" className="rv-seeall" data-testid="rv-see-all" aria-expanded={!clampOn} onClick={() => setClampOn(c => !c)}>{clampOn ? 'See all' : 'Show less'}</button>}
    {(job as any).elements?.length > 0 && <div className="el-chips rv-els">{(job as any).elements.map((e: any) => <span key={e.id + e.start} className="el-chip" title={e.kind}>{e.url && <img src={e.url} alt="" />}<b>{e.mention ?? `@${e.name}`}</b>{e.refIndex != null && <small>@image{e.refIndex + 1}</small>}</span>)}</div>}
    <RouteAttempts job={job} label={credit.ranOn} />
    {sets.length > 0 && <div className="rv-details"><button type="button" className="rv-lbl rv-details-h" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(o => !o)}>Details<span aria-hidden>{detailsOpen ? '▴' : '▾'}</span></button>
      {detailsOpen && <dl className="rv-sets">{sets.map(([k, v]) => <div key={String(k)}><dt>{k}</dt><dd>{String(v)}</dd></div>)}{job.parentId && <div><dt>Made from</dt><dd><a className="rv-parent" data-testid="rv-made-from" href={`/jobs/${encodeURIComponent(job.parentId)}`} onClick={goClick(`/jobs/${job.parentId}`, onClose)}>{job.parentId}</a></dd></div>}</dl>}</div>}
  </section>;
  const notes = <div className="result-notes">
    {retentionDays != null ? <p>Results are kept for {retentionDays} days. Download to keep them.</p> : null}
    <p>You own your inputs and outputs. Some models limit commercial use: see <a href="/licenses">Models &amp; licences</a>.</p>
    {watermark && <p><span className="nb nb-top">AI-generated</span> invisible marker embedded</p>}
    {!showingOriginal && kind === 'video' && beforeUrl && beforeUrl !== cur.url && <label className="row helper"><input type="checkbox" checked={tag} onChange={e => setTag(e.target.checked)} /> Made with Imagination Is All You Need tag</label>}
  </div>;
  const wfDlg = wf && job.id ? <WorkflowDialog jobId={job.id} intent={wf} onClose={() => setWf('')} /> : null;
  const shareDlg = share && <ShareDialog jobId={job.id} out={outIx} mediaUrl={shareUrl ?? undefined} onClose={() => { setShare(false); setShareUrl(null); }} onError={m => toast(m, 'error')} />;
  /* The viewer shows the restart-recovery warning (comfy/resume.ts) as a quiet line at the bottom of Details instead. */
  const isRestartNote = (w: string) => /server restarted during this run/i.test(w);
  const recovered = viewer && !!job.warnings?.some(isRestartNote);
  const extras = <>{(job.input as any)?.scale && <div className="up-meta" data-upscale><span className="up-scale">{(job.input as any).scale}×</span>{(job.input as any).sourceSize && (job.input as any).outputSize && <span className="up-size"><code>{(job.input as any).sourceSize.width}×{(job.input as any).sourceSize.height}</code> → <code>{(job.input as any).outputSize.width}×{(job.input as any).outputSize.height}</code></span>}{((job.input as any).warnings ?? []).map((w: string) => <span key={w} className="helper warn">{w}</span>)}</div>}
    {job.warnings?.filter(w => !(viewer && isRestartNote(w))).map(w => <div key={w} className={isCreditsNote(w) ? 'helper rv-note' : 'helper warn'} data-testid={isCreditsNote(w) ? 'credits-note' : undefined}>{plainCopy(shownNote(w))}</div>)}</>;
  /* Captions (shared/Captions.tsx): your finished video or sound on this computer; on by default for voiced results */
  const ccOk = viewer && !sample && owner && job.status === 'done' && !showingOriginal && !(job as any).deletedAt && kind !== 'image' && !is3dUrl(cur.url) && /^\/files\//.test(cur.url);
  const cc = useCaptions(job.id, outIx, ccOk);
  if (!cur0) return null;
  /* 3D (2026-10-23): a GLB opens in the shared 3D viewer, with the same Favourite, Share and ⋯ More as every other result (UX audit #4, 2026-10-27) */
  if (viewer && is3dUrl(cur.url) && job.id) return <Viewer3D item={{ ...jobItem3d(job), recreateHref: (job as any).input?.rig ? null : recreate }} headActions={fav} onClose={onClose ?? (() => history.back())} onPrev={onPrev} onNext={onNext} pos={pos}
    recordOnOpen={view3d?.recordOnOpen} onTurntable={view3d?.onTurntable} {...(view3d?.bigBytes ? { bigBytes: view3d.bigBytes } : {})}
    tiles={sample ? null : <>{shareBtn && <button type="button" className="rvx-tile" data-testid="rv-share" aria-label="Share" {...tip('Share')} onClick={() => void openShare()}><ShareGlyph /><span>Share</span></button>}{moreOf(true)}</>}>{shareDlg}</Viewer3D>; /* 3D (2026-10-23): a GLB opens in the shared 3D viewer */
  if (viewer) {
    /* The full-screen viewer (Create Image, Assets, /jobs/:id, Community): the card's data and handlers laid out as media + side panel.
       Images, video (player with poster) and audio (cover, waveform, player); a result in Trash shows Restore / Delete forever instead. */
    const go = (u: string) => goClick(u, onClose); /* shared/goToWorkflow: closes a state viewer, never races a URL viewer's history.back() */
    const qs = `fromJob=${encodeURIComponent(job.id)}&out=${outIx}`;
    const trashed = !!(job as any).deletedAt;
    const live = !sample && !showingOriginal && !!job.id && !trashed;
    const canHand = live && kind === 'image';
    const refUrl = canHand ? (tools?.length ? refTarget(job, tools, outIx)?.url : null) ?? `${IMAGE_PAGE}?${qs}&as=ref` : null;
    const S = Object.fromEntries(sets) as Record<string, any>;
    const mk = modelOfEngine(job.toolId, (job as any).provider, (job as any).modelKey);
    const o: any = cur;
    const size = sz || nat;
    /* Medium-specific rows, from the output's probed metadata, else the player, else what was asked for. */
    const dur = Number(o.durationSec) > 0 ? Number(o.durationSec) : mDur > 0 ? mDur : Number(inp.duration ?? inp.durationSec) > 0 ? Number(inp.duration ?? inp.durationSec) : 0;
    const fps = Number(o.fps ?? inp.fps ?? (job as any).fps); const sr = Number(o.sampleRate ?? inp.sampleRate ?? (job as any).sampleRate);
    const feat: any = (job as any).feature ?? null; /* images: "Relight · Nano Banana 2" and the workflow it is credited with (server shared/imageFeatures) */
    /* Details (ResultViewer ResultDetails): summary (feature · model · place), the medium's spec grid, How it was made. Quality is hidden on
       Local runs (local models take no quality option). */
    const local = runOnOfJob(job) === 'local';
    const details: DetailsInfo = {
      kind: kind as DetailsInfo['kind'], feature: feat?.name ?? (sample ? sampleLabel(job) : tools?.find(t => t.id === job.toolId)?.name ?? toolLike(job.toolId)?.name) ?? '', model: S.Model ? String(S.Model) : '', maker: mk ? { maker: mk.maker, makerName: mk.makerName } : null,
      ranOn: credit.ranOn, size: kind === 'audio' ? '' : size || (kind === 'video' ? String(inp.resolution ?? '') : ''), aspect: kind === 'audio' ? '' : String(S.Aspect ?? ''), seed: S.Seed ?? null,
      durationSec: kind !== 'image' ? dur : 0, fps: kind === 'video' && fps > 0 ? fps : 0, sampleRate: kind === 'audio' && sr > 0 ? sr : 0, format: kind === 'audio' ? ext : '',
      preset: S.Preset ? String(S.Preset) : '', quality: !local && S.Quality ? String(S.Quality) : '', madeBy: S['Made by'] ? String(S['Made by']) : '', workflow: feat?.workflow ?? null, sample: sample || isDemoJob(job), recovered,
      madeFrom: job.parentId ? <a className="rv-parent" data-testid="rv-made-from" href={`/jobs/${encodeURIComponent(job.parentId)}`} onClick={go(`/jobs/${job.parentId}`)}>{job.parentId}</a> : null,
    };
    const copyPrompt = () => navigator.clipboard?.writeText(pr).then(() => { toast('Prompt copied'); }, () => { toast('Couldn’t copy the prompt', 'error'); return false; });
    const natM = nat.match(/^(\d+)×(\d+)$/); const fitAr = ow > 0 && oh > 0 ? ow / oh : natM ? Number(natM[1]) / Number(natM[2]) : 0;
    /* Compare: the first input against the first output, once the image's shape is known (ViewerImage's split) */
    /* Several results (2026-10-25, shared/MultiResult): a filmstrip under the picture steps through them (← → and the stage arrows step results
       first, then the next job), with Grid; the workflow's presentation (shared/multiResultRules.ts) says how they look. Image to layers keeps its panel list. */
    const pres = presentationOf(job); const items = resultItems(job); const multi = pres.strip && items.length > 1 && !showingOriginal && !(job as any).deletedAt;
    const curItem = Math.max(0, items.findIndex(x => x.out === outIx)); const okIx = items.map((x, k) => x.state === 'done' && x.out != null ? k : -1).filter(k => k >= 0);
    const pickItem = (k: number) => { const o = items[k]?.out; if (o == null) return; setSel(o); setInView(null); setGrid(false); };
    const prevK = okIx.filter(k => k < curItem).pop(); const nextK = okIx.find(k => k > curItem);
    const stepPrev = multi && prevK != null ? () => pickItem(prevK) : onPrev; const stepNext = multi && nextK != null ? () => pickItem(nextK) : onNext;
    /* Compare: the source photo against this output once its shape is known (ViewerImage's split): the first output of an edit, any output of
       an edit batch, and your photo for workflows that make new pictures of it (Camera Angles, Character Sheet) */
    const ownSrc = typeof inp.imageUrl === 'string' && isFileUrl(inp.imageUrl) ? inp.imageUrl : null; const editSrc = outIx === 0 || multi ? compareSourceOf(job) : null;
    const cmpUrl = kind === 'image' && fitAr ? editSrc ?? (pres.compare ? ownSrc : null) : null; const cmpIx = cmpUrl ? refThumbs.indexOf(cmpUrl) : -1; const cmpYours = !!cmpUrl && !editSrc;
    const cmpGone = cmpIx >= 0 && badIn.has(cmpIx); const cmpSrc = cmpGone ? null : cmpUrl; const cmpOn = !!cmpSrc && cmp; const cmpWhy = cmpGone ? 'the input photo is no longer available' : '';
    /* Input → Output strip (IoStrip): the job's inputs, an arrow (Compare when the result is that photo changed), the result on screen now.
       Captions say Input / Output; a workflow slot name ("Face", "Target") or, for upscales, the sizes go on a smaller second line. */
    const upscale = job.toolId === 'image-upscale'; const srcSz = inp.sourceSize?.width && inp.sourceSize?.height ? `${inp.sourceSize.width}×${inp.sourceSize.height}` : '';
    const inCap = (x: JobInput, i: number): [string, string] => { if (inputs.length === 1) return ['Input', upscale ? srcSz : x.named && x.slot !== 'Photo' ? x.slot : ''];
      return x.named ? ['Input', x.slot] : [`Input ${i + 1}`, '']; };
    /* input prep: the bar fitted / cropped the photo before the run; the strip shows the photo as picked, badged (the run used the prepared one) */
    const prep: { kind?: string; aspect?: string; originalUrl?: string } | null = inp.imagePrep && typeof inp.imagePrep === 'object' && isFileUrl(inp.imagePrep.originalUrl) ? inp.imagePrep : null;
    const ioTiles: IoTile[] = inputs.map((x, i) => { const [a, b] = inCap(x, i); const t: IoTile = { url: x.url, kind: x.kind, a, b, label: b && !/×/.test(b) ? `${a} · ${b}` : a, mask: x.mask };
      if (!prep || x.url !== inp.imageUrl) return t; const w = prep.kind === 'crop' ? 'Cropped' : 'Fitted';
      return { ...t, url: prep.originalUrl!, badge: w, label: `${t.label} as picked (${w.toLowerCase()} to ${prep.aspect} for this model)` }; });
    const outThumb = lys ? layersPosterOf(job as any, lys) : kind === 'image' ? cur.url : kind === 'video' ? (o.posterUrl && o.posterUrl !== cur.url ? o.posterUrl : `/api/media/thumb?url=${encodeURIComponent(cur.url)}`)
      : [inp.coverUrl, o.posterUrl].find((u: any) => typeof u === 'string' && /\.(png|jpe?g|webp)($|\?)/i.test(u)) ?? null;
    const outOn = inView == null && !cmpOn;
    const strip = inputs.length > 0 && <IoStrip key={job.id} items={ioTiles} viewing={inView} onView={i => { setCmp(false); setInView(i); }} bad={badIn} onBad={i => setBadIn(s => s.has(i) ? s : new Set(s).add(i))}
      cmp={cmpWhy ? { mode: 'blocked', why: cmpWhy } : cmpSrc ? { mode: cmpOn ? 'on' : 'off', toggle: () => { setInView(null); setCmp(!cmpOn); } } : { mode: 'none' }}
      out={{ thumb: outThumb, b: upscale ? size : lys ? layerCountText(lys.length) : outs.length > 1 && !showingOriginal ? `${outIx + 1} of ${outs.length}` : '', on: outOn, onShow: () => { setInView(null); setCmp(false); } }} />;
    const info = <>{sampleNote}{demoNote}{extras}{children}
      {job.toolId === 'app-photos-to-reel' && <LineageStrip jobId={job.id} label="Steps" />}
      {lys && <LayerList jobId={job.id} layers={lys} view={lyView} onError={m => toast(m, 'error')} />}
      <ViewerPrompt text={pr} full={fullPr} onCopy={copyPrompt} extra={<>{strip}
        {(job as any).elements?.length > 0 && <div className="el-chips rv-els">{(job as any).elements.map((e: any) => <span key={e.id + e.start} className="el-chip" title={e.kind}>{e.url && <img src={e.url} alt="" />}<b>{e.mention ?? `@${e.name}`}</b></span>)}</div>}</>} />
      <ResultDetails job={job} info={details} extra={<RouteAttempts job={job} label={credit.ranOn} />} onViewWorkflow={wfOk ? () => setWf('get') : undefined} /></>;
    /* Edit: the existing hand-offs, with this result as the input (availability from GET /api/jobs/:id/prefill). */
    const editRow = (k: string, label: string, note: string, ic: React.ReactNode, url: string | null | undefined, why?: string) => url
      ? <a key={k} className="rvx-edit" href={url} onClick={go(url)} data-testid={`rvx-edit-${k}`}>{ic}<span><b>{label}</b><small>{note}</small></span><span className="rvx-chev" aria-hidden>›</span></a>
      : <span key={k} className="rvx-edit dis" aria-disabled="true" data-testid={`rvx-edit-${k}`}>{ic}<span><b>{label}</b><small>{why ?? 'Checking…'}</small></span></span>;
    const hr = (k: string) => { const r = rows0[k]; return r === undefined ? { url: null, why: 'Checking…' } : !r || r.available === false || !r.url ? { url: null, why: r?.reason ?? `Not available for this ${kind === 'video' ? 'clip' : 'image'}` } : { url: r.url, why: '' }; };
    const others = <ToolsPanel jobId={job.id} out={outIx} onClose={onClose} skip={kind === 'video' ? RM_SKIP_VIDEO : RM_SKIP_IMAGE} />;
    /* Video hand-offs by tool (fromJob=…): Extend and Upscale when this server has those tools. */
    const toolOf = (id: string) => tools?.find(t => t.id === id);
    const extT = kind === 'video' && live ? toolOf('h3-extend') : undefined; const upT = kind === 'video' && live ? toolOf('upscale') : undefined;
    const extendUrl = extT ? withExtendModel(sendUrl(job, extT, outIx), job) : null; /* an H3 clip opens on H3 Extend (Comfy Cloud first) */ const upUrl = upT ? sendUrl(job, upT, outIx) : null;
    const edit = kind === 'video'
      ? (() => { const up = hr('upscale'), rs = hr('reshoot'), tr = hr('translate'), cv = hr('change-voice'), fin = hr('finish');
        return <section className="rvx-sec" aria-label="Edit this clip"><p className="rvx-hint">Opens the tool with this clip already loaded. Nothing runs until you press Generate there.</p>
          {extT && editRow('extend', 'Extend', 'Keep the shot going from its last frame', <ExtendIcon size={18} />, extendUrl)}
          {editRow('upscale', 'Upscale', 'Sharper, bigger frames', <UpscaleIcon size={18} />, up.url, up.why)}
          {editRow('finish', 'Finish', 'One-click polish: grain, glow, light leak and more. Free', <FinishIcon size={18} />, fin.url, fin.why)}
          {editRow('reshoot', 'Re-shoot', 'The same scene from a new angle', <ReshootIcon size={18} />, rs.url, rs.why)}
          {editRow('translate', 'Translate', 'Dub the speech into another language', <TranslateIcon size={18} />, tr.url, tr.why)}
          {editRow('change-voice', 'Change voice', 'Swap the voice, keep the words', <ChangeVoiceIcon size={18} />, cv.url, cv.why)}
          {canSound && <button type="button" className="rvx-edit" onClick={() => setAddSound(true)} data-testid="rvx-edit-add-sound"><SoundIcon size={18} /><span><b>Add sound</b><small>One click: music and sound effects timed to the clip</small></span><span className="rvx-chev" aria-hidden>›</span></button>}
          {job.toolId !== 'soundtrack' && editRow('soundtrack', 'Add soundtrack', 'Music that fits the clip', <MusicBedIcon size={18} />, `/tools/soundtrack?from=${encodeURIComponent(job.id)}&out=${outIx}`)}
          {others}</section>; })()
      : (() => { const rl = hr('relight'), up = hr('upscale');
        return <section className="rvx-sec" aria-label="Edit this image"><p className="rvx-hint">Opens the tool with this image already loaded. Nothing runs until you press Generate there.</p>
          {editRow('prompt', 'Edit with a prompt', 'Describe the change in Create Image', <PencilIcon size={18} />, canHand ? `${IMAGE_PAGE}?${qs}` : null, 'Not for this result')}
          {editRow('inpaint', 'Inpaint', 'Paint over an area and redo just that part', <BrushIcon size={18} />, canHand ? `/tools/app-inpaint?${qs}` : null, 'Not for this result')}
          {editRow('relight', 'Relight', 'Change the light, keep the subject', <LightIcon size={18} />, rl.url, rl.why)}
          {editRow('upscale', 'Upscale', 'More pixels, sharper detail', <UpscaleIcon size={18} />, up.url, up.why)}
          {editRow('to-3d', 'Send to 3D', 'Turn this picture into a 3D model', <CubeIcon size={18} />, canHand ? sendTo3dHref(job.id, outIx) : null, 'Not for this result')}
          {canHand && others}</section>; })();
    const setTab = (t: string) => { setVTab(t); if (t === 'edit') loadRows(); };
    const vTabs = (canHand || (live && kind === 'video')) && owner ? [{ id: 'info', label: 'Info' }, { id: 'edit', label: 'Edit' }] : [{ id: 'info', label: 'Info' }];
    const tabNow = vTabs.some(t => t.id === vTab) ? vTab : 'info';
    const poster = kind === 'video' ? (o.posterUrl && o.posterUrl !== cur.url ? o.posterUrl : `/api/media/thumb?url=${encodeURIComponent(cur.url)}`) : '';
    const cover = kind === 'audio' ? [inp.coverUrl, inp.imageUrl, o.posterUrl].find((u: any) => typeof u === 'string' && /\.(png|jpe?g|webp)($|\?)/i.test(u)) ?? null : null;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* PB-18: the media scales to fit the stage (small items grow too); the shape comes from the output size, else the loaded file. */
    const inX = inView != null ? ioTiles[inView] ?? null : null; const inUrl = inX && !badIn.has(inView!) ? inX.url : null;
    const vMedia = inX && inUrl ? <><div className="rvx-inbar" data-testid="rvx-input-bar"><b>{inX.label}</b><small>{inX.mask ? 'Input · the painted area is marked on its tile' : 'Input'}</small>
        {inX.kind === 'image' && <a className="rvx-inbtn" href={inputRefHref(inUrl)} onClick={go(inputRefHref(inUrl))} data-testid="rvx-input-ref" {...tip('Use this photo in Create Image')}><RefGlyph />Use as reference</a>}
        <button type="button" className="rvx-inbtn" onClick={() => setInView(null)} data-testid="rvx-input-back" {...tip('Back to the result (Esc)')}>Back to result</button></div>
      {inX.kind === 'video' ? <ViewerVideo key={inUrl} src={inUrl} poster={`/api/media/thumb?url=${encodeURIComponent(inUrl)}`} autoPlay={false} label={`${inX.label}: input clip`} />
        : inX.kind === 'audio' ? <ViewerAudio key={inUrl} src={inUrl} cover={null} label={`${inX.label}: input audio`} />
        : <ViewerImage key={inUrl} className="rvx-img" src={inUrl} before={null} alt={inX.label} />}</>
      : <>{tabs && !lys && !multi && <div className="rvx-outs">{tabs}</div>}{showingOriginal ? <div className="rvx-media">{media}</div>
      : kind === 'image' && lys ? <LayerCanvas layers={lys} view={lyView} ar={fitAr || undefined} label={pr ? `Layers: ${pr.slice(0, 120)}` : 'Layers'} />
      : kind === 'image' ? <ViewerImage key={cur.url} className={`rvx-img${fitAr ? ' rvx-fit' : ''}${(job as any).input?.transparent ? ' alpha-bg' : ''}` /* Remove Background: a transparent PNG over a checkerboard */} style={fitAr ? { ['--ar' as any]: fitAr } : undefined} src={cur.url} alt={pr ? `Result: ${pr.slice(0, 140)}` : cur.label || 'Result'}
          before={cmpSrc} compareWhy={cmpWhy} compare={cmpOn} onCompare={setCmp} compareName={cmpYours ? 'your photo' : undefined} afterLabel={job.toolId === 'image-upscale' ? `Upscaled${nat ? ` ${nat}` : ''}` : multi && cur.label ? cur.label : 'Result'} beforeLabel={job.toolId === 'image-upscale' && inp.sourceSize?.width ? `Original ${inp.sourceSize.width}×${inp.sourceSize.height}` : cmpYours ? 'Your photo' : 'Original'}
          onLoad={e => { const im = e.currentTarget; if (im.naturalWidth) setNat(`${im.naturalWidth}×${im.naturalHeight}`); }} />
      : kind === 'video' && typeof inp.compareUrl === 'string' && inp.compareUrl !== cur.url && !mBad && !cont ? <div className="rvx-media rvx-cmp" data-testid="rvx-video-compare"><CompareSlider key={cur.url} before={inp.compareUrl} after={cur.url} watermark={false} aspect={ar} /></div> /* a clip edit with a same-size source (Footage Effects): before / after slider */
      : kind === 'video' ? <ViewerVideo key={cur.url} src={cur.url} poster={poster} alpha={alphaOut} autoPlay={!reduced} ar={fitAr || undefined} seam={seam} captions={ccOk ? { vtt: cc.vtt, on: cc.on, lang: cc.language } : null}
          label={pr ? `Video: ${pr.slice(0, 120)}` : 'Video result'} width={ow > 0 ? ow : undefined} height={oh > 0 ? oh : undefined}
          onMeta={v => { setMBad(false); vidEl.current = v; if (v.videoWidth) setNat(`${v.videoWidth}×${v.videoHeight}`); if (isFinite(v.duration)) setMDur(v.duration); }} onError={() => { vidEl.current = null; setMBad(true); }} />
      : <ViewerAudio key={cur.url} src={cur.url} cover={cover} label={pr ? `Audio: ${pr.slice(0, 120)}` : 'Audio result'} onMeta={setMDur} seed={job.id} prompt={pr} lyrics={typeof (job.input as any)?.lyrics === 'string' ? (job.input as any).lyrics : null} kind={audioKindOfJob(job)} jobId={job.id} danceStyle={(job as any).danceStyle} cues={ccOk && cc.on ? cc.cues : null} />}</>;
    const recreateA = (primary: boolean) => recreate && <a key="rc" className={primary ? 'rvx-primary' : 'rvx-second'} href={recreate} onClick={go(recreate)} data-action="recreate" data-testid="rv-recreate" {...tip(`Same settings back in the composer, with a new seed${!primary && rcCost ? ` · ${rcCost}` : ''}`)}><RecreateGlyph />Recreate{!primary && rcCost && <span className="rv-cost" data-testid="rv-recreate-cost">{rcCost}</span>}</a>;
    /* The primary fits the medium: image → Turn to video; video → Recreate (D6), with Extend and Upscale beside it (a sample with no Recreate leads with Extend,
       else Upscale); audio → none (Recreate leads the row). */
    /* frame actions: a finished video of yours that is on this computer */
    const frameOk = kind === 'video' && live && owner && !mBad && /^\/(files|samples)\//.test(cur.url);
    const playerTime = () => { const el = vidEl.current; return el && isFinite(el.currentTime) ? el.currentTime : 0; };
    const saveFrame = async () => { const t = playerTime(); try { const r = await saveVideoFrame({ jobId: job.id, out: outIx, at: t > 0 ? t : 'first' }); toast(`Frame saved to your uploads${r.item.width ? ` (${r.item.width}×${r.item.height})` : ''}`); } catch (e: any) { toast(`Couldn’t save that frame (${e?.message ?? 'error'}).`, 'error'); } };
    const vidLead = kind === 'video' && !recreate ? (extendUrl ? 'extend' : upUrl ? 'upscale' : '') : '';
    const extA = (primary: boolean) => extendUrl && <a key="ext" className={primary ? 'rvx-primary' : 'rvx-second'} href={extendUrl} onClick={go(extendUrl)} data-action="extend" data-testid="rv-extend" {...tip('Keep the shot going from its last frame')}><ExtendIcon size={16} />Extend</a>;
    const upA = (primary: boolean) => upUrl && <a key="up" className={primary ? 'rvx-primary' : 'rvx-second'} href={upUrl} onClick={go(upUrl)} data-action="upscale" data-testid={primary ? 'rv-upscale-primary' : 'rv-upscale'}><UpscaleIcon size={16} />Upscale</a>;
    const primary = trashed ? null : kind === 'image' ? (toVideo ? <a className="rvx-primary" href={toVideo} onClick={go(toVideo)} data-action="turn-to-video" data-testid="rv-turn-to-video"><VideoGlyph />Turn to video</a> : recreateA(true))
      : kind === 'video' ? (vidLead === 'extend' ? extA(true) : vidLead === 'upscale' ? upA(true) : recreateA(true)) : null;
    const usedRecreate = !!primary && (kind === 'image' ? !toVideo : kind === 'video' ? !vidLead : false);
    /* Layout B footer. Row 1: the primary next step + Recreate beside it (Recreate alone when it is the next step).
       Row 2: up to five equal icon tiles (Edit, Reference / Extend / Upscale, Save, Share, More); hand-offs that don't fit go to the top of More. */
    type Tile = { k: string; label: string; icon: React.ReactNode; testid: string; tip: string; href?: string; download?: string; onClick?: (e: React.MouseEvent) => void; /** its own element (the Captions menu) */ node?: React.ReactNode };
    const handoffs: Tile[] = [
      vTabs.some(t => t.id === 'edit') ? { k: 'edit', label: 'Edit', icon: <PencilIcon size={18} />, testid: 'rvx-tile-edit', tip: kind === 'video' ? 'Edit this clip' : 'Edit this image', onClick: () => setTab('edit') } : null,
      refUrl ? { k: 'ref', label: 'Reference', icon: <RefGlyph />, testid: 'rv-use-ref', tip: referenceTip ?? 'Add it to Create Image as a reference image', href: refUrl, onClick: onReference ? (e: React.MouseEvent) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onClose?.(); onReference(cur.url, outIx); } : go(refUrl) } : null,
      kind === 'video' && vidLead !== 'extend' && extendUrl ? { k: 'ext', label: 'Extend', icon: <ExtendIcon size={18} />, testid: 'rv-extend', tip: 'Keep the shot going from its last frame', href: extendUrl, onClick: go(extendUrl) } : null,
      canSound ? { k: 'sound', label: 'Sound', icon: <SoundIcon size={18} />, testid: 'rv-add-sound', tip: 'Add sound: music and effects timed to the clip, free on your computer', onClick: (e: React.MouseEvent) => { e.preventDefault(); setAddSound(true); } } : null,
      /* an audio result (speech, a song) → Video's Lip Sync with it as the Speech (free on LTX-2.5 locally, photo optional) */
      kind === 'audio' && live && owner ? { k: 'talk', label: 'Make it talk', icon: <UserIcon size={18} />, testid: 'rv-make-it-talk', tip: 'Make a photo talk or sing with this sound (Lip Sync)', href: lipSyncHandoffHref(job.id, outIx), onClick: go(lipSyncHandoffHref(job.id, outIx)) } : null,
      /* a frame of this clip (2026-10-26): the frame on screen as Video → Generate's start image, or saved as an image (Continue sits in row 1) */
      ...(frameOk ? [{ k: 'useframe', label: 'Use frame', icon: <FrameGrabIcon size={18} />, testid: 'rv-use-frame', tip: 'Use this frame: the frame on screen as the start image (Video → Generate)', href: frameHandoffHref(job.id, outIx, 0, true), onClick: (e: React.MouseEvent) => go(frameHandoffHref(job.id, outIx, playerTime(), true))(e) },
        { k: 'saveframe', label: 'Save frame', icon: <ImageIcon size={18} />, testid: 'rv-save-frame', tip: 'Save frame as image: the frame on screen, full size, in your uploads', onClick: () => void saveFrame() }] : []),
      kind === 'video' && vidLead !== 'upscale' && upUrl ? { k: 'up', label: 'Upscale', icon: <UpscaleIcon size={18} />, testid: 'rv-upscale', tip: 'Sharper, bigger frames', href: upUrl, onClick: go(upUrl) } : null,
    ].filter(Boolean) as Tile[];
    const core: Tile[] = [
      { k: 'save', label: 'Save', icon: <DownloadIcon size={18} />, testid: 'rv-download', tip: storyShots && !showingOriginal ? 'Download film' : stamping ? 'Download with your logo' : 'Download', href: cleanHref(cur.url), download: appFileName(`${job.id}-${cur.label}`, ext), ...(stamping ? { onClick: (e: React.MouseEvent) => void saveStamped(e) } : {}) },
      ...(shareBtn ? [{ k: 'share', label: 'Share', icon: <ShareGlyph />, testid: 'rv-share', tip: stamping ? 'Share with your logo' : 'Share', onClick: () => void openShare() }] : []),
      ...(ccOk && cc.state !== 'nomedia' ? [{ k: 'cc', label: 'Captions', icon: null, testid: 'rv-captions', tip: 'Captions', node: <CaptionsTile key="cc" cc={cc} jobId={job.id} out={outIx} kind={kind as 'video' | 'audio'} src={cur.url} /> }] : []),
    ];
    const room = Math.max(0, 4 - core.length); const shown = handoffs.slice(0, room), overflow = handoffs.slice(room);
    const tileEl = (t: Tile) => t.node ? t.node : t.href ? <a key={t.k} className="rvx-tile" href={t.href} download={t.download} onClick={t.onClick} data-testid={t.testid} aria-label={t.tip} {...tip(t.tip)}>{t.icon}<span>{t.label}</span></a>
      : <button key={t.k} type="button" className="rvx-tile" onClick={t.onClick} data-testid={t.testid} aria-label={t.tip} {...tip(t.tip)}>{t.icon}<span>{t.label}</span></button>;
    const moreTile = sample ? <button type="button" className="rvx-tile" data-testid="rv-copy-link" aria-label="Copy link" {...tip(copied === 'link' ? null : 'Copy link')} onClick={copyLink}><span aria-hidden className="rvx-tile-glyph">⧉</span><span>{copied === 'link' ? 'Copied' : 'Link'}</span></button>
      : moreOf(true, overflow.map(t => ({ k: t.k, label: t.label, icon: t.icon, hint: t.tip, href: t.href, download: t.download, onClick: t.onClick, testid: t.testid })), menuTop);
    /* Continue from last frame: the exact last frame into Video → Generate's start image, the prompt as "Continue the shot: …" (beside the primary) */
    const contHref = frameOk ? frameHandoffHref(job.id, outIx, 'last') : null;
    const contA = contHref && <a key="cont" className="rvx-second" href={contHref} onClick={go(contHref)} data-action="continue-frame" data-testid="rv-continue-frame" {...tip('Continue from last frame: a new clip that starts where this one ends (Video → Generate)')}><LastFrameIcon size={16} />Continue</a>;
    const row1 = [primary, !usedRecreate && recreateA(false), contA].filter(Boolean).slice(0, 2);
    const footer = trashed ? <TrashActions job={job} onGone={onGone ?? onClose ?? (() => 0)} /> : <>
      {row1.length > 0 && <div className="rvx-row1">{row1}</div>}
      <div className="rvx-tiles" data-testid="rvx-tiles">{[...shown, ...core].map(tileEl)}{moreTile}</div><GroupStatus job={job} /></>;
    const bg = kind === 'image' ? cur.url : kind === 'video' ? poster : cover ?? undefined;
    /* the filmstrip's toolbar, outside the picture: Download this · Download all · Grid · Use as input (the panel's Reference, same handler) */
    const refT = handoffs.find(t => t.k === 'ref');
    const dock = multi && !(inX && inUrl) ? <div className="mr-dock" data-testid="mr-dock"><ResultStrip items={items} pres={pres} current={curItem} onPick={pickItem} actions={<>
        <a className="mr-btn mr-one" href={cleanHref(cur.url)} download={appFileName(`${job.id}-${cur.label}`, ext)} data-testid="mr-dl-one" aria-label={`Download ${cur.label || 'this one'}`} {...tip('Download this one')}><DownloadIcon size={15} /><span>Download</span></a>
        {job.id && !sample && <a className="mr-btn mr-all" href={`/api/jobs/${encodeURIComponent(job.id)}/download.zip`} download data-testid="mr-dl-all" aria-label={`Download all ${items.filter(x => x.state === 'done').length} as a ZIP`} {...tip('Every result in one ZIP, plus a settings file')}><DownloadIcon size={15} /><span>All (ZIP)</span></a>}
        <button type="button" className={`mr-btn${grid ? ' on' : ''}`} aria-pressed={grid} onClick={() => setGrid(g => !g)} data-testid="mr-grid-toggle" aria-label="Grid view" {...tip(grid ? 'Back to one at a time' : 'See them all as a grid')}><GridIcon size={15} /><span>Grid</span></button>
        {refT && <a className="mr-btn mr-use" href={refT.href} onClick={refT.onClick} data-testid="mr-use" aria-label="Use as input" {...tip(refT.tip)}><RefGlyph /><span>Use as input</span></a>}
      </>} /></div> : null;
    const stageMedia = stage && !(inX && inUrl) && !showingOriginal ? <div className="rvx-media rvx-stage-own">{stage}</div>
      : multi && grid ? <ResultGrid items={items} pres={pres} current={curItem} onPick={pickItem} name={`${job.id}-grid`} onError={m => toast(m, 'error')} onSaved={() => toast('Grid saved as one image')} /> : vMedia;
    /* Add logo and text: the stage layer (pill, the logo you drag, its toolbar and More card) */
    const stamp = stampOk && stampKind && !(inX && inUrl) && !(multi && grid) && !mBad && !stage ? <LogoStampLayer key={`${job.id}:${outIx}`} kind={stampKind} /> : null;
    return <ViewerShell label={pr ? `Result: ${pr.slice(0, 80)}` : title} bg={bg} media={<>{stageMedia}{dock}{stamp}</>}
      who={owner && !sample && !(job as any).example ? { name: 'You', role: 'Author', self: true } : authorOf(job, sample)}
      badge={trashed ? <TrashChip /> : sampleChip ? <span className="rvx-badges">{sampleChip}</span> : null} headActions={trashed ? null : fav}
      tabs={vTabs} tab={tabNow} setTab={setTab} body={tabNow === 'edit' ? edit : info} footer={footer} onClose={onClose ?? (() => 0)} onPrev={stepPrev} onNext={stepNext} pos={pos} fullscreen={kind !== 'audio'} itemKey={`${job.id}:${outIx}`}>{shareDlg}{wfDlg}{soundDlg}</ViewerShell>;
  }
  return (
    <section className={`card result${reserve ? ' rv-reserve' : ''}`}>
      <div className="result-head"><h2>{title}</h2>{aiBadge}{sampleChip}<ResultCredit job={job} credit={credit} />{sampleNote}{demoNote}{storyShots ? (inp.story?.audio !== false && kind === 'video' && <span className="chip ok rv-sound"><SoundIcon size={14} />Sound on</span>) : audio && kind === 'video' && <span className="chip ok">Original audio preserved</span>}</div>
      {job.id && <LineageStrip jobId={job.id} reserve={!!job.parentId} />}
      {extras}{tabs}{media}{children}
      <div className="actions rv-card-acts">{meta}{acts}{extraActions && <div className="rv-extra row">{extraActions}</div>}</div>
      {notes}{shareDlg}{wfDlg}{soundDlg}
    </section>
  );
}
const ShareGlyph = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 5l6 6-6 6" /><path d="M20 11H10a6 6 0 0 0-6 6v2" /></svg>;

/** Share sheet v2 (shared/ShareSheet.tsx): the one Share UI, also used by History. Kept under its old name for callers. */
export const ShareDialog = ShareSheet;

/** job.model (display name) and attribution from /api/licenses. Licence details stay on /licenses. */
let licCache: Promise<Record<string, string>> | null = null;
let licIdCache: Promise<Record<string, string>> | null = null; /* B20: providerId → licenseId, for the 'Powered by' link */
/** Stands in for the result card while a job runs, in the same shape (head, view tabs, media at the clip's aspect ratio), so the page doesn't jump when the result arrives. */
export function ResultPlaceholder({ title, width, height, compare = true, tabs, lineage, audioChip = true }: { title: string; width?: number; height?: number; compare?: boolean; tabs?: string[]; lineage?: boolean; audioChip?: boolean }) {
  const ar = width && height ? `${width} / ${height}` : '16 / 9';
  return <section className="card result rv-reserve rv-ph" aria-busy="true" aria-label="Result on its way" data-testid="result-placeholder">
    <div className="result-head"><h2 data-title={title}>Your result is on its way</h2><span className="rv-credit rv-ph-credit" aria-hidden><b className="rv-powered">&nbsp;</b><small className="rv-via">&nbsp;</small></span>{audioChip && <span className="chip ok rv-ph-hide" aria-hidden>Original audio preserved</span>}</div>
    {lineage && <nav className="lineage lineage-ph" aria-hidden><span className="ln-label helper">History</span><div className="ln-row" /></nav>}
    {tabs && <div className="seg mb-12 rv-tabs rv-ph-seg" aria-hidden>{tabs.map((t, i) => <button key={t} type="button" className={i === 1 ? 'on' : ''} disabled>{t}</button>)}</div>}
    {compare && <div><div className="seg rv-ph-seg" aria-hidden style={{ marginBottom: 12 }}><button type="button" disabled>Side by side</button><button type="button" className="on" disabled>Slider</button><button type="button" disabled>After only</button></div></div>}
    {compare ? <div className="compare"><div className="rv-ph-media shimmer" style={{ aspectRatio: ar }} /></div>
      : <video className="preview rv-ph-video" aria-hidden muted playsInline style={{ aspectRatio: ar }} />}
    <p className="helper rv-ph-note">Your result will appear here.</p>
  </section>;
}
type Credit = { model: string; powered: string; via: string; ranOn: string; cost: string };
export { cleanModelName, ranOnOf } from './models';
/** "Powered by <model>" (licence credit) plus "Ran on <place> · <what it cost>". The place never replaces the model name. */
export function creditOf(job: any, modelName: string, routeLabel: string, localWhere = ''): Credit {
  const at = job?.attribution; const req = typeof at?.requiredText === 'string' ? at.requiredText.trim() : '';
  // The server's own name for what ran (job or output modelName, e.g. "LTX-2 19B" for an LTX preset on a shared provider) beats the catalog card name.
  const out0 = Array.isArray(job?.outputs) ? job.outputs.find((o: any) => typeof o?.modelName === 'string' && o.modelName.trim()) : null;
  const served = String(job?.modelName ?? out0?.modelName ?? '').trim();
  /* BH10 P1-4: credit only what the server says ran (modelName, else job.model, the name of the route that ran). Never the requested provider's catalog card
     (a Remove BG request that ran on fal Bria is not BiRefNet). A generic name ("Open weights", "Auto") credits nothing. `modelName` arg kept for callers, unused. */
  void modelName; void routeLabel;
  const ran = String(job?.model ?? '').split(' · ')[0].replace(/\s*\((?:fal|replicate|local[^)]*|[^)]*licen[cs]e[^)]*|BSD[^)]*|Apache[^)]*|MIT)\)\s*$/i, '').trim();
  const generic = (n: string) => /^(open weights|auto|default)\b/i.test(n);
  const up = job?.toolId === 'image-upscale' && job?.provider ? modelNameOf(String(job.provider), 'upscale') : null; // Upscale: the model that ran, not the tool's list of models
  const raw = up || (served && !generic(served) ? served : '') || (ran && !generic(ran) ? ran : '');
  const model = req || cleanModelName(job, raw);
  const atText = typeof at?.text === 'string' ? at.text.trim() : '';
  const powered = atText && (!model || atText.includes(model)) ? atText : model ? `Powered by ${model}` : atText;
  const loc = /^local:/.test(String(job?.route ?? '')) || job?.runOn === 'local';
  const where = ranOnOf(job, localWhere);
  const cost = typeof job?.cost === 'number' ? job.cost : null; const refunded = heldBack(job);
  const price = isDemoJob(job) ? '' /* the Sample chip and 'Sample output, nothing billed.' say it once */
    : compositeCostText(job) != null ? compositeCostText(job)!
    : cost == null ? (loc ? 'Free' : '')
    : cost === 0 ? (loc ? LOCAL_FREE : 'Free')
    /* own accounts (QA #7): never ✦; app-balance refunds don't exist there (the failure line says what the provider bills) */
    : ownAccountsNow() ? (refunded >= cost ? '' : `${(refunded === 0 ? jobCostAmount(job) : null) ?? jobCostText(cost - refunded, job?.runOn ?? (/^comfy-(router|cloud):/.test(String(job?.route ?? '')) ? 'comfy-cloud' : null))} · billed to your ${where.replace(/\s*(\(.*\)|·.*)$/, '')} account`)
    : refunded >= cost ? `${ledgerUsd(cost)} returned to balance` : refunded ? `${ledgerUsd(cost - refunded)} (${ledgerUsd(refunded)} returned to balance)` : ledgerUsd(cost);
  const via = [where && `ran on ${where.replace(/\s*·.*$/, '')}`, price].filter(Boolean).join(' · ');
  return { model, powered, via, ranOn: where, cost: price };
}
export function ResultCredit({ job, credit }: { job: any; credit: Credit }) {
  const [lic, setLic] = useState<Record<string, string>>({}); const [lid, setLid] = useState<Record<string, string>>({});
  useEffect(() => { licCache ??= fetch('/api/licenses').then(r => r.json()).then(d => Object.fromEntries((d.models ?? []).filter((m: any) => m.attribution).map((m: any) => [m.providerId, m.attribution]))).catch(() => ({})); licCache.then(setLic); licIdCache ??= fetch('/api/licenses').then(r => r.json()).then(d => Object.fromEntries((d.models ?? []).filter((m: any) => m.licenseId).map((m: any) => [m.providerId, m.licenseId]))).catch(() => ({})); licIdCache.then(setLid); }, []);
  // Jobs without their own attribution fall back to the licence list's credit line.
  /* P1-4: the licence line names the requested provider, so use it only when that provider's own local route ran (not a hosted fallback, not a shared workflow). */
  const own = job?.provider && String(job?.route ?? '') === `local:${job.provider}` && job.provider !== 'comfy-open';
  const extra = !job?.attribution && own ? lic[job.provider] : undefined;
  const powered = credit.model || credit.powered || (typeof extra === 'string' ? extra : '');
  /* B20 (P3): link 'Powered by' to its licence row like the share page: the job's own licenseId, else the provider's row when its own local route ran */
  const licId: string | undefined = job?.attribution?.licenseId || (own ? lid[job.provider] : undefined);
  if (!powered && !credit.via) return null;
  return <span className="rv-credit" data-testid="result-credit">{powered && (licId ? <a className="rv-powered rv-powered-link" data-testid="rv-powered" href={`/licenses#${encodeURIComponent(licId)}`} title={`Model licence${credit.powered && credit.powered !== powered ? `: ${credit.powered}` : ''}`}>{powered}</a> : <b className="rv-powered" data-testid="rv-powered">{powered}</b>)}{credit.via && <small className="rv-via" data-testid="rv-via">{powered ? ` · ${credit.via}` : credit.via.replace(/^ran/, 'Ran')}</small>}</span>;
}

/** Favourite (icon), Add to project and Trash (⋯ menu items) on the result itself (same endpoints as Assets). */
function FavButton({ job }: { job: any }) {
  /* One shared favourite store (shared/favourites.ts): optimistic, saved once per click, rolled back with a short message on failure, and the
   * same value in every heart, list and tab (the old local useState lost it when the viewer reopened from the feed's cached job). */
  const toast = useToast(); const { on: fav, toggle, label } = useFavourite(job, toast);
  return <button type="button" className={`btn rv-ic rv-fav ${fav ? 'on' : ''}`} aria-pressed={fav} aria-label={label} {...tip(fav ? 'Favourite' : 'Add to Favourites')} data-testid="rv-fav" onClick={toggle}><HeartIcon size={17} /></button>;
}
/** Feature this (2026-10-26): star your result so it shows on an empty tab and under the feed's Featured chip (POST /api/jobs/:id/feature). */
function FeatureItem({ job }: { job: any }) {
  const toast = useToast(); const [on, setOn] = useState(!!job.featured);
  const toggle = () => { const next = !on; setOn(next); setFeatured(job.id, next).then(() => toast(next ? 'Featured: it shows under Featured and on an empty tab' : 'Removed from Featured')).catch(e => { setOn(!next); toast(`Couldn’t update Featured: ${e.message}`, 'error'); }); };
  return <MenuRow it={{ k: 'feat', label: on ? 'Featured' : 'Feature', icon: <StarIcon size={16} />, testid: 'rv-feature', pressed: on, keepOpen: true, trail: on ? <span className="rm-check">✓</span> : undefined, hint: on ? 'Shows under Featured and on an empty tab. Click to remove.' : 'Show it under Featured and on an empty tab', onClick: toggle }} />;
}
/** PB-17: "Copy image" puts the picture itself on the clipboard (as PNG, the type browsers accept; other formats are redrawn first). */
async function copyImage(url: string) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('no clipboard');
  const png = (async () => { const b = await fetch(url).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); }); if (b.type === 'image/png') return b;
    const bm = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d')!.drawImage(bm, 0, 0);
    return new Promise<Blob>((ok, no) => c.toBlob(x => x ? ok(x) : no(new Error('encode')), 'image/png')); })();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); /* the promise form keeps Safari's user-gesture window */
}
/** PB-17: Move to › a submenu of projects (✓ on the current one), Remove from project, New project…. */
function MoveToItem({ job }: { job: any }) {
  const toast = useToast(); const [projects, setProjects] = useState<Project[] | null>(null); const [proj, setProj] = useState<string>(job.projectId ?? '');
  useEffect(() => { setProj(job.projectId ?? ''); }, [job.id, job.projectId]);
  const load = () => { if (!projects) listProjects().then(setProjects).catch(() => setProjects([])); };
  const pick = async (v: string) => { try { let id = v; let name = projects?.find(p => p.id === id)?.name;
    if (v === '__new') { const n = await askText({ title: 'New project', label: 'Project name', placeholder: 'e.g. Spring campaign', confirm: 'Create' }); if (!n) return; const np = await createProject(n); id = np.id; name = np.name; setProjects(await listProjects()); }
    await setJobProject(job.id, id || null); setProj(id); window.dispatchEvent(new Event('ohf:jobs-changed')); toast(id ? `Moved to ${name ?? 'project'}` : 'Removed from project'); } catch (e: any) { toast(e.message, 'error'); } };
  return <details className="am-sub2" data-testid="rv-move-to" onToggle={e => { if (e.currentTarget.open) load(); }}><summary className="am-item">Move to<span aria-hidden>›</span></summary><div className="am-sub2-menu" role="menu">
    {!projects ? <span className="am-item am-dis" aria-disabled="true">Loading…</span> : projects.map(p => <button key={p.id} type="button" className="am-item" role="menuitemradio" aria-checked={p.id === proj} data-testid="rv-move-project" onClick={() => p.id !== proj && pick(p.id)}>{p.name}{p.id === proj && <span aria-hidden>✓</span>}</button>)}
    {proj && <button type="button" className="am-item" role="menuitem" data-testid="rv-move-none" onClick={() => pick('')}>Remove from project</button>}
    <button type="button" className="am-item" role="menuitem" data-testid="rv-move-new" onClick={() => pick('__new')}>New project…</button>
  </div></details>;
}
function TrashItem({ job, onDone }: { job: any; onDone?: () => void }) {
  const toast = useToast(); const [confirm, setConfirm] = useState(false);
  const trash = () => trashJob(job.id).then(() => { toast('Moved to Trash. Restore it from Assets → Trash.'); if (onDone) { window.dispatchEvent(new Event('ohf:jobs-changed')); onDone(); } else navigate('/assets?section=trash'); }).catch(e => toast(e.message, 'error'));
  return confirm ? <span className="am-item rv-trash-confirm" role="alertdialog" aria-label="Move to trash"><span>Move to Trash?</span><button type="button" className="btn btn-sm danger" data-testid="rv-trash-yes" onClick={trash}>Move</button><button type="button" className="btn btn-sm" onClick={() => setConfirm(false)}>Keep</button></span>
    : <button type="button" className="am-item danger rv-trash" data-testid="rv-trash" onClick={() => setConfirm(true)}>Move to Trash</button>;
}

/** @image1 / @Video 1 / @audio1 as the shared chips, other @names and #moves tinted (shared/MentionChips.tsx). */
const withMentions = (t: string) => <MentionText text={t} others />;

/** The Edit tab's "Use it in…" list skips the hand-offs it already shows as their own rows. */
const RM_SKIP_IMAGE = new Set(['image-upscale', 'app-relight', 'three-d', 'app-inpaint', 'cinema']);
const RM_SKIP_VIDEO = new Set(['upscale', 'h3-extend', 'finish', 'reshoot', 'app-translate-video', 'app-change-voice', 'soundtrack', 'cinema']);
